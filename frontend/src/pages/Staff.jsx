import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle, Pencil, Trash2, X, AlertTriangle,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ChevronsUpDown,
  Users, Download, Plus, Check, Ban, Eye, History, Clock, Lock,
  Calendar, SlidersHorizontal, FileText, UserCheck, Loader2,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import KPICard from "../components/ui/KPICard";
import { SkeletonTable, SkeletonBlock } from "../components/ui/Skeleton";
import StyledSelect from "../components/ui/StyledSelect";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import TimeWheelPicker from "../components/ui/TimeWheelPicker";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { usePersistentState } from "../hooks/usePersistentState";
import { useDragSelect } from "../hooks/useDragSelect";
import api from "../utils/api";
import { fmtPct, fmtNum } from "../utils/formatters";
import { ColFilter, TxtFilter, OptsFilter, RngFilter } from "../components/ui/ColumnFilter";

// ── helpers ───────────────────────────────────────────────────────────────────

export function fmtDateLabel(isoDate) {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

// "1st June, 2026" (en) / "1-iyun, 2026" (uz) / "1 июня, 2026" (ru)
export function fmtLongDate(d, t, lang) {
  const day   = d.getDate();
  const month = t(`cal.mg${d.getMonth()}`);
  const year  = d.getFullYear();
  if (lang === "en") {
    const v = day % 100;
    const sfx = v >= 11 && v <= 13 ? "th"
      : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
    return `${day}${sfx} ${month}, ${year}`;
  }
  if (lang === "uz" || lang === "uz_cyrl") return `${day}-${month}, ${year}`;
  return `${day} ${month}, ${year}`;
}

// "1st June, 2026 · 14:32" — fmtLongDate plus the clock time.
export function fmtCreatedAt(iso, t, lang) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fmtLongDate(d, t, lang)} · ${time}`;
}


const ZAGRUZKA_ROLE_PREFIX = "Кондитер";
const ZAGRUZKA_ROLE_EXACT = new Set(["Фасовщик", "Заготовитель продуктов и сырья"]);

function isBlankText(val) {
  const txt = String(val ?? "").trim();
  return !txt || txt === "nan" || txt === "NaN";
}

function isValidClockInOut(val) {
  const clock = String(val ?? "").trim();
  if (!clock) return false;
  if (clock.toLowerCase() === "x" || clock.toLowerCase() === "o") return false;
  return /\d/.test(clock);
}

function hasWorked(worker) {
  const hours = Number(worker.hours_worked);
  const hasHours = Number.isFinite(hours) && hours > 0;
  const hasClock = isValidClockInOut(worker.clock_in_out);
  return hasHours && hasClock;
}

function sumHours(rows) {
  return rows.reduce((sum, row) => {
    const hours = Number(row.hours_worked);
    return Number.isFinite(hours) ? sum + hours : sum;
  }, 0);
}

// ── Transfer-time helpers (people-exchange split) ──────────────────────────────
function parseHHMM(s) {
  if (!s) return null;
  // Tolerate the verifix clock format's trailing worked-hours suffix, e.g.
  // " 00:38 (7.08)" → "00:38", before splitting into H:M.
  const parts = String(s).split("(")[0].trim().replace(/\./g, ":").replace(/-/g, ":").split(":");
  const h = parseInt(parts[0], 10);
  const m = parts.length > 1 && parts[1] !== "" ? parseInt(parts[1], 10) : 0;
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
}
function scheduleStartMin(schedule) {
  return schedule ? parseHHMM(String(schedule).split("до")[0]) : null;
}
function clockInMin(clock) {
  if (!clock || !String(clock).includes("-")) return null;
  return parseHHMM(String(clock).trim().split("-")[0]);
}
function clockOutMin(clock) {
  if (!clock || !String(clock).includes("-")) return null;
  const parts = String(clock).trim().split("-");
  return parseHHMM(parts[parts.length - 1]);
}

function isZagruzkaCalcWorker(worker) {
  // Must have actually come to work (valid clock + hours > 0)
  if (!hasWorked(worker)) return false;
  // Mirrors CALC_ROWS_FILTER in backend /api/workers.
  const title = String(worker.job_title ?? "").trim();
  const hours = Number(worker.hours_worked);
  const hasHours = Number.isFinite(hours) && hours > 0;
  const titleMissing = isBlankText(title);
  return title.startsWith(ZAGRUZKA_ROLE_PREFIX)
    || ZAGRUZKA_ROLE_EXACT.has(title)
    || (titleMissing && hasHours);
}


// ── Column-filter primitives ──────────────────────────────────────────────────

const INIT_FILTERS = {
  worker: "", job_titles: [], schedules: [], clock: [],
  hours_min: "", hours_max: "",
  early_min: "", early_max: "",
  eff_min:   "", eff_max:   "",
};

function isFilterActive(f) {
  return !!(f.worker || f.job_titles.length || f.schedules.length || f.clock.length ||
    f.hours_min || f.hours_max || f.early_min || f.early_max || f.eff_min || f.eff_max);
}

// ── Export Confirmation Modal ──────────────────────────────────────────────────

function ExportModal({ filteredCount, totalCount, hasFilter, onExport, onClose, exporting }) {
  return (
    <Modal
      onClose={onClose}
      title="Export to Excel"
      icon={<Download size={15} className="flex-shrink-0 text-[var(--brand-text)]" />}
      maxWidth="max-w-sm"
      footer={hasFilter ? (
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" size="sm" onClick={() => onExport(false)} disabled={exporting}>
            All rows ({totalCount})
          </Button>
          <Button size="sm" loading={exporting} onClick={() => onExport(true)}>
            Filtered rows ({filteredCount})
          </Button>
        </>
      ) : (
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={exporting} onClick={() => onExport(false)}>
            Export & Send
          </Button>
        </>
      )}
    >
      <p className="text-xs" style={{ color: "var(--text-3)" }}>
        {hasFilter
          ? "You have active filters applied. What would you like to export?"
          : `Export ${totalCount} workers for this date and send to your Telegram chat?`}
      </p>
    </Modal>
  );
}

// ── Delete Confirmation Modal ─────────────────────────────────────────────────

export function DeleteWorkersModal({ managerId, managerName, date, isAdmin, preSelected, replaceBatchId, onClose, onDeleted }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const [query, setQuery]       = useState("");
  const [selected, setSelected] = useState(() => preSelected ? new Set(preSelected) : new Set());
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["staff-attendance", managerId, date],
    queryFn: () => api.get("/api/staff/attendance", {
      params: { attend_date: date, ...(isAdmin ? { manager_id: managerId } : {}) },
    }).then(r => r.data),
    enabled: !!date && !!managerId,
  });

  const allWorkers = useMemo(() => {
    const raw = data?.workers ?? [];
    return [...raw].sort((a, b) => (a.worker_name || "").localeCompare(b.worker_name || ""));
  }, [data]);

  const filtered = useMemo(() =>
    !query ? allWorkers : allWorkers.filter(w =>
      w.worker_name?.toLowerCase().includes(query.toLowerCase())
    ),
  [allWorkers, query]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every(w => selected.has(w.worker_name));

  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach(w => next.delete(w.worker_name));
      else                      filtered.forEach(w => next.add(w.worker_name));
      return next;
    });
  }

  function toggleOne(name) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }
  const dragRow = useDragSelect(
    name => selected.has(name),
    (name, value) => setSelected(prev => {
      if (prev.has(name) === value) return prev;
      const next = new Set(prev);
      value ? next.add(name) : next.delete(name);
      return next;
    }),
  );

  async function handleSave() {
    if (!selected.size || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await api.post("/api/staff/attendance/bulk-delete", {
        manager_id: managerId,
        attend_date: date,
        worker_names: [...selected],
        ...(replaceBatchId ? { replace_batch_id: replaceBatchId } : {}),
      });
      qc.invalidateQueries({ queryKey: ["staff-attendance"] });
      qc.invalidateQueries({ queryKey: ["staff-deleted"] });
      qc.invalidateQueries({ queryKey: ["staff-documents"] });
      onDeleted(isAdmin ? "success" : "request");
      onClose();
    } catch (e) {
      console.error("Delete failed:", e);
      setSaveError(e?.response?.data?.detail || e?.message || t("common.requestFailed"));
    } finally {
      setSaving(false);
    }
  }

  const subtitle = isAdmin ? t("staff.deleteModalSubAdmin") : t("staff.deleteModalSubSup");
  const footerAction = isAdmin ? t("staff.delete") : t("staff.sendDeleteRequest");
  const footerEffect = selected.size > 0
    ? `${selected.size} ${t("staff.workerUnit")} → ${isAdmin ? t("staff.willBeDeleted") : t("staff.willBeRequested")}`
    : `0 ${t("staff.workerUnit")} → …`;

  return (
    <Modal
      onClose={onClose}
      title={`${t("staff.deleteWorkers")} — ${subtitle}`}
      subtitle={`${fmtDateLabel(date)} · ${managerName}`}
      maxWidth="max-w-2xl"
      bodyClassName="p-0 flex flex-col"
      footer={
        <>
          <div className="mr-auto self-center text-sm"
            style={{ color: saveError ? "#ef4444" : selected.size > 0 ? "#ef4444" : "var(--text-4)" }}>
            {saveError || footerEffect}
          </div>
          <Button variant="secondary" onClick={onClose} disabled={saving}>{t("staff.cancel")}</Button>
          <Button variant="danger" icon={<Trash2 size={13} />} loading={saving}
            disabled={!selected.size} onClick={handleSave}>
            {footerAction}
          </Button>
        </>
      }
    >
        {/* Search bar */}
        <div className="px-5 pt-3 pb-2 flex-shrink-0">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("staff.searchByName")}
            inputClassName="text-sm pl-8 pr-7 py-2"
          />
        </div>

        {/* Column header row */}
        <div className="flex items-center px-5 py-2 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-inner)" }}>
          <div className="w-8 flex-shrink-0 flex items-center">
            <input
              type="checkbox"
              className="cb-danger"
              checked={allFilteredSelected}
              onChange={toggleAll}
              style={{ cursor: "pointer" }}
            />
          </div>
          <div className="flex-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ color: "var(--text-4)" }}>
            {t("staff.colWorker")}
          </div>
          <div className="w-52 text-[11px] font-bold uppercase tracking-wider flex-shrink-0"
            style={{ color: "var(--text-4)" }}>
            {t("staff.colRole")}
          </div>
        </div>

        {/* Worker list */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonBlock key={i} className="h-9 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: "var(--text-4)" }}>
              {t("staff.noWorkersFound")}
            </div>
          ) : filtered.map(w => {
            const checked = selected.has(w.worker_name);
            return (
              <div
                key={w.worker_name}
                {...dragRow(w.worker_name)}
                onClick={() => toggleOne(w.worker_name)}
                className="flex items-center px-5 py-2.5 cursor-pointer transition-colors"
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: checked ? "rgba(239,68,68,0.08)" : "transparent",
                }}
                onMouseEnter={e => { if (!checked) e.currentTarget.style.background = "var(--bg-inner)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = checked ? "rgba(239,68,68,0.08)" : "transparent"; }}
              >
                <div className="w-8 flex-shrink-0 flex items-center">
                  <input
                    type="checkbox"
                    className="cb-danger"
                    checked={checked}
                    onChange={() => toggleOne(w.worker_name)}
                    onClick={e => e.stopPropagation()}
                    style={{ cursor: "pointer" }}
                  />
                </div>
                <div className="flex-1 text-sm font-medium" style={{ color: "var(--text-1)" }}>
                  {tl(w.worker_name)}
                </div>
                <div className="w-52 text-xs flex-shrink-0" style={{ color: "var(--text-3)" }}>
                  {tl(w.job_title) || "—"}
                </div>
              </div>
            );
          })}
        </div>

    </Modal>
  );
}




// ── Attendance Table ───────────────────────────────────────────────────────────

export function AttendanceTable({ managerId, selectedDate, pickSupervisor }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const [filters, setFilters]           = useState(INIT_FILTERS);
  const [showExport, setShowExport]     = useState(false);
  const [exporting, setExporting]       = useState(false);
  const [exportDone, setExportDone]     = useState(false);
  const [nameAsc, setNameAsc]           = useState(true);
  const [isCollapsed, setIsCollapsed]   = useState(false);

  // Reset filters whenever the date or supervisor changes
  useEffect(() => {
    setFilters(INIT_FILTERS);
  }, [selectedDate, managerId]);

  const { data, isLoading } = useQuery({
    queryKey: ["staff-attendance", managerId, selectedDate],
    queryFn: () => api.get("/api/staff/attendance", {
      params: { attend_date: selectedDate, ...(pickSupervisor ? { manager_id: managerId } : {}) },
    }).then(r => r.data),
    enabled: !!selectedDate && !!managerId,
  });

  const allWorkers = data?.workers ?? [];
  const totalWorkers = allWorkers.length;
  const cameWorkers = useMemo(() => allWorkers.filter(hasWorked), [allWorkers]);
  const cameToWorkCount = cameWorkers.length;
  // Count of workers who came to work, broken down by exact job_title,
  // sorted by count desc then title. Blank titles are skipped so each entry
  // maps cleanly onto the job_titles column filter.
  const roleCounts = useMemo(() => {
    const map = new Map();
    for (const w of cameWorkers) {
      const title = w.job_title || "";
      if (!title) continue;
      map.set(title, (map.get(title) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [cameWorkers]);
  const cameRatio = totalWorkers > 0 ? cameToWorkCount / totalWorkers : null;
  const zagruzkaWorkers = useMemo(
    () => allWorkers.filter(isZagruzkaCalcWorker),
    [allWorkers]
  );
  const zagruzkaCount    = zagruzkaWorkers.length;
  const totalWorkedHours = useMemo(() => sumHours(zagruzkaWorkers), [zagruzkaWorkers]);
  const avgWorkedHours   = zagruzkaCount ? totalWorkedHours / zagruzkaCount : null;

  // Distinct option lists from ALL rows (ignore current filters)
  const distinctJobTitles = useMemo(() =>
    [...new Set(allWorkers.map(w => w.job_title || "").filter(Boolean))].sort(),
    [allWorkers]);
  const distinctSchedules = useMemo(() =>
    [...new Set(allWorkers.map(w => w.schedule || "").filter(Boolean))].sort(),
    [allWorkers]);
  const distinctClockInOut = useMemo(() =>
    [...new Set(allWorkers.map(w => w.clock_in_out || ""))].sort(),
    [allWorkers]);

  // Apply all filters
  const workers = useMemo(() => {
    const f = filters;
    return allWorkers.filter(w => {
      if (f.worker     && !w.worker_name?.toLowerCase().includes(f.worker.toLowerCase())) return false;
      if (f.job_titles.length && !f.job_titles.includes(w.job_title || ""))              return false;
      if (f.schedules.length  && !f.schedules.includes(w.schedule   || ""))              return false;
      if (f.clock.length && !f.clock.includes(w.clock_in_out || "")) return false;
      if (f.hours_min !== "" && (w.hours_worked      == null || w.hours_worked      < parseFloat(f.hours_min))) return false;
      if (f.hours_max !== "" && (w.hours_worked      == null || w.hours_worked      > parseFloat(f.hours_max))) return false;
      if (f.early_min !== "" && (w.early_arrival_min == null || w.early_arrival_min < parseFloat(f.early_min))) return false;
      if (f.early_max !== "" && (w.early_arrival_min == null || w.early_arrival_min > parseFloat(f.early_max))) return false;
      if (f.eff_min   !== "" && (w.effective_hours   == null || w.effective_hours   < parseFloat(f.eff_min)))   return false;
      if (f.eff_max   !== "" && (w.effective_hours   == null || w.effective_hours   > parseFloat(f.eff_max)))   return false;
      return true;
    });
  }, [allWorkers, filters]);

  const activeFilter = isFilterActive(filters);
  function setF(key, val) { setFilters(f => ({ ...f, [key]: val })); }
  function toggleRole(title) {
    setFilters(f => {
      const has = f.job_titles.includes(title);
      return { ...f, job_titles: has ? f.job_titles.filter(x => x !== title) : [...f.job_titles, title] };
    });
  }

  const sortedWorkers = nameAsc !== null
    ? [...workers].sort((a, b) => nameAsc
        ? (tl(a.worker_name) || "").localeCompare(tl(b.worker_name) || "")
        : (tl(b.worker_name) || "").localeCompare(tl(a.worker_name) || ""))
    : workers;

  const exportMutation = useMutation({
    mutationFn: (rows) => api.post("/api/staff/attendance/export", {
      manager_id: managerId, attend_date: selectedDate, rows,
    }),
  });

  async function handleExport(useFiltered) {
    const rows = useFiltered ? workers : allWorkers;
    setShowExport(false);
    setExporting(true);
    try {
      await exportMutation.mutateAsync(rows);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 4000);
    } finally {
      setExporting(false);
    }
  }

  if (!selectedDate || !managerId) {
    return (
      <div className="flex items-center justify-center py-16 text-sm" style={{ color: "var(--text-4)" }}>
        {pickSupervisor ? t("staff.selectSupDateToView") : t("staff.selectDateToView")}
      </div>
    );
  }

  // Guard covers: (a) query fetching, (b) the one render where enabled just
  // became true but React Query hasn't set isLoading yet (data still undefined)
  if (isLoading || !data) return (
    <div className="rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SkeletonTable rows={8} cols={6} />
    </div>
  );

  const thCls = "text-left px-3 py-2.5 border-b";

  return (
    <div>
      {/* KPI header — always visible, hosts the collapse toggle */}
      <div className="px-3 pt-3 pb-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
            {t("staff.tabWorkers")}
          </span>
          <button
            onClick={() => setIsCollapsed(v => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition-colors"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-3)" }}
            title={isCollapsed ? t("staff.expand") : t("staff.collapse")}
          >
            <ChevronUp
              size={13}
              style={{
                transform: isCollapsed ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 300ms cubic-bezier(0.4,0,0.2,1)",
              }}
            />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard
            label={t("staff.kpiCame")}
            value={cameToWorkCount}
            sub={`${t("staff.of")} ${totalWorkers} ${t("staff.total")} · ${fmtPct(cameRatio)}`}
          />
          <KPICard
            label={t("staff.kpiCountedZagruzka")}
            value={zagruzkaCount}
            sub={`${t("staff.of")} ${totalWorkers} ${t("staff.total")}`}
          />
          <KPICard
            label={t("staff.kpiTotalHours")}
            value={zagruzkaCount ? `${fmtNum(totalWorkedHours, 1)} ${t("daily.hrs")}` : "—"}
            sub={t("staff.kpiCountedZagruzka")}
          />
          <KPICard
            label={t("staff.kpiAvgTime")}
            value={avgWorkedHours !== null ? `${fmtNum(avgWorkedHours, 2)} ${t("daily.hrs")}` : "—"}
            sub={t("staff.kpiCountedZagruzka")}
          />
        </div>

        {/* Came-to-work breakdown by role — clickable chips toggle the job_titles filter */}
        {roleCounts.length > 0 && (
          <div className="mt-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
              {t("staff.byRole")}
            </span>
            <div className="flex flex-wrap gap-2 mt-2">
              {roleCounts.map(([title, count]) => {
                const active = filters.job_titles.includes(title);
                return (
                  <button
                    key={title}
                    onClick={() => toggleRole(title)}
                    title={tl(title) || title}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors"
                    style={{
                      background: active ? "var(--brand-bg)" : "var(--bg-inner)",
                      border: `1px solid ${active ? "var(--brand-bg)" : "var(--border-md)"}`,
                      color: active ? "var(--brand-text)" : "var(--text-2)",
                    }}
                  >
                    <span className="truncate max-w-[160px]">{tl(title) || title}</span>
                    <span
                      className="font-semibold tabular-nums px-1.5 rounded-md text-[11px]"
                      style={{
                        background: active ? "var(--brand-text)" : "var(--border-md)",
                        color: active ? "var(--bg-card)" : "var(--text-1)",
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Collapsible body — toolbar + table + footer */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: isCollapsed ? "0fr" : "1fr",
          transition: "grid-template-rows 300ms cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div style={{ overflow: "hidden", minHeight: 0, opacity: isCollapsed ? 0 : 1, transition: "opacity 200ms ease" }}>
      {/* Toolbar */}
      <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
        <div className="flex-1">
          <SearchInput
            value={filters.worker}
            onChange={(v) => setF("worker", v)}
            placeholder={t("staff.searchByName")}
            inputClassName="text-xs pl-8 pr-7 py-1.5"
          />
        </div>
        {activeFilter && (
          <button onClick={() => setFilters(INIT_FILTERS)}
            className="text-xs px-2.5 py-1.5 rounded-lg flex-shrink-0"
            style={{ color: "var(--text-4)", border: "1px solid var(--border-md)" }}>
            {t("staff.clearFilters")}
          </button>
        )}
        <button
          onClick={() => setShowExport(true)} disabled={exporting || allWorkers.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
          style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-bg)", opacity: allWorkers.length === 0 ? 0.5 : 1 }}
        >
          <Download size={12} /> {exporting ? t("staff.sending") : t("staff.export")}
        </button>
      </div>

      {/* Export success toast — fixed top-right, outside normal flow */}
      {exportDone && (
        <div
          className="toast-in flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm shadow-lg"
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 9999,
            background: "#22c55e",
            color: "#fff",
            maxWidth: 320,
            boxShadow: "0 8px 24px rgba(34,197,94,0.35)",
          }}
        >
          <CheckCircle size={15} style={{ flexShrink: 0 }} />
          <span>{t("staff.exportToast")}</span>
        </div>
      )}

      {workers.length === 0 ? (
        <div className="py-8 text-center text-sm" style={{ color: "var(--text-4)" }}>
          {activeFilter ? t("staff.noMatch") : t("staff.noData")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: "var(--bg-inner)", borderColor: "var(--border)" }}>
                <th className={thCls} style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-1">
                    <ColFilter label={t("staff.colWorker")} active={!!filters.worker}>
                      <TxtFilter value={filters.worker} onChange={v => setF("worker", v)} />
                    </ColFilter>
                    <button
                      onClick={() => setNameAsc(p => p === null ? true : p ? false : null)}
                      style={{ opacity: nameAsc === null ? 0.4 : 1, lineHeight: 0, flexShrink: 0 }}
                      title={t("common.sortAZ")}
                    >
                      {nameAsc === null ? <ChevronsUpDown size={9}/> : nameAsc ? <ChevronUp size={9}/> : <ChevronDown size={9}/>}
                    </button>
                  </div>
                </th>
                <th className={thCls} style={{ borderColor: "var(--border)" }}>
                  <ColFilter label={t("staff.colRole")} active={filters.job_titles.length > 0}>
                    <OptsFilter opts={distinctJobTitles} sel={filters.job_titles} onChange={v => setF("job_titles", v)} render={o => tl(o) || o} />
                  </ColFilter>
                </th>
                <th className={thCls} style={{ borderColor: "var(--border)" }}>
                  <ColFilter label={t("staff.colSchedule")} active={filters.schedules.length > 0}>
                    <OptsFilter opts={distinctSchedules} sel={filters.schedules} onChange={v => setF("schedules", v)} />
                  </ColFilter>
                </th>
                <th className={thCls} style={{ borderColor: "var(--border)" }}>
                  <ColFilter label={t("staff.colClock")} active={filters.clock.length > 0}>
                    <OptsFilter opts={distinctClockInOut} sel={filters.clock} onChange={v => setF("clock", v)} />
                  </ColFilter>
                </th>
                <th className={thCls} style={{ borderColor: "var(--border)" }}>
                  <ColFilter label={t("staff.colHours")} active={!!(filters.hours_min || filters.hours_max)}>
                    <RngFilter minV={filters.hours_min} maxV={filters.hours_max}
                      onMin={v => setF("hours_min", v)} onMax={v => setF("hours_max", v)} />
                  </ColFilter>
                </th>
                <th className={thCls} style={{ borderColor: "var(--border)" }}>
                  <ColFilter label={t("staff.colEarly")} active={!!(filters.early_min || filters.early_max)}>
                    <RngFilter minV={filters.early_min} maxV={filters.early_max}
                      onMin={v => setF("early_min", v)} onMax={v => setF("early_max", v)} />
                  </ColFilter>
                </th>
                <th className={thCls} style={{ borderColor: "var(--border)" }}>
                  <ColFilter label={t("staff.colEffHours")} active={!!(filters.eff_min || filters.eff_max)}>
                    <RngFilter minV={filters.eff_min} maxV={filters.eff_max}
                      onMin={v => setF("eff_min", v)} onMax={v => setF("eff_max", v)} />
                  </ColFilter>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedWorkers.map(w => (
                <tr key={w.worker_name} className="border-b hover:bg-white/5"
                  style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span>{tl(w.worker_name)}</span>
                      {w.on_task && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap self-start"
                          title={t("staff.onTask")}
                          style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--border-md)" }}>
                          🗂 {w.on_task}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{tl(w.job_title) || "—"}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{tl(w.schedule) || "—"}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{tl(w.clock_in_out) || "—"}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
                    {w.hours_worked != null ? w.hours_worked : "—"}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
                    {w.early_arrival_min != null ? w.early_arrival_min : "—"}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
                    {w.effective_hours != null ? w.effective_hours : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Row-count badge — portaled to <body>: the .page-enter wrapper's
          animation (fill-mode both) keeps a transform, which would make it the
          containing block for position:fixed and pin the badge to the page. */}
      {!isCollapsed && createPortal(
        <div
          className="fixed bottom-4 right-4 z-40 px-3 py-2 rounded-xl text-xs font-semibold shadow-lg"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-md)",
            color: "var(--text-2)",
          }}
        >
          {t("staff.showingRows").replace("{n}", workers.length)}
        </div>,
        document.body,
      )}

      {/* Extra hours note */}
      {(data?.extra_hours ?? 0) > 0 && (
        <div className="px-4 py-2.5 flex justify-end border-t" style={{ borderColor: "var(--border)" }}>
          <span className="text-[11px]" style={{ color: "var(--text-4)" }}>
            {t("staff.extraHoursNote").replace("{n}", data.extra_hours)}
          </span>
        </div>
      )}
        </div>{/* end overflow:hidden inner */}
      </div>{/* end grid collapsible wrapper */}

      {showExport && (
        <ExportModal
          filteredCount={workers.length}
          totalCount={allWorkers.length}
          hasFilter={activeFilter}
          onExport={handleExport}
          onClose={() => setShowExport(false)}
          exporting={exporting}
        />
      )}

    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// HR Documents — document-driven change workflow
// ════════════════════════════════════════════════════════════════════════════

export const DOC_TYPE_TKEY = {
  role_change: "staff.roleChange",
  people_exchange: "staff.peopleExchange",
  graphic_change: "staff.graphicChange",
  deletion: "staff.docTypeDeletion",
};
const DOC_TYPES = [
  { id: "role_change",     label: "Role Change",     ru: "Изменение должности", enabled: true  },
  { id: "people_exchange", label: "People Exchange", ru: "Перевод сотрудников", enabled: true  },
  { id: "graphic_change",  label: "Graphic Change",  ru: "Изменение графика",   enabled: false },
];

// ── "Создать" dropdown (Workers toolbar) ──────────────────────────────────────

export function CreateMenu({ onSelect, disabled, disabledHint, onDeleteSelected, role }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors"
        style={{ background: "var(--brand)", color: "#fff" }}
      >
        <Plus size={14} /> {t("staff.create")}
        <ChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1.5 z-50 rounded-xl overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)",
                   boxShadow: "0 8px 24px rgba(0,0,0,0.18)", minWidth: 230, maxWidth: "calc(100vw - 24px)" }}>
          {DOC_TYPES.map(dt => {
            const blocked = !dt.enabled || disabled;
            return (
              <button
                key={dt.id}
                disabled={blocked}
                onClick={() => { if (!blocked) { onSelect(dt.id); setOpen(false); } }}
                className="w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors"
                style={{ color: blocked ? "var(--text-4)" : "var(--text-1)", cursor: blocked ? "not-allowed" : "pointer" }}
                onMouseEnter={e => { if (!blocked) e.currentTarget.style.background = "var(--bg-inner)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                title={!dt.enabled ? t("staff.comingSoon") : (disabled ? disabledHint : "")}
              >
                <span className="flex flex-col">
                  <span>{t(DOC_TYPE_TKEY[dt.id])}</span>
                </span>
                {!dt.enabled && (
                  <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-full"
                    style={{ background: "var(--bg-inner)", color: "var(--text-4)" }}>{t("staff.soon")}</span>
                )}
              </button>
            );
          })}

          {/* Delete workers */}
          <button
            disabled={disabled}
            onClick={() => { if (!disabled) { onDeleteSelected(); setOpen(false); } }}
            className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition-colors"
            style={{
              color: disabled ? "var(--text-4)" : "#ef4444",
              cursor: disabled ? "not-allowed" : "pointer",
            }}
            onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = "var(--bg-inner)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            title={disabled ? disabledHint : ""}
          >
            <Trash2 size={13} />
            {t("staff.deleteWorkers")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Да / Нет binary status pill ───────────────────────────────────────────────

function YesNoBadge({ approved }) {
  const { t } = useLang();
  return (
    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full inline-block"
      style={approved
        ? { background: "#22c55e22", color: "#16a34a", border: "1px solid #22c55e44" }
        : { background: "var(--bg-inner)", color: "var(--text-4)", border: "1px solid var(--border-md)" }}>
      {approved ? t("staff.yes") : t("staff.no")}
    </span>
  );
}

// ── 3-state badge for deletion request batches ────────────────────────────────

export function DeletionStatusBadge({ status }) {
  const { t } = useLang();
  if (status === "approved") {
    return (
      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full inline-block"
        style={{ background: "#22c55e22", color: "#16a34a", border: "1px solid #22c55e44" }}>
        {t("staff.yes")}
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full inline-block"
        style={{ background: "#ef444422", color: "#ef4444", border: "1px solid #ef444444" }}>
        {t("staff.rejected")}
      </span>
    );
  }
  // pending
  return (
    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full inline-block"
      style={{ background: "#f59e0b22", color: "#d97706", border: "1px solid #f59e0b44" }}>
      {t("staff.pending")}
    </span>
  );
}

// ── Role Change create / edit screen (full-screen overlay) ────────────────────

export function RoleChangeCreate({ role, managerId, selectedDate, editDoc, onClose, onSaved }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const isEdit  = !!editDoc;
  const date    = isEdit ? editDoc.date       : selectedDate;
  const mgrId   = isEdit ? editDoc.manager_id : managerId;
  const isAdmin = role === "admin";

  const [query, setQuery]       = useState("");
  const [newRole, setNewRole]   = useState(isEdit ? (editDoc.new_role || "") : "");
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const initialised             = useRef(false);
  const rangeAnchor             = useRef(null);   // last plain-clicked row, for shift-range select

  // Click toggles a row; shift-click selects every row between the last
  // plain-clicked anchor and the target (inclusive), in the shown order.
  function handleRowClick(e, name) {
    if (e.shiftKey && rangeAnchor.current && rangeAnchor.current !== name) {
      const names = filtered.map(w => w.worker_name);
      const a = names.indexOf(rangeAnchor.current);
      const b = names.indexOf(name);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelected(s => {
          const n = new Set(s);
          for (let i = lo; i <= hi; i++) n.add(names[i]);
          return n;
        });
        window.getSelection?.()?.removeAllRanges();   // drop the shift-click text highlight
        return;
      }
    }
    toggle(name);
    rangeAnchor.current = name;
  }

  const { data: roleOpts = { job_titles: [] } } = useQuery({
    queryKey: ["field-options"],
    queryFn: () => api.get("/api/staff/field-options").then(r => r.data),
    staleTime: 300_000,
  });

  // Edit mode: pull the full document (the list row carries no employees array)
  const { data: detail } = useQuery({
    queryKey: ["staff-document", editDoc?.id],
    queryFn: () => api.get(`/api/staff/documents/${editDoc.id}`).then(r => r.data),
    enabled: isEdit,
  });
  useEffect(() => {
    if (isEdit && detail && !initialised.current) {
      setNewRole(detail.new_role || "");
      setSelected(new Set((detail.employees || []).map(e => e.worker_name)));
      initialised.current = true;
    }
  }, [isEdit, detail]);

  const { data: attData, isLoading } = useQuery({
    queryKey: ["staff-attendance", mgrId, date],
    queryFn: () => api.get("/api/staff/attendance", {
      params: { attend_date: date, ...(isAdmin ? { manager_id: mgrId } : {}) },
    }).then(r => r.data),
    enabled: !!date && !!mgrId,
  });

  const employees = attData?.workers ?? [];
  const filtered = useMemo(
    () => employees.filter(w => !query || w.worker_name?.toLowerCase().includes(query.toLowerCase())),
    [employees, query]
  );

  const allShownSelected = filtered.length > 0 && filtered.every(w => selected.has(w.worker_name));

  function toggle(name) {
    setSelected(s => {
      const n = new Set(s);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  }
  const dragRow = useDragSelect(
    name => selected.has(name),
    (name, value) => setSelected(s => {
      if (s.has(name) === value) return s;
      const n = new Set(s);
      value ? n.add(name) : n.delete(name);
      return n;
    }),
  );
  function toggleAllShown() {
    setSelected(s => {
      const n = new Set(s);
      if (allShownSelected) filtered.forEach(w => n.delete(w.worker_name));
      else                  filtered.forEach(w => n.add(w.worker_name));
      return n;
    });
  }

  async function handleSave() {
    setError("");
    if (!newRole)        { setError(t("staff.chooseRole")); return; }
    if (selected.size === 0) { setError(t("staff.selectAtLeastOne")); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/api/staff/documents/${editDoc.id}`, {
          new_role: newRole, employees: [...selected],
        });
      } else {
        await api.post("/api/staff/documents", {
          doc_type: "role_change", attend_date: date,
          ...(isAdmin ? { manager_id: mgrId } : {}),
          new_role: newRole, employees: [...selected],
        });
      }
      qc.invalidateQueries({ queryKey: ["staff-documents"] });
      qc.invalidateQueries({ queryKey: ["staff-documents-pending-count"] });
      qc.invalidateQueries({ queryKey: ["staff-attendance"] });
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.detail || t("staff.failedSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      zIndex={100}
      maxWidth="max-w-3xl"
      title={isEdit ? t("staff.editRoleChange") : `${t("staff.roleChange")} — ${t("staff.newDocument")}`}
      subtitle={`${fmtDateLabel(date)} · ${tl(editDoc?.supervisor_name || attData?.manager_name || "")}`}
      bodyClassName="p-0 flex flex-col"
      footer={
        <>
          <span className="mr-auto self-center text-[11px]" style={{ color: error ? "#ef4444" : "var(--text-4)" }}>
            {error || `${selected.size} ${t("staff.employeesWord")} → ${newRole || "…"}`}
          </span>
          <Button variant="secondary" size="sm" onClick={onClose}>{t("staff.cancel")}</Button>
          <Button size="sm" icon={<Check size={13} />} loading={saving} onClick={handleSave}>
            {isEdit ? t("staff.saveChanges") : t("staff.saveDocument")}
          </Button>
        </>
      }
    >
        {/* role picker */}
        <div className="px-5 py-3 border-b flex flex-wrap items-center gap-3 flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>{t("staff.newRoleFor")}</span>
          <StyledSelect
            value={newRole}
            onChange={setNewRole}
            options={(roleOpts.assignable_job_titles ?? roleOpts.job_titles).map(j => ({ value: j, label: tl(j) }))}
            placeholder={t("staff.selectRoleOpt")}
            className="flex-1 min-w-[200px] text-xs"
          />
          <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
            {selected.size} {t("staff.selected")}
          </span>
        </div>

        {/* employee search */}
        <div className="px-5 py-2.5 border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("staff.searchEmployees")}
            inputClassName="text-xs pl-8 pr-7 py-2"
          />
        </div>

        {/* employee list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {!date || !mgrId ? (
            <div className="py-10 text-center text-sm" style={{ color: "var(--text-4)" }}>
              {isAdmin ? t("staff.selectDateSupFirstDot") : t("staff.selectDateFirstDot")}
            </div>
          ) : isLoading ? (
            <SkeletonTable rows={8} cols={5} />
          ) : employees.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: "var(--text-4)" }}>{t("staff.noEmployees")}</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--bg-inner)", borderBottom: "1px solid var(--border)" }}>
                  <th className="w-10 px-3 py-2 text-center">
                    <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} />
                  </th>
                  <th className="text-left px-3 py-2 font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-3)" }}>{t("staff.colEmployee")}</th>
                  <th className="text-left px-3 py-2 font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-3)" }}>{t("staff.colCurrentRole")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(w => {
                  const on = selected.has(w.worker_name);
                  return (
                    <tr key={w.worker_name}
                      {...dragRow(w.worker_name)}
                      onClick={(e) => handleRowClick(e, w.worker_name)}
                      className="border-b cursor-pointer hover:bg-white/5"
                      style={{ borderColor: "var(--border)", background: on ? "var(--brand-bg)" : "transparent" }}>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={on} readOnly />
                      </td>
                      <td className="px-3 py-2" style={{ color: "var(--text-1)" }}>{tl(w.worker_name)}</td>
                      <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>{tl(w.job_title) || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

    </Modal>
  );
}

// ── People Exchange create / edit screen (full-screen overlay) ────────────────

export function PeopleExchangeCreate({ role, managerId, selectedDate, editDoc, onClose, onSaved }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const isEdit  = !!editDoc;
  const date    = isEdit ? editDoc.date       : selectedDate;
  const mgrId   = isEdit ? editDoc.manager_id : managerId;
  const isAdmin = role === "admin";

  const [query, setQuery]       = useState("");
  const [target, setTarget]     = useState("");     // "sup:<id>" | "task:<name>" | "__new__"
  const [newTask, setNewTask]   = useState("");
  const [selected, setSelected] = useState(new Set());
  const [useTime, setUseTime]   = useState(false);  // transfer-time split (admin + supervisor)
  const [transferTime, setTransferTime] = useState("");  // "HH:MM"
  const [pickerOpen, setPickerOpen]     = useState(false);  // wheel time-picker popup
  const [useReturn, setUseReturn]       = useState(false);  // optional carve-out: worker returns at R
  const [returnTime, setReturnTime]     = useState("");     // "HH:MM" (must be > transferTime)
  const [returnPickerOpen, setReturnPickerOpen] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  const [taskToRemove, setTaskToRemove] = useState(null);  // admin-only task removal
  const [removingTask, setRemovingTask]  = useState(false);
  const [removeError, setRemoveError]    = useState("");
  const initialised             = useRef(false);
  const rangeAnchor             = useRef(null);   // last plain-clicked row, for shift-range select

  // Move-to options: other open-day supervisors + tasks already created today
  const { data: supTargets = [] } = useQuery({
    queryKey: ["exchange-targets", mgrId, date],
    queryFn: () => api.get("/api/staff/exchange-targets", {
      params: { attend_date: date, ...(isAdmin ? { manager_id: mgrId } : {}) },
    }).then(r => r.data),
    enabled: !!date,
  });
  const { data: taskData = { tasks: [] } } = useQuery({
    queryKey: ["exchange-tasks", date],
    queryFn: () => api.get("/api/staff/tasks", { params: { attend_date: date } }).then(r => r.data),
    enabled: !!date,
  });

  // Edit mode: hydrate target + selection from the document
  const { data: detail } = useQuery({
    queryKey: ["staff-document", editDoc?.id],
    queryFn: () => api.get(`/api/staff/documents/${editDoc.id}`).then(r => r.data),
    enabled: isEdit,
  });
  useEffect(() => {
    if (isEdit && detail && !initialised.current) {
      if (detail.target_type === "supervisor" && detail.target_manager_id)
        setTarget(`sup:${detail.target_manager_id}`);
      else if (detail.target_type === "task" && detail.task_name)
        setTarget(`task:${detail.task_name}`);
      setSelected(new Set((detail.employees || []).map(e => e.worker_name)));
      if (detail.transfer_time) { setUseTime(true); setTransferTime(detail.transfer_time); }
      if (detail.return_time)   { setUseReturn(true); setReturnTime(detail.return_time); }
      initialised.current = true;
    }
  }, [isEdit, detail]);

  const { data: attData, isLoading } = useQuery({
    queryKey: ["staff-attendance", mgrId, date],
    queryFn: () => api.get("/api/staff/attendance", {
      params: { attend_date: date, ...(isAdmin ? { manager_id: mgrId } : {}) },
    }).then(r => r.data),
    enabled: !!date && !!mgrId,
  });

  const employees = attData?.workers ?? [];
  const filtered = useMemo(
    () => employees.filter(w => !query || w.worker_name?.toLowerCase().includes(query.toLowerCase())),
    [employees, query]
  );
  const allShownSelected = filtered.length > 0 && filtered.every(w => selected.has(w.worker_name));

  const targetOptions = useMemo(() => {
    const opts = [];
    supTargets.forEach(s => opts.push({ value: `sup:${s.manager_id}`, label: `👤 ${tl(s.full_name)}` }));
    (taskData.tasks || []).forEach(name => opts.push({ value: `task:${name}`, label: `🗂 ${name}`, removable: isAdmin, taskName: name }));
    // Creating a brand-new task is admin-only; supervisors may only pick existing ones.
    if (isAdmin) opts.push({ value: "__new__", label: `＋ ${t("staff.newTask")}` });
    return opts;
  }, [supTargets, taskData, tl, t, isAdmin]);

  // Transfer-time split: available to admins and supervisors, for a → supervisor
  // or → task move. Selectable times run from the earliest start (schedule-start,
  // falling back to clock-in) to the latest clock-out across the selected workers,
  // in 5-minute steps. The clock-in fallback ensures a worker with worked hours but
  // no schedule still produces options.
  const targetIsSup  = target.startsWith("sup:");
  const targetIsTask = target.startsWith("task:") || target === "__new__";
  const canUseTime   = targetIsSup || targetIsTask;
  // Valid transfer-time window (minutes from midnight) = earliest start →
  // latest clock-out across the selected workers. Overnight shifts whose clock-out
  // lands past midnight (out < start) are carried into the next day (+1440) so the
  // window stays a real span; the picker renders these as wall-clock (mod 24h). The
  // wheel picker is bounded to this; null when no worker has a clock-out yet.
  const timeWindow = useMemo(() => {
    const sels = employees.filter(w => selected.has(w.worker_name));
    const starts = [], outs = [];
    sels.forEach(w => {
      const s = scheduleStartMin(w.schedule) ?? clockInMin(w.clock_in_out);
      let o = clockOutMin(w.clock_in_out);
      if (s != null && o != null && o < s) o += 1440;   // clock-out crossed midnight
      if (s != null) starts.push(s);
      if (o != null) outs.push(o);
    });
    if (!starts.length || !outs.length) return null;
    const lo = Math.min(...starts);
    const hi = Math.max(...outs);
    return hi >= lo ? { lo, hi } : null;
  }, [employees, selected]);

  // Keep the picked time valid as the selection changes. Wait for the roster to
  // load first, so a hydrated edit-mode time isn't cleared during the fetch.
  useEffect(() => {
    if (!transferTime || !employees.length) return;
    let m = parseHHMM(transferTime);
    // A post-midnight pick (e.g. "00:38") sits below the window's start → carry it
    // into the next day so it's matched against the overnight upper bound.
    if (m != null && timeWindow && m < timeWindow.lo) m += 1440;
    if (!timeWindow || m == null || m < timeWindow.lo || m > timeWindow.hi) setTransferTime("");
  }, [timeWindow, transferTime, employees.length]);

  // The return time R ends the away stint, so it must fall between the transfer
  // time T and the latest clock-out. Window = [T, timeWindow.hi]; null when there
  // is no T yet or no room after it. Overnight T is carried like the transfer one.
  const returnWindow = useMemo(() => {
    if (!transferTime || !timeWindow) return null;
    let tMin = parseHHMM(transferTime);
    if (tMin == null) return null;
    if (tMin < timeWindow.lo) tMin += 1440;          // post-midnight transfer
    return timeWindow.hi > tMin ? { lo: tMin, hi: timeWindow.hi } : null;
  }, [transferTime, timeWindow]);

  // Drop the return time if it falls outside [T, latest clock-out] as T/selection
  // change (e.g. the transfer time was pushed past the old return).
  useEffect(() => {
    if (!returnTime || !employees.length) return;
    let m = parseHHMM(returnTime);
    if (m != null && returnWindow && m < returnWindow.lo) m += 1440;
    if (!returnWindow || m == null || m < returnWindow.lo || m > returnWindow.hi) setReturnTime("");
  }, [returnWindow, returnTime, employees.length]);

  function toggle(name) {
    setSelected(s => {
      const n = new Set(s);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  }
  // Click a row to toggle it; shift-click a second row to select every row
  // between the last plain-clicked anchor and it (inclusive), in the order
  // currently shown. The anchor stays put so the range can be re-extended.
  function handleRowClick(e, name) {
    if (e.shiftKey && rangeAnchor.current && rangeAnchor.current !== name) {
      const names = filtered.map(w => w.worker_name);
      const a = names.indexOf(rangeAnchor.current);
      const b = names.indexOf(name);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelected(s => {
          const n = new Set(s);
          for (let i = lo; i <= hi; i++) n.add(names[i]);
          return n;
        });
        window.getSelection?.()?.removeAllRanges();   // drop the shift-click text highlight
        return;
      }
    }
    toggle(name);
    rangeAnchor.current = name;
  }
  const dragRow = useDragSelect(
    name => selected.has(name),
    (name, value) => setSelected(s => {
      if (s.has(name) === value) return s;
      const n = new Set(s);
      value ? n.add(name) : n.delete(name);
      return n;
    }),
  );
  function toggleAllShown() {
    setSelected(s => {
      const n = new Set(s);
      if (allShownSelected) filtered.forEach(w => n.delete(w.worker_name));
      else                  filtered.forEach(w => n.add(w.worker_name));
      return n;
    });
  }

  function targetLabel() {
    if (target === "__new__")        return newTask.trim() || "…";
    if (target.startsWith("sup:")) {
      const s = supTargets.find(x => `sup:${x.manager_id}` === target);
      return s ? tl(s.full_name) : "…";
    }
    if (target.startsWith("task:"))  return target.slice(5);
    return "…";
  }
  function resolveTarget() {
    if (target === "__new__") {
      const name = newTask.trim();
      return name ? { target_type: "task", task_name: name } : null;
    }
    if (target.startsWith("sup:"))  return { target_type: "supervisor", target_manager_id: parseInt(target.slice(4), 10) };
    if (target.startsWith("task:")) return { target_type: "task", task_name: target.slice(5) };
    return null;
  }

  // Admin-only: remove a task from the shared list (confirmation modal first)
  async function confirmRemoveTask() {
    if (!taskToRemove) return;
    setRemoveError("");
    setRemovingTask(true);
    try {
      await api.post("/api/staff/tasks/delete", { name: taskToRemove });
      // Clear the picker if it pointed at the task we just removed
      if (target === `task:${taskToRemove}`) setTarget("");
      qc.invalidateQueries({ queryKey: ["exchange-tasks"] });
      setTaskToRemove(null);
    } catch (e) {
      setRemoveError(e?.response?.data?.detail || t("staff.failedRemove"));
    } finally {
      setRemovingTask(false);
    }
  }

  async function handleSave() {
    setError("");
    const tgt = resolveTarget();
    if (!tgt)                { setError(t("staff.chooseTarget")); return; }
    if (selected.size === 0) { setError(t("staff.selectAtLeastOne")); return; }
    // Transfer-time is only meaningful for a → supervisor/task move with the
    // toggle on and a time chosen. Always send the field (empty clears it). The
    // return time only rides along when there is a transfer time (it's the away
    // stint's end), and only when its own toggle is on with a valid pick.
    const tt = (canUseTime && useTime && transferTime) ? transferTime : "";
    const rt = (tt && useReturn && returnTime) ? returnTime : "";
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/api/staff/documents/${editDoc.id}`, { ...tgt, employees: [...selected], transfer_time: tt, return_time: rt });
      } else {
        await api.post("/api/staff/documents", {
          doc_type: "people_exchange", attend_date: date,
          ...(isAdmin ? { manager_id: mgrId } : {}),
          ...tgt, employees: [...selected], transfer_time: tt, return_time: rt,
        });
      }
      qc.invalidateQueries({ queryKey: ["staff-documents"] });
      qc.invalidateQueries({ queryKey: ["staff-documents-pending-count"] });
      qc.invalidateQueries({ queryKey: ["staff-attendance"] });
      onSaved();
    } catch (e) {
      setError(e?.response?.data?.detail || t("staff.failedSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Modal
      onClose={onClose}
      zIndex={100}
      maxWidth="max-w-3xl"
      title={isEdit ? t("staff.editPeopleExchange") : `${t("staff.peopleExchange")} — ${t("staff.newDocument")}`}
      subtitle={`${fmtDateLabel(date)} · ${tl(editDoc?.supervisor_name || attData?.manager_name || "")}`}
      bodyClassName="p-0 flex flex-col"
      footer={
        <>
          <span className="mr-auto self-center text-[11px]" style={{ color: error ? "#ef4444" : "var(--text-4)" }}>
            {error || `${selected.size} ${t("staff.employeesWord")} → ${targetLabel()}`}
          </span>
          <Button variant="secondary" size="sm" onClick={onClose}>{t("staff.cancel")}</Button>
          <Button size="sm" icon={<Check size={13} />} loading={saving} onClick={handleSave}>
            {isEdit ? t("staff.saveChanges") : t("staff.saveDocument")}
          </Button>
        </>
      }
    >
        {/* target picker */}
        <div className="px-5 py-3 border-b flex flex-wrap items-center gap-3 flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>{t("staff.moveTo")}</span>
          <StyledSelect
            value={target}
            onChange={setTarget}
            options={targetOptions}
            placeholder={t("staff.selectTargetOpt")}
            className="flex-1 min-w-[220px] text-xs"
            onRemove={isAdmin ? (opt) => { setRemoveError(""); setTaskToRemove(opt.taskName); } : undefined}
            removeTitle={t("staff.removeTaskTooltip")}
          />
          {target === "__new__" && (
            <input
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              placeholder={t("staff.taskNamePlaceholder")}
              autoFocus
              className="flex-1 min-w-[180px] text-xs px-3 py-2 rounded-lg outline-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          )}
          <span className="text-[11px] px-2 py-1 rounded-full" style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
            {selected.size} {t("staff.selected")}
          </span>
        </div>

        {/* transfer-time split (admin + supervisor, → supervisor or task) */}
        {canUseTime && (
          <div className="px-5 py-3 border-b flex flex-wrap items-center gap-3 flex-shrink-0" style={{ borderColor: "var(--border)" }}>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={useTime}
                onClick={() => setUseTime(v => !v)}
                className="relative inline-flex items-center rounded-full transition-colors flex-shrink-0"
                style={{
                  width: 36, height: 20,
                  background: useTime ? "var(--brand)" : "var(--border-md)",
                }}>
                <span
                  className="inline-block rounded-full transition-transform"
                  style={{
                    width: 16, height: 16, background: "#fff",
                    transform: useTime ? "translateX(18px)" : "translateX(2px)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                  }} />
              </button>
              <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>{t("staff.transferTimeToggle")}</span>
            </label>
            {useTime && (timeWindow ? (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="w-28 text-xs px-3 py-2 rounded-lg outline-none flex items-center justify-between gap-2"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)",
                         color: transferTime ? "var(--text-1)" : "var(--text-4)" }}>
                <span>{transferTime || t("staff.transferTimePlaceholder")}</span>
                <Clock size={13} style={{ color: "var(--text-4)" }} />
              </button>
            ) : (
              <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{t("staff.transferTimeNoOptions")}</span>
            ))}
            {useTime && transferTime && (
              <span className="text-[11px] flex-1 min-w-[180px]" style={{ color: "var(--text-4)" }}>
                {t(targetIsTask ? "staff.transferTimeHintTask" : "staff.transferTimeHint")}
              </span>
            )}
            <TimeWheelPicker
              open={pickerOpen && !!timeWindow}
              lo={timeWindow?.lo}
              hi={timeWindow?.hi}
              value={transferTime}
              onConfirm={(v) => { setTransferTime(v); setPickerOpen(false); }}
              onClose={() => setPickerOpen(false)}
            />
          </div>
        )}

        {/* return-time carve-out — only once a transfer time exists. The away
            stint is [transfer, return]; the worker comes back to the home unit. */}
        {canUseTime && useTime && transferTime && (
          <div className="px-5 py-3 border-b flex flex-wrap items-center gap-3 flex-shrink-0" style={{ borderColor: "var(--border)" }}>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={useReturn}
                onClick={() => setUseReturn(v => !v)}
                className="relative inline-flex items-center rounded-full transition-colors flex-shrink-0"
                style={{ width: 36, height: 20, background: useReturn ? "var(--brand)" : "var(--border-md)" }}>
                <span
                  className="inline-block rounded-full transition-transform"
                  style={{ width: 16, height: 16, background: "#fff",
                    transform: useReturn ? "translateX(18px)" : "translateX(2px)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.3)" }} />
              </button>
              <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>{t("staff.returnTimeToggle")}</span>
            </label>
            {useReturn && (returnWindow ? (
              <button
                type="button"
                onClick={() => setReturnPickerOpen(true)}
                className="w-28 text-xs px-3 py-2 rounded-lg outline-none flex items-center justify-between gap-2"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)",
                         color: returnTime ? "var(--text-1)" : "var(--text-4)" }}>
                <span>{returnTime || t("staff.returnTimePlaceholder")}</span>
                <Clock size={13} style={{ color: "var(--text-4)" }} />
              </button>
            ) : (
              <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{t("staff.returnTimeNoOptions")}</span>
            ))}
            {useReturn && returnTime && (
              <span className="text-[11px] flex-1 min-w-[180px]" style={{ color: "var(--text-4)" }}>
                {t(targetIsTask ? "staff.returnTimeHintTask" : "staff.returnTimeHint")}
              </span>
            )}
            <TimeWheelPicker
              open={returnPickerOpen && !!returnWindow}
              lo={returnWindow?.lo}
              hi={returnWindow?.hi}
              value={returnTime}
              onConfirm={(v) => { setReturnTime(v); setReturnPickerOpen(false); }}
              onClose={() => setReturnPickerOpen(false)}
            />
          </div>
        )}

        {/* employee search */}
        <div className="px-5 py-2.5 border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t("staff.searchEmployees")}
            inputClassName="text-xs pl-8 pr-7 py-2"
          />
        </div>

        {/* employee list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {!date || !mgrId ? (
            <div className="py-10 text-center text-sm" style={{ color: "var(--text-4)" }}>
              {isAdmin ? t("staff.selectDateSupFirstDot") : t("staff.selectDateFirstDot")}
            </div>
          ) : isLoading ? (
            <SkeletonTable rows={8} cols={5} />
          ) : employees.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: "var(--text-4)" }}>{t("staff.noEmployees")}</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--bg-inner)", borderBottom: "1px solid var(--border)" }}>
                  <th className="w-10 px-3 py-2 text-center">
                    <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} />
                  </th>
                  <th className="text-left px-3 py-2 font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-3)" }}>{t("staff.colEmployee")}</th>
                  <th className="text-left px-3 py-2 font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-3)" }}>{t("staff.colCurrentRole")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(w => {
                  const on = selected.has(w.worker_name);
                  return (
                    <tr key={w.worker_name}
                      {...dragRow(w.worker_name)}
                      onClick={(e) => handleRowClick(e, w.worker_name)}
                      className="border-b cursor-pointer hover:bg-white/5"
                      style={{ borderColor: "var(--border)", background: on ? "var(--brand-bg)" : "transparent" }}>
                      <td className="px-3 py-2 text-center">
                        <input type="checkbox" checked={on} readOnly />
                      </td>
                      <td className="px-3 py-2" style={{ color: "var(--text-1)" }}>{tl(w.worker_name)}</td>
                      <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>{tl(w.job_title) || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

    </Modal>

    {/* Admin-only task removal confirmation */}
    <ConfirmDialog
      open={!!taskToRemove}
      zIndex={110}
      tone="danger"
      icon={<AlertTriangle size={20} />}
      title={t("staff.removeTaskTitle")}
      message={
        <>
          {t("staff.removeTaskBody")}
          <span className="block text-sm font-semibold mt-2" style={{ color: "var(--text-1)" }}>
            🗂 {taskToRemove}
          </span>
          {removeError && (
            <span className="block mt-3" style={{ color: "#ef4444" }}>{removeError}</span>
          )}
        </>
      }
      cancelLabel={t("staff.cancel")}
      confirmLabel={t("staff.removeTaskConfirm")}
      loading={removingTask}
      onCancel={() => setTaskToRemove(null)}
      onConfirm={confirmRemoveTask}
    />
    </>
  );
}

// ── View modal ────────────────────────────────────────────────────────────────

export function DocumentViewModal({ docId, onClose }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const { data: doc, isLoading } = useQuery({
    queryKey: ["staff-document", docId],
    queryFn: () => api.get(`/api/staff/documents/${docId}`).then(r => r.data),
    enabled: !!docId,
  });

  return (
    <Modal onClose={onClose} zIndex={100} title={t("staff.documentDetails")} bodyClassName="p-0">
        {isLoading || !doc ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-5 w-full" />)}
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Field label={t("staff.fType")}        value={DOC_TYPE_TKEY[doc.doc_type] ? t(DOC_TYPE_TKEY[doc.doc_type]) : doc.doc_type_label} />
              <Field label={t("staff.fDate")}        value={fmtDateLabel(doc.date)} />
              <Field label={t("staff.fUnit")}        value={tl(doc.supervisor_name) || "—"} />
              <Field label={t("staff.fStatus")}      value={doc.approved ? t("staff.posted") : doc.status === "rejected" ? t("staff.rejected") : t("staff.draft")} />
              <Field label={t("staff.fCreatedBy")}   value={tl(doc.created_by_name) || "—"} />
              <Field label={t("staff.fApprovedBy")}  value={tl(doc.approved_by_name) || "—"} />
            </div>
            {doc.doc_type === "people_exchange" ? (
              <div className="text-xs">
                <div className="font-semibold mb-1.5" style={{ color: "var(--text-2)" }}>
                  {t("staff.moveTo")}{" "}
                  <span style={{ color: "var(--brand-text)" }}>
                    {doc.target_type === "supervisor"
                      ? `👤 ${tl(doc.target_manager_name) || "—"}`
                      : `🗂 ${doc.task_name || "—"}`}
                  </span>
                </div>
                {doc.transfer_time && (
                  <div className="mb-1.5 flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{ background: "var(--bg-inner)", color: "var(--text-1)" }}>
                      <Clock size={11} style={{ color: "var(--text-4)" }} />
                      {t("staff.transferTimeLabel")}: {doc.transfer_time}
                    </span>
                    {doc.return_time && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                        style={{ background: "var(--bg-inner)", color: "var(--text-1)" }}>
                        <Clock size={11} style={{ color: "var(--text-4)" }} />
                        {t("staff.returnTimeLabel")}: {doc.return_time}
                      </span>
                    )}
                    <span className="text-[11px]" style={{ color: "var(--text-4)" }}>
                      {doc.return_time
                        ? t(doc.target_type === "task" ? "staff.returnTimeHintTask" : "staff.returnTimeHint")
                        : t(doc.target_type === "task" ? "staff.transferTimeHintTask" : "staff.transferTimeHint")}
                    </span>
                  </div>
                )}
                <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: "var(--bg-inner)" }}>
                        <th className="text-left px-3 py-1.5 text-[10px] uppercase" style={{ color: "var(--text-3)" }}>{t("staff.colEmployee")}</th>
                        <th className="text-left px-3 py-1.5 text-[10px] uppercase" style={{ color: "var(--text-3)" }}>{t("staff.colCurrentRole")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(doc.employees || []).map(e => (
                        <tr key={e.worker_name} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="px-3 py-1.5" style={{ color: "var(--text-1)" }}>{tl(e.worker_name)}</td>
                          <td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>{tl(e.old_role) || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
            <div className="text-xs">
              <div className="font-semibold mb-1.5" style={{ color: "var(--text-2)" }}>
                {t("staff.targetRole")} <span style={{ color: "var(--brand-text)" }}>{tl(doc.new_role)}</span>
              </div>
              <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ background: "var(--bg-inner)" }}>
                      <th className="text-left px-3 py-1.5 text-[10px] uppercase" style={{ color: "var(--text-3)" }}>{t("staff.colEmployee")}</th>
                      <th className="text-left px-3 py-1.5 text-[10px] uppercase" style={{ color: "var(--text-3)" }}>{t("staff.oldNew")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(doc.employees || []).map(e => (
                      <tr key={e.worker_name} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="px-3 py-1.5" style={{ color: "var(--text-1)" }}>{tl(e.worker_name)}</td>
                        <td className="px-3 py-1.5" style={{ color: "var(--text-3)" }}>
                          <span style={{ textDecoration: "line-through", color: "var(--text-4)" }}>{e.old_role || "—"}</span>
                          {" → "}
                          <span style={{ color: "var(--text-1)", fontWeight: 500 }}>{tl(doc.new_role)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </div>
        )}
    </Modal>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-4)" }}>{label}</div>
      <div style={{ color: "var(--text-1)" }}>{value}</div>
    </div>
  );
}

// ── History modal ─────────────────────────────────────────────────────────────

const HISTORY_TKEY = {
  created: "staff.actionCreated", edited: "staff.actionEdited",
  approved: "staff.histPosted", cancelled: "staff.histUnposted",
  rejected: "staff.rejected",
};

function DocumentHistoryModal({ docId, onClose }) {
  const { t } = useLang();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["staff-document-history", docId],
    queryFn: () => api.get(`/api/staff/documents/${docId}/history`).then(r => r.data),
    enabled: !!docId,
  });

  return (
    <Modal onClose={onClose} zIndex={100} maxWidth="max-w-md" title={t("staff.history")} bodyClassName="p-0">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-10 w-full" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "var(--text-4)" }}>{t("staff.noHistory")}</div>
        ) : (
          <div className="p-4 space-y-2">
            {rows.map(h => (
              <div key={h.id} className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ background: "var(--bg-inner)" }}>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
                  {HISTORY_TKEY[h.action] ? t(HISTORY_TKEY[h.action]) : h.action}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs" style={{ color: "var(--text-2)" }}>{h.actor_name || "—"}</div>
                  <div className="text-[10px]" style={{ color: "var(--text-4)" }}>
                    {h.created_at ? new Date(h.created_at).toLocaleString() : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
    </Modal>
  );
}

// ── Documents Panel (Requests tab) ────────────────────────────────────────────

// Expanded panel for a grouped deletion request batch
function DeletionBatchPanel({ doc, isManager, isCreatorRole, delReqMutation, batchMutation, onEdit }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const workers      = doc.workers || [];
  const pendingW     = workers.filter(w => w.status === "pending");
  const approvedW    = workers.filter(w => w.status === "approved");
  const hasPending   = pendingW.length > 0;
  const hasApproved  = approvedW.length > 0;

  // Admin: which pending workers are checked (pre-check all)
  const [checkedIds, setCheckedIds] = useState(() => new Set(pendingW.map(w => w.id)));
  function toggleCheck(id) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  const dragRow = useDragSelect(
    id => checkedIds.has(Number(id)),
    (id, value) => setCheckedIds(prev => {
      const n = Number(id);
      if (prev.has(n) === value) return prev;
      const next = new Set(prev);
      value ? next.add(n) : next.delete(n);
      return next;
    }),
  );

  return (
    <div className="flex flex-col gap-2 py-1">
      {/* Worker list */}
      <div className="flex flex-col gap-1">
        {workers.map(w => (
          <div key={w.id} {...(isManager && w.status === "pending" ? dragRow(w.id) : {})}
            className="flex items-center gap-2 py-0.5 px-1 rounded"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {/* Admin pending checkbox */}
            {isManager && w.status === "pending" && (
              <input
                type="checkbox"
                checked={checkedIds.has(w.id)}
                onChange={() => toggleCheck(w.id)}
                className="flex-shrink-0"
              />
            )}
            {/* Status dot */}
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background:
                w.status === "approved" ? "#22c55e"
                : w.status === "rejected" ? "#ef4444"
                : w.status === "undone"   ? "#6b7280"
                : "#f59e0b" }} />
            <span className="text-xs flex-1" style={{ color: "var(--text-1)" }}>{tl(w.worker_name)}</span>
            {/* Admin: restore approved worker */}
            {isManager && w.status === "approved" && (
              <button
                onClick={() => delReqMutation.mutate({ id: w.id, action: "undo" })}
                className="text-[10px] px-2 py-0.5 rounded"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "#22c55e" }}>
                {t("staff.restore")}
              </button>
            )}
            {/* Supervisor: remove individual worker */}
            {isCreatorRole && w.status === "pending" && (
              <button
                onClick={() => delReqMutation.mutate({ id: w.id, action: "withdraw" })}
                className="text-[10px] px-2 py-0.5 rounded"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "#ef4444" }}>
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Action buttons row */}
      <div className="flex flex-wrap gap-2 pt-1">
        {/* Admin batch approve/reject */}
        {isManager && hasPending && (
          <>
            <ActionBtn
              icon={Check}
              label={checkedIds.size === pendingW.length ? t("staff.post") : `${t("staff.post")} (${checkedIds.size})`}
              color="#16a34a"
              onClick={() => batchMutation.mutate({
                batchId: (doc.batch_id || `solo-${doc.id}`),
                action:  "approve",
                ids:     checkedIds.size < pendingW.length ? [...checkedIds] : undefined,
              })}
            />
            <ActionBtn
              icon={Ban}
              label={t("staff.unpost")}
              color="#d97706"
              onClick={() => batchMutation.mutate({ batchId: (doc.batch_id || `solo-${doc.id}`), action: "reject" })}
            />
          </>
        )}
        {/* Supervisor: edit + cancel all */}
        {isCreatorRole && hasPending && (
          <>
            <ActionBtn icon={Pencil} label={t("staff.edit")} onClick={onEdit} />
            <ActionBtn
              icon={Trash2}
              label={t("staff.cancel")}
              color="#ef4444"
              onClick={() => batchMutation.mutate({ batchId: (doc.batch_id || `solo-${doc.id}`), action: "withdraw" })}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Filter Bottom Sheet (mobile / tablet < lg) ────────────────────────────────
// ── Mobile single-date picker (full-screen overlay) ──────────────────────────

function MobileSheetDatePicker({ value, onChange, t }) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState("");
  const [view, setView] = useState(() => {
    const base = value || todayStr();
    const d = new Date(base + "T00:00:00");
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function isoOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function shiftDay(iso, n) {
    const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoOf(d);
  }

  function openPicker() {
    setTemp(value || "");
    const base = value || todayStr();
    const d = new Date(base + "T00:00:00");
    setView({ year: d.getFullYear(), month: d.getMonth() });
    setOpen(true);
  }

  const { year, month } = view;
  const today = todayStr();

  const presets = [
    { label: t("filter.today"),     iso: today },
    { label: t("filter.yesterday"), iso: shiftDay(today, -1) },
  ];

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const daysInPrev   = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--)
    cells.push({ day: daysInPrev - i, cur: false, iso: isoOf(new Date(year, month - 1, daysInPrev - i)) });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, cur: true, iso: isoOf(new Date(year, month, d)) });
  for (let d = 1; cells.length < 42; d++)
    cells.push({ day: d, cur: false, iso: isoOf(new Date(year, month + 1, d)) });

  function prevMonth() {
    setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 });
  }
  function nextMonth() {
    setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 });
  }

  return (
    <>
      <div className="px-4 pb-1">
        <button
          onClick={openPicker}
          className="w-full rounded-xl px-3 py-2.5 text-sm flex items-center gap-2"
          style={{
            background: "var(--bg-inner)",
            border: `1px solid ${value ? "var(--brand)" : "var(--border-md)"}`,
            color: value ? "var(--text-1)" : "var(--text-3)",
          }}
        >
          <Calendar size={14} style={{ color: "var(--text-4)", flexShrink: 0 }} />
          <span className="flex-1 text-left">{value ? fmtDateLabel(value) : t("staff.selectDate")}</span>
        </button>
        {value && (
          <button
            onClick={() => onChange("")}
            className="mt-1.5 text-xs flex items-center gap-1"
            style={{ color: "var(--text-4)" }}
          >
            <X size={11} /> {t("filter.clear")}
          </button>
        )}
      </div>

      {open && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 10001, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={() => setOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }} />
          <div style={{
            position: "relative",
            background: "var(--bg-card)",
            borderRadius: "20px 20px 0 0",
            maxHeight: "90dvh",
            display: "flex",
            flexDirection: "column",
            animation: "slideUpSheet 0.22s cubic-bezier(0.32,0.72,0,1) both",
            paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
          }}>
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-md)" }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <span className="text-base font-semibold" style={{ color: "var(--text-1)" }}>
                {t("filter.selectDates")}
              </span>
              <button onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full"
                style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                <X size={15} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-4 py-3">
              {/* Presets */}
              <div className="flex gap-2 mb-5">
                {presets.map(p => (
                  <button key={p.label}
                    onClick={() => {
                      setTemp(p.iso);
                      setView({ year: parseInt(p.iso.split("-")[0]), month: parseInt(p.iso.split("-")[1]) - 1 });
                    }}
                    className="px-4 py-2 rounded-full text-sm"
                    style={{
                      background: temp === p.iso ? "var(--brand)" : "var(--bg-inner)",
                      color: temp === p.iso ? "#fff" : "var(--text-2)",
                      border: `1px solid ${temp === p.iso ? "transparent" : "var(--border-md)"}`,
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Month nav */}
              <div className="flex items-center justify-between mb-3">
                <button onClick={prevMonth} className="p-2.5 rounded-xl" style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                  <ChevronLeft size={18} />
                </button>
                <span className="text-base font-semibold" style={{ color: "var(--text-1)" }}>
                  {t(`cal.m${month}`)} {year}
                </span>
                <button onClick={nextMonth} className="p-2.5 rounded-xl" style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 mb-1">
                {[0,1,2,3,4,5,6].map(i => (
                  <div key={i} className="text-center text-[11px] font-medium py-1.5" style={{ color: "var(--text-4)" }}>
                    {t(`cal.d${i}`)}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map((cell, i) => {
                  const isSel    = temp === cell.iso;
                  const isToday  = today === cell.iso;
                  return (
                    <button
                      key={i}
                      onClick={() => { if (cell.cur) setTemp(cell.iso); }}
                      className="aspect-square flex items-center justify-center rounded-xl text-sm font-medium transition-colors"
                      style={{
                        background: isSel ? "var(--brand)" : "transparent",
                        color: isSel ? "#fff" : isToday ? "var(--brand-text)" : cell.cur ? "var(--text-2)" : "var(--text-4)",
                        outline: isToday && !isSel ? "1.5px solid var(--brand)" : "none",
                        outlineOffset: -2,
                        opacity: cell.cur ? 1 : 0.3,
                      }}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 flex gap-2" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                onClick={() => { onChange(""); setOpen(false); }}
                className="py-2.5 px-4 rounded-xl text-sm font-semibold"
                style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border-md)" }}>
                {t("filter.clear")}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="py-2.5 px-4 rounded-xl text-sm font-semibold"
                style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
                {t("filter.cancel")}
              </button>
              <button
                disabled={!temp}
                onClick={() => { onChange(temp); setOpen(false); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ background: "var(--brand)", color: "#fff" }}>
                {t("filter.apply")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FilterBottomSheet({
  open, onClose,
  isManager, tl, t,
  createdFilter, setCreatedFilter,
  supervisorFilter, setSupervisorFilter, distinctSupervisors,
  typeFilter, setTypeFilter, distinctTypes,
  statusFilter, setStatusFilter,
  approverFilter, setApproverFilter, distinctApprovers,
  dateFilter, setDateFilter,
  clearAllFilters, anyFilterActive,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Prevent body scroll while sheet is open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  function SheetSection({ label, children }) {
    return (
      <div className="py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2 px-4"
          style={{ color: "var(--text-4)" }}>{label}</p>
        {children}
      </div>
    );
  }

  function SheetOpts({ opts, sel, onChange, render }) {
    return (
      <div className="flex flex-col">
        {opts.length === 0 && (
          <p className="text-sm px-4 py-1" style={{ color: "var(--text-4)" }}>{t("filter.noData")}</p>
        )}
        {opts.map(o => {
          const active = sel.includes(o);
          return (
            <button key={o}
              onClick={() => onChange(active ? sel.filter(v => v !== o) : [...sel, o])}
              className="w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-3"
              style={{
                background: active ? "var(--brand-bg)" : "transparent",
                color: active ? "var(--brand-text)" : "var(--text-2)",
              }}>
              <span className="truncate">{render ? render(o) : (o || "—")}</span>
              {active && <Check size={14} style={{ flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
    );
  }

  function SheetStatus() {
    const opts = [
      ["all", t("staff.all")],
      ["pending", t("staff.pending")],
      ["yes", t("staff.yes")],
      ["no", t("staff.rejected")],
    ];
    return (
      <div className="flex flex-col">
        {opts.map(([v, lbl]) => {
          const active = statusFilter === v;
          return (
            <button key={v}
              onClick={() => setStatusFilter(v)}
              className="w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-3"
              style={{
                background: active ? "var(--brand-bg)" : "transparent",
                color: active ? "var(--brand-text)" : "var(--text-2)",
              }}>
              <span className="truncate">{lbl}</span>
              {active && <Check size={14} style={{ flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
    );
  }


  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(3px)",
        }}
      />

      {/* Sheet */}
      <div
        ref={ref}
        style={{
          position: "relative",
          background: "var(--bg-card)",
          borderRadius: "20px 20px 0 0",
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          animation: "slideUpSheet 0.22s cubic-bezier(0.32,0.72,0,1) both",
          paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-md)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 pt-1"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-base font-semibold" style={{ color: "var(--text-1)" }}>
            {t("filter.filters")}
          </span>
          <div className="flex items-center gap-2">
            {anyFilterActive && (
              <button
                onClick={clearAllFilters}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{
                  background: "var(--bg-inner)",
                  border: "1px solid var(--border-md)",
                  color: "var(--text-3)",
                }}>
                {t("staff.clearAll")}
              </button>
            )}
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full"
              style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          <SheetSection label={t("staff.selectDate")}>
            <MobileSheetDatePicker value={dateFilter} onChange={setDateFilter} t={t} />
          </SheetSection>

          {isManager && (
            <SheetSection label={t("staff.colSupervisor")}>
              <SheetOpts opts={distinctSupervisors} sel={supervisorFilter} onChange={setSupervisorFilter} render={v => tl(v)} />
            </SheetSection>
          )}

          <SheetSection label={t("staff.colDocType")}>
            <SheetOpts
              opts={distinctTypes}
              sel={typeFilter}
              onChange={setTypeFilter}
              render={id => DOC_TYPE_TKEY[id] ? t(DOC_TYPE_TKEY[id]) : id}
            />
          </SheetSection>

          <SheetSection label={t("staff.colPosted")}>
            <SheetStatus />
          </SheetSection>

          <SheetSection label={t("staff.colApprovedBy")}>
            <SheetOpts opts={distinctApprovers} sel={approverFilter} onChange={setApproverFilter} render={v => tl(v)} />
          </SheetSection>

          <SheetSection label={t("staff.selectCreatedDate")}>
            <MobileSheetDatePicker value={createdFilter} onChange={setCreatedFilter} t={t} />
          </SheetSection>
        </div>
      </div>

      <style>{`
        @keyframes slideUpSheet {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}

// Desktop: collapses all filter pills into a single dropdown button
function FilterButton({ activeCount, anyFilterActive, clearAllFilters, children }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors"
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${open || anyFilterActive ? "var(--brand)" : "var(--border-md)"}`,
          color: anyFilterActive ? "var(--text-1)" : "var(--text-3)",
        }}
      >
        <SlidersHorizontal size={14} style={{ color: anyFilterActive ? "var(--brand)" : "var(--text-4)", flexShrink: 0 }} />
        <span className="whitespace-nowrap">{t("filter.filters")}</span>
        {activeCount > 0 && (
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "var(--brand)", color: "#fff", lineHeight: 1.2 }}>
            {activeCount}
          </span>
        )}
        <ChevronDown size={13}
          style={{ color: "var(--text-4)", flexShrink: 0, marginLeft: 2,
            transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div
          className="absolute top-full right-0 mt-1.5 z-50 rounded-xl p-3"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            width: 300,
          }}
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
              {t("filter.filters")}
            </span>
            {anyFilterActive && (
              <button onClick={clearAllFilters}
                className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-lg"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-3)" }}>
                <X size={11} /> {t("staff.clearAll")}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentsPanel({ role, myManagerId, myTelegramId, documents = [], isLoading, onEdit }) {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const isManager = role === "admin" || role === "shift-manager";

  const [selected, setSelected]     = useState(() => new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [viewId, setViewId]         = useState(null);
  const [historyId, setHistoryId]   = useState(null);
  const [typeFilter, setTypeFilter]             = useState([]);
  const [statusFilter, setStatusFilter]         = useState("all"); // all | pending | yes | no
  const [supervisorFilter, setSupervisorFilter] = useState([]);
  const [approverFilter, setApproverFilter]     = useState([]);
  const [dateFilter, setDateFilter]             = useState(""); // single ISO date, "" = all
  const [createdFilter, setCreatedFilter]       = useState(""); // single ISO date (creation day), "" = all
  const [sheetOpen, setSheetOpen]               = useState(false);
  const [sortCol, setSortCol]                   = useState(null);  // "created"|"date"|"supervisor"|"type"|"status"|"approver"
  const [sortDir, setSortDir]                   = useState("asc"); // "asc"|"desc"

  function handleSort(col) {
    if (sortCol !== col) { setSortCol(col); setSortDir("asc"); }
    else if (sortDir === "asc") { setSortDir("desc"); }
    else { setSortCol(null); setSortDir("asc"); }
  }
  const [editingBatch, setEditingBatch] = useState(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["staff-documents"] });
    qc.invalidateQueries({ queryKey: ["staff-documents-pending-count"] });
    qc.invalidateQueries({ queryKey: ["staff-attendance"] });
  };
  const single = (id, action) => api.post(`/api/staff/documents/${id}/${action}`).then(invalidate);

  const batchMutation = useMutation({
    mutationFn: ({ batchId, action, ids }) =>
      api.post(`/api/staff/requests/batch/${batchId}/${action}`, ids ? { ids } : {}),
    onSuccess: invalidate,
  });

  // Per-button in-flight tracking so an action button shows a spinner while its
  // request runs (and blocks the row's other actions until it settles).
  const [busyKey, setBusyKey] = useState(null);
  const runAction = (key, fn) => {
    if (busyKey) return;
    setBusyKey(key);
    Promise.resolve(fn()).catch(() => {}).finally(() => setBusyKey(null));
  };

  function rowKey(d) {
    return d._source === "deletion"
      ? (d.batch_id ? `del-batch-${d.batch_id}` : `del-${d.id}`)
      : `doc-${d.id}`;
  }

  async function handleBulk(action) {
    const keys = [...selected];
    const docIds   = keys.filter(k => k.startsWith("doc-")).map(k => parseInt(k.slice(4), 10));
    const batchIds = keys.filter(k => k.startsWith("del-batch-")).map(k => k.slice(10));
    // Solo/legacy deletion requests have no batch_id — addressed as solo-{id}.
    const soloIds  = keys.filter(k => k.startsWith("del-") && !k.startsWith("del-batch-")).map(k => k.slice(4));
    const batchAction = action === "approve" ? "approve" : action === "cancel" ? "reject" : "withdraw";
    const calls = [];
    if (docIds.length)   calls.push(api.post("/api/staff/documents/bulk", { ids: docIds, action }));
    batchIds.forEach(bid => calls.push(api.post(`/api/staff/requests/batch/${bid}/${batchAction}`)));
    soloIds.forEach(id  => calls.push(api.post(`/api/staff/requests/batch/solo-${id}/${batchAction}`)));
    await Promise.all(calls);
    invalidate();
    setSelected(new Set());
  }

  const distinctTypes = useMemo(
    () => [...new Set(documents.map(d => d.doc_type))],
    [documents]
  );
  const distinctSupervisors = useMemo(
    () => [...new Set(documents.map(d => d.supervisor_name).filter(Boolean))],
    [documents]
  );
  const distinctApprovers = useMemo(
    () => [...new Set(documents.map(d => d.approved_by_name).filter(Boolean))],
    [documents]
  );
  const availableDates = useMemo(
    () => new Set(documents.map(d => d.date).filter(Boolean)),
    [documents]
  );
  const createdDay = d => (d.created_at || "").slice(0, 10);
  const availableCreatedDates = useMemo(
    () => new Set(documents.map(createdDay).filter(Boolean)),
    [documents]
  );

  const STATUS_ORDER = { pending: 0, approved: 1, rejected: 2 };
  const docStatus = d => d.approved ? "approved" : (d.status === "rejected" ? "rejected" : "pending");

  const rows = useMemo(() => {
    let r = documents.filter(d => {
      if (dateFilter             && d.date !== dateFilter)                         return false;
      if (createdFilter          && createdDay(d) !== createdFilter)               return false;
      if (typeFilter.length       && !typeFilter.includes(d.doc_type))              return false;
      if (supervisorFilter.length && !supervisorFilter.includes(d.supervisor_name)) return false;
      if (approverFilter.length   && !approverFilter.includes(d.approved_by_name))  return false;
      if (statusFilter === "pending") return docStatus(d) === "pending";
      if (statusFilter === "yes"    ) return docStatus(d) === "approved";
      if (statusFilter === "no"     ) return docStatus(d) === "rejected";
      return true;
    });
    r = [...r].sort((a, b) => {
      // Default (no sort col): newest created_at first
      if (!sortCol) return (b.created_at || "").localeCompare(a.created_at || "");
      let cmp = 0;
      if      (sortCol === "created")    cmp = (a.created_at        || "").localeCompare(b.created_at        || "");
      else if (sortCol === "date")       cmp = (a.date              || "").localeCompare(b.date              || "");
      else if (sortCol === "supervisor") cmp = (tl(a.supervisor_name)   || "").localeCompare(tl(b.supervisor_name)   || "");
      else if (sortCol === "type")       cmp = (a.doc_type          || "").localeCompare(b.doc_type          || "");
      else if (sortCol === "status")     cmp = STATUS_ORDER[docStatus(a)] - STATUS_ORDER[docStatus(b)];
      else if (sortCol === "approver")   cmp = (tl(a.approved_by_name)  || "").localeCompare(tl(b.approved_by_name)  || "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [documents, dateFilter, createdFilter, typeFilter, supervisorFilter, approverFilter, statusFilter, sortCol, sortDir, lang]);

  function toggleSel(key) {
    setSelected(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  const dragRow = useDragSelect(
    key => selected.has(key),
    (key, value) => setSelected(s => {
      if (s.has(key) === value) return s;
      const n = new Set(s);
      value ? n.add(key) : n.delete(key);
      return n;
    }),
  );
  const allSelected = rows.length > 0 && rows.every(d => selected.has(rowKey(d)));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map(rowKey)));
  }

  if (isLoading) return <div className="rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}><SkeletonTable rows={6} cols={6} /></div>;
  if (documents.length === 0) return <div className="py-12 text-center text-sm" style={{ color: "var(--text-4)" }}>{t("staff.noDocuments")}</div>;

  const thCls = "px-3 py-2.5 font-semibold uppercase tracking-wide text-[10px]";

  const anyFilterActive = !!dateFilter || !!createdFilter || supervisorFilter.length > 0 ||
    typeFilter.length > 0 || approverFilter.length > 0 || statusFilter !== "all";

  function clearAllFilters() {
    setDateFilter(""); setCreatedFilter(""); setSupervisorFilter([]); setTypeFilter([]);
    setApproverFilter([]); setStatusFilter("all");
  }

  return (
    <div className="space-y-3">
      {/* ── Unified toolbar: bulk actions (always shown, disabled until a row is
            selected) on the left, a single Filters button on the right. Always
            rendered so selecting rows never shifts the table. ───────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Bulk actions — always visible; enabled only when rows are selected */}
        {isManager && (
          <>
            <button onClick={() => handleBulk("approve")} disabled={selected.size === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-opacity"
              style={{ background: "#22c55e22", color: "#16a34a", border: "1px solid #22c55e44",
                opacity: selected.size === 0 ? 0.4 : 1, cursor: selected.size === 0 ? "not-allowed" : "pointer" }}>
              <Check size={12} /> {t("staff.post")}
            </button>
            <button onClick={() => handleBulk("cancel")} disabled={selected.size === 0}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-opacity"
              style={{ background: "#f59e0b22", color: "#d97706", border: "1px solid #f59e0b44",
                opacity: selected.size === 0 ? 0.4 : 1, cursor: selected.size === 0 ? "not-allowed" : "pointer" }}>
              <Ban size={12} /> {t("staff.unpost")}
            </button>
          </>
        )}
        <button onClick={() => handleBulk("delete")} disabled={selected.size === 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-opacity"
          style={{ background: "#ef444422", color: "#ef4444", border: "1px solid #ef444444",
            opacity: selected.size === 0 ? 0.4 : 1, cursor: selected.size === 0 ? "not-allowed" : "pointer" }}>
          <Trash2 size={12} /> {t("staff.delete")}
        </button>

        {/* Selected-count chip — appears inside the bar once rows are selected */}
        {selected.size > 0 && (
          <div className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)" }}>
            <span className="text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>
              {selected.size} {t("staff.selected")}
            </span>
            <button onClick={() => setSelected(new Set())}
              className="flex items-center justify-center w-4 h-4 rounded" style={{ color: "var(--text-4)" }}>
              <X size={13} />
            </button>
          </div>
        )}

        <div className="flex-1" />

        {/* Filters — single button. Mobile (<lg): bottom sheet · Desktop (lg+): dropdown */}
        <button
          onClick={() => setSheetOpen(true)}
          className="flex lg:hidden items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors"
          style={{
            background: "var(--bg-card)",
            border: `1px solid ${anyFilterActive ? "var(--brand)" : "var(--border-md)"}`,
            color: anyFilterActive ? "var(--text-1)" : "var(--text-3)",
          }}
        >
          <SlidersHorizontal size={14} style={{ color: anyFilterActive ? "var(--brand)" : "var(--text-4)", flexShrink: 0 }} />
          <span>{t("filter.filters")}</span>
          {anyFilterActive && (
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--brand)", color: "#fff", lineHeight: 1.2 }}>
              {[createdFilter, supervisorFilter.length > 0, typeFilter.length > 0, statusFilter !== "all", approverFilter.length > 0, dateFilter].filter(Boolean).length}
            </span>
          )}
        </button>

        <div className="hidden lg:block">
          <FilterButton
            anyFilterActive={anyFilterActive}
            clearAllFilters={clearAllFilters}
            activeCount={[createdFilter, supervisorFilter.length > 0, typeFilter.length > 0, statusFilter !== "all", approverFilter.length > 0, dateFilter].filter(Boolean).length}
          >
            <DatePicker value={dateFilter} onChange={setDateFilter} availableDates={availableDates} />
            {isManager && (
              <FilterDropdown icon={Users} label={t("staff.colSupervisor")}
                active={supervisorFilter.length > 0}
                display={supervisorFilter.length === 1 ? tl(supervisorFilter[0]) : `${supervisorFilter.length} ${t("filter.selected2")}`}>
                <DropdownOpts opts={distinctSupervisors} sel={supervisorFilter} onChange={setSupervisorFilter} render={v => tl(v)} />
              </FilterDropdown>
            )}
            <FilterDropdown icon={FileText} label={t("staff.colDocType")}
              active={typeFilter.length > 0}
              display={typeFilter.length === 1
                ? (DOC_TYPE_TKEY[typeFilter[0]] ? t(DOC_TYPE_TKEY[typeFilter[0]]) : typeFilter[0])
                : `${typeFilter.length} ${t("filter.selected2")}`}>
              <DropdownOpts opts={distinctTypes} sel={typeFilter} onChange={setTypeFilter} render={id => DOC_TYPE_TKEY[id] ? t(DOC_TYPE_TKEY[id]) : id} />
            </FilterDropdown>
            <FilterDropdown icon={CheckCircle} label={t("staff.colPosted")}
              active={statusFilter !== "all"}
              display={statusFilter === "pending" ? t("staff.pending") : statusFilter === "yes" ? t("staff.yes") : t("staff.rejected")}>
              {({ close }) => (
                <DropdownStatus value={statusFilter} onChange={v => { setStatusFilter(v); close(); }} />
              )}
            </FilterDropdown>
            <FilterDropdown icon={UserCheck} label={t("staff.colApprovedBy")}
              active={approverFilter.length > 0}
              display={approverFilter.length === 1 ? tl(approverFilter[0]) : `${approverFilter.length} ${t("filter.selected2")}`}>
              <DropdownOpts opts={distinctApprovers} sel={approverFilter} onChange={setApproverFilter} render={v => tl(v)} />
            </FilterDropdown>
            <DatePicker value={createdFilter} onChange={setCreatedFilter}
              availableDates={availableCreatedDates} placeholder={t("staff.selectCreatedDate")} />
          </FilterButton>
        </div>

        <FilterBottomSheet
          open={sheetOpen} onClose={() => setSheetOpen(false)}
          isManager={isManager} tl={tl} t={t}
          createdFilter={createdFilter} setCreatedFilter={setCreatedFilter}
          supervisorFilter={supervisorFilter} setSupervisorFilter={setSupervisorFilter} distinctSupervisors={distinctSupervisors}
          typeFilter={typeFilter} setTypeFilter={setTypeFilter} distinctTypes={distinctTypes}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          approverFilter={approverFilter} setApproverFilter={setApproverFilter} distinctApprovers={distinctApprovers}
          dateFilter={dateFilter} setDateFilter={setDateFilter}
          clearAllFilters={clearAllFilters} anyFilterActive={anyFilterActive}
        />
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-md)", background: "var(--bg-card)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: "var(--bg-inner)", borderBottom: "1px solid var(--border)" }}>
                <th className="w-10 px-3 py-2.5 text-center">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 cursor-pointer" style={{ accentColor: "var(--brand)" }} />
                </th>
                {/* SANA */}
                <th className={`text-left ${thCls}`} style={{ color: "var(--text-3)" }}>
                  <div className="flex items-center gap-1">
                    <span style={{ color: "var(--text-3)" }}>{t("staff.fDate")}</span>
                    <SortBtn col="date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  </div>
                </th>
                {/* RAHBAR */}
                {isManager && (
                  <th className={`text-left ${thCls}`} style={{ color: "var(--text-3)" }}>
                    <div className="flex items-center gap-1">
                      <span style={{ color: "var(--text-3)" }}>{t("staff.colSupervisor")}</span>
                      <SortBtn col="supervisor" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    </div>
                  </th>
                )}
                {/* HUJJAT TURI */}
                <th className={`text-left ${thCls}`} style={{ color: "var(--text-3)" }}>
                  <div className="flex items-center gap-1">
                    <span style={{ color: "var(--text-3)" }}>{t("staff.colDocType")}</span>
                    <SortBtn col="type" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  </div>
                </th>
                {/* O'TKAZILGAN */}
                <th className={`text-center ${thCls}`} style={{ color: "var(--text-3)" }}>
                  <div className="flex items-center justify-center gap-1">
                    <span style={{ color: "var(--text-3)" }}>{t("staff.colPosted")}</span>
                    <SortBtn col="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  </div>
                </th>
                {/* TASDIQLAGAN */}
                <th className={`text-left ${thCls}`} style={{ color: "var(--text-3)" }}>
                  <div className="flex items-center gap-1">
                    <span style={{ color: "var(--text-3)" }}>{t("staff.colApprovedBy")}</span>
                    <SortBtn col="approver" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  </div>
                </th>
                {/* YARATILGAN */}
                <th className={`text-left ${thCls}`} style={{ color: "var(--text-3)" }}>
                  <div className="flex items-center gap-1">
                    <span style={{ color: "var(--text-3)" }}>{t("staff.colCreatedAt")}</span>
                    <SortBtn col="created" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(doc => {
                const isDeletion = doc._source === "deletion";
                const isExchange = doc.doc_type === "people_exchange";
                const isCreatorRole = role === "supervisor";
                const isCreator = myTelegramId != null && doc.created_by_telegram_id === myTelegramId;
                const isExchangeReceiver = isExchange && doc.target_type === "supervisor"
                  && role === "supervisor" && doc.target_manager_id === myManagerId;
                const hasPending = isDeletion && (doc.workers || []).some(w => w.status === "pending");
                // Who may post / un-post THIS document (one approval is enough):
                //  • exchange → supervisor: admin or the receiving supervisor
                //  • exchange → task:       admin or a shift-manager
                //  • role change / deletion: admin or shift-manager (isManager)
                const canApproveDoc = isExchange
                  ? (doc.target_type === "supervisor"
                      ? (role === "admin" || isExchangeReceiver)
                      : (role === "admin" || role === "shift-manager"))
                  : isManager;
                const st = docStatus(doc);   // pending | approved | rejected (both sources)
                const canApprove = isDeletion ? (isManager && hasPending) : (canApproveDoc && st === "pending");
                const canCancel  = isDeletion ? (isManager && hasPending) : (canApproveDoc && st === "approved");
                const canEdit    = isDeletion
                  ? (isCreatorRole && hasPending)
                  : isExchange
                    ? (st === "pending" && (canApproveDoc || isCreator))
                    : (st === "pending" && (isManager || isCreatorRole));
                // Pending documents are REJECTED (record kept, like the bot's ❌);
                // hard delete only remains for approved (revert) / rejected (cleanup).
                const canReject  = !isDeletion && st === "pending"
                  && (isExchange ? (canApproveDoc || isManager || isCreator) : (isManager || isCreatorRole));
                const canDelete  = isDeletion
                  ? ((isCreatorRole && hasPending) || (isManager && hasPending))
                  : st === "approved"
                    ? (isExchange ? canApproveDoc : isManager)
                    : st === "rejected" && (isManager || isCreator);
                const rKey    = rowKey(doc);
                const expanded   = expandedId === rKey;
                const colSpan = isManager ? 7 : 6;
                return (
                  <Fragment key={rKey}>
                    <tr
                      onClick={() => setExpandedId(expanded ? null : rKey)}
                      className="border-b cursor-pointer hover:bg-white/5"
                      style={{ borderColor: "var(--border)", background: expanded ? "var(--bg-inner)" : "transparent" }}>
                      <td className="px-3 py-3 text-center" {...dragRow(rKey)} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(rKey)} onChange={() => toggleSel(rKey)} className="w-4 h-4 cursor-pointer" style={{ accentColor: "var(--brand)" }} />
                      </td>
                      <td className="px-3 py-3 font-mono whitespace-nowrap" style={{ color: "var(--text-3)" }}>{fmtDateLabel(doc.date)}</td>
                      {isManager && <td className="px-3 py-3 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{tl(doc.supervisor_name) || "—"}</td>}
                      <td className="px-3 py-3" style={{ color: "var(--text-1)" }}>
                        <span className="font-medium">
                          {DOC_TYPE_TKEY[doc.doc_type] ? t(DOC_TYPE_TKEY[doc.doc_type]) : (doc.doc_type_label || doc.doc_type)}
                        </span>
                        {isDeletion
                          ? <span className="ml-1.5 text-[10px]" style={{ color: "var(--text-4)" }}>· {doc.employee_count} {t("daily.emp")}</span>
                          : isExchange
                          ? <span className="ml-1.5 text-[10px]" style={{ color: "var(--text-4)" }}>· {doc.employee_count} {t("daily.emp")} · → {doc.target_type === "supervisor" ? tl(doc.target_manager_name) : doc.task_name}</span>
                          : <span className="ml-1.5 text-[10px]" style={{ color: "var(--text-4)" }}>· {doc.employee_count} {t("daily.emp")} · {tl(doc.new_role)}</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <DeletionStatusBadge status={doc.approved ? "approved" : (doc.status === "rejected" ? "rejected" : "pending")} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap" style={{ color: "var(--text-3)" }}>{tl(doc.approved_by_name) || "—"}</td>
                      <td className="px-3 py-3 whitespace-nowrap" style={{ color: "var(--text-3)" }}>{fmtCreatedAt(doc.created_at, t, lang)}</td>
                    </tr>
                    {expanded && (
                      <tr style={{ background: "var(--bg-inner)" }}>
                        <td colSpan={colSpan} className="px-3 py-2">
                          <div className="flex flex-col gap-2 w-full">
                            {/* Compact worker list for deletion rows */}
                            {isDeletion && (
                              <div className="flex flex-wrap gap-1">
                                {(doc.workers || []).map(w => (
                                  <span key={w.id} className="text-[11px] px-2 py-0.5 rounded-full"
                                    style={{
                                      background: w.status === "approved" ? "#22c55e22" : w.status === "rejected" ? "#ef444422" : "var(--bg-card)",
                                      color:      w.status === "approved" ? "#16a34a"   : w.status === "rejected" ? "#ef4444"   : "var(--text-2)",
                                      border: "1px solid var(--border-md)",
                                    }}>
                                    {tl(w.worker_name)}
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Action buttons */}
                            <div className="flex flex-wrap items-center gap-2">
                              {!isDeletion && <ActionBtn icon={Eye} label={t("staff.view")} onClick={() => setViewId(doc.id)} />}
                              {canEdit && <ActionBtn icon={Pencil} label={t("staff.edit")} onClick={() => isDeletion
                                ? setEditingBatch({ managerId: doc.manager_id, managerName: doc.manager_name || doc.supervisor_name, date: doc.date, preSelected: (doc.workers || []).filter(w => w.status === "pending").map(w => w.worker_name), batchId: doc.batch_id })
                                : onEdit(doc)} />}
                              {canApprove && <ActionBtn icon={Check}  label={t("staff.post")}   color="#16a34a"
                                loading={busyKey === `${rowKey(doc)}:post`} disabled={!!busyKey}
                                onClick={() => runAction(`${rowKey(doc)}:post`, () => isDeletion ? batchMutation.mutateAsync({ batchId: (doc.batch_id || `solo-${doc.id}`), action: "approve" }) : single(doc.id, "approve"))} />}
                              {canCancel  && <ActionBtn icon={Ban}    label={t("staff.unpost")} color="#d97706"
                                loading={busyKey === `${rowKey(doc)}:unpost`} disabled={!!busyKey}
                                onClick={() => runAction(`${rowKey(doc)}:unpost`, () => isDeletion ? batchMutation.mutateAsync({ batchId: (doc.batch_id || `solo-${doc.id}`), action: "reject"  }) : single(doc.id, "cancel"))} />}
                              {canReject  && <ActionBtn icon={Trash2} label={t("staff.reject")} color="#ef4444"
                                loading={busyKey === `${rowKey(doc)}:reject`} disabled={!!busyKey}
                                onClick={() => runAction(`${rowKey(doc)}:reject`, () => single(doc.id, "reject"))} />}
                              {canDelete  && <ActionBtn icon={Trash2} label={t("staff.delete")} color="#ef4444"
                                loading={busyKey === `${rowKey(doc)}:delete`} disabled={!!busyKey}
                                onClick={() => runAction(`${rowKey(doc)}:delete`, () => isDeletion ? batchMutation.mutateAsync({ batchId: (doc.batch_id || `solo-${doc.id}`), action: isCreatorRole ? "withdraw" : "reject" }) : single(doc.id, "delete"))} />}
                              {!isDeletion && <ActionBtn icon={History} label={t("staff.history")} onClick={() => setHistoryId(doc.id)} />}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {viewId    && <DocumentViewModal    docId={viewId}    onClose={() => setViewId(null)} />}
      {historyId && <DocumentHistoryModal docId={historyId} onClose={() => setHistoryId(null)} />}
      {editingBatch && (
        <DeleteWorkersModal
          managerId={editingBatch.managerId}
          managerName={editingBatch.managerName}
          date={editingBatch.date}
          isAdmin={false}
          preSelected={editingBatch.preSelected}
          replaceBatchId={editingBatch.batchId}
          onClose={() => setEditingBatch(null)}
          onDeleted={() => { invalidate(); setEditingBatch(null); }}
        />
      )}
    </div>
  );
}

function SortBtn({ col, sortCol, sortDir, onSort }) {
  const active = sortCol === col;
  const Icon = !active ? ChevronsUpDown : sortDir === "asc" ? ChevronUp : ChevronDown;
  return (
    <button
      onClick={e => { e.stopPropagation(); onSort(col); }}
      className="p-0.5 rounded transition-colors"
      style={{
        color: active ? "var(--brand-text)" : "var(--text-4)",
        background: active ? "var(--brand-bg)" : "transparent",
        border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center",
      }}
    >
      <Icon size={10} />
    </button>
  );
}

export function ActionBtn({ icon: Icon, label, color, onClick, loading, disabled }) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: color || "var(--text-2)" }}>
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />} {label}
    </button>
  );
}

// ── Toolbar Filter Dropdown (popup button like the date selector) ─────────────

function FilterDropdown({ icon: Icon, label, active, display, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors"
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${open || active ? "var(--brand)" : "var(--border-md)"}`,
          color: active ? "var(--text-1)" : "var(--text-3)",
        }}
      >
        <Icon size={13} style={{ color: "var(--text-4)", flexShrink: 0 }} />
        <span className="text-sm whitespace-nowrap">{active && display ? display : label}</span>
        <ChevronDown
          size={13}
          style={{
            color: "var(--text-4)", flexShrink: 0, marginLeft: 2,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 z-50 rounded-xl overflow-hidden"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            minWidth: "max(100%, 230px)",
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {typeof children === "function" ? children({ close: () => setOpen(false) }) : children}
        </div>
      )}
    </div>
  );
}

// Multi-select option list for FilterDropdown — full-width rows like SupervisorSelect
function DropdownOpts({ opts, sel, onChange, render }) {
  const { t } = useLang();
  return (
    <>
      {sel.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2 border-b"
          style={{ color: "var(--text-4)", borderColor: "var(--border)" }}
        >
          <X size={11} /> {t("staff.clearAll")}
        </button>
      )}
      {opts.length === 0 && (
        <p className="text-sm text-center py-3 px-3" style={{ color: "var(--text-4)" }}>{t("staff.noOptionsShort")}</p>
      )}
      {opts.map(o => {
        const active = sel.includes(o);
        return (
          <button
            key={o}
            onClick={() => onChange(active ? sel.filter(v => v !== o) : [...sel, o])}
            className="w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-3 transition-colors"
            style={{
              background: active ? "var(--brand-bg)" : "transparent",
              color: active ? "var(--brand-text)" : "var(--text-2)",
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--bg-inner)"; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
          >
            <span className="truncate">{render ? render(o) : (o || "—")}</span>
            {active && <Check size={13} style={{ flexShrink: 0 }} />}
          </button>
        );
      })}
    </>
  );
}

// Single-select status list for FilterDropdown — same row style
function DropdownStatus({ value, onChange }) {
  const { t } = useLang();
  const opts = [["all", t("staff.all")], ["pending", t("staff.pending")], ["yes", t("staff.yes")], ["no", t("staff.rejected")]];
  return (
    <>
      {opts.map(([v, lbl]) => {
        const active = value === v;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className="w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-3 transition-colors"
            style={{
              background: active ? "var(--brand-bg)" : "transparent",
              color: active ? "var(--brand-text)" : "var(--text-2)",
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--bg-inner)"; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
          >
            <span className="truncate">{lbl}</span>
            {active && <Check size={13} style={{ flexShrink: 0 }} />}
          </button>
        );
      })}
    </>
  );
}

// ── Custom Supervisor Select ──────────────────────────────────────────────────

export function SupervisorSelect({ value, onChange, supervisors }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const selected = supervisors.find(s => s.manager_id === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors"
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${open ? "var(--brand)" : "var(--border-md)"}`,
          color: selected ? "var(--text-1)" : "var(--text-3)",
          minWidth: 210,
        }}
      >
        <Users size={13} style={{ color: "var(--text-4)", flexShrink: 0 }} />
        <span className="flex-1 text-left truncate text-sm">
          {selected ? `${tl(selected.full_name)} (S${selected.shift})` : t("staff.selectSupervisor")}
        </span>
        <ChevronDown
          size={13}
          style={{
            color: "var(--text-4)", flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 z-50 rounded-xl overflow-hidden"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            minWidth: "100%",
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            className="w-full text-left px-3 py-2.5 text-xs flex items-center gap-2 border-b"
            style={{ color: "var(--text-4)", borderColor: "var(--border)" }}
          >
            <X size={11} /> {t("staff.clearSelection")}
          </button>
          {supervisors.map(s => {
            const active = s.manager_id === value;
            return (
              <button
                key={s.manager_id}
                onClick={() => { onChange(s.manager_id); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-3 transition-colors"
                style={{
                  background: active ? "var(--brand-bg)" : "transparent",
                  color: active ? "var(--brand-text)" : "var(--text-2)",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--bg-inner)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <span className="truncate">{tl(s.full_name)}</span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                  style={{
                    background: active ? "rgba(255,255,255,0.2)" : "var(--bg-inner)",
                    color: active ? "var(--brand-text)" : "var(--text-4)",
                  }}
                >
                  S{s.shift}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Custom Date Picker ────────────────────────────────────────────────────────
// Month names + weekday labels are localized via the i18n keys cal.m0..cal.m11
// and cal.d0..cal.d6 (Monday-first); see frontend/src/i18n/translations.js.

const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];   // Mon..Sun → cal.d0..cal.d6

function DatePicker({ value, onChange, availableDates, placeholder }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  // When restricted to available dates, default the view to the latest one
  const latestAvailable = availableDates && availableDates.size
    ? [...availableDates].sort().pop()
    : null;
  const [view, setView]   = useState(() => {
    const base = value || latestAvailable;
    const d = base ? new Date(base + "T00:00:00") : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const ref = useRef(null);

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    if (value) {
      const d = new Date(value + "T00:00:00");
      setView({ year: d.getFullYear(), month: d.getMonth() });
    }
  }, [value]);

  const selected = value ? new Date(value + "T00:00:00") : null;
  const todayRaw  = new Date(); todayRaw.setHours(0,0,0,0);

  const { year, month } = view;

  function prevMonth() { setView(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }); }
  function nextMonth() { setView(month === 11 ? { year: year + 1, month: 0  } : { year, month: month + 1 }); }

  function sameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function toISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  // Build 6-row grid (Mon-start)
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const daysInPrev   = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--)
    cells.push({ day: daysInPrev - i, cur: false, date: new Date(year, month - 1, daysInPrev - i) });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, cur: true, date: new Date(year, month, d) });
  for (let d = 1; cells.length < 42; d++)
    cells.push({ day: d, cur: false, date: new Date(year, month + 1, d) });

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          if (!open) {
            const base = value || latestAvailable;
            if (base) {
              const d = new Date(base + "T00:00:00");
              setView({ year: d.getFullYear(), month: d.getMonth() });
            }
          }
          setOpen(o => !o);
        }}
        className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors"
        style={{
          background: "var(--bg-card)",
          border: `1px solid ${open ? "var(--brand)" : "var(--border-md)"}`,
          color: value ? "var(--text-1)" : "var(--text-3)",
        }}
      >
        <Calendar size={13} style={{ color: "var(--text-4)", flexShrink: 0 }} />
        <span className="font-mono text-sm tracking-wide">
          {value ? fmtDateLabel(value) : (placeholder || t("staff.selectDate"))}
        </span>
        <ChevronDown
          size={13}
          style={{
            color: "var(--text-4)", flexShrink: 0, marginLeft: 2,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 z-50 rounded-xl p-3"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            width: 272,
          }}
        >
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--text-3)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-inner)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
              {t(`cal.m${month}`)} {year}
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--text-3)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-inner)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAY_INDEXES.map((i) => (
              <div key={i} className="text-center text-[10px] font-medium py-1" style={{ color: "var(--text-4)" }}>
                {t(`cal.d${i}`)}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((cell, i) => {
              const isSel      = sameDay(cell.date, selected);
              const isToday    = sameDay(cell.date, todayRaw);
              const selectable = !availableDates || availableDates.has(toISO(cell.date));
              return (
                <button
                  key={i}
                  disabled={!selectable}
                  onClick={() => { onChange(toISO(cell.date)); setOpen(false); }}
                  className="aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-colors"
                  style={{
                    background: isSel ? "var(--brand)" : "transparent",
                    color: isSel ? "#fff"
                      : isToday ? "var(--brand-text)"
                      : cell.cur ? "var(--text-2)"
                      : "var(--text-4)",
                    outline: isToday && !isSel ? "1.5px solid var(--brand)" : "none",
                    outlineOffset: -2,
                    opacity: !selectable ? 0.22 : cell.cur ? 1 : 0.45,
                    cursor: selectable ? "pointer" : "default",
                  }}
                  onMouseEnter={e => { if (!isSel && selectable) e.currentTarget.style.background = "var(--bg-inner)"; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Clear */}
          {value && (
            <button
              onClick={() => { onChange(""); setOpen(false); }}
              className="mt-2.5 w-full py-1.5 rounded-lg text-xs transition-colors"
              style={{ color: "var(--text-4)", border: "1px solid var(--border)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-inner)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              Clear date
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Approvals Calendar (Staff tab) ────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, "0"); }
function monthIso(year, month, day) { return `${year}-${pad2(month + 1)}-${pad2(day)}`; }

function buildMonthCells(year, month) {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const dim = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function ApprovalsCalendar({ role, supervisors }) {
  const qc = useQueryClient();
  const { auth } = useAuth();
  const { t } = useLang();
  const isAdmin = role === "admin";

  const [selManagerId, setSelManagerId] = useState(null);
  const effManagerId = isAdmin ? selManagerId : auth?.role_id;

  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const todayIso = monthIso(now.getFullYear(), now.getMonth(), now.getDate());

  const { data, isLoading } = useQuery({
    queryKey: ["staff-approvals-calendar", effManagerId, view.year, view.month],
    queryFn: () => api.get("/api/staff/approvals/calendar", {
      params: { manager_id: effManagerId, year: view.year, month: view.month + 1 },
    }).then(r => r.data),
    enabled: !!effManagerId,
  });
  const days = data?.days || {};

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["staff-approvals-calendar"] });
    qc.invalidateQueries({ queryKey: ["approved-cells"] });
    qc.invalidateQueries({ queryKey: ["daily-approval"] });
  };
  const closeMut = useMutation({
    mutationFn: (date) => api.post("/api/staff/daily/close", { manager_id: effManagerId, date }),
    onSuccess: invalidate,
  });
  const reopenMut = useMutation({
    mutationFn: (date) => api.post("/api/staff/approvals/reopen", { manager_id: effManagerId, date }),
    onSuccess: invalidate,
  });

  const cells = buildMonthCells(view.year, view.month);
  const prevMonth = () => setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 });
  const nextMonth = () => setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 });

  function onDayClick(iso, status) {
    if (!effManagerId || iso > todayIso) return;
    if (status === "open" && (role === "supervisor" || isAdmin)) {
      // Closing is final for the supervisor — confirm first
      if (window.confirm(t("staff.apprCloseConfirm"))) {
        closeMut.mutate(iso);
      }
    } else if ((status === "closed" || status === "confirmed") && isAdmin) {
      if (window.confirm(t("staff.apprReopenConfirm"))) {
        reopenMut.mutate(iso);
      }
    }
  }

  // "closed" and "confirmed" look identical (green) — admin tells them apart by
  // the unprocessed requests still sitting in the Requests tab.
  const GREEN = { background: "#22c55e22", color: "#16a34a", border: "1px solid #22c55e55" };
  const STATUS_STYLE = {
    confirmed: GREEN,
    closed:    GREEN,
    open:      { background: "#f59e0b22", color: "#d97706", border: "1px solid #f59e0b55" },
    empty:     { background: "var(--bg-inner)", color: "var(--text-4)", border: "1px solid var(--border)" },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {isAdmin && (
          <SupervisorSelect value={selManagerId} onChange={setSelManagerId} supervisors={supervisors} />
        )}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={prevMonth} className="p-1.5 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-3)" }}>
            <ChevronLeft size={15} />
          </button>
          <div className="text-sm font-semibold px-2 min-w-[140px] text-center" style={{ color: "var(--text-1)" }}>
            {t(`cal.m${view.month}`)} {view.year}
          </div>
          <button onClick={nextMonth} className="p-1.5 rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-3)" }}>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px]" style={{ color: "var(--text-3)" }}>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: "#22c55e" }} /> {t("staff.apprConfirmed")}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: "#f59e0b" }} /> {t("staff.apprOpen")}</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: "var(--text-4)" }} /> {t("staff.apprNoData")}</span>
      </div>

      {!effManagerId ? (
        <div className="py-16 text-center text-sm" style={{ color: "var(--text-4)" }}>
          {t("staff.apprSelectSup")}
        </div>
      ) : (
        <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)" }}>
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {WEEKDAY_INDEXES.map((i) => (
              <div key={i} className="text-center text-[10px] font-semibold uppercase" style={{ color: "var(--text-4)" }}>{t(`cal.d${i}`)}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((d, i) => {
              if (d === null) return <div key={`e-${i}`} />;
              const iso = monthIso(view.year, view.month, d);
              const info = days[iso];
              const status = info?.status || "empty";
              const future = iso > todayIso;
              const clickable = !future && (
                (status === "open" && (role === "supervisor" || isAdmin)) ||
                ((status === "closed" || status === "confirmed") && isAdmin)
              );
              const title = (status === "confirmed" || status === "closed")
                ? `${t("staff.apprClosedByPrefix")}${info?.closed_by ? ` ${info.closed_by}` : ""}${isAdmin ? ` · ${t("staff.apprClickReopen")}` : ""}`
                : status === "open"   ? (clickable ? `${t("staff.apprOpen")} · ${t("staff.apprClickClose")}` : t("staff.apprOpen"))
                : t("staff.apprNoData");
              return (
                <button
                  key={iso}
                  disabled={!clickable}
                  onClick={() => onDayClick(iso, status)}
                  title={title}
                  className="aspect-square rounded-lg flex flex-col items-center justify-center text-sm font-medium transition-transform"
                  style={{
                    ...STATUS_STYLE[status],
                    opacity: future ? 0.4 : 1,
                    cursor: clickable ? "pointer" : "default",
                  }}
                  onMouseEnter={e => { if (clickable) e.currentTarget.style.transform = "scale(1.05)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "none"; }}
                >
                  <span>{d}</span>
                  {(status === "confirmed" || status === "closed") && <Check size={11} />}
                  {status === "open" && <span style={{ fontSize: 8 }}>●</span>}
                </button>
              );
            })}
          </div>
          {(isLoading || closeMut.isPending || reopenMut.isPending) && (
            <div className="flex justify-center mt-3"><Loader2 size={16} className="animate-spin" style={{ color: "var(--text-4)" }} /></div>
          )}
        </div>
      )}
      <div className="pb-16" />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Staff() {
  const { auth } = useAuth();
  const { t } = useLang();
  const qc = useQueryClient();
  const role = auth?.role;

  const [tab, setTab] = useState(role === "shift-manager" ? "requests" : "workers");
  // Persisted so the date + supervisor stay selected after navigating away and
  // back (separate keys from the Daily page — each page remembers its own).
  const [selectedDate, setSelectedDate] = usePersistentState("staff_selected_date", "");
  const [selectedManagerId, setSelectedManagerId] = usePersistentState("staff_selected_manager_id", null);
  const [docCreate, setDocCreate] = useState(null);   // {mode:"create"} | {mode:"edit", doc}

  // ── Delete modal state ────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteToast, setDeleteToast] = useState(null); // null | "success" | "request"

  // Admins and shift-managers pick a supervisor to view. The backend scopes the
  // list to the shift-manager's own shift (admins see everyone).
  const isManagerView = role === "admin" || role === "shift-manager";

  const { data: supervisors = [] } = useQuery({
    queryKey: ["staff-supervisors"],
    queryFn: () => api.get("/api/staff/supervisors").then(r => r.data),
    enabled: isManagerView,
    staleTime: 120_000,
  });

  const { data: documents = [], isLoading: documentsLoading } = useQuery({
    queryKey: ["staff-documents"],
    queryFn: () => api.get("/api/staff/documents").then(r => r.data),
    refetchInterval: 30_000,
  });

  // Rejected items also have approved=false — they are processed, so they
  // must not trigger the badge (mirrors the "pending" status filter)
  const pendingCount        = documents.filter(d =>
    d._source === "deletion" ? d.status === "pending" : d.status === "draft").length;
  const supervisorManagerId = role === "supervisor" ? auth?.role_id : selectedManagerId;
  const showWorkersTab      = true;
  const showApprovalsTab    = role === "admin" || role === "supervisor";
  const canCreate           = role === "admin" || role === "supervisor";

  // No new documents once the day is closed — supervisors check their own day,
  // admins the selected supervisor's (backend ignores manager_id for supervisors)
  const { data: dayInfo } = useQuery({
    queryKey: ["daily-approval", supervisorManagerId, selectedDate],
    queryFn: () => api.get("/api/staff/approvals/day", {
      params: { attend_date: selectedDate, manager_id: supervisorManagerId },
    }).then(r => r.data),
    enabled: canCreate && !!supervisorManagerId && !!selectedDate,
  });
  const dayClosed = !!dayInfo && dayInfo.state !== "open";

  // Role Change needs a date (and, for admin, a supervisor) before it can start
  const createDisabled = !selectedDate || (role === "admin" && !selectedManagerId) || dayClosed;
  const createHint     = dayClosed
    ? t("staff.dayClosedHint")
    : role === "admin"
      ? t("staff.createHintAdmin")
      : t("staff.createHint");

  function startCreate(docType = "role_change") {
    setDocCreate({ mode: "create", docType });
  }
  function startEdit(doc) {
    setDocCreate({ mode: "edit", doc });
  }
  function closeCreate() {
    setDocCreate(null);
  }
  function onSavedDoc() {
    setDocCreate(null);
    setTab("requests");
  }

  function handleDeleted(toastKey) {
    setTab("requests");
    setDeleteToast(toastKey);
    setTimeout(() => setDeleteToast(null), 4000);
  }

  return (
    <Layout title={t("nav.staff")}>
      {/* Tabs — the shared view-tab template (scroll wrapper for phones) */}
      <div className="mb-6 max-w-full overflow-x-auto">
        <SegmentedToggle
          value={tab}
          onChange={setTab}
          options={[
            ...(showWorkersTab ? [{ value: "workers", label: t("staff.tabWorkers") }] : []),
            {
              value: "requests",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  {t("staff.tabRequests")}
                  {pendingCount > 0 && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{
                        background: tab === "requests" ? "rgba(255,255,255,0.3)" : "#ef4444",
                        color: "#fff", minWidth: 18, textAlign: "center",
                      }}
                    >
                      {pendingCount}
                    </span>
                  )}
                </span>
              ),
            },
            ...(showApprovalsTab ? [{
              value: "approvals",
              label: <span className="inline-flex items-center gap-1.5"><Calendar size={14} /> {t("staff.tabApprovals")}</span>,
            }] : []),
          ]}
        />
      </div>

      {/* Delete toast */}
      {deleteToast && (
        <div
          className="toast-in flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm shadow-lg"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 9999,
            background: deleteToast === "success" ? "#ef4444" : "#C8973F",
            color: "#fff", maxWidth: 320,
            boxShadow: `0 8px 24px ${deleteToast === "success" ? "rgba(239,68,68,.35)" : "rgba(200,151,63,.35)"}`,
          }}
        >
          <Trash2 size={15} style={{ flexShrink: 0 }} />
          <span>{deleteToast === "success" ? t("staff.deleteSuccess") : t("staff.deleteRequestSent")}</span>
        </div>
      )}

      {/* Workers tab */}
      {tab === "workers" && showWorkersTab && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {isManagerView && (
              <SupervisorSelect
                value={selectedManagerId}
                onChange={setSelectedManagerId}
                supervisors={supervisors}
              />
            )}
            <DatePicker value={selectedDate} onChange={setSelectedDate} />
            {canCreate && (
              <CreateMenu
                onSelect={(type) => startCreate(type)}
                disabled={createDisabled}
                disabledHint={createHint}
                onDeleteSelected={() => setShowDeleteModal(true)}
                role={role}
              />
            )}
            {dayClosed && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: "#22c55e22", color: "#16a34a", border: "1px solid #22c55e55" }}>
                <Lock size={12} /> {t("staff.dayClosedBadge")}
              </span>
            )}
          </div>

          <div
            className="rounded-xl"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", overflow: "visible" }}
          >
            <AttendanceTable
              managerId={supervisorManagerId}
              selectedDate={selectedDate}
              pickSupervisor={isManagerView}
            />
          </div>

          <div className="pb-16" />
        </div>
      )}

      {/* Requests tab */}
      {tab === "requests" && (
        <DocumentsPanel
          role={role}
          myManagerId={auth?.role_id}
          myTelegramId={auth?.telegram_id}
          documents={documents}
          isLoading={documentsLoading}
          onEdit={startEdit}
        />
      )}

      {/* Approvals tab */}
      {tab === "approvals" && showApprovalsTab && (
        <ApprovalsCalendar role={role} supervisors={supervisors} />
      )}

      {/* Document create / edit overlay (Role Change or People Exchange) */}
      {docCreate && (() => {
        const editing = docCreate.mode === "edit" ? docCreate.doc : null;
        const docType = editing ? editing.doc_type : docCreate.docType;
        const Cmp = docType === "people_exchange" ? PeopleExchangeCreate : RoleChangeCreate;
        return (
          <Cmp
            role={role}
            managerId={supervisorManagerId}
            selectedDate={selectedDate}
            editDoc={editing}
            onClose={closeCreate}
            onSaved={onSavedDoc}
          />
        );
      })()}

      {/* Delete workers modal */}
      {showDeleteModal && (
        <DeleteWorkersModal
          managerId={supervisorManagerId}
          managerName={
            role === "supervisor"
              ? (auth?.name || "")
              : (supervisors.find(s => s.manager_id === selectedManagerId)?.name || "")
          }
          date={selectedDate}
          isAdmin={role === "admin"}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={handleDeleted}
        />
      )}
    </Layout>
  );
}
