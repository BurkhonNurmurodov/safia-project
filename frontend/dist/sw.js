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

const BUILD = "2026-09-30T06:05:31.515Z";
const PRECACHE = ["/","/assets/AdminPanel-CFN0xpz3.js","/assets/AnalysisBoard-j2P9fg9j.js","/assets/Arc-BTKPaecy.js","/assets/ArcLegacy-BNAZf8fh.js","/assets/AttendanceModal-BWHRixDM.js","/assets/BrigadirProfile-Sy8bwPwr.js","/assets/BroadcastReceivers-BXdWz19K.js","/assets/BroadcastRecord-BJV2lF8A.js","/assets/CatLockNotice-y1DZzXQt.js","/assets/CategoryLegendModal-Ba0DY91u.js","/assets/CellConcerns-WShgTIAc.js","/assets/CellDetails-cOpFwR32.js","/assets/CellFormModal-CTBMde8Q.js","/assets/CellLink-D0zJCnXx.js","/assets/Cells-BU5zJztJ.js","/assets/ColumnFilter-6wU7-h-f.js","/assets/ColumnsPicker-D5NI_zM6.js","/assets/CommentsModal-CijGCkxQ.js","/assets/ComparisonTable-D2W_Kd2q.js","/assets/Concerns-BuwaSlqs.js","/assets/ConfirmDialog-CmRoIDH9.js","/assets/Daily-ij56FUEt.js","/assets/DataTable-FRBXZLHA.js","/assets/DateRangePicker-Ci9tNbwb.js","/assets/DayReportView-BvJAA1aW.js","/assets/DayStepper-LECs8QFN.js","/assets/DifferenceBreakdown-BaLXVzTh.js","/assets/Downtime-DcQUAelP.js","/assets/Education-Bzwr_xSR.js","/assets/EducationLesson-Dz6VXo6r.js","/assets/EmptyState-EB31LXzX.js","/assets/Exam-CxpsY81e.js","/assets/FactorySelect-C8L26OUW.js","/assets/Gamification-BCL9u-hT.js","/assets/GroupBadge-Tgmw0OrM.js","/assets/HeatmapChart-DrfTrQyT.js","/assets/IdleCell-DNfAh5Po.js","/assets/KPICard-D1iAG_Jm.js","/assets/Kaizen-HS6mXAeE.js","/assets/Kelish-BGQCs5Xe.js","/assets/KpiDeltaCard-CVb5yOy6.js","/assets/LangTextInput-DDQqb4ur.js","/assets/Layout-BMA1pK4W.js","/assets/LeaderAppeal-BsOFWknl.js","/assets/LeaderDayReport-9BSf6j89.js","/assets/LeaderUnitReport-YdWnil40.js","/assets/Leaderboard-uXWd2Wow.js","/assets/Leaders-uJw-3hR2.js","/assets/Lightbox-DWd4KMIA.js","/assets/LiveOverview-Bfn-V4m1.js","/assets/Login-v6SxtXF1.js","/assets/NotFound-C0IytWEi.js","/assets/Overview-71cZObsD.js","/assets/Pagination-BzyeoKUs.js","/assets/PerenaladkaFactTable-DxEAoq0D.js","/assets/PlanFulfillment-DiZQAXyb.js","/assets/Production-B9b7xh9u.js","/assets/Profile-D_wKMkED.js","/assets/ProofCamera-Lbxp0z1_.js","/assets/ProofPhoto-Cah0-3tq.js","/assets/Quality-Cpf34S4d.js","/assets/RequestStateChip-DoPf_VF9.js","/assets/RichTextEditor-DNSkPhFI.js","/assets/SaveState-BYUOJVHB.js","/assets/SearchInput-L84Pd701.js","/assets/SeasonalityHeatmap-B1E5B4jT.js","/assets/SegmentedToggle-B9OrdFyz.js","/assets/SetupTimes-9uUH8-YZ.js","/assets/ShiftDaily-BW1UUnAC.js","/assets/Staff-Cos6Vb6J.js","/assets/StatusBadge-C_CwjHR9.js","/assets/TargetGoal-Drd-jhn2.js","/assets/Targets-PQ6BOrD9.js","/assets/Tasks-BJ7JDKsT.js","/assets/TimeWheelPicker-BuzReM6p.js","/assets/Tooltip-7ZrRHc5j.js","/assets/TrendChart-C_a0XemE.js","/assets/TripleSpeedometer-vhUI8Bs7.js","/assets/Trudoyomkost-BqEi4xwX.js","/assets/UploadDropzone-g6nk9lhh.js","/assets/UsersActivity-PWHabIVS.js","/assets/VerdictBlock-w6M0WYqE.js","/assets/WatchProgress-DA2fb4ws.js","/assets/WebLogin-cxqpgAfn.js","/assets/WorkerConcerns-D6O5psYQ.js","/assets/Workers-aMCs-SJN.js","/assets/Zagruzka-tOkC-fdf.js","/assets/ZagruzkaCell-BzlbuwhT.js","/assets/api-Cif2-kme.js","/assets/archive-CaPJpkTv.js","/assets/archive-restore-DCg3Derx.js","/assets/arrow-down-DDyLc77x.js","/assets/arrow-left-DCH-zGLW.js","/assets/arrow-left-right-CDG9kWr9.js","/assets/arrow-up-C-CPiFR2.js","/assets/arrow-up-narrow-wide-6c8bBK_0.js","/assets/arrow-up-right-DWa9LBye.js","/assets/award-CAgS0t5F.js","/assets/ban-ztANtrpO.js","/assets/bot-CiIJWzf9.js","/assets/boxes-D404EMJu.js","/assets/brigadirFilters-B9z0pxsJ.js","/assets/broadcastTree-DDXv3CyD.js","/assets/building-2-BBUihWeo.js","/assets/calendar-CfJXwIzj.js","/assets/calendar-clock-iL42Al_r.js","/assets/calendar-days-B5DyhUvL.js","/assets/calendar-range-DuT_Ydf1.js","/assets/camera-Bzs1j84m.js","/assets/categories-FW6OpxSO.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-SW1t4jHR.js","/assets/chart-line-DawV5sOe.js","/assets/chart-pie-CjtgTOra.js","/assets/chartRange-DGHuYfn2.js","/assets/chevron-left-eAfKvI2r.js","/assets/chevrons-up-down-USvt8-ES.js","/assets/circle-check-big-BW9jv79O.js","/assets/circle-dot-WJ2OWavc.js","/assets/circle-minus-Cmpy6Y5B.js","/assets/circle-slash-BMQiv68Q.js","/assets/circle-user-round-h8Jyu7I7.js","/assets/circle-zZHH0ILK.js","/assets/cloud-off-fRTrvEvq.js","/assets/cloud-upload-DrIDV0NS.js","/assets/compass-CHfTNekN.js","/assets/concernCategories-C9NnqDcD.js","/assets/copy-B2Vptsv6.js","/assets/corner-down-right-BuSqWq8L.js","/assets/createLucideIcon-Pi8Wwp5i.js","/assets/es-CdoN201M.js","/assets/exportXlsx-DMH_y9Fy.js","/assets/external-link-V3gzAcw1.js","/assets/file-clock-CHXS9mvx.js","/assets/file-exclamation-point-qIuKc7dt.js","/assets/file-spreadsheet-DHXqMi0U.js","/assets/file-text-DTnnKDyH.js","/assets/flag-DDONZwUp.js","/assets/flame-BHKBfMWF.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BPhOLamD.js","/assets/hash-C_BAdMH2.js","/assets/history-CGZo5iBc.js","/assets/hourglass-BIkVAr5p.js","/assets/image-BUL5Zk5L.js","/assets/image-off-7EL05KZn.js","/assets/index-B8JHyLjE.css","/assets/index-CoNKwdId.js","/assets/key-round-BNUmLQyB.js","/assets/keyboard-DQjlqZCY.js","/assets/languages-BNKO7MlW.js","/assets/layers-2RWbCRM6.js","/assets/lightbulb-CponC9I5.js","/assets/link-2-BIXahJlE.js","/assets/link-2-off-DtC4hMu4.js","/assets/list-checks-Bwp_Algh.js","/assets/list-ordered-_kfHjthJ.js","/assets/list-tree-B2wHsAFk.js","/assets/lock-open-BJ7-sZWh.js","/assets/log-in-VhS3luDa.js","/assets/maximize-2-Cbp5oRhJ.js","/assets/message-square-tRSBdfBH.js","/assets/minimize-2-BcWxBuso.js","/assets/package-check-CLhPB3Fu.js","/assets/paperclip-wEGga89A.js","/assets/pencil-ie5QcgD0.js","/assets/percent-CL9f4_vH.js","/assets/personName-CogOuS3K.js","/assets/pin-Cs3W-6wc.js","/assets/pin-off-DIp-H-6i.js","/assets/play-9ta5BEy4.js","/assets/presentation-CMF_CFJg.js","/assets/prop-types-CilNolrL.js","/assets/radio-KKojW12K.js","/assets/react-apexcharts.esm-D-HD3DuZ.js","/assets/repeat-Dd_UkKOJ.js","/assets/rotate-ccw-BQ7mjJUs.js","/assets/rotate-cw-BKDUjIUk.js","/assets/save-B0M2xFCT.js","/assets/scale-BW3G07Dw.js","/assets/scroll-text-BSz_1HMp.js","/assets/search-x-BzVoQT87.js","/assets/segments-Bet-6Xgd.js","/assets/send-qyQ2vraV.js","/assets/settings-2-SdUxxsgy.js","/assets/shield-Cz10dV23.js","/assets/shield-alert-CDCzJXKf.js","/assets/shield-check-BbLJO8av.js","/assets/shield-question-mark-DnrBHYIL.js","/assets/siren-fNIu8Q1J.js","/assets/snowflake-DbJp_7V1.js","/assets/square-C7y3wOP6.js","/assets/square-check-big-BzEYeJEt.js","/assets/star-gMf8IAqC.js","/assets/statusBands-DRkrMsC5.js","/assets/store-DH-gyrnU.js","/assets/table-2-WOKk7eEl.js","/assets/table-properties-DU-2_GHh.js","/assets/tag-q4I18N8g.js","/assets/timer-off-B0GzetiR.js","/assets/trending-down-BpjYjZBz.js","/assets/trending-up-DT2t5lQZ.js","/assets/undo-2-CtlYEiPA.js","/assets/useChartTheme-3Y0iHiJI.js","/assets/useElementWidth-CpOEARfG.js","/assets/useIsMobile-BCOErmk8.js","/assets/useMutation-C_fEDaML.js","/assets/useStatusBands-BvwTmv5Q.js","/assets/user-DBKVMh1R.js","/assets/user-cog-C6Xci1fx.js","/assets/user-minus-vHQDmlHk.js","/assets/users-Dw7vrLQI.js","/assets/video-BcZ4R7oi.js","/assets/wallet-B87jT-Ne.js","/assets/warehouse-BhTz_rUC.js","/assets/zap-yWm688N2.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
