// A BO'LIM — the room a team works in, with its block and floor (2026-11-23,
// backend `services/bolims.py`). The operator: logistics must know where each
// team is located. These two helpers are THE way one is printed.

// The bo'lim's name for `lang` — its own column, else Uzbek for the Cyrillic
// reader (tx turns it), else Russian, else any. Pass the result through `tx`.
export function bolimName(b, lang) {
  if (!b) return "";
  const names = b.names || {
    uz: b.name_uz, uz_cyrl: b.name_uz_cyrl, ru: b.name_ru, en: b.name_en,
  };
  const order = [lang, lang === "uz_cyrl" ? "uz" : null, "ru", "uz", "uz_cyrl", "en"];
  for (const k of order) if (k && names[k] && String(names[k]).trim()) return String(names[k]).trim();
  return "";
}

// «A blok · 2-qavat» — whichever of the two is known; "" when neither is.
export function bolimWhere(t, b) {
  if (!b) return "";
  const hasB = !!b.block, hasF = b.floor != null && b.floor !== "";
  const floor = hasF ? (Number(b.floor) < 0 ? `−${Math.abs(Number(b.floor))}` : String(b.floor)) : "";
  if (hasB && hasF) return t("bolim.place").replace("{block}", b.block).replace("{floor}", floor);
  if (hasB) return t("bolim.placeBlock").replace("{block}", b.block);
  if (hasF) return t("bolim.placeFloor").replace("{floor}", floor);
  return "";
}

// The whole line: «Pirog tayyorlash sexi · 2.07 · A blok · 2-qavat».
export function bolimLine(t, tx, lang, b) {
  if (!b) return "";
  return [tx(bolimName(b, lang)), b.code || "", bolimWhere(t, b)].filter(Boolean).join(" · ");
}
