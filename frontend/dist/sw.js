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

const BUILD = "2026-09-28T11:17:22.957Z";
const PRECACHE = ["/","/assets/AdminPanel-Dv03U24b.js","/assets/AnalysisBoard-Dvst4Den.js","/assets/Arc-C2aTTB00.js","/assets/ArcLegacy-S09Avf4G.js","/assets/AttendanceModal-DsARULq8.js","/assets/BrigadirProfile-DWA6vn9n.js","/assets/BroadcastReceivers-X6iLcXsE.js","/assets/BroadcastRecord-C_8xAbAN.js","/assets/CatLockNotice-BAOFVQFd.js","/assets/CategoryLegendModal-uYn6CU2M.js","/assets/CellConcerns-DgAiaYup.js","/assets/CellDetails-CeKDjEli.js","/assets/CellFormModal-CyeHinGB.js","/assets/CellLink-DzYsZ5rL.js","/assets/Cells-hDGQZxa1.js","/assets/ColumnFilter-BPHHFUw5.js","/assets/ColumnsPicker-DwTF6EH-.js","/assets/CommentsModal-fUzMHRxe.js","/assets/ComparisonTable-ChwEpzvs.js","/assets/Concerns-D2U9CApV.js","/assets/ConfirmDialog-H1slwZ8d.js","/assets/Daily-ZZF_yPKi.js","/assets/DataTable-IF1rGtk5.js","/assets/DateRangePicker-BDbbs6se.js","/assets/DayReportView-D4y0f1Rg.js","/assets/DayStepper-C6L7ZLTH.js","/assets/DifferenceBreakdown-DrGSIOrX.js","/assets/Downtime-G4N91rzK.js","/assets/Education-QMrsLyFR.js","/assets/EducationLesson-ClAE1E9l.js","/assets/EmptyState-D3RDE-8W.js","/assets/Exam-BYzQGtDl.js","/assets/FactorySelect-BOZCdxD8.js","/assets/Gamification-CC2-lKQu.js","/assets/GroupBadge-BuLYm7ck.js","/assets/HeatmapChart-De3hG59o.js","/assets/IdleCell-C-Fet4ng.js","/assets/KPICard-CiIUdAan.js","/assets/Kaizen-Cf9wTIw1.js","/assets/KpiDeltaCard-DilVe7n7.js","/assets/LangTextInput-BXQT5ctt.js","/assets/Layout-Ca9elvmK.js","/assets/LeaderAppeal-CELVy3WU.js","/assets/LeaderDayReport-BtjbiccR.js","/assets/LeaderUnitReport-Bs6eC1mc.js","/assets/Leaderboard-BFroBnLM.js","/assets/Leaders-BiCMCZzP.js","/assets/Lightbox-0pDeqcuy.js","/assets/LiveOverview-C1zqPnWI.js","/assets/Login-CWMJabbs.js","/assets/NotFound-CyzH9-EJ.js","/assets/Overview-Cwp_TyOt.js","/assets/Pagination-BaThN-oS.js","/assets/PerenaladkaFactTable-DKVDC3fy.js","/assets/PlanFulfillment-DxmbX3iJ.js","/assets/Production-DNk0d9mb.js","/assets/Profile-BRdyHoOo.js","/assets/ProofCamera-DSg2HIJN.js","/assets/ProofPhoto-D4DIHBbq.js","/assets/Quality-Ot2STyAU.js","/assets/RequestStateChip-qYew7q-J.js","/assets/RichTextEditor-BHPISLJP.js","/assets/SaveState-CH8g389s.js","/assets/SearchInput-cuKk_5GD.js","/assets/SeasonalityHeatmap-CtlgtgDp.js","/assets/SegmentedToggle-CaqYo5X1.js","/assets/SetupTimes-Cy9CGneM.js","/assets/ShiftDaily-UrC3Dhim.js","/assets/Staff-BLxAqezj.js","/assets/StatusBadge-CHueuPEg.js","/assets/TargetGoal-Ddwa6OCm.js","/assets/Targets-DCQv2FRA.js","/assets/Tasks-DzksXP_M.js","/assets/TimeWheelPicker-xLTEya3e.js","/assets/Tooltip-BLMfuplA.js","/assets/TrendChart-DdrluHt7.js","/assets/TripleSpeedometer-DfYavWgV.js","/assets/Trudoyomkost-D8wfyplU.js","/assets/UsersActivity-CeOmK9y3.js","/assets/WatchProgress-fya_R_sw.js","/assets/WebLogin-CGpShPOh.js","/assets/WorkerConcerns-CROQfnOi.js","/assets/Workers-03zVtfrI.js","/assets/Zagruzka-Czhg2t4V.js","/assets/ZagruzkaCell-BZ7GIIYV.js","/assets/alarm-clock-DjxyuU2H.js","/assets/api-DqbL8YHy.js","/assets/archive-BJWsEcJJ.js","/assets/archive-restore-Dnu66ubd.js","/assets/arrow-down-Cu-czVqO.js","/assets/arrow-left-DGG67Rjz.js","/assets/arrow-left-right-DvcqvIxR.js","/assets/arrow-up-CWsQsmOr.js","/assets/arrow-up-right-BeSuR_kI.js","/assets/award-C6Vi5enp.js","/assets/ban-Liy2z3YK.js","/assets/bot-dlGpEeMl.js","/assets/boxes-DGCZKZE_.js","/assets/brigadirFilters-KHyIFHt1.js","/assets/broadcastTree-C_ABHz8J.js","/assets/building-2-Ie5bapKm.js","/assets/calendar-Mapcj91o.js","/assets/calendar-clock-Cma-RJDg.js","/assets/calendar-days-B38Do4R1.js","/assets/calendar-range-Dwgkt94F.js","/assets/camera-BZFOE8oO.js","/assets/categories-CdjeTxw8.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cx95S-QG.js","/assets/chart-line-Rn4YQDye.js","/assets/chart-pie-CaMKzxZj.js","/assets/chartRange-Da6L_sbm.js","/assets/chevron-left-_0VYOxyW.js","/assets/chevrons-up-down-DTr2mTep.js","/assets/circle-check-big-BpyWcEhu.js","/assets/circle-dot-BEu67Dz_.js","/assets/circle-minus-BcER-Z5u.js","/assets/circle-slash-DKmbdeXL.js","/assets/circle-user-round-DIaexMFB.js","/assets/cloud-off-C3lphiL2.js","/assets/cloud-upload-CCO3ZNSr.js","/assets/compass-UCA1pOqc.js","/assets/concernCategories-B1zI7dlh.js","/assets/copy-CkBliU7z.js","/assets/corner-down-right-DAA9brE0.js","/assets/createLucideIcon-0Su_p1yT.js","/assets/es-BVHLbCAc.js","/assets/exportXlsx-mBnY0zkR.js","/assets/external-link-0PISeVQ8.js","/assets/file-clock-BJYgXVJV.js","/assets/file-exclamation-point-BOPR92sH.js","/assets/file-spreadsheet-BQZVE__J.js","/assets/file-text-BjZ4NV0K.js","/assets/flag-BvKJ63we.js","/assets/flame-CIpr-Z7J.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DTPTELA_.js","/assets/hash-Bx9LeUEO.js","/assets/history-Y9D5kRag.js","/assets/hourglass-DRUS_vdG.js","/assets/image-C9qz18cZ.js","/assets/image-off-CFReeKfR.js","/assets/index-KDtoT_vY.js","/assets/index-TBzEnSGJ.css","/assets/key-round-DXFrbm16.js","/assets/keyboard-C491NKKa.js","/assets/languages-DfukwqPZ.js","/assets/layers-Br8N61im.js","/assets/leaderReason-x8zv5FI-.js","/assets/lightbulb-DdqIThJ1.js","/assets/link-2-BDLQI5lN.js","/assets/list-checks-Cf33rdCO.js","/assets/list-ordered-BqiZpBbn.js","/assets/list-tree-CQyGLlcc.js","/assets/lock-open-D7TejBIO.js","/assets/log-in-ciZI7FFS.js","/assets/message-square-BtLfmb7z.js","/assets/minimize-2-CaHbowHO.js","/assets/package-check-CnL_iQOe.js","/assets/paperclip-CbeUONKu.js","/assets/pencil-B_0-ZLy2.js","/assets/personName-B4KId4zS.js","/assets/pin-DN7wxOPV.js","/assets/pin-off-CU5EBeMJ.js","/assets/play-C35PwQmn.js","/assets/presentation-hXZNaDoU.js","/assets/prop-types-SUkkQZ_y.js","/assets/radio-ClqrGGGA.js","/assets/react-apexcharts.esm-DXY-YHQi.js","/assets/repeat-DoEHFNi1.js","/assets/rotate-ccw-DFVEsOMG.js","/assets/rotate-cw-DbKombXG.js","/assets/save-Csewe8tX.js","/assets/scale-BLC_eN6Y.js","/assets/scroll-text-Brw9cU2J.js","/assets/search-x-D6VGxsxN.js","/assets/segments-CFuCVwZt.js","/assets/send-DIr2naYn.js","/assets/settings-2-BhuIWGat.js","/assets/shield-BEomOtey.js","/assets/shield-alert-CopkjiOU.js","/assets/shield-check-CZB-bchn.js","/assets/shield-question-mark-AIeWYO2j.js","/assets/siren-C1aGoiUU.js","/assets/smartphone-DVJvVYig.js","/assets/snowflake-D_UrcJAa.js","/assets/square-check-big-BRBwTrRq.js","/assets/square-dxugO54M.js","/assets/star-Dq0yppnj.js","/assets/statusBands-v736484G.js","/assets/store-G5Xgo8eU.js","/assets/table-2-40nsYu5I.js","/assets/tag-CGGValpM.js","/assets/trending-down-BX2caxJX.js","/assets/trending-up-D5TVewa3.js","/assets/undo-2-B8fE52aj.js","/assets/useChartTheme-Cng8PIAR.js","/assets/useElementWidth-Da7AF3O6.js","/assets/useIsMobile-V1IOAry0.js","/assets/useMutation-JbKKzy0l.js","/assets/useStatusBands-sQAJ5G3i.js","/assets/user-DtvZs7hI.js","/assets/user-check-DtBfpCWr.js","/assets/user-cog-CYjbGHCv.js","/assets/user-minus-btQjb5PM.js","/assets/users-BPhkt9GK.js","/assets/verifyState-pR0ZQBqy.js","/assets/video-LnjE5e4m.js","/assets/wallet-BKq6CkJe.js","/assets/warehouse-DdahBkBU.js","/assets/zap-CUDSMUWu.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
