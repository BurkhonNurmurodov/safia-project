// Self-check of the voice orb's pure rules: `node frontend/tools/voice/check.mjs`
import assert from "node:assert/strict";
import { quietGate, spokenLine } from "../../src/components/assistant/voiceUtil.js";

// ── the line that is said ────────────────────────────────────────────────────
assert.deepEqual(spokenLine("Bugungi yuklama **87%**."), { line: "Bugungi yuklama 87%.", more: false });
assert.deepEqual(
  spokenLine("> O'rtacha yuklama **87%** — [Zagruzka](/zagruzka) sahifasida.\n\n| Brigadir | % |\n|---|---|\n| A | 90 |"),
  { line: "O'rtacha yuklama 87% — Zagruzka sahifasida.", more: true });
assert.deepEqual(spokenLine("| A | B |\n|---|---|\n| 1 | 2 |"), { line: "", more: true });   // opens with a table
assert.deepEqual(spokenLine("Sabab:\n| A | B |"), { line: "Sabab:", more: true });
assert.deepEqual(spokenLine("1. Sahifani oching\n2. Tugmani bosing"), { line: "Sahifani oching. Tugmani bosing", more: false });
assert.deepEqual(spokenLine(""), { line: "", more: false });
const long = spokenLine(`${"So'z ".repeat(40)}tugadi. ${"Yana ".repeat(40)}`);
assert.ok(long.more && long.line.length <= 280 && long.line.endsWith("tugadi."));
assert.ok(spokenLine("x".repeat(100) + " " + "y".repeat(400)).line.endsWith("…"));

// ── end of speech ────────────────────────────────────────────────────────────
const run = (levels, step = 100, opts) => {
  const gate = quietGate(opts);
  let out = null;
  let at = -1;
  levels.some((lv, i) => { out = gate(lv, i * step); at = i * step; return out; });
  return [out, at];
};
const rep = (v, n) => Array(n).fill(v);
// quiet room: half a second of speech, then silence → sent 1.5 s after the last word
assert.deepEqual(run([...rep(0.01, 5), ...rep(0.3, 5), ...rep(0.01, 30)]), ["send", 2400]);
// nobody says anything → given up after 7 s, never «sent»
assert.deepEqual(run(rep(0.01, 100)), ["nothing", 7000]);
// somebody who talks from the very first instant is heard too (their first pause shows it)
assert.deepEqual(run([...rep(0.3, 10), ...rep(0.01, 30)]), ["send", 2400]);
// a steady hum is the floor, not a voice — and not silence either: nothing is thrown away
assert.equal(run(rep(0.12, 100))[0], null);
// a voice over the hum still counts, and its end is still heard
assert.equal(run([...rep(0.12, 10), ...rep(0.6, 10), ...rep(0.12, 30)])[0], "send");
// a pause shorter than the wait does not cut a sentence in two
assert.equal(run([...rep(0.3, 5), ...rep(0.01, 10), ...rep(0.3, 5)])[0], null);
// twenty seconds of talk with breaths in it is never cut mid-way
const talk = Array.from({ length: 200 }, (_, i) => (i % 25 < 3 ? 0.01 : 0.25));
assert.equal(run(talk)[0], null);

console.log("voice orb rules: ok");
