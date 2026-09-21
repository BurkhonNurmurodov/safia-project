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

const BUILD = "2026-09-21T05:51:25.271Z";
const PRECACHE = ["/","/assets/AdminPanel-Cv318Q74.js","/assets/AnalysisBoard-z09yO31s.js","/assets/Arc-CoMQi2lN.js","/assets/AttendanceModal-CvTotq84.js","/assets/BrigadirProfile-Z4cFO8qq.js","/assets/BroadcastReceivers-BTjErRxS.js","/assets/BroadcastRecord-BZx0nKMg.js","/assets/CatLockNotice-BN2NcTne.js","/assets/CategoryLegendModal-DZQlXvaw.js","/assets/CellConcerns-5PHPy137.js","/assets/CellDetails-Bw994bp1.js","/assets/CellFormModal-DvXx8MN-.js","/assets/CellLink-Ckw_f2xV.js","/assets/Cells-DD10EH03.js","/assets/ColumnFilter-Baq6DIpv.js","/assets/ColumnsPicker-CcODMyR3.js","/assets/CommentsModal-BMNKnHpT.js","/assets/ComparisonTable-DUUQuFn1.js","/assets/Concerns-DqZOHhLp.js","/assets/ConfirmDialog-jjC6N2pH.js","/assets/Daily-C8bcpDVT.js","/assets/DataTable-Do5Y5jXI.js","/assets/DateRangePicker-BQ5nreq4.js","/assets/DayReportView-D0qnxf1V.js","/assets/DayStepper-C6nZQzdc.js","/assets/DifferenceBreakdown-D5NeIZyu.js","/assets/Downtime-tmqPPiL3.js","/assets/Education-NQ3Xl76B.js","/assets/EducationLesson-uDsOY7bI.js","/assets/EmptyState-DcF0kfZY.js","/assets/FactorySelect-CMGiTAID.js","/assets/FormField-Bl3F0LQb.js","/assets/Gamification-DqF_byVa.js","/assets/GroupBadge-DbcRJdn6.js","/assets/HeatmapChart-CO3IDGQE.js","/assets/IdleCell-CWtJyfxS.js","/assets/KPICard-C5dBGdPI.js","/assets/Kaizen-zGQ0Lkqk.js","/assets/KpiDeltaCard-D4DbA53M.js","/assets/LangTextInput-DZHudX1i.js","/assets/Layout-LU1c2Pni.js","/assets/LeaderDayReport-6JubCj6q.js","/assets/LeaderUnitReport-CExEZIiJ.js","/assets/Leaderboard-PcgAcTAT.js","/assets/Leaders-_U6emTI0.js","/assets/LiveOverview-DVM-GLt3.js","/assets/Login-BAmyx6GG.js","/assets/NotFound-DN6ksKNR.js","/assets/Overview-D7sP6sTC.js","/assets/Pagination-2cQLdh2S.js","/assets/PerenaladkaFactTable-B5CNM34a.js","/assets/PlanFulfillment-BoShcDag.js","/assets/Production-DVnYuT91.js","/assets/Profile-BdK-RI9N.js","/assets/ProofCamera-CXJxUWZu.js","/assets/Quality-CvyF1dd9.js","/assets/RichTextEditor-cnYiyngG.js","/assets/SearchInput-a3QxCp1c.js","/assets/SeasonalityHeatmap-Diy_6Fd_.js","/assets/SegmentedToggle-C0Kb-cV1.js","/assets/SetupTimes-DqJD8vJj.js","/assets/ShiftDaily-oQ-fJzki.js","/assets/Skeleton-wLOg22R1.js","/assets/Staff-S50_EKBE.js","/assets/StatusBadge-D_lCXtfo.js","/assets/StyledSelect-C_dFY4Y8.js","/assets/Targets-x6XjpXmA.js","/assets/Tasks-CMUnMeR0.js","/assets/TimeField-DFK9uwCp.js","/assets/TimeWheelPicker-DLwqmb1f.js","/assets/Toast-C3DxsOhj.js","/assets/Tooltip-B9nXS3iN.js","/assets/TrendChart-_HDHB9Ca.js","/assets/TripleSpeedometer-BsEZlZNi.js","/assets/Trudoyomkost-Bty2MLQV.js","/assets/UsersActivity-CVQA2pAL.js","/assets/WatchProgress-B3KO3Shp.js","/assets/WebLogin-tdt5P7pY.js","/assets/WorkerConcerns-AyB5Xq3r.js","/assets/Workers-vtKdJoQP.js","/assets/Zagruzka-DOFA9pl7.js","/assets/ZagruzkaCell-1Go5bMwz.js","/assets/alarm-clock-BbX_ZbRc.js","/assets/api-8K31nVxX.js","/assets/archive-C0UxmGo5.js","/assets/archive-restore-atGGwMvF.js","/assets/arrow-down-LyDdael2.js","/assets/arrow-left-ewGT3Ihd.js","/assets/arrow-left-right-QSSmovGu.js","/assets/arrow-right-B03SEh4h.js","/assets/arrow-up-right-CEy_c-Mb.js","/assets/arrow-up-w1IXV1QB.js","/assets/award-Bv4bOS_Q.js","/assets/ban-bQKmCEDi.js","/assets/bot-D8a1_BsA.js","/assets/boxes-5VgupF60.js","/assets/brigadirFilters-JwBUOqhj.js","/assets/broadcastTree-CRyPjWvQ.js","/assets/building-2-BDVWjeNa.js","/assets/calendar-DlWZw87q.js","/assets/calendar-clock-BKlvDPAm.js","/assets/calendar-days-DT7UU5dW.js","/assets/calendar-range-P1EpJ9VF.js","/assets/camera-L4zwytqv.js","/assets/categories-C1XhMiTL.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-mirbSi8L.js","/assets/chart-line-B34IsNOw.js","/assets/chart-pie-CidYYWZ1.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-BosaBih0.js","/assets/check-BsY_bh33.js","/assets/check-check-CQbF3v1_.js","/assets/chevron-left-DCCdL1GA.js","/assets/chevrons-up-down-Cp0A8Fc6.js","/assets/circle-dashed-Cz_5PRIY.js","/assets/circle-dot-DVB5ZLz4.js","/assets/circle-minus-DiO9W09K.js","/assets/circle-slash-BTHlKNo4.js","/assets/circle-user-round-DM6UnfbI.js","/assets/coins-D8FG5Z8J.js","/assets/compass-BG8xV_BX.js","/assets/concernCategories-C3x-xaZk.js","/assets/copy-DPLwib9e.js","/assets/corner-down-right-DhlCYGli.js","/assets/createLucideIcon-ByHFW1mb.js","/assets/exportXlsx-DsEqOJ0b.js","/assets/external-link-Bc2JdOD1.js","/assets/file-clock-DWQ57wBV.js","/assets/file-spreadsheet-Ca-mr3Wj.js","/assets/file-text-CfZlVkVI.js","/assets/flag-Br4xn2js.js","/assets/flame-DL3SR-bw.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-D9mscJMu.js","/assets/funnel-CC317DMr.js","/assets/hash-w7Wps6kh.js","/assets/history-B0_F4BsJ.js","/assets/hourglass-CjrWDPTu.js","/assets/image-BZdBYrWf.js","/assets/image-off-cJNOUK9l.js","/assets/index-BXqTV2jf.css","/assets/index-CrO0jduR.js","/assets/keyboard-WJNuuc-Z.js","/assets/languages-DqyfRc2h.js","/assets/layers-CBOzWP_V.js","/assets/leaderReason-CA3YDPFw.js","/assets/lightbulb-BtdJy_NU.js","/assets/link-2-DSYvJ2bR.js","/assets/list-checks-DD-AnQDy.js","/assets/list-ordered-miPoFrvD.js","/assets/lock-open-PslH_pjn.js","/assets/log-in-DYLE0fSh.js","/assets/message-square-CjvVU7EX.js","/assets/minimize-2-CDwgXNzJ.js","/assets/minus-4gpfjz7c.js","/assets/paperclip-Cl31ttVb.js","/assets/pencil-XPFVMlfz.js","/assets/pencil-line-BhHouSO0.js","/assets/personName-B4KId4zS.js","/assets/pin-BSqWQObJ.js","/assets/play-Dk-WTMFT.js","/assets/prop-types-DMUIe94T.js","/assets/radio-BP5RldWO.js","/assets/react-apexcharts.esm-DOixzaGM.js","/assets/refresh-cw-CLZ2ADez.js","/assets/repeat-D39NVEZM.js","/assets/rotate-ccw-DlmSMZgj.js","/assets/rotate-cw-CKb0bKh5.js","/assets/save-b-5WQItV.js","/assets/scale-DXcss78P.js","/assets/scroll-text-fVb4UbiK.js","/assets/search-x-C7eREAWD.js","/assets/segments-BtHjIbWE.js","/assets/send-D-UFlKaa.js","/assets/settings-2-BEcBXy00.js","/assets/shield-CkwkO8p2.js","/assets/shield-alert-DgdWpVEs.js","/assets/shield-check-C92_fnZQ.js","/assets/shield-question-mark-CND3cM5C.js","/assets/siren-ac4kGTbq.js","/assets/smartphone-6szfvtuC.js","/assets/snowflake-BJ2A0NzO.js","/assets/square-C2TZ2zHi.js","/assets/square-check-big-Dzd0Ozni.js","/assets/star-DFW7IDFJ.js","/assets/statusBands-VD31fmt9.js","/assets/table-2-eMBBJxnF.js","/assets/tag-DmgDV3ww.js","/assets/trash-2-Beyc9c4p.js","/assets/trending-down-FLvP-6HB.js","/assets/trending-up-gFwUF5pq.js","/assets/undo-2-SDOpvL8a.js","/assets/useChartTheme-C3D_N_Kd.js","/assets/useElementWidth-5QhAgshj.js","/assets/useIsMobile--6VhzqcC.js","/assets/useMutation-jDpWv_Z6.js","/assets/useStatusBands-DDQnWnbM.js","/assets/user-check-Cekv_m8s.js","/assets/user-cog-BvH55kqE.js","/assets/user-minus-D0ZxHNcl.js","/assets/users-BSOOqhz8.js","/assets/verifyState-DIP6NRQt.js","/assets/video-WP_E4c4I.js","/assets/warehouse--KwR8KtJ.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
