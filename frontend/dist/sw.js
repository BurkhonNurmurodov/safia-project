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

const BUILD = "2026-10-07T04:28:30.782Z";
const PRECACHE = ["/","/assets/AdminPanel-DU0rhzwQ.js","/assets/AnalysisBoard-1ZTEpKNe.js","/assets/Arc-8AqoUrd8.js","/assets/Assistant-CjNn4u2_.js","/assets/BrigadirProfile-BWsCzRAr.js","/assets/BroadcastReceivers-BKd9xYvc.js","/assets/BroadcastRecord-CBzry4iK.js","/assets/Button-CBGkjad_.js","/assets/CatLockNotice-Fb7LqAG4.js","/assets/CategoryLegendModal-C87-PTyz.js","/assets/CellConcerns-WFkHp2Q8.js","/assets/CellDetails-hiehbJ6V.js","/assets/CellFormModal-hQirx-AP.js","/assets/CellIdent-DNKSx4g_.js","/assets/CellLink-DldNtxRZ.js","/assets/Cells-BA-rcqTJ.js","/assets/ColumnFilter-DoALMgXi.js","/assets/ColumnsPicker-DcXSKhnj.js","/assets/CommentsModal-CHXHBco3.js","/assets/ComparisonTable-Do-Kyh3I.js","/assets/Concerns-BBHObMSP.js","/assets/Daily-CcS8vYaL.js","/assets/DataTable-lrzPV_FR.js","/assets/DateRangePicker-P4ctt387.js","/assets/DayReportView-BR4hjOU2.js","/assets/DayStepper-BktZDBZ4.js","/assets/DifferenceBreakdown-D15UJbUe.js","/assets/Downtime-fyaHG1wv.js","/assets/Education-kJC9PHo8.js","/assets/EducationLesson-CtOhQ2_A.js","/assets/EmptyState-BMalY9Te.js","/assets/Exam-BsfObn0E.js","/assets/FactorySelect-DQZZWG3-.js","/assets/Gamification-xAT1bK9e.js","/assets/GroupBadge-Bk54qPNb.js","/assets/HeatmapChart-B7go695G.js","/assets/IdleCell-DJr1CwJk.js","/assets/KPICard-fJ5K8vsb.js","/assets/Kaizen-DDvSW4kW.js","/assets/Kelish-qihTCoOG.js","/assets/KpiDeltaCard-LNZ4h-SM.js","/assets/LangTextInput-Dk7LUtjY.js","/assets/Layout-C_gMNKp7.js","/assets/LeaderAppeal-BD4yJMqD.js","/assets/LeaderDayReport-Bz05GRwN.js","/assets/LeaderUnitReport-Co6oeeGB.js","/assets/Leaderboard-Do9wXfsx.js","/assets/Leaders-CNJPsKLb.js","/assets/Lightbox-C_R9phte.js","/assets/LiveOverview-tEeWtOyn.js","/assets/Login-z7-rj3Yq.js","/assets/NotFound-BG3Tlu0U.js","/assets/Notifications-DKe_sj_d.js","/assets/Overview-C2ublvOr.js","/assets/Pagination-Daw1v-6E.js","/assets/PerenaladkaFactTable-DH9XJ5_i.js","/assets/PersonCard-DqqShwLz.js","/assets/PlanFulfillment-C4OE8k-U.js","/assets/Production-BwLnws-I.js","/assets/Profile-CiooTYaS.js","/assets/ProofCamera-C2zm4MIG.js","/assets/ProofPhoto-BO407lI-.js","/assets/Quality-HOcUCoBd.js","/assets/RawRows-BSAEX3sD.js","/assets/RequestStateChip-ChDOSNOs.js","/assets/RichTextEditor-DcjH9P80.js","/assets/SaveState-CDPiDhjs.js","/assets/SearchInput-CJTALG3B.js","/assets/SeasonalityHeatmap-BEzB8G18.js","/assets/SegmentedToggle-Dhwly5k6.js","/assets/SetupTimes-BQcYi_Nz.js","/assets/ShiftDaily-D5a1wa3W.js","/assets/Staff-yfQk7Av3.js","/assets/StatusBadge-Q9k2hobk.js","/assets/TargetGoal-CZxYLMoc.js","/assets/Targets-CGoEiVjw.js","/assets/Tasks-NxwrJq9Y.js","/assets/TimeWheelPicker-BcWDVAsY.js","/assets/Toast-_m7VRADN.js","/assets/Tooltip-zsH_Hrkw.js","/assets/TrendChart-BCPnh1U1.js","/assets/TripleSpeedometer-D2d0c8Wj.js","/assets/Trudoyomkost-CjRrPkEC.js","/assets/Turnover-BdKR9WNt.js","/assets/UploadDropzone-Bcq-FzyF.js","/assets/UsersActivity-B4oUNz5K.js","/assets/VerdictBlock-22lTeseU.js","/assets/VfxApiMap-DHoYoauG.js","/assets/VfxDictionaries-TQ5Y3dsf.js","/assets/VfxEmployees-CtDNidrD.js","/assets/VfxHrMoves-gCh5PsPT.js","/assets/VfxJobs-DoYJ-oCm.js","/assets/VfxPhoto-DFD4Sxww.js","/assets/VfxShifts-c2qSTSJH.js","/assets/VfxState-BTrlsD_x.js","/assets/VfxTimebooks-B3ByOVIm.js","/assets/VfxTimesheet-yMX10FDa.js","/assets/WatchProgress-CejnlIpy.js","/assets/WebLogin-Do_FEFIh.js","/assets/WorkerConcerns-CGGsyaZK.js","/assets/Workers-Bmy0dbMu.js","/assets/Zagruzka-BitdY4wE.js","/assets/ZagruzkaCell-zQdSXaR-.js","/assets/api-BZwwOHV2.js","/assets/archive-DLxrUjxv.js","/assets/archive-restore-B8SjzvwR.js","/assets/arrow-down-DeG4GUu2.js","/assets/arrow-up-narrow-wide-DfNqHMSS.js","/assets/award-DozN3ZEd.js","/assets/ban-DYKjAvFG.js","/assets/boxes-C3tYQZfo.js","/assets/braces-CQMqGlhC.js","/assets/brigadirFilters-Bg0tqdjB.js","/assets/broadcastTree-C9g0nGCs.js","/assets/building-2-CX45SGAJ.js","/assets/calculator-CNX96q1i.js","/assets/calendar-days-DYpJ5ZBw.js","/assets/calendar-xx990E3W.js","/assets/camera-DF-vaBlm.js","/assets/categories-CIEVhYcv.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DgjL4c1A.js","/assets/chart-line-CPcw64GY.js","/assets/chart-pie-CV9rNXy8.js","/assets/chartRange-CqeS9rqR.js","/assets/check-check-BhvsKp9U.js","/assets/chevron-left-BZED3gbk.js","/assets/chevrons-up-down-Bel2NnpB.js","/assets/circle-Co2y2dWr.js","/assets/circle-alert-CWYIaVlu.js","/assets/circle-check-big-CC_pS0L5.js","/assets/circle-dashed-CR6c-QJ_.js","/assets/circle-minus-sHO3Swnm.js","/assets/circle-question-mark-DuRUX8Bi.js","/assets/circle-slash-cXBNxTUF.js","/assets/circle-user-round-Brd8wUNr.js","/assets/clock-3-atnNBc1q.js","/assets/cloud-off-BM_VV0Md.js","/assets/cloud-upload-DntB3ZLl.js","/assets/compass-dAHNk92a.js","/assets/concernCategories-DPJWbMpW.js","/assets/copy-lY5GVcc5.js","/assets/corner-down-right-BMKWPQcH.js","/assets/createLucideIcon-Df9kBh0i.js","/assets/es-DX75YYgR.js","/assets/external-link-D6Nnxh1L.js","/assets/file-clock-BwW2KiFY.js","/assets/file-exclamation-point-Ou4kdcYO.js","/assets/flag-qAXe5JDD.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-GvUxKPc-.js","/assets/hash-DJnyDC40.js","/assets/hourglass-BjaE0yeD.js","/assets/image-BMPu1mcA.js","/assets/image-off-DHquA-kX.js","/assets/inbox-CPMrngoQ.js","/assets/index-B7yzqq84.css","/assets/index-tooUiwhI.js","/assets/keyboard-DrEra02P.js","/assets/languages-C6QuF0Rz.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-O8Vzwea2.js","/assets/lightbulb-rle8y_Qn.js","/assets/link-2-Bp3bHUCL.js","/assets/link-2-off-CyHDXup5.js","/assets/list-ordered-BBBihLLB.js","/assets/list-tree-CnW-mP2L.js","/assets/lock-open-CA71xdn7.js","/assets/log-in-BFI27_qT.js","/assets/minimize-2-DLDKb0cc.js","/assets/package-check-dci-NSJM.js","/assets/pencil-Dk286gU5.js","/assets/percent-DRZDZMPO.js","/assets/pin-CAiBFCeC.js","/assets/pin-off-DNbCHznn.js","/assets/play-naKXUEJ0.js","/assets/plug-zap-COwYCH9j.js","/assets/prop-types-i9-3EaQJ.js","/assets/radio-Ez8fgWrM.js","/assets/react-apexcharts.esm-D_OUaqgF.js","/assets/registers-B3WuI-5o.js","/assets/repeat-DPOlmj0B.js","/assets/save-BN8E8nTa.js","/assets/scopeLinks-UsiLLzFX.js","/assets/scroll-text-CPebSABB.js","/assets/search-x-hrj8zHxJ.js","/assets/segments-CoIeFjLe.js","/assets/send-BrSVAPTr.js","/assets/settings-2-CzElKFQ7.js","/assets/shield-OLpwR37_.js","/assets/shield-alert-LCx_OLyt.js","/assets/shield-question-mark-B6MKTw7k.js","/assets/siren-_Nt0Suxd.js","/assets/snowflake-C04ejpQX.js","/assets/split-x-mYcItf.js","/assets/square-check-big-BnHrch4w.js","/assets/star-BHchFwyJ.js","/assets/statusBands-BV1tCqrb.js","/assets/store-D09-9dhs.js","/assets/table-2-DxDF1KVQ.js","/assets/table-properties-lkwCod9R.js","/assets/tag-CWZ3Voa0.js","/assets/timer-off-B4hdFJ7O.js","/assets/trending-down-BVXcTWZR.js","/assets/trending-up-D0BDXPyT.js","/assets/undo-2-DYATLG02.js","/assets/useChartTheme-BrasXRIR.js","/assets/useElementWidth-C2GnL8wy.js","/assets/useIsMobile-CBRAizXz.js","/assets/useOpenParam-CHzQef9z.js","/assets/useStatusBands-UTM97nEQ.js","/assets/useUrlScope-28_8AlxK.js","/assets/user-CDBHCGA7.js","/assets/user-cog-CpTmGQ0X.js","/assets/users-CkGR44OA.js","/assets/vfx-CWH-8qey.js","/assets/video-BKOLEWMl.js","/assets/wallet-Bk2f0NLL.js","/assets/warehouse-KKOVXiJF.js","/assets/x-0g2O3T97.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
