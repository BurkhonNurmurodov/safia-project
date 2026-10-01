/**
 * Phone notifications in the Android app — the page's half (CLAUDE.md «Phone
 * notifications»). The app's half is android/…/Push.java: about every 15
 * minutes, in the background, it asks the server (GET /api/push/poll) with the
 * session the app holds and shows what comes back as Android notifications.
 *
 * The page tells it three things: who is signed in (`registerPush` — the token
 * it should ask with, re-sent at every boot and after every renewal), how far
 * the person has already looked while the app was open (`pushCursor`, so
 * nothing they saw on screen buzzes later), and when the bell was opened
 * (`pushSeen`, which takes the phone's notifications down). It asks for the
 * app's state for the settings dialog (`usePushStatus`).
 *
 * Everything here is a no-op outside an app that can do it: the 1.5.0+ APK's
 * app-bridge.js announces it as `window.__safiaApp.push`. Older APKs and every
 * browser see nothing.
 */
import { useEffect, useState } from "react";
import { getToken, inAndroidApp, isTabSession, isWebSession } from "./session";

export function pushSupported() {
  return inAndroidApp() && !!window.__safiaApp?.push;
}

function post(message) {
  try {
    message.lang = localStorage.getItem("lang") || "uz";
  } catch {
    message.lang = "uz";
  }
  try {
    window.SafiaAndroid.postMessage(JSON.stringify(message));
  } catch { /* no bridge: nothing to tell */ }
}

/** The app's own screen only — never the «open as this profile» screen. */
function ownSession(auth) {
  return isWebSession() && !isTabSession() && !auth?.impersonated;
}

export function registerPush(auth) {
  if (!pushSupported() || !ownSession(auth)) return;
  const token = getToken();
  if (!token) return;
  post({
    type: "push-register",
    token,
    profile: auth?.profile_key || "",
    name: auth?.full_name || "",
  });
}

/** Signed out with nobody left on the phone: stop asking, take everything down. */
export function clearPush() {
  if (pushSupported()) post({ type: "push-clear" });
}

/** The newest notification the bell knows while the app is on screen. */
export function pushCursor(latest) {
  const n = Number(latest);
  if (!pushSupported() || !(n > 0) || document.visibilityState !== "visible") return;
  post({ type: "push-cursor", latest: n });
}

export function pushSeen() {
  if (pushSupported()) post({ type: "push-seen" });
}

/** Ask the phone now for a row just written (the settings dialog's test). */
export function pushTest(id) {
  if (pushSupported()) post({ type: "push-test", id: Number(id) || 0 });
}

/** Android's own prompt the first times, its notification settings after. */
export function pushEnable() {
  if (pushSupported()) post({ type: "push-enable" });
}

/**
 * The app's state, live: {allowed, registered, lastPoll, lastError} — null
 * until the app answers. The app answers on request and whenever it changes
 * (the permission prompt, a poll), and again each time the page returns to the
 * screen, which is where somebody coming back from Android settings lands.
 */
export function usePushStatus(enabled = true) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!enabled || !pushSupported()) return undefined;
    const onStatus = (e) => setStatus(e.detail || null);
    const ask = () => {
      if (document.visibilityState === "visible") post({ type: "push-status" });
    };
    window.addEventListener("safia-push", onStatus);
    document.addEventListener("visibilitychange", ask);
    ask();
    return () => {
      window.removeEventListener("safia-push", onStatus);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [enabled]);
  return status;
}
