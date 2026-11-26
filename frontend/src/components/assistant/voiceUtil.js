/**
 * The voice orb's two pure rules (checked by `frontend/tools/voice/check.mjs`).
 */

/**
 * The line of an answer the orb shows and says: its first block as plain
 * words — the answer guide (services/assistant.py «HOW AN ANSWER LOOKS»)
 * makes the first line the answer. `more` says the answer holds something
 * past that line (a table, steps, a second paragraph), so the orb offers the
 * whole chat. An answer that OPENS with a table has no line to say.
 */
export function spokenLine(md, max = 280) {
  const blocks = String(md || "").trim().split(/\n\s*\n/).filter(Boolean);
  const rows = (blocks[0] || "").split("\n");
  const said = rows.filter((l) => !/^\s*(\||```|-{3,}\s*$)/.test(l));
  let line = said
    .map((l) => l.replace(/^\s*(>\s*(\[![A-Z]+\]\s*)?|#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/, "").trim())
    .filter(Boolean)
    // list items and steps are sentences of their own when spoken
    .reduce((acc, l) => (acc ? `${acc}${/[.!?:;,…]$/.test(acc) ? "" : "."} ${l}` : l), "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")      // [label](/route) → label
    .replace(/(\*\*|__|\*|_|`)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let more = blocks.length > 1 || said.length < rows.length;
  if (line.length > max) {
    const cut = line.slice(0, max);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    line = end > max * 0.4 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
    more = true;
  }
  return { line, more };
}

/**
 * End of speech, for ONE recording. Feed it the recorder's peak level (0–1)
 * and the clock; it answers "send" once somebody spoke and then stayed quiet
 * for `quietMs`, "nothing" when no sound at all came in for `idleMs`, else
 * null.
 *
 * What counts as a voice is judged against the ROOM, not a fixed number: the
 * floor drops to any quieter level at once and creeps up slowly, so a steady
 * hum (a shop floor, a fan, a cheap microphone's hiss) is not taken for
 * speech, and a pause between words brings it back down. Somebody who talks
 * from the very first instant IS the floor until their first pause — the
 * pause then shows that what came before it was a voice.
 *
 * It never throws a recording away while sound is coming in: a quiet voice
 * over a loud room looks like the room, and discarding a question somebody
 * asked is worse than waiting for their tap.
 * shortcut: in such a room, or one whose noise comes in bursts, it never
 * reads as quiet — the tap on the orb and the recorder's two-minute cap end
 * the recording there.
 */
export function quietGate({ quietMs = 1500, idleMs = 7000 } = {}) {
  let floor = 1;
  let peak = 0;
  let t0 = null;
  let prevAt = 0;
  let spoke = false;
  let lastVoice = 0;
  return (level, now) => {
    if (t0 === null) { t0 = now; prevAt = now; }
    floor = Math.min(level, floor + 0.0005);
    peak = Math.max(peak, level);
    const bar = Math.max(0.04, floor * 3);
    if (level > bar) { spoke = true; lastVoice = now; }
    else if (!spoke && peak > bar) { spoke = true; lastVoice = prevAt; }
    prevAt = now;
    if (spoke && now - lastVoice >= quietMs) return "send";
    if (!spoke && peak <= 0.04 && now - t0 >= idleMs) return "nothing";
    return null;
  };
}
