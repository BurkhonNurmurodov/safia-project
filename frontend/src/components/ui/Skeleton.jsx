export function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded bg-white/[0.06] ${className}`} />;
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
