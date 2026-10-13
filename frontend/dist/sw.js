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

const BUILD = "2026-10-13T16:06:05.210Z";
const PRECACHE = ["/","/assets/AdminPanel-DQUU1KiH.js","/assets/AnalysisBoard-DWIO6nu9.js","/assets/Arc-BNe3O6aZ.js","/assets/Assistant-DnulPct8.js","/assets/BrigadirProfile-CA0TzPFd.js","/assets/BroadcastReceivers-Cc2eX6W4.js","/assets/BroadcastRecord-Cx00GwMJ.js","/assets/Button-hNnGOhrp.js","/assets/CatLockNotice-B-ixzZKT.js","/assets/CategoryLegendModal-DUca7IQ5.js","/assets/CellConcerns-BgBeb1_g.js","/assets/CellDetails-8HopP3_l.js","/assets/CellFormModal-D7qmrBhh.js","/assets/CellIdent-Dc78mpBr.js","/assets/CellLink-DNhqfBs1.js","/assets/Cells-DDpUvsrC.js","/assets/ColumnFilter-DCpFU4TI.js","/assets/ColumnsPicker-DaTvs189.js","/assets/CommentsModal-DaABi5OZ.js","/assets/ComparisonTable-DzFMmgay.js","/assets/Concerns-CLYLVLDJ.js","/assets/CountStepper-CXzbqQ0e.js","/assets/Daily-BQwfaVtj.js","/assets/DataTable-CZoQVA4R.js","/assets/DateRangePicker-BorAWKgs.js","/assets/DayReportView-BVX-8odq.js","/assets/DayStepper-DqEAOVYT.js","/assets/DifferenceBreakdown-C7PAnjaA.js","/assets/Downtime-IKtHPuXF.js","/assets/Education-6eNBPXBg.js","/assets/EducationLesson-CW-1qxUW.js","/assets/EmptyState-CH8nO3ql.js","/assets/Exam-CAlo2s5D.js","/assets/FactorySelect-BtnNMkfn.js","/assets/Gamification-C_5ZNTCr.js","/assets/GroupBadge-BU33Etwd.js","/assets/HeatmapChart-XkBV3__K.js","/assets/IdleCell-C3Yf6jJ-.js","/assets/KPICard-BKio3DeM.js","/assets/Kaizen-WMv5pqEU.js","/assets/Kelish-ADNwhw6R.js","/assets/KpiDeltaCard-DpfcZoB8.js","/assets/LangTextInput-DRfI7WBL.js","/assets/Layout-_30ePnvM.js","/assets/LeaderAppeal-Dnom3JgM.js","/assets/LeaderDayReport-CanSx3k7.js","/assets/LeaderUnitReport-BtvRav0G.js","/assets/Leaderboard-BaN7EQSK.js","/assets/Leaders-CGvKob_8.js","/assets/Lightbox-16grU3n8.js","/assets/LiveOverview-BSFpnZAZ.js","/assets/Login-BCT1j5vV.js","/assets/NotFound-BZVE2XXH.js","/assets/Notifications-7YZSRMpR.js","/assets/Overview-iaq4Y65k.js","/assets/Pagination-BlFboOJr.js","/assets/PerenaladkaFactTable-PkgsS3kk.js","/assets/PersonCard-DfdmU2YB.js","/assets/PlanFulfillment-9JYffQHq.js","/assets/Production-CNUKjhLU.js","/assets/Profile-C8zzeXL2.js","/assets/ProofCamera-C__PKPiF.js","/assets/Quality-DUQhzIqS.js","/assets/RawRows-DvDPbT4Q.js","/assets/RequestStateChip-BSTOKcNp.js","/assets/RichTextEditor-B62YM5L2.js","/assets/SaveState-CJFF1dLj.js","/assets/SearchInput-BCx0qesq.js","/assets/SeasonalityHeatmap-CrinzrX4.js","/assets/SegmentedToggle-Bx3vJs7M.js","/assets/SetupTimes-C-0BEwJP.js","/assets/ShiftDaily-CutlFLP7.js","/assets/Staff-BAXZbJG1.js","/assets/StaffListAtCheck-i2nfdkEm.js","/assets/StatusBadge-CFM3w3_x.js","/assets/TargetGoal-JcjHZnsx.js","/assets/Targets-J0JsrFra.js","/assets/Tasks-59rIXrq7.js","/assets/TimeWheelPicker-CwjbIP0Z.js","/assets/Toast-B11QdHfv.js","/assets/Tooltip-D0hQqF_L.js","/assets/TrendChart-DEo3VV3u.js","/assets/TripleSpeedometer-B4iMbjgR.js","/assets/Trudoyomkost-W3dFaH7v.js","/assets/Turnover-ZgJzauh9.js","/assets/UploadDropzone-YH_Zp8Qs.js","/assets/UsersActivity-DHuTsLd7.js","/assets/VerdictBlock-CZ3e9jlv.js","/assets/VfxApiMap-tP-ERnTL.js","/assets/VfxDictionaries-Bs9E4TM2.js","/assets/VfxEmployees-DOusDYDZ.js","/assets/VfxHrMoves-CchHnN66.js","/assets/VfxJobs-CagZB5AM.js","/assets/VfxPhoto-CdsGpBBu.js","/assets/VfxShifts-CZgHQhhG.js","/assets/VfxState-CrATuenm.js","/assets/VfxTimebooks-DQNeaPp6.js","/assets/VfxTimesheet-tsgD9FBG.js","/assets/WatchProgress-5-jGJ8h1.js","/assets/WebLogin-JRQiG-Qv.js","/assets/WorkerConcerns-4sv4PoQA.js","/assets/Workers-G1N7MVqw.js","/assets/Zagruzka-Bel78xnz.js","/assets/ZagruzkaCell-DCnVUxRD.js","/assets/api-A9hkKYuS.js","/assets/archive-CEkrXIez.js","/assets/archive-restore-BaQs2zgN.js","/assets/arrow-down-DEH_EPop.js","/assets/arrow-down-wide-narrow-C7n8dOfN.js","/assets/arrow-up-narrow-wide-IlAL29A9.js","/assets/award-D_CrKIHx.js","/assets/ban-CbTt0naY.js","/assets/boxes-DmFGJoLg.js","/assets/braces-lkbuQbYI.js","/assets/brigadirFilters-CmZyt-e2.js","/assets/broadcastTree-iV_SsOZo.js","/assets/building-2-RXXtzbs2.js","/assets/calculator-BUcrFGSO.js","/assets/calendar-DlYUFmNj.js","/assets/calendar-days-D2vM0nSo.js","/assets/camera-Bpr2xagU.js","/assets/categories-DQx9E2jm.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-HF_W0zZ5.js","/assets/chart-line-CRIB6KQt.js","/assets/chart-pie-jKT_dKew.js","/assets/chartRange-B1VgB5hS.js","/assets/check-check-Dc7NemkU.js","/assets/chevron-left-DCapWjjs.js","/assets/chevrons-up-down-DtXWRPUB.js","/assets/circle-JiYdoo7_.js","/assets/circle-alert-DdKOt6aA.js","/assets/circle-check-big-DKdcLez1.js","/assets/circle-dashed-B2NaaIQm.js","/assets/circle-minus-RnpPTb0A.js","/assets/circle-question-mark-BHrE3NiW.js","/assets/circle-slash-BC7eQk2d.js","/assets/circle-user-round-CxuzEOYo.js","/assets/clock-3-Cc3cfFqy.js","/assets/cloud-off-B844NJoT.js","/assets/cloud-upload-Dj2mxXdh.js","/assets/compass-D49LEQHy.js","/assets/concernCategories-DxvcnwFi.js","/assets/copy-Cim67Jc-.js","/assets/corner-down-right-Ci7QYIRR.js","/assets/createLucideIcon-hmykkCF6.js","/assets/es-BBIvPtgi.js","/assets/external-link-9AZWunF9.js","/assets/file-clock-DXGl65SY.js","/assets/file-exclamation-point-CwoYOkTP.js","/assets/flag-w5zB6SZa.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CQCm_MWa.js","/assets/hash-BTxNUNm6.js","/assets/hourglass-B9wxQEY0.js","/assets/image-jX43Ci7D.js","/assets/image-off-BCqmf2Io.js","/assets/inbox-DBiDnD_Q.js","/assets/index-7f1rnqtY.css","/assets/index-Bk15Bznk.js","/assets/keyboard-C0yieAq6.js","/assets/languages-Bk3U2se0.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BN2QAdHp.js","/assets/lightbulb-DRCdUGU0.js","/assets/link-2-Ca1dntwB.js","/assets/link-2-off-BaNtEWCq.js","/assets/list-ordered-DBRaYQkv.js","/assets/list-tree-DdLT6faH.js","/assets/lock-open-Yi11Q7nX.js","/assets/log-in-DJWArZuo.js","/assets/marks-DeKXwQqp.js","/assets/minimize-2-CsO7aq4b.js","/assets/package-check-DH0UmZuV.js","/assets/pencil-DGd5El72.js","/assets/percent-Di7G1LBN.js","/assets/pin-DNXs3b4M.js","/assets/pin-off-N70qFLaN.js","/assets/play-BFjkwymi.js","/assets/plug-zap-BDxuSK5K.js","/assets/prop-types-v6lUt8T_.js","/assets/radio-FpY0Hbsz.js","/assets/react-apexcharts.esm-K4cROB_t.js","/assets/registers-Bqej3eeb.js","/assets/repeat-C-fRAb71.js","/assets/save-fvYnY2Bg.js","/assets/scopeLinks-DjEWomHD.js","/assets/scroll-text-G0qBNakU.js","/assets/search-x-XALnIPO9.js","/assets/segments-D2gwqBjo.js","/assets/send-OiQT6Mfc.js","/assets/settings-2-4xmBQiCo.js","/assets/shield-OH3RaXDV.js","/assets/shield-alert-vyM-A5tt.js","/assets/shield-question-mark-C0qyhcKl.js","/assets/siren-B0ocKWXS.js","/assets/snowflake-COw09Ch4.js","/assets/split-BXrBDLfO.js","/assets/square-check-big-DJYlGRww.js","/assets/star-Dbz2JKzD.js","/assets/statusBands-X74gSBa-.js","/assets/store-DQXIFsl9.js","/assets/table-2-B_L5ZlBI.js","/assets/table-properties-DaIjpRk5.js","/assets/tag-Bt8qHVF8.js","/assets/timer-off-hwRHJ69W.js","/assets/trending-down-WxZlQzAy.js","/assets/trending-up-DP_HO49A.js","/assets/undo-2-4ipWZmSL.js","/assets/useChartTheme-DG-xRpyi.js","/assets/useElementWidth-KmH9Umq5.js","/assets/useIsMobile-C6QH3FzO.js","/assets/useOpenParam-BIWzq5OP.js","/assets/useStatusBands-B3tepYW-.js","/assets/useUrlScope-Dk3py8uF.js","/assets/user-cog-B2WLYA9w.js","/assets/user-kHXJAnq8.js","/assets/users-9HWQAILT.js","/assets/vfx-cAt0tlMj.js","/assets/video-Od8-Kxy1.js","/assets/wallet-sQ1IACKW.js","/assets/warehouse-LgqObNdk.js","/assets/workflow-C1vYW0GP.js","/assets/x-CsJboAnI.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png"];
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
