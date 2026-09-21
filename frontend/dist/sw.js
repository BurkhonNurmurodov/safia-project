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

const BUILD = "2026-09-21T12:53:06.010Z";
const PRECACHE = ["/","/assets/AdminPanel-DeqK8L7A.js","/assets/AnalysisBoard-DgdOtEa7.js","/assets/Arc-Debxp9ql.js","/assets/AttendanceModal-UUeF0PjF.js","/assets/BrigadirProfile-B9Ttw1aR.js","/assets/BroadcastReceivers-Cea_sA-f.js","/assets/BroadcastRecord-Cf7GEnsz.js","/assets/CatLockNotice-qavtR5tb.js","/assets/CategoryLegendModal-C7H9saGX.js","/assets/CellConcerns-BjcKFIFj.js","/assets/CellDetails-Br3F6Hu-.js","/assets/CellFormModal-BPeiudRh.js","/assets/CellLink-CrG3D0DV.js","/assets/Cells-C65pDQHt.js","/assets/ColumnFilter-Dd6Qo3gT.js","/assets/ColumnsPicker-D1WLjN41.js","/assets/CommentsModal-ZvyMmJW2.js","/assets/ComparisonTable-BMU5Kulo.js","/assets/Concerns-DBAGkI0m.js","/assets/ConfirmDialog-Dw6YwzeN.js","/assets/Daily-Dzol7K3H.js","/assets/DataTable-B2E9xQoB.js","/assets/DateRangePicker-CgG_qKAY.js","/assets/DayReportView-CnMnRHTD.js","/assets/DayStepper-C8PwQBv5.js","/assets/DifferenceBreakdown-jghlDy3z.js","/assets/Downtime-BCMIEO-e.js","/assets/Education-DOFLEAGw.js","/assets/EducationLesson-DE4UTUcx.js","/assets/EmptyState-DO6gF74a.js","/assets/FactorySelect-B-Jpomq5.js","/assets/FormField-Dg0ozOkL.js","/assets/Gamification-BeHJNxjn.js","/assets/GroupBadge-VJeQu7Kh.js","/assets/HeatmapChart-8lKVu-Qz.js","/assets/IdleCell-C2nBwQmE.js","/assets/KPICard-D8QclV4g.js","/assets/Kaizen-B-YPMJVz.js","/assets/KpiDeltaCard-vxmHZ-Jk.js","/assets/LangTextInput-BeW0Cy6_.js","/assets/Layout-DSAh2vrv.js","/assets/LeaderDayReport-EfFK4fHa.js","/assets/LeaderUnitReport-DWPS9unC.js","/assets/Leaderboard-B1SmFx9f.js","/assets/Leaders-DOsJnNip.js","/assets/LiveOverview-CL4knMSD.js","/assets/Login-C1J8xWhZ.js","/assets/NotFound-CDNCUoT6.js","/assets/Overview-BP2a9x4K.js","/assets/Pagination-CJGkSTwq.js","/assets/PerenaladkaFactTable-CPK6EiBc.js","/assets/PlanFulfillment-6zlWSZMJ.js","/assets/Production-D_vnwwQM.js","/assets/Profile-CWdxzFnG.js","/assets/ProofCamera-zU6Wdbbc.js","/assets/Quality-bWApYhR8.js","/assets/RichTextEditor-DYk7CfLu.js","/assets/SearchInput-wzIqUOGe.js","/assets/SeasonalityHeatmap-CBY0KRU0.js","/assets/SegmentedToggle-C_9LQCa9.js","/assets/SetupTimes-NrD5To6e.js","/assets/ShiftDaily-BBSS7oiH.js","/assets/Skeleton-B75zHixX.js","/assets/Staff-CQbCCLBL.js","/assets/StatusBadge-CtHRkNUD.js","/assets/StyledSelect-DouAbUEy.js","/assets/Targets-C5sgW2mq.js","/assets/Tasks-Z_0OwShe.js","/assets/TimeField-BFmt6yaE.js","/assets/TimeWheelPicker-Df7gHEB1.js","/assets/Toast-CWvNv6yE.js","/assets/Tooltip-BX85VS9C.js","/assets/TrendChart-CyzZU4Or.js","/assets/TripleSpeedometer-CrqksUb5.js","/assets/Trudoyomkost-3pB5Qsia.js","/assets/UsersActivity-BDqQcxVU.js","/assets/WatchProgress-CvEiEIXN.js","/assets/WebLogin-D9nOeGuR.js","/assets/WorkerConcerns-DaEkQeZq.js","/assets/Workers-CzhWY0hr.js","/assets/Zagruzka-BxdP8L4o.js","/assets/ZagruzkaCell-DMdJazAA.js","/assets/alarm-clock-Cnqhjsz5.js","/assets/api-c75rQW1n.js","/assets/archive-CeaEcY7n.js","/assets/archive-restore-0T56-C_q.js","/assets/arrow-down-3bz7p18W.js","/assets/arrow-left-right-CbYFwZyN.js","/assets/arrow-left-vsUgoiiU.js","/assets/arrow-right-CFSPQYXX.js","/assets/arrow-up-C1k69HSI.js","/assets/arrow-up-right-DEbaY2ac.js","/assets/award-Cxgq_fa_.js","/assets/ban-D6pGNh-6.js","/assets/bot-wGqymQO1.js","/assets/boxes-DB4KJ5-c.js","/assets/brigadirFilters-CJ4sFLM4.js","/assets/broadcastTree-CpXwAke1.js","/assets/building-2-B7USQrYK.js","/assets/calendar-C758-p1Z.js","/assets/calendar-clock-CJGWARp4.js","/assets/calendar-days-Ck3U7S2_.js","/assets/calendar-range-PZ8fhv9B.js","/assets/camera-Bxy7bTwG.js","/assets/categories-B3yyONwE.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DP4HQ7gA.js","/assets/chart-line-B2BsRGne.js","/assets/chart-pie-BwdvGYf-.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-CX65ClLf.js","/assets/check-CcViQTRc.js","/assets/check-check-CuNtwj54.js","/assets/chevron-left-Df9HG-98.js","/assets/chevrons-up-down-D-pkc3r4.js","/assets/circle-dashed-CzrRjCAb.js","/assets/circle-dot-NDSv4rBu.js","/assets/circle-minus-CbQx_lop.js","/assets/circle-slash-D4_EH5J3.js","/assets/circle-user-round-Bo5GvoT2.js","/assets/coins-C9JsVLAD.js","/assets/compass-Bt1vCERv.js","/assets/concernCategories-Cfroo_m7.js","/assets/copy-DCxrBFuH.js","/assets/corner-down-right-DYEdAcih.js","/assets/createLucideIcon-Cy6abugn.js","/assets/exportXlsx-Bsr6ZZ7b.js","/assets/external-link-tpfy_c6U.js","/assets/file-clock-B1eAn4kV.js","/assets/file-spreadsheet-BYxEs6Uz.js","/assets/file-text-DjeBCjkb.js","/assets/flag-6iNUaj66.js","/assets/flame-Btp-R6ZD.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DWtCHX-c.js","/assets/funnel-CT7KqjnX.js","/assets/hash-DWMVfNqw.js","/assets/history-lwFGsa8n.js","/assets/hourglass-DJEprQ2q.js","/assets/image-DvzlMR0C.js","/assets/image-off-ZYVtp2sg.js","/assets/index-BXqTV2jf.css","/assets/index-DOlOqDCj.js","/assets/keyboard-78EoIpIP.js","/assets/languages-SJtekyit.js","/assets/layers-Ln1WMSVo.js","/assets/leaderReason-CiVBmBIE.js","/assets/lightbulb-DB2iiexZ.js","/assets/link-2-hw5cvYjU.js","/assets/list-checks-Djs7Ypmc.js","/assets/list-ordered-eQT5CJQ5.js","/assets/lock-open-CFsjduIf.js","/assets/log-in-Javj4pqG.js","/assets/message-square-DqNmfO4b.js","/assets/minimize-2-lK4jz29Y.js","/assets/minus-C7CKo-IU.js","/assets/paperclip-PSvioAbg.js","/assets/pencil-CkGwEMud.js","/assets/pencil-line-Bk4rwsTR.js","/assets/personName-B4KId4zS.js","/assets/pin-CcYv5fvG.js","/assets/play-cxUb1Bjd.js","/assets/prop-types-eIil6FIh.js","/assets/radio-DSyge6LW.js","/assets/react-apexcharts.esm-BniqRgRH.js","/assets/refresh-cw-zNseNFLG.js","/assets/repeat-DWbOui0X.js","/assets/rotate-ccw-JIUHwTZA.js","/assets/rotate-cw-eCjn6gFF.js","/assets/save-bQDXtH1-.js","/assets/scale-C7ZYNBHW.js","/assets/scroll-text-CTlZjOjL.js","/assets/search-x-BglFiXMB.js","/assets/segments-CBtde5pS.js","/assets/send-DXSsRoOn.js","/assets/settings-2-DwXm2ZRb.js","/assets/shield-DJmaxniS.js","/assets/shield-alert-33792GUr.js","/assets/shield-check-DbaX6QTz.js","/assets/shield-question-mark-DPDpzPbW.js","/assets/siren-MooRTK5O.js","/assets/smartphone-DjNeKM-l.js","/assets/snowflake-DMpf79gP.js","/assets/square-check-big-Dpff1zWo.js","/assets/square-tu3-ajrk.js","/assets/star-bK-i2q4b.js","/assets/statusBands-Bv-YDleZ.js","/assets/table-2-6bz_pr0p.js","/assets/tag-CnSWd3kv.js","/assets/trash-2-Dg27gz52.js","/assets/trending-down-DHYIzHTd.js","/assets/trending-up-Cic6k72O.js","/assets/undo-2-2x2Isxbg.js","/assets/useChartTheme-DjH99qkr.js","/assets/useElementWidth-BtczFVnQ.js","/assets/useIsMobile-DRa5SLgW.js","/assets/useMutation-DmllqamI.js","/assets/useStatusBands-C8oqbvxE.js","/assets/user-check-BQJmDC1s.js","/assets/user-cog-BMC-A75M.js","/assets/user-minus-D5H2jrb-.js","/assets/users-DE_qNIog.js","/assets/verifyState-B1dsjSWp.js","/assets/video-DSkCbE-I.js","/assets/warehouse-96e-AI8b.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
