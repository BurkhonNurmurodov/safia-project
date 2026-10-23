// «Kutish xaritasi» — WHO waited and HOW LONG (/downtime → «Tahlil»,
// 2026-10-23, the operator: «x is the number of people who waited, y is the
// wait time, the bubble's size is the two multiplied, its colour the
// category»). Plain SVG, because two things it needs no chart library here
// draws: LOG axes on both sides, and diagonal guides.
//
// On log-log axes every point where people × minutes is the same lies on ONE
// straight diagonal (log x + log y = const), so the dashed lines are «equal
// person-hours» — the Our World in Data trick, turned the other way. A bubble
// above a line cost more of the plant's time than one below it, whatever its
// shape: 2 people for 5 hours and 20 people for 30 minutes sit on the same
// line. The bubble's AREA says the same thing again, so the biggest losses
// read at a glance and the diagonals let a reader compare two of them exactly.
//
// Every figure comes from `GET /api/downtime/bubbles`
// (services/ojidaniya_bubbles); nothing is computed here but pixels. A minute
// with no headcount has no x and is not drawn — the page counts it under the
// chart instead.
//
// Hover previews a bubble; a tap PINS it, and the pinned card carries the way
// into the existing per-unit detail (`onOpen`). The legend's chips are the
// page's own category filter (the doughnut's), and hovering one lights only
// that category — twelve hues in one scatter cannot all be told apart, so the
// legend is how a reader isolates one.
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { ArrowRight } from "lucide-react";
import useElementWidth from "../../hooks/useElementWidth";
import { catColor, CATS } from "./categories";
import { shortPerson } from "../../utils/personName";

const M = { top: 14, right: 16, bottom: 44, left: 58 };
const X_TICKS = [0.5, 1, 2, 3, 5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1000];
const Y_TICKS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 300, 600, 900, 1200, 1800, 3000,
  6000, 12000, 18000, 30000, 60000, 120000];
// Equal person-HOURS guides, a 1-2-5 sequence; thinned to the room below.
const ISO_PH = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

const log = Math.log10;
const fmtNum = (v, d = 0) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = d ? v.toFixed(d) : String(Math.round(v));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};
// A headcount is a FACT — fractional only where a work centre is shared or a
// worker split — so it keeps its decimal only when it has one.
export const fmtPeople = (v) => {
  if (v == null) return "—";
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};
export const fmtPersonHours = (pm) => {
  const h = (pm || 0) / 60;
  return h < 10 ? fmtNum(h, 1) : fmtNum(h);
};

function domain(vals, pad) {
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  if (!(lo > 0)) return [1, 10];
  if (hi / lo < 4) {
    const mid = Math.sqrt(lo * hi);
    return [mid / 3, mid * 3];
  }
  return [lo / pad, hi * pad];
}

export default function IdleBubbleChart({
  points, grain, t, tl, fmt, unit, minLabel, hrsLabel, catFull,
  selectedCats, onToggleCat, onOpen, height = 440,
}) {
  const [wrapRef, width] = useElementWidth();
  const [hover, setHover] = useState(null);      // point key under the pointer
  const [pinned, setPinned] = useState(null);    // point key a tap fixed
  const [catHover, setCatHover] = useState(null);
  const [kbd, setKbd] = useState(-1);            // keyboard walk, biggest first
  const svgRef = useRef(null);

  const W = Math.max(width, 280);
  const narrow = W < 560;
  const H = narrow ? Math.min(height, 380) : height;
  const pw = W - M.left - M.right;
  const ph = H - M.top - M.bottom;

  // Points left after the page's narrowing, biggest first — the keyboard walk
  // and the label pass both read this order.
  const pts = useMemo(
    () => (points || []).filter((p) => p.minutes > 0 && p.people > 0)
      .sort((a, b) => b.person_min - a.person_min),
    [points]);

  const geo = useMemo(() => {
    if (!pts.length || pw <= 0 || ph <= 0) return null;
    const [x0, x1] = domain(pts.map((p) => p.people), 1.35);
    const [y0, y1] = domain(pts.map((p) => p.minutes), 1.5);
    const lx0 = log(x0), lx1 = log(x1), ly0 = log(y0), ly1 = log(y1);
    const sx = (v) => M.left + ((log(v) - lx0) / (lx1 - lx0)) * pw;
    const sy = (v) => M.top + ph - ((log(v) - ly0) / (ly1 - ly0)) * ph;
    const pmMax = pts[0].person_min || 1;
    const rMax = Math.max(12, Math.min(34, W / 24));
    const rOf = (pm) => Math.max(3, rMax * Math.sqrt(pm / pmMax));

    const thin = (cands, at, gap) => {
      const out = [];
      let last = -Infinity;
      for (const v of cands) {
        const p = at(v);
        if (Math.abs(p - last) >= gap) { out.push(v); last = p; }
      }
      return out;
    };
    const xTicks = thin(X_TICKS.filter((v) => v >= x0 && v <= x1), sx, narrow ? 30 : 38);
    const yTicks = thin(Y_TICKS.filter((v) => v >= y0 && v <= y1).reverse(), sy, 22);

    // Iso-lines: y = K / x across the plot, clipped to it. Spaced at least
    // ~70px apart along the plot's diagonal so they stay guides, not a grid.
    const pxPerDecX = pw / (lx1 - lx0);
    const pxPerDecY = ph / (ly1 - ly0);
    const angle = (Math.atan2(pxPerDecY, pxPerDecX) * 180) / Math.PI;
    // Perpendicular pixel distance between two diagonals Δ decades apart is
    // Δ·a·b/√(a²+b²); keep it at least 70px.
    const decGap = (70 * Math.hypot(pxPerDecX, pxPerDecY)) / (pxPerDecX * pxPerDecY);
    const iso = [];
    let lastLk = -Infinity;
    for (const ph_ of ISO_PH) {
      const K = ph_ * 60;
      const lk = log(K);
      if (lk - lastLk < decGap) continue;
      // where the line meets the plot: x from max(x0, K/y1) to min(x1, K/y0)
      const xa = Math.max(x0, K / y1);
      const xb = Math.min(x1, K / y0);
      if (!(xb > xa * 1.02)) continue;
      iso.push({ ph: ph_, x1: sx(xa), y1: sy(K / xa), x2: sx(xb), y2: sy(K / xb) });
      lastLk = lk;
    }

    const placed = pts.map((p) => ({
      ...p, cx: sx(p.people), cy: sy(p.minutes), r: rOf(p.person_min),
    }));

    // Each guide's label goes where the line is EMPTY: candidates along it,
    // the one whose text crosses the fewest bubbles wins (ties → the upper
    // left end, where Our World in Data puts theirs).
    const ux = Math.cos((angle * Math.PI) / 180);
    const uy = Math.sin((angle * Math.PI) / 180);
    for (const l of iso) {
      const len = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
      const tw = 78;
      let best = null;
      for (let f = 0.02; f <= 0.98; f += 0.06) {
        const ax = l.x1 + (l.x2 - l.x1) * f;
        const ay = l.y1 + (l.y2 - l.y1) * f;
        if (f * len + tw > len) break;
        let hits = 0;
        for (let k = 0; k <= 4; k++) {
          const qx = ax + ux * (tw * k) / 4 + uy * 6;
          const qy = ay + uy * (tw * k) / 4 - ux * 6;
          for (const p of placed) if (Math.hypot(p.cx - qx, p.cy - qy) < p.r + 3) hits++;
        }
        if (!best || hits < best.hits) best = { hits, x: ax, y: ay };
        if (hits === 0) break;
      }
      l.lx = best ? best.x : l.x1;
      l.ly = best ? best.y : l.y1;
    }
    return { sx, sy, xTicks, yTicks, iso, angle, placed, x0, x1, y0, y1 };
  }, [pts, pw, ph, W, narrow]);

  const byKey = useMemo(() => {
    const m = new Map();
    (geo?.placed || []).forEach((p) => m.set(p.key, p));
    return m;
  }, [geo]);

  // Pinned / hovered point vanished with a refetch → forget it.
  useEffect(() => {
    if (pinned && !byKey.has(pinned)) setPinned(null);
    if (hover && !byKey.has(hover)) setHover(null);
  }, [byKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const labelOf = useCallback((p) => {
    if (grain === "unit") return shortPerson(tl(p.manager || ""));
    return p.code || "";
  }, [grain, tl]);

  // Direct labels on the biggest bubbles, greedily, never on top of each other.
  const labels = useMemo(() => {
    if (!geo) return [];
    const max = narrow ? 5 : 10;
    const out = [];
    const boxes = [];
    const named = new Set();
    for (const p of geo.placed) {
      if (out.length >= max) break;
      const txt = labelOf(p);
      // A cell carries one bubble per cause; it is named once, on its biggest.
      if (!txt || named.has(txt)) continue;
      const w = txt.length * 6.2 + 4;
      const hgt = 13;
      let x = p.cx + p.r + 4;
      let anchor = "start";
      if (x + w > M.left + pw) { x = p.cx - p.r - 4; anchor = "end"; }
      const bx = anchor === "start" ? x : x - w;
      const box = [bx, p.cy - hgt / 2, bx + w, p.cy + hgt / 2];
      if (box[0] < M.left || box[1] < M.top - 4 || box[3] > M.top + ph + 4) continue;
      if (boxes.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
      boxes.push(box);
      named.add(txt);
      out.push({ key: p.key, x, y: p.cy, anchor, txt, cat: p.category });
    }
    return out;
  }, [geo, narrow, pw, ph, labelOf]);

  // Hit test: every bubble whose disc (or a 10px pad around a small one)
  // holds the pointer; the smallest wins, because it is drawn on top.
  const hitAt = (mx, my) => {
    if (!geo) return null;
    let best = null;
    for (const p of geo.placed) {
      const d = Math.hypot(p.cx - mx, p.cy - my);
      if (d > Math.max(p.r, 10)) continue;
      if (!best || p.r < best.r || (p.r === best.r && d < best.d)) best = { ...p, d };
    }
    return best?.key || null;
  };
  const local = (e) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return [0, 0];
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };

  const active = pinned || hover || (kbd >= 0 ? geo?.placed[kbd]?.key : null);
  const activeP = active ? byKey.get(active) : null;
  const focusCat = catHover;

  const opacityOf = (p) => {
    if (focusCat) return p.category === focusCat ? 0.85 : 0.08;
    if (activeP) return p.key === activeP.key ? 0.92 : 0.28;
    return 0.62;
  };

  const yTick = (v) => {
    if (unit === "hrs" && v >= 60) return `${fmtNum(v / 60)} ${hrsLabel}`;
    return `${fmtNum(v)} ${minLabel}`;
  };

  const legendCats = useMemo(() => {
    const present = new Set(pts.map((p) => p.category));
    return CATS.map((c) => c.name).filter((n) => present.has(n))
      .concat([...present].filter((n) => !CATS.some((c) => c.name === n)));
  }, [pts]);

  const onKey = (e) => {
    if (!geo?.placed.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault(); setPinned(null); setKbd((i) => Math.min(geo.placed.length - 1, i + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault(); setPinned(null); setKbd((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && activeP) {
      e.preventDefault(); onOpen?.(activeP);
    } else if (e.key === "Escape") {
      if (pinned || kbd >= 0) { e.preventDefault(); setPinned(null); setKbd(-1); }
    }
  };

  // The card, placed beside the bubble and flipped to stay inside the plot.
  const tip = activeP ? (() => {
    const tw = narrow ? Math.min(250, W - 16) : 270;
    let left = activeP.cx + activeP.r + 10;
    if (left + tw > W - 4) left = activeP.cx - activeP.r - 10 - tw;
    if (left < 4) left = Math.max(4, Math.min(W - tw - 4, activeP.cx - tw / 2));
    const top = Math.max(4, Math.min(H - 150, activeP.cy - 40));
    return { tw, left, top };
  })() : null;

  const title = activeP && (grain === "unit"
    ? tl(activeP.manager || "")
    : [activeP.code, activeP.leader ? shortPerson(tl(activeP.leader)) : null].filter(Boolean).join(" · "));
  const sub = activeP && (grain === "unit"
    ? null
    : grain === "event"
      ? `${(activeP.date || "").slice(8, 10)}.${(activeP.date || "").slice(5, 7)} · ${activeP.start}–${activeP.end} · ${tl(activeP.manager || "")}`
      : tl(activeP.manager || ""));
  const varies = activeP && activeP.people_lo != null && activeP.people_hi != null
    && activeP.people_lo !== activeP.people_hi;

  const aria = t("downtime.bub.aria").replace("{n}", String(pts.length));

  return (
    <div>
      <div ref={wrapRef} className="relative w-full" style={{ height: H }}>
        {width > 0 && geo && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            role="img"
            aria-label={aria}
            tabIndex={0}
            onKeyDown={onKey}
            onBlur={() => setKbd(-1)}
            className="block outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] rounded-lg"
            style={{ touchAction: "manipulation" }}
            onPointerMove={(e) => { if (e.pointerType === "mouse") { const [x, y] = local(e); setHover(hitAt(x, y)); } }}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => {
              const [x, y] = local(e);
              const k = hitAt(x, y);
              setKbd(-1);
              setPinned((cur) => (k && k !== cur ? k : null));
            }}
          >
            {/* the plot plate and its grid */}
            <rect x={M.left} y={M.top} width={pw} height={ph} fill="var(--bg-inner)" fillOpacity={0.35} rx={6} />
            {geo.xTicks.map((v) => (
              <g key={`x${v}`}>
                <line x1={geo.sx(v)} x2={geo.sx(v)} y1={M.top} y2={M.top + ph} stroke="var(--border)" strokeWidth={1} />
                <text x={geo.sx(v)} y={M.top + ph + 16} textAnchor="middle" fontSize={10.5} fill="var(--text-3)">
                  {fmtPeople(v)}
                </text>
              </g>
            ))}
            {geo.yTicks.map((v) => (
              <g key={`y${v}`}>
                <line x1={M.left} x2={M.left + pw} y1={geo.sy(v)} y2={geo.sy(v)} stroke="var(--border)" strokeWidth={1} />
                <text x={M.left - 6} y={geo.sy(v) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--text-3)">
                  {yTick(v)}
                </text>
              </g>
            ))}
            <text x={M.left + pw / 2} y={H - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text-2)">
              {t("downtime.bub.x")}
            </text>
            <text
              x={12} y={M.top + ph / 2} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text-2)"
              transform={`rotate(-90 12 ${M.top + ph / 2})`}
            >
              {t("downtime.bub.y")}
            </text>

            {/* equal person-hours: the diagonals */}
            {geo.iso.map((l) => (
              <g key={`iso${l.ph}`} pointerEvents="none">
                <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="var(--text-4)" strokeWidth={1}
                  strokeDasharray="4 4" strokeOpacity={0.75} />
                <text
                  x={l.lx} y={l.ly} fontSize={10} fill="var(--text-3)"
                  transform={`rotate(${geo.angle} ${l.lx} ${l.ly})`}
                  dx={4} dy={-4}
                  style={{ paintOrder: "stroke", stroke: "var(--bg-card)", strokeWidth: 3, strokeLinejoin: "round" }}
                >
                  {t("downtime.bub.iso").replace("{n}", fmtNum(l.ph, l.ph < 1 ? 1 : 0))}
                </text>
              </g>
            ))}

            {/* the bubbles — biggest first, so a small one is never hidden */}
            <g>
              {geo.placed.map((p) => {
                const c = catColor(p.category);
                const on = activeP?.key === p.key;
                return (
                  <circle
                    key={p.key}
                    cx={p.cx} cy={p.cy} r={p.r}
                    fill={c}
                    fillOpacity={opacityOf(p)}
                    stroke={on ? "var(--text-1)" : "var(--bg-card)"}
                    strokeWidth={on ? 2 : 1.25}
                    style={{ transition: "fill-opacity .15s ease" }}
                  />
                );
              })}
            </g>
            {/* the active bubble once more, on top of everything */}
            {activeP && (
              <circle cx={activeP.cx} cy={activeP.cy} r={activeP.r} fill="none"
                stroke="var(--text-1)" strokeWidth={2} pointerEvents="none" />
            )}
            {labels.map((l) => (
              <text
                key={`l${l.key}`} x={l.x} y={l.y + 3.5} textAnchor={l.anchor} fontSize={10.5} fontWeight={600}
                fill="var(--text-2)" pointerEvents="none"
                opacity={focusCat && focusCat !== l.cat ? 0.15 : 1}
                style={{ paintOrder: "stroke", stroke: "var(--bg-card)", strokeWidth: 3, strokeLinejoin: "round" }}
              >
                {l.txt}
              </text>
            ))}
          </svg>
        )}

        {activeP && tip && (
          <div
            className="absolute z-10 rounded-xl p-3 text-xs shadow-lg"
            style={{
              left: tip.left, top: tip.top, width: tip.tw,
              background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-1)",
              pointerEvents: pinned ? "auto" : "none",
            }}
            role={pinned ? "dialog" : "status"}
          >
            <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
              <span className="shrink-0 rounded-full" style={{ width: 9, height: 9, background: catColor(activeP.category) }} />
              <span className="truncate font-medium" style={{ color: "var(--text-2)" }} title={catFull(activeP.category)}>
                {catFull(activeP.category)}
              </span>
            </div>
            <div className="font-semibold text-[13px] truncate" title={title}>{title}</div>
            {sub && <div className="truncate mb-2" style={{ color: "var(--text-3)" }}>{sub}</div>}
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tabular-nums">
              <dt style={{ color: "var(--text-3)" }}>{t("downtime.bub.people")}</dt>
              <dd className="text-right font-medium">
                {fmtPeople(activeP.people)}
                {varies && (
                  <span className="font-normal" style={{ color: "var(--text-3)" }}>
                    {" "}({fmtPeople(activeP.people_lo)}–{fmtPeople(activeP.people_hi)})
                  </span>
                )}
              </dd>
              <dt style={{ color: "var(--text-3)" }}>{t("downtime.bub.minutes")}</dt>
              <dd className="text-right font-medium">{fmt(activeP.minutes, 0)}</dd>
              <dt style={{ color: "var(--text-3)" }}>{t("downtime.bub.pm")}</dt>
              <dd className="text-right font-semibold">{fmtPersonHours(activeP.person_min)}</dd>
              {grain !== "event" && (<>
                <dt style={{ color: "var(--text-3)" }}>{t("downtime.bub.events")}</dt>
                <dd className="text-right">
                  {activeP.events} · {t("downtime.bub.daysN").replace("{n}", String(activeP.days))}
                  {grain === "unit" && ` · ${t("downtime.bub.cellsN").replace("{n}", String(activeP.cells))}`}
                </dd>
              </>)}
              {grain === "event" && activeP.cleaners != null && (<>
                <dt style={{ color: "var(--text-3)" }}>{t("idleCell.cleaners")}</dt>
                <dd className="text-right">{activeP.cleaners}</dd>
              </>)}
            </dl>
            {activeP.unplaced > 0 && (
              <div className="mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                {t("downtime.bub.unplacedRow").replace("{m}", fmt(activeP.unplaced, 0))}
              </div>
            )}
            {grain === "event" && activeP.note && (
              <div className="mt-1.5 text-[11px] line-clamp-3" style={{ color: "var(--text-2)" }}>
                «{activeP.note}»
              </div>
            )}
            {pinned ? (
              <button
                type="button"
                onClick={() => onOpen?.(activeP)}
                className="mt-2 w-full inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
              >
                {t("downtime.bub.open")} <ArrowRight size={13} />
              </button>
            ) : (
              <div className="mt-1.5 text-[10.5px]" style={{ color: "var(--text-4)" }}>{t("downtime.bub.tapHint")}</div>
            )}
          </div>
        )}
      </div>

      {/* the colour key — the page's own category filter */}
      <div className="flex flex-wrap items-center gap-1.5 mt-2" onMouseLeave={() => setCatHover(null)}>
        {legendCats.map((cat) => {
          const c = catColor(cat);
          const on = selectedCats.includes(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => onToggleCat(cat)}
              onMouseEnter={() => setCatHover(cat)}
              onFocus={() => setCatHover(cat)}
              onBlur={() => setCatHover(null)}
              title={catFull(cat)}
              aria-pressed={on}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium min-h-[28px]"
              style={{
                background: on ? `${c}22` : "var(--bg-inner)",
                border: `1px solid ${on ? `${c}88` : "var(--border)"}`,
                color: "var(--text-2)",
              }}
            >
              <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: c }} />
              {cat}
            </button>
          );
        })}
      </div>
    </div>
  );
}
