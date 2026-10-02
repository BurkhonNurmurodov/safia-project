package uz.safiacorporate.ims;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Phone notifications (CLAUDE.md «Phone notifications»). There is no push
 * service behind the app — that would take a Firebase project — so the app
 * ASKS: Android's job scheduler runs {@link PushJob} about every 15 minutes,
 * which calls GET /api/push/poll with the session the page handed over
 * (utils/androidPush.js `registerPush`, the year-long app token) and shows
 * what comes back as Android notifications, one per feed line, each replacing
 * its own earlier copy (tag = the line's key).
 *
 * The page keeps it honest: it moves the cursor while the app is on screen
 * (nothing seen there buzzes later), takes the notifications down when the bell
 * is opened, and signs it out with the person. A 401 means the session was
 * ended somewhere else (password changed, signed out everywhere): this stops
 * asking until the page registers again.
 */
final class Push {
    private static final String TAG = "SafiaPush";
    private static final String PREFS = "push";
    static final int JOB_ID = 4711;
    private static final long PERIOD_MS = 15 * 60_000L;
    private static final long FLEX_MS = 5 * 60_000L;
    private static final int BRAND = 0xFFC8973F;
    static final String EXTRA_IDS = "push_ids";
    static final String EXTRA_KEY = "push_key";
    private static final String[] CATS = {
            "approvals", "day", "concerns", "tasks", "checklist", "appeals", "idle", "learning", "other",
    };

    /** One worker: polls, test sends and read marks never overlap. */
    static final ExecutorService EXEC = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "safia-push");
        t.setDaemon(true);
        return t;
    });

    /** The screen to tell when the state changes (MainActivity, while on screen). */
    private static volatile Runnable listener;

    private Push() {
    }

    static void setListener(Runnable r) {
        listener = r;
    }

    static void clearListener(Runnable r) {
        if (listener == r) listener = null;
    }

    private static void changed() {
        Runnable r = listener;
        if (r != null) r.run();
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ─── what the page tells it ─────────────────────────────────────────────

    /** The signed-in profile and the token to ask with. A different profile
     *  starts over: its own cursor, and nothing of the previous one's shown. */
    static void register(Context c, String token, String profile, String lang) {
        if (token == null || token.isEmpty()) return;
        SharedPreferences p = prefs(c);
        boolean other = !profile.equals(p.getString("profile", ""));
        SharedPreferences.Editor e = p.edit()
                .putString("token", token)
                .putString("profile", profile)
                .putString("lang", lang == null || lang.isEmpty() ? "uz" : lang);
        if (other) {
            e.putLong("cursor", -1).remove("lastError");
            cancelAll(c);
        }
        e.apply();
        schedule(c);
        if (other || p.getLong("cursor", -1) < 0) EXEC.execute(() -> poll(c, false, 0));
    }

    /** Signed out with nobody left on the phone. Whether Android was already
     *  asked for permission is the phone's, not the session's — it stays. */
    static void clear(Context c) {
        prefs(c).edit().remove("token").remove("profile").remove("cursor")
                .remove("lastPoll").remove("lastError").apply();
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js != null) js.cancel(JOB_ID);
        cancelAll(c);
        changed();
    }

    /** The newest row the bell has shown while the app was on screen. */
    static void cursor(Context c, long latest) {
        SharedPreferences p = prefs(c);
        if (p.getString("token", "").isEmpty()) return;
        if (latest > p.getLong("cursor", -1)) p.edit().putLong("cursor", latest).apply();
    }

    static void language(Context c, String lang) {
        if (lang != null && !lang.isEmpty()) prefs(c).edit().putString("lang", lang).apply();
    }

    static boolean registered(Context c) {
        return !prefs(c).getString("token", "").isEmpty();
    }

    static boolean allowed(Context c) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c,
                Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(c).areNotificationsEnabled();
    }

    static boolean asked(Context c) {
        return prefs(c).getBoolean("asked", false);
    }

    static void markAsked(Context c) {
        prefs(c).edit().putBoolean("asked", true).apply();
    }

    /** What the settings dialog shows (utils/androidPush.js `usePushStatus`). */
    static JSONObject status(Context c) {
        SharedPreferences p = prefs(c);
        JSONObject s = new JSONObject();
        try {
            s.put("allowed", allowed(c));
            s.put("registered", registered(c));
            s.put("lastPoll", p.getLong("lastPoll", 0));
            s.put("lastError", p.getString("lastError", ""));
        } catch (Exception ignored) {
            // A field that cannot be written is a field the dialog does without.
        }
        return s;
    }

    // ─── the schedule ───────────────────────────────────────────────────────

    /** About every 15 minutes, whenever the phone has a network — persisted
     *  across restarts. Asked for once: re-scheduling would restart the period. */
    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null || js.getPendingJob(JOB_ID) != null) return;
        try {
            js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, PushJob.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(PERIOD_MS, FLEX_MS)
                    .setPersisted(true)
                    .build());
        } catch (Exception e) {
            Log.w(TAG, "could not schedule the check", e);
        }
    }

    // ─── asking the server ──────────────────────────────────────────────────

    /**
     * One check. {@code force}: show even with the app on screen (the settings
     * dialog's test, {@code testId} = the row it just wrote). Runs on a worker
     * thread — never the main one.
     */
    static void poll(Context c, boolean force, long testId) {
        SharedPreferences p = prefs(c);
        String token = p.getString("token", "");
        if (token.isEmpty()) return;
        if (!force && !allowed(c)) return;
        long cursor = p.getLong("cursor", -1);
        // A test asks from the row it wrote; everything else from the cursor.
        long after = force && testId > 0 ? testId - 1 : cursor;
        String lang = p.getString("lang", "uz");
        HttpURLConnection conn = null;
        try {
            conn = open(c, "/api/push/poll?after=" + after + "&lang=" + Uri.encode(lang), token);
            int code = conn.getResponseCode();
            if (code == 401) {
                // The session ended elsewhere; the page registers again on its next sign-in.
                Log.i(TAG, "session ended — stopping");
                clear(c);
                return;
            }
            if (code != 200) throw new IOException("HTTP " + code);
            JSONObject res = new JSONObject(read(conn));
            long latest = res.optLong("latest", 0);
            Set<String> shown = new HashSet<>(p.getStringSet("shown", new HashSet<>()));
            if (after >= 0 && (force || !SafiaApplication.inForeground())) {
                JSONArray items = res.optJSONArray("items");
                for (int i = 0; items != null && i < items.length(); i++) {
                    JSONObject item = items.getJSONObject(i);
                    if (show(c, item, lang)) shown.add(item.optString("key"));
                }
            }
            // A line that is no longer unread was read somewhere: take it down.
            Set<String> active = new HashSet<>();
            JSONArray a = res.optJSONArray("active");
            for (int i = 0; a != null && i < a.length(); i++) active.add(a.optString(i));
            NotificationManagerCompat nm = NotificationManagerCompat.from(c);
            for (String key : new HashSet<>(shown)) {
                if (!active.contains(key)) {
                    nm.cancel(key, 1);
                    shown.remove(key);
                }
            }
            p.edit()
                    .putLong("cursor", Math.max(cursor, latest))
                    .putLong("lastPoll", System.currentTimeMillis())
                    .putString("lastError", "")
                    .putStringSet("shown", shown)
                    .apply();
        } catch (Exception e) {
            Log.w(TAG, "check failed", e);
            p.edit().putString("lastError", String.valueOf(e.getMessage())).apply();
        } finally {
            if (conn != null) conn.disconnect();
        }
        changed();
    }

    /** A notification was tapped: its rows are read (the bell agrees). */
    static void opened(Context c, Intent intent) {
        if (intent == null) return;
        long[] ids = intent.getLongArrayExtra(EXTRA_IDS);
        String key = intent.getStringExtra(EXTRA_KEY);
        intent.removeExtra(EXTRA_IDS);
        intent.removeExtra(EXTRA_KEY);
        if (key != null) {
            SharedPreferences p = prefs(c);
            Set<String> shown = new HashSet<>(p.getStringSet("shown", new HashSet<>()));
            if (shown.remove(key)) p.edit().putStringSet("shown", shown).apply();
        }
        String token = prefs(c).getString("token", "");
        if (ids == null || ids.length == 0 || token.isEmpty()) return;
        EXEC.execute(() -> {
            HttpURLConnection conn = null;
            try {
                JSONArray list = new JSONArray();
                for (long id : ids) list.put(id);
                conn = open(c, "/api/notifications/read", token);
                conn.setRequestMethod("POST");
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                byte[] body = new JSONObject().put("ids", list).toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(body);
                }
                conn.getResponseCode();
            } catch (Exception e) {
                Log.w(TAG, "could not mark read", e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    /** Rows a person dealt with from the phone are read (the bell agrees). */
    static void markRead(Context c, long[] ids) {
        String token = prefs(c).getString("token", "");
        if (ids == null || ids.length == 0 || token.isEmpty()) return;
        HttpURLConnection conn = null;
        try {
            JSONArray list = new JSONArray();
            for (long id : ids) list.put(id);
            conn = open(c, "/api/notifications/read", token);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            byte[] body = new JSONObject().put("ids", list).toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body);
            }
            conn.getResponseCode();
        } catch (Exception e) {
            Log.w(TAG, "could not mark read", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** One decision sent from a notification button: {code, message} — the
     *  message is the server's own reason when it refused (its «detail»). */
    static String[] send(Context c, String method, String path, Object body) {
        String token = prefs(c).getString("token", "");
        if (token.isEmpty()) return new String[]{"401", ""};
        HttpURLConnection conn = null;
        try {
            conn = open(c, path, token);
            conn.setRequestMethod(method == null || method.isEmpty() ? "POST" : method.toUpperCase());
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            String json = body == null || body == JSONObject.NULL ? "{}" : body.toString();
            try (OutputStream out = conn.getOutputStream()) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) return new String[]{String.valueOf(code), ""};
            String msg = "";
            try (InputStream in = conn.getErrorStream()) {
                if (in != null) {
                    ByteArrayOutputStream buf = new ByteArrayOutputStream();
                    byte[] chunk = new byte[4096];
                    int n;
                    while ((n = in.read(chunk)) > 0 && buf.size() < 64 * 1024) buf.write(chunk, 0, n);
                    Object d = new JSONObject(buf.toString("UTF-8")).opt("detail");
                    if (d instanceof String) msg = (String) d;
                }
            } catch (Exception ignored) {
                // No readable reason: the code alone is reported.
            }
            return new String[]{String.valueOf(code), msg.isEmpty() ? "HTTP " + code : msg};
        } catch (Exception e) {
            Log.w(TAG, "decision not sent", e);
            return new String[]{"0", String.valueOf(e.getMessage())};
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** The bell was opened in the app: the phone's copies have done their job. */
    static void cancelAll(Context c) {
        NotificationManagerCompat.from(c).cancelAll();
        prefs(c).edit().remove("shown").apply();
    }

    // ─── showing one ────────────────────────────────────────────────────────

    private static boolean show(Context c, JSONObject item, String lang) {
        return render(c, item, lang, PushAction.OFFER, -1, null);
    }

    /**
     * Draws one feed line. {@code state} is where its Accept / Reject stands
     * ({@link PushAction}): OFFER (the buttons), ASK (the in-notification
     * confirm for {@code act}), BUSY, DONE (+ Undo where the server has one),
     * UNDONE, FAILED ({@code note} = the server's reason). Redrawing never
     * buzzes again.
     */
    @SuppressLint("MissingPermission") // allowed() was asked; a race is caught below
    static boolean render(Context c, JSONObject item, String lang, String state, int act, String note) {
        String key = item.optString("key");
        if (key.isEmpty()) return false;
        String category = item.optString("category", "other");
        String channel = channel(c, category, lang);
        String title = item.optString("title");
        String body = item.optString("body");
        String link = item.optString("link", "/notifications");
        if (!link.startsWith("/")) link = "/notifications";

        JSONArray idList = item.optJSONArray("ids");
        long[] ids = new long[idList == null ? 0 : idList.length()];
        for (int i = 0; i < ids.length; i++) ids[i] = idList.optLong(i);

        Intent open = new Intent(c, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse(MainActivity.ORIGIN + link))
                .putExtra(EXTRA_IDS, ids)
                .putExtra(EXTRA_KEY, key)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent tap = PendingIntent.getActivity(c, key.hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // On a locked screen: that something arrived, never what it says.
        NotificationCompat.Builder hidden = new NotificationCompat.Builder(c, channel)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setColor(BRAND)
                .setContentTitle("Safia IMS")
                .setContentText(Texts.get(lang, Texts.PUSH_PUBLIC));

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, channel)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setColor(BRAND)
                .setContentTitle(title)
                .setSubText(categoryLabel(category, lang))
                .setAutoCancel(true)
                .setContentIntent(tap)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(hidden.build());
        JSONArray acts = item.optJSONArray("actions");
        JSONObject a = acts != null && act >= 0 && act < acts.length() ? acts.optJSONObject(act) : null;
        String status = null;
        switch (state) {
            case PushAction.ASK:
                if (a != null) {
                    status = a.optString("ask");
                    b.addAction(0, a.optString("yes"), PushAction.intent(c, item, lang, PushAction.DO, act));
                    b.addAction(0, a.optString("cancel"), PushAction.intent(c, item, lang, PushAction.OFFER, -1));
                }
                break;
            case PushAction.BUSY:
                if (a != null) status = a.optString("busy");
                break;
            case PushAction.DONE:
                if (a != null) {
                    status = a.optString("done");
                    JSONObject undo = a.optJSONObject("undo");
                    if (undo != null) {
                        b.addAction(0, undo.optString("label"), PushAction.intent(c, item, lang, PushAction.UNDO, act));
                    }
                }
                break;
            case PushAction.UNDONE:
                JSONObject undo = a == null ? null : a.optJSONObject("undo");
                if (undo != null) status = undo.optString("done");
                break;
            case PushAction.FAILED:
                status = (a == null ? "" : a.optString("failed")) + (note == null || note.isEmpty() ? "" : ": " + note);
                break;
            default:
                for (int i = 0; acts != null && i < acts.length() && i < 3; i++) {
                    JSONObject o = acts.optJSONObject(i);
                    if (o == null) continue;
                    String next = o.optBoolean("confirm") ? PushAction.ASK : PushAction.DO;
                    b.addAction(0, o.optString("label"), PushAction.intent(c, item, lang, next, i));
                }
                break;
        }
        String text = status == null || status.isEmpty() ? body : (body.isEmpty() ? status : status + "\n" + body);
        if (!text.isEmpty()) {
            b.setContentText(status == null || status.isEmpty() ? body : status)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(text));
        }
        if (!PushAction.OFFER.equals(state)) b.setOnlyAlertOnce(true).setAutoCancel(false);
        long ts = item.optLong("ts", 0);
        if (ts > 0) b.setWhen(ts).setShowWhen(true);
        try {
            NotificationManagerCompat.from(c).notify(key, 1, b.build());
            return true;
        } catch (SecurityException e) {
            // Notifications were switched off between the check and now.
            return false;
        }
    }

    /** One channel per category, so Android's own settings can mute one kind. */
    private static String channel(Context c, String category, String lang) {
        String id = "notif_" + category;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            if (nm != null) {
                // Re-created with the same id only renames it — the language
                // picked on the site names the channels too.
                nm.createNotificationChannel(new NotificationChannel(
                        id, categoryLabel(category, lang), NotificationManager.IMPORTANCE_HIGH));
            }
        }
        return id;
    }

    private static String categoryLabel(String category, String lang) {
        for (int i = 0; i < CATS.length; i++) {
            if (CATS[i].equals(category)) return Texts.get(lang, Texts.CAT_FIRST + i);
        }
        return Texts.get(lang, Texts.CAT_FIRST + CATS.length - 1);
    }

    // ─── HTTP ───────────────────────────────────────────────────────────────

    private static HttpURLConnection open(Context c, String path, String token) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(MainActivity.ORIGIN + path).openConnection();
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(30_000);
        conn.setInstanceFollowRedirects(false);
        conn.setUseCaches(false);
        conn.setRequestProperty("Authorization", "Bearer " + token);
        conn.setRequestProperty("User-Agent", "SafiaIMS-Android/" + version(c));
        conn.setRequestProperty("Accept", "application/json");
        return conn;
    }

    private static String read(HttpURLConnection conn) throws IOException {
        try (InputStream in = conn.getInputStream()) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) > 0) {
                buf.write(chunk, 0, n);
                if (buf.size() > 512 * 1024) throw new IOException("answer too large");
            }
            return buf.toString("UTF-8");
        }
    }

    private static String version(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }
}
