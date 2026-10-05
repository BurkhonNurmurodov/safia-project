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

const BUILD = "2026-10-05T08:08:05.718Z";
const PRECACHE = ["/","/assets/AdminPanel-CsmTRj-g.js","/assets/AnalysisBoard-CS0k-W6g.js","/assets/Arc-CFFJIcVV.js","/assets/ArcLegacy-BhJ_Syoh.js","/assets/BrigadirProfile-CrQxA2h5.js","/assets/BroadcastReceivers-CpB1TxMe.js","/assets/BroadcastRecord-BmGB2Jvh.js","/assets/Button-DKuLeQO9.js","/assets/CatLockNotice-DxpMz_YV.js","/assets/CategoryLegendModal-D9NTYwi_.js","/assets/CellConcerns-BD0nl1Iy.js","/assets/CellDetails-BHWVZ1hJ.js","/assets/CellFormModal-B3oIg6gF.js","/assets/CellIdent-BWYds9hR.js","/assets/CellLink-DGGHTtsH.js","/assets/Cells-DsirsPML.js","/assets/ColumnFilter-ERFnhEu2.js","/assets/ColumnsPicker-Bc4jA8Yl.js","/assets/CommentsModal-BZJvNgO4.js","/assets/ComparisonTable-DqaCRBZv.js","/assets/Concerns-DF8aeYaU.js","/assets/Daily-gSQ9yCRe.js","/assets/DataTable-7s4ps5VP.js","/assets/DateRangePicker-DzEVzE1i.js","/assets/DayReportView-BHyxqbJZ.js","/assets/DayStepper-BHqO-TCf.js","/assets/DifferenceBreakdown-D0kHnan3.js","/assets/Downtime-BVBX4FiB.js","/assets/Education-C3egpUjb.js","/assets/EducationLesson-D9mSmPOS.js","/assets/EmptyState-DRRVupsZ.js","/assets/Exam-D32VV7vw.js","/assets/FactorySelect-Dz5ZsTVu.js","/assets/Gamification-CbFbq7Xj.js","/assets/GroupBadge-B5oaOddQ.js","/assets/HeatmapChart-CdCzjA1w.js","/assets/IdleCell-CmtpaITT.js","/assets/KPICard-CQVIBA26.js","/assets/Kaizen-D6ORxhsJ.js","/assets/Kelish-Bk67R1ZD.js","/assets/KpiDeltaCard-eqUJ2WIS.js","/assets/LangTextInput-Dx8bnQev.js","/assets/Layout-BUECLjss.js","/assets/LeaderAppeal-vf1nxNp0.js","/assets/LeaderDayReport-Dxdd3rnD.js","/assets/LeaderUnitReport-DRH2h96G.js","/assets/Leaderboard-6T0ndZzJ.js","/assets/Leaders-210RJKRx.js","/assets/Lightbox-DzEfz3nQ.js","/assets/LiveOverview-BpuvSYZK.js","/assets/Login-CnvQa8K4.js","/assets/NotFound-DQWuJHk4.js","/assets/Notifications-B1PIgx9I.js","/assets/Overview-k6ruesxK.js","/assets/Pagination-Ck20N1R9.js","/assets/PerenaladkaFactTable-CH-sdOMR.js","/assets/PersonCard-6jzde6Zq.js","/assets/PlanFulfillment-BcsTAZiJ.js","/assets/Production-CwJWC5d2.js","/assets/Profile-BG2nOz4n.js","/assets/ProofCamera-gtdSdkWH.js","/assets/ProofPhoto-DP-moleu.js","/assets/Quality-DbGnF6_N.js","/assets/RawRows-DsHc_6Tj.js","/assets/RequestStateChip-QilG3k-d.js","/assets/RichTextEditor-DQ9ay8MT.js","/assets/SaveState-D4qqoiUe.js","/assets/SearchInput-BgMzDCM5.js","/assets/SeasonalityHeatmap-CTPuiFpk.js","/assets/SegmentedToggle-CvKQpj5F.js","/assets/SetupTimes-BODrvA4h.js","/assets/ShiftDaily-DRD1nHbJ.js","/assets/Staff-C_TnCFZn.js","/assets/StaffLive-DgfdAlGL.js","/assets/StatusBadge-Cjz4L9Mj.js","/assets/TargetGoal-DSkOhafN.js","/assets/Targets-DXEsVOIV.js","/assets/Tasks-BCBqCS9M.js","/assets/TimeWheelPicker-BiCdeWRT.js","/assets/Toast-wtSnoQiM.js","/assets/Tooltip-DXeCPtjH.js","/assets/TrendChart-BF7bUBbj.js","/assets/TripleSpeedometer-BpPg4YQ5.js","/assets/Trudoyomkost-Bg1ucBXq.js","/assets/Turnover-mbMzPEyo.js","/assets/UploadDropzone-DF1Zd7un.js","/assets/UsersActivity-sCTMfY02.js","/assets/VerdictBlock-CqfX99s4.js","/assets/VfxApiMap-BAJ1imV6.js","/assets/VfxDictionaries-Ca3z-lqC.js","/assets/VfxEmployees-DpS-CVXw.js","/assets/VfxHrMoves-B7HVN7aP.js","/assets/VfxJobs-CL9JqGqq.js","/assets/VfxPhoto-xeho_mFj.js","/assets/VfxShifts-mZCyqHQx.js","/assets/VfxState-D8jF5kAW.js","/assets/VfxTimebooks-B7sx2x2p.js","/assets/VfxTimesheet-UVDksoV3.js","/assets/WatchProgress-CURDOs7m.js","/assets/WebLogin-DI7T-duk.js","/assets/WorkerConcerns-B1--m98U.js","/assets/Workers-CVfG3kEx.js","/assets/Zagruzka-D52utDIR.js","/assets/ZagruzkaCell-FIsTHjQA.js","/assets/api-g3gcRDp0.js","/assets/archive-DKmSE9Cv.js","/assets/archive-restore-CARLK9xZ.js","/assets/arrow-down-BMev3nil.js","/assets/arrow-left--taVTryF.js","/assets/arrow-up-BdMBt-lm.js","/assets/arrow-up-narrow-wide-B-uXCP2I.js","/assets/arrow-up-right-DNVzooyK.js","/assets/award-GUxRVVoG.js","/assets/ban-rkZB5Q-M.js","/assets/book-open-rNhpAwJE.js","/assets/bot-D2P-0ZrQ.js","/assets/boxes-CDuOHCFg.js","/assets/braces-CD8QWhM5.js","/assets/brigadirFilters-CsXMrGrr.js","/assets/broadcastTree-CVPNapTN.js","/assets/building-2-2SCeORwC.js","/assets/calculator-BB3rg7Wa.js","/assets/calendar-BDNkwO6l.js","/assets/calendar-days-Dd0pFgU1.js","/assets/camera-Dqa0csbU.js","/assets/categories-CQVaG95H.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BI50peKc.js","/assets/chart-line-DH7_zPOQ.js","/assets/chart-pie-CdKPEhuR.js","/assets/chartRange-D2UzSL_w.js","/assets/check-check-BvsGb4BO.js","/assets/chevron-left-Bzl_VTj7.js","/assets/chevrons-up-down-E37BqGON.js","/assets/circle-alert-DeOh1z7P.js","/assets/circle-cD2AP62Y.js","/assets/circle-check-big-BiFtzevK.js","/assets/circle-dashed-BjEYrr2T.js","/assets/circle-minus-rtTARmVv.js","/assets/circle-question-mark-CgvItP1T.js","/assets/circle-slash-DG8vRJfM.js","/assets/circle-user-round-DQTx_XbK.js","/assets/clock-3-D-MSq6Qb.js","/assets/cloud-off-B7voI4UW.js","/assets/cloud-upload-oN9hVf4S.js","/assets/compass-BfbsxHpc.js","/assets/concernCategories-DMmNk2Qu.js","/assets/copy-DO5Yj2Le.js","/assets/corner-down-right-DGuPoXIH.js","/assets/createLucideIcon-IJwOhny0.js","/assets/es-uPUyQFlo.js","/assets/exportXlsx-k6k2crno.js","/assets/external-link-B1GxYLwg.js","/assets/file-clock-BBzuoYa4.js","/assets/file-exclamation-point-CvTULRWU.js","/assets/file-spreadsheet-e4wnSP6Z.js","/assets/file-text-Cc65kKbG.js","/assets/flag-CN23jy4D.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C-TfmqVW.js","/assets/hash-RcJrcFAx.js","/assets/history-T2t98z3L.js","/assets/hourglass-CyaoCkYu.js","/assets/image-TX91E1M_.js","/assets/image-off-LVHJWLL2.js","/assets/inbox-xwh7kSR8.js","/assets/index-9Ek5bJIg.js","/assets/index-BarTLmz_.css","/assets/key-round-lD4pg2jI.js","/assets/keyboard-BYdFYj0a.js","/assets/languages-VDw6eMy1.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Bzidn6EG.js","/assets/lightbulb-Cznf6Gkr.js","/assets/link-2-DYZ74v8o.js","/assets/link-2-off-B7N6fe4Z.js","/assets/list-ordered-BLP84mEw.js","/assets/list-tree-Dc-PvRhK.js","/assets/lock-open-pqbLB3JA.js","/assets/log-in-BWCsDkEZ.js","/assets/maximize-2-Co2mCDEh.js","/assets/message-square-Czlj_pVY.js","/assets/minimize-2-DVWoqCqC.js","/assets/package-check-C_CF3Ez1.js","/assets/paperclip-Cr-f8Abw.js","/assets/pencil-aNfoZ1Fq.js","/assets/percent-xugrZePW.js","/assets/pin-DNQrnv29.js","/assets/pin-off--HzkPsbM.js","/assets/play-CImacuuZ.js","/assets/plug-zap-7UESJF3Z.js","/assets/presentation-CRtHzbzN.js","/assets/prop-types-DxGIGDqI.js","/assets/radio-CsEP9OEz.js","/assets/react-apexcharts.esm-BPt9jD9u.js","/assets/registers-Dl70PElf.js","/assets/repeat-H5OHq65Y.js","/assets/rotate-ccw-gugn7zsp.js","/assets/rotate-cw-BRyqtv2g.js","/assets/save-BeZ_36UU.js","/assets/scopeLinks-ClYy-sd-.js","/assets/scroll-text-DLz8tGBy.js","/assets/search-x-BEOOB5FT.js","/assets/segments-BNSugFgS.js","/assets/send-D-Vo_WWm.js","/assets/settings-2-BeJ5WAgi.js","/assets/shield-alert-CCXCPfmZ.js","/assets/shield-check-D6CLvjPe.js","/assets/shield-lIIn0yMx.js","/assets/shield-question-mark-Be0HgrbE.js","/assets/siren-CPpUkG17.js","/assets/snowflake-Ba8X097W.js","/assets/split-DT_tUSDg.js","/assets/square-IdQTeSqX.js","/assets/square-check-big-9WJeA-1k.js","/assets/star-Dx3mkqHq.js","/assets/statusBands-Cu8YvInl.js","/assets/store-CUj6yybP.js","/assets/table-2-BOJY6-XU.js","/assets/table-properties-DHyaljeA.js","/assets/tag-Dzs77_Am.js","/assets/timer-off-B6b7x5uU.js","/assets/trending-down-OXL9iIVp.js","/assets/trending-up-CHbPblAD.js","/assets/undo-2-BsdIIUI6.js","/assets/useChartTheme-WGG1lrq6.js","/assets/useElementWidth-CdKu_JEH.js","/assets/useIsMobile-QpkD5Wlc.js","/assets/useOpenParam-iLPUrXNB.js","/assets/useStatusBands-Du3yT12A.js","/assets/useUrlScope-BA-Sd2Dm.js","/assets/user-BrR1iPuv.js","/assets/user-cog-PBYNu_v7.js","/assets/users-BQns9LAO.js","/assets/vfx-eAYoFPb0.js","/assets/video-UgIuasyJ.js","/assets/wallet-CHIopgom.js","/assets/warehouse-DBJalAtW.js","/assets/x-DfF8pUc8.js","/assets/zap-BObWRVS7.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
