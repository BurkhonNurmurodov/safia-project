import { Flag } from "lucide-react";

/**
 * THE identity block on a cell's accordion row: the verifix CODE in a neutral
 * chip on line 1, the cell's OWNING LEADER muted underneath behind a flag — the
 * code is the whole name and the leader is the one fact printed beside it
 * (utils/cellName.js). /idle-cell and /kelish list their cells as accordion
 * cards headed by this, so a cell reads the same on both pages, and the leader
 * always sits in exactly the same spot. It lives on the row rather than as a
 * grouping level because leaders are ~1:1 with cells (93 leaders / 108 cells) —
 * grouping would put a heading over almost every row.
 *
 * Props:
 *   code        – the verifix code
 *   leader      – the leader's name, already transliterated by the caller;
 *                 blank → `noLeader`, dimmer
 *   noLeader    – the words for a cell nobody leads
 *   leaderTitle – tooltip on the leader line (optional)
 *   extra       – a node beside the code chip (optional)
 */
export default function CellIdent({ code, leader, noLeader, leaderTitle, extra }) {
  return (
    <span className="min-w-0 flex-1 flex flex-col gap-0.5">
      <span className="flex items-center gap-2 min-w-0">
        {/* NEUTRAL, deliberately. The badge used to take a solid colour hashed
            from the verifix code — identity, in intent. On a platform whose own
            rule is that red and green are STATUS, a hash that paints 4811 red
            and 8411 green beside a downtime figure reads as a traffic light
            nobody set, and a reader scanning the list sees alarm where there is
            only a different number. A code is an identity, so it gets the same
            chrome as every other identity chip here. */}
        <span
          className="text-xs font-bold px-2 py-1 rounded-md flex-shrink-0 tabular-nums"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}
        >
          {code}
        </span>
        {extra}
      </span>
      <span className="flex items-center gap-1.5 min-w-0 text-[11px] leading-tight" title={leaderTitle}>
        <Flag size={11} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
        <span className="truncate" style={{ color: leader ? "var(--text-3)" : "var(--text-4)" }}>
          {leader || noLeader}
        </span>
      </span>
    </span>
  );
}
