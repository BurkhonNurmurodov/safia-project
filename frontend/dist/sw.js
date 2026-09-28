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

const BUILD = "2026-09-28T16:03:03.702Z";
const PRECACHE = ["/","/assets/AdminPanel-B-MKpcL6.js","/assets/AnalysisBoard-E6_OX1DG.js","/assets/Arc-CYK6f1Qo.js","/assets/ArcLegacy-sig5Ua8D.js","/assets/AttendanceModal-D80crKri.js","/assets/BrigadirProfile-9tF_M1CB.js","/assets/BroadcastReceivers-wluR66zc.js","/assets/BroadcastRecord-CJwXK_WR.js","/assets/CatLockNotice-C5kA0eth.js","/assets/CategoryLegendModal-CKc39dsW.js","/assets/CellConcerns-qwbrQ4GO.js","/assets/CellDetails-CBv2KK51.js","/assets/CellFormModal-CnUMCw01.js","/assets/CellLink-D5KSJTnM.js","/assets/Cells-BSA0b2LK.js","/assets/ColumnFilter-BDz4Al-f.js","/assets/ColumnsPicker-CepOv9E1.js","/assets/CommentsModal-bPpmaapT.js","/assets/ComparisonTable-jW5D0bvW.js","/assets/Concerns-qCpFCcAN.js","/assets/ConfirmDialog-DJ8z0Wde.js","/assets/Daily-BbZrB7S4.js","/assets/DataTable-CBG9Xg6p.js","/assets/DateRangePicker-8p3hPxwf.js","/assets/DayReportView-DJWVZLpn.js","/assets/DayStepper-CrBXJ4EU.js","/assets/DifferenceBreakdown-DxBLEtJZ.js","/assets/Downtime-DCHXykxP.js","/assets/Education-DdDzkO8l.js","/assets/EducationLesson-qug3gWXU.js","/assets/EmptyState-BlOXl8u7.js","/assets/Exam-Cjj88ZvM.js","/assets/FactorySelect-Bt1BPGzO.js","/assets/Gamification-D-dt3k-q.js","/assets/GroupBadge-B517p_cs.js","/assets/HeatmapChart-ByxDwreq.js","/assets/IdleCell-BeuUsgDg.js","/assets/KPICard-CEYOUayX.js","/assets/Kaizen-CRxsOwqc.js","/assets/Kelish-D7EpZMXU.js","/assets/KpiDeltaCard-BtGNsAbl.js","/assets/LangTextInput-CmQ54esB.js","/assets/Layout-klPn4OBE.js","/assets/LeaderAppeal-CBbgLxoY.js","/assets/LeaderDayReport-YdfYWil5.js","/assets/LeaderUnitReport-DYFs-YTU.js","/assets/Leaderboard-B8xOX4kB.js","/assets/Leaders-CsCzEIUU.js","/assets/Lightbox-CsmTIKiz.js","/assets/LiveOverview-BNoyLL-b.js","/assets/Login-HeHjibVn.js","/assets/NotFound-BJFSa6ad.js","/assets/Overview-P2lL3Z4s.js","/assets/Pagination-CK2d3tvd.js","/assets/PerenaladkaFactTable-BXtZxFxE.js","/assets/PlanFulfillment-R3N5sqpo.js","/assets/Production-GKGykVwg.js","/assets/Profile-C7saTlwk.js","/assets/ProofCamera-Cadv0urY.js","/assets/ProofPhoto-DsuCPiwR.js","/assets/Quality-C9cn2zPn.js","/assets/RequestStateChip-CDnjk4aL.js","/assets/RichTextEditor-Cx1ojZXH.js","/assets/SaveState-CzxjwD5F.js","/assets/SearchInput-BDtWiWCW.js","/assets/SeasonalityHeatmap-DnrOWtb8.js","/assets/SegmentedToggle-DTft4yGA.js","/assets/SetupTimes-COi7oeID.js","/assets/ShiftDaily-Dg-2D8Sp.js","/assets/Staff-BFfsYDrC.js","/assets/StatusBadge-BxKqt9gc.js","/assets/TargetGoal-DmiEwWeo.js","/assets/Targets-D7S9UKfE.js","/assets/Tasks-B2G7QJJH.js","/assets/TimeWheelPicker-C4bgncOz.js","/assets/Tooltip-PzwAQJiA.js","/assets/TrendChart-DzmIZLDq.js","/assets/TripleSpeedometer-Cyt-LhuD.js","/assets/Trudoyomkost-BBq4-dRE.js","/assets/UploadDropzone-BuiVAJfr.js","/assets/UsersActivity-BVRb5sCV.js","/assets/VerdictBlock-D19gnsCB.js","/assets/WatchProgress-DH1VtqZc.js","/assets/WebLogin-C0lcbcku.js","/assets/WorkerConcerns-bWB5hAPB.js","/assets/Workers-DM9L88Ka.js","/assets/Zagruzka-BKJzouFh.js","/assets/ZagruzkaCell-BcrztjWx.js","/assets/api-DawWZwrX.js","/assets/archive-mtc4F_1d.js","/assets/archive-restore-CSN8lmXH.js","/assets/arrow-down-BmemodjY.js","/assets/arrow-left-DjD93CUZ.js","/assets/arrow-left-right-DUwdpECZ.js","/assets/arrow-up-D1f87qwe.js","/assets/arrow-up-right-C0nCy0d-.js","/assets/award-Bg-AYzNl.js","/assets/ban-Ble2yn4U.js","/assets/bot-DvOTsJz3.js","/assets/boxes-DcKVJa-3.js","/assets/brigadirFilters-D3QDjHSF.js","/assets/broadcastTree-BADOsCo1.js","/assets/building-2-DcXt0H_R.js","/assets/calendar-CdMZtia5.js","/assets/calendar-clock-CXfGSyYu.js","/assets/calendar-days-z0glMXoa.js","/assets/calendar-range-DFMmpV43.js","/assets/camera-CIm__8jl.js","/assets/categories-C56ts0K4.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DMIeOVaY.js","/assets/chart-line-DMzVHF0z.js","/assets/chart-pie-BatGbl57.js","/assets/chartRange-CADvniS8.js","/assets/chevron-left-MYkRV9p8.js","/assets/chevrons-up-down-9vRmH1nT.js","/assets/circle-DOuvrbCC.js","/assets/circle-check-big-DxiTDcBL.js","/assets/circle-dot-kPROJTOO.js","/assets/circle-minus-DXjmRtgM.js","/assets/circle-slash-DgixxQeT.js","/assets/circle-user-round-C5OTnniS.js","/assets/cloud-off-CfKVk5j7.js","/assets/cloud-upload-W4ZLjEeS.js","/assets/compass-B91FapV2.js","/assets/concernCategories-Dch1Xpn8.js","/assets/copy-C76DPJlL.js","/assets/corner-down-right-Dt4fqNdV.js","/assets/createLucideIcon-BiBfrTie.js","/assets/es-C6Tmk68j.js","/assets/exportXlsx-B1x6Z7i1.js","/assets/external-link-BpcnzAn4.js","/assets/file-clock-CF6YRNzo.js","/assets/file-exclamation-point-CKlguNEE.js","/assets/file-spreadsheet-Pg74f9Bi.js","/assets/file-text-CbrbuunZ.js","/assets/flag-BOQSobbx.js","/assets/flame-BpHBeo7R.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-LV5zYXnR.js","/assets/hash-DG2B4hBu.js","/assets/history-Drk0isAJ.js","/assets/hourglass-CHm-2xGe.js","/assets/image-BUPYaFwT.js","/assets/image-off-CDSmW7iA.js","/assets/index-CJJDkRSj.js","/assets/index-IipDX2IN.css","/assets/key-round-BQzt7dEz.js","/assets/keyboard-W1a5VqW6.js","/assets/languages-C7z3sR-A.js","/assets/layers-Cop4Qu0_.js","/assets/lightbulb-DEF61tE7.js","/assets/link-2-BLPPJn3b.js","/assets/list-checks-C9h-exdH.js","/assets/list-ordered-BSLfMr2v.js","/assets/list-tree-pcQx-4IK.js","/assets/lock-open-C6Zdikyy.js","/assets/log-in-DMkkh632.js","/assets/message-square-Mt_-vz6y.js","/assets/minimize-2-DjdSHMmR.js","/assets/package-check-BFBwr5h9.js","/assets/paperclip-mBbY9Bit.js","/assets/pencil-boXFnVOq.js","/assets/percent-CsPLS2wL.js","/assets/personName-B4KId4zS.js","/assets/pin-BvgSADEJ.js","/assets/pin-off-DLfhMe20.js","/assets/play-BWMhTUTP.js","/assets/presentation-uUn5R5Vc.js","/assets/prop-types-C1JhPyDP.js","/assets/radio-BdnsPFlH.js","/assets/react-apexcharts.esm-DS8HXKWn.js","/assets/repeat-Baw7V3Xd.js","/assets/rotate-ccw-B_QW8er6.js","/assets/rotate-cw-BPR89Gqf.js","/assets/save-CQWdpwsK.js","/assets/scale-a3dRmgXq.js","/assets/scroll-text-DFV8KLB8.js","/assets/search-x-Jw4T8ZDQ.js","/assets/segments-DFv9DXfN.js","/assets/send-CbUNjAY4.js","/assets/settings-2-WeLu-Y7Q.js","/assets/shield-CUACN-7t.js","/assets/shield-alert-VIQyTLs0.js","/assets/shield-check-DJ0DRaC4.js","/assets/shield-question-mark-B0ThNexA.js","/assets/siren-D3_C8MBY.js","/assets/smartphone-B3P30Jra.js","/assets/snowflake-CsDWHmkF.js","/assets/square-CgPntBrh.js","/assets/square-check-big-jQdA3CJh.js","/assets/star-CNSbS_oe.js","/assets/statusBands-DDpUEhBA.js","/assets/store-CIRmeXcg.js","/assets/table-2-DYwzcfxd.js","/assets/tag-BvMgrEDa.js","/assets/timer-off-B21sFVPG.js","/assets/trending-down-DImt_Ve1.js","/assets/trending-up-C8NVQCoP.js","/assets/undo-2-ByC6rgWM.js","/assets/useChartTheme-Dgt3kei0.js","/assets/useElementWidth-COEPs7rP.js","/assets/useIsMobile-C3bwgS8r.js","/assets/useMutation-DObHk4vW.js","/assets/useStatusBands-DgYMa-Eq.js","/assets/user-DJdKANpV.js","/assets/user-cog-BpZEMwix.js","/assets/user-minus-Dgdf2sKe.js","/assets/users-CS4_F8f6.js","/assets/video-BiqVZC05.js","/assets/wallet-DsyZgSvR.js","/assets/warehouse-DdMNhsxX.js","/assets/zap-BMQSTO6g.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
