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

const BUILD = "2026-11-01T11:56:59.489Z";
const PRECACHE = ["/","/assets/AdminPanel-CwMbNG0k.js","/assets/AnalysisBoard-BGwn3Zwj.js","/assets/Arc-BMAcZTcZ.js","/assets/Assessment-Bw2tfj89.js","/assets/AssessmentGrade-BRCgQPy_.js","/assets/AssessmentList-OvZ1WGwo.js","/assets/Assistant-DL6296H6.js","/assets/BrigadirProfile-BrViJqnf.js","/assets/BroadcastReceivers-BzEKyG9P.js","/assets/BroadcastRecord-DY_7IIw_.js","/assets/Button-fDu7WTBG.js","/assets/CatLockNotice-17LM8DDP.js","/assets/CategoryLegendModal-Dl6zmqnq.js","/assets/CellConcerns-B2RP0AhZ.js","/assets/CellDetails-CJIaCBTb.js","/assets/CellFormModal-DMfUT2qr.js","/assets/CellIdent-CMtVN8yu.js","/assets/CellLink-22w4V7gH.js","/assets/Cells-B2KQ3EdW.js","/assets/ColumnFilter-BvCAtcZg.js","/assets/ColumnsPicker-BuV4WdS0.js","/assets/CommentsModal-DDqsdk03.js","/assets/ComparisonTable-DOgWGAJ0.js","/assets/Concerns-DZ8ASTsk.js","/assets/ConcernsPieces-BQTEfKxR.js","/assets/CountStepper-D7u7snR0.js","/assets/Daily-Dtwy7Cx8.js","/assets/DataTable-Cx2qR4wm.js","/assets/DateRangePicker-DXgBjlyz.js","/assets/DayReportView-wWv_SwcJ.js","/assets/DayStepper-CNhMO-vu.js","/assets/DayStrip-DRfW8aNg.js","/assets/DifferenceBreakdown-CoRrFfzE.js","/assets/Downtime-BfQSFhzD.js","/assets/Education-BKKxGSk9.js","/assets/EducationLesson-C4Lcxk__.js","/assets/EmptyState-BqTqp3DD.js","/assets/Exam-CzuMbR7B.js","/assets/FactorySelect-BIZHrAnT.js","/assets/Gamification-CUsRGG-Q.js","/assets/HeatmapChart-N8aRcAIl.js","/assets/IdleCell-BH13rKN6.js","/assets/KPICard-BxDWHkjG.js","/assets/Kaizen-CNybySNd.js","/assets/Kelish-KbFic-6r.js","/assets/KpiDeltaCard-BUPAKxAB.js","/assets/LangTextInput-BGMghK5r.js","/assets/Layout-H-kC_uNT.js","/assets/LeaderAppeal-BLp76SgG.js","/assets/LeaderDayReport-C1Zigsns.js","/assets/LeaderUnitReport-Ce1aV1NZ.js","/assets/Leaderboard-sm92JCRQ.js","/assets/Leaders-CVETy32y.js","/assets/LeadersKpi-g0I7yZrB.js","/assets/Lightbox-DtE-C1ZX.js","/assets/LiveOverview-BRgYpUaS.js","/assets/Login-CF3_46T0.js","/assets/NotFound-BuKEIthq.js","/assets/Notifications-cCTybO8V.js","/assets/Ontime-B8YCTRMS.js","/assets/Overview-CkBVBtuM.js","/assets/Pagination-DsiyvqhF.js","/assets/People-BrwkNAOK.js","/assets/PerenaladkaFactTable-Unkv-qSe.js","/assets/PersonCard-G5Lk_Hif.js","/assets/PlanFulfillment-AGjyUDmJ.js","/assets/Production-xPiirzSE.js","/assets/Profile-B4iuEX7Z.js","/assets/ProofCamera-Bo2m06rS.js","/assets/ProofPhoto-D1FwmOqr.js","/assets/Quality-DN5QXF2i.js","/assets/RawRows-D2Jr75_G.js","/assets/Reports-BEUmwc60.js","/assets/RequestStateChip-CSUXUJ1k.js","/assets/RichTextEditor-__TCDbNE.js","/assets/SaveState-CtLhEM8F.js","/assets/SearchInput-CN71Gi32.js","/assets/SeasonalityHeatmap-C16DURJ_.js","/assets/SegmentedToggle-CCakquLm.js","/assets/SetupTimes-CxV6GQdt.js","/assets/ShiftDaily-C-t_Rwiw.js","/assets/Staff-CKwKkATB.js","/assets/StaffListAtCheck-DJAZpBcr.js","/assets/StatusBadge-1C_kutRe.js","/assets/StatusBandsModal-DLN684xY.js","/assets/TargetGoal-BVLwrew3.js","/assets/Targets-DDDzg8ZQ.js","/assets/Tasks-ZYKoOej5.js","/assets/TimeWheelPicker-nFbcgzQ-.js","/assets/Toast-CqifsWCk.js","/assets/Tooltip-BKkR5TlD.js","/assets/TrelloAnalytics-DHBQUY9U.js","/assets/TrendChart-BRIH4UEx.js","/assets/TripleSpeedometer-Cn0s4w1B.js","/assets/Trudoyomkost-B3do7USS.js","/assets/UploadDropzone-Cz8S_Aje.js","/assets/UsersActivity-eYAEVkvk.js","/assets/VerdictBlock-DtEHSXtp.js","/assets/VfxApiMap-BwxqxZNK.js","/assets/VfxDictionaries-BugSJlZL.js","/assets/VfxEmployees-CGWFoSID.js","/assets/VfxHrMoves-Di6lqfkI.js","/assets/VfxJobs-CXhrEvWZ.js","/assets/VfxPhoto-CIjSnZaB.js","/assets/VfxShifts-C_srYEUC.js","/assets/VfxState-C2qCtsyL.js","/assets/VfxTimebooks--PimHKlQ.js","/assets/VfxTimesheet-DHDAfRl_.js","/assets/WatchProgress-DJcblg4-.js","/assets/WebLogin-Dh5gn33L.js","/assets/Workers-CBAoXJyv.js","/assets/Zagruzka-w7IWlAJ_.js","/assets/ZagruzkaCell-BCeIfZ9g.js","/assets/api-BFm7MSgf.js","/assets/archive-CItEJGBa.js","/assets/archive-restore-DA5bpSbv.js","/assets/arrow-down-q9rwXSgD.js","/assets/arrow-down-right-D536ITlD.js","/assets/arrow-down-wide-narrow-BIg_wfDu.js","/assets/arrow-up-narrow-wide-Bfl3rIiF.js","/assets/ban-Dl1JKLzg.js","/assets/book-check-Bo4H0ESe.js","/assets/boxes-C3qYO_xg.js","/assets/braces-DQ4_iN0N.js","/assets/brigadirFilters-BkLjiUfx.js","/assets/broadcastTree-QpQ6_58Z.js","/assets/calendar-days-DAHDcdA8.js","/assets/calendar-rA-m7phW.js","/assets/camera-DIZrqqPH.js","/assets/categories-CPnw0s3c.js","/assets/cellMoveRefusal-wgehdH2c.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CX8sRJFW.js","/assets/chart-line-ChTzPh5W.js","/assets/chart-pie-BUEsnzYo.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-hIBVm14M.js","/assets/chevron-left-Big4I3am.js","/assets/chevrons-up-down-D3py-tn_.js","/assets/circle-DG1Fkkbq.js","/assets/circle-alert-eVTdwW_q.js","/assets/circle-check-big-C32ZNgEB.js","/assets/circle-dashed-Db2BT2hJ.js","/assets/circle-minus-BHUQN3-U.js","/assets/circle-question-mark-Dp7-Tvjg.js","/assets/circle-user-round-Dz-nRlrW.js","/assets/cloud-off-DwLDzvN9.js","/assets/cloud-upload-5gZThAhz.js","/assets/coins-BEwqwjNG.js","/assets/compass-Cn0OZ7lN.js","/assets/concernCategories-XnwIvUwg.js","/assets/corner-down-right-MLaJjk3e.js","/assets/createLucideIcon-BZjQjip-.js","/assets/en-DZnTLtGz.js","/assets/es-Dtgc5NM1.js","/assets/external-link-Czvr-qKk.js","/assets/file-exclamation-point-Bf7vJ4TM.js","/assets/flag-DTsiRSPT.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DX7FWQCb.js","/assets/funnel-DKYu6xvm.js","/assets/hard-hat-B4e5reQz.js","/assets/hash-BM2D33A3.js","/assets/hourglass-BFYsQ3QZ.js","/assets/idleTime-CHPnJRpw.js","/assets/image-DD5SQNRn.js","/assets/image-off-DSXJpKJ3.js","/assets/inbox-BekXXcan.js","/assets/index-8WaGHF1r.js","/assets/index-D0hfKYZL.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DQdiI6c8.js","/assets/layers-D0aaL74e.js","/assets/leaderBoard-627CQx4x.js","/assets/lightbulb-DoDKEnCZ.js","/assets/link-2-D88yL8WD.js","/assets/link-2-off-DcUaqUe3.js","/assets/list-ordered-F9AsVAgW.js","/assets/list-tree-BYCeU_K_.js","/assets/lock-open-BPZqcMbP.js","/assets/log-in-BCmATd61.js","/assets/map-pin-CP8Hzkn7.js","/assets/marks-B3Q-1pn-.js","/assets/message-square-text-BcaNAQWy.js","/assets/minimize-2-BfX4q2Hd.js","/assets/package-3Xt7jLGK.js","/assets/package-check-6DxCWa8o.js","/assets/pencil-Cet-C2Qu.js","/assets/percent-Fy0mn7F_.js","/assets/pin-DFKrwuzH.js","/assets/pin-off-DAmEaWnE.js","/assets/play-BCG1kJZl.js","/assets/plug-zap-bTuAxfq1.js","/assets/prop-types-RD3fbola.js","/assets/radio-DY4NPahz.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-YPVpQgZ3.js","/assets/repeat-COxDQb7z.js","/assets/ru-B6oWwPj2.js","/assets/save-Bs1yHci0.js","/assets/scopeLinks-OpQbRk36.js","/assets/search-x-CrZjHXnI.js","/assets/segments-D5Uiedtv.js","/assets/send-BGia6JDS.js","/assets/shield-B1yuc9w3.js","/assets/shield-alert-Ch7-BgNy.js","/assets/sigma-Cs97stqJ.js","/assets/siren-Cp7wR4iB.js","/assets/snowflake-_QpfgH1H.js","/assets/split-D_jlgpUJ.js","/assets/square-check-big-CdfvDKiO.js","/assets/star-BcnUjfUU.js","/assets/statusBands-DVBZcBq3.js","/assets/store-CAZZe7H_.js","/assets/table-2-DZBLgtNX.js","/assets/table-properties-QbOhDTwN.js","/assets/tag-DouggU6k.js","/assets/timer-off-DgT4kP2f.js","/assets/translations-C6LSEVli.js","/assets/trelloUtil-DLepWYHv.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-kw-9WoiJ.js","/assets/trending-up-B-ONnJ-s.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-CSAUlsq_.js","/assets/useChartTheme-BsQkYeDp.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-DLr3TE1j.js","/assets/useStatusBands-pb0zt679.js","/assets/useUrlScope-BcRpxTWL.js","/assets/user-Cis9jC43.js","/assets/user-cog-BVsXrxZd.js","/assets/uz-B1lHxImF.js","/assets/uz_cyrl-Dkzv6M_0.js","/assets/vfx-DmYl6GCo.js","/assets/video-BiGHUQM6.js","/assets/wallet-gIw_l9yA.js","/assets/warehouse-DB4l2kU2.js","/assets/workflow-CBCw7NNf.js","/assets/x-C_FP1NZM.js","/assets/zap-D5f9lwGW.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
