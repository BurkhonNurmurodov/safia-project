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

const BUILD = "2026-10-23T16:13:38.862Z";
const PRECACHE = ["/","/assets/AdminPanel-CkGfiayu.js","/assets/AnalysisBoard-D1biY9Pi.js","/assets/Arc-CyD6IGdN.js","/assets/Assistant-ragmgFvB.js","/assets/BrigadirProfile-9jSK5X9m.js","/assets/BroadcastReceivers-CyLb1TTd.js","/assets/BroadcastRecord-CFWCFrJc.js","/assets/Button-5eVvU83W.js","/assets/CatLockNotice-yDiQdnyI.js","/assets/CategoryLegendModal-gmsBR9NQ.js","/assets/CellConcerns-DnhFRNP4.js","/assets/CellDetails-BDWHUYcA.js","/assets/CellFormModal-DbgauYqA.js","/assets/CellIdent-yM_E_0c7.js","/assets/CellLink-CYjm9YTR.js","/assets/Cells-B8Ao9IYQ.js","/assets/ColumnFilter-D1zAZ6wA.js","/assets/ColumnsPicker-kuZExIux.js","/assets/CommentsModal-Dpk0H0QU.js","/assets/ComparisonTable-CSzI0RQ5.js","/assets/Concerns-BVGK0zij.js","/assets/CountStepper-CLokH0e5.js","/assets/Daily-DOQbM3fQ.js","/assets/DataTable-RXlmmice.js","/assets/DateRangePicker-Smnfo-WZ.js","/assets/DayReportView-DpF7jt0I.js","/assets/DayStepper-B-LFTnzu.js","/assets/DayStrip-CUXFSYEe.js","/assets/DifferenceBreakdown-DRPcpFNp.js","/assets/Downtime-s43EI0Ke.js","/assets/Education-DIWL42EC.js","/assets/EducationLesson-2B7pGPcK.js","/assets/EmptyState-p2KQXvOI.js","/assets/Exam-BI5F18fA.js","/assets/FactorySelect-DKW3Btd8.js","/assets/Gamification-DMANV-0N.js","/assets/GroupBadge-FiFyEFcM.js","/assets/HeatmapChart-CkLveayr.js","/assets/IdleCell-vz1BfOx8.js","/assets/KPICard-DfruktEH.js","/assets/Kaizen-B_sMS3XP.js","/assets/Kelish-D61XGmQS.js","/assets/KpiDeltaCard-Dy6wGXEP.js","/assets/LangTextInput-Cm4BEjF1.js","/assets/Layout-CeK8AIGD.js","/assets/LeaderAppeal-CHzym0t8.js","/assets/LeaderDayReport-Dc60zBy4.js","/assets/LeaderUnitReport-BON5CbBv.js","/assets/Leaderboard-K2aBiHqg.js","/assets/Leaders-ChpX10lA.js","/assets/LeadersKpi-vcNxB1Ww.js","/assets/Lightbox-CiL6WGta.js","/assets/LiveOverview-DIuNxSLg.js","/assets/Login-Bh-9WxwA.js","/assets/NotFound-DZbozi0H.js","/assets/Notifications-B1xk5g-k.js","/assets/Ontime-B4GgMf8x.js","/assets/Overview-C2fcxRAS.js","/assets/Pagination-DPCVNrtv.js","/assets/PerenaladkaFactTable-ChLMwpqm.js","/assets/PersonCard-CTsunbsm.js","/assets/PlanFulfillment-CcH3qCXN.js","/assets/Production-DHcJHG-F.js","/assets/Profile-GJQ1Pfw5.js","/assets/ProofCamera-Dl1b6NA0.js","/assets/ProofPhoto-dWN_e1wM.js","/assets/Quality-CtIaJwG6.js","/assets/RawRows-Zy_QP8gn.js","/assets/RequestStateChip-DZyhDdf2.js","/assets/RichTextEditor-CS2tNt0Q.js","/assets/SaveState-BrG1pLky.js","/assets/SearchInput-CqlmWNgy.js","/assets/SeasonalityHeatmap-DerDmbai.js","/assets/SegmentedToggle-9jEcqMe3.js","/assets/SetupTimes-DvaMyU1o.js","/assets/ShiftDaily-BIODEV56.js","/assets/Staff-DKlDYpEA.js","/assets/StaffListAtCheck-Bm1hJaPS.js","/assets/StatusBadge-CUlW_9zP.js","/assets/StatusBandsModal-DMNUqz6X.js","/assets/TargetGoal-DYm4sMwQ.js","/assets/Targets-BblqPRXR.js","/assets/Tasks-BcEHXfdr.js","/assets/TimeWheelPicker-CFfoYuVd.js","/assets/Toast-BE9p51nh.js","/assets/Tooltip-Ch5zTUlp.js","/assets/TrendChart-BCiDyAUW.js","/assets/TripleSpeedometer-CU5sw_uB.js","/assets/Trudoyomkost-Z6gwwV1L.js","/assets/UploadDropzone-BBFsIkXd.js","/assets/UsersActivity-BVITJDK4.js","/assets/VerdictBlock-D9DubLyw.js","/assets/VfxApiMap-D6hk5_Zo.js","/assets/VfxDictionaries-Cl34g2yM.js","/assets/VfxEmployees-CnXIq4HL.js","/assets/VfxHrMoves-BRbQIXMb.js","/assets/VfxJobs-Ak9KZaGP.js","/assets/VfxPhoto-DgrIe4mb.js","/assets/VfxShifts-Be0b4Zkr.js","/assets/VfxState-DwR-WTKr.js","/assets/VfxTimebooks-BOBA6AUa.js","/assets/VfxTimesheet-B_9a6t73.js","/assets/WatchProgress-CPJaVsXM.js","/assets/WebLogin-3Hk6YLgJ.js","/assets/Workers-CZW3qrhv.js","/assets/Zagruzka-Bn5Wl2lj.js","/assets/ZagruzkaCell-C1UbtcAi.js","/assets/api-Dj3Lmrhm.js","/assets/archive-DeQg9SpV.js","/assets/archive-restore-CLi3k8CO.js","/assets/arrow-down-BUxzyThB.js","/assets/arrow-down-right-C1tvzyjy.js","/assets/arrow-down-wide-narrow-DIlHVEd3.js","/assets/arrow-up-narrow-wide-y7lB9oQn.js","/assets/ban-_h07AGLp.js","/assets/boxes-DQ3mhYKP.js","/assets/braces-Bw9orbC1.js","/assets/brigadirFilters-Au8TvwQp.js","/assets/broadcastTree-BPPUjBKc.js","/assets/building-2-C4zxUvzB.js","/assets/calendar-BzC4ywhb.js","/assets/calendar-days-hrl-7nsB.js","/assets/camera-C1WyQfN1.js","/assets/categories-Bu_oxQ-6.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B-4P_6iB.js","/assets/chart-line-CnK_CTxL.js","/assets/chart-pie-CscNEgHB.js","/assets/chartRange-849R5eNu.js","/assets/check-check-rluXhoPK.js","/assets/chevron-left-DGBDGlaA.js","/assets/chevrons-up-down-BzRTqBfj.js","/assets/circle-Ck7f8-9E.js","/assets/circle-alert-Ce_xbqWN.js","/assets/circle-check-big-Bdy-ycOv.js","/assets/circle-dashed-BGLmCpGZ.js","/assets/circle-minus-a6BhTDbz.js","/assets/circle-question-mark-DDxO7InG.js","/assets/circle-slash-CIUOZ7it.js","/assets/circle-user-round-BkPr7WTC.js","/assets/cloud-off-Jg4MPjeV.js","/assets/cloud-upload-Biu4xtOe.js","/assets/compass-Ciavc534.js","/assets/concernCategories-D81tVuXn.js","/assets/corner-down-right-DEntvY5q.js","/assets/createLucideIcon-BhMH25Bu.js","/assets/es-C6_i4iyD.js","/assets/external-link-BMJ7J-re.js","/assets/file-clock-Cw44ANhE.js","/assets/file-exclamation-point-DPrAGwx_.js","/assets/flag-lwjRz09G.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-RK1Qwr5H.js","/assets/funnel-AbtP8LFl.js","/assets/hash-q6RCXNXU.js","/assets/hourglass-k3vZ-EIi.js","/assets/image-B3Dzwq8j.js","/assets/image-off-CWnyhqPY.js","/assets/inbox-L5ysTwHp.js","/assets/index-BUoCj2A6.js","/assets/index-DbWdbTAg.css","/assets/keyboard-C9WrWaoj.js","/assets/languages-CIOkyWQG.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CIgYVDEV.js","/assets/leaderBoard-Dm7Alvu9.js","/assets/lightbulb-CUtUfSCS.js","/assets/link-2-ChLxliU3.js","/assets/link-2-off-YJSsmhof.js","/assets/list-ordered-CET8mo8y.js","/assets/list-tree-CFNY2uFY.js","/assets/lock-open-CjDy3gF9.js","/assets/log-in-DkxBqD3D.js","/assets/map-pin-DrlG55ik.js","/assets/marks-BpIdYbXS.js","/assets/minimize-2-BzcxRzRh.js","/assets/package-check-BTkBYcw9.js","/assets/pencil-UsYxDzpQ.js","/assets/percent-BVFoVQ5p.js","/assets/pin-DpQ9FJ28.js","/assets/pin-off-CtjnCzZd.js","/assets/play-C27V0CMs.js","/assets/plug-zap-Bcy5-e_Q.js","/assets/prop-types-CxyrVNZ3.js","/assets/radio-CYbhyzuk.js","/assets/react-apexcharts.esm-aHRl2Swu.js","/assets/registers-CDghgPBN.js","/assets/repeat-k0q9lVi1.js","/assets/save-B1nln-3i.js","/assets/scopeLinks-e4sQ5t7l.js","/assets/scroll-text-Ceru7iWa.js","/assets/search-x-DnJW5r5g.js","/assets/segments-CnzZUgQA.js","/assets/send-CUjWRpu5.js","/assets/settings-2-Cj1s7cY8.js","/assets/shield-B6PqwPYi.js","/assets/shield-alert-HI9p1t0u.js","/assets/shield-question-mark-BLgmBYOh.js","/assets/sigma-B1uuYxIw.js","/assets/siren-CmG6GBtK.js","/assets/snowflake-DP6yHSmF.js","/assets/split-BkJLu2wt.js","/assets/square-check-big-DgDxoq3Y.js","/assets/star-6CumLoQH.js","/assets/statusBands-BJWaiAqf.js","/assets/store-RiZPvm4y.js","/assets/table-2-B7sIjsvD.js","/assets/table-properties-QVVUVtjv.js","/assets/tag-BnZbzzqR.js","/assets/timer-off-CVLUoEWD.js","/assets/trendBuckets-CbQPHGSP.js","/assets/trending-down-BOWdDwOd.js","/assets/trending-up-BF12FOy7.js","/assets/undo-2-D3Dh8NqR.js","/assets/useChartTheme-q18yHVSM.js","/assets/useElementWidth-C5WjZ6DD.js","/assets/useIsMobile-Prqra-VM.js","/assets/useOpenParam-LeLo213y.js","/assets/useStatusBands-CqFTdJnn.js","/assets/useUrlScope-DEdJqYAN.js","/assets/user-CvBXgUXg.js","/assets/user-cog-CAVmuJ2o.js","/assets/user-minus-BA23Fyf5.js","/assets/users-n9An3Xk8.js","/assets/vfx-BffjDuKv.js","/assets/video-30ePTlA9.js","/assets/wallet-C5G7SAiq.js","/assets/warehouse-BSoy6cuY.js","/assets/workflow-wTxJhZxU.js","/assets/x-CYaTGdT2.js","/assets/zap-D1y46jFp.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
