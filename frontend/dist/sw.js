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

const BUILD = "2026-09-21T05:50:36.424Z";
const PRECACHE = ["/","/assets/AdminPanel-DBEeeSBz.js","/assets/AnalysisBoard-10Gs6kJo.js","/assets/Arc-1JIJU9IW.js","/assets/AttendanceModal-DeRKvEK1.js","/assets/BrigadirProfile-B8_oETz3.js","/assets/BroadcastReceivers-0K8O5FCp.js","/assets/BroadcastRecord-Dys0UzOs.js","/assets/CatLockNotice-eNXI4RIo.js","/assets/CategoryLegendModal-D8d8mpRN.js","/assets/CellConcerns-B7eChjfd.js","/assets/CellDetails-C2Nq7oLF.js","/assets/CellFormModal-DpV_GDOT.js","/assets/CellLink-C64fjq-k.js","/assets/Cells-DRqKQBUG.js","/assets/ColumnFilter-CNxy9OQl.js","/assets/ColumnsPicker-DJTl-rak.js","/assets/CommentsModal-CqQR5Il9.js","/assets/ComparisonTable--0yY4BjO.js","/assets/Concerns-BMxdtcve.js","/assets/ConfirmDialog-DUSXomkR.js","/assets/Daily-DXmHII1Y.js","/assets/DataTable-CS_ebZ3I.js","/assets/DateRangePicker-B-mHTvdE.js","/assets/DayReportView-DvgKkyWL.js","/assets/DayStepper-ALabwhvx.js","/assets/DifferenceBreakdown-C1Uvvn5o.js","/assets/Downtime-CheVYIqI.js","/assets/Education-DrVLmEla.js","/assets/EducationLesson-CTjbqgG2.js","/assets/EmptyState-DbGF28yj.js","/assets/FactorySelect-B5VkA6_l.js","/assets/FormField-D21c7REK.js","/assets/Gamification-DVqa_yY7.js","/assets/GroupBadge-CIdg4Ovr.js","/assets/HeatmapChart-yFvZ8cdL.js","/assets/IdleCell-Cg84u0s4.js","/assets/KPICard-DZiLc3q-.js","/assets/Kaizen-D7YNSK76.js","/assets/KpiDeltaCard-Dva0AWKN.js","/assets/LangTextInput-D3jdOQBL.js","/assets/Layout-CDSO3tHb.js","/assets/LeaderDayReport-CW1maz6m.js","/assets/LeaderUnitReport-C2Mvzgok.js","/assets/Leaderboard-TKCLsE8x.js","/assets/Leaders-Coqj_GM3.js","/assets/LiveOverview-CEMbOpFM.js","/assets/Login-DHgN8dY9.js","/assets/NotFound-CjUXqa5M.js","/assets/Overview-iA4HBgbs.js","/assets/Pagination-5ajsSMZB.js","/assets/PerenaladkaFactTable-B8N6C-DI.js","/assets/PlanFulfillment-B-xfHt3-.js","/assets/Production-CRzGtaZi.js","/assets/Profile-C2ji4aua.js","/assets/ProofCamera-Dl06Q6w4.js","/assets/Quality-jM_Fa7zg.js","/assets/RichTextEditor-k7tHhBbN.js","/assets/SearchInput-Dt0Moz43.js","/assets/SeasonalityHeatmap-2cdV8Xxy.js","/assets/SegmentedToggle-CfKufyq1.js","/assets/SetupTimes-0GHZtkbf.js","/assets/ShiftDaily-Dj7TiVgh.js","/assets/Skeleton-BfFT-9KT.js","/assets/Staff-_f-9WX6M.js","/assets/StatusBadge-Drf_M36a.js","/assets/StyledSelect-DlxR94Bh.js","/assets/Targets-DCRqbfpz.js","/assets/Tasks-fGMOFLcQ.js","/assets/TimeField-DEuDSocp.js","/assets/TimeWheelPicker-BfE4cRGm.js","/assets/Toast-DJPrT5Go.js","/assets/Tooltip-BmBg_66l.js","/assets/TrendChart-Bo0zVPuQ.js","/assets/TripleSpeedometer-BDsdWllX.js","/assets/Trudoyomkost-ZcSgUr-_.js","/assets/UsersActivity-ChH18mYY.js","/assets/WatchProgress-DOoO061S.js","/assets/WebLogin-HLMCTDI0.js","/assets/WorkerConcerns-CSH1qLBF.js","/assets/Workers-DsVpentR.js","/assets/Zagruzka-CvD8_Tpw.js","/assets/ZagruzkaCell-B4L5E0op.js","/assets/alarm-clock-ChxLJngR.js","/assets/api-Gvpirz1p.js","/assets/archive-DuXLuqHk.js","/assets/archive-restore-Bu2RmnL-.js","/assets/arrow-down-B9ngdbj7.js","/assets/arrow-left-DF5NorAi.js","/assets/arrow-left-right-DjMYD8Li.js","/assets/arrow-right-PyUTDlqY.js","/assets/arrow-up-Lj0B3VCo.js","/assets/arrow-up-right-BFSnNbEn.js","/assets/award-Cwwld-jv.js","/assets/ban-BPWetH5_.js","/assets/bot-CL2YGr49.js","/assets/boxes-DGfETADE.js","/assets/brigadirFilters-BZ6FOhz9.js","/assets/broadcastTree-CwGNvpO2.js","/assets/building-2-pa5UihB0.js","/assets/calendar-B7C1YCul.js","/assets/calendar-clock-DxNVNSmi.js","/assets/calendar-days-DSE78b6U.js","/assets/calendar-range-uElwwZiM.js","/assets/camera-Dw7cArUi.js","/assets/categories-DYeLc1Pr.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CFXlj8xS.js","/assets/chart-line-DM6wytfj.js","/assets/chart-pie-C6dSrllS.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-DV6YxGwG.js","/assets/check-DQUUHf1Q.js","/assets/check-check-C-Jvt51p.js","/assets/chevron-left-B9-BU8RQ.js","/assets/chevrons-up-down-Dl2ny_mB.js","/assets/circle-dashed-CuU_yW_Z.js","/assets/circle-dot-DmsBCD-t.js","/assets/circle-minus-CEqpieYJ.js","/assets/circle-slash-5tUeG7tR.js","/assets/circle-user-round-COakbWQx.js","/assets/coins-LhFbaBPl.js","/assets/compass-bh1kwF9m.js","/assets/concernCategories-D-CG0w_K.js","/assets/copy-DtblQrSb.js","/assets/corner-down-right-BL8pUhLn.js","/assets/createLucideIcon-BAscd0qv.js","/assets/exportXlsx-BQJOUtRO.js","/assets/external-link-DxZhNtaG.js","/assets/file-clock-CvALFB8l.js","/assets/file-spreadsheet-QjazImM-.js","/assets/file-text-KR3jwbWd.js","/assets/flag-CYCfaL1h.js","/assets/flame-BGr0K00q.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-C-DYWT-V.js","/assets/funnel-K2OD0QkP.js","/assets/hash-ByQ6S-Fu.js","/assets/history-D2PwOYj0.js","/assets/hourglass-BQXlApzQ.js","/assets/image-DjMZPSgZ.js","/assets/image-off-VU6PLrhT.js","/assets/index-BIN5eRr3.js","/assets/index-BXqTV2jf.css","/assets/keyboard-BnaKIJ0i.js","/assets/languages-DrDwOwc5.js","/assets/layers-D4xLiMus.js","/assets/leaderReason-DE5fMQqt.js","/assets/lightbulb-BJKOLkUU.js","/assets/link-2-Dzsg1eh5.js","/assets/list-checks-CToqq6ud.js","/assets/list-ordered-CIDtQhFb.js","/assets/lock-open-B182frbs.js","/assets/log-in-zsr0E85x.js","/assets/message-square-hBQb20zu.js","/assets/minimize-2-C8iYq7yv.js","/assets/minus-DrBIwVAc.js","/assets/paperclip-DjIEB0Uy.js","/assets/pencil-Cp_V2LXu.js","/assets/pencil-line-BJVFFquE.js","/assets/personName-B4KId4zS.js","/assets/pin-DgE-YI54.js","/assets/play-BVxdNuKP.js","/assets/prop-types-7LM4mCv3.js","/assets/radio-Do1RZIeG.js","/assets/react-apexcharts.esm-X2fXofXW.js","/assets/refresh-cw-A_1GmtU4.js","/assets/repeat-Vjj2cQ27.js","/assets/rotate-ccw-BZec2lZb.js","/assets/rotate-cw-B5ZhzF0q.js","/assets/save-Cf5N07lN.js","/assets/scale-CFkm8O0Z.js","/assets/scroll-text-CKPZqigN.js","/assets/search-x-B42EyhbI.js","/assets/segments-zOws4Xgd.js","/assets/send-B4s6Iz86.js","/assets/settings-2-nx3au7ej.js","/assets/shield-Dkhz_Gsf.js","/assets/shield-alert-BUuLIJaQ.js","/assets/shield-check-BBSi488I.js","/assets/shield-question-mark-C1qpXOH6.js","/assets/siren-BqOxi7Lv.js","/assets/smartphone-D5yPLHsd.js","/assets/snowflake-Bx4ej9Il.js","/assets/square-CrMEztem.js","/assets/square-check-big-1oc-pPJ6.js","/assets/star-BA7L9E5K.js","/assets/statusBands-_Cvl0MgW.js","/assets/table-2-CDzsjUh_.js","/assets/tag-BxIz4WIL.js","/assets/trash-2-vf0cSCkr.js","/assets/trending-down-B7iZQiTN.js","/assets/trending-up-DtGnM10X.js","/assets/undo-2-B-U51MDe.js","/assets/useChartTheme-BqYhqxif.js","/assets/useElementWidth-Dvrqy61D.js","/assets/useIsMobile-BRGavpBC.js","/assets/useMutation-CYNVRZrh.js","/assets/useStatusBands-BEXfq_Oj.js","/assets/user-check-BCK9SXkJ.js","/assets/user-cog-CXLNUG1G.js","/assets/user-minus-NuvQcb_R.js","/assets/users-B8Wmq1AK.js","/assets/verifyState-B12y2RrW.js","/assets/video-DJA0kc7i.js","/assets/warehouse-GfLajvya.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
