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

const BUILD = "2026-09-21T05:19:24.358Z";
const PRECACHE = ["/","/assets/AdminPanel-BJ7ZtFda.js","/assets/AnalysisBoard-DY8UfNA6.js","/assets/Arc-BY_dSC3u.js","/assets/AttendanceModal-DcyYy4xe.js","/assets/BrigadirProfile-Nk2J8Gjp.js","/assets/BroadcastReceivers-BvbdpVP8.js","/assets/BroadcastRecord-De9Eoqzk.js","/assets/CatLockNotice-ByHguQo6.js","/assets/CategoryLegendModal-BowxcVjM.js","/assets/CellConcerns-BugcKzw3.js","/assets/CellDetails-CD6DFey5.js","/assets/CellFormModal-Cn1bBOui.js","/assets/CellLink-4XSxaJAB.js","/assets/Cells-DGxQmgiA.js","/assets/ColumnFilter-DldrpMh8.js","/assets/ColumnsPicker-DCVaL4mb.js","/assets/CommentsModal-BKl6WQk4.js","/assets/ComparisonTable-DO2MvAA4.js","/assets/Concerns-B5JwN6Da.js","/assets/ConfirmDialog-PHvVmR5u.js","/assets/Daily-DcT2AWTm.js","/assets/DataTable-CdivfQxN.js","/assets/DateRangePicker-BbBEEPKD.js","/assets/DayReportView--iDOeQyS.js","/assets/DayStepper-DzlgUPCW.js","/assets/DifferenceBreakdown-PRw4ZKfT.js","/assets/Downtime-D9IccoVF.js","/assets/Education-C4qoRVKe.js","/assets/EducationLesson-D_qHObeq.js","/assets/EmptyState-1C57CL_-.js","/assets/FactorySelect-9BMbrF46.js","/assets/FormField-BxcZzaZt.js","/assets/Gamification-Ba7j-LjC.js","/assets/GroupBadge-CWrhjC3-.js","/assets/HeatmapChart-BKRci5SZ.js","/assets/IdleCell-Cii4FRsX.js","/assets/KPICard-B_gKSiRS.js","/assets/Kaizen-F79RCs6J.js","/assets/KpiDeltaCard-C7pHOowX.js","/assets/LangTextInput-Bfubw64y.js","/assets/Layout-DHyoyiqE.js","/assets/LeaderDayReport-BMYlrYLf.js","/assets/LeaderUnitReport-C1ky7vLP.js","/assets/Leaderboard-D7of8B7S.js","/assets/Leaders-Cd9nlXNE.js","/assets/LiveOverview-Dh2_sTtw.js","/assets/Login-CKyg12oC.js","/assets/NotFound-DJqbAMae.js","/assets/Overview-DdCPYPJv.js","/assets/Pagination-BhadcpDc.js","/assets/PerenaladkaFactTable-CyrL3zzl.js","/assets/PlanFulfillment-CThSVTKh.js","/assets/Production-B6tWkgyG.js","/assets/Profile-Cm3QWG1F.js","/assets/ProofCamera-BQHEDAvp.js","/assets/Quality-BxrpOfYn.js","/assets/RichTextEditor-BY_ocfrb.js","/assets/SearchInput-Bsrb3Dx5.js","/assets/SeasonalityHeatmap-qxmkHuIV.js","/assets/SegmentedToggle-BufhMOTP.js","/assets/SetupTimes-CjA-EeIa.js","/assets/ShiftDaily-Bv3y9jkW.js","/assets/Skeleton-4mLNcnHP.js","/assets/Staff-B5f3Opwx.js","/assets/StatusBadge-DDEa9-XM.js","/assets/StyledSelect-BUrpc9Dm.js","/assets/Targets-Dm16b6Bb.js","/assets/Tasks-DLbZi4jb.js","/assets/TimeField-C_lsCcuD.js","/assets/TimeWheelPicker-D-Mmt15n.js","/assets/Toast-l0SsD52n.js","/assets/Tooltip-DfrNIBRU.js","/assets/TrendChart-ESS7AKCr.js","/assets/TripleSpeedometer-DW6C9Pgs.js","/assets/Trudoyomkost-Bgz9i2JC.js","/assets/UsersActivity-B1bThx59.js","/assets/WatchProgress-DnAiGfjd.js","/assets/WebLogin-mk317M8p.js","/assets/WorkerConcerns-zsR_tFU4.js","/assets/Workers-grojHMLu.js","/assets/Zagruzka-BLo_tB0Z.js","/assets/ZagruzkaCell-Lbo956Q9.js","/assets/alarm-clock-B4Jt3tFC.js","/assets/api-0XROEXFa.js","/assets/archive-BdXxDcx1.js","/assets/archive-restore-DmYr8Vt2.js","/assets/arrow-down-BGfGUpUU.js","/assets/arrow-left-right-DQYzTOF4.js","/assets/arrow-left-wAi_MuHT.js","/assets/arrow-right-BiuomtQX.js","/assets/arrow-up-BeshLA5O.js","/assets/arrow-up-right-YAQc4QjG.js","/assets/award-DsDU7SR5.js","/assets/ban-po2TYIw_.js","/assets/bot-Cg8equ0f.js","/assets/boxes-B4wn3BEY.js","/assets/brigadirFilters-BaEILsb5.js","/assets/broadcastTree-HXzWqkeR.js","/assets/building-2-CTsHvR0q.js","/assets/calendar-Bg_725o8.js","/assets/calendar-clock-vO7RLV6U.js","/assets/calendar-days-CW0srwa1.js","/assets/calendar-range-Bv3uBeWH.js","/assets/camera-D0EDU2Ro.js","/assets/categories-DNhrWWDp.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D_EEsgzW.js","/assets/chart-line-D1dvjMGC.js","/assets/chart-pie-BX86-x4L.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-zOt9Rgyn.js","/assets/check-1Mjl8ORo.js","/assets/check-check-BFsUkfbN.js","/assets/chevron-left-e-Igz--O.js","/assets/chevrons-up-down-CuoV0M9f.js","/assets/circle-dashed-DCP1D9bc.js","/assets/circle-dot-BLBIs3-P.js","/assets/circle-minus-Bi9egaxE.js","/assets/circle-slash-BznzdaYd.js","/assets/circle-user-round-92guPqNO.js","/assets/coins-Brcy72Kz.js","/assets/compass-CktMDrE6.js","/assets/concernCategories-B8A89_dR.js","/assets/copy-Ov3XJAd3.js","/assets/corner-down-right-DlQWYTve.js","/assets/createLucideIcon-Cpy7aS0S.js","/assets/exportXlsx-BY-__bcj.js","/assets/external-link-EMIcFX9-.js","/assets/file-clock-BzHTLREn.js","/assets/file-spreadsheet-CdoQiJce.js","/assets/file-text-0yNiO3U5.js","/assets/flag-B5BJqpLe.js","/assets/flame-txJzgmmn.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-teBWYxn-.js","/assets/funnel-DCYxafmQ.js","/assets/hash-DyQgWVLh.js","/assets/history-DqPepfxj.js","/assets/hourglass-BQI8ohhl.js","/assets/image-DqmDxvVE.js","/assets/image-off-DS55gKNx.js","/assets/index-BXqTV2jf.css","/assets/index-Bd0ge5Un.js","/assets/keyboard-CGug9vyF.js","/assets/languages-Bq7Rp-EA.js","/assets/layers-CG0oQP07.js","/assets/leaderReason-BMKWcoXn.js","/assets/lightbulb-BZusMJgF.js","/assets/link-2-CkzjN9M3.js","/assets/list-checks-rvzNcc2l.js","/assets/list-ordered-sYqF8EOa.js","/assets/lock-open-BcRS0Ku3.js","/assets/log-in-dESING3e.js","/assets/message-square-1bfFeJzz.js","/assets/minimize-2-CkEIkKhB.js","/assets/minus-B-wvFg8w.js","/assets/paperclip-B37UqgVo.js","/assets/pencil-CimG_wQq.js","/assets/pencil-line-Bl1-y-qF.js","/assets/personName-B4KId4zS.js","/assets/pin-BWl1yAJo.js","/assets/play-DZmN5Rgz.js","/assets/prop-types-D0c7TRwJ.js","/assets/radio-6aPsMU4c.js","/assets/react-apexcharts.esm-ckRKpXsT.js","/assets/refresh-cw-Dg0dGvy0.js","/assets/repeat-w9DKutgc.js","/assets/rotate-ccw-DaCaq1Vv.js","/assets/rotate-cw-DZ0-pvmT.js","/assets/save-A-B5yeAj.js","/assets/scale-CyuGlkuz.js","/assets/scroll-text-CteUC8me.js","/assets/search-x-BROILvXd.js","/assets/segments-BsJ6DDdc.js","/assets/send-BKSwkgSP.js","/assets/settings-2-D17LCvXm.js","/assets/shield-BssMmR9i.js","/assets/shield-alert-UTQX7XBy.js","/assets/shield-check-CTjatOe0.js","/assets/shield-question-mark-K5pWWX5i.js","/assets/siren-D_fX379i.js","/assets/smartphone-ztNmxPK5.js","/assets/snowflake-By43au-w.js","/assets/square-COxjGYWh.js","/assets/square-check-big-DtLPV4U3.js","/assets/star-DpuXkYQx.js","/assets/statusBands-Ch6KreRP.js","/assets/table-2-CTLxLBeJ.js","/assets/tag-CoGtznz4.js","/assets/trash-2-CMvDWN0f.js","/assets/trending-down-Bdznfcjo.js","/assets/trending-up-D5EhI3Jf.js","/assets/undo-2-Bvjpyuqf.js","/assets/useChartTheme-GjtmIeTe.js","/assets/useElementWidth-BPREVnl0.js","/assets/useIsMobile-BzqfwyFt.js","/assets/useMutation-CYU3IUQW.js","/assets/useStatusBands-D1yY__TV.js","/assets/user-check-CZdB7n5Z.js","/assets/user-cog-NwQfcMb0.js","/assets/user-minus-DuK7i85d.js","/assets/users-z9q7pziO.js","/assets/verifyState-sEAc0q7P.js","/assets/video-C6BYit4r.js","/assets/warehouse-KHilP9ct.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
