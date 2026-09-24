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

const BUILD = "2026-09-24T04:43:15.640Z";
const PRECACHE = ["/","/assets/AdminPanel-D0PZyI37.js","/assets/AnalysisBoard-B_mm38oO.js","/assets/Arc-DdwqtYdt.js","/assets/AttendanceModal-BHTE_mhr.js","/assets/BrigadirProfile-C5tar_CE.js","/assets/BroadcastReceivers-CDIqd7Qo.js","/assets/BroadcastRecord-BrN9Jx5L.js","/assets/CatLockNotice-DSsU4kZS.js","/assets/CategoryLegendModal-UeQMS1yy.js","/assets/CellConcerns-YRRLahaT.js","/assets/CellDetails-Yt0YarHm.js","/assets/CellFormModal-DBQS4n7P.js","/assets/CellLink-MmpySdhg.js","/assets/Cells-Bdb6PQk_.js","/assets/ColumnFilter-N2Jab-4o.js","/assets/ColumnsPicker-ClfdilqA.js","/assets/CommentsModal-DGaBeCwd.js","/assets/ComparisonTable-Cm_kgWdm.js","/assets/Concerns-CqWW2JV3.js","/assets/ConfirmDialog-re3kn96q.js","/assets/Daily-daeEVu14.js","/assets/DataTable-DeVgywoB.js","/assets/DateRangePicker-B_6RLUt_.js","/assets/DayReportView-CMGpzrP8.js","/assets/DayStepper-Deuvh_Hz.js","/assets/DifferenceBreakdown-Birz4rD2.js","/assets/Downtime-BOrLulRT.js","/assets/Education-DwFbkbF3.js","/assets/EducationLesson-BVOxjApC.js","/assets/EmptyState-DpfG_8Co.js","/assets/FactorySelect-Dy8HvkNt.js","/assets/FormField-BVXMrm10.js","/assets/Gamification--QF5LWQB.js","/assets/GroupBadge-DCNrXAzb.js","/assets/HeatmapChart-BxyuIj2t.js","/assets/IdleCell-C1bIvLxF.js","/assets/KPICard-Bp4dvetq.js","/assets/Kaizen-DuEApcM3.js","/assets/KpiDeltaCard-B9dkr3Ld.js","/assets/LangTextInput-zty2Ioi6.js","/assets/Layout-CSKXYngy.js","/assets/LeaderDayReport-BqML1397.js","/assets/LeaderUnitReport-CL6BiOyy.js","/assets/Leaderboard-nL0ljUKn.js","/assets/Leaders-B_VqnqVC.js","/assets/LiveOverview-DlnEl2Ae.js","/assets/Login-CqtixKZd.js","/assets/NotFound-CvWxEMVE.js","/assets/Overview-DSwq_umw.js","/assets/Pagination-DFi4vcnC.js","/assets/PerenaladkaFactTable-B7ajxzT6.js","/assets/PlanFulfillment-uJwEQQVk.js","/assets/Production-fEP7tZiE.js","/assets/Profile-Byc2R1Bv.js","/assets/ProofCamera-B6vpDWCZ.js","/assets/Quality-CvgujnCq.js","/assets/RichTextEditor-BeX3bzOG.js","/assets/SearchInput-vrSrmaS7.js","/assets/SeasonalityHeatmap-B827KtiX.js","/assets/SegmentedToggle-D9wdDPdq.js","/assets/SetupTimes-D_dsrSSA.js","/assets/ShiftDaily-CDwN4b0M.js","/assets/Skeleton-Ckd0AWGf.js","/assets/Staff-BBKnUmac.js","/assets/StatusBadge-CwyGB6gm.js","/assets/StyledSelect-C1sCitr8.js","/assets/Targets-6WPs7chE.js","/assets/Tasks-CaNyqwsO.js","/assets/TimeField-BpGzTDj-.js","/assets/TimeWheelPicker-BuPy3QGi.js","/assets/Toast-B1L7Q37D.js","/assets/Tooltip-C9fY-B2-.js","/assets/TrendChart-CTn58r-v.js","/assets/TripleSpeedometer-CRxNxSYR.js","/assets/Trudoyomkost-CGoMvphM.js","/assets/UsersActivity-CirTLjA2.js","/assets/WatchProgress-D9W8N_7Q.js","/assets/WebLogin-C8j462-0.js","/assets/WorkerConcerns-Cv4g-um3.js","/assets/Workers-BnI7Ncen.js","/assets/Zagruzka-D1Q4I56I.js","/assets/ZagruzkaCell-BfJNLCer.js","/assets/alarm-clock-R80uF0Oq.js","/assets/api-BUZ_o2Wm.js","/assets/archive-Ck93_taG.js","/assets/archive-restore-Brj3CYaI.js","/assets/arrow-down-B1hYr0cx.js","/assets/arrow-left-CNaD3xCC.js","/assets/arrow-left-right-Bo4VO3RK.js","/assets/arrow-right-CLkgaR_i.js","/assets/arrow-up-DkbM7pnz.js","/assets/arrow-up-right-cK8_zMY8.js","/assets/award-vQpj0nFY.js","/assets/ban-BdyRiu1x.js","/assets/bot-Bn4CfbbQ.js","/assets/boxes-B8bP_biU.js","/assets/brigadirFilters-BABiEHDG.js","/assets/broadcastTree-cVayi_8v.js","/assets/building-2-CVC22cwT.js","/assets/calendar-Bmhx-FfB.js","/assets/calendar-clock-B-Nle69D.js","/assets/calendar-days-G4pH_Vnw.js","/assets/calendar-range-CkDbr_6m.js","/assets/camera-CcY-S85u.js","/assets/categories-Cnbx-5Tt.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CX2MLEFW.js","/assets/chart-line-DI45nu0r.js","/assets/chart-pie-CIjTCBET.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-TsY7bXgT.js","/assets/check-check-DlZdya5k.js","/assets/check-eOvBW6r5.js","/assets/chevron-left-Bowmcrea.js","/assets/chevrons-up-down-B-hwhD4c.js","/assets/circle-dashed-DlEj5uBm.js","/assets/circle-dot-VJun3vW_.js","/assets/circle-minus-RE4IsAnr.js","/assets/circle-slash--4BKU69D.js","/assets/circle-user-round-BmWGccwq.js","/assets/coins-DGsjD_uE.js","/assets/compass-A_0H354M.js","/assets/concernCategories-D4bVHhH8.js","/assets/copy-CC7X-S-5.js","/assets/corner-down-right-CNG2rvem.js","/assets/createLucideIcon-LUYT0hSc.js","/assets/exportXlsx-B8Og4fTd.js","/assets/external-link-CEMKF54L.js","/assets/file-clock-DNsCsFYJ.js","/assets/file-spreadsheet-BtBHpo8w.js","/assets/file-text-DWT1rbUq.js","/assets/flag-DUc6B8sx.js","/assets/flame-DmN9GX3R.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CWyk70PO.js","/assets/funnel-CAKNtBqy.js","/assets/hash-9m_kbuiW.js","/assets/history-ClqXBYNQ.js","/assets/hourglass-C8s-JrVI.js","/assets/image-BL9-joK6.js","/assets/image-off-D7UuoezQ.js","/assets/index-BS_ZBENe.js","/assets/index-ftrCYFhP.css","/assets/keyboard-D7cTbwlh.js","/assets/languages-xTagMy2i.js","/assets/layers-bpZhy48a.js","/assets/leaderReason-DPDeDjQJ.js","/assets/lightbulb-BGLb-kkr.js","/assets/link-2-Dp2wlReX.js","/assets/list-checks-CbIJIc9P.js","/assets/list-ordered-vZV4m2Nc.js","/assets/lock-open-EaFCvwEv.js","/assets/log-in-aWvTLTap.js","/assets/message-square-Dnbnuozx.js","/assets/minimize-2-OHD-6yD6.js","/assets/minus-CyRVtEcw.js","/assets/paperclip-BCuitt0M.js","/assets/pencil-KrmNAx5C.js","/assets/pencil-line-BBCDA_V4.js","/assets/personName-B4KId4zS.js","/assets/pin-D_MJrACm.js","/assets/play-VzzC5FLD.js","/assets/presentation-DWh0X7bh.js","/assets/prop-types-7nsCSv72.js","/assets/radio-thyUe_TX.js","/assets/react-apexcharts.esm-BqPvxZoB.js","/assets/refresh-cw-DvYBrJ-4.js","/assets/repeat-NQARrdnP.js","/assets/rotate-ccw-W0FNKOi7.js","/assets/rotate-cw-CdNyGKFj.js","/assets/save-CW1pIkRl.js","/assets/scale-Df2osdNG.js","/assets/scroll-text-pvCZs3DB.js","/assets/search-x-D9gOg4OL.js","/assets/segments-a7U0n3p8.js","/assets/send-B6RejBD_.js","/assets/settings-2-DyaKIQqr.js","/assets/shield-CZkxnFy1.js","/assets/shield-alert-DBXCb48b.js","/assets/shield-check-CxrRZviV.js","/assets/shield-question-mark-EUUgMS_8.js","/assets/siren-CgZSpOR2.js","/assets/smartphone-DP6VgUWf.js","/assets/snowflake-BrLryoQ7.js","/assets/square-DIYLPK5p.js","/assets/square-check-big-DEf1Sj5k.js","/assets/star-BGyfIz6F.js","/assets/statusBands-Cs2o-HtU.js","/assets/table-2-CJaHnXdW.js","/assets/tag-CQhkav9m.js","/assets/trash-2-DSPT04PQ.js","/assets/trending-down-Brtenrwb.js","/assets/trending-up-B7FDK52i.js","/assets/undo-2-CG6Nga8-.js","/assets/useChartTheme-5MVmLKzP.js","/assets/useElementWidth-BxCMrbkO.js","/assets/useIsMobile-Czcbjt0g.js","/assets/useMutation-C0FOXMGx.js","/assets/useStatusBands-vX_lCKmP.js","/assets/user-check-UCCYdAqK.js","/assets/user-cog-ClZmLrhT.js","/assets/user-minus-BvusDaWN.js","/assets/users-C4m_63zs.js","/assets/verifyState-D2fZlyBv.js","/assets/video-LXziRATC.js","/assets/warehouse-Bdal75E7.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
