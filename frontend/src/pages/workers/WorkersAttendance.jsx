import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  AlertTriangle, ClipboardList, Grid3x3, LayoutGrid, PieChart, Radio, TrendingUp,
  UserCheck, UserMinus, Users,
} from "lucide-react";
import KPICard from "../../components/ui/KPICard";
import Modal from "../../components/ui/Modal";
import EmptyState from "../../components/ui/EmptyState";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import TableCard, { Th } from "../../components/ui/DataTable";
import HeatmapChart from "../../components/charts/HeatmapChart";
import { SkeletonCard, SkeletonChart } from "../../components/ui/Skeleton";
import { WorkersPage, ChartCard, ScopeSwitch } from "../../components/workers/WorkersPage";
import { chartBase } from "../../components/workers/chartBase";
import { useFilters } from "../../context/FilterContext";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useFactoryParams } from "../../context/FactoryContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { useChartTheme } from "../../hooks/useChartTheme";
import { padChartParams } from "../../utils/chartRange";
import { fmtLongDate } from "../Staff";
import api from "../../utils/api";
import { CATEGORY_COLORS, FOLD_COLOR } from "../../utils/chartPalette";
import { ATT_SEGMENTS } from "../../utils/statusBands";

// «Davomat» — the first of «Odam soni»'s three pages (/workers/attendance; the
// three were one page's tabs until 2026-11-03, see components/workers/
// WorkersPage.jsx): of the people on each brigadir's list, how many came.

// ── palette ──────────────────────────────────────────────────────────────────
// Role identity hues follow the shared generic-first category order (see
// utils/chartPalette): red, green, blue, … — one fixed hue per role, stable
// across every chart on the page.
const ROLE_COLORS = {
  Konditer:    CATEGORY_COLORS[0], // red
  Fasovshik:   CATEGORY_COLORS[1], // green
  Zagatovitel: CATEGORY_COLORS[2], // blue
  Other:       FOLD_COLOR,
};
const ROLES = ["Konditer", "Fasovshik", "Zagatovitel", "Other"]; // zagruzka-counted roles
// Extra (non-zagruzka) roles — every other real job title — continue the shared
// order after the three fixed zagruzka hues (yellow, orange, purple, …).
// Used only by the role-share donut + trend.
const ROLE_EXTRA_COLORS = CATEGORY_COLORS.slice(3);
const PRESENT_COLOR  = "#22c55e";   // явка / actual present (green) — used by the attendance table
const ABSENT_COLOR   = "#f59e0b";   // did not come — amber, the same "gap" hue the shortfall column uses
// Folded small-role band in the attendance trend reuses the shared FOLD_COLOR
// slate: "everything else" is a bucket, so it must not compete for a hue.

// Per-supervisor identity hues for the treemap — the shared generic-first
// categorical palette (every block is coloured, so hues read as identity, not
// status); large enough that colours stay unique for the realistic brigadir
// count (cycles past 18).
const SUP_COLORS = CATEGORY_COLORS;

// The attendance heatmap reuses the fleet HeatmapChart, so it takes the same
// banded {from,color} segments. Traffic-light, on the same 90 / 75 breaks as
// the table's rate column (`rateColor`) so a cell and its row's % never
// disagree about whether a day was good. It was a single-hue green ramp while
// the metric was present ÷ period-union — which was ~100 % for everybody, so
// every shade meant "fine"; a real attended ÷ on-the-list rate is a status, and a
// 60 % day must not read as green. Shades within a hue rank days inside a band.
// The scale itself is `ATT_SEGMENTS` in utils/statusBands — the shift
// dashboard's «Bugungi davomat» paints today's cell with it, so a unit-day
// wears one colour on both pages.

// A count of PEOPLE prints whole — over a period it is an average per day, and
// «139.8 workers» reads as a fraction of a person rather than a headcount.
const fmtN = (v) => (v == null ? "—" : String(Math.round(v) || 0));
const parseDate = (s) => { const [d, m, y] = s.split("."); return new Date(+y, +m - 1, +d); };
// Traffic-light hue for an attendance percentage.
const rateColor = (p) => (p == null ? "var(--text-2)" : p >= 90 ? "#22c55e" : p >= 75 ? "#eab308" : "#ef4444");

// The page's two measurement switches, repeated in the header of every card
// they drive. Order follows the order the question is asked in: WHICH people
// (role set) then WHICH number about them (on the list, turned up, or the
// difference between the two — those who did not come). The state
// behind them is shared, so flipping either one here moves the whole page.
// Wraps to a second line rather than shrinking the segments — SectionHead is
// already a flex-wrap row, and at 390px two toggles plus a title do not fit
// one line in any typography that stays readable.
function ModeSwitches({ scope, setScope, measure, setMeasure, t }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <ScopeSwitch scope={scope} setScope={setScope} t={t} />
      <SegmentedToggle
        size="sm" value={measure} onChange={setMeasure}
        options={[["roster", t("workers.msRoster")], ["came", t("workers.msCame")], ["diff", t("workers.msDiff")]]} />
    </div>
  );
}

export default function WorkersAttendance() {
  const { params, ready } = useFilters();
  const { t, lang } = useLang();
  const { tl, tx } = useTranslit();
  const { chartTheme, cardBg, gridColor, labelColor, legendColor, tooltipTheme } = useChartTheme();
  // The page's two measurement switches, shared by every card they drive (the
  // control is repeated in each card header, the STATE is one — flipping it
  // anywhere moves the whole page, which is the point of it).
  //   scope   — WHICH people: every role, or only the four zagruzka-counted ones
  //   measure — WHICH number about them: on the list, actually turned up, or
  //             the difference between the two (on the list but did not come)
  // These replace the old treeMode/roleMode pair, which were two independent
  // states meaning the same thing on one page.
  const [scope, setScope]     = usePersistentState("workers_scope", "all");        // "all" | "zagruzka"
  const [measure, setMeasure] = usePersistentState("workers_measure", "roster");   // "roster" | "came" | "diff"
  const [sort, setSort] = usePersistentState("workers_sort", { key: null, dir: "asc" });
  const trendTip = useRef(null);                       // attendance-trend below-chart tooltip panel
  const trendDefault = useRef("");                      // latest-day HTML for the idle/leave state

  const roleLabel = (r) => (r === "Other" ? t("workers.roleOther") : tx(r));

  // ── data ─────────────────────────────────────────────────────────────────────
  // Every request on this page carries the active plant (see FactoryContext);
  // on «All factories» the key is absent and the calls are byte-identical to
  // what they were before factories existed.
  const fparams = useFactoryParams(params);
  const { data: headcount = [], isLoading } = useQuery({
    queryKey: ["headcount", fparams],
    queryFn: () => api.get("/api/workers/headcount", { params: fparams }).then((r) => r.data),
    enabled: ready,
  });
  const chartParams = useMemo(() => padChartParams(fparams), [fparams]);
  const { data: trend } = useQuery({
    queryKey: ["worker-trend", chartParams],
    queryFn: () => api.get("/api/workers/trend", { params: chartParams }).then((r) => r.data),
    enabled: ready,
  });

  // ── today, read live ───────────────────────────────────────────────────────
  // Each unit's CURRENT shift-day is on the page before its brigadir closes it,
  // read off the live Verifix read (backend `_live_rows`); its `daily` entry
  // carries `live` + `read_at`. date → the oldest read behind that date's
  // figures — every surface showing one of these days says it is «so far».
  // date → { at: the oldest read behind it, n: how many units it is live for }
  const liveDays = useMemo(() => {
    const acc = {};
    headcount.forEach((m) => (m.daily || []).forEach((d) => {
      if (!d.live) return;
      const prev = acc[d.date] || { at: null, n: 0 };
      acc[d.date] = {
        n: prev.n + 1,
        at: !prev.at || (d.read_at && d.read_at < prev.at) ? (d.read_at || prev.at) : prev.at,
      };
    }));
    return acc;
  }, [headcount]);
  const liveText = (time) => t("workers.live.cell").replace("{time}", time || "—");
  // The column header speaks for the whole date, and on a date shared by both
  // shifts only some units are still open — so it says how many.
  const liveMarks = useMemo(
    () => Object.fromEntries(Object.entries(liveDays).map(([d, v]) => [d,
      t("workers.live.col").replace("{n}", v.n).replace("{time}", v.at || "—")])),
    [liveDays, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const liveDates = Object.keys(liveDays).sort((a, b) => parseDate(a) - parseDate(b));

  // ── headcount aggregates ───────────────────────────────────────────────────────
  const totalWorkers  = headcount.reduce((s, m) => s + m.total, 0);
  // Attendance = (came + on leave) ÷ on the list, summed over the period then
  // divided (not an average of per-brigadir rates, which would weigh a
  // 37-worker cell the same as a 125-worker one). avgOnList / avgCame are the
  // same pair per average day, which is what the KPI sub-line spells out.
  // Leave is ATTENDED: «О» is отпуск, booked by the company and standing on the
  // list for weeks, so counting it as a no-show marked a brigadir down every
  // one of those days for somebody nobody expected. The backend applies the
  // same rule to `att_rate` (the table column) — one formula, four surfaces.
  const rosterSum     = headcount.reduce((s, m) => s + (m.roster_sum || 0), 0);
  const cameSum       = headcount.reduce((s, m) => s + (m.came_sum || 0), 0);
  const leaveSum      = headcount.reduce((s, m) => s + (m.leave_sum || 0), 0);
  const attendedSum   = cameSum + leaveSum;
  const attRate       = rosterSum ? Math.round((attendedSum / rosterSum) * 100) : null;
  const avgOnList     = headcount.reduce((s, m) => s + (m.avg_roster || 0), 0);
  const avgCame       = headcount.reduce((s, m) => s + (m.avg_came || 0), 0);
  const avgAbsent     = headcount.reduce((s, m) => s + (m.avg_absent || 0), 0);
  const avgLeave      = headcount.reduce((s, m) => s + (m.avg_leave || 0), 0);
  const withOfficial  = headcount.filter((m) => m.official_hc != null);
  const officialSum   = withOfficial.reduce((s, m) => s + (m.official_hc || 0), 0);
  const presentOfOff  = withOfficial.reduce((s, m) => s + (m.avg_daily_hc || 0), 0);
  const shortfall     = Math.max(0, Math.round((officialSum - presentOfOff) * 10) / 10);
  const mismatchMgrs  = headcount.filter((m) => (m.mismatch_days || 0) > 0);

  // per-supervisor derived rate + shortfall. `rate` is the backend's
  // (came + on leave) ÷ on-the-list for the period; the old avg_daily_hc ÷
  // total was present over "everyone who came at least once", i.e. 100 % on
  // any single-day range.
  const rows = useMemo(() => headcount.map((m) => {
    const gap = m.official_hc != null ? Math.round((m.official_hc - (m.avg_daily_hc || 0)) * 10) / 10 : null;
    return { ...m, rate: m.att_rate ?? null, gap };
  }), [headcount]);

  function onSort(key) {
    setSort((p) => (p.key === key
      ? (p.dir === "asc" ? { key, dir: "desc" } : { key: null, dir: "asc" })
      : { key, dir: key === "name" ? "asc" : "desc" }));
  }
  // `measure` resolved to the per-role reader the role columns use. It must sit
  // ABOVE this memo — the memo body reads it at render, so declaring it with
  // its siblings in «the two switches, resolved» below is a TDZ crash. «Farq»
  // is derived client-side — the backend emits both role maps over the SAME
  // keys, so roster − came needs no third field (and roster ⊇ came keeps it
  // non-negative); round1 kills the float dust the subtraction leaves.
  const round1  = (v) => Math.round(v * 10) / 10;
  const roleVal = (m, r) =>
    measure === "roster" ? (m.avg_roster_by_role?.[r] ?? 0)
    : measure === "came" ? (m.avg_came_by_role?.[r] ?? 0)
    : round1((m.avg_roster_by_role?.[r] ?? 0) - (m.avg_came_by_role?.[r] ?? 0));
  const sortedRows = useMemo(() => {
    if (!sort.key) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    // Any key that is not one of the fixed columns is a ROLE column, and those
    // sort by whichever measure their cells are currently showing.
    const val = {
      name: (m) => tl(m.name) || "", onList: (m) => m.avg_roster || 0,
      came: (m) => m.avg_came || 0, absent: (m) => m.avg_absent || 0,
      rate: (m) => m.rate ?? -1, official: (m) => m.official_hc ?? -1, gap: (m) => m.gap ?? -999,
    }[sort.key] || ((m) => roleVal(m, sort.key));
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      return (typeof av === "string" ? av.localeCompare(bv) : av - bv) * dir;
    });
  }, [rows, sort, tl, measure]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── shared chart pieces ────────────────────────────────────────────────────────
  const { baseChart, axisLabels, legendCfg, gridCfg } = chartBase({ labelColor, legendColor, gridColor });

  // Dynamic role set for the donut, the trend and the table's role columns.
  // `avg_*_by_role` carries every present job title; `scope` switches between
  // all of them and the zagruzka subset.
  //
  // The role CATALOG and its hue order are read off the ROSTER numbers whatever
  // the active measure is. Derive them from the measure instead and a role would
  // change colour and jump position the moment you flip Ro'yxatda/Kelgan — the
  // one thing the palette rule forbids. Roster ⊇ came, so it is also the
  // complete list: a role nobody turned up for still keeps its slot.
  const rosterTotalsMap = useMemo(() => {
    const acc = {};
    headcount.forEach((m) => Object.entries(m.avg_roster_by_role || {})
      .forEach(([r, n]) => { acc[r] = (acc[r] || 0) + n; }));
    return acc;
  }, [headcount]);
  const extraRoles = useMemo(
    () => Object.keys(rosterTotalsMap).filter((r) => !ROLES.includes(r)).sort((a, b) => rosterTotalsMap[b] - rosterTotalsMap[a]),
    [rosterTotalsMap],
  );
  const roleColor = (r) => ROLE_COLORS[r] ?? ROLE_EXTRA_COLORS[Math.max(0, extraRoles.indexOf(r)) % ROLE_EXTRA_COLORS.length];
  const activeRoles = scope === "all" ? [...ROLES, ...extraRoles] : ROLES;

  // ── the two switches, resolved ───────────────────────────────────────────────
  // Every measured surface below reads `roleVal` (declared above the sort memo)
  // and sums the roles `scope` selected. All three measures are per-day averages
  // over the same confirmed days as the KPI row, so a treemap block and its own
  // table row carry the SAME number instead of two that have to be reconciled.
  const measureLabel = measure === "roster" ? t("workers.msRoster")
    : measure === "came" ? t("workers.msCame") : t("workers.msDiff");
  // On «Jami» the value is read straight off the row rather than re-summed from
  // the roles — it is the very number the table and the KPI cards already show
  // (avg_absent IS roster − came on the backend, i.e. the Kelmadi column).
  const mgrValue = (m) => (scope === "all"
    ? (measure === "roster" ? (m.avg_roster || 0)
      : measure === "came" ? (m.avg_came || 0) : (m.avg_absent || 0))
    : round1(ROLES.reduce((s, r) => s + roleVal(m, r), 0)));
  // Iterates the ROSTER keys — the complete role catalog (roster ⊇ came) — so
  // «Kelgan» and «Farq» still see a role nobody turned up for.
  const roleTotalsMap = useMemo(() => {
    const acc = {};
    headcount.forEach((m) => Object.keys(m.avg_roster_by_role || {})
      .forEach((r) => { acc[r] = (acc[r] || 0) + roleVal(m, r); }));
    Object.keys(acc).forEach((r) => { acc[r] = Math.round(acc[r] * 10) / 10; });
    return acc;
  }, [headcount, measure]); // eslint-disable-line react-hooks/exhaustive-deps
  // One prop bundle so the four card headers carry identical controls, and one
  // remount key — ApexCharts keeps stale series when the shape changes under it.
  const switchProps = { scope, setScope, measure, setMeasure, t };
  const modeKey = `${scope}-${measure}`;

  // Workforce composition donut — each role's share of the whole workforce.
  const donutRoles = activeRoles.filter((r) => (roleTotalsMap[r] || 0) > 0);
  const roleTotals = donutRoles.map((r) => roleTotalsMap[r] || 0);
  const donutTotal = round1(roleTotals.reduce((s, n) => s + n, 0));
  const donutOptions = {
    chart: { ...baseChart, type: "donut" },
    labels: donutRoles.map(roleLabel),
    colors: donutRoles.map(roleColor),
    legend: { ...legendCfg, position: "bottom" },
    dataLabels: { enabled: true, formatter: (val) => `${Math.round(val)}%`, style: { fontSize: "11px" } },
    stroke: { width: 0 },
    plotOptions: { pie: { donut: { size: "64%", labels: {
      show: true,
      value: { color: legendColor },
      total: { show: true, label: measureLabel, color: legendColor, formatter: () => fmtN(donutTotal) },
    } } } },
    // The number is a per-day average now, not a period headcount — the tooltip
    // says so rather than leaving a decimal to be read as a people count.
    tooltip: { theme: tooltipTheme, y: { formatter: (v) => `${fmtN(v)} ${t("workers.tmUnit")} · ${t("workers.perDay")}` } },
    theme: chartTheme,
  };

  // Workforce treemap — one block per brigadir in their own identity hue, sized
  // by the number the two switches resolve to (see `mgrValue`). Hue is keyed to
  // the brigadir's position in the stable backend order so it survives BOTH
  // switches; data is value-sorted for a tidier layout.
  const treePoints = headcount
    .map((m, i) => ({
      x: tl(m.name),
      y: Math.round(mgrValue(m)),
      color: SUP_COLORS[i % SUP_COLORS.length],
    }))
    .filter((d) => d.y > 0)
    .sort((a, b) => b.y - a.y);
  const treemapSeries = [{ data: treePoints.map(({ x, y }) => ({ x, y })) }];
  const treemapOptions = {
    chart: { ...baseChart, type: "treemap" },
    colors: treePoints.map((d) => d.color),
    legend: { show: false },
    dataLabels: {
      enabled: true,
      style: { fontSize: "13px", fontWeight: 600, colors: ["#fff"] },
      formatter: (text, op) => [text, fmtN(op.value)],
    },
    plotOptions: { treemap: { distributed: true, enableShades: false } },
    stroke: { width: 2, colors: [cardBg] },
    tooltip: { theme: tooltipTheme, y: { formatter: (v) => `${fmtN(v)} ${t("workers.tmUnit")} · ${t("workers.perDay")}` } },
    theme: chartTheme,
  };

  // Attendance trend by role (stacked area, min-7-day window).
  // Drop roles that are all-zero across the window: a zero top-of-stack series
  // still paints its translucent gradient down to the baseline, tinting the whole
  // chart its colour ("green shadow everywhere" when Zagatovitel has no attendance).
  // Which slice of the payload the measure switch is showing. `series_roster`
  // is the newer half — fall back to `series` so the page still renders against
  // a backend that has not been restarted yet. «Farq» is derived here per role
  // per day (roster − came; roster ⊇ came keeps it non-negative, and against
  // the un-restarted fallback both sources coincide so it degrades to zeros).
  const trendRoster = trend?.series_roster || trend?.series || {};
  const trendCame   = trend?.series || {};
  const trendSrc = measure === "roster" ? trendRoster
    : measure === "came" ? trendCame
    : Object.fromEntries(Object.entries(trendRoster).map(([r, arr]) => [
        r, arr.map((v, i) => Math.max(0, (v || 0) - ((trendCame[r] || [])[i] || 0))),
      ]));
  const trendRoles = trend
    ? activeRoles.filter((r) => (trendSrc[r] || []).some((v) => v > 0))
    : [];
  // ONE order everywhere — window total (desc), computed ONCE (never per-day):
  // it is the stack order (largest band sits on the stable baseline), the legend
  // order and the chip order, so nothing has to be re-searched between them and
  // chips keep their positions as you hover across days.
  // Ordered by the ROSTER totals, not by the active measure: flipping
  // Ro'yxatda/Kelgan must change the band HEIGHTS and nothing else, or the two
  // states cannot be compared by eye — which is the only reason for the switch.
  const trendRoleOrder = [...trendRoles].sort((a, b) => {
    const sum = (r) => ((trend.series_roster || trend.series)[r] || []).reduce((n, v) => n + (v || 0), 0);
    return sum(b) - sum(a);
  });
  // Past ~5 bands the top ribbons are a few px tall — unreadable ink. Keep the
  // top 4 and fold the tail into one slate "others" band; the folded roles keep
  // their numbers in the panel's muted breakdown and in the role-share donut.
  const foldRoles = trendRoleOrder.length > 5 ? trendRoleOrder.slice(4) : [];
  const keptRoles = foldRoles.length ? trendRoleOrder.slice(0, 4) : trendRoleOrder;
  const foldData = foldRoles.length
    ? (trend?.dates || []).map((_, i) => foldRoles.reduce((n, r) => n + ((trendSrc[r] || [])[i] || 0), 0))
    : null;
  const trendSeries = [
    ...keptRoles.map((r) => ({ name: roleLabel(r), data: trendSrc[r] || [] })),
    ...(foldData ? [{ name: t("workers.othersFold"), data: foldData }] : []),
  ];
  const trendColors = [...keptRoles.map(roleColor), ...(foldData ? [FOLD_COLOR] : [])];
  // The trend tooltip renders BELOW the chart (see .att-trend CSS) so it never
  // covers the plot. This builds the day's breakdown as a full-width horizontal
  // strip — date, colored role chips (zero-value roles dropped, sorted desc),
  // then the day total — for a given x-index. Colors come from CSS vars so it
  // adapts to theme. Reused by the hover callback and the idle/leave default.
  // ONE fixed template — same chips, same order, every day; only the numbers
  // change. Every role in `trendRoleOrder` is always shown (0 included) and each
  // value is pinned to a fixed width, so the strip never reflows → the card keeps
  // its size and nothing below shifts when you hover across days.
  const trendTipHtml = (idx) => {
    if (idx == null || !trend?.dates?.length) return "";
    const dateStr = trend.dates[idx] ?? "";
    // Long formatted date in plain ink — the old brand-gold DD.MM.YYYY read as a
    // link; this is a state readout ("which day am I looking at"), not a control.
    const date = dateStr ? fmtLongDate(parseDate(dateStr), t, lang) : "";
    // A day still being worked, read live: its figures are «so far».
    const liveTag = trend?.live && dateStr in trend.live
      ? `<span style="color:var(--brand-text);font-weight:500">${t("workers.live.soFar").replace("{time}", trend.live[dateStr] || "—")}</span>`
      : "";
    const items = keptRoles.map((r) => ({
      name: roleLabel(r), color: roleColor(r), val: (trendSrc[r] || [])[idx] ?? 0,
    }));
    if (foldData) items.push({ name: t("workers.othersFold"), color: FOLD_COLOR, val: foldData[idx] ?? 0 });
    const total = items.reduce((n, it) => n + it.val, 0);
    const num = (v, w) => `<b style="color:var(--text-1);display:inline-block;min-width:${w};text-align:right;font-variant-numeric:tabular-nums">${v}</b>`;
    const chips = items.map((it) => `
      <span style="display:inline-flex;align-items:center;gap:5px">
        <span style="width:9px;height:9px;border-radius:2px;background:${it.color};flex:none"></span>
        <span style="color:var(--text-3)">${it.name}</span>
        ${num(Math.round(it.val), "2.4em")}</span>`).join("");
    // Muted per-role detail of the folded tail — same roles every day and each
    // value width-pinned, so the strip keeps the no-reflow contract on hover.
    const foldDetail = foldRoles.length ? `
      <span style="color:var(--text-4)">${foldRoles.map((r) =>
        `${roleLabel(r)}&nbsp;<span style="display:inline-block;min-width:1.7em;font-variant-numeric:tabular-nums">${Math.round((trendSrc[r] || [])[idx] ?? 0)}</span>`).join(" · ")}</span>` : "";
    return `<span style="color:var(--text-1);font-weight:600">${date}</span>${liveTag}${chips}${foldDetail}
      <span style="margin-left:auto;color:var(--text-3)">${t("workers.total")}&nbsp;${num(Math.round(total), "2.8em")}</span>`;
  };
  const trendDefaultIdx = (trend?.dates?.length || 0) - 1;  // idle panel = latest day
  const trendDefaultHtml = trendTipHtml(trendDefaultIdx >= 0 ? trendDefaultIdx : null);
  trendDefault.current = trendDefaultHtml;                  // keep the leave-handler current
  const trendOptions = {
    chart: {
      ...baseChart, type: "area", stacked: true, zoom: { enabled: false },
      // On mouse-out restore the panel to the latest day so it's never blank.
      events: { mouseLeave: () => { if (trendTip.current) trendTip.current.innerHTML = trendDefault.current; } },
    },
    dataLabels: { enabled: false },
    // Solid bands with a card-colour seam between neighbours. Stacked bands
    // never overlap, so translucent gradients bought nothing and multiplied
    // into a grey-brown wash that matched no legend swatch; the 2px seam (not
    // a coloured stroke) is what separates adjacent bands.
    stroke: { curve: "smooth", width: 2, colors: [cardBg] },
    fill: { type: "solid", opacity: 1 },
    colors: trendColors,
    xaxis: {
      // Horizontal short ticks (DD.MM) — rotated full dates cost more reading
      // effort than the year, which the panel date already carries, adds.
      categories: trend?.dates || [],
      labels: { ...axisLabels, rotate: 0, formatter: (val) => String(val || "").slice(0, 5) },
      tickAmount: Math.min(trend?.dates?.length || 0, 6),
    },
    yaxis: { labels: axisLabels },
    legend: legendCfg, grid: gridCfg, theme: chartTheme,
    // Apex's own tooltip box is hidden via .att-trend CSS; this callback is used
    // only as the hover-index source — it writes the breakdown into the panel
    // under the chart and returns nothing visible.
    tooltip: {
      theme: tooltipTheme,
      custom: ({ dataPointIndex }) => {
        if (trendTip.current) trendTip.current.innerHTML = trendTipHtml(dataPointIndex);
        return "";
      },
    },
  };

  // Attendance heatmap — reuses the fleet HeatmapChart (supervisor rows × day
  // cols). Each cell is that day's (came + on leave) ÷ on-the-list (same metric
  // as the `rate` column, which the backend computes the same way), and the
  // counts behind it ride along for the hover text.
  // HeatmapChart reads `net_util` as a 0–1 fraction and renders it as a %;
  // days with no list stay null → shown as "—".
  //
  // The grid follows the page's `scope` switch like every other measured
  // surface: «Jami» is the whole list, «Zagruzka» the zagruzka-counted titles
  // only (`z_*`, the same halves the backend sends for that day). Same metric
  // either way — (came + on leave) ÷ on-the-list — so the views are comparable
  // and a cell never changes meaning, only its population.
  const heatDates = useMemo(() => {
    const set = new Set();
    headcount.forEach((m) => (m.daily || []).forEach((d) => set.add(d.date)));
    return [...set].sort((a, b) => parseDate(a) - parseDate(b));
  }, [headcount]);
  const heatManagers = useMemo(() => headcount.map((m) => m.name), [headcount]);
  const heatData = useMemo(() => {
    const out = {};
    const zag = scope === "zagruzka";
    headcount.forEach((m) => {
      const byDate = Object.fromEntries((m.daily || []).map((d) => [d.date, d]));
      const row = {};
      heatDates.forEach((dt) => {
        const d = byDate[dt];
        // Pre-`z_*` payloads (a cached response from before the split) fall back
        // to the whole-list numbers rather than rendering an empty grid.
        const roster   = d && (zag ? d.z_roster   ?? d.roster   : d.roster);
        const came     = d && (zag ? d.z_came     ?? d.came     : d.came);
        const absent   = d && (zag ? d.z_absent   ?? d.absent   : d.absent);
        const on_leave = d && (zag ? d.z_on_leave ?? d.on_leave : d.on_leave);
        row[dt] = roster
          ? { net_util: (came + (on_leave || 0)) / roster, roster, came, absent, on_leave,
              live: !!d.live, read_at: d.read_at || null }
          : { net_util: null };
      });
      out[m.name] = row;
    });
    return out;
  }, [headcount, heatDates, scope]);
  // Hover breakdown for a heatmap cell — the percentage says how bad, these say
  // how many, which is the number a supervisor is actually asked about.
  const heatTitle = (cell) => {
    if (!cell || cell.roster == null) return undefined;
    const parts = [
      `${t("workers.onList")}: ${cell.roster}`,
      `${t("workers.came")}: ${cell.came}`,
      `${t("workers.absent")}: ${cell.absent}`,
    ];
    if (cell.on_leave > 0) parts.push(`${t("workers.onLeave")}: ${cell.on_leave}`);
    return parts.join(" · ") + (cell.live ? `\n${liveText(cell.read_at)}` : "");
  };
  // …and the same breakdown on TAP, because `title` is a hover affordance and
  // this platform is read on a phone: without it the counts behind a cell would
  // exist only for people on a desktop.
  const [dayCell, setDayCell] = useState(null);   // { name, date, cell }

  const numCell = "px-3 py-2 text-right tabular-nums";

  // ── render ─────────────────────────────────────────────────────────────────────
  return (
    <WorkersPage titleKey="nav.workersAttendance">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4 mb-6">
        {isLoading ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />) : (
          <>
            {/* The attendance pair, in the order the question is asked:
                how many were on the list → how many came → how many did
                not → what that is as a rate. */}
            <KPICard icon={Users} color="#3b82f6" label={t("workers.kpi.onList")}
              value={fmtN(avgOnList)}
              sub={`${headcount.length} ${t("workers.kpi.supervisors")} · ${totalWorkers} ${t("workers.kpi.uniqueShort")}`}
              tooltip={t("workers.tip.onList")} />
            <KPICard icon={UserCheck} color="#22c55e" label={t("workers.kpi.came")}
              value={fmtN(avgCame)} tooltip={t("workers.tip.came")} />
            <KPICard icon={UserMinus} color={ABSENT_COLOR} label={t("workers.kpi.absent")}
              value={fmtN(avgAbsent)}
              sub={Math.round(avgLeave) >= 1 ? `${fmtN(avgLeave)} ${t("workers.onLeaveShort")}` : undefined}
              tooltip={t("workers.tip.absent")} />
            <KPICard icon={TrendingUp} color="#14b8a6" label={t("workers.kpi.attRate")}
              value={attRate == null ? "—" : `${attRate}%`}
              sub={rosterSum ? `${attendedSum} / ${rosterSum}` : undefined}
              tooltip={t("workers.tip.attRate")} />
            {/* Штат gap — a different comparison (plan vs actual, not list
                vs came) but it carries the verifix/official mismatch alarm,
                so it stays in the headline row rather than living only in
                the table. */}
            <KPICard icon={AlertTriangle} color="#a855f7" label={t("workers.kpi.shortfall")}
              value={fmtN(shortfall)}
              sub={mismatchMgrs.length ? `${mismatchMgrs.length} ${t("workers.mismatchWarn")}` : undefined}
              tooltip={t("workers.tip.shortfall")} />
          </>
        )}
      </div>

      {/* The shift-day still being worked is counted in, read live — say
          so once, under the figures it moves. */}
      {!isLoading && liveDates.length > 0 && (
        <div className="-mt-3 mb-6 flex items-start gap-1.5 text-xs" style={{ color: "var(--text-3)" }}>
          <Radio size={13} className="shrink-0 mt-px" style={{ color: "var(--brand)" }} aria-hidden />
          <span>
            {t("workers.live.note").replace("{days}", liveDates
              .map((d) => `${d.slice(0, 5)} (${liveDays[d].at || "—"})`).join(", "))}
          </span>
        </div>
      )}

      {/* Role-share donut + attendance trend (compact pair). Both switches
          drive both charts — role set adds/removes the non-zagruzka roles,
          measure swaps the roster numbers for the ones who turned up. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6">
        <ChartCard icon={PieChart} title={t("workers.roleShare")} info={`${t("workers.info.composition")} ${t("workers.info.original")}`}
          right={<ModeSwitches {...switchProps} />}>
          {isLoading ? <SkeletonChart className="h-72" />
            : roleTotals.some((n) => n > 0) ? <ReactApexChart key={modeKey} type="donut" series={roleTotals} options={donutOptions} height={330} />
            : <EmptyState title={t("workers.noHeadcount")} message={t("workers.noRoleMsg")} />}
        </ChartCard>

        <ChartCard icon={TrendingUp} title={t("workers.attendanceTrend")} info={`${t("workers.info.trend")} ${t("workers.info.original")}`}
          right={<ModeSwitches {...switchProps} />}>
          {!trend ? <SkeletonChart className="h-72" />
            : trend?.dates?.length ? (
              <>
                <div className="att-trend">
                  <ReactApexChart key={modeKey} type="area" series={trendSeries} options={trendOptions} height={330} />
                </div>
                {/* Hover breakdown lives here — under the chart, never over it. */}
                <div key={modeKey} ref={trendTip}
                  className="att-trend-panel flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 mt-1 text-xs"
                  style={{ borderColor: "var(--border)" }}
                  dangerouslySetInnerHTML={{ __html: trendDefaultHtml }} />
              </>
            )
            : <EmptyState title={t("workers.noTrend")} message={t("workers.noTrendMsg")} />}
        </ChartCard>
      </div>

      {/* Workforce treemap — full width, big & readable (one block per brigadir) */}
      <ChartCard icon={LayoutGrid} title={t("workers.composition")} info={`${t("workers.info.treemap")} ${t("workers.info.original")}`} className="mb-6"
        right={<ModeSwitches {...switchProps} />}>
        {isLoading ? <SkeletonChart className="h-96" />
          : treePoints.length ? <ReactApexChart key={modeKey} type="treemap" series={treemapSeries} options={treemapOptions} height={560} />
          : <EmptyState title={t("workers.noHeadcount")} message={t("workers.noRoleMsg")} />}
      </ChartCard>

      {/* Attendance heatmap (full width) — same component as the fleet heatmap */}
      <ChartCard icon={Grid3x3} title={t("workers.heatmap")} info={`${t("workers.info.heatmap")} ${t("workers.info.original")}`} className="mb-6"
        right={<ScopeSwitch scope={scope} setScope={setScope} t={t} />}>
        {isLoading ? <SkeletonChart className="h-72" />
          : heatManagers.length && heatDates.length
            ? <HeatmapChart dates={heatDates} managers={heatManagers} data={heatData}
                mode="actual" segments={ATT_SEGMENTS} cellTitle={heatTitle} dateMarks={liveMarks}
                onCellClick={(name, date, v, cell) => cell?.roster && setDayCell({ name, date, cell })} />
            : <EmptyState title={t("workers.noHeadcount")} message={t("workers.noTableMsg")} />}
      </ChartCard>

      {/* One day of one brigadir, spelled out — the tap target behind every
          heatmap cell. Four numbers, no chrome: the cell already said the
          percentage, this says what it is made of. */}
      <Modal open={!!dayCell} onClose={() => setDayCell(null)} maxWidth="max-w-xs"
        icon={<Users size={16} />}
        title={dayCell ? tl(dayCell.name) : ""}
        subtitle={dayCell
          ? fmtLongDate(parseDate(dayCell.date), t, lang)
            // Which population these four numbers are about. The header
            // switch is not visible from inside the modal, so a narrowed
            // grid must say so here or the counts read as the whole list.
            + (scope === "zagruzka" ? ` · ${t("workers.tmZagruzka")}` : "")
            // A day still being worked: the four numbers are «so far».
            + (dayCell.cell.live ? ` · ${liveText(dayCell.cell.read_at)}` : "")
          : ""}>
        {dayCell && (() => {
          const c = dayCell.cell;
          const pct = Math.round(((c.came + (c.on_leave || 0)) / c.roster) * 100);
          const line = (label, value, color, extra) => (
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="text-xs" style={{ color: "var(--text-3)" }}>{label}</span>
              <span className="text-sm font-semibold tabular-nums" style={{ color }}>
                {value}
                {extra && <span className="ml-1.5 text-[11px] font-normal" style={{ color: "var(--text-4)" }}>{extra}</span>}
              </span>
            </div>
          );
          return (
            <>
              <div className="text-center pb-2">
                <div className="text-3xl font-bold tabular-nums" style={{ color: rateColor(pct) }}>{pct}%</div>
                <div className="text-[11px]" style={{ color: "var(--text-4)" }}>{t("workers.attRate")}</div>
                {/* The fraction the % came from. Leave counts as attended,
                    so «84 came, 16 absent» no longer adds up to the number
                    above it on its own — without this line the reader is
                    left to guess which of the four counts it was over. */}
                <div className="text-[11px] tabular-nums mt-0.5" style={{ color: "var(--text-4)" }}>
                  {c.on_leave > 0
                    ? `${c.came} + ${c.on_leave} / ${c.roster}`
                    : `${c.came} / ${c.roster}`}
                </div>
              </div>
              <div style={{ borderTop: "1px solid var(--border)" }}>
                {line(t("workers.onList"), c.roster, "var(--text-1)")}
                {line(t("workers.came"), c.came, PRESENT_COLOR)}
                {line(t("workers.absent"), c.absent, c.absent > 0 ? ABSENT_COLOR : "var(--text-3)",
                  c.on_leave > 0 ? `${c.on_leave} ${t("workers.onLeaveShort")}` : null)}
              </div>
            </>
          );
        })()}
      </Modal>

      {/* Per-supervisor table — answers "under their name vs actively coming, by role" */}
      <TableCard icon={ClipboardList} title={t("workers.summary")} className="mb-8"
        right={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* The switches drive the ROLE columns only. Ro'yxatda / Keldi /
                Kelmadi stay side by side whatever is selected — comparing
                them is the whole job of those three columns. */}
            <ModeSwitches {...switchProps} />
            <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{headcount.length}</span>
          </div>
        )}>
        <thead>
          <tr>
            <Th label={t("workers.name")} k="name" sort={sort} onSort={onSort} />
            <Th label={t("overview.shift")} align="center" />
            <Th label={t("workers.days")} align="right" hint={t("workers.tip.daysCol")} />
            <Th label={t("workers.onList")} k="onList" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.onList")} />
            <Th label={t("workers.came")} k="came" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.came")} />
            <Th label={t("workers.absent")} k="absent" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.absent")} />
            <Th label={t("workers.attRate")} k="rate" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.attRate")} />
            <Th label={t("workers.official")} k="official" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.officialCol")} />
            <Th label={t("workers.shortfall")} k="gap" sort={sort} onSort={onSort} align="right" hint={t("workers.tip.shortfall")} />
            {/* Role columns follow the switches: «Zagruzka» keeps the four
                counted roles, «Jami» appends every other job title present. */}
            {activeRoles.map((r) => (
              <Th key={r} k={r} sort={sort} onSort={onSort} align="right"
                label={<span style={{ color: roleColor(r) }}>{roleLabel(r)}</span>} />
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 && (
            <tr><td colSpan={9 + activeRoles.length}>
              <EmptyState title={t("workers.noHeadcount")} message={t("workers.noTableMsg")} />
            </td></tr>
          )}
          {sortedRows.map((m) => (
            <tr key={m.manager_id}>
              <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{tl(m.name)}</td>
              <td className="px-3 py-2 text-center" style={{ color: "var(--text-2)" }}>S{m.shift}</td>
              <td className={numCell} style={{ color: "var(--text-3)" }}>{m.days ?? 0}</td>
              <td className={numCell} style={{ color: "var(--text-1)", fontWeight: 600 }}>{fmtN(m.avg_roster)}</td>
              <td className={numCell} style={{ color: PRESENT_COLOR }}>{fmtN(m.avg_came)}</td>
              {/* Absences are only worth ink when there are any; the leave
                  share sits beside the number because "8 missing" and "8
                  missing, 6 of them on leave" are different problems. */}
              <td className={numCell} style={{ color: (m.avg_absent || 0) > 0 ? ABSENT_COLOR : "var(--text-3)" }}>
                {fmtN(m.avg_absent)}
                {Math.round(m.avg_leave || 0) > 0 && (
                  <span className="ml-1 text-[10px]" style={{ color: "var(--text-4)" }}>
                    ({fmtN(m.avg_leave)} {t("workers.onLeaveShort")})
                  </span>
                )}
              </td>
              <td className={numCell} style={{ color: rateColor(m.rate), fontWeight: 600 }}>
                {m.rate == null ? "—" : `${m.rate}%`}
              </td>
              <td className={numCell} style={{ color: "var(--text-2)" }}>{fmtN(m.official_hc)}</td>
              <td className={numCell} style={{ color: (m.gap ?? 0) > 2 ? "#f59e0b" : "var(--text-2)" }}>
                <span className="inline-flex items-center gap-1 justify-end">
                  {(m.gap ?? 0) > 2 && <AlertTriangle size={11} />}
                  {m.gap == null ? "—" : (Math.round(m.gap) > 0 ? `−${fmtN(m.gap)}` : "0")}
                </span>
              </td>
              {activeRoles.map((r) => (
                <td key={r} className={numCell} style={{ color: roleColor(r) }}>{fmtN(roleVal(m, r))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableCard>
    </WorkersPage>
  );
}
