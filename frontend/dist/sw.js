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

const BUILD = "2026-10-19T08:02:09.538Z";
const PRECACHE = ["/","/assets/AdminPanel-DFypCmag.js","/assets/AnalysisBoard-CFoECFfS.js","/assets/Arc-ucLAipUt.js","/assets/Assistant-DHsfJ3hZ.js","/assets/BrigadirProfile-uKivVJc1.js","/assets/BroadcastReceivers-Dsajq80A.js","/assets/BroadcastRecord-j3GADxRV.js","/assets/Button-YG0jxzqs.js","/assets/CatLockNotice-niu4b-7o.js","/assets/CategoryLegendModal-B3jyMUWn.js","/assets/CellConcerns-Df03Iu67.js","/assets/CellDetails-Ciu5l4b8.js","/assets/CellFormModal--Tnr_PSY.js","/assets/CellIdent-CfQBLwGV.js","/assets/CellLink-CwoVH4Za.js","/assets/Cells-C_6aAH5T.js","/assets/ColumnFilter-il21wuXj.js","/assets/ColumnsPicker-BMYm1vXM.js","/assets/CommentsModal-CLp5N46T.js","/assets/ComparisonTable-CZ9ip5gl.js","/assets/Concerns-DD-qmRMN.js","/assets/CountStepper-BzkjS_FK.js","/assets/Daily-A4nbvFsi.js","/assets/DataTable-NOzoSxoq.js","/assets/DateRangePicker-BDomV_LZ.js","/assets/DayReportView-DSUHsvUZ.js","/assets/DayStepper-w0oeIici.js","/assets/DifferenceBreakdown-CyIgxwCh.js","/assets/Downtime-DFzliPCH.js","/assets/Education-dmHbEyDR.js","/assets/EducationLesson-CMXU5ZpV.js","/assets/EmptyState-CUxtdd7L.js","/assets/Exam-xsV7lgDP.js","/assets/FactorySelect-d7yYsoRy.js","/assets/Gamification-BtNiqvHs.js","/assets/GroupBadge-CoeuJYbv.js","/assets/HeatmapChart-BloWjOun.js","/assets/IdleCell-DPoZnK5t.js","/assets/KPICard-DCfmRKLc.js","/assets/Kaizen-Bwh8rJ1B.js","/assets/Kelish-BqI2-bMT.js","/assets/KpiDeltaCard-DX_gMSG5.js","/assets/LangTextInput-CFfbxUIU.js","/assets/Layout-3o6JgXvg.js","/assets/LeaderAppeal-DgrWrrFW.js","/assets/LeaderDayReport-BjY66GAN.js","/assets/LeaderUnitReport-BOxPaKmx.js","/assets/Leaderboard-BJ3eeUco.js","/assets/Leaders-jZFIfwwS.js","/assets/LeadersKpi-CzS6ui59.js","/assets/Lightbox-9B6I_BDJ.js","/assets/LiveOverview-DP-sVlv3.js","/assets/Login-R9M_JUzT.js","/assets/NotFound-CnPwE3K4.js","/assets/Notifications-BKBj3pF0.js","/assets/Overview-MQx2L8Gv.js","/assets/Pagination-227oWlhN.js","/assets/PerenaladkaFactTable-BFqmnucN.js","/assets/PersonCard-D7EBf0_y.js","/assets/PlanFulfillment-BDFeIYh7.js","/assets/Production-CPI4KSI-.js","/assets/Profile-EQ2JGaQN.js","/assets/ProofCamera-BGCcKxs4.js","/assets/ProofPhoto-D0cQboWs.js","/assets/Quality-D17pV_pV.js","/assets/RawRows-DWp4peal.js","/assets/RequestStateChip-DUwNprcH.js","/assets/RichTextEditor-DmOHFYs3.js","/assets/SaveState-CQG1Yrvc.js","/assets/SearchInput-BIWN1n6I.js","/assets/SeasonalityHeatmap-Bj5hM8CF.js","/assets/SegmentedToggle-B7loePut.js","/assets/SetupTimes-DsD5khlm.js","/assets/ShiftDaily-DllV5MA_.js","/assets/Staff-CycIbBw2.js","/assets/StaffListAtCheck-wq-gc4-o.js","/assets/StatusBadge-CsjiVfz7.js","/assets/TargetGoal-DfJic4aq.js","/assets/Targets-BPW1O_ao.js","/assets/Tasks-tfgrywTY.js","/assets/TimeWheelPicker-D1MC5AUw.js","/assets/Toast-CX-wm9B5.js","/assets/Tooltip-JrTuUgB6.js","/assets/TrendChart-DsSPc4wD.js","/assets/TripleSpeedometer-DafhNAwS.js","/assets/Trudoyomkost-lqSzacbJ.js","/assets/UploadDropzone-BCamAjMv.js","/assets/UsersActivity-DDaC5_9w.js","/assets/VerdictBlock-OX1mBzkn.js","/assets/VfxApiMap-Bxi5XXRd.js","/assets/VfxDictionaries-DBm8hQky.js","/assets/VfxEmployees-CVXY7LRA.js","/assets/VfxHrMoves-DLQoLw-D.js","/assets/VfxJobs-Cmof7HDj.js","/assets/VfxPhoto-BrVENySt.js","/assets/VfxShifts-DHO8v91I.js","/assets/VfxState-bFHGXMY0.js","/assets/VfxTimebooks-CGNB4XVo.js","/assets/VfxTimesheet-DXbYwmpv.js","/assets/WatchProgress-XT37iMzS.js","/assets/WebLogin-B7SxX8w4.js","/assets/Workers-cnqR-BPl.js","/assets/Zagruzka-BdpN0sTa.js","/assets/ZagruzkaCell-CUCTxZsY.js","/assets/api-BCtkk4lk.js","/assets/archive-CDLKSgzp.js","/assets/archive-restore-CHnZ-_-n.js","/assets/arrow-down-BOyqKJJm.js","/assets/arrow-down-right-BS0aMyGC.js","/assets/arrow-down-wide-narrow-BJ70hPSD.js","/assets/arrow-up-narrow-wide-CM3eM2SG.js","/assets/ban-CaiMePol.js","/assets/boxes-DQ-V1GtW.js","/assets/braces-BzTC-oX5.js","/assets/brigadirFilters-CVVwYzxy.js","/assets/broadcastTree-C3b6YySF.js","/assets/building-2-sfL5kg0J.js","/assets/calculator-BQEY0T_C.js","/assets/calendar-C7klQxCh.js","/assets/calendar-days-BvNfOvFN.js","/assets/camera-Cmg1zt3E.js","/assets/categories-C9rkP4nw.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Bl4_7t0m.js","/assets/chart-line-DatNzgK7.js","/assets/chart-pie-Bz2TiYLZ.js","/assets/chartRange-B7-7i9x3.js","/assets/check-check-DtLp2ZeR.js","/assets/chevron-left-Ctti3I8L.js","/assets/chevrons-up-down-i1jvXqA0.js","/assets/circle-Bk1dqyTq.js","/assets/circle-alert-BOxSJ50Q.js","/assets/circle-check-big-C3L9H8LN.js","/assets/circle-dashed-CcYz_BNO.js","/assets/circle-minus-DOeth85X.js","/assets/circle-question-mark-CGpgMPLK.js","/assets/circle-slash-8XekaMiW.js","/assets/circle-user-round-WT5IQ0fw.js","/assets/cloud-off-CbRcNDaz.js","/assets/cloud-upload-BgMmRH48.js","/assets/compass-CRwWoJxw.js","/assets/concernCategories-HZmx_rGy.js","/assets/corner-down-right-BlBfPISx.js","/assets/createLucideIcon-CQ5788ia.js","/assets/es-C8gZEsVR.js","/assets/external-link-C-zRiW6X.js","/assets/file-clock-B6CEaZRl.js","/assets/file-exclamation-point-BEdG8FaJ.js","/assets/flag-DEk6XJ_A.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BJBAWqj6.js","/assets/hash-BYakqOmW.js","/assets/hourglass-BqPo9qmv.js","/assets/image-KgIscfY6.js","/assets/image-off-BmM5o8xb.js","/assets/inbox-CUvN5v67.js","/assets/index-CHKoPupV.js","/assets/index-DemTQruw.css","/assets/keyboard-TKojN_xE.js","/assets/languages-BYdL-iB_.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C-5bnA27.js","/assets/lightbulb-CHwMCyPG.js","/assets/link-2-BwmrQKc5.js","/assets/link-2-off-DUKri_bu.js","/assets/list-ordered-DaXvCEVy.js","/assets/list-tree-DzyCCl69.js","/assets/lock-open-Dj2eSNby.js","/assets/log-in-B-XUO4uj.js","/assets/marks-C4b-2LRo.js","/assets/minimize-2-BkM7Chuv.js","/assets/package-check-CvBiDoTE.js","/assets/pencil-Q2vq-jmL.js","/assets/percent-tyndiKGb.js","/assets/pin-DxPcoMoV.js","/assets/pin-off-CzCIfMGA.js","/assets/play-BtJwombr.js","/assets/plug-zap-BGlFOm5l.js","/assets/prop-types-CLwGECBB.js","/assets/radio-BZ6fcHUH.js","/assets/react-apexcharts.esm-B_1Jmrtp.js","/assets/registers-eGgf6EMe.js","/assets/repeat-DVTMGzXm.js","/assets/save-C6LkIb2U.js","/assets/scopeLinks-DrybJN60.js","/assets/scroll-text-CHdAMJaH.js","/assets/search-x-C6A2Im2N.js","/assets/segments-BWv17RlQ.js","/assets/send-DlpyAIi1.js","/assets/settings-2-ChdqzmK_.js","/assets/shield-alert-BXCLkqiU.js","/assets/shield-iiSRmvTg.js","/assets/shield-question-mark-RLHK5KC-.js","/assets/siren-CBftE525.js","/assets/snowflake-Dyj5B0j_.js","/assets/split-B_hBVELe.js","/assets/square-check-big-DhfrMbzE.js","/assets/star-nM4po2dq.js","/assets/statusBands-CFq7xcPX.js","/assets/store-D6U-P98J.js","/assets/table-2-Z0vWxTtw.js","/assets/table-properties-CpG8O7oj.js","/assets/tag-Cj2ruhTb.js","/assets/timer-off-PX8oAgNt.js","/assets/trending-down-m2yH1924.js","/assets/trending-up-Bv8Niwaq.js","/assets/undo-2-DLPSSSh5.js","/assets/useChartTheme-BGq-xkCf.js","/assets/useElementWidth-00tEkfqn.js","/assets/useIsMobile-DlYVXtsw.js","/assets/useOpenParam-De0EnGE-.js","/assets/useStatusBands-BxeeIPTt.js","/assets/useUrlScope-ElvmDSl4.js","/assets/user-cog-CyKhvsDs.js","/assets/user-l2sK7YPZ.js","/assets/user-minus-B5-jIkXp.js","/assets/users-BDJ3-MXS.js","/assets/vfx-DhKQcxs1.js","/assets/video-CbCu43OW.js","/assets/wallet-DWkxFsFU.js","/assets/warehouse-Ck9TYo1B.js","/assets/workflow-CdubO8L6.js","/assets/x-C59chxl4.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
