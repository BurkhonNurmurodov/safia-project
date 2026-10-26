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

const BUILD = "2026-10-26T07:55:20.521Z";
const PRECACHE = ["/","/assets/AdminPanel-BosAhtL5.js","/assets/AnalysisBoard-BXBLcs5J.js","/assets/Arc-C_RsESJF.js","/assets/Assistant-BF9YMGZZ.js","/assets/BrigadirProfile-C8t0R0FS.js","/assets/BroadcastReceivers-6YwpRN9_.js","/assets/BroadcastRecord-DQyDqfgA.js","/assets/Button-DmX-EVwE.js","/assets/CatLockNotice-BiFDc3EK.js","/assets/CategoryLegendModal-DtJg3FJW.js","/assets/CellConcerns-BEXCIadH.js","/assets/CellDetails-CkpoGycm.js","/assets/CellFormModal-BY7S5Ryg.js","/assets/CellIdent-DSOYjlpn.js","/assets/CellLink-2W9O4uDm.js","/assets/Cells-DcFww-pk.js","/assets/ColumnFilter-C6yFfTAA.js","/assets/ColumnsPicker-C1vh-2kc.js","/assets/CommentsModal-DrHN7L7u.js","/assets/ComparisonTable-a89HZop7.js","/assets/Concerns-qSeItQ-H.js","/assets/CountStepper-DRkduEHn.js","/assets/Daily-D57BiitL.js","/assets/DataTable-D0XR7Fpi.js","/assets/DateRangePicker-BhDk0enn.js","/assets/DayReportView-_TGoLUYH.js","/assets/DayStepper-Da7OuaCf.js","/assets/DayStrip-ZrSbCMgh.js","/assets/DifferenceBreakdown-CuFT91aG.js","/assets/Downtime-DDJqgiyx.js","/assets/Education-Dia0lhzR.js","/assets/EducationLesson-DETd-Sar.js","/assets/EmptyState-CPaC0ACq.js","/assets/Exam-C_5A1aJs.js","/assets/FactorySelect-DMzQEKK7.js","/assets/Gamification-DL-va5BF.js","/assets/GroupBadge-BgKopPps.js","/assets/HeatmapChart-cWG1N5TL.js","/assets/IdleCell-CJA8EoT0.js","/assets/KPICard-CRwINjCf.js","/assets/Kaizen-mV1N5EgM.js","/assets/Kelish-DhJfN8uj.js","/assets/KpiDeltaCard-Cut53Ed1.js","/assets/LangTextInput-CAiMU1sr.js","/assets/Layout-DsRinogE.js","/assets/LeaderAppeal-s_KcEcyX.js","/assets/LeaderDayReport-6ncrooq2.js","/assets/LeaderUnitReport-BRc2tvnO.js","/assets/Leaderboard-oaDYCoSt.js","/assets/Leaders-DW1ImGxt.js","/assets/LeadersKpi-D3TEKBGh.js","/assets/Lightbox-D3x-J7K_.js","/assets/LiveOverview-BOeEmzpR.js","/assets/Login-B5SMwxsm.js","/assets/NotFound-CzaNF0Gl.js","/assets/Notifications-CoNOZ9eu.js","/assets/Ontime-lNr6-QgQ.js","/assets/Overview-LYsNpEic.js","/assets/Pagination-D1kYcyJ4.js","/assets/PerenaladkaFactTable-CO--DgNg.js","/assets/PersonCard-E8IciuvT.js","/assets/PlanFulfillment-Cb1fwf-s.js","/assets/Production-BBV-4Vcl.js","/assets/Profile-CnSI_Cdq.js","/assets/ProofCamera-BoHi19Xs.js","/assets/ProofPhoto-CpDxS3mg.js","/assets/Quality-DVdByuWm.js","/assets/RawRows-B2_xVyky.js","/assets/Reports-DY4iVH_m.js","/assets/RequestStateChip-CdzjSYva.js","/assets/RichTextEditor-Bne24it2.js","/assets/SaveState-5m8S3FIf.js","/assets/SearchInput-CY4u1UpI.js","/assets/SeasonalityHeatmap-DI6Ola80.js","/assets/SegmentedToggle-2M6Rmrgn.js","/assets/SetupTimes-BNrASJph.js","/assets/ShiftDaily-dI6TGGjI.js","/assets/Staff-BWtI0gkA.js","/assets/StaffListAtCheck-C1aodifC.js","/assets/StatusBadge-KrVMzS6T.js","/assets/StatusBandsModal-KXRkRI_d.js","/assets/TargetGoal-B8z3-SbW.js","/assets/Targets-BL660Gkg.js","/assets/Tasks-34Ju-O6K.js","/assets/TimeWheelPicker-DoaHa8e7.js","/assets/Toast-DtjhPNan.js","/assets/Tooltip-CXMW2HQK.js","/assets/TrendChart-COgaDFKp.js","/assets/TripleSpeedometer-BOsFzC7B.js","/assets/Trudoyomkost-CRyIyw2I.js","/assets/UploadDropzone-BzuZywye.js","/assets/UsersActivity-ClenPy_x.js","/assets/VerdictBlock-CkRmOOhg.js","/assets/VfxApiMap-Cyj6GWHD.js","/assets/VfxDictionaries-D8gC4Yb-.js","/assets/VfxEmployees-BSomM4T1.js","/assets/VfxHrMoves-B_SoSfcv.js","/assets/VfxJobs-l6Fe3pU4.js","/assets/VfxPhoto-DI4EoLeN.js","/assets/VfxShifts-xHrCp9xW.js","/assets/VfxState-fv0oZFmm.js","/assets/VfxTimebooks-CbeNQCuG.js","/assets/VfxTimesheet-BWLXGmLQ.js","/assets/WatchProgress-DGBWJb2Q.js","/assets/WebLogin-BnUVI-ZF.js","/assets/Workers-DbAlee4W.js","/assets/Zagruzka-bwaqbWpF.js","/assets/ZagruzkaCell-DmXyTkW0.js","/assets/api-BFm7MSgf.js","/assets/archive-CVo2I5KI.js","/assets/archive-restore-DQ6l1kTe.js","/assets/arrow-down-Cwq9MyEX.js","/assets/arrow-down-right-D2i-XUXc.js","/assets/arrow-down-wide-narrow-CzM1fMuu.js","/assets/arrow-up-narrow-wide-CRh6ppKg.js","/assets/ban-IC4VAAR9.js","/assets/boxes-wPd6V71n.js","/assets/braces-CUVoGv16.js","/assets/brigadirFilters-b6H471QA.js","/assets/broadcastTree-DCpltc98.js","/assets/building-2-DprATJqm.js","/assets/calendar-EiQMr8Pl.js","/assets/calendar-days-Bu5yL6-9.js","/assets/camera-DQNKXcGX.js","/assets/categories-Cu8fI56-.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-K_pVdtL0.js","/assets/chart-line-Dhe5Ux5A.js","/assets/chart-pie-CGH-bPN0.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-Xti0Ro1J.js","/assets/chevron-left-CF3WaQNW.js","/assets/chevrons-up-down-BUsuAo3R.js","/assets/circle-BJaSRuzf.js","/assets/circle-alert-DHvIxQGz.js","/assets/circle-check-big-DqHUL0So.js","/assets/circle-dashed--6ux1Eyu.js","/assets/circle-minus-DyVVElIO.js","/assets/circle-question-mark-hXdtGzKu.js","/assets/circle-slash-CbSDBRwI.js","/assets/circle-user-round-vKK83fJe.js","/assets/cloud-off-CKdTI49C.js","/assets/cloud-upload-C5SH19sa.js","/assets/coins-BkrqhhZ6.js","/assets/compass-BIymNYQw.js","/assets/concernCategories-DsW-H8Py.js","/assets/corner-down-right-DGoQ2PAH.js","/assets/createLucideIcon-BNf2sMLW.js","/assets/en-B8jp113w.js","/assets/es-Dtgc5NM1.js","/assets/external-link-Du1-CyTK.js","/assets/file-clock-CP5EKOZy.js","/assets/file-exclamation-point-ha1Rij-N.js","/assets/flag-BsRNknAM.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BAAEXuoH.js","/assets/funnel-BsvA601z.js","/assets/hash-BRSPrGkl.js","/assets/hourglass-CoyWEdwS.js","/assets/idleTime-CHPnJRpw.js","/assets/image-h1RkBYA4.js","/assets/image-off-rQa_EGMq.js","/assets/inbox-DjvciQR2.js","/assets/index-DLxHG_Om.css","/assets/index-noIMbK9W.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-BaJbbIpA.js","/assets/languages-BOpunOpm.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BaINswHU.js","/assets/leaderBoard-omhxIZoL.js","/assets/lightbulb-D9IujtE0.js","/assets/link-2-BOHEFO-2.js","/assets/link-2-off-CjttMhL8.js","/assets/list-ordered-5_v_H67T.js","/assets/list-tree-Dtcw_PiD.js","/assets/lock-open-C2e2zw2o.js","/assets/log-in-BSfwdwCC.js","/assets/map-pin-CPdw9rV_.js","/assets/marks-CR_e0vCL.js","/assets/minimize-2-LdgoOAuY.js","/assets/package-check-Cu_9L8KH.js","/assets/pencil-D3d0j9gZ.js","/assets/percent-JIraKax-.js","/assets/pin-CsQS7Bei.js","/assets/pin-off-CEges6P6.js","/assets/play-DaKcON_N.js","/assets/plug-zap-CdjCQ7_3.js","/assets/prop-types-RD3fbola.js","/assets/radio-D_PimuFA.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-BW7iO4-Q.js","/assets/repeat-BDSkbwq1.js","/assets/ru-DqTNozxf.js","/assets/save-BH5BxyB0.js","/assets/scopeLinks-4DVjHDwG.js","/assets/scroll-text-B0VGXijn.js","/assets/search-x-LdF4TqHW.js","/assets/segments-D5Uiedtv.js","/assets/send-BCLM2wcE.js","/assets/settings-2-CtwU_NJ-.js","/assets/shield-CSx55cVo.js","/assets/shield-alert-DlHs7COj.js","/assets/shield-question-mark-BTFIsDnL.js","/assets/sigma-KZ3kPKjF.js","/assets/siren-Ct0uuzsy.js","/assets/snowflake-C8ziLX2N.js","/assets/split-Ezo685F7.js","/assets/square-check-big-CyTgD3aw.js","/assets/star-Dw_L-HRe.js","/assets/statusBands-DVBZcBq3.js","/assets/store-B2T8eU7P.js","/assets/table-2-DhRTVM8f.js","/assets/table-properties-CobB0JwR.js","/assets/tag-C1rp7oDp.js","/assets/timer-off-DydtgeoH.js","/assets/translations-DCbgusf1.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-B_NO2JVT.js","/assets/trending-up-DThUl1OH.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-De24uBEV.js","/assets/useChartTheme-BXj8FJB6.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-BGlHKSDN.js","/assets/useStatusBands-C8TdwbDa.js","/assets/useUrlScope-DsVY9sj1.js","/assets/user-CgUgz-KO.js","/assets/user-cog-CEzBwYIZ.js","/assets/user-minus-6QiM4vQb.js","/assets/users-C35t6mnK.js","/assets/uz-CJcLyv67.js","/assets/uz_cyrl--lu-Uogn.js","/assets/vfx-DtC6eZ6q.js","/assets/video-BBAkAb2N.js","/assets/wallet-Df91B1mV.js","/assets/warehouse-Bu67rPCz.js","/assets/workflow-B0CqhvrW.js","/assets/x-CL3Gwu65.js","/assets/zap-BGTew8GF.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
