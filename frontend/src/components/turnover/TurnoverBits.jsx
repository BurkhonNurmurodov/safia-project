// «Kadrlar qo'nimsizligi» — the score chip and the score scale, drawn from
// the rule the server sent (turnoverUtil.js holds the arithmetic for them).
import { TONE_HEX, toneTint } from "../../utils/statusBands";
import { fill } from "../../pages/turnoverText";
import { bandOf, bandRows, scoreTone, toneInk } from "./turnoverUtil";

export function ScoreChip({ score, size = "md" }) {
  const tone = scoreTone(score);
  const box = size === "sm" ? "w-6 h-6 text-xs" : "w-7 h-7 text-sm";
  if (score == null) {
    return <span className={`inline-grid place-items-center ${box} rounded-lg`} style={{ color: "var(--text-3)" }}>—</span>;
  }
  return (
    <span className={`inline-grid place-items-center ${box} rounded-lg font-bold tabular-nums`}
      style={{ background: toneTint(tone), color: toneInk(tone), border: `1px solid ${TONE_HEX[tone]}55` }}>
      {score}
    </span>
  );
}

// The score scale, the hit band (if any) ringed. Read left → right as
// «worst to best» would bury the 5 the reader hopes for; it runs 5 → 1.
export function BandScale({ rule, rate, T, compact = false }) {
  const rows = bandRows(rule);
  const hit = bandOf(rate, rule);
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
