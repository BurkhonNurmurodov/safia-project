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

const BUILD = "2026-10-07T11:06:47.189Z";
const PRECACHE = ["/","/assets/AdminPanel-Iy-BaKwV.js","/assets/AnalysisBoard-D6UZ2jkS.js","/assets/Arc-3_00J3YK.js","/assets/Assistant-CyYadc_V.js","/assets/BrigadirProfile-DaX_uVA5.js","/assets/BroadcastReceivers-WWt61QCm.js","/assets/BroadcastRecord-CFJlC9RE.js","/assets/Button-BqS4a1Af.js","/assets/CatLockNotice-CEJtzyji.js","/assets/CategoryLegendModal-DhSE9BZh.js","/assets/CellConcerns-OJI0Cjue.js","/assets/CellDetails-CdMjUT4N.js","/assets/CellFormModal-WqgEJjr8.js","/assets/CellIdent-HVdPAfji.js","/assets/CellLink-DtJ0LAFa.js","/assets/Cells-Cu3Rm_99.js","/assets/ColumnFilter-fUJ-NyuH.js","/assets/ColumnsPicker-BEV0l8sF.js","/assets/CommentsModal-fdkPZ5Qt.js","/assets/ComparisonTable-C_nwHyJC.js","/assets/Concerns-DriNVPyI.js","/assets/Daily-BvtxxCMW.js","/assets/DataTable-BdYDfbZT.js","/assets/DateRangePicker-BHVZjjJn.js","/assets/DayReportView-C7mW5Nhl.js","/assets/DayStepper-DuxfbtAN.js","/assets/DifferenceBreakdown-CvGt9wm3.js","/assets/Downtime-CFvwzXC7.js","/assets/Education-DF7lXdns.js","/assets/EducationLesson-Dx0bTNwU.js","/assets/EmptyState-DQJUvPYS.js","/assets/Exam-bQYc2f9h.js","/assets/FactorySelect-CArG9sKX.js","/assets/Gamification-DGtn3jrg.js","/assets/GroupBadge-uKH4sNkd.js","/assets/HeatmapChart-RHYuYMiU.js","/assets/IdleCell-CW1nwQY2.js","/assets/KPICard-CytyVc8m.js","/assets/Kaizen-DdDeFEdl.js","/assets/Kelish-B8MwU9Hp.js","/assets/KpiDeltaCard-DhfEjeoF.js","/assets/LangTextInput-Br8R5UqU.js","/assets/Layout-Dl38tnOQ.js","/assets/LeaderAppeal-CmSF-K5o.js","/assets/LeaderDayReport-5RIFb4jq.js","/assets/LeaderUnitReport-DdQz1tvj.js","/assets/Leaderboard-BobJCmro.js","/assets/Leaders-D12GPQMu.js","/assets/Lightbox-BLGw91Gw.js","/assets/LiveOverview-B4kYvwf9.js","/assets/Login-CRLvRgnt.js","/assets/NotFound-BJk_imTY.js","/assets/Notifications-xxnb7JaY.js","/assets/Overview-D-bX3uBL.js","/assets/Pagination-DL0qeEI0.js","/assets/PerenaladkaFactTable-84m10R73.js","/assets/PersonCard-CjlTzOqe.js","/assets/PlanFulfillment-DHkpnciC.js","/assets/Production-DotuHOdT.js","/assets/Profile-BpoPF3uJ.js","/assets/ProofCamera-Bao0zlOw.js","/assets/ProofPhoto-ZXOiTNec.js","/assets/Quality-C2OWTt7P.js","/assets/RawRows-gs2Xhc7C.js","/assets/RequestStateChip-DUfXd4zd.js","/assets/RichTextEditor-DztthUOm.js","/assets/SaveState-B9hl5cZ5.js","/assets/SearchInput-VkJE6-jl.js","/assets/SeasonalityHeatmap-ilurhZQS.js","/assets/SegmentedToggle-CTo7-2OM.js","/assets/SetupTimes-DDJocWf7.js","/assets/ShiftDaily-D53mgECh.js","/assets/Staff-D-amjkae.js","/assets/StatusBadge-bALuGxua.js","/assets/TargetGoal-DNKNFpVu.js","/assets/Targets-D8KRF7_P.js","/assets/Tasks-TcadKRqY.js","/assets/TimeWheelPicker-CXhjd6_x.js","/assets/Toast-CmUn4B4S.js","/assets/Tooltip-CNBGZNGH.js","/assets/TrendChart-xQVkCBAi.js","/assets/TripleSpeedometer-CJOl2t1v.js","/assets/Trudoyomkost-CconnLmW.js","/assets/Turnover-k5USQlRa.js","/assets/UploadDropzone-BoxV1tZQ.js","/assets/UsersActivity-Cf2yY3ZC.js","/assets/VerdictBlock-DbV6ioFe.js","/assets/VfxApiMap-DRGBOFmC.js","/assets/VfxDictionaries-DNyhPZQ3.js","/assets/VfxEmployees-DU7S-hP_.js","/assets/VfxHrMoves-DZkXL22J.js","/assets/VfxJobs-Daq0pYTm.js","/assets/VfxPhoto-DcMWpPgt.js","/assets/VfxShifts-CjtlJPoO.js","/assets/VfxState-DoZk6krq.js","/assets/VfxTimebooks-B7Lp1-Nv.js","/assets/VfxTimesheet-BAW3nr7R.js","/assets/WatchProgress-BPtSLx__.js","/assets/WebLogin-Bssrw_3-.js","/assets/WorkerConcerns-6cD9NJuH.js","/assets/Workers-D3_knH82.js","/assets/Zagruzka-B5yZFEHP.js","/assets/ZagruzkaCell-o3KiK8gj.js","/assets/api-DAHuTf-1.js","/assets/archive-B2C8HDki.js","/assets/archive-restore-DI5xVhAf.js","/assets/arrow-down-CxoiJNxA.js","/assets/arrow-up-narrow-wide-CoQPFWvC.js","/assets/award-CchZ_qs3.js","/assets/ban-BmkF7Lv1.js","/assets/boxes-D69ukD9l.js","/assets/braces-mWqfADVO.js","/assets/brigadirFilters-DlB9lYsT.js","/assets/broadcastTree-BpI5RMYz.js","/assets/building-2-SXpdsqB8.js","/assets/calculator-D8qEbDG7.js","/assets/calendar-ChDu9Vir.js","/assets/calendar-days-DLYgjek0.js","/assets/camera-D2zzLgNx.js","/assets/categories-_314Wm4J.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DXfqKRlW.js","/assets/chart-line-CXE1PAJV.js","/assets/chart-pie-C7Hy5NXw.js","/assets/chartRange-O9omgcn1.js","/assets/check-check-B8MEZ2mq.js","/assets/chevron-left-DWCCMoBH.js","/assets/chevrons-up-down-CEy6yeJK.js","/assets/circle-PkMNh-7e.js","/assets/circle-alert-DAwpEWGe.js","/assets/circle-check-big-CNYFdTXP.js","/assets/circle-dashed-CDmmD7xq.js","/assets/circle-minus-B6MLVPpo.js","/assets/circle-question-mark-DQ5LgOeE.js","/assets/circle-slash-Bzip6_0T.js","/assets/circle-user-round-fLsKaUmP.js","/assets/clock-3-Dh1xAh3X.js","/assets/cloud-off-DyCMPFNR.js","/assets/cloud-upload-DF3PiQ_0.js","/assets/compass-BlzlCCwp.js","/assets/concernCategories-DAsKjpfS.js","/assets/copy-B5W5Lpmo.js","/assets/corner-down-right-BzeVv_tl.js","/assets/createLucideIcon-Drt_lF2I.js","/assets/es-Bup6pD1R.js","/assets/external-link-CrW2iPiX.js","/assets/file-clock-uendzGMT.js","/assets/file-exclamation-point-CFuxPrjV.js","/assets/flag-ACLPWWqG.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-75ZqT_aW.js","/assets/hash-BkllKRcH.js","/assets/hourglass-K5bHDcuU.js","/assets/image-CD00m1zO.js","/assets/image-off-IHyzUMRF.js","/assets/inbox-Cl1EklBI.js","/assets/index-B7yzqq84.css","/assets/index-BPQV5zHy.js","/assets/keyboard-DUYjHdBS.js","/assets/languages-CBPNY3uv.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-D3JRDsWK.js","/assets/lightbulb-VWr5iwC9.js","/assets/link-2-CUF4jd6J.js","/assets/link-2-off-OdBoRNgF.js","/assets/list-ordered-BrVyIzeG.js","/assets/list-tree-BFGyKBnE.js","/assets/lock-open-BHzPhMlo.js","/assets/log-in-YU4hu85a.js","/assets/minimize-2-DnAINRga.js","/assets/package-check-C-9Af5-Q.js","/assets/pencil-9_vPeOFN.js","/assets/percent-CajGtiF8.js","/assets/pin-DlIfjRt3.js","/assets/pin-off-Cg_YUz5F.js","/assets/play-BnQAHG_c.js","/assets/plug-zap-DwV1Z0m8.js","/assets/prop-types-FKKIzQEx.js","/assets/radio-CJlxmjeb.js","/assets/react-apexcharts.esm-CPmzT8Lg.js","/assets/registers-DdTaAHMk.js","/assets/repeat-DCIxSvFR.js","/assets/save-CLUWZm6k.js","/assets/scopeLinks-BhSXYTem.js","/assets/scroll-text-BO9fv06F.js","/assets/search-x-FedoKw06.js","/assets/segments-DyfFhYUO.js","/assets/send-vuE7zg3N.js","/assets/settings-2-DGb6foV6.js","/assets/shield-BstqEyKv.js","/assets/shield-alert-DOsBNHya.js","/assets/shield-question-mark-BQEisrq8.js","/assets/siren-B4dOCNFk.js","/assets/snowflake-DRsK5XW7.js","/assets/split-BnQ5O4cu.js","/assets/square-check-big-pY5mrnis.js","/assets/star-Crjo0Usu.js","/assets/statusBands-CcCy_3qw.js","/assets/store-Bb1OIuNz.js","/assets/table-2-A7RkyiDo.js","/assets/table-properties-D69Hbmmd.js","/assets/tag-DoEjapqI.js","/assets/timer-off-B0voB4ME.js","/assets/trending-down-CBxPKRXQ.js","/assets/trending-up-CS_AOEMW.js","/assets/undo-2-Cn7zBjox.js","/assets/useChartTheme-BFLa5BJD.js","/assets/useElementWidth-CSsNzKEl.js","/assets/useIsMobile-Bv1E-Vl1.js","/assets/useOpenParam-23_qFoXJ.js","/assets/useStatusBands-BZBNRXma.js","/assets/useUrlScope-Cug8IX0f.js","/assets/user-Borb5XgQ.js","/assets/user-cog-DYIK6Xr2.js","/assets/users-BB8LceKT.js","/assets/vfx-Bvh9bVNl.js","/assets/video-2jbwSkGR.js","/assets/wallet-UmX28xG0.js","/assets/warehouse-DcRCoUUA.js","/assets/x-DgNgtpfI.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
