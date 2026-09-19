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
 *     cached shell, then a plain offline page — so a reload still fetches the
 *     deployed index.html and UpdatePrompt's «reload» keeps its meaning;
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

const BUILD = "2026-09-19T11:46:10.821Z";
const PRECACHE = ["/","/assets/AdminPanel-BUJFqC6R.js","/assets/AnalysisBoard-DxEne9i6.js","/assets/Arc-C5m44vQV.js","/assets/AttendanceModal-C9UsOYu8.js","/assets/BrigadirProfile-CnklVSL1.js","/assets/BroadcastReceivers-DOySVL6z.js","/assets/BroadcastRecord-D_oPTyAk.js","/assets/CatLockNotice-D-vGYjP9.js","/assets/CategoryLegendModal-CHu-RIax.js","/assets/CellConcerns-DVRKYICF.js","/assets/CellDetails-BUCfsupY.js","/assets/CellFormModal-DpkWDfPK.js","/assets/CellLink-DCeYQEtX.js","/assets/Cells-BIZGfmTN.js","/assets/ColumnFilter-Crn-NffL.js","/assets/ColumnsPicker-D7QRQy8I.js","/assets/CommentsModal-t3XSs6A3.js","/assets/ComparisonTable-2yv77CGB.js","/assets/Concerns-Bf3FORSu.js","/assets/ConfirmDialog-ILKlIk9j.js","/assets/Daily-iBe8RvjV.js","/assets/DataTable-BxuWi2Wu.js","/assets/DateRangePicker-38MCspWL.js","/assets/DayReportView-DJrp2JyL.js","/assets/DayStepper-DfYDboST.js","/assets/DifferenceBreakdown-ClLZrwHz.js","/assets/Downtime-DeOhk5w_.js","/assets/Education-BUMekfZs.js","/assets/EducationLesson-BfNlvDkE.js","/assets/EmptyState-Ki31VkyX.js","/assets/FactorySelect-x68COt6Z.js","/assets/FormField-CsB23uVI.js","/assets/Gamification-qRcJx3q4.js","/assets/GroupBadge-yPLHxV2r.js","/assets/HeatmapChart-CUfKkv_T.js","/assets/IdleCell-B4HexcXc.js","/assets/KPICard-CQMwHbsm.js","/assets/Kaizen-DUXv9aAW.js","/assets/KpiDeltaCard-DhbsI-7p.js","/assets/LangTextInput-CYScChPC.js","/assets/Layout-k4oqYWTt.js","/assets/LeaderDayReport-C31fM0nE.js","/assets/LeaderUnitReport-CV8CJatB.js","/assets/Leaderboard-BGYLkoGv.js","/assets/Leaders-C2sbVn6O.js","/assets/LiveOverview-C9s0s4O8.js","/assets/Login-j9NfXy8v.js","/assets/NotFound-BNt8q7ij.js","/assets/Overview-J3yc65q6.js","/assets/Pagination-B_osah8a.js","/assets/PerenaladkaFactTable-C2iPxIsg.js","/assets/PlanFulfillment-CGr3qotD.js","/assets/Production-BCqDQJDD.js","/assets/Profile-sTFTwTLd.js","/assets/ProofCamera-CmxJn3uu.js","/assets/ProofPhoto-BZu7MfRe.js","/assets/Quality-BlJAfk_F.js","/assets/RichTextEditor-CCZjVlTz.js","/assets/SearchInput-DNaFMBLH.js","/assets/SeasonalityHeatmap-DxdpAkip.js","/assets/SegmentedToggle-CHKhO329.js","/assets/SetupTimes-CPaFMFvU.js","/assets/ShiftDaily-BATY289k.js","/assets/Skeleton-_JcFteNA.js","/assets/Staff-CXpMmFUn.js","/assets/StatusBadge-CN5OJmaQ.js","/assets/StyledSelect-BD435fuP.js","/assets/Tasks-BmdT6M98.js","/assets/TimeField-D30Z6wbu.js","/assets/TimeWheelPicker-C8JmdsLH.js","/assets/Toast-DlmpUNN4.js","/assets/Tooltip-daKuxzJM.js","/assets/TrendChart-NXURzu_y.js","/assets/TripleSpeedometer-Cjuk4k0e.js","/assets/Trudoyomkost-DK3hnT4_.js","/assets/UsersActivity-Bal9CxV5.js","/assets/WatchProgress-BqWTzw3m.js","/assets/WebLogin-Cs3p1LAz.js","/assets/WorkerConcerns-DQQFEKZb.js","/assets/Workers-CKkTs1gy.js","/assets/Zagruzka-Bw8lHTRH.js","/assets/ZagruzkaCell-B3rv99JS.js","/assets/alarm-clock-nGVIdby5.js","/assets/api-CJYm72uI.js","/assets/archive-D2Kq2eoD.js","/assets/archive-restore-4RkxQ7NW.js","/assets/arrow-down-DFW942w1.js","/assets/arrow-left-fxmlw7iG.js","/assets/arrow-left-right-BSw0YSbo.js","/assets/arrow-right-CKBE7h3p.js","/assets/arrow-up-L68FK0a-.js","/assets/award-Cb-nPqY9.js","/assets/ban-KAND4Pst.js","/assets/bot-D4tB8ImE.js","/assets/boxes-BwX9Z381.js","/assets/brigadirFilters-CnDgbqjw.js","/assets/broadcastTree-DG9wbncu.js","/assets/building-2-DcnW97UF.js","/assets/calendar-8KiIhnrF.js","/assets/calendar-clock-CFip1CoC.js","/assets/calendar-days-CLWnG1Fv.js","/assets/calendar-range-Cco8voy0.js","/assets/camera-D9G3vz5t.js","/assets/categories-CLjvdsJ8.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-ClWmtinK.js","/assets/chart-line-61qvRBMX.js","/assets/chart-pie-MecKuzlr.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-BnPffmqx.js","/assets/check-W7GEEJQA.js","/assets/check-check-D6tquIB4.js","/assets/chevron-left-BzwAx5WR.js","/assets/chevrons-up-down-BM8Sg_gZ.js","/assets/circle-dot-DVSlCzYO.js","/assets/circle-minus-BZLSeu16.js","/assets/circle-slash-YNkYpu6F.js","/assets/circle-user-round-CL65y8cl.js","/assets/compass-DEq4ApRP.js","/assets/concernCategories-Bvq73nnz.js","/assets/copy-B8D_nxdZ.js","/assets/corner-down-right-Vsk4o8FS.js","/assets/createLucideIcon-xTHRU0Rn.js","/assets/exportXlsx-D3yAKRnY.js","/assets/external-link-gMvNt6uZ.js","/assets/file-clock-CcZVDKjK.js","/assets/file-spreadsheet-DGPEMBPQ.js","/assets/file-text-CgHq-dby.js","/assets/flag-DSaMfquT.js","/assets/flame-wa7ezlCU.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-fPbGX_DQ.js","/assets/funnel-21PUWMbZ.js","/assets/hash-CCiik2wM.js","/assets/history-CrnHd62P.js","/assets/hourglass-ByRyb3iv.js","/assets/image-B_TA2i0z.js","/assets/image-off-Df_HuAZ2.js","/assets/index-Mj557yIU.js","/assets/index-PYkJVL39.css","/assets/keyboard-BR2b5liE.js","/assets/languages-3xMl6d_Z.js","/assets/layers-D4oJjTwa.js","/assets/leaderReason-DW8dIUuy.js","/assets/lightbulb-DFnqxncK.js","/assets/link-2-BQIlqq-_.js","/assets/list-checks-kAuPFRTe.js","/assets/list-ordered-BxuVoE_-.js","/assets/lock-open-Bo6mqKk0.js","/assets/log-in-CSy_rQbz.js","/assets/message-square-CQGopQJA.js","/assets/minimize-2-BJrQq_dX.js","/assets/minus-B8wnQcOB.js","/assets/paperclip-nEXF9-wu.js","/assets/pencil-B7SBcXI8.js","/assets/pencil-line-D6yq0RWF.js","/assets/personName-B4KId4zS.js","/assets/pin-CgmT9QwO.js","/assets/play-CDpgEpvQ.js","/assets/prop-types-8gqrvcsY.js","/assets/radio-DA7Q3Igx.js","/assets/react-apexcharts.esm-CxJyrz6i.js","/assets/refresh-cw-DcD7hQv-.js","/assets/repeat-BJIS6GB6.js","/assets/rotate-ccw-hv9jashZ.js","/assets/rotate-cw-BFTH-Yk6.js","/assets/save-Bo9KDH7-.js","/assets/scale-ClJFs3hK.js","/assets/scroll-text-BYjOxf-x.js","/assets/search-x-BsfBsVf_.js","/assets/segments-DLwvMKqH.js","/assets/send-Hi01WAWq.js","/assets/settings-2-CIVexuyV.js","/assets/shield-alert-DlJhRjAO.js","/assets/shield-cchH10nb.js","/assets/shield-check-bI3Qkw6m.js","/assets/shield-question-mark-De5ipkBB.js","/assets/siren-CXuuJgfn.js","/assets/smartphone-CmyeSNQ5.js","/assets/snowflake-CJ6KgoSP.js","/assets/star-COC8iKEy.js","/assets/statusBands-CveVCtu1.js","/assets/table-2-Do2KgoJA.js","/assets/tag-C5NV2rVB.js","/assets/trash-2-BviRJ9Zl.js","/assets/trending-down-sOLPb-YJ.js","/assets/trending-up-qpNTcBkC.js","/assets/undo-2-51EI9niO.js","/assets/useChartTheme-C9wu5jog.js","/assets/useElementWidth-D35BgnSK.js","/assets/useIsMobile-D6ggCGo4.js","/assets/useMutation-ByvCXJ00.js","/assets/useStatusBands-B9iF6PTe.js","/assets/user-check-DKgkzc9A.js","/assets/user-cog-BXL2Mun9.js","/assets/user-minus-N-a-mTAu.js","/assets/users-CWlc37ce.js","/assets/verifyState-BzqMARhR.js","/assets/video-ZG17LRib.js","/assets/warehouse-CPJYo7E9.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg"];
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
    // is showing. Hashed assets come out of the browser's own HTTP cache where
    // it already holds them (they are served immutable), so a deploy only ever
    // downloads what changed.
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

async function shell(req) {
  const cache = await caches.open(CACHE);
  const fresh = fetch(req).then((res) => {
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
      cache.put(SHELL, res.clone());
    }
    return res;
  });
  fresh.catch(() => {}); // a failure after the cached shell already went out is not an error
  const late = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS, null));
  try {
    const res = await Promise.race([fresh, late]);
    if (res) return res;
  } catch {
    // offline — fall through to the cached shell
  }
  const cached = await cache.match(SHELL, MATCH);
  if (cached) return cached;
  try {
    return await fresh;
  } catch {
    return offlinePage();
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req, MATCH);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.status === 200) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.status === 200) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(req, MATCH);
    if (hit) return hit;
    throw err;
  }
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
