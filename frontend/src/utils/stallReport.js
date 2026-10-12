// «The app is stuck on its logo» — THE reporter for a wait nobody else sees.
//
// The full-screen loader (components/ui/PageLoader.jsx) stands in front of the
// app while the session is checked, while page access is resolved and while a
// page's code arrives. The boot watchdog in index.html stops watching the
// moment React paints, and that loader IS React — so a loader that hung on a
// good connection was reported by nobody, and reached us as a screenshot.
//
// Now the loader times itself (visible time only: a phone in a pocket is not a
// stall) and, past REPORT_MS, posts what it was waiting for to the one
// client-failure door, `/api/crash-report` with kind "stall":
//   • which gate (`where`: auth · access · caps · page) and for how long;
//   • the requests still pending and the ones that finished meanwhile, each
//     with the time the TAB waited and the time the SERVER says it spent
//     (utils/requestLog.js) — the difference is the network, or a request
//     queued behind a frozen server (`stall`) — and the BROWSER's own phases
//     (`rt`: held before sending · connecting · first byte · download);
//   • for the «page» gate, the page chunks fetched in the window (`chunks`),
//     which is what that gate actually waits on and what axios never sees;
//   • how long the app had been in the BACKGROUND before the wait and how long
//     it had been back (`vis`): the 12 Oct 2026 report — every request of the
//     window stuck 10–13 s with 12–16 ms of server time each — is what a
//     connection that died while the app was away looks like, and nothing in
//     the report could say the app had been away;
//   • whether the server was restarting, the connection, the platform.
// The backend (services/stall_report.py) puts its OWN record of that moment
// beside it (services/perf_watch.py), so one message says which side it was.
//
// When: as the wait ends (if it lasted REPORT_MS), or while it is still going
// at HARD_MS, or — with a keepalive fetch, since the page may be going away —
// when the app is hidden after REPORT_MS (the user gave up and closed it). One
// report per wait, at most MAX_PER_PAGE per page load, and nothing here throws.

import { useEffect, useState } from "react";
import api, { authHeaders } from "./api";
import { requestsSince, scriptsSince } from "./requestLog";
import { isServerRestarting, onServerRestarting } from "./serverRestart";
import { APP_VERSION } from "./version";
import { inAndroidApp, inTelegram } from "./session";

export const HINT_MS = 6000;      // the loader says what it is waiting for
export const RELOAD_MS = 20000;   // … and offers a way out
const REPORT_MS = 6000;           // a wait this long is reported when it ends
const HARD_MS = 25000;            // … or while it is still going on
const MAX_PER_PAGE = 2;
let sentThisPage = 0;

const now = () => performance.now();

// ---- when the app is AWAY ---------------------------------------------------
// `document.hidden`, plus Telegram's own `deactivated` / `activated`: a mini app
// minimised on Android is not always a visibilitychange (the camera page learned
// that). Kept from module load, so a wait can say how long the app had been in
// the background before it began and how long it had been back — and the
// loader's visible-time clock stops for both kinds of away.
const away = { hiddenAt: null, spans: [], listeners: new Set(), tg: false };
let tgInactive = false;
const isAway = () => away.hiddenAt != null;

function recompute(src) {
  const hidden = document.hidden || tgInactive;
  const n = now();
  if (hidden) {
    if (away.hiddenAt == null) away.hiddenAt = n;
  } else if (away.hiddenAt != null) {
    away.spans.push({ from: away.hiddenAt, to: n });
    if (away.spans.length > 20) away.spans.shift();
    away.hiddenAt = null;
  }
  if (src === "tg") away.tg = true;
  away.listeners.forEach((fn) => { try { fn(); } catch { /* a listener's own failure */ } });
}

try {
  if (document.hidden) away.hiddenAt = now();
  document.addEventListener("visibilitychange", () => recompute("doc"));
  const tg = window.Telegram?.WebApp;
  if (tg?.isActive === false) { tgInactive = true; away.hiddenAt = now(); }
  tg?.onEvent?.("deactivated", () => { tgInactive = true; recompute("tg"); });
  tg?.onEvent?.("activated", () => { tgInactive = false; recompute("tg"); });
} catch {
  /* no document, or a dead Telegram bridge — the clock simply runs */
}

/**
 * The most recent spell in the background that ENDED before `t0` (within ten
 * minutes): how long it lasted and how long the app had been back when the wait
 * began. null when the app had not been away.
 */
export function awayBefore(t0) {
  for (let i = away.spans.length - 1; i >= 0; i--) {
    const sp = away.spans[i];
    if (sp.to > t0) continue;
    if (t0 - sp.to > 600_000) return null;
    return { hidden_ms: Math.round(sp.to - sp.from), back_ms: Math.round(t0 - sp.to), tg: away.tg || undefined };
  }
  return null;
}

function platform() {
  try {
    if (inTelegram()) return `telegram/${window.Telegram?.WebApp?.platform || "?"}`;
    if (inAndroidApp()) return "android-app";
    if (window.matchMedia?.("(display-mode: standalone)")?.matches) return "installed";
    return "browser";
  } catch {
    return "?";
  }
}

function connection() {
  try {
    const c = navigator.connection;
    if (!c) return null;
    return { type: c.effectiveType, rtt: c.rtt, down: c.downlink, save: c.saveData || undefined };
  } catch {
    return null;
  }
}

function send(stall, keepalive) {
  if (sentThisPage >= MAX_PER_PAGE) return Promise.resolve(false);
  sentThisPage += 1;
  const body = {
    kind: "stall",
    message: `${stall.where} ${Math.round(stall.waited_ms / 1000)}s`.slice(0, 500),
    url: String(window.location.pathname).slice(0, 500),
    version: APP_VERSION,
    ua: String(navigator.userAgent || "").slice(0, 500),
    stall,
  };
  try {
    if (keepalive && typeof fetch === "function") {
      // The page may be on its way out: axios cannot outlive the document.
      return fetch(`${import.meta.env.VITE_API_URL || ""}/api/crash-report`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      }).then((r) => r.ok, () => false);
    }
    return api.post("/api/crash-report", body).then((r) => !!r?.data?.ok, () => false);
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * Watches one full-screen wait. Returns `phase` (0 quiet · 1 say we are
 * waiting · 2 offer a reload) and `reported` (the wait was reported while it
 * was still on screen).
 */
export function useStallWatch(where) {
  const [phase, setPhase] = useState(0);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    const t0 = now();
    let hiddenMs = 0;
    let hiddenAt = isAway() ? t0 : null;
    let restarted = isServerRestarting();
    let sent = false;
    let alive = true;
    const offRestart = onServerRestarting((on) => { if (on) restarted = true; });

    const visibleMs = () => {
      const n = now();
      return n - t0 - hiddenMs - (hiddenAt != null ? n - hiddenAt : 0);
    };
    const build = (outcome) => {
      const n = now();
      return {
        where,
        outcome, // "resolved" · "waiting" · "left"
        waited_ms: Math.round(visibleMs()),
        total_ms: Math.round(n - t0),
        since_load_ms: Math.round(t0),
        vis: awayBefore(t0),
        restarting: restarted,
        online: navigator.onLine,
        conn: connection(),
        platform: platform(),
        ...requestsSince(t0),
        ...(where === "page" ? { chunks: scriptsSince(t0) } : {}),
      };
    };
    const report = (outcome, keepalive) => {
      if (sent) return;
      sent = true;
      send(build(outcome), keepalive).then((ok) => {
        if (ok && alive && outcome === "waiting") setReported(true);
      });
    };

    const onVis = () => {
      const n = now();
      if (isAway()) {
        if (hiddenAt == null) hiddenAt = n;
        // Closed or switched away while still waiting — likely gave up. The
        // keepalive fetch is the only send that survives the page going away.
        if (visibleMs() >= REPORT_MS) report("left", true);
      } else if (hiddenAt != null) {
        hiddenMs += n - hiddenAt;
        hiddenAt = null;
      }
    };
    away.listeners.add(onVis);

    const iv = setInterval(() => {
      const v = visibleMs();
      setPhase(v >= RELOAD_MS ? 2 : v >= HINT_MS ? 1 : 0);
      if (v >= HARD_MS) report("waiting", false);
    }, 1000);

    return () => {
      alive = false;
      clearInterval(iv);
      away.listeners.delete(onVis);
      offRestart();
      if (visibleMs() >= REPORT_MS) report("resolved", false);
    };
  }, [where]);

  return { phase, reported };
}
