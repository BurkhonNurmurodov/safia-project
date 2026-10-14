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

const BUILD = "2026-10-14T15:48:07.855Z";
const PRECACHE = ["/","/assets/AdminPanel-Coon5YH1.js","/assets/AnalysisBoard-Db2hOPh4.js","/assets/Arc-BU3uFjl6.js","/assets/Assistant-BvYxaieG.js","/assets/BrigadirProfile-BOjWL6Mh.js","/assets/BroadcastReceivers-Cu7I033S.js","/assets/BroadcastRecord-CXnypdpq.js","/assets/Button-XqrCT88s.js","/assets/CatLockNotice-CSVJH9A2.js","/assets/CategoryLegendModal-DgPbH7Jo.js","/assets/CellConcerns-CLvLeV-P.js","/assets/CellDetails-Dey8qVCb.js","/assets/CellFormModal-CeasY8A7.js","/assets/CellIdent-CUePG6me.js","/assets/CellLink-C1ANw1zH.js","/assets/Cells-DOi0PL4T.js","/assets/ColumnFilter-DR9pCKL8.js","/assets/ColumnsPicker-CnVUWBoq.js","/assets/CommentsModal-D9up4coO.js","/assets/ComparisonTable-Ddcp25Ny.js","/assets/Concerns-D4-Y8wpv.js","/assets/CountStepper-CnMfFFof.js","/assets/Daily-DNGW7UFK.js","/assets/DataTable-CzEA8Bch.js","/assets/DateRangePicker-DNviMeTY.js","/assets/DayReportView-D9bQfdV6.js","/assets/DayStepper-CnQWcFAo.js","/assets/DifferenceBreakdown-DY5rg5LX.js","/assets/Downtime-CXr_ijGc.js","/assets/Education-S3Dad0uI.js","/assets/EducationLesson-VGmnBU1I.js","/assets/EmptyState-BeXlaPWZ.js","/assets/Exam-BUXVh2iI.js","/assets/FactorySelect-BVq52AOI.js","/assets/Gamification-BXXMAStr.js","/assets/GroupBadge-CRd2nUzd.js","/assets/HeatmapChart-CNz1Z3EI.js","/assets/IdleCell-D2GSQmCa.js","/assets/KPICard-BEuEywAN.js","/assets/Kaizen-no5Moi-s.js","/assets/Kelish-DbTnYAvE.js","/assets/KpiDeltaCard-DUqy8s4o.js","/assets/LangTextInput-jP-CK0yG.js","/assets/Layout-CbJnhFST.js","/assets/LeaderAppeal-CiUjfapY.js","/assets/LeaderDayReport-9HJxjz1O.js","/assets/LeaderUnitReport-Clv_MTXf.js","/assets/Leaderboard-bk1pPhpj.js","/assets/Leaders-BhVSHFPm.js","/assets/Lightbox-CVpaThJ8.js","/assets/LiveOverview-BhiGiUlm.js","/assets/Login-GLUG4ig7.js","/assets/NotFound-qPiFE8rG.js","/assets/Notifications-DnPjienG.js","/assets/Overview-BSbVjpAR.js","/assets/Pagination-DjpWOxPP.js","/assets/PerenaladkaFactTable-DSgV_qe0.js","/assets/PersonCard-Do8qtNni.js","/assets/PlanFulfillment-Dq_Y9hH3.js","/assets/Production-BXxr43ab.js","/assets/Profile-CxWK2Gxq.js","/assets/ProofCamera-CaXgWayk.js","/assets/Quality-z4vLLLeQ.js","/assets/RawRows-CigdN2vk.js","/assets/RequestStateChip-JGQHQqns.js","/assets/RichTextEditor-O8h7yOB4.js","/assets/SaveState-B-T597uW.js","/assets/SearchInput-DEf3cWLh.js","/assets/SeasonalityHeatmap-CPCtPeq6.js","/assets/SegmentedToggle-BqtFUV-O.js","/assets/SetupTimes-D_eP9H2C.js","/assets/ShiftDaily-DWpxOnL6.js","/assets/Staff-C4DBN8rx.js","/assets/StaffListAtCheck-DkgmiO82.js","/assets/StatusBadge-C39PjnjK.js","/assets/TargetGoal-BhMwAMdj.js","/assets/Targets-BlZoOY_n.js","/assets/Tasks-AheyqQMx.js","/assets/TimeWheelPicker-fMLDv1y4.js","/assets/Toast-C9Mgg3Td.js","/assets/Tooltip-CBfOd2qQ.js","/assets/TrendChart-CJfhxmFZ.js","/assets/TripleSpeedometer-C7FI6Qem.js","/assets/Trudoyomkost-B0IQJGEt.js","/assets/Turnover-cvvbl-BH.js","/assets/UploadDropzone-BRiP6K7u.js","/assets/UsersActivity-rgWNKPpU.js","/assets/VerdictBlock-As7VSsFq.js","/assets/VfxApiMap-BoNlFbo9.js","/assets/VfxDictionaries-BTJvP9h6.js","/assets/VfxEmployees-BZFuiw-m.js","/assets/VfxHrMoves-B7fsyvVW.js","/assets/VfxJobs-CjbVjZPU.js","/assets/VfxPhoto-y6VdnXwY.js","/assets/VfxShifts-C_0uJXY9.js","/assets/VfxState-BkhZs09C.js","/assets/VfxTimebooks-BAqG847i.js","/assets/VfxTimesheet-EQdYx3XX.js","/assets/WatchProgress-DopZG4bF.js","/assets/WebLogin-DCfp_3Av.js","/assets/WorkerConcerns-BIhSQboV.js","/assets/Workers-QUPzTJfV.js","/assets/Zagruzka-CShOAJZg.js","/assets/ZagruzkaCell-Bu8Fl_SJ.js","/assets/api-BJ_-WNyA.js","/assets/archive-BwzK1OiO.js","/assets/archive-restore-DL7_Hqvy.js","/assets/arrow-down-DR-6pJV9.js","/assets/arrow-down-wide-narrow-CuYvMr2H.js","/assets/arrow-up-narrow-wide-DLr9dehl.js","/assets/award-BqhD1dt1.js","/assets/ban-j4V4ChsW.js","/assets/boxes-BG6G5Gqm.js","/assets/braces-dtxq-Vkl.js","/assets/brigadirFilters-W4r7ybAP.js","/assets/broadcastTree-BXQzNd5n.js","/assets/building-2-mjEn1-lx.js","/assets/calculator-I1NFpdRL.js","/assets/calendar-D4Frl0qH.js","/assets/calendar-days-DStfJFOX.js","/assets/camera-5fdoAhBP.js","/assets/categories-T5GgSZFF.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-rsitoxST.js","/assets/chart-line-vnbkovHC.js","/assets/chart-pie-DNGtJP71.js","/assets/chartRange-CWoblm3x.js","/assets/check-check-BIFrWhof.js","/assets/chevron-left-OI61dnnA.js","/assets/chevrons-up-down-_pLT4q61.js","/assets/circle-DQIEvRRT.js","/assets/circle-alert-D_QxS76d.js","/assets/circle-check-big-Dv-ZpsGJ.js","/assets/circle-dashed-VPgp2lu8.js","/assets/circle-minus-DNTVoq49.js","/assets/circle-question-mark-DcCiK0eO.js","/assets/circle-slash-9Rzp6i1f.js","/assets/circle-user-round-IxTiVG8i.js","/assets/clock-3-CpzxepUp.js","/assets/cloud-off-Dknm2A50.js","/assets/cloud-upload-D0nFlk3s.js","/assets/compass-BZpxK3sr.js","/assets/concernCategories-C9G9wFMt.js","/assets/copy-Bsr6hyeN.js","/assets/corner-down-right-DdRoCp0m.js","/assets/createLucideIcon-BgmQWYRt.js","/assets/es-DMU4qWZ2.js","/assets/external-link-C5ndSsQe.js","/assets/file-clock-CP2uhEHD.js","/assets/file-exclamation-point-YCssaRbg.js","/assets/flag-CLjmApD4.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-COPWZPNn.js","/assets/hash-qFV3MvAU.js","/assets/hourglass-B-tzCkjM.js","/assets/image-DQgjoh4w.js","/assets/image-off-CqeBYlmU.js","/assets/inbox-Bf8JU1f0.js","/assets/index-BkJ1-Ja2.js","/assets/index-DWCq5gUB.css","/assets/keyboard-Czwrd3Bq.js","/assets/languages-Cg4KYNR1.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BS1KSqmx.js","/assets/lightbulb-D_6NALud.js","/assets/link-2-BPrCKUo3.js","/assets/link-2-off-D8J4W_u3.js","/assets/list-ordered-BK7SInTT.js","/assets/list-tree-BuCrGBxy.js","/assets/lock-open-DcPrrcp-.js","/assets/log-in-mNbv-Xuh.js","/assets/marks-BH4JD7Wy.js","/assets/minimize-2-frU03uYq.js","/assets/package-check-345QqQPu.js","/assets/pencil-BsRtqMGP.js","/assets/percent-BRIfFQ3A.js","/assets/pin-BTWmtj_S.js","/assets/pin-off-DStFNlxN.js","/assets/play-DFTYlfn3.js","/assets/plug-zap-CjxQx8Jj.js","/assets/prop-types-nb0VfDkD.js","/assets/radio-4SJ2BcvR.js","/assets/react-apexcharts.esm-BosuX_k-.js","/assets/registers-EvA7UJav.js","/assets/repeat-Chltzb-p.js","/assets/save-DZasF4Ni.js","/assets/scopeLinks-DkUt_nIx.js","/assets/scroll-text-DrDBdoir.js","/assets/search-x-CVC-fVyM.js","/assets/segments-BWUuKvEP.js","/assets/send-C6evHqwg.js","/assets/settings-2-Z8_A-81K.js","/assets/shield-BfBnLL5C.js","/assets/shield-alert-09vcSwMg.js","/assets/shield-question-mark-q0V_uFjY.js","/assets/siren-DMxXcwVb.js","/assets/snowflake-8jNqBeuD.js","/assets/split-Coiaqug-.js","/assets/square-check-big-CyfoOHKy.js","/assets/star-Dng2ggTT.js","/assets/statusBands-CqEvFYsb.js","/assets/store-5NIyJUv_.js","/assets/table-2-DHFixOZw.js","/assets/table-properties-CwWf31jT.js","/assets/tag-v41VLkXg.js","/assets/timer-off-DoS4EUq_.js","/assets/trending-down-B4youiMK.js","/assets/trending-up-C1snbeZw.js","/assets/undo-2-XQ32iwmj.js","/assets/useChartTheme-Cp3vTEVM.js","/assets/useElementWidth-CQwgU7Qh.js","/assets/useIsMobile-DoaKmX3x.js","/assets/useOpenParam-obSEUMk_.js","/assets/useStatusBands-DoDcEoi1.js","/assets/useUrlScope-NaS5Z_BN.js","/assets/user-DIpa9bnG.js","/assets/user-cog-BGqexObk.js","/assets/users-K7zFXejf.js","/assets/vfx-B41XHnhu.js","/assets/video-BJK_Opdr.js","/assets/wallet-T9jzOyqA.js","/assets/warehouse-CyQ4S-gC.js","/assets/workflow-DQ1zkwL4.js","/assets/x-DhJ0Wd_j.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
