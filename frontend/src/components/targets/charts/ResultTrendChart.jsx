// One numeric result over time: every recorded value (a stepped line — a value
// holds until the next check-in), the path the plan draws from its start value
// to its target by the due date (dashed), and the target itself as a labelled
// line. Whether the result is ahead is the gap between the solid and dashed
// lines; how far it has to go is the gap to the target line.
//
// A value over time, in its own unit → a line chart on one axis.
import TimeChart from "./TimeChart";
import { TipRow } from "./ChartTip";
import { MARK_COLOR } from "./chartKit";
import { fmtCompact } from "../targetsUi";
import {
  targetStatus, addDays, dayDiff, fmtNumber, fmtValue, num,
} from "../../../utils/targets";

export default function ResultTrendChart({ tg, goal, today, t, height = 160 }) {
  const color = MARK_COLOR[targetStatus(tg, goal, today)];
  const s0 = num(tg.start);
  const tgt = num(tg.target);
  const cur = num(tg.current, s0);
  const first = goal.start || tg.checkins?.[0]?.at || today;
  const byDay = new Map([[first, s0]]);
  (tg.checkins ?? []).forEach((c) => { if (c.at >= first && c.at <= today) byDay.set(c.at, c.value); });
  if (today >= first) byDay.set(today, cur);
  const pts = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([x, y]) => ({ x, y }));
  const hasPlan = goal.start && goal.due;
  const lastDay = [goal.due, today].filter(Boolean).sort().pop();
  const end = dayDiff(first, lastDay) < 6 ? addDays(first, 6) : lastDay;

  const vals = [...pts.map((p) => p.y), s0, tgt];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
  const y0 = tg.type === "percent" ? Math.max(0, lo - pad) : lo - pad;
  const y1 = tg.type === "percent" ? Math.min(100, hi + pad) : hi + pad;
  const fmt = (v) => (tg.type === "percent" ? `${fmtNumber(v)}%` : tg.type === "currency" ? fmtCompact(v, t) : fmtNumber(v));
  const planAt = (iso) => {
    const span = Math.max(1, dayDiff(goal.start, goal.due));
    const f = Math.max(0, Math.min(1, dayDiff(goal.start, iso) / span));
    return s0 + (tgt - s0) * f;
  };
  const valueAt = (iso) => {
    let v = s0;
    pts.forEach((p) => { if (p.x <= iso) v = p.y; });
    return v;
  };

  return (
    <TimeChart
      t={t} height={height} x0={first} x1={end} y0={y0} y1={y1} yFormat={fmt}
      series={[
        ...(hasPlan ? [{ key: "plan", color: "var(--text-3)", width: 1.5, dash: "6 5", points: [{ x: goal.start, y: s0 }, { x: goal.due, y: tgt }] }] : []),
        { key: "val", color, width: 2, step: true, area: false, dots: true, points: pts, endLabel: fmt(cur), labelAbove: true },
      ]}
      hlines={[{ y: tgt, label: `${t("targets.target")} ${fmtValue(tgt, tg)}` }]}
      vlines={[{ x: today, label: t("targets.chart.timeline.today") }]}
      snap={pts.map((p) => p.x)}
      ariaLabel={`${tg.title}: ${fmtValue(cur, tg)} → ${fmtValue(tgt, tg)}`}
      readout={(iso) => (
        <>
          <TipRow color={color} value={fmtValue(valueAt(iso), tg)} label={t("targets.chart.kr.value")} />
          {hasPlan && <TipRow color="var(--text-3)" dashed value={fmtValue(planAt(iso), tg)} label={t("targets.chart.kr.path")} />}
        </>
      )}
    />
  );
}
