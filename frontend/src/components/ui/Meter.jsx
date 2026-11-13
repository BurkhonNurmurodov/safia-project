/**
 * The small bars a figure carries so it reads without arithmetic — one file,
 * so a rate, a split and a give-and-take are drawn the same way on every page
 * («Odam soni»'s three pages are the first callers).
 *
 *   Meter      a rate against its target: the fill is the figure, the tick the
 *              line it is judged by (a KPI card's `children`, a table cell)
 *   SplitBar   ONE whole divided into its parts, with SplitLegend naming them
 *              and printing their numbers — the answer to a row of chips
 *   FigureList the two or three rows behind a headline count («who») — a name
 *              and its figure per line, inside a KPI card
 *
 * All presentational: labels and colours come from the caller. A FILL takes a
 * raw hue (a bar is not text); INK on the card takes a `--status-*` /
 * `--text-*` token, which holds AA on both themes where a 500 shade does not.
 */

// `value` and `target` are whole percents (0–100). `targetLabel` names the
// tick under the bar — a line nobody named is a line nobody can read.
export function Meter({ value, target, targetLabel, color = "var(--brand)", height = 6, label }) {
  const w = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div role="img" aria-label={label}>
      <div className="relative rounded-full" style={{ height, background: "var(--bg-inner)" }}>
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w}%`, background: color }} />
        {target != null && (
          <div aria-hidden className="absolute w-[2px] rounded-sm"
            style={{ left: `calc(${target}% - 1px)`, top: -3, bottom: -3, background: "var(--text-2)" }} />
        )}
      </div>
      {target != null && targetLabel && (
        <div aria-hidden className="relative h-3 mt-1.5 text-[10px] leading-none tabular-nums" style={{ color: "var(--text-3)" }}>
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `min(${target}%, calc(100% - 1.5em))` }}>{targetLabel}</span>
        </div>
      )}
    </div>
  );
}

// parts: [{ key, label, value, color, text? }] — `text` is what the legend and
// the hover print for the part when it is not the bare number.
export function SplitBar({ parts, height = 6, label }) {
  const live = parts.filter((p) => p.value > 0);
  return (
    <div className="flex gap-[2px] rounded-full overflow-hidden" style={{ height, background: "var(--bg-inner)" }}
      role="img" aria-label={label ?? live.map((p) => `${p.label} ${p.text ?? p.value}`).join(", ")}>
      {live.map((p) => (
        <div key={p.key} title={`${p.label}: ${p.text ?? p.value}`}
          style={{ flex: `${p.value} 1 0%`, minWidth: 2, background: p.color }} />
      ))}
    </div>
  );
}

// The parts by name, each with its number. `sub` on a part is a muted note
// after its number («46 on leave»): a part of a part, said in words.
export function SplitLegend({ parts, className = "" }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] ${className}`} style={{ color: "var(--text-3)" }}>
      {parts.map((p) => (
        // An item breaks after its name or its number before it runs out of a
        // narrow card (a phone's half-width tile) — never through either.
        <span key={p.key} className="inline-flex flex-wrap items-center gap-x-1.5 min-w-0">
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <span aria-hidden className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: p.color }} />
            <span className="truncate">{p.label}</span>
          </span>
          <b className="font-semibold tabular-nums whitespace-nowrap" style={{ color: "var(--text-1)" }}>{p.text ?? p.value}</b>
          {p.sub && <span className="whitespace-nowrap">{p.sub}</span>}
        </span>
      ))}
    </div>
  );
}

// rows: [{ key, label, title?, value, color? }] — at most three or four; an
// empty list prints `empty` on one line so the card keeps its height.
export function FigureList({ rows, empty }) {
  if (!rows.length) {
    return empty ? <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{empty}</div> : null;
  }
  return (
    <div className="space-y-0.5">
      {rows.map((r) => (
        <div key={r.key} className="flex items-baseline justify-between gap-3 text-[11px]">
          <span className="truncate min-w-0" style={{ color: "var(--text-2)" }} title={r.title || undefined}>{r.label}</span>
          <span className="font-semibold tabular-nums flex-shrink-0" style={{ color: r.color || "var(--text-1)" }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}
