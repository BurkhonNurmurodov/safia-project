// Filter wiring for the brigadir/supervisor table, shared by the Overview page
// and the shift-manager Daily dashboard so both tables expose an identical set
// of filters (and active-count) through the consolidated <FilterPanel>.
//
// Kept separate from ColumnFilter.jsx (which exports the UI components) so that
// file stays component-only for React Fast Refresh.
import { Search, Layers, Target, Gauge, ArrowLeftRight, Users, Hourglass, Activity } from "lucide-react";
import { TxtFilter, OptsFilter, RngFilter } from "./ColumnFilter";
import StatusBadge from "./StatusBadge";

// Compact summary of a min/max range for the collapsed filter row.
function rngDisp(min, max) {
  if (min && max) return `${min}–${max}`;
  if (min) return `≥ ${min}`;
  if (max) return `≤ ${max}`;
  return "";
}

const BRIGADIR_RANGE_FIELDS = [
  ["planned", "planned_min", "planned_max", "overview.planned",       Target],
  ["final",   "final_min",   "final_max",   "overview.finalWorkload", Gauge],
  ["diff",    "diff_min",    "diff_max",    "overview.diff",          ArrowLeftRight],
  ["hc",      "hc_min",      "hc_max",      "overview.headcount",     Users],
  ["idle",    "idle_min",    "idle_max",    "overview.idleTime",      Hourglass],
];

// Declarative section list consumed by <FilterPanel>. Both pages own their own
// `filters` state (same shape) and pass it here, so the two tables never drift.
// `includeShift` is false on the shift-manager Daily table: it's scoped to a
// single shift server-side, so every row shares one Smena and the filter is moot.
export function brigadirFilterSections({ filters: f, setF, distinctShifts, distinctStatuses, t, includeShift = true }) {
  const sections = [
    {
      key: "name", icon: Search, label: t("overview.brigadir"),
      active: !!f.name, display: f.name,
      render: () => <TxtFilter value={f.name} onChange={v => setF("name", v)} />,
    },
  ];
  if (includeShift) {
    sections.push({
      key: "shifts", icon: Layers, label: t("overview.shift"),
      active: f.shifts.length > 0,
      display: f.shifts.length === 1 ? `S${f.shifts[0]}` : `${f.shifts.length} ${t("filter.selected2")}`,
      render: () => <OptsFilter opts={distinctShifts} sel={f.shifts} onChange={v => setF("shifts", v)} render={o => `S${o}`} />,
    });
  }
  for (const [key, minK, maxK, lblK, icon] of BRIGADIR_RANGE_FIELDS) {
    sections.push({
      key, icon, label: t(lblK),
      active: !!(f[minK] || f[maxK]),
      display: rngDisp(f[minK], f[maxK]),
      render: () => <RngFilter minV={f[minK]} maxV={f[maxK]} onMin={v => setF(minK, v)} onMax={v => setF(maxK, v)} />,
    });
  }
  sections.push({
    key: "statuses", icon: Activity, label: t("overview.status"),
    active: f.statuses.length > 0,
    display: `${f.statuses.length} ${t("filter.selected2")}`,
    render: () => <OptsFilter opts={distinctStatuses} sel={f.statuses} onChange={v => setF("statuses", v)} render={o => <StatusBadge status={o} short />} />,
  });
  return sections;
}

export function brigadirActiveCount(f) {
  return [
    f.name, f.shifts.length, f.statuses.length,
    f.planned_min || f.planned_max, f.final_min || f.final_max,
    f.diff_min || f.diff_max, f.hc_min || f.hc_max, f.idle_min || f.idle_max,
  ].filter(Boolean).length;
}
