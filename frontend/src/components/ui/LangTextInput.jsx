import { useState } from "react";
import SegmentedToggle from "./SegmentedToggle";
import { useLang } from "../../context/LangContext";

/**
 * LangTextInput — THE template for a text field that exists in all four UI
 * languages (workshop names, and any future per-language label the user types).
 *
 * Never stack one input per language: the field shows a `SegmentedToggle` of
 * language tabs plus ONE input for the selected tab, so a four-language field
 * costs a single row of vertical space instead of four.
 *
 * Every language is optional. `fallbackLang` (Russian — the language the plant
 * actually fills in) is the one that gets displayed when the viewer's language
 * is blank, so an empty tab shows the fallback text as its PLACEHOLDER: the
 * editor sees exactly what the app will render there without that text being
 * saved into the column. The tabs themselves stay plain — no filled/empty
 * markers — deliberately.
 *
 * Props:
 *   langs        – tab order (default: the app's canonical uz · uz_cyrl · ru · en)
 *   defaultLang  – tab opened first (default "ru", the fallback language)
 *   value        – { <lang>: text } — missing / "" means "not set" for that language
 *   onChange     – (lang, text) => void, fired for the edited language only
 *   fallbackLang – language whose text placeholders the empty tabs ("ru")
 *   placeholder  – shown when the fallback language is empty too
 *   hint         – false to drop the "empty → Russian is shown" explainer line
 *   className    – extra wrapper classes (spacing only)
 */

const LANG_LABEL = { uz: "UZ", uz_cyrl: "ЎЗ", ru: "RU", en: "EN" };
const LANG_TITLE = { uz: "O‘zbekcha", uz_cyrl: "Ўзбекча", ru: "Русский", en: "English" };

const DEFAULT_LANGS = ["uz", "uz_cyrl", "ru", "en"];

const inputCls = "w-full rounded-lg px-2.5 py-2 text-xs focus:outline-none";
const inputStyle = {
  background: "var(--input-bg)",
  border: "1px solid var(--border-md)",
  color: "var(--text-1)",
};

export default function LangTextInput({
  langs = DEFAULT_LANGS,
  defaultLang = "ru",
  value = {},
  onChange,
  fallbackLang = "ru",
  placeholder = "",
  hint = true,
  autoFocus = false,
  className = "",
}) {
  const { t } = useLang();
  const [active, setActive] = useState(
    langs.includes(defaultLang) ? defaultLang : langs[0]
  );

  const current = value[active] || "";
  const fallback = (value[fallbackLang] || "").trim();
  // An empty non-fallback tab previews the Russian text rather than saving it.
  const showFallback = active !== fallbackLang && !!fallback;

  return (
    <div>
      <SegmentedToggle
        size="sm"
        fill
        value={active}
        onChange={setActive}
        options={langs.map((l) => ({
          value: l,
          label: LANG_LABEL[l] || l.toUpperCase(),
          title: LANG_TITLE[l] || l,
        }))}
      />
      <input
        type="text"
        value={current}
        onChange={(e) => onChange?.(active, e.target.value)}
        placeholder={showFallback ? fallback : placeholder}
        className={inputCls + " mt-2"}
        style={inputStyle}
        autoFocus={autoFocus}
      />
      {hint && showFallback && !current && (
        <p className="mt-1 text-[10px] leading-snug" style={{ color: "var(--text-4)" }}>
          {t("ui.langInput.ruFallback")}
        </p>
      )}
    </div>
  );
}
