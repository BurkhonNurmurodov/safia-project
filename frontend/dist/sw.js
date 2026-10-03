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

const BUILD = "2026-10-03T10:47:58.920Z";
const PRECACHE = ["/","/assets/AdminPanel-CkSMSNpp.js","/assets/AnalysisBoard-B_lx-28z.js","/assets/Arc-CSNOYHjA.js","/assets/ArcLegacy-DuJUSTRb.js","/assets/BrigadirProfile-ksRGf92f.js","/assets/BroadcastReceivers-CGE-pc0R.js","/assets/BroadcastRecord-CuGe092N.js","/assets/CatLockNotice-4SLUJUUJ.js","/assets/CategoryLegendModal-BttGKfHO.js","/assets/CellConcerns-CNTF8v4u.js","/assets/CellDetails-C731vXmV.js","/assets/CellFormModal-d5WMOYWv.js","/assets/CellIdent-CIu9GR95.js","/assets/CellLink-C3ner0g6.js","/assets/Cells-C6lbgFxv.js","/assets/ColumnFilter-BETYzxxi.js","/assets/ColumnsPicker-CV_hVYUe.js","/assets/CommentsModal-gK8sha2J.js","/assets/ComparisonTable-Di2Y5BHo.js","/assets/Concerns-B3V_LgTG.js","/assets/ConfirmDialog-BCn083br.js","/assets/Daily-DGv1IiV7.js","/assets/DataTable-kjuf2Qnp.js","/assets/DateRangePicker-xUGhJ0je.js","/assets/DayReportView-BVRvvaTc.js","/assets/DayStepper-KiTxcD5h.js","/assets/DifferenceBreakdown-4iXQR9AU.js","/assets/Downtime-BWfKILMo.js","/assets/Education-1LlQZIv6.js","/assets/EducationLesson-DeAV5UAa.js","/assets/EmptyState-Ch3fcuZC.js","/assets/Exam-2ii_jWzL.js","/assets/FactorySelect--wHn0CF5.js","/assets/Gamification-ClmdUXF0.js","/assets/GroupBadge-BSRUxQYP.js","/assets/HeatmapChart--UHIF8r5.js","/assets/IdleCell-D415LDfd.js","/assets/KPICard-KLltu-Fh.js","/assets/Kaizen-gpD8Gz4z.js","/assets/Kelish-JQhPV4CL.js","/assets/KpiDeltaCard-7307Nm43.js","/assets/LangTextInput-DF4CuhE0.js","/assets/Layout-M03XeGnr.js","/assets/LeaderAppeal-CcVtzApZ.js","/assets/LeaderDayReport-C2ZkY13E.js","/assets/LeaderUnitReport-DKtfwDh6.js","/assets/Leaderboard-DPvhr9eo.js","/assets/Leaders-BBrNAL-e.js","/assets/Lightbox-DQSFH1Q0.js","/assets/LiveOverview-CC6z4nj2.js","/assets/Login-zJ56Aozm.js","/assets/NotFound-CTTACJlk.js","/assets/Notifications-5aUVFjFH.js","/assets/Overview-Wpwg5WfB.js","/assets/Pagination-BhRi0-8G.js","/assets/PerenaladkaFactTable-BD-ltclP.js","/assets/PersonCard-ZF8UfakM.js","/assets/PlanFulfillment-DtY7eIkj.js","/assets/Production-DVah8HMd.js","/assets/Profile-CJEjwb3_.js","/assets/ProofCamera-Cx7sdp8e.js","/assets/ProofPhoto-D0XyngdI.js","/assets/Quality-kWDusHSB.js","/assets/RawRows-DZDKN9TO.js","/assets/RequestStateChip-BRru2Eck.js","/assets/RichTextEditor-BFGArRMF.js","/assets/SaveState-CLcDBhhW.js","/assets/SearchInput-Dm0blLnX.js","/assets/SeasonalityHeatmap-DsJQQ6Mr.js","/assets/SegmentedToggle-iOZcqMos.js","/assets/SetupTimes-B8QccrxN.js","/assets/ShiftDaily-3ob2AZDp.js","/assets/Staff-CF7Gv_kP.js","/assets/StaffLive-BT3ezQj8.js","/assets/StatusBadge-OD7B8Bqc.js","/assets/TargetGoal-CmzIlrN-.js","/assets/Targets-asV-Z2n5.js","/assets/Tasks-DLE-ldr8.js","/assets/TimeWheelPicker-BODzSBG2.js","/assets/Toast-ByJPd2m1.js","/assets/Tooltip-D-E3EvAa.js","/assets/TrendChart-DLDNtxqH.js","/assets/TripleSpeedometer-ffvxM5JH.js","/assets/Trudoyomkost-Db7oQllt.js","/assets/UploadDropzone-CdfOr8Eo.js","/assets/UsersActivity-Bas-QDmc.js","/assets/VerdictBlock-D8pqRHFq.js","/assets/VfxApiMap-3Oz1I-Sd.js","/assets/VfxEmployees-dBvsBsj_.js","/assets/VfxJobs-DQj98aEM.js","/assets/VfxMarks-CyQOuUDk.js","/assets/VfxOnSite-BHXodu4W.js","/assets/VfxPhoto-DiH5qnCq.js","/assets/VfxState-BVoCx4I3.js","/assets/VfxStructure-BndrtOe6.js","/assets/VfxTable-CmoL2bz7.js","/assets/VfxTimesheet-BrgxVOKN.js","/assets/WatchProgress-CpoVqV2j.js","/assets/WebLogin-CDiYyazs.js","/assets/WorkerConcerns-CE8Ml8YI.js","/assets/Workers-CUBzwmlm.js","/assets/Zagruzka-Cz2YLIVs.js","/assets/ZagruzkaCell-BevCnlcG.js","/assets/api-CPEiy33a.js","/assets/archive-jN-LyLI1.js","/assets/archive-restore-C5P5tzMo.js","/assets/arrow-down-BzKUSMNG.js","/assets/arrow-left-BRJUHLjN.js","/assets/arrow-right-left-DvWb_7LE.js","/assets/arrow-up-Dt1TY-o9.js","/assets/arrow-up-narrow-wide-XRnuczSC.js","/assets/arrow-up-right-CuwL39Z_.js","/assets/award-CdqiwpC_.js","/assets/ban-DHWHI1lf.js","/assets/bot-bRpFqpxS.js","/assets/boxes-DGrNXoa_.js","/assets/braces-B8RefHFp.js","/assets/brigadirFilters-BYYwNXa5.js","/assets/broadcastTree-DhMFmbnY.js","/assets/building-2-CbefsfC6.js","/assets/calendar-B8VsM--e.js","/assets/calendar-days-CrKsNmqR.js","/assets/camera-BrOktHRs.js","/assets/categories-N6MDOqaR.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D08gtqSI.js","/assets/chart-line-DjEKmieA.js","/assets/chart-pie-Dqakg8fi.js","/assets/chartRange-0I5k9Zit.js","/assets/chevron-left-UPlNGmAp.js","/assets/chevrons-up-down-GJqupWOK.js","/assets/circle-alert-B_6dR-jo.js","/assets/circle-check-big-D4krxlaX.js","/assets/circle-dashed-Bfrh2lLK.js","/assets/circle-minus-_AGnP4EE.js","/assets/circle-question-mark-C3SjUDLg.js","/assets/circle-slash-BGgexcSG.js","/assets/circle-user-round-uwH31U57.js","/assets/circle-vQ2h05_o.js","/assets/clock-3-E3lOVYHW.js","/assets/cloud-off-DsZaEGlx.js","/assets/cloud-upload-BIxHcgxv.js","/assets/compass-bSdcaAot.js","/assets/concernCategories-DqdNZxpc.js","/assets/copy-CJxrLKr_.js","/assets/corner-down-right-BCsAHmth.js","/assets/createLucideIcon-CmC2O-fS.js","/assets/door-open--GnL9t7-.js","/assets/es-CfJ03Tdt.js","/assets/exportXlsx-BYyJ7udw.js","/assets/external-link-S7RKHoDz.js","/assets/file-clock-CAUy7OLs.js","/assets/file-exclamation-point-BlaNNC6o.js","/assets/file-spreadsheet-CcOmTUS0.js","/assets/file-text-CNuwN_iG.js","/assets/flag--LlOKacP.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DR0tOayZ.js","/assets/hash-DrhqTpAW.js","/assets/history-CaHNQdJO.js","/assets/hourglass-BoI6sOO8.js","/assets/image-BYSPn8iW.js","/assets/image-off-D3nNzRSp.js","/assets/inbox-BYkudY7J.js","/assets/index-C7vE72Ao.css","/assets/index-Sp6qypeZ.js","/assets/key-round-BpfZw16j.js","/assets/keyboard-D9XD7DAs.js","/assets/languages-Dw09HV1q.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DUHhJ206.js","/assets/lightbulb-ZWz-RW9M.js","/assets/link-2-D-GwbhFV.js","/assets/link-2-off-BNRO_2o6.js","/assets/list-ordered-dL34beEg.js","/assets/list-tree-B9Vo7jEw.js","/assets/lock-open-DD45UPi6.js","/assets/log-in-CkT6hQTk.js","/assets/maximize-2-v6f1zOGY.js","/assets/message-square-CbUrgijF.js","/assets/minimize-2-C8Ydg5EU.js","/assets/package-check-D9LR0vK4.js","/assets/paperclip-9yYDPf-C.js","/assets/pencil-DgMxUiB6.js","/assets/percent-CJgeSEH9.js","/assets/phone-N9fRsqJo.js","/assets/pin-BBxyr62a.js","/assets/pin-off-D4RzGjvP.js","/assets/play-CJJU-7P7.js","/assets/plug-zap-Zya8A_An.js","/assets/presentation-CeHR-x8v.js","/assets/prop-types-BLgPgJ5Z.js","/assets/radio-BtBxjMmy.js","/assets/react-apexcharts.esm-CbWfglCN.js","/assets/repeat-CKgLY19U.js","/assets/rotate-ccw-EqXBWU31.js","/assets/rotate-cw-CPoclwOs.js","/assets/save-DvYJ7Ux7.js","/assets/scopeLinks-BsfggTLv.js","/assets/scroll-text-D5kwjOXr.js","/assets/search-x-l0VGuxl9.js","/assets/segments-Nju0ZLyS.js","/assets/send-21o6TyO4.js","/assets/settings-2-CzK7GWvu.js","/assets/shield-DSKPKINf.js","/assets/shield-alert-DC3WRCye.js","/assets/shield-check-CDq4V5_q.js","/assets/shield-question-mark-C0gdvsOq.js","/assets/siren-c1VkFWgI.js","/assets/snowflake-DuQ5pqDK.js","/assets/split-CUnQ6QS8.js","/assets/square-DhftbAII.js","/assets/square-check-big-CxW-FMKc.js","/assets/star-oRGIQ27t.js","/assets/statusBands-BVQ16FUd.js","/assets/store-D8kOmVbK.js","/assets/table-2-q7110Wcq.js","/assets/table-properties-D_HCjzqe.js","/assets/tag-BmGLl6_y.js","/assets/timer-off-BpF-DsnD.js","/assets/trending-down-DUPStXp0.js","/assets/trending-up-tbVfblwf.js","/assets/undo-2-DC1fzxSL.js","/assets/useChartTheme-Bj63UJEY.js","/assets/useElementWidth-CkdI-RaH.js","/assets/useIsMobile-DdsbRXMJ.js","/assets/useOpenParam-u-Q10WYB.js","/assets/useStatusBands-CPWE8q-x.js","/assets/useUrlScope-Hyxch-zX.js","/assets/user-BodKKRqv.js","/assets/user-cog-BPT4oRGw.js","/assets/user-minus-CQom6NkX.js","/assets/users-CbbkzCNG.js","/assets/video-CeWetj-Z.js","/assets/wallet-Bp57QXwO.js","/assets/warehouse-D-wcValx.js","/assets/x-DhUuAF3y.js","/assets/zap-tMYZ9Ee1.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
