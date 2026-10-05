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

const BUILD = "2026-10-05T17:03:34.832Z";
const PRECACHE = ["/","/assets/AdminPanel-Djmcni-N.js","/assets/AnalysisBoard-Bp1hz99G.js","/assets/Arc-C9bmrZFR.js","/assets/BrigadirProfile-2cK8iVHL.js","/assets/BroadcastReceivers-DMPiHr_w.js","/assets/BroadcastRecord-Dgd3DnFd.js","/assets/Button-B5cUaT7T.js","/assets/CatLockNotice-BHLZZmrT.js","/assets/CategoryLegendModal-DPLWCvPi.js","/assets/CellConcerns-Co7JFW15.js","/assets/CellDetails-6ro5MQ62.js","/assets/CellFormModal-DZIdPNTs.js","/assets/CellIdent-DvJbnIix.js","/assets/CellLink-By99Y8TU.js","/assets/Cells-BMDf3tQf.js","/assets/ColumnFilter-8r_bfep-.js","/assets/ColumnsPicker-CB-vEih2.js","/assets/CommentsModal-DSBzv_k5.js","/assets/ComparisonTable-BTPJrU6U.js","/assets/Concerns-BVJ6_Z09.js","/assets/Daily-BSlAUasG.js","/assets/DataTable-8Slh8yOp.js","/assets/DateRangePicker-CARCqFYT.js","/assets/DayReportView-DGd_AACY.js","/assets/DayStepper-BS-W-2-m.js","/assets/DifferenceBreakdown-B-q26WkH.js","/assets/Downtime-IPLmIlEC.js","/assets/Education-DrCoreth.js","/assets/EducationLesson-CG-qlmNo.js","/assets/EmptyState-Caw1rvqL.js","/assets/Exam-CvGr_ZoS.js","/assets/FactorySelect-Dot6j-9h.js","/assets/Gamification-BQ4J5AIO.js","/assets/GroupBadge-DHtNdQP9.js","/assets/HeatmapChart-DeLCg6YW.js","/assets/IdleCell-Tfm9racm.js","/assets/KPICard-DMcF917h.js","/assets/Kaizen-DHf6N7SM.js","/assets/Kelish-DuVqM-m1.js","/assets/KpiDeltaCard-Doqg3Gjg.js","/assets/LangTextInput-C_kZ82TS.js","/assets/Layout-Cthl8biO.js","/assets/LeaderAppeal-ojE_bv__.js","/assets/LeaderDayReport-Noo8EX3B.js","/assets/LeaderUnitReport-DxZsWx_y.js","/assets/Leaderboard-CGpSpdyq.js","/assets/Leaders-B0c4-ZY8.js","/assets/Lightbox-BmtzyyoW.js","/assets/LiveOverview-C26v7qb9.js","/assets/Login-BedDiLP3.js","/assets/NotFound-Cd5oOU0R.js","/assets/Notifications-xhKrjzZY.js","/assets/Overview-NOoF9UoA.js","/assets/Pagination-DyVJD0P0.js","/assets/PerenaladkaFactTable-C8kLLBlM.js","/assets/PersonCard-DTUEcDyZ.js","/assets/PlanFulfillment-tcb0Zy0W.js","/assets/Production-DjP_7KOj.js","/assets/Profile-CAwufzSt.js","/assets/ProofCamera-BOmLTzDx.js","/assets/ProofPhoto-i_swILyD.js","/assets/Quality-k9XE84WR.js","/assets/RawRows-B8jtwNqv.js","/assets/RequestStateChip-BakRU7bI.js","/assets/RichTextEditor-XoFlZXjH.js","/assets/SaveState-D-3ITnCF.js","/assets/SearchInput-D-NpVf-4.js","/assets/SeasonalityHeatmap-CqrhLo_y.js","/assets/SegmentedToggle-CXoTtTV5.js","/assets/SetupTimes-xBHGkkMC.js","/assets/ShiftDaily-CivyjVDJ.js","/assets/Staff-B0MTFk1I.js","/assets/StaffLive-PoJjHsl7.js","/assets/StatusBadge-DKC-goQr.js","/assets/TargetGoal-RpbWF7Ga.js","/assets/Targets-DmPXIytI.js","/assets/Tasks-LdQn59DM.js","/assets/TimeWheelPicker-zC6X44tM.js","/assets/Toast-BYU5Oirv.js","/assets/Tooltip-DzO4h6Q2.js","/assets/TrendChart-BJ9EZcjr.js","/assets/TripleSpeedometer-DxcnaCoz.js","/assets/Trudoyomkost-CWcqyF-m.js","/assets/Turnover-BRc2hx6X.js","/assets/UploadDropzone-CEtLsOaP.js","/assets/UsersActivity-B1wwiOj3.js","/assets/VerdictBlock-D6QZbj8K.js","/assets/VfxApiMap-CgbyoIQn.js","/assets/VfxDictionaries-B2GUj8PK.js","/assets/VfxEmployees-DxpYL4yc.js","/assets/VfxHrMoves-D0UdHB-x.js","/assets/VfxJobs-C_FEgTYt.js","/assets/VfxPhoto-C-G-tf3y.js","/assets/VfxShifts-nbwX4hFO.js","/assets/VfxState-DvuZFF5A.js","/assets/VfxTimebooks-DmiEpZPB.js","/assets/VfxTimesheet-Bey03nLm.js","/assets/WatchProgress-CuagjKAD.js","/assets/WebLogin-DAH0Xv1D.js","/assets/WorkerConcerns-BD7jr0t2.js","/assets/Workers-C8ugyWpS.js","/assets/Zagruzka-zp4kPQ3R.js","/assets/ZagruzkaCell-DJxETU1J.js","/assets/api-BCnCAj20.js","/assets/archive-BNiA5R6z.js","/assets/archive-restore-DxQo4iR8.js","/assets/arrow-down-_pN36a-7.js","/assets/arrow-left-lXyE1Fws.js","/assets/arrow-up-narrow-wide-XTQ6s0ba.js","/assets/arrow-up-right-Del2h1cS.js","/assets/arrow-up-v8WeFh9F.js","/assets/award-CZsJuUmE.js","/assets/ban-CotZybba.js","/assets/book-open-CUUQwF8G.js","/assets/boxes-CWqOisC3.js","/assets/braces-RJc0BzBf.js","/assets/brigadirFilters-DU3z6xX_.js","/assets/broadcastTree-DJ0PwMfJ.js","/assets/building-2-CwiFNi2X.js","/assets/calculator-CknvFHdd.js","/assets/calendar-CqK2FJ0-.js","/assets/calendar-days-5xBbiwzJ.js","/assets/camera-Bk7y2bM2.js","/assets/categories-y1LlkRkZ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-QIK5fcpv.js","/assets/chart-line-CpsDIaQl.js","/assets/chart-pie-BoGvzYxC.js","/assets/chartRange-Cq4SYtdx.js","/assets/check-check-hj13TLAM.js","/assets/chevron-left-BA-WMFLn.js","/assets/chevrons-up-down-Bk31xLOF.js","/assets/circle-CXMuty9F.js","/assets/circle-alert-C4b75ctU.js","/assets/circle-check-big-C0RsHsUA.js","/assets/circle-dashed-C_AFE-TM.js","/assets/circle-minus-C8lrN9yR.js","/assets/circle-question-mark-tJk67Eim.js","/assets/circle-slash-CQoenixW.js","/assets/circle-user-round-YF5TVGIX.js","/assets/clock-3-6X-YfvV7.js","/assets/cloud-off-B7MsOjHk.js","/assets/cloud-upload-CoNd9P6P.js","/assets/compass-DyPwRy3Z.js","/assets/concernCategories-DoudGlts.js","/assets/copy-CALmlH_O.js","/assets/corner-down-right-C-ToKlwR.js","/assets/createLucideIcon-Czn6yy60.js","/assets/es-DhBdDTz6.js","/assets/exportXlsx-CNZ5MDOI.js","/assets/external-link-BSxZftTG.js","/assets/file-clock-BH34Oh1J.js","/assets/file-exclamation-point-C8BYtjJO.js","/assets/file-spreadsheet-BE01RY5D.js","/assets/file-text-D1w7j9oE.js","/assets/flag-JvMF0YTs.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CQF5XyWh.js","/assets/hash-B3lCLVlp.js","/assets/history-B_IDOFF9.js","/assets/hourglass-CwCjlCIE.js","/assets/image-BO3Q4Tt2.js","/assets/image-off-DJkTBhia.js","/assets/inbox-BYlQ8pio.js","/assets/index-B1BGX_7I.css","/assets/index-C3F7NU72.js","/assets/key-round-CCmZStYr.js","/assets/keyboard-CQX5ZQfu.js","/assets/languages-DlzzN1b9.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CGih6pP2.js","/assets/lightbulb-D1h_4cWL.js","/assets/link-2-CupVgCWU.js","/assets/link-2-off-BWJQ-SwC.js","/assets/list-ordered-DvVzLVUw.js","/assets/list-tree-Cf9di6xu.js","/assets/lock-open-C7ItPhnd.js","/assets/log-in-D9svVF1S.js","/assets/maximize-2-D8kF6F8O.js","/assets/message-square-CxiCDE2p.js","/assets/minimize-2-gpYNeECj.js","/assets/package-check-FA1Aevdj.js","/assets/paperclip-B-HzMCkB.js","/assets/pencil-G5GFdRhX.js","/assets/percent-67Uz8USr.js","/assets/pin-CznHMg-i.js","/assets/pin-off-BqGNWDf5.js","/assets/play-CF9XhZ12.js","/assets/plug-zap-Ja9_PfTL.js","/assets/presentation-UZx9a6N4.js","/assets/prop-types-CvZ2h9j-.js","/assets/radio-DUHNSuxs.js","/assets/react-apexcharts.esm-XQmQsjP4.js","/assets/registers-DY_ILj7L.js","/assets/repeat-BXgFcbZl.js","/assets/rotate-ccw-CoPIEmT1.js","/assets/rotate-cw-DigExP0W.js","/assets/save-s2nyHdUF.js","/assets/scopeLinks-2pzWh0m1.js","/assets/scroll-text-qqCghmkS.js","/assets/search-x-BMSXd6ez.js","/assets/segments-BcnCBFNd.js","/assets/send-Clvjnqyf.js","/assets/settings-2-BvtEoWwn.js","/assets/shield-3Csdl72F.js","/assets/shield-alert-H6VknWjj.js","/assets/shield-check-si5XGjxA.js","/assets/shield-question-mark-U0L1fqZ0.js","/assets/siren-B_a6-xcz.js","/assets/snowflake-Bd1DaZAP.js","/assets/split-2kwWYgYT.js","/assets/square-check-big-CFuAzfr9.js","/assets/square-re4_f4Qc.js","/assets/star-2BKejrz0.js","/assets/statusBands-Cd0-SFkN.js","/assets/store-DX9b-UlV.js","/assets/table-2-CharZF2-.js","/assets/table-properties-CZe00l6H.js","/assets/tag-BxDDYz9b.js","/assets/timer-off-x-0tr1W-.js","/assets/trending-down-CWzi5DdP.js","/assets/trending-up-BRAFyI5W.js","/assets/undo-2-P2rDzQPW.js","/assets/useChartTheme-BiNUtuPc.js","/assets/useElementWidth-CjAVNk1W.js","/assets/useIsMobile-JZ0JEJp5.js","/assets/useOpenParam-2fX6L2yG.js","/assets/useStatusBands-CImcq50-.js","/assets/useUrlScope-DYHNhACv.js","/assets/user-B_XsB5gy.js","/assets/user-cog-DNqzgsGW.js","/assets/users-Dx7e9F7y.js","/assets/vfx-l1npAx6O.js","/assets/video-B4-FTW-b.js","/assets/wallet-Dyfa2qZY.js","/assets/warehouse-Dtr4dVNW.js","/assets/x-JyMYpHxU.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
