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

const BUILD = "2026-10-31T13:02:33.634Z";
const PRECACHE = ["/","/assets/AdminPanel-DQwQyDUA.js","/assets/AnalysisBoard-BzwovWOi.js","/assets/Arc-DBWzCEc0.js","/assets/Assessment-fD7GUf4v.js","/assets/AssessmentGrade-DESAy9bP.js","/assets/AssessmentList-CtbHQByw.js","/assets/Assistant-IyqtJ4UM.js","/assets/BrigadirProfile-Dy_MrPcb.js","/assets/BroadcastReceivers-CvnLxpU5.js","/assets/BroadcastRecord-i2grdQwG.js","/assets/Button-CRGLUK7e.js","/assets/CatLockNotice-ClnXKrJL.js","/assets/CategoryLegendModal-DHsgf9IQ.js","/assets/CellConcerns-CuJxDuc9.js","/assets/CellDetails-BoQDA5x7.js","/assets/CellFormModal-DMNafQLn.js","/assets/CellIdent-BTSbgHi4.js","/assets/CellLink-eimmaqYo.js","/assets/Cells-CUVXSAHr.js","/assets/ColumnFilter-CrMfcTVP.js","/assets/ColumnsPicker-ViiY_kB2.js","/assets/CommentsModal-B_3TJCKr.js","/assets/ComparisonTable-ZndSaWWw.js","/assets/Concerns-CJZO_c2y.js","/assets/ConcernsPieces-C7h3yU4r.js","/assets/CountStepper-B_v0dUEw.js","/assets/Daily-Dj1XmKiM.js","/assets/DataTable-DajrVYwZ.js","/assets/DateRangePicker-Dn0lnNr1.js","/assets/DayReportView-Clw8qa-8.js","/assets/DayStepper-iBhXP90d.js","/assets/DayStrip-Capu8DKu.js","/assets/DifferenceBreakdown-bs4hIs7P.js","/assets/Downtime-UgP3z80Z.js","/assets/Education-BlRFKlNE.js","/assets/EducationLesson-u6jenfXz.js","/assets/EmptyState-A_FLmMQb.js","/assets/Exam-DD6SUltd.js","/assets/FactorySelect-Dq1xhhAL.js","/assets/Gamification-DS0pLTWr.js","/assets/HeatmapChart-TsJS0-40.js","/assets/IdleCell-wvJxYq-_.js","/assets/KPICard-iKdoELmU.js","/assets/Kaizen-DIuxYWtC.js","/assets/Kelish-F34Y_iyp.js","/assets/KpiDeltaCard-DC5384CH.js","/assets/LangTextInput-DDiqD7v2.js","/assets/Layout-DqQ0rkd2.js","/assets/LeaderAppeal-kJbyw4Wm.js","/assets/LeaderDayReport-CpEWmZGF.js","/assets/LeaderUnitReport-BYOEV26H.js","/assets/Leaderboard-svC9TQeG.js","/assets/Leaders-NPz7g8Vb.js","/assets/LeadersKpi-CnHfMrJK.js","/assets/Lightbox-C69MqUWf.js","/assets/LiveOverview-Da-XhcZ9.js","/assets/Login-g_-QL9X1.js","/assets/NotFound-BkD25jM9.js","/assets/Notifications-DzSMAyHo.js","/assets/Ontime-kPF-xv6o.js","/assets/Overview-iaOZ2rke.js","/assets/Pagination-CF-4SJoG.js","/assets/People-QTotFj7p.js","/assets/PerenaladkaFactTable-DCPCbc7t.js","/assets/PersonCard-C5CmyHS6.js","/assets/PlanFulfillment-Dy5bgZjX.js","/assets/Production-PYVbUP2i.js","/assets/Profile-DIpjE7n1.js","/assets/ProofCamera-DSg1bXyL.js","/assets/ProofPhoto-BqWQQbyX.js","/assets/Quality-D0jppwJS.js","/assets/RawRows-DY2JeN7M.js","/assets/Reports-Rk1oYt8m.js","/assets/RequestStateChip-P77tQHaI.js","/assets/RichTextEditor-CSYTaYkP.js","/assets/SaveState-BzubRPGW.js","/assets/SearchInput-ZNBSn930.js","/assets/SeasonalityHeatmap-B3pgvVBQ.js","/assets/SegmentedToggle-C-RlBBqG.js","/assets/SetupTimes-AnMLztoI.js","/assets/ShiftDaily-CwpJ0UDe.js","/assets/Staff-DzzMOatX.js","/assets/StaffListAtCheck-x5ASgV7v.js","/assets/StatusBadge-CuPSGmTK.js","/assets/StatusBandsModal-DTMqrd3a.js","/assets/TargetGoal-BRcH9d9b.js","/assets/Targets-BCItN0rv.js","/assets/Tasks-7sUSQ_y0.js","/assets/TimeWheelPicker-Bf8hGTUM.js","/assets/Toast-bFz4Zj9S.js","/assets/Tooltip-DVJgMWBq.js","/assets/TrendChart-CbY0HLj1.js","/assets/TripleSpeedometer-zX6me1B3.js","/assets/Trudoyomkost-D07ll2f-.js","/assets/UploadDropzone-BqU5JI_X.js","/assets/UsersActivity-CVRU8iFl.js","/assets/VerdictBlock-el0q-wGg.js","/assets/VfxApiMap-it9CELYn.js","/assets/VfxDictionaries-B8zKRXJx.js","/assets/VfxEmployees-xnfEI3ms.js","/assets/VfxHrMoves-gAAn0-gO.js","/assets/VfxJobs-D7q_HfsX.js","/assets/VfxPhoto-5Uo-rRw3.js","/assets/VfxShifts-Dyor3wBt.js","/assets/VfxState-CjEddz_g.js","/assets/VfxTimebooks-OuATSPJY.js","/assets/VfxTimesheet-B7SF1Vqj.js","/assets/WatchProgress-D737bKKw.js","/assets/WebLogin-CJBToVcx.js","/assets/Workers-ChZHICKw.js","/assets/Zagruzka-D4fu3au3.js","/assets/ZagruzkaCell-Dep2XdkZ.js","/assets/api-BFm7MSgf.js","/assets/archive-Ci2i3K-F.js","/assets/archive-restore-D6zFj5jp.js","/assets/arrow-down-DO99j-rt.js","/assets/arrow-down-right-BLaanEvt.js","/assets/arrow-down-wide-narrow-CDiuoVEn.js","/assets/arrow-up-narrow-wide-Cj3m015k.js","/assets/ban-BjFP4cIz.js","/assets/book-check-B0QGBGrv.js","/assets/boxes-CPJm_dxs.js","/assets/braces-C291HPLZ.js","/assets/brigadirFilters-C1xyCqK9.js","/assets/broadcastTree-PRhxLHz0.js","/assets/calendar-CsCErf0T.js","/assets/calendar-days-CQobkuj1.js","/assets/camera-DKpjakQd.js","/assets/categories-Cmwneagh.js","/assets/cellMoveRefusal-CWqwye2H.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CuMW5CTs.js","/assets/chart-line-CfgyxR7a.js","/assets/chart-pie-0h3E5Apw.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-fIqfHK6_.js","/assets/chevron-left-DTu0_lSf.js","/assets/chevrons-up-down-CTmM0G9d.js","/assets/circle-alert-BE2ZAbim.js","/assets/circle-bGsPEVRT.js","/assets/circle-check-big-BIazvc1S.js","/assets/circle-dashed-Da6ENWfU.js","/assets/circle-minus-ChyZtoCZ.js","/assets/circle-question-mark-BnEZKhMF.js","/assets/circle-user-round-D2c6kbWf.js","/assets/cloud-off-C9D3nS39.js","/assets/cloud-upload-Pstc56Wz.js","/assets/coins-tQMcfp4e.js","/assets/compass-B8Evh_Wh.js","/assets/concernCategories-B7jEdur4.js","/assets/corner-down-right-LyFbMjbb.js","/assets/createLucideIcon-ChYcNZ3y.js","/assets/en-CiW4gksg.js","/assets/es-Dtgc5NM1.js","/assets/external-link-BzLfZ0oq.js","/assets/file-exclamation-point-BJujblQb.js","/assets/flag-BjXVEkkX.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BXGaWtkd.js","/assets/funnel-BodVsIGD.js","/assets/hard-hat-xHA49Kze.js","/assets/hash-BiEpo6bh.js","/assets/hourglass-DP9fx1x4.js","/assets/idleTime-CHPnJRpw.js","/assets/image-D08aGP2n.js","/assets/image-off-Djr59qwG.js","/assets/inbox-eyQ9eqmq.js","/assets/index-BeNrP0vM.js","/assets/index-D95nGo1c.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DDlRBk4x.js","/assets/layers-BVBdkBVX.js","/assets/leaderBoard-CgnXlJSO.js","/assets/lightbulb-iLGd6_IA.js","/assets/link-2-CMTQv3al.js","/assets/link-2-off-BXxYjLDd.js","/assets/list-ordered-BR4FsLV2.js","/assets/list-tree-CULR6p-5.js","/assets/lock-open-BLFzRi5z.js","/assets/log-in-VAgq7kUU.js","/assets/map-pin-DVYCE3np.js","/assets/marks-Cc6IP-7q.js","/assets/message-square-text-sHQ76-Ny.js","/assets/minimize-2-Cvc8rs9q.js","/assets/package-CaKClygZ.js","/assets/package-check-BUJfjSMZ.js","/assets/pencil-BdWhMWwV.js","/assets/percent-B52VxysT.js","/assets/pin-COpccnCn.js","/assets/pin-off-DhJjartv.js","/assets/play-CL-8QBFW.js","/assets/plug-zap-CGh9sghx.js","/assets/prop-types-RD3fbola.js","/assets/radio-CuGxRJjS.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-Cqg8Wg6h.js","/assets/repeat-DeTCIFMm.js","/assets/ru-FGGVT5ks.js","/assets/save-BmXxgnbi.js","/assets/scopeLinks-D18kc7CZ.js","/assets/search-x-NKd9KLfX.js","/assets/segments-D5Uiedtv.js","/assets/send-sDjG_pwQ.js","/assets/shield-D6qWMANO.js","/assets/shield-alert-2rSdMTdR.js","/assets/sigma-CnSO44Ds.js","/assets/siren-D2Kmvqj1.js","/assets/snowflake-B1Snbckg.js","/assets/split-Cxkn9KYm.js","/assets/square-check-big-CTsaIsAL.js","/assets/star-B_5_SeIl.js","/assets/statusBands-DVBZcBq3.js","/assets/store-BdGRJ7Ah.js","/assets/table-2-e29ge2td.js","/assets/table-properties-DnySTmPK.js","/assets/tag-BEPI_x3Y.js","/assets/timer-off-QSfhWcqv.js","/assets/translations-DTibigmu.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-OXAkvgrp.js","/assets/trending-up-pTWXA1Eh.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-D0ZRKBrv.js","/assets/useChartTheme-B2hDoapa.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-BjV2dzcs.js","/assets/useStatusBands-D4JBmx_P.js","/assets/useUrlScope-NRXDYS31.js","/assets/user-D0as4Ypy.js","/assets/user-cog-kRVEwkGK.js","/assets/uz-BF6CWzYB.js","/assets/uz_cyrl-B6hM_MHN.js","/assets/vfx-Bljksniy.js","/assets/video-DkehHSrn.js","/assets/wallet-BOxAg-Zz.js","/assets/warehouse-DJsWFg4-.js","/assets/workflow-E4LeJVhe.js","/assets/x-DWrsbnSl.js","/assets/zap-CHpOa7Bf.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
