// Shared cells of the three /plan tables: the percentage chip every
// «Bajarilishi» cell wears and the «days short» read-out.
import { toneTint } from "../../utils/statusBands";
import { fmtPct, toneOf, toneHex } from "./planUtil";

// «96%» in its band's colour on a soft tint of it — the ink alone carries the
// verdict for colour-blind readers too, because the number is printed.
export function FulfilChip({ r, title }) {
  if (r == null) return <span style={{ color: "var(--text-4)" }} title={title}>—</span>;
  const tone = toneOf(r);
  return (
    <span className="inline-flex items-center justify-center min-w-[3.25rem] px-1.5 py-0.5 rounded-md text-xs font-bold tabular-nums"
      style={{ background: toneTint(tone), color: toneHex(tone) }} title={title}>
      {fmtPct(r)}
    </span>
  );
}

// «3 / 14» — short days out of the days that had a plan, the base printed so a
// share can be checked; red ink once it is at least half of them.
export function DaysShort({ short, of, title }) {
  if (!of) return <span style={{ color: "var(--text-4)" }}>—</span>;
  const heavy = short * 2 >= of && short > 0;
  return (
    <span className="tabular-nums" title={title} style={{ color: heavy ? toneHex("bad") : short ? "var(--text-1)" : "var(--text-3)" }}>
      <b className="font-semibold">{short}</b>
      <span style={{ color: "var(--text-4)" }}> / {of}</span>
    </span>
  );
}
