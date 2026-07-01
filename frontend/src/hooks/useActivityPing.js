import { useEffect } from "react";
import api from "../utils/api";

// Client heartbeat that powers the Users-Activity dashboard. While the app is
// open and the tab/webview is visible it POSTs /api/activity/ping every
// PING_INTERVAL; the backend folds each ping into today's usage row and only
// counts the gap between close-together pings as "time in app" (see
// routers/activity.py). Firing on visibility-change means backgrounded time is
// naturally excluded.
const PING_INTERVAL = 60_000;

// Module-level guard so route changes (each mounts a fresh <Layout/>) don't
// re-ping on every navigation — at most one ping per interval regardless of how
// many times the hook mounts.
let lastPing = 0;

function sendPing() {
  if (!localStorage.getItem("tg_token")) return;      // only when signed in
  if (document.visibilityState === "hidden") return;   // don't count idle tabs
  const now = Date.now();
  if (now - lastPing < PING_INTERVAL - 1_000) return;  // throttle across mounts
  lastPing = now;
  api.post("/api/activity/ping").catch(() => {});      // best-effort, never blocks UI
}

export default function useActivityPing() {
  useEffect(() => {
    sendPing(); // record arrival on this page

    const id = setInterval(sendPing, PING_INTERVAL);
    const onVisible = () => { if (document.visibilityState === "visible") sendPing(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
