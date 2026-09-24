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

const BUILD = "2026-09-24T05:19:20.435Z";
const PRECACHE = ["/","/assets/AdminPanel-DDAjviio.js","/assets/AnalysisBoard-DJoYpkgv.js","/assets/Arc-DRGbPEqV.js","/assets/AttendanceModal-D_UPzLJo.js","/assets/BrigadirProfile-tViELZ3W.js","/assets/BroadcastReceivers-BQZlcke_.js","/assets/BroadcastRecord-BKlwxx0C.js","/assets/CatLockNotice-CaBHRElV.js","/assets/CategoryLegendModal-DAmFaxtQ.js","/assets/CellConcerns-gMODpsvK.js","/assets/CellDetails-9z9NjtBP.js","/assets/CellFormModal-BTEy1Apt.js","/assets/CellLink-fXOlrtRv.js","/assets/Cells-DNE2_0nQ.js","/assets/ColumnFilter-hCXPtPcu.js","/assets/ColumnsPicker-aa3sQ9Ha.js","/assets/CommentsModal-BEkXljvn.js","/assets/ComparisonTable-Cq6wGeCp.js","/assets/Concerns-BGRhGOol.js","/assets/ConfirmDialog-BMQ3avI2.js","/assets/Daily-BZv5poTO.js","/assets/DataTable-CenPYXiC.js","/assets/DateRangePicker-CoA7xeyg.js","/assets/DayReportView-B5fPfA4z.js","/assets/DayStepper-CRnsppEo.js","/assets/DifferenceBreakdown-DGFgDXAu.js","/assets/Downtime-B-WFkXWk.js","/assets/Education-DyxeL0gp.js","/assets/EducationLesson-BCM4ZGdp.js","/assets/EmptyState-CmZwlyjv.js","/assets/FactorySelect-CSm3ghzP.js","/assets/FormField-CBpImF0M.js","/assets/Gamification-Cco_1gFx.js","/assets/GroupBadge-DHEJ184T.js","/assets/HeatmapChart-D0JtOwAl.js","/assets/IdleCell-DnXmwS3V.js","/assets/KPICard-BC66oDpu.js","/assets/Kaizen-D-d5OvHB.js","/assets/KpiDeltaCard-DGtRlSwr.js","/assets/LangTextInput-B27DWCNC.js","/assets/Layout-DdtgH2EZ.js","/assets/LeaderDayReport-C4zpDm3z.js","/assets/LeaderUnitReport-CI6pyJGl.js","/assets/Leaderboard-BfAY0Ss5.js","/assets/Leaders-DB6hhn9t.js","/assets/LiveOverview-BRwUCgcI.js","/assets/Login-BV_NRdln.js","/assets/NotFound-CMHYA0Ln.js","/assets/Overview-Ct9CUDiv.js","/assets/Pagination-C-8gpRbP.js","/assets/PerenaladkaFactTable-Dvg-JcKj.js","/assets/PlanFulfillment-D8-CWXeX.js","/assets/Production-DulBVI6X.js","/assets/Profile-mxXjBiuA.js","/assets/ProofCamera-DkLwkDVU.js","/assets/Quality-Czyr59zD.js","/assets/RichTextEditor-COILG633.js","/assets/SearchInput-BZRWfbBC.js","/assets/SeasonalityHeatmap-H08-YCrQ.js","/assets/SegmentedToggle-0ZqUxsmV.js","/assets/SetupTimes-1zqZ75nz.js","/assets/ShiftDaily-DxTFX31Q.js","/assets/Skeleton-Ctucgglj.js","/assets/Staff-WFPpwf6g.js","/assets/StatusBadge-D_Fd91Im.js","/assets/StyledSelect-yuooGEHR.js","/assets/Targets-D-j9dM75.js","/assets/Tasks-BHWB_X12.js","/assets/TimeField-D5NS1zi5.js","/assets/TimeWheelPicker-7ocKFCcq.js","/assets/Toast-Dr6HtwNk.js","/assets/Tooltip-Bg_rIF7o.js","/assets/TrendChart-C3tyMPpH.js","/assets/TripleSpeedometer-CJq2_MTL.js","/assets/Trudoyomkost-Cn9qfXoN.js","/assets/UsersActivity-DrQIxHrc.js","/assets/WatchProgress-BALPo7lu.js","/assets/WebLogin-nKusXcvN.js","/assets/WorkerConcerns-DmjNnbh5.js","/assets/Workers-CNN0hEzL.js","/assets/Zagruzka-DJ6kp2c-.js","/assets/ZagruzkaCell-CdUChsOZ.js","/assets/alarm-clock-CXrl1RJG.js","/assets/api-C2DXxF1X.js","/assets/archive-BUkEtT8F.js","/assets/archive-restore-CS1M2JVI.js","/assets/arrow-down-C_SjWdx_.js","/assets/arrow-left-BFQitQdj.js","/assets/arrow-left-right-PYXlozJT.js","/assets/arrow-right-sXKvHETb.js","/assets/arrow-up-CTJbecMF.js","/assets/arrow-up-right-dhYfBl2o.js","/assets/award-C7GLG4WB.js","/assets/ban-Rlh_LJtv.js","/assets/bot-Cmc2Ongf.js","/assets/boxes-iVvg6Wrk.js","/assets/brigadirFilters-BkKXDEmf.js","/assets/broadcastTree-Dg-4fPyj.js","/assets/building-2-CqnebE00.js","/assets/calendar-CB--uuoE.js","/assets/calendar-clock-BTYAJ9By.js","/assets/calendar-days-DzgtYhSG.js","/assets/calendar-range-BknI0MhK.js","/assets/camera-CTltjj-M.js","/assets/categories-oyo8abA9.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BBcwABd7.js","/assets/chart-line-9cl-JFr5.js","/assets/chart-pie-C_eaN10t.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-7VnYto_V.js","/assets/check-check-CphlEkqt.js","/assets/check-zqkpeEgJ.js","/assets/chevron-left-UOK2AQmI.js","/assets/chevrons-up-down-B-wNEN2q.js","/assets/circle-dashed-BTBPwPX8.js","/assets/circle-dot-Cgft33zi.js","/assets/circle-minus-Dj87XFte.js","/assets/circle-slash-B6DE6kSY.js","/assets/circle-user-round-BmoJxH3o.js","/assets/coins-DlmAtMlz.js","/assets/compass-Bxci3Z56.js","/assets/concernCategories-ByonZnSL.js","/assets/copy-b0aQWGJN.js","/assets/corner-down-right-NtNW_xU_.js","/assets/createLucideIcon-CGit-_N8.js","/assets/exportXlsx-C6HuL7tb.js","/assets/external-link-BVu8a09A.js","/assets/file-clock-Nl2ejDPd.js","/assets/file-spreadsheet-CC-GRso3.js","/assets/file-text-pm4GB_fs.js","/assets/flag-DFgh0wi9.js","/assets/flame-OrS5fZwk.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BjvgQXTR.js","/assets/funnel-wawLSrSW.js","/assets/hash-VquU9Htc.js","/assets/history-nBEFHCdJ.js","/assets/hourglass-BefMrvqb.js","/assets/image-583yGh5n.js","/assets/image-off-CtgHX3Zi.js","/assets/index-CFtUD6Kq.js","/assets/index-ftrCYFhP.css","/assets/keyboard-D_y5JFrz.js","/assets/languages-Bc0iRK8O.js","/assets/layers-Giq2L5-U.js","/assets/leaderReason-ByquU-cR.js","/assets/lightbulb-CqVBooFw.js","/assets/link-2-DDlSBeYp.js","/assets/list-checks-CuK0oZfN.js","/assets/list-ordered-CVkDQVp5.js","/assets/lock-open-C-wXJ2Lg.js","/assets/log-in-WM_u6rOH.js","/assets/message-square-BgbBHKrh.js","/assets/minimize-2-DpgRnjax.js","/assets/minus-BoEgNawL.js","/assets/paperclip-Dne00_C4.js","/assets/pencil-C5b1Exb2.js","/assets/pencil-line-Cc2eW61i.js","/assets/personName-B4KId4zS.js","/assets/pin-CsQkKPMr.js","/assets/play-owKFyAvR.js","/assets/presentation-TiPLjzcf.js","/assets/prop-types-D1O1Ftyq.js","/assets/radio-Cmplzu7t.js","/assets/react-apexcharts.esm-Dak3q9Jb.js","/assets/refresh-cw-CegZg_O8.js","/assets/repeat-BmKRPt26.js","/assets/rotate-ccw-C81Fk10d.js","/assets/rotate-cw-Bw2dqCmr.js","/assets/save-B51igJtQ.js","/assets/scale-BTgQdwAk.js","/assets/scroll-text-C9nNnGxY.js","/assets/search-x--B1gPSlq.js","/assets/segments-DQ6RPTWV.js","/assets/send-9wCrUXxV.js","/assets/settings-2-DDfNJI25.js","/assets/shield-Bx85YPAi.js","/assets/shield-alert-DIitkQl0.js","/assets/shield-check-5TJwhDSh.js","/assets/shield-question-mark-Dn6gfPNj.js","/assets/siren-QVnt5yt9.js","/assets/smartphone-D52cwgXz.js","/assets/snowflake-CeKAGyaO.js","/assets/square-2xvDK7ax.js","/assets/square-check-big-Cxbci2WF.js","/assets/star-DntUWkK4.js","/assets/statusBands-C-S8GLj0.js","/assets/table-2-B1sctJiV.js","/assets/tag-yqslBlac.js","/assets/trash-2-gdolwOi-.js","/assets/trending-down-Da4mvEd5.js","/assets/trending-up-GATZjAuy.js","/assets/undo-2-CgrI5zbt.js","/assets/useChartTheme-BE2hfh5V.js","/assets/useElementWidth-B6rSlyB1.js","/assets/useIsMobile-BYC4AAR3.js","/assets/useMutation-DRC1n8os.js","/assets/useStatusBands-DGJVBp2g.js","/assets/user-check-DDJzZBJD.js","/assets/user-cog-B3AOavRi.js","/assets/user-minus-ChtprK4K.js","/assets/users-CbpXu7LR.js","/assets/verifyState-BN7q9wUF.js","/assets/video-PK5rS6Qp.js","/assets/warehouse-U0HlqyLI.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
