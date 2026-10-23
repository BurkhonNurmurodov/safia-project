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

const BUILD = "2026-10-23T12:24:37.358Z";
const PRECACHE = ["/","/assets/AdminPanel-BHI515iu.js","/assets/AnalysisBoard-xvtHmkcp.js","/assets/Arc-DBe5DjlW.js","/assets/Assistant-BXRiWePC.js","/assets/BrigadirProfile-Blo_XVmI.js","/assets/BroadcastReceivers-D8xR7Phn.js","/assets/BroadcastRecord-C90Rrz6_.js","/assets/Button-URD74ebQ.js","/assets/CatLockNotice-D38WTEek.js","/assets/CategoryLegendModal-BzLgoom0.js","/assets/CellConcerns-DIiuuLmR.js","/assets/CellDetails-B_kxQIED.js","/assets/CellFormModal-BUkPz5X5.js","/assets/CellIdent-BdYsTcwh.js","/assets/CellLink-B62z99s9.js","/assets/Cells-BUqhPGrL.js","/assets/ColumnFilter-Bvjq05gU.js","/assets/ColumnsPicker-C85ly5Oo.js","/assets/CommentsModal-DabXNMaD.js","/assets/ComparisonTable-BTuO9H_F.js","/assets/Concerns-C7T-stLo.js","/assets/CountStepper-DY01XqYy.js","/assets/Daily-d6ToJeeA.js","/assets/DataTable-DDcETZMX.js","/assets/DateRangePicker-CJ-Gnv33.js","/assets/DayReportView-Dg_brdEP.js","/assets/DayStepper-8OAQ_Z_l.js","/assets/DayStrip-CB9lWlka.js","/assets/DifferenceBreakdown-CKhquBHO.js","/assets/Downtime-eWVJmAjV.js","/assets/Education-B4Fsczsi.js","/assets/EducationLesson-CcPdC3Rv.js","/assets/EmptyState-CEvR_5vK.js","/assets/Exam-hxr_zWPV.js","/assets/FactorySelect-DCkzXSNp.js","/assets/Gamification-BXi6nD1a.js","/assets/GroupBadge-DWmDULjg.js","/assets/HeatmapChart-8Cpl2rLe.js","/assets/IdleCell-68la0VVC.js","/assets/KPICard-1JdhwW7Q.js","/assets/Kaizen-Yy7RWOF4.js","/assets/Kelish-CBm9Wky1.js","/assets/KpiDeltaCard-BmZyYpa3.js","/assets/LangTextInput-5mUrwLyL.js","/assets/Layout-jX3F0vEY.js","/assets/LeaderAppeal-DdoPj8ND.js","/assets/LeaderDayReport-GupPsCBl.js","/assets/LeaderUnitReport-DEH-nx1F.js","/assets/Leaderboard-D66kneGJ.js","/assets/Leaders-Bie11co7.js","/assets/LeadersKpi-IW0PxsyT.js","/assets/Lightbox-BEH5QTm9.js","/assets/LiveOverview-BL8K9H5G.js","/assets/Login-D7xXka8z.js","/assets/NotFound-Bw7hpyl4.js","/assets/Notifications-BgYipk1d.js","/assets/Ontime-XPIZxCzo.js","/assets/Overview-DSLg7nF2.js","/assets/Pagination-awbrntDG.js","/assets/PerenaladkaFactTable-C6UNd9My.js","/assets/PersonCard-vEl0GvWK.js","/assets/PlanFulfillment-DFoUOn-J.js","/assets/Production-C50X7eF4.js","/assets/Profile-BRwE-YP9.js","/assets/ProofCamera-Bo_r26pT.js","/assets/ProofPhoto-av98X8BR.js","/assets/Quality-CMJ2zW8a.js","/assets/RawRows-Dk825L_u.js","/assets/RequestStateChip-Dh9qLYkM.js","/assets/RichTextEditor-BottGfqW.js","/assets/SaveState-B4xPuPxn.js","/assets/SearchInput-DKExT5_K.js","/assets/SeasonalityHeatmap-B1hbEfH-.js","/assets/SegmentedToggle-nuc9g4fN.js","/assets/SetupTimes-CP3Y5IRf.js","/assets/ShiftDaily-D9qNRo0Y.js","/assets/Staff-BvHXb92O.js","/assets/StaffListAtCheck-pXAcQviU.js","/assets/StatusBadge-UzGGJGpw.js","/assets/StatusBandsModal-87K8Boc0.js","/assets/TargetGoal-B7e0vDZ1.js","/assets/Targets-D-hXk6bt.js","/assets/Tasks-CXnt3GTe.js","/assets/TimeWheelPicker-B5AVVpvP.js","/assets/Toast-DPaFbFqX.js","/assets/Tooltip-BpsznWUU.js","/assets/TrendChart-CjTTSvrS.js","/assets/TripleSpeedometer-DtK2qIP_.js","/assets/Trudoyomkost-BBS9_lU4.js","/assets/UploadDropzone-9bZFu2p5.js","/assets/UsersActivity-B1xTfBb6.js","/assets/VerdictBlock-BGJcEp7M.js","/assets/VfxApiMap-DpSG5zp1.js","/assets/VfxDictionaries-BqPzCBc5.js","/assets/VfxEmployees-6MHVEaoQ.js","/assets/VfxHrMoves-CxN5wtUj.js","/assets/VfxJobs-BiFg4lCf.js","/assets/VfxPhoto-PTwQh8qn.js","/assets/VfxShifts-D26QxlDJ.js","/assets/VfxState-D6Woxd62.js","/assets/VfxTimebooks-D08Tks2M.js","/assets/VfxTimesheet-DkDD8AHv.js","/assets/WatchProgress-C4yn-0PD.js","/assets/WebLogin-C_U_0h_6.js","/assets/Workers-BfnKm_Nm.js","/assets/Zagruzka-D8Ag9l6Q.js","/assets/ZagruzkaCell-M-E74OeO.js","/assets/api-BkoL0fHY.js","/assets/archive-D_hRem8n.js","/assets/archive-restore-BQ2qE-uN.js","/assets/arrow-down-DGdIwNqf.js","/assets/arrow-down-right-CLr0A6jD.js","/assets/arrow-down-wide-narrow-Q0ho8zAJ.js","/assets/arrow-up-narrow-wide-DrDCTZax.js","/assets/ban-CE1NAOPt.js","/assets/boxes-DzALyaav.js","/assets/braces-i7EpVOA2.js","/assets/brigadirFilters-CnZFCeLi.js","/assets/broadcastTree-O1RDlTvH.js","/assets/building-2-CttbpF5Z.js","/assets/calendar-D90MIMTg.js","/assets/calendar-days-Dcb_EFBO.js","/assets/camera-Cu_BwltY.js","/assets/categories-40eqGGLd.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cjxw7WND.js","/assets/chart-line-CWsHSUBF.js","/assets/chart-pie-6AGPII0r.js","/assets/chartRange-D_xpCo4U.js","/assets/check-check-C7X531f9.js","/assets/chevron-left-CxIsOt-S.js","/assets/chevrons-up-down-DuXA6eDa.js","/assets/circle-DWvqFFJo.js","/assets/circle-alert-D84Rsb5L.js","/assets/circle-check-big-DLQcmTPu.js","/assets/circle-dashed-Bo_R0aFP.js","/assets/circle-minus-DuRX3jKB.js","/assets/circle-question-mark-DjuqhH35.js","/assets/circle-slash-BDzf1TaP.js","/assets/circle-user-round--SKOTFcx.js","/assets/cloud-off-CwG0Brsv.js","/assets/cloud-upload-DSy5GCsp.js","/assets/compass-BDqRBqqT.js","/assets/concernCategories-HeEH9QIQ.js","/assets/corner-down-right-BRK7X7k-.js","/assets/createLucideIcon-BFI0FYGP.js","/assets/es-BamLnFCQ.js","/assets/external-link-CJkqeUFY.js","/assets/file-clock-CPCWOlbJ.js","/assets/file-exclamation-point-B6XEbTK3.js","/assets/flag-CszXnyxB.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Bin3nGB2.js","/assets/funnel-BPe0ggi6.js","/assets/hash-2ustCACu.js","/assets/hourglass-C5trCFKj.js","/assets/image-GwzNvM9V.js","/assets/image-off-Dh0CGREi.js","/assets/inbox-BqquoEZV.js","/assets/index-CanAs72_.js","/assets/index-DFvJry-Q.css","/assets/keyboard-BJM4KN3d.js","/assets/languages-DlUne4Z8.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-IQ3A8qxT.js","/assets/leaderBoard-k5ujfClT.js","/assets/lightbulb-JEHwF3mj.js","/assets/link-2-CcFYscjY.js","/assets/link-2-off-CTwCwHKZ.js","/assets/list-ordered-IprywTIQ.js","/assets/list-tree-DGX3VzgX.js","/assets/lock-open-B3nqVJs_.js","/assets/log-in-BFwtY_UZ.js","/assets/map-pin-225T4Sn3.js","/assets/marks-BmTH_r7B.js","/assets/minimize-2--YcPSueX.js","/assets/package-check-C5wZ3TmC.js","/assets/pencil-C7Y42lEh.js","/assets/percent-3U60p9ea.js","/assets/pin-BWwZrVN-.js","/assets/pin-off-Q3_OdIM9.js","/assets/play-CMH4uFEd.js","/assets/plug-zap-Bl8kayjG.js","/assets/prop-types-D2Lwo7Xx.js","/assets/radio-Dr1gUm_o.js","/assets/react-apexcharts.esm-BLyGXz7E.js","/assets/registers-CaI3nTwi.js","/assets/repeat-BaNMQmJt.js","/assets/save-DWvOLDm7.js","/assets/scopeLinks-CROGQT6P.js","/assets/scroll-text-BTaEsmjB.js","/assets/search-x-B-gOgRJw.js","/assets/segments-CoA_VGnj.js","/assets/send-CRuxMoa3.js","/assets/settings-2-CDR9pbRp.js","/assets/shield-DwffXVRR.js","/assets/shield-alert-CfDQTetx.js","/assets/shield-question-mark-DBxOGc2_.js","/assets/sigma-VvDgBjam.js","/assets/siren-3w0OeRDg.js","/assets/snowflake-ffMncgco.js","/assets/split-CI2fyXM0.js","/assets/square-check-big-BmWj-7Nr.js","/assets/star-DenSegVm.js","/assets/statusBands-Bt9yqdyg.js","/assets/store-VqSCowQB.js","/assets/table-2-DVtNXwdw.js","/assets/table-properties-D16v0Cs0.js","/assets/tag-DZCbhXRO.js","/assets/timer-off-lQ8QOH4H.js","/assets/trendBuckets-C4lU-5sJ.js","/assets/trending-down-D8grBHYj.js","/assets/trending-up-Bt4NAwbI.js","/assets/undo-2-pKBPNTsh.js","/assets/useChartTheme-B5KFWWWB.js","/assets/useElementWidth-Bmd3Q6fV.js","/assets/useIsMobile-Dn18cGhy.js","/assets/useOpenParam-BeR5zLKR.js","/assets/useStatusBands-BvDK4GSh.js","/assets/useUrlScope-OGYkmuaf.js","/assets/user-EXkA6F0t.js","/assets/user-cog-CNlZs-_S.js","/assets/user-minus-CH_5SOXO.js","/assets/users-ufMh0vGs.js","/assets/vfx-DC3tL1pS.js","/assets/video-I0RgXG7w.js","/assets/wallet-DRQV4-n8.js","/assets/warehouse-V7QsZrxX.js","/assets/workflow-Ck6UQf0m.js","/assets/x-C3AH3VLX.js","/assets/zap-CSIeG42g.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
