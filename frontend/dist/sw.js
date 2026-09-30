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

const BUILD = "2026-09-30T05:51:00.817Z";
const PRECACHE = ["/","/assets/AdminPanel-B3_QMx7s.js","/assets/AnalysisBoard-Cnmmm_52.js","/assets/Arc-fXtu26w_.js","/assets/ArcLegacy-DUe-XqSm.js","/assets/AttendanceModal-DwTh9VnH.js","/assets/BrigadirProfile-CFeJEM6o.js","/assets/BroadcastReceivers-CxgYu2qj.js","/assets/BroadcastRecord-dY4O1oTu.js","/assets/CatLockNotice-kGWS3-1H.js","/assets/CategoryLegendModal-D9uRVLkz.js","/assets/CellConcerns-C_nLYDhD.js","/assets/CellDetails-B0192NeE.js","/assets/CellFormModal-DMEoqBxI.js","/assets/CellLink-YSAbJ4kd.js","/assets/Cells-CkNd6zjI.js","/assets/ColumnFilter-DrTt9EX5.js","/assets/ColumnsPicker-CjDVmHhH.js","/assets/CommentsModal-BXP0z-xG.js","/assets/ComparisonTable-B4ClWfGV.js","/assets/Concerns-DEy6wdTf.js","/assets/ConfirmDialog-DOgZiaAT.js","/assets/Daily-B5CWBvqK.js","/assets/DataTable-t5TerWgS.js","/assets/DateRangePicker-DnyL9fXh.js","/assets/DayReportView-b284s-cj.js","/assets/DayStepper-Bq9X8G0t.js","/assets/DifferenceBreakdown-BWi3PGgp.js","/assets/Downtime-Bev6fbRM.js","/assets/Education-BNZ4PnOJ.js","/assets/EducationLesson-BG_ijjHR.js","/assets/EmptyState-a4i4Dvgp.js","/assets/Exam-B1rMPebc.js","/assets/FactorySelect-BGDcLej0.js","/assets/Gamification-B4HyQfYT.js","/assets/GroupBadge-Bo4rK7m3.js","/assets/HeatmapChart-BfYLXrNy.js","/assets/IdleCell-CdhYVXkY.js","/assets/KPICard-CJE_khDR.js","/assets/Kaizen-CZ_6efht.js","/assets/Kelish-6TXP7l2P.js","/assets/KpiDeltaCard-D7J3YJ2V.js","/assets/LangTextInput-CheQtWQ1.js","/assets/Layout-DwGQ6j7Q.js","/assets/LeaderAppeal-BZEyTyQs.js","/assets/LeaderDayReport-F71-CHzT.js","/assets/LeaderUnitReport-C6JgMBfM.js","/assets/Leaderboard-DWylLuR-.js","/assets/Leaders-D2sTe3Ki.js","/assets/Lightbox-0jmXXsj3.js","/assets/LiveOverview-DcDKrdzy.js","/assets/Login-Dn8lL1IH.js","/assets/NotFound-Dj45Ui3r.js","/assets/Overview-bLhdjU8W.js","/assets/Pagination-u7ey9x7T.js","/assets/PerenaladkaFactTable-CTbxM_Nz.js","/assets/PlanFulfillment-BaM5haDW.js","/assets/Production-cEBPcVtq.js","/assets/Profile-BJohn7t6.js","/assets/ProofCamera-DRQuNxUF.js","/assets/ProofPhoto-DpZUqOwc.js","/assets/Quality-DlwhWwJ3.js","/assets/RequestStateChip-h-il9UbK.js","/assets/RichTextEditor-B1Q3dKh-.js","/assets/SaveState-CIKVuXfM.js","/assets/SearchInput-B7stXhdA.js","/assets/SeasonalityHeatmap-BLm9lnxu.js","/assets/SegmentedToggle-Cth_-OSZ.js","/assets/SetupTimes-D9okymKS.js","/assets/ShiftDaily-CBE2WmYk.js","/assets/Staff-1hb-nJgJ.js","/assets/StatusBadge-BWsRmpfN.js","/assets/TargetGoal-6YXbocJc.js","/assets/Targets-xo81bZQA.js","/assets/Tasks-Uc3fEhL1.js","/assets/TimeWheelPicker-BJFJd-7l.js","/assets/Tooltip-C_Or5NHj.js","/assets/TrendChart-CtEC1ZXp.js","/assets/TripleSpeedometer-DaL1exU1.js","/assets/Trudoyomkost-DjxspShw.js","/assets/UploadDropzone-BvbeOxlf.js","/assets/UsersActivity-WXj7QC1s.js","/assets/VerdictBlock-DJFx57KE.js","/assets/WatchProgress-l96EpuH2.js","/assets/WebLogin-BRhfxPJ2.js","/assets/WorkerConcerns-B_kTenU9.js","/assets/Workers-DiYyKRNl.js","/assets/Zagruzka-Ned10YmB.js","/assets/ZagruzkaCell-CaUTMVew.js","/assets/api-CU0aD6xY.js","/assets/archive-DCX9U9Yh.js","/assets/archive-restore-Bu_viHyY.js","/assets/arrow-down-CrjU3vdA.js","/assets/arrow-left-B4pQJlZB.js","/assets/arrow-left-right-Bj5zLgXH.js","/assets/arrow-up-BLxnnXxt.js","/assets/arrow-up-narrow-wide-p5kiQIJW.js","/assets/arrow-up-right-Dpe9bwvS.js","/assets/award-D6ysAAwU.js","/assets/ban-zidSIMF2.js","/assets/bot-B_VU4Qsu.js","/assets/boxes-DyULq1E_.js","/assets/brigadirFilters-qG56fX9M.js","/assets/broadcastTree-Dm_BQn5A.js","/assets/building-2-DVjQd67l.js","/assets/calendar-clock-CkOVyqvx.js","/assets/calendar-days-QJLaUdTf.js","/assets/calendar-lLmYpjxO.js","/assets/calendar-range-Du0SVMQr.js","/assets/camera-Bax5odgS.js","/assets/categories-CV7i9kQs.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BBjtb9el.js","/assets/chart-line-CihWZysq.js","/assets/chart-pie-BHDXE07w.js","/assets/chartRange-CfB4B0hG.js","/assets/chevron-left-AX8gzGxq.js","/assets/chevrons-up-down-DLLQVXq9.js","/assets/circle-BTCEVVmb.js","/assets/circle-check-big-ByZ7ldF4.js","/assets/circle-dot-kruOaady.js","/assets/circle-minus-DKiIKfGi.js","/assets/circle-slash-BusRojkA.js","/assets/circle-user-round-C4Xu_Gm4.js","/assets/cloud-off-DEFxhjLG.js","/assets/cloud-upload-CGEAysxb.js","/assets/compass-OLbqdhbA.js","/assets/concernCategories-CAvDd3aW.js","/assets/copy-Crka1uJf.js","/assets/corner-down-right-h2Jqp-YN.js","/assets/createLucideIcon-S7CaoWCU.js","/assets/es-CMrUYnTm.js","/assets/exportXlsx-Cv-nidcz.js","/assets/external-link-CCWqwrrf.js","/assets/file-clock-DiE-gRfO.js","/assets/file-exclamation-point-D1cfqM4N.js","/assets/file-spreadsheet-DXtj5DIg.js","/assets/file-text-lAtSElYy.js","/assets/flag-C57jPmlc.js","/assets/flame-CFw2dQ51.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BOvzfdHE.js","/assets/hash-BkzQh_VJ.js","/assets/history-1jtCYTKn.js","/assets/hourglass-CS0K5wtp.js","/assets/image-DjgFZSeT.js","/assets/image-off-O5kNyhSQ.js","/assets/index-B8JHyLjE.css","/assets/index-DoKpUmLq.js","/assets/key-round-Do1MWOJm.js","/assets/keyboard-CA1sHdG8.js","/assets/languages-BFFMoSR3.js","/assets/layers-D2c1WCwi.js","/assets/lightbulb-CM-xlxMc.js","/assets/link-2-DlhTyIQx.js","/assets/link-2-off-Cjeba020.js","/assets/list-checks-BmVqfVrv.js","/assets/list-ordered-DSgrEOAP.js","/assets/list-tree-DYQlxmSY.js","/assets/lock-open-4Ue9iw-C.js","/assets/log-in-D6anyN7S.js","/assets/maximize-2-MAnR__4E.js","/assets/message-square-DlFSliWZ.js","/assets/minimize-2-fPNTzoUz.js","/assets/package-check-BYdu4QO7.js","/assets/paperclip-CTOi2Zkh.js","/assets/pencil-C_ezbrO5.js","/assets/percent-CkH0FJqA.js","/assets/personName-CogOuS3K.js","/assets/pin-CtHv4Wx3.js","/assets/pin-off-BR3RzvF9.js","/assets/play-BjcZwN1_.js","/assets/presentation-NwB8E7e0.js","/assets/prop-types-Bmsiu-Dq.js","/assets/radio-Chygl6Tq.js","/assets/react-apexcharts.esm-CN5z_l3p.js","/assets/repeat-CXItnzxs.js","/assets/rotate-ccw-DgwkqJWw.js","/assets/rotate-cw-ChoI4uJP.js","/assets/save-BTr-ZTsK.js","/assets/scale-CWZ-ZlTo.js","/assets/scroll-text-IKZnRLFB.js","/assets/search-x-BkzhlZU_.js","/assets/segments-DTJiItzY.js","/assets/send-Cf2cYskI.js","/assets/settings-2-CJQxMn9C.js","/assets/shield-CBTjYnl-.js","/assets/shield-alert-QNfIXbQ6.js","/assets/shield-check-t20kkv6S.js","/assets/shield-question-mark-BBfzlwSa.js","/assets/siren-z5PQJO4a.js","/assets/snowflake-CG3bg7_d.js","/assets/square-DMij9cBp.js","/assets/square-check-big-D19RJfcF.js","/assets/star-DO--45ie.js","/assets/statusBands-D9wdfg-C.js","/assets/store-Dt1P-otA.js","/assets/table-2-Dxx3BpF0.js","/assets/table-properties-C8au1szf.js","/assets/tag-DxBMTjhp.js","/assets/timer-off-DuoF6G2S.js","/assets/trending-down-D5blxyNV.js","/assets/trending-up-BcpO9frJ.js","/assets/undo-2-BDKtdM38.js","/assets/useChartTheme-DOgCbizr.js","/assets/useElementWidth-Cv56pzzP.js","/assets/useIsMobile-NzguA2Tc.js","/assets/useMutation-Cl1KU77L.js","/assets/useStatusBands-CdJYOWko.js","/assets/user--c4rhfIy.js","/assets/user-cog-DV-g15EP.js","/assets/user-minus-FUNFveVF.js","/assets/users-CUJlLpFF.js","/assets/video-BtnyZuZf.js","/assets/wallet-BCnJKbb7.js","/assets/warehouse-Bdk9ckPh.js","/assets/zap-DsGDpPz7.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
