package uz.safiacorporate.ims;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;

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
import java.util.function.Supplier;

/**
 * The APK's own updates (CLAUDE.md «The Android app»). PageUpdates keeps the
 * PAGES on every deploy by itself; the app around them changes only when
 * android/ does, and a sideloaded app cannot replace itself silently. So while
 * the main screen is on screen this asks the server which APK is published
 * (/api/android/latest, services/android_release.py), and when its versionCode
 * is newer than the one running it offers «Yangilash»: the file is downloaded,
 * checked against the published SHA-256, and handed to Android's installer —
 * the person taps «Install» once. The first time, Android asks them to let
 * Safia IMS install apps; the app says so and opens that setting.
 *
 * «Keyinroq» stays quiet about that version for SNOOZE_MS. Only the main
 * screen asks (never a session screen), and a check never takes the app down.
 */
final class AppUpdates {
    private static final String TAG = "SafiaApk";
    private static final String MIME = "application/vnd.android.package-archive";
    /** The first page and its data go first. */
    private static final long START_DELAY_MS = 8_000L;
    private static final long MIN_GAP_MS = 30 * 60_000L;
    private static final long SNOOZE_MS = 12 * 3_600_000L;
    private static final long MAX_APK = 80L << 20;

    private final Activity activity;
    private final Supplier<String> lang;
    private final long running;
    private final File dir;
    private final SharedPreferences prefs;
    private final ExecutorService worker = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "safia-apk");
        t.setDaemon(true);
        return t;
    });
    // The main thread's own.
    private boolean resumed;
    private long lastCheck;
    private AlertDialog dialog;
    /** The release waiting on the «install unknown apps» setting. */
    private JSONObject awaitingPermission;
    private volatile boolean cancelled;

    AppUpdates(Activity activity, Supplier<String> lang) {
        this.activity = activity;
        this.lang = lang;
        this.dir = new File(activity.getCacheDir(), "apk");
        this.prefs = activity.getSharedPreferences("app-update", Context.MODE_PRIVATE);
        long v;
        try {
            v = PackageInfoCompat.getLongVersionCode(
                    activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0));
        } catch (Exception e) {
            v = Long.MAX_VALUE;  // unknown: never offer anything
        }
        running = v;
        worker.execute(this::dropInstalled);
    }

    void onResume() {
        resumed = true;
        if (awaitingPermission != null) {
            // Back from the «install unknown apps» setting.
            JSONObject rel = awaitingPermission;
            awaitingPermission = null;
            if (canInstall()) download(rel);
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastCheck < MIN_GAP_MS) return;
        lastCheck = now;
        worker.execute(() -> {
            try {
                Thread.sleep(START_DELAY_MS);
                check();
            } catch (Throwable e) {
                Log.i(TAG, "update check failed: " + e);
            }
        });
    }

    void onPause() {
        resumed = false;
    }

    void destroy() {
        cancelled = true;
        if (dialog != null) dialog.dismiss();
        worker.shutdownNow();
    }

    private String t(int key, Object... args) {
        return Texts.get(lang.get(), key, args);
    }

    // ─── is there a newer APK ────────────────────────────────────────────────

    private void check() throws Exception {
        HttpURLConnection c = open("/api/android/latest?t=" + System.currentTimeMillis());
        JSONObject rel;
        try {
            if (c.getResponseCode() != 200) return;  // 404: nothing published yet
            rel = new JSONObject(readSmall(c));
        } finally {
            c.disconnect();
        }
        long code = rel.optLong("version_code", 0);
        if (code <= running) return;
        if (prefs.getLong("snooze_code", 0) == code && System.currentTimeMillis() < prefs.getLong("snooze_until", 0)) {
            return;
        }
        activity.runOnUiThread(() -> offer(rel));
    }

    private void offer(JSONObject rel) {
        if (!resumed || activity.isFinishing() || (dialog != null && dialog.isShowing())) return;
        long mb = Math.max(1, Math.round(rel.optLong("size", 0) / 1048576.0));
        dialog = new AlertDialog.Builder(activity)
                .setTitle(t(Texts.UPDATE_TITLE, rel.optString("version_name")))
                .setMessage(t(Texts.UPDATE_TEXT, mb))
                .setPositiveButton(t(Texts.UPDATE_NOW), (d, w) -> start(rel))
                .setNegativeButton(t(Texts.UPDATE_LATER), (d, w) -> prefs.edit()
                        .putLong("snooze_code", rel.optLong("version_code"))
                        .putLong("snooze_until", System.currentTimeMillis() + SNOOZE_MS)
                        .apply())
                .setCancelable(false)
                .show();
    }

    private void start(JSONObject rel) {
        if (canInstall()) {
            download(rel);
            return;
        }
        dialog = new AlertDialog.Builder(activity)
                .setMessage(t(Texts.UPDATE_ALLOW))
                .setPositiveButton(t(Texts.UPDATE_SETTINGS), (d, w) -> {
                    awaitingPermission = rel;
                    try {
                        activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + activity.getPackageName())));
                    } catch (ActivityNotFoundException e) {
                        awaitingPermission = null;
                        FileHandoff.toast(activity, t(Texts.UPDATE_FAILED));
                    }
                })
                .setNegativeButton(t(Texts.CANCEL), null)
                .show();
    }

    private boolean canInstall() {
        // Before Android 8 the installer itself asks about unknown sources.
        return Build.VERSION.SDK_INT < 26 || activity.getPackageManager().canRequestPackageInstalls();
    }

    // ─── download, check, install ────────────────────────────────────────────

    private void download(JSONObject rel) {
        cancelled = false;
        dialog = new AlertDialog.Builder(activity)
                .setMessage(t(Texts.UPDATE_LOADING, 0))
                .setNegativeButton(t(Texts.CANCEL), (d, w) -> cancelled = true)
                .setCancelable(false)
                .show();
        AlertDialog progress = dialog;
        worker.execute(() -> {
            File apk;
            try {
                apk = fetch(rel, pct -> activity.runOnUiThread(() -> progress.setMessage(t(Texts.UPDATE_LOADING, pct))));
            } catch (Exception e) {
                Log.w(TAG, "update download failed", e);
                activity.runOnUiThread(() -> {
                    progress.dismiss();
                    if (!cancelled) FileHandoff.toast(activity, t(Texts.UPDATE_FAILED));
                });
                return;
            }
            activity.runOnUiThread(() -> {
                progress.dismiss();
                if (!cancelled) install(apk);
            });
        });
    }

    private interface Progress {
        void at(int pct);
    }

    private File fetch(JSONObject rel, Progress progress) throws Exception {
        long code = rel.getLong("version_code");
        long size = rel.getLong("size");
        String sha = rel.getString("sha256");
        String url = rel.getString("url");
        if (size <= 0 || size > MAX_APK || !url.startsWith("/api/android/")) throw new IOException("bad release " + rel);
        dir.mkdirs();
        File done = new File(dir, code + ".apk");
        if (done.length() == size && sha.equals(sha256(done))) return done;  // already downloaded
        File part = new File(dir, code + ".apk.part");
        HttpURLConnection c = open(url);
        try {
            if (c.getResponseCode() != 200) throw new IOException(url + " answered " + c.getResponseCode());
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            long got = 0;
            int shown = -1;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (cancelled) throw new IOException("cancelled");
                    got += n;
                    if (got > size) throw new IOException("larger than published");
                    md.update(buf, 0, n);
                    out.write(buf, 0, n);
                    int pct = (int) (got * 100 / size);
                    if (pct != shown) {
                        shown = pct;
                        progress.at(pct);
                    }
                }
            }
            if (got != size || !sha.equals(hex(md.digest()))) {
                FailureReport.send(activity, "app update rejected",
                        "versionCode " + code + ": the download does not match the published SHA-256");
                throw new IOException("does not match the published SHA-256");
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
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", apk);
        Intent i = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, MIME)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivity(i);
        } catch (ActivityNotFoundException e) {
            FileHandoff.toast(activity, t(Texts.UPDATE_FAILED));
        }
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
