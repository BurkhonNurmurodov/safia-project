import { createContext, useContext, useEffect, useState } from "react";
import api from "../utils/api";
import { clearToken, getToken, inTelegram, isRemembered, isTabSession, isWebSession, setToken } from "../utils/session";
import { findProfile, listProfiles, removeProfile, saveProfile } from "../utils/profileWallet";

const AuthContext = createContext(null);

const COUNTDOWN_SEC = 3;

// Local development runs outside Telegram and relies on the DEV_AUTH bypass, so
// the password screen would never be reachable there. ?weblogin=1 forces it.
const FORCE_WEB_LOGIN =
  new URLSearchParams(window.location.search).get("weblogin") === "1";

/**
 * The one-time code an admin's «open as this profile» put in this tab's URL.
 *
 * Read and STRIPPED at module scope, before anything renders: the code is
 * spendable once and dead in a minute, but a credential-shaped string has no
 * business surviving in the address bar, in the history entry, or in the
 * referrer of whatever this page loads next.
 */
const IMPERSONATE_CODE = (() => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("as") || "";
  if (!code) return "";
  params.delete("as");
  const qs = params.toString();
  try {
    window.history.replaceState({}, "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
  } catch { /* nothing to strip is not a reason to fail the open */ }
  return code;
})();

// StrictMode runs effects twice in development and the code is spendable ONCE,
// so the request itself is the single-flight guard: the second call awaits the
// first answer instead of spending a code that no longer exists.
let impersonateExchange = null;
function exchangeImpersonation(code) {
  if (!impersonateExchange) {
    impersonateExchange = api.post("/api/auth/web/impersonate", { code });
  }
  return impersonateExchange;
}

export function AuthProvider({ children }) {
  const [auth, setAuth]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [botUsername, setBotUsername] = useState("");
  const [countdown, setCountdown]     = useState(null); // null = not logging out
  const [webSession, setWebSession]   = useState(isWebSession());
  // Every profile this browser is signed in as — see utils/profileWallet.js.
  const [webProfiles, setWebProfiles] = useState(() => listProfiles());

  /** Record the profile that is active RIGHT NOW in the wallet, so the switcher
   *  always lists who you are as well as who else you can become. Also covers
   *  sessions that pre-date the wallet, and a wallet a browser wiped. */
  function rememberActive(data, remember = isRemembered()) {
    const username = data?.web_login?.username;
    const token = getToken();
    if (!username || !token) return;
    // An impersonated session is never added: the wallet holds profiles this
    // browser may re-enter WITHOUT a password, and an admin looking around as
    // somebody else must not leave a standing key to that person's account
    // behind in the machine's storage.
    if (data?.impersonated || isTabSession()) return;
    saveProfile({
      username,
      full_name: data.full_name,
      role: data.role,
      role_ref: data.active_role_ref,
      profile_key: data.profile_key,
      photo_ver: data.photo_ver,
      token,
      remember,
    });
    setWebProfiles(listProfiles());
  }

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      // /login and the compact /broadcast picker must not expand to full height.
      const path = window.location.pathname;
      if (!path.startsWith("/login") && !path.startsWith("/broadcast-receivers")) tg.expand();
    }

    const initData = tg?.initData || "";

    // ── Opened AS somebody else (admin impersonation) ────────────────────────
    // First, and whatever else this tab holds: the code is an explicit
    // instruction to be this profile here, and it outranks the session the tab
    // inherited from the one that opened it. The token is TAB-SCOPED, so the
    // admin's own session in the tabs beside this one is untouched.
    if (IMPERSONATE_CODE) {
      exchangeImpersonation(IMPERSONATE_CODE)
        .then((r) => {
          setToken(r.data.token, { web: true, tab: true });
          setWebSession(true);
          setAuth(r.data);
        })
        // Spent, expired, or the login was disabled in between. Say so instead
        // of falling through to the ordinary boot, which would quietly open the
        // ADMIN's own session in a tab they asked to be somebody else in.
        .catch(() => setAuth({ status: "impersonate_failed" }))
        .finally(() => setLoading(false));
      return;
    }

    // ── Browser (not a Telegram client) ──────────────────────────────────────
    // A stored browser token is re-validated against the server rather than
    // trusted: /session re-derives the profile, so a rename or a revoked login
    // lands on the next page load instead of living on in an open tab.
    if (!inTelegram() || FORCE_WEB_LOGIN) {
      if (getToken() && isWebSession()) {
        api.get("/api/auth/web/session")
          .then((r) => { setAuth(r.data); setWebSession(true); rememberActive(r.data); })
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
    //
    // With several profiles in the wallet it signs out of the ACTIVE one only:
    // its row is dropped and the next profile takes over, so signing out never
    // silently ends a colleague's session too. When it was the last row there is
    // nothing to fall back to and the login screen is the honest destination.
    // An impersonated tab signs out of the IMPERSONATION, never out of the
    // wallet: its rows are the admin's own profiles, and switching into one of
    // them here would write a token to localStorage — the store this tab has
    // deliberately never touched. Clearing the tab-scoped session drops it back
    // to whatever the admin's own tabs are signed in as, in this tab alone.
    if (auth?.impersonated) {
      clearToken();
      window.location.assign("/");
      return;
    }
    if (webSession) {
      const active = auth?.web_login?.username;
      if (active) removeProfile(active);
      const next = listProfiles()[0];
      if (next) {
        setToken(next.token, { remember: next.remember, web: true });
        window.location.assign("/");
        return;
      }
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
    rememberActive(data, remember);
  }

  /**
   * A second (third, …) profile signed in from the header menu. It becomes
   * active immediately, which is what every account switcher does.
   *
   * A full load rather than a state swap: pages persist filters, scroll and
   * fetched rows, and none of that belongs to the profile taking over — the
   * previous person's data must not be on screen under the new person's name.
   */
  function addWebProfile(data, remember) {
    if (!data?.token) return;
    setToken(data.token, { remember, web: true });
    saveProfile({
      username: data?.web_login?.username,
      full_name: data.full_name,
      role: data.role,
      role_ref: data.active_role_ref,
      profile_key: data.profile_key,
      photo_ver: data.photo_ver,
      token: data.token,
      remember,
    });
    window.location.assign("/");
  }

  /**
   * Switch to a profile already in the wallet — no password, that is the point
   * of holding the token.
   *
   * The token is validated before the page commits to it. A stored token can be
   * dead (expired, or `token_version` bumped by a password reset or an admin's
   * "sign out everywhere"), and swapping to it blind would reload the app
   * straight into the login screen, having thrown away a working session on the
   * way. So: swap, ask /session, and put the old token back if it refuses —
   * the caller then asks for that profile's password. `isDeadWebSession` in
   * utils/api.js deliberately skips /api/auth/web/*, so the 401 handled here
   * does not also trigger the global "dead session" reload.
   */
  async function switchWebProfile(username) {
    const entry = findProfile(username);
    if (!entry) return { ok: false, expired: true };

    const prevToken = getToken();
    const prevRemember = isRemembered();
    setToken(entry.token, { remember: entry.remember, web: true });
    try {
      await api.get("/api/auth/web/session");
    } catch {
      if (prevToken) setToken(prevToken, { remember: prevRemember, web: true });
      return { ok: false, expired: true };
    }
    window.location.assign("/");
    return { ok: true };
  }

  /** Swap in a token the server re-issued (e.g. after a password change) so the
   *  tab the person is typing in does not log itself out. */
  function replaceWebToken(token) {
    if (!token) return;
    // `tab` rides along: without it the re-issued token lands in localStorage
    // and an impersonated tab takes over every other tab on the machine.
    setToken(token, { remember: isRemembered(), web: true, tab: isTabSession() });
    // The wallet row for this profile still holds the token the password change
    // just revoked; leaving it there would demand the new password the moment
    // the person switched away and back.
    rememberActive(auth);
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
      webProfiles, addWebProfile, switchWebProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
