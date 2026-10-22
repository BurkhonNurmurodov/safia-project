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

const BUILD = "2026-10-22T05:53:32.847Z";
const PRECACHE = ["/","/assets/AdminPanel-CYFmXTm-.js","/assets/AnalysisBoard-BbeInEuN.js","/assets/Arc-Dc16UcZn.js","/assets/Assistant-CnJm9UTA.js","/assets/BrigadirProfile-2t2knFEy.js","/assets/BroadcastReceivers-IiD3DLKV.js","/assets/BroadcastRecord-DEeuviVp.js","/assets/Button-BVR8cccq.js","/assets/CatLockNotice-CptvfUMh.js","/assets/CategoryLegendModal-5oCPEb1j.js","/assets/CellConcerns-bVXgZ32B.js","/assets/CellDetails-BzcCFq8h.js","/assets/CellFormModal-VuNE6Q6i.js","/assets/CellIdent-Px9oPA1B.js","/assets/CellLink-CyL6E1ul.js","/assets/Cells-DC03vS5e.js","/assets/ColumnFilter-CP4e-llG.js","/assets/ColumnsPicker-4skZxV20.js","/assets/CommentsModal-D1u_XuhN.js","/assets/ComparisonTable-DuoelSaF.js","/assets/Concerns-2CZnr10C.js","/assets/CountStepper-CkJkHpbv.js","/assets/Daily-D1Jay32P.js","/assets/DataTable-D0Ww9dWj.js","/assets/DateRangePicker-WrEvsN9U.js","/assets/DayReportView-BQGL6y5c.js","/assets/DayStepper-C9gZzuZr.js","/assets/DayStrip-KIKM6ssb.js","/assets/DifferenceBreakdown-c-m8BZVr.js","/assets/Downtime-BzKUdNTs.js","/assets/Education-CB030sAW.js","/assets/EducationLesson-DYdk9cQY.js","/assets/EmptyState-tdomPbv-.js","/assets/Exam-DyFK1PxN.js","/assets/FactorySelect-r7cJwiZD.js","/assets/Gamification-Cv6BP28i.js","/assets/GroupBadge-JN-OMV_h.js","/assets/HeatmapChart-CU-omR31.js","/assets/IdleCell--67kDLn-.js","/assets/KPICard-CibDGiGv.js","/assets/Kaizen-CmZlejJ4.js","/assets/Kelish-DCIF-qcM.js","/assets/KpiDeltaCard-CI12nOlk.js","/assets/LangTextInput-DII5qddc.js","/assets/Layout-BD-eJFDg.js","/assets/LeaderAppeal-C2yCMF86.js","/assets/LeaderDayReport-DSE9OSyt.js","/assets/LeaderUnitReport-Dkd9nW41.js","/assets/Leaderboard-Dc65eabz.js","/assets/Leaders-B-CTembk.js","/assets/LeadersKpi-D3sZwyeM.js","/assets/Lightbox-L8b2XKKQ.js","/assets/LiveOverview-C49hfUyi.js","/assets/Login-C4sjmO3z.js","/assets/NotFound-BYcOHkJP.js","/assets/Notifications-CDpx04uX.js","/assets/Ontime-Cpj3P1VR.js","/assets/Overview-DnmPwC6R.js","/assets/Pagination-DcrVdjEX.js","/assets/PerenaladkaFactTable-BGLOv4V-.js","/assets/PersonCard-CGaN03Ts.js","/assets/PlanFulfillment-mqsq_FIt.js","/assets/Production-Dn-7Yo3n.js","/assets/Profile-BnvT3Bgf.js","/assets/ProofCamera-BHiqVEJW.js","/assets/ProofPhoto-CoBQk8IL.js","/assets/Quality-0NrGnN2E.js","/assets/RawRows-LjdS5fH3.js","/assets/RequestStateChip-DnmqXsbN.js","/assets/RichTextEditor-BiCU3K5s.js","/assets/SaveState-BbLNjk5o.js","/assets/SearchInput-YvHa4qEY.js","/assets/SeasonalityHeatmap-CMqmA3PW.js","/assets/SegmentedToggle-DtAmheWG.js","/assets/SetupTimes-DlCliCMV.js","/assets/ShiftDaily-BwdSdmqo.js","/assets/Staff-BTouHyZ6.js","/assets/StaffListAtCheck-BcQlDCu7.js","/assets/StatusBadge-C6oEjCu_.js","/assets/StatusBandsModal-BrxzoD4T.js","/assets/TargetGoal-DZf8alLZ.js","/assets/Targets-Bd23tu9H.js","/assets/Tasks-DD2cw5Sk.js","/assets/TimeWheelPicker-CY6vdjXv.js","/assets/Toast-Dj1Hr5l6.js","/assets/Tooltip-CSO8JpXS.js","/assets/TrendChart-AmyuoiP9.js","/assets/TripleSpeedometer-B_w0-DAM.js","/assets/Trudoyomkost-B0osCLN3.js","/assets/UploadDropzone-Bh4hNNCJ.js","/assets/UsersActivity-DZoc3ssv.js","/assets/VerdictBlock-GZzt5x-Y.js","/assets/VfxApiMap-CzqRM2nq.js","/assets/VfxDictionaries--jD6MhA4.js","/assets/VfxEmployees-F34ITzFx.js","/assets/VfxHrMoves-SAVHbc8s.js","/assets/VfxJobs--Q3g5NHi.js","/assets/VfxPhoto-DtivKE_p.js","/assets/VfxShifts-C0lfub1B.js","/assets/VfxState-BhUTiiMU.js","/assets/VfxTimebooks-DQUNdjl8.js","/assets/VfxTimesheet-BW_IoFzE.js","/assets/WatchProgress-B4BD-wU2.js","/assets/WebLogin-Bqe0yHJZ.js","/assets/Workers-Dr0Tyc2X.js","/assets/Zagruzka-BFGw9o11.js","/assets/ZagruzkaCell-gn3QLqgR.js","/assets/api-OWhICk8_.js","/assets/archive-B8IJB1Sy.js","/assets/archive-restore-DUgqzEjI.js","/assets/arrow-down-Coqe2Fp-.js","/assets/arrow-down-right-DXUIp88V.js","/assets/arrow-down-wide-narrow-8jgQYQYy.js","/assets/arrow-up-narrow-wide-BjaUkVof.js","/assets/ban-NCyuBR2h.js","/assets/boxes-0q6anxzJ.js","/assets/braces-CXlflXC_.js","/assets/brigadirFilters-BQNoi_bd.js","/assets/broadcastTree-Da9ioMze.js","/assets/building-2-Cy5LxNPi.js","/assets/calendar-CEs36Igc.js","/assets/calendar-days-CpOCRCjE.js","/assets/camera-CPwcaCwX.js","/assets/categories-KF3WrJWp.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-t0qPJHkw.js","/assets/chart-line-CsTlxUA1.js","/assets/chart-pie-Bh0O82sR.js","/assets/chartRange-Bh3w37zz.js","/assets/check-check-CFYxBBvV.js","/assets/chevron-left-QBWH_zwn.js","/assets/chevrons-up-down-BbQHLat_.js","/assets/circle-7NWQ0GOd.js","/assets/circle-alert-zdC_J3e4.js","/assets/circle-check-big-DAhX0pDI.js","/assets/circle-dashed-D-FCqaJJ.js","/assets/circle-minus-Ba6ssMk8.js","/assets/circle-question-mark-D6Oyr3ou.js","/assets/circle-slash-BWgjG_fA.js","/assets/circle-user-round-pvMFDYFh.js","/assets/cloud-off-C3CjYztJ.js","/assets/cloud-upload-BhwLDjxk.js","/assets/compass-D0GEoad8.js","/assets/concernCategories-D-DieQiM.js","/assets/corner-down-right-D6AWVajV.js","/assets/createLucideIcon-mXjONOha.js","/assets/es-DuQcxYsQ.js","/assets/external-link-B5gpSLPx.js","/assets/file-clock-Co6DVTrB.js","/assets/file-exclamation-point-dKzCOTgR.js","/assets/flag-BNaZ2tz6.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-EhEVowcm.js","/assets/funnel-26OHDbqX.js","/assets/hash-BGZSf6Kn.js","/assets/hourglass-ijmIDT7x.js","/assets/image-BtE0o_jb.js","/assets/image-off-BnoTu4gj.js","/assets/inbox-h5faRMHR.js","/assets/index-CGXRVp17.js","/assets/index-Ct9WqSVA.css","/assets/keyboard-BWqIAWDI.js","/assets/languages-BvC_SSUU.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CisWJkfW.js","/assets/lightbulb-Bckldhn3.js","/assets/link-2-8zS9g8uv.js","/assets/link-2-off-AWpmiTB-.js","/assets/list-ordered-q_kQzYT7.js","/assets/list-tree-B6xs11mA.js","/assets/lock-open-55p63zix.js","/assets/log-in-CWBAkI07.js","/assets/marks-Biwr0Hzs.js","/assets/minimize-2-BCNSD5uF.js","/assets/package-check-BWweJT-C.js","/assets/pencil-BcOppWNb.js","/assets/percent-DeteWx8R.js","/assets/pin-C4lwDL9u.js","/assets/pin-off-LYVjEDwM.js","/assets/play-BTsVQjP6.js","/assets/plug-zap-BLUSH1VY.js","/assets/prop-types-CKXphuqr.js","/assets/radio-DjFz9sMj.js","/assets/react-apexcharts.esm-DDkfJoqr.js","/assets/registers-Cp_CJTGp.js","/assets/repeat-DbhlP1gS.js","/assets/save-BjJ0zZ0E.js","/assets/scopeLinks-BdsuvaNA.js","/assets/scroll-text-Cmxzimap.js","/assets/search-x-hxoIM9NG.js","/assets/segments-DURnnUuM.js","/assets/send-3cIeU_ix.js","/assets/settings-2-D0QKdpbt.js","/assets/shield-DugGxrBb.js","/assets/shield-alert-CIThHyCE.js","/assets/shield-question-mark-x25wlHj2.js","/assets/sigma-C5uVYYoh.js","/assets/siren-DweyyvW0.js","/assets/snowflake-Cu4wtgYI.js","/assets/split-DDnyrQ57.js","/assets/square-check-big-Dq8UpFwE.js","/assets/star-20w1QsTa.js","/assets/statusBands-CGLxOOZE.js","/assets/store-BB-SYg9t.js","/assets/table-2-CwcnZQAG.js","/assets/table-properties-CJ7ZqNEM.js","/assets/tag-CwEqMPqv.js","/assets/timer-off-BArnV9h8.js","/assets/trendBuckets-BAdzI1jW.js","/assets/trending-down-8cMum_Ls.js","/assets/trending-up-COITG2LX.js","/assets/undo-2-CbfqfRCv.js","/assets/useChartTheme-CURvVrDd.js","/assets/useElementWidth-Brx3dfDY.js","/assets/useIsMobile-sY-oUORX.js","/assets/useOpenParam-CRgbQI3h.js","/assets/useStatusBands-x5SNnOdU.js","/assets/useUrlScope-CQ179pv-.js","/assets/user-Bz36KIlJ.js","/assets/user-cog-CSlhMavq.js","/assets/user-minus-Bh6RGUsC.js","/assets/users-BamBQhPn.js","/assets/vfx-DQKi0x6B.js","/assets/video-DgfsphsX.js","/assets/wallet-y-bkk-cP.js","/assets/warehouse-_7w-qigE.js","/assets/workflow-DbPYskur.js","/assets/x-QXIN0IXv.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
