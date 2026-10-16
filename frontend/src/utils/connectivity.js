/**
 * Can the app reach the server right now? THE definition — read by the axios
 * interceptors (utils/api.js), the query client's retry rule (App.jsx), the
 * offline boot (context/AuthContext.jsx) and the band under the header
 * (components/layout/OfflineBand.jsx).
 *
 * The app keeps every page's last answer on the device (utils/offlineCache.js)
 * and goes on showing it when there is no connection — the way Instagram shows
 * the feed it loaded last. For that the app has to KNOW it is offline, and
 * `navigator.onLine` cannot tell it: it is true on a Wi-Fi with no internet
 * behind it, which on a factory floor is the common case. So the signal is the
 * requests themselves:
 *
 *   • a request that fails with NO answer (axios ERR_NETWORK, a fetch that
 *     threw) marks the app DOWN — the `offline` DOM event does too;
 *   • ANY answer from the server, whatever its status, marks it UP again —
 *     a 401 or a 500 still proves the wire works;
 *   • while down, nothing may be asking (every query is already waiting), so
 *     `/health` is probed every PROBE_MS, and at once on `online`, on focus
 *     and on the page coming back to the screen. /health is a server path for
 *     the Android app's bundle and for the service worker alike, so the probe
 *     always reaches the network and never a local copy.
 *
 * `reason` tells the two kinds of down apart: "network" (no answer at all) and
 * "server" (the boot got a 5xx — nginx's restart page, Cloudflare's 52x). The
 * second is lifted only by a real answer (< 500), or the probe's 503 from
 * nginx's own fallback would read as the server being back.
 *
 * Nothing here imports utils/api.js (the probe is a bare fetch), so api.js can
 * import this.
 */
import axios from "axios";
import { useSyncExternalStore } from "react";

const PROBE_MS = 10_000;
const PROBE_TIMEOUT_MS = 8_000;
/** How often a query that failed for want of a connection tries again while
 *  the app is down (the query client's retryDelay, App.jsx). */
export const OFFLINE_RETRY_MS = 5_000;

const BASE = import.meta.env.VITE_API_URL || "";

let down = typeof navigator !== "undefined" && navigator.onLine === false;
let reason = down ? "network" : null;
let since = down ? Date.now() : 0;
let restoredAt = 0;
let lastDownMs = 0;
let snapshot = { down, reason, since, restoredAt, lastDownMs };
const subs = new Set();
let probeTimer = null;
let probing = null;

function emit() {
  snapshot = { down, reason, since, restoredAt, lastDownMs };
  subs.forEach((fn) => { try { fn(snapshot); } catch { /* a listener must not break the switch */ } });
}

export function isDown() { return down; }
export function connectivity() { return snapshot; }
export function subscribeConnectivity(fn) { subs.add(fn); return () => subs.delete(fn); }

/** A failure that never reached the server: the connection, not the request. */
export function isNetworkError(err) {
  if (!err || err.response) return false;
  if (axios.isCancel(err) || err.code === "ERR_CANCELED" || err.name === "AbortError" || err.name === "CanceledError") return false;
  if (err.code === "ERR_NETWORK" || err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") return true;
  if (err.message === "Network Error") return true;
  // fetch(): "Failed to fetch" (Chrome), "Load failed" (Safari),
  // "NetworkError when attempting to fetch resource." (Firefox).
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message || "")) return true;
  return false;
}

export function markDown(why = "network") {
  if (down) {
    // A worse diagnosis replaces a milder one, never the other way round.
    if (why === "server" && reason !== "server") { reason = why; emit(); }
    return;
  }
  down = true;
  reason = why;
  since = Date.now();
  emit();
  startProbing();
}

export function markUp() {
  if (!down) return;
  lastDownMs = Date.now() - since;
  down = false;
  reason = null;
  restoredAt = Date.now();
  stopProbing();
  emit();
}

/** The server answered — with any status. */
export function noteAnswer(status) {
  if (!down) return;
  if (reason === "server" && !(Number(status) < 500)) return;
  markUp();
}

export function noteNetworkFailure() { markDown("network"); }

function stopProbing() {
  if (probeTimer) clearInterval(probeTimer);
  probeTimer = null;
}

function startProbing() {
  stopProbing();
  probeTimer = setInterval(() => { probe(); }, PROBE_MS);
}

/** One probe of /health. Resolves true when the server answered. */
export function probe() {
  if (!down) return Promise.resolve(true);
  if (probing) return probing;
  // The browser itself says there is no network: the `online` event will come,
  // and a request now can only fail at once.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve(false);
  probing = (async () => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS);
    try {
      const r = await fetch(`${BASE}/health?t=${Date.now()}`, { cache: "no-store", signal: ctl.signal, credentials: "omit" });
      noteAnswer(r.status);
      return !down;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
      probing = null;
    }
  })();
  return probing;
}

export const probeNow = probe;

/** The live state, for components. */
export function useConnectivity() {
  return useSyncExternalStore(subscribeConnectivity, connectivity, connectivity);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { probe(); });
  window.addEventListener("offline", () => markDown("network"));
  window.addEventListener("focus", () => { if (down) probe(); });
  document.addEventListener("visibilitychange", () => {
    if (down && document.visibilityState === "visible") probe();
  });
  if (down) startProbing();
}
