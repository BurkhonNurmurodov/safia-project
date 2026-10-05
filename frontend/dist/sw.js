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

const BUILD = "2026-10-05T19:12:25.083Z";
const PRECACHE = ["/","/assets/AdminPanel-CeOJbQQO.js","/assets/AnalysisBoard-Dx6bnX3T.js","/assets/Arc-Xo_Eup0X.js","/assets/BrigadirProfile-CwF9OESW.js","/assets/BroadcastReceivers-D034Qi6g.js","/assets/BroadcastRecord-CRBaazZ-.js","/assets/Button-CUwOPth9.js","/assets/CatLockNotice-L4apgyzO.js","/assets/CategoryLegendModal-io81Kj2F.js","/assets/CellConcerns-SADSGm7m.js","/assets/CellDetails-D1iail5I.js","/assets/CellFormModal-4LAKwjDu.js","/assets/CellIdent-Dojk9Q5L.js","/assets/CellLink-BwBttMlN.js","/assets/Cells-CgZ8zBN5.js","/assets/ColumnFilter-DUtXoyVI.js","/assets/ColumnsPicker-C12asXZe.js","/assets/CommentsModal-CaTuCKAr.js","/assets/ComparisonTable-DGf3d-pu.js","/assets/Concerns-CAM5FCMa.js","/assets/Daily-Cs7k2PtO.js","/assets/DataTable-DSyLINqg.js","/assets/DateRangePicker-uaUTJvZ6.js","/assets/DayReportView-bezx4e5J.js","/assets/DayStepper-BzLqTaT-.js","/assets/DifferenceBreakdown-DTEwH_rO.js","/assets/Downtime-BHqASNOw.js","/assets/Education-LMlPem2B.js","/assets/EducationLesson-C3nMAfaM.js","/assets/EmptyState-B849C01T.js","/assets/Exam-CfPagqsA.js","/assets/FactorySelect-Mm5WQlkT.js","/assets/Gamification-DfqVu9vV.js","/assets/GroupBadge-eXBilfbC.js","/assets/HeatmapChart-DmSMo9G-.js","/assets/IdleCell-AzNUM44m.js","/assets/KPICard-9MC4qw-T.js","/assets/Kaizen-jxPFidYh.js","/assets/Kelish-DMeERAGw.js","/assets/KpiDeltaCard-CMotmS1M.js","/assets/LangTextInput-CtwLRbd9.js","/assets/Layout-bCSGlS_4.js","/assets/LeaderAppeal-DsneBl8W.js","/assets/LeaderDayReport-DJ9cWyWR.js","/assets/LeaderUnitReport-GvjicwmW.js","/assets/Leaderboard-6P5O4hT5.js","/assets/Leaders-DdUKwWJD.js","/assets/Lightbox-BbXctHha.js","/assets/LiveOverview-BeIpWOzU.js","/assets/Login-6seHgoV9.js","/assets/NotFound-Danl9kPD.js","/assets/Notifications-DQfD2M1X.js","/assets/Overview-BM4ZJR62.js","/assets/Pagination-SRZGrLFq.js","/assets/PerenaladkaFactTable-SProQNo0.js","/assets/PersonCard-BWGGTI9G.js","/assets/PlanFulfillment-CU0I6ycK.js","/assets/Production-DdqUS46V.js","/assets/Profile-C6GiZ_F_.js","/assets/ProofCamera-CSyC_oKk.js","/assets/ProofPhoto-C5HrbDZy.js","/assets/Quality-DtkQgrDO.js","/assets/RawRows-CWQcjSc5.js","/assets/RequestStateChip-CO9DKd02.js","/assets/RichTextEditor-BHySPMbs.js","/assets/SaveState-BUBcSrMf.js","/assets/SearchInput-C3zvaED3.js","/assets/SeasonalityHeatmap-6qpFzFrL.js","/assets/SegmentedToggle-DrKnTDZg.js","/assets/SetupTimes-BJw5kiJ1.js","/assets/ShiftDaily-ClTwMOVa.js","/assets/Staff-NK-b7fHD.js","/assets/StaffLive-BfDhgiDm.js","/assets/StatusBadge-DFjbQgxa.js","/assets/TargetGoal-CEpzn3-j.js","/assets/Targets-C1PcE-au.js","/assets/Tasks-BH4zAX_q.js","/assets/TimeWheelPicker-DVkzWBtt.js","/assets/Toast-lTccyz7r.js","/assets/Tooltip-DoUmnb-d.js","/assets/TrendChart-vS8a9inH.js","/assets/TripleSpeedometer-UnzB5ysU.js","/assets/Trudoyomkost-RfkJ4FiR.js","/assets/Turnover-BZ55qyxt.js","/assets/UploadDropzone-DGQbqp8C.js","/assets/UsersActivity-PB9XA-Fg.js","/assets/VerdictBlock-4dWKcv77.js","/assets/VfxApiMap-DadOgp5H.js","/assets/VfxDictionaries-DsVsSswM.js","/assets/VfxEmployees-DSlomSeL.js","/assets/VfxHrMoves-DOxJPd9J.js","/assets/VfxJobs-LKzgP4Tb.js","/assets/VfxPhoto-DNiD9MRp.js","/assets/VfxShifts-aslBn7P1.js","/assets/VfxState-BIiBm-tZ.js","/assets/VfxTimebooks-BcrEMMo0.js","/assets/VfxTimesheet-BpyD6rLo.js","/assets/WatchProgress-s7tHe5Eq.js","/assets/WebLogin-BR6ke6Uj.js","/assets/WorkerConcerns-DyRyJp75.js","/assets/Workers-Cc7fiaPd.js","/assets/Zagruzka-D8JmqjcV.js","/assets/ZagruzkaCell-CwuoPL6E.js","/assets/api-C2VKAtXW.js","/assets/archive-DU2_kWRd.js","/assets/archive-restore-Bnwue8ck.js","/assets/arrow-down-CFmq2OQX.js","/assets/arrow-left-BWpD0g0g.js","/assets/arrow-up-CW2lC0fL.js","/assets/arrow-up-narrow-wide-CNHoESKi.js","/assets/arrow-up-right-jM6RSBau.js","/assets/award-D1UPFvP3.js","/assets/ban-DkaQmu7L.js","/assets/book-open-Z0JdaMAc.js","/assets/boxes-BvvBFb9l.js","/assets/braces-DGpPGqbv.js","/assets/brigadirFilters-BKqYToQ9.js","/assets/broadcastTree-Dgx29OmX.js","/assets/building-2-CZwAxxi9.js","/assets/calculator-VPw3pj7G.js","/assets/calendar-9a4qfjmr.js","/assets/calendar-days-BDnbRR-L.js","/assets/camera-DPyti_AP.js","/assets/categories-DCYPns5z.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Bb-7aDEX.js","/assets/chart-line-O4bGCYvS.js","/assets/chart-pie-C_9iPo2A.js","/assets/chartRange-DJUyd2Yt.js","/assets/check-check-DLJmlp5P.js","/assets/chevron-left-BIjPhrMR.js","/assets/chevrons-up-down-Tm8o7EnK.js","/assets/circle-Duca5aBP.js","/assets/circle-alert-pwlHgoMz.js","/assets/circle-check-big-1LWLBDNv.js","/assets/circle-dashed-DcPAsrGC.js","/assets/circle-minus-DRk_G34k.js","/assets/circle-question-mark-C2lVPiHj.js","/assets/circle-slash-LyeK4uqi.js","/assets/circle-user-round-CBHMaPI9.js","/assets/clock-3-CaNFDpMB.js","/assets/cloud-off-Bfi7-XI5.js","/assets/cloud-upload-DVukd23c.js","/assets/compass-BuEb_aDC.js","/assets/concernCategories-BO9gYyuk.js","/assets/copy-ClVXTmwF.js","/assets/corner-down-right-FYzhvXXg.js","/assets/createLucideIcon-uLPIJgZg.js","/assets/es-BGEpS0SZ.js","/assets/exportXlsx-BEoo8sks.js","/assets/external-link-CcQtu23h.js","/assets/file-clock-DexCKTh1.js","/assets/file-exclamation-point-DwcbyIaH.js","/assets/file-spreadsheet-CPFFf8QI.js","/assets/file-text-duGgP3GR.js","/assets/flag-Cpk75JRQ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel--TmBodUI.js","/assets/hash-DAV6foj4.js","/assets/history-BrQDFSEk.js","/assets/hourglass-CylvPpSp.js","/assets/image-DtzIuDxW.js","/assets/image-off-3Jl2o1vC.js","/assets/inbox-kBRTsl0Q.js","/assets/index-B1BGX_7I.css","/assets/index-CyDXKhE1.js","/assets/key-round-BvZwqr01.js","/assets/keyboard-DA3cRbTG.js","/assets/languages-DZV8muKu.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-KKmkXEUk.js","/assets/lightbulb-Dd1VDe01.js","/assets/link-2-Bs4-HLWi.js","/assets/link-2-off-PTch4RSi.js","/assets/list-ordered-D0w3HItZ.js","/assets/list-tree-8PEMZtTl.js","/assets/lock-open-Ca5_dgbX.js","/assets/log-in-BU30U_Wd.js","/assets/maximize-2-C-Qt0Nab.js","/assets/message-square-kJYqhZnf.js","/assets/minimize-2-sUzv299l.js","/assets/package-check-cnDJ38mh.js","/assets/paperclip-CtRrySRP.js","/assets/pencil-CayBDPSC.js","/assets/percent-CynBv9jB.js","/assets/pin-CVkNmtlV.js","/assets/pin-off-D6a9VmZB.js","/assets/play-Bwy2-9pQ.js","/assets/plug-zap-C_V45xHq.js","/assets/presentation-h3xCqTDw.js","/assets/prop-types-_oYoArxK.js","/assets/react-apexcharts.esm-DVaI_s4N.js","/assets/registers-pxMRY9Nc.js","/assets/repeat-Cepq8GwB.js","/assets/rotate-ccw-B1JrDRJ3.js","/assets/rotate-cw-DZBjFMXj.js","/assets/save-BULLHnjj.js","/assets/scopeLinks-y6H0ydFr.js","/assets/scroll-text-DpHFU6zB.js","/assets/search-x-e0cMswUH.js","/assets/segments-Tbj5wa7S.js","/assets/send-CxrrHPsD.js","/assets/settings-2-BZ7dt00X.js","/assets/shield-CP6aOJ8f.js","/assets/shield-alert-DK6rQ_8b.js","/assets/shield-check-CehMzkZb.js","/assets/shield-question-mark-C4hMaH_P.js","/assets/siren-trD7gaKE.js","/assets/snowflake-CVReQWen.js","/assets/split-4UtedUJI.js","/assets/square-check-big-BpvlPmMj.js","/assets/square-mMDx865X.js","/assets/star-xo1mmib_.js","/assets/statusBands-BsBDF60A.js","/assets/store-BDLXrhD2.js","/assets/table-2-BeHWH4G-.js","/assets/table-properties-BjyoO25-.js","/assets/tag-BeezVVHC.js","/assets/timer-off-BTfT__Xu.js","/assets/trending-down-sM7FyvBm.js","/assets/trending-up-DkW72cdy.js","/assets/undo-2-D_1jw1vB.js","/assets/useChartTheme-CiREaAwc.js","/assets/useElementWidth-BUPvy6Ut.js","/assets/useIsMobile-CvBRHRNP.js","/assets/useOpenParam-v8UqcEnO.js","/assets/useStatusBands-bP9DHtnQ.js","/assets/useUrlScope-D1nhK3oT.js","/assets/user-BLMB7xeN.js","/assets/user-cog-DtczUheK.js","/assets/users-BEbwk-Mv.js","/assets/vfx-CUKtXfop.js","/assets/video-C8K3_Anv.js","/assets/wallet-CV6l4io6.js","/assets/warehouse-B1NUxPVV.js","/assets/x-DdtaILBg.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
