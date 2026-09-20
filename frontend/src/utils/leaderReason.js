/* A not-done task's `reason` is FREE TEXT the leader typed, in their own
 * language — except when nobody typed it. A task the deadline caught is stored
 * against a sentinel, `__missed__|HH:MM`, precisely because one fixed sentence
 * cannot read correctly for four different viewers: the column has to carry
 * either the leader's words or a message rendered per reader, and it cannot
 * carry both.
 *
 * Expanding it is therefore the READER's job, and this is the one place that
 * does it. It lived only inside Leaders.jsx until the admin day-detail modal
 * grew the same column and printed «__missed__|09:00» at an operator verbatim
 * (found by rendering it, 2026-08-27).
 *
 * `template` is the viewer's own translated sentence carrying `{time}`; the
 * hour stays 24-hour, because ru/uz never print AM/PM. Anything that is not
 * the sentinel is a real typed reason and passes through untouched.
 */
/* From 2026-09-20 there is a SECOND sentinel, for the same reason and with the
 * same rule: `__auto__|HH:MM|code` marks a task the PLATFORM answered by
 * reading its own data at a fixed hour (services/leader_auto.py). It carries
 * one fact more than the missed one — WHY it went the way it did — because an
 * automatic verdict nobody can argue with has to at least say what it looked
 * at. The code is a stable key and the words are the reader's own, exactly as
 * the hour is.
 *
 * `auto` is `{ template, why }`: the viewer's sentence carrying `{time}` and
 * `{why}`, and a lookup from the code to the viewer's words. A caller that
 * passes none gets the bare code, which is still readable — never the raw
 * sentinel, which is the regression this module exists to prevent.
 */
const MISSED_REASON = /^__missed__\|(\d{2}:\d{2})$/;
const AUTO_REASON = /^__auto__\|(\d{2}:\d{2})\|([a-z_]*)$/;

export function showReason(raw, template, auto) {
  const s = raw || "";
  const m = MISSED_REASON.exec(s);
  if (m) return String(template || "").replace("{time}", m[1]);
  const a = AUTO_REASON.exec(s);
  if (a) {
    const why = (auto && auto.why && auto.why(a[2])) || a[2];
    return String((auto && auto.template) || "{time} · {why}")
      .replace("{time}", a[1])
      .replace("{why}", why);
  }
  return raw;
}

export default showReason;
