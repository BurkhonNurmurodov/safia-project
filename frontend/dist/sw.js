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

const BUILD = "2026-09-24T06:50:04.652Z";
const PRECACHE = ["/","/assets/AdminPanel-Dk-qpwce.js","/assets/AnalysisBoard-DNfhkbiG.js","/assets/Arc-oBKuj0qC.js","/assets/AttendanceModal-DZ6Hg9VF.js","/assets/BrigadirProfile-VPR4sbD1.js","/assets/BroadcastReceivers-CMv3wmbW.js","/assets/BroadcastRecord-D1CHphJV.js","/assets/CatLockNotice-BXGRt7zt.js","/assets/CategoryLegendModal-BVTRWFlL.js","/assets/CellConcerns-WyHCCO1A.js","/assets/CellDetails-Dli3ZqNo.js","/assets/CellFormModal-R9FtppoX.js","/assets/CellLink-B3xa5HOK.js","/assets/Cells-C45k6ArZ.js","/assets/ColumnFilter-CRuVPNcs.js","/assets/ColumnsPicker-DNdT4ht6.js","/assets/CommentsModal-DLQi5K0B.js","/assets/ComparisonTable-D7tYnrDj.js","/assets/Concerns-CF-ytnml.js","/assets/ConfirmDialog-DFfutBwb.js","/assets/Daily-gpBvvlv6.js","/assets/DataTable-Chx7ZW1q.js","/assets/DateRangePicker-E_FBcK9d.js","/assets/DayReportView-DWyGNOOB.js","/assets/DayStepper-DYqQSYmR.js","/assets/DifferenceBreakdown-Bwg714jy.js","/assets/Downtime-Bm7cHZBS.js","/assets/Education-CtYKSBVN.js","/assets/EducationLesson-Dp7y3TmG.js","/assets/EmptyState-D__cfqaF.js","/assets/FactorySelect-C1_bIA99.js","/assets/FormField-DHqisIga.js","/assets/Gamification-Du46ngJa.js","/assets/GroupBadge-99gUSccN.js","/assets/HeatmapChart-DzYB5CN_.js","/assets/IdleCell-DY9l_knv.js","/assets/KPICard-DJ6tTPFA.js","/assets/Kaizen-HR5J6Pxy.js","/assets/KpiDeltaCard-CUKZnfOc.js","/assets/LangTextInput-VuhR6TGS.js","/assets/Layout-C1aXiwj7.js","/assets/LeaderDayReport-BoTd-z51.js","/assets/LeaderUnitReport-DpVeRMxB.js","/assets/Leaderboard-BgOnPjlu.js","/assets/Leaders-QIBCi7Rk.js","/assets/LiveOverview-BD2ExJVv.js","/assets/Login-CKkouTop.js","/assets/NotFound-elG49TH8.js","/assets/Overview-Cfwt0ilf.js","/assets/Pagination-Btpnv1eC.js","/assets/PerenaladkaFactTable-7S5Ay3oP.js","/assets/PlanFulfillment-Bix9vbD3.js","/assets/Production-CfjtE2RV.js","/assets/Profile-B4L1NxDy.js","/assets/ProofCamera-CTRJACNC.js","/assets/Quality-VCG4xGAe.js","/assets/RichTextEditor-CTHOLAQI.js","/assets/SearchInput-DZc6KRQA.js","/assets/SeasonalityHeatmap-4oO6PnnG.js","/assets/SegmentedToggle-BluZVhr_.js","/assets/SetupTimes-DQ7M1c7Q.js","/assets/ShiftDaily-Bl1fnzg0.js","/assets/Skeleton-BjL0AUA5.js","/assets/Staff-DxJkoXHn.js","/assets/StatusBadge-oeYDbvPo.js","/assets/StyledSelect-DfG-gAuU.js","/assets/Targets-DGN_pusr.js","/assets/Tasks-yu187Oi8.js","/assets/TimeField-Dgoi-arT.js","/assets/TimeWheelPicker-Cxjh5rCt.js","/assets/Toast-Ds3W0uzJ.js","/assets/Tooltip-Bdh_xUKK.js","/assets/TrendChart-zXJoDGxm.js","/assets/TripleSpeedometer-CELBKhPQ.js","/assets/Trudoyomkost-CUiBct83.js","/assets/UsersActivity-A3rjJY7l.js","/assets/WatchProgress-zMYDZla1.js","/assets/WebLogin-CvNscKI3.js","/assets/WorkerConcerns-BPUcMrgm.js","/assets/Workers-B-KZjzkr.js","/assets/Zagruzka-CqXcrhaT.js","/assets/ZagruzkaCell-90xCpfIk.js","/assets/alarm-clock-BfvjMuXT.js","/assets/api-CD7W6cFw.js","/assets/archive-BHwz7K82.js","/assets/archive-restore-Bbmx9DLV.js","/assets/arrow-down-DRkHH2jd.js","/assets/arrow-left-BzUESEZJ.js","/assets/arrow-left-right-DIthx8YJ.js","/assets/arrow-right-DrqTPuEs.js","/assets/arrow-up-CE8dypAX.js","/assets/arrow-up-right-CBC3nBrv.js","/assets/award-DZL56WqJ.js","/assets/ban-BdUaI5ag.js","/assets/bot-CRMxfwNa.js","/assets/boxes-IPrkdFCz.js","/assets/brigadirFilters-Vz_A9jDw.js","/assets/broadcastTree-DwIChPn7.js","/assets/building-2-BIu8sImg.js","/assets/calendar-DmQAJOhG.js","/assets/calendar-clock-DMxdvUwy.js","/assets/calendar-days-CTvjZAQi.js","/assets/calendar-range-CMjZ-Frt.js","/assets/camera-BjcSqCyS.js","/assets/categories-DmYexuXy.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-oEAbTyiV.js","/assets/chart-line-CXKuMUCX.js","/assets/chart-pie-DoKkksi4.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-CudmUM6g.js","/assets/check-BZbOubsM.js","/assets/check-check-BiHOWBGm.js","/assets/chevron-left-BaHv704P.js","/assets/chevrons-up-down-D4SBXQ9O.js","/assets/circle-dashed-CHxj1WTN.js","/assets/circle-dot-CVvXPMeO.js","/assets/circle-minus-DIIkZJlp.js","/assets/circle-slash-nUpefu97.js","/assets/circle-user-round-C8Kih84y.js","/assets/coins-0y_HYgoR.js","/assets/compass-Cr5HfkdR.js","/assets/concernCategories-Ll9bYCdG.js","/assets/copy-CWpI1pUd.js","/assets/corner-down-right-OMyLIo7N.js","/assets/createLucideIcon-DGiNHk11.js","/assets/exportXlsx-BNWCxXkp.js","/assets/external-link-DKIcmkZ4.js","/assets/file-clock-C3aXGsXH.js","/assets/file-spreadsheet-CeJR2KIo.js","/assets/file-text-CGMX6gJ0.js","/assets/flag-2QdPyyfS.js","/assets/flame-DgqaKKZ1.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Dy2KD38h.js","/assets/hash-CxEAOyTF.js","/assets/history-Bx5eU6Ge.js","/assets/hourglass-Cma8Y6U8.js","/assets/image-GrUGbGKU.js","/assets/image-off-DATGu2Um.js","/assets/index-BqL8Xp7m.js","/assets/index-ftrCYFhP.css","/assets/keyboard-DlBKHlvr.js","/assets/languages-BLp0FzsH.js","/assets/layers-DL4WKxb8.js","/assets/leaderReason-CxKLeIqg.js","/assets/lightbulb-N-MeDOQN.js","/assets/link-2-BbMXGEVn.js","/assets/list-checks-DahPXgGh.js","/assets/list-ordered-8UZB9m0g.js","/assets/lock-open-DhPTf3F-.js","/assets/log-in-X9ih9tBb.js","/assets/message-square-BFwyldKa.js","/assets/minimize-2-DPdU2J0b.js","/assets/minus-CFEkHP14.js","/assets/paperclip-DOMLx_yY.js","/assets/pencil-D5gVJiiR.js","/assets/pencil-line-BFN3h1fX.js","/assets/personName-B4KId4zS.js","/assets/pin-olFCX6Si.js","/assets/play-CBTYGjbe.js","/assets/presentation-Z7qXwdZH.js","/assets/prop-types-C8GDRTUh.js","/assets/radio-B9rhb3av.js","/assets/react-apexcharts.esm-Ckp-6Vn2.js","/assets/refresh-cw-DJuLuqK9.js","/assets/repeat-Dp8XEyCy.js","/assets/rotate-ccw-CAsr5GI0.js","/assets/rotate-cw-DYSGZGEc.js","/assets/save-CSf3MUd_.js","/assets/scale-DswEKk0b.js","/assets/scroll-text-BT8HJN8x.js","/assets/search-x-Btj3qKIa.js","/assets/segments-D7mWX2iy.js","/assets/send-NDTQkfna.js","/assets/settings-2-EacqLkaB.js","/assets/shield-alert-DjbGCsiV.js","/assets/shield-b7aFVV9S.js","/assets/shield-check-DYx5ChXN.js","/assets/shield-question-mark-eTGDHYNi.js","/assets/siren-BRTZGhWi.js","/assets/smartphone-4GyNOrsR.js","/assets/snowflake-DC78YbcO.js","/assets/square-CBpQSB02.js","/assets/square-check-big-g9UJsuFS.js","/assets/star-CNTUS9pM.js","/assets/statusBands-Dc6hIGTL.js","/assets/table-2-EtJt7gxb.js","/assets/tag-De3yoqua.js","/assets/trash-2-BDu88swn.js","/assets/trending-down-Cs2CdKph.js","/assets/trending-up-2KjJdaz5.js","/assets/undo-2-BSxqSuM1.js","/assets/useChartTheme-B53calXJ.js","/assets/useElementWidth-DY2wKPFv.js","/assets/useIsMobile-BWw7C9Ti.js","/assets/useMutation-C0HPrVrM.js","/assets/useStatusBands-ByqdNdee.js","/assets/user-check-Cd-6VZMU.js","/assets/user-cog-DboMlOpl.js","/assets/user-minus-CIWdsi8K.js","/assets/users-DUW2Oh4S.js","/assets/verifyState-A1TPyWjZ.js","/assets/video-D6eJiE3j.js","/assets/warehouse-Bk6FlkYB.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
