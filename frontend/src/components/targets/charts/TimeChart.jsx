// A compact time-series chart for the Targets pages: one date axis, ONE value
// axis, a few lines (solid, dashed, stepped), reference lines, direct end
// labels and a crosshair readout. Drawn natively so every mark follows the
// data-viz specs — 2px lines, ringed end dots, a hairline grid, labels in text
// ink — and sized to its own MEASURED width (hooks/useElementWidth), so the
// date axis thins itself on a phone instead of overlapping.
//
//   series  [{ key, color, points:[{x: iso, y}], width, dash, step, area,
//              dots, endLabel, labelAbove, opacity }]
//   hlines  [{ y, label }]         a value the reader measures against (a target)
//   vlines  [{ x: iso, label, dash }]   today · the due date
//   snap    iso[]                  where the crosshair stops
//   readout (iso) => node          what the tooltip says at that stop
import { useState } from "react";
import useElementWidth from "../../../hooks/useElementWidth";
import ChartTip from "./ChartTip";
import { msOf, scale, niceTicks, dayLabel, textPx, clamp } from "./chartKit";
import { toISO } from "../../../utils/targets";

const PAD_T = 22;
const PAD_B = 22;
const HALO = { stroke: "var(--bg-card)", strokeWidth: 3, paintOrder: "stroke", strokeLinejoin: "round" };

export default function TimeChart({
  height = 200, x0, x1, y0, y1, yFormat = (v) => String(v),
  series = [], hlines = [], vlines = [], snap = [], readout, ariaLabel, t, surface = "var(--bg-card)",
}) {
  const [ref, width] = useElementWidth();
  const [hover, setHover] = useState(null); // { iso, py }

  const yTicks = niceTicks(y0, y1, height >= 180 ? 4 : 3);
  const yMin = yTicks[0];
  const yMax = yTicks[yTicks.length - 1];
  const tickText = yTicks.map(yFormat);
  const padL = Math.max(28, ...tickText.map((s) => textPx(s, 10))) + 6;
  const rightLabels = series.filter((s) => s.endLabel && !s.labelAbove).map((s) => s.endLabel);
  const padR = rightLabels.length ? Math.min(104, Math.max(...rightLabels.map((s) => textPx(s))) + 10) : 12;
  const pw = Math.max(40, width - padL - padR);
  const ph = Math.max(40, height - PAD_T - PAD_B);
  const m0 = msOf(x0);
  const m1 = msOf(x1);
  const X = scale(m0, m1, padL, padL + pw);
  const Xinv = scale(padL, padL + pw, m0, m1);
  const Y = scale(yMin, yMax, PAD_T + ph, PAD_T);
  const baseY = Y(Math.max(yMin, Math.min(yMax, 0)));

  // Evenly spaced date labels, as many as the width holds (never a fixed count).
  const xTicks = [];
  if (width) {
    const n = clamp(Math.floor(pw / 72), 2, 7);
    for (let i = 0; i < n; i += 1) {
      const iso = toISO(new Date(m0 + ((m1 - m0) * i) / (n - 1)));
      if (!xTicks.includes(iso)) xTicks.push(iso);
    }
  }

  const pathOf = (pts, step) => pts.map((p, i) => {
    const x = X(msOf(p.x)).toFixed(1);
    const y = Y(p.y).toFixed(1);
    if (i === 0) return `M${x},${y}`;
    return step ? `H${x}V${y}` : `L${x},${y}`;
  }).join("");

  // End labels on the right, pushed apart so two never share a line.
  const ends = series
    .filter((s) => s.endLabel && s.points.length)
    .map((s) => {
      const last = s.points[s.points.length - 1];
      return { key: s.key, text: s.endLabel, above: !!s.labelAbove, x: X(msOf(last.x)), y: Y(last.y) };
    });
  const right = ends.filter((e) => !e.above).sort((a, b) => a.y - b.y);
  for (let i = 1; i < right.length; i += 1) {
    if (right[i].y - right[i - 1].y < 13) right[i].y = right[i - 1].y + 13;
  }

  // Reference-line labels: two that would collide take opposite sides.
  const vs = vlines.map((v) => ({ ...v, px: X(msOf(v.x)) })).sort((a, b) => a.px - b.px);
  const vAnchor = vs.map((v, i) => {
    const near = (j) => j >= 0 && j < vs.length && Math.abs(vs[j].px - v.px) < textPx(v.label) + 6;
    if (near(i + 1)) return "end";
    if (near(i - 1)) return "start";
    return "middle";
  });

  const pickSnap = (px) => {
    if (!snap.length) return null;
    const ms = Xinv(px);
    let best = snap[0];
    snap.forEach((iso) => { if (Math.abs(msOf(iso) - ms) < Math.abs(msOf(best) - ms)) best = iso; });
    return best;
  };
  const onMove = (ev) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const iso = pickSnap(ev.clientX - r.left);
    if (iso) setHover({ iso, py: clamp(ev.clientY - r.top, PAD_T, PAD_T + ph) });
  };
  const onKey = (ev) => {
    if (!snap.length) return;
    const i = hover ? snap.indexOf(hover.iso) : snap.length - 1;
    if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
      ev.preventDefault();
      const j = clamp(i + (ev.key === "ArrowRight" ? 1 : -1), 0, snap.length - 1);
      setHover({ iso: snap[j], py: PAD_T + ph / 3 });
    }
  };

  return (
    <div
      ref={ref}
      className="relative w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
      style={{ height }}
      tabIndex={snap.length ? 0 : undefined}
      role="img"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      onFocus={() => snap.length && setHover({ iso: snap[snap.length - 1], py: PAD_T + ph / 3 })}
      onBlur={() => setHover(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible" aria-hidden>
          {/* grid + value axis */}
          {yTicks.map((v, i) => (
            <g key={v}>
              <line x1={padL} x2={padL + pw} y1={Y(v)} y2={Y(v)} style={{ stroke: "var(--bg-accent)" }} strokeWidth="1" />
              <text x={padL - 6} y={Y(v) + 3.5} textAnchor="end" fontSize="10" className="tabular-nums" style={{ fill: "var(--text-3)" }}>
                {tickText[i]}
              </text>
            </g>
          ))}
          {/* date axis */}
          {xTicks.map((iso, i) => (
            <text
              key={iso} x={X(msOf(iso))} y={height - 6} fontSize="10"
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
              style={{ fill: "var(--text-3)" }}
            >
              {dayLabel(iso, t)}
            </text>
          ))}

          {/* reference lines: a target value, today, the due date */}
          {hlines.map((h) => (
            <g key={`h${h.y}`}>
              <line x1={padL} x2={padL + pw} y1={Y(h.y)} y2={Y(h.y)} strokeWidth="2" strokeDasharray="0.5 5" strokeLinecap="round" style={{ stroke: "var(--text-2)" }} />
              <text x={padL + 4} y={Y(h.y) - 5} fontSize="10" fontWeight="600" style={{ fill: "var(--text-2)", ...HALO, stroke: surface }}>
                {h.label}
              </text>
            </g>
          ))}
          {vs.map((v, i) => (
            <g key={`v${v.x}${v.label}`}>
              <line
                x1={v.px} x2={v.px} y1={PAD_T - 4} y2={PAD_T + ph} strokeWidth="1"
                strokeDasharray={v.dash ? "3 3" : undefined} style={{ stroke: "var(--text-3)" }}
              />
              <text
                x={v.px + (vAnchor[i] === "start" ? 3 : vAnchor[i] === "end" ? -3 : 0)} y={PAD_T - 9}
                fontSize="10" fontWeight="600" textAnchor={vAnchor[i]} style={{ fill: "var(--text-2)" }}
              >
                {v.label}
              </text>
            </g>
          ))}

          {/* the data */}
          {series.map((s) => (s.points.length > 1 || s.dots) && (
            <g key={s.key} opacity={s.opacity ?? 1}>
              {s.area && s.points.length > 1 && (
                <path
                  d={`${pathOf(s.points, s.step)}V${baseY}H${X(msOf(s.points[0].x))}Z`}
                  style={{ fill: s.color, fillOpacity: 0.1 }}
                />
              )}
              {s.points.length > 1 && (
                <path
                  d={pathOf(s.points, s.step)} fill="none" strokeWidth={s.width ?? 2}
                  strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dash || undefined}
                  style={{ stroke: s.color }}
                />
              )}
              {s.dots && s.points.map((p, i) => {
                const last = i === s.points.length - 1;
                const on = hover?.iso === p.x;
                return (
                  <circle
                    key={`${p.x}${i}`} cx={X(msOf(p.x))} cy={Y(p.y)} r={on ? 5.5 : last ? 4.5 : 3.5}
                    strokeWidth="2" style={{ fill: s.color, stroke: surface }}
                  />
                );
              })}
            </g>
          ))}

          {/* direct end labels, in text ink beside the coloured mark */}
          {ends.map((e) => {
            const r = right.find((x) => x.key === e.key);
            return e.above ? (
              <text key={e.key} x={e.x} y={e.y - 10} textAnchor="middle" fontSize="11" fontWeight="700" style={{ fill: "var(--text-1)", ...HALO, stroke: surface }}>
                {e.text}
              </text>
            ) : (
              <text key={e.key} x={Math.min(e.x + 7, padL + pw + 6)} y={(r?.y ?? e.y) + 4} fontSize="11" fontWeight="600" style={{ fill: "var(--text-2)", ...HALO, stroke: surface }}>
                {e.text}
              </text>
            );
          })}

          {/* crosshair */}
          {hover && (
            <line x1={X(msOf(hover.iso))} x2={X(msOf(hover.iso))} y1={PAD_T} y2={PAD_T + ph} strokeWidth="1" style={{ stroke: "var(--text-2)" }} />
          )}
          {snap.length > 0 && (
            <rect
              x={padL} y={PAD_T} width={pw} height={ph} fill="transparent" style={{ cursor: "crosshair" }}
              onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}
            />
          )}
        </svg>
      )}
      {hover && readout && width > 0 && (
        <ChartTip x={X(msOf(hover.iso))} y={hover.py} boxW={width} boxH={height} width={210}>
          <div className="font-semibold mb-1" style={{ color: "var(--text-2)" }}>{dayLabel(hover.iso, t)}</div>
          {readout(hover.iso)}
        </ChartTip>
      )}
    </div>
  );
}
