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

const BUILD = "2026-09-26T12:19:29.775Z";
const PRECACHE = ["/","/assets/AdminPanel-Bwzi_QXF.js","/assets/AnalysisBoard-BtDcsRjG.js","/assets/Arc-DtW1RR7f.js","/assets/ArcLegacy-BJPECTP6.js","/assets/AttendanceModal-CfhnNNXh.js","/assets/BrigadirProfile-BukHxyHV.js","/assets/BroadcastReceivers-17aoGlA9.js","/assets/BroadcastRecord-BAr6pKn2.js","/assets/CatLockNotice-DbKbPaVi.js","/assets/CategoryLegendModal-DaNMf76B.js","/assets/CellConcerns-CzgUj01u.js","/assets/CellDetails-CRCBrO6B.js","/assets/CellFormModal-BO3VIegS.js","/assets/CellLink-BNHSHCiW.js","/assets/Cells-DsUrCpf6.js","/assets/ColumnFilter-BCWfsVmG.js","/assets/ColumnsPicker-B89qyi-j.js","/assets/CommentsModal-Czyj-iGr.js","/assets/ComparisonTable-BkcF5DB8.js","/assets/Concerns-C78wP1Wb.js","/assets/ConfirmDialog-DZ1TkwvT.js","/assets/Daily-CI2uicIH.js","/assets/DataTable-Bkw3JzvJ.js","/assets/DateRangePicker-lH7ONqAG.js","/assets/DayReportView-i9wT5YoP.js","/assets/DayStepper-CHe2ZJ23.js","/assets/DifferenceBreakdown-JG7SzOMP.js","/assets/Downtime-68l5C6J5.js","/assets/Education-DavsRG6Y.js","/assets/EducationLesson-C3F9DXq1.js","/assets/EmptyState-DcFmyguB.js","/assets/Exam-CirW3A4l.js","/assets/FactorySelect-DK_Q2T6p.js","/assets/Gamification-iElZ3BDX.js","/assets/GroupBadge-BM4aG4qA.js","/assets/HeatmapChart-DvwHc09K.js","/assets/IdleCell-_nzh-Y-H.js","/assets/KPICard-CKxy0lC9.js","/assets/Kaizen-3ziEwNGp.js","/assets/KpiDeltaCard-DwWb6gdh.js","/assets/LangTextInput-2OgGZ2na.js","/assets/Layout-C-rjV-AJ.js","/assets/LeaderAppeal-C4Gl938S.js","/assets/LeaderDayReport-Djg4mCrO.js","/assets/LeaderUnitReport-nGlhiu0A.js","/assets/Leaderboard-CHB7sxa3.js","/assets/Leaders-wR548-Ha.js","/assets/Lightbox-B-RnEBz8.js","/assets/LiveOverview-Bmhya_ur.js","/assets/Login-DggcNd4S.js","/assets/NotFound-CX0Srp8S.js","/assets/Overview-BXgHf928.js","/assets/Pagination-BMYC4Sc5.js","/assets/PerenaladkaFactTable-T0K7SLO1.js","/assets/PlanFulfillment-BJlwsw6e.js","/assets/Production-BdjHoJLH.js","/assets/Profile-D7ADWDtw.js","/assets/ProofCamera-D3Rnk20g.js","/assets/ProofPhoto-BIzKgWVt.js","/assets/Quality-DBno44Ni.js","/assets/RequestStateChip-Dde26s3y.js","/assets/RichTextEditor-C9Lt218f.js","/assets/SaveState-2zaTi5yY.js","/assets/SearchInput-B4j_lFsR.js","/assets/SeasonalityHeatmap-DNcXbDgv.js","/assets/SegmentedToggle-94YSJhyt.js","/assets/SetupTimes-BN2SJwuc.js","/assets/ShiftDaily-hEm0MLZu.js","/assets/Staff-C29xOOs4.js","/assets/StatusBadge-CkCywPX9.js","/assets/TargetGoal-BqYlqCrn.js","/assets/Targets-03NnDJAv.js","/assets/Tasks-DcSLtQ8B.js","/assets/TimeWheelPicker-CcRTKym-.js","/assets/Tooltip-CP-VaMTb.js","/assets/TrendChart-DEYla6yA.js","/assets/TripleSpeedometer-CNYTHkJR.js","/assets/Trudoyomkost-O8YeRxef.js","/assets/UsersActivity-iWUUjMHn.js","/assets/WatchProgress-DpbOQnd1.js","/assets/WebLogin-EubdIZH4.js","/assets/WorkerConcerns-CDFLU0KY.js","/assets/Workers-B-LXuL71.js","/assets/Zagruzka-DqIaalPT.js","/assets/ZagruzkaCell-CgcTwi5v.js","/assets/alarm-clock-DDE5Ncvg.js","/assets/api-0co_8eU1.js","/assets/archive-C9_J2qHc.js","/assets/archive-restore-Bdkuq_um.js","/assets/arrow-down-7XpTSfR2.js","/assets/arrow-left-k26NOzuP.js","/assets/arrow-left-right-DL_gmuHg.js","/assets/arrow-up-D7garD48.js","/assets/arrow-up-right-BbeuXZYB.js","/assets/award-DXyOC7Rd.js","/assets/ban-AkzwB2Rp.js","/assets/bot-DTIOYyCV.js","/assets/boxes-DIqIthMV.js","/assets/brigadirFilters-zzWlMSlc.js","/assets/broadcastTree-q0ezweg9.js","/assets/building-2-CRrqaSMU.js","/assets/calendar-BKqMn8cQ.js","/assets/calendar-clock-Diyez2bm.js","/assets/calendar-days-C6uqVs43.js","/assets/calendar-range-C_WqCPje.js","/assets/camera-DYy8zd2Y.js","/assets/categories-C4vI7vSf.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-QNIGKcbs.js","/assets/chart-line-D_yqjcNy.js","/assets/chart-pie-DO-By963.js","/assets/chartRange-Dkl5FJG_.js","/assets/chevron-left-DkJRWAVC.js","/assets/chevrons-up-down-Bat6LQ3r.js","/assets/circle-check-big-DgoHGJTe.js","/assets/circle-dot-CjPr-64h.js","/assets/circle-minus-DWa3D4RP.js","/assets/circle-slash-CUYoCG_G.js","/assets/circle-user-round-DvWlix5K.js","/assets/cloud-off-DGiArUsG.js","/assets/cloud-upload-A_QbQV1K.js","/assets/compass-BY1YTWsP.js","/assets/concernCategories-DPt6qh3Q.js","/assets/copy-DfF__5Ig.js","/assets/corner-down-right-BnEL-g2I.js","/assets/createLucideIcon-Cskwi0wJ.js","/assets/es-CNdQ9vK7.js","/assets/exportXlsx-CHTrpO4H.js","/assets/external-link-DxPPZL7q.js","/assets/file-clock-B0toHK73.js","/assets/file-exclamation-point-pV1CYFJv.js","/assets/file-spreadsheet-BcF2TMFb.js","/assets/file-text-CA6Iui7G.js","/assets/flag-YgHbo4sf.js","/assets/flame-_JbV8F2O.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CYC-O3P5.js","/assets/hash-hpFwjj8C.js","/assets/history-DirflJVW.js","/assets/hourglass-DNmtI7Xv.js","/assets/image-fYJ61KQl.js","/assets/image-off-BGcK-VRz.js","/assets/index-BqO_Gouh.css","/assets/index-DihZFh-C.js","/assets/key-round-BqqtlB_M.js","/assets/keyboard-Mm5fcmaD.js","/assets/languages-KwOp1yKp.js","/assets/layers-aj8GML87.js","/assets/leaderReason-j41ieZHZ.js","/assets/lightbulb-B1Wj2vjj.js","/assets/link-2-D0mQeKKo.js","/assets/list-checks-Y0ViH8-N.js","/assets/list-ordered-DakUxyBj.js","/assets/list-tree-CWKYwSPV.js","/assets/lock-open-1Ie0a1ov.js","/assets/log-in-Btu6RKjm.js","/assets/message-square-9-adFzJq.js","/assets/minimize-2-B7tdgy2t.js","/assets/package-check-DyyjFFJ4.js","/assets/paperclip-CIqrhUYI.js","/assets/pencil-DGkLOiln.js","/assets/personName-B4KId4zS.js","/assets/pin-C8dhU3cW.js","/assets/pin-off-Dh0NwO6Z.js","/assets/play-C5Vi8Cij.js","/assets/presentation-CR1iNay6.js","/assets/prop-types-3OMfyPRh.js","/assets/radio-BHzfKXG7.js","/assets/react-apexcharts.esm-Bmv73x2Q.js","/assets/repeat-lo_Mco1g.js","/assets/rotate-ccw-Pyt02PUn.js","/assets/rotate-cw-BX9GCUrS.js","/assets/save-Bl9rdruw.js","/assets/scale-5pooktIr.js","/assets/scroll-text-XdDqm50m.js","/assets/search-x-C454uwHI.js","/assets/segments-DQqMdkUJ.js","/assets/send-Bixxusji.js","/assets/settings-2-BqVTLjX_.js","/assets/shield-B84LhS5O.js","/assets/shield-alert-BqftgooZ.js","/assets/shield-check-CbBLdN8C.js","/assets/shield-question-mark-0wj4irf1.js","/assets/siren-D1uMoYb1.js","/assets/smartphone-ZkRC3gGU.js","/assets/snowflake-DngVlnZq.js","/assets/square-DPXwLSyh.js","/assets/square-check-big-C5-C-IyV.js","/assets/star-BiWr9VvP.js","/assets/statusBands-BDweWVHm.js","/assets/store-DAowVNoL.js","/assets/table-2-DSsaQhxn.js","/assets/tag-BO5d6UOY.js","/assets/trending-down-azNhRZyO.js","/assets/trending-up-09i7I-27.js","/assets/undo-2-C1RIePwt.js","/assets/useChartTheme-BD-EjnSc.js","/assets/useElementWidth-CQGIh-Mb.js","/assets/useIsMobile-CykjYmjl.js","/assets/useMutation-CTO0MKl8.js","/assets/useStatusBands-DkuPjT74.js","/assets/user-XTMjp-zh.js","/assets/user-check-CNJSF-vs.js","/assets/user-cog-CN7is5L0.js","/assets/user-minus-Ccg3awnn.js","/assets/users-D-924T5Y.js","/assets/verifyState-BMIpDx9l.js","/assets/video-CvFKTATc.js","/assets/wallet-DSsKXTTq.js","/assets/warehouse-zgMAniXl.js","/assets/zap-BG8Pl4OG.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
