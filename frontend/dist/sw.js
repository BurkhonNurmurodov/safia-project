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

const BUILD = "2026-10-13T09:10:17.180Z";
const PRECACHE = ["/","/assets/AdminPanel-CrC1NYn5.js","/assets/AnalysisBoard-BXVeT5EK.js","/assets/Arc-wGYR8MiG.js","/assets/Assistant-Hq0mHcQe.js","/assets/BrigadirProfile-AhThGVaZ.js","/assets/BroadcastReceivers-D8cmc8hT.js","/assets/BroadcastRecord-Cq1hFMwC.js","/assets/Button-BYLHkQes.js","/assets/CatLockNotice-xlj638I4.js","/assets/CategoryLegendModal-BU2lRuDW.js","/assets/CellConcerns-v1fd8T2A.js","/assets/CellDetails-BsoR4pyz.js","/assets/CellFormModal-DM2NcD6z.js","/assets/CellIdent-DR_8s4En.js","/assets/CellLink-CTZ9QiOX.js","/assets/Cells-BGTbJU7x.js","/assets/ColumnFilter-McxK0G0e.js","/assets/ColumnsPicker-DcVCgxon.js","/assets/CommentsModal-B5weblnn.js","/assets/ComparisonTable-D4ln2LY7.js","/assets/Concerns-DibrF5CK.js","/assets/CountStepper-Cnb4p0h7.js","/assets/Daily-D4S45X9v.js","/assets/DataTable-Bun2bcJC.js","/assets/DateRangePicker-CquIb5SM.js","/assets/DayReportView-BYzAIvyZ.js","/assets/DayStepper-Bc2Bk8Og.js","/assets/DifferenceBreakdown-CoSQmTCk.js","/assets/Downtime-EhRKn1il.js","/assets/Education-D1r8wdWY.js","/assets/EducationLesson-DdObF6CD.js","/assets/EmptyState-ZxvW9DRl.js","/assets/Exam-CrMZ1Dq9.js","/assets/FactorySelect-DQr-fn-P.js","/assets/Gamification-BGWfLg6y.js","/assets/GroupBadge-B-UJbay-.js","/assets/HeatmapChart-D5afFh5R.js","/assets/IdleCell-BJTAy1dc.js","/assets/KPICard-BNxQFsv6.js","/assets/Kaizen-CwN-ljuV.js","/assets/Kelish-Db0npDBB.js","/assets/KpiDeltaCard-BHLpUJZo.js","/assets/LangTextInput-C_wc6lZL.js","/assets/Layout-pBlJQyXV.js","/assets/LeaderAppeal-J-jgABfn.js","/assets/LeaderDayReport-DwPkMtYH.js","/assets/LeaderUnitReport-DCLyEicf.js","/assets/Leaderboard-Id6kkCCG.js","/assets/Leaders-BP-GYiru.js","/assets/Lightbox-CRShwYfS.js","/assets/LiveOverview-7cY8VH4f.js","/assets/Login-DprOGSN_.js","/assets/NotFound-CZiTyb_u.js","/assets/Notifications-UA8EtxRJ.js","/assets/Overview-DcnZ8m1W.js","/assets/Pagination-DBNQtNY_.js","/assets/PerenaladkaFactTable-B2_G-_Gx.js","/assets/PersonCard-DpFR-62f.js","/assets/PlanFulfillment-C5eF3WAU.js","/assets/Production-DjwmG-k7.js","/assets/Profile-Df_Hkd_-.js","/assets/ProofCamera-CTrcZYgP.js","/assets/Quality-CcC-bTj4.js","/assets/RawRows-gjdF4PIR.js","/assets/RequestStateChip-Btf0D1pP.js","/assets/RichTextEditor-BvjeLASE.js","/assets/SaveState-C33_7CMX.js","/assets/SearchInput-Dg7rmlou.js","/assets/SeasonalityHeatmap-t2UeM_Kp.js","/assets/SegmentedToggle-UBKsszaA.js","/assets/SetupTimes-WHL3x1Yt.js","/assets/ShiftDaily-C0bVyRgg.js","/assets/Staff-ByFf7p4L.js","/assets/StaffListAtCheck-By6goW3h.js","/assets/StatusBadge-Dg3FYeiz.js","/assets/TargetGoal-ECdSzd21.js","/assets/Targets-JPsxUarh.js","/assets/Tasks-BG9dkM7r.js","/assets/TimeWheelPicker-D1kvylLd.js","/assets/Toast-CX01MnsT.js","/assets/Tooltip-7vrGay-d.js","/assets/TrendChart-DspZY803.js","/assets/TripleSpeedometer-EELb_Ki8.js","/assets/Trudoyomkost-CnRywDEZ.js","/assets/Turnover-BddbjOfh.js","/assets/UploadDropzone-BDAUn-IM.js","/assets/UsersActivity-5WX0Uk_L.js","/assets/VerdictBlock-DbCldOGM.js","/assets/VfxApiMap-BhAbFHxd.js","/assets/VfxDictionaries-6bqV1znJ.js","/assets/VfxEmployees-DUCbNFC4.js","/assets/VfxHrMoves-BHJgxpRD.js","/assets/VfxJobs-DVUi4DRQ.js","/assets/VfxPhoto-N5-r-zPW.js","/assets/VfxShifts-BpNgigs3.js","/assets/VfxState-DmRBpQBF.js","/assets/VfxTimebooks-BErE3CpZ.js","/assets/VfxTimesheet-VzBa6uq9.js","/assets/WatchProgress-CdjG_ury.js","/assets/WebLogin-Cnky7oYY.js","/assets/WorkerConcerns-Cjo5zTL_.js","/assets/Workers-DieVJCk1.js","/assets/Zagruzka-BJTX3wW-.js","/assets/ZagruzkaCell-BaCT37wm.js","/assets/api-CB4EDHvz.js","/assets/archive-Dg6fJK-O.js","/assets/archive-restore-BD6DcF_8.js","/assets/arrow-down-BnMmzTfb.js","/assets/arrow-down-wide-narrow-jvsJRxs0.js","/assets/arrow-up-narrow-wide-FbNmra-0.js","/assets/award-Dc1mlARU.js","/assets/ban-r0Q_d5IP.js","/assets/boxes-CwjVslIW.js","/assets/braces-CKeth4yb.js","/assets/brigadirFilters-CJVDPoo7.js","/assets/broadcastTree-CalrS5TJ.js","/assets/building-2-CQHv70tp.js","/assets/calculator-B1LCcYg-.js","/assets/calendar-BBYt-WMw.js","/assets/calendar-days-CHLpYbv5.js","/assets/camera-BkN7iABp.js","/assets/categories-lOxF9at6.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-wHq0yZpd.js","/assets/chart-line-DIP6t2EH.js","/assets/chart-pie-CenE-XjP.js","/assets/chartRange-C_fEhmaV.js","/assets/check-check-A_rhYofF.js","/assets/chevron-left-eNbzEgyQ.js","/assets/chevrons-up-down-Bhz1MSaw.js","/assets/circle-alert-4LXeGxKu.js","/assets/circle-check-big-DFq7LqO4.js","/assets/circle-dashed-shwChmHr.js","/assets/circle-minus-Bzkzgq7H.js","/assets/circle-question-mark-upJXAMiq.js","/assets/circle-slash-CLy09dq1.js","/assets/circle-user-round-DZhCLqu8.js","/assets/circle-zU3TBIEr.js","/assets/clock-3-BrE-Dhnx.js","/assets/cloud-off-COzhimWQ.js","/assets/cloud-upload-NL-M6QwO.js","/assets/compass-DTI8aexq.js","/assets/concernCategories-ouV04Yk1.js","/assets/copy-ClgLMhVC.js","/assets/corner-down-right-Bbp38oUw.js","/assets/createLucideIcon-BHoCkghJ.js","/assets/es-tjoDJ9Of.js","/assets/external-link-BHNSpQgk.js","/assets/file-clock-7PbGeuec.js","/assets/file-exclamation-point-d065kQw6.js","/assets/flag-BuYXIMdv.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DnamxasB.js","/assets/hash-DLlutJ9k.js","/assets/hourglass-Du9WV-Pb.js","/assets/image-DKlS2SIz.js","/assets/image-off-B8Tpbo1H.js","/assets/inbox-CN0Lg9F8.js","/assets/index-7f1rnqtY.css","/assets/index-Ce069zB-.js","/assets/keyboard-C9DN3R-g.js","/assets/languages-D-241C49.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-abYSrCFC.js","/assets/lightbulb-Doz55wMc.js","/assets/link-2-BgOrWDvp.js","/assets/link-2-off-B2k4MjoU.js","/assets/list-ordered-CSaDyu31.js","/assets/list-tree-C_HUtfcX.js","/assets/lock-open-CMEGq9Rr.js","/assets/log-in-CFzQFHPW.js","/assets/marks-C8yq3Nj2.js","/assets/minimize-2-7-_rTWzp.js","/assets/package-check-D8EsQ38L.js","/assets/pencil-C95lA8O5.js","/assets/percent-CZLWKgWY.js","/assets/pin-DJCb99ga.js","/assets/pin-off-BGD-IiV_.js","/assets/play-D1ni3iyE.js","/assets/plug-zap-ESn1-Gvv.js","/assets/prop-types-CJvbDJGv.js","/assets/radio-cIlKKVTp.js","/assets/react-apexcharts.esm-v7loyHFq.js","/assets/registers-CmjIWHz3.js","/assets/repeat-lmwsY-03.js","/assets/save-Dal89bza.js","/assets/scopeLinks-CAD0rDMS.js","/assets/scroll-text-DBqhz6MT.js","/assets/search-x-B9b2Ybid.js","/assets/segments-C9qziF-5.js","/assets/send-BYwOh_bc.js","/assets/settings-2-B2AJU84s.js","/assets/shield-DIsWOt_H.js","/assets/shield-alert-CPUxOw-u.js","/assets/shield-question-mark-B2N38WkL.js","/assets/siren-PA27iND-.js","/assets/snowflake-BHB3ayZq.js","/assets/split-D8k57EVI.js","/assets/square-check-big-DQkmY8oX.js","/assets/star-DCVYc98p.js","/assets/statusBands-BPsZ8X6D.js","/assets/store-T6wkiOHM.js","/assets/table-2-BEQwBeL3.js","/assets/table-properties-DWb2-9T-.js","/assets/tag-C4dBeUa-.js","/assets/timer-off-oFo-wMXD.js","/assets/trending-down-CslaZo9s.js","/assets/trending-up-D8KCujy_.js","/assets/undo-2-BXN7e4ut.js","/assets/useChartTheme-XBc1MEt-.js","/assets/useElementWidth-EvnHMzqU.js","/assets/useIsMobile-D7AfLbXy.js","/assets/useOpenParam-jHpYf5tR.js","/assets/useStatusBands-Bv90vRRk.js","/assets/useUrlScope-M-aZ2NUu.js","/assets/user-CqzvqCMT.js","/assets/user-cog-BFZsrGPG.js","/assets/users-BZg7Gn-J.js","/assets/vfx-D950qBPd.js","/assets/video-Cpv2OGaa.js","/assets/wallet-BVNvtmTR.js","/assets/warehouse-Bh8k9AI0.js","/assets/workflow-Bag5LrOd.js","/assets/x-Bbndgiwc.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png"];
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
