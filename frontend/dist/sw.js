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

const BUILD = "2026-09-25T03:55:41.488Z";
const PRECACHE = ["/","/assets/AdminPanel-CyYylUi3.js","/assets/AnalysisBoard-BLTFHaqN.js","/assets/Arc-BiENZlN1.js","/assets/AttendanceModal-CgoaY-a3.js","/assets/BrigadirProfile-DX_8EHom.js","/assets/BroadcastReceivers-BIC5m7Oy.js","/assets/BroadcastRecord-CFSbyUI3.js","/assets/CatLockNotice-D-bsHtgT.js","/assets/CategoryLegendModal-DwIAem55.js","/assets/CellConcerns-N3GWTVhv.js","/assets/CellDetails-BhWqjCKq.js","/assets/CellFormModal-DnRFy9bX.js","/assets/CellLink-WeeJ2UiK.js","/assets/Cells-6WejHHTa.js","/assets/ColumnFilter-DtmAVT7B.js","/assets/ColumnsPicker-CBOLjhD3.js","/assets/CommentsModal-CRZmM-Kp.js","/assets/ComparisonTable-fYW4X_bV.js","/assets/Concerns-CbYcLYwW.js","/assets/ConfirmDialog-XSFHUJjT.js","/assets/Daily-mqQyyGFK.js","/assets/DataTable-BaCyR59b.js","/assets/DateRangePicker-Chnr0nJ8.js","/assets/DayReportView-Dn9WcFOU.js","/assets/DayStepper-gRbdjy3H.js","/assets/DifferenceBreakdown-B7tTJEAp.js","/assets/Downtime-DcL50lfF.js","/assets/Education-BXC7-wH1.js","/assets/EducationLesson-CGlrXCqS.js","/assets/EmptyState-BtGfK8f1.js","/assets/Exam-CW8EP9sP.js","/assets/FactorySelect-Bd8ypmZB.js","/assets/Gamification-2z8UfqZF.js","/assets/GroupBadge-BeZMYl_J.js","/assets/HeatmapChart-BwEhZUjv.js","/assets/IdleCell-hafDQOYX.js","/assets/KPICard-C7DrvFOt.js","/assets/Kaizen-BZxuu6fo.js","/assets/KpiDeltaCard-C7xYJN6Z.js","/assets/LangTextInput-DSnMrOpu.js","/assets/Layout-2QwpyAxp.js","/assets/LeaderDayReport-Brr8BdEz.js","/assets/LeaderUnitReport-DC7zkkzC.js","/assets/Leaderboard-Y61ytj2C.js","/assets/Leaders-B6dLWdhZ.js","/assets/LiveOverview-D4HTtGco.js","/assets/Login-CBEGB3CD.js","/assets/NotFound-BnPmiU7M.js","/assets/Overview-CiyuR1cB.js","/assets/Pagination-BUv_SDZf.js","/assets/PerenaladkaFactTable-DrnTyLey.js","/assets/PlanFulfillment-CEqJkbzC.js","/assets/Production-Bg2z1SWw.js","/assets/Profile-DJ3nqUK0.js","/assets/ProofCamera-D_1VjcVQ.js","/assets/Quality-BjV1KgXF.js","/assets/RequestStateChip-lb6YyE7A.js","/assets/RichTextEditor-BH0ZZ6Ti.js","/assets/SearchInput-zKN3B5LT.js","/assets/SeasonalityHeatmap-Bbjgqxv2.js","/assets/SegmentedToggle-lUAlIkIa.js","/assets/SetupTimes-Bzj0JBvQ.js","/assets/ShiftDaily-DxucTj_w.js","/assets/Staff-DIEiQIYt.js","/assets/StatusBadge-BSAA8eu3.js","/assets/Targets-ClUtdDvF.js","/assets/Tasks-KmCko5bm.js","/assets/TimeWheelPicker-DhySv9Dp.js","/assets/Tooltip-BkDoryOd.js","/assets/TrendChart-CQveJv0Z.js","/assets/TripleSpeedometer-Daq342nY.js","/assets/Trudoyomkost-BV2tzCRl.js","/assets/UsersActivity-nJjE_iz0.js","/assets/WatchProgress-DwbZ2WbU.js","/assets/WebLogin-B-tli_Vp.js","/assets/WorkerConcerns-CxNAUH1i.js","/assets/Workers-o4YXvzFi.js","/assets/Zagruzka-Dv-WApz_.js","/assets/ZagruzkaCell-8I3bAdOe.js","/assets/alarm-clock-DxFNRKQO.js","/assets/api-V0kY6x3h.js","/assets/archive-Cr7hrBuE.js","/assets/archive-restore-_VYw3R8c.js","/assets/arrow-down-QBC5rvG7.js","/assets/arrow-left-Bl8_JoxY.js","/assets/arrow-left-right-A3nEdUXW.js","/assets/arrow-up-DD_Ra5rS.js","/assets/arrow-up-right-CRjjSGl0.js","/assets/award-BhYcfKVf.js","/assets/ban-Cl4AhZv-.js","/assets/bot-ddighEJa.js","/assets/boxes-B1G7-mRp.js","/assets/brigadirFilters-DrO-BFoX.js","/assets/broadcastTree-C25g0IWY.js","/assets/building-2-CYZxQY15.js","/assets/calendar-De3n7oBu.js","/assets/calendar-clock-DB9rxzEZ.js","/assets/calendar-days-ySGgAJMi.js","/assets/calendar-range-BspXBpcT.js","/assets/camera-DoPTTVXg.js","/assets/categories-B2Jgw3EB.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DwX_-IGH.js","/assets/chart-line-BT08n5Bb.js","/assets/chart-pie-D-N4YqD2.js","/assets/chartRange-lvCWSdbT.js","/assets/check-check-Dmx0ivzA.js","/assets/chevron-left-CVO31LLt.js","/assets/chevrons-up-down-DEbza-Hr.js","/assets/circle-check-big-BDWgghXa.js","/assets/circle-dashed-BNvLMC7C.js","/assets/circle-dot-CF1ZwqCK.js","/assets/circle-minus-M2G8s8o9.js","/assets/circle-slash-BUhF7HEz.js","/assets/circle-user-round-C1oV3TcW.js","/assets/coins-Dbz0w944.js","/assets/compass-B-tj_YN9.js","/assets/concernCategories-BHW_NWZr.js","/assets/copy-DFNMhqUu.js","/assets/corner-down-right-BusrczZR.js","/assets/createLucideIcon-Ck4Eq1QU.js","/assets/exportXlsx-BwvYKnVl.js","/assets/external-link-BRQxkfRS.js","/assets/file-clock-DBfLPKUY.js","/assets/file-spreadsheet-DroxY6eO.js","/assets/file-text-V9SMDArB.js","/assets/flag-bYmwojJf.js","/assets/flame-8KhOuO45.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BMqXIsE2.js","/assets/hash-CMSm1q3o.js","/assets/history-BBDc4DIh.js","/assets/hourglass-DVLEEcxY.js","/assets/image-COUFM3cP.js","/assets/image-off-_oTcP6g_.js","/assets/index-BMCZProW.css","/assets/index-Dsqe6qoI.js","/assets/keyboard-B8oJPJjI.js","/assets/languages-BOFFJ2rY.js","/assets/layers-DHlJh8OD.js","/assets/leaderReason-J7Wmreuk.js","/assets/lightbulb-BhvRqSb_.js","/assets/link-2-BFEmGfiW.js","/assets/list-checks-9Xt5IgyG.js","/assets/list-ordered-BHC_M1ex.js","/assets/lock-open-BMDjMvdr.js","/assets/log-in-CF9WLOvu.js","/assets/message-square-DznmLcnW.js","/assets/minimize-2-WNrzVnUP.js","/assets/paperclip-DzDZaxPt.js","/assets/pencil-Dra1aueB.js","/assets/personName-B4KId4zS.js","/assets/pin-CPNSmE8I.js","/assets/play-1FI5fe5c.js","/assets/presentation-CAr7X-2N.js","/assets/prop-types-ygRvHDiG.js","/assets/radio-CFPi48Gp.js","/assets/react-apexcharts.esm-kaMHQXh1.js","/assets/repeat-Cvw5ApE7.js","/assets/rotate-ccw-BKqvad_x.js","/assets/rotate-cw-DcC9gjb9.js","/assets/save-DY1W9f5J.js","/assets/scale-SeJawlUH.js","/assets/scroll-text-CdUY5TR3.js","/assets/search-x-Bxy_WS92.js","/assets/segments-DVonnSXv.js","/assets/send-1x0zivuQ.js","/assets/settings-2-BGOyi2pY.js","/assets/shield-D5SXwmZ1.js","/assets/shield-alert-VwxGSdKR.js","/assets/shield-check-DowwG4ek.js","/assets/shield-question-mark-DDHW27cA.js","/assets/siren-C6cXplh1.js","/assets/smartphone-CTkkX5dP.js","/assets/snowflake-daBIq2MJ.js","/assets/square-CbBF0zlG.js","/assets/square-check-big-20ZyA1Gr.js","/assets/star-BNHY1JmC.js","/assets/statusBands-DBxQ0bHa.js","/assets/table-2-D64IapZa.js","/assets/tag-Bf5jNd7_.js","/assets/trending-down-CVG24cTY.js","/assets/trending-up-C-ip_ro-.js","/assets/triangle-alert-CWzIuTdm.js","/assets/undo-2-CQrnAzFw.js","/assets/useChartTheme-B6L9Xwnw.js","/assets/useElementWidth-DM5VhGG7.js","/assets/useIsMobile-BYcE_UHR.js","/assets/useMutation-Cxzt3PX4.js","/assets/useStatusBands-wgDUrFOa.js","/assets/user-afc2ycQb.js","/assets/user-check-BVA1atHq.js","/assets/user-cog-D5Su9-QQ.js","/assets/user-minus-dKrbk-Af.js","/assets/users-PffunyDE.js","/assets/verifyState-CqMeJEQM.js","/assets/video-Cs51alIA.js","/assets/warehouse-CBB_IyJ9.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
