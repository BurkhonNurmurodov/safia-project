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

const BUILD = "2026-09-29T09:18:35.924Z";
const PRECACHE = ["/","/assets/AdminPanel-B8ancjEG.js","/assets/AnalysisBoard-BFMjUvXk.js","/assets/Arc-C2yuYTYO.js","/assets/ArcLegacy-D2yPIEqf.js","/assets/AttendanceModal-CwMDeI7n.js","/assets/BrigadirProfile-BlDMc2of.js","/assets/BroadcastReceivers-CtI0Vnf4.js","/assets/BroadcastRecord-CbajU0Vp.js","/assets/CatLockNotice-DIqw_EDc.js","/assets/CategoryLegendModal-C59sepf2.js","/assets/CellConcerns-BrezKla5.js","/assets/CellDetails-1ygRwa4X.js","/assets/CellFormModal-CRTeBG7K.js","/assets/CellLink-CeMl3Esq.js","/assets/Cells-CbGL0nw3.js","/assets/ColumnFilter-DIsFCsyb.js","/assets/ColumnsPicker-B84sIPZs.js","/assets/CommentsModal-BfLMZBM3.js","/assets/ComparisonTable-yKB9okUd.js","/assets/Concerns-BO_uwZFM.js","/assets/ConfirmDialog-BYbdT7n3.js","/assets/Daily-wq1EFfdG.js","/assets/DataTable-DcUvFHG0.js","/assets/DateRangePicker-CFfjub2N.js","/assets/DayReportView-C8vu1QY0.js","/assets/DayStepper-CBtnHWTg.js","/assets/DifferenceBreakdown-8bv4ivih.js","/assets/Downtime-COvYYVHq.js","/assets/Education-gWQ1831x.js","/assets/EducationLesson-fFu0B0qK.js","/assets/EmptyState-przdn6-z.js","/assets/Exam-DbL0PEYy.js","/assets/FactorySelect-CfncH--7.js","/assets/Gamification-DtHm2Doj.js","/assets/GroupBadge-BjVGxrI_.js","/assets/HeatmapChart-kMWyxJqq.js","/assets/IdleCell-edp5Dmuo.js","/assets/KPICard-5pr3p3_J.js","/assets/Kaizen-Lyg9I0Ji.js","/assets/Kelish-zCngRftJ.js","/assets/KpiDeltaCard-BAGShJ3w.js","/assets/LangTextInput-C0k_z5ZC.js","/assets/Layout-DmzavSUW.js","/assets/LeaderAppeal-Je7-6v-l.js","/assets/LeaderDayReport-DHx8CRm1.js","/assets/LeaderUnitReport-hQ6yh40D.js","/assets/Leaderboard-DJD4mken.js","/assets/Leaders-CcB8zEKl.js","/assets/Lightbox-B62-FLRF.js","/assets/LiveOverview-owcmPeMm.js","/assets/Login-B9zYp3XD.js","/assets/NotFound-ctSAqhxJ.js","/assets/Overview-BzbAjEL0.js","/assets/Pagination-C3Q8EORj.js","/assets/PerenaladkaFactTable-HC4Wqkim.js","/assets/PlanFulfillment-Dr-o6MBO.js","/assets/Production-BacaoZSM.js","/assets/Profile-MYndd7fb.js","/assets/ProofCamera-BFZeYAuS.js","/assets/ProofPhoto-D1I0l3TE.js","/assets/Quality-C7v8Z7va.js","/assets/RequestStateChip-BAGQ9NV9.js","/assets/RichTextEditor-BUcENOyQ.js","/assets/SaveState-DURASFYr.js","/assets/SearchInput-CBTDo9ae.js","/assets/SeasonalityHeatmap-DO_86wwe.js","/assets/SegmentedToggle-DNDUWRSd.js","/assets/SetupTimes-DKIk4J49.js","/assets/ShiftDaily-Di-PTiR5.js","/assets/Staff-Dqsh7PVI.js","/assets/StatusBadge-x2VnICDA.js","/assets/TargetGoal-CSvzhdLE.js","/assets/Targets-C0p6Z6Uz.js","/assets/Tasks-CU8iBPko.js","/assets/TimeWheelPicker-C22fqTia.js","/assets/Tooltip-CJ66gccW.js","/assets/TrendChart-CUMyzQO_.js","/assets/TripleSpeedometer-Bkka-00m.js","/assets/Trudoyomkost-CfFtlOPD.js","/assets/UploadDropzone-BWdv3Opo.js","/assets/UsersActivity-DujM2d4y.js","/assets/VerdictBlock-DoljM1EP.js","/assets/WatchProgress-DorVM4XQ.js","/assets/WebLogin-8G2Nl4wm.js","/assets/WorkerConcerns-DU7jc4js.js","/assets/Workers-DRvtmCNa.js","/assets/Zagruzka-DK49W4pZ.js","/assets/ZagruzkaCell-BYWnGVp8.js","/assets/api-By5cjMTA.js","/assets/archive-CRh40kVp.js","/assets/archive-restore-CFYYubZ3.js","/assets/arrow-down-DH5UBAUI.js","/assets/arrow-left-DU7-AFes.js","/assets/arrow-left-right-atOJR2nq.js","/assets/arrow-up-Xon7Ax-a.js","/assets/arrow-up-narrow-wide-DP5j1Hjd.js","/assets/arrow-up-right-DGZdRaEO.js","/assets/award-CFOs0rAI.js","/assets/ban-DgBgeteL.js","/assets/bot-DO6yvPcu.js","/assets/boxes-CwEh8NCu.js","/assets/brigadirFilters-Bu_mHV0w.js","/assets/broadcastTree-BaETO5Iw.js","/assets/building-2-JInQJp1Z.js","/assets/calendar-clock-DhTGePiU.js","/assets/calendar-days-DLhfdhf0.js","/assets/calendar-ldyVh5YN.js","/assets/calendar-range-C51YEfJf.js","/assets/camera-CGhlFSJz.js","/assets/categories--Q-PE3lw.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CziAAmTV.js","/assets/chart-line-D1Ga3zkA.js","/assets/chart-pie-DZ91M85g.js","/assets/chartRange-QJPc7_n-.js","/assets/chevron-left-DWYooQUy.js","/assets/chevrons-up-down-_aOJxMER.js","/assets/circle-DOeVXw4t.js","/assets/circle-check-big-Cxxxc7qM.js","/assets/circle-dot-B3N8jkQX.js","/assets/circle-minus-BgFdL2I7.js","/assets/circle-slash-Duf-wtB1.js","/assets/circle-user-round-BLfpO9AM.js","/assets/cloud-off-yu_eWxmD.js","/assets/cloud-upload-BxrjcNJV.js","/assets/compass-CNLIUx7Y.js","/assets/concernCategories-NRTFbgRz.js","/assets/copy-Culxj94f.js","/assets/corner-down-right-Bdki4UF4.js","/assets/createLucideIcon-B0x8T7fZ.js","/assets/es-DzGWC58L.js","/assets/exportXlsx-C6XMQL05.js","/assets/external-link-B--ljzK2.js","/assets/file-clock-EnaYPzYb.js","/assets/file-exclamation-point-CvGCHLLW.js","/assets/file-spreadsheet-Dr3fHitA.js","/assets/file-text-pCDiZXst.js","/assets/flag-C0wn4Fm2.js","/assets/flame-CADUTSZJ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-1Wq94xV7.js","/assets/hash-CSAXcQiW.js","/assets/history-BstXXjOJ.js","/assets/hourglass-bCaTeQwa.js","/assets/image-Brw_boC8.js","/assets/image-off-BKUe9UP4.js","/assets/index-Dc63WcAf.js","/assets/index-DzptyuPr.css","/assets/key-round-CReZuePT.js","/assets/keyboard-B1XDapTD.js","/assets/languages-DnspKjBr.js","/assets/layers-DYJLoR_r.js","/assets/lightbulb-B9FH-xlF.js","/assets/link-2-dPcuZhiH.js","/assets/link-2-off-BrZTsnC0.js","/assets/list-checks-Dfo5J2cQ.js","/assets/list-ordered-KYBxocxZ.js","/assets/list-tree-XyRB5gTt.js","/assets/lock-open-D9bDyHCv.js","/assets/log-in-CDJmEFIB.js","/assets/maximize-2-D8aBw42x.js","/assets/message-square-BH5v56UN.js","/assets/minimize-2-s5DxKU-D.js","/assets/package-check-HbMAo0FH.js","/assets/paperclip-DGiSvxRB.js","/assets/pencil-DlPUJkX8.js","/assets/percent-DCnocww_.js","/assets/personName-B4KId4zS.js","/assets/pin-CKdsFwfA.js","/assets/pin-off-Zwg4LVEL.js","/assets/play-B3r6eulu.js","/assets/presentation-eXmdsG-1.js","/assets/prop-types-CtjEL5Tv.js","/assets/radio-iFP8ef92.js","/assets/react-apexcharts.esm-BRVe7gW0.js","/assets/repeat-Cv4y6dSR.js","/assets/rotate-ccw-6x3r0tbr.js","/assets/rotate-cw-iaCwF97h.js","/assets/save-DimuG5U0.js","/assets/scale-CQVeZ-i8.js","/assets/scroll-text-BQ8U0jb1.js","/assets/search-x-BvKFIsyn.js","/assets/segments-BqClAsri.js","/assets/send-BAen8N9H.js","/assets/settings-2-Cft7uFrz.js","/assets/shield-TMr3LQoi.js","/assets/shield-alert-Cw9rLibH.js","/assets/shield-check-D8p9Qn1W.js","/assets/shield-question-mark-CrcSx8xg.js","/assets/siren-CZGKyzJT.js","/assets/snowflake-O7e5Cc06.js","/assets/square-CVnes3ag.js","/assets/square-check-big-BKaKRaFc.js","/assets/star-h4c7JLG0.js","/assets/statusBands-rpJ2ywhA.js","/assets/store-0ALfLCzx.js","/assets/table-2-C1bGXKKf.js","/assets/table-properties-rxLHEnZ9.js","/assets/tag-BJHogeqM.js","/assets/timer-off-CTrBbRL_.js","/assets/trending-down-Bo-H2Ay0.js","/assets/trending-up-BTrtG1mA.js","/assets/undo-2-Cj4ZGT_A.js","/assets/useChartTheme-j_PfauSa.js","/assets/useElementWidth-BW1yxODT.js","/assets/useIsMobile-oWiuGgl7.js","/assets/useMutation-D9bQINm-.js","/assets/useStatusBands-CrW8Eu2W.js","/assets/user-DGbGMIb0.js","/assets/user-cog-BsAroK0Y.js","/assets/user-minus-1h-tRQLR.js","/assets/users-a8suuAPR.js","/assets/video-DOCZCyFp.js","/assets/wallet-BvaNif3N.js","/assets/warehouse-DJTavPtr.js","/assets/zap-DW_c2qO9.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
