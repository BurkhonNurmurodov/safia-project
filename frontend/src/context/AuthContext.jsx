import { createContext, useContext, useEffect, useState } from "react";
import api from "../utils/api";
import { clearToken, getToken, inTelegram, isRemembered, isWebSession, setToken } from "../utils/session";

const AuthContext = createContext(null);

const COUNTDOWN_SEC = 3;

// Local development runs outside Telegram and relies on the DEV_AUTH bypass, so
// the password screen would never be reachable there. ?weblogin=1 forces it.
const FORCE_WEB_LOGIN =
  new URLSearchParams(window.location.search).get("weblogin") === "1";

export function AuthProvider({ children }) {
  const [auth, setAuth]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [botUsername, setBotUsername] = useState("");
  const [countdown, setCountdown]     = useState(null); // null = not logging out
  const [webSession, setWebSession]   = useState(isWebSession());

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      // /login and the compact /broadcast picker must not expand to full height.
      const path = window.location.pathname;
      if (!path.startsWith("/login") && !path.startsWith("/broadcast-receivers")) tg.expand();
    }

    const initData = tg?.initData || "";

    // ── Browser (not a Telegram client) ──────────────────────────────────────
    // A stored browser token is re-validated against the server rather than
    // trusted: /session re-derives the profile, so a rename or a revoked login
    // lands on the next page load instead of living on in an open tab.
    if (!inTelegram() || FORCE_WEB_LOGIN) {
      if (getToken() && isWebSession()) {
        api.get("/api/auth/web/session")
          .then((r) => { setAuth(r.data); setWebSession(true); })
          .catch(() => { clearToken(); setWebSession(false); setAuth({ status: "web_login" }); })
          .finally(() => setLoading(false));
        return;
      }
      // No browser session yet. In production that always means the login
      // screen; locally the DEV_AUTH bypass below stays the default so the
      // existing dev workflow is untouched.
      if (import.meta.env.PROD || FORCE_WEB_LOGIN) {
        setAuth({ status: "web_login" });
        setLoading(false);
        return;
      }
    }

    // Launched inside Telegram but the client is older than Bot API 8.0
    // (Nov 2024) — features we rely on are missing or crash there, so ask
    // the user to update Telegram instead of logging in.
    if (initData && typeof tg?.isVersionAtLeast === "function" && !tg.isVersionAtLeast("8.0")) {
      setAuth({ status: "outdated_telegram" });
      setLoading(false);
      return;
    }

    // No initData in production (opened outside Telegram, or the webview
    // failed to pass it) — show a dedicated error page instead of the dev
    // bypass. The "__dev__" fallback is for local development only.
    if (!initData && import.meta.env.PROD) {
      api.get("/api/auth/bot-info")
        .then((botRes) => setBotUsername(botRes.data.bot_username || ""))
        .catch(() => {})
        .finally(() => {
          setAuth({ status: "no_init_data" });
          setLoading(false);
        });
      return;
    }

    Promise.all([
      api.post("/api/auth/webapp", { init_data: initData || "__dev__" }),
      api.get("/api/auth/bot-info"),
    ])
      .then(([authRes, botRes]) => {
        const data = authRes.data;
        if (data.token) setToken(data.token, { remember: true, web: false });
        setAuth(data);
        setBotUsername(botRes.data.bot_username || "");
      })
      .catch(() => setAuth({ status: "error" }))
      .finally(() => setLoading(false));
  }, []);

  // Countdown tick → close when it hits 0
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      clearToken();
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.close();
      } else {
        setAuth({ status: "not_registered" });
        setCountdown(null);
      }
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // Auto-close when not registered inside Telegram (e.g. menu-button open after sign-out)
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (auth?.status === "not_registered" && tg?.initData) {
      const lang = localStorage.getItem("lang") || "uz";
      api.post("/api/auth/send-start-hint", { init_data: tg.initData, language: lang })
        .catch(() => {});
      setCountdown(COUNTDOWN_SEC);
    }
  }, [auth?.status]);

  async function logout() {
    // Signing out of a BROWSER session must not delete the account: the
    // Telegram "sign out" is an unregister (it drops the roles and asks the
    // person to /start again), which would be a catastrophic reading of
    // "log out" on a website. Here it only ends the session.
    if (webSession) {
      clearToken();
      window.location.href = "/";
      return;
    }
    try {
      await api.delete("/api/auth/me");
    } catch (_) {}
    setCountdown(COUNTDOWN_SEC);
  }

  /** Accept a successful password login and enter the app. */
  function webLogin(data, remember) {
    if (data?.token) setToken(data.token, { remember, web: true });
    setWebSession(true);
    setAuth(data);
  }

  /** Swap in a token the server re-issued (e.g. after a password change) so the
   *  tab the person is typing in does not log itself out. */
  function replaceWebToken(token) {
    if (token) setToken(token, { remember: isRemembered(), web: true });
  }

  // Swap the JWT for another approved role; a full reload re-fetches
  // everything under the new role's scope.
  async function switchRole(roleRef) {
    const r = await api.post("/api/auth/switch-role", { role_ref: roleRef });
    if (r.data?.token) setToken(r.data.token, { remember: true, web: false });
    window.location.reload();
  }

  // Drop a single role. Leaving the last role deletes the account —
  // same flow as full sign-out.
  async function leaveRole(roleRef) {
    const r = await api.delete(`/api/auth/roles/${roleRef}`);
    if (r.data?.account_deleted) {
      setCountdown(COUNTDOWN_SEC);
      return;
    }
    if (r.data?.token) setToken(r.data.token, { remember: true, web: false });
    window.location.reload();
  }

  return (
    <AuthContext.Provider value={{
      auth, loading, logout, switchRole, leaveRole, botUsername, countdown,
      webSession, webLogin, replaceWebToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
