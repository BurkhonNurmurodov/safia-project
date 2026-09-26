// A task list as discrete blocks — one per item, filled once it is done. The
// items are countable units, so the bar shows them as units rather than as a
// smooth percentage nobody ticks in fractions.
export default function SegmentBar({ items, color, height = 8, className = "", label }) {
  if (!items?.length) return null;
  return (
    <div className={`flex gap-[2px] ${className}`} style={{ height }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {items.map((it) => (
        <span
          key={it.id} className="flex-1 first:rounded-l-full last:rounded-r-full"
          style={{ background: it.done ? color : "var(--bg-accent)", minWidth: 3 }}
        />
      ))}
    </div>
  );
}
