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

const BUILD = "2026-10-03T11:12:49.220Z";
const PRECACHE = ["/","/assets/AdminPanel-DzeDq0nr.js","/assets/AnalysisBoard-_GNgo_51.js","/assets/Arc-VBUGQtnM.js","/assets/ArcLegacy-YzAMxw_C.js","/assets/BrigadirProfile-CSenbzA4.js","/assets/BroadcastReceivers-Cp6UyIlL.js","/assets/BroadcastRecord-CtAPMy74.js","/assets/CatLockNotice-BKMDR1qL.js","/assets/CategoryLegendModal-DtmQt2Xu.js","/assets/CellConcerns-CfnFS7d_.js","/assets/CellDetails-aL1LMgSG.js","/assets/CellFormModal-CT-3VH8J.js","/assets/CellIdent-VpsoaMFz.js","/assets/CellLink-Beq5LEGJ.js","/assets/Cells-CUVrw1vI.js","/assets/ColumnFilter-BaYNG6vm.js","/assets/ColumnsPicker-BvFY8_LR.js","/assets/CommentsModal-Bf49dCmI.js","/assets/ComparisonTable-M4kfmV8f.js","/assets/Concerns-BoBo1k_c.js","/assets/ConfirmDialog-BocAuZ7J.js","/assets/Daily-D8u4yESV.js","/assets/DataTable-sXWmRlBu.js","/assets/DateRangePicker-DHRIcrNW.js","/assets/DayReportView-Cwvllfan.js","/assets/DayStepper-7GdEmQTY.js","/assets/DifferenceBreakdown-Cw1bP-u9.js","/assets/Downtime-CnHf7RwX.js","/assets/Education-NPv43_wW.js","/assets/EducationLesson-Dy5JrlF3.js","/assets/EmptyState-D2Z1lH8v.js","/assets/Exam-CaSd5LLH.js","/assets/FactorySelect-DjOaUAnl.js","/assets/Gamification-DX6hUEW6.js","/assets/GroupBadge-Cy4Ol_tl.js","/assets/HeatmapChart-CZdvJMPX.js","/assets/IdleCell-jJ0YXDDV.js","/assets/KPICard-BfGeZDAn.js","/assets/Kaizen-DyBNbXTo.js","/assets/Kelish-C3aSevtl.js","/assets/KpiDeltaCard-DmbigoZL.js","/assets/LangTextInput-D8EY6zuO.js","/assets/Layout-CHdX_vyX.js","/assets/LeaderAppeal-DCL_2czh.js","/assets/LeaderDayReport-im42vA8X.js","/assets/LeaderUnitReport-BPQIoxn-.js","/assets/Leaderboard-KBAk_z0F.js","/assets/Leaders-DtR2J3fI.js","/assets/Lightbox-CSpTE4v5.js","/assets/LiveOverview-CN9ACxsX.js","/assets/Login-BiXxgl19.js","/assets/NotFound-uVSpXvXv.js","/assets/Notifications-CZZxG53A.js","/assets/Overview-Bg6CYHkA.js","/assets/Pagination-DvYWLjP1.js","/assets/PerenaladkaFactTable-C64ke6Ga.js","/assets/PersonCard-CxzafPkA.js","/assets/PlanFulfillment-CS2sUxVZ.js","/assets/Production-DCxLUq-C.js","/assets/Profile-DoejCcER.js","/assets/ProofCamera-O8uOuFTI.js","/assets/ProofPhoto-No1IdMcJ.js","/assets/Quality-C9mDglMQ.js","/assets/RawRows-D0uQtW_n.js","/assets/RequestStateChip-CYXfMS3F.js","/assets/RichTextEditor-OOebsoot.js","/assets/SaveState-DabP_ReW.js","/assets/SearchInput-DeRJhXJU.js","/assets/SeasonalityHeatmap-Bw-u0Sbl.js","/assets/SegmentedToggle-p5w_SUiH.js","/assets/SetupTimes-0Xo_FHTV.js","/assets/ShiftDaily-pw3X8ZiT.js","/assets/Staff-B18yO7eI.js","/assets/StaffLive-COheCOzh.js","/assets/StatusBadge-CTIKD1vZ.js","/assets/TargetGoal-CfRm3EDi.js","/assets/Targets-BKOjSHqD.js","/assets/Tasks-D9rL1tuU.js","/assets/TimeWheelPicker-BPszTBlY.js","/assets/Toast-YIrx5j98.js","/assets/Tooltip-CN9p2y5Y.js","/assets/TrendChart-BMdG8yRV.js","/assets/TripleSpeedometer-BXK_ftRD.js","/assets/Trudoyomkost-BgNPB3iu.js","/assets/UploadDropzone-4W22Tbcl.js","/assets/UsersActivity-A7pvaA-E.js","/assets/VerdictBlock-3NiU-6-H.js","/assets/VfxApiMap-B5ntOmNI.js","/assets/VfxEmployees-zkqiECdi.js","/assets/VfxJobs-C_V7mspI.js","/assets/VfxMarks-CRBxTNH5.js","/assets/VfxOnSite-BDD6cvB9.js","/assets/VfxPhoto-CE5NU5pw.js","/assets/VfxState-BLtQ7B9y.js","/assets/VfxStructure-C1kNBkHf.js","/assets/VfxTable-B1uRKIIS.js","/assets/VfxTimesheet-BLIxeE0F.js","/assets/WatchProgress-Y1TPe-hu.js","/assets/WebLogin-BI-kBkV1.js","/assets/WorkerConcerns-CQSAnWk-.js","/assets/Workers-D3Dh8h4b.js","/assets/Zagruzka-BJbXwR0D.js","/assets/ZagruzkaCell-DEJSTAgS.js","/assets/api-vYunhqzy.js","/assets/archive-BN_2B2iJ.js","/assets/archive-restore-DS3XwkkN.js","/assets/arrow-down-CTjyh0TF.js","/assets/arrow-left-DDwFxJgd.js","/assets/arrow-right-left-D7Dga_7S.js","/assets/arrow-up-BCjLVLud.js","/assets/arrow-up-narrow-wide-Bd0N2e6y.js","/assets/arrow-up-right-CQQ9VcT3.js","/assets/award-IZ_nvG7k.js","/assets/ban-yXgO1Wrc.js","/assets/bot-CJ0V2cBz.js","/assets/boxes-Cq8YG5I_.js","/assets/braces-CsT9reNd.js","/assets/brigadirFilters-DWjJH2Tl.js","/assets/broadcastTree-Bn6q5TLs.js","/assets/building-2-BDpl5keM.js","/assets/calendar-D4v__-uu.js","/assets/calendar-days-BG9ScqK0.js","/assets/camera-BGzjgYVc.js","/assets/categories-BDkjEYHo.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D51vmyFS.js","/assets/chart-line-bmiNd7Qj.js","/assets/chart-pie-D6lSLvoV.js","/assets/chartRange-Cp30MDPb.js","/assets/chevron-left-B_Q2VTq9.js","/assets/chevrons-up-down-C99sOpdj.js","/assets/circle-alert-BDkrjBtj.js","/assets/circle-check-big-C1rWwNQt.js","/assets/circle-dashed-CENVj4v7.js","/assets/circle-minus-BrU_pSvZ.js","/assets/circle-question-mark-DSEkcMdv.js","/assets/circle-slash-CZlAnvyQ.js","/assets/circle-uLk4Zukd.js","/assets/circle-user-round-C_SKz8fv.js","/assets/clock-3-ewMj0mQ7.js","/assets/cloud-off-DlOaJajk.js","/assets/cloud-upload-t6gKLqr8.js","/assets/compass-VMRqKpkK.js","/assets/concernCategories-sN14jUcO.js","/assets/copy-zfPQ3Xf7.js","/assets/corner-down-right-rY8LO1Kl.js","/assets/createLucideIcon-i7p3fWKB.js","/assets/door-open-DHmuYy9I.js","/assets/es-3PrBdmfA.js","/assets/exportXlsx-Dg48scOM.js","/assets/external-link-D8PDpFBh.js","/assets/file-clock-DSvU7EgX.js","/assets/file-exclamation-point-P3LRFlga.js","/assets/file-spreadsheet-jUS1ralT.js","/assets/file-text-wTtWFkJz.js","/assets/flag-CRqhL79r.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-B2OgKUR-.js","/assets/hash-CPASemvu.js","/assets/history-CG_ZNaVK.js","/assets/hourglass-DSgNRZzt.js","/assets/image-BfHf3N4b.js","/assets/image-off-B8TGX25F.js","/assets/inbox-BiKgefsI.js","/assets/index-C8ijKklJ.js","/assets/index-E1HDeal_.css","/assets/key-round-BlQUKtKh.js","/assets/keyboard-O_6t1LUM.js","/assets/languages-SV4P3bOZ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DywLFcyq.js","/assets/lightbulb-7Xrs4D0G.js","/assets/link-2-Cjztne0J.js","/assets/link-2-off-CxlEWL2y.js","/assets/list-ordered-BM3VzBPm.js","/assets/list-tree-ChLL_-7A.js","/assets/lock-open-DWDIYOjU.js","/assets/log-in-BdvX9C-T.js","/assets/maximize-2-CPUPJ-7Y.js","/assets/message-square-BG8bmXk0.js","/assets/minimize-2-_4j1-gcm.js","/assets/package-check-BdCLx8sQ.js","/assets/paperclip-DmSPLFpg.js","/assets/pencil-JtT04X55.js","/assets/percent-D4VF0jZ3.js","/assets/phone-l3Tn9b5V.js","/assets/pin-CrejnBVJ.js","/assets/pin-off-Db2Z4yDK.js","/assets/play-BKx6AClF.js","/assets/plug-zap-9YGNdEap.js","/assets/presentation-BouQK5Z7.js","/assets/prop-types-Be7AWCoT.js","/assets/radio-k9mSupME.js","/assets/react-apexcharts.esm-DMRvhkdK.js","/assets/repeat-BlBn5q3l.js","/assets/rotate-ccw-eUbxw-5q.js","/assets/rotate-cw-CMhwic5j.js","/assets/save-BGMsc-Pu.js","/assets/scopeLinks-BmJEBjDD.js","/assets/scroll-text-2YTHgczL.js","/assets/search-x-D4KuRZXV.js","/assets/segments-BU0admY_.js","/assets/send-Dpzr1MXb.js","/assets/settings-2-BQ8KY-ED.js","/assets/shield-DMZd5q61.js","/assets/shield-alert-DNBAlzyp.js","/assets/shield-check-BR_ZAcWC.js","/assets/shield-question-mark-DvTQr46D.js","/assets/siren-BwLfJiIt.js","/assets/snowflake-BixMuoFf.js","/assets/split-DBA0L_Rj.js","/assets/square-CRRV78eP.js","/assets/square-check-big-DRtpsuZy.js","/assets/star-mA0bn6fE.js","/assets/statusBands-B14gXTrx.js","/assets/store-Dlu4CYr7.js","/assets/table-2-BawK4Y6q.js","/assets/table-properties-BXBB8vIf.js","/assets/tag-Naoi4cGE.js","/assets/timer-off-KvtR8_X4.js","/assets/trending-down-DzOQomnH.js","/assets/trending-up-zS7XeAyJ.js","/assets/undo-2-KqfhHRcR.js","/assets/useChartTheme-899O298y.js","/assets/useElementWidth-fBJYeRiv.js","/assets/useIsMobile-DqT0_d7o.js","/assets/useOpenParam-CdPtKJiS.js","/assets/useStatusBands-BQ_N9SVw.js","/assets/useUrlScope-BEbbzwvv.js","/assets/user-DYCjPlis.js","/assets/user-cog-ChaEqoOJ.js","/assets/user-minus-ByAsZObN.js","/assets/users-goPwBFTU.js","/assets/video-BJW5ZCaZ.js","/assets/wallet-Cw4w4vir.js","/assets/warehouse-Bbsq4k2d.js","/assets/x-BXh7k46e.js","/assets/zap-BzjYgqUH.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
