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

const BUILD = "2026-09-21T12:59:39.167Z";
const PRECACHE = ["/","/assets/AdminPanel-CyrTOWll.js","/assets/AnalysisBoard-DvvLTYbs.js","/assets/Arc-B5poK6Yu.js","/assets/AttendanceModal-BKLVDVyc.js","/assets/BrigadirProfile-krKOetQf.js","/assets/BroadcastReceivers-BGfJTMiL.js","/assets/BroadcastRecord-DtP7eW-h.js","/assets/CatLockNotice-Cai43c6s.js","/assets/CategoryLegendModal-Ym08bhZm.js","/assets/CellConcerns-GoKUpLD7.js","/assets/CellDetails-f7Ur82nQ.js","/assets/CellFormModal-DK_7CNaM.js","/assets/CellLink-Do17MGEe.js","/assets/Cells-DVYriiiE.js","/assets/ColumnFilter-BHmzro3w.js","/assets/ColumnsPicker-D_vkHyYl.js","/assets/CommentsModal-CZgbZYm6.js","/assets/ComparisonTable-DbsJtNKo.js","/assets/Concerns-Y1BFqz8m.js","/assets/ConfirmDialog-BYWpctVM.js","/assets/Daily-CxAFkqhS.js","/assets/DataTable-DXF1VstZ.js","/assets/DateRangePicker-UDoeYenS.js","/assets/DayReportView-dtXt9zJe.js","/assets/DayStepper-Bx0uMe-2.js","/assets/DifferenceBreakdown-BAn8hUm6.js","/assets/Downtime-DtQ2DQKU.js","/assets/Education-qftXB9RA.js","/assets/EducationLesson-DdTj840l.js","/assets/EmptyState-CfmYJBrb.js","/assets/FactorySelect-LAhpPs5a.js","/assets/FormField-TANEERq9.js","/assets/Gamification-D6AjV26F.js","/assets/GroupBadge-CnFx64l9.js","/assets/HeatmapChart-CDHN6Jr-.js","/assets/IdleCell-IIJsvURW.js","/assets/KPICard-B5WSU99N.js","/assets/Kaizen-B1kTLuud.js","/assets/KpiDeltaCard-D0DQA-V2.js","/assets/LangTextInput-YbWDpNeB.js","/assets/Layout-B8381dEx.js","/assets/LeaderDayReport-CfMVIG0k.js","/assets/LeaderUnitReport-ziOuy8Mn.js","/assets/Leaderboard-Br4NRg9I.js","/assets/Leaders-BP7_fxDz.js","/assets/LiveOverview-B-34wxJj.js","/assets/Login-B4ESW7Zh.js","/assets/NotFound-D9ZytU2F.js","/assets/Overview-BYMPXgij.js","/assets/Pagination-OsAoi1ml.js","/assets/PerenaladkaFactTable-DbMRPjhf.js","/assets/PlanFulfillment-CN-Qn5mJ.js","/assets/Production-TemrEO1e.js","/assets/Profile-4skMbDTe.js","/assets/ProofCamera-wFYHRCPA.js","/assets/Quality-Bq50fky-.js","/assets/RichTextEditor-Bb1l-Up5.js","/assets/SearchInput-YUNFAelC.js","/assets/SeasonalityHeatmap-Cnn0lPIM.js","/assets/SegmentedToggle-Bptuv-ix.js","/assets/SetupTimes-CUpDq-ip.js","/assets/ShiftDaily-uPs2Y2Z5.js","/assets/Skeleton-C6tQqC5p.js","/assets/Staff-DmXchND5.js","/assets/StatusBadge-Wi2SniuA.js","/assets/StyledSelect-Bhbzfc1Y.js","/assets/Targets-sg-3FW9e.js","/assets/Tasks-G1nidBwA.js","/assets/TimeField-DpCNVzrP.js","/assets/TimeWheelPicker-4amSlqhF.js","/assets/Toast-BJfggimr.js","/assets/Tooltip-DxFibwQL.js","/assets/TrendChart-SSutbgwx.js","/assets/TripleSpeedometer-BK3zG2vc.js","/assets/Trudoyomkost-CtNn87j_.js","/assets/UsersActivity-Dt5QtIqo.js","/assets/WatchProgress-CxXrBB59.js","/assets/WebLogin-Bm8SucO4.js","/assets/WorkerConcerns-Dk5kuw9i.js","/assets/Workers-DpGgPWHr.js","/assets/Zagruzka-C_60Khyi.js","/assets/ZagruzkaCell-CT8mZvTX.js","/assets/alarm-clock-D9gUMETK.js","/assets/api-DrLs4zdQ.js","/assets/archive-CET_2Rmm.js","/assets/archive-restore-B0C98at8.js","/assets/arrow-down-DDRUe85-.js","/assets/arrow-left-D7Yyvpro.js","/assets/arrow-left-right-CTv6M7bY.js","/assets/arrow-right-BtVQads2.js","/assets/arrow-up-CwQGbTbs.js","/assets/arrow-up-right-C5iQWdyb.js","/assets/award-BCaN1SHB.js","/assets/ban-DooLn6qM.js","/assets/bot-DRTJSzZ-.js","/assets/boxes-DsYXsoIt.js","/assets/brigadirFilters-C2N4xggG.js","/assets/broadcastTree-LDl3K_q-.js","/assets/building-2-G1lw5rEf.js","/assets/calendar-DQDRALOK.js","/assets/calendar-clock-DOKOHEpX.js","/assets/calendar-days-fO_hzpKg.js","/assets/calendar-range-C80mdyAg.js","/assets/camera-CunYAbMo.js","/assets/categories-ByUfNihM.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-mn--Vows.js","/assets/chart-line-GM9nKO2V.js","/assets/chart-pie-CnxYcNYm.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-DYAsroJZ.js","/assets/check-COgzjPhP.js","/assets/check-check-Jl4LhyR5.js","/assets/chevron-left-CJyrLks4.js","/assets/chevrons-up-down-BaJOnb5p.js","/assets/circle-dashed-DK730Se7.js","/assets/circle-dot-B9QoDFmm.js","/assets/circle-minus-Bt6ZEr-J.js","/assets/circle-slash-7QqvFLvw.js","/assets/circle-user-round-BZ6ZuoB-.js","/assets/coins-t9TxEE8T.js","/assets/compass-DurT6z2E.js","/assets/concernCategories-rXYIOcGL.js","/assets/copy-D4igiQEM.js","/assets/corner-down-right-fDeb_7h0.js","/assets/createLucideIcon-AHSwvQx2.js","/assets/exportXlsx-B1Z28wor.js","/assets/external-link-BW2GjeNh.js","/assets/file-clock-CuwoEKLu.js","/assets/file-spreadsheet-oZ_auY1a.js","/assets/file-text-Cz8Ddiwy.js","/assets/flag-DVoSFc4O.js","/assets/flame-DyU6k97D.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CLUizFbu.js","/assets/funnel-APH0TR83.js","/assets/hash-CFl3NcdJ.js","/assets/history-DFr52R2Y.js","/assets/hourglass-DE8-8dP1.js","/assets/image-DOXeUusg.js","/assets/image-off-C8xkDUz8.js","/assets/index-BXqTV2jf.css","/assets/index-CDOBcDgM.js","/assets/keyboard-wkpx8m15.js","/assets/languages-DOJQ3kKI.js","/assets/layers-u-7GZsle.js","/assets/leaderReason-0NYs_aVa.js","/assets/lightbulb-MEH3uKuE.js","/assets/link-2-BLFol0sq.js","/assets/list-checks-De6fFDf1.js","/assets/list-ordered-r8oxhsfM.js","/assets/lock-open-D_bGoji7.js","/assets/log-in-DCiq-YTN.js","/assets/message-square-BNhrgbXu.js","/assets/minimize-2-D1sUtLxC.js","/assets/minus-CWB37Xgo.js","/assets/paperclip-C-uMXCxs.js","/assets/pencil-DeSF3y_J.js","/assets/pencil-line-Bv1g4NSj.js","/assets/personName-B4KId4zS.js","/assets/pin-DdCwQO6f.js","/assets/play-HKbhpFSF.js","/assets/prop-types-CTA9Fk9C.js","/assets/radio-C1w7b2K9.js","/assets/react-apexcharts.esm-CJsi8uXf.js","/assets/refresh-cw-C1d_S5wQ.js","/assets/repeat-BH9PU8YQ.js","/assets/rotate-ccw-otcF1ySk.js","/assets/rotate-cw-rUIXQEm5.js","/assets/save-CljGwhxB.js","/assets/scale-s-4SLgBz.js","/assets/scroll-text-Dd6CilsN.js","/assets/search-x-kZbogwYb.js","/assets/segments-CkRoaim4.js","/assets/send-BKTwu-A0.js","/assets/settings-2-BR5AJDTg.js","/assets/shield-BdAOSElB.js","/assets/shield-alert-BHr_p-Md.js","/assets/shield-check-9G7a7pM0.js","/assets/shield-question-mark-CHfFNZcB.js","/assets/siren-DoVwbttb.js","/assets/smartphone-QoJMn-bP.js","/assets/snowflake-DswgGTTa.js","/assets/square-DPRAXzBx.js","/assets/square-check-big-DsA7_M6d.js","/assets/star-DtaxbJew.js","/assets/statusBands-DXhq7ANn.js","/assets/table-2-BZjDIiMF.js","/assets/tag-Db9Amfnl.js","/assets/trash-2-DI4vYn6c.js","/assets/trending-down-Co94DL4Y.js","/assets/trending-up-BhOzbMtZ.js","/assets/undo-2-BO8d6ZT9.js","/assets/useChartTheme-hKDjxNdv.js","/assets/useElementWidth-DJaKqHjH.js","/assets/useIsMobile-Dj8l_MC8.js","/assets/useMutation-DZpKRXHb.js","/assets/useStatusBands-DEs3I-_k.js","/assets/user-check-BHd32sVP.js","/assets/user-cog-BhFNhODb.js","/assets/user-minus-BmDQSjVK.js","/assets/users-D06OFQom.js","/assets/verifyState-BidOXzoe.js","/assets/video-D8pvOY3L.js","/assets/warehouse-BuScj1Ec.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
