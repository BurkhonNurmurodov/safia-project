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
import { useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check, Clock, Lock, Minus, Plus, Trash2, Undo2, UserCheck, UserMinus, UserPlus, Users, X,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard from "../components/ui/DataTable";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import DayStepper from "../components/ui/DayStepper";
import EmptyState from "../components/ui/EmptyState";
import FormField from "../components/ui/FormField";
import Modal from "../components/ui/Modal";
import SegmentedToggle from "../components/ui/SegmentedToggle";
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
// An open day's unanswered cell: a brand wash that says «tap here».
const LANE = { background: "rgba(var(--brand-rgb), 0.08)" };
// The open days' header, opaque because the header row is sticky.
const LANE_HEAD = "linear-gradient(rgba(var(--brand-rgb), 0.14), rgba(var(--brand-rgb), 0.14)), var(--bg-inner)";

// The grid's geometry, named ONCE: every day column is --kd wide and every row
// ROW_H high, so all cells are one size. On a 384px phone the whole week fits
// with no sideways scroll (7 × 32px, ~125px left for the name); wider screens
// widen the days, not the name.
const GRID = "[--kd:32px] sm:[--kd:60px] lg:[--kd:64px]";
const ROW_H = "h-11 sm:h-10";

const fill = (s, params) =>
  Object.entries(params || {}).reduce((out, [k, v]) => out.split(`{${k}}`).join(String(v ?? "")), s);

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

// A cell in miniature, for the legend and the worker card.
function Chip({ mark = null, off = false, size = 14 }) {
  const Icon = mark === "yes" ? Check : mark === "no" ? X : null;
  const style = mark ? FILL[mark] : off ? { ...OFF, border: "1px solid var(--border)" } : { background: "var(--bg-card)", border: "1px solid var(--border-md)" };
  return (
    <span
      aria-hidden="true"
      className="inline-grid place-items-center rounded-[3px] flex-shrink-0"
      style={{ width: size, height: size, ...style }}
    >
      {Icon && <Icon style={{ width: size - 4, height: size - 4 }} strokeWidth={3.5} />}
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
      className="sticky top-0 z-10 px-0 py-1.5 text-center font-normal"
      style={{
        background: current ? LANE_HEAD : "var(--bg-inner)",
        boxShadow: current ? "inset 0 -2px 0 var(--brand)" : "inset 0 -1px 0 var(--border)",
      }}
    >
      <span className="block text-[10px] leading-3 font-medium uppercase" style={{ color: current ? "var(--brand-text)" : "var(--text-3)" }}>
        {t(`cal.d${dow(day.date)}`)}
      </span>
      <span
        className="block mt-0.5 text-xs leading-4 font-semibold tabular-nums"
        style={{ color: future ? "var(--text-4)" : current ? "var(--brand-text)" : "var(--text-1)" }}
      >
        <span className="sm:hidden">{day.date.slice(8, 10)}</span>
        <span className="hidden sm:inline">{dm(day.date)}</span>
      </span>
    </th>
  );
}

// One line under the grid: on an open week it is the tap cycle itself, which
// is also the whole legend; on a closed one, the three answers.
function Legend({ open, t }) {
  const arrow = <span aria-hidden="true" style={{ color: "var(--text-4)" }}>→</span>;
  if (open) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="font-medium" style={{ color: "var(--text-2)" }}>{t("kelish.tapLead")}</span>
        <Chip />{arrow}
        <span className="inline-flex items-center gap-1"><Chip mark="yes" />{t("kelish.yes")}</span>{arrow}
        <span className="inline-flex items-center gap-1"><Chip mark="no" />{t("kelish.no")}</span>{arrow}
        <Chip />
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

// ── the page ────────────────────────────────────────────────────────────────

export default function Kelish() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();
  const { ready } = useFactory();
  const factorySection = useFactorySection();

  const [week, setWeek] = useState(null);                 // a Monday; null = the plant's current week
  const [unitPick, setUnitPick] = usePersistentState("kelish.unit", null);
  const [shiftPick, setShiftPick] = usePersistentState("kelish.shift", null);
  const [cellPick, setCellPick] = usePersistentState("kelish.cell", null);
  const [sheet, setSheet] = useState(null);               // the worker whose week card is open

  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeErr, setRemoveErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addErr, setAddErr] = useState("");
  const [adding, setAdding] = useState(false);

  // One request chain per (worker, day), so two quick taps land in order;
  // `ver` keeps an older answer from repainting a newer tap.
  const queues = useRef(new Map());
  const ver = useRef(new Map());
  const pending = useRef(0);
  // The squares a tap changed this week — the only ones that animate, so a
  // week opening does not pop every square on it at once.
  const [pops, setPops] = useState(() => new Set());

  const nameOf = (raw) => titleCase(tl(raw));

  const errText = (e) => {
    const d = e?.response?.data;
    const raw = d?.detail_raw ?? d?.detail;
    const code = raw && typeof raw === "object" ? raw.code : null;
    switch (code) {
      case "exists": return fill(t("kelish.errExists"), { name: nameOf(raw.name) });
      case "name_required": return t("kelish.errName");
      case "day_locked": return t("kelish.errDayLocked");
      case "read_only": return t("kelish.errReadOnly");
      case "not_on_list": return t("kelish.errNotOnList");
      default: return (typeof d?.detail === "string" && d.detail) || t("kelish.errSave");
    }
  };

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
  const cell = cellsShown.find((c) => c.id === cellPick) || cellsShown[0] || null;

  // ── the week ──────────────────────────────────────────────────────────────
  const weekKey = ["kelish-week", cell?.id ?? null, weekFrom];
  const weekQ = useQuery({
    queryKey: weekKey,
    queryFn: () => api.get("/api/kelish/week", { params: { cell_id: cell.id, date: weekFrom } }).then((r) => r.data),
    enabled: !!cell && !!weekFrom,
    // Keep the grid while only the WEEK changes; never show one cell's names
    // under another cell's title.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey?.[1] === cell?.id ? prev : undefined),
    refetchInterval: () => (pending.current > 0 ? false : 60_000),
    refetchOnWindowFocus: () => pending.current === 0,
  });
  const data = weekQ.data && weekQ.data.cell?.id === cell?.id ? weekQ.data : null;
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
  const firstLeft = view.findIndex((r) => !r.current);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["kelish-week"] });
    qc.invalidateQueries({ queryKey: ["kelish-cells"] });
  };
  const exitSelect = () => { setSelecting(false); setSel(new Set()); };

  const pickCell = (id) => {
    setCellPick(id);
    exitSelect();
    qc.invalidateQueries({ queryKey: ["kelish-cells"] });
  };
  const pickWeek = (iso) => {
    setWeek(iso === thisWeek ? null : iso);
    setPops(new Set());
    exitSelect();
  };

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
        toast.error(`${t("kelish.errSave")}: ${errText(e)}`);
        qc.invalidateQueries({ queryKey: key });
      })
      .finally(() => { pending.current -= 1; });
    queues.current.set(id, run);
  };

  // Arrow keys walk the open squares like a spreadsheet — down a column to
  // fill a day, across to the other open day.
  const onGridKey = (e) => {
    const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    const el = step && e.target.closest?.("[data-ks]");
    if (!el) return;
    const [r, c] = el.dataset.ks.split(":").map(Number);
    for (let k = 1; k <= view.length + 7; k += 1) {
      const rr = r + step[0] * k;
      const cc = c + step[1] * k;
      if (rr < 0 || rr >= view.length || cc < 0 || cc > 6) break;
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
          onChange={(v) => { setShiftPick(v === "all" ? null : v); exitSelect(); }}
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
          onChange={(v) => { setUnitPick(v); setCellPick(null); exitSelect(); }}
          close={close}
        />
      ),
    });
  }

  // Each cell's chip says how far its NEXT list is filled.
  const nextCounts = days.find((d) => d.state === "tomorrow")?.counts;
  const cellOptions = cellsShown.map((c) => {
    const p = c.id === cell?.id && nextCounts ? nextCounts : c.progress;
    return {
      value: c.id,
      title: c.leader ? tl(c.leader) : undefined,
      label: p && p.total ? `${c.code} · ${p.yes + p.no}/${p.total}` : c.code,
    };
  });

  // ── header of the card ────────────────────────────────────────────────────
  const leaderShort = (name) => titleCase(tl(name || "")).split(" ").filter(Boolean).slice(0, 2).join(" ");
  const cellTitle = cell ? cellLabel(cell.code, cell.leader ? leaderShort(cell.leader) : "") : "";
  // A closed week says so beside the title — inline, so the header never
  // grows a line and pushes the grid down.
  const headRight = locked ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--text-3)" }}>
      <Lock size={12} aria-hidden="true" />{t("kelish.readOnly")}
    </span>
  ) : null;

  // Whether a worker has stopped coming — printed only while choosing whom to
  // remove; the worker card carries it the rest of the time.
  const absence = (r) => (r.never ? fill(t("kelish.never"), { n: WINDOW_DAYS })
    : r.warn ? fill(t("kelish.quiet"), { n: r.quiet }) : null);

  const slotLabel = (r, d, s) => {
    const bits = [r.full, dayLabel(d.date, t)];
    if (d.state === "future") bits.push(t("kelish.legendFuture"));
    else if (!s) bits.push(t("kelish.legendOff"));
    else {
      bits.push(markWord(s.mark, t));
      if (s.by && s.by_other) bits.push(fill(t("kelish.by"), { name: shortPerson(tl(s.by)) }));
    }
    return bits.join(" · ");
  };

  // ── footer ────────────────────────────────────────────────────────────────
  const footer = !data ? null : selecting ? (
    <>
      <Button
        variant="danger" tint size="lg" icon={<Trash2 size={15} />}
        disabled={!sel.size} onClick={() => { setRemoveErr(""); setConfirmOpen(true); }}
      >
        {fill(t("kelish.removeN"), { n: sel.size })}
      </Button>
      <span className="hidden sm:inline text-xs" style={{ color: "var(--text-3)" }}>{t("kelish.selectHint")}</span>
      <Button variant="secondary" size="lg" className="ml-auto" onClick={exitSelect}>{t("common.cancel")}</Button>
    </>
  ) : (
    <>
      {/* How to read the grid lives UNDER it: copy above it moves every row. */}
      <div className="min-w-0 flex-1 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
        <Legend open={openAny} t={t} />
      </div>
      {openAny && (
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="lg" icon={<Plus size={17} />} aria-label={t("kelish.add")} title={t("kelish.add")} onClick={openAdd} />
          <Button
            variant="secondary" size="lg" icon={<Minus size={17} />}
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
  const FOOT = { position: "sticky", bottom: 0, zIndex: 10, background: "var(--bg-inner)", boxShadow: "inset 0 1px 0 var(--border-md)" };

  const nameHead = (
    <th
      scope="col"
      className="sticky top-0 z-10 px-2 sm:px-3 py-1.5 text-left align-middle font-semibold"
      style={{ background: "var(--bg-inner)", color: "var(--text-3)", boxShadow: "inset 0 -1px 0 var(--border)" }}
    >
      {selecting ? (
        <label className="inline-flex items-center gap-2 cursor-pointer text-[11px] font-medium">
          <input
            type="checkbox" checked={allSel}
            ref={(el) => { if (el) el.indeterminate = someSel && !allSel; }}
            onChange={toggleAll}
            className="w-4 h-4 cursor-pointer accent-[var(--brand)]"
          />
          {t("kelish.selectAll")}
        </label>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
          {t("kelish.colWorker")}
          {data && <span className="tabular-nums normal-case tracking-normal" style={{ color: "var(--text-2)" }}>{currentCount}</span>}
        </span>
      )}
    </th>
  );

  const nameCell = (r) => {
    const ink = r.current ? "var(--text-1)" : "var(--text-3)";
    const away = selecting ? absence(r) : null;
    const text = (
      <>
        {/* phone: surname over given name — two short lines fit where one
            long one would be cut to nothing */}
        <span className="sm:hidden block min-w-0">
          <span className="block text-[13px] leading-4 font-semibold truncate" style={{ color: ink }}>{r.surname}</span>
          <span className="block text-[11px] leading-[14px] truncate" style={{ color: away ? "var(--status-warn)" : "var(--text-3)" }}>
            {away || r.given || "\u00a0"}
          </span>
        </span>
        <span className="hidden sm:block min-w-0">
          <span className="block text-[13px] leading-5 font-medium truncate" style={{ color: ink }}>{r.display}</span>
          {away && <span className="block text-[11px] leading-4 truncate" style={{ color: "var(--status-warn)" }}>{away}</span>}
        </span>
      </>
    );
    return (
      <td className="px-2 sm:px-3 py-0 align-middle">
        {selecting ? (
          <label
            className={`flex items-center gap-2 min-w-0 ${r.removeKey ? "cursor-pointer" : "opacity-50"}`}
            title={r.full}
          >
            <input
              type="checkbox" checked={sel.has(r.key)} disabled={!r.removeKey} aria-label={r.display}
              onChange={() => toggleSel(r.key)}
              className="w-4 h-4 flex-shrink-0 cursor-pointer accent-[var(--brand)] disabled:cursor-default"
            />
            <span className="min-w-0 flex-1">{text}</span>
          </label>
        ) : (
          <button
            type="button"
            onClick={() => setSheet(r.key)}
            title={`${r.full} · ${t("kelish.details")}`}
            className="block w-full min-w-0 text-left rounded-md hover:underline decoration-[var(--border-md)] underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"
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
          {s.mark && <MarkIcon mark={s.mark} />}
        </span>
      );
    }
    return <td key={d.date} className="p-0 align-middle">{body}</td>;
  };

  const skeletonRows = Array.from({ length: 7 }).map((_, i) => (
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

  const grid = (
    <TableCard
      icon={UserCheck} headSize="lg"
      title={cellTitle} right={headRight}
      fixed minWidth={320} footer={footer} hover={false}
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
            <th key={d.date} className="sticky top-0 z-10 px-0 py-1.5" style={{ background: "var(--bg-inner)", boxShadow: "inset 0 -1px 0 var(--border)" }}>
              <div className="flex flex-col items-center gap-1">
                <SkeletonBlock className="h-2.5 w-4" />
                <SkeletonBlock className="h-3.5 w-6" />
              </div>
            </th>
          ) : <DayHead key={d.date} day={d} t={t} />))}
        </tr>
      </thead>
      <tbody onKeyDown={onGridKey} style={dim}>
        {!data && skeletonRows}
        {data && view.length === 0 && (
          <tr>
            <td colSpan={8} className="px-4 py-10 text-center text-sm whitespace-normal" style={{ color: "var(--text-3)" }}>
              {openAny ? t("kelish.emptyList") : t("kelish.emptyListRO")}
            </td>
          </tr>
        )}
        {data && view.map((r, ri) => (
          <FragmentRow key={r.key} divider={ri === firstLeft && firstLeft > 0 ? fill(t("kelish.leftGroup"), { n: view.length - firstLeft }) : null}>
            <tr style={selecting && sel.has(r.key) ? { background: "var(--brand-bg)" } : undefined}>
              {nameCell(r)}
              {days.map((d, i) => dayCell(r, ri, d, i))}
            </tr>
          </FragmentRow>
        ))}
      </tbody>
      {data && view.length > 0 && (
        <tfoot style={dim}>
          {/* One figure per day: how many are coming. The full split is on hover. */}
          <tr>
            <td className="px-2 sm:px-3 h-9 align-middle" style={FOOT}>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>
                <Chip mark="yes" size={12} />{t("kelish.yes")}
              </span>
            </td>
            {days.map((d) => {
              const c = d.counts;
              const any = c && c.yes + c.no > 0;
              return (
                <td
                  key={d.date}
                  className="p-0 text-center align-middle text-xs font-bold tabular-nums"
                  style={FOOT}
                  title={d.state !== "future" && c ? countsText(c, t) : undefined}
                >
                  {d.state === "future" ? null : any
                    ? <span style={{ color: "var(--status-ok)" }}>{c.yes}</span>
                    : <span className="font-normal" style={{ color: "var(--text-4)" }}>—</span>}
                </td>
              );
            })}
          </tr>
        </tfoot>
      )}
    </TableCard>
  );

  // ── render ────────────────────────────────────────────────────────────────
  let body;
  if (!cellsQ.data && (cellsQ.isLoading || !ready)) {
    body = (
      <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-10 w-full" />)}
      </div>
    );
  } else if (cellsQ.isError && !cellsQ.data) {
    body = (
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState
          title={t("kelish.errLoad")} message={errText(cellsQ.error)} showUploadLink={false}
          action={<Button variant="secondary" onClick={() => cellsQ.refetch()}>{t("kelish.retry")}</Button>}
        />
      </div>
    );
  } else if (!cell) {
    body = (
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState
          icon={UserCheck} showUploadLink={false} height="h-48"
          title={t("kelish.noCellsTitle")}
          message={scopeKind === "leader" ? t("kelish.noCellsLeader") : t("kelish.noCells")}
        />
      </div>
    );
  } else if (weekQ.isError && !data) {
    body = (
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState
          title={t("kelish.errLoad")} message={errText(weekQ.error)} showUploadLink={false}
          action={<Button variant="secondary" onClick={() => weekQ.refetch()}>{t("kelish.retry")}</Button>}
        />
      </div>
    );
  } else {
    body = grid;
  }

  const sheetRow = sheet ? view.find((r) => r.key === sheet) || null : null;

  return (
    <Layout title={t("nav.kelish")}>
      <div className="mx-auto w-full max-w-3xl flex flex-col gap-3">
        {(cell || sections.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {cell && weekFrom && (
              <DayStepper
                week value={weekFrom} onChange={pickWeek} max={cell.tomorrow}
                dotPrev={data && !stale && data.today < data.from ? t("kelish.dotHere") : null}
                dotNext={data && !stale && data.tomorrow > data.to ? t("kelish.dotHere") : null}
              />
            )}
            {sections.length > 0 && <FilterPanel sections={sections} />}
          </div>
        )}

        {cellsShown.length > 1 && cell && (
          <SegmentedToggle value={cell.id} onChange={pickCell} options={cellOptions} ariaLabel={t("kelish.cell")} />
        )}

        {body}
      </div>

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
                    <div className="text-sm truncate" style={{ color: "var(--text-1)" }}>{nameOf(g.name)}</div>
                    {g.job && <div className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>{tx(g.job)}</div>}
                  </div>
                  <Button variant="secondary" size="md" icon={<Undo2 size={13} />} disabled={adding} onClick={() => submitAdd(g.name)}>
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
            className="px-2 sm:px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}
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
                <span className="w-14 flex-shrink-0 text-xs font-medium tabular-nums" style={{ color: lane ? "var(--brand-text)" : "var(--text-2)" }}>
                  {dayLabel(d.date, t)}
                </span>
                <span className="w-5 flex-shrink-0 grid place-items-center">
                  {d.state === "future" || !s ? <Chip off size={18} /> : <Chip mark={s.mark} size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm" style={{ color: s || d.state === "future" ? "var(--text-1)" : "var(--text-3)" }}>{word}</div>
                  {s?.by && (
                    <div className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>
                      {fill(t("kelish.by"), { name: shortPerson(tl(s.by)) })}{s.at ? ` · ${stamp(s.at)}` : ""}
                    </div>
                  )}
                </div>
                {tag && (
                  <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: "var(--brand-text)" }}>{tag}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
