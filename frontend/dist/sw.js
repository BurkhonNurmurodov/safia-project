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

const BUILD = "2026-10-04T15:37:45.687Z";
const PRECACHE = ["/","/assets/AdminPanel-D3iTZXFR.js","/assets/AnalysisBoard-Db9YRg2X.js","/assets/Arc-BxNiXjM0.js","/assets/ArcLegacy-XQvwZaV4.js","/assets/BrigadirProfile-BNb7BT8s.js","/assets/BroadcastReceivers-D5_dJjnb.js","/assets/BroadcastRecord-Bh8Ki6jQ.js","/assets/CatLockNotice-DAdFqwFV.js","/assets/CategoryLegendModal-CDDh_uL7.js","/assets/CellConcerns-BnP985IN.js","/assets/CellDetails-71-kaQdn.js","/assets/CellFormModal-ByZJyw7-.js","/assets/CellIdent-CGjfJner.js","/assets/CellLink-3U9ux4dw.js","/assets/Cells-Cz46rbaf.js","/assets/ColumnFilter-C4q3Qki4.js","/assets/ColumnsPicker-BPCqMEDU.js","/assets/CommentsModal-njKEVi8v.js","/assets/ComparisonTable-7K_tCc9d.js","/assets/Concerns-CVbPVMiA.js","/assets/ConfirmDialog-BNGGYpOJ.js","/assets/Daily-gUplZK0-.js","/assets/DataTable-DtSXpW6a.js","/assets/DateRangePicker-B5nm6zBV.js","/assets/DayReportView-DBSv1-tf.js","/assets/DayStepper-Y-hptu6w.js","/assets/DifferenceBreakdown-CL2IA493.js","/assets/Downtime-qfSwEFec.js","/assets/Education-B6xc2UwK.js","/assets/EducationLesson-DTN88DeM.js","/assets/EmptyState-aUUv6G9x.js","/assets/Exam-C5yuh1-s.js","/assets/FactorySelect-ByufaR6x.js","/assets/Gamification-CoDje9sm.js","/assets/GroupBadge-DYixCBF0.js","/assets/HeatmapChart-BjkyEXh_.js","/assets/IdleCell-nNBnGPJv.js","/assets/KPICard-DP0dXNuD.js","/assets/Kaizen-nZEKAlsR.js","/assets/Kelish-uIGld2LA.js","/assets/KpiDeltaCard-6oZ4uIqK.js","/assets/LangTextInput-qTw0XSUd.js","/assets/Layout-B_QtqVI1.js","/assets/LeaderAppeal-B7E6hqvy.js","/assets/LeaderDayReport-sFbPR5Cb.js","/assets/LeaderUnitReport-BN5FY0l6.js","/assets/Leaderboard-DbpnefcD.js","/assets/Leaders-CswA5GSh.js","/assets/Lightbox-BvS9IYyU.js","/assets/LiveOverview-D8XC-Bfj.js","/assets/Login-BkhXLoJl.js","/assets/NotFound-B5JIcvCw.js","/assets/Notifications-Df0prtej.js","/assets/Overview-BhFf1Bpb.js","/assets/Pagination-DL4BY3mU.js","/assets/PerenaladkaFactTable-CE6W9IQz.js","/assets/PersonCard-Lwh6VyxV.js","/assets/PlanFulfillment-nYEEIVry.js","/assets/Production-BrljDwil.js","/assets/Profile-CyJbLew8.js","/assets/ProofCamera-CJMiupZo.js","/assets/ProofPhoto-vACUk1no.js","/assets/Quality-NHURVgoz.js","/assets/RawRows-PWxvFl8R.js","/assets/RequestStateChip-BRH1BPTg.js","/assets/RichTextEditor-CRt9c1SL.js","/assets/SaveState-BiTkYPHX.js","/assets/SearchInput-BT5w05hz.js","/assets/SeasonalityHeatmap-hnIbU3Gn.js","/assets/SegmentedToggle-BcZwSjPD.js","/assets/SetupTimes-rF_1baCC.js","/assets/ShiftDaily-CYBq1J0v.js","/assets/Staff-BzsMCQPN.js","/assets/StaffLive-Cb5swwjP.js","/assets/StatusBadge-D6uZ62D5.js","/assets/TargetGoal-C6raM53k.js","/assets/Targets-Ch01mM8v.js","/assets/Tasks-CvGVUcPK.js","/assets/TimeWheelPicker-BQ5t1nY_.js","/assets/Toast-C4MMX5Xj.js","/assets/Tooltip-7Y67i_JL.js","/assets/TrendChart-CACTwsrq.js","/assets/TripleSpeedometer-B01adA1w.js","/assets/Trudoyomkost-BHHaa6Yp.js","/assets/Turnover-Bf2TScTV.js","/assets/UploadDropzone-BBckM_QH.js","/assets/UsersActivity-Ck6ruPsF.js","/assets/VerdictBlock-DpYbrTyI.js","/assets/VfxApiMap-CEqtI6ow.js","/assets/VfxDictionaries-sQ676n_x.js","/assets/VfxEmployees-Cq0nijMj.js","/assets/VfxHrMoves-Cf2OyefC.js","/assets/VfxJobs-OFozPyCf.js","/assets/VfxPhoto-DJwfy7De.js","/assets/VfxShifts-BA-LYMgM.js","/assets/VfxState-BIkdJH4s.js","/assets/VfxTimebooks-C0R4zMnB.js","/assets/VfxTimesheet-DQfd7hT5.js","/assets/WatchProgress-BdXVBrOF.js","/assets/WebLogin-75R9cReE.js","/assets/WorkerConcerns-BSlYkfFH.js","/assets/Workers-C6XEnD_R.js","/assets/Zagruzka-HEDfmF1v.js","/assets/ZagruzkaCell-BNVqftBA.js","/assets/api-DmUSR6md.js","/assets/archive-CQ0Drp-t.js","/assets/archive-restore-4RgodKHL.js","/assets/arrow-down-CxYTZO-N.js","/assets/arrow-left-EVlftGuy.js","/assets/arrow-up-DxmIv80h.js","/assets/arrow-up-narrow-wide-DZ5kMs8i.js","/assets/arrow-up-right-B_q2dKxo.js","/assets/award-CPSb-Wm3.js","/assets/ban-Cgtgo6QQ.js","/assets/book-open-CvI0TO6t.js","/assets/bot-BNoe_D85.js","/assets/boxes-CaZ0Eow2.js","/assets/braces-BnIa5sYu.js","/assets/brigadirFilters-B_EE7x2j.js","/assets/broadcastTree-ChKmrFCO.js","/assets/building-2-CKcqy9Qa.js","/assets/calculator-DMIjygG5.js","/assets/calendar-BHiMdblJ.js","/assets/calendar-days-BlNNgGrz.js","/assets/camera-CE4W9BA_.js","/assets/categories-Z6jAmKCH.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-q7uXjyJ0.js","/assets/chart-line-EaLeQdGP.js","/assets/chart-pie-JrGvZa3u.js","/assets/chartRange-D3XAmogT.js","/assets/check-check-BHl0ukII.js","/assets/chevron-left-De-Tdj_U.js","/assets/chevrons-up-down-B0J3BZHj.js","/assets/circle-CfS1zIpT.js","/assets/circle-alert-CNra_PhM.js","/assets/circle-check-big-DlZ2hkcX.js","/assets/circle-dashed-Q_WZd1Up.js","/assets/circle-minus-Bn1YB7bW.js","/assets/circle-question-mark-CAnIhnaf.js","/assets/circle-slash-CDJNBr5L.js","/assets/circle-user-round-FmniHhti.js","/assets/clock-3-DNXqHWpU.js","/assets/cloud-off-DsQrMXjs.js","/assets/cloud-upload-BWj_udbV.js","/assets/compass-BPZSi7AU.js","/assets/concernCategories-BqkTkQ3y.js","/assets/copy-D3r3c5uo.js","/assets/corner-down-right-DuNwBOcQ.js","/assets/createLucideIcon-CtxWYVDs.js","/assets/es-Bp5PeVCT.js","/assets/exportXlsx-CZbAZlXO.js","/assets/external-link-DkvtSXG4.js","/assets/file-clock-DbCIB1Js.js","/assets/file-exclamation-point-Duzt9wq1.js","/assets/file-spreadsheet-BLfsOLZ2.js","/assets/file-text-DAs33Xzf.js","/assets/flag-DyHnb4MQ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DZlSezng.js","/assets/hash-D5VN7aNJ.js","/assets/history-BUXGTsnR.js","/assets/hourglass-DmPaCzOp.js","/assets/image-BBXo9SaX.js","/assets/image-off-C4N_EB-2.js","/assets/inbox-BxJk52ez.js","/assets/index-BAN4mMdX.css","/assets/index-zvMrttia.js","/assets/key-round-fIYp_1m_.js","/assets/keyboard-BylrI0TE.js","/assets/languages-C8Ouf8dY.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BH6mFmJ9.js","/assets/lightbulb-BDjN7-E9.js","/assets/link-2-CUQszE50.js","/assets/link-2-off-BGqDVTSt.js","/assets/list-ordered-BEymiFYt.js","/assets/list-tree-D-x4sAVN.js","/assets/lock-open-BIXR4OMC.js","/assets/log-in-CIpwsBfB.js","/assets/maximize-2-BQbFcDMP.js","/assets/message-square-UUI67_Rj.js","/assets/minimize-2-COcnSLzQ.js","/assets/package-check-DMVuYHss.js","/assets/paperclip--uzGWgJI.js","/assets/pencil-B21D9kYw.js","/assets/percent-CD3NihBB.js","/assets/pin-B9i--r3_.js","/assets/pin-off-Bj8bnww_.js","/assets/play-Cu67fkzK.js","/assets/plug-zap-BKlYd54d.js","/assets/presentation-BDWu2U3q.js","/assets/prop-types-9m51lpJ8.js","/assets/radio-DBM7KEJX.js","/assets/react-apexcharts.esm-B4_6Y-Ae.js","/assets/registers-FSdC7trY.js","/assets/repeat-EsNqAsmZ.js","/assets/rotate-ccw-CWq_MV-T.js","/assets/rotate-cw-BIWt6ETc.js","/assets/save-CIcHh6xD.js","/assets/scopeLinks-B1HwQQ8G.js","/assets/scroll-text-O3vwZKIa.js","/assets/search-x-BOXxmkgM.js","/assets/segments-DC7GIT7d.js","/assets/send-BxjQAJNn.js","/assets/settings-2-6RQuldAL.js","/assets/shield-3hVYs2ok.js","/assets/shield-alert-DTI9lbC3.js","/assets/shield-check-D0m7vlaA.js","/assets/shield-question-mark-BtmD-jYv.js","/assets/siren-CxOAlqJu.js","/assets/snowflake-CO1_HPOC.js","/assets/split-CbcbS7Xb.js","/assets/square-DpTA_woq.js","/assets/square-check-big-fCARGiG9.js","/assets/star-Dom64ZFD.js","/assets/statusBands-C6e6eWu6.js","/assets/store-DmWsD4T-.js","/assets/table-2-BpBtbJ6T.js","/assets/table-properties-Dw-RPIWz.js","/assets/tag-BM7BIBbo.js","/assets/timer-off-v6PnezIG.js","/assets/trending-down-V7X8a3jS.js","/assets/trending-up-D6wxCL9y.js","/assets/undo-2-CZdKSRSx.js","/assets/useChartTheme-DkhjzSeN.js","/assets/useElementWidth-BFby7pOJ.js","/assets/useIsMobile-C5K35Uje.js","/assets/useOpenParam-CTfEcqgT.js","/assets/useStatusBands-FElFUWGj.js","/assets/useUrlScope-By9Sag3A.js","/assets/user-34yUuURn.js","/assets/user-cog-Dcn69dPg.js","/assets/users-BOnXD6He.js","/assets/vfx-DgEf6fgl.js","/assets/video-DRi7E6XV.js","/assets/wallet-AjlzXci4.js","/assets/warehouse-DhRTKCxg.js","/assets/x-sxBdGAfT.js","/assets/zap-CG5emCZo.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
