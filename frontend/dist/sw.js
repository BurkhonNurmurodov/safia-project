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

const BUILD = "2026-09-26T07:05:31.255Z";
const PRECACHE = ["/","/assets/AdminPanel-DKF1jPeo.js","/assets/AnalysisBoard-mE1nJR7I.js","/assets/Arc-Ddgl1hVH.js","/assets/ArcLegacy-BAYA7O7_.js","/assets/AttendanceModal-Cr1XRumc.js","/assets/BrigadirProfile-DsdbqVzn.js","/assets/BroadcastReceivers-BF6uWxs0.js","/assets/BroadcastRecord-avEXRJTP.js","/assets/CatLockNotice-D21PPKXE.js","/assets/CategoryLegendModal-2RHl7Yag.js","/assets/CellConcerns-DEMcNE1h.js","/assets/CellDetails-wkWOIT_p.js","/assets/CellFormModal-bo6Nnij-.js","/assets/CellLink-DRBHfeDM.js","/assets/Cells-ZA5M7r9K.js","/assets/ColumnFilter-DmbglDpe.js","/assets/ColumnsPicker-NX6h6Zca.js","/assets/CommentsModal-URdmuyS1.js","/assets/ComparisonTable-B4a_aSdO.js","/assets/Concerns-CiDnaT2I.js","/assets/ConfirmDialog-gYTILC1W.js","/assets/Daily-CI0llQkJ.js","/assets/DataTable-CJbeB51h.js","/assets/DateRangePicker-BdYOzk6h.js","/assets/DayReportView-_YgHrOkE.js","/assets/DayStepper-7hznyntc.js","/assets/DifferenceBreakdown-BMbrriJo.js","/assets/Downtime-BpMOJ0ey.js","/assets/Education-CNp3DRHc.js","/assets/EducationLesson-D0pPyVww.js","/assets/EmptyState-DapPC-yT.js","/assets/Exam-BGvkKEZB.js","/assets/FactorySelect-WcNCBOV6.js","/assets/Gamification-DXA_dIMT.js","/assets/GroupBadge-BLg90tbV.js","/assets/HeatmapChart-BvwTTscX.js","/assets/IdleCell-yfiUnziJ.js","/assets/KPICard-BwBF2wbm.js","/assets/Kaizen-rNTF-L48.js","/assets/KpiDeltaCard-8DpTLY3r.js","/assets/LangTextInput-CvqEImkI.js","/assets/Layout-CwXu7QWg.js","/assets/LeaderDayReport-378-oebE.js","/assets/LeaderUnitReport-D-KWUwB2.js","/assets/Leaderboard-Co4aw2-H.js","/assets/Leaders-DlyXAxHR.js","/assets/LiveOverview-DI0PkTOL.js","/assets/Login-DcGCi8aj.js","/assets/NotFound-DB47d8VD.js","/assets/Overview-lFbpss0Q.js","/assets/Pagination-Dq72Yd5B.js","/assets/PerenaladkaFactTable-WWgLfJw9.js","/assets/PlanFulfillment-CLIJJwvH.js","/assets/Production-DcGOr7Wv.js","/assets/Profile-Bo7axOAB.js","/assets/ProofCamera-CmUxPBwh.js","/assets/Quality-Co2kE0Rg.js","/assets/RequestStateChip-Bd7kWwt3.js","/assets/RichTextEditor-BopRUnu0.js","/assets/SearchInput-BA1Bj84E.js","/assets/SeasonalityHeatmap-_o67DD6d.js","/assets/SegmentedToggle-BRS4uT5c.js","/assets/SetupTimes-BNOqzFzb.js","/assets/ShiftDaily-DLEGfSaL.js","/assets/Staff-BcbiWGFd.js","/assets/StatusBadge-D_lhNsuf.js","/assets/Targets-BsJiwFxv.js","/assets/Tasks-BzvkZOSm.js","/assets/TimeWheelPicker--a8bPjk6.js","/assets/Tooltip-Cd_P1v1c.js","/assets/TrendChart-B0BzRe2b.js","/assets/TripleSpeedometer-CyVTlxdB.js","/assets/Trudoyomkost-CBQzFju4.js","/assets/UsersActivity-BDatx3Pk.js","/assets/WatchProgress-DzYA4Kzk.js","/assets/WebLogin-C-QpOvlo.js","/assets/WorkerConcerns-CNgCQODw.js","/assets/Workers-DjQ1ladn.js","/assets/Zagruzka-BjMDYmSJ.js","/assets/ZagruzkaCell-BHRWOVqK.js","/assets/alarm-clock-DLk7fFpO.js","/assets/api-DmHvqThF.js","/assets/archive-BvJuazJ1.js","/assets/archive-restore-CvDt_YZo.js","/assets/arrow-down-D4xb6-Pn.js","/assets/arrow-left-right-CFDq2gJt.js","/assets/arrow-left-sHwoFF8d.js","/assets/arrow-up-BGrgNrwu.js","/assets/arrow-up-right-iyddwltU.js","/assets/award-BFw0aW5w.js","/assets/ban-CYX0a9eR.js","/assets/bot-H_GNQ1QZ.js","/assets/boxes-Omz_P6q8.js","/assets/brigadirFilters-CpDp3s_s.js","/assets/broadcastTree-XIAWIhI3.js","/assets/building-2-CS7Er-8o.js","/assets/calendar-DTbm1cmJ.js","/assets/calendar-clock-DG2dD6d4.js","/assets/calendar-days-DhgexJ1M.js","/assets/calendar-range-DX0zpGHV.js","/assets/camera-lS28ExY8.js","/assets/categories-YvjVMsg0.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C6Xfcktz.js","/assets/chart-line-DjjGNhJM.js","/assets/chart-pie-8p2rFM9A.js","/assets/chartRange-H76B3l3x.js","/assets/check-check-BB-JSxml.js","/assets/chevron-left-DTTghLyt.js","/assets/chevrons-up-down-J8BOOM4B.js","/assets/circle-check-big-DGaGGqyD.js","/assets/circle-dashed-XyoHLEcL.js","/assets/circle-dot-DPOtDC0L.js","/assets/circle-minus-DAYTUbRx.js","/assets/circle-slash-DRf9sBLK.js","/assets/circle-user-round-C2IfLfOg.js","/assets/coins-caeft2WR.js","/assets/compass-Dxcwz2YI.js","/assets/concernCategories-Cu2PWJs0.js","/assets/copy-BTwRj0s5.js","/assets/corner-down-right-LKYkGBiA.js","/assets/createLucideIcon-CZLL2kId.js","/assets/exportXlsx-CihHj8l3.js","/assets/external-link-BYCWMowb.js","/assets/file-clock-v4ynbB7O.js","/assets/file-exclamation-point-_godIl3s.js","/assets/file-spreadsheet-17gJ2ezB.js","/assets/file-text-DuDreqrT.js","/assets/flag-1XjMW4Sd.js","/assets/flame-BcO0iYAY.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-B9O9iQrW.js","/assets/hash-BIEmz72x.js","/assets/history-DMakOHM1.js","/assets/hourglass-QU-yrU-p.js","/assets/image-D7-i89Zd.js","/assets/image-off-BsUxWpQI.js","/assets/index-B3UowLoB.js","/assets/index-BTZsppTH.css","/assets/key-round-Dczq2b3Q.js","/assets/keyboard-BRIJI3eK.js","/assets/languages-ByGZSx4h.js","/assets/layers-C-EkgXOV.js","/assets/leaderReason-DtzG4lv1.js","/assets/lightbulb-BSFaMzRj.js","/assets/link-2-oj3bhI6L.js","/assets/list-checks-DCv9r41j.js","/assets/list-ordered-CNK9RV2y.js","/assets/list-tree-BUZh3dzI.js","/assets/lock-open-B8qtoUxY.js","/assets/log-in-B3EKxxOa.js","/assets/message-square-Bw3Xzvbd.js","/assets/minimize-2-BYRsWwX9.js","/assets/package-check-BrS3I7jY.js","/assets/paperclip-BzhteV7D.js","/assets/pencil-DqrKiDZW.js","/assets/personName-B4KId4zS.js","/assets/pin-C7x0BwgH.js","/assets/play-BW-VcmEH.js","/assets/presentation-D2yEdHb5.js","/assets/prop-types-NPkLufAs.js","/assets/radio-BeZuXFEj.js","/assets/react-apexcharts.esm-CkdLNZfD.js","/assets/repeat-BKNCb6Q5.js","/assets/rotate-ccw-CQ1AZuZw.js","/assets/rotate-cw-w_uNVR6s.js","/assets/save-B92vrVz_.js","/assets/scale-CvKm3byC.js","/assets/scroll-text-DeiHvT-M.js","/assets/search-x-D_ifIbR0.js","/assets/segments-DL2gluXZ.js","/assets/send-CsVNkXrO.js","/assets/settings-2-BiNKdXFu.js","/assets/shield-CMKlanA0.js","/assets/shield-alert-BQwrXSS2.js","/assets/shield-check-BmRECCFT.js","/assets/shield-question-mark-BUaALPUu.js","/assets/siren-DcOdkWVd.js","/assets/smartphone-2MA6lRxx.js","/assets/snowflake-B04-3cGd.js","/assets/square-D10pqY4m.js","/assets/square-check-big-CuN1m292.js","/assets/star-8uB6IRTX.js","/assets/statusBands-Btq15AXA.js","/assets/store-BH2lwhlB.js","/assets/table-2-B1VUCI8t.js","/assets/tag-V340itR7.js","/assets/trending-down-CTIWLPQ5.js","/assets/trending-up-CaPUujZv.js","/assets/triangle-alert-BRUQtEDX.js","/assets/undo-2-DmTZDc90.js","/assets/useChartTheme-D3E21gWz.js","/assets/useElementWidth-BJIEwm5S.js","/assets/useIsMobile-WT2kld-J.js","/assets/useMutation-BJD3amUn.js","/assets/useStatusBands-W6RzaPoM.js","/assets/user-C4yTLg0D.js","/assets/user-check-CTRgB0GS.js","/assets/user-cog-Bn8S7kzw.js","/assets/user-minus-BkL7ZHop.js","/assets/users-ufH9nOZ7.js","/assets/verifyState-CcGIUIYF.js","/assets/video-B6v2tUWq.js","/assets/warehouse-B6hZ86mr.js","/assets/zap-Qw-IS3Ag.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
