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

const BUILD = "2026-10-12T11:04:41.528Z";
const PRECACHE = ["/","/assets/AdminPanel-BzPW-MK1.js","/assets/AnalysisBoard-BJZHtOZw.js","/assets/Arc-DaxexCeh.js","/assets/Assistant-oa6yN67X.js","/assets/BrigadirProfile--WF-Zpg7.js","/assets/BroadcastReceivers-CvpDjVzo.js","/assets/BroadcastRecord-vo3L701C.js","/assets/Button--ro9LBqz.js","/assets/CatLockNotice-BAu_7tCW.js","/assets/CategoryLegendModal-wRoJvD5E.js","/assets/CellConcerns-qGLtoR7Q.js","/assets/CellDetails-QFIqUBx9.js","/assets/CellFormModal-Bd6G0zCI.js","/assets/CellIdent-cGKuT3Ew.js","/assets/CellLink-Bik0-iZh.js","/assets/Cells-BCJbsu8m.js","/assets/ColumnFilter-CkRmcUx9.js","/assets/ColumnsPicker-ByMIAayR.js","/assets/CommentsModal-D8g01e_w.js","/assets/ComparisonTable-BLKcBrqs.js","/assets/Concerns-uwQjLI1U.js","/assets/Daily-B2A2Kt88.js","/assets/DataTable-D28hKR-3.js","/assets/DateRangePicker-upqPyi-4.js","/assets/DayReportView-Ce9_qfuu.js","/assets/DayStepper-iET_D4Jz.js","/assets/DifferenceBreakdown-BZX0fPxd.js","/assets/Downtime-Bl98gSnc.js","/assets/Education-BXqXMO2A.js","/assets/EducationLesson-zYG2bRYN.js","/assets/EmptyState-WP9eUgvh.js","/assets/Exam-tzPlz87H.js","/assets/FactorySelect--26zJ-U6.js","/assets/Gamification-BtbZMume.js","/assets/GroupBadge-BzKayfoC.js","/assets/HeatmapChart-CrJGflS8.js","/assets/IdleCell-qX-3Q-bc.js","/assets/KPICard-B-YH3C2T.js","/assets/Kaizen-LTlLmqTv.js","/assets/Kelish-CuTYKkFb.js","/assets/KpiDeltaCard-DAbn9R8c.js","/assets/LangTextInput-CZ7XW5-H.js","/assets/Layout-CKqJiDiO.js","/assets/LeaderAppeal-CWcJuM0F.js","/assets/LeaderDayReport-C29HnNA7.js","/assets/LeaderUnitReport-BZwHq31s.js","/assets/Leaderboard-D8tl4eJU.js","/assets/Leaders-rA2cwEe-.js","/assets/Lightbox-BEBQq402.js","/assets/LiveOverview-DHsOfFAJ.js","/assets/Login-ChShn5YL.js","/assets/NotFound-Cjnf68pj.js","/assets/Notifications-CoOwqhzp.js","/assets/Overview-BWAzj-Yu.js","/assets/Pagination-BQLR7dxt.js","/assets/PerenaladkaFactTable-BL3CcRcd.js","/assets/PersonCard-VMQSdAWy.js","/assets/PlanFulfillment-FUCpzsrv.js","/assets/Production-CoEOXmYP.js","/assets/Profile-B6NLVNND.js","/assets/ProofCamera-Beb89ItV.js","/assets/Quality-DY0tcrkR.js","/assets/RawRows-CGMJYwA4.js","/assets/RequestStateChip-NIuRIwEs.js","/assets/RichTextEditor-Ct1weZM-.js","/assets/SaveState-BGvv0THO.js","/assets/SearchInput-61DHHNOD.js","/assets/SeasonalityHeatmap-Dy5-xd8M.js","/assets/SegmentedToggle-DrwBwr-O.js","/assets/SetupTimes-7FAkCL_R.js","/assets/ShiftDaily-CEpYFGs-.js","/assets/Staff-O_3lM--I.js","/assets/StaffListAtCheck-C3Ej_dHn.js","/assets/StatusBadge-DRPDLZyw.js","/assets/TargetGoal-B-uhKV14.js","/assets/Targets-C1QuKidg.js","/assets/Tasks-SQkUBKLS.js","/assets/TimeWheelPicker-QxIN4YY-.js","/assets/Toast-D1CF2Sgc.js","/assets/Tooltip-BmJtjBDk.js","/assets/TrendChart-Cu3wZPGm.js","/assets/TripleSpeedometer-z3oLaUdt.js","/assets/Trudoyomkost-D-vK3Ed9.js","/assets/Turnover-B2bNl2Tc.js","/assets/UploadDropzone-BJg53rPa.js","/assets/UsersActivity-mIcAsLLl.js","/assets/VerdictBlock-Va-ljroY.js","/assets/VfxApiMap-BRlHXRkZ.js","/assets/VfxDictionaries-Ubw-kyrb.js","/assets/VfxEmployees-Czalk4v3.js","/assets/VfxHrMoves-wYS4QguG.js","/assets/VfxJobs-BifTHejy.js","/assets/VfxPhoto-B_fdvbAp.js","/assets/VfxShifts-LGYIfy8Z.js","/assets/VfxState-B0Yva4m6.js","/assets/VfxTimebooks-DKb96vVb.js","/assets/VfxTimesheet-9yrkeLdz.js","/assets/WatchProgress-ZhZJhlEc.js","/assets/WebLogin-BdL6ZpaC.js","/assets/WorkerConcerns-CKnn3_C_.js","/assets/Workers-CpHjjpLm.js","/assets/Zagruzka-rMazUTB1.js","/assets/ZagruzkaCell-BN_glumI.js","/assets/api-BvkzaHi3.js","/assets/archive-CkkUSY68.js","/assets/archive-restore-BDCcIK3p.js","/assets/arrow-down-DVqJ0di9.js","/assets/arrow-down-wide-narrow-zameL0XB.js","/assets/arrow-up-narrow-wide-yfQWipFv.js","/assets/award-DxG860S8.js","/assets/ban-CnLu_HWQ.js","/assets/boxes-Bigf5uJz.js","/assets/braces-Cw9x_QxO.js","/assets/brigadirFilters-B0HyR3X5.js","/assets/broadcastTree-BmJZepjk.js","/assets/building-2-DJfNw5B0.js","/assets/calculator-CBV7i8zQ.js","/assets/calendar-C6-JQ4Me.js","/assets/calendar-days-DaeTqMFL.js","/assets/camera-BZRRtmTy.js","/assets/categories-BiGmtrmC.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-ZhZyVgnq.js","/assets/chart-line-CKdNIPN1.js","/assets/chart-pie-BxD77GBD.js","/assets/chartRange-CzIQJeue.js","/assets/check-check-C_zac3Q1.js","/assets/chevron-left-BfApbrly.js","/assets/chevrons-up-down-Bvhq6tVM.js","/assets/circle-DGMnrIAe.js","/assets/circle-alert-DjQqPCkw.js","/assets/circle-check-big-DUp9mfcv.js","/assets/circle-dashed-pyvnpRMD.js","/assets/circle-minus-DsTdnjXH.js","/assets/circle-question-mark-DEIDfWQL.js","/assets/circle-slash-CCCItI8y.js","/assets/circle-user-round-B-JpC6VY.js","/assets/clock-3-D4zVqj7Z.js","/assets/cloud-off-BBfwGYaf.js","/assets/cloud-upload-D409R34v.js","/assets/compass-CWbbnwQm.js","/assets/concernCategories-LjwWU7ej.js","/assets/copy-B_5ilqcu.js","/assets/corner-down-right-D8FUBbue.js","/assets/createLucideIcon-D1S8ApBJ.js","/assets/es-BBL8rsRe.js","/assets/external-link-DRj-j0eb.js","/assets/file-clock-aootBggN.js","/assets/file-exclamation-point-DSOcUdG2.js","/assets/flag-DJUF4cxt.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C9gv6jTy.js","/assets/hash-CTyQftfZ.js","/assets/hourglass-7M3vJ3uR.js","/assets/image-Bzaeddqh.js","/assets/image-off-DuFoRbPm.js","/assets/inbox-B6oGQaJd.js","/assets/index-CI1cZ1SD.css","/assets/index-t59fhUPY.js","/assets/keyboard-DhH5pqQJ.js","/assets/languages-CF5ghSAy.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-D1UkKE9N.js","/assets/lightbulb-D4Q1rI1o.js","/assets/link-2-ByS0Hv7Q.js","/assets/link-2-off-C9IHiCii.js","/assets/list-ordered-CXDz24ZP.js","/assets/list-tree-B8tqxax1.js","/assets/lock-open-DDrVnih8.js","/assets/log-in-2OxBWk0J.js","/assets/marks-BC2sC3DG.js","/assets/minimize-2-ocRE6Lzm.js","/assets/package-check-3Elq_iw7.js","/assets/pencil-foEnscqL.js","/assets/percent-Cc75i74d.js","/assets/pin-off-Bw_sTRe9.js","/assets/pin-sQMqi1Z9.js","/assets/play-CY8dySka.js","/assets/plug-zap-iBfWJc1C.js","/assets/prop-types-BvTTHvOF.js","/assets/radio-Bg_FTQVQ.js","/assets/react-apexcharts.esm-CKFwPU4b.js","/assets/registers-FMkfSw90.js","/assets/repeat-Bgl5S0QG.js","/assets/save-CLFLKvvv.js","/assets/scopeLinks-DLf_QLhU.js","/assets/scroll-text-DzKw7ZZ_.js","/assets/search-x-DMgG4JQv.js","/assets/segments-gbK70xH5.js","/assets/send-5NKnnCBV.js","/assets/settings-2-CvL6uo_G.js","/assets/shield-BWqq_QAj.js","/assets/shield-alert-BNUbvXuu.js","/assets/shield-question-mark-BWSTRTrb.js","/assets/siren-Bsph0B2k.js","/assets/snowflake-CzzzsUDZ.js","/assets/split-BD_3A8UE.js","/assets/square-check-big-CYZUZYXO.js","/assets/star-dnT5HTqS.js","/assets/statusBands-B7n2FbzE.js","/assets/store-BdPkgQuQ.js","/assets/table-2-CACJ7KB4.js","/assets/table-properties-BKDuTY5l.js","/assets/tag-C1MMYSR2.js","/assets/timer-off-BIC1C2Pn.js","/assets/trending-down-wxsBN4pT.js","/assets/trending-up-DjuCD3Tb.js","/assets/undo-2-DrCY7lE6.js","/assets/useChartTheme-BwmBu77I.js","/assets/useElementWidth-D9FqqJ4V.js","/assets/useIsMobile-CF9sg6Nc.js","/assets/useOpenParam-BpDziWot.js","/assets/useStatusBands-Cpq8xi-i.js","/assets/useUrlScope-jai0EA3e.js","/assets/user-Dmet0Cge.js","/assets/user-cog-Dwndq21a.js","/assets/users-DCmi4Cux.js","/assets/vfx-BFu7YFSk.js","/assets/video-BU0Y6qUg.js","/assets/wallet-DQDaIoFy.js","/assets/warehouse-BRo8WUb5.js","/assets/workflow-C9DCgZ_O.js","/assets/x-Cn0iBEUn.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
