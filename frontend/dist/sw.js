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

const BUILD = "2026-09-23T05:56:05.434Z";
const PRECACHE = ["/","/assets/AdminPanel-DXLKd5Ly.js","/assets/AnalysisBoard-DL3to57r.js","/assets/Arc-BLZBpbkO.js","/assets/AttendanceModal-xRBidM6z.js","/assets/BrigadirProfile-jIFYjk7_.js","/assets/BroadcastReceivers-CsvJNUTL.js","/assets/BroadcastRecord-Y6M5L-us.js","/assets/CatLockNotice-gSs7iKC2.js","/assets/CategoryLegendModal-C989OMvK.js","/assets/CellConcerns-aTcqsJFS.js","/assets/CellDetails-Nvv2K58j.js","/assets/CellFormModal-2Lgiw6Ff.js","/assets/CellLink-DUtkvGvQ.js","/assets/Cells-CVj6kgKd.js","/assets/ColumnFilter-C7Dtav6n.js","/assets/ColumnsPicker-Z71mpAms.js","/assets/CommentsModal-YpvQTyf9.js","/assets/ComparisonTable-DDD0oHiO.js","/assets/Concerns-uL82MNgB.js","/assets/ConfirmDialog-BInc_UgG.js","/assets/Daily-CzBx61ea.js","/assets/DataTable-BUtGQ0XG.js","/assets/DateRangePicker-B8rG1Ut0.js","/assets/DayReportView-9FApt7cD.js","/assets/DayStepper-VcBnpi0V.js","/assets/DifferenceBreakdown-CV8UOCaz.js","/assets/Downtime-C8p2t1yb.js","/assets/Education-Cyf2FS8J.js","/assets/EducationLesson-DIa10f72.js","/assets/EmptyState-awrlzZxG.js","/assets/FactorySelect-B-eJCIZp.js","/assets/FormField--jWykXKB.js","/assets/Gamification-DFKps-V_.js","/assets/GroupBadge-CrlECA9T.js","/assets/HeatmapChart-CUkyvf3p.js","/assets/IdleCell-DVppjHvp.js","/assets/KPICard-Cp12SPoJ.js","/assets/Kaizen-D2CSMKfl.js","/assets/KpiDeltaCard-QvTwoMPc.js","/assets/LangTextInput-DAe3hpWf.js","/assets/Layout-BsLqihwq.js","/assets/LeaderDayReport-CJNQjJRI.js","/assets/LeaderUnitReport-B8rRBC8J.js","/assets/Leaderboard-Dy5AUFzO.js","/assets/Leaders-DcK_4Xj5.js","/assets/LiveOverview-X5b-GMls.js","/assets/Login-bS_MKEQg.js","/assets/NotFound-QKLB5sIz.js","/assets/Overview-C1Ga5KHh.js","/assets/Pagination-DF4fLQAL.js","/assets/PerenaladkaFactTable-C4dpjaVp.js","/assets/PlanFulfillment-CouYkIKX.js","/assets/Production-CiozbRKe.js","/assets/Profile-vgxnioJt.js","/assets/ProofCamera-CGJUN7k8.js","/assets/Quality-DRQrMQ6Z.js","/assets/RichTextEditor-Owhnvcvs.js","/assets/SearchInput-CBUY4SKL.js","/assets/SeasonalityHeatmap-DxigjWpk.js","/assets/SegmentedToggle-DfMGept3.js","/assets/SetupTimes-DIUxtMjx.js","/assets/ShiftDaily-ePkgHjQ_.js","/assets/Skeleton-DtyJZVvB.js","/assets/Staff-BIN5khf1.js","/assets/StatusBadge-C7BHmWNz.js","/assets/StyledSelect-C7KukCSL.js","/assets/Targets-cCzJIyX4.js","/assets/Tasks-B_uuZwKx.js","/assets/TimeField-BJef7nhn.js","/assets/TimeWheelPicker-CufdUhUB.js","/assets/Toast-DUgQ6nUU.js","/assets/Tooltip-CBV3kAyA.js","/assets/TrendChart-BGeidE3q.js","/assets/TripleSpeedometer-CypnhE9h.js","/assets/Trudoyomkost-DhIEgjWG.js","/assets/UsersActivity-cbEcENRe.js","/assets/WatchProgress-CV_EqGHr.js","/assets/WebLogin-CXIKz0Vi.js","/assets/WorkerConcerns-BEgaJ1pK.js","/assets/Workers-DEFB0W6Y.js","/assets/Zagruzka-DlY2Fwb1.js","/assets/ZagruzkaCell-C_TrMWVd.js","/assets/alarm-clock--FNREzO4.js","/assets/api-BZ4GAzGo.js","/assets/archive-4YKVTLYB.js","/assets/archive-restore-kNORA3d0.js","/assets/arrow-down-udwuUvWU.js","/assets/arrow-left-BvXcxYPr.js","/assets/arrow-left-right-CeyS2cVt.js","/assets/arrow-right-C3UM6XIh.js","/assets/arrow-up-C30-MJtD.js","/assets/arrow-up-right-DUSbGGlI.js","/assets/award-Uk6jSGXO.js","/assets/ban-CZ7QJ0uM.js","/assets/bot-DFTEymdp.js","/assets/boxes-CYvkqvYy.js","/assets/brigadirFilters-BOIpuL2I.js","/assets/broadcastTree-D6o82RAf.js","/assets/building-2-BkdqiP2Q.js","/assets/calendar-DMe7zj4b.js","/assets/calendar-clock-C-h2F-zT.js","/assets/calendar-days-MZAZwfQv.js","/assets/calendar-range-CgT3BvHW.js","/assets/camera-CbtSvNcH.js","/assets/categories-Cd1AhZOk.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DanK-Q7T.js","/assets/chart-line-BwqhAAk8.js","/assets/chart-pie-CppBZaxW.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-3uYVg6-9.js","/assets/check-GZtJ5lny.js","/assets/check-check-Bbzp4rMl.js","/assets/chevron-left-B9AAQCCY.js","/assets/chevrons-up-down-BRi8bHNC.js","/assets/circle-dashed-W4xbv1eR.js","/assets/circle-dot-Dbm2QvR_.js","/assets/circle-minus-DZkqPHWk.js","/assets/circle-slash-CkqAhOYG.js","/assets/circle-user-round-DUm0ABhY.js","/assets/coins-uyYleonl.js","/assets/compass-BWo2aaah.js","/assets/concernCategories-CouIU1bn.js","/assets/copy-B3g-hE3m.js","/assets/corner-down-right-C-MUIYmJ.js","/assets/createLucideIcon-BGBRL-56.js","/assets/exportXlsx-v-oB48PC.js","/assets/external-link-CA9rGEDa.js","/assets/file-clock-DgVytH8l.js","/assets/file-spreadsheet-Cqi1RWu-.js","/assets/file-text-DV3tbOtA.js","/assets/flag-BUCVjB8R.js","/assets/flame-B4v1bjaP.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-SqyhJ4sA.js","/assets/funnel-DALIkt4y.js","/assets/hash-Bxn5UH8k.js","/assets/history-B80ubRgp.js","/assets/hourglass-DIXjvVmN.js","/assets/image-kMyGNXJz.js","/assets/image-off-B7Xzzamk.js","/assets/index-Cyu9r5rO.js","/assets/index-yksUK2p9.css","/assets/keyboard-VDo_ArPB.js","/assets/languages-BMC7VoTy.js","/assets/layers-DdlfOYfr.js","/assets/leaderReason-CfoftTsn.js","/assets/lightbulb-CLUTuFqG.js","/assets/link-2-LO3OC-qk.js","/assets/list-checks-DRQDY75T.js","/assets/list-ordered-CEDIVTws.js","/assets/lock-open-DwqkHpqE.js","/assets/log-in-BROmTRAp.js","/assets/message-square-CbDFB9fV.js","/assets/minimize-2-vdpoVlNb.js","/assets/minus-Zmb6o2L3.js","/assets/paperclip-BVD9SbPz.js","/assets/pencil-line-Bg1ZhHTP.js","/assets/pencil-sJIzfabH.js","/assets/personName-B4KId4zS.js","/assets/pin-CHGXNWu2.js","/assets/play-B5MBUUPd.js","/assets/presentation-CZgHfTHi.js","/assets/prop-types-1LT8L2uL.js","/assets/radio-BDxToRrX.js","/assets/react-apexcharts.esm-MX394pty.js","/assets/refresh-cw-DDfFt-Ca.js","/assets/repeat-83EAbm3r.js","/assets/rotate-ccw-DQJuxVfa.js","/assets/rotate-cw-C6f7zH5v.js","/assets/save-DcZdhig1.js","/assets/scale-DWnDIfda.js","/assets/scroll-text-B4bM8Kor.js","/assets/search-x-D45u43hC.js","/assets/segments-DDZ-VNYS.js","/assets/send-Cv8kULN4.js","/assets/settings-2-CFxfp-sO.js","/assets/shield-BpUwvDlI.js","/assets/shield-alert-CP7lBkqO.js","/assets/shield-check-ChJj_Pjy.js","/assets/shield-question-mark-BR-lm-ZL.js","/assets/siren-BBWYUjI9.js","/assets/smartphone-BfZHmE9G.js","/assets/snowflake-HWDZTaod.js","/assets/square-check-big-LxUV_VQp.js","/assets/square-ffdRMfka.js","/assets/star-CtXajQPC.js","/assets/statusBands-BK0QzHJB.js","/assets/table-2-CmvFnLG3.js","/assets/tag-DiknzhSk.js","/assets/trash-2-CD9-9LFI.js","/assets/trending-down-DDJ-Tfca.js","/assets/trending-up-DF5WvTna.js","/assets/undo-2-CaxlrB_7.js","/assets/useChartTheme-DQMcS_u2.js","/assets/useElementWidth-DO6ZvrcV.js","/assets/useIsMobile-D28LFhHJ.js","/assets/useMutation-DMEx5rMd.js","/assets/useStatusBands-Dc7jN0QE.js","/assets/user-check-BIzfMwWk.js","/assets/user-cog-BpU-sUGm.js","/assets/user-minus-DQl8h399.js","/assets/users-BpZJZ4Og.js","/assets/verifyState-Bt1Q7mY1.js","/assets/video-MDXKJP3j.js","/assets/warehouse-DJP2QL3M.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
