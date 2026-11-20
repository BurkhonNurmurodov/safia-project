// Links that open a page ON a scope — the brigadir, the day, the statuses a
// figure was counted over — so the number somebody pressed reads the same on
// the page it comes from. First caller: the «Smena hisoboti» board
// (components/overview/ShiftReportTable.jsx), whose four cells each open their
// source page (the operator's directive, 2026-09-30).
//
// This file owns the URL half — which params each page understands. The page
// owns the other half: it reads them with `hooks/useUrlScope.js` into its own
// saved filters, clearing every filter the link does not name, so the page
// shows exactly the linked scope. Change a param here and in the page's reader
// together.
import { ALL_TIME_FROM, localISO } from "../components/ui/DateRangePicker";

// What is still «unresolved» in the quality register: Quality.jsx's ACTIONABLE
// minus «done» — its OPEN_STATES. «не требуется мера» is not work anybody owes,
// so it is neither resolved nor unresolved.
export const QUALITY_UNRESOLVED = ["open", "waiting", "repeat"];
// An OPEN concern: the two statuses the board counts
// (backend/app/services/shift_report.py OPEN_CONCERN).
export const CONCERN_OPEN = ["todo", "doing"];

const query = (params) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    // An empty list names nothing — never a bare «key=».
    if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue;
    q.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
};

const isoDay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null);
// A comma list, kept only where every entry is one the page knows.
export const listParam = (q, key, allowed) => {
  const raw = (q.get(key) || "").split(",").map((s) => s.trim()).filter(Boolean);
  return raw.length && raw.every((s) => allowed.includes(s)) ? raw : null;
};
export const dayParam = (q, key) => isoDay(q.get(key));

// «Zagruzka fayli» — one unit on one day, on its dashboard («zagruzka») or its
// «Odamlar soni» tab («people»).
export const productionLink = ({ unit, date, tab }) =>
  `/production${query({ unit, date: isoDay(date), tab })}`;

// «Verifix to'g'irlash» — one unit's day, on its Workers tab by default
// (`readStaffLink` in pages/Staff.jsx reads tab / unit / date). First caller:
// the board's «Davomat» column (components/overview/ShiftReportTable.jsx).
export const staffLink = ({ unit, date, tab = "workers" }) =>
  `/staff${query({ tab, unit, date: isoDay(date) })}`;

// «Sifat va shikoyatlar», «Brigadirlar» tab — one brigadir, by the name the
// register matched (`r.sup`, the unit's own name), over a date span.
// `hair: "with"` opens it «Soch bilan» (the board's with-hair lane); without
// it the page lands «Sochsiz», as it always did. With no `brigadir`, `from` +
// `to` alone open the whole register over the span, and `shift` narrows it to
// one shift («Hisobotlar»'s figures). ONE brigadir only: the page's chain is
// single-pick, so it has no way to stand on two.
export const qualityLink = ({ brigadir, from, to, status, hair, shift }) =>
  `/quality${query({ brigadir, from: isoDay(from), to: isoDay(to), status, hair, shift })}`;

// «Xavotirlar» — one brigadir's unit, at one level, in the given statuses,
// over «Barcha vaqt»: the board's count has no period, so nothing narrower
// could show all of it.
export const concernsLink = ({ unit, level, status }) =>
  `/concerns${query({ unit, level, status, from: ALL_TIME_FROM, to: localISO(new Date()) })}`;

// «2026-09» → the month's first and last day, the last clamped to today: the
// quality register holds no future record, and the page's picker stops at today.
export const monthSpan = (ym) => {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const last = new Date(y, mo, 0).getDate();
  const end = `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}`;
  const from = `${m[1]}-${m[2]}-01`;
  const today = localISO(new Date());
  // A browser whose clock is still in the previous month (the server counted on
  // the plant's) gets the whole month rather than a span that ends before it
  // starts.
  return { from, to: end < today ? end : today < from ? end : today };
};

// ── «Hisobotlar» — a figure opens the page it is read from ──────────────────
// (the operator, 2026-11-20). `scope` is what the report read the figure over:
// `from` / `to` — a month's days, the running month's so far — plus the
// report's own `shift` and `units` (the brigadirs it is narrowed to, by unit
// id). Which figure opens which page is `components/reports/figureLinks.js`.

// The pages on the SHARED filters (context/FilterContext.jsx) speak the
// provider's own params — `date_from`, `date_to`, `shift`, `manager_id` — which
// it adopts from a pressed link and a fresh tab alike. `extra` are the page's
// own, read by its `useUrlScope` and dropped.
const shared = ({ from, to, shift, units } = {}, extra = {}) => {
  const q = new URLSearchParams();
  if (isoDay(from) && isoDay(to)) {
    q.set("date_from", from);
    q.set("date_to", to);
  }
  if (shift) q.set("shift", String(shift));
  for (const id of units || []) q.append("manager_id", String(id));
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
};
// What a page on the shared filters reads back for its OWN brigadir pick.
export const idsParam = (q, key) => {
  const ids = q.getAll(key).flatMap((v) => v.split(",")).map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length ? ids : null;
};
export const shiftParam = (q, key = "shift") => {
  const n = Number(q.get(key));
  return n === 1 || n === 2 ? n : null;
};

// «Zagruzka foizi» and «Odam soni · Davomat» keep nothing of their own that
// the scope would have to clear.
export const zagruzkaLink = (scope) => `/zagruzka${shared(scope)}`;
export const attendanceLink = (scope) => `/workers/attendance${shared(scope)}`;
// «Plan Bajarish» — its overview, its own brigadir pick set to the scope's.
export const planLink = (scope) => `/plan${shared(scope, { tab: "overview" })}`;
// «Ojidaniya» — «Tahlil», or «Xarajat» (which keeps a period of its own and
// is given the same one).
export const downtimeLink = (scope, view = "analysis") => `/downtime${shared(scope, { view })}`;

// «Xavotirlar» over a span — every level and status, the scope's units.
export const concernsSpanLink = ({ from, to, shift, units }) =>
  `/concerns${query({ from: isoDay(from), to: isoDay(to), shift, units })}`;

// «Liderlar KPI» — one tab, one month («2026-11»).
export const leadersKpiLink = ({ tab, month, shift, units }) =>
  `/leaders-kpi${query({ tab, month, shift, brig: units })}`;

// «O'z vaqtida yetkazish» over a span (the sheet names no brigade or shift).
export const ontimeLink = ({ from, to }) =>
  `/ontime${query({ from: isoDay(from), to: isoDay(to) })}`;

// «ARC» — the register («Barcha so'rovlar») over the days the tickets were
// filed, on one shift and the brigadirs named (unit ids); IT's register knows
// no plant.
export const arcLink = ({ from, to, shift, units }) =>
  `/arc${query({ from: isoDay(from), to: isoDay(to), shift, sups: units })}`;
