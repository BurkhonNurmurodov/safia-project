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

const BUILD = "2026-10-02T06:25:42.201Z";
const PRECACHE = ["/","/assets/AdminPanel-DQUauSce.js","/assets/AnalysisBoard-savYHSt-.js","/assets/Arc-B0U_MFwA.js","/assets/ArcLegacy-CUoUHpSr.js","/assets/BrigadirProfile-2L7h8-0Y.js","/assets/BroadcastReceivers-D4vHlg--.js","/assets/BroadcastRecord-Dyh0oLJQ.js","/assets/CatLockNotice-Dq22Vc2I.js","/assets/CategoryLegendModal-NSnF9nYI.js","/assets/CellConcerns-DZwN59ah.js","/assets/CellDetails-B2yJlB8r.js","/assets/CellFormModal-HfVN4vlE.js","/assets/CellIdent-C7Z74HCM.js","/assets/CellLink-C2P9Hlqy.js","/assets/Cells-CpphneKp.js","/assets/ColumnFilter-Da6Usa5i.js","/assets/ColumnsPicker-CgrgD6Q5.js","/assets/CommentsModal-DN6bbaGi.js","/assets/ComparisonTable-DUKvEaJi.js","/assets/Concerns-Dx85HMDT.js","/assets/ConfirmDialog-BHm0NIxS.js","/assets/Daily-DgLvkt3J.js","/assets/DataTable-BBmtavSh.js","/assets/DateRangePicker-DBYU9oHu.js","/assets/DayReportView-Bd8kJf-c.js","/assets/DayStepper-DhYQ-IA6.js","/assets/DifferenceBreakdown-C54J5alO.js","/assets/Downtime-pri22RzT.js","/assets/Education-B_rYJtnL.js","/assets/EducationLesson-7WF9Zpzu.js","/assets/EmptyState-BdG7iDyO.js","/assets/Exam-D6uYlfby.js","/assets/FactorySelect-Z6sDLSl6.js","/assets/Gamification-BCe1bdsx.js","/assets/GroupBadge-PTSqptyR.js","/assets/HeatmapChart-CFR7lFKd.js","/assets/IdleCell-BcTk55ZG.js","/assets/KPICard-BbhVW2b2.js","/assets/Kaizen-DKZdlCUy.js","/assets/Kelish-CDduKluq.js","/assets/KpiDeltaCard-B-vkb9UL.js","/assets/LangTextInput-D7zUyNxM.js","/assets/Layout-Wpn7h_4X.js","/assets/LeaderAppeal-BvKEfTto.js","/assets/LeaderDayReport-CzGT_HcL.js","/assets/LeaderUnitReport-UKKeW5JG.js","/assets/Leaderboard-BXgtcwnS.js","/assets/Leaders-OVbOg8Tn.js","/assets/Lightbox-HCxcQ15N.js","/assets/LiveOverview-BwKDQv07.js","/assets/Login-DLtpo_WW.js","/assets/NotFound-uXgDGGcr.js","/assets/Notifications-ButQQRbf.js","/assets/Overview--e2vF3H2.js","/assets/Pagination-DcBk2zKd.js","/assets/PerenaladkaFactTable-CubUOXkJ.js","/assets/PlanFulfillment-1SQuN0Wv.js","/assets/Production-BhfacmsF.js","/assets/Profile-DMai9E-R.js","/assets/ProofCamera-B9DO-mLg.js","/assets/ProofPhoto-zMqLMg69.js","/assets/Quality-CMlltZUx.js","/assets/RequestStateChip-CwJH3sNo.js","/assets/RichTextEditor-4zW8_ifS.js","/assets/SaveState-DpjEdaWG.js","/assets/SearchInput-hfbsEsS7.js","/assets/SeasonalityHeatmap-CvLUj9yw.js","/assets/SegmentedToggle-D1GslL15.js","/assets/SetupTimes-pePdzUtD.js","/assets/ShiftDaily-emhefB0I.js","/assets/Staff-HTZzWfFI.js","/assets/StaffLive-BhKUpJLF.js","/assets/StatusBadge-Buneo-ph.js","/assets/TargetGoal-B33J6QiS.js","/assets/Targets-Bt4pqBk6.js","/assets/Tasks-C1R0S1oB.js","/assets/TimeWheelPicker-DGi3XJXj.js","/assets/Toast-CXxv8zjv.js","/assets/Tooltip-BtI89hwk.js","/assets/TrendChart-Ceg3Yhfx.js","/assets/TripleSpeedometer-JoWp9eIG.js","/assets/Trudoyomkost-BjX9SWgv.js","/assets/UploadDropzone-By_rVJps.js","/assets/UsersActivity-DZ7c418H.js","/assets/VerdictBlock-B8lLVSXX.js","/assets/WatchProgress-B4gYsiq9.js","/assets/WebLogin-BQGyMDvO.js","/assets/WorkerConcerns-hssKocrV.js","/assets/Workers-CHcuxpvZ.js","/assets/Zagruzka-uDOOGrS_.js","/assets/ZagruzkaCell-Barutk3o.js","/assets/api-B0s5Bqp0.js","/assets/archive-DTMpofDs.js","/assets/archive-restore-D9nsXC3d.js","/assets/arrow-down-DMLrR7kf.js","/assets/arrow-left-DGBelasr.js","/assets/arrow-right-left-BEBMzXbA.js","/assets/arrow-up-DHpzukyT.js","/assets/arrow-up-narrow-wide-ewF01pco.js","/assets/arrow-up-right-BV6llTr0.js","/assets/award-D3qcsqoM.js","/assets/ban-CxcrRxhQ.js","/assets/bot-CP21mykp.js","/assets/boxes-WmdstoBo.js","/assets/brigadirFilters-Bbblab65.js","/assets/broadcastTree-yTfUGpv2.js","/assets/building-2-XWp2S4rl.js","/assets/calendar-JJpihWMQ.js","/assets/calendar-days-CVkpQyMM.js","/assets/calendar-range-DjlG4_2O.js","/assets/camera-5hJYVNJT.js","/assets/categories-DNlFsI1Q.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BpzRplYG.js","/assets/chart-line-DFnSCyYK.js","/assets/chart-pie-PddwG3rB.js","/assets/chartRange-Dv9nOJcf.js","/assets/chevron-left-DXxlV_MG.js","/assets/chevrons-up-down-PF7WDIdj.js","/assets/circle-DiotbGsO.js","/assets/circle-alert-CoOYUim4.js","/assets/circle-check-big-DiyDLCV8.js","/assets/circle-minus-e7a4Xi3R.js","/assets/circle-slash-CaFgUp3p.js","/assets/circle-user-round-BoYaoXwC.js","/assets/cloud-off-Dp8Qz_p1.js","/assets/cloud-upload-DgX8j7qI.js","/assets/compass-CgU5Jg87.js","/assets/concernCategories-C4SMbe4d.js","/assets/copy-8U_FIH0G.js","/assets/corner-down-right-IyNJEPGA.js","/assets/createLucideIcon-qa__exhq.js","/assets/es-DeWkrUkU.js","/assets/exportXlsx-BoYr-G2H.js","/assets/external-link-DIhXqAq5.js","/assets/file-clock-DKnhPkUB.js","/assets/file-exclamation-point-CWtCPm3U.js","/assets/file-spreadsheet-DzKXBmWz.js","/assets/file-text-BAcUJJze.js","/assets/flag-BRjP29HQ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CGesJMrZ.js","/assets/hash-CQ6391z4.js","/assets/history-DrJ1XNgM.js","/assets/hourglass-pHB_lBwK.js","/assets/id-card-11wjb5gJ.js","/assets/image-D2Rqm0_e.js","/assets/image-off-Chu6emxK.js","/assets/inbox-BQZ4OKPi.js","/assets/index-CBQ-7RpV.css","/assets/index-DLDfEkxk.js","/assets/key-round-BHnPPtQx.js","/assets/keyboard-C4kc9QtO.js","/assets/languages-CA460qwU.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DaTTYyAl.js","/assets/lightbulb-BqV0R70C.js","/assets/link-2-CXSr-MJq.js","/assets/link-2-off-CoOa4WMF.js","/assets/list-ordered-DS5TF1h6.js","/assets/list-tree-DUhYFcLT.js","/assets/lock-open-BxXjDqsv.js","/assets/log-in-CJJpwFgn.js","/assets/maximize-2-DV3yA1L-.js","/assets/message-square-DHPR4Y9Z.js","/assets/minimize-2-rgKlxvx_.js","/assets/package-check-Cx_TvLVj.js","/assets/paperclip-BEdIaoNu.js","/assets/pencil-BQbs_xBM.js","/assets/percent-BWcM_LJy.js","/assets/pin-C7lmWSI9.js","/assets/pin-off-D50MTJcZ.js","/assets/play-DdhL6yRz.js","/assets/plug-zap-BAk6ODLl.js","/assets/presentation-q9A0Mlpr.js","/assets/prop-types-mmgHCr1P.js","/assets/radio-C2PuBhkj.js","/assets/react-apexcharts.esm-iq9EIFN8.js","/assets/repeat-Duo-bUD5.js","/assets/rotate-ccw-Rf7YHE4b.js","/assets/rotate-cw-knNc8mAw.js","/assets/save-rhCbV82J.js","/assets/scopeLinks-DiZQgDYx.js","/assets/scroll-text-fZPPV56B.js","/assets/search-x-DzPoPd_G.js","/assets/segments-JseNxyq3.js","/assets/send-BSTygtab.js","/assets/settings-2-B3Fy6yGT.js","/assets/shield-Cf5eYAJF.js","/assets/shield-alert-DQrk-poH.js","/assets/shield-check-D3v1WPXG.js","/assets/shield-question-mark-BOdvAuD1.js","/assets/siren-C65sXWZY.js","/assets/snowflake-B5z3cZkF.js","/assets/split-COHYt9xg.js","/assets/square-Dyg9dxAK.js","/assets/square-check-big-CWLX9XdN.js","/assets/star-CKYqKw6n.js","/assets/statusBands-c7oh_itS.js","/assets/store-DWHHsTcD.js","/assets/table-2-ds0k7u38.js","/assets/table-properties-Ej8JapLa.js","/assets/tag-BIOR_DBK.js","/assets/timer-off-BIemAgb0.js","/assets/trending-down-DqS7Y3ZC.js","/assets/trending-up-C8JWm931.js","/assets/undo-2-qBHBdWqA.js","/assets/useChartTheme-BghCrtxL.js","/assets/useElementWidth-E5TFA2kd.js","/assets/useIsMobile-B7cv0xIu.js","/assets/useOpenParam-g4WpCBOI.js","/assets/useStatusBands-CkWkBJ57.js","/assets/useUrlScope-DNFTThbH.js","/assets/user-BcrUqKNd.js","/assets/user-cog-DJXFqUQE.js","/assets/user-minus-DAFok2He.js","/assets/users-DPgKIaWZ.js","/assets/video-BCe42nL0.js","/assets/wallet-CC-eXo-V.js","/assets/warehouse-CD-zXEcD.js","/assets/x-D4rVxwH9.js","/assets/zap-DHkk-Jyt.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
