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

const BUILD = "2026-10-26T05:00:07.634Z";
const PRECACHE = ["/","/assets/AdminPanel-BaPK9jJg.js","/assets/AnalysisBoard-BT-VqXvy.js","/assets/Arc-vqxPzZ2W.js","/assets/Assistant-Cm7YeQrA.js","/assets/BrigadirProfile-DVdjBNUj.js","/assets/BroadcastReceivers-B97mB97y.js","/assets/BroadcastRecord-BfM7VLkb.js","/assets/Button-Csq92MTt.js","/assets/CatLockNotice-CzBCCtbM.js","/assets/CategoryLegendModal-DpWypDth.js","/assets/CellConcerns-1ROGfo66.js","/assets/CellDetails-CbhJYYoz.js","/assets/CellFormModal-Cp3J5Xyc.js","/assets/CellIdent-BD6Yx4IG.js","/assets/CellLink-B9USyLS4.js","/assets/Cells-DfL5AyXq.js","/assets/ColumnFilter-Bof1SrlY.js","/assets/ColumnsPicker-DPZk54yx.js","/assets/CommentsModal-DMUuvd1Y.js","/assets/ComparisonTable-ClHhDWFw.js","/assets/Concerns-CHZfj6Wx.js","/assets/CountStepper-BaB7zNTS.js","/assets/Daily-DZFFTF9z.js","/assets/DataTable-BE_X8YQn.js","/assets/DateRangePicker-CJbo_Gn2.js","/assets/DayReportView-BGzF08PR.js","/assets/DayStepper-BYW0-App.js","/assets/DayStrip-DuyfO1gd.js","/assets/DifferenceBreakdown-CMejaLw8.js","/assets/Downtime-v48ImUnj.js","/assets/Education-C0sY2uHr.js","/assets/EducationLesson-Bv_4EsEt.js","/assets/EmptyState-BJP-tD8X.js","/assets/Exam-BuZe66_H.js","/assets/FactorySelect-ZuUggzI7.js","/assets/Gamification-Bd56fPSQ.js","/assets/GroupBadge-B19AZ4sR.js","/assets/HeatmapChart-BqWznJXU.js","/assets/IdleCell-DMj8w4ws.js","/assets/KPICard-C6KO1ame.js","/assets/Kaizen-B9cXvqtc.js","/assets/Kelish-0BBjlLci.js","/assets/KpiDeltaCard-eQ3GMjAm.js","/assets/LangTextInput-BtWefUio.js","/assets/Layout-D1mhEDt6.js","/assets/LeaderAppeal-DrTSI7fq.js","/assets/LeaderDayReport-D-V94FAw.js","/assets/LeaderUnitReport-DAqePM4p.js","/assets/Leaderboard-CMZNMK58.js","/assets/Leaders-DQZ8f_d0.js","/assets/LeadersKpi-CriAN_EJ.js","/assets/Lightbox-8HqsEsF3.js","/assets/LiveOverview-CxkuWn5j.js","/assets/Login-DtFoDpu5.js","/assets/NotFound-BLFvrwZW.js","/assets/Notifications-Ctt2QyqO.js","/assets/Ontime-BvxaVHON.js","/assets/Overview--aJyRIHY.js","/assets/Pagination-Mp1tmECo.js","/assets/PerenaladkaFactTable-CJ_CIcqJ.js","/assets/PersonCard-BMfPm0US.js","/assets/PlanFulfillment-Cp0aClL4.js","/assets/Production-Cp8Gy5Zl.js","/assets/Profile-C_xyV96J.js","/assets/ProofCamera-BOynNP7I.js","/assets/ProofPhoto-zL5V8vlo.js","/assets/Quality-C05ba-wi.js","/assets/RawRows-AsqwoG5B.js","/assets/RequestStateChip-BX8MiB2x.js","/assets/RichTextEditor-B7v07IU9.js","/assets/SaveState-DaWLi5Kt.js","/assets/SearchInput-DFG0209t.js","/assets/SeasonalityHeatmap-BTf20IzK.js","/assets/SegmentedToggle-DXA8DRz9.js","/assets/SetupTimes-DJuxixnU.js","/assets/ShiftDaily-Cbnkye_q.js","/assets/Staff-D1lGdDy1.js","/assets/StaffListAtCheck-CtHVMIsp.js","/assets/StatusBadge-AvYqW0A_.js","/assets/StatusBandsModal-CDWjfAgV.js","/assets/TargetGoal-CUmy0Num.js","/assets/Targets-NR37fpXr.js","/assets/Tasks-C7Frrhon.js","/assets/TimeWheelPicker-CuXT7UT9.js","/assets/Toast-oI2iGiCQ.js","/assets/Tooltip-DwUryOLK.js","/assets/TrendChart-CGsGOgfE.js","/assets/TripleSpeedometer-pBgYpzls.js","/assets/Trudoyomkost-bsO1ELfS.js","/assets/UploadDropzone-Cf3-bqw_.js","/assets/UsersActivity-B9C7xjRX.js","/assets/VerdictBlock-Cs3-Y6s5.js","/assets/VfxApiMap-B6jzOhnV.js","/assets/VfxDictionaries-C2u1w3tn.js","/assets/VfxEmployees-pLWxKMxp.js","/assets/VfxHrMoves-CLafwkh7.js","/assets/VfxJobs-Dk-trWcD.js","/assets/VfxPhoto-DtEELrxa.js","/assets/VfxShifts-Lqu-RlsC.js","/assets/VfxState-DKXDxZRU.js","/assets/VfxTimebooks-Cw3w0Gsy.js","/assets/VfxTimesheet-BPxEVKlR.js","/assets/WatchProgress-Dvj6cg-1.js","/assets/WebLogin-DQGwcz0z.js","/assets/Workers-f6Fr74ib.js","/assets/Zagruzka-Dbxd8Nxu.js","/assets/ZagruzkaCell-XleBCfX0.js","/assets/api-BFm7MSgf.js","/assets/archive-CV5c3bNF.js","/assets/archive-restore-C2mz2lJz.js","/assets/arrow-down-CalNoxUS.js","/assets/arrow-down-right-BgsR9Q-e.js","/assets/arrow-down-wide-narrow-CN2VmRvO.js","/assets/arrow-up-narrow-wide-Bk9rr8ks.js","/assets/ban-7TYOIrZH.js","/assets/boxes-BbJ-gJn3.js","/assets/braces-KKXZkSWg.js","/assets/brigadirFilters-OZ-sYQaU.js","/assets/broadcastTree-BvC2i0iB.js","/assets/building-2-D_QmyOVb.js","/assets/calendar-days-1eTgVUrW.js","/assets/calendar-wgDfdnEM.js","/assets/camera-BLS4o3AB.js","/assets/categories-BkLMzEMP.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DAT023xD.js","/assets/chart-line-B8-TvC1_.js","/assets/chart-pie-C8JKGoM_.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-BxX2ybdO.js","/assets/chevron-left-BCR-WqPF.js","/assets/chevrons-up-down-DCacxNJr.js","/assets/circle-Cj_XSx-0.js","/assets/circle-alert-1gJQpXIe.js","/assets/circle-check-big-BMMnK_Ac.js","/assets/circle-dashed-C6j9aToG.js","/assets/circle-minus-CPJoknrG.js","/assets/circle-question-mark-K9p85opR.js","/assets/circle-slash-D5TTqhsS.js","/assets/circle-user-round-C94p_gNE.js","/assets/cloud-off-DOsilzo8.js","/assets/cloud-upload-EEoydfca.js","/assets/compass-BXzAyCp9.js","/assets/concernCategories-B0K-5QZ7.js","/assets/corner-down-right-BZpwmAXF.js","/assets/createLucideIcon-DFwa3A4_.js","/assets/en-B1lsigQd.js","/assets/es-Dtgc5NM1.js","/assets/external-link-utm2Ef73.js","/assets/file-clock-Z8J9OpZx.js","/assets/file-exclamation-point-Bj4MQiJT.js","/assets/flag-DdVPoiqC.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Bhs-8U1b.js","/assets/funnel-CQ4gUhVl.js","/assets/hash-CgQFMtkS.js","/assets/hourglass-BQguNOT3.js","/assets/image-DKRb_a5z.js","/assets/image-off-BXDQEozZ.js","/assets/inbox-_7XbS9tE.js","/assets/index-CdvbwAi3.css","/assets/index-Dhp9R7Bm.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-BtoSE0Rk.js","/assets/languages-CyS920wf.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CuYBRJVb.js","/assets/leaderBoard-BqSXdPkB.js","/assets/lightbulb-CAuuW3hn.js","/assets/link-2-0fHCSDML.js","/assets/link-2-off-BYY_guf_.js","/assets/list-ordered-BbqYa1K_.js","/assets/list-tree-D3jS5eO4.js","/assets/lock-open-BY6GlcHo.js","/assets/log-in-7FQxzcRp.js","/assets/map-pin-D0hssA4w.js","/assets/marks-BE97V82v.js","/assets/minimize-2-Dwvarznf.js","/assets/package-check-1CnMGu5Z.js","/assets/pencil-BHcAVjmd.js","/assets/percent-BA097YPD.js","/assets/pin-CTqenAiU.js","/assets/pin-off-BgMwbK5M.js","/assets/play-IUE2THtt.js","/assets/plug-zap-w3zUPgOy.js","/assets/prop-types-RD3fbola.js","/assets/radio-BsPpV07v.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-DaI6TmMU.js","/assets/repeat-CmzJEdaJ.js","/assets/ru-BOsfuX_Y.js","/assets/save-DQ-WN0rG.js","/assets/scopeLinks-BS9EwjvO.js","/assets/scroll-text-DxFCSzyX.js","/assets/search-x-DfxI_WqM.js","/assets/segments-D5Uiedtv.js","/assets/send-C8pNtPJo.js","/assets/settings-2-Xqt52YEF.js","/assets/shield-BIOPGood.js","/assets/shield-alert-B-6RqDu5.js","/assets/shield-question-mark-CAdXk5SM.js","/assets/sigma-Bh_dE5K0.js","/assets/siren-CosAQLtw.js","/assets/snowflake-DdAh7F65.js","/assets/split-xFcxVA5x.js","/assets/square-check-big-BN8BVG9L.js","/assets/star-DoWATV4D.js","/assets/statusBands-DVBZcBq3.js","/assets/store-BH39AfXT.js","/assets/table-2-LUwwc4cZ.js","/assets/table-properties-DWqtX2aG.js","/assets/tag-wdQP1avT.js","/assets/timer-off-cLhz9ICv.js","/assets/translations-CT5FCkUR.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-C2TOF2Kj.js","/assets/trending-up-BBCQNT2k.js","/assets/undo-2-DSjP0X1-.js","/assets/useChartTheme-guCHafWm.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-C0B9rDO8.js","/assets/useStatusBands-ifKmGk-o.js","/assets/useUrlScope-CFxX-iC0.js","/assets/user-BKgKROyL.js","/assets/user-cog-CI0HE0JY.js","/assets/user-minus-DguQkdIc.js","/assets/users-CB9roynZ.js","/assets/uz-Dt3NmLCC.js","/assets/uz_cyrl-C2VNphql.js","/assets/vfx-T01TQzUg.js","/assets/video-DpqLn46E.js","/assets/wallet-iHUlropk.js","/assets/warehouse-MNLw-NeA.js","/assets/workflow-SjEH-qii.js","/assets/x-BammQj1E.js","/assets/zap-NOXC8imO.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
