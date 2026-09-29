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

const BUILD = "2026-09-29T04:54:30.454Z";
const PRECACHE = ["/","/assets/AdminPanel-FFAhgq6_.js","/assets/AnalysisBoard-BxyJV7RW.js","/assets/Arc-U37p26zO.js","/assets/ArcLegacy-DAou1QAB.js","/assets/AttendanceModal-BTbQuXQm.js","/assets/BrigadirProfile-ChFLARZZ.js","/assets/BroadcastReceivers-BxqDSrnZ.js","/assets/BroadcastRecord-CA6UwEnh.js","/assets/CatLockNotice-k8tlV2fO.js","/assets/CategoryLegendModal-D98rzRHB.js","/assets/CellConcerns-KJ3KpSrA.js","/assets/CellDetails-DpWLb_l6.js","/assets/CellFormModal-hRPgn--p.js","/assets/CellLink-DLqTzYsk.js","/assets/Cells-DdMz1_2w.js","/assets/ColumnFilter-BPYzSnyh.js","/assets/ColumnsPicker-dj53o-QT.js","/assets/CommentsModal-D2oGwKRF.js","/assets/ComparisonTable-C2AklsmE.js","/assets/Concerns-NGjuIVNI.js","/assets/ConfirmDialog-SaABNh1N.js","/assets/Daily--pBvg73d.js","/assets/DataTable-CAUwQp-H.js","/assets/DateRangePicker-eg-a7GLv.js","/assets/DayReportView-DHSWRNo_.js","/assets/DayStepper-B_re6zaR.js","/assets/DifferenceBreakdown-CzSrOo5P.js","/assets/Downtime-jZsXEP9j.js","/assets/Education-Dm-EPoJD.js","/assets/EducationLesson-CwJtgN57.js","/assets/EmptyState-AR55ZzKi.js","/assets/Exam-Ch3HFTeG.js","/assets/FactorySelect-Dp3ay7WX.js","/assets/Gamification-ieqlyYk-.js","/assets/GroupBadge-C4qIZmoq.js","/assets/HeatmapChart-C8ixA_iW.js","/assets/IdleCell-CHvXIX8H.js","/assets/KPICard-O35JjFnY.js","/assets/Kaizen-DM6G3LNM.js","/assets/Kelish-BZozX0Si.js","/assets/KpiDeltaCard-BHVPQGAU.js","/assets/LangTextInput-Ce_aGynC.js","/assets/Layout-Jqkg8R6q.js","/assets/LeaderAppeal-FWeyakh4.js","/assets/LeaderDayReport-Dxu6Py5-.js","/assets/LeaderUnitReport-CMPUJPWC.js","/assets/Leaderboard-DRlhAO7_.js","/assets/Leaders-Cq0sWmzo.js","/assets/Lightbox-Bt6TJ6tr.js","/assets/LiveOverview-bYr63JP7.js","/assets/Login-CyArc5Va.js","/assets/NotFound-XPmd_O7k.js","/assets/Overview-DenYpxbA.js","/assets/Pagination-D2oZfW2R.js","/assets/PerenaladkaFactTable-CITlCMJl.js","/assets/PlanFulfillment-B3TKeOHt.js","/assets/Production-DzrlKa04.js","/assets/Profile-BAeScXE6.js","/assets/ProofCamera-jBzKNFuO.js","/assets/ProofPhoto-5Ya5lGZx.js","/assets/Quality-DRtLXDs5.js","/assets/RequestStateChip-zGWY_tfK.js","/assets/RichTextEditor-DPB8bLwS.js","/assets/SaveState-CX_Og0LE.js","/assets/SearchInput-KDt3x77l.js","/assets/SeasonalityHeatmap-CQjlJKI6.js","/assets/SegmentedToggle-Cy99mmii.js","/assets/SetupTimes-CU5Ak8Z6.js","/assets/ShiftDaily-DZtOxbP1.js","/assets/Staff-BJyXu1Wg.js","/assets/StatusBadge-DmeBBXQ8.js","/assets/TargetGoal-BACCKl9L.js","/assets/Targets-DX-9rBEb.js","/assets/Tasks-YOhZlz8A.js","/assets/TimeWheelPicker-BlH-eOjX.js","/assets/Tooltip-GCQPvcvZ.js","/assets/TrendChart-D4F3d7VV.js","/assets/TripleSpeedometer-C3l98wo-.js","/assets/Trudoyomkost-Bda8eDL9.js","/assets/UploadDropzone-DIsGvfie.js","/assets/UsersActivity-FvX_Hpz_.js","/assets/VerdictBlock-B205grKr.js","/assets/WatchProgress-qjZw-nvi.js","/assets/WebLogin-lIIXXKUp.js","/assets/WorkerConcerns-QFXVJfY8.js","/assets/Workers-Drtvv-qG.js","/assets/Zagruzka-Cs2YO6U4.js","/assets/ZagruzkaCell-Zzb-NSgS.js","/assets/api-BOnk94g2.js","/assets/archive-CCRR0fK3.js","/assets/archive-restore-Cf4lk2Wu.js","/assets/arrow-down-B_QqBMb-.js","/assets/arrow-left-Hal4y87e.js","/assets/arrow-left-right-8ioyMw9e.js","/assets/arrow-up-bJWqQ3yr.js","/assets/arrow-up-narrow-wide-udpwy5ZR.js","/assets/arrow-up-right-CDJyxn1s.js","/assets/award-CDI0fs-g.js","/assets/ban-D04R8Q8o.js","/assets/bot-jYoHRaUL.js","/assets/boxes-CT2i5jUp.js","/assets/brigadirFilters-CtZNlZro.js","/assets/broadcastTree-CrWbS3EF.js","/assets/building-2-Du10qnDj.js","/assets/calendar-Ck3XcaaP.js","/assets/calendar-clock-ifP4uCAh.js","/assets/calendar-days-CMwr4gjk.js","/assets/calendar-range-Dyi1AHWI.js","/assets/camera-Cwc_vbJf.js","/assets/categories-BVwzqsyx.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CBJXZRQF.js","/assets/chart-line-o8WZzIRe.js","/assets/chart-pie-K9fSE9yU.js","/assets/chartRange-BRN97GiJ.js","/assets/chevron-left-Btl6SMzt.js","/assets/chevrons-up-down-PBlNV7OT.js","/assets/circle-D0PjOQbV.js","/assets/circle-check-big-Rhp3jrmf.js","/assets/circle-dot-BUfFPHIt.js","/assets/circle-minus-Bw08DxCR.js","/assets/circle-slash-DdcCNuWz.js","/assets/circle-user-round-CIwt8Nu9.js","/assets/cloud-off-mEiA5GXf.js","/assets/cloud-upload-_T8Zc_p4.js","/assets/compass-B1t0GQ5e.js","/assets/concernCategories-BzbnCi7A.js","/assets/copy-tOc_Oa2G.js","/assets/corner-down-right-CCnX3sN_.js","/assets/createLucideIcon--WclWXTl.js","/assets/es-DdWA4GZD.js","/assets/exportXlsx-Fj8sNcA6.js","/assets/external-link-ZUDZsTkA.js","/assets/file-clock-BUoPhZad.js","/assets/file-exclamation-point-3aVAcYZ5.js","/assets/file-spreadsheet-CJdWETkK.js","/assets/file-text-C8TfQ8DB.js","/assets/flag-iqwlR1bI.js","/assets/flame-BgV33eE4.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BzdfMS40.js","/assets/hash-B7-NeE2S.js","/assets/history-BaQKCzE9.js","/assets/hourglass-BYzMZLJf.js","/assets/image-CxvXbjPF.js","/assets/image-off-Dsmy0EX6.js","/assets/index-BtjWqi6K.css","/assets/index-DCzsWLv5.js","/assets/key-round-DVnRqrS-.js","/assets/keyboard-CPL4YZdd.js","/assets/languages-BPSBgKcA.js","/assets/layers-Ct4Xjq8q.js","/assets/lightbulb-VGwDaryD.js","/assets/link-2-B2sQ-SuY.js","/assets/list-checks-ClluwFTs.js","/assets/list-ordered-BHPzwaBW.js","/assets/list-tree-BFou9c1s.js","/assets/lock-open-pVEZFRwt.js","/assets/log-in-BaKDZmB9.js","/assets/maximize-2-DITAIYDc.js","/assets/message-square-D2vHSjnG.js","/assets/minimize-2-QZ19QQtd.js","/assets/package-check-RaWTeo0W.js","/assets/paperclip-CcOEH_uk.js","/assets/pencil-DwNR971u.js","/assets/percent-ykzZDDEQ.js","/assets/personName-B4KId4zS.js","/assets/pin-Cyj9w_qi.js","/assets/pin-off-DzqVzBRQ.js","/assets/play-BDqBfwN0.js","/assets/presentation-Bsxu3kqb.js","/assets/prop-types-CiOm40Qn.js","/assets/radio-CNlwpqaG.js","/assets/react-apexcharts.esm-QAlA715e.js","/assets/repeat-D7U3dHBh.js","/assets/rotate-ccw-Q9YTTKyj.js","/assets/rotate-cw-BIEB-veT.js","/assets/save-DOsIucAb.js","/assets/scale-Dfa5AKk2.js","/assets/scroll-text-BmsPuJNL.js","/assets/search-x-DxYp0_rx.js","/assets/segments-D7nWg9Cz.js","/assets/send-DW27Md03.js","/assets/settings-2-DY_0JQ5M.js","/assets/shield-alert-D4FunqbK.js","/assets/shield-check-CrWbEFj-.js","/assets/shield-mc_yoStT.js","/assets/shield-question-mark-DKlMLJ-e.js","/assets/siren-D619uQ5F.js","/assets/smartphone-gCuzrBQO.js","/assets/snowflake-Cf3EOSGD.js","/assets/square-DczVt3Fa.js","/assets/square-check-big-B7RFot-n.js","/assets/star-DmQry9mM.js","/assets/statusBands-0hUJ2MSj.js","/assets/store-IAwljmD3.js","/assets/table-2-BJiZ-YrH.js","/assets/table-properties-B7zVhF9q.js","/assets/tag-BjCID8yg.js","/assets/timer-off-B2CvbqGy.js","/assets/trending-down-BUSfPJ0L.js","/assets/trending-up-B_EmtDKn.js","/assets/undo-2-Bj1zf5VC.js","/assets/useChartTheme-7YVIwrDA.js","/assets/useElementWidth-KQLFDeoU.js","/assets/useIsMobile-DMFugQnr.js","/assets/useMutation-Chm5BhR_.js","/assets/useStatusBands-Dgk_ga58.js","/assets/user-B4vwn_Ea.js","/assets/user-cog-Bping4ra.js","/assets/user-minus-tXtKal4K.js","/assets/users-CJbvVLeF.js","/assets/video-BfDyOY8P.js","/assets/wallet-B90ff5Zh.js","/assets/warehouse-CZaSUqzE.js","/assets/zap-Dz3wNxmP.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
