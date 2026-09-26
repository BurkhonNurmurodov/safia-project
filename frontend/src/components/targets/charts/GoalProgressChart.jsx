// A goal's progress over time: what was actually done (a stepped line — it
// moves only on the days something was recorded), the plan it is measured
// against (straight from 0 at the start to 100% at the due date) and, while
// it is still open, where the pace so far leads (dotted). Today and the due
// date are marked, so «behind» is the gap between the two lines, not a word.
//
// Change over time against a plan → a line chart on one % axis.
import TimeChart from "./TimeChart";
import { TipRow } from "./ChartTip";
import { MARK_COLOR, dayLabel } from "./chartKit";
import {
  goalHistory, goalProgress, goalProgressAt, goalStatus, addDays, dayDiff, fmtPct,
} from "../../../utils/targets";

export default function GoalProgressChart({ goal, today, t, height = 220 }) {
  const st = goalStatus(goal, today);
  const color = MARK_COLOR[st];
  const p = goalProgress(goal);
  const start = goal.start;
  const due = goal.due;
  const period = Math.max(1, dayDiff(start, due));
  const hist = today >= start ? goalHistory(goal, today) : [];
  const planAt = (iso) => Math.max(0, Math.min(1, dayDiff(start, iso) / period));

  // Where the pace so far leads: the average rate since the start, carried on
  // until it reaches 100% — or until half a period past the due date, which is
  // as far as a forecast is worth drawing.
  const cap = addDays(due, Math.ceil(period / 2));
  let forecast = null;
  const spent = dayDiff(start, today);
  if (st !== "achieved" && p > 0 && spent > 0) {
    const rate = p / spent;
    const finish = addDays(start, Math.ceil(1 / rate));
    forecast = finish <= cap
      ? { points: [{ x: today, y: p * 100 }, { x: finish, y: 100 }], label: dayLabel(finish, t), end: finish }
      : { points: [{ x: today, y: p * 100 }, { x: cap, y: Math.min(100, rate * dayDiff(start, cap) * 100) }], label: `${Math.round(Math.min(1, rate * dayDiff(start, cap)) * 100)}%`, end: cap };
  }
  const lastDay = [due, today, forecast?.end].filter(Boolean).sort().pop();
  const end = dayDiff(start, lastDay) < 6 ? addDays(start, 6) : lastDay;
  const fcAt = (iso) => {
    if (!forecast || iso < today) return null;
    const [a, b] = forecast.points;
    const span = dayDiff(a.x, b.x) || 1;
    return Math.min(100, a.y + ((b.y - a.y) * Math.min(dayDiff(a.x, iso), span)) / span);
  };

  const series = [
    { key: "plan", color: "var(--text-3)", width: 1.5, dash: "6 5", points: [{ x: start, y: 0 }, { x: due, y: 100 }] },
    ...(forecast ? [{ key: "fc", color, width: 2, dash: "2 5", opacity: 0.9, points: forecast.points, endLabel: forecast.label }] : []),
    {
      key: "actual", color, width: 2, step: true, area: true, dots: true,
      points: hist.map((h) => ({ x: h.at, y: h.p * 100 })), endLabel: fmtPct(p), labelAbove: true,
    },
  ];
  const snap = [...new Set([...hist.map((h) => h.at), due, forecast?.end].filter((d) => d && d <= end))].sort();

  return (
    <div className="px-4 pb-4 pt-3">
      <TimeChart
        t={t} height={height} x0={start} x1={end} y0={0} y1={100} yFormat={(v) => `${v}%`}
        series={series}
        vlines={[{ x: today, label: t("targets.chart.timeline.today") }, { x: due, label: t("targets.form.due"), dash: true }]}
        snap={snap}
        ariaLabel={t("targets.chart.burn.aria")}
        readout={(iso) => (
          <>
            {iso <= today && <TipRow color={color} value={fmtPct(goalProgressAt(goal, iso, today))} label={t("targets.chart.burn.actual")} />}
            <TipRow color="var(--text-3)" dashed value={fmtPct(planAt(iso))} label={t("targets.chart.pace.plan")} />
            {fcAt(iso) !== null && iso > today && <TipRow color={color} dashed value={`${Math.round(fcAt(iso))}%`} label={t("targets.projection")} />}
          </>
        )}
      />
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-2)" }}>
        <li className="inline-flex items-center gap-1.5"><span className="w-4" style={{ borderTop: `2px solid ${color}` }} aria-hidden />{t("targets.chart.burn.actual")}</li>
        <li className="inline-flex items-center gap-1.5"><span className="w-4" style={{ borderTop: "2px dashed var(--text-3)" }} aria-hidden />{t("targets.chart.pace.plan")}</li>
        {forecast && (
          <li className="inline-flex items-center gap-1.5"><span className="w-4" style={{ borderTop: `2px dotted ${color}` }} aria-hidden />{t("targets.projection")}</li>
        )}
      </ul>
    </div>
  );
}
