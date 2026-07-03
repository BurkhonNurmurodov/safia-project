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

import { useLang } from "../context/LangContext";

// ─── Character map ────────────────────────────────────────────────────────────
// Key   = Cyrillic character (lower-case).
// Value = Latin equivalent used for both uz and en.
// Upper-case is handled automatically by capitaliseResult().
const CYRILLIC_TO_LATIN = {
  // Core Russian/Uzbek Cyrillic
  а: "a",  б: "b",  в: "v",  г: "g",  д: "d",
  е: "ye", ё: "yo", ж: "zh", з: "z",  и: "i",
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
// conventional English renderings (the Russian-mediated spellings used by
// international press and sports federations): x→kh (Burxon→Burkhon), q→k
// (Quvondiq→Kuvondik), oʻ→u (Oʻzbekiston→Uzbekistan), gʻ→g (Ulugʻbek→Ulugbek);
// the tutuq apostrophe is dropped (Aʼzam→Azam). sh/ch/j/h/ng read fine as-is.
// Keep in sync with backend/app/translit.py.
const EN_MULTI = [
  ["oʻ", "u"], ["o'", "u"], ["o‘", "u"], ["o’", "u"], ["o`", "u"],
  ["gʻ", "g"], ["g'", "g"], ["g‘", "g"], ["g’", "g"], ["g`", "g"],
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
      out += ch === low ? multi[1] : multi[1].toUpperCase();
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
  return value
    .split(/(\s+)/)                   // keep whitespace tokens to preserve spacing
    .map(token => /\s/.test(token) ? token : transliterateWord(token))
    .join("");
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
  return {
    /** Render a DB string for the current language (override → transliterate). */
    tl: (value) => {
      if (!value) return value;
      const custom = nameOverrides?.[lang]?.[`name.${String(value).trim()}`];
      return custom || transliterate(value, lang);
    },
    /** The current language, in case callers need it. */
    lang,
  };
}
