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

const BUILD = "2026-11-02T13:36:35.116Z";
const PRECACHE = ["/","/assets/AdminPanel-CXHx1NIi.js","/assets/AnalysisBoard-B2gQm-Ty.js","/assets/AppLauncher-BmHa8QIb.js","/assets/Arc-BZBIw5Cg.js","/assets/Assessment-BH5_rKLC.js","/assets/AssessmentGrade-Ddha2Q38.js","/assets/AssessmentList-DWLUyrjf.js","/assets/Assistant-PUztGULK.js","/assets/BrigadirProfile-CLu6BGGi.js","/assets/BrigadirsKpi-CZpkaP9i.js","/assets/BroadcastReceivers-BtMruXVJ.js","/assets/BroadcastRecord-CvCHkf5P.js","/assets/Button-BjbhFmRh.js","/assets/CatLockNotice-CIweByA0.js","/assets/CategoryLegendModal-BxeIsNMZ.js","/assets/CellConcerns-BGzeDAR6.js","/assets/CellDetails-B4Mi7KaE.js","/assets/CellFormModal-Dw4NUcMe.js","/assets/CellIdent-OZFpMnw8.js","/assets/CellLink-Ba2trixk.js","/assets/Cells-BH1AVzsq.js","/assets/ColumnFilter-B-fvWDVL.js","/assets/ColumnsPicker-C5MR2i-s.js","/assets/CommentsModal-BY7dHG_-.js","/assets/ComparisonTable-CrV04zCF.js","/assets/Concerns-CdWdXXzz.js","/assets/ConcernsPieces-DK-hGM9a.js","/assets/CountStepper-c4n_nIAg.js","/assets/Daily-Ch_dGx9O.js","/assets/DataTable-ealtCdFq.js","/assets/DateRangePicker-DP5MBJHH.js","/assets/DayReportView-BPVHGuCN.js","/assets/DayStepper-IaUVwKr9.js","/assets/DayStrip-Fmwfv0ni.js","/assets/DifferenceBreakdown-CD3cj_GP.js","/assets/Downtime-CbBGLVeb.js","/assets/Education-KxJB0k42.js","/assets/EducationLesson-BwkkEkPD.js","/assets/EmptyState-DrRjQemB.js","/assets/Exam-CXKdB6er.js","/assets/FactorySelect-D4cjTiOI.js","/assets/Gamification-DX51NNN0.js","/assets/HeatmapChart-CHVKNSVu.js","/assets/IdleCell-YAGE-aL4.js","/assets/KPICard-B-v9MpdE.js","/assets/Kaizen-DWP4b4Xe.js","/assets/Kelish-B13dBqog.js","/assets/KpiBits-DhA4fJDf.js","/assets/KpiDeltaCard-DJJUDZjN.js","/assets/LangTextInput-DQQ7R-dF.js","/assets/Layout-lQZrMcP7.js","/assets/LeaderAppeal-BBYosAjh.js","/assets/LeaderDayReport-DGoNRFH2.js","/assets/LeaderUnitReport-BIGjURtg.js","/assets/Leaderboard-YB54iL-5.js","/assets/Leaders-DwKziH4j.js","/assets/LeadersKpi-Dh5Y21zm.js","/assets/Lightbox-CLQ63MbS.js","/assets/LiveOverview-D_A66d9l.js","/assets/Login-D4OlUSAV.js","/assets/NotFound-BNyEWMNo.js","/assets/Notifications-yC3ZnEMy.js","/assets/NotionTasks-Bt75pa1J.js","/assets/Ontime-DHhpXO6z.js","/assets/Overview-BneyvIsl.js","/assets/Pagination-DLb35VX2.js","/assets/People-Cgw74ime.js","/assets/PerenaladkaFactTable-U4CYjihX.js","/assets/PersonCard-UmKC9QkD.js","/assets/PlanFulfillment-BG79xMJJ.js","/assets/Production-B0ekL07W.js","/assets/Profile-BcyyspCr.js","/assets/ProofCamera-B8pGTaOw.js","/assets/ProofPhoto-FBT-E6C4.js","/assets/Quality-Cxx9qlPJ.js","/assets/RawRows-DKzrmCMM.js","/assets/Reports-DjOEKO7D.js","/assets/RequestStateChip-CctbzPgp.js","/assets/RichTextEditor-DpusB1SQ.js","/assets/SaveState-CwYD2DG3.js","/assets/SearchInput-BrzTDMTs.js","/assets/SeasonalityHeatmap-Wf-7-XZI.js","/assets/SegmentedToggle-JNtsXCcs.js","/assets/SetupTimes-S3KlHIx7.js","/assets/ShiftDaily-CsEXm5h-.js","/assets/Staff-BFgwq69z.js","/assets/StaffListAtCheck-CYtfooiX.js","/assets/StatusBadge-DSrUEDat.js","/assets/StatusBandsModal-BSkknV3O.js","/assets/TargetGoal-CY8Pe8x0.js","/assets/Targets-CrWUbuG7.js","/assets/Tasks-CDHmqnZp.js","/assets/TimeWheelPicker-n3QHpeT1.js","/assets/Toast-Dz2N0eXy.js","/assets/Tooltip-CwxY1zyk.js","/assets/TrelloAnalytics-By6kAGmZ.js","/assets/TrendChart-DR34wUx5.js","/assets/TripleSpeedometer-q_zZq8sL.js","/assets/Trudoyomkost-8JEOpvo4.js","/assets/UploadDropzone-Dropiw_W.js","/assets/UsersActivity-BMFblxyN.js","/assets/VerdictBlock-Czif8w0z.js","/assets/VfxApiMap-BdqFxNOz.js","/assets/VfxDictionaries-DRFrSjD3.js","/assets/VfxEmployees-DcCWS5Tm.js","/assets/VfxHrMoves-DMpLACRM.js","/assets/VfxJobs-AlWZkWzz.js","/assets/VfxPhoto-BjEeogUy.js","/assets/VfxShifts-jgMYhS1j.js","/assets/VfxState-D3s71892.js","/assets/VfxTimebooks-Df5oMCyI.js","/assets/VfxTimesheet-3EW-_TzA.js","/assets/WatchProgress-CBSq-bk-.js","/assets/WebLogin-Cq72nzFg.js","/assets/Workers-DQaJAH9h.js","/assets/Zagruzka-CAh5jBlD.js","/assets/ZagruzkaCell-Cxo0_dlG.js","/assets/api-BFm7MSgf.js","/assets/archive-BG0j-1kw.js","/assets/archive-restore-ubrUuvKH.js","/assets/arrow-down-DhNRegrF.js","/assets/arrow-down-right-BIppF1dZ.js","/assets/arrow-down-wide-narrow-CRsAemRi.js","/assets/arrow-up-narrow-wide-B7t_99Dm.js","/assets/ban-B43nXg7k.js","/assets/book-check-BOJ7VjBV.js","/assets/boxes-BHftFJDm.js","/assets/braces-BTbkE0Rq.js","/assets/brigadirFilters-C2zD0tNO.js","/assets/broadcastTree-Ddc9ese6.js","/assets/calendar-DRhA7xiX.js","/assets/calendar-days-xqHeiZ88.js","/assets/calendar-x-2-BUaxIRTG.js","/assets/camera-C-tml6nL.js","/assets/categories-BQihEk6X.js","/assets/cellMoveRefusal-CzBtLdjx.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BNqdxkyf.js","/assets/chart-line-BJA_aTgo.js","/assets/chart-pie-B_e504ba.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-DqrtpLDU.js","/assets/chevron-left-CRYphT7m.js","/assets/chevrons-up-down-BKgqZqG4.js","/assets/circle--uYQZKtc.js","/assets/circle-alert-1jfpqcle.js","/assets/circle-check-big-DPhNKkyn.js","/assets/circle-dashed-mWEqXpoQ.js","/assets/circle-minus-Dq5JHHJy.js","/assets/circle-question-mark-CmaqbRkr.js","/assets/circle-user-round-C09_RS4R.js","/assets/cloud-off-CLG-FpXM.js","/assets/cloud-upload-DIq2J6k2.js","/assets/coins-C0q2oo-V.js","/assets/compass-4FJG3iF6.js","/assets/concernCategories-D-TSJgRZ.js","/assets/corner-down-right-B8kRXKx3.js","/assets/createLucideIcon-DKFk7wt_.js","/assets/en-CQ3yFwvz.js","/assets/es-Dtgc5NM1.js","/assets/external-link-Ck1EFxap.js","/assets/file-exclamation-point-CXqaMa8i.js","/assets/flag-CiVN7jor.js","/assets/folder-tree-CBNGtGOv.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-mldXvd_l.js","/assets/funnel-D2B2yfsr.js","/assets/grip-vertical-BDDtjE8A.js","/assets/hard-hat-CU2ayret.js","/assets/hash-C__THQam.js","/assets/hourglass-DuKSjZRS.js","/assets/idleTime-CHPnJRpw.js","/assets/image-off-ZPgB28dQ.js","/assets/image-rDJ-oEnu.js","/assets/inbox-CxkJGgRA.js","/assets/index-DZnWccZd.css","/assets/index-ij2U3h8A.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-Dhe6zuFs.js","/assets/layers-4Cb31VI1.js","/assets/leaderBoard-DgHqjZ6M.js","/assets/lightbulb-CgSyn1TP.js","/assets/link-2-Cs_0OQDU.js","/assets/link-2-off-C5u3oqsU.js","/assets/list-ordered-DJPdSZjg.js","/assets/list-tree-DuV2t5cH.js","/assets/lock-open-CiVsqHMJ.js","/assets/log-in-C1bkgGjZ.js","/assets/map-pin-4TUeziYa.js","/assets/marks-CCB1Jow2.js","/assets/message-square-text-pbDUlzsN.js","/assets/minimize-2-Cdq3uDL4.js","/assets/notionUtil-ClYRpmAG.js","/assets/package-B-qsyPV8.js","/assets/package-check-D_TYpqDQ.js","/assets/pencil-CpLePROn.js","/assets/percent-CvucKBVh.js","/assets/pin-JcHJMqnO.js","/assets/pin-off-B10tsbqn.js","/assets/play-12454waD.js","/assets/plug-zap-jTYsOtjc.js","/assets/prop-types-RD3fbola.js","/assets/radio-BOFJFK2e.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-wXOulFZC.js","/assets/repeat-BYOOPcBe.js","/assets/ru-DrDKELn7.js","/assets/save-6LKb7Uv4.js","/assets/scopeLinks-DHYHqSS7.js","/assets/search-x-AldINbp0.js","/assets/segments-D5Uiedtv.js","/assets/send-TYVEDtAI.js","/assets/shield-CHu22NY4.js","/assets/shield-alert-BNKN_L36.js","/assets/sigma-B6YwbA6z.js","/assets/siren-Cxmsdk3a.js","/assets/snowflake-KTB4DKYr.js","/assets/split-VBWcfORV.js","/assets/square-check-big-CXKaTmdF.js","/assets/star-CtpPleL3.js","/assets/statusBands-DVBZcBq3.js","/assets/store-DdL9u6CI.js","/assets/sunrise-BquQqccT.js","/assets/table-2-LEd50w0f.js","/assets/table-properties-DeTPuV7A.js","/assets/tag-BhIIruZa.js","/assets/timer-off-CZmIGIhK.js","/assets/translations-DuV5Lj9B.js","/assets/trelloUtil-B8BLdhbG.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-C0DNEye_.js","/assets/trending-up-DttV2_rO.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-BeAUosDe.js","/assets/useChartTheme-Bxuu4wPY.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-DouRJQtC.js","/assets/useStatusBands-OZw08Nbe.js","/assets/useUrlScope-WRPhmx1u.js","/assets/user-DkhsSnlL.js","/assets/user-cog-kRO0PlWa.js","/assets/uz-Cy9_BvNV.js","/assets/uz_cyrl-F3L3XRUK.js","/assets/vfx-BvsbeaoZ.js","/assets/video-CFyHgQwu.js","/assets/wallet-v_EPzDII.js","/assets/warehouse-jSAd6lGo.js","/assets/workflow-BtKHEQcP.js","/assets/x-DLD9o_CV.js","/assets/zap-0RrcDM9w.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
