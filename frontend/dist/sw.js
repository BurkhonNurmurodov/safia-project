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

const BUILD = "2026-09-25T10:05:26.359Z";
const PRECACHE = ["/","/assets/AdminPanel-C9OoL03O.js","/assets/AnalysisBoard-DHJRSbpd.js","/assets/Arc-C7gqlLOH.js","/assets/ArcAnalysis-DnY79puX.js","/assets/ArcLegacy-Bd07N-t8.js","/assets/AttendanceModal-DLVEP_Ek.js","/assets/BrigadirProfile-B81yAa6N.js","/assets/BroadcastReceivers-Bfsn_W9i.js","/assets/BroadcastRecord-CEm9QbmP.js","/assets/CatLockNotice-CyHaI7Yr.js","/assets/CategoryLegendModal-7V8MdBiX.js","/assets/CellConcerns-DvSt_dLx.js","/assets/CellDetails-BqUXJb2X.js","/assets/CellFormModal-3OMt2DWL.js","/assets/CellLink-CqASBjNh.js","/assets/Cells-Lh_BYDO6.js","/assets/ColumnFilter-sV3vNYvJ.js","/assets/ColumnsPicker-DQVzR8Sw.js","/assets/CommentsModal-BOJ-VZd7.js","/assets/ComparisonTable-BgOMkwzm.js","/assets/Concerns-CvEc1QiT.js","/assets/ConfirmDialog-CK0u_CpZ.js","/assets/Daily-197BJ0AR.js","/assets/DataTable-K6eJbpae.js","/assets/DateRangePicker-_61Plb0C.js","/assets/DayReportView-DqVatGGZ.js","/assets/DayStepper-C8f6wiWy.js","/assets/DifferenceBreakdown-BkYn3qev.js","/assets/Downtime-FrsSWoLg.js","/assets/Education-Ffk4Knah.js","/assets/EducationLesson-XA3NDQZ7.js","/assets/EmptyState-CvthaQIS.js","/assets/Exam-BHjZRC0G.js","/assets/FactorySelect-B6lpjzv7.js","/assets/Gamification-BHsCV7qJ.js","/assets/GroupBadge-Cjy-I1YA.js","/assets/HeatmapChart-hEpQJn-p.js","/assets/IdleCell-DgG3CuX0.js","/assets/KPICard-BYVvf9-r.js","/assets/Kaizen-D8tW--TM.js","/assets/KpiDeltaCard-Bmk9WrR7.js","/assets/LangTextInput-D0OI6-KD.js","/assets/Layout-E-NLMq3Y.js","/assets/LeaderDayReport-B-Cf9nSg.js","/assets/LeaderUnitReport-lBzkejnj.js","/assets/Leaderboard-BSrxHLk6.js","/assets/Leaders-urz5MWhd.js","/assets/LiveOverview-ByEcrhCa.js","/assets/Login-XB1pMuDZ.js","/assets/NotFound-BGq6S2Vi.js","/assets/Overview-BQW7S-rM.js","/assets/Pagination-DzPl4c_T.js","/assets/PerenaladkaFactTable-q0vWMAei.js","/assets/PlanFulfillment-DU3ZEeAr.js","/assets/Production-NpkK_B45.js","/assets/Profile-DdSzmkD8.js","/assets/ProofCamera-BmOXkuVK.js","/assets/Quality-CEs_zIbB.js","/assets/RequestStateChip-B885pWRx.js","/assets/RichTextEditor-C0r94otr.js","/assets/SearchInput-sbP3Ds_I.js","/assets/SeasonalityHeatmap-Cr7uorLm.js","/assets/SegmentedToggle-n0yKssuh.js","/assets/SetupTimes-aH0tzrRl.js","/assets/ShiftDaily-qH2WoWrr.js","/assets/Staff-FtrdYWIa.js","/assets/StatusBadge-B4AlFygw.js","/assets/Targets-etIqFZye.js","/assets/Tasks-J38HtNSj.js","/assets/TimeWheelPicker-ClHzXaqt.js","/assets/Tooltip-X3VSD1fJ.js","/assets/TrendChart-BUxSveV-.js","/assets/TripleSpeedometer-Cf85tojY.js","/assets/Trudoyomkost-Bt5bUMEi.js","/assets/UsersActivity-BoA7Hkvp.js","/assets/WatchProgress-SnO0Thxg.js","/assets/WebLogin-BdGKTFtM.js","/assets/WorkerConcerns-DRCfWKs1.js","/assets/Workers-DafKCyYM.js","/assets/Zagruzka-DGlaHwTO.js","/assets/ZagruzkaCell-Bf8wEmFT.js","/assets/alarm-clock-D8nrncga.js","/assets/api-cTM4ZhxX.js","/assets/archive-CBgeXibK.js","/assets/archive-restore-BtTEucV0.js","/assets/arrow-down-B1AydB54.js","/assets/arrow-left-eHHNLoAh.js","/assets/arrow-left-right-BUcMOWME.js","/assets/arrow-up-DKuFC-MY.js","/assets/arrow-up-right-DyD4gK6C.js","/assets/award-BKrhP3vf.js","/assets/ban-MdLzoPZq.js","/assets/bot-CC4DYIqD.js","/assets/boxes-D64y2-5u.js","/assets/brigadirFilters-CZwZhlQW.js","/assets/broadcastTree-BeoP1d0O.js","/assets/building-2-Cdxkogja.js","/assets/calendar-CCOMdPNr.js","/assets/calendar-clock-8xXssHYW.js","/assets/calendar-days-DxnsyvRU.js","/assets/calendar-range-B04rlh2G.js","/assets/camera-f6UbwiRC.js","/assets/categories-BrrvpRoH.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B-0k6EcE.js","/assets/chart-line-Oj5RAnjH.js","/assets/chart-pie-EKl-AWRl.js","/assets/chartRange-C6bvmpH5.js","/assets/check-check-k4q91ksr.js","/assets/chevron-left-CVb-xxe_.js","/assets/chevrons-up-down-RJt_FJXp.js","/assets/circle-check-big-CGu8ooZF.js","/assets/circle-dashed-D1FSvNjb.js","/assets/circle-dot-DQtBcNbr.js","/assets/circle-minus-DRQAlVvr.js","/assets/circle-slash-DGh1viCx.js","/assets/circle-user-round-upTVksf1.js","/assets/coins-BoMlElIO.js","/assets/compass-BFiks78d.js","/assets/concernCategories-C9L3hiKz.js","/assets/copy-CY8srzlh.js","/assets/corner-down-right-BiRdRkIZ.js","/assets/createLucideIcon-CWMdTtPS.js","/assets/exportXlsx-D4rrTpKV.js","/assets/external-link-BAdJMHa3.js","/assets/file-clock-_fZHB4sL.js","/assets/file-spreadsheet-DsIGVgyc.js","/assets/file-text-Cv6LL7YU.js","/assets/flag-g16jn7_P.js","/assets/flame-Ded5cpMQ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-O-NFixc1.js","/assets/hash-SOjaAIqu.js","/assets/history-Bx5ILyiG.js","/assets/hourglass-8Xz8gc0N.js","/assets/image-DRPkogkV.js","/assets/image-off-Cwa5eNWx.js","/assets/index-BMCZProW.css","/assets/index-CEmdDJmK.js","/assets/keyboard-oDcnH3We.js","/assets/languages-BtH9tdr5.js","/assets/layers-BFRWqpT6.js","/assets/leaderReason-Co7IeUzn.js","/assets/lightbulb-BXGJa7xV.js","/assets/link-2-DlEcKatH.js","/assets/list-checks-C-iWEArh.js","/assets/list-ordered-DKMqu5UW.js","/assets/lock-open-8CSWhxYf.js","/assets/log-in-BDlGwYzV.js","/assets/message-square-Bq4IYul8.js","/assets/minimize-2-D3ZVb31-.js","/assets/paperclip-teprmYxX.js","/assets/pencil-ALNQNSlr.js","/assets/personName-B4KId4zS.js","/assets/pin-PU69PjNJ.js","/assets/play-DSN7Wnss.js","/assets/presentation-BNHi-T9f.js","/assets/prop-types-DvbdhpsR.js","/assets/radio-ad8-Tath.js","/assets/react-apexcharts.esm-Cv_yuE1B.js","/assets/repeat-Jk7gzYEq.js","/assets/rotate-ccw-2YU1zKxi.js","/assets/rotate-cw-DmDFgAwm.js","/assets/save-KCEWsh-q.js","/assets/scale-B-Arl-S9.js","/assets/scroll-text-C9y1WPwS.js","/assets/search-x-Ck9MAVND.js","/assets/segments-CM_dYjix.js","/assets/send-CpqlPBuX.js","/assets/settings-2-B6vRdQrb.js","/assets/shield-Cc5x3eSZ.js","/assets/shield-alert-DYB8L_Np.js","/assets/shield-check-BTayj79X.js","/assets/shield-question-mark-DNVgYH7n.js","/assets/siren-BZSYCQ9P.js","/assets/smartphone-2cSrrtNX.js","/assets/snowflake-Rs5fQHO4.js","/assets/square-BU2YQjdu.js","/assets/square-check-big-BW5TjPcM.js","/assets/star-Bmp0Tj6o.js","/assets/statusBands-DHN7qt-K.js","/assets/table-2-DJeJnOCW.js","/assets/tag-D2dUwIaP.js","/assets/trending-down-BIATXPtU.js","/assets/trending-up-CaP2CfqI.js","/assets/triangle-alert-CKZ8LmQt.js","/assets/undo-2-B8orQeOS.js","/assets/useChartTheme-D4JcW1XB.js","/assets/useElementWidth-ClP-TOfF.js","/assets/useIsMobile-BaexSnEg.js","/assets/useMutation-C1faDNgL.js","/assets/useStatusBands-M2ksAO01.js","/assets/user-D5kU-oFp.js","/assets/user-check-C39S7n8N.js","/assets/user-cog-Cw_mimB8.js","/assets/user-minus-9Spa4eTI.js","/assets/users-DQvgwkhN.js","/assets/verifyState-BIFreuKS.js","/assets/video-Canc-3LQ.js","/assets/warehouse-JZPVwYXS.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
