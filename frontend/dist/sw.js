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

const BUILD = "2026-10-02T10:54:33.664Z";
const PRECACHE = ["/","/assets/AdminPanel-Ct8sX38K.js","/assets/AnalysisBoard-Dkh5w1ie.js","/assets/Arc-gS997raV.js","/assets/ArcLegacy-BKhgWVOi.js","/assets/BrigadirProfile-FmUzVvA4.js","/assets/BroadcastReceivers-Cz6RN7vV.js","/assets/BroadcastRecord-DNvQ6Qoa.js","/assets/CatLockNotice-B7UEOrUt.js","/assets/CategoryLegendModal-6e-CDX3f.js","/assets/CellConcerns-Cea3vI6E.js","/assets/CellDetails-CK16bJhm.js","/assets/CellFormModal-BAleKTu7.js","/assets/CellIdent-oU6UI1zG.js","/assets/CellLink-Bj3_apVv.js","/assets/Cells-Du7urvW7.js","/assets/ColumnFilter-WNMUP30X.js","/assets/ColumnsPicker-Cn6fRzDI.js","/assets/CommentsModal-Cm3OVNhc.js","/assets/ComparisonTable-D2nr0PNq.js","/assets/Concerns-qzL8yw8n.js","/assets/ConfirmDialog-BEtbMM6L.js","/assets/Daily-CABwL4xv.js","/assets/DataTable-D4YtAvn1.js","/assets/DateRangePicker-_uUQL_bW.js","/assets/DayReportView-DjRuhFkY.js","/assets/DayStepper-CgKS1joh.js","/assets/DifferenceBreakdown-DX4OcM6H.js","/assets/Downtime-DmSQJKfo.js","/assets/Education-CATHqOI4.js","/assets/EducationLesson-CsQ9B0tY.js","/assets/EmptyState-3CQLSyXi.js","/assets/Exam-D99G0a8l.js","/assets/FactorySelect-BI8tn-1X.js","/assets/Gamification-DpdZelyV.js","/assets/GroupBadge-U5vu-1gJ.js","/assets/HeatmapChart-bRqjGuIM.js","/assets/IdleCell-CrDV2TVP.js","/assets/KPICard-BsrmfnGV.js","/assets/Kaizen-CY2NxmQU.js","/assets/Kelish-CHZOo3CN.js","/assets/KpiDeltaCard-B6MKr6a9.js","/assets/LangTextInput-DcVlCTWg.js","/assets/Layout-Byx6vMzN.js","/assets/LeaderAppeal-BguFPlj8.js","/assets/LeaderDayReport-BMY6K21_.js","/assets/LeaderUnitReport-9c7F284Y.js","/assets/Leaderboard-Cgloo7kN.js","/assets/Leaders-jiqiXDk2.js","/assets/Lightbox-DzHQzHsD.js","/assets/LiveOverview-DevAZMP3.js","/assets/Login-fMi_CAvT.js","/assets/NotFound-DAIc7GW6.js","/assets/Notifications-CUfg0cDv.js","/assets/Overview-d9Ze16Cq.js","/assets/Pagination-DyScQV_r.js","/assets/PerenaladkaFactTable-DXjTBMEm.js","/assets/PlanFulfillment-DdzSOarV.js","/assets/Production-D9F5qSVQ.js","/assets/Profile-Bb4R590G.js","/assets/ProofCamera-CrXbexSG.js","/assets/ProofPhoto-0q1sr3gB.js","/assets/Quality-CJ3eOIE8.js","/assets/RequestStateChip-CdEakgwD.js","/assets/RichTextEditor-9AFDtsle.js","/assets/SaveState-tm8IfdyE.js","/assets/SearchInput-CHsNYG5K.js","/assets/SeasonalityHeatmap-C3XqKphd.js","/assets/SegmentedToggle-B_xrI09T.js","/assets/SetupTimes-BrQCA7ZC.js","/assets/ShiftDaily-DXR9omKV.js","/assets/Staff-CdCO_e6Y.js","/assets/StaffLive-Dv10Wn8P.js","/assets/StatusBadge-B_qacdnW.js","/assets/TargetGoal-B6hPAc6E.js","/assets/Targets-gsvphgaN.js","/assets/Tasks-Cf1es8cC.js","/assets/TimeWheelPicker-t38b1ONg.js","/assets/Toast-CkQAl7ZX.js","/assets/Tooltip-DVkCFwUG.js","/assets/TrendChart-CybJ1_PG.js","/assets/TripleSpeedometer-DTBydDeI.js","/assets/Trudoyomkost-DykDcYV5.js","/assets/UploadDropzone-CyLDgnm4.js","/assets/UsersActivity-z2ppb2T0.js","/assets/VerdictBlock-DNLEteNm.js","/assets/WatchProgress-BlVtw5Bg.js","/assets/WebLogin-DOhheFER.js","/assets/WorkerConcerns-Cojeix_p.js","/assets/Workers-eKD2xdhd.js","/assets/Zagruzka-Cxa9CFEn.js","/assets/ZagruzkaCell-JJdH4Qdm.js","/assets/api-CjVH42RW.js","/assets/archive-BeT6WRqh.js","/assets/archive-restore-C8bkFI0Y.js","/assets/arrow-down-DtstVRJE.js","/assets/arrow-left-UfpyG2Gq.js","/assets/arrow-right-left-BQVyI_0w.js","/assets/arrow-up-CpnoIjmt.js","/assets/arrow-up-narrow-wide-BUVj7Hnu.js","/assets/arrow-up-right-Qp59nbwu.js","/assets/award-BX-Tr7Gl.js","/assets/ban-CRvYcToe.js","/assets/bot-DtAA_Qv3.js","/assets/boxes-CK-wqv8B.js","/assets/brigadirFilters-B3vUbanM.js","/assets/broadcastTree-DA8RKA5C.js","/assets/building-2-BGfoF_xG.js","/assets/calendar-days-CjchtdCV.js","/assets/calendar-r4Kqiv5e.js","/assets/calendar-range-Cgq-WHsg.js","/assets/camera-Cm4TuRKU.js","/assets/categories-c43cM578.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-5lhsk5ib.js","/assets/chart-line-Bl3znvYH.js","/assets/chart-pie-CwCax4Bm.js","/assets/chartRange-CJJxqooV.js","/assets/chevron-left-xe4vAUBA.js","/assets/chevrons-up-down-D2Jy5LoL.js","/assets/circle-C_6XuXwD.js","/assets/circle-alert-D3kEixTl.js","/assets/circle-check-big-Cpz0N88k.js","/assets/circle-minus-Ddoqyx2n.js","/assets/circle-question-mark-ByIOmDbk.js","/assets/circle-slash-BsTAyrG4.js","/assets/circle-user-round-CNDyO73g.js","/assets/cloud-off-CNq1iw58.js","/assets/cloud-upload-Dxqq4VwS.js","/assets/compass-CaqwhOYO.js","/assets/concernCategories-Ddvr4TNt.js","/assets/copy-CMXPquF4.js","/assets/corner-down-right-JdCAMKyV.js","/assets/createLucideIcon-D7uqwKwz.js","/assets/es-D_zPeFlZ.js","/assets/exportXlsx-DjLLUODy.js","/assets/external-link-aRUA5ZAR.js","/assets/file-clock-Bd69lyES.js","/assets/file-exclamation-point-C6_lQCcd.js","/assets/file-spreadsheet-DHzHpMQo.js","/assets/file-text-6ZbN70hN.js","/assets/flag-CmlBRwoI.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-mjASsZ0C.js","/assets/hash-BOMoWgRo.js","/assets/history-CeSlsAOB.js","/assets/hourglass-mY9aXSOK.js","/assets/id-card-Cio4Nt6c.js","/assets/image-HtrwJomd.js","/assets/image-off-iCVrwEk_.js","/assets/inbox-DB7-dv1k.js","/assets/index-Bdhd6XHk.js","/assets/index-bv1wZ_fI.css","/assets/key-round-gWpxPsbT.js","/assets/keyboard-zDgWPSCI.js","/assets/languages-CzwjBRS1.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DqiCSjS0.js","/assets/lightbulb-DEaP6sfL.js","/assets/link-2-DPilFaUN.js","/assets/link-2-off-BkFIawjT.js","/assets/list-ordered-BzlY_m6i.js","/assets/list-tree-CHeh8sOn.js","/assets/lock-open-DucMaqpl.js","/assets/log-in-CKEfz78X.js","/assets/maximize-2-Jxq8QIms.js","/assets/message-square-CnPyA3dB.js","/assets/minimize-2-DxfF0Q2C.js","/assets/package-check-BRNvObPD.js","/assets/paperclip-C6u47AyW.js","/assets/pencil-Bgq0kyyL.js","/assets/percent-CQrYpfK4.js","/assets/pin-Bwi4Hyng.js","/assets/pin-off-B-95MiKO.js","/assets/play-DYhELh7n.js","/assets/plug-zap-CvKgJAZ1.js","/assets/presentation-Bopf1Jjq.js","/assets/prop-types-CuOb8u_v.js","/assets/radio-BjLvAakc.js","/assets/react-apexcharts.esm-C3rE5Sus.js","/assets/repeat-CzXkbabf.js","/assets/rotate-ccw-B1fpHFC6.js","/assets/rotate-cw-DU6RkVwS.js","/assets/save-DKC6fgB7.js","/assets/scopeLinks-Dd1PY6Qy.js","/assets/scroll-text-DDLK4iuz.js","/assets/search-x-9jCmSwrz.js","/assets/segments-kpIABSOb.js","/assets/send-C_ZgOtzo.js","/assets/settings-2-ZHYsY8bZ.js","/assets/shield-DsFHgLdw.js","/assets/shield-alert-DKTDmmCg.js","/assets/shield-check-CmniF0Pp.js","/assets/shield-question-mark-DFEn0vUt.js","/assets/siren-D0HVtZZb.js","/assets/snowflake-Bx0nhywY.js","/assets/split-DX7aXINJ.js","/assets/square-check-big-CzSC45Hs.js","/assets/square-snWSnbM4.js","/assets/star-ChpTVw23.js","/assets/statusBands-CUJnI9tb.js","/assets/store-BSHryX2d.js","/assets/table-2-Dh10Zr18.js","/assets/table-properties-DV_fLbwo.js","/assets/tag-D82-JrGl.js","/assets/timer-off-G_dvc1yw.js","/assets/trending-down-BhdoPSFs.js","/assets/trending-up-cjsZl7H9.js","/assets/undo-2-BUIyly8o.js","/assets/useChartTheme-BC3HTMNy.js","/assets/useElementWidth-CcgDBscE.js","/assets/useIsMobile-esxdTsrZ.js","/assets/useOpenParam-D77sP5zI.js","/assets/useStatusBands-aJWDlMdQ.js","/assets/useUrlScope-B9ghJcJU.js","/assets/user-BFOply82.js","/assets/user-cog-BZsJRzUv.js","/assets/user-minus-BfYyjhFd.js","/assets/users-Do3U2MBX.js","/assets/video-BceK12ko.js","/assets/wallet-BAOwCmV3.js","/assets/warehouse-CPuApuuT.js","/assets/x-CwULEdMb.js","/assets/zap-HhJxjlnj.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
