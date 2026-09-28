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

const BUILD = "2026-09-28T16:32:31.398Z";
const PRECACHE = ["/","/assets/AdminPanel-V72gK8WS.js","/assets/AnalysisBoard-DPCsFmn_.js","/assets/Arc-C71XDxBk.js","/assets/ArcLegacy-Fx8rPJ9q.js","/assets/AttendanceModal-sAyBPwGS.js","/assets/BrigadirProfile-TCy-_MKJ.js","/assets/BroadcastReceivers-Be0stVvs.js","/assets/BroadcastRecord-pCe6LumH.js","/assets/CatLockNotice-CBStMuH-.js","/assets/CategoryLegendModal-BGvsjmAv.js","/assets/CellConcerns-DXTWaLaP.js","/assets/CellDetails-AQo1GTho.js","/assets/CellFormModal-CYRDezN3.js","/assets/CellLink-CW8CYZtg.js","/assets/Cells-DPMbyrYW.js","/assets/ColumnFilter-CiME_Rt1.js","/assets/ColumnsPicker-Bcv_gDrn.js","/assets/CommentsModal-DZWFiFOo.js","/assets/ComparisonTable-ChYXeH0S.js","/assets/Concerns-CGvxCvto.js","/assets/ConfirmDialog-CWBCU7F4.js","/assets/Daily-BlMwyw61.js","/assets/DataTable-DMcSu3xE.js","/assets/DateRangePicker-Dk8FeJpw.js","/assets/DayReportView-CVvmu0mO.js","/assets/DayStepper-_rZB9al8.js","/assets/DifferenceBreakdown-B8PvmGGG.js","/assets/Downtime-BuDA3F-o.js","/assets/Education-W-ySlVsC.js","/assets/EducationLesson-C4EV993n.js","/assets/EmptyState-CzxhMed9.js","/assets/Exam-BRcHTCEt.js","/assets/FactorySelect-LkZippIu.js","/assets/Gamification-BIsg5uiP.js","/assets/GroupBadge-6yy6MGmp.js","/assets/HeatmapChart-BwBI9_s-.js","/assets/IdleCell-qSPf4_M3.js","/assets/KPICard-DFs6wQ6g.js","/assets/Kaizen-Dluezb7r.js","/assets/Kelish-D3HRN4iZ.js","/assets/KpiDeltaCard-Byjdd06z.js","/assets/LangTextInput-ap2he3Eb.js","/assets/Layout-BlKIUBuJ.js","/assets/LeaderAppeal-BuJ1qt7v.js","/assets/LeaderDayReport-Be3Hvyjl.js","/assets/LeaderUnitReport-DpBz2KBi.js","/assets/Leaderboard-CyW8iVlY.js","/assets/Leaders-Cas4kK0n.js","/assets/Lightbox-MXh-bpXA.js","/assets/LiveOverview-BNmz4s0A.js","/assets/Login-a6gPXvrp.js","/assets/NotFound-BxELulnH.js","/assets/Overview-NtJS9Mid.js","/assets/Pagination-DLtD-MxH.js","/assets/PerenaladkaFactTable-CrKgKMPm.js","/assets/PlanFulfillment-D_pt7L3C.js","/assets/Production-DaIdnyyh.js","/assets/Profile-DRayniEX.js","/assets/ProofCamera-hPVqYWGT.js","/assets/ProofPhoto-jBXny9FS.js","/assets/Quality-DFDoUQa4.js","/assets/RequestStateChip-DxjZzxTs.js","/assets/RichTextEditor-muQsuWfc.js","/assets/SaveState-B2MOM5v3.js","/assets/SearchInput-816STAGP.js","/assets/SeasonalityHeatmap-B3eXc_Ry.js","/assets/SegmentedToggle-DzUntHO3.js","/assets/SetupTimes-DIJXhP7B.js","/assets/ShiftDaily-BXaL8nno.js","/assets/Staff-0BDJrOso.js","/assets/StatusBadge-TXnGZdeO.js","/assets/TargetGoal-CWf1TuyL.js","/assets/Targets-DUvhT-6t.js","/assets/Tasks-DenD80XS.js","/assets/TimeWheelPicker-eZ2w16NM.js","/assets/Tooltip-GVqPR59k.js","/assets/TrendChart-Igzz_wVT.js","/assets/TripleSpeedometer-SNvWN54h.js","/assets/Trudoyomkost-vit0PMRk.js","/assets/UploadDropzone-DZAADmmN.js","/assets/UsersActivity-CDzzCGK7.js","/assets/VerdictBlock-CT1wTTeS.js","/assets/WatchProgress-4H2jUyrx.js","/assets/WebLogin-QJqDYa0F.js","/assets/WorkerConcerns-ogo9mmL6.js","/assets/Workers-MX1HCLTS.js","/assets/Zagruzka-C6DbUngq.js","/assets/ZagruzkaCell-teVrMD89.js","/assets/api-lF7fG_Xf.js","/assets/archive-BishuJx1.js","/assets/archive-restore-eQbhalzk.js","/assets/arrow-down-BbKrtydC.js","/assets/arrow-left-6Zb6Aexh.js","/assets/arrow-left-right-Rj7sQa1l.js","/assets/arrow-up-CSeXZqvP.js","/assets/arrow-up-right-BzfzKa_G.js","/assets/award-CTc4c9G_.js","/assets/ban-BbQKottr.js","/assets/bot-CabdL-vW.js","/assets/boxes-CAQD1nq8.js","/assets/brigadirFilters-BWvesvzp.js","/assets/broadcastTree-BVvtv3_r.js","/assets/building-2-CwPkhvNE.js","/assets/calendar-GWk-gN8z.js","/assets/calendar-clock-DR0Iz1Ot.js","/assets/calendar-days-BOuF_583.js","/assets/calendar-range-ByS5k4CT.js","/assets/camera-CeW-i7Cs.js","/assets/categories-Dmsr4dN4.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CEcgv79S.js","/assets/chart-line-BrqC-W3T.js","/assets/chart-pie-DbyYJXIl.js","/assets/chartRange-DXG6qKZ4.js","/assets/chevron-left-COJApoIQ.js","/assets/chevrons-up-down-Br275c9o.js","/assets/circle-CbeawthW.js","/assets/circle-check-big-CDDvsXWw.js","/assets/circle-dot-BnaZ1K2d.js","/assets/circle-minus-xbGfOVyj.js","/assets/circle-slash-b2N6evJo.js","/assets/circle-user-round-BNwG4MVt.js","/assets/cloud-off-CTtkbvqq.js","/assets/cloud-upload-CC-XikVK.js","/assets/compass-BeGwA-5V.js","/assets/concernCategories-GdvwnuJ2.js","/assets/copy-ClKe2UYP.js","/assets/corner-down-right-Bi7TYD_t.js","/assets/createLucideIcon-t3Lb35Nc.js","/assets/es-B65ojy2b.js","/assets/exportXlsx-D8h_ruVo.js","/assets/external-link-CaGCFbpB.js","/assets/file-clock-BEj4fiEg.js","/assets/file-exclamation-point-o-4eeRIM.js","/assets/file-spreadsheet-BB-eq2Jv.js","/assets/file-text-DUc-aOc3.js","/assets/flag-DZHz3t9d.js","/assets/flame-B7NdyBC6.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-xVjQPsmD.js","/assets/hash-tZd8D7k5.js","/assets/history-Bu0ocDIl.js","/assets/hourglass-C_bs83bD.js","/assets/image-Dt-l0NQe.js","/assets/image-off-BWJR2lRY.js","/assets/index-C5FDdCN-.css","/assets/index-DjIwiD5r.js","/assets/key-round-BWP1HXrQ.js","/assets/keyboard-6phYgOl3.js","/assets/languages-D1gjfkiG.js","/assets/layers-D-SrqZ1q.js","/assets/lightbulb-D6bhqw-Y.js","/assets/link-2-faiqq1BF.js","/assets/list-checks-FZGtYT9x.js","/assets/list-ordered-geEBMjss.js","/assets/list-tree-B46nu8bB.js","/assets/lock-open-D-dXTiTt.js","/assets/log-in-Di6d4pgO.js","/assets/maximize-2-D8zavqc_.js","/assets/message-square-r-qOaQue.js","/assets/minimize-2-DHvB2R-p.js","/assets/package-check-6QlbjmrR.js","/assets/paperclip-CQ0QQlu1.js","/assets/pencil-CWU98Pcu.js","/assets/percent-DjLqGVBB.js","/assets/personName-B4KId4zS.js","/assets/pin-DXHjaPDG.js","/assets/pin-off-D0vIvPas.js","/assets/play-DoUWjHZZ.js","/assets/presentation-0hH-oeNq.js","/assets/prop-types-CZMjHNDc.js","/assets/radio-kejMJE-t.js","/assets/react-apexcharts.esm-Drb0RRXY.js","/assets/repeat-Cl1ZDMtz.js","/assets/rotate-ccw-BcZMiMRe.js","/assets/rotate-cw-ZZH5mbqy.js","/assets/save-DMeo9a1f.js","/assets/scale-DqkS-Y48.js","/assets/scroll-text-BXUr85l8.js","/assets/search-x-CCWVJhPH.js","/assets/segments-6zZxGjxD.js","/assets/send-C9pETxPY.js","/assets/settings-2-CjYMs4ce.js","/assets/shield-DhBM185D.js","/assets/shield-alert-D3rkn3Sz.js","/assets/shield-check-BiYfx6Tm.js","/assets/shield-question-mark-CFiphdUm.js","/assets/siren-DT_NlR9r.js","/assets/smartphone-DZaagJXv.js","/assets/snowflake-DTS8jpxU.js","/assets/square-Di4PpMWO.js","/assets/square-check-big-Bav_qWYy.js","/assets/star-BR5udXJS.js","/assets/statusBands-Ctsr_DmE.js","/assets/store-DEo7adSE.js","/assets/table-2-BdzPaaaF.js","/assets/tag-XLjcHaiG.js","/assets/timer-off-D0aBuBTz.js","/assets/trending-down-DwnP0n5j.js","/assets/trending-up-DDF_OUj4.js","/assets/undo-2-Da0f_28f.js","/assets/useChartTheme-CjjxkT9z.js","/assets/useElementWidth-a2JcG62D.js","/assets/useIsMobile-CjEh3bFg.js","/assets/useMutation-OZUdZwSD.js","/assets/useStatusBands-Dvx_vB-W.js","/assets/user-EdiYnFx7.js","/assets/user-cog-Bjf9489B.js","/assets/user-minus-EBFjPcr7.js","/assets/users-Bo1S1mff.js","/assets/video-fYCTg5VS.js","/assets/wallet-B8gWYj7F.js","/assets/warehouse-BXcFr4sf.js","/assets/zap-p7EvoGLF.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
