import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  ChevronRight, ChevronDown,
  AlertTriangle, Pencil, Save, Plus, Trash2,
  Target, Users, ClipboardList, Clock, Gauge, Boxes, Loader2,
  Download, CheckCircle,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import { SkeletonBlock, SkeletonTable } from "../components/ui/Skeleton";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
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
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";

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

// status colours (theme-agnostic, work on both dark & light)
const GREEN = "#22c55e", AMBER = "#eab308", RED = "#ef4444";
// completion: ≥95% good, ≥70% partial, below = behind
const vypColor = (v) => (v == null ? "var(--text-4)" : v >= 0.95 ? GREEN : v >= 0.7 ? AMBER : RED);
// load (Загруженность): >100% over-capacity, ≥80% well-loaded, else under-loaded
const loadColor = (v) => (v == null ? "var(--text-4)" : v > 1.001 ? RED : v >= 0.8 ? GREEN : "var(--brand-text)");

// per-команда identity colour — stable for a given work-center code (hash → palette),
// so the same team keeps its colour across the cards and the table regardless of order.
const WC_PALETTE = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899",
  "#8b5cf6", "#14b8a6", "#f97316", "#84cc16", "#06b6d4", "#a855f7",
];
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

// Column definitions — labels/hints resolved via t() at render (see COLS map below).
// Order matches the ABC Excel ("Sheet1 ...").
const COLS = [
  { key: "sap_code", labelKey: "production.col.sapCode", align: "left" },
  { key: "op", labelKey: "production.col.op", align: "center", hintKey: "production.col.opHint" },
  { key: "name", labelKey: "production.col.name", align: "left" },
  { key: "labor", labelKey: "production.col.labor", align: "center", hintKey: "production.col.laborHint" },
  { key: "wc", labelKey: "production.col.wc", align: "center" },
  { key: "people", labelKey: "production.col.people", align: "center" },
  { key: "vyp", labelKey: "production.col.vyp", align: "center", hintKey: "production.col.vypHint" },
  { key: "fact", labelKey: "production.col.fact", align: "center", edit: true, hintKey: "production.col.factHint" },
  { key: "plan", labelKey: "production.col.plan", align: "center", edit: true, hintKey: "production.col.planHint" },
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

// ── editable qty cell (Факт / ПЛАН) ─────────────────────────────────────────
function QtyCell({ value, overridden, onSave }) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const start = () => { setDraft(value === null || value === undefined ? "" : String(value)); setEditing(true); };
  const commit = () => {
    setEditing(false);
    const raw = draft.trim();
    const num = raw === "" ? null : Number(raw.replace(",", "."));
    if (raw !== "" && Number.isNaN(num)) return;
    if (num !== (value ?? null)) onSave(num);
  };
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="w-16 text-right text-xs px-1.5 py-0.5 rounded-md outline-none tabular-nums"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--brand)", color: "var(--text-1)" }}
      />
    );
  }
  return (
    <button
      onClick={start}
      className="inline-flex items-center gap-1 group tabular-nums"
      title={t("production.editManually")}
      style={{ color: overridden ? "var(--brand-text)" : "var(--text-1)", fontWeight: overridden ? 700 : 400 }}
    >
      {fmt(value, 0)}
      {overridden && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--brand)" }} />}
      <Pencil size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
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

// Catalog form body — the four editable catalog fields (Сап код / Команда /
// Наименование / Труд.), shared by the create and edit modals so both stay
// identical. `draft` = { sap_code, name, labor_time, work_center }; `setDraft`
// is the curried (key) => (value) => … updater.
function CatalogFields({ draft, setDraft }) {
  const { t } = useLang();
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("production.col.sapCode")} required>
          <ModalInput value={draft.sap_code} onChange={setDraft("sap_code")} className="font-mono" />
        </Field>
        <Field label={t("production.col.wc")} required>
          <ModalInput value={draft.work_center} onChange={setDraft("work_center")} className="font-mono" />
        </Field>
      </div>
      <Field label={t("production.col.name")}>
        <ModalInput value={draft.name} onChange={setDraft("name")} />
      </Field>
      <Field label={`${t("production.col.labor")} — ${t("production.col.laborHint")}`}>
        <ModalInput value={draft.labor_time} onChange={setDraft("labor_time")} type="number" />
      </Field>
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

// ── section header strip ─────────────────────────────────────────────────────
// ── reconciliation panel (manual) ───────────────────────────────────────────
const RECON_FIELDS = [
  { key: "po_shtatke_fact", labelKey: "production.recon.poShtatkeFact" },
  { key: "brigadir", labelKey: "production.recon.brigadir" },
  { key: "lider", labelKey: "production.recon.lider" },
  { key: "mitsu", labelKey: "production.recon.mitsu" },
  { key: "otdihaet", labelKey: "production.recon.otdihaet" },
];

function ReconciliationCard({ data, onSave, saving }) {
  const { t } = useLang();
  const [draft, setDraft] = useState(() => ({ ...data }));
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v === "" ? null : Number(v) }));
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
          {t("production.reconTitle")}
        </span>
        <button
          onClick={() => onSave(draft)}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity"
          style={{ background: "var(--brand)", color: "#fff", opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} {t("production.save")}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {RECON_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg"
            style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
            <span>{t(f.labelKey)}</span>
            <input
              type="number"
              value={draft[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              className="w-14 text-right px-1.5 py-1 rounded-md outline-none tabular-nums"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

// ── raw SAP file view (Фаза / Заголовок) ─────────────────────────────────────
function RawView({ fileType, date, managerParam, ready = true }) {
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["production-raw", fileType, date, managerParam.manager_id ?? "self"],
    queryFn: () => api.get("/api/production/raw", { params: { file_type: fileType, date, ...managerParam } }).then((r) => r.data),
    enabled: ready,
  });
  // clear a stale query when the file/date changes so its matches don't hide the new rows
  useEffect(() => { setSearch(""); }, [fileType, date]);

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

// ── main page ────────────────────────────────────────────────────────────────
export default function Production() {
  const { auth } = useAuth();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [view, setView] = useState("zagruzka"); // zagruzka | faza | zaga
  const [unknownOpen, setUnknownOpen] = useState(false);
  // table controls: free-text search (Сап код + Наименование), Команда multi-select, sort
  const [search, setSearch] = useState("");
  const [wcSel, setWcSel] = useState([]); // [] = all teams
  const [sort, setSort] = useState({ key: null, dir: "asc" }); // 3-state cycle: asc → desc → off
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);
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
  // their own shift, top-managers and admins across every unit.
  const canPickManager = ["admin", "top-manager", "shift-manager"].includes(auth?.role);
  const [selManager, setSelManager] = useState(null);

  const { data: mgrData } = useQuery({
    queryKey: ["production-managers"],
    queryFn: () => api.get("/api/production/managers").then((r) => r.data),
    enabled: canPickManager,
  });
  const managers = mgrData?.managers ?? [];
  // Default to the first configured brigadir, and re-sync if the current pick
  // falls out of the list (list just loaded, or a shift-manager's scope narrows).
  useEffect(() => {
    if (!canPickManager) return;
    if (managers.length && (selManager == null || !managers.some((m) => m.manager_id === selManager))) {
      setSelManager(managers[0].manager_id);
    }
  }, [managers, canPickManager]); // eslint-disable-line react-hooks/exhaustive-deps

  const managerParam = canPickManager && selManager != null ? { manager_id: selManager } : {};
  // A picker role hasn't resolved a unit yet (list still loading) → hold the
  // manager-scoped queries so they don't 400 on the missing id.
  const managerReady = !canPickManager || selManager != null;
  // Picker role, list loaded, nothing in scope → no brigadir has production set up.
  const noManagers = canPickManager && mgrData != null && managers.length === 0;

  // Catalog fields (Сап код / Наименование / Труд. / Команда) are admin-editable
  // only — supervisors keep the read-only cells and just edit Факт/ПЛАН.
  const canEditCatalog = auth?.role === "admin";
  // Staffing-card pins (O.soni / штатка, per date) are admin-only as well.
  const canEditStaffing = auth?.role === "admin";

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
    // longer exist, append new columns at the end, never let a locked one hide.
    const saved = colsLocal ?? savedCols;
    const keys = COLS.map((c) => c.key);
    const savedOrder = Array.isArray(saved?.order) ? saved.order.filter((k) => keys.includes(k)) : [];
    const order = [...savedOrder, ...keys.filter((k) => !savedOrder.includes(k))];
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
  });
  const recon = useMutation({
    mutationFn: (payload) => api.post("/api/production/reconciliation", { date, data: payload }, { params: managerParam }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production", date] }),
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

  // Dates that actually have an uploaded snapshot — drives the switcher.
  const { data: datesData } = useQuery({
    queryKey: ["production-dates", managerParam.manager_id ?? "self"],
    queryFn: () => api.get("/api/production/dates", { params: managerParam }).then((r) => r.data),
    enabled: managerReady,
  });
  const availableDates = datesData?.dates ?? [];

  const rows = data?.rows ?? [];
  const wcs = data?.work_centers ?? [];
  const totals = data?.totals ?? {};
  const unknown = data?.unknown_skus ?? [];
  const missingLabor = data?.missing_labor_count ?? 0;
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
    render: () => <OptsFilter opts={wcOptions} sel={wcSel} onChange={setWcSel} />,
  }];
  const filterActiveCount = wcSel.length > 0 ? 1 : 0;

  // Catalog is present but no SAP «фаза» upload exists for this date → all zeros.
  const noSapData = !loading && rows.length > 0 &&
    (totals.total_plan_labor || 0) === 0 && (totals.total_actual_labor || 0) === 0;

  const saveOverride = (row, field) => (value) =>
    override.mutate({ date, sap_code: row.sap_code, work_center: row.work_center, field, value });

  // One renderer per column so the picker can hide/reorder freely — each case
  // is the exact cell markup the table previously hard-coded in SAP order.
  const posCell = (key, r, vyp, wc) => {
    switch (key) {
      case "sap_code":
        return <td key={key} className="px-3 py-2 text-left font-mono" style={{ color: "var(--text-3)" }}>{r.sap_code}</td>;
      case "op":
        return <td key={key} className="px-3 py-2 text-center font-mono" style={{ color: "var(--text-3)" }}>{r.op ?? "—"}</td>;
      case "name":
        return (
          <td key={key} className="px-3 py-2 text-left max-w-[220px]">
            <span className="block max-w-[200px] truncate" title={r.name}>{r.name}</span>
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
            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: hexToRgba(wc, 0.14), color: wc, border: `1px solid ${hexToRgba(wc, 0.28)}` }}>{r.work_center}</span>
          </td>
        );
      case "people":
        return <td key={key} className="px-3 py-2 text-center tabular-nums">{fmt(r.people, 0)}</td>;
      case "vyp":
        return <td key={key} className="px-3 py-2 text-center"><VypCell value={vyp} /></td>;
      case "fact":
        return (
          <td key={key} className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
            <QtyCell value={r.actual_qty} overridden={r.actual_overridden} onSave={saveOverride(r, "actual")} />
          </td>
        );
      case "plan":
        return (
          <td key={key} className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
            <QtyCell value={r.plan_qty} overridden={r.plan_overridden} onSave={saveOverride(r, "plan")} />
          </td>
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
      await api.post("/api/production/export.xlsx", {
        date,
        ...managerParam,
        lang,
        order: viewRows.map((r) => r.id),
        columns: visibleCols.map((c) => c.key),
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
    });
    setEditRow(r);
  };
  const setDraft = (k) => (v) => setCatDraft((d) => ({ ...d, [k]: v }));
  // «Qo'shish» opens the create modal with a blank draft (same four fields).
  const openCreate = () => {
    setCatDraft({ sap_code: "", name: "", labor_time: "", work_center: "" });
    setCreateOpen(true);
  };
  const canSubmitCreate =
    (catDraft.sap_code?.trim() ?? "") !== "" && (catDraft.work_center?.trim() ?? "") !== "";
  const saveCatCreate = () => {
    const sap = catDraft.sap_code.trim();
    const wc = catDraft.work_center.trim();
    if (!sap || !wc) return;                         // sap_code + work_center are required
    const laborRaw = String(catDraft.labor_time).trim();
    const labor = laborRaw === "" ? null : Number(laborRaw.replace(",", "."));
    createCatalog.mutate(
      {
        manager_id: managerParam.manager_id,
        sap_code: sap,
        name: catDraft.name.trim(),
        work_center: wc,
        labor_time: labor != null && !Number.isNaN(labor) ? labor : null,
      },
      { onSuccess: () => setCreateOpen(false) },
    );
  };
  const saveCatEdit = () => {
    const r = editRow;
    if (!r) return;
    // Send only changed fields; sap_code/name/work_center never blanked.
    const body = {};
    const sap = catDraft.sap_code.trim();
    const name = catDraft.name.trim();
    const wc = catDraft.work_center.trim();
    const laborRaw = String(catDraft.labor_time).trim();
    const labor = laborRaw === "" ? null : Number(laborRaw.replace(",", "."));
    if (sap && sap !== (r.sap_code ?? "")) body.sap_code = sap;
    if (name && name !== (r.name ?? "")) body.name = name;
    if (wc && wc !== (r.work_center ?? "")) body.work_center = wc;
    if (labor != null && !Number.isNaN(labor) && labor !== (r.labor_time ?? null)) body.labor_time = labor;
    const done = () => { setEditRow(null); setCatSel(null); };
    if (Object.keys(body).length) catalog.mutate({ id: r.id, body }, { onSuccess: done });
    else done();
  };

  // The reveal strip is appended below its row inside the scroll container, so
  // selecting the LAST row leaves the strip below the fold. Nudge it into view.
  useEffect(() => {
    if (catSel != null) stripRef.current?.scrollIntoView({ block: "nearest" });
  }, [catSel]);

  const isToday = date === todayISO();

  return (
    <Layout title={`${t("production.title")}${data?.manager_name ? " — " + data.manager_name : ""}`} showFilters={false}>
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
      {/* brigadir picker — supervisors are pinned to their own unit (no picker);
          shift-managers pick within their shift, top-managers/admins across all */}
      {canPickManager && (
        <div className="flex items-center gap-2 mb-4">
          <Users size={15} style={{ color: "var(--text-4)" }} className="flex-shrink-0" />
          <StyledSelect
            className="w-full sm:w-72"
            value={selManager != null ? String(selManager) : ""}
            onChange={(v) => setSelManager(v ? Number(v) : null)}
            options={managers.map((m) => ({
              value: String(m.manager_id),
              label: tl(m.name) + (m.shift ? ` · ${t("filter.shift")} ${m.shift}` : ""),
            }))}
            placeholder={t("production.pickBrigadir")}
          />
        </div>
      )}

      {noManagers ? (
        <EmptyState
          title={t("production.noConfiguredTitle")}
          message={t("production.noConfiguredMsg")}
          showUploadLink={false}
        />
      ) : (<>
      {/* date navigation */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <DayStepper value={date} onChange={setDate} max={null} />
        {!isToday && (
          <button onClick={() => setDate(todayISO())} className="px-3 py-2 rounded-xl text-xs font-medium transition-colors hover:bg-[var(--bg-accent)]"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}>
            {t("production.today")}
          </button>
        )}

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

      {/* view switcher: computed dashboard / raw фаза / raw заголовок */}
      <SegmentedToggle
        className="mb-4"
        value={view}
        onChange={setView}
        options={[
          ["zagruzka", t("production.viewZagruzka")],
          ["faza", t("production.viewFaza")],
          ["zaga", t("production.viewZaga")],
        ]}
      />

      {view !== "zagruzka" && (
        <RawView fileType={view} date={date} managerParam={managerParam} ready={managerReady} />
      )}

      {view === "zagruzka" && (<>
      {isError && (
        <div className="rounded-2xl p-4 text-sm" style={{ background: "var(--bg-card)", border: "1px solid #ef4444", color: "#ef4444" }}>
          {error?.response?.data?.detail || t("production.loadError")}
        </div>
      )}

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
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-sm font-bold px-2 py-0.5 rounded-md" style={{ background: hexToRgba(wc, 0.16), color: wc, border: `1px solid ${hexToRgba(wc, 0.3)}` }}>{w.work_center}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: c }}>{pct(w.load)}</span>
                </div>
                <Bar value={w.load} color={c} height={6} track="var(--bg-card)" />
                <div className="flex items-center justify-between mt-2.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                  <span>{t("production.oSoni")} <b style={{ color: "var(--text-2)" }}>{fmt(w.people, 0)}</b> · {t("production.shtatka")} <b style={{ color: "var(--text-2)" }}>{fmt(w.shtatka, 0)}</b></span>
                  <span className="tabular-nums">{fmt(w.total_labor, 0)} {t("production.minUnit")}</span>
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
              size="sm"
              variant="secondary"
              icon={<Download size={14} />}
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
                    {visibleCols.map((c) => posCell(c.key, r, vyp, wc))}
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

      {/* reconciliation */}
      <ReconciliationCard data={data?.reconciliation ?? {}} onSave={(d) => recon.mutate(d)} saving={recon.isPending} />

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
      </>)}
      </>)}
    </Layout>
  );
}
