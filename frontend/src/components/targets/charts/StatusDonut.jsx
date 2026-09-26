// How the board's goals split by status — a part-to-whole of at most four
// groups, so a donut read at a glance, with the count in the middle. The
// legend beside it IS the readout: every group's count and share in text, its
// icon beside the swatch (identity never rides on colour alone), and a hovered
// slice lights its own row. A slice or a row jumps to that group's cards.
import { useState } from "react";

const SIZE = 136;
const THICK = 18;
const R = (SIZE - THICK) / 2;
const C = 2 * Math.PI * R;
const GAP = 3; // px of surface between slices

export default function StatusDonut({ groups, total, centerLabel, onPick, ariaLabel }) {
  const [active, setActive] = useState(null);
  const live = groups.filter((g) => g.count > 0);
  const arcs = live.map((g, i) => {
    const before = live.slice(0, i).reduce((sum, x) => sum + x.count, 0);
    const len = (g.count / total) * C;
    return { ...g, len: Math.max(0.01, len - (live.length > 1 ? GAP : 0)), offset: (before / total) * C };
  });

  return (
    // Side by side where the card is short; stacked, with a bigger ring, on a
    // desk — where the card stands as tall as the map beside it.
    <div className="flex items-center gap-4 sm:gap-5 lg:flex-col lg:items-stretch lg:gap-6">
      <div className="relative flex-shrink-0 lg:mx-auto w-[104px] h-[104px] sm:w-[136px] sm:h-[136px] lg:w-[188px] lg:h-[188px]">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-full -rotate-90" role="img" aria-label={ariaLabel}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={THICK} style={{ stroke: "var(--bg-accent)" }} />
          {arcs.map((a) => (
            <circle
              key={a.key} cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
              strokeWidth={active === a.key ? THICK + 4 : THICK}
              strokeDasharray={`${a.len} ${C - a.len}`} strokeDashoffset={-a.offset}
              style={{ stroke: a.color, cursor: onPick ? "pointer" : "default", transition: "stroke-width .15s var(--ease-out), opacity .15s" }}
              opacity={active && active !== a.key ? 0.45 : 1}
              onPointerEnter={() => setActive(a.key)} onPointerLeave={() => setActive(null)}
              onClick={() => onPick?.(a.key)}
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="text-center leading-none">
            <div className="text-2xl sm:text-3xl lg:text-4xl font-bold" style={{ color: "var(--text-1)" }}>{total}</div>
            <div className="text-xs mt-1" style={{ color: "var(--text-2)" }}>{centerLabel}</div>
          </div>
        </div>
      </div>

      <ul className="flex-1 min-w-0 space-y-0.5 lg:flex-none">
        {groups.map((g) => {
          const Icon = g.Icon;
          const on = active === g.key;
          const empty = !g.count;
          return (
            <li key={g.key}>
              <button
                type="button" disabled={empty}
                onClick={() => onPick?.(g.key)}
                onPointerEnter={() => setActive(g.count ? g.key : null)} onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(g.count ? g.key : null)} onBlur={() => setActive(null)}
                className="w-full flex items-center gap-2 sm:gap-2.5 rounded-lg px-1.5 sm:px-2 py-1.5 text-left text-[13px] sm:text-sm transition-colors disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
                style={{ background: on ? "var(--hover-bg)" : "transparent" }}
              >
                <span className="hidden sm:block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: empty ? "var(--bg-accent)" : g.color }} aria-hidden />
                <Icon size={15} strokeWidth={2.3} className="flex-shrink-0" style={{ color: empty ? "var(--text-4)" : g.color }} aria-hidden />
                <span className="flex-1 min-w-0 truncate" style={{ color: empty ? "var(--text-4)" : "var(--text-2)" }}>{g.label}</span>
                <span className="font-semibold tabular-nums" style={{ color: empty ? "var(--text-4)" : "var(--text-1)" }}>{g.count}</span>
                <span className="w-9 text-right text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
                  {total ? `${Math.round((g.count / total) * 100)}%` : "—"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
