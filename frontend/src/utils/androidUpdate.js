/**
 * The APK's own update, as the page sees it (CLAUDE.md «The Android app» →
 * «The update button»). The app's half is android/…/AppUpdates.java: it asks
 * the server which APK is published (GET /api/android/latest), downloads a
 * newer one, checks it against the published SHA-256 and hands it to
 * Android's installer — by itself while the app is on screen, and, from
 * 1.7.0, when the «Yangilanishni tekshirish» row above «Versiya» asks
 * (components/layout/AppUpdateButton.jsx).
 *
 * Two kinds of app, one window:
 *   - 1.7.0+ announces `window.__safiaApp.update` (app-bridge.js). The page
 *     sends it requests (`apkUpdate(op)`) and keeps its last word — every
 *     `safia-app-update` event carries the whole state — in ONE store
 *     (`useApkUpdate`), so the row's badge and the window read the same thing
 *     and a page that loads mid-download hears where it is;
 *   - an older APK (1.4.0–1.6.x) cannot be driven. The page asks the server
 *     itself (`checkLatest`) and compares with the version the app names in
 *     its user agent; a newer one is downloaded the way every file of ours is
 *     in that app — handed to the phone's browser.
 */
import { useSyncExternalStore } from "react";
import { inAndroidApp, isTabSession } from "./session";

/** The shareable link (routers/android.py): redirects to the published APK. */
export const APK_DOWNLOAD_URL = "/api/android/download";

/**
 * The row belongs to the app's own screen: never a browser or Telegram, and
 * never the admin's «open as this profile» screen, which has no updater.
 */
export function apkUpdateShown() {
  return inAndroidApp() && !isTabSession();
}

/** 1.7.0+: the app's updater answers the page. */
export function apkUpdateNative() {
  return inAndroidApp() && !!window.__safiaApp?.update;
}

/** The version the app names in its user agent (MainActivity: "SafiaIMS-Android/<versionName>"). */
export function apkVersionName() {
  const m = /SafiaIMS-Android\/(\d[\w.-]*)/.exec(navigator.userAgent || "");
  return m ? m[1] : "";
}

/** -1 · 0 · 1 by dotted numbers ("1.10.0" > "1.9.2"); null when either cannot be read. */
export function compareVersions(a, b) {
  const parse = (v) => {
    const parts = String(v || "").split(".");
    if (!parts[0] || parts.some((p) => !/^\d+/.test(p))) return null;
    return parts.map((p) => parseInt(p, 10));
  };
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** Whole percent of a download, 0–100. */
export function apkPercent(s) {
  const total = Number(s?.total) || 0;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor(((Number(s?.got) || 0) * 100) / total)));
}

function post(op) {
  let lang = "uz";
  try {
    lang = localStorage.getItem("lang") || "uz";
  } catch { /* private storage: the app's own words fall back to Uzbek */ }
  try {
    window.SafiaAndroid.postMessage(JSON.stringify({ type: "app-update", op, lang }));
  } catch { /* no bridge on this web view */ }
}

/**
 * Ask the app: "status" (its last word, no network) · "check" (ask the server
 * now) · "start" (download if need be, then the installer) · "cancel" (stop
 * the download) · "watch" / "unwatch" (the window is open: the app keeps its
 * own update dialog out of the way meanwhile). Every request is answered.
 */
export function apkUpdate(op) {
  if (apkUpdateNative()) post(op);
}

// ─── the store ───────────────────────────────────────────────────────────────

let state = null;
let listening = false;
const listeners = new Set();

function listen() {
  if (listening || !apkUpdateNative()) return;
  listening = true;
  window.addEventListener("safia-app-update", (e) => {
    state = e.detail && typeof e.detail === "object" ? e.detail : null;
    listeners.forEach((fn) => fn());
  });
  // A page that loads mid-download (a reload, a new build) hears where it is.
  post("status");
}

function subscribe(fn) {
  listen();
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The app's last word — {phase, error, running, latest, got, total,
 * downloaded, installerOpened, canInstall, checkedAt} (AppUpdates.state()) —
 * or null until it answers, and always null on an APK without the bridge.
 */
export function useApkUpdate() {
  return useSyncExternalStore(subscribe, () => state, () => null);
}

// ─── an APK without the bridge (1.4.0–1.6.x) ─────────────────────────────────

/**
 * The published release — {version_code, version_name, size, sha256,
 * published_at, url} — or null when nothing is published. A plain fetch,
 * not the api client: this is a public endpoint, and the client's restart
 * wait would hold a "checking…" on screen for minutes during a deploy.
 */
export async function checkLatest() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  try {
    const res = await fetch(`/api/android/latest?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "omit",
      signal: ctl.signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
