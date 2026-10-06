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

const BUILD = "2026-10-06T05:09:16.697Z";
const PRECACHE = ["/","/assets/AdminPanel-DnVBQB6f.js","/assets/AnalysisBoard-B83jf3Xx.js","/assets/Arc-CRoZqgVb.js","/assets/Assistant-DJG55MPq.js","/assets/BrigadirProfile-CiRsNXPt.js","/assets/BroadcastReceivers-eLmDwaaF.js","/assets/BroadcastRecord-B3eMjtyP.js","/assets/Button-Bn751TbE.js","/assets/CatLockNotice-CXHzwf01.js","/assets/CategoryLegendModal-P9SzUJxy.js","/assets/CellConcerns-DvXCReAy.js","/assets/CellDetails-CyLIxRun.js","/assets/CellFormModal-cIm0Vnpk.js","/assets/CellIdent-gAqHG6pk.js","/assets/CellLink-CXmaUhyB.js","/assets/Cells-CeWZrfpG.js","/assets/ColumnFilter-Cvk1G4gX.js","/assets/ColumnsPicker-Dc-h-p_v.js","/assets/CommentsModal-CjyixViu.js","/assets/ComparisonTable-BUoO6zqW.js","/assets/Concerns-C0-4FciZ.js","/assets/Daily-C9b3MDcz.js","/assets/DataTable-Bf18V3Jj.js","/assets/DateRangePicker-BOZeZh95.js","/assets/DayReportView-Ds6DgFdJ.js","/assets/DayStepper-CE8OSs_J.js","/assets/DifferenceBreakdown-BsDuzP8N.js","/assets/Downtime-BTBTfyAP.js","/assets/Education-CxAS8Xpe.js","/assets/EducationLesson-PLVwsb-O.js","/assets/EmptyState-B2jFgBV9.js","/assets/Exam-C4Wks_0l.js","/assets/FactorySelect-BjgrsfU2.js","/assets/Gamification-Dko1OumF.js","/assets/GroupBadge-CIb9CVVL.js","/assets/HeatmapChart-Cu11JZTH.js","/assets/IdleCell-C0nhpc34.js","/assets/KPICard-CW8ud9A5.js","/assets/Kaizen-CghHtuk0.js","/assets/Kelish-BRlLVBIx.js","/assets/KpiDeltaCard-EE6icpbX.js","/assets/LangTextInput-BgLTuFMq.js","/assets/Layout-XCZEw5lD.js","/assets/LeaderAppeal-ByCQpjeg.js","/assets/LeaderDayReport-NedSJJ-0.js","/assets/LeaderUnitReport-pBm82Ozt.js","/assets/Leaderboard-C1xJiLQB.js","/assets/Leaders-Bqq89QxJ.js","/assets/Lightbox-Fm2Pi7Lh.js","/assets/LiveOverview-D30eqlE1.js","/assets/Login-io8597VC.js","/assets/NotFound-CC_Fxt5b.js","/assets/Notifications-BjELAmot.js","/assets/Overview-ZHscaUSV.js","/assets/Pagination-D31OBR-F.js","/assets/PerenaladkaFactTable-DYZX5SSS.js","/assets/PersonCard-CqOwhSP8.js","/assets/PlanFulfillment-DnNs3CtD.js","/assets/Production-D6WWX8OE.js","/assets/Profile-Ceo4-C4f.js","/assets/ProofCamera-BzWZR1-n.js","/assets/ProofPhoto-DjtRZbs3.js","/assets/Quality-uAFBwCEW.js","/assets/RawRows-m_Vwjnn2.js","/assets/RequestStateChip-CtyX69wb.js","/assets/RichTextEditor-BsaC5Xxq.js","/assets/SaveState-BWsKZuUf.js","/assets/SearchInput-C37tOqQR.js","/assets/SeasonalityHeatmap-CQn4lNeI.js","/assets/SegmentedToggle-D05Si9aN.js","/assets/SetupTimes-BktsA66O.js","/assets/ShiftDaily-DDPdVyqI.js","/assets/Staff-u6WvH9MZ.js","/assets/StaffLive-C82ENr4U.js","/assets/StatusBadge-CJBuUqOP.js","/assets/TargetGoal-uEW5H41w.js","/assets/Targets-Du02580m.js","/assets/Tasks-DSCiCc1V.js","/assets/TimeWheelPicker-D7EgfmlG.js","/assets/Toast-Dhp00VJH.js","/assets/Tooltip-XqUFxKBe.js","/assets/TrendChart-CrpVD9eC.js","/assets/TripleSpeedometer-C0tdElLD.js","/assets/Trudoyomkost-DAtdXZaX.js","/assets/Turnover-sm9boSTX.js","/assets/UploadDropzone-CfSlOnYE.js","/assets/UsersActivity-BD-Y3Pav.js","/assets/VerdictBlock-DS3VEBrf.js","/assets/VfxApiMap-DiTh7_4P.js","/assets/VfxDictionaries-CTfqhhvc.js","/assets/VfxEmployees-Bn450Au3.js","/assets/VfxHrMoves-DGRZkiSk.js","/assets/VfxJobs-DJP3EGgL.js","/assets/VfxPhoto-CkoJGFyE.js","/assets/VfxShifts-jtGWK4wo.js","/assets/VfxState-ikO8GIzR.js","/assets/VfxTimebooks-uaL58Qp3.js","/assets/VfxTimesheet-ChayBvDw.js","/assets/WatchProgress-aEEdEn6K.js","/assets/WebLogin-C71sL8zQ.js","/assets/WorkerConcerns-BjGys4TR.js","/assets/Workers-DjZ1O7S3.js","/assets/Zagruzka-BYAfsy6p.js","/assets/ZagruzkaCell-BN4jiDkn.js","/assets/api-D69v9fO4.js","/assets/archive-nW8-HfOk.js","/assets/archive-restore-CW7owXrj.js","/assets/arrow-down-CtLFTYiD.js","/assets/arrow-up-narrow-wide-DHqeat7V.js","/assets/award-BrFUmaMG.js","/assets/ban-CGiOZob1.js","/assets/boxes-N703oRLx.js","/assets/braces-XezduJGe.js","/assets/brigadirFilters-ChFvo23C.js","/assets/broadcastTree-B5H5YHmB.js","/assets/building-2-bxxqCkUW.js","/assets/calculator-Of_U7gFE.js","/assets/calendar-C5GWltfi.js","/assets/calendar-days-B7xIgCH3.js","/assets/camera-px5Gj7Wd.js","/assets/categories-BQ7JHqyP.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CwVUhysR.js","/assets/chart-line-DneL7W0l.js","/assets/chart-pie-Di_MVzC3.js","/assets/chartRange-73S2p-In.js","/assets/check-check-Ca9dYEG3.js","/assets/chevron-left-Zj7iO2L0.js","/assets/chevrons-up-down-Bw3CGyGh.js","/assets/circle-Bdg1l7eO.js","/assets/circle-alert-vZFEi8uE.js","/assets/circle-check-big-MBNmr6Rl.js","/assets/circle-dashed--2XFjsVQ.js","/assets/circle-minus-B16wKMZF.js","/assets/circle-question-mark-OCoghKOO.js","/assets/circle-slash-BaMatjKQ.js","/assets/circle-user-round-DzGCERuO.js","/assets/clock-3-xGNC3Exe.js","/assets/cloud-off-oxU5C9wt.js","/assets/cloud-upload-0A5Ba3cA.js","/assets/compass-Cdt3ZZw6.js","/assets/concernCategories-BHqquDR4.js","/assets/copy-XxGVgFbS.js","/assets/corner-down-right-DgL3hnEl.js","/assets/createLucideIcon-Cve4aFP-.js","/assets/es-Cc-dYEdp.js","/assets/external-link-6Z1gDtG1.js","/assets/file-clock-BGWtSeei.js","/assets/file-exclamation-point-pLdCUk8f.js","/assets/flag-bAOqSXn_.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Dcjq0RW_.js","/assets/hash-BC8UkQ3K.js","/assets/hourglass-BUpP8qt-.js","/assets/image-FHl-tyKu.js","/assets/image-off-C88tCfvu.js","/assets/inbox-QxUKxxFU.js","/assets/index-BKM2gJ54.css","/assets/index-D33KVQAZ.js","/assets/keyboard-_1lMoznz.js","/assets/languages-D1fnEhTT.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CDgtfiGd.js","/assets/lightbulb-jOD1whLG.js","/assets/link-2-DuMV89PL.js","/assets/link-2-off-Cl6vNgaq.js","/assets/list-ordered-DrQLU1RG.js","/assets/list-tree-C6OIhTTf.js","/assets/lock-open-lqnvCsCw.js","/assets/log-in-BmussUiL.js","/assets/minimize-2-CsNCJ2La.js","/assets/package-check-B4axYA8B.js","/assets/pencil-C6Scvvd8.js","/assets/percent-DzkLuj5n.js","/assets/pin-0f5uG9Nf.js","/assets/pin-off-DVYzg7xD.js","/assets/play-D02FLJoM.js","/assets/plug-zap-BmKk9XaK.js","/assets/prop-types-Dqp_3Xz2.js","/assets/react-apexcharts.esm-BVRHnKBO.js","/assets/registers-Cewo8N5D.js","/assets/repeat-BLrlj9RO.js","/assets/rotate-cw-galqYhYM.js","/assets/save-CUBh5DNs.js","/assets/scopeLinks-BjTJHLUk.js","/assets/scroll-text-Crsvxe0w.js","/assets/search-x-CWtHw7-f.js","/assets/segments-BDdE2KuP.js","/assets/send-C8Shc9Ys.js","/assets/settings-2-BmuP9tV2.js","/assets/shield-DlKHQ4nl.js","/assets/shield-alert-CtNEJjc_.js","/assets/shield-question-mark-C7Sr5P8-.js","/assets/siren-9A3JJSsZ.js","/assets/snowflake-Cy08lce1.js","/assets/split-BahKnBYg.js","/assets/square-check-big-DWP5OpzN.js","/assets/star-BunrtCRj.js","/assets/statusBands-D21VqaqM.js","/assets/store-BRUKwLLo.js","/assets/table-2-zA7vVE59.js","/assets/table-properties-oiPQTIsz.js","/assets/tag-fw_tq4Dx.js","/assets/timer-off-BN_vrZ-9.js","/assets/trending-down-eVE0ZvTP.js","/assets/trending-up-frNM5CwT.js","/assets/undo-2-DriRH2ut.js","/assets/useChartTheme-DjwBLkdF.js","/assets/useElementWidth-B3H5etsB.js","/assets/useIsMobile-BMwDNmDB.js","/assets/useOpenParam-Dt0zTu2t.js","/assets/useStatusBands-gvvNdWap.js","/assets/useUrlScope-B9TizIOC.js","/assets/user-DvR3BQKi.js","/assets/user-cog-DLiNTNWE.js","/assets/users-BbOllSPh.js","/assets/vfx-BMxdSwWS.js","/assets/video-CBKu0GP-.js","/assets/wallet-CSHr7bZ0.js","/assets/warehouse-ByVUbipB.js","/assets/x-BRasYq3q.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
