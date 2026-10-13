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

const BUILD = "2026-10-13T04:52:05.799Z";
const PRECACHE = ["/","/assets/AdminPanel-Cehj049t.js","/assets/AnalysisBoard-IIn3FE_j.js","/assets/Arc-BOwQXyP0.js","/assets/Assistant-CICwfjep.js","/assets/BrigadirProfile-3YtOr6Vg.js","/assets/BroadcastReceivers-DPWhb-zc.js","/assets/BroadcastRecord-td4SxGbT.js","/assets/Button-B5MnE42j.js","/assets/CatLockNotice-BozQcYDY.js","/assets/CategoryLegendModal-DPsuo-9W.js","/assets/CellConcerns-uDch3Gc3.js","/assets/CellDetails-Cmtl7ObP.js","/assets/CellFormModal-gEQ-tLNb.js","/assets/CellIdent-DTpu8f_C.js","/assets/CellLink-9ZRjxTBH.js","/assets/Cells-BQABKWJ6.js","/assets/ColumnFilter-BovffEer.js","/assets/ColumnsPicker-h1sp3OST.js","/assets/CommentsModal-DlF4p-q0.js","/assets/ComparisonTable-B90Y8Ct9.js","/assets/Concerns-BBW3-o_J.js","/assets/Daily-BKm1saJB.js","/assets/DataTable-CZvYQTD4.js","/assets/DateRangePicker-CSAOmjdO.js","/assets/DayReportView-DrXWsEjO.js","/assets/DayStepper-CQDUpKDj.js","/assets/DifferenceBreakdown-CcO3I4bH.js","/assets/Downtime-NnidHOYE.js","/assets/Education-C57GLVY3.js","/assets/EducationLesson-DLqMwo5o.js","/assets/EmptyState-Buvpm0Vr.js","/assets/Exam-CTafHKNW.js","/assets/FactorySelect-WZZRYcEI.js","/assets/Gamification-BR8e1IPS.js","/assets/GroupBadge-BdMSw5SI.js","/assets/HeatmapChart-CQkQ72p1.js","/assets/IdleCell-BprMDDjb.js","/assets/KPICard-b9-yVPZe.js","/assets/Kaizen-ODG684Hb.js","/assets/Kelish-DuIR7Trd.js","/assets/KpiDeltaCard-CAbDfS0A.js","/assets/LangTextInput-BTT0G-Pq.js","/assets/Layout-Bd-YXCCU.js","/assets/LeaderAppeal-CRfN9bNH.js","/assets/LeaderDayReport-VyxYyPX_.js","/assets/LeaderUnitReport-BFU0NqKT.js","/assets/Leaderboard-CPQdEos3.js","/assets/Leaders-B8j69s6C.js","/assets/Lightbox-BRJSqjxL.js","/assets/LiveOverview-CLRNq9-F.js","/assets/Login-D2PRO1Ga.js","/assets/NotFound-N8OCuFek.js","/assets/Notifications-CkstBiIs.js","/assets/Overview-CwQ0TRWy.js","/assets/Pagination-Dn0NBumr.js","/assets/PerenaladkaFactTable-B3RtFCeH.js","/assets/PersonCard-DUzCesGj.js","/assets/PlanFulfillment-Gof6EBHC.js","/assets/Production-BXYZ0gWx.js","/assets/Profile-CKbRSQpx.js","/assets/ProofCamera-i-8OwENx.js","/assets/Quality-BmTvSAKZ.js","/assets/RawRows-m_ShCALu.js","/assets/RequestStateChip-DTuysUQG.js","/assets/RichTextEditor-BPU2W_sc.js","/assets/SaveState-M8gLfe-K.js","/assets/SearchInput-DurVHWOp.js","/assets/SeasonalityHeatmap-0_BZTbmj.js","/assets/SegmentedToggle-BOZ_LDBp.js","/assets/SetupTimes-wFbBgr5w.js","/assets/ShiftDaily-BPV726Tz.js","/assets/Staff-CW2twpJi.js","/assets/StaffListAtCheck-CmxJlB69.js","/assets/StatusBadge-BWqAtl2u.js","/assets/TargetGoal-3l3_pGRw.js","/assets/Targets-WmDeSNJl.js","/assets/Tasks-Vicjvsf8.js","/assets/TimeWheelPicker-dVrL_h3t.js","/assets/Toast-DDum3ajs.js","/assets/Tooltip-6TD8VUTa.js","/assets/TrendChart-B5eQjIyQ.js","/assets/TripleSpeedometer-DMgWW7X_.js","/assets/Trudoyomkost-BKwSBFZJ.js","/assets/Turnover-CheZvY99.js","/assets/UploadDropzone-lRvlkK3j.js","/assets/UsersActivity-BClSBMqD.js","/assets/VerdictBlock-Bad_LwFI.js","/assets/VfxApiMap-4lZv0W3o.js","/assets/VfxDictionaries-CtDFbMy2.js","/assets/VfxEmployees-DRwIDRCX.js","/assets/VfxHrMoves-DZ4LBaqh.js","/assets/VfxJobs-PNBjHN5N.js","/assets/VfxPhoto-Bxprd6it.js","/assets/VfxShifts-Zm1YDeKT.js","/assets/VfxState-BbKo7UKX.js","/assets/VfxTimebooks-Ckni1fdU.js","/assets/VfxTimesheet-CMVgSBOD.js","/assets/WatchProgress-mEg5Iyz7.js","/assets/WebLogin-3dtfThWs.js","/assets/WorkerConcerns-Cz5XK_8u.js","/assets/Workers-NEDTSBmh.js","/assets/Zagruzka-RKZI9GzI.js","/assets/ZagruzkaCell-CXYi2wzY.js","/assets/api-CFuAdb7g.js","/assets/archive-oXYCVXq5.js","/assets/archive-restore-D2f_qrgx.js","/assets/arrow-down-usKZpBJt.js","/assets/arrow-down-wide-narrow-BX2MoN-V.js","/assets/arrow-up-narrow-wide-BasOTg2D.js","/assets/award-CZxmYS6q.js","/assets/ban-CbEe7WYQ.js","/assets/boxes-DzYHd7D-.js","/assets/braces-7Un62SUI.js","/assets/brigadirFilters-CsbIeA_3.js","/assets/broadcastTree-DBcPfCH6.js","/assets/building-2-Bzj3T_jl.js","/assets/calculator-CSIIjmaw.js","/assets/calendar-days-DEwet85d.js","/assets/calendar-m2P_Xd8N.js","/assets/camera-DTVs7HT4.js","/assets/categories-aEySpQAe.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-IrlYW_EF.js","/assets/chart-line-Bj9jcdI5.js","/assets/chart-pie-B3SSuKLl.js","/assets/chartRange-cLjkDxRh.js","/assets/check-check-BRou-m6O.js","/assets/chevron-left-Fmf3N4a9.js","/assets/chevrons-up-down-CLdMmCD8.js","/assets/circle-BCIb5YOu.js","/assets/circle-alert-DVEUqtZ_.js","/assets/circle-check-big-CZ5a8RK9.js","/assets/circle-dashed-5LFCudae.js","/assets/circle-minus-BQAowGDy.js","/assets/circle-question-mark-DfAywRkU.js","/assets/circle-slash-CBz6uktd.js","/assets/circle-user-round-DulBy5MO.js","/assets/clock-3-BtYB9kkR.js","/assets/cloud-off-DYV2ZGVs.js","/assets/cloud-upload-CXN31vc7.js","/assets/compass-CauI8keN.js","/assets/concernCategories-tRwH6W5B.js","/assets/copy-CFBdq-Ur.js","/assets/corner-down-right-WNxqX_WH.js","/assets/createLucideIcon-CEcGzaHL.js","/assets/es-C_K2oOX2.js","/assets/external-link-JDrO1ToZ.js","/assets/file-clock-DfZpz0V2.js","/assets/file-exclamation-point-CYGQovGT.js","/assets/flag-Bmo4Xdwt.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-kce2JwCd.js","/assets/hash-r-2qihoN.js","/assets/hourglass-n_8MFHNB.js","/assets/image-3YF__uMP.js","/assets/image-off-Bi5N9-qv.js","/assets/inbox-CG3aQyUR.js","/assets/index-CI1cZ1SD.css","/assets/index-CxGJsyiN.js","/assets/keyboard-DK_arwuC.js","/assets/languages-cqRQP3Re.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BUtErfph.js","/assets/lightbulb-CtZPkAZA.js","/assets/link-2-D7wEw6o_.js","/assets/link-2-off-CIgfLCdI.js","/assets/list-ordered-Vm0bQcxx.js","/assets/list-tree-Bq7OLoOX.js","/assets/lock-open-DwBfrx8Z.js","/assets/log-in-BgwsmZfy.js","/assets/marks-7_GrcRcK.js","/assets/minimize-2-C6vZfXoM.js","/assets/package-check-CQKSp6tX.js","/assets/pencil-BMq9_Rfb.js","/assets/percent-Czj7jxw4.js","/assets/pin-CIyia6gr.js","/assets/pin-off-DgQ2QVcm.js","/assets/play-DOBzIgwg.js","/assets/plug-zap-BX3oVJp0.js","/assets/prop-types-C5mN6ODb.js","/assets/radio-CxtoRdUr.js","/assets/react-apexcharts.esm-B0bIrmw7.js","/assets/registers-B-D2YZ8r.js","/assets/repeat-Cn4b7mQX.js","/assets/save-M_O4kjjh.js","/assets/scopeLinks-C5enPa9f.js","/assets/scroll-text-BUreg9E5.js","/assets/search-x-DJoC2SUb.js","/assets/segments-CL8NV59N.js","/assets/send-DybJgPH5.js","/assets/settings-2-DDkMznXZ.js","/assets/shield-CuSOJZCD.js","/assets/shield-alert-DXhBuw09.js","/assets/shield-question-mark-D7lfAYsJ.js","/assets/siren-DSbNRK6a.js","/assets/snowflake-BzU_ato6.js","/assets/split-BtZb1jkV.js","/assets/square-check-big-BkCVaGPk.js","/assets/star-jp7kTSY9.js","/assets/statusBands-CsTXsd1Z.js","/assets/store-D0XMHixT.js","/assets/table-2-Bildgybf.js","/assets/table-properties-D0JuxXSB.js","/assets/tag-LiWOh29d.js","/assets/timer-off-ofH5vaCH.js","/assets/trending-down-BBCjoDxo.js","/assets/trending-up-Brcm4_mz.js","/assets/undo-2-C3VyHqKV.js","/assets/useChartTheme-DJEH_oCg.js","/assets/useElementWidth-DPQMO_EK.js","/assets/useIsMobile-DOZVE2Rt.js","/assets/useOpenParam-COxBvUx4.js","/assets/useStatusBands--Q1zFXoD.js","/assets/useUrlScope-C8_s-Kcd.js","/assets/user-BZ91I2gh.js","/assets/user-cog-BrUfNVZt.js","/assets/users-B41AZFAt.js","/assets/vfx-Cc0PAMep.js","/assets/video-QY1RLCIm.js","/assets/wallet-BvHz78Se.js","/assets/warehouse-kygcpaHP.js","/assets/workflow-B7c1A_Xe.js","/assets/x-BD_q6Uzr.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
