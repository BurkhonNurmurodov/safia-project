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

const BUILD = "2026-09-26T10:38:00.932Z";
const PRECACHE = ["/","/assets/AdminPanel-DNtF3N5K.js","/assets/AnalysisBoard-C0lDejd1.js","/assets/Arc-p82Gh6UU.js","/assets/ArcLegacy-Cu42o5Dl.js","/assets/AttendanceModal-BAIkUJ-l.js","/assets/BrigadirProfile-1RB1Vk-P.js","/assets/BroadcastReceivers-D9CQOSS-.js","/assets/BroadcastRecord-BolpM1JP.js","/assets/CatLockNotice-xsFd9LT6.js","/assets/CategoryLegendModal-CgfK9CJ9.js","/assets/CellConcerns-D9Bnlwi-.js","/assets/CellDetails-BmKQ0Cp_.js","/assets/CellFormModal-C21pKoOm.js","/assets/CellLink-BsSLKmcG.js","/assets/Cells-D2LxjmgG.js","/assets/ColumnFilter--golqx-0.js","/assets/ColumnsPicker-B6L2bqns.js","/assets/CommentsModal-Dn5S7D9Z.js","/assets/ComparisonTable--CVjbZmU.js","/assets/Concerns-BHt1Wa-N.js","/assets/ConfirmDialog-Bgn_Sbbp.js","/assets/Daily-CqsuUQCB.js","/assets/DataTable-DaCIzfTA.js","/assets/DateRangePicker-C65qpyK2.js","/assets/DayReportView-wdRnArFF.js","/assets/DayStepper-BXZRmY2U.js","/assets/DifferenceBreakdown-Dr0clB0E.js","/assets/Downtime-DdYpI4XO.js","/assets/Education-CgXkaBfr.js","/assets/EducationLesson-DyZSXUiF.js","/assets/EmptyState-DR5wGRU7.js","/assets/Exam-BFn3bB2Z.js","/assets/FactorySelect-BY5tU-GM.js","/assets/Gamification-CF1N-Sk-.js","/assets/GroupBadge-BACBKLPj.js","/assets/HeatmapChart-DXa4hps_.js","/assets/IdleCell-BDFVCq1n.js","/assets/KPICard-BQIPOYyb.js","/assets/Kaizen-BWLl4QT4.js","/assets/KpiDeltaCard-BYyZ5Xrn.js","/assets/LangTextInput-BSHZpS94.js","/assets/Layout-CjCfoRbx.js","/assets/LeaderAppeal-CAi8GNBF.js","/assets/LeaderDayReport-DShj2oeR.js","/assets/LeaderUnitReport-BJTZO7t4.js","/assets/Leaderboard-BVrPNmDV.js","/assets/Leaders-Aye3Rgr1.js","/assets/Lightbox-BpY5G_mk.js","/assets/LiveOverview-DSeOEbEy.js","/assets/Login-KqzgiS9D.js","/assets/NotFound-C3y6-xaU.js","/assets/Overview-DA-TQ0Sq.js","/assets/Pagination-BFW-ZlaP.js","/assets/PerenaladkaFactTable-DIg_hmiT.js","/assets/PlanFulfillment-BI6M2abY.js","/assets/Production-DJZcR8Qh.js","/assets/Profile-BUNICZsv.js","/assets/ProofCamera-C5F1Ff1S.js","/assets/ProofPhoto-B8k9Nhfc.js","/assets/Quality-CkatJz5T.js","/assets/RequestStateChip-d0mANKll.js","/assets/RichTextEditor-r0-oFiSs.js","/assets/SaveState-g-t2gzoJ.js","/assets/SearchInput-D42ppJaV.js","/assets/SeasonalityHeatmap-BKvpPzMm.js","/assets/SegmentedToggle-DCekZ5vD.js","/assets/SetupTimes-ZhRCidrH.js","/assets/ShiftDaily-D2jdHxqN.js","/assets/Staff-CPzUXxtx.js","/assets/StatusBadge-bnWAR4A4.js","/assets/TargetGoal-CKz0XSsH.js","/assets/Targets-rgytbOHb.js","/assets/Tasks-BpGlKwbg.js","/assets/TimeWheelPicker-BZiYjHDA.js","/assets/Tooltip-C3gs0crH.js","/assets/TrendChart-ByNuMuk3.js","/assets/TripleSpeedometer-epSQ9-BU.js","/assets/Trudoyomkost-DKSeTIOR.js","/assets/UsersActivity-BmWQrJut.js","/assets/WatchProgress-OgC7xrmO.js","/assets/WebLogin-QtDuTfWh.js","/assets/WorkerConcerns-DJBtCQOB.js","/assets/Workers-oDn48Oyd.js","/assets/Zagruzka-DaRfkrb2.js","/assets/ZagruzkaCell-D4zCbG-y.js","/assets/alarm-clock-Dteb56AX.js","/assets/api-B2oubl0A.js","/assets/archive-BaUfLnWe.js","/assets/archive-restore-xAez6_TC.js","/assets/arrow-down-_rCYqjsE.js","/assets/arrow-left-G7dbRQ_5.js","/assets/arrow-left-right-dAV3iu6I.js","/assets/arrow-up-CQIa_HsD.js","/assets/award-DH07csge.js","/assets/ban-DbpmCzTv.js","/assets/bot-CPmu5yzL.js","/assets/boxes-CTdezCtW.js","/assets/brigadirFilters-D4QQdD4z.js","/assets/broadcastTree-NPk9o1iw.js","/assets/building-2-DUHh8qV9.js","/assets/calendar-BgOA9Z4w.js","/assets/calendar-clock-T9einZeK.js","/assets/calendar-days-CSX7NUPR.js","/assets/calendar-range-BuRD9aIa.js","/assets/camera-DwQNEYec.js","/assets/categories-Dz5tH_ff.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cxn8SKvD.js","/assets/chart-line-chVpb-cS.js","/assets/chart-pie-Foru5ZBL.js","/assets/chartRange-B2oThjnQ.js","/assets/check-check-C4L24s7O.js","/assets/chevron-left-FI3wns-O.js","/assets/chevrons-up-down-BwTA2dFU.js","/assets/circle-check-big-DHxOighI.js","/assets/circle-dot-BTmXkZSj.js","/assets/circle-minus-CgZTxKJc.js","/assets/circle-slash-CD54Ey48.js","/assets/circle-user-round-DzAmJzX4.js","/assets/cloud-off-VD0yXlw9.js","/assets/cloud-upload-CYKf5twJ.js","/assets/compass-CsIwm4nf.js","/assets/concernCategories-C9s3lPz3.js","/assets/copy-0si1hwVj.js","/assets/corner-down-right-CvSjRcf3.js","/assets/createLucideIcon-BCYI7gP_.js","/assets/es-CCyZzsPk.js","/assets/exportXlsx-BDWYiaBW.js","/assets/external-link-DEpSELDk.js","/assets/file-clock-DOcCXFYr.js","/assets/file-exclamation-point-B1ImJoCB.js","/assets/file-spreadsheet-drqRpdLe.js","/assets/file-text-Crtgt7E-.js","/assets/flag-Jn4ClnEj.js","/assets/flame-J-Bv88g5.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CXiXg3PI.js","/assets/hash-a-p4fGcQ.js","/assets/history-z3iQWeYF.js","/assets/hourglass-CdHvYlc-.js","/assets/image-Bkzq-gH7.js","/assets/image-off-Dnl-1IPv.js","/assets/index-BWNfGYRT.js","/assets/index-Cd9ftT-I.css","/assets/key-round-oHNorNI1.js","/assets/keyboard-CzC-mQ8L.js","/assets/languages-XpozLu8x.js","/assets/layers-hRlIEN9Z.js","/assets/leaderReason-DZqFldFW.js","/assets/lightbulb-CCE777rl.js","/assets/link-2-B6O2VX1r.js","/assets/list-checks-CfSluncM.js","/assets/list-ordered-Cy-Ex158.js","/assets/list-tree-DT4j7bIZ.js","/assets/lock-open-B2MWtfn0.js","/assets/log-in-CDUAgNhy.js","/assets/message-square-BTGcBJ_l.js","/assets/minimize-2-C9Afq-uX.js","/assets/package-check-BpmIzbep.js","/assets/paperclip-ep33c_Cs.js","/assets/pencil-uiFoyPnL.js","/assets/personName-B4KId4zS.js","/assets/pin-B4qKiNnw.js","/assets/play-D1nC8iyQ.js","/assets/presentation-DDmHLvX5.js","/assets/prop-types-B33KbGVD.js","/assets/radio-D0pkH8M-.js","/assets/react-apexcharts.esm-CkpdZVzg.js","/assets/repeat-D_tnwAFn.js","/assets/rotate-ccw-ObxgB_DU.js","/assets/rotate-cw-CtAtwJvQ.js","/assets/save-DQ-_E8CR.js","/assets/scale-aiN4zZMD.js","/assets/scroll-text-ClII4y06.js","/assets/search-x-MJt9KVgg.js","/assets/segments-LDYMVz8N.js","/assets/send-Bwbfuwjg.js","/assets/settings-2-DiXV__CS.js","/assets/shield-Bu8Uf2nk.js","/assets/shield-alert-WIfuXMxD.js","/assets/shield-check-CD9aXbSc.js","/assets/shield-question-mark-D1CqSUwO.js","/assets/siren-D48GIRXa.js","/assets/smartphone-C7pIGA9B.js","/assets/snowflake-DjbKH64D.js","/assets/square-B-SyYbtp.js","/assets/square-check-big-qMXebw3o.js","/assets/star-BRGOojiu.js","/assets/statusBands-lApiTSiB.js","/assets/store-BBCObot5.js","/assets/table-2-BulJvj56.js","/assets/tag-IJ7Irl2w.js","/assets/trending-down-CbAE1W1Z.js","/assets/trending-up-WC9HNx6k.js","/assets/triangle-alert-BD5osga4.js","/assets/undo-2-ncSJogSt.js","/assets/useChartTheme-cAlF_loK.js","/assets/useElementWidth-CyCQYyTY.js","/assets/useIsMobile-CgtL8B3J.js","/assets/useMutation-7eeQ-jK0.js","/assets/useStatusBands-mLODpnpd.js","/assets/user-C72AecTk.js","/assets/user-check-BK3FmxPw.js","/assets/user-cog-97Yj_AzS.js","/assets/user-minus-BXAltUrX.js","/assets/users-DxUT-7hb.js","/assets/verifyState-VSbAEBvn.js","/assets/video-C_LqsHpA.js","/assets/wallet-D2qo7m5f.js","/assets/warehouse-C9Qmcqca.js","/assets/zap-BSZhMaju.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
