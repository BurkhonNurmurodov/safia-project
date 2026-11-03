import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { ArrowLeftRight, CalendarDays, CheckCircle2, ClipboardList, Grid3x3, Repeat, Users } from "lucide-react";
import KPICard from "../../components/ui/KPICard";
import EmptyState from "../../components/ui/EmptyState";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import TableCard, { Th } from "../../components/ui/DataTable";
import { SkeletonCard, SkeletonChart } from "../../components/ui/Skeleton";
import { WorkersPage, ChartCard } from "../../components/workers/WorkersPage";
import { chartBase } from "../../components/workers/chartBase";
import { useFilters } from "../../context/FilterContext";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useFactoryParams } from "../../context/FactoryContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { useChartTheme } from "../../hooks/useChartTheme";
import api from "../../utils/api";
import { CATEGORY_COLORS } from "../../utils/chartPalette";

// «O'zgarishlar» — the second of «Odam soni»'s three pages
// (/workers/movements; one page's tabs until 2026-11-03, see
// components/workers/WorkersPage.jsx): the people-exchange and role-change
// documents filed in the period — how many, by whom, to where, into what.

// Request-type categories take the first two shared generic hues.
const REQ_COLORS = { exchange: CATEGORY_COLORS[0], roleChange: CATEGORY_COLORS[1] };

// Role-transition matrix bins — single violet hue on log-ish breaks so the top
// flow is unmistakably darkest (a flat 11+ band rendered 35 and 543 identical).
// fg is the in-cell label color; zero cells recede to bg-inner and skip the fill.
const TRANS_BINS = [
  { from: 1,   to: 9,        bg: "#ede9fe", fg: "#5b21b6" },
  { from: 10,  to: 49,       bg: "#c4b5fd", fg: "#4c1d95" },
  { from: 50,  to: 99,       bg: "#a78bfa", fg: "#2e1065" },
  { from: 100, to: 199,      bg: "#7c3aed", fg: "#ffffff" },
  { from: 200, to: Infinity, bg: "#4c1d95", fg: "#ede9fe" },
];
const transBin = (v) => TRANS_BINS.find((b) => v >= b.from && v <= b.to);

export default function WorkersMovements() {
  const { params, ready } = useFilters();
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const { chartTheme, gridColor, labelColor, legendColor, tooltipTheme } = useChartTheme();
  const [tgtTab, setTgtTab] = usePersistentState("workers_tgt_tab", "supervisor"); // exchange-targets chart: "supervisor" | "task"

  // Every request on this page carries the active plant (see FactoryContext).
  const fparams = useFactoryParams(params);
  const { data: req } = useQuery({
    queryKey: ["worker-requests-analysis", fparams],
    queryFn: () => api.get("/api/workers/requests-analysis", { params: fparams }).then((r) => r.data),
    enabled: ready,
  });

  // ── requests aggregates ────────────────────────────────────────────────────────
  const reqKpi     = req?.kpi;
  const reqSups    = req?.by_supervisor || [];
  const reqTargets = req?.targets || [];
  const reqRoles   = req?.roles || [];
  const reqTrans   = req?.transitions || [];
  const hasReqData = (reqKpi?.total || 0) > 0;
  const postedRate = reqKpi?.total ? Math.round((reqKpi.posted / reqKpi.total) * 100) : 0;

  // ── shared chart pieces ────────────────────────────────────────────────────────
  const { baseChart, axisLabels, axisLabelsMd, legendCfg, gridCfg } = chartBase({ labelColor, legendColor, gridColor });

  // Movements by day (stacked columns).
  const reqDaySeries = [
    { name: t("workers.req.exchanges"),   data: req?.by_day?.exchanges || [] },
    { name: t("workers.req.roleChanges"), data: req?.by_day?.role_changes || [] },
  ];
  const reqDayOptions = {
    chart: { ...baseChart, type: "bar", stacked: true },
    plotOptions: { bar: { columnWidth: "40%", borderRadius: 3 } },
    colors: [REQ_COLORS.exchange, REQ_COLORS.roleChange],
    dataLabels: { enabled: false },
    // Horizontal dd.MM ticks — the year on every label is noise, rotated text
    // reads slower; the tooltip keeps the full date.
    xaxis: {
      categories: req?.by_day?.dates || [],
      labels: {
        ...axisLabels, rotate: 0, hideOverlappingLabels: true,
        formatter: (v) => (typeof v === "string" ? v.replace(/\.\d{4}$/, "") : v),
      },
    },
    yaxis: { labels: axisLabels },
    legend: legendCfg, grid: gridCfg,
    tooltip: {
      theme: tooltipTheme,
      x: { formatter: (val, { dataPointIndex }) => `${val} · ${req?.by_day?.workers?.[dataPointIndex] ?? 0} ${t("workers.req.workers")}` },
      y: { formatter: (v) => `${v} ${t("workers.req.docs")}` },
    },
    theme: chartTheme,
  };

  // Movements per supervisor (stacked horizontal bars).
  const reqSupSeries = [
    { name: t("workers.req.exchanges"),   data: reqSups.map((s) => s.exchanges) },
    { name: t("workers.req.roleChanges"), data: reqSups.map((s) => s.role_changes) },
  ];
  const reqSupOptions = {
    chart: { ...baseChart, type: "bar", stacked: true },
    plotOptions: { bar: { horizontal: true, barHeight: "60%", borderRadius: 3 } },
    colors: [REQ_COLORS.exchange, REQ_COLORS.roleChange],
    dataLabels: { enabled: false },
    xaxis: { categories: reqSups.map((s) => tl(s.name)), labels: axisLabels },
    yaxis: { labels: axisLabelsMd },
    legend: legendCfg, grid: gridCfg,
    tooltip: {
      theme: tooltipTheme,
      y: { formatter: (v, { seriesIndex, dataPointIndex }) => {
        const s = reqSups[dataPointIndex];
        if (!s) return String(v);
        const w = seriesIndex === 0 ? s.exchange_workers : s.role_change_workers;
        return `${v} ${t("workers.req.docs")} · ${w} ${t("workers.req.workers")}`;
      } },
    },
    theme: chartTheme,
  };

  // Exchange targets (where moved workers go) — split into receiving-supervisor
  // (→) and task destinations, switched via the header toggle.
  const reqTargetsView = reqTargets.filter((g) =>
    tgtTab === "task" ? g.type === "task" : g.type !== "task"
  );
  // Single series color (the exchange measure) — per-bar rainbow coloring
  // encoded nothing and made the ranking read as unrelated categories.
  const reqTgtOptions = {
    chart: { ...baseChart, type: "bar" },
    plotOptions: { bar: { horizontal: true, barHeight: "60%", borderRadius: 3 } },
    colors: [REQ_COLORS.exchange],
    dataLabels: { enabled: false },
    xaxis: {
      categories: reqTargetsView.map((g) => (tgtTab === "task" ? tx(g.label) : `→ ${tl(g.label)}`)),
      labels: axisLabels,
    },
    yaxis: { labels: axisLabelsMd },
    legend: { show: false }, grid: gridCfg,
    tooltip: {
      theme: tooltipTheme,
      y: { formatter: (v, { dataPointIndex }) => `${v} ${t("workers.req.workers")} · ${reqTargetsView[dataPointIndex]?.docs ?? 0} ${t("workers.req.docs")}` },
    },
    theme: chartTheme,
  };

  // New-role distribution.
  const reqRoleOptions = {
    chart: { ...baseChart, type: "bar" },
    plotOptions: { bar: { horizontal: true, barHeight: "60%", borderRadius: 3 } },
    colors: [REQ_COLORS.roleChange],
    dataLabels: { enabled: false },
    xaxis: { categories: reqRoles.map((r) => tx(r.role)), labels: axisLabels },
    yaxis: { labels: axisLabelsMd },
    legend: { show: false }, grid: gridCfg,
    tooltip: {
      theme: tooltipTheme,
      y: { formatter: (v, { dataPointIndex }) => `${v} ${t("workers.req.workers")} · ${reqRoles[dataPointIndex]?.docs ?? 0} ${t("workers.req.docs")}` },
    },
    theme: chartTheme,
  };

  // Role-transition matrix — old role (rows) × new role (cols), rendered as a
  // plain CSS grid instead of an Apex heatmap (Apex can't do receding zeros,
  // wrapped row labels, axis captions or an uncolored totals column). Rows and
  // columns sort by volume so the biggest flows read first.
  const transMap = Object.fromEntries(reqTrans.map((r) => [`${r.from}|${r.to}`, r.workers]));
  const transColTotals = {};
  reqTrans.forEach((r) => { transColTotals[r.to] = (transColTotals[r.to] || 0) + r.workers; });
  const toRoles = [...new Set(reqTrans.map((r) => r.to))].sort((a, b) => transColTotals[b] - transColTotals[a]);
  const transRows = [...new Set(reqTrans.map((r) => r.from))]
    .map((from) => {
      const cells = toRoles.map((to) => transMap[`${from}|${to}`] || 0);
      return { from, cells, total: cells.reduce((s, v) => s + v, 0) };
    })
    .sort((a, b) => b.total - a.total);
  const transRoleLabel = (name) => (!name || name === "-" || name === "—" ? t("workers.req.unspecified") : tx(name));

  // Same per-row height for the two side-by-side supervisor lists so the
  // paired cards come out near-equal.
  const reqSupChartH  = Math.max(220, reqSups.length * 30 + 80);
  const reqTgtChartH  = Math.max(220, reqTargetsView.length * 30 + 80);
  const reqRoleChartH = Math.max(200, reqRoles.length * 28 + 60);

  const numCell = "px-3 py-2 text-right tabular-nums";

  // ── render ─────────────────────────────────────────────────────────────────────
  return (
    <WorkersPage titleKey="nav.workersMovements">
      {/* Movements KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
        {!req ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />) : (
          <>
            <KPICard icon={ClipboardList} color="#8b5cf6" label={t("workers.req.totalRequests")}
              value={reqKpi.total} tooltip={t("workers.req.tip.totalRequests")} />
            <KPICard icon={ArrowLeftRight} color={REQ_COLORS.exchange} label={t("workers.req.workersExchanged")}
              value={reqKpi.workers_moved} sub={`${reqKpi.exchanges} ${t("workers.req.exchanges").toLowerCase()}`}
              tooltip={t("workers.req.tip.workersExchanged")} />
            <KPICard icon={Repeat} color={REQ_COLORS.roleChange} label={t("workers.req.workersReassigned")}
              value={reqKpi.workers_reassigned} sub={`${reqKpi.role_changes} ${t("workers.req.roleChanges").toLowerCase()}`}
              tooltip={t("workers.req.tip.workersReassigned")} />
            <KPICard icon={CheckCircle2} color="#22c55e" label={t("workers.req.postedRate")}
              value={`${postedRate}%`}
              sub={reqKpi.pending ? `${reqKpi.pending} ${t("workers.req.pending").toLowerCase()}` : undefined}
              tooltip={t("workers.req.tip.postedRate")} />
          </>
        )}
      </div>

      {req && !hasReqData ? (
        <div className="rounded-2xl p-4 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />
        </div>
      ) : (
        <>
          {/* Daily trend on its own full-width row — the 29-day axis needs the width */}
          <ChartCard icon={CalendarDays} title={t("workers.req.byDay")} info={t("workers.info.byDay")} className="mb-6">
            {!req ? <SkeletonChart className="h-72" />
              : <ReactApexChart type="bar" series={reqDaySeries} options={reqDayOptions} height={320} />}
          </ChartCard>

          {/* The two supervisor-ranked lists pair up — same row count, equal heights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 items-start">
            <ChartCard icon={Users} title={t("workers.req.bySupervisor")}>
              {!req ? <SkeletonChart className="h-72" />
                : <ReactApexChart type="bar" series={reqSupSeries} options={reqSupOptions} height={reqSupChartH} />}
            </ChartCard>
            <ChartCard icon={ArrowLeftRight} title={t("workers.req.targets")} info={t("workers.info.targets")}
              right={<SegmentedToggle size="sm" value={tgtTab} onChange={setTgtTab}
                options={[["supervisor", t("workers.req.tgtSupervisors")], ["task", t("workers.req.tgtTasks")]]} />}>
              {!req ? <SkeletonChart className="h-72" />
                : reqTargetsView.length ? <ReactApexChart type="bar"
                    series={[{ name: t("workers.req.workersExchanged"), data: reqTargetsView.map((g) => g.workers) }]}
                    options={reqTgtOptions} height={reqTgtChartH} />
                : <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />}
            </ChartCard>
          </div>

          {/* Compact new-roles chart beside the transition matrix it summarizes */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-6 items-start">
            <ChartCard icon={Repeat} title={t("workers.req.roles")}>
              {!req ? <SkeletonChart className="h-72" />
                : reqRoles.length ? <ReactApexChart type="bar"
                    series={[{ name: t("workers.req.workersReassigned"), data: reqRoles.map((r) => r.workers) }]}
                    options={reqRoleOptions} height={reqRoleChartH} />
                : <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />}
            </ChartCard>

            {/* Role-transition matrix — binned single-hue grid, biggest flows first */}
            <ChartCard icon={Grid3x3} title={t("workers.req.transitionMatrix")} info={t("workers.info.transitions")} className="lg:col-span-2">
              {!req ? <SkeletonChart className="h-64" />
                : transRows.length ? (
                  <>
                    <div className="overflow-x-auto">
                      <div className="grid gap-[2px] min-w-[460px] max-w-[660px]"
                        style={{ gridTemplateColumns: `minmax(130px,190px) repeat(${toRoles.length}, minmax(64px,1fr)) 56px` }}>
                        <div />
                        <div className="text-center text-[11px] pb-0.5" style={{ color: "var(--text-4)", gridColumn: `2 / span ${toRoles.length}` }}>
                          {t("workers.req.toRole")} →
                        </div>
                        <div />
                        <div className="flex items-end justify-end text-right pr-2.5 pb-1 text-[11px] leading-tight" style={{ color: "var(--text-4)" }}>
                          {t("workers.req.fromRole")} ↓
                        </div>
                        {toRoles.map((to) => (
                          <div key={to} className="self-end text-center text-xs font-medium pb-1" style={{ color: "var(--text-2)" }}>{tx(to)}</div>
                        ))}
                        <div className="self-end text-right text-[11px] pr-1.5 pb-1" style={{ color: "var(--text-4)" }}>{t("workers.total")}</div>
                        {transRows.map((row) => (
                          <Fragment key={row.from}>
                            <div className="flex items-center justify-end text-right pr-2.5 text-xs leading-tight" style={{ color: "var(--text-2)" }}>
                              {transRoleLabel(row.from)}
                            </div>
                            {row.cells.map((v, i) => {
                              const b = transBin(v);
                              return (
                                <div key={toRoles[i]} title={`${transRoleLabel(row.from)} → ${tx(toRoles[i])}: ${v}`}
                                  className="h-[34px] rounded flex items-center justify-center text-[13px] font-medium tabular-nums"
                                  style={b ? { background: b.bg, color: b.fg } : { background: "var(--bg-inner)", color: "var(--text-4)" }}>
                                  {b ? v : "·"}
                                </div>
                              );
                            })}
                            <div className="flex items-center justify-end pr-1.5 text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{row.total}</div>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 mt-3.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-[11px] h-[11px] rounded-[2px]" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }} />0
                      </span>
                      {TRANS_BINS.map((b) => (
                        <span key={b.from} className="inline-flex items-center gap-1.5">
                          <span className="w-[11px] h-[11px] rounded-[2px]" style={{ background: b.bg }} />
                          {b.to === Infinity ? `${b.from}+` : `${b.from}–${b.to}`}
                        </span>
                      ))}
                    </div>
                  </>
                )
                : <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />}
            </ChartCard>
          </div>

          {/* Supervisor summary table */}
          <TableCard icon={ClipboardList} title={t("workers.req.supervisorSummary")} className="mb-6"
            right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>{reqSups.length}</span>}>
            <thead>
              <tr>
                <Th label={t("workers.name")} />
                <Th label={t("overview.shift")} align="center" />
                <Th align="right" label={<span style={{ color: REQ_COLORS.exchange }}>{t("workers.req.exchanges")}</span>} />
                <Th align="right" label={<span style={{ color: REQ_COLORS.roleChange }}>{t("workers.req.roleChanges")}</span>} />
                <Th label={t("workers.req.posted")} align="right" />
                <Th label={t("workers.req.topTarget")} />
                <Th label={t("workers.req.topRole")} />
              </tr>
            </thead>
            <tbody>
              {reqSups.length === 0 && (
                <tr><td colSpan={7}>
                  <EmptyState title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />
                </td></tr>
              )}
              {reqSups.map((s) => (
                <tr key={s.manager_id}>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{tl(s.name)}</td>
                  <td className="px-3 py-2 text-center" style={{ color: "var(--text-2)" }}>S{s.shift}</td>
                  <td className={numCell} style={{ color: REQ_COLORS.exchange }}>
                    {s.exchanges} {t("workers.req.docs")} · {s.exchange_workers} {t("workers.req.workers")}
                  </td>
                  <td className={numCell} style={{ color: REQ_COLORS.roleChange }}>
                    {s.role_changes} {t("workers.req.docs")} · {s.role_change_workers} {t("workers.req.workers")}
                  </td>
                  <td className={numCell} style={{ color: "var(--text-1)" }}>{s.posted}/{s.total}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{s.top_target ? (reqTargets.some((g) => g.label === s.top_target && g.type === "task") ? tx(s.top_target) : tl(s.top_target)) : "—"}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{s.top_role ? tx(s.top_role) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </>
      )}
    </WorkersPage>
  );
}
