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

const BUILD = "2026-10-30T05:57:44.924Z";
const PRECACHE = ["/","/assets/AdminPanel-BYT2WiKY.js","/assets/AnalysisBoard-BKDpsD9J.js","/assets/Arc-CzWrBcvL.js","/assets/Assistant-D4M-DuHM.js","/assets/BrigadirProfile-BX39Pwhf.js","/assets/BroadcastReceivers-Bfb_0W37.js","/assets/BroadcastRecord-C5-s8vET.js","/assets/Button-BoQRjrqu.js","/assets/CatLockNotice-CO3tJIFs.js","/assets/CategoryLegendModal-CYourdym.js","/assets/CellConcerns-Bb1GwNHJ.js","/assets/CellDetails-Bz--KTf3.js","/assets/CellFormModal-CAQG3oEl.js","/assets/CellIdent-Bg22zScf.js","/assets/CellLink-CfKQW_0b.js","/assets/Cells-DyxLyLJ4.js","/assets/ColumnFilter-MzawqHfy.js","/assets/ColumnsPicker-31fg2Wy-.js","/assets/CommentsModal-DOHlhH78.js","/assets/ComparisonTable-Cq54aRYF.js","/assets/Concerns-C18HNVI3.js","/assets/CountStepper-sRWV_uaZ.js","/assets/Daily-DFSAcAd2.js","/assets/DataTable-BwIxspzT.js","/assets/DateRangePicker-Bhg98kh9.js","/assets/DayReportView-Cq5U9d5m.js","/assets/DayStepper-DIB_IgjN.js","/assets/DayStrip-C_6Ex7Y5.js","/assets/DifferenceBreakdown-9r8YS1VH.js","/assets/Downtime-BLqFgeUR.js","/assets/Education-DESpTmBD.js","/assets/EducationLesson-QBelfQiA.js","/assets/EmptyState-CtaCqnE0.js","/assets/Exam-DiaXq7hG.js","/assets/FactorySelect-CcXR0MoJ.js","/assets/Gamification-BfA2OrL1.js","/assets/GroupBadge-BrTLAvd8.js","/assets/HeatmapChart-CPWGKV13.js","/assets/IdleCell-BNA2z_iB.js","/assets/KPICard-BhxV8Hqk.js","/assets/Kaizen-BiDdXj_J.js","/assets/Kelish-Be2ZsrWU.js","/assets/KpiDeltaCard-DgBGAUl-.js","/assets/LangTextInput-C550z2FW.js","/assets/Layout-DsYkRjec.js","/assets/LeaderAppeal-ByO_rRnb.js","/assets/LeaderDayReport-Bfng3MH9.js","/assets/LeaderUnitReport-DwrlnXZE.js","/assets/Leaderboard-D7AfYczA.js","/assets/Leaders-BTS5uyhR.js","/assets/LeadersKpi-4tinqFSe.js","/assets/Lightbox-DRqsrfS8.js","/assets/LiveOverview-BMZGu4xe.js","/assets/Login-DZhU-O2M.js","/assets/NotFound-UTl7ZVcB.js","/assets/Notifications-n1qWCnsr.js","/assets/Ontime-CPJ_di_X.js","/assets/Overview-C8r3IE9L.js","/assets/Pagination-TbXCqLiP.js","/assets/PerenaladkaFactTable-CA4gtbEr.js","/assets/PersonCard-0fuSmX_S.js","/assets/PlanFulfillment-C1IL_XF_.js","/assets/Production-CKxcu9tI.js","/assets/Profile-CO58j0nT.js","/assets/ProofCamera-DihdR4qu.js","/assets/ProofPhoto-CQIIlVpB.js","/assets/Quality-BNVpvewi.js","/assets/RawRows-dnD5dfGa.js","/assets/Reports-DkehYfxz.js","/assets/RequestStateChip-Y35-AIAQ.js","/assets/RichTextEditor-iDeHEafh.js","/assets/SaveState-CT0GZ1Ew.js","/assets/SearchInput-BCCODlyA.js","/assets/SeasonalityHeatmap-DbSR0Usj.js","/assets/SegmentedToggle-BRnh0ZuF.js","/assets/SetupTimes-CWCux0Gu.js","/assets/ShiftDaily-D7xjtupF.js","/assets/Staff-SOOqpPBE.js","/assets/StaffListAtCheck-D0Y9gcai.js","/assets/StatusBadge-BPiNWSAx.js","/assets/StatusBandsModal-COyelMa-.js","/assets/TargetGoal-CgF8vhRo.js","/assets/Targets-ByuJ86z3.js","/assets/Tasks-D1IL_tWo.js","/assets/TimeWheelPicker-D2Y56Np8.js","/assets/Toast-B-HPJaCi.js","/assets/Tooltip-BhepZN9F.js","/assets/TrendChart-CYmP1X6c.js","/assets/TripleSpeedometer-qKOLNJeG.js","/assets/Trudoyomkost-CxmGedXe.js","/assets/UploadDropzone-DJhgZ63t.js","/assets/UsersActivity-Pvr423Ne.js","/assets/VerdictBlock-BQqN3Ir1.js","/assets/VfxApiMap-D1RToyr5.js","/assets/VfxDictionaries-CztlR4CX.js","/assets/VfxEmployees-DJ0hZJsl.js","/assets/VfxHrMoves-B_fVCLA2.js","/assets/VfxJobs-D-nTsBrO.js","/assets/VfxPhoto-C1gCIdmD.js","/assets/VfxShifts-CS3-mG7h.js","/assets/VfxState-Bd5dXOEl.js","/assets/VfxTimebooks-DYoE9lK-.js","/assets/VfxTimesheet-jIULgTmB.js","/assets/WatchProgress-DuF2M-Ru.js","/assets/WebLogin-Bux2Q0Y7.js","/assets/Workers-C9hLE10q.js","/assets/Zagruzka-DMS--D_T.js","/assets/ZagruzkaCell-Buc4o9oa.js","/assets/api-BFm7MSgf.js","/assets/archive-CVcKWqGD.js","/assets/archive-restore-Ag5BYlMi.js","/assets/arrow-down-Dr46Omha.js","/assets/arrow-down-right-B5c3b0Yj.js","/assets/arrow-down-wide-narrow-CYMWEeOf.js","/assets/arrow-up-narrow-wide-DgEzTRfV.js","/assets/ban-DfyMf4rk.js","/assets/boxes-CJB3BJ_9.js","/assets/braces-Bmzv_Rk4.js","/assets/brigadirFilters-ULQymO9a.js","/assets/broadcastTree-Bwxn5kS4.js","/assets/building-2-Cw8rzNso.js","/assets/calendar-CeupNcso.js","/assets/calendar-days-BMu8pURq.js","/assets/camera-C20RhrJc.js","/assets/categories-Dewd-F4a.js","/assets/cellMoveRefusal-BdWJG8IW.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-_rPg71N9.js","/assets/chart-line-Cl9eH5-W.js","/assets/chart-pie-BZh4BTTs.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-DrKvL2pi.js","/assets/chevron-left-BZqvDyee.js","/assets/chevrons-up-down-DqkeEvS2.js","/assets/circle-BkzCZFjU.js","/assets/circle-alert-Bg1ON_7z.js","/assets/circle-check-big-DkcJPG8L.js","/assets/circle-dashed-DwW5J0kd.js","/assets/circle-minus-D7qbXA_r.js","/assets/circle-question-mark-CEIPdIck.js","/assets/circle-slash-y45BegMw.js","/assets/circle-user-round-ikeRTzU_.js","/assets/cloud-off-KW_-4ZtE.js","/assets/cloud-upload-ynTyOrbc.js","/assets/coins-Dd9GaLsy.js","/assets/compass-BdYq-yi5.js","/assets/concernCategories-IjE5XJXt.js","/assets/corner-down-right-B60tF3O9.js","/assets/createLucideIcon-DP4lXSeP.js","/assets/en-DqarfLj6.js","/assets/es-Dtgc5NM1.js","/assets/external-link-CfOqPKFj.js","/assets/file-clock-C5FCetEc.js","/assets/file-exclamation-point-CZhSdVZT.js","/assets/flag-D-wE4HC-.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-tPiLxJ_5.js","/assets/funnel-ty5dnLOs.js","/assets/hash-DgA67QzC.js","/assets/hourglass-CUeWToe3.js","/assets/idleTime-CHPnJRpw.js","/assets/image-BMvwvPWr.js","/assets/image-off-Dq-12fwO.js","/assets/inbox-BMjucmSP.js","/assets/index-BtYmuUYW.css","/assets/index-Di8JZRV0.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-BO2jQnEf.js","/assets/languages-CbiWdlrb.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-mueL6dlX.js","/assets/leaderBoard-DXK1Rlko.js","/assets/lightbulb-DyP-KOiR.js","/assets/link-2-DdECDQRO.js","/assets/link-2-off-DVWzCBU_.js","/assets/list-ordered-kaET-bva.js","/assets/list-tree-DmXyCYv-.js","/assets/lock-open-DlG_ybFD.js","/assets/log-in-B_So6bLx.js","/assets/map-pin-BOBAWa0I.js","/assets/marks-r27VQpZQ.js","/assets/minimize-2-Ci8eaYNM.js","/assets/package-check-D6mPFRSB.js","/assets/pencil-BXly0E1B.js","/assets/percent-B_p6o9fX.js","/assets/pin-CHZLhPGy.js","/assets/pin-off-DJWZQsXk.js","/assets/play-BL7sQ0mm.js","/assets/plug-zap-Ytx7gxFc.js","/assets/prop-types-RD3fbola.js","/assets/radio-BL265k9a.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-Dzh7_ziw.js","/assets/repeat-CELf9E54.js","/assets/ru-AnkQRyZ_.js","/assets/save-aMQeyCIp.js","/assets/scopeLinks-YZAchdKw.js","/assets/scroll-text-DsOHAw_U.js","/assets/search-x-AJV2Ra3x.js","/assets/segments-D5Uiedtv.js","/assets/send-BTI_DHJt.js","/assets/settings-2-Bql9aQPe.js","/assets/shield-DvktL1GO.js","/assets/shield-alert-CAQTvvWK.js","/assets/shield-question-mark-CZNZrFd9.js","/assets/sigma-B9_W1Za7.js","/assets/siren-DvZBo5yg.js","/assets/snowflake-1aDJDnZx.js","/assets/split-b24AFdKt.js","/assets/square-check-big-DpAyb5jh.js","/assets/star-QYdSbvMe.js","/assets/statusBands-DVBZcBq3.js","/assets/store-Bff3jpW5.js","/assets/table-2-C1TJwexG.js","/assets/table-properties-DBo5xOvt.js","/assets/tag-BA2pHXmN.js","/assets/timer-off-DSdIswWD.js","/assets/translations-DDCIX97M.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-CrvEJ9_4.js","/assets/trending-up-CFnDRzSS.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-4cEkQKIY.js","/assets/useChartTheme-C-1fxKm7.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-a-L2E_-O.js","/assets/useStatusBands-B2i50s3Q.js","/assets/useUrlScope-oy0Qb9YJ.js","/assets/user-cog-sWm73ky5.js","/assets/user-h8plzMHG.js","/assets/user-minus-BjaJG801.js","/assets/users-CfPKmCol.js","/assets/uz-CkKkwgzn.js","/assets/uz_cyrl-Cozl0UwD.js","/assets/vfx-7XkJJgEt.js","/assets/video-Ls1sM4BJ.js","/assets/wallet-7aUpWGpU.js","/assets/warehouse-BNnjQ-ds.js","/assets/workflow-02HWCNNH.js","/assets/x-C52CwiN8.js","/assets/zap-aetVeAWz.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
