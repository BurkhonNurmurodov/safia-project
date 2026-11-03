import { useEffect, useMemo, useState } from "react";
import { Thermometer, Rows3, ListOrdered } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import { ChartCard, Chart, NoChart } from "../ui/AnalysisBoard";
import { useChartTheme } from "../../hooks/useChartTheme";
import {
  useOT, fill, hhmm, ddmmyy, ovenMs, fmtN, MODE_COLOR, LANES, LANE_COLOR, SENSOR_COLOR,
} from "./ovensUtil";

// «Kun grafigi» — one oven's day as the Windows app draws it: the temperature
// of each sensor against its set point, the mode the oven was in, when the
// door stood open and which relays ran. Times are the oven's own clock; the
// chart runs in UTC so the axis prints that clock unchanged.

const DAY_MS = 86400000;
// A set point is dashed in its own shade (slate for the oven) — never the same
// stroke as the reading it is compared with.
const SET_COLOR = { oven: "#94a3b8", core1: "#4ade80", core2: "#c084fc", prover: "#2dd4bf" };

function useReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);
  return ready;
}

function Lane({ label, spans, color, colorOf, lo }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] sm:grid-cols-[9rem_1fr] gap-3 items-center">
      <span className="text-[11px] truncate" style={{ color: "var(--text-2)" }} title={label}>{label}</span>
      <div className="relative h-4 rounded" style={{ background: "var(--bg-inner)" }}>
        {spans.map((s, i) => {
          const a = ovenMs(s[0]) - lo;
          const b = (s[1] ? ovenMs(s[1]) : lo + DAY_MS) - lo;
          const left = Math.max(0, (100 * a) / DAY_MS);
          const width = Math.max(0.15, (100 * (b - a)) / DAY_MS);
          return (
            <div key={i} className="absolute top-0 bottom-0 rounded-[2px]"
              style={{ left: `${left}%`, width: `${width}%`, background: colorOf ? colorOf(s) : color }}
              title={`${hhmm(s[0])}–${s[1] ? hhmm(s[1]) : "…"}`} />
          );
        })}
      </div>
    </div>
  );
}

export default function OvenDay({ day }) {
  const T = useOT();
  const ready = useReady();
  const { gridColor, labelColor, chartTheme, tooltipTheme } = useChartTheme();
  const lo = ovenMs(`${day.date}T00:00:00`);
  const hi = lo + DAY_MS;

  const sensors = ["oven", "core1", "core2", "prover"].filter((s) => day.temps[s]?.length);
  const label = { oven: T.sOven, core1: T.sCore1, core2: T.sCore2, prover: T.sProver };
  const series = [];
  const colors = [], widths = [], dashes = [], curves = [];
  for (const s of sensors) {
    series.push({ name: label[s], data: day.temps[s].map(([t, v]) => [ovenMs(t), v]) });
    colors.push(SENSOR_COLOR[s]); widths.push(2); dashes.push(0); curves.push("straight");
    const ref = (day.refs[s] || []).filter(([, v]) => v > 0);
    if (ref.length) {
      // a set point holds until the next one: extend the last to the day's end
      const pts = ref.map(([t, v]) => [ovenMs(t), v]);
      pts.push([Math.min(hi, ovenMs(day.last || `${day.date}T23:59:59`)), pts[pts.length - 1][1]]);
      series.push({ name: `${label[s]} · ${T.setWord}`, data: pts });
      colors.push(SET_COLOR[s]); widths.push(1.5); dashes.push(5); curves.push("stepline");
    }
  }
  const bakeBands = useMemo(() => day.bakes.map((b) => ({
    x: ovenMs(b.start), x2: b.stop ? ovenMs(b.stop) : Math.min(hi, ovenMs(day.last || b.start)),
    fillColor: MODE_COLOR.bake_manual, opacity: 0.08, borderColor: "transparent",
  })), [day.bakes, day.last, hi]);

  const opts = {
    chart: { type: "line", background: "transparent", toolbar: { show: false }, zoom: { enabled: false },
      animations: { enabled: false }, parentHeightOffset: 0 },
    theme: chartTheme,
    colors, stroke: { width: widths, dashArray: dashes, curve: curves },
    grid: { borderColor: gridColor, padding: { left: 6, right: 10 } },
    xaxis: {
      type: "datetime", min: lo, max: hi,
      labels: { datetimeUTC: true, format: "HH:mm", style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { color: gridColor }, axisTicks: { show: false }, tooltip: { enabled: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" }, formatter: (v) => `${Math.round(v)}°` } },
    annotations: { xaxis: bakeBands },
    legend: { show: true, position: "top", horizontalAlign: "left", labels: { colors: labelColor } },
    markers: { size: 0 },
    dataLabels: { enabled: false },
    tooltip: { theme: tooltipTheme, shared: true, intersect: false, x: { format: "HH:mm" },
      y: { formatter: (v) => (v == null ? "—" : `${fmtN(v, 1)}°`) } },
  };

  const relayLanes = LANES.filter((k) => day.relays[k]?.length);
  const modeOf = (s) => MODE_COLOR[s[2]] || "var(--bg-inner)";
  const shownModes = [...new Set(day.modes.map((m) => m[2]))];

  const hasLog = day.temps && (sensors.length || day.modes.length);
  if (!hasLog) return <NoChart height={240} text={T.noDay} />;

  return (
    <div className="space-y-4 lg:space-y-6">
      <ChartCard icon={Thermometer} title={T.secTempChart} subtitle={fill(T.secTempChartSub, { d: ddmmyy(day.date) })}
        right={day.last && day.last.slice(0, 10) === day.date && day.last.slice(11, 16) < "23:55"
          ? <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{fill(T.dayCut, { t: hhmm(day.last) })}</span> : null}>
        <div className="px-2 pt-2 pb-1">
          {series.length ? <Chart ready={ready} height={320} type="line" options={opts} series={series} />
            : <NoChart height={320} text={T.noDay} />}
        </div>
      </ChartCard>

      <ChartCard icon={Rows3} title={T.secTimeline} subtitle={T.secTimelineSub}>
        <div className="p-4 space-y-2">
          <div className="grid grid-cols-[6.5rem_1fr] sm:grid-cols-[9rem_1fr] gap-3 text-[10px] tabular-nums" style={{ color: "var(--text-4)" }}>
            <span />
            <div className="flex justify-between"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
          </div>
          <Lane label={T.lane.mode} spans={day.modes} colorOf={modeOf} lo={lo} />
          <Lane label={T.lane.door} spans={day.door} color={LANE_COLOR.door} lo={lo} />
          {relayLanes.map((k) => (
            <Lane key={k} label={T.lane[k]} spans={day.relays[k]} color={LANE_COLOR[k]} lo={lo} />
          ))}
          <div className="pt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--text-2)" }}>
            {shownModes.map((m) => (
              <span key={m} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="w-2.5 h-2.5 rounded-sm" style={{ background: MODE_COLOR[m] }} /> {T.mode[m]}
              </span>
            ))}
          </div>
        </div>
      </ChartCard>

      <TableCard icon={ListOrdered} title={T.secDayBakes}
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fmtN(day.bakes.length)}</span>}
        fixed minWidth={760}
        mobile={day.bakes.length ? (
          <ul>
            {day.bakes.map((b, i) => (
              <li key={i} className="px-4 py-3 text-xs" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{hhmm(b.start)}–{b.stop ? hhmm(b.stop) : T.running}</span>
                  <span className="ml-auto font-bold tabular-nums">{b.set_c != null ? `${fmtN(b.set_c)}°` : ""}</span>
                </div>
                <div className="mt-1" style={{ color: "var(--text-3)" }}><Program b={b} T={T} /></div>
              </li>
            ))}
          </ul>
        ) : <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-3)" }}>{T.noDay}</div>}>
        <thead>
          <tr>
            <Th label={T.cStart} />
            <Th label={T.cEnd} />
            <Th label={T.cDur} align="right" />
            <Th label={T.cSetC} align="right" />
            <Th label={T.cKind} />
            <Th label={T.program} />
            <Th label={T.cDoorIn} align="right" />
          </tr>
        </thead>
        <tbody>
          {day.bakes.length ? day.bakes.map((b, i) => (
            <tr key={i}>
              <td className="px-3 py-2 tabular-nums">{hhmm(b.start)}</td>
              <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-2)" }}>{b.stop ? hhmm(b.stop) : T.running}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{b.minutes != null ? fmtN(b.minutes, 1) : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{b.set_c != null ? `${fmtN(b.set_c)}°` : "—"}</td>
              <td className="px-3 py-2 max-w-0 truncate" style={{ color: "var(--text-2)" }}>{b.manual ? T.manual : b.recipe || T.recipe}</td>
              <td className="px-3 py-2 max-w-0 truncate" style={{ color: "var(--text-3)" }}><Program b={b} T={T} /></td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: b.door_opened ? "var(--text-1)" : "var(--text-4)" }}>{b.door_opened || "—"}</td>
            </tr>
          )) : (
            <tr><td colSpan={7} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{T.noDay}</td></tr>
          )}
        </tbody>
      </TableCard>
    </div>
  );
}

function Program({ b, T }) {
  const p = b.program || {};
  const parts = [
    ...(p.temp || []).map((s) => fill(T.step, { t: fmtN(s.temp_c), m: fmtN(s.duration_s / 60, s.duration_s % 60 ? 1 : 0) })),
    ...(p.steam || []).map((s) => fill(T.steamStep, { s: fmtN(s.spray_s) })),
    ...(p.damper || []).map((s) => fill(T.damperStep, { p: fmtN(s.open_pct) })),
  ];
  const text = parts.join(" · ");
  return <span title={text}>{text || "—"}</span>;
}
