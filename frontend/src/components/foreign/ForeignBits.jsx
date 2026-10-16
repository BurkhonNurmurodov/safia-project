// «Yot jismlar» — the score scale of COUNTS, drawn from the rule the server
// sent (foreignUtil.js holds the arithmetic). The score chip is turnover's —
// one chip for every leaders' KPI page.
import { TONE_HEX, toneTint } from "../../utils/statusBands";
import { fill } from "../../pages/foreignObjectsText";
import { bandOf, bandRows, scoreTone, toneInk } from "./foreignUtil";

export { ScoreChip } from "../turnover/TurnoverBits";

// The scale, the hit band (if any) ringed. It runs 5 → 1: «no complaint» first,
// the state the reader hopes for.
export function CountScale({ rule, count, T, compact = false }) {
  const rows = bandRows(rule);
  const hit = bandOf(count, rule);
  return (
    <div className={`grid gap-1.5 ${compact ? "grid-cols-5" : "grid-cols-2 sm:grid-cols-5"}`}>
      {rows.map((b, i) => {
        const tone = scoreTone(b.score);
        const on = i === hit;
        return (
          <div key={i} className="rounded-xl px-2 py-1.5 text-center"
            style={{
              background: on ? toneTint(tone) : "var(--bg-inner)",
              border: `${on ? 2 : 1}px solid ${on ? TONE_HEX[tone] : "var(--border)"}`,
            }}
            aria-current={on ? "true" : undefined}>
            <div className="text-[11px] tabular-nums" style={{ color: "var(--text-2)" }}>{b.label}</div>
            <div className="text-sm font-bold tabular-nums" style={{ color: toneInk(tone) }}>
              {fill(T.scoreN, { n: b.score })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
