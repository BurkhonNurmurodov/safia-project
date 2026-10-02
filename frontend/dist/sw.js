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

const BUILD = "2026-10-02T09:27:02.811Z";
const PRECACHE = ["/","/assets/AdminPanel-BvyvhARN.js","/assets/AnalysisBoard-BMXIkRhR.js","/assets/Arc-CLsW0eoc.js","/assets/ArcLegacy-BZr9kj-B.js","/assets/BrigadirProfile-DIPkWIrV.js","/assets/BroadcastReceivers-sig3ctwH.js","/assets/BroadcastRecord-B33MeOkS.js","/assets/CatLockNotice-CIZZ3gX9.js","/assets/CategoryLegendModal-CqcWVVkf.js","/assets/CellConcerns-CRjFD6sM.js","/assets/CellDetails-Bqt8nPRC.js","/assets/CellFormModal-0FnSRl8p.js","/assets/CellIdent-D5Eq4OVC.js","/assets/CellLink-CmG1nSoL.js","/assets/Cells-BrQdAQyj.js","/assets/ColumnFilter-DFsR4sDI.js","/assets/ColumnsPicker-BeuhRHaE.js","/assets/CommentsModal-CAt5Uhs4.js","/assets/ComparisonTable-D2H75hJB.js","/assets/Concerns-Bgz7TVIj.js","/assets/ConfirmDialog-Cp21vAjc.js","/assets/Daily-BQ8N03vy.js","/assets/DataTable-COPyeRb6.js","/assets/DateRangePicker-6sgM5MpQ.js","/assets/DayReportView-B4mcz73m.js","/assets/DayStepper-DWT4lbht.js","/assets/DifferenceBreakdown-CTvF1xJO.js","/assets/Downtime-BfFwTjKA.js","/assets/Education-CpHQ41ez.js","/assets/EducationLesson-BMlbEso3.js","/assets/EmptyState-yEz3p8vo.js","/assets/Exam-BIdjHmM3.js","/assets/FactorySelect-4UYjMCNF.js","/assets/Gamification-ClBekeCv.js","/assets/GroupBadge-DzUJm9l9.js","/assets/HeatmapChart-VKNW2hp8.js","/assets/IdleCell-CirVuKb8.js","/assets/KPICard-D8vwR8iA.js","/assets/Kaizen-gsbK2hmT.js","/assets/Kelish-BBOm2PrF.js","/assets/KpiDeltaCard-LUL7My2W.js","/assets/LangTextInput-CuaFABqR.js","/assets/Layout-CAPSmXpI.js","/assets/LeaderAppeal-WHQ1hSJK.js","/assets/LeaderDayReport-k_qbYrUD.js","/assets/LeaderUnitReport-Cs6KdILF.js","/assets/Leaderboard-NrimOdhB.js","/assets/Leaders-DR_9ND5k.js","/assets/Lightbox-B7ZXHN8U.js","/assets/LiveOverview-fabgxaEp.js","/assets/Login-DIYryZeh.js","/assets/NotFound-M3i7zsMc.js","/assets/Notifications-D8iyYezU.js","/assets/Overview-8TIpXkRk.js","/assets/Pagination-DP_wy5lN.js","/assets/PerenaladkaFactTable-DbNg0Yyv.js","/assets/PlanFulfillment-BRBbq2ce.js","/assets/Production-CuPyPpdi.js","/assets/Profile-BfQFEjXo.js","/assets/ProofCamera-ylClaivX.js","/assets/ProofPhoto-D1gK9Ngg.js","/assets/Quality-DB9rlgx4.js","/assets/RequestStateChip-mFErpwMd.js","/assets/RichTextEditor-BSfMH5k9.js","/assets/SaveState-BDE48YZQ.js","/assets/SearchInput-Bma9P39b.js","/assets/SeasonalityHeatmap-0KcSDzW2.js","/assets/SegmentedToggle-D-PSKtgh.js","/assets/SetupTimes-DrEsl8Ig.js","/assets/ShiftDaily-Dme6bzv9.js","/assets/Staff-CiEVG_9p.js","/assets/StaffLive-Bm9uM_-L.js","/assets/StatusBadge-Yb3-u7Km.js","/assets/TargetGoal-Hf08aDL8.js","/assets/Targets-DKhPseHK.js","/assets/Tasks-D41VGUBx.js","/assets/TimeWheelPicker-CSGrJHiO.js","/assets/Toast-CIiQnMCZ.js","/assets/Tooltip-Bwwkegun.js","/assets/TrendChart-B874KsKr.js","/assets/TripleSpeedometer-Dx6uuUwX.js","/assets/Trudoyomkost-C6ZLl9mS.js","/assets/UploadDropzone-BCL29E_q.js","/assets/UsersActivity-BjlLPc1k.js","/assets/VerdictBlock-Ba0oqD4n.js","/assets/WatchProgress-DJUkGtXN.js","/assets/WebLogin-Bp_a9dkF.js","/assets/WorkerConcerns-DOqV7gS9.js","/assets/Workers-VolvYmr7.js","/assets/Zagruzka-CQLE0fqy.js","/assets/ZagruzkaCell-CIJG5kiH.js","/assets/api-Czfa4V7-.js","/assets/archive-CIIq-gSn.js","/assets/archive-restore-DYGaVIde.js","/assets/arrow-down-CqGSoUlP.js","/assets/arrow-left-CZq5FRhQ.js","/assets/arrow-right-left-DZ0OsHPI.js","/assets/arrow-up-CnoqBj4s.js","/assets/arrow-up-narrow-wide-QEQoG18A.js","/assets/arrow-up-right-DRmvRq1-.js","/assets/award-BnjtyGfo.js","/assets/ban-Bo-6-sNm.js","/assets/bot-lrTOtURI.js","/assets/boxes-PXfneOBy.js","/assets/brigadirFilters-C4yx5XMC.js","/assets/broadcastTree-DIz9QGZw.js","/assets/building-2-CLs_uW1B.js","/assets/calendar-CKBT2jvR.js","/assets/calendar-days-C-hUQMNn.js","/assets/calendar-range-Dt_ULAVg.js","/assets/camera-Dm0pHv72.js","/assets/categories-DjbKhGGk.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D2iiHEEl.js","/assets/chart-line-Dqny9UE5.js","/assets/chart-pie-BOcV8sAN.js","/assets/chartRange-BnhTYgs_.js","/assets/chevron-left-1pKk2UMO.js","/assets/chevrons-up-down-DpP0zUGu.js","/assets/circle-2kc-kGdc.js","/assets/circle-alert-Dn9o7dGW.js","/assets/circle-check-big-DeCp-mCW.js","/assets/circle-minus-Bw0HJ6sW.js","/assets/circle-question-mark-DjDupTuw.js","/assets/circle-slash-DVPYleFN.js","/assets/circle-user-round-qRSw0YWR.js","/assets/cloud-off-U-WhdVDy.js","/assets/cloud-upload-WYCTDc9W.js","/assets/compass-BzcWPgeq.js","/assets/concernCategories-BSoxqaa2.js","/assets/copy-DHsSldvU.js","/assets/corner-down-right-Bw02UqE3.js","/assets/createLucideIcon-BN_bBA5C.js","/assets/es-DGfywddW.js","/assets/exportXlsx-AtCTwOn2.js","/assets/external-link-Cr6pmOfH.js","/assets/file-clock-CmKI8jSn.js","/assets/file-exclamation-point-Cyq9jM1-.js","/assets/file-spreadsheet-B5plsHKP.js","/assets/file-text-BDYPvTuc.js","/assets/flag-0CQ66Cw3.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DiWhrTLP.js","/assets/hash-Bnto3CYF.js","/assets/history-49zDl3IS.js","/assets/hourglass-BHGgHx5j.js","/assets/id-card-B2IJwyBS.js","/assets/image-DvZdXnHu.js","/assets/image-off-Du-Df4fd.js","/assets/inbox-f86EL9C_.js","/assets/index-CFKNzno5.js","/assets/index-bv1wZ_fI.css","/assets/key-round-Mua3P6K_.js","/assets/keyboard-Ck6K0RwR.js","/assets/languages-DFcKWIjZ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DnsqmIf8.js","/assets/lightbulb-C2J94qVd.js","/assets/link-2-BvMr0jS9.js","/assets/link-2-off-BRZis7DC.js","/assets/list-ordered-B_ITMPZd.js","/assets/list-tree-_sGB_1gU.js","/assets/lock-open-DzKDD1Xn.js","/assets/log-in-sNcN52G9.js","/assets/maximize-2-TdJ5eDEe.js","/assets/message-square-DuAQ0dUm.js","/assets/minimize-2-DDbdmWQI.js","/assets/package-check-CUO8YzWQ.js","/assets/paperclip-CIJS1FHA.js","/assets/pencil-D6oKyIr-.js","/assets/percent-D83YHyZW.js","/assets/pin-BFqaIcSc.js","/assets/pin-off-cOCZ6VTH.js","/assets/play-B0Vdm2LC.js","/assets/plug-zap-CPt_GRmy.js","/assets/presentation-BebyReyh.js","/assets/prop-types-DIWqfvIC.js","/assets/radio-CYxsaW4R.js","/assets/react-apexcharts.esm-C96x0HbF.js","/assets/repeat-DICcnYDr.js","/assets/rotate-ccw-04_nvVO3.js","/assets/rotate-cw-BZ2O6SYa.js","/assets/save-D6Il20kK.js","/assets/scopeLinks-dsETwg_t.js","/assets/scroll-text-CSo9Z8iw.js","/assets/search-x-BS8Tiji5.js","/assets/segments-CFT4HUTz.js","/assets/send-B9bqxkdE.js","/assets/settings-2-CUUbU2H8.js","/assets/shield-alert-C6JM9nkS.js","/assets/shield-check-NTaqdW_z.js","/assets/shield-question-mark-BzU8d_Ou.js","/assets/shield-sGXM2HSc.js","/assets/siren-BmkR_HXh.js","/assets/snowflake-C-H0N2ur.js","/assets/split-Dzlkhq62.js","/assets/square-BayCx-CM.js","/assets/square-check-big-Bi48vTwd.js","/assets/star-DWUuVXFv.js","/assets/statusBands-2p5Owd2k.js","/assets/store-BH07NTL5.js","/assets/table-2-BBf2Le77.js","/assets/table-properties-BOGp7dWI.js","/assets/tag-CHKn4fC_.js","/assets/timer-off-DJlNSkkP.js","/assets/trending-down-xR1lA3wq.js","/assets/trending-up-Hrq1EBQj.js","/assets/undo-2-B9CjrAek.js","/assets/useChartTheme-Cv0N6eu-.js","/assets/useElementWidth-aIZpZkWr.js","/assets/useIsMobile-Z7Z6Rrgr.js","/assets/useOpenParam-qUHbzeAe.js","/assets/useStatusBands-Cfbf693x.js","/assets/useUrlScope-BxnyeHsT.js","/assets/user-Bfr0nA5i.js","/assets/user-cog--eZM-BNR.js","/assets/user-minus-hRpe4gUK.js","/assets/users-DYBgW2pz.js","/assets/video-CCc5_dMk.js","/assets/wallet-6KO3DF-e.js","/assets/warehouse-B71guC-F.js","/assets/x-B3csB0CL.js","/assets/zap-CN0H3mct.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
