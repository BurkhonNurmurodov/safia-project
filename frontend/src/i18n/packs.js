import { importWithRecovery } from "../utils/importRecovery";

// The reader's ONE language (2026-10-23). translations.js holds all four and
// stays the file people edit; the build cuts it into one module per language
// (vite.config.js → i18nPacks), and only the reader's is downloaded — index.html
// starts fetching it before the app code runs. A pack is
// `{ own, uz, en }`: the language's strings, then what LangContext's fallback
// chain would take from Latin Uzbek (uz_cyrl only) and from English for a key
// the language lacks — so one pack answers exactly what the whole dictionary
// did. Never import translations.js from anything a page load runs: it would
// put all four languages back into the boot download.
const LOADERS = {
  uz: () => import("virtual:i18n/uz"),
  uz_cyrl: () => import("virtual:i18n/uz_cyrl"),
  ru: () => import("virtual:i18n/ru"),
  en: () => import("virtual:i18n/en"),
};

const packs = {};    // lang → pack, once loaded
const loading = {};  // lang → promise in flight

/** The pack for `lang`, or null while it has not arrived. */
export function packFor(lang) {
  return packs[lang] || null;
}

/** Any pack that has arrived — what to show while another one loads. */
export function anyPack() {
  return packs[Object.keys(packs)[0]] || null;
}

/**
 * Load the pack for `lang` (resolves to it). A language the build does not
 * carry — one an admin added in the DB — reads English for every key, as the
 * whole-dictionary lookup did; its own words come from the DB overrides.
 */
export function loadPack(lang) {
  const code = lang || "uz";
  if (packs[code]) return Promise.resolve(packs[code]);
  if (loading[code]) return loading[code];
  const p = LOADERS[code]
    ? importWithRecovery(LOADERS[code]).then((m) => m.default)
    : loadPack("en").then((en) => ({ own: {}, uz: {}, en: en.own }));
  loading[code] = p
    .then((pack) => { packs[code] = pack; return pack; })
    .finally(() => { delete loading[code]; });
  return loading[code];
}

/**
 * One key, the static half of LangContext's chain: the language's own string,
 * then Latin Uzbek (uz_cyrl), then English, then the key. `over` is the DB
 * overrides object ({ lang: { key: value } }); pass {} for none.
 */
export function lookup(pack, lang, key, over) {
  return (
    over[lang]?.[key] ??
    pack?.own?.[key] ??
    (lang === "uz_cyrl" ? (over.uz?.[key] ?? pack?.uz?.[key]) : undefined) ??
    over.en?.[key] ??
    pack?.en?.[key] ??
    key
  );
}
