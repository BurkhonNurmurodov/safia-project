// «Brigadirlar KPI» — THE result of one brigadir: a ring of four quarters, one
// per HR gate, clockwise from 12 o'clock in HR's order (turnover · OKK ·
// mentoring · KRU). A passed gate is green, a failed one red, a counted gate
// with no figure grey, and a gate the platform does not count yet a dashed
// outline — never a colour, so «not measured» never reads as «failed». The
// count of passed gates sits in the middle. `active` lights one quarter (the
// panel's list and the ring point at each other on hover).
import { GATES, GATE_INK, gateOf } from "./bkpiUtil";

const polar = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

function arc(cx, cy, r, from, to) {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export default function GateRing({ row, live, size = 28, stroke, active = null, center = true, label, sub }) {
  const sw = stroke ?? Math.max(3, Math.round(size * 0.13));
  const c = size / 2;
  const r = c - sw / 2 - 0.5;
  const gap = size >= 80 ? 7 : 11;          // degrees between quarters
  const passed = GATES.filter((k) => gateOf(row, k, live) === "pass").length;
  const big = size >= 80;
  return (
    <span className="relative inline-grid place-items-center flex-shrink-0" style={{ width: size, height: size }}
      role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0">
        {GATES.map((k, i) => {
          const s = gateOf(row, k, live);
          const from = -90 + i * 90 + gap / 2;
          const to = -90 + (i + 1) * 90 - gap / 2;
          const on = active === k;
          if (s === "pending") {
            return (
              <path key={k} d={arc(c, c, r, from, to)} fill="none" stroke="var(--text-4)" strokeOpacity={on ? 0.9 : 0.55}
                strokeWidth={Math.max(1.5, sw * 0.35)} strokeDasharray={big ? "4 4" : "2 2.5"} strokeLinecap="round" />
            );
          }
          return (
            <path key={k} d={arc(c, c, r, from, to)} fill="none" stroke={GATE_INK[s]}
              strokeWidth={on ? sw + (big ? 4 : 1.5) : sw} strokeLinecap="round"
              style={{ transition: "stroke-width .15s ease" }} />
          );
        })}
      </svg>
      {center && (
        <span className="relative flex flex-col items-center leading-none tabular-nums">
          <span className="font-bold" style={{ color: passed ? "var(--text-1)" : "var(--text-3)", fontSize: big ? Math.round(size * 0.26) : Math.round(size * 0.42) }}>
            {passed}
          </span>
          {big && sub && <span className="mt-1.5 text-xs font-medium" style={{ color: "var(--text-3)" }}>{sub}</span>}
        </span>
      )}
    </span>
  );
}
