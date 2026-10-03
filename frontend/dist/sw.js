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

const BUILD = "2026-10-03T09:11:04.871Z";
const PRECACHE = ["/","/assets/AdminPanel-BZTKUP3R.js","/assets/AnalysisBoard-Bn6GsCtq.js","/assets/Arc-B7hX-Jv6.js","/assets/ArcLegacy-Dpy-6L4A.js","/assets/BrigadirProfile-CiTstiiz.js","/assets/BroadcastReceivers-CbtKXNCX.js","/assets/BroadcastRecord-D2meteqt.js","/assets/CatLockNotice-C6sQ6bxp.js","/assets/CategoryLegendModal-CR6eO-nt.js","/assets/CellConcerns-CBYgdyJv.js","/assets/CellDetails-DyQGBsrp.js","/assets/CellFormModal-DBzDB36z.js","/assets/CellIdent-CBO3SYl4.js","/assets/CellLink-DIEnjhKT.js","/assets/Cells-_sFhWdM_.js","/assets/ColumnFilter-BKOwrLuS.js","/assets/ColumnsPicker-CznHPRW0.js","/assets/CommentsModal-Dd08_OzA.js","/assets/ComparisonTable-CTKgXr4V.js","/assets/Concerns-CS2Mgr4X.js","/assets/ConfirmDialog-D2g8Puma.js","/assets/Daily-PHXlbVXE.js","/assets/DataTable-lIyLL4kd.js","/assets/DateRangePicker-B8vTAY62.js","/assets/DayReportView-Bvz5p9rN.js","/assets/DayStepper-DQcbhLic.js","/assets/DifferenceBreakdown-szLybTGa.js","/assets/Downtime-CKCssvyJ.js","/assets/Education-DPeiYIse.js","/assets/EducationLesson-BhQ3TU7X.js","/assets/EmptyState-BYDdoAx5.js","/assets/Exam-Cz4bdVFs.js","/assets/FactorySelect-B9xvf_Bt.js","/assets/Gamification-CiKGLQxz.js","/assets/GroupBadge-CCHEL0Fw.js","/assets/HeatmapChart-B9-gVdld.js","/assets/IdleCell-BgnnUbON.js","/assets/KPICard-CjhUC1M-.js","/assets/Kaizen-DSfq5zYI.js","/assets/Kelish-BEEhs7qo.js","/assets/KpiDeltaCard-QFAPD6DN.js","/assets/LangTextInput-BCCfdCGi.js","/assets/Layout-BOX-BsMh.js","/assets/LeaderAppeal-BCHJP2sR.js","/assets/LeaderDayReport-B84WvFSW.js","/assets/LeaderUnitReport-CUTuyokW.js","/assets/Leaderboard-BI8CLDJX.js","/assets/Leaders-Dg4ZoLhw.js","/assets/Lightbox-B1EPzo7_.js","/assets/LiveOverview-BMzH3Dz3.js","/assets/Login-u96FLTAf.js","/assets/NotFound-CqXnF58Y.js","/assets/Notifications-C2ZxkfOx.js","/assets/Overview-u6kcm1DG.js","/assets/Pagination-Dx0c573r.js","/assets/PerenaladkaFactTable-CwQdYSnD.js","/assets/PlanFulfillment-DoxS3v3n.js","/assets/Production-LkhKGzZy.js","/assets/Profile-SYsL-ttd.js","/assets/ProofCamera-CujAx697.js","/assets/ProofPhoto-Bv8tHaMk.js","/assets/Quality-CYmGZ9Vw.js","/assets/RequestStateChip-DwQq1FGG.js","/assets/RichTextEditor-CQDSzRDO.js","/assets/SaveState-DDojVIFy.js","/assets/SearchInput-BlmZkOYB.js","/assets/SeasonalityHeatmap-DLk4ooYx.js","/assets/SegmentedToggle-DSRV9lMP.js","/assets/SetupTimes-BZ_FxVjt.js","/assets/ShiftDaily-Dfspfqik.js","/assets/Staff-BDEjEYrF.js","/assets/StaffLive-DHUJozsW.js","/assets/StatusBadge-Bf0g-NOC.js","/assets/TargetGoal-DIMpCHuu.js","/assets/Targets-BxYas2TN.js","/assets/Tasks-C6ET1eEK.js","/assets/TimeWheelPicker-DQ2ZbZBe.js","/assets/Toast-FpgMlTQk.js","/assets/Tooltip-NtvEKUCr.js","/assets/TrendChart-DXWJqxSK.js","/assets/TripleSpeedometer-DiHYQPu-.js","/assets/Trudoyomkost-BsMFRq50.js","/assets/UploadDropzone-BaC3yYAu.js","/assets/UsersActivity-BhkimONb.js","/assets/VerdictBlock-QMNEcak7.js","/assets/WatchProgress-DqQwojrM.js","/assets/WebLogin-Dso-o8K2.js","/assets/WorkerConcerns-B0zrXQN4.js","/assets/Workers-B5k7p3i6.js","/assets/Zagruzka-DkvNBGa6.js","/assets/ZagruzkaCell-MVebLXKm.js","/assets/api-BOT6TzLW.js","/assets/archive-DXX01uNd.js","/assets/archive-restore-aa4czVoA.js","/assets/arrow-down-DCMjYZh-.js","/assets/arrow-left-BUrsu7Co.js","/assets/arrow-right-left-0r14F9t_.js","/assets/arrow-up-F38NiXJU.js","/assets/arrow-up-narrow-wide-B9BnDvs-.js","/assets/arrow-up-right-DqZZMImC.js","/assets/award-C0G_H7Wm.js","/assets/ban-BdGtY5Ds.js","/assets/bot-C-TOxe15.js","/assets/boxes-C-7bfpSa.js","/assets/brigadirFilters-4rcClxYh.js","/assets/broadcastTree-BtaI2qa0.js","/assets/building-2-C9dWGvqS.js","/assets/calendar-DEZT0Rwu.js","/assets/calendar-days-B8V9hLwD.js","/assets/calendar-range-Bc95zLdr.js","/assets/camera-CEpmCMFC.js","/assets/categories-CUey-non.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-5QBZAM1A.js","/assets/chart-line-4gVX7tc6.js","/assets/chart-pie-BXeKhJ6K.js","/assets/chartRange-DWU6ePAF.js","/assets/chevron-left-6G3z6eNq.js","/assets/chevrons-up-down-Ck2pqS9d.js","/assets/circle-CvVKblm9.js","/assets/circle-alert-VHBR5WCt.js","/assets/circle-check-big-wmTBpq4L.js","/assets/circle-minus-BJ-O0dVX.js","/assets/circle-question-mark-Ckw9hWp6.js","/assets/circle-slash-Cov-hIRf.js","/assets/circle-user-round-DCkAojgl.js","/assets/cloud-off-DekvKn3A.js","/assets/cloud-upload-DfSbRifH.js","/assets/compass-DSslYUhH.js","/assets/concernCategories-CeszApQo.js","/assets/copy-CX2OfTpG.js","/assets/corner-down-right-CW69jvO3.js","/assets/createLucideIcon-BhyEFTYx.js","/assets/es-BGhCVxxD.js","/assets/exportXlsx-B1W2tT7A.js","/assets/external-link-DPTh_oLf.js","/assets/file-clock-D5KaqXta.js","/assets/file-exclamation-point-BAaJAlTz.js","/assets/file-spreadsheet-CG072iSN.js","/assets/file-text-Bu_ajPNh.js","/assets/flag-ChaL_ktP.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CBj7Wk2M.js","/assets/hash-2nATZk46.js","/assets/history-CMTyzxUt.js","/assets/hourglass-C22iLBQ8.js","/assets/id-card-Cv3BcAS9.js","/assets/image-CY8ph6KK.js","/assets/image-off-BA5nx7uO.js","/assets/inbox-CPWONBbO.js","/assets/index-B5XjM84r.js","/assets/index-Bc1m5P-9.css","/assets/key-round-7MmczeXz.js","/assets/keyboard-Do6j9zuj.js","/assets/languages-Bmkf9nKp.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BMqnWBKa.js","/assets/lightbulb-CVgX0C4J.js","/assets/link-2-C52Mq_qx.js","/assets/link-2-off-CX2Jaf_S.js","/assets/list-ordered-CO8ztrvX.js","/assets/list-tree-CMT4mvxk.js","/assets/lock-open-Bt8WAW4Q.js","/assets/log-in-Cbrjnujt.js","/assets/maximize-2-D16gVLgi.js","/assets/message-square-DA2XyhIU.js","/assets/minimize-2-C6S7-qWo.js","/assets/package-check-BWJ04uIi.js","/assets/paperclip-BXmKCVqe.js","/assets/pencil-B6O1uJFL.js","/assets/percent-B93o9acf.js","/assets/pin-BmSyv3y5.js","/assets/pin-off-nDgw7aK-.js","/assets/play-DgT_n-Fz.js","/assets/plug-zap-4IGwwCt4.js","/assets/presentation-NNIaNOnj.js","/assets/prop-types-CMX_mCd3.js","/assets/radio-ZE8H9HLm.js","/assets/react-apexcharts.esm-IU47qUnz.js","/assets/repeat-QFFU2WHU.js","/assets/rotate-ccw-IIuWXsHp.js","/assets/rotate-cw-tpVy2Ncf.js","/assets/save-C7UlG5jH.js","/assets/scopeLinks-Dczv-PhY.js","/assets/scroll-text-Ce9DRkNb.js","/assets/search-x-DRNY0V7J.js","/assets/segments-0QEnxTpS.js","/assets/send-B01u1yR_.js","/assets/settings-2-BuTGRL33.js","/assets/shield-CSAZYKHy.js","/assets/shield-alert-B-upT24J.js","/assets/shield-check-DwtVpGFP.js","/assets/shield-question-mark-NFlw1Cmz.js","/assets/siren-CcPiKLRl.js","/assets/snowflake-Cbqgg0R4.js","/assets/split-BnaFsa-c.js","/assets/square-BwZU9-XO.js","/assets/square-check-big-DJ7THPEJ.js","/assets/star-DW_d_GFZ.js","/assets/statusBands-COup0VS8.js","/assets/store-xYl78aoT.js","/assets/table-2-CI67Lx_b.js","/assets/table-properties-fB0rFAHS.js","/assets/tag-DvZoWWbO.js","/assets/timer-off-CVFy2sn2.js","/assets/trending-down-bkZZFNZk.js","/assets/trending-up-DzQjxhkk.js","/assets/undo-2-DJ-VLwk4.js","/assets/useChartTheme-BW1kw0oZ.js","/assets/useElementWidth-Coya7tHG.js","/assets/useIsMobile-CfCDQodJ.js","/assets/useOpenParam-gHrW0VRq.js","/assets/useStatusBands-BubEvZqk.js","/assets/useUrlScope-DwqS8g-c.js","/assets/user-BXIJq67M.js","/assets/user-cog-CMh44_fg.js","/assets/user-minus-BU2SScBt.js","/assets/users-DkXuuP2A.js","/assets/video-Dfstzciu.js","/assets/wallet-ngAfu3o3.js","/assets/warehouse-BeIERIcQ.js","/assets/x-BRW13Dkk.js","/assets/zap-DP5f3RY_.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
