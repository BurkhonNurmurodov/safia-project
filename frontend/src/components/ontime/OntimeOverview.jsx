import { useEffect, useMemo, useState } from "react";
import { Activity, Layers, Boxes, Package, ArrowRight, Sigma, Truck } from "lucide-react";
import KpiDeltaCard from "../ui/KpiDeltaCard";
import KPICard from "../ui/KPICard";
import SegmentedToggle from "../ui/SegmentedToggle";
import { ChartCard, Chart, NoChart } from "../ui/AnalysisBoard";
import { useChartTheme } from "../../hooks/useChartTheme";
import useElementWidth from "../../hooks/useElementWidth";
import { usePersistentState } from "../../hooks/usePersistentState";
import { ticksForWidth, axisLabelPx } from "../../utils/chartRange";
import { TONE_HEX } from "../../utils/statusBands";
import { useTranslit } from "../../utils/transliterate";
import { useLang } from "../../context/LangContext";
import {
  useOT, fill, ratio, pctOf, fmtPct, toneOf, toneHex, okEdge, waveRatio, fmtQty, fmtDelta,
  ddmm, weekdayOf, tipBox, windowText, commonWindow, useGroupName, fmtDur,
} from "./ontimeUtil";
import { DelayBands, DelayTrend } from "./OntimeDelay";

const C_LINE = "#C8973F";   // the one metric on the chart (single-metric accent)
const TOP_N = 8;

// The share as a bar on a 0–100% track, in its band's colour. On time cannot
// pass 100% (the sheet caps every row), so the track is the whole order.
function Bar({ r }) {
  const w = r == null ? 0 : Math.max(0, Math.min(1, r)) * 100;
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: toneHex(toneOf(r)) }} />
    </div>
  );
}

// A wave's figure as a small chip — «1-z 96%» in its band's ink.
export function WaveChip({ w, r, T, title }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] tabular-nums whitespace-nowrap" title={title}>
      <span style={{ color: "var(--text-4)" }}>{fill(T.waveShort, { n: w })}</span>
      <b className="font-semibold" style={{ color: r == null ? "var(--text-4)" : toneHex(toneOf(r)) }}>{fmtPct(r)}</b>
    </span>
  );
}

function Row({ label, title, r, sub, right, chips, onClick, ariaLabel }) {
  const body = (
    <>
      <div className="flex items-baseline gap-2 mb-1 min-w-0">
        <span className="flex-1 truncate text-xs font-medium" style={{ color: "var(--text-1)" }} title={title || label}>{label}</span>
        {chips && <span className="hidden sm:inline-flex items-center gap-2.5 flex-shrink-0">{chips}</span>}
        <span className="text-xs font-bold tabular-nums flex-shrink-0 w-10 text-right" style={{ color: toneHex(toneOf(r)) }}>{fmtPct(r)}</span>
      </div>
      <Bar r={r} />
      <div className="flex items-center justify-between gap-2 mt-1 text-[11px]" style={{ color: "var(--text-3)" }}>
        <span className="truncate min-w-0">{sub}</span>
        {right && <span className="flex-shrink-0 tabular-nums">{right}</span>}
      </div>
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} aria-label={ariaLabel}
        className="block w-full text-left rounded-lg px-2 py-1.5 -mx-2 hover:bg-[var(--bg-inner)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]">{body}</button>
    : <div className="px-2 py-1.5 -mx-2">{body}</div>;
}

export default function OntimeOverview({ data, chartData, onGroup, onProduct, onTab }) {
  const T = useOT();
  const { t } = useLang();
  const { tx } = useTranslit();
  const gn = useGroupName();
  const { gridColor, labelColor, chartTheme } = useChartTheme();
  const [groupSort, setGroupSort] = usePersistentState("ontime_group_sort", "late");
  const [trendRef, trendW] = useElementWidth();
  const ok = okEdge();

  // Charts mount two frames after the view, so Apex measures its final width once.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);

  const Tot = data.totals || {};
  const P = data.prev;
  const r = ratio(Tot.ontime, Tot.demand);
  const pr = P ? ratio(P.ontime, P.demand) : null;
  const dPp = r != null && pr != null ? Math.round((r - pr) * 1000) / 10 : null;
  const pLate = P ? P.demand - P.ontime : null;
  const dLate = pLate != null ? Math.round(Tot.late - pLate) : null;

  const trend = data.trend || [];
  const dailyR = trend.map((d) => (d.demand > 0 ? ratio(d.ontime, d.demand) * 100 : null));
  const dailyLate = trend.map((d) => (d.demand > 0 ? d.demand - d.ontime : null));
  const ordered = trend.filter((d) => d.demand > 0);
  const daysShort = ordered.filter((d) => pctOf(ratio(d.ontime, d.demand)) < ok).length;
  const prods = data.products || [];
  const withOrders = prods.filter((p) => p.demand > 0);
  const prodLate = withOrders.filter((p) => p.late > 1e-6).length;
  const pcs = (q) => `${fmtQty(q)} ${T.pcs}`;

  // ── trend (the padded ≥7-day window) ──────────────────────────────────────
  const tr = chartData?.trend || trend;
  const cats = tr.map((d) => ddmm(d.date));
  const tickAmount = ticksForWidth(trendW, cats.length, axisLabelPx(cats));
  const vals = tr.map((d) => (d.demand > 0 ? Math.round(ratio(d.ontime, d.demand) * 1000) / 10 : null));
  const known = vals.filter((v) => v != null);
  const maxPct = 100;
  const minPct = Math.max(0, Math.floor(Math.min(ok - 15, ...(known.length ? known : [ok])) / 10) * 10);
  const tipFor = (i) => {
    const d = tr[i];
    if (!d) return "";
    const rr = ratio(d.ontime, d.demand);
    const head = `${ddmm(d.date)} · ${t(`cal.d${weekdayOf(d.date)}`)}`;
    if (!(d.demand > 0)) return tipBox(head, [[T.tipNoOrders, ""]]);
    const wv = Object.entries(d.waves || {}).map(([w, v]) => {
      const wr = waveRatio(v);
      return [fill(T.waveN, { n: w }), fmtPct(wr), toneHex(toneOf(wr))];
    });
    return tipBox(head, [
      [T.kOntime, fmtPct(rr), toneHex(toneOf(rr))],
      [T.tipOrdered, pcs(d.demand)],
      [T.tipLate, pcs(d.demand - d.ontime)],
      ...wv,
    ]);
  };
  const opts = {
    chart: { type: "line", background: "transparent", toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, parentHeightOffset: 0 },
    theme: chartTheme,
    grid: { borderColor: gridColor, padding: { left: 6, right: 10 } },
    stroke: { curve: "straight", width: 2 },
    colors: [C_LINE],
    markers: {
      size: 4, strokeWidth: 0, hover: { sizeOffset: 2 },
      discrete: vals.map((v, i) => (v == null ? null : {
        seriesIndex: 0, dataPointIndex: i, size: 4, strokeColor: "transparent",
        fillColor: toneHex(toneOf(v / 100)),
      })).filter(Boolean),
    },
    xaxis: {
      categories: cats, tickAmount,
      labels: { rotate: 0, rotateAlways: false, hideOverlappingLabels: true, style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { color: gridColor }, axisTicks: { show: false }, tooltip: { enabled: false },
    },
    yaxis: { min: minPct, max: maxPct, tickAmount: Math.max(2, Math.min(8, (maxPct - minPct) / 10)),
      labels: { style: { colors: labelColor, fontSize: "10px" }, formatter: (v) => `${Math.round(v)}%` } },
    annotations: { yaxis: [{ y: ok, borderColor: TONE_HEX.ok, strokeDashArray: 4,
      label: { text: `${ok}%`, position: "left", textAnchor: "start", offsetX: 4, borderWidth: 0,
        style: { color: TONE_HEX.ok, background: "transparent", fontSize: "10px" } } }] },
    legend: { show: false },
    dataLabels: { enabled: false },
    tooltip: { custom: ({ dataPointIndex }) => tipFor(dataPointIndex) },
  };
  const trendHasData = tr.some((d) => d.demand > 0);

  // ── groups ────────────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const g = [...(data.groups || [])].filter((x) => x.demand > 0);
    return groupSort === "pct"
      ? g.sort((a, b) => (a.mean ?? 2) - (b.mean ?? 2) || b.late - a.late)
      : g.sort((a, b) => b.late - a.late || (a.mean ?? 2) - (b.mean ?? 2));
  }, [data.groups, groupSort]);
  const top = prods.filter((p) => p.late > 1e-6).slice(0, TOP_N);

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4">
        <KpiDeltaCard
          label={T.kOntime}
          tooltip={T.kOntimeTip}
          value={fmtPct(r)}
          color={r != null ? toneHex(toneOf(r)) : undefined}
          sub={fill(T.kOntimeSub, { c: fmtQty(Tot.ontime), d: fmtQty(Tot.demand) })}
          prevLabel={T.prev}
          prevValue={pr != null ? fmtPct(pr) : "—"}
          delta={dPp ?? 0}
          deltaText={dPp != null ? `${fmtDelta(dPp)} ${T.pp}` : null}
          higherIsBetter
          trend={dailyR}
        />
        <KpiDeltaCard
          label={T.kLate}
          tooltip={T.kLateTip}
          value={pcs(Tot.late)}
          sub={Tot.demand > 0 ? fill(T.kLateSub, { p: Math.round((100 * Tot.late) / Tot.demand) }) : null}
          prevLabel={T.prev}
          prevValue={pLate != null ? pcs(pLate) : "—"}
          delta={dLate ?? 0}
          deltaText={dLate != null && dLate !== 0 ? `${dLate > 0 ? "+" : "−"}${fmtQty(Math.abs(dLate))}` : null}
          higherIsBetter={false}
          trend={dailyLate}
        />
        <KPICard
          label={T.kProducts}
          tooltip={T.kProductsTip}
          icon={Package}
          color={prodLate ? TONE_HEX.bad : TONE_HEX.ok}
          value={`${prodLate}`}
          sub={fill(T.kProductsSub, { n: withOrders.length })}
          onValueClick={prodLate ? () => onTab("products", "late") : undefined}
        />
        <KPICard
          label={fill(T.kDays, { ok })}
          tooltip={fill(T.kDaysTip, { ok })}
          icon={Activity}
          color={daysShort ? TONE_HEX.bad : TONE_HEX.ok}
          value={`${daysShort}`}
          sub={fill(T.kDaysSub, { n: ordered.length })}
          onValueClick={() => onTab("days")}
        />
      </div>

      {/* ── trend + waves ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <ChartCard className="lg:col-span-2" icon={Activity} title={T.trend} subtitle={fill(T.trendSub, { ok })}>
          <div ref={trendRef} className="px-2 pt-2 pb-1 apx-bare-tip">
            {!trendHasData
              ? <NoChart height={260} text={T.emptyTitle} />
              : <Chart ready={ready} height={260} type="line" options={opts} series={[{ name: T.kOntime, data: vals }]} />}
          </div>
        </ChartCard>

        <ChartCard icon={Truck} title={T.waves} subtitle={T.wavesSub}>
          <div className="px-4 py-3 space-y-2">
            {(data.waves || []).filter((w) => w.demand > 0).map((w) => {
              const wr = ratio(w.ontime, w.demand);
              const win = commonWindow(data.windows, w.wave);
              return (
                <Row key={w.wave}
                  label={fill(T.waveN, { n: w.wave })}
                  r={wr}
                  sub={win ? windowText(w.wave, win, T) : T.windowVaries}
                  right={w.delay?.avg_min != null
                    ? fill(T.wavesDelay, { q: pcs(w.late), a: fmtDur(w.delay.avg_min, T) })
                    : `${T.tipLate}: ${pcs(w.late)}`} />
              );
            })}
            {!(data.waves || []).some((w) => w.demand > 0) && <NoChart height={160} text={T.emptyTitle} />}
          </div>
        </ChartCard>
      </div>

      {/* ── how late the late quantity arrived ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <DelayTrend className="lg:col-span-2" trend={tr} ready={ready} />
        <DelayBands delay={data.delay} />
      </div>

      {/* ── groups + the products that cost most ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <ChartCard
          className="lg:col-span-2"
          icon={Layers}
          title={T.groups}
          subtitle={groupSort === "late" ? T.groupsSubLate : T.groupsSub}
          right={(
            <SegmentedToggle size="sm" value={groupSort} onChange={setGroupSort}
              options={[["late", T.sortLate], ["pct", T.sortPct]]} />
          )}
        >
          <div className="px-4 py-3 space-y-1.5">
            {groups.map((g) => {
              const chips = Object.entries(g.waves || {}).length > 1
                ? Object.entries(g.waves).map(([w, v]) => <WaveChip key={w} w={w} r={v} T={T} />)
                : null;
              return (
                <Row key={g.grp}
                  label={gn(g.grp)} r={g.mean} chips={chips}
                  sub={fill(T.groupLate, { q: fmtQty(g.late), n: g.materials })}
                  right={g.delay?.avg_min != null ? fill(T.groupDelay, { a: fmtDur(g.delay.avg_min, T) }) : null}
                  onClick={() => onGroup(g.grp)}
                  ariaLabel={`${gn(g.grp)} — ${T.groupOpen}`} />
              );
            })}
            {!groups.length && <NoChart height={200} text={T.emptyTitle} />}
          </div>
        </ChartCard>

        <ChartCard icon={Boxes} title={T.topProducts} subtitle={T.topProductsSub}>
          <div className="px-4 py-3 flex-1 flex flex-col">
            {top.length ? (
              <div className="space-y-1.5">
                {top.map((p) => (
                  <Row key={p.material}
                    label={tx(p.name) || p.material} title={`${tx(p.name)} · ${p.material}`}
                    r={ratio(p.ontime, p.demand)}
                    sub={gn(p.grp)}
                    right={`−${pcs(p.late)}`}
                    onClick={() => onProduct(p.material)} />
                ))}
              </div>
            ) : <NoChart height={200} text={T.noLate} />}
            <button type="button" onClick={() => onTab("products")}
              className="mt-3 self-start inline-flex items-center gap-1 text-xs font-medium rounded-md px-1 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand)]"
              style={{ color: "var(--brand-text)" }}>
              {T.allProducts} <ArrowRight size={12} />
            </button>
          </div>
        </ChartCard>
      </div>

      {/* How the numbers are made — one paragraph, so nobody has to guess. */}
      <p className="text-[11px] leading-relaxed flex items-start gap-1.5" style={{ color: "var(--text-3)" }}>
        <Sigma size={12} className="mt-0.5 flex-shrink-0" />
        <span>{T.method} {T.dlMethod}</span>
      </p>
    </div>
  );
}
