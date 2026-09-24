import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  ChevronRight, ChevronDown,
  AlertTriangle, Pencil, Save, Plus, Trash2,
  Target, Users, ClipboardList, Clock, Gauge, Boxes, Loader2, Layers,
  Download, CheckCircle, Lock, Unlock, Undo2, Redo2, X, History,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import { SkeletonBlock, SkeletonTable } from "../components/ui/Skeleton";
import CellLink from "../components/ui/CellLink";
import { FilterPanel, OptsFilter, PickFilter } from "../components/ui/ColumnFilter";
import DayStepper from "../components/ui/DayStepper";
import StyledSelect from "../components/ui/StyledSelect";
import SearchInput from "../components/ui/SearchInput";
import ColumnsPicker from "../components/ui/ColumnsPicker";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import TableCard, { SectionHead, Th } from "../components/ui/DataTable";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Field from "../components/ui/FormField";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import GroupBadge from "../components/ui/GroupBadge";
import { useToast } from "../components/ui/Toast";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useCapabilities } from "../hooks/useCapabilities";
import { usePersistentState } from "../hooks/usePersistentState";
import useUndoStack, { useUndoHotkeys } from "../hooks/useUndoStack";
import { useLang } from "../context/LangContext";
import { useFactory } from "../context/FactoryContext";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useTranslit } from "../utils/transliterate";
import { CATEGORY_COLORS } from "../utils/chartPalette";
import { GREEN, AMBER, RED, vypColor, loadColor } from "../utils/statusBands";
// The bands these colours are judged by are an admin setting now, edited on
// «Smena hisoboti». This page paints them, so it subscribes: the helpers above
// answer from module state, and without the subscription this page would go on
// painting the defaults until something else happened to re-render it.
import useStatusBands from "../hooks/useStatusBands";
import { exportXlsx } from "../utils/exportXlsx";
import { GROUP_LETTERS, wcGroupLabel } from "../utils/wcGroup";
import { cellLabel } from "../utils/cellName";

// ── helpers ────────────────────────────────────────────────────────────────
// Timezone-safe: build/shift dates from calendar parts, never via toISOString()
// (which converts through UTC and drops a day east of Greenwich, e.g. Tashkent).
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmt = (v, d = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: d });
const pct = (v) => (v === null || v === undefined || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(0)}%`);
const ddmmyyyy = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };
// The page scope's shift filter — the platform runs two shifts and
// `Manager.shift` holds nothing else, so the control offers the same three
// answers everywhere rather than a set derived from the loaded rows.
const SHIFTS = ["all", "1", "2"];

// Status colours and the completion / load bands live in utils/statusBands.js —
// the «Smena hisoboti» table on Overview paints these same two figures, and one
// number must not read green here and yellow there. Both bands compare the
// WHOLE percent `pct` prints.

// per-команда identity colour — stable for a given work-center code (hash → palette),
// so the same team keeps its colour across the cards and the table regardless of order.
const WC_PALETTE = CATEGORY_COLORS; // shared generic-first category order
const wcColor = (wc) => {
  const s = String(wc ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return WC_PALETTE[h % WC_PALETTE.length];
};
const hexToRgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// «Команда» → the registry cell standing there: the backend resolves each
// work-center code against the cells registry (code → cells.sap_code) and rides
// the result on work_centers[].cell (and groups[].cell). As a TOOLTIP a cell is
// its CODE — with the group letter it carries — and the leader answerable for
// it, never its workshop name («A cell is its CODE», utils/cellName.js). The chip
// it sits on prints the work centre's code, so this is what says WHICH cell the
// link opens. `group` defaults to the cell's own letter.
const cellTitle = (cell, tl, group = cell?.wc_group) => (cell?.verifix_code
  ? cellLabel(wcGroupLabel(cell.verifix_code, group), cell.leader ? tl(cell.leader) : "")
  : "");

// Column definitions — labels/hints resolved via t() at render (see COLS map below).
// Order follows the ABC Excel ("Sheet1 ...") with ONE deliberate departure: ПЛАН
// comes before Факт (the operator's call, 2026-09-01). A row reads as "what was
// asked for, then what came of it", and the form's own order put the answer
// first. The export is unaffected — it emits the fixed ABC template, whose
// columns are set by that form and never by this catalog.
const COLS = [
  { key: "seq", labelKey: "production.col.seq", align: "center", hintKey: "production.col.seqHint" },
  { key: "sap_code", labelKey: "production.col.sapCode", align: "left" },
  { key: "op", labelKey: "production.col.op", align: "center", hintKey: "production.col.opHint" },
  { key: "name", labelKey: "production.col.name", align: "left" },
  { key: "labor", labelKey: "production.col.labor", align: "center", hintKey: "production.col.laborHint" },
  { key: "wc", labelKey: "production.col.wc", align: "center" },
  // The line's GROUP at its Команда (services/wc_group.py) — beside the Команда
  // because it is the second half of that answer: which of the cells standing
  // at one work centre this line's minutes belong to.
  { key: "wc_group", labelKey: "production.col.group", align: "center", hintKey: "production.col.groupHint" },
  { key: "people", labelKey: "production.col.people", align: "center" },
  { key: "vyp", labelKey: "production.col.vyp", align: "center", hintKey: "production.col.vypHint" },
  { key: "plan", labelKey: "production.col.plan", align: "center", edit: true, hintKey: "production.col.planHint" },
  { key: "fact", labelKey: "production.col.fact", align: "center", edit: true, hintKey: "production.col.factHint" },
  // Where the two columns above come from — the file, or a person. It sits
  // directly after them because that is the question it answers.
  { key: "autofill", labelKey: "production.col.source", align: "center", hintKey: "production.col.sourceHint" },
  { key: "actual_labor", labelKey: "production.col.actualLabor", align: "center", hintKey: "production.col.actualLaborHint" },
  { key: "labor_total", labelKey: "production.col.totalLabor", align: "center", hintKey: "production.col.totalLaborHint" },
  { key: "minutes", labelKey: "production.col.minutes", align: "center" },
  { key: "pareto", labelKey: "production.col.pareto", align: "center", hintKey: "production.col.paretoHint" },
];

// Notion-style column picker for the Positions table: per-profile pref key and
// the columns that can never be hidden (the row's identity).
const COL_PREF_KEY = "production.positions.cols";
const LOCKED_COLS = new Set(["name"]);
// Hidden until the reader unhides it. «Опер.» (the operator's call,
// 2026-09-02) is blank on almost every row, so it spent a column on nothing.
// «Манба» (2026-09-09) is off for everyone BUT AN ADMIN: it answers whether the
// row's ПЛАН/ФАКТ came from the SAP file or from a person, which is the same
// question the per-row auto-fill switch is set from — and only an admin can set
// one, or upload the file the other half of the answer names. Everybody else
// was spending a column on a fact they cannot act on.
// It is a DEFAULT and not a lock: the picker still offers it to everyone, one
// tap away, because a supervisor asking "why is this number not the file's"
// must be able to see the answer. Applied only while a profile has never saved
// a visibility choice — a saved `hidden` list, an empty one included («Show
// all»), is that person's answer and stands.
// «Guruh» follows the same reasoning: only an admin sets a line's group, and the
// Команда chip already carries the letter beside the code for everybody else.
const defaultHidden = (isAdmin) => (isAdmin ? ["op"] : ["op", "autofill", "wc_group"]);
// The group column exists only for a unit that HAS groups — on every other unit
// it would be a column of «—» and a picker row that toggles nothing, and a unit
// nobody has grouped must read exactly as it did before groups existed.
const GROUP_COL = "wc_group";
// Letters are served sorted, but a letter appended as an `extra` is not.
const byLetter = (a, b) => GROUP_LETTERS.indexOf(a) - GROUP_LETTERS.indexOf(b);
// A work centre is grouped when the dashboard lists groups under it (contract:
// its cells carry a letter, a line there carries one, or a group pin exists).
// That answers «are there letters to SHOW», never «is there a group to TYPE».
const isGrouped = (w) => Array.isArray(w?.groups) && w.groups.length > 0;
// Is the centre's «Кол-во» typed per group? Only while a CELL carries one of its
// letters. A centre lettered by ORPHANS alone (an unlettered cell, lines lettered
// «A» from an ABC file) has no group anybody can type — an orphan row is
// read-only and the backend refuses a new pin under its letter — so reading it as
// grouped left its «Bugungi fakt» typable nowhere on this page while pp_calc went
// on reading the whole-centre pin. Such a centre takes the ordinary input and its
// letters stay on screen as display-only badges. This decides every INPUT shape
// and every typed/complete rule; `isGrouped` is left deciding only the display.
const typesPerGroup = (w) => isGrouped(w) && w.groups.some((g) => !g.orphan);
// Is a work centre's «Кол-во» a FACT for the whole centre, off the SAVED pins?
// Not typed per group (`typesPerGroup`): its pin — pp_calc raises the flag for a
// stored orphan pin as well, since that pin answers for the centre. Typed per
// group: once any group pin stands, every group a CELL
// carries needs its own — an ORPHAN letter has no cell and nobody to count, so
// it can never be what keeps a centre incomplete — and with no group pin, the
// whole-centre pin (the cells share it). `people_overridden` alone read a centre
// with one of two groups typed as fully typed: its ΣN and СР. ЗАГРУЖЕННОСТЬ lost
// their «*» while the «Кол-во» tab marked the same centre incomplete. ONE rule
// for the KPIs, the команда cards and that tab.
const typedCentre = (w) => {
  if (!typesPerGroup(w)) return !!w.people_overridden;
  if (w.groups.some((g) => g.people_overridden)) {
    return w.groups.filter((g) => !g.orphan).every((g) => g.people_overridden);
  }
  return w.people_whole != null;
};
// The draft key of one group's «Кол-во» — a work-centre code never holds «|».
const gKey = (wc, group) => `${wc}|${group}`;
// A group badge's tooltip: the cell carrying the letter, named by its CODE
// («7421 · A», wcGroupLabel — the order /cells and the backend print) and its
// leader — or, for an ORPHAN letter, that no cell of the unit carries it.
const groupTitle = (t, g, tl) => (g?.orphan ? t("production.group.orphan")
  : g?.cell?.verifix_code ? cellTitle(g.cell, tl, g.group) : g?.group);
// Why an untyped group's figure is not a typed fact. An untyped group a cell
// carries reads its SHARE of what the centre holds (wc_group.share) — the
// whole-centre pin while no group is typed — so that is named; an orphan has no
// cell at all; anything else is simply not entered.
const groupUntypedTitle = (t, w, g) => (g.orphan ? t("production.group.orphan")
  : g.people != null && w.people_whole != null && !w.groups.some((x) => x.people_overridden)
    ? t("production.group.wholeCell") : t("production.peopleNotEnteredCell"));

// Sort accessor per column — mirrors how each cell derives its value, so a header
// click sorts on exactly what the row shows. Returns null for "missing" cells
// (no labour / no plan) so they sink to the bottom regardless of direction.
const sortVal = (r, key) => {
  switch (key) {
    case "seq":          return r.seq ?? null;
    case "sap_code":     return r.sap_code;
    case "op":           return r.op ?? null;
    case "name":         return r.name;
    case "labor":        return r.has_labor ? r.labor_time : null;
    case "wc":           return r.work_center;
    case "wc_group":     return r.wc_group ?? null;
    case "people":       return r.people;
    case "vyp":          return r.total_labor ? r.actual_labor / r.total_labor : null;
    case "fact":         return r.actual_qty;
    // Groups the manual rows together; the chip below says which is which.
    case "autofill":     return r.sap_filled === false ? 0 : 1;
    case "plan":         return r.plan_qty;
    case "actual_labor": return r.actual_labor;
    case "labor_total":  return r.total_labor;
    case "minutes":      return r.minutes;
    case "pareto":       return r.pareto;
    default:             return null;
  }
};

// ── thin progress bar ────────────────────────────────────────────────────────
function Bar({ value, color, height = 6, track = "var(--bg-inner)" }) {
  const w = Math.max(0, Math.min(1, value ?? 0)) * 100;
  return (
    <div className="rounded-full overflow-hidden w-full" style={{ height, background: track }}>
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color, transition: "width .35s ease" }} />
    </div>
  );
}

// ── KPI tile ────────────────────────────────────────────────────────────────
function Kpi({ label, value, icon: Icon, accent, bar, barColor, primary }) {
  return (
    <div
      className="rounded-2xl px-4 py-3.5 flex-1 min-w-[150px]"
      style={{
        background: primary ? "var(--brand-bg)" : "var(--bg-card)",
        border: `1px solid ${primary ? "var(--brand-border)" : "var(--border)"}`,
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{label}</span>
        {Icon && <Icon size={15} style={{ color: accent || "var(--text-4)", opacity: 0.85 }} />}
      </div>
      <div className="text-2xl font-bold tabular-nums leading-none" style={{ color: accent || "var(--text-1)" }}>{value}</div>
      {bar !== undefined && <div className="mt-2.5"><Bar value={bar} color={barColor || accent || "var(--brand)"} height={5} /></div>}
    </div>
  );
}

// ── completion cell (Вып %) — bar + colour ───────────────────────────────────
function VypCell({ value }) {
  if (value == null) return <span style={{ color: "var(--text-4)" }}>—</span>;
  const c = vypColor(value);
  return (
    <div className="flex items-center gap-2 justify-center">
      <div className="w-10 hidden sm:block"><Bar value={value} color={c} height={4} /></div>
      <span className="tabular-nums font-semibold" style={{ color: c, minWidth: 46, textAlign: "right" }}>{pct(value)}</span>
    </div>
  );
}

// ── editable qty cells (ПЛАН / Факт) — Excel-style: the CELL is the editor ───
// Grid coordinates live in the DOM, not in React state: every editable cell tags
// itself with its column key and row index, so sorting, filtering or hiding a
// column can never leave a stale coordinate behind. `qCells` reads them back in
// document order.
const qCells = (el) => Array.from(el.closest("table")?.querySelectorAll("[data-qcol]") ?? []);
// Tab walks them in reading order — …, ПЛАН, Факт, next row's ПЛАН.
const stepCell = (el, delta) => { const all = qCells(el); all[all.indexOf(el) + delta]?.focus(); };
// Enter and the arrows keep the column and move by row (clamped, never wrapped).
const moveCell = (el, dCol, dRow) => {
  const all = qCells(el);
  const cols = [...new Set(all.map((n) => n.dataset.qcol))];
  const col = cols[Math.min(cols.length - 1, Math.max(0, cols.indexOf(el.dataset.qcol) + dCol))];
  const row = Number(el.dataset.qrow) + dRow;
  all.find((n) => n.dataset.qcol === col && Number(n.dataset.qrow) === row)?.focus();
};

// One click SELECTS the cell (ring around the whole cell); a double-click — or a
// second tap on a phone, or F2, or simply typing a digit — opens the editor, and
// the editor FILLS the cell instead of floating a small box inside it. Enter
// commits and drops to the cell below, Tab commits and steps right, Escape
// cancels, Delete clears the override.
function QtyCell({ col, row, value, onSave, readOnly = false, title }) {
  const { t } = useLang();
  const tdRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState(false);
  const [draft, setDraft] = useState("");
  const closed = useRef(false);   // this edit already committed or cancelled
  const touch = useRef(false);    // the last pointer on this cell was a finger
  const wasSel = useRef(false);   // …and the cell was already selected when it landed
  const grab = useRef(false);     // open the editor with its whole value selected
  const nav = useRef(null);       // where focus goes once the editor unmounts

  // `seed` = the character that opened the editor — typing over a selected cell
  // replaces its contents, as in Excel. Opened without one, the current value is
  // kept: a mouse or keyboard puts the caret at its end (the spreadsheet rule),
  // a finger takes the whole value selected, because a double-tap is a phone's
  // ONLY way in and clearing digits by hand on a touch keyboard is not editing.
  const start = (seed) => {
    if (editing) return;
    closed.current = false;
    grab.current = seed === undefined && touch.current;
    setDraft(seed ?? (value === null || value === undefined ? "" : String(value)));
    setEditing(true);
  };
  // `where` is where focus goes next — nothing means "leave focus alone", which
  // is what a blur needs: the click that closed this editor has its own target.
  const finish = (save, where) => {
    if (closed.current) return;
    closed.current = true;
    nav.current = where ?? null;
    setEditing(false);
    if (!save) return;
    const raw = draft.trim();
    const num = raw === "" ? null : Number(raw.replace(",", "."));
    if (raw !== "" && Number.isNaN(num)) return;
    if (num !== (value ?? null)) onSave(num);
  };

  // Focus moves only once the editor has actually unmounted — doing it inside the
  // key handler hands focus back to <body> the moment the input goes away.
  useEffect(() => {
    if (editing || !tdRef.current) return;
    const next = nav.current;
    nav.current = null;
    // No target = the editor was closed by a blur, and focus went wherever the
    // click that closed it landed. Removing a FOCUSED input fires no focusout of
    // its own, so the ring is re-read off the DOM rather than trusted to an
    // event that may never come — otherwise a cell somebody typed in keeps its
    // ring and reads as "this one was changed", which is exactly the mark an
    // edited value must not carry.
    if (!next) { setSel(document.activeElement === tdRef.current); return; }
    if (next.step) stepCell(tdRef.current, next.step);
    else if (next.d) moveCell(tdRef.current, next.d[0], next.d[1]);
    else tdRef.current.focus();
  }, [editing]);

  // Keys on the SELECTED cell (the editor has its own handler below).
  const onKeyDown = (e) => {
    if (editing) return;
    const k = e.key;
    if (k === "Enter" || k === "F2") { e.preventDefault(); start(); }
    else if (k === "Delete" || k === "Backspace") { e.preventDefault(); if (value != null) onSave(null); }
    else if (k === "Tab") { e.preventDefault(); stepCell(e.currentTarget, e.shiftKey ? -1 : 1); }
    else if (k === "ArrowDown") { e.preventDefault(); moveCell(e.currentTarget, 0, 1); }
    else if (k === "ArrowUp") { e.preventDefault(); moveCell(e.currentTarget, 0, -1); }
    else if (k === "ArrowRight") { e.preventDefault(); moveCell(e.currentTarget, 1, 0); }
    else if (k === "ArrowLeft") { e.preventDefault(); moveCell(e.currentTarget, -1, 0); }
    else if (k.length === 1 && /[\d.,-]/.test(k)) { e.preventDefault(); start(k); }
  };

  // A day the unit has signed off on is read-only, and it renders as an ORDINARY
  // cell: no grid coordinates, no cursor, no hover pencil, no tab stop. Leaving
  // the affordances on a cell whose save the API refuses teaches the operator
  // that editing here silently does nothing.
  if (readOnly) {
    return (
      <td title={title || undefined} className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-1)" }}>
        {fmt(value, 0)}
      </td>
    );
  }

  return (
    <td
      ref={tdRef}
      tabIndex={0}
      data-qcol={col}
      data-qrow={row}
      // ONE title. The shared-quantity sentence replaces the edit hint only on the
      // rows that carry it — a second `title` attribute here silently won over
      // this one and stripped the edit affordance off every cell in the table.
      title={title || t("production.editManually")}
      onKeyDown={onKeyDown}
      // The cell's OWN focus only. React's onFocus/onBlur are focusin/focusout,
      // which bubble — unguarded, the editor's focus marked the cell selected and
      // its unmount fired no focusout to unmark it, so every cell that had ever
      // been edited kept a gold ring and read as "this one was changed".
      onFocus={(e) => { if (e.target === e.currentTarget) setSel(true); }}
      onBlur={(e) => { if (e.target === e.currentTarget) setSel(false); }}
      // Read the selection BEFORE the browser's own focus-on-press lands, so the
      // tap that selects the cell is never the tap that opens it.
      onPointerDown={(e) => {
        touch.current = e.pointerType === "touch";
        wasSel.current = document.activeElement === e.currentTarget;
      }}
      onClick={(e) => {
        e.stopPropagation();          // never toggles the row's action strip
        // A finger has no double-click: the second tap on an already-selected
        // cell opens it. A mouse keeps the spreadsheet rule — only a real
        // double-click does.
        if (!touch.current) return;
        if (wasSel.current) start();
        else e.currentTarget.focus();  // some WebViews don't focus a tapped cell — arm it by hand
      }}
      onDoubleClick={() => start()}
      className="px-3 py-2 text-center relative select-none group outline-none"
      style={{
        cursor: "cell",
        touchAction: "manipulation",  // a double-tap edits the cell, never zooms the page
        boxShadow: sel && !editing ? "inset 0 0 0 1px var(--brand)" : undefined,
      }}
    >
      {/* A typed value is displayed as ANY REGULAR CELL — no colour, no weight,
          no dot. What the operator entered IS the figure for that day, not an
          annotation on the sheet’s, so nothing here says where it came from. */}
      <span className="inline-flex items-center gap-1 tabular-nums" style={{ color: "var(--text-1)" }}>
        {fmt(value, 0)}
        <Pencil size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
      </span>
      {/* the editor covers the cell's whole box — inset-0 resolves against the
          td's padding box, so the table's own grid lines stay visible around it */}
      {editing && (
        <input
          autoFocus
          value={draft}
          inputMode="decimal"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => { if (grab.current) e.target.select(); }}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); finish(true, { d: [0, 1] }); }
            else if (e.key === "Tab") { e.preventDefault(); finish(true, { step: e.shiftKey ? -1 : 1 }); }
            else if (e.key === "Escape") { e.preventDefault(); finish(false, {}); }
          }}
          className="absolute inset-0 w-full h-full text-center text-xs px-2 outline-none tabular-nums"
          style={{ background: "var(--bg-card)", border: "2px solid var(--brand)", borderRadius: 4, color: "var(--text-1)" }}
        />
      )}
    </td>
  );
}

// ── catalog edit-modal input (Сап код / Наименование / Труд. / Команда) ───────
// The standard full-width modal text input (matches the Concerns/Staff forms).
function ModalInput({ value, onChange, type = "text", className = "", placeholder }) {
  return (
    <input
      value={value}
      type={type}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${className}`}
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
    />
  );
}

// Catalog form body — the editable catalog fields (Сап код / Команда /
// Наименование / Труд. / Опер. / SAP auto-fill), shared by the create and edit
// modals so both stay identical. `draft` = { sap_code, name, labor_time,
// work_center, op, auto_fill }; `setDraft` is the curried (key) => (value) => …
// updater. A blank фаза keeps the cell following the day's фаза upload.
//
// `groupOpts` = [{ group, code }] — the letters this line may carry at the
// Команда the draft names right now (its cells' letters, plus the line's own),
// each with the verifix code of the cell that carries it (a cell is its CODE, so
// that is the one fact that tells the reader which cell a letter is). Empty ⇒
// the field is not drawn at all: a work centre nobody has grouped offers only
// «—», and a control with one answer is a control that says nothing.
function CatalogFields({ draft, setDraft, groupOpts = [] }) {
  const { t } = useLang();
  // The auto-fill switch appears only on a CODED line, because only a coded one
  // has a choice to make: the фаза file reaches a position through its SAP code,
  // so a code-less line is entered by hand whatever the flag says (the backend
  // answers the same way — a 400 rather than a setting nothing honours). It
  // follows the code box live, so typing a code reveals it.
  const hasCode = (draft.sap_code ?? "").trim() !== "";
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {/* only the code field carries a hint, so BOTH cells of the row take
            `alignTop` — otherwise the hint's height pushes Команда's input a
            line below its partner's (see FormField). */}
        <Field label={t("production.col.sapCode")} hint={t("production.cat.codeOptional")} alignTop>
          <ModalInput value={draft.sap_code} onChange={setDraft("sap_code")} className="font-mono" />
        </Field>
        <Field label={t("production.col.wc")} required alignTop>
          <ModalInput value={draft.work_center} onChange={setDraft("work_center")} className="font-mono" />
        </Field>
      </div>
      <Field label={t("production.col.name")}>
        <ModalInput value={draft.name} onChange={setDraft("name")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`${t("production.col.labor")} — ${t("production.col.laborHint")}`}>
          <ModalInput value={draft.labor_time} onChange={setDraft("labor_time")} type="number" />
        </Field>
        <Field label={t("production.col.op")}>
          <ModalInput value={draft.op ?? ""} onChange={setDraft("op")} className="font-mono" />
        </Field>
      </div>
      {groupOpts.length > 0 && (
        // The hint is the consequence, not a description: the letter is written
        // on THIS line and on no other (2026-09-18), so the two operations of one
        // position may name two cells — which is what the hint has to say, since
        // until that date choosing it here moved every line of the SKU.
        <Field label={t("production.col.group")} hint={t("production.group.fieldHint")}>
          <StyledSelect
            value={draft.wc_group ?? ""}
            onChange={setDraft("wc_group")}
            options={[
              { value: "", label: "—" },
              ...groupOpts.map(({ group, code }) => ({
                value: group,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <GroupBadge group={group} />
                    {code
                      ? <span className="font-mono">{code}</span>
                      : <span style={{ color: "var(--text-4)" }}>{t("production.group.noCell")}</span>}
                  </span>
                ),
                title: code ? wcGroupLabel(code, group) : group,
              })),
            ]}
          />
        </Field>
      )}
      {hasCode && (
        <Field label={t("production.autofill.label")} hint={t("production.autofill.hint")}>
          <SegmentedToggle
            fill
            value={draft.auto_fill === false ? "manual" : "sap"}
            onChange={(v) => setDraft("auto_fill")(v === "sap")}
            options={[["sap", t("production.autofill.sap")],
                      ["manual", t("production.autofill.manual")]]}
            ariaLabel={t("production.autofill.label")}
          />
        </Field>
      )}
    </>
  );
}

// Revealed-row action button — matches the Concerns / Staff requests ActionBtn
// (outlined chip, icon + label), so the selected-row action strip here reads the
// same as those tables. `loading` swaps the icon for a spinner and disables.
function ActionBtn({ icon: Icon, label, color, onClick, loading }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-opacity"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: color || "var(--text-2)", opacity: loading ? 0.6 : 1 }}
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />} {label}
    </button>
  );
}

// ── raw SAP file view (Фаза / Заголовок) ─────────────────────────────────────
// The two views RawView serves. THE list — the tab options, the render guard and
// the persisted-pick fallback all read it, so a role that cannot see these tabs
// cannot be left sitting on one of them either.
const RAW_VIEWS = ["faza", "zaga"];

function RawView({ fileType, date, managerParam, ready = true }) {
  const { t } = useLang();
  const [search, setSearch] = usePersistentState("production_raw_search", "");
  const { data, isLoading } = useQuery({
    queryKey: ["production-raw", fileType, date, managerParam.manager_id ?? "self"],
    queryFn: () => api.get("/api/production/raw", { params: { file_type: fileType, date, ...managerParam } }).then((r) => r.data),
    enabled: ready,
  });
  // clear a stale query when the file/date changes so its matches don't hide the new rows
  // (mount-guarded so the restored search survives the first render)
  const searchResetMounted = useRef(false);
  useEffect(() => {
    if (!searchResetMounted.current) { searchResetMounted.current = true; return; }
    setSearch("");
  }, [fileType, date]);

  // free-text filter across every column — the endpoint returns all rows, so this is client-side
  const rows = data?.rows;
  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.some((cell) => cell != null && String(cell).toLowerCase().includes(q)));
  }, [rows, search]);

  if (isLoading) return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SkeletonTable rows={8} cols={6} />
    </div>
  );
  if (!data?.present) {
    return (
      <div className="rounded-2xl p-8 text-center text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-4)" }}>
        {t("production.file")} «{fileType === "faza" ? t("production.viewFaza") : t("production.viewZaga")}» {t("production.notLoadedForDate")}
      </div>
    );
  }
  // The denominator is what the FILE holds for this date, not what this viewer
  // was served. A viewer pinned to part of the plant (supervisor / leader /
  // shift-manager) is served a slice, and printing «85 rows» over a slice reads
  // as the whole upload — the misreading this view was just fixed for. Falls
  // back to the served count, so a bundle talking to a backend that does not
  // send `total_rows` renders exactly what it always did.
  const fileRows = data.scoped ? (data.total_rows ?? data.row_count) : data.row_count;
  const filtering = filteredRows.length !== fileRows;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs" style={{ borderBottom: "1px solid var(--border)", color: "var(--text-3)" }}>
        <span className="font-semibold truncate" style={{ color: "var(--text-2)" }}>{data.filename || "—"}</span>
        <span className="flex-shrink-0 tabular-nums">{filtering ? `${filteredRows.length} / ${fileRows}` : fileRows} {t("production.rows")}{data.uploaded_at ? " · " + new Date(data.uploaded_at).toLocaleString("ru-RU") : ""}</span>
      </div>
      <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("production.rawSearchPlaceholder")}
          className="w-full sm:w-64"
          inputClassName="text-xs pl-8 pr-7 py-1.5"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap" style={{ color: "var(--text-1)" }}>
          <thead>
            <tr style={{ color: "var(--text-3)", background: "var(--bg-inner)" }}>
              {data.columns.map((c, i) => (
                <th key={i} className="px-3 py-2 font-medium text-left">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={data.columns.length || 1} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>
                  {t("production.noMatch")}
                </td>
              </tr>
            ) : filteredRows.map((r, ri) => (
              <tr key={ri} className="transition-colors hover:bg-[var(--bg-inner)]" style={{ borderTop: "1px solid var(--border)" }}>
                {r.map((cell, ci) => {
                  const num = typeof cell === "number";
                  return (
                    <td key={ci} className={`px-3 py-1.5 ${num ? "text-right tabular-nums" : "text-left"}`} style={ci === 0 ? { color: "var(--text-3)" } : undefined}>
                      {cell === null || cell === undefined || cell === "" ? "—" : String(cell)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── «Odamlar soni» tab ───────────────────────────────────────────────────────
// Two tables side by side.
//   LEFT  — what the formula SUGGESTS: N = ROUND(W × Σmehnat / S), with S = the
//           day's productive minutes per head. The efficiency box on top drives
//           it; «Qo'llash» only re-runs this preview, nothing is written, so a
//           brigadir can try «what if 90%» before committing.
//   RIGHT — the day's ACTUAL numbers, typed by the brigadir. Blank = follow the
//           formula, identical semantics to the staffing-card pin.
// Save writes the efficiency AND every pin in one call; the whole page (load %,
// ЛЮДИ, Минут, KPIs) then recomputes off them, for THIS date only.
const roundHalfUp = (x) => Math.floor(x + 0.5);

// The efficiency % is anchored to the real shift clock: N% × shift_min (480) =
// productive minutes per head, so 85% → 408. (The Excel's legacy «Для 85% труд»
// = 425 was 85% of a 500-minute nominal base — deliberately dropped: it made the
// suggestion staff cells to 88.5%+ of the shift while the load cards divide by
// 480, so a cell staffed "at 85%" showed ~100% load.)

// Both tables pin every row to ONE height so the cell rows sit side by side —
// a text row and a row of inputs are naturally 10px apart, which compounds down
// the table. Tall enough to clear the inputs (34px + padding).
const PT_ROW = "h-[48px]";

// The rows ONE grouped work centre contributes to POST /api/production/staffing.
// `groupPeople` = [[letter, people|null], …] — the value each group should hold.
//
// Normally that is a header row carrying the centre's штатка (people null) plus
// one row per group: once the body names a group, the groups are authoritative
// and the whole-centre «Кол-во» is cleared. The ONE exception is a centre that
// still holds a whole-centre figure while no group has been typed, on the
// server or in this save: it goes back as the ordinary row carrying that figure.
// Sending the grouped shape there would erase a number somebody typed on a save
// that was about something else — a штатка, another team — and the hint under
// the card already asks for it to be retyped per group. Typing any group moves
// the centre onto the grouped shape, which is also what the backend does to the
// whole-centre figure the moment a group pin is written.
//
// Shared by the tab's Save and by its undo snapshot, so the inverse of a save is
// always built by the same rule as the save itself.
function groupedStaffRows(w, shtatka, groupPeople) {
  const anyGroup = w.groups.some((g) => g.people_overridden) || groupPeople.some(([, v]) => v != null);
  if (w.people_whole != null && !anyGroup) {
    return [{ work_center: w.work_center, people: w.people_whole, shtatka }];
  }
  return [
    { work_center: w.work_center, people: null, shtatka },
    ...groupPeople.map(([group, people]) => ({ work_center: w.work_center, group, people })),
  ];
}

// The rows a centre NOT typed per group contributes (`typesPerGroup` false) —
// ungrouped, or lettered by orphans alone. The ordinary row, with one exception
// that CLEARS: a stored orphan pin still answers for such a centre (pp_calc folds
// it into `people`, and the box seeds from that), while a whole-centre row with
// no people leaves group pins standing — the backend drops them only for a typed
// figure — so an emptied box would spring back to the very number just removed.
// Emptying goes out as the grouped shape instead, every stored letter null: a
// clear is never refused for a letter no cell carries, only a NEW pin is.
// Shared by the tab's Save and its undo snapshot, like `groupedStaffRows`.
function centreStaffRows(w, people, shtatka) {
  const stored = isGrouped(w) ? w.groups.filter((g) => g.people_overridden) : [];
  if (people == null && stored.length) {
    return [
      { work_center: w.work_center, people: null, shtatka },
      ...stored.map((g) => ({ work_center: w.work_center, group: g.group, people: null })),
    ];
  }
  return [{ work_center: w.work_center, people, shtatka }];
}

// `canEditEff` gates the EFFICIENCY box separately from the cell rows: it pins
// the whole brigadir's unit for the day, so a leader — whose page is cut to
// their own cells — may type their cells' headcount but never re-time cells
// that are not theirs. Their save carries rows only; the backend refuses a
// `productive_min` from a cell-scoped caller and leaves the unit's pin alone.
function PeopleTab({ wcs, constants, loading, canEdit, canEditEff = canEdit, hint, onSave, saving, savedAt }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const shiftMin = Number(constants?.shift_min) || 480;
  const curPm = Number(constants?.productive_min) || 408;
  const pctOf = (min) => Math.round((min / shiftMin) * 1000) / 10;   // 408 → 85
  const minOf = (p) => (p * shiftMin) / 100;                         // 85 → 408

  const [effPct, setEffPct] = useState(() => String(pctOf(curPm)));
  const [appliedPm, setAppliedPm] = useState(curPm);
  const [draft, setDraft] = useState({});

  // Re-seed only when the SAVED state changes (date switch, brigadir switch, or
  // our own save landing) — a background refetch returning identical pins must
  // not wipe what the user is in the middle of typing.
  // A centre typed per group keeps its typed figures on its GROUPS, so they are
  // part of the saved state too — a group pin landing must re-seed like any
  // other. An orphan-only centre's box seeds from `people`, which already moves
  // with a stored orphan pin, so its letters need no draft of their own.
  const seedKey = wcs.map((w) => `${w.work_center}:${w.people_overridden ? w.people : ""}:${w.shtatka_overridden ? w.shtatka : ""}`
    + (typesPerGroup(w) ? w.groups.map((g) => `/${g.group}=${g.people_overridden ? g.people : ""}`).join("") : "")).join("|");
  useEffect(() => {
    setDraft(Object.fromEntries(wcs.flatMap((w) => [
      [w.work_center, {
        people: w.people_overridden ? String(w.people) : "",
        shtatka: w.shtatka_overridden ? String(w.shtatka) : "",
      }],
      // One draft per group, keyed `${wc}|${group}`. Only «Кол-во»: a group has
      // no штатка of its own — the day's штатка pin lives on the whole centre.
      ...(typesPerGroup(w) ? w.groups.map((g) => [gKey(w.work_center, g.group), {
        people: g.people_overridden ? String(g.people) : "",
        shtatka: "",
      }]) : []),
    ])));
  }, [seedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setEffPct(String(pctOf(curPm))); setAppliedPm(curPm); }, [curPm]); // eslint-disable-line react-hooks/exhaustive-deps

  const typedPct = Number(String(effPct).replace(",", "."));
  // capped by the shift itself — a head can't be productive longer than the clock
  const pctValid = Number.isFinite(typedPct) && typedPct > 0 && minOf(typedPct) <= shiftMin;
  const previewPm = pctValid ? minOf(typedPct) : curPm;   // minutes + share follow typing

  // The suggestion runs off the CONFIGURED штатка, so it stays a stable
  // reference to compare the typed actuals against. S is always W × the
  // previewed per-head minutes — which is exactly what saving the % makes the
  // backend do, so the preview can never promise a number Save won't deliver.
  // (W then cancels out: N = ROUND(Q / pm).)
  // A GROUP row runs the same formula with its own share of the minutes as Q and
  // the work centre's W — the group has no штатка of its own, and the backend's
  // `people_calc` for a group is exactly ROUND(W × total_labor ÷ S).
  const suggestQ = (shtatka, labor, pm) => {
    const W = Number(shtatka) || 0;
    const Q = Number(labor) || 0;
    const S = W * pm;
    return S > 0 && W > 0 ? roundHalfUp((W * Q) / S) : 0;
  };
  const suggest = (w, pm) => suggestQ(w.shtatka_cfg, w.total_labor, pm);

  const setCell = (code, key) => (v) =>
    setDraft((d) => ({ ...d, [code]: { ...(d[code] || { people: "", shtatka: "" }), [key]: v } }));

  const num = (v) => {
    const s = String(v ?? "").trim();
    if (s === "") return null;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : null;
  };

  const dirty =
    (canEditEff && pctValid && Math.abs(previewPm - curPm) > 0.001) ||
    wcs.some((w) => {
      const d = draft[w.work_center] || { people: "", shtatka: "" };
      const shtDirty = String(w.shtatka_overridden ? w.shtatka : "") !== String(d.shtatka).trim();
      // A centre typed per group has no «Кол-во» input of its own — its groups
      // are. An ORPHAN group is read-only, so it can never make the tab dirty.
      if (typesPerGroup(w)) {
        return shtDirty || w.groups.some((g) => !g.orphan &&
          String(g.people_overridden ? g.people : "")
            !== String((draft[gKey(w.work_center, g.group)] || { people: "" }).people).trim());
      }
      return shtDirty || String(w.people_overridden ? w.people : "") !== String(d.people).trim();
    });

  const apply = () => { if (pctValid) setAppliedPm(previewPm); };
  const save = () => {
    if (canEditEff && !pctValid) return;
    if (canEditEff) setAppliedPm(previewPm);   // committing also lands it in the preview
    onSave({
      ...(canEditEff ? { productive_min: Math.round(previewPm * 100) / 100 } : {}),
      rows: wcs.flatMap((w) => {
        const d = draft[w.work_center] || { people: "", shtatka: "" };
        if (typesPerGroup(w)) {
          // An ORPHAN group goes back exactly as stored: the backend refuses a
          // new or changed pin for a letter no cell carries, and this tab never
          // offers one — re-sending the stored value (or null) is accepted.
          return groupedStaffRows(w, num(d.shtatka),
            w.groups.map((g) => [g.group, g.orphan
              ? (g.people_overridden ? g.people : null)
              : num((draft[gKey(w.work_center, g.group)] || {}).people)]));
        }
        return centreStaffRows(w, num(d.people), num(d.shtatka));
      }),
    });
  };

  const totalShtat = wcs.reduce((s, w) => s + (Number(w.shtatka_cfg) || 0), 0);
  const totalSuggest = wcs.reduce((s, w) => s + suggest(w, appliedPm), 0);
  // What a cell currently COUNTS as. The two columns answer differently and
  // that is the point: ШТАТКА is configuration, so an empty box legitimately
  // falls back to the unit's configured roster — while «Кол-во» is a fact
  // about one day, so an empty box counts as NOTHING. The formula's
  // ROUND(W × Q ÷ S) beside it is a suggestion and is never substituted for it
  // (see `people_typed_only` in services/pp_calc.py); `w.people` itself is
  // already null when nothing was typed, so the read-only branch needs no
  // second rule.
  // A work centre TYPED PER GROUP has no «Кол-во» typed on the centre — it is the sum
  // of its groups, exactly as the backend resolves `work_centers[].people`. The
  // one exception mirrors `groupedStaffRows`: a whole-centre figure nobody has
  // yet retyped per group still counts, because the загрузка still reads it.
  // `mode` says which of the two the number is (for its tooltip) and `complete`
  // whether anything it stands for is missing (for the «*»).
  // The SUM runs over every typed group, orphans included — the backend's ΣN
  // counts an orphan pin too — while COMPLETENESS asks only about the groups a
  // cell carries (`typedCentre`): an orphan has no people anybody could type, so
  // demanding one left a «*» that only a phantom headcount could clear.
  const groupedPeople = (w) => {
    const typedOnServer = w.groups.some((g) => g.people_overridden);
    if (!canEdit) {
      if (typedOnServer) return { value: w.people ?? null, mode: "sum", complete: typedCentre(w) };
      if (w.people_whole != null) return { value: w.people_whole, mode: "whole", complete: true };
      return { value: null, mode: "sum", complete: false };
    }
    const vals = w.groups.map((g) => [g, num((draft[gKey(w.work_center, g.group)] || {}).people)]);
    if (vals.some(([, v]) => v != null)) {
      return {
        value: vals.reduce((s, [, v]) => s + (v ?? 0), 0),
        mode: "sum",
        complete: vals.every(([g, v]) => g.orphan || v != null),
      };
    }
    if (w.people_whole != null && !typedOnServer) return { value: w.people_whole, mode: "whole", complete: true };
    return { value: null, mode: "sum", complete: false };
  };
  const effOf = (w, key) => {
    if (key === "people") {
      if (typesPerGroup(w)) return groupedPeople(w).value ?? 0;
      if (!canEdit) return Number(w.people) || 0;
      return num((draft[w.work_center] || {}).people) ?? 0;
    }
    if (!canEdit) return Number(w.shtatka) || 0;
    const typed = num((draft[w.work_center] || {}).shtatka);
    return typed != null ? typed : Number(w.shtatka_cfg) || 0;
  };
  const totalActPeople = wcs.reduce((s, w) => s + effOf(w, "people"), 0);
  const totalActShtat = wcs.reduce((s, w) => s + effOf(w, "shtatka"), 0);

  // Did somebody TYPE this number? The `*_overridden` flag is the only thing
  // that can answer it, for both columns and for opposite reasons: `w.shtatka`
  // still RESOLVES (the pin, else the configured roster), so the value alone
  // cannot say which it is — while `w.people` is null when nothing was typed,
  // but a typed 0 is a real answer (a cell that ran empty) and testing the
  // value would read that as missing. The загрузка reads the typed half alone
  // (`zagruzka_source.typed_people`, whose whole predicate is `people IS NOT
  // NULL`). While editing, what counts as typed is what is in the INPUT rather
  // than what was last saved, so the JAMI mark follows the operator's typing
  // instead of lagging a save behind it.
  // A grouped centre counts as typed only when EVERY group is (or the one
  // whole-centre figure still stands): one group left blank is one cell's people
  // missing from the sum, and the JAMI «*» must say so.
  const isTyped = (w, key) =>
    key === "people" && typesPerGroup(w)
      ? groupedPeople(w).complete
      : canEdit
        ? num((draft[w.work_center] || {})[key]) != null
        : (key === "people" ? w.people_overridden : w.shtatka_overridden);
  // Centres typed per group whose «Кол-во» was typed for the WHOLE centre and
  // not yet per group. Read off the saved state: it is a fact about what is
  // stored. Never an orphan-only centre: there the whole figure IS the answer,
  // and the hint would ask for per-group numbers no row lets anybody type.
  const wholeOnly = wcs.filter((w) => typesPerGroup(w) && w.people_whole != null
    && !w.groups.some((g) => g.people_overridden)).map((w) => w.work_center);
  const allTyped = (key) => wcs.every((w) => isTyped(w, key));
  const anyUntyped = wcs.length > 0 && (!allTyped("people") || !allTyped("shtatka"));

  const chip = (code, cell) => {
    const c = wcColor(code);
    // A registry-matched WC chip opens the cell's page; unmatched stays inert.
    return (
      <CellLink id={cell?.id} className="font-mono text-xs font-bold px-2 py-0.5 rounded-md" title={cellTitle(cell, tl) || code}
        style={{ background: hexToRgba(c, 0.16), color: c, border: `1px solid ${hexToRgba(c, 0.3)}`, textDecorationColor: "currentColor" }}>{code}</CellLink>
    );
  };
  // A group row: the centre's chip — linked to the cell carrying the letter, and
  // ONLY that cell: an orphan letter has none and its chip stays inert, never
  // borrowing the centre's first cell (which carries another letter) — and the
  // letter beside it. Indented, so the rows read as parts of the centre above
  // them; an ORPHAN letter (no cell of the unit carries it) is the warning tone.
  const groupLabel = (w, g) => (
    <span className="inline-flex items-center gap-1.5 pl-4">
      {chip(w.work_center, g.cell)}
      <GroupBadge group={g.group} tone={g.orphan ? "warn" : "neutral"} title={groupTitle(t, g, tl)} />
    </span>
  );
  // The two faces of a typed pin, shared by the centre rows and the group rows.
  // Editable: typed is gold and bold, blank is muted — the placeholder is what an
  // EMPTY box will count as. Read-only: the same vocabulary plus a «*» the legend
  // under the card explains (see the read-only branch below for why).
  const pinInput = (value, onChange, placeholder) => (
    <input
      value={value}
      type="number"
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-20 rounded-lg px-2 py-1.5 text-sm text-center outline-none tabular-nums"
      style={{
        background: "var(--bg-inner)", border: "1px solid var(--border-md)",
        color: String(value).trim() === "" ? "var(--text-2)" : "var(--brand-text)",
        fontWeight: String(value).trim() === "" ? 400 : 700,
      }}
    />
  );
  // `digits` 1 for a GROUP: an untyped group reads its even SHARE of the centre
  // (wc_group.share), a fraction of a person. `mark` false drops the «*» where
  // nothing is missing — an orphan group has nobody to type.
  const pinRead = (value, typed, untypedTitle, { digits = 0, mark = true } = {}) => (
    <span
      className="tabular-nums"
      title={typed ? undefined : untypedTitle}
      style={{ color: typed ? "var(--brand-text)" : "var(--text-3)", fontWeight: typed ? 700 : 400 }}
    >
      {fmt(value, digits)}
      {!typed && mark && <sup style={{ color: "var(--text-4)" }}>*</sup>}
    </span>
  );

  return (
    <>
    {/* Efficiency governs the suggestion AND, once saved, the whole page — so it
        spans the full width above BOTH tables rather than living inside one of
        them. Keeping the cards free of a toolbar is also what lets their rows
        line up: they end up structurally identical, header for header. */}
    <div className="rounded-2xl px-4 py-3 mb-3 flex items-center gap-2 flex-wrap"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {t("production.efficiency")}
      </span>
      <span className="flex items-center gap-1.5">
        <input
          value={effPct}
          type="number"
          step="0.1"
          disabled={!canEditEff}
          onChange={(e) => setEffPct(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
          className="w-20 rounded-lg px-3 py-2 text-sm outline-none tabular-nums"
          style={{
            background: "var(--bg-inner)", color: "var(--text-1)",
            border: `1px solid ${pctValid ? "var(--border-md)" : "#ef4444"}`,
          }}
        />
        <span className="text-sm" style={{ color: "var(--text-3)" }}>%</span>
      </span>
      {/* the minutes follow the % as it is typed — the table waits for Apply */}
      <span className="text-[11px] tabular-nums px-2 py-1 rounded-md"
        title={`${fmt(shiftMin, 0)} ${t("production.minUnit")} × ${fmt(typedPct, 1)}%`}
        style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
        = {fmt(previewPm, 0)} {t("production.minUnit")} / {t("production.perPerson")}
      </span>
      {canEditEff && (
        <Button size="lg" variant="secondary" className="ml-auto" onClick={apply}
          disabled={!pctValid || Math.abs(previewPm - appliedPm) < 0.001}>
          {t("production.apply")}
        </Button>
      )}
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* suggestion — formula output at the previewed efficiency */}
      <TableCard
        icon={Gauge}
        title={t("production.peopleSuggested")}
        right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>{loading ? "" : `${wcs.length} ${t("production.unitsCount")}`}</span>}
      >
        <thead>
          <tr>
            <Th label={t("production.col.wc")} />
            <Th label={t("production.shtatka")} align="center" />
            <Th label={t("production.oSoni")} align="center" hint={t("production.peopleSuggestedHint")} />
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 4 }).map((_, i) => (
            <tr key={`sg-sk-${i}`} className={PT_ROW}>
              {Array.from({ length: 3 }).map((__, j) => (
                <td key={j} className="px-3 py-2"><SkeletonBlock className="h-4 w-full" /></td>
              ))}
            </tr>
          ))}
          {/* A grouped centre is a header row plus one row per group — in BOTH
              tables, in the same order, so the two cards stay row-for-row level.
              The header keeps the centre's own W and suggestion; a group row has
              no W of its own («—») and suggests off its share of the minutes. */}
          {!loading && wcs.map((w) => (
            <Fragment key={w.work_center}>
              <tr className={PT_ROW}>
                <td className="px-3 py-2">{chip(w.work_center, w.cell)}</td>
                <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-2)" }}>{fmt(w.shtatka_cfg, 0)}</td>
                <td className="px-3 py-2 text-center tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>{fmt(suggest(w, appliedPm), 0)}</td>
              </tr>
              {isGrouped(w) && w.groups.map((g) => (
                <tr key={gKey(w.work_center, g.group)} className={PT_ROW}>
                  <td className="px-3 py-2">{groupLabel(w, g)}</td>
                  <td className="px-3 py-2 text-center" style={{ color: "var(--text-4)" }}>—</td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-2)" }}>
                    {fmt(suggestQ(w.shtatka_cfg, g.total_labor, appliedPm), 0)}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
          {!loading && wcs.length > 0 && (
            <tr className={PT_ROW}>
              <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{t("production.peopleTotal")}</td>
              <td className="px-3 py-2 text-center tabular-nums font-bold" style={{ color: "var(--text-2)" }}>{fmt(totalShtat, 0)}</td>
              <td className="px-3 py-2 text-center tabular-nums font-bold" style={{ color: "var(--text-1)" }}>{fmt(totalSuggest, 0)}</td>
            </tr>
          )}
          {!loading && wcs.length === 0 && (
            <tr><td colSpan={3} className="px-3 py-6 text-center text-sm" style={{ color: "var(--text-4)" }}>{t("production.noUnits")}</td></tr>
          )}
        </tbody>
      </TableCard>

      {/* actuals — what the day really ran with */}
      <div>
        <TableCard
          icon={Users}
          title={t("production.peopleActual")}
          right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>{loading ? "" : dirty ? t("production.unsaved") : ""}</span>}
        >
          <thead>
            <tr>
              <Th label={t("production.col.wc")} />
              <Th label={t("production.oSoni")} align="center" />
              <Th label={t("production.shtatka")} align="center" />
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 4 }).map((_, i) => (
              <tr key={`ac-sk-${i}`} className={PT_ROW}>
                {Array.from({ length: 3 }).map((__, j) => (
                  <td key={j} className="px-3 py-2"><SkeletonBlock className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}
            {!loading && wcs.map((w) => {
              const d = draft[w.work_center] || { people: "", shtatka: "" };
              // `grouped` = typed per group: the header «Кол-во» is their sum.
              // An orphan-only centre gets the ordinary input instead.
              const grouped = typesPerGroup(w);
              const gp = grouped ? groupedPeople(w) : null;
              return (
                <Fragment key={w.work_center}>
                <tr className={PT_ROW}>
                  <td className="px-3 py-2">{chip(w.work_center, w.cell)}</td>
                  {/* The placeholder is what an EMPTY box will count as. Штатка
                      falls back to the configured roster, so it previews it;
                      «Кол-во» falls back to nothing at all, so it shows «—» —
                      previewing the formula there would promise that leaving
                      the box empty adopts that number, which is exactly what
                      this page stopped doing. */}
                  {[["people", null], ["shtatka", w.shtatka_cfg]].map(([key, fallback]) => (
                    <td key={key} className="px-3 py-1 text-center">
                      {key === "people" && grouped ? (
                        // A grouped centre's «Кол-во» is typed on its groups and
                        // only SUMMED here, so it is never an input and never
                        // gold: nobody typed this number, they typed its parts.
                        <span
                          className="tabular-nums font-semibold"
                          title={t(gp.mode === "whole" ? "production.group.wholeCell" : "production.group.sumHint")}
                          style={{ color: "var(--text-3)" }}
                        >
                          {fmt(gp.value, 0)}
                          {!gp.complete && <sup style={{ color: "var(--text-4)" }}>*</sup>}
                        </span>
                      ) : canEdit ? (
                        pinInput(d[key], setCell(w.work_center, key), fmt(fallback, 0))
                      ) : (
                        // READ-ONLY — a closed day, or a viewer who may not type
                        // here. This printed `w.people` bare while that field
                        // still RESOLVED, so a cell nobody had typed showed the
                        // suggestion from the table on the LEFT as the
                        // brigadir's own fact: both cards read identically, cell
                        // for cell, while the загрузка heatmap marked the same
                        // unit-day 👥 «nobody typed the people». «Кол-во» no
                        // longer resolves at all (pp_calc's `people_typed_only`)
                        // and prints «—» here; ШТАТКА still does, because it is
                        // configuration rather than a fact about one day. A
                        // closed day is exactly the one read after the event, so
                        // this is where the distinction matters most. Same
                        // vocabulary as the editable branch above — typed is
                        // gold and bold, anything else is muted — plus a «*»
                        // the legend under the card explains.
                        pinRead(
                          key === "people" ? w.people : w.shtatka,
                          isTyped(w, key),
                          t(key === "people" ? "production.peopleNotEnteredCell"
                                             : "production.peopleNotTypedCell"),
                        )
                      )}
                    </td>
                  ))}
                </tr>
                {/* One row per group: its own «Кол-во» (the group pin), and «—»
                    for ШТАТКА — the day's штатка belongs to the whole centre and
                    stays on the header row above. An ORPHAN group is never an
                    input: no cell carries its letter, so there is nobody to count
                    and the backend refuses a new pin for it — it shows what is
                    stored and says why it cannot be typed. Listed for EVERY
                    lettered centre, as the suggestion card lists them, so the two
                    cards stay row-for-row level: under an orphan-only centre's
                    ordinary input they are its display-only letters. */}
                {isGrouped(w) && w.groups.map((g) => {
                  const k = gKey(w.work_center, g.group);
                  const gd = draft[k] || { people: "" };
                  return (
                    <tr key={k} className={PT_ROW}>
                      <td className="px-3 py-2">{groupLabel(w, g)}</td>
                      <td className="px-3 py-1 text-center">
                        {canEdit && !g.orphan
                          ? pinInput(gd.people, setCell(k, "people"), fmt(null, 0))
                          : g.orphan
                            ? (
                              <span title={t("production.group.orphanLocked")}>
                                {pinRead(g.people, g.people_overridden, t("production.group.orphanLocked"), { digits: 1, mark: false })}
                              </span>
                            )
                            : pinRead(g.people, g.people_overridden, groupUntypedTitle(t, w, g), { digits: 1 })}
                      </td>
                      <td className="px-3 py-2 text-center" style={{ color: "var(--text-4)" }}>—</td>
                    </tr>
                  );
                })}
                </Fragment>
              );
            })}
            {/* mirrors the suggestion's JAMI row — same position, so the two
                tables end level; counts typed values and formula fallbacks
                alike, and carries the «*» whenever any of what it added up was
                a fallback. The total is the one number a reader quotes, so it
                must not be the last place the distinction is dropped. */}
            {!loading && wcs.length > 0 && (
              <tr className={PT_ROW}>
                <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{t("production.peopleTotal")}</td>
                <td className="px-3 py-2 text-center tabular-nums font-bold" style={{ color: "var(--text-1)" }}>
                  {fmt(totalActPeople, 0)}{!allTyped("people") && <sup style={{ color: "var(--text-4)" }}>*</sup>}
                </td>
                <td className="px-3 py-2 text-center tabular-nums font-bold" style={{ color: "var(--text-2)" }}>
                  {fmt(totalActShtat, 0)}{!allTyped("shtatka") && <sup style={{ color: "var(--text-4)" }}>*</sup>}
                </td>
              </tr>
            )}
            {!loading && wcs.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-sm" style={{ color: "var(--text-4)" }}>{t("production.noUnits")}</td></tr>
            )}
          </tbody>
        </TableCard>

        {/* «*» legend. Renders in BOTH states, unlike the hint below it: a
            closed day has no editing affordance to carry the meaning, and it is
            the state in which these numbers are read back as the record of what
            happened. --text-3 at 11px — never --text-4, where the eye skips
            exactly the line that says the number above it is not a fact. */}
        {!loading && anyUntyped && (
          <p className="text-[11px] leading-relaxed mt-2.5" style={{ color: "var(--text-3)" }}>
            {t("production.peopleNotTyped")}
          </p>
        )}

        {/* A centre that became grouped after its «Кол-во» was typed for the
            whole of it. That figure still counts, but the groups cannot share it
            out by anything but an even guess — which is what grouping replaces —
            so the page asks for it per group, by code. Both states: a closed day
            carries the same stale figure and is read back as the record. */}
        {!loading && wholeOnly.length > 0 && (
          <p className="text-[11px] leading-relaxed mt-2.5" style={{ color: "#a16207" }}>
            {t("production.group.wholeTyped").replace("{codes}", wholeOnly.join(", "))}
          </p>
        )}

        {canEdit && (
          <div className="flex items-center justify-between gap-3 mt-2.5 flex-wrap">
            <p className="text-[11px] leading-relaxed flex-1 min-w-[200px]" style={{ color: "var(--text-3)" }}>
              {hint || t("production.peopleHint")}
            </p>
            <Button
              size="lg"
              icon={savedAt ? <CheckCircle size={14} /> : <Save size={14} />}
              loading={saving}
              disabled={!dirty || (canEditEff && !pctValid)}
              onClick={save}
            >
              {savedAt ? t("production.savedOk") : t("production.save")}
            </Button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// ── main page ────────────────────────────────────────────────────────────────
export default function Production() {
  const { auth } = useAuth();
  const { seesAllOn } = useCapabilities();
  // Subscribes this page to the admin's bands (see the import's note).
  useStatusBands();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = usePersistentState("production_date", todayISO());
  const [viewPref, setView] = usePersistentState("production_view", "zagruzka"); // zagruzka | people | faza | zaga
  // A LEADER owns CELLS, not a unit, so the backend pins their whole page to the
  // cells they own. A deliberate twin of `_leader_wc_scope`: leader, minus
  // anyone holding «Ishlab chiqarish» at "all", the grant that unpins this page.
  // Read off the SESSION rather than off `data.scope`, so nothing gated on it
  // flickers while the dashboard is still loading.
  const cellPinned = auth?.role === "leader" && !seesAllOn("production");
  // The two RAW views print the SAP upload as the file was sent — фаза and
  // заголовок, unreconciled, plant-wide — so they answer a question about the
  // FILE and not about anybody's shopfloor. ADMINS ONLY (the operator's call):
  // the same spelling `canEditCatalog` / `canEditStaffingRole` use below, so one
  // word means one thing on this page. Deliberately NOT `cellPinned` — that one
  // now also gates the efficiency pin, and two rules on one predicate is how
  // widening a role's reach silently hands it a tab nobody meant to give it.
  const canSeeRaw = auth?.role === "admin";
  // The pick is PERSISTED, so anyone who chose фаза before this rule — or whose
  // role changed since — would land on a tab that no longer exists beside a
  // panel nothing renders. Fall back to the dashboard instead.
  const view = !canSeeRaw && RAW_VIEWS.includes(viewPref) ? "zagruzka" : viewPref;
  const [unknownOpen, setUnknownOpen] = useState(false);
  // table controls: free-text search (Сап код + Наименование), Команда multi-select, sort
  const [search, setSearch] = usePersistentState("production_search", "");
  const [wcSel, setWcSel] = usePersistentState("production_wc_filter", []); // [] = all teams
  const [sort, setSort] = usePersistentState("production_sort", { key: null, dir: "asc" }); // 3-state cycle: asc → desc → off
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [staffingSaved, setStaffingSaved] = useState(false); // «Saqlandi» flash on the people tab
  const toggleSort = (key) =>
    setSort((s) => (s.key !== key ? { key, dir: "asc" }
      : s.dir === "asc" ? { key, dir: "desc" } : { key: null, dir: "asc" }));

  // Catalog row selection → action bar → edit (admin only). Selecting a row opens
  // an action strip below it; «Tahrirlash» opens the edit modal.
  const [catSel, setCatSel] = useState(null);      // selected PPProduct id, or null
  const [editRow, setEditRow] = useState(null);    // row being edited in the modal, or null
  const [createOpen, setCreateOpen] = useState(false); // "new position" modal open?
  const [confirmDel, setConfirmDel] = useState(null);  // row pending delete-confirm, or null
  const [catDraft, setCatDraft] = useState({});    // { sap_code, name, labor_time, work_center }
  const [wcEdit, setWcEdit] = useState(null);      // staffing card being edited, or null
  const [wcDraft, setWcDraft] = useState({ people: "", shtatka: "" }); // "" = follow the formula
  const stripRef = useRef(null);                   // revealed action strip → scroll into view
  // Bulk edit: the SELECTION is the scope (the ShiftTimes / Factories model),
  // never the filter. Filters narrow to a Команда, but the rows an operator
  // needs to leave alone are exactly the ones a filter cannot express — so a
  // tick SURVIVES a filter change, and the bar states how many picks the
  // current filter is hiding rather than letting «12 selected» stand silently
  // over 3 rows on screen. In memory only: a selection restored from storage
  // would aim a bulk at rows nobody can see.
  const [catPick, setCatPick] = useState([]);      // picked PPProduct ids
  const [bulkDraft, setBulkDraft] = useState(null); // { work_center, labor_time } or null

  // Supervisors are pinned to their own unit (the backend derives it from the
  // JWT). Everyone above them picks a configured brigadir: shift-managers within
  // their own shift, top-managers and admins across every unit — as does anyone
  // holding a personal «Sahifalar ▸ Ishlab chiqarish» grant at "all", which is
  // exactly the scope that unpins them (mirrors _resolve_manager_id).
  const canPickManager = ["admin", "top-manager", "shift-manager"].includes(auth?.role)
    || seesAllOn("production");
  const [selManager, setSelManager] = usePersistentState("production_manager", null);

  const { data: mgrData } = useQuery({
    queryKey: ["production-managers"],
    queryFn: () => api.get("/api/production/managers").then((r) => r.data),
    enabled: canPickManager,
  });
  const managers = mgrData?.managers ?? [];

  // ── the page scope chain: plant → shift → brigadir ─────────────────────────
  // Each level narrows the one below it, and each says so (`note` / `empty`), so
  // a shortened brigadir list reads as scope rather than as missing data. The
  // brigadir is the only one the page actually READS — the plant and the shift
  // exist to cut a fleet-wide list down to the unit somebody is looking for,
  // which is why the shift left the brigadir LABELS: a name that carries its own
  // shift beside a shift filter says the same thing twice.
  const factorySection = useFactorySection();
  const { factory, enabled: factoryOn } = useFactory();
  const [shiftSel, setShiftSel] = usePersistentState("production_shift", "all");

  // The plant narrows the list only where the plant is a real dimension. On a
  // single-plant install there is no switcher at all, so filtering here would
  // silently drop every unit whose factory_id nobody has filled in — with no
  // control on screen to widen back out.
  const byFactory = useMemo(
    () => (!factoryOn || factory == null ? managers : managers.filter((m) => m.factory_id === factory)),
    [managers, factory, factoryOn],
  );
  // Two shifts, always — `Manager.shift` is the one shift dimension on the
  // platform, so the control offers the same two options on every plant and on
  // every page. Deriving them from whichever brigadirs happen to be loaded made
  // the filter disappear on a plant that runs one shift, which reads as the
  // page having lost a control rather than as the scope having one answer.
  const shiftPick = SHIFTS.includes(shiftSel) ? shiftSel : "all";
  const mgrOpts = useMemo(
    () => (shiftPick === "all" ? byFactory : byFactory.filter((m) => String(m.shift) === shiftPick)),
    [byFactory, shiftPick],
  );

  // Default to the first configured brigadir, and re-sync if the current pick
  // falls out of the list (list just loaded, a shift-manager's scope narrows, or
  // the plant/shift above it moved — a picker naming a unit its own list no
  // longer offers is worse than a reset). A narrowing that empties the list
  // leaves the pick alone: the page says so instead of jumping somewhere else.
  useEffect(() => {
    if (!canPickManager) return;
    if (mgrOpts.some((m) => m.manager_id === selManager)) return;
    if (mgrOpts.length) setSelManager(mgrOpts[0].manager_id);
    else if (managers.length && (selManager == null || !managers.some((m) => m.manager_id === selManager)))
      setSelManager(managers[0].manager_id);
  }, [mgrOpts, managers, canPickManager]); // eslint-disable-line react-hooks/exhaustive-deps

  const managerParam = canPickManager && selManager != null ? { manager_id: selManager } : {};
  // A picker role hasn't resolved a unit yet (list still loading) → hold the
  // manager-scoped queries so they don't 400 on the missing id.
  const managerReady = !canPickManager || selManager != null;
  // Picker role, list loaded, nothing in scope → no brigadir has production set up.
  const noManagers = canPickManager && mgrData != null && managers.length === 0;
  // Configured brigadirs exist, but not inside the plant/shift picked above. An
  // EMPTY scope is a real answer, not a reason to silently show another plant's
  // unit — the chips beside the filter button are the way back out.
  const noInScope = canPickManager && mgrData != null && managers.length > 0 && mgrOpts.length === 0;

  // Catalog fields (Сап код / Наименование / Труд. / Команда) are admin-editable
  // only — supervisors keep the read-only cells and just edit Факт/ПЛАН. Which
  // DAYS may show the controls is decided below, off the dashboard.
  const canEditCatalogRole = auth?.role === "admin";
  // Staffing-card pins (O.soni / штатка, per date) are admin-only as well.
  const canEditStaffingRole = auth?.role === "admin";
  // The «Odamlar soni» tab is the brigadir's own entry point for the same pins —
  // they type the day's real headcount there, so supervisors edit it too. A
  // LEADER edits it as well (2026-09-02), for their own cells only: the backend
  // pins their write to the same cell scope that pins their read, and the
  // unit-wide efficiency box stays theirs to look at, not to move.
  const canEditPeopleRole = ["admin", "supervisor", "leader"].includes(auth?.role);

  const { data, isLoading, isPlaceholderData, isError, error } = useQuery({
    queryKey: ["production", date, managerParam.manager_id ?? "self"],
    queryFn: () => api.get("/api/production/dashboard", { params: { date, ...managerParam } }).then((r) => r.data),
    placeholderData: keepPreviousData,
    enabled: managerReady,
  });
  // True on first load AND while a freshly-picked date is still fetching (its data
  // isn't cached yet, so keepPreviousData hands back the old date's snapshot). Drives
  // skeletons so stale numbers don't linger after the user switches dates.
  const loading = isLoading || isPlaceholderData;

  // The day's lock, straight off the dashboard — the SAME ladder /idle-cell
  // reads (services/day_state via services/idle_lock), never a second closing of
  // this page's own. A closed day is read-only here for every role, admins
  // included: they re-open it on «Verifix to'g'irlash» first, exactly as they do
  // for ojidaniya. Missing (an older backend, a placeholder frame) reads as
  // OPEN, so the page can only ever fail toward the behaviour it always had.
  // A refusal the operator can act on. The STRUCTURE lives on `detail_raw` —
  // api.js flattens every non-string `detail` to text and keeps the original
  // there, so reading `detail` alone would find a JSON blob where the code is.
  // Twin of IdleCell's `errText`, for the one 409 shape idle_lock raises.
  const writeErr = (e) => {
    const raw = e?.response?.data?.detail_raw;
    const d = e?.response?.data?.detail;
    if (raw && typeof raw === "object" && raw.code === "day_closed") {
      // The page was open when somebody closed the day: refetch so the banner
      // appears and the cells go read-only, instead of leaving live-looking
      // editors over a day the API refuses.
      qc.invalidateQueries({ queryKey: ["production", date] });
      return t("production.dayClosedErr");
    }
    return (typeof d === "string" && d) || t("admin.saveFailed");
  };

  const dayLock = data?.day ?? null;
  const dayOpen = dayLock ? dayLock.can_write !== false : true;
  // Per-day editing is gated by ROLE **and** by the day's closing.
  const canEditStaffing = canEditStaffingRole && dayOpen;
  const canEditPeople = canEditPeopleRole && dayOpen;
  // The catalog is DATED (services/pp_catalog.py, 2026-09-24): an edit counts
  // from the shift in progress, and every day before it keeps the catalog it
  // had. So the edit / add / delete / bulk controls exist only on a day an edit
  // made NOW would reach — on an earlier one a save would change nothing on
  // screen. The closing ladder plays no part: a closed day in progress still
  // takes the edit (the operator's ruling). A missing block (an older backend)
  // reads as editable, the behaviour the page always had.
  const catalogInfo = data?.catalog ?? null;
  const catalogEditable = catalogInfo ? catalogInfo.editable !== false : true;
  const canEditCatalog = canEditCatalogRole && catalogEditable && !isPlaceholderData;
  // …and each catalog form says so BEFORE it is saved.
  const catalogFromHint = catalogInfo?.from
    ? t("production.catalog.fromHint").replace("{d}", ddmmyyyy(catalogInfo.from))
    : "";

  // Re-opening is the ONE way back, and it is the Staff page's own endpoint —
  // there is exactly one closing, so there must be exactly one re-opening.
  const [reopen, setReopen] = useState(false);
  const [reopenErr, setReopenErr] = useState("");
  const reopenMut = useMutation({
    mutationFn: () => api.post("/api/staff/approvals/reopen",
                               { manager_id: data?.manager_id, date }),
    onSuccess: () => {
      setReopen(false);
      qc.invalidateQueries({ queryKey: ["production", date] });
    },
    // The dialog stays standing with the reason ON it: a failure that closed the
    // dialog would be a failure the operator never read.
    onError: (e) => setReopenErr(e?.response?.data?.detail || t("admin.saveFailed")),
  });

  // Positions-table column visibility/order — Notion-style picker, persisted
  // per ACTIVE profile via /api/ui-prefs (follows the user across devices).
  // Which columns start hidden depends on the role — see `defaultHidden`. Same
  // spelling as `canSeeRaw` / `canEditCatalog` above, so one word means one
  // thing on this page.
  const isAdmin = auth?.role === "admin";
  // Does the unit on screen carry any group at all — a centre that lists groups,
  // or a line with a letter? Read off the dashboard, so the «Guruh» column and
  // the group controls appear the day a letter lands and not a moment before.
  const hasGroups = useMemo(
    () => (data?.work_centers ?? []).some(isGrouped) || (data?.rows ?? []).some((r) => r.wc_group),
    [data],
  );
  const { data: savedCols } = useQuery({
    queryKey: ["ui-pref", COL_PREF_KEY],
    queryFn: () => api.get(`/api/ui-prefs/${COL_PREF_KEY}`).then((r) => r.data?.value),
    staleTime: Infinity,
  });
  const [colsLocal, setColsLocal] = useState(null); // user edits this session — wins over the fetch
  const colCfg = useMemo(() => {
    // Reconcile the saved pref against the current catalog: drop keys that no
    // longer exist, seat new ones where COLS puts them, never let a locked one
    // hide.
    const saved = colsLocal ?? savedCols;
    const keys = COLS.map((c) => c.key);
    const savedOrder = Array.isArray(saved?.order) ? saved.order.filter((k) => keys.includes(k)) : [];
    // A column added to COLS lands where COLS puts it — straight after the
    // nearest column ahead of it that the saved order still has — instead of
    // being appended. Appending is what a column added at the FRONT cannot
    // survive: «№» would have shown up past Парето for everyone who has ever
    // touched the picker, i.e. for exactly the people who use it.
    const order = [...savedOrder];
    keys.forEach((k, idx) => {
      if (order.includes(k)) return;
      let at = 0;
      for (let j = idx - 1; j >= 0; j--) {
        const prev = order.indexOf(keys[j]);
        if (prev >= 0) { at = prev + 1; break; }
      }
      order.splice(at, 0, k);
    });
    const hidden = Array.isArray(saved?.hidden)
      ? saved.hidden.filter((k) => keys.includes(k) && !LOCKED_COLS.has(k))
      : defaultHidden(isAdmin).filter((k) => keys.includes(k) && !LOCKED_COLS.has(k));
    // A saved list written before «Guruh» existed never answered anything about
    // it, so it gets the default like a profile that never saved. Only this one
    // column: every picker commit writes the full order (the reconcile above), so
    // a saved order WITHOUT it can only predate it — and widening the test to the
    // older columns would move choices people already live with.
    if (Array.isArray(saved?.hidden) && !savedOrder.includes(GROUP_COL)
        && defaultHidden(isAdmin).includes(GROUP_COL) && !hidden.includes(GROUP_COL)) {
      hidden.push(GROUP_COL);
    }
    return { order, hidden };
  }, [colsLocal, savedCols, isAdmin]);
  const saveCols = useMutation({
    mutationFn: (value) => api.put(`/api/ui-prefs/${COL_PREF_KEY}`, { value }),
  });
  const onColsChange = (value) => {
    // On a unit with no groups the picker is never shown the «Guruh» column, and
    // its hide-all / show-all / drag commits rebuild the lists from the columns
    // it WAS shown — so they would quietly drop the reader's own choice for it.
    // Put that half back exactly as the config had it.
    let next = value;
    if (!hasGroups) {
      const hidden = value.hidden.filter((k) => k !== GROUP_COL);
      if (colCfg.hidden.includes(GROUP_COL)) hidden.push(GROUP_COL);
      const order = value.order.filter((k) => k !== GROUP_COL);
      const at = colCfg.order.indexOf(GROUP_COL);
      const before = at > 0 ? colCfg.order[at - 1] : null;
      if (at === 0) order.unshift(GROUP_COL);
      else if (before && order.includes(before)) order.splice(order.indexOf(before) + 1, 0, GROUP_COL);
      // else: the reconcile above seats it where COLS puts it
      next = { order, hidden };
    }
    setColsLocal(next);
    qc.setQueryData(["ui-pref", COL_PREF_KEY], next);
    saveCols.mutate(next);
  };
  const visibleCols = useMemo(() => {
    const hiddenSet = new Set(colCfg.hidden);
    return colCfg.order.map((k) => COLS.find((c) => c.key === k))
      .filter((c) => c && !hiddenSet.has(c.key) && (hasGroups || c.key !== GROUP_COL));
  }, [colCfg, hasGroups]);
  // Every colSpan on this table counts the pick column too, or the skeleton, the
  // empty row and the action strip each stop one cell short of the header.
  const colCount = visibleCols.length + (canEditCatalog ? 1 : 0);

  const override = useMutation({
    mutationFn: (body) => api.post("/api/production/override", body, { params: managerParam }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production", date] });
      qc.invalidateQueries({ queryKey: ["production-dates"] });
    },
    // A spreadsheet cell commits on blur, so a refusal with no toast is a value
    // that simply springs back with nothing said about why.
    onError: (e) => toast.error(writeErr(e)),
  });
  // Staffing-card pin (O.soni / штатка) for one work center on the SELECTED date.
  // Admin-only; both fields ride every call, null = drop the pin and go back to
  // the computed N / configured штатка. Other dates and the config are untouched.
  // The modal is closed by `saveWcEdit` once its WHOLE save has landed, not
  // here: a grouped centre saves as a chain of calls (one per group, then the
  // штатка), and closing on the first success would hide a failure in the next.
  const wcOverride = useMutation({
    mutationFn: (body) => api.post("/api/production/wc-override", { date, ...body }, { params: managerParam }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production", date] });
    },
    onError: (e) => toast.error(writeErr(e)),
  });
  const [wcSaving, setWcSaving] = useState(false);
  // «Odamlar soni» tab — the day's efficiency + every cell's actual O.soni /
  // штатка in ONE commit, after which the whole page recomputes off them.
  // A catalog write that moves a line onto another SAP key fills that key's
  // snapshot on every stored date (`_rejoin_lines`). It touches days already
  // closed and reported, so the operator is TOLD — a silent write into the past
  // is the one outcome this must not have. Nothing filled ⇒ nothing said, so an
  // ordinary edit stays as quiet as it was.
  const fillText = (res) => {
    const f = res?.data?.filled;
    return f?.rows
      ? " · " + t("production.catalog.filled")
          .replace("{r}", String(f.rows)).replace("{d}", String(f.days))
      : "";
  };
  // A group is written on the line the operator picked and on NO other
  // (2026-09-18, services/wc_group.py), so a save has nothing extra to report —
  // the «siblings follow» count this used to print is gone with the rule.
  // Every catalog write counts from the shift in progress
  // (services/pp_catalog.py) and the save says from which day: after 20:00 a
  // day-shift unit's edit starts TOMORROW, which the page on screen cannot show.
  const fromText = (res) => (res?.data?.from
    ? " · " + t("production.catalog.fromDay").replace("{d}", ddmmyyyy(res.data.from))
    : "");
  const sapFilled = (res) => {
    const s = fromText(res) + fillText(res);
    if (s) toast.success(s.slice(3));
  };
  const staffing = useMutation({
    mutationFn: (body) => api.post("/api/production/staffing", { date, ...body }, { params: managerParam }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production", date] });
      setStaffingSaved(true);
      setTimeout(() => setStaffingSaved(false), 2500);
    },
    onError: (e) => toast.error(writeErr(e)),
  });
  // Catalog line edit (PPProduct: sap_code / name / labor_time / work_center).
  // Admin-only. All four are part of what the line's stored ПЛАН/ФАКТ are keyed
  // by, so the backend carries every TYPED value onto the new identity as part
  // of the same write — the numbers follow the line.
  //
  // Moving either half of the SAP key also re-runs the join for the new one
  // (`_rejoin_lines`), so the line no longer reads 0 on every already-uploaded
  // date until somebody re-uploads each file. `filled` says how much that
  // reached: it writes into PAST days, so it is reported rather than silent.
  const catalog = useMutation({
    mutationFn: ({ id, body }) => api.put(`/admin/production/catalog/${id}`, body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["production", date] });
      qc.invalidateQueries({ queryKey: ["production-dates"] });
      sapFilled(res);
    },
  });
  // Add a new catalog line (PPProduct). Admin-only; scoped to the manager the
  // admin is previewing (managerParam.manager_id).
  const createCatalog = useMutation({
    mutationFn: (body) => api.post("/admin/production/catalog", body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["production", date] });
      qc.invalidateQueries({ queryKey: ["production-dates"] });
      sapFilled(res);
    },
  });
  // Remove a catalog line (PPProduct). Admin-only; hard delete — the daily
  // plan/fact rows join on the SAP key, not this row's id, so no daily data goes.
  const deleteCatalog = useMutation({
    mutationFn: (id) => api.delete(`/admin/production/catalog/${id}`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["production", date] });
      qc.invalidateQueries({ queryKey: ["production-dates"] });
      setConfirmDel(null);
      setCatSel(null);
      sapFilled(res);
    },
  });

  // Change the same field on every picked line at once. ONE call, ONE
  // transaction, ONE action-log row — see admin_bulk_update_catalog for why the
  // identity carry has to run over the whole batch rather than row by row.
  const bulkCatalog = useMutation({
    mutationFn: (body) => api.put("/admin/production/catalog/bulk", body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["production", date] });
      qc.invalidateQueries({ queryKey: ["production-dates"] });
      const n = res?.data?.updated ?? 0;
      // Code-less lines cannot carry the auto-fill choice, so the backend skips
      // them. Saying nothing would report a clean success over rows that did not
      // move — the reader has to know which ones the press could not reach.
      const skipped = res?.data?.skipped_no_code ?? 0;
      setBulkDraft(null);
      setCatPick([]);
      const fill = fromText(res) + fillText(res);
      if (skipped > 0) {
        toast.warning(`${t("production.bulk.done").replace("{n}", String(n))} · `
          + t("production.bulk.skippedNoCode").replace("{n}", String(skipped)) + fill);
      } else {
        toast.success(t("production.bulk.done").replace("{n}", String(n)) + fill);
      }
    },
    onError: (e) => toast.error(writeErr(e)),
  });

  // ── undo / redo over the day's writes ─────────────────────────────────────
  // Ctrl+Z takes back the last per-day write on this page; Ctrl+Y (or
  // Ctrl/⌘+Shift+Z) puts it back. Three writers are on the stack — the
  // Факт/ПЛАН cells, the staffing pin and the «Odamlar soni» commit — because
  // each is ONE idempotent call whose previous value is on screen at the moment
  // it is made, so the inverse is the same endpoint with that value. The
  // CATALOG writes are deliberately NOT: adding, renaming and deleting a
  // position is configuration for every date rather than a fact about this one,
  // and a delete's inverse would be a re-create under a NEW id — a lossy
  // reverser, which is the one kind this platform does not ship (the
  // `task.status_changed` lesson). Its confirm still says it cannot be undone,
  // and that stays true.
  //
  // The stack is scoped to the (date, unit) pair the writes were made against
  // and empties when either moves: replaying an edit onto a different day would
  // write a plausible-looking figure with nothing on screen saying it happened.
  const undoScope = `${date}|${managerParam.manager_id ?? "self"}`;
  const history = useUndoStack({ scope: undoScope });

  // A write that can be taken back. `forward` performs it, `back` is its exact
  // inverse. Nothing reaches the stack until the server has ACCEPTED the write —
  // an entry for a write that never landed offers to reverse a change that never
  // happened. The refusal itself is already on screen: every one of these
  // mutations toasts `writeErr` from its own onError.
  // Answers whether the write landed, so a caller holding a dialog open can close
  // it on success and leave it standing on a refusal.
  const tracked = async ({ label, forward, back }) => {
    try {
      await forward();
      history.push({ label, undo: back, redo: forward });
      return true;
    } catch { /* the mutation's own onError already said why */ }
    return false;
  };

  const doUndo = async () => {
    if (!history.canUndo) return;
    const label = await history.undo();
    if (label != null) toast.info(t("production.undo.undone").replace("{x}", label));
  };
  const doRedo = async () => {
    if (!history.canRedo) return;
    const label = await history.redo();
    if (label != null) toast.info(t("production.undo.redone").replace("{x}", label));
  };

  // The shortcut mirrors the cells: a closed day is read-only for everyone, so
  // the keystroke is inert there too rather than firing a write the API refuses.
  // It also stands down while a dialog is open — the operator's context is the
  // dialog, and Ctrl+Z inside one means the field they are typing in — and on
  // the two RAW file views, which edit nothing and show no undo control: a
  // keystroke that silently rewrites a figure on a tab the operator cannot see
  // is the one thing an undo must never do.
  const editableView = view === "zagruzka" || view === "people";
  useUndoHotkeys({
    undo: doUndo,
    redo: doRedo,
    enabled: editableView && dayOpen && !editRow && !createOpen && !confirmDel && !wcEdit && !reopen,
  });

  // The pair is rendered on the page bar, not only in the Позиции toolbar: the
  // history spans BOTH computed views (the people tab's commit is on it), and
  // this platform is used on phones inside Telegram, where there is no keyboard
  // at all — a keyboard-only undo would reach nobody on the primary device.
  const undoBar = editableView && (history.canUndo || history.canRedo) ? (
    <div className="flex items-center gap-1.5">
      <Button
        size="lg" variant="secondary" tint
        icon={<Undo2 size={15} />}
        aria-label={t("production.undo.undoTitle")}
        title={t("production.undo.undoTitle")}
        disabled={!history.canUndo || !dayOpen || history.busy === "redo"}
        loading={history.busy === "undo"}
        onClick={doUndo}
        style={{ width: 38, height: 38, padding: 0 }}
      />
      <Button
        size="lg" variant="secondary" tint
        icon={<Redo2 size={15} />}
        aria-label={t("production.undo.redoTitle")}
        title={t("production.undo.redoTitle")}
        disabled={!history.canRedo || !dayOpen || history.busy === "undo"}
        loading={history.busy === "redo"}
        onClick={doRedo}
        style={{ width: 38, height: 38, padding: 0 }}
      />
    </div>
  ) : null;

  // Dates that actually have an uploaded snapshot — drives the switcher.
  const { data: datesData } = useQuery({
    queryKey: ["production-dates", managerParam.manager_id ?? "self"],
    queryFn: () => api.get("/api/production/dates", { params: managerParam }).then((r) => r.data),
    enabled: managerReady,
  });
  const availableDates = datesData?.dates ?? [];

  const rows = data?.rows ?? [];
  const wcs = data?.work_centers ?? [];
  // The «Команды» panel draws ONE CARD PER GROUP for a work centre typed per
  // group (`typesPerGroup`): each group is its own cell with its own people,
  // minutes and load, and a single card summing them hid exactly the figure a
  // brigadir reads it for. An ORPHAN letter keeps a small display-only card, so
  // a letter no cell carries stays visible. Every other centre — ungrouped, or
  // lettered by orphans alone — keeps its one whole-centre card.
  const teamCards = wcs.flatMap((w) => (typesPerGroup(w)
    ? w.groups.map((g) => ({ w, g }))
    : [{ w, g: null }]));
  // work-center code → canonical cell (workshop name / owner), from the staffing
  // list; every positions row's WC also appears here, so one map covers both.
  const wcCell = useMemo(
    () => Object.fromEntries(wcs.filter((w) => w.cell).map((w) => [w.work_center, w.cell])),
    [wcs]
  );
  // A work centre's tooltip: the cell its chip opens, by CODE and leader.
  const wcTitle = (code) => cellTitle(wcCell[code], tl) || code;
  // A work centre as a visible LABEL (the Команда filter): its code, plus the
  // leader answerable for it when exactly ONE cell stands there and nobody
  // grouped it — with several, the first cell's leader would name the wrong
  // people. Never the workshop name («A cell is its CODE»).
  const wcLabel = (code) => {
    const w = wcs.find((x) => x.work_center === code);
    const lead = w?.cell?.leader && !isGrouped(w) && (w.cells_n ?? 1) <= 1 ? tl(w.cell.leader) : "";
    return cellLabel(code, lead);
  };
  // `${work_center}|${letter}` → that group's entry on its centre (cell, orphan),
  // so a positions row can link its chip to the ONE cell its letter names.
  const groupOf = useMemo(
    () => Object.fromEntries(wcs.flatMap((w) => (isGrouped(w)
      ? w.groups.map((g) => [gKey(w.work_center, g.group), g]) : []))),
    [wcs]
  );
  // The letters a catalog line may carry at the Команда its draft names RIGHT
  // NOW — so moving the draft to another Команда offers that centre's cells —
  // plus any letter the line already has (`extra`), even where no cell carries
  // it, or the select could not show the value it is about to send. Each comes
  // with the verifix code of the cell carrying it.
  const groupOptsFor = (wcCode, extra = []) => {
    const code = String(wcCode ?? "").trim().toUpperCase();
    const w = wcs.find((x) => String(x.work_center ?? "").trim().toUpperCase() === code);
    const opts = isGrouped(w)
      ? w.groups.filter((g) => !g.orphan).map((g) => ({ group: g.group, code: g.cell?.verifix_code ?? null }))
      : [];
    for (const g of extra) if (g && !opts.some((o) => o.group === g)) opts.push({ group: g, code: null });
    return opts.sort((a, b) => byLetter(a.group, b.group));
  };
  const totals = data?.totals ?? {};
  // Teams whose «Кол-во» nobody typed for this date. `people_overridden` is the
  // ONE thing that tells a typed figure from an absent one — `w.people` is null
  // for the second, but a typed 0 is a real answer and must not read as
  // missing, so the flag is what is counted and never the value.
  // A grouped centre counts as typed by `typedCentre` — every group a cell
  // carries, or the whole-centre pin — never by `people_overridden`, which is
  // true the moment ONE group is typed.
  const peopleUntyped = wcs.filter((w) => !typedCentre(w)).length;
  const unknown = data?.unknown_skus ?? [];
  const missingLabor = data?.missing_labor_count ?? 0;
  // A leader owns CELLS, not a unit: the backend narrows this whole page —
  // catalog, teams, KPIs, raw SAP rows, export — to the cells they own and says
  // so here. `cells` = the SAP codes assigned to them (empty = none yet),
  // `work_centers` = the ones this brigadir's unit actually runs. Null for every
  // role that sees the whole unit, so `!cellScope` is "unit-wide view".
  const cellScope = data?.scope ?? null;
  const scopeCodes = cellScope
    ? (cellScope.work_centers?.length ? cellScope.work_centers : cellScope.cells)
    : [];
  // No cell assigned (or none with a SAP code): every panel below would be a row
  // of zeros, which reads as "the factory did nothing today".
  const noCells = cellScope != null && !cellScope.cells?.length;
  // Catalog SKU → work centers it's configured on. Lets us tell a true
  // "missing SKU" apart from a work-center mismatch (same SKU, different участок).
  const catalogWcsBySku = rows.reduce((m, r) => {
    (m[r.sap_code] ||= []).push(r.work_center);
    return m;
  }, {});
  const maxPareto = Math.max(0.0001, ...rows.map((r) => r.pareto || 0));

  // Команда options for the select — distinct work centers in the current snapshot.
  const wcOptions = useMemo(
    () => [...new Set(rows.map((r) => r.work_center).filter(Boolean))].sort(),
    [rows]
  );
  // Filtered + sorted view of rows. Search matches Сап код OR Наименование OR
  // an EXACT Трудоемкость; sort is applied only when a column is active
  // (otherwise original SAP order).
  //
  // The labor time is matched as a NUMBER and never as a substring, which is
  // the whole reason it can be searched at all: «13» read as text also answers
  // 130, 1.3 and every SAP code carrying "13", i.e. it buries the one line the
  // operator asked for under the rows they did not. A comma is read as the
  // decimal point (the catalog form's own convention), and a line carrying no
  // labor time (has_labor false) can never be a numeric match — nothing is
  // "0 minutes" here, it is simply unset.
  const viewRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qNum = q === "" ? NaN : Number(q.replace(",", "."));
    const laborQ = Number.isFinite(qNum) ? qNum : null;
    let out = rows.filter((r) =>
      (!q
        || String(r.sap_code).toLowerCase().includes(q)
        || String(r.name ?? "").toLowerCase().includes(q)
        || (laborQ != null && r.has_labor
            && Math.abs(Number(r.labor_time) - laborQ) < 1e-9)) &&
      (!wcSel.length || wcSel.includes(r.work_center))
    );
    if (sort.key) {
      const dir = sort.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = sortVal(a, sort.key), bv = sortVal(b, sort.key);
        const aNull = av == null || (typeof av === "number" && Number.isNaN(av));
        const bNull = bv == null || (typeof bv === "number" && Number.isNaN(bv));
        if (aNull && bNull) return 0;
        if (aNull) return 1;            // missing values always last
        if (bNull) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv), "ru", { numeric: true }) * dir;
      });
    }
    return out;
  }, [rows, search, wcSel, sort]);

  // ── bulk selection over the catalog ───────────────────────────────────────
  const pickSet = useMemo(() => new Set(catPick), [catPick]);
  // Only a row with an id is a CATALOG line — an unknown SKU the SAP file
  // carries has no PPProduct behind it, so there is nothing to edit and it
  // never offers a checkbox.
  const pickableIds = useMemo(
    () => viewRows.filter((r) => r.id != null).map((r) => r.id), [viewRows]);
  const pickHidden = useMemo(() => {
    const vis = new Set(pickableIds);
    return catPick.filter((id) => !vis.has(id)).length;
  }, [catPick, pickableIds]);
  const allPicked = pickableIds.length > 0 && pickableIds.every((id) => pickSet.has(id));
  const togglePick = (id) =>
    setCatPick((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  // «Select all» adds the visible rows and unticking removes only those, rather
  // than replacing the whole selection: picks the filter is hiding belong to the
  // operator who made them, and a header checkbox must not throw them away.
  const toggleAllVisible = (on) =>
    setCatPick((sel) => (on
      ? Array.from(new Set([...sel, ...pickableIds]))
      : sel.filter((id) => !pickableIds.includes(id))));
  // The catalog belongs to ONE brigadir, so a pick cannot outlive a unit switch:
  // the backend refuses a mixed-unit batch, and a selection carried across would
  // otherwise aim at rows that are no longer on screen.
  useEffect(() => { setCatPick([]); setBulkDraft(null); }, [managerParam.manager_id]);
  // `auto_fill: "keep"` is the third state a boolean cannot carry — "leave every
  // row as it is" — which is what a blank text field means beside it.
  // `wc_group` carries the same "keep" state, and "" for «no group» — a blank
  // cannot mean "leave alone" here, because clearing a group is a real answer.
  const openBulk = () => setBulkDraft({ work_center: "", labor_time: "", auto_fill: "keep", wc_group: "keep" });
  const bulkWc = (bulkDraft?.work_center ?? "").trim();
  const bulkLaborRaw = String(bulkDraft?.labor_time ?? "").trim();
  const bulkLabor = bulkLaborRaw === "" ? null : Number(bulkLaborRaw.replace(",", "."));
  const bulkLaborBad = bulkLaborRaw !== "" && !(Number.isFinite(bulkLabor) && bulkLabor >= 0);
  // A blank field means "leave every row alone", so a form with both blank has
  // nothing to say — the primary action stays disabled rather than sending a
  // call the backend answers 400 to.
  const bulkAuto = bulkDraft?.auto_fill ?? "keep";
  // The letters the bulk editor may write: those a CELL carries at EVERY work
  // centre the picked lines will stand at — the Команда typed in this form, or
  // else each line's own. The union of the unit's letters offered «F» for lines
  // at a centre whose cells stop at «D», and the backend writes it unchecked,
  // i.e. an orphan letter no cell reads.
  const bulkCentres = bulkWc
    ? [bulkWc]
    : [...new Set(rows.filter((r) => pickSet.has(r.id)).map((r) => r.work_center))];
  const bulkLetters = bulkCentres.length
    ? bulkCentres.map((c) => groupOptsFor(c).map((o) => o.group))
        .reduce((acc, ls) => acc.filter((x) => ls.includes(x)))
    : [];
  // A letter that dropped out of that set (the Команда box changed under it)
  // reads as «unchanged» and is never sent.
  const bulkGroupRaw = bulkDraft?.wc_group ?? "keep";
  const bulkGroup = bulkGroupRaw === "keep" || bulkGroupRaw === "" || bulkLetters.includes(bulkGroupRaw)
    ? bulkGroupRaw : "keep";
  const canSaveBulk = !!bulkDraft && catPick.length > 0 && !bulkLaborBad
    && (bulkWc !== "" || bulkLabor != null || bulkAuto !== "keep" || bulkGroup !== "keep");
  const saveBulk = () => {
    if (!canSaveBulk) return;
    const body = { ids: catPick };
    if (bulkWc) body.work_center = bulkWc;
    if (bulkLabor != null) body.labor_time = bulkLabor;
    if (bulkAuto !== "keep") body.auto_fill = bulkAuto === "sap";
    if (bulkGroup !== "keep") body.wc_group = bulkGroup;   // "" clears
    bulkCatalog.mutate(body);
  };

  // Consolidated filter button (the shared <FilterPanel> used on other tables):
  // a single Команда multi-select section. The free-text search lives in its own
  // always-visible bar next to it. Never a native <select>.
  const filterSections = [{
    key: "wc", icon: Users, label: t("production.col.wc"),
    active: wcSel.length > 0,
    display: `${wcSel.length} ${t("filter.selected2")}`,
    render: () => <OptsFilter opts={wcOptions} sel={wcSel} onChange={setWcSel}
      render={wcLabel} />,
  }];
  const filterActiveCount = wcSel.length > 0 ? 1 : 0;

  // Catalog is present but no SAP «фаза» upload exists for this date → all zeros.
  const noSapData = !loading && rows.length > 0 &&
    (totals.total_plan_labor || 0) === 0 && (totals.total_actual_labor || 0) === 0;

  // `qty_key` is what pp_daily is keyed by for this line — the SAP code, or a
  // name-derived token for a code-less line (several of those can share one
  // Команда, so keying them by a blank code would make them one row).
  // «Odamlar soni» commits the day's efficiency and EVERY cell's pins in one
  // call, so its inverse is that same shape rebuilt from the state before the
  // press — a complete snapshot either way, which is why one entry can put the
  // whole tab back rather than leaving half of it moved.
  // `constants.productive_min` is the rate IN FORCE, which on an unpinned day is
  // derived rather than stored — so the inverse of a save that pinned it is
  // `null`, the value that DELETES the day's pin and hands the unit back to the
  // global/derived rate. Restoring the number instead would leave the day pinned
  // at a figure that reads identically today and stops moving with the platform
  // the moment either changes. `productive_pinned` is what tells the two apart.
  // A cell-pinned caller never touches the efficiency pin, so their snapshot
  // must not carry it either — sending `null` back would read as "delete the
  // unit's pin", which is exactly the write the backend refuses them.
  const staffingSnapshot = () => ({
    ...(cellPinned ? {} : {
      productive_min: data?.constants?.productive_pinned
        ? Number(data.constants.productive_min)
        : null,
    }),
    // Every centre is restored through the same rule its save used, from the
    // pins as they stood: a centre typed per group from its groups, or the
    // whole-centre figure nobody had yet retyped per group; any other from its
    // figure. A stored ORPHAN pin a save removed comes back as that same figure
    // on the whole centre — the backend refuses a new pin under a letter no cell
    // carries, and the centre reads one number either way.
    rows: wcs.flatMap((w) => (typesPerGroup(w)
      ? groupedStaffRows(w, w.shtatka_overridden ? w.shtatka : null,
          w.groups.map((g) => [g.group, g.people_overridden ? g.people : null]))
      : centreStaffRows(w, w.people_overridden ? w.people : null,
          w.shtatka_overridden ? w.shtatka : null))),
  });
  const saveStaffing = (body) => {
    const prev = staffingSnapshot();
    tracked({
      label: t("production.viewPeople"),
      forward: () => staffing.mutateAsync(body),
      back: () => staffing.mutateAsync(prev),
    });
  };

  // The inverse is the SAME call with the figure that stood in the cell before —
  // `null` included, which is what clears the override back to the SAP file's own
  // number, so Delete on a cell is as reversible as typing over it.
  // `line_key` is WHICH catalog line of the (SAP, Команда) group this row is —
  // several lines share one SAP code because they are separate operations, and
  // without it the write lands on the group and moves every one of them. It is
  // the line's own name and Трудоемкость rather than its position, so a catalog
  // import that reorders the sheet cannot hand this number to another operation.
  // It rides the undo too, so the inverse edit reaches the same line.
  const saveOverride = (row, field) => (value) => {
    const at = { date, sap_code: row.qty_key ?? row.sap_code, work_center: row.work_center,
                 field, line_key: row.line_key };
    const prev = (field === "actual" ? row.actual_qty : row.plan_qty) ?? null;
    tracked({
      label: `${row.name} · ${t(field === "actual" ? "production.col.fact" : "production.col.plan")}`,
      forward: () => override.mutateAsync({ ...at, value }),
      back: () => override.mutateAsync({ ...at, value: prev }),
    });
  };

  // One renderer per column so the picker can hide/reorder freely — each case
  // is the exact cell markup the table previously hard-coded in SAP order.
  const posCell = (key, r, vyp, wc, i) => {
    switch (key) {
      case "seq":
        // The catalog's own number for this line, served with the row — NOT a
        // counter over what is on screen. It stays with the position through a
        // search, a Команда filter or a sort by Парето, which is what lets two
        // people name the same row; sorting on this column puts the table back
        // in catalog order.
        return (
          <td key={key} className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>
            {r.seq ?? "—"}
          </td>
        );
      case "sap_code":
        // a line without a SAP code is a real position (dough mixes, unlisted
        // pastries) — mark the gap the same way the «Опер.» column does
        return <td key={key} className="px-3 py-2 text-left font-mono" style={{ color: "var(--text-3)" }}>{r.sap_code || "—"}</td>;
      case "op":
        return <td key={key} className="px-3 py-2 text-center font-mono" style={{ color: "var(--text-3)" }}>{r.op ?? "—"}</td>;
      case "name":
        return (
          <td key={key} className="px-3 py-2 text-left max-w-[220px]">
            <span className="block max-w-[200px] truncate font-medium" title={r.name}>{r.name}</span>
          </td>
        );
      case "labor":
        return (
          <td key={key} className="px-3 py-2 text-center tabular-nums">
            {r.has_labor ? fmt(r.labor_time, 2)
              : <span className="inline-flex items-center gap-1" style={{ color: "#a16207" }}><AlertTriangle size={11} />—</span>}
          </td>
        );
      case "wc": {
        // A grouped line names ONE of the cells at its Команда, so the chip
        // links to that cell and carries the letter beside it; a line with no
        // group renders exactly the chip it always did.
        const g = r.wc_group ? groupOf[gKey(r.work_center, r.wc_group)] : null;
        // WCs ARE cells (Cell.sap_code): a registry match links to the cell's
        // page; unmatched codes stay inert chips. A LETTERED line links only to
        // the cell carrying its letter — an orphan letter has none and stays
        // inert rather than opening the centre's first cell, which is another
        // group's — and its tooltip names the cell the link actually opens.
        const linked = r.wc_group ? g?.cell : wcCell[r.work_center];
        const link = (
          <CellLink id={linked?.id} className="font-mono text-[11px] px-1.5 py-0.5 rounded" title={cellTitle(linked, tl, r.wc_group || linked?.wc_group) || r.work_center}
            style={{ background: hexToRgba(wc, 0.14), color: wc, border: `1px solid ${hexToRgba(wc, 0.28)}`, textDecorationColor: "currentColor" }}>{r.work_center}</CellLink>
        );
        return (
          <td key={key} className="px-3 py-2 text-center">
            {r.wc_group ? (
              <span className="inline-flex items-center gap-1">
                {link}
                <GroupBadge group={r.wc_group} tone={g?.orphan ? "warn" : "neutral"}
                  title={g ? groupTitle(t, g, tl) : r.wc_group} />
              </span>
            ) : link}
          </td>
        );
      }
      case "wc_group": {
        const g = r.wc_group ? groupOf[gKey(r.work_center, r.wc_group)] : null;
        return (
          <td key={key} className="px-3 py-2 text-center">
            {r.wc_group
              ? <GroupBadge group={r.wc_group} tone={g?.orphan ? "warn" : "neutral"} title={g ? groupTitle(t, g, tl) : r.wc_group} />
              : <span style={{ color: "var(--text-4)" }}>—</span>}
          </td>
        );
      }
      case "people":
        // One decimal: a line of an untyped group reads that group's SHARE of
        // the centre, a fraction of a person (integers print unchanged).
        return <td key={key} className="px-3 py-2 text-center tabular-nums">{fmt(r.people, 1)}</td>;
      case "vyp":
        return <td key={key} className="px-3 py-2 text-center"><VypCell value={vyp} /></td>;
      // QtyCell IS the <td> — the spreadsheet editor fills the cell, so the cell
      // has to be what owns it (padding box, borders and all).
      // A row the upload does not fill says so ON the cell: the number stands
      // until somebody changes it, which is not what the column next door
      // promises. That statement outranks «shared by N lines» — a row reading no
      // group figure is not sharing one.
      case "fact":
        return (
          <QtyCell key={key} col={key} row={i} readOnly={!dayOpen}
            title={r.sap_filled === false ? t("production.autofill.cellHint")
              : r.actual_shared ? t("production.qty.shared").replace("{n}", r.group_size) : undefined}
            value={r.actual_qty} onSave={saveOverride(r, "actual")} />
        );
      case "plan":
        return (
          <QtyCell key={key} col={key} row={i} readOnly={!dayOpen}
            title={r.sap_filled === false ? t("production.autofill.cellHint")
              : r.plan_shared ? t("production.qty.shared").replace("{n}", r.group_size) : undefined}
            value={r.plan_qty} onSave={saveOverride(r, "plan")} />
        );
      case "autofill": {
        // Two states, never three: a row is filled by the file or it is typed.
        // WHY it is typed — the operator switched it off, or the line carries no
        // SAP code and never could be filled — is the same fact for a reader, so
        // it lives in the tooltip instead of a third chip nobody can decode.
        const auto = r.sap_filled !== false;
        const why = r.sap_code ? "production.autofill.whyOff" : "production.autofill.whyNoCode";
        return (
          <td key={key} className="px-3 py-2 text-center">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium"
                  title={t(auto ? "production.autofill.whyOn" : why)}
                  style={auto
                    ? { color: "var(--text-3)", border: "1px solid var(--border)" }
                    : { color: "var(--brand-text)", background: "rgba(var(--brand-rgb), 0.12)",
                        border: "1px solid rgba(var(--brand-rgb), 0.28)" }}>
              {auto ? <Download size={10} /> : <Pencil size={10} />}
              {t(auto ? "production.autofill.sap" : "production.autofill.manual")}
            </span>
          </td>
        );
      }
      case "actual_labor":
        return <td key={key} className="px-3 py-2 text-center tabular-nums">{fmt(r.actual_labor, 1)}</td>;
      case "labor_total":
        return <td key={key} className="px-3 py-2 text-center tabular-nums font-medium">{fmt(r.total_labor, 1)}</td>;
      case "minutes":
        return <td key={key} className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>{fmt(r.minutes, 1)}</td>;
      case "pareto":
        return (
          <td key={key} className="px-3 py-2 text-center">
            <div className="flex items-center gap-2 justify-center">
              <div className="w-8 hidden sm:block"><Bar value={(r.pareto || 0) / maxPareto} color="var(--brand)" height={4} /></div>
              <span className="tabular-nums" style={{ color: "var(--text-3)", minWidth: 34, textAlign: "right" }}>{pct(r.pareto)}</span>
            </div>
          </td>
        );
      default:
        return null;
    }
  };

  // Excel export of the Positions table → user's private Telegram chat (never a
  // browser download).
  // `order` = the ids of the rows exactly as displayed (current search / team
  // filter / sort), so the exported rows follow the on-screen order. The file
  // itself is the fixed «ABC форма» template with live formulas — its columns
  // are set by that form, not by the column picker, so `columns` is sent for
  // wire compatibility only.
  async function exportExcel() {
    setExporting(true);
    try {
      await exportXlsx("/api/production/export.xlsx", {
        body: {
          date,
          ...managerParam,
          lang,
          order: viewRows.map((r) => r.id),
          columns: visibleCols.map((c) => c.key),
        },
        fallbackName: `ABC ${date}.xlsx`,
      });
      setExportDone(true);
      setTimeout(() => setExportDone(false), 4000);
    } catch (e) {
      console.error("export failed", e);
      alert(e?.response?.data?.detail || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  // Row-select toggle: a click anywhere on a catalog row (admin) opens/closes its
  // action strip. A second click on the same row collapses it (like the other
  // reveal-action tables).
  const selectRow = (r) => {
    if (!canEditCatalog || r.id == null) return;
    setCatSel((id) => (id === r.id ? null : r.id));
  };
  // «Tahrirlash» seeds the draft from the row and opens the edit modal.
  const startCatEdit = (r) => {
    setCatDraft({
      sap_code: r.sap_code ?? "",
      name: r.name ?? "",
      labor_time: r.labor_time == null ? "" : String(r.labor_time),
      work_center: r.work_center ?? "",
      op: r.op ?? "",
      // the STORED flag, not `sap_filled` — a code-less row answers "not filled"
      // while its switch is untouched, and the switch is what this seeds.
      auto_fill: r.auto_fill !== false,
      wc_group: r.wc_group ?? "",
    });
    setEditRow(r);
  };
  const setDraft = (k) => (v) => setCatDraft((d) => ({ ...d, [k]: v }));
  const sameWc = (a, b) =>
    String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();
  // The letters a CELL carries at a Команда — the only ones a catalog line may be
  // GIVEN there. Any other letter makes the line an orphan no cell reads.
  const cellLettersAt = (wcCode) => groupOptsFor(wcCode).map((o) => o.group);
  // The catalog modals' setter. Two keys are not plain: a picked group records
  // that it was PICKED (`group_picked`), and a Команда change settles the letter
  // at once — kept while a cell carries it at the new Команда (or it is the line's
  // own letter and the Команда is still the line's own); otherwise put back to
  // the line's own letter at home, and to «—», unpicked, anywhere else. An
  // unpicked letter at a new Команда is never sent, so the backend's adopt rule
  // decides — the letter picked for the old Команda used to ride along and land
  // on the destination's siblings.
  const setCatField = (k) => {
    if (k === "wc_group") return (v) => setCatDraft((d) => ({ ...d, wc_group: v, group_picked: true }));
    if (k !== "work_center") return setDraft(k);
    return (v) => setCatDraft((d) => {
      const home = editRow != null && sameWc(v, editRow.work_center);
      const own = editRow?.wc_group ?? "";
      const grp = d.wc_group ?? "";
      const keep = grp === ""
        ? home && d.group_picked
        : cellLettersAt(v).includes(grp) || (home && grp === own);
      return keep
        ? { ...d, work_center: v }
        : { ...d, work_center: v, wc_group: home ? own : "", group_picked: false };
    });
  };
  // «Qo'shish» opens the create modal with a blank draft (same four fields).
  const openCreate = () => {
    setCatDraft({ sap_code: "", name: "", labor_time: "", work_center: "", op: "",
                  auto_fill: true, wc_group: "" });
    setCreateOpen(true);
  };
  // Команда is always required; the SAP code is not — a line without one is
  // identified by its name (the backend keys its plan/fact by that name).
  const canSubmitCreate =
    (catDraft.work_center?.trim() ?? "") !== "" &&
    ((catDraft.sap_code?.trim() ?? "") !== "" || (catDraft.name?.trim() ?? "") !== "");
  const saveCatCreate = () => {
    const sap = catDraft.sap_code.trim();
    const wc = catDraft.work_center.trim();
    if (!wc || (!sap && !catDraft.name.trim())) return;
    const laborRaw = String(catDraft.labor_time).trim();
    const labor = laborRaw === "" ? null : Number(laborRaw.replace(",", "."));
    createCatalog.mutate(
      {
        manager_id: managerParam.manager_id,
        sap_code: sap,
        name: catDraft.name.trim(),
        work_center: wc,
        op: (catDraft.op ?? "").trim() || null,
        labor_time: labor != null && !Number.isNaN(labor) ? labor : null,
        // Only a coded line carries the choice; sending it for a code-less one
        // is a 400, and rightly so — there would be nothing for it to decide.
        ...(sap ? { auto_fill: catDraft.auto_fill !== false } : {}),
        // Only a picked letter is sent. With none the line is created
        // UNGROUPED — since 2026-09-18 it no longer adopts the letter its SKU's
        // other operations carry, because they may be made in another cell — so
        // its minutes go to the even split until somebody letters it. And only
        // a letter a cell carries there: anything else would be an orphan.
        ...(catDraft.wc_group && cellLettersAt(wc).includes(catDraft.wc_group)
          ? { wc_group: catDraft.wc_group } : {}),
      },
      { onSuccess: () => setCreateOpen(false) },
    );
  };
  const saveCatEdit = () => {
    const r = editRow;
    if (!r) return;
    // Send only changed fields; name/work_center are never blanked. A cleared SAP
    // code IS sent when the line has a name to identify it by — code-less lines
    // are legitimate. `op` is optional, so a cleared box is always sent — it
    // un-pins the фаза for this line.
    const body = {};
    const sap = catDraft.sap_code.trim();
    const name = catDraft.name.trim();
    const wc = catDraft.work_center.trim();
    const op = (catDraft.op ?? "").trim();
    const laborRaw = String(catDraft.labor_time).trim();
    const labor = laborRaw === "" ? null : Number(laborRaw.replace(",", "."));
    if (sap !== (r.sap_code ?? "") && (sap || name)) body.sap_code = sap;
    if (name && name !== (r.name ?? "")) body.name = name;
    if (wc && wc !== (r.work_center ?? "")) body.work_center = wc;
    if (op !== (r.op ?? "")) body.op = op;
    if (labor != null && !Number.isNaN(labor) && labor !== (r.labor_time ?? null)) body.labor_time = labor;
    // Judged against the code the line ENDS UP with, exactly as the endpoint
    // judges it: clearing the code and setting auto-fill in one save is a
    // contradiction, and the field is simply not sent.
    const autoFill = catDraft.auto_fill !== false;
    if (sap && autoFill !== (r.auto_fill !== false)) body.auto_fill = autoFill;
    // Sent only when it cannot make an orphan. At the line's own Команда: when
    // changed ("" clears) to a letter a cell carries. At a NEW Команда: only a
    // letter the operator PICKED there that a cell carries (or a picked «—») —
    // with none picked the backend drops the letter, since it named a cell at
    // the Команда the line has just left.
    const grp = catDraft.wc_group ?? "";
    if (sameWc(wc || r.work_center, r.work_center)) {
      if (grp !== (r.wc_group ?? "") && (grp === "" || cellLettersAt(r.work_center).includes(grp))) {
        body.wc_group = grp;
      }
    } else if (catDraft.group_picked && (grp === "" || cellLettersAt(wc).includes(grp))) {
      body.wc_group = grp;
    }
    const done = () => { setEditRow(null); setCatSel(null); };
    if (Object.keys(body).length) catalog.mutate({ id: r.id, body }, { onSuccess: done });
    else done();
  };

  // Staffing card «tahrirlash»: pre-fill only the values that are already pinned,
  // so a blank input keeps meaning "follow the formula / the configured штатка".
  const startWcEdit = (w) => {
    setWcDraft({
      people: w.people_overridden ? String(w.people) : "",
      shtatka: w.shtatka_overridden ? String(w.shtatka) : "",
      groups: typesPerGroup(w)
        ? Object.fromEntries(w.groups.map((g) => [g.group, g.people_overridden ? String(g.people) : ""]))
        : {},
    });
    setWcEdit(w);
  };
  const saveWcEdit = async () => {
    if (!wcEdit) return;
    const w = wcEdit;
    const num = (v) => {
      const s = String(v ?? "").trim();
      if (s === "") return null;                       // blank → clear the pin
      const n = Number(s.replace(",", "."));
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    };
    const at = { work_center: w.work_center };
    const label = `${t("production.wcEditTitle")} · ${w.work_center}`;
    let op;
    if (typesPerGroup(w)) {
      // A centre typed per group saves as an AWAITED CHAIN, never in parallel: every
      // call rewrites the same (unit, day, centre) pins, and two racing writes
      // to one unique key is how a save reports success and keeps one of them.
      // Groups first — one call per CHANGED group, people only — then the
      // whole-centre штатка, only when it moved. That last call carries the
      // whole-centre «Кол-во» the centre should end with: none once a group is
      // typed (the backend clears it the moment a group pin lands anyway), and
      // otherwise the figure it already held, so a штатка edit never erases it.
      const prevG = Object.fromEntries(w.groups.map((g) => [g.group, g.people_overridden ? g.people : null]));
      // An ORPHAN group is read-only in the dialog, so it ends where it began —
      // the backend refuses a new or changed pin for a letter no cell carries.
      const nextG = Object.fromEntries(w.groups.map((g) => [g.group,
        g.orphan ? prevG[g.group] : num(wcDraft.groups?.[g.group])]));
      const changed = w.groups.map((g) => g.group).filter((k) => prevG[k] !== nextG[k]);
      const prevSht = w.shtatka_overridden ? w.shtatka : null;
      const nextSht = num(wcDraft.shtatka);
      const shtMoved = prevSht !== nextSht;
      if (!changed.length && !shtMoved) { setWcEdit(null); return; }
      const whole = w.people_whole ?? null;
      const anyBefore = Object.values(prevG).some((v) => v != null);
      const anyAfter = Object.values(nextG).some((v) => v != null);
      const chain = async (vals, centre) => {
        for (const group of changed) await wcOverride.mutateAsync({ ...at, group, people: vals[group] });
        if (centre) await wcOverride.mutateAsync({ ...at, ...centre });
      };
      op = {
        forward: () => chain(nextG, shtMoved ? { people: anyAfter ? null : whole, shtatka: nextSht } : null),
        // The inverse also puts back a whole-centre figure the forward save's
        // first group pin cleared — that write happened server-side, unasked.
        back: () => chain(prevG, shtMoved || (whole != null && anyAfter)
          ? { people: anyBefore ? null : whole, shtatka: prevSht } : null),
      };
    } else {
      // Both fields ride every call, so the inverse is the pins as they stood —
      // `null` where nothing was pinned, which is what puts the card back on the
      // computed N / configured штатка rather than freezing today's figure.
      const prev = {
        people: w.people_overridden ? w.people : null,
        shtatka: w.shtatka_overridden ? w.shtatka : null,
      };
      const next = { people: num(wcDraft.people), shtatka: num(wcDraft.shtatka) };
      // An emptied box on an orphan-only centre also clears its stored orphan
      // pins, one awaited call each (see `centreStaffRows`): a whole-centre write
      // with no people leaves them answering, and the number would spring back.
      const stale = next.people == null && isGrouped(w)
        ? w.groups.filter((g) => g.people_overridden).map((g) => g.group) : [];
      op = {
        forward: async () => {
          for (const group of stale) await wcOverride.mutateAsync({ ...at, group, people: null });
          await wcOverride.mutateAsync({ ...at, ...next });
        },
        back: () => wcOverride.mutateAsync({ ...at, ...prev }),
      };
    }
    // A refusal leaves the dialog standing with the draft in it; the mutation's
    // own onError has already said why. A chain that failed part-way has written
    // its earlier groups — pressing Save again rewrites them idempotently.
    setWcSaving(true);
    const ok = await tracked({ label, ...op });
    setWcSaving(false);
    if (ok) setWcEdit(null);
  };

  // The reveal strip is appended below its row inside the scroll container, so
  // selecting the LAST row leaves the strip below the fold. Nudge it into view.
  useEffect(() => {
    if (catSel != null) stripRef.current?.scrollIntoView({ block: "nearest" });
  }, [catSel]);

  const isToday = date === todayISO();

  // ── the page bar's one filter zone ────────────────────────────────────────
  // Plant → shift → brigadir, the same broad→narrow chain every other scoped
  // page reads left to right, consolidated into ONE row with the day stepper
  // instead of a stack of loose selects above the content.
  //
  // Surname + initials on the chip: full passport names ("XAKIMOV RUSLAN
  // ABDULLAYEVICH") truncate to nothing useful in a chip, and the full name
  // still rides the tooltip and the page title.
  const shortName = (n) => {
    const parts = tl(n || "").trim().split(/\s+/);
    return parts.length < 2 ? parts[0] : `${parts[0]} ${parts.slice(1).map((w) => w[0] + ".").join("")}`;
  };
  const shiftLabel = shiftPick === "all" ? null : `${t("filter.shift")} ${shiftPick}`;
  const plantLabel = factoryOn && factory != null ? (factorySection?.display || "") : null;
  // The note names the NEAREST narrowing level — that is the control the user
  // has to touch to get a missing name back, and one short line beats a recital
  // of the whole chain. Same order for the way OUT: widen the tightest level
  // first, and offer nothing where the plant is locked and has no ✕ of its own.
  const chainNote = (parent, n) =>
    parent ? `${t("production.narrowedBy").replace("{x}", parent)} · ${n}` : null;
  const widenTo = (label, onClick) => (
    <div className="text-center py-1">
      <p className="text-xs mb-2" style={{ color: "var(--text-3)" }}>{t("production.noneInScope")}</p>
      <Button size="sm" variant="secondary" onClick={onClick}>{label}</Button>
    </div>
  );
  const widenOut = shiftLabel
    ? widenTo(t("production.shiftAll"), () => setShiftSel("all"))
    : plantLabel && factorySection?.onClear
      ? widenTo(t("factory.all"), factorySection.onClear)
      : null;
  const selManagerName = managers.find((m) => m.manager_id === selManager)?.name || "";

  const pageSections = !canPickManager ? [] : [
    ...(factorySection ? [factorySection] : []),
    {
      key: "shift", icon: Layers, label: t("filter.shift"),
      active: shiftPick !== "all",
      display: shiftLabel || "",
      onClear: () => setShiftSel("all"),
      render: () => (
        <SegmentedToggle
          fill
          value={shiftPick}
          onChange={setShiftSel}
          options={[["all", t("production.shiftAll")], ...SHIFTS.filter((v) => v !== "all").map((v) => [v, `${t("filter.shift")} ${v}`])]}
        />
      ),
    },
    {
      key: "brigadir", icon: Users, label: t("filter.brigadir"),
      // Always on: the dashboard reads exactly one unit, so this chip is what
      // names the unit on screen rather than an optional narrowing.
      active: selManager != null,
      display: shortName(selManagerName),
      render: ({ close } = {}) => (
        <PickFilter
          searchable
          close={close}
          note={chainNote(shiftLabel || plantLabel, mgrOpts.length)}
          empty={widenOut}
          opts={mgrOpts.map((m) => ({ value: m.manager_id, label: shortName(m.name), title: tl(m.name) }))}
          value={selManager}
          onChange={(v) => setSelManager(v)}
        />
      ),
    },
  ];

  return (
    <Layout title={`${t("production.title")}${data?.manager_name ? " — " + data.manager_name : ""}`}>
      {toast.node}
      {/* Export success toast — fixed top-right, outside normal flow */}
      {exportDone && (
        <div
          className="toast-in flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm shadow-lg"
          style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, background: "#22c55e", color: "#fff", maxWidth: 320, boxShadow: "0 8px 24px rgba(34,197,94,0.35)" }}
        >
          <CheckCircle size={15} style={{ flexShrink: 0 }} />
          <span>{t("staff.exportToast")}</span>
        </div>
      )}
      {/* ONE page bar: the period control inline, then the consolidated filter
          zone (plant → shift → brigadir) with its chips, then the jump-to-a-
          loaded-date select on the right. Supervisors and leaders are pinned to
          their own unit by the backend, so they get no sections and no panel. */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <DayStepper value={date} onChange={setDate} max={null} />
        {!isToday && (
          <button onClick={() => setDate(todayISO())} className="px-3 py-2 rounded-xl text-xs font-medium transition-colors hover:bg-[var(--bg-accent)]"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}>
            {t("production.today")}
          </button>
        )}
        {pageSections.length > 0 && (
          <FilterPanel sections={pageSections} />
        )}
        {/* Undo / redo for the day's writes. It appears only once there IS a
            history — an always-visible pair of dead buttons says the page can
            take something back when there is nothing to take back. */}
        {undoBar}

        {/* switcher — jump to a date that has uploaded data */}
        {availableDates.length > 0 && (
          <StyledSelect
            className="ml-auto w-48"
            value={availableDates.includes(date) ? date : ""}
            onChange={(v) => { if (v) setDate(v); }}
            options={availableDates.map((d) => ({ value: d, label: ddmmyyyy(d) }))}
            placeholder={`${t("production.loadedDates")} (${availableDates.length})`}
          />
        )}
      </div>

      {/* The day's lock, stated ONCE at the top rather than as an absence of
          editors the reader has to notice. Same banner, same words and the same
          way out as /idle-cell — the two pages are shut by one closing, so they
          must not explain it two different ways. */}
      {dayLock && !dayOpen && (
        <div
          className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl text-xs mb-3"
          style={{
            background: "rgba(100,116,139,0.14)",
            border: "1px solid rgba(100,116,139,0.35)",
            color: "var(--text-2)",
          }}
        >
          <Lock size={14} style={{ color: "#94a3b8", flexShrink: 0 }} />
          <span className="font-semibold">{t("production.dayClosedTitle")}</span>
          {dayLock.closed_by && <span style={{ color: "var(--text-3)" }}>· {tl(dayLock.closed_by)}</span>}
          <span className="w-full sm:w-auto sm:ml-1" style={{ color: "var(--text-3)" }}>
            {t("production.dayClosedHint")}
          </span>
          {dayLock.can_reopen && (
            <Button
              size="sm" variant="secondary" tint icon={<Unlock size={13} />}
              className="ml-auto"
              onClick={() => { setReopenErr(""); setReopen(true); }}
            >
              {t("production.reopenDay")}
            </Button>
          )}
        </div>
      )}

      {noManagers ? (
        <EmptyState
          title={t("production.noConfiguredTitle")}
          message={t("production.noConfiguredMsg")}
          showUploadLink={false}
        />
      ) : noInScope ? (
        <EmptyState
          title={t("production.noInScopeTitle")}
          message={t("production.noInScopeMsg")}
          showUploadLink={false}
        />
      ) : noCells ? (
        <EmptyState
          title={t("production.noCellsTitle")}
          message={t("production.noCellsMsg")}
          showUploadLink={false}
        />
      ) : (<>
      {/* The page is pinned to the leader's own cells — say so and name them, so
          a short «Позиции» list reads as scope rather than as missing data. */}
      {cellScope && (
        <div className="flex items-center gap-2 flex-wrap rounded-xl px-3 py-2 mb-4 text-xs"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}>
          <Users size={14} style={{ color: "var(--brand)" }} className="flex-shrink-0" />
          <span>{t("production.cellScope")}</span>
          {scopeCodes.map((code) => {
            const c = wcColor(code);
            return (
              <CellLink key={code} id={wcCell[code]?.id} className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md"
                title={wcTitle(code)}
                style={{ background: hexToRgba(c, 0.16), color: c, border: `1px solid ${hexToRgba(c, 0.3)}`, textDecorationColor: "currentColor" }}>
                {code}
              </CellLink>
            );
          })}
        </div>
      )}

      {/* view switcher: computed dashboard / staffing / raw фаза / raw заголовок
          (the two raw file views are admin-only) */}
      <div className="mb-4">
        <SegmentedToggle
          value={view}
          onChange={setView}
          options={[
            ["zagruzka", t("production.viewZagruzka")],
            ["people", t("production.viewPeople")],
            ...(canSeeRaw ? [
              ["faza", t("production.viewFaza")],
              ["zaga", t("production.viewZaga")],
            ] : []),
          ]}
        />
      </div>

      {RAW_VIEWS.includes(view) && (
        <RawView fileType={view} date={date} managerParam={managerParam} ready={managerReady} />
      )}

      {/* both computed views read the same dashboard fetch — surface its error */}
      {isError && (view === "zagruzka" || view === "people") && (
        <div className="rounded-2xl p-4 text-sm mb-4" style={{ background: "var(--bg-card)", border: "1px solid #ef4444", color: "#ef4444" }}>
          {error?.response?.data?.detail || t("production.loadError")}
        </div>
      )}

      {view === "people" && !isError && (
        <PeopleTab
          wcs={wcs}
          constants={data?.constants}
          loading={loading}
          canEdit={canEditPeople}
          canEditEff={canEditPeople && !cellPinned}
          hint={cellPinned ? t("production.peopleHintLeader") : undefined}
          onSave={saveStaffing}
          saving={staffing.isPending}
          savedAt={staffingSaved}
        />
      )}

      {view === "zagruzka" && (<>
      {noSapData && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-4 text-xs"
          style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
          <AlertTriangle size={14} />
          {t("production.noSapData")}
        </div>
      )}

      {/* KPI row */}
      <div className="flex flex-wrap gap-3 mb-4">
        {loading ? Array.from({ length: 5 }).map((_, i) => (
          <div key={`kpi-sk-${i}`} className="rounded-2xl px-4 py-3.5 flex-1 min-w-[150px]"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SkeletonBlock className="h-3 w-20 mb-3" />
            <SkeletonBlock className="h-7 w-24" />
          </div>
        )) : (<>
          <Kpi label={t("production.kpiVyp")} value={pct(totals.completion)} icon={Target} accent={vypColor(totals.completion)}
            bar={totals.completion} barColor={vypColor(totals.completion)} primary />
          <Kpi label={t("production.kpiPeople")} icon={Users}
            value={<>{fmt(totals.total_people, 0)}{peopleUntyped > 0 && <sup style={{ color: "var(--text-4)" }}>*</sup>}</>} />
          <Kpi label={t("production.kpiTotalLabor")} value={fmt(totals.total_plan_labor, 0)} icon={Clock} />
          <Kpi label={t("production.kpiActualLabor")} value={fmt(totals.total_actual_labor, 0)} icon={ClipboardList} />
          <Kpi label={t("production.kpiAvgLoad")} icon={Gauge} accent={loadColor(totals.avg_load)}
            value={<>{pct(totals.avg_load)}{peopleUntyped > 0 && <sup style={{ color: "var(--text-4)" }}>*</sup>}</>}
            bar={totals.avg_load ?? undefined} barColor={loadColor(totals.avg_load)} />
        </>)}
      </div>

      {/* Both figures above are DIVIDED BY, or ARE, ΣN — and ΣN counts only the
          «Кол-во» somebody typed. So whenever any team is missing one the pair
          carries a «*» and this line says what it means, in the same place and
          the same words as the «Количество людей» tab's own legend. Without it
          the card printed the formula's suggestion as the unit's headcount
          while /zagruzka marked the same unit-day «Нет данных» — two answers to
          one question, and the blank that was meant to be the warning never
          landed. --text-3 at 11px, never --text-4: this is the line that says
          the number above it is not a fact. */}
      {!loading && peopleUntyped > 0 && (
        <p className="text-[11px] leading-relaxed mb-4 -mt-2" style={{ color: "var(--text-3)" }}>
          {t("production.peopleTypedOnly")
            .replace("{typed}", String(wcs.length - peopleUntyped))
            .replace("{total}", String(wcs.length))}
        </p>
      )}

      {/* warnings */}
      {(missingLabor > 0 || unknown.length > 0) && (
        <div className="flex flex-col gap-2 mb-4">
          {missingLabor > 0 && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
              style={{ background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)", color: "#a16207" }}>
              <AlertTriangle size={14} /> {missingLabor} {t("production.missingLaborSuffix")}
            </div>
          )}
          {unknown.length > 0 && (
            <div className="rounded-xl px-3 py-2 text-xs"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#b91c1c" }}>
              <button type="button" onClick={() => setUnknownOpen((o) => !o)}
                className="flex items-center gap-2 font-medium w-full text-left">
                <AlertTriangle size={14} />
                <span>{unknown.length} {t("production.unknownSkusSuffix")}</span>
                {unknownOpen ? <ChevronDown size={14} className="ml-auto opacity-70" />
                  : <ChevronRight size={14} className="ml-auto opacity-70" />}
              </button>
              {unknownOpen && (
              <div className="flex flex-col gap-1 mt-2">
                {unknown.map((u) => {
                  const otherWcs = (catalogWcsBySku[u.sap_code] || []).filter((w) => w !== u.work_center);
                  return (
                    <div key={`${u.sap_code}-${u.work_center}`} className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>{u.sap_code}</span>
                      <span style={{ opacity: 0.7 }}>{t("production.uchastok")}</span>
                      <span className="font-mono px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>{u.work_center}</span>
                      {otherWcs.length > 0 ? (
                        <span style={{ opacity: 0.85 }}>— {t("production.catalogOnUnit")} {otherWcs.join(", ")} {t("production.unitMismatch")}</span>
                      ) : (
                        <span style={{ opacity: 0.85 }}>— {t("production.skuNotInCatalog")}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* staffing panel — work-center cards with load bars */}
      <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Users} title={t("production.teams")} right={
          <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{loading ? "" : `${teamCards.filter(({ g }) => !g?.orphan).length} ${t("production.unitsCount")}`}</span>
        } />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 p-3">
          {loading && Array.from({ length: 6 }).map((_, i) => (
            <div key={`wc-sk-${i}`} className="rounded-xl p-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-2">
                <SkeletonBlock className="h-5 w-14" />
                <SkeletonBlock className="h-5 w-10" />
              </div>
              <SkeletonBlock className="h-1.5 w-full" />
              <SkeletonBlock className="h-3 w-3/4 mt-2.5" />
            </div>
          ))}
          {!loading && teamCards.map(({ w, g }) => {
            if (g) {
              // One group of a work centre typed per group: its own load, its own
              // people (a typed pin gold, an untyped share muted and starred) and
              // its share of the minutes. Штатка is configured for the whole work
              // centre and is not split, so it prints the centre's and says so.
              const gc = loadColor(g.load);
              const wcg = wcColor(w.work_center);
              const title = groupTitle(t, g, tl);
              return (
                <div key={gKey(w.work_center, g.group)} className="rounded-xl p-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", borderLeft: `4px solid ${wcg}` }}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {/* Links to the cell carrying this letter only — an orphan
                          has none, so its chip stays inert. */}
                      <CellLink id={g.orphan ? undefined : g.cell?.id} className="font-mono text-sm font-bold px-2 py-0.5 rounded-md" title={title} style={{ background: hexToRgba(wcg, 0.16), color: wcg, border: `1px solid ${hexToRgba(wcg, 0.3)}`, textDecorationColor: "currentColor" }}>{w.work_center}</CellLink>
                      <GroupBadge group={g.group} tone={g.orphan ? "warn" : "neutral"} title={title} />
                    </span>
                    {!g.orphan && (
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold tabular-nums" style={{ color: gc }}>{pct(g.load)}</span>
                        {canEditStaffing && (
                          <Button
                            variant="secondary"
                            icon={<Pencil size={14} />}
                            onClick={() => startWcEdit(w)}
                            title={t("production.editManually")}
                            aria-label={t("production.editManually")}
                            style={{ background: "var(--bg-card)", paddingLeft: 8, paddingRight: 8 }}
                          />
                        )}
                      </span>
                    )}
                  </div>
                  {g.orphan ? (
                    // Display only: an orphan's minutes and pin are already inside
                    // the cells' shares, so no load and nothing to add up here.
                    <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                      {t("production.group.orphan")}
                      {g.people != null && (
                        <>{" · "}{t("production.oSoni")} <b className="tabular-nums" style={{ color: "var(--text-2)" }}>{fmt(g.people, 1)}</b></>
                      )}
                    </div>
                  ) : (
                    <>
                      <Bar value={g.load} color={gc} height={6} track="var(--bg-card)" />
                      <div className="flex items-center justify-between gap-2 mt-2.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                        <span className="truncate">
                          {t("production.oSoni")} <b className="tabular-nums"
                            title={g.people_overridden ? undefined : groupUntypedTitle(t, w, g)}
                            style={{ color: g.people_overridden ? "var(--brand-text)" : "var(--text-3)" }}>
                            {fmt(g.people, 1)}
                            {!g.people_overridden && <sup style={{ color: "var(--text-4)" }}>*</sup>}
                          </b>
                          {" · "}
                          {t("production.shtatka")} <b className="tabular-nums"
                            title={t("production.group.shtatkaShared").replace("{code}", w.work_center)}
                            style={{ color: w.shtatka_overridden ? "var(--brand-text)" : "var(--text-2)" }}>{fmt(w.shtatka, 0)}</b>
                        </span>
                        <span className="tabular-nums shrink-0">{fmt(g.total_labor, 0)} {t("production.minUnit")}</span>
                      </div>
                    </>
                  )}
                </div>
              );
            }
            const c = loadColor(w.load);
            const wc = wcColor(w.work_center);
            return (
              <div key={w.work_center} className="rounded-xl p-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", borderLeft: `4px solid ${wc}` }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <CellLink id={w.cell?.id} className="font-mono text-sm font-bold px-2 py-0.5 rounded-md" title={wcTitle(w.work_center)} style={{ background: hexToRgba(wc, 0.16), color: wc, border: `1px solid ${hexToRgba(wc, 0.3)}`, textDecorationColor: "currentColor" }}>{w.work_center}</CellLink>
                  {/* The staffing pin governs BOTH numbers below, so its control sits
                      in the header — above the pair — not appended to one of them. */}
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold tabular-nums" style={{ color: c }}>{pct(w.load)}</span>
                    {canEditStaffing && (
                      <Button
                        variant="secondary"
                        icon={<Pencil size={14} />}
                        onClick={() => startWcEdit(w)}
                        title={t("production.editManually")}
                        aria-label={t("production.editManually")}
                        // the card surface IS --bg-inner, so the secondary fill would
                        // vanish into it — lift the button to the card colour instead
                        style={{ background: "var(--bg-card)", paddingLeft: 8, paddingRight: 8 }}
                      />
                    )}
                  </span>
                </div>
                <Bar value={w.load} color={c} height={6} track="var(--bg-card)" />
                <div className="flex items-center justify-between gap-2 mt-2.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                  {/* a pinned staffing value goes brand-gold + bold. The Факт/ПЛАН
                      cells deliberately no longer do: a quantity somebody typed IS the
                      day’s quantity, while a pinned headcount overrides a figure the
                      attendance still holds beside it. */}
                  <span className="truncate">
                    {t("production.oSoni")} <b
                      // A grouped centre's figure is the sum of its group pins —
                      // unless none is typed and the whole-centre pin still stands,
                      // which is a number typed for the centre and must say so.
                      title={typesPerGroup(w)
                        ? t(w.groups.some((g) => g.people_overridden) || w.people_whole == null
                            ? "production.group.sumHint" : "production.group.wholeCell")
                        : w.people_overridden ? undefined : t("production.peopleNotEnteredCell")}
                      // Gold only for a COMPLETE figure (`typedCentre`): a grouped
                      // centre with one group typed printed that partial sum gold,
                      // as if it were the centre's headcount. The «*» marks it —
                      // centres typed per group only; any other untyped one reads «—».
                      style={{ color: typedCentre(w) ? "var(--brand-text)" : "var(--text-3)" }}>
                      {fmt(w.people, 0)}
                      {typesPerGroup(w) && !typedCentre(w) && <sup style={{ color: "var(--text-4)" }}>*</sup>}
                    </b>
                    {" · "}
                    {t("production.shtatka")} <b style={{ color: w.shtatka_overridden ? "var(--brand-text)" : "var(--text-2)" }}>{fmt(w.shtatka, 0)}</b>
                  </span>
                  <span className="tabular-nums shrink-0">{fmt(w.total_labor, 0)} {t("production.minUnit")}</span>
                </div>
                {/* A centre typed per group: its «Кол-во» above is the sum of
                    these — each group's own typed figure beside its letter, in
                    the same typed-gold / blank-muted vocabulary. An orphan-only
                    centre shows them too, display-only, under its own figure. */}
                {isGrouped(w) && (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                    {w.groups.map((g) => (
                      <span key={g.group} className="inline-flex items-center gap-1">
                        <GroupBadge group={g.group} tone={g.orphan ? "warn" : "neutral"} title={groupTitle(t, g, tl)} />
                        {/* An untyped group reads its SHARE — a fraction, muted and
                            starred, never dressed as a typed figure. Display only:
                            an orphan's figure is already inside the cells' shares
                            and is never added into anything. */}
                        <b className="tabular-nums"
                          title={g.people_overridden ? undefined : groupUntypedTitle(t, w, g)}
                          style={{ color: g.people_overridden ? "var(--brand-text)" : "var(--text-3)" }}>
                          {fmt(g.people, 1)}
                          {!g.people_overridden && !g.orphan && <sup style={{ color: "var(--text-4)" }}>*</sup>}
                        </b>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!loading && wcs.length === 0 && (
            <div className="col-span-full text-center py-6 text-sm" style={{ color: "var(--text-4)" }}>{t("production.noUnits")}</div>
          )}
        </div>
      </div>

      {/* main table */}
      <TableCard
        className="mb-4"
        icon={Boxes}
        title={t("production.positions")}
        right={
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
              {loading ? "" : viewRows.length === rows.length ? `${rows.length} SKU` : `${viewRows.length} / ${rows.length}`}
            </span>
            <Button
              size="lg"
              variant="success"
              icon={<Download size={16} />}
              loading={exporting}
              disabled={loading || viewRows.length === 0}
              onClick={exportExcel}
              className="whitespace-nowrap"
            >
              {t("production.exportExcel")}
            </Button>
          </div>
        }
        toolbar={!loading && (
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t("production.filterPlaceholder")}
              className="w-52 sm:w-64"
            />
            <FilterPanel
              sections={filterSections}
              activeCount={filterActiveCount}
              anyActive={wcSel.length > 0}
              onClearAll={() => setWcSel([])}
            />
            {canEditCatalog && (
              <Button
                size="lg"
                className="flex-1 sm:flex-none whitespace-nowrap"
                icon={<Plus size={14} />}
                onClick={openCreate}
              >
                {t("production.addRow")}
              </Button>
            )}
            {/* A day an edit made now cannot reach: it keeps the catalog it
                had, so the controls are gone — and the admin is told where
                they are instead of wondering why. */}
            {canEditCatalogRole && !catalogEditable && catalogInfo?.from && (
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <span className="flex items-center gap-1.5 text-[11px] min-w-0" style={{ color: "var(--text-3)" }}>
                  <History size={13} className="flex-shrink-0" />
                  {t("production.catalog.pastDay").replace("{d}", ddmmyyyy(catalogInfo.from))}
                </span>
                <Button
                  size="lg"
                  variant="secondary"
                  className="whitespace-nowrap"
                  onClick={() => setDate(catalogInfo.from)}
                >
                  {t("production.catalog.openFrom").replace("{d}", ddmmyyyy(catalogInfo.from))}
                </Button>
              </div>
            )}
            <ColumnsPicker
              className="ml-auto"
              columns={COLS.filter((c) => hasGroups || c.key !== GROUP_COL)
                .map((c) => ({ key: c.key, label: t(c.labelKey), locked: LOCKED_COLS.has(c.key) }))}
              order={colCfg.order}
              hidden={colCfg.hidden}
              onChange={onColsChange}
            />
          </>
        )}
      >
            <thead>
              <tr>
                {/* The pick column is NOT in the ColumnsPicker: it is a control,
                    not one of the day's facts, so it can never be hidden away
                    from the bar that acts on it. */}
                {canEditCatalog && (
                  <Th
                    cls="w-9"
                    label={
                      <input
                        type="checkbox"
                        checked={allPicked}
                        disabled={pickableIds.length === 0}
                        onChange={(e) => toggleAllVisible(e.target.checked)}
                        aria-label={t("common.selectAll")}
                        style={{ accentColor: "var(--brand)" }}
                      />
                    }
                  />
                )}
                {visibleCols.map((c) => (
                  <Th key={c.key} label={t(c.labelKey)} k={c.key} sort={sort} onSort={toggleSort}
                    align={c.align} hint={c.hintKey ? t(c.hintKey) : undefined} />
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {Array.from({ length: colCount }).map((_c, j) => (
                    <td key={j} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))}
              {!loading && viewRows.length === 0 && (
                <tr><td colSpan={colCount} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>
                  {rows.length === 0 ? t("production.noDataForDate") : t("production.noMatch")}
                </td></tr>
              )}
              {!loading && viewRows.map((r, i) => {
                const vyp = r.total_labor ? r.actual_labor / r.total_labor : null;
                const wc = wcColor(r.work_center);
                const selectable = canEditCatalog && r.id != null;
                const selected = selectable && catSel === r.id;
                const picked = selectable && pickSet.has(r.id);
                return (
                  <Fragment key={r.id ?? `${r.sap_code}-${r.work_center}-${i}`}>
                  <tr
                    onClick={() => selectRow(r)}
                    className="transition-colors"
                    style={{
                      borderLeft: `2px solid ${r.has_labor ? "transparent" : AMBER}`,
                      background: selected ? "var(--bg-inner)" : picked ? "var(--brand-bg)" : undefined,
                      cursor: selectable ? "pointer" : undefined,
                    }}>
                    {canEditCatalog && (
                      <td className="px-3 py-2">
                        {r.id != null && (
                          <input
                            type="checkbox"
                            checked={picked}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => togglePick(r.id)}
                            aria-label={r.sap_code || r.name || String(r.id)}
                            style={{ accentColor: "var(--brand)" }}
                          />
                        )}
                      </td>
                    )}
                    {visibleCols.map((c) => posCell(c.key, r, vyp, wc, i))}
                  </tr>
                  {selected && (
                    <tr ref={stripRef} style={{ background: "var(--bg-inner)" }}>
                      <td colSpan={colCount} className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center gap-2">
                          <ActionBtn icon={Pencil} label={t("production.editRow")} onClick={() => startCatEdit(r)} />
                          <ActionBtn icon={Trash2} label={t("production.deleteRow")} color="#ef4444" onClick={() => setConfirmDel(r)} />
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
      </TableCard>

      {/* Bulk bar — a LAYER over the page, never a row inside the table: it has
          to stay reachable while the operator scrolls the catalog picking rows. */}
      {canEditCatalog && catPick.length > 0 && (
        <div
          className="flex items-center gap-2 flex-wrap px-3 py-2.5 rounded-t-2xl"
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 20,
            background: "var(--bg-card)",
            borderTop: "1px solid var(--border-md)",
            boxShadow: "0 -8px 24px rgba(0,0,0,0.18)",
            paddingBottom: "calc(0.625rem + var(--tg-safe-bottom, 0px))",
          }}
        >
          <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
            {t("production.bulk.selected").replace("{n}", String(catPick.length))}
          </span>
          {pickHidden > 0 && (
            <span className="text-[11px] leading-snug" style={{ color: "#eab308" }}>
              {t("production.bulk.hidden").replace("{n}", String(pickHidden))}
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Button size="lg" icon={<Pencil size={14} />} onClick={openBulk}>
              {t("production.bulk.edit").replace("{n}", String(catPick.length))}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => setCatPick([])}
                    title={t("filter.clear")} aria-label={t("filter.clear")}
                    icon={<X size={14} />} />
          </div>
        </div>
      )}

      {/* bulk catalog edit (admin) — one value onto every picked line */}
      {bulkDraft && (
        <Modal
          onClose={() => setBulkDraft(null)}
          title={t("production.bulk.title")}
          subtitle={t("production.bulk.scope").replace("{n}", String(catPick.length))}
          icon={<Layers size={16} style={{ color: "var(--brand-text)" }} />}
          dismissable={!bulkCatalog.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setBulkDraft(null)}>
                {t("production.cancelEdit")}
              </Button>
              <Button icon={<Save size={14} />} loading={bulkCatalog.isPending}
                      disabled={!canSaveBulk} onClick={saveBulk}>
                {t("production.bulk.apply").replace("{n}", String(catPick.length))}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("production.col.wc")} hint={t("production.bulk.blankKeeps")}>
              <ModalInput
                value={bulkDraft.work_center}
                onChange={(v) => setBulkDraft((d) => ({ ...d, work_center: v }))}
                placeholder={t("production.bulk.unchanged")}
                className="font-mono"
              />
            </Field>
            <Field
              label={t("production.col.labor")}
              hint={t("production.bulk.blankKeeps")}
              error={bulkLaborBad ? t("production.bulk.laborBad") : undefined}
            >
              <ModalInput
                type="text"
                value={bulkDraft.labor_time}
                onChange={(v) => setBulkDraft((d) => ({ ...d, labor_time: v }))}
                placeholder={t("production.bulk.unchanged")}
                className="tabular-nums"
              />
            </Field>
          </div>
          <Field label={t("production.autofill.label")} hint={t("production.bulk.autofillHint")}>
            <SegmentedToggle
              fill
              value={bulkAuto}
              onChange={(v) => setBulkDraft((d) => ({ ...d, auto_fill: v }))}
              options={[["keep", t("production.bulk.unchanged")],
                        ["sap", t("production.autofill.sap")],
                        ["manual", t("production.autofill.manual")]]}
              ariaLabel={t("production.autofill.label")}
            />
          </Field>
          {/* Offered only on a unit that has groups — elsewhere it would be a
              control whose every answer is «no group». */}
          {hasGroups && (
            <Field label={t("production.col.group")} hint={bulkLetters.length
              ? t("production.group.bulkHint")
              : <>{t("production.group.bulkHint")}<span className="block mt-0.5">{t("production.group.bulkNoCommon")}</span></>}>
              <StyledSelect
                value={bulkGroup}
                onChange={(v) => setBulkDraft((d) => ({ ...d, wc_group: v }))}
                options={[
                  { value: "keep", label: t("production.bulk.unchanged") },
                  { value: "", label: t("production.group.clear") },
                  ...bulkLetters.map((g) => ({
                    value: g,
                    label: <span className="inline-flex items-center gap-1.5"><GroupBadge group={g} /></span>,
                    title: g,
                  })),
                ]}
              />
            </Field>
          )}
          {/* SAP код and Наименование are missing on purpose, and the reader is
              told why rather than left to wonder where they went. */}
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>
            {t("production.bulk.hint")}
          </p>
          {catalogFromHint && (
            <p className="text-[11px] leading-relaxed mt-2" style={{ color: "var(--text-3)" }}>{catalogFromHint}</p>
          )}
        </Modal>
      )}

      {/* staffing pin (admin) — O.soni / штатка for ONE work center on ONE date */}
      {wcEdit && (
        <Modal
          onClose={() => setWcEdit(null)}
          title={t("production.wcEditTitle")}
          subtitle={`${wcEdit.work_center} · ${ddmmyyyy(date)}`}
          icon={<Users size={16} style={{ color: "var(--brand-text)" }} />}
          dismissable={!wcOverride.isPending && !wcSaving}
          footer={
            <>
              <Button variant="secondary" onClick={() => setWcEdit(null)} disabled={wcSaving}>{t("production.cancelEdit")}</Button>
              <Button icon={<Save size={14} />} loading={wcOverride.isPending || wcSaving} onClick={saveWcEdit}>{t("production.save")}</Button>
            </>
          }
        >
          {typesPerGroup(wcEdit) ? (<>
            {/* A grouped centre: one «Кол-во» per group (each named by its letter
                and the code of the cell carrying it) and the centre's own штатка.
                There is no centre «Кол-во» box — that number is their sum. */}
            <div className="grid grid-cols-2 gap-3">
              {wcEdit.groups.map((g) => (
                <Field key={g.group} alignTop label={
                  <span className="inline-flex items-center gap-1.5">
                    {t("production.oSoni")}
                    <GroupBadge group={g.group} tone={g.orphan ? "warn" : "neutral"} title={groupTitle(t, g, tl)} />
                    {g.cell?.verifix_code && <span className="font-mono normal-case">{g.cell.verifix_code}</span>}
                  </span>
                }>
                  {g.orphan ? (
                    // No cell carries this letter: nothing to count, and the
                    // backend refuses a new pin — show what is stored, read-only.
                    <div
                      className="w-full rounded-lg px-3 py-2 text-sm tabular-nums"
                      title={t("production.group.orphanLocked")}
                      style={{
                        background: "var(--bg-inner)", border: "1px solid var(--border)",
                        color: g.people_overridden ? "var(--brand-text)" : "var(--text-3)",
                      }}
                    >
                      {fmt(g.people, 1)}
                    </div>
                  ) : (
                    <ModalInput
                      type="number"
                      value={wcDraft.groups?.[g.group] ?? ""}
                      onChange={(v) => setWcDraft((d) => ({ ...d, groups: { ...(d.groups || {}), [g.group]: v } }))}
                      placeholder={fmt(null, 0)}
                      className="tabular-nums"
                    />
                  )}
                </Field>
              ))}
            </div>
            <Field label={t("production.shtatka")}>
              <ModalInput
                type="number"
                value={wcDraft.shtatka}
                onChange={(v) => setWcDraft((d) => ({ ...d, shtatka: v }))}
                placeholder={fmt(wcEdit.shtatka_cfg, 0)}
                className="tabular-nums"
              />
            </Field>
            {wcEdit.people_whole != null && !wcEdit.groups.some((g) => g.people_overridden) && (
              <p className="text-[11px] leading-relaxed" style={{ color: "#a16207" }}>
                {t("production.group.wholeTyped").replace("{codes}", wcEdit.work_center)}
              </p>
            )}
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>
              {t("production.group.wcEditHint")} {t("production.wcEditHint")}
            </p>
          </>) : (<>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("production.oSoni")}>
              <ModalInput
                type="number"
                value={wcDraft.people}
                onChange={(v) => setWcDraft((d) => ({ ...d, people: v }))}
                /* «—», not the formula: an empty box counts as nothing here —
                   see the «Кол-во» placeholder on the «Количество людей» tab */
                placeholder={fmt(null, 0)}
                className="tabular-nums"
              />
            </Field>
            <Field label={t("production.shtatka")}>
              <ModalInput
                type="number"
                value={wcDraft.shtatka}
                onChange={(v) => setWcDraft((d) => ({ ...d, shtatka: v }))}
                placeholder={fmt(wcEdit.shtatka_cfg, 0)}
                className="tabular-nums"
              />
            </Field>
          </div>
          {/* A centre lettered by ORPHANS alone is typed whole, above; its letters
              stay visible and display-only — no cell carries them, so there is
              nothing to type under them (`typesPerGroup`). */}
          {isGrouped(wcEdit) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {wcEdit.groups.map((g) => (
                <GroupBadge key={g.group} group={g.group} tone={g.orphan ? "warn" : "neutral"} title={groupTitle(t, g, tl)} />
              ))}
            </div>
          )}
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>
            {t("production.wcEditHint")}
          </p>
          </>)}
        </Modal>
      )}

      {/* catalog line edit (admin) — SAP код / Наименование / Труд. / Команда */}
      {editRow && (
        <Modal
          onClose={() => setEditRow(null)}
          title={t("production.editTitle")}
          subtitle={editRow.name}
          icon={<Pencil size={16} style={{ color: "var(--brand-text)" }} />}
          dismissable={!catalog.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditRow(null)}>{t("production.cancelEdit")}</Button>
              <Button icon={<Save size={14} />} loading={catalog.isPending} onClick={saveCatEdit}>{t("production.save")}</Button>
            </>
          }
        >
          {/* The line's own letter is offered only while the draft's Команда is
              still the line's own — elsewhere it names a group nobody there has. */}
          <CatalogFields draft={catDraft} setDraft={setCatField}
            groupOpts={groupOptsFor(catDraft.work_center,
              sameWc(catDraft.work_center, editRow.work_center) ? [editRow.wc_group] : [])} />
          {catalogFromHint && (
            <p className="text-[11px] leading-relaxed mt-3" style={{ color: "var(--text-3)" }}>{catalogFromHint}</p>
          )}
        </Modal>
      )}

      {/* catalog line create (admin) — new position, same four fields */}
      {createOpen && (
        <Modal
          onClose={() => setCreateOpen(false)}
          title={t("production.createTitle")}
          icon={<Plus size={16} style={{ color: "var(--brand-text)" }} />}
          dismissable={!createCatalog.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>{t("production.cancelEdit")}</Button>
              <Button icon={<Save size={14} />} loading={createCatalog.isPending} disabled={!canSubmitCreate} onClick={saveCatCreate}>{t("production.save")}</Button>
            </>
          }
        >
          <CatalogFields draft={catDraft} setDraft={setCatField}
            groupOpts={groupOptsFor(catDraft.work_center)} />
          {catalogFromHint && (
            <p className="text-[11px] leading-relaxed mt-3" style={{ color: "var(--text-3)" }}>{catalogFromHint}</p>
          )}
        </Modal>
      )}

      {/* catalog line delete (admin) — «are you sure» before a hard delete */}
      <ConfirmDialog
        open={!!confirmDel}
        onCancel={() => setConfirmDel(null)}
        onConfirm={() => confirmDel && deleteCatalog.mutate(confirmDel.id)}
        title={t("production.deleteTitle")}
        message={confirmDel ? `${confirmDel.sap_code}${confirmDel.name ? " — " + confirmDel.name : ""}. ${t("production.deleteConfirm")}${catalogFromHint ? " " + catalogFromHint : ""}` : ""}
        confirmLabel={t("production.deleteRow")}
        cancelLabel={t("production.cancelEdit")}
        tone="danger"
        loading={deleteCatalog.isPending}
      />

      {/* re-open the day — same wording as /idle-cell, because it is the same act */}
      <ConfirmDialog
        open={reopen}
        title={t("production.reopenTitle")}
        message={t("staff.apprReopenConfirm")}
        confirmLabel={t("production.reopenDay")}
        loading={reopenMut.isPending}
        error={reopenErr || null}
        onCancel={() => { setReopen(false); setReopenErr(""); }}
        onConfirm={() => reopenMut.mutate()}
      />
      </>)}
      </>)}
    </Layout>
  );
}
