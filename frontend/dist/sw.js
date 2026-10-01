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

const BUILD = "2026-10-01T06:27:57.957Z";
const PRECACHE = ["/","/assets/AdminPanel-CGMWnxr7.js","/assets/AnalysisBoard-rrgsL1Nj.js","/assets/Arc-DS7TB_MG.js","/assets/ArcLegacy-DGGNW_h_.js","/assets/BrigadirProfile-BkTCRchS.js","/assets/BroadcastReceivers-Crdl4XAT.js","/assets/BroadcastRecord-DXU0SKge.js","/assets/CatLockNotice-BYfHdj6W.js","/assets/CategoryLegendModal-GfkOZ3Oh.js","/assets/CellConcerns-Pf4Q7czQ.js","/assets/CellDetails-D2H_Kgsm.js","/assets/CellFormModal-BzxmRnke.js","/assets/CellIdent-CHg9nNnp.js","/assets/CellLink-CUZrUOb2.js","/assets/Cells-BoqjTspf.js","/assets/ColumnFilter--3TXkqu4.js","/assets/ColumnsPicker-BXRockyt.js","/assets/CommentsModal-CRHZ9s3V.js","/assets/ComparisonTable-D2Me9maX.js","/assets/Concerns-D960gOOo.js","/assets/ConfirmDialog-DI229cbX.js","/assets/Daily-DKcqG3-w.js","/assets/DataTable-2_o8h131.js","/assets/DateRangePicker-BscrPNZv.js","/assets/DayReportView-dMyyUmUa.js","/assets/DayStepper-IJnxwjZQ.js","/assets/DifferenceBreakdown-BY3oR0Af.js","/assets/Downtime-DYVKvieF.js","/assets/Education-Csr33BiB.js","/assets/EducationLesson-Ckq80bkn.js","/assets/EmptyState-DFmx2sMv.js","/assets/Exam-DmqQYEeu.js","/assets/FactorySelect-QeNGvGw_.js","/assets/Gamification-Dcu13td-.js","/assets/GroupBadge-CL-AA24J.js","/assets/HeatmapChart-4IrcY3pC.js","/assets/IdleCell-Dxs1RYBt.js","/assets/KPICard-FLR-Uu7c.js","/assets/Kaizen-D-vwTVXN.js","/assets/Kelish-DklJsjhA.js","/assets/KpiDeltaCard-D2Yx0OkV.js","/assets/LangTextInput-CMCqVmcz.js","/assets/Layout-Cqupf0NG.js","/assets/LeaderAppeal-BvmOT_j2.js","/assets/LeaderDayReport-BexKyAHb.js","/assets/LeaderUnitReport-CT8jvY6b.js","/assets/Leaderboard-HQcVxkPG.js","/assets/Leaders-DgYvBpWb.js","/assets/Lightbox-Y09jTf0t.js","/assets/LiveOverview-BkKDGhFI.js","/assets/Login-B-0ndiBY.js","/assets/NotFound-9peQaAoH.js","/assets/Overview-CBpzbZix.js","/assets/Pagination-DGcWtG2u.js","/assets/PerenaladkaFactTable-B7inZkcY.js","/assets/PlanFulfillment-8a8vU0Sy.js","/assets/Production-CFaSU6bj.js","/assets/Profile-D3M2r7Qa.js","/assets/ProofCamera-DN04Ro9s.js","/assets/ProofPhoto-BeegyGOA.js","/assets/Quality-CCd0_EGu.js","/assets/RequestStateChip-BSNfVet2.js","/assets/RichTextEditor-C-Rb8Hjd.js","/assets/SaveState--Ln4rMzm.js","/assets/SearchInput-BuOk6SGH.js","/assets/SeasonalityHeatmap-ByFWQtb8.js","/assets/SegmentedToggle-CQR3Nb96.js","/assets/SetupTimes-BkSm8caC.js","/assets/ShiftDaily-D5mirs3A.js","/assets/Staff-BYsf2cnv.js","/assets/StatusBadge-CnwcL7QM.js","/assets/TargetGoal-XcBjVxx6.js","/assets/Targets-pFjPWXQT.js","/assets/Tasks-Dra4Gx-t.js","/assets/TimeWheelPicker-BsshtAUF.js","/assets/Tooltip-CX6E9HzK.js","/assets/TrendChart-Cfan-hJk.js","/assets/TripleSpeedometer-CqSbFGZY.js","/assets/Trudoyomkost-D3lxnDTx.js","/assets/UploadDropzone-Bt5LlUZ_.js","/assets/UsersActivity-C75pL0Lp.js","/assets/VerdictBlock-w_N69O3U.js","/assets/WatchProgress-Dzm1_fXA.js","/assets/WebLogin-Cwvi0j5m.js","/assets/WorkerConcerns-DlvrX4cO.js","/assets/Workers-D3rFEomP.js","/assets/Zagruzka-DvB-5_Ws.js","/assets/ZagruzkaCell-2wMpVU4c.js","/assets/api-DibgYs2G.js","/assets/archive-DQUMz1I1.js","/assets/archive-restore-DU_Q8Suy.js","/assets/arrow-down-IQcwX9l0.js","/assets/arrow-left-BLQH_S0m.js","/assets/arrow-left-right-P1pbtfmQ.js","/assets/arrow-up-DKcusWUt.js","/assets/arrow-up-narrow-wide-BBTFWIV3.js","/assets/arrow-up-right-BJwyRDZE.js","/assets/award-DkaJT0DF.js","/assets/ban-DfaGdlm-.js","/assets/bot-MHYAqe7m.js","/assets/boxes-DVuxOQNC.js","/assets/brigadirFilters-Ex_xTqHY.js","/assets/broadcastTree-CP6-XpZP.js","/assets/building-2-Gfebg89o.js","/assets/calendar-I1sE2UbM.js","/assets/calendar-clock-CUmz7g0a.js","/assets/calendar-days-CovAdXKj.js","/assets/calendar-range-CD4xpzBS.js","/assets/camera-D7-hu9AS.js","/assets/categories-BiPZI-8z.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CUBXtta7.js","/assets/chart-line-B8W3OFbp.js","/assets/chart-pie-KNOgPa4W.js","/assets/chartRange-B2-CgHp0.js","/assets/chevron-left-BaCcdy53.js","/assets/chevrons-up-down-U9q7fMgP.js","/assets/circle-D1ETG68X.js","/assets/circle-check-big-CTsMNplD.js","/assets/circle-dot-Bqewg4xN.js","/assets/circle-minus-BVqjL4z8.js","/assets/circle-slash-DV8BTEOc.js","/assets/circle-user-round-D3KkQ1fA.js","/assets/cloud-off-Dw6lfqc7.js","/assets/cloud-upload-qx0ipoL4.js","/assets/compass-BRCmdua8.js","/assets/concernCategories-B_K5db0U.js","/assets/copy-C6flXiw4.js","/assets/corner-down-right-DnRMnFsw.js","/assets/createLucideIcon-BX3VIgp_.js","/assets/es-BOUZCDes.js","/assets/exportXlsx-CsAJ-2su.js","/assets/external-link-D9mQNNM7.js","/assets/file-clock-CCWaz06S.js","/assets/file-exclamation-point-LMfIDkJr.js","/assets/file-spreadsheet-DTVwcjYG.js","/assets/file-text-BVgPQepW.js","/assets/flag-Bo2Uwsdt.js","/assets/flame-Bw7eKsLh.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BhXsIStw.js","/assets/hash-BbLfBPdb.js","/assets/history-DZde4mYL.js","/assets/hourglass-9nF1zq-A.js","/assets/image-B__3zYmm.js","/assets/image-off-BJZ2XttT.js","/assets/index-BbXTI5xr.css","/assets/index-Dg8E8vZ6.js","/assets/key-round-DKLsEm_g.js","/assets/keyboard-CtyUfKl_.js","/assets/languages-DZoDXh_r.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BqDcK9wl.js","/assets/lightbulb-COk42tPO.js","/assets/link-2-Eg_JIMbf.js","/assets/link-2-off-C8zHe0MB.js","/assets/list-checks-Cxcod2r4.js","/assets/list-ordered-BiX62cix.js","/assets/list-tree-CH3eol4J.js","/assets/lock-open-AF6p-d_M.js","/assets/log-in-DQ8SXXLu.js","/assets/maximize-2-BOJNsj2Z.js","/assets/message-square-egAKXj0X.js","/assets/minimize-2-BA6-EfAW.js","/assets/package-check-73Rzk8U-.js","/assets/paperclip-BN3G-18K.js","/assets/pencil-C1NkV-1_.js","/assets/percent-CkS-WfS4.js","/assets/personName-CogOuS3K.js","/assets/pin-SW098vCD.js","/assets/pin-off-CYFUEEHw.js","/assets/play-DHkGqgLi.js","/assets/plug-zap-DGLKEVbL.js","/assets/presentation-DlGe7iJk.js","/assets/prop-types-BV9CpPg7.js","/assets/radio-XPQV59V_.js","/assets/react-apexcharts.esm-DBZ_2yCY.js","/assets/repeat-PcEnnDwe.js","/assets/rotate-ccw-o_ksGt1U.js","/assets/rotate-cw-CIDBLsAD.js","/assets/save-CBm2xJv_.js","/assets/scale-CT6cDuwc.js","/assets/scopeLinks-JGHJSNg-.js","/assets/scroll-text-D-rvpFFD.js","/assets/search-x-DSqqTHzd.js","/assets/segments-DxfdLD3w.js","/assets/send-1BauAXBN.js","/assets/settings-2-Cbu_WZ6s.js","/assets/shield-8ykKUbzY.js","/assets/shield-alert-DSWzm8Sp.js","/assets/shield-check-CaZk45Di.js","/assets/shield-question-mark-BuwSaUe9.js","/assets/siren-Bd_nueF8.js","/assets/snowflake-t4hi_r-7.js","/assets/split-C1Ai3Pio.js","/assets/square-MkTt5jbJ.js","/assets/square-check-big-C7s1FqvB.js","/assets/star-xRI1PnrM.js","/assets/statusBands-LjLKHdQG.js","/assets/store-xwb_MwfK.js","/assets/table-2-BuHcW3T8.js","/assets/table-properties-BK--zPSv.js","/assets/tag-6XzGdEgk.js","/assets/timer-off-aPN7bhJ1.js","/assets/trending-down-B9dsVp2r.js","/assets/trending-up-DXB_jjcz.js","/assets/undo-2-Ca5K8izn.js","/assets/useChartTheme-Cq88ruan.js","/assets/useElementWidth-Dqq2tKHK.js","/assets/useIsMobile-sE0X0Ud8.js","/assets/useMutation-E1MEoiu4.js","/assets/useStatusBands-FMz0QjSo.js","/assets/useUrlScope-D-Agngk0.js","/assets/user-bnQpm4RF.js","/assets/user-cog--mMb96fv.js","/assets/user-minus-BGX25kJH.js","/assets/users-D031PTg5.js","/assets/video-MZSdIeY0.js","/assets/wallet-CcfdnGOi.js","/assets/warehouse-Q9yyxLnX.js","/assets/zap-BQgaIFEs.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
