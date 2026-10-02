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

const BUILD = "2026-10-02T05:09:13.746Z";
const PRECACHE = ["/","/assets/AdminPanel-DYFuy0q3.js","/assets/AnalysisBoard-D7QLF3D_.js","/assets/Arc-DPxroaqm.js","/assets/ArcLegacy-7modBYG5.js","/assets/BrigadirProfile-D53Amrs3.js","/assets/BroadcastReceivers-Cy02rjJP.js","/assets/BroadcastRecord-BURr7pGz.js","/assets/CatLockNotice-Bzr9ssHJ.js","/assets/CategoryLegendModal-DajV5MGf.js","/assets/CellConcerns-CgLR21ym.js","/assets/CellDetails-BJKtsKwi.js","/assets/CellFormModal-DR65o6Ys.js","/assets/CellIdent-BCu9xZ6_.js","/assets/CellLink-CAT6uGom.js","/assets/Cells-BfLz0Nuk.js","/assets/ColumnFilter-DiBvB8pj.js","/assets/ColumnsPicker-BeYTqIgP.js","/assets/CommentsModal-DsvmnZoz.js","/assets/ComparisonTable-C5Yr48OE.js","/assets/Concerns-DfyUqwRl.js","/assets/ConfirmDialog-CtILdnnp.js","/assets/Daily-ClDcJNm4.js","/assets/DataTable-D_8sxgS9.js","/assets/DateRangePicker-QKU914Db.js","/assets/DayReportView-hVNCSIsF.js","/assets/DayStepper-D50I60DM.js","/assets/DifferenceBreakdown-1Kf3cOb_.js","/assets/Downtime-Szeol4BY.js","/assets/Education-seHDAfcD.js","/assets/EducationLesson-Ii3oDj1V.js","/assets/EmptyState-BeQ_VBMz.js","/assets/Exam-C3QoF_jZ.js","/assets/FactorySelect-byCf-AW1.js","/assets/Gamification-B0kpq-rw.js","/assets/GroupBadge-BRuJ71OC.js","/assets/HeatmapChart-BCrpdyyf.js","/assets/IdleCell-D0ShqDfk.js","/assets/KPICard-CWCS_Mxz.js","/assets/Kaizen-mMcVOWYK.js","/assets/Kelish-B6ipWtTd.js","/assets/KpiDeltaCard-cRwt8I7N.js","/assets/LangTextInput-DijbdUjk.js","/assets/Layout-IIMbRYVu.js","/assets/LeaderAppeal-Bo6xKY8W.js","/assets/LeaderDayReport-C_EVtZgC.js","/assets/LeaderUnitReport-Cw_9g_-p.js","/assets/Leaderboard-CpN6UT3z.js","/assets/Leaders-yGqh8Ww4.js","/assets/Lightbox-Bh09f_fz.js","/assets/LiveOverview-Of3l8wpG.js","/assets/Login-DiM1JNX0.js","/assets/NotFound-Dt2HkG0y.js","/assets/Notifications-DsZbgQWP.js","/assets/Overview-iCgV6tZT.js","/assets/Pagination-CpHkf_fH.js","/assets/PerenaladkaFactTable-BFbz9B3P.js","/assets/PlanFulfillment-Dky8Lfx2.js","/assets/Production-D6ztFN7L.js","/assets/Profile-CSNm1HwC.js","/assets/ProofCamera-BiYw9Y3x.js","/assets/ProofPhoto-B3qnD27z.js","/assets/Quality-BN5WeMo9.js","/assets/RequestStateChip-BNhlEiA_.js","/assets/RichTextEditor-CYui253Q.js","/assets/SaveState-DVduUkIQ.js","/assets/SearchInput-BvUxWylz.js","/assets/SeasonalityHeatmap-kdDyyFRC.js","/assets/SegmentedToggle-BoqdZ4YM.js","/assets/SetupTimes-BnD_mjmf.js","/assets/ShiftDaily-BeLWzR1k.js","/assets/Staff-BKXeg5AR.js","/assets/StaffLive-Bv0lnGEm.js","/assets/StatusBadge-D-jIpfw7.js","/assets/TargetGoal-CbYeJh5F.js","/assets/Targets-DSOuKBsI.js","/assets/Tasks-WWf7bsOr.js","/assets/TimeWheelPicker-Bh5ZxVL7.js","/assets/Toast-BSZeEXWm.js","/assets/Tooltip-CxDGXle2.js","/assets/TrendChart-vqCHzYuj.js","/assets/TripleSpeedometer-C9rXJRCa.js","/assets/Trudoyomkost-C-YuUkO7.js","/assets/UploadDropzone-CWsMskH1.js","/assets/UsersActivity-Cwt6JkYP.js","/assets/VerdictBlock-B2akyQ_i.js","/assets/WatchProgress-Dt47Z-i3.js","/assets/WebLogin-BggxylZz.js","/assets/WorkerConcerns-BABGc7O2.js","/assets/Workers-DtwbCon3.js","/assets/Zagruzka-Li9SWhvd.js","/assets/ZagruzkaCell-B_WV2zeH.js","/assets/api-DD3Kq7az.js","/assets/archive-restore-uUHBCB3U.js","/assets/archive-spC1BPtl.js","/assets/arrow-down-D6uxR0-w.js","/assets/arrow-left-D4KYeovZ.js","/assets/arrow-right-left-CH-mUBC3.js","/assets/arrow-up-C42KnyiB.js","/assets/arrow-up-narrow-wide-B81NtcKp.js","/assets/arrow-up-right-DnMBxFqV.js","/assets/award-199lhf7d.js","/assets/ban-0N-p4hqu.js","/assets/bot-Dyp8Cl6i.js","/assets/boxes-wOxcrW0n.js","/assets/brigadirFilters-CSfXGZvG.js","/assets/broadcastTree-BbWcUX-H.js","/assets/building-2-B3tU_RKY.js","/assets/calendar-BimMIkSi.js","/assets/calendar-days-4rR77jCr.js","/assets/calendar-range-Daf_YyyE.js","/assets/camera-DG27aDmV.js","/assets/categories-D2aT6QbL.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DOTtD0gX.js","/assets/chart-line-BZP8V1WM.js","/assets/chart-pie-Bwab_9nJ.js","/assets/chartRange-BhVPGRrG.js","/assets/chevron-left-DO9LKiRK.js","/assets/chevrons-up-down-50beosQE.js","/assets/circle-CgYvFfDE.js","/assets/circle-alert-Bb_1tC84.js","/assets/circle-check-big-DYCRQE03.js","/assets/circle-minus-Qj8SDT0a.js","/assets/circle-slash-DdGaQ1Nr.js","/assets/circle-user-round-CsDJ_IZz.js","/assets/cloud-off-BGaTwFZV.js","/assets/cloud-upload-D9NwQzDS.js","/assets/compass-BGRGY0qp.js","/assets/concernCategories-BefJuBPU.js","/assets/copy-FFqzr_aW.js","/assets/corner-down-right-CJAsWTwS.js","/assets/createLucideIcon-CbfYk8Rj.js","/assets/es-BVEvKRj6.js","/assets/exportXlsx-GI6NHjgR.js","/assets/external-link-Cp7y4bgm.js","/assets/file-clock-BHpsReSJ.js","/assets/file-exclamation-point-D7q6UL4D.js","/assets/file-spreadsheet-k-SynlIF.js","/assets/file-text-BzDNiPlY.js","/assets/flag-Bx67Mt05.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Brv54iEk.js","/assets/hash-Ceq2juFy.js","/assets/history-hq7GQmhd.js","/assets/hourglass-BYP61j_r.js","/assets/id-card-BTjzueTx.js","/assets/image-ByyDWdXi.js","/assets/image-off-CZ8C-kS1.js","/assets/inbox-DE3O2agi.js","/assets/index-B8Em9sgn.js","/assets/index-CBQ-7RpV.css","/assets/key-round-DpXWwfrV.js","/assets/keyboard-So7R152C.js","/assets/languages-23tPv9FF.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-qApReREP.js","/assets/lightbulb-CSNm3EMb.js","/assets/link-2-D0GQB1ZH.js","/assets/link-2-off-CqfNarDz.js","/assets/list-ordered-BX94Wxze.js","/assets/list-tree-Bpfoua6K.js","/assets/lock-open-BDP1z2Zf.js","/assets/log-in-CPyoSbJT.js","/assets/maximize-2-CpLEKOfx.js","/assets/message-square-Dw-cogYw.js","/assets/minimize-2-DrPFE3mW.js","/assets/package-check-CKQOYlO0.js","/assets/paperclip-BYm8sO3K.js","/assets/pencil-D-4DMTaO.js","/assets/percent-DMUu-QVT.js","/assets/pin-Bdopv_JC.js","/assets/pin-off-ClhR8YSF.js","/assets/play-DTxq2_ls.js","/assets/plug-zap-CcPdTyiN.js","/assets/presentation-BTQ-pev3.js","/assets/prop-types-CLr3zJHb.js","/assets/radio-BlUUt2Dr.js","/assets/react-apexcharts.esm-B8bX9hM0.js","/assets/repeat-B2E_s63I.js","/assets/rotate-ccw-CSvDkSFi.js","/assets/rotate-cw-CTkljZaE.js","/assets/save-83DK_PPF.js","/assets/scopeLinks-q734gdJA.js","/assets/scroll-text-5ikD2Qtr.js","/assets/search-x-BJ4XxuhL.js","/assets/segments-COxbQt9F.js","/assets/send-ss78KfnL.js","/assets/settings-2-CSXrqIp4.js","/assets/shield-BIdk2d7m.js","/assets/shield-alert-DWjV4XCf.js","/assets/shield-check-D3Jw3Erv.js","/assets/shield-question-mark-CnXPEh9r.js","/assets/siren-Bfw_vsHi.js","/assets/snowflake-gVdtURML.js","/assets/split-yRaLeOEC.js","/assets/square-Co5NP-gS.js","/assets/square-check-big-ChcvTtcc.js","/assets/star-Dbcpujwc.js","/assets/statusBands-HDv3Tl9e.js","/assets/store-Cb6sky33.js","/assets/table-2-B-Bg8W1l.js","/assets/table-properties-DQ7IgCyy.js","/assets/tag-DuWWDGiH.js","/assets/timer-off-BlBcehVi.js","/assets/trending-down-CgEQs61o.js","/assets/trending-up-BS0vOlKR.js","/assets/undo-2-DF6GFzL-.js","/assets/useChartTheme-DSjJ07-6.js","/assets/useElementWidth-DdJPQpYj.js","/assets/useIsMobile-YXMXTcZt.js","/assets/useOpenParam-Bmg2RHUE.js","/assets/useStatusBands-Cx-BvGA8.js","/assets/useUrlScope-VB7EfUbb.js","/assets/user-BYvU4sfK.js","/assets/user-cog-CP0WzRxl.js","/assets/user-minus-DAomEIzy.js","/assets/users-C2i_ercq.js","/assets/video-BJldo3Ra.js","/assets/wallet-jIceiq_B.js","/assets/warehouse-CGJBn7_W.js","/assets/x-CQjbnQT7.js","/assets/zap-BAAVdn67.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
