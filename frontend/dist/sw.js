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

const BUILD = "2026-09-30T04:42:53.476Z";
const PRECACHE = ["/","/assets/AdminPanel-CXnx1_VH.js","/assets/AnalysisBoard-TaEUPWxo.js","/assets/Arc-UHyCPX1n.js","/assets/ArcLegacy-BIZVoWE5.js","/assets/AttendanceModal-DpsA0l8G.js","/assets/BrigadirProfile-Be3ZkDNA.js","/assets/BroadcastReceivers-ChDtDtm_.js","/assets/BroadcastRecord-BuFC8eAW.js","/assets/CatLockNotice-IMNLRJSA.js","/assets/CategoryLegendModal-PAGaU-zg.js","/assets/CellConcerns-C2kbS02G.js","/assets/CellDetails-B_orfUIt.js","/assets/CellFormModal-Bos1dWQG.js","/assets/CellLink-eAV_tN7J.js","/assets/Cells-CWNyySVJ.js","/assets/ColumnFilter-2nkam5z3.js","/assets/ColumnsPicker-BX4PbJtL.js","/assets/CommentsModal-DbkcwfxG.js","/assets/ComparisonTable-BWzH-PDH.js","/assets/Concerns-C3tfQKS2.js","/assets/ConfirmDialog-BcAc6aKX.js","/assets/Daily-DASGD1ir.js","/assets/DataTable-DQ2oEzOq.js","/assets/DateRangePicker-CvI7I6db.js","/assets/DayReportView-9znxmkLH.js","/assets/DayStepper-DG0zJ6jM.js","/assets/DifferenceBreakdown-CaRWRO1m.js","/assets/Downtime-UKafOa5e.js","/assets/Education-D7EU0gqe.js","/assets/EducationLesson-BJz_TtfM.js","/assets/EmptyState-SLLn2Vzv.js","/assets/Exam-BrPkVE-q.js","/assets/FactorySelect-DBDuWezW.js","/assets/Gamification-DFxpG0u_.js","/assets/GroupBadge-8rUkdpHo.js","/assets/HeatmapChart-BeTRZryR.js","/assets/IdleCell-D7gkETKF.js","/assets/KPICard-DH6SHAxb.js","/assets/Kaizen-8jniDoJJ.js","/assets/Kelish-LPs5dojq.js","/assets/KpiDeltaCard-Djz_HWpK.js","/assets/LangTextInput-DHys5tGT.js","/assets/Layout-DWPGTKxg.js","/assets/LeaderAppeal-Cw-TmyP4.js","/assets/LeaderDayReport-BolybS7K.js","/assets/LeaderUnitReport-2wuRhZ87.js","/assets/Leaderboard-BswrBcIJ.js","/assets/Leaders-C4RZ816t.js","/assets/Lightbox-CRGV9GCx.js","/assets/LiveOverview-B5CuRo7G.js","/assets/Login-DlrZEGtB.js","/assets/NotFound-B4_XZxmv.js","/assets/Overview-B8tcxXoT.js","/assets/Pagination-B_rEKp3T.js","/assets/PerenaladkaFactTable-CzGfAqmC.js","/assets/PlanFulfillment-DjFWXzhS.js","/assets/Production-BcOdXBoM.js","/assets/Profile-DQr-ejmZ.js","/assets/ProofCamera-QYc2Ww1l.js","/assets/ProofPhoto-CLmWU0aV.js","/assets/Quality-Cln7ArLw.js","/assets/RequestStateChip-CySb8pRE.js","/assets/RichTextEditor-BXLFfjK4.js","/assets/SaveState-uCDBZ7f0.js","/assets/SearchInput-CFDAw7qM.js","/assets/SeasonalityHeatmap-BCeJMfV3.js","/assets/SegmentedToggle-CHNeimiF.js","/assets/SetupTimes-DD_jTOAk.js","/assets/ShiftDaily-Dlbl1liT.js","/assets/Staff-DSMvyiAT.js","/assets/StatusBadge-CZY7qAL_.js","/assets/TargetGoal-CfHHTf2S.js","/assets/Targets-dAWpILpn.js","/assets/Tasks-CaUFqB93.js","/assets/TimeWheelPicker-Dfqpfk74.js","/assets/Tooltip-BMHgjO0E.js","/assets/TrendChart-zcgQnHDY.js","/assets/TripleSpeedometer-CmNSy2LH.js","/assets/Trudoyomkost-ChThGe9G.js","/assets/UploadDropzone-FgVtsKFv.js","/assets/UsersActivity-NCMiqZzI.js","/assets/VerdictBlock-NaoWOwaY.js","/assets/WatchProgress-jkHefzDg.js","/assets/WebLogin-CJ0wTU-W.js","/assets/WorkerConcerns-KtwlvSWu.js","/assets/Workers-B2DTuf0n.js","/assets/Zagruzka-DPNpVDzM.js","/assets/ZagruzkaCell-CHjK5rR8.js","/assets/api-DE4F0OnB.js","/assets/archive-Dt4by_Ha.js","/assets/archive-restore-T8hr-jfK.js","/assets/arrow-down-CHB1h6dY.js","/assets/arrow-left-DDkkm36U.js","/assets/arrow-left-right-BLRyuTTX.js","/assets/arrow-up-TEExaAyN.js","/assets/arrow-up-narrow-wide-OnlqEwbQ.js","/assets/arrow-up-right-BEyMStR0.js","/assets/award-CvyYaXEm.js","/assets/ban-DvRQb0cJ.js","/assets/bot-BIDOiVNa.js","/assets/boxes-DckpkQdp.js","/assets/brigadirFilters-B0L6WxOU.js","/assets/broadcastTree-Brk8Xjzo.js","/assets/building-2-BAEsAREq.js","/assets/calendar-CrYlkz_H.js","/assets/calendar-clock-DH48S-Mq.js","/assets/calendar-days-B7mGNsRQ.js","/assets/calendar-range-CzVoT_Lr.js","/assets/camera-CcdrDax3.js","/assets/categories-D0McdzhN.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-uVfSk534.js","/assets/chart-line-bb2d_bAE.js","/assets/chart-pie-DFhL2nnG.js","/assets/chartRange-2hqcQLHR.js","/assets/chevron-left-6sI219sA.js","/assets/chevrons-up-down-D6hC7Qad.js","/assets/circle-DXiaY-2b.js","/assets/circle-check-big-CUuCOaaJ.js","/assets/circle-dot-jRXmS1ZP.js","/assets/circle-minus-KM4A_Bju.js","/assets/circle-slash-BBjpmPCc.js","/assets/circle-user-round-C6JfrwwM.js","/assets/cloud-off-DAMWngBo.js","/assets/cloud-upload-BlvSBOAS.js","/assets/compass-DgHx7eHO.js","/assets/concernCategories-KtxmGrzE.js","/assets/copy-cS26uQa9.js","/assets/corner-down-right-BoVTlGb7.js","/assets/createLucideIcon-DJNxe_np.js","/assets/es-ImOUoECG.js","/assets/exportXlsx-DRXfFxAs.js","/assets/external-link-DjmYINjw.js","/assets/file-clock-Bb4DQI2e.js","/assets/file-exclamation-point-DvfqHOit.js","/assets/file-spreadsheet-UYJYYoQe.js","/assets/file-text-BJJCP3Dt.js","/assets/flag-DjTlY5OE.js","/assets/flame-DasYz5ZQ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BQ-0PVRG.js","/assets/hash-DYTQh-9y.js","/assets/history-BxvBoluH.js","/assets/hourglass-kumonU5Q.js","/assets/image-CJlXk04K.js","/assets/image-off-30HfqB9m.js","/assets/index-B8JHyLjE.css","/assets/index-D7tB1Frw.js","/assets/key-round-DcVKF0sy.js","/assets/keyboard-D_n68-EC.js","/assets/languages-CVhNnpz8.js","/assets/layers-Cet2MbWs.js","/assets/lightbulb-CG70b9xi.js","/assets/link-2-AtKA6utX.js","/assets/link-2-off-D94uiDiY.js","/assets/list-checks-BfouNdeu.js","/assets/list-ordered-Bf4bbWU7.js","/assets/list-tree-v4aYXmys.js","/assets/lock-open-0LwPbjDo.js","/assets/log-in-D5dG_9uo.js","/assets/maximize-2-BhJkSE3S.js","/assets/message-square-DLS88rPE.js","/assets/minimize-2-3e0hjDW0.js","/assets/package-check-DaYPOKOk.js","/assets/paperclip-DkrM1hyp.js","/assets/pencil-Ai9zNXDl.js","/assets/percent-E-wTZ3rQ.js","/assets/personName-CogOuS3K.js","/assets/pin-jsUbJzg-.js","/assets/pin-off-cNxCYqq3.js","/assets/play-sU92ooB6.js","/assets/presentation-C-jeb7ZW.js","/assets/prop-types-CWpdiDBe.js","/assets/radio-DT0bd8oa.js","/assets/react-apexcharts.esm-JglnGvqX.js","/assets/repeat-CXyhaXyz.js","/assets/rotate-ccw-C3DRCu0l.js","/assets/rotate-cw-Dq4QoiHo.js","/assets/save-DiwHwtxQ.js","/assets/scale-CWr6Jj-0.js","/assets/scroll-text-BoqLuCK-.js","/assets/search-x-BrJLh04j.js","/assets/segments-D1AoxobO.js","/assets/send-BozaOxWg.js","/assets/settings-2-BZ3fIyyw.js","/assets/shield-BWFDtvNX.js","/assets/shield-alert-yHX_xkz8.js","/assets/shield-check-gR2pc2AF.js","/assets/shield-question-mark-BEakuZux.js","/assets/siren-Cco3Jhef.js","/assets/snowflake-DfChdlek.js","/assets/square-BE3bOS_H.js","/assets/square-check-big-D7L6zqRL.js","/assets/star-3_xCq6KC.js","/assets/statusBands-DeycusnV.js","/assets/store-kAmZONre.js","/assets/table-2-D_SSvJIR.js","/assets/table-properties-Bko6FRx2.js","/assets/tag-BLD1g5Ur.js","/assets/timer-off-DaAAFlfi.js","/assets/trending-down-CiWJmYjE.js","/assets/trending-up-DeHkigLV.js","/assets/undo-2-DqMM49rP.js","/assets/useChartTheme-28Va00Qu.js","/assets/useElementWidth-CV2VSfUx.js","/assets/useIsMobile-7uJWa_4F.js","/assets/useMutation-oWQLH-Gx.js","/assets/useStatusBands-BUePoYa5.js","/assets/user-DugMT0qV.js","/assets/user-cog-BjErzcOd.js","/assets/user-minus-BATetqsI.js","/assets/users-Ds6iEkB8.js","/assets/video-D0IeYinv.js","/assets/wallet-Cyr-iAy7.js","/assets/warehouse-D2Gdayzp.js","/assets/zap-UBk1FeF0.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
