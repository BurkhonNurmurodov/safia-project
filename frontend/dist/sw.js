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

const BUILD = "2026-10-07T07:11:57.624Z";
const PRECACHE = ["/","/assets/AdminPanel-BKn4PLOV.js","/assets/AnalysisBoard-CIv6-uSF.js","/assets/Arc-DLJgVMwy.js","/assets/Assistant-DlRgEM6u.js","/assets/BrigadirProfile-BH5FumKK.js","/assets/BroadcastReceivers-PA8gD4Ao.js","/assets/BroadcastRecord-CSkA8WZc.js","/assets/Button-C0VeDmac.js","/assets/CatLockNotice-CsprgRJO.js","/assets/CategoryLegendModal-Ck6gZ6vm.js","/assets/CellConcerns-Di-56BMe.js","/assets/CellDetails-DI-9SnQc.js","/assets/CellFormModal-C7LCzqi7.js","/assets/CellIdent-CocrwF1m.js","/assets/CellLink-DfJ5hFRT.js","/assets/Cells-DT957kbK.js","/assets/ColumnFilter-B6xBXXfu.js","/assets/ColumnsPicker-BcFzQTpX.js","/assets/CommentsModal-B739VlZV.js","/assets/ComparisonTable-BtfaL2E2.js","/assets/Concerns-DDV1lvsG.js","/assets/Daily-DLFxEuZO.js","/assets/DataTable-BqaKrbWq.js","/assets/DateRangePicker-Ce0CreD6.js","/assets/DayReportView-BZS9wTJJ.js","/assets/DayStepper-Fb-RG16e.js","/assets/DifferenceBreakdown-B4DRWSvN.js","/assets/Downtime-BJ0CLhl5.js","/assets/Education-Pvx0TfT7.js","/assets/EducationLesson-BQapG2c6.js","/assets/EmptyState-DvFrDkmT.js","/assets/Exam-DvoFrrJ8.js","/assets/FactorySelect-B6a50jD5.js","/assets/Gamification-C6h_oYMw.js","/assets/GroupBadge-DUHSKJn8.js","/assets/HeatmapChart-BQ7HPjHs.js","/assets/IdleCell-LrWocbcv.js","/assets/KPICard-BQnMHXAQ.js","/assets/Kaizen-CftSwctD.js","/assets/Kelish-T3MihBE5.js","/assets/KpiDeltaCard-DFWI2vzi.js","/assets/LangTextInput-jK0eH_Bf.js","/assets/Layout-BvdD7ZLC.js","/assets/LeaderAppeal-Ie2jE_-Y.js","/assets/LeaderDayReport-D_RjjU4f.js","/assets/LeaderUnitReport-DlRG3cF4.js","/assets/Leaderboard-BXDx8B8_.js","/assets/Leaders-fOXK1U8J.js","/assets/Lightbox-B65gR-xO.js","/assets/LiveOverview-En3_UStg.js","/assets/Login-BHJxtEPv.js","/assets/NotFound-B1GH33cv.js","/assets/Notifications-BpcdZeoa.js","/assets/Overview-Cs924Vc2.js","/assets/Pagination-CjYgYwGK.js","/assets/PerenaladkaFactTable-bfH-ntiY.js","/assets/PersonCard-DKhkDWnT.js","/assets/PlanFulfillment-BBGgp6J0.js","/assets/Production-DiXbuN52.js","/assets/Profile-Bi14LcAv.js","/assets/ProofCamera-CXh55IZS.js","/assets/ProofPhoto-CJtCgj2K.js","/assets/Quality-CedeXmDI.js","/assets/RawRows-Dvkt2tc8.js","/assets/RequestStateChip-BOAq0qPm.js","/assets/RichTextEditor-BOUfRdMC.js","/assets/SaveState-mgx1Vs44.js","/assets/SearchInput-D5ypGfvB.js","/assets/SeasonalityHeatmap-Br4c9QSp.js","/assets/SegmentedToggle-m6HzVQM_.js","/assets/SetupTimes-SiNfZTv6.js","/assets/ShiftDaily-Dz06PQNz.js","/assets/Staff-aN_0qTJV.js","/assets/StatusBadge-BrU6SxeV.js","/assets/TargetGoal-B6tgNoWv.js","/assets/Targets-BkSHnNkP.js","/assets/Tasks-Ch_OkT_F.js","/assets/TimeWheelPicker-CYz4zdMO.js","/assets/Toast-CUbB_KvT.js","/assets/Tooltip-CpIqDHCE.js","/assets/TrendChart-DeR-jilv.js","/assets/TripleSpeedometer-BGzCSSlC.js","/assets/Trudoyomkost-D0Vk0r3O.js","/assets/Turnover-CvGD8H-G.js","/assets/UploadDropzone-Dsvwg4tq.js","/assets/UsersActivity-BJjgrtxY.js","/assets/VerdictBlock-C_Ca-_up.js","/assets/VfxApiMap-CWhRhpVd.js","/assets/VfxDictionaries-nhokx_PL.js","/assets/VfxEmployees-CgIe7jvI.js","/assets/VfxHrMoves-BU5jl3gw.js","/assets/VfxJobs-B7PF1SPw.js","/assets/VfxPhoto-hUrRz7-l.js","/assets/VfxShifts-BtYt9b0c.js","/assets/VfxState-kCaqeJuN.js","/assets/VfxTimebooks-iR0m_AgE.js","/assets/VfxTimesheet-MJZgC2UQ.js","/assets/WatchProgress-gDbrJaIo.js","/assets/WebLogin-_kof5Y5h.js","/assets/WorkerConcerns-B0x8STlf.js","/assets/Workers-C_ol2OwZ.js","/assets/Zagruzka-Bqy40BRB.js","/assets/ZagruzkaCell-DGBvhfE_.js","/assets/api-DJcDpV86.js","/assets/archive-3r8Ozjpr.js","/assets/archive-restore-CYBDWSmG.js","/assets/arrow-down-C9lNv5VH.js","/assets/arrow-up-narrow-wide-HHqiZAxx.js","/assets/award-ez1bFiT0.js","/assets/ban-sugp55X9.js","/assets/boxes-Dh5pLVOJ.js","/assets/braces-C2qCFn27.js","/assets/brigadirFilters-DsEpkBII.js","/assets/broadcastTree-CzGhOb-l.js","/assets/building-2-Cn2WkB9I.js","/assets/calculator-DO7NlEZF.js","/assets/calendar-SKP8vFuW.js","/assets/calendar-days-Bo47eavZ.js","/assets/camera-CDTXvnWH.js","/assets/categories-C6-VNqGN.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-eAUQDwbi.js","/assets/chart-line-BF930pfz.js","/assets/chart-pie-CHyDRvSq.js","/assets/chartRange-BrC3-EmH.js","/assets/check-check-COaXRnmd.js","/assets/chevron-left-Cd2EWT6B.js","/assets/chevrons-up-down-BWme6P2V.js","/assets/circle-3hGM_TXV.js","/assets/circle-alert-cpR49Cwm.js","/assets/circle-check-big-1cP_mv1d.js","/assets/circle-dashed-Ck1ccVEH.js","/assets/circle-minus-C5THASJa.js","/assets/circle-question-mark-CxBuJqpr.js","/assets/circle-slash-BUcHe0Cc.js","/assets/circle-user-round-DnnZ9h2R.js","/assets/clock-3-PlU60a7v.js","/assets/cloud-off-BpZRlwsr.js","/assets/cloud-upload-CsoRokVM.js","/assets/compass-C9nCoLfk.js","/assets/concernCategories-D1XCr4OF.js","/assets/copy-DG3nDFrL.js","/assets/corner-down-right-DFMOwm7e.js","/assets/createLucideIcon-2ELStPPH.js","/assets/es-C3lAJpwg.js","/assets/external-link-iElLNgIv.js","/assets/file-clock-Lh5yh7Hq.js","/assets/file-exclamation-point-DsrILEeC.js","/assets/flag-DplDg8Kq.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Dck-9J8x.js","/assets/hash-B_REAQ3H.js","/assets/hourglass-sKK4SFnL.js","/assets/image-BCPPDkKD.js","/assets/image-off-B1z-xUbU.js","/assets/inbox-2lvDoCW1.js","/assets/index-B7yzqq84.css","/assets/index-Cadg6c2i.js","/assets/keyboard-BrtVykoE.js","/assets/languages-Crm9RZK0.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BBut9BTA.js","/assets/lightbulb-BQaasYOR.js","/assets/link-2-off-DMV8Ve2p.js","/assets/link-2-sEUvdRpW.js","/assets/list-ordered-CIKmzDum.js","/assets/list-tree-CaTMnkTq.js","/assets/lock-open-DNGrRqZb.js","/assets/log-in-t37twRsh.js","/assets/minimize-2-sqvkb2l_.js","/assets/package-check-VD69CTdp.js","/assets/pencil-CEw9N2nO.js","/assets/percent-D0ZVxDVA.js","/assets/pin-D-9nXqbB.js","/assets/pin-off-BKmqSEt2.js","/assets/play-CeZdirT7.js","/assets/plug-zap-D1a6Lzgd.js","/assets/prop-types-BbFr3bNL.js","/assets/radio-B-gHJS6m.js","/assets/react-apexcharts.esm-DEAADdn2.js","/assets/registers-CgdMb1Bp.js","/assets/repeat-BFJOI4lx.js","/assets/save-QiaAnD32.js","/assets/scopeLinks-CgZg-VwR.js","/assets/scroll-text-CvAauwTY.js","/assets/search-x-CITMoe73.js","/assets/segments-BphhZJyG.js","/assets/send-CBXoZV5N.js","/assets/settings-2-D_q_uxR5.js","/assets/shield-Ch5je4W6.js","/assets/shield-alert-Bmr950Vm.js","/assets/shield-question-mark-Bs8DKbLQ.js","/assets/siren-BH5wrI3H.js","/assets/snowflake-CfA-piTh.js","/assets/split-CwVXIiuH.js","/assets/square-check-big-DQEyraxR.js","/assets/star-Csi9lcR2.js","/assets/statusBands-Bqnq-ksn.js","/assets/store-g7GYOUCj.js","/assets/table-2-ptK__cel.js","/assets/table-properties-Da_ymUhE.js","/assets/tag-Clk_wXbH.js","/assets/timer-off-BixOeleY.js","/assets/trending-down-C6QHLgig.js","/assets/trending-up-BMUHo-hj.js","/assets/undo-2-CiXau3lV.js","/assets/useChartTheme-BTZ34xhB.js","/assets/useElementWidth-BGoQEWJt.js","/assets/useIsMobile-BRYP02Jf.js","/assets/useOpenParam-BkV_MNYg.js","/assets/useStatusBands-CjpbZ7QS.js","/assets/useUrlScope-DkXlkPX1.js","/assets/user-CWGmyykr.js","/assets/user-cog-o8uYRlIG.js","/assets/users-BnsPAe6S.js","/assets/vfx-DTMIvr_H.js","/assets/video-BQmLZtQ6.js","/assets/wallet-BefJyUfM.js","/assets/warehouse-CeMadooo.js","/assets/x-DryC6-5B.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
