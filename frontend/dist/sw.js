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

const BUILD = "2026-10-07T07:40:43.819Z";
const PRECACHE = ["/","/assets/AdminPanel-CuRJFnuf.js","/assets/AnalysisBoard-CpHlnbmZ.js","/assets/Arc-ChlngrHy.js","/assets/Assistant-WoOOGQQW.js","/assets/BrigadirProfile-HotJxqiu.js","/assets/BroadcastReceivers-SUaxDSQr.js","/assets/BroadcastRecord-D10Cv4LC.js","/assets/Button-C8b64Mi9.js","/assets/CatLockNotice-GeFKt2xa.js","/assets/CategoryLegendModal-B0hO0pUZ.js","/assets/CellConcerns-Oupd9uzs.js","/assets/CellDetails-DJVm1yzE.js","/assets/CellFormModal-ALkZp83O.js","/assets/CellIdent-CsVdv2R3.js","/assets/CellLink-CTniKZtc.js","/assets/Cells-sCcmMkDB.js","/assets/ColumnFilter-BokwrJtT.js","/assets/ColumnsPicker-BXAZJmwJ.js","/assets/CommentsModal-C72owzfr.js","/assets/ComparisonTable-DBSWqtlj.js","/assets/Concerns-CKkCNl1w.js","/assets/Daily-DGtu7M3S.js","/assets/DataTable-VfQ1BnFR.js","/assets/DateRangePicker-BOY7xNYp.js","/assets/DayReportView-JEaA55aM.js","/assets/DayStepper-Dyz80_d1.js","/assets/DifferenceBreakdown-CgbGyJkQ.js","/assets/Downtime-26UrGKtw.js","/assets/Education-CbWW2rIl.js","/assets/EducationLesson-CJGkMHIe.js","/assets/EmptyState-iZCHFNun.js","/assets/Exam-jHF7ZJ_E.js","/assets/FactorySelect-Be5nsOUu.js","/assets/Gamification-3Xs0da0t.js","/assets/GroupBadge-Cp179OBH.js","/assets/HeatmapChart-Do5PSno8.js","/assets/IdleCell-BvzzezWP.js","/assets/KPICard-Skl5OMbC.js","/assets/Kaizen-Bt6gfWDJ.js","/assets/Kelish-pyPsAOIY.js","/assets/KpiDeltaCard-B1SepqWA.js","/assets/LangTextInput-SO5RSKBx.js","/assets/Layout-D7q-vHf4.js","/assets/LeaderAppeal-BPUWDw__.js","/assets/LeaderDayReport-BhAn2Hsv.js","/assets/LeaderUnitReport-BB-z5S7q.js","/assets/Leaderboard-8j0LHeKu.js","/assets/Leaders-DwP34bGO.js","/assets/Lightbox-uopbt8P5.js","/assets/LiveOverview-DyKjDHYA.js","/assets/Login-cfx4Rzpk.js","/assets/NotFound-BUvtOi2n.js","/assets/Notifications-CDR7WuiQ.js","/assets/Overview-CyFeZqWS.js","/assets/Pagination-Ejz_m0mG.js","/assets/PerenaladkaFactTable-mA_Oopjy.js","/assets/PersonCard-BvKgoVJM.js","/assets/PlanFulfillment-CwMNDv3K.js","/assets/Production-CO0RlWDZ.js","/assets/Profile-C58EIX0G.js","/assets/ProofCamera-h2-Svxj2.js","/assets/ProofPhoto-IhJbCAXv.js","/assets/Quality-CwcirhNz.js","/assets/RawRows-BpxKeuAe.js","/assets/RequestStateChip-BA8PL65m.js","/assets/RichTextEditor-K_lZkBPN.js","/assets/SaveState-CQLteSnZ.js","/assets/SearchInput-BksLB7fn.js","/assets/SeasonalityHeatmap-D4-ofaiC.js","/assets/SegmentedToggle-CUPJej2p.js","/assets/SetupTimes-DtoDnEN_.js","/assets/ShiftDaily-CpZ-9DpS.js","/assets/Staff-Dq3dzxit.js","/assets/StatusBadge-DGI1Gh8Z.js","/assets/TargetGoal-Dvbv39_E.js","/assets/Targets-B793nw_D.js","/assets/Tasks-D67lP6QU.js","/assets/TimeWheelPicker-D1bnU4ry.js","/assets/Toast-CuNDGfs3.js","/assets/Tooltip-DN55cYwP.js","/assets/TrendChart-CFZL7ziz.js","/assets/TripleSpeedometer-Fz1TSQX2.js","/assets/Trudoyomkost-B1NB6Nhp.js","/assets/Turnover-CtEFwKVk.js","/assets/UploadDropzone-B4PT8lBk.js","/assets/UsersActivity-BQFiP_cN.js","/assets/VerdictBlock-EJGRIhjU.js","/assets/VfxApiMap-DY8HjUQe.js","/assets/VfxDictionaries-BybAJDXi.js","/assets/VfxEmployees-DwOJdGI-.js","/assets/VfxHrMoves-CJaQB5Me.js","/assets/VfxJobs-BwrVfS0_.js","/assets/VfxPhoto-DSoNx1HB.js","/assets/VfxShifts-vGcw4jPc.js","/assets/VfxState-Ca-V_Zgi.js","/assets/VfxTimebooks-DXO1Ybaj.js","/assets/VfxTimesheet-Dx-t0w54.js","/assets/WatchProgress-DnvmkJq1.js","/assets/WebLogin-C9Wt9yI2.js","/assets/WorkerConcerns-69CfUafh.js","/assets/Workers-bMobDqoY.js","/assets/Zagruzka-WlcyrdVo.js","/assets/ZagruzkaCell-CBzrFM6i.js","/assets/api-Zmn4loNp.js","/assets/archive-DYe61G1w.js","/assets/archive-restore-BMWfiNsE.js","/assets/arrow-down-D95PxPE2.js","/assets/arrow-up-narrow-wide-SzBIKnaR.js","/assets/award-DluEMi7V.js","/assets/ban-CVzHfFFX.js","/assets/boxes-DCxvH-Ay.js","/assets/braces-BoEOK0pQ.js","/assets/brigadirFilters-x0cctr6w.js","/assets/broadcastTree-DsExa8wu.js","/assets/building-2-BhaL96ZN.js","/assets/calculator-CNUJYKRY.js","/assets/calendar-CRSDLztJ.js","/assets/calendar-days-BZGiJSA_.js","/assets/camera-D4fJaTZl.js","/assets/categories-BgxRrwP_.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DDt73q9_.js","/assets/chart-line-PMapeGxN.js","/assets/chart-pie-DlPZsVz7.js","/assets/chartRange-A5RMq43u.js","/assets/check-check-B1iZ2ZKs.js","/assets/chevron-left-IA4wS8oj.js","/assets/chevrons-up-down-BIo_gGlC.js","/assets/circle-BwGjEKzZ.js","/assets/circle-alert-Pa_DrZd2.js","/assets/circle-check-big-03WCs1o8.js","/assets/circle-dashed-Cy0hIw2T.js","/assets/circle-minus-BQGiFvmx.js","/assets/circle-question-mark-RNS1F2vo.js","/assets/circle-slash-lKnq_s6P.js","/assets/circle-user-round-Cgt7CfD4.js","/assets/clock-3-o_aFUI88.js","/assets/cloud-off-CbJDIUWV.js","/assets/cloud-upload-N9xh1YCl.js","/assets/compass-C8ui0KxJ.js","/assets/concernCategories-BYUIjLCv.js","/assets/copy-bqFrQnLr.js","/assets/corner-down-right-e2dPGpIk.js","/assets/createLucideIcon-C8bOBO5C.js","/assets/es-CP5OZcQ9.js","/assets/external-link-BGKClagQ.js","/assets/file-clock-Bhhq10b8.js","/assets/file-exclamation-point-K5gf22_a.js","/assets/flag-DnaqIasi.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-0denoNId.js","/assets/hash-CzMXklmj.js","/assets/hourglass-VfYtN6gF.js","/assets/image-DuZATDAa.js","/assets/image-off-BKdl5uRg.js","/assets/inbox-D0Kli-rR.js","/assets/index-B7yzqq84.css","/assets/index-BindE1xb.js","/assets/keyboard-BmqWipem.js","/assets/languages-DUrg49ku.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CFu9yoqI.js","/assets/lightbulb-9tkTnjpo.js","/assets/link-2-CGxs1Xet.js","/assets/link-2-off-BqtGk8kH.js","/assets/list-ordered-DrvNgt_o.js","/assets/list-tree-Df2E6ly0.js","/assets/lock-open-CYcRPZy7.js","/assets/log-in-bzerjSGq.js","/assets/minimize-2-DJnjUdKP.js","/assets/package-check-BoMmvuDD.js","/assets/pencil-vYBaDmM5.js","/assets/percent-CGmF-c7x.js","/assets/pin-gh72eLLB.js","/assets/pin-off-CRLUWxcI.js","/assets/play-B-EwV_z1.js","/assets/plug-zap-DXafygnQ.js","/assets/prop-types-RQXOj2OD.js","/assets/radio-CH3xW_aY.js","/assets/react-apexcharts.esm-DSWzSN2A.js","/assets/registers-BVW2oUoU.js","/assets/repeat-Sc3-Lys4.js","/assets/save-VQO21DWh.js","/assets/scopeLinks-BdtedLuS.js","/assets/scroll-text-cM8Cf7a_.js","/assets/search-x-BNzNTruI.js","/assets/segments-B4mQzT87.js","/assets/send-DFyXcK-G.js","/assets/settings-2-d4JW47-9.js","/assets/shield-CTqQDBxi.js","/assets/shield-alert-Cpn_9SHe.js","/assets/shield-question-mark-I7-668fB.js","/assets/siren-Br9BUs4h.js","/assets/snowflake-DW9M0DCG.js","/assets/split-vj6u357n.js","/assets/square-check-big-IqUd4lH3.js","/assets/star-DwDk_aCN.js","/assets/statusBands-BWXJc_Is.js","/assets/store-DtwfooCP.js","/assets/table-2-CVCN2_4U.js","/assets/table-properties-7gMW0fxX.js","/assets/tag-WwUsx9OZ.js","/assets/timer-off-DOQjuUB2.js","/assets/trending-down-B5p4Wp3v.js","/assets/trending-up-6Tnj5QKb.js","/assets/undo-2-Cnd53m6O.js","/assets/useChartTheme-yc7BwEKk.js","/assets/useElementWidth-CcRgZefj.js","/assets/useIsMobile-BSsJA2B7.js","/assets/useOpenParam-BU1bds9u.js","/assets/useStatusBands-CYLTg9Rv.js","/assets/useUrlScope-wd-_fscS.js","/assets/user-BYbFojYF.js","/assets/user-cog-2QsAhCc4.js","/assets/users-CafYGCIW.js","/assets/vfx-B-yhdqst.js","/assets/video-fG2zrBpz.js","/assets/wallet-BhgaRY60.js","/assets/warehouse-DnjpO0aR.js","/assets/x-DVO2-Vwh.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
