/**
 * TripleSpeedometer
 *
 * Classic instrument structure:
 *   • Wide arc (~250°) — endpoints dip below the horizontal, open bottom.
 *   • Evenly-spaced round numbers INSIDE the hollow.
 *   • Minor graduation ticks inside the band; longer marks at numbered values.
 *   • Triangular needle from a ringed hub; value displayed in the open bottom.
 *
 * Plan / Actual  → fleet-heatmap colours, range 0 → max (100 %, or heatmap
 *                  ceiling if it exceeds 100 %).
 * Difference     → comparison-table colours, range −40 → +25.
 *                  Out-of-range: needle parks a little past the edge.
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLang } from "../../context/LangContext";

// ─── Arc geometry ─────────────────────────────────────────────────────────────
const ARC_START = 215;                    // math-angle° at minVal (lower-left)
const ARC_END   = -35;                    // math-angle° at maxVal (lower-right)
const ARC_SWEEP = ARC_START - ARC_END;    // 250°

// Fixed difference range
const DIFF_MIN = -40;
const DIFF_MAX =  25;

// Fallback segments (shown while the API loads)
const FB_HEAT = [
  { from: 0,   color: "#ef4444" },
  { from: 85,  color: "#22c55e" },
  { from: 101, color: "#3b82f6" },
];
const FB_DIFF = [
  { from: -9999, color: "#3b82f6" },
  { from: -20,   color: "#22c55e" },
  { from:  1,    color: "#eab308" },
  { from:  6,    color: "#ef4444" },
];

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/** Polar → SVG xy (math convention: 0°=right, CCW positive; SVG y flipped). */
function pt(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}

/** Vertical drop of the arc endpoints below the pivot, in px. */
function endpointDrop(Ro) {
  return Ro * Math.sin((ARC_START - 180) * Math.PI / 180);   // sin(35°)·Ro
}

/**
 * SVG path for one annulus band between two math-angles (angFrom > angTo).
 * Outer arc CW (sweep=1), inner arc CCW (sweep=0); all four corners sharp.
 */
function bandPath(cx, cy, Ro, Ri, angFrom, angTo) {
  const lg = (angFrom - angTo) > 180 ? 1 : 0;
  const f  = n => n.toFixed(2);
  const os = pt(cx, cy, Ro, angFrom);
  const oe = pt(cx, cy, Ro, angTo);
  const ie = pt(cx, cy, Ri, angTo);
  const is = pt(cx, cy, Ri, angFrom);
  return [
    `M ${f(os.x)} ${f(os.y)}`,
    `A ${Ro} ${Ro} 0 ${lg} 1 ${f(oe.x)} ${f(oe.y)}`,
    `L ${f(ie.x)} ${f(ie.y)}`,
    `A ${Ri} ${Ri} 0 ${lg} 0 ${f(is.x)} ${f(is.y)}`,
    "Z",
  ].join(" ");
}

/** Map a value to its math-angle on the arc (minVal → ARC_START, maxVal → ARC_END). */
function v2a(v, min, max) {
  const t = (Math.max(min, Math.min(max, v)) - min) / (max - min);
  return ARC_START - t * ARC_SWEEP;
}

/** Plan/Actual scale ceiling: 100 %, or a heatmap threshold beyond that. */
function getGaugeMax(segs) {
  if (!segs?.length) return 100;
  const lastFrom = [...segs].sort((a, b) => a.from - b.from).slice(-1)[0].from;
  return Math.max(100, lastFrom);
}

/**
 * Return the band color for a given value (clamped to range).
 *
 * Bands are sorted by `from`; each covers the half-open interval [from, to)
 * where `to` is the next band's lower bound. We pick the last band whose lower
 * bound the value has reached, so a value sitting exactly on a threshold (e.g.
 * +1% when yellow starts at 1) belongs to the UPPER band — matching the admin
 * thresholds and the comparison table's getColor() semantics. The earlier
 * `value <= b.to` test made boundaries inclusive on both ends, so +1% wrongly
 * resolved to the green band ([-20, 1]) instead of yellow ([1, 6]).
 */
function bandColor(value, bands) {
  if (value == null || isNaN(value) || !bands?.length) return null;
  let result = bands[0];
  for (const b of bands) {
    if (value >= b.from) result = b;
    else break;
  }
  return result?.color ?? null;
}

/** Build colour bands { from, to, color } clipped to [minVal, maxVal]. */
function buildBands(segs, minVal, maxVal) {
  const sorted = [...segs].sort((a, b) => a.from - b.from);
  return sorted
    .map((seg, i) => ({
      color: seg.color,
      from:  seg.from === -9999 ? minVal : Math.max(minVal, seg.from),
      to:    i < sorted.length - 1 ? Math.min(maxVal, sorted[i + 1].from) : maxVal,
    }))
    .filter(b => b.from < b.to);
}

/** Pick a "nice" round step (…1, 2, 5, 10, 20, 50…) for ~`target` intervals. */
function niceStep(range, target = 4) {
  const raw  = range / target;
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

/**
 * Evenly-spaced scale: numbered "major" values + finer "minor" graduations.
 * Majors land on the nice step; minors subdivide each major into 5.
 */
function buildScale(minVal, maxVal) {
  const major = niceStep(maxVal - minVal, 4);
  const minor = major / 5;
  const eps   = minor * 1e-6;
  const start = Math.ceil(minVal / minor - 1e-9) * minor;

  const majors = [];
  const minors = [];
  for (let v = start; v <= maxVal + eps; v += minor) {
    const vr      = Math.round(v / minor) * minor;          // tame fp drift
    const isMajor = Math.abs(vr / major - Math.round(vr / major)) < 1e-6;
    minors.push({ v: vr, major: isMajor });
    if (isMajor) majors.push(vr);
  }
  return { majors, minors };
}

// ─── SingleGauge ─────────────────────────────────────────────────────────────

function SingleGauge({ size = 200, value, minVal = 0, maxVal = 100,
                       segments, label = "", labelFsz, isDiff = false,
                       baseY, frameH, valY }) {

  // ── Dimensions ──────────────────────────────────────────────────────────
  const Ro      = Math.round(size * 0.46);                 // outer radius
  const Ri      = Math.round(size * 0.34);                 // inner radius (thin ring)
  const sidePad = Math.round(size * 0.05);
  const W       = size + sidePad * 2;
  const cx      = W / 2;
  const cy      = baseY;                                   // shared pivot Y
  const H       = frameH;

  const valFsz  = Math.round(size * 0.085);
  const tickFsz = Math.round(size * 0.042);

  // Numbers inside the hollow
  const numR    = Ri - Math.round(size * 0.072);

  // Minor graduations inside the band's inner edge
  const gStart  = Ri - Math.round(size * 0.004);
  const gShort  = Ri - Math.round(size * 0.026);
  const gLong   = Ri - Math.round(size * 0.044);

  // Triangular needle + ringed hub
  const needleLen  = Math.round(Ro * 0.86);
  const needleBase = Math.max(2.5, size * 0.016);
  const needleTail = Math.round(size * 0.05);
  const hubR       = Math.max(4, Math.round(size * 0.036));

  // ── Value state ──────────────────────────────────────────────────────────
  const has   = value != null && !isNaN(value);
  const above = isDiff && has && value > maxVal;
  const below = isDiff && has && value < minVal;

  const mathAng = !has  ? 90
                : above ? ARC_END   - 10
                : below ? ARC_START + 10
                : v2a(value, minVal, maxVal);
  const cssRot  = 90 - mathAng;

  // ── Colour bands ─────────────────────────────────────────────────────────
  const bands = buildBands(segments ?? (isDiff ? FB_DIFF : FB_HEAT), minVal, maxVal);

  // ── Scale (evenly-spaced numbers + minor ticks) ──────────────────────────
  const scale = buildScale(minVal, maxVal);
  const numbers = scale.majors.map(v => ({
    lbl: (isDiff && v > 0 ? "+" : "") + Math.round(v),
    pos: pt(cx, cy, numR, v2a(v, minVal, maxVal)),
  }));
  const grads = scale.minors.map(({ v, major }) => {
    const ang = v2a(v, minVal, maxVal);
    return {
      a: pt(cx, cy, gStart, ang),
      b: pt(cx, cy, major ? gLong : gShort, ang),
      major,
    };
  });

  // ── Display value ─────────────────────────────────────────────────────────
  const dispVal = !has                        ? "—"
                : isDiff && value > 0         ? `+${Math.round(value)}%`
                : `${Math.round(value)}%`;

  return (
    <div style={{ display:"flex", flexDirection:"column",
                  alignItems:"center", gap:4 }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
           style={{ display:"block", overflow:"visible" }}>

        {/* ── Colour bands ──────────────────────────────────────────────── */}
        {bands.map(({ color, from, to }, i) => (
          <path key={i}
                d={bandPath(cx, cy, Ro, Ri,
                            v2a(from, minVal, maxVal),
                            v2a(to,   minVal, maxVal))}
                fill={color}
                stroke="none" />
        ))}

        {/* ── Minor graduation ticks (inside the band) ──────────────────── */}
        {grads.map(({ a, b, major }, i) => (
          <line key={i}
                x1={a.x.toFixed(1)} y1={a.y.toFixed(1)}
                x2={b.x.toFixed(1)} y2={b.y.toFixed(1)}
                stroke="var(--text-3,#94a3b8)"
                strokeWidth={major ? 1.5 : 0.8}
                strokeOpacity={major ? 0.6 : 0.34} />
        ))}

        {/* ── Numbers (inside the hollow) ───────────────────────────────── */}
        {numbers.map(({ lbl, pos }, i) => (
          <text key={i}
                x={pos.x.toFixed(1)} y={pos.y.toFixed(1)}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={tickFsz} fontWeight="500"
                fill="var(--text-3,#94a3b8)">
            {lbl}
          </text>
        ))}

        {/* ── Triangular needle + counterweight ─────────────────────────── */}
        {has && (
          <g style={{ transformOrigin: `${cx}px ${cy}px`,
                      transform: `rotate(${cssRot}deg)` }}>
            <polygon
              points={[
                `${cx},${cy - needleLen}`,
                `${cx - needleBase},${cy}`,
                `${cx},${cy + needleTail}`,
                `${cx + needleBase},${cy}`,
              ].join(" ")}
              fill="#334155" />
          </g>
        )}

        {/* ── Ringed hub ────────────────────────────────────────────────── */}
        <circle cx={cx} cy={cy} r={hubR}
                fill="var(--bg-card,#fff)"
                stroke="#334155"
                strokeWidth={Math.max(2, Math.round(size * 0.018))} />
        <circle cx={cx} cy={cy} r={Math.max(1.5, hubR * 0.34)}
                fill="#334155" />

        {/* ── Value (in the open bottom) ────────────────────────────────── */}
        <text x={cx} y={valY}
              textAnchor="middle"
              fontSize={valFsz} fontWeight="600"
              fontFamily="inherit"
              letterSpacing="-0.01em"
              fill={bandColor(value != null ? Math.max(minVal, Math.min(maxVal, value)) : null, bands) ?? "var(--text-2,#475569)"}>
          {dispVal}
        </text>
      </svg>

      {/* ── Label ────────────────────────────────────────────────────────── */}
      <div style={{ color:"var(--text-3,#94a3b8)", fontWeight:500,
                    fontSize: labelFsz ?? Math.round(size * 0.052),
                    textTransform:"uppercase", letterSpacing:"0.09em",
                    textAlign:"center" }}>
        {label}
      </div>
    </div>
  );
}

// ─── Mobile detection ─────────────────────────────────────────────────────────

const MOBILE_BP      = 768;    // below this → swipe carousel (phones)
const SLIDE_FRACTION = 0.86;   // each gauge ≈ 86% of the card width (edge peek)
const GAP            = 8;

function useIsMobile() {
  const query = `(max-width: ${MOBILE_BP - 1}px)`;
  const [mobile, setMobile] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = e => setMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return mobile;
}

/** Shared vertical frame so all gauges' pivots and value lines align. */
function sharedFrame(size) {
  const Ro     = Math.round(size * 0.46);
  const baseY  = Ro + Math.round(size * 0.05);                   // pivot Y (top room)
  const valY   = baseY + Math.round(endpointDrop(Ro)) + Math.round(size * 0.085 * 0.7);
  const frameH = valY + Math.round(size * 0.085 * 0.7);
  return { baseY, frameH, valY };
}

// ─── Mobile carousel (equal gauges, snap-centered, peek + arrows + dots) ──────

function NavArrow({ dir, visible, onClick }) {
  const Icon = dir === "left" ? ChevronLeft : ChevronRight;
  return (
    <button onClick={onClick} aria-label={dir === "left" ? "Previous gauge" : "Next gauge"}
      style={{ position:"absolute", top:"50%", [dir]: 2,
               transform:"translateY(-50%)",
               width:34, height:34, borderRadius:"50%",
               display:"flex", alignItems:"center", justifyContent:"center",
               background:"var(--bg-card,#1e293b)",
               border:"1px solid var(--border-md,#475569)",
               color:"var(--text-2,#cbd5e1)",
               boxShadow:"0 2px 8px rgba(0,0,0,0.25)",
               opacity: visible ? 0.92 : 0,
               pointerEvents: visible ? "auto" : "none",
               transition:"opacity .2s", zIndex:2, cursor:"pointer" }}>
      <Icon size={18} />
    </button>
  );
}

function GaugeCarousel({ defs }) {
  const wrapRef   = useRef(null);
  const scrollRef = useRef(null);
  const activeRef = useRef(1);                       // Difference starts centered
  const [wrapW, setWrapW]   = useState(0);
  const [active, setActive] = useState(1);

  // Track the card width (it changes with orientation / sidebar)
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWrapW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // SingleGauge renders an SVG of width size*1.1 — solve size from slide width
  const size    = Math.max(120, Math.round((wrapW * SLIDE_FRACTION) / 1.1));
  const slideW  = size + Math.round(size * 0.05) * 2;
  const edgePad = Math.max(0, Math.round((wrapW - slideW) / 2));
  const step    = slideW + GAP;
  const shared  = sharedFrame(size);

  // Center the active slide once geometry is known (and re-center on resize).
  // With symmetric edge padding, slide i is centered at scrollLeft = i * step.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !wrapW) return;
    el.scrollLeft = activeRef.current * step;
  }, [wrapW, step]);

  function onScroll(e) {
    const i = Math.min(defs.length - 1,
      Math.max(0, Math.round(e.currentTarget.scrollLeft / step)));
    activeRef.current = i;
    if (i !== active) setActive(i);
  }

  function goTo(i) {
    activeRef.current = i;
    setActive(i);
    scrollRef.current?.scrollTo({ left: i * step, behavior: "smooth" });
  }

  return (
    <div ref={wrapRef}>
      {wrapW > 0 && (
        <>
          <div style={{ position:"relative" }}>
            <div ref={scrollRef} className="no-scrollbar" onScroll={onScroll}
                 style={{ display:"flex", gap:GAP, overflowX:"auto",
                          scrollSnapType:"x mandatory",
                          WebkitOverflowScrolling:"touch",
                          padding:`8px ${edgePad}px` }}>
              {defs.map(d => (
                <div key={d.label}
                     style={{ flex:"0 0 auto", width:slideW, scrollSnapAlign:"center", scrollSnapStop:"always" }}>
                  <SingleGauge {...d} size={size}
                               labelFsz={Math.min(14, Math.round(size * 0.052))}
                               {...shared} />
                </div>
              ))}
            </div>

            {/* Prev / next arrows over the peek areas */}
            <NavArrow dir="left"  visible={active > 0}
                      onClick={() => goTo(active - 1)} />
            <NavArrow dir="right" visible={active < defs.length - 1}
                      onClick={() => goTo(active + 1)} />
          </div>

          {/* Position dots */}
          <div style={{ display:"flex", justifyContent:"center", gap:6, paddingTop:6 }}>
            {defs.map((d, i) => (
              <button key={d.label} onClick={() => goTo(i)} aria-label={d.label}
                style={{ width:8, height:8, borderRadius:"50%", border:"none",
                         padding:0, cursor:"pointer",
                         background: i === active
                           ? "var(--brand,#C8973F)"
                           : "var(--border-md,#64748b)",
                         opacity: i === active ? 1 : 0.55,
                         transition:"background .2s, opacity .2s" }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── TripleSpeedometer ────────────────────────────────────────────────────────

export default function TripleSpeedometer({
  baselineUtil, netUtil, heatmapSegments, diffSegments,
}) {
  const { t } = useLang();
  const SIDE = 160;
  const MID  = 230;

  const isMobile = useIsMobile();

  const planPct   = baselineUtil != null ? Math.round(baselineUtil * 100) : null;
  const actualPct = netUtil       != null ? Math.round(netUtil       * 100) : null;
  const diffPct   = planPct != null && actualPct != null ? planPct - actualPct : null;

  const hSegs = heatmapSegments?.length ? heatmapSegments : FB_HEAT;
  const dSegs = diffSegments?.length    ? diffSegments    : FB_DIFF;

  const paMax = getGaugeMax(hSegs);

  const defs = [
    { value: planPct,   minVal: 0,        maxVal: paMax,    segments: hSegs, label: t("gauge.workloadPlan") },
    { value: diffPct,   minVal: DIFF_MIN, maxVal: DIFF_MAX, segments: dSegs, label: t("gauge.difference"), isDiff: true },
    { value: actualPct, minVal: 0,        maxVal: paMax,    segments: hSegs, label: t("gauge.actualWorkload") },
  ];

  // Phones: equal-sized gauges in a swipeable, snap-centered carousel
  if (isMobile) return <GaugeCarousel defs={defs} />;

  // Tablets/desktop: classic row — smaller sides, prominent middle
  const shared = sharedFrame(MID);

  return (
    <div className="no-scrollbar" style={{ overflowX:"auto" }}>
    <div style={{ display:"flex", alignItems:"flex-start",
                  gap:GAP, padding:"8px 0",
                  width:"max-content", margin:"0 auto" }}>

      <SingleGauge {...defs[0]} size={SIDE} {...shared} />

      <SingleGauge {...defs[1]} size={MID}
                   labelFsz={Math.round(MID * 0.042)}
                   {...shared} />

      <SingleGauge {...defs[2]} size={SIDE} {...shared} />
    </div>
    </div>
  );
}
