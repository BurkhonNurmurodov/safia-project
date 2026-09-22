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

const BUILD = "2026-09-22T11:15:50.385Z";
const PRECACHE = ["/","/assets/AdminPanel-C3uiiBrS.js","/assets/AnalysisBoard-CeEhY-_L.js","/assets/Arc-D9-tXrHw.js","/assets/AttendanceModal-BOClvkZD.js","/assets/BrigadirProfile-C4v8ltus.js","/assets/BroadcastReceivers-CZ3Ir9eG.js","/assets/BroadcastRecord-Cuvpv4Me.js","/assets/CatLockNotice-BpJB7nPs.js","/assets/CategoryLegendModal-C__BP9A6.js","/assets/CellConcerns-BvNrNLG9.js","/assets/CellDetails-Do9UERVE.js","/assets/CellFormModal-CnEKme1F.js","/assets/CellLink-BD_ncbdc.js","/assets/Cells-CHK5IUhe.js","/assets/ColumnFilter-BPPBKF8K.js","/assets/ColumnsPicker-Dp4-HP4C.js","/assets/CommentsModal-DK5Vxhr4.js","/assets/ComparisonTable-B0aPqBmc.js","/assets/Concerns-Bi4zPm__.js","/assets/ConfirmDialog-DKHI0XFZ.js","/assets/Daily-CvyGPlbM.js","/assets/DataTable-DnriocD9.js","/assets/DateRangePicker-CKR4Gv-Z.js","/assets/DayReportView-DXrjYZ3z.js","/assets/DayStepper-B9RkR8hN.js","/assets/DifferenceBreakdown-BKYbYM5c.js","/assets/Downtime-CsnJ_nqS.js","/assets/Education-CBuDOKhN.js","/assets/EducationLesson-B_ay9b18.js","/assets/EmptyState-CG6EeiCx.js","/assets/FactorySelect-hH5rLyqh.js","/assets/FormField-3iYUUmwN.js","/assets/Gamification-BhrrPApr.js","/assets/GroupBadge-BAfJf2IL.js","/assets/HeatmapChart-Ds238PIE.js","/assets/IdleCell-CpWNf5j0.js","/assets/KPICard-ClvyrGlF.js","/assets/Kaizen-LSyC1-vC.js","/assets/KpiDeltaCard-D7MtCQU0.js","/assets/LangTextInput-BnZ16k7C.js","/assets/Layout-P2xdB8MT.js","/assets/LeaderDayReport-BGrrs3-z.js","/assets/LeaderUnitReport-DY32LNUL.js","/assets/Leaderboard-CVEyOLoi.js","/assets/Leaders-DBumzUFp.js","/assets/LiveOverview-D1Lc-uAD.js","/assets/Login-6-XXuZuE.js","/assets/NotFound-Do2nJBsS.js","/assets/Overview-DExQacXR.js","/assets/Pagination-CIB4pC90.js","/assets/PerenaladkaFactTable-CNiNkcd3.js","/assets/PlanFulfillment-Kx3Jig-e.js","/assets/Production-C3yUwF87.js","/assets/Profile-C0Y_Em6S.js","/assets/ProofCamera-F3fXWro_.js","/assets/Quality-DCSq2nZo.js","/assets/RichTextEditor-Bn1tzAio.js","/assets/SearchInput-D3ib8cRZ.js","/assets/SeasonalityHeatmap-CwKDHsvg.js","/assets/SegmentedToggle-CJIzVk_Q.js","/assets/SetupTimes-DTCZFgsg.js","/assets/ShiftDaily-shPzGRHA.js","/assets/Skeleton-DutSE6GJ.js","/assets/Staff-BqV9MYlG.js","/assets/StatusBadge-kahf_Uk5.js","/assets/StyledSelect-DyP3zFrk.js","/assets/Targets-621rV75t.js","/assets/Tasks-BpiBbvVG.js","/assets/TimeField-JR3bll6U.js","/assets/TimeWheelPicker-rQ4Bf3hk.js","/assets/Toast-D_PLfbUx.js","/assets/Tooltip-C5NfwVLX.js","/assets/TrendChart-DQpDBM5P.js","/assets/TripleSpeedometer-Df2yNgdo.js","/assets/Trudoyomkost-BIxH6IZx.js","/assets/UsersActivity-Nhrz8Kyp.js","/assets/WatchProgress-DCXuW2gv.js","/assets/WebLogin-BnxzwMfH.js","/assets/WorkerConcerns-Da8WybPv.js","/assets/Workers-C2HPA-Ww.js","/assets/Zagruzka-DumBkv_K.js","/assets/ZagruzkaCell-DI_-rLgv.js","/assets/alarm-clock-C6La83n4.js","/assets/api-B6mv0RWo.js","/assets/archive-l4pgsNxQ.js","/assets/archive-restore-sxnoT7HY.js","/assets/arrow-down-Dx52-8IZ.js","/assets/arrow-left-Cs1Qg7O2.js","/assets/arrow-left-right-B2Cwh3yV.js","/assets/arrow-right-DdyGvE9p.js","/assets/arrow-up-B9DfLHs0.js","/assets/arrow-up-right-WT2h6IYr.js","/assets/award-BQ0LSW13.js","/assets/ban-B0ckLy7M.js","/assets/bot-CMdS4qGf.js","/assets/boxes-D7g0iixC.js","/assets/brigadirFilters-Df32m4Mt.js","/assets/broadcastTree-Cz-7b4gR.js","/assets/building-2-asmVirXe.js","/assets/calendar-HO8PjPLB.js","/assets/calendar-clock-DAb3Itnn.js","/assets/calendar-days-CzxFtQ-5.js","/assets/calendar-range-zSX5VicD.js","/assets/camera--JjFqUq3.js","/assets/categories-ByJkVCYM.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B9Ssc0yM.js","/assets/chart-line-CO4fTks0.js","/assets/chart-pie-Bg5r_QSC.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-DXjgIPzm.js","/assets/check-C2PHDeDk.js","/assets/check-check-Dp1VD3dU.js","/assets/chevron-left-Cs3fzzsW.js","/assets/chevrons-up-down-CZYmaN6V.js","/assets/circle-dashed-BVXQ01oa.js","/assets/circle-dot-C0Lb_Nxk.js","/assets/circle-minus-Brlawx2R.js","/assets/circle-slash-DUSetSD6.js","/assets/circle-user-round-DqmnGaAp.js","/assets/coins-Nb-duvYa.js","/assets/compass-D3t2xHSq.js","/assets/concernCategories-ClGL0c3x.js","/assets/copy-BuEIN6jT.js","/assets/corner-down-right-C-aLXleP.js","/assets/createLucideIcon-BdO0-lP6.js","/assets/exportXlsx-CZm577eb.js","/assets/external-link-3GJNlPyX.js","/assets/file-clock-CG6o6Y8l.js","/assets/file-spreadsheet-Cd0gOU8s.js","/assets/file-text-Bov4j0Ac.js","/assets/flag-CjPu8qrl.js","/assets/flame-B7owpaqv.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CahTXYJl.js","/assets/funnel-Ctb1b2du.js","/assets/hash-5erP7jh5.js","/assets/history-BQH0kZet.js","/assets/hourglass-BVwI6srn.js","/assets/image-EmlzkOBu.js","/assets/image-off-DpiQSGlQ.js","/assets/index-BXqTV2jf.css","/assets/index-HoboCbdf.js","/assets/keyboard-B2r2qtgR.js","/assets/languages-Bodjn9o3.js","/assets/layers-DcPamQ8M.js","/assets/leaderReason-CUrgKDIA.js","/assets/lightbulb-DpsR9Gag.js","/assets/link-2-DC07GXBA.js","/assets/list-checks-M_3FW8-d.js","/assets/list-ordered-aQWGqleI.js","/assets/lock-open-D0OlVb_1.js","/assets/log-in-DEECVbf_.js","/assets/message-square-CtQG9TEI.js","/assets/minimize-2-DWBE3lkx.js","/assets/minus-Di_o1t9q.js","/assets/paperclip-Qm7NfsUO.js","/assets/pencil-C7qtQ3uZ.js","/assets/pencil-line-DKJXlIto.js","/assets/personName-B4KId4zS.js","/assets/pin-ovyldu3z.js","/assets/play-hEmqQWon.js","/assets/prop-types-BgCahtJl.js","/assets/radio-BX1nWb2c.js","/assets/react-apexcharts.esm-BnOmo3aD.js","/assets/refresh-cw-B3t0Gmfw.js","/assets/repeat-DCJq2mzL.js","/assets/rotate-ccw-b2rkoP_i.js","/assets/rotate-cw-nHZwzJ4-.js","/assets/save-DPe7qGPS.js","/assets/scale-6iQ7wEXh.js","/assets/scroll-text-AtmG5Bji.js","/assets/search-x-RhdOGeE2.js","/assets/segments-Br3R2VNo.js","/assets/send-rd86RVFH.js","/assets/settings-2-BwDIoLxr.js","/assets/shield-DRg96nCn.js","/assets/shield-alert-DiRPRTBX.js","/assets/shield-check-DH_s2dO6.js","/assets/shield-question-mark-B7ujChyx.js","/assets/siren-mNfy9gVB.js","/assets/smartphone-CGdtEXF6.js","/assets/snowflake-B-kVph5w.js","/assets/square-DvSGwaFL.js","/assets/square-check-big-Biiiki_s.js","/assets/star-Bw9O0G54.js","/assets/statusBands-d-B8FO90.js","/assets/table-2-Ndn9-4vq.js","/assets/tag-By9ZfnDi.js","/assets/trash-2-DzeVXbfh.js","/assets/trending-down-BeFtOrw5.js","/assets/trending-up-BYmB_Zfq.js","/assets/undo-2-Cc_6iYiH.js","/assets/useChartTheme-MPgIO6Gq.js","/assets/useElementWidth-DmXWB807.js","/assets/useIsMobile-BAtagyOI.js","/assets/useMutation-7PJ-A4Rb.js","/assets/useStatusBands-E3j3U20B.js","/assets/user-check-D1a4QOBp.js","/assets/user-cog-LkOi4iJF.js","/assets/user-minus-BTIQuqtO.js","/assets/users-DOH4LK3z.js","/assets/verifyState-BvsAVQQh.js","/assets/video-DybsDOqw.js","/assets/warehouse-D0HEzmzU.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
