/**
 * «Kelish ro'yxati» — the T11 staff list on the platform (`/kelish`), read as a
 * WEEK REGISTER (from 2026-09-29, the operator's directive).
 *
 * One list per CELL per shift-day: every worker the ORIGINAL Verifix upload
 * filed under the cell in the last 30 days, and beside each name whether they
 * are coming. The page lays a calendar week (Monday → Sunday — this week by
 * default, ‹ › step a week) across those lists like the spreadsheet it
 * replaced (2026-09-30, the operator: «more like the Excel»): names down the
 * left, one column per day, and EVERY cell the same size — an open day is
 * never wider than the rest. The answer is the cell's own fill —
 *
 *   green ✓   «Keladi»            red ✗   «Kelmaydi»
 *   white     on the list, no answer (brand-tinted where it can be tapped)
 *   grey      no slot: not on that day's list, or a day not opened yet
 *
 * Only TODAY and TOMORROW (the unit's shift-day frame) are open: their headers
 * are marked, their empty cells tinted, and a tap cycles a cell
 * empty → green → red → empty (the operator's call). The rest of the week is
 * the record, read-only. «+» and «−» at the table's foot change who is on the
 * list, permanently, from today on. Tapping a NAME opens that worker's week —
 * who marked each day and when — which the grid does not print.
 *
 * The page lists every cell in scope as an ACCORDION card — the /idle-cell
 * shape (the operator's call, 2026-09-30): the head names the cell (code, its
 * leader, how far its next list is filled) and a tap opens that cell's week
 * under it. One cell, or a leader's few, open by themselves.
 *
 * Deliberately quiet (the same ruling): one line per name, a two-line day
 * header, one total per day under the rows, one legend line. Who set a mark,
 * the shift's clock and a worker's absences live in tooltips and the worker
 * card; an absence is printed under the name only while choosing whom to
 * remove, which is the moment it matters.
 *
 * The server decides every one of those questions and ships the answers
 * (`days[].state / editable / when`, `can_edit`, `this_week`), so the page
 * derives nothing from the viewer's role or the browser's clock. Rules and
 * scope: backend `services/kelish.py` + `routers/kelish.py`.
 *
 * NOTHING above the rows may change size because of a tap (the operator's
 * rule): the totals row sits UNDER the rows, the legend in the footer.
 *
 * Page key `kelish` — admin-only until the operator opens it. Checklist task
 * #11 is untouched: nothing here scores anything.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check, ChevronDown, Clock, Lock, Minus, Plus, Undo2, UserCheck, UserMinus, UserPlus, Users, X,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard from "../components/ui/DataTable";
import Button from "../components/ui/Button";
import CellIdent from "../components/ui/CellIdent";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import DayStepper from "../components/ui/DayStepper";
import EmptyState from "../components/ui/EmptyState";
import FormField from "../components/ui/FormField";
import Modal from "../components/ui/Modal";
import { FilterPanel, PickFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useToast } from "../components/ui/Toast";
import { useFactory, useFactoryParams } from "../context/FactoryContext";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { cellLabel } from "../utils/cellName";
import { shortPerson } from "../utils/personName";
import { TONE_HEX, toneFill } from "../utils/statusBands";
import { transliterate, useTranslit } from "../utils/transliterate";
import api from "../utils/api";

const NONE = "none";          // the «cells with no brigadir» bucket
const WINDOW_DAYS = 30;       // services/kelish.WINDOW_DAYS
const RED = TONE_HEX.bad;
const NO_PARAMS = {};

// The two answers, painted as the platform paints every heatmap cell: the hue
// at full saturation with the ink `contrastText` picks for it (dark on green,
// white on red), so a cell reads the same on both themes.
const FILL = { yes: toneFill("ok"), no: toneFill("bad") };
// Where a cell holds no slot at all.
const OFF = { background: "var(--bg-inner)" };
// A closed day's listed cell nobody answered prints «—», the totals row's own
// blank — so a gap in the record is never the same flat colour as «not on that
// day's list», and never a hollow box that reads as an unticked checkbox.
const DASH = <span aria-hidden="true" className="text-xs leading-none" style={{ color: "var(--text-3)" }}>—</span>;
// An open day's unanswered cell: a brand wash that says «tap here». In the grid
// `.kelish-hit.is-empty` adds a dashed slot inside it (index.css), so an open
// empty cell never reads as the flat grey of «no slot».
const LANE = { background: "rgba(var(--brand-rgb), 0.12)" };
const SLOT_EDGE = "1px dashed var(--brand)";
// The open days' header, opaque because the header row is sticky.
const LANE_HEAD = "linear-gradient(rgba(var(--brand-rgb), 0.14), rgba(var(--brand-rgb), 0.14)), var(--bg-inner)";

// The grid's geometry, named ONCE: every day column is --kd wide and every row
// ROW_H high (44px under a finger, 40px under a mouse), so all cells are one
// size. The whole week always fits the card —
// it never scrolls sideways: 7 × 26px on a 320px phone (~104px left for the
// name, the surname at 12px), 32px to 400px (~120px at 375), 36px on the larger phones, then the
// days widen with the screen and the name column keeps roughly 250–400px.
const GRID = "[--kd:32px] max-[359px]:[--kd:26px] min-[400px]:[--kd:36px] sm:[--kd:60px] lg:[--kd:72px] xl:[--kd:88px]";
// The name cell's inset: tighter below 360px, where every pixel goes to the surname.
const NAME_PAD = "px-2 max-[359px]:px-1.5 sm:px-3";
const ROW_H = "h-11 sm:pointer-fine:h-10";
const NAME_H = "min-h-11 sm:pointer-fine:min-h-10";
// «+» / «−»: the 38px toolbar square, 44px on a phone.
const ICON_BTN = "w-[38px] h-[38px] px-0 justify-center max-sm:w-11 max-sm:h-11";
// The table scrolls with the page (`pageScroll`), so its sticky header and
// totals row stick to Layout's <main>, reaching past its padding. The totals
// row also stands clear of a phone's home indicator, and paints the band under
// itself so no row shows through there.
const STICK_TOP = { top: "calc(var(--main-pad, 0px) * -1)" };
const STICK_BOTTOM = {
  position: "sticky", zIndex: 10, background: "var(--bg-card)",
  bottom: "calc(var(--tg-safe-bottom, 0px) - var(--main-pad, 0px))",
  boxShadow: "inset 0 1px 0 var(--border-md), 0 var(--tg-safe-bottom, 0px) 0 0 var(--bg-card)",
};

const fill = (s, params) =>
  Object.entries(params || {}).reduce((out, [k, v]) => out.split(`{${k}}`).join(String(v ?? "")), s);

// "2026-09-28" + 6 → "2026-10-04", on the calendar alone (no zone can shift it).
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// "2026-09-29" → "29.09"
const dm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
// Monday = 0 … Sunday = 6, the `cal.d*` order.
const dow = (iso) => (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
const dayLabel = (iso, t) => `${t(`cal.d${dow(iso)}`)} ${dm(iso)}`;

// The file spells names in capitals («RUSTAMOV XURSHIDBEK BAXTIYOR O'G'LI»);
// read in sentence-case they are far quicker to scan. Only the first letter of
// each word is raised, so «O'G'LI» reads «O'g'li».
const titleCase = (s) =>
  String(s || "").toLocaleLowerCase().replace(/(^|[\s-])(\S)/gu, (_, a, b) => a + b.toLocaleUpperCase());

// A cell as the page names it in a title: its code, and beside it its leader
// cut to surname + first name (utils/cellName.js).
const cellTitleOf = (c, tl) => cellLabel(
  c.code,
  c.leader ? titleCase(tl(c.leader)).split(" ").filter(Boolean).slice(0, 2).join(" ") : "",
);

// Script- and apostrophe-blind folding for matching a typed name against the
// removed list — a leader may type Cyrillic on a Latin list.
const fold = (s) =>
  transliterate(String(s || ""), "uz").toLowerCase().replace(/[ʻʼ'’‘`]/g, "").replace(/\s+/g, " ").trim();

// When a mark was set, on the PLANT's clock whatever zone the reader sits in.
let STAMP = null;
try {
  STAMP = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
} catch { /* an engine without zone data prints no time rather than a wrong one */ }
const stamp = (iso) => {
  if (!iso || !STAMP) return "";
  try {
    const p = Object.fromEntries(STAMP.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    return `${p.day}.${p.month} ${p.hour}:${p.minute}`;
  } catch {
    return "";
  }
};

function whenText(w, t) {
  if (!w) return "";
  const f = (k) => fill(t(k), { start: w.start, end: w.end });
  switch (w.kind) {
    case "today": return t("kelish.whenToday");
    case "tomorrow": return t("kelish.whenTomorrow");
    case "running": return f("kelish.whenRunning");
    case "ended": return f("kelish.whenEnded");
    case "starts_today": return f("kelish.whenStartsToday");
    case "starts_tomorrow": return f("kelish.whenStartsTomorrow");
    default: return "";
  }
}

// The word for an open day, in the worker card. Read off the server's `when`,
// never the column's position: on a night shift at 15:00 «tomorrow» is the
// night that opens TONIGHT, so it says «Bugun».
function tagOf(day, t) {
  const k = day.when?.kind;
  if (day.state === "today") {
    if (k === "running") return t("kelish.tagNow");
    if (k === "ended") return t("kelish.tagEnded");
    return t("kelish.tagToday");
  }
  if (day.state === "tomorrow") return t(k === "starts_today" ? "kelish.tagToday" : "kelish.tagTomorrow");
  return null;
}

const countsText = (c, t) => [
  fill(t("kelish.countYes"), { n: c.yes }),
  fill(t("kelish.countNo"), { n: c.no }),
  fill(t("kelish.countNone"), { n: c.none }),
].join(" · ");

const markWord = (mark, t) =>
  (mark === "yes" ? t("kelish.yes") : mark === "no" ? t("kelish.no") : t("kelish.none"));

// One slot's answer changed: repaint it and re-count its day, so the totals
// row moves with the tap instead of waiting for the server.
function patchSlot(old, rowKey, i, patch) {
  if (!old) return old;
  const rows = old.rows.map((r) => {
    if (r.key !== rowKey || !r.days[i]) return r;
    const days = r.days.slice();
    days[i] = { ...days[i], ...patch };
    return { ...r, days };
  });
  const on = rows.map((r) => r.days[i]).filter(Boolean);
  const yes = on.filter((s) => s.mark === "yes").length;
  const no = on.filter((s) => s.mark === "no").length;
  const days = old.days.slice();
  days[i] = { ...days[i], counts: { yes, no, none: on.length - yes - no, total: on.length } };
  return { ...old, rows, days };
}

// ── pieces of the grid ──────────────────────────────────────────────────────

// The mark inside a filled cell. Colour + icon, so it reads without colour.
function MarkIcon({ mark, pop = false }) {
  const Icon = mark === "yes" ? Check : X;
  return <Icon aria-hidden="true" className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${pop ? "kelish-pop" : ""}`} strokeWidth={3} />;
}

// A cell in miniature, for the legend and the worker card — drawn exactly as
// the grid draws it: `lane` is an open cell nobody answered yet (the dashed
// slot), `off` is «no slot», and a bare chip is a closed cell left unanswered
// — the «—» the grid prints there.
function Chip({ mark = null, off = false, lane = false, size = 14 }) {
  const Icon = mark === "yes" ? Check : mark === "no" ? X : null;
  const style = mark ? FILL[mark]
    : off ? { ...OFF, border: "1px solid var(--border)" }
      : lane ? { ...LANE, border: SLOT_EDGE }
        : null;
  return (
    <span
      aria-hidden="true"
      className="inline-grid place-items-center rounded-[3px] flex-shrink-0"
      style={{ width: size, height: size, ...style }}
    >
      {Icon && <Icon style={{ width: size - 4, height: size - 4 }} strokeWidth={3.5} />}
      {!mark && !off && !lane && DASH}
    </span>
  );
}

function DayHead({ day, t }) {
  const future = day.state === "future";
  const current = day.state === "today" || day.state === "tomorrow";
  const label = [
    dayLabel(day.date, t),
    day.when ? whenText(day.when, t) : null,
    future ? t("kelish.legendFuture") : null,
  ].filter(Boolean).join(" · ");
  return (
    <th
      scope="col"
      title={label}
      aria-label={label}
      className="sticky z-10 px-0 py-1.5 text-center font-normal"
      style={{
        ...STICK_TOP,
        background: current ? LANE_HEAD : "var(--bg-inner)",
        boxShadow: current ? "inset 0 -2px 0 var(--brand)" : "inset 0 -1px 0 var(--border)",
      }}
    >
      {/* The open days are marked by their tint and the brand underline; the
          ink stays neutral so it keeps AA contrast on the tint in both themes. */}
      <span className="block text-[11px] leading-3 font-medium uppercase" style={{ color: "var(--text-2)" }}>
        {t(`cal.d${dow(day.date)}`)}
      </span>
      <span
        className={`block mt-0.5 text-xs leading-4 tabular-nums ${future ? "font-normal" : "font-semibold"}`}
        style={{ color: future ? "var(--text-2)" : "var(--text-1)" }}
      >
        <span className="sm:hidden">{day.date.slice(8, 10)}</span>
        <span className="hidden sm:inline">{dm(day.date)}</span>
      </span>
    </th>
  );
}

// One line under the grid: on an open week it is the tap cycle itself, which
// is also the whole legend; on a closed one, the three answers.
function Legend({ open, gaps = false, t }) {
  const arrow = <span aria-hidden="true" style={{ color: "var(--text-3)" }}>→</span>;
  // Each step carries the arrow AFTER it, so a narrow footer breaks the cycle
  // after an arrow — never leaving one dangling at the start of a line.
  const step = (children) => <span className="inline-flex items-center gap-1 whitespace-nowrap">{children}</span>;
  if (open) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {step(<><span className="font-medium" style={{ color: "var(--text-2)" }}>{t("kelish.tapLead")}</span><Chip lane />{arrow}</>)}
        {step(<><Chip mark="yes" />{t("kelish.yes")}{arrow}</>)}
        {step(<><Chip mark="no" />{t("kelish.no")}{arrow}</>)}
        {step(<Chip lane />)}
        {/* a closed day's «—» — say what it is */}
        {gaps && <span className="inline-flex items-center gap-1 whitespace-nowrap ml-2"><Chip />{t("kelish.none")}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="inline-flex items-center gap-1"><Chip mark="yes" />{t("kelish.yes")}</span>
      <span className="inline-flex items-center gap-1"><Chip mark="no" />{t("kelish.no")}</span>
      <span className="inline-flex items-center gap-1"><Chip />{t("kelish.none")}</span>
    </span>
  );
}

// ── one cell: an accordion card whose body is the cell's week ──────────────
// The page lists every cell in scope as one of these — the /idle-cell shape
// (the operator's call, 2026-09-30): the head is the cell (its code, its
// leader, how far its next list is filled) and a tap opens its week under it.
// Everything a week needs — its query, the taps, «+» and «−», the worker card —
// lives here, one per cell, so two open cells never share a selection, a
// cursor or a request chain.

function CellWeek({ cell, weekFrom, autoOpen, onAway, toast, t, tl, tx }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(autoOpen);
  // A list narrowed to one cell (or a leader's few) opens by itself — the
  // /idle-cell rule — and a card the reader opened is never shut for them.
  const [seenAuto, setSeenAuto] = useState(autoOpen);
  if (seenAuto !== autoOpen) {
    setSeenAuto(autoOpen);
    if (autoOpen) setOpen(true);
  }

  const [sheet, setSheet] = useState(null);               // the worker whose week card is open
  const [cursor, setCursor] = useState(null);             // the grid's one Tab stop, "row:col"
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeErr, setRemoveErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addErr, setAddErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [kbd, setKbd] = useState(false);                  // the grid holds KEYBOARD focus

  // One request chain per (worker, day), so two quick taps land in order;
  // `ver` keeps an older answer from repainting a newer tap.
  const queues = useRef(new Map());
  const ver = useRef(new Map());
  const pending = useRef(0);
  const settle = useRef(null);
  // The squares a tap changed this week — the only ones that animate, so a
  // week opening does not pop every square on it at once.
  const [pops, setPops] = useState(() => new Set());

  const exitSelect = () => { setSelecting(false); setSel(new Set()); };
  // A new week starts clean: nothing mid-selection, nothing popping.
  const [seenWeek, setSeenWeek] = useState(weekFrom);
  if (seenWeek !== weekFrom) {
    setSeenWeek(weekFrom);
    setPops(new Set());
    setSelecting(false);
    setSel(new Set());
  }

  const nameOf = (raw) => titleCase(tl(raw));

  // A refusal the server explains in a CODE is worded here; anything else —
  // a dropped connection, a 500 — reads as the door's own fallback, never as a
  // raw server string or as «not saved» on a page that was only loading.
  const knownErr = (e) => {
    const d = e?.response?.data;
    const raw = d?.detail_raw ?? d?.detail;
    const code = raw && typeof raw === "object" ? raw.code : null;
    switch (code) {
      case "exists": return fill(t("kelish.errExists"), { name: nameOf(raw.name) });
      case "name_required": return t("kelish.errName");
      case "day_locked": return t("kelish.errDayLocked");
      case "read_only": return t("kelish.errReadOnly");
      case "not_on_list": return t("kelish.errNotOnList");
      default: return null;
    }
  };
  const errText = (e, fallbackKey = "kelish.errSave") => knownErr(e) || t(fallbackKey);
  // A load that failed: the connection only when there was NO answer at all.
  const loadErr = (e) => knownErr(e) || t(e?.response ? "kelish.errServer" : "kelish.errLoadHint");

  // ── the week ──────────────────────────────────────────────────────────────
  // Fetched only once the card is open; a card shut again keeps what it read,
  // which is what its head goes on counting from.
  const weekKey = ["kelish-week", cell.id, weekFrom];
  const weekQ = useQuery({
    queryKey: weekKey,
    queryFn: () => api.get("/api/kelish/week", { params: { cell_id: cell.id, date: weekFrom } }).then((r) => r.data),
    enabled: open && !!weekFrom,
    // Keep the grid while the WEEK changes (the cell never does on this card).
    placeholderData: keepPreviousData,
    refetchInterval: () => (pending.current > 0 ? false : 60_000),
    refetchOnWindowFocus: () => pending.current === 0,
  });
  const data = weekQ.data && weekQ.data.cell?.id === cell.id ? weekQ.data : null;
  const stale = !!data && weekQ.isPlaceholderData;      // last week on screen while the next one loads
  const days = data?.days || [];
  const openAny = days.some((d) => d.editable);
  const locked = !!data && !openAny;

  const view = useMemo(() => {
    if (!data) return [];
    const openIdx = data.days.map((d, i) => (d.editable ? i : -1)).filter((i) => i >= 0);
    const rows = data.rows.map((r) => {
      const full = nameOf(r.name);
      const parts = full.split(" ");
      return { ...r, full, short: parts.length > 2 ? parts.slice(0, 2).join(" ") : full };
    });
    // Surname + first name is how a leader knows their people; the patronymic
    // comes back only where two workers of one list would otherwise read alike.
    const seen = {};
    rows.forEach((r) => { seen[r.short] = (seen[r.short] || 0) + 1; });
    return rows.map((r) => {
      const display = seen[r.short] > 1 ? r.full : r.short;
      const [surname, ...rest] = display.split(" ");
      // «−» names a worker by the key an OPEN day's list uses.
      const removeKey = openIdx.map((i) => r.days[i]?.k).find(Boolean) || null;
      const warn = r.never || (r.quiet != null && r.quiet >= (data.quiet_days ?? 7));
      return { ...r, display, surname, given: rest.join(" "), removeKey, warn };
    });
  }, [data, tl]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentCount = view.filter((r) => r.current).length;
  // A NIGHT unit's open days do not line up with the calendar (after midnight
  // the running shift is dated yesterday; at 15:00 «tomorrow» opens tonight), so
  // for it — and only it — the footer says which open day is which. A day unit
  // reads the calendar and needs no line.
  const nightLine = data?.cell?.shift === 2 && openAny
    ? days.filter((d) => d.editable && d.when).map((d) => `${dayLabel(d.date, t)} — ${whenText(d.when, t)}`).join(" · ")
    : "";
  const closedGaps = days.some((d, i) => !d.editable && d.state !== "future"
    && view.some((r) => r.days[i] && !r.days[i].mark));
  const firstLeft = view.findIndex((r) => !r.current);

  // The cells list counts every cell's next list; this card's own changes
  // reach it once the taps have gone quiet, never one refetch per tap.
  const refreshCells = () => qc.invalidateQueries({ queryKey: ["kelish-cells"] });
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["kelish-week", cell.id] });
    refreshCells();
  };

  // ── the head ──────────────────────────────────────────────────────────────
  // How far the NEXT list (the cell's «tomorrow») is filled — off this card's
  // own week while it holds that day, so it moves with a tap; otherwise off
  // the cells list.
  const nextDay = data && !stale ? days.find((d) => d.state === "tomorrow") : null;
  const prog = nextDay?.counts ? { day: nextDay.date, ...nextDay.counts } : cell.progress;
  const cellTitle = cellTitleOf(cell, tl);

  // A 1px marker at the foot of the head: once it has scrolled PAST (out of
  // view, in the upper half) while this card's week is still on screen, the
  // app header names the cell instead — so a long list never loses whose cell
  // it is. At most one open card can be in that state at a time.
  const headEl = useRef(null);
  const cardEl = useRef(null);
  useEffect(() => {
    const h = headEl.current;
    const c = cardEl.current;
    if (!open || !h || !c || typeof IntersectionObserver === "undefined") return undefined;
    const seen = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target, e));
      const eh = seen.get(h);
      const ec = seen.get(c);
      onAway(cell.id, !!eh && !!ec && ec.isIntersecting && !eh.isIntersecting
        && eh.boundingClientRect.top < window.innerHeight / 2);
    });
    io.observe(h);
    io.observe(c);
    return () => { io.disconnect(); onAway(cell.id, false); };
  }, [open, cell.id, onAway]);

  // ── a tap ─────────────────────────────────────────────────────────────────
  const tap = (row, i) => {
    const day = data?.days[i];
    const slot = row.days[i];
    if (!day?.editable || !slot || selecting || stale) return;
    // empty → yes → no → empty; null CLEARS the mark server-side.
    const next = slot.mark === "yes" ? "no" : slot.mark === "no" ? null : "yes";
    const key = weekKey;
    const id = `${row.key}|${day.date}`;
    const v = (ver.current.get(id) || 0) + 1;
    ver.current.set(id, v);
    setPops((p) => (p.has(id) ? p : new Set(p).add(id)));
    // Only a CLEAR drops «who marked» at once; a colour change keeps it until
    // the server says who set the mark, so the corner does not blink per tap.
    qc.setQueryData(key, (old) => patchSlot(old, row.key, i,
      next ? { mark: next } : { mark: null, by: null, by_other: false, at: null }));
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
    pending.current += 1;
    clearTimeout(settle.current);
    const body = { cell_id: data.cell.id, date: day.date, key: slot.k, status: next };
    const prev = queues.current.get(id) || Promise.resolve();
    const run = prev.catch(() => {})
      .then(() => api.put("/api/kelish/mark", body))
      .then((r) => {
        if (ver.current.get(id) === v) {
          qc.setQueryData(key, (old) => patchSlot(old, row.key, i,
            { mark: r.data.mark, by: r.data.by, by_other: r.data.by_other, at: r.data.at }));
        }
      })
      .catch((e) => {
        // Name the square that flipped back — the refetch repaints it silently.
        const why = knownErr(e);
        toast.error(`${fill(t("kelish.errMark"), { name: row.display, day: dayLabel(day.date, t) })}${why ? ` (${why})` : ""}`);
        qc.invalidateQueries({ queryKey: key });
      })
      .finally(() => {
        pending.current -= 1;
        if (pending.current === 0) {
          clearTimeout(settle.current);
          settle.current = setTimeout(refreshCells, 1500);
        }
      });
    queues.current.set(id, run);
  };

  // The grid is ONE Tab stop (a roving tabindex): Tab lands on the cell last
  // used, arrow keys walk the open cells like a spreadsheet — down a column to
  // fill a day, across to the other open day — and past the leftmost open cell
  // onto the worker's name (column -1), where Enter opens their card. Without
  // it every name and every open cell was a stop: ~80 Tabs to reach «+».
  const focusable = (ri, ci) => {
    if (selecting || !data || ri < 0 || ri >= view.length) return false;
    if (ci === -1) return true;
    return !!data.days[ci]?.editable && !!view[ri].days[ci];
  };
  const defaultStop = (() => {
    const ci = data ? data.days.findIndex((d, i) => d.editable && view[0]?.days[i]) : -1;
    return ci >= 0 ? `0:${ci}` : "0:-1";
  })();
  const stop = (() => {
    const [r, c] = (cursor || "").split(":").map(Number);
    return cursor && focusable(r, c) ? cursor : defaultStop;
  })();
  const onGridFocus = (e) => {
    const k = e.target.dataset?.ks;
    if (k && k !== cursor) setCursor(k);
    let visible = false;
    try { visible = e.target.matches(":focus-visible"); } catch { /* old engine */ }
    if (visible !== kbd) setKbd(visible);
  };
  const onGridBlur = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setKbd(false);
  };
  const onGridKey = (e) => {
    const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    const el = step && e.target.closest?.("[data-ks]");
    if (!el) return;
    const [r, c] = el.dataset.ks.split(":").map(Number);
    for (let k = 1; k <= view.length + 7; k += 1) {
      const rr = r + step[0] * k;
      const cc = c + step[1] * k;
      if (rr < 0 || rr >= view.length || cc < -1 || cc > 6) break;
      const target = e.currentTarget.querySelector(`[data-ks="${rr}:${cc}"]`);
      if (target) { e.preventDefault(); target.focus(); return; }
    }
  };

  // ── «+» ───────────────────────────────────────────────────────────────────
  const openAdd = () => { setAddName(""); setAddErr(""); setAddOpen(true); };
  const submitAdd = async (name) => {
    const v = String(name || "").replace(/\s+/g, " ").trim();
    if (v.length < 3) { setAddErr(t("kelish.errName")); return; }
    setAdding(true);
    try {
      const r = await api.post("/api/kelish/workers", { cell_id: data.cell.id, name: v });
      toast.success(fill(t(r.data.restored ? "kelish.restoredToast" : "kelish.addedToast"), { name: nameOf(r.data.name) }));
      setAddOpen(false);
      setAddName("");
      refreshAll();
    } catch (e) {
      setAddErr(errText(e));
    } finally {
      setAdding(false);
    }
  };
  const suggestions = useMemo(() => {
    const q = fold(addName);
    return (data?.removed || []).filter((g) => !q || fold(g.name).includes(q));
  }, [data, addName]);

  // ── «−» ───────────────────────────────────────────────────────────────────
  const removable = view.filter((r) => r.removeKey);
  const toggleSel = (key) => setSel((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  const allSel = removable.length > 0 && removable.every((r) => sel.has(r.key));
  const someSel = removable.some((r) => sel.has(r.key));
  const toggleAll = () => setSel(allSel ? new Set() : new Set(removable.map((r) => r.key)));
  const selNames = useMemo(() => {
    const picked = view.filter((r) => sel.has(r.key)).map((r) => r.display);
    const head = picked.slice(0, 5).join(", ");
    return picked.length > 5 ? `${head} ${fill(t("kelish.andMore"), { n: picked.length - 5 })}` : head;
  }, [view, sel, t]);
  const doRemove = async () => {
    setRemoving(true);
    setRemoveErr("");
    try {
      const keys = view.filter((r) => sel.has(r.key) && r.removeKey).map((r) => r.removeKey);
      const r = await api.post("/api/kelish/workers/remove", { cell_id: data.cell.id, keys });
      toast.success(fill(t("kelish.removedToast"), { n: r.data.removed }));
      setConfirmOpen(false);
      exitSelect();
      refreshAll();
    } catch (e) {
      setRemoveErr(errText(e));
    } finally {
      setRemoving(false);
    }
  };

  // Whether a worker has stopped coming — printed only while choosing whom to
  // remove; the worker card carries it the rest of the time.
  const absence = (r) => (r.never ? fill(t("kelish.never"), { n: WINDOW_DAYS })
    : r.warn ? fill(t("kelish.quiet"), { n: r.quiet }) : null);
  const absenceShort = (r) => (r.never ? fill(t("kelish.neverShort"), { n: WINDOW_DAYS })
    : r.warn ? fill(t("kelish.quietShort"), { n: r.quiet }) : null);

  const slotLabel = (r, d, s) => {
    const bits = [r.full, dayLabel(d.date, t)];
    if (d.state === "future") bits.push(t("kelish.legendFuture"));
    else if (!s) bits.push(t("kelish.legendOff"));
    else {
      bits.push(markWord(s.mark, t));
      if (s.by && s.by_other) bits.push(fill(t("kelish.by"), { name: shortPerson(titleCase(tl(s.by))) }));
    }
    return bits.join(" · ");
  };

  // ── the head of the card ──────────────────────────────────────────────────
  // /idle-cell's row: chevron · code over leader · the one figure on the right.
  // Here that figure is the next list's fill («Pa 01.10 · 3/4»), its width
  // fixed for its total so a tap never shifts the head (nothing above the rows
  // may move on a tap); a done list carries the totals row's green tick.
  let progress = <span className="text-xs" style={{ color: "var(--text-4)" }}>—</span>;
  if (prog && prog.total) {
    const n = prog.yes + prog.no;
    const done = prog.none === 0;
    progress = (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap"
        title={fill(t("kelish.cellProgress"), { d: dm(prog.day), n, total: prog.total })}
      >
        <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{dayLabel(prog.day, t)}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color: "var(--text-1)" }}>
          <span className="inline-block text-right" style={{ minWidth: `${String(prog.total).length}ch` }}>{n}</span>/{prog.total}
        </span>
        <span className="hidden sm:inline text-[11px]" style={{ color: "var(--text-3)" }}>{t("kelish.markedWord")}</span>
        <Check
          aria-label={done ? t("kelish.complete") : undefined}
          aria-hidden={!done}
          className="w-3 h-3 flex-shrink-0" strokeWidth={3}
          style={{ color: "var(--status-ok)", visibility: done ? "visible" : "hidden" }}
        />
      </span>
    );
  }
  const head = (
    <div className="relative" style={{ borderBottom: open ? "1px solid var(--border)" : "none" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 sm:gap-3 px-3 py-2 min-h-[44px] text-left"
      >
        <ChevronDown
          size={16}
          aria-hidden="true"
          style={{ color: "var(--text-3)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}
        />
        <CellIdent
          code={cell.code}
          leader={cell.leader ? titleCase(tl(cell.leader)) : ""}
          noLeader={t("idleCell.noLeader")}
          leaderTitle={t("idleCell.leader")}
        />
        <span className="flex items-center gap-3 flex-shrink-0">
          {/* A week nobody may change says so here — a line of its own would
              push the grid down (a phone gets the padlock and its tooltip). */}
          {locked && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--text-3)" }} title={t("kelish.readOnly")}>
              <Lock size={12} aria-hidden="true" />
              <span className="hidden sm:inline">{t("kelish.readOnly")}</span>
            </span>
          )}
          {progress}
        </span>
      </button>
      <div ref={headEl} aria-hidden="true" className="absolute left-0 bottom-0 w-px h-px pointer-events-none" />
    </div>
  );

  // ── footer ────────────────────────────────────────────────────────────────
  // While choosing whom to remove, the selection bar IS the sticky bottom row:
  // on a long list its count and its action stay in view (the per-day totals
  // mean nothing mid-selection).
  const anyAway = view.some((r) => r.removeKey && absenceShort(r));
  const selectBar = (
    <div className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-2">
      <Button
        variant="danger" tint size="lg" icon={<UserMinus size={15} />} className="max-sm:min-h-11"
        disabled={!sel.size} onClick={() => { setRemoveErr(""); setConfirmOpen(true); }}
      >
        {fill(t("kelish.removeN"), { n: sel.size })}
      </Button>
      <span className="hidden sm:inline text-xs whitespace-normal" style={{ color: "var(--text-2)" }}>{t("kelish.selectHint")}</span>
      <Button variant="secondary" size="lg" className="ml-auto max-sm:min-h-11" onClick={exitSelect}>{t("common.cancel")}</Button>
      {/* the amber clock beside a name, said once in words (a phone shows no sentence) */}
      {anyAway && (
        <div className="sm:hidden basis-full flex items-center gap-1.5 text-[11px] whitespace-normal" style={{ color: "var(--text-2)" }}>
          <Clock size={12} className="flex-shrink-0" style={{ color: "var(--status-warn)" }} aria-hidden="true" />
          {fill(t("kelish.awayLegend"), { n: data?.quiet_days ?? 7 })}
        </div>
      )}
    </div>
  );
  const footer = !data || selecting ? null : (
    <>
      {/* How to read the grid lives UNDER it: copy above it moves every row.
          On a phone the legend takes the whole line and the buttons the next,
          so the cycle reads as one line instead of three beside them. */}
      <div className="min-w-0 basis-full sm:basis-0 sm:flex-1 text-[11px] leading-snug" style={{ color: "var(--text-2)" }}>
        {view.length > 0 && <Legend open={openAny} gaps={closedGaps} t={t} />}
        {nightLine && (
          <div className="flex items-start gap-1.5 mt-1.5" style={{ color: "var(--text-2)" }}>
            <Clock size={12} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{nightLine}</span>
          </div>
        )}
        {/* Keyboard users only: while the grid holds keyboard focus, say how it
            moves — one Tab stop hides the arrows from anybody who does not guess. */}
        {kbd && openAny && (
          <div className="hidden pointer-fine:block mt-1.5" style={{ color: "var(--text-2)" }}>{t("kelish.kbdHint")}</div>
        )}
      </div>
      {openAny && view.length > 0 && (
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="lg" icon={<Plus size={17} />} className={ICON_BTN} aria-label={t("kelish.add")} title={t("kelish.add")} onClick={openAdd} />
          <Button
            variant="secondary" size="lg" icon={<Minus size={17} />} className={ICON_BTN}
            aria-label={t("kelish.remove")} title={t("kelish.remove")}
            disabled={!removable.length} onClick={() => { setSel(new Set()); setSelecting(true); }}
          />
        </div>
      )}
    </>
  );

  // ── the grid ──────────────────────────────────────────────────────────────
  const cols = data ? days : Array.from({ length: 7 }, (_, i) => ({ date: String(i), skeleton: true }));
  const dim = stale ? { opacity: 0.5, pointerEvents: "none", transition: "opacity .15s" } : { transition: "opacity .15s" };

  const nameHead = (
    <th
      scope="col"
      className={`sticky z-10 ${NAME_PAD} py-1.5 text-left align-middle font-semibold`}
      style={{ ...STICK_TOP, background: "var(--bg-inner)", color: "var(--text-3)", boxShadow: "inset 0 -1px 0 var(--border)" }}
    >
      {selecting ? (
        <label className="flex w-full min-h-11 sm:pointer-fine:min-h-0 items-center gap-1.5 sm:gap-2 cursor-pointer text-[11px] font-medium">
          <input
            type="checkbox" checked={allSel}
            ref={(el) => { if (el) el.indeterminate = someSel && !allSel; }}
            onChange={toggleAll}
            className="w-4 h-4 cursor-pointer accent-[var(--brand)]"
          />
          <span className="sm:hidden">{t("kelish.selectAllShort")}</span>
          <span className="hidden sm:inline">{t("kelish.selectAll")}</span>
        </label>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
          {t("kelish.colWorker")}
          {data && <span className="tabular-nums normal-case tracking-normal" style={{ color: "var(--text-2)" }}>{currentCount}</span>}
        </span>
      )}
    </th>
  );

  const nameCell = (r, ri) => {
    const ink = r.current ? "var(--text-1)" : "var(--text-2)";
    const away = selecting ? absence(r) : null;
    const awayShort = selecting ? absenceShort(r) : null;
    const text = (
      <>
        {/* phone: surname over given name — two short lines fit where one
            long one would be cut to nothing */}
        <span className="sm:hidden block min-w-0">
          <span className="flex items-center gap-1 min-w-0">
            {awayShort && <Clock size={12} className="flex-shrink-0" style={{ color: "var(--status-warn)" }} aria-hidden="true" />}
            <span className="text-[13px] max-[359px]:text-xs leading-4 font-semibold truncate" style={{ color: ink }}>{r.surname}</span>
          </span>
          <span className="block text-[11px] leading-[14px] truncate" style={{ color: "var(--text-2)" }}>
            {r.given || " "}
          </span>
        </span>
        <span className="hidden sm:block min-w-0">
          <span className="block text-[13px] leading-5 font-medium truncate" style={{ color: ink }}>{r.display}</span>
          {away && <span className="block text-[11px] leading-4 truncate" style={{ color: "var(--status-warn)" }}>{away}</span>}
        </span>
      </>
    );
    return (
      <td className={`${NAME_PAD} py-0 align-middle`}>
        {selecting ? (
          <label
            className={`flex items-center gap-1.5 sm:gap-2 min-w-0 ${NAME_H} ${r.removeKey ? "cursor-pointer" : "opacity-50"}`}
            title={[r.full, away].filter(Boolean).join(" · ")}
          >
            <input
              type="checkbox" checked={sel.has(r.key)} disabled={!r.removeKey} aria-label={[r.display, away].filter(Boolean).join(" · ")}
              onChange={() => toggleSel(r.key)}
              className="w-4 h-4 flex-shrink-0 cursor-pointer accent-[var(--brand)] disabled:cursor-default"
            />
            <span className="min-w-0 flex-1">{text}</span>
          </label>
        ) : (
          <button
            type="button"
            data-ks={`${ri}:-1`}
            tabIndex={stop === `${ri}:-1` ? 0 : -1}
            aria-describedby={openAny ? "kelish-kbd" : undefined}
            onClick={() => setSheet(r.key)}
            title={`${r.full} · ${t("kelish.details")}`}
            className={`flex items-center ${NAME_H} w-full min-w-0 text-left rounded-md cursor-pointer hover:underline decoration-[var(--text-3)] underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]`}
          >
            {text}
          </button>
        )}
      </td>
    );
  };

  // Every day cell is the same box — ROW_H high, --kd wide — and its fill IS
  // the answer; only an open, listed cell is a button.
  const dayCell = (r, ri, d, i) => {
    const s = r.days[i];
    const label = slotLabel(r, d, s);
    const box = `${ROW_H} w-full grid place-items-center`;
    const id = `${r.key}|${d.date}`;
    let body;
    if (d.state === "future" || !s) {
      body = <span role="img" aria-label={label} title={label} className={box} style={OFF} />;
    } else if (d.editable && !selecting) {
      body = (
        <button
          type="button"
          data-ks={`${ri}:${i}`}
          tabIndex={stop === `${ri}:${i}` ? 0 : -1}
          aria-describedby="kelish-kbd"
          onClick={() => tap(r, i)}
          aria-label={label}
          title={label}
          className={`kelish-hit ${box} cursor-pointer ${s.mark ? "is-filled" : "is-empty"}`}
          style={s.mark ? FILL[s.mark] : LANE}
        >
          {s.mark && <MarkIcon key={s.mark} mark={s.mark} pop={pops.has(id)} />}
        </button>
      );
    } else {
      body = (
        <span
          role="img" aria-label={label} title={label}
          className={box}
          style={{ ...(s.mark ? FILL[s.mark] : null), ...(selecting ? { opacity: 0.35 } : null) }}
        >
          {s.mark ? <MarkIcon mark={s.mark} /> : DASH}
        </span>
      );
    }
    return <td key={d.date} className="p-0 align-middle">{body}</td>;
  };

  const skeletonRows = Array.from({ length: 5 }).map((_, i) => (
    <tr key={`sk${i}`}>
      <td className="px-2 sm:px-3">
        <SkeletonBlock className={`h-3.5 ${["w-2/3", "w-1/2", "w-3/5"][i % 3]}`} />
      </td>
      {cols.map((c) => (
        <td key={c.date} className="p-0">
          <div className={`${ROW_H} grid place-items-center`}>
            <SkeletonBlock className="h-3 w-3 rounded-[3px]" />
          </div>
        </td>
      ))}
    </tr>
  ));

  const failed = weekQ.isError && !data;
  const sheetRow = sheet ? view.find((r) => r.key === sheet) || null : null;

  return (
    <div ref={cardEl}>
      <TableCard
        head={head} collapsed={!open}
        fixed minWidth={280} footer={footer} hover={false} pageScroll
        className={GRID}
      >
        <colgroup>
          <col />
          {cols.map((d) => <col key={d.date} style={{ width: "var(--kd)" }} />)}
        </colgroup>
        <thead style={dim}>
          <tr>
            {nameHead}
            {cols.map((d) => (d.skeleton ? (
              <th key={d.date} className="sticky z-10 px-0 py-1.5" style={{ ...STICK_TOP, background: "var(--bg-inner)", boxShadow: "inset 0 -1px 0 var(--border)" }}>
                <div className="flex flex-col items-center gap-1">
                  <SkeletonBlock className="h-2.5 w-4" />
                  <SkeletonBlock className="h-3.5 w-6" />
                </div>
              </th>
            ) : <DayHead key={d.date} day={d} t={t} />))}
          </tr>
        </thead>
        <tbody onKeyDown={onGridKey} onFocus={onGridFocus} onBlur={onGridBlur} style={dim}>
          {!data && !failed && skeletonRows}
          {failed && (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center whitespace-normal">
                <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{t("kelish.errLoad")}</div>
                <div className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>{loadErr(weekQ.error)}</div>
                <div className="mt-4 flex justify-center">
                  <Button variant="secondary" size="lg" className="max-sm:min-h-11" onClick={() => weekQ.refetch()}>{t("kelish.retry")}</Button>
                </div>
              </td>
            </tr>
          )}
          {data && view.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-sm whitespace-normal" style={{ color: "var(--text-3)" }}>
                {openAny ? t("kelish.emptyList") : t("kelish.emptyListRO")}
                {openAny && (
                  <div className="mt-4 flex justify-center">
                    <Button variant="primary" size="lg" icon={<Plus size={16} />} onClick={openAdd}>{t("kelish.add")}</Button>
                  </div>
                )}
              </td>
            </tr>
          )}
          {data && view.map((r, ri) => (
            <FragmentRow key={r.key} divider={ri === firstLeft && firstLeft > 0 ? fill(t("kelish.leftGroup"), { n: view.length - firstLeft }) : null}>
              <tr className="kelish-row" style={selecting && sel.has(r.key) ? { background: "var(--brand-bg)" } : undefined}>
                {nameCell(r, ri)}
                {days.map((d, i) => dayCell(r, ri, d, i))}
              </tr>
            </FragmentRow>
          ))}
        </tbody>
        {data && view.length > 0 && selecting && (
          <tfoot style={dim}>
            <tr>
              <td colSpan={8} className="p-0" style={STICK_BOTTOM}>{selectBar}</td>
            </tr>
          </tfoot>
        )}
        {data && view.length > 0 && !selecting && (
          <tfoot style={dim}>
            {/* One figure per day: how many are coming. The full split is on hover. */}
            <tr>
              <td className="px-2 sm:px-3 h-9 align-middle" style={STICK_BOTTOM}>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>
                  <span aria-hidden="true" className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "var(--status-ok)" }} />
                  {t("kelish.yes")}
                </span>
              </td>
              {days.map((d) => {
                const c = d.counts;
                const any = c && c.yes + c.no > 0;
                return (
                  <td
                    key={d.date}
                    className="p-0 text-center align-middle text-xs font-bold tabular-nums"
                    style={STICK_BOTTOM}
                    title={d.state !== "future" && c ? countsText(c, t) : undefined}
                  >
                    {d.state === "future" ? null : (
                      <span className="inline-flex items-center justify-center gap-0.5">
                        {any
                          ? <span style={{ color: c.yes > 0 ? "var(--status-ok)" : "var(--text-3)" }}>{c.yes}</span>
                          : <span className="font-normal" style={{ color: "var(--text-3)" }}>—</span>}
                        {/* an open day's list is DONE once nobody is left unanswered;
                            the slot is reserved so the count never shifts */}
                        {d.editable && (
                          <Check
                            aria-label={c && c.total && c.none === 0 ? t("kelish.complete") : undefined}
                            aria-hidden={!(c && c.total && c.none === 0)}
                            className="w-3 h-3 flex-shrink-0" strokeWidth={3}
                            style={{ color: "var(--status-ok)", visibility: c && c.total && c.none === 0 ? "visible" : "hidden" }}
                          />
                        )}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </TableCard>

      {sheetRow && data && (
        <WorkerSheet row={sheetRow} data={data} onClose={() => setSheet(null)} t={t} tl={tl} tx={tx} />
      )}

      <Modal
        open={addOpen}
        onClose={() => { if (!adding) setAddOpen(false); }}
        title={t("kelish.addTitle")}
        subtitle={cellTitle}
        icon={<UserPlus size={18} />}
        maxWidth="max-w-md"
        dismissable={!adding}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={adding}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={() => submitAdd(addName)} loading={adding}>{t("kelish.addSubmit")}</Button>
          </>
        )}
      >
        <FormField label={t("kelish.addLabel")} required hint={t("kelish.addHint")} error={addErr}>
          <input
            autoFocus value={addName} maxLength={120} autoComplete="off"
            placeholder={t("kelish.addPlaceholder")}
            onChange={(e) => { setAddName(e.target.value); setAddErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(addName); } }}
            className="w-full px-3 py-2 rounded-xl text-base sm:text-sm outline-none"
            style={{ background: "var(--bg-inner)", border: `1px solid ${addErr ? RED : "var(--border-md)"}`, color: "var(--text-1)" }}
          />
        </FormField>
        {suggestions.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>
              {t("kelish.removedList")}
            </div>
            <div className="rounded-xl overflow-hidden max-h-60 overflow-y-auto" style={{ border: "1px solid var(--border)" }}>
              {suggestions.map((g, i) => (
                <div key={g.key} className="flex items-center gap-2 px-3 py-2" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate" style={{ color: "var(--text-1)" }} title={nameOf(g.name)}>
                      {nameOf(g.name).split(" ").slice(0, 2).join(" ")}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>
                      {[nameOf(g.name).split(" ").slice(2).join(" "), g.job ? tx(g.job) : ""].filter(Boolean).join(" · ") || " "}
                    </div>
                  </div>
                  <Button variant="secondary" size="md" icon={<Undo2 size={13} />} className="max-sm:min-h-11" disabled={adding} onClick={() => submitAdd(g.name)}>
                    {t("kelish.restore")}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        icon={<UserMinus size={18} />}
        title={fill(t("kelish.removeTitle"), { n: sel.size })}
        message={(
          <>
            <span className="block text-xs mb-1" style={{ color: "var(--text-3)" }}>{cellTitle}</span>
            <span className="block font-medium" style={{ color: "var(--text-2)" }}>{selNames}</span>
            <span className="block mt-1.5">{t("kelish.removeBody")}</span>
          </>
        )}
        confirmLabel={t("kelish.removeConfirm")}
        onCancel={() => { if (!removing) setConfirmOpen(false); }}
        onConfirm={doRemove}
        loading={removing}
        error={removeErr}
      />
    </div>
  );
}

// ── the page ────────────────────────────────────────────────────────────────

export default function Kelish() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const toast = useToast();
  const { ready } = useFactory();
  const factorySection = useFactorySection();

  const [week, setWeek] = useState(null);                 // a Monday; null = the plant's current week
  const [unitPick, setUnitPick] = usePersistentState("kelish.unit", null);
  const [shiftPick, setShiftPick] = usePersistentState("kelish.shift", null);
  // The open card whose head has scrolled away while its week is still on
  // screen; the app header names that cell (the LeaderAppeal pattern).
  const [awayId, setAwayId] = useState(null);
  const onAway = useCallback((id, away) => setAwayId((cur) => (away ? id : cur === id ? null : cur)), []);

  // ── which cells ───────────────────────────────────────────────────────────
  const cellsParams = useFactoryParams(NO_PARAMS);
  const cellsQ = useQuery({
    queryKey: ["kelish-cells", cellsParams],
    queryFn: () => api.get("/api/kelish/cells", { params: cellsParams }).then((r) => r.data),
    enabled: ready,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const cells = cellsQ.data?.cells || [];
  const units = useMemo(() => cellsQ.data?.units || [], [cellsQ.data]);
  const scopeKind = cellsQ.data?.scope?.kind;
  const scopeAll = scopeKind === "all";
  const hasOrphans = cells.some((c) => !c.manager_id);
  const thisWeek = cellsQ.data?.this_week || null;
  const weekFrom = week || thisWeek;

  const unitList = useMemo(
    () => units.filter((u) => !shiftPick || u.shift === shiftPick),
    [units, shiftPick],
  );
  const unitIds = [...unitList.map((u) => u.id), ...(hasOrphans && !shiftPick ? [NONE] : [])];
  // A leader's own cells are never narrowed by unit — one of them may stand in
  // another brigadir's unit, and hiding it would hide half their work.
  const narrowByUnit = scopeKind !== "leader" && units.length + (hasOrphans ? 1 : 0) > 1;
  const activeUnit = narrowByUnit ? (unitIds.includes(unitPick) ? unitPick : unitIds[0] ?? null) : null;
  const cellsShown = narrowByUnit ? cells.filter((c) => (c.manager_id ?? NONE) === activeUnit) : cells;
  // One cell, or a leader's few, open by themselves — the /idle-cell rule.
  const autoOpen = cellsShown.length === 1 || (scopeKind === "leader" && cellsShown.length <= 3);

  // The week stepper spans every cell listed: it steps as far as the latest
  // cell's tomorrow, and a dot points to the side an open day lies on.
  const maxDay = cellsShown.reduce((m, c) => (c.tomorrow && c.tomorrow > m ? c.tomorrow : m), "");
  const weekTo = weekFrom ? addDays(weekFrom, 6) : "";
  const dotPrev = weekFrom && cellsShown.some((c) => c.today && c.today < weekFrom) ? t("kelish.dotHere") : null;
  const dotNext = weekTo && cellsShown.some((c) => c.tomorrow && c.tomorrow > weekTo) ? t("kelish.dotHere") : null;
  const pickWeek = (iso) => setWeek(iso === thisWeek ? null : iso);

  // ── the filter bar (only where there is something to choose) ─────────────
  const unitName = (id) => (id === NONE ? t("kelish.noUnit") : tl(units.find((u) => u.id === id)?.name || ""));
  const sections = [];
  if (scopeAll && factorySection) sections.push(factorySection);
  if (scopeAll) {
    sections.push({
      key: "shift", icon: Clock, label: t("kelish.shift"),
      active: shiftPick != null,
      display: shiftPick ? fill(t("kelish.shiftN"), { n: shiftPick }) : "",
      onClear: () => setShiftPick(null),
      render: ({ close } = {}) => (
        <PickFilter
          opts={[
            { value: "all", label: t("kelish.allShifts") },
            { value: 1, label: fill(t("kelish.shiftN"), { n: 1 }) },
            { value: 2, label: fill(t("kelish.shiftN"), { n: 2 }) },
          ]}
          value={shiftPick ?? "all"}
          onChange={(v) => setShiftPick(v === "all" ? null : v)}
          close={close}
        />
      ),
    });
  }
  if (narrowByUnit) {
    const opts = unitIds.map((id) => ({ value: id, label: unitName(id) }));
    sections.push({
      key: "unit", icon: Users, label: t("kelish.unit"), pinned: true,
      active: activeUnit != null,
      display: activeUnit != null ? unitName(activeUnit) : "",
      render: ({ close } = {}) => (
        <PickFilter
          opts={opts} value={activeUnit} searchable
          note={shiftPick ? fill(t("kelish.unitNarrowed"), { v: fill(t("kelish.shiftN"), { n: shiftPick }), n: opts.length }) : null}
          empty={shiftPick ? (
            <Button variant="secondary" size="sm" onClick={() => setShiftPick(null)}>{t("kelish.allShifts")}</Button>
          ) : null}
          onChange={(v) => setUnitPick(v)}
          close={close}
        />
      ),
    });
  }

  // ── render ────────────────────────────────────────────────────────────────
  let body;
  if (!cellsQ.data && (cellsQ.isLoading || !ready)) {
    body = (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-[58px] w-full rounded-2xl" />)}
      </div>
    );
  } else if (cellsQ.isError && !cellsQ.data) {
    body = (
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState
          title={t("kelish.errLoad")} message={t(cellsQ.error?.response ? "kelish.errServer" : "kelish.errLoadHint")} showUploadLink={false}
          action={<Button variant="secondary" size="lg" className="max-sm:min-h-11" onClick={() => cellsQ.refetch()}>{t("kelish.retry")}</Button>}
        />
      </div>
    );
  } else if (!cellsShown.length) {
    body = (
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState
          icon={UserCheck} showUploadLink={false} height="h-48"
          title={t("kelish.noCellsTitle")}
          message={scopeKind === "leader" ? t("kelish.noCellsLeader") : t("kelish.noCells")}
        />
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-2">
        <span id="kelish-kbd" className="sr-only">{t("kelish.kbdHint")}</span>
        {cellsShown.map((c) => (
          <CellWeek
            key={c.id} cell={c} weekFrom={weekFrom} autoOpen={autoOpen}
            onAway={onAway} toast={toast} t={t} tl={tl} tx={tx}
          />
        ))}
      </div>
    );
  }

  const awayCell = awayId != null ? cellsShown.find((c) => c.id === awayId) : null;

  return (
    <Layout title={t("nav.kelish")} subtitle={awayCell ? cellTitleOf(awayCell, tl) : undefined}>
      <div className="mx-auto w-full max-w-4xl flex flex-col gap-3">
        {(cellsShown.length > 0 || sections.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {cellsShown.length > 0 && weekFrom && (
              <DayStepper
                week compactUntil="xl" value={weekFrom} onChange={pickWeek} max={maxDay || undefined}
                dotPrev={dotPrev} dotNext={dotNext}
              />
            )}
            {sections.length > 0 && (
              <FilterPanel
                sections={sections} chipsWrap="always"
                anyActive={!!(factorySection?.active && factorySection?.onClear) || shiftPick != null}
              />
            )}
          </div>
        )}

        {body}
      </div>

      {toast.node}
    </Layout>
  );
}

// A worker row, preceded — once — by the band that opens the «left the list
// during the week» group.
function FragmentRow({ divider, children }) {
  return (
    <>
      {divider && (
        <tr>
          <td
            colSpan={8}
            className="px-2 sm:px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider whitespace-normal"
            style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}
          >
            {divider}
          </td>
        </tr>
      )}
      {children}
    </>
  );
}

// ── the worker's week card ──────────────────────────────────────────────────
// Everything the grid has no room for: where the name came from, when they
// last came in, and for each day who set the answer and when — the corner
// marker's explanation on a phone, which has no hover.
function WorkerSheet({ row, data, onClose, t, tl, tx }) {
  const source = row.source === "manual" ? t("kelish.manual")
    : row.source === "kept" ? t("kelish.kept") : t("kelish.sheetFile");
  const warn = row.never ? fill(t("kelish.never"), { n: WINDOW_DAYS })
    : row.warn ? fill(t("kelish.quiet"), { n: row.quiet }) : null;
  const fact = (text, isWarn = false, key = text) => (
    <span
      key={key}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium"
      style={isWarn
        ? { background: "rgba(234,179,8,0.12)", color: "var(--status-warn)", border: "1px solid rgba(234,179,8,0.35)" }
        : { background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}
    >
      {isWarn && <Clock size={11} aria-hidden="true" />}{text}
    </span>
  );
  return (
    <Modal
      open onClose={onClose}
      title={row.full}
      subtitle={row.job ? tx(row.job) : null}
      icon={<UserCheck size={18} />}
      maxWidth="max-w-md"
      footer={<Button variant="secondary" onClick={onClose}>{t("kelish.close")}</Button>}
    >
      <div className="flex flex-wrap gap-1.5">
        {fact(source)}
        {row.came && fact(fill(t("kelish.lastCame"), { d: dm(row.came) }))}
        {warn && fact(warn, true)}
      </div>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>
          {t("kelish.sheetWeek")}
        </div>
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {data.days.map((d, i) => {
            const s = row.days[i];
            const lane = d.state === "today" || d.state === "tomorrow";
            const tag = tagOf(d, t);
            const word = d.state === "future" ? t("kelish.legendFuture") : !s ? t("kelish.legendOff") : markWord(s.mark, t);
            return (
              <div
                key={d.date}
                className="flex items-center gap-3 px-3 py-2"
                style={{ borderTop: i ? "1px solid var(--border)" : "none", ...(lane ? LANE : null) }}
              >
                <span className="w-16 flex-shrink-0 whitespace-nowrap text-xs font-medium tabular-nums" style={{ color: lane ? "var(--text-1)" : "var(--text-2)" }}>
                  {dayLabel(d.date, t)}
                </span>
                <span className="w-5 flex-shrink-0 grid place-items-center">
                  {d.state === "future" || !s ? <Chip off size={18} /> : <Chip mark={s.mark} lane={!s.mark && d.editable} size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm" style={{ color: s ? "var(--text-1)" : "var(--text-3)" }}>{word}</div>
                  {s?.by && (
                    <div className="text-[11px] leading-4 sm:flex sm:gap-1 min-w-0" style={{ color: "var(--text-2)" }}>
                      {/* a phone gives «who» and «when» a line each — the two
                          never fit one there, and a line ending in «·» read as
                          broken; from sm up they share one line */}
                      <span className="block truncate sm:order-2">{fill(t("kelish.by"), { name: shortPerson(titleCase(tl(s.by))) })}</span>
                      {s.at && <span className="block tabular-nums whitespace-nowrap sm:order-1 sm:after:content-['·'] sm:after:ml-1">{stamp(s.at)}</span>}
                    </div>
                  )}
                </div>
                {tag && (
                  <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: "var(--text-2)" }}>{tag}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
