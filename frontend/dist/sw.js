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

const BUILD = "2026-10-19T13:20:44.872Z";
const PRECACHE = ["/","/assets/AdminPanel-Dxql7z6P.js","/assets/AnalysisBoard-C-A5JSzo.js","/assets/Arc-CvDT7vS7.js","/assets/Assistant-DmDv0Rvx.js","/assets/BrigadirProfile-CDcKU8D1.js","/assets/BroadcastReceivers-8JXak-Zj.js","/assets/BroadcastRecord-x1RgB4EV.js","/assets/Button-CdcofDg5.js","/assets/CatLockNotice-DK7x4eI3.js","/assets/CategoryLegendModal-C-yiZ6c0.js","/assets/CellConcerns-DcIor1g2.js","/assets/CellDetails-B4owQQdc.js","/assets/CellFormModal-BTSmCFBz.js","/assets/CellIdent-dPXbVb29.js","/assets/CellLink-BBYBclDP.js","/assets/Cells-B-XQ1FM3.js","/assets/ColumnFilter-D8rexLHo.js","/assets/ColumnsPicker-DRzqOSou.js","/assets/CommentsModal-Ds5xFqEW.js","/assets/ComparisonTable-CLpCzw44.js","/assets/Concerns-De7FeuCB.js","/assets/CountStepper-g7mlLp8p.js","/assets/Daily-D9BCsvC8.js","/assets/DataTable-cD0iAP3T.js","/assets/DateRangePicker-CSmTmoMH.js","/assets/DayReportView-yCAuiOPu.js","/assets/DayStepper-CBcr831A.js","/assets/DifferenceBreakdown-BtBrjJOQ.js","/assets/Downtime-D9hGm-Du.js","/assets/Education-rru_SQkW.js","/assets/EducationLesson-BVsaUF6G.js","/assets/EmptyState-DA1l2RKW.js","/assets/Exam-BbJjVl-D.js","/assets/FactorySelect-D9UAyJaY.js","/assets/Gamification-CuhmbDUS.js","/assets/GroupBadge-S_G9Xu_N.js","/assets/HeatmapChart-CAZjjMIS.js","/assets/IdleCell-mCoe7Cb3.js","/assets/KPICard-T4L7wTdC.js","/assets/Kaizen-ltJJ3X6X.js","/assets/Kelish-BqLqw4qO.js","/assets/KpiDeltaCard-D88B2hN8.js","/assets/LangTextInput-BxHSp0F1.js","/assets/Layout-BUONNdzV.js","/assets/LeaderAppeal-B5S4ZBvU.js","/assets/LeaderDayReport-Diq0aSsf.js","/assets/LeaderUnitReport-DL_YBXKj.js","/assets/Leaderboard-CWu0IbAo.js","/assets/Leaders-CfYbR6uc.js","/assets/LeadersKpi-6KW5PkSu.js","/assets/Lightbox-DVypVzIu.js","/assets/LiveOverview-C-fqJEQZ.js","/assets/Login-Ciy8CdsR.js","/assets/NotFound-CmQl4Ipg.js","/assets/Notifications-Cus4PGME.js","/assets/Overview-HJAVvNhO.js","/assets/Pagination-dwe9Wtr-.js","/assets/PerenaladkaFactTable-BEvXcsc8.js","/assets/PersonCard-BDT0iy4Z.js","/assets/PlanFulfillment-CNFQKYJc.js","/assets/Production-CkC75s9P.js","/assets/Profile-railAADP.js","/assets/ProofCamera-Cdrgmrp0.js","/assets/ProofPhoto-PAQVqW6n.js","/assets/Quality-DrEpFZ7i.js","/assets/RawRows-BDdi-kJP.js","/assets/RequestStateChip-CXAteicM.js","/assets/RichTextEditor-C6NQIVNy.js","/assets/SaveState-DO2jQP9b.js","/assets/SearchInput-DvuvnoCZ.js","/assets/SeasonalityHeatmap-D9-9WL3Y.js","/assets/SegmentedToggle-BFTnvdLZ.js","/assets/SetupTimes-D12Mz7Gt.js","/assets/ShiftDaily-BqR-aoLH.js","/assets/Staff-pOpo8X68.js","/assets/StaffListAtCheck-BIVL4Sf5.js","/assets/StatusBadge-VZJEK9D_.js","/assets/TargetGoal-37uVBcLa.js","/assets/Targets-C-gOu4Bd.js","/assets/Tasks-CuDVoWNk.js","/assets/TimeWheelPicker-BB6WpjYE.js","/assets/Toast-R1QLg9oL.js","/assets/Tooltip-BoE2OmUC.js","/assets/TrendChart-CPIfMJfY.js","/assets/TripleSpeedometer-DGC_wIlb.js","/assets/Trudoyomkost-N0Os4LTZ.js","/assets/UploadDropzone-BG2bQ2kw.js","/assets/UsersActivity-CElgK-as.js","/assets/VerdictBlock-CaWOo8h-.js","/assets/VfxApiMap-R087_4_W.js","/assets/VfxDictionaries-o8u9FF9i.js","/assets/VfxEmployees-rg3Dng0u.js","/assets/VfxHrMoves-CubLftqp.js","/assets/VfxJobs-DH3oiQAG.js","/assets/VfxPhoto-C7D2aWCb.js","/assets/VfxShifts-CHkx3aaj.js","/assets/VfxState-BM8fszBT.js","/assets/VfxTimebooks-7K_VfM7V.js","/assets/VfxTimesheet-BmyAK_Es.js","/assets/WatchProgress-Buq6LFUh.js","/assets/WebLogin-R2UhtW-d.js","/assets/Workers-CYohaYmS.js","/assets/Zagruzka-A-A0dGPD.js","/assets/ZagruzkaCell-DYX5EQQg.js","/assets/api-CRcy-16S.js","/assets/archive-CEF9SJT7.js","/assets/archive-restore-DqeflxCK.js","/assets/arrow-down-B14lIJDI.js","/assets/arrow-down-right-nQmH9gy2.js","/assets/arrow-down-wide-narrow-C0zrjdI2.js","/assets/arrow-up-narrow-wide-DucI3RBm.js","/assets/ban-DmUj93e7.js","/assets/boxes-DEfTYhyy.js","/assets/braces-DSSK9VZY.js","/assets/brigadirFilters-CxpWfOs0.js","/assets/broadcastTree-DJAAk4-c.js","/assets/building-2-CTvKbh6q.js","/assets/calculator-LDN6KmhA.js","/assets/calendar-DwDuE8U5.js","/assets/calendar-days-Bdy3UVTJ.js","/assets/camera-BHAhBmu4.js","/assets/categories-DqjeLriU.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Dj3k1tCJ.js","/assets/chart-line-COj5zd7J.js","/assets/chart-pie-DRXRXq3X.js","/assets/chartRange-Dx3_ujpG.js","/assets/check-check-ZboaXclH.js","/assets/chevron-left-Bx2Ad0Ex.js","/assets/chevrons-up-down-kd2E6sfp.js","/assets/circle-CDgQAHCw.js","/assets/circle-alert-BXuPPdSP.js","/assets/circle-check-big-DuFAwVdB.js","/assets/circle-dashed-DzXrU2P9.js","/assets/circle-minus-IJbK_sHq.js","/assets/circle-question-mark-DzWWTYGe.js","/assets/circle-slash-aqNcb86T.js","/assets/circle-user-round-BlhrZho7.js","/assets/cloud-off-BYFaXVdZ.js","/assets/cloud-upload-CHJwfnxL.js","/assets/compass-BPKd3mex.js","/assets/concernCategories-BBaEZZhB.js","/assets/corner-down-right-Ci_2PMak.js","/assets/createLucideIcon-C3SbvvRz.js","/assets/es-DLY8Y_Y7.js","/assets/external-link-BLze2O_Z.js","/assets/file-clock-BMguqQa0.js","/assets/file-exclamation-point-DzzbIzsW.js","/assets/flag-CVXiGIv9.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BHEGY85M.js","/assets/funnel-C1r6KfdI.js","/assets/hash-CpGok-Sc.js","/assets/hourglass-BvbL7SC-.js","/assets/image-CtnP5E7h.js","/assets/image-off-BKuceS3t.js","/assets/inbox-B0QJS13s.js","/assets/index-B-bGhMav.css","/assets/index-Bb_wSmwT.js","/assets/keyboard-TpaJZlXS.js","/assets/languages-Da-cIuX-.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CcBr9b67.js","/assets/lightbulb-Cm89WC8g.js","/assets/link-2-CkvOxSzo.js","/assets/link-2-off-CW9_ceEZ.js","/assets/list-ordered-BjKB0nv4.js","/assets/list-tree-BoEQ9Kbf.js","/assets/lock-open-DmeYpBnt.js","/assets/log-in-B-SdLkqB.js","/assets/marks-1a00nn91.js","/assets/minimize-2-9oj0hVSq.js","/assets/package-check-DLd9K_ok.js","/assets/pencil-C-Mh9HLq.js","/assets/percent-Du7lEfez.js","/assets/pin-iy3CBo0w.js","/assets/pin-off-C_S6m4a0.js","/assets/play-28ktyRU_.js","/assets/plug-zap-DURyGkP8.js","/assets/prop-types-CPc9wV4g.js","/assets/radio-REdHw1U2.js","/assets/react-apexcharts.esm-DtcaQo47.js","/assets/registers-dpW2LOBZ.js","/assets/repeat-DTsWueMZ.js","/assets/save-Ddp7PVoF.js","/assets/scopeLinks-w_H4aFIK.js","/assets/scroll-text-DBp_PA86.js","/assets/search-x-QYDdDtzq.js","/assets/segments-BQVPD3Gf.js","/assets/send-CjFzrBuE.js","/assets/settings-2-fYSPescq.js","/assets/shield-BG82HeHC.js","/assets/shield-alert-C5S7G3BN.js","/assets/shield-question-mark-B0IfxPUi.js","/assets/siren-DG5iNfRF.js","/assets/snowflake-EMpFkh9v.js","/assets/split-Dz6-3Oc0.js","/assets/square-check-big-DaFcR8al.js","/assets/star-cZb1xZvl.js","/assets/statusBands-Bv38YGwE.js","/assets/store-B_s8X6pN.js","/assets/table-2-D9aRH7GJ.js","/assets/table-properties-CqtGd4vI.js","/assets/tag-BXHDUhZV.js","/assets/timer-off-Xf552ACk.js","/assets/trending-down-1X0kol8c.js","/assets/trending-up-WWaZ9KRv.js","/assets/undo-2-R6wkwhi8.js","/assets/useChartTheme-Cxx0ONzN.js","/assets/useElementWidth-DI_PKsI5.js","/assets/useIsMobile-c-k1Vucy.js","/assets/useOpenParam-DU-P9tRV.js","/assets/useStatusBands-fs6DXnjV.js","/assets/useUrlScope-h8-k8hDV.js","/assets/user-cog-Z8jEzG4h.js","/assets/user-lofE0B8U.js","/assets/user-minus-a4zWHGWy.js","/assets/users-CtigRo0l.js","/assets/vfx-D-_EORhB.js","/assets/video-DwBwG6gJ.js","/assets/wallet-Drs96XWP.js","/assets/warehouse-Cnduffd8.js","/assets/workflow-H02wUllc.js","/assets/x-TtloaU9V.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
