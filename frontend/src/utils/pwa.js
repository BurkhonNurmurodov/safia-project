/**
 * The browser door as an installable app (PWA).
 *
 * Two things live here, both browser-only: the install prompt and the service
 * worker. Chrome and Edge fire `beforeinstallprompt` once the manifest and the
 * worker satisfy them — usually before React has mounted — so the event is
 * caught at boot and HELD for the «Ilovani o'rnatish» row in the header's
 * profile menu (hooks/usePwaInstall.js), which is the one surface that shows
 * it. Calling preventDefault keeps the browser's own banner quiet on Android;
 * the desktop address-bar install icon is independent and still appears.
 *
 * NEVER inside Telegram. The mini-app is the primary device and its boot
 * overlay, stale-chunk reload and update prompt were all tuned to a tab with
 * no cache layer underneath it; iOS's WKWebView has no service worker anyway.
 * `bootPwa` still installs the two listeners there — they can only ever go
 * unfired — and registers nothing. Lifting the bound is one condition, and a
 * separate decision.
 *
 * The worker itself (src/sw.js, written to dist/sw.js by the build) never
 * touches /api and answers navigations network first, so the update model
 * (build.json poll → UpdatePrompt → reload) is unchanged; `updateWorker` is
 * how that poll tells the worker to precache a newer build before the reload.
 */
import { inTelegram } from "./session";

/**
 * THE kill switch. Flip to false and deploy: the next load of the new bundle
 * unregisters every worker of this origin and drops its caches, in every
 * browser that opens the app — the old worker still serves that first load
 * network-first, so the new bundle always arrives. It has to live HERE, in the
 * bundle, and not in a replacement sw.js: a worker that unregistered itself
 * and re-navigated its clients would be re-registered by the very bundle those
 * clients then load, and loop. Nothing else on the platform has a shell or a
 * toggle for this, which is why it is one line.
 */
const PWA_ENABLED = true;

let deferred = null; // the beforeinstallprompt event, held until the menu row asks
let installed = false;
const subs = new Set();
const notify = () => subs.forEach((fn) => fn());

/** Already running as the installed app (Android/desktop PWA, or iOS home-screen). */
export function isStandalone() {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  } catch {
    return false;
  }
}

/** iPhone / iPad — Safari fires no install event, so the menu shows a hint. */
export function isIos() {
  const ua = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Opened by a Telegram client? The SDK object is the normal answer; the launch
 * URL is the fallback for a WebView whose copy of the SDK never loaded (the
 * antivirus-intercept case index.html documents) — Telegram opens a mini app
 * with tgWebAppData / tgWebAppPlatform in the URL, and a browser never does.
 * Without it a WebView with a dead SDK reads as a browser and gets a worker.
 */
export function launchedByTelegram() {
  return inTelegram() || /tgWebApp(Data|Platform|Version)=/.test(location.hash + location.search);
}

export function installState() {
  return { canInstall: Boolean(deferred) && !installed, installed };
}

export function subscribeInstall(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/**
 * Open the browser's install dialog. Must run INSIDE the user's tap — prompt()
 * needs a user gesture — which is why the caller never awaits anything first.
 * Resolves to "accepted" | "dismissed" | "unavailable".
 */
export async function promptInstall() {
  const ev = deferred;
  if (!ev) return "unavailable";
  deferred = null; // the event can be used once
  notify();
  try {
    ev.prompt();
    const choice = await ev.userChoice;
    return choice?.outcome || "dismissed";
  } catch {
    return "dismissed";
  }
}

export function bootPwa() {
  if (typeof window === "undefined") return;
  installed = isStandalone();
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    notify();
  });
  registerWorker();
}

function registerWorker() {
  if (!import.meta.env.PROD) return; // dev serves no dist/sw.js
  if (!("serviceWorker" in navigator)) return;
  if (!PWA_ENABLED) {
    retireWorkers();
    return;
  }
  if (launchedByTelegram()) return;
  const register = () =>
    navigator.serviceWorker
      // The script itself is never taken from the HTTP cache: a new deploy is a
      // new worker carrying the new build's precache list.
      .register("/sw.js", { updateViaCache: "none" })
      .catch((err) => console.warn("[pwa] service worker not registered:", err));
  // After load, so it never competes with the page's own requests.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

/** The kill switch's act: every registration of this origin gone, every cache dropped. */
async function retireWorkers() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("safia-")).map((k) => caches.delete(k)));
  } catch {
    /* nothing registered, or storage refused — there is nothing left to retire */
  }
}

/** Ask the registered worker to check for a newer sw.js now. No-op without one. */
export async function updateWorker() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    await reg?.update();
  } catch {
    /* nothing registered, or the browser refused — the next navigation checks anyway */
  }
}
