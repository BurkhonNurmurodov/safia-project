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

const BUILD = "2026-10-26T05:22:12.487Z";
const PRECACHE = ["/","/assets/AdminPanel-BsKBsc3m.js","/assets/AnalysisBoard-CDSeERKo.js","/assets/Arc-bl3z7Bt_.js","/assets/Assistant-dzk5W3Em.js","/assets/BrigadirProfile-8kDXlc8-.js","/assets/BroadcastReceivers-Cio2Sk3u.js","/assets/BroadcastRecord-Zx9yeM7F.js","/assets/Button-Csq92MTt.js","/assets/CatLockNotice-DbVSTK96.js","/assets/CategoryLegendModal-g7roSCiy.js","/assets/CellConcerns-DFnY18K3.js","/assets/CellDetails-BMc940XY.js","/assets/CellFormModal-ClfLL5E8.js","/assets/CellIdent-BD6Yx4IG.js","/assets/CellLink-Bfd9ixZC.js","/assets/Cells-BKxfXRrR.js","/assets/ColumnFilter-DP3t0zm7.js","/assets/ColumnsPicker-TVT8hzYt.js","/assets/CommentsModal-CmELsvp1.js","/assets/ComparisonTable-DzFMNUNy.js","/assets/Concerns-CvTDgFRn.js","/assets/CountStepper-B_bDX57m.js","/assets/Daily-ZwknjCDm.js","/assets/DataTable-CzeWRinB.js","/assets/DateRangePicker-DrI7-Tn2.js","/assets/DayReportView-ClcVn9ZL.js","/assets/DayStepper-CUasgm4Z.js","/assets/DayStrip-t2NOdBQ_.js","/assets/DifferenceBreakdown-BZUN4LLM.js","/assets/Downtime-CmAcj268.js","/assets/Education-CSyxj0nX.js","/assets/EducationLesson-Bva7rNsY.js","/assets/EmptyState-D3GaI1ZG.js","/assets/Exam-BVgLVWO9.js","/assets/FactorySelect-wcmWLof5.js","/assets/Gamification-BpDtHMyt.js","/assets/GroupBadge-D6BNt3Cc.js","/assets/HeatmapChart-CQXBxFZe.js","/assets/IdleCell-Pj1NgxrA.js","/assets/KPICard-C6KO1ame.js","/assets/Kaizen-R-8QElwV.js","/assets/Kelish-B_2FDyKl.js","/assets/KpiDeltaCard-CMzn71dW.js","/assets/LangTextInput-BtWefUio.js","/assets/Layout-Btx5NUcS.js","/assets/LeaderAppeal-Bj39Kf-Q.js","/assets/LeaderDayReport-BrSAvBfI.js","/assets/LeaderUnitReport-DJn4iT9Y.js","/assets/Leaderboard-c3LvUOkA.js","/assets/Leaders-CMABiW7t.js","/assets/LeadersKpi-BFIDpbcE.js","/assets/Lightbox-8HqsEsF3.js","/assets/LiveOverview-C60rkayq.js","/assets/Login-DCQW9kzA.js","/assets/NotFound-DFiR2g3J.js","/assets/Notifications-YzggPdFM.js","/assets/Ontime-BIPboA-d.js","/assets/Overview-C8lBQ94-.js","/assets/Pagination-CZznJsQV.js","/assets/PerenaladkaFactTable-C05jMj3F.js","/assets/PersonCard-pN5LqSK6.js","/assets/PlanFulfillment-DsJ8rGWI.js","/assets/Production-D9vY63SQ.js","/assets/Profile-D6N8qGqD.js","/assets/ProofCamera-Db74F0sO.js","/assets/ProofPhoto-mcmEc7_i.js","/assets/Quality-DmQXUjGW.js","/assets/RawRows-B__zM_9F.js","/assets/RequestStateChip-CAaAavcB.js","/assets/RichTextEditor-jSZFF9XW.js","/assets/SaveState-Cyq_G8H0.js","/assets/SearchInput-BVVM_GYV.js","/assets/SeasonalityHeatmap-BTf20IzK.js","/assets/SegmentedToggle-DXA8DRz9.js","/assets/SetupTimes-2SkG198_.js","/assets/ShiftDaily-DTBWq2_D.js","/assets/Staff-BUG34Qfl.js","/assets/StaffListAtCheck-B8PbdImm.js","/assets/StatusBadge-C0N-hb34.js","/assets/StatusBandsModal-C4WkXXKt.js","/assets/TargetGoal-BVK6GiNt.js","/assets/Targets-M7RDK055.js","/assets/Tasks-CIkWJEbT.js","/assets/TimeWheelPicker-CuXT7UT9.js","/assets/Toast-oI2iGiCQ.js","/assets/Tooltip-DwUryOLK.js","/assets/TrendChart-Bis6TblO.js","/assets/TripleSpeedometer-BcPGIy2W.js","/assets/Trudoyomkost-CPq6lats.js","/assets/UploadDropzone-Cf3-bqw_.js","/assets/UsersActivity-CKfacsRq.js","/assets/VerdictBlock-XnM6Aj0Q.js","/assets/VfxApiMap-CNNTwRDb.js","/assets/VfxDictionaries-7fW0EbnZ.js","/assets/VfxEmployees-CNKZJQt9.js","/assets/VfxHrMoves-CO7x0pcd.js","/assets/VfxJobs-CCs3jGp0.js","/assets/VfxPhoto-DtEELrxa.js","/assets/VfxShifts-BxAdgLyV.js","/assets/VfxState-BANyHzsw.js","/assets/VfxTimebooks-Bz5RK0hU.js","/assets/VfxTimesheet-YGitsNlI.js","/assets/WatchProgress-MoZqwSAP.js","/assets/WebLogin-COeXz04u.js","/assets/Workers-DhhBxjDP.js","/assets/Zagruzka-T3zAXM50.js","/assets/ZagruzkaCell-CroRvlLq.js","/assets/api-BFm7MSgf.js","/assets/archive-CV5c3bNF.js","/assets/archive-restore-C2mz2lJz.js","/assets/arrow-down-CalNoxUS.js","/assets/arrow-down-right-BgsR9Q-e.js","/assets/arrow-down-wide-narrow-CN2VmRvO.js","/assets/arrow-up-narrow-wide-Bk9rr8ks.js","/assets/ban-7TYOIrZH.js","/assets/boxes-BbJ-gJn3.js","/assets/braces-KKXZkSWg.js","/assets/brigadirFilters-BHkEncZe.js","/assets/broadcastTree-Cmt61bI8.js","/assets/building-2-D_QmyOVb.js","/assets/calendar-days-1eTgVUrW.js","/assets/calendar-wgDfdnEM.js","/assets/camera-BLS4o3AB.js","/assets/categories-CwaCq49L.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DAT023xD.js","/assets/chart-line-B8-TvC1_.js","/assets/chart-pie-C8JKGoM_.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-BxX2ybdO.js","/assets/chevron-left-BCR-WqPF.js","/assets/chevrons-up-down-DCacxNJr.js","/assets/circle-Cj_XSx-0.js","/assets/circle-alert-1gJQpXIe.js","/assets/circle-check-big-BMMnK_Ac.js","/assets/circle-dashed-C6j9aToG.js","/assets/circle-minus-CPJoknrG.js","/assets/circle-question-mark-K9p85opR.js","/assets/circle-slash-D5TTqhsS.js","/assets/circle-user-round-C94p_gNE.js","/assets/cloud-off-DOsilzo8.js","/assets/cloud-upload-EEoydfca.js","/assets/compass-BXzAyCp9.js","/assets/concernCategories-BIz7xhwK.js","/assets/corner-down-right-BZpwmAXF.js","/assets/createLucideIcon-DFwa3A4_.js","/assets/en-B1lsigQd.js","/assets/es-Dtgc5NM1.js","/assets/external-link-utm2Ef73.js","/assets/file-clock-Z8J9OpZx.js","/assets/file-exclamation-point-Bj4MQiJT.js","/assets/flag-DdVPoiqC.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Bhs-8U1b.js","/assets/funnel-CQ4gUhVl.js","/assets/hash-CgQFMtkS.js","/assets/hourglass-BQguNOT3.js","/assets/image-DKRb_a5z.js","/assets/image-off-BXDQEozZ.js","/assets/inbox-_7XbS9tE.js","/assets/index-B-xlMnEH.css","/assets/index-DABY2fYp.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-BtoSE0Rk.js","/assets/languages-CyS920wf.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CuYBRJVb.js","/assets/leaderBoard-DUWzspsA.js","/assets/lightbulb-CAuuW3hn.js","/assets/link-2-0fHCSDML.js","/assets/link-2-off-BYY_guf_.js","/assets/list-ordered-BbqYa1K_.js","/assets/list-tree-D3jS5eO4.js","/assets/lock-open-BY6GlcHo.js","/assets/log-in-7FQxzcRp.js","/assets/map-pin-D0hssA4w.js","/assets/marks-BE97V82v.js","/assets/minimize-2-Dwvarznf.js","/assets/package-check-1CnMGu5Z.js","/assets/pencil-BHcAVjmd.js","/assets/percent-BA097YPD.js","/assets/pin-CTqenAiU.js","/assets/pin-off-BgMwbK5M.js","/assets/play-IUE2THtt.js","/assets/plug-zap-w3zUPgOy.js","/assets/prop-types-RD3fbola.js","/assets/radio-BsPpV07v.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-DJIzVh84.js","/assets/repeat-CmzJEdaJ.js","/assets/ru-BOsfuX_Y.js","/assets/save-DQ-WN0rG.js","/assets/scopeLinks-D48OHO6v.js","/assets/scroll-text-DxFCSzyX.js","/assets/search-x-DfxI_WqM.js","/assets/segments-D5Uiedtv.js","/assets/send-C8pNtPJo.js","/assets/settings-2-Xqt52YEF.js","/assets/shield-BIOPGood.js","/assets/shield-alert-B-6RqDu5.js","/assets/shield-question-mark-CAdXk5SM.js","/assets/sigma-Bh_dE5K0.js","/assets/siren-CosAQLtw.js","/assets/snowflake-DdAh7F65.js","/assets/split-xFcxVA5x.js","/assets/square-check-big-BN8BVG9L.js","/assets/star-DoWATV4D.js","/assets/statusBands-DVBZcBq3.js","/assets/store-BH39AfXT.js","/assets/table-2-LUwwc4cZ.js","/assets/table-properties-DWqtX2aG.js","/assets/tag-wdQP1avT.js","/assets/timer-off-cLhz9ICv.js","/assets/translations-CT5FCkUR.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-C2TOF2Kj.js","/assets/trending-up-BBCQNT2k.js","/assets/undo-2-DSjP0X1-.js","/assets/useChartTheme-k6OWwknl.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-D3Drqj1x.js","/assets/useStatusBands-ifKmGk-o.js","/assets/useUrlScope-C5cYFH_W.js","/assets/user-BKgKROyL.js","/assets/user-cog-BJflaLtt.js","/assets/user-minus-DguQkdIc.js","/assets/users-CB9roynZ.js","/assets/uz-Dt3NmLCC.js","/assets/uz_cyrl-C2VNphql.js","/assets/vfx-T01TQzUg.js","/assets/video-DpqLn46E.js","/assets/wallet-iHUlropk.js","/assets/warehouse-MNLw-NeA.js","/assets/workflow-SjEH-qii.js","/assets/x-BammQj1E.js","/assets/zap-NOXC8imO.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
