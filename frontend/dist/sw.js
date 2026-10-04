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

const BUILD = "2026-10-04T09:13:28.178Z";
const PRECACHE = ["/","/assets/AdminPanel-CqbPELsp.js","/assets/AnalysisBoard-1kX1kGAM.js","/assets/Arc-DaYDS-WP.js","/assets/ArcLegacy-DhZPt0JC.js","/assets/BrigadirProfile-BBjLHpOe.js","/assets/BroadcastReceivers-BJHjxvZ0.js","/assets/BroadcastRecord-DVwg0y1h.js","/assets/CatLockNotice-CTQRp0zV.js","/assets/CategoryLegendModal-BMaM_u28.js","/assets/CellConcerns-CuYCxtZG.js","/assets/CellDetails-DFUOF8O9.js","/assets/CellFormModal-CXACM4se.js","/assets/CellIdent-DN1LpS0d.js","/assets/CellLink-B_e0PGwX.js","/assets/Cells-BSk41o6W.js","/assets/ColumnFilter-DxOHyw5e.js","/assets/ColumnsPicker-Oj9yt8Og.js","/assets/CommentsModal-DhA0lfCY.js","/assets/ComparisonTable-DG89hGNp.js","/assets/Concerns-CceLrnu8.js","/assets/ConfirmDialog-BCa0oMDG.js","/assets/Daily-FsU_LvPw.js","/assets/DataTable-CBoSXj2C.js","/assets/DateRangePicker-NICNfwcr.js","/assets/DayReportView-DyQe4jwM.js","/assets/DayStepper-CDPQ_yVL.js","/assets/DifferenceBreakdown-BEkkpSUM.js","/assets/Downtime-BNSG7JUZ.js","/assets/Education-BCRs0kcP.js","/assets/EducationLesson-DlNuvJ_e.js","/assets/EmptyState-DViq-AmV.js","/assets/Exam-B-dGNWEc.js","/assets/FactorySelect-E_7CcJEd.js","/assets/Gamification-BzcKkSeg.js","/assets/GroupBadge-C3IJVKHz.js","/assets/HeatmapChart-D3hEbOz3.js","/assets/IdleCell-C2_XKBT6.js","/assets/KPICard-DfCX8zhN.js","/assets/Kaizen-5ZNbHve8.js","/assets/Kelish-BSQpoy8S.js","/assets/KpiDeltaCard-8AQlBI6x.js","/assets/LangTextInput-B-KTZ6zH.js","/assets/Layout-BL14XZg5.js","/assets/LeaderAppeal-D_I90g1V.js","/assets/LeaderDayReport-Cz6DfRXf.js","/assets/LeaderUnitReport-Cgv9JrDr.js","/assets/Leaderboard-DKOkZjzG.js","/assets/Leaders-CxITObCK.js","/assets/Lightbox-foA2aBzo.js","/assets/LiveOverview-CmIUQmPh.js","/assets/Login-YT3u-A1i.js","/assets/NotFound-BtU198Eo.js","/assets/Notifications-Comgjn8b.js","/assets/Overview-6OmK-QC-.js","/assets/Pagination-B5ruYBbw.js","/assets/PerenaladkaFactTable-DFoi-wJa.js","/assets/PersonCard-D0iFOysZ.js","/assets/PlanFulfillment-C61MhmzI.js","/assets/Production-DMISwMol.js","/assets/Profile-DnjZRwVk.js","/assets/ProofCamera-BQYe7IPl.js","/assets/ProofPhoto-Cm5NX0LC.js","/assets/Quality-CGStl3OS.js","/assets/RawRows-DatJRFO4.js","/assets/RequestStateChip-CY4pVtp9.js","/assets/RichTextEditor-Dw1MIPeu.js","/assets/SaveState-CjJS4Oyy.js","/assets/SearchInput-DlUp8RFp.js","/assets/SeasonalityHeatmap-BAu_Nyt7.js","/assets/SegmentedToggle-DVFLN5lE.js","/assets/SetupTimes-BjwQrmH2.js","/assets/ShiftDaily-C_pcJNDY.js","/assets/Staff-Dly8ljXJ.js","/assets/StaffLive-BN8C4bzU.js","/assets/StatusBadge-LTHRKmM_.js","/assets/TargetGoal-BmSraym8.js","/assets/Targets-h-kEN2PW.js","/assets/Tasks-DmDhe6Z1.js","/assets/TimeWheelPicker-DkSw0nJD.js","/assets/Toast-ldZTGktv.js","/assets/Tooltip-BEitPheQ.js","/assets/TrendChart-Cs845A-I.js","/assets/TripleSpeedometer-CchNlBzu.js","/assets/Trudoyomkost-DXESwhvG.js","/assets/UploadDropzone-CGOVb0Fx.js","/assets/UsersActivity-D8TPHpeB.js","/assets/VerdictBlock-_sIjRqcp.js","/assets/VfxAbsences-BNbZC9-h.js","/assets/VfxApiMap-hBQrBLjK.js","/assets/VfxDevices-BCOQKoDs.js","/assets/VfxDictionaries-CGFdO_O4.js","/assets/VfxEmployees-Cd-6RWtN.js","/assets/VfxHrMoves-Cpfeec32.js","/assets/VfxIncidents-Byv7Wbgi.js","/assets/VfxJobs-Cvt_8WCf.js","/assets/VfxMarks-Wm2drk_v.js","/assets/VfxOnSite-BkMNDjfX.js","/assets/VfxPhoto-B_AdlxnO.js","/assets/VfxRequests-BbEjwJwn.js","/assets/VfxShifts-uyxkad93.js","/assets/VfxState-BhFMOz_E.js","/assets/VfxStructure--b2TsNaZ.js","/assets/VfxTable-DhbLEjld.js","/assets/VfxTimebooks-BTbE4ntQ.js","/assets/VfxTimesheet-DPi1eyrb.js","/assets/WatchProgress-CUJXOBL1.js","/assets/WebLogin-CN08E13n.js","/assets/WorkerConcerns-BqtnRfw1.js","/assets/Workers-Cn8oShwo.js","/assets/Zagruzka-sahC2g68.js","/assets/ZagruzkaCell-CWTKX4oQ.js","/assets/api-UWeaMqSn.js","/assets/archive-CR246Wju.js","/assets/archive-restore-DYvfbiP4.js","/assets/arrow-down-n926Yg6A.js","/assets/arrow-left-BVVQo1wc.js","/assets/arrow-up-narrow-wide-hXMQv-uP.js","/assets/arrow-up-nd5ib3AW.js","/assets/arrow-up-right-CnTOeNIv.js","/assets/award-CokLU77C.js","/assets/ban-utK_clDJ.js","/assets/bot-Brf5t2Ub.js","/assets/boxes-DUtUMpM1.js","/assets/braces-Dfg_pioW.js","/assets/brigadirFilters-CGmXWs-6.js","/assets/broadcastTree-Bp3UF6KW.js","/assets/building-2-CgefRE0h.js","/assets/calendar-C560rPi_.js","/assets/calendar-days-CUAfIS83.js","/assets/camera-Dk4RfdGu.js","/assets/categories-Dt1rJIHh.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C4yYXkJR.js","/assets/chart-line-DaBkZxs4.js","/assets/chart-pie-Cs2prCK7.js","/assets/chartRange-CT4hd7E4.js","/assets/check-check-BksIWfZw.js","/assets/chevron-left-BFYnrz0y.js","/assets/chevrons-up-down-ByFUDJ9A.js","/assets/circle-alert-3wODAVQh.js","/assets/circle-check-big-CPDDIvdI.js","/assets/circle-dashed-BZljBUpM.js","/assets/circle-minus-C0eC9_2R.js","/assets/circle-question-mark-BHFL1sgi.js","/assets/circle-slash-DlXjg6Ju.js","/assets/circle-user-round-C55rMH7w.js","/assets/circle-yS1KN4Sq.js","/assets/clock-3-3sLTVf4K.js","/assets/cloud-off-cI8WYZuE.js","/assets/cloud-upload-HZpPp1ED.js","/assets/compass-CE_7MTlE.js","/assets/concernCategories-C333ddQr.js","/assets/copy-QDJR3xF-.js","/assets/corner-down-right-jwUttYnl.js","/assets/createLucideIcon-D30HRh6q.js","/assets/door-open-CXSscsqR.js","/assets/es-C7s3tNib.js","/assets/exportXlsx-DYY9gXB9.js","/assets/external-link-CH8bxF6v.js","/assets/file-clock-DuLCFoel.js","/assets/file-exclamation-point-DzNnnhoA.js","/assets/file-spreadsheet-B4lxsDQU.js","/assets/file-text-CP3cbgLy.js","/assets/flag-B0R8y0do.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CHHxoeCS.js","/assets/hash-RqZuQWDm.js","/assets/history-BAeYvPrh.js","/assets/hourglass-DKDrN7_y.js","/assets/image-Bcucwqzr.js","/assets/image-off-BjcwLkOf.js","/assets/index-B7RbwW6q.css","/assets/index-BLCk4FKK.js","/assets/key-round-YOmnjTQl.js","/assets/keyboard-DIavXtwf.js","/assets/languages-FWJWKX_r.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DE6pEgS4.js","/assets/lightbulb-DXqRL9u5.js","/assets/link-2-CBGV3-Uf.js","/assets/link-2-off-DDQEISky.js","/assets/list-filter-t3Cjt_6d.js","/assets/list-ordered-CLrYakVo.js","/assets/list-tree-CqsfNDVH.js","/assets/lock-open-sJ_-KsJv.js","/assets/log-in-DCpBl2ny.js","/assets/maximize-2-DUchNi82.js","/assets/message-square-P_ZUJwTT.js","/assets/minimize-2-Dvpr8e2T.js","/assets/package-check-uQki_B2J.js","/assets/paperclip-DkevpuQX.js","/assets/pencil-DNGvYGEo.js","/assets/percent-DDZ9c9i2.js","/assets/phone-BhKf3tuH.js","/assets/pin-JvL1AGUq.js","/assets/pin-off-BBvVkUOB.js","/assets/play-CjOqLVxS.js","/assets/plug-zap-DQe9uLzc.js","/assets/presentation-Fg9ohOZi.js","/assets/prop-types-DWCP2EgN.js","/assets/radio-B5BykFJN.js","/assets/react-apexcharts.esm-DCWVpN28.js","/assets/registers-CCCkfReu.js","/assets/repeat-CCcyIRa8.js","/assets/rotate-ccw-CWEpdMbf.js","/assets/rotate-cw-Db6FwDjg.js","/assets/save-C72lalDf.js","/assets/scopeLinks-XpmDHRUH.js","/assets/scroll-text-CFpN-4rJ.js","/assets/search-x-WS-ZFuzA.js","/assets/segments-COIyVfE4.js","/assets/send-CVY6yanY.js","/assets/settings-2-CLMJQzL6.js","/assets/shield-DBPUc8PJ.js","/assets/shield-alert-BFsTnM-Z.js","/assets/shield-check-1hpop4Ll.js","/assets/shield-question-mark-DR43jg1p.js","/assets/snowflake-BcWeWWW_.js","/assets/split-CavBhBh7.js","/assets/square-DO6kuTDa.js","/assets/square-check-big-C0D9T_M6.js","/assets/star-OmGWz9ZQ.js","/assets/statusBands-DqoGoe0s.js","/assets/store-CiZPk2J0.js","/assets/table-2-BCcpEemH.js","/assets/table-properties-QO4h8mZE.js","/assets/tag-B-3M4xmu.js","/assets/tags-CnnpzMvU.js","/assets/timer-off-B34VhkyX.js","/assets/trending-down-BeSD_5Fw.js","/assets/trending-up-CoHlyBGf.js","/assets/undo-2-2fFDaq1Q.js","/assets/useChartTheme-CifFbGGp.js","/assets/useElementWidth-BAzvu7So.js","/assets/useIsMobile-BvzvmWaE.js","/assets/useOpenParam-DIvJKGdu.js","/assets/useStatusBands-DqpbCYD0.js","/assets/useUrlScope-Bit1dWRL.js","/assets/user-C92lynNU.js","/assets/user-cog-B8XRfZPb.js","/assets/user-minus-qjxXnUP0.js","/assets/users-gP0OE0d9.js","/assets/video-D_BEeEWD.js","/assets/wallet-3XPx50UE.js","/assets/warehouse-CdgGd3s_.js","/assets/x-CDosuojU.js","/assets/zap-BnNMUym6.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
