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

const BUILD = "2026-09-30T14:58:09.801Z";
const PRECACHE = ["/","/assets/AdminPanel-CM7wVXLq.js","/assets/AnalysisBoard-ov9hAplc.js","/assets/Arc-BP7Qvpp6.js","/assets/ArcLegacy-CcGA60gw.js","/assets/AttendanceModal-Cyi7v0Bi.js","/assets/BrigadirProfile-8IJ-dy2T.js","/assets/BroadcastReceivers-CJtG-5Jd.js","/assets/BroadcastRecord-DeD1aD9N.js","/assets/CatLockNotice-BnOaicLh.js","/assets/CategoryLegendModal-D0xKbkBg.js","/assets/CellConcerns-enD6pev5.js","/assets/CellDetails-CZjMpjqh.js","/assets/CellFormModal-Dx6vrQzn.js","/assets/CellLink-6PGa2UDE.js","/assets/Cells-DimedFkI.js","/assets/ColumnFilter-CJ2JOX4A.js","/assets/ColumnsPicker-93rXciLR.js","/assets/CommentsModal-CxmPffVV.js","/assets/ComparisonTable-BHwQ3JjR.js","/assets/Concerns-B9PUmyar.js","/assets/ConfirmDialog-CuhkV28g.js","/assets/Daily-CW5nNkI8.js","/assets/DataTable-BcG6obTn.js","/assets/DateRangePicker-AAVumF0F.js","/assets/DayReportView-nVREA4p6.js","/assets/DayStepper-TcqXHA21.js","/assets/DifferenceBreakdown-D2qa_GPd.js","/assets/Downtime-DB7i_PvB.js","/assets/Education-DkeaHv0J.js","/assets/EducationLesson-Bz8W3FC3.js","/assets/EmptyState-CK9oeDl7.js","/assets/Exam-DN04f7K9.js","/assets/FactorySelect-CxHo5Iby.js","/assets/Gamification-UJ6o4lDL.js","/assets/GroupBadge-DNauLdNZ.js","/assets/HeatmapChart-CSoDmJxA.js","/assets/IdleCell-CwYg3bwb.js","/assets/KPICard-DuWyZRhh.js","/assets/Kaizen-CbO24AUQ.js","/assets/Kelish-NgNNQ2NM.js","/assets/KpiDeltaCard-CBloAgmO.js","/assets/LangTextInput-Cs62hRUq.js","/assets/Layout-C74MhnCA.js","/assets/LeaderAppeal-BJIx8ukp.js","/assets/LeaderDayReport-DbFmtwf0.js","/assets/LeaderUnitReport-BBD1zxHB.js","/assets/Leaderboard-CgFOsFL6.js","/assets/Leaders-CIdyGrSg.js","/assets/Lightbox-D4te4QcX.js","/assets/LiveOverview-CdNXVmeW.js","/assets/Login-D6PSjHQf.js","/assets/NotFound-C4hd9sIa.js","/assets/Overview-CZntYFS8.js","/assets/Pagination-CHgkZU65.js","/assets/PerenaladkaFactTable-DfeJru71.js","/assets/PlanFulfillment-BQKlBUv3.js","/assets/Production-CWFDodT9.js","/assets/Profile-QT020RGP.js","/assets/ProofCamera-DqUiwlwI.js","/assets/ProofPhoto-Dp8D7BMc.js","/assets/Quality-Bq3ALd6g.js","/assets/RequestStateChip-C7tlJicX.js","/assets/RichTextEditor-DJkMV65W.js","/assets/SaveState-DL-4wRRz.js","/assets/SearchInput-Ct6GHYyj.js","/assets/SeasonalityHeatmap-DutbdiNd.js","/assets/SegmentedToggle-dyn5GCRU.js","/assets/SetupTimes-e01EdX1e.js","/assets/ShiftDaily-BauPOvFR.js","/assets/Staff-DxCC9V-L.js","/assets/StatusBadge-BrV0Qz9G.js","/assets/TargetGoal-BF5sWXxJ.js","/assets/Targets-BvLgCdjq.js","/assets/Tasks-BkD-_Ikk.js","/assets/TimeWheelPicker-C2IZ3cjG.js","/assets/Tooltip-DLpm0YU1.js","/assets/TrendChart-C3O1PxUx.js","/assets/TripleSpeedometer-DouwSs6s.js","/assets/Trudoyomkost-c1i2QEJq.js","/assets/UploadDropzone-BXcatyM0.js","/assets/UsersActivity-DD2GCXyd.js","/assets/VerdictBlock-CbwNYMyq.js","/assets/WatchProgress-AFOEBFh6.js","/assets/WebLogin-Ckk4P0J7.js","/assets/WorkerConcerns-DvLbPfIS.js","/assets/Workers-DZlHNZVW.js","/assets/Zagruzka-BhsUdjul.js","/assets/ZagruzkaCell-N9QLYtdm.js","/assets/api-BJDFA3Ec.js","/assets/archive-DEvepVyb.js","/assets/archive-restore-DelmGXjK.js","/assets/arrow-down-BEyfFvAD.js","/assets/arrow-left-ZaEJUG1q.js","/assets/arrow-left-right-CbYV8V_9.js","/assets/arrow-up-B0FW50Ti.js","/assets/arrow-up-narrow-wide-e3fR7WxE.js","/assets/arrow-up-right-BJtXzlhO.js","/assets/award-MDWR7QuH.js","/assets/ban-BdQjds4y.js","/assets/bot-DA7Nwi6u.js","/assets/boxes-D0dpEklW.js","/assets/brigadirFilters-CtIEZrUq.js","/assets/broadcastTree-BiE1xVdG.js","/assets/building-2-CXurlYiz.js","/assets/calendar-Pz6dDLKA.js","/assets/calendar-clock-BlrUbS12.js","/assets/calendar-days-DGCHmkVY.js","/assets/calendar-range-CHPKyUZr.js","/assets/camera-B4DPenDC.js","/assets/categories-DbaHpndL.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B16nbeRp.js","/assets/chart-line-ODfuFvAt.js","/assets/chart-pie-eRab8L98.js","/assets/chartRange-BWs4z8Vk.js","/assets/chevron-left-C0dPj--w.js","/assets/chevrons-up-down-Qk1P1T71.js","/assets/circle-DIIWQcGe.js","/assets/circle-check-big-CvSGu9FX.js","/assets/circle-dot-DsZ-oiM4.js","/assets/circle-minus-DwZXf7t8.js","/assets/circle-slash-BZuFJaBU.js","/assets/circle-user-round-D3X9NLt4.js","/assets/cloud-off-BO4jNadc.js","/assets/cloud-upload-BfkchcCw.js","/assets/compass-BKBeo1S5.js","/assets/concernCategories-CSD9TBaa.js","/assets/copy-BI9Cy-qD.js","/assets/corner-down-right-BqO0scZ9.js","/assets/createLucideIcon-BaWN7SWj.js","/assets/es-CqTKR9JY.js","/assets/exportXlsx-DT11sile.js","/assets/external-link-xB6nVYjw.js","/assets/file-clock-BowgpLC_.js","/assets/file-exclamation-point-DkCzsNbI.js","/assets/file-spreadsheet-D4PdB1-i.js","/assets/file-text-NGw_YW3N.js","/assets/flag-50ibpdQ8.js","/assets/flame-C5Wk_EWo.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DmfMzCST.js","/assets/hash-4NkcjCyO.js","/assets/history-DgWzlOZg.js","/assets/hourglass-CjOqhvRR.js","/assets/image-BH1yKyTz.js","/assets/image-off-C4QEiJ_l.js","/assets/index-Bcj_8Ckw.js","/assets/index-Pg7Y1NNR.css","/assets/key-round-CT2paptQ.js","/assets/keyboard-yUdH-QX7.js","/assets/languages-DHYCDuaT.js","/assets/layers-BR8u0HH-.js","/assets/lightbulb-CV_UzfT1.js","/assets/link-2-Cj2je6EC.js","/assets/link-2-off-idiJUP4j.js","/assets/list-checks-CBJbvkzc.js","/assets/list-ordered-BIhsbPyy.js","/assets/list-tree-DjzcEZxM.js","/assets/lock-open-uKXGCHrQ.js","/assets/log-in-B7DJpIzd.js","/assets/maximize-2-DtN4HCsH.js","/assets/message-square-BgcRGSvz.js","/assets/minimize-2-CHDPqIMg.js","/assets/package-check-BacJDhwD.js","/assets/paperclip-CvGTuVhi.js","/assets/pencil-BGxVCinm.js","/assets/percent-B5GaFE4R.js","/assets/personName-CogOuS3K.js","/assets/pin-BKZOUNfq.js","/assets/pin-off-Cp4FsFk6.js","/assets/play-MrDE-3dP.js","/assets/presentation-CA_sJTMM.js","/assets/prop-types-D1TjO8Tu.js","/assets/radio-DtmTUfhW.js","/assets/react-apexcharts.esm-C4pZl2Qh.js","/assets/repeat-DHo8Gm2F.js","/assets/rotate-ccw-BYEmWTdA.js","/assets/rotate-cw-N-fa0hdY.js","/assets/save-Bxf2i_px.js","/assets/scale-Bma4PEZ3.js","/assets/scopeLinks-BCr5WmRc.js","/assets/scroll-text-deUc_tYZ.js","/assets/search-x-Cas_np5I.js","/assets/segments-B8I0Dv8E.js","/assets/send-AtIiHtvh.js","/assets/settings-2-DXJpGkhZ.js","/assets/shield-B-VuQoNp.js","/assets/shield-alert-CEay1qc5.js","/assets/shield-check-B60mAq9O.js","/assets/shield-question-mark-Bc0ykxuv.js","/assets/siren-Dm9I4QIS.js","/assets/snowflake-D7lPSV7E.js","/assets/square-Dq9k0aux.js","/assets/square-check-big-DZogI1aW.js","/assets/star-bFXuxLIt.js","/assets/statusBands-DCP7aB00.js","/assets/store-C0HI-tDB.js","/assets/table-2-CY-ENyOy.js","/assets/table-properties-DqlhdYG-.js","/assets/tag-DlYFJYNO.js","/assets/timer-off-XFjVv6Hf.js","/assets/trending-down-C3RRh-t2.js","/assets/trending-up-DqgFd5Ng.js","/assets/undo-2-dXIkNVYV.js","/assets/useChartTheme-DRmOc6WX.js","/assets/useElementWidth-cEB0Tl2g.js","/assets/useIsMobile-DrMDfeG4.js","/assets/useMutation-BFdxvXRL.js","/assets/useStatusBands-J-o9bVZ2.js","/assets/useUrlScope-nG610h_l.js","/assets/user-D_KOdbvt.js","/assets/user-cog-Bg57WjAY.js","/assets/user-minus-DOW_TMs_.js","/assets/users-CYihL_Eb.js","/assets/video-DasDl1wr.js","/assets/wallet-BXotk3RY.js","/assets/warehouse-CgQSL3H_.js","/assets/zap-mnBF4Npr.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
