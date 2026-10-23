import { restartKind, restartDelay, RESTART_WAIT_MS, setServerRestarting, sleep } from "./serverRestart";

// How a code chunk that failed to load recovers — a lazy page (App.jsx) and the
// reader's language pack (i18n/packs.js) alike.
//
// A page chunk's filename is content-hashed (e.g. Kaizen-<hash>.js). After a
// redeploy the old hash no longer exists on the server, so a client that still
// holds the previous index.html/main bundle 404s when it tries to import that
// page. lazyWithReload catches that failure and hands off to the shared
// stale-version handler defined in index.html (window.__staleReload): it shows
// a calm "A new version is available. Reloading…" notice and does a single
// reload to pull a fresh index.html pointing at the current hashes — so the
// user recovers instead of hitting the red "App failed to start" screen. That
// handler is guarded: if a reload can't fix it (a cached index.html still
// pointing at old hashes) it shows "please reopen the app" instead of looping.
// But a rejected import means one of two OPPOSITE things and the browser
// reports both identically ("Failed to fetch dynamically imported module"):
// the hashed file is genuinely gone, or the request never reached the server
// at all (offline, a reset connection, a filtering proxy). Their recoveries
// are opposites too — a reload fixes the first and re-breaks the second — so a
// dropped connection used to be told "A new version is available", then
// "Update needed. Please close and reopen the app.": advice that cannot work,
// for a cause that isn't the real one. Ask the origin before choosing.
// /build.json is same-origin, served no-store and always present, so a reply
// of ANY status proves the server is reachable and the chunk really is stale;
// only a rejection means the connection itself is what broke.
// A third answer joined those two with the blue-green deploys: the server is
// reachable but RESTARTING (a 502/503 from nginx or Cloudflare). A reload then
// lands on an error page, so the import waits for the server and is simply
// tried again — the chunk usually still exists (old builds' files are only
// dropped by the deploy that replaces them).
async function originState() {
  if (navigator.onLine === false) return "down";
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(`/build.json?t=${Date.now()}`, { cache: "no-store", signal: ctl.signal });
    return restartKind(r) ? "restarting" : "up";
  } catch {
    return "down"; // reset, blocked, offline — or too slow to be usable anyway
  } finally {
    clearTimeout(timer);
  }
}

async function waitWhileRestarting() {
  const since = Date.now();
  let state = await originState();
  for (let i = 0; state === "restarting" && Date.now() - since < RESTART_WAIT_MS; i++) {
    setServerRestarting(true);
    await sleep(restartDelay(i));
    state = await originState();
  }
  if (state !== "restarting") setServerRestarting(false);
  return state;
}

/** `importer()`, recovered from a stale deploy, a restart or a dropped link. */
export function importWithRecovery(importer) {
  return importer().catch(async (err) => {
    const state = await waitWhileRestarting();
    if (state === "down") {
      // A reload would hit the same dead connection. Say what actually broke.
      if (typeof window.__netFail === "function") {
        window.__netFail();
        return new Promise(() => {}); // never resolves — the overlay takes over
      }
      throw err;
    }
    // The server answers again: the failure may have been the restart itself.
    try { return await importer(); } catch { /* genuinely stale — reload below */ }
    if (typeof window.__staleReload === "function") {
      window.__staleReload();
      return new Promise(() => {}); // never resolves — the overlay takes over
    }
    // Fallback if the boot script is unavailable: one guarded reload.
    const KEY = "chunkReloadAt";
    let last = 0;
    try { last = Number(sessionStorage.getItem(KEY) || 0); } catch { /* storage blocked */ }
    if (Date.now() - last > 10_000) {
      try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage blocked */ }
      window.location.reload();
      return new Promise(() => {}); // never resolves — nothing renders before reload
    }
    throw err;
  });
}
