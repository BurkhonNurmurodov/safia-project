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

const BUILD = "2026-10-04T19:35:02.487Z";
const PRECACHE = ["/","/assets/AdminPanel-BKg51o8d.js","/assets/AnalysisBoard-DHHbUHul.js","/assets/Arc-jo6qVyEi.js","/assets/ArcLegacy-DYfss6sV.js","/assets/BrigadirProfile-DrXNgD0Z.js","/assets/BroadcastReceivers-BiOiKLSx.js","/assets/BroadcastRecord-CvR2w8WW.js","/assets/CatLockNotice-DfvM4kcO.js","/assets/CategoryLegendModal-Bn7RqeDW.js","/assets/CellConcerns-CFsTjg0f.js","/assets/CellDetails-Bgh_AZt8.js","/assets/CellFormModal-BrCQRm3B.js","/assets/CellIdent-CQa_6bjI.js","/assets/CellLink-BIXMBa6U.js","/assets/Cells-BzVxTw5k.js","/assets/ColumnFilter-D9LrBaCL.js","/assets/ColumnsPicker-vfP8ZnWq.js","/assets/CommentsModal-Bbr54ixb.js","/assets/ComparisonTable-CElIKz0Z.js","/assets/Concerns-BCxKm0g3.js","/assets/ConfirmDialog-eR5Jua4v.js","/assets/Daily-JznGx9UU.js","/assets/DataTable-B_bOVrC8.js","/assets/DateRangePicker-XdbpbYp0.js","/assets/DayReportView-Dut5FtJj.js","/assets/DayStepper-DG_uKvNN.js","/assets/DifferenceBreakdown-Dzy5wysK.js","/assets/Downtime-0oaqovjs.js","/assets/Education-BwmS9Nnt.js","/assets/EducationLesson-92ZB_NJd.js","/assets/EmptyState-l7TVwIgl.js","/assets/Exam-DoVZe2iV.js","/assets/FactorySelect-DH-FzobL.js","/assets/Gamification-Dy1jRLV-.js","/assets/GroupBadge-DRFxcfRV.js","/assets/HeatmapChart-ZFGPD-GP.js","/assets/IdleCell-COoggTjl.js","/assets/KPICard-BpIgBZ7f.js","/assets/Kaizen-BRLbYDWd.js","/assets/Kelish-_qMk2doI.js","/assets/KpiDeltaCard-WRp9MLJR.js","/assets/LangTextInput-C4V-ht7d.js","/assets/Layout-BvFUOcaX.js","/assets/LeaderAppeal-Dee828pz.js","/assets/LeaderDayReport-CAC7tTiB.js","/assets/LeaderUnitReport-Yem2JUX3.js","/assets/Leaderboard-Dh8PTywR.js","/assets/Leaders-BnAXdkxy.js","/assets/Lightbox-TJ8X-FZc.js","/assets/LiveOverview-BWKJJAdL.js","/assets/Login-Dl_5ul9q.js","/assets/NotFound-BJrxq4Ce.js","/assets/Notifications-ByJYOrHN.js","/assets/Overview-RhG7jSWz.js","/assets/Pagination-CHwHt1XB.js","/assets/PerenaladkaFactTable-U1GM3qjf.js","/assets/PersonCard-S4LpBAQr.js","/assets/PlanFulfillment-MZzR3NDB.js","/assets/Production-IgmTZ3YC.js","/assets/Profile-BL4gaimR.js","/assets/ProofCamera-ChRlo601.js","/assets/ProofPhoto-BOvLfivr.js","/assets/Quality-FX6b2wR9.js","/assets/RawRows-CFTy-XfY.js","/assets/RequestStateChip-1NH_F7cA.js","/assets/RichTextEditor-CpnMPZg0.js","/assets/SaveState-CtjXwBhn.js","/assets/SearchInput-CyXTcfIf.js","/assets/SeasonalityHeatmap-Be53dhXc.js","/assets/SegmentedToggle-2_kDNYKf.js","/assets/SetupTimes-BMSmmc6v.js","/assets/ShiftDaily-BP1_Cvgq.js","/assets/Staff-XzdesLpK.js","/assets/StaffLive-Cgef2Ucn.js","/assets/StatusBadge-ClTyPvom.js","/assets/TargetGoal-D8jWGd46.js","/assets/Targets-BQ7jEiQ5.js","/assets/Tasks-D4V4I7iQ.js","/assets/TimeWheelPicker-B2VwDD1O.js","/assets/Toast-DUdpBlMp.js","/assets/Tooltip-1PyvMwyF.js","/assets/TrendChart-DepWt0N_.js","/assets/TripleSpeedometer-DQqe79MH.js","/assets/Trudoyomkost-2lIyAuDL.js","/assets/Turnover-C3Usyg_S.js","/assets/UploadDropzone-B0Qg_7G2.js","/assets/UsersActivity-BXc5koVm.js","/assets/VerdictBlock-LJXiFbCV.js","/assets/VfxApiMap-DswBTg4L.js","/assets/VfxDictionaries-De7nTOHC.js","/assets/VfxEmployees-DavFbMpF.js","/assets/VfxHrMoves-CfD0G5p4.js","/assets/VfxJobs-BDJf7_aW.js","/assets/VfxPhoto-F3RHGIWY.js","/assets/VfxShifts-B2FvWuvB.js","/assets/VfxState-BIiAYukt.js","/assets/VfxTimebooks-CWaBCmhP.js","/assets/VfxTimesheet-DaCKfJVB.js","/assets/WatchProgress-DTijH0yx.js","/assets/WebLogin-CjBfGkWv.js","/assets/WorkerConcerns-Co2WWuzE.js","/assets/Workers-lVmV4mHJ.js","/assets/Zagruzka-5KB75xc5.js","/assets/ZagruzkaCell-CtIIANJI.js","/assets/api-DCpfYIV5.js","/assets/archive-Bai3dx3h.js","/assets/archive-restore-t7K3K125.js","/assets/arrow-down-BZ98yVPt.js","/assets/arrow-left-DKWMt0WT.js","/assets/arrow-up-BCcgiNc8.js","/assets/arrow-up-narrow-wide-CN6onLdd.js","/assets/arrow-up-right-DRhxC6zW.js","/assets/award-uh8lbm5v.js","/assets/ban-DUs-LvFB.js","/assets/book-open-DXCNI4lb.js","/assets/bot-BF54Yz4_.js","/assets/boxes-CcehIJbq.js","/assets/braces-BqomOjxI.js","/assets/brigadirFilters-Da3xT4_V.js","/assets/broadcastTree-DDlOT7XS.js","/assets/building-2-C77oLUe5.js","/assets/calculator-BRO5tthC.js","/assets/calendar-Bve_XaTy.js","/assets/calendar-days-DsCtJOQd.js","/assets/camera-CT41p1Sp.js","/assets/categories-CT1BjCcD.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CMmzvNRU.js","/assets/chart-line-9EE1SIdO.js","/assets/chart-pie-C7CTumAb.js","/assets/chartRange-Rlt1bWTd.js","/assets/check-check-FUXGmsUD.js","/assets/chevron-left-fE1onwlb.js","/assets/chevrons-up-down-DJpRMxMT.js","/assets/circle-Bbe8IL-7.js","/assets/circle-alert-CRf5c7Kh.js","/assets/circle-check-big-DN7dSfd0.js","/assets/circle-dashed-8QBuz9i1.js","/assets/circle-minus-CyNw1oFH.js","/assets/circle-question-mark-MHEcEqa_.js","/assets/circle-slash-CZww94VY.js","/assets/circle-user-round-ChjaG1AI.js","/assets/clock-3-CRJCK8u_.js","/assets/cloud-off-COy2qiIn.js","/assets/cloud-upload-CxMabKaB.js","/assets/compass-CanHzLuY.js","/assets/concernCategories-BiBVJ8L8.js","/assets/copy-DfePkx3i.js","/assets/corner-down-right-BphWnYgs.js","/assets/createLucideIcon-D58qH0CG.js","/assets/es-DUjK9yKG.js","/assets/exportXlsx-DSIcGqIf.js","/assets/external-link-D597-lNg.js","/assets/file-clock-Tpbg1LMa.js","/assets/file-exclamation-point-Bh3Hm1XF.js","/assets/file-spreadsheet-BXNlDTAP.js","/assets/file-text-Cbj_r6q0.js","/assets/flag-DkSdavbw.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CNKYSI05.js","/assets/hash-ClHLE7Ks.js","/assets/history-CGngMxUm.js","/assets/hourglass-Bmy5xqDD.js","/assets/image-BfY5Uc8I.js","/assets/image-off-h8aKPeds.js","/assets/inbox-C09LPvnC.js","/assets/index-DeoTazBB.js","/assets/index-pR-A_axg.css","/assets/key-round-CNoeEUo-.js","/assets/keyboard-D32Yltel.js","/assets/languages-vfJwk-nE.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BJMo2drt.js","/assets/lightbulb-CB9KWnSo.js","/assets/link-2-CqCeNIEe.js","/assets/link-2-off-fLb1zNnr.js","/assets/list-ordered-OfTDVdZp.js","/assets/list-tree-BL1pMvAk.js","/assets/lock-open-B-zwMw3E.js","/assets/log-in-CXbGoRa_.js","/assets/maximize-2-B9dazJIm.js","/assets/message-square-BTJrxuAD.js","/assets/minimize-2-CJKRTyN_.js","/assets/package-check-nDZgSmdH.js","/assets/paperclip-CehJpWlf.js","/assets/pencil-94SvbFPV.js","/assets/percent-FETcn1pX.js","/assets/pin-off-HYnT_R8i.js","/assets/pin-qZj_hjH_.js","/assets/play-BtDcfjZQ.js","/assets/plug-zap-CbI5Lo49.js","/assets/presentation-DrhLRloI.js","/assets/prop-types-DR6XQ_rq.js","/assets/radio-7LMCxMmG.js","/assets/react-apexcharts.esm-CekZ_PQu.js","/assets/registers-I2UWuILZ.js","/assets/repeat-C8Cq3Bzz.js","/assets/rotate-ccw-CcOklJJ2.js","/assets/rotate-cw-DB51McBu.js","/assets/save-lKWSXuWA.js","/assets/scopeLinks-DkSMwCgy.js","/assets/scroll-text-B0unTxh1.js","/assets/search-x-CrgGMvGQ.js","/assets/segments-CS2zV7_b.js","/assets/send-B_Pa-4TM.js","/assets/settings-2-CQf8PFs7.js","/assets/shield-T28JEJMW.js","/assets/shield-alert-DFcQOba6.js","/assets/shield-check-BnvA-D9_.js","/assets/shield-question-mark-BVpTn5XR.js","/assets/siren-v1MNhc-_.js","/assets/snowflake-CbrT78Vl.js","/assets/split-CftOxbdO.js","/assets/square-C59aIF7r.js","/assets/square-check-big-BkFfi2eI.js","/assets/star-Bh9mh10G.js","/assets/statusBands-BOGHmdph.js","/assets/store-DD-l6ci7.js","/assets/table-2-Dgl-p_DN.js","/assets/table-properties-B6d-AcFq.js","/assets/tag-CNPm9-sK.js","/assets/timer-off-AiPlDo6m.js","/assets/trending-down-X0HXygtO.js","/assets/trending-up-DYbplvKJ.js","/assets/undo-2-CsPaBsCw.js","/assets/useChartTheme-_3-TeHPZ.js","/assets/useElementWidth-se4pnsJ3.js","/assets/useIsMobile-BxDVkzCE.js","/assets/useOpenParam-BOh-oD1m.js","/assets/useStatusBands-GOZEQji0.js","/assets/useUrlScope-DD-7dl-q.js","/assets/user-DeGFpjHm.js","/assets/user-cog-BTtKCg22.js","/assets/users-C8VgjaAM.js","/assets/vfx-BYSE6Si2.js","/assets/video-KjfwYhWh.js","/assets/wallet-DekdG7dO.js","/assets/warehouse-D59ZNu94.js","/assets/x-DQrolXc3.js","/assets/zap-DiDGD3q6.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
