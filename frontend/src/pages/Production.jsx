import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  ChevronRight, ChevronDown,
  AlertTriangle, Pencil, Save, Plus, Trash2,
  Target, Users, ClipboardList, Clock, Gauge, Boxes, Loader2, Layers,
  Download, CheckCircle, Lock, Unlock, Undo2, Redo2,
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
import { exportXlsx } from "../utils/exportXlsx";

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

// status colours (theme-agnostic, work on both dark & light)
const GREEN = "#22c55e", AMBER = "#eab308", RED = "#ef4444";
// completion: ≥95% good, ≥70% partial, below = behind
const vypColor = (v) => (v == null ? "var(--text-4)" : v >= 0.95 ? GREEN : v >= 0.7 ? AMBER : RED);
// load (Загруженность): >100% over-capacity, ≥80% well-loaded, else under-loaded
const loadColor = (v) => (v == null ? "var(--text-4)" : v > 1.001 ? RED : v >= 0.8 ? GREEN : "var(--brand-text)");

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

// «Команда» → canonical workshop name: the backend resolves each work-center
// code against the cells registry (code → cells.sap_code) and rides the result
// on work_centers[].cell. Pick the viewer language, fall back across the rest.
const CELL_LANGS = ["ru", "uz", "uz_cyrl", "en"];
const pickCellName = (cell, lang) => {
  if (!cell) return "";
  for (const l of [lang, ...CELL_LANGS]) if (cell[l]) return cell[l];
  return "";
};

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
  { key: "people", labelKey: "production.col.people", align: "center" },
  { key: "vyp", labelKey: "production.col.vyp", align: "center", hintKey: "production.col.vypHint" },
  { key: "plan", labelKey: "production.col.plan", align: "center", edit: true, hintKey: "production.col.planHint" },
  { key: "fact", labelKey: "production.col.fact", align: "center", edit: true, hintKey: "production.col.factHint" },
  { key: "actual_labor", labelKey: "production.col.actualLabor", align: "center", hintKey: "production.col.actualLaborHint" },
  { key: "labor_total", labelKey: "production.col.totalLabor", align: "center", hintKey: "production.col.totalLaborHint" },
  { key: "minutes", labelKey: "production.col.minutes", align: "center" },
  { key: "pareto", labelKey: "production.col.pareto", align: "center", hintKey: "production.col.paretoHint" },
];

// Notion-style column picker for the Positions table: per-profile pref key and
// the columns that can never be hidden (the row's identity).
const COL_PREF_KEY = "production.positions.cols";
const LOCKED_COLS = new Set(["name"]);

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
    case "people":       return r.people;
    case "vyp":          return r.total_labor ? r.actual_labor / r.total_labor : null;
    case "fact":         return r.actual_qty;
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
function QtyCell({ col, row, value, onSave, readOnly = false }) {
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
      <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-1)" }}>
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
      title={t("production.editManually")}
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
// Наименование / Труд. / Опер.), shared by the create and edit modals so both
// stay identical. `draft` = { sap_code, name, labor_time, work_center, op };
// `setDraft` is the curried (key) => (value) => … updater. A blank фаза keeps
// the cell following the day's фаза upload.
function CatalogFields({ draft, setDraft }) {
  const { t } = useLang();
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
  const filtering = filteredRows.length !== data.row_count;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs" style={{ borderBottom: "1px solid var(--border)", color: "var(--text-3)" }}>
        <span className="font-semibold truncate" style={{ color: "var(--text-2)" }}>{data.filename || "—"}</span>
        <span className="flex-shrink-0 tabular-nums">{filtering ? `${filteredRows.length} / ${data.row_count}` : data.row_count} {t("production.rows")}{data.uploaded_at ? " · " + new Date(data.uploaded_at).toLocaleString("ru-RU") : ""}</span>
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

// `canEditEff` gates the EFFICIENCY box separately from the cell rows: it pins
// the whole brigadir's unit for the day, so a leader — whose page is cut to
// their own cells — may type their cells' headcount but never re-time cells
// that are not theirs. Their save carries rows only; the backend refuses a
// `productive_min` from a cell-scoped caller and leaves the unit's pin alone.
function PeopleTab({ wcs, constants, loading, canEdit, canEditEff = canEdit, hint, onSave, saving, savedAt }) {
  const { t, lang } = useLang();
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
  const seedKey = wcs.map((w) => `${w.work_center}:${w.people_overridden ? w.people : ""}:${w.shtatka_overridden ? w.shtatka : ""}`).join("|");
  useEffect(() => {
    setDraft(Object.fromEntries(wcs.map((w) => [w.work_center, {
      people: w.people_overridden ? String(w.people) : "",
      shtatka: w.shtatka_overridden ? String(w.shtatka) : "",
    }])));
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
  const suggest = (w, pm) => {
    const W = Number(w.shtatka_cfg) || 0;
    const Q = Number(w.total_labor) || 0;
    const S = W * pm;
    return S > 0 && W > 0 ? roundHalfUp((W * Q) / S) : 0;
  };

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
      return String(w.people_overridden ? w.people : "") !== String(d.people).trim() ||
             String(w.shtatka_overridden ? w.shtatka : "") !== String(d.shtatka).trim();
    });

  const apply = () => { if (pctValid) setAppliedPm(previewPm); };
  const save = () => {
    if (canEditEff && !pctValid) return;
    if (canEditEff) setAppliedPm(previewPm);   // committing also lands it in the preview
    onSave({
      ...(canEditEff ? { productive_min: Math.round(previewPm * 100) / 100 } : {}),
      rows: wcs.map((w) => {
        const d = draft[w.work_center] || { people: "", shtatka: "" };
        return { work_center: w.work_center, people: num(d.people), shtatka: num(d.shtatka) };
      }),
    });
  };

  const totalShtat = wcs.reduce((s, w) => s + (Number(w.shtatka_cfg) || 0), 0);
  const totalSuggest = wcs.reduce((s, w) => s + suggest(w, appliedPm), 0);
  // what a cell currently COUNTS as: typed value, else the formula fallback
  const effOf = (w, key) => {
    if (!canEdit) return Number(key === "people" ? w.people : w.shtatka) || 0;
    const typed = num((draft[w.work_center] || {})[key]);
    return typed != null ? typed : Number(key === "people" ? w.people_calc : w.shtatka_cfg) || 0;
  };
  const totalActPeople = wcs.reduce((s, w) => s + effOf(w, "people"), 0);
  const totalActShtat = wcs.reduce((s, w) => s + effOf(w, "shtatka"), 0);

  const chip = (code, cell) => {
    const c = wcColor(code);
    // A registry-matched WC chip opens the cell's page; unmatched stays inert.
    return (
      <CellLink id={cell?.id} className="font-mono text-xs font-bold px-2 py-0.5 rounded-md" title={pickCellName(cell, lang) || code}
        style={{ background: hexToRgba(c, 0.16), color: c, border: `1px solid ${hexToRgba(c, 0.3)}`, textDecorationColor: "currentColor" }}>{code}</CellLink>
    );
  };

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
          {!loading && wcs.map((w) => (
            <tr key={w.work_center} className={PT_ROW}>
              <td className="px-3 py-2">{chip(w.work_center, w.cell)}</td>
              <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-2)" }}>{fmt(w.shtatka_cfg, 0)}</td>
              <td className="px-3 py-2 text-center tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>{fmt(suggest(w, appliedPm), 0)}</td>
            </tr>
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
              return (
                <tr key={w.work_center} className={PT_ROW}>
                  <td className="px-3 py-2">{chip(w.work_center, w.cell)}</td>
                  {[["people", w.people_calc], ["shtatka", w.shtatka_cfg]].map(([key, fallback]) => (
                    <td key={key} className="px-3 py-1 text-center">
                      {canEdit ? (
                        <input
                          value={d[key]}
                          type="number"
                          placeholder={fmt(fallback, 0)}
                          onChange={(e) => setCell(w.work_center, key)(e.target.value)}
                          className="w-20 rounded-lg px-2 py-1.5 text-sm text-center outline-none tabular-nums"
                          style={{
                            background: "var(--bg-inner)", border: "1px solid var(--border-md)",
                            color: String(d[key]).trim() === "" ? "var(--text-2)" : "var(--brand-text)",
                            fontWeight: String(d[key]).trim() === "" ? 400 : 700,
                          }}
                        />
                      ) : (
                        <span className="tabular-nums" style={{ color: "var(--text-2)" }}>
                          {fmt(key === "people" ? w.people : w.shtatka, 0)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
            {/* mirrors the suggestion's JAMI row — same position, so the two
                tables end level; counts typed values and formula fallbacks alike */}
            {!loading && wcs.length > 0 && (
              <tr className={PT_ROW}>
                <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{t("production.peopleTotal")}</td>
                <td className="px-3 py-2 text-center tabular-nums font-bold" style={{ color: "var(--text-1)" }}>{fmt(totalActPeople, 0)}</td>
                <td className="px-3 py-2 text-center tabular-nums font-bold" style={{ color: "var(--text-2)" }}>{fmt(totalActShtat, 0)}</td>
              </tr>
            )}
            {!loading && wcs.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-sm" style={{ color: "var(--text-4)" }}>{t("production.noUnits")}</td></tr>
            )}
          </tbody>
        </TableCard>

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
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = usePersistentState("production_date", todayISO());
  const [viewPref, setView] = usePersistentState("production_view", "zagruzka"); // zagruzka | people | faza | zaga
  // The two RAW views print the plant's whole SAP upload — фаза and заголовок as
  // the file was sent — so they are not a LEADER's to read: their page is pinned
  // to the cells they own, and a raw file view answers a question about every
  // unit. The predicate is a deliberate twin of the backend's `_leader_wc_scope`
  // (leader, minus anyone holding «Ishlab chiqarish» at "all", the grant that
  // unpins this page) and is read off the session rather than off `data.scope`,
  // so the tabs never flash up while the dashboard is still loading.
  const cellPinned = auth?.role === "leader" && !seesAllOn("production");
  // The pick is PERSISTED, so a leader who chose фаза before this rule — or one
  // whose "all" grant was withdrawn — would land on a tab that no longer exists
  // beside a panel nothing renders. Fall back to the dashboard instead.
  const view = cellPinned && RAW_VIEWS.includes(viewPref) ? "zagruzka" : viewPref;
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
  // only — supervisors keep the read-only cells and just edit Факт/ПЛАН.
  const canEditCatalog = auth?.role === "admin";
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
  // Per-day editing is gated by ROLE **and** by the day. Catalog editing is not:
  // a catalog is configuration for every date, not a fact about this one, so a
  // closed day must not lock it (the backend doesn't either).
  const canEditStaffing = canEditStaffingRole && dayOpen;
  const canEditPeople = canEditPeopleRole && dayOpen;

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
      : [];
    return { order, hidden };
  }, [colsLocal, savedCols]);
  const saveCols = useMutation({
    mutationFn: (value) => api.put(`/api/ui-prefs/${COL_PREF_KEY}`, { value }),
  });
  const onColsChange = (value) => {
    setColsLocal(value);
    qc.setQueryData(["ui-pref", COL_PREF_KEY], value);
    saveCols.mutate(value);
  };
  const visibleCols = useMemo(() => {
    const hiddenSet = new Set(colCfg.hidden);
    return colCfg.order.map((k) => COLS.find((c) => c.key === k)).filter((c) => c && !hiddenSet.has(c.key));
  }, [colCfg]);

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
  const wcOverride = useMutation({
    mutationFn: (body) => api.post("/api/production/wc-override", { date, ...body }, { params: managerParam }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production", date] });
      setWcEdit(null);
    },
    onError: (e) => toast.error(writeErr(e)),
  });
  // «Odamlar soni» tab — the day's efficiency + every cell's actual O.soni /
  // штатка in ONE commit, after which the whole page recomputes off them.
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
  // Admin-only endpoint; renaming sap_code/work_center re-points the SKU/unit.
  const catalog = useMutation({
    mutationFn: ({ id, body }) => api.put(`/admin/production/catalog/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production", date] });
      qc.invalidateQueries({ queryKey: ["production-dates"] });
    },
  });
  // Add a new catalog line (PPProduct). Admin-only; scoped to the manager the
  // admin is previewing (managerParam.manager_id).
  const createCatalog = useMutation({
    mutationFn: (body) => api.post("/admin/production/catalog", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production", date] });
      qc.invalidateQueries({ queryKey: ["production-dates"] });
    },
  });
  // Remove a catalog line (PPProduct). Admin-only; hard delete — the daily
  // plan/fact rows join on the SAP key, not this row's id, so no daily data goes.
  const deleteCatalog = useMutation({
    mutationFn: (id) => api.delete(`/admin/production/catalog/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production", date] });
      qc.invalidateQueries({ queryKey: ["production-dates"] });
      setConfirmDel(null);
      setCatSel(null);
    },
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
  const tracked = async ({ label, forward, back }) => {
    try {
      await forward();
      history.push({ label, undo: back, redo: forward });
    } catch { /* the mutation's own onError already said why */ }
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
  // work-center code → canonical cell (workshop name / owner), from the staffing
  // list; every positions row's WC also appears here, so one map covers both.
  const wcCell = useMemo(
    () => Object.fromEntries(wcs.filter((w) => w.cell).map((w) => [w.work_center, w.cell])),
    [wcs]
  );
  const wcName = (code) => pickCellName(wcCell[code], lang);
  const totals = data?.totals ?? {};
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
  // Filtered + sorted view of rows. Search matches Сап код OR Наименование;
  // sort is applied only when a column is active (otherwise original SAP order).
  const viewRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((r) =>
      (!q || String(r.sap_code).toLowerCase().includes(q) || String(r.name ?? "").toLowerCase().includes(q)) &&
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

  // Consolidated filter button (the shared <FilterPanel> used on other tables):
  // a single Команда multi-select section. The free-text search lives in its own
  // always-visible bar next to it. Never a native <select>.
  const filterSections = [{
    key: "wc", icon: Users, label: t("production.col.wc"),
    active: wcSel.length > 0,
    display: `${wcSel.length} ${t("filter.selected2")}`,
    render: () => <OptsFilter opts={wcOptions} sel={wcSel} onChange={setWcSel}
      render={(code) => (wcName(code) ? `${code} — ${wcName(code)}` : code)} />,
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
    rows: wcs.map((w) => ({
      work_center: w.work_center,
      people: w.people_overridden ? w.people : null,
      shtatka: w.shtatka_overridden ? w.shtatka : null,
    })),
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
  const saveOverride = (row, field) => (value) => {
    const at = { date, sap_code: row.qty_key ?? row.sap_code, work_center: row.work_center, field };
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
      case "wc":
        return (
          <td key={key} className="px-3 py-2 text-center">
            {/* WCs ARE cells (Cell.sap_code): a registry match links to the
                cell's page; unmatched codes stay inert chips. */}
            <CellLink id={wcCell[r.work_center]?.id} className="font-mono text-[11px] px-1.5 py-0.5 rounded" title={wcName(r.work_center) || r.work_center}
              style={{ background: hexToRgba(wc, 0.14), color: wc, border: `1px solid ${hexToRgba(wc, 0.28)}`, textDecorationColor: "currentColor" }}>{r.work_center}</CellLink>
          </td>
        );
      case "people":
        return <td key={key} className="px-3 py-2 text-center tabular-nums">{fmt(r.people, 0)}</td>;
      case "vyp":
        return <td key={key} className="px-3 py-2 text-center"><VypCell value={vyp} /></td>;
      // QtyCell IS the <td> — the spreadsheet editor fills the cell, so the cell
      // has to be what owns it (padding box, borders and all).
      case "fact":
        return (
          <QtyCell key={key} col={key} row={i} readOnly={!dayOpen}
            value={r.actual_qty} onSave={saveOverride(r, "actual")} />
        );
      case "plan":
        return (
          <QtyCell key={key} col={key} row={i} readOnly={!dayOpen}
            value={r.plan_qty} onSave={saveOverride(r, "plan")} />
        );
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
    });
    setEditRow(r);
  };
  const setDraft = (k) => (v) => setCatDraft((d) => ({ ...d, [k]: v }));
  // «Qo'shish» opens the create modal with a blank draft (same four fields).
  const openCreate = () => {
    setCatDraft({ sap_code: "", name: "", labor_time: "", work_center: "", op: "" });
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
    });
    setWcEdit(w);
  };
  const saveWcEdit = () => {
    if (!wcEdit) return;
    const num = (v) => {
      const s = String(v ?? "").trim();
      if (s === "") return null;                       // blank → clear the pin
      const n = Number(s.replace(",", "."));
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    };
    // Both fields ride every call, so the inverse is the pins as they stood —
    // `null` where nothing was pinned, which is what puts the card back on the
    // computed N / configured штатка rather than freezing today's figure.
    const at = { work_center: wcEdit.work_center };
    const prev = {
      people: wcEdit.people_overridden ? wcEdit.people : null,
      shtatka: wcEdit.shtatka_overridden ? wcEdit.shtatka : null,
    };
    const next = { people: num(wcDraft.people), shtatka: num(wcDraft.shtatka) };
    tracked({
      label: `${t("production.wcEditTitle")} · ${wcEdit.work_center}`,
      forward: () => wcOverride.mutateAsync({ ...at, ...next }),
      back: () => wcOverride.mutateAsync({ ...at, ...prev }),
    });
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
                title={wcName(code) || code}
                style={{ background: hexToRgba(c, 0.16), color: c, border: `1px solid ${hexToRgba(c, 0.3)}`, textDecorationColor: "currentColor" }}>
                {code}{wcName(code) ? ` · ${wcName(code)}` : ""}
              </CellLink>
            );
          })}
        </div>
      )}

      {/* view switcher: computed dashboard / staffing / raw фаза / raw заголовок
          (the two raw ones only for a viewer the page is not cell-pinned to) */}
      <div className="mb-4">
        <SegmentedToggle
          value={view}
          onChange={setView}
          options={[
            ["zagruzka", t("production.viewZagruzka")],
            ["people", t("production.viewPeople")],
            ...(cellPinned ? [] : [
              ["faza", t("production.viewFaza")],
              ["zaga", t("production.viewZaga")],
            ]),
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
          <Kpi label={t("production.kpiPeople")} value={fmt(totals.total_people, 0)} icon={Users} />
          <Kpi label={t("production.kpiTotalLabor")} value={fmt(totals.total_plan_labor, 0)} icon={Clock} />
          <Kpi label={t("production.kpiActualLabor")} value={fmt(totals.total_actual_labor, 0)} icon={ClipboardList} />
          <Kpi label={t("production.kpiAvgLoad")} value={pct(totals.avg_load)} icon={Gauge} accent={loadColor(totals.avg_load)}
            bar={totals.avg_load} barColor={loadColor(totals.avg_load)} />
        </>)}
      </div>

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
          <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{loading ? "" : `${wcs.length} ${t("production.unitsCount")}`}</span>
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
          {!loading && wcs.map((w) => {
            const c = loadColor(w.load);
            const wc = wcColor(w.work_center);
            return (
              <div key={w.work_center} className="rounded-xl p-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", borderLeft: `4px solid ${wc}` }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <CellLink id={w.cell?.id} className="font-mono text-sm font-bold px-2 py-0.5 rounded-md" title={wcName(w.work_center) || w.work_center} style={{ background: hexToRgba(wc, 0.16), color: wc, border: `1px solid ${hexToRgba(wc, 0.3)}`, textDecorationColor: "currentColor" }}>{w.work_center}</CellLink>
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
                    {t("production.oSoni")} <b style={{ color: w.people_overridden ? "var(--brand-text)" : "var(--text-2)" }}>{fmt(w.people, 0)}</b>
                    {" · "}
                    {t("production.shtatka")} <b style={{ color: w.shtatka_overridden ? "var(--brand-text)" : "var(--text-2)" }}>{fmt(w.shtatka, 0)}</b>
                  </span>
                  <span className="tabular-nums shrink-0">{fmt(w.total_labor, 0)} {t("production.minUnit")}</span>
                </div>
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
            <ColumnsPicker
              className="ml-auto"
              columns={COLS.map((c) => ({ key: c.key, label: t(c.labelKey), locked: LOCKED_COLS.has(c.key) }))}
              order={colCfg.order}
              hidden={colCfg.hidden}
              onChange={onColsChange}
            />
          </>
        )}
      >
            <thead>
              <tr>
                {visibleCols.map((c) => (
                  <Th key={c.key} label={t(c.labelKey)} k={c.key} sort={sort} onSort={toggleSort}
                    align={c.align} hint={c.hintKey ? t(c.hintKey) : undefined} />
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {visibleCols.map((c, j) => (
                    <td key={j} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))}
              {!loading && viewRows.length === 0 && (
                <tr><td colSpan={visibleCols.length} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>
                  {rows.length === 0 ? t("production.noDataForDate") : t("production.noMatch")}
                </td></tr>
              )}
              {!loading && viewRows.map((r, i) => {
                const vyp = r.total_labor ? r.actual_labor / r.total_labor : null;
                const wc = wcColor(r.work_center);
                const selectable = canEditCatalog && r.id != null;
                const selected = selectable && catSel === r.id;
                return (
                  <Fragment key={r.id ?? `${r.sap_code}-${r.work_center}-${i}`}>
                  <tr
                    onClick={() => selectRow(r)}
                    className="transition-colors"
                    style={{
                      borderLeft: `2px solid ${r.has_labor ? "transparent" : AMBER}`,
                      background: selected ? "var(--bg-inner)" : undefined,
                      cursor: selectable ? "pointer" : undefined,
                    }}>
                    {visibleCols.map((c) => posCell(c.key, r, vyp, wc, i))}
                  </tr>
                  {selected && (
                    <tr ref={stripRef} style={{ background: "var(--bg-inner)" }}>
                      <td colSpan={visibleCols.length} className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
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

      {/* staffing pin (admin) — O.soni / штатка for ONE work center on ONE date */}
      {wcEdit && (
        <Modal
          onClose={() => setWcEdit(null)}
          title={t("production.wcEditTitle")}
          subtitle={`${wcEdit.work_center}${wcName(wcEdit.work_center) ? ` — ${wcName(wcEdit.work_center)}` : ""} · ${ddmmyyyy(date)}`}
          icon={<Users size={16} style={{ color: "var(--brand-text)" }} />}
          dismissable={!wcOverride.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setWcEdit(null)}>{t("production.cancelEdit")}</Button>
              <Button icon={<Save size={14} />} loading={wcOverride.isPending} onClick={saveWcEdit}>{t("production.save")}</Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("production.oSoni")}>
              <ModalInput
                type="number"
                value={wcDraft.people}
                onChange={(v) => setWcDraft((d) => ({ ...d, people: v }))}
                placeholder={fmt(wcEdit.people_calc, 0)}
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
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>
            {t("production.wcEditHint")}
          </p>
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
          <CatalogFields draft={catDraft} setDraft={setDraft} />
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
          <CatalogFields draft={catDraft} setDraft={setDraft} />
        </Modal>
      )}

      {/* catalog line delete (admin) — «are you sure» before a hard delete */}
      <ConfirmDialog
        open={!!confirmDel}
        onCancel={() => setConfirmDel(null)}
        onConfirm={() => confirmDel && deleteCatalog.mutate(confirmDel.id)}
        title={t("production.deleteTitle")}
        message={confirmDel ? `${confirmDel.sap_code}${confirmDel.name ? " — " + confirmDel.name : ""}. ${t("production.deleteConfirm")}` : ""}
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
