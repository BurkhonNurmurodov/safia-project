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

const BUILD = "2026-09-26T08:26:00.132Z";
const PRECACHE = ["/","/assets/AdminPanel-ZY1moaOd.js","/assets/AnalysisBoard-C8RIpsIx.js","/assets/Arc-qiT1Uk6q.js","/assets/ArcLegacy-B9-EC96v.js","/assets/AttendanceModal-DBce5JSk.js","/assets/BrigadirProfile-BBw8mUPR.js","/assets/BroadcastReceivers-Ddo0-xJi.js","/assets/BroadcastRecord-C-q07U-K.js","/assets/CatLockNotice-BPjtdKmY.js","/assets/CategoryLegendModal-8oB343C5.js","/assets/CellConcerns-CiU19kNG.js","/assets/CellDetails-BiPKD1uA.js","/assets/CellFormModal-CwjvAFhs.js","/assets/CellLink-CLs51vet.js","/assets/Cells-C2EB1rob.js","/assets/ColumnFilter-C3XzYgzF.js","/assets/ColumnsPicker-CZPVnAU4.js","/assets/CommentsModal-CYzOd_VS.js","/assets/ComparisonTable-C_QmzHiH.js","/assets/Concerns-CRA5QVgh.js","/assets/ConfirmDialog-DDEa2D3L.js","/assets/Daily-FTc7MliF.js","/assets/DataTable-M9DO65eU.js","/assets/DateRangePicker-CTDrx39H.js","/assets/DayReportView-DUHduIwi.js","/assets/DayStepper-I6gxQk9j.js","/assets/DifferenceBreakdown-B7NpWpKI.js","/assets/Downtime-CL-q_WU6.js","/assets/Education-Df59rgvP.js","/assets/EducationLesson-BsyTgetF.js","/assets/EmptyState-BjRwfc10.js","/assets/Exam-CNKtKI4G.js","/assets/FactorySelect-B4LZwoDp.js","/assets/Gamification-BaYHRhar.js","/assets/GroupBadge-BqONl4Ag.js","/assets/HeatmapChart-BIa3Hm8g.js","/assets/IdleCell-B-iW7uGY.js","/assets/KPICard-CtOAKRk0.js","/assets/Kaizen-ChYrFCCy.js","/assets/KpiDeltaCard-CbepvGHU.js","/assets/LangTextInput-CaecMrO0.js","/assets/Layout-CLVDm8tJ.js","/assets/LeaderDayReport-BwpXaW6g.js","/assets/LeaderUnitReport-D2R1GDa9.js","/assets/Leaderboard-BZx8UsmG.js","/assets/Leaders-BlXIwv0B.js","/assets/LiveOverview-dD0ZiqVe.js","/assets/Login-BPidXdAW.js","/assets/NotFound-BtMnhE77.js","/assets/Overview-7D-VVFr-.js","/assets/Pagination-CxHcSayv.js","/assets/PerenaladkaFactTable-tFi_I55g.js","/assets/PlanFulfillment-BCKjUBna.js","/assets/Production-eX-O_buY.js","/assets/Profile-CBdIFjkS.js","/assets/ProofCamera-DXoozC8u.js","/assets/Quality-BsqDpHkE.js","/assets/RequestStateChip-CWzfbuAq.js","/assets/RichTextEditor-BlNsgeuv.js","/assets/SearchInput-pl1z0ul5.js","/assets/SeasonalityHeatmap-DhHurEpo.js","/assets/SegmentedToggle-cE1IDgQd.js","/assets/SetupTimes-BuX-6uCm.js","/assets/ShiftDaily-xSXhgGye.js","/assets/Staff-D5P-DwWs.js","/assets/StatusBadge-Cdbz_K2D.js","/assets/Targets-B2eB75lI.js","/assets/Tasks-BXDD5aaJ.js","/assets/TimeWheelPicker-CeYq8u_I.js","/assets/Tooltip-DIN-2tm6.js","/assets/TrendChart-DHadOKLf.js","/assets/TripleSpeedometer-foknnx5D.js","/assets/Trudoyomkost-DKzXPMez.js","/assets/UsersActivity-BJ6XN0PN.js","/assets/WatchProgress-BjpB5hEp.js","/assets/WebLogin-Cz1Et8iX.js","/assets/WorkerConcerns-DsrHenxm.js","/assets/Workers-DGZlnUof.js","/assets/Zagruzka-Bcb89pRS.js","/assets/ZagruzkaCell-IxDFHatr.js","/assets/alarm-clock-Bc4Umx-X.js","/assets/api-_cpXg6qS.js","/assets/archive-DE-d_Xj6.js","/assets/archive-restore-D-lX1yIU.js","/assets/arrow-down-gu5k36A4.js","/assets/arrow-left-jlzny7Mh.js","/assets/arrow-left-right-DtPa9ZJv.js","/assets/arrow-up-CbFuTIO1.js","/assets/arrow-up-right-ClnbSjRF.js","/assets/award-DRr0FeiM.js","/assets/ban-CNlM6Kbu.js","/assets/bot-B9rkkfYG.js","/assets/boxes-C1Jrbt6m.js","/assets/brigadirFilters-DpLfLiPZ.js","/assets/broadcastTree-BZYdGhVM.js","/assets/building-2-K4MuCG34.js","/assets/calendar-BL_RDxZU.js","/assets/calendar-clock-BQhuf7JW.js","/assets/calendar-days-DkR8--Bs.js","/assets/calendar-range-RVrdpOqh.js","/assets/camera-D_TYo9Oc.js","/assets/categories-BM1gaZP4.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-rJVLC2i9.js","/assets/chart-line-CYOcK_MX.js","/assets/chart-pie-CtsTkMq4.js","/assets/chartRange-DCK_2YRm.js","/assets/check-check-BFc7R4SW.js","/assets/chevron-left-vuheC2z5.js","/assets/chevrons-up-down-D9iQPHqF.js","/assets/circle-check-big-C1F0sLap.js","/assets/circle-dashed-aTdfOTA7.js","/assets/circle-dot-CzDa_gSI.js","/assets/circle-minus-BeQVm5aW.js","/assets/circle-slash-Dxr7qo9g.js","/assets/circle-user-round-Dm0QRNcp.js","/assets/coins-Dd_TegqW.js","/assets/compass-DTGJbwZL.js","/assets/concernCategories-DCDsQqIp.js","/assets/copy-GSJ7_2sh.js","/assets/corner-down-right-DzDjGBj2.js","/assets/createLucideIcon-BPmz6L4n.js","/assets/exportXlsx-XLK1K4mo.js","/assets/external-link-Br2HOy_R.js","/assets/file-clock-slJNsTSq.js","/assets/file-exclamation-point-COO8V-hg.js","/assets/file-spreadsheet-CUSNfsV2.js","/assets/file-text-CDK0BWJ3.js","/assets/flag-QQI11Zd7.js","/assets/flame-CTlpNjm5.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-B2X_6LdI.js","/assets/hash-D4ESECi7.js","/assets/history-CXRt9j_6.js","/assets/hourglass-CQvVJath.js","/assets/image-DEXL-FZs.js","/assets/image-off-By1nF_SY.js","/assets/index-BpXEHg2I.css","/assets/index-DhyFbDIJ.js","/assets/key-round-O_52yvh5.js","/assets/keyboard-Drdrl-X-.js","/assets/languages-CeMFd1p-.js","/assets/layers-Bhe2FI-4.js","/assets/leaderReason-B-jmJXgU.js","/assets/lightbulb-KgOCSiTb.js","/assets/link-2-DWkk71ne.js","/assets/list-checks-cg05fmtG.js","/assets/list-ordered-DmSTRhmP.js","/assets/list-tree-B5MA8CvF.js","/assets/lock-open-Db8sww-0.js","/assets/log-in-B1iOrd0W.js","/assets/message-square-B9BjdW5w.js","/assets/minimize-2-g9cZ_1Pw.js","/assets/package-check-BdyQ0-jg.js","/assets/paperclip-BS5P4Umb.js","/assets/pencil-B7LofcQM.js","/assets/personName-B4KId4zS.js","/assets/pin-c_wZjqmC.js","/assets/play-B8qgB75i.js","/assets/presentation-B6aTOvXG.js","/assets/prop-types-DhKKtCHU.js","/assets/radio-V2e5Ox3b.js","/assets/react-apexcharts.esm-fpF-JTzo.js","/assets/repeat-BWf7QUCw.js","/assets/rotate-ccw-BQdm3CuX.js","/assets/rotate-cw-BfBdiPdI.js","/assets/save-BSDAthd8.js","/assets/scale-wp8SekBz.js","/assets/scroll-text-DkaDhPGI.js","/assets/search-x-DEHKp6qU.js","/assets/segments-BTBrOORP.js","/assets/send-DST5uzuK.js","/assets/settings-2-C9ku4EvF.js","/assets/shield-DNRYX4RL.js","/assets/shield-alert-B-v05POU.js","/assets/shield-check-Uq__ysi_.js","/assets/shield-question-mark-Czt-HCWG.js","/assets/siren-SpfVsUMk.js","/assets/smartphone-C8gP5Zx5.js","/assets/snowflake-D0gcoYbB.js","/assets/square-check-big-DRmOrP2U.js","/assets/square-ytMGQlmR.js","/assets/star-CPEUJm7S.js","/assets/statusBands-Byx_Huax.js","/assets/store-Cpa1a2D9.js","/assets/table-2-DJ74oWA3.js","/assets/tag-s8Uj61_f.js","/assets/trending-down-_cMX1yrX.js","/assets/trending-up-C_oth0Qx.js","/assets/triangle-alert-CucC5jvs.js","/assets/undo-2-CevgavTk.js","/assets/useChartTheme-CtApFwRx.js","/assets/useElementWidth-Dpj2my8Q.js","/assets/useIsMobile-BSRKqGDS.js","/assets/useMutation-D1ILkyYM.js","/assets/useStatusBands-Bg3vm2TR.js","/assets/user-BQm-rmB7.js","/assets/user-check-B8rJck6m.js","/assets/user-cog-DQyUZgyH.js","/assets/user-minus-OxvTx36E.js","/assets/users-B9SIjN-A.js","/assets/verifyState-DhqVQFJH.js","/assets/video-CtWY0BOT.js","/assets/warehouse-sagu7o29.js","/assets/zap-6YPx9CLh.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
