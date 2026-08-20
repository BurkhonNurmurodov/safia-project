import { useMemo } from "react";
import { CATEGORY_COLORS } from "../../utils/chartPalette";
import { CATS } from "./categories";
import { packLanes, overlapBands, timelineWindow, fmtHHMM, fmtDur, spanOf } from "../../utils/idleTime";

// The cell's day drawn to scale — the view that makes the counting error
// visible instead of merely corrected.
//
// Overlapping ojidaniyas are packed into SEPARATE lanes, so two causes sharing
// a stretch of the day appear stacked one above the other, and the minutes they
// share are shaded behind them. Under the lanes sits a single merged bar: the
// union, i.e. what the cell's downtime actually was. Read together, the stack
// says "these are the reasons" and the bar says "this is the time" — which is
// exactly the distinction that was impossible to draw when an entry was a
// number of minutes with no endpoints.
//
// Not-stopped ojidaniyas are drawn hollow. They are recorded facts, they are
// not downtime, and nothing about them should read as filled-in time.

const LANE_H = 26;
const BAR_H = 18;
const UNION_H = 12;

export default function DayTimeline({ intervals, summary, t, onPick }) {
  const win = useMemo(() => timelineWindow(intervals), [intervals]);
  const lanes = useMemo(() => packLanes(intervals), [intervals]);
  const bands = useMemo(() => overlapBands(intervals), [intervals]);

  if (!win) return null;
  const { lo, hi } = win;
  const total = hi - lo;
  const pct = (m) => ((m - lo) / total) * 100;

  // One label every 1h / 2h / 3h depending on how much day is on screen — a
  // tick every hour across a 14-hour night shift is unreadable on a phone.
  const stepH = total <= 6 * 60 ? 1 : total <= 12 * 60 ? 2 : 3;
  const ticks = [];
  for (let m = lo; m <= hi; m += stepH * 60) ticks.push(m);

  const merged = summary?.merged || [];

  return (
    <div className="px-3 pt-2 pb-3">
      {/* hour axis */}
      <div className="relative h-4 mb-1">
        {ticks.map((m) => (
          <span
            key={m}
            className="absolute text-[10px] tabular-nums -translate-x-1/2"
            style={{ left: `${pct(m)}%`, color: "var(--text-4)" }}
          >
            {fmtHHMM(m)}
          </span>
        ))}
      </div>

      <div className="relative" style={{ height: lanes.length * LANE_H }}>
        {/* gridlines */}
        {ticks.map((m) => (
          <span
            key={m}
            className="absolute top-0 bottom-0 w-px"
            style={{ left: `${pct(m)}%`, background: "var(--border)" }}
          />
        ))}
        {/* shared minutes — what the old sum counted twice */}
        {bands.map(([s, e], i) => (
          <span
            key={`b${i}`}
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${pct(s)}%`, width: `${((e - s) / total) * 100}%`,
              background: "rgba(234,179,8,0.14)",
              borderLeft: "1px solid rgba(234,179,8,0.45)",
              borderRight: "1px solid rgba(234,179,8,0.45)",
            }}
            title={t("idleCell.overlapHint")}
          />
        ))}
        {/* one row per lane; overlapping events cannot share a lane */}
        {lanes.map((lane, li) =>
          lane.map(({ iv, span }) => {
            const idx = CATS.findIndex((c) => c.name === iv.category);
            const code = idx >= 0 ? CATS[idx].code : "?";
            const color = CATEGORY_COLORS[(idx < 0 ? 0 : idx) % CATEGORY_COLORS.length];
            const w = ((span[1] - span[0]) / total) * 100;
            return (
              <button
                key={iv.id}
                type="button"
                onClick={() => onPick?.(iv)}
                className="absolute rounded-md text-[10px] font-semibold overflow-hidden px-1 text-left transition-transform hover:z-10 focus-visible:z-10"
                style={{
                  left: `${pct(span[0])}%`,
                  width: `max(4px, ${w}%)`,
                  top: li * LANE_H + (LANE_H - BAR_H) / 2,
                  height: BAR_H,
                  background: iv.stopped ? color : "transparent",
                  border: `1px ${iv.stopped ? "solid" : "dashed"} ${color}`,
                  color: iv.stopped ? "#fff" : color,
                }}
                title={`${t("idleCell.category")} ${code} · ${iv.start} → ${iv.end} · ${fmtDur(iv.minutes, t)}${iv.stopped ? "" : ` · ${t("idleCell.notStopped")}`}\n${iv.note}`}
              >
                {w > 7 ? code : ""}
              </button>
            );
          }),
        )}
      </div>

      {/* the union — the day's real downtime, each minute once */}
      <div className="mt-1.5 pt-1.5" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="relative" style={{ height: UNION_H }}>
          {merged.map((seg, i) => {
            const sp = spanOf(seg.start, seg.end);
            if (!sp) return null;
            // A merged segment can start before the window when it wrapped
            // midnight in the other direction; clamp rather than draw off-card.
            const s = Math.max(lo, sp[0]), e = Math.min(hi, sp[1]);
            if (e <= s) return null;
            return (
              <span
                key={i}
                className="absolute rounded-sm"
                style={{
                  left: `${pct(s)}%`, width: `max(4px, ${((e - s) / total) * 100}%)`,
                  top: 0, height: UNION_H,
                  background: "rgba(148,163,184,0.8)",
                }}
                title={`${seg.start} → ${seg.end} · ${fmtDur(seg.minutes, t)}`}
              />
            );
          })}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-wide" style={{ color: "var(--text-4)" }}>
          {t("idleCell.unionBarLabel")}
        </div>
      </div>
    </div>
  );
}
