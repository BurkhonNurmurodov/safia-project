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

const BUILD = "2026-09-28T15:19:38.668Z";
const PRECACHE = ["/","/assets/AdminPanel-G6ZCZ-fZ.js","/assets/AnalysisBoard-B9_bM54I.js","/assets/Arc-YvljYcmR.js","/assets/ArcLegacy-BaxI2a5s.js","/assets/AttendanceModal-BalC_55r.js","/assets/BrigadirProfile-CEdAh7pO.js","/assets/BroadcastReceivers-CysJ5bru.js","/assets/BroadcastRecord-q2f_Wez5.js","/assets/CatLockNotice-7pZrr9Ll.js","/assets/CategoryLegendModal-BqnUxZhg.js","/assets/CellConcerns-CDpW2t2d.js","/assets/CellDetails-CzTllZt1.js","/assets/CellFormModal-C1aEH1DV.js","/assets/CellLink-fb-XTf9_.js","/assets/Cells-DJvdL8pE.js","/assets/ColumnFilter-BNPH1tcv.js","/assets/ColumnsPicker-BsZlIX3A.js","/assets/CommentsModal-3JP6_pDp.js","/assets/ComparisonTable-C3EbfCQ1.js","/assets/Concerns-CpA3ocZn.js","/assets/ConfirmDialog-Ql_MpocU.js","/assets/Daily-B8NdXabK.js","/assets/DataTable-r-RdE4jh.js","/assets/DateRangePicker-3FZeqaKZ.js","/assets/DayReportView-79s738W7.js","/assets/DayStepper-CrkwF2od.js","/assets/DifferenceBreakdown-CT30IRby.js","/assets/Downtime-DWO7YWT9.js","/assets/Education-D3RHQnKX.js","/assets/EducationLesson-ooWnYCBk.js","/assets/EmptyState-Dm8GrJeA.js","/assets/Exam-tniXJ_Cb.js","/assets/FactorySelect-DKyVJPdd.js","/assets/Gamification-DfHRtxQP.js","/assets/GroupBadge-C5kV2-Ha.js","/assets/HeatmapChart-ByMZ53HX.js","/assets/IdleCell-BMlZDv3w.js","/assets/KPICard-IJf3Cl0-.js","/assets/Kaizen-C_8NBsjN.js","/assets/Kelish-DWBCwSf_.js","/assets/KpiDeltaCard-CMS8VADS.js","/assets/LangTextInput-4m-ELD75.js","/assets/Layout-tM9VRrst.js","/assets/LeaderAppeal-B1_Fb4st.js","/assets/LeaderDayReport-DU__UiV1.js","/assets/LeaderUnitReport-CqpU5XuQ.js","/assets/Leaderboard-DKhuLLZ4.js","/assets/Leaders-BlsMKCOj.js","/assets/Lightbox-CZXYbW-M.js","/assets/LiveOverview-BvbVaH6e.js","/assets/Login-DqdFcImj.js","/assets/NotFound-BcJiNW2Y.js","/assets/Overview-BQ6UPhI3.js","/assets/Pagination-DdTxFj9w.js","/assets/PerenaladkaFactTable-MFPQym_w.js","/assets/PlanFulfillment-BZd9MvWk.js","/assets/Production-C-vdzBaE.js","/assets/Profile-ZTqotVlW.js","/assets/ProofCamera-B0kpCW7Z.js","/assets/ProofPhoto-avocDewq.js","/assets/Quality-BrXwN8lu.js","/assets/RequestStateChip-BkGH-BOh.js","/assets/RichTextEditor--EAsCWDU.js","/assets/SaveState-Dze-hJO4.js","/assets/SearchInput-4e4dqiy1.js","/assets/SeasonalityHeatmap-CzYMHJsB.js","/assets/SegmentedToggle-ChZyAo7l.js","/assets/SetupTimes-CU1lI-ZL.js","/assets/ShiftDaily-B_DiEDFS.js","/assets/Staff-C6k9U29q.js","/assets/StatusBadge-CKme3cSd.js","/assets/TargetGoal-CdDcZUEA.js","/assets/Targets-CWy5nDfz.js","/assets/Tasks-BJwza-yz.js","/assets/TimeWheelPicker-Ct_aIk0_.js","/assets/Tooltip-BGZyzTUK.js","/assets/TrendChart-OpGvUE9A.js","/assets/TripleSpeedometer-BuP2e9G7.js","/assets/Trudoyomkost-deHbwrb8.js","/assets/UploadDropzone-FY2BX5uT.js","/assets/UsersActivity-BNY_FB5B.js","/assets/VerdictBlock-DhrlRgDP.js","/assets/WatchProgress-CSkIZUBT.js","/assets/WebLogin-C2peNLcq.js","/assets/WorkerConcerns-CDwxgpbH.js","/assets/Workers-tf0cxzY8.js","/assets/Zagruzka-rCpBqToD.js","/assets/ZagruzkaCell-DxFAIKQa.js","/assets/api-jw3jeMG0.js","/assets/archive-D3lFPPOx.js","/assets/archive-restore-CI1034eX.js","/assets/arrow-down-BF0CkFst.js","/assets/arrow-left-C_jyLpWt.js","/assets/arrow-left-right-DCi11ulp.js","/assets/arrow-up-L-_Jy3MO.js","/assets/arrow-up-right-DWVA9sEy.js","/assets/award-BETRFheq.js","/assets/ban-Ck8fC4Pl.js","/assets/bot-BftZcLIZ.js","/assets/boxes-DGd4uN6t.js","/assets/brigadirFilters-BGhUypXJ.js","/assets/broadcastTree-N7X6wydu.js","/assets/building-2-_7Uqe8Fb.js","/assets/calendar-clock-DShA9fq4.js","/assets/calendar-days-C7g_75Sy.js","/assets/calendar-range-CtlKbfiJ.js","/assets/calendar-zj16XShU.js","/assets/camera-7AMYPVub.js","/assets/categories-BF6VWBsv.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BMc4epFI.js","/assets/chart-line-CjueZnWr.js","/assets/chart-pie-DYkgenOs.js","/assets/chartRange-DYaswbtb.js","/assets/chevron-left-CK9jkovY.js","/assets/chevrons-up-down-CZIzrmus.js","/assets/circle-KET7Laez.js","/assets/circle-check-big-DYlIk8Xy.js","/assets/circle-dot-B1ydAOV3.js","/assets/circle-minus-D30pH2N3.js","/assets/circle-slash-CriOdWis.js","/assets/circle-user-round-DfMamUFJ.js","/assets/cloud-off-C9ChPPsx.js","/assets/cloud-upload-Q1rsGqG5.js","/assets/compass-DLqO3m0N.js","/assets/concernCategories-C1Yt1DJM.js","/assets/copy-COPAsvkk.js","/assets/corner-down-right-cTTmU49o.js","/assets/createLucideIcon-Co_At648.js","/assets/es-Beh2OLOb.js","/assets/exportXlsx-Cw1y4zPq.js","/assets/external-link-BeZIcKxQ.js","/assets/file-clock-DqqJmsDv.js","/assets/file-exclamation-point-CvCbi3NA.js","/assets/file-spreadsheet-DhPeZ388.js","/assets/file-text-BNYtDAGn.js","/assets/flag-7juo79HN.js","/assets/flame-DadvvYdZ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DJfKqWQW.js","/assets/hash-Cce9kwQ4.js","/assets/history-C8L3QgEg.js","/assets/hourglass-Dgi2YU5n.js","/assets/image-DqptzhyL.js","/assets/image-off-MJ47u-vY.js","/assets/index-BE0m9vnF.css","/assets/index-CpRuXMiU.js","/assets/key-round-DnVRmY-T.js","/assets/keyboard-D7C7Zh_9.js","/assets/languages-BUI8ENpH.js","/assets/layers-M0s5n4yQ.js","/assets/lightbulb-CZLezheS.js","/assets/link-2-D1LGBBiJ.js","/assets/list-checks-JZmxFi1X.js","/assets/list-ordered-o070IiU-.js","/assets/list-tree-95IYmE-J.js","/assets/lock-open-CjmJbnJI.js","/assets/log-in-CxwvlJqQ.js","/assets/message-square-B4E0NAqP.js","/assets/minimize-2-Ctd_nfN9.js","/assets/package-check-45Tj1F9r.js","/assets/paperclip-DeQF5pcw.js","/assets/pencil-C-wXxpQi.js","/assets/percent-D1PU5C8W.js","/assets/personName-B4KId4zS.js","/assets/pin-VRpwfJyT.js","/assets/pin-off-7V8RdZHF.js","/assets/play-y4BS_L77.js","/assets/presentation-DJD2tj-F.js","/assets/prop-types-Bsy_QV5o.js","/assets/radio-410PoOD0.js","/assets/react-apexcharts.esm-DqBtOzff.js","/assets/repeat-B1m2vg3f.js","/assets/rotate-ccw-BE9FQu6M.js","/assets/rotate-cw-rj4u-Gn8.js","/assets/save-2cqUfrgB.js","/assets/scale-4meGhPfL.js","/assets/scroll-text-B79JIxrV.js","/assets/search-x-5bWdjfbm.js","/assets/segments-B7pi_kYD.js","/assets/send-iwSR8dO5.js","/assets/settings-2-Ca7HE1l_.js","/assets/shield-D9dahCtk.js","/assets/shield-alert-CRVYixDt.js","/assets/shield-check-Crf7_usf.js","/assets/shield-question-mark-B8Jmf_gX.js","/assets/siren-93T6rpYs.js","/assets/smartphone-DpJZxX_K.js","/assets/snowflake-cd6EWrDc.js","/assets/square-Cqst4YM3.js","/assets/square-check-big-D-7GhDUN.js","/assets/star-BBM1eQU9.js","/assets/statusBands-Okv-E4x3.js","/assets/store-CdZfQE4G.js","/assets/table-2-D-33T9Y6.js","/assets/tag-Bo5JDqLr.js","/assets/timer-off-CHh70yla.js","/assets/trending-down-Caua-3kH.js","/assets/trending-up-Drav9lB-.js","/assets/undo-2-DyVHs3Xf.js","/assets/useChartTheme-DGBulXun.js","/assets/useElementWidth-DAv7Ha6D.js","/assets/useIsMobile-DVGuvdSc.js","/assets/useMutation-aBcaBMTc.js","/assets/useStatusBands-DW-eDiCP.js","/assets/user-Brvq2Sqy.js","/assets/user-cog-jY08IRa7.js","/assets/user-minus-Cp83kE3j.js","/assets/users-BELizmM-.js","/assets/video-B6Spsu5L.js","/assets/wallet-CnB36X9w.js","/assets/warehouse-BPYRTz9z.js","/assets/zap-BlT08GbV.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
