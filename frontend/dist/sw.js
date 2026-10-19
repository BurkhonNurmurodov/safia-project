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

const BUILD = "2026-10-19T13:33:17.839Z";
const PRECACHE = ["/","/assets/AdminPanel-4bmrIMsX.js","/assets/AnalysisBoard-BHlNhaQq.js","/assets/Arc-BFD8y89C.js","/assets/Assistant-CgRm5xSN.js","/assets/BrigadirProfile-BO7M5kXc.js","/assets/BroadcastReceivers-Df9p-7oP.js","/assets/BroadcastRecord-BYV-7Z6c.js","/assets/Button-BcuEnUPM.js","/assets/CatLockNotice-AS05mvo_.js","/assets/CategoryLegendModal-Vw51P8Yp.js","/assets/CellConcerns-DMueemtM.js","/assets/CellDetails-C5NLphOk.js","/assets/CellFormModal-C1MntY8D.js","/assets/CellIdent-B1PW_YkY.js","/assets/CellLink-DGwYKDxD.js","/assets/Cells-C5j0808X.js","/assets/ColumnFilter-CWz2R4v8.js","/assets/ColumnsPicker-Bi9dx8-9.js","/assets/CommentsModal-BeGAAOgi.js","/assets/ComparisonTable-M80hCOQm.js","/assets/Concerns-CQTvnn3c.js","/assets/CountStepper-TYWaInzC.js","/assets/Daily-CSdZfoI-.js","/assets/DataTable-DtaLBxGs.js","/assets/DateRangePicker-CGOIp2__.js","/assets/DayReportView-DoEForkC.js","/assets/DayStepper-Dz6RoU50.js","/assets/DifferenceBreakdown-CylnhQsX.js","/assets/Downtime-BtK9yva5.js","/assets/Education-BFTNhxZ1.js","/assets/EducationLesson-B4odpMLL.js","/assets/EmptyState-Dqiw4gSC.js","/assets/Exam-DTSu3eBU.js","/assets/FactorySelect-D-IE__kl.js","/assets/Gamification-DV_qVEvk.js","/assets/GroupBadge-Do4xEum2.js","/assets/HeatmapChart-C7GIrdYC.js","/assets/IdleCell-pP0sgvC-.js","/assets/KPICard-BXOUXtLw.js","/assets/Kaizen-DIKgmjgY.js","/assets/Kelish-DNq6VhRM.js","/assets/KpiDeltaCard-DJrZPnNb.js","/assets/LangTextInput-m6YiSlj6.js","/assets/Layout-Bn6y6HVp.js","/assets/LeaderAppeal-C7MkzpRF.js","/assets/LeaderDayReport-BTsJG6pM.js","/assets/LeaderUnitReport-DysRVx_I.js","/assets/Leaderboard-CKuWkZfA.js","/assets/Leaders-Bk162xr-.js","/assets/LeadersKpi-BlUSPeFI.js","/assets/Lightbox-BNEAaRMi.js","/assets/LiveOverview-CNh7oWqx.js","/assets/Login-CJu8iHlA.js","/assets/NotFound-C4Cog3gB.js","/assets/Notifications-iJKGCdiX.js","/assets/Overview-em92E9WD.js","/assets/Pagination-Bu5nHsf_.js","/assets/PerenaladkaFactTable-DEPo-Eko.js","/assets/PersonCard-C8P-JuDT.js","/assets/PlanFulfillment-KmTpaVcD.js","/assets/Production-DBj3_m0S.js","/assets/Profile-CjwSS-_T.js","/assets/ProofCamera-CxuHLO8y.js","/assets/ProofPhoto-Dv-n6Sm8.js","/assets/Quality-D54lMVvQ.js","/assets/RawRows-BLZB3c4L.js","/assets/RequestStateChip-Bi5epEKx.js","/assets/RichTextEditor-Cr_KqlFU.js","/assets/SaveState-ho4oPOIn.js","/assets/SearchInput-CjOaBuY8.js","/assets/SeasonalityHeatmap-D65u_HiA.js","/assets/SegmentedToggle-CDfBOleD.js","/assets/SetupTimes-Cj55INl4.js","/assets/ShiftDaily-Cy1nVjxP.js","/assets/Staff-DErTVzc2.js","/assets/StaffListAtCheck-PN9S-6F1.js","/assets/StatusBadge-DMVJKh4N.js","/assets/TargetGoal-BTm2fBNx.js","/assets/Targets-C3xjwM3Z.js","/assets/Tasks-BkVFEsUL.js","/assets/TimeWheelPicker-CmDCe2J_.js","/assets/Toast-gPv_q6Yz.js","/assets/Tooltip-Dm_kMHcy.js","/assets/TrendChart-BAxYOtBN.js","/assets/TripleSpeedometer-CdybWF2h.js","/assets/Trudoyomkost-Pir_ED7m.js","/assets/UploadDropzone-DRyOZp-3.js","/assets/UsersActivity-IUvyNhSY.js","/assets/VerdictBlock-BbkM2n4v.js","/assets/VfxApiMap-BS7xprRw.js","/assets/VfxDictionaries-BtRrIb-T.js","/assets/VfxEmployees-yC3FSwCA.js","/assets/VfxHrMoves-F3GezpHp.js","/assets/VfxJobs-DPE6DASk.js","/assets/VfxPhoto-CN19ndcU.js","/assets/VfxShifts-fPh8XKx9.js","/assets/VfxState-Cm4_HkUS.js","/assets/VfxTimebooks-Cok3cRBA.js","/assets/VfxTimesheet-CrLBlwbr.js","/assets/WatchProgress-BdOzLHSA.js","/assets/WebLogin-BCZl0E3G.js","/assets/Workers-Dmqq7Zam.js","/assets/Zagruzka-BClLj7WV.js","/assets/ZagruzkaCell-CZBkEI_l.js","/assets/api-DOlyHmi1.js","/assets/archive-DeHqDkzG.js","/assets/archive-restore-N_RR6l9R.js","/assets/arrow-down-CIYqnL0Q.js","/assets/arrow-down-right-YdtLHDC4.js","/assets/arrow-down-wide-narrow-DY4VBkXZ.js","/assets/arrow-up-narrow-wide-LJjIRvxN.js","/assets/ban-CinqOcLm.js","/assets/boxes-BRYgi5ZW.js","/assets/braces-vLmrQ_Bm.js","/assets/brigadirFilters-Dcbr4rQe.js","/assets/broadcastTree-BJExgXXu.js","/assets/building-2-BuKuaXVw.js","/assets/calendar-DOtNogDb.js","/assets/calendar-days-CGAEH0OY.js","/assets/camera-C_CQadqy.js","/assets/categories-DzMMfa3k.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-G7zGbI5P.js","/assets/chart-line-DmmaAp0g.js","/assets/chart-pie-C5kps7aZ.js","/assets/chartRange-B_mJMZZw.js","/assets/check-check-CvRAX2Bx.js","/assets/chevron-left-C1jrZpVp.js","/assets/chevrons-up-down-LcAijbhr.js","/assets/circle-alert-XWgQMcLZ.js","/assets/circle-check-big-B7ToZNc7.js","/assets/circle-dashed-CB3NFPuk.js","/assets/circle-minus-B0W4kV5W.js","/assets/circle-oS6XqQWi.js","/assets/circle-question-mark-vVg8hQb2.js","/assets/circle-slash-iSM_52j6.js","/assets/circle-user-round-GJH7c3Zx.js","/assets/cloud-off-BA8v3OWc.js","/assets/cloud-upload-BfZ2oi5r.js","/assets/compass-DeWWQh2g.js","/assets/concernCategories-BrlLGrjA.js","/assets/corner-down-right-D4PVOB1Y.js","/assets/createLucideIcon-DJgAZQOr.js","/assets/es-TnM6zZEh.js","/assets/external-link-BEtiQMxx.js","/assets/file-clock-DZ6vb8wU.js","/assets/file-exclamation-point-Ctzn6zwe.js","/assets/flag-BM3g3H8l.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CAmQnyuZ.js","/assets/hash-Dl7SI7CC.js","/assets/hourglass-BiCZHe7V.js","/assets/image-CkeROLnx.js","/assets/image-off-aH77yJrF.js","/assets/inbox-DPsEyMgf.js","/assets/index-DemTQruw.css","/assets/index-DsgcRvKf.js","/assets/keyboard-BotDD6Ko.js","/assets/languages-D4kUHP8R.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CWC_W4Jb.js","/assets/lightbulb-BJgDWRsQ.js","/assets/link-2-d8_0BHK0.js","/assets/link-2-off-Bwm26TsI.js","/assets/list-ordered-Cz4IBzzd.js","/assets/list-tree-rS-CHYq1.js","/assets/lock-open-BCfPFLxO.js","/assets/log-in-BEhOmptJ.js","/assets/marks-Cq1HGCSQ.js","/assets/minimize-2-CKw7jkIj.js","/assets/package-check-G85NXvZa.js","/assets/pencil-B5xe1GaE.js","/assets/percent-CpsNKHug.js","/assets/pin-Ci35Bib4.js","/assets/pin-off-DyoHI8tW.js","/assets/play-DH6wfHhD.js","/assets/plug-zap-BZhdMTaI.js","/assets/prop-types-B2NN29O_.js","/assets/radio-Ssw2YBdt.js","/assets/react-apexcharts.esm-Cw2Ljxag.js","/assets/registers-CVRrYGHb.js","/assets/repeat-DzNk4QeS.js","/assets/save-DMBCzEsR.js","/assets/scopeLinks-ClGQC-Y_.js","/assets/scroll-text-DygL0gBO.js","/assets/search-x-DNS8ZQll.js","/assets/segments-BPZcQnAm.js","/assets/send-CrJEIaNl.js","/assets/settings-2-B_Fvtwhz.js","/assets/shield-CkXFiLFP.js","/assets/shield-alert-BLM51eMR.js","/assets/shield-question-mark-Cd6Fly33.js","/assets/siren-CKhkwf5P.js","/assets/snowflake-CB1H8X_N.js","/assets/split-DAmY38ve.js","/assets/square-check-big-D1aa_2-O.js","/assets/star-BcfDj_AI.js","/assets/statusBands-B4t_KAj2.js","/assets/store-DyV6W7cZ.js","/assets/table-2-DVQdMzZp.js","/assets/table-properties-DwxeUf_g.js","/assets/tag-BgcNcT7o.js","/assets/timer-off-BmZqNKGf.js","/assets/trending-down-Bm2E5ZRX.js","/assets/trending-up-Cap1xDFb.js","/assets/undo-2-D6rk1R5O.js","/assets/useChartTheme-DnFxTu0g.js","/assets/useElementWidth-C-O-uopB.js","/assets/useIsMobile-CsSzapUv.js","/assets/useOpenParam-Cqf26x3r.js","/assets/useStatusBands-BskqW9k2.js","/assets/useUrlScope-Tb6EjCtq.js","/assets/user-ZtC57Xax.js","/assets/user-cog-BI3Yd3Pr.js","/assets/user-minus-BeKZAb9e.js","/assets/users-k9pvGfXj.js","/assets/vfx-DMUrNhMA.js","/assets/video-C9s8SCqr.js","/assets/wallet-BQ9c_0Hv.js","/assets/warehouse-Bx2RZoe0.js","/assets/workflow-zUfQyCuq.js","/assets/x-BGjqBGws.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
