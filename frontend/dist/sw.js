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

const BUILD = "2026-09-30T07:57:13.933Z";
const PRECACHE = ["/","/assets/AdminPanel-BAUAuU1P.js","/assets/AnalysisBoard-swKwcL4N.js","/assets/Arc-CPklhcpT.js","/assets/ArcLegacy-BeaIdT0U.js","/assets/AttendanceModal-Cuv_cShF.js","/assets/BrigadirProfile-BhsoGQJ_.js","/assets/BroadcastReceivers-WJcALmI-.js","/assets/BroadcastRecord-D09gQTAa.js","/assets/CatLockNotice-CMnYqdUs.js","/assets/CategoryLegendModal-D3ms5jxL.js","/assets/CellConcerns-CfPTPlPo.js","/assets/CellDetails-nCBXY2_F.js","/assets/CellFormModal-BoLGpJXU.js","/assets/CellLink-BBsKfR-F.js","/assets/Cells-BtRbVNbY.js","/assets/ColumnFilter-D6w56dn-.js","/assets/ColumnsPicker-BqnR1e4c.js","/assets/CommentsModal-ByNlCzXk.js","/assets/ComparisonTable-B0OywFO2.js","/assets/Concerns-Cg1yG9fz.js","/assets/ConfirmDialog-CVc5rJK8.js","/assets/Daily-Bns8GHso.js","/assets/DataTable-yMObBD8B.js","/assets/DateRangePicker-BWQrbkLD.js","/assets/DayReportView-BPg9dUjJ.js","/assets/DayStepper-Cpuc_OEn.js","/assets/DifferenceBreakdown-s--K-pLU.js","/assets/Downtime-DDBXMczb.js","/assets/Education-CDsSEKf7.js","/assets/EducationLesson-37O_1BZ-.js","/assets/EmptyState-DqBPmp0Q.js","/assets/Exam-Q4NrsGcx.js","/assets/FactorySelect--kWRcOR0.js","/assets/Gamification-BXv-MA2c.js","/assets/GroupBadge-CkMYHXio.js","/assets/HeatmapChart-CfmgVoDz.js","/assets/IdleCell-BEfUF2fq.js","/assets/KPICard-m23XFpa_.js","/assets/Kaizen-nK_14noZ.js","/assets/Kelish-CvbajzaN.js","/assets/KpiDeltaCard-Bjw-TMrs.js","/assets/LangTextInput-Y-ekmigS.js","/assets/Layout-nXiYXbz2.js","/assets/LeaderAppeal-91-oGtIg.js","/assets/LeaderDayReport-DNHtaPDz.js","/assets/LeaderUnitReport-Dr45IMwi.js","/assets/Leaderboard-CGdmNcE9.js","/assets/Leaders-BpbfmT5Q.js","/assets/Lightbox-Bz7_ln6I.js","/assets/LiveOverview-lXsLk8Bw.js","/assets/Login-D2FPTKzx.js","/assets/NotFound-BphWzzhy.js","/assets/Overview-D1Cd7DO0.js","/assets/Pagination-Ceka8wkH.js","/assets/PerenaladkaFactTable-614iAnce.js","/assets/PlanFulfillment-CqX4ZPYM.js","/assets/Production-CKZh2r9c.js","/assets/Profile-C8yTvurD.js","/assets/ProofCamera-D6zyqLbn.js","/assets/ProofPhoto-XD7IroD4.js","/assets/Quality-CdaQjNne.js","/assets/RequestStateChip-DNefq6kE.js","/assets/RichTextEditor-Drssj1a-.js","/assets/SaveState-a5QHLWlC.js","/assets/SearchInput-kz0G79nT.js","/assets/SeasonalityHeatmap-DefXCNGJ.js","/assets/SegmentedToggle-vx8QMy-6.js","/assets/SetupTimes-D5uV7E2v.js","/assets/ShiftDaily-mrZ4sfEj.js","/assets/Staff-DYKMmvuE.js","/assets/StatusBadge-Clr992dK.js","/assets/TargetGoal-B-EandOy.js","/assets/Targets-PodWMZxd.js","/assets/Tasks-BapD0l4U.js","/assets/TimeWheelPicker-Cq0tQDX_.js","/assets/Tooltip-ujGwLat7.js","/assets/TrendChart-K7DR9OJT.js","/assets/TripleSpeedometer-CxrE51pa.js","/assets/Trudoyomkost-C_7f50vy.js","/assets/UploadDropzone-D05P1AhO.js","/assets/UsersActivity-DQUbqhXA.js","/assets/VerdictBlock-C2YSVy_q.js","/assets/WatchProgress-BSHHuE3v.js","/assets/WebLogin-feP38Njy.js","/assets/WorkerConcerns-Ciog3cUa.js","/assets/Workers-CbzFJoqH.js","/assets/Zagruzka-FmYuX58A.js","/assets/ZagruzkaCell-DqhHXu0N.js","/assets/api-BCPNuowd.js","/assets/archive-B-d0_gd9.js","/assets/archive-restore-CnL0Cip5.js","/assets/arrow-down-D-SZtm3b.js","/assets/arrow-left-CssJlKnr.js","/assets/arrow-left-right-QIot0xji.js","/assets/arrow-up-CMs63XiW.js","/assets/arrow-up-narrow-wide-DIIzaR-7.js","/assets/arrow-up-right-CmXLIVBq.js","/assets/award-DJXXaDXs.js","/assets/ban-DNWBxY_Z.js","/assets/bot-BeeOMRcc.js","/assets/boxes-I5F5VTBa.js","/assets/brigadirFilters-B6il1I0b.js","/assets/broadcastTree-BkbF1bMB.js","/assets/building-2-B9M4G2Bc.js","/assets/calendar-CbKRRovB.js","/assets/calendar-clock-BgtvOQvV.js","/assets/calendar-days-DP2ufuSx.js","/assets/calendar-range-CKq3rllt.js","/assets/camera-CuSRPjiw.js","/assets/categories-DZb71XQ4.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DONcPO1S.js","/assets/chart-line-DFgopWR_.js","/assets/chart-pie-FMZF0o_b.js","/assets/chartRange-B-NqjzRz.js","/assets/chevron-left-DAsgu3Da.js","/assets/chevrons-up-down-BIVXbbCt.js","/assets/circle-At65-RU2.js","/assets/circle-check-big-C7EyR7TX.js","/assets/circle-dot-D4IcHKDQ.js","/assets/circle-minus-qZqiqPTN.js","/assets/circle-slash-CfNx_G_h.js","/assets/circle-user-round-CYZcMonb.js","/assets/cloud-off-tUx9YUS6.js","/assets/cloud-upload-DCZ6YeJJ.js","/assets/compass-CNXrKYjq.js","/assets/concernCategories-CYXomTAW.js","/assets/copy-B11wZmp9.js","/assets/corner-down-right-CygnlvyP.js","/assets/createLucideIcon-CEDqf4Ll.js","/assets/es-Dmc3gRXl.js","/assets/exportXlsx-CtEKpGUM.js","/assets/external-link-D7Mn9HHM.js","/assets/file-clock-BoyDyOmt.js","/assets/file-exclamation-point-DQcpLMnR.js","/assets/file-spreadsheet-DJNmGVo5.js","/assets/file-text-Bloh4fdj.js","/assets/flag-B1ii55DN.js","/assets/flame-Cci_UgHk.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-B0_LPbkb.js","/assets/hash-onITQVka.js","/assets/history-C0NJklGS.js","/assets/hourglass-BbqwWUf4.js","/assets/image-CchHNiwn.js","/assets/image-off-DPQJpYfR.js","/assets/index-CMiS_IVN.css","/assets/index-DWDUh-CU.js","/assets/key-round-LAso34q6.js","/assets/keyboard-B0ysQ4yt.js","/assets/languages-GJX-1a2r.js","/assets/layers-zfdRb5gV.js","/assets/lightbulb-BjTJgUSo.js","/assets/link-2-BBAd9dDG.js","/assets/link-2-off-Bolsbjbm.js","/assets/list-checks-BUjSndhE.js","/assets/list-ordered-CeKvCNkA.js","/assets/list-tree-Cmgel_nD.js","/assets/lock-open-DR5Di-Hd.js","/assets/log-in-DsZI3sx6.js","/assets/maximize-2-CvNBgeHl.js","/assets/message-square-DHgj39ZP.js","/assets/minimize-2-PAQu3zv_.js","/assets/package-check-D0MhuEF9.js","/assets/paperclip-IDb2Xwrq.js","/assets/pencil-D4VG0pDP.js","/assets/percent-DU5dZ9z-.js","/assets/personName-CogOuS3K.js","/assets/pin-gFjzFhDc.js","/assets/pin-off-Bi3CdZLs.js","/assets/play-BBXtlHtI.js","/assets/presentation-CYedkQwf.js","/assets/prop-types-BSey61DX.js","/assets/radio-DZtK3Der.js","/assets/react-apexcharts.esm-hwuWvB7k.js","/assets/repeat-DMV46BK7.js","/assets/rotate-ccw-CbYIP-Hv.js","/assets/rotate-cw-BVruKlyv.js","/assets/save-goGuY06J.js","/assets/scale-y_Vdc_es.js","/assets/scopeLinks-Dnvq34Hp.js","/assets/scroll-text-DdYGQcqn.js","/assets/search-x-BC5pMWJo.js","/assets/segments-B3h0Sfvi.js","/assets/send-B1Si0816.js","/assets/settings-2-DlaQRMOz.js","/assets/shield-Y2RCRHoP.js","/assets/shield-alert-D0DvGsVW.js","/assets/shield-check-zqBdCfnj.js","/assets/shield-question-mark-BJ-WJwe3.js","/assets/siren-BetlReqe.js","/assets/snowflake-B0KLXmWq.js","/assets/square-BnjvelZx.js","/assets/square-check-big-6x5JkDTA.js","/assets/star-PR05DMzP.js","/assets/statusBands-4wDGC8CV.js","/assets/store-nX4tpJJd.js","/assets/table-2-DsoYvY4_.js","/assets/table-properties-BcTCG6mG.js","/assets/tag-Cf7uCLoT.js","/assets/timer-off-Cqz2R0OI.js","/assets/trending-down-BdhLej53.js","/assets/trending-up-DWx6Qc9x.js","/assets/undo-2-E7hjXrLf.js","/assets/useChartTheme-H2p-ynYZ.js","/assets/useElementWidth-ECji1fu5.js","/assets/useIsMobile-BIr47hdM.js","/assets/useMutation-BTsTUmYj.js","/assets/useStatusBands-OuHiFYvV.js","/assets/useUrlScope-D6VuzABO.js","/assets/user-Btf50ZPU.js","/assets/user-cog-Bk631jRT.js","/assets/user-minus-B76J05--.js","/assets/users-oVqZGQiT.js","/assets/video-DYh9iP84.js","/assets/wallet-C-TQlpG5.js","/assets/warehouse-DuZvWToD.js","/assets/zap-CWfDtUiq.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
