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

const BUILD = "2026-09-19T19:09:24.469Z";
const PRECACHE = ["/","/assets/AdminPanel-B7Y-lXuL.js","/assets/AnalysisBoard-CpNfPXEh.js","/assets/Arc-Cc19VYlr.js","/assets/AttendanceModal-B1nUDyd2.js","/assets/BrigadirProfile-DZ8TTeOt.js","/assets/BroadcastReceivers-Nz2d4UXD.js","/assets/BroadcastRecord-Db8ipvG7.js","/assets/CatLockNotice-Dgjzaa5G.js","/assets/CategoryLegendModal-C3uiAGn0.js","/assets/CellConcerns-CyBVfoGD.js","/assets/CellDetails-BgxQV_CA.js","/assets/CellFormModal-DQqpuLaO.js","/assets/CellLink-BLIg2mTj.js","/assets/Cells-LOHWs8j2.js","/assets/ColumnFilter-AngfswCa.js","/assets/ColumnsPicker-qVnHSrYQ.js","/assets/CommentsModal-DV9Qu3YO.js","/assets/ComparisonTable-DDFRG_ck.js","/assets/Concerns-B7vrU8fT.js","/assets/ConfirmDialog-D20hlV22.js","/assets/Daily-DlFCI3vl.js","/assets/DataTable-T-4UfR9w.js","/assets/DateRangePicker-BP6rdC9I.js","/assets/DayReportView-CHVBDcHc.js","/assets/DayStepper-BcTAagUn.js","/assets/DifferenceBreakdown-CJKh3DKb.js","/assets/Downtime-B7BgYLBe.js","/assets/Education-BM40MNOR.js","/assets/EducationLesson-Xj8MgHV4.js","/assets/EmptyState-RNX9fb3n.js","/assets/FactorySelect-B96r49ey.js","/assets/FormField-BwaHkYHo.js","/assets/Gamification-C9iTIC-T.js","/assets/GroupBadge-Ys8S0zIt.js","/assets/HeatmapChart-BZi_3iiG.js","/assets/IdleCell-1ar7pC_u.js","/assets/KPICard-BrA1K7O7.js","/assets/Kaizen-DN-KOPFB.js","/assets/KpiDeltaCard-ChBv-ptq.js","/assets/LangTextInput-DToSMjfG.js","/assets/Layout-yONSX_si.js","/assets/LeaderDayReport-CvwXkpSq.js","/assets/LeaderUnitReport-DAEhvnE6.js","/assets/Leaderboard-Dkal3LAV.js","/assets/Leaders-CL089vMc.js","/assets/LiveOverview-82JPDx-l.js","/assets/Login-CQh-D3Pi.js","/assets/NotFound-Cr4zH2vN.js","/assets/Overview-lHXig-b2.js","/assets/Pagination-CDc9AKKp.js","/assets/PerenaladkaFactTable-DR1QCoza.js","/assets/PlanFulfillment-D6E7KlhW.js","/assets/Production-CEEcYY3g.js","/assets/Profile-CAGA-b7S.js","/assets/ProofCamera-W65hJXx6.js","/assets/ProofPhoto-BMA8IBKR.js","/assets/Quality-feCCW0ai.js","/assets/RichTextEditor-rj7LiZgc.js","/assets/SearchInput-8yk_wc7V.js","/assets/SeasonalityHeatmap-Cjnm5oJJ.js","/assets/SegmentedToggle-t75dR3iI.js","/assets/SetupTimes--SRvgdu6.js","/assets/ShiftDaily-B5RpJFAo.js","/assets/Skeleton-BtzQ3Got.js","/assets/Staff-CCq7oZ7o.js","/assets/StatusBadge-SQ_nRkqQ.js","/assets/StyledSelect-DUCLiI-D.js","/assets/Tasks-DgDaOO3P.js","/assets/TimeField-CiOWyUaV.js","/assets/TimeWheelPicker-B8wzkKJ-.js","/assets/Toast-JOpdMNE9.js","/assets/Tooltip-BLnf8N-R.js","/assets/TrendChart-C8G9EAml.js","/assets/TripleSpeedometer-Ck_BNioG.js","/assets/Trudoyomkost-B4aOvAnq.js","/assets/UsersActivity-DxniJqor.js","/assets/WatchProgress-KYd_Doqi.js","/assets/WebLogin-BOh7n2gH.js","/assets/WorkerConcerns-CAh3fPjQ.js","/assets/Workers-jRMPwiMg.js","/assets/Zagruzka-BANzOahF.js","/assets/ZagruzkaCell-DUc3veOD.js","/assets/alarm-clock-CoyFyrAd.js","/assets/api-BKx7cAwy.js","/assets/archive-BHAgYrmG.js","/assets/archive-restore-CxHnpBEm.js","/assets/arrow-down-ggfzxiRP.js","/assets/arrow-left-BhXS-GGN.js","/assets/arrow-left-right-B5kvcXSi.js","/assets/arrow-right-zuqPIqtC.js","/assets/arrow-up-C5gpkvO7.js","/assets/award-C372yIgL.js","/assets/ban-CQhAZSLx.js","/assets/bot-DlhQkTvX.js","/assets/boxes-w4GbIVGi.js","/assets/brigadirFilters-csYPSPhM.js","/assets/broadcastTree-CtIV35j1.js","/assets/building-2-pgQdt2NL.js","/assets/calendar-XY-kORSR.js","/assets/calendar-clock-BW38J3QF.js","/assets/calendar-days-CJX_bIly.js","/assets/calendar-range-KBQcI-OV.js","/assets/camera-CNxFGWg5.js","/assets/categories-B3TrEhnR.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Wg2ef1h7.js","/assets/chart-line-sFbx9weh.js","/assets/chart-pie-DvI9kgkI.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-DA_y_Lph.js","/assets/check-CVbSSzgN.js","/assets/check-check-OfoX6pzi.js","/assets/chevron-left-CNYLQKLE.js","/assets/chevrons-up-down-DObbtK_D.js","/assets/circle-dot-6SEl_Qcw.js","/assets/circle-minus-DRphJbdF.js","/assets/circle-slash-nYEyaxgo.js","/assets/circle-user-round-CUeVnmxL.js","/assets/compass-Bk4Jg0_B.js","/assets/concernCategories-DDJY-u-4.js","/assets/copy-CCqffeTh.js","/assets/corner-down-right-BytTUZ4E.js","/assets/createLucideIcon-BBhf0S2D.js","/assets/exportXlsx-Ci6QQzu1.js","/assets/external-link-mjQ9cHg3.js","/assets/file-clock-Dh47x4y1.js","/assets/file-spreadsheet-CnoSl7EQ.js","/assets/file-text-BWnPmpfx.js","/assets/flag-CP8uoLOv.js","/assets/flame-BnyIDJlu.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BncXeJGP.js","/assets/funnel-mjdW6E0C.js","/assets/hash-C30BSe82.js","/assets/history-DVtCPdPT.js","/assets/hourglass-CFAZzlcE.js","/assets/image-DSZw-BLN.js","/assets/image-off-Btbs2wB8.js","/assets/index-DwDk0Zxg.js","/assets/index-PYkJVL39.css","/assets/keyboard-CFdxABJ6.js","/assets/languages-BxlzzuZE.js","/assets/layers-CvboUKOR.js","/assets/leaderReason-DW8dIUuy.js","/assets/lightbulb-BbQzNEpj.js","/assets/link-2-CACwsqQY.js","/assets/list-checks-tC9ifrOo.js","/assets/list-ordered-YwxLET6d.js","/assets/lock-open-6qg0m6Ls.js","/assets/log-in-D6eUC9rM.js","/assets/message-square-C_jNKW9Z.js","/assets/minimize-2-BdaxND6R.js","/assets/minus-BURS7hC2.js","/assets/paperclip-CgFMUE_V.js","/assets/pencil-DAUSPzw-.js","/assets/pencil-line-Dh8RcwSJ.js","/assets/personName-B4KId4zS.js","/assets/pin-BLvNg0Cy.js","/assets/play-sZWSDkws.js","/assets/prop-types-Bn8atY9z.js","/assets/radio-CkynbZk_.js","/assets/react-apexcharts.esm-DOEYkucQ.js","/assets/refresh-cw-BAYf7KZo.js","/assets/repeat-C6AVhvku.js","/assets/rotate-ccw-xualhUE4.js","/assets/rotate-cw-Dqfr6ZZl.js","/assets/save-Bvls6IFI.js","/assets/scale-BraGP3LF.js","/assets/scroll-text-5wfDoJAT.js","/assets/search-x-B2_GOgIZ.js","/assets/segments-B-hEnwz_.js","/assets/send-omyMV7TF.js","/assets/settings-2-MoY7xQIQ.js","/assets/shield-BLg8Q9XN.js","/assets/shield-alert-DKpY0E9U.js","/assets/shield-check-CuCcGV5Z.js","/assets/shield-question-mark-CNZQjnOP.js","/assets/siren-kOMEawPU.js","/assets/smartphone-DiKxzAk4.js","/assets/snowflake-GdGmDODo.js","/assets/star-BZVf2FqC.js","/assets/statusBands-BeRXZNa8.js","/assets/table-2-BQUgIrYN.js","/assets/tag-ChcS8JKO.js","/assets/trash-2-BmMSm7j8.js","/assets/trending-down-B4ovP82U.js","/assets/trending-up-Bpf04zxw.js","/assets/undo-2-x8jcaEWG.js","/assets/useChartTheme-I0QSWCxP.js","/assets/useElementWidth-kgw-PbU9.js","/assets/useIsMobile-C8HESoom.js","/assets/useMutation-CKxo-aqP.js","/assets/useStatusBands-BjNipiTu.js","/assets/user-check-wusF2wPb.js","/assets/user-cog-DROUi5f7.js","/assets/user-minus-D72-t0TS.js","/assets/users-D-J_-luF.js","/assets/verifyState-BImPTEW2.js","/assets/video-CwikoLKT.js","/assets/warehouse-CW40tCSq.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
