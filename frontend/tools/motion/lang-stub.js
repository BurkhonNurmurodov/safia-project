// Stand-in for src/context/LangContext.jsx, swapped in by run.mjs's build: the
// real provider needs the session and the API. Same hook, Uzbek strings (then
// English) straight from the dictionary — the templates only ever call `t`.
import all from "../../src/i18n/translations.js";

const dict = { ...(all.en || {}), ...(all.uz || {}) };
const value = {
  lang: "uz",
  setLang() {},
  t: (key) => dict[key] ?? key,
  languages: [{ code: "uz", name: "O‘zbekcha" }],
  nameOverrides: {},
  reloadTranslations: () => Promise.resolve(),
};

export function LangProvider({ children }) { return children; }
export const useLang = () => value;
