import { memo } from "react";
import { dayRatio, pctOf, toneOf, toneHex, ddmm } from "./planUtil";

// One small square per day of the period — how an entity's days went, read at
// a glance: a row that is mostly red is a product that USUALLY falls short,
// which one period percentage cannot say. Coloured by the completion bands,
// like every figure on the page.
//   ■ band colour  a day with a plan and a fact
//   ▨ hatched      its unit had a plan and no fact yet — not a 0%
//   □ outlined     fact with no plan
//   · faint        nothing planned
// The squares stretch to the width they are given (a table column), so a
// fortnight and a quarter both fit; each carries its date and value on hover.
const HATCH = "repeating-linear-gradient(135deg, var(--border-md) 0 2px, transparent 2px 4px)";

function DayStrip({ daily, days, labels, height = 14, className = "" }) {
  const n = daily?.length || 0;
  if (!n) return null;
  return (
    <div
      className={`grid gap-px w-full ${className}`}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(2px, 1fr))`, height }}
      role="img"
      aria-label={labels?.aria}
    >
      {daily.map((d, i) => {
        const date = ddmm(days?.[i]);
        if (d === "nf") {
          return <span key={i} title={`${date} · ${labels?.nf}`} className="rounded-[2px]"
            style={{ background: HATCH, border: "1px solid var(--border-md)" }} />;
        }
        if (d === "np") {
          return <span key={i} title={`${date} · ${labels?.np}`} className="rounded-[2px]"
            style={{ border: "1px solid var(--text-4)" }} />;
        }
        const r = dayRatio(d);
        if (r == null) {
          return <span key={i} title={`${date} · ${labels?.none}`} className="rounded-[2px]"
            style={{ background: "var(--bg-inner)" }} />;
        }
        return <span key={i} title={`${date} · ${pctOf(r)}%`} className="rounded-[2px]"
          style={{ background: toneHex(toneOf(r)) }} />;
      })}
    </div>
  );
}

export default memo(DayStrip);
