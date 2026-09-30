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

const BUILD = "2026-09-30T06:05:40.685Z";
const PRECACHE = ["/","/assets/AdminPanel-Y9zgul2s.js","/assets/AnalysisBoard-yfTgZnco.js","/assets/Arc-LeBHq_9z.js","/assets/ArcLegacy-D5LS7vi2.js","/assets/AttendanceModal-D2LUYWBG.js","/assets/BrigadirProfile-BGg-cYhZ.js","/assets/BroadcastReceivers-CAJSXJxi.js","/assets/BroadcastRecord-Bba4vuHZ.js","/assets/CatLockNotice-DfRJfkri.js","/assets/CategoryLegendModal--cc-uF3A.js","/assets/CellConcerns-BTvcp1Rw.js","/assets/CellDetails-C3PHJHfX.js","/assets/CellFormModal-pY7Xe-fe.js","/assets/CellLink-D6O1rrqA.js","/assets/Cells-16agMAO1.js","/assets/ColumnFilter-BdRzpgeQ.js","/assets/ColumnsPicker-DfFjmAD8.js","/assets/CommentsModal-Ba3xO94f.js","/assets/ComparisonTable-CFLSsGiF.js","/assets/Concerns-DiHGZJVn.js","/assets/ConfirmDialog-BgSCKLFF.js","/assets/Daily-c2xAZ2Ym.js","/assets/DataTable-zbPLTMGi.js","/assets/DateRangePicker-_fn7TfIU.js","/assets/DayReportView-BAO-uwE8.js","/assets/DayStepper-C0g5cfKs.js","/assets/DifferenceBreakdown-OsegN4an.js","/assets/Downtime-Ck_p_dW_.js","/assets/Education-D1gk0Un7.js","/assets/EducationLesson-CMphQRXC.js","/assets/EmptyState-Bhy4CsTK.js","/assets/Exam-Dz5AUpKt.js","/assets/FactorySelect-DBEllwo5.js","/assets/Gamification-CJuIdb51.js","/assets/GroupBadge-B7Dj-QQQ.js","/assets/HeatmapChart-BvGRrQb1.js","/assets/IdleCell-B9kDMiio.js","/assets/KPICard-DXYe_e9T.js","/assets/Kaizen-DH-nHS8G.js","/assets/Kelish-D6kXjpnm.js","/assets/KpiDeltaCard-Dkwy4j4m.js","/assets/LangTextInput-DiXX9222.js","/assets/Layout-ZgJ6H9Ma.js","/assets/LeaderAppeal-DKRgfGQp.js","/assets/LeaderDayReport-B_pPFjBx.js","/assets/LeaderUnitReport-BNexhkJc.js","/assets/Leaderboard-B60vbmis.js","/assets/Leaders-BI6Lt1q4.js","/assets/Lightbox-DhqUHvi2.js","/assets/LiveOverview-CgwzSmfD.js","/assets/Login-D-9dNIvs.js","/assets/NotFound-USrA3-gm.js","/assets/Overview-Bkn0_d8b.js","/assets/Pagination-BO28fMDR.js","/assets/PerenaladkaFactTable-BF6WmJI8.js","/assets/PlanFulfillment-BO5e0Rtf.js","/assets/Production-Bl3i6M9c.js","/assets/Profile-Cv8wUdGs.js","/assets/ProofCamera-BXNORVNp.js","/assets/ProofPhoto-CV9W_vZu.js","/assets/Quality-CyB9KNEJ.js","/assets/RequestStateChip-DfWIWN1e.js","/assets/RichTextEditor-CghcZh5S.js","/assets/SaveState-DHScidMr.js","/assets/SearchInput-r3yPM6rw.js","/assets/SeasonalityHeatmap-BOXFQUIF.js","/assets/SegmentedToggle-BiWomSUe.js","/assets/SetupTimes-BFVKYYmR.js","/assets/ShiftDaily-BbwkB5kR.js","/assets/Staff-Cz9zMrRS.js","/assets/StatusBadge-CLogMJ2G.js","/assets/TargetGoal-Bi_1iyqr.js","/assets/Targets-Bz7ead-8.js","/assets/Tasks-CZ5j_b4h.js","/assets/TimeWheelPicker-DYiEeKSN.js","/assets/Tooltip-DhhjyP-s.js","/assets/TrendChart-SPRre9Pt.js","/assets/TripleSpeedometer-ClX0HRAp.js","/assets/Trudoyomkost-yRSN09N7.js","/assets/UploadDropzone-B0EW5XOz.js","/assets/UsersActivity-BXtzdRpl.js","/assets/VerdictBlock-BGepmaBB.js","/assets/WatchProgress-C7YZvRsy.js","/assets/WebLogin-BfXk04NL.js","/assets/WorkerConcerns-g9ynBTfy.js","/assets/Workers-BjEd2XMC.js","/assets/Zagruzka-Gc_YCfJi.js","/assets/ZagruzkaCell-DQTHhcSX.js","/assets/api-D4kYESer.js","/assets/archive-Dedpft7T.js","/assets/archive-restore-CrKlCd6T.js","/assets/arrow-down-COKFTfKK.js","/assets/arrow-left-ClpjRpnz.js","/assets/arrow-left-right-Bw4mnahn.js","/assets/arrow-up-CWOD2PZE.js","/assets/arrow-up-narrow-wide-Cufb1R37.js","/assets/arrow-up-right-Cm65iO_l.js","/assets/award-lG1o8bk1.js","/assets/ban-LpGPOawd.js","/assets/bot-CgZjPaRF.js","/assets/boxes-Dk72ny5A.js","/assets/brigadirFilters-BmR5wp5G.js","/assets/broadcastTree-B_QLbInX.js","/assets/building-2-BZbmMU5K.js","/assets/calendar-BJpycJ8X.js","/assets/calendar-clock-DNAOETKQ.js","/assets/calendar-days-DvqxMk00.js","/assets/calendar-range-BC_WYmcy.js","/assets/camera-CcVt6C6y.js","/assets/categories-DxgWx05l.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BDYL03aZ.js","/assets/chart-line-rjO5wRcI.js","/assets/chart-pie-BjodriJo.js","/assets/chartRange-CsUFstyQ.js","/assets/chevron-left-DBWXKVII.js","/assets/chevrons-up-down-BDmihXJj.js","/assets/circle-CwJo8GgM.js","/assets/circle-check-big-BYXza_rw.js","/assets/circle-dot-Nbx32Kzs.js","/assets/circle-minus-DqO9qbQL.js","/assets/circle-slash-COhqzutd.js","/assets/circle-user-round-CLgPm5mO.js","/assets/cloud-off-Bxe-sDdI.js","/assets/cloud-upload-BOBlPMf-.js","/assets/compass-Cwq1143F.js","/assets/concernCategories-B20B7pau.js","/assets/copy-DHHKgQXI.js","/assets/corner-down-right-CSSLbwgl.js","/assets/createLucideIcon-B2QQoFkp.js","/assets/es-CTblZVnB.js","/assets/exportXlsx-G3PTjnmR.js","/assets/external-link-DyoqJNAs.js","/assets/file-clock-BDnlNESA.js","/assets/file-exclamation-point-BypR-qpw.js","/assets/file-spreadsheet-CuUiVeDW.js","/assets/file-text-BvE108Aq.js","/assets/flag-BwcpQ3h2.js","/assets/flame-CYLaIQdi.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-bmk-h17V.js","/assets/hash-y0LZpgzf.js","/assets/history-BmMZN4K0.js","/assets/hourglass-CIkxTZYH.js","/assets/image-Bi-a-0Kk.js","/assets/image-off-D22H6l7e.js","/assets/index-B8JHyLjE.css","/assets/index-CsWpwcUf.js","/assets/key-round-CeOMourH.js","/assets/keyboard-B4zD1-JG.js","/assets/languages-m20slG-s.js","/assets/layers-CclEtFdv.js","/assets/lightbulb-BUushX00.js","/assets/link-2-CyGNV0Cz.js","/assets/link-2-off-BY4ef67_.js","/assets/list-checks-BIhSnC5H.js","/assets/list-ordered-C_cGK2N7.js","/assets/list-tree-C12AIbkj.js","/assets/lock-open-Cc3n0tlA.js","/assets/log-in-DZIdVNXA.js","/assets/maximize-2-YCP1vKFa.js","/assets/message-square-Bi9MFRUh.js","/assets/minimize-2-CiLtm7ei.js","/assets/package-check-B_2iDmGh.js","/assets/paperclip-0wYohTC5.js","/assets/pencil-C--el4Lg.js","/assets/percent-DWW1MXE8.js","/assets/personName-CogOuS3K.js","/assets/pin-MuvMbVEw.js","/assets/pin-off-IIGSP-KN.js","/assets/play-C3py8lUR.js","/assets/presentation-EnWwLqVr.js","/assets/prop-types-DfB7Tdw9.js","/assets/radio-YIbwEE_W.js","/assets/react-apexcharts.esm-DvTX2CQn.js","/assets/repeat-BbA8r82l.js","/assets/rotate-ccw-BTKUZg5R.js","/assets/rotate-cw-6_XoR7qk.js","/assets/save-CQoFsQv2.js","/assets/scale-DgbGuiAz.js","/assets/scroll-text-BixVwO8P.js","/assets/search-x-DZuV1XDo.js","/assets/segments-aPyGh0gl.js","/assets/send-D8tHBU2f.js","/assets/settings-2-tLR1B7v5.js","/assets/shield-CMzC8pSY.js","/assets/shield-alert-NAcgmz45.js","/assets/shield-check-CM1eyM_j.js","/assets/shield-question-mark-CSWYiCPY.js","/assets/siren-B5puNFHk.js","/assets/snowflake-J4udkt-t.js","/assets/square-cM9HfPVg.js","/assets/square-check-big--rNNJitT.js","/assets/star-D7GwSibE.js","/assets/statusBands-CZBjq5c3.js","/assets/store-BNf_S1cY.js","/assets/table-2-mfeHWJ20.js","/assets/table-properties-CFxL95my.js","/assets/tag-CStAYIEw.js","/assets/timer-off-CixDb6GM.js","/assets/trending-down-BJCwmOXb.js","/assets/trending-up-BHA6I2pM.js","/assets/undo-2-Vgikac8I.js","/assets/useChartTheme-yoLa2h9e.js","/assets/useElementWidth-C0ieqPTm.js","/assets/useIsMobile-CVHBmDD8.js","/assets/useMutation-BOJ43FPe.js","/assets/useStatusBands-C52pp1CI.js","/assets/user-CBQq64VO.js","/assets/user-cog-B1n6V9FJ.js","/assets/user-minus-BZiGi_1v.js","/assets/users-DJPmvcPW.js","/assets/video-W--3qG2-.js","/assets/wallet-BrATDxp1.js","/assets/warehouse-u11TwRfD.js","/assets/zap-D_UZmHcY.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
