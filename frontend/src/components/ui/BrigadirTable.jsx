import { useState } from "react";
import { useMemo } from "react";
import { AlertTriangle, Eye, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import FormulaModal from "./FormulaModal";
import StatusBadge from "./StatusBadge";
import AttendanceModal from "./AttendanceModal";
import EmptyState from "./EmptyState";
import Tooltip from "./Tooltip";
import { FilterPanel } from "./ColumnFilter";
import { brigadirFilterSections, brigadirActiveCount } from "./brigadirFilters";
import { SkeletonTable } from "./Skeleton";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { fmtPct, fmtTime } from "../../utils/formatters";
import {
  utilNumbers, utilInputs, differenceNumbers, differenceInputs,
  differencePctNumbers, hcEquivNumbers, hcEquivInputs, rangeDays,
} from "../../utils/formulas";

// Reusable supervisor table — extracted from the Overview page so the same
// rich table (per-column sort + filters, formula popups, attendance modal,
// Difference-unit switch) can back both Overview and the shift-manager Daily
// dashboard. The only behavioural hook is `onRowClick(b)`.

const INIT_FILTERS = {
  name: "", shifts: [], statuses: [],
  planned_min: "", planned_max: "",
  final_min: "", final_max: "",
  diff_min: "", diff_max: "",
  hc_min: "", hc_max: "",
  idle_min: "", idle_max: "",
};

function isFilterActive(f) {
  return !!(f.name || f.shifts.length || f.statuses.length ||
    f.planned_min || f.planned_max || f.final_min || f.final_max ||
    f.diff_min || f.diff_max || f.hc_min || f.hc_max || f.idle_min || f.idle_max);
}

const DIFF_UNITS = [["min", "min"], ["hrs", "hrs"], ["pct", "%"], ["hc", "HC"]];

function diffValue(b, u) {
  if (u === "hc") {
    // HC = the hours gap expressed as full person-shifts (8 working hours = 1 HC).
    if (b.diff_hrs == null) return null;
    return b.diff_hrs / 8;
  }
  if (u === "pct") {
    if (b.verifix_labor == null || b.prod_actual == null || !b.verifix_labor) return null;
    return (b.verifix_labor - b.prod_actual) / b.verifix_labor * 100;
  }
  if (b.diff_hrs == null) return null;
  return u === "hrs" ? b.diff_hrs : b.diff_hrs * 60;
}

// hcLabel is the localized name for the headcount unit (e.g. "Odam soni" in uz).
function fmtDiff(b, u, hcLabel = "HC") {
  const v = diffValue(b, u);
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  if (u === "hc")  return `${sign}${v.toFixed(1)} ${hcLabel}`;
  if (u === "pct") return `${sign}${v.toFixed(1)}%`;
  if (u === "hrs") return `${sign}${v.toFixed(1)} hrs`;
  return `${sign}${v.toFixed(0)} min`;
}

const SORT_ACCESSORS = {
  name:          b => (b.name || "").toLowerCase(),
  shift:         b => b.shift ?? -Infinity,
  baseline_util: b => b.baseline_util ?? -Infinity,
  net_util:      b => b.net_util ?? -Infinity,
  diff_hrs:      b => b.diff_hrs ?? -Infinity,
  official_hc:   b => b.official_hc ?? -Infinity,
  equip_downtime:b => b.equip_downtime ?? -Infinity,
  status:        b => b.status || "",
};

function HeadCell({ label, tip, sortKey, sort, onSort, align = "right", className = "" }) {
  const isActive = sort.key === sortKey;
  const Icon = !isActive ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className={`py-2.5 ${className}`}>
      <span className={`inline-flex items-center gap-1 ${justify}`}>
        <button
          onClick={() => onSort(sortKey)}
          className="inline-flex items-center gap-0.5 select-none transition-colors hover:text-[var(--text-1)]"
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit" }}
        >
          {label}
          {tip && <Tooltip text={tip} />}
          <Icon size={9} style={{ opacity: isActive ? 1 : 0.4 }} />
        </button>
      </span>
    </th>
  );
}

export default function BrigadirTable({
  brigadirs = [],
  unit = "min",
  isLoading = false,
  onRowClick,
  dateFrom,
  dateTo,
}) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const hcLabel = t("overview.diffUnitHc"); // localized name for the HC (headcount) diff unit
  const [filters, setFilters] = useState(INIT_FILTERS);
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  const [modal, setModal] = useState(null);
  const [formulaModal, setFormulaModal] = useState(null);
  const [diffUnit, setDiffUnitState] = useState(() => localStorage.getItem("zf_diff_unit") || "min");
  const setDiffUnit = (u) => {
    setDiffUnitState(u);
    if (u && u !== "min") localStorage.setItem("zf_diff_unit", u);
    else localStorage.removeItem("zf_diff_unit");
  };

  const setF = (key, val) => setFilters(f => ({ ...f, [key]: val }));
  const activeFilter = isFilterActive(filters);
  const onSort = (key) => setSort(s =>
    s.key !== key ? { key, dir: "asc" }
      : s.dir === "asc" ? { key, dir: "desc" }
      : { key: null, dir: "asc" });

  const distinctStatuses = useMemo(
    () => [...new Set(brigadirs.map(b => b.status).filter(Boolean))],
    [brigadirs]);

  const inRange = (val, min, max) => {
    if (min !== "" && (val == null || val < +min)) return false;
    if (max !== "" && (val == null || val > +max)) return false;
    return true;
  };

  const filtered = brigadirs.filter((b) => {
    const f = filters;
    if (f.name) {
      const q = f.name.toLowerCase();
      const match = (b.name || "").toLowerCase().includes(q)
                 || (tl(b.name) || "").toLowerCase().includes(q);
      if (!match) return false;
    }
    if (f.shifts.length && !f.shifts.includes(b.shift)) return false;
    if (f.statuses.length && !f.statuses.includes(b.status)) return false;
    if (!inRange(b.baseline_util != null ? b.baseline_util * 100 : null, f.planned_min, f.planned_max)) return false;
    if (!inRange(b.net_util != null ? b.net_util * 100 : null, f.final_min, f.final_max)) return false;
    if (!inRange(diffValue(b, diffUnit), f.diff_min, f.diff_max)) return false;
    if (!inRange(b.official_hc, f.hc_min, f.hc_max)) return false;
    if (!inRange(b.equip_downtime != null ? (unit === "hrs" ? b.equip_downtime / 60 : b.equip_downtime) : null, f.idle_min, f.idle_max)) return false;
    return true;
  });

  const displayedBrigadirs = sort.key
    ? [...filtered].sort((a, b) => {
        const acc = sort.key === "diff_hrs"
          ? (x) => diffValue(x, diffUnit) ?? -Infinity
          : SORT_ACCESSORS[sort.key];
        const av = acc(a), bv = acc(b);
        const r = typeof av === "string" ? av.localeCompare(bv) : av - bv;
        return sort.dir === "asc" ? r : -r;
      })
    : filtered;

  // Rows are averages only when more than one day is shown; the dashboard uses
  // a single day, so formulas are exact (≈ suffix/notes drop out).
  const nDays     = rangeDays(dateFrom, dateTo);
  const approx    = nDays > 1;
  const avgSuffix = approx ? ` — ${t("formula.avgOverDays").replace("{n}", nDays)}` : "";
  const avgNote   = approx ? `\n\n${t("formula.periodAvg")}` : "";

  function diffModal(b) {
    const title = `${t("overview.fm.diffTitle")}${avgSuffix}`;
    const value = fmtDiff(b, diffUnit, hcLabel);
    if (diffUnit === "hc") {
      return {
        title, value,
        formula: `${hcEquivNumbers(b, approx) || "HC = Difference (hrs) ÷ 8"}\n${t("fm.hcEquivNote")}${avgNote}`,
        inputs: hcEquivInputs(b, t),
      };
    }
    if (diffUnit === "pct") {
      return {
        title, value,
        formula: `${differencePctNumbers(b, approx) || "Diff % = (Verifix Time − Trudoyomkost) ÷ Verifix Time × 100"}\n${t("fm.diffPctNote")}${avgNote}`,
        inputs: differenceInputs(b, t),
      };
    }
    return {
      title, value,
      formula: `${differenceNumbers(b, approx) || "Diff = Verifix Time − Trudoyomkost"}\n${t("fm.diffNote")}${avgNote}`,
      inputs: differenceInputs(b, t),
    };
  }

  const diffUnitToggle = (
    <div className="hidden md:flex items-center gap-2 flex-shrink-0">
      <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>{t("overview.diff")}:</span>
      <div className="flex rounded-lg overflow-hidden text-[10px]" style={{ border: "1px solid var(--border-md)" }}>
        {DIFF_UNITS.map(([m, label]) => (
          <button
            key={m}
            onClick={() => setDiffUnit(m)}
            className="px-2 py-1 font-medium"
            style={diffUnit === m
              ? { background: "var(--brand)", color: "#fff" }
              : { background: "var(--bg-inner)", color: "var(--text-3)" }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex-1 min-w-0 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        {diffUnitToggle}
        <div className="flex-1" />
        <FilterPanel
          sections={brigadirFilterSections({ filters, setF, distinctStatuses, t, includeShift: false })}
          activeCount={brigadirActiveCount(filters)}
          anyActive={activeFilter}
          onClearAll={() => setFilters(INIT_FILTERS)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[var(--text-3)] border-b border-[var(--border)] bg-[var(--bg-inner)]">
              <th className="text-left px-4 py-2.5">#</th>
              <HeadCell label={t("overview.brigadir")} sortKey="name" sort={sort} onSort={onSort}
                align="left" className="text-left px-2" />
              <HeadCell label={t("overview.planned")} tip={t("overview.tip.planned")} sortKey="baseline_util" sort={sort} onSort={onSort}
                align="right" className="text-right px-2 hidden md:table-cell" />
              <HeadCell label={t("overview.finalWorkload")} tip={t("overview.tip.finalWorkload")} sortKey="net_util" sort={sort} onSort={onSort}
                align="right" className="text-right px-2" />
              <HeadCell label={t("overview.diff")} tip={t("overview.tip.diff")} sortKey="diff_hrs" sort={sort} onSort={onSort}
                align="right" className="text-right px-2 hidden md:table-cell" />
              <HeadCell label={t("overview.headcount")} tip={t("overview.tip.headcount")} sortKey="official_hc" sort={sort} onSort={onSort}
                align="right" className="text-right px-2 hidden md:table-cell" />
              <HeadCell label={t("overview.idleTime")} sortKey="equip_downtime" sort={sort} onSort={onSort}
                align="right" className="text-right px-2 hidden md:table-cell" />
              <HeadCell label={t("overview.status")} sortKey="status" sort={sort} onSort={onSort}
                align="center" className="text-center px-2 hidden sm:table-cell" />
              <th className="text-center px-4 py-2.5">{t("overview.workers")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9}><SkeletonTable rows={6} cols={7} /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9}><EmptyState title={t("empty.noBrigadirData")} message={t("empty.noAttendance")} /></td></tr>
            ) : displayedBrigadirs.map((b, i) => (
              <tr
                key={b.manager_id}
                className="border-b border-[var(--border)] hover:bg-white/5 cursor-pointer"
                onClick={() => onRowClick?.(b)}
              >
                <td className="px-4 py-2.5 text-[var(--text-3)]">{i + 1}</td>
                <td className="px-2 py-2.5 font-medium text-[var(--text-1)]">{tl(b.name)}</td>
                <td className="px-2 py-2.5 text-right hidden md:table-cell" onClick={e => e.stopPropagation()}>
                  <button
                    className="text-[var(--text-2)] font-mono hover:underline underline-offset-2"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    onClick={() => setFormulaModal({
                      title: `${t("overview.fm.plannedUtil")}${avgSuffix}`,
                      value: fmtPct(b.baseline_util),
                      formula: `${utilNumbers("baseline_util", b, approx) || "baseline_util = prod_plan ÷ (480 × official_hc)"}\n${t("fm.planOnlyNote")}${avgNote}`,
                      inputs: utilInputs("baseline_util", b, t),
                    })}
                  >
                    {fmtPct(b.baseline_util)}
                  </button>
                </td>
                <td className="px-2 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                  <button
                    className={`font-mono font-bold hover:underline underline-offset-2 ${b.net_util >= 1.05 ? "text-amber-400" : b.net_util >= 0.95 ? "text-green-400" : b.net_util >= 0.90 ? "text-yellow-300" : b.net_util >= 0.85 ? "text-orange-400" : "text-red-400"}`}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    onClick={() => setFormulaModal({
                      title: `${t("overview.fm.finalActual")}${avgSuffix}`,
                      value: fmtPct(b.net_util),
                      formula: `${utilNumbers("net_util", b, approx) || "net_util = prod_actual ÷ (effective_hc × adjusted_available_min)"}\n${t("fm.netAdjustments")}${avgNote}`,
                      inputs: utilInputs("net_util", b, t),
                    })}
                  >
                    {fmtPct(b.net_util)}
                  </button>
                </td>
                <td className="px-2 py-2.5 text-right font-mono hidden md:table-cell" onClick={e => e.stopPropagation()}>
                  <button
                    className={`hover:underline underline-offset-2 ${diffValue(b, diffUnit) > 0 ? "text-orange-400" : "text-green-400"}`}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    onClick={() => setFormulaModal(diffModal(b))}
                  >
                    {fmtDiff(b, diffUnit)}
                  </button>
                </td>
                <td className="px-2 py-2.5 text-right hidden md:table-cell" onClick={e => e.stopPropagation()}>
                  <span className="flex items-center justify-end gap-1">
                    {b.hc_mismatch && <AlertTriangle size={11} className="text-orange-400" />}
                    <button
                      className={`hover:underline underline-offset-2 font-mono ${b.hc_mismatch ? "text-orange-400" : "text-[var(--text-2)]"}`}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                      onClick={() => setFormulaModal({
                        title: t("overview.fm.headcountTitle"),
                        value: String(b.official_hc ?? "—"),
                        formula: t("fm.headcountFormula"),
                        inputs: [
                          { label: t("overview.fm.reportedHC"), val: String(b.official_hc ?? "—"), source: t("overview.fm.srcVerifix") },
                          ...(b.hc_mismatch ? [{ label: t("overview.fm.hcMismatch"), val: t("fm.diffOver2") }] : []),
                        ],
                      })}
                    >
                      {b.official_hc}
                    </button>
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right font-mono hidden md:table-cell" onClick={e => e.stopPropagation()}>
                  <button
                    className={`hover:underline underline-offset-2 ${b.equip_downtime > 50 ? "text-red-400" : "text-[var(--text-4)]"}`}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    onClick={() => b.equip_downtime > 0 && setFormulaModal({
                      title: t("overview.fm.idleTitle"),
                      value: b.equip_downtime > 0 ? fmtTime(b.equip_downtime, unit) : "—",
                      formula: t("fm.idleTotalFormula"),
                      inputs: [
                        { label: t("overview.fm.downtime"), val: b.equip_downtime > 0 ? fmtTime(b.equip_downtime, unit) : "—", source: t("overview.fm.srcEquip") },
                      ],
                    })}
                  >
                    {b.equip_downtime > 0 ? fmtTime(b.equip_downtime, unit) : "—"}
                  </button>
                </td>
                <td className="px-2 py-2.5 text-center hidden sm:table-cell">
                  <StatusBadge status={b.status} short />
                </td>
                <td
                  className="px-4 py-2.5 text-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModal({ managerId: b.manager_id, dateFrom, dateTo, name: b.name });
                  }}
                >
                  <button
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: "var(--text-3)" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-hover)"; e.currentTarget.style.color = "var(--brand-text)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-3)"; }}
                  >
                    <Eye size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <AttendanceModal
          managerId={modal.managerId}
          dateFrom={modal.dateFrom}
          dateTo={modal.dateTo}
          managerName={modal.name}
          onClose={() => setModal(null)}
        />
      )}

      {formulaModal && (
        <FormulaModal
          title={formulaModal.title}
          value={formulaModal.value}
          formula={formulaModal.formula}
          inputs={formulaModal.inputs}
          onClose={() => setFormulaModal(null)}
        />
      )}
    </div>
  );
}
