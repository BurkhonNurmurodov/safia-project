// The notification centre's vocabulary — icons, words and the small
// formatters the bell, the queue rows, the feed rows and /notifications share.
// ONE file, so the popover and the page can never describe one notification
// two ways. The backend twin is services/notification_center.py (categories,
// folding, links) and services/notif_queue.py (what is waiting on whom).
import {
  ArrowLeftRight, CalendarCheck, CalendarClock, Clock, FileCheck2,
  GraduationCap, ListChecks, ListTodo, Megaphone, MessageSquareWarning,
  PencilLine, Scale, Timer, Trash2, UserCog,
} from "lucide-react";
import { shortPerson } from "../../utils/personName";

// Same order as notification_center.CATEGORIES — the settings list and the
// page filter both read it.
export const CATEGORIES = [
  "approvals", "day", "concerns", "tasks", "checklist", "appeals", "idle",
  "learning", "other",
];

// A category is told apart by its ICON and never by colour: colour on these
// rows means status only (the platform rule — see the action register).
export const CATEGORY_ICON = {
  approvals: FileCheck2, day: CalendarCheck, concerns: MessageSquareWarning,
  tasks: ListTodo, checklist: ListChecks, appeals: Scale, idle: Timer,
  learning: GraduationCap, other: Megaphone,
};

// Same order as notif_queue.KIND_ORDER — the page lists its sections so.
export const QUEUE_KINDS = [
  "hr_doc", "live_doc", "edit_batch", "live_batch", "edit_request", "late_day",
  "dispute", "late_proof", "concern", "task",
];

// The /staff-live twins of hr_doc and edit_batch — the same record over the
// live Verifix read, told apart by a «Jonli» tag on the row, never by colour.
export const LIVE_KINDS = { live_doc: "hr_doc", live_batch: "edit_batch" };
export const isLiveKind = (kind) => kind in LIVE_KINDS;

const QUEUE_ICON = {
  edit_batch: Trash2, live_batch: Trash2, edit_request: PencilLine, late_day: CalendarClock,
  dispute: Scale, late_proof: Clock, concern: MessageSquareWarning, task: ListTodo,
};

export const queueIcon = (item) =>
  item.kind === "hr_doc" || item.kind === "live_doc"
    ? (item.fields?.doc_type === "role_change" ? UserCog : ArrowLeftRight)
    : (QUEUE_ICON[item.kind] || Clock);

// A notification's own tone is a status — the icon wears it; «info» stays
// neutral, which is nine rows in ten.
export const TONE_INK = {
  success: "var(--status-ok)",
  warning: "var(--status-warn)",
  error: "var(--status-bad)",
};

export const fmt = (str, vars = {}) =>
  String(str ?? "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? vars[k] === 0 ? String(vars[k]) : m));

// «28.09» — the platform's day.month, the year only when it is not this one.
export function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  if (!y || !m || !d) return String(iso);
  return y === String(new Date().getFullYear()) ? `${d}.${m}` : `${d}.${m}.${y}`;
}

export function timeAgo(iso, t, now = Date.now()) {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return t("notif.timeAgo.s");
  if (s < 3600) return fmt(t("notif.timeAgo.m"), { n: Math.floor(s / 60) });
  if (s < 86400) return fmt(t("notif.timeAgo.h"), { n: Math.floor(s / 3600) });
  return fmt(t("notif.timeAgo.d"), { n: Math.floor(s / 86400) });
}

// «Bugun» · «Kecha» · «28 sentabr» — `today` is the PLANT's date, served by the
// backend, so a phone set to another zone files rows under the right day.
export function dayLabel(day, today, t) {
  if (!day) return "";
  if (day === today) return t("notif.today");
  const prev = new Date(`${today}T12:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  if (day === prev.toISOString().slice(0, 10)) return t("notif.yesterday");
  const [y, m, d] = day.split("-").map(Number);
  const label = `${d} ${t(`cal.mg${m - 1}`)}`;
  return y === Number(today.slice(0, 4)) ? label : `${label} ${y}`;
}

// The stored bodies separate facts with « | » and open with a quoted line plus
// a blank one — a contract with the Telegram renderer. Here they are read back
// as calm lines: « · » between facts, no blank line for a 2-line preview to
// spend itself on.
export const displayBody = (body) =>
  String(body ?? "").replace(/ \| /g, " · ").replace(/\n{2,}/g, "\n").trim();

// The reason a request failed, in words — never a status code.
export function errText(e, t) {
  const d = e?.response?.data?.detail;
  if (typeof d === "string" && d.trim()) return d;
  return t("notif.actionFailed");
}

const lateText = (min, t) => {
  if (min == null) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? fmt(t("notif.q.hours"), { h, m }) : fmt(t("notif.q.minutes"), { m });
};

const pick = (names, lang) =>
  names ? (names[lang] || names.uz || names.ru || names.en || "") : "";

// A handful of names → «K. Dilnoza, O. Islom va yana 3». People go through
// their name rules (`tl`, then the platform's one shortening); anything else —
// an exchange's destination task, a job title — is ordinary text (`tx`).
export function nameList(names, { t, tl, tx, people = true, max = 3 }) {
  const list = (names || []).filter(Boolean);
  if (!list.length) return "";
  const spell = people ? (n) => shortPerson(tl(n)) || tl(n) : (n) => tx(n);
  const shown = list.slice(0, max).map(spell).join(", ");
  return list.length > max ? `${shown} ${fmt(t("notif.andMore"), { n: list.length - max })}` : shown;
}

/**
 * What one queue item says: {title, sub, subTone, quote, meta[], urgent, tag}.
 * Names go through `tl` (people) and every other stored text through `tx`,
 * the platform's split — English spells NAMES only. `tag` is the «Jonli» mark
 * a /staff-live twin wears beside its title (the live kinds render exactly as
 * the /staff kind they mirror, with that one addition).
 */
export function queueText(item, { t, tl, tx, lang }) {
  const f = item.fields || {};
  const meta = [];
  const push = (v) => { if (v) meta.push(v); };
  let title = "", sub = "", quote = "", urgent = false, subTone = null;
  const tag = isLiveKind(item.kind) ? t("notif.q.live") : "";
  switch (item.kind) {
    case "hr_doc":
    case "live_doc":
      title = f.doc_type === "role_change"
        ? fmt(t("notif.q.roleChange"), { n: f.count, role: tx(f.new_role || "—") })
        : fmt(t("notif.q.exchange"), {
          n: f.count,
          target: f.target ? tl(f.target) : (f.task ? `«${tx(f.task)}»` : "—"),
        });
      push(f.by ? fmt(t("notif.q.sentBy"), { by: tl(f.by) }) : "");
      if (f.unit && f.unit !== f.by) push(tl(f.unit));
      push(fmtDate(f.date));
      push(f.time);   // a live move's clock («09:30–12:00»); blank = the whole day
      if (f.stale_days != null) {
        sub = fmt(t("notif.q.stale"), { n: f.stale_days, max: f.stale_max });
        subTone = "warn";
      }
      break;
    case "edit_batch":
    case "live_batch":
      title = fmt(t("notif.q.deletion"), { n: f.count });
      quote = nameList(f.workers, { t, tl, tx });
      push(tl(f.unit));
      push(fmtDate(f.date));
      break;
    case "edit_request":
      title = fmt(t("notif.q.edit"), { worker: tl(f.worker || "—") });
      push(tl(f.unit));
      push(fmtDate(f.date));
      break;
    case "late_day":
      title = fmt(t("notif.q.lateDay"), { leader: tl(f.leader || "—") });
      quote = f.reason ? tx(f.reason) : "";
      push(tl(f.unit));
      push(fmtDate(f.date));
      break;
    case "dispute":
      title = fmt(t("notif.q.dispute"), { leader: tl(f.leader || "—") });
      sub = f.stage === "admin" ? t("notif.q.stageAdmin") : t("notif.q.stageSupervisor");
      quote = f.reason ? tx(f.reason) : "";
      push(pick(f.task, lang) ? `№${f.task_id} ${pick(f.task, lang)}` : "");
      push(tl(f.unit));
      push(fmtDate(f.date));
      break;
    case "late_proof":
      title = fmt(t("notif.q.lateProof"), { leader: tl(f.leader || "—") });
      sub = f.late_min != null ? fmt(t("notif.q.lateBy"), { t: lateText(f.late_min, t) }) : "";
      quote = f.reason ? tx(f.reason) : "";
      push(pick(f.task, lang) ? `№${f.task_id} ${pick(f.task, lang)}` : "");
      push(tl(f.unit));
      push(fmtDate(f.date));
      break;
    case "concern":
      title = fmt(t("notif.q.concern"), { no: f.no });
      quote = f.text ? tx(f.text) : "";
      push(tl(f.leader || f.owner || ""));
      push(f.cell);
      break;
    case "task":
      title = tx(f.text || "");
      urgent = !!f.urgent;
      push(f.due ? fmt(t("notif.q.due"), { date: fmtDate(f.due) }) : "");
      push(tl(f.by || ""));
      break;
    default:
      title = item.kind;
  }
  return { title, sub, subTone, quote, meta, urgent, tag };
}

/** The headline of a feed entry. A folded group's («Yopilgan kunlar: 15 ta»)
 *  is written by the server (notification_center.FOLD_TITLES), in the
 *  viewer's language, so the bell and the Android app's phone notifications
 *  say one thing. */
export function entryTitle(entry) {
  return entry.title;
}
