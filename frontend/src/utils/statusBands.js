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
// A solid cell COVERS the card, so the pair must not depend on what the card
// is: both halves are theme-independent by construction rather than by
// omission, the rule the «Toifalar bo'yicha» ramp keeps for its own top end.
//
// It is the SAME cell the загрузка heatmap already paints (`HeatmapChart`, the
// platform's own heatmap): the band's hue at FULL SATURATION — `TONE_HEX`, the
// one place a status colour is named — with the ink `contrastText` picks for
// it. Muting the hue was tried for a day and is the mistake to avoid: a dark
// green takes white ink but also swallows the 1px gridline between two cells,
// so a row of three of them reads as one block, and a yellow dark enough for
// white ink is brown, which the middle of a traffic light cannot read as. At
// full saturation the ink follows the hue instead — dark on green and yellow,
// white on red — which is why a band names a PAIR here and never a background.
//
// `contrastText` is that rule and `HeatmapChart` imports it from here; two
// spellings is how one green ends up with two different inks on two pages.
export function contrastText(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Perceived luminance (WCAG formula, simplified).
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.52 ? "#111827" : "#ffffff";
}

export const toneFill = (tone) =>
  (tone ? { background: TONE_HEX[tone], color: contrastText(TONE_HEX[tone]) } : undefined);

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

// Open concerns at the brigadir's level — a COUNT, so FEWER is better:
// 0–5 green, 6–20 yellow, 21 and up red. It carries the same three colours as
// the columns beside it (the operator's call, 2026-09-16 — one board, one
// vocabulary), and what changed is only the NUMBERS. The sheet's own
// 0 / 1–2 / ≥3 shipped for a day and painted every unit red, because the
// register really holds 6 to 105 open concerns per unit; a column that is red
// everywhere states nothing at all. These three bands split today's fleet into
// roughly even thirds, and they are printed in the legend precisely because
// nobody has ruled on them yet: they are numbers to move, not a measurement.
export const CONCERN_BANDS = { ok: 5, warn: 20 };
export const concernsTone = (n) => {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return n <= CONCERN_BANDS.ok ? "ok" : n <= CONCERN_BANDS.warn ? "warn" : "bad";
};
