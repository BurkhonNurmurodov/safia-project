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

const BUILD = "2026-10-01T07:21:07.666Z";
const PRECACHE = ["/","/assets/AdminPanel-B0i8yrW9.js","/assets/AnalysisBoard-NCMSWNu9.js","/assets/Arc-CYyAtfa-.js","/assets/ArcLegacy-BzeGHSyt.js","/assets/BrigadirProfile-DY1h9pht.js","/assets/BroadcastReceivers-DWvN4V-x.js","/assets/BroadcastRecord-jkK93duD.js","/assets/CatLockNotice-DJnOK1TX.js","/assets/CategoryLegendModal-DlmXCM3p.js","/assets/CellConcerns-Cm5uT9vp.js","/assets/CellDetails-CTwrP-LU.js","/assets/CellFormModal-CX1ATUi4.js","/assets/CellIdent-DX6Q1WUg.js","/assets/CellLink-DDMfTutB.js","/assets/Cells-CtoPEz2V.js","/assets/ColumnFilter-CzLx3o8r.js","/assets/ColumnsPicker-BD0WtHvf.js","/assets/CommentsModal-BLanDl3C.js","/assets/ComparisonTable-DzTn1NbK.js","/assets/Concerns-C9MU3IwR.js","/assets/ConfirmDialog-DZouj2R8.js","/assets/Daily-D8skihCy.js","/assets/DataTable-CWN8tm7L.js","/assets/DateRangePicker-CtIOTnYs.js","/assets/DayReportView-xnhJl82A.js","/assets/DayStepper-CueOiH1-.js","/assets/DifferenceBreakdown-DQgSygyS.js","/assets/Downtime-BEFnD8WX.js","/assets/Education-Cw496t4v.js","/assets/EducationLesson-CFvt7Rr-.js","/assets/EmptyState-CyoJunsA.js","/assets/Exam-kk32RC-g.js","/assets/FactorySelect-CNpDigdM.js","/assets/Gamification-B4i5-Qas.js","/assets/GroupBadge-DFFPeTHD.js","/assets/HeatmapChart-2h4XAIAh.js","/assets/IdleCell-nrMubxvD.js","/assets/KPICard-BCyt3JaM.js","/assets/Kaizen-C-KuD-3z.js","/assets/Kelish-pLJtPTvh.js","/assets/KpiDeltaCard-YD9SJ73s.js","/assets/LangTextInput-6b4Neb_7.js","/assets/Layout-Cjc_6rWa.js","/assets/LeaderAppeal-d9T9_aHD.js","/assets/LeaderDayReport-6-DdTZUT.js","/assets/LeaderUnitReport-IPV49SQC.js","/assets/Leaderboard-4vPDDyR1.js","/assets/Leaders-DPXgqR96.js","/assets/Lightbox-KKCUmtOw.js","/assets/LiveOverview-CoHJlfYk.js","/assets/Login-DwqvjrKf.js","/assets/NotFound-DQ0bwG7G.js","/assets/Overview-CxWBlU0Q.js","/assets/Pagination-DRq4ihcp.js","/assets/PerenaladkaFactTable-GP8UuZ-p.js","/assets/PlanFulfillment-BUsegY7I.js","/assets/Production-CGCL3kVX.js","/assets/Profile-BwzDp3f6.js","/assets/ProofCamera-DBGR2vKi.js","/assets/ProofPhoto-B30nrNZR.js","/assets/Quality-CdyfiBIv.js","/assets/RequestStateChip-Ccd9gGHe.js","/assets/RichTextEditor-BObj9iC2.js","/assets/SaveState-DpIeoPiV.js","/assets/SearchInput-8P_9f8Ie.js","/assets/SeasonalityHeatmap-BFI8OlAm.js","/assets/SegmentedToggle-C7jQXx7W.js","/assets/SetupTimes-C2THVnwY.js","/assets/ShiftDaily-DmtS3bfS.js","/assets/Staff-DQTRfhPt.js","/assets/StatusBadge-BNsKs_ri.js","/assets/TargetGoal-BZFL3_5D.js","/assets/Targets-DBqqSxBk.js","/assets/Tasks-BkdKfhGZ.js","/assets/TimeWheelPicker-aUx88VEB.js","/assets/Tooltip-CXXFXoU-.js","/assets/TrendChart-BPDWc3-k.js","/assets/TripleSpeedometer-D-ruDHNy.js","/assets/Trudoyomkost-DUpaiI0f.js","/assets/UploadDropzone-BqSNxDjn.js","/assets/UsersActivity-qJgfPOfA.js","/assets/VerdictBlock-BdFTaIjs.js","/assets/WatchProgress-BTM3YpuE.js","/assets/WebLogin-DBZ-p1K-.js","/assets/WorkerConcerns-BPZszgES.js","/assets/Workers-CK9OZGJL.js","/assets/Zagruzka-BiDsrBKT.js","/assets/ZagruzkaCell-zB83Pftd.js","/assets/api-sTNl1m26.js","/assets/archive-ClcKgNNU.js","/assets/archive-restore-D-o7ZYVc.js","/assets/arrow-down-43Jv27bP.js","/assets/arrow-left-SqLY4jHN.js","/assets/arrow-left-right-DfpeddAz.js","/assets/arrow-up-D9TOEt9u.js","/assets/arrow-up-narrow-wide-jOhfyijO.js","/assets/arrow-up-right-aXoaLsug.js","/assets/award-u6Hypqy-.js","/assets/ban-CfvU3EXy.js","/assets/bot-vtEHLogT.js","/assets/boxes-BhMqzywY.js","/assets/brigadirFilters-C7pIbNUC.js","/assets/broadcastTree-CiHLx4Et.js","/assets/building-2-hmv38_u2.js","/assets/calendar-Dkj0cWLa.js","/assets/calendar-clock-CB-j139-.js","/assets/calendar-days-CX2684L8.js","/assets/calendar-range-DRS_fqbZ.js","/assets/camera-Du3R5agR.js","/assets/categories-DcE8SA9Y.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-pJ7TetG2.js","/assets/chart-line-C3rEpVZA.js","/assets/chart-pie-D8b-mSIX.js","/assets/chartRange-CsM9rCny.js","/assets/chevron-left-DjXDzc0s.js","/assets/chevrons-up-down-CuVtBBiE.js","/assets/circle-BGEzYGJt.js","/assets/circle-check-big-CabhMrjz.js","/assets/circle-dot-WxBOxMtY.js","/assets/circle-minus-nXXJXtZW.js","/assets/circle-slash-B7XnDVre.js","/assets/circle-user-round-D72U2g6M.js","/assets/cloud-off-s-gZYlpL.js","/assets/cloud-upload-Byqrnn13.js","/assets/compass-CrG0XsCm.js","/assets/concernCategories-C9ZqXR7H.js","/assets/copy-CfRYjukg.js","/assets/corner-down-right-Afbd5tu4.js","/assets/createLucideIcon-Ba577OW9.js","/assets/es-DLmuipyv.js","/assets/exportXlsx-CdwzIBTY.js","/assets/external-link-BpkakNMa.js","/assets/file-clock-BQsW1WLf.js","/assets/file-exclamation-point-BqStVEjI.js","/assets/file-spreadsheet-BcAwHwCm.js","/assets/file-text-Dnq4iqI_.js","/assets/flag-DciM4Exe.js","/assets/flame-Dwv_MKxA.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-fvmUrbeu.js","/assets/hash-CZ-mJmVJ.js","/assets/history-Xzmgv6o1.js","/assets/hourglass--5UMX20N.js","/assets/image-C1bhPnBo.js","/assets/image-off-B6O2H_UM.js","/assets/index-BHS8Hg0Y.css","/assets/index-DhF_oYSY.js","/assets/key-round-D95qB2HX.js","/assets/keyboard-DhMiLBuy.js","/assets/languages-CEmm6xmI.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C7ePD0QJ.js","/assets/lightbulb-C_775fz3.js","/assets/link-2-XLtxh08r.js","/assets/link-2-off-7GGRvbDW.js","/assets/list-checks-sC3IvPkq.js","/assets/list-ordered-COytrPBL.js","/assets/list-tree-DpHy9xIC.js","/assets/lock-open-D01gprbo.js","/assets/log-in-CzJnAGqU.js","/assets/maximize-2-DimXBiEz.js","/assets/message-square-DFg6AWED.js","/assets/minimize-2-CW9gJU9h.js","/assets/package-check-CW6cV-pp.js","/assets/paperclip-C9lcmILR.js","/assets/pencil-BuX3NtVJ.js","/assets/percent-CUE99FSr.js","/assets/personName-CogOuS3K.js","/assets/pin-CedCpxRJ.js","/assets/pin-off-B70yNyrW.js","/assets/play-CLnTqxHO.js","/assets/plug-zap-CHd3P3XJ.js","/assets/presentation-BDC6GN68.js","/assets/prop-types-B9UCVv4P.js","/assets/radio-DwgVh47l.js","/assets/react-apexcharts.esm-C4zQI9gs.js","/assets/repeat-B7vOEkbJ.js","/assets/rotate-ccw-B_RDRcHr.js","/assets/rotate-cw-gtBcgEoN.js","/assets/save-CZeeVX7t.js","/assets/scale-CiXB1ZF7.js","/assets/scopeLinks-CHqd24Pe.js","/assets/scroll-text-C_l0v-Hh.js","/assets/search-x-Dr7Sj6dA.js","/assets/segments-Q18IdB3l.js","/assets/send-CQipa6Bq.js","/assets/settings-2-dxq3HyLP.js","/assets/shield-alert-CQZ_5Stf.js","/assets/shield-b7IiS7sc.js","/assets/shield-check-BOxTajq-.js","/assets/shield-question-mark-CK_wktwo.js","/assets/siren-BrmPqu5G.js","/assets/snowflake-C5S6Zy27.js","/assets/split-q98rGUCp.js","/assets/square-check-big-BUlzvlXa.js","/assets/square-zlxf0EEL.js","/assets/star-D-Wzf-CL.js","/assets/statusBands-BGbVZcSR.js","/assets/store-BTThUUiH.js","/assets/table-2-DLByGjbA.js","/assets/table-properties-Ceoe5Py0.js","/assets/tag-0x3_rFzc.js","/assets/timer-off-C5DlCuV8.js","/assets/trending-down-ja2HJoBa.js","/assets/trending-up-CsgHCJwl.js","/assets/undo-2-BMpZunhb.js","/assets/useChartTheme-Dgeo9pLO.js","/assets/useElementWidth-B8zfkiLp.js","/assets/useIsMobile-BJkF5rTU.js","/assets/useMutation-D-57xEDn.js","/assets/useStatusBands-h-kIyxLf.js","/assets/useUrlScope-U8Wr3nzd.js","/assets/user-DGWmWRkO.js","/assets/user-cog-u2gNpsOw.js","/assets/user-minus-B7xGD1Ym.js","/assets/users-CPSnCDFN.js","/assets/video-pquzv7CW.js","/assets/wallet-cgZQIWS0.js","/assets/warehouse-BWCvEcRf.js","/assets/zap-BV1O3xx4.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
