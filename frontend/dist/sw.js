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

const BUILD = "2026-10-03T09:43:32.103Z";
const PRECACHE = ["/","/assets/AdminPanel-o82lYZ9L.js","/assets/AnalysisBoard-BHdnuBPz.js","/assets/Arc-BluRuHpD.js","/assets/ArcLegacy-CvadTXAj.js","/assets/BrigadirProfile-Cq7k00Es.js","/assets/BroadcastReceivers-BXXrl3LT.js","/assets/BroadcastRecord-DDOpmOL9.js","/assets/CatLockNotice-EmOvkTSV.js","/assets/CategoryLegendModal-ByejscsX.js","/assets/CellConcerns-OYzalZA2.js","/assets/CellDetails-D1gw65Kd.js","/assets/CellFormModal-By1DwjSi.js","/assets/CellIdent-tJWPQ0NJ.js","/assets/CellLink-zTX2aLB3.js","/assets/Cells-vXBxUpQv.js","/assets/ColumnFilter-Dy69ZBZa.js","/assets/ColumnsPicker-CWMy-1n4.js","/assets/CommentsModal-DPh-p707.js","/assets/ComparisonTable-K3IrSwE2.js","/assets/Concerns-Ds6DJ-AK.js","/assets/ConfirmDialog-hMJ3hC6b.js","/assets/Daily-zkcD0Wz6.js","/assets/DataTable-BFWsl65Y.js","/assets/DateRangePicker-BXmbmcsK.js","/assets/DayReportView-BUl2CL7K.js","/assets/DayStepper-DxTbwPPv.js","/assets/DifferenceBreakdown-CDmqayL4.js","/assets/Downtime-C3Z_8J-H.js","/assets/Education-r5ab-r3K.js","/assets/EducationLesson-C_sBwzw7.js","/assets/EmptyState-CJa3sWM4.js","/assets/Exam-BSO-u7vp.js","/assets/FactorySelect-BiSV558K.js","/assets/Gamification-ylvuCaVb.js","/assets/GroupBadge-BiShNsZV.js","/assets/HeatmapChart-Dn9Gscmw.js","/assets/IdleCell-BlBFzkBU.js","/assets/KPICard-Qmn98v3T.js","/assets/Kaizen-BYDVIPxG.js","/assets/Kelish-Bn4HyaHX.js","/assets/KpiDeltaCard-BNGprXuw.js","/assets/LangTextInput-lKpykimO.js","/assets/Layout-DGjwfw6Y.js","/assets/LeaderAppeal-Dy__XbRB.js","/assets/LeaderDayReport-BpnDbZAH.js","/assets/LeaderUnitReport-Cpl3ZXdi.js","/assets/Leaderboard-E391vYqc.js","/assets/Leaders-DxieXuyg.js","/assets/Lightbox-QvNDYUX_.js","/assets/LiveOverview-Cije_4SO.js","/assets/Login-bHWkhklF.js","/assets/NotFound-DTjZJf-T.js","/assets/Notifications-DEIJ_CGB.js","/assets/Overview-DwqYa005.js","/assets/Pagination-B3L0eX-j.js","/assets/PerenaladkaFactTable-V6CJyPxp.js","/assets/PersonCard-B-92hwbl.js","/assets/PlanFulfillment-BTFk-J_j.js","/assets/Production-DVVdKaaV.js","/assets/Profile-BajReS7w.js","/assets/ProofCamera-B_6ROeU6.js","/assets/ProofPhoto-CYmcObhl.js","/assets/Quality-C37aWxgZ.js","/assets/RawRows-BCFF-J48.js","/assets/RequestStateChip-CA5kBpRG.js","/assets/RichTextEditor-Br8zquwN.js","/assets/SaveState-CC6qNA4h.js","/assets/SearchInput-C92_VrDZ.js","/assets/SeasonalityHeatmap-CCV2V9-e.js","/assets/SegmentedToggle-D4kv8gpA.js","/assets/SetupTimes-C7j_rC0i.js","/assets/ShiftDaily-Dzg7iyC_.js","/assets/Staff-BO4Q_Ulr.js","/assets/StaffLive--du9X3x8.js","/assets/StatusBadge-BBvb9sCa.js","/assets/TargetGoal-BbLHyXs5.js","/assets/Targets-Dy3csd_Z.js","/assets/Tasks-Cv3jx1yj.js","/assets/TimeWheelPicker-Dlut1X2t.js","/assets/Toast-LIFlS9nu.js","/assets/Tooltip-CrPnIvhJ.js","/assets/TrendChart-CCeJNg72.js","/assets/TripleSpeedometer-9qTlzYTL.js","/assets/Trudoyomkost-m-eh_jy2.js","/assets/UploadDropzone-BOGqTPtk.js","/assets/UsersActivity-D01LKXkN.js","/assets/VerdictBlock-XY3XLEur.js","/assets/VfxApiMap-BoXhwlUE.js","/assets/VfxEmployees-CZHudSn9.js","/assets/VfxJobs-CtmLtJO8.js","/assets/VfxMarks-bv_tNTKI.js","/assets/VfxOnSite-C3dRnOF0.js","/assets/VfxPhoto-BHgwysPF.js","/assets/VfxState-BmD9sTY4.js","/assets/VfxStructure-Bpd3R_ZK.js","/assets/VfxTable-apJO5cS1.js","/assets/VfxTimesheet-rY383EAv.js","/assets/WatchProgress-D1k_jWBs.js","/assets/WebLogin-CEpdm0Ds.js","/assets/WorkerConcerns-BLNUG2Ja.js","/assets/Workers-ioegpL2M.js","/assets/Zagruzka-DfAAgocV.js","/assets/ZagruzkaCell-DfG0l3Tw.js","/assets/api-Df9pnme5.js","/assets/archive-RrPnCDeo.js","/assets/archive-restore-DEOglzgN.js","/assets/arrow-down-D0sIakUZ.js","/assets/arrow-left-CNBby5y-.js","/assets/arrow-right-left-BFmbU1qT.js","/assets/arrow-up-aDQQeeys.js","/assets/arrow-up-narrow-wide-Vpqk5CWJ.js","/assets/arrow-up-right-n0KNL1Up.js","/assets/award-By5PXNoS.js","/assets/ban-DSfuAEO5.js","/assets/bot-BAtL82OD.js","/assets/boxes-D2fQtyb-.js","/assets/braces-BRF5BPAY.js","/assets/brigadirFilters-xewWJY7C.js","/assets/broadcastTree-DRtZ_q8C.js","/assets/building-2-CP_YmgHr.js","/assets/calendar-DicOxV_-.js","/assets/calendar-days-RIZCKSWT.js","/assets/camera-u_CTCncb.js","/assets/categories-QGrtcq--.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DwiXNNPk.js","/assets/chart-line-DM9RblDJ.js","/assets/chart-pie-BeZ25esX.js","/assets/chartRange-QyJrcWgi.js","/assets/chevron-left-GHOYavfh.js","/assets/chevrons-up-down-DWAEdhdn.js","/assets/circle-ES9q2qEQ.js","/assets/circle-alert-C5ICl_4s.js","/assets/circle-check-big-Aw3tSc7J.js","/assets/circle-dashed-BfBGBdjz.js","/assets/circle-minus-DYYGzc8_.js","/assets/circle-question-mark-DFM5cFQK.js","/assets/circle-slash-D3KCJR_a.js","/assets/circle-user-round-MMcCf1mZ.js","/assets/clock-3-DhOxQcim.js","/assets/cloud-off-D9MpGSH2.js","/assets/cloud-upload-DeIGYjyA.js","/assets/compass-DA4Ca-Si.js","/assets/concernCategories-C2tOaJfv.js","/assets/copy-tm9WsJSz.js","/assets/corner-down-right-B_ZTY93E.js","/assets/createLucideIcon-DTXcURHa.js","/assets/door-open-C0Y_FcZM.js","/assets/es-CvqC9bp5.js","/assets/exportXlsx-JvBdMRcz.js","/assets/external-link-B2l5KW7a.js","/assets/file-clock-cd6PpM0h.js","/assets/file-exclamation-point-DDjjevYM.js","/assets/file-spreadsheet-CVD0RKio.js","/assets/file-text-BtTrmRbC.js","/assets/flag-ZjHj415E.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BcRY0965.js","/assets/hash-hAgzMepN.js","/assets/history-C4NLTsB2.js","/assets/hourglass-C1yJOPfu.js","/assets/image-CpiMYwfw.js","/assets/image-off-f5tOVugh.js","/assets/inbox-Re5vlO-K.js","/assets/index-Bc1m5P-9.css","/assets/index-BnfWmYxe.js","/assets/key-round-FdIRmyQO.js","/assets/keyboard-CpNjIWk9.js","/assets/languages-BVPuG8VW.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DLC6iOfS.js","/assets/lightbulb-BZtX4Tr7.js","/assets/link-2-CVvUmbnw.js","/assets/link-2-off-CHUm0nHV.js","/assets/list-ordered-U4k_GL6R.js","/assets/list-tree-DE_K_AAA.js","/assets/lock-open-BWo9JLy7.js","/assets/log-in-DyYBMexA.js","/assets/maximize-2--3eZbpwR.js","/assets/message-square-RqB9mob7.js","/assets/minimize-2-pJJ4YAiH.js","/assets/package-check-tc4XbQXZ.js","/assets/paperclip-BsxELl5W.js","/assets/pencil-DKlx_nhD.js","/assets/percent-BDntgbgL.js","/assets/phone-BkAAYfiZ.js","/assets/pin-off-DZEAiypU.js","/assets/pin-tElTpTiz.js","/assets/play-C4x4zu7k.js","/assets/plug-zap-l2lVP0Dp.js","/assets/presentation-Cfvw8Fty.js","/assets/prop-types-CavyRZpC.js","/assets/radio-DMdOb_h3.js","/assets/react-apexcharts.esm-BNPg6Ex8.js","/assets/repeat-C3IrsB1C.js","/assets/rotate-ccw-BAr3pryd.js","/assets/rotate-cw-BlHq3Ixh.js","/assets/save-6-QUF6q1.js","/assets/scopeLinks-DXQ0U387.js","/assets/scroll-text-MV01H_Dj.js","/assets/search-x-B62U4-wO.js","/assets/segments-qCjUDEiQ.js","/assets/send-BXvmta2H.js","/assets/settings-2-B8G32G7N.js","/assets/shield-DfdiB2nh.js","/assets/shield-alert-Ci3ftBYz.js","/assets/shield-check-DHlOyaFq.js","/assets/shield-question-mark-SmKYzTn6.js","/assets/siren-BXszhQE_.js","/assets/snowflake-ALIHnMAU.js","/assets/split-skz5dwob.js","/assets/square-BU8jO90a.js","/assets/square-check-big-BJbjosmY.js","/assets/star-BiGlxpDE.js","/assets/statusBands-B5mryuc6.js","/assets/store-DKuBPHpl.js","/assets/table-2-DdruL6bK.js","/assets/table-properties-C7rzIK5v.js","/assets/tag-rFZomL2d.js","/assets/timer-off-C1EBtoRp.js","/assets/trending-down-BJRUlrbC.js","/assets/trending-up-JLEH8oru.js","/assets/undo-2-C7qNrkn9.js","/assets/useChartTheme-Nox0cBjF.js","/assets/useElementWidth-ktRpEvia.js","/assets/useIsMobile-BN-alIfC.js","/assets/useOpenParam--fMKtjhv.js","/assets/useStatusBands-CF-vKuHy.js","/assets/useUrlScope-B3-t1vhO.js","/assets/user-CKSnsUb4.js","/assets/user-cog-KLKx4kcR.js","/assets/user-minus-3bFJOp1y.js","/assets/users-J4c0Afsn.js","/assets/video-D4pAXoLk.js","/assets/wallet-BD08sTl9.js","/assets/warehouse-3vlOddF9.js","/assets/x-DOq8xNK0.js","/assets/zap-olmuvkBL.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
