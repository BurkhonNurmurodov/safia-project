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

const BUILD = "2026-10-14T15:42:45.138Z";
const PRECACHE = ["/","/assets/AdminPanel-BKNHbjJ8.js","/assets/AnalysisBoard-DjqyJDKs.js","/assets/Arc-BDeabnUm.js","/assets/Assistant-CP56UyAn.js","/assets/BrigadirProfile-B4UHoBiR.js","/assets/BroadcastReceivers-Bu3sKvkS.js","/assets/BroadcastRecord-XlpRw3Sd.js","/assets/Button-CkeGCTLS.js","/assets/CatLockNotice-C6wBKzLe.js","/assets/CategoryLegendModal-DDA7fPTp.js","/assets/CellConcerns-CItqdMiF.js","/assets/CellDetails-BW6ADx3R.js","/assets/CellFormModal-CQcsX12z.js","/assets/CellIdent-C6ag7Fts.js","/assets/CellLink-CrIaYjsi.js","/assets/Cells-CjNjnEur.js","/assets/ColumnFilter-CPFy-8oC.js","/assets/ColumnsPicker-BCCf0o8l.js","/assets/CommentsModal-BZz8GaBt.js","/assets/ComparisonTable-BJYZIMJF.js","/assets/Concerns-Blitty2x.js","/assets/CountStepper-CfmbBFjo.js","/assets/Daily-B6FZkg56.js","/assets/DataTable-DhrGYX0R.js","/assets/DateRangePicker-wcW2eRiG.js","/assets/DayReportView-C8n2do0_.js","/assets/DayStepper-CBlRpaur.js","/assets/DifferenceBreakdown-DVYeSsJA.js","/assets/Downtime-Cfa9zFg6.js","/assets/Education-5Zdb6LVf.js","/assets/EducationLesson-DIKNO8yM.js","/assets/EmptyState-B3T91d7O.js","/assets/Exam-BOEw1jZA.js","/assets/FactorySelect-BLGpbmN9.js","/assets/Gamification-Dd37eGHL.js","/assets/GroupBadge-DycAG8h5.js","/assets/HeatmapChart-CrRYsx1y.js","/assets/IdleCell-DoxjtBRb.js","/assets/KPICard-BLjD8rcl.js","/assets/Kaizen-Bl8xOQpm.js","/assets/Kelish-Cpf6Ideo.js","/assets/KpiDeltaCard-DZ_dnRe8.js","/assets/LangTextInput-BbN7NXNB.js","/assets/Layout-DznBgV4-.js","/assets/LeaderAppeal-L1g0ljOy.js","/assets/LeaderDayReport-BXrbhs82.js","/assets/LeaderUnitReport-CJQoNRda.js","/assets/Leaderboard-vlCzDiC9.js","/assets/Leaders-BJxznnQS.js","/assets/Lightbox-Oi9MsLDS.js","/assets/LiveOverview-BkAW3RAG.js","/assets/Login-gc3t0EDo.js","/assets/NotFound-Cyxw-FvG.js","/assets/Notifications-CgArEFrN.js","/assets/Overview-CsvOs1nN.js","/assets/Pagination-B3L2Qie6.js","/assets/PerenaladkaFactTable-DdbcW0Wz.js","/assets/PersonCard-VMdh1Lb6.js","/assets/PlanFulfillment-CA0b1xIM.js","/assets/Production-DSQFA-yn.js","/assets/Profile-BzfaApXD.js","/assets/ProofCamera-B23oJc62.js","/assets/Quality-BPxL2hnr.js","/assets/RawRows-wT6Ku49j.js","/assets/RequestStateChip-5-PeVM8f.js","/assets/RichTextEditor-CY46Rxed.js","/assets/SaveState-Si-hJvVU.js","/assets/SearchInput-CvVWUAGr.js","/assets/SeasonalityHeatmap-CmQ_QYkm.js","/assets/SegmentedToggle-CPFmSopY.js","/assets/SetupTimes-rfiyv-eS.js","/assets/ShiftDaily-CdmvkmYO.js","/assets/Staff-BLGvfgog.js","/assets/StaffListAtCheck-DaW3NYGw.js","/assets/StatusBadge-BlZUNn-k.js","/assets/TargetGoal-C8LyXjl_.js","/assets/Targets-etU_Az4r.js","/assets/Tasks-bYoFF4pw.js","/assets/TimeWheelPicker-DUx6Oxut.js","/assets/Toast-D0EvlmnT.js","/assets/Tooltip-BtRmwvat.js","/assets/TrendChart-OMxqxjA0.js","/assets/TripleSpeedometer-BGv83bPd.js","/assets/Trudoyomkost-CKm7fQNZ.js","/assets/Turnover-BXv9KaXA.js","/assets/UploadDropzone-CYUWH9Yj.js","/assets/UsersActivity-JofHRGRw.js","/assets/VerdictBlock-C6y7pOtk.js","/assets/VfxApiMap-4JrcMDOW.js","/assets/VfxDictionaries-BDW-WCOJ.js","/assets/VfxEmployees-b7Y2DuUI.js","/assets/VfxHrMoves-C40xePQe.js","/assets/VfxJobs-BG0-B8de.js","/assets/VfxPhoto-DPQY_57V.js","/assets/VfxShifts-BhgnlhdD.js","/assets/VfxState-DnaQQL3h.js","/assets/VfxTimebooks-C1O6KAaT.js","/assets/VfxTimesheet-Dqmu-MMQ.js","/assets/WatchProgress-CWaMRggI.js","/assets/WebLogin-CWpl8zYb.js","/assets/WorkerConcerns-uUtf2Os0.js","/assets/Workers-61NXWCn0.js","/assets/Zagruzka-B-orJahL.js","/assets/ZagruzkaCell-CXNYd8N6.js","/assets/api-BuhL_7HD.js","/assets/archive-B5CeYHhm.js","/assets/archive-restore-WJWrFvFo.js","/assets/arrow-down-BISXDI4t.js","/assets/arrow-down-wide-narrow-3lylwuWn.js","/assets/arrow-up-narrow-wide-yBcGsfic.js","/assets/award-NJ4b59ef.js","/assets/ban-2wrp34OF.js","/assets/boxes-BiN64S8P.js","/assets/braces-B8pm0rxx.js","/assets/brigadirFilters-BLQKpHfG.js","/assets/broadcastTree-BbTiJ1CM.js","/assets/building-2-BwXYEYCj.js","/assets/calculator-Dg-8oSfI.js","/assets/calendar-days-BJxAshGL.js","/assets/calendar-sjI8ZZhB.js","/assets/camera-NnM_IVud.js","/assets/categories-BP5W21FI.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D281CxoH.js","/assets/chart-line-BaAiUjv9.js","/assets/chart-pie-CM9pqSSm.js","/assets/chartRange-2uS4lBKM.js","/assets/check-check-CbR6Sgsr.js","/assets/chevron-left-qTrK7oqO.js","/assets/chevrons-up-down-ds_XnTsT.js","/assets/circle-alert-S7ZZBxPM.js","/assets/circle-check-big-BLAMicIf.js","/assets/circle-dashed-BhXGo1Tq.js","/assets/circle-minus-VkedZjFQ.js","/assets/circle-question-mark-Cu1Exsi2.js","/assets/circle-slash-CynO0RYs.js","/assets/circle-user-round-Oim1Ic84.js","/assets/circle-ypJ0kOBP.js","/assets/clock-3-CoER5FSP.js","/assets/cloud-off-FCttq2X-.js","/assets/cloud-upload-BLOAQzZ6.js","/assets/compass-DbvHs4fv.js","/assets/concernCategories-BPiPBJc4.js","/assets/copy-DLIMUBLi.js","/assets/corner-down-right-BlysQbBV.js","/assets/createLucideIcon-COTVdW9M.js","/assets/es-IJ1zrI_t.js","/assets/external-link-Di6Jd-mS.js","/assets/file-clock-B_TfFIlq.js","/assets/file-exclamation-point-CasY00xK.js","/assets/flag-Ex_h_PvX.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-dhzmxoJL.js","/assets/hash-B2mxhfKR.js","/assets/hourglass-CPXt4Z5_.js","/assets/image-D42NdMoq.js","/assets/image-off-BeWGMHbT.js","/assets/inbox-BpM8VmyR.js","/assets/index-BbG-r0yx.js","/assets/index-DWCq5gUB.css","/assets/keyboard-Ck5dShfL.js","/assets/languages-D5B3O2hi.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CIa3BoSE.js","/assets/lightbulb-D2i9O-JW.js","/assets/link-2-B78aIXUA.js","/assets/link-2-off-CoeXoqyB.js","/assets/list-ordered-waV6hP_f.js","/assets/list-tree-DVS0N_4_.js","/assets/lock-open-89mJwNbu.js","/assets/log-in-DgqK3K4Y.js","/assets/marks-jbNue8gr.js","/assets/minimize-2-CVoMyc5w.js","/assets/package-check-C_8NLqHi.js","/assets/pencil-DmdHqF8L.js","/assets/percent-WpAtblLl.js","/assets/pin-D_lyelON.js","/assets/pin-off-BhLtw8Oq.js","/assets/play-DATfwxzT.js","/assets/plug-zap-VVROWd_o.js","/assets/prop-types-98M9pP3_.js","/assets/radio-B46NMGFh.js","/assets/react-apexcharts.esm-CVWj4VTW.js","/assets/registers-Cp11CHED.js","/assets/repeat-xl54gz8w.js","/assets/save-DdEa0K5-.js","/assets/scopeLinks-DMy1fPM7.js","/assets/scroll-text-DdxYFz3T.js","/assets/search-x-kjsZ9DqN.js","/assets/segments-Ba9fxztD.js","/assets/send-pcdVxQzx.js","/assets/settings-2-DEemppq4.js","/assets/shield-D04d6hb_.js","/assets/shield-alert-CqRjDmF-.js","/assets/shield-question-mark-BKOszAcA.js","/assets/siren-BbZN0zrB.js","/assets/snowflake-B2nH2bVo.js","/assets/split-X6E7ICfl.js","/assets/square-check-big-Baj13kZw.js","/assets/star-BidW5lpW.js","/assets/statusBands-BQXJlcIL.js","/assets/store-BrzXVmo6.js","/assets/table-2-mogX6mZ-.js","/assets/table-properties-BfSfn9ef.js","/assets/tag-CcQ_OZMx.js","/assets/timer-off-I1CkimTX.js","/assets/trending-down-DfzVxOfm.js","/assets/trending-up-CToMxjNt.js","/assets/undo-2-BI0ot2h6.js","/assets/useChartTheme-DYBG0DwX.js","/assets/useElementWidth-BTDTci9Z.js","/assets/useIsMobile-DEZqF6vA.js","/assets/useOpenParam-D8e2P2tI.js","/assets/useStatusBands-DP38XxHS.js","/assets/useUrlScope-C1j2cfFp.js","/assets/user-CSziQ4PX.js","/assets/user-cog-BokJjPre.js","/assets/users-DUXM0wmc.js","/assets/vfx-BvUQwz1L.js","/assets/video-CPmCPcQ8.js","/assets/wallet-B97v30gu.js","/assets/warehouse-BF2i5ugA.js","/assets/workflow-79ccaIS9.js","/assets/x-BPOHZrEJ.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
