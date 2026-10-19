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

const BUILD = "2026-10-19T07:48:25.223Z";
const PRECACHE = ["/","/assets/AdminPanel-CMg_tXdS.js","/assets/AnalysisBoard-BeqAh2wh.js","/assets/Arc-D0paA79U.js","/assets/Assistant-BijG45BB.js","/assets/BrigadirProfile-Vgyso2zN.js","/assets/BroadcastReceivers-DZtAB3vf.js","/assets/BroadcastRecord-DVkDARzd.js","/assets/Button-BfL1TIaK.js","/assets/CatLockNotice-DubdMw2E.js","/assets/CategoryLegendModal-BFFzdrXn.js","/assets/CellConcerns-BzHHDfTg.js","/assets/CellDetails-dbsnGaaM.js","/assets/CellFormModal-BcPIHVCh.js","/assets/CellIdent-Dx92-5lV.js","/assets/CellLink-CP3vFzSP.js","/assets/Cells-BbNSoxZX.js","/assets/ColumnFilter-SMgdoitq.js","/assets/ColumnsPicker-C1MEF6gx.js","/assets/CommentsModal-lpJo26bs.js","/assets/ComparisonTable-D6wJWIBE.js","/assets/Concerns-olAMEIZQ.js","/assets/CountStepper-8SxvFfyf.js","/assets/Daily-Wg29nuu7.js","/assets/DataTable-BBc6Dptn.js","/assets/DateRangePicker-DNrboEQo.js","/assets/DayReportView-C_LazYJW.js","/assets/DayStepper-DX31uwR2.js","/assets/DifferenceBreakdown-D38WVDpY.js","/assets/Downtime-UuzV-AOK.js","/assets/Education-DEJhCRIX.js","/assets/EducationLesson-BPJOVbiD.js","/assets/EmptyState-CScKGlYt.js","/assets/Exam-CHDlzxKh.js","/assets/FactorySelect-WePfLGaJ.js","/assets/Gamification-6LJa4zN9.js","/assets/GroupBadge-CBfFcDyP.js","/assets/HeatmapChart-B8M5_zrZ.js","/assets/IdleCell-CsvnvHsw.js","/assets/KPICard-DDzK9JA_.js","/assets/Kaizen-gXLISKFz.js","/assets/Kelish-B0c2JjYe.js","/assets/KpiDeltaCard-BbmPLPTs.js","/assets/LangTextInput-AMswbA7Y.js","/assets/Layout-K9hLlSo6.js","/assets/LeaderAppeal-CSEZlmLN.js","/assets/LeaderDayReport-C_1wZR7J.js","/assets/LeaderUnitReport-_CADNftc.js","/assets/Leaderboard-W0An9zP3.js","/assets/Leaders-D0Fk2Iqn.js","/assets/LeadersKpi-arIs6fVP.js","/assets/Lightbox-CHnnFs5g.js","/assets/LiveOverview-CTu_EEo6.js","/assets/Login-C233TzpD.js","/assets/NotFound-DId1T7FV.js","/assets/Notifications-5kJuUtAR.js","/assets/Overview-xuzrLw-Z.js","/assets/Pagination-DJi_I7lp.js","/assets/PerenaladkaFactTable-VRtxHE2G.js","/assets/PersonCard-Bi157jze.js","/assets/PlanFulfillment-yLpSR8Aj.js","/assets/Production-CVwkHaK3.js","/assets/Profile-DGm3G4rD.js","/assets/ProofCamera-vdOemf3W.js","/assets/ProofPhoto-DDLIz4du.js","/assets/Quality-f9eKBwFs.js","/assets/RawRows-cVc2otPt.js","/assets/RequestStateChip-Fe6RBvld.js","/assets/RichTextEditor-C5uu9Dl-.js","/assets/SaveState-LejFUPV4.js","/assets/SearchInput-DylV-oes.js","/assets/SeasonalityHeatmap-DVzphFWw.js","/assets/SegmentedToggle-vuusL778.js","/assets/SetupTimes-DRD4-roz.js","/assets/ShiftDaily-CGT1_Hn8.js","/assets/Staff-BhJZSNAI.js","/assets/StaffListAtCheck-SWDFCQ4o.js","/assets/StatusBadge-CUHx5anu.js","/assets/TargetGoal-hJ8yYRFr.js","/assets/Targets-DOcpUZAD.js","/assets/Tasks-BW_WRsx2.js","/assets/TimeWheelPicker-CkC6Kup9.js","/assets/Toast-IUqMDlp9.js","/assets/Tooltip-D4e7Jm1W.js","/assets/TrendChart-C4vnu3T_.js","/assets/TripleSpeedometer-SjIsB4a8.js","/assets/Trudoyomkost-GPWIUiUL.js","/assets/UploadDropzone-BhzVNmn7.js","/assets/UsersActivity-BbNGJNFj.js","/assets/VerdictBlock-D5c0iQpp.js","/assets/VfxApiMap-CQn6EaKT.js","/assets/VfxDictionaries-CNF6p3Yg.js","/assets/VfxEmployees-CnyB8Www.js","/assets/VfxHrMoves-Byp9LU4c.js","/assets/VfxJobs-DIG8ORoQ.js","/assets/VfxPhoto-DZ1oEJFd.js","/assets/VfxShifts-OXAr3p1n.js","/assets/VfxState-CFg2Ttqp.js","/assets/VfxTimebooks-Dn92Xoux.js","/assets/VfxTimesheet-D6RAdVf4.js","/assets/WatchProgress-DbY5-iBv.js","/assets/WebLogin-p39uxTam.js","/assets/Workers-B405NUMK.js","/assets/Zagruzka-CWeCtEog.js","/assets/ZagruzkaCell-Dm1Xsnz9.js","/assets/api-BM2sZ5HV.js","/assets/archive-BHXT3Bbm.js","/assets/archive-restore-lLFKEsna.js","/assets/arrow-down-BkV8GmNu.js","/assets/arrow-down-wide-narrow-eR5uWwV0.js","/assets/arrow-up-narrow-wide-BqfwMW07.js","/assets/ban-DF9SGO-Q.js","/assets/boxes-DoOXAnsX.js","/assets/braces-BKs9EJuq.js","/assets/brigadirFilters-_tK6zaCM.js","/assets/broadcastTree-IZ3hCqhm.js","/assets/building-2-_sjYr9gY.js","/assets/calculator-B2T8YIpL.js","/assets/calendar-D644Y2S4.js","/assets/calendar-days-BjROgRTg.js","/assets/camera-6FQPg3ps.js","/assets/categories-DGfjiRUu.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cfw3n9Zp.js","/assets/chart-line-DkmRSrl1.js","/assets/chart-pie-KNNM60U7.js","/assets/chartRange-NDH8DsxS.js","/assets/check-check-nglryV2E.js","/assets/chevron-left-DdlpCTe8.js","/assets/chevrons-up-down-ii_BE_RV.js","/assets/circle-D8xtf15F.js","/assets/circle-alert-BO3ju6K3.js","/assets/circle-check-big-C_DEYXF1.js","/assets/circle-dashed-wm01FOX0.js","/assets/circle-minus-DJ6BFYmy.js","/assets/circle-question-mark-CYaH0tc1.js","/assets/circle-slash-9QFfZwjv.js","/assets/circle-user-round-Bo8TePG0.js","/assets/cloud-off-BVWSwEGO.js","/assets/cloud-upload-DU8SSEep.js","/assets/compass-uO4x0ovh.js","/assets/concernCategories-Ox8t_r5I.js","/assets/corner-down-right-CrJ6MS9r.js","/assets/createLucideIcon-2k-GHvji.js","/assets/es-23TvgUEb.js","/assets/external-link-CN2rTPHg.js","/assets/file-clock-B0lVCJNw.js","/assets/file-exclamation-point-C2uPR4S5.js","/assets/flag-toNpqlN9.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-djr_zSar.js","/assets/hash-CYMPj3-d.js","/assets/hourglass-1j0p_eVL.js","/assets/image-ClepQy8g.js","/assets/image-off-DUN1klXv.js","/assets/inbox-CfeG9ePG.js","/assets/index-BhzH19q6.css","/assets/index-C3wI02tS.js","/assets/keyboard-D7uURKu7.js","/assets/languages-DN3kFFv8.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CpJbub9j.js","/assets/lightbulb-CNhRzCtA.js","/assets/link-2-DfR3pDqh.js","/assets/link-2-off-Dvs5mLtC.js","/assets/list-ordered-Bduve9u6.js","/assets/list-tree-DxBdW5e0.js","/assets/lock-open-CY-0DZvY.js","/assets/log-in-5qCfdaCv.js","/assets/marks-Bj5wNvmE.js","/assets/minimize-2-CFlPN0zo.js","/assets/package-check-CUOeUw-f.js","/assets/pencil-BkD-5U4-.js","/assets/percent-BG_BBS1D.js","/assets/pin-D8pwMScf.js","/assets/pin-off-DXg4j_aU.js","/assets/play-DJEHo9uE.js","/assets/plug-zap-8U7iEzE5.js","/assets/prop-types-D8hn-wws.js","/assets/radio-C844wjTy.js","/assets/react-apexcharts.esm-CwTFitCG.js","/assets/registers-DVYQ2ovx.js","/assets/repeat-DcVpzBCh.js","/assets/save-Bfa4gTia.js","/assets/scopeLinks-CYP0pEvN.js","/assets/scroll-text-DFzD5kM6.js","/assets/search-x-CgIBnJn5.js","/assets/segments-o5JBMM-J.js","/assets/send-DP7x8Ts4.js","/assets/settings-2-D_KRhC5U.js","/assets/shield-NALwfa9Y.js","/assets/shield-alert-B631Fyy0.js","/assets/shield-question-mark-Bhf5F3wO.js","/assets/siren-Bw2qlnRI.js","/assets/snowflake-Db_P6lHR.js","/assets/split-DlWarnJa.js","/assets/square-check-big-DRD48qFm.js","/assets/star-NYPK1E2u.js","/assets/statusBands-C5y3Ti7C.js","/assets/store-CRbUbBxG.js","/assets/table-2-JltYu1zz.js","/assets/table-properties-CCyqwY3-.js","/assets/tag-wyxiNR0f.js","/assets/timer-off-vjCEZ_SE.js","/assets/trending-down-B9e0hGlL.js","/assets/trending-up-De_5-Rko.js","/assets/undo-2-DS6UV90y.js","/assets/useChartTheme-w9YsS4l_.js","/assets/useElementWidth-DD7qt-hV.js","/assets/useIsMobile-DyPBh3rt.js","/assets/useOpenParam-xBMwax9N.js","/assets/useStatusBands-BDY6ka0H.js","/assets/useUrlScope-_3yfS1pX.js","/assets/user-BrfTU_kG.js","/assets/user-cog-7vbbIO42.js","/assets/user-minus-KcOAYTK1.js","/assets/users-Y1P0Istz.js","/assets/vfx-C_Gfuwlq.js","/assets/video-DnAPKmbR.js","/assets/wallet-fkU3Y4Pr.js","/assets/warehouse-p1U6sQJw.js","/assets/workflow-DuwV7ATl.js","/assets/x-BQTuuZnr.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
