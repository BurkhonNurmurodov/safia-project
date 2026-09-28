package uz.safiacorporate.ims;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.browser.customtabs.CustomTabsCallback;
import androidx.browser.customtabs.CustomTabsIntent;

/**
 * android-browser-helper's launcher with two promises the library does not make
 * itself: the app never closes without showing anything, and it is never
 * crashed on purpose. Either failure opens the site in the browser instead —
 * with an address bar, but still the site — and is reported to the admins
 * through FailureReport.
 */
public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    private static final String TAG = "SafiaLauncher";

    /** How long the splash may stand before the browser counts as not answering. */
    private static final long LAUNCH_TIMEOUT_MS = 12_000;

    // The library's QualityEnforcer crashes the app when the browser reports that
    // the site failed its checks (an error page, offline, or assetlinks.json not
    // matching). To the person holding the phone that reads as "the app is broken",
    // while the page already shows what went wrong — so it is reported instead.
    private static final String QUALITY_CRASH = "quality_enforcement.crash";
    private static final String QUALITY_REASON = "crash_reason";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable watchdog = this::onLaunchStalled;

    @Override
    protected void launchTwa() {
        try {
            super.launchTwa();
        } catch (RuntimeException e) {
            Log.e(TAG, "launch failed", e);
            FailureReport.send(this, "launch failed", FailureReport.stackTrace(e));
            openInBrowser();
        }
    }

    @Override
    protected CustomTabsCallback getCustomTabsCallback() {
        // The browser keeps this for the whole session, long after this activity
        // has finished — so it holds the application, never the activity.
        final Context app = getApplicationContext();
        return new CustomTabsCallback() {
            @Override
            public Bundle extraCallbackWithResult(String callbackName, Bundle args) {
                if (QUALITY_CRASH.equals(callbackName)) {
                    String reason = args == null ? null : args.getString(QUALITY_REASON);
                    FailureReport.send(app, "browser quality check", String.valueOf(reason));
                }
                return Bundle.EMPTY;
            }
        };
    }

    // The watchdog runs only while this screen (the splash) is in front: the
    // browser covering it pauses the activity, and leaving it stops the clock.
    @Override
    protected void onResume() {
        super.onResume();
        handler.removeCallbacks(watchdog);
        if (!isFinishing()) handler.postDelayed(watchdog, LAUNCH_TIMEOUT_MS);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(watchdog);
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(watchdog);
        super.onDestroy();
    }

    private void onLaunchStalled() {
        if (isFinishing() || isDestroyed()) return;
        FailureReport.send(this, "browser did not open the site",
                "The splash stood for " + LAUNCH_TIMEOUT_MS / 1000
                        + " s and the browser never showed the site; opened it in the browser instead.");
        openInBrowser();
    }

    private void openInBrowser() {
        Uri url = getLaunchingUrl();
        try {
            new CustomTabsIntent.Builder().build().launchUrl(this, url);
        } catch (RuntimeException e) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (RuntimeException ignored) {
                // No browser at all: nothing on this phone can show a website.
            }
        }
        finish();
    }
}
