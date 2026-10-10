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

const BUILD = "2026-10-10T08:27:54.573Z";
const PRECACHE = ["/","/assets/AdminPanel-BEEaZxGX.js","/assets/AnalysisBoard-Chidk6L1.js","/assets/Arc-lMPFq_Rk.js","/assets/Assistant-BUJ3lA76.js","/assets/BrigadirProfile-Dkwx2t7E.js","/assets/BroadcastReceivers-D9EkHo_O.js","/assets/BroadcastRecord-CL40t-wE.js","/assets/Button-1eFcaVtD.js","/assets/CatLockNotice-BmPsMtUH.js","/assets/CategoryLegendModal-DOLMDLaq.js","/assets/CellConcerns-CsqssWzF.js","/assets/CellDetails-DeTaMFZP.js","/assets/CellFormModal-1_sHgLFw.js","/assets/CellIdent-51r7uhZz.js","/assets/CellLink-CXdWpmdH.js","/assets/Cells-6Jpsu_X1.js","/assets/ColumnFilter-CTR3Wyl_.js","/assets/ColumnsPicker-LNuA6Yff.js","/assets/CommentsModal-qkgLWbSB.js","/assets/ComparisonTable-CIOFHYBr.js","/assets/Concerns-DojudC_c.js","/assets/Daily-BcI-a3zz.js","/assets/DataTable-D9gkGmk5.js","/assets/DateRangePicker-CFjCb1Dw.js","/assets/DayReportView-sS4v2TRC.js","/assets/DayStepper-BMrRcPO-.js","/assets/DifferenceBreakdown-rTm6zUTT.js","/assets/Downtime-D6v4pyF4.js","/assets/Education-Cr-9PVTM.js","/assets/EducationLesson-D1ERnDSA.js","/assets/EmptyState-CqJ-o-n2.js","/assets/Exam-1csfC6ub.js","/assets/FactorySelect-DNubCrNP.js","/assets/Gamification-DLA4Kmqi.js","/assets/GroupBadge-DR9Z3Jjg.js","/assets/HeatmapChart-Dm8Ro4qX.js","/assets/IdleCell-VuasmgS9.js","/assets/KPICard-BdqbWqBU.js","/assets/Kaizen-BL6bzgqP.js","/assets/Kelish-Dw6nQqW1.js","/assets/KpiDeltaCard-DJEzXAcQ.js","/assets/LangTextInput-DaCBfTs_.js","/assets/Layout-E1BNtSQB.js","/assets/LeaderAppeal-C3sJ3yEz.js","/assets/LeaderDayReport-CUp5J0zA.js","/assets/LeaderUnitReport-BOjhc5Ht.js","/assets/Leaderboard-DCEbug78.js","/assets/Leaders-SsN-HR1r.js","/assets/Lightbox-TAg8AO1E.js","/assets/LiveOverview-D_Kglcr_.js","/assets/Login-3p5NWWDh.js","/assets/NotFound-Bh_xcmDq.js","/assets/Notifications-fWAFaTh1.js","/assets/Overview-DHP5WMhU.js","/assets/Pagination-B-2_H160.js","/assets/PerenaladkaFactTable-CtFMZN9t.js","/assets/PersonCard-bM8OZzIZ.js","/assets/PlanFulfillment-BA7DvoDz.js","/assets/Production-CaXJKYul.js","/assets/Profile-CV58p_Ej.js","/assets/ProofCamera-KSlf8rEo.js","/assets/ProofPhoto-Dp2x5JX0.js","/assets/Quality-Dp70SfMq.js","/assets/RawRows-CeZ-E5u5.js","/assets/RequestStateChip-Lkv36sSR.js","/assets/RichTextEditor-fj26Foao.js","/assets/SaveState-DpGHGaPn.js","/assets/SearchInput-D0yLUEX7.js","/assets/SeasonalityHeatmap-B4IwR9jZ.js","/assets/SegmentedToggle-CloFhpSJ.js","/assets/SetupTimes-CJgEZUsT.js","/assets/ShiftDaily-BZfPtuQ4.js","/assets/Staff-B7aRWf8Z.js","/assets/StatusBadge-DoRdd4wr.js","/assets/TargetGoal-B8YHl_2v.js","/assets/Targets-Ba5_OC08.js","/assets/Tasks-D399Pmuc.js","/assets/TimeWheelPicker-ArVCcGXT.js","/assets/Toast-CCVFzK1A.js","/assets/Tooltip-tDLXJQUz.js","/assets/TrendChart-pD9c1J_S.js","/assets/TripleSpeedometer-DUGeDJrH.js","/assets/Trudoyomkost-aMKvYKc7.js","/assets/Turnover-C6rb_kUw.js","/assets/UploadDropzone-Bgx2W1uB.js","/assets/UsersActivity-DKx3IEpv.js","/assets/VerdictBlock-DvYg5srV.js","/assets/VfxApiMap-89DIfq1D.js","/assets/VfxDictionaries-Cdzyxqlr.js","/assets/VfxEmployees-DmQlHoFS.js","/assets/VfxHrMoves-B2WZ6ylt.js","/assets/VfxJobs-C-g51rzK.js","/assets/VfxPhoto-D8xUzBr6.js","/assets/VfxShifts-D97Z4W2L.js","/assets/VfxState-CX2EqtVz.js","/assets/VfxTimebooks-7lQ3VbnA.js","/assets/VfxTimesheet-m-e-JSyu.js","/assets/WatchProgress-CWIiiQV9.js","/assets/WebLogin-BuIEat6m.js","/assets/WorkerConcerns-BwL-cGzD.js","/assets/Workers-BMQVBFJB.js","/assets/Zagruzka-ofLR-WYE.js","/assets/ZagruzkaCell-DVaGSYV3.js","/assets/api-X1-YSMil.js","/assets/archive-BISI0Bwa.js","/assets/archive-restore-aVOwg-XZ.js","/assets/arrow-down-ChKkF_AF.js","/assets/arrow-down-wide-narrow-Cx1T0KKp.js","/assets/arrow-up-narrow-wide-CyH3tAC-.js","/assets/award-BwH4Gmv-.js","/assets/ban-CnZkjuS1.js","/assets/boxes-DbqwakUd.js","/assets/braces-i1zZ9flA.js","/assets/brigadirFilters-CJnt0OnZ.js","/assets/broadcastTree-De8V7XQG.js","/assets/building-2-SwDG49Jv.js","/assets/calculator-fLkf74ww.js","/assets/calendar-DencTaYJ.js","/assets/calendar-days-CqAFE5P_.js","/assets/camera-DswBu2gC.js","/assets/categories-BZSwsd_o.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-To5PNIVK.js","/assets/chart-line-D-CeD_mf.js","/assets/chart-pie-7cjP6_C2.js","/assets/chartRange-BLM5IHEl.js","/assets/check-check-5bXo3X76.js","/assets/chevron-left-DXFgPXC8.js","/assets/chevrons-up-down-ZgSsH35z.js","/assets/circle-9kEY2CJL.js","/assets/circle-alert-DClR-t7i.js","/assets/circle-check-big-B0o2qf9L.js","/assets/circle-dashed-12Yw5nBb.js","/assets/circle-minus-CmKQALVM.js","/assets/circle-question-mark-BpSS0hsM.js","/assets/circle-slash-CdzAQb_A.js","/assets/circle-user-round-Bi8jbjZP.js","/assets/clock-3-C-6uMTy8.js","/assets/cloud-off-By3rekOy.js","/assets/cloud-upload-BJwa_d3P.js","/assets/compass-DFiBPhbu.js","/assets/concernCategories-CXfaYAAx.js","/assets/copy-CPgD_W-8.js","/assets/corner-down-right-DrhQEkXk.js","/assets/createLucideIcon-ZLE1AeKq.js","/assets/es-BIA6wvB1.js","/assets/external-link-C6-BTxJH.js","/assets/file-clock-BHsn3tpe.js","/assets/file-exclamation-point-CuI4uX6F.js","/assets/flag-Cr4ZOyCH.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Bs405u_q.js","/assets/hash-BYrZ8T1u.js","/assets/hourglass-ByLrBxhy.js","/assets/image-CVRAlDl0.js","/assets/image-off-zXSJ7vic.js","/assets/inbox-rDYUYbXT.js","/assets/index-DD8ZJtYw.css","/assets/index-i3-rV9pt.js","/assets/keyboard-u0EpidNR.js","/assets/languages-ChD4SXWg.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BP8oUH2L.js","/assets/lightbulb-BY4j0lkk.js","/assets/link-2-ll-7iJ4d.js","/assets/link-2-off-EyTaK8aa.js","/assets/list-ordered-QC68NFHS.js","/assets/list-tree-D5lN6qmd.js","/assets/lock-open-DSBSWIZ4.js","/assets/log-in-CjI6Forb.js","/assets/minimize-2-BnLYLcW4.js","/assets/package-check-FAAvDknL.js","/assets/pencil-DyZErR9b.js","/assets/percent-DEwI3Bw1.js","/assets/pin-AoNzBYN9.js","/assets/pin-off-DRM2NJ-9.js","/assets/play-BgtmBe5u.js","/assets/plug-zap-CfHZqfUT.js","/assets/prop-types-BtVY4K6t.js","/assets/radio-DSAPaFMe.js","/assets/react-apexcharts.esm-DOdEL1Zb.js","/assets/registers-DEMsJ8mM.js","/assets/repeat-Bre6kQOu.js","/assets/save-CQMS_So0.js","/assets/scopeLinks-0YkfDCJ7.js","/assets/scroll-text-e7KPgyCs.js","/assets/search-x-Cq69gp0j.js","/assets/segments-B50ohYAL.js","/assets/send-XjCKBtNg.js","/assets/settings-2-eSZN17XY.js","/assets/shield-BQ68tFO_.js","/assets/shield-alert-j0uYqxdU.js","/assets/shield-question-mark-ZaHzryoL.js","/assets/siren-CfagSld4.js","/assets/snowflake-CRvWRfVS.js","/assets/split-CyhIpOEC.js","/assets/square-check-big-CmHgiOsX.js","/assets/star-bIIoyrCX.js","/assets/statusBands-vCu_GCHw.js","/assets/store-MAbl7pgs.js","/assets/table-2-CmLI-kd8.js","/assets/table-properties-gyESD4C1.js","/assets/tag-DgEZbGVf.js","/assets/timer-off-BT8g8IaS.js","/assets/trending-down-Cdlq_aG-.js","/assets/trending-up-DyTeECMN.js","/assets/undo-2-CZgMRopt.js","/assets/useChartTheme-BEx_M6WT.js","/assets/useElementWidth-Dmj5cx2K.js","/assets/useIsMobile-DPrhwuuI.js","/assets/useOpenParam-CsWb0tlP.js","/assets/useStatusBands-CUs2KzLn.js","/assets/useUrlScope-uy8mY5w1.js","/assets/user-D00TOB_D.js","/assets/user-cog-D18i-GS8.js","/assets/users-CkWRU4G7.js","/assets/vfx-D8TrY_Ta.js","/assets/video-BgQ5yP3s.js","/assets/wallet-D9GeJhZi.js","/assets/warehouse-CXfRXUmZ.js","/assets/x-u249PNxX.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
