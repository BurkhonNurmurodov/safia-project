import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  TrendingUp, Tag, Building2, Timer, Users, Wrench, UserCog, Boxes,
  AlertTriangle, ClipboardList,
} from "lucide-react";
import Button from "../ui/Button";
import SegmentedToggle from "../ui/SegmentedToggle";
import EmptyState from "../ui/EmptyState";
import { SkeletonBlock, SkeletonChart } from "../ui/Skeleton";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { useChartTheme } from "../../hooks/useChartTheme";
import { usePersistentState } from "../../hooks/usePersistentState";
import { cellName } from "../../utils/cellName";
import { shortPerson } from "../../utils/personName";
import { categoryColor, FOLD_COLOR } from "../../utils/chartPalette";
import { C_DONE, C_DOING, C_OVERDUE, C_GREY, hexA } from "../../utils/arcStatus";

// «Tahlil» — the ARC register read as charts. Same tickets, same filters, same
// page as the table (the parent hands its `filters` memo straight through, the
// «by cells» narrowing included), so a figure here is always a count over
// exactly the rows the «Ma'lumotlar» mode would list. The two tabs get two
// different question sets: «Barchasi» reads IT's flow (what breaks, where
// from, how fast, whose crew), «Yacheykalar bo'yicha» reads the org chart
// (whose cells call, which cells are hotspots).
//
// Chart types are picked per question, the Quality page's way: a LINE for the
// two flows over time (they compare, never stack), a DONUT for the category
// mix (composition, centre = total), stacked traffic-light BARS for every
// «who/where and how does it stand» ranking (green closed · yellow waiting ·
// red overdue — the palette every page here already taught), and a bar with a
// goal marker for speed-vs-allowance, where «the bar crossed the line» IS the
// verdict.

// «Filed» is an EVENT series, not a status, so it takes a categorical hue the
// status palette does not use; «closed» keeps the done-green the whole page
// speaks.
const C_CREATED = "#3b82f6";

const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

const tpl = (s, vars) => String(s || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));

// Three-letter month names (the Arc page's own stamp convention).
const MONTHS_SHORT = {
  uz:      ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"],
  uz_cyrl: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
  ru:      ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  en:      ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

// A trend bucket's axis label: day/week → «25 Avg», month → «Avg 26». The
// bucket key is a plain ISO date, so this never touches timezones.
const fmtBucket = (iso, gran, lang) => {
  const mn = (MONTHS_SHORT[lang] || MONTHS_SHORT.en)[Number(iso.slice(5, 7)) - 1];
  return gran === "month" ? `${mn} ${iso.slice(2, 4)}` : `${Number(iso.slice(8, 10))} ${mn}`;
};

// The chart card — the Quality page's pattern: icon chip + title + one-line
// «how to read me» subtitle + a right slot for the card's own toggle.
function ChartCard({ icon: Icon, title, subtitle, right, height = 300, empty, emptyText, ready, children }) {
  return (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <span className="grid place-items-center w-6 h-6 rounded-md flex-shrink-0"
              style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
              <Icon size={13} />
            </span>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{title}</div>
            {subtitle && <div className="text-[11px] truncate" style={{ color: "var(--text-4)" }} title={subtitle}>{subtitle}</div>}
          </div>
        </div>
        {right}
      </div>
      <div className="px-1 py-2 flex-1">
        {empty
          ? <div className="grid place-items-center text-xs" style={{ height, color: "var(--text-4)" }}>{emptyText}</div>
          : ready ? children : <div style={{ height }} />}
      </div>
    </div>
  );
}

export default function ArcAnalysis({ view, filters, enabled }) {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const { chartTheme, cardBg, gridColor, labelColor, legendColor } = useChartTheme();

  // ── the trend's granularity: auto from the picked span, overridable ───────
  // No period = the whole mirror → months; a short window → days. «» = auto,
  // so the default keeps following the period until the reader picks one.
  const span = useMemo(() => {
    if (!filters.date_from || !filters.date_to) return null;
    const d = (new Date(filters.date_to) - new Date(filters.date_from)) / 86400000;
    return Number.isNaN(d) ? null : Math.round(d) + 1;
  }, [filters.date_from, filters.date_to]);
  const autoGran = span == null ? "month" : span <= 92 ? "day" : span <= 400 ? "week" : "month";
  const [granPick, setGranPick] = usePersistentState("arc_an_gran", "");
  const gran = granPick || autoGran;
  // Units chart dimension — brigadir or lider, the Quality «acc» toggle model.
  const [dim, setDim] = usePersistentState("arc_an_dim", "sup");

  const viewKey = view === "cells" ? "cells" : "all";
  const anQ = useQuery({
    queryKey: ["arc-analysis", viewKey, gran, filters],
    queryFn: () => api.get("/api/arc/analysis", { params: { ...filters, view: viewKey, gran } }).then((r) => r.data),
    enabled,
    placeholderData: keepPreviousData,
  });
  const A = anQ.data;
  const loading = anQ.isLoading || (anQ.isFetching && !anQ.data);

  // Apex mounts are heavy; let the frame paint first (the Quality page's rule).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let raf2;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, []);

  const baseChart = {
    fontFamily: "inherit",
    toolbar: { show: false },
    background: "transparent",
    animations: { enabled: false },
    zoom: { enabled: false },
    selection: { enabled: false },
  };

  // ── flow: filed vs closed per bucket ──────────────────────────────────────
  const trend = A?.trend || [];
  const trendLabels = trend.map((b) => fmtBucket(b.d, A?.gran || gran, lang));
  const flowOpts = {
    chart: { ...baseChart, type: "line" },
    theme: chartTheme,
    colors: [C_CREATED, C_DONE],
    stroke: { curve: "smooth", width: 2.5 },
    markers: { size: 0, hover: { size: 4 } },
    dataLabels: { enabled: false },
    xaxis: {
      categories: trendLabels,
      tickAmount: Math.min(12, Math.max(2, trendLabels.length - 1)),
      labels: { style: { colors: labelColor, fontSize: "10px" }, rotate: 0, hideOverlappingLabels: true },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" } } },
    grid: { borderColor: gridColor, strokeDashArray: 3, padding: { left: 6, right: 10 } },
    legend: { position: "top", horizontalAlign: "right", markers: { radius: 4 }, labels: { colors: legendColor }, fontSize: "11px" },
    tooltip: { theme: chartTheme.mode, shared: true, intersect: false },
  };
  const flowSeries = [
    { name: t("arc.anCreated"), data: trend.map((b) => b.created) },
    { name: t("arc.anClosed"), data: trend.map((b) => b.closed) },
  ];
  const granToggle = (
    <SegmentedToggle size="sm" value={gran} onChange={setGranPick}
      options={[["day", t("arc.anGranDay")], ["week", t("arc.anGranWeek")], ["month", t("arc.anGranMonth")]]} />
  );

  // ── the category donut: top 8 + slate fold, centre = the filtered total ───
  const cats = A?.categories || [];
  const catTotal = cats.reduce((s, c) => s + (c.total || 0), 0);
  const topCats = cats.slice(0, 8);
  const foldN = cats.slice(8).reduce((s, c) => s + (c.total || 0), 0);
  const donutLabels = [...topCats.map((c) => c.name || "—"), ...(foldN ? [t("arc.anOther")] : [])];
  const donutColors = [...topCats.map((_, i) => categoryColor(i)), ...(foldN ? [FOLD_COLOR] : [])];
  const donutSeries = [...topCats.map((c) => c.total), ...(foldN ? [foldN] : [])];
  const donutOpts = {
    chart: { ...baseChart, type: "donut" },
    theme: chartTheme,
    labels: donutLabels,
    colors: donutColors,
    stroke: { width: 2, colors: [cardBg] },
    dataLabels: {
      enabled: true,
      formatter: (v) => (v >= 6 ? `${Math.round(v)}%` : ""),
      style: { fontSize: "10px", fontWeight: 700, colors: ["#fff"] },
      dropShadow: { enabled: false },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "68%",
          labels: {
            show: true,
            total: {
              show: true, showAlways: true, label: t("arc.anTotal"), fontSize: "11px", color: labelColor,
              formatter: () => catTotal.toLocaleString("ru-RU"),
            },
            value: { fontSize: "20px", fontWeight: 700, color: legendColor },
            name: { fontSize: "11px", color: labelColor },
          },
        },
      },
    },
    legend: { show: false },
    tooltip: { theme: chartTheme.mode, y: { formatter: (v) => tpl(t("arc.count"), { n: v }) } },
  };

  // ── stacked traffic-light rankings (divisions · brigades · units · cells) ─
  // One options builder + one series builder, so «green closed · yellow
  // waiting · red overdue · grey cancelled» reads identically on every chart —
  // learn the legend once, read four charts. The bar's end label is the total.
  const stackSeries = (rows) => [
    { name: t("arc.kDone"), data: rows.map((r) => r.done || 0) },
    { name: t("arc.kOpen"), data: rows.map((r) => Math.max(0, (r.open || 0) - (r.overdue || 0))) },
    { name: t("arc.kOverdue"), data: rows.map((r) => r.overdue || 0) },
    { name: t("arc.stateCancelled"), data: rows.map((r) => r.cancelled || 0) },
  ];
  const stackOpts = (labels) => ({
    chart: { ...baseChart, type: "bar", stacked: true },
    theme: chartTheme,
    colors: [C_DONE, C_DOING, C_OVERDUE, C_GREY],
    plotOptions: {
      bar: {
        horizontal: true, borderRadius: 3, barHeight: "68%",
        dataLabels: { total: { enabled: true, offsetX: 4, style: { fontSize: "10px", fontWeight: 700, color: legendColor } } },
      },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: labels,
      labels: { style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "11px" }, maxWidth: 190 } },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    legend: { position: "top", horizontalAlign: "right", markers: { radius: 4 }, labels: { colors: legendColor }, fontSize: "11px" },
    tooltip: { theme: chartTheme.mode, shared: true, intersect: false },
  });
  const stackHeight = (n) => Math.max(260, n * 34 + 104);
  // «top N of M» — what a ranked card is NOT showing, named on the card.
  const topOf = (shown, total) =>
    total > shown ? (
      <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>
        {tpl(t("arc.anTopOf"), { top: shown, n: total })}
      </span>
    ) : null;

  // ── «Barchasi»: divisions, closing speed vs allowance, IT brigades ────────
  const divs = A?.divisions || [];
  const divLabels = divs.map((d) => d.name || "—");

  const speed = A?.speed || [];
  const speedVerdict = (x) => (x.allowed_h == null ? C_GREY : x.median_h <= x.allowed_h ? C_DONE : C_OVERDUE);
  const speedData = speed.map((x) => ({
    x: x.name || "—",
    y: x.median_h,
    goals: x.allowed_h != null
      ? [{ name: t("arc.anAllowed"), value: x.allowed_h, strokeWidth: 3, strokeHeight: 18, strokeColor: legendColor }]
      : [],
  }));
  const speedOpts = {
    chart: { ...baseChart, type: "bar" },
    theme: chartTheme,
    colors: speed.map(speedVerdict),
    plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: "56%", distributed: true } },
    dataLabels: {
      enabled: true, offsetX: 18,
      formatter: (v) => `${v}`,
      style: { fontSize: "10px", fontWeight: 700, colors: ["#fff"] },
      dropShadow: { enabled: false },
    },
    // No xaxis.categories here — the series data is {x, y, goals} and the
    // labels come off its own x, a second list would fight it.
    xaxis: {
      labels: { style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "11px" }, maxWidth: 190 } },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    legend: { show: false },
    tooltip: {
      theme: chartTheme.mode,
      y: { formatter: (v, { dataPointIndex }) => {
        const x = speed[dataPointIndex];
        const base_ = `${v} ${t("arc.anHours")}`;
        return x ? `${base_} · ${tpl(t("arc.anClosedOver"), { n: x.closed })}` : base_;
      } },
    },
  };

  const brig = A?.brigadas || [];
  const brigLabels = brig.map((b) => b.name || t("arc.anUnassigned"));

  // ── «Yacheykalar bo'yicha»: units (brigadir/lider) + hotspot cells ────────
  const units = (dim === "leader" ? A?.leaders : A?.sups) || [];
  const unitLabels = units.map((u) => (u.name ? shortPerson(tl(u.name)) : t("arc.anUnassigned")));
  const unitsN = dim === "leader" ? A?.leaders_n : A?.sups_n;

  const cellRows = A?.cells || [];
  const cellsMap = A?.cells_map || {};
  const cellLabels = cellRows.map((c) => {
    const name = cellName(cellsMap[c.code], lang, "");
    return name ? `${c.code} · ${name}` : `${c.code} · ${t("arc.cUnknown")}`;
  });

  // ── frame states ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-2xl p-4" style={cardStyle}>
            <SkeletonBlock className="h-3 w-28 mb-4" /><SkeletonChart className="h-64" />
          </div>
          <div className="rounded-2xl p-4" style={cardStyle}>
            <SkeletonBlock className="h-3 w-24 mb-4" /><SkeletonChart className="h-64" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl p-4" style={cardStyle}>
              <SkeletonBlock className="h-3 w-24 mb-4" /><SkeletonChart className="h-56" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (anQ.isError) {
    return (
      <div className="rounded-2xl px-4 py-3 text-xs flex items-center justify-between gap-3 flex-wrap"
        style={{ background: hexA(C_OVERDUE, 0.1), color: C_OVERDUE, border: `1px solid ${hexA(C_OVERDUE, 0.33)}` }}>
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <AlertTriangle size={14} className="flex-shrink-0" />
          <span className="min-w-0">{anQ.error?.response?.data?.detail || t("arc.loadFailed")}</span>
        </span>
        <Button size="sm" variant="secondary" onClick={() => anQ.refetch()}>{t("common.retry")}</Button>
      </div>
    );
  }
  // The category rollup counts EVERY filtered row (a NULL category still
  // groups), so a zero total means the filters matched nothing at all — one
  // empty state, not five cards apologising separately. (The trend can still
  // hold zero-filled buckets for a picked period, so it is no test of this.)
  if (A && catTotal === 0) {
    return (
      <div className="rounded-2xl" style={cardStyle}>
        <EmptyState icon={ClipboardList} height="h-56" showUploadLink={false}
          title={t("arc.noMatch")} message={t("arc.anEmptyNote")} />
      </div>
    );
  }

  const donutCard = (
    <ChartCard icon={Tag} title={t("arc.anCats")} subtitle={t("arc.anCatsSub")}
      empty={cats.length === 0} emptyText={t("arc.noMatch")} ready={ready} height={286}>
      <div className="px-3">
        <ReactApexChart options={donutOpts} series={donutSeries} type="donut" height={210} />
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center pb-2">
          {topCats.slice(0, 6).map((c, i) => (
            <span key={c.id ?? c.name} className="inline-flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-3)" }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: categoryColor(i) }} />
              {c.name || "—"} <span className="tabular-nums font-semibold" style={{ color: "var(--text-2)" }}>{c.total}</span>
            </span>
          ))}
        </div>
      </div>
    </ChartCard>
  );

  const flowCard = (height) => (
    <ChartCard icon={TrendingUp} title={t("arc.anFlow")} subtitle={t("arc.anFlowSub")}
      empty={trend.length === 0} emptyText={t("arc.noMatch")} ready={ready} height={height}
      right={granToggle}>
      <ReactApexChart options={flowOpts} series={flowSeries} type="line" height={height} />
    </ChartCard>
  );

  if (viewKey === "cells") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ChartCard icon={dim === "leader" ? UserCog : Wrench}
              title={dim === "leader" ? t("arc.anByLeader") : t("arc.anBySup")}
              subtitle={t("arc.anUnitsSub")}
              empty={units.length === 0} emptyText={t("arc.noMatch")} ready={ready}
              height={stackHeight(units.length)}
              right={
                <div className="flex items-center gap-2 flex-shrink-0">
                  {topOf(units.length, unitsN || units.length)}
                  <SegmentedToggle size="sm" value={dim} onChange={setDim}
                    options={[["sup", t("arc.fSup")], ["leader", t("arc.fLeader")]]} />
                </div>
              }>
              <ReactApexChart options={stackOpts(unitLabels)} series={stackSeries(units)}
                type="bar" height={stackHeight(units.length)} />
            </ChartCard>
          </div>
          {donutCard}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard icon={Boxes} title={t("arc.anCellsTop")} subtitle={t("arc.anCellsTopSub")}
            empty={cellRows.length === 0} emptyText={t("arc.noMatch")} ready={ready}
            height={stackHeight(cellRows.length)}
            right={topOf(cellRows.length, A?.cells_n || cellRows.length)}>
            <ReactApexChart options={stackOpts(cellLabels)} series={stackSeries(cellRows)}
              type="bar" height={stackHeight(cellRows.length)} />
          </ChartCard>
          {flowCard(320)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">{flowCard(286)}</div>
        {donutCard}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard icon={Building2} title={t("arc.anDivs")} subtitle={t("arc.anDivsSub")}
          empty={divs.length === 0} emptyText={t("arc.noMatch")} ready={ready}
          height={stackHeight(divs.length)}
          right={topOf(divs.length, A?.divisions_n || divs.length)}>
          <ReactApexChart options={stackOpts(divLabels)} series={stackSeries(divs)}
            type="bar" height={stackHeight(divs.length)} />
        </ChartCard>
        <ChartCard icon={Timer} title={t("arc.anSpeed")} subtitle={t("arc.anSpeedSub")}
          empty={speed.length === 0} emptyText={t("arc.noMatch")} ready={ready}
          height={stackHeight(speed.length)}
          right={topOf(speed.length, A?.speed_n || speed.length)}>
          <ReactApexChart options={speedOpts} series={[{ name: t("arc.anMedian"), data: speedData }]}
            type="bar" height={stackHeight(speed.length) - 34} />
          {/* the verdict legend — the goal marker has no automatic entry */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center pb-2 px-3">
            {[[C_DONE, t("arc.anFast")], [C_OVERDUE, t("arc.anSlow")], [C_GREY, t("arc.anNoNorm")]].map(([c, l]) => (
              <span key={l} className="inline-flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-3)" }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />{l}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-3)" }}>
              <span className="w-3 h-0.5 flex-shrink-0" style={{ background: legendColor }} />{t("arc.anAllowed")}
            </span>
          </div>
        </ChartCard>
      </div>
      <ChartCard icon={Users} title={t("arc.anBrig")} subtitle={t("arc.anBrigSub")}
        empty={brig.length === 0} emptyText={t("arc.noMatch")} ready={ready}
        height={stackHeight(brig.length)}
        right={topOf(brig.length, A?.brigadas_n || brig.length)}>
        <ReactApexChart options={stackOpts(brigLabels)} series={stackSeries(brig)}
          type="bar" height={stackHeight(brig.length)} />
      </ChartCard>
    </div>
  );
}
