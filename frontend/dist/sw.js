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

const BUILD = "2026-10-04T14:48:16.138Z";
const PRECACHE = ["/","/assets/AdminPanel-DbXhCNiK.js","/assets/AnalysisBoard-3Hs0ADo9.js","/assets/Arc-kC5GEGLK.js","/assets/ArcLegacy-B8uiP_tT.js","/assets/BrigadirProfile-CsBJK1UR.js","/assets/BroadcastReceivers-e-IDKC2k.js","/assets/BroadcastRecord-9zW6Mldm.js","/assets/CatLockNotice-COZd0mpl.js","/assets/CategoryLegendModal-Hz1k6oKs.js","/assets/CellConcerns-DELy3kPf.js","/assets/CellDetails-qcRkAeIL.js","/assets/CellFormModal-BghdTbAx.js","/assets/CellIdent-DrwclAVV.js","/assets/CellLink-BLDdiXQe.js","/assets/Cells-D0xtcp7T.js","/assets/ColumnFilter-Btfajdxo.js","/assets/ColumnsPicker-DldCrZWf.js","/assets/CommentsModal-CKk7LiR-.js","/assets/ComparisonTable-H5-Zo822.js","/assets/Concerns-ojns5xZW.js","/assets/ConfirmDialog-B_jnEUDC.js","/assets/Daily-DavTg9pZ.js","/assets/DataTable-CMyoPjkY.js","/assets/DateRangePicker-VSHn0wZK.js","/assets/DayReportView-BjQ-hrtL.js","/assets/DayStepper-B9AYek5L.js","/assets/DifferenceBreakdown-BtmH_qQO.js","/assets/Downtime-Dx-OMBC-.js","/assets/Education-B297GIDB.js","/assets/EducationLesson-9IURtuXA.js","/assets/EmptyState-CAgJsoRJ.js","/assets/Exam-BQ109LFR.js","/assets/FactorySelect-BM-6sGBE.js","/assets/Gamification-BCX_np9m.js","/assets/GroupBadge-Dx183XO5.js","/assets/HeatmapChart-B5ZAuhtw.js","/assets/IdleCell-DlxrX4uX.js","/assets/KPICard-CkhsFLLw.js","/assets/Kaizen-BBkI-R2t.js","/assets/Kelish-BRir-jld.js","/assets/KpiDeltaCard-BrpoRkFX.js","/assets/LangTextInput-yY1xdogj.js","/assets/Layout-CDb7EzMW.js","/assets/LeaderAppeal-BW03qPcd.js","/assets/LeaderDayReport-CazNZ-FB.js","/assets/LeaderUnitReport-DCpAvIfz.js","/assets/Leaderboard-CyKWcE9K.js","/assets/Leaders-CGj8D9ro.js","/assets/Lightbox-DMzDEiqp.js","/assets/LiveOverview-Dvg81qa9.js","/assets/Login-iVvejSkM.js","/assets/NotFound-T5DqWzb_.js","/assets/Notifications-CY1RKu9J.js","/assets/Overview-BgEm55R5.js","/assets/Pagination-BvHnfqOK.js","/assets/PerenaladkaFactTable-CwkpUC6u.js","/assets/PersonCard-Ba4hNkNX.js","/assets/PlanFulfillment-DkIogaSe.js","/assets/Production-B2YrurMu.js","/assets/Profile-6Ltkzy9L.js","/assets/ProofCamera-CEMIXRYb.js","/assets/ProofPhoto-BOD85Cpn.js","/assets/Quality-Dx4So3BL.js","/assets/RawRows-BzRrizCU.js","/assets/RequestStateChip-DNCwz2Nd.js","/assets/RichTextEditor-Bh6nmzSQ.js","/assets/SaveState-De6Ch_Hm.js","/assets/SearchInput-BV6uGdTF.js","/assets/SeasonalityHeatmap-Myvw-VXi.js","/assets/SegmentedToggle-D8fBQUxx.js","/assets/SetupTimes-CZAywsYf.js","/assets/ShiftDaily-DOOKKlvz.js","/assets/Staff-BephFe4q.js","/assets/StaffLive-DCHBs2gb.js","/assets/StatusBadge--MKdKh2H.js","/assets/TargetGoal-DJitjBGk.js","/assets/Targets-C5Iaqplg.js","/assets/Tasks-GMz5yOPE.js","/assets/TimeWheelPicker-CYDgKr7q.js","/assets/Toast-B5SUtmkP.js","/assets/Tooltip-CLHYwwGh.js","/assets/TrendChart-Bsn41-9P.js","/assets/TripleSpeedometer-BbWTax8L.js","/assets/Trudoyomkost-BDRyqM9Y.js","/assets/Turnover-lp3iEzCE.js","/assets/UploadDropzone-CiChp5vf.js","/assets/UsersActivity-BaXWCEfh.js","/assets/VerdictBlock-BTE58tJ-.js","/assets/VfxApiMap-Du9zcb9e.js","/assets/VfxDictionaries-Poi-TVFW.js","/assets/VfxEmployees-DIaHVaei.js","/assets/VfxHrMoves-Cej7Np6K.js","/assets/VfxJobs-Dh1hrH1_.js","/assets/VfxPhoto-BnTvj0-i.js","/assets/VfxShifts-0TsxA977.js","/assets/VfxState-BOO2ryev.js","/assets/VfxTimebooks-BMTPDNPJ.js","/assets/VfxTimesheet-XCZDDYiF.js","/assets/WatchProgress-P1oJFlcN.js","/assets/WebLogin-CFYgrEMh.js","/assets/WorkerConcerns--yaWYAer.js","/assets/Workers-9mOUU_1k.js","/assets/Zagruzka-WUg4PPUT.js","/assets/ZagruzkaCell-BPhhTPrN.js","/assets/api-723vT04g.js","/assets/archive-C6wcG3fi.js","/assets/archive-restore-YRU-n-7w.js","/assets/arrow-down-ApFQnXMw.js","/assets/arrow-left-D-cU-9OT.js","/assets/arrow-up-ECsEZ3Zr.js","/assets/arrow-up-narrow-wide-CrvcGIsi.js","/assets/arrow-up-right-DR5Aq2F0.js","/assets/award-Cvhkdiu6.js","/assets/ban-Ce1z-Ql6.js","/assets/book-open--SuM70EJ.js","/assets/bot-CDSzkYeY.js","/assets/boxes-GMg2y-M4.js","/assets/braces-Dzs9Cr_d.js","/assets/brigadirFilters-BozQHP_d.js","/assets/broadcastTree-DGBysaLO.js","/assets/building-2-C6gAOzFp.js","/assets/calculator-CqGjo8tU.js","/assets/calendar-days-BL-j7DFf.js","/assets/calendar-tmB4TTqi.js","/assets/camera-DdS0cXTd.js","/assets/categories-BY-bKuDf.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-asckDFgP.js","/assets/chart-line-TFVJwk1G.js","/assets/chart-pie-l_-hnUam.js","/assets/chartRange-BVkXhr0n.js","/assets/check-check-0pS_fB5S.js","/assets/chevron-left-DBtb4pAp.js","/assets/chevrons-up-down-1Rjb-nuD.js","/assets/circle-BNhuZmGu.js","/assets/circle-alert-BcvF6IaG.js","/assets/circle-check-big-DWCcAxjc.js","/assets/circle-dashed-sEDhnbDA.js","/assets/circle-minus-D8p8veIP.js","/assets/circle-question-mark-BAyLRVgR.js","/assets/circle-slash-D70JwRsx.js","/assets/circle-user-round-B8uvUXfh.js","/assets/clock-3-Bb7tVtYQ.js","/assets/cloud-off-DVv7eRYi.js","/assets/cloud-upload-BULdlSCX.js","/assets/compass-Csjuch7A.js","/assets/concernCategories-O8MdnXlP.js","/assets/copy-Bh0S7F3C.js","/assets/corner-down-right-rH-vpHr6.js","/assets/createLucideIcon-B-zV9vDi.js","/assets/es-DMUmof34.js","/assets/exportXlsx-BO9vn3Xo.js","/assets/external-link-XUoIA2un.js","/assets/file-clock-DPYiyu6W.js","/assets/file-exclamation-point-BhY9Smpn.js","/assets/file-spreadsheet-BPv7kSGz.js","/assets/file-text-Dh9BKfxq.js","/assets/flag-C6hIB4mv.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DD_E_5sR.js","/assets/hash-BgwIt93J.js","/assets/history-DewRQvfO.js","/assets/hourglass-Do8VJGwR.js","/assets/image-BTn-OGIr.js","/assets/image-off-Lpz985sO.js","/assets/inbox-BB5DAY1R.js","/assets/index-BAN4mMdX.css","/assets/index-Bzd_hAS-.js","/assets/key-round-Drw7rQqM.js","/assets/keyboard-BPhtXsM8.js","/assets/languages-ZRpZHMcS.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DK3Zp8wm.js","/assets/lightbulb-DumIFKZe.js","/assets/link-2-CCQzATYj.js","/assets/link-2-off-DgUeixWS.js","/assets/list-ordered-DYVCzcUz.js","/assets/list-tree-DkR8J0rH.js","/assets/lock-open-0e7YcifQ.js","/assets/log-in-C_8dFMXg.js","/assets/maximize-2-CGrH_yg_.js","/assets/message-square-BpMy8ult.js","/assets/minimize-2-YhFufnSu.js","/assets/package-check-BsWQO3AA.js","/assets/paperclip-DpfJGX4R.js","/assets/pencil-DCD8OLG-.js","/assets/percent-JOBq29A1.js","/assets/pin-EuiuUQCo.js","/assets/pin-off-Bn9PfWF4.js","/assets/play-rxyRvq69.js","/assets/plug-zap-CvFsMOUB.js","/assets/presentation-CXlsFOgQ.js","/assets/prop-types-LhsPEdQE.js","/assets/radio-B-MXMgBD.js","/assets/react-apexcharts.esm-CZRRkJqw.js","/assets/registers-NfMzUfrX.js","/assets/repeat-B53orI9V.js","/assets/rotate-ccw--Z24A1oG.js","/assets/rotate-cw-CPoUVBiD.js","/assets/save-CiEJawpN.js","/assets/scopeLinks-BLQnBOsS.js","/assets/scroll-text-C6JezDYc.js","/assets/search-x-Cqd5Ec95.js","/assets/segments-Bay2PFth.js","/assets/send-dcobBHq1.js","/assets/settings-2-vWzhUfoZ.js","/assets/shield-CmYHTDPk.js","/assets/shield-alert-Bkc1z-YR.js","/assets/shield-check-BN9dXBMk.js","/assets/shield-question-mark-BjIHXKQh.js","/assets/siren-lGTCdLkc.js","/assets/snowflake-BjrSm9DN.js","/assets/split-BuSr2Zbk.js","/assets/square-ZSu9dH8_.js","/assets/square-check-big-D-gFaNOD.js","/assets/star-Cu1dQL_R.js","/assets/statusBands-QW3tXywJ.js","/assets/store-Bd9OfD5k.js","/assets/table-2-XKSElezl.js","/assets/table-properties-QdfGAhvO.js","/assets/tag-BjRQ7wZH.js","/assets/timer-off-BT3YQGPO.js","/assets/trending-down-BmLWjblw.js","/assets/trending-up-1EPVMN5v.js","/assets/undo-2-CBBoG2L8.js","/assets/useChartTheme-BtzZb4ar.js","/assets/useElementWidth-DiHDb00K.js","/assets/useIsMobile-Du405wBZ.js","/assets/useOpenParam-CaOAhyzx.js","/assets/useStatusBands-DGD0fQ5J.js","/assets/useUrlScope-BixHHKJY.js","/assets/user-CTNyojZD.js","/assets/user-cog-8CZq9WwN.js","/assets/users-DgUELjkS.js","/assets/vfx-lsqNB1if.js","/assets/video-FO3lfwOx.js","/assets/wallet-9TAYVUX3.js","/assets/warehouse-CWjaUMlw.js","/assets/x-3K2Dr4IE.js","/assets/zap-CC9gJnn2.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
