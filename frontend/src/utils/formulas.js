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
      { num: num(ehc, 2), label: t("comment.legend.effectiveHc"), key: "effectiveHc" },
      { num: num(base, 1), label: t("comment.legend.availMin"), key: "availMin" },
      { num: num(dt, 0), label: t("comment.legend.downtime") },
      { num: num(early, 1), label: t("comment.legend.earlyArr") },
      { num: String(KAIZEN_BUFFER), label: t("comment.legend.kaizen") },
    ],
  };
}

// ── Effective headcount = official_hc + labor_surplus ─────────────────────────
// The one number in the Actual formula that is itself derived, so the popup
// spells it out instead of asserting it. The surplus is the extra person-shifts
// implied by the hours Verifix actually recorded:
//   labor_surplus = (verifix_labor − prod_actual) ÷ (60 × 8 × prod_actual/prod_plan)
// and 60 × 8 × ratio IS avail_min — the plan-adjusted person-shift already named
// in the Actual legend above — so the divisor reuses a number the reader has in
// front of them rather than introducing a fourth ratio to hold in their head.
// Both components are taken from the payload when it carries them and derived
// otherwise (an older backend, a tab open across a deploy), since
// effective_hc − official_hc is the surplus by definition.
export function commentEffectiveHcFormula(cell, t) {
  const ehc = effectiveHc(cell);
  const base = availMin(cell);
  const pa = cell?.prod_actual;
  if (ehc == null || !base || cell?.official_hc == null || pa == null) return null;
  const surplus = cell.labor_surplus != null ? cell.labor_surplus : ehc - cell.official_hc;
  const labor = cell.verifix_labor != null ? cell.verifix_labor : pa + surplus * base;
  return {
    formula: `${num(cell.official_hc, 0)} + (${num(labor, 0)} − ${num(pa, 0)}) ÷ ${num(base, 1)} = ${num(ehc, 2)}`,
    legend: [
      { num: num(cell.official_hc, 0), label: t("comment.legend.headcount") },
      { num: num(labor, 0), label: t("comment.legend.verifixLabor") },
      { num: signed(surplus, 2), label: t("comment.legend.laborSurplus") },
    ],
  };
}

// ── Available minutes per person = 480 × (prod_actual ÷ prod_plan) ────────────
// The SECOND derived input of the Actual formula, and the one that most often
// reads as arbitrary: a shift is 480 minutes, so a reader who is handed 326.9
// with no arithmetic cannot tell it from a typo. It is the backend's `base`
// (kpi_calculator: 480 × ratio) — the standard shift scaled by how much of the
// plan the day actually produced, which is why a day that ran behind its plan
// had fewer PLANNED minutes per person to spend. The ratio itself is named in
// the legend, since it is the whole of why the number is not simply 480.
export function commentAvailMinFormula(cell, t) {
  const base = availMin(cell);
  const pa = cell?.prod_actual;
  const pp = cell?.prod_plan;
  if (base == null || pa == null || !pp) return null;
  return {
    formula: `480 × (${num(pa, 0)} ÷ ${num(pp, 0)}) = ${num(base, 1)}`,
    legend: [
      { num: "480", label: t("comment.legend.shiftStd") },
      { num: num(pa, 0), label: t("comment.legend.prodActual") },
      { num: num(pp, 0), label: t("comment.legend.prodPlan") },
      { num: num(pa / pp, 3), label: t("comment.legend.planRatio") },
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

// ── «Soddalashtirilgan hisob» — the second comparison table on /zagruzka ──────
// One denominator for BOTH columns: the unit's people × a PRODUCTIVE shift.
//
//   Plan   = prod_plan   ÷ (480 × 0.9 × official_hc)
//   Actual = prod_actual ÷ (480 × 0.9 × official_hc)
//
// Read it in units and it explains itself: the numerator is PERSON-MINUTES OF
// WORK (Σ over the unit's catalog lines of quantity × Трудоемкость ÷ 60 — the
// «Ishlab chiqarish plani» / «Trudoyomkost» figures), the denominator is
// person-minutes of CAPACITY, and 0.9 says a person is productive for 432 of
// the shift's 480 minutes rather than all of them.
//
// What it deliberately does NOT carry, and the full table does: the effective-HC
// attendance correction, the plan-ratio scaling of avail_min, the ojidaniya
// deduction, the early-arrival deduction and the 10-minute kaizen buffer. That
// is the whole point of the second table — none of those four admin factor
// toggles appears here, which is why the ⚙ button is not offered on it.
//
// Consequence worth knowing: both columns share one denominator, so
//   Actual ÷ Plan = prod_actual ÷ prod_plan = ВЫП%,
// and D = Plan − Actual is exactly the plan shortfall expressed in загрузка
// points. And Plan is the full table's P ÷ 0.9 — the same measurement, rebased
// on 432 productive minutes, so every value reads 11.1% higher.
export const SHIFT_MIN = 480;
export const PRODUCTIVE_SHARE = 0.9;   // 480 × 0.9 = 432 productive minutes

// A ZERO is treated as NO DATA, and that is deliberate rather than defensive:
// `DailyMetrics` defaults both prod_plan and prod_actual to 0.0, so a day the
// file never mentioned arrives as 0 and is indistinguishable from a day that
// genuinely planned nothing. The full table already blanks both cases (its
// `ratio` is falsy at 0), so blanking them here keeps the two grids marking the
// same days as "no answer" instead of one printing 0% where the other prints —.
function simpleUtil(minutes, hc) {
  const m = Number(minutes);
  const n = Number(hc);
  if (!Number.isFinite(m) || !Number.isFinite(n)) return null;
  if (!(m > 0) || !(n > 0)) return null;
  return m / (SHIFT_MIN * PRODUCTIVE_SHARE * n);
}

export function simplePlanUtil(cell)   { return simpleUtil(cell?.prod_plan,   cell?.official_hc); }
export function simpleActualUtil(cell) { return simpleUtil(cell?.prod_actual, cell?.official_hc); }

// ── FormulaModal text (the P half of a simplified cell) ──────────────────────
// Spells the division out twice — once with 480 × 0.9 × N named, once with the
// 432 × N it collapses to — because the reader's question is usually "where did
// that denominator come from", and then states the rounding, so the number in
// the popup reconciles with the number in the cell.
function simpleNumbers(cell, minutes, letter, approx = false) {
  const v = simpleUtil(minutes, cell?.official_hc);
  if (v == null) return null;
  const op = approx ? "≈" : "=";
  const pct = v * 100;
  const den = SHIFT_MIN * PRODUCTIVE_SHARE * Number(cell.official_hc);
  return [
    `${letter} = ${letter === "P" ? "prod_plan" : "trudoyomkost"} ÷ (480 × ${PRODUCTIVE_SHARE} × headcount) × 100`,
    `${op} ${num(minutes, 0)} ÷ (480 × ${PRODUCTIVE_SHARE} × ${num(cell.official_hc, 0)}) × 100`,
    `${op} ${num(minutes, 0)} ÷ ${num(den, 0)} × 100`,
    `${op} ${num(pct, 1)}%  →  ${num(Math.round(pct), 0)}%`,
  ].join("\n");
}

export function simplePlanNumbers(cell, approx = false) {
  return simpleNumbers(cell, cell?.prod_plan, "P", approx);
}

export function simpleActualNumbers(cell, approx = false) {
  return simpleNumbers(cell, cell?.prod_actual, "A", approx);
}

function simpleInputs(cell, t, minutes, minutesLabel, minutesSrc) {
  if (!cell) return [];
  const out = [];
  if (minutes != null)
    out.push(inp(minutesLabel, `${num(minutes, 0)} min`, minutesSrc));
  if (cell.official_hc != null)
    out.push(inp(t("overview.fm.reportedHC"), num(cell.official_hc, 0), t("overview.fm.srcVerifix")));
  out.push(inp(t("fm.shiftStd"), "480 min", t("fm.srcConst")));
  out.push(inp(t("fm.productiveShare"), String(PRODUCTIVE_SHARE), t("fm.srcConst")));
  return out;
}

export function simplePlanInputs(cell, t) {
  return simpleInputs(cell, t, cell?.prod_plan, t("profile.prodPlan"), t("fm.srcPlan"));
}

export function simpleActualInputs(cell, t) {
  return simpleInputs(cell, t, cell?.prod_actual, t("overview.fm.trudoyomkost"), t("overview.fm.srcProduction"));
}

// ── CommentModal blocks (percentage form + a legend naming every number) ─────
function simpleComment(cell, t, minutes, minutesLabelKey) {
  const v = simpleUtil(minutes, cell?.official_hc);
  if (v == null) return null;
  const pct = Math.round(v * 100);
  return {
    formula: `${num(minutes, 0)} ÷ (480 × ${PRODUCTIVE_SHARE} × ${num(cell.official_hc, 0)}) × 100% = ${pct}%`,
    legend: [
      { num: num(minutes, 0), label: t(minutesLabelKey) },
      { num: "480", label: t("comment.legend.shiftStd") },
      { num: String(PRODUCTIVE_SHARE), label: t("comment.legend.productiveShare") },
      { num: num(cell.official_hc, 0), label: t("comment.legend.headcount") },
    ],
  };
}

export function commentSimplePlanFormula(cell, t) {
  return simpleComment(cell, t, cell?.prod_plan, "comment.legend.prodPlan");
}

export function commentSimpleActualFormula(cell, t) {
  return simpleComment(cell, t, cell?.prod_actual, "comment.legend.prodActual");
}
