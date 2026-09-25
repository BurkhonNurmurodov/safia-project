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

const BUILD = "2026-09-25T14:39:48.458Z";
const PRECACHE = ["/","/assets/AdminPanel-CDKQVvEj.js","/assets/AnalysisBoard-DBycPH2V.js","/assets/Arc-d2D6gpaO.js","/assets/ArcLegacy-Dz7UPICV.js","/assets/AttendanceModal-Coz8Ed6V.js","/assets/BrigadirProfile-Dtf7TyUM.js","/assets/BroadcastReceivers-0lZYAkQj.js","/assets/BroadcastRecord-B0pLaulT.js","/assets/CatLockNotice-BwdqYdLe.js","/assets/CategoryLegendModal-yqcxzL0R.js","/assets/CellConcerns-caYXpukQ.js","/assets/CellDetails-BeMy6i_e.js","/assets/CellFormModal-6Oif5wl8.js","/assets/CellLink-DHEpzFEB.js","/assets/Cells-BbUo-YC3.js","/assets/ColumnFilter-DhE-K1aP.js","/assets/ColumnsPicker-D-RjGh6S.js","/assets/CommentsModal-Dvra6jZh.js","/assets/ComparisonTable-CCVobuvK.js","/assets/Concerns-D6_0NZJu.js","/assets/ConfirmDialog-Bt4nFVkC.js","/assets/Daily-Bc1BFjcF.js","/assets/DataTable-BbV7yFFJ.js","/assets/DateRangePicker-D0Hru9Yq.js","/assets/DayReportView-C742X63w.js","/assets/DayStepper-Bs4Wy5Dp.js","/assets/DifferenceBreakdown-DxjwZ253.js","/assets/Downtime-BQotjR3u.js","/assets/Education-BWKJdQEN.js","/assets/EducationLesson-BMA-Wwfu.js","/assets/EmptyState-CJGO_RSB.js","/assets/Exam-Cch9c2-b.js","/assets/FactorySelect-DAbe-MWY.js","/assets/Gamification-BeL-N24n.js","/assets/GroupBadge-DEtQ3D76.js","/assets/HeatmapChart-Kk0xWde5.js","/assets/IdleCell-CLF12BU5.js","/assets/KPICard-B-rpH9jX.js","/assets/Kaizen-DwDheAGZ.js","/assets/KpiDeltaCard-vWB7mgF1.js","/assets/LangTextInput-EByg0_iV.js","/assets/Layout-MXNk_2T2.js","/assets/LeaderDayReport-CYtu0R6-.js","/assets/LeaderUnitReport-CPnwduJ8.js","/assets/Leaderboard-Cab-vr-L.js","/assets/Leaders-pUhQiBbM.js","/assets/LiveOverview-D3YR-Ykl.js","/assets/Login-DDbXDkA8.js","/assets/NotFound-KZRhxsyG.js","/assets/Overview-CeDJBphW.js","/assets/Pagination-Cw029Oj4.js","/assets/PerenaladkaFactTable-raLHiwWk.js","/assets/PlanFulfillment-B-EnkdeT.js","/assets/Production-0LPXHyAG.js","/assets/Profile-DjXLV7sG.js","/assets/ProofCamera-BS2nrhX8.js","/assets/Quality-DI7WV0aY.js","/assets/RequestStateChip-DQ7mLWtV.js","/assets/RichTextEditor-CQBeOYhQ.js","/assets/SearchInput-BDwvxu_M.js","/assets/SeasonalityHeatmap-C1uvIcVE.js","/assets/SegmentedToggle-BrNhUIKl.js","/assets/SetupTimes-DUHaTwQC.js","/assets/ShiftDaily-j0eJP5JM.js","/assets/Staff-9waUWZ6k.js","/assets/StatusBadge-CJL7Loro.js","/assets/Targets-B8zVtdAa.js","/assets/Tasks-DaGNhMFu.js","/assets/TimeWheelPicker-WTGfPkFe.js","/assets/Tooltip-DXSzd5xk.js","/assets/TrendChart-CLYqWQlY.js","/assets/TripleSpeedometer-CvKiRKpw.js","/assets/Trudoyomkost-3ePzoiMT.js","/assets/UsersActivity-BPA7UKc8.js","/assets/WatchProgress-DoD-T9hN.js","/assets/WebLogin-BRs4Uk6Z.js","/assets/WorkerConcerns-zMvt-GJi.js","/assets/Workers-DsgRNXvg.js","/assets/Zagruzka-Pue1OgM2.js","/assets/ZagruzkaCell-D21cbmrL.js","/assets/alarm-clock-dz2TUgEN.js","/assets/api-CTTX3EXm.js","/assets/archive-B0zeWyF2.js","/assets/archive-restore-D6RjwFL6.js","/assets/arrow-down-C55yAKhi.js","/assets/arrow-left-BF0BExmq.js","/assets/arrow-left-right-C45V3HPh.js","/assets/arrow-up-BDb3-xFN.js","/assets/arrow-up-right-CQj21d1R.js","/assets/award-Ba8SFYTE.js","/assets/ban-BNVnUtCo.js","/assets/bot-BDwhBsyR.js","/assets/boxes-B-mNgqKv.js","/assets/brigadirFilters-DCbN1p0D.js","/assets/broadcastTree-izhCGj6D.js","/assets/building-2-DPoVDoT8.js","/assets/calendar-BCESbxBZ.js","/assets/calendar-clock-CR8wdM1C.js","/assets/calendar-days-DdT9zbye.js","/assets/calendar-range-D50PuUhK.js","/assets/camera-D33xNkUZ.js","/assets/categories-CUPyQIYY.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cl9yrRQk.js","/assets/chart-line-C4CMjdOE.js","/assets/chart-pie-BKyzU5zJ.js","/assets/chartRange-DF6o77JU.js","/assets/check-check-Ctmh1Gou.js","/assets/chevron-left-Bdoc_BDN.js","/assets/chevrons-up-down-DxbA9-hv.js","/assets/circle-check-big-DRAbqJqQ.js","/assets/circle-dashed-D3S-ccX_.js","/assets/circle-dot-BQ9BfMUB.js","/assets/circle-minus-D7vEdxjs.js","/assets/circle-slash-CTmuS_Dw.js","/assets/circle-user-round-yNbf0und.js","/assets/coins-iVDOHfUi.js","/assets/compass-ybKc6aQ8.js","/assets/concernCategories-HBAq_x9H.js","/assets/copy-gmyiLY-_.js","/assets/corner-down-right-c5dzZNLP.js","/assets/createLucideIcon-z2Qhb2LQ.js","/assets/exportXlsx-BLOIVW-q.js","/assets/external-link-Cv1fuEYw.js","/assets/file-clock-4b4XOvz7.js","/assets/file-exclamation-point-CaPNW63K.js","/assets/file-spreadsheet-R_UvwqVs.js","/assets/file-text-BI9f3UYL.js","/assets/flag-BDwwzP23.js","/assets/flame-C_bRTXi_.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BP8YGY33.js","/assets/hash-CwRh7jNp.js","/assets/history-iT9_lR45.js","/assets/hourglass-mAKKpuBg.js","/assets/image-Dc-quSVs.js","/assets/image-off-rYnXqYyo.js","/assets/index-BTZsppTH.css","/assets/index-Byar1pRh.js","/assets/key-round-BB4z1RvV.js","/assets/keyboard-D5y1WEu6.js","/assets/languages-8xXx3NdU.js","/assets/layers-BXwZ1p64.js","/assets/leaderReason-Cm3Y2RQY.js","/assets/lightbulb-nCSmLwII.js","/assets/link-2-D6xi0AH-.js","/assets/list-checks-Dmm1nWI1.js","/assets/list-ordered-DTY1LFWU.js","/assets/list-tree-BAxHnoAl.js","/assets/lock-open-CdjX7lk0.js","/assets/log-in-DRFC1VNH.js","/assets/message-square-DOMTJI8M.js","/assets/minimize-2-Cnx7Zbag.js","/assets/package-check-Du97Ye5S.js","/assets/paperclip-T5XzhQPn.js","/assets/pencil-INVPq3Qx.js","/assets/personName-B4KId4zS.js","/assets/pin-Cozdr_xp.js","/assets/play-9StApw62.js","/assets/presentation-CZgsWpBs.js","/assets/prop-types-DuTdCFz6.js","/assets/radio-BWcejpX4.js","/assets/react-apexcharts.esm-IXZ5Fqj4.js","/assets/repeat-B-omYseD.js","/assets/rotate-ccw-DP5SPIAp.js","/assets/rotate-cw-BAMGyRuN.js","/assets/save-BELKnX_9.js","/assets/scale-Ba88mbaQ.js","/assets/scroll-text-BEmK-HwX.js","/assets/search-x-DAqdqk1-.js","/assets/segments-BbsKAB70.js","/assets/send-mWxRAJxt.js","/assets/settings-2-ChAngzvZ.js","/assets/shield-DRp15nhL.js","/assets/shield-alert-DcnJPsIX.js","/assets/shield-check-BMA2K_3Z.js","/assets/shield-question-mark-DlVVU747.js","/assets/siren-BGIiz2cP.js","/assets/smartphone-BqLkmC-K.js","/assets/snowflake-v2K93Jgy.js","/assets/square-D0mNYMmR.js","/assets/square-check-big-CDetQVgc.js","/assets/star-CtdZ-uHR.js","/assets/statusBands-BXlIWXjk.js","/assets/store-B59VXZum.js","/assets/table-2-dZxnfga1.js","/assets/tag-vKuFrPBU.js","/assets/trending-down-fz7QFfUF.js","/assets/trending-up-Bq_XbS26.js","/assets/triangle-alert-0_MPiu32.js","/assets/undo-2-Bfid68_r.js","/assets/useChartTheme-Dq1mFvId.js","/assets/useElementWidth-ie9L5diU.js","/assets/useIsMobile-BDttKedg.js","/assets/useMutation-Bt0xdjq_.js","/assets/useStatusBands-Bd2P8DKy.js","/assets/user-CPBsb4v9.js","/assets/user-check-toD5hoJu.js","/assets/user-cog-C_BwpSTs.js","/assets/user-minus-36XGytIR.js","/assets/users-DNE1QJoI.js","/assets/verifyState-DROMBPlg.js","/assets/video-DCbOVXMc.js","/assets/warehouse-C3pVnWGY.js","/assets/zap-YGwnTZgJ.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
