/**
 * Analysis-board primitives — the vocabulary of every «Tahlil» view.
 *
 * Two pages carry a chart board beside their register (Concerns, Tasks) and
 * they ask the same shapes: a KPI card with a tinted icon chip, a chart shell
 * with the canonical SectionHead, a mount guard that holds a fixed slot until
 * the grid cell has settled, and a native ranked list — one row per person or
 * unit, a status stack under the name, every bar scaled to the busiest row on
 * the board. Those used to be private to Concerns.jsx; a second board copying
 * them is how two pages' charts stop looking like one platform, so they live
 * here and both pages import them.
 *
 * Everything is presentational. Labels, colours and the stack definition come
 * from the caller (they depend on t(), which is per page), and a ranked row's
 * BADGE is a render prop — Concerns badges a holder with the chain step they
 * answer on, Tasks badges an assignee with the tier the task was set at — so
 * the bar never has to know what the chip beside a name means.
 */
import { useState, useRef, useCallback } from "react";
import ReactApexChart from "react-apexcharts";
import { SectionHead } from "./DataTable";

export const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

// Level → identity hue in the shared generic-first order (red → green → blue
// as a concern climbs the chain — identity, not traffic-light). "leader" is
// the step below the chain's opening level, so it stays neutral grey. ONE
// definition: a brigadir is the same red on the concerns register, on its
// analysis board and on the task board's tier column.
export const LEVEL_COLOR = {
  leader: "#94a3b8",
  supervisor: "#ef4444",
  "shift-manager": "#22c55e",
  "top-manager": "#3b82f6",
};

// Non-interactive level pill (same silhouette as the status pill so the two
// chip columns read as one visual family). The optional title carries a
// name the chip stands for — a tooltip, so row heights stay uniform.
export function LevelChip({ level, label, title }) {
  const color = LEVEL_COLOR[level] || "var(--text-3)";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: `${color}24`, color }}
      title={title}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
    </span>
  );
}

// ── rich KPI card primitives ────────────────────────────────────────────────
// Card shell: tinted icon chip + uppercase label pinned top, body (subject
// headline + compact metric) pinned bottom so cards align across the KPI row
// regardless of how the labels wrap. Corner glow is a radial gradient (smooth
// falloff, no blur-filter banding).
export function InsightCard({ icon: Icon, tint, label, children }) {
  return (
    <div className="relative rounded-2xl p-4 flex flex-col overflow-hidden" style={cardStyle}>
      <div aria-hidden className="absolute inset-0 pointer-events-none"
           style={{ background: `radial-gradient(140px 140px at calc(100% - 8px) -8px, ${tint}29, transparent 70%)` }} />
      <div className="flex items-center gap-2.5 relative">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-[10px] flex-shrink-0"
              style={{ background: `${tint}1f`, color: tint }}>
          <Icon size={16} />
        </span>
        <span className="text-[11px] uppercase tracking-[0.08em] font-semibold leading-tight" style={{ color: "var(--text-3)" }}>
          {label}
        </span>
      </div>
      <div className="relative flex flex-col gap-1 mt-4 grow justify-end min-h-[56px]">
        {children}
      </div>
    </div>
  );
}

// Compact colour-coded number + terse unit, with an optional quieter qualifier
// ("avg per concern"). Sits under the subject line as supporting detail.
export function Metric({ value, unit, color, suffix }) {
  return (
    <div className="flex items-baseline gap-1 leading-none">
      <span className="text-base font-bold tabular-nums" style={{ color }}>{value}</span>
      {unit && <span className="text-[11px] font-semibold" style={{ color: "var(--text-3)" }}>{unit}</span>}
      {suffix && <span className="text-[10px] font-medium" style={{ color: "var(--text-4)" }}>· {suffix}</span>}
    </div>
  );
}

// Headline of the card body (problem text / name / date), clamped to a single
// line so every card body has identical height.
export function Subject({ text, title }) {
  return (
    <div className="text-lg font-bold leading-snug truncate" style={{ color: "var(--text-1)" }} title={title || text}>
      {text}
    </div>
  );
}

// Placeholder body when a card has nothing meaningful to surface; my-auto
// centres it inside the reserved body height so empty cards don't collapse.
export function Empty({ icon: Icon, color, text }) {
  return (
    <div className="flex items-center gap-2 my-auto">
      <Icon size={18} className="flex-shrink-0" style={{ color }} />
      <span className="text-sm font-medium" style={{ color: "var(--text-3)" }}>{text}</span>
    </div>
  );
}

// ── chart board primitives ──────────────────────────────────────────────────
// Card shell for every chart on an analysis tab: cardStyle + the canonical
// SectionHead, so all boards carry identical chrome.
export function ChartCard({ icon, title, subtitle, right, className = "", children }) {
  return (
    <div className={`rounded-2xl overflow-hidden flex flex-col ${className}`} style={cardStyle}>
      <SectionHead icon={icon} title={title} subtitle={subtitle} right={right} />
      {children}
    </div>
  );
}

// Mount guard: holds a fixed-height slot until the grid cell has settled, so
// ApexCharts measures its final width once (see each page's `chartsReady`).
export function Chart({ ready, height, ...rest }) {
  return ready ? <ReactApexChart height={height} {...rest} /> : <div style={{ height }} />;
}

// "No data" body for a chart card — centred in the slot the chart would fill.
export function NoChart({ height, text }) {
  return (
    <div className="grid place-items-center text-xs flex-1" style={{ color: "var(--text-4)", minHeight: height }}>
      {text}
    </div>
  );
}

// ── native ranked list ──────────────────────────────────────────────────────
// One row of a ranked board: a badge, the name and its total on the first
// line, the status stack under it. Every bar on ONE board shares a max — the
// busiest row in whatever the board is showing — so widths compare straight
// down the list. Drawn natively rather than as an SVG axis because a badge is
// a chip, and an ApexCharts category label can only ever be a string.
//   parts  [{ key, label, color }] — the stack segments, read off row[key]
//   badge  a node rendered before the name (a LevelChip, a tier chip, …)
//   extra  an optional node rendered before the total (a red overdue mark)
export function RankedBar({ row, max, parts, unit, badge, extra }) {
  const width = max ? (row.total / max) * 100 : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-1">
        {badge}
        <span className="flex-1 truncate text-xs" style={{ color: "var(--text-1)" }} title={row.title}>
          {row.label}
        </span>
        {extra}
        <span className="text-xs font-bold tabular-nums" style={{ color: "var(--text-1)" }}>
          {row.total}
        </span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
        <div className="flex h-full rounded-full overflow-hidden" style={{ width: `${width}%` }}>
          {parts.map((p) => (row[p.key] > 0 ? (
            <div
              key={p.key}
              className="h-full"
              style={{ background: p.color, width: `${(row[p.key] / row.total) * 100}%` }}
              title={`${p.label}: ${row[p.key]} ${unit}`}
            />
          ) : null))}
        </div>
      </div>
    </div>
  );
}

// The stack segments as a legend — the native rows don't get the one
// ApexCharts draws for free. Read from the same `parts` the bars read, so a
// colour can never mean two things, and shared by a card and its full-list
// modal.
export function StackLegend({ parts }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mb-4">
      {parts.map((p) => (
        <span key={p.key} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
          {p.label}
        </span>
      ))}
    </div>
  );
}

// One column of ranked rows. A card shows the slice that fits beside its
// neighbour and a modal shows all of them — same component both times, so the
// two can never drift into two different boards. `badge` / `extra` are
// per-row render functions here.
export function RankedList({ rows, max, parts, unit, badge, extra }) {
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <RankedBar
          key={r.key}
          row={r}
          max={max}
          parts={parts}
          unit={unit}
          badge={badge ? badge(r) : null}
          extra={extra ? extra(r) : null}
        />
      ))}
    </div>
  );
}

// How many rows fit in a box whose height somebody else decides. A ranked card
// sits in a stretch row beside a chart, so its list area is handed a height —
// MEASURE it rather than predicting it from a formula that would have to guess
// a wrapped header, four languages of legend and the neighbour's own row
// count. No feedback loop: the area is flex-1 with min-h-0, so its height
// never depends on how many rows we put in it.
export function useRowFit(rowH, gap, initial) {
  const [fit, setFit] = useState(initial);
  const roRef = useRef(null);
  // A ref CALLBACK, not a ref + effect: the measured box only mounts once the
  // query resolves, and an effect whose deps never change would have run once
  // against the loading skeleton, found no node, and never observed anything.
  const ref = useCallback((el) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const h = el.clientHeight;
      if (h > 0) setFit(Math.max(1, Math.floor((h + gap) / rowH)));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    roRef.current = ro;
    measure();
  }, [rowH, gap]);
  return [ref, fit];
}
