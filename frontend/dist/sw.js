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

const BUILD = "2026-09-26T08:09:19.521Z";
const PRECACHE = ["/","/assets/AdminPanel-CTLJ5RMR.js","/assets/AnalysisBoard-C1tMevEp.js","/assets/Arc-_WNhfDOT.js","/assets/ArcLegacy-DHsiupdz.js","/assets/AttendanceModal-CdRO2hYn.js","/assets/BrigadirProfile-BTSU_MYY.js","/assets/BroadcastReceivers-XvhJ7umX.js","/assets/BroadcastRecord-CmfaEqwH.js","/assets/CatLockNotice-2_UO8wed.js","/assets/CategoryLegendModal-DAS81-XR.js","/assets/CellConcerns-DdvLAo6B.js","/assets/CellDetails-DQFy-RTz.js","/assets/CellFormModal-zDbNRJsy.js","/assets/CellLink-DRKyw-iC.js","/assets/Cells-CAPm5yw6.js","/assets/ColumnFilter-Dfd_p1nj.js","/assets/ColumnsPicker-571N_1L4.js","/assets/CommentsModal-CQR3QTJ6.js","/assets/ComparisonTable-C9cTxvyp.js","/assets/Concerns-C7T_odpg.js","/assets/ConfirmDialog-EwmcVW1V.js","/assets/Daily-gg1dTtYp.js","/assets/DataTable-3ZG3B6Lp.js","/assets/DateRangePicker-DU8q3UxD.js","/assets/DayReportView-B5usgQDM.js","/assets/DayStepper-Bwfe7vzV.js","/assets/DifferenceBreakdown-CKcOdGk7.js","/assets/Downtime-4oHqDCZL.js","/assets/Education-BCRJGm7x.js","/assets/EducationLesson-zzffFPQb.js","/assets/EmptyState-Bi938Lwj.js","/assets/Exam-BtTG9vTC.js","/assets/FactorySelect-DlYHlOWi.js","/assets/Gamification-CNLxj9kk.js","/assets/GroupBadge-cZ89TiuI.js","/assets/HeatmapChart-CjTmsIiD.js","/assets/IdleCell-C38_qVwX.js","/assets/KPICard-fWWu89OW.js","/assets/Kaizen-CiF-sfG7.js","/assets/KpiDeltaCard-ekLvl0ln.js","/assets/LangTextInput-CruZw_Ei.js","/assets/Layout-CPP5B6zJ.js","/assets/LeaderDayReport-B2rrWE-0.js","/assets/LeaderUnitReport-CSUakLmy.js","/assets/Leaderboard-WeuUa_W1.js","/assets/Leaders-B6hHRM_P.js","/assets/LiveOverview-CFY24lfr.js","/assets/Login-DIG9LqGP.js","/assets/NotFound-BCwhSaC4.js","/assets/Overview-KwacFWpJ.js","/assets/Pagination-ljIyasc7.js","/assets/PerenaladkaFactTable-BSILHKBR.js","/assets/PlanFulfillment-BGRrftde.js","/assets/Production-DJa-FMf8.js","/assets/Profile-DbaRbnDZ.js","/assets/ProofCamera-9K4CcDLp.js","/assets/Quality-B4KQEzko.js","/assets/RequestStateChip-CL4uBq93.js","/assets/RichTextEditor-wg5zOH7N.js","/assets/SearchInput-CLLN6QWx.js","/assets/SeasonalityHeatmap-CS-U2orB.js","/assets/SegmentedToggle-BNceHeox.js","/assets/SetupTimes-CWTUZXS2.js","/assets/ShiftDaily-Dh7pPbFK.js","/assets/Staff-CYk0Ziim.js","/assets/StatusBadge-BvIaszNC.js","/assets/Targets-Ci5mv7-U.js","/assets/Tasks-KaZJW-77.js","/assets/TimeWheelPicker-BUC6oPIU.js","/assets/Tooltip-BHjx2e3k.js","/assets/TrendChart-CIYVGKd9.js","/assets/TripleSpeedometer-Djsiud-s.js","/assets/Trudoyomkost-Codo01r3.js","/assets/UsersActivity-BeFMtbet.js","/assets/WatchProgress-D-gzcrSY.js","/assets/WebLogin-CqgEmkhD.js","/assets/WorkerConcerns-Y2sxtADW.js","/assets/Workers-CyjtPAt5.js","/assets/Zagruzka-CH0J3jDU.js","/assets/ZagruzkaCell-Dynlqsnb.js","/assets/alarm-clock-BIMplaLs.js","/assets/api-DHa8eh41.js","/assets/archive-DR61s8AK.js","/assets/archive-restore-DQ6jaNcR.js","/assets/arrow-down-B0f8QqiB.js","/assets/arrow-left-C1k57_sL.js","/assets/arrow-left-right-BCM8xVEj.js","/assets/arrow-up-7FOgXNFY.js","/assets/arrow-up-right-DzVyDtZO.js","/assets/award-Dxv57r76.js","/assets/ban-DaCK2hjS.js","/assets/bot-DZL7pgab.js","/assets/boxes-xG_TsH0k.js","/assets/brigadirFilters-DRoJfZAT.js","/assets/broadcastTree-ngvi1bTx.js","/assets/building-2-BIh2gEab.js","/assets/calendar-1b0plJIJ.js","/assets/calendar-clock-CpZzEZgG.js","/assets/calendar-days-fjL-U8-s.js","/assets/calendar-range-hdQ_FsTt.js","/assets/camera-COEVS2Ct.js","/assets/categories-D1sNMF1C.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-p5ltgxa0.js","/assets/chart-line-C-3FEVX8.js","/assets/chart-pie-BvxGDAEL.js","/assets/chartRange-BnuayyHp.js","/assets/check-check-BmeRC698.js","/assets/chevron-left-C4I6dtNH.js","/assets/chevrons-up-down-DYhUyrGp.js","/assets/circle-check-big-TLGMABks.js","/assets/circle-dashed-BjKt9kE9.js","/assets/circle-dot-CMjyqIfL.js","/assets/circle-minus-pQSz7OJx.js","/assets/circle-slash-ZOAf1x5S.js","/assets/circle-user-round-WQc6wJF-.js","/assets/coins-RH3JxOjA.js","/assets/compass-UFVp5_Fp.js","/assets/concernCategories-F7poCEo3.js","/assets/copy-BhxZhSmH.js","/assets/corner-down-right-Bd3KJ7H2.js","/assets/createLucideIcon-CNA5NaWk.js","/assets/exportXlsx-59E3jCOO.js","/assets/external-link-BXq5yvv_.js","/assets/file-clock-CF8JL45e.js","/assets/file-exclamation-point-BIBqsBAs.js","/assets/file-spreadsheet-BGK2g8lC.js","/assets/file-text-BkB3jw75.js","/assets/flag-Wb0rmhnA.js","/assets/flame-D9UnlaIy.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CaeZx5KL.js","/assets/hash-Dl0L54lF.js","/assets/history-CKnanqAH.js","/assets/hourglass-BcFQ-wCG.js","/assets/image-DdNUilAC.js","/assets/image-off-tZx1XA9L.js","/assets/index-BTZsppTH.css","/assets/index-DBsaUcwt.js","/assets/key-round-C6NI85pn.js","/assets/keyboard-CGP9Zz9O.js","/assets/languages-DowCwKHU.js","/assets/layers-D5vxSP1C.js","/assets/leaderReason-B1XNIIWf.js","/assets/lightbulb-BiOOh4-1.js","/assets/link-2-CXfURX1l.js","/assets/list-checks-V2OhSX47.js","/assets/list-ordered-CFy10z8u.js","/assets/list-tree-B8rlNXKM.js","/assets/lock-open-ByYr-8m-.js","/assets/log-in-0Q66pYmI.js","/assets/message-square-BmVse9bB.js","/assets/minimize-2-Dlpo-5ka.js","/assets/package-check-mmPGg-Hs.js","/assets/paperclip-CnUPK5Tq.js","/assets/pencil-D49aa1Hc.js","/assets/personName-B4KId4zS.js","/assets/pin-CD-CigUM.js","/assets/play-Cwou4XkM.js","/assets/presentation-DdCMIcFs.js","/assets/prop-types-mxB-y-gc.js","/assets/radio-YAFFJyj3.js","/assets/react-apexcharts.esm-D-bOy6AT.js","/assets/repeat-Dx7mRFux.js","/assets/rotate-ccw-C84IClKE.js","/assets/rotate-cw-Bsc2bKzN.js","/assets/save-dM4owsPa.js","/assets/scale-qM_K1CBa.js","/assets/scroll-text-BnBm2XNL.js","/assets/search-x-C-gcsmIM.js","/assets/segments-D-NpXDV3.js","/assets/send-Bv1vFcbW.js","/assets/settings-2-BzDx1r4t.js","/assets/shield-TyFSOQmj.js","/assets/shield-alert-DpvLODWb.js","/assets/shield-check-ClsnxKC_.js","/assets/shield-question-mark-CbiHBOIk.js","/assets/siren-CrC8cAkb.js","/assets/smartphone-Bz8ZsTHM.js","/assets/snowflake-CdaseVQb.js","/assets/square-DlZ1SM-x.js","/assets/square-check-big-BDRrAHYq.js","/assets/star-DpelOd4F.js","/assets/statusBands-xrYaSbmY.js","/assets/store-BIujz2SN.js","/assets/table-2-bcDUkbA_.js","/assets/tag-BBQ5eTDl.js","/assets/trending-down-C_9bgtwj.js","/assets/trending-up-BrESKGvE.js","/assets/triangle-alert-DIjP6uCL.js","/assets/undo-2-BeWUnaNq.js","/assets/useChartTheme-25BgTnHb.js","/assets/useElementWidth-dGy7Mc8Q.js","/assets/useIsMobile-4uwPh7fU.js","/assets/useMutation-CsZl7RDu.js","/assets/useStatusBands-QIdxzdG1.js","/assets/user-DTdbGaAf.js","/assets/user-check-DTg5PZVx.js","/assets/user-cog-CyZ5J0Fz.js","/assets/user-minus-CzFoVs2E.js","/assets/users-dhnOr_NI.js","/assets/verifyState-BFMycaDb.js","/assets/video-CjS_BuzL.js","/assets/warehouse-DBpwdlIe.js","/assets/zap-Cde2UUBU.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
