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

const BUILD = "2026-09-30T14:41:58.521Z";
const PRECACHE = ["/","/assets/AdminPanel-Ce17s_tO.js","/assets/AnalysisBoard-BpSrU08V.js","/assets/Arc-B6UK9YRd.js","/assets/ArcLegacy-IsiOo--L.js","/assets/AttendanceModal-tuTRYxrr.js","/assets/BrigadirProfile-Ca0KyI-0.js","/assets/BroadcastReceivers-CW3vkAO8.js","/assets/BroadcastRecord-i2P9DfGQ.js","/assets/CatLockNotice-DqBdyVBT.js","/assets/CategoryLegendModal-Beh7nCYa.js","/assets/CellConcerns-B7L7aiJ6.js","/assets/CellDetails-CopyXEXY.js","/assets/CellFormModal-CxjQv5r9.js","/assets/CellLink-CDvjp71C.js","/assets/Cells-CHpXVSgB.js","/assets/ColumnFilter-DkqT-uL4.js","/assets/ColumnsPicker-X2lknMdM.js","/assets/CommentsModal-156afXDT.js","/assets/ComparisonTable-CmaW36Tf.js","/assets/Concerns-C5XRuU0x.js","/assets/ConfirmDialog-CHq4RDLs.js","/assets/Daily-Cl6LnSB4.js","/assets/DataTable-CeEMZwA8.js","/assets/DateRangePicker-d1yq7lrC.js","/assets/DayReportView-vsN_4YTJ.js","/assets/DayStepper-BVS4wHsY.js","/assets/DifferenceBreakdown-B3ujD-hk.js","/assets/Downtime-C1auEEok.js","/assets/Education-C9czxVPz.js","/assets/EducationLesson-D_wh9XuM.js","/assets/EmptyState-C64TUMhq.js","/assets/Exam-B5Nm-aeX.js","/assets/FactorySelect-BaQHiEVs.js","/assets/Gamification-CzmKtaGY.js","/assets/GroupBadge-CB-qwFSy.js","/assets/HeatmapChart-Dda-oIKZ.js","/assets/IdleCell-BsyK5uCk.js","/assets/KPICard-BWDi7Jab.js","/assets/Kaizen-BwZ3pg-t.js","/assets/Kelish-BddXqfQl.js","/assets/KpiDeltaCard-ChH8VOG5.js","/assets/LangTextInput-DFQoqt8N.js","/assets/Layout-D5E_P1xP.js","/assets/LeaderAppeal-MKuqJY9N.js","/assets/LeaderDayReport-CpDE7VrO.js","/assets/LeaderUnitReport-CFjxK2LL.js","/assets/Leaderboard-CpGlxIwH.js","/assets/Leaders-BsmqgLvs.js","/assets/Lightbox-fClBH8Fo.js","/assets/LiveOverview-CEVyxP60.js","/assets/Login-C4cdvjRc.js","/assets/NotFound-Baq3EuyH.js","/assets/Overview-9H9eGUSh.js","/assets/Pagination-DhHoHAXR.js","/assets/PerenaladkaFactTable-Dh-M7X2w.js","/assets/PlanFulfillment-BiX8LvLL.js","/assets/Production-B4RRusGF.js","/assets/Profile-DmUb1gtK.js","/assets/ProofCamera-DPVDZzj2.js","/assets/ProofPhoto-Bq0sLM85.js","/assets/Quality-DcWjNpra.js","/assets/RequestStateChip-ykJ9sO3W.js","/assets/RichTextEditor-CUFK0miH.js","/assets/SaveState-DqNS2Lnf.js","/assets/SearchInput-iHAPMg9j.js","/assets/SeasonalityHeatmap-D_7ErBTL.js","/assets/SegmentedToggle-DGIV1zmq.js","/assets/SetupTimes-B9hM25-x.js","/assets/ShiftDaily-D9yVULx5.js","/assets/Staff-CxgTICcb.js","/assets/StatusBadge-CMjQRCV3.js","/assets/TargetGoal-BTWYwR1p.js","/assets/Targets-jKDk6yKG.js","/assets/Tasks-5RzQaIp4.js","/assets/TimeWheelPicker-4R0es5W6.js","/assets/Tooltip-bV7nLQLl.js","/assets/TrendChart-B6zfH7rH.js","/assets/TripleSpeedometer-BVK9mKNT.js","/assets/Trudoyomkost-wNDEdoEJ.js","/assets/UploadDropzone-BN6S21ci.js","/assets/UsersActivity-ldvApagR.js","/assets/VerdictBlock-BTY2s4_-.js","/assets/WatchProgress-Djoh7YYx.js","/assets/WebLogin-sAz5b_U6.js","/assets/WorkerConcerns-DaV332Tf.js","/assets/Workers-BC_b2XQq.js","/assets/Zagruzka-CT5h6Njo.js","/assets/ZagruzkaCell-Ci2LywKl.js","/assets/api-qmch3V61.js","/assets/archive-CjHAttJY.js","/assets/archive-restore-DFNo42I-.js","/assets/arrow-down-DuI9Q7Hi.js","/assets/arrow-left-rXPavXeH.js","/assets/arrow-left-right-BVjc4Nd0.js","/assets/arrow-up--qNMr22v.js","/assets/arrow-up-narrow-wide-VBki5sJw.js","/assets/arrow-up-right-Dgh5cjnl.js","/assets/award-BQOw0-gv.js","/assets/ban-5h5zXJLA.js","/assets/bot-D-nkSQ03.js","/assets/boxes-BS9B8fNX.js","/assets/brigadirFilters-DG07zfCa.js","/assets/broadcastTree-37Ce5e28.js","/assets/building-2-BtjvtKxH.js","/assets/calendar-Bt4EfmPz.js","/assets/calendar-clock-DfGuRA9R.js","/assets/calendar-days-sruuVfZB.js","/assets/calendar-range-Ch8-RJeD.js","/assets/camera-BenMwNGX.js","/assets/categories-CTzPCssX.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BwBovwao.js","/assets/chart-line-BDroCb6l.js","/assets/chart-pie-CpN55EAX.js","/assets/chartRange-KlujhtBA.js","/assets/chevron-left-DdJ3H_J1.js","/assets/chevrons-up-down-Bo2PiENH.js","/assets/circle-Bkbl_3OL.js","/assets/circle-check-big-CuTLRmAK.js","/assets/circle-dot-CScOXjDJ.js","/assets/circle-minus-B2GIucR4.js","/assets/circle-slash-Cw1Razoc.js","/assets/circle-user-round-BPWN2W0m.js","/assets/cloud-off-DguDzgCd.js","/assets/cloud-upload-D0mc8cCF.js","/assets/compass-BuoeRPa7.js","/assets/concernCategories-e6ku1jsn.js","/assets/copy-Dx9J1Fts.js","/assets/corner-down-right-Bf83jGmK.js","/assets/createLucideIcon-A-B4mdwx.js","/assets/es-DFAiKHf0.js","/assets/exportXlsx-CCxsuUTv.js","/assets/external-link-Bk30S40C.js","/assets/file-clock-fVqO8lZ5.js","/assets/file-exclamation-point-Byx1wSjq.js","/assets/file-spreadsheet-DAxu57Qg.js","/assets/file-text-BEULGQBp.js","/assets/flag-Cef-22MT.js","/assets/flame-CuK9-2U9.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D8TFBa90.js","/assets/hash-BQsGM04X.js","/assets/history-BFZkDptc.js","/assets/hourglass-CwbHINds.js","/assets/image-D2uKxG-Y.js","/assets/image-off-CbrF3x_a.js","/assets/index-DRA3QHGZ.js","/assets/index-Pg7Y1NNR.css","/assets/key-round-DK6RCZLE.js","/assets/keyboard-BQniQbQm.js","/assets/languages-Cq2lTEIm.js","/assets/layers-BFi-h_cj.js","/assets/lightbulb-C-rES4d5.js","/assets/link-2-Dygnahdd.js","/assets/link-2-off-C3nCCVuY.js","/assets/list-checks-C4FI0N4v.js","/assets/list-ordered-VHULifa6.js","/assets/list-tree-BzN6C12q.js","/assets/lock-open-GuKmdt2q.js","/assets/log-in--IsX7Bsc.js","/assets/maximize-2-CjnTyu5K.js","/assets/message-square-DP5w0nAI.js","/assets/minimize-2-092Ronb2.js","/assets/package-check-d7xI43f1.js","/assets/paperclip-B0_n3SSS.js","/assets/pencil-rOHiAIgU.js","/assets/percent-Dzj5AUGk.js","/assets/personName-CogOuS3K.js","/assets/pin-DKgfVYWI.js","/assets/pin-off-HA1RnW0B.js","/assets/play-BWf47Qzp.js","/assets/presentation-D3nbQ8U6.js","/assets/prop-types-D58UbDqQ.js","/assets/radio-DKgz50jj.js","/assets/react-apexcharts.esm-CyYRQOp4.js","/assets/repeat-BcmV5VY1.js","/assets/rotate-ccw-C_0PL2iH.js","/assets/rotate-cw-Bgm4dmse.js","/assets/save-CPfsxgsL.js","/assets/scale-DqAVcsYv.js","/assets/scopeLinks-PDUpIRiH.js","/assets/scroll-text-Cpnruw5C.js","/assets/search-x-Rlo-NEk8.js","/assets/segments-DWlNZZYE.js","/assets/send-BIBTIleE.js","/assets/settings-2-Dxt6dy_e.js","/assets/shield-DrlbwTZ_.js","/assets/shield-alert-DVor9Wfz.js","/assets/shield-check-BmE_MIe4.js","/assets/shield-question-mark-DoGhACuT.js","/assets/siren-CMXv1P09.js","/assets/snowflake-BzajHiq3.js","/assets/square-CDne2pmZ.js","/assets/square-check-big-WBaKuGsA.js","/assets/star-BIZpOlC-.js","/assets/statusBands-BRH1MJMQ.js","/assets/store-aKKKteNZ.js","/assets/table-2-t2j693F6.js","/assets/table-properties-BWoZsRnm.js","/assets/tag-tC5h8ePc.js","/assets/timer-off-DnOTkQ4u.js","/assets/trending-down-C12pueZP.js","/assets/trending-up-C64jQal_.js","/assets/undo-2-DwFDC_6t.js","/assets/useChartTheme-r6Pwafu0.js","/assets/useElementWidth-BRSh1_Sa.js","/assets/useIsMobile-DptIYilw.js","/assets/useMutation-BcH-BQE4.js","/assets/useStatusBands-CRhCuphw.js","/assets/useUrlScope-BO-DzX-J.js","/assets/user-Bri1Gy-X.js","/assets/user-cog-uYQDwFy0.js","/assets/user-minus-B31LJnDY.js","/assets/users-_A_AF-M0.js","/assets/video-C8E4GSth.js","/assets/wallet-7JiPBbe8.js","/assets/warehouse-B-_oxFib.js","/assets/zap-supldu2S.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
