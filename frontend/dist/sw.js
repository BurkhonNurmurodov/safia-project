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

const BUILD = "2026-09-28T05:16:08.690Z";
const PRECACHE = ["/","/assets/AdminPanel-C5mnXwkN.js","/assets/AnalysisBoard-wPM2oO6l.js","/assets/Arc-CV8Hx2rf.js","/assets/ArcLegacy-BIeGR-83.js","/assets/AttendanceModal-BAhg5Tkg.js","/assets/BrigadirProfile-DoDQBnRe.js","/assets/BroadcastReceivers-DMBQF8Rx.js","/assets/BroadcastRecord-ygUNP-bJ.js","/assets/CatLockNotice-BYW24Sgf.js","/assets/CategoryLegendModal-lESWaR8u.js","/assets/CellConcerns-CCK4OMpK.js","/assets/CellDetails-CT-W0CPA.js","/assets/CellFormModal-kE9TQQuw.js","/assets/CellLink-BSKWlMo2.js","/assets/Cells-aOtRLQ0g.js","/assets/ColumnFilter-DHkZlbO9.js","/assets/ColumnsPicker-DyD5X-O_.js","/assets/CommentsModal-DgaMb-l4.js","/assets/ComparisonTable-D2-Yse_I.js","/assets/Concerns-B74kukxS.js","/assets/ConfirmDialog-CdhfiLJn.js","/assets/Daily-Cab1C1Tk.js","/assets/DataTable-BAenZ0sk.js","/assets/DateRangePicker-BOtQ8Gpp.js","/assets/DayReportView-BjTDBvVz.js","/assets/DayStepper-BNwOCWd7.js","/assets/DifferenceBreakdown-BpSZkzIT.js","/assets/Downtime-CaPgZZpi.js","/assets/Education-KBOQQD1N.js","/assets/EducationLesson-DtBPNu53.js","/assets/EmptyState-Bvu9okmr.js","/assets/Exam-D2f2bJ9s.js","/assets/FactorySelect-WHHt2aTF.js","/assets/Gamification-CC-Ngwz9.js","/assets/GroupBadge-BoRoPyB9.js","/assets/HeatmapChart-Y2yoTk-T.js","/assets/IdleCell-DW4mrHmr.js","/assets/KPICard-mAV2j4ZI.js","/assets/Kaizen-_CsifWUW.js","/assets/KpiDeltaCard-BkeT4Tgg.js","/assets/LangTextInput-i2tprhsF.js","/assets/Layout-D2emQLid.js","/assets/LeaderAppeal-Ckf1LJ-y.js","/assets/LeaderDayReport-DmJM6DAL.js","/assets/LeaderUnitReport-BjnyV-EN.js","/assets/Leaderboard-B7nA2iV1.js","/assets/Leaders-DrBmWEt-.js","/assets/Lightbox-0-26H5w-.js","/assets/LiveOverview-BFNJd5Qd.js","/assets/Login-Blya5uPe.js","/assets/NotFound-ZnjRiW3U.js","/assets/Overview-DbBBMHp6.js","/assets/Pagination-5SANhCnW.js","/assets/PerenaladkaFactTable-DH4al-Au.js","/assets/PlanFulfillment-WWEK5Hve.js","/assets/Production-DgDfzx9W.js","/assets/Profile-C9cyPRta.js","/assets/ProofCamera-xHZw7-u5.js","/assets/ProofPhoto-SMKLYfe-.js","/assets/Quality-fX-7C-h8.js","/assets/RequestStateChip-Co2ioYs2.js","/assets/RichTextEditor-BMfmy3je.js","/assets/SaveState-Cse5roZk.js","/assets/SearchInput-5xMFWHj_.js","/assets/SeasonalityHeatmap-D9CXYFqE.js","/assets/SegmentedToggle-CgmPxKTk.js","/assets/SetupTimes-BP9dH1Tt.js","/assets/ShiftDaily-BkdXc987.js","/assets/Staff-DHB-AmxG.js","/assets/StatusBadge-DLpzqK9A.js","/assets/TargetGoal-GO_oaNLf.js","/assets/Targets-ermUB8eA.js","/assets/Tasks-B_NHmWyS.js","/assets/TimeWheelPicker-FzQswSHr.js","/assets/Tooltip-DFhhfg8F.js","/assets/TrendChart-CjfmutjB.js","/assets/TripleSpeedometer-C47Tul2i.js","/assets/Trudoyomkost-CddXheyQ.js","/assets/UsersActivity-B_BD4K4V.js","/assets/WatchProgress-CE75S_Nq.js","/assets/WebLogin-DFn0MrR2.js","/assets/WorkerConcerns-CxVUpMg_.js","/assets/Workers-Bh9mxMWj.js","/assets/Zagruzka-DzKbiwKS.js","/assets/ZagruzkaCell--GEjRRu1.js","/assets/alarm-clock-DPDskYJI.js","/assets/api-BK-OoymW.js","/assets/archive-BIOG9SFB.js","/assets/archive-restore-BciR1P6z.js","/assets/arrow-down-BeRkqR3M.js","/assets/arrow-left-DEYEWm9Y.js","/assets/arrow-left-right-zRXZVJpG.js","/assets/arrow-up-DtGPPnkR.js","/assets/arrow-up-right-CPumMQ2z.js","/assets/award-jDimaFK5.js","/assets/ban-C-Ap1u1c.js","/assets/bot-BaXjfDcI.js","/assets/boxes-DdmkgNru.js","/assets/brigadirFilters-D6NH2Ppe.js","/assets/broadcastTree-CeFn_2V3.js","/assets/building-2-DhPU3Qe8.js","/assets/calendar-CumNFnvO.js","/assets/calendar-clock-BoZx075V.js","/assets/calendar-days-BbL6ekcT.js","/assets/calendar-range-C8k9znoA.js","/assets/camera-DlarxYXP.js","/assets/categories-CB_qLt_S.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C2vIkGCV.js","/assets/chart-line-R-08zyuT.js","/assets/chart-pie-By3_o4AO.js","/assets/chartRange-BCFhHaUt.js","/assets/chevron-left-IyEzQ_XM.js","/assets/chevrons-up-down-B5K-04Yg.js","/assets/circle-check-big-DfG2-wrY.js","/assets/circle-dot-B5obWzYC.js","/assets/circle-minus-C37dEbbT.js","/assets/circle-slash-DPjE2Q8b.js","/assets/circle-user-round-df2TFdiF.js","/assets/cloud-off-Bee9-Ivl.js","/assets/cloud-upload-Bw41ld-y.js","/assets/compass-BlAFi1bL.js","/assets/concernCategories-C1V12RH8.js","/assets/copy-L0cgOVh6.js","/assets/corner-down-right-CwZCpdPl.js","/assets/createLucideIcon-wR9-0tKN.js","/assets/es-8UpLskuZ.js","/assets/exportXlsx-mnvuGOF1.js","/assets/external-link-B6am8DLb.js","/assets/file-clock-DTFyOjBf.js","/assets/file-exclamation-point-Dknv8fdR.js","/assets/file-spreadsheet-BWSTxz6Q.js","/assets/file-text-B2--vTDF.js","/assets/flag-pkSwwfp-.js","/assets/flame-BqDVG6tR.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Cw-_scat.js","/assets/hash-rTOoZL11.js","/assets/history-_Pd2Dtsl.js","/assets/hourglass-vC8Uc52_.js","/assets/image-DaMBOUBB.js","/assets/image-off-cv5batF9.js","/assets/index-DpmFxJUO.js","/assets/index-TBzEnSGJ.css","/assets/key-round-CslzmgII.js","/assets/keyboard-DUH4xl5G.js","/assets/languages-pFj2f6Gs.js","/assets/layers-DnIgKgaO.js","/assets/leaderReason-CV6vObXK.js","/assets/lightbulb-AK7Du9J7.js","/assets/link-2-CLPu8XWz.js","/assets/list-checks-CROcLSJs.js","/assets/list-ordered-B3LjT_Pa.js","/assets/list-tree-C6QflmfT.js","/assets/lock-open-87ceH9yf.js","/assets/log-in-BWsqavyz.js","/assets/message-square-BccMaxda.js","/assets/minimize-2-BC78_VWv.js","/assets/package-check-DHtYi4Ww.js","/assets/paperclip-agXH_PSK.js","/assets/pencil-CdJTnLd1.js","/assets/personName-B4KId4zS.js","/assets/pin-DrQOoU4p.js","/assets/pin-off-CNjcY6ib.js","/assets/play-CoeOi2R2.js","/assets/presentation-DfsMDZ0B.js","/assets/prop-types-2IzXU6WJ.js","/assets/radio-Bkv10gvW.js","/assets/react-apexcharts.esm-CG-VfhkH.js","/assets/repeat-B9PehE4o.js","/assets/rotate-ccw-CZQfBYPX.js","/assets/rotate-cw-DMjewd-k.js","/assets/save-BXLivMwM.js","/assets/scale-Bqmd60sp.js","/assets/scroll-text-RKlm0o5s.js","/assets/search-x-qnD2MyLR.js","/assets/segments-D6_nqU3K.js","/assets/send-BPFhpXXh.js","/assets/settings-2-CFX8bO-3.js","/assets/shield-OIZ8R-6j.js","/assets/shield-alert-bpkVQf0d.js","/assets/shield-check-5QfiYBWy.js","/assets/shield-question-mark-BWFbg-St.js","/assets/siren-DYWk2QuI.js","/assets/smartphone-BUSPP7sP.js","/assets/snowflake-ARPND6VT.js","/assets/square-DDuk-44T.js","/assets/square-check-big-DHn4UBoU.js","/assets/star-4hGooLi6.js","/assets/statusBands-BSWppmgY.js","/assets/store-DlWIZHj7.js","/assets/table-2-DwvavSlC.js","/assets/tag-DnwHXNnH.js","/assets/trending-down-C-j-8ZdO.js","/assets/trending-up-CXF8oj4G.js","/assets/undo-2-DigG0r4P.js","/assets/useChartTheme-DMK7DR1l.js","/assets/useElementWidth-B2S_ZOHg.js","/assets/useIsMobile-D9Znarwf.js","/assets/useMutation-CukuSZuh.js","/assets/useStatusBands-DyYLEUqN.js","/assets/user-DpSlMthR.js","/assets/user-check-CIZqYluK.js","/assets/user-cog-DWrlfXyA.js","/assets/user-minus-arEdwUAp.js","/assets/users-DVVNyP4y.js","/assets/verifyState-CiKkmySX.js","/assets/video-CwGkkrXK.js","/assets/wallet-D6YCmIqs.js","/assets/warehouse-D7x8vtL5.js","/assets/zap-CAtY3ZVb.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
