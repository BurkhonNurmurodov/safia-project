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

const BUILD = "2026-10-01T06:10:09.331Z";
const PRECACHE = ["/","/assets/AdminPanel-O2JJuSGP.js","/assets/AnalysisBoard-XyLDl9nu.js","/assets/Arc-Mo8XDkO0.js","/assets/ArcLegacy-CUvzDBHb.js","/assets/BrigadirProfile-LPacaq7Q.js","/assets/BroadcastReceivers-ChkLBFTq.js","/assets/BroadcastRecord-CcmtXSor.js","/assets/CatLockNotice-bMG0-EWu.js","/assets/CategoryLegendModal-DWP6mf7d.js","/assets/CellConcerns-oA2chd8r.js","/assets/CellDetails-DmLzyTvM.js","/assets/CellFormModal-DOuNkk7r.js","/assets/CellIdent-DjzgFuch.js","/assets/CellLink-aFxA1TE9.js","/assets/Cells-BDzxPzeK.js","/assets/ColumnFilter-C5XmyH5u.js","/assets/ColumnsPicker-DXQwGe27.js","/assets/CommentsModal-CQMy8RKZ.js","/assets/ComparisonTable-BZVfgF4R.js","/assets/Concerns-B5hG1ahV.js","/assets/ConfirmDialog-K5gPEkzm.js","/assets/Daily-fCYgzVt6.js","/assets/DataTable-Dy_cGW75.js","/assets/DateRangePicker-MsN8jCJ-.js","/assets/DayReportView-BXs3uK9q.js","/assets/DayStepper-BQkIMpXO.js","/assets/DifferenceBreakdown-DLsA8sUE.js","/assets/Downtime-D7nCuk_b.js","/assets/Education-BDyqISBF.js","/assets/EducationLesson-B38V1hUg.js","/assets/EmptyState-kbV43a3l.js","/assets/Exam-cjOj1NdH.js","/assets/FactorySelect-gYC_bchM.js","/assets/Gamification-DdA4mfhE.js","/assets/GroupBadge-BdknFoRr.js","/assets/HeatmapChart-B6HijgHJ.js","/assets/IdleCell-sApjfGje.js","/assets/KPICard-iTin11-F.js","/assets/Kaizen-DnlvEjUq.js","/assets/Kelish-DNWsk1Se.js","/assets/KpiDeltaCard-DsqI5IiJ.js","/assets/LangTextInput-B8P2GpeL.js","/assets/Layout-DRdcuJDH.js","/assets/LeaderAppeal-kJI088e6.js","/assets/LeaderDayReport-B_jhYveQ.js","/assets/LeaderUnitReport-DtIgMimd.js","/assets/Leaderboard-nb0q4lZg.js","/assets/Leaders-c95L9G_y.js","/assets/Lightbox-HX2C_X8K.js","/assets/LiveOverview-Db-A--80.js","/assets/Login-Blp5X_iL.js","/assets/NotFound-BrW01O6g.js","/assets/Overview-BZkcjMLD.js","/assets/Pagination-CYzy1zgI.js","/assets/PerenaladkaFactTable-CtTaa0ku.js","/assets/PlanFulfillment-DdPZnEZm.js","/assets/Production-B6b1R-BY.js","/assets/Profile-B8tavtXw.js","/assets/ProofCamera-BHRf4bnh.js","/assets/ProofPhoto-Bk57JMO1.js","/assets/Quality-DhPnA3cC.js","/assets/RequestStateChip-BLy2YUUZ.js","/assets/RichTextEditor-C8dwlBWQ.js","/assets/SaveState-C1SLPoxT.js","/assets/SearchInput-RPltNPZV.js","/assets/SeasonalityHeatmap-jwsd8Bvc.js","/assets/SegmentedToggle-BZdmu8KR.js","/assets/SetupTimes-D7Kql2eG.js","/assets/ShiftDaily-CawfohLK.js","/assets/Staff-D_5a4_Vz.js","/assets/StatusBadge-DkYmnuku.js","/assets/TargetGoal-C9TdSFB5.js","/assets/Targets-DHTWAll0.js","/assets/Tasks-CpGvLDpO.js","/assets/TimeWheelPicker-CVAlhYAT.js","/assets/Tooltip-BYwzJLLe.js","/assets/TrendChart-Ci08mrdu.js","/assets/TripleSpeedometer-CZs9PxnU.js","/assets/Trudoyomkost-7Hf4NICW.js","/assets/UploadDropzone-BOOfhDJm.js","/assets/UsersActivity-BulRhjfX.js","/assets/VerdictBlock-OearAK7v.js","/assets/WatchProgress-DXc0L3hx.js","/assets/WebLogin-1qO_UcOb.js","/assets/WorkerConcerns-DGd9NwZQ.js","/assets/Workers-B2guayl0.js","/assets/Zagruzka-CRd59CgW.js","/assets/ZagruzkaCell-DRvAPvhG.js","/assets/api-D1fizmMv.js","/assets/archive-DJyTpEJn.js","/assets/archive-restore-DvsRtMem.js","/assets/arrow-down-DDhSVpx8.js","/assets/arrow-left-D8UpNlk4.js","/assets/arrow-left-right-D5ecnGJ1.js","/assets/arrow-up-BvNH9y2R.js","/assets/arrow-up-narrow-wide-BX_GrG_u.js","/assets/arrow-up-right-CRe8rC_0.js","/assets/award-BaMIr6vu.js","/assets/ban-w6ejVb7o.js","/assets/bot-DZyqH2ax.js","/assets/boxes-C8XQUNcL.js","/assets/brigadirFilters-fP-YTtCu.js","/assets/broadcastTree-Cf2Yxkjl.js","/assets/building-2-DKbIt0lL.js","/assets/calendar-clock-C3S6r53M.js","/assets/calendar-days-BgZJaFCb.js","/assets/calendar-fc-Amtzr.js","/assets/calendar-range-r1YkpzYT.js","/assets/camera-CWEGMx1S.js","/assets/categories-Cy3FuLO0.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-nvhun2gs.js","/assets/chart-line-vK8MjK1x.js","/assets/chart-pie-CTeiVTYz.js","/assets/chartRange-ILD7qHiR.js","/assets/chevron-left-Itjpq-dV.js","/assets/chevrons-up-down-pfqrb8Gd.js","/assets/circle-KIPMKISE.js","/assets/circle-check-big-DSYbSvMI.js","/assets/circle-dot-BOssHd_L.js","/assets/circle-minus-DM2S34vW.js","/assets/circle-slash-W9qCpAqr.js","/assets/circle-user-round-DPGzmraP.js","/assets/cloud-off-DO4AHgGZ.js","/assets/cloud-upload-D2rJ_2s2.js","/assets/compass-CHvHxdQD.js","/assets/concernCategories-C1DCIVXZ.js","/assets/copy-KadYKX5o.js","/assets/corner-down-right-fcMs8TFK.js","/assets/createLucideIcon-VuJVmCcd.js","/assets/es-YHpLQ58s.js","/assets/exportXlsx-TYbBI8MI.js","/assets/external-link-Cce2xsQV.js","/assets/file-clock-CoPJr-68.js","/assets/file-exclamation-point-BZjAAEc5.js","/assets/file-spreadsheet-C38GCBps.js","/assets/file-text-VO5MUWtU.js","/assets/flag-DGQyLM-B.js","/assets/flame-DgqNTqz2.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CiZb3JPu.js","/assets/hash-D0QKWApd.js","/assets/history-DeVuYZOk.js","/assets/hourglass-DE7y3C8w.js","/assets/image-o_nRvc_s.js","/assets/image-off-C8q071Eo.js","/assets/index-BbXTI5xr.css","/assets/index-Dz7B9IGb.js","/assets/key-round-BpA4qGc-.js","/assets/keyboard-3T7OOsWN.js","/assets/languages-BVQBFBpC.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CHoBmgbz.js","/assets/lightbulb-D8yNWqbd.js","/assets/link-2-HlFI-Nd8.js","/assets/link-2-off-DAxkCZlt.js","/assets/list-checks-BOFCxFcw.js","/assets/list-ordered-B4lwwuEd.js","/assets/list-tree-BljIrYRm.js","/assets/lock-open-DiKDubX5.js","/assets/log-in-BFfsOvpI.js","/assets/maximize-2-CvJgYz4X.js","/assets/message-square-Di4UKmkp.js","/assets/minimize-2-CJ9HZEeZ.js","/assets/package-check-C1VeAo9T.js","/assets/paperclip-CqxlxMI9.js","/assets/pencil-CRjcd7iH.js","/assets/percent-BuAiQlpB.js","/assets/personName-CogOuS3K.js","/assets/pin-Cyl4R_LI.js","/assets/pin-off-BM3Qg3aN.js","/assets/play-EDcu9Of6.js","/assets/plug-zap-CxNbwxHX.js","/assets/presentation-DgWIHv49.js","/assets/prop-types-jBJnuMJW.js","/assets/radio-bYL4xq7a.js","/assets/react-apexcharts.esm-CTnEnr-8.js","/assets/repeat-BgxchDKj.js","/assets/rotate-ccw-CVbydBCm.js","/assets/rotate-cw-DUK6S21A.js","/assets/save-DGdDExBW.js","/assets/scale-LII07Qdr.js","/assets/scopeLinks-CK3RgL3L.js","/assets/scroll-text-Bhgkh_bN.js","/assets/search-x-Bpr2CZCC.js","/assets/segments-CARCk0g-.js","/assets/send-DG1CuNEj.js","/assets/settings-2-vbBhalBW.js","/assets/shield-DCS0CYPs.js","/assets/shield-alert-COHi_pT1.js","/assets/shield-check-CbKXvwC3.js","/assets/shield-question-mark-BDwMYCFQ.js","/assets/siren-BJs0T25u.js","/assets/snowflake-DLNzdB8j.js","/assets/split-DaWPN-db.js","/assets/square-BnAgSLrt.js","/assets/square-check-big-C1dbMTAG.js","/assets/star-BtbBmzIn.js","/assets/statusBands-BSW4cRhO.js","/assets/store-BR2lQbFQ.js","/assets/table-2-86Z1GrPt.js","/assets/table-properties-BAWH0XLC.js","/assets/tag-C0G5B-tU.js","/assets/timer-off-BpjfCCN0.js","/assets/trending-down-BbRGF-7v.js","/assets/trending-up-BrOiB7qA.js","/assets/undo-2-96k3dEJW.js","/assets/useChartTheme-BKMlO5Ft.js","/assets/useElementWidth-DYrZHfZh.js","/assets/useIsMobile-CtlQkv9E.js","/assets/useMutation-BGbuiP8N.js","/assets/useStatusBands-f3e_kK6b.js","/assets/useUrlScope-yKGkxfN6.js","/assets/user-CZcHQs8S.js","/assets/user-cog-a5CaHW6G.js","/assets/user-minus-DZuUsKN4.js","/assets/users-BQrK8Gb6.js","/assets/video-gwedI5mQ.js","/assets/wallet-Kd82R6sc.js","/assets/warehouse-ByaysUF-.js","/assets/zap-DWBPag70.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
