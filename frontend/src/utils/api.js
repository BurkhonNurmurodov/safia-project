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
      } else if (value !== null && value !== undefined && value !== "") {
        // An empty string is a CLEARED filter, not a value. Sending `?shift=`
        // makes FastAPI answer 422 ("Input should be a valid integer") on every
        // typed Optional query param — a validation error nobody asked for, on
        // a request that meant "no narrowing". Dropped exactly like
        // null/undefined: a missing param and an empty one already read the
        // same on every endpoint here.
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

// FastAPI answers a failed validation with `detail` as a LIST of Pydantic error
// objects ({type, loc, msg, input}) — not the string every other error carries.
// Roughly eighty call sites do `e?.response?.data?.detail || t("failed")` and
// put the result straight into JSX, so ONE 422 renders an object as a React
// child: "Minified React error #31", and the whole app drops into the
// ErrorBoundary's "Nimadir xato ketdi" screen instead of showing why the save
// failed. Flattening it HERE, at the one place every response passes through,
// makes all of those call sites correct without touching any of them — and a
// caller that genuinely wants the structure still has `data.detail_raw`.
const fieldOf = (loc) =>
  (Array.isArray(loc) ? loc : [])
    // "body"/"query"/"path" name where the value came from and array indices
    // name a position — neither is a field the operator can act on.
    .filter((p) => !["body", "query", "path", "header", "cookie"].includes(p) && typeof p !== "number")
    .join(".");

export function detailToText(detail) {
  if (detail == null || typeof detail === "string") return detail;
  const items = Array.isArray(detail) ? detail : [detail];
  const parts = items
    .map((item) => {
      if (item == null) return "";
      if (typeof item !== "object") return String(item);
      const msg = item.msg || item.message || item.detail;
      if (!msg || typeof msg !== "string") {
        try { return JSON.stringify(item); } catch { return String(item); }
      }
      const field = fieldOf(item.loc);
      return field ? `${field}: ${msg}` : msg;
    })
    .filter(Boolean);
  if (parts.length) return parts.join("; ");
  try { return JSON.stringify(detail); } catch { return String(detail); }
}

function normalizeDetail(response) {
  const data = response?.data;
  if (!data || typeof data !== "object") return;
  if (data.detail == null || typeof data.detail === "string") return;
  data.detail_raw = data.detail;
  data.detail = detailToText(data.detail);
}

api.interceptors.response.use(
  (response) =>
    isWebShieldResponse(response)
      ? retryAfterWebShield(response.config, response)
      : response,
  (error) => {
    normalizeDetail(error.response);
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
