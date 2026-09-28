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

const BUILD = "2026-09-28T08:08:12.038Z";
const PRECACHE = ["/","/assets/AdminPanel-BFi-3dQu.js","/assets/AnalysisBoard-C80-Ddas.js","/assets/Arc-CA4D8eNC.js","/assets/ArcLegacy-De5rbR67.js","/assets/AttendanceModal-D_tISMxI.js","/assets/BrigadirProfile-xbrNjE8G.js","/assets/BroadcastReceivers-CJcVIxKl.js","/assets/BroadcastRecord-DyoWLahp.js","/assets/CatLockNotice-CAZVHhb7.js","/assets/CategoryLegendModal-qHEnmVZz.js","/assets/CellConcerns-DE5HSlDN.js","/assets/CellDetails-7OFBMBky.js","/assets/CellFormModal-Bild7BWX.js","/assets/CellLink-ALwOc6f1.js","/assets/Cells-BLJEmoeu.js","/assets/ColumnFilter-CREsBLoV.js","/assets/ColumnsPicker-BWWVEpzh.js","/assets/CommentsModal-DdrIMefA.js","/assets/ComparisonTable-CGiDWE0i.js","/assets/Concerns-Cl6ubYsU.js","/assets/ConfirmDialog-BrymioqQ.js","/assets/Daily-DjW7M75q.js","/assets/DataTable-BikZylqs.js","/assets/DateRangePicker-CG7jOCzX.js","/assets/DayReportView-CzBrPugN.js","/assets/DayStepper-DGOOO4G0.js","/assets/DifferenceBreakdown-wbTbvHBe.js","/assets/Downtime-PdE0ssks.js","/assets/Education-BUKuZ1Ew.js","/assets/EducationLesson-C9pmkEdc.js","/assets/EmptyState-jx7HxasN.js","/assets/Exam-Cuz1pNWT.js","/assets/FactorySelect-DDeg_oXB.js","/assets/Gamification-X1SIaSKa.js","/assets/GroupBadge-COE-afaf.js","/assets/HeatmapChart-BiC7Gk9U.js","/assets/IdleCell-CPwHBNcu.js","/assets/KPICard-DnCoO8nt.js","/assets/Kaizen-Dt5u-nCY.js","/assets/KpiDeltaCard-DS8CLPYs.js","/assets/LangTextInput-vWDRSrCB.js","/assets/Layout-Y34rvS_I.js","/assets/LeaderAppeal-BEoifDAb.js","/assets/LeaderDayReport-BwxJmBKz.js","/assets/LeaderUnitReport-a4FOAEyR.js","/assets/Leaderboard-B_WuxYoG.js","/assets/Leaders-DtaguDxg.js","/assets/Lightbox-BywxJpvn.js","/assets/LiveOverview-CSfFfORs.js","/assets/Login-CT13JHCF.js","/assets/NotFound-BlBu8Ilh.js","/assets/Overview-DjfpvYzJ.js","/assets/Pagination-BokvwkND.js","/assets/PerenaladkaFactTable-_r6sYP4U.js","/assets/PlanFulfillment-DQ5TCZu3.js","/assets/Production-b5najezJ.js","/assets/Profile-DzxI3Vvn.js","/assets/ProofCamera-qUD_FAKD.js","/assets/ProofPhoto-DOK78ivS.js","/assets/Quality-C7TYE4Fq.js","/assets/RequestStateChip-BkGl5N5S.js","/assets/RichTextEditor-CGfv3R_a.js","/assets/SaveState-DKWMSbV6.js","/assets/SearchInput-CMMkcoqC.js","/assets/SeasonalityHeatmap-C3NZ4_4C.js","/assets/SegmentedToggle-CbnChjyq.js","/assets/SetupTimes-DaxsY_IC.js","/assets/ShiftDaily-DL3GsN5S.js","/assets/Staff-6KebGSoy.js","/assets/StatusBadge-Bw2k8Ozz.js","/assets/TargetGoal-IBQZGTqF.js","/assets/Targets-CU2doQRr.js","/assets/Tasks-CougQ5fp.js","/assets/TimeWheelPicker-gptovZuC.js","/assets/Tooltip-c9r1yubG.js","/assets/TrendChart-CeOGyE3Z.js","/assets/TripleSpeedometer-BZYX4oZq.js","/assets/Trudoyomkost-CoJlcEMm.js","/assets/UsersActivity-CeB_XLwP.js","/assets/WatchProgress-BIYgrIf-.js","/assets/WebLogin-DJ-q3XjA.js","/assets/WorkerConcerns-CF42lw3N.js","/assets/Workers-Cr8gSJ9i.js","/assets/Zagruzka-DPEg8KSD.js","/assets/ZagruzkaCell-CCABRhcX.js","/assets/alarm-clock-D7IluBWI.js","/assets/api-BaA-zCPM.js","/assets/archive-BmffuDvz.js","/assets/archive-restore-7MZ4SSho.js","/assets/arrow-down-G0lpWJLo.js","/assets/arrow-left-CcLSbbso.js","/assets/arrow-left-right-DsU2_Soe.js","/assets/arrow-up-CX_aFvKT.js","/assets/arrow-up-right-BpT15ZW6.js","/assets/award-I9pFWclr.js","/assets/ban-DjTDntTH.js","/assets/bot-3V-p90hu.js","/assets/boxes-DkF-AfR3.js","/assets/brigadirFilters-CAKTWtKU.js","/assets/broadcastTree-YuAfuQFi.js","/assets/building-2-Bcf0c3_e.js","/assets/calendar-BtMd6klb.js","/assets/calendar-clock-BZSrm-MO.js","/assets/calendar-days-D8s7rfL1.js","/assets/calendar-range-CKyywpGL.js","/assets/camera-63VqabHb.js","/assets/categories-Dm2-4Ymf.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C7KGxsPg.js","/assets/chart-line-CUAm1-R6.js","/assets/chart-pie-Bmva3Bry.js","/assets/chartRange-CeDRQsN-.js","/assets/chevron-left-45uzP-_L.js","/assets/chevrons-up-down-Bws-XdTQ.js","/assets/circle-check-big-CbAN1N_Q.js","/assets/circle-dot-1z8x7Yex.js","/assets/circle-minus-8bEB8qkW.js","/assets/circle-slash-0CvfzofX.js","/assets/circle-user-round-DDxnRENt.js","/assets/cloud-off-yGHOATro.js","/assets/cloud-upload-CFrDgAWw.js","/assets/compass-DexnRt4b.js","/assets/concernCategories-CMrToRJE.js","/assets/copy-D6_GEWd9.js","/assets/corner-down-right-q4cBWNK-.js","/assets/createLucideIcon-DLOxAlyE.js","/assets/es-Dk49pZ6F.js","/assets/exportXlsx-pnYP_L3I.js","/assets/external-link-7oqNG_Yo.js","/assets/file-clock-BAqLZm6Z.js","/assets/file-exclamation-point-Btll5MlM.js","/assets/file-spreadsheet-CbTEfVVX.js","/assets/file-text-1fVTttgD.js","/assets/flag-pcdfshTs.js","/assets/flame-D3dOwDju.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Ct_qTfUn.js","/assets/hash-izw8cDmR.js","/assets/history-Bm2Y-FuT.js","/assets/hourglass-DU-_tWJ8.js","/assets/image-B5qWyskz.js","/assets/image-off-CdPnzDyt.js","/assets/index-BUvgUN_i.js","/assets/index-TBzEnSGJ.css","/assets/key-round-ocAzNlyg.js","/assets/keyboard-DUKrBY-b.js","/assets/languages-CUHDxc-Z.js","/assets/layers-CjNU5igD.js","/assets/leaderReason-xeB7pWom.js","/assets/lightbulb-yFZz0yxa.js","/assets/link-2-BrKGO9Yx.js","/assets/list-checks-CJMbZnlk.js","/assets/list-ordered-LAVNVrIN.js","/assets/list-tree-zOzrVoM6.js","/assets/lock-open-eakWTMQ9.js","/assets/log-in-D8lD9kVM.js","/assets/message-square-CdiupE8y.js","/assets/minimize-2-tK7HXD7x.js","/assets/package-check-CghCB2Nx.js","/assets/paperclip-BqY5OWwG.js","/assets/pencil-DGs0f20D.js","/assets/personName-B4KId4zS.js","/assets/pin-off-DAXcze3s.js","/assets/pin-yttffIlf.js","/assets/play-Dy_2t11w.js","/assets/presentation-B2-iwBob.js","/assets/prop-types-C202jEFw.js","/assets/radio-CGjyL5kT.js","/assets/react-apexcharts.esm-jjJ9tue5.js","/assets/repeat-TsrTaVWi.js","/assets/rotate-ccw-BJuR3CS9.js","/assets/rotate-cw-DHl46Y7_.js","/assets/save-AkfjfAQr.js","/assets/scale-qm3pU4aZ.js","/assets/scroll-text-DsnEVseg.js","/assets/search-x-DG3Xbb4Z.js","/assets/segments-Er7Fst5w.js","/assets/send-aS-f8g-7.js","/assets/settings-2-B7VoIUX8.js","/assets/shield-5TKIozli.js","/assets/shield-alert-CIPZ7rz8.js","/assets/shield-check-C1a6-dzq.js","/assets/shield-question-mark-FaMCB-t8.js","/assets/siren-DkVk6Xsn.js","/assets/smartphone-wptKLO1D.js","/assets/snowflake-6peLRLTq.js","/assets/square-check-big-C8AfMLZb.js","/assets/square-vGXS7djc.js","/assets/star-P68CsY71.js","/assets/statusBands-c3U7KCaN.js","/assets/store-zUP3oDed.js","/assets/table-2-DdWi01Lg.js","/assets/tag-Y02Gpu8K.js","/assets/trending-down-BoEPNi7z.js","/assets/trending-up-DVyS_oU7.js","/assets/undo-2-CTr9yG9C.js","/assets/useChartTheme-CYTYMkGX.js","/assets/useElementWidth-B73g_ayW.js","/assets/useIsMobile-Be3rhnSb.js","/assets/useMutation-ChGn1Guq.js","/assets/useStatusBands-DpfQvGpe.js","/assets/user-Ec4OJw4B.js","/assets/user-check-DXpRROFH.js","/assets/user-cog-1Z-SOOav.js","/assets/user-minus-BoCfRGEv.js","/assets/users-887ZQ0_n.js","/assets/verifyState-E51XUea-.js","/assets/video-CnDnA-ko.js","/assets/wallet-CI1ePlwa.js","/assets/warehouse-FWt9SLtT.js","/assets/zap-BqEPeSAt.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
