// Traffic-light bands for the platform's headline figures — ONE definition per
// figure, read by every surface that paints it: the «Zagruzka fayli» KPI cards
// and команда cards, and the «Smena hisoboti» table on Overview. Two copies of
// a band is how one number reads green on one page and yellow on the next.
//
// Every percentage band compares the WHOLE percent the reader sees, never the
// raw fraction: these figures are printed rounded to a whole percent, and
// judging the fraction paints a number on one side of a threshold in the colour
// of the other («90%» in yellow for 0.8951).
//
// Status colour is the traffic light only — red #ef4444 / yellow #eab308 /
// green #22c55e. Brand gold is an accent, never a status.

export const GREEN = "#22c55e", AMBER = "#eab308", RED = "#ef4444";
export const TONE_HEX = { ok: GREEN, warn: AMBER, bad: RED };

const MUTED = "var(--text-4)";

const wholePct = (v) =>
  (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 100));

// "ok" | "warn" | "bad" | null — null means there is no figure to judge.
const pctTone = (v, { ok, warn }) => {
  const p = wholePct(v);
  if (p === null) return null;
  return p >= ok ? "ok" : p >= warn ? "warn" : "bad";
};

const hex = (tone) => (tone ? TONE_HEX[tone] : MUTED);

// A soft TINT of a band, for a badge or a chip — something that sits ON the
// card rather than replacing it, with `--status-*` as its ink.
export const FILL_ALPHA = "33";
export const toneTint = (tone) => (tone ? `${TONE_HEX[tone]}${FILL_ALPHA}` : "transparent");

// The whole-cell heatmap PAINT for a band — background and the ink that reads
// on it, as one pair, because neither is a choice on its own.
//
// SOLID, and flat per band (the operator's call, 2026-09-16). A translucent
// tint spends most of its colour on the card underneath, so three bands
// separated at 20% read as three shades of the same murk across a board this
// dense; a solid fill is what makes a column scannable as one lane. Flat and
// never a gradient: these are verdicts, not intensities, and a shade a reader
// can compare invites reading the shade as the value.
//
// The hues are deliberately the 700 shades `--status-*` already carries on
// light — strong enough to tell three bands apart at a glance, dark enough to
// take white ink. A solid cell COVERS the card, so the pair must not depend on
// what the card is: it is theme-independent by construction rather than by
// omission, the rule the «Toifalar bo'yicha» ramp keeps for its own top end.
export const TONE_SOLID = { ok: "#15803d", warn: "#a16207", bad: "#b91c1c" };
export const SOLID_INK = "#ffffff";
export const toneFill = (tone) =>
  (tone ? { background: TONE_SOLID[tone], color: SOLID_INK } : undefined);

// Загруженность (O'rt. zagruzka): ≥90% green, 80–89% yellow, below that red —
// the operator's scale (2026-09-06). Two things went with it, deliberately.
// Over-capacity is no longer a case of its own: a load above 100% reads GREEN.
// And under-loaded stops being brand gold — gold is an accent on this platform,
// never a status, so the one band that was not a traffic light now is one.
export const LOAD_BANDS = { ok: 90, warn: 80 };
export const loadTone = (v) => pctTone(v, LOAD_BANDS);
export const loadColor = (v) => hex(loadTone(v));

// Выполнение (Compl. %): ≥95% good, ≥70% partial, below = behind.
export const COMPL_BANDS = { ok: 95, warn: 70 };
export const vypTone = (v) => pctTone(v, COMPL_BANDS);
export const vypColor = (v) => hex(vypTone(v));

// Quality corrective-action closure (Hal qilingan %): ≥90% green, 70–89%
// yellow, below that red — read off the hand-coloured shift sheet the
// «Smena hisoboti» table replaced (2026-09-15).
export const RESOLVED_BANDS = { ok: 90, warn: 70 };
export const resolvedTone = (v) => pctTone(v, RESOLVED_BANDS);

// Open concerns at the brigadir's level deliberately have NO band here, and
// nothing should give them one without a decision. They had 0 / 1–2 / ≥3 for a
// day (2026-09-15, read off the same sheet); against the register's real counts
// — 6 to 105 — that painted every unit red, and a column that is red everywhere
// states nothing. A count with no defined threshold is a MAGNITUDE, so the
// «Smena hisoboti» table draws it with the platform's value-intensity ramp
// (brand gold, the «Toifalar bo'yicha» rule) instead of a verdict colour.
