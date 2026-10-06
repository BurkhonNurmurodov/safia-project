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

const BUILD = "2026-10-06T17:42:26.975Z";
const PRECACHE = ["/","/assets/AdminPanel-BDqS9aHb.js","/assets/AnalysisBoard-D1xskprC.js","/assets/Arc-CotNNwMO.js","/assets/Assistant-UYb-znk1.js","/assets/BrigadirProfile-BxPnqmT0.js","/assets/BroadcastReceivers-BDHqevXC.js","/assets/BroadcastRecord-CzFRKAcL.js","/assets/Button-Bt3WHS63.js","/assets/CatLockNotice-CVz1wPfP.js","/assets/CategoryLegendModal-Cot3RySk.js","/assets/CellConcerns-DaZp9NKT.js","/assets/CellDetails-DhhDyp62.js","/assets/CellFormModal-D7ljgjTa.js","/assets/CellIdent-CyUHD1UM.js","/assets/CellLink-CYm91dii.js","/assets/Cells-CVL47gOw.js","/assets/ColumnFilter-BGXFvIUe.js","/assets/ColumnsPicker-CYGMbbNE.js","/assets/CommentsModal-CC0akX2x.js","/assets/ComparisonTable-wDZ_j7yu.js","/assets/Concerns-D8HltXH3.js","/assets/Daily-Dbx8PX81.js","/assets/DataTable-CO1ptZy-.js","/assets/DateRangePicker-Cw7dCW8N.js","/assets/DayReportView-DoWXaAi1.js","/assets/DayStepper-Dq1grn9O.js","/assets/DifferenceBreakdown-DV5um2aj.js","/assets/Downtime-B2MC0TAi.js","/assets/Education-DXLycsrg.js","/assets/EducationLesson-b83jU6WZ.js","/assets/EmptyState-B9Ev6GM0.js","/assets/Exam-Bk9WpRB-.js","/assets/FactorySelect-DQkReqMq.js","/assets/Gamification-BR7HZx_I.js","/assets/GroupBadge-B6URA6nP.js","/assets/HeatmapChart-zV9YVolI.js","/assets/IdleCell-d_Ye2lz-.js","/assets/KPICard-Xm3Ld4_-.js","/assets/Kaizen-30P0FB_x.js","/assets/Kelish-DAIDrw1n.js","/assets/KpiDeltaCard--bz4YIwC.js","/assets/LangTextInput-5xh-f10J.js","/assets/Layout-B-mA6u_G.js","/assets/LeaderAppeal-DkIaA62E.js","/assets/LeaderDayReport-K4xv_QmN.js","/assets/LeaderUnitReport-CpbPnsQX.js","/assets/Leaderboard-SGf4InLh.js","/assets/Leaders-nfhqYiqi.js","/assets/Lightbox-ImUIi7eN.js","/assets/LiveOverview-BSdydu2Y.js","/assets/Login-2KrUhNMB.js","/assets/NotFound-DhSJHVZG.js","/assets/Notifications-BdWzhyIq.js","/assets/Overview-Bc6y4TbW.js","/assets/Pagination-BrquWljP.js","/assets/PerenaladkaFactTable-OWGp63ia.js","/assets/PersonCard-CM_EWXjH.js","/assets/PlanFulfillment-Dy2oPKRw.js","/assets/Production-CZeEIlD9.js","/assets/Profile-DWQU31EB.js","/assets/ProofCamera-3ptzZIgp.js","/assets/ProofPhoto-DDFHqiME.js","/assets/Quality-C4CvSKW3.js","/assets/RawRows-D5_FlGIa.js","/assets/RequestStateChip-CC43rLWA.js","/assets/RichTextEditor-C6bm6ZGp.js","/assets/SaveState-CR6Jm20k.js","/assets/SearchInput-C06AAhFv.js","/assets/SeasonalityHeatmap-B-ug_MBs.js","/assets/SegmentedToggle-ChHhPQTi.js","/assets/SetupTimes-iQaR_Ldh.js","/assets/ShiftDaily-Df1cbRlU.js","/assets/Staff-DCzhltz7.js","/assets/StatusBadge-BcS8VfIX.js","/assets/TargetGoal-BYK6F1SA.js","/assets/Targets-CVIJOGsD.js","/assets/Tasks-DRhu6rXn.js","/assets/TimeWheelPicker-DD7uZBm4.js","/assets/Toast-CFoSH0ZU.js","/assets/Tooltip-BHlzrnZE.js","/assets/TrendChart-CU0KqEii.js","/assets/TripleSpeedometer-DP977R1a.js","/assets/Trudoyomkost-YJwNEo4y.js","/assets/Turnover-x0fcof--.js","/assets/UploadDropzone-gc6jJLIp.js","/assets/UsersActivity-CFsAPyQX.js","/assets/VerdictBlock-I7MDvtAU.js","/assets/VfxApiMap-B6KSxnhH.js","/assets/VfxDictionaries-RugOi1Bo.js","/assets/VfxEmployees-CDFO8BJn.js","/assets/VfxHrMoves-C19Rli0v.js","/assets/VfxJobs-C8RHotqM.js","/assets/VfxPhoto-np1vIT7p.js","/assets/VfxShifts-B7rusl0H.js","/assets/VfxState-COQ-1met.js","/assets/VfxTimebooks-D_4CQY2X.js","/assets/VfxTimesheet-DVHgQEHL.js","/assets/WatchProgress-DJ4Da4mO.js","/assets/WebLogin-BH63bqV6.js","/assets/WorkerConcerns-BoFVFybF.js","/assets/Workers-DyO7-5GG.js","/assets/Zagruzka-DUBhaB2a.js","/assets/ZagruzkaCell-BFzmbo-m.js","/assets/api-ABN5oUfz.js","/assets/archive-CAXbpwJX.js","/assets/archive-restore-CyL6QmdH.js","/assets/arrow-down-BcvnF4lq.js","/assets/arrow-up-narrow-wide-CwHv1AZt.js","/assets/award-BFE5NSxB.js","/assets/ban-BBg-6Rbe.js","/assets/boxes-BQi3Qj15.js","/assets/braces-CQtji6AH.js","/assets/brigadirFilters-BgHUhJbU.js","/assets/broadcastTree-C_SwYWk4.js","/assets/building-2-D5SzSsSu.js","/assets/calculator-DKx572xl.js","/assets/calendar-MALiqlBn.js","/assets/calendar-days-DWOfYf15.js","/assets/camera-DyIrmT4d.js","/assets/categories-CInI8Tua.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BHeFj8IX.js","/assets/chart-line-C9FpGwTo.js","/assets/chart-pie-CW93ekja.js","/assets/chartRange-C1m5UjA0.js","/assets/check-check-cpGVHMXx.js","/assets/chevron-left-D9KTGc7b.js","/assets/chevrons-up-down-DszwJ1EQ.js","/assets/circle-CWJ3u5yi.js","/assets/circle-alert-WzXXUYpQ.js","/assets/circle-check-big-T0HPSkLJ.js","/assets/circle-dashed-DMtKPqT5.js","/assets/circle-minus-M5pdD-Az.js","/assets/circle-question-mark-BNWHci7b.js","/assets/circle-slash-DN00KAWt.js","/assets/circle-user-round-CkjCP_DH.js","/assets/clock-3-BsxK9CKr.js","/assets/cloud-off-L5Fh0x3z.js","/assets/cloud-upload-BBXXKNAd.js","/assets/compass-BoAPW2bO.js","/assets/concernCategories-BZlvhhrv.js","/assets/copy-BFc5i9sx.js","/assets/corner-down-right-DdY0vhKx.js","/assets/createLucideIcon-CEo1O5TK.js","/assets/es-C11FCFlt.js","/assets/external-link-I8lrsa2m.js","/assets/file-clock-D6hgI9lZ.js","/assets/file-exclamation-point-Dz3XebJr.js","/assets/flag-DF-MNDq-.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-_9sxBFUV.js","/assets/hash-DDMWSfCJ.js","/assets/hourglass-DDydjucU.js","/assets/image-BDPGwx-o.js","/assets/image-off-BMnEiYjB.js","/assets/inbox-CQ-bp8r3.js","/assets/index-BYLu8eK_.css","/assets/index-sKeL3w4C.js","/assets/keyboard-DuezVJ5h.js","/assets/languages-CWVzggnU.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BGZYO3jD.js","/assets/lightbulb-D97v0hD8.js","/assets/link-2-D4g3qvRi.js","/assets/link-2-off-JKuWRSwH.js","/assets/list-ordered-CMQYMUvh.js","/assets/list-tree-CsnbWLMD.js","/assets/lock-open-okxsgrBS.js","/assets/log-in-sr3iZ7zt.js","/assets/minimize-2-C1Fne3Dm.js","/assets/package-check-BcFCyslR.js","/assets/pencil-BQxOe3YO.js","/assets/percent-oKS4rgkz.js","/assets/pin-C4gUOwwH.js","/assets/pin-off-_M7SQKCn.js","/assets/play-COQ1-H2x.js","/assets/plug-zap-C8nMRnXv.js","/assets/prop-types-vgkLI0q5.js","/assets/radio-BwRFS47J.js","/assets/react-apexcharts.esm-x135z-79.js","/assets/registers-D8wBjHn7.js","/assets/repeat-D2l7upmN.js","/assets/rotate-cw-DsBknKuD.js","/assets/save-CH0j8MVG.js","/assets/scopeLinks-CN68xTu-.js","/assets/scroll-text-B0v_xGhW.js","/assets/search-x-VfRhvDlA.js","/assets/segments-CWTqE_L3.js","/assets/send-B773f-XA.js","/assets/settings-2-Bl_qHwXo.js","/assets/shield-PVxgkCR9.js","/assets/shield-alert-BE5comaN.js","/assets/shield-question-mark-CbTkPPO7.js","/assets/siren-wYxu7wqx.js","/assets/snowflake-D12RQAO7.js","/assets/split-B9viPPRB.js","/assets/square-check-big-DkOJiJnA.js","/assets/star-LCs1Mk02.js","/assets/statusBands-VZPjEMKi.js","/assets/store-RGQpqO3Z.js","/assets/table-2-DB0tmjvU.js","/assets/table-properties-BSCI2x9l.js","/assets/tag-RcAC4SB8.js","/assets/timer-off-DrCpBB8Y.js","/assets/trending-down-Dsd-d_sH.js","/assets/trending-up-DSc7j42k.js","/assets/undo-2-BOsKnFjK.js","/assets/useChartTheme-BVAiga4L.js","/assets/useElementWidth-Bm_5LdFw.js","/assets/useIsMobile-9miMMDY-.js","/assets/useOpenParam-LvwA_srQ.js","/assets/useStatusBands-CiR9d2wN.js","/assets/useUrlScope-DzRT4DQQ.js","/assets/user-Rea3S71a.js","/assets/user-cog-j1gS4us7.js","/assets/users-Bq5eyK8Z.js","/assets/vfx-CThR5Ttj.js","/assets/video-a7tGbHq8.js","/assets/wallet-BscDDUwp.js","/assets/warehouse-CglUKmT5.js","/assets/x-Bq0mz1Jf.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
