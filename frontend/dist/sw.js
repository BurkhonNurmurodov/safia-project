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

const BUILD = "2026-10-16T06:34:31.710Z";
const PRECACHE = ["/","/assets/AdminPanel-fBlRBtmI.js","/assets/AnalysisBoard-5wEkJOay.js","/assets/Arc-CCXbS9lM.js","/assets/Assistant-CsrYcmjT.js","/assets/BrigadirProfile-BAG8eL9Z.js","/assets/BroadcastReceivers-DyNtePpH.js","/assets/BroadcastRecord-DCv5mgOk.js","/assets/Button-CKXPbwZZ.js","/assets/CatLockNotice-BDkjjyjF.js","/assets/CategoryLegendModal-Bcs3SNGu.js","/assets/CellConcerns-pGLZ5Mwu.js","/assets/CellDetails-CzfWa-9Z.js","/assets/CellFormModal-L3y3hYPL.js","/assets/CellIdent-d123MDCD.js","/assets/CellLink-B066zf_Y.js","/assets/Cells-gxEMdvKn.js","/assets/ColumnFilter-g2kdafYH.js","/assets/ColumnsPicker-BPyUFrvT.js","/assets/CommentsModal-BopBfb7C.js","/assets/ComparisonTable-DoRZE8gg.js","/assets/Concerns-erc16Hji.js","/assets/CountStepper-BLyh5CJv.js","/assets/Daily-Z7T3bJkX.js","/assets/DataTable-BgXsZuXv.js","/assets/DateRangePicker-VICg5fp2.js","/assets/DayReportView-DolVonrk.js","/assets/DayStepper-C53frWpD.js","/assets/DifferenceBreakdown-CRSIUIRe.js","/assets/Downtime-DuxdLYoI.js","/assets/Education-ZBnES26R.js","/assets/EducationLesson-CPdb0mwS.js","/assets/EmptyState-BntU65GR.js","/assets/Exam-BdGaJjb-.js","/assets/FactorySelect-63CXxIPS.js","/assets/Gamification-Bm9QjMeS.js","/assets/GroupBadge-CRbaiQto.js","/assets/HeatmapChart-D62KMQnR.js","/assets/IdleCell-CJr6fpFG.js","/assets/KPICard-BiQDiQTw.js","/assets/Kaizen-BfNGvaoM.js","/assets/Kelish-CerYrn4B.js","/assets/KpiDeltaCard-D1mb-B-q.js","/assets/LangTextInput-DlGoUns8.js","/assets/Layout-CXiIDElh.js","/assets/LeaderAppeal-ZrInqQAm.js","/assets/LeaderDayReport-jPCloepw.js","/assets/LeaderUnitReport-NAP0yWHI.js","/assets/Leaderboard-BypdbpMB.js","/assets/Leaders-BmDeKklD.js","/assets/Lightbox-D5LGY3PY.js","/assets/LiveOverview-XwK04r3S.js","/assets/Login-C9hCtec5.js","/assets/NotFound-BSbuJH_r.js","/assets/Notifications-DujiwSM0.js","/assets/Overview-BHn_jryl.js","/assets/Pagination-C9Nycn6Q.js","/assets/PerenaladkaFactTable-DijraT_i.js","/assets/PersonCard-Cukphl9R.js","/assets/PlanFulfillment-BIkiWUiW.js","/assets/Production-BO4EA6Gk.js","/assets/Profile-DmhzcTU8.js","/assets/ProofCamera-BC-XSdKj.js","/assets/Quality-D8Sd2CI0.js","/assets/RawRows-BX-DQKkD.js","/assets/RequestStateChip-Ba2fyBHC.js","/assets/RichTextEditor-D3o7eLhz.js","/assets/SaveState-BqAgGKd4.js","/assets/SearchInput-BTXc9B9S.js","/assets/SeasonalityHeatmap-CqZWO7Qu.js","/assets/SegmentedToggle-CJb0D_ec.js","/assets/SetupTimes-d8mT1_Sa.js","/assets/ShiftDaily-CkkJcYKj.js","/assets/Staff-DsQmpgTe.js","/assets/StaffListAtCheck-BLgD5y_H.js","/assets/StatusBadge-DOyR-DG4.js","/assets/TargetGoal-BLIfX91u.js","/assets/Targets-8hE6uMYa.js","/assets/Tasks-BlKpZO4Z.js","/assets/TimeWheelPicker-DONyfJBn.js","/assets/Toast-Bzq5R0Ap.js","/assets/Tooltip-fjJZE8J7.js","/assets/TrendChart--x8_4aXm.js","/assets/TripleSpeedometer-Dkz1YIRK.js","/assets/Trudoyomkost-By4rAEOn.js","/assets/Turnover-Cr8tAM9d.js","/assets/UploadDropzone-Dy135T1s.js","/assets/UsersActivity-Bn7_fhCV.js","/assets/VerdictBlock-o7yqRs3A.js","/assets/VfxApiMap-DdAdFrVe.js","/assets/VfxDictionaries-5AoqB_d-.js","/assets/VfxEmployees-BX4dLZFJ.js","/assets/VfxHrMoves-DMRy3qi4.js","/assets/VfxJobs-GnEVYPmM.js","/assets/VfxPhoto-asIFGrJ1.js","/assets/VfxShifts-UryRCc1p.js","/assets/VfxState-rnp97JmR.js","/assets/VfxTimebooks-CLFKGDuf.js","/assets/VfxTimesheet-q4a9G-et.js","/assets/WatchProgress-D8p30FW8.js","/assets/WebLogin-BAmhWj_t.js","/assets/WorkerConcerns-rUmB8ovW.js","/assets/Workers-Bk8SPuDd.js","/assets/Zagruzka-DWl-XAbc.js","/assets/ZagruzkaCell-irdmYsu8.js","/assets/api-BGduWp5h.js","/assets/archive-BfgDxSM0.js","/assets/archive-restore-ByJnxq-j.js","/assets/arrow-down-rIAbZ46I.js","/assets/arrow-down-wide-narrow-DiPXK24S.js","/assets/arrow-up-narrow-wide-CFB6jYlt.js","/assets/award-jijNDmHK.js","/assets/ban-B7gkYDKX.js","/assets/boxes-S2Q0FDUk.js","/assets/braces-H7NKrBgo.js","/assets/brigadirFilters-Dd0lEQQM.js","/assets/broadcastTree-BDZiEdlr.js","/assets/building-2-3NuV2Tif.js","/assets/calculator-J_eIg4UE.js","/assets/calendar-days-CpyhrVhw.js","/assets/calendar-vfFpM1Ct.js","/assets/camera-DpuDxDwS.js","/assets/categories-B-maywqt.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-qZVCB2dZ.js","/assets/chart-line-DchOxTzt.js","/assets/chart-pie-Eb2CeKOv.js","/assets/chartRange-B_VCYhKl.js","/assets/check-check-B19xtwXx.js","/assets/chevron-left-btx58Skr.js","/assets/chevrons-up-down-nUM6tnsu.js","/assets/circle-DbJbCiDC.js","/assets/circle-alert-D5FECd-S.js","/assets/circle-check-big-C4o4I-L4.js","/assets/circle-dashed-5_geJxtI.js","/assets/circle-minus-BhlRyZV3.js","/assets/circle-question-mark-CWJhNooX.js","/assets/circle-slash-CFEskWAo.js","/assets/circle-user-round-DN1M-v8O.js","/assets/clock-3-aJO1VWH4.js","/assets/cloud-off-Cc3IVX0k.js","/assets/cloud-upload-tyMa_82F.js","/assets/compass-CUzW36A1.js","/assets/concernCategories-C-7jXuhZ.js","/assets/copy-J9QLkOe4.js","/assets/corner-down-right-BA6nw5Ma.js","/assets/createLucideIcon-CFfq4JZi.js","/assets/es-DerbCWxk.js","/assets/external-link-Bp9ueJUv.js","/assets/file-clock-CE-XVx0l.js","/assets/file-exclamation-point-BcAKI5Dl.js","/assets/flag-BI7ODlwl.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BEwpoien.js","/assets/hash-D4_Jcve6.js","/assets/hourglass-Cz49VkSD.js","/assets/image-D6AeCpl-.js","/assets/image-off-WDrBDnx1.js","/assets/inbox-B9MhyZ5j.js","/assets/index-C9MEqzYe.js","/assets/index-CBKw4u90.css","/assets/keyboard-tMxzcZb1.js","/assets/languages-tbb1fSlF.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DSpQberl.js","/assets/lightbulb-DFx4fauj.js","/assets/link-2-37Fby3B7.js","/assets/link-2-off-BOgMGwnI.js","/assets/list-ordered-mAuwWrBu.js","/assets/list-tree-C0gUvkAk.js","/assets/lock-open-i8Gc0shf.js","/assets/log-in-BeMnUK7p.js","/assets/marks-kMCMneeS.js","/assets/minimize-2-tHb0ttDC.js","/assets/package-check-DBAtJ7_0.js","/assets/pencil-Cwq_KCC7.js","/assets/percent-CUMZNi4c.js","/assets/pin-DTWVRxgG.js","/assets/pin-off-DbHT_HQP.js","/assets/play-DJIeNlNb.js","/assets/plug-zap-CNo0ZmhH.js","/assets/prop-types-CQ3CkKWX.js","/assets/radio-HBgtZKR4.js","/assets/react-apexcharts.esm-CAuMZa5p.js","/assets/registers-wnTJq0pp.js","/assets/repeat-2hDnchH-.js","/assets/save-ChjqsxvR.js","/assets/scopeLinks-C5U5fA_p.js","/assets/scroll-text-DrzvqZRs.js","/assets/search-x-BE_-c50L.js","/assets/segments-8ojs5u-6.js","/assets/send-C1u9egRk.js","/assets/settings-2-BSeE9wLs.js","/assets/shield-DBMNmMNf.js","/assets/shield-alert-B1XBngDQ.js","/assets/shield-question-mark-CLMD11YH.js","/assets/siren-Olu4_zLD.js","/assets/snowflake-NTqtGi2U.js","/assets/split-Cd1LMJmx.js","/assets/square-check-big-DOTyzyrA.js","/assets/star-1DCUZnsc.js","/assets/statusBands-ReH1lAox.js","/assets/store-DQSFn-S-.js","/assets/table-2-CSDW3-or.js","/assets/table-properties-fwBoPpc5.js","/assets/tag-oK9SvxYC.js","/assets/timer-off-a2MIz0x6.js","/assets/trending-down-B8JMslME.js","/assets/trending-up-RVFR0Fmx.js","/assets/undo-2-3fdY54zK.js","/assets/useChartTheme-DCWz5fj6.js","/assets/useElementWidth-DQOM-kLj.js","/assets/useIsMobile-BOXhir1O.js","/assets/useOpenParam-BLehKDtk.js","/assets/useStatusBands-fqJhrDao.js","/assets/useUrlScope-D1RvFT_w.js","/assets/user-C-PvPNCd.js","/assets/user-cog-DRmdNWJ8.js","/assets/users-C70brGpA.js","/assets/vfx-WN-X6ZJe.js","/assets/video-mP0UEoyd.js","/assets/wallet-DB4AfV3x.js","/assets/warehouse-BWhTRg1i.js","/assets/workflow-CIUEuyKi.js","/assets/x-Bf4X5Ez3.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
