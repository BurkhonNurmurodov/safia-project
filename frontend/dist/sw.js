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

const BUILD = "2026-10-09T04:43:57.497Z";
const PRECACHE = ["/","/assets/AdminPanel-DW6FPfE4.js","/assets/AnalysisBoard-NiGiO4Bi.js","/assets/Arc-DOx7FRjh.js","/assets/Assistant-BJC3pRHC.js","/assets/BrigadirProfile-BNlY74FR.js","/assets/BroadcastReceivers-D5UNGW3P.js","/assets/BroadcastRecord-BXUV7L1j.js","/assets/Button-D9dTtLm1.js","/assets/CatLockNotice-vQ9605Ia.js","/assets/CategoryLegendModal-CxYYip0X.js","/assets/CellConcerns-B462CXGb.js","/assets/CellDetails-C9sANweD.js","/assets/CellFormModal-Dc8GBk1L.js","/assets/CellIdent-DgY2Mcrt.js","/assets/CellLink-BmPDqxPy.js","/assets/Cells-BmjEHwPH.js","/assets/ColumnFilter-8VRAihsz.js","/assets/ColumnsPicker-CJUpBjrf.js","/assets/CommentsModal-C-kwlxz3.js","/assets/ComparisonTable-CU9oFrh0.js","/assets/Concerns-DyqKOkyB.js","/assets/Daily-zEufEa43.js","/assets/DataTable-HAJTu9Rm.js","/assets/DateRangePicker-DMEiww1J.js","/assets/DayReportView-CJWan-qq.js","/assets/DayStepper-BVUtJ4Uw.js","/assets/DifferenceBreakdown-CQlgo7iA.js","/assets/Downtime-BvCGlms2.js","/assets/Education-DSrqR1_t.js","/assets/EducationLesson-ZyB0BeYT.js","/assets/EmptyState-C37TocQl.js","/assets/Exam-QCiGQ7uZ.js","/assets/FactorySelect-X2NgZb9D.js","/assets/Gamification-b5KgjJZN.js","/assets/GroupBadge-CWW8csBr.js","/assets/HeatmapChart-D2w8n6xQ.js","/assets/IdleCell-DG48Qw36.js","/assets/KPICard-DDXIDOly.js","/assets/Kaizen-Cttr15qL.js","/assets/Kelish-1tVUFANt.js","/assets/KpiDeltaCard-CNq1eYwf.js","/assets/LangTextInput-CJrooZdT.js","/assets/Layout-Cvb7b10i.js","/assets/LeaderAppeal-DBOfNzXE.js","/assets/LeaderDayReport-B4BGVnBC.js","/assets/LeaderUnitReport-DifEJh5l.js","/assets/Leaderboard-CPxe1UG9.js","/assets/Leaders-BWTa576D.js","/assets/Lightbox-JuamadFl.js","/assets/LiveOverview--KQzmcZl.js","/assets/Login-BI7NFLm4.js","/assets/NotFound-DH0MSLRM.js","/assets/Notifications-D_e2c1WD.js","/assets/Overview-Bjwean8V.js","/assets/Pagination-BFrQsYKK.js","/assets/PerenaladkaFactTable-B2S6Hs4_.js","/assets/PersonCard-COS7vGQA.js","/assets/PlanFulfillment-B_-iKW33.js","/assets/Production-DFjIGW6c.js","/assets/Profile-htSdlYGg.js","/assets/ProofCamera-uRtZssLL.js","/assets/ProofPhoto-ChZ4zbAZ.js","/assets/Quality-CSe9H0LD.js","/assets/RawRows-d-FP-Y64.js","/assets/RequestStateChip-zl24UZAw.js","/assets/RichTextEditor-Cvx2AUsP.js","/assets/SaveState-Crs0HoDr.js","/assets/SearchInput-Oeg1VDa9.js","/assets/SeasonalityHeatmap-CGWZJ9X6.js","/assets/SegmentedToggle-DorJ43dK.js","/assets/SetupTimes-D2VbI_86.js","/assets/ShiftDaily-B9IgxAzJ.js","/assets/Staff-X9Gt0NJT.js","/assets/StatusBadge-CDKi_rxr.js","/assets/TargetGoal--SIdAJVO.js","/assets/Targets-CebnM0xs.js","/assets/Tasks-lD0lsefG.js","/assets/TimeWheelPicker-Bmo09zDt.js","/assets/Toast-DPD8YmkN.js","/assets/Tooltip-DgiovC1_.js","/assets/TrendChart-CKXRMmT8.js","/assets/TripleSpeedometer-DuoJ4G0R.js","/assets/Trudoyomkost-BOkqS14B.js","/assets/Turnover-CY6y1oax.js","/assets/UploadDropzone-D2f9tMd6.js","/assets/UsersActivity-DUj2luHI.js","/assets/VerdictBlock-CR2RMRPa.js","/assets/VfxApiMap-BzB6MMxk.js","/assets/VfxDictionaries-BY-JdkIo.js","/assets/VfxEmployees-D09odO8t.js","/assets/VfxHrMoves-egFJqvJJ.js","/assets/VfxJobs-BC9Z-bsA.js","/assets/VfxPhoto-B6AsdGT2.js","/assets/VfxShifts-CwF5qr1x.js","/assets/VfxState-3RfpviyT.js","/assets/VfxTimebooks-CrpCPf7A.js","/assets/VfxTimesheet-CyKRol_B.js","/assets/WatchProgress-C7I0YFKt.js","/assets/WebLogin-CsMDOlIU.js","/assets/WorkerConcerns-CfHSUg9V.js","/assets/Workers-BGwyZS6A.js","/assets/Zagruzka-CvSWlpax.js","/assets/ZagruzkaCell-DWYioHTj.js","/assets/api-BuOcdYjJ.js","/assets/archive-BPwGlXFQ.js","/assets/archive-restore-CrcOxFXY.js","/assets/arrow-down-D0eJE_-H.js","/assets/arrow-down-wide-narrow-BP3D4-3o.js","/assets/arrow-up-narrow-wide-CNJvddSJ.js","/assets/award-BaVZkzwN.js","/assets/ban-Bxh3wPEJ.js","/assets/boxes-CMefUEMK.js","/assets/braces-BEDmfjW3.js","/assets/brigadirFilters-DemP6iQ2.js","/assets/broadcastTree-DQlaeYlu.js","/assets/building-2-Bu5C9lhw.js","/assets/calculator-WQqJfbpy.js","/assets/calendar-BRBWWzdq.js","/assets/calendar-days-CxuhfkDb.js","/assets/camera-Dw8wjMlr.js","/assets/categories-DN9-ixBK.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DuYWG4fP.js","/assets/chart-line-gj1dSXbF.js","/assets/chart-pie-DOJXwOVc.js","/assets/chartRange-C2xhsQHx.js","/assets/check-check-B7iC02v2.js","/assets/chevron-left-ajKczmH2.js","/assets/chevrons-up-down-Bh06hIaA.js","/assets/circle-COFewfZ_.js","/assets/circle-alert-B-0uJ_w2.js","/assets/circle-check-big-gLVAmim_.js","/assets/circle-dashed-LLPpg8Hf.js","/assets/circle-minus-CzrGOzGi.js","/assets/circle-question-mark-DssTj1g0.js","/assets/circle-slash-DMQLIQjA.js","/assets/circle-user-round-BEikdQrw.js","/assets/clock-3-B7opbuQZ.js","/assets/cloud-off-DzAfVNqB.js","/assets/cloud-upload-DCh4B9Ws.js","/assets/compass-BBNrJ5Fs.js","/assets/concernCategories-VtDBGwEN.js","/assets/copy-BMjKsuo3.js","/assets/corner-down-right-BHtTvSju.js","/assets/createLucideIcon-BAAoxDCT.js","/assets/es-ByWJFgvT.js","/assets/external-link-ChYetCMv.js","/assets/file-clock-Btip4qSG.js","/assets/file-exclamation-point-2f5lKXst.js","/assets/flag-DB4uoO59.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DXYNcm0o.js","/assets/hash-B6hm67G2.js","/assets/hourglass-Ds8uBbTI.js","/assets/image-COoSiFFD.js","/assets/image-off-BOjwK3Ff.js","/assets/inbox-CEMBojAs.js","/assets/index-DFfGVOG_.css","/assets/index-bqsHZ8tb.js","/assets/keyboard-B1_ypmkG.js","/assets/languages-bu-7Zkdx.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CI6lo2ft.js","/assets/lightbulb-1tBePs-k.js","/assets/link-2-OHzmlBNj.js","/assets/link-2-off-pAkDEywL.js","/assets/list-ordered-BrIKAUnP.js","/assets/list-tree-BrbdFBp6.js","/assets/lock-open-BZeNjCVn.js","/assets/log-in-B67C-lv7.js","/assets/minimize-2-BgpB_tui.js","/assets/package-check-LwUhVu78.js","/assets/pencil-CM19TOLE.js","/assets/percent-CROSVhfg.js","/assets/pin-Ca6HqeHc.js","/assets/pin-off-Xy06PUf0.js","/assets/play-BdDDSfd2.js","/assets/plug-zap-D4XG2T7Y.js","/assets/prop-types-DpJEqrVb.js","/assets/radio-BfGQI4mQ.js","/assets/react-apexcharts.esm-TM-4IsA_.js","/assets/registers-DLhTZbNz.js","/assets/repeat-CTuA6SeO.js","/assets/save-BQ793ePS.js","/assets/scopeLinks-DdSD4TeQ.js","/assets/scroll-text-FJWA39aL.js","/assets/search-x-DJiaUhs0.js","/assets/segments-BlN5QGq3.js","/assets/send-Ce7_b2Kx.js","/assets/settings-2-CUP37ZHr.js","/assets/shield-ZsP4wBEo.js","/assets/shield-alert-WTDbBeb7.js","/assets/shield-question-mark-BU8Aje50.js","/assets/siren-CiPyccRD.js","/assets/snowflake-gn4PVOGP.js","/assets/split-CQft5CC1.js","/assets/square-check-big-DkCPhxKY.js","/assets/star-bscUuO8Y.js","/assets/statusBands-D8BQXLQn.js","/assets/store-J5SEkZWO.js","/assets/table-2-CciCVoEw.js","/assets/table-properties-DivPN__G.js","/assets/tag-DaaGUijP.js","/assets/timer-off-BRYW8uxe.js","/assets/trending-down-BOi3V3oO.js","/assets/trending-up-DG6jIJ2R.js","/assets/undo-2-CATgZqFP.js","/assets/useChartTheme-C7qdaHYc.js","/assets/useElementWidth-kpLU1RIC.js","/assets/useIsMobile-Bumkm8V_.js","/assets/useOpenParam-C-fHSW0t.js","/assets/useStatusBands-N5M8KXx0.js","/assets/useUrlScope-CwRKKl4N.js","/assets/user-Pdt2qZFV.js","/assets/user-cog-CwDxmFkM.js","/assets/users-zXu0tyqF.js","/assets/vfx-BQTOzRry.js","/assets/video-zTxqXVEJ.js","/assets/wallet-DgjUbf7Z.js","/assets/warehouse-D97bocfA.js","/assets/x-CMhLJWIa.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
