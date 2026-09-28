import {
  Camera, ImagePlus, Settings2, CheckSquare, Lock, TimerOff, Clock, PencilLine, Loader2,
} from "lucide-react";
import { put } from "./checklistText";
import { showReason } from "../../utils/leaderReason";

/* What the «Chek-list» tab and its task sheet both need — states, groups,
 * deadlines, chips. A module of its own so the two files never import each
 * other. */

export const C_OK = "#22c55e", C_BAD = "#ef4444", C_WARN = "#eab308", C_WAIT = "#94a3b8";

// Which group a state belongs to — the one mapping both the list and the
// summary's bar read, so a count and the group it names can never disagree.
export const GROUP_OF = {
  open: "todo", draft: "todo",
  rejected: "rejected", autofail: "rejected",
  expired: "failed", notdone: "failed", missing: "failed", ruledout: "failed",
  pending: "checking",
  passed: "done", autopass: "done",
};
export const KIND_ICON = { camera: Camera, screenshot: ImagePlus, auto: Settings2, none: CheckSquare };

export const DISPUTE_OPEN = ["supervisor", "admin"];
export const clock = (iso) => (iso ? String(iso).slice(11, 16) : "");

/** «1 soat 20 daq» — how long until an instant, in the reader's words. */
export function leftText(ms, T) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return put(T.mins, { m });
  return put(T.hours, { h: Math.floor(m / 60), m: m % 60 });
}

/** The urgency of an open task's deadline — colour AND icon, never colour alone. */
export function urgency(task, now) {
  if (task.notStarted) return { color: "var(--text-4)", Icon: Lock };
  if (task.pastDue) return { color: C_BAD, Icon: TimerOff };
  const due = task.dueAt ? Date.parse(task.dueAt) : null;
  if (due == null) return { color: "var(--text-3)", Icon: Clock };
  const m = (due - now) / 60000;
  if (m <= 15) return { color: C_BAD, Icon: Clock };
  if (m <= 60) return { color: C_WARN, Icon: Clock };
  return { color: "var(--text-3)", Icon: Clock };
}

export const disputeChip = (d, T) => ({
  supervisor: { text: T.dSup, color: C_WARN }, admin: { text: T.dAdm, color: C_WARN },
  approved: { text: T.dOk, color: C_OK }, rejected: { text: T.dNo, color: C_BAD },
  cancelled: { text: T.dCancel, color: C_WAIT },
}[d?.status] || null);

export const lateChip = (p, T) => ({
  supervisor: { text: T.lSup, color: C_WARN }, admin: { text: T.lAdm, color: C_WARN },
  approved: { text: T.lOk, color: C_OK }, rejected: { text: T.lNo, color: C_BAD },
}[p?.status] || null);


/** What a row says under its name — one sentence, in the state's own words. */
export function rowMeta(task, T, now, perTask = true) {
  const kindCam = task.kind === "camera";
  switch (task.state) {
    case "open": {
      if (task.kind === "auto") {
        return { text: put(T.autoAt, { time: task.auto?.hour || task.closesAt }), color: "var(--text-3)" };
      }
      const u = urgency(task, now);
      const roll = kindCam && task.roll?.count
        ? `${put(T.camRoll, { k: task.roll.count, n: task.minMedia })} · ` : "";
      if (task.notStarted) {
        return { text: roll + put(T.opens, { time: clock(task.startsAt) }), color: u.color, Icon: u.Icon };
      }
      if (task.pastDue) return { text: roll + T.timeUp, color: u.color, Icon: u.Icon };
      const left = task.dueAt ? ` · ${put(T.left, { t: leftText(Date.parse(task.dueAt) - now, T) })}` : "";
      return { text: roll + put(T.by, { time: task.closesAt }) + left, color: u.color, Icon: u.Icon };
    }
    case "draft": {
      // A unit that still closes whole DAYS has no per-task submission: an
      // answered task is simply saved until the day is closed.
      if (!perTask) return { text: T.savedDay, color: "var(--text-3)", Icon: PencilLine };
      const left = task.dueAt && !task.pastDue
        ? ` · ${put(T.left, { t: leftText(Date.parse(task.dueAt) - now, T) })}` : "";
      return { text: T.draft + left, color: C_WARN, Icon: PencilLine };
    }
    case "pending":
      return { text: T.checking, color: C_WAIT, Icon: Loader2, spin: true };
    case "passed":
      return {
        text: task.admin?.done ? T.byAdmin
          : task.closedAt ? put(T.submittedAt, { time: clock(task.closedAt) }) : T.accepted,
        color: "var(--text-3)",
      };
    case "autopass":
      return { text: T.autoPassed, color: "var(--text-3)" };
    case "rejected":
      return { text: T.flagged, color: C_BAD };
    case "autofail":
      return { text: T.autoFailed, color: C_BAD };
    case "expired":
      return {
        text: showReason(task.reason, T.missedLine) || put(T.expired, { time: task.closesAt }),
        color: C_BAD,
      };
    case "notdone":
      return { text: task.reason ? `${T.notdone}: ${task.reason}` : T.notdone, color: "var(--text-3)" };
    case "missing":
      return { text: T.missing, color: "var(--text-3)" };
    case "ruledout":
      return { text: T.ruledout, color: "var(--text-3)" };
    default:
      return { text: "", color: "var(--text-3)" };
  }
}

