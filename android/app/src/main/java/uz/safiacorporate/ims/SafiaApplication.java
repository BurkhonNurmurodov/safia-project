package uz.safiacorporate.ims;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;

/**
 * Installs the crash reporter before any screen runs. Android shows nothing for
 * an app's first crash, so without this a crash on launch reads, to the person
 * holding the phone, as an icon that does nothing — which is what 1.0.0 did.
 *
 * Also counts the app's screens on display: while one is, a background check
 * for notifications (Push) shows nothing — the person is looking at the bell.
 */
public class SafiaApplication extends Application {
    private static volatile int started;

    static boolean inForeground() {
        return started > 0;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                FailureReport.sendBeforeDeath(this, "crash", error);
            } catch (Throwable ignored) {
                // The reporter must never replace the crash it reports.
            }
            if (previous != null) {
                previous.uncaughtException(thread, error);
            } else {
                System.exit(2);
            }
        });
        FailureReport.flushPending(this);
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override public void onActivityStarted(Activity a) { started++; }
            @Override public void onActivityStopped(Activity a) { started = Math.max(0, started - 1); }
            @Override public void onActivityCreated(Activity a, Bundle b) { }
            @Override public void onActivityResumed(Activity a) { }
            @Override public void onActivityPaused(Activity a) { }
            @Override public void onActivitySaveInstanceState(Activity a, Bundle b) { }
            @Override public void onActivityDestroyed(Activity a) { }
        });
    }
}
