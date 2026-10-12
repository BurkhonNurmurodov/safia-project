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

const BUILD = "2026-10-12T10:17:42.175Z";
const PRECACHE = ["/","/assets/AdminPanel-CczkCVSs.js","/assets/AnalysisBoard-CGYwMyD2.js","/assets/Arc-7l9idW8Y.js","/assets/Assistant-BgAKfynC.js","/assets/BrigadirProfile-D5DX6dki.js","/assets/BroadcastReceivers-gI5tkATM.js","/assets/BroadcastRecord-CKUK41k5.js","/assets/Button-CSi2zSxk.js","/assets/CatLockNotice-B3F9e8sb.js","/assets/CategoryLegendModal-BWPmZ1Wa.js","/assets/CellConcerns-CI1yAhSe.js","/assets/CellDetails-B9UisaEA.js","/assets/CellFormModal-eHWlVW8o.js","/assets/CellIdent-BjsTHLXN.js","/assets/CellLink-ypVqDPCb.js","/assets/Cells-CC46SD8G.js","/assets/ColumnFilter-Df65dKmK.js","/assets/ColumnsPicker-B5j5zDRQ.js","/assets/CommentsModal-C86-FR25.js","/assets/ComparisonTable-BxjTDYD_.js","/assets/Concerns-OH6cCyE-.js","/assets/Daily-TSfd5nXi.js","/assets/DataTable-CtMdhEKA.js","/assets/DateRangePicker-BQh2trh9.js","/assets/DayReportView-6SuAspuA.js","/assets/DayStepper-1MX5nrMn.js","/assets/DifferenceBreakdown-HvheniG6.js","/assets/Downtime-gv2Lh2LY.js","/assets/Education-B-8vy7cK.js","/assets/EducationLesson-ySFC72G1.js","/assets/EmptyState-DPzNrjKl.js","/assets/Exam-RniAiMEg.js","/assets/FactorySelect-CZtan3ng.js","/assets/Gamification-B1VVugHz.js","/assets/GroupBadge-Duomg0Wo.js","/assets/HeatmapChart-DUqFm0N3.js","/assets/IdleCell-BO0me8tH.js","/assets/KPICard-Bx58BVPs.js","/assets/Kaizen-HvdR_yJH.js","/assets/Kelish-DChYwuVF.js","/assets/KpiDeltaCard-DUA5w3EK.js","/assets/LangTextInput-BNmlmRQ7.js","/assets/Layout-CymGNKy2.js","/assets/LeaderAppeal-dRDUfYdI.js","/assets/LeaderDayReport-D3LfShze.js","/assets/LeaderUnitReport-CDpaEQFx.js","/assets/Leaderboard-IYoN9wZs.js","/assets/Leaders-DcbWfm0_.js","/assets/Lightbox-BV3IUaZc.js","/assets/LiveOverview-BpdIsqhn.js","/assets/Login-vR9YFGT5.js","/assets/NotFound-BQOlhMO-.js","/assets/Notifications-3MSwApGW.js","/assets/Overview-CRl_8Wls.js","/assets/Pagination-BB8qdlAq.js","/assets/PerenaladkaFactTable-CIzkJlYz.js","/assets/PersonCard-BxOlwwhP.js","/assets/PlanFulfillment-TtnFUQPz.js","/assets/Production-C3vT5_fy.js","/assets/Profile-CsytSnOw.js","/assets/ProofCamera-s2aXAOC9.js","/assets/ProofPhoto-DSpCdoG7.js","/assets/Quality-C0MVOjMr.js","/assets/RawRows-NNgqfWo7.js","/assets/RequestStateChip-bSnztSnP.js","/assets/RichTextEditor-C-pncjpS.js","/assets/SaveState-S7_axnLl.js","/assets/SearchInput-DMPv0xiW.js","/assets/SeasonalityHeatmap-CBA2tnIa.js","/assets/SegmentedToggle-W4lm2c2y.js","/assets/SetupTimes-SWv-PANW.js","/assets/ShiftDaily-BmeFjicZ.js","/assets/Staff-Bvpy1e0t.js","/assets/StatusBadge-D8o7adhu.js","/assets/TargetGoal-DujYsNrQ.js","/assets/Targets-DhgovYzP.js","/assets/Tasks-DS7-iDzp.js","/assets/TimeWheelPicker-BzKJw_fg.js","/assets/Toast-D6j9s78x.js","/assets/Tooltip-DyPnaX7a.js","/assets/TrendChart-DW_d9ueS.js","/assets/TripleSpeedometer-BPs1h6rW.js","/assets/Trudoyomkost-0K5fXJ2D.js","/assets/Turnover-DIthozGs.js","/assets/UploadDropzone-B9OMV_fp.js","/assets/UsersActivity-CNmKmD34.js","/assets/VerdictBlock-CjMEcO9D.js","/assets/VfxApiMap-6YcFCibG.js","/assets/VfxDictionaries-DZZ2-vhk.js","/assets/VfxEmployees-D5pra1nZ.js","/assets/VfxHrMoves-CcH6OrYk.js","/assets/VfxJobs-CpxN8_p9.js","/assets/VfxPhoto-DXxg1URD.js","/assets/VfxShifts-DBGtbIQp.js","/assets/VfxState-lm_UKN5c.js","/assets/VfxTimebooks-DzHREra8.js","/assets/VfxTimesheet-CxMEMOcR.js","/assets/WatchProgress-Db6Veggh.js","/assets/WebLogin-L9pJ-4AS.js","/assets/WorkerConcerns-BVlBGRBs.js","/assets/Workers-Blombtkr.js","/assets/Zagruzka-DGUf5Bdt.js","/assets/ZagruzkaCell-5pzf781h.js","/assets/api-C8TUsL4I.js","/assets/archive-DNBdElKj.js","/assets/archive-restore-DSEaLlhg.js","/assets/arrow-down-C-GVpdiU.js","/assets/arrow-down-wide-narrow-qBWhAaEZ.js","/assets/arrow-up-narrow-wide-DdUGrljS.js","/assets/award-DRIPz2vU.js","/assets/ban-TEFJSRer.js","/assets/boxes-BMX4sJe-.js","/assets/braces-CtlP1SUD.js","/assets/brigadirFilters-dnT1Sb2l.js","/assets/broadcastTree-CkTBxx4x.js","/assets/building-2--D38SBIR.js","/assets/calculator-DT-yoFA6.js","/assets/calendar-days-y-HxVRP7.js","/assets/calendar-smPJJcyT.js","/assets/camera-C5AnUbI4.js","/assets/categories-DmMd7GwV.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BlJcYskS.js","/assets/chart-line-CtCHDIMO.js","/assets/chart-pie-BT2ozL9G.js","/assets/chartRange-BX_KbWoU.js","/assets/check-check-iKbSgjGR.js","/assets/chevron-left-0aHMUPJC.js","/assets/chevrons-up-down-DY6P1QKY.js","/assets/circle-CV395ThI.js","/assets/circle-alert-BgeMSF-o.js","/assets/circle-check-big-Dppkmpss.js","/assets/circle-dashed-Bbsee20L.js","/assets/circle-minus-DTq3PNlQ.js","/assets/circle-question-mark-CSiV5N9z.js","/assets/circle-slash-C1DutybO.js","/assets/circle-user-round-DRwlAR9E.js","/assets/clock-3-DvCdi_XQ.js","/assets/cloud-off-DoGn-3i0.js","/assets/cloud-upload-CF1pxvR_.js","/assets/compass-BFwXJPOi.js","/assets/concernCategories-6DI95U2y.js","/assets/copy-BP2LtSZ1.js","/assets/corner-down-right--QCajuxD.js","/assets/createLucideIcon-lha8BaVR.js","/assets/es-BajaRLw0.js","/assets/external-link-C1hUNUUG.js","/assets/file-clock-VpnFOw9e.js","/assets/file-exclamation-point-CQMQhHyC.js","/assets/flag-CLbyDsVL.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Cx5BLXeL.js","/assets/hash-CRLE7EGX.js","/assets/hourglass-ZMa4Ju5b.js","/assets/image-Dxgxmf48.js","/assets/image-off-ZdonFGnd.js","/assets/inbox-nmEERx2z.js","/assets/index-CI1cZ1SD.css","/assets/index-U4Rytfnb.js","/assets/keyboard-D2HILJ41.js","/assets/languages-SuyUXHpe.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BH3ZAX1t.js","/assets/lightbulb-pwy9uGLE.js","/assets/link-2-HuDslZbL.js","/assets/link-2-off-DyK6z5zh.js","/assets/list-ordered-ByK2q66o.js","/assets/list-tree-xgLoHgvj.js","/assets/lock-open-D9NFDsS6.js","/assets/log-in-DXanpSEt.js","/assets/minimize-2-Rn07AcZG.js","/assets/package-check-BGWrH03N.js","/assets/pencil-NwTZCPj1.js","/assets/percent-CwIml6kw.js","/assets/pin-CFWVJkDj.js","/assets/pin-off-9D5bO7vY.js","/assets/play-ZcwemBE7.js","/assets/plug-zap-DsGtjBP-.js","/assets/prop-types-9HamuSCq.js","/assets/radio-5abnbM_j.js","/assets/react-apexcharts.esm-BYnbQ0xv.js","/assets/registers-Pt2Zlnn6.js","/assets/repeat-Cke-94L_.js","/assets/save-C3C6iLTm.js","/assets/scopeLinks-C18gutub.js","/assets/scroll-text-CjAqSC3E.js","/assets/search-x-CDtU7-MH.js","/assets/segments-B7NtpsT9.js","/assets/send-CqQ3f6Xx.js","/assets/settings-2-C0JUORvm.js","/assets/shield-DK9xtqrG.js","/assets/shield-alert-CZc7Zuuq.js","/assets/shield-question-mark-Cb4aOn33.js","/assets/siren-CIH6UIFk.js","/assets/snowflake-BGvmENtH.js","/assets/split-BPT_vc3V.js","/assets/square-check-big-DNp5EBV0.js","/assets/star-COzvxpVv.js","/assets/statusBands-Cj7ccuLx.js","/assets/store-B5I-g5YZ.js","/assets/table-2-BRfK8FPG.js","/assets/table-properties-BaQx0qsE.js","/assets/tag-Cccw_-Vz.js","/assets/timer-off-CYqxSpXT.js","/assets/trending-down-m4NXXdfn.js","/assets/trending-up-C8If2_F-.js","/assets/undo-2-D_cTwN9c.js","/assets/useChartTheme-D024zgYn.js","/assets/useElementWidth-BIu-W4t1.js","/assets/useIsMobile-B8X7k3Uu.js","/assets/useOpenParam-DllPACwZ.js","/assets/useStatusBands-D_xg-BdM.js","/assets/useUrlScope-DjLLcZFP.js","/assets/user-BySCFQLj.js","/assets/user-cog-DBXZ3PeA.js","/assets/users-Cm1C4Cg-.js","/assets/vfx-lFnd55Cj.js","/assets/video-zsIg0Aot.js","/assets/wallet-Ch5FYr7e.js","/assets/warehouse-BlJ20X_a.js","/assets/workflow-tpOScJDY.js","/assets/x-DZUdzIog.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
