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

const BUILD = "2026-09-28T15:11:35.869Z";
const PRECACHE = ["/","/assets/AdminPanel-DUtHdDSc.js","/assets/AnalysisBoard-C-LKH725.js","/assets/Arc-Cg5Oomsb.js","/assets/ArcLegacy-gb7sJrVm.js","/assets/AttendanceModal-BuxeC5nN.js","/assets/BrigadirProfile-DBHDjb_7.js","/assets/BroadcastReceivers-DvzASBLL.js","/assets/BroadcastRecord-C-nYaSjj.js","/assets/CatLockNotice-3iLKOztX.js","/assets/CategoryLegendModal-I1kydZ3R.js","/assets/CellConcerns-Z9AMfssc.js","/assets/CellDetails-uEJKjE-p.js","/assets/CellFormModal-D3XvKb52.js","/assets/CellLink-Cj2srYgC.js","/assets/Cells-CFJjsm9U.js","/assets/ColumnFilter-DVgPCU-a.js","/assets/ColumnsPicker-D1iJr6u0.js","/assets/CommentsModal-DVkD07_5.js","/assets/ComparisonTable-CHBqqnEL.js","/assets/Concerns-CnWhcKMN.js","/assets/ConfirmDialog-DV7RrNj4.js","/assets/Daily-DhlkZ6eB.js","/assets/DataTable-XCo7gYYU.js","/assets/DateRangePicker-dUQtazlY.js","/assets/DayReportView-D5shZvWB.js","/assets/DayStepper-CLj4qNSx.js","/assets/DifferenceBreakdown-DH76mgsV.js","/assets/Downtime-jM9RKDoQ.js","/assets/Education-DFFFRKZG.js","/assets/EducationLesson-CvSulvym.js","/assets/EmptyState-XgLvFGjz.js","/assets/Exam-ChrEglm_.js","/assets/FactorySelect-Ds9NiCjZ.js","/assets/Gamification-D0GJjwAM.js","/assets/GroupBadge-BivkGA2K.js","/assets/HeatmapChart-CqhQyBxk.js","/assets/IdleCell-PEunrCTn.js","/assets/KPICard-WWJvTdWQ.js","/assets/Kaizen-CbVZ_A0M.js","/assets/Kelish-BDz6Z-Kt.js","/assets/KpiDeltaCard-BK2F9Asc.js","/assets/LangTextInput-DDEioiuD.js","/assets/Layout-BHm2L5mw.js","/assets/LeaderAppeal-sT7-zQyt.js","/assets/LeaderDayReport-Dv9m2ZEF.js","/assets/LeaderUnitReport-BX5sW9oA.js","/assets/Leaderboard-EJ3FmUbc.js","/assets/Leaders-C2MAs0Rf.js","/assets/Lightbox-CsHQ-4xh.js","/assets/LiveOverview-Z1_cmLPB.js","/assets/Login-kH8j7K12.js","/assets/NotFound-Cgh6QTLX.js","/assets/Overview-CF56Hzgd.js","/assets/Pagination-ffaut1QW.js","/assets/PerenaladkaFactTable-DUMNkabD.js","/assets/PlanFulfillment-BrT7ZE4M.js","/assets/Production-BNXKgdBE.js","/assets/Profile-CghBUPfe.js","/assets/ProofCamera-BrkneLnX.js","/assets/ProofPhoto-BaI0fdT1.js","/assets/Quality-BEJiNvwJ.js","/assets/RequestStateChip-DOkObhaA.js","/assets/RichTextEditor-Nkx9KuDn.js","/assets/SaveState-C1qmg9VL.js","/assets/SearchInput-2N-kB-vS.js","/assets/SeasonalityHeatmap-D--FHOs5.js","/assets/SegmentedToggle-rGuEtH9n.js","/assets/SetupTimes-BNzZsV1i.js","/assets/ShiftDaily-DkjRsN5e.js","/assets/Staff-DmJwaRy6.js","/assets/StatusBadge-DwZTcrPC.js","/assets/TargetGoal-DC_R1swh.js","/assets/Targets-D1sQ7eBz.js","/assets/Tasks-DX0Iv3HL.js","/assets/TimeWheelPicker-BXBbW-x1.js","/assets/Tooltip-By8lSTPu.js","/assets/TrendChart-l1-WUy0z.js","/assets/TripleSpeedometer-D99QkzD8.js","/assets/Trudoyomkost-DBlIlKk8.js","/assets/UploadDropzone-D26cEaKJ.js","/assets/UsersActivity-BUGCSIi3.js","/assets/VerdictBlock-BVLAuZp8.js","/assets/WatchProgress-Qbuz0QZX.js","/assets/WebLogin-5v9IdfVX.js","/assets/WorkerConcerns-BMvN1Ha0.js","/assets/Workers-C0RoCBEB.js","/assets/Zagruzka-x3_Ayv02.js","/assets/ZagruzkaCell-DdTsFTjI.js","/assets/api-DjYlt9Ln.js","/assets/archive-DHoWQcl3.js","/assets/archive-restore-DWa-4lhP.js","/assets/arrow-down-DhzfixlP.js","/assets/arrow-left-BXXaYXXg.js","/assets/arrow-left-right-Bh2dVt0n.js","/assets/arrow-up-BbvxFn-k.js","/assets/arrow-up-right-BIsXgG5j.js","/assets/award-5EG6Gw5F.js","/assets/ban-CUMPEfeQ.js","/assets/bot-DQtEhInK.js","/assets/boxes-BK_btR5J.js","/assets/brigadirFilters-CXRNAj2b.js","/assets/broadcastTree-LPuxhCIK.js","/assets/building-2-BbRuaTe-.js","/assets/calendar-clock-CpajciBD.js","/assets/calendar-days-wbHOI5jf.js","/assets/calendar-r4rUoD5h.js","/assets/calendar-range-BnaywjI8.js","/assets/camera-DGeu0s5n.js","/assets/categories-Bu8S-4Du.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-EAxOLZL5.js","/assets/chart-line-CM_lbRVf.js","/assets/chart-pie-DgyrfE7R.js","/assets/chartRange-CTTKWkYm.js","/assets/chevron-left-DlW1Vzm_.js","/assets/chevrons-up-down-cKqloRbZ.js","/assets/circle-LPozdth3.js","/assets/circle-check-big-H2XJqqsz.js","/assets/circle-dot-BOPHqujM.js","/assets/circle-minus-BVJrgsp2.js","/assets/circle-slash-ligQCf0c.js","/assets/circle-user-round-CRoksVwo.js","/assets/cloud-off-Byl60vgG.js","/assets/cloud-upload-BRbISCet.js","/assets/compass-KQMsVFH-.js","/assets/concernCategories-B5kPh5Cu.js","/assets/copy-EP3pf7b_.js","/assets/corner-down-right-BL19LU5h.js","/assets/createLucideIcon-n-LRppF1.js","/assets/es-BUbzK2ns.js","/assets/exportXlsx-BhH0JEMK.js","/assets/external-link-C_nIl-yJ.js","/assets/file-clock-BXLfwyzH.js","/assets/file-exclamation-point-BTeNCo91.js","/assets/file-spreadsheet-BO5T-vOE.js","/assets/file-text-BNf9Mo82.js","/assets/flag-xesf1gU8.js","/assets/flame-Bczz38LD.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DMKOk7E7.js","/assets/hash-CUThhQCB.js","/assets/history-DHQMs1gV.js","/assets/hourglass-lOR037J9.js","/assets/image-BFCKdEP_.js","/assets/image-off-CziqUn7Z.js","/assets/index-DceWY1ps.js","/assets/index-gntTdq1t.css","/assets/key-round-GtEIKZcX.js","/assets/keyboard-CeY6QmPQ.js","/assets/languages-MEoG_X-M.js","/assets/layers-DLGviIAo.js","/assets/lightbulb-CaL-EFCz.js","/assets/link-2-CFaEbW7P.js","/assets/list-checks-v4nuYh9G.js","/assets/list-ordered-D2jBy8fs.js","/assets/list-tree-CkX5Y32n.js","/assets/lock-open-C8HFKlcT.js","/assets/log-in-BJsErD9o.js","/assets/message-square-DB5c5ZL5.js","/assets/minimize-2-CcHlwvHH.js","/assets/package-check-rrjGA4BN.js","/assets/paperclip-CeroOjdI.js","/assets/pencil-Dw9jDnWi.js","/assets/percent-M-ZwX6HR.js","/assets/personName-B4KId4zS.js","/assets/pin-Nt9306DB.js","/assets/pin-off-BykIiWMZ.js","/assets/play-jsklSlim.js","/assets/presentation-CZPYGQSV.js","/assets/prop-types-CiJwARAc.js","/assets/radio-BcKwjpjf.js","/assets/react-apexcharts.esm-CgaS5ENi.js","/assets/repeat-XUZNGnOo.js","/assets/rotate-ccw-Da9v3pEr.js","/assets/rotate-cw-DrmtqAuT.js","/assets/save-BmH-iJCp.js","/assets/scale-D1dpQzb-.js","/assets/scroll-text-B-frR8SN.js","/assets/search-x-DRqDFU5O.js","/assets/segments-Qq5TYJyj.js","/assets/send-kFXUYjXR.js","/assets/settings-2-UqHKUeJD.js","/assets/shield-CC0u23Hg.js","/assets/shield-alert-o0x6-Fl8.js","/assets/shield-check-E83PB1Gt.js","/assets/shield-question-mark-BPQiQiH2.js","/assets/siren-CnF9GVgI.js","/assets/smartphone-DXj3QXcr.js","/assets/snowflake-DhLFggWQ.js","/assets/square-BXnsxxCR.js","/assets/square-check-big-4nXa2tdy.js","/assets/star-BpACMIIM.js","/assets/statusBands-OOG2iY27.js","/assets/store-B0SwYF_y.js","/assets/table-2-DF4iEacs.js","/assets/tag-CKpMcObt.js","/assets/timer-off-CMmwKJU8.js","/assets/trending-down-1Vpe06o6.js","/assets/trending-up-DTOw9gfD.js","/assets/undo-2-C0Lm4CJG.js","/assets/useChartTheme-Dhh3wZIo.js","/assets/useElementWidth-hHCCFa0t.js","/assets/useIsMobile-CGqWnE-l.js","/assets/useMutation-DgIIoJKC.js","/assets/useStatusBands-CLk5ikdb.js","/assets/user-cog-Dqjcxgwu.js","/assets/user-minus-6Wdu-eR6.js","/assets/user-nrm6Sfdf.js","/assets/users-DIFlRNzN.js","/assets/video-ACiVzIS7.js","/assets/wallet-BJ89AvLc.js","/assets/warehouse-CkfQj78E.js","/assets/zap-hgDyjmrj.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
