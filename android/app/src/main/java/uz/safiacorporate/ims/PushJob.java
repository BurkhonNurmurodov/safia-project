package uz.safiacorporate.ims;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Android's job scheduler waking the app to check for notifications (Push). */
public class PushJob extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        Push.EXEC.execute(() -> {
            try {
                Push.poll(getApplicationContext(), false, 0);
            } finally {
                jobFinished(params, false);
            }
        });
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        // The next period asks again; nothing is lost by letting this one go.
        return false;
    }
}
