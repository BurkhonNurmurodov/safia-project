// «Konteyner berish» → «Tahlil» (2026-11-15, the operator: «add more analytics
// with graphs»): the requests of a period as pictures — how much was asked,
// split and received day by day, whether logistics split on time, which hours
// are the heaviest, which containers, which brigadirs (and whether they
// confirm), how fast each step goes, and why containers fell short.
// Every figure is the server's (`flow.analytics`); the cards share their
// numbers with «Hisobot». docs/containers-flow.md.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  ArrowRight, BarChart3, BellRing, CalendarCheck, CalendarDays, Layers, ListFilter, ClipboardList, Clock, Eye, Gauge, PackageCheck, Split, Timer, UsersRound,
} from "lucide-react";
import DateRangePicker from "../ui/DateRangePicker";
import { FilterPanel, PickFilter } from "../ui/ColumnFilter";
import SegmentedToggle from "../ui/SegmentedToggle";
import Pagination from "../ui/Pagination";
import KPICard from "../ui/KPICard";
import EmptyState from "../ui/EmptyState";
import TableCard, { Th, SectionHead } from "../ui/DataTable";
import { Meter, SplitBar, SplitLegend } from "../ui/Meter";
import { SkeletonBlock } from "../ui/Skeleton";
import { tashkentNow } from "../production/HourlyContainers";
import { useChartTheme } from "../../hooks/useChartTheme";
import useElementWidth from "../../hooks/useElementWidth";
import { ticksForWidth, axisLabelPx } from "../../utils/chartRange";
import { CATEGORY_COLORS } from "../../utils/chartPalette";
import { TONE_HEX, GREEN, AMBER, RED, vypTone } from "../../utils/statusBands";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { KEYS, REASONS, span, fmt, errText, durText, STAGE_COLORS, onTimeTone, Chip } from "./flowUtil";

const CHART_H = 260;
const WEEK_AFTER = 45;      // a longer period draws weeks, not days
const STAGES = ["asked", "given", "received"];
const shiftISO = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const mondayOf = (iso) => shiftISO(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));

// Days as they are, or summed into Monday-weeks once the period is long: a bar
// per day of a quarter is a comb nobody reads.
function buckets(days) {
  if (days.length <= WEEK_AFTER) {
    return days.map((d) => ({ ...d, label: dm(d.day), judged: d.assigned + d.overdue }));
  }
  const by = new Map();
  for (const d of days) {
    const k = mondayOf(d.day);
    const b = by.get(k) ?? { day: k, label: dm(k), asked: 0, given: 0, received: 0, on_time: 0, judged: 0 };
    b.asked += d.asked; b.given += d.given; b.received += d.received;
    b.on_time += d.on_time; b.judged += d.assigned + d.overdue;
    by.set(k, b);
  }
  return [...by.values()].map((b) => ({ ...b, on_time_pct: b.judged ? Math.round((100 * b.on_time) / b.judged) : null }));
}

export default function FlowAnalytics({ t }) {
  const { tl } = useTranslit();
  const today = tashkentNow().iso;
  const [from, setFrom] = useState(() => shiftISO(today, -6));
  const [to, setTo] = useState(today);
  const q = useQuery({
    queryKey: ["cflow-analytics", from, to],
    queryFn: () => api.get("/api/container-flow/analytics", { params: { date_from: from, date_to: to } }).then((r) => r.data),
    staleTime: 60_000,
  });
  const a = q.data;
  const s = a?.summary;
  const loading = q.isLoading;
  const trend = useMemo(() => buckets(a?.days ?? []), [a]);
  const weekly = (a?.days?.length ?? 0) > WEEK_AFTER;
  const pct = (v) => (v == null ? "—" : `${v}%`);
  const mins = (v) => (v == null ? "—" : durText(t, v));
  const tone = (v) => (onTimeTone(v) ? TONE_HEX[onTimeTone(v)] : "var(--brand)");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker dateFrom={from} dateTo={to} setDateFrom={setFrom} setDateTo={setTo} max={today} compactLabel />
        <span className="text-xs" style={{ color: "var(--text-3)" }}>{t("cflow.an.scope")}</span>
      </div>

      {q.isError ? (
        <EmptyState tone="danger" showUploadLink={false} title={t("cflow.loadFailed")} message={errText(t, q.error)} />
      ) : !loading && !s?.requests ? (
        <EmptyState showUploadLink={false} icon={BarChart3} title={t("cflow.an.none")} message={t("cflow.an.noneMsg")} />
      ) : (
        <>
          {/* the headline: how many, on time, confirmed, arrived — each with its own bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPICard icon={ClipboardList} label={t("cflow.rq.count")} value={loading ? "…" : fmt(s.requests)}>
              {s && <StateSplit s={s} t={t} />}
            </KPICard>
            <KPICard icon={Gauge} label={t("cflow.rq.onTime")} value={loading ? "…" : pct(s.on_time_pct)}
              valueColor={onTimeTone(s?.on_time_pct) ? `var(--status-${onTimeTone(s.on_time_pct)})` : undefined}
              sub={s ? t("cflow.rq.onTimeSub").replace("{ok}", s.on_time).replace("{late}", s.late).replace("{over}", s.overdue) : ""}>
              {s && <Meter value={s.on_time_pct} target={95} targetLabel="95%" color={tone(s.on_time_pct)} label={t("cflow.rq.onTime")} />}
            </KPICard>
            <KPICard icon={UsersRound} label={t("cflow.an.confirmed")} value={loading ? "…" : pct(s.confirm_pct)}
              sub={s ? t("cflow.an.confirmedSub").replace("{c}", s.confirmed).replace("{u}", s.units) : ""}>
              {s && <Meter value={s.confirm_pct} color={STAGE_COLORS.given} label={t("cflow.an.confirmed")} />}
            </KPICard>
            <KPICard icon={PackageCheck} label={t("cflow.rq.received")} value={loading ? "…" : pct(s.received_pct)}
              sub={s ? t("cflow.an.receivedSub").replace("{r}", fmt(s.received)).replace("{s}", fmt(s.sent_confirmed)).replace("{m}", fmt(s.missing)) : ""}>
              {s && <Meter value={s.received_pct} color={STAGE_COLORS.received} label={t("cflow.rq.received")} />}
            </KPICard>
          </div>

          <SpeedCard t={t} s={s} loading={loading} mins={mins} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ChartCard className="lg:col-span-2" icon={BarChart3} title={t("cflow.an.trend")}
              subtitle={t(weekly ? "cflow.an.trendWeek" : "cflow.an.trendDay")} loading={loading}>
              {(w) => <TrendBars t={t} rows={trend} width={w} />}
            </ChartCard>
            <ChartCard icon={Gauge} title={t("cflow.an.onTimeBy")} subtitle={t("cflow.an.onTimeBySub")} loading={loading}>
              {(w) => <OnTimeBars t={t} rows={trend} width={w} />}
            </ChartCard>
          </div>

          <NeedGotTable t={t} tl={tl} rows={a?.need_vs_got} loading={loading} period={`${from}|${to}`} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ChartCard className="lg:col-span-2" icon={Clock} title={t("cflow.an.hours")} subtitle={t("cflow.an.hoursSub")} loading={loading}>
              {() => <HourBars t={t} rows={a.hours} />}
            </ChartCard>
            <ChartCard icon={PackageCheck} title={t("cflow.an.types")} subtitle={t("cflow.an.typesSub")} loading={loading}>
              {() => <TypeBars t={t} rows={a.types} />}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2 min-w-0"><UnitsTable t={t} tl={tl} rows={a?.units ?? []} loading={loading} /></div>
            <ReasonsCard t={t} a={a} loading={loading} />
          </div>
        </>
      )}
    </div>
  );
}

// The period's requests by where they stand — one bar, never a row of chips.
function StateSplit({ s, t }) {
  const parts = [
    { key: "split", label: t("cflow.an.st.split"), value: s.assigned, color: GREEN },
    { key: "waiting", label: t("cflow.an.st.waiting"), value: s.waiting, color: AMBER },
    { key: "overdue", label: t("cflow.an.st.overdue"), value: s.overdue, color: RED },
    { key: "cancelled", label: t("cflow.an.st.cancelled"), value: s.cancelled, color: "#94a3b8" },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <SplitBar parts={parts} />
      <SplitLegend parts={parts.filter((p) => p.value > 0)} />
    </div>
  );
}

// How long each step takes, as the road a request travels:
// sent → opened → split → received.
function SpeedCard({ t, s, loading, mins }) {
  const steps = [
    { key: "seen", icon: Eye, label: t("cflow.an.step.seen"), value: s?.avg_seen_min, hint: t("cflow.an.step.seenHint") },
    { key: "split", icon: Split, label: t("cflow.an.step.split"), value: s?.avg_assign_min, hint: t("cflow.an.step.splitHint") },
    { key: "recv", icon: PackageCheck, label: t("cflow.an.step.recv"), value: s?.avg_confirm_min, hint: t("cflow.an.step.recvHint") },
  ];
  return (
    <section className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={Timer} title={t("cflow.an.speed")} subtitle={t("cflow.an.speedSub")}
        right={!loading && s?.reminded > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-3)" }} title={t("cflow.an.remindedHint")}>
            <BellRing size={13} />{t("cflow.an.reminded").replace("{n}", s.reminded)}
          </span>
        ) : null} />
      <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2">
        <div className="hidden sm:flex items-center text-xs font-medium pr-1" style={{ color: "var(--text-3)" }}>{t("cflow.an.step.sent")}</div>
        {steps.map((st, i) => (
          <div key={st.key} className="contents">
            {i > 0 && <div className="hidden sm:flex items-center" aria-hidden><ArrowRight size={16} style={{ color: "var(--text-4)" }} /></div>}
            <div className="rounded-xl px-3.5 py-3 min-w-0" title={st.hint}
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
                <st.icon size={13} className="shrink-0" /><span className="truncate">{st.label}</span>
              </div>
              {loading ? <SkeletonBlock className="h-7 w-24 mt-1.5" /> : (
                <div className="mt-1 text-[22px] font-semibold tabular-nums leading-tight" style={{ color: "var(--text-1)" }}>{mins(st.value)}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// A card around one chart; hands the chart its measured width (the date axes
// thin their labels to it) and holds the height while the figures load.
function ChartCard({ icon, title, subtitle, loading, className = "", children }) {
  const [ref, width] = useElementWidth();
  return (
    <section className={`rounded-2xl min-w-0 ${className}`} style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={icon} title={title} subtitle={subtitle} />
      <div ref={ref} className="px-2 pb-2" style={{ minHeight: CHART_H + 8 }}>
        {loading ? <SkeletonBlock className="mx-2 rounded-xl" style={{ height: CHART_H - 16 }} /> : children(width)}
      </div>
    </section>
  );
}

// What every chart here shares: the card's surface, quiet grid, no toolbar.
function useBase() {
  const th = useChartTheme();
  return (extra = {}) => ({
    chart: {
      background: "transparent", toolbar: { show: false }, zoom: { enabled: false },
      animations: { enabled: false }, fontFamily: "inherit", ...extra.chart,
    },
    theme: th.chartTheme,
    grid: { borderColor: th.gridColor, strokeDashArray: 3, padding: { left: 6, right: 6 }, ...extra.grid },
    dataLabels: { enabled: false, ...extra.dataLabels },
    legend: { labels: { colors: th.legendColor }, fontSize: "11px", position: "top", horizontalAlign: "left", ...extra.legend },
    tooltip: { theme: th.tooltipTheme, ...extra.tooltip },
    states: { active: { filter: { type: "none" } } },
    // only the sections a chart sets: Apex reads `.colors` off each one it is handed
    ...(extra.plotOptions ? { plotOptions: extra.plotOptions } : {}),
    ...(extra.colors ? { colors: extra.colors } : {}),
    ...(extra.annotations ? { annotations: extra.annotations } : {}),
    xaxis: {
      ...extra.xaxis,
      labels: { style: { colors: th.labelColor, fontSize: "11px" }, rotate: 0, hideOverlappingLabels: true, ...extra.xaxis?.labels },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: {
      ...extra.yaxis,
      labels: { style: { colors: th.labelColor, fontSize: "11px" }, formatter: (v) => fmt(Math.round(v)), ...extra.yaxis?.labels },
    },
  });
}

// Asked → split → received, period by period.
function TrendBars({ t, rows, width }) {
  const base = useBase();
  const labels = rows.map((r) => r.label);
  const options = base({
    chart: { type: "bar" },
    colors: STAGES.map((k) => STAGE_COLORS[k]),
    plotOptions: { bar: { columnWidth: rows.length > 20 ? "80%" : "58%", borderRadius: 3, borderRadiusApplication: "end" } },
    xaxis: { categories: labels, tickAmount: ticksForWidth(width, labels.length, axisLabelPx(labels)) },
    tooltip: { shared: true, intersect: false },
  });
  const series = STAGES.map((k) => ({ name: t(`cflow.an.stage.${k}`), data: rows.map((r) => r[k]) }));
  return <ReactApexChart type="bar" height={CHART_H} options={options} series={series} />;
}

// The share split on time, each bar in its band's colour; the tick is the 95% the band calls green.
function OnTimeBars({ t, rows, width }) {
  const base = useBase();
  const labels = rows.map((r) => r.label);
  const data = rows.map((r) => r.on_time_pct);
  const options = base({
    chart: { type: "bar" },
    colors: [({ value }) => (onTimeTone(value) ? TONE_HEX[onTimeTone(value)] : "#94a3b8")],
    plotOptions: { bar: { columnWidth: rows.length > 20 ? "80%" : "52%", borderRadius: 3, borderRadiusApplication: "end" } },
    legend: { show: false },
    xaxis: { categories: labels, tickAmount: ticksForWidth(width, labels.length, axisLabelPx(labels)) },
    yaxis: { min: 0, max: 100, tickAmount: 4, labels: { formatter: (v) => `${Math.round(v)}%` } },
    tooltip: { y: { formatter: (v) => (v == null ? "—" : `${v}%`) } },
    annotations: { yaxis: [{ y: 95, borderColor: GREEN, strokeDashArray: 4, opacity: 0.7 }] },
  });
  return <ReactApexChart type="bar" height={CHART_H} options={options} series={[{ name: t("cflow.rq.onTime"), data }]} />;
}

// Which production hours carry the containers — the hour as «14:00».
function HourBars({ t, rows }) {
  const base = useBase();
  const options = base({
    chart: { type: "bar" },
    colors: [STAGE_COLORS.asked, STAGE_COLORS.given],
    plotOptions: { bar: { columnWidth: "62%", borderRadius: 3, borderRadiusApplication: "end" } },
    xaxis: { categories: rows.map((r) => span(r.hour).slice(0, 5)) },
    tooltip: {
      shared: true, intersect: false,
      x: { formatter: (_, o) => { const r = rows[o?.dataPointIndex]; return r ? `${span(r.hour)} · ${t("cflow.an.reqN").replace("{n}", r.requests)}` : ""; } },
    },
  });
  const series = [
    { name: t("cflow.an.stage.asked"), data: rows.map((r) => r.asked) },
    { name: t("cflow.an.stage.given"), data: rows.map((r) => r.given) },
  ];
  return <ReactApexChart type="bar" height={CHART_H} options={options} series={series} />;
}

// Each container type: asked → split → received, side by side.
function TypeBars({ t, rows }) {
  const base = useBase();
  const options = base({
    chart: { type: "bar" },
    colors: STAGES.map((k) => STAGE_COLORS[k]),
    plotOptions: { bar: { horizontal: true, barHeight: "68%", borderRadius: 2, borderRadiusApplication: "end" } },
    xaxis: { categories: rows.map((r) => t(`cflow.ct.${r.ctype}`)), labels: { formatter: (v) => fmt(Math.round(v)) } },
    yaxis: { labels: { formatter: (v) => v } },
    grid: { xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
    tooltip: { shared: true, intersect: false },
  });
  const series = STAGES.map((k) => ({ name: t(`cflow.an.stage.${k}`), data: rows.map((r) => r[k]) }));
  return <ReactApexChart type="bar" height={CHART_H} options={options} series={series} />;
}

// Every brigadir the period split containers to: how much, what arrived, how
// reliably and how fast they confirm. The bar under «Berilgan» is their share
// of the largest one, so the column reads as a chart.
function UnitsTable({ t, tl, rows, loading }) {
  const top = Math.max(1, ...rows.map((r) => r.given));
  return (
    <TableCard icon={UsersRound} title={t("cflow.an.units")} subtitle={t("cflow.an.unitsSub")} headSize="lg" maxHeight="420px"
      right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{rows.length}</span>}>
      <thead>
        <tr>
          <Th label={t("containers.brigadir")} />
          <Th label={t("cflow.rq.col.given")} hint={t("cflow.an.unitGivenHint")} />
          <Th label={t("cflow.rq.col.received")} align="right" />
          <Th label={t("cflow.rq.col.missing")} align="right" />
          <Th label={t("cflow.an.confirmedShort")} align="right" hint={t("cflow.an.confirmedHint")} />
          <Th label={t("cflow.an.confirmTime")} align="right" hint={t("cflow.an.step.recvHint")} />
          <Th label={t("cflow.an.remindedShort")} align="right" hint={t("cflow.an.remindedHint")} />
        </tr>
      </thead>
      <tbody>
        {loading ? Array.from({ length: 4 }).map((_, i) => (
          <tr key={i}><td colSpan={7} className="px-3 py-2"><SkeletonBlock className="h-5 w-full" /></td></tr>
        )) : !rows.length ? (
          <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{t("cflow.an.unitsNone")}</td></tr>
        ) : rows.map((u) => (
          <tr key={u.manager_id} className="text-sm">
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-1)" }}>
              {tl(u.unit) || "—"}{u.shift ? <span className="text-[11px]" style={{ color: "var(--text-3)" }}> · S{u.shift}</span> : null}
            </td>
            <td className="px-3 py-2 whitespace-nowrap">
              <span className="flex items-center gap-2">
                <span className="tabular-nums w-10 text-right shrink-0" style={{ color: "var(--text-1)" }}>{fmt(u.given)}</span>
                <span className="h-1.5 rounded-full shrink-0" aria-hidden
                  style={{ width: `${Math.max(3, Math.round((90 * u.given) / top))}px`, background: STAGE_COLORS.given }} />
              </span>
            </td>
            <td className="px-3 py-2 text-right tabular-nums" style={{ color: u.confirmed ? "var(--text-1)" : "var(--text-4)" }}>
              {u.confirmed ? fmt(u.received) : "—"}
            </td>
            <td className="px-3 py-2 text-right tabular-nums" style={{ color: u.missing > 0 ? "var(--status-bad)" : "var(--text-4)" }}>
              {u.confirmed ? fmt(u.missing) : "—"}
            </td>
            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap"
              style={{ color: u.confirm_pct === 100 ? "var(--status-ok)" : u.confirm_pct ? "var(--status-warn)" : "var(--status-bad)" }}
              title={`${u.confirmed} / ${u.splits}`}>
              {u.confirm_pct == null ? "—" : `${u.confirm_pct}%`}
            </td>
            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>
              {u.avg_confirm_min == null ? "—" : durText(t, u.avg_confirm_min)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums" style={{ color: u.reminded ? "var(--status-warn)" : "var(--text-4)" }}>
              {fmt(u.reminded)}
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

// Why containers fell short — at the split (logistics gave fewer than asked)
// and at the line (a brigadir received fewer than sent).
function ReasonsCard({ t, a, loading }) {
  const partsOf = (m) => REASONS.map((k, i) => ({ key: k, label: t(`cflow.reason.${k}`), value: m?.[k] ?? 0, color: CATEGORY_COLORS[i] }));
  const blocks = [
    { key: "split", title: t("cflow.an.whySplit"), parts: partsOf(a?.reasons) },
    { key: "recv", title: t("cflow.an.whyRecv"), parts: partsOf(a?.receipt_reasons) },
  ];
  return (
    <section className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={Split} title={t("cflow.an.why")} subtitle={t("cflow.an.whySub")} />
      <div className="px-4 pb-4 flex flex-col gap-4">
        {blocks.map((b) => {
          const total = b.parts.reduce((x, p) => x + p.value, 0);
          return (
            <div key={b.key} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium" style={{ color: "var(--text-2)" }}>{b.title}</span>
                <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{loading ? "" : total}</span>
              </div>
              {loading ? <SkeletonBlock className="h-8 w-full" /> : total ? (
                <>
                  <SplitBar parts={b.parts} height={8} />
                  <SplitLegend parts={b.parts.filter((p) => p.value > 0)} />
                </>
              ) : (
                <p className="text-xs" style={{ color: "var(--status-ok)" }}>{t("cflow.an.whyNone")}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// «Kerak va olingan» (2026-11-17, the operator: «a table — for a day, how many
// they have to get and how many they actually got»; filters and a clearer read
// the same day: «we need a filter here, and it should be easy to see»): one
// row per brigadir per day — the day's need on «Konteynerlar», what logistics
// split to them, what they confirmed on «Qabul», the difference and the share
// received. It opens on the LATEST day of the period, so each brigadir is one
// row; the filter panel picks another day or all of them, a shift, a
// brigadir, a state. The strip above the rows sums what the filter keeps.
// What was split and is not confirmed yet stands apart, so a row still
// waiting never reads as a shortfall. Per type in the row's hover.
const NG_PAGE = 30;
const ngTone = (pct) => (pct == null ? null : vypTone(pct / 100));
const NG_STATES = ["short", "full", "waiting", "none"];
// a row's state, the one the chip prints and the filter picks
const ngState = (r) => {
  if (!r.need) return null;
  if (r.received >= r.need) return "full";
  if (r.unconfirmed > 0) return "waiting";
  if (!r.given) return "none";
  return "short";
};
const NG_TONE = { full: "ok", waiting: "warn", short: "bad", none: "idle" };
const dayLabel = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const NG_SORT = {
  day: (r) => r.day, unit: (r) => r.unit || "", need: (r) => r.need, given: (r) => r.given,
  received: (r) => r.received, diff: (r) => r.diff, pct: (r) => r.pct ?? -1, unconfirmed: (r) => r.unconfirmed,
};

function NeedGotTable({ t, tl, rows, loading, period }) {
  const [dayPick, setDayPick] = useState(undefined);      // undefined = the latest day
  const [shift, setShift] = useState(null);
  const [unit, setUnit] = useState(null);
  const [state, setState] = useState(null);
  const [sort, setSort] = useState({ key: "need", dir: "desc" });
  const [page, setPage] = useState(1);
  const all = rows ?? [];
  const failed = !loading && rows === null;
  const days = useMemo(() => [...new Set(all.map((r) => r.day))].sort().reverse(), [all]);
  // a new period opens on its own latest day again
  useEffect(() => { setDayPick(undefined); }, [period]);
  const day = dayPick === undefined ? (days[0] ?? null) : dayPick;
  // back to page 1 on a filter, sort or period change — keyed on the VALUES, never on the rows
  useEffect(() => { setPage(1); }, [day, shift, unit, state, sort.key, sort.dir, period]);

  const inScope = (r) => (day == null || r.day === day) && (shift == null || r.shift === shift);
  const unitOpts = useMemo(() => {
    const seen = new Map();
    for (const r of all) if (inScope(r) && !seen.has(r.manager_id)) seen.set(r.manager_id, r);
    return [...seen.values()].map((r) => ({ value: r.manager_id, label: `${tl(r.unit) || "—"}${r.shift ? ` · S${r.shift}` : ""}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [all, tl, day, shift]); // eslint-disable-line react-hooks/exhaustive-deps
  const unitName = unitOpts.find((o) => o.value === unit)?.label
    ?? (() => { const r = all.find((x) => x.manager_id === unit); return r ? tl(r.unit) : ""; })();
  const shown = useMemo(() => {
    const keep = all.filter((r) => inScope(r) && (unit == null || r.manager_id === unit)
      && (state == null || ngState(r) === state));
    const val = NG_SORT[sort.key] ?? NG_SORT.need;
    const dir = sort.dir === "asc" ? 1 : -1;
    return keep.map((r) => ({ r, v: val(r) }))
      .sort((a, b) => (a.v < b.v ? -dir : a.v > b.v ? dir : (a.r.day < b.r.day ? 1 : a.r.day > b.r.day ? -1 : 0)))
      .map((x) => x.r);
  }, [all, day, shift, unit, state, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSort = (k) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === "desc" ? "asc" : "desc" }
    : { key: k, dir: k === "unit" || k === "day" ? "asc" : "desc" }));
  const tot = shown.reduce((s, r) => ({
    need: s.need + r.need, given: s.given + r.given, received: s.received + r.received,
    unconfirmed: s.unconfirmed + r.unconfirmed,
  }), { need: 0, given: 0, received: 0, unconfirmed: 0 });
  const totPct = tot.need ? Math.round((100 * tot.received) / tot.need) : null;
  const counts = Object.fromEntries(NG_STATES.map((k) => [k, all.filter((r) => inScope(r)
    && (unit == null || r.manager_id === unit) && ngState(r) === k).length]));
  const pageRows = shown.slice((page - 1) * NG_PAGE, page * NG_PAGE);
  const typeTitle = (r) => KEYS.filter((k) => r.types?.[k])
    .map((k) => `${t(`cflow.ct.${k}`)}: ${fmt(r.types[k].need)} → ${fmt(r.types[k].given)} → ${fmt(r.types[k].received)}`)
    .join("\n");

  const sections = [
    {
      key: "day", icon: CalendarDays, label: t("cflow.ng.f.day"),
      // always stated: the table shows ONE day unless told otherwise, and the
      // control must say which; its ✕ only when a pick moved it off the latest
      active: true,
      display: day == null ? t("cflow.ng.allDays") : dayPick === undefined ? `${dayLabel(day)} · ${t("cflow.ng.latest")}` : dayLabel(day),
      onClear: dayPick !== undefined ? () => setDayPick(undefined) : undefined,
      render: ({ close } = {}) => (
        <PickFilter close={close} value={day ?? "__all"} onChange={(v) => setDayPick(v === "__all" ? null : v)}
          opts={[{ value: "__all", label: t("cflow.ng.allDays") },
            ...days.map((d) => ({ value: d, label: d === days[0] ? `${dayLabel(d)} · ${t("cflow.ng.latest")}` : dayLabel(d) }))]} />
      ),
    },
    {
      key: "shift", icon: Layers, label: t("filter.shift"),
      active: shift != null, display: shift != null ? `S${shift}` : "",
      onClear: () => setShift(null),
      render: () => (
        <SegmentedToggle fill value={shift} onChange={setShift} options={[[null, t("filter.all")], [1, "S1"], [2, "S2"]]} />
      ),
    },
    {
      key: "unit", icon: UsersRound, label: t("containers.brigadir"),
      active: unit != null, display: unitName,
      onClear: () => setUnit(null),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close} value={unit ?? "__all"} onChange={(v) => setUnit(v === "__all" ? null : v)}
          opts={[{ value: "__all", label: t("cflow.ng.allUnits") }, ...unitOpts]} />
      ),
    },
    {
      key: "state", icon: ListFilter, label: t("cflow.ng.f.state"),
      active: state != null, display: state ? t(`cflow.ng.st.${state}`) : "",
      onClear: () => setState(null),
      render: ({ close } = {}) => (
        <PickFilter close={close} value={state ?? "__all"} onChange={(v) => setState(v === "__all" ? null : v)}
          opts={[{ value: "__all", label: t("cflow.ng.all") },
            ...NG_STATES.map((k) => ({ value: k, label: `${t(`cflow.ng.st.${k}`)} · ${counts[k]}`, title: t(`cflow.ng.st.${k}`) }))]} />
      ),
    },
  ];

  const stat = (label, value, color, hint) => (
    <div className="min-w-0 rounded-xl px-3 py-2" title={hint} style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide truncate" style={{ color: "var(--text-3)" }}>{label}</div>
      <div className="text-[18px] font-semibold tabular-nums leading-tight mt-0.5" style={{ color: color ?? "var(--text-1)" }}>
        {loading ? "…" : value}
      </div>
    </div>
  );
  const COLS = 9;
  return (
    <div className="flex flex-col gap-2">
      <TableCard icon={CalendarCheck} title={t("cflow.ng.title")} subtitle={t("cflow.ng.sub")} headSize="lg" maxHeight="600px"
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{loading ? "" : shown.length}</span>}
        toolbar={(
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* the day is always stated, so «clear all» counts only what a person picked */}
              <FilterPanel sections={sections} chipsWrap
                activeCount={[dayPick !== undefined, shift != null, unit != null, state != null].filter(Boolean).length}
                anyActive={dayPick !== undefined || shift != null || unit != null || state != null}
                onClearAll={() => { setDayPick(undefined); setShift(null); setUnit(null); setState(null); }} />
            </div>
            {/* what the filter keeps, summed — always drawn, so a filter change never moves the rows */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {stat(t("cflow.ng.col.need"), fmt(tot.need), null, t("cflow.ng.hint.need"))}
              {stat(t("cflow.ng.col.given"), fmt(tot.given), null, t("cflow.ng.hint.given"))}
              {stat(t("cflow.ng.col.received"), fmt(tot.received), null, t("cflow.ng.hint.received"))}
              {stat(t("cflow.ng.col.diff"), `${tot.received - tot.need > 0 ? "+" : ""}${fmt(tot.received - tot.need)}`,
                tot.received - tot.need < 0 ? "var(--status-bad)" : "var(--status-ok)", t("cflow.ng.hint.diff"))}
              <div className="min-w-0 rounded-xl px-3 py-2" title={t("cflow.ng.hint.pct")}
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
                <div className="text-[11px] font-semibold uppercase tracking-wide truncate" style={{ color: "var(--text-3)" }}>{t("cflow.ng.col.pct")}</div>
                <div className="text-[18px] font-semibold tabular-nums leading-tight mt-0.5"
                  style={{ color: ngTone(totPct) ? `var(--status-${ngTone(totPct)})` : "var(--text-1)" }}>
                  {loading ? "…" : totPct == null ? "—" : `${totPct}%`}
                </div>
                <div className="mt-1.5"><Meter value={totPct} color={ngTone(totPct) ? TONE_HEX[ngTone(totPct)] : "#94a3b8"} label={t("cflow.ng.col.pct")} height={4} /></div>
              </div>
              {stat(t("cflow.ng.col.waiting"), fmt(tot.unconfirmed), tot.unconfirmed ? "var(--status-warn)" : null, t("cflow.ng.hint.waiting"))}
            </div>
          </div>
        )}>
        <thead>
          <tr>
            <Th label={t("cflow.rep.day")} k="day" sort={sort} onSort={onSort} />
            <Th label={t("containers.brigadir")} k="unit" sort={sort} onSort={onSort} />
            <Th label={t("cflow.ng.f.state")} />
            <Th label={t("cflow.ng.col.need")} align="right" hint={t("cflow.ng.hint.need")} k="need" sort={sort} onSort={onSort} />
            <Th label={t("cflow.ng.col.given")} align="right" hint={t("cflow.ng.hint.given")} k="given" sort={sort} onSort={onSort} />
            <Th label={t("cflow.ng.col.received")} align="right" hint={t("cflow.ng.hint.received")} k="received" sort={sort} onSort={onSort} />
            <Th label={t("cflow.ng.col.diff")} align="right" hint={t("cflow.ng.hint.diff")} k="diff" sort={sort} onSort={onSort} />
            <Th label={t("cflow.ng.col.pct")} hint={t("cflow.ng.hint.pct")} k="pct" sort={sort} onSort={onSort} />
            <Th label={t("cflow.ng.col.waiting")} align="right" hint={t("cflow.ng.hint.waiting")} k="unconfirmed" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {loading ? Array.from({ length: 6 }).map((_, i) => (
            <tr key={i}><td colSpan={COLS} className="px-3 py-2"><SkeletonBlock className="h-5 w-full" /></td></tr>
          )) : failed ? (
            <tr><td colSpan={COLS} className="px-3 py-6 text-center" style={{ color: "var(--status-bad)" }}>{t("cflow.ng.failed")}</td></tr>
          ) : !shown.length ? (
            <tr><td colSpan={COLS} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>
              {t(state || unit != null || shift != null ? "cflow.ng.noneFilter" : "cflow.ng.none")}
            </td></tr>
          ) : pageRows.map((r) => {
            const tone = ngTone(r.pct);
            const color = tone ? TONE_HEX[tone] : "#94a3b8";
            const st = ngState(r);
            return (
              <tr key={`${r.day}|${r.manager_id}`} className="text-sm" title={typeTitle(r)}>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{dayLabel(r.day)}</td>
                <td className="px-3 py-2 whitespace-nowrap max-w-[240px] truncate" style={{ color: "var(--text-1)" }}>
                  {tl(r.unit) || "—"}{r.shift ? <span className="text-[11px]" style={{ color: "var(--text-3)" }}> · S{r.shift}</span> : null}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {st ? <Chip tone={NG_TONE[st]}>{t(`cflow.ng.st.${st}`)}</Chip> : <span style={{ color: "var(--text-4)" }}>—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: r.need ? "var(--text-1)" : "var(--text-4)" }}>{fmt(r.need)}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: r.given ? "var(--text-1)" : "var(--text-4)" }}>{fmt(r.given)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: r.received ? "var(--text-1)" : "var(--text-4)" }}>{fmt(r.received)}</td>
                <td className="px-3 py-2 text-right tabular-nums"
                  style={{ color: !r.need ? "var(--text-4)" : r.diff < 0 ? "var(--status-bad)" : "var(--status-ok)" }}>
                  {r.need ? `${r.diff > 0 ? "+" : ""}${fmt(r.diff)}` : "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.pct == null ? <span style={{ color: "var(--text-4)" }}>—</span> : (
                    <span className="flex items-center gap-2">
                      <span className="w-16 h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: "var(--bg-inner)" }} aria-hidden>
                        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, r.pct)}%`, background: color }} />
                      </span>
                      <span className="tabular-nums text-[13px] font-medium w-10 text-right" style={{ color: tone ? `var(--status-${tone})` : "var(--text-2)" }}>
                        {r.pct}%
                      </span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: r.unconfirmed ? "var(--status-warn)" : "var(--text-4)" }}>
                  {fmt(r.unconfirmed)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
      <Pagination page={page} pageCount={Math.ceil(shown.length / NG_PAGE)} total={shown.length} pageSize={NG_PAGE} onPage={setPage} />
    </div>
  );
}
