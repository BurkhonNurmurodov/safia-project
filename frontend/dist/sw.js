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

const BUILD = "2026-10-03T15:14:26.465Z";
const PRECACHE = ["/","/assets/AdminPanel-BYM6LYQM.js","/assets/AnalysisBoard-BHTeCO1P.js","/assets/Arc-CuwxRuV-.js","/assets/ArcLegacy-BjcsJ7tN.js","/assets/BrigadirProfile-B1eVYBbE.js","/assets/BroadcastReceivers-b4pzzBK-.js","/assets/BroadcastRecord-YGdcOmmR.js","/assets/CatLockNotice-KMd65qOc.js","/assets/CategoryLegendModal-nS2OXQIb.js","/assets/CellConcerns-DWEnQk0Y.js","/assets/CellDetails-B4J7R_cY.js","/assets/CellFormModal-BAwstJXZ.js","/assets/CellIdent-rqFRBVcD.js","/assets/CellLink-DVFD3Hpt.js","/assets/Cells-Bicq9Sxu.js","/assets/ColumnFilter-DXka5U48.js","/assets/ColumnsPicker-CDle5zOM.js","/assets/CommentsModal-B83C_b2G.js","/assets/ComparisonTable-BHHjQjdJ.js","/assets/Concerns-DjIzqg0T.js","/assets/ConfirmDialog-Cnjotevm.js","/assets/Daily-BLpHhYUJ.js","/assets/DataTable-8g9O_ubj.js","/assets/DateRangePicker-gYunrnEp.js","/assets/DayReportView-BUwVlXt_.js","/assets/DayStepper-4FLlxbCz.js","/assets/DifferenceBreakdown-C7TpQd3t.js","/assets/Downtime-BGpcj2P0.js","/assets/Education-BphEyVsx.js","/assets/EducationLesson-B7mLrTuk.js","/assets/EmptyState-CEIMHxTp.js","/assets/Exam-D4D188pC.js","/assets/FactorySelect-Bc9ZElK6.js","/assets/Gamification-7WIvNMFW.js","/assets/GroupBadge-_ZLvO4C2.js","/assets/HeatmapChart-CAFE_73O.js","/assets/IdleCell-BtJJO-Pf.js","/assets/KPICard-Cy0cxLtH.js","/assets/Kaizen-8qRTLRJB.js","/assets/Kelish-BJRqRJ3F.js","/assets/KpiDeltaCard-Cs8L2M3l.js","/assets/LangTextInput-Cs5GyF-o.js","/assets/Layout-Bx1wgZHV.js","/assets/LeaderAppeal-Pj3XLqav.js","/assets/LeaderDayReport-B9qomB8B.js","/assets/LeaderUnitReport-CHJfR1mW.js","/assets/Leaderboard-BXoNcJNA.js","/assets/Leaders-BV8X_ii5.js","/assets/Lightbox-DeqNZ7ka.js","/assets/LiveOverview-CM7vxulZ.js","/assets/Login-DxOqtVl6.js","/assets/NotFound-PTUpDn8z.js","/assets/Notifications-DAALMnxk.js","/assets/Overview-BU_SLGvF.js","/assets/Pagination-3ActKnYr.js","/assets/PerenaladkaFactTable-SMOmqO-T.js","/assets/PersonCard-BDkLg6di.js","/assets/PlanFulfillment-BkKA7uNb.js","/assets/Production-DqxfrnXk.js","/assets/Profile-D9S6r9w0.js","/assets/ProofCamera-BUhkiVI9.js","/assets/ProofPhoto-BTJRMaGf.js","/assets/Quality-DGMC6YK2.js","/assets/RawRows-gAv55qY3.js","/assets/RequestStateChip-jWthJ9sB.js","/assets/RichTextEditor-DoV6fAF2.js","/assets/SaveState-CgBZuDm3.js","/assets/SearchInput-tsGPhxR4.js","/assets/SeasonalityHeatmap-CZYlQAgK.js","/assets/SegmentedToggle-DN05-KRx.js","/assets/SetupTimes-DUQ7bZGh.js","/assets/ShiftDaily-DzC2_DsG.js","/assets/Staff-BjjXIQrE.js","/assets/StaffLive-BcJ6XFJg.js","/assets/StatusBadge-B1knsMX5.js","/assets/TargetGoal-BTHI2pPX.js","/assets/Targets-CjiV5j2I.js","/assets/Tasks-CV7Po-Ao.js","/assets/TimeWheelPicker-DBGSQpHt.js","/assets/Toast-j06FjzwO.js","/assets/Tooltip-ClL2NVDI.js","/assets/TrendChart-Cwo2tnWU.js","/assets/TripleSpeedometer-CGj-nlCP.js","/assets/Trudoyomkost-KgaqOdF0.js","/assets/UploadDropzone-6z8S-jNn.js","/assets/UsersActivity-DBjtbkUQ.js","/assets/VerdictBlock-CtXHNYah.js","/assets/VfxAbsences-C0lc7AmT.js","/assets/VfxApiMap-Cf2TaL07.js","/assets/VfxDevices-22GcpJkJ.js","/assets/VfxDictionaries-CfepshqR.js","/assets/VfxEmployees-PvYMFn4z.js","/assets/VfxHrMoves-D5r90I_y.js","/assets/VfxIncidents-a3C8BfaJ.js","/assets/VfxJobs-DdC6K6L8.js","/assets/VfxMarks-C-J1jIsg.js","/assets/VfxOnSite-CYJXLirD.js","/assets/VfxPhoto-C3BuPbDR.js","/assets/VfxRequests-BcEcbg9C.js","/assets/VfxShifts-CynocMQb.js","/assets/VfxState-BcRhiXCC.js","/assets/VfxStructure-B_9FfA4L.js","/assets/VfxTable-Biu1Eds1.js","/assets/VfxTimebooks-DyV98gbQ.js","/assets/VfxTimesheet-1BBm9wC3.js","/assets/WatchProgress-BdkWf282.js","/assets/WebLogin-DD_nolqE.js","/assets/WorkerConcerns-FthhPCwQ.js","/assets/Workers-BjOrhnka.js","/assets/Zagruzka-BVVALQbW.js","/assets/ZagruzkaCell-DkQhJoCp.js","/assets/api-BMYBY2Dv.js","/assets/archive-DPvOJYwy.js","/assets/archive-restore-9yuvgMFS.js","/assets/arrow-down-BVpDSoCI.js","/assets/arrow-left-C0LluzlC.js","/assets/arrow-up-Detnd7yg.js","/assets/arrow-up-narrow-wide-B_epacw_.js","/assets/arrow-up-right-B-ad2vh7.js","/assets/award-C0XADSGd.js","/assets/ban-_NV3iY4s.js","/assets/bot-Bi9cDwdW.js","/assets/boxes-BQlQapag.js","/assets/braces-Dx53ROld.js","/assets/brigadirFilters-CePNV8tb.js","/assets/broadcastTree-jGSIZXS8.js","/assets/building-2-CkmQRUwr.js","/assets/calendar-DVFMzl88.js","/assets/calendar-days-BNJMSyBG.js","/assets/camera-BJ17dzZF.js","/assets/categories-wPWUGRxv.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CO0z-HGe.js","/assets/chart-line-DfYIhAHg.js","/assets/chart-pie-CwHvPotO.js","/assets/chartRange-DWu-wCgH.js","/assets/chevron-left-vmHso981.js","/assets/chevrons-up-down-D36DieQt.js","/assets/circle-CzPPxppZ.js","/assets/circle-alert-BvBGh6JY.js","/assets/circle-check-big-Fx9YzUFP.js","/assets/circle-dashed-GeX6lIML.js","/assets/circle-minus-BRZyoZg_.js","/assets/circle-question-mark-CJWv6DPK.js","/assets/circle-slash-6nCl0XM6.js","/assets/circle-user-round-DBbQy3OB.js","/assets/clock-3-D1PsD2Fk.js","/assets/cloud-off-DDrej_fb.js","/assets/cloud-upload-Kr3YSieR.js","/assets/compass-BgJbuvKw.js","/assets/concernCategories-D1YVsK1U.js","/assets/copy-CJruOr2L.js","/assets/corner-down-right-DGTqxXBl.js","/assets/createLucideIcon-BL7c4Ubg.js","/assets/door-open-CI9UqHoG.js","/assets/es-B9l3uCkD.js","/assets/exportXlsx-DX4u6eHv.js","/assets/external-link-CrFOIAAm.js","/assets/file-clock-CTmLsBxB.js","/assets/file-exclamation-point-DWV34xdr.js","/assets/file-spreadsheet-CjNT9R0H.js","/assets/file-text-BT5aotys.js","/assets/flag-B0lqFUS1.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BX7RPar6.js","/assets/hash-BOBzSJ-9.js","/assets/history-DItYMZMU.js","/assets/hourglass-DQx54T-f.js","/assets/image-DjQwyUIY.js","/assets/image-off-yCjnjzrU.js","/assets/index-Nq8PP9xw.js","/assets/index-YBeOcWwc.css","/assets/key-round-CGDg2PXI.js","/assets/keyboard-B66j2pr_.js","/assets/languages-FZ9Tsrxj.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BqojSmuF.js","/assets/lightbulb-CcfZ-GBN.js","/assets/link-2-m1j68DRA.js","/assets/link-2-off-DFkhVUjp.js","/assets/list-ordered-lZ6r6lvL.js","/assets/list-tree-25CrqZNL.js","/assets/lock-open-Bh5rr7TL.js","/assets/log-in-P2I0fgV9.js","/assets/maximize-2-yXvTsPww.js","/assets/message-square-B2M4J1sA.js","/assets/minimize-2-DICfjDEL.js","/assets/package-check-CS0KRsXE.js","/assets/paperclip-HLyjQrkV.js","/assets/pencil-jSl-qjOX.js","/assets/percent-DoKVXFyZ.js","/assets/phone-B4NG9fQS.js","/assets/pin-kei_2M-4.js","/assets/pin-off-cVBnPDvz.js","/assets/play-CPOD9p2C.js","/assets/plug-zap-xfZUOMww.js","/assets/presentation-DHUZTa_l.js","/assets/prop-types-2lAFvUNm.js","/assets/radio-DQqhrgVV.js","/assets/react-apexcharts.esm-DIX3Usov.js","/assets/registers-BAD-SQTg.js","/assets/repeat-DjMQirM1.js","/assets/rotate-ccw-DJkBCUmj.js","/assets/rotate-cw-Cq9UUlns.js","/assets/save-BZkXTgYn.js","/assets/scopeLinks-BPLIyYwZ.js","/assets/scroll-text-Dhewwh4I.js","/assets/search-x-CQxZ7ifk.js","/assets/segments-C9z8bk6w.js","/assets/send-CMHefgF9.js","/assets/settings-2-DIfRajpz.js","/assets/shield-CMhJzIgp.js","/assets/shield-alert-CDszuQmI.js","/assets/shield-check-CzKdMhm-.js","/assets/shield-question-mark-BRt3jrPt.js","/assets/snowflake-DB9RtM0H.js","/assets/split-B2-l78yq.js","/assets/square-CtDAV2l1.js","/assets/square-check-big-BSD1OXqI.js","/assets/star-DeSXElHh.js","/assets/statusBands-BKT40OIZ.js","/assets/store-CPEbslda.js","/assets/table-2-Dc-gW2Cr.js","/assets/table-properties-Dl3fTx3O.js","/assets/tag-CXqKTi0d.js","/assets/tags-Bt4X0LSJ.js","/assets/timer-off-BQl60LMP.js","/assets/trending-down-qzZomhyD.js","/assets/trending-up-AVcEd-Dl.js","/assets/undo-2-CgsfZeHk.js","/assets/useChartTheme-CoH6XJyu.js","/assets/useElementWidth-sP7hKdLV.js","/assets/useIsMobile-QtXigmDS.js","/assets/useOpenParam-BNbXfj3D.js","/assets/useStatusBands-D7NnRopu.js","/assets/useUrlScope-HxdaeTJ8.js","/assets/user-D5cSHzAL.js","/assets/user-cog-BFF1Hcrb.js","/assets/user-minus-DoEvZUSN.js","/assets/users-3eWwaZUG.js","/assets/video-CJZrZrS3.js","/assets/wallet-D8MfM6Ar.js","/assets/warehouse-CaIGHNC3.js","/assets/x-CW0_t7lL.js","/assets/zap-B6f-oTHY.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
