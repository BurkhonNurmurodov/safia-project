/*
 * Safia service worker — the SOURCE. The build writes dist/sw.js from it
 * (emitServiceWorker in vite.config.js) with the two placeholders below filled
 * in: the build stamp, and the same-origin paths to precache. It is registered
 * by utils/pwa.js in a BROWSER only — never inside Telegram (see bootPwa) —
 * and served no-store by serve_spa in backend/app/main.py.
 *
 * What it does, in the order the fetch handler decides:
 *   - non-GET and cross-origin requests are not touched at all (a font
 *     re-fetched from in here would be refused by the worker's own CSP
 *     connect-src, which is same-origin);
 *   - /api, /bot, /health, /docs, the backend's /admin routes, /build.json and
 *     /sw.js are never cached and never answered from cache;
 *   - a navigation to an SPA route is NETWORK FIRST with a timeout, then the
 *     cached shell — for offline, a slow origin AND an origin 5xx (nginx during
 *     the backend restart every deploy performs); a 4xx is never masked — then
 *     a plain offline page. So a reload still fetches the deployed index.html
 *     and UpdatePrompt's «reload» keeps its meaning;
 *   - a navigation whose path names a FILE (an export opened in a new tab) is
 *     left to the browser: the shell fallback must never answer a slow .xlsx;
 *   - /assets/* is CACHE FIRST — content-hashed and served immutable, so a
 *     cached copy can never be the wrong one;
 *   - everything else same-origin (icons, the manifest, the Telegram SDK copy)
 *     is network first with the cache as the fallback.
 *
 * ONE cache per build, named by the stamp: activating a new build's worker
 * drops every other build's cache, and skipWaiting + clients.claim make that
 * immediate. A tab still on the old build then 404s on its next lazy chunk
 * and lazyWithReload reloads it — exactly what happens today without a worker.
 */

const BUILD = "2026-09-24T07:43:46.438Z";
const PRECACHE = ["/","/assets/AdminPanel-Be-IEeEH.js","/assets/AnalysisBoard-BrCSRXt9.js","/assets/Arc-MUh-Qtg1.js","/assets/AttendanceModal-OtHi9E2y.js","/assets/BrigadirProfile-BTE0odzx.js","/assets/BroadcastReceivers-BV6Ceh3F.js","/assets/BroadcastRecord-dT6R_f5j.js","/assets/CatLockNotice-ClUmM1rm.js","/assets/CategoryLegendModal-DoUg3DVI.js","/assets/CellConcerns-Cd8l0Tk3.js","/assets/CellDetails-DwT-srCF.js","/assets/CellFormModal-5XmGxCzV.js","/assets/CellLink-HhgpneCM.js","/assets/Cells-028WWOiz.js","/assets/ColumnFilter-7fRAjAUU.js","/assets/ColumnsPicker-Dr0qRFdy.js","/assets/CommentsModal-CLmqX1rH.js","/assets/ComparisonTable-BqRs_a15.js","/assets/Concerns-DOZpbSFI.js","/assets/ConfirmDialog-EHx4DBkK.js","/assets/Daily-AzIPPpAq.js","/assets/DataTable-b_TsT37s.js","/assets/DateRangePicker-Bir80OLt.js","/assets/DayReportView-CJEONj_f.js","/assets/DayStepper-CPc-0p1d.js","/assets/DifferenceBreakdown-BeRtZTTf.js","/assets/Downtime-B9aZR2pQ.js","/assets/Education-B-6reLYd.js","/assets/EducationLesson-C42CtWLr.js","/assets/EmptyState-Cd7cJKpV.js","/assets/Exam-CLo7hZuq.js","/assets/FactorySelect-CAfTd9rl.js","/assets/Gamification-DVZHtwhW.js","/assets/GroupBadge-CikJdep8.js","/assets/HeatmapChart-BSDF_k6L.js","/assets/IdleCell-Cr_z-PSa.js","/assets/KPICard-CIzAQDMz.js","/assets/Kaizen-DuJ-J-5h.js","/assets/KpiDeltaCard-BbCBcJpI.js","/assets/LangTextInput-DG8xJe27.js","/assets/Layout-90xekF7J.js","/assets/LeaderDayReport-Kb3Io2xL.js","/assets/LeaderUnitReport-CZVsSqcE.js","/assets/Leaderboard-CQ8_hHXR.js","/assets/Leaders-BDc3knxy.js","/assets/LiveOverview-a4pGG_9V.js","/assets/Login-Bo4Y6TIa.js","/assets/NotFound-DVGTmPeK.js","/assets/Overview-Cj5sMk9G.js","/assets/Pagination-BhYhxHNc.js","/assets/PerenaladkaFactTable--28ZunQv.js","/assets/PlanFulfillment-YOVNBpo2.js","/assets/Production-cxS5XQzA.js","/assets/Profile-CCPlHLk5.js","/assets/ProofCamera-B9V1zv9s.js","/assets/Quality-CUZQgOS1.js","/assets/RequestStateChip-UDyjiV4B.js","/assets/RichTextEditor-Dlbr6UJ0.js","/assets/SearchInput-DThl59xc.js","/assets/SeasonalityHeatmap-ChqsCcub.js","/assets/SegmentedToggle-CR6_D7Lg.js","/assets/SetupTimes-8GRJ-1dV.js","/assets/ShiftDaily-D6oec6SS.js","/assets/Staff-Ccuhsn6s.js","/assets/StatusBadge-D_CIyfWy.js","/assets/Targets-DWnN1mWq.js","/assets/Tasks-Ct5UjgYa.js","/assets/TimeWheelPicker-DdnLJwQA.js","/assets/Tooltip-Des_9apU.js","/assets/TrendChart-A7IE127L.js","/assets/TripleSpeedometer-Bg6tE_RU.js","/assets/Trudoyomkost-CFRowd1O.js","/assets/UsersActivity-C1BYfPG0.js","/assets/WatchProgress-DFFoung0.js","/assets/WebLogin-Be3AavIV.js","/assets/WorkerConcerns-Jotc8e05.js","/assets/Workers-CG63p1gx.js","/assets/Zagruzka-DEh5AX-i.js","/assets/ZagruzkaCell-B6Q0XfHw.js","/assets/alarm-clock-ClZcCKgV.js","/assets/api-hrCOqBTS.js","/assets/archive-BqRmg-Tf.js","/assets/archive-restore-mSkpRhVz.js","/assets/arrow-down-DQSOzzxd.js","/assets/arrow-left-CAUWrdRQ.js","/assets/arrow-left-right-Cqi8frBn.js","/assets/arrow-up-CHjDhSPh.js","/assets/arrow-up-right-BcABYePu.js","/assets/award-ypE0Klba.js","/assets/ban-C1K_hoXT.js","/assets/bot-JZ6FpEx9.js","/assets/boxes-mFVkvKLR.js","/assets/brigadirFilters-BYusEqBz.js","/assets/broadcastTree-Z6zVPJMw.js","/assets/building-2-DErzt-4l.js","/assets/calendar-DJda-UwK.js","/assets/calendar-clock-CT4vlSRU.js","/assets/calendar-days-JOTCE0oT.js","/assets/calendar-range-O-3b72K8.js","/assets/camera-DjuGw4zE.js","/assets/categories-Dgs7GpqK.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D-hFOsdf.js","/assets/chart-line-B0q3idMI.js","/assets/chart-pie-BDVRKgmC.js","/assets/chartRange-UlBA42E0.js","/assets/check-check-DKWl2boF.js","/assets/chevron-left-BP-kA-Dn.js","/assets/chevrons-up-down-DGZ1QQNQ.js","/assets/circle-check-big-DQo4ZIYL.js","/assets/circle-dashed-dERxnguo.js","/assets/circle-dot-C0G-9Hro.js","/assets/circle-minus-DVA3reWV.js","/assets/circle-slash-C3wvjaef.js","/assets/circle-user-round-C_R37yOz.js","/assets/coins-CN5R_-xJ.js","/assets/compass-aKd3nWa1.js","/assets/concernCategories-BQLlR3_M.js","/assets/copy-ThS4Zjvq.js","/assets/corner-down-right-DcK_BHwL.js","/assets/createLucideIcon-CF8PKU-a.js","/assets/exportXlsx-B_LK-fF2.js","/assets/external-link-BFUAzfwn.js","/assets/file-clock-D2GC82-t.js","/assets/file-spreadsheet-DLThhu3g.js","/assets/file-text-DSD22CSe.js","/assets/flag-BqLztJIc.js","/assets/flame-Bf3A_kD9.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-NQOtgm-m.js","/assets/hash-Ds415fpc.js","/assets/history-Duh3sO7M.js","/assets/hourglass-xPiR5NsT.js","/assets/image-Bo6krM-7.js","/assets/image-off-B3WV5tRl.js","/assets/index-BMw4jaHr.js","/assets/index-UJbK-eKd.css","/assets/keyboard-BNOLgq4S.js","/assets/languages-04ZbfHxA.js","/assets/layers-VEp-O4AW.js","/assets/leaderReason-CxSG56M9.js","/assets/lightbulb-DID-puvI.js","/assets/link-2-C9z4pQ-B.js","/assets/list-checks-CpydFhSu.js","/assets/list-ordered-Blb1db9l.js","/assets/lock-open-Br44Hcev.js","/assets/log-in-oCIfAPG9.js","/assets/message-square-Bzfb-N_x.js","/assets/minimize-2-Y2Ush8GR.js","/assets/paperclip-Ce0WIiU8.js","/assets/pencil-Bf1BsWMJ.js","/assets/personName-B4KId4zS.js","/assets/pin-DeaXKFmY.js","/assets/play-RjniYJ9x.js","/assets/presentation-D09WJqLk.js","/assets/prop-types-XZo8A-D8.js","/assets/radio-BEiRU-jl.js","/assets/react-apexcharts.esm-BrwOw6Ph.js","/assets/repeat-HeOmXzk6.js","/assets/rotate-ccw-DwwdoooA.js","/assets/rotate-cw-Cajx-p-7.js","/assets/save-BrVgAtIq.js","/assets/scale-BGYYe0ba.js","/assets/scroll-text-CTIvP8BO.js","/assets/search-x-CGK_KMBY.js","/assets/segments-D6mq5nmZ.js","/assets/send-CwsJcptk.js","/assets/settings-2-WFEblXkt.js","/assets/shield-BsPRnLaM.js","/assets/shield-alert-Bl-ff_nl.js","/assets/shield-check-Cr1Gjbte.js","/assets/shield-question-mark-CzpB56cx.js","/assets/siren-CSD55FkT.js","/assets/smartphone-ZLe0xSGk.js","/assets/snowflake-DcIaZBSb.js","/assets/square-D5WnEDDi.js","/assets/square-check-big-DI6vOcs5.js","/assets/star-BXwl54e6.js","/assets/statusBands-D6w39cI0.js","/assets/table-2-KHbyziwA.js","/assets/tag-CuMlwmyM.js","/assets/trending-down-BzWo6qxA.js","/assets/trending-up-5tMFUQg-.js","/assets/triangle-alert-DCt5rmro.js","/assets/undo-2-rUrH9HkE.js","/assets/useChartTheme-PQkK9H07.js","/assets/useElementWidth-BPR6zQJ_.js","/assets/useIsMobile-CrhqdxcJ.js","/assets/useMutation-CuZ5BLSt.js","/assets/useStatusBands-B3cL2wHO.js","/assets/user-CS7VtC2A.js","/assets/user-check-BEj7LV_m.js","/assets/user-cog-CNW246fE.js","/assets/user-minus-CnmEDmKu.js","/assets/users-BhMMx3Nq.js","/assets/verifyState-CDCHW86L.js","/assets/video-DZDWGPLO.js","/assets/warehouse-BVbgQI1f.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
const CACHE = "safia-" + BUILD;
const SHELL = "/";
const NAV_TIMEOUT_MS = 5000;

// Backend prefixes: never cached, never served from cache, never given the shell.
const NEVER_CACHE = ["/api/", "/bot/", "/health", "/docs", "/redoc", "/openapi.json"];
// The SPA's own /admin paths. Every other /admin/* is a backend route.
const SPA_ADMIN = new Set(["/admin", "/admin/", "/admin/upload", "/admin/upload/"]);

function passThrough(path) {
  if (NEVER_CACHE.some((p) => path.startsWith(p))) return true;
  if (path.startsWith("/admin") && !SPA_ADMIN.has(path)) return true;
  return path === "/build.json" || path === "/sw.js";
}

function namesFile(path) {
  return path.slice(path.lastIndexOf("/") + 1).includes(".");
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Never atomic: a file that is missing must not keep the whole build out of
    // the cache. Eight at a time, not two hundred at once — a phone on a slow
    // link should not have every chunk of the app competing with the page it
    // is showing. An unchanged hashed asset comes out of the browser's own HTTP
    // cache (served immutable) — but chunk hashes cascade with the import
    // graph, so most deploys rename most chunks and re-download most of the
    // graph; CLAUDE.md records that cost as accepted and names the knob.
    const BATCH = 8;
    for (let i = 0; i < PRECACHE.length; i += BATCH) {
      await Promise.allSettled(PRECACHE.slice(i, i + BATCH).map((path) => cache.add(path)));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith("safia-") && n !== CACHE).map((n) => caches.delete(n)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (req.mode === "navigate") {
    if (!passThrough(path) && !namesFile(path) && !path.startsWith("/assets/")) {
      event.respondWith(shell(req));
    }
    return;
  }
  if (passThrough(path)) return;
  event.respondWith(path.startsWith("/assets/") ? cacheFirst(req) : networkFirst(req));
});

// Every cache lookup ignores Vary. The server's CORS layer stamps
// `Vary: Origin` on assets, and the Cache API honours it by default: a module
// script request carries an Origin header where a plain fetch() of the same URL
// does not, so the entry chunk fetch() found was a MISS for the module loader,
// and an offline start died on it (found in local testing, 2026-09-18). Assets
// are content-hashed — identical for every origin — so Vary says nothing here.
const MATCH = { ignoreVary: true };

// The Cache API can refuse — storage evicted or "in a broken state" mid-session,
// a quota error while the origin's data is being cleared, a private window that
// registered the worker earlier. A refusal inside respondWith() is a FAILED
// request for a server that is perfectly reachable, so every cache call on the
// fetch path goes through these three, and a failing cache degrades to plain
// network — never to an error page or a dead module.
async function safeOpen() {
  try {
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}
async function safeMatch(key) {
  try {
    return (await caches.match(key, MATCH)) || null;
  } catch {
    return null;
  }
}
function safePut(cache, key, res) {
  if (!cache) return;
  try {
    cache.put(key, res.clone()).catch(() => {});
  } catch {
    /* body already used, or storage refused */
  }
}
// Only a body of the kind the URL names is stored: serve_spa answers ANY
// unknown same-origin path with index.html/200, so without this a renamed
// icon or a stale <img src> would park the shell under a static's URL. The
// shell itself is stored by shell(), under SHELL and nowhere else.
function storable(res) {
  return res.status === 200 && !(res.headers.get("content-type") || "").includes("text/html");
}

async function shell(req) {
  const cache = await safeOpen();
  const fresh = fetch(req).then((res) => {
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
      safePut(cache, SHELL, res);
    }
    return res;
  });
  fresh.catch(() => {}); // a failure after the cached shell already went out is not an error
  const late = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS, null));
  let res = null;
  try {
    res = await Promise.race([fresh, late]);
  } catch {
    // offline — fall through to the cached shell
  }
  // A 5xx is the origin saying it is not there right now — nginx during the
  // backend restart every deploy performs, a Cloudflare 52x — and that is the
  // one moment the cached shell exists for: the app then shows its own
  // offline/error state instead of the proxy's page. A 4xx is never masked.
  if (res && res.status < 500) return res;
  const cached = await safeMatch(SHELL);
  if (cached) return cached;
  if (res) return res;
  try {
    return await fresh;
  } catch {
    return offlinePage();
  }
}

async function cacheFirst(req) {
  const hit = await safeMatch(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (storable(res)) safePut(await safeOpen(), req, res);
  return res;
}

async function networkFirst(req) {
  let res;
  try {
    res = await fetch(req);
  } catch (err) {
    const hit = await safeMatch(req);
    if (hit) return hit;
    throw err;
  }
  if (storable(res)) safePut(await safeOpen(), req, res);
  return res;
}

// Shown only when the app has never been cached on this device and there is no
// network — a cold first open offline. Three languages on one line each; the
// full four-language boot copy lives in index.html, which is what this is
// standing in for.
function offlinePage() {
  const html =
    '<!doctype html><html lang="uz"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Safia</title>' +
    "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;" +
    "background:#0f1117;color:#f3f4f6;font-family:system-ui,sans-serif;text-align:center;padding:24px}" +
    "h1{font-size:18px;margin:0 0 8px}p{margin:0;color:#9ca3af;font-size:14px;line-height:1.5}</style></head>" +
    "<body><div><h1>Internet aloqasi yo‘q</h1><p>Aloqa tiklangach sahifani yangilang.<br>" +
    "Нет подключения — обновите страницу, когда связь появится.<br>" +
    "No connection — reload once you are back online.</p></div></body></html>";
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
