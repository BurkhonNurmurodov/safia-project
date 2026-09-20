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

const BUILD = "2026-09-20T00:37:51.932Z";
const PRECACHE = ["/","/assets/AdminPanel-CCbvi2Hy.js","/assets/AnalysisBoard-C6_K_eGX.js","/assets/Arc-DEekGx8C.js","/assets/AttendanceModal-DqYZbDyy.js","/assets/BrigadirProfile-ZRW3xOTS.js","/assets/BroadcastReceivers-DppnVkQI.js","/assets/BroadcastRecord-CLrLtPKr.js","/assets/CatLockNotice-X2Bq1Qex.js","/assets/CategoryLegendModal-D-b-zyCI.js","/assets/CellConcerns-C_9Bxczg.js","/assets/CellDetails-CQrv8MO8.js","/assets/CellFormModal-Gg_PZr2h.js","/assets/CellLink-C3-lBh9z.js","/assets/Cells-WYK7W79C.js","/assets/ColumnFilter-BKxke1FR.js","/assets/ColumnsPicker-R5DAEjbL.js","/assets/CommentsModal-4vOBC0tI.js","/assets/ComparisonTable-o9ckiXa3.js","/assets/Concerns-Ba9Gcff9.js","/assets/ConfirmDialog-RtzpeyyG.js","/assets/Daily-DsK5t-AH.js","/assets/DataTable-DxGb2d3w.js","/assets/DateRangePicker-DHK5O5x3.js","/assets/DayReportView-2LDhMDRl.js","/assets/DayStepper-QU4Z7zBf.js","/assets/DifferenceBreakdown-CntH8BZ7.js","/assets/Downtime-KPKeQQES.js","/assets/Education-BeN6pEix.js","/assets/EducationLesson-CxceJ4L3.js","/assets/EmptyState-BZxfEjmx.js","/assets/FactorySelect-B_yLJBsV.js","/assets/FormField-BinUPzhn.js","/assets/Gamification-JEG5Xf-x.js","/assets/GroupBadge-BhBl-Ml9.js","/assets/HeatmapChart-B6zQ-Xc7.js","/assets/IdleCell-BPksfdKB.js","/assets/KPICard-DR9dbfAx.js","/assets/Kaizen-DxjYRMjt.js","/assets/KpiDeltaCard-BCKO8Uz0.js","/assets/LangTextInput-qNomYSN7.js","/assets/Layout-DkWtFy-Y.js","/assets/LeaderDayReport-z3j8HmnM.js","/assets/LeaderUnitReport-CL_VrGVo.js","/assets/Leaderboard-DXo-iN1z.js","/assets/Leaders-BAhw-gVO.js","/assets/LiveOverview-DPiyYQzt.js","/assets/Login-C1Js-6ac.js","/assets/NotFound-CHEbuMLY.js","/assets/Overview-DIjk8IFP.js","/assets/Pagination-DyXy9WNr.js","/assets/PerenaladkaFactTable-CXXF7CfO.js","/assets/PlanFulfillment-BSrMbD4W.js","/assets/Production-DZwGBEcb.js","/assets/Profile-DY_qqVJY.js","/assets/ProofCamera-B9jcUzn5.js","/assets/Quality-CFXC9mbY.js","/assets/RichTextEditor-u1lQnzME.js","/assets/SearchInput-Dd6PbQr0.js","/assets/SeasonalityHeatmap-BaX0QujY.js","/assets/SegmentedToggle-ByCckjmg.js","/assets/SetupTimes-DPE6gPIy.js","/assets/ShiftDaily-D5KHGSJ4.js","/assets/Skeleton-Dt-PwsWr.js","/assets/Staff-DnDkF3NP.js","/assets/StatusBadge-DCankGq3.js","/assets/StyledSelect-Cpi2jGSc.js","/assets/Tasks-JGAJthri.js","/assets/TimeField-DeTSzeic.js","/assets/TimeWheelPicker-BNPJy_5P.js","/assets/Toast-D-IDMnwF.js","/assets/Tooltip-MC-MxTpq.js","/assets/TrendChart-CB8GWplz.js","/assets/TripleSpeedometer-CxhXRCaa.js","/assets/Trudoyomkost-CESu3NvT.js","/assets/UsersActivity-DAhHcoJ4.js","/assets/WatchProgress-qYPHQhEZ.js","/assets/WebLogin-ke4AnQte.js","/assets/WorkerConcerns-C0Zv24GT.js","/assets/Workers-m31_Vpbj.js","/assets/Zagruzka-DuJD7AAg.js","/assets/ZagruzkaCell-DVoPNg8W.js","/assets/alarm-clock-C4SmYRGX.js","/assets/api-CBmy6e7I.js","/assets/archive-CSqQw3WW.js","/assets/archive-restore-Dcqd4BmB.js","/assets/arrow-down-_DjArfNl.js","/assets/arrow-left-BdwvtCYy.js","/assets/arrow-left-right-DhPoxWi7.js","/assets/arrow-right-8bRsGlG6.js","/assets/arrow-up-B3AUa-19.js","/assets/award-CTrKr1q1.js","/assets/ban-CErnRIkv.js","/assets/bot-B4aksQud.js","/assets/boxes-CZ_-7esq.js","/assets/brigadirFilters-CF2nRvhl.js","/assets/broadcastTree-CXcpu_PE.js","/assets/building-2-DNkxaOSL.js","/assets/calendar-06FiDcYx.js","/assets/calendar-clock-BTYEiFa6.js","/assets/calendar-days-DI87cYni.js","/assets/calendar-range-cEZgjKHo.js","/assets/camera-eBRa_vaQ.js","/assets/categories-B4mebW4t.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-_koQBCg_.js","/assets/chart-line-DZQboBSL.js","/assets/chart-pie-xDOol8Mo.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-BhNZwO80.js","/assets/check-BmXYij3V.js","/assets/check-check-DP_9UCqV.js","/assets/chevron-left-rtV0XbeZ.js","/assets/chevrons-up-down-BC_s8pij.js","/assets/circle-dot-BVXoNmCX.js","/assets/circle-minus-D6PGN655.js","/assets/circle-slash-BFffqjj1.js","/assets/circle-user-round-B1CSVWDK.js","/assets/compass-C44zoz3d.js","/assets/concernCategories-DNtAm2BB.js","/assets/copy-Cx6APMgj.js","/assets/corner-down-right-Z8r6BK3u.js","/assets/createLucideIcon-D_l17ixW.js","/assets/exportXlsx-BRRB9Un1.js","/assets/external-link-B_FQ_UuO.js","/assets/file-clock-CqkUuNAo.js","/assets/file-spreadsheet-DMllVuwI.js","/assets/file-text-D-pSYw9G.js","/assets/flag-CaHPDulD.js","/assets/flame-CGSG2NvL.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BLCEhVLJ.js","/assets/funnel-fLqE19ul.js","/assets/hash-BDVXy00H.js","/assets/history-Ba5Ttz1-.js","/assets/hourglass-DQSX3g1t.js","/assets/image-off-U6VP6Yu7.js","/assets/image-qoPkYEAz.js","/assets/index-DozoDnEV.js","/assets/index-PYkJVL39.css","/assets/keyboard-DN7faUwh.js","/assets/languages-BdyEoRM8.js","/assets/layers-agaxODfx.js","/assets/leaderReason-l76AEDPV.js","/assets/lightbulb-DY0s-Gpu.js","/assets/link-2-DkophilY.js","/assets/list-checks-C90_7jfn.js","/assets/list-ordered-jB1TiFsW.js","/assets/lock-open-Dg3ETU9s.js","/assets/log-in-C8TltfY7.js","/assets/message-square-DXUiEyHq.js","/assets/minimize-2-DKAHzBL2.js","/assets/minus-CeiRDlw6.js","/assets/paperclip-Doy7oe02.js","/assets/pencil-Bqaj3coV.js","/assets/pencil-line-QEyWUr7S.js","/assets/personName-B4KId4zS.js","/assets/pin-uHusYb5O.js","/assets/play-T52-3HJa.js","/assets/prop-types-S5Px5KoW.js","/assets/radio-KTnzioYG.js","/assets/react-apexcharts.esm-BCCPGm5n.js","/assets/refresh-cw-BYxgqMMO.js","/assets/repeat-Cz-k4oRV.js","/assets/rotate-ccw-EZu2atCQ.js","/assets/rotate-cw-Dei0B_VN.js","/assets/save-CctKZ11y.js","/assets/scale-B8rC429N.js","/assets/scroll-text-rR9Zck6s.js","/assets/search-x-blk3P5co.js","/assets/segments-FUpD0qY5.js","/assets/send-B6u0-pVb.js","/assets/settings-2-B-1OU7gv.js","/assets/shield-DzYxFnYP.js","/assets/shield-alert-BipxuAkh.js","/assets/shield-check-DbZiJCEg.js","/assets/shield-question-mark-5HqD5KqX.js","/assets/siren-C_ehVuoG.js","/assets/smartphone-BmdKA59x.js","/assets/snowflake-DK1NexFh.js","/assets/star-tVI0e3Gw.js","/assets/statusBands-BaGqrQbE.js","/assets/table-2-CVPQx8hq.js","/assets/tag-JWeV-8TH.js","/assets/trash-2-3PVt_O7H.js","/assets/trending-down-BAUbBar2.js","/assets/trending-up-BYshe0xU.js","/assets/undo-2-CKdREwF9.js","/assets/useChartTheme-Cp4dHjlR.js","/assets/useElementWidth-DLLQBpjS.js","/assets/useIsMobile-B_Ja-Cb9.js","/assets/useMutation-B5OTI9TO.js","/assets/useStatusBands-6mglv5T3.js","/assets/user-check-Cck0xT4B.js","/assets/user-cog-dNJljaX6.js","/assets/user-minus-4YRqB4Gq.js","/assets/users-DqC1HTHV.js","/assets/verifyState-B8i473OR.js","/assets/video-0J08EBuk.js","/assets/warehouse-f0Myf2hK.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
