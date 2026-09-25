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

const BUILD = "2026-09-25T05:03:19.385Z";
const PRECACHE = ["/","/assets/AdminPanel-BW5XKVNF.js","/assets/AnalysisBoard-Do6E5z_q.js","/assets/Arc-BrrgZlNg.js","/assets/ArcAnalysis-DQPEwnPM.js","/assets/ArcLegacy-B26gBYT8.js","/assets/AttendanceModal-Mj8xbR2p.js","/assets/BrigadirProfile-B2t0qalK.js","/assets/BroadcastReceivers-B0MfQl7L.js","/assets/BroadcastRecord-nshXyI8H.js","/assets/CatLockNotice-Cz_1diHp.js","/assets/CategoryLegendModal-BOWjqsCJ.js","/assets/CellConcerns-DY62dNRk.js","/assets/CellDetails-DpMIIYy0.js","/assets/CellFormModal-DG6TwOdX.js","/assets/CellLink-hNAbNVPd.js","/assets/Cells-D71Ek7mw.js","/assets/ColumnFilter-CCIJCEDG.js","/assets/ColumnsPicker-C2OW4nlE.js","/assets/CommentsModal-C0S5OjIl.js","/assets/ComparisonTable-Cg6NHYjG.js","/assets/Concerns-CAkv8qC0.js","/assets/ConfirmDialog-BC5KgtPk.js","/assets/Daily-Cja0g-2c.js","/assets/DataTable-D96Trhql.js","/assets/DateRangePicker-D31ZsfQJ.js","/assets/DayReportView-de6rFYs7.js","/assets/DayStepper-BxdvebPf.js","/assets/DifferenceBreakdown-BrW-dHAh.js","/assets/Downtime-QoJph6Tn.js","/assets/Education-DkPdnTii.js","/assets/EducationLesson-CMd5bW41.js","/assets/EmptyState-q4ojU466.js","/assets/Exam-B3JVpMQ-.js","/assets/FactorySelect-DLosG1GL.js","/assets/Gamification-LBqjd-Zs.js","/assets/GroupBadge-C6hA6B0-.js","/assets/HeatmapChart-BJDSJh8t.js","/assets/IdleCell-AJDZE-nP.js","/assets/KPICard-C2jhXk4f.js","/assets/Kaizen-Bn2Lj3bE.js","/assets/KpiDeltaCard-CVIzc9EY.js","/assets/LangTextInput-DtWiL1ml.js","/assets/Layout-CPTW5TC8.js","/assets/LeaderDayReport-CXaZLRGs.js","/assets/LeaderUnitReport-D7X4qV-R.js","/assets/Leaderboard-CB_imR2R.js","/assets/Leaders-B3EWewFA.js","/assets/LiveOverview-w4bXSSra.js","/assets/Login-BZm2V7TA.js","/assets/NotFound-aP3MoqLt.js","/assets/Overview-C7CzyaIy.js","/assets/Pagination-BVb0MWma.js","/assets/PerenaladkaFactTable-BecVPsir.js","/assets/PlanFulfillment-BeV0a2SF.js","/assets/Production-AFgu0qzm.js","/assets/Profile-CCKLDDC1.js","/assets/ProofCamera-Bet5ILjK.js","/assets/Quality-B3hMai81.js","/assets/RequestStateChip-DmiSoSBY.js","/assets/RichTextEditor-DQnDQ1eR.js","/assets/SearchInput-nWKiHJPm.js","/assets/SeasonalityHeatmap-5KXifUfQ.js","/assets/SegmentedToggle-DFbL1CXs.js","/assets/SetupTimes-j-ZXwoA9.js","/assets/ShiftDaily-CL0hAFrq.js","/assets/Staff-DP8lSFmZ.js","/assets/StatusBadge-D4Halc6o.js","/assets/Targets-rHKZ0X4f.js","/assets/Tasks-BAlfeNOT.js","/assets/TimeWheelPicker-dxm6kJl5.js","/assets/Tooltip-BCavWdGY.js","/assets/TrendChart-CeVAosLH.js","/assets/TripleSpeedometer-B_677hmo.js","/assets/Trudoyomkost-BT2Kky1y.js","/assets/UsersActivity-2zoyTXaG.js","/assets/WatchProgress-CF4Kule5.js","/assets/WebLogin-BPUXenFR.js","/assets/WorkerConcerns-CQ5n4Dby.js","/assets/Workers-DCgt2eGu.js","/assets/Zagruzka-DX8z_3Hy.js","/assets/ZagruzkaCell-99HFJEWJ.js","/assets/alarm-clock-Cf8OZG1y.js","/assets/api-D77UBi2G.js","/assets/archive-restore-CVT3PtQR.js","/assets/archive-yXw_us86.js","/assets/arrow-down-C4B28Pe3.js","/assets/arrow-left-Dc7aQBoH.js","/assets/arrow-left-right-svjbDGJL.js","/assets/arrow-up-Bj4SPBan.js","/assets/arrow-up-right-CC31T7x0.js","/assets/award-CZRnCWVe.js","/assets/ban-DHbUggeQ.js","/assets/bot-CfD6Tlna.js","/assets/boxes-CgKdHLYa.js","/assets/brigadirFilters-CsGnZHen.js","/assets/broadcastTree-C98bMJA2.js","/assets/building-2-CZN02yRO.js","/assets/calendar-K5O1Igr9.js","/assets/calendar-clock-CJYePz1l.js","/assets/calendar-days-BtZOKMG9.js","/assets/calendar-range-DYCDAOs4.js","/assets/camera-mb1dcNPr.js","/assets/categories-DSSI1CN6.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C46-uHvY.js","/assets/chart-line-CrQ9Fq1O.js","/assets/chart-pie-B4zHnRv5.js","/assets/chartRange-CSG97hvF.js","/assets/check-check-KMohJkAh.js","/assets/chevron-left-CQf49crC.js","/assets/chevrons-up-down-CKbRtrC4.js","/assets/circle-check-big-BbKJm70i.js","/assets/circle-dashed-D8nrnlIu.js","/assets/circle-dot-gzHWOe5S.js","/assets/circle-minus-CDit61xF.js","/assets/circle-slash-CGlhsrGb.js","/assets/circle-user-round-CYgOmxFI.js","/assets/coins-p_3SAfmr.js","/assets/compass-CUzDHasT.js","/assets/concernCategories-BHvKRbfB.js","/assets/copy-DmF0Z1RT.js","/assets/corner-down-right-BNBmdlVg.js","/assets/createLucideIcon-C_cEQHAa.js","/assets/exportXlsx-tl1wAgtf.js","/assets/external-link-T26bk8Wl.js","/assets/file-clock-DoCKgQ1X.js","/assets/file-spreadsheet-DGiV-n8D.js","/assets/file-text-C_pJ9yID.js","/assets/flag-D6o0cCGt.js","/assets/flame-BkZ3Qk-c.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BwpNnoJW.js","/assets/hash-3kqc-2vI.js","/assets/history-esH2rUt-.js","/assets/hourglass-CBfxkWE5.js","/assets/image-D-wIB4JK.js","/assets/image-off-CK_ugXO8.js","/assets/index-BMCZProW.css","/assets/index-vSdU2pV-.js","/assets/keyboard-ChfaAYOb.js","/assets/languages-tRhY1qx4.js","/assets/layers-CtgOJ-Lt.js","/assets/leaderReason-DVJCmCKv.js","/assets/lightbulb-gm-Cncsa.js","/assets/link-2-CjHtLIjY.js","/assets/list-checks-DAEGleLX.js","/assets/list-ordered-Ox2lDiSv.js","/assets/lock-open-f_ybbzKe.js","/assets/log-in-BN1luEiw.js","/assets/message-square-CJ7Wtq0z.js","/assets/minimize-2-BlEYdDBs.js","/assets/paperclip-xIp6mIFl.js","/assets/pencil-BN67-HNm.js","/assets/personName-B4KId4zS.js","/assets/pin-Byb-cWAa.js","/assets/play-rKidDSvb.js","/assets/presentation-OFFAA7OO.js","/assets/prop-types-V2aUEVTx.js","/assets/radio-CjO7XftQ.js","/assets/react-apexcharts.esm-Cwd1d1Y1.js","/assets/repeat-0s1nMHBI.js","/assets/rotate-ccw-DQMW2y3e.js","/assets/rotate-cw-DPDn0Clq.js","/assets/save-BYmlKF0_.js","/assets/scale-CxASIKem.js","/assets/scroll-text-CsgJsTlk.js","/assets/search-x-D9TQtBTN.js","/assets/segments-CtY8YsKE.js","/assets/send-CzH3sY_k.js","/assets/settings-2-Bq1nSPO-.js","/assets/shield-CVBnCsgn.js","/assets/shield-alert-WGuBKVkg.js","/assets/shield-check-CPIHZwBq.js","/assets/shield-question-mark-BDja-Aek.js","/assets/siren-UAfJP5_u.js","/assets/smartphone-CJNNwolM.js","/assets/snowflake-CnnjrFUX.js","/assets/square-CnpIScNz.js","/assets/square-check-big-BcHmS2FX.js","/assets/star-CBS5dmGM.js","/assets/statusBands-DV8bPLrF.js","/assets/table-2-Bmv4yK2c.js","/assets/tag-ZG7FjlFe.js","/assets/trending-down-DVxd70_R.js","/assets/trending-up-CiBri55k.js","/assets/triangle-alert-CsWcBV_m.js","/assets/undo-2-BspQQEug.js","/assets/useChartTheme-BMoIsB4n.js","/assets/useElementWidth-BXEFJ-Ng.js","/assets/useIsMobile-BHWHOW1m.js","/assets/useMutation-CQbJqVhU.js","/assets/useStatusBands-C4BkNuaS.js","/assets/user-DJU4VmUo.js","/assets/user-check-BosuUIFT.js","/assets/user-cog-BLdVKHAA.js","/assets/user-minus-CIPDafpD.js","/assets/users-NpaCzK7b.js","/assets/verifyState-DaUUDwgI.js","/assets/video-WPdxSFJ_.js","/assets/warehouse-DJ_6z2h1.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
