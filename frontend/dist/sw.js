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

const BUILD = "2026-09-25T13:16:41.144Z";
const PRECACHE = ["/","/assets/AdminPanel-B-DlK8QM.js","/assets/AnalysisBoard-DDzeef_0.js","/assets/Arc-CppXqzOJ.js","/assets/ArcLegacy-FP_SLn_W.js","/assets/AttendanceModal-FlgSDxHz.js","/assets/BrigadirProfile-rgE-pYFO.js","/assets/BroadcastReceivers-B_DLw8ZH.js","/assets/BroadcastRecord-T6LlEoj8.js","/assets/CatLockNotice-DIXJ5a-k.js","/assets/CategoryLegendModal-Cg6-fvSb.js","/assets/CellConcerns-CBYhpSw4.js","/assets/CellDetails-Co17B9P6.js","/assets/CellFormModal-DHSMsa1d.js","/assets/CellLink-B57JHoBn.js","/assets/Cells-fOqs8SLA.js","/assets/ColumnFilter-BPSEbp35.js","/assets/ColumnsPicker-Dv3Oe1GZ.js","/assets/CommentsModal-mQolgiIS.js","/assets/ComparisonTable-BWDOoKQ3.js","/assets/Concerns-_yXkCGOO.js","/assets/ConfirmDialog-CXLX33a8.js","/assets/Daily-7znYx2GW.js","/assets/DataTable-B53hGKAA.js","/assets/DateRangePicker-Bs5Sw2Gq.js","/assets/DayReportView-CK32FPlg.js","/assets/DayStepper-BZ6dwYSs.js","/assets/DifferenceBreakdown-C_9fNh2U.js","/assets/Downtime-DLq5Rwb6.js","/assets/Education-BTp35nrq.js","/assets/EducationLesson-BV_noYfx.js","/assets/EmptyState-9SBX_M8B.js","/assets/Exam-DRFMewJn.js","/assets/FactorySelect-BLs8FuD5.js","/assets/Gamification-CgRzvrbT.js","/assets/GroupBadge-DxlAXVE6.js","/assets/HeatmapChart-1QApvqCZ.js","/assets/IdleCell-Bip2R6Dm.js","/assets/KPICard-CVhfaOYD.js","/assets/Kaizen-CSQfQyCB.js","/assets/KpiDeltaCard-Bu2kfoMd.js","/assets/LangTextInput-CNK17O1j.js","/assets/Layout-BsvWaVO1.js","/assets/LeaderDayReport-DXVnQlDB.js","/assets/LeaderUnitReport-glkQX-cK.js","/assets/Leaderboard-XRvURvdO.js","/assets/Leaders-CCR4OJoN.js","/assets/LiveOverview-BLNyga5n.js","/assets/Login-BxM9ICYw.js","/assets/NotFound-BApa0UvT.js","/assets/Overview-CzLk8SZo.js","/assets/Pagination-BDo_xbfV.js","/assets/PerenaladkaFactTable-BHfmIezg.js","/assets/PlanFulfillment-CQaiC-E8.js","/assets/Production-CuamGpyS.js","/assets/Profile-CtjI7Mlq.js","/assets/ProofCamera-zZjPPM3W.js","/assets/Quality-DocElm2e.js","/assets/RequestStateChip-CCXrEG4K.js","/assets/RichTextEditor-BX6HLvOK.js","/assets/SearchInput-DU3XfkZo.js","/assets/SeasonalityHeatmap-C5Rsb58Z.js","/assets/SegmentedToggle-CztAZqdR.js","/assets/SetupTimes-CiR0YOa-.js","/assets/ShiftDaily-CRZvzI7n.js","/assets/Staff-CMrWWZ_O.js","/assets/StatusBadge-Bd7D_RoO.js","/assets/Targets-B29VbfL3.js","/assets/Tasks-BvZMs_8k.js","/assets/TimeWheelPicker-C-g40QaX.js","/assets/Tooltip-BpE4Przc.js","/assets/TrendChart-D4UPl9mz.js","/assets/TripleSpeedometer-CZtncxAJ.js","/assets/Trudoyomkost-DJRpz0e-.js","/assets/UsersActivity-Dat3cVK_.js","/assets/WatchProgress-b1C4mx6m.js","/assets/WebLogin-C6cstFCw.js","/assets/WorkerConcerns-DqhK5-zM.js","/assets/Workers-CLfKZXeP.js","/assets/Zagruzka-tODeFCzS.js","/assets/ZagruzkaCell-2SH2wixj.js","/assets/alarm-clock-DY5Yr6e7.js","/assets/api-D38LaQYW.js","/assets/archive-DWNZTIGS.js","/assets/archive-restore-cGNiFdys.js","/assets/arrow-down-Dfu_RMtp.js","/assets/arrow-left-CVFdTr4M.js","/assets/arrow-left-right-DZoSyM85.js","/assets/arrow-up-DjoCtKs6.js","/assets/arrow-up-right-DzOYZBC_.js","/assets/award-Bj_YhjuT.js","/assets/ban-B8XlQTpD.js","/assets/bot-Cw1j96X6.js","/assets/boxes-CM2P7me8.js","/assets/brigadirFilters-B8sGdKu7.js","/assets/broadcastTree-C1USz61L.js","/assets/building-2-G0jzbWG5.js","/assets/calendar-Dwlwf0un.js","/assets/calendar-clock-Bq10BxYF.js","/assets/calendar-days-momRfXuQ.js","/assets/calendar-range-BhVLXJ7k.js","/assets/camera-CFU9XbKQ.js","/assets/categories-D4D9T4Jx.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CFBhABIj.js","/assets/chart-line-DWF30CME.js","/assets/chart-pie-CAV3Nhmo.js","/assets/chartRange-CXNYTxnO.js","/assets/check-check-BRxKjiTq.js","/assets/chevron-left-OFDw41Lr.js","/assets/chevrons-up-down-DpnopdQR.js","/assets/circle-check-big-Cek0bQnz.js","/assets/circle-dashed-C_lfXWKk.js","/assets/circle-dot-C5qihEEx.js","/assets/circle-minus-llP4q42h.js","/assets/circle-slash-DFxJ7lKa.js","/assets/circle-user-round-RqmiMEBY.js","/assets/coins-DIFHRdOs.js","/assets/compass-CuKfDVyd.js","/assets/concernCategories-CxWEg9Me.js","/assets/copy-CasFKBtM.js","/assets/corner-down-right-Dy653Jvx.js","/assets/createLucideIcon-CpoyNBiu.js","/assets/exportXlsx-B9vrvgwS.js","/assets/external-link-C4LW9cG4.js","/assets/file-clock-Bx3P-Hh4.js","/assets/file-exclamation-point-aX-VDqiN.js","/assets/file-spreadsheet-DTlsTOrV.js","/assets/file-text-9XfUmcFE.js","/assets/flag-CzES0R_2.js","/assets/flame-4NmUsOaQ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CZmJPFuX.js","/assets/hash-BUFvyAcA.js","/assets/history-4Rv77lWc.js","/assets/hourglass-D1ZHaAcS.js","/assets/image-C2ZOBp-t.js","/assets/image-off-DvAkhCVS.js","/assets/index-BXerlAXJ.js","/assets/index-BkM5tC4R.css","/assets/key-round-hlw-Igkz.js","/assets/keyboard-CfQaNirD.js","/assets/languages-BUG2CZ_A.js","/assets/layers-0ANNnLxU.js","/assets/leaderReason-DSg4xGUS.js","/assets/lightbulb-CbaCWYAn.js","/assets/link-2-YX8m8WuO.js","/assets/list-checks-DgkI__Mr.js","/assets/list-ordered-DjFcx_EH.js","/assets/list-tree-B9Uaw9y7.js","/assets/lock-open-DkE_I_vJ.js","/assets/log-in-DttROpPj.js","/assets/message-square-zH3YlD4f.js","/assets/minimize-2-Ba3iwl-T.js","/assets/package-check-DNJcYw95.js","/assets/paperclip-SMBLOvVG.js","/assets/pencil-BoRzyQDz.js","/assets/personName-B4KId4zS.js","/assets/pin-ErHsLfQG.js","/assets/play-nBgmGCpd.js","/assets/presentation-a7Y6AWPQ.js","/assets/prop-types-DSfhjAiU.js","/assets/radio-CGMwiprR.js","/assets/react-apexcharts.esm-BdOrpJFF.js","/assets/repeat-BAd01dFW.js","/assets/rotate-ccw-B6xK8TaU.js","/assets/rotate-cw-JoGAJX8Q.js","/assets/save-DRu8n2BG.js","/assets/scale-CK8FiDSW.js","/assets/scroll-text-CW-We5_k.js","/assets/search-x-uqW1n3hh.js","/assets/segments-DXVNbMif.js","/assets/send-Dj8e69N5.js","/assets/settings-2-DUqvzoCZ.js","/assets/shield-E4L6DivU.js","/assets/shield-alert-D1UgHRjq.js","/assets/shield-check-BVKG9t76.js","/assets/shield-question-mark-BpQThy0L.js","/assets/siren-BNKnsI8E.js","/assets/smartphone-BMOx6EaM.js","/assets/snowflake-cik5Youd.js","/assets/square-BvGiuy9u.js","/assets/square-check-big-Cq2qS2UB.js","/assets/star-TdDeT3Ia.js","/assets/statusBands-BOepl_ef.js","/assets/store-Bh5oelb4.js","/assets/table-2-CVKHzWPf.js","/assets/tag-4GkJKMtP.js","/assets/trending-down-DjqeeVBb.js","/assets/trending-up-q1ihmC4a.js","/assets/triangle-alert-B36xAt5z.js","/assets/undo-2-Ce9MM_1t.js","/assets/useChartTheme-cph491HF.js","/assets/useElementWidth-ClKjIANG.js","/assets/useIsMobile-BeDbqmgL.js","/assets/useMutation-DJCpo3a3.js","/assets/useStatusBands-B97y3XNe.js","/assets/user-BT64cGsR.js","/assets/user-check-ChHTA_tI.js","/assets/user-cog-iehJ2sFz.js","/assets/user-minus-C9W8599I.js","/assets/users-D261eYHf.js","/assets/verifyState--NIqiFKV.js","/assets/video-CGNy6gSk.js","/assets/warehouse-FooCDWD9.js","/assets/zap-BRDPJM2L.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
