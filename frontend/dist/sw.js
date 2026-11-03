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

const BUILD = "2026-11-03T05:25:19.439Z";
const PRECACHE = ["/","/assets/AdminPanel-DdyjieBY.js","/assets/AnalysisBoard-PZAUKjjp.js","/assets/AppLauncher-BetM8wPd.js","/assets/Arc-BsVm-513.js","/assets/Assessment-Fgo6aSJD.js","/assets/AssessmentGrade-BlkC0i-s.js","/assets/AssessmentList-BV5XeO6d.js","/assets/Assistant-Ddj4zqK-.js","/assets/BrigadirProfile-swwZji9h.js","/assets/BrigadirsKpi-DHYDr4Z4.js","/assets/BroadcastReceivers-BrVJ7CHV.js","/assets/BroadcastRecord-C3W49T1T.js","/assets/Button-BmjMskxN.js","/assets/CatLockNotice-BfmqzpUq.js","/assets/CategoryLegendModal-DwZZzOKb.js","/assets/CellConcerns-CRhB_taC.js","/assets/CellDetails-DJK2us9D.js","/assets/CellFormModal-tNHrtLd3.js","/assets/CellIdent-DzWW-ckv.js","/assets/CellLink-DuFtSc0Z.js","/assets/Cells-BVZnAn8o.js","/assets/ColumnFilter-DxA6PPBs.js","/assets/ColumnsPicker-Ct-Xcydp.js","/assets/CommentsModal-ByjzO7yc.js","/assets/ComparisonTable-IJNNw5a0.js","/assets/Concerns-JQUKPvRr.js","/assets/ConcernsPieces-CTzcLar1.js","/assets/CountStepper-ZEh71hcj.js","/assets/Daily-htxAc_po.js","/assets/DataTable-BjsMrt7y.js","/assets/DateRangePicker-or4j_9Lg.js","/assets/DayReportView-DZvj5fIo.js","/assets/DayStepper-DKyT13eL.js","/assets/DayStrip-C-mAZoDF.js","/assets/DifferenceBreakdown-BmgW0aX3.js","/assets/Downtime-BxBEhgBN.js","/assets/Education-B7fPm4EP.js","/assets/EducationLesson-XLoof3Hq.js","/assets/EmptyState-r_yVyOeH.js","/assets/Exam-DDcownQ9.js","/assets/FactorySelect-BS2z2J34.js","/assets/Gamification-BSItg3zz.js","/assets/HeatmapChart-n6ZNUwiv.js","/assets/IdleCell-uRafvcjI.js","/assets/KPICard-DMCLHeqZ.js","/assets/Kaizen-IJ6pmP0X.js","/assets/Kelish-C08GjQTd.js","/assets/KpiBits-BqlsKnPO.js","/assets/KpiDeltaCard-x4TK0vYp.js","/assets/LangTextInput-BWbg0IDT.js","/assets/Layout-GwyGp3Ut.js","/assets/LeaderAppeal-SMp3h6-7.js","/assets/LeaderDayReport-8TtjnvRJ.js","/assets/LeaderUnitReport-kzbb91Zj.js","/assets/Leaderboard-DJGZOnak.js","/assets/Leaders-CColgWkL.js","/assets/LeadersKpi-Ci_gWgir.js","/assets/Lightbox-BdZVIX0R.js","/assets/LiveOverview-BZTwk9Ud.js","/assets/Login-Dz0ftho4.js","/assets/NotFound-wAMb7u-B.js","/assets/Notifications-BhQPyv5s.js","/assets/NotionTasks-B7Jms_0S.js","/assets/Ontime-BU9ShdmT.js","/assets/Overview-BSWMBRyS.js","/assets/Pagination-BjJwxQfr.js","/assets/People-bwc28f85.js","/assets/PerenaladkaFactTable-DRjp8yhW.js","/assets/PersonCard-Bf-KqXNj.js","/assets/PlanFulfillment-B0XSLuKS.js","/assets/Production-AHiKl-59.js","/assets/Profile-BrJB_aLj.js","/assets/ProofCamera-Dvj_3yrM.js","/assets/ProofPhoto-BrGwjYMv.js","/assets/Quality-DjGM-z3Z.js","/assets/RawRows-CcL63lKZ.js","/assets/Reports-cxhtfxQh.js","/assets/RequestStateChip-Bj9c4kQX.js","/assets/RichTextEditor-DxHCsw2o.js","/assets/SaveState-BwHYh-3V.js","/assets/SearchInput-CTEeBpOb.js","/assets/SeasonalityHeatmap-ClDIKtSu.js","/assets/SegmentedToggle-TfNlSrYH.js","/assets/SetupTimes-DrrtCZQ0.js","/assets/ShiftDaily-h4YXTixZ.js","/assets/Staff-B4ArrgpA.js","/assets/StaffListAtCheck-rDaEMi4a.js","/assets/StatusBadge-C_cvnO66.js","/assets/StatusBandsModal-DZDbEfAm.js","/assets/TargetGoal-DEobEqbt.js","/assets/Targets-CZKwCHez.js","/assets/Tasks-D0o7FST-.js","/assets/TimeWheelPicker-pm5J2X-y.js","/assets/Toast-Bq1amAbq.js","/assets/Tooltip-CyKhCewg.js","/assets/TrelloAnalytics-DfLWgVKo.js","/assets/TrendChart-5wnh_6V0.js","/assets/TripleSpeedometer-DTIee9r4.js","/assets/Trudoyomkost-CAGay0lC.js","/assets/UploadDropzone-CN44rf9r.js","/assets/UsersActivity-CoiYMRLc.js","/assets/VerdictBlock-DDFhJ13K.js","/assets/VfxApiMap-BzuAsUxG.js","/assets/VfxDictionaries-Bdt7R1rh.js","/assets/VfxEmployees-Cf7xRkZt.js","/assets/VfxHrMoves-5OtM1EYY.js","/assets/VfxJobs-Dqmf-48s.js","/assets/VfxPhoto-K4nppYUM.js","/assets/VfxShifts-DRPsUWBU.js","/assets/VfxState-D9n9SOw4.js","/assets/VfxTimebooks-CbJ3qM_T.js","/assets/VfxTimesheet-DbIphrCj.js","/assets/WatchProgress-BQDtjhur.js","/assets/WebLogin-BETGd8b1.js","/assets/Workers-B6SXDLSA.js","/assets/Zagruzka-Dw-EJV2D.js","/assets/ZagruzkaCell-Dst1N9k6.js","/assets/api-BFm7MSgf.js","/assets/archive-JWCcA2JC.js","/assets/archive-restore-1GLr9jNv.js","/assets/arrow-down-Br7x8rvl.js","/assets/arrow-down-right-nhBMwifj.js","/assets/arrow-down-wide-narrow-BbmqoBGc.js","/assets/arrow-up-narrow-wide-Cgk_Tg-Q.js","/assets/ban-CHb3uz4d.js","/assets/book-check-BFQrUPlT.js","/assets/boxes-BT4lorGv.js","/assets/braces-CRa_1ig-.js","/assets/brigadirFilters-DnIdg0hm.js","/assets/broadcastTree-DEVH4_z5.js","/assets/calendar-BRWPQWyP.js","/assets/calendar-days-WxN3qAxd.js","/assets/calendar-x-2-DuxkFNNW.js","/assets/camera-B9OB1F-v.js","/assets/categories-DFU93ltW.js","/assets/cellMoveRefusal-pArfoBfL.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DjwgJgEU.js","/assets/chart-line-BG-eI2w7.js","/assets/chart-pie-CXfjB6fo.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-D70F_Z-y.js","/assets/chevron-left-DcFWMAK5.js","/assets/chevrons-up-down-Dsz_9524.js","/assets/circle-BF73wjdr.js","/assets/circle-alert-DZptEWMc.js","/assets/circle-check-big-CRNs70aF.js","/assets/circle-dashed-TWimO9ML.js","/assets/circle-minus-BOhAkcWv.js","/assets/circle-question-mark-MrZ5YJFW.js","/assets/circle-user-round-BFy8a7oL.js","/assets/cloud-off-DTzp2dsn.js","/assets/cloud-upload-0hTxEC5B.js","/assets/coins-Bc-LYJdJ.js","/assets/compass-DmDYsJh9.js","/assets/concernCategories-CBLEZKT4.js","/assets/corner-down-right-yMDmzPcP.js","/assets/createLucideIcon-BGK-yRYU.js","/assets/en-CQ3yFwvz.js","/assets/es-Dtgc5NM1.js","/assets/external-link-BeCh_4C6.js","/assets/file-exclamation-point-BuSX5ILL.js","/assets/flag-BgMy3qJ3.js","/assets/folder-tree-BQlC4PNU.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Dkb8B7Li.js","/assets/funnel-CdTIwYjO.js","/assets/grip-vertical-CdMbKjgB.js","/assets/hard-hat-DcjaGT-n.js","/assets/hash-C4T2N--V.js","/assets/hourglass-Clr0XnQr.js","/assets/idleTime-CHPnJRpw.js","/assets/image-BzEownd0.js","/assets/image-off-F6JnFEAG.js","/assets/inbox-D060POvh.js","/assets/index-DZQnx8ws.js","/assets/index-DioLieMN.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DvBRA8Y1.js","/assets/layers-CdjHOUv6.js","/assets/leaderBoard-zGl4C3Xi.js","/assets/lightbulb-uee0sGlK.js","/assets/link-2-BtRIdaKX.js","/assets/link-2-off-Dta6EUf4.js","/assets/list-ordered-DWv8hdUF.js","/assets/list-tree-DD5DKJzy.js","/assets/lock-open-Br4So58r.js","/assets/log-in-Cj2iksxe.js","/assets/map-pin-Cccitcmf.js","/assets/marks-CpagwRRr.js","/assets/message-square-text-qyuB_OAt.js","/assets/minimize-2-BlPjL9Or.js","/assets/notionUtil-D7iOuS9H.js","/assets/package-BGDZkvIU.js","/assets/package-check-DOQcWc5p.js","/assets/pencil-C7f4Ud05.js","/assets/percent-TFdR-kct.js","/assets/pin-Cwvr4lCV.js","/assets/pin-off-BaPZQGq8.js","/assets/play-DobM0hU8.js","/assets/plug-zap-D6I47YQp.js","/assets/prop-types-RD3fbola.js","/assets/radio-Ci8WVmx0.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-Yj6EkYbY.js","/assets/repeat-CpgMayNb.js","/assets/ru-DrDKELn7.js","/assets/save-BjNCl0wi.js","/assets/scopeLinks-CA9UN2eo.js","/assets/search-x-Bk-GpGhp.js","/assets/segments-D5Uiedtv.js","/assets/send-n7yi53gR.js","/assets/shield-DYZHbefB.js","/assets/shield-alert-DsV_Be11.js","/assets/sigma-tmscPN1t.js","/assets/siren-swKWXLAZ.js","/assets/snowflake-D3AoH0ed.js","/assets/split-AZIDHVXv.js","/assets/square-check-big-MSusOPIU.js","/assets/star-7xoA518F.js","/assets/statusBands-DVBZcBq3.js","/assets/store-DbH4SvhS.js","/assets/sunrise-brHFMjG_.js","/assets/table-2-6Mj3t2j8.js","/assets/table-properties-DQv7ZEO1.js","/assets/tag-Cwxbt-pN.js","/assets/timer-off-DRMfTloq.js","/assets/translations-DuV5Lj9B.js","/assets/trelloUtil-BhpKC0-g.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-CvS3DVVC.js","/assets/trending-up-Rhvwdt9c.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-D79T7oC4.js","/assets/useChartTheme-B3w6gJO4.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-BYSUegH3.js","/assets/useStatusBands-DBiBpK-f.js","/assets/useUrlScope-DQRG4fbv.js","/assets/user-cog-bEhwQepI.js","/assets/user-h1oYsVNH.js","/assets/uz-Cy9_BvNV.js","/assets/uz_cyrl-F3L3XRUK.js","/assets/vfx-DrXihsdG.js","/assets/video-BNim8rg3.js","/assets/wallet-fzqss3m3.js","/assets/warehouse-dR78DkO7.js","/assets/workflow-LbQGOsG_.js","/assets/x-CBBmcrHx.js","/assets/zap-BHzJNfcI.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
