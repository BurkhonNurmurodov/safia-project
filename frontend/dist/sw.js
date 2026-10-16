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

const BUILD = "2026-10-16T09:39:39.834Z";
const PRECACHE = ["/","/assets/AdminPanel-DP76gfVB.js","/assets/AnalysisBoard-Cib49ZzJ.js","/assets/Arc-D1PM-V8l.js","/assets/Assistant-DpDzkZma.js","/assets/BrigadirProfile-C7h68vjt.js","/assets/BroadcastReceivers-BVsBKggk.js","/assets/BroadcastRecord-adiEmns2.js","/assets/Button-BVPTSnAF.js","/assets/CatLockNotice-BD8eFuku.js","/assets/CategoryLegendModal-CPLup_Rd.js","/assets/CellConcerns-CdF3HhCl.js","/assets/CellDetails-CPiq9ZXv.js","/assets/CellFormModal-D2hhHEQR.js","/assets/CellIdent-CO6Kju10.js","/assets/CellLink-TPu16WDR.js","/assets/Cells-Dg5zeaTP.js","/assets/ColumnFilter-H78v6RNl.js","/assets/ColumnsPicker-CDjsts9V.js","/assets/CommentsModal-C-0Wbpce.js","/assets/ComparisonTable-e-99BvVK.js","/assets/Concerns-PnE_1mnY.js","/assets/CountStepper-RQa2oddL.js","/assets/Daily-DUfgMQ-v.js","/assets/DataTable-D9K0NduK.js","/assets/DateRangePicker-v_ubJGvY.js","/assets/DayReportView-CNpmEho_.js","/assets/DayStepper-CS_FB0nk.js","/assets/DifferenceBreakdown-B6DZI9KX.js","/assets/Downtime-C_8YdNR4.js","/assets/Education-DxWEWQ07.js","/assets/EducationLesson-V0WQiHP5.js","/assets/EmptyState-D4g-ceNj.js","/assets/Exam-CqWAQEdg.js","/assets/FactorySelect-DBUoO2Kw.js","/assets/ForeignObjects-BfQ3EAB_.js","/assets/Gamification-COVqGLir.js","/assets/GroupBadge-CY_SKLVB.js","/assets/HeatmapChart-ClmyaiH_.js","/assets/IdleCell-qVo3ofE8.js","/assets/KPICard-CfGC5uT0.js","/assets/Kaizen-DrNnJIL_.js","/assets/Kelish-B_aNBAEc.js","/assets/KpiDeltaCard-BP8sV5v4.js","/assets/LangTextInput-BABFqE-9.js","/assets/Layout-D4t9A6m5.js","/assets/LeaderAppeal-CswF_KV9.js","/assets/LeaderDayReport-CfNqRfLG.js","/assets/LeaderUnitReport-FmkW_wU8.js","/assets/Leaderboard-Do1L3130.js","/assets/Leaders-C1yqhBOQ.js","/assets/Lightbox-DmOQemMd.js","/assets/LiveOverview-B4u-mi8v.js","/assets/Login-CkDE-meJ.js","/assets/NotFound-DzTUDZ1v.js","/assets/Notifications-BgJG1J8x.js","/assets/Overview-D5efQcOk.js","/assets/Pagination-DetK4fDM.js","/assets/PerenaladkaFactTable-z5Dsm1PV.js","/assets/PersonCard-CR_qTuDq.js","/assets/PlanFulfillment-D7Wnj1BT.js","/assets/Production-UPP69x0h.js","/assets/Profile-1V9x5ARZ.js","/assets/ProofCamera-uO6Nvx4r.js","/assets/Quality-B2lg2wG3.js","/assets/RawRows-BmkPYz7k.js","/assets/RequestStateChip-BCRZzBt-.js","/assets/RichTextEditor-BNjZH_Rx.js","/assets/SaveState-DKSXR07o.js","/assets/SearchInput-CtmtU4Yo.js","/assets/SeasonalityHeatmap-CS8YMAMj.js","/assets/SegmentedToggle-CmZ61lqf.js","/assets/SetupTimes-CNiEE9mi.js","/assets/ShiftDaily-CzYbeCma.js","/assets/Staff-B_MEv-HI.js","/assets/StaffListAtCheck-DMZKDNHP.js","/assets/StatusBadge-odg57RS6.js","/assets/TargetGoal-CrOoazlf.js","/assets/Targets-D9KB-p9C.js","/assets/Tasks-C7va_CXk.js","/assets/TimeWheelPicker-BBoPCo1I.js","/assets/Toast-Baczvwkh.js","/assets/Tooltip-CiBgDPk0.js","/assets/TrendChart-DnEqoeyG.js","/assets/TripleSpeedometer-DWE5omFw.js","/assets/Trudoyomkost-vxXh9Ayz.js","/assets/Turnover-DXcNwH_P.js","/assets/TurnoverBits-DGatv2Ff.js","/assets/UploadDropzone-Dh4hRI9T.js","/assets/UsersActivity-BBZNWaOB.js","/assets/VerdictBlock-BlQ5mGZj.js","/assets/VfxApiMap-BlxEw1_m.js","/assets/VfxDictionaries-CW_5vrWQ.js","/assets/VfxEmployees-IWBL8nB-.js","/assets/VfxHrMoves-CC-O7d5J.js","/assets/VfxJobs-CR3AYX0C.js","/assets/VfxPhoto-tJXLiKNC.js","/assets/VfxShifts-DZpDUAxF.js","/assets/VfxState-Cb9NiQM3.js","/assets/VfxTimebooks-Cr6s1mjH.js","/assets/VfxTimesheet-BnbpzsjJ.js","/assets/WatchProgress-Cx2VJp52.js","/assets/WebLogin-kNOY8-CI.js","/assets/WorkerConcerns-Czz5Gt5r.js","/assets/Workers-BQT7IctA.js","/assets/Zagruzka-C6klV8zL.js","/assets/ZagruzkaCell-C5N9li-J.js","/assets/api-CjznwjTT.js","/assets/archive-Dry79ZUR.js","/assets/archive-restore-DPHneg0F.js","/assets/arrow-down-Cc2lEL5G.js","/assets/arrow-down-wide-narrow-SB0zNpUb.js","/assets/arrow-up-narrow-wide-DgWA6zxV.js","/assets/award-BQ2UUM85.js","/assets/ban-BaEQ9JpX.js","/assets/boxes-R0j0oF9E.js","/assets/braces-CbktF36z.js","/assets/brigadirFilters-MhWi5rYT.js","/assets/broadcastTree-DfaP5b9Z.js","/assets/building-2-BvqpB62T.js","/assets/calculator-ImLZGGbj.js","/assets/calendar-days-u1zVJOMq.js","/assets/calendar-yKz9Nk6S.js","/assets/camera-B1TS9R7u.js","/assets/categories-VYHjWOaP.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-LrhHt6X3.js","/assets/chart-line-BQTuQTJA.js","/assets/chart-pie-B1Gmkkkg.js","/assets/chartRange-Ce0WelvQ.js","/assets/check-check-Co04S8aj.js","/assets/chevron-left-DAUh8EhD.js","/assets/chevrons-up-down-ss1lDIi6.js","/assets/circle-BaqRp-BG.js","/assets/circle-alert-BWHTeHtu.js","/assets/circle-check-big-CTYxxPSW.js","/assets/circle-dashed-CU1H2UEV.js","/assets/circle-minus-BB6kRy_r.js","/assets/circle-question-mark-Dxh1rLUp.js","/assets/circle-slash-BCU9gKc2.js","/assets/circle-user-round-NMysP70A.js","/assets/clock-3-Af4t7fFi.js","/assets/cloud-off-DsdMpjef.js","/assets/cloud-upload-_nDaw984.js","/assets/compass-CKW2eJ-q.js","/assets/concernCategories-DyAow5FA.js","/assets/copy-Dav5Fpyc.js","/assets/corner-down-right-m-Q04vhd.js","/assets/createLucideIcon-DDkJdQXM.js","/assets/es-bsWV3Bhm.js","/assets/external-link-DFnGAUxo.js","/assets/file-clock-DKg2OFcB.js","/assets/file-exclamation-point-CBTFkwsC.js","/assets/flag-Xqh1IdEZ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BAHmsduC.js","/assets/hash-uiDxILbv.js","/assets/hourglass-DyhYJLlW.js","/assets/image-B5Ois3mR.js","/assets/image-off-4u6cn3LE.js","/assets/inbox-vhMGRgw_.js","/assets/index-BJaKr_PA.js","/assets/index-DqsFM9e_.css","/assets/keyboard-C3hkhdKA.js","/assets/languages-DDXPe7Za.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-D9-LOFhz.js","/assets/lightbulb-BbnnHfeP.js","/assets/link-2-CTnFGpcy.js","/assets/link-2-off-B9hKSNsq.js","/assets/list-ordered-CAqXuXbE.js","/assets/list-tree-B0BOIFhq.js","/assets/lock-open-CKR8Fcio.js","/assets/log-in-ByppSd53.js","/assets/marks-CFoMWlPS.js","/assets/minimize-2-hj9kGl1y.js","/assets/package-check-bIOqCJxB.js","/assets/pencil-CmLbLBLK.js","/assets/percent-C0j-Lwyy.js","/assets/pin-DXWnoCPA.js","/assets/pin-off-Cztj9zeU.js","/assets/play-BPs_yneb.js","/assets/plug-zap-CU8sc7W5.js","/assets/prop-types-BukzTVzl.js","/assets/radio-BNi0DE8-.js","/assets/react-apexcharts.esm-CYWQPEPX.js","/assets/registers-6f1jxBwF.js","/assets/repeat-CNg-WtEF.js","/assets/save-DPT-XCbu.js","/assets/scopeLinks-B7OJ6aVp.js","/assets/scroll-text-C-cTJaja.js","/assets/search-x-CQAwgrH7.js","/assets/segments-DRVEknO8.js","/assets/send-BpibvoIc.js","/assets/settings-2-C_r8dQfL.js","/assets/shield-DtZIbrs8.js","/assets/shield-alert-CwKDncMm.js","/assets/shield-question-mark-Csuf1IwO.js","/assets/siren-B3Z7uH7X.js","/assets/snowflake-C_2EVB6m.js","/assets/split-C4miM8EO.js","/assets/square-check-big-Dw2qABwz.js","/assets/star-CzQZBBGA.js","/assets/statusBands-D2rwcLTV.js","/assets/store-CjwjBwak.js","/assets/table-2-BNs2wxk2.js","/assets/table-properties-DGPecpA2.js","/assets/tag-D_16wEMo.js","/assets/timer-off-DHQdjeJa.js","/assets/trending-down-CN6-DJ4m.js","/assets/trending-up-Ch2aZacO.js","/assets/undo-2-D_R8UDIt.js","/assets/useChartTheme-YLFGqZy3.js","/assets/useElementWidth-965ErDeR.js","/assets/useIsMobile-BXIjjkXg.js","/assets/useOpenParam-C7yMnGe_.js","/assets/useStatusBands-CEmeyzkW.js","/assets/useUrlScope-FceNIlfe.js","/assets/user-CjpichdP.js","/assets/user-cog-BTYTuVNz.js","/assets/users-RlktPr6W.js","/assets/vfx-BOS4QATc.js","/assets/video-DCIqny_n.js","/assets/wallet-BpElK5GC.js","/assets/warehouse-BPAqVrSe.js","/assets/workflow-D71Y-1yp.js","/assets/x-_hLNbxZw.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
