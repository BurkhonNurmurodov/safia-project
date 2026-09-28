package uz.safiacorporate.ims;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.webkit.WebViewCompat;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Tells the platform's admins when the app fails to open, through the site's
 * own unauthenticated door for exactly that — POST /api/boot-report
 * (backend/app/routers/boot.py), which DMs the support chat. Version 1.0.0
 * closed without a word on the first phone it met, and the only way anybody
 * found out was the person holding it.
 *
 * A report is written to disk before it is sent and deleted once delivered, so
 * one the network refused goes out on the next start. Every method swallows
 * its own failures: this runs while the app is already failing, and must never
 * become a second failure.
 */
final class FailureReport {
    private static final String TAG = "SafiaReport";
    private static final String ENDPOINT = "https://production.safiacorporate.uz/api/boot-report";
    private static final String PENDING = "pending-failure-report.json";
    // BootReport's own caps in routers/boot.py — a longer field is a 422, not a report.
    private static final int STAGE_MAX = 200;
    private static final int UA_MAX = 500;
    private static final int DETAILS_MAX = 3500;

    private FailureReport() {
    }

    /** Sends in the background; the copy on disk covers a send that does not finish. */
    static void send(Context context, String stage, String details) {
        try {
            Context app = context.getApplicationContext();
            String body = body(app, stage, details);
            save(app, body);
            new Thread(() -> deliver(app, body), "safia-report").start();
        } catch (Throwable e) {
            Log.w(TAG, "report not queued", e);
        }
    }

    /** For the crash handler: the process dies straight after, so the send gets a moment. */
    static void sendBeforeDeath(Context context, String stage, Throwable error) {
        try {
            Context app = context.getApplicationContext();
            String body = body(app, stage, stackTrace(error));
            save(app, body);
            Thread t = new Thread(() -> deliver(app, body), "safia-report");
            t.start();
            t.join(2500);
        } catch (Throwable e) {
            Log.w(TAG, "crash report not sent", e);
        }
    }

    /** A report an earlier run could not deliver goes out now. */
    static void flushPending(Context context) {
        try {
            Context app = context.getApplicationContext();
            File f = new File(app.getFilesDir(), PENDING);
            if (!f.isFile()) return;
            new Thread(() -> {
                String body = read(f);
                if (body != null) deliver(app, body);
            }, "safia-report").start();
        } catch (Throwable e) {
            Log.w(TAG, "pending report not sent", e);
        }
    }

    static String stackTrace(Throwable error) {
        StringWriter w = new StringWriter();
        error.printStackTrace(new PrintWriter(w));
        return w.toString();
    }

    private static void deliver(Context app, String body) {
        if (post(body)) new File(app.getFilesDir(), PENDING).delete();
    }

    private static String body(Context app, String stage, String details) {
        String device = describe(app);
        try {
            JSONObject o = new JSONObject();
            o.put("stage", cap("Android app · " + stage, STAGE_MAX));
            o.put("ua", cap(device, UA_MAX));
            // boot-report prints stage + details and not the ua, so the device leads the details.
            o.put("details", cap(device + "\n\n" + details, DETAILS_MAX));
            return o.toString();
        } catch (Throwable e) {
            return "{\"stage\":\"Android app\"}";
        }
    }

    /** Which app build and pages, which phone, which web engine — most of the diagnosis. */
    private static String describe(Context app) {
        StringBuilder s = new StringBuilder("Safia IMS ");
        PackageManager pm = app.getPackageManager();
        s.append(version(pm, app.getPackageName()))
                .append(" (pages ").append(WebBundle.pagesInUse(app)).append(')')
                .append(" · ").append(Build.MANUFACTURER).append(' ').append(Build.MODEL)
                .append(" · Android ").append(Build.VERSION.RELEASE)
                .append(" (API ").append(Build.VERSION.SDK_INT).append(')')
                .append(" · WebView ").append(webView(app));
        return s.toString();
    }

    private static String webView(Context app) {
        try {
            PackageInfo p = WebViewCompat.getCurrentWebViewPackage(app);
            return p == null ? "none" : p.packageName + " " + p.versionName;
        } catch (Throwable e) {
            return "unknown";
        }
    }

    private static String version(PackageManager pm, String pkg) {
        try {
            return String.valueOf(pm.getPackageInfo(pkg, 0).versionName);
        } catch (Throwable e) {
            return "not installed";
        }
    }

    /**
     * True when the report needs no further try: delivered, or refused for good.
     * 429 (throttled) and 5xx (no chat reachable, a deploy restarting) wait for the
     * next start; any other 4xx will never be accepted, so retrying it forever
     * would only resend a broken report on every launch.
     */
    private static boolean post(String body) {
        HttpURLConnection c = null;
        try {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            c = (HttpURLConnection) new URL(ENDPOINT).openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            c.setRequestProperty("User-Agent", "SafiaIMS-Android");
            c.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream out = c.getOutputStream()) {
                out.write(bytes);
            }
            int code = c.getResponseCode();
            return code / 100 == 2 || (code / 100 == 4 && code != 429);
        } catch (Throwable e) {
            Log.w(TAG, "report not delivered", e);
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static void save(Context app, String body) {
        try (OutputStream out = new FileOutputStream(new File(app.getFilesDir(), PENDING))) {
            out.write(body.getBytes(StandardCharsets.UTF_8));
        } catch (Throwable e) {
            Log.w(TAG, "report not saved", e);
        }
    }

    private static String read(File f) {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[4096];
            int n;
            while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
            return buf.toString("UTF-8");
        } catch (Throwable e) {
            return null;
        }
    }

    private static String cap(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
