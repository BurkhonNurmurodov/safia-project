import axios from "axios";

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
  const token = localStorage.getItem("tg_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
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

api.interceptors.response.use(
  (response) =>
    isWebShieldResponse(response)
      ? retryAfterWebShield(response.config, response)
      : response,
  (error) =>
    isWebShieldResponse(error.response)
      ? retryAfterWebShield(error.config, error.response)
      : Promise.reject(error)
);

export default api;
