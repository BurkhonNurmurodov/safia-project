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

const BUILD = "2026-10-08T10:01:12.252Z";
const PRECACHE = ["/","/assets/AdminPanel-7yZILYGR.js","/assets/AnalysisBoard-s70F0Yk0.js","/assets/Arc-DdXtUk9I.js","/assets/Assistant-B5iXVDqt.js","/assets/BrigadirProfile-B45BFAdr.js","/assets/BroadcastReceivers-CRdj6Il2.js","/assets/BroadcastRecord-B-WAXKy1.js","/assets/Button-CkQ1xkhM.js","/assets/CatLockNotice-DLvW-3Nm.js","/assets/CategoryLegendModal-x_vgefUf.js","/assets/CellConcerns-xpiLEdxZ.js","/assets/CellDetails-D71DvxXf.js","/assets/CellFormModal-Dxym85tV.js","/assets/CellIdent-DWIz4ubk.js","/assets/CellLink-BCueDdKd.js","/assets/Cells-Db1FSy1E.js","/assets/ColumnFilter-DjOslsap.js","/assets/ColumnsPicker-Bds4DZ0a.js","/assets/CommentsModal-qyu0IkKk.js","/assets/ComparisonTable-oIoKn1Y8.js","/assets/Concerns-nKR02caM.js","/assets/Daily-BCr9G1WO.js","/assets/DataTable-n-rfFg0b.js","/assets/DateRangePicker-ByMtP_Ej.js","/assets/DayReportView-jhR2zsAO.js","/assets/DayStepper-OdeM1pIg.js","/assets/DifferenceBreakdown-C8PSABJ2.js","/assets/Downtime-CylXzpN8.js","/assets/Education-Dx7SIhJQ.js","/assets/EducationLesson-DuDWe2AB.js","/assets/EmptyState-Czj5EQeA.js","/assets/Exam-BTlYMcWh.js","/assets/FactorySelect-7dyXfzg_.js","/assets/Gamification-NlULJqk3.js","/assets/GroupBadge-D4sgV2Hg.js","/assets/HeatmapChart-BIHTLSfr.js","/assets/IdleCell-Ca6jZx4P.js","/assets/KPICard-bCivvS9O.js","/assets/Kaizen-nrT988ee.js","/assets/Kelish-BNL1a-zm.js","/assets/KpiDeltaCard-CzBp59wk.js","/assets/LangTextInput-CNdQdXWq.js","/assets/Layout-DjSzZFBq.js","/assets/LeaderAppeal-9DOv1Gdg.js","/assets/LeaderDayReport-CHeqnwjh.js","/assets/LeaderUnitReport-Df5ndD9S.js","/assets/Leaderboard-u59NKVTk.js","/assets/Leaders-BgTE4gxf.js","/assets/Lightbox-CRq7yzA9.js","/assets/LiveOverview-BFerVDiW.js","/assets/Login-C_TPNs3j.js","/assets/NotFound-IADmVsR3.js","/assets/Notifications-BTlUyuwp.js","/assets/Overview-XS12Trwp.js","/assets/Pagination-BMerRPHt.js","/assets/PerenaladkaFactTable-BG5hOA5B.js","/assets/PersonCard-72PVQes_.js","/assets/PlanFulfillment-F06vM2CT.js","/assets/Production-DEYI3Siw.js","/assets/Profile-C2Zs5Plu.js","/assets/ProofCamera-B6Cl5_uJ.js","/assets/ProofPhoto-CcZq2fKS.js","/assets/Quality-1-lraMpp.js","/assets/RawRows-B7prwB5j.js","/assets/RequestStateChip-yo_R9Nke.js","/assets/RichTextEditor-LuE860GM.js","/assets/SaveState-C9YxFp7A.js","/assets/SearchInput-Day_b34m.js","/assets/SeasonalityHeatmap-CnlE4E89.js","/assets/SegmentedToggle-BBwbvjXV.js","/assets/SetupTimes-oetDbMtv.js","/assets/ShiftDaily-hCO791zH.js","/assets/Staff-vwVAHyMT.js","/assets/StatusBadge-DbIJq5Gj.js","/assets/TargetGoal-BKexr_QD.js","/assets/Targets-DgfuBk2P.js","/assets/Tasks-iucv63eN.js","/assets/TimeWheelPicker-DMKRNCHX.js","/assets/Toast-CIWRUcdQ.js","/assets/Tooltip-Bjjul_qP.js","/assets/TrendChart-CdgPTyY7.js","/assets/TripleSpeedometer-CfX3O34J.js","/assets/Trudoyomkost-9kvSlKQD.js","/assets/Turnover-DD3oSlsf.js","/assets/UploadDropzone-CBKeLcH-.js","/assets/UsersActivity-D2ODRVcp.js","/assets/VerdictBlock-ehcS-GdO.js","/assets/VfxApiMap-Cp4Xiwxc.js","/assets/VfxDictionaries-Bkl6tnSC.js","/assets/VfxEmployees-CG-ML7P5.js","/assets/VfxHrMoves-szjNs_q7.js","/assets/VfxJobs-D4nWlq7z.js","/assets/VfxPhoto-Cj-39MwK.js","/assets/VfxShifts-Dwec2Por.js","/assets/VfxState-CPkA9Pjm.js","/assets/VfxTimebooks-D_2itPMn.js","/assets/VfxTimesheet-yrFGXK8g.js","/assets/WatchProgress-CAYYCRJq.js","/assets/WebLogin-kFTGZE6A.js","/assets/WorkerConcerns-BBD6b2m2.js","/assets/Workers-ClhUwz9D.js","/assets/Zagruzka-CcOS9IVX.js","/assets/ZagruzkaCell-D0SZQ-4t.js","/assets/api-21Z0FusV.js","/assets/archive-C7Zx9DVo.js","/assets/archive-restore-C1uY_cGH.js","/assets/arrow-down-B5tj-aha.js","/assets/arrow-down-wide-narrow-uQvsmTel.js","/assets/arrow-up-narrow-wide-CM2NZxf9.js","/assets/award-BqoXloBh.js","/assets/ban-DZfhGU8w.js","/assets/boxes-kfR8IWUU.js","/assets/braces-DIEk4AU6.js","/assets/brigadirFilters-CUwea-mT.js","/assets/broadcastTree-Co-Qzo9w.js","/assets/building-2-CIa4gK7h.js","/assets/calculator-DSuRdqLC.js","/assets/calendar-DMpb8EbX.js","/assets/calendar-days-B6DWL4n4.js","/assets/camera-B4EqQHb8.js","/assets/categories-COuGnOJS.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DVbTy9Ti.js","/assets/chart-line-CqcQPc5O.js","/assets/chart-pie-DOW5dSbP.js","/assets/chartRange-pvxYU26E.js","/assets/check-check-C4gWPl0s.js","/assets/chevron-left-DN9b9eGI.js","/assets/chevrons-up-down-DSndbgxB.js","/assets/circle-B0o-ZQ1_.js","/assets/circle-alert-mdxYpH7K.js","/assets/circle-check-big-Cac2bMyK.js","/assets/circle-dashed-BKjyVyGz.js","/assets/circle-minus-B8IpDklX.js","/assets/circle-question-mark-BgCot6dH.js","/assets/circle-slash-DQgHl7id.js","/assets/circle-user-round-B3raqelU.js","/assets/clock-3-X6Ra8mGa.js","/assets/cloud-off-DAlUZRaa.js","/assets/cloud-upload-BNGNc_HZ.js","/assets/compass-Ca9_4-Ff.js","/assets/concernCategories-B3980lgH.js","/assets/copy-CYiYvlMN.js","/assets/corner-down-right-BnlPMo3J.js","/assets/createLucideIcon-GoGHNb2U.js","/assets/es-eIKebOp5.js","/assets/external-link-CJJACmtp.js","/assets/file-clock-BDUpBpto.js","/assets/file-exclamation-point-Cgq8IAaR.js","/assets/flag-CqFntpNK.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Bz2PSmfp.js","/assets/hash-D4rTH4oQ.js","/assets/hourglass-ocUDTKft.js","/assets/image-DTiyy8rY.js","/assets/image-off-BCA8vhc8.js","/assets/inbox-DP_pjbW2.js","/assets/index-DFfGVOG_.css","/assets/index-IW_NsJVB.js","/assets/keyboard-C9FfVpHP.js","/assets/languages-CNji7tFR.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-U9YcigEs.js","/assets/lightbulb-vT6JwNEl.js","/assets/link-2-DeSojY9g.js","/assets/link-2-off-vDEv88pv.js","/assets/list-ordered-B0EyuwVG.js","/assets/list-tree-Bo7zKcfO.js","/assets/lock-open-K9ZeS-uF.js","/assets/log-in-D8vCul6r.js","/assets/minimize-2-DunquBHh.js","/assets/package-check-90v7IOjZ.js","/assets/pencil-CYDDMZaE.js","/assets/percent-D7xJmXJg.js","/assets/pin-Lwo13Owt.js","/assets/pin-off-BhjYgIsK.js","/assets/play-DH_hjy_U.js","/assets/plug-zap-Wxbyg2ol.js","/assets/prop-types-B4eM1MTr.js","/assets/radio-DjW0MhcX.js","/assets/react-apexcharts.esm-BmBb_nQB.js","/assets/registers-CmhX0Jlg.js","/assets/repeat-ClE3_MuH.js","/assets/save-BKc0iKX2.js","/assets/scopeLinks-lB_tIIdY.js","/assets/scroll-text-CXWg63Qa.js","/assets/search-x-YJo_fgat.js","/assets/segments-RlDU5hRt.js","/assets/send-D01h2p3s.js","/assets/settings-2-GY8C6N10.js","/assets/shield-7hUhhXla.js","/assets/shield-alert-C1xaQfR2.js","/assets/shield-question-mark-Bmd2ffu_.js","/assets/siren-BsbSdScP.js","/assets/snowflake-DY7VXbxL.js","/assets/split-Cf22q_mZ.js","/assets/square-check-big-BZIVMaWd.js","/assets/star-Da-wg1q8.js","/assets/statusBands-CldiHIw-.js","/assets/store-rqmS6Ana.js","/assets/table-2-YVd_3NhF.js","/assets/table-properties-d0I14bUJ.js","/assets/tag-CQgTW4Yx.js","/assets/timer-off-CObsc63v.js","/assets/trending-down-DleJk-Xi.js","/assets/trending-up-Btqgmnaq.js","/assets/undo-2-DtUyy9xw.js","/assets/useChartTheme-DW48An2Q.js","/assets/useElementWidth-B_wW32Pe.js","/assets/useIsMobile-BofUhA-R.js","/assets/useOpenParam-DRrxW0yK.js","/assets/useStatusBands-BAU0kiNi.js","/assets/useUrlScope-B_io1C9J.js","/assets/user-Bwp2XsyZ.js","/assets/user-cog-C-TE4uE3.js","/assets/users-DVyb0rXG.js","/assets/vfx-DjBsylak.js","/assets/video-pard13A0.js","/assets/wallet-Ffby14OD.js","/assets/warehouse-C6nhPUai.js","/assets/x-CXUnTGOE.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
