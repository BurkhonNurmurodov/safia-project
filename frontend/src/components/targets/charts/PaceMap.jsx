// «Plan vs actual» — every goal as ONE dot: how much of its period has passed
// (x) against how much of it is done (y). The diagonal is the plan (half the
// time gone, half the work done), and the three washes behind it ARE the
// status rule: on or above the corridor is on track, a band under it is at
// risk, below that is behind. A goal whose date has passed sits in the strip
// on the right. So the reason behind every card's chip is visible at once,
// with no sentence to read.
//
// Two continuous measures per goal → a scatter. Status colour marks each dot,
// the names are direct labels where they fit, and the tooltip (hover, focus,
// or a tap on a phone) carries the rest; a click opens the goal.
import { useMemo, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import useElementWidth from "../../../hooks/useElementWidth";
import ChartTip from "./ChartTip";
import { StatusChip } from "../bits";
import { MARK_COLOR, ZONE, scale, clamp, textPx } from "./chartKit";
import { PACE, STATUS_RANK, fmtPct, fill } from "../../../utils/targets";

const PAD = { l: 40, r: 14, t: 24, b: 38 };
const OVER = 0.16; // the «past due» strip, as a share of one period
const HALO = { stroke: "var(--bg-card)", strokeWidth: 3, paintOrder: "stroke", strokeLinejoin: "round" };
const short = (s, n = 22) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export default function PaceMap({ rows, t, onOpen, dueText }) {
  const [ref, width] = useElementWidth();
  const [active, setActive] = useState(null); // { id, touch }
  // How the last press was made: a click event does not say in every browser.
  const pressType = useRef("mouse");

  const dated = useMemo(() => rows.filter((r) => r.e !== null), [rows]);
  const hasOver = dated.some((r) => r.st === "overdue");
  const xMax = hasOver ? 1 + OVER : 1;
  const height = clamp(Math.round(width * 0.62), 250, 360);
  const pw = Math.max(60, width - PAD.l - PAD.r);
  const ph = height - PAD.t - PAD.b;
  const X = scale(0, xMax, PAD.l, PAD.l + pw);
  const Y = scale(0, 1, PAD.t + ph, PAD.t);
  const g = PACE.grace;
  const rk = PACE.risk;

  // Past-due goals share the strip; spread them so none hides another.
  const overIds = dated.filter((r) => r.st === "overdue").map((r) => r.g.id);
  const pts = dated.map((r) => {
    const xv = r.st === "overdue" ? 1 + OVER * (0.3 + 0.2 * (overIds.indexOf(r.g.id) % 3)) : r.e;
    return { r, x: X(xv), y: Y(r.p), color: MARK_COLOR[r.st] };
  });

  // Direct labels: urgent goals first, each on the first side (right, left,
  // above, below) that stays in the plot and clear of every dot and label.
  const planAngle = (-Math.atan2(Y(0) - Y(1), X(1) - X(0)) * 180) / Math.PI;
  const { labels, planAt } = (() => {
    if (!width) return { labels: new Map(), planAt: null };
    const placed = [];
    const out = new Map();
    const hitsDot = (b) => pts.some((p) => p.x + 7 > b.x && p.x - 7 < b.x + b.w && p.y + 7 > b.y && p.y - 7 < b.y + b.h);
    const hitsLabel = (b) => placed.some((q) => b.x < q.x + q.w && b.x + b.w > q.x && b.y < q.y + q.h && b.y + b.h > q.y);
    const inside = (b) => b.x >= PAD.l + 2 && b.x + b.w <= PAD.l + pw - 2 && b.y >= PAD.t && b.y + b.h <= PAD.t + ph;
    // Most urgent first (overdue, behind, at risk…), so a crowded corner
    // keeps the names that matter.
    const order = [...pts].sort((a, b) => STATUS_RANK[a.r.st] - STATUS_RANK[b.r.st]);
    order.forEach((p) => {
      const text = short(p.r.g.title, width < 480 ? 16 : 24);
      const w = textPx(text), h = 13;
      const tries = [
        { x: p.x + 10, y: p.y - h / 2, a: "start" },
        { x: p.x - 10 - w, y: p.y - h / 2, a: "end" },
        { x: p.x - w / 2, y: p.y - h - 9, a: "middle" },
        { x: p.x - w / 2, y: p.y + 9, a: "middle" },
        // corners, for a dot sitting on an edge of the plot
        { x: p.x + 7, y: p.y - h - 7, a: "start" },
        { x: p.x - 7 - w, y: p.y - h - 7, a: "end" },
        { x: p.x + 7, y: p.y + 7, a: "start" },
        { x: p.x - 7 - w, y: p.y + 7, a: "end" },
      ];
      const ok = tries.find((c) => { const b = { ...c, w, h }; return inside(b) && !hitsLabel(b) && !hitsDot(b); });
      if (ok) {
        placed.push({ x: ok.x, y: ok.y, w, h });
        out.set(p.r.g.id, { text, x: ok.a === "start" ? ok.x : ok.a === "end" ? ok.x + w : ok.x + w / 2, y: ok.y + 10, a: ok.a });
      }
    });

    // The «Plan» word rides the diagonal wherever it is clear of every dot and
    // name — placed LAST, because a goal's name matters more than the word
    // explaining a line the legend also names. No clear spot: no word.
    const planText = t("targets.chart.pace.plan");
    const pw2 = textPx(planText, 10) / 2;
    const ph2 = 10;
    const rad = (planAngle * Math.PI) / 180;
    const corners = [[-pw2, 0], [pw2, 0], [-pw2, -ph2], [pw2, -ph2]];
    const at = [0.62, 0.46, 0.76, 0.32, 0.88, 0.2].find((v) => {
      const ax = X(v), ay = Y(v) - 6;
      const xs = corners.map(([cx, cy]) => ax + cx * Math.cos(rad) - cy * Math.sin(rad));
      const ys = corners.map(([cx, cy]) => ay + cx * Math.sin(rad) + cy * Math.cos(rad));
      const b = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      return inside(b) && !hitsLabel(b) && !hitsDot(b);
    });
    return { labels: out, planAt: at ?? null };
  })();

  const poly = (list) => list.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const act = active && pts.find((p) => p.r.g.id === active.id);
  const openOrShow = (p, touch) => {
    if (!touch) { onOpen(p.r.g.id); return; }
    if (active?.id === p.r.g.id) onOpen(p.r.g.id);
    else setActive({ id: p.r.g.id, touch: true });
  };

  const undated = rows.length - dated.length;
  const legend = [
    { color: ZONE.ok, text: t("targets.chart.pace.legendOk") },
    { color: ZONE.risk, text: fill(t("targets.chart.pace.legendRisk"), { grace: Math.round(g * 100), risk: Math.round(rk * 100) }) },
    { color: ZONE.behind, text: fill(t("targets.chart.pace.legendBehind"), { risk: Math.round(rk * 100) }) },
  ];

  return (
    <div className="px-4 pb-4 pt-2">
      <div ref={ref} className="relative w-full" style={{ height: width ? height : 250 }}>
        {width > 0 && (
          <svg
            width={width} height={height} className="block" role="img"
            aria-label={fill(t("targets.chart.pace.aria"), { n: dated.length })}
            onPointerDown={(ev) => { if (ev.target === ev.currentTarget) setActive(null); }}
          >
            {/* the status rule as three washes */}
            <polygon points={poly([[0, 0], [g, 0], [1, 1 - g], [1, 1], [0, 1]])} style={{ fill: ZONE.ok, fillOpacity: 0.09 }} />
            <polygon points={poly([[g, 0], [rk, 0], [1, 1 - rk], [1, 1 - g]])} style={{ fill: ZONE.risk, fillOpacity: 0.13 }} />
            <polygon points={poly([[rk, 0], [1, 0], [1, 1 - rk]])} style={{ fill: ZONE.behind, fillOpacity: 0.1 }} />
            {hasOver && (
              <>
                <rect x={X(1)} y={Y(1)} width={X(xMax) - X(1)} height={ph} style={{ fill: ZONE.behind, fillOpacity: 0.16 }} />
                <text x={(X(1) + X(xMax)) / 2} y={PAD.t - 8} textAnchor="middle" fontSize="10" fontWeight="600" style={{ fill: "var(--text-2)" }}>
                  {t("targets.chart.pace.overdue")}
                </text>
              </>
            )}

            {/* hairline grid + axes */}
            {ticks.map((v) => (
              <g key={v}>
                <line x1={X(0)} x2={X(xMax)} y1={Y(v)} y2={Y(v)} strokeWidth="1" style={{ stroke: "var(--bg-accent)" }} />
                <line x1={X(v)} x2={X(v)} y1={Y(0)} y2={Y(1)} strokeWidth="1" style={{ stroke: "var(--bg-accent)" }} />
                <text x={X(0) - 6} y={Y(v) + 3.5} textAnchor="end" fontSize="10" className="tabular-nums" style={{ fill: "var(--text-3)" }}>
                  {Math.round(v * 100)}%
                </text>
                <text x={X(v)} y={Y(0) + 14} textAnchor={v === 0 ? "start" : v === 1 ? "middle" : "middle"} fontSize="10" className="tabular-nums" style={{ fill: "var(--text-3)" }}>
                  {Math.round(v * 100)}%
                </text>
              </g>
            ))}
            <text x={X(0) - 34} y={PAD.t - 10} fontSize="10" fontWeight="600" style={{ fill: "var(--text-2)" }}>
              ↑ {t("targets.chart.pace.y")}
            </text>
            <text x={X(1)} y={height - 4} textAnchor="end" fontSize="10" fontWeight="600" style={{ fill: "var(--text-2)" }}>
              {t("targets.chart.pace.x")} →
            </text>

            {/* the plan */}
            <line x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(1)} strokeWidth="1.5" strokeDasharray="5 4" style={{ stroke: "var(--text-2)" }} />
            {planAt !== null && (
              <text
                x={X(planAt)} y={Y(planAt) - 6} fontSize="10" fontWeight="600" textAnchor="middle"
                transform={`rotate(${planAngle} ${X(planAt)} ${Y(planAt) - 6})`} style={{ fill: "var(--text-2)", ...HALO }}
              >
                {t("targets.chart.pace.plan")}
              </text>
            )}

            {/* the goals */}
            {pts.map((p) => {
              const on = active?.id === p.r.g.id;
              const lab = labels.get(p.r.g.id);
              return (
                <g
                  key={p.r.g.id} tabIndex={0} role="link" className="outline-none"
                  aria-label={fill(t("targets.chart.pace.pointAria"), {
                    title: p.r.g.title, st: t(`targets.st.${p.r.st}`), p: fmtPct(p.r.p), e: fmtPct(p.r.e),
                  })}
                  style={{ cursor: "pointer" }}
                  onPointerEnter={(ev) => { if (ev.pointerType === "mouse") setActive({ id: p.r.g.id, touch: false }); }}
                  onPointerLeave={(ev) => { if (ev.pointerType === "mouse") setActive(null); }}
                  onPointerDown={(ev) => { pressType.current = ev.pointerType; }}
                  onClick={(ev) => { ev.stopPropagation(); openOrShow(p, pressType.current !== "mouse"); }}
                  onFocus={() => setActive({ id: p.r.g.id, touch: false })}
                  onBlur={() => setActive(null)}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onOpen(p.r.g.id); } }}
                >
                  <circle cx={p.x} cy={p.y} r="14" fill="transparent" />
                  <circle
                    cx={p.x} cy={p.y} r={on ? 8 : 6} strokeWidth="2"
                    style={{ fill: p.color, stroke: "var(--bg-card)", transition: "r .12s var(--ease-out)" }}
                  />
                  {on && <circle cx={p.x} cy={p.y} r="12" fill="none" strokeWidth="2" style={{ stroke: p.color, strokeOpacity: 0.45 }} />}
                  {lab && (
                    <text x={lab.x} y={lab.y} textAnchor={lab.a} fontSize="11" fontWeight={on ? 700 : 500} style={{ fill: on ? "var(--text-1)" : "var(--text-2)", ...HALO }}>
                      {lab.text}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {act && width > 0 && (
          <ChartTip x={act.x} y={act.y} boxW={width} boxH={height} width={236} interactive={active.touch}>
            <div className="font-semibold line-clamp-2 break-words" style={{ color: "var(--text-1)" }}>{act.r.g.title}</div>
            <div className="mt-1.5"><StatusChip status={act.r.st} t={t} /></div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
              <span style={{ color: "var(--text-2)" }}>{t("targets.chart.pace.y")}</span>
              <span className="text-right font-semibold tabular-nums">{fmtPct(act.r.p)}</span>
              <span style={{ color: "var(--text-2)" }}>{t("targets.chart.pace.x")}</span>
              <span className="text-right font-semibold tabular-nums">{fmtPct(act.r.e)}</span>
            </div>
            {dueText && <div className="mt-1.5" style={{ color: "var(--text-2)" }}>{dueText(act.r.g)}</div>}
            {active.touch && (
              <button
                type="button" onClick={() => onOpen(act.r.g.id)}
                className="mt-2 w-full inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}
              >
                {t("targets.chart.open")} <ArrowUpRight size={13} aria-hidden />
              </button>
            )}
          </ChartTip>
        )}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs" style={{ color: "var(--text-2)" }}>
        {legend.map((l) => (
          <li key={l.text} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: l.color, opacity: 0.55 }} aria-hidden />
            {l.text}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span className="w-4 flex-shrink-0" style={{ borderTop: "2px dashed var(--text-2)" }} aria-hidden />
          {t("targets.chart.pace.legendPlan")}
        </li>
      </ul>
      {undated > 0 && (
        <p className="mt-1.5 text-xs" style={{ color: "var(--text-3)" }}>{fill(t("targets.chart.pace.noDates"), { n: undated })}</p>
      )}
    </div>
  );
}
