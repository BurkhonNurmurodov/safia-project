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

const BUILD = "2026-09-23T06:46:31.999Z";
const PRECACHE = ["/","/assets/AdminPanel-Cx45O4tv.js","/assets/AnalysisBoard-DjMN5TuR.js","/assets/Arc-D3Y4BELs.js","/assets/AttendanceModal-D0Jv7WMr.js","/assets/BrigadirProfile-BnTQmiKb.js","/assets/BroadcastReceivers-qhRj9CAv.js","/assets/BroadcastRecord-BqSsAWzJ.js","/assets/CatLockNotice-Cla90OwT.js","/assets/CategoryLegendModal-QyzVzWeh.js","/assets/CellConcerns-SZTdTCKz.js","/assets/CellDetails-DAS1TTZA.js","/assets/CellFormModal-DQtPi56l.js","/assets/CellLink-BWkbsiRo.js","/assets/Cells-C-IXIhHy.js","/assets/ColumnFilter-Cx8FMxlX.js","/assets/ColumnsPicker-CUB4V4FG.js","/assets/CommentsModal-PLzXu4Z7.js","/assets/ComparisonTable-BmM23dqc.js","/assets/Concerns-DYYP7Rvx.js","/assets/ConfirmDialog-BYYebdZ1.js","/assets/Daily-BmaHcw8l.js","/assets/DataTable-BRxlMqDR.js","/assets/DateRangePicker-DlcPtlJa.js","/assets/DayReportView-CLPzq989.js","/assets/DayStepper-DxfqESai.js","/assets/DifferenceBreakdown-u1DyL20n.js","/assets/Downtime-BLikiYAY.js","/assets/Education-COxjDi6z.js","/assets/EducationLesson-C_CuG966.js","/assets/EmptyState-DEH2mhO-.js","/assets/FactorySelect-DcVsjaT7.js","/assets/FormField-DkWb0GOg.js","/assets/Gamification-BDq0sbQK.js","/assets/GroupBadge-CMnQvCXt.js","/assets/HeatmapChart-IojG2HI1.js","/assets/IdleCell-EE11_2Nc.js","/assets/KPICard-D-9SlxFJ.js","/assets/Kaizen-xbEuIL0U.js","/assets/KpiDeltaCard-CYy_4AtD.js","/assets/LangTextInput-CiqtSRar.js","/assets/Layout-B83r3BKT.js","/assets/LeaderDayReport-DGC_u9Zz.js","/assets/LeaderUnitReport-D-Kkcc24.js","/assets/Leaderboard-BKWhtSxc.js","/assets/Leaders-CcvcqmNT.js","/assets/LiveOverview-B1sg2t2b.js","/assets/Login-DUXLOX_b.js","/assets/NotFound-BoRfJcj8.js","/assets/Overview-BpxbbVNf.js","/assets/Pagination-DsJk3FkJ.js","/assets/PerenaladkaFactTable-IQwrG3lS.js","/assets/PlanFulfillment-CYbR_RmF.js","/assets/Production-Dl-Mic1k.js","/assets/Profile-CvAgv5__.js","/assets/ProofCamera-DkdlD0I-.js","/assets/Quality-DQfLl_qX.js","/assets/RichTextEditor-_netSVCu.js","/assets/SearchInput-BQqB-9EY.js","/assets/SeasonalityHeatmap-D98hlbSQ.js","/assets/SegmentedToggle-BQklV45C.js","/assets/SetupTimes-C5P7oQu3.js","/assets/ShiftDaily-nXjSPvQh.js","/assets/Skeleton-Bm5u3Fyr.js","/assets/Staff-Ck2mWu6Y.js","/assets/StatusBadge-BxrpO1nW.js","/assets/StyledSelect-Dk8oAjw3.js","/assets/Targets-CVuko5va.js","/assets/Tasks-B8cEEgjv.js","/assets/TimeField-CXz60Lxa.js","/assets/TimeWheelPicker-Ci8v35lm.js","/assets/Toast-Cvc62xil.js","/assets/Tooltip-B5UIIZm-.js","/assets/TrendChart-CMOYs3G-.js","/assets/TripleSpeedometer-xAua_rBs.js","/assets/Trudoyomkost-Dhsi5fCe.js","/assets/UsersActivity-DV-jU-fe.js","/assets/WatchProgress-CDT3_I_T.js","/assets/WebLogin-CgmhUKgK.js","/assets/WorkerConcerns-BkSCMv2K.js","/assets/Workers-5U7tN6-C.js","/assets/Zagruzka-CSweYe25.js","/assets/ZagruzkaCell-C0qX36hi.js","/assets/alarm-clock-CpUy0cgG.js","/assets/api-DSeedZTh.js","/assets/archive-jEURTo7a.js","/assets/archive-restore-DnOKKI4i.js","/assets/arrow-down-DY3JuuPc.js","/assets/arrow-left-C5KJ7ElH.js","/assets/arrow-left-right-C968_1XD.js","/assets/arrow-right-DMNJ73Vw.js","/assets/arrow-up-B0a8tFzt.js","/assets/arrow-up-right-BbgDexbW.js","/assets/award-BoiifpZN.js","/assets/ban-Czwz58iv.js","/assets/bot-DURIq8IF.js","/assets/boxes-B6Pi8hs1.js","/assets/brigadirFilters-CqLPA2jH.js","/assets/broadcastTree-sMrDkIvu.js","/assets/building-2-CzMApcXz.js","/assets/calendar-D--qZ5u4.js","/assets/calendar-clock-y4_bwj5i.js","/assets/calendar-days-BSYLlEBb.js","/assets/calendar-range-WiLWUhY_.js","/assets/camera-DaTAuiVm.js","/assets/categories-BFhJvAnx.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DKgJiXj4.js","/assets/chart-line-C1fJ0Hot.js","/assets/chart-pie-zy2SSaPZ.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-DJ7m0VYl.js","/assets/check-Ck_cFo75.js","/assets/check-check-B6VWY1Bi.js","/assets/chevron-left-CJdMkjOk.js","/assets/chevrons-up-down-BgIta2Gh.js","/assets/circle-dashed-Bxle9uG-.js","/assets/circle-dot-Ci1sy4av.js","/assets/circle-minus-Ccxhyv4w.js","/assets/circle-slash-Dy3b3K0z.js","/assets/circle-user-round-B7KX74dq.js","/assets/coins-69_e2dM4.js","/assets/compass-Cp0c83hK.js","/assets/concernCategories-BVAmKgON.js","/assets/copy-Dox6Z6v1.js","/assets/corner-down-right-NMNDECHz.js","/assets/createLucideIcon-MZ6p5XU2.js","/assets/exportXlsx-BRh5f9_G.js","/assets/external-link-DJQ-8-5P.js","/assets/file-clock-CWIStajj.js","/assets/file-spreadsheet-Bh8fdEht.js","/assets/file-text-TRSYym1y.js","/assets/flag-CjQnW55k.js","/assets/flame-CP2o_kzD.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CCIxjPI9.js","/assets/funnel-C-9zz1Qk.js","/assets/hash-Dj4yubb3.js","/assets/history-lYeYW0WP.js","/assets/hourglass-CS92r7jj.js","/assets/image-BVrje2MC.js","/assets/image-off-aApvGALC.js","/assets/index-Ck1xJlfN.js","/assets/index-ftrCYFhP.css","/assets/keyboard-DuKhdp21.js","/assets/languages-CQUHHrgm.js","/assets/layers-DwzJZgIu.js","/assets/leaderReason-DJZ7-Dj9.js","/assets/lightbulb-DIMOyBTU.js","/assets/link-2-z8-DwC1-.js","/assets/list-checks-omeiZ5kp.js","/assets/list-ordered-Bi_8RAya.js","/assets/lock-open-BtcIv5W4.js","/assets/log-in-CZFVyGym.js","/assets/message-square-CAb67Luc.js","/assets/minimize-2-f-r7bgvy.js","/assets/minus-CVemOPMv.js","/assets/paperclip-Bq-vp2o0.js","/assets/pencil-BBB1F02Y.js","/assets/pencil-line-CEh8XnNT.js","/assets/personName-B4KId4zS.js","/assets/pin-Dlfle9PQ.js","/assets/play-DxIxO3nA.js","/assets/presentation-DJHHdCF-.js","/assets/prop-types-Cfq5NMWe.js","/assets/radio-BsLKI4Jo.js","/assets/react-apexcharts.esm-CFvjLs7N.js","/assets/refresh-cw-DJmvgXZH.js","/assets/repeat-DVGggms-.js","/assets/rotate-ccw-B_08icDN.js","/assets/rotate-cw-Du9PxZSL.js","/assets/save-BNFDm-4j.js","/assets/scale-J6-VQ9zN.js","/assets/scroll-text-dvHLYawq.js","/assets/search-x-CXfxGDtw.js","/assets/segments-7TvkhTMd.js","/assets/send-DEk7YTRi.js","/assets/settings-2-Dp7UnQZj.js","/assets/shield-CJJsOxId.js","/assets/shield-alert-DV0HH46A.js","/assets/shield-check-BYCPbjuQ.js","/assets/shield-question-mark-A8U-k6Ua.js","/assets/siren-DYRe2ZOQ.js","/assets/smartphone-Dlfn_xMh.js","/assets/snowflake-nyQ-npU2.js","/assets/square-CtCTvMqi.js","/assets/square-check-big-DsZWGjlT.js","/assets/star-CiYyQEIK.js","/assets/statusBands-C4Tk91q9.js","/assets/table-2-BWbpN0C0.js","/assets/tag-5y6Zc_72.js","/assets/trash-2-BFsCGpF2.js","/assets/trending-down-CtL-a6zq.js","/assets/trending-up-CetGMOyh.js","/assets/undo-2-D5vD34Nt.js","/assets/useChartTheme-Dahk7_9W.js","/assets/useElementWidth-IQNsJdKC.js","/assets/useIsMobile-MBPxvvCo.js","/assets/useMutation-DHO4dyT_.js","/assets/useStatusBands-Brv3Yn_R.js","/assets/user-check-DRs3d7m8.js","/assets/user-cog-CqWrg180.js","/assets/user-minus-COtkhSTo.js","/assets/users-YcjyFEsD.js","/assets/verifyState-SpgUTPW5.js","/assets/video-DMwZlm-c.js","/assets/warehouse-amVdEq0D.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
