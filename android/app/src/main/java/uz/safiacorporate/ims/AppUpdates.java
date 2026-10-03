package uz.safiacorporate.ims;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * The APK's own updates (CLAUDE.md «The Android app»). PageUpdates keeps the
 * PAGES on every deploy by itself; the app around them changes only when
 * android/ does, and a sideloaded app cannot replace itself silently. The
 * server publishes ONE release (/api/android/latest, services/android_release.py):
 * when its versionCode is newer than the one running, the file is downloaded,
 * checked against the published SHA-256 and handed to Android's installer —
 * the person taps «Install» once. The first time, Android asks them to let
 * Safia IMS install apps; the app says so and opens that setting.
 *
 * One state machine, two ways in (1.7.0):
 *   - by itself: while the main screen is on screen it asks at most every
 *     MIN_GAP_MS and offers a newer APK in a dialog of its own («Keyinroq»
 *     stays quiet about that version for SNOOZE_MS);
 *   - from the page: the «Yangilanishni tekshirish» row above «Versiya» in the
 *     sidebar (components/layout/AppUpdateButton.jsx ↔ utils/androidUpdate.js)
 *     asks for a check NOW, starts or stops the download, re-opens the
 *     installer, and hears every step — the download's progress included — as
 *     a `safia-app-update` event carrying state().
 * Both drive the SAME check and the SAME download: one started from the
 * dialog shows its progress on the page too, and nothing pops the dialog over
 * the page's own window while that window is open.
 *
 * Only the main screen has one (never a session screen), and an update check
 * never takes the app down.
 */
final class AppUpdates {
    private static final String TAG = "SafiaApk";
    private static final String MIME = "application/vnd.android.package-archive";
    /** The first page and its data go first. */
    private static final long START_DELAY_MS = 8_000L;
    private static final long MIN_GAP_MS = 30 * 60_000L;
    private static final long SNOOZE_MS = 12 * 3_600_000L;
    private static final long MAX_APK = 80L << 20;
    /** The page's update window counts as open this long after it last said so. */
    private static final long WATCH_MS = 15 * 60_000L;

    // `phase` as the page reads it (utils/androidUpdate.js spells the same words).
    private static final String IDLE = "idle";
    private static final String CHECKING = "checking";
    /** The published APK is not newer than the one running. */
    private static final String CURRENT = "current";
    /** Nothing is published (404). */
    private static final String NONE = "none";
    private static final String AVAILABLE = "available";
    private static final String DOWNLOADING = "downloading";
    /** `error` says which step: check · download · mismatch · install · settings. */
    private static final String FAILED = "failed";

    private final Activity activity;
    private final Supplier<String> lang;
    /** Hands state() to the page (MainActivity: a `safia-app-update` event). */
    private final Consumer<String> page;
    private final long running;
    private final String runningName;
    private final File dir;
    private final SharedPreferences prefs;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "safia-apk");
        t.setDaemon(true);
        return t;
    });
    private final Runnable autoCheck = () -> startCheck(false);
    /** «Stop» (the page, the dialog) or destroy(); the download loop reads it. */
    private volatile boolean cancelled;

    // The main thread's own.
    private boolean resumed;
    private boolean destroyed;
    /** When a check last STARTED — the automatic gap counts from it. */
    private long lastCheck;
    private AlertDialog dialog;
    /** The release waiting on the «install unknown apps» setting, and who asked. */
    private JSONObject awaitingPermission;
    private boolean awaitingFromPage;
    private long watchUntil;
    private boolean checking;
    /** The check under way was asked for by the page: answered there, never in a dialog. */
    private boolean manualCheck;
    private boolean downloading;
    private boolean downloadFromPage;
    /** Downloaded while the app was off screen, where Android lets no app open the installer. */
    private File pendingInstall;
    /** May this app install packages (Android 8+); changes only in Settings, so read on return. */
    private boolean allowed;
    // state(), as the page reads it.
    private String phase = IDLE;
    private String error = "";
    private JSONObject latest;
    private boolean downloaded;
    private long openedCode;
    private long got;
    private long total;
    private long checkedAt;

    AppUpdates(Activity activity, Supplier<String> lang, Consumer<String> page) {
        this.activity = activity;
        this.lang = lang;
        this.page = page;
        this.dir = new File(activity.getCacheDir(), "apk");
        this.prefs = activity.getSharedPreferences("app-update", Context.MODE_PRIVATE);
        long code;
        String name;
        try {
            PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            code = PackageInfoCompat.getLongVersionCode(info);
            name = info.versionName == null ? "" : info.versionName;
        } catch (Exception e) {
            code = Long.MAX_VALUE;  // unknown: never offer anything
            name = "";
        }
        running = code;
        runningName = name;
        allowed = canInstall();
        worker.execute(this::dropInstalled);
    }

    void onResume() {
        resumed = true;
        allowed = canInstall();
        if (pendingInstall != null) {
            File apk = pendingInstall;
            pendingInstall = null;
            install(apk);
        } else if (awaitingPermission != null) {
            // Back from the «install unknown apps» setting: on with the update if
            // it was switched on; otherwise the offer stands, as it was.
            JSONObject rel = awaitingPermission;
            boolean byPage = awaitingFromPage;
            awaitingPermission = null;
            if (allowed) download(rel, byPage);
        } else if (System.currentTimeMillis() - lastCheck >= MIN_GAP_MS) {
            main.removeCallbacks(autoCheck);
            main.postDelayed(autoCheck, START_DELAY_MS);
        }
        // The page hears whatever moved while it was away (the setting, a download).
        emit();
    }

    void onPause() {
        resumed = false;
        // A check that has not begun waits for the next return: the gap counts
        // from a check that ran, so a glance away does not cost thirty minutes.
        main.removeCallbacks(autoCheck);
    }

    void destroy() {
        destroyed = true;
        cancelled = true;
        main.removeCallbacksAndMessages(null);
        if (dialog != null) dialog.dismiss();
        worker.shutdownNow();
    }

    /**
     * The page's update window (utils/androidUpdate.js), on the main thread:
     * "status" · "check" · "start" · "cancel" · "watch" · "unwatch". Each one
     * is answered with state(), so a page that asks always hears back.
     */
    void fromPage(String op) {
        if (destroyed) return;
        switch (op == null ? "" : op) {
            case "check":
                startCheck(true);
                break;
            case "start":
                if (!downloading && isNewer(latest)) start(latest, true);
                break;
            case "cancel":
                if (downloading) cancelled = true;
                break;
            case "watch":
                watchUntil = System.currentTimeMillis() + WATCH_MS;
                break;
            case "unwatch":
                watchUntil = 0;
                break;
            default:  // "status"
                break;
        }
        emit();
    }

    private String t(int key, Object... args) {
        return Texts.get(lang.get(), key, args);
    }

    private boolean pageWatching() {
        return System.currentTimeMillis() < watchUntil;
    }

    private boolean isNewer(JSONObject rel) {
        return rel != null && rel.optLong("version_code", 0) > running;
    }

    // ─── is there a newer APK ────────────────────────────────────────────────

    /** The timer's check, or the page's (`manual`). */
    private void startCheck(boolean manual) {
        // A download under way already knows what is published.
        if (destroyed || downloading) return;
        if (manual) {
            manualCheck = true;
            phase = CHECKING;
            error = "";
            emit();
        }
        if (checking) return;  // the check under way answers both
        checking = true;
        lastCheck = System.currentTimeMillis();
        worker.execute(() -> {
            JSONObject rel = null;
            boolean answered = false;
            boolean onDisk = false;
            try {
                rel = fetchLatest();
                answered = true;
                onDisk = rel != null && new File(dir, rel.optLong("version_code") + ".apk").length()
                        == rel.optLong("size", -1);
            } catch (Throwable e) {
                Log.i(TAG, "update check failed: " + e);
            }
            JSONObject found = rel;
            boolean ok = answered;
            boolean have = onDisk;
            main.post(() -> checked(found, ok, have));
        });
    }

    private void checked(JSONObject rel, boolean answered, boolean onDisk) {
        if (destroyed) return;
        checking = false;
        boolean manual = manualCheck;
        manualCheck = false;
        if (downloading) return;  // began while this check ran; it reports for itself
        if (!answered) {
            // Offline, or the server failed: what was known stays known, and only
            // a page that asked hears that this check did not happen.
            if (manual) {
                phase = FAILED;
                error = "check";
                emit();
            }
            return;
        }
        latest = rel;
        downloaded = onDisk;
        checkedAt = System.currentTimeMillis();
        error = "";
        phase = rel == null ? NONE : isNewer(rel) ? AVAILABLE : CURRENT;
        emit();
        if (!manual && AVAILABLE.equals(phase) && !snoozed(rel)) offer(rel);
    }

    private boolean snoozed(JSONObject rel) {
        return prefs.getLong("snooze_code", 0) == rel.optLong("version_code")
                && System.currentTimeMillis() < prefs.getLong("snooze_until", 0);
    }

    /** The published release, or null when nothing is published (404). */
    private JSONObject fetchLatest() throws IOException, JSONException {
        HttpURLConnection c = open("/api/android/latest?t=" + System.currentTimeMillis());
        try {
            int status = c.getResponseCode();
            if (status == 404) return null;
            if (status != 200) throw new IOException("/api/android/latest answered " + status);
            return new JSONObject(readSmall(c));
        } finally {
            c.disconnect();
        }
    }

    private void offer(JSONObject rel) {
        if (!resumed || activity.isFinishing() || pageWatching() || (dialog != null && dialog.isShowing())) return;
        long mb = Math.max(1, Math.round(rel.optLong("size", 0) / 1048576.0));
        dialog = new AlertDialog.Builder(activity)
                .setTitle(t(Texts.UPDATE_TITLE, rel.optString("version_name")))
                .setMessage(t(Texts.UPDATE_TEXT, mb))
                .setPositiveButton(t(Texts.UPDATE_NOW), (d, w) -> start(rel, false))
                .setNegativeButton(t(Texts.UPDATE_LATER), (d, w) -> prefs.edit()
                        .putLong("snooze_code", rel.optLong("version_code"))
                        .putLong("snooze_until", System.currentTimeMillis() + SNOOZE_MS)
                        .apply())
                .setCancelable(false)
                .show();
    }

    /** Download (unless already on the phone) and hand to the installer — after the permission, the first time. */
    private void start(JSONObject rel, boolean byPage) {
        if (destroyed || downloading) return;
        allowed = canInstall();
        if (allowed) {
            download(rel, byPage);
            return;
        }
        if (byPage) {
            // The page's window has already said why: straight to the setting,
            // and the download starts by itself once the person is back with it on.
            openInstallSetting(rel, true);
            return;
        }
        dialog = new AlertDialog.Builder(activity)
                .setMessage(t(Texts.UPDATE_ALLOW))
                .setPositiveButton(t(Texts.UPDATE_SETTINGS), (d, w) -> openInstallSetting(rel, false))
                .setNegativeButton(t(Texts.CANCEL), null)
                .show();
    }

    private void openInstallSetting(JSONObject rel, boolean byPage) {
        awaitingPermission = rel;
        awaitingFromPage = byPage;
        try {
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName())));
        } catch (ActivityNotFoundException e) {
            awaitingPermission = null;
            fail("settings", byPage);
            return;
        }
        emit();
    }

    private boolean canInstall() {
        // Before Android 8 the installer itself asks about unknown sources.
        return Build.VERSION.SDK_INT < 26 || activity.getPackageManager().canRequestPackageInstalls();
    }

    // ─── download, check, install ────────────────────────────────────────────

    private void download(JSONObject rel, boolean byPage) {
        if (destroyed || downloading) return;
        cancelled = false;
        downloading = true;
        downloadFromPage = byPage;
        phase = DOWNLOADING;
        error = "";
        got = 0;
        total = rel.optLong("size", 0);
        AlertDialog progress = null;
        if (!byPage) {
            // Started from the app's own dialog: its progress shows the same way,
            // on top of the page (which hears it as well).
            progress = new AlertDialog.Builder(activity)
                    .setMessage(t(Texts.UPDATE_LOADING, 0))
                    .setNegativeButton(t(Texts.CANCEL), (d, w) -> cancelled = true)
                    .setCancelable(false)
                    .show();
            dialog = progress;
        }
        emit();
        AlertDialog shown = progress;
        worker.execute(() -> {
            JSONObject target = rel;
            if (byPage) {
                // The window may be showing a release replaced since it checked,
                // and only the latest file is served: ask what is published NOW.
                try {
                    JSONObject now = fetchLatest();
                    if (!isNewer(now)) {
                        main.post(() -> nothingNewer(now));
                        return;
                    }
                    target = now;
                    main.post(() -> {
                        if (destroyed || !downloading) return;
                        latest = now;
                        total = now.optLong("size", 0);
                        emit();
                    });
                } catch (Exception e) {
                    // Not answered: the release already known is tried as it is.
                }
            }
            JSONObject use = target;
            try {
                File apk = fetch(use, (n, size) -> main.post(() -> progressed(n, size, shown)));
                main.post(() -> fetched(apk, "", shown));
            } catch (Exception e) {
                boolean stopped = cancelled;
                if (!stopped) Log.w(TAG, "update download failed", e);
                String why = stopped ? "" : e instanceof Mismatch ? "mismatch" : "download";
                main.post(() -> fetched(null, why, shown));
            }
        });
    }

    /** The page asked for a release that is no longer newer, or no longer published. */
    private void nothingNewer(JSONObject rel) {
        if (destroyed) return;
        downloading = false;
        latest = rel;
        checkedAt = System.currentTimeMillis();
        phase = rel == null ? NONE : CURRENT;
        emit();
    }

    private void progressed(long n, long size, AlertDialog shown) {
        if (destroyed || !downloading) return;
        got = n;
        total = size;
        if (shown != null && shown.isShowing()) {
            shown.setMessage(t(Texts.UPDATE_LOADING, (int) (n * 100 / Math.max(1, size))));
        }
        emit();
    }

    private void fetched(File apk, String why, AlertDialog shown) {
        if (destroyed) return;
        downloading = false;
        if (shown != null) shown.dismiss();
        if (apk != null) {
            downloaded = true;
            phase = AVAILABLE;
            got = total;
            install(apk);
            return;
        }
        got = 0;
        if (why.isEmpty()) {
            // Stopped by the person: back to the offer, as it stood.
            phase = isNewer(latest) ? AVAILABLE : IDLE;
            emit();
        } else {
            fail(why, downloadFromPage);
        }
    }

    private void fail(String why, boolean byPage) {
        phase = FAILED;
        error = why;
        // The page's window says so itself; anywhere else (its window closed, or
        // the app's own dialog started this), a toast.
        if (!(byPage && pageWatching())) FileHandoff.toast(activity, t(Texts.UPDATE_FAILED));
        emit();
    }

    private interface Progress {
        void at(long got, long size);
    }

    /** A download that is not the file the server published. */
    private static final class Mismatch extends IOException {
        Mismatch() {
            super("does not match the published SHA-256");
        }
    }

    /** Runs on the worker: touches no field but `cancelled`. */
    private File fetch(JSONObject rel, Progress progress) throws Exception {
        long code = rel.getLong("version_code");
        long size = rel.getLong("size");
        String sha = rel.getString("sha256");
        String url = rel.getString("url");
        if (size <= 0 || size > MAX_APK || !url.startsWith("/api/android/")) throw new IOException("bad release " + rel);
        dir.mkdirs();
        File done = new File(dir, code + ".apk");
        if (done.length() == size && sha.equals(sha256(done))) {
            progress.at(size, size);
            return done;  // already downloaded
        }
        File part = new File(dir, code + ".apk.part");
        HttpURLConnection c = open(url);
        try {
            if (c.getResponseCode() != 200) throw new IOException(url + " answered " + c.getResponseCode());
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            long read = 0;
            int shown = -1;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (cancelled) throw new IOException("cancelled");
                    read += n;
                    if (read > size) throw new IOException("larger than published");
                    md.update(buf, 0, n);
                    out.write(buf, 0, n);
                    int pct = (int) (read * 100 / size);
                    if (pct != shown) {
                        shown = pct;
                        progress.at(read, size);
                    }
                }
            }
            // A connection that ended early is a failed download, not a bad file.
            if (read != size) throw new IOException("ended at " + read + " of " + size + " bytes");
            if (!sha.equals(hex(md.digest()))) {
                FailureReport.send(activity, "app update rejected",
                        "versionCode " + code + ": the download does not match the published SHA-256");
                throw new Mismatch();
            }
        } catch (Exception e) {
            part.delete();
            throw e;
        } finally {
            c.disconnect();
        }
        if (!part.renameTo(done)) throw new IOException("could not store the APK");
        return done;
    }

    private void install(File apk) {
        if (!resumed) {
            // Android lets no app off screen open the installer: it opens on return.
            pendingInstall = apk;
            emit();
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", apk);
            activity.startActivity(new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, MIME)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
        } catch (RuntimeException e) {
            // No installer, or the file is not one the provider shares.
            Log.w(TAG, "could not open the installer", e);
            fail("install", downloadFromPage);
            return;
        }
        if (latest != null) openedCode = latest.optLong("version_code");
        emit();
    }

    /** An APK for the version now running (or older) has done its job. */
    private void dropInstalled() {
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File f : files) {
            String n = f.getName();
            try {
                long code = Long.parseLong(n.substring(0, n.indexOf('.')));
                if (code <= running || n.endsWith(".part")) f.delete();
            } catch (RuntimeException e) {
                f.delete();
            }
        }
    }

    // ─── what the page reads ─────────────────────────────────────────────────

    /** The page's window reads these names (utils/androidUpdate.js). */
    private JSONObject state() {
        JSONObject s = new JSONObject();
        try {
            s.put("v", 1);
            s.put("phase", phase);
            s.put("error", error);
            s.put("running", new JSONObject()
                    .put("code", running == Long.MAX_VALUE ? 0 : running)
                    .put("name", runningName));
            if (latest != null) {
                s.put("latest", new JSONObject()
                        .put("code", latest.optLong("version_code"))
                        .put("name", latest.optString("version_name"))
                        .put("size", latest.optLong("size"))
                        .put("publishedAt", latest.optString("published_at")));
            }
            s.put("got", got);
            s.put("total", total);
            s.put("downloaded", downloaded);
            s.put("installerOpened", latest != null && openedCode == latest.optLong("version_code"));
            s.put("canInstall", allowed);
            s.put("checkedAt", checkedAt);
        } catch (JSONException ignored) {
            // A field that cannot be written is a field the window does without.
        }
        return s;
    }

    private void emit() {
        if (!destroyed) page.accept(state().toString());
    }

    // ─── HTTP ────────────────────────────────────────────────────────────────

    private HttpURLConnection open(String path) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(MainActivity.ORIGIN + path).openConnection();
        c.setConnectTimeout(10_000);
        c.setReadTimeout(30_000);
        c.setInstanceFollowRedirects(false);
        c.setUseCaches(false);
        c.setRequestProperty("User-Agent", "SafiaIMS-Android/" + running);
        c.setRequestProperty("Accept", "*/*");
        return c;
    }

    private static String readSmall(HttpURLConnection c) throws IOException {
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int n;
            while ((n = in.read(chunk)) > 0) {
                buf.write(chunk, 0, n);
                if (buf.size() > 64 * 1024) throw new IOException("answer too large");
            }
            return buf.toString("UTF-8");
        }
    }

    private static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        return hex(md.digest());
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder(b.length * 2);
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }
}
