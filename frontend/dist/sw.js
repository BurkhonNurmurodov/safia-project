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

const BUILD = "2026-10-23T12:23:23.828Z";
const PRECACHE = ["/","/assets/AdminPanel-Cf5vHM2l.js","/assets/AnalysisBoard-Bs_EQqRw.js","/assets/Arc-CW8fZSIL.js","/assets/Assistant-OHecJH0c.js","/assets/BrigadirProfile-DJs_LvtM.js","/assets/BroadcastReceivers-Bw_OAsM5.js","/assets/BroadcastRecord-C8zYbwGZ.js","/assets/Button-Loud6Sg1.js","/assets/CatLockNotice-Bn_5vunq.js","/assets/CategoryLegendModal-PWGZ0V8B.js","/assets/CellConcerns-jDpo1X0Y.js","/assets/CellDetails-DP_WKqD_.js","/assets/CellFormModal-BBElndI6.js","/assets/CellIdent-BC1z1XF-.js","/assets/CellLink-CvMj9gXW.js","/assets/Cells-BPe5EXjX.js","/assets/ColumnFilter-BCV0bnZ3.js","/assets/ColumnsPicker-DIhnTEiK.js","/assets/CommentsModal-Czj92X5Z.js","/assets/ComparisonTable-CupVkHlN.js","/assets/Concerns-DtxTRxgv.js","/assets/CountStepper-C3ErDjIS.js","/assets/Daily-fFVIUllC.js","/assets/DataTable-CeMPrLeE.js","/assets/DateRangePicker-C_HWNve-.js","/assets/DayReportView-C2eJls_Q.js","/assets/DayStepper-DtrCzrz8.js","/assets/DayStrip-DhHWZ9c7.js","/assets/DifferenceBreakdown-uyJogq8p.js","/assets/Downtime-CIoMglnZ.js","/assets/Education-MzoY2Ma3.js","/assets/EducationLesson-BW3dp8JL.js","/assets/EmptyState-D_6yBiPT.js","/assets/Exam-k5QC0FWo.js","/assets/FactorySelect-BZXUFEbo.js","/assets/Gamification-DBXuNXLQ.js","/assets/GroupBadge-BopayWG0.js","/assets/HeatmapChart-BPspqe6p.js","/assets/IdleCell-BQ5trdIr.js","/assets/KPICard-DH0nJvU-.js","/assets/Kaizen-Dg-fSwk0.js","/assets/Kelish-D6VPbOjG.js","/assets/KpiDeltaCard-DIqTDTxR.js","/assets/LangTextInput-DaswlaJ0.js","/assets/Layout-B7bbxICQ.js","/assets/LeaderAppeal-CmtZo9mj.js","/assets/LeaderDayReport-D5C3_W3q.js","/assets/LeaderUnitReport-B-AWwqFG.js","/assets/Leaderboard-CkY98O_6.js","/assets/Leaders-BDR-S6LB.js","/assets/LeadersKpi-DuonlTzb.js","/assets/Lightbox-Bslksah_.js","/assets/LiveOverview-DxIp4Xts.js","/assets/Login-D2uSjcaK.js","/assets/NotFound-UltJwQ7B.js","/assets/Notifications-CXP3hC1K.js","/assets/Ontime-BCxf-Ms9.js","/assets/Overview-DrLV3o2x.js","/assets/Pagination-TJKA4rXe.js","/assets/PerenaladkaFactTable-CJd-HNhZ.js","/assets/PersonCard-DZ6ibUnN.js","/assets/PlanFulfillment-_j_RQvGB.js","/assets/Production-DKsKcIvR.js","/assets/Profile-BpVhynIA.js","/assets/ProofCamera-BB0WKU-k.js","/assets/ProofPhoto-DqaTKcP_.js","/assets/Quality-CU5IksLo.js","/assets/RawRows-DkQYPhiG.js","/assets/RequestStateChip-CmKWF0gL.js","/assets/RichTextEditor-B3jXWuYb.js","/assets/SaveState-jM1LRLxo.js","/assets/SearchInput-BIRU6n_A.js","/assets/SeasonalityHeatmap-CAI0b65_.js","/assets/SegmentedToggle-sbLs9XXC.js","/assets/SetupTimes-BLqimrOX.js","/assets/ShiftDaily-Dr75U4_l.js","/assets/Staff-CrhvLgYX.js","/assets/StaffListAtCheck-CiRhDeqR.js","/assets/StatusBadge-Cz1yCtOr.js","/assets/StatusBandsModal-0wdDNUQr.js","/assets/TargetGoal-CXkkAstH.js","/assets/Targets-CUP07Uet.js","/assets/Tasks-BTXKddKI.js","/assets/TimeWheelPicker-Bk03yJbd.js","/assets/Toast-guYNAHF4.js","/assets/Tooltip-D2PNPEtM.js","/assets/TrendChart-Cr_CcLsp.js","/assets/TripleSpeedometer-fdsFg2LT.js","/assets/Trudoyomkost-COFqsKM8.js","/assets/UploadDropzone-BlyB3I3m.js","/assets/UsersActivity-BgKMGD5z.js","/assets/VerdictBlock-BJ3bjPA1.js","/assets/VfxApiMap-D7EN0K_H.js","/assets/VfxDictionaries-TjrXJ13z.js","/assets/VfxEmployees-DZ-x4Bnx.js","/assets/VfxHrMoves-0y1xEeYA.js","/assets/VfxJobs-CwgGKDlE.js","/assets/VfxPhoto-CQNV4j41.js","/assets/VfxShifts-B8PVJfft.js","/assets/VfxState-_zh5pUOo.js","/assets/VfxTimebooks-B6d5Kbl0.js","/assets/VfxTimesheet-D8IYyC5e.js","/assets/WatchProgress-BshK_Ary.js","/assets/WebLogin-DVKQL2xl.js","/assets/Workers-DyLMTSmK.js","/assets/Zagruzka-CqwckIjp.js","/assets/ZagruzkaCell-BhIR3IcH.js","/assets/api-CV431-Ii.js","/assets/archive-H8EROLQL.js","/assets/archive-restore-85sZqLs6.js","/assets/arrow-down-B1Hpe5E2.js","/assets/arrow-down-right-pRWYsVgj.js","/assets/arrow-down-wide-narrow-LM29X7uz.js","/assets/arrow-up-narrow-wide-1E6ji5ft.js","/assets/ban-CbLY8Tww.js","/assets/boxes-CSxqJuSS.js","/assets/braces-Cu3y06z4.js","/assets/brigadirFilters-JcxAW7mf.js","/assets/broadcastTree-BibsPxXH.js","/assets/building-2-CQrXUpUL.js","/assets/calendar-BFOZPXY4.js","/assets/calendar-days-Bz03apza.js","/assets/camera-Blgif2j-.js","/assets/categories-DZmGiUTF.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BFjcBE3V.js","/assets/chart-line-PVCs04cK.js","/assets/chart-pie-BlT7M7zs.js","/assets/chartRange-D-E0yo50.js","/assets/check-check-DprGbRzM.js","/assets/chevron-left-aTrpwd_d.js","/assets/chevrons-up-down-k43ipYds.js","/assets/circle-C35Jb8GL.js","/assets/circle-alert-CD3pxpBZ.js","/assets/circle-check-big-C-tReKaQ.js","/assets/circle-dashed-CkFQJ6zi.js","/assets/circle-minus-Bzb_lEn3.js","/assets/circle-question-mark-BDPs_Cz3.js","/assets/circle-slash-C_P7qN4Z.js","/assets/circle-user-round-4WVfyjow.js","/assets/cloud-off-bpUAi-K5.js","/assets/cloud-upload-C-F_fuxF.js","/assets/compass-DfrUysEz.js","/assets/concernCategories-a7yWPvpQ.js","/assets/corner-down-right-DMsnMPRf.js","/assets/createLucideIcon-BP3kt6ZG.js","/assets/es-Dek8xtmg.js","/assets/external-link-DX3qkuiv.js","/assets/file-clock-BmWJnqQA.js","/assets/file-exclamation-point-CVvrzin1.js","/assets/flag-DpxWi7ts.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BlOfwKRu.js","/assets/funnel-BM0gHjR7.js","/assets/hash-7PCwTf7J.js","/assets/hourglass-BEuTHeTU.js","/assets/image-Dv4n3j6n.js","/assets/image-off-qTJLu2gl.js","/assets/inbox-CKmXYwTh.js","/assets/index-BaHyU2J5.js","/assets/index-DFvJry-Q.css","/assets/keyboard-D_oRswbu.js","/assets/languages-Dw8gdPSa.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DAqSutjT.js","/assets/leaderBoard-CTtPWXCG.js","/assets/lightbulb-DRx1IXwh.js","/assets/link-2-BFzA_uav.js","/assets/link-2-off-D5IM9A_m.js","/assets/list-ordered-BanOitA2.js","/assets/list-tree-CaNrOPKp.js","/assets/lock-open-KV130A45.js","/assets/log-in-CsMwg6rB.js","/assets/map-pin-Dt-1LPZP.js","/assets/marks-2Jf7hKJW.js","/assets/minimize-2-aG4nTPH8.js","/assets/package-check-CkWXETlK.js","/assets/pencil-D3jXK5bT.js","/assets/percent-BFfPCjep.js","/assets/pin-BS94Ok9x.js","/assets/pin-off-tqPLnuUm.js","/assets/play-Drjh5KNi.js","/assets/plug-zap-dRVYzQEz.js","/assets/prop-types-BhCpzNlW.js","/assets/radio-BxWScZOA.js","/assets/react-apexcharts.esm-CtMfVin1.js","/assets/registers-Dmo6rFsD.js","/assets/repeat-D1TWavJ-.js","/assets/save-Ct9FdZyu.js","/assets/scopeLinks-DsS09thP.js","/assets/scroll-text-DCXXZfv5.js","/assets/search-x-noiQPs8W.js","/assets/segments-Ba2GiEx2.js","/assets/send-Dcuv3Uaz.js","/assets/settings-2-8ZnCUIm0.js","/assets/shield-B7QWvn7f.js","/assets/shield-alert-D-b5Gc9e.js","/assets/shield-question-mark-qPGl4qYU.js","/assets/sigma-UucaPeT2.js","/assets/siren-DFK7AoQu.js","/assets/snowflake-B6hzycId.js","/assets/split-kpGfRYe6.js","/assets/square-check-big-BKoK5TA3.js","/assets/star-CAZypH2h.js","/assets/statusBands-CAfljJrf.js","/assets/store-oFYvZaAv.js","/assets/table-2-CPNdfoeC.js","/assets/table-properties-CzQJEei7.js","/assets/tag-CfF-9ZIy.js","/assets/timer-off-By_y-iBk.js","/assets/trendBuckets-Dyzck0Gp.js","/assets/trending-down-DJHFU7-X.js","/assets/trending-up-DV1rt4nY.js","/assets/undo-2-g1MAgOVL.js","/assets/useChartTheme-BPA9rPVr.js","/assets/useElementWidth-B_Ix28tu.js","/assets/useIsMobile-CfNNbbTZ.js","/assets/useOpenParam-CCxoBcG1.js","/assets/useStatusBands-Cvy1_Fm_.js","/assets/useUrlScope-b9h46mkJ.js","/assets/user-B9vCNXOE.js","/assets/user-cog-DgloDdq2.js","/assets/user-minus-CX9zFY4S.js","/assets/users-k2d5q6D6.js","/assets/vfx-BcB9TJx2.js","/assets/video-CBM_soiu.js","/assets/wallet-DnHu_r1t.js","/assets/warehouse-CM84M517.js","/assets/workflow-wwTC66aC.js","/assets/x-DEs8nyXB.js","/assets/zap-umzLqGqu.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
