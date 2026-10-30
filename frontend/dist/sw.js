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

const BUILD = "2026-10-30T06:03:54.721Z";
const PRECACHE = ["/","/assets/AdminPanel-BXyZcIlp.js","/assets/AnalysisBoard-QwqY-_-U.js","/assets/Arc-Ci39smQQ.js","/assets/Assistant-JlOZtdwH.js","/assets/BrigadirProfile-ZUU0fMl5.js","/assets/BroadcastReceivers-D0jmb5dj.js","/assets/BroadcastRecord-Cvl1OBm1.js","/assets/Button-BoQRjrqu.js","/assets/CatLockNotice-zM-9kxVe.js","/assets/CategoryLegendModal-CeCMVGZw.js","/assets/CellConcerns-C39z9-vp.js","/assets/CellDetails-DMyxTM4c.js","/assets/CellFormModal-C7pjviwA.js","/assets/CellIdent-Bg22zScf.js","/assets/CellLink-DZ9dzMcM.js","/assets/Cells-DziJ3AHx.js","/assets/ColumnFilter-DZxaxeAA.js","/assets/ColumnsPicker-DRvBce_P.js","/assets/CommentsModal-D-MGNIbm.js","/assets/ComparisonTable-Aldauyyr.js","/assets/Concerns-Ds7LbUM5.js","/assets/CountStepper-BjzQ19oY.js","/assets/Daily-DF8uHz5W.js","/assets/DataTable-BUMLyevn.js","/assets/DateRangePicker-EQCSr1v0.js","/assets/DayReportView-wEngxtcb.js","/assets/DayStepper-BR9g7Ttm.js","/assets/DayStrip-CoO4cFjQ.js","/assets/DifferenceBreakdown-CO9F_XaU.js","/assets/Downtime-B6R3ewF9.js","/assets/Education-DS1hL1CQ.js","/assets/EducationLesson-CBhKq3ZM.js","/assets/EmptyState-tM-3QktF.js","/assets/Exam-EY07K4kg.js","/assets/FactorySelect-CT_-FtbW.js","/assets/Gamification-ChmczO74.js","/assets/GroupBadge-FnkdTt61.js","/assets/HeatmapChart-DprkvgTb.js","/assets/IdleCell-K87CHvNh.js","/assets/KPICard-BhxV8Hqk.js","/assets/Kaizen-BSbch-wc.js","/assets/Kelish-CbIDzqB5.js","/assets/KpiDeltaCard-u5u9JTKM.js","/assets/LangTextInput-C550z2FW.js","/assets/Layout-CdZAZR8J.js","/assets/LeaderAppeal-DogFbsI2.js","/assets/LeaderDayReport-Ch3zCGo2.js","/assets/LeaderUnitReport-C133tef0.js","/assets/Leaderboard-BchR8Dwa.js","/assets/Leaders-C7QjJf8L.js","/assets/LeadersKpi-DeNzDz4K.js","/assets/Lightbox-DRqsrfS8.js","/assets/LiveOverview-CZ2J4uas.js","/assets/Login-DYLO2ZQx.js","/assets/NotFound-BO2SB9KE.js","/assets/Notifications-Q8fkGygY.js","/assets/Ontime-DWo765EH.js","/assets/Overview-CrBwQwtf.js","/assets/Pagination-BnsdJOH_.js","/assets/PerenaladkaFactTable-D-5Xyre-.js","/assets/PersonCard-CkIkSeox.js","/assets/PlanFulfillment-ChhBd4VW.js","/assets/Production-BsVXH9RR.js","/assets/Profile-z7Aoj5is.js","/assets/ProofCamera-CnWe8rAi.js","/assets/ProofPhoto-HNyCZbNZ.js","/assets/Quality-K5xRxHxg.js","/assets/RawRows-CXyioC1-.js","/assets/Reports-D4SaD3xX.js","/assets/RequestStateChip-CacfV58-.js","/assets/RichTextEditor-10-MMfs-.js","/assets/SaveState-BMVHvHCo.js","/assets/SearchInput-BhYPQ-V6.js","/assets/SeasonalityHeatmap-DbSR0Usj.js","/assets/SegmentedToggle-BRnh0ZuF.js","/assets/SetupTimes-yDZf-NDM.js","/assets/ShiftDaily-C7-OpHcp.js","/assets/Staff-mkRPedPn.js","/assets/StaffListAtCheck-CiMzcqgD.js","/assets/StatusBadge-Bg1i5VRO.js","/assets/StatusBandsModal-wXCqOpzg.js","/assets/TargetGoal-BF1iyuld.js","/assets/Targets-D26Mnafq.js","/assets/Tasks-DOpMGRyi.js","/assets/TimeWheelPicker-D2Y56Np8.js","/assets/Toast-B-HPJaCi.js","/assets/Tooltip-BhepZN9F.js","/assets/TrendChart-C9BrJDRz.js","/assets/TripleSpeedometer-C4UiIPc3.js","/assets/Trudoyomkost-UPz23TEP.js","/assets/UploadDropzone-DJhgZ63t.js","/assets/UsersActivity-Bh1hPKcT.js","/assets/VerdictBlock-mMAkv2Yn.js","/assets/VfxApiMap-BL9Yjw1C.js","/assets/VfxDictionaries-CjKQwn3c.js","/assets/VfxEmployees-Bx8rMMQD.js","/assets/VfxHrMoves-CVQIwLuz.js","/assets/VfxJobs-CanpeGal.js","/assets/VfxPhoto-C1gCIdmD.js","/assets/VfxShifts-DXH9Num4.js","/assets/VfxState-9_s8X9lD.js","/assets/VfxTimebooks-BnKiyW8t.js","/assets/VfxTimesheet-D8NufL7l.js","/assets/WatchProgress-CKX-9SNH.js","/assets/WebLogin-CnlXsJD0.js","/assets/Workers-BVKz90Qg.js","/assets/Zagruzka-BhfNl5Yo.js","/assets/ZagruzkaCell-qvCHqBfV.js","/assets/api-BFm7MSgf.js","/assets/archive-CVcKWqGD.js","/assets/archive-restore-Ag5BYlMi.js","/assets/arrow-down-Dr46Omha.js","/assets/arrow-down-right-B5c3b0Yj.js","/assets/arrow-down-wide-narrow-CYMWEeOf.js","/assets/arrow-up-narrow-wide-DgEzTRfV.js","/assets/ban-DfyMf4rk.js","/assets/boxes-CJB3BJ_9.js","/assets/braces-Bmzv_Rk4.js","/assets/brigadirFilters-csO1ugCt.js","/assets/broadcastTree-DsZE3f6v.js","/assets/building-2-Cw8rzNso.js","/assets/calendar-CeupNcso.js","/assets/calendar-days-BMu8pURq.js","/assets/camera-C20RhrJc.js","/assets/categories-DpzOd_LA.js","/assets/cellMoveRefusal-Br3vWdY-.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-_rPg71N9.js","/assets/chart-line-Cl9eH5-W.js","/assets/chart-pie-BZh4BTTs.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-DrKvL2pi.js","/assets/chevron-left-BZqvDyee.js","/assets/chevrons-up-down-DqkeEvS2.js","/assets/circle-BkzCZFjU.js","/assets/circle-alert-Bg1ON_7z.js","/assets/circle-check-big-DkcJPG8L.js","/assets/circle-dashed-DwW5J0kd.js","/assets/circle-minus-D7qbXA_r.js","/assets/circle-question-mark-CEIPdIck.js","/assets/circle-slash-y45BegMw.js","/assets/circle-user-round-ikeRTzU_.js","/assets/cloud-off-KW_-4ZtE.js","/assets/cloud-upload-ynTyOrbc.js","/assets/coins-Dd9GaLsy.js","/assets/compass-BdYq-yi5.js","/assets/concernCategories-DFcVE8lu.js","/assets/corner-down-right-B60tF3O9.js","/assets/createLucideIcon-DP4lXSeP.js","/assets/en-DqarfLj6.js","/assets/es-Dtgc5NM1.js","/assets/external-link-CfOqPKFj.js","/assets/file-clock-C5FCetEc.js","/assets/file-exclamation-point-CZhSdVZT.js","/assets/flag-D-wE4HC-.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-tPiLxJ_5.js","/assets/funnel-ty5dnLOs.js","/assets/hash-DgA67QzC.js","/assets/hourglass-CUeWToe3.js","/assets/idleTime-CHPnJRpw.js","/assets/image-BMvwvPWr.js","/assets/image-off-Dq-12fwO.js","/assets/inbox-BMjucmSP.js","/assets/index-BtYmuUYW.css","/assets/index-pE607MYy.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-BO2jQnEf.js","/assets/languages-CbiWdlrb.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-mueL6dlX.js","/assets/leaderBoard-BRm7-NvA.js","/assets/lightbulb-DyP-KOiR.js","/assets/link-2-DdECDQRO.js","/assets/link-2-off-DVWzCBU_.js","/assets/list-ordered-kaET-bva.js","/assets/list-tree-DmXyCYv-.js","/assets/lock-open-DlG_ybFD.js","/assets/log-in-B_So6bLx.js","/assets/map-pin-BOBAWa0I.js","/assets/marks-r27VQpZQ.js","/assets/minimize-2-Ci8eaYNM.js","/assets/package-check-D6mPFRSB.js","/assets/pencil-BXly0E1B.js","/assets/percent-B_p6o9fX.js","/assets/pin-CHZLhPGy.js","/assets/pin-off-DJWZQsXk.js","/assets/play-BL7sQ0mm.js","/assets/plug-zap-Ytx7gxFc.js","/assets/prop-types-RD3fbola.js","/assets/radio-BL265k9a.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-DP6acN3y.js","/assets/repeat-CELf9E54.js","/assets/ru-AnkQRyZ_.js","/assets/save-aMQeyCIp.js","/assets/scopeLinks-BM_I9ZQR.js","/assets/scroll-text-DsOHAw_U.js","/assets/search-x-AJV2Ra3x.js","/assets/segments-D5Uiedtv.js","/assets/send-BTI_DHJt.js","/assets/settings-2-Bql9aQPe.js","/assets/shield-DvktL1GO.js","/assets/shield-alert-CAQTvvWK.js","/assets/shield-question-mark-CZNZrFd9.js","/assets/sigma-B9_W1Za7.js","/assets/siren-DvZBo5yg.js","/assets/snowflake-1aDJDnZx.js","/assets/split-b24AFdKt.js","/assets/square-check-big-DpAyb5jh.js","/assets/star-QYdSbvMe.js","/assets/statusBands-DVBZcBq3.js","/assets/store-Bff3jpW5.js","/assets/table-2-C1TJwexG.js","/assets/table-properties-DBo5xOvt.js","/assets/tag-BA2pHXmN.js","/assets/timer-off-DSdIswWD.js","/assets/translations-DDCIX97M.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-CrvEJ9_4.js","/assets/trending-up-CFnDRzSS.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-4cEkQKIY.js","/assets/useChartTheme-BgX5CgCS.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-DQ9HD-dW.js","/assets/useStatusBands-B2i50s3Q.js","/assets/useUrlScope-By9beRCh.js","/assets/user-cog-BZVv0BhB.js","/assets/user-h8plzMHG.js","/assets/user-minus-BjaJG801.js","/assets/users-CfPKmCol.js","/assets/uz-CkKkwgzn.js","/assets/uz_cyrl-Cozl0UwD.js","/assets/vfx-7XkJJgEt.js","/assets/video-Ls1sM4BJ.js","/assets/wallet-7aUpWGpU.js","/assets/warehouse-BNnjQ-ds.js","/assets/workflow-02HWCNNH.js","/assets/x-C52CwiN8.js","/assets/zap-aetVeAWz.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
