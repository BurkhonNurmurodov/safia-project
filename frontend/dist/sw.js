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

const BUILD = "2026-09-26T08:42:34.564Z";
const PRECACHE = ["/","/assets/AdminPanel-CsAs73aW.js","/assets/AnalysisBoard-HPSZHGiU.js","/assets/Arc-BpVP7B2O.js","/assets/ArcLegacy-CJeeNOHf.js","/assets/AttendanceModal-Ckfi24JA.js","/assets/BrigadirProfile-Bc_DW4XK.js","/assets/BroadcastReceivers-D5tEzoYr.js","/assets/BroadcastRecord-CoxmFCFH.js","/assets/CatLockNotice-DhpDhlM_.js","/assets/CategoryLegendModal-B3Z6Cquw.js","/assets/CellConcerns-XI4zzupM.js","/assets/CellDetails-lAE-Yn8V.js","/assets/CellFormModal-BmEbq_7E.js","/assets/CellLink-BgAIGLyx.js","/assets/Cells-I668ZPPm.js","/assets/ColumnFilter-BpLZD3_O.js","/assets/ColumnsPicker-B89xa7d7.js","/assets/CommentsModal-B3LkdZi9.js","/assets/ComparisonTable-DH67Cyni.js","/assets/Concerns-CTdBf-zP.js","/assets/ConfirmDialog-D9NiT3iQ.js","/assets/Daily-BsQdoKXK.js","/assets/DataTable-BMFVnu-8.js","/assets/DateRangePicker-D7frpf5U.js","/assets/DayReportView-Dlh3U3hI.js","/assets/DayStepper-DDxLhKVv.js","/assets/DifferenceBreakdown-5GkhEg_7.js","/assets/Downtime-BoKQ5ZmT.js","/assets/Education-C1mTMTuV.js","/assets/EducationLesson-CAhEQgUP.js","/assets/EmptyState-DWyNnD6Y.js","/assets/Exam-ByBcYemo.js","/assets/FactorySelect-LXiJhKq6.js","/assets/Gamification-DSV284hR.js","/assets/GroupBadge-CXTxFdOf.js","/assets/HeatmapChart-Q7XgLbfq.js","/assets/IdleCell-CJxP6Bad.js","/assets/KPICard-pbzRU2aF.js","/assets/Kaizen-BNsIPkro.js","/assets/KpiDeltaCard-SwOeLj5j.js","/assets/LangTextInput-BPzj-fvs.js","/assets/Layout-BaqXDm_h.js","/assets/LeaderAppeal-BKFBLY9r.js","/assets/LeaderDayReport-4UrqXKMf.js","/assets/LeaderUnitReport-aRUw6oCo.js","/assets/Leaderboard-BOPf0JcF.js","/assets/Leaders-BsXG9rdp.js","/assets/Lightbox-DbvD1zcN.js","/assets/LiveOverview-mV75adG0.js","/assets/Login-P-xdufGf.js","/assets/NotFound-DMe4En2g.js","/assets/Overview-D416j-dI.js","/assets/Pagination-DuU1anJJ.js","/assets/PerenaladkaFactTable-DDhLNYNU.js","/assets/PlanFulfillment-CqqW0gGg.js","/assets/Production-DQDxEKNq.js","/assets/Profile-4_UybL6s.js","/assets/ProofCamera-b63MY2-t.js","/assets/ProofPhoto-C1sLQJ0e.js","/assets/Quality-CD7f3FKw.js","/assets/RequestStateChip-ASjBMTCq.js","/assets/RichTextEditor-s-6UAbFa.js","/assets/SearchInput-DQKYdoyf.js","/assets/SeasonalityHeatmap-DdOh40RZ.js","/assets/SegmentedToggle-CMenjlxo.js","/assets/SetupTimes-5PTb_klU.js","/assets/ShiftDaily-CmN3fV1U.js","/assets/Staff-CEyclktG.js","/assets/StatusBadge-BiPLRa4G.js","/assets/Targets-CZZpxCFc.js","/assets/Tasks-DfV0sOkP.js","/assets/TimeWheelPicker-B6UNbEJM.js","/assets/Tooltip-3Jlo14g7.js","/assets/TrendChart-jz5s4W3M.js","/assets/TripleSpeedometer-D7XCTjaT.js","/assets/Trudoyomkost-aRkKJmVF.js","/assets/UsersActivity-DeWQZD6n.js","/assets/WatchProgress-BlSsbZ9U.js","/assets/WebLogin-CdUZlL9w.js","/assets/WorkerConcerns-WeogJ8GP.js","/assets/Workers-DsaOuWl0.js","/assets/Zagruzka-D1rxnUaf.js","/assets/ZagruzkaCell-9A08Grv5.js","/assets/alarm-clock-DNCOsink.js","/assets/api-CaImGa69.js","/assets/archive-BYc0No1k.js","/assets/archive-restore-CbeKLiO2.js","/assets/arrow-down-DvL6l5Ws.js","/assets/arrow-left-BXEMwIPp.js","/assets/arrow-left-right-DoFsdSAw.js","/assets/arrow-up-BoUoC0Mp.js","/assets/arrow-up-right-Bs0vVlL-.js","/assets/award-BgWrYzO5.js","/assets/ban-CZVc9cXC.js","/assets/bot-NhI7RfY-.js","/assets/boxes-f5GJHzF4.js","/assets/brigadirFilters-B3Vow96-.js","/assets/broadcastTree-C8GjXu6k.js","/assets/building-2-BAthqJjC.js","/assets/calendar-Bgw12A1F.js","/assets/calendar-clock-Bqr8ZBIR.js","/assets/calendar-days-aozNNyP3.js","/assets/calendar-range-DDfwE7cs.js","/assets/camera-DpikTVmj.js","/assets/categories-Cv266qjq.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B8-9QUF1.js","/assets/chart-line-C6QxkLa1.js","/assets/chart-pie-DCWpN7aa.js","/assets/chartRange-CKwqujwr.js","/assets/check-check-DfNJ44Yy.js","/assets/chevron-left-D1w0FHT1.js","/assets/chevrons-up-down-Dg42C2PF.js","/assets/circle-check-big-C-AQxfYy.js","/assets/circle-dashed-B0UllTbB.js","/assets/circle-dot-DyL0jOrA.js","/assets/circle-minus-BjwJaHOL.js","/assets/circle-slash-DZxvtl5L.js","/assets/circle-user-round-DoahXKUt.js","/assets/cloud-upload-B4Tynp2w.js","/assets/coins-x7jSQqtL.js","/assets/compass-16QjAHfr.js","/assets/concernCategories-CNhxE3Ur.js","/assets/copy-G5Cml6Wc.js","/assets/corner-down-right-CEYa6cNP.js","/assets/createLucideIcon-CiqfhwUm.js","/assets/es-8xXkSifX.js","/assets/exportXlsx-F6ZD1od3.js","/assets/external-link-DXDyitRw.js","/assets/file-clock-FmZaAEnB.js","/assets/file-exclamation-point-Bxwx2MxI.js","/assets/file-spreadsheet-CnFK0EOk.js","/assets/file-text-BRjUV7uR.js","/assets/flag-BYfSLbcq.js","/assets/flame-DQpTQayq.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DdLZLAHB.js","/assets/hash-DflC8Hhz.js","/assets/history-CFdekxHW.js","/assets/hourglass-hi0HmuRE.js","/assets/image-C2XwTK59.js","/assets/image-off-BY8ARujs.js","/assets/index-DwPevLKe.css","/assets/index-S9nnDcpI.js","/assets/key-round-DmQD6-5u.js","/assets/keyboard-Csf78B1E.js","/assets/languages-dUZ8LEeh.js","/assets/layers-BARRUB4-.js","/assets/leaderReason-DZqFldFW.js","/assets/lightbulb-AghqsJNU.js","/assets/link-2-BVYk5ggn.js","/assets/list-checks-CDtaMpkf.js","/assets/list-ordered-BwbiFhzr.js","/assets/list-tree-VKc7VPtH.js","/assets/lock-open-BmCRMnqe.js","/assets/log-in-1Bge7SxU.js","/assets/message-square-CIdpLkJB.js","/assets/minimize-2-DL9nF23t.js","/assets/package-check-BKfKba1E.js","/assets/paperclip-3_SVyElp.js","/assets/pencil-C-5GXda2.js","/assets/personName-B4KId4zS.js","/assets/pin-Bf0j3O3g.js","/assets/play-B3gAaGqz.js","/assets/presentation-CkvVEvcF.js","/assets/prop-types-DXKTlWWD.js","/assets/radio-ChLcAP2t.js","/assets/react-apexcharts.esm-DMmC9dKy.js","/assets/repeat-DTNvtk7T.js","/assets/rotate-ccw-CtmkcInG.js","/assets/rotate-cw-3EK5O3Ig.js","/assets/save-DPDGPz7v.js","/assets/scale-DBWIbKRf.js","/assets/scroll-text-DYnqmCls.js","/assets/search-x-uAcMOb8_.js","/assets/segments-Tx_AaDPh.js","/assets/send-bUEMRrhC.js","/assets/settings-2-DDVs6VmH.js","/assets/shield-Cqx79GsX.js","/assets/shield-alert-C87C1OGS.js","/assets/shield-check-D5oy86Od.js","/assets/shield-question-mark-vu5QWCij.js","/assets/siren-DfPfMTYR.js","/assets/smartphone-ES9c3qQI.js","/assets/snowflake-DMV-0Nzf.js","/assets/square-Cavd8JsX.js","/assets/square-check-big-D6l3pZwi.js","/assets/star-LU4t-HTq.js","/assets/statusBands-CfH1aRuP.js","/assets/store-CaTlA6J6.js","/assets/table-2-CZqQjlRn.js","/assets/tag-BxnertdF.js","/assets/trending-down-CcTfX8T6.js","/assets/trending-up-DvPUt4GG.js","/assets/triangle-alert-CSHvwFyJ.js","/assets/undo-2-Dv8gokMm.js","/assets/useChartTheme-DJmaJmHc.js","/assets/useElementWidth-ByTe3-U4.js","/assets/useIsMobile-BfFu_94P.js","/assets/useMutation-BhkJZqbs.js","/assets/useStatusBands-Ccj5lLAT.js","/assets/user-DIfF8PX7.js","/assets/user-check-BLYbf06Y.js","/assets/user-cog-D5KawMkU.js","/assets/user-minus-0vgPyz9m.js","/assets/users-DsmYd899.js","/assets/verifyState-BdJOdHHw.js","/assets/video-COuZBvm6.js","/assets/warehouse-CwUqP6Ie.js","/assets/zap-DqI6kqAC.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
