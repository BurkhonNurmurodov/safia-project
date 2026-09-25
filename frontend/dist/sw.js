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

const BUILD = "2026-09-25T04:52:40.112Z";
const PRECACHE = ["/","/assets/AdminPanel-DRzOJ2Mx.js","/assets/AnalysisBoard-CMxemlrV.js","/assets/Arc-Ci_9Vv7g.js","/assets/ArcAnalysis-BPl5i_S5.js","/assets/ArcLegacy-ByQS903A.js","/assets/AttendanceModal-CMVauivy.js","/assets/BrigadirProfile-DqyCGRhQ.js","/assets/BroadcastReceivers-DglIdogg.js","/assets/BroadcastRecord-BirU92B3.js","/assets/CatLockNotice-bPVGvNfH.js","/assets/CategoryLegendModal-CbUNerRg.js","/assets/CellConcerns-B3sv2pH7.js","/assets/CellDetails-BrFq8ITG.js","/assets/CellFormModal-CmYeMPIm.js","/assets/CellLink-BgE7kQb-.js","/assets/Cells-CafLXcZn.js","/assets/ColumnFilter-QXkLkl39.js","/assets/ColumnsPicker-pcEXzxUs.js","/assets/CommentsModal-NxJnx9LV.js","/assets/ComparisonTable-kT_lg3km.js","/assets/Concerns-FywVlRWU.js","/assets/ConfirmDialog-DoEUj37i.js","/assets/Daily-BWRzDFtN.js","/assets/DataTable-CuyxDzt2.js","/assets/DateRangePicker-boA6R2ih.js","/assets/DayReportView-C2kuIOkh.js","/assets/DayStepper-3AghPXka.js","/assets/DifferenceBreakdown-CbFplLej.js","/assets/Downtime-Wz0uNVRq.js","/assets/Education-5eTTVtNU.js","/assets/EducationLesson-DYU73iY9.js","/assets/EmptyState-Ka-y_kVG.js","/assets/Exam-Cnfx3SkD.js","/assets/FactorySelect-C6zoiU2f.js","/assets/Gamification-DoLTPAqY.js","/assets/GroupBadge-B7wLfZuO.js","/assets/HeatmapChart-SiuyXsch.js","/assets/IdleCell-BhpWccwR.js","/assets/KPICard-D-Mf--di.js","/assets/Kaizen-C84V5wnu.js","/assets/KpiDeltaCard-EHwj0K4H.js","/assets/LangTextInput-DahLdyp_.js","/assets/Layout-Cys7Ew8s.js","/assets/LeaderDayReport-CzroDfX4.js","/assets/LeaderUnitReport-B21IH0gH.js","/assets/Leaderboard-DpNEdNSg.js","/assets/Leaders-Bm_rrXMv.js","/assets/LiveOverview-CEUuaK8K.js","/assets/Login-DZ7RGaum.js","/assets/NotFound-B2cmv7h5.js","/assets/Overview-DDn0p_52.js","/assets/Pagination-Pdy3NNUh.js","/assets/PerenaladkaFactTable-CbiSqUbp.js","/assets/PlanFulfillment-UtSuzm6s.js","/assets/Production-kDYQQSIR.js","/assets/Profile-BHINLDZU.js","/assets/ProofCamera-9IFR_skY.js","/assets/Quality-CGGOoRb1.js","/assets/RequestStateChip-BFsk5U-s.js","/assets/RichTextEditor-GOqjuxpt.js","/assets/SearchInput-E7f2oaFH.js","/assets/SeasonalityHeatmap-kUf6aplc.js","/assets/SegmentedToggle-cLNcZjvm.js","/assets/SetupTimes-B1PZHW11.js","/assets/ShiftDaily-DU8Xx-2m.js","/assets/Staff-DwVY3x0c.js","/assets/StatusBadge-B4x562z7.js","/assets/Targets-Dq_F11o_.js","/assets/Tasks-DL8grJRV.js","/assets/TimeWheelPicker-CTmH1e4_.js","/assets/Tooltip-8UmFehnH.js","/assets/TrendChart-DRI5UcPr.js","/assets/TripleSpeedometer-DPAwpkK7.js","/assets/Trudoyomkost-BktCj6DG.js","/assets/UsersActivity-Bm6ZA0cE.js","/assets/WatchProgress-YB3ql5Fh.js","/assets/WebLogin-DhNX1q0f.js","/assets/WorkerConcerns-BrgDvejE.js","/assets/Workers-BYP4KABr.js","/assets/Zagruzka-DpuLwKAT.js","/assets/ZagruzkaCell-Cb3s7yQc.js","/assets/alarm-clock-GssRAbGQ.js","/assets/api-CI68PS14.js","/assets/archive-CpXsXe4W.js","/assets/archive-restore-dbIGZGx6.js","/assets/arrow-down-Ccke5YKx.js","/assets/arrow-left-BYkhpE6B.js","/assets/arrow-left-right-BLgytL0P.js","/assets/arrow-up-BFGMZU8N.js","/assets/arrow-up-right-zI7uvI-E.js","/assets/award-DaR1SDUf.js","/assets/ban-Ch1xWiUC.js","/assets/bot-CULt3Ssv.js","/assets/boxes-DQqdY9Am.js","/assets/brigadirFilters-BOuh6bqn.js","/assets/broadcastTree-BLkt_IJT.js","/assets/building-2-CkeAIfMW.js","/assets/calendar-D8bGeYex.js","/assets/calendar-clock-VmAUKZYo.js","/assets/calendar-days-CtuGIXnN.js","/assets/calendar-range-WFL-l5ha.js","/assets/camera-BuYyuNpJ.js","/assets/categories-DSoIqUP0.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D3yX-eQk.js","/assets/chart-line-9rus4mAE.js","/assets/chart-pie-C5FXzbhy.js","/assets/chartRange-BvkXuT8_.js","/assets/check-check-C_z_wjeg.js","/assets/chevron-left-CamkGphp.js","/assets/chevrons-up-down-DKkm_x_B.js","/assets/circle-check-big-BosJeC7l.js","/assets/circle-dashed-C5hFkpXM.js","/assets/circle-dot-dAmwyVGq.js","/assets/circle-minus-B5skU-3Y.js","/assets/circle-slash-CuMf_X7F.js","/assets/circle-user-round-CYJSbLGj.js","/assets/coins-0ZmWOzVU.js","/assets/compass-Dg1ZULvD.js","/assets/concernCategories-BuRAqM-c.js","/assets/copy-C3XvQYx8.js","/assets/corner-down-right-C_HMK-NE.js","/assets/createLucideIcon-REzMtXpH.js","/assets/exportXlsx-DYyluOV0.js","/assets/external-link-C3f1r4S0.js","/assets/file-clock-BuTQOeRz.js","/assets/file-spreadsheet-DPqwgtOq.js","/assets/file-text-C70qQBtX.js","/assets/flag-D8lNCEHa.js","/assets/flame-LkhN7byv.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-pzoxk72i.js","/assets/hash-bVniIGdw.js","/assets/history-De-aWzHl.js","/assets/hourglass-KLcAp2ai.js","/assets/image-DhZo5B36.js","/assets/image-off-x36KpDVC.js","/assets/index-BMCZProW.css","/assets/index-YmXKqRof.js","/assets/keyboard-ChdLB_AR.js","/assets/languages-B0f0b13m.js","/assets/layers-D4rZFzqM.js","/assets/leaderReason-zYanzhrg.js","/assets/lightbulb-DF4d0VG6.js","/assets/link-2-CBWksgU6.js","/assets/list-checks-Cdf4JtIB.js","/assets/list-ordered-xm6wOKSb.js","/assets/lock-open-CAWGNBJ3.js","/assets/log-in-y4JJxzq9.js","/assets/message-square-Cd3jntVC.js","/assets/minimize-2-plP2PPHz.js","/assets/paperclip-B8mIcNQX.js","/assets/pencil-DrXWdUVz.js","/assets/personName-B4KId4zS.js","/assets/pin-BjbMZFSj.js","/assets/play-52I9ipVf.js","/assets/presentation-BEs2XiQs.js","/assets/prop-types-DsIZYoAa.js","/assets/radio-7yonqsB9.js","/assets/react-apexcharts.esm-qanS5-Et.js","/assets/repeat-BsbRA54l.js","/assets/rotate-ccw-B8rD1H0p.js","/assets/rotate-cw-BErkTB-d.js","/assets/save-DC_lt8Rj.js","/assets/scale-Cw-93EJN.js","/assets/scroll-text-DrULIF1_.js","/assets/search-x-BrUjpUTl.js","/assets/segments-4eupVWtm.js","/assets/send-Du1PrQZU.js","/assets/settings-2-DTAwcigs.js","/assets/shield-D5uzKZ1b.js","/assets/shield-alert-xgLfFWR_.js","/assets/shield-check-bSifep1_.js","/assets/shield-question-mark-D_RWAaKe.js","/assets/siren-BwVus_cR.js","/assets/smartphone-CVvPoZrm.js","/assets/snowflake-BIRMCZBd.js","/assets/square-UsIsO8Xi.js","/assets/square-check-big-whfv1D54.js","/assets/star-mhBqQsaA.js","/assets/statusBands-DV2heo20.js","/assets/table-2-CFarRnwq.js","/assets/tag-BjNbPXw1.js","/assets/trending-down-SJ_c6rwF.js","/assets/trending-up-DalOryA8.js","/assets/triangle-alert-YqlVRKQ-.js","/assets/undo-2-BQD0mMHM.js","/assets/useChartTheme-6zxnzDrm.js","/assets/useElementWidth-C95Zvldh.js","/assets/useIsMobile-DBh2QtXS.js","/assets/useMutation-B6jLQVXK.js","/assets/useStatusBands-DpVF3I1i.js","/assets/user-BfPPFHXW.js","/assets/user-check-CBUIKpn6.js","/assets/user-cog-7uYnJSjx.js","/assets/user-minus-BXO7Sjry.js","/assets/users-CKtrqP_j.js","/assets/verifyState-oK73GDzf.js","/assets/video-BT865F_r.js","/assets/warehouse-DZW35Vs0.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
