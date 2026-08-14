import { ShieldCheck, ShieldAlert, ShieldQuestion, Hourglass } from "lucide-react";

/* ONE vocabulary for "what has verification done to this?" — shared by the
 * register row, the day-report page, the detail modal and the filter.
 *
 * Four surfaces used to improvise their own words and colours for the same
 * five facts, so the very number a leader is judged by was described one way
 * in the table, another in the modal and a third in the DM. A person who
 * cannot tell whether two screens are saying the same thing stops trusting
 * both. Anything that shows verification state imports from here.
 *
 * Deliberately NOT the traffic-light score palette. A score is a measurement;
 * this is the state of a PROCESS, and painting "still checking" in the same
 * green that means "a good day" would make an unfinished check read as a pass.
 * Only `rejected` borrows the status red, because that one IS a failure.
 */

export const C_OK = "#22c55e";       // verified clean — the platform's green
export const C_REJ = "#ef4444";      // rejected — the platform's red
export const C_WARN = "#eab308";     // needs a human: disputed, or a tech error
export const C_WAIT = "#94a3b8";     // still checking — the "not started" grey

/** Every state carries an ICON as well as a colour: roughly 8% of men see
 *  colour differently, and a red dot beside a green dot is the whole message
 *  here. Never render one of these without its icon. */
export const VERIFY = {
  checking: { key: "checking", color: C_WAIT, Icon: Hourglass },
  verified: { key: "verified", color: C_OK, Icon: ShieldCheck },
  rejected: { key: "rejected", color: C_REJ, Icon: ShieldAlert },
  disputed: { key: "disputed", color: C_WARN, Icon: ShieldQuestion },
  error: { key: "error", color: C_WARN, Icon: ShieldQuestion },
};

/**
 * The state of a whole report, from the per-report AI counts `/api/leaders`
 * stamps on admin rows (`row.ai`) plus its own task list.
 *
 * Precedence is what the reader must act on first: a rejection outranks a
 * dispute outranks an unfinished check outranks a technical failure outranks
 * a clean pass. Returns null when verification has never touched this report,
 * which must render NOTHING — a report outside the automatic regime is not
 * "unverified", it is simply not in this process, and an empty-state icon on
 * every historical row would be noise pretending to be information.
 */
export function reportState(row) {
  const ai = row?.ai;
  if (!ai) return null;
  const rejected = (row.tasks || []).filter((t) => t.ai_rejected).length;
  if (rejected > 0) return { ...VERIFY.rejected, n: rejected };
  if (ai.pending > 0) return { ...VERIFY.checking, n: ai.pending };
  if (ai.error > 0) return { ...VERIFY.error, n: ai.error };
  if (ai.checked > 0) return { ...VERIFY.verified, n: ai.checked };
  return null;
}

/**
 * The state of ONE task on the day-report page. `t` is a task from
 * GET /api/leaders/report/:uid.
 *
 * A live dispute outranks the rejection it objects to: the number has not
 * changed yet, but what the reader should DO about it has.
 */
export function taskState(t) {
  if (t.dispute?.status === "pending") return VERIFY.disputed;
  if (t.ai_rejected) return VERIFY.rejected;
  if (t.review?.status === "error") return VERIFY.error;
  if (t.queued) return VERIFY.checking;
  if (t.review?.status === "ok" || t.review?.status === "flagged") return VERIFY.verified;
  return null;
}

/** Task display order on the day report: what failed comes first, what passed
 *  last. Thirteen tasks in catalog order put ten passes above the three
 *  failures, so the phone's first screen answered nothing. Ordering by outcome
 *  puts the answer at the top and keeps the evidence one scroll below it. */
export const GROUP_ORDER = ["rejected", "disputed", "error", "checking", "verified", "none"];

export function groupOf(t) {
  return taskState(t)?.key || "none";
}
