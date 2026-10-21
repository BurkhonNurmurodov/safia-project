import { useMemo } from "react";
import { Timer, CalendarClock, XCircle, Clock } from "lucide-react";
import { ChartCard, Chart, NoChart } from "../ui/AnalysisBoard";
import { useChartTheme } from "../../hooks/useChartTheme";
import useElementWidth from "../../hooks/useElementWidth";
import { ticksForWidth, axisLabelPx } from "../../utils/chartRange";
import { trendGrain, bucketTick, bucketTitle } from "../../utils/trendBuckets";
import { useLang } from "../../context/LangContext";
import {
  useOT, fill, fmtQty, ddmm, weekdayOf, tipBox, fmtDur, delayColors, DELAY_KEYS, NONE, WAIT,
} from "./ontimeUtil";

// «How late» — the late quantity read by WHEN it arrived: the server matches
// every late piece to the next production of its product after the wave's
// deadline (services/ontime.lateness) and hands back the pieces by delay band,
// plus what nothing covered within 24 h and what may still come. Two cards:
// the period's distribution, and the same bands stacked day by day.

const ALL_KEYS = [...DELAY_KEYS, NONE, WAIT];
const share = (q, of) => (of > 0 ? Math.round((100 * q) / of) : 0);

// One band as a row: swatch (or the icon of a band that is not a delay), the
// label, the quantity and its share of the late total, and a bar on a track of
// the largest band, so the shape of the distribution reads at a glance.
function BandRow({ label, hint, color, icon: Icon, q, of, max, T }) {
  const w = max > 0 ? Math.max(q > 0 ? 2 : 0, (100 * q) / max) : 0;
  return (
    <div className="py-1" title={hint || undefined}>
      <div className="flex items-baseline gap-2 text-xs min-w-0">
        {Icon
          ? <Icon size={12} className="flex-shrink-0 self-center" style={{ color }} aria-hidden />
          : <span className="w-3 h-3 rounded-sm flex-shrink-0 self-center" style={{ background: color }} aria-hidden />}
        <span className="flex-1 truncate" style={{ color: "var(--text-1)" }}>{label}</span>
        <span className="tabular-nums font-semibold flex-shrink-0" style={{ color: q > 0 ? "var(--text-1)" : "var(--text-4)" }}>
          {q > 0 ? `${fmtQty(q)} ${T.pcs}` : "—"}
        </span>
        <span className="tabular-nums flex-shrink-0 w-9 text-right text-[11px]" style={{ color: "var(--text-3)" }}>
          {q > 0 ? `${share(q, of)}%` : ""}
        </span>
      </div>
      <div className="h-1.5 mt-1 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} />
      </div>
    </div>
  );
}

export function DelayBands({ delay }) {
  const T = useOT();
  const { chartTheme } = useChartTheme();
  const colors = delayColors(chartTheme.mode === "dark");
  const d = delay || {};
  const bands = d.bands || {};
  const late = d.late || 0;
  const max = Math.max(0, ...ALL_KEYS.map((k) => bands[k] || 0));

  return (
    <ChartCard icon={Timer} title={T.dlTitle} subtitle={T.dlSub}>
      {!(late > 1e-6) ? <NoChart height={260} text={T.dlNoLate} /> : (
        <div className="px-4 py-3 space-y-3">
          {/* The headline: how late a late piece usually was. */}
          <div>
            <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-3)" }}>{T.dlAvg}</div>
            <div className="text-2xl font-bold tabular-nums leading-tight" style={{ color: "var(--text-1)" }}>
              {d.avg_min != null ? fmtDur(d.avg_min, T) : <span className="text-sm font-medium" style={{ color: "var(--text-3)" }}>{T.dlNoAvg}</span>}
            </div>
            {d.avg_min != null && (
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                {fill(T.dlMedian, { m: fmtDur(d.median_min, T) })} · {fill(T.dlMax, { m: fmtDur(d.max_min, T) })}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            {[
              [T.dlArrived, d.delivered, "var(--text-1)"],
              [T.dlNoneShort, d.none, "var(--status-bad)"],
              [T.dlWaitShort, d.wait, "var(--text-2)"],
            ].map(([label, q, ink]) => (
              <div key={label} className="rounded-lg px-2 py-1.5" style={{ background: "var(--bg-inner)" }}>
                <div className="truncate" style={{ color: "var(--text-3)" }} title={label}>{label}</div>
                <div className="text-sm font-bold tabular-nums" style={{ color: q > 0 ? ink : "var(--text-4)" }}>{q > 0 ? fmtQty(q) : "—"}</div>
                <div className="tabular-nums" style={{ color: "var(--text-3)" }} title={q > 0 ? fill(T.dlOfLate, { p: share(q, late) }) : undefined}>
                  {q > 0 ? `${share(q, late)}%` : " "}
                </div>
              </div>
            ))}
          </div>
          <div>
            {DELAY_KEYS.map((k) => (
              <BandRow key={k} label={T.dlBand[k]} color={colors[k]} q={bands[k] || 0} of={late} max={max} T={T} />
            ))}
            <div className="my-1.5 border-t" style={{ borderColor: "var(--border)" }} />
            <BandRow label={T.dlBand[NONE]} hint={T.dlNoneHint} color={colors[NONE]} icon={XCircle}
              q={bands[NONE] || 0} of={late} max={max} T={T} />
            {(bands[WAIT] || 0) > 0 && (
              <BandRow label={T.dlBand[WAIT]} hint={T.dlWaitHint} color={colors[WAIT]} icon={Clock}
                q={bands[WAIT]} of={late} max={max} T={T} />
            )}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

// The late quantity per day (a week / month past three months), stacked by the
// band it arrived in. The padded ≥7-day window is the page's own chart window.
export function DelayTrend({ trend, ready, className = "" }) {
  const T = useOT();
  const { t } = useLang();
  const { gridColor, labelColor, chartTheme, cardBg } = useChartTheme();
  const colors = delayColors(chartTheme.mode === "dark");
  const [ref, width] = useElementWidth();

  const { grain, points } = useMemo(() => {
    const days = trend || [];
    const g = trendGrain(days.length);
    const pts = [];
    let cur = null;
    for (const d of days) {
      const key = g === "day" ? d.date : g === "week" ? weekKey(d.date) : d.date.slice(0, 7);
      if (!cur || cur.key !== key) {
        cur = { key, day: d.date, from: d.date, to: d.date, bands: {}, late: 0, minutes: 0, delivered: 0, demand: 0 };
        pts.push(cur);
      }
      cur.to = d.date;
      cur.demand += d.demand || 0;
      const dl = d.delay;
      if (!dl) continue;
      for (const k of ALL_KEYS) cur.bands[k] = (cur.bands[k] || 0) + (dl.bands?.[k] || 0);
      cur.late += dl.late || 0;
      if (dl.avg_min != null && dl.delivered > 0) {
        cur.minutes += dl.avg_min * dl.delivered;
        cur.delivered += dl.delivered;
      }
    }
    return { grain: g, points: pts };
  }, [trend]);

  const cats = points.map((p) => bucketTick(p.from, grain));
  const tickAmount = ticksForWidth(width, cats.length, axisLabelPx(cats));
  const keys = ALL_KEYS.filter((k) => k !== WAIT || points.some((p) => (p.bands[WAIT] || 0) > 0));
  const series = keys.map((k) => ({ name: T.dlBand[k], data: points.map((p) => Math.round(p.bands[k] || 0)) }));
  const has = points.some((p) => p.late > 1e-6);
  const grainWord = grain === "week" ? T.grainWeek : grain === "month" ? T.grainMonth : T.grainDay;

  const fmtDay = (iso) => `${ddmm(iso)} · ${t(`cal.d${weekdayOf(iso)}`)}`;
  const tipFor = (i) => {
    const p = points[i];
    if (!p) return "";
    const head = bucketTitle(p, grain, fmtDay, t);
    if (!(p.demand > 0)) return tipBox(head, [[T.tipNoOrders, ""]]);
    if (!(p.late > 1e-6)) return tipBox(head, [[T.dlNoLate, ""]]);
    const rows = keys.filter((k) => (p.bands[k] || 0) > 0)
      .map((k) => [T.dlBand[k], `${fmtQty(p.bands[k])} ${T.pcs}`, colors[k]]);
    return tipBox(head, [
      [T.dlTipTotal, `${fmtQty(p.late)} ${T.pcs}`],
      ...(p.delivered > 0 ? [[T.dlTipAvg, fmtDur(p.minutes / p.delivered, T)]] : []),
      ...rows,
    ]);
  };

  const opts = {
    chart: { type: "bar", stacked: true, background: "transparent", toolbar: { show: false }, zoom: { enabled: false },
      animations: { enabled: false }, parentHeightOffset: 0 },
    theme: chartTheme,
    colors: keys.map((k) => colors[k]),
    plotOptions: { bar: { columnWidth: points.length > 20 ? "72%" : "52%", borderRadius: 4,
      borderRadiusApplication: "end", borderRadiusWhenStacked: "last" } },
    // The 2px surface gap between stacked segments.
    stroke: { show: true, width: 2, colors: [cardBg] },
    grid: { borderColor: gridColor, padding: { left: 6, right: 10 } },
    xaxis: {
      categories: cats, tickAmount,
      labels: { rotate: 0, rotateAlways: false, hideOverlappingLabels: true, style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { color: gridColor }, axisTicks: { show: false }, tooltip: { enabled: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" }, formatter: (v) => fmtQty(Math.round(v)) } },
    legend: { show: true, position: "bottom", fontSize: "11px", labels: { colors: labelColor },
      markers: { size: 6, shape: "square" }, itemMargin: { horizontal: 6, vertical: 2 } },
    dataLabels: { enabled: false },
    states: { hover: { filter: { type: "darken", value: 0.9 } } },
    tooltip: { shared: true, intersect: false, custom: ({ dataPointIndex }) => tipFor(dataPointIndex) },
  };

  return (
    <ChartCard className={className} icon={CalendarClock} title={T.dlDaily} subtitle={fill(T.dlDailySub, { g: grainWord })}>
      <div ref={ref} className="px-2 pt-2 pb-1 apx-bare-tip">
        {!has
          ? <NoChart height={360} text={T.dlNoLate} />
          : <Chart ready={ready} height={380} type="bar" options={opts} series={series} />}
      </div>
    </ChartCard>
  );
}

const pad2 = (n) => String(n).padStart(2, "0");
function weekKey(iso) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
