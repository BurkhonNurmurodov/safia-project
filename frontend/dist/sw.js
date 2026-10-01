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

const BUILD = "2026-10-01T11:28:30.661Z";
const PRECACHE = ["/","/assets/AdminPanel-C-89he4-.js","/assets/AnalysisBoard-DZK1-jui.js","/assets/Arc-Dh-g3V4h.js","/assets/ArcLegacy-C-Mcnv5I.js","/assets/BrigadirProfile-CmRGZGWH.js","/assets/BroadcastReceivers-R0DdsAr0.js","/assets/BroadcastRecord-BKuIYJoG.js","/assets/CatLockNotice-DZWXVE1h.js","/assets/CategoryLegendModal-CismVCh2.js","/assets/CellConcerns-BgMNvmdj.js","/assets/CellDetails-CmRlXdqS.js","/assets/CellFormModal-Cz0j1I8U.js","/assets/CellIdent-CVyW4Zjs.js","/assets/CellLink-DN8FZyxe.js","/assets/Cells-BLI0MdOn.js","/assets/ColumnFilter-NZodqFZL.js","/assets/ColumnsPicker-Do_ekgZ1.js","/assets/CommentsModal-xLER3n8Q.js","/assets/ComparisonTable-QEV07_A1.js","/assets/Concerns-CNe8GzKo.js","/assets/ConfirmDialog-TDbsLN_n.js","/assets/Daily-Cg6oAPAZ.js","/assets/DataTable-Q0HtyF7E.js","/assets/DateRangePicker-BM7ddoqy.js","/assets/DayReportView-ckNGnQ_7.js","/assets/DayStepper-CVH9YEoE.js","/assets/DifferenceBreakdown-CiMrchRX.js","/assets/Downtime-BE4ljelU.js","/assets/Education-DWl4tXm1.js","/assets/EducationLesson-CuNcNSbW.js","/assets/EmptyState-CwDmducH.js","/assets/Exam-CFum6_Wf.js","/assets/FactorySelect-vFuISWr0.js","/assets/Gamification-B9FJikEm.js","/assets/GroupBadge-DSlJsmKV.js","/assets/HeatmapChart-BQOde3sj.js","/assets/IdleCell-CJgfMBBL.js","/assets/KPICard-1geEHS2c.js","/assets/Kaizen-G673Tab6.js","/assets/Kelish-RP8OQfeY.js","/assets/KpiDeltaCard-BnP2Difj.js","/assets/LangTextInput-aIxCiHF-.js","/assets/Layout-DZWepYCb.js","/assets/LeaderAppeal-BytH-uC-.js","/assets/LeaderDayReport-CNGBwR1v.js","/assets/LeaderUnitReport-DkLrIkta.js","/assets/Leaderboard-BYHyYO9R.js","/assets/Leaders-6F7SHaRg.js","/assets/Lightbox-CSQV8BXu.js","/assets/LiveOverview-tX3cjm3y.js","/assets/Login-C5L8fwrA.js","/assets/NotFound-DymqyspR.js","/assets/Overview-CL0OcH8K.js","/assets/Pagination-DP449PhK.js","/assets/PerenaladkaFactTable-Bw0dAOk6.js","/assets/PlanFulfillment-c7wveD0n.js","/assets/Production-CN2MJBrq.js","/assets/Profile-CfZ8WFDJ.js","/assets/ProofCamera-BnSYljz5.js","/assets/ProofPhoto-BQxnzf3X.js","/assets/Quality-D6NsQIwR.js","/assets/RequestStateChip-CB5konV5.js","/assets/RichTextEditor-a5ObTFhH.js","/assets/SaveState-mJ_cfqHu.js","/assets/SearchInput-Bp6kzktM.js","/assets/SeasonalityHeatmap-DZ5qAbNT.js","/assets/SegmentedToggle-D2New0Fo.js","/assets/SetupTimes-NEELBxRv.js","/assets/ShiftDaily-Ca5wS4IB.js","/assets/Staff-cxeND231.js","/assets/StaffLive-1hIwajDA.js","/assets/StatusBadge-BZW_R-8S.js","/assets/TargetGoal-_O5ObzD1.js","/assets/Targets-KRe8B4mC.js","/assets/Tasks-BjeG9-L1.js","/assets/TimeWheelPicker-BpkPfB6Y.js","/assets/Tooltip-DBe4iyVv.js","/assets/TrendChart-ix4D3ziD.js","/assets/TripleSpeedometer-46q4p8Zl.js","/assets/Trudoyomkost-BSwdv1bh.js","/assets/UploadDropzone-DgJBmB_J.js","/assets/UsersActivity-hQIUmeCA.js","/assets/VerdictBlock-DQ-_Xuj2.js","/assets/WatchProgress-S7qxK9RU.js","/assets/WebLogin-CYDlQUMv.js","/assets/WorkerConcerns-DY8IgUzq.js","/assets/Workers-DmyFGRrK.js","/assets/Zagruzka-BJefYGU9.js","/assets/ZagruzkaCell-C88KK7Zw.js","/assets/api-BjIJE61Z.js","/assets/archive-Bb5YmORy.js","/assets/archive-restore-DoV9WFxZ.js","/assets/arrow-down-Dt4zDL5b.js","/assets/arrow-left-B68iR7M2.js","/assets/arrow-left-right-1UdKSyJe.js","/assets/arrow-right-left-Bs_3OL43.js","/assets/arrow-up-O2gsQr2w.js","/assets/arrow-up-narrow-wide-D8FT4Jyt.js","/assets/arrow-up-right-DtSXTplt.js","/assets/award-C2fBEvMY.js","/assets/ban-C-7XAIR-.js","/assets/bot-DMLxdNvy.js","/assets/boxes-LV3DHygv.js","/assets/brigadirFilters-DoxV0U4W.js","/assets/broadcastTree-Cq0fbPPC.js","/assets/building-2-Jo2rIgQH.js","/assets/calendar-CNmwn9Ck.js","/assets/calendar-clock-D0445GGF.js","/assets/calendar-days-DNvIUVIz.js","/assets/calendar-range-B8ayFDsO.js","/assets/camera-COwFROfu.js","/assets/categories-Dq2VArKX.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DAtn3ARv.js","/assets/chart-line-Cq3Sj-jK.js","/assets/chart-pie-BL8VFi8p.js","/assets/chartRange-ZyVoQPwc.js","/assets/chevron-left-ZebBsj7W.js","/assets/chevrons-up-down-LHEXlLE-.js","/assets/circle-BpgZapmU.js","/assets/circle-check-big-D_oL5CVD.js","/assets/circle-dot-BM0lTrMr.js","/assets/circle-minus-BACDQC5U.js","/assets/circle-slash-ybxblAjb.js","/assets/circle-user-round-BUZwByN6.js","/assets/cloud-off-DyovRqxU.js","/assets/cloud-upload-CkqL74iC.js","/assets/compass-C0vAVSIe.js","/assets/concernCategories-Vnf-q_ru.js","/assets/copy-DZhy4SvU.js","/assets/corner-down-right-Cd8cX2Pi.js","/assets/createLucideIcon-BJ2MKFhN.js","/assets/es-c3XjhZ6b.js","/assets/exportXlsx-DLxnlx4k.js","/assets/external-link-pfNM-wCb.js","/assets/file-clock-CEHQZC4p.js","/assets/file-exclamation-point-BeBDKeFG.js","/assets/file-spreadsheet-B3-w_8ln.js","/assets/file-text-4mwrudf4.js","/assets/flag-BVEYwZdT.js","/assets/flame-Bd4fx0_x.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CGImvJLg.js","/assets/hash-Daea7CZm.js","/assets/history-B546ZK20.js","/assets/hourglass-B8mXp61B.js","/assets/id-card-Biqduwkz.js","/assets/image-C97Qzie9.js","/assets/image-off-BuiOwov9.js","/assets/index-Azpne6mZ.css","/assets/index-DtZOuzwf.js","/assets/key-round-vwsB-Xr7.js","/assets/keyboard-BjV7gy_H.js","/assets/languages-kEWUCPK-.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C5esUCNR.js","/assets/lightbulb-6Qd39a0H.js","/assets/link-2-HWJ_ecW-.js","/assets/link-2-off-niiP0m5r.js","/assets/list-checks-B9Xq0N3E.js","/assets/list-ordered-DmSQBtAB.js","/assets/list-tree-DUn4E1Ta.js","/assets/lock-open-TRc7dvtF.js","/assets/log-in-Bd1dbLkl.js","/assets/maximize-2-CemzmLVw.js","/assets/message-square-Bs7iWtFk.js","/assets/minimize-2-DZgoqItA.js","/assets/package-check-vB7ZL-uT.js","/assets/paperclip-_jWu3DLx.js","/assets/pencil-DzsE3OuV.js","/assets/percent-Dvwxx0Wu.js","/assets/personName-CogOuS3K.js","/assets/pin-BeKl_Iy8.js","/assets/pin-off-CQKoNdfk.js","/assets/play-BUJXQoE4.js","/assets/plug-zap-VinLIcri.js","/assets/presentation-BgIDcNBw.js","/assets/prop-types-B2RRUKkK.js","/assets/radio-iAYPDxmZ.js","/assets/react-apexcharts.esm-BEViAb8k.js","/assets/repeat-CZvHmqTt.js","/assets/rotate-ccw-DQ7bxZkb.js","/assets/rotate-cw-D7XkgffV.js","/assets/save-WgZLdwzw.js","/assets/scale-C_x19ygY.js","/assets/scopeLinks-BhIQXxx4.js","/assets/scroll-text-CPs5w7bN.js","/assets/search-x-Cadfyq87.js","/assets/segments-96A8aXsk.js","/assets/send-DtNwmBRK.js","/assets/settings-2-7roudEnD.js","/assets/shield-BAnK4wIs.js","/assets/shield-alert-C9bwicTE.js","/assets/shield-check-BKy0VJ29.js","/assets/shield-question-mark-BfmkI7pM.js","/assets/siren-Cyj4bgJi.js","/assets/snowflake-D4MF2jBr.js","/assets/split-CELudU8x.js","/assets/square-C7B0rvtR.js","/assets/square-check-big-BjK3Xj7I.js","/assets/star--P0ePxW8.js","/assets/statusBands-CdNCmjfc.js","/assets/store-Sef98uVq.js","/assets/table-2-BWsx_soh.js","/assets/table-properties-BO-aVojQ.js","/assets/tag-DBH9ipxH.js","/assets/timer-off-CM8jmuxE.js","/assets/trending-down-zDxilQXG.js","/assets/trending-up-Gj624lTO.js","/assets/undo-2-CY5gQ50y.js","/assets/useChartTheme-i4MN5Vuy.js","/assets/useElementWidth-BrgtlL5e.js","/assets/useIsMobile-CV7g5ljf.js","/assets/useMutation-O-FeJ8LL.js","/assets/useStatusBands-f7lvzJ-b.js","/assets/useUrlScope-urbDqeI0.js","/assets/user-Cu7C8Dq5.js","/assets/user-cog-BZOQidwb.js","/assets/user-minus-B2LxQJxU.js","/assets/users-8pz8nQ53.js","/assets/video-qvOUshsK.js","/assets/wallet-3Le9YRcW.js","/assets/warehouse-HbjzI-zx.js","/assets/zap-DjtrYhCj.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
