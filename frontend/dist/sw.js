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

const BUILD = "2026-10-31T10:29:31.839Z";
const PRECACHE = ["/","/assets/AdminPanel-DQ0lbOrB.js","/assets/AnalysisBoard-DUSH4LVq.js","/assets/Arc-DWYv1A0X.js","/assets/Assessment-CgorsP98.js","/assets/AssessmentGrade-Q36RbOo9.js","/assets/AssessmentList-C5wa5cCx.js","/assets/Assistant-CpzTCLU9.js","/assets/BrigadirProfile-BpLRIt0r.js","/assets/BroadcastReceivers-D8F90EQp.js","/assets/BroadcastRecord-BmW5sdya.js","/assets/Button-o3COo_pt.js","/assets/CatLockNotice-BUTUduXQ.js","/assets/CategoryLegendModal-BG4x9TCk.js","/assets/CellConcerns-Di_sDPHC.js","/assets/CellDetails-_IezG7um.js","/assets/CellFormModal-DPfziEEg.js","/assets/CellIdent-DM3XGXC0.js","/assets/CellLink-CtVYsXjX.js","/assets/Cells-DrQkjGHo.js","/assets/ColumnFilter-D5tIPY3A.js","/assets/ColumnsPicker-BoxE8EaE.js","/assets/CommentsModal-2AtMHZTA.js","/assets/ComparisonTable-Ces2vKRw.js","/assets/Concerns-GgoxUbC9.js","/assets/CountStepper-CV0C588h.js","/assets/Daily-Cns5tM6u.js","/assets/DataTable-DKs9R4JU.js","/assets/DateRangePicker-CnJgZuO5.js","/assets/DayReportView-BbUvTb82.js","/assets/DayStepper-Axfl9IBS.js","/assets/DayStrip-B65JMOQv.js","/assets/DifferenceBreakdown-s0t7Qc_Z.js","/assets/Downtime-6GL4-jtl.js","/assets/Education-BAg46IFZ.js","/assets/EducationLesson-BPk395Df.js","/assets/EmptyState-BzycUnY-.js","/assets/Exam-DHaYXqQ1.js","/assets/FactorySelect-BAMD-Zqa.js","/assets/Gamification-B5eYCPNY.js","/assets/HeatmapChart-BT9YJo7D.js","/assets/IdleCell-DCJeixka.js","/assets/KPICard-6_Emtob9.js","/assets/Kaizen-BGD2itYD.js","/assets/Kelish-zSBMbzjp.js","/assets/KpiDeltaCard-B9kx5IB5.js","/assets/LangTextInput-aUJX8Dtp.js","/assets/Layout-C1xX9la4.js","/assets/LeaderAppeal-KPwBAa2l.js","/assets/LeaderDayReport-Dmw_mMtu.js","/assets/LeaderUnitReport-CpJ-ZbgL.js","/assets/Leaderboard-CkBPwU_4.js","/assets/Leaders-CjyDyPJi.js","/assets/LeadersKpi-CY3o7YbK.js","/assets/Lightbox-CIv8mlaz.js","/assets/LiveOverview-BgdL0umY.js","/assets/Login-CLUXK78b.js","/assets/NotFound-DDIBjox-.js","/assets/Notifications-ENfDJUM6.js","/assets/Ontime-CQHrySgw.js","/assets/Overview-T8YklXsr.js","/assets/Pagination-BC6omGgl.js","/assets/PerenaladkaFactTable-B1e0SIMK.js","/assets/PersonCard-rFTNMhh8.js","/assets/PlanFulfillment-8CXYW1sF.js","/assets/Production-Qv-CZpx-.js","/assets/Profile-D3PQweUz.js","/assets/ProofCamera-DLklloZ4.js","/assets/ProofPhoto-OzejIE45.js","/assets/Quality-DnBuBRzP.js","/assets/RawRows-BcsPaZDn.js","/assets/Reports-iDQsMsCa.js","/assets/RequestStateChip-CprlrhOj.js","/assets/RichTextEditor-BYnW2YSB.js","/assets/SaveState-D7dVEjMq.js","/assets/SearchInput-MEPnTdFj.js","/assets/SeasonalityHeatmap-DaF750xb.js","/assets/SegmentedToggle-CD8IUY3T.js","/assets/SetupTimes-BClheiEv.js","/assets/ShiftDaily-Bzhu_97O.js","/assets/Staff-Cegy3emC.js","/assets/StaffListAtCheck-B4FMbxj_.js","/assets/StatusBadge-CzIdlKmk.js","/assets/StatusBandsModal-BkEtKVIp.js","/assets/TargetGoal-CEf-rDf1.js","/assets/Targets-CTcfxDTW.js","/assets/Tasks-CNUIf_5X.js","/assets/TimeWheelPicker-CMnKyskx.js","/assets/Toast-BGdPlrGD.js","/assets/Tooltip-Dgh3TQ4W.js","/assets/TrendChart-x1N00RpD.js","/assets/TripleSpeedometer-CWGTUezd.js","/assets/Trudoyomkost-BGBiBwJ7.js","/assets/UploadDropzone-CkYZ8ysx.js","/assets/UsersActivity-j2BwV_1v.js","/assets/VerdictBlock-Cc3wwCLG.js","/assets/VfxApiMap-68DrF0Va.js","/assets/VfxDictionaries-CQTt-UYB.js","/assets/VfxEmployees-BWxv4i5e.js","/assets/VfxHrMoves-CGN_ySeg.js","/assets/VfxJobs-ALUxfBCp.js","/assets/VfxPhoto-fYOWi67Z.js","/assets/VfxShifts-B-g2-n4F.js","/assets/VfxState-DGTHCCLI.js","/assets/VfxTimebooks-p4gUHJz4.js","/assets/VfxTimesheet-i15dREAA.js","/assets/WatchProgress-D-4JnoRW.js","/assets/WebLogin-BhirQw7P.js","/assets/Workers-DFDqZuUu.js","/assets/Zagruzka-CCJ0tKzn.js","/assets/ZagruzkaCell-DC_XbpNh.js","/assets/api-BFm7MSgf.js","/assets/archive-DsAw-9se.js","/assets/archive-restore-Cic4O1JM.js","/assets/arrow-down-DGcY-rJc.js","/assets/arrow-down-right-CggpdJRP.js","/assets/arrow-down-wide-narrow-TycvG-Wa.js","/assets/arrow-up-narrow-wide-DolZ5oRB.js","/assets/ban-Cvx-ippJ.js","/assets/boxes-TrmpIkm1.js","/assets/braces-DKcabEUU.js","/assets/brigadirFilters-DWRGKDyi.js","/assets/broadcastTree-CJl7rM_l.js","/assets/calendar-BUp_cHEh.js","/assets/calendar-days-CMPRkj9V.js","/assets/camera-BvY2GD5X.js","/assets/categories-Be-S2qvo.js","/assets/cellMoveRefusal-DlBR122b.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cohlji7N.js","/assets/chart-line-CPH9guIF.js","/assets/chart-pie-IFzD5Q4I.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-CMZksntk.js","/assets/chevron-left-0zXJEdlK.js","/assets/chevrons-up-down-CMwFSjuh.js","/assets/circle-DNzG2W8J.js","/assets/circle-alert-iKYAc4vc.js","/assets/circle-check-big-C884Gdmd.js","/assets/circle-dashed-DlHFN1Q2.js","/assets/circle-minus-CYDs6Ib8.js","/assets/circle-question-mark-BHA6akKI.js","/assets/circle-user-round-CgYzNvOV.js","/assets/cloud-off-DJpWJhDT.js","/assets/cloud-upload-B55RnSb7.js","/assets/coins-CmDcHifu.js","/assets/compass-CGUVVhcH.js","/assets/concernCategories-DMQShI1T.js","/assets/corner-down-right-kymd-9zW.js","/assets/createLucideIcon-9OrHDYVc.js","/assets/en-CG64Rvm1.js","/assets/es-Dtgc5NM1.js","/assets/external-link-BkVqEBdm.js","/assets/file-exclamation-point-BZ1Vx73I.js","/assets/flag-Tkey7H00.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DdNGbkUL.js","/assets/funnel-BkAzpEbZ.js","/assets/hard-hat-CVpBbHt9.js","/assets/hash-CskobnCm.js","/assets/hourglass-BwMFEnBg.js","/assets/idleTime-CHPnJRpw.js","/assets/image-DLRVsSR_.js","/assets/image-off-BWw2_6yp.js","/assets/inbox-BRzHpAUh.js","/assets/index-DyGNvhcT.js","/assets/index-m5Y3-KaA.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DNcdTUK-.js","/assets/layers-Wy3IDRQa.js","/assets/leaderBoard-Cu79GRG8.js","/assets/lightbulb-DV9amOew.js","/assets/link-2-DXR5woAY.js","/assets/link-2-off-D02RVjGk.js","/assets/list-ordered-BJ5-Tx8K.js","/assets/list-tree-Djnvv_nl.js","/assets/lock-open-3OyFTag2.js","/assets/log-in-ChYrAsrr.js","/assets/map-pin-BG5XAPZN.js","/assets/marks-CHmj6W13.js","/assets/message-square-text-DpRPbM5v.js","/assets/minimize-2-P0p134-y.js","/assets/package-DkNb4Q2-.js","/assets/package-check-C6Zn0Nzd.js","/assets/pencil-CumMxN02.js","/assets/percent-CY9MKjQk.js","/assets/pin-D4IQN_CO.js","/assets/pin-off-CsqE4TFE.js","/assets/play-DpaqzzOk.js","/assets/plug-zap-CnK3sEsx.js","/assets/prop-types-RD3fbola.js","/assets/radio-DXNb29bv.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-D3oYP7Gm.js","/assets/repeat-CwkkgEaC.js","/assets/ru-D6tbPBs3.js","/assets/save-10UIH72o.js","/assets/scopeLinks-DlqGKsJP.js","/assets/search-x-DSdqtPY-.js","/assets/segments-D5Uiedtv.js","/assets/send-VfhmZ3ij.js","/assets/shield-KwnUXjwq.js","/assets/shield-alert-ommleNCZ.js","/assets/sigma-CbOWYSb-.js","/assets/siren-hbPhIl9A.js","/assets/snowflake-BXBD7YRo.js","/assets/split-B5RJ02Tq.js","/assets/square-check-big-CQU8aXE5.js","/assets/star-CIySLcvK.js","/assets/statusBands-DVBZcBq3.js","/assets/store-K-xCAtMD.js","/assets/table-2-UPY9UDP0.js","/assets/table-properties-CPUnTDBG.js","/assets/tag-CMnn10aW.js","/assets/timer-off-CEgKWt_W.js","/assets/translations-BvzW-db7.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-CAKUFygN.js","/assets/trending-up-DJXL0j5n.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-CWzDFKbq.js","/assets/useChartTheme-dJoC9xH2.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-BuP5Qxoi.js","/assets/useStatusBands-Cs_92ofE.js","/assets/useUrlScope-arWVjTHP.js","/assets/user-Dg7nzMFb.js","/assets/user-cog-6kSAkO4H.js","/assets/uz-DRHqFATI.js","/assets/uz_cyrl-08gyyt72.js","/assets/vfx-DdilTcfw.js","/assets/video-Cf0qPS3P.js","/assets/wallet-ByfGRnBk.js","/assets/warehouse-CsY-NCCo.js","/assets/workflow-DtM44pyY.js","/assets/x-D3BtYRDS.js","/assets/zap-DRdFLW-d.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
