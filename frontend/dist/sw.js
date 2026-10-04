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

const BUILD = "2026-10-04T11:42:18.017Z";
const PRECACHE = ["/","/assets/AdminPanel-CR7Lc_yw.js","/assets/AnalysisBoard-BImcaODF.js","/assets/Arc-Cv2RzzP6.js","/assets/ArcLegacy-_Labb2do.js","/assets/BrigadirProfile-BqJ7923a.js","/assets/BroadcastReceivers-CELcr-s3.js","/assets/BroadcastRecord-z1ZPPWcH.js","/assets/CatLockNotice-BzkVWYBp.js","/assets/CategoryLegendModal-CgjvMklO.js","/assets/CellConcerns-DjQjpxKU.js","/assets/CellDetails-LKSeOIuW.js","/assets/CellFormModal-NzzSyFhs.js","/assets/CellIdent-BalpUg7b.js","/assets/CellLink-QGaYtsR0.js","/assets/Cells-B5lPeA7w.js","/assets/ColumnFilter-Dh7FDgZ0.js","/assets/ColumnsPicker-BiWSemVv.js","/assets/CommentsModal-BomWJm3I.js","/assets/ComparisonTable-BKvO9DPK.js","/assets/Concerns-BETkJAS_.js","/assets/ConfirmDialog-B47s1qXJ.js","/assets/Daily-DTOjGyj9.js","/assets/DataTable-peH7mEo2.js","/assets/DateRangePicker-aZp8gZAn.js","/assets/DayReportView-CEZxibbK.js","/assets/DayStepper-C5cUBFqJ.js","/assets/DifferenceBreakdown-f1RjpY5W.js","/assets/Downtime-BK_0tp8R.js","/assets/Education-BIwu0CNb.js","/assets/EducationLesson-BCZWksHg.js","/assets/EmptyState-BX4k1Ncv.js","/assets/Exam-wBFJCk0V.js","/assets/FactorySelect-C_za_xLy.js","/assets/Gamification-Me5BP_1g.js","/assets/GroupBadge-iE4Za-k0.js","/assets/HeatmapChart-BF2pZmvU.js","/assets/IdleCell-C8w7D7gO.js","/assets/KPICard-B-vzfsor.js","/assets/Kaizen-DLsAHs7n.js","/assets/Kelish-BLoISABR.js","/assets/KpiDeltaCard-CURLRnTF.js","/assets/LangTextInput-C-qYIPVI.js","/assets/Layout-Cw8cq3w5.js","/assets/LeaderAppeal-DPwwT-p2.js","/assets/LeaderDayReport-DyHDDj7W.js","/assets/LeaderUnitReport-sneMCAtz.js","/assets/Leaderboard-Dufq4L3J.js","/assets/Leaders-DfGJ4hUl.js","/assets/Lightbox-D__jK4_j.js","/assets/LiveOverview-EDuiTzoI.js","/assets/Login-DEXp-MU9.js","/assets/NotFound-DzeLY8rn.js","/assets/Notifications-d00utERR.js","/assets/Overview-CCEg2AbI.js","/assets/Pagination-BqH8EXOj.js","/assets/PerenaladkaFactTable-Byzi6oEp.js","/assets/PersonCard-B321GfDo.js","/assets/PlanFulfillment-DA74PtQK.js","/assets/Production-uDdC49fW.js","/assets/Profile-BSRpUxks.js","/assets/ProofCamera-BqsSUObj.js","/assets/ProofPhoto-D4f1joBe.js","/assets/Quality-BcFikdCi.js","/assets/RawRows-Dc9JU7zZ.js","/assets/RequestStateChip-DXY7TdY_.js","/assets/RichTextEditor-57aU7EEI.js","/assets/SaveState-BpLYitNh.js","/assets/SearchInput-BAlBy3Oe.js","/assets/SeasonalityHeatmap-Bl1NQIpP.js","/assets/SegmentedToggle-P21M0ZRf.js","/assets/SetupTimes-CH3J8sk5.js","/assets/ShiftDaily-CY3YYwvb.js","/assets/Staff-D3mFZShA.js","/assets/StaffLive-BK-oXDkg.js","/assets/StatusBadge-CH0yjUWz.js","/assets/TargetGoal-fHlxFOE1.js","/assets/Targets-B8GxCocz.js","/assets/Tasks-BtFtj_rY.js","/assets/TimeWheelPicker-hEUpSp7p.js","/assets/Toast-Bl4U-Gbz.js","/assets/Tooltip-B17AvHxf.js","/assets/TrendChart-BZnabpg_.js","/assets/TripleSpeedometer-yN8xM9CI.js","/assets/Trudoyomkost-DCD76V8H.js","/assets/UploadDropzone-DMspRIB4.js","/assets/UsersActivity-Br6tcYov.js","/assets/VerdictBlock-D90CIurZ.js","/assets/VfxApiMap-CXlGfOMi.js","/assets/VfxDictionaries-5-h8v8DC.js","/assets/VfxEmployees-DcpKsFmO.js","/assets/VfxHrMoves-SBD_bvnV.js","/assets/VfxJobs-Dq5hc-p9.js","/assets/VfxPhoto-DRV2YSgT.js","/assets/VfxShifts-BR5rD1DB.js","/assets/VfxState-CnxHU8L7.js","/assets/VfxTimebooks-DqedwWnM.js","/assets/VfxTimesheet-aB0wQtIE.js","/assets/WatchProgress-Drifl1pb.js","/assets/WebLogin-BNjDuLKJ.js","/assets/WorkerConcerns-GjxaklDt.js","/assets/Workers-DAR-9cPu.js","/assets/Zagruzka-Lu3DRggY.js","/assets/ZagruzkaCell-CPc8u6qC.js","/assets/api-DywUTMde.js","/assets/archive-D1s0UD6i.js","/assets/archive-restore-BSeRv_oX.js","/assets/arrow-down-CxfBr57G.js","/assets/arrow-left-CPndpjhJ.js","/assets/arrow-up-C-Tk7buQ.js","/assets/arrow-up-narrow-wide-SqwUJnBP.js","/assets/arrow-up-right-DwpjFsbX.js","/assets/award-DKx6U9lI.js","/assets/ban-ByhMBM0-.js","/assets/bot-BfflaLQQ.js","/assets/boxes-DHAqydZv.js","/assets/braces-Bijo9twu.js","/assets/brigadirFilters-DBz8tfpD.js","/assets/broadcastTree-BIvU9frL.js","/assets/building-2--R-E92wc.js","/assets/calendar-X19WF5Xh.js","/assets/calendar-days-YrxssnZr.js","/assets/camera-DUU6zKgW.js","/assets/categories-Bnwl6mV2.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Ci_faPHa.js","/assets/chart-line-C5bzh4Ja.js","/assets/chart-pie-CC4SvpbR.js","/assets/chartRange-DwZ4eY60.js","/assets/check-check-2T7Sl3gu.js","/assets/chevron-left-D5o1Rkqo.js","/assets/chevrons-up-down-BkX2FK14.js","/assets/circle-Co4OqxKC.js","/assets/circle-alert-y4R_8E8P.js","/assets/circle-check-big-DW3J9ZRe.js","/assets/circle-dashed-Blga9mbx.js","/assets/circle-minus-DrsZBrrZ.js","/assets/circle-question-mark-D2slecgj.js","/assets/circle-slash-pFuSwWy7.js","/assets/circle-user-round-B9mNz-MK.js","/assets/clock-3-I545bScC.js","/assets/cloud-off-CWsbbwiH.js","/assets/cloud-upload-BGb7PoH2.js","/assets/compass-DLuXzgQ7.js","/assets/concernCategories-CI5KZu8R.js","/assets/copy-aLSeovJi.js","/assets/corner-down-right-CBBaeIwf.js","/assets/createLucideIcon-DaIrU6sx.js","/assets/es-Y_hK1Ri1.js","/assets/exportXlsx-DddmtuJ_.js","/assets/external-link-CE01ZseD.js","/assets/file-clock-BbsxDUGS.js","/assets/file-exclamation-point-CYbB0SVg.js","/assets/file-spreadsheet-BDn6astE.js","/assets/file-text-qDeJZMxT.js","/assets/flag-NBov9xdP.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D8EmgvBJ.js","/assets/hash-DpyhsSCl.js","/assets/history-B5hd9_bZ.js","/assets/hourglass-bpR8OQOh.js","/assets/image-C5_VCMHl.js","/assets/image-off-CJ3JeCDT.js","/assets/inbox-AxGFNjwF.js","/assets/index-BngiOmj1.css","/assets/index-Cs6YhNJt.js","/assets/key-round-CXB6JwvB.js","/assets/keyboard-CZ3ihdjY.js","/assets/languages-1ZnkJze7.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DXC9xLRR.js","/assets/lightbulb-DpYeBpZU.js","/assets/link-2-BUv1BjxV.js","/assets/link-2-off-C2DQT0GL.js","/assets/list-ordered-DuNsHwU4.js","/assets/list-tree-BAnhX-we.js","/assets/lock-open-Hpiibza5.js","/assets/log-in-DNrYZHdJ.js","/assets/maximize-2-Co_Ck5Q8.js","/assets/message-square-DC0-oKoP.js","/assets/minimize-2-CxW2U1Ku.js","/assets/package-check-BTYDOi6M.js","/assets/paperclip-CHYz3pkd.js","/assets/pencil-B7BxnW2I.js","/assets/percent-bW1LEx9d.js","/assets/pin-BdEyO7uU.js","/assets/pin-off-TRfsNULz.js","/assets/play-B8xBos41.js","/assets/plug-zap-BYGvu3SP.js","/assets/presentation-BsgOV0GG.js","/assets/prop-types-Dc8nmEMZ.js","/assets/radio-CQzFpg_C.js","/assets/react-apexcharts.esm-R7njcoi1.js","/assets/registers-DA8wWcRt.js","/assets/repeat-BXWoJX70.js","/assets/rotate-ccw-BsrQsfY9.js","/assets/rotate-cw-CqOCCvl2.js","/assets/save-DgQw1Kl1.js","/assets/scopeLinks-BhWR1MFI.js","/assets/scroll-text-CnhAaVMO.js","/assets/search-x-CfbWqaMc.js","/assets/segments-33v42HGS.js","/assets/send-BdbZjq_-.js","/assets/settings-2-Uu8jibAs.js","/assets/shield-CBVNi8rQ.js","/assets/shield-alert-BubcelJ8.js","/assets/shield-check-BVi8emo4.js","/assets/shield-question-mark-YozpYGU5.js","/assets/siren-3MFdSKUQ.js","/assets/snowflake-BPhgakbR.js","/assets/split-DYLRMaSE.js","/assets/square-Jc7tWZPt.js","/assets/square-check-big-CedN99kC.js","/assets/star-Fs7Nmqie.js","/assets/statusBands-Bbdcop47.js","/assets/store-Cp4nNXbn.js","/assets/table-2-CMcvpCS9.js","/assets/table-properties-VAZ8azrP.js","/assets/tag-CcF97rNE.js","/assets/timer-off-CeQMhfTF.js","/assets/trending-down-CnWl67FP.js","/assets/trending-up-BI0pHhKU.js","/assets/undo-2-DFqgZ3aE.js","/assets/useChartTheme-1Yz3F5t_.js","/assets/useElementWidth-BfY8bwPo.js","/assets/useIsMobile-B8VhFUjm.js","/assets/useOpenParam-CEprSfeU.js","/assets/useStatusBands-CX-4jw4X.js","/assets/useUrlScope-DgurYLZO.js","/assets/user-CQ5fmN7j.js","/assets/user-cog-DssHwxML.js","/assets/user-minus-CrEKDXhd.js","/assets/users-DN9eoJWY.js","/assets/video-CNictrcN.js","/assets/wallet-C6pCw4LD.js","/assets/warehouse-CBSClR20.js","/assets/x-CXG99kBt.js","/assets/zap-C05Jx3JT.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
