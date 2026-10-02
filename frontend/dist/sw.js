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

const BUILD = "2026-10-02T11:04:33.381Z";
const PRECACHE = ["/","/assets/AdminPanel-DvqU5Sc0.js","/assets/AnalysisBoard--PNtpp5u.js","/assets/Arc-BCXTWxoK.js","/assets/ArcLegacy-B22g08OO.js","/assets/BrigadirProfile-ZG2009N3.js","/assets/BroadcastReceivers-CwYpRb6v.js","/assets/BroadcastRecord-CNHfbXtr.js","/assets/CatLockNotice-C5xcpOJm.js","/assets/CategoryLegendModal-s7qC-bA_.js","/assets/CellConcerns-DpactDpl.js","/assets/CellDetails-BDbQ16je.js","/assets/CellFormModal-D9KWiIhX.js","/assets/CellIdent-DD9MvB6A.js","/assets/CellLink-BCIZhGSJ.js","/assets/Cells-B-ozwnJf.js","/assets/ColumnFilter-B-NBcG8B.js","/assets/ColumnsPicker-CtxY8YE8.js","/assets/CommentsModal-CJ7rEaeR.js","/assets/ComparisonTable-BTNlQsRI.js","/assets/Concerns-CHO-e7Xa.js","/assets/ConfirmDialog-Cw5VoVFO.js","/assets/Daily-BIjU707q.js","/assets/DataTable-DS-DBSOF.js","/assets/DateRangePicker-DHaje6bc.js","/assets/DayReportView-BYFQSIrr.js","/assets/DayStepper-BnnyedLF.js","/assets/DifferenceBreakdown-D36ZKRez.js","/assets/Downtime-D9i5u2pf.js","/assets/Education-CKN5sd-P.js","/assets/EducationLesson-CoDfC69W.js","/assets/EmptyState-DxhnoFin.js","/assets/Exam-De3XdcNG.js","/assets/FactorySelect-BMYeeDYv.js","/assets/Gamification-BlwGErZg.js","/assets/GroupBadge-6qhCXOq6.js","/assets/HeatmapChart-Ltgy1Csv.js","/assets/IdleCell-B6PQfx4r.js","/assets/KPICard-lg9UPZ1H.js","/assets/Kaizen-C8n0ZcL8.js","/assets/Kelish-C6_S2S4L.js","/assets/KpiDeltaCard-DamuTfnB.js","/assets/LangTextInput-D-hETZyq.js","/assets/Layout-VLIwV_tT.js","/assets/LeaderAppeal-ye_ivQ4m.js","/assets/LeaderDayReport-BuQeQWGF.js","/assets/LeaderUnitReport-BQTf1jlX.js","/assets/Leaderboard-uW_ferRj.js","/assets/Leaders-BxmJjKzO.js","/assets/Lightbox-DchntVE3.js","/assets/LiveOverview-BZwi_qD-.js","/assets/Login-Di2kDRb2.js","/assets/NotFound-DIuiknYA.js","/assets/Notifications-CSub31Mv.js","/assets/Overview-C01KAMPb.js","/assets/Pagination-Bq0fawwp.js","/assets/PerenaladkaFactTable-tyyzt7H9.js","/assets/PlanFulfillment-z2HXzivZ.js","/assets/Production-DzfasCYJ.js","/assets/Profile-Cr2TS6PR.js","/assets/ProofCamera-Ba8xZJxt.js","/assets/ProofPhoto-jvCm1rAp.js","/assets/Quality-BVJbZT0V.js","/assets/RequestStateChip-CV7rTEXg.js","/assets/RichTextEditor-DWrBQW5H.js","/assets/SaveState-BVxSoYZU.js","/assets/SearchInput-DPsrzjC0.js","/assets/SeasonalityHeatmap-Bp3v7QoT.js","/assets/SegmentedToggle-Dpz50hkP.js","/assets/SetupTimes-B4FmSbZR.js","/assets/ShiftDaily-C3C0Cilk.js","/assets/Staff-2WUzetpl.js","/assets/StaffLive-DyKHxvu2.js","/assets/StatusBadge-TYMZkVno.js","/assets/TargetGoal-CReh0a8a.js","/assets/Targets-C4NjPszC.js","/assets/Tasks-CpDQz-iM.js","/assets/TimeWheelPicker-B_OEpPOp.js","/assets/Toast-D_1LwCQ6.js","/assets/Tooltip-0j_cimzO.js","/assets/TrendChart-sGL-xL0y.js","/assets/TripleSpeedometer-BzqGRIOb.js","/assets/Trudoyomkost-FyZ2WuDy.js","/assets/UploadDropzone-DyPFmlqB.js","/assets/UsersActivity-CJm-hIug.js","/assets/VerdictBlock-Dg-sOp8G.js","/assets/WatchProgress-DV8IyDqq.js","/assets/WebLogin-Bot4d_2H.js","/assets/WorkerConcerns-6fxJApS9.js","/assets/Workers-D-yeZahs.js","/assets/Zagruzka-TFC5X_4U.js","/assets/ZagruzkaCell-BG9MZBfY.js","/assets/api-BW6y3goW.js","/assets/archive-CstlTFlU.js","/assets/archive-restore-B8B-bqvL.js","/assets/arrow-down-BCg5UGqr.js","/assets/arrow-left-CRc1LDfd.js","/assets/arrow-right-left-BZovbXSB.js","/assets/arrow-up-Cy66z2U2.js","/assets/arrow-up-narrow-wide-Cb6BcqUm.js","/assets/arrow-up-right-CTlhO-RL.js","/assets/award-B1JiGqdH.js","/assets/ban-9ndAzued.js","/assets/bot-B94Xaqf8.js","/assets/boxes-CrgoZyv_.js","/assets/brigadirFilters-T-zJrO7s.js","/assets/broadcastTree-Bf86EoV8.js","/assets/building-2-SSZzWBHC.js","/assets/calendar-CH6rALyw.js","/assets/calendar-days-BWxkE1gZ.js","/assets/calendar-range-Xrwm-aqs.js","/assets/camera-Bv-JF8AW.js","/assets/categories-B81-0sWq.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BGXjqkg4.js","/assets/chart-line-CCz_Y8TF.js","/assets/chart-pie-DBcm9CY6.js","/assets/chartRange-CJHooL_l.js","/assets/chevron-left-BdR-WeJA.js","/assets/chevrons-up-down-CaxFS2Q6.js","/assets/circle-6fj9HtEm.js","/assets/circle-alert-R8MlLrOL.js","/assets/circle-check-big-CWG1nqAl.js","/assets/circle-minus-CeN2-Qq1.js","/assets/circle-question-mark-BI3m5u6v.js","/assets/circle-slash-BwReOAMM.js","/assets/circle-user-round-B0AfLVd0.js","/assets/cloud-off-CmXg5lu8.js","/assets/cloud-upload-WPGXfZtn.js","/assets/compass-r9oAoiQ4.js","/assets/concernCategories-BgC-Qb-l.js","/assets/copy-xj28uzKL.js","/assets/corner-down-right-Cho7nCWJ.js","/assets/createLucideIcon-B18a6rYe.js","/assets/es-BRvmNq9s.js","/assets/exportXlsx-Ck3DGln4.js","/assets/external-link-BnZdAiGn.js","/assets/file-clock-CeWH6UY8.js","/assets/file-exclamation-point-BSjJL0TS.js","/assets/file-spreadsheet-BdtB3BxD.js","/assets/file-text-DiSB0-XF.js","/assets/flag-Cs6DrGQ_.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DwmAy6s8.js","/assets/hash-PZShn1dZ.js","/assets/history-BdlaTROA.js","/assets/hourglass-DqBunWdS.js","/assets/id-card-BU7kOJUZ.js","/assets/image-D1qosxw5.js","/assets/image-off-Dowtuom8.js","/assets/inbox-DStWW_GJ.js","/assets/index-D-9nyv1M.js","/assets/index-bv1wZ_fI.css","/assets/key-round-BI1uAryQ.js","/assets/keyboard-B-IuGJ1B.js","/assets/languages-CX40HCT4.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BRhITQ6f.js","/assets/lightbulb-DkxMqUZ8.js","/assets/link-2-CWZKN3iQ.js","/assets/link-2-off-Dlt3VOVB.js","/assets/list-ordered-DtcuIsSC.js","/assets/list-tree-CVZWrblr.js","/assets/lock-open-DfMLd3qi.js","/assets/log-in-Bb8Mkw42.js","/assets/maximize-2-u4azVop6.js","/assets/message-square-DRu7sDFt.js","/assets/minimize-2-BOFrzniP.js","/assets/package-check-NzAe5FGP.js","/assets/paperclip-BA6E6ZlJ.js","/assets/pencil-N0HLGIoI.js","/assets/percent-CM45IubJ.js","/assets/pin-CLgjZNI7.js","/assets/pin-off-PK2t0Alm.js","/assets/play-B8rv0Pud.js","/assets/plug-zap-DQhGcPiT.js","/assets/presentation-CzWUhjOB.js","/assets/prop-types-BYpUoW0_.js","/assets/radio-Br8lHxI2.js","/assets/react-apexcharts.esm-2Y22gGFE.js","/assets/repeat-CqO_TYVh.js","/assets/rotate-ccw-BbZn0FdE.js","/assets/rotate-cw-WhDsDwZb.js","/assets/save-DtQl0brs.js","/assets/scopeLinks-CA1tEP7M.js","/assets/scroll-text-lE2s_QWQ.js","/assets/search-x-Cs4to_yX.js","/assets/segments-BCja7gCX.js","/assets/send-CXebaesB.js","/assets/settings-2-CjrPh63a.js","/assets/shield-CEOGPZVU.js","/assets/shield-alert-19FVDYVY.js","/assets/shield-check-oINdUxeY.js","/assets/shield-question-mark-Bo3uF4jf.js","/assets/siren-CDSwFmZs.js","/assets/snowflake-CZNAKIFt.js","/assets/split-B-cx56o0.js","/assets/square-Czc4Co3L.js","/assets/square-check-big-CerXKmN5.js","/assets/star-CoPUMViS.js","/assets/statusBands-ByXRFxxt.js","/assets/store-B2WeVRYb.js","/assets/table-2-CX_qCW3i.js","/assets/table-properties-BWPu5kkW.js","/assets/tag-C5zI8hhw.js","/assets/timer-off-BgELS0gI.js","/assets/trending-down-DR-v4icf.js","/assets/trending-up-RHNHEr6F.js","/assets/undo-2-C0He3vIT.js","/assets/useChartTheme-BqCDRrdh.js","/assets/useElementWidth-Dit76WOi.js","/assets/useIsMobile-DETH5K4i.js","/assets/useOpenParam-DSB8BNUY.js","/assets/useStatusBands-HQYuIo_6.js","/assets/useUrlScope-c_-zwWPM.js","/assets/user-Cewg13VG.js","/assets/user-cog-CtJH3c-R.js","/assets/user-minus-DTcTpdDY.js","/assets/users-BzMgoJPK.js","/assets/video-CjgbegG0.js","/assets/wallet-Bk_2fI9J.js","/assets/warehouse-CgRmNaii.js","/assets/x-BNgBQnbf.js","/assets/zap-7cNsG-1f.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
