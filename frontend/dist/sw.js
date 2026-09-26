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

const BUILD = "2026-09-26T08:07:19.598Z";
const PRECACHE = ["/","/assets/AdminPanel-Me2GKmUo.js","/assets/AnalysisBoard-D1lXgoNf.js","/assets/Arc-2yDznCCS.js","/assets/ArcLegacy-BG-Tuqor.js","/assets/AttendanceModal-zSS6XhuL.js","/assets/BrigadirProfile-Dvj2m7Ps.js","/assets/BroadcastReceivers-ClgPcMDt.js","/assets/BroadcastRecord-BjzXFI-S.js","/assets/CatLockNotice-Cd9Xwew4.js","/assets/CategoryLegendModal-CM5gFxLV.js","/assets/CellConcerns-BbcodiBQ.js","/assets/CellDetails-5BIEX9aI.js","/assets/CellFormModal-BNVZPmHw.js","/assets/CellLink-Cgu9FY4P.js","/assets/Cells-Dnie5FtQ.js","/assets/ColumnFilter-DvZO5U_G.js","/assets/ColumnsPicker-CORRPXcR.js","/assets/CommentsModal-BlsCOUG5.js","/assets/ComparisonTable-B_Yopywt.js","/assets/Concerns-B2JxsmIy.js","/assets/ConfirmDialog-BKVLNYet.js","/assets/Daily-DcBX7a-9.js","/assets/DataTable-brmBP5bT.js","/assets/DateRangePicker-XynjtXSm.js","/assets/DayReportView-BJ9l-571.js","/assets/DayStepper-DUAuh_eC.js","/assets/DifferenceBreakdown-BiWAgky7.js","/assets/Downtime-Cw7bxKhd.js","/assets/Education-2ITN2W-h.js","/assets/EducationLesson-TqA0LVsQ.js","/assets/EmptyState-CrVX9wG-.js","/assets/Exam-BD4arEfV.js","/assets/FactorySelect-DMGsp7eL.js","/assets/Gamification-_1Yipesn.js","/assets/GroupBadge-D58TQBrK.js","/assets/HeatmapChart-Bx6MiXca.js","/assets/IdleCell-CL4Yqnyn.js","/assets/KPICard-B6iRRwIj.js","/assets/Kaizen-DhHBX4fJ.js","/assets/KpiDeltaCard-jB68Ma8R.js","/assets/LangTextInput-HP1q4Nlv.js","/assets/Layout-Dno4Qmwn.js","/assets/LeaderDayReport-DvipyzIv.js","/assets/LeaderUnitReport-PB0ba2vZ.js","/assets/Leaderboard-CCikN_t8.js","/assets/Leaders-D6sOeoc5.js","/assets/LiveOverview-BAohhw7k.js","/assets/Login-Y45Qs0yW.js","/assets/NotFound-BharaEKS.js","/assets/Overview-DoDGvCE4.js","/assets/Pagination-DyTN4HKz.js","/assets/PerenaladkaFactTable-D_7HdoLs.js","/assets/PlanFulfillment-CjlexW7e.js","/assets/Production-vEv_fuaa.js","/assets/Profile-BI8uI0Kw.js","/assets/ProofCamera-B2X-B_BN.js","/assets/Quality-CP4JXczT.js","/assets/RequestStateChip-DJDoKKVA.js","/assets/RichTextEditor-BHkyVTft.js","/assets/SearchInput-BDrq7mpf.js","/assets/SeasonalityHeatmap-BGxKXbLV.js","/assets/SegmentedToggle-Cyr6av0h.js","/assets/SetupTimes-PahL4ZoZ.js","/assets/ShiftDaily-CAV27yjB.js","/assets/Staff-Cat5M7oW.js","/assets/StatusBadge-CDs6vmlW.js","/assets/Targets-C8IGMH1G.js","/assets/Tasks-DvHu0kJj.js","/assets/TimeWheelPicker-CEirRUiO.js","/assets/Tooltip-7DjYufTW.js","/assets/TrendChart-XxwwOAb9.js","/assets/TripleSpeedometer-3rcUl1AM.js","/assets/Trudoyomkost-Bi162PWq.js","/assets/UsersActivity-BK1x73JW.js","/assets/WatchProgress-BxKyRpvX.js","/assets/WebLogin-B37wIGnf.js","/assets/WorkerConcerns-6fiB6VG8.js","/assets/Workers-DXWE4Uyl.js","/assets/Zagruzka-Cgy6nh8a.js","/assets/ZagruzkaCell-DeUHVHnG.js","/assets/alarm-clock-CP5cIY5Z.js","/assets/api-PmsK94Qp.js","/assets/archive-HC2gx3gb.js","/assets/archive-restore-CfQToJME.js","/assets/arrow-down-oLngKwu6.js","/assets/arrow-left-j2BU9xim.js","/assets/arrow-left-right--b2MEVwV.js","/assets/arrow-up-BVur8WmS.js","/assets/arrow-up-right-BeUlfFxI.js","/assets/award-cOM2lfOE.js","/assets/ban-D0xtqXPQ.js","/assets/bot-DFOLbehh.js","/assets/boxes-BJ_OJwYR.js","/assets/brigadirFilters-BLmsXV_p.js","/assets/broadcastTree-DC_x-hXs.js","/assets/building-2-CzbLE79v.js","/assets/calendar-DkhTlopB.js","/assets/calendar-clock-Ct0UIje-.js","/assets/calendar-days-B4ttfU0W.js","/assets/calendar-range-DYsGtJYk.js","/assets/camera-BOsOr_Yx.js","/assets/categories-BsBH7dEz.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D4ySyMrw.js","/assets/chart-line-DNkut4VZ.js","/assets/chart-pie-D-zouVaX.js","/assets/chartRange-CSnH2lXp.js","/assets/check-check-VHLRm9Za.js","/assets/chevron-left-9p8UmkOY.js","/assets/chevrons-up-down-BE0rd0f0.js","/assets/circle-check-big-By8GD-4n.js","/assets/circle-dashed-BneTNejT.js","/assets/circle-dot-rZIeJCrc.js","/assets/circle-minus-BDWaqcAb.js","/assets/circle-slash-DpcuE8VU.js","/assets/circle-user-round-DGIKGki9.js","/assets/coins-CY_GNjni.js","/assets/compass-DC7TV4lJ.js","/assets/concernCategories-DCUCNws7.js","/assets/copy-hfNAkVMj.js","/assets/corner-down-right-BcYvZUNo.js","/assets/createLucideIcon-CxVVK8wQ.js","/assets/exportXlsx-BGDSDKwJ.js","/assets/external-link-C4ofaSxW.js","/assets/file-clock-BH79Pnip.js","/assets/file-exclamation-point-wsIJKKWl.js","/assets/file-spreadsheet-OCkBXmpE.js","/assets/file-text-DRUxTYzG.js","/assets/flag-D0IAEc_-.js","/assets/flame-DkPVxknw.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BxP9U2KZ.js","/assets/hash-BvP3bq3B.js","/assets/history-DGX3mUBL.js","/assets/hourglass-DsOfGWiG.js","/assets/image-Cli7f-Dy.js","/assets/image-off-CyCfdK30.js","/assets/index-BTZsppTH.css","/assets/index-DV_9Fyr9.js","/assets/key-round-DfpjF4um.js","/assets/keyboard-d8sO652S.js","/assets/languages-Enjn1R-_.js","/assets/layers-BumrXC2B.js","/assets/leaderReason-BSbXzPSb.js","/assets/lightbulb-CxJ7Xnzv.js","/assets/link-2-DgQm4ZYS.js","/assets/list-checks-CGg2wC6r.js","/assets/list-ordered-DLUgfFqD.js","/assets/list-tree-0YjClexm.js","/assets/lock-open-BvcQihZB.js","/assets/log-in-CElYhDll.js","/assets/message-square-Z9sDfeQv.js","/assets/minimize-2-CoQkVjV0.js","/assets/package-check-DxQ1xALG.js","/assets/paperclip-CcsXAlJU.js","/assets/pencil-Dxnz-A-g.js","/assets/personName-B4KId4zS.js","/assets/pin-BqbuQOu4.js","/assets/play-Bb3W-V_7.js","/assets/presentation-BHTZsXEq.js","/assets/prop-types-DJoTQ1hj.js","/assets/radio-BWB5kvtk.js","/assets/react-apexcharts.esm-BREdswrT.js","/assets/repeat-Cqzr3tp4.js","/assets/rotate-ccw-BIIzgraV.js","/assets/rotate-cw-Dk11GsPX.js","/assets/save-TLr72tR2.js","/assets/scale-Dah4AbAn.js","/assets/scroll-text-CM7KZt4m.js","/assets/search-x-BQopYkbg.js","/assets/segments-D6LTP0Rn.js","/assets/send-BxLqRFsK.js","/assets/settings-2-gr4bjpUE.js","/assets/shield-Aj63yDOT.js","/assets/shield-alert-ewvbfHgM.js","/assets/shield-check-BK6wXAXa.js","/assets/shield-question-mark-BCn7-KIe.js","/assets/siren-2HLyNlhB.js","/assets/smartphone-BDNYFio8.js","/assets/snowflake-Ba84m5fK.js","/assets/square-D16AC4wj.js","/assets/square-check-big-BVCIOWLr.js","/assets/star-BbMYXrkm.js","/assets/statusBands-cNnE7RJV.js","/assets/store-CvEQCUUy.js","/assets/table-2-Cde9Tn8x.js","/assets/tag-Y_GN-s4t.js","/assets/trending-down-qDtLcrqJ.js","/assets/trending-up-C_AJkeE5.js","/assets/triangle-alert-DUdKUr3I.js","/assets/undo-2-D21cphDk.js","/assets/useChartTheme-qPyg_A6c.js","/assets/useElementWidth-BaZZO_mp.js","/assets/useIsMobile-DdBqmapz.js","/assets/useMutation-BzJxQH2Q.js","/assets/useStatusBands-Ct9ZI7Mk.js","/assets/user-UTxDueX_.js","/assets/user-check-BpbnV9ef.js","/assets/user-cog-DfoHlPhW.js","/assets/user-minus-uOkyfVD0.js","/assets/users-CPoM1w4v.js","/assets/verifyState-BxWyt295.js","/assets/video-Wk7TzCUc.js","/assets/warehouse-DfwpRoYA.js","/assets/zap-CaD7M0yN.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
