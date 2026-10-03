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

const BUILD = "2026-10-03T14:08:32.736Z";
const PRECACHE = ["/","/assets/AdminPanel-Dq4BzXyw.js","/assets/AnalysisBoard-BoMuIK78.js","/assets/Arc-DBWlGFdu.js","/assets/ArcLegacy-Cwu43ZIa.js","/assets/BrigadirProfile-CNO3FwQA.js","/assets/BroadcastReceivers-B8bEZh4N.js","/assets/BroadcastRecord-CRFb5OXB.js","/assets/CatLockNotice-5o3NlRSu.js","/assets/CategoryLegendModal-CTypMuEp.js","/assets/CellConcerns-oAWI_ueD.js","/assets/CellDetails-BOoG8nX5.js","/assets/CellFormModal-DQgXkV8x.js","/assets/CellIdent-Ckwa2XQ0.js","/assets/CellLink-gxSoVhpH.js","/assets/Cells-BdJ3D8zY.js","/assets/ColumnFilter-CQQi0xRH.js","/assets/ColumnsPicker-DDWcfIuQ.js","/assets/CommentsModal-DtMRLMYX.js","/assets/ComparisonTable-BFYXFyVG.js","/assets/Concerns-BZhotHoi.js","/assets/ConfirmDialog-tKWfIewT.js","/assets/Daily-BS6Qh3Ug.js","/assets/DataTable-C5pVNeoX.js","/assets/DateRangePicker-B_a9cdLS.js","/assets/DayReportView-MDTaj-U0.js","/assets/DayStepper-Bo-tKuj6.js","/assets/DifferenceBreakdown-D_n-dS8H.js","/assets/Downtime-BzqHcScU.js","/assets/Education-CkSPNJLE.js","/assets/EducationLesson-CdfJEFD1.js","/assets/EmptyState-CMsvvt2l.js","/assets/Exam-vifcp23z.js","/assets/FactorySelect-wT5QK3SB.js","/assets/Gamification-DCHe0CnO.js","/assets/GroupBadge-B31eeKoj.js","/assets/HeatmapChart-CkqXOVsQ.js","/assets/IdleCell-PLe7WNO4.js","/assets/KPICard-Cs2kG6a6.js","/assets/Kaizen-CwOJGqCS.js","/assets/Kelish-Cj9hvloz.js","/assets/KpiDeltaCard-b-KSbLn5.js","/assets/LangTextInput-Bdbg1xms.js","/assets/Layout-BHmSMeIf.js","/assets/LeaderAppeal-CCo79b-i.js","/assets/LeaderDayReport-wbXxhgXe.js","/assets/LeaderUnitReport-CAQ6V2mA.js","/assets/Leaderboard-YdPefS-8.js","/assets/Leaders-CdJGy9b-.js","/assets/Lightbox-Dav5CCgk.js","/assets/LiveOverview-C0sJMWq8.js","/assets/Login-B9H4AcJd.js","/assets/NotFound-BmODs4nZ.js","/assets/Notifications-CB5LRGUG.js","/assets/Overview-tJtdOEnw.js","/assets/Pagination-u3LwCcvG.js","/assets/PerenaladkaFactTable-Q68SeI2c.js","/assets/PersonCard-BGb9EED9.js","/assets/PlanFulfillment-CAxeKwuX.js","/assets/Production-EUrHnWRD.js","/assets/Profile-BJttWrRx.js","/assets/ProofCamera-i0OJ69gW.js","/assets/ProofPhoto-C3gz8ex4.js","/assets/Quality-De7Rp6ae.js","/assets/RawRows-1VVmJ18o.js","/assets/RequestStateChip-G0eJveGD.js","/assets/RichTextEditor-d3zDW81a.js","/assets/SaveState-mVZsJf6l.js","/assets/SearchInput-pUrGp3xN.js","/assets/SeasonalityHeatmap-mnDQmJAp.js","/assets/SegmentedToggle-BxwHwHjp.js","/assets/SetupTimes-3LZJ9gQa.js","/assets/ShiftDaily-BVfgpZPn.js","/assets/Staff-DRN5NdYR.js","/assets/StaffLive-B3znQ1ry.js","/assets/StatusBadge-Bfp9Bkll.js","/assets/TargetGoal-DTh3pZ7X.js","/assets/Targets-BULI7zgH.js","/assets/Tasks-DurOhDiu.js","/assets/TimeWheelPicker-NDzVNlnV.js","/assets/Toast-dyG7VlML.js","/assets/Tooltip-C7qq-SCw.js","/assets/TrendChart-D_Ed0of9.js","/assets/TripleSpeedometer-BuirJaBT.js","/assets/Trudoyomkost-DnQNVnn6.js","/assets/UploadDropzone-D1LFK9Gi.js","/assets/UsersActivity-cng5P0sn.js","/assets/VerdictBlock-CjD3HRsT.js","/assets/VfxAbsences-DFHAtB7t.js","/assets/VfxApiMap-0Z9FsVmJ.js","/assets/VfxDevices-B9NA1TV-.js","/assets/VfxDictionaries-DhzpOgWi.js","/assets/VfxEmployees-BznDXnHu.js","/assets/VfxHrMoves-UNqxKSTq.js","/assets/VfxIncidents-CQ9Tff_g.js","/assets/VfxJobs-QxKcuQCH.js","/assets/VfxMarks-BOdbSMGz.js","/assets/VfxOnSite-DttGx_r3.js","/assets/VfxPayroll-BUUHSExE.js","/assets/VfxPhoto-BgBVqbLv.js","/assets/VfxRequests-D2iO-sAa.js","/assets/VfxShifts-Cq9s3O2z.js","/assets/VfxState-CK-NfsVu.js","/assets/VfxStructure-B9BZL3s-.js","/assets/VfxTable-Dxs0spOx.js","/assets/VfxTimebooks-B4adY4qm.js","/assets/VfxTimesheet-GLGRGRje.js","/assets/WatchProgress-CVJBRPyA.js","/assets/WebLogin-BxR3NKeR.js","/assets/WorkerConcerns-DkrcxPZQ.js","/assets/Workers-lEniEd-v.js","/assets/Zagruzka-Ceg6t-1n.js","/assets/ZagruzkaCell-_gcD3lci.js","/assets/api-YX3E3KlX.js","/assets/archive-Cjycwgrr.js","/assets/archive-restore-CcY1JuC-.js","/assets/arrow-down-Dq3S9qpg.js","/assets/arrow-down-right-BbVZk5zT.js","/assets/arrow-left-CnRXya-q.js","/assets/arrow-up-CzCxMsp-.js","/assets/arrow-up-narrow-wide-DxFgEzrq.js","/assets/arrow-up-right-vCieFeRc.js","/assets/award-watEJ01s.js","/assets/ban-D5Dz-4zc.js","/assets/bot-DuUHlb8i.js","/assets/boxes-BE7VREZM.js","/assets/braces-Cdwss2rR.js","/assets/brigadirFilters-BvqPUMzj.js","/assets/broadcastTree-CmmnqpIa.js","/assets/building-2-Y1DGCDON.js","/assets/calendar-days-Bqju7hQf.js","/assets/calendar-mpMBpN6_.js","/assets/camera-CIj7o3TW.js","/assets/categories-CgLmjI4E.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CdP8ETzz.js","/assets/chart-line-D2erKP3z.js","/assets/chart-pie-ke1WCT-9.js","/assets/chartRange-vV9GN1v_.js","/assets/chevron-left-CGTeDl-i.js","/assets/chevrons-up-down-P0TP5VTq.js","/assets/circle-CLvfHVi_.js","/assets/circle-alert-BopGNoe-.js","/assets/circle-check-big-D4tJNaxP.js","/assets/circle-dashed-CGA5sLAP.js","/assets/circle-minus-SGEmm3YU.js","/assets/circle-question-mark-BYECtyZv.js","/assets/circle-slash-CQfa5-zZ.js","/assets/circle-user-round-C4AoY9jI.js","/assets/clock-3-mii36afW.js","/assets/cloud-off-CRjP2dz7.js","/assets/cloud-upload-CloCrSGw.js","/assets/compass-CcoNjuTn.js","/assets/concernCategories-DJmApmxv.js","/assets/copy-B3cX9MSJ.js","/assets/corner-down-right-DIKnQk_3.js","/assets/createLucideIcon-CqkntKp3.js","/assets/door-open-D9uB_Fn9.js","/assets/es-BbTflXBu.js","/assets/exportXlsx-uUsLI7hw.js","/assets/external-link-KTE9_QII.js","/assets/file-clock-DJrgAsML.js","/assets/file-exclamation-point-8KKeAhG3.js","/assets/file-spreadsheet-Ckh9HYp0.js","/assets/file-text-DD2nDcGs.js","/assets/flag-JhSNZJMj.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Dx9yN0xB.js","/assets/hash-PdUaPHMF.js","/assets/history-Cr4PUd6r.js","/assets/hourglass-Cdd4keo3.js","/assets/image-off-DpazzYHD.js","/assets/image-q3v93LDQ.js","/assets/index-DjFgzKy6.js","/assets/index-YBeOcWwc.css","/assets/key-round-ClcwmFXc.js","/assets/keyboard-BeIM56S5.js","/assets/languages-qc7XPd-t.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-29sMRnPQ.js","/assets/lightbulb-DoSbE4M3.js","/assets/link-2-EOIK9X7c.js","/assets/link-2-off-Bxkedp7g.js","/assets/list-ordered-COk36fFL.js","/assets/list-tree-DSFZMj51.js","/assets/lock-open-BBl9rR1G.js","/assets/log-in-BohFaK2V.js","/assets/maximize-2-Cxuqggjt.js","/assets/message-square-CiyrL-Rd.js","/assets/minimize-2-C4520Q9c.js","/assets/package-check-BMlZZ53x.js","/assets/paperclip-DssXPmr9.js","/assets/pencil-DZjHbDZB.js","/assets/percent-CQuVm6XB.js","/assets/phone-C_3qARyz.js","/assets/pin-Bwg-NL0v.js","/assets/pin-off-DMqbGiA6.js","/assets/play-D1Q5X_Hv.js","/assets/plug-zap-fciTIwTk.js","/assets/presentation-BJ4aEP_s.js","/assets/prop-types-BSPiNyTf.js","/assets/radio-D_nMe48T.js","/assets/react-apexcharts.esm-Cn8Bnl_S.js","/assets/registers-CS3BlUJC.js","/assets/repeat-DXz_A0ng.js","/assets/rotate-ccw-DM4YRJd7.js","/assets/rotate-cw-BF6yAqBo.js","/assets/save-DyF6Blcy.js","/assets/scopeLinks-CYyU_6ka.js","/assets/scroll-text-BSbUcqLP.js","/assets/search-x-Cw0lkZ9T.js","/assets/segments-Dqq-Oo4w.js","/assets/send-NakjSIyB.js","/assets/settings-2-ByDQOcI9.js","/assets/shield-6fHefaFI.js","/assets/shield-alert-B4K9IbW3.js","/assets/shield-check-CYxLzQhJ.js","/assets/shield-question-mark-ByFQxwrq.js","/assets/snowflake-yLliUI5P.js","/assets/split-Bk_TaXgo.js","/assets/square-CTSHi5R3.js","/assets/square-check-big-CTvPYA0K.js","/assets/star-Dt0mfua_.js","/assets/statusBands-DJP7GgPz.js","/assets/store-BUTuoY0Y.js","/assets/table-2-C9HWIZSW.js","/assets/table-properties-Cs1WXlYY.js","/assets/tag-ViKLedTD.js","/assets/tags-BJTDTdQu.js","/assets/timer-off-Bvt6CWY7.js","/assets/trending-down-DQS-XD2I.js","/assets/trending-up-DjFrSLE0.js","/assets/undo-2-BmK8BN9n.js","/assets/useChartTheme-YiG10jbi.js","/assets/useElementWidth-DjIdsV5q.js","/assets/useIsMobile-CcHXXGCN.js","/assets/useOpenParam-4NMHEKF5.js","/assets/useStatusBands-B63RyLg9.js","/assets/useUrlScope-CPBTgG74.js","/assets/user-DKFU9nuI.js","/assets/user-cog-7Qp3JcH0.js","/assets/user-minus-BNQFJxLC.js","/assets/users-Cs0J_4zv.js","/assets/video-CSED4Rzi.js","/assets/wallet-8KizLy4Q.js","/assets/warehouse-tAFPLmDn.js","/assets/x-DJ7nyzro.js","/assets/zap-Cr8P4Zor.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
