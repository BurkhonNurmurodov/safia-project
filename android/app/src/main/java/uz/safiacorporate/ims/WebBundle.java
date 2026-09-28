package uz.safiacorporate.ims;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The site's pages, served from INSIDE the app (the operator's choice,
 * 2026-09-28: the app carries the pages; only data comes from the server).
 *
 * The web view is pointed at https://production.safiacorporate.uz itself and
 * this class answers that origin's page requests from the phone, while every
 * server path (/api, /bot, /.well-known, the backend's /admin/…) still goes
 * over the network. One origin, so the site needs no change at all: its
 * relative URLs, its storage and its session work exactly as in a browser.
 *
 * The pages come from one of two places: the copy built into the APK
 * (assets/web — the committed frontend/dist the build copied in), or a newer
 * build PageUpdates downloaded after the site was deployed (files/web). One
 * build is ACTIVE and answers every file the page on screen asks for; at most
 * one newer build is READY. The switch happens only when the page itself loads
 * again — a main-frame request: the site's own update prompt, or the next
 * start — so a running page never gets half its files from one build and half
 * from another.
 *
 * Downloaded files are stored by their SHA-256 (files/web/blobs/<sha>), so a
 * file that did not change between builds, or that the APK already carries, is
 * never downloaded or stored twice.
 *
 * serve() runs on a WebView background thread and PageUpdates on its own; the
 * builds themselves are immutable and are swapped under this object's lock.
 */
final class WebBundle {
    static final String TAG = "SafiaBundle";
    private static final String PREFS = "pages";
    /** The build the next start opens: a stored build's name, or "" for the built-in copy. */
    private static final String BOOT = "boot";
    /** The APK (its versionCode) the stored builds were downloaded under. */
    private static final String APK = "apk";
    private static volatile WebBundle instance;

    private final AssetManager assets;
    private final SharedPreferences prefs;
    /** files/web: downloaded builds (builds/<name>.json) and their files by SHA-256 (blobs/<sha>). */
    final File root;
    final File blobs;
    final File builds;
    /** The copy built into the APK. */
    final PageBuild bundled;
    /** SHA-256 → path under assets/web, for every built-in file: a new build reuses them. */
    private final Map<String, String> bundledBySha = new HashMap<>();
    private volatile PageBuild active;
    private volatile PageBuild ready;
    /** The build active before the last switch: a file the old page still asks for is found in it. */
    private volatile PageBuild previous;

    static WebBundle get(Context context) {
        WebBundle w = instance;
        if (w != null) return w;
        synchronized (WebBundle.class) {
            if (instance == null) instance = new WebBundle(context.getApplicationContext());
            return instance;
        }
    }

    private WebBundle(Context app) {
        assets = app.getAssets();
        prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        root = new File(app.getFilesDir(), "web");
        blobs = new File(root, "blobs");
        builds = new File(root, "builds");
        bundled = loadBundled(app);
        active = boot(app);
        Log.i(TAG, "pages " + active.describe() + " (" + active.buildTime + "), " + active.files.size() + " files"
                + (active.csp == null ? ", NO CSP" : ""));
    }

    WebResourceResponse serve(WebResourceRequest request) {
        Uri url = request.getUrl();
        if (!MainActivity.isOurs(url) || !"GET".equalsIgnoreCase(request.getMethod())) return null;
        String path = url.getPath() == null || url.getPath().isEmpty() ? "/" : url.getPath();
        if (isServerPath(path)) return null;
        // The app never runs a service worker; a registration that still reaches here gets nothing.
        if (path.equals("/sw.js")) return notFound();
        // A page load is the one moment the pages may change build — never under a running page.
        if (request.isForMainFrame()) switchToReady();
        String rel = path.equals("/") ? "index.html" : path.substring(1);
        PageBuild use = active;
        // The deploy marker the page polls names the newest build the phone HOLDS, so the site's
        // own update prompt (hooks/useAppUpdate.js) offers the reload that switches to it.
        PageBuild newer = ready;
        if (newer != null && rel.equals("build.json")) use = newer;
        WebResourceResponse res = file(use, rel);
        // A file the page on screen still asks for after a switch: a lazily loaded part of the
        // build it was loaded from.
        if (res == null) res = file(previous, rel);
        if (res != null) return res;
        // Any other page address is a route of the single-page app.
        if (request.isForMainFrame()) return file(active, "index.html");
        return null;
    }

    /**
     * What the SERVER answers, never the bundle. The SPA owns /admin and
     * /admin/upload (App.jsx, mirrored by SPA_ADMIN in src/sw.js); everything
     * else under /admin/ is a backend route.
     */
    static boolean isServerPath(String p) {
        return p.equals("/api") || p.startsWith("/api/")
                || p.startsWith("/bot/")
                || p.startsWith("/.well-known/")
                || p.equals("/health") || p.equals("/docs") || p.equals("/redoc") || p.equals("/openapi.json")
                || (p.startsWith("/admin/") && !p.equals("/admin/upload"));
    }

    static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    // ── Which build ────────────────────────────────────────────────────────

    private synchronized void switchToReady() {
        PageBuild r = ready;
        if (r == null) return;
        previous = active;
        active = r;
        ready = null;
        Log.i(TAG, "pages " + r.describe() + " (" + r.buildTime + ") now in use");
    }

    /**
     * The build production serves right now, whole on this phone: the next
     * start opens it, and the next page load switches to it. True when the page
     * on screen should be told — it runs another build, and this one was not
     * announced before.
     */
    synchronized boolean follow(PageBuild live) {
        prefs.edit().putString(BOOT, live.builtIn() ? "" : live.name).apply();
        if (live.buildTime.equals(active.buildTime)) {
            ready = null;
            return false;
        }
        boolean announced = ready != null && ready.buildTime.equals(live.buildTime);
        ready = live;
        return !announced;
    }

    /** A complete build with this stamp the phone already holds, or null. */
    PageBuild known(String stamp) {
        for (PageBuild b : new PageBuild[]{active, ready, previous, bundled}) {
            if (b != null && b.buildTime.equals(stamp)) return b;
        }
        return loadStored(nameOf(stamp));
    }

    /** For failure reports: which pages the app is showing. Never builds this object. */
    static String pagesInUse(Context context) {
        WebBundle w = instance;
        if (w != null) return w.active.describe();
        JSONObject m = json(readAsset(context, "web/build.json"));
        return (m == null ? "?" : m.optString("version", "?")) + " built in";
    }

    private PageBuild boot(Context app) {
        long apk = versionCode(app);
        if (prefs.getLong(APK, -1) != apk) {
            // A new APK brings its own pages; the builds downloaded under the one before are older.
            deleteTree(root);
            prefs.edit().putLong(APK, apk).remove(BOOT).apply();
            return bundled;
        }
        String name = prefs.getString(BOOT, "");
        PageBuild b = name.isEmpty() ? null : loadStored(name);
        return b != null ? b : bundled;
    }

    // ── The files ──────────────────────────────────────────────────────────

    /** Is this content on the phone — built in, or downloaded before? */
    boolean has(String sha) {
        return bundledBySha.containsKey(sha) || new File(blobs, sha).isFile();
    }

    private InputStream open(String sha) throws IOException {
        if (sha.startsWith("asset:")) return assets.open("web/" + sha.substring(6));
        String rel = bundledBySha.get(sha);
        if (rel != null) return assets.open("web/" + rel);
        return new FileInputStream(new File(blobs, sha));
    }

    private WebResourceResponse file(PageBuild b, String rel) {
        if (b == null) return null;
        String sha = b.files.get(rel);
        if (sha == null) return null;
        try {
            InputStream in = open(sha);
            String mime = mime(rel);
            Map<String, String> headers = new HashMap<>();
            if (rel.equals("index.html") || rel.equals("build.json")) headers.put("Cache-Control", "no-store");
            if (rel.equals("index.html") && b.csp != null) headers.put("Content-Security-Policy", b.csp);
            return new WebResourceResponse(mime, isText(mime) ? "UTF-8" : null, 200, "OK", headers, in);
        } catch (IOException e) {
            Log.w(TAG, "page file unreadable: " + rel, e);
            return null;
        }
    }

    /** Writes a downloaded build whose every file is at hand, and returns it. */
    PageBuild store(String version, String stamp, String csp, Map<String, String> files) throws IOException {
        JSONObject o = new JSONObject();
        try {
            o.put("version", version);
            o.put("buildTime", stamp);
            o.put("csp", csp);
            o.put("files", new JSONObject(files));
        } catch (JSONException e) {
            throw new IOException(e);
        }
        String name = nameOf(stamp);
        builds.mkdirs();
        File part = new File(builds, name + ".part");
        write(part, o.toString().getBytes(StandardCharsets.UTF_8));
        if (!part.renameTo(new File(builds, name + ".json"))) {
            part.delete();
            throw new IOException("could not store pages " + name);
        }
        return new PageBuild(version, stamp, csp, new HashMap<>(files), name);
    }

    private PageBuild loadStored(String name) {
        JSONObject o = json(read(new File(builds, name + ".json")));
        JSONObject listed = o == null ? null : o.optJSONObject("files");
        if (listed == null) return null;
        Map<String, String> files = new HashMap<>();
        for (Iterator<String> it = listed.keys(); it.hasNext(); ) {
            String rel = it.next();
            String sha = listed.optString(rel);
            // Every file must be at hand, or the build cannot be shown whole.
            if (!isSha(sha) || !has(sha)) {
                Log.w(TAG, "stored pages " + name + " incomplete at " + rel);
                return null;
            }
            files.put(rel, sha);
        }
        String csp = o.optString("csp", "");
        return new PageBuild(o.optString("version", "?"), o.optString("buildTime", ""),
                csp.isEmpty() ? null : csp, files, name);
    }

    /**
     * Drops every downloaded build, and every downloaded file, that neither the
     * page on screen, the build it came from, nor the build waiting for the next
     * page load needs. Runs on the PageUpdates thread, which is also the only
     * writer of these folders.
     */
    void collectGarbage() {
        Set<String> keepBuilds = new HashSet<>();
        Set<String> keepFiles = new HashSet<>();
        synchronized (this) {
            for (PageBuild b : new PageBuild[]{active, ready, previous}) {
                if (b == null || b.builtIn()) continue;
                keepBuilds.add(b.name + ".json");
                keepFiles.addAll(b.files.values());
            }
        }
        deleteExcept(builds, keepBuilds);
        deleteExcept(blobs, keepFiles);
    }

    private PageBuild loadBundled(Context app) {
        JSONObject marker = json(readAsset(app, "web/build.json"));
        JSONObject list = json(readAsset(app, "web/build-files.json"));
        JSONObject listed = list == null ? null : list.optJSONObject("files");
        Map<String, String> files = new HashMap<>();
        if (listed != null) {
            for (Iterator<String> it = listed.keys(); it.hasNext(); ) {
                String rel = it.next();
                if (rel.equals("sw.js")) continue;  // bundleWeb leaves it out
                JSONObject f = listed.optJSONObject(rel);
                String sha = f == null ? "" : f.optString("sha256");
                if (isSha(sha)) {
                    files.put(rel, sha);
                    bundledBySha.put(sha, rel);
                } else {
                    files.put(rel, "asset:" + rel);
                }
            }
        } else {
            // bundleWeb refuses a dist without the list; a missing one must still not mean missing pages.
            index("web", "", files);
        }
        return new PageBuild(
                marker == null ? "?" : marker.optString("version", "?"),
                marker == null ? "" : marker.optString("buildTime", ""),
                trimToNull(readAsset(app, "csp.txt")),
                files, null);
    }

    private void index(String dir, String prefix, Map<String, String> files) {
        try {
            String[] names = assets.list(dir);
            if (names == null) return;
            for (String name : names) {
                String path = dir + "/" + name;
                String[] children = assets.list(path);
                if (children != null && children.length > 0) index(path, prefix + name + "/", files);
                else files.put(prefix + name, "asset:" + prefix + name);
            }
        } catch (IOException e) {
            Log.w(TAG, "bundle index failed at " + dir, e);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    static boolean isSha(String s) {
        return s != null && s.length() == 64 && s.matches("[0-9a-f]{64}");
    }

    /** A build's file name: its stamp with everything but letters and digits made a dash. */
    static String nameOf(String stamp) {
        return stamp.replaceAll("[^0-9A-Za-z]", "-");
    }

    private static String mime(String rel) {
        String ext = rel.substring(rel.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        switch (ext) {
            case "html": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": case "map": return "application/json";
            case "webmanifest": return "application/manifest+json";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "webp": return "image/webp";
            case "gif": return "image/gif";
            case "ico": return "image/x-icon";
            case "woff": return "font/woff";
            case "woff2": return "font/woff2";
            case "ttf": return "font/ttf";
            case "txt": return "text/plain";
            case "wasm": return "application/wasm";
            default:
                String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                return m != null ? m : "application/octet-stream";
        }
    }

    private static boolean isText(String mime) {
        return mime.startsWith("text/") || mime.contains("json") || mime.contains("javascript")
                || mime.contains("svg") || mime.contains("manifest");
    }

    static String readAsset(Context context, String name) {
        try (InputStream in = context.getAssets().open(name)) {
            return new String(readAll(in), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    private static String read(File f) {
        if (!f.isFile()) return null;
        try (InputStream in = new FileInputStream(f)) {
            return new String(readAll(in), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
        return out.toByteArray();
    }

    private static void write(File f, byte[] data) throws IOException {
        try (OutputStream out = new FileOutputStream(f)) {
            out.write(data);
        }
    }

    private static JSONObject json(String s) {
        if (s == null) return null;
        try {
            return new JSONObject(s);
        } catch (JSONException e) {
            return null;
        }
    }

    private static void deleteExcept(File dir, Set<String> keep) {
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            if (!keep.contains(f.getName())) deleteTree(f);
        }
    }

    private static void deleteTree(File f) {
        File[] children = f.listFiles();
        if (children != null) for (File c : children) deleteTree(c);
        f.delete();
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(Context app) {
        try {
            PackageInfo p = app.getPackageManager().getPackageInfo(app.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode;
        } catch (Exception e) {
            return -2;
        }
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        s = s.trim();
        return s.isEmpty() ? null : s;
    }
}
