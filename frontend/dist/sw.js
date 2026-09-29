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

const BUILD = "2026-09-29T13:55:49.949Z";
const PRECACHE = ["/","/assets/AdminPanel-4btfllok.js","/assets/AnalysisBoard-C2EoPf-O.js","/assets/Arc-BsaQK3GU.js","/assets/ArcLegacy-nVPEmbo0.js","/assets/AttendanceModal-Cq_MpAQw.js","/assets/BrigadirProfile-D_MsRTjJ.js","/assets/BroadcastReceivers-DPcp_Nv7.js","/assets/BroadcastRecord-CIimU4Cl.js","/assets/CatLockNotice-CxP0cJ1p.js","/assets/CategoryLegendModal-CoRKtX25.js","/assets/CellConcerns-jK0aoMwi.js","/assets/CellDetails-BdzuIjfs.js","/assets/CellFormModal-PnFnL_Jr.js","/assets/CellLink-VOmk669m.js","/assets/Cells-BvpiUlnI.js","/assets/ColumnFilter-Cru05Svt.js","/assets/ColumnsPicker-C4Ubbrs6.js","/assets/CommentsModal-CCV0FqNR.js","/assets/ComparisonTable-BdIpVOEl.js","/assets/Concerns-DY9_IHbY.js","/assets/ConfirmDialog-B-edB1Pb.js","/assets/Daily-BQ55IWfE.js","/assets/DataTable-DYfgA_Sl.js","/assets/DateRangePicker-CXh2niTi.js","/assets/DayReportView-BDOvWQMz.js","/assets/DayStepper-BnofsVpm.js","/assets/DifferenceBreakdown-D64s6vuG.js","/assets/Downtime-OZlrzrfz.js","/assets/Education-DmrGwHYi.js","/assets/EducationLesson-bXy_PUq7.js","/assets/EmptyState-B29oR61e.js","/assets/Exam-BBu3psFX.js","/assets/FactorySelect-Bofqu3Dh.js","/assets/Gamification-CiRnnn0l.js","/assets/GroupBadge-DnfSbW3w.js","/assets/HeatmapChart-DyHHmThp.js","/assets/IdleCell-BG9oNvwq.js","/assets/KPICard-WP8zBXJC.js","/assets/Kaizen-ClpbVXbh.js","/assets/Kelish-DnzGWVdB.js","/assets/KpiDeltaCard-BlrkMHKR.js","/assets/LangTextInput-CvvbXaNB.js","/assets/Layout-uJ2tCK5_.js","/assets/LeaderAppeal-DVvYPOnG.js","/assets/LeaderDayReport-BojrJGsq.js","/assets/LeaderUnitReport-C21YKslP.js","/assets/Leaderboard-BRINZ0Os.js","/assets/Leaders-BEqmT-nA.js","/assets/Lightbox-B92cjhwZ.js","/assets/LiveOverview-DxDOXHD-.js","/assets/Login-DU1oDPpM.js","/assets/NotFound-Dec26IHd.js","/assets/Overview-CuY0cUUb.js","/assets/Pagination-ClI_H1mt.js","/assets/PerenaladkaFactTable-Bi0rRZve.js","/assets/PlanFulfillment-B4Lor0P4.js","/assets/Production-4L4VCCv-.js","/assets/Profile-BBwD1fwo.js","/assets/ProofCamera-ByxOd2aU.js","/assets/ProofPhoto-CsXuOxe6.js","/assets/Quality-D1bHQ1y3.js","/assets/RequestStateChip-BN-qBDGQ.js","/assets/RichTextEditor-CB77dEFi.js","/assets/SaveState-xSYJUvEX.js","/assets/SearchInput-DADVPTcL.js","/assets/SeasonalityHeatmap-CAL7oZbS.js","/assets/SegmentedToggle-BcEqdKv1.js","/assets/SetupTimes-ZKa_Lkar.js","/assets/ShiftDaily-Vhf3Bw9e.js","/assets/Staff-BJAAcWFz.js","/assets/StatusBadge-DWq2Z52D.js","/assets/TargetGoal-CkHQJ06X.js","/assets/Targets-q7fF5Wbl.js","/assets/Tasks-CehM5SQ2.js","/assets/TimeWheelPicker-C00mp_Aj.js","/assets/Tooltip-Bp8tmH9f.js","/assets/TrendChart-BGo3Z2ke.js","/assets/TripleSpeedometer-CswQcPgC.js","/assets/Trudoyomkost-lWa3Ce3N.js","/assets/UploadDropzone-CTjiVlSX.js","/assets/UsersActivity-phCskkcM.js","/assets/VerdictBlock-Bht2T-VD.js","/assets/WatchProgress-BoJIxIt3.js","/assets/WebLogin-D6XwChc0.js","/assets/WorkerConcerns-B30AK_Tp.js","/assets/Workers-BF9PRK4P.js","/assets/Zagruzka-DpMNj4H0.js","/assets/ZagruzkaCell-psa64WDF.js","/assets/api-BjNtkBAM.js","/assets/archive-DOe-_wd2.js","/assets/archive-restore-rL6a7EPR.js","/assets/arrow-down-Bz3kkoPV.js","/assets/arrow-left-CDaig1YM.js","/assets/arrow-left-right-COLEY9yW.js","/assets/arrow-up-DPc5Fo-J.js","/assets/arrow-up-narrow-wide-Buzd1oil.js","/assets/arrow-up-right-Bz8kgzVX.js","/assets/award-D6U409-v.js","/assets/ban-DDCJoSoq.js","/assets/bot-DyZ5Qetn.js","/assets/boxes-CP2fif97.js","/assets/brigadirFilters-BsSErnri.js","/assets/broadcastTree-D4FXnAXB.js","/assets/building-2-CVie-cES.js","/assets/calendar-ZpUwsqHv.js","/assets/calendar-clock-DlYYY7IC.js","/assets/calendar-days-BKNVGaUV.js","/assets/calendar-range-YkcDqDGa.js","/assets/camera-PwoWGJjJ.js","/assets/categories-BRKNI1IO.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BwCGbeqJ.js","/assets/chart-line-CzhToqOk.js","/assets/chart-pie-CCg-nP5S.js","/assets/chartRange-De64wVC2.js","/assets/chevron-left-Cif_BDC1.js","/assets/chevrons-up-down-DSt-gqfM.js","/assets/circle-CbsJg7Yq.js","/assets/circle-check-big-TS_IgEhu.js","/assets/circle-dot-D32j0Yfd.js","/assets/circle-minus-Czeo_LsO.js","/assets/circle-slash-Bgji5OGx.js","/assets/circle-user-round-4L_Yy0J-.js","/assets/cloud-off-RjRsmj-X.js","/assets/cloud-upload-B3tWdjgE.js","/assets/compass-D7wDvDfX.js","/assets/concernCategories-fbb-DUDx.js","/assets/copy-BA1vDc8U.js","/assets/corner-down-right-DalCZZ_6.js","/assets/createLucideIcon-Bxq1tbDj.js","/assets/es-DjNNAcZy.js","/assets/exportXlsx-BfjbWDJ5.js","/assets/external-link-C8_GVfYe.js","/assets/file-clock-Db4fHfRM.js","/assets/file-exclamation-point-BGiong8-.js","/assets/file-spreadsheet-CSTvdwrS.js","/assets/file-text-Ekrrhp1B.js","/assets/flag-BF7i5JTT.js","/assets/flame-_4VQBJoo.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BuNfbo00.js","/assets/hash-DXRUybUq.js","/assets/history-BQr1tUxa.js","/assets/hourglass-DkTAKDJf.js","/assets/image-DAszw55R.js","/assets/image-off-Ou5yU8tX.js","/assets/index-ClcfsWXQ.css","/assets/index-D0tzIMrb.js","/assets/key-round-ClWu_5kt.js","/assets/keyboard-CO965PM1.js","/assets/languages-Bd4CseP4.js","/assets/layers-B0RGCRVH.js","/assets/lightbulb-CysKhR9t.js","/assets/link-2-RQxj0yg0.js","/assets/link-2-off-C5pkW4LH.js","/assets/list-checks-BVLRmrnW.js","/assets/list-ordered-UbCwSa81.js","/assets/list-tree-Dm_Hc-pf.js","/assets/lock-open-DkcSiNuF.js","/assets/log-in-DacjuMJ2.js","/assets/maximize-2-DqQZr0QV.js","/assets/message-square-rzk76lHs.js","/assets/minimize-2-fCo8GmaC.js","/assets/package-check-DgehnwhI.js","/assets/paperclip-CQQBmQVa.js","/assets/pencil-Bfuy_0u3.js","/assets/percent-DL-rvjGm.js","/assets/personName-CogOuS3K.js","/assets/pin-DGZb-3QV.js","/assets/pin-off-Cp9IvGa8.js","/assets/play-E5cnTxuY.js","/assets/presentation-Bh-a4UHT.js","/assets/prop-types-DSjP1Ojn.js","/assets/radio-CDaGu0Wt.js","/assets/react-apexcharts.esm-jjr9zqFi.js","/assets/repeat-Df_kbbWG.js","/assets/rotate-ccw-Bwq3r0LB.js","/assets/rotate-cw-C8AJ4ogy.js","/assets/save-CaoW_2-U.js","/assets/scale-rGhABoGR.js","/assets/scroll-text-DqiwN7yw.js","/assets/search-x-C-eQE2-M.js","/assets/segments-DAfL2rSL.js","/assets/send-BIa1xLCX.js","/assets/settings-2-Dc3SD6Lg.js","/assets/shield-CwiEJcmR.js","/assets/shield-alert-InH3natJ.js","/assets/shield-check-CGKgX59b.js","/assets/shield-question-mark-XXe3Yg2N.js","/assets/siren-CUKKxijv.js","/assets/snowflake-CQZaurr2.js","/assets/square-Duoo0yaR.js","/assets/square-check-big-BAgSlbpg.js","/assets/star-C4nbOkcc.js","/assets/statusBands-C-StZoxK.js","/assets/store-Clnl6fX-.js","/assets/table-2-8jX_rGnQ.js","/assets/table-properties-Bh7v7RdJ.js","/assets/tag-DiTHmq2S.js","/assets/timer-off-C4ukT9oS.js","/assets/trending-down-D4RtSb9n.js","/assets/trending-up-AS454F3j.js","/assets/undo-2-ddfRUkrS.js","/assets/useChartTheme-y-EwPfsk.js","/assets/useElementWidth-BWPGBovj.js","/assets/useIsMobile-Cwm6en2p.js","/assets/useMutation-DXeibjW9.js","/assets/useStatusBands-Czpe0m6-.js","/assets/user-C26lWIPO.js","/assets/user-cog-WYFhXaKc.js","/assets/user-minus-DFBC8-St.js","/assets/users-VTbqDJcL.js","/assets/video-CESv4gQJ.js","/assets/wallet-D0RJq_Q-.js","/assets/warehouse-CJloMO3q.js","/assets/zap-BkKZpVow.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
