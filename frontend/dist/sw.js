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

const BUILD = "2026-10-19T12:41:02.698Z";
const PRECACHE = ["/","/assets/AdminPanel-Dl7jMwV1.js","/assets/AnalysisBoard-DwdhawjP.js","/assets/Arc-CgUvwXm2.js","/assets/Assistant-0CKbvp2x.js","/assets/BrigadirProfile-CCzMxQFM.js","/assets/BroadcastReceivers-Y-Ra2NbO.js","/assets/BroadcastRecord-Cc8HK2tF.js","/assets/Button-fOTKiWXD.js","/assets/CatLockNotice-TbS0nFRk.js","/assets/CategoryLegendModal-BSNf76TR.js","/assets/CellConcerns-Cpyb69sN.js","/assets/CellDetails-DLHGq833.js","/assets/CellFormModal-DJa_rjmE.js","/assets/CellIdent-DjCzH1s9.js","/assets/CellLink-BQaYBeDf.js","/assets/Cells-B6Aj5XP-.js","/assets/ColumnFilter-CwSuPSbg.js","/assets/ColumnsPicker-D4LTFNTm.js","/assets/CommentsModal-C7bMxg65.js","/assets/ComparisonTable-nFLr4lIN.js","/assets/Concerns-B0zQdQTH.js","/assets/CountStepper-DdrglmVi.js","/assets/Daily-C2C_Cvtw.js","/assets/DataTable-DbczZVvm.js","/assets/DateRangePicker-C_SUfWKK.js","/assets/DayReportView-CJbJxexd.js","/assets/DayStepper-C6MBYvEU.js","/assets/DifferenceBreakdown-BgoZ_i1Q.js","/assets/Downtime-Bt_oRkPT.js","/assets/Education-B-ht7F8f.js","/assets/EducationLesson-DYHpfoeU.js","/assets/EmptyState-D1zzEINI.js","/assets/Exam-Jy40L5qS.js","/assets/FactorySelect-YL0gio7l.js","/assets/Gamification-CUS9RCor.js","/assets/GroupBadge-CMuvHnAE.js","/assets/HeatmapChart-Bq1hxqzc.js","/assets/IdleCell-CrQE_0Dk.js","/assets/KPICard-2sMB1B9d.js","/assets/Kaizen-D17kssbQ.js","/assets/Kelish-DscK6MYU.js","/assets/KpiDeltaCard-iGI8s4zN.js","/assets/LangTextInput-DJBE-f45.js","/assets/Layout-C5eAlekq.js","/assets/LeaderAppeal-bFbiW0qI.js","/assets/LeaderDayReport-BBBgImgy.js","/assets/LeaderUnitReport-D3JXXso1.js","/assets/Leaderboard-DASKpudh.js","/assets/Leaders-CVQ8WlVX.js","/assets/LeadersKpi-BjXOGsrJ.js","/assets/Lightbox-DG4sDD3V.js","/assets/LiveOverview-igOOSrO5.js","/assets/Login-BWOTiF8o.js","/assets/NotFound-L-QkUmCJ.js","/assets/Notifications-Nwu13Vkq.js","/assets/Overview-tMyiGv0a.js","/assets/Pagination-CSh2Ga0Q.js","/assets/PerenaladkaFactTable-DdojAIsg.js","/assets/PersonCard-Lfqpihe6.js","/assets/PlanFulfillment-C3yrGV8d.js","/assets/Production-C5_R1bKP.js","/assets/Profile-C83hwHbI.js","/assets/ProofCamera-BCV8qkQP.js","/assets/ProofPhoto-C_tGmr8l.js","/assets/Quality-BFy5Byum.js","/assets/RawRows-C5_F93KE.js","/assets/RequestStateChip-d8UQ16Jn.js","/assets/RichTextEditor-LihuY5eR.js","/assets/SaveState-BoF4DI0Q.js","/assets/SearchInput-LiuBAzL6.js","/assets/SeasonalityHeatmap-BplBUYji.js","/assets/SegmentedToggle-DGCGbAG8.js","/assets/SetupTimes-hvihOt2T.js","/assets/ShiftDaily-w4r_HP7e.js","/assets/Staff-Dp1xSWdH.js","/assets/StaffListAtCheck-B6lW9r-x.js","/assets/StatusBadge-Dz45HWho.js","/assets/TargetGoal-BPBCjQiG.js","/assets/Targets-l8ZuiOsy.js","/assets/Tasks-BngcOhxm.js","/assets/TimeWheelPicker-DYlXhnTN.js","/assets/Toast-CAnoi7J2.js","/assets/Tooltip-Hm01YSIq.js","/assets/TrendChart-BceKk5lW.js","/assets/TripleSpeedometer-bd2wHb94.js","/assets/Trudoyomkost-DlLxjXOG.js","/assets/UploadDropzone-CicBYbXT.js","/assets/UsersActivity-Ca72TT0q.js","/assets/VerdictBlock-CaBjFrlg.js","/assets/VfxApiMap-D7Huc32r.js","/assets/VfxDictionaries-Bt8Z4Sd_.js","/assets/VfxEmployees-0V0IDYty.js","/assets/VfxHrMoves-BV8m3-S-.js","/assets/VfxJobs-DSaqqR5Y.js","/assets/VfxPhoto-BJpkPJer.js","/assets/VfxShifts-NKpYwmFI.js","/assets/VfxState-CtGKshEn.js","/assets/VfxTimebooks-CO6XQeW9.js","/assets/VfxTimesheet-UX6VMnmL.js","/assets/WatchProgress-NlLEDXJW.js","/assets/WebLogin-HGegyfrF.js","/assets/Workers-BoV2tgij.js","/assets/Zagruzka-MbwM7JzJ.js","/assets/ZagruzkaCell-Cb2-0-FU.js","/assets/api-CvBE2ZHO.js","/assets/archive-EwK0DQc1.js","/assets/archive-restore-_lseTlW_.js","/assets/arrow-down-BQnc4RpG.js","/assets/arrow-down-right-BYhhhtf0.js","/assets/arrow-down-wide-narrow-BWTqfgfi.js","/assets/arrow-up-narrow-wide-CdnVzVfA.js","/assets/ban-DAPDmIz2.js","/assets/boxes-BlC2s0xo.js","/assets/braces-ugACxlWl.js","/assets/brigadirFilters-Cest7jsY.js","/assets/broadcastTree-7lgu-Axp.js","/assets/building-2-A3VO4BX_.js","/assets/calculator-BR-7KyUY.js","/assets/calendar-D0XpsebC.js","/assets/calendar-days-BuazWcP7.js","/assets/camera-mvInREys.js","/assets/categories-C3TKDCMx.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Dlt5mNnG.js","/assets/chart-line-BHy_AgYs.js","/assets/chart-pie-dMXJpdbL.js","/assets/chartRange-CDZbFlt7.js","/assets/check-check-BWlfeCoo.js","/assets/chevron-left-DOLi9Ebt.js","/assets/chevrons-up-down-CCL5qjmF.js","/assets/circle-CKqXD5P7.js","/assets/circle-alert-QkPpnuSm.js","/assets/circle-check-big-BljLDv_3.js","/assets/circle-dashed-Ga9tKptB.js","/assets/circle-minus-BDq3EE1C.js","/assets/circle-question-mark-BfK7r4es.js","/assets/circle-slash-DE1tfrKN.js","/assets/circle-user-round-Dtt6AgC1.js","/assets/cloud-off-Dqvca0KG.js","/assets/cloud-upload-B6AwcR7-.js","/assets/compass-0H_J0tjY.js","/assets/concernCategories-PjihwJwY.js","/assets/corner-down-right-B-BdnFxL.js","/assets/createLucideIcon-BZeN0tCj.js","/assets/es-CnnPRJDy.js","/assets/external-link-CobB1Nwn.js","/assets/file-clock-ptZds6Hr.js","/assets/file-exclamation-point-lfGg2tlg.js","/assets/flag-5SzA0bUG.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CEQvxm-p.js","/assets/funnel-C-RJQMEQ.js","/assets/hash-BBJARe1d.js","/assets/hourglass-BrFtErtq.js","/assets/image-BOv_a5ns.js","/assets/image-off-BzvJWjbt.js","/assets/inbox-vZJDtUIp.js","/assets/index-B_2j8ytR.js","/assets/index-DemTQruw.css","/assets/keyboard-C35G5F9i.js","/assets/languages-CDRAfG9m.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Dww-TchK.js","/assets/lightbulb-CpioY1lv.js","/assets/link-2-B8rs0YJG.js","/assets/link-2-off-DR8g8Mmf.js","/assets/list-ordered-DjDr0d6b.js","/assets/list-tree-JMaLCY-n.js","/assets/lock-open-B4Dm5AIf.js","/assets/log-in-DgK8y0Zr.js","/assets/marks-PnLQZ5DU.js","/assets/minimize-2-CebComR7.js","/assets/package-check-BzEYe1WL.js","/assets/pencil-B5FIirYA.js","/assets/percent-D__BERFL.js","/assets/pin-HtJ1Z9Rr.js","/assets/pin-off-DJtQohWo.js","/assets/play-D8m4Adat.js","/assets/plug-zap-9dmWPi8l.js","/assets/prop-types-WfNcA95c.js","/assets/radio-Bj30_8kt.js","/assets/react-apexcharts.esm-BpmWsWie.js","/assets/registers-DnIAmtp_.js","/assets/repeat-BTtmC1Pa.js","/assets/save-B3GI65pd.js","/assets/scopeLinks-CJl5ympP.js","/assets/scroll-text-DgXS8Cn0.js","/assets/search-x-B5UAlbcy.js","/assets/segments-CVZ7WQ_X.js","/assets/send-P_qFNfRK.js","/assets/settings-2-Xh5mDD81.js","/assets/shield-KJ82zCgR.js","/assets/shield-alert-7ElcBmJi.js","/assets/shield-question-mark-CqKp5KKv.js","/assets/siren-DOVEM25n.js","/assets/snowflake-D0iSDKYK.js","/assets/split-D9-R1DfH.js","/assets/square-check-big-DTHQ5ru9.js","/assets/star-C1tnTqiY.js","/assets/statusBands-D5xBhDLQ.js","/assets/store-D6G-UiOT.js","/assets/table-2-BuwJlxqM.js","/assets/table-properties-DFW5lpFu.js","/assets/tag-5WUx1eKR.js","/assets/timer-off-DoHQcA4q.js","/assets/trending-down-RP1DqzVV.js","/assets/trending-up-BcdynDLc.js","/assets/undo-2-BHmyttAy.js","/assets/useChartTheme-xsK4foOg.js","/assets/useElementWidth-4HP2jwu4.js","/assets/useIsMobile-DbTMIChv.js","/assets/useOpenParam-Dtwcm9JE.js","/assets/useStatusBands-BeythJs2.js","/assets/useUrlScope-By-A0o-x.js","/assets/user-_L_FTgDH.js","/assets/user-cog-B_ybXnXE.js","/assets/user-minus-CAdw6diP.js","/assets/users-JvXkVcXG.js","/assets/vfx-Bp0rAiqo.js","/assets/video-BnfcqG48.js","/assets/wallet-BuQI3jgZ.js","/assets/warehouse-DEQPs0oY.js","/assets/workflow-B2QmB2ud.js","/assets/x-C7sR4R6T.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
