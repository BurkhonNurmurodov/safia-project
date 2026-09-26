// Targets («Maqsadlar») — the arithmetic behind the goal board, in ONE place so
// the card, the table, the detail modal and the KPI strip can never state two
// different figures for one goal.
//
// A GOAL is a title with a period (start → due) and a list of KEY RESULTS
// («natijalar», the targets). Each target is one of five types and answers one
// question — how far from its start to its target is the current value — as a
// fraction 0..1. The goal's progress is the weighted mean of its targets, and
// its pace is judged against a LINEAR expectation over the goal's period, the
// rule /live already applies to a shift's plan: by day N of M, N/M of the way
// is «on track».
//
// Nothing here is a data source. The page keeps the goals as a JSON blob per
// profile (`/api/ui-prefs/targets_lab`) — this is a laboratory page and not a
// register yet, and the blob is what lets the screen be tried without a table.
import { GREEN, AMBER, RED } from "./statusBands";

export const TYPES = ["number", "percent", "currency", "boolean", "tasks"];
const NUMERIC = new Set(["number", "percent", "currency"]);
export const isNumeric = (type) => NUMERIC.has(type);

export const DIRECTIONS = ["up", "down"];

// A goal's AREA. Shown as an icon and a word (components/targets/targetsUi
// AREA_ICON), never as a colour: on this board colour means STATUS, and the
// categorical palette opens on red, green and yellow.
export const CATEGORIES = ["production", "quality", "people", "cost", "safety", "other"];

// Status is the traffic light — green / yellow / red — and «not started» is
// the platform's grey. Two greens on purpose: «achieved» and «on track» are
// both good news, told apart by the icon, not by inventing a fourth colour.
export const STATUSES = ["achieved", "on_track", "at_risk", "behind", "overdue", "not_started"];
export const GREY = "#94a3b8";
export const STATUS_COLOR = {
  achieved: GREEN, on_track: GREEN, at_risk: AMBER, behind: RED, overdue: RED, not_started: GREY,
};
// What needs attention first.
export const STATUS_RANK = { overdue: 0, behind: 1, at_risk: 2, on_track: 3, not_started: 4, achieved: 5 };
export const RISK_STATUSES = new Set(["at_risk", "behind", "overdue"]);

// The board is read in FOUR groups, most urgent first. «Needs attention» holds
// the three statuses that each want somebody to act; every card still wears
// its own chip, so the group never hides which of the three it is.
export const GROUPS = [
  { key: "attention", statuses: ["overdue", "behind", "at_risk"] },
  { key: "on_track", statuses: ["on_track"] },
  { key: "not_started", statuses: ["not_started"] },
  { key: "achieved", statuses: ["achieved"] },
];
export const groupOf = (st) => GROUPS.find((g) => g.statuses.includes(st))?.key ?? "on_track";

// Pace tolerance, in fractions of the whole goal: this far below the linear
// expectation is still «on track»; up to `risk` below it is «at risk»; more is
// «behind». Printed in the page legend, so a red card never has to be guessed.
export const PACE = { grace: 0.05, risk: 0.2 };

export const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

// ─── dates (ISO "YYYY-MM-DD", the browser's local day) ───────────────────────
const pad = (n) => String(n).padStart(2, "0");
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export const parseISO = (iso) => new Date(`${iso}T00:00:00`);
export const addDays = (iso, n) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
// b − a, in whole days.
export const dayDiff = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export const isISO = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

// «12 sen» / «12 sen 2025» — the year only when it is not this one.
export function fmtDate(iso, t, today = todayISO()) {
  if (!isISO(iso)) return "—";
  const [y, m, d] = iso.split("-");
  const mon = t(`cal.mg${parseInt(m, 10) - 1}`);
  return y === today.slice(0, 4) ? `${parseInt(d, 10)} ${mon}` : `${parseInt(d, 10)} ${mon} ${y}`;
}

// ─── numbers ─────────────────────────────────────────────────────────────────
export const clamp01 = (v) => Math.min(1, Math.max(0, v));

// A number the way a person types one: «43 200 000», «47,5», «−5». NaN when
// the text is not a number — never a silent 0, which is a real value here.
export function parseNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v ?? "")
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/\u2212/g, "-")
    .replace(",", ".");
  if (s === "" || s === "-" || s === ".") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
export const num = (v, fallback = 0) => {
  if (v === "" || v === null || v === undefined) return fallback;
  const n = parseNum(v);
  return Number.isFinite(n) ? n : fallback;
};
// The value an input box starts with: grouped like «43 200 000», a decimal
// comma — the shape the reader types it back in, so nothing reflows on focus.
export function fmtInput(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const [i, f] = String(Math.abs(n)).split(".");
  return (n < 0 ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (f ? `,${f}` : "");
}

const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
// «1 250» · «12,5» · «3 200 000» — thousands by a space, one decimal at most,
// and no decimal at all once the number is in the thousands.
export function fmtNumber(v, maxDecimals = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const d = Number.isInteger(n) || abs >= 1000 ? 0 : maxDecimals;
  const [int, frac] = abs.toFixed(d).split(".");
  const fr = frac ? frac.replace(/0+$/, "") : "";
  return (n < 0 ? "−" : "") + group(int) + (fr ? `,${fr}` : "");
}
export const fmtPct = (p) => `${Math.round(clamp01(p) * 100)}%`;

// A target's value in its own unit: «45%», «3 200 000 so'm», «51 daq», «120».
export function fmtValue(v, tg) {
  if (tg.type === "percent") return `${fmtNumber(v)}%`;
  if (tg.type === "currency") return `${fmtNumber(Math.round(num(v)))} ${tg.unit || "so'm"}`;
  return tg.unit ? `${fmtNumber(v)} ${tg.unit}` : fmtNumber(v);
}

// ─── shapes ──────────────────────────────────────────────────────────────────
export function newTarget(type = "number") {
  return {
    id: uid(), title: "", type, direction: "up",
    start: 0, current: 0, target: type === "percent" ? 100 : 0,
    unit: "", weight: 1, done: false, items: [], checkins: [],
  };
}

export function newGoal(today = todayISO()) {
  return {
    id: uid(), title: "", description: "", owner: "", category: "production",
    start: today, due: addDays(today, 30), createdAt: today, targets: [newTarget("number")],
  };
}

// A blob written by an older bundle, or by hand, still reads as goals: every
// field gets its default and nothing unknown is trusted to be the right shape.
export function normalizeTarget(raw) {
  const t = { ...newTarget(TYPES.includes(raw?.type) ? raw.type : "number"), ...(raw || {}) };
  t.id = t.id || uid();
  t.title = String(t.title ?? "");
  t.direction = DIRECTIONS.includes(t.direction) ? t.direction : (num(t.target) < num(t.start) ? "down" : "up");
  t.start = num(t.start);
  t.target = num(t.target);
  t.current = num(t.current, t.start);
  t.unit = String(t.unit ?? "");
  t.weight = Math.max(1, Math.min(3, Math.round(num(t.weight, 1)) || 1));
  t.done = !!t.done;
  // WHEN a yes/no result or a list item was marked done — what lets a goal's
  // progress be redrawn over time. Absent on rows saved before it existed.
  t.doneAt = t.done && isISO(t.doneAt) ? t.doneAt : null;
  t.items = Array.isArray(t.items)
    ? t.items.map((i) => ({
        id: i?.id || uid(), text: String(i?.text ?? ""), done: !!i?.done,
        doneAt: i?.done && isISO(i?.doneAt) ? i.doneAt : null,
      }))
    : [];
  t.checkins = Array.isArray(t.checkins)
    ? t.checkins
        .filter((c) => c && isISO(c.at))
        .map((c) => ({ id: c.id || uid(), at: c.at, value: num(c.value), note: String(c.note ?? "") }))
        .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    : [];
  return t;
}

export function normalizeGoal(raw) {
  const g = { ...newGoal(), targets: [], ...(raw || {}) };
  g.id = g.id || uid();
  g.title = String(g.title ?? "");
  g.description = String(g.description ?? "");
  g.owner = String(g.owner ?? "");
  g.category = CATEGORIES.includes(g.category) ? g.category : "other";
  g.start = isISO(g.start) ? g.start : null;
  g.due = isISO(g.due) ? g.due : null;
  g.targets = Array.isArray(g.targets) ? g.targets.map(normalizeTarget) : [];
  return g;
}

// ─── progress ────────────────────────────────────────────────────────────────
export const direction = (tg) => tg.direction ?? (num(tg.target) < num(tg.start) ? "down" : "up");

// 0..1 — how far from start to target the current value is. One formula for
// both directions: on a «decrease» target start > target, so the span is
// negative and a value moving down still counts up.
export function targetProgress(tg) {
  if (tg.type === "boolean") return tg.done ? 1 : 0;
  if (tg.type === "tasks") {
    const items = tg.items ?? [];
    if (!items.length) return 0;
    return items.filter((i) => i.done).length / items.length;
  }
  const start = num(tg.start), target = num(tg.target), cur = num(tg.current, start);
  const span = target - start;
  if (span === 0) return cur === target ? 1 : 0;
  return clamp01((cur - start) / span);
}

export const targetWeight = (tg) => Math.max(1, num(tg.weight, 1)) || 1;

export function goalProgress(goal) {
  const tgs = goal.targets ?? [];
  if (!tgs.length) return 0;
  let sw = 0, sp = 0;
  tgs.forEach((tg) => { const w = targetWeight(tg); sw += w; sp += w * targetProgress(tg); });
  return sw ? clamp01(sp / sw) : 0;
}

// Fraction of the goal's period that has passed — the linear expectation.
// null when the goal carries no period, so pace cannot be judged.
export function elapsed(goal, today = todayISO()) {
  if (!goal.start || !goal.due) return null;
  const total = dayDiff(goal.start, goal.due);
  if (total <= 0) return today >= goal.due ? 1 : 0;
  return clamp01(dayDiff(goal.start, today) / total);
}

// Days until the due date: negative once it has passed, null without one.
export function daysLeft(goal, today = todayISO()) {
  if (!goal.due) return null;
  return dayDiff(today, goal.due);
}

// Has anybody touched a target yet — a check-in, a ticked item, a done flag,
// or a current value that left its start.
export const targetStarted = (tg) =>
  (tg.checkins?.length ?? 0) > 0 || !!tg.done || (tg.items ?? []).some((i) => i.done)
  || (isNumeric(tg.type) && num(tg.current, num(tg.start)) !== num(tg.start));
export const goalStarted = (goal) => (goal.targets ?? []).some(targetStarted);

// The one status rule, shared by the goal and by each of its targets.
export function paceStatus(progress, goal, started, today = todayISO()) {
  if (progress >= 1) return "achieved";
  const left = daysLeft(goal, today);
  if (left !== null && left < 0) return "overdue";
  const e = elapsed(goal, today);
  // Untouched and early in its period: not started. Untouched half-way
  // through it is simply behind, which is the honest reading.
  if (progress === 0 && !started && (e === null || e <= PACE.grace)) return "not_started";
  if (e === null) return "on_track";
  const gap = e - progress;
  if (gap <= PACE.grace) return "on_track";
  if (gap <= PACE.risk) return "at_risk";
  return "behind";
}
export const goalStatus = (goal, today = todayISO()) =>
  paceStatus(goalProgress(goal), goal, goalStarted(goal), today);
export const targetStatus = (tg, goal, today = todayISO()) =>
  paceStatus(targetProgress(tg), goal, targetStarted(tg), today);

// Linear extrapolation of the pace so far: the fraction reached by the due
// date if nothing changes, and the day the goal would be reached on.
export function projection(goal, today = todayISO()) {
  const p = goalProgress(goal), e = elapsed(goal, today);
  if (e === null || e <= 0 || p <= 0) return { atDue: null, finish: null };
  if (p >= 1) return { atDue: 1, finish: null };
  const rate = p / e;
  const total = dayDiff(goal.start, goal.due);
  const daysNeeded = Math.ceil(total / rate);
  return { atDue: Math.min(rate, 9.99), finish: daysNeeded > 0 ? addDays(goal.start, daysNeeded) : null };
}

// Numeric targets only: how much is still to move, never negative.
export function remaining(tg) {
  if (!isNumeric(tg.type)) return null;
  const cur = num(tg.current, num(tg.start)), target = num(tg.target);
  return direction(tg) === "down" ? Math.max(0, cur - target) : Math.max(0, target - cur);
}
export function neededPerDay(tg, goal, today = todayISO()) {
  const r = remaining(tg);
  const left = daysLeft(goal, today);
  if (r === null || r <= 0 || left === null || left <= 0) return null;
  return r / left;
}

// ─── check-ins ───────────────────────────────────────────────────────────────
const byDate = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

export function applyCheckin(tg, { value, at, note = "" }) {
  const checkins = [...(tg.checkins ?? []), { id: uid(), at, value: num(value), note: String(note ?? "").trim() }]
    .sort(byDate);
  return { ...tg, checkins, current: checkins[checkins.length - 1].value };
}

// Dropping an entry puts the current value back on the latest one left (or
// the start, when none is left) — the value on screen is always a check-in.
export function removeCheckin(tg, id) {
  const checkins = (tg.checkins ?? []).filter((c) => c.id !== id).sort(byDate);
  return { ...tg, checkins, current: checkins.length ? checkins[checkins.length - 1].value : num(tg.start) };
}

export const lastCheckin = (tg) => {
  const cs = tg.checkins ?? [];
  return cs.length ? cs[cs.length - 1] : null;
};

// The value over time, seated on the goal's start: the sparkline's points as
// (days since the goal's start, value).
export function series(tg, goal) {
  const origin = goal.start || (tg.checkins?.[0]?.at) || todayISO();
  const pts = [{ x: 0, y: num(tg.start), at: origin }];
  (tg.checkins ?? []).forEach((c) => pts.push({ x: Math.max(0, dayDiff(origin, c.at)), y: c.value, at: c.at }));
  return pts;
}

// ─── progress over time ──────────────────────────────────────────────────────
// A result's progress AS OF a past day, rebuilt from what the blob records: a
// number's check-ins, and the day a yes/no or a list item was ticked. A tick
// with no recorded day (saved before `doneAt` existed) counts only from
// `today` — the one day we KNOW it was done — never back-dated to the start.
export function targetProgressAt(tg, day, today = todayISO()) {
  const doneBy = (flag, at) => !!flag && (at ? at <= day : day >= today);
  if (tg.type === "boolean") return doneBy(tg.done, tg.doneAt) ? 1 : 0;
  if (tg.type === "tasks") {
    const items = tg.items ?? [];
    if (!items.length) return 0;
    return items.filter((i) => doneBy(i.done, i.doneAt)).length / items.length;
  }
  const cs = (tg.checkins ?? []).filter((c) => c.at <= day);
  let value;
  if (cs.length) value = cs[cs.length - 1].value;
  // A current value typed in the form, with no check-in behind it, is only
  // known as of today.
  else value = day >= today ? num(tg.current, num(tg.start)) : num(tg.start);
  return targetProgress({ ...tg, current: value });
}

export function goalProgressAt(goal, day, today = todayISO()) {
  const tgs = goal.targets ?? [];
  if (!tgs.length) return 0;
  let sw = 0, sp = 0;
  tgs.forEach((tg) => { const w = targetWeight(tg); sw += w; sp += w * targetProgressAt(tg, day, today); });
  return sw ? clamp01(sp / sw) : 0;
}

// Every day something moved, from the goal's start to today: the points of
// its progress line. Sorted, unique, clipped to [start, today].
export function goalEventDays(goal, today = todayISO()) {
  const days = new Set();
  if (goal.start && goal.start <= today) days.add(goal.start);
  (goal.targets ?? []).forEach((tg) => {
    (tg.checkins ?? []).forEach((c) => days.add(c.at));
    if (tg.doneAt) days.add(tg.doneAt);
    (tg.items ?? []).forEach((i) => { if (i.doneAt) days.add(i.doneAt); });
  });
  days.add(today);
  return [...days]
    .filter((d) => (!goal.start || d >= goal.start) && d <= today)
    .sort();
}

export function goalHistory(goal, today = todayISO()) {
  return goalEventDays(goal, today).map((d) => ({ at: d, p: goalProgressAt(goal, d, today) }));
}

// The last day anybody recorded something on the goal — null when nothing
// ever was. What «updated 3 days ago» on a card reads.
export function lastActivity(goal) {
  let last = null;
  const see = (d) => { if (d && (!last || d > last)) last = d; };
  (goal.targets ?? []).forEach((tg) => {
    (tg.checkins ?? []).forEach((c) => see(c.at));
    see(tg.doneAt);
    (tg.items ?? []).forEach((i) => see(i.doneAt));
  });
  return last;
}

// Ticking a result or an item stamps the day; unticking clears it.
export const markDone = (on, day) => (on ? { done: true, doneAt: day } : { done: false, doneAt: null });

// ─── the KPI strip ───────────────────────────────────────────────────────────
export function summarize(goals, today = todayISO()) {
  const s = { total: goals.length, achieved: 0, onTrack: 0, risk: 0, notStarted: 0, avg: 0 };
  let sum = 0;
  goals.forEach((g) => {
    const st = goalStatus(g, today);
    if (st === "achieved") s.achieved += 1;
    else if (st === "on_track") s.onTrack += 1;
    else if (st === "not_started") s.notStarted += 1;
    else s.risk += 1;
    sum += goalProgress(g);
  });
  s.active = s.total - s.achieved;
  s.avg = goals.length ? sum / goals.length : 0;
  return s;
}

// «{n} kun qoldi» → «12 kun qoldi». The translation strings carry named
// slots; this is the one place they are filled.
export const fill = (s, vars) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), String(s));
