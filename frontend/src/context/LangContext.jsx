import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import dict from "../i18n/translations";
import api from "../utils/api";
import { useAuth } from "./AuthContext";

const LangContext = createContext(null);

// Built-in languages — used until the backend list loads (and as a fallback).
const STATIC_LANGS = [
  { code: "uz", name: "O‘zbekcha" },
  { code: "uz_cyrl", name: "Ўзбекча" },
  { code: "ru", name: "Русский" },
  { code: "en", name: "English" },
];

export function LangProvider({ children, defaultLang = "uz" }) {
  const { auth } = useAuth() || {};
  const [lang, setLangState] = useState(() => localStorage.getItem("lang") || defaultLang);
  const [overrides, setOverrides] = useState({});      // { lang: { key: value } } from DB
  const [nameOverrides, setNameOverrides] = useState({}); // { lang: { "name.<raw>": value } }
  const [languages, setLanguages] = useState(STATIC_LANGS);
  // Whether this device already had an explicit choice before this session —
  // captured once, before the sync effect below writes the default.
  const hadStoredLang = useRef(localStorage.getItem("lang") != null);

  // Keep localStorage in sync
  useEffect(() => { localStorage.setItem("lang", lang); }, [lang]);

  // Changing the language persists it to the user's profile so the Telegram bot
  // DMs them in the same language as the dashboard (the bell already renders per
  // request). Fire-and-forget; the api interceptor attaches the bearer token.
  const setLang = useCallback((code) => {
    setLangState(code);
    if (localStorage.getItem("tg_token")) {
      api.post("/api/auth/language", { language: code }).catch(() => {});
    }
  }, []);

  // On login, keep the profile language (used for bot DMs) in lock-step with the app:
  //  • First run on this device (no prior choice): adopt the profile's saved
  //    language (e.g. chosen at bot registration) so the dashboard matches it.
  //  • Otherwise the app is the source of truth — if the profile differs (e.g. a
  //    choice made before this sync existed, or on another device), push the app's
  //    language so the bot DMs the user in the same language. They never diverge.
  useEffect(() => {
    if (auth?.status !== "approved") return;
    if (!localStorage.getItem("tg_token")) return;
    if (!hadStoredLang.current) {
      if (auth.language) setLangState(auth.language);
      hadStoredLang.current = true;
      return;
    }
    if (auth.language !== lang) {
      api.post("/api/auth/language", { language: lang }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.status, auth?.language]);

  // Load DB overrides + dynamic language list (open endpoint — no auth needed).
  // Name overrides (worker/brigadir names) live behind auth and may 401 before
  // login — that's fine, they're refetched once auth resolves below.
  const reloadTranslations = useCallback(() => {
    return Promise.all([
      api.get("/api/translations")
        .then((r) => {
          setOverrides(r.data?.overrides || {});
          if (Array.isArray(r.data?.languages) && r.data.languages.length) {
            setLanguages(r.data.languages.map((l) => ({ code: l.code, name: l.name })));
          }
        })
        .catch(() => {}),
      api.get("/api/translations/names")
        .then((r) => setNameOverrides(r.data?.overrides || {}))
        .catch(() => {}),
    ]);
  }, []);

  useEffect(() => { reloadTranslations(); }, [reloadTranslations]);

  // The mount-time fetch races the Telegram auth handshake — refetch the
  // auth-gated name overrides once the user is approved.
  useEffect(() => {
    if (auth?.status === "approved") {
      api.get("/api/translations/names")
        .then((r) => setNameOverrides(r.data?.overrides || {}))
        .catch(() => {});
    }
  }, [auth?.status]);

  // t(key) — DB override → static dict → Latin-uz fallback (for uz_cyrl) →
  // English fallbacks → the key itself
  function t(key) {
    return (
      overrides[lang]?.[key] ??
      dict[lang]?.[key] ??
      (lang === "uz_cyrl" ? (overrides["uz"]?.[key] ?? dict["uz"]?.[key]) : undefined) ??
      overrides["en"]?.[key] ??
      dict["en"]?.[key] ??
      key
    );
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t, languages, nameOverrides, reloadTranslations }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
