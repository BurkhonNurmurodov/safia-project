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

const BUILD = "2026-09-21T05:11:18.043Z";
const PRECACHE = ["/","/assets/AdminPanel-DKU7GsSb.js","/assets/AnalysisBoard-DYnupltA.js","/assets/Arc-SDOaDmLo.js","/assets/AttendanceModal-r1_E9QMA.js","/assets/BrigadirProfile-BP2h-nlo.js","/assets/BroadcastReceivers-D6-wTjIM.js","/assets/BroadcastRecord-B_Adj6PZ.js","/assets/CatLockNotice-CPO_dY8J.js","/assets/CategoryLegendModal-p_9_1Vak.js","/assets/CellConcerns-53FI7otH.js","/assets/CellDetails-COmuxBE_.js","/assets/CellFormModal-Bl2lqYEa.js","/assets/CellLink-DudepnIc.js","/assets/Cells-C4opkmdo.js","/assets/ColumnFilter-C2pfhigt.js","/assets/ColumnsPicker-574fSjK9.js","/assets/CommentsModal-BnrAVY_G.js","/assets/ComparisonTable-Cd3-9TwK.js","/assets/Concerns-DzvEWRCc.js","/assets/ConfirmDialog-BwHFDKla.js","/assets/Daily-DLTJiJE0.js","/assets/DataTable-D-_Nxti8.js","/assets/DateRangePicker-BOXTX_Cp.js","/assets/DayReportView-BphoA9Uq.js","/assets/DayStepper-CFogLeZm.js","/assets/DifferenceBreakdown-BH0Igk0f.js","/assets/Downtime-DgTibSEI.js","/assets/Education-T9sidWkx.js","/assets/EducationLesson-cILDEVly.js","/assets/EmptyState-DGnvt_gW.js","/assets/FactorySelect-BO2D37aD.js","/assets/FormField-ENfW_3SX.js","/assets/Gamification-D11e9oCO.js","/assets/GroupBadge-B-rBCUtd.js","/assets/HeatmapChart-DuKoWWz-.js","/assets/IdleCell-X4IIXDhb.js","/assets/KPICard-Da_aCdXw.js","/assets/Kaizen-BCDpoODA.js","/assets/KpiDeltaCard-BwmENpww.js","/assets/LangTextInput-BL9xO5Rw.js","/assets/Layout-D5F-tumV.js","/assets/LeaderDayReport-fTrnNe_Q.js","/assets/LeaderUnitReport-BP4P5hqa.js","/assets/Leaderboard-Cpe8g3yK.js","/assets/Leaders-DGgIGrbc.js","/assets/LiveOverview-cbXxtQrA.js","/assets/Login-ZBjFvvh_.js","/assets/NotFound-BJG70Fjj.js","/assets/Overview-BQwPpa67.js","/assets/Pagination-BWKMGJ6E.js","/assets/PerenaladkaFactTable-DWcMHfXj.js","/assets/PlanFulfillment-DanC-76-.js","/assets/Production-Cfrbvbh2.js","/assets/Profile-D2j7RpJo.js","/assets/ProofCamera-Bk8BVbNB.js","/assets/Quality-CbX-g-hN.js","/assets/RichTextEditor-FJ-Xfuy9.js","/assets/SearchInput-MuYeN2Tz.js","/assets/SeasonalityHeatmap-BZB7hqbe.js","/assets/SegmentedToggle-BUd5t9Wm.js","/assets/SetupTimes-DVTZxvd6.js","/assets/ShiftDaily-BIjzp1Yx.js","/assets/Skeleton-ByIR_7RA.js","/assets/Staff-0MKj1Vh7.js","/assets/StatusBadge-p7YUckK3.js","/assets/StyledSelect-cG3zul32.js","/assets/Targets-DDKVHWbh.js","/assets/Tasks-DoH2Lg7A.js","/assets/TimeField-Cg8MCma1.js","/assets/TimeWheelPicker-B6ZKWU9Y.js","/assets/Toast-B8flxr27.js","/assets/Tooltip-CkRG81mU.js","/assets/TrendChart-0xznpkpp.js","/assets/TripleSpeedometer-CARHQlhG.js","/assets/Trudoyomkost-DmxWXY80.js","/assets/UsersActivity-BW9bmsRM.js","/assets/WatchProgress-wvK_UqG_.js","/assets/WebLogin-Cc_GkCuw.js","/assets/WorkerConcerns-CDAwa2I3.js","/assets/Workers-CFDIIoJY.js","/assets/Zagruzka-WN9cGrw0.js","/assets/ZagruzkaCell-Canr19Ah.js","/assets/alarm-clock-DqBnqdWV.js","/assets/api-D9h83rzb.js","/assets/archive-GwwLwRuz.js","/assets/archive-restore-DPnnUMy5.js","/assets/arrow-down-B9amyzDW.js","/assets/arrow-left-D3Rthc7i.js","/assets/arrow-left-right-B8u2h6zx.js","/assets/arrow-right-BtujBX7m.js","/assets/arrow-up-DgpyIsf5.js","/assets/arrow-up-right-FdyUCo4X.js","/assets/award-BbCEhRtJ.js","/assets/ban-GFc9TB9W.js","/assets/bot-INLXZCtH.js","/assets/boxes-BjrDxwDh.js","/assets/brigadirFilters-BaIsLPGS.js","/assets/broadcastTree-D9ftX1Yh.js","/assets/building-2-xHrgJbgm.js","/assets/calendar-DpGKjJYt.js","/assets/calendar-clock-CFzAW6_B.js","/assets/calendar-days-C3eJzq2A.js","/assets/calendar-range-CGP8xKxs.js","/assets/camera-BN5udRGm.js","/assets/categories-fyxlwDdP.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BRroyNac.js","/assets/chart-line-BPJvU9uY.js","/assets/chart-pie-CAYNBi5N.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-Cc3NLtI4.js","/assets/check-DEBjJs_j.js","/assets/check-check-3pJaD4O-.js","/assets/chevron-left-qI1f1F37.js","/assets/chevrons-up-down-rSBLkG0c.js","/assets/circle-dashed-CmvMbHPe.js","/assets/circle-dot-CTJo0ioF.js","/assets/circle-minus-DC2suIzy.js","/assets/circle-slash-CFFH5q2S.js","/assets/circle-user-round-D3Ts_le6.js","/assets/coins-huo8Dugj.js","/assets/compass-9Vp_4jy7.js","/assets/concernCategories-B6EKqqj6.js","/assets/copy-QzqXhyh1.js","/assets/corner-down-right-I2GYkTwt.js","/assets/createLucideIcon-Cmr-Ps8r.js","/assets/exportXlsx-nacXw80W.js","/assets/external-link-BMk5NCJ7.js","/assets/file-clock-D0alh0ea.js","/assets/file-spreadsheet-BwfCAmqb.js","/assets/file-text-yuE0EN-M.js","/assets/flag-BSJ_VGKx.js","/assets/flame-CS9SXRQA.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Bfd97f-x.js","/assets/funnel-Cw91NV93.js","/assets/hash-DLfmiRrD.js","/assets/history-BWmNH_oZ.js","/assets/hourglass-fQ1rRP4t.js","/assets/image-COix-h11.js","/assets/image-off-BLgt9VvY.js","/assets/index-CzfrX78-.js","/assets/index-D9bk6tfm.css","/assets/keyboard-Dw2ztZn4.js","/assets/languages-BvVopgDG.js","/assets/layers-rv1B3u1e.js","/assets/leaderReason-QQ3owExL.js","/assets/lightbulb-qks9D4g3.js","/assets/link-2-BZU87J7e.js","/assets/list-checks-gE0hRGbN.js","/assets/list-ordered-BEj20-YM.js","/assets/lock-open-DJPO0eNS.js","/assets/log-in-Dw4LoKzO.js","/assets/message-square-BiaNOYd2.js","/assets/minimize-2-piexJY9k.js","/assets/minus-CgG3zMNI.js","/assets/paperclip-CNCi2-Sg.js","/assets/pencil-CgDYuFcs.js","/assets/pencil-line-DerRoq4V.js","/assets/personName-B4KId4zS.js","/assets/pin-CsMIsYIN.js","/assets/play-D8PeQTQ_.js","/assets/prop-types-BxrV5L_D.js","/assets/radio-Dkyl0CQG.js","/assets/react-apexcharts.esm-WKzXZIBf.js","/assets/refresh-cw-wdtAD5PF.js","/assets/repeat-CxqDx-LH.js","/assets/rotate-ccw-BI6kzKSa.js","/assets/rotate-cw-CxPzNLyr.js","/assets/save-CGlrP_1g.js","/assets/scale-N8xqTBEH.js","/assets/scroll-text-BHUmCDas.js","/assets/search-x-DZVU5xze.js","/assets/segments-C36QzA80.js","/assets/send-0TrwdC3W.js","/assets/settings-2-8We2hdn9.js","/assets/shield-D-wobOaW.js","/assets/shield-alert-rrzZ32Mf.js","/assets/shield-check-9WMGfh62.js","/assets/shield-question-mark-DDpt_TWq.js","/assets/siren-vmvw9akf.js","/assets/smartphone-D3B4JPDu.js","/assets/snowflake-CSufT1iD.js","/assets/square-DHGu427P.js","/assets/square-check-big-DvtMUd7Z.js","/assets/star-WrekW5Tx.js","/assets/statusBands-B1bnaOqb.js","/assets/table-2-B3tm6X3y.js","/assets/tag-H0ekSjbF.js","/assets/trash-2-Chwxp-nC.js","/assets/trending-down-DpJ1GwCF.js","/assets/trending-up-CoBI-EcA.js","/assets/undo-2-fOo8sYTS.js","/assets/useChartTheme-Dsq7iv-t.js","/assets/useElementWidth-H4twGz4C.js","/assets/useIsMobile-DrpccADk.js","/assets/useMutation-DpZblYLv.js","/assets/useStatusBands-C8ztlOtG.js","/assets/user-check-CY9s__eS.js","/assets/user-cog-BuDMgffk.js","/assets/user-minus-nHJ6BXP8.js","/assets/users-Br6VkoVk.js","/assets/verifyState-C0quzfLG.js","/assets/video-DfyiDAN4.js","/assets/warehouse-Dtrq8Cz4.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
