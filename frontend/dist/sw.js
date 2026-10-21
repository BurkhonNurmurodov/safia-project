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

const BUILD = "2026-10-21T05:44:29.331Z";
const PRECACHE = ["/","/assets/AdminPanel-DPCuKbxi.js","/assets/AnalysisBoard-D40RS3Ik.js","/assets/Arc-BIPSoUbz.js","/assets/Assistant-DEZ5zbdy.js","/assets/BrigadirProfile-DMtm4NAu.js","/assets/BroadcastReceivers-gf0O1lVz.js","/assets/BroadcastRecord-DVmUus8y.js","/assets/Button-CCuIVOP6.js","/assets/CatLockNotice-CGnnGiEe.js","/assets/CategoryLegendModal-apcq0B0i.js","/assets/CellConcerns-BI2CKUap.js","/assets/CellDetails-lPphlMpq.js","/assets/CellFormModal-DINdLsN5.js","/assets/CellIdent-BUJlVkkv.js","/assets/CellLink-CKcXDlkW.js","/assets/Cells-BUCxU3ks.js","/assets/ColumnFilter-McjAQU6P.js","/assets/ColumnsPicker-BLSGtd7D.js","/assets/CommentsModal-Bgh3UWpZ.js","/assets/ComparisonTable-BmPJO1Kc.js","/assets/Concerns-DTRgRIoS.js","/assets/CountStepper-1VBSqFbT.js","/assets/Daily-Du0UL3Tk.js","/assets/DataTable-CWz3kQIW.js","/assets/DateRangePicker-DCJKBPrQ.js","/assets/DayReportView-DzZt-XoA.js","/assets/DayStepper-BQ_zAz5y.js","/assets/DayStrip-54rxDo4B.js","/assets/DifferenceBreakdown-B_tSCKWP.js","/assets/Downtime-OQPucXz6.js","/assets/Education-1c-qEgvM.js","/assets/EducationLesson-DJCnLz4x.js","/assets/EmptyState-BhAAjnZs.js","/assets/Exam-C-x9pKg4.js","/assets/FactorySelect-DTRExN2D.js","/assets/Gamification-DE0_EU63.js","/assets/GroupBadge-DAys6ptu.js","/assets/HeatmapChart-B8_o9pBT.js","/assets/IdleCell-DDj7GUXV.js","/assets/KPICard-VReUl3gX.js","/assets/Kaizen-PHLBP0FW.js","/assets/Kelish-Cc7nJrZR.js","/assets/KpiDeltaCard-B2LS3jqr.js","/assets/LangTextInput-Bd-rFTKa.js","/assets/Layout-CKS18DcS.js","/assets/LeaderAppeal-Bz64yGrD.js","/assets/LeaderDayReport-DscC6IjK.js","/assets/LeaderUnitReport-DcgOUGp2.js","/assets/Leaderboard-BwCfqPVW.js","/assets/Leaders-B3XSrbzN.js","/assets/LeadersKpi-_V0FupqB.js","/assets/Lightbox-O027E-C-.js","/assets/LiveOverview-Df1ffj5Y.js","/assets/Login-zzgExKpi.js","/assets/NotFound-DaR-paPI.js","/assets/Notifications-Ci88Zq-F.js","/assets/Ontime-VArigF-d.js","/assets/Overview-DH7FDz4z.js","/assets/Pagination-BQVV6DLA.js","/assets/PerenaladkaFactTable-BZHuJpDe.js","/assets/PersonCard-DTH0bWwH.js","/assets/PlanFulfillment-DuxhQGOD.js","/assets/Production-BzNzjyiE.js","/assets/Profile-BUMr5Qsc.js","/assets/ProofCamera-kqMrKkxZ.js","/assets/ProofPhoto-BQWLKjTm.js","/assets/Quality-B_0PFs2_.js","/assets/RawRows-Cv8RVi5v.js","/assets/RequestStateChip-Ciwp9ZNS.js","/assets/RichTextEditor-B7qnD0o5.js","/assets/SaveState-N6CvQQ55.js","/assets/SearchInput-Dfd3MBpX.js","/assets/SeasonalityHeatmap-CzGg03qd.js","/assets/SegmentedToggle-DueQmuF1.js","/assets/SetupTimes-COkuiVEG.js","/assets/ShiftDaily-BOjoucAt.js","/assets/Staff-BALJPxSq.js","/assets/StaffListAtCheck-BXm31WC8.js","/assets/StatusBadge-Bhm_Bl9m.js","/assets/StatusBandsModal-Mn1XW980.js","/assets/TargetGoal-Bf87wrPY.js","/assets/Targets-46wdBm9N.js","/assets/Tasks-DFq6xXF-.js","/assets/TimeWheelPicker-Cy286tyP.js","/assets/Toast-CznpfuL6.js","/assets/Tooltip-YHTF85vg.js","/assets/TrendChart-J8RNQ0oq.js","/assets/TripleSpeedometer-CkxxWwq2.js","/assets/Trudoyomkost-bs9cGqro.js","/assets/UploadDropzone-BVuQEeS9.js","/assets/UsersActivity-CrRiJSGE.js","/assets/VerdictBlock-B2Pcu_cX.js","/assets/VfxApiMap-B5AageEI.js","/assets/VfxDictionaries-CsoNOFyA.js","/assets/VfxEmployees-bL4R7Qgf.js","/assets/VfxHrMoves-C2517dVe.js","/assets/VfxJobs-v0cljOcO.js","/assets/VfxPhoto-eabBPeFd.js","/assets/VfxShifts-rhA7BGoE.js","/assets/VfxState-Dh08BqKI.js","/assets/VfxTimebooks-BDLi-B4w.js","/assets/VfxTimesheet-DMrFWRsl.js","/assets/WatchProgress-NE3Z5NY9.js","/assets/WebLogin-Pq3R24yC.js","/assets/Workers-DSz74BsL.js","/assets/Zagruzka-D_a-w7FH.js","/assets/ZagruzkaCell-sedYFUMv.js","/assets/api-DGQadkz1.js","/assets/archive-bZKL4iF3.js","/assets/archive-restore-D4eLAjkF.js","/assets/arrow-down-Dzhn8009.js","/assets/arrow-down-right-ifK-LKZU.js","/assets/arrow-down-wide-narrow-rUGiPJih.js","/assets/arrow-up-narrow-wide-x6xwwj1p.js","/assets/ban-AnMEXIbL.js","/assets/boxes-CnI6K5kA.js","/assets/braces-9NN2zcT5.js","/assets/brigadirFilters-Bfo-hik2.js","/assets/broadcastTree-Dg7XCJun.js","/assets/building-2-xSp9sasg.js","/assets/calendar-CECtYaYX.js","/assets/calendar-days-DJVX9a58.js","/assets/camera-DP72KZ73.js","/assets/categories-DxPscfll.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BWfTiKAU.js","/assets/chart-line-CenM0Z_c.js","/assets/chart-pie-C0hHIBIj.js","/assets/chartRange-CBxknXLt.js","/assets/check-check-CX6Idp04.js","/assets/chevron-left-BevF5zYF.js","/assets/chevrons-up-down-D8J-yRo6.js","/assets/circle-BIUEJ_AR.js","/assets/circle-alert-D9Qpjjaj.js","/assets/circle-check-big-DmNIrvbz.js","/assets/circle-dashed-C4JJuJHi.js","/assets/circle-minus-D9Pu1ZkZ.js","/assets/circle-question-mark-jGo_Yklo.js","/assets/circle-slash-CxB1II8q.js","/assets/circle-user-round-CPJ7yQZO.js","/assets/cloud-off-B_izYFCr.js","/assets/cloud-upload-DrIHBjwH.js","/assets/compass-D4iZtiVq.js","/assets/concernCategories-Bzn0QDXs.js","/assets/corner-down-right-CXxWTFXW.js","/assets/createLucideIcon-DlasiElw.js","/assets/es-BG_Ii1me.js","/assets/external-link-BvqQdLZV.js","/assets/file-clock-CXR0yKnc.js","/assets/file-exclamation-point-DoG-invq.js","/assets/flag-D9GKqiix.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-D031mo9c.js","/assets/funnel-CyAnvAQg.js","/assets/hash-BVZbyW6_.js","/assets/hourglass-CSD-YNS7.js","/assets/image-off-DpIkTezv.js","/assets/image-qnscNw3-.js","/assets/inbox-DTuGSasY.js","/assets/index-DLT_vDJq.css","/assets/index-DQ448yjl.js","/assets/keyboard-D71Dvu2c.js","/assets/languages-xkabl31-.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B2IWfDmd.js","/assets/lightbulb-BGj99SNE.js","/assets/link-2-CG8fXzSK.js","/assets/link-2-off-1oi_TNkp.js","/assets/list-ordered-MfQTy5gS.js","/assets/list-tree-DJSOhb-Z.js","/assets/lock-open-BXzgRTAp.js","/assets/log-in-DjGEFj6e.js","/assets/marks-Cli7uVcD.js","/assets/minimize-2-w3lJ8w25.js","/assets/package-check-BlRn8kII.js","/assets/pencil-CXWx8Iln.js","/assets/percent-Cpl-0P5j.js","/assets/pin-CYGdNjAP.js","/assets/pin-off-CeJ-Z5yy.js","/assets/play-B8nDXkQk.js","/assets/plug-zap-B2KLf8H2.js","/assets/prop-types-DuLkmrVN.js","/assets/radio-CHPL_kLm.js","/assets/react-apexcharts.esm-C-UQhibt.js","/assets/registers-BF6AtOpT.js","/assets/repeat-BfeaGnKE.js","/assets/save-ktDew-wv.js","/assets/scopeLinks-Cd1WBV5c.js","/assets/scroll-text-DVpAsSgV.js","/assets/search-x-DWSLXs9Q.js","/assets/segments-DxZh6Tzj.js","/assets/send-0vLiIE9G.js","/assets/settings-2-CiQvikWD.js","/assets/shield-alert-DdObA_w8.js","/assets/shield-question-mark-yrFTd7fg.js","/assets/shield-y8Gz_4Uw.js","/assets/sigma-DTcz5rCg.js","/assets/siren-BYl-coF4.js","/assets/snowflake-CR8DflWa.js","/assets/split-DihWFSye.js","/assets/square-check-big-B-QYTrIg.js","/assets/star-Cx7k2xbK.js","/assets/statusBands-BfbeCavT.js","/assets/store-DvRwIlEI.js","/assets/table-2-sPD9kVt6.js","/assets/table-properties-ZMfLUtRD.js","/assets/tag-B5-wpnWU.js","/assets/timer-off-DIn_Qb3h.js","/assets/trending-down-B3aH5VXo.js","/assets/trending-up-DWJT40o5.js","/assets/undo-2-BdOVM_6v.js","/assets/useChartTheme-BJYpQog3.js","/assets/useElementWidth-CNNjJCC6.js","/assets/useIsMobile-ePp18DhF.js","/assets/useOpenParam-BFQ4j8tO.js","/assets/useStatusBands-k9EhI0mp.js","/assets/useUrlScope-CO-CvLLg.js","/assets/user-DYvE5qOl.js","/assets/user-cog-L8pDTycR.js","/assets/user-minus-OAKMgAIt.js","/assets/users-D3qTCvLa.js","/assets/vfx-BvFQyaRp.js","/assets/video-DzrEo9Ya.js","/assets/wallet-7pbdfngY.js","/assets/warehouse-CPtwSGeZ.js","/assets/workflow-HmS7XdpK.js","/assets/x-DNMNGsnO.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
