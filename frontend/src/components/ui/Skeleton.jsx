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
