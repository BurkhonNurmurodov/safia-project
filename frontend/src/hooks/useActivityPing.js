import { useEffect } from "react";
import api from "../utils/api";
import { getToken } from "../utils/session";
import { screenOf } from "../utils/navLayout";

// Client heartbeat that powers the Users-Activity dashboard. While the app is
// open and the tab/webview is visible it POSTs /api/activity/ping every
// PING_INTERVAL; the backend folds each ping into today's usage row and only
// counts the gap between close-together pings as "time in app" (see
// routers/activity.py). Firing on visibility-change means backgrounded time is
// naturally excluded.
//
// Each ping also carries WHICH SCREENS the time went to (2026-11-15, the org
// chart's «Ilovalar» heat): the seconds each screen was on screen and visible
// since the last ping, and how many times it was opened — `screens`, read by
// models.ScreenUsage. A screen is its launcher path (`screenOf`).
const PING_INTERVAL = 60_000;

// Module-level guard so route changes (each mounts a fresh <Layout/>) don't
// re-ping on every navigation — at most one ping per interval regardless of how
// many times the hook mounts.
let lastPing = 0;

// The tally since the last ping that went out: path → { ms, n }. `cur` is the
// screen on show and since when it has been counting (null while hidden).
const tally = new Map();
let cur = null;      // the screen on show (null: a page no launcher reaches)
let since = null;    // when it started counting; null while hidden

const visible = () => document.visibilityState !== "hidden";
function bank(now = Date.now()) {
  if (cur && since != null) {
    const t = tally.get(cur) ?? { ms: 0, n: 0 };
    t.ms += Math.max(0, now - since);
    tally.set(cur, t);
  }
  since = visible() ? now : null;
}
function enter(screen) {
  if (screen === cur) return;
  bank();
  cur = screen;
  if (screen) {
    const t = tally.get(screen) ?? { ms: 0, n: 0 };
    t.n += 1;
    tally.set(screen, t);
  }
}

function sendPing() {
  // getToken(), not localStorage: an un-remembered browser session keeps its
  // token in sessionStorage, and reading only localStorage would read that
  // signed-in person as signed out and quietly stop counting them.
  if (!getToken()) return;                             // only when signed in
  if (!visible()) return;                              // don't count idle tabs
  const now = Date.now();
  if (now - lastPing < PING_INTERVAL - 1_000) return;  // throttle across mounts
  lastPing = now;
  bank(now);
  const screens = [...tally].map(([s, t]) => ({ s, sec: Math.round(t.ms / 1000), n: t.n }))
    .filter((x) => x.sec > 0 || x.n > 0);
  tally.clear();
  api.post("/api/activity/ping", screens.length ? { screens } : undefined)
    .catch(() => {});                                  // best-effort, never blocks UI
}

export default function useActivityPing(pathname) {
  // The screen on show: a route change banks the time of the one before.
  useEffect(() => { enter(screenOf(pathname)); }, [pathname]);

  useEffect(() => {
    sendPing(); // record arrival on this page

    const id = setInterval(sendPing, PING_INTERVAL);
    const onVisible = () => {
      bank();   // hidden: stop counting; visible again: start
      if (visible()) sendPing();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
