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

const BUILD = "2026-10-04T09:24:50.110Z";
const PRECACHE = ["/","/assets/AdminPanel-CAIFSM6S.js","/assets/AnalysisBoard-BuMIWJWd.js","/assets/Arc-BmqNtLf2.js","/assets/ArcLegacy-DpwIkUAT.js","/assets/BrigadirProfile-Dqh0-2K8.js","/assets/BroadcastReceivers-DHkDYXCi.js","/assets/BroadcastRecord-CtxGeYcQ.js","/assets/CatLockNotice-BRS4doVY.js","/assets/CategoryLegendModal-BOkjD5UV.js","/assets/CellConcerns-CSv3gvM1.js","/assets/CellDetails-CrvuCQkU.js","/assets/CellFormModal-De1NhHj0.js","/assets/CellIdent-Bzsy6gDz.js","/assets/CellLink-D8kzPzeX.js","/assets/Cells-BWl0sDVk.js","/assets/ColumnFilter-ZVUV6JNP.js","/assets/ColumnsPicker-ByQA4XdW.js","/assets/CommentsModal-41P4e8uX.js","/assets/ComparisonTable-BV45tu-4.js","/assets/Concerns-DJ-5QXPp.js","/assets/ConfirmDialog-B1Axdvs1.js","/assets/Daily-rea47b3L.js","/assets/DataTable-Dpy1z_4I.js","/assets/DateRangePicker-B7sLSbF_.js","/assets/DayReportView-gpZQIuGn.js","/assets/DayStepper-UjG_b08T.js","/assets/DifferenceBreakdown-DOBPoRNb.js","/assets/Downtime-CzI2v-42.js","/assets/Education-Ci7bYSNq.js","/assets/EducationLesson-D2WXso1-.js","/assets/EmptyState-B9kJbXNY.js","/assets/Exam-Di_TZaNR.js","/assets/FactorySelect-DcT5jblu.js","/assets/Gamification-CE295vy5.js","/assets/GroupBadge-BJY0QeDw.js","/assets/HeatmapChart-BGgWttkB.js","/assets/IdleCell-YXCAV3S4.js","/assets/KPICard-BqpUJu_s.js","/assets/Kaizen-BN5ce-25.js","/assets/Kelish-BWOIOrEu.js","/assets/KpiDeltaCard-CrSESSdI.js","/assets/LangTextInput-8xRO_VWO.js","/assets/Layout-Cd6gglMK.js","/assets/LeaderAppeal-CJktDkkf.js","/assets/LeaderDayReport-Cr_ih3v6.js","/assets/LeaderUnitReport-CzMPWBVO.js","/assets/Leaderboard-gK71fLjW.js","/assets/Leaders-Xfci3pVZ.js","/assets/Lightbox-CdxKEDjY.js","/assets/LiveOverview-znVEsXtd.js","/assets/Login-CZZq-N2K.js","/assets/NotFound-s5OCitmW.js","/assets/Notifications-BZsyrGvN.js","/assets/Overview-BGMVv_wQ.js","/assets/Pagination-gP2dexvJ.js","/assets/PerenaladkaFactTable-1YI5nL6N.js","/assets/PersonCard-aliK9SyF.js","/assets/PlanFulfillment-CZLNqMmI.js","/assets/Production-D6LDSLro.js","/assets/Profile-DXKcblp_.js","/assets/ProofCamera-pdaEndky.js","/assets/ProofPhoto-DB2P-7w0.js","/assets/Quality-DK81ytkN.js","/assets/RawRows-B9KcAqSP.js","/assets/RequestStateChip-uNlRdLlf.js","/assets/RichTextEditor-BzVtC_Ki.js","/assets/SaveState-C2S4tkE4.js","/assets/SearchInput-BX4T8YhQ.js","/assets/SeasonalityHeatmap-BnUBNfR-.js","/assets/SegmentedToggle-BYCbvPcO.js","/assets/SetupTimes-R9eAA-T1.js","/assets/ShiftDaily-DEY9SMXF.js","/assets/Staff-DLQn4CFd.js","/assets/StaffLive-BZmtM-Lb.js","/assets/StatusBadge-14Yhs5fw.js","/assets/TargetGoal-CrF9s4Eh.js","/assets/Targets-ByvJkBDF.js","/assets/Tasks-BwvG6cpI.js","/assets/TimeWheelPicker-BR_lR9QM.js","/assets/Toast-CuYaVcnv.js","/assets/Tooltip-VzlGxxeU.js","/assets/TrendChart-C1bOJrtJ.js","/assets/TripleSpeedometer-MuydvzJW.js","/assets/Trudoyomkost-BNzXNUh5.js","/assets/UploadDropzone-D2ONbePH.js","/assets/UsersActivity-Da-az7WW.js","/assets/VerdictBlock-DL1FzrqG.js","/assets/VfxAbsences-C8oT8Db-.js","/assets/VfxApiMap-D9JhazzM.js","/assets/VfxDevices-DHACE9JT.js","/assets/VfxDictionaries-Cn9LIgEP.js","/assets/VfxEmployees-BTW1Gf1L.js","/assets/VfxHrMoves-DGlK-WN0.js","/assets/VfxIncidents-DwhR_Edh.js","/assets/VfxJobs-BmSa6QOs.js","/assets/VfxMarks-D38KGXSC.js","/assets/VfxOnSite-BpAU42qQ.js","/assets/VfxPhoto-D5g3GwyV.js","/assets/VfxRequests-B0qdIEUo.js","/assets/VfxShifts-D4DC83lB.js","/assets/VfxState-B73X_D_N.js","/assets/VfxStructure-Dwrq5nNb.js","/assets/VfxTable-CdUe6RA6.js","/assets/VfxTimebooks-BLNcLXET.js","/assets/VfxTimesheet-DmdyxpzP.js","/assets/WatchProgress-izZd0moW.js","/assets/WebLogin-Dzz4eHue.js","/assets/WorkerConcerns-BdWeiisC.js","/assets/Workers-UH4Z3cFx.js","/assets/Zagruzka-C8rE_DCz.js","/assets/ZagruzkaCell-BCSvtFKt.js","/assets/api-DurE2TDT.js","/assets/archive-Do6uST9X.js","/assets/archive-restore-D2Np-FGw.js","/assets/arrow-down-BPlBPZHQ.js","/assets/arrow-left-o6332CKO.js","/assets/arrow-up-Cr73KjI9.js","/assets/arrow-up-narrow-wide-ByHWNd1D.js","/assets/arrow-up-right-BkiNZT5f.js","/assets/award-BNd6yvXT.js","/assets/ban-czkTk2WP.js","/assets/bot-DHeDIS2Y.js","/assets/boxes-DnS5icK2.js","/assets/braces-DSZx9cjn.js","/assets/brigadirFilters-BiTW4It4.js","/assets/broadcastTree-CtU_iVT-.js","/assets/building-2-DFt744On.js","/assets/calendar-GbXq1DDw.js","/assets/calendar-days-BXVAwOYt.js","/assets/camera-BcVJfg9t.js","/assets/categories-BlEnd9ps.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-GTVA4w7Y.js","/assets/chart-line-D-sNNEOa.js","/assets/chart-pie--yu6NQJ0.js","/assets/chartRange-C_qfZ53d.js","/assets/check-check-OOs4uPau.js","/assets/chevron-left-DHaAgCof.js","/assets/chevrons-up-down-Cb1gMUSf.js","/assets/circle-alert-cdKHp7Dz.js","/assets/circle-check-big-YyUPMIQU.js","/assets/circle-dashed-DkCH69MG.js","/assets/circle-kdbir7ZG.js","/assets/circle-minus-DeeY74GT.js","/assets/circle-question-mark-BHIeuw9i.js","/assets/circle-slash-wIIt5awI.js","/assets/circle-user-round-CKlodyYu.js","/assets/clock-3-2KoEMK1S.js","/assets/cloud-off-DJY1reMs.js","/assets/cloud-upload-Cs_v1X-O.js","/assets/compass-REnunV2-.js","/assets/concernCategories-Ch_WnVcX.js","/assets/copy-BBgebhJl.js","/assets/corner-down-right-laLKDCPg.js","/assets/createLucideIcon-C7_4Hfue.js","/assets/door-open-DSFw6Wl_.js","/assets/es-BQaIt3kq.js","/assets/exportXlsx-BbVBN0C7.js","/assets/external-link-DovqkGaJ.js","/assets/file-clock-DG2gLc-d.js","/assets/file-exclamation-point-B1O5nuQc.js","/assets/file-spreadsheet-DoI_wm94.js","/assets/file-text-DDtOoDyU.js","/assets/flag-D23iKfDg.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BXOLipmY.js","/assets/hash-JCSGzNCh.js","/assets/history-BDjwdDEX.js","/assets/hourglass-Dz9EMFWV.js","/assets/image-b0z7NuBs.js","/assets/image-off-CA2wZog8.js","/assets/index-B7RbwW6q.css","/assets/index-CLSPwTz-.js","/assets/key-round-bKdS7CEb.js","/assets/keyboard-BGs4br6u.js","/assets/languages-Bk4JWRrN.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-V5NyM4m-.js","/assets/lightbulb-DCxVL298.js","/assets/link-2-2TkW8CiD.js","/assets/link-2-off-bFuwated.js","/assets/list-filter-CfYoiRG4.js","/assets/list-ordered-C5gQSu2Y.js","/assets/list-tree-Ro48dzV5.js","/assets/lock-open-CngCMP1a.js","/assets/log-in-D9x9CWkh.js","/assets/maximize-2-lVVNt36e.js","/assets/message-square-CvsVh-wp.js","/assets/minimize-2-CMN-XaQI.js","/assets/package-check-_bDBKt-k.js","/assets/paperclip-CWFYRXZe.js","/assets/pencil-7aGw6qvt.js","/assets/percent-qUGNBlWB.js","/assets/phone-iUok-oWf.js","/assets/pin-CUWVjcb4.js","/assets/pin-off-D8oqzniL.js","/assets/play-B5KSMyIw.js","/assets/plug-zap-Bln8rKXK.js","/assets/presentation-yWEM02BM.js","/assets/prop-types-DzZj6QoP.js","/assets/radio-zC68Pc6b.js","/assets/react-apexcharts.esm-ZAs3_YsK.js","/assets/registers-Ck-6O8pD.js","/assets/repeat-Dln-cWJu.js","/assets/rotate-ccw-BzOltYGP.js","/assets/rotate-cw-Dc_WoNRr.js","/assets/save-v8KYMHuu.js","/assets/scopeLinks-DardIocI.js","/assets/scroll-text-rQWEUZyO.js","/assets/search-x-CEd9ThAu.js","/assets/segments-MiMpdtn0.js","/assets/send-pGA_LhBy.js","/assets/settings-2-C65iKwkM.js","/assets/shield-BXfADNDA.js","/assets/shield-alert-C32iGUV_.js","/assets/shield-check-B-CizZgd.js","/assets/shield-question-mark-Xyn7YRAl.js","/assets/snowflake-BO-O2_tq.js","/assets/split-DS1q_o1G.js","/assets/square-check-big-ZkKyYzC-.js","/assets/square-meDAxhVL.js","/assets/star-CrP9Xg1z.js","/assets/statusBands-B63W9_Ke.js","/assets/store-Cr60Prai.js","/assets/table-2-Dwp-S_HN.js","/assets/table-properties-BqKDmqfx.js","/assets/tag-DUSyHd42.js","/assets/tags-Du3xsvEW.js","/assets/timer-off-BFt5fusr.js","/assets/trending-down-C-Uk_ilC.js","/assets/trending-up-CHzc5_5L.js","/assets/undo-2-fKo2SMDS.js","/assets/useChartTheme-B8hqIYKF.js","/assets/useElementWidth-6NziHiwl.js","/assets/useIsMobile-DoV51f9b.js","/assets/useOpenParam-BEMeVX5v.js","/assets/useStatusBands-gaSWm-ZU.js","/assets/useUrlScope-CUc0loJ5.js","/assets/user-DKgyC_rQ.js","/assets/user-cog-mr4tPJUT.js","/assets/user-minus-CqXPMPMF.js","/assets/users-Bk8zqXtw.js","/assets/video-BMtni7uh.js","/assets/wallet-DufWO-RM.js","/assets/warehouse-BzgU64rK.js","/assets/x-O8EDy0cF.js","/assets/zap-Mkf-S_-6.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
