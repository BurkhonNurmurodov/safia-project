// `style` is the escape hatch for a placeholder sized off a runtime value (the
// proof-photo loader reserves exactly the height its image will take, so the
// pane does not jump when the blob resolves). Tailwind classes stay the norm.
//
// The fill is the `--skeleton` token, never a white-alpha utility: 6% white is
// the dark theme's placeholder and nothing at all on the light theme's white
// card, so every loader there used to be an empty box.
export function SkeletonBlock({ className = "", style }) {
  return <div className={`animate-pulse rounded bg-[var(--skeleton)] ${className}`} style={style} />;
}

// Placeholder widths for a column of NAMES. A fixed cycle — Math.random() would
// re-roll on every render and make the placeholder twitch.
export const SKELETON_NAME_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-3/5", "w-4/5", "w-7/12"];

// A grid placeholder (the загрузка heatmap and comparison tables) pulses as a
// diagonal WAVE rather than one slab blinking in unison: each fill starts its
// cycle a little later than the one up-left of it. Negative, so every fill is
// already mid-cycle on the first frame instead of sitting static until its
// turn comes.
export function skeletonWave(col, row = 0) {
  return { animationDelay: `-${((col + row) % 24) * 70}ms` };
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
  return <div className={`animate-pulse rounded bg-[var(--skeleton)] w-full ${className}`} />;
}

// Mirrors a config matrix (sticky name column + task-chip header + dense cell
// grid) so the card keeps its real silhouette while the table loads.
const NAME_WIDTHS = SKELETON_NAME_WIDTHS;
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
