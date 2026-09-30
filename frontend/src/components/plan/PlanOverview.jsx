import { useEffect, useMemo, useState } from "react";
import {
  Activity, CalendarRange, Users, Package, Boxes, ArrowRight, TrendingDown, Gauge,
} from "lucide-react";
import KpiDeltaCard from "../ui/KpiDeltaCard";
import KPICard from "../ui/KPICard";
import SegmentedToggle from "../ui/SegmentedToggle";
import { ChartCard, Chart, NoChart } from "../ui/AnalysisBoard";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { useChartTheme } from "../../hooks/useChartTheme";
import useElementWidth from "../../hooks/useElementWidth";
import { usePersistentState } from "../../hooks/usePersistentState";
import { ticksForWidth, axisLabelPx } from "../../utils/chartRange";
import { surnameInitial } from "../../utils/personName";
import { activeBands, TONE_HEX } from "../../utils/statusBands";
import {
  ratio, pctOf, fmtPct, fmtHours, toneOf, toneHex, ddmm, weekdayOf, tipBox, fill,
  prodDayStats, fmtDelta,
} from "./planUtil";

const C_PLAN = "#94a3b8";   // the target — a neutral reference, never a status
const C_FACT = "#3b82f6";   // what was made — a series identity, not a verdict
const C_LINE = "#C8973F";   // the one metric on the % chart (single-metric accent)
const TOP_N = 8;

// A bullet bar: the fill is the figure in its band's colour, the tick is 100%
// of the plan. Scaled so 120% is the full track — over-fulfilment stays
// visible without one outlier flattening every other row.
function Bullet({ r }) {
  const cap = 1.2;
  const w = r == null ? 0 : Math.max(0, Math.min(r, cap)) / cap * 100;
  return (
    <div className="relative h-2 rounded-full" style={{ background: "var(--bg-inner)" }}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w}%`, background: toneHex(toneOf(r)) }} />
      <div className="absolute -top-[3px] -bottom-[3px] w-[2px] rounded" style={{ left: `${100 / cap}%`, background: "var(--text-3)" }} />
    </div>
  );
}

// One row of a ranked card: what it is, one line saying where, the figure the
// row is ranked by, and the bullet bar.
function RankRow({ label, title, sub, r, right, onClick }) {
  const body = (
    <>
      <div className="flex items-baseline gap-2 mb-1 min-w-0">
        <span className="flex-1 truncate text-xs font-medium" style={{ color: "var(--text-1)" }} title={title || label}>{label}</span>
        <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: toneHex(toneOf(r)) }}>{fmtPct(r)}</span>
      </div>
      <Bullet r={r} />
      <div className="flex items-center justify-between gap-2 mt-1 text-[11px]" style={{ color: "var(--text-4)" }}>
        <span className="truncate min-w-0">{sub}</span>
        <span className="flex-shrink-0 tabular-nums">{right}</span>
      </div>
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className="block w-full text-left rounded-lg px-2 py-1.5 -mx-2 hover:bg-[var(--bg-inner)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]">{body}</button>
    : <div className="px-2 py-1.5 -mx-2">{body}</div>;
}

function RankCard({ icon, title, subtitle, right, rows, empty, onAll, allLabel }) {
  return (
    <ChartCard icon={icon} title={title} subtitle={subtitle} right={right}>
      <div className="px-4 py-3 flex-1 flex flex-col">
        {rows.length ? <div className="space-y-1.5">{rows}</div> : <NoChart height={200} text={empty} />}
        {onAll && (
          <button type="button" onClick={onAll}
            className="mt-3 self-start inline-flex items-center gap-1 text-xs font-medium rounded-md px-1 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
            style={{ color: "var(--brand-text)" }}>
            {allLabel} <ArrowRight size={12} />
          </button>
        )}
      </div>
    </ChartCard>
  );
}

export default function PlanOverview({ data, chartData, unitName, cellById, onTab }) {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const { gridColor, labelColor, chartTheme } = useChartTheme();
  const [trendMode, setTrendMode] = usePersistentState("plan_trend_mode", "pct");
  const [unitSort, setUnitSort] = usePersistentState("plan_unit_rank", "pct");
  const [trendRef, trendW] = useElementWidth();
  const { ok } = activeBands().compl;

  // Charts mount once their grid cell has settled (the Concerns pattern), so
  // Apex measures its final width once. This view mounts only once its data
  // is in, so two frames after mount is the moment.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);

  const T = data.totals || {};
  const P = data.prev;
  const r = ratio(T.actual, T.plan);
  const pr = P ? ratio(P.actual, P.plan) : null;

  // ── KPI figures ───────────────────────────────────────────────────────────
  const units = data.units || [];
  const counted = units.filter((u) => u.plan > 0);
  const band = { ok: 0, warn: 0, bad: 0 };
  counted.forEach((u) => { band[toneOf(ratio(u.actual, u.plan)) || "bad"] += 1; });
  const prods = data.products || [];
  const planned = prods.filter((p) => p.plan > 0);
  const prodShort = planned.filter((p) => pctOf(ratio(p.actual, p.plan)) < ok).length;
  const prodZero = planned.filter((p) => p.actual <= 0).length;
  const dailyR = (data.trend || []).map((d) => (d.plan > 0 ? ratio(d.actual, d.plan) * 100 : null));
  const dailyShort = (data.trend || []).map((d) => (d.plan > 0 ? d.short / 60 : null));

  const dPp = r != null && pr != null ? Math.round((r - pr) * 1000) / 10 : null;
  const dShort = P ? Math.round((T.short - P.short) / 60) : null;
  const prevLabel = P?.partial ? t("plan.kpi.prevPartial") : t("plan.kpi.prev");

  // ── trend (the padded ≥7-day window) ──────────────────────────────────────
  const tr = chartData?.trend || data.trend || [];
  const cats = tr.map((d) => ddmm(d.date));
  const tickAmount = ticksForWidth(trendW, cats.length, axisLabelPx(cats));
  const tipFor = (i) => {
    const d = tr[i];
    if (!d) return "";
    const rr = ratio(d.actual, d.plan);
    return tipBox(`${ddmm(d.date)} · ${t(`cal.d${weekdayOf(d.date)}`)}`, [
      [t("plan.fulfil"), rr != null ? `${pctOf(rr)}%` : "—", rr != null ? toneHex(toneOf(rr)) : null],
      [t("plan.plan"), `${fmtHours(d.plan)} ${t("plan.h")}`, C_PLAN],
      [t("plan.fact"), `${fmtHours(d.actual)} ${t("plan.h")}`, C_FACT],
      d.short > 0 ? [t("plan.kpi.shortfall"), `${fmtHours(d.short)} ${t("plan.h")}`] : null,
      [t("plan.tip.units"), String(d.units)],
      d.no_fact ? [t("plan.legend.nf"), fill(t("plan.tip.unitsN"), { n: d.no_fact })] : null,
    ]);
  };
  const pctVals = tr.map((d) => (d.plan > 0 && d.actual >= 0 && d.units > 0 ? Math.round(ratio(d.actual, d.plan) * 1000) / 10 : null));
  // A LINE may zoom (a bar may not): the band edge stays in view, and the
  // axis steps by 10 so its ticks read 70 · 80 · 90 …, never 22 · 44 · 66.
  const pctKnown = pctVals.filter((v) => v != null);
  const maxPct = Math.ceil(Math.max(ok + 5, Math.max(0, ...pctKnown) + 5) / 10) * 10;
  const minPct = Math.max(0, Math.floor(Math.min(ok - 15, Math.min(maxPct, ...pctKnown) - 5) / 10) * 10);
  const baseOpts = {
    chart: { background: "transparent", toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, parentHeightOffset: 0 },
    theme: chartTheme,
    grid: { borderColor: gridColor, strokeDashArray: 0, padding: { left: 6, right: 10 } },
    xaxis: {
      categories: cats, tickAmount,
      labels: { rotate: 0, rotateAlways: false, hideOverlappingLabels: true, style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { color: gridColor }, axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    legend: { show: false },
    dataLabels: { enabled: false },
    tooltip: { custom: ({ dataPointIndex }) => tipFor(dataPointIndex) },
  };
  const pctOpts = {
    ...baseOpts,
    chart: { ...baseOpts.chart, type: "line" },
    stroke: { curve: "straight", width: 2 },
    colors: [C_LINE],
    markers: {
      size: 4, strokeWidth: 0, hover: { sizeOffset: 2 },
      discrete: pctVals.map((v, i) => (v == null ? null : {
        seriesIndex: 0, dataPointIndex: i, size: 4, strokeColor: "transparent",
        fillColor: toneHex(toneOf(v / 100)),
      })).filter(Boolean),
    },
    yaxis: { min: minPct, max: maxPct, tickAmount: Math.max(2, Math.min(8, (maxPct - minPct) / 10)), labels: { style: { colors: labelColor, fontSize: "10px" }, formatter: (v) => `${Math.round(v)}%` } },
    annotations: {
      yaxis: [{
        y: ok, borderColor: TONE_HEX.ok, strokeDashArray: 4,
        label: { text: `${ok}%`, position: "left", textAnchor: "start", offsetX: 4, borderWidth: 0,
          style: { color: TONE_HEX.ok, background: "transparent", fontSize: "10px" } },
      }],
    },
  };
  const hoursOpts = {
    ...baseOpts,
    chart: { ...baseOpts.chart, type: "bar" },
    colors: [C_PLAN, C_FACT],
    plotOptions: { bar: { columnWidth: tr.length > 20 ? "80%" : "60%", borderRadius: 2 } },
    stroke: { show: true, width: 1, colors: ["transparent"] },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" }, formatter: (v) => Math.round(v).toLocaleString("ru-RU") } },
  };
  const trendHasData = tr.some((d) => d.plan > 0);

  // ── by weekday (the period itself) ────────────────────────────────────────
  const wd = useMemo(() => {
    const acc = Array.from({ length: 7 }, () => ({ plan: 0, actual: 0, days: 0 }));
    (data.trend || []).forEach((d) => {
      if (!(d.plan > 0) || !d.units) return;
      const a = acc[weekdayOf(d.date)];
      a.plan += d.plan; a.actual += d.actual; a.days += 1;
    });
    return acc.map((a, i) => ({ ...a, i, r: ratio(a.actual, a.plan) }));
  }, [data.trend]);
  const wdDays = (data.days || []).length;
  const wdVals = wd.map((a) => (a.r == null ? null : Math.round(a.r * 1000) / 10));
  const wdOpts = {
    chart: { type: "bar", background: "transparent", toolbar: { show: false }, animations: { enabled: false }, parentHeightOffset: 0 },
    theme: chartTheme,
    plotOptions: { bar: { distributed: true, columnWidth: "58%", borderRadius: 3, dataLabels: { position: "top" } } },
    colors: wd.map((a) => (a.r == null ? "#94a3b8" : TONE_HEX[toneOf(a.r)] || "#94a3b8")),
    dataLabels: {
      enabled: true, offsetY: -16, formatter: (v) => (v == null ? "" : `${Math.round(v)}%`),
      style: { fontSize: "10px", fontWeight: 600, colors: ["var(--text-2)"] },
    },
    xaxis: {
      categories: wd.map((a) => t(`cal.d${a.i}`)),
      labels: { style: { colors: labelColor, fontSize: "11px" } },
      axisBorder: { color: gridColor }, axisTicks: { show: false },
    },
    yaxis: { min: 0, max: Math.max(110, ...wdVals.filter((v) => v != null).map((v) => Math.ceil(v / 10) * 10)), show: false },
    grid: { borderColor: gridColor, yaxis: { lines: { show: false } } },
    legend: { show: false },
    annotations: { yaxis: [{ y: ok, borderColor: TONE_HEX.ok, strokeDashArray: 4 }] },
    tooltip: {
      custom: ({ dataPointIndex }) => {
        const a = wd[dataPointIndex];
        if (!a || !a.days) return tipBox(t(`cal.d${dataPointIndex}`), [[t("plan.legend.none"), ""]]);
        return tipBox(t(`cal.d${a.i}`), [
          [t("plan.fulfil"), fmtPct(a.r), toneHex(toneOf(a.r))],
          [t("plan.plan"), `${fmtHours(a.plan)} ${t("plan.h")}`],
          [t("plan.fact"), `${fmtHours(a.actual)} ${t("plan.h")}`],
          [t("plan.weekday.days"), String(a.days)],
        ]);
      },
    },
  };

  // ── ranked cards ──────────────────────────────────────────────────────────
  const unitRank = [...counted].map((u) => ({ ...u, r: ratio(u.actual, u.plan) }))
    .sort(unitSort === "short" ? (a, b) => b.short - a.short : (a, b) => a.r - b.r)
    .slice(0, TOP_N);
  const prodRank = prods.filter((p) => p.short > 0).slice(0, TOP_N);   // server order: shortfall first
  const cellRank = (data.cell_rows || []).filter((c) => c.short > 0).slice(0, TOP_N);

  const hours = (m) => `${fmtHours(m)} ${t("plan.h")}`;

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4">
        <KpiDeltaCard
          label={t("plan.kpi.fulfil")}
          tooltip={fill(t("plan.kpi.fulfilTip"), { ok })}
          value={fmtPct(r)}
          color={r != null ? toneHex(toneOf(r)) : undefined}
          sub={`${t("plan.fact")} ${hours(T.actual)} · ${t("plan.plan")} ${hours(T.plan)}`}
          prevLabel={prevLabel}
          prevValue={pr != null ? fmtPct(pr) : "—"}
          delta={dPp ?? 0}
          deltaText={dPp != null ? `${fmtDelta(dPp)} ${t("plan.pp")}` : null}
          higherIsBetter
          trend={dailyR}
        />
        <KpiDeltaCard
          label={t("plan.kpi.shortfall")}
          tooltip={t("plan.kpi.shortfallTip")}
          value={hours(T.short)}
          sub={T.plan > 0 ? fill(t("plan.kpi.shortOfPlan"), { p: Math.round((100 * T.short) / T.plan) }) : null}
          prevLabel={prevLabel}
          prevValue={P ? hours(P.short) : "—"}
          delta={dShort ?? 0}
          deltaText={dShort != null && dShort !== 0 ? `${dShort > 0 ? "+" : "−"}${Math.abs(dShort).toLocaleString("ru-RU")} ${t("plan.h")}` : null}
          higherIsBetter={false}
          trend={dailyShort}
        />
        <KPICard
          label={fill(t("plan.kpi.units"), { ok })}
          tooltip={fill(t("plan.kpi.unitsTip"), { ok, warn: activeBands().compl.warn })}
          icon={Users}
          value={`${band.ok} / ${counted.length}`}
          sub={fill(t("plan.kpi.unitsSub"), { w: band.warn, b: band.bad })}
        />
        <KPICard
          label={t("plan.kpi.products")}
          tooltip={fill(t("plan.kpi.productsTip"), { ok })}
          icon={Package}
          color={prodShort ? TONE_HEX.bad : TONE_HEX.ok}
          value={`${prodShort} / ${planned.length}`}
          sub={prodZero ? fill(t("plan.kpi.productsSub"), { z: prodZero }) : t("plan.kpi.productsNoZero")}
        />
      </div>

      {/* ── trend + weekdays ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <ChartCard
          className="lg:col-span-2"
          icon={Activity}
          title={t("plan.trend.title")}
          subtitle={trendMode === "pct" ? fill(t("plan.trend.subPct"), { ok }) : t("plan.trend.subHours")}
          right={(
            <SegmentedToggle size="sm" value={trendMode} onChange={setTrendMode}
              options={[["pct", t("plan.trend.modePct")], ["hours", t("plan.trend.modeHours")]]} />
          )}
        >
          <div ref={trendRef} className="px-2 pt-2 pb-1 apx-bare-tip">
            {!trendHasData
              ? <NoChart height={280} text={t("plan.empty.title")} />
              : trendMode === "pct"
                ? <Chart ready={ready} height={280} type="line" options={pctOpts}
                    series={[{ name: t("plan.fulfil"), data: pctVals }]} />
                : <Chart ready={ready} height={280} type="bar" options={hoursOpts}
                    series={[
                      { name: t("plan.plan"), data: tr.map((d) => Math.round((d.plan / 60) * 10) / 10) },
                      { name: t("plan.fact"), data: tr.map((d) => Math.round((d.actual / 60) * 10) / 10) },
                    ]} />}
            {trendMode === "hours" && trendHasData && (
              <div className="flex items-center justify-center gap-4 pb-2 text-[11px]" style={{ color: "var(--text-3)" }}>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C_PLAN }} />{t("plan.plan")}</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C_FACT }} />{t("plan.fact")}</span>
              </div>
            )}
          </div>
        </ChartCard>

        <ChartCard icon={CalendarRange} title={t("plan.weekday.title")} subtitle={t("plan.weekday.sub")}>
          <div className="px-2 pt-2 pb-1 apx-bare-tip">
            {wdDays < 7
              ? <NoChart height={280} text={t("plan.weekday.short")} />
              : !wd.some((a) => a.days)
                ? <NoChart height={280} text={t("plan.empty.title")} />
                : <Chart ready={ready} height={280} type="bar" options={wdOpts}
                    series={[{ name: t("plan.fulfil"), data: wdVals }]} />}
          </div>
        </ChartCard>
      </div>

      {/* ── who, what, where ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
        <RankCard
          icon={Gauge}
          title={t("plan.top.units")}
          subtitle={unitSort === "short" ? t("plan.top.unitsSubShort") : t("plan.top.unitsSub")}
          right={(
            <SegmentedToggle size="sm" value={unitSort} onChange={setUnitSort}
              options={[["pct", t("plan.top.sortPct")], ["short", t("plan.top.sortShort")]]} />
          )}
          rows={unitRank.map((u) => (
            <RankRow key={u.manager_id} label={tl(u.name)} r={u.r}
              sub={u.shift ? `${t("filter.shift")} ${u.shift}` : ""}
              right={`${t("plan.kpi.shortfall")}: ${hours(u.short)}`}
              onClick={() => onTab("units")} />
          ))}
          empty={t("plan.empty.title")}
          onAll={() => onTab("units")}
          allLabel={t("plan.top.all")}
        />
        <RankCard
          icon={Package}
          title={t("plan.top.products")}
          subtitle={t("plan.top.productsSub")}
          rows={prodRank.map((p) => {
            const st = prodDayStats(p.daily);
            return (
              <RankRow key={p.id} label={tx(p.name)} title={`${tx(p.name)}${p.code ? ` · ${p.code}` : ""}`}
                r={ratio(p.actual, p.plan)}
                sub={`${surnameInitial(tl(unitName(p.manager_id)))} · ${fill(t("plan.daysShort"), { s: st.short, n: st.planned })}`}
                right={`−${hours(p.short)}`}
                onClick={() => onTab("products")} />
            );
          })}
          empty={t("plan.top.noShort")}
          onAll={() => onTab("products")}
          allLabel={t("plan.top.all")}
        />
        <RankCard
          icon={Boxes}
          title={t("plan.top.cells")}
          subtitle={t("plan.top.cellsSub")}
          rows={cellRank.map((c) => {
            const cell = c.cell_id != null ? cellById.get(c.cell_id) : null;
            const label = cell ? cell.code : `${t("plan.noCell")} · ${surnameInitial(tl(unitName(c.manager_id)))}`;
            const lead = cell?.leader ? surnameInitial(tl(cell.leader)) : (cell ? t("plan.noLeader") : t("plan.noCellHint"));
            return (
              <RankRow key={c.key} label={label} r={ratio(c.actual, c.plan)}
                sub={lead} right={`−${hours(c.short)}`} onClick={() => onTab("cells")} />
            );
          })}
          empty={t("plan.top.noShort")}
          onAll={() => onTab("cells")}
          allLabel={t("plan.top.all")}
        />
      </div>

      {/* How the numbers are made — one line, so nobody has to guess. */}
      <p className="text-[11px] leading-relaxed flex items-start gap-1.5" style={{ color: "var(--text-3)" }}>
        <TrendingDown size={12} className="mt-0.5 flex-shrink-0" />
        {fill(t("plan.method"), { ok })}
      </p>
    </div>
  );
}
