// «The server is restarting» — THE definition of how the app recognises a
// backend that is briefly down because a deploy is swapping it, and what it
// does instead of failing: wait, retry, and say so (ServerRestartNotice).
//
// What a restart looks like from here, by where the answer came from:
//   • nginx with no backend behind it — HTML 502/504, or (after the blue-green
//     setup) its own fallback: JSON 503 carrying `X-Safia-Restarting: 1`;
//   • Cloudflare with no origin — its HTML 520–523 pages.
// None of those ever reached the application, so a write is as safe to repeat
// as a read. 504 / 524 are TIMEOUTS: the request may have run, so only a read
// is repeated on them. The app's own 503s are JSON without the header and are
// real answers — never retried.
//
// Before this, an HTML 502 on /api was taken for the hosting anti-bot page and
// the tab RELOADED itself after 4.5 s — on every backend deploy, mid-shift.

const NOT_REACHED = new Set([502, 503, 520, 521, 522, 523]);
const TIMED_OUT = new Set([504, 524]);

export function restartKind(resp) {
  if (!resp) return null;
  const s = resp.status;
  const headers = resp.headers || {};
  const marked = String(headers["x-safia-restarting"] ?? headers.get?.("x-safia-restarting") ?? "") === "1";
  // Only an ERROR carries the meaning: the fallback also serves the page files
  // (200) with the same mark while no copy is up.
  if (marked && s >= 500) return "not_reached";
  const ctype = String(headers["content-type"] ?? headers.get?.("content-type") ?? "");
  const html = ctype.includes("text/html");
  if (NOT_REACHED.has(s) && (html || s >= 520)) return "not_reached";
  if (TIMED_OUT.has(s) && (html || s >= 520)) return "timed_out";
  return null;
}

// How long a request waits for the server to come back before it gives up and
// fails like any other error. A blue-green swap takes seconds; a plain restart
// re-runs the startup checks, which on production has taken over a minute.
export const RESTART_WAIT_MS = 180_000;
const STEPS = [1000, 2000, 3000, 5000];
export const restartDelay = (attempt) => STEPS[Math.min(attempt, STEPS.length - 1)];

// ---- the one shared flag, for the notice --------------------------------
let restarting = false;
const listeners = new Set();

export function setServerRestarting(on) {
  if (restarting === !!on) return;
  restarting = !!on;
  listeners.forEach((fn) => { try { fn(restarting); } catch { /* listener gone */ } });
}

export function isServerRestarting() {
  return restarting;
}

export function onServerRestarting(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
