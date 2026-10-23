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

const BUILD = "2026-10-23T17:09:03.323Z";
const PRECACHE = ["/","/assets/AdminPanel-Btt5BoDC.js","/assets/AnalysisBoard-Dw9MrJWz.js","/assets/Arc-Fwmvyh7q.js","/assets/Assistant-ChLSi325.js","/assets/BrigadirProfile-bLafrdMo.js","/assets/BroadcastReceivers-Bh7KLXnM.js","/assets/BroadcastRecord-gjYgx_Oq.js","/assets/Button-BDfr5O81.js","/assets/CatLockNotice-CdVO1Nl4.js","/assets/CategoryLegendModal-D7fGqgDx.js","/assets/CellConcerns-BlQcV7a4.js","/assets/CellDetails-Cz-ZPtIl.js","/assets/CellFormModal-DW2QU8XU.js","/assets/CellIdent-DyLHDNzO.js","/assets/CellLink-DDJPwQMl.js","/assets/Cells-DtTAcIQB.js","/assets/ColumnFilter-DgzifZZJ.js","/assets/ColumnsPicker-Bea77JhC.js","/assets/CommentsModal-B2yuERM6.js","/assets/ComparisonTable-Dk3_yCxN.js","/assets/Concerns-DWX6FNy6.js","/assets/CountStepper-CgcFsEtC.js","/assets/Daily-yWEC67Uu.js","/assets/DataTable-UbfrUTKu.js","/assets/DateRangePicker-B5pPVZtN.js","/assets/DayReportView-CCUoyMJ2.js","/assets/DayStepper-BkMcIiOh.js","/assets/DayStrip-DWnQiOB_.js","/assets/DifferenceBreakdown-CTcenNsM.js","/assets/Downtime-Dxe-osjp.js","/assets/Education-C-EY3lx4.js","/assets/EducationLesson-BfrnS9Qg.js","/assets/EmptyState-DHFk8npk.js","/assets/Exam-Htt9vUO4.js","/assets/FactorySelect-DrIJ2YQO.js","/assets/Gamification-KJlhYTbN.js","/assets/GroupBadge-BXtWlq2C.js","/assets/HeatmapChart-C6XFnArB.js","/assets/IdleCell-BExR95DU.js","/assets/KPICard-BMBjyxMV.js","/assets/Kaizen-qJKedRXm.js","/assets/Kelish-BJw-QQay.js","/assets/KpiDeltaCard-DSyS-G-V.js","/assets/LangTextInput-DB7-OMby.js","/assets/Layout-CbEYNGJh.js","/assets/LeaderAppeal-BOaHvtH2.js","/assets/LeaderDayReport-CpwMYWlE.js","/assets/LeaderUnitReport-C_HKxHDs.js","/assets/Leaderboard-B0noVu-I.js","/assets/Leaders-piV8hLkR.js","/assets/LeadersKpi-JzGIBg_8.js","/assets/Lightbox-DnZSq9BG.js","/assets/LiveOverview-BqUP-ENw.js","/assets/Login-fVkE91Ne.js","/assets/NotFound-CJUW1Tu0.js","/assets/Notifications-DBt6ckK5.js","/assets/Ontime-CG6ULczr.js","/assets/Overview-Bz4d69lz.js","/assets/Pagination-C7D6Mg50.js","/assets/PerenaladkaFactTable-Ce7cFaxX.js","/assets/PersonCard-B3zYLDRQ.js","/assets/PlanFulfillment-CsE5u48P.js","/assets/Production-qSWQZEsU.js","/assets/Profile-B0-tTgzv.js","/assets/ProofCamera-BWEwlCha.js","/assets/ProofPhoto-Dce5zvWu.js","/assets/Quality-DnXa1xAr.js","/assets/RawRows-DT7M-BUV.js","/assets/RequestStateChip-Dwdvd5gA.js","/assets/RichTextEditor-B2GPkxNh.js","/assets/SaveState-DpaStfFb.js","/assets/SearchInput-BSAg57tv.js","/assets/SeasonalityHeatmap-C8OCinPN.js","/assets/SegmentedToggle-wy0iSWDB.js","/assets/SetupTimes-C0TOLDJV.js","/assets/ShiftDaily-DlL69HRc.js","/assets/Staff-DGsIncmY.js","/assets/StaffListAtCheck-DbB_6Ie_.js","/assets/StatusBadge-DedrEuXg.js","/assets/StatusBandsModal-DHocIwZ0.js","/assets/TargetGoal-iX6-BWYh.js","/assets/Targets-BMA-_Kmi.js","/assets/Tasks-DOhb36LQ.js","/assets/TimeWheelPicker-D5zFCwDD.js","/assets/Toast-CIDXWSqi.js","/assets/Tooltip-DzOPF12t.js","/assets/TrendChart-HF5YIABH.js","/assets/TripleSpeedometer-DO6itihl.js","/assets/Trudoyomkost-BVJzwYrk.js","/assets/UploadDropzone-DtZ75VYX.js","/assets/UsersActivity-BGpbjOts.js","/assets/VerdictBlock-CWNxC9_h.js","/assets/VfxApiMap-DRF8fLUH.js","/assets/VfxDictionaries-B06FnNjF.js","/assets/VfxEmployees-BV4kTFPL.js","/assets/VfxHrMoves-BMg7TfHz.js","/assets/VfxJobs-DtAmu0Ke.js","/assets/VfxPhoto-CXVGPmGQ.js","/assets/VfxShifts-CZDX-4l3.js","/assets/VfxState-DXS48kZM.js","/assets/VfxTimebooks-BhvfavoW.js","/assets/VfxTimesheet-DOO4a0O_.js","/assets/WatchProgress-D0hvmCmX.js","/assets/WebLogin-DgwTlQgl.js","/assets/Workers-C4MYXk8e.js","/assets/Zagruzka-BM69lglM.js","/assets/ZagruzkaCell-CbMleWOy.js","/assets/api-Cz7TZFRM.js","/assets/archive-C0ZczwX6.js","/assets/archive-restore-rDfriLNo.js","/assets/arrow-down-CKsakd2d.js","/assets/arrow-down-right-CNt4OTfU.js","/assets/arrow-down-wide-narrow-BiS3mebg.js","/assets/arrow-up-narrow-wide-BhzmzTci.js","/assets/ban-Z9yAm9hc.js","/assets/boxes-DbGnIUVj.js","/assets/braces-kH_taz8x.js","/assets/brigadirFilters-BHFSwS83.js","/assets/broadcastTree-eMqGCXap.js","/assets/building-2-B7nRo6nh.js","/assets/calendar-B5djbtDi.js","/assets/calendar-days-BqTTgXfl.js","/assets/camera-DWvtNY5N.js","/assets/categories-CgpVBti5.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CwXzy7WM.js","/assets/chart-line-C75zREhl.js","/assets/chart-pie-B1r-Txny.js","/assets/chartRange-BZyZE65_.js","/assets/check-check-NWlNI_Xo.js","/assets/chevron-left-B7qWAA03.js","/assets/chevrons-up-down-BGxxOH08.js","/assets/circle-Cs0oQyqQ.js","/assets/circle-alert-yCAizjEa.js","/assets/circle-check-big-Dx3o5YbE.js","/assets/circle-dashed-BBV6dN_Z.js","/assets/circle-minus-DD3_4UGL.js","/assets/circle-question-mark-C-XkzoJq.js","/assets/circle-slash-zJ1tjOok.js","/assets/circle-user-round-BhtoW9-1.js","/assets/cloud-off-DKq9jbfO.js","/assets/cloud-upload-C2caMU-x.js","/assets/compass-BX82Frsz.js","/assets/concernCategories-DaxdsN_z.js","/assets/corner-down-right-BmFea0pV.js","/assets/createLucideIcon-CpztAUkD.js","/assets/es-DJrm4bDJ.js","/assets/external-link-CrdesdqG.js","/assets/file-clock-DC32SIRG.js","/assets/file-exclamation-point-DQwJeh09.js","/assets/flag-ZP5tVkn8.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CCBVwLDa.js","/assets/funnel-Drk5gmTl.js","/assets/hash-DkGCOw1H.js","/assets/hourglass-CuCAWwCo.js","/assets/image-SEhpFqnT.js","/assets/image-off-CeSArWIY.js","/assets/inbox-JWw7MWVJ.js","/assets/index-CCLcKb5K.js","/assets/index-DFvJry-Q.css","/assets/keyboard-lwyRXm-u.js","/assets/languages-B6l4qoMB.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C-kclrFu.js","/assets/leaderBoard-BbRi2Fh8.js","/assets/lightbulb-C6vZ6fbn.js","/assets/link-2-off-Dcrw68Kc.js","/assets/link-2-uvf_Yk_1.js","/assets/list-ordered-BTJ8UAl5.js","/assets/list-tree-CmMEdJ49.js","/assets/lock-open-aJ3svNGx.js","/assets/log-in-CpIICVu5.js","/assets/map-pin-Czd8XtUH.js","/assets/marks-DmhOOjoV.js","/assets/minimize-2-DtNVg5xP.js","/assets/package-check-DmwWIsa1.js","/assets/pencil-HEKAMk41.js","/assets/percent-CS6U3Id5.js","/assets/pin-Cq2owMh0.js","/assets/pin-off-D7khunkt.js","/assets/play-DhUFfmbh.js","/assets/plug-zap-BF3pcyRn.js","/assets/prop-types-C9wFq_UK.js","/assets/radio-JvXQcNB7.js","/assets/react-apexcharts.esm-D4nYm7aB.js","/assets/registers-33IrH83R.js","/assets/repeat-BHrQO1on.js","/assets/save-DqsCt93I.js","/assets/scopeLinks-CXb3ZAsh.js","/assets/scroll-text-Ln-Wmg9K.js","/assets/search-x-CfAcjG82.js","/assets/segments-BHlyG3Rf.js","/assets/send-3ZURngNI.js","/assets/settings-2-2fOPutf-.js","/assets/shield-CxZ0vDaL.js","/assets/shield-alert-BVPA1UOZ.js","/assets/shield-question-mark-CRAdUNuK.js","/assets/sigma-BG2nVEQm.js","/assets/siren-CzQVKMtq.js","/assets/snowflake-C5yQ-nxp.js","/assets/split-CsJ472Xl.js","/assets/square-check-big-D3cbZVmG.js","/assets/star-ATjma1MG.js","/assets/statusBands-D9Ltsro2.js","/assets/store-COJfgc5j.js","/assets/table-2-DD1UVyto.js","/assets/table-properties-cY9FhDxN.js","/assets/tag-CLGi5Tlq.js","/assets/timer-off-CxSuEwkw.js","/assets/trendBuckets-DUDdBxX0.js","/assets/trending-down-33Kdn-ie.js","/assets/trending-up-CTYaxyBm.js","/assets/undo-2-piFUei_F.js","/assets/useChartTheme-Dv-9BBzX.js","/assets/useElementWidth-4VcTdtyX.js","/assets/useIsMobile-DDPpIkxO.js","/assets/useOpenParam-ImYnU6sE.js","/assets/useStatusBands-DhP-nY5J.js","/assets/useUrlScope-BwxDTxf5.js","/assets/user-4P8Dtu0L.js","/assets/user-cog-CMkBnQRT.js","/assets/user-minus-BCRK4bq9.js","/assets/users-BP0LZ0im.js","/assets/vfx-B6_4Ct-2.js","/assets/video-ZPbTs2xH.js","/assets/wallet-CHuNYOjt.js","/assets/warehouse-JSEdZxtP.js","/assets/workflow-S_hg_Mfe.js","/assets/x-CmQgjrnZ.js","/assets/zap-BdKCheO3.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
