import { useMemo } from "react";
import { CATS, catColor } from "./categories";
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
// The strip on the left that names each row's category. A track nobody can
// read the name of just moves the identification problem from the bar to the
// row, so the width is spent deliberately: enough for the widest code ("D2").
const GUTTER = 34;

// Everything the chart needs to know about a category name, including one the
// frontend's registry has never heard of — the hue comes from `catColor`, the
// canonical one every ojidaniya surface reads, so a category is one colour on
// every view.
function catOf(name) {
  const i = CATS.findIndex((c) => c.name === name);
  return {
    code: (i >= 0 ? CATS[i].code : String(name || "").replace(/^Cat\s*/i, "")) || "?",
    color: catColor(name),
    rank: i < 0 ? CATS.length : i,
  };
}

// `unionLabel` names the slate bar underneath. It is «the cell's downtime» on
// the To'xtaganda half and nothing of the sort on the other one — there the bar
// unions ranges the cell kept working through — so the caller that changed what
// is drawn is the caller that renames it. Default = the stopped reading, which
// is what /idle-cell has always shown.
export default function DayTimeline({ intervals, summary, t, onPick, unionLabel }) {
  // Only the register is drawn. Rejected rows are not here at all: this tab is
  // the day as it was, and a refused claim was never part of it; it stays
  // readable on «Kutish» with its reason.
  const win = useMemo(() => timelineWindow(intervals), [intervals]);
  // One lane per category (a category whose own ranges overlap gets a second),
  // in the canonical CATS order with unknown names after it.
  const lanes = useMemo(
    () => packLanes(intervals, (iv) => iv.category, (name) => catOf(name).rank),
    [intervals],
  );
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
      {/* The plot area is inset by the label gutter, so the axis, the lanes and
          the union bar all measure the same span — and the first hour label,
          which is centred on its tick, finally has somewhere to sit instead of
          being clipped by the card edge. */}
      <div style={{ paddingLeft: GUTTER }}>
      {/* hour axis */}
      <div className="relative h-4 mb-1">
        {ticks.map((m) => {
          const p = pct(m);
          // The window is rounded out to whole hours, so the LAST tick sits
          // exactly on the plot's right edge — and a label centred on it hangs
          // half its width past the card, where `overflow-hidden` cut it to
          // «18:0» on the very axis whose job is naming the hour. The closing
          // label is pulled inside instead: the tick still marks the moment,
          // the text simply stops overhanging. The opening one is left centred
          // — the label gutter is what it sits over.
          const tx = p > 99 ? "-100%" : "-50%";
          return (
            <span
              key={m}
              className="absolute text-[10px] tabular-nums"
              style={{ left: `${p}%`, transform: `translateX(${tx})`, color: "var(--text-4)" }}
            >
              {fmtHHMM(m)}
            </span>
          );
        })}
      </div>

      <div className="relative" style={{ height: lanes.length * LANE_H }}>
        {/* Each row says whose track it is. Without it the reader is back to
            telling a 1-minute bar from a 13-minute one by hue. */}
        {lanes.map((lane, li) => {
          const { code, color } = catOf(lane.key);
          return (
            <span
              key={`lbl${li}`}
              className="absolute flex items-center justify-end pr-1.5"
              style={{ left: -GUTTER, width: GUTTER, top: li * LANE_H, height: LANE_H }}
            >
              {/* Same chip the table's Kategoriya cell prints — one category,
                  one mark, on both views. "D2" is the widest code and measures
                  ~23px against the 28px the gutter leaves. */}
              <span
                className="text-[10px] font-bold px-1 py-0.5 rounded leading-none"
                style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
              >
                {code}
              </span>
            </span>
          );
        })}
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
        {/* One row per CATEGORY lane — a lane never mixes two of them, and two
            ranges that overlap still cannot share one. */}
        {lanes.map((lane, li) =>
          lane.rows.map(({ iv, span }) => {
            const { code, color } = catOf(iv.category);
            const w = ((span[1] - span[0]) / total) * 100;
            return (
              <button
                key={iv.id}
                type="button"
                onClick={() => onPick?.(iv)}
                className="absolute rounded-md text-[10px] font-semibold overflow-hidden whitespace-nowrap px-1 text-left transition-transform hover:z-10 focus-visible:z-10"
                style={{
                  left: `${pct(span[0])}%`,
                  width: `max(4px, ${w}%)`,
                  top: li * LANE_H + (LANE_H - BAR_H) / 2,
                  height: BAR_H,
                  // Solid = stopped, i.e. downtime; hollow = not stopped.
                  background: iv.stopped ? color : "transparent",
                  border: `1px ${iv.stopped ? "solid" : "dashed"} ${color}`,
                  color: iv.stopped ? "#fff" : color,
                }}
                title={`${t("idleCell.category")} ${code} · ${iv.start} → ${iv.end} · ${fmtDur(iv.minutes, t)}${iv.stopped ? "" : ` · ${t("idleCell.notStopped")} · ${t("idleCell.notCounted")}`}\n${iv.note}`}
              >
                {/* The CODE only, never the duration. `w` is a percentage of
                    the window while a label costs PIXELS, and the two are not
                    relatable: the same 18% bar is ~53px on a phone and the
                    string it would have to hold grows with the window, so
                    «D2 · 2 s 15 daq» clipped inside an 18px box and read
                    «D2 · 2 s» — a 2h15 stop reported as 2h, on the chart whose
                    whole job is measuring the stop. The duration is on the row
                    underneath, in the hover title, and one tap away in the
                    editor; a number that is sometimes wrong is worth less than
                    no number. */}
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
      </div>
      </div>
      {/* The legend spans the full card width — it names marks, not moments,
          so it is not part of the plot area and takes no gutter. */}
      <div>
        {/* The chart draws several different marks and used to name only one
            of them, in 10px uppercase, at the bottom — so the hollow bars (the
            not-stopped ojidaniyas) were the one thing on screen with no way to
            find out what it meant. Every mark is named here instead, and the
            not-stopped swatch says in words why those minutes sit outside the
            slate bar underneath. The overlap swatch appears only when the day
            actually has one. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]" style={{ color: "var(--text-4)" }}>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-sm flex-shrink-0" style={{ width: 12, height: 8, background: "var(--text-3)" }} />
            {t("idleCell.stopped")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-sm flex-shrink-0" style={{ width: 12, height: 8, border: "1px dashed var(--text-3)" }} />
            {t("idleCell.notStopped")} · {t("idleCell.notCounted")}
          </span>
          {bands.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="rounded-sm flex-shrink-0"
                style={{ width: 12, height: 8, background: "rgba(234,179,8,0.14)", border: "1px solid rgba(234,179,8,0.45)" }}
              />
              {t("idleCell.overlapChip")}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-sm flex-shrink-0" style={{ width: 12, height: 8, background: "rgba(148,163,184,0.8)" }} />
            {unionLabel || t("idleCell.unionBarLabel")}
          </span>
        </div>
      </div>
    </div>
  );
}
