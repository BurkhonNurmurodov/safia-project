// «Liderlar KPI» — THE radar («web») of one cell's KPI scores against the
// team's average, in plain SVG (2026-10-19, the operator: «definitely use
// that web chart»). One spoke per KPI in the page's order, every score as a
// share of its own scale (the audit's ends at 3, the rest at 5), rings at
// each fifth. The cell is the emphasis — brand gold, filled — and the team
// the reference, a dashed neutral outline. A KPI the platform does not
// compute yet keeps its spoke, dimmed, with no vertex: «not measured» must
// never read as a score of 0. A KPI with no score this month has no vertex
// either; its label says «—».
//
// Every score is printed in its axis label, so the chart needs no ticks and
// no tooltip: hovering a label (or the list beside the chart, through
// `active` / `onHover`) lights its spoke; a click opens that KPI's working.
import { fracTone } from "./kpiUtil";
import { TONE_HEX } from "../../utils/statusBands";
import { Delta } from "./KpiBits";

const W = 480;
const H = 340;
const CX = 240;
const CY = 180;
const R = 118;
const GAP = 14;                       // label anchor beyond the outer ring
const RINGS = [0.2, 0.4, 0.6, 0.8, 1];

const at = (i, n, f) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return { x: CX + Math.cos(a) * R * f, y: CY + Math.sin(a) * R * f, c: Math.cos(a), s: Math.sin(a) };
};
const pts = (list) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
const share = (v, max) => Math.max(0, Math.min(1, v / (max || 5)));

export default function KpiRadar({ axes, name, T, active = null, onHover, onAxis }) {
  const n = axes.length;
  const ring = (f) => pts(axes.map((_, i) => at(i, n, f)));
  const cell = axes.map((a, i) => (a.live && a.value != null ? { ...at(i, n, share(a.value, a.max)), key: a.key } : null)).filter(Boolean);
  const team = axes.map((a, i) => (a.live && a.team != null ? at(i, n, share(a.team, a.max)) : null)).filter(Boolean);
  const aria = axes.filter((a) => a.live)
    .map((a) => `${a.full}: ${a.value ?? "—"} / ${a.max}${a.team != null ? ` (${T.bdTeam.replace("{v}", a.team.toFixed(1))})` : ""}`)
    .join("; ");

  return (
    <figure className="w-full">
      <div className="relative w-full mx-auto" style={{ maxWidth: W, aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full overflow-visible" role="img"
          aria-label={`${name}: ${aria}`}>
          {/* the plate, the rings (a fifth of the scale each) and the spokes */}
          <polygon points={ring(1)} fill="var(--bg-card)" />
          {RINGS.map((f) => (
            <polygon key={f} points={ring(f)} fill="none" vectorEffect="non-scaling-stroke"
              stroke={f === 1 ? "var(--text-4)" : "var(--border-md)"} strokeOpacity={f === 1 ? 0.55 : 1} strokeWidth={1} />
          ))}
          {axes.map((a, i) => {
            const o = at(i, n, 1);
            const on = active === a.key;
            return (
              <line key={a.key} x1={CX} y1={CY} x2={o.x} y2={o.y} vectorEffect="non-scaling-stroke"
                stroke={on ? "var(--brand)" : "var(--border-md)"} strokeWidth={on ? 1.5 : 1}
                strokeOpacity={a.live ? 1 : 0.5} />
            );
          })}
          {/* the team: a dashed outline — the reference, not the subject */}
          {team.length >= 2 && (
            <polygon points={pts(team)} fill="var(--text-3)" fillOpacity={0.05} stroke="var(--text-3)"
              strokeWidth={1.5} strokeDasharray="5 4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          )}
          {/* the cell: the emphasis */}
          <g className="kpi-radar-in" style={{ transformOrigin: `${CX}px ${CY}px` }}>
            {cell.length >= 2 && (
              <polygon points={pts(cell)} fill="var(--brand)" fillOpacity={0.22} stroke="var(--brand)"
                strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            )}
            {cell.map((p) => (
              <circle key={p.key} cx={p.x} cy={p.y} r={active === p.key ? 6 : 4.5} fill="var(--brand)"
                stroke="var(--bg-card)" strokeWidth={2} vectorEffect="non-scaling-stroke"
                style={{ transition: "r .15s ease" }} />
            ))}
          </g>
        </svg>

        {axes.map((a, i) => {
          const o = at(i, n, 1);
          const lx = CX + o.c * (R + GAP);
          const ly = CY + o.s * (R + GAP);
          const h = Math.abs(o.c) < 0.25 ? "center" : o.c > 0 ? "left" : "right";
          const v = o.s < -0.6 ? "above" : o.s > 0.6 ? "below" : "middle";
          const style = {
            left: `${(lx / W) * 100}%`,
            top: `${(ly / H) * 100}%`,
            transform: `translate(${h === "center" ? "-50%" : h === "left" ? "0" : "-100%"}, ${v === "above" ? "-100%" : v === "below" ? "0" : "-50%"})`,
            textAlign: h,
            maxWidth: h === "center" ? "44%" : "27%",
          };
          if (!a.live) {
            return (
              <div key={a.key} className="absolute px-1 leading-tight" style={style}>
                <span className="block text-[11px] font-medium" style={{ color: "var(--text-4)" }}>{a.label}</span>
                <span className="block text-[10px] mt-0.5" style={{ color: "var(--text-4)" }}>{T.bdNotLive}</span>
              </div>
            );
          }
          const on = active === a.key;
          const tone = fracTone(a.value, a.max);
          return (
            <button key={a.key} type="button" className="absolute rounded-md px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
              style={style}
              onClick={() => onAxis?.(a.key)}
              onMouseEnter={() => onHover?.(a.key)} onMouseLeave={() => onHover?.(null)}
              onFocus={() => onHover?.(a.key)} onBlur={() => onHover?.(null)}
              aria-label={`${a.full}: ${a.value ?? "—"} / ${a.max}`}>
              <span className="block text-[11px] font-medium leading-tight transition-colors"
                style={{ color: on ? "var(--text-1)" : "var(--text-2)" }}>{a.label}</span>
              <span className={`mt-1 flex items-center gap-1 ${h === "center" ? "justify-center" : h === "left" ? "justify-start" : "justify-end"}`}>
                {tone && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: TONE_HEX[tone] }} aria-hidden />}
                <span className="text-[17px] font-bold leading-none" style={{ color: a.value == null ? "var(--text-4)" : "var(--text-1)" }}>
                  {a.value ?? "—"}
                </span>
                <span className="text-[11px] leading-none" style={{ color: "var(--text-3)" }}>/{a.max}</span>
                {a.delta != null && <Delta d={a.delta} />}
              </span>
            </button>
          );
        })}
      </div>

      <figcaption className="mt-2 flex items-center justify-center gap-x-5 gap-y-1 flex-wrap text-xs" style={{ color: "var(--text-2)" }}>
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <svg width="20" height="10" aria-hidden className="flex-shrink-0">
            <line x1="1" y1="5" x2="19" y2="5" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="10" cy="5" r="3.5" fill="var(--brand)" stroke="var(--bg-inner)" strokeWidth="1.5" />
          </svg>
          <span className="truncate">{name}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="20" height="10" aria-hidden className="flex-shrink-0">
            <line x1="1" y1="5" x2="19" y2="5" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="5 4" />
          </svg>
          {T.bdTeamLegend}
        </span>
      </figcaption>
    </figure>
  );
}
