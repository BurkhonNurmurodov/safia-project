// The goal's headline figure — a ring filled to its progress, the percent in
// the middle. Coloured by STATUS (the traffic light), never by category: the
// number a reader quotes must carry the verdict with it.
export default function ProgressRing({
  value = 0, size = 64, stroke = 7, color = "var(--brand)", label, sub, className = "",
}) {
  const v = Math.min(1, Math.max(0, value || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={`relative inline-grid place-items-center flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-accent)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset .6s var(--ease-out), stroke .3s" }}
        />
      </svg>
      <div className="relative text-center leading-none">
        <div className="font-bold font-mono tabular-nums" style={{ fontSize: Math.round(size * 0.26), color: "var(--text-1)" }}>
          {label ?? `${Math.round(v * 100)}%`}
        </div>
        {sub && <div className="mt-0.5" style={{ fontSize: Math.max(9, Math.round(size * 0.13)), color: "var(--text-4)" }}>{sub}</div>}
      </div>
    </div>
  );
}
