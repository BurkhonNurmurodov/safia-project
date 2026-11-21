import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { CalendarRange, PieChart, Factory, MessageSquareText, ChevronRight } from "lucide-react";
import KPICard from "../ui/KPICard";
import { Meter, SplitBar, SplitLegend } from "../ui/Meter";
import { SectionHead } from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import Button from "../ui/Button";
import { SkeletonBlock } from "../ui/Skeleton";
import api from "../../utils/api";
import { useTranslit } from "../../utils/transliterate";
import { useChartTheme } from "../../hooks/useChartTheme";
import useElementWidth from "../../hooks/useElementWidth";
import { ticksForWidth, axisLabelPx, padChartFrom, listChartDays } from "../../utils/chartRange";
import { CATEGORY_COLORS, FOLD_COLOR } from "../../utils/chartPalette";
import { fill } from "../../pages/auditsText";
import { BANDS, TARGET, bandColor, fmtPct, fmtDay, shopLabel } from "./auditUtil";
import { tipBox, esc } from "../plan/planUtil";

/**
 * «Tahlil» — what keeps failing, and is it getting better.
 *
 *   tiles      the average rating against the 90 % target (and the period
 *              before) · inspections that lost points · minuses · inspections
 *              split by rating band (ONE bar, never chips)
 *   columns    the average rating per day (per week past 92 days, per month
 *              past two years), each bar in its band's colour against the 90 %
 *              line — days are sparse, so a bar per day, not a broken line
 *   donut      minuses by checklist section — a whole in ≤ 7 parts
 *   rankings   the weakest workshops and the most repeated questions, as
 *              labelled bars a person can read whole; a click opens «Ro'yxat»
 *              filtered to it
 */

const card = "rounded-2xl overflow-hidden min-w-0";
const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };
const base = { fontFamily: "inherit", toolbar: { show: false }, background: "transparent",
  animations: { enabled: false }, zoom: { enabled: false }, selection: { enabled: false } };

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
function mondayOf(isoDay) {
  const d = new Date(isoDay + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return iso(d);
}

// Days → buckets: an inspections-weighted mean per bucket.
function bucketize(trend, from, to) {
  const spanDays = Math.round((new Date(to) - new Date(from)) / DAY) + 1;
  const grain = spanDays > 730 ? "month" : spanDays > 92 ? "week" : "day";
  const byKey = new Map();
  const keyOf = (d) => (grain === "month" ? d.slice(0, 7) + "-01" : grain === "week" ? mondayOf(d) : d);
  for (const p of trend) {
    if (p.avg == null) continue;
    const k = keyOf(p.day);
    const b = byKey.get(k) || { sum: 0, n: 0 };
    b.sum += p.avg * p.inspections;
    b.n += p.inspections;
    byKey.set(k, b);
  }
  let keys;
  if (grain === "day") {
    keys = listChartDays(padChartFrom(from, to), to);
  } else {
    keys = [];
    const start = trend.length ? trend[0].day : from;
    let k = keyOf(start > from ? start : from);
    while (k <= to && keys.length < 400) {
      keys.push(k);
      const d = new Date(k + "T00:00:00Z");
      if (grain === "month") d.setUTCMonth(d.getUTCMonth() + 1); else d.setUTCDate(d.getUTCDate() + 7);
      k = iso(d);
    }
  }
  return {
    grain,
    points: keys.map((k) => {
      const b = byKey.get(k);
      return { key: k, n: b?.n || 0, avg: b ? Math.round((b.sum / b.n) * 10) / 10 : null };
    }),
  };
}

function RankRow({ label, title, value, valueText, sub, color, onClick }) {
  return (
    <li>
      <button type="button" onClick={onClick} title={title}
        className="w-full grid grid-cols-[minmax(0,1fr)_minmax(56px,30%)_auto] sm:grid-cols-[minmax(0,1fr)_minmax(72px,28%)_172px] items-center gap-4 px-4 py-2.5 text-left rounded-none hover:bg-[var(--bg-inner)] focus-visible:bg-[var(--bg-inner)] outline-none"
        style={{ borderTop: "1px solid var(--border)" }}>
        <span className="truncate text-sm" style={{ color: "var(--text-1)" }}>{label}</span>
        <span aria-hidden className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
          <span className="block h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: color }} />
        </span>
        <span className="flex items-center justify-end gap-2 whitespace-nowrap">
          <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{valueText}</span>
          {sub && <span className="hidden sm:inline text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{sub}</span>}
          <ChevronRight size={14} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
        </span>
      </button>
    </li>
  );
}

export default function AuditsAnalysis({ period, f, T, onOpen, onClearAll }) {
  const { tx } = useTranslit();
  const { chartTheme, gridColor, labelColor, legendColor, cardBg } = useChartTheme();
  const [trendRef, trendW] = useElementWidth();

  const params = { ...period, workshop: f.workshop, inspector: f.inspector, task: f.task,
    question: f.question || undefined, top: f.top || undefined };
  const { data: A, isLoading, isError, refetch } = useQuery({
    queryKey: ["audits-analysis", params],
    queryFn: () => api.get("/api/audits/analysis", { params }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const trend = useMemo(() => (A ? bucketize(A.trend, period.date_from, period.date_to) : null),
    [A, period.date_from, period.date_to]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-[132px] rounded-xl" />)}
        </div>
        <SkeletonBlock className="h-80 rounded-2xl" />
      </div>
    );
  }
  if (isError) {
    return <EmptyState tone="danger" title={T.loadFail} message="" showUploadLink={false}
      action={<Button size="lg" variant="secondary" onClick={() => refetch()}>{T.retry}</Button>} />;
  }
  const filtered = f.workshop.length || f.inspector.length || f.task.length || f.question || f.top;
  if (!A.inspections) {
    return <EmptyState title={filtered ? T.noMatch : T.noData} message="" showUploadLink={false}
      action={filtered ? <Button size="lg" variant="secondary" onClick={onClearAll}>{T.clearAll}</Button> : null} />;
  }

  // ── tiles ──────────────────────────────────────────────────────────────
  const delta = A.prev_avg != null && A.avg != null ? Math.round((A.avg - A.prev_avg) * 10) / 10 : null;
  const deltaNode = delta == null
    ? <span style={{ color: "var(--text-3)" }}>{T.noPrev}</span>
    : <span className="tabular-nums" style={{ color: delta > 0 ? "var(--status-ok)" : delta < 0 ? "var(--status-bad)" : "var(--text-3)" }}>
        {fill(T.vsPrev, { d: `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta)}` })}
      </span>;
  const bandParts = BANDS.map((b) => ({ key: b.key, label: T.bands[b.key], value: A.bands[b.key] || 0, color: b.color }));
  const above90 = Math.round(((A.bands.a90 || 0) / A.inspections) * 100);

  // ── the trend ──────────────────────────────────────────────────────────
  const pts = trend.points;
  const labels = pts.map((p) => (trend.grain === "month" ? p.key.slice(5, 7) + "." + p.key.slice(2, 4) : fmtDay(p.key).slice(0, 5)));
  const trendTitle = trend.grain === "month" ? T.trendMonth : trend.grain === "week" ? T.trendWeek : T.trendDay;
  const trendOpts = {
    chart: { ...base, type: "bar" },
    theme: chartTheme,
    plotOptions: { bar: { distributed: true, columnWidth: pts.length > 40 ? "80%" : "62%", borderRadius: 3 } },
    colors: pts.map((p) => bandColor(p.avg)),
    dataLabels: { enabled: false },
    legend: { show: false },
    states: { hover: { filter: { type: "darken", value: 0.9 } } },
    xaxis: {
      categories: labels,
      tickAmount: ticksForWidth(trendW, labels.length, axisLabelPx(labels)),
      tickPlacement: "on",
      labels: { style: { colors: labelColor, fontSize: "10px" }, rotate: 0, hideOverlappingLabels: true, trim: false },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { min: 0, max: 100, tickAmount: 4, labels: { style: { colors: labelColor, fontSize: "10px" }, formatter: (v) => `${Math.round(v)}%` } },
    grid: { borderColor: gridColor, strokeDashArray: 3, padding: { left: 4, right: 8 } },
    annotations: { yaxis: [{ y: TARGET, borderColor: legendColor, strokeDashArray: 4, opacity: 0.7,
      label: { text: "90%", position: "right", textAnchor: "end", offsetX: -2, offsetY: -2, borderWidth: 0,
        style: { background: "transparent", color: legendColor, fontSize: "10px" } } }] },
    tooltip: {
      custom: ({ dataPointIndex }) => {
        const p = pts[dataPointIndex];
        if (!p || p.avg == null) return "";
        const when = trend.grain === "week" ? fill(T.weekOf, { d: fmtDay(p.key) }) : trend.grain === "month" ? labels[dataPointIndex] : fmtDay(p.key);
        return tipBox(when, [[T.kAvg, fmtPct(p.avg), bandColor(p.avg)], [T.kInsp, String(p.n)]]);
      },
    },
  };

  // ── sections ───────────────────────────────────────────────────────────
  const tasks = A.tasks || [];
  const taskColors = tasks.map((x, i) => (x.name == null ? FOLD_COLOR : CATEGORY_COLORS[i % CATEGORY_COLORS.length]));
  const taskLabels = tasks.map((x) => (x.name == null ? fill(T.otherN, { n: x.other }) : tx(x.name)));
  const donutOpts = {
    chart: { ...base, type: "donut",
      events: { dataPointSelection: (_e, _c, cfg) => {
        const x = tasks[cfg.dataPointIndex];
        if (x?.name) onOpen({ task: [x.name] });
      } } },
    theme: chartTheme,
    labels: taskLabels,
    colors: taskColors,
    stroke: { width: 2, colors: [cardBg] },
    dataLabels: { enabled: false },
    legend: { position: "bottom", horizontalAlign: "left", fontSize: "11px", labels: { colors: legendColor },
      markers: { size: 5 }, itemMargin: { horizontal: 6, vertical: 2 } },
    plotOptions: { pie: { expandOnClick: false, donut: { size: "68%", labels: { show: true,
      value: { fontSize: "22px", fontWeight: 600, color: legendColor },
      total: { show: true, label: T.kMinus, fontSize: "11px", color: labelColor, formatter: () => String(A.minuses) } } } } },
    tooltip: { custom: ({ seriesIndex }) => tipBox(esc(taskLabels[seriesIndex]),
      [[T.kMinus, String(tasks[seriesIndex].minuses), taskColors[seriesIndex]]]) },
  };

  const qMax = Math.max(1, ...(A.questions || []).map((x) => x.minuses));

  return (
    <div className="space-y-4">
      {/* ── tiles: from «are we on target?» to «how is it spread?» ─────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label={T.kAvg} value={fmtPct(A.avg)} size="lg" sub={deltaNode}>
          <div className="mt-3"><Meter value={A.avg} target={TARGET} targetLabel={T.target} color={bandColor(A.avg)}
            label={`${T.kAvg} ${fmtPct(A.avg)}`} /></div>
        </KPICard>
        <KPICard label={T.kInsp} value={A.inspections.toLocaleString("ru-RU")} sub={fill(T.kInspSub, { n: A.workshops })} />
        <KPICard label={T.kMinus} value={A.minuses.toLocaleString("ru-RU")}
          sub={[A.per_inspection != null && fill(T.kMinusSub, { n: A.per_inspection }), A.top ? fill(T.kTop, { n: A.top }) : null].filter(Boolean).join(" · ")} />
        <KPICard label={T.kBands} value={`${above90}%`} unit={T.bands.a90}>
          <div className="mt-3 space-y-2">
            <SplitBar parts={bandParts} height={8} />
            <SplitLegend parts={bandParts} />
          </div>
        </KPICard>
      </div>

      {/* ── is it getting better? · where the minuses come from ────────── */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className={`${card} lg:col-span-8`} style={cardStyle}>
          <SectionHead icon={CalendarRange} title={trendTitle} />
          <div ref={trendRef} className="px-2 pb-2 apx-bare-tip">
            <ReactApexChart type="bar" height={280} options={trendOpts}
              series={[{ name: T.kAvg, data: pts.map((p) => p.avg) }]} />
          </div>
        </div>
        <div className={`${card} lg:col-span-4`} style={cardStyle}>
          <SectionHead icon={PieChart} title={T.tasksTitle} />
          <div className="px-2 pb-3 apx-bare-tip">
            <ReactApexChart type="donut" height={300} options={donutOpts} series={tasks.map((x) => x.minuses)} />
          </div>
        </div>
      </div>

      {/* ── what keeps failing — a click opens the rows ─────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card} style={cardStyle}>
          <SectionHead icon={Factory} title={T.weakTitle} subtitle={T.weakSub} />
          <ul>
            {(A.weakest || []).map((s) => (
              <RankRow key={s.name} label={shopLabel(tx(s.name))} title={tx(s.name)} value={s.avg ?? 0}
                valueText={fmtPct(s.avg)} sub={fill(T.inspN, { n: s.inspections })} color={bandColor(s.avg)}
                onClick={() => onOpen({ workshop: [s.name] })} />
            ))}
          </ul>
        </div>
        <div className={card} style={cardStyle}>
          <SectionHead icon={MessageSquareText} title={T.qTitle} subtitle={T.qSub} />
          <ul>
            {(A.questions || []).map((x) => (
              <RankRow key={x.name} label={tx(x.name)} title={tx(x.name)} value={(x.minuses / qMax) * 100}
                valueText={x.minuses} sub={fill(T.qShops, { n: x.workshops })} color="var(--brand)"
                onClick={() => onOpen({ question: x.name })} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
