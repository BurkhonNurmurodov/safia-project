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

const BUILD = "2026-09-26T08:25:21.701Z";
const PRECACHE = ["/","/assets/AdminPanel-DlypwOlv.js","/assets/AnalysisBoard-B95zk7q1.js","/assets/Arc-B2off9-A.js","/assets/ArcLegacy-CYrHc6u8.js","/assets/AttendanceModal-CjZ3G7yp.js","/assets/BrigadirProfile-ByGBP3Kn.js","/assets/BroadcastReceivers-CTkTAlqC.js","/assets/BroadcastRecord-Od7n8a86.js","/assets/CatLockNotice-C_XJ0qlE.js","/assets/CategoryLegendModal-CPOswR1Y.js","/assets/CellConcerns-B3k8oPmY.js","/assets/CellDetails-CZcMxJsY.js","/assets/CellFormModal-BtAnK5In.js","/assets/CellLink-BcXj9nZe.js","/assets/Cells-D6e7FjD-.js","/assets/ColumnFilter-D41UUbST.js","/assets/ColumnsPicker-C8gDqUmr.js","/assets/CommentsModal-BlMy7Tt_.js","/assets/ComparisonTable-lO8P3lg_.js","/assets/Concerns-BOM25aRe.js","/assets/ConfirmDialog-DdpZaxvS.js","/assets/Daily-CF-vsDoe.js","/assets/DataTable-D953UieI.js","/assets/DateRangePicker-cou1wbM_.js","/assets/DayReportView-iSTnz11M.js","/assets/DayStepper-ffokp2wQ.js","/assets/DifferenceBreakdown-2sEGaD0p.js","/assets/Downtime-BGdi_wux.js","/assets/Education-CqOEK_BC.js","/assets/EducationLesson-2T7etYxI.js","/assets/EmptyState-BZxG8I68.js","/assets/Exam-BhC6l7Oh.js","/assets/FactorySelect-CAQr1WUC.js","/assets/Gamification-CcNaEmsq.js","/assets/GroupBadge-B0iKDDvz.js","/assets/HeatmapChart--CkbNh5T.js","/assets/IdleCell-Co6cQx1n.js","/assets/KPICard-GALF2lTp.js","/assets/Kaizen-DmwmnO_j.js","/assets/KpiDeltaCard-DCwdBFWY.js","/assets/LangTextInput-CEWAsGcG.js","/assets/Layout-BSV680UV.js","/assets/LeaderDayReport-DIZMhcSv.js","/assets/LeaderUnitReport-1r_H6VRt.js","/assets/Leaderboard-FV26vG_U.js","/assets/Leaders-D3wK0dW1.js","/assets/LiveOverview-CXlsnkJl.js","/assets/Login-yW9exh7I.js","/assets/NotFound-CNGkYmBw.js","/assets/Overview-Dgq3zwgI.js","/assets/Pagination-CYoFK0Gz.js","/assets/PerenaladkaFactTable-B1VV_5sX.js","/assets/PlanFulfillment-B4smFdqO.js","/assets/Production-D0i-mUNN.js","/assets/Profile-CRbCwnjG.js","/assets/ProofCamera-DdwcXUR6.js","/assets/Quality-BvOfvguF.js","/assets/RequestStateChip-DKUjk8HB.js","/assets/RichTextEditor-DJor0flB.js","/assets/SearchInput-DDcj8v5M.js","/assets/SeasonalityHeatmap-IgS06NNY.js","/assets/SegmentedToggle-C2F6-UAw.js","/assets/SetupTimes-DfyflWqG.js","/assets/ShiftDaily-BiaLOMYk.js","/assets/Staff-TysMtzP_.js","/assets/StatusBadge-B9Yeh7nl.js","/assets/Targets-C-nK0q8c.js","/assets/Tasks-k8rKxOgz.js","/assets/TimeWheelPicker-D1KrkM6S.js","/assets/Tooltip-CrZ4qng3.js","/assets/TrendChart-FrHIbCbi.js","/assets/TripleSpeedometer-oRFHzFdZ.js","/assets/Trudoyomkost-BLHREVPd.js","/assets/UsersActivity-k9DmryD7.js","/assets/WatchProgress-BVVf0ZA_.js","/assets/WebLogin-kz2VM40r.js","/assets/WorkerConcerns-DT0gyB93.js","/assets/Workers-Csgsy7dM.js","/assets/Zagruzka-NazWjnQE.js","/assets/ZagruzkaCell-BUfHoll-.js","/assets/alarm-clock-BT8vaB76.js","/assets/api-DHLffL8v.js","/assets/archive-AZbkjQJK.js","/assets/archive-restore-B5yAW_iu.js","/assets/arrow-down-D21Sh8Gf.js","/assets/arrow-left-DURkb8dv.js","/assets/arrow-left-right-DKjpdIhn.js","/assets/arrow-up-CXablmqT.js","/assets/arrow-up-right-Bie06z7z.js","/assets/award-DyIXs_gU.js","/assets/ban-BdUA-85W.js","/assets/bot-HQY9ISmI.js","/assets/boxes-C3cdIcDi.js","/assets/brigadirFilters-DMd8Requ.js","/assets/broadcastTree-zVzfb02b.js","/assets/building-2-DHRPJWtG.js","/assets/calendar-Oj14xizF.js","/assets/calendar-clock-3QmpMLNy.js","/assets/calendar-days-DlaawBxh.js","/assets/calendar-range-zH4QHHmo.js","/assets/camera-BNizDe2Z.js","/assets/categories-DDDy5DFP.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DH216mjz.js","/assets/chart-line-C1VjEXYH.js","/assets/chart-pie-BHPVqzGc.js","/assets/chartRange-B57JAqVj.js","/assets/check-check-D1Q2d4wQ.js","/assets/chevron-left-BrpEtWgO.js","/assets/chevrons-up-down-CNprKM9b.js","/assets/circle-check-big-CkxJfBfb.js","/assets/circle-dashed-DP0yVhVN.js","/assets/circle-dot-pk0FQ81B.js","/assets/circle-minus-C3E-KRw9.js","/assets/circle-slash-BJCsD2LW.js","/assets/circle-user-round-DW8TT3KH.js","/assets/coins-D2-bcvp5.js","/assets/compass-4NNUNguF.js","/assets/concernCategories-BN5yxWZJ.js","/assets/copy-gcAs10pa.js","/assets/corner-down-right-C6-eKo3H.js","/assets/createLucideIcon--ICPJ_uJ.js","/assets/exportXlsx-L0EgcCHZ.js","/assets/external-link-B_FiP52A.js","/assets/file-clock-BKHGdiE6.js","/assets/file-exclamation-point-fNx0vl21.js","/assets/file-spreadsheet-EUiAKsdA.js","/assets/file-text-D0ZC40XA.js","/assets/flag-VDFvzMU9.js","/assets/flame-FriNaPNN.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BLk0G2aU.js","/assets/hash-B-Bdticw.js","/assets/history-xSOkD31_.js","/assets/hourglass-D8sMD7OC.js","/assets/image-CTjql4iK.js","/assets/image-off-CFkZDgl7.js","/assets/index-BWiyvti9.js","/assets/index-BpXEHg2I.css","/assets/key-round-DP7KFfeo.js","/assets/keyboard-D2nUDG2L.js","/assets/languages-DMe02Dod.js","/assets/layers-Cto4bLcl.js","/assets/leaderReason-BpbbB97H.js","/assets/lightbulb-BQkan6b5.js","/assets/link-2-DW9YczAv.js","/assets/list-checks-kinlvJzj.js","/assets/list-ordered-XQH2IZVQ.js","/assets/list-tree-B9VECuky.js","/assets/lock-open-DG5ag3oj.js","/assets/log-in-BquvQMN3.js","/assets/message-square-yod67x_l.js","/assets/minimize-2-DL3765S-.js","/assets/package-check-Ba08x4Wg.js","/assets/paperclip-CLZq9cnv.js","/assets/pencil-Cx5SpRPo.js","/assets/personName-B4KId4zS.js","/assets/pin-ClZkp8iv.js","/assets/play-CbNf2zd9.js","/assets/presentation-B8U3PbcA.js","/assets/prop-types-CHiqDq8E.js","/assets/radio-C6uZHB-d.js","/assets/react-apexcharts.esm-CvgYFxRt.js","/assets/repeat-DoJlapXB.js","/assets/rotate-ccw-CSUif89_.js","/assets/rotate-cw-BahPKG21.js","/assets/save-CdfMTXOQ.js","/assets/scale-B8ty7vIQ.js","/assets/scroll-text-Bkw9f6us.js","/assets/search-x-BVypkGG3.js","/assets/segments-CfyconVD.js","/assets/send-KtzRLZ_q.js","/assets/settings-2-CePgnF6P.js","/assets/shield-Bf3E1g1W.js","/assets/shield-alert-749ZgzBk.js","/assets/shield-check-BSuTYKea.js","/assets/shield-question-mark-UQvG9_t_.js","/assets/siren-Bylm2Usn.js","/assets/smartphone-BYPNEI5l.js","/assets/snowflake-C7Zvxsmp.js","/assets/square-check-big-CCV7t6sH.js","/assets/square-lCY2dOtz.js","/assets/star-Bp_d6d0R.js","/assets/statusBands-CLLr8MOj.js","/assets/store-WBgV_a2o.js","/assets/table-2-Do0KXRaV.js","/assets/tag-Cv0GFbID.js","/assets/trending-down-DufddMDT.js","/assets/trending-up-DhdWKEsi.js","/assets/triangle-alert-CXV6e4EV.js","/assets/undo-2-C6O5nqDE.js","/assets/useChartTheme-DMHuiCl8.js","/assets/useElementWidth-tXvnV0an.js","/assets/useIsMobile-CApQfqVy.js","/assets/useMutation-CJ_a2Bkp.js","/assets/useStatusBands-BJi2Wr0O.js","/assets/user-acrE2g_U.js","/assets/user-check-BvF0CMeV.js","/assets/user-cog-BvCAvNDV.js","/assets/user-minus-24eP4iUV.js","/assets/users-DaaXmwda.js","/assets/verifyState-BvBVrdmA.js","/assets/video-D5gZGWnT.js","/assets/warehouse-BOXSOh6p.js","/assets/zap-BbidwwSM.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
