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

const BUILD = "2026-10-04T21:01:11.764Z";
const PRECACHE = ["/","/assets/AdminPanel-C5CB8PNs.js","/assets/AnalysisBoard-DJunyCbD.js","/assets/Arc--X1sKHxZ.js","/assets/ArcLegacy-yZVMsAiP.js","/assets/BrigadirProfile-acSd6_b1.js","/assets/BroadcastReceivers-rsXTE_hK.js","/assets/BroadcastRecord-CTgnhLj6.js","/assets/CatLockNotice-CztBon5e.js","/assets/CategoryLegendModal-CjOaaNLC.js","/assets/CellConcerns-QmjUGoxB.js","/assets/CellDetails-B9S5pfES.js","/assets/CellFormModal-BFlTOTgQ.js","/assets/CellIdent-DcIaM0Oq.js","/assets/CellLink-BI7xT6Xo.js","/assets/Cells-Do4Zx971.js","/assets/ColumnFilter-DBPe5Alz.js","/assets/ColumnsPicker-YkfOFEqH.js","/assets/CommentsModal-D6ISAYAP.js","/assets/ComparisonTable-CynoAUNk.js","/assets/Concerns-X9Mdib0T.js","/assets/ConfirmDialog-zrYl3m2h.js","/assets/Daily-C1k3nc3N.js","/assets/DataTable-DMFAslLJ.js","/assets/DateRangePicker-jAA6LHeC.js","/assets/DayReportView-DcsJUbyx.js","/assets/DayStepper-BU0MdlL0.js","/assets/DifferenceBreakdown-BLX7fS-0.js","/assets/Downtime-DCqZ95N_.js","/assets/Education-Cls5mxaU.js","/assets/EducationLesson-Cqj6MHMe.js","/assets/EmptyState-B1b6IZJR.js","/assets/Exam-DCw_aUhV.js","/assets/FactorySelect-D0En5QVo.js","/assets/Gamification-CgUvZ04n.js","/assets/GroupBadge-BFJsZn-w.js","/assets/HeatmapChart-Ck4ncWA-.js","/assets/IdleCell-DsidaXKc.js","/assets/KPICard-DNn4XoEZ.js","/assets/Kaizen-qBNh69Zt.js","/assets/Kelish-CLtwSq8u.js","/assets/KpiDeltaCard-CbGhBWzX.js","/assets/LangTextInput-CplNOv99.js","/assets/Layout-C0ub5s0M.js","/assets/LeaderAppeal-DkkJ38vt.js","/assets/LeaderDayReport-1aObXpp-.js","/assets/LeaderUnitReport-DHOY_eUu.js","/assets/Leaderboard-Ci8vwPkU.js","/assets/Leaders-D8wB61xD.js","/assets/Lightbox-CdV_EMub.js","/assets/LiveOverview-Bu8X2M78.js","/assets/Login-CMXw_v-y.js","/assets/NotFound-Dvsj3QMf.js","/assets/Notifications-Bs3i96nD.js","/assets/Overview-vDiTsxFJ.js","/assets/Pagination-C8RnI_ni.js","/assets/PerenaladkaFactTable-DAK4D_Cc.js","/assets/PersonCard-Dsiebroy.js","/assets/PlanFulfillment-Bbga-IYr.js","/assets/Production-BBIcThq5.js","/assets/Profile-BlQcw0PL.js","/assets/ProofCamera-C27gfWOq.js","/assets/ProofPhoto-DGWj4jAS.js","/assets/Quality-C4OOywHf.js","/assets/RawRows-D5vvV-TN.js","/assets/RequestStateChip-DUnlTBvE.js","/assets/RichTextEditor-EDdF8Owo.js","/assets/SaveState-DCwVthmD.js","/assets/SearchInput-BL4lRH6z.js","/assets/SeasonalityHeatmap-BXPlfgih.js","/assets/SegmentedToggle-DK08XUub.js","/assets/SetupTimes-DS15Tuz9.js","/assets/ShiftDaily-BsR6cefK.js","/assets/Staff-B4IxfzXB.js","/assets/StaffLive-B01FrJrQ.js","/assets/StatusBadge-C8438J_1.js","/assets/TargetGoal-BvKNjP7u.js","/assets/Targets-B3pAOQjR.js","/assets/Tasks-DA8ZfHvh.js","/assets/TimeWheelPicker-oGNR2x6o.js","/assets/Toast-L2n45BNg.js","/assets/Tooltip-Bj1Ugc12.js","/assets/TrendChart-cnWtHSqo.js","/assets/TripleSpeedometer-HHPX4yDf.js","/assets/Trudoyomkost-Byx7B3qn.js","/assets/Turnover-DpeQZKi7.js","/assets/UploadDropzone-BiyiMrSJ.js","/assets/UsersActivity-CXkMmFmp.js","/assets/VerdictBlock-BSeVvqEL.js","/assets/VfxApiMap-BkWmybka.js","/assets/VfxDictionaries-CRWS2jyU.js","/assets/VfxEmployees-BWM7rKuZ.js","/assets/VfxHrMoves-B5WEbTpz.js","/assets/VfxJobs-D9iMugTy.js","/assets/VfxPhoto-CPTyeurz.js","/assets/VfxShifts-CAhpMfuJ.js","/assets/VfxState-GBirEC5h.js","/assets/VfxTimebooks-TOzFko9Y.js","/assets/VfxTimesheet-3ykI8Vha.js","/assets/WatchProgress-B_IcIGOm.js","/assets/WebLogin-BFQvabvk.js","/assets/WorkerConcerns-BR8K_PL_.js","/assets/Workers-DgMj4GyY.js","/assets/Zagruzka-DzpBsqtt.js","/assets/ZagruzkaCell-C6TfEmzC.js","/assets/api-oAcDDIrK.js","/assets/archive-aDE7HCsx.js","/assets/archive-restore-dM_OsJjS.js","/assets/arrow-down-AYOQAWmx.js","/assets/arrow-left-BdLbekna.js","/assets/arrow-up-CmIeq-Ju.js","/assets/arrow-up-narrow-wide-ouWyqUIT.js","/assets/arrow-up-right-Dvi90Ss3.js","/assets/award-Ba0SPmZW.js","/assets/ban-74KXjKEn.js","/assets/book-open-D54GN0_O.js","/assets/bot-v3w27iZ9.js","/assets/boxes-YFSZ7uTN.js","/assets/braces-BDQLK2qg.js","/assets/brigadirFilters-CyD-78zE.js","/assets/broadcastTree-DesLvdtZ.js","/assets/building-2-B7ZfFPS4.js","/assets/calculator-CNEJqLko.js","/assets/calendar-CBnHeflt.js","/assets/calendar-days-CoAQUTjo.js","/assets/camera-J_s7lnkw.js","/assets/categories-CsnimPII.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BiZsiBcc.js","/assets/chart-line-DR3K1_oE.js","/assets/chart-pie-BWvlPZ84.js","/assets/chartRange-BJYyLfl3.js","/assets/check-check-CDPd2VZI.js","/assets/chevron-left-CYuNctD7.js","/assets/chevrons-up-down-B3-Hvco7.js","/assets/circle-6l8xyyeg.js","/assets/circle-alert-hoyCV--k.js","/assets/circle-check-big-6I9Py5OL.js","/assets/circle-dashed-DUJUOdQC.js","/assets/circle-minus-B_xHWuR5.js","/assets/circle-question-mark-C1Q1Dx0Y.js","/assets/circle-slash-D8UpKevB.js","/assets/circle-user-round-G2Y5A2re.js","/assets/clock-3-DQLmXOPE.js","/assets/cloud-off-DBPxV7hm.js","/assets/cloud-upload-BlZNeaOI.js","/assets/compass-DJA_r__A.js","/assets/concernCategories-BqAPunDG.js","/assets/copy-QtKZIZZ1.js","/assets/corner-down-right-BdlUiXG1.js","/assets/createLucideIcon-D9VoPpYh.js","/assets/es-Da1d0zem.js","/assets/exportXlsx-Cdb1Zbhy.js","/assets/external-link-liiBk9pD.js","/assets/file-clock-DULxHmiL.js","/assets/file-exclamation-point-hD8rRnrj.js","/assets/file-spreadsheet-CmilMpp8.js","/assets/file-text-BBYc9vsX.js","/assets/flag-DrcJeWnM.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BbSmXtTM.js","/assets/hash-Cw9Nf6At.js","/assets/history-CzAHBReW.js","/assets/hourglass-pXZ6CM8F.js","/assets/image-BRYMZ9fC.js","/assets/image-off-DU92HUPq.js","/assets/inbox-EWjFpcYi.js","/assets/index-CWetr0Bs.js","/assets/index-D4VDufLq.css","/assets/key-round-C6GhQzQr.js","/assets/keyboard-jd6CiMv9.js","/assets/languages-B2DcRHXZ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B6tIDkoV.js","/assets/lightbulb-BR1BcEcH.js","/assets/link-2-DGswJ5b_.js","/assets/link-2-off-BQWqqXks.js","/assets/list-ordered-CQwboT-x.js","/assets/list-tree-DXO7iyhC.js","/assets/lock-open-DNOBTI7O.js","/assets/log-in-B52OzNca.js","/assets/maximize-2-CW378BLG.js","/assets/message-square-rUgGHiDO.js","/assets/minimize-2-DbqIwDTV.js","/assets/package-check-CwxDF0sY.js","/assets/paperclip-JObQHOIt.js","/assets/pencil-CzQAxERt.js","/assets/percent-ZUcl2UtS.js","/assets/pin-CkoYBMLB.js","/assets/pin-off-Cfm-xODF.js","/assets/play-DLNQlcgQ.js","/assets/plug-zap-W8ql2-jh.js","/assets/presentation-yJqDUawF.js","/assets/prop-types-DjB56YNC.js","/assets/radio-DRpeoyHO.js","/assets/react-apexcharts.esm-C-ZVSK-W.js","/assets/registers-8LnQIzWZ.js","/assets/repeat-CVOUWmZr.js","/assets/rotate-ccw-rIbX-zhj.js","/assets/rotate-cw-D38TGoh7.js","/assets/save-B7tkOFk9.js","/assets/scopeLinks-CxVESPYe.js","/assets/scroll-text-DGHlbXhC.js","/assets/search-x-BjeLZc2S.js","/assets/segments-BR7ZPSn0.js","/assets/send-C1IjEnDs.js","/assets/settings-2-DkkfkwLL.js","/assets/shield-CB9NTHO1.js","/assets/shield-alert-DsyrNPls.js","/assets/shield-check-Dcu3CARF.js","/assets/shield-question-mark-k0cKCb7S.js","/assets/siren-DVcS7PKi.js","/assets/snowflake-DYFhGwAK.js","/assets/split-GWk2gp14.js","/assets/square-check-big-CvhlY-sD.js","/assets/square-fzwJGf_L.js","/assets/star-yU2rpV6p.js","/assets/statusBands-Be3Zy6ne.js","/assets/store-DFlfv98j.js","/assets/table-2-Do4sfRTK.js","/assets/table-properties-B9RZbe5x.js","/assets/tag-CsZTpUDw.js","/assets/timer-off-DNFQOD5j.js","/assets/trending-down--Ic1uAre.js","/assets/trending-up-r6R-wdty.js","/assets/undo-2-CCv5sc8P.js","/assets/useChartTheme-DGv3wjF2.js","/assets/useElementWidth-Dm4nJJQK.js","/assets/useIsMobile-BNRqabvQ.js","/assets/useOpenParam-NOBytYZj.js","/assets/useStatusBands-BvCrdzR6.js","/assets/useUrlScope-Cp2ULv9c.js","/assets/user-DAKcv3JS.js","/assets/user-cog-D4TuN5tJ.js","/assets/users-B9jzhz-2.js","/assets/vfx-DqmoOkbw.js","/assets/video-DLRRpez_.js","/assets/wallet-B-2-ZzhC.js","/assets/warehouse-DneOLDLk.js","/assets/x-C-AjImgu.js","/assets/zap-ClgdZSQK.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
