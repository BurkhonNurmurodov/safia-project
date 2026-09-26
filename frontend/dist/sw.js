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

const BUILD = "2026-09-26T07:28:36.039Z";
const PRECACHE = ["/","/assets/AdminPanel-BjRFp4b9.js","/assets/AnalysisBoard-BtSOSuxA.js","/assets/Arc-B2XKI5ti.js","/assets/ArcLegacy-DJ0lzwyp.js","/assets/AttendanceModal-kPep_ydZ.js","/assets/BrigadirProfile-7SUNEEpw.js","/assets/BroadcastReceivers-lWDH2nyQ.js","/assets/BroadcastRecord-lTXCWTFy.js","/assets/CatLockNotice-0Y32_uHI.js","/assets/CategoryLegendModal-DwU1VHpG.js","/assets/CellConcerns-OiJfDlcy.js","/assets/CellDetails-DP_AqLiV.js","/assets/CellFormModal-BSPGiT56.js","/assets/CellLink-C2eqw8Gk.js","/assets/Cells-BaGixSRX.js","/assets/ColumnFilter-BfMIOJpJ.js","/assets/ColumnsPicker-CxOn-p_T.js","/assets/CommentsModal-BbjLYkyd.js","/assets/ComparisonTable-Cx8P1_nM.js","/assets/Concerns-CfcL2DE1.js","/assets/ConfirmDialog-BMHnG9oQ.js","/assets/Daily-BpRmf8vy.js","/assets/DataTable-C95Xzqvi.js","/assets/DateRangePicker-D8DskzTX.js","/assets/DayReportView-CS2NMwAq.js","/assets/DayStepper-H27hSVo3.js","/assets/DifferenceBreakdown-Bk0pQLlH.js","/assets/Downtime-AosK9tmg.js","/assets/Education-D8RdsTvv.js","/assets/EducationLesson-ByV6FWOR.js","/assets/EmptyState-BzNLD-d1.js","/assets/Exam-C6uI-u5J.js","/assets/FactorySelect-GbFRXaJ3.js","/assets/Gamification-Dq-4u1FU.js","/assets/GroupBadge-Bg-w_zQP.js","/assets/HeatmapChart-CnMOJWJK.js","/assets/IdleCell-DxorxGkZ.js","/assets/KPICard-D90OfNbN.js","/assets/Kaizen-CL_rWbZc.js","/assets/KpiDeltaCard-czsZ1kwt.js","/assets/LangTextInput-CiiwHxya.js","/assets/Layout-DwXp-UfW.js","/assets/LeaderDayReport-CS6JO9s-.js","/assets/LeaderUnitReport-BVUJGajR.js","/assets/Leaderboard-CtzyI4g2.js","/assets/Leaders-UAi0ua1L.js","/assets/LiveOverview-BsAlSewE.js","/assets/Login-2WhkKUww.js","/assets/NotFound-DNWzh3wp.js","/assets/Overview-D1f2Yxiy.js","/assets/Pagination-CkXTf-cs.js","/assets/PerenaladkaFactTable-COqV1JkG.js","/assets/PlanFulfillment-DlZMJmHf.js","/assets/Production-DtPYVKQO.js","/assets/Profile-6a1YBc73.js","/assets/ProofCamera-62N7Qxjg.js","/assets/Quality-CGv1bnV2.js","/assets/RequestStateChip-DBWn5Gcb.js","/assets/RichTextEditor-rn--EAGj.js","/assets/SearchInput-Dumf_FUF.js","/assets/SeasonalityHeatmap-tXTszHLc.js","/assets/SegmentedToggle-D6uBE4fg.js","/assets/SetupTimes-Dotl_Tbl.js","/assets/ShiftDaily-BCUTWwI8.js","/assets/Staff-DOepwaN4.js","/assets/StatusBadge-UkHfeomH.js","/assets/Targets-ZN8OO2xT.js","/assets/Tasks-f_exXdrK.js","/assets/TimeWheelPicker-Zc9iuWfT.js","/assets/Tooltip-t8rZMmYJ.js","/assets/TrendChart-DzUwhqqQ.js","/assets/TripleSpeedometer-BpbLnGst.js","/assets/Trudoyomkost-C7HLxMAH.js","/assets/UsersActivity-Hjcw_5mF.js","/assets/WatchProgress-DaTyvK4G.js","/assets/WebLogin-Cak1udhi.js","/assets/WorkerConcerns-CFJud1Ym.js","/assets/Workers-DfnCbmOL.js","/assets/Zagruzka-DuiSKUI-.js","/assets/ZagruzkaCell-CN_lopDa.js","/assets/alarm-clock-DokNG6ZS.js","/assets/api-sMQfyplI.js","/assets/archive-WsMiQ1jZ.js","/assets/archive-restore-B55iRLPP.js","/assets/arrow-down-BZ5_01nZ.js","/assets/arrow-left-CBX8XaGb.js","/assets/arrow-left-right-7S1Ugy01.js","/assets/arrow-up-oXiGbWeN.js","/assets/arrow-up-right-BDfeC_j4.js","/assets/award-CtLw02i9.js","/assets/ban-3h4Luaty.js","/assets/bot-TZeWxPzW.js","/assets/boxes-CzrerV_w.js","/assets/brigadirFilters-Bzb9rl79.js","/assets/broadcastTree-CoSjP3N0.js","/assets/building-2-CT-eBbYi.js","/assets/calendar-JMU-DGc-.js","/assets/calendar-clock-BNGS-ble.js","/assets/calendar-days-uZyseL7B.js","/assets/calendar-range-CheWdaBN.js","/assets/camera-DGdh8vWc.js","/assets/categories-s5xe634D.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CGbMcQAj.js","/assets/chart-line-Dlz8VOw5.js","/assets/chart-pie-BKt8RYhY.js","/assets/chartRange-BWQ02PCE.js","/assets/check-check-DOk1HZ-r.js","/assets/chevron-left-C3Dkao_V.js","/assets/chevrons-up-down-Bmez1il5.js","/assets/circle-check-big-B_zMooZm.js","/assets/circle-dashed-DZyhk4Uu.js","/assets/circle-dot-_ZU2C1R7.js","/assets/circle-minus-C4mcU4-G.js","/assets/circle-slash-DytszCh-.js","/assets/circle-user-round-B7CnqOHf.js","/assets/coins-CRNY7kLC.js","/assets/compass-D-qxk-iX.js","/assets/concernCategories-DDhpjaJT.js","/assets/copy-DJHfwmpB.js","/assets/corner-down-right-D2RZ5Dxi.js","/assets/createLucideIcon-XBmKaPI3.js","/assets/exportXlsx-CKf-3Z8a.js","/assets/external-link-DHNgvqkT.js","/assets/file-clock-hXg5wrOi.js","/assets/file-exclamation-point-DsaSYPuE.js","/assets/file-spreadsheet-Cm96BTJl.js","/assets/file-text-D_lXZ_gh.js","/assets/flag-Dc734DgR.js","/assets/flame-DJnIWSEb.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-o-hEENkO.js","/assets/hash-Detrtiqn.js","/assets/history-Dfy05GXG.js","/assets/hourglass-BMZyJOS5.js","/assets/image-ZjrlCxGs.js","/assets/image-off-BjjEqi38.js","/assets/index-BTZsppTH.css","/assets/index-BbpdEpHw.js","/assets/key-round-2QmZjijh.js","/assets/keyboard-DGcbFxOY.js","/assets/languages-oNxbrdJD.js","/assets/layers-CCFPhrsN.js","/assets/leaderReason-B0_r9nMM.js","/assets/lightbulb-Cpidl4JC.js","/assets/link-2-C4fvcPd6.js","/assets/list-checks-CqYq7R9l.js","/assets/list-ordered-0LQ1Y-NG.js","/assets/list-tree-CqQ88tOI.js","/assets/lock-open-B5ThzJZz.js","/assets/log-in-CAK2KZZs.js","/assets/message-square-DNThDM8c.js","/assets/minimize-2-Nk9EX6vf.js","/assets/package-check-CihLlr42.js","/assets/paperclip-r1oVWulE.js","/assets/pencil-c9P1PCzc.js","/assets/personName-B4KId4zS.js","/assets/pin-RBBcUyfR.js","/assets/play-Ciw_n9nP.js","/assets/presentation-DwJtKkye.js","/assets/prop-types-B1P4v4vB.js","/assets/radio-C5Elinrs.js","/assets/react-apexcharts.esm-TXbcalVp.js","/assets/repeat-C-S2u6fh.js","/assets/rotate-ccw-BsRCqSer.js","/assets/rotate-cw-4oExMHrK.js","/assets/save-CMPMrB_4.js","/assets/scale-DAPWsJ5g.js","/assets/scroll-text-BptreeJt.js","/assets/search-x-BTfIWRS7.js","/assets/segments-CmKZKDGS.js","/assets/send-D0udByKC.js","/assets/settings-2-BxwWrMIK.js","/assets/shield-BA-QFRsS.js","/assets/shield-alert-CdvoVP3_.js","/assets/shield-check-DwbwgiI4.js","/assets/shield-question-mark-DCdL6BVU.js","/assets/siren-BiLVYTMr.js","/assets/smartphone-CKJ-YeXI.js","/assets/snowflake-jXgQV8tR.js","/assets/square-DXPPBOQz.js","/assets/square-check-big-6kyQUNom.js","/assets/star-DoYjlDTy.js","/assets/statusBands-BjSu7f_O.js","/assets/store-BDMhAuZE.js","/assets/table-2-ro4wHATr.js","/assets/tag-CkFxrkDZ.js","/assets/trending-down-vRmiXbdD.js","/assets/trending-up-DMatbUjW.js","/assets/triangle-alert-CxDyXEEa.js","/assets/undo-2-CH1Ou1Z-.js","/assets/useChartTheme-Bk3opuPw.js","/assets/useElementWidth-DXJKJgUI.js","/assets/useIsMobile-Cn0s3pyT.js","/assets/useMutation-D8_azNzE.js","/assets/useStatusBands-DIUqrqwo.js","/assets/user-DloNxmxL.js","/assets/user-check-DjsbrPyU.js","/assets/user-cog-CKnhrLE3.js","/assets/user-minus-DzscoA7B.js","/assets/users-CexUJKQn.js","/assets/verifyState-BWf-kFaD.js","/assets/video-BUK5jUrM.js","/assets/warehouse-BuTXfSgT.js","/assets/zap-Fe5aae81.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
