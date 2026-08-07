// Builds "numbers only" strings for the "How it's calculated" popups — the same
// equations the backend uses (app/services/kpi_calculator.py), with the actual
// numbers substituted in place of the variable names.
//
// Each builder returns a string, or null when the needed numbers aren't present
// (callers fall back to the original symbolic formula in that case).
//
// `approx = true` swaps "=" for "≈": used for Overview rows/KPIs, which are
// averages over the selected range, so the arithmetic is only approximate.

export const KAIZEN_BUFFER = 10;
export const VERIFIX_EFFICIENCY = 0.85;

function num(v, decimals = 0) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });
}

function signed(v, decimals = 0) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return (Number(v) > 0 ? "+" : "") + num(v, decimals);
}

// Plan-adjusted available minutes per person (= 480 × prod_actual/prod_plan).
function availMin(d) {
  if (d?.avail_min != null) return d.avail_min;
  if (d?.prod_plan) return 480 * (d.prod_actual / d.prod_plan);
  return null;
}

function effectiveHc(d) {
  if (d?.effective_hc != null) return d.effective_hc;
  if (d?.official_hc != null && d?.labor_surplus != null) return d.official_hc + d.labor_surplus;
  return null;
}

// ── Utilization metrics ───────────────────────────────────────────────────────
// Planned (baseline) utilization is a special case: prod_actual cancels out
// (avail_min already carries prod_actual/prod_plan), leaving a pure plan-vs-
// standard-capacity ratio = prod_plan ÷ (480 × official_hc). The adjusted/idle/
// early/net rows keep the actual form: prod_actual ÷ (headcount × available_min).
export function utilNumbers(key, d, approx = false) {
  if (!d) return null;
  const op = approx ? "≈" : "=";

  if (key === "baseline_util") {
    if (d.baseline_util == null || d.prod_plan == null || !d.official_hc) return null;
    return `${num(d.baseline_util, 3)} ${op} ${num(d.prod_plan, 0)} ÷ (480 × ${num(d.official_hc, 0)})`;
  }

  const pa = d.prod_actual;
  const base = availMin(d);
  const ehc = effectiveHc(d);
  const dt = d.equip_downtime || 0;
  const early = d.avg_early_arrival || 0;
  if (pa == null || base == null) return null;

  let denomStr, result;
  switch (key) {
    case "adjusted_util":
      result = d.adjusted_util; denomStr = num(base, 1); break;
    case "after_idle_util":
      result = d.after_idle_util;
      denomStr = `(${num(base, 1)} − ${num(dt, 0)})`; break;
    case "after_early_util":
      result = d.after_early_util;
      denomStr = `(${num(base, 1)} − ${num(dt, 0)} − ${num(early, 1)})`; break;
    case "net_util":
      result = d.net_util;
      denomStr = `(${num(base, 1)} − ${num(dt, 0)} − ${num(early, 1)} − ${KAIZEN_BUFFER})`; break;
    default:
      return null;
  }
  if (ehc == null || result == null) return null;
  return `${num(result, 3)} ${op} ${num(pa, 0)} ÷ (${num(ehc, 2)} × ${denomStr})`;
}

// ── Comment-modal formulas (percentage form + legend) ─────────────────────────
// Same numbers as utilNumbers above, but written with the result at the end as a
// rounded percentage (matching the heatmap cell, which is Math.round(util×100)),
// and paired with a legend that names every number so the popup is self-explained.
// Each returns { formula, legend:[{num,label}] } or null when inputs are missing.
export function commentPlanFormula(cell, t) {
  if (cell?.baseline_util == null || cell?.prod_plan == null || !cell?.official_hc) return null;
  const pct = Math.round(cell.baseline_util * 100);
  return {
    formula: `${num(cell.prod_plan, 0)} ÷ (480 × ${num(cell.official_hc, 0)}) × 100% = ${pct}%`,
    legend: [
      { num: num(cell.prod_plan, 0), label: t("comment.legend.prodPlan") },
      { num: "480", label: t("comment.legend.shiftStd") },
      { num: num(cell.official_hc, 0), label: t("comment.legend.headcount") },
    ],
  };
}

export function commentActualFormula(cell, t) {
  const pa = cell?.prod_actual;
  const base = availMin(cell);
  const ehc = effectiveHc(cell);
  if (cell?.net_util == null || pa == null || base == null || ehc == null) return null;
  const dt = cell.equip_downtime || 0;
  const early = cell.avg_early_arrival || 0;
  const pct = Math.round(cell.net_util * 100);
  return {
    formula: `${num(pa, 0)} ÷ (${num(ehc, 2)} × (${num(base, 1)} − ${num(dt, 0)} − ${num(early, 1)} − ${KAIZEN_BUFFER})) × 100% = ${pct}%`,
    legend: [
      { num: num(pa, 0), label: t("comment.legend.prodActual") },
      { num: num(ehc, 2), label: t("comment.legend.effectiveHc") },
      { num: num(base, 1), label: t("comment.legend.availMin") },
      { num: num(dt, 0), label: t("comment.legend.downtime") },
      { num: num(early, 1), label: t("comment.legend.earlyArr") },
      { num: String(KAIZEN_BUFFER), label: t("comment.legend.kaizen") },
    ],
  };
}

// ── Verifix labor (minutes) = reported_hours × 60 × 0.85 ──────────────────────
export function verifixNumbers(d, approx = false) {
  if (d?.verifix_labor == null) return null;
  const op = approx ? "≈" : "=";
  const reportedHrs = d.verifix_labor / 60 / VERIFIX_EFFICIENCY;
  return `${num(d.verifix_labor, 0)} ${op} ${num(reportedHrs, 1)} × 60 × ${VERIFIX_EFFICIENCY}`;
}

// ── Difference (minutes) = Verifix labor − Trudoyomkost(prod_actual) ──────────
export function differenceNumbers(d, approx = false) {
  if (d?.verifix_labor == null || d?.prod_actual == null) return null;
  const op = approx ? "≈" : "=";
  const diff = d.verifix_labor - d.prod_actual;
  return `${signed(diff, 0)} min ${op} ${num(d.verifix_labor, 0)} − ${num(d.prod_actual, 0)}`;
}

// ── Difference (% of Verifix reported) = (Verifix labor − Trudoyomkost) ÷ Verifix labor × 100 ──
export function differencePctNumbers(d, approx = false) {
  if (d?.verifix_labor == null || d?.prod_actual == null || !d.verifix_labor) return null;
  const op = approx ? "≈" : "=";
  const pct = (d.verifix_labor - d.prod_actual) / d.verifix_labor * 100;
  return `${signed(pct, 1)}% ${op} (${num(d.verifix_labor, 0)} − ${num(d.prod_actual, 0)}) ÷ ${num(d.verifix_labor, 0)} × 100`;
}

// ── HC difference = Verifix HC − Reported HC ──────────────────────────────────
export function hcDiffNumbers(d, approx = false) {
  if (d?.verifix_hc == null || d?.official_hc == null) return null;
  const op = approx ? "≈" : "=";
  const diff = d.verifix_hc - d.official_hc;
  return `${signed(diff, 0)} ${op} ${num(d.verifix_hc, 0)} − ${num(d.official_hc, 0)}`;
}

// ── HC-equivalent of the time gap = Difference(hrs) ÷ 8h shift ─────────────────
// Expresses the hours difference as full person-shifts (8 working hours = 1 HC).
export function hcEquivNumbers(d, approx = false, hcLabel = "HC") {
  if (d?.diff_hrs == null) return null;
  const op = approx ? "≈" : "=";
  return `${signed(d.diff_hrs / 8, 1)} ${hcLabel} ${op} ${signed(d.diff_hrs, 1)} hrs ÷ 8`;
}

// ── Comparison Table "P" cell = baseline_util × 100 ───────────────────────────
// Shown in plan-only form (prod_actual cancels): P = prod_plan ÷ (480 × hc) × 100.
// The last line spells out the rounding (e.g. 92.6% → 93%) so the header value
// reconciles with the arithmetic above it.
export function pValueNumbers(cell, approx = false) {
  if (cell?.baseline_util == null) return null;
  const op = approx ? "≈" : "=";
  const pct = cell.baseline_util * 100;
  let s = "P = prod_plan ÷ (480 × headcount) × 100";
  if (cell.prod_plan != null && cell.official_hc) {
    s += `\n${op} ${num(cell.prod_plan, 0)} ÷ (480 × ${num(cell.official_hc, 0)}) × 100`;
    s += `\n${op} ${num(pct, 1)}%  →  ${num(Math.round(pct), 0)}%`;
  }
  return s;
}

// ── Overview avg final workload = Σ(net_util) ÷ N supervisors ─────────────────
// Exact identity (avg × N = Σ), so this one keeps "=" regardless of range.
export function avgWorkloadNumbers(avg, nSups) {
  if (avg == null || !nSups) return null;
  return `${num(avg, 3)} = ${num(avg * nSups, 3)} ÷ ${nSups}`;
}

// ── "Values used" rows ────────────────────────────────────────────────────────
// Each builder returns the labeled, sourced inputs that actually feed the formula
// above it (not sibling metrics), so every number in the popup is traceable.
// `t` is the i18n lookup; values reuse the same `num()` formatting as the formula.
function inp(label, val, source) {
  return source ? { label, val, source } : { label, val };
}

// Planned (P) / baseline utilization: prod_plan ÷ (480 × headcount).
export function pValueInputs(cell, t) {
  if (!cell) return [];
  const out = [];
  if (cell.prod_plan != null)
    out.push(inp(t("profile.prodPlan"), `${num(cell.prod_plan, 0)} min`, t("fm.srcPlan")));
  if (cell.official_hc != null)
    out.push(inp(t("overview.fm.officialHC"), num(cell.official_hc, 0), t("overview.fm.srcVerifix")));
  out.push(inp(t("fm.shiftStd"), "480 min", t("fm.srcConst")));
  return out;
}

export function utilInputs(key, d, t) {
  if (!d) return [];
  if (key === "baseline_util") return pValueInputs(d, t);
  const out = [];
  if (d.prod_actual != null)
    out.push(inp(t("overview.fm.trudoyomkost"), `${num(d.prod_actual, 0)} min`, t("overview.fm.srcProduction")));
  const ehc = effectiveHc(d);
  if (ehc != null)
    out.push(inp(t("fm.effectiveHc"), num(ehc, 2), t("fm.srcDerived")));
  const base = availMin(d);
  if (base != null)
    out.push(inp(t("fm.availMin"), `${num(base, 1)} min`, t("fm.srcDerived")));
  if (["after_idle_util", "after_early_util", "net_util"].includes(key) && d.equip_downtime != null)
    out.push(inp(t("overview.fm.downtime"), `${num(d.equip_downtime, 0)} min`, t("overview.fm.srcEquip")));
  if (["after_early_util", "net_util"].includes(key) && d.avg_early_arrival != null)
    out.push(inp(t("fm.earlyArr"), `${num(d.avg_early_arrival, 1)} min`, t("overview.fm.srcVerifix")));
  if (key === "net_util")
    out.push(inp(t("fm.kaizen"), `${KAIZEN_BUFFER} min`, t("fm.srcConst")));
  return out;
}

export function verifixInputs(d, t) {
  if (d?.verifix_labor == null) return [];
  const hrs = d.verifix_labor / 60 / VERIFIX_EFFICIENCY;
  return [
    inp(t("fm.reportedHrs"), `${num(hrs, 1)} hrs`, t("overview.fm.srcVerifixFile")),
    inp(t("fm.efficiency"), String(VERIFIX_EFFICIENCY), t("fm.srcConst")),
  ];
}

export function differenceInputs(d, t) {
  if (d?.verifix_labor == null || d?.prod_actual == null) return [];
  return [
    inp(t("overview.fm.verifixTime"), `${num(d.verifix_labor, 0)} min`, t("overview.fm.srcVerifixFile")),
    inp(t("overview.fm.trudoyomkost"), `${num(d.prod_actual, 0)} min`, t("overview.fm.srcProduction")),
  ];
}

export function hcDiffInputs(d, t) {
  if (d?.verifix_hc == null || d?.official_hc == null) return [];
  return [
    inp(t("fm.verifixHc"), num(d.verifix_hc, 0), t("fm.srcDerived")),
    inp(t("overview.fm.reportedHC"), num(d.official_hc, 0), t("overview.fm.srcVerifix")),
  ];
}

export function hcEquivInputs(d, t) {
  if (d?.diff_hrs == null) return [];
  return [
    inp(t("overview.fm.diffTitle"), `${signed(d.diff_hrs, 1)} hrs`, t("fm.srcDerived")),
    inp(t("fm.shiftStd"), "8 hrs", t("fm.srcConst")),
  ];
}

// Inclusive day-count between two YYYY-MM-DD strings (1 when same/!range).
export function rangeDays(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return 1;
  const a = new Date(dateFrom + "T00:00:00");
  const b = new Date(dateTo + "T00:00:00");
  const days = Math.round((b - a) / 86400000) + 1;
  return days > 0 ? days : 1;
}
