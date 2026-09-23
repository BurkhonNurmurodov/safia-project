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

const BUILD = "2026-09-23T15:19:40.091Z";
const PRECACHE = ["/","/assets/AdminPanel-yMpTCHOs.js","/assets/AnalysisBoard-CZOodmeT.js","/assets/Arc-CPLU7LYE.js","/assets/AttendanceModal-D9A1uzkj.js","/assets/BrigadirProfile-dfj4WqCv.js","/assets/BroadcastReceivers-BNna7SnF.js","/assets/BroadcastRecord-BN39jZvK.js","/assets/CatLockNotice-DfmBYO1e.js","/assets/CategoryLegendModal-VExc7Uw6.js","/assets/CellConcerns-D2qzcLgN.js","/assets/CellDetails-DicA2VUH.js","/assets/CellFormModal-Z1ifS9xd.js","/assets/CellLink-B0V5s0iG.js","/assets/Cells-DJ2HTFHG.js","/assets/ColumnFilter-NRI_mHeh.js","/assets/ColumnsPicker-DLJTjkZC.js","/assets/CommentsModal-i5MMnW7c.js","/assets/ComparisonTable-MVMMhcy2.js","/assets/Concerns-C-8Md-fy.js","/assets/ConfirmDialog-DezwCpg_.js","/assets/Daily-CGs6nTRG.js","/assets/DataTable-ETOFRMZ-.js","/assets/DateRangePicker-BrVeGntg.js","/assets/DayReportView-BY3inu7i.js","/assets/DayStepper-DFDYYyiJ.js","/assets/DifferenceBreakdown-DUSi3fRp.js","/assets/Downtime-mDI7PosC.js","/assets/Education-8Y6YNSTH.js","/assets/EducationLesson-DL7uvax2.js","/assets/EmptyState-f-dgzWfC.js","/assets/FactorySelect-S0at54wI.js","/assets/FormField-CJjpYbfW.js","/assets/Gamification-BXYWmg2n.js","/assets/GroupBadge-4fjar_Ss.js","/assets/HeatmapChart-CCJZ8Q93.js","/assets/IdleCell-Bv8tP6s7.js","/assets/KPICard-Cof_XoIo.js","/assets/Kaizen-D5Nxkui5.js","/assets/KpiDeltaCard-BN5dDck-.js","/assets/LangTextInput-C8MwwHK3.js","/assets/Layout-DDR-Xy-p.js","/assets/LeaderDayReport-BRyCfm3U.js","/assets/LeaderUnitReport-DBaLMYxH.js","/assets/Leaderboard-B5qNphvF.js","/assets/Leaders-DXbaCJJH.js","/assets/LiveOverview-Bq_AAN5N.js","/assets/Login-C6-_-aZj.js","/assets/NotFound-TCs3t7hb.js","/assets/Overview-Cpu2cFCL.js","/assets/Pagination-BIuQyyT-.js","/assets/PerenaladkaFactTable-BvL20HFS.js","/assets/PlanFulfillment-Fh1aVX8A.js","/assets/Production-Dq4m0xsl.js","/assets/Profile-C4_Voeof.js","/assets/ProofCamera-CTWoDYaJ.js","/assets/Quality-B6HzTQMs.js","/assets/RichTextEditor-DJrjTjvL.js","/assets/SearchInput-C_39AppD.js","/assets/SeasonalityHeatmap-Cb3aGpHI.js","/assets/SegmentedToggle-BIAtRhYu.js","/assets/SetupTimes-BPuNOpuG.js","/assets/ShiftDaily-BQ45Zr9B.js","/assets/Skeleton-tqgrhnSM.js","/assets/Staff-CJRxM03e.js","/assets/StatusBadge-y3dbKCzJ.js","/assets/StyledSelect-BrNqF63z.js","/assets/Targets-B_P1NK47.js","/assets/Tasks-BfsG8arW.js","/assets/TimeField--ShDtmDn.js","/assets/TimeWheelPicker-BCkM_deb.js","/assets/Toast-B0rYkRec.js","/assets/Tooltip-BMgxDtV5.js","/assets/TrendChart-CI8aPeDv.js","/assets/TripleSpeedometer-DdYNio2J.js","/assets/Trudoyomkost-Bg14WEKq.js","/assets/UsersActivity-_nTadxm6.js","/assets/WatchProgress-nKKthBDv.js","/assets/WebLogin-obpfSsaG.js","/assets/WorkerConcerns-De1Qpbf4.js","/assets/Workers-DXqHfu9p.js","/assets/Zagruzka-B8kh7eJ0.js","/assets/ZagruzkaCell-Dt0DZk_d.js","/assets/alarm-clock-Carn0gjC.js","/assets/api-6xcFQugj.js","/assets/archive-CU9jCmLy.js","/assets/archive-restore-DrvRz--K.js","/assets/arrow-down-y_i6COpJ.js","/assets/arrow-left-Bmx4bF0q.js","/assets/arrow-left-right-Cf17fFTf.js","/assets/arrow-right-5L1Rwsu5.js","/assets/arrow-up-CX1zrLFB.js","/assets/arrow-up-right-D6zQzdk-.js","/assets/award-cmTb0fso.js","/assets/ban-CVlaK4zu.js","/assets/bot-B3feXDkG.js","/assets/boxes-CVmnik7R.js","/assets/brigadirFilters-BaoNyQfJ.js","/assets/broadcastTree-6syVpkko.js","/assets/building-2-DVT-s2wn.js","/assets/calendar-CJStVjsQ.js","/assets/calendar-clock-DF0csInP.js","/assets/calendar-days-CvoXsEgW.js","/assets/calendar-range-BZEuNvsc.js","/assets/camera-DS1ynQJb.js","/assets/categories-B1rycuGR.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BXjpWsln.js","/assets/chart-line-BWMG43ZG.js","/assets/chart-pie-CFeR3SxS.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-BHntlvbU.js","/assets/check-Dm2qkUt0.js","/assets/check-check-B8RsPFhQ.js","/assets/chevron-left-qhTU7PJA.js","/assets/chevrons-up-down-CdA9GPdj.js","/assets/circle-dashed-F0XwAShV.js","/assets/circle-dot-C4XRU5UP.js","/assets/circle-minus-DeZdQEyO.js","/assets/circle-slash-BFvMuElL.js","/assets/circle-user-round-AyVS_TXO.js","/assets/coins-BeYTIYys.js","/assets/compass-hdEEiDSt.js","/assets/concernCategories-DcdsZIYK.js","/assets/copy-Dox7ZpSg.js","/assets/corner-down-right-C5pJt-AI.js","/assets/createLucideIcon-CX__Dofa.js","/assets/exportXlsx-DmNaoaSu.js","/assets/external-link-B6q025ee.js","/assets/file-clock-jVU1AVE6.js","/assets/file-spreadsheet-ChZHsP0e.js","/assets/file-text-g_wJeO7c.js","/assets/flag-D4FlLLNQ.js","/assets/flame-BY8B3yCR.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-AKk1YEyp.js","/assets/funnel-lUl5s83A.js","/assets/hash-Vu-XA-yH.js","/assets/history-7rbK3o66.js","/assets/hourglass-CUboSTBo.js","/assets/image-CeY3sbBh.js","/assets/image-off-CxM5_R8A.js","/assets/index-CdEKZ0r2.js","/assets/index-ftrCYFhP.css","/assets/keyboard-BkiXZ3Wt.js","/assets/languages-CVHQGnQO.js","/assets/layers-55rsBuhF.js","/assets/leaderReason-B57bZ992.js","/assets/lightbulb-Qpz8ZOat.js","/assets/link-2-CWWGAGEl.js","/assets/list-checks-rGR2mf3o.js","/assets/list-ordered-DhrxgdTR.js","/assets/lock-open-DLRvMzVb.js","/assets/log-in-Dg1qnFBu.js","/assets/message-square-Cuy8S15j.js","/assets/minimize-2-DMjXwOqk.js","/assets/minus-C6BGgfEM.js","/assets/paperclip-r4s6xirB.js","/assets/pencil-Shpfy6sB.js","/assets/pencil-line-B6hVGd9q.js","/assets/personName-B4KId4zS.js","/assets/pin-DMysAkxf.js","/assets/play-CHhmC_Jz.js","/assets/presentation-Fm8c6Tl5.js","/assets/prop-types-CFGyQ4V0.js","/assets/radio-B74WE0SS.js","/assets/react-apexcharts.esm-C586lfDT.js","/assets/refresh-cw-BZacZPMJ.js","/assets/repeat-BUzdqA26.js","/assets/rotate-ccw-CZoSsfZ_.js","/assets/rotate-cw-Dz5-8QRM.js","/assets/save-rAguWFrY.js","/assets/scale-nkS8WALP.js","/assets/scroll-text-DZDlCRU0.js","/assets/search-x-B03OiJaK.js","/assets/segments-BVxnP4A0.js","/assets/send-2TWS95QM.js","/assets/settings-2-DsScAVK9.js","/assets/shield-RNHOFyNh.js","/assets/shield-alert-Ca0z2f5K.js","/assets/shield-check-BMuOpK7-.js","/assets/shield-question-mark-CGA_Pg3l.js","/assets/siren-Bztg64i9.js","/assets/smartphone-zHr_GXhY.js","/assets/snowflake-DQ0OKLQr.js","/assets/square-ZVDP3kr_.js","/assets/square-check-big-OODvrh8W.js","/assets/star-9Sw2mEuw.js","/assets/statusBands-D_PnCO3K.js","/assets/table-2-Cgaw4_y9.js","/assets/tag-4scgDsYy.js","/assets/trash-2-DQ5A8-lX.js","/assets/trending-down-Cw8rrU6S.js","/assets/trending-up-DAAPSMnL.js","/assets/undo-2-JM-LgRwL.js","/assets/useChartTheme-DKvmHSI7.js","/assets/useElementWidth-CzZO5CM4.js","/assets/useIsMobile-BreW_e6G.js","/assets/useMutation-BmTczVrt.js","/assets/useStatusBands-XnzCgA2e.js","/assets/user-check-CKsGbrn2.js","/assets/user-cog-D08EZSn8.js","/assets/user-minus-D90RbUw8.js","/assets/users-BKQOIdRj.js","/assets/verifyState-EWp1XxBI.js","/assets/video-CJB46aWd.js","/assets/warehouse-gFLpcrAZ.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
