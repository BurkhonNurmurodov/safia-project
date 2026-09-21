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

const BUILD = "2026-09-21T09:45:21.289Z";
const PRECACHE = ["/","/assets/AdminPanel-IOpP7gl9.js","/assets/AnalysisBoard-CX7oqNBm.js","/assets/Arc-BotokRFu.js","/assets/AttendanceModal-D78Zd9jP.js","/assets/BrigadirProfile-DSjTeb_e.js","/assets/BroadcastReceivers-BX1kBDcT.js","/assets/BroadcastRecord-DDxwwfGE.js","/assets/CatLockNotice-Cu5Dz4a4.js","/assets/CategoryLegendModal-B5Uy60Pt.js","/assets/CellConcerns-DkIHmZqa.js","/assets/CellDetails-DP5ajCeE.js","/assets/CellFormModal-BUOR_irH.js","/assets/CellLink-tZYMCLHP.js","/assets/Cells-D73AoBgZ.js","/assets/ColumnFilter-tdXzaaJ_.js","/assets/ColumnsPicker-DA0rlFas.js","/assets/CommentsModal-CVWycn8p.js","/assets/ComparisonTable-DyDWo_vp.js","/assets/Concerns-Ds_fTsrp.js","/assets/ConfirmDialog-SUjfpTCt.js","/assets/Daily-BEmcAaDZ.js","/assets/DataTable-C3qXEFpA.js","/assets/DateRangePicker-BaVR22Am.js","/assets/DayReportView-tZDcq9EY.js","/assets/DayStepper-B4YZPy3E.js","/assets/DifferenceBreakdown-DMI0KZ1i.js","/assets/Downtime-Ckky2DOX.js","/assets/Education-BY_qC2YP.js","/assets/EducationLesson-BlLD6vlp.js","/assets/EmptyState-CaQvVA-8.js","/assets/FactorySelect-eltC64SJ.js","/assets/FormField-BekBrqmp.js","/assets/Gamification-Cq7Al0bu.js","/assets/GroupBadge-gRWtKYB2.js","/assets/HeatmapChart-B6uJaVjA.js","/assets/IdleCell-CsNnzDz9.js","/assets/KPICard-C4ZgiNtg.js","/assets/Kaizen-4EuOYxJk.js","/assets/KpiDeltaCard-SDNuJXlI.js","/assets/LangTextInput-BsAzhB3F.js","/assets/Layout-D9nJkvc6.js","/assets/LeaderDayReport-OrloKuNI.js","/assets/LeaderUnitReport-jngRwDxz.js","/assets/Leaderboard-C2XzAbnB.js","/assets/Leaders-C34JuBIf.js","/assets/LiveOverview-D8-xwipC.js","/assets/Login-BVDaptZ1.js","/assets/NotFound-Kho5Ljo5.js","/assets/Overview-CAk46NLi.js","/assets/Pagination-Czfc0l6B.js","/assets/PerenaladkaFactTable-s8RlbIhz.js","/assets/PlanFulfillment-D4XlkOld.js","/assets/Production-DBBgtyU6.js","/assets/Profile-BNN5mJOv.js","/assets/ProofCamera-DH1ttDHE.js","/assets/Quality-DGb35oV-.js","/assets/RichTextEditor-_et2LQK1.js","/assets/SearchInput-BkwBxpXK.js","/assets/SeasonalityHeatmap-wK4KlS5U.js","/assets/SegmentedToggle-CDqdkIaH.js","/assets/SetupTimes-Cea7839b.js","/assets/ShiftDaily-BcwLiSIt.js","/assets/Skeleton-C3_bbBsL.js","/assets/Staff-Be6ES1Q6.js","/assets/StatusBadge-BSNVaxW2.js","/assets/StyledSelect-sqiNRFUJ.js","/assets/Targets-CX9fCUSc.js","/assets/Tasks-CdU93YkJ.js","/assets/TimeField-lmBSf1O1.js","/assets/TimeWheelPicker-DIay-WZj.js","/assets/Toast-BzwsHmuo.js","/assets/Tooltip-D4ksgFoy.js","/assets/TrendChart-DlEz9wbn.js","/assets/TripleSpeedometer-D0Sz9Kr-.js","/assets/Trudoyomkost-tP3KKi5w.js","/assets/UsersActivity-CRclZ_ts.js","/assets/WatchProgress-CA-Uv-3l.js","/assets/WebLogin-CPc5KwO-.js","/assets/WorkerConcerns-4HravhE9.js","/assets/Workers-Dj1ZDb1t.js","/assets/Zagruzka-WMGK-ekc.js","/assets/ZagruzkaCell-DVT8BTqV.js","/assets/alarm-clock-B7saFE5V.js","/assets/api-Dw0PkqJ5.js","/assets/archive-BXHL7Eou.js","/assets/archive-restore-ButRUiBu.js","/assets/arrow-down-ClyM12J2.js","/assets/arrow-left-CL5LlPQ6.js","/assets/arrow-left-right-9NMcdLZh.js","/assets/arrow-right-i2DPuDcd.js","/assets/arrow-up-DDHNb5e8.js","/assets/arrow-up-right-Cv8WjXm-.js","/assets/award-piAvr8Cu.js","/assets/ban-CywT6niU.js","/assets/bot-Dams_dbt.js","/assets/boxes-Bn0p2rVL.js","/assets/brigadirFilters-COsKjCRS.js","/assets/broadcastTree-DM09BvX3.js","/assets/building-2-CKPOM8DK.js","/assets/calendar-DvvVQT1l.js","/assets/calendar-clock-rzEE_b_7.js","/assets/calendar-days-D9jbpj3v.js","/assets/calendar-range-CrCUpSWH.js","/assets/camera-B5ZD5p2i.js","/assets/categories-CvPDLXUh.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DUP3Ga7n.js","/assets/chart-line-AE3NHQYu.js","/assets/chart-pie-BtVVsYkB.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-Bp-k5TBo.js","/assets/check-HNflpXry.js","/assets/check-check-B1zSIkF_.js","/assets/chevron-left-CwQFrE9T.js","/assets/chevrons-up-down-BaIEhU0m.js","/assets/circle-dashed-DPZ_F9mK.js","/assets/circle-dot-CNSn6YyR.js","/assets/circle-minus-xu7-68vb.js","/assets/circle-slash-D7QWQXku.js","/assets/circle-user-round-DvhzkbBf.js","/assets/coins-DIlFlqgU.js","/assets/compass-CMZ0kPTa.js","/assets/concernCategories-BAr-Fan1.js","/assets/copy-jdyH4M3M.js","/assets/corner-down-right-BqSfglO-.js","/assets/createLucideIcon-CDB-5y3s.js","/assets/exportXlsx-CZ1jU41Z.js","/assets/external-link-Bw9V2nlf.js","/assets/file-clock-Dl0IlHUL.js","/assets/file-spreadsheet-BBO2tOnI.js","/assets/file-text-BwJIVSMw.js","/assets/flag-eDyldR7d.js","/assets/flame-BYiMPx-2.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-C6_RMhJ9.js","/assets/funnel-B1nOAET5.js","/assets/hash-k1is_d-m.js","/assets/history-DwaZx_65.js","/assets/hourglass-Dz7PL9Y_.js","/assets/image-CmjCKgdn.js","/assets/image-off-BknEAQGX.js","/assets/index-BXqTV2jf.css","/assets/index-CqunIUTw.js","/assets/keyboard-BiviehVG.js","/assets/languages-CySGFiAT.js","/assets/layers-CLvGd4ZT.js","/assets/leaderReason-DP4N8ABo.js","/assets/lightbulb-DlyUEZk5.js","/assets/link-2-dPtA_jg5.js","/assets/list-checks-Czz5lkz7.js","/assets/list-ordered-CHPm2Lof.js","/assets/lock-open-EtjCzvX-.js","/assets/log-in-C5ZnKM6-.js","/assets/message-square-CMer5bHm.js","/assets/minimize-2-DeYGcAUV.js","/assets/minus-BdKFMJEL.js","/assets/paperclip-D3_dABoH.js","/assets/pencil-CF5kXMof.js","/assets/pencil-line-mlsxLVoo.js","/assets/personName-B4KId4zS.js","/assets/pin-CWhX3U4e.js","/assets/play-BvYRSDzV.js","/assets/prop-types-CCFHsr6F.js","/assets/radio-C7vBI5DV.js","/assets/react-apexcharts.esm-BRk8F1n_.js","/assets/refresh-cw-DZBE6g_6.js","/assets/repeat-Bi3IK3ZW.js","/assets/rotate-ccw--zwfGvyg.js","/assets/rotate-cw-Bdd6s86E.js","/assets/save-DmdLKlKF.js","/assets/scale-CZFwkQy1.js","/assets/scroll-text-BEkqRMT0.js","/assets/search-x-BneBtFHT.js","/assets/segments-DuKKz9b_.js","/assets/send-DnY14RSx.js","/assets/settings-2-V1iyJYZ3.js","/assets/shield-alert-BZLI6E-F.js","/assets/shield-check-CMUeYoW-.js","/assets/shield-ocD9lSP7.js","/assets/shield-question-mark-D_i-iEWt.js","/assets/siren-B5lWvCBe.js","/assets/smartphone-C0l9q7P2.js","/assets/snowflake-C2nKnPNL.js","/assets/square-BhKWXP8T.js","/assets/square-check-big-B9PfYSGJ.js","/assets/star-BSLnPPR_.js","/assets/statusBands-BmUmTjOm.js","/assets/table-2-4-fI2sCr.js","/assets/tag-BTEKgSmq.js","/assets/trash-2-CdgCzY3v.js","/assets/trending-down-DI-ZnTyo.js","/assets/trending-up-DgBKC9mU.js","/assets/undo-2-C-uXfNj8.js","/assets/useChartTheme-CWsXYFEX.js","/assets/useElementWidth-BGXNp-Xe.js","/assets/useIsMobile-X14qAxmY.js","/assets/useMutation-s-LazfL4.js","/assets/useStatusBands-CGvv_iGB.js","/assets/user-check-D1UwzFen.js","/assets/user-cog-BMUaXnfL.js","/assets/user-minus-OthSk-6u.js","/assets/users-DNDhpH1X.js","/assets/verifyState-CeHUFCT2.js","/assets/video-WLvLGG4J.js","/assets/warehouse-QEJbzTs7.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
