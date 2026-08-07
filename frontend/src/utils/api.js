import axios from "axios";
import { clearToken, getToken, isWebSession } from "./session";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  headers: {
    "ngrok-skip-browser-warning": "true",
  },
  paramsSerializer: (params) => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        value.forEach((v) => sp.append(key, v));
      } else if (value !== null && value !== undefined) {
        sp.append(key, value);
      }
    }
    return sp.toString();
  },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Origin proof on EVERY request: the backend re-verifies this initData hash
  // (not just at login) so no endpoint can be reached from outside a genuine
  // Telegram WebView. initData is a static per-session string set by
  // telegram-web-app.js before this bundle runs; read it fresh each call.
  //
  // A browser session has no initData and does not pretend to: the Bearer token
  // above carries the `web` claim, which is the ONLY other proof the backend
  // accepts (see backend/app/security.py). Sending "__dev__" here instead would
  // be a lie the backend rejects in production anyway.
  if (!isWebSession()) {
    // Outside Telegram we send "__dev__", which the backend accepts only when
    // DEV_AUTH is on (and rejects in production, same as the login endpoint).
    config.headers["X-Telegram-Init-Data"] = window.Telegram?.WebApp?.initData || "__dev__";
  }
  // Ghost Mode (admin header toggle): suppress change-notifications server-side.
  // sessionStorage (not localStorage) so closing the app always clears it.
  if (sessionStorage.getItem("ghost_mode") === "1") config.headers["X-Ghost-Mode"] = "1";
  return config;
});

// Imunify360 WebShield (ahost's anti-bot layer) can intercept /api calls
// mid-session and answer with its challenge page (HTML, or a bare 415 from
// openresty) instead of JSON. An XHR can't solve the JS challenge, so:
// retry twice with backoff (covers transient graylisting), then reload the
// page once per session so the document-level challenge can re-complete.
const isWebShieldResponse = (resp) => {
  if (!resp || !String(resp.config?.url || "").startsWith("/api")) return false;
  if (resp.status === 415) return true;
  return String(resp.headers?.["content-type"] || "").includes("text/html");
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryAfterWebShield(config, response) {
  const attempt = (config._wsAttempt || 0) + 1;
  if (attempt <= 2) {
    await sleep(1500 * attempt);
    return api({ ...config, _wsAttempt: attempt });
  }
  if (!sessionStorage.getItem("ws_reloaded")) {
    sessionStorage.setItem("ws_reloaded", "1");
    window.location.reload();
    return new Promise(() => {}); // page is going away — never settle
  }
  const err = new Error("Hosting anti-bot challenge blocked the API request");
  err.response = response;
  err.config = config;
  throw err;
}

// A browser session that has been revoked, disabled or has simply expired keeps
// answering 401 to everything, which renders as a page full of failed panels
// with no explanation. Drop the dead token and reload once — the app boots
// straight into the login screen, which is the honest state.
// Scoped to web sessions on purpose: inside Telegram a 401 is recoverable
// (fresh initData at the next launch) and reloading would fight that.
function isDeadWebSession(response, config) {
  if (!isWebSession() || response?.status !== 401) return false;
  return !String(config?.url || "").startsWith("/api/auth/web/");
}

api.interceptors.response.use(
  (response) =>
    isWebShieldResponse(response)
      ? retryAfterWebShield(response.config, response)
      : response,
  (error) => {
    if (isWebShieldResponse(error.response)) {
      return retryAfterWebShield(error.config, error.response);
    }
    if (isDeadWebSession(error.response, error.config)) {
      clearToken();
      window.location.reload();
      return new Promise(() => {}); // page is going away — never settle
    }
    return Promise.reject(error);
  }
);

export default api;
