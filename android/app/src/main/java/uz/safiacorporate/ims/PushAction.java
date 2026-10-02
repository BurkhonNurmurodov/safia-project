package uz.safiacorporate.ims;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;


import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The Accept / Reject buttons on a phone notification (CLAUDE.md «Phone
 * notifications»). The server names the buttons with the very endpoints,
 * rights and confirm rules the bell's queue uses (notification_center
 * `_push_decisions`); this only carries the tap there with the app's own
 * session. A decision that cannot be undone asks first — inside the
 * notification, since a notification cannot open a dialog: the buttons turn
 * into «yes» / «cancel». The server's refusal is printed on the notification.
 */
public class PushAction extends BroadcastReceiver {
    static final String OFFER = "offer";
    static final String ASK = "ask";
    static final String DO = "do";
    static final String BUSY = "busy";
    static final String DONE = "done";
    static final String UNDO = "undo";
    static final String UNDONE = "undone";
    static final String FAILED = "failed";

    private static final String EXTRA_ITEM = "push_item";
    private static final String EXTRA_LANG = "push_lang";
    private static final String EXTRA_STATE = "push_state";
    private static final String EXTRA_ACT = "push_act";

    static PendingIntent intent(Context c, JSONObject item, String lang, String state, int act) {
        Intent i = new Intent(c, PushAction.class)
                .putExtra(EXTRA_ITEM, item.toString())
                .putExtra(EXTRA_LANG, lang)
                .putExtra(EXTRA_STATE, state)
                .putExtra(EXTRA_ACT, act);
        int code = (item.optString("key") + "|" + state + "|" + act).hashCode();
        return PendingIntent.getBroadcast(c, code, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        Context c = context.getApplicationContext();
        JSONObject item;
        try {
            item = new JSONObject(intent.getStringExtra(EXTRA_ITEM));
        } catch (Exception e) {
            return;
        }
        String lang = intent.getStringExtra(EXTRA_LANG);
        String state = intent.getStringExtra(EXTRA_STATE);
        int act = intent.getIntExtra(EXTRA_ACT, -1);
        if (OFFER.equals(state) || ASK.equals(state)) {
            Push.render(c, item, lang, state, act, null);
            return;
        }
        JSONArray acts = item.optJSONArray("actions");
        JSONObject a = acts == null ? null : acts.optJSONObject(act);
        if (a == null) return;
        boolean undo = UNDO.equals(state);
        JSONObject target = undo ? a.optJSONObject("undo") : a;
        if (target == null) return;
        Push.render(c, item, lang, BUSY, act, null);
        PendingResult pending = goAsync();
        Push.EXEC.execute(() -> {
            try {
                String[] res = Push.send(c, target.optString("method"), target.optString("url"),
                        undo ? null : a.opt("body"));
                int code = Integer.parseInt(res[0]);
                if (code >= 200 && code < 300) {
                    Push.render(c, item, lang, undo ? UNDONE : DONE, act, null);
                    if (!undo) Push.markRead(c, ids(item));
                } else {
                    Push.render(c, item, lang, FAILED, act, res[1]);
                }
            } catch (Exception e) {
                Push.render(c, item, lang, FAILED, act, String.valueOf(e.getMessage()));
            } finally {
                pending.finish();
            }
        });
    }

    private static long[] ids(JSONObject item) {
        JSONArray list = item.optJSONArray("ids");
        long[] out = new long[list == null ? 0 : list.length()];
        for (int i = 0; i < out.length; i++) out[i] = list.optLong(i);
        return out;
    }
}
