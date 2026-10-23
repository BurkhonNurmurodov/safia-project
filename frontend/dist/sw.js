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

const BUILD = "2026-10-23T16:40:04.153Z";
const PRECACHE = ["/","/assets/AdminPanel-C2Z1fT94.js","/assets/AnalysisBoard-Sqgh4wPt.js","/assets/Arc-BK31yBWq.js","/assets/Assistant-Byfey_0F.js","/assets/BrigadirProfile-HyZKTx0n.js","/assets/BroadcastReceivers-DDtPHyrr.js","/assets/BroadcastRecord-BvvXNHEF.js","/assets/Button-CadDiEcW.js","/assets/CatLockNotice-hMucKvcS.js","/assets/CategoryLegendModal-NJ_1uKOh.js","/assets/CellConcerns-DsmCi_1Z.js","/assets/CellDetails-tcP43d-E.js","/assets/CellFormModal-DV0WwKWJ.js","/assets/CellIdent-DEKP7V2e.js","/assets/CellLink-GkS3vDos.js","/assets/Cells-B_RAQNav.js","/assets/ColumnFilter-DR-ve9-v.js","/assets/ColumnsPicker-aH5SEy9i.js","/assets/CommentsModal-DIlBiMY2.js","/assets/ComparisonTable-cSwoM3mR.js","/assets/Concerns--lq1cNrx.js","/assets/CountStepper-DJ9XkGVf.js","/assets/Daily-UA2K9ZFO.js","/assets/DataTable-O11zp5t3.js","/assets/DateRangePicker-B0_Rl-H4.js","/assets/DayReportView-CmAnGNiE.js","/assets/DayStepper-D9lcfGYZ.js","/assets/DayStrip-C7USG1RO.js","/assets/DifferenceBreakdown-CP7Hbr7S.js","/assets/Downtime-DmKeJKif.js","/assets/Education-BG_IPJlx.js","/assets/EducationLesson-D7UcY-XZ.js","/assets/EmptyState-Dukxi9UF.js","/assets/Exam-BBUYAJkd.js","/assets/FactorySelect-DINRH54F.js","/assets/Gamification-BSFHeAvr.js","/assets/GroupBadge-Bu-JWace.js","/assets/HeatmapChart-BSl1knaB.js","/assets/IdleCell-CNAg4TQB.js","/assets/KPICard-PKe_DNZc.js","/assets/Kaizen-BC3BLR30.js","/assets/Kelish-C1JHb04J.js","/assets/KpiDeltaCard-BCP9NioF.js","/assets/LangTextInput-DQJomyH2.js","/assets/Layout-BX-zpALW.js","/assets/LeaderAppeal-CBSP7zxs.js","/assets/LeaderDayReport-DpwKtKnA.js","/assets/LeaderUnitReport-C4XzxUrX.js","/assets/Leaderboard-DpC0L1l4.js","/assets/Leaders-lP7mBdSg.js","/assets/LeadersKpi-MS1FKSg-.js","/assets/Lightbox-kNckBcKR.js","/assets/LiveOverview-BdWMuHWJ.js","/assets/Login-DXo-J9Gk.js","/assets/NotFound-Dbo2gF2e.js","/assets/Notifications-CgBT-mHn.js","/assets/Ontime-EfPi9MMK.js","/assets/Overview-CpRP8xPF.js","/assets/Pagination-B54_4ypR.js","/assets/PerenaladkaFactTable-F3vhuJb1.js","/assets/PersonCard-C8v5TJQp.js","/assets/PlanFulfillment-DCtbHvWB.js","/assets/Production-DrpPQN9W.js","/assets/Profile-CeCAiBMG.js","/assets/ProofCamera-CJ2hsqxy.js","/assets/ProofPhoto-DZgMFtfy.js","/assets/Quality-CRXlln0C.js","/assets/RawRows-CfKHC1dA.js","/assets/RequestStateChip-Bi0pl-nC.js","/assets/RichTextEditor-C4f9k37m.js","/assets/SaveState-DNZoaufU.js","/assets/SearchInput-BsDtv5Hu.js","/assets/SeasonalityHeatmap-DwVdBqm5.js","/assets/SegmentedToggle-CVOmv1vO.js","/assets/SetupTimes-DG8f7A1D.js","/assets/ShiftDaily-DXNqepat.js","/assets/Staff-D165YeH_.js","/assets/StaffListAtCheck-DxFxqdMW.js","/assets/StatusBadge-C6k_PHEo.js","/assets/StatusBandsModal-R4Yuj7-L.js","/assets/TargetGoal-DglLcO-D.js","/assets/Targets-BBgcXbUp.js","/assets/Tasks-BOy-_LFL.js","/assets/TimeWheelPicker-DUHmp4PM.js","/assets/Toast-aKfEPGGA.js","/assets/Tooltip-DVLk1n4o.js","/assets/TrendChart-DGkOhsrf.js","/assets/TripleSpeedometer-DvO14Med.js","/assets/Trudoyomkost-Czi204QO.js","/assets/UploadDropzone-BmCwCo5c.js","/assets/UsersActivity-C0IMnWgU.js","/assets/VerdictBlock-DpLcA-TE.js","/assets/VfxApiMap-TkRi5mNY.js","/assets/VfxDictionaries-CobIEi0L.js","/assets/VfxEmployees-BiJxeQFP.js","/assets/VfxHrMoves-BG5LPKqX.js","/assets/VfxJobs-Lka_G6i3.js","/assets/VfxPhoto-glmPpn0_.js","/assets/VfxShifts-8Dp6jJom.js","/assets/VfxState-Pj_szWBC.js","/assets/VfxTimebooks-NPrHHk8F.js","/assets/VfxTimesheet-CfTVWP83.js","/assets/WatchProgress-ZtcmSt1V.js","/assets/WebLogin-D81EvWRo.js","/assets/Workers-htkyjfC7.js","/assets/Zagruzka-BjDiuHQ5.js","/assets/ZagruzkaCell-C555xuPX.js","/assets/api-C9EwChA0.js","/assets/archive-lHrZlYs_.js","/assets/archive-restore-DCu14w22.js","/assets/arrow-down-WTgAIiB3.js","/assets/arrow-down-right-BEo7sBEn.js","/assets/arrow-down-wide-narrow-BV8k-icY.js","/assets/arrow-up-narrow-wide-DXxb3HGW.js","/assets/ban-WxIXcJM1.js","/assets/boxes-DNdI4YcQ.js","/assets/braces-i7yGQUhY.js","/assets/brigadirFilters-WtIyj7hQ.js","/assets/broadcastTree-D0EgSv9l.js","/assets/building-2-B1NWSpHR.js","/assets/calendar-Dqfe8rcr.js","/assets/calendar-days-C5ZXb6fg.js","/assets/camera-B6j1xOaG.js","/assets/categories-BTyzTJVn.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-f0_ql_K-.js","/assets/chart-line-Ck99OnGD.js","/assets/chart-pie-CaOXytbQ.js","/assets/chartRange-C2RBaEtf.js","/assets/check-check-tCSb6G2R.js","/assets/chevron-left-Be0N70t7.js","/assets/chevrons-up-down-B-LtjLtY.js","/assets/circle-DJ8TdFUO.js","/assets/circle-alert-AHWHCQSb.js","/assets/circle-check-big-CYtQyr_B.js","/assets/circle-dashed-Hbo609nJ.js","/assets/circle-minus-DaCe-8xw.js","/assets/circle-question-mark-CGq-t0CV.js","/assets/circle-slash-DjDWbH2a.js","/assets/circle-user-round-BnHuu_-Y.js","/assets/cloud-off-GdUTCVp_.js","/assets/cloud-upload-NSyzp0mL.js","/assets/compass-BCtzy0Ik.js","/assets/concernCategories-zC_bbi8F.js","/assets/corner-down-right-u-P-la3i.js","/assets/createLucideIcon-CyqVyBsV.js","/assets/es-dmK8aW_k.js","/assets/external-link-B5AekOar.js","/assets/file-clock-CvuA0HaE.js","/assets/file-exclamation-point-Cl7UXOfz.js","/assets/flag-CR2iIuNL.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-45Ka4fMC.js","/assets/funnel-CVRYVoET.js","/assets/hash-D-hDQLvg.js","/assets/hourglass-3l3PS-qb.js","/assets/image-ClQ_4f07.js","/assets/image-off-CONBW7N6.js","/assets/inbox-C3VVBH8B.js","/assets/index-CM7EIzxr.js","/assets/index-DFvJry-Q.css","/assets/keyboard-BOJQsYz_.js","/assets/languages-1Z3rAYqe.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BxnP4HIT.js","/assets/leaderBoard-DIGogiWb.js","/assets/lightbulb-C0IFQX5J.js","/assets/link-2-BCtUx7-v.js","/assets/link-2-off-CtIUdCre.js","/assets/list-ordered-DjWee622.js","/assets/list-tree-DujN0yuL.js","/assets/lock-open-C1wQJKQh.js","/assets/log-in-BQZNEkKE.js","/assets/map-pin-fz9DFdFK.js","/assets/marks-D9lHND40.js","/assets/minimize-2-DfLwH1em.js","/assets/package-check-CCpYQY6y.js","/assets/pencil-BFkifBMd.js","/assets/percent-xkV13nKd.js","/assets/pin-CEQRSVMX.js","/assets/pin-off-CJPtwa4s.js","/assets/play-DGnmUnzl.js","/assets/plug-zap-DyQ8Xs2m.js","/assets/prop-types-DrfxPRnm.js","/assets/radio-BHS7B_eI.js","/assets/react-apexcharts.esm-Dk-vDpXT.js","/assets/registers-DTDMQ-CO.js","/assets/repeat-DxyJeNiR.js","/assets/save-Cgw5Mznd.js","/assets/scopeLinks-BvNMQYZ1.js","/assets/scroll-text-D0pWvAP9.js","/assets/search-x-BAxoHjzR.js","/assets/segments-Dv_ifG_L.js","/assets/send-CIPS8cai.js","/assets/settings-2-DHQ5-Pso.js","/assets/shield-DHSEBZod.js","/assets/shield-alert-C0rBUYK5.js","/assets/shield-question-mark-DUE6gVeT.js","/assets/sigma-ENV8DLS9.js","/assets/siren-Dxcd6G0D.js","/assets/snowflake-DJTZbiKu.js","/assets/split-f9QkMMRt.js","/assets/square-check-big-Dov2N-kk.js","/assets/star-C3Kf54Qa.js","/assets/statusBands-BIHY2xrS.js","/assets/store-BQsb3568.js","/assets/table-2-Rng1e3hQ.js","/assets/table-properties-ChP3ZKkj.js","/assets/tag-DSNDGJc5.js","/assets/timer-off-l9tlp-NB.js","/assets/trendBuckets-CP39D2Fh.js","/assets/trending-down-DrEBHH7p.js","/assets/trending-up-B7BsfWPE.js","/assets/undo-2-BvGJPqwX.js","/assets/useChartTheme-B0dtyrmv.js","/assets/useElementWidth-Dk-g0c5K.js","/assets/useIsMobile-niH6Bk-y.js","/assets/useOpenParam-C0EDiiGn.js","/assets/useStatusBands-BWqTS4GO.js","/assets/useUrlScope-smviqUqx.js","/assets/user-cog-BzsMYf2z.js","/assets/user-l3ld4OSk.js","/assets/user-minus-D8C3xTIF.js","/assets/users-Ba_wRC0V.js","/assets/vfx-f-Yf_wMK.js","/assets/video-aRWjmjKA.js","/assets/wallet-mzEq4_SC.js","/assets/warehouse-lVfclCZy.js","/assets/workflow-DZxEzpPk.js","/assets/x-0Sdfdxm4.js","/assets/zap-BbFTZdjs.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
