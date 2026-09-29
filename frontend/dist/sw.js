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

const BUILD = "2026-09-29T09:25:01.329Z";
const PRECACHE = ["/","/assets/AdminPanel-BZWC9_eU.js","/assets/AnalysisBoard-CuDa5uBa.js","/assets/Arc-DX32ZGpI.js","/assets/ArcLegacy-DXN55soC.js","/assets/AttendanceModal-BFc6YePr.js","/assets/BrigadirProfile-CafeOwSD.js","/assets/BroadcastReceivers-D8nzQxbp.js","/assets/BroadcastRecord-BwWolVG1.js","/assets/CatLockNotice-DrZUIuJ_.js","/assets/CategoryLegendModal-BuVLNhra.js","/assets/CellConcerns-BKsMbvPe.js","/assets/CellDetails-D6KDfqM1.js","/assets/CellFormModal-D0DWGhj-.js","/assets/CellLink-KsoxTrH6.js","/assets/Cells-D6AZU7Ll.js","/assets/ColumnFilter-C5c9PrOt.js","/assets/ColumnsPicker-DWAVCvT9.js","/assets/CommentsModal-Do0JJGMr.js","/assets/ComparisonTable-C_o-wb5E.js","/assets/Concerns-DM3lstBN.js","/assets/ConfirmDialog-DhwrwkwC.js","/assets/Daily-DuLqTdQk.js","/assets/DataTable-BnrneazW.js","/assets/DateRangePicker-Bjt6E24f.js","/assets/DayReportView-COcFn8kB.js","/assets/DayStepper--KfBipNu.js","/assets/DifferenceBreakdown-BeS00W4n.js","/assets/Downtime-zB783Wub.js","/assets/Education-B20ciz0t.js","/assets/EducationLesson-jeHaYGCJ.js","/assets/EmptyState-7ix1_9CF.js","/assets/Exam-B8PYId8u.js","/assets/FactorySelect-Diq5A7yN.js","/assets/Gamification-PYk6eXR7.js","/assets/GroupBadge-DNfZKH2X.js","/assets/HeatmapChart-DH5FFRtr.js","/assets/IdleCell-Ex7FsTvj.js","/assets/KPICard-DBHJ5O-5.js","/assets/Kaizen-6By4yNRd.js","/assets/Kelish-DprhT01-.js","/assets/KpiDeltaCard-BfHAjTE7.js","/assets/LangTextInput-OhkiuNPZ.js","/assets/Layout-Db60u-wH.js","/assets/LeaderAppeal-D1GCiSEz.js","/assets/LeaderDayReport-2H5V2jjQ.js","/assets/LeaderUnitReport-Dt0DyXXp.js","/assets/Leaderboard-oE9n_l_3.js","/assets/Leaders-B9SGSuul.js","/assets/Lightbox-Cie5NQIb.js","/assets/LiveOverview-B2fF1w5x.js","/assets/Login-D5Jp-1kj.js","/assets/NotFound-CffJBAgA.js","/assets/Overview-C2pyiXyu.js","/assets/Pagination-CZmXIn3Y.js","/assets/PerenaladkaFactTable-7DkfvdLq.js","/assets/PlanFulfillment-41zWd4pb.js","/assets/Production-C3zgh7rp.js","/assets/Profile-BDk1LFV6.js","/assets/ProofCamera-Bv19ImNA.js","/assets/ProofPhoto-DNaIex65.js","/assets/Quality-CjGozzEf.js","/assets/RequestStateChip-CWqskiaj.js","/assets/RichTextEditor-8Z7kXNUy.js","/assets/SaveState-DCwrOugg.js","/assets/SearchInput-5M2XQliD.js","/assets/SeasonalityHeatmap-BH-thi1r.js","/assets/SegmentedToggle-BKZus7ZY.js","/assets/SetupTimes-BxetUH-U.js","/assets/ShiftDaily-bW9dzpVr.js","/assets/Staff-DkZ9Dv5L.js","/assets/StatusBadge-CTYYgBbn.js","/assets/TargetGoal-DYuYFH6Y.js","/assets/Targets-BxcxoZLi.js","/assets/Tasks-CDcbnGBA.js","/assets/TimeWheelPicker-BAYZUL9i.js","/assets/Tooltip-DyQl75LU.js","/assets/TrendChart-DzGG34AM.js","/assets/TripleSpeedometer-BSeOWeo-.js","/assets/Trudoyomkost-DZKjxZ99.js","/assets/UploadDropzone-CEUrZLY9.js","/assets/UsersActivity-3pcxIz9K.js","/assets/VerdictBlock-B6Qubc38.js","/assets/WatchProgress-DblXdVrD.js","/assets/WebLogin-WchPbgwV.js","/assets/WorkerConcerns-BMBnr8ls.js","/assets/Workers-DYYxPXKX.js","/assets/Zagruzka-BiJ0sonm.js","/assets/ZagruzkaCell-CNoGxXOr.js","/assets/api-C7SLmlgQ.js","/assets/archive-BWLSfNXT.js","/assets/archive-restore-BlL6dEjn.js","/assets/arrow-down-BoVQlSJQ.js","/assets/arrow-left-CVIuiWa7.js","/assets/arrow-left-right-9TwxS45l.js","/assets/arrow-up-C-cH25fS.js","/assets/arrow-up-narrow-wide-CZGpPlHZ.js","/assets/arrow-up-right-BpG56_qA.js","/assets/award-B4WiseYY.js","/assets/ban-DAiAQmmE.js","/assets/bot-CUcRcIYj.js","/assets/boxes-DHgYKdK_.js","/assets/brigadirFilters-hSe-Y9JV.js","/assets/broadcastTree-TVulI_NC.js","/assets/building-2-Dijd_9Pf.js","/assets/calendar-BfN8RPB4.js","/assets/calendar-clock-MQfOofdM.js","/assets/calendar-days-Df4t-UzJ.js","/assets/calendar-range-BlRdiqF8.js","/assets/camera-D5zNjKAA.js","/assets/categories-Djquw6aO.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-lf21xgKd.js","/assets/chart-line-Bb_v-cns.js","/assets/chart-pie-KsnMMxwy.js","/assets/chartRange-ddGDEiwL.js","/assets/chevron-left-_kXWfV6w.js","/assets/chevrons-up-down-Bb-CYCEo.js","/assets/circle-DChVV9Uo.js","/assets/circle-check-big-CHV7g3a5.js","/assets/circle-dot-CwSCj9XN.js","/assets/circle-minus-8wbpTsXW.js","/assets/circle-slash-rPioAhA7.js","/assets/circle-user-round-BdQW_uJC.js","/assets/cloud-off-B7Dcb4PU.js","/assets/cloud-upload-BIp3a8mR.js","/assets/compass-BjnokTnG.js","/assets/concernCategories-fBbhldIZ.js","/assets/copy-Bl70wsQZ.js","/assets/corner-down-right-D6oEizIf.js","/assets/createLucideIcon-UNNkiYQo.js","/assets/es-jv6b4g9p.js","/assets/exportXlsx-CSTc0967.js","/assets/external-link-XXMoeTym.js","/assets/file-clock-BFfeW6Gs.js","/assets/file-exclamation-point-DOFO7T3d.js","/assets/file-spreadsheet-BeHVN5q-.js","/assets/file-text-DhIKEyMm.js","/assets/flag-yGLP1DtW.js","/assets/flame-Daxjdoah.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CH3DooAm.js","/assets/hash-BJ-oHsea.js","/assets/history-DOH-l0UV.js","/assets/hourglass-Bsqq-Iga.js","/assets/image-DV4epfFv.js","/assets/image-off-BxgIblZY.js","/assets/index-Bv-yyjlJ.js","/assets/index-D7XvDwTb.css","/assets/key-round-BycLpcLi.js","/assets/keyboard-DkshXQka.js","/assets/languages-ILu0fitf.js","/assets/layers-BzTTFCi-.js","/assets/lightbulb-BY_ZuVsD.js","/assets/link-2-D8zeGAq1.js","/assets/link-2-off-DIVJuEzV.js","/assets/list-checks-BBcNDMiN.js","/assets/list-ordered-vCtMcHea.js","/assets/list-tree-Dou43twj.js","/assets/lock-open-Dq1vldUe.js","/assets/log-in-JwGL6bK7.js","/assets/maximize-2-ZTvNJYrT.js","/assets/message-square-BfEPCCc5.js","/assets/minimize-2-3Xumci2e.js","/assets/package-check-mYOsuJD6.js","/assets/paperclip-CFIzFanX.js","/assets/pencil-Bj5P-R6-.js","/assets/percent-ADTJ1rqG.js","/assets/personName-B4KId4zS.js","/assets/pin-DU77R4y7.js","/assets/pin-off-DmVHq8TQ.js","/assets/play-BR5jvvJv.js","/assets/presentation-Bm2nh1z1.js","/assets/prop-types-B0-Baz7-.js","/assets/radio-Do7mCD7M.js","/assets/react-apexcharts.esm-DGZX-gSR.js","/assets/repeat-DH7ekzVj.js","/assets/rotate-ccw-Dv1CDzu2.js","/assets/rotate-cw-CtnLDxSY.js","/assets/save-D9MgEUbn.js","/assets/scale-DRHAVLfv.js","/assets/scroll-text-CueWSKnY.js","/assets/search-x-CVTubucL.js","/assets/segments-B9NpuzDw.js","/assets/send-DlvlC9Tz.js","/assets/settings-2-Blq6_6uG.js","/assets/shield-8yIW4qje.js","/assets/shield-alert-Dj5WijvL.js","/assets/shield-check-5jThBViW.js","/assets/shield-question-mark-D3tZ7oTj.js","/assets/siren-CK9hI7gO.js","/assets/snowflake-C3Cey9og.js","/assets/square-BvyMenoO.js","/assets/square-check-big-CnocVI3a.js","/assets/star-CfjFuPPB.js","/assets/statusBands-CUkxO8iT.js","/assets/store-B03rv8eI.js","/assets/table-2-CuitCafL.js","/assets/table-properties-bQrlInlR.js","/assets/tag-DVX-W08V.js","/assets/timer-off-DutpBUCS.js","/assets/trending-down-DyBrj62z.js","/assets/trending-up-BVOF3FE1.js","/assets/undo-2-K9-dBkp8.js","/assets/useChartTheme-CO5a4k6y.js","/assets/useElementWidth-l17Z-F0D.js","/assets/useIsMobile-DRIVATXk.js","/assets/useMutation-D4-TilDh.js","/assets/useStatusBands-B2MFt4-o.js","/assets/user-BQnDjc2y.js","/assets/user-cog-BYYZTyzE.js","/assets/user-minus-Bq5dTTaz.js","/assets/users-jTKltA_Y.js","/assets/video-DHBN8wBp.js","/assets/wallet-zxoybm_c.js","/assets/warehouse-YRO8ycQx.js","/assets/zap-DrL_VqoY.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
