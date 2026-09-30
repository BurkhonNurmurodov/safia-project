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

const BUILD = "2026-09-30T06:05:12.136Z";
const PRECACHE = ["/","/assets/AdminPanel-BvSMNmZi.js","/assets/AnalysisBoard-hC_BBunY.js","/assets/Arc-r0VRCsyh.js","/assets/ArcLegacy-D-p0dbAx.js","/assets/AttendanceModal-ByLm17Zc.js","/assets/BrigadirProfile-DHj3LfUh.js","/assets/BroadcastReceivers-fBt4gdy0.js","/assets/BroadcastRecord-D254IGy5.js","/assets/CatLockNotice-BG7eN5nR.js","/assets/CategoryLegendModal-vzNicyfm.js","/assets/CellConcerns-DimtIB0c.js","/assets/CellDetails-BsX0dawu.js","/assets/CellFormModal-k_DKqLJv.js","/assets/CellLink-Bf-7HDIW.js","/assets/Cells-CPQnFiaC.js","/assets/ColumnFilter-BYkPcYsZ.js","/assets/ColumnsPicker-uBaooChv.js","/assets/CommentsModal-Wdw4Iasb.js","/assets/ComparisonTable-BPtuViuK.js","/assets/Concerns-D12F9J6g.js","/assets/ConfirmDialog-DsYjXPkR.js","/assets/Daily-CyVN1T8M.js","/assets/DataTable-CrWIyrWx.js","/assets/DateRangePicker-X5HrOszv.js","/assets/DayReportView-BxL4BH5W.js","/assets/DayStepper-jt6T6fup.js","/assets/DifferenceBreakdown-DCY2Stpg.js","/assets/Downtime-CflXwc1C.js","/assets/Education-BcCIbdo7.js","/assets/EducationLesson-Cnevu9If.js","/assets/EmptyState-C7pT8myY.js","/assets/Exam-4BuFG5k2.js","/assets/FactorySelect-Dm2VguxJ.js","/assets/Gamification-C52yQmOQ.js","/assets/GroupBadge-BSA3TMXv.js","/assets/HeatmapChart-CF1Kay8x.js","/assets/IdleCell-B6QfBGIs.js","/assets/KPICard-RdkeDWw0.js","/assets/Kaizen-DT9NjikL.js","/assets/Kelish-BWbF-r3f.js","/assets/KpiDeltaCard-B2aRE2uy.js","/assets/LangTextInput-BS9AwFqq.js","/assets/Layout-BGaawQCe.js","/assets/LeaderAppeal-Caw1zIjh.js","/assets/LeaderDayReport-Brre4jtr.js","/assets/LeaderUnitReport-DJoUXJ92.js","/assets/Leaderboard-Ba-VPE5t.js","/assets/Leaders-C-npUFvd.js","/assets/Lightbox-BJfhJTTK.js","/assets/LiveOverview-BhNtOIO1.js","/assets/Login-BMrHJ-jZ.js","/assets/NotFound-FTNpyY0M.js","/assets/Overview-DcTaGt8C.js","/assets/Pagination-B1fZFzJ6.js","/assets/PerenaladkaFactTable-Dm0tiyi5.js","/assets/PlanFulfillment-DrZtT0ys.js","/assets/Production-DwcWzAnw.js","/assets/Profile-DhImTCek.js","/assets/ProofCamera-BhBhNWRf.js","/assets/ProofPhoto-CiGNEnNz.js","/assets/Quality-B_5ydR1x.js","/assets/RequestStateChip-yikfE5nD.js","/assets/RichTextEditor-BzEBbGTR.js","/assets/SaveState-CZtWId07.js","/assets/SearchInput-Hbv4GewN.js","/assets/SeasonalityHeatmap-CaTJvScT.js","/assets/SegmentedToggle-BfLGLoVU.js","/assets/SetupTimes-Br9rWtUY.js","/assets/ShiftDaily-BHH4JqrS.js","/assets/Staff-DxfeVLZG.js","/assets/StatusBadge-B4wt9bOj.js","/assets/TargetGoal-BZ9Zuau8.js","/assets/Targets-B9RvJG41.js","/assets/Tasks-AIQfHLpf.js","/assets/TimeWheelPicker-D0J6q4cR.js","/assets/Tooltip-C36NbuVK.js","/assets/TrendChart-CZrhfz8B.js","/assets/TripleSpeedometer-Banfmg8O.js","/assets/Trudoyomkost-DK_B-WrE.js","/assets/UploadDropzone-D6-qmK7a.js","/assets/UsersActivity-DZtgUDxf.js","/assets/VerdictBlock-DykR3T6-.js","/assets/WatchProgress-DwLMHbpI.js","/assets/WebLogin-Dj3PVoYQ.js","/assets/WorkerConcerns-CB6YOLwH.js","/assets/Workers-BOzN9ZRs.js","/assets/Zagruzka-ugxQ93u8.js","/assets/ZagruzkaCell-BMqMrR_z.js","/assets/api-BJWOfdFC.js","/assets/archive-dVCfQUrw.js","/assets/archive-restore-Dd4RLNAH.js","/assets/arrow-down-QsvMvXj1.js","/assets/arrow-left-CSL5bg4r.js","/assets/arrow-left-right-BbMK2muD.js","/assets/arrow-up-CZo11jMx.js","/assets/arrow-up-narrow-wide-D5JjWe7P.js","/assets/arrow-up-right-DfbHgiz-.js","/assets/award-CJy_y471.js","/assets/ban-BxmkxHkE.js","/assets/bot-DUxdnGu7.js","/assets/boxes-2EdG11wV.js","/assets/brigadirFilters-DHAlcdy2.js","/assets/broadcastTree-BJnYLSgv.js","/assets/building-2-CEVhv7Tw.js","/assets/calendar-CP2K358P.js","/assets/calendar-clock-D3-fF8sf.js","/assets/calendar-days-PHpSuB08.js","/assets/calendar-range-DIXf5Iax.js","/assets/camera-Bx-v9Ujv.js","/assets/categories-ZQTRk6pH.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-bJs-i5IE.js","/assets/chart-line-IWHHASOI.js","/assets/chart-pie-DICs3TAC.js","/assets/chartRange-D36QKSop.js","/assets/chevron-left-CmZOKg7q.js","/assets/chevrons-up-down-CtFGypxs.js","/assets/circle-DoOeuLlu.js","/assets/circle-check-big-CGw7h4Te.js","/assets/circle-dot-BP2rsZBJ.js","/assets/circle-minus-rCygEa6U.js","/assets/circle-slash-DD7dZR6s.js","/assets/circle-user-round-DKgTKng4.js","/assets/cloud-off-dGCh6TN-.js","/assets/cloud-upload-DRMyJPLt.js","/assets/compass-BlNWKWUo.js","/assets/concernCategories-CIqRi4yy.js","/assets/copy-C1eJB2R4.js","/assets/corner-down-right-DkkgyNVP.js","/assets/createLucideIcon-Dd_ph7IG.js","/assets/es-CWD_ntI9.js","/assets/exportXlsx-BJHe6I9K.js","/assets/external-link-CJd5pJl9.js","/assets/file-clock--YcgFyKW.js","/assets/file-exclamation-point-162_ukWv.js","/assets/file-spreadsheet-Ebn49IjL.js","/assets/file-text-BVDBnidA.js","/assets/flag-Dp-7nj6d.js","/assets/flame-Cms_k1FI.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-K-sPmR5b.js","/assets/hash-5A-NA-6T.js","/assets/history-Cd78YlHT.js","/assets/hourglass-DMsuqeYL.js","/assets/image-D5dq7nhF.js","/assets/image-off-Cknq5PlN.js","/assets/index-B3zd-VVr.js","/assets/index-B8JHyLjE.css","/assets/key-round-DTcUYH-t.js","/assets/keyboard-C-qcU8cf.js","/assets/languages-Cnhgs2TU.js","/assets/layers-3ti-Eug1.js","/assets/lightbulb-CPwv8KId.js","/assets/link-2-LHOray20.js","/assets/link-2-off-BRlWH-27.js","/assets/list-checks-JeDqmuhg.js","/assets/list-ordered-BldIzrBL.js","/assets/list-tree-CipmyjeM.js","/assets/lock-open-Cl_BSLAF.js","/assets/log-in-B30mGenm.js","/assets/maximize-2-D1iydgeC.js","/assets/message-square-DpT9hSIF.js","/assets/minimize-2-CN60TOJt.js","/assets/package-check-BsAlAMY0.js","/assets/paperclip-BBUDN75Y.js","/assets/pencil-CtG6Y-pa.js","/assets/percent-DHJ2JE1x.js","/assets/personName-CogOuS3K.js","/assets/pin-off-BK9a1ni9.js","/assets/pin-ugcojujB.js","/assets/play-BoJ7mzrj.js","/assets/presentation-CE8FNQkV.js","/assets/prop-types-BAiWHRyS.js","/assets/radio-CldnHzEz.js","/assets/react-apexcharts.esm-CzHejag4.js","/assets/repeat-fn3eRZaE.js","/assets/rotate-ccw-5gsgsmXi.js","/assets/rotate-cw-0H8SvQc8.js","/assets/save-BD5T7dXI.js","/assets/scale-CpXqcAHq.js","/assets/scroll-text-x2haD6Wr.js","/assets/search-x-BlAqYbRH.js","/assets/segments-D9es9cQk.js","/assets/send-DM4ievtr.js","/assets/settings-2-Cf6GEcKH.js","/assets/shield-DF9eFG4x.js","/assets/shield-alert-H3id-pgz.js","/assets/shield-check-uygQHASE.js","/assets/shield-question-mark-SLPTPA7X.js","/assets/siren-axwke8b0.js","/assets/snowflake-D6tBV_Hw.js","/assets/square-CIjPcH8g.js","/assets/square-check-big-wLW0OmJ9.js","/assets/star-C1AwB1Dv.js","/assets/statusBands-DUc30sZU.js","/assets/store-B9HQbugv.js","/assets/table-2-C0jUhcNi.js","/assets/table-properties-Dvv8dyVR.js","/assets/tag-CGLpK7Xn.js","/assets/timer-off-Bl-8k2Aa.js","/assets/trending-down-Co34Ws_h.js","/assets/trending-up-B-x24-UY.js","/assets/undo-2-BLxZtSud.js","/assets/useChartTheme-Dnt3szeu.js","/assets/useElementWidth-nfMO6vCh.js","/assets/useIsMobile-CQQjn_Fm.js","/assets/useMutation-3BdYSITD.js","/assets/useStatusBands-BIibNjJ7.js","/assets/user-DP9V1foV.js","/assets/user-cog-DpvBC_SA.js","/assets/user-minus-CxyPGqwn.js","/assets/users-D3ae3ND6.js","/assets/video-DE_B_lqA.js","/assets/wallet-VRUO0lpa.js","/assets/warehouse-CSTUYprL.js","/assets/zap-SGu4rUnh.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
