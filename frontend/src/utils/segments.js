// Shared helpers for turning admin-panel threshold segments ([{ from, color }])
// into human-readable color bands. Used by the heatmap/comparison legends and
// the ColorGuideModal so they always agree with what the tables actually draw.

export function orderedSegments(segs = []) {
  return [...segs].sort((a, b) => a.from - b.from);
}

// Fallback diff bands (= backend DEFAULT_DIFF_SEGMENTS) used when the admin
// comparison thresholds haven't loaded yet. D = P − A (P = baseline_util %,
// A = net_util %): below −20 blue, −20→0 green, 1→5 yellow, ≥6 red.
export const DEFAULT_DIFF_SEGMENTS = [
  { from: -9999, color: "#3b82f6" },
  { from: -20,   color: "#22c55e" },
  { from: 1,     color: "#eab308" },
  { from: 6,     color: "#ef4444" },
];

// Diff band → status label. Keyed by color family so admins can recolor within
// a family; positional fallback keeps the order (fastest → slowest) if a band
// gets an off-palette color.
const DIFF_FAMILY_STATUS = { blue: "Monitor", green: "Good", yellow: "On Track", red: "Needs Attention" };
const DIFF_INDEX_STATUS  = ["Monitor", "Good", "On Track", "Needs Attention"];

/**
 * Status badge derived from the planned-vs-final workload gap D = P − A, where
 * P = baseline_util (План %) and A = net_util (Итог. нагрузка). The band — and
 * therefore the color — comes from the admin comparison thresholds, so the badge
 * stays live with the panel and matches the comparison table for the same D.
 * Returns { status, color, d }; color is null only for "No Data".
 */
export function diffStatus(baselineUtil, netUtil, segments) {
  if (baselineUtil == null || netUtil == null) return { status: "No Data", color: null, d: null };
  const segs = orderedSegments(segments?.length ? segments : DEFAULT_DIFF_SEGMENTS);
  const d = Math.round(baselineUtil * 100) - Math.round(netUtil * 100);
  let idx = 0;
  for (let i = 0; i < segs.length; i++) {
    if (d >= segs[i].from) idx = i; else break;
  }
  const color = segs[idx].color;
  const status = DIFF_FAMILY_STATUS[colorFamily(color)]
    ?? DIFF_INDEX_STATUS[Math.min(idx, DIFF_INDEX_STATUS.length - 1)];
  return { status, color, d };
}

/**
 * Human range for sorted `segs[i]`:
 *   first band → "< {next}%"     (everything below the next threshold)
 *   middle     → "{from} to {next-1}%"
 *   last       → "≥ {from}%"
 * Works for negative diff thresholds too (e.g. the −∞ sentinel first band).
 */
export function formatRange(segs, i) {
  const cur  = segs[i];
  const next = segs[i + 1];
  if (i === 0) return next ? `< ${next.from}%` : `≥ ${cur.from}%`;
  if (!next)   return `≥ ${cur.from}%`;
  return `${cur.from} to ${next.from - 1}%`;
}

/** Bucket an arbitrary hex into a color family so meanings map robustly. */
export function colorFamily(hex) {
  if (!hex || hex[0] !== "#" || hex.length < 7) return "other";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (b > 150 && b >= r && b >= g)   return "blue";
  if (r > 150 && g > 110 && b < 110) return "yellow"; // amber / yellow / orange
  if (g >= r && g > 120 && b < 160)  return "green";
  if (r > 150 && g < 140)            return "red";
  return "other";
}

/** Live legend bands from admin segments: [{ color, label }]. */
export function segmentBands(segs = []) {
  const ordered = orderedSegments(segs);
  return ordered.map((seg, i) => ({ color: seg.color, label: formatRange(ordered, i) }));
}

// ─── Editable band descriptions ──────────────────────────────────────────────
// Descriptions live per-band inside the segment JSON as { desc: { <lang>: text } }
// and are edited on the admin panel. The maps below are only starter templates
// used to pre-fill the admin editor (by color family) — the display side reads
// the saved `desc` directly and shows the range alone when a language is blank.

export const DEFAULT_BAND_DESCS = {
  // Comparison table A & D (colored by D = P − A)
  diff: {
    red:    { uz: "Kutilganidan sekinroq ishlayapsiz — anormal sekin", uz_cyrl: "Кутилганидан секинроқ ишлаяпсиз — анормал секин", ru: "Работаете медленнее ожидаемого — аномально медленно", en: "Working slower than expected — abnormally slow" },
    blue:   { uz: "Kutilganidan tezroq ishlayapsiz — gʻayrioddiy yuqori", uz_cyrl: "Кутилганидан тезроқ ишлаяпсиз — ғайриоддий юқори", ru: "Работаете быстрее ожидаемого — необычно высоко", en: "Working faster than expected — unusually high" },
    green:  { uz: "Tezroq ishlayapsiz — normal chegarada", uz_cyrl: "Тезроқ ишлаяпсиз — нормал чегарада", ru: "Работаете быстрее — в пределах нормы", en: "Working faster — within the normal range" },
    yellow: { uz: "Sekinroq ishlayapsiz — normal chegarada", uz_cyrl: "Секинроқ ишлаяпсиз — нормал чегарада", ru: "Работаете медленнее — в пределах нормы", en: "Working slower — within the normal range" },
  },
  // Comparison table P + fleet heatmap (workload / zagruzka)
  load: {
    red:    { uz: "Yuk juda past (zagruzka)", uz_cyrl: "Юк жуда паст (zagruzka)", ru: "Слишком низкая загрузка", en: "Workload too low" },
    yellow: { uz: "Yuk biroz past — normadan past", uz_cyrl: "Юк бироз паст — нормадан паст", ru: "Загрузка немного ниже нормы", en: "Workload slightly low — below the normal range" },
    green:  { uz: "Yuk normal chegarada", uz_cyrl: "Юк нормал чегарада", ru: "Загрузка в пределах нормы", en: "Workload in the normal range" },
    blue:   { uz: "Yuk juda yuqori — normadan yuqori", uz_cyrl: "Юк жуда юқори — нормадан юқори", ru: "Очень высокая загрузка — выше нормы", en: "Workload very high — above the normal range" },
  },
};

/**
 * Pre-fill missing band descriptions from the starter templates (matched by
 * color family), preserving any text the admin already entered. Used to seed the
 * admin editor so unconfigured/legacy bands start with sensible copy.
 * `kind` is "diff" or "load".
 */
export function fillDescs(segments = [], kind) {
  const defaults = DEFAULT_BAND_DESCS[kind] || {};
  return segments.map((seg) => {
    const def = defaults[colorFamily(seg.color)] || {};
    return { ...seg, desc: { ...def, ...(seg.desc || {}) } };
  });
}
