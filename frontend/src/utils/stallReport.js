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
//     queued behind a frozen server (`stall`);
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
import { requestsSince } from "./requestLog";
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
    let hiddenAt = document.hidden ? t0 : null;
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
        restarting: restarted,
        online: navigator.onLine,
        conn: connection(),
        platform: platform(),
        ...requestsSince(t0),
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
      if (document.hidden) {
        if (hiddenAt == null) hiddenAt = n;
        // Closed or switched away while still waiting — likely gave up. The
        // keepalive fetch is the only send that survives the page going away.
        if (visibleMs() >= REPORT_MS) report("left", true);
      } else if (hiddenAt != null) {
        hiddenMs += n - hiddenAt;
        hiddenAt = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);

    const iv = setInterval(() => {
      const v = visibleMs();
      setPhase(v >= RELOAD_MS ? 2 : v >= HINT_MS ? 1 : 0);
      if (v >= HARD_MS) report("waiting", false);
    }, 1000);

    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      offRestart();
      if (visibleMs() >= REPORT_MS) report("resolved", false);
    };
  }, [where]);

  return { phase, reported };
}
