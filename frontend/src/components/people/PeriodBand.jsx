import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import DateRangePicker from "../ui/DateRangePicker";
import Tooltip from "../ui/Tooltip";
import { useCountUp } from "../live/liveHooks";
import { fill, fmtShort, daySwatch, DAY_ORDER } from "./peopleUtil";
import DayGrid from "./DayGrid";

const num = (v, digits = 0) => (v == null ? "—" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: digits }));

/** The change against the previous period — an arrow and the figure; green
 *  when it went the way that is good, red when not, slate for a figure that
 *  is neither (a move between brigadas). */
function Delta({ cur, prev, digits = 0, unit = "", polar = true, P }) {
  if (cur == null || prev == null) return null;
  const r = Number((cur - prev).toFixed(digits));
  const Arrow = r > 0 ? ArrowUpRight : r < 0 ? ArrowDownRight : Minus;
  const tone = !polar || r === 0 ? "var(--text-3)" : r > 0 ? "var(--status-ok)" : "var(--status-bad)";
  const text = r === 0 ? P.same : `${r > 0 ? "+" : "−"}${Math.abs(r).toLocaleString("ru-RU", { maximumFractionDigits: digits })}${unit}`;
  return (
    <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold tabular-nums whitespace-nowrap" style={{ color: tone }}>
      <Arrow size={13} strokeWidth={2.4} aria-hidden="true" />{text}
    </span>
  );
}

function Metric({ label, tip, value, delta, prev, P }) {
  return (
    <div className="min-w-0 px-4 sm:px-5 py-3.5">
      <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-3)" }}>
        <span className="leading-tight">{label}</span>{tip && <Tooltip text={tip} />}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-xl font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{value}</span>
        {delta}
      </div>
      <div className="mt-0.5 text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{fill(P.prevShort, { v: prev })}</div>
    </div>
  );
}

/**
 * The period on one card: the attendance rate as THE figure with the period's
 * days drawn beside it, and the three other tiles of the period under it —
 * each against the previous period of the same length. Every figure is the
 * server's (`tiles`); the band only lays them out.
 */
export default function PeriodBand({ data, P, dateFrom, dateTo, setDateFrom, setDateTo, todayIso, onPickDay }) {
  const { cur, prev, days } = data.tiles;
  // The rate rises from 0 the first time the band shows, then follows edits.
  const [shown, setShown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id); }, []);
  const att = useCountUp(shown ? cur.att : (cur.att == null ? null : 0), 900);
  const present = new Set((days || []).map((d) => d.s || "none"));
  // Today wears its outline and a move its came-day green: the legend names
  // the colours, not every state.
  const legend = DAY_ORDER.filter((k) => present.has(k) && k !== "moved" && k !== "live");
  const absent = cur.absent ?? (cur.listed != null ? cur.listed - cur.came - cur.leave : null);

  return (
    <section className="pc-rise rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-5 pt-4">
        <DateRangePicker compactLabel dateFrom={dateFrom} dateTo={dateTo} max={todayIso}
          setDateFrom={setDateFrom} setDateTo={setDateTo} triggerClassName="px-3 py-2 text-sm" />
        {data.tiles.prev_from && (
          <span className="ml-auto text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
            {fill(P.vsPrev, { a: fmtShort(data.tiles.prev_from), b: fmtShort(data.tiles.prev_to) })}
          </span>
        )}
      </div>

      <div className="px-4 sm:px-5 pt-4 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[13px] font-medium" style={{ color: "var(--text-2)" }}>
              {P.tAtt}<Tooltip text={P.tAttTip} />
            </div>
            <div className="mt-1.5 flex items-baseline gap-3">
              <span className="text-[44px] leading-none font-semibold tabular-nums tracking-tight" style={{ color: "var(--text-1)" }}>
                {att == null ? "—" : `${Math.round(att)}%`}
              </span>
              <Delta cur={cur.att} prev={prev.att} unit={` ${P.ppt}`} P={P} />
            </div>
            <div className="mt-2.5 text-xs tabular-nums" style={{ color: "var(--text-2)" }}>
              {cur.listed ? fill(P.attSub2, { c: cur.came, l: cur.leave, a: Math.max(0, absent ?? 0), n: cur.listed }) : P.attEmpty}
              <span style={{ color: "var(--text-3)" }}> · {fill(P.prevShort, { v: prev.att == null ? "—" : `${Math.round(prev.att)}%` })}</span>
            </div>
          </div>
          {legend.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 pb-0.5">
              {legend.map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                  <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={daySwatch(k)} aria-hidden="true" />
                  {P.state[k]}
                </span>
              ))}
            </div>
          )}
        </div>
        {days?.length > 0 && (
          <div className="mt-4">
            <DayGrid from={data.period.from} days={days} P={P} onPick={onPickDay} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-3" style={{ borderTop: "1px solid var(--border)" }}>
        <Metric label={P.tCame} tip={P.tCameTip} value={num(cur.came)} prev={num(prev.came)} P={P}
          delta={<Delta cur={cur.came} prev={prev.came} P={P} />} />
        <div style={{ borderLeft: "1px solid var(--border)" }}>
          <Metric label={P.tHours} tip={P.tHoursTip} value={num(cur.hours, 1)} prev={num(prev.hours, 1)} P={P}
            delta={<Delta cur={cur.hours} prev={prev.hours} digits={1} P={P} />} />
        </div>
        <div style={{ borderLeft: "1px solid var(--border)" }}>
          {/* Moves are neither good nor bad: the change is told in slate. */}
          <Metric label={P.tMoves} tip={P.tMovesTip} value={num(cur.moves)} prev={num(prev.moves)} P={P}
            delta={<Delta cur={cur.moves} prev={prev.moves} polar={false} P={P} />} />
        </div>
      </div>
    </section>
  );
}
