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

const BUILD = "2026-09-26T11:22:45.210Z";
const PRECACHE = ["/","/assets/AdminPanel-DfflMk_9.js","/assets/AnalysisBoard-CNTKvjUQ.js","/assets/Arc-BBpeVSSh.js","/assets/ArcLegacy-BsO5YwHq.js","/assets/AttendanceModal-Dnu_wKF4.js","/assets/BrigadirProfile-BoXIxZjX.js","/assets/BroadcastReceivers-DV8EZOEu.js","/assets/BroadcastRecord-BosY8L-P.js","/assets/CatLockNotice-BZOi6fI0.js","/assets/CategoryLegendModal-DsHuRcML.js","/assets/CellConcerns-CgscBzjV.js","/assets/CellDetails-DFdSySPr.js","/assets/CellFormModal-BFKLpWn9.js","/assets/CellLink-CyZ1IQ4P.js","/assets/Cells-BmwG-2Xa.js","/assets/ColumnFilter-D5b7ckG-.js","/assets/ColumnsPicker-DJq2Si0Q.js","/assets/CommentsModal-Cd-EGqvD.js","/assets/ComparisonTable-Ch9wiqm-.js","/assets/Concerns-CPdvFczq.js","/assets/ConfirmDialog-BEq7qz4W.js","/assets/Daily-CnSI0Xtx.js","/assets/DataTable-B5zZJaja.js","/assets/DateRangePicker-4TfbgDo2.js","/assets/DayReportView-BSQNRzZ9.js","/assets/DayStepper-BI7eFh2k.js","/assets/DifferenceBreakdown-Dx1wix3_.js","/assets/Downtime-DM-QSTu_.js","/assets/Education-H2EBoMw7.js","/assets/EducationLesson-DRWmqSsb.js","/assets/EmptyState-dxb54Aza.js","/assets/Exam-C5EIpVik.js","/assets/FactorySelect-jWA50wst.js","/assets/Gamification-DGBp77A7.js","/assets/GroupBadge-DRTxRyhS.js","/assets/HeatmapChart-8h7xLvfR.js","/assets/IdleCell-DQPlySAF.js","/assets/KPICard-rmMZawR4.js","/assets/Kaizen-D1upunUc.js","/assets/KpiDeltaCard-WD2H6x0j.js","/assets/LangTextInput-C5tEeOcZ.js","/assets/Layout-DoCqn9S7.js","/assets/LeaderAppeal-DM7Ya8iI.js","/assets/LeaderDayReport-BLm-6_Oo.js","/assets/LeaderUnitReport-CW6Itsbi.js","/assets/Leaderboard-ClT6dRVF.js","/assets/Leaders-DSolxl0G.js","/assets/Lightbox-C-gHhCr8.js","/assets/LiveOverview-D9Zzv3dG.js","/assets/Login-6uIYQ4Vl.js","/assets/NotFound-DKF0ifLw.js","/assets/Overview-86ahBudD.js","/assets/Pagination-DQNNkGzD.js","/assets/PerenaladkaFactTable-CA-9DSBY.js","/assets/PlanFulfillment-DqSljr1h.js","/assets/Production-B-HszJwr.js","/assets/Profile-tvRfM4Os.js","/assets/ProofCamera-BOAW6vXv.js","/assets/ProofPhoto-C80RyhuA.js","/assets/Quality-ibatuZO5.js","/assets/RequestStateChip-CYrYoU5J.js","/assets/RichTextEditor-DwGSPDtQ.js","/assets/SaveState-DdfDUC7X.js","/assets/SearchInput-D6ywoTNe.js","/assets/SeasonalityHeatmap-DPCuPKge.js","/assets/SegmentedToggle-C2vKp6dN.js","/assets/SetupTimes-B_nW2m_u.js","/assets/ShiftDaily-DEZve93Y.js","/assets/Staff-CJ5vu1EM.js","/assets/StatusBadge-DMlqT321.js","/assets/TargetGoal-iEfKahFb.js","/assets/Targets-0s8_bAd4.js","/assets/Tasks-CSubfmgo.js","/assets/TimeWheelPicker-Do5kZOPM.js","/assets/Tooltip-Bk3bKmmt.js","/assets/TrendChart-DSPc1Q-a.js","/assets/TripleSpeedometer-jQnghuC6.js","/assets/Trudoyomkost-BuKBP9cH.js","/assets/UsersActivity-BFygQdzZ.js","/assets/WatchProgress-6DWpV8Mr.js","/assets/WebLogin-ClSyyWPf.js","/assets/WorkerConcerns-DkMfqVCT.js","/assets/Workers-DYTr_uqD.js","/assets/Zagruzka-DKOjMPCJ.js","/assets/ZagruzkaCell-BEnf-9e1.js","/assets/alarm-clock-DZOhmoev.js","/assets/api-CvzEpP8J.js","/assets/archive-HxvuVchv.js","/assets/archive-restore-CiHZH_yX.js","/assets/arrow-down-Dw0YXSEm.js","/assets/arrow-left-DtwULCV8.js","/assets/arrow-left-right-BtyvWmd4.js","/assets/arrow-up-B2OXSk21.js","/assets/arrow-up-right-sh8Sj3cj.js","/assets/award-DCfAC3IE.js","/assets/ban-BKIOGIDg.js","/assets/bot-BBw-mcPj.js","/assets/boxes-ClxiYnc0.js","/assets/brigadirFilters-9TqWj14B.js","/assets/broadcastTree-7sU3MLs_.js","/assets/building-2-CHsbILTL.js","/assets/calendar-YUU4nN5-.js","/assets/calendar-clock-DYbvlofi.js","/assets/calendar-days-D3hFK6oW.js","/assets/calendar-range-5Qwd2HP0.js","/assets/camera-DzL2S6en.js","/assets/categories-Bvax2pi8.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BWAydyE2.js","/assets/chart-line-CycsYY4-.js","/assets/chart-pie-Bpr9fdKX.js","/assets/chartRange-pzQVL9xV.js","/assets/chevron-left-BqnB74Ki.js","/assets/chevrons-up-down-C-BYSaKr.js","/assets/circle-check-big-a6QqIion.js","/assets/circle-dot-DhjOawHq.js","/assets/circle-minus-CSdCoiqi.js","/assets/circle-slash-SPCfM2O9.js","/assets/circle-user-round-Cy2Hyhse.js","/assets/cloud-off-CHcWkWfL.js","/assets/cloud-upload-C_CRFvEg.js","/assets/compass-nccSHDZI.js","/assets/concernCategories-DW1MTLJc.js","/assets/copy-DQA3UBjg.js","/assets/corner-down-right-CWiLSjKm.js","/assets/createLucideIcon-CKtjbjhz.js","/assets/es-D7ZLI9gQ.js","/assets/exportXlsx-DFTihuPZ.js","/assets/external-link-CVA89nQM.js","/assets/file-clock-CuoGvxwZ.js","/assets/file-exclamation-point-9Aw-6vf-.js","/assets/file-spreadsheet-DKqGflnQ.js","/assets/file-text-CtNJtQXK.js","/assets/flag-Bb0Bwifk.js","/assets/flame-CPOjqSaJ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BDHDWsEG.js","/assets/hash-BJ6xf3vg.js","/assets/history-DD-9-sNE.js","/assets/hourglass-CAInnXbB.js","/assets/image-WCadsYxd.js","/assets/image-off-DxBpz3G5.js","/assets/index-CLdupyuy.css","/assets/index-CsRLcHqQ.js","/assets/key-round-kdn1CEnP.js","/assets/keyboard-CjceSImC.js","/assets/languages-B9L9QVV6.js","/assets/layers-DLeLBrPH.js","/assets/leaderReason-CnLF5jZB.js","/assets/lightbulb-Bf4Dmj0x.js","/assets/link-2-CHy3OQL3.js","/assets/list-checks-DR5Actni.js","/assets/list-ordered-Fayi0ZFc.js","/assets/list-tree-BiysTVLg.js","/assets/lock-open-Bx2yZTqD.js","/assets/log-in-YxVGdAUc.js","/assets/message-square-Ddvd2UcK.js","/assets/minimize-2-CQ9-w0ML.js","/assets/package-check-CCIfLSMr.js","/assets/paperclip-wDHUXSmG.js","/assets/pencil-qKigiw_X.js","/assets/personName-B4KId4zS.js","/assets/pin-Cw6RC1-h.js","/assets/play-CJLsc37s.js","/assets/presentation-CufSJUTM.js","/assets/prop-types-Dj5mRkHL.js","/assets/radio-Ds06r869.js","/assets/react-apexcharts.esm-DoufpT9A.js","/assets/repeat-J2wRmcIO.js","/assets/rotate-ccw-BBqLYby4.js","/assets/rotate-cw-D5Ym4cRz.js","/assets/save-DF_D-o7X.js","/assets/scale-BMeG_MQf.js","/assets/scroll-text-BBZC-3wT.js","/assets/search-x-CV3olJyv.js","/assets/segments-H-m6_FG7.js","/assets/send-Hk6j90iD.js","/assets/settings-2-Cft56cnQ.js","/assets/shield-YTXJyk6C.js","/assets/shield-alert-Bvpzf4Um.js","/assets/shield-check-DIzIWrjQ.js","/assets/shield-question-mark-B9DuHmJ9.js","/assets/siren-ayWksCp-.js","/assets/smartphone-BiHzeSE6.js","/assets/snowflake-CVxriD06.js","/assets/square-CQoPbki7.js","/assets/square-check-big-H7emm6Ec.js","/assets/star-BYdICjyH.js","/assets/statusBands-DfE0uaCD.js","/assets/store-C6RDxM0L.js","/assets/table-2-D_H454BZ.js","/assets/tag-BKbzvwFx.js","/assets/trending-down-Bm-sVXdt.js","/assets/trending-up-Dp6SSod-.js","/assets/triangle-alert-D0w98JGV.js","/assets/undo-2-BigPwP6D.js","/assets/useChartTheme-D1uyb-8g.js","/assets/useElementWidth-BeJbGd4a.js","/assets/useIsMobile-CgH8-1lm.js","/assets/useMutation-D2ptEwPi.js","/assets/useStatusBands-C4qMFO7m.js","/assets/user-BBr87yYz.js","/assets/user-check-N_qds4fX.js","/assets/user-cog-CIBLwygx.js","/assets/user-minus-DuUysdCj.js","/assets/users-BFrMhX4b.js","/assets/verifyState-yQsiCpv5.js","/assets/video-B5bH81Qq.js","/assets/wallet-fY_hhAW4.js","/assets/warehouse-CrgH6Dqj.js","/assets/zap-CQCcsJba.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
