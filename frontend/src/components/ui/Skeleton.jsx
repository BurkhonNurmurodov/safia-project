// `style` is the escape hatch for a placeholder sized off a runtime value (the
// proof-photo loader reserves exactly the height its image will take, so the
// pane does not jump when the blob resolves). Tailwind classes stay the norm.
export function SkeletonBlock({ className = "", style }) {
  return <div className={`animate-pulse rounded bg-white/[0.06] ${className}`} style={style} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SkeletonBlock className="h-3 w-20 mb-3" />
      <SkeletonBlock className="h-7 w-28" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 6 }) {
  return (
    <div className="p-4 space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <SkeletonBlock className="h-5 w-1/4" />
          {Array.from({ length: cols - 1 }).map((_, j) => (
            <SkeletonBlock key={j} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ className = "h-64" }) {
  return <div className={`animate-pulse rounded bg-white/[0.06] w-full ${className}`} />;
}

// Mirrors a config matrix (sticky name column + task-chip header + dense cell
// grid) so the card keeps its real silhouette while the table loads. Name
// widths cycle a fixed list — Math.random() would re-roll on every render and
// make the placeholder twitch.
const NAME_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-3/5", "w-4/5", "w-7/12"];
export function SkeletonMatrix({ rows = 6, cols = 8, className = "p-4" }) {
  return (
    <div className={className} aria-hidden="true">
      <div className="flex items-end gap-[3px] mb-1.5">
        <div className="w-1/4 max-w-[170px] flex-shrink-0 pb-1">
          <SkeletonBlock className="h-3 w-2/3" />
        </div>
        {Array.from({ length: cols }).map((_, j) => (
          <SkeletonBlock key={j} className="h-12 flex-1 rounded-lg" />
        ))}
      </div>
      <div className="space-y-[3px]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-[3px]">
            <div className="w-1/4 max-w-[170px] flex-shrink-0 flex items-center gap-1.5">
              <SkeletonBlock className="h-3.5 w-3.5" />
              <SkeletonBlock className={`h-3.5 ${NAME_WIDTHS[i % NAME_WIDTHS.length]}`} />
            </div>
            {Array.from({ length: cols }).map((_, j) => (
              <SkeletonBlock key={j} className="h-9 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
