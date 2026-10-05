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

const BUILD = "2026-10-05T12:21:35.480Z";
const PRECACHE = ["/","/assets/AdminPanel-D-qjMG7Y.js","/assets/AnalysisBoard-CQYro87p.js","/assets/Arc-ju4Wfdaj.js","/assets/BrigadirProfile-Dv66pIPy.js","/assets/BroadcastReceivers-FbXn33Rl.js","/assets/BroadcastRecord-DFOK07kj.js","/assets/Button-BCjJ1aaF.js","/assets/CatLockNotice-DaLyiXAz.js","/assets/CategoryLegendModal-Bdv44OPo.js","/assets/CellConcerns-Ci5RBB1J.js","/assets/CellDetails-DK5MkkGx.js","/assets/CellFormModal-Dy2mHeWx.js","/assets/CellIdent-D7v02pkx.js","/assets/CellLink-hr2Mkzt7.js","/assets/Cells-DPEaG71j.js","/assets/ColumnFilter-BObfJ4Jk.js","/assets/ColumnsPicker-nr0bryx_.js","/assets/CommentsModal-CEQ9F6uz.js","/assets/ComparisonTable-CscvDndV.js","/assets/Concerns-C2p0xFE1.js","/assets/Daily-CTuh4tgf.js","/assets/DataTable-BR6OrWne.js","/assets/DateRangePicker-Djl0kGek.js","/assets/DayReportView-CCjTxODK.js","/assets/DayStepper-BBzmVIy5.js","/assets/DifferenceBreakdown-B4I2vjBe.js","/assets/Downtime-DeEunE3I.js","/assets/Education-BxusG5hj.js","/assets/EducationLesson-Bjy3KIF8.js","/assets/EmptyState-BipOQXVl.js","/assets/Exam-DI6zQNZh.js","/assets/FactorySelect-CB1j1whJ.js","/assets/Gamification-CkC_yIHj.js","/assets/GroupBadge-m30uvkbr.js","/assets/HeatmapChart-qBNMaTl_.js","/assets/IdleCell-DEb_5tkr.js","/assets/KPICard-D4L5RywD.js","/assets/Kaizen-D8ef5sSy.js","/assets/Kelish-DPKtFQVI.js","/assets/KpiDeltaCard-Oqvrhdi9.js","/assets/LangTextInput-C3V-pfM8.js","/assets/Layout-DyRamV9d.js","/assets/LeaderAppeal-POzqrJGo.js","/assets/LeaderDayReport-D4EX0jPA.js","/assets/LeaderUnitReport-l08Uutwd.js","/assets/Leaderboard-Bz0wmkqd.js","/assets/Leaders-B6_h5SI-.js","/assets/Lightbox-pYHARDeK.js","/assets/LiveOverview-BELusbDx.js","/assets/Login-BcM1mF_Z.js","/assets/NotFound-CISWRf79.js","/assets/Notifications-ByYzCLex.js","/assets/Overview-CqlStCBo.js","/assets/Pagination-CEcYCVLo.js","/assets/PerenaladkaFactTable-BHNpiiSz.js","/assets/PersonCard-_Q9prGVF.js","/assets/PlanFulfillment-BbrxaoA6.js","/assets/Production-D9mG7hNW.js","/assets/Profile-DiLvwCjM.js","/assets/ProofCamera-CSTlzmTg.js","/assets/ProofPhoto-B6lV4raP.js","/assets/Quality-dc20j_Ip.js","/assets/RawRows-DHEFoAMl.js","/assets/RequestStateChip-MZ3qmcm4.js","/assets/RichTextEditor-D9dBfTNh.js","/assets/SaveState-BKFH7t5f.js","/assets/SearchInput-CBAKlAl8.js","/assets/SeasonalityHeatmap-BOsECeJX.js","/assets/SegmentedToggle-CXeWGnen.js","/assets/SetupTimes-Pwfz7MXD.js","/assets/ShiftDaily-Dj6_8juK.js","/assets/Staff-BhLYjMs5.js","/assets/StaffLive-cCyIE4i4.js","/assets/StatusBadge-BPFDlxe2.js","/assets/TargetGoal-BwXNe34E.js","/assets/Targets-BV2V9AL2.js","/assets/Tasks-DBVSLRvw.js","/assets/TimeWheelPicker-BajFQULB.js","/assets/Toast-Czg6RpBC.js","/assets/Tooltip-BMJvimj7.js","/assets/TrendChart-CytYMvar.js","/assets/TripleSpeedometer-QhOPpkVT.js","/assets/Trudoyomkost-BmWXfEjc.js","/assets/Turnover-Dg-w0viK.js","/assets/UploadDropzone-Dd5LYl-I.js","/assets/UsersActivity-ClY1F-vm.js","/assets/VerdictBlock-BLip6Ezx.js","/assets/VfxApiMap-g1UO7zeu.js","/assets/VfxDictionaries-CE37yuxi.js","/assets/VfxEmployees-Be9_Rrot.js","/assets/VfxHrMoves-F05RBmen.js","/assets/VfxJobs-CX6o_Nf-.js","/assets/VfxPhoto-kITFLkNS.js","/assets/VfxShifts-BKv5Q-Fo.js","/assets/VfxState-BsVXnObY.js","/assets/VfxTimebooks-7VxcWnom.js","/assets/VfxTimesheet-DuzbjQht.js","/assets/WatchProgress-CHpZeW3I.js","/assets/WebLogin-BSjnurGS.js","/assets/WorkerConcerns-CxwEoRl7.js","/assets/Workers-B8HFx5nw.js","/assets/Zagruzka-I4XUjAeS.js","/assets/ZagruzkaCell-DKQjGnfQ.js","/assets/api-gBGGXyoW.js","/assets/archive--cJiThgy.js","/assets/archive-restore-Y16WFUbU.js","/assets/arrow-down-wCauxloU.js","/assets/arrow-left-D623kOTn.js","/assets/arrow-up-Demqa3fD.js","/assets/arrow-up-narrow-wide-5aBRf0N4.js","/assets/arrow-up-right-9EnGqom0.js","/assets/award-BL60D_pZ.js","/assets/ban-BIvFkOWH.js","/assets/book-open-CKMrLoiu.js","/assets/boxes-33_2EdVW.js","/assets/braces--ZMj6qyf.js","/assets/brigadirFilters-0rQ8H2kU.js","/assets/broadcastTree-D27bbkCs.js","/assets/building-2-CgchIsBq.js","/assets/calculator-Chhj00Sx.js","/assets/calendar-C2clATqt.js","/assets/calendar-days-DIFDZRVa.js","/assets/camera-BUwY61Ct.js","/assets/categories-BlHLTpNO.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Dg3u19DI.js","/assets/chart-line-C8fh_lVT.js","/assets/chart-pie-DMNjdVOb.js","/assets/chartRange-Cw81KNJS.js","/assets/check-check-CQk5kNss.js","/assets/chevron-left-CmFjUaTG.js","/assets/chevrons-up-down-B-tnmXkE.js","/assets/circle-CmjPabao.js","/assets/circle-alert-DFxZ-OMA.js","/assets/circle-check-big-Qfre0S3N.js","/assets/circle-dashed-BI0QSa0h.js","/assets/circle-minus-DQhK057_.js","/assets/circle-question-mark-BmFqjnS-.js","/assets/circle-slash-C0jNk0es.js","/assets/circle-user-round-BwWdS_-d.js","/assets/clock-3-Dz598CHa.js","/assets/cloud-off-BwUm0cZD.js","/assets/cloud-upload-CJsh4641.js","/assets/compass-ZWIa-6Nb.js","/assets/concernCategories-C8CDq-jI.js","/assets/copy-CmTasZPA.js","/assets/corner-down-right-DOjbv9M5.js","/assets/createLucideIcon-qXzY5fCP.js","/assets/es-CwdfdNei.js","/assets/exportXlsx-Dk0gbql5.js","/assets/external-link-i_uW2Cab.js","/assets/file-clock-DbuEdl2J.js","/assets/file-exclamation-point-DQQgsZ7l.js","/assets/file-spreadsheet-BWG8cV92.js","/assets/file-text-DnYDKHbw.js","/assets/flag-Pf0fcoph.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Dri1rY7d.js","/assets/hash-BMjMw4CQ.js","/assets/history-B0LEaWf6.js","/assets/hourglass-DlPXeYwZ.js","/assets/image-6AtByBzZ.js","/assets/image-off-Qle5Rizv.js","/assets/inbox-BtB7S_l6.js","/assets/index-C9OGZE1p.js","/assets/index-CCQoDNa6.css","/assets/key-round-SDdNhmH9.js","/assets/keyboard-Dm2nvjUr.js","/assets/languages-jvfzinuI.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BBc8Rpyj.js","/assets/lightbulb-D4NFi1f8.js","/assets/link-2-dq7FbB7v.js","/assets/link-2-off-CGbHDS5P.js","/assets/list-ordered-CvuLk2JR.js","/assets/list-tree-CzZgHLbm.js","/assets/lock-open-CeRoWMJx.js","/assets/log-in-C6mCmOZs.js","/assets/maximize-2-BoZQyK-_.js","/assets/message-square-B9NXXACB.js","/assets/minimize-2-pE_EnRfY.js","/assets/package-check-BS_s7Vyu.js","/assets/paperclip-bVq-5FzK.js","/assets/pencil-DLPB7Ye9.js","/assets/percent-DhYbhSkK.js","/assets/pin-OaztdFxZ.js","/assets/pin-off-DI36wAr9.js","/assets/play-BhuBINdT.js","/assets/plug-zap-DjGgx8cF.js","/assets/presentation-nqIOBKMk.js","/assets/prop-types-DJBsSiHQ.js","/assets/radio-BWvQY9OD.js","/assets/react-apexcharts.esm-oVdCIklv.js","/assets/registers-CaUx8B6A.js","/assets/repeat-YXS-rA-v.js","/assets/rotate-ccw-B8pPMD09.js","/assets/rotate-cw-CZfTzIqI.js","/assets/save-0FOX5j3G.js","/assets/scopeLinks-nk96f9ER.js","/assets/scroll-text-DOUOZ6UR.js","/assets/search-x-CV8AqL9Q.js","/assets/segments-B1WI-xU7.js","/assets/send-Cy5XAdMI.js","/assets/settings-2-CGwl59tA.js","/assets/shield-2_a0M_Qy.js","/assets/shield-alert-DzQ2kmr1.js","/assets/shield-check-D5oLTRc_.js","/assets/shield-question-mark-DnTwHPca.js","/assets/siren-BGVQahmi.js","/assets/snowflake-mBnqpjVk.js","/assets/split-BMK6Ilty.js","/assets/square-CSsiRylC.js","/assets/square-check-big-CDrhKNnm.js","/assets/star-BFlXhrwj.js","/assets/statusBands-BLuZkd-Q.js","/assets/store-8aodp9iF.js","/assets/table-2-Dh9zxJdO.js","/assets/table-properties-Mbig2dEG.js","/assets/tag-B-Uezdn9.js","/assets/timer-off-DGKwU28r.js","/assets/trending-down-BsO56tV4.js","/assets/trending-up-CsaiZq_0.js","/assets/undo-2-CxzHB7AT.js","/assets/useChartTheme-rJAbqUW7.js","/assets/useElementWidth-CNmfZFgz.js","/assets/useIsMobile-CYR2jvQ1.js","/assets/useOpenParam-DLZ2bPkr.js","/assets/useStatusBands-DchFwv5e.js","/assets/useUrlScope-Dq7vexLT.js","/assets/user-C55sA-e1.js","/assets/user-cog-urUzb9qC.js","/assets/users-uGfkWwkU.js","/assets/vfx-C4rgE4F8.js","/assets/video-trBFu24q.js","/assets/wallet-ChrWN8w5.js","/assets/warehouse-Bmy-h0JK.js","/assets/x-CS5jmJ6T.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
