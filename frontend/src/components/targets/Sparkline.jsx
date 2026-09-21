// The value over time — every check-in as a point, the target as a dashed
// line. Deliberately tiny and label-less: the figures are printed beside it,
// this only shows the SHAPE of the movement (steady, stalled, slipping).
export default function Sparkline({ points, target, width = 140, height = 36, color = "var(--brand)" }) {
  if (!points || points.length < 2) return null;
  const pad = 3;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y).concat(target === null || target === undefined ? [] : [target]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = (x) => (x1 === x0 ? width / 2 : pad + ((x - x0) / (x1 - x0)) * (width - pad * 2));
  const sy = (y) => (y1 === y0 ? height / 2 : height - pad - ((y - y0) / (y1 - y0)) * (height - pad * 2));
  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const ty = target === null || target === undefined ? null : sy(target);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="flex-shrink-0">
      {ty !== null && (
        <line x1={pad} x2={width - pad} y1={ty} y2={ty} stroke="var(--text-4)" strokeWidth="1" strokeDasharray="3 3" />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(last.x)} cy={sy(last.y)} r="2.6" fill={color} />
    </svg>
  );
}
