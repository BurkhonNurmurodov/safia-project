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

const BUILD = "2026-09-28T15:30:44.516Z";
const PRECACHE = ["/","/assets/AdminPanel-DL0TtU7y.js","/assets/AnalysisBoard-BrJ3iqBT.js","/assets/Arc-BT9hNkhv.js","/assets/ArcLegacy-COJk4kRj.js","/assets/AttendanceModal-bmKYf-MV.js","/assets/BrigadirProfile-zTu1Co2X.js","/assets/BroadcastReceivers-DOqU-jqW.js","/assets/BroadcastRecord-CG4mJgT8.js","/assets/CatLockNotice-C5ohg34m.js","/assets/CategoryLegendModal-CybvEz0M.js","/assets/CellConcerns-COvb72ky.js","/assets/CellDetails-GRBHiRn8.js","/assets/CellFormModal-DakDF7hd.js","/assets/CellLink-Bs3QZUcs.js","/assets/Cells-C4Bx0CEw.js","/assets/ColumnFilter-nDgGfEK4.js","/assets/ColumnsPicker-DzoPTino.js","/assets/CommentsModal-D1pjt4VE.js","/assets/ComparisonTable-T8khewtm.js","/assets/Concerns-DLuYFll4.js","/assets/ConfirmDialog-Bil4DFG6.js","/assets/Daily-BT6T-lmv.js","/assets/DataTable-CLno8MB2.js","/assets/DateRangePicker-DQMNkpfH.js","/assets/DayReportView-BohYYG_T.js","/assets/DayStepper-BuThMTEC.js","/assets/DifferenceBreakdown-BfhwJuQN.js","/assets/Downtime-CzpQ7sUI.js","/assets/Education-BSziJY9n.js","/assets/EducationLesson-Delyfew-.js","/assets/EmptyState-DawVuAPh.js","/assets/Exam-DlX4JMBt.js","/assets/FactorySelect-snzWH5tN.js","/assets/Gamification-BXQqHDqT.js","/assets/GroupBadge-CmmsNoxC.js","/assets/HeatmapChart-Bh9D_8c6.js","/assets/IdleCell-CwTirQlj.js","/assets/KPICard-vaMEF4ZE.js","/assets/Kaizen-Cw-f7QXO.js","/assets/Kelish-26lsImcb.js","/assets/KpiDeltaCard-3byQ-Kci.js","/assets/LangTextInput-D4XUomqP.js","/assets/Layout-DkjABk_1.js","/assets/LeaderAppeal-Cmz-kYE5.js","/assets/LeaderDayReport-HUUk_ljw.js","/assets/LeaderUnitReport-DCJ2QRej.js","/assets/Leaderboard-BUaMoz6Z.js","/assets/Leaders-Bkmp8TnU.js","/assets/Lightbox-B2MWqNpp.js","/assets/LiveOverview-Ckh2OCE0.js","/assets/Login-Cq0i2xTm.js","/assets/NotFound-BmOEUonc.js","/assets/Overview-CqPDBE1O.js","/assets/Pagination-BIDmFvBo.js","/assets/PerenaladkaFactTable-gEErJVFn.js","/assets/PlanFulfillment-yqNPqDFr.js","/assets/Production-DOlrEhim.js","/assets/Profile-Bu5gfbDR.js","/assets/ProofCamera-BIckgL4X.js","/assets/ProofPhoto-BlUNwXPK.js","/assets/Quality-CPIvKY7_.js","/assets/RequestStateChip-BzOPVNOg.js","/assets/RichTextEditor-DKGjCLN-.js","/assets/SaveState-NF-SoXud.js","/assets/SearchInput-Biqes_Z3.js","/assets/SeasonalityHeatmap-BObQJjcS.js","/assets/SegmentedToggle-DQITCLuG.js","/assets/SetupTimes-DXVLVJg3.js","/assets/ShiftDaily-Cfja_fIR.js","/assets/Staff-B36rTzEr.js","/assets/StatusBadge-D0VHlccY.js","/assets/TargetGoal-VSTUggtq.js","/assets/Targets-CIwI3KWs.js","/assets/Tasks-CKG_rcj-.js","/assets/TimeWheelPicker-CiNZNNnx.js","/assets/Tooltip-BkoJogSC.js","/assets/TrendChart-6AG9H4o2.js","/assets/TripleSpeedometer-Czr2Tej8.js","/assets/Trudoyomkost-EcsLXc1p.js","/assets/UploadDropzone-B8mUi601.js","/assets/UsersActivity-Y297JKwl.js","/assets/VerdictBlock-EkG8Yxn3.js","/assets/WatchProgress-B-cPmYAx.js","/assets/WebLogin-BG6OCjvb.js","/assets/WorkerConcerns-CSCJTc_n.js","/assets/Workers-C4RvixgW.js","/assets/Zagruzka-DRGRQ8p_.js","/assets/ZagruzkaCell-BFbJD7YY.js","/assets/api-DG_JX3-u.js","/assets/archive-Bd6PhmlZ.js","/assets/archive-restore-CS0zZq7y.js","/assets/arrow-down-C2eiTVDZ.js","/assets/arrow-left-DjMD3PyX.js","/assets/arrow-left-right-DK1VjrRS.js","/assets/arrow-up-8PsKWYzz.js","/assets/arrow-up-right-2z6TUpRM.js","/assets/award-eDymxegU.js","/assets/ban-bq7-eCPX.js","/assets/bot-BaqPzlaU.js","/assets/boxes-DJpW1bdQ.js","/assets/brigadirFilters-CbfTZieL.js","/assets/broadcastTree-Dcv9T16C.js","/assets/building-2-BEFNeGvt.js","/assets/calendar-clock--qoeuNnY.js","/assets/calendar-days-B60uyn9X.js","/assets/calendar-fkww4NKU.js","/assets/calendar-range-PHPjUYJ2.js","/assets/camera-Cp0s5E66.js","/assets/categories-C4eCGIFa.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CiQZJPdt.js","/assets/chart-line-DI1qVEg4.js","/assets/chart-pie-CzHuKuL-.js","/assets/chartRange-BXWH-iE6.js","/assets/chevron-left-CyaMNJsb.js","/assets/chevrons-up-down-BXx5I4F8.js","/assets/circle-CX2pITvp.js","/assets/circle-check-big-DjRBXOYV.js","/assets/circle-dot-DR7HkPDf.js","/assets/circle-minus-Bi6Jx8w3.js","/assets/circle-slash-C8e2-bTx.js","/assets/circle-user-round-DIIWjIcW.js","/assets/cloud-off-CDwEqE8-.js","/assets/cloud-upload-BI4A_VZs.js","/assets/compass-Dc19uDkL.js","/assets/concernCategories-3HFzvkp2.js","/assets/copy-DzORm6iz.js","/assets/corner-down-right-BMTS0-TV.js","/assets/createLucideIcon-dtdJ8L7L.js","/assets/es-C-yq2rR4.js","/assets/exportXlsx-CAaifzby.js","/assets/external-link-BX2mCi7d.js","/assets/file-clock-i8Xr3rJQ.js","/assets/file-exclamation-point-DPxCOdrH.js","/assets/file-spreadsheet-D4Re_5pV.js","/assets/file-text-B61BUlCB.js","/assets/flag-CebmaumM.js","/assets/flame-DyRpQ1Nk.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D-Lkhg1I.js","/assets/hash-qV8SzAC6.js","/assets/history-CJzmPKD4.js","/assets/hourglass-CXCFmm2d.js","/assets/image-off-DrhHqd1p.js","/assets/image-w3QgX1nf.js","/assets/index-BDi6AJHd.js","/assets/index-CamagMPV.css","/assets/key-round-DF-gV9_c.js","/assets/keyboard-BRO_VXw0.js","/assets/languages-CdAPy9Yg.js","/assets/layers-PSuqrUD1.js","/assets/lightbulb-Dq0jKEHc.js","/assets/link-2-Db0pZFHS.js","/assets/list-checks-KdYx9AV6.js","/assets/list-ordered-DHe1VOPY.js","/assets/list-tree-t54_3C1T.js","/assets/lock-open-Be8vTAA8.js","/assets/log-in-B6laFFdS.js","/assets/message-square-D-SRIos9.js","/assets/minimize-2-Dqt4jNEj.js","/assets/package-check-DKi7VbTM.js","/assets/paperclip-DAsv6EdI.js","/assets/pencil-C-tp-XgQ.js","/assets/percent--4tsHAKr.js","/assets/personName-B4KId4zS.js","/assets/pin-ClgPeA5X.js","/assets/pin-off-BN9bpcF9.js","/assets/play-DXVb-v9z.js","/assets/presentation-CcnB2B_3.js","/assets/prop-types-Tw3Y0PJO.js","/assets/radio-BBcO9hm-.js","/assets/react-apexcharts.esm-CH_qE5YG.js","/assets/repeat-CeSOpWoT.js","/assets/rotate-ccw-B71Mm014.js","/assets/rotate-cw-EMKnmg0F.js","/assets/save-Cv8jPzqU.js","/assets/scale-DEnGpssw.js","/assets/scroll-text-C8nAV2mh.js","/assets/search-x-CL8W2-P6.js","/assets/segments-DgOfjvVr.js","/assets/send-hI9W-mWA.js","/assets/settings-2-DDZKpZF2.js","/assets/shield-Cn1EZ7EJ.js","/assets/shield-alert-BVp6boNx.js","/assets/shield-check-B1VlPSa0.js","/assets/shield-question-mark-BHbHjL1e.js","/assets/siren-BWqgofJp.js","/assets/smartphone-DsRqzoao.js","/assets/snowflake-DClqQqS7.js","/assets/square-Ba-mLvq9.js","/assets/square-check-big-LGjB7-ZQ.js","/assets/star-CvseQl9J.js","/assets/statusBands-DdKY66z5.js","/assets/store-jmlacjUn.js","/assets/table-2-Dw1Aq5LV.js","/assets/tag-Csr7ZU0Y.js","/assets/timer-off-BN2fB4RK.js","/assets/trending-down-DXnXY1bB.js","/assets/trending-up-DnKxQD56.js","/assets/undo-2-ClIUefrv.js","/assets/useChartTheme-DArXrVA7.js","/assets/useElementWidth-DjCur669.js","/assets/useIsMobile-CQZFr2FG.js","/assets/useMutation-B60n-erd.js","/assets/useStatusBands-D9c1ORRI.js","/assets/user-DRoCTvZi.js","/assets/user-cog-Ba-0cLpc.js","/assets/user-minus-CUEllVnp.js","/assets/users-D35aK8w_.js","/assets/video-Cf3SvgJq.js","/assets/wallet-BoZLKYVU.js","/assets/warehouse-DD90D9N1.js","/assets/zap-DXEFiTXM.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
