import { createContext, useContext, useEffect, useState } from "react";
import api from "../utils/api";

const AuthContext = createContext(null);

const COUNTDOWN_SEC = 3;

export function AuthProvider({ children }) {
  const [auth, setAuth]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [botUsername, setBotUsername] = useState("");
  const [countdown, setCountdown]     = useState(null); // null = not logging out

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      // /login and the compact /broadcast picker must not expand to full height.
      const path = window.location.pathname;
      if (!path.startsWith("/login") && !path.startsWith("/broadcast-receivers")) tg.expand();
    }

    const initData = tg?.initData || "";

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
        if (data.token) localStorage.setItem("tg_token", data.token);
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
      localStorage.removeItem("tg_token");
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
    try {
      await api.delete("/api/auth/me");
    } catch (_) {}
    setCountdown(COUNTDOWN_SEC);
  }

  // Swap the JWT for another approved role; a full reload re-fetches
  // everything under the new role's scope.
  async function switchRole(roleRef) {
    const r = await api.post("/api/auth/switch-role", { role_ref: roleRef });
    if (r.data?.token) localStorage.setItem("tg_token", r.data.token);
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
    if (r.data?.token) localStorage.setItem("tg_token", r.data.token);
    window.location.reload();
  }

  return (
    <AuthContext.Provider value={{ auth, loading, logout, switchRole, leaveRole, botUsername, countdown }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
