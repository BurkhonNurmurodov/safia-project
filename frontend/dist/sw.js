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

const BUILD = "2026-10-21T09:06:07.869Z";
const PRECACHE = ["/","/assets/AdminPanel-BS7c5E19.js","/assets/AnalysisBoard-CfA7KvT_.js","/assets/Arc-BqNh7X2l.js","/assets/Assistant-C1IgWmkj.js","/assets/BrigadirProfile-DjZ0GUnt.js","/assets/BroadcastReceivers-DW3sE02l.js","/assets/BroadcastRecord-KLRc_56u.js","/assets/Button-CcnR4e4a.js","/assets/CatLockNotice-K35SM8by.js","/assets/CategoryLegendModal-55wWXiIi.js","/assets/CellConcerns-D7ElV-b2.js","/assets/CellDetails-CqrVvroM.js","/assets/CellFormModal-CtHXxxYH.js","/assets/CellIdent-Cjl66X6X.js","/assets/CellLink-6xRE9IN6.js","/assets/Cells-CVSHxs3x.js","/assets/ColumnFilter-Bi9qgmDG.js","/assets/ColumnsPicker-DE66LqSU.js","/assets/CommentsModal-Brtwxq_0.js","/assets/ComparisonTable-C-pWey6z.js","/assets/Concerns-Cgziam8N.js","/assets/CountStepper-BLsC5VnN.js","/assets/Daily-CjHuNcdg.js","/assets/DataTable-BXv14G54.js","/assets/DateRangePicker-YjKQbCrG.js","/assets/DayReportView-CMSpJRpO.js","/assets/DayStepper-C4sM8PuJ.js","/assets/DayStrip-Y-Is73-C.js","/assets/DifferenceBreakdown-CxY3yfys.js","/assets/Downtime-DxQ3U5G9.js","/assets/Education-C4sjtMTg.js","/assets/EducationLesson-Dg9ptZ7g.js","/assets/EmptyState-CjurQ9JS.js","/assets/Exam-LESSQmeS.js","/assets/FactorySelect-yWVt-toi.js","/assets/Gamification-BbBVbgUq.js","/assets/GroupBadge-D-Im_YBW.js","/assets/HeatmapChart-DWHgdCfP.js","/assets/IdleCell-CBi6onev.js","/assets/KPICard-CzIywYYQ.js","/assets/Kaizen-BKRddhZ2.js","/assets/Kelish-D4xV8z8p.js","/assets/KpiDeltaCard-3GF21F7B.js","/assets/LangTextInput-DDAqO3DL.js","/assets/Layout-Bxnou1Bh.js","/assets/LeaderAppeal-DQ7f8mGz.js","/assets/LeaderDayReport-DHEODj1_.js","/assets/LeaderUnitReport-B2iO7u7Z.js","/assets/Leaderboard-BvL-Piek.js","/assets/Leaders-Wc4hIwGc.js","/assets/LeadersKpi-CjgM-wOQ.js","/assets/Lightbox-DLXOCHXC.js","/assets/LiveOverview-doh5fAZr.js","/assets/Login-rV-BpFrF.js","/assets/NotFound-sarpsrl5.js","/assets/Notifications-OpXM7T_B.js","/assets/Ontime-Gyp7tsUA.js","/assets/Overview-BoCnG1ym.js","/assets/Pagination-CO_Kuzn7.js","/assets/PerenaladkaFactTable-BPWQGtwe.js","/assets/PersonCard-gGC-KsKV.js","/assets/PlanFulfillment-BsvBcz5M.js","/assets/Production-BoqldEiN.js","/assets/Profile-Du-8aF36.js","/assets/ProofCamera-DbTEOVNg.js","/assets/ProofPhoto-DAOWm-HM.js","/assets/Quality-MfGVlj1c.js","/assets/RawRows-BohvsqBP.js","/assets/RequestStateChip-D0ShpJMs.js","/assets/RichTextEditor-CBpvEPw5.js","/assets/SaveState-CmhLgFYr.js","/assets/SearchInput-BF8Iz6po.js","/assets/SeasonalityHeatmap-N_vk1goo.js","/assets/SegmentedToggle-CEtYYw9Z.js","/assets/SetupTimes-N0LknBf9.js","/assets/ShiftDaily-2O_4D9bG.js","/assets/Staff-CJlmaneE.js","/assets/StaffListAtCheck-Bg3STsau.js","/assets/StatusBadge-C4cCMuU5.js","/assets/StatusBandsModal-_nULrTkm.js","/assets/TargetGoal-HtQtl8aj.js","/assets/Targets-DYGaLceI.js","/assets/Tasks-DXVC3wpD.js","/assets/TimeWheelPicker-Cg7qsqqN.js","/assets/Toast-C1dXWLfG.js","/assets/Tooltip-EGhKls4J.js","/assets/TrendChart-BE2YozHh.js","/assets/TripleSpeedometer-D0EreH-o.js","/assets/Trudoyomkost-psrYXm2H.js","/assets/UploadDropzone-tq7Hu_ju.js","/assets/UsersActivity-DH1BJgOR.js","/assets/VerdictBlock-D9bpyXLX.js","/assets/VfxApiMap-Chw3Ubmw.js","/assets/VfxDictionaries-Cj8epMrj.js","/assets/VfxEmployees-D-ZRDVRe.js","/assets/VfxHrMoves-BAxXEBKL.js","/assets/VfxJobs-D1I5MAeA.js","/assets/VfxPhoto-dbjjY65e.js","/assets/VfxShifts-klKxPgdt.js","/assets/VfxState-DYfe1kUV.js","/assets/VfxTimebooks-qQbw2rXI.js","/assets/VfxTimesheet-CZrIyYFp.js","/assets/WatchProgress-CdXL2Htc.js","/assets/WebLogin-BgHleTCo.js","/assets/Workers-Bu87rEz4.js","/assets/Zagruzka-BpwGyFnK.js","/assets/ZagruzkaCell-_a4ustCN.js","/assets/api-D8BCeWW2.js","/assets/archive-b7jVnYON.js","/assets/archive-restore-DoKo_S0p.js","/assets/arrow-down-Bu5G6Pa2.js","/assets/arrow-down-right-Drj7ZWTP.js","/assets/arrow-down-wide-narrow-BD3x8-Is.js","/assets/arrow-up-narrow-wide-Dt9dXhfv.js","/assets/ban-qrv05Llj.js","/assets/boxes-DIjaUm41.js","/assets/braces-CcnQzFWa.js","/assets/brigadirFilters-BsNcZ08s.js","/assets/broadcastTree-DcUuB02g.js","/assets/building-2-CS0612RL.js","/assets/calendar-MmmuhePa.js","/assets/calendar-days-BpZ4RZnC.js","/assets/camera-CC8lyHdb.js","/assets/categories-DUOyvIDh.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C-k9B_FN.js","/assets/chart-line-DQy5_Ol1.js","/assets/chart-pie-BlYjewrz.js","/assets/chartRange-VccHhdnb.js","/assets/check-check-DGalD2Fl.js","/assets/chevron-left-DmctdC6u.js","/assets/chevrons-up-down-BU-IH97-.js","/assets/circle-CXuFxRqJ.js","/assets/circle-alert-B2ZMd3pX.js","/assets/circle-check-big-bV2A77JH.js","/assets/circle-dashed-B2ymzbp2.js","/assets/circle-minus-TjGzUx6l.js","/assets/circle-question-mark-MCUKmO3r.js","/assets/circle-slash-SEaK-NMt.js","/assets/circle-user-round-D_Qk6yIV.js","/assets/cloud-off-6clIFxc_.js","/assets/cloud-upload-CAwjs0ML.js","/assets/compass-DfmhLvJB.js","/assets/concernCategories-CRcLpCjm.js","/assets/corner-down-right-v0lVyn_Q.js","/assets/createLucideIcon-wf5JZVgV.js","/assets/es-ogsxtXUR.js","/assets/external-link-CjRt3v6v.js","/assets/file-clock-DwqtK1_X.js","/assets/file-exclamation-point-BwztdHjG.js","/assets/flag-DFdHb2F_.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-xzDi71QY.js","/assets/funnel-ITiHjHe-.js","/assets/hash-D5GqMuTt.js","/assets/hourglass-DhuRI3-s.js","/assets/image-B0e9BKU7.js","/assets/image-off-CHXq-wJv.js","/assets/inbox-C04y9ugG.js","/assets/index-DLT_vDJq.css","/assets/index-DhM9H_8e.js","/assets/keyboard-Crc4-sKq.js","/assets/languages-CPMg2FkZ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CoOQ0njX.js","/assets/lightbulb-50psWAo2.js","/assets/link-2-ISTQBCWT.js","/assets/link-2-off-DtxRGLUS.js","/assets/list-ordered-5NpdZRpo.js","/assets/list-tree-D7BcsklM.js","/assets/lock-open-Cp_HYFaC.js","/assets/log-in-DxQX3Nvs.js","/assets/marks-Cb0w70md.js","/assets/minimize-2-DSKIpSi0.js","/assets/package-check-CCYv31Mr.js","/assets/pencil-BOBrf7ic.js","/assets/percent-BM7NgtNB.js","/assets/pin-C1oNuqAR.js","/assets/pin-off-CpyeQVoD.js","/assets/play-CUqFLVFu.js","/assets/plug-zap-Dp5oo0u9.js","/assets/prop-types-CF5U0914.js","/assets/radio-BWUXGMpf.js","/assets/react-apexcharts.esm-BXFEhyhc.js","/assets/registers-C1SG3LA2.js","/assets/repeat-DcvVoE5R.js","/assets/save-DC98MuF6.js","/assets/scopeLinks-DlwU5XFJ.js","/assets/scroll-text-DIB1py6Q.js","/assets/search-x-BI8i-ZUj.js","/assets/segments-YxyKZBxo.js","/assets/send-D5sGApHu.js","/assets/settings-2-C64gh00b.js","/assets/shield-CDqTPFRj.js","/assets/shield-alert-Dh3l5f1Z.js","/assets/shield-question-mark-BCShvAZ_.js","/assets/sigma-BYErQC6X.js","/assets/siren-DammQD1W.js","/assets/snowflake-BufVpqTR.js","/assets/split-RhU2X83Z.js","/assets/square-check-big-DgQa877j.js","/assets/star-5g4MMfhj.js","/assets/statusBands-CfW573i8.js","/assets/store-CrGabgPn.js","/assets/table-2-DzxhYu7s.js","/assets/table-properties-D3FI3vV7.js","/assets/tag-BqaFkBnq.js","/assets/timer-off-DMskbKXq.js","/assets/trendBuckets-0_PMylaI.js","/assets/trending-down-BHNhy6Ta.js","/assets/trending-up-BoktEcq5.js","/assets/undo-2-9KOnPlq2.js","/assets/useChartTheme-COock4rG.js","/assets/useElementWidth-DMoKF0dY.js","/assets/useIsMobile-DD8RxXtF.js","/assets/useOpenParam-CDK7DTeQ.js","/assets/useStatusBands-B3wTiHDF.js","/assets/useUrlScope-DLVdke6A.js","/assets/user-_hssA93B.js","/assets/user-cog-oIGMA8Am.js","/assets/user-minus-CxCcfHQT.js","/assets/users-BiFbx2D9.js","/assets/vfx-Cpe9qZzh.js","/assets/video-BRvO9nLO.js","/assets/wallet-Bov3o7ME.js","/assets/warehouse-CFwJvx5T.js","/assets/workflow-B-MDXAem.js","/assets/x-CrQ7hXss.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
