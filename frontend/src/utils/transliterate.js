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
