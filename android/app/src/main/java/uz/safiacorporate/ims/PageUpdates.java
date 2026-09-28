package uz.safiacorporate.ims;

import android.content.Context;
import android.net.Uri;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Keeps the app on the pages production serves (CLAUDE.md «The Android app»).
 *
 * The site is deployed many times a day and the app carries its pages inside,
 * so the app fetches every new build itself. While it is on screen it asks the
 * site which build is live (/build.json — shortly after it opens, on every
 * return to it and every five minutes, the site's own poll interval). When the
 * answer is a build the phone does not hold, it reads that build's file list
 * (/build-files.json, written by the Vite build with every file's SHA-256),
 * downloads only the files it does not already have, and checks each one
 * against the list. Only a build whose every file arrived and matched is handed
 * to WebBundle: the next start opens it, and the site's own update prompt
 * offers the reload that switches to it now. Anything less leaves the pages as
 * they were.
 *
 * Nothing is installed and the person is asked nothing: it is data the app
 * downloads from the site's own address over the same HTTPS, as a browser
 * does. A new APK is needed only when the app's own Android code changes.
 */
final class PageUpdates {
    private static final String TAG = "SafiaPages";
    private static final String ORIGIN = MainActivity.ORIGIN;
    /** The site's own build.json poll (hooks/useAppUpdate.js). */
    private static final long EVERY_MS = 5 * 60_000L;
    /** A glance away and back is not a reason to ask again. */
    private static final long MIN_GAP_MS = 60_000L;
    /** The first page and its data go first. */
    private static final long START_DELAY_MS = 3_000L;
    private static final long RETRY_MS = 30_000L;
    /** Failed attempts at ONE build before the admins are told (a deploy mid-download is not one). */
    private static final int REPORT_AFTER = 3;
    private static final int MAX_FILES = 5_000;
    private static final long MAX_FILE = 50L << 20;
    private static final long MAX_DOWNLOAD = 300L << 20;
    private static final int MAX_JSON = 4 << 20;

    private static volatile PageUpdates instance;

    private final Context app;
    private final String userAgent;
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "safia-pages");
        t.setDaemon(true);
        return t;
    });
    private final AtomicBoolean queued = new AtomicBoolean();
    private volatile long lastRun;
    private volatile Runnable onReady;
    private ScheduledFuture<?> periodic;
    // The worker thread's own.
    private String failing = "";
    private int failures;

    static PageUpdates get(Context context) {
        PageUpdates u = instance;
        if (u != null) return u;
        synchronized (PageUpdates.class) {
            if (instance == null) instance = new PageUpdates(context.getApplicationContext());
            return instance;
        }
    }

    private PageUpdates(Context app) {
        this.app = app;
        String v;
        try {
            v = app.getPackageManager().getPackageInfo(app.getPackageName(), 0).versionName;
        } catch (Exception e) {
            v = "?";
        }
        userAgent = "SafiaIMS-Android/" + v;
    }

    /** Called on the worker thread when a newly deployed build is whole on the phone. */
    void setOnReady(Runnable r) {
        onReady = r;
    }

    void clearOnReady(Runnable r) {
        if (onReady == r) onReady = null;
    }

    /** The app is on screen: a check shortly, then every five minutes until pause(). */
    synchronized void resume() {
        check(START_DELAY_MS, false);
        if (periodic == null) {
            periodic = worker.scheduleWithFixedDelay(this::runSafely, EVERY_MS, EVERY_MS, TimeUnit.MILLISECONDS);
        }
    }

    /** Off screen: no new checks (a download already running finishes). */
    synchronized void pause() {
        if (periodic != null) {
            periodic.cancel(false);
            periodic = null;
        }
    }

    private void check(long delayMs, boolean force) {
        if (!force && System.currentTimeMillis() - lastRun < MIN_GAP_MS) return;
        if (!queued.compareAndSet(false, true)) return;
        worker.schedule(() -> {
            queued.set(false);
            runSafely();
        }, delayMs, TimeUnit.MILLISECONDS);
    }

    private void runSafely() {
        lastRun = System.currentTimeMillis();
        try {
            run();
        } catch (Throwable e) {
            // A page update must never take the app down: the pages it has go on working.
            Log.w(TAG, "page check failed", e);
        }
    }

    private void run() {
        WebBundle pages = WebBundle.get(app);
        String stamp;
        try {
            stamp = getJson("/build.json?t=" + System.currentTimeMillis()).optString("buildTime");
        } catch (HttpStatus e) {
            // 5xx is a deploy restarting the server; a lasting 4xx (a firewall turning the app away)
            // would stop every phone following the site without a word, so it is counted and reported.
            if (e.code >= 400 && e.code < 500 && e.code != 408 && e.code != 429) failed("build.json", e.getMessage());
            else Log.i(TAG, "the site did not answer: " + e.getMessage());
            return;
        } catch (IOException | JSONException e) {
            Log.i(TAG, "the site did not answer: " + e);  // offline, or unreachable right now
            return;
        }
        if (failing.equals("build.json")) {
            failing = "";
            failures = 0;
        }
        if (stamp.length() < 10 || stamp.length() > 64 || !stamp.matches("[0-9A-Za-z:.+\\-]+")) {
            Log.w(TAG, "build.json names no build: " + stamp);
            return;
        }
        try {
            PageBuild live = pages.known(stamp);
            if (live == null) live = download(pages, stamp);
            if (pages.follow(live)) {
                Log.i(TAG, "pages " + live.describe() + " ready for the next page load");
                Runnable r = onReady;
                if (r != null) r.run();
            }
            if (stamp.equals(failing)) {
                failing = "";
                failures = 0;
            }
            // Only now: files that arrived before a download broke off are what the next attempt resumes from.
            pages.collectGarbage();
        } catch (Refused e) {
            failed(stamp, e.getMessage());
        } catch (IOException e) {
            // The connection dropped, or the site was deployed again mid-way: the next check goes on.
            Log.i(TAG, "pages " + stamp + " not downloaded yet: " + e);
        }
    }

    private PageBuild download(WebBundle pages, String stamp) throws IOException, Refused {
        JSONObject list;
        try {
            list = getJson("/build-files.json?t=" + System.currentTimeMillis());
        } catch (JSONException e) {
            // The live build has no file list — one from before this existed (a rollback).
            throw new Refused("build-files.json is not a file list");
        }
        if (!stamp.equals(list.optString("buildTime"))) throw new IOException("deployed again while checking");
        JSONObject listed = list.optJSONObject("files");
        if (listed == null || listed.length() == 0 || listed.length() > MAX_FILES) {
            throw new Refused("build-files.json lists no files");
        }
        Map<String, String> files = new HashMap<>();
        Map<String, String> need = new HashMap<>();  // SHA-256 → the path to download it from
        Map<String, Long> sizes = new HashMap<>();
        long total = 0;
        for (Iterator<String> it = listed.keys(); it.hasNext(); ) {
            String rel = it.next();
            if (rel.equals("sw.js")) continue;  // the app never runs a service worker
            JSONObject f = listed.optJSONObject(rel);
            String sha = f == null ? "" : f.optString("sha256");
            long size = f == null ? -1 : f.optLong("size", -1);
            if (!safePath(rel) || !WebBundle.isSha(sha) || size < 0 || size > MAX_FILE) {
                throw new Refused("build-files.json has a bad entry: " + rel);
            }
            files.put(rel, sha);
            if (!pages.has(sha) && !need.containsKey(sha)) {
                need.put(sha, rel);
                sizes.put(sha, size);
                total += size;
            }
        }
        String index = files.get("index.html");
        if (index == null || !files.containsKey("build.json")) throw new Refused("build-files.json lists no index.html");
        if (total > MAX_DOWNLOAD) throw new Refused("build too large to download: " + total + " bytes");
        Log.i(TAG, "downloading pages " + list.optString("version") + ": " + need.size() + " of "
                + files.size() + " files, " + total + " bytes");
        // index.html comes from the site's own address, whose answer carries the
        // Content-Security-Policy these pages were written for — even when the file itself is at hand.
        boolean indexNeeded = need.remove(index) != null;
        String csp = fetch(pages, "index.html", index, indexNeeded ? sizes.get(index) : -1, indexNeeded);
        if (csp == null || csp.trim().isEmpty()) throw new Refused("the site sent no Content-Security-Policy");
        for (Map.Entry<String, String> e : need.entrySet()) {
            fetch(pages, e.getValue(), e.getKey(), sizes.get(e.getKey()), true);
        }
        return pages.store(list.optString("version", "?"), stamp, csp.trim(), files);
    }

    /**
     * Downloads one file into files/web/blobs/<sha> and checks it — or, when
     * keep is false, reads only the answer's headers. Returns the answer's
     * Content-Security-Policy.
     */
    private String fetch(WebBundle pages, String rel, String sha, long size, boolean keep)
            throws IOException, Refused {
        String path = rel.equals("index.html") ? "/" : "/" + encode(rel);
        // Content-hashed files never change under their name. Any other may sit
        // in the CDN's cache under its fixed name, so the hash rides along as a
        // query that cache has never seen.
        if (!rel.startsWith("assets/")) path += "?b=" + sha.substring(0, 16);
        HttpURLConnection c = open(path);
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new Refused(rel + " answered " + code);
            String csp = c.getHeaderField("Content-Security-Policy");
            if (!keep) return csp;
            pages.blobs.mkdirs();
            File part = new File(pages.blobs, sha + ".part");
            MessageDigest md = sha256();
            long got = 0;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    got += n;
                    if (got > size) throw new Refused(rel + " is larger than build-files.json says");
                    md.update(buf, 0, n);
                    out.write(buf, 0, n);
                }
            } catch (Refused | IOException e) {
                part.delete();
                throw e;
            }
            if (!sha.equals(hex(md.digest()))) {
                part.delete();
                // Usually a deploy that replaced the file mid-download; the next check follows it.
                throw new Refused(rel + " does not match build-files.json");
            }
            if (!part.renameTo(new File(pages.blobs, sha))) {
                part.delete();
                throw new IOException("could not store " + rel);
            }
            return csp;
        } finally {
            c.disconnect();
        }
    }

    private void failed(String stamp, String why) {
        if (!stamp.equals(failing)) {
            failing = stamp;
            failures = 0;
        }
        failures++;
        Log.w(TAG, "pages " + stamp + " not taken (" + failures + "): " + why);
        if (failures < REPORT_AFTER) {
            check(RETRY_MS, true);
        } else if (failures == REPORT_AFTER) {
            // The phone keeps the pages it has, and nobody would ever notice it stopped following the site.
            FailureReport.send(app, "page update failed", "build " + stamp + " · " + failures + " attempts\n" + why);
        }
    }

    private HttpURLConnection open(String path) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(ORIGIN + path).openConnection();
        c.setConnectTimeout(10_000);
        c.setReadTimeout(30_000);
        // The site answers its own files itself; a redirect is somebody else's page.
        c.setInstanceFollowRedirects(false);
        c.setUseCaches(false);
        c.setRequestProperty("User-Agent", userAgent);
        c.setRequestProperty("Cache-Control", "no-cache");
        return c;
    }

    private JSONObject getJson(String path) throws IOException, JSONException {
        HttpURLConnection c = open(path);
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new HttpStatus(code, path.replaceFirst("\\?.*", "") + " answered " + code);
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[16 * 1024];
                int n;
                while ((n = in.read(chunk)) > 0) {
                    buf.write(chunk, 0, n);
                    if (buf.size() > MAX_JSON) throw new IOException(path + " is too large");
                }
                return new JSONObject(buf.toString("UTF-8"));
            }
        } finally {
            c.disconnect();
        }
    }

    /** A path as the build lists it: relative, no empty, "." or ".." segments, nothing a URL would read as more. */
    static boolean safePath(String rel) {
        if (rel.isEmpty() || rel.length() > 300 || rel.startsWith("/")) return false;
        for (int i = 0; i < rel.length(); i++) {
            char ch = rel.charAt(i);
            if (ch < 0x20 || ch == '\\' || ch == '?' || ch == '#') return false;
        }
        for (String seg : rel.split("/", -1)) {
            if (seg.isEmpty() || seg.equals(".") || seg.equals("..")) return false;
        }
        return true;
    }

    private static String encode(String rel) {
        StringBuilder s = new StringBuilder();
        for (String seg : rel.split("/", -1)) {
            if (s.length() > 0) s.append('/');
            s.append(Uri.encode(seg));
        }
        return s.toString();
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder(b.length * 2);
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    /** The site answered, but not with a build this app can take: counted, and reported when it persists. */
    private static final class Refused extends Exception {
        Refused(String message) {
            super(message);
        }
    }

    /** An answer other than 200 to a JSON request. */
    private static final class HttpStatus extends IOException {
        final int code;

        HttpStatus(int code, String message) {
            super(message);
            this.code = code;
        }
    }
}
