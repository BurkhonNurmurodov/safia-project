/**
 * transliterate.js
 *
 * Converts Cyrillic strings (Russian / Uzbek) to Latin script.
 * Used when the app language is set to "en" or "uz" so that dynamic
 * database values (worker names, job titles, equipment categories,
 * supervisor names) are rendered in the Latin alphabet.
 *
 * Usage:
 *   import { transliterate, useTranslit } from "@/utils/transliterate";
 *
 *   // Direct utility (outside React):
 *   const label = transliterate("Иванов Алексей", "en"); // → "Ivanov Aleksey"
 *
 *   // React hook (reads active lang automatically):
 *   const { tl } = useTranslit();
 *   <td>{tl(worker.worker_name)}</td>
 */

import { useMemo } from "react";

import { useLang } from "../context/LangContext";

/** Fold a raw DB name onto a comparable key: trimmed, single-spaced, lower-case.
 *  Only ever merges spellings of one value — never splits one. */
const normaliseNameKey = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

// ─── Character map ────────────────────────────────────────────────────────────
// Key   = Cyrillic character (lower-case).
// Value = the UZBEK LATIN equivalent — this stage always produces Uzbek Latin,
// and toEnglish() below is what converts that to English conventions. So the
// values here must follow the Uzbek alphabet, never the Russian romanisation:
// ж is "j" (Санжар → Sanjar), NOT "zh". Writing "zh" here made every ж-name
// render the Russian way on a platform whose Latin is Uzbek, contradicted the
// reverse map below (j → ж, so "Sanjar" round-tripped to "Sanzhar"), and forced
// an admin to hand-type a name override per person per spelling to undo it.
// Upper-case is handled automatically by capitaliseResult().
const CYRILLIC_TO_LATIN = {
  // Core Russian/Uzbek Cyrillic
  а: "a",  б: "b",  в: "v",  г: "g",  д: "d",
  е: "ye", ё: "yo", ж: "j",  з: "z",  и: "i",
  й: "y",  к: "k",  л: "l",  м: "m",  н: "n",
  о: "o",  п: "p",  р: "r",  с: "s",  т: "t",
  у: "u",  ф: "f",  х: "kh", ц: "ts", ч: "ch",
  ш: "sh", щ: "shch", ъ: "",  ы: "y",  ь: "",
  э: "e",  ю: "yu", я: "ya",

  // Uzbek-specific Cyrillic letters
  ў: "o'", қ: "q",  ғ: "g'", ҳ: "h",
  ъ: "",   ё: "yo",

  // Commonly seen variants / pre-reform Uzbek
  ъ: "'",
};

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Convert a single word from Cyrillic to Latin.
 * Preserves the capitalisation of the original word:
 *   "ИВАНОВ" → "IVANOV"
 *   "Иванов" → "Ivanov"
 *   "иванов" → "ivanov"
 */
function transliterateWord(word) {
  if (!word) return word;

  const chars = [...word]; // spread so multi-byte chars work correctly
  let result = "";

  for (let i = 0; i < chars.length; i++) {
    const ch  = chars[i];
    const low = ch.toLowerCase();

    // "е" is /ye/ only at word start or after a vowel/ъ/ь; after a consonant
    // it is plain /e/ — "Бекзод" → "Bekzod", not "Byekzod".
    if (low === "е") {
      const prev = i > 0 ? chars[i - 1].toLowerCase() : "";
      const rep = !prev || "аеёиоуыэюяўъь".includes(prev) ? "ye" : "e";
      result += ch !== low ? rep[0].toUpperCase() + rep.slice(1) : rep;
      continue;
    }

    if (CYRILLIC_TO_LATIN[low] !== undefined) {
      const latin = CYRILLIC_TO_LATIN[low];

      // Preserve upper-case: if original char is upper, capitalise the first
      // letter of the latin replacement ("Ш" → "Sh", "ЩА" → "Shcha" etc.).
      if (ch !== low && latin.length > 0) {
        result += latin[0].toUpperCase() + latin.slice(1);
      } else {
        result += latin;
      }
    } else {
      // Non-Cyrillic character — pass through unchanged (digits, punctuation…)
      result += ch;
    }
  }

  return result;
}

// ─── Latin → Cyrillic (reverse direction) ─────────────────────────────────────
// Used by the settings name editor: the canonical name is Uzbek Latin, and the
// per-language "translate" buttons derive the Cyrillic variants from it.
// Digraphs/apostrophe-letters must be matched before single letters.
const LATIN_MULTI = [
  ["oʻ", "ў"], ["o'", "ў"], ["o‘", "ў"], ["o’", "ў"], ["o`", "ў"],
  ["gʻ", "ғ"], ["g'", "ғ"], ["g‘", "ғ"], ["g’", "ғ"], ["g`", "ғ"],
  ["sh", "ш"], ["ch", "ч"], ["yo", "ё"], ["yu", "ю"],
  ["ya", "я"], ["ye", "е"], ["ts", "ц"],
];

const LATIN_SINGLE = {
  a: "а", b: "б", c: "ц", d: "д", e: "е", f: "ф", g: "г", h: "ҳ",
  i: "и", j: "ж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п",
  q: "қ", r: "р", s: "с", t: "т", u: "у", v: "в", x: "х", y: "й",
  z: "з", "ʼ": "ъ", "'": "ъ", "’": "ъ",
};

// Russian alphabet has no ў/қ/ғ/ҳ — map them to the closest Russian letters.
const UZ_CYR_TO_RU = { "ў": "у", "қ": "к", "ғ": "г", "ҳ": "х" };

const LATIN_VOWELS = new Set(["a", "e", "i", "o", "u"]);

function latinWordToCyrillic(word) {
  const src = [...word];
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch  = src[i];
    const low = ch.toLowerCase();

    // "e" at word start or after a vowel is э ("Erkin" → "Эркин")
    if (low === "e" && (i === 0 || LATIN_VOWELS.has(src[i - 1]?.toLowerCase()))) {
      out += ch === low ? "э" : "Э";
      i += 1;
      continue;
    }

    const pair = src.slice(i, i + 2).join("").toLowerCase();
    const multi = LATIN_MULTI.find(([lat]) => lat === pair);
    if (multi) {
      out += ch === low ? multi[1] : multi[1].toUpperCase();
      i += 2;
      continue;
    }

    const single = LATIN_SINGLE[low];
    if (single !== undefined) {
      out += ch === low ? single : single.toUpperCase();
    } else {
      out += ch; // digits, punctuation, already-Cyrillic — pass through
    }
    i += 1;
  }
  return out;
}

// ─── Uzbek Latin → English Latin ─────────────────────────────────────────────
// Uzbek Latin letters that MISREAD in English are remapped to their
// conventional English renderings (the spellings used by international press
// and sports federations): x→kh (Burxon→Burkhon), q→k (Quvondiq→Kuvondik),
// oʻ→u (Oʻzbekiston→Uzbekistan), gʻ→gh (Ulugʻbek→Ulughbek); the tutuq
// apostrophe is dropped (Aʼzam→Azam). sh/ch/j/h/ng read fine as-is.
// Keep in sync with backend/app/translit.py.
const EN_MULTI = [
  ["oʻ", "u"],  ["o'", "u"],  ["o‘", "u"],  ["o’", "u"],  ["o`", "u"],
  ["gʻ", "gh"], ["g'", "gh"], ["g‘", "gh"], ["g’", "gh"], ["g`", "gh"],
];

const EN_SINGLE = { x: "kh", q: "k", "ʼ": "", "'": "", "’": "", "‘": "", "`": "" };

function latinWordToEnglish(word) {
  const src = [...word];
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch  = src[i];
    const low = ch.toLowerCase();

    const pair = src.slice(i, i + 2).join("").toLowerCase();
    const multi = EN_MULTI.find(([lat]) => lat === pair);
    if (multi) {
      const rep = multi[1];
      if (ch === low || rep.length === 1) {
        out += ch === low ? rep : rep.toUpperCase();
      } else {
        // "GʻULOM" → "GHULOM", "Gʻulom" → "Ghulom"
        const next = src[i + 2];
        out += next && next !== next.toLowerCase()
          ? rep.toUpperCase()
          : rep[0].toUpperCase() + rep.slice(1);
      }
      i += 2;
      continue;
    }

    const single = EN_SINGLE[low];
    if (single !== undefined) {
      if (ch === low || !single) {
        out += single;
      } else {
        // "XURSHID" → "KHURSHID", "Xurshid" → "Khurshid"
        const next = src[i + 1];
        out += next && next !== next.toLowerCase()
          ? single.toUpperCase()
          : single[0].toUpperCase() + single.slice(1);
      }
    } else {
      out += ch;
    }
    i += 1;
  }
  return out;
}

function toEnglish(value) {
  return value
    .split(/(\s+)/)
    .map(token => /\s/.test(token) ? token : latinWordToEnglish(token))
    .join("");
}

/**
 * Derive a per-language display name from the canonical Uzbek-Latin name.
 * Pure alphabet switching — no dictionary, no external API.
 *
 *   uz      → unchanged
 *   uz_cyrl → Uzbek Cyrillic ("Gʻulom" → "Ғулом")
 *   ru      → Russian Cyrillic ("Gʻulom" → "Гулом")
 *   en      → conventional English rendering ("Burxon" → "Burkhon")
 */
export function convertFromUz(value, targetLang) {
  if (!value) return value;
  if (targetLang === "uz") return value;
  if (targetLang === "uz_cyrl" || targetLang === "ru") {
    let cyr = value
      .split(/(\s+)/)
      .map(token => /\s/.test(token) ? token : latinWordToCyrillic(token))
      .join("");
    if (targetLang === "ru") {
      cyr = [...cyr].map(ch => {
        const low = ch.toLowerCase();
        const ru = UZ_CYR_TO_RU[low];
        return ru === undefined ? ch : (ch === low ? ru : ru.toUpperCase());
      }).join("");
    }
    return cyr;
  }
  if (targetLang === "en") return transliterate(value, "en");
  // any other Latin-script language: normalise ʻ/‘/` to a plain '
  return value.replace(/[ʻ‘`]/g, "'");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Transliterate a string only when the active language requires it.
 *
 * @param {string} value  - The dynamic DB string (may be Cyrillic or already Latin).
 * @param {string} lang   - Current language code ("uz" | "en" | "ru").
 * @returns {string}      - Transliterated string for uz/en; original for ru.
 */
export function transliterate(value, lang) {
  // ru and Cyrillic Uzbek keep the original Cyrillic; anything else gets transliterated.
  if (!value || lang === "ru" || lang === "uz_cyrl") return value;

  // Split on whitespace boundaries so each word is capitalised independently.
  const latin = value
    .split(/(\s+)/)                   // keep whitespace tokens to preserve spacing
    .map(token => /\s/.test(token) ? token : transliterateWord(token))
    .join("");

  // English additionally remaps the Uzbek-Latin letters that misread in
  // English (x→kh, q→k, oʻ→u, gʻ→gh, tutuq dropped) — so "Burxon" and its
  // Cyrillic twin "Бурхон" both render "Burkhon".
  return lang === "en" ? toEnglish(latin) : latin;
}

/**
 * React hook — wraps transliterate() with the current language from context.
 *
 * Returns `tl(value)` — a helper that renders a dynamic DB value (worker name,
 * job title, brigadir name) for the active language. Admin-defined overrides
 * (stored as "name.<raw value>" keys in the translations table, edited in
 * Admin → Translations) win; otherwise falls back to automatic transliteration.
 *
 * Example:
 *   const { tl } = useTranslit();
 *   <span>{tl(worker.worker_name)}</span>
 */
export function useTranslit() {
  const { lang, nameOverrides } = useLang();

  // The override is keyed by the EXACT raw DB value, but one person's name
  // reaches the UI in more than one spelling: the Translations editor lists the
  // canonical `Manager.name` ("Абдукаримов Санжар"), while feeds built from the
  // source sheets carry whatever the form captured — commonly the same name
  // SHOUTED ("АБДУКАРИМОВ САНЖАР"). Exact matching made an override apply on the
  // pages reading the canonical name and silently miss the ones reading a sheet
  // spelling, which reads as "the fix worked in some places". So keep a second,
  // case- and whitespace-folded index and fall back to it. A fold that two
  // DIFFERENT override values share is dropped rather than guessed at.
  const folded = useMemo(() => {
    const out = new Map(), clash = new Set();
    for (const [key, value] of Object.entries(nameOverrides?.[lang] || {})) {
      if (!key.startsWith("name.")) continue;
      const k = normaliseNameKey(key.slice(5));
      if (!k || clash.has(k)) continue;
      if (out.has(k) && out.get(k) !== value) { out.delete(k); clash.add(k); continue; }
      out.set(k, value);
    }
    return out;
  }, [nameOverrides, lang]);

  return {
    /** Render a DB string for the current language (override → transliterate). */
    tl: (value) => {
      if (!value) return value;
      const raw = String(value).trim();
      const custom = nameOverrides?.[lang]?.[`name.${raw}`] ?? folded.get(normaliseNameKey(raw));
      return custom || transliterate(value, lang);
    },
    /** The current language, in case callers need it. */
    lang,
  };
}
