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

const BUILD = "2026-09-29T10:18:59.489Z";
const PRECACHE = ["/","/assets/AdminPanel-CF-sSW1a.js","/assets/AnalysisBoard-52PjLxZT.js","/assets/Arc-kiA3ULJL.js","/assets/ArcLegacy-8liFRwJp.js","/assets/AttendanceModal-CkwgxOqs.js","/assets/BrigadirProfile-z9x2Lqlf.js","/assets/BroadcastReceivers-CfjoIoY8.js","/assets/BroadcastRecord-BM2Lv3Js.js","/assets/CatLockNotice-Cyz-4gdf.js","/assets/CategoryLegendModal-o-OArX3X.js","/assets/CellConcerns-Wfc8dun5.js","/assets/CellDetails-C1NAPv58.js","/assets/CellFormModal-9Iy6yZT8.js","/assets/CellLink-DFX9DyxS.js","/assets/Cells--Z2JtRN9.js","/assets/ColumnFilter-CNoaqp-a.js","/assets/ColumnsPicker-C787snB0.js","/assets/CommentsModal-C20iKuTo.js","/assets/ComparisonTable-DortOHla.js","/assets/Concerns-DqlPqaz-.js","/assets/ConfirmDialog-BQfHi5Kp.js","/assets/Daily-CAAUmA4j.js","/assets/DataTable-Bu2P8kqt.js","/assets/DateRangePicker-CxAFg17V.js","/assets/DayReportView-C-iYeDsK.js","/assets/DayStepper-ClETIs18.js","/assets/DifferenceBreakdown-B5vdTHpV.js","/assets/Downtime-CrZRKABQ.js","/assets/Education-K4FHSJHF.js","/assets/EducationLesson-QdCFVQn-.js","/assets/EmptyState-BijsIHWd.js","/assets/Exam-CvWx3g_o.js","/assets/FactorySelect-Bu6GiMOl.js","/assets/Gamification-9VRwb2sa.js","/assets/GroupBadge-Cm6jKsS8.js","/assets/HeatmapChart-BhYuNmJ6.js","/assets/IdleCell-DUh3aYxt.js","/assets/KPICard-VRD18yZm.js","/assets/Kaizen-r9aCWlpo.js","/assets/Kelish-DX6WNw6z.js","/assets/KpiDeltaCard-yG8Ju5F0.js","/assets/LangTextInput-ucUAvC5p.js","/assets/Layout-Cf0v9mZp.js","/assets/LeaderAppeal-CiQIXCO-.js","/assets/LeaderDayReport-B4ww2_fc.js","/assets/LeaderUnitReport-BzHPEuzE.js","/assets/Leaderboard-TDX9nzqD.js","/assets/Leaders-etHHpGyA.js","/assets/Lightbox-jCa4gFHD.js","/assets/LiveOverview-ijZu-Did.js","/assets/Login-CeZCcaAH.js","/assets/NotFound-ocSA9HXU.js","/assets/Overview-DXGPr1DA.js","/assets/Pagination-BorzxZF-.js","/assets/PerenaladkaFactTable-sH2Ave7g.js","/assets/PlanFulfillment-D9vQXHR2.js","/assets/Production-Bm2Y_XVa.js","/assets/Profile-DIBoRetk.js","/assets/ProofCamera-BlraNaiA.js","/assets/ProofPhoto-PsVMRQli.js","/assets/Quality-B7yDS5d5.js","/assets/RequestStateChip-BA0Deblq.js","/assets/RichTextEditor-DFfXdQsv.js","/assets/SaveState-BCp44ARq.js","/assets/SearchInput-DM_ud8NW.js","/assets/SeasonalityHeatmap-CthVSXM1.js","/assets/SegmentedToggle-iIMuYtmE.js","/assets/SetupTimes-DxO_UFM0.js","/assets/ShiftDaily-DkdsQylv.js","/assets/Staff-Fr2cLI4_.js","/assets/StatusBadge-BL8aBL4b.js","/assets/TargetGoal-DL1Q-fC2.js","/assets/Targets-BDugcxh-.js","/assets/Tasks-D8JPo_fy.js","/assets/TimeWheelPicker-CJCt80UY.js","/assets/Tooltip-DdhZVqHv.js","/assets/TrendChart-Difw5jdl.js","/assets/TripleSpeedometer-nCuvYBp-.js","/assets/Trudoyomkost-B5eschdz.js","/assets/UploadDropzone-BPxqa-Ah.js","/assets/UsersActivity-BqNvoFRi.js","/assets/VerdictBlock-BaaSDnHz.js","/assets/WatchProgress-BIFc7GLb.js","/assets/WebLogin-C2LRNexA.js","/assets/WorkerConcerns-B9QhCjUc.js","/assets/Workers-Dc7i6BJV.js","/assets/Zagruzka-DqLxPH6P.js","/assets/ZagruzkaCell-B40RaXv0.js","/assets/api-BEPEcZUx.js","/assets/archive-Ds8u65f7.js","/assets/archive-restore-CQ9SVoIN.js","/assets/arrow-down-BWcAQNpf.js","/assets/arrow-left-BOCLDweb.js","/assets/arrow-left-right-5BjkuqQo.js","/assets/arrow-up-5tCnunDi.js","/assets/arrow-up-narrow-wide-BOf6UvK4.js","/assets/arrow-up-right-B-kpCjzQ.js","/assets/award-SFvKAByb.js","/assets/ban-Csxfc2MF.js","/assets/bot-DoYn3H6o.js","/assets/boxes-BLqDIQ-m.js","/assets/brigadirFilters-DrKdsXx5.js","/assets/broadcastTree-De88BiMs.js","/assets/building-2-CxlDFP7v.js","/assets/calendar-DtL_khnQ.js","/assets/calendar-clock-k3FDfaET.js","/assets/calendar-days-CBjlGbNF.js","/assets/calendar-range-FUBVw9VR.js","/assets/camera-GW15T6Wf.js","/assets/categories-DqbwYrc6.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BTHQd1lg.js","/assets/chart-line-DFpRP7Q7.js","/assets/chart-pie-C2TFH1dD.js","/assets/chartRange-vpaEEQkp.js","/assets/chevron-left-CIAjKABK.js","/assets/chevrons-up-down-CQVzzdjN.js","/assets/circle-BxvbpgiH.js","/assets/circle-check-big-DWmub4Ss.js","/assets/circle-dot-DsLK9IzT.js","/assets/circle-minus-DZiOPseW.js","/assets/circle-slash-BzWd_YNe.js","/assets/circle-user-round-BEPNT1mA.js","/assets/cloud-off-DgvT6WOj.js","/assets/cloud-upload-CG3jX3oQ.js","/assets/compass-BLN-c3ZD.js","/assets/concernCategories-DJmftFy0.js","/assets/copy-DyK7qKfF.js","/assets/corner-down-right-Cm02ix7h.js","/assets/createLucideIcon-D50WTxvT.js","/assets/es-CebW_a1l.js","/assets/exportXlsx-CvxCSMH9.js","/assets/external-link-BNv06YPy.js","/assets/file-clock-CsP1jxvs.js","/assets/file-exclamation-point-BrIxY_Y3.js","/assets/file-spreadsheet-CTnXqsiY.js","/assets/file-text-6s-Y6kRA.js","/assets/flag-CKfiZUYU.js","/assets/flame-BkSaB5NC.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Dpd1O1Wj.js","/assets/hash-BTtng0BU.js","/assets/history-CkNwWm7T.js","/assets/hourglass-0cqmMcdN.js","/assets/image-oa1bTh_E.js","/assets/image-off-BVE5u2dE.js","/assets/index-6SHemkQb.js","/assets/index-ClcfsWXQ.css","/assets/key-round-DuJr0Q_0.js","/assets/keyboard-CRZBBBXs.js","/assets/languages-lS_WyCJM.js","/assets/layers-D7Eie6op.js","/assets/lightbulb-jt80Iim6.js","/assets/link-2-CHCRAQ33.js","/assets/link-2-off-D177R4zC.js","/assets/list-checks-UCAdP8g-.js","/assets/list-ordered-kBwnn22c.js","/assets/list-tree-CNDZxyOp.js","/assets/lock-open-CVPPd3DA.js","/assets/log-in-C-uA11KO.js","/assets/maximize-2-Cau3Ep5L.js","/assets/message-square-C4mxfF3b.js","/assets/minimize-2-Dm-HBF-1.js","/assets/package-check-BtVAd_tp.js","/assets/paperclip-BjKIMrtx.js","/assets/pencil-DAwS7VJV.js","/assets/percent-BixqPF1_.js","/assets/personName-CogOuS3K.js","/assets/pin-2tzi5k4q.js","/assets/pin-off-B2bKxEyQ.js","/assets/play-CPkEJx23.js","/assets/presentation-CXzRWtBD.js","/assets/prop-types-C3DHIK8B.js","/assets/radio-BtL1Y6vU.js","/assets/react-apexcharts.esm-DkPVxDsG.js","/assets/repeat-Bqlo5bVx.js","/assets/rotate-ccw-Cbn3ajlD.js","/assets/rotate-cw-UJu0hKmY.js","/assets/save-B_t8D26g.js","/assets/scale-DyCsyHuJ.js","/assets/scroll-text-DjMLkrwJ.js","/assets/search-x-CwJgsAzo.js","/assets/segments-DN_f3wfs.js","/assets/send-DXvsnhaS.js","/assets/settings-2-YKzp7PpF.js","/assets/shield-alert-0RauWvw4.js","/assets/shield-check-HDagaGMZ.js","/assets/shield-pP_QJtPQ.js","/assets/shield-question-mark-BDqACLRK.js","/assets/siren-m0zlyHFw.js","/assets/snowflake-LqB2xNVT.js","/assets/square-Du7UbqL_.js","/assets/square-check-big-DMDEtlHn.js","/assets/star-nbZKMYhP.js","/assets/statusBands-BwghXPsz.js","/assets/store-OpoaBrRS.js","/assets/table-2-BSuyxzgN.js","/assets/table-properties-S0YYlwbo.js","/assets/tag-CtDLLyyT.js","/assets/timer-off-DAA3q2C_.js","/assets/trending-down-Dm3e0sR4.js","/assets/trending-up-Bq7mbx3Z.js","/assets/undo-2-CswFDV_r.js","/assets/useChartTheme-JWcjcTV-.js","/assets/useElementWidth-820scyLA.js","/assets/useIsMobile-DAh__kB4.js","/assets/useMutation-blMZ3cAF.js","/assets/useStatusBands-z0xN7P7K.js","/assets/user-DxyMqREJ.js","/assets/user-cog-DKyXgZKB.js","/assets/user-minus-DQYhYKOX.js","/assets/users-_YcQXdoq.js","/assets/video-BhtN9n_p.js","/assets/wallet-XPIce-aX.js","/assets/warehouse-CUctvrul.js","/assets/zap-BWQacXos.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
