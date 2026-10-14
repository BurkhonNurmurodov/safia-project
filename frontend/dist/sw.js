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

const BUILD = "2026-10-14T05:42:09.018Z";
const PRECACHE = ["/","/assets/AdminPanel-CjsTb2hC.js","/assets/AnalysisBoard-FdW3h4k0.js","/assets/Arc-CEfGDXW5.js","/assets/Assistant-D7RKg09W.js","/assets/BrigadirProfile-BwoH2ehB.js","/assets/BroadcastReceivers-BKwUze5t.js","/assets/BroadcastRecord-BmaEuFIL.js","/assets/Button-DRB0MkVn.js","/assets/CatLockNotice-UOBb0lH1.js","/assets/CategoryLegendModal-Bq70MK9T.js","/assets/CellConcerns-3smpnW1r.js","/assets/CellDetails-av_upQM_.js","/assets/CellFormModal-bOLVScYB.js","/assets/CellIdent-HPX4oMC1.js","/assets/CellLink-B0_N1wTL.js","/assets/Cells-DVujZcIt.js","/assets/ColumnFilter-CfS72V4V.js","/assets/ColumnsPicker-D-85ZVzQ.js","/assets/CommentsModal-BEXw5G9O.js","/assets/ComparisonTable-Df4G2WDA.js","/assets/Concerns-Uk2MT_Yr.js","/assets/CountStepper-DBNpRYe3.js","/assets/Daily-CPdKswhT.js","/assets/DataTable-Bf2wKks1.js","/assets/DateRangePicker-DajX-ag7.js","/assets/DayReportView-DpkmbB7j.js","/assets/DayStepper-CDdIbjmk.js","/assets/DifferenceBreakdown-BWpH6Xe2.js","/assets/Downtime-CYDwvkHQ.js","/assets/Education-CA1Qwl55.js","/assets/EducationLesson-BhsSQL2U.js","/assets/EmptyState-CGqTfxeq.js","/assets/Exam-BNrLanJP.js","/assets/FactorySelect-TAfaJnUl.js","/assets/Gamification-DYtSY55O.js","/assets/GroupBadge-BzJrm4Zo.js","/assets/HeatmapChart-BsuyWt31.js","/assets/IdleCell-DLHSUD4k.js","/assets/KPICard-B7jsgSuX.js","/assets/Kaizen-CdWati5G.js","/assets/Kelish-D07OsIfi.js","/assets/KpiDeltaCard-CxekVGUn.js","/assets/LangTextInput-9yDjFHxF.js","/assets/Layout-CfwKwCOh.js","/assets/LeaderAppeal-BdsdNdGm.js","/assets/LeaderDayReport-CfH5_v9m.js","/assets/LeaderUnitReport-B7RfvEB3.js","/assets/Leaderboard-DLgo2LcS.js","/assets/Leaders-C6A_lyLI.js","/assets/Lightbox-CaZUAq-Q.js","/assets/LiveOverview-CUpKZw67.js","/assets/Login-y7KPB6y6.js","/assets/NotFound-Bud16B2t.js","/assets/Notifications-0xcp7p90.js","/assets/Overview-2Qz6P7Yw.js","/assets/Pagination-Cor7M7F6.js","/assets/PerenaladkaFactTable-CAfIvm8K.js","/assets/PersonCard-DFsyOicY.js","/assets/PlanFulfillment-PZpHMtGb.js","/assets/Production-okAb6s0-.js","/assets/Profile-Doq4IzTV.js","/assets/ProofCamera-Z4z-cfvE.js","/assets/Quality-BvcZkZKq.js","/assets/RawRows-Da-J5irr.js","/assets/RequestStateChip-WHTU8Odb.js","/assets/RichTextEditor-CRJsWPSM.js","/assets/SaveState-DkSG5gJV.js","/assets/SearchInput-sTT_z7zw.js","/assets/SeasonalityHeatmap-DFmJ8djX.js","/assets/SegmentedToggle-Di5x8KXo.js","/assets/SetupTimes-CjkAEP72.js","/assets/ShiftDaily-CFMwkv1L.js","/assets/Staff-C8RMgjpk.js","/assets/StaffListAtCheck-BcMh52Iu.js","/assets/StatusBadge-uaGjgncA.js","/assets/TargetGoal-Cyv1fzlC.js","/assets/Targets-Bx3JQr_h.js","/assets/Tasks-BhRmuBN1.js","/assets/TimeWheelPicker-DX9AEh71.js","/assets/Toast-7JoKxYAT.js","/assets/Tooltip-DwtEA-C7.js","/assets/TrendChart-DxaR5hvG.js","/assets/TripleSpeedometer-DiRJ8kfs.js","/assets/Trudoyomkost-C5Hftmed.js","/assets/Turnover-CVhFFJP9.js","/assets/UploadDropzone-BTBOmX1j.js","/assets/UsersActivity-Ux79Oy5M.js","/assets/VerdictBlock-BZEO4BP6.js","/assets/VfxApiMap-D4IztYqp.js","/assets/VfxDictionaries-CmHQKz4X.js","/assets/VfxEmployees-CffyT6-u.js","/assets/VfxHrMoves-B0y7tQt9.js","/assets/VfxJobs-CmlyHkOc.js","/assets/VfxPhoto-DzwG8-l4.js","/assets/VfxShifts-CETbidhz.js","/assets/VfxState-BsY0PbEA.js","/assets/VfxTimebooks-DKmfhCyI.js","/assets/VfxTimesheet-BTXnXMi0.js","/assets/WatchProgress-DgChgpOY.js","/assets/WebLogin-C5Rz2T4N.js","/assets/WorkerConcerns-CKWgEKUM.js","/assets/Workers-CRLEO1Ru.js","/assets/Zagruzka-CzhVeQIi.js","/assets/ZagruzkaCell-O4uCy_A-.js","/assets/api-DiFg4mAH.js","/assets/archive-CEjlDYrr.js","/assets/archive-restore-IrXxN_Kf.js","/assets/arrow-down-BawP5ocX.js","/assets/arrow-down-wide-narrow-DAhd0Elw.js","/assets/arrow-up-narrow-wide-BhKAf4_X.js","/assets/award-CWQiWH7D.js","/assets/ban-CShDuc07.js","/assets/boxes-BPRlEvN8.js","/assets/braces-BsvXgvGT.js","/assets/brigadirFilters-DXH97uQg.js","/assets/broadcastTree-C2X3fgL9.js","/assets/building-2-Yrkplnfc.js","/assets/calculator-CqDi9RgJ.js","/assets/calendar-DM-xZcra.js","/assets/calendar-days-DCgeFIC9.js","/assets/camera-BeAzx_-R.js","/assets/categories-BURSlHLF.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BleXWyeG.js","/assets/chart-line-BzQwgP2K.js","/assets/chart-pie-BOkUq7bU.js","/assets/chartRange-DPtU6PfX.js","/assets/check-check-CcNHRaF0.js","/assets/chevron-left-BrZNyrgc.js","/assets/chevrons-up-down-DJr3LM8V.js","/assets/circle-alert-D_nPdg-o.js","/assets/circle-check-big-BrYWUK_M.js","/assets/circle-dashed-CQMhZqqN.js","/assets/circle-hekTmSLD.js","/assets/circle-minus-CHMypRHV.js","/assets/circle-question-mark-lkwXUd3L.js","/assets/circle-slash-D3rie3IC.js","/assets/circle-user-round-DpIMPE-O.js","/assets/clock-3-BwUZk7j6.js","/assets/cloud-off-Cma8Xi14.js","/assets/cloud-upload-BAJMDuKg.js","/assets/compass-DFAtYKEj.js","/assets/concernCategories-CJheOcRv.js","/assets/copy-DsWzxWZM.js","/assets/corner-down-right-BoLqKqzA.js","/assets/createLucideIcon-DAQTs7Q6.js","/assets/es-DxTnGJ6V.js","/assets/external-link-Wr6S5S3f.js","/assets/file-clock-CxqlhOJR.js","/assets/file-exclamation-point-CngYPFK9.js","/assets/flag-CVf9bHMO.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Cs3IPrsO.js","/assets/hash-s75ycNUR.js","/assets/hourglass-Dn55Zzxk.js","/assets/image-C84Pih23.js","/assets/image-off-CL9tRIWY.js","/assets/inbox-kG8CKHsj.js","/assets/index-7f1rnqtY.css","/assets/index-BmbiwNCt.js","/assets/keyboard-Bjo11xD1.js","/assets/languages-Bk3KJZKA.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-sM8SesDo.js","/assets/lightbulb-DJib41Bp.js","/assets/link-2-CGn_PJKU.js","/assets/link-2-off-CJz9Zi6q.js","/assets/list-ordered-CxY5fJAX.js","/assets/list-tree-4Nt3PlSx.js","/assets/lock-open-NZauZTAE.js","/assets/log-in-0BUmai9T.js","/assets/marks-CmwWZGv-.js","/assets/minimize-2-BTnQ41zb.js","/assets/package-check-MjkMT1Eo.js","/assets/pencil-ArYATn5L.js","/assets/percent-BQjpRVfa.js","/assets/pin-YjFUkHTH.js","/assets/pin-off-BIOiH2Zh.js","/assets/play-f023tDNb.js","/assets/plug-zap-HWL8RJXy.js","/assets/prop-types-Bdp_ojbi.js","/assets/radio-oqNgwQqM.js","/assets/react-apexcharts.esm-BEpBPqP0.js","/assets/registers-C5n9YfWR.js","/assets/repeat-BMjLe13z.js","/assets/save-DBsr36os.js","/assets/scopeLinks-nOmiL9uA.js","/assets/scroll-text-Draj8X07.js","/assets/search-x-MckXQaHo.js","/assets/segments-D92ZPC9w.js","/assets/send-ClsTQr6h.js","/assets/settings-2-BfhNhihn.js","/assets/shield-Be9OAF_m.js","/assets/shield-alert-BUk5M8G5.js","/assets/shield-question-mark-Ds-vTv8h.js","/assets/siren-DwIuWD6z.js","/assets/snowflake-CDyX8yms.js","/assets/split-z42QkQdy.js","/assets/square-check-big-EDN0tMsZ.js","/assets/star-Dk7a60_x.js","/assets/statusBands-Bxi0ZR_h.js","/assets/store-Crei9j-O.js","/assets/table-2-D5puQDen.js","/assets/table-properties-3SBlKB5O.js","/assets/tag-DfqC5y_W.js","/assets/timer-off-By2M7xTE.js","/assets/trending-down-mZg-SCXN.js","/assets/trending-up-C6MFkvhU.js","/assets/undo-2-BVENIBvs.js","/assets/useChartTheme-BkptF8k6.js","/assets/useElementWidth-Duo7Gs3V.js","/assets/useIsMobile-DkUcOz8M.js","/assets/useOpenParam-C_T8r2nu.js","/assets/useStatusBands-BCQy4QMX.js","/assets/useUrlScope-D-XVbPrT.js","/assets/user-C1dJlIWx.js","/assets/user-cog-CCS2tdSD.js","/assets/users-8stxTSWk.js","/assets/vfx-B9BbbDZG.js","/assets/video-BiJOqbPQ.js","/assets/wallet-B85bAZxJ.js","/assets/warehouse-aA1Bk5Tm.js","/assets/workflow-BRuKv13n.js","/assets/x-C5JfVlW_.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png"];
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
