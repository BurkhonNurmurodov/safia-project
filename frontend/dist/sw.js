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

const BUILD = "2026-10-03T05:43:02.636Z";
const PRECACHE = ["/","/assets/AdminPanel-DVNy0ASV.js","/assets/AnalysisBoard-BVprZwgH.js","/assets/Arc-8ug7HbnE.js","/assets/ArcLegacy-Bsy0drYr.js","/assets/BrigadirProfile-DIDETYDh.js","/assets/BroadcastReceivers-BQN0Hb5i.js","/assets/BroadcastRecord-az364zyM.js","/assets/CatLockNotice-BbSK8W-Y.js","/assets/CategoryLegendModal-CUI7hG_v.js","/assets/CellConcerns-oOwRgij1.js","/assets/CellDetails-D0poZ4ia.js","/assets/CellFormModal-B9NU5rcG.js","/assets/CellIdent-BBi2Cp0b.js","/assets/CellLink-zrCDADfI.js","/assets/Cells-wU26Zebl.js","/assets/ColumnFilter-CW-srI6B.js","/assets/ColumnsPicker-CPTiMAIE.js","/assets/CommentsModal-FrNOgMlj.js","/assets/ComparisonTable-DXnY0VzC.js","/assets/Concerns-Bq185N56.js","/assets/ConfirmDialog-pDwU5aVq.js","/assets/Daily-CTsyHpDC.js","/assets/DataTable-BSR2is8J.js","/assets/DateRangePicker-CI5_Oq_W.js","/assets/DayReportView-bpNNrO5b.js","/assets/DayStepper-DH1Al8cg.js","/assets/DifferenceBreakdown-BgpDrigC.js","/assets/Downtime-YDLP0-mT.js","/assets/Education-8FLFW7iJ.js","/assets/EducationLesson-ClgaX96d.js","/assets/EmptyState-Bi-O0O5k.js","/assets/Exam-BjQyqhV5.js","/assets/FactorySelect-B_yQnFCD.js","/assets/Gamification-CKAIMcmF.js","/assets/GroupBadge-pqHlgVmM.js","/assets/HeatmapChart-BGAYo-kF.js","/assets/IdleCell-OMTg8gL5.js","/assets/KPICard-B_CtGc_5.js","/assets/Kaizen-DEc7BTvo.js","/assets/Kelish-Bh_gMRnT.js","/assets/KpiDeltaCard-BzJmlJgA.js","/assets/LangTextInput-C4kel2zy.js","/assets/Layout-BnVMVX_d.js","/assets/LeaderAppeal-CTA-Wmi9.js","/assets/LeaderDayReport-DcgdoXDL.js","/assets/LeaderUnitReport-D87tJmkn.js","/assets/Leaderboard-exNAwvQ8.js","/assets/Leaders-qXP2hMgw.js","/assets/Lightbox-DJZwwiwD.js","/assets/LiveOverview-U6Q3lXNd.js","/assets/Login-ksu6Jgpv.js","/assets/NotFound-BiyUsemR.js","/assets/Notifications-Cef4cwXz.js","/assets/Overview-4iE-YgBo.js","/assets/Pagination-Ct4Eu65M.js","/assets/PerenaladkaFactTable-C-NCZUjA.js","/assets/PlanFulfillment-DNBZXw-t.js","/assets/Production-Dfsauxgl.js","/assets/Profile-C8j49lMT.js","/assets/ProofCamera-By4IPTf4.js","/assets/ProofPhoto-nAMZTOZW.js","/assets/Quality-DrY3f7ZS.js","/assets/RequestStateChip-BNiuzNr_.js","/assets/RichTextEditor-DEz15zCt.js","/assets/SaveState-D6PN-FnA.js","/assets/SearchInput-BdofZmCB.js","/assets/SeasonalityHeatmap-DwoVIlFJ.js","/assets/SegmentedToggle-38abETKK.js","/assets/SetupTimes-CIXfMPhH.js","/assets/ShiftDaily-D3utg_PN.js","/assets/Staff-CDXDJQaG.js","/assets/StaffLive-BBQQr-Ig.js","/assets/StatusBadge-NxO5Zpbu.js","/assets/TargetGoal-Bo7PLiFe.js","/assets/Targets-BPZ-VHgH.js","/assets/Tasks-C0nry4jb.js","/assets/TimeWheelPicker-DwnWy4Ee.js","/assets/Toast-CFPplqNN.js","/assets/Tooltip-DMqRoMYF.js","/assets/TrendChart-qtcW3vrc.js","/assets/TripleSpeedometer-Hx63MjsP.js","/assets/Trudoyomkost-DgE3to8m.js","/assets/UploadDropzone-v2pu9IU-.js","/assets/UsersActivity-CrEzQ1p5.js","/assets/VerdictBlock-BXOvWLyz.js","/assets/WatchProgress-DN43JmLb.js","/assets/WebLogin-DaNkEQsA.js","/assets/WorkerConcerns-B9uCnErQ.js","/assets/Workers-rkt0b7vK.js","/assets/Zagruzka-CLbDK7Qe.js","/assets/ZagruzkaCell-DmP4UZFB.js","/assets/api-paR6oEXe.js","/assets/archive-D7oGmeCE.js","/assets/archive-restore-CjLU_acT.js","/assets/arrow-down-0-28xVhr.js","/assets/arrow-left-aubHAWGC.js","/assets/arrow-right-left-B2IOB1eK.js","/assets/arrow-up-CF9-4ez7.js","/assets/arrow-up-narrow-wide-Cuo0MYEi.js","/assets/arrow-up-right-e1Y2xyy4.js","/assets/award-BybpCGu_.js","/assets/ban-BC5IlEoV.js","/assets/bot-BHHEHdM4.js","/assets/boxes-Dt6pVugn.js","/assets/brigadirFilters-CCm47Jqo.js","/assets/broadcastTree-I5gNXZKm.js","/assets/building-2-DVxxIHiI.js","/assets/calendar-CLFp8Oe0.js","/assets/calendar-days-CJ299Hbv.js","/assets/calendar-range-Db3glQ1Q.js","/assets/camera-DC7su0LY.js","/assets/categories-BXoEKRJQ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BB_eJ-nn.js","/assets/chart-line-CDB1ITw2.js","/assets/chart-pie-DN0KFSI4.js","/assets/chartRange-BgpPf-if.js","/assets/chevron-left-CSpTiWBo.js","/assets/chevrons-up-down-D9vrMcWG.js","/assets/circle-B52pwQD9.js","/assets/circle-alert-BVXasDev.js","/assets/circle-check-big-C9G-Y2XO.js","/assets/circle-minus-BdRsBpPr.js","/assets/circle-question-mark-DCIr8ZSJ.js","/assets/circle-slash-ixmA6sYx.js","/assets/circle-user-round-BQvImfGH.js","/assets/cloud-off-D-e4IHVf.js","/assets/cloud-upload-BZar5PYE.js","/assets/compass-CJGpF3DD.js","/assets/concernCategories-DpGeVj6M.js","/assets/copy-CnxIIGmU.js","/assets/corner-down-right-Dr2PbnF1.js","/assets/createLucideIcon-CPfdfRKl.js","/assets/es-CKRMLqja.js","/assets/exportXlsx-CEhVSIZk.js","/assets/external-link-B52cb2yT.js","/assets/file-clock-DGLVIcx3.js","/assets/file-exclamation-point-D7-yVSDG.js","/assets/file-spreadsheet-DJ8jpQoU.js","/assets/file-text-mbSXD10n.js","/assets/flag-CVvNrB9P.js","/assets/formatters-YGHSWdVb.js","/assets/funnel--37XAaiW.js","/assets/hash-BltkzDUh.js","/assets/history-BI4p-PYB.js","/assets/hourglass-lLa7kcf0.js","/assets/id-card-D9bkX4kW.js","/assets/image-CBFvo6CK.js","/assets/image-off-DvRfkcG8.js","/assets/inbox-DvqdPAkn.js","/assets/index-BctiIRrp.css","/assets/index-C3gwwSOm.js","/assets/key-round-DBgi5inC.js","/assets/keyboard-BcK25eYa.js","/assets/languages-CIYJbBr5.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C846jqOL.js","/assets/lightbulb-C_abNkYe.js","/assets/link-2-off--TXr59_x.js","/assets/link-2-tqSSY9tY.js","/assets/list-ordered-DawjwbD-.js","/assets/list-tree-CpTTv4nP.js","/assets/lock-open-hxf40YrN.js","/assets/log-in-C2lCqrXn.js","/assets/maximize-2-CZ_dfZG1.js","/assets/message-square-BKid0Lnn.js","/assets/minimize-2-B_STSjJS.js","/assets/package-check-DYeucY0E.js","/assets/paperclip-HzDWVaBj.js","/assets/pencil-CBVW60LY.js","/assets/percent-reXPtpgO.js","/assets/pin-Dj3aUMKQ.js","/assets/pin-off-CsfD811f.js","/assets/play-DOF6Y900.js","/assets/plug-zap-4z7PPudy.js","/assets/presentation-CKVpkzXw.js","/assets/prop-types-Dg8E17vL.js","/assets/radio-C1A-P9BU.js","/assets/react-apexcharts.esm-BT54rUwa.js","/assets/repeat-C9ceih7g.js","/assets/rotate-ccw-4exRJSwQ.js","/assets/rotate-cw-C5RQSRz7.js","/assets/save-D3GQOhhU.js","/assets/scopeLinks-DyTuYu1D.js","/assets/scroll-text-CGYR4Uka.js","/assets/search-x-DUgMvHrP.js","/assets/segments-CQgQtucy.js","/assets/send-DPckUBz_.js","/assets/settings-2-BG2htrPI.js","/assets/shield-B1FedsqN.js","/assets/shield-alert-ktNgXjtR.js","/assets/shield-check-C9U4JADp.js","/assets/shield-question-mark-DXwjORlW.js","/assets/siren-C6pPf2S1.js","/assets/snowflake-BOq1JsKr.js","/assets/split-BARADQyH.js","/assets/square-1J3hgb2H.js","/assets/square-check-big-DoAVmDnR.js","/assets/star-DnNpCoB0.js","/assets/statusBands-C56dyqt6.js","/assets/store-Bi4Q3EXx.js","/assets/table-2-D4rNBGa3.js","/assets/table-properties-DMOUrv3l.js","/assets/tag-Cq1tKjnc.js","/assets/timer-off-Bhlh30ef.js","/assets/trending-down-B7o3QsvF.js","/assets/trending-up-j8pJedzY.js","/assets/undo-2-aSzCCmXZ.js","/assets/useChartTheme-B9t7Jr_j.js","/assets/useElementWidth-BAs9KsLX.js","/assets/useIsMobile-D8Gi7Kgz.js","/assets/useOpenParam-DnKmqJpl.js","/assets/useStatusBands-eaL61wTV.js","/assets/useUrlScope-22v2d8um.js","/assets/user-Ds-4Cj1h.js","/assets/user-cog-QlIOiofE.js","/assets/user-minus-D_YCCJb-.js","/assets/users-D-QbQZOK.js","/assets/video-Dyf6hysj.js","/assets/wallet-z6UOaEWu.js","/assets/warehouse-BifIrO-V.js","/assets/x-BigB01CK.js","/assets/zap-DLznClKF.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
