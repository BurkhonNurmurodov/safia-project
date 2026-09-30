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
    if (v === null || v === undefined || v === "") continue;
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

// «Sifat va shikoyatlar», «Brigadirlar» tab — one brigadir, by the name the
// register matched (`r.sup`, the unit's own name), over a date span.
export const qualityLink = ({ brigadir, from, to, status }) =>
  `/quality${query({ brigadir, from: isoDay(from), to: isoDay(to), status })}`;

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
