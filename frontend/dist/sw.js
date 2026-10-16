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

const BUILD = "2026-10-16T07:18:42.821Z";
const PRECACHE = ["/","/assets/AdminPanel-BoMx6cMc.js","/assets/AnalysisBoard-C5nMNczD.js","/assets/Arc-Cv0olABf.js","/assets/Assistant-jN3Fs2Vs.js","/assets/BrigadirProfile-COijFYMW.js","/assets/BroadcastReceivers-BHfzFgoS.js","/assets/BroadcastRecord-nOrTA2Mu.js","/assets/Button-DMgk9TT1.js","/assets/CatLockNotice-CB8mAm2h.js","/assets/CategoryLegendModal-C0swKwLQ.js","/assets/CellConcerns-DzNsa5W3.js","/assets/CellDetails-C9wm1wvS.js","/assets/CellFormModal-B8fprpJB.js","/assets/CellIdent-C25uDtzj.js","/assets/CellLink-Ff8fBahH.js","/assets/Cells-wc-cWC5p.js","/assets/ColumnFilter-Bl2SJ7JX.js","/assets/ColumnsPicker-B3T3oRQG.js","/assets/CommentsModal-ClcJ9BG-.js","/assets/ComparisonTable-U1vG077B.js","/assets/Concerns-nz7tiLCk.js","/assets/CountStepper-D1ASNHO4.js","/assets/Daily-dxR-VEQH.js","/assets/DataTable-C9MaZraW.js","/assets/DateRangePicker-D8lG9jfH.js","/assets/DayReportView-WmUoLxti.js","/assets/DayStepper-CeYPhao0.js","/assets/DifferenceBreakdown-Jp2HMuI6.js","/assets/Downtime-DjY13qcq.js","/assets/Education-Dwz4w_nD.js","/assets/EducationLesson-BSBVVE0u.js","/assets/EmptyState-Dq7fLO7O.js","/assets/Exam-BiKZjJNH.js","/assets/FactorySelect-B108vgT8.js","/assets/Gamification-DR5xOC7x.js","/assets/GroupBadge-CJMlgRNa.js","/assets/HeatmapChart-D5qOG_01.js","/assets/IdleCell-Dbs3NbRT.js","/assets/KPICard-ClT_7Ds4.js","/assets/Kaizen-Bg_LLchf.js","/assets/Kelish-Dj0VXwCR.js","/assets/KpiDeltaCard-BM9XmBZm.js","/assets/LangTextInput-Pin1dt2V.js","/assets/Layout-CtAGOILp.js","/assets/LeaderAppeal-Bgem_z-h.js","/assets/LeaderDayReport-kZ6cNbyP.js","/assets/LeaderUnitReport-BSV69_I5.js","/assets/Leaderboard-Bj3Rp_Ny.js","/assets/Leaders-CCpg46m-.js","/assets/Lightbox-CBMDPi9-.js","/assets/LiveOverview-DyOGofAT.js","/assets/Login-CkIfDS-t.js","/assets/NotFound-SDft-g6L.js","/assets/Notifications-NKf6mkkF.js","/assets/Overview-eRVPAeEA.js","/assets/Pagination-CD8f7_BC.js","/assets/PerenaladkaFactTable-sV1hlO6i.js","/assets/PersonCard-G-BZjF50.js","/assets/PlanFulfillment-DTnOR8Rl.js","/assets/Production-B0XHR4Sn.js","/assets/Profile-CKyeqvAP.js","/assets/ProofCamera-Dw4OXwDk.js","/assets/Quality-oVU4TriZ.js","/assets/RawRows-B21WxDnm.js","/assets/RequestStateChip-Dpv6hD7F.js","/assets/RichTextEditor-DaM_QnWx.js","/assets/SaveState-DDSLfVIk.js","/assets/SearchInput-BLTgbqPq.js","/assets/SeasonalityHeatmap-COCCzTbc.js","/assets/SegmentedToggle-DKd3mBl9.js","/assets/SetupTimes-D6bSZQAx.js","/assets/ShiftDaily-DOg5S2w4.js","/assets/Staff-D4ZFv3F0.js","/assets/StaffListAtCheck-fnK4mlSt.js","/assets/StatusBadge-XRtUbzmh.js","/assets/TargetGoal-CSzsJSm-.js","/assets/Targets-DnY3gPnj.js","/assets/Tasks-MFoyWPpg.js","/assets/TimeWheelPicker-QdnJlYPK.js","/assets/Toast-V3RGE5jN.js","/assets/Tooltip-k6Cyv0zo.js","/assets/TrendChart-C5tKtmxJ.js","/assets/TripleSpeedometer-B2mRr-UU.js","/assets/Trudoyomkost-C2NpfnPx.js","/assets/Turnover-DaPl9fep.js","/assets/UploadDropzone-DHIRwFFp.js","/assets/UsersActivity-CFpf23uL.js","/assets/VerdictBlock-BomjO4kx.js","/assets/VfxApiMap-Be1I6lmW.js","/assets/VfxDictionaries-D3ipLUpO.js","/assets/VfxEmployees-Dtm7zgbz.js","/assets/VfxHrMoves-CIl_s_1M.js","/assets/VfxJobs-BvirC_he.js","/assets/VfxPhoto-b3uvxPZo.js","/assets/VfxShifts-BiiQbCNQ.js","/assets/VfxState-BBYg5D9i.js","/assets/VfxTimebooks-DgX_LHOk.js","/assets/VfxTimesheet-BWyE4KWg.js","/assets/WatchProgress-FvvPrjnk.js","/assets/WebLogin-DPeisFb0.js","/assets/WorkerConcerns-8dLvjTMZ.js","/assets/Workers-Ut9vGjFc.js","/assets/Zagruzka-C8Xt-49w.js","/assets/ZagruzkaCell-i-fEkNa9.js","/assets/api-CNZ8qNpX.js","/assets/archive-k4UEZxZA.js","/assets/archive-restore-ielrUGUy.js","/assets/arrow-down-BRnSxrNW.js","/assets/arrow-down-wide-narrow-C2aKKHYc.js","/assets/arrow-up-narrow-wide-0rDNQn_k.js","/assets/award-CmjwzOZz.js","/assets/ban-ACXcWmOo.js","/assets/boxes-DVu0qRIM.js","/assets/braces-B76dgnup.js","/assets/brigadirFilters-DOU4nB_U.js","/assets/broadcastTree-OhlIEhTQ.js","/assets/building-2-D4D38RON.js","/assets/calculator-CFGHpntR.js","/assets/calendar-SV9j0VDi.js","/assets/calendar-days-Dn2NuLcR.js","/assets/camera-CwH4r2UJ.js","/assets/categories-B4g8sWvV.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-JOMyTOxq.js","/assets/chart-line-CarNZykJ.js","/assets/chart-pie-BNEI419x.js","/assets/chartRange-BBzC5usl.js","/assets/check-check-D7ZH1XEH.js","/assets/chevron-left-DLCyYSmF.js","/assets/chevrons-up-down-sqxPTYIG.js","/assets/circle-BTx424Iy.js","/assets/circle-alert-BZO8kbfe.js","/assets/circle-check-big-CUXh41Qt.js","/assets/circle-dashed-DOg2wFYX.js","/assets/circle-minus-CaLh1IwC.js","/assets/circle-question-mark-DPA5qRda.js","/assets/circle-slash-DsPSkkDD.js","/assets/circle-user-round-BnxKk-Su.js","/assets/clock-3-IDVTaKzT.js","/assets/cloud-off-DBl0D5ks.js","/assets/cloud-upload-B8NsUWSO.js","/assets/compass-D4hhhiLq.js","/assets/concernCategories-nFCV3ibN.js","/assets/copy-DicotPEd.js","/assets/corner-down-right-m3ppJupR.js","/assets/createLucideIcon-rzL0BK4i.js","/assets/es-B4_4d1xB.js","/assets/external-link-YFjUykAV.js","/assets/file-clock-DUzV70NO.js","/assets/file-exclamation-point-Cu-PdtuR.js","/assets/flag-dmcQ_Gr9.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-X3ux2BDM.js","/assets/hash-BX3fBjK4.js","/assets/hourglass-Cofb5Jim.js","/assets/image-CdJ1U6iQ.js","/assets/image-off-DvOLs-o6.js","/assets/inbox-BWb3iqg4.js","/assets/index-CBKw4u90.css","/assets/index-Dy1FdCXI.js","/assets/keyboard-C3uig9Ye.js","/assets/languages-By9kFyaQ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BEli3hfj.js","/assets/lightbulb-BvkBagPQ.js","/assets/link-2-Bv4lMAUU.js","/assets/link-2-off-CAIUJDQs.js","/assets/list-ordered-qHtye4kw.js","/assets/list-tree-VuRtUQgM.js","/assets/lock-open-D7-tXgev.js","/assets/log-in-BRWH1eaQ.js","/assets/marks-CZxM2MHI.js","/assets/minimize-2-Bt-ljq3q.js","/assets/package-check-CVPTiugA.js","/assets/pencil-CKFjKKrd.js","/assets/percent-BERN9Ib0.js","/assets/pin-BJi3sCB0.js","/assets/pin-off-D2JwXNeL.js","/assets/play-CyrugV-h.js","/assets/plug-zap-DG6byCwT.js","/assets/prop-types-k5-G1HNq.js","/assets/radio-dJkJA4yx.js","/assets/react-apexcharts.esm-15W5eqqG.js","/assets/registers-BMXQoFbq.js","/assets/repeat-vr9Tsxp-.js","/assets/save-BSCYJQ1w.js","/assets/scopeLinks-Bdbh8b0C.js","/assets/scroll-text-CaR9WsqH.js","/assets/search-x-I-7fYrpq.js","/assets/segments-BRuWq1oa.js","/assets/send-BEFIlmd0.js","/assets/settings-2-B0WLO3_l.js","/assets/shield-BHxnxX3z.js","/assets/shield-alert-Ded9l-oi.js","/assets/shield-question-mark-C_DiVxBI.js","/assets/siren-BFdMt2p0.js","/assets/snowflake-DEeH8D-Y.js","/assets/split-BqbiuDwL.js","/assets/square-check-big-Bj8ji6Pk.js","/assets/star-CmYmdX96.js","/assets/statusBands-D89GhSUK.js","/assets/store-LR1qVvYN.js","/assets/table-2-CD2ISqT1.js","/assets/table-properties-BmMjj0Z3.js","/assets/tag-CQz3IwVq.js","/assets/timer-off-BAAqevD8.js","/assets/trending-down-CAKbiPbB.js","/assets/trending-up-XCjcao6v.js","/assets/undo-2-DSnCuQ71.js","/assets/useChartTheme-BTTtu3At.js","/assets/useElementWidth-C8m5_K9K.js","/assets/useIsMobile-DxSeo1cK.js","/assets/useOpenParam-CHpUMRQc.js","/assets/useStatusBands-XgY4pdUN.js","/assets/useUrlScope-BEZl9Oe9.js","/assets/user-BoJXzqmP.js","/assets/user-cog-DyJpQrHi.js","/assets/users-BnVEC7Ob.js","/assets/vfx-Ci6WIBXF.js","/assets/video-D4LisSpS.js","/assets/wallet-Jl1SSj-c.js","/assets/warehouse-Dt4CCeZc.js","/assets/workflow-DRfYQ2sg.js","/assets/x-Cxp0krGZ.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
