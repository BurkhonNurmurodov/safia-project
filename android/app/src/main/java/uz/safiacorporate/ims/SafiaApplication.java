package uz.safiacorporate.ims;

import android.app.Application;

/**
 * Installs the crash reporter before any screen runs. Android shows nothing for
 * an app's first crash, so without this a crash on launch reads, to the person
 * holding the phone, as an icon that does nothing — which is what 1.0.0 did.
 */
public class SafiaApplication extends Application {
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
    }
}
