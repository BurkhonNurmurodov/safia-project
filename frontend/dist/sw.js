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

const BUILD = "2026-10-23T12:01:26.990Z";
const PRECACHE = ["/","/assets/AdminPanel-75SUSZCx.js","/assets/AnalysisBoard-5s_1-Fm3.js","/assets/Arc-DTCNuioc.js","/assets/Assistant-Bx_3Oe1r.js","/assets/BrigadirProfile-GVqlGLYh.js","/assets/BroadcastReceivers-Do81Tx3E.js","/assets/BroadcastRecord-Xo7yBdsI.js","/assets/Button-DDEDwlVP.js","/assets/CatLockNotice-CzvRBpWP.js","/assets/CategoryLegendModal-BUJXhB2y.js","/assets/CellConcerns-Cl48tfqq.js","/assets/CellDetails-DDDqN5jv.js","/assets/CellFormModal-DCjhhEZO.js","/assets/CellIdent-CbaYf_EL.js","/assets/CellLink-BI6COgvh.js","/assets/Cells-DFZSBmP8.js","/assets/ColumnFilter-OVLoqD9i.js","/assets/ColumnsPicker-C1aHG7O7.js","/assets/CommentsModal-DIzAKsN-.js","/assets/ComparisonTable-C6ATFe7_.js","/assets/Concerns-DrgTD3QZ.js","/assets/CountStepper-DBdm7HPJ.js","/assets/Daily-DzuGoO5d.js","/assets/DataTable-C-BSRD6e.js","/assets/DateRangePicker-CZEJOR6B.js","/assets/DayReportView-BW8sUG1Z.js","/assets/DayStepper-Dmm-2QcI.js","/assets/DayStrip-B8xcW37h.js","/assets/DifferenceBreakdown-BzFY7bjY.js","/assets/Downtime-Dqu6sz_a.js","/assets/Education-mCjCL3ov.js","/assets/EducationLesson-DDlxaIY7.js","/assets/EmptyState-Cd8wzGJq.js","/assets/Exam-BfGX_gVx.js","/assets/FactorySelect-Deldzish.js","/assets/Gamification-BDrvEEYp.js","/assets/GroupBadge-C3aVe_vT.js","/assets/HeatmapChart-BgQUougo.js","/assets/IdleCell-BNhcG3t_.js","/assets/KPICard-DWNGyMay.js","/assets/Kaizen-ragcSk1u.js","/assets/Kelish-C3ZgEL3N.js","/assets/KpiDeltaCard-6AVafzad.js","/assets/LangTextInput-NsVUf2b1.js","/assets/Layout-jX2TXTzM.js","/assets/LeaderAppeal-CWEHczzq.js","/assets/LeaderDayReport-BNrOFy8y.js","/assets/LeaderUnitReport-CfZDEZJD.js","/assets/Leaderboard-Ck8RDyL9.js","/assets/Leaders-BNbrZWJy.js","/assets/LeadersKpi-BhO6tn4V.js","/assets/Lightbox-CUOQnTpz.js","/assets/LiveOverview-BTCnlRfC.js","/assets/Login-DN0ukCfE.js","/assets/NotFound-DN1L6KvU.js","/assets/Notifications-DaRvBG5R.js","/assets/Ontime-BT1K7bRr.js","/assets/Overview-C2PAlKen.js","/assets/Pagination-aICDYj20.js","/assets/PerenaladkaFactTable-m68HYsYV.js","/assets/PersonCard-D5W4ehN-.js","/assets/PlanFulfillment-BNgTYaQE.js","/assets/Production-qlpxeDpC.js","/assets/Profile-C0TcFjDG.js","/assets/ProofCamera-CsvmD0HR.js","/assets/ProofPhoto-Bz6AR4YD.js","/assets/Quality-BJZj8kKL.js","/assets/RawRows-CK934DkI.js","/assets/RequestStateChip-BSDjcWhU.js","/assets/RichTextEditor-A7qrJMdr.js","/assets/SaveState--dRrKTcI.js","/assets/SearchInput-CgeIfg4k.js","/assets/SeasonalityHeatmap-D642_Pu0.js","/assets/SegmentedToggle-DUwvXeAC.js","/assets/SetupTimes-BJMLZ45f.js","/assets/ShiftDaily-CLy7Z2kr.js","/assets/Staff-8CtySeQt.js","/assets/StaffListAtCheck-DeEp-k5B.js","/assets/StatusBadge-CHczWgsX.js","/assets/StatusBandsModal-Cc8Ff-S3.js","/assets/TargetGoal-D0Z23IQN.js","/assets/Targets-C9ir78Qa.js","/assets/Tasks-C3ZNmXDP.js","/assets/TimeWheelPicker-JtxkldwQ.js","/assets/Toast-4NLlH78-.js","/assets/Tooltip-pTnupKfw.js","/assets/TrendChart-C7Ya1GUh.js","/assets/TripleSpeedometer-k0CL26wR.js","/assets/Trudoyomkost-21N0wDqY.js","/assets/UploadDropzone-p6JPxgzY.js","/assets/UsersActivity-DLE-hAkM.js","/assets/VerdictBlock-DndvxaYP.js","/assets/VfxApiMap-DvdRJCTy.js","/assets/VfxDictionaries-BZ5Io9ZO.js","/assets/VfxEmployees-Ced0Nddc.js","/assets/VfxHrMoves-9EGajrFr.js","/assets/VfxJobs-Kft9M8pD.js","/assets/VfxPhoto-CtXzxWG1.js","/assets/VfxShifts-DZUoPoxk.js","/assets/VfxState-ORdQmW8T.js","/assets/VfxTimebooks-D_Hs7sKR.js","/assets/VfxTimesheet-CRCElSyv.js","/assets/WatchProgress-CrUXO3Xo.js","/assets/WebLogin-BXeU_4-s.js","/assets/Workers-DC3Y4g_o.js","/assets/Zagruzka-CO_2Rgjj.js","/assets/ZagruzkaCell-DlIXfU4w.js","/assets/api-DH7h_32Z.js","/assets/archive-BcabhNpN.js","/assets/archive-restore-DDdiNceY.js","/assets/arrow-down-B-WbApF1.js","/assets/arrow-down-right-DPG_m7gI.js","/assets/arrow-down-wide-narrow-CS2V73eJ.js","/assets/arrow-up-narrow-wide-Cf2dCRT1.js","/assets/ban-IzqWzocJ.js","/assets/boxes-CfPKgPhd.js","/assets/braces-DE1XJgCY.js","/assets/brigadirFilters-nXjzIOCl.js","/assets/broadcastTree-ClEE0zmi.js","/assets/building-2-C6R3noSz.js","/assets/calendar-CyfoihH0.js","/assets/calendar-days-DTEprqVC.js","/assets/camera-C4mY9akx.js","/assets/categories-DvEqFLUp.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C4CO4I49.js","/assets/chart-line-DtDAarzY.js","/assets/chart-pie-BNgC7gsa.js","/assets/chartRange-DkGsStY4.js","/assets/check-check-DhV40nss.js","/assets/chevron-left-DL4gvgWt.js","/assets/chevrons-up-down-CwG_J-FE.js","/assets/circle-GYgxp3pm.js","/assets/circle-alert-BkUecOtP.js","/assets/circle-check-big-C5n2SukA.js","/assets/circle-dashed-DKkKCfFY.js","/assets/circle-minus-CW4F7Sk5.js","/assets/circle-question-mark-BgRR2Xcc.js","/assets/circle-slash-B85agXTq.js","/assets/circle-user-round-BDx0YKAy.js","/assets/cloud-off-D-8Mtpls.js","/assets/cloud-upload-dX1xa93t.js","/assets/compass-WRnBi-tV.js","/assets/concernCategories-DEodK28R.js","/assets/corner-down-right-BUHLabXa.js","/assets/createLucideIcon-CXEI0qE-.js","/assets/es-GhHln_gn.js","/assets/external-link-B7RDLXzu.js","/assets/file-clock-DL1Nk_NE.js","/assets/file-exclamation-point-qLmnpzK8.js","/assets/flag-BVK1FdGV.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Cz416BUE.js","/assets/funnel-DIW7T3MI.js","/assets/hash-D4pkjFd2.js","/assets/hourglass-BqdrS2Cx.js","/assets/image-CaJmQu7I.js","/assets/image-off-CfwXX-_C.js","/assets/inbox-CoN57vHV.js","/assets/index-DhXzUdEY.js","/assets/index-FGjuJedL.css","/assets/keyboard-D_D9AxmU.js","/assets/languages-BLpEWyuf.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-0PtvQE3B.js","/assets/leaderBoard-CnSckAeE.js","/assets/lightbulb-B3NZlbRP.js","/assets/link-2-BtexaTnF.js","/assets/link-2-off-3jqcBuV1.js","/assets/list-ordered-O-BP-y72.js","/assets/list-tree-jyZGOMpH.js","/assets/lock-open-CK4q9ydL.js","/assets/log-in-C3vf2VaR.js","/assets/marks-_y-kyve2.js","/assets/minimize-2-DCc3lNex.js","/assets/package-check-CM7Y14nW.js","/assets/pencil-C3qMsP1c.js","/assets/percent-4zQ2bxL6.js","/assets/pin-D7IG2rO6.js","/assets/pin-off-BaMwP_Uu.js","/assets/play-DGGkiDBx.js","/assets/plug-zap-u2yO6MW8.js","/assets/prop-types-Cqj-uXPM.js","/assets/radio-Hh6P68Nf.js","/assets/react-apexcharts.esm-C0z2imOk.js","/assets/registers-BPmPgK0j.js","/assets/repeat-DaBPJia5.js","/assets/save-aApWRG-E.js","/assets/scopeLinks-B27ySlMv.js","/assets/scroll-text-BjQCVKgq.js","/assets/search-x-JfCaSpxB.js","/assets/segments-gfXi08gg.js","/assets/send-DhDiJce_.js","/assets/settings-2-CL6oNPRg.js","/assets/shield-BAFsMebL.js","/assets/shield-alert-CSFRwRnT.js","/assets/shield-question-mark-Bdbcv_GT.js","/assets/sigma-Bk7uOlw-.js","/assets/siren-Blsjvuc8.js","/assets/snowflake-C7bIh6Tt.js","/assets/split-Bv7pdr2G.js","/assets/square-check-big-DmhalG_-.js","/assets/star-os52yM1F.js","/assets/statusBands-DKJ2R4jm.js","/assets/store-DCpxGpLa.js","/assets/table-2-BuqIq7Rk.js","/assets/table-properties-DgtuwKGv.js","/assets/tag-BXTXM2y9.js","/assets/timer-off-CpOEIzAv.js","/assets/trendBuckets-ChCsWPzz.js","/assets/trending-down-nMMXdOqw.js","/assets/trending-up-fyGQuLlE.js","/assets/undo-2-DP1fkQPH.js","/assets/useChartTheme-DAbxdY-T.js","/assets/useElementWidth-DzDC7_Fe.js","/assets/useIsMobile-I2qXvDcW.js","/assets/useOpenParam-B8vAx4mN.js","/assets/useStatusBands-C9Rrnhqr.js","/assets/useUrlScope-DrYoMjY8.js","/assets/user-B2bDPvpT.js","/assets/user-cog-D6HWe7na.js","/assets/user-minus-DbYZvuV3.js","/assets/users-C7Xa4cMI.js","/assets/vfx-B-o4EOuh.js","/assets/video-CkNHj9sS.js","/assets/wallet-CCNl-wUR.js","/assets/warehouse-BCi_mTgn.js","/assets/workflow-YFyfnKGJ.js","/assets/x-BPnxaIjb.js","/assets/zap-BvGG9WHW.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
