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

const BUILD = "2026-09-20T00:19:34.105Z";
const PRECACHE = ["/","/assets/AdminPanel-CQfu4VZ5.js","/assets/AnalysisBoard-DUspcTvP.js","/assets/Arc-PVRsEg6z.js","/assets/AttendanceModal-Bzh-s3Vr.js","/assets/BrigadirProfile-CFNKu6wM.js","/assets/BroadcastReceivers-BZRS0P11.js","/assets/BroadcastRecord-vQm7CZEX.js","/assets/CatLockNotice-BaqTH7xP.js","/assets/CategoryLegendModal-BVOUxq6P.js","/assets/CellConcerns-BzTblU3E.js","/assets/CellDetails-DiFqjaRd.js","/assets/CellFormModal-Bwfa43UC.js","/assets/CellLink-Bjq_g-3g.js","/assets/Cells-DYe9mtPT.js","/assets/ColumnFilter-RZAJzQrw.js","/assets/ColumnsPicker-DfRvf75i.js","/assets/CommentsModal-B3UVsTzM.js","/assets/ComparisonTable-Oml22jcv.js","/assets/Concerns-BRZ2qnyh.js","/assets/ConfirmDialog-CNMjP2vB.js","/assets/Daily-0pTEyPgd.js","/assets/DataTable-DPxoXLxL.js","/assets/DateRangePicker-Bk4kImIj.js","/assets/DayReportView-B7gPl5Uk.js","/assets/DayStepper-DlqenQ79.js","/assets/DifferenceBreakdown-DhlW8kJO.js","/assets/Downtime-BrDj3kSl.js","/assets/Education-CIEeDEDj.js","/assets/EducationLesson-BdnCEH2n.js","/assets/EmptyState-DQbcBXMU.js","/assets/FactorySelect-Br6ZKPHd.js","/assets/FormField-BwvafzBa.js","/assets/Gamification-Ccnpqowt.js","/assets/GroupBadge-x4bDJKuM.js","/assets/HeatmapChart-CUopUVvH.js","/assets/IdleCell-DCU3kKwY.js","/assets/KPICard-ByjYAWLp.js","/assets/Kaizen-ZenO29OS.js","/assets/KpiDeltaCard-DNMcYUYR.js","/assets/LangTextInput-BaTvyzbG.js","/assets/Layout-BsAHem8l.js","/assets/LeaderDayReport-CnoJGv-w.js","/assets/LeaderUnitReport-D0U5d-xK.js","/assets/Leaderboard-DbulZMsl.js","/assets/Leaders-CYfSDQBf.js","/assets/LiveOverview-CiQ0MAcu.js","/assets/Login-yrr_qHfj.js","/assets/NotFound-CKf_Yl_w.js","/assets/Overview-B4ZoiJdn.js","/assets/Pagination-DHNt51Wg.js","/assets/PerenaladkaFactTable-CPwHs5Ii.js","/assets/PlanFulfillment-BQD1NvMk.js","/assets/Production-rX1UQ884.js","/assets/Profile-nFArC2uv.js","/assets/ProofCamera-CxOZcbe3.js","/assets/Quality-Rz8BedGX.js","/assets/RichTextEditor-CgaBOJ_0.js","/assets/SearchInput-DwKIt9y3.js","/assets/SeasonalityHeatmap-BNH-x-W6.js","/assets/SegmentedToggle-CBkQ3nAP.js","/assets/SetupTimes-DmKda16-.js","/assets/ShiftDaily-nvD4yoRl.js","/assets/Skeleton-h-xITgkr.js","/assets/Staff-DR10QFQd.js","/assets/StatusBadge-Co1FFpE2.js","/assets/StyledSelect-Dw7j_-A1.js","/assets/Tasks-DgOJaKS3.js","/assets/TimeField-BbjwJKUZ.js","/assets/TimeWheelPicker-CusmgEJ5.js","/assets/Toast-Btn5Hsid.js","/assets/Tooltip-ComISVqW.js","/assets/TrendChart-qOmU6-kX.js","/assets/TripleSpeedometer-DenD23Yv.js","/assets/Trudoyomkost-DwjYbyfW.js","/assets/UsersActivity-B_fIk6tJ.js","/assets/WatchProgress-DDDJcjmq.js","/assets/WebLogin-BrG1t7Cj.js","/assets/WorkerConcerns-F0inVDAX.js","/assets/Workers-B3DkFZeK.js","/assets/Zagruzka-C7XULL9w.js","/assets/ZagruzkaCell-ByMrNpc4.js","/assets/alarm-clock-D-tXl-VX.js","/assets/api-5E8a0L23.js","/assets/archive-D7eCfbIV.js","/assets/archive-restore-BHjm7_RC.js","/assets/arrow-down-C1bc7Y5S.js","/assets/arrow-left-DjB1A7p1.js","/assets/arrow-left-right-BWN0u5as.js","/assets/arrow-right-CgqbnNbW.js","/assets/arrow-up-efzzLbaz.js","/assets/award-CPvnZGUq.js","/assets/ban-DbdXW-MR.js","/assets/bot-C7WBZFzd.js","/assets/boxes-DirKdbII.js","/assets/brigadirFilters-bjwkeKV4.js","/assets/broadcastTree-DwObJRKW.js","/assets/building-2-IqldGRSO.js","/assets/calendar-CiHwSDVm.js","/assets/calendar-clock-BanK7d73.js","/assets/calendar-days-BOILbo8H.js","/assets/calendar-range-LwhlBxsv.js","/assets/camera-lpMU3sy8.js","/assets/categories-BVaWQ3HI.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-O86b1D7a.js","/assets/chart-line-C_oeIpya.js","/assets/chart-pie-DVw68CjU.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-DC_osfog.js","/assets/check-DiXR3uAH.js","/assets/check-check-DTHkMy18.js","/assets/chevron-left-8Wgl4Qfg.js","/assets/chevrons-up-down-CaPxUuvP.js","/assets/circle-dot-7nDyHuZc.js","/assets/circle-minus-DndymKgU.js","/assets/circle-slash-B2OD5jnf.js","/assets/circle-user-round-CThj3bLA.js","/assets/compass-DZ4H2wzW.js","/assets/concernCategories-BKtrmZVa.js","/assets/copy-DhPnk7OX.js","/assets/corner-down-right-DQikqiZ7.js","/assets/createLucideIcon-CphoCY1_.js","/assets/exportXlsx-DjSgOKwX.js","/assets/external-link-DIE3FqN3.js","/assets/file-clock-CP8h9gP4.js","/assets/file-spreadsheet-Bbffj4gC.js","/assets/file-text-DgNTyfAR.js","/assets/flag-CEt9Ch0i.js","/assets/flame-DI4X6kBW.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CtFCm_Vg.js","/assets/funnel-CqTpeCp1.js","/assets/hash-DrAor63V.js","/assets/history-CuqIaDKa.js","/assets/hourglass-DDTsplHA.js","/assets/image-CbdmfFex.js","/assets/image-off-Brku3cHj.js","/assets/index-BopZCC5U.js","/assets/index-PYkJVL39.css","/assets/keyboard-DHq2Lbdl.js","/assets/languages-BJCyd62q.js","/assets/layers-BWoOnrtd.js","/assets/leaderReason-CK5yb9pe.js","/assets/lightbulb-B5L1ml5A.js","/assets/link-2-BKyq7aBZ.js","/assets/list-checks-BFZcbMmL.js","/assets/list-ordered-DIwanB5C.js","/assets/lock-open-DZJZXyBT.js","/assets/log-in-BLS1oqm1.js","/assets/message-square-C-x7iSYf.js","/assets/minimize-2-DvKiqqai.js","/assets/minus-D09NQSq8.js","/assets/paperclip-Dfk4gicB.js","/assets/pencil-BVU2SkB_.js","/assets/pencil-line-Bm2OEQbe.js","/assets/personName-B4KId4zS.js","/assets/pin-BGUUv9hD.js","/assets/play-VTgUTUx8.js","/assets/prop-types-07BSUG8-.js","/assets/radio-CAO-VMdF.js","/assets/react-apexcharts.esm-DXULjfN1.js","/assets/refresh-cw-MVMRCtqV.js","/assets/repeat-BEJYvzU3.js","/assets/rotate-ccw-yrpHQMme.js","/assets/rotate-cw-CrHrL6Su.js","/assets/save-B1jw1oSH.js","/assets/scale-C0U8arUI.js","/assets/scroll-text-BUl1AtO9.js","/assets/search-x-CktZztj9.js","/assets/segments-mcjiFWsA.js","/assets/send-BwkSq9f9.js","/assets/settings-2-Xb4TeCV0.js","/assets/shield-alert-D6DpvGTV.js","/assets/shield-check-h_7AI2JW.js","/assets/shield-npzm1j9l.js","/assets/shield-question-mark-DR9FmHMG.js","/assets/siren-waJ2AqYR.js","/assets/smartphone-By7xind6.js","/assets/snowflake-D__dD646.js","/assets/star-Bf6WZBM3.js","/assets/statusBands-CKln0UU5.js","/assets/table-2-BTX02K2z.js","/assets/tag-DzfTL5hY.js","/assets/trash-2-DiYi3-bg.js","/assets/trending-down-BxsIi1Pq.js","/assets/trending-up-LpyYKcFe.js","/assets/undo-2-3niBpfVA.js","/assets/useChartTheme-D2L0w64V.js","/assets/useElementWidth-C-XemAs7.js","/assets/useIsMobile-Bgn7Zug5.js","/assets/useMutation-ZE4qPq98.js","/assets/useStatusBands-DazyGDqx.js","/assets/user-check-C0CtpseP.js","/assets/user-cog-SnLGFN-C.js","/assets/user-minus-CYlOhmvb.js","/assets/users-DfiYkdn_.js","/assets/verifyState-2oBZmB6r.js","/assets/video-B990eiXu.js","/assets/warehouse-DeM5NrRd.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
