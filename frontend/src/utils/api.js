import axios from "axios";
import { examAttemptId, rewriteExamUrl, noteExamMutation, examWriteAllowed } from "./examMode";
import { clearToken, getToken, isWebSession } from "./session";
import { noteServerHeaders } from "./compat";

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

/**
 * THE auth headers every request to this backend carries.
 *
 * Exported because the interceptor below is not the only sender: a watch-progress
 * flush fired as the page unloads has to go through `fetch(keepalive)` — axios
 * cannot outlive the document, and `navigator.sendBeacon` cannot set headers at
 * all — and a second spelling of "how do we prove who this is" is how one of the
 * two senders quietly starts 401-ing.
 */
export function authHeaders() {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isWebSession()) {
    headers["X-Telegram-Init-Data"] = window.Telegram?.WebApp?.initData || "__dev__";
  }
  if (sessionStorage.getItem("ghost_mode") === "1") headers["X-Ghost-Mode"] = "1";
  // Exam mode (utils/examMode.js): the attempt the sandbox answers for.
  const examId = examAttemptId();
  if (examId) headers["X-Exam-Attempt"] = String(examId);
  return headers;
}

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
  // Exam mode («Imtihon», utils/examMode.js): while a leader sits the exam,
  // every sandboxed resource is rewritten onto /api/exam/sandbox/… and the
  // attempt rides as a header, so the pages read and write test rows only.
  const examId = examAttemptId();
  if (examId) {
    config.url = rewriteExamUrl(config.url);
    config.headers["X-Exam-Attempt"] = String(examId);
    // The write-guard: a non-GET call that is still a REAL `/api/` or
    // `/admin/` endpoint after the rewrite above (the sandbox has no prefix
    // for it, and it is not one of the few real doors an exam sitting cannot
    // avoid — signing in, the heartbeat, a crash report…) is refused here,
    // before it ever reaches the network. BOTH prefixes, because the backend
    // mounts real mutating endpoints under either — the Leaders page's
    // Refresh button posts to `/admin/refresh-sheet/leaders`, which a
    // `/api/`-only guard let straight through to the real sheet sync in a
    // browser test. The server carries the same rule as a backstop
    // (ExamWriteGuardMiddleware) for whatever gets past this one.
    const method = (config.method || "get").toLowerCase();
    const url = config.url;
    if (method !== "get" && method !== "head" && typeof url === "string" &&
        (url.startsWith("/api/") || url.startsWith("/admin/")) &&
        !examWriteAllowed(url)) {
      return Promise.reject(examBlockError(config));
    }
  }
  return config;
});

function examBlockError(config) {
  const lang = (() => { try { return localStorage.getItem("lang"); } catch { return null; } })() || "uz";
  const msg = {
    uz: "Imtihon paytida haqiqiy ma'lumot o'zgartirilmaydi",
    uz_cyrl: "Имтиҳон пайтида ҳақиқий маълумот ўзгартирилмайди",
    ru: "Во время экзамена реальные данные не меняются",
    en: "Real data cannot change during the exam",
  }[lang] || "Imtihon paytida haqiqiy ma'lumot o'zgartirilmaydi";
  const err = new Error(msg);
  err.config = config;
  err.isExamBlock = true;
  err.response = { status: 403, data: { detail: msg } };
  return err;
}

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

// Every response — success or failure — carries the running build and the
// oldest bundle it still serves (X-App-Version / X-App-Min-Client). Read here,
// at the one place all of them pass through, so a stale tab learns it is stale
// on its first request instead of on its first unexplained 422. It only ever
// sets a flag; see utils/compat.js.
api.interceptors.response.use(
  (response) => {
    noteServerHeaders(response.headers);
    // A sandbox write the exam may be waiting on — the strip re-checks the task.
    const m = String(response.config?.method || "get").toLowerCase();
    if (m !== "get" && response.config?.headers?.["X-Exam-Attempt"]
        && String(response.config?.url || "").startsWith("/api/exam/sandbox/")) noteExamMutation(response.config);
    return isWebShieldResponse(response)
      ? retryAfterWebShield(response.config, response)
      : response;
  },
  (error) => {
    noteServerHeaders(error.response?.headers);
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
