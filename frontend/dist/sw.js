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

const BUILD = "2026-09-21T11:57:15.643Z";
const PRECACHE = ["/","/assets/AdminPanel-B6MnIKAc.js","/assets/AnalysisBoard-C0bgGoLx.js","/assets/Arc-BpSJHA-B.js","/assets/AttendanceModal-C3MElVk4.js","/assets/BrigadirProfile-CeTV3kLT.js","/assets/BroadcastReceivers-BsBKLpO-.js","/assets/BroadcastRecord-C0wKkqeL.js","/assets/CatLockNotice-5ArCeLtw.js","/assets/CategoryLegendModal-iDFde6fU.js","/assets/CellConcerns-CRHhF0Sq.js","/assets/CellDetails-BFslNONY.js","/assets/CellFormModal-B18vlFiX.js","/assets/CellLink-lqZ3w3h3.js","/assets/Cells-BZSkbyrh.js","/assets/ColumnFilter-eMmiLWOm.js","/assets/ColumnsPicker-DBbuz_WZ.js","/assets/CommentsModal-CsKZTLs_.js","/assets/ComparisonTable-VEHw9dKE.js","/assets/Concerns-C1P4yDTp.js","/assets/ConfirmDialog-CCYzmv9n.js","/assets/Daily-AChn8nag.js","/assets/DataTable-gHh19xPk.js","/assets/DateRangePicker-B7M8KFY4.js","/assets/DayReportView-CgQgbyXn.js","/assets/DayStepper-CAABJ8m_.js","/assets/DifferenceBreakdown-BTW_fTqF.js","/assets/Downtime-CNGBK7-x.js","/assets/Education-B8rHK-Te.js","/assets/EducationLesson-BNKeKARZ.js","/assets/EmptyState-BejdwzFx.js","/assets/FactorySelect-DyprpUtT.js","/assets/FormField-CANZlsak.js","/assets/Gamification-J1swXCyq.js","/assets/GroupBadge-BKFqQJD3.js","/assets/HeatmapChart-B3kcoQS3.js","/assets/IdleCell-BcICrRGH.js","/assets/KPICard-RH0PZ-ek.js","/assets/Kaizen-Cvwuj0-9.js","/assets/KpiDeltaCard-DZDP-94E.js","/assets/LangTextInput-BBUG1pIN.js","/assets/Layout-C1T4A39e.js","/assets/LeaderDayReport-DD3jzVgn.js","/assets/LeaderUnitReport-D3tBmh2m.js","/assets/Leaderboard-Cx_RsRLj.js","/assets/Leaders-BODzbVSe.js","/assets/LiveOverview-JyLZMRIX.js","/assets/Login-BH-oeq-_.js","/assets/NotFound-BSTBrBT4.js","/assets/Overview-DI0LZ2Z-.js","/assets/Pagination-BqnTrt-p.js","/assets/PerenaladkaFactTable-5zB8ZCBP.js","/assets/PlanFulfillment-DqhhAJFw.js","/assets/Production-skxl1Pgr.js","/assets/Profile-DHeCF-TB.js","/assets/ProofCamera-fGR_qZOI.js","/assets/Quality-CMcvJWpM.js","/assets/RichTextEditor-CBuoLcNy.js","/assets/SearchInput-j__Fk9Cp.js","/assets/SeasonalityHeatmap-NFIDtYQz.js","/assets/SegmentedToggle-BCwWW5ac.js","/assets/SetupTimes-CCG7Dogn.js","/assets/ShiftDaily-BAfYSrd3.js","/assets/Skeleton-Ds2pwAJp.js","/assets/Staff-yCmSRHTj.js","/assets/StatusBadge-CHzVLegw.js","/assets/StyledSelect-CSNvtiDf.js","/assets/Targets-Ce_AOJep.js","/assets/Tasks-CbkgWJBY.js","/assets/TimeField-BgatOofW.js","/assets/TimeWheelPicker-DLjtNq4B.js","/assets/Toast-D_Zdy1qL.js","/assets/Tooltip-517Smu3r.js","/assets/TrendChart-BtwCcPQI.js","/assets/TripleSpeedometer-DF291Y-U.js","/assets/Trudoyomkost-8NSSGBe6.js","/assets/UsersActivity-CCgWeBfJ.js","/assets/WatchProgress-1wPtGWmQ.js","/assets/WebLogin-Ck4g-rET.js","/assets/WorkerConcerns-C0uUsH7N.js","/assets/Workers-Du30rGrx.js","/assets/Zagruzka-Wn9H2lsD.js","/assets/ZagruzkaCell-BI5ryN3P.js","/assets/alarm-clock-C-D_K0Dp.js","/assets/api-YTvTEj5w.js","/assets/archive-a7yoDOD5.js","/assets/archive-restore-DHn7tCM3.js","/assets/arrow-down-VXLl2mHN.js","/assets/arrow-left-2ZicdkVC.js","/assets/arrow-left-right-BmWZZSCC.js","/assets/arrow-right-D3K7BL-W.js","/assets/arrow-up-CUZwsf-c.js","/assets/arrow-up-right-DAhjHf3W.js","/assets/award-DbjPX4MK.js","/assets/ban-DIRONmDa.js","/assets/bot-BR5li4PF.js","/assets/boxes-DxnE1KWj.js","/assets/brigadirFilters-BBfx9CW0.js","/assets/broadcastTree-CxV7DekJ.js","/assets/building-2-BvG5IGxy.js","/assets/calendar-C5UxA02p.js","/assets/calendar-clock-D-KrMWxf.js","/assets/calendar-days-B7839lZ8.js","/assets/calendar-range-fPDR-Oc_.js","/assets/camera-Bsry028z.js","/assets/categories-DU4-bdFy.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Bn8uYHGP.js","/assets/chart-line-BTom5Mdl.js","/assets/chart-pie-CaQc-aZm.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-XTwq8P1w.js","/assets/check-BIg2hqAx.js","/assets/check-check-Dmtnxw_r.js","/assets/chevron-left-BM8Vl6oa.js","/assets/chevrons-up-down-D9-mxA3y.js","/assets/circle-dashed-BfcHqiNS.js","/assets/circle-dot-DHj18l2W.js","/assets/circle-minus-gHWKRzkE.js","/assets/circle-slash-BQ7NYcVY.js","/assets/circle-user-round-z10Io53l.js","/assets/coins-BiiVdPq1.js","/assets/compass-CsEt0aky.js","/assets/concernCategories-BcBA_soJ.js","/assets/copy-XCE0SvqF.js","/assets/corner-down-right-DI1BYZNM.js","/assets/createLucideIcon-dFeT6PLq.js","/assets/exportXlsx-vq4I-UqZ.js","/assets/external-link-CqQAY-fd.js","/assets/file-clock-B8-EIKvH.js","/assets/file-spreadsheet-CMsz5YsB.js","/assets/file-text-DSdnYGFl.js","/assets/flag-NolFUmwg.js","/assets/flame-CijHb0zq.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CfItX4NO.js","/assets/funnel-CRvpT8Px.js","/assets/hash-TOxBNb2R.js","/assets/history-B_E8wSVx.js","/assets/hourglass-Cqgwao1L.js","/assets/image-DsvJfomc.js","/assets/image-off-DL7VJT27.js","/assets/index-BXqTV2jf.css","/assets/index-D0Sj8tRU.js","/assets/keyboard-BLzCqOB7.js","/assets/languages-BhUNTZJb.js","/assets/layers-BneGKbvm.js","/assets/leaderReason-BiTH6iHo.js","/assets/lightbulb-CWi07h-l.js","/assets/link-2-B6lQEBDD.js","/assets/list-checks-CAZey_Y9.js","/assets/list-ordered-DpjXXFQA.js","/assets/lock-open-BDSIoTmq.js","/assets/log-in-C0ggvPW1.js","/assets/message-square-SPpP8yEX.js","/assets/minimize-2-CcSaKVxi.js","/assets/minus-YyGqbjJD.js","/assets/paperclip-Cdwskr5k.js","/assets/pencil-DzR_aRGX.js","/assets/pencil-line-BhCSjFIh.js","/assets/personName-B4KId4zS.js","/assets/pin-C-MmwmUg.js","/assets/play-DJWOKk18.js","/assets/prop-types-xmPkcaHm.js","/assets/radio-iFoByyN6.js","/assets/react-apexcharts.esm-B5w9G1Ej.js","/assets/refresh-cw-CKrZNBDc.js","/assets/repeat-BINE0s7d.js","/assets/rotate-ccw-Bparl013.js","/assets/rotate-cw-zbg8YfYO.js","/assets/save-BTpYvn1l.js","/assets/scale-BgyhZWfT.js","/assets/scroll-text-BSTw-qrZ.js","/assets/search-x-BE5j0MiQ.js","/assets/segments-DblNVqtw.js","/assets/send-BRhAnCxT.js","/assets/settings-2-DI5h_ZzM.js","/assets/shield-CF8utxfM.js","/assets/shield-alert-zysybgE-.js","/assets/shield-check-CSd7Toj3.js","/assets/shield-question-mark-XAeT6c8D.js","/assets/siren-BO5xKHNz.js","/assets/smartphone-B8EV9mPi.js","/assets/snowflake-B_GYpnKf.js","/assets/square-DeHu1Tsl.js","/assets/square-check-big-CHcmEoWh.js","/assets/star-C160qd7z.js","/assets/statusBands-Ri8KaZfM.js","/assets/table-2-CdCrXUUk.js","/assets/tag-C2V5JDUB.js","/assets/trash-2-C7iblIyk.js","/assets/trending-down-DEmvMM_-.js","/assets/trending-up-DDXDmfY3.js","/assets/undo-2-BhW1ghjB.js","/assets/useChartTheme-ed0K0OI_.js","/assets/useElementWidth-D7an-hit.js","/assets/useIsMobile-DD2ksA1G.js","/assets/useMutation-BDDI5p2R.js","/assets/useStatusBands-D7NnlHTL.js","/assets/user-check-CIx3Mav8.js","/assets/user-cog-BB19hf1T.js","/assets/user-minus-DPho-CEA.js","/assets/users-BabnaFEY.js","/assets/verifyState-C5QDnEYw.js","/assets/video-DNedsRuB.js","/assets/warehouse-4SYNKIzK.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
