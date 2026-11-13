import { Fragment, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { ArrowDown, ArrowLeftRight, CalendarDays, ClipboardList, Repeat, Users } from "lucide-react";
import KPICard from "../../components/ui/KPICard";
import EmptyState from "../../components/ui/EmptyState";
import Button from "../../components/ui/Button";
import TableCard, { Th } from "../../components/ui/DataTable";
import { SplitBar, SplitLegend, FigureList } from "../../components/ui/Meter";
import { RankedList } from "../../components/ui/AnalysisBoard";
import { SkeletonBlock, SkeletonChart, SKELETON_NAME_WIDTHS } from "../../components/ui/Skeleton";
import { WorkersPage, ChartCard, TileSkeletons } from "../../components/workers/WorkersPage";
import { chartBase } from "../../components/workers/chartBase";
import { useFilters } from "../../context/FilterContext";
import { usePersistentState } from "../../hooks/usePersistentState";
import useElementWidth from "../../hooks/useElementWidth";
import useIsMobile from "../../hooks/useIsMobile";
import { useFactoryParams } from "../../context/FactoryContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { useChartTheme } from "../../hooks/useChartTheme";
import { listChartDays, ticksForWidth, axisLabelPx } from "../../utils/chartRange";
import { bucketTrend, bucketTick, bucketTitle, DAY_MAX } from "../../utils/trendBuckets";
import { surnameInitial } from "../../utils/personName";
import { searchFold } from "../../utils/searchFold";
import api from "../../utils/api";
import { CATEGORY_COLORS, FOLD_COLOR } from "../../utils/chartPalette";

// «O'zgarishlar» — the second of «Odam soni»'s three pages
// (/workers/movements; one page's tabs until 2026-11-03, see
// components/workers/WorkersPage.jsx): the people-exchange and role-change
// documents filed in the period — how many, by whom, to where, into what.
//
// Read in the order the question is asked (the redesign of 2026-11-13,
// docs/workers-and-attendance.md «O'zgarishlar: who gives, who takes»):
//   1. how much moved, and is it approved?   the four headline tiles
//   2. when, and into which tasks?           requests by day · sent to tasks
//   3. who gives and who takes?              ONE board, lent beside received
//   4. which role into which?                the transition matrix
//   5. the numbers behind it                 one row per brigadir

// The page's two request types. Categorical hues taken OUT of the shared order
// on purpose («Tarkib» does the same for men / women): the first two of it are
// red and green, and on a page with exactly two series that pair reads as a
// traffic light — «people exchanges» in red looked like a column of errors.
// Blue and purple are also what the «by day» tooltip has always named.
const EX = CATEGORY_COLORS[2];          // blue — people exchanges
const RC = CATEGORY_COLORS[5];          // purple — role changes
const EX_SOFT = `${EX}8c`;              // the same exchange, its other direction / its other half
const TOP_UNITS = 10;                   // the give-and-take board names this many
const TOP_TASKS = 8;
const INK_WARN = "var(--status-warn)", INK_OK = "var(--status-ok)";

// Role-transition matrix bins — one violet hue (the role-change family) on
// log-ish breaks so the top flow is unmistakably darkest. fg is the in-cell
// label colour; zero cells recede to bg-inner and skip the fill.
const TRANS_BINS = [
  { from: 1,   to: 9,        bg: "#ede9fe", fg: "#5b21b6" },
  { from: 10,  to: 49,       bg: "#c4b5fd", fg: "#4c1d95" },
  { from: 50,  to: 99,       bg: "#a78bfa", fg: "#2e1065" },
  { from: 100, to: 199,      bg: "#7c3aed", fg: "#ffffff" },
  { from: 200, to: Infinity, bg: "#4c1d95", fg: "#ede9fe" },
];
const transBin = (v) => TRANS_BINS.find((b) => v >= b.from && v <= b.to);

const fmtN = (v) => (v == null ? "—" : (Math.round(v) || 0).toLocaleString("ru-RU"));
const isoOf = (s) => s.split(".").reverse().join("-");
const dmy = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const pad2 = (n) => String(n).padStart(2, "0");

// Give and take, one brigadir per row: what they lent out grows LEFT from the
// middle, what they received grows right, both on one scale — so a unit that
// only ever gives and one that only ever takes are told apart at a glance.
function GiveTake({ rows, max, lentLabel, receivedLabel, unit }) {
  const w = (v) => `${max ? (v / max) * 100 : 0}%`;
  const head = "text-[11px] font-semibold uppercase tracking-wider";
  return (
    <div className="grid items-center gap-x-3 gap-y-2.5 text-xs grid-cols-[minmax(0,1.5fr)_auto_minmax(0,1.5fr)_auto] sm:grid-cols-[minmax(0,1.1fr)_auto_minmax(0,2fr)_auto]">
      <div />
      <div />
      <div className="flex gap-[2px]" style={{ color: "var(--text-3)" }}>
        <span className={`flex-1 text-right pr-2 ${head}`}>{lentLabel}</span>
        <span className={`flex-1 pl-2 ${head}`}>{receivedLabel}</span>
      </div>
      <div />
      {rows.map((r) => (
        <Fragment key={r.key}>
          <div className="truncate" style={{ color: "var(--text-1)" }} title={r.title}>{r.label}</div>
          <div className="text-right tabular-nums font-semibold min-w-[2.2em]"
            style={{ color: r.lent ? "var(--text-1)" : "var(--text-4)" }}>{fmtN(r.lent)}</div>
          <div className="flex gap-[2px]">
            <div className="flex-1 h-2.5 rounded-l-full overflow-hidden flex justify-end" style={{ background: "var(--bg-inner)" }}
              title={`${lentLabel}: ${fmtN(r.lent)} ${unit}`}>
              <div className="h-full rounded-l-full" style={{ width: w(r.lent), background: EX }} />
            </div>
            <div className="flex-1 h-2.5 rounded-r-full overflow-hidden" style={{ background: "var(--bg-inner)" }}
              title={`${receivedLabel}: ${fmtN(r.received)} ${unit}`}>
              <div className="h-full rounded-r-full" style={{ width: w(r.received), background: EX_SOFT }} />
            </div>
          </div>
          <div className="tabular-nums font-semibold min-w-[2.2em]"
            style={{ color: r.received ? "var(--text-1)" : "var(--text-4)" }}>{fmtN(r.received)}</div>
        </Fragment>
      ))}
    </div>
  );
}

export default function WorkersMovements() {
  const { params, ready, dateFrom, dateTo } = useFilters();
  const { t, lang } = useLang();
  const { tl, tx } = useTranslit();
  const { chartTheme, gridColor, labelColor, legendColor, tooltipTheme } = useChartTheme();
  const [sort, setSort] = usePersistentState("workers_mov_sort", { key: "total", dir: "desc" });
  const tableRef = useRef(null);
  const [chartRef, chartW] = useElementWidth();
  // A phone's name column holds a surname and an initial, not a full name cut
  // to «Abdullay…» — and a touch screen has no hover to finish it.
  const phone = useIsMobile();

  // Every request on this page carries the active plant (see FactoryContext).
  const fparams = useFactoryParams(params);
  const { data: req, isError, refetch } = useQuery({
    queryKey: ["worker-requests-analysis", fparams],
    queryFn: () => api.get("/api/workers/requests-analysis", { params: fparams }).then((r) => r.data),
    enabled: ready,
  });
  // The brigadir list the toolbar's picker already holds (same key, no second
  // request) — the shift of a unit that only RECEIVED people.
  const { data: managers = [] } = useQuery({
    queryKey: ["brigadirs-list"],
    queryFn: () => api.get("/api/managers/all").then((r) => r.data),
    staleTime: 300_000,
  });

  const kpi = req?.kpi;
  const hasData = (kpi?.total || 0) > 0;

  // ── who gives, who takes ───────────────────────────────────────────────────
  // A brigadir's row holds what they FILED (the exchanges they sent out, the
  // role changes) and what they RECEIVED — the «→ brigadir» destinations of
  // everybody else's exchanges, joined by the unit's id where the request
  // carries one and by the folded name otherwise (one person, two alphabets).
  // A unit that only received has a row too.
  const units = useMemo(() => {
    const byId = new Map(), byName = new Map();
    const shiftOf = new Map(managers.map((m) => [m.manager_id, m.shift]));
    const rows = (req?.by_supervisor || []).map((s) => {
      const r = { ...s, key: `m${s.manager_id}`, lent: s.exchange_workers || 0, received: 0,
        pending: (s.total || 0) - (s.posted || 0) };
      byId.set(s.manager_id, r);
      byName.set(searchFold(s.name), r);
      return r;
    });
    (req?.targets || []).forEach((g) => {
      if (g.type === "task") return;
      let r = (g.manager_id != null && byId.get(g.manager_id)) || byName.get(searchFold(g.label));
      if (!r) {
        r = { key: `t${g.manager_id ?? searchFold(g.label)}`, manager_id: g.manager_id ?? null, name: g.label,
          shift: g.manager_id != null ? shiftOf.get(g.manager_id) ?? null : null,
          total: 0, posted: 0, pending: 0, exchanges: 0, exchange_workers: 0, role_changes: 0,
          role_change_workers: 0, lent: 0, received: 0, top_target: null, top_role: null };
        rows.push(r);
        byName.set(searchFold(g.label), r);
        if (g.manager_id != null) byId.set(g.manager_id, r);
      }
      r.received += g.workers || 0;
    });
    return rows;
  }, [req, managers]);
  const taskLabels = useMemo(
    () => new Set((req?.targets || []).filter((g) => g.type === "task").map((g) => g.label)), [req]);
  const targetText = (label) => (label ? (taskLabels.has(label) ? tx(label) : tl(label)) : "—");

  const movers = useMemo(
    () => units.filter((u) => u.lent + u.received > 0).sort((a, b) => (b.lent + b.received) - (a.lent + a.received)),
    [units]);
  const moverMax = Math.max(1, ...movers.map((u) => Math.max(u.lent, u.received)));
  const toSup = (req?.targets || []).filter((g) => g.type !== "task").reduce((s, g) => s + (g.workers || 0), 0);
  const toTask = (req?.targets || []).filter((g) => g.type === "task").reduce((s, g) => s + (g.workers || 0), 0);
  const pendingUnits = units.filter((u) => u.pending > 0).sort((a, b) => b.pending - a.pending);
  const postedRate = kpi?.total ? Math.round((kpi.posted / kpi.total) * 100) : null;

  // ── sent to tasks ──────────────────────────────────────────────────────────
  const taskRows = useMemo(() => {
    const list = (req?.targets || []).filter((g) => g.type === "task");
    const rows = list.slice(0, TOP_TASKS).map((g) => ({ key: g.label, label: tx(g.label), title: tx(g.label), total: g.workers, n: g.workers, docs: g.docs }));
    const rest = list.slice(TOP_TASKS);
    if (rest.length) {
      const n = rest.reduce((s, g) => s + g.workers, 0);
      rows.push({ key: "__rest", label: t("workers.othersFold"), title: rest.map((g) => tx(g.label)).join(" · "),
        total: n, n: 0, fold: n, docs: rest.reduce((s, g) => s + g.docs, 0) });
    }
    return rows;
  }, [req, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const taskMax = Math.max(1, ...taskRows.map((r) => r.total));

  // ── requests by day ────────────────────────────────────────────────────────
  // The axis is the PERIOD — a day nobody filed on is a real 0, not a missing
  // column — folded into weeks / months once it is too long for days
  // (utils/trendBuckets); a period that long starts at its first request.
  const byDay = useMemo(() => {
    const d = req?.by_day;
    if (!d?.dates?.length) return { grain: "day", pts: [] };
    const at = Object.fromEntries(d.dates.map((s, i) => [isoOf(s), i]));
    const have = Object.keys(at).sort();
    const first = have[0], last = have[have.length - 1];
    const now = new Date();
    const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const from = dateFrom && dateFrom < first ? dateFrom : first;
    const to = dateTo && dateTo > last ? (dateTo > today ? (today > last ? today : last) : dateTo) : last;
    let days = listChartDays(from, to);
    if (days.length > DAY_MAX) days = listChartDays(first, last);
    if (days.length >= 1000) days = have;               // listChartDays stops at 1000 days
    const { grain, points } = bucketTrend(days.map((day) => ({ day, open: 0, opened: 0, closed: 0 })));
    let k = 0;
    const pts = points.map((p) => {
      const b = { day: p.day, from: p.from, to: p.to, exchanges: 0, role_changes: 0, workers: 0 };
      while (k < days.length && days[k] <= p.to) {
        const i = at[days[k++]];
        if (i != null) {
          b.exchanges += d.exchanges[i] || 0; b.role_changes += d.role_changes[i] || 0; b.workers += d.workers[i] || 0;
        }
      }
      return b;
    });
    return { grain, pts };
  }, [req, dateFrom, dateTo]);
  const { baseChart, axisLabels, legendCfg, gridCfg } = chartBase({ labelColor, legendColor, gridColor });
  const cats = byDay.pts.map((p) => bucketTick(p.day, byDay.grain));
  const dayOptions = {
    chart: { ...baseChart, type: "bar", stacked: true, parentHeightOffset: 0 },
    plotOptions: { bar: { columnWidth: cats.length > 24 ? "72%" : "46%", borderRadius: 3 } },
    colors: [EX, RC],
    dataLabels: { enabled: false },
    xaxis: {
      categories: cats,
      tickAmount: ticksForWidth(chartW, cats.length, axisLabelPx(cats)),
      labels: { ...axisLabels, rotate: 0, rotateAlways: false, hideOverlappingLabels: true },
      axisBorder: { color: gridColor }, axisTicks: { show: false },
    },
    yaxis: { labels: { ...axisLabels, formatter: (v) => String(Math.round(v)) } },
    legend: { ...legendCfg, horizontalAlign: "left", markers: { size: 5 } },
    grid: { ...gridCfg, padding: { left: 6, right: 12 } },
    tooltip: {
      theme: tooltipTheme, shared: true, intersect: false,
      x: { formatter: (_v, { dataPointIndex }) => {
        const p = byDay.pts[dataPointIndex];
        return p ? `${bucketTitle(p, byDay.grain, dmy, t)} · ${fmtN(p.workers)} ${t("workers.req.workers")}` : "";
      } },
      y: { formatter: (v) => `${v} ${t("workers.req.docs")}` },
    },
    theme: chartTheme,
  };

  // ── role transitions ───────────────────────────────────────────────────────
  // Old role (rows) × new role (columns), a plain CSS grid: receding zeros, a
  // total per row and — the «by new role» list that used to stand beside it —
  // a total per column. The column totals are the exact ones (`roles`); the
  // cells are the largest pairs, so a matrix that was cut says what is left.
  const matrix = useMemo(() => {
    const trans = req?.transitions || [];
    const cell = Object.fromEntries(trans.map((r) => [`${r.from}|${r.to}`, r.workers]));
    const exact = Object.fromEntries((req?.roles || []).map((r) => [r.role, r.workers]));
    const seen = {};
    trans.forEach((r) => { seen[r.to] = (seen[r.to] || 0) + r.workers; });
    const cols = Object.keys(seen).sort((a, b) => (exact[b] ?? seen[b]) - (exact[a] ?? seen[a]));
    const rows = [...new Set(trans.map((r) => r.from))]
      .map((from) => {
        const cells = cols.map((to) => cell[`${from}|${to}`] || 0);
        return { from, cells, total: cells.reduce((s, v) => s + v, 0) };
      })
      .sort((a, b) => b.total - a.total);
    const colTotals = cols.map((to) => Math.max(exact[to] ?? 0, seen[to]));
    const rest = cols.map((to, i) => colTotals[i] - seen[to]);
    return { cols, rows, colTotals, rest, cut: rest.some((v) => v > 0), total: colTotals.reduce((s, v) => s + v, 0) };
  }, [req]);
  const roleText = (name) => (!name || name === "-" || name === "—" ? t("workers.req.unspecified") : tx(name));

  // ── the table ──────────────────────────────────────────────────────────────
  function onSort(key) {
    setSort((p) => (p.key === key
      ? { key, dir: p.dir === "asc" ? "desc" : "asc" }
      : { key, dir: key === "name" ? "asc" : "desc" }));
  }
  function showInTable(key, dir) {
    setSort({ key, dir });
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    tableRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  }
  const sortedUnits = useMemo(() => {
    const val = {
      name: (u) => tl(u.name) || "", total: (u) => u.total, pending: (u) => u.pending,
      exchanges: (u) => u.exchanges, lent: (u) => u.lent, received: (u) => u.received,
      roleChanges: (u) => u.role_changes, reassigned: (u) => u.role_change_workers,
    }[sort.key] || ((u) => u.total);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...units].sort((a, b) => {
      const av = val(a), bv = val(b);
      return (typeof av === "string" ? av.localeCompare(bv) : av - bv) * dir || (b.total - a.total);
    });
  }, [units, sort, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const numCell = "px-3 py-2 text-right tabular-nums";
  // A zero recedes: the eye should land on the units that moved somebody.
  const num = (v, strong) => (
    <td className={numCell} style={{ color: v ? (strong ? "var(--text-1)" : "var(--text-2)") : "var(--text-4)", fontWeight: strong && v ? 600 : 400 }}>{fmtN(v)}</td>
  );
  const lower = (s) => String(s).toLocaleLowerCase();

  // ── render ─────────────────────────────────────────────────────────────────────
  return (
    <WorkersPage titleKey="nav.workersMovements">
      {isError && !req ? (
        // A failure is not «no requests»: it says so, and offers the way back.
        <div className="rounded-2xl p-4 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState tone="danger" height="h-56" title={t("workers.loadError")} message={t("workers.loadErrorMsg")} showUploadLink={false}
            action={<Button variant="secondary" onClick={() => refetch()}>{t("common.retry")}</Button>} />
        </div>
      ) : req && !hasData ? (
        <div className="rounded-2xl p-4 mb-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState height="h-56" title={t("workers.req.noData")} message={t("workers.req.noDataMsg")} showUploadLink={false} />
        </div>
      ) : (
        <>
          {/* 1 · How much moved, and is it approved? */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4 mb-4 lg:mb-6">
            {!req ? <TileSkeletons /> : (
              <>
                <KPICard label={t("workers.req.totalRequests")} tooltip={t("workers.req.tip.totalRequests")} value={fmtN(kpi.total)}>
                  <SplitBar parts={[
                    { key: "ex", label: t("workers.req.exchanges"), value: kpi.exchanges, color: EX },
                    { key: "rc", label: t("workers.req.roleChanges"), value: kpi.role_changes, color: RC },
                  ]} />
                  <SplitLegend className="mt-2" parts={[
                    { key: "ex", label: t("workers.req.exchanges"), text: fmtN(kpi.exchanges), color: EX },
                    { key: "rc", label: t("workers.req.roleChanges"), text: fmtN(kpi.role_changes), color: RC },
                  ]} />
                </KPICard>

                <KPICard label={t("workers.req.workersExchanged")} tooltip={t("workers.req.tip.workersExchanged")}
                  value={fmtN(kpi.workers_moved)} unit={t("workers.req.workers")}>
                  <SplitBar parts={[
                    { key: "sup", label: t("workers.req.toSupervisors"), value: toSup, color: EX },
                    { key: "task", label: t("workers.req.toTasks"), value: toTask, color: EX_SOFT },
                  ]} />
                  <SplitLegend className="mt-2" parts={[
                    { key: "sup", label: t("workers.req.toSupervisors"), text: fmtN(toSup), color: EX },
                    { key: "task", label: t("workers.req.toTasks"), text: fmtN(toTask), color: EX_SOFT },
                  ]} />
                </KPICard>

                {/* The two tiles that name things take a phone's whole row:
                    «Konditer → Fasovshchik» does not fit half of one. */}
                <KPICard className="max-sm:col-span-2" label={t("workers.req.workersReassigned")} tooltip={t("workers.req.tip.workersReassigned")}
                  value={fmtN(kpi.workers_reassigned)} unit={t("workers.req.workers")}>
                  <FigureList empty={t("workers.req.noRoleChanges")}
                    rows={(req.transitions || []).slice(0, 3).map((r) => ({
                      key: `${r.from}|${r.to}`, label: `${roleText(r.from)} → ${tx(r.to)}`,
                      title: `${roleText(r.from)} → ${tx(r.to)}`, value: fmtN(r.workers),
                    }))} />
                </KPICard>

                <KPICard className="max-sm:col-span-2" label={t("workers.req.kpiPending")} tooltip={t("workers.req.tip.pending")}
                  value={fmtN(kpi.pending)} unit={`/ ${fmtN(kpi.total)}`}
                  valueColor={kpi.pending ? INK_WARN : INK_OK}
                  onValueClick={kpi.pending ? () => showInTable("pending", "desc") : undefined}
                  sub={postedRate == null ? undefined : t("workers.req.approvedShare").replace("{p}", postedRate)}>
                  <FigureList empty={t("workers.req.noPending")}
                    rows={pendingUnits.slice(0, 3).map((u) => ({
                      key: u.key, label: surnameInitial(tl(u.name)), title: tl(u.name), value: fmtN(u.pending),
                    }))} />
                </KPICard>
              </>
            )}
          </div>

          {/* 2 · When — and into which tasks. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-4 lg:mb-6">
            <ChartCard className="lg:col-span-2" icon={CalendarDays} title={t("workers.req.byDay")} info={t("workers.info.byDay")}
              subtitle={byDay.grain === "week" ? t("workers.daily.subWeek") : byDay.grain === "month" ? t("workers.daily.subMonth") : undefined}
              bodyClassName="px-2 pt-2 pb-1">
              {!req ? <SkeletonChart className="h-[346px] m-2" />
                : (
                  <div ref={chartRef}>
                    <ReactApexChart key={`${byDay.grain}-${cats.length}`} type="bar" height={346} options={dayOptions}
                      series={[
                        { name: t("workers.req.exchanges"), data: byDay.pts.map((p) => p.exchanges) },
                        { name: t("workers.req.roleChanges"), data: byDay.pts.map((p) => p.role_changes) },
                      ]} />
                  </div>
                )}
            </ChartCard>

            <ChartCard icon={ClipboardList} title={t("workers.req.tasksTitle")} info={t("workers.info.tasks")}>
              {!req ? <SkeletonChart className="h-[280px]" />
                : taskRows.length ? (
                  <div className="flex-1">
                    <RankedList rows={taskRows} max={taskMax} unit={t("workers.req.workers")}
                      parts={[
                        { key: "n", label: t("workers.req.workersExchanged"), color: EX },
                        { key: "fold", label: t("workers.req.workersExchanged"), color: FOLD_COLOR },
                      ]}
                      value={(r) => (
                        <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}>
                          <b className="font-bold" style={{ color: "var(--text-1)" }}>{fmtN(r.total)}</b> · {fmtN(r.docs)} {t("workers.req.docs")}
                        </span>
                      )} />
                  </div>
                )
                : <EmptyState height="h-[280px]" title={t("workers.req.noTasks")} message={t("workers.req.noTasksMsg")} showUploadLink={false} />}
            </ChartCard>
          </div>

          {/* 3 · Who gives, who takes · 4 · which role into which. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-4 lg:mb-6">
            <ChartCard icon={ArrowLeftRight} title={t("workers.req.giveTake")} info={t("workers.info.giveTake")}>
              {!req ? <SkeletonChart className="h-[320px]" />
                : movers.length ? (
                  <>
                    <GiveTake max={moverMax} unit={t("workers.req.workers")}
                      lentLabel={t("workers.req.lent")} receivedLabel={t("workers.req.received")}
                      rows={movers.slice(0, TOP_UNITS).map((u) => ({
                        key: u.key, label: phone ? surnameInitial(tl(u.name)) : tl(u.name), title: tl(u.name),
                        lent: u.lent, received: u.received,
                      }))} />
                    {movers.length > TOP_UNITS && (
                      <button type="button" onClick={() => showInTable("lent", "desc")}
                        className="mt-4 self-start inline-flex items-center gap-1 text-xs font-medium rounded-md px-1 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
                        style={{ color: "var(--brand-text)" }}>
                        {t("workers.req.allInTable").replace("{n}", movers.length)} <ArrowDown size={12} aria-hidden />
                      </button>
                    )}
                  </>
                )
                : <EmptyState height="h-[320px]" title={t("workers.req.noExchanges")} message={t("workers.req.noDataMsg")} showUploadLink={false} />}
            </ChartCard>

            <ChartCard icon={Repeat} title={t("workers.req.transitionMatrix")} info={t("workers.info.transitions")}>
              {!req ? <SkeletonChart className="h-[320px]" />
                : matrix.rows.length ? (
                  <div className="overflow-x-auto">
                    {/* A column is as wide as a role's name («Fasovshchik»);
                        a longer one is cut with «…» and whole on hover, never
                        broken through a word. A card too narrow scrolls. */}
                    <div className="grid gap-[2px]"
                      style={{
                        minWidth: 150 + matrix.cols.length * 78,
                        gridTemplateColumns: `minmax(92px,128px) repeat(${matrix.cols.length}, minmax(76px,1fr)) 44px`,
                      }}>
                      <div />
                      <div className="text-center text-[11px] pb-0.5" style={{ color: "var(--text-3)", gridColumn: `2 / span ${matrix.cols.length}` }}>
                        {t("workers.req.toRole")} →
                      </div>
                      <div />
                      <div className="flex items-end justify-end text-right pr-2.5 pb-1 text-[11px] leading-tight" style={{ color: "var(--text-3)" }}>
                        {t("workers.req.fromRole")} ↓
                      </div>
                      {matrix.cols.map((to) => (
                        <div key={to} className="self-end text-center text-[11px] font-medium leading-tight pb-1 px-0.5 truncate"
                          style={{ color: "var(--text-2)" }} title={tx(to)}>{tx(to)}</div>
                      ))}
                      <div className="self-end text-right text-[11px] pr-1.5 pb-1" style={{ color: "var(--text-3)" }}>{t("workers.total")}</div>
                      {matrix.rows.map((row) => (
                        <Fragment key={row.from}>
                          <div className="flex items-center justify-end text-right pr-2.5 text-xs leading-tight" style={{ color: "var(--text-2)" }}>
                            {roleText(row.from)}
                          </div>
                          {row.cells.map((v, i) => {
                            const b = transBin(v);
                            return (
                              <div key={matrix.cols[i]} title={`${roleText(row.from)} → ${tx(matrix.cols[i])}: ${v}`}
                                className="h-[34px] rounded flex items-center justify-center text-[13px] font-medium tabular-nums"
                                style={b ? { background: b.bg, color: b.fg } : { background: "var(--bg-inner)", color: "var(--text-4)" }}>
                                {b ? v : "·"}
                              </div>
                            );
                          })}
                          <div className="flex items-center justify-end pr-1.5 text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{row.total}</div>
                        </Fragment>
                      ))}
                      {/* The matrix holds the largest pairs; what they leave
                          out of a column is said, never silently dropped. */}
                      {matrix.cut && (
                        <>
                          <div className="flex items-center justify-end text-right pr-2.5 text-xs leading-tight" style={{ color: "var(--text-3)" }}>
                            {t("workers.req.otherPairs")}
                          </div>
                          {matrix.rest.map((v, i) => (
                            <div key={matrix.cols[i]} className="h-[34px] flex items-center justify-center text-xs tabular-nums"
                              style={{ color: v ? "var(--text-3)" : "var(--text-4)" }}>{v || "·"}</div>
                          ))}
                          <div className="flex items-center justify-end pr-1.5 text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
                            {matrix.rest.reduce((s, v) => s + v, 0)}
                          </div>
                        </>
                      )}
                      <div className="flex items-center justify-end text-right pr-2.5 pt-1.5 text-xs font-semibold" style={{ color: "var(--text-1)" }}>
                        {t("workers.total")}
                      </div>
                      {matrix.colTotals.map((v, i) => (
                        <div key={matrix.cols[i]} className="pt-1.5 text-center text-xs font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{v}</div>
                      ))}
                      <div className="pt-1.5 pr-1.5 text-right text-xs font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{matrix.total}</div>
                    </div>
                  </div>
                )
                : <EmptyState height="h-[320px]" title={t("workers.req.noRoleChanges")} message={t("workers.req.noDataMsg")} showUploadLink={false} />}
            </ChartCard>
          </div>

          {/* 5 · The numbers behind it — one row per brigadir. */}
          <div ref={tableRef} className="scroll-mt-4 mb-6">
            <TableCard icon={Users} title={t("workers.req.supervisorSummary")} mobileMaxHeight="none"
              right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{req ? units.length : ""}</span>}
              mobile={(
                <div>
                  {!req && SKELETON_NAME_WIDTHS.map((w, i) => (
                    <div key={i} className="px-4 py-3" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                      <SkeletonBlock className={`h-4 ${w} mb-2.5`} />
                      <SkeletonBlock className="h-3 w-full mb-2" />
                      <SkeletonBlock className="h-3 w-2/3" />
                    </div>
                  ))}
                  {sortedUnits.map((u, i) => (
                    <div key={u.key} className="px-4 py-3" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium truncate" style={{ color: "var(--text-1)" }}>{tl(u.name)}</span>
                        <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "var(--text-3)" }}>
                          <b className="text-sm font-bold" style={{ color: "var(--text-1)" }}>{fmtN(u.total)}</b> {t("workers.req.docs")}
                        </span>
                      </div>
                      <div className="mt-1.5 text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
                        {u.shift ? `S${u.shift} · ` : ""}{t("workers.req.lent")} <b style={{ color: "var(--text-1)" }}>{fmtN(u.lent)}</b>
                        {" · "}{t("workers.req.received")} <b style={{ color: "var(--text-1)" }}>{fmtN(u.received)}</b>
                        {" · "}{t("workers.req.colReassigned")} <b style={{ color: "var(--text-1)" }}>{fmtN(u.role_change_workers)}</b>
                      </div>
                      {(u.top_target || u.top_role || u.pending > 0) && (
                        <div className="mt-1 flex items-baseline justify-between gap-3 text-xs" style={{ color: "var(--text-3)" }}>
                          <span className="truncate min-w-0">
                            {u.top_target ? `→ ${targetText(u.top_target)}` : ""}{u.top_target && u.top_role ? " · " : ""}{u.top_role ? tx(u.top_role) : ""}
                          </span>
                          {u.pending > 0 && (
                            <span className="flex-shrink-0 font-medium tabular-nums" style={{ color: INK_WARN }}>
                              {fmtN(u.pending)} {lower(t("workers.req.pending"))}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}>
              <thead>
                <tr>
                  <Th label={t("workers.name")} k="name" sort={sort} onSort={onSort} />
                  <Th label={t("overview.shift")} align="center" />
                  <Th label={t("workers.req.colDocs")} k="total" sort={sort} onSort={onSort} align="right" hint={t("workers.req.tip.totalRequests")} />
                  <Th label={t("workers.req.pending")} k="pending" sort={sort} onSort={onSort} align="right" hint={t("workers.req.tip.pending")} />
                  <Th label={t("workers.req.exchanges")} k="exchanges" sort={sort} onSort={onSort} align="right" />
                  <Th label={t("workers.req.lent")} k="lent" sort={sort} onSort={onSort} align="right" hint={t("workers.req.tip.lent")} />
                  <Th label={t("workers.req.received")} k="received" sort={sort} onSort={onSort} align="right" hint={t("workers.req.tip.received")} />
                  <Th label={t("workers.req.roleChanges")} k="roleChanges" sort={sort} onSort={onSort} align="right" />
                  <Th label={t("workers.req.colReassigned")} k="reassigned" sort={sort} onSort={onSort} align="right" hint={t("workers.req.tip.workersReassigned")} />
                  <Th label={t("workers.req.topTarget")} />
                  <Th label={t("workers.req.topRole")} />
                </tr>
              </thead>
              <tbody>
                {!req && SKELETON_NAME_WIDTHS.map((w, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2"><SkeletonBlock className={`h-3.5 ${w}`} /></td>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-3 py-2"><SkeletonBlock className="h-3.5 w-8 ml-auto" /></td>
                    ))}
                  </tr>
                ))}
                {sortedUnits.map((u) => (
                  <tr key={u.key}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{tl(u.name)}</td>
                    <td className="px-3 py-2 text-center" style={{ color: "var(--text-2)" }}>{u.shift ? `S${u.shift}` : "—"}</td>
                    {num(u.total, true)}
                    <td className={numCell} style={{ color: u.pending ? INK_WARN : "var(--text-4)", fontWeight: u.pending ? 600 : 400 }}>{fmtN(u.pending)}</td>
                    {num(u.exchanges)}
                    {num(u.lent, true)}
                    {num(u.received, true)}
                    {num(u.role_changes)}
                    {num(u.role_change_workers, true)}
                    <td className="px-3 py-2 max-w-[220px] truncate" style={{ color: "var(--text-2)" }} title={u.top_target ? targetText(u.top_target) : undefined}>
                      {targetText(u.top_target)}
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: "var(--text-2)" }} title={u.top_role ? tx(u.top_role) : undefined}>
                      {u.top_role ? tx(u.top_role) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          </div>
        </>
      )}
    </WorkersPage>
  );
}
