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

const BUILD = "2026-10-21T06:10:05.700Z";
const PRECACHE = ["/","/assets/AdminPanel-1BcXXEZ2.js","/assets/AnalysisBoard-DGD03AXT.js","/assets/Arc-D4toT7cx.js","/assets/Assistant-IvUNAzDQ.js","/assets/BrigadirProfile-aJtSQN6o.js","/assets/BroadcastReceivers-BFktRSms.js","/assets/BroadcastRecord-qa47U0nH.js","/assets/Button-CChbIhza.js","/assets/CatLockNotice-DrnRIeBK.js","/assets/CategoryLegendModal-BhKfoZsC.js","/assets/CellConcerns-DI4peBWr.js","/assets/CellDetails-DnlqjMys.js","/assets/CellFormModal-DDBC6SDl.js","/assets/CellIdent-CuUqxfTh.js","/assets/CellLink-DkefWhca.js","/assets/Cells-DkP3ihbh.js","/assets/ColumnFilter-B0kR-s0o.js","/assets/ColumnsPicker-CXtic3OC.js","/assets/CommentsModal-CxiMn4uT.js","/assets/ComparisonTable-CQWmooRr.js","/assets/Concerns-Cb6AXWAS.js","/assets/CountStepper-DyKy60C6.js","/assets/Daily-Cs4KFGwz.js","/assets/DataTable-CUzHVrVr.js","/assets/DateRangePicker-BOAjpejG.js","/assets/DayReportView-ESsSzWxo.js","/assets/DayStepper-4E0hSkdR.js","/assets/DayStrip-B59B9--c.js","/assets/DifferenceBreakdown-DSfoX1fB.js","/assets/Downtime-BOAFQDDn.js","/assets/Education-BXZFgQxv.js","/assets/EducationLesson-ZBwx_cyQ.js","/assets/EmptyState-BEPif1FD.js","/assets/Exam-ZK34C73G.js","/assets/FactorySelect-Bampnljq.js","/assets/Gamification-Dv3hxj4F.js","/assets/GroupBadge-Bzs1LjOa.js","/assets/HeatmapChart-BX9WAGN8.js","/assets/IdleCell-DMgk4m6N.js","/assets/KPICard-DYMsfNc1.js","/assets/Kaizen-DMOxsqi0.js","/assets/Kelish-B2fc85sa.js","/assets/KpiDeltaCard-EMS8cA0O.js","/assets/LangTextInput-BBUFWxp8.js","/assets/Layout-C40DKgIV.js","/assets/LeaderAppeal-HlUdFKFM.js","/assets/LeaderDayReport-ROu2dfAr.js","/assets/LeaderUnitReport-CAxyaY9U.js","/assets/Leaderboard-oqqjeks-.js","/assets/Leaders-CqfBsi0H.js","/assets/LeadersKpi-_6bP_YLU.js","/assets/Lightbox-Cut-dlE6.js","/assets/LiveOverview-YlA_n4Ks.js","/assets/Login-BzkrOgAE.js","/assets/NotFound-YamKBbqe.js","/assets/Notifications-DUTuSNJh.js","/assets/Ontime-7yZsn2H3.js","/assets/Overview-ndmeNNhy.js","/assets/Pagination-DeBIj7tb.js","/assets/PerenaladkaFactTable-BN9jbmzx.js","/assets/PersonCard-BFO3xlcx.js","/assets/PlanFulfillment-CNg4F5dm.js","/assets/Production-Bgzo8vpT.js","/assets/Profile-CFRpAIdC.js","/assets/ProofCamera-CMYVKW6m.js","/assets/ProofPhoto-c_LHl0_8.js","/assets/Quality-C3HAgYTe.js","/assets/RawRows-DTcwdIpy.js","/assets/RequestStateChip-CY95NKcc.js","/assets/RichTextEditor-XW4dGYtv.js","/assets/SaveState-Bzlyy04q.js","/assets/SearchInput-DwI_BavK.js","/assets/SeasonalityHeatmap-BUIcsmLO.js","/assets/SegmentedToggle-i351ChLM.js","/assets/SetupTimes-zF2-7sNR.js","/assets/ShiftDaily-C2mDN5zC.js","/assets/Staff-CsQcRXWx.js","/assets/StaffListAtCheck-u-m8IMc3.js","/assets/StatusBadge-oHh0sIXP.js","/assets/StatusBandsModal-D9yJg9IQ.js","/assets/TargetGoal-U79IjhRu.js","/assets/Targets-B6E9idai.js","/assets/Tasks-B25Xcb69.js","/assets/TimeWheelPicker-lMdfISpk.js","/assets/Toast-DwplhSpK.js","/assets/Tooltip-DjRPY74j.js","/assets/TrendChart-BYEAPN3k.js","/assets/TripleSpeedometer-g2UNLgCa.js","/assets/Trudoyomkost-DRhXw2RU.js","/assets/UploadDropzone-iC1zuvq-.js","/assets/UsersActivity-ZYPWq5pk.js","/assets/VerdictBlock-DGEjDT7g.js","/assets/VfxApiMap-CmwsEXmU.js","/assets/VfxDictionaries-D8C0THwx.js","/assets/VfxEmployees-D-oh99Zi.js","/assets/VfxHrMoves-DdGctg5N.js","/assets/VfxJobs-Cnucy1AQ.js","/assets/VfxPhoto-CwLeqjxB.js","/assets/VfxShifts-CsTtm_fV.js","/assets/VfxState-Dl_Km8RP.js","/assets/VfxTimebooks-BQmV1RO3.js","/assets/VfxTimesheet-HMSZwdVz.js","/assets/WatchProgress-3cdKJp-t.js","/assets/WebLogin-SyGOmwYg.js","/assets/Workers-D53kjJUZ.js","/assets/Zagruzka-BU_15tx_.js","/assets/ZagruzkaCell-CCczfS5B.js","/assets/api-BaBpJGuc.js","/assets/archive-Cb_VU3tF.js","/assets/archive-restore-F5m0kXFT.js","/assets/arrow-down-D-RVcBPK.js","/assets/arrow-down-right-CgSta01V.js","/assets/arrow-down-wide-narrow-DK97YQWJ.js","/assets/arrow-up-narrow-wide-Dj8wx_1K.js","/assets/ban-Cytm_cfx.js","/assets/boxes-GT8Fa7Yx.js","/assets/braces-C64R6j51.js","/assets/brigadirFilters-Cuvn6KK5.js","/assets/broadcastTree-CrwWWIBf.js","/assets/building-2-C8NPPXS5.js","/assets/calendar-B1rjZ4rt.js","/assets/calendar-days-Bzl7qlsv.js","/assets/camera-MKdh8Sq6.js","/assets/categories-DpOWXM6U.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-ZtlcIVbi.js","/assets/chart-line-EQcz5hLX.js","/assets/chart-pie-2u9loo4F.js","/assets/chartRange-DKEE_xTI.js","/assets/check-check-DkwHC301.js","/assets/chevron-left-DJSc8fIy.js","/assets/chevrons-up-down-D-WSRxgc.js","/assets/circle-AJGTIbHL.js","/assets/circle-alert-Bq_-t8ek.js","/assets/circle-check-big-CgYpxdup.js","/assets/circle-dashed-CMFMfuLZ.js","/assets/circle-minus-BayWuZmD.js","/assets/circle-question-mark-Bbt50yyn.js","/assets/circle-slash-Cu3agbaN.js","/assets/circle-user-round-BXLNZ_-A.js","/assets/cloud-off-BtxnJOGp.js","/assets/cloud-upload-Bshhfn77.js","/assets/compass-evh1m0qV.js","/assets/concernCategories-L02eVQKv.js","/assets/corner-down-right-CivN6st3.js","/assets/createLucideIcon-BDQYoUmO.js","/assets/es-H9JoiAKe.js","/assets/external-link-xtb1_gx-.js","/assets/file-clock-CpG57JQ8.js","/assets/file-exclamation-point-BkHnAD-5.js","/assets/flag-DDb9swAT.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-ZKoqoC8j.js","/assets/funnel-BDUFUG5t.js","/assets/hash-C7gV19Uj.js","/assets/hourglass-FAcodNbU.js","/assets/image-D79yE2Xp.js","/assets/image-off-DUUhFx3k.js","/assets/inbox-NSmVa9TP.js","/assets/index-BohJnnvx.js","/assets/index-DLT_vDJq.css","/assets/keyboard-CWsrhKuD.js","/assets/languages-BFWv1P_X.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-OcFGy4Y9.js","/assets/lightbulb-v99BmfsD.js","/assets/link-2-XvzbsJ7P.js","/assets/link-2-off-DVhKcATQ.js","/assets/list-ordered-BB7sTnOS.js","/assets/list-tree-DTYhN25s.js","/assets/lock-open-DAbghbht.js","/assets/log-in-Bb-GfaCc.js","/assets/marks-BLvgU34W.js","/assets/minimize-2-BtX6qXX8.js","/assets/package-check-92P8mMaV.js","/assets/pencil-4G8zt27m.js","/assets/percent-EEgnJvrx.js","/assets/pin-DUI9Emr2.js","/assets/pin-off-HpDcGAgZ.js","/assets/play-CYixa5Nt.js","/assets/plug-zap-De-v5RLV.js","/assets/prop-types-C2SjcKg7.js","/assets/radio-CVM0i-n-.js","/assets/react-apexcharts.esm-DI4KEXls.js","/assets/registers-B78kfE8Z.js","/assets/repeat-DG2De0lN.js","/assets/save-CO9Fn32E.js","/assets/scopeLinks-D3N1wJl_.js","/assets/scroll-text-Br9X0c-0.js","/assets/search-x-tzcvOjNa.js","/assets/segments-CD1_Z_ez.js","/assets/send-CPG1Md8S.js","/assets/settings-2-DLvbf1rX.js","/assets/shield-CAm6urXg.js","/assets/shield-alert-D2gDhv_7.js","/assets/shield-question-mark-CdAITHKx.js","/assets/sigma-5ukisUEY.js","/assets/siren-CTi3HDpr.js","/assets/snowflake-BxEOWkBZ.js","/assets/split-ZM0_kI-L.js","/assets/square-check-big-B_13aq7q.js","/assets/star-BpdR9Vqa.js","/assets/statusBands-y2WtSagI.js","/assets/store-WTzRE0kx.js","/assets/table-2-CIzCtAGT.js","/assets/table-properties-b50CfWu6.js","/assets/tag-DLPKhVgE.js","/assets/timer-off-Cf8ryDgD.js","/assets/trendBuckets-C2T5o9Zf.js","/assets/trending-down-DUeJLfau.js","/assets/trending-up-DAct97P1.js","/assets/undo-2-BObwVeJM.js","/assets/useChartTheme-DffnstyL.js","/assets/useElementWidth-BBZjrcyL.js","/assets/useIsMobile-Bpw3J33K.js","/assets/useOpenParam-Bj-PHiR-.js","/assets/useStatusBands-DUhLvr4n.js","/assets/useUrlScope-CKUip1lh.js","/assets/user-ClrxE9R5.js","/assets/user-cog-C3vfHmVq.js","/assets/user-minus-D4W-01XR.js","/assets/users-Dx1gggr8.js","/assets/vfx-W_lgR63E.js","/assets/video-kGD7XNu3.js","/assets/wallet-D7DWtaAT.js","/assets/warehouse-Cp-DNgTc.js","/assets/workflow-w-LWSrqc.js","/assets/x-DeLwTs5f.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
