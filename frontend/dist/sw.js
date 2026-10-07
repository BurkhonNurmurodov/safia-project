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

const BUILD = "2026-10-07T14:58:59.893Z";
const PRECACHE = ["/","/assets/AdminPanel-C2zzEZPU.js","/assets/AnalysisBoard-RV0PTGse.js","/assets/Arc-DFz2wOCY.js","/assets/Assistant-Dhtk15uy.js","/assets/BrigadirProfile-BakUX7aP.js","/assets/BroadcastReceivers-CYJzrzSE.js","/assets/BroadcastRecord-BoFjAXfG.js","/assets/Button-QHHc2YJ_.js","/assets/CatLockNotice-DTjXVr-2.js","/assets/CategoryLegendModal-C29I1gzf.js","/assets/CellConcerns-B0bFtrX_.js","/assets/CellDetails-yOb7yR8t.js","/assets/CellFormModal-ejKz8G6-.js","/assets/CellIdent-CtbY4XvB.js","/assets/CellLink-6hVL1GJ7.js","/assets/Cells-BIuUBoWA.js","/assets/ColumnFilter-Dz_-qlEh.js","/assets/ColumnsPicker-Bi6WbxJA.js","/assets/CommentsModal-BzOkAI_T.js","/assets/ComparisonTable-By58qXr2.js","/assets/Concerns-sdAOnBhP.js","/assets/Daily-vUqNMrm6.js","/assets/DataTable-DfJzSPXK.js","/assets/DateRangePicker-Cp3rRyB6.js","/assets/DayReportView-BdEWxfsx.js","/assets/DayStepper-B-YekDBt.js","/assets/DifferenceBreakdown-CjLbDZmF.js","/assets/Downtime-DxOdBr-U.js","/assets/Education-BmzQRJ01.js","/assets/EducationLesson-Bm6L0pnm.js","/assets/EmptyState-DUmE1a7m.js","/assets/Exam-COMtXsdn.js","/assets/FactorySelect-Copdj_Ff.js","/assets/Gamification-CTuOdpE7.js","/assets/GroupBadge-BTtrirZc.js","/assets/HeatmapChart-DMYuEdUq.js","/assets/IdleCell-BZp6_87C.js","/assets/KPICard-FihXgcRo.js","/assets/Kaizen-kPxcIzwK.js","/assets/Kelish-Y-XyMKsz.js","/assets/KpiDeltaCard-D5OadwR0.js","/assets/LangTextInput-CEbcGnX_.js","/assets/Layout-CbnnUkrh.js","/assets/LeaderAppeal-DSoMKe0-.js","/assets/LeaderDayReport-BgY2XcKR.js","/assets/LeaderUnitReport-BdHOBsI0.js","/assets/Leaderboard-kaxkYgt9.js","/assets/Leaders-Q4wx6PaM.js","/assets/Lightbox-lzMIxsEZ.js","/assets/LiveOverview-Bob10W9F.js","/assets/Login-CIOr7VxL.js","/assets/NotFound-Di37fMEg.js","/assets/Notifications-C3rDIPh7.js","/assets/Overview-CT09M3bl.js","/assets/Pagination-E8gAbXdo.js","/assets/PerenaladkaFactTable-C958xGZT.js","/assets/PersonCard-BIaJTHgU.js","/assets/PlanFulfillment-DOS9A3uX.js","/assets/Production-CKAuy10L.js","/assets/Profile-_OPisQlw.js","/assets/ProofCamera-SXTa8FRb.js","/assets/ProofPhoto-BBBfIaH_.js","/assets/Quality-yAwh5108.js","/assets/RawRows-CupDHI4J.js","/assets/RequestStateChip-C2Xe_BYy.js","/assets/RichTextEditor-B3iVzN2Y.js","/assets/SaveState-Dxfd0457.js","/assets/SearchInput-Rcqw5xOG.js","/assets/SeasonalityHeatmap-DJsKxBRi.js","/assets/SegmentedToggle-Dwig7ucL.js","/assets/SetupTimes-mva0uLga.js","/assets/ShiftDaily-ChYr1VGK.js","/assets/Staff-DxcOjvSJ.js","/assets/StatusBadge-CsfWJ62S.js","/assets/TargetGoal-ChhI3QBe.js","/assets/Targets-DHBJWkjn.js","/assets/Tasks-Dm0oHSxK.js","/assets/TimeWheelPicker-BZEN40UD.js","/assets/Toast-heMZzUWW.js","/assets/Tooltip-B1r_fn_Q.js","/assets/TrendChart-D4JmTu9U.js","/assets/TripleSpeedometer-CZAZgGcn.js","/assets/Trudoyomkost-Cxrq-Tc4.js","/assets/Turnover-CQAE97TI.js","/assets/UploadDropzone-CoYcNa23.js","/assets/UsersActivity-BEtHogk1.js","/assets/VerdictBlock-D3bXX92M.js","/assets/VfxApiMap-BuvTL1w2.js","/assets/VfxDictionaries-C6gJa2-Q.js","/assets/VfxEmployees-BJXYfVPq.js","/assets/VfxHrMoves-Bo105OgX.js","/assets/VfxJobs-Cud568-n.js","/assets/VfxPhoto-DVLt3HQT.js","/assets/VfxShifts-Dk8N7988.js","/assets/VfxState-CplnaALf.js","/assets/VfxTimebooks-CgG-6IyF.js","/assets/VfxTimesheet-Drc1fyXT.js","/assets/WatchProgress-CY8stFIw.js","/assets/WebLogin-C7vc4cHh.js","/assets/WorkerConcerns-CIqCvs4O.js","/assets/Workers-1-o8s8DT.js","/assets/Zagruzka-BUr-BC6u.js","/assets/ZagruzkaCell-DGhnWyfQ.js","/assets/api-D4kkDpZF.js","/assets/archive-BiiYK36Q.js","/assets/archive-restore-Dpx9VZHb.js","/assets/arrow-down-D1Hw-be8.js","/assets/arrow-up-narrow-wide-etWSProt.js","/assets/award-BBlTd8vc.js","/assets/ban-CvHNRny-.js","/assets/boxes-BQN4kZdm.js","/assets/braces-BHM9Hk5S.js","/assets/brigadirFilters-D4Lqz_Cc.js","/assets/broadcastTree-C6ZshGyu.js","/assets/building-2-eKydAbFe.js","/assets/calculator-DZ9wn0v9.js","/assets/calendar-ClKLc6QT.js","/assets/calendar-days-Dfrlg6i-.js","/assets/camera-DTAff3aj.js","/assets/categories-BR4Ni12Q.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-MTABMork.js","/assets/chart-line-D8F-bBfA.js","/assets/chart-pie-BLkKJbkp.js","/assets/chartRange-Cdn7ZDqA.js","/assets/check-check-Dib-a6hC.js","/assets/chevron-left-BmDjrk96.js","/assets/chevrons-up-down-D74feypf.js","/assets/circle-DoMwMaJt.js","/assets/circle-alert-4ti-1OMD.js","/assets/circle-check-big-Zs9iXT7n.js","/assets/circle-dashed-OrP2P6BX.js","/assets/circle-minus-DP1LEFtr.js","/assets/circle-question-mark-CSQpbPh_.js","/assets/circle-slash-BR3GNYdC.js","/assets/circle-user-round-CPGg72LV.js","/assets/clock-3-CQ-X097O.js","/assets/cloud-off-Cj-CSjZw.js","/assets/cloud-upload-5vHKDv9F.js","/assets/compass-I17Rl0ad.js","/assets/concernCategories-Codo_bjD.js","/assets/copy-DJVOnvFO.js","/assets/corner-down-right-CboR2Edq.js","/assets/createLucideIcon-BVmhOYnH.js","/assets/es-DA6nFL3z.js","/assets/external-link-DIBclzKu.js","/assets/file-clock-BvE808m4.js","/assets/file-exclamation-point-B4_WAjp0.js","/assets/flag-04ZYoXHk.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D_WlxfA-.js","/assets/hash-CxSLio26.js","/assets/hourglass-BhlIPcAh.js","/assets/image-dhPbL8V3.js","/assets/image-off-CTduaoUb.js","/assets/inbox-aOvL-ReK.js","/assets/index-B7yzqq84.css","/assets/index-CbwoWL7H.js","/assets/keyboard-B5fdHhu_.js","/assets/languages-CTLZS2Vi.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-aAehyh1v.js","/assets/lightbulb-C1uQt6Ze.js","/assets/link-2-DjEXZi2Z.js","/assets/link-2-off-DGWBPwT8.js","/assets/list-ordered-JBJrx6iF.js","/assets/list-tree-Bq2MpqP8.js","/assets/lock-open-L98Szafm.js","/assets/log-in-BgBs4r5g.js","/assets/minimize-2-9ch81zVg.js","/assets/package-check-CYbIxad_.js","/assets/pencil-D-nW_y0W.js","/assets/percent-D7-x2PIY.js","/assets/pin-CWrHSZkW.js","/assets/pin-off-D_DB7JQA.js","/assets/play-PQEbX7Xa.js","/assets/plug-zap-Dj1WEWcL.js","/assets/prop-types-DX7o9NFz.js","/assets/radio-DMWAfLC-.js","/assets/react-apexcharts.esm-CLRo9bku.js","/assets/registers-2DLnIEL6.js","/assets/repeat-B1daWZ0x.js","/assets/save-Bv7o_vCM.js","/assets/scopeLinks-B01vX6c4.js","/assets/scroll-text-DsWG6ugw.js","/assets/search-x-BmXtoIRa.js","/assets/segments-DdD1sXFp.js","/assets/send-Czbn6vPq.js","/assets/settings-2-BF9VZA_l.js","/assets/shield-CINlBxPq.js","/assets/shield-alert-DWNB6UC_.js","/assets/shield-question-mark-BzygE2eG.js","/assets/siren-yZ2K2CJW.js","/assets/snowflake-BORnsNcr.js","/assets/split-DasZ9vPh.js","/assets/square-check-big-BuvJef9I.js","/assets/star-DClXRNt-.js","/assets/statusBands-CgAnA1t6.js","/assets/store-B4mNgDFZ.js","/assets/table-2-t9XO7m0u.js","/assets/table-properties-CjLFUafj.js","/assets/tag-DvBJL7_R.js","/assets/timer-off-C087GuD9.js","/assets/trending-down-DTNVleim.js","/assets/trending-up-_O-MtwC0.js","/assets/undo-2-De7wDVz6.js","/assets/useChartTheme-BKo3vQC5.js","/assets/useElementWidth-DbzkiICh.js","/assets/useIsMobile-B6nLGFz_.js","/assets/useOpenParam-j76-spCn.js","/assets/useStatusBands-BrgmPqag.js","/assets/useUrlScope-CFtCRRTr.js","/assets/user-S-BniCYO.js","/assets/user-cog-BiXQnXLx.js","/assets/users-D1oqI9mq.js","/assets/vfx-JCWhT0_w.js","/assets/video-ClpJ_SeH.js","/assets/wallet-DDwOZYK1.js","/assets/warehouse-DtgdzskL.js","/assets/x-mvAvPrJ_.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
