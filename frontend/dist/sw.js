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

const BUILD = "2026-09-23T07:15:39.769Z";
const PRECACHE = ["/","/assets/AdminPanel-H1dOOxJZ.js","/assets/AnalysisBoard-OjlGBTxb.js","/assets/Arc-DCVt19Xj.js","/assets/AttendanceModal-DsjOaady.js","/assets/BrigadirProfile-DeVYvtx5.js","/assets/BroadcastReceivers-NHwT5Ike.js","/assets/BroadcastRecord-_6f-pn3o.js","/assets/CatLockNotice-Dt2kbZ2F.js","/assets/CategoryLegendModal-BZK_4xGt.js","/assets/CellConcerns-B5wxFDgK.js","/assets/CellDetails-BmUGRNpN.js","/assets/CellFormModal-CBboAvuM.js","/assets/CellLink-DTsDTRKm.js","/assets/Cells-BvPg89Nt.js","/assets/ColumnFilter-DpJMe12e.js","/assets/ColumnsPicker-C0GV3W7w.js","/assets/CommentsModal-BFVLIgOd.js","/assets/ComparisonTable-CqDI5h7p.js","/assets/Concerns--Ks_a5rN.js","/assets/ConfirmDialog-D1kAK4ak.js","/assets/Daily-DPE-f7p3.js","/assets/DataTable-BzEKBM_E.js","/assets/DateRangePicker-Dd8pH7C-.js","/assets/DayReportView-So58mPLn.js","/assets/DayStepper-B6sUcaUX.js","/assets/DifferenceBreakdown-ClBWiqX3.js","/assets/Downtime-BbY_bEqx.js","/assets/Education-D92nbL8Q.js","/assets/EducationLesson-BvCd9KIu.js","/assets/EmptyState-DYmnbcMG.js","/assets/FactorySelect-CpyAmBOW.js","/assets/FormField-D5zGl_ST.js","/assets/Gamification-BIMog93Q.js","/assets/GroupBadge-C0LOehDj.js","/assets/HeatmapChart-UKbBtUPa.js","/assets/IdleCell-DKiL5QUD.js","/assets/KPICard-D6mQwIIZ.js","/assets/Kaizen-BMRKs_n5.js","/assets/KpiDeltaCard-KqYbcUx3.js","/assets/LangTextInput-DkyGfuvm.js","/assets/Layout-D1L1-7B9.js","/assets/LeaderDayReport-BwOsuHR4.js","/assets/LeaderUnitReport-BAp8Oi8i.js","/assets/Leaderboard-BxGLplcf.js","/assets/Leaders-KIsb7lv0.js","/assets/LiveOverview-BsNVOJ4G.js","/assets/Login-Bl1j1K1X.js","/assets/NotFound-2Fa_g3-N.js","/assets/Overview-C0Z-x-h9.js","/assets/Pagination-CCPevknh.js","/assets/PerenaladkaFactTable-QU9FfXR1.js","/assets/PlanFulfillment-DCf-C-mu.js","/assets/Production-zXknhX8y.js","/assets/Profile-BzIdqjTR.js","/assets/ProofCamera-DpdIEQTg.js","/assets/Quality-C9SSCBwK.js","/assets/RichTextEditor-B3blzfwI.js","/assets/SearchInput-cTzTXVM8.js","/assets/SeasonalityHeatmap-Ctlvz_xd.js","/assets/SegmentedToggle-DojQg2O5.js","/assets/SetupTimes-B_U8QYb6.js","/assets/ShiftDaily-CxL_vGKz.js","/assets/Skeleton-qw-BE0vi.js","/assets/Staff-DRKf9xaj.js","/assets/StatusBadge-CoYjVbAx.js","/assets/StyledSelect-B-8CPRPN.js","/assets/Targets-Ceuq1GsI.js","/assets/Tasks-C7GpPv3u.js","/assets/TimeField-lk3dyfie.js","/assets/TimeWheelPicker-bSRTu5RS.js","/assets/Toast-Cavr8Cp-.js","/assets/Tooltip-CQU0CK6I.js","/assets/TrendChart-C1W9XPac.js","/assets/TripleSpeedometer-i7Yq1Xv6.js","/assets/Trudoyomkost-BMc-A4Jl.js","/assets/UsersActivity-Bi5ICW9k.js","/assets/WatchProgress-CpkNFOiv.js","/assets/WebLogin-Djy4n6Sb.js","/assets/WorkerConcerns-B98B0-Ty.js","/assets/Workers-CnTRDDku.js","/assets/Zagruzka-BgZxJSRj.js","/assets/ZagruzkaCell-BQNaSm_p.js","/assets/alarm-clock-DPphsuSs.js","/assets/api-CqnIEhKn.js","/assets/archive-BckKGeB2.js","/assets/archive-restore-C6v_y-0m.js","/assets/arrow-down-CjAxDdwV.js","/assets/arrow-left-DPHoU2IC.js","/assets/arrow-left-right-DQvB9mfd.js","/assets/arrow-right-yvxAm3BM.js","/assets/arrow-up-DdVvJfBR.js","/assets/arrow-up-right-CzTAUuqB.js","/assets/award-Du9dOcW7.js","/assets/ban-c1MehNzP.js","/assets/bot-BSQ3AXzm.js","/assets/boxes-XJJ3tBA4.js","/assets/brigadirFilters-Bbjlm9qe.js","/assets/broadcastTree-CGSBX37w.js","/assets/building-2-CbUpcBcV.js","/assets/calendar-BZ1wKnhj.js","/assets/calendar-clock-CqtrU-8z.js","/assets/calendar-days-BUxfoPXv.js","/assets/calendar-range-i2llzy3d.js","/assets/camera-GFCrulMs.js","/assets/categories-tZt4dTQi.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CPV0HwWp.js","/assets/chart-line-DZoK6_BG.js","/assets/chart-pie-D1uktx7F.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-DHx7Gtpy.js","/assets/check-BtWUY4Ox.js","/assets/check-check-BO-2yb8G.js","/assets/chevron-left-CdLeKqyG.js","/assets/chevrons-up-down-BdDRTMak.js","/assets/circle-dashed-CCNBb0kO.js","/assets/circle-dot-w4w2QYKT.js","/assets/circle-minus-8XaliX8v.js","/assets/circle-slash-DDP2SGVG.js","/assets/circle-user-round-B0_L9VGo.js","/assets/coins-C1NEQX7C.js","/assets/compass-RTJItgPb.js","/assets/concernCategories-CEyRWnW_.js","/assets/copy-CHUJfzvr.js","/assets/corner-down-right-BuB42MnA.js","/assets/createLucideIcon-CuzyjV5C.js","/assets/exportXlsx-CDVhaxQu.js","/assets/external-link-BASTipvL.js","/assets/file-clock-BDxLQ8Ha.js","/assets/file-spreadsheet-8VFO4q6D.js","/assets/file-text-un2sm1WZ.js","/assets/flag-D3XvGp18.js","/assets/flame-R9hCx05q.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DOFrocD3.js","/assets/funnel-D1MfDHRI.js","/assets/hash-eprQBorE.js","/assets/history-D-6yzTUL.js","/assets/hourglass-DrFiaxDv.js","/assets/image-CBHf8_rj.js","/assets/image-off-C4hd2Gn-.js","/assets/index-BHT3L-zH.js","/assets/index-ftrCYFhP.css","/assets/keyboard-eLi7aoYo.js","/assets/languages-DCQX8RVH.js","/assets/layers-DWahGXXe.js","/assets/leaderReason-C3LPzLil.js","/assets/lightbulb-CmhMyLIX.js","/assets/link-2-CLViYB-s.js","/assets/list-checks-BtV7LW7g.js","/assets/list-ordered-DYG3bOpg.js","/assets/lock-open-Doh-_o93.js","/assets/log-in-CFD-6ORk.js","/assets/message-square-BNJNhOOT.js","/assets/minimize-2-btA-eVYv.js","/assets/minus-F5FC2Dw8.js","/assets/paperclip-DI7L-8vp.js","/assets/pencil-BU5IsvJG.js","/assets/pencil-line-Ay4dVk43.js","/assets/personName-B4KId4zS.js","/assets/pin-9UY2ZPje.js","/assets/play-Cccm7C3-.js","/assets/presentation-DIWkM3Tj.js","/assets/prop-types-Bp1YfdaG.js","/assets/radio-9SWTn6Gr.js","/assets/react-apexcharts.esm-wN6VxksJ.js","/assets/refresh-cw-C1vfAZUX.js","/assets/repeat-DHlqGJea.js","/assets/rotate-ccw-CM-grFdW.js","/assets/rotate-cw-C-Lg3-rE.js","/assets/save-BPnsdfTj.js","/assets/scale-CUFEU-TL.js","/assets/scroll-text-eZd8OQ7G.js","/assets/search-x-K6-KISbj.js","/assets/segments-CtKWLYi6.js","/assets/send-BLLejg79.js","/assets/settings-2-BizDLE8H.js","/assets/shield-BunUZPts.js","/assets/shield-alert-MlyTlC74.js","/assets/shield-check-DDm9TPDA.js","/assets/shield-question-mark-BbEtxR2-.js","/assets/siren-DHsXK8HB.js","/assets/smartphone-BfFccoOO.js","/assets/snowflake-Cea4oTVq.js","/assets/square-check-big-ptQoNrUG.js","/assets/square-xzuRe5ob.js","/assets/star-xLO0Zz-j.js","/assets/statusBands-BZbV7U2u.js","/assets/table-2-uMinh3QA.js","/assets/tag-B739Y91q.js","/assets/trash-2-DOAg77D4.js","/assets/trending-down-7Exd_Y4I.js","/assets/trending-up-CzuvkwQg.js","/assets/undo-2-eG1F0E2g.js","/assets/useChartTheme-CM0sc2-t.js","/assets/useElementWidth-4y1tuEgx.js","/assets/useIsMobile-BdfWGJQe.js","/assets/useMutation-Bv0PwBWr.js","/assets/useStatusBands-DEhnE1nF.js","/assets/user-check-zpiUYC47.js","/assets/user-cog-CoA7Ueo9.js","/assets/user-minus-C0xDcUsT.js","/assets/users-Cw92l-Ji.js","/assets/verifyState-NTPCJu3n.js","/assets/video-BaOBfwl7.js","/assets/warehouse-CrsO3Y0c.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
