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

const BUILD = "2026-10-15T04:46:17.837Z";
const PRECACHE = ["/","/assets/AdminPanel-BtFLipfz.js","/assets/AnalysisBoard-BtaPom20.js","/assets/Arc-DW6dMNcY.js","/assets/Assistant-zP4NSnOV.js","/assets/BrigadirProfile-BCvbr3OM.js","/assets/BroadcastReceivers-ClBHgwF9.js","/assets/BroadcastRecord-B5tbrqCw.js","/assets/Button-D5T25ToG.js","/assets/CatLockNotice-DStwjmw1.js","/assets/CategoryLegendModal-Bmxe2qjR.js","/assets/CellConcerns-_pSgg9kr.js","/assets/CellDetails-B_fiua3Y.js","/assets/CellFormModal-TK_Jh7OV.js","/assets/CellIdent-l2kYbCTg.js","/assets/CellLink-DVlqJm6j.js","/assets/Cells-q4Lo1VJI.js","/assets/ColumnFilter-RSHP0oiM.js","/assets/ColumnsPicker-Dv1tuYTT.js","/assets/CommentsModal-DKC6QK93.js","/assets/ComparisonTable-BRQfa6Lu.js","/assets/Concerns-CJCyFaPw.js","/assets/CountStepper-BOexZcu_.js","/assets/Daily-BY8YQyVO.js","/assets/DataTable-CuzwULTg.js","/assets/DateRangePicker-C0AsB5-x.js","/assets/DayReportView-BwyIG4pq.js","/assets/DayStepper-CH4geTeK.js","/assets/DifferenceBreakdown-DBwxsZtt.js","/assets/Downtime-Dfnx0xCZ.js","/assets/Education-D7iKRUaL.js","/assets/EducationLesson-M8MSDYSP.js","/assets/EmptyState-Y2W6ajeD.js","/assets/Exam-D2wo1KB-.js","/assets/FactorySelect-D0x3IfSJ.js","/assets/Gamification-DRMqMFza.js","/assets/GroupBadge-DVTIdSqL.js","/assets/HeatmapChart-Qx9oU9zT.js","/assets/IdleCell-CwtBTrZu.js","/assets/KPICard-DJ7ineGX.js","/assets/Kaizen-CCZKssSc.js","/assets/Kelish-NxypBZUd.js","/assets/KpiDeltaCard-B7lSzYzX.js","/assets/LangTextInput-B0_hyVdX.js","/assets/Layout-gxOqoMy4.js","/assets/LeaderAppeal-BiLNn2s5.js","/assets/LeaderDayReport-DD7ZCwBe.js","/assets/LeaderUnitReport-DT9JTKhQ.js","/assets/Leaderboard-Disn-Rh_.js","/assets/Leaders-B-O78rBO.js","/assets/Lightbox-BqBWRmKD.js","/assets/LiveOverview-DI8QKWs6.js","/assets/Login-OvHZHlF7.js","/assets/NotFound-CEyKs1K0.js","/assets/Notifications-C2nOJWcn.js","/assets/Overview-DZKv_Nh8.js","/assets/Pagination-BNcHgG1i.js","/assets/PerenaladkaFactTable-DGd-G1Ox.js","/assets/PersonCard-usXhDX3B.js","/assets/PlanFulfillment-CxOsE8Un.js","/assets/Production-CfZsMA-i.js","/assets/Profile-Cwpynx-N.js","/assets/ProofCamera-CwrH1zFh.js","/assets/Quality-Blfj8IGS.js","/assets/RawRows-D4r9es_z.js","/assets/RequestStateChip-CAzGEJbX.js","/assets/RichTextEditor-CzuW74yL.js","/assets/SaveState-utzp7mRq.js","/assets/SearchInput-DaSdrH-G.js","/assets/SeasonalityHeatmap-Bv22Yfak.js","/assets/SegmentedToggle-DSychKym.js","/assets/SetupTimes-DyoIsq1t.js","/assets/ShiftDaily-DGGvyDvV.js","/assets/Staff-BJL2w8Js.js","/assets/StaffListAtCheck-Byn6JHcY.js","/assets/StatusBadge-b56DbcUK.js","/assets/TargetGoal-Cctq9iKZ.js","/assets/Targets-BKYlpK40.js","/assets/Tasks-D4pgrSJU.js","/assets/TimeWheelPicker-B65XTyPk.js","/assets/Toast-CEO5uEY2.js","/assets/Tooltip-DSM4B1x9.js","/assets/TrendChart-dfTzJtIj.js","/assets/TripleSpeedometer-C2tufvHC.js","/assets/Trudoyomkost-6z1rrmyJ.js","/assets/Turnover-1Soyzifw.js","/assets/UploadDropzone-Dct7hc_W.js","/assets/UsersActivity-Co3B88XR.js","/assets/VerdictBlock-BZWOeT49.js","/assets/VfxApiMap-CJyK1xTu.js","/assets/VfxDictionaries-BQV-7X3t.js","/assets/VfxEmployees-CVmvj8WH.js","/assets/VfxHrMoves-B1Oex-xs.js","/assets/VfxJobs-6OSi1MLL.js","/assets/VfxPhoto-fOmw6dJI.js","/assets/VfxShifts-CWOVLTVK.js","/assets/VfxState-CPWhKkuk.js","/assets/VfxTimebooks-DZYguaG-.js","/assets/VfxTimesheet-D0HPWNo7.js","/assets/WatchProgress-C0PdZQgb.js","/assets/WebLogin-3A8YhBZ3.js","/assets/WorkerConcerns-Bf62fvlh.js","/assets/Workers-DjIyM4lV.js","/assets/Zagruzka-C48EfpDr.js","/assets/ZagruzkaCell-BrA4bZYY.js","/assets/api-B4A4YbXw.js","/assets/archive-CQQqXo0z.js","/assets/archive-restore-BNv8y8iK.js","/assets/arrow-down-wide-narrow-CG4T-zS4.js","/assets/arrow-down-yD_ebXDA.js","/assets/arrow-up-narrow-wide-DY9uZvVg.js","/assets/award-ZZ6XA749.js","/assets/ban-CzZkhoDx.js","/assets/boxes-D0TfpsbK.js","/assets/braces-CqTCzoBg.js","/assets/brigadirFilters-fYurvxp8.js","/assets/broadcastTree-Q5od2PX8.js","/assets/building-2-Vul3Uv82.js","/assets/calculator-CR0-qS_P.js","/assets/calendar-BNi4LGMu.js","/assets/calendar-days-BbkRqM2L.js","/assets/camera-BT1iwa3K.js","/assets/categories-B-ZU1tyt.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BaL4L42d.js","/assets/chart-line-B9T8iU1G.js","/assets/chart-pie-B_TctxBg.js","/assets/chartRange-CCi5qhER.js","/assets/check-check-7gWDtGoB.js","/assets/chevron-left-CMOJ5fjj.js","/assets/chevrons-up-down-CHG2dcmE.js","/assets/circle-CGwdAnZ3.js","/assets/circle-alert-vtDpXwgl.js","/assets/circle-check-big-CDyat_a5.js","/assets/circle-dashed-Dsdj4fOn.js","/assets/circle-minus-HHEXDAv0.js","/assets/circle-question-mark-BSr_5_iO.js","/assets/circle-slash-B4SNWnVV.js","/assets/circle-user-round-BM_DaV6v.js","/assets/clock-3-BBiUOrSL.js","/assets/cloud-off-D22p3cuQ.js","/assets/cloud-upload-Sde1tNtk.js","/assets/compass-nNC3rO3Y.js","/assets/concernCategories-L2zctrRe.js","/assets/copy-809BOjN9.js","/assets/corner-down-right-B61w0SFN.js","/assets/createLucideIcon-CpeP3ocB.js","/assets/es-BBKk3wJW.js","/assets/external-link-3z1zrCIT.js","/assets/file-clock-CgwAU0Jv.js","/assets/file-exclamation-point-Dmdq25xK.js","/assets/flag-BX80P-1M.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BiTv_uNy.js","/assets/hash-DzuRjdi2.js","/assets/hourglass-CQTQtp5w.js","/assets/image-ByfPkyqG.js","/assets/image-off-CDvh3e1n.js","/assets/inbox-CidtRYf9.js","/assets/index-B7zrdcSh.css","/assets/index-BDV9hUVs.js","/assets/keyboard-Dtn39Hb_.js","/assets/languages-It_mBp-N.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CKV-4X6v.js","/assets/lightbulb-CxUlxXon.js","/assets/link-2-off-CDty_XAr.js","/assets/link-2-rJODU_Nm.js","/assets/list-ordered-DYYy2paG.js","/assets/list-tree-CUdv_7yo.js","/assets/lock-open-B9sHcgYd.js","/assets/log-in-DTbbUKqf.js","/assets/marks-CxNl23D2.js","/assets/minimize-2-HpSB2wAc.js","/assets/package-check-Drrpedgr.js","/assets/pencil-BpYovoWy.js","/assets/percent-lYXHZcEF.js","/assets/pin-0cnz_H2u.js","/assets/pin-off-C6rPAqTn.js","/assets/play-BsRI5q5T.js","/assets/plug-zap-DZR1cyFM.js","/assets/prop-types-D5b7sGD9.js","/assets/radio-DchqYLs_.js","/assets/react-apexcharts.esm-IkArVdXy.js","/assets/registers-Bz22GwcC.js","/assets/repeat-DiVizWZ6.js","/assets/save-CeQkn_kD.js","/assets/scopeLinks-CRaiUH7V.js","/assets/scroll-text-Ds0nOn2U.js","/assets/search-x-MQib9iqj.js","/assets/segments-Bq0by0zu.js","/assets/send-C8JPjk9Z.js","/assets/settings-2-1NaetNoR.js","/assets/shield-CI3vMUEv.js","/assets/shield-alert-Ci-Z0VaA.js","/assets/shield-question-mark-DkTPaZZC.js","/assets/siren-PItwF5HI.js","/assets/snowflake-5jO3cCU2.js","/assets/split-CG5RQlrN.js","/assets/square-check-big-CUUkhTBQ.js","/assets/star-G8R7Im1g.js","/assets/statusBands-BUINUutb.js","/assets/store-BG9PkQPf.js","/assets/table-2-tKp7PE4w.js","/assets/table-properties-DiquBcOT.js","/assets/tag-IkIfMSHK.js","/assets/timer-off-CaSYHJhh.js","/assets/trending-down-86_hld8Y.js","/assets/trending-up-CoGJq2FQ.js","/assets/undo-2-C8sf3oTJ.js","/assets/useChartTheme-D6R-n3EO.js","/assets/useElementWidth-BcFIXR4e.js","/assets/useIsMobile-CXCTQvmN.js","/assets/useOpenParam-BKSvRbrB.js","/assets/useStatusBands-CcSUiN67.js","/assets/useUrlScope-6xQdAojD.js","/assets/user-DqRa-PL1.js","/assets/user-cog-C-i-x8Tm.js","/assets/users-CBnQUyjI.js","/assets/vfx-ByFMuWB6.js","/assets/video-BAqBrzN1.js","/assets/wallet-CIMLgjFp.js","/assets/warehouse-DehWUM_K.js","/assets/workflow-_Lwuh4jW.js","/assets/x-CALHOVGE.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
