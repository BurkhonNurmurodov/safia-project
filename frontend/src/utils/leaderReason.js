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
const MISSED_REASON = /^__missed__\|(\d{2}:\d{2})$/;

export function showReason(raw, template) {
  const m = MISSED_REASON.exec(raw || "");
  return m ? String(template || "").replace("{time}", m[1]) : raw;
}

export default showReason;
