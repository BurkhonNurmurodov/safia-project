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

const BUILD = "2026-09-28T15:41:55.516Z";
const PRECACHE = ["/","/assets/AdminPanel-Bja3CQYo.js","/assets/AnalysisBoard-D8ypK8kf.js","/assets/Arc-DjRN6CR2.js","/assets/ArcLegacy-CikIZ9G0.js","/assets/AttendanceModal-CWJuq3FF.js","/assets/BrigadirProfile-CCb59bFU.js","/assets/BroadcastReceivers-BThD3aRr.js","/assets/BroadcastRecord-rYxoEHXx.js","/assets/CatLockNotice-DXgqST0S.js","/assets/CategoryLegendModal-CwzJMzsX.js","/assets/CellConcerns-CThwztPQ.js","/assets/CellDetails--w9487kj.js","/assets/CellFormModal-4hfxOh9z.js","/assets/CellLink-LxjoZtMy.js","/assets/Cells-Box_VSCc.js","/assets/ColumnFilter-iV-R6pPi.js","/assets/ColumnsPicker-DefOYS4E.js","/assets/CommentsModal-DnxB1EWB.js","/assets/ComparisonTable-DpUVwBke.js","/assets/Concerns-DTcIz9SR.js","/assets/ConfirmDialog-D9q-wjIt.js","/assets/Daily-DRM-5Z2n.js","/assets/DataTable-DeEEGwrv.js","/assets/DateRangePicker-DuRQgElK.js","/assets/DayReportView-D5HxxDOj.js","/assets/DayStepper-Dt5D2n1I.js","/assets/DifferenceBreakdown-CzT82SuM.js","/assets/Downtime-C8GSDXrE.js","/assets/Education-CE_UxdOH.js","/assets/EducationLesson-isqIqDjf.js","/assets/EmptyState-DQXSDAXr.js","/assets/Exam-BXDH4ruU.js","/assets/FactorySelect-UJjXivfY.js","/assets/Gamification-C7iEa54G.js","/assets/GroupBadge-Bj18WPMk.js","/assets/HeatmapChart-iJNQpBvC.js","/assets/IdleCell-CRjJKoy8.js","/assets/KPICard--WbWFnBz.js","/assets/Kaizen-0yk9_QtT.js","/assets/Kelish-DJPTU3V-.js","/assets/KpiDeltaCard-OacxAFgf.js","/assets/LangTextInput-CgINmQGj.js","/assets/Layout-DmSQwdc_.js","/assets/LeaderAppeal-DF3_VcFl.js","/assets/LeaderDayReport-CvAc3A5U.js","/assets/LeaderUnitReport-Bgik-qVe.js","/assets/Leaderboard-DPEsiVbV.js","/assets/Leaders-Czwt14VC.js","/assets/Lightbox-D1HcDwV1.js","/assets/LiveOverview-DcvvfPcL.js","/assets/Login-UQF5Z6pA.js","/assets/NotFound-Bk5V1ecw.js","/assets/Overview-gdPC7w89.js","/assets/Pagination-DcUxz9NU.js","/assets/PerenaladkaFactTable-DNzPL1aw.js","/assets/PlanFulfillment-CAYIIj-s.js","/assets/Production-wQ9Z0c7_.js","/assets/Profile-CL29rzKZ.js","/assets/ProofCamera-D4FffybF.js","/assets/ProofPhoto-Bv3zbvk2.js","/assets/Quality-BnNvPli6.js","/assets/RequestStateChip-FPs2Gdxr.js","/assets/RichTextEditor-DHNBl0Tr.js","/assets/SaveState-CSSkMEQb.js","/assets/SearchInput-BdSsqu3I.js","/assets/SeasonalityHeatmap-CEQej7fK.js","/assets/SegmentedToggle-DrRN2Ocw.js","/assets/SetupTimes-BFel3H1a.js","/assets/ShiftDaily-WK__1fJ2.js","/assets/Staff-Gg0FEiYM.js","/assets/StatusBadge-DGXHPlJc.js","/assets/TargetGoal-CLaxUSDi.js","/assets/Targets-CFmIKhqP.js","/assets/Tasks-DOyrRoH7.js","/assets/TimeWheelPicker-CMDgMiv9.js","/assets/Tooltip-DiwGFhVj.js","/assets/TrendChart-ClOvJm_j.js","/assets/TripleSpeedometer-DFPm67w9.js","/assets/Trudoyomkost-DlG7gva0.js","/assets/UploadDropzone-kEJptcVQ.js","/assets/UsersActivity-C9ODgs9p.js","/assets/VerdictBlock-DCXtsa7q.js","/assets/WatchProgress-CmvEB7UJ.js","/assets/WebLogin-Dml8WLve.js","/assets/WorkerConcerns-DNJ_5o32.js","/assets/Workers-DhHhwy6L.js","/assets/Zagruzka-1qWpWDcw.js","/assets/ZagruzkaCell-Dg_lSgA1.js","/assets/api-CIqp4hd8.js","/assets/archive-h6a4Aqm_.js","/assets/archive-restore-DfegmX23.js","/assets/arrow-down-BKXe2yvc.js","/assets/arrow-left-bvQdyuBg.js","/assets/arrow-left-right-DHa9eqao.js","/assets/arrow-up-BEGKhzsk.js","/assets/arrow-up-right-BBTJrYRg.js","/assets/award-BEWqEmLf.js","/assets/ban-3nkTen57.js","/assets/bot-DKaLF6ZT.js","/assets/boxes-CHDochHy.js","/assets/brigadirFilters-B0m9Aqke.js","/assets/broadcastTree-_BaTG1__.js","/assets/building-2-F1xTbnYj.js","/assets/calendar-Cd6dyV7M.js","/assets/calendar-clock-Ba1STKdJ.js","/assets/calendar-days-BC6ppOmi.js","/assets/calendar-range-DDf4AXIP.js","/assets/camera-xPhWlSlN.js","/assets/categories-Bac_PWEQ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C2eocOQ9.js","/assets/chart-line-C1fyvsuX.js","/assets/chart-pie-Ba7bl6ir.js","/assets/chartRange-Cc_dPkqZ.js","/assets/chevron-left-CtzTQ8Bu.js","/assets/chevrons-up-down-31RbE9yz.js","/assets/circle-CXsJJ4wW.js","/assets/circle-check-big-Bu99Znae.js","/assets/circle-dot-DFOVHAU6.js","/assets/circle-minus-CfUWd_jh.js","/assets/circle-slash-qkOhFAyo.js","/assets/circle-user-round-CyC1UJYr.js","/assets/cloud-off-CrhRNe5W.js","/assets/cloud-upload-BKm_EME7.js","/assets/compass-Dh2wPzxC.js","/assets/concernCategories-ydmwHh34.js","/assets/copy-CN-dyGQZ.js","/assets/corner-down-right-CAvrdeDX.js","/assets/createLucideIcon-DGK7XAUV.js","/assets/es-Dmqw885H.js","/assets/exportXlsx-DIJNqKEV.js","/assets/external-link-ZU0f3ieq.js","/assets/file-clock-DcxZ_K6D.js","/assets/file-exclamation-point-a3Wh9zys.js","/assets/file-spreadsheet-B3rpeBAC.js","/assets/file-text-skcC9Kd-.js","/assets/flag-BA_JbUt3.js","/assets/flame-Cd3c_LGM.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-ujtgbAC2.js","/assets/hash-GgU6RCdm.js","/assets/history-DQ6Fm-kp.js","/assets/hourglass-CvSwe1su.js","/assets/image-B2qfoF76.js","/assets/image-off-4A9gmBn5.js","/assets/index-BweSxr3A.js","/assets/index-CamagMPV.css","/assets/key-round-CvXPT9kz.js","/assets/keyboard-42CB15Tm.js","/assets/languages-Bp7gYXS-.js","/assets/layers-CvkR8CTF.js","/assets/lightbulb-DXEvdiY8.js","/assets/link-2-BObTaEpP.js","/assets/list-checks-B14eBttf.js","/assets/list-ordered-SfN8PGbp.js","/assets/list-tree-B-ieWUVw.js","/assets/lock-open-BFP8fUXr.js","/assets/log-in-BlRSLnrC.js","/assets/message-square-CnIHxW3k.js","/assets/minimize-2--jgWsuVb.js","/assets/package-check-BVGo8H0J.js","/assets/paperclip-Byun2KKf.js","/assets/pencil-qQLb7jdo.js","/assets/percent-B5VSmU1K.js","/assets/personName-B4KId4zS.js","/assets/pin-CKoTsc7f.js","/assets/pin-off-Ckk62O-U.js","/assets/play-CKo4Y0qw.js","/assets/presentation-BHq9SWun.js","/assets/prop-types-BFFN5vrh.js","/assets/radio-BZElz2Ry.js","/assets/react-apexcharts.esm-CtDkTNL7.js","/assets/repeat-hRooajwN.js","/assets/rotate-ccw-CHL-Ux1O.js","/assets/rotate-cw-OqUsnY9w.js","/assets/save-W5q8s5Uw.js","/assets/scale-CfSqbdKg.js","/assets/scroll-text-qtOYTYYf.js","/assets/search-x-BiUU1e5I.js","/assets/segments-DzK_-NQ7.js","/assets/send-Dvleah1Y.js","/assets/settings-2-BhxGPRpf.js","/assets/shield-MJ7R3f8p.js","/assets/shield-alert-Cb4Le7iF.js","/assets/shield-check-C74tqlgh.js","/assets/shield-question-mark-DGd1UmWk.js","/assets/siren-BJCCuYwR.js","/assets/smartphone-DzHfHP4g.js","/assets/snowflake-D1wFYnTL.js","/assets/square-Cgg-8ZaF.js","/assets/square-check-big-DptYpnE6.js","/assets/star-CNqMYfS_.js","/assets/statusBands-C6UHWyWz.js","/assets/store-BHTwXQDl.js","/assets/table-2-cFTeYe2l.js","/assets/tag-B3-mqDgU.js","/assets/timer-off-CT-PnTi0.js","/assets/trending-down-JyWXWo5z.js","/assets/trending-up-BctqvisF.js","/assets/undo-2-BXuKWpb3.js","/assets/useChartTheme-Bi7fr9Jn.js","/assets/useElementWidth-CTIIaMOJ.js","/assets/useIsMobile-BaGtdwCh.js","/assets/useMutation-sExzCa_u.js","/assets/useStatusBands-BIR28J8W.js","/assets/user-DlGcdtMx.js","/assets/user-cog-DXnlNHyW.js","/assets/user-minus-Bc26psIn.js","/assets/users-D_TuBRCH.js","/assets/video-Cq_GyeED.js","/assets/wallet-CTtOnpjs.js","/assets/warehouse-CNP8IWHh.js","/assets/zap-DQNKw5He.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
