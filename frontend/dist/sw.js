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

const BUILD = "2026-10-05T12:14:08.454Z";
const PRECACHE = ["/","/assets/AdminPanel-BiK4qy2w.js","/assets/AnalysisBoard-BadSVIxC.js","/assets/Arc-CkM6PjzD.js","/assets/BrigadirProfile-CQt1UQqa.js","/assets/BroadcastReceivers-WUbpdHJ6.js","/assets/BroadcastRecord-BGLog9Ez.js","/assets/Button-BqnBrNKo.js","/assets/CatLockNotice-DG-hWewE.js","/assets/CategoryLegendModal-DqOG6qgG.js","/assets/CellConcerns-BcqS1-mz.js","/assets/CellDetails-CpNafhSc.js","/assets/CellFormModal-CsG-eakE.js","/assets/CellIdent-DIrWlpU3.js","/assets/CellLink-JgUPdhVH.js","/assets/Cells-Cj1VTmuG.js","/assets/ColumnFilter-BSaBX2lk.js","/assets/ColumnsPicker-CniwGt54.js","/assets/CommentsModal-D0LZ9ACb.js","/assets/ComparisonTable-DLZCJSR3.js","/assets/Concerns-CIzbh_D9.js","/assets/Daily-Dqs-4niL.js","/assets/DataTable-CrbJmPvF.js","/assets/DateRangePicker-BzUh-QGU.js","/assets/DayReportView-Bj71ibC2.js","/assets/DayStepper-mIqAgl-I.js","/assets/DifferenceBreakdown-DXQRNjRb.js","/assets/Downtime-B8ulClh8.js","/assets/Education-DnMiea5m.js","/assets/EducationLesson-CcpWz3cF.js","/assets/EmptyState-D7p46p2h.js","/assets/Exam-Bh07Jwij.js","/assets/FactorySelect-CqmIjK3A.js","/assets/Gamification-w5R_HXEp.js","/assets/GroupBadge-CGYGtSCd.js","/assets/HeatmapChart-DGQZVfQI.js","/assets/IdleCell-CExJsfMZ.js","/assets/KPICard-CsyynqXs.js","/assets/Kaizen-n60APSme.js","/assets/Kelish-BOpDKV2l.js","/assets/KpiDeltaCard-R2EBLe5y.js","/assets/LangTextInput-_STeBmcv.js","/assets/Layout-Dfg6GQn6.js","/assets/LeaderAppeal-Ds0j7gsR.js","/assets/LeaderDayReport-C_DK7Ayj.js","/assets/LeaderUnitReport-DcDLkUvU.js","/assets/Leaderboard-dTZV4m8q.js","/assets/Leaders-Ch0iM_UU.js","/assets/Lightbox-DG4gxhqV.js","/assets/LiveOverview-CfMTWZUN.js","/assets/Login-DcqXzhkL.js","/assets/NotFound-C8rqgitl.js","/assets/Notifications-CSjKGgzR.js","/assets/Overview-oc0lHnfL.js","/assets/Pagination-DDmKHzq3.js","/assets/PerenaladkaFactTable-C1V24HS7.js","/assets/PersonCard-Dj2XNTxS.js","/assets/PlanFulfillment-CVzDVH8R.js","/assets/Production-CAJZmJAC.js","/assets/Profile-Bjpl3xJn.js","/assets/ProofCamera-EVyd1DAu.js","/assets/ProofPhoto-wBHdHC6A.js","/assets/Quality-XqRvCy5y.js","/assets/RawRows-CA6NE9O2.js","/assets/RequestStateChip-BnO0TkgJ.js","/assets/RichTextEditor-BEzDr27D.js","/assets/SaveState-BohYZSfp.js","/assets/SearchInput-DApd2cKC.js","/assets/SeasonalityHeatmap-jVb-DcWS.js","/assets/SegmentedToggle-B_Wcx3MT.js","/assets/SetupTimes-CCmGlBy4.js","/assets/ShiftDaily-DnLFSLvc.js","/assets/Staff-DebDhJs6.js","/assets/StaffLive-Dytnu0ZV.js","/assets/StatusBadge-B5SV6azK.js","/assets/TargetGoal-BwUEw_A-.js","/assets/Targets-Bficj84I.js","/assets/Tasks-l8N0BqGA.js","/assets/TimeWheelPicker-DzEa4lOV.js","/assets/Toast-CBAZXNq2.js","/assets/Tooltip-CnETkkIs.js","/assets/TrendChart-DZXYxwxR.js","/assets/TripleSpeedometer-DV5IEQ2H.js","/assets/Trudoyomkost-D2d-FT0O.js","/assets/Turnover-CBlGYhZo.js","/assets/UploadDropzone-HUOTeCMx.js","/assets/UsersActivity-M5yE63aX.js","/assets/VerdictBlock-Bq3qDnf9.js","/assets/VfxApiMap-DM7e-Qhy.js","/assets/VfxDictionaries-DbL1tIS_.js","/assets/VfxEmployees-Cz17ANod.js","/assets/VfxHrMoves-BcT7W2KB.js","/assets/VfxJobs-Ck_HSF92.js","/assets/VfxPhoto-1YOM3Vs1.js","/assets/VfxShifts-2uflaK8w.js","/assets/VfxState-BBZ7TQ2O.js","/assets/VfxTimebooks-CVPuuTrA.js","/assets/VfxTimesheet-DxCH6h7p.js","/assets/WatchProgress-D1ljCqxU.js","/assets/WebLogin-DvB1mnkc.js","/assets/WorkerConcerns-Bq5azp6p.js","/assets/Workers-DgjUyLyi.js","/assets/Zagruzka-CfyEdKZU.js","/assets/ZagruzkaCell-d8Qrq051.js","/assets/api-DovOxkyU.js","/assets/archive-BJZ587WP.js","/assets/archive-restore-DonML9mr.js","/assets/arrow-down-DVG6UYnC.js","/assets/arrow-left-CLIZj5TM.js","/assets/arrow-up-CTgHaWkR.js","/assets/arrow-up-narrow-wide-BS861AEE.js","/assets/arrow-up-right-CA2Z_4p-.js","/assets/award-D1EzNA9S.js","/assets/ban-QKJTn8OI.js","/assets/book-open-BBhbp2iV.js","/assets/boxes-BNfyxn2m.js","/assets/braces-Ds_XbWDQ.js","/assets/brigadirFilters-BCkUN7lw.js","/assets/broadcastTree-Dabn0WTr.js","/assets/building-2-DLalJaf5.js","/assets/calculator-CS2HWOJ-.js","/assets/calendar-C1v6tIXd.js","/assets/calendar-days-CBg6HUnp.js","/assets/camera-HAgHKUp0.js","/assets/categories-LsRn_Sbk.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CVfwEQj8.js","/assets/chart-line-DCP8CfMT.js","/assets/chart-pie-DHUZjGA_.js","/assets/chartRange-DsUMXApR.js","/assets/check-check-C8AoAzFJ.js","/assets/chevron-left-Dt-MCXuT.js","/assets/chevrons-up-down-mIBBqYhV.js","/assets/circle-DDJ4cFTg.js","/assets/circle-alert-DCXSwv-Q.js","/assets/circle-check-big-DrbWcxHc.js","/assets/circle-dashed-BHMGBqyw.js","/assets/circle-minus-CbgmrPo4.js","/assets/circle-question-mark-OZSi0zV8.js","/assets/circle-slash-Ccx5xEfv.js","/assets/circle-user-round-CZBLDFdh.js","/assets/clock-3-CqJUPD40.js","/assets/cloud-off--b8nCkWE.js","/assets/cloud-upload-CVg83e8-.js","/assets/compass-DquACXLs.js","/assets/concernCategories-C9Ss2x4p.js","/assets/copy-B5HUHt14.js","/assets/corner-down-right-8IGMfbJe.js","/assets/createLucideIcon-BMcU7Vne.js","/assets/es-DZc1Dc8e.js","/assets/exportXlsx-CGIBNQJC.js","/assets/external-link-B0RSdYKB.js","/assets/file-clock-CES3cazY.js","/assets/file-exclamation-point-BzuieE1U.js","/assets/file-spreadsheet-OIgxwFFJ.js","/assets/file-text-B8Q-oZtq.js","/assets/flag-BQsC9VN7.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DNpQ4x0t.js","/assets/hash-HZpk6RgY.js","/assets/history-Bqi_ktjb.js","/assets/hourglass-CTVqrW8G.js","/assets/image-B_EH_RhK.js","/assets/image-off-C9KsEsMw.js","/assets/inbox-YAWH3yzz.js","/assets/index-CCQoDNa6.css","/assets/index-CjOOtv7y.js","/assets/key-round-sRJp2fdR.js","/assets/keyboard-DbmYY1qU.js","/assets/languages-CfWa7zwS.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-KSHzPuz4.js","/assets/lightbulb-CeGJ2i0f.js","/assets/link-2-CRzpTHyR.js","/assets/link-2-off-BZ9hIaXd.js","/assets/list-ordered-eYvEWflp.js","/assets/list-tree-C4oeOlxp.js","/assets/lock-open-DcXIFO8w.js","/assets/log-in-DhP-Km-E.js","/assets/maximize-2-B8bnIZev.js","/assets/message-square-BAyW97Kj.js","/assets/minimize-2-uLCbZW0L.js","/assets/package-check-Dw6jRXbi.js","/assets/paperclip-B01E_ehv.js","/assets/pencil-_Jydyrk9.js","/assets/percent-Bt_9jDGG.js","/assets/pin-aNQQdyXK.js","/assets/pin-off-Cn4Ef69B.js","/assets/play-CobZoBfG.js","/assets/plug-zap-iMENIGij.js","/assets/presentation-B3ihrgGy.js","/assets/prop-types-CAYdElxH.js","/assets/radio-Cu3ygOAw.js","/assets/react-apexcharts.esm-C5r4SV3_.js","/assets/registers-BDze82gj.js","/assets/repeat-DgUaBh5S.js","/assets/rotate-ccw-CdKB5RPM.js","/assets/rotate-cw-B6PTtq3P.js","/assets/save-NAhMOc8h.js","/assets/scopeLinks-CaDBHTV_.js","/assets/scroll-text-C0TEdPDp.js","/assets/search-x-BCGVSMpu.js","/assets/segments-Dy0U33MM.js","/assets/send-BteofOvA.js","/assets/settings-2-C6Tb9Zhx.js","/assets/shield-BjBuWnXA.js","/assets/shield-alert-Tvxo7RP1.js","/assets/shield-check-CzkaXrjF.js","/assets/shield-question-mark-Dbd1GzTj.js","/assets/siren-B643GSFg.js","/assets/snowflake-B4c0idHI.js","/assets/split-DEabTY5h.js","/assets/square-BJH5monK.js","/assets/square-check-big-CZUNqZSx.js","/assets/star-DxyuEemB.js","/assets/statusBands-DUF0E8pb.js","/assets/store-DBg2lV09.js","/assets/table-2-AcKiHmsW.js","/assets/table-properties-vk4v_pFP.js","/assets/tag-D0Cj6auW.js","/assets/timer-off-CaiN3v2M.js","/assets/trending-down-CGHwPC6Z.js","/assets/trending-up-C8Pz0LnM.js","/assets/undo-2-Z7h2trON.js","/assets/useChartTheme-CaA8wRDw.js","/assets/useElementWidth-BOqq-ddC.js","/assets/useIsMobile-C6t0R4Cl.js","/assets/useOpenParam-CYNmpi33.js","/assets/useStatusBands-BapDp2t-.js","/assets/useUrlScope-BUl_olTq.js","/assets/user-D_SI_5y5.js","/assets/user-cog-4wQgBlOH.js","/assets/users-DDyTVMvB.js","/assets/vfx-5URH8Tu2.js","/assets/video-CcIx9HLr.js","/assets/wallet-BLmEmkfT.js","/assets/warehouse-Cz3d572J.js","/assets/x-ChmX7sby.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
