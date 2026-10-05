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

const BUILD = "2026-10-05T06:38:02.872Z";
const PRECACHE = ["/","/assets/AdminPanel-DZ4_U6qN.js","/assets/AnalysisBoard-DaOONAjp.js","/assets/Arc-DiPTiNvB.js","/assets/ArcLegacy-lv6c8S2L.js","/assets/BrigadirProfile-Kfgk5xwv.js","/assets/BroadcastReceivers-NENQ-JfX.js","/assets/BroadcastRecord-BqafglE5.js","/assets/CatLockNotice-Bmdgi96V.js","/assets/CategoryLegendModal-BFM71BSV.js","/assets/CellConcerns-D2-vnFc-.js","/assets/CellDetails-ZzeD3kb_.js","/assets/CellFormModal-BkUyc0zc.js","/assets/CellIdent-BQhnWguK.js","/assets/CellLink-BShmh9A4.js","/assets/Cells-DmjR5mEK.js","/assets/ColumnFilter-C_mmQMpF.js","/assets/ColumnsPicker-DobQRlXm.js","/assets/CommentsModal-C6clgjQa.js","/assets/ComparisonTable-RwFOA_ml.js","/assets/Concerns-DiItYVCb.js","/assets/ConfirmDialog-VJhCMiVz.js","/assets/Daily-gJsFLOG7.js","/assets/DataTable-Bz5obzPh.js","/assets/DateRangePicker-ByH3IaL-.js","/assets/DayReportView-BRaf39_O.js","/assets/DayStepper-DcWpR69c.js","/assets/DifferenceBreakdown-DNIa7lq9.js","/assets/Downtime-FrhA3PTV.js","/assets/Education-CUqqV9KW.js","/assets/EducationLesson-Cfndy0TJ.js","/assets/EmptyState-BLOtdqjG.js","/assets/Exam-Dne9yGdw.js","/assets/FactorySelect-DN0a_ksK.js","/assets/Gamification-D3JkjsUm.js","/assets/GroupBadge-Lqzmh8Vs.js","/assets/HeatmapChart-BHjV2T4F.js","/assets/IdleCell-DJEXvX2e.js","/assets/KPICard-C5M1PW69.js","/assets/Kaizen-MvdoqxPB.js","/assets/Kelish-DWyTNvso.js","/assets/KpiDeltaCard-DNXniFfh.js","/assets/LangTextInput-B_EaWq7y.js","/assets/Layout-BxnC36Fz.js","/assets/LeaderAppeal-C8iYG7S9.js","/assets/LeaderDayReport-Bj8Sc1oN.js","/assets/LeaderUnitReport-CWPfTZi_.js","/assets/Leaderboard-C0RamINq.js","/assets/Leaders-DcyDN83p.js","/assets/Lightbox-hD0qAGwP.js","/assets/LiveOverview-CZKQWzw7.js","/assets/Login-t1M7f6dh.js","/assets/NotFound-DMUGUx-y.js","/assets/Notifications-CPBmOzQf.js","/assets/Overview-BTiwb2la.js","/assets/Pagination-C7vvXkUZ.js","/assets/PerenaladkaFactTable-DRf7-hzm.js","/assets/PersonCard-B778o85O.js","/assets/PlanFulfillment-D-vIdD4f.js","/assets/Production-MzJb-EXW.js","/assets/Profile-x4ICkPbW.js","/assets/ProofCamera-BlH_4-r4.js","/assets/ProofPhoto-CBZKxBCV.js","/assets/Quality-CpZN0Pmv.js","/assets/RawRows-rGg0q7-M.js","/assets/RequestStateChip-YhLBc_bg.js","/assets/RichTextEditor-Dh5jBQZe.js","/assets/SaveState-COQ6yW92.js","/assets/SearchInput-DW4bES5u.js","/assets/SeasonalityHeatmap-Dn1O97GQ.js","/assets/SegmentedToggle-DOD5vU50.js","/assets/SetupTimes-qtPIDeiG.js","/assets/ShiftDaily-ChAZ0x-U.js","/assets/Staff-D3PCbAzC.js","/assets/StaffLive-K3jGstd3.js","/assets/StatusBadge-6uHKy0mb.js","/assets/TargetGoal-BLN0cpK4.js","/assets/Targets-CBNjgS-m.js","/assets/Tasks-lhNP_Kzz.js","/assets/TimeWheelPicker-CZWn7dwO.js","/assets/Toast-BH7op96S.js","/assets/Tooltip-CDM8y57K.js","/assets/TrendChart-S4u9FrPW.js","/assets/TripleSpeedometer-FBFWVzSR.js","/assets/Trudoyomkost-CaaVPVs4.js","/assets/Turnover-DdOSDKxn.js","/assets/UploadDropzone-BSEw_tja.js","/assets/UsersActivity-Ta5c_GY9.js","/assets/VerdictBlock-kVCKmhc5.js","/assets/VfxApiMap-B-pqFy1l.js","/assets/VfxDictionaries-DNAa60n9.js","/assets/VfxEmployees-BhJjbO3A.js","/assets/VfxHrMoves-CiZ8Kh_C.js","/assets/VfxJobs-BnYHwLhI.js","/assets/VfxPhoto-CfeJlEeD.js","/assets/VfxShifts-zXj7I0Oz.js","/assets/VfxState-BSCxCvaW.js","/assets/VfxTimebooks-BRUGScVv.js","/assets/VfxTimesheet-DQ2zcXs9.js","/assets/WatchProgress-MifcWPsS.js","/assets/WebLogin-C6FebSKJ.js","/assets/WorkerConcerns-Fkm-XR3m.js","/assets/Workers-CrP5SCru.js","/assets/Zagruzka-n9qOwFCv.js","/assets/ZagruzkaCell-BvLVWvl5.js","/assets/api-BMHMUxXR.js","/assets/archive-B8fj-6uE.js","/assets/archive-restore-ipeXcaFJ.js","/assets/arrow-down-B0NWfU1y.js","/assets/arrow-left-Dt1vfWGv.js","/assets/arrow-up-0BVqm_D7.js","/assets/arrow-up-narrow-wide-DlWbJ6YS.js","/assets/arrow-up-right-BbXJIl16.js","/assets/award-C0MDIHUB.js","/assets/ban-D7Z_ntkY.js","/assets/book-open-DhXzduKl.js","/assets/bot-C7VSyQKy.js","/assets/boxes-CWq1OVBW.js","/assets/braces-BMUkRIvQ.js","/assets/brigadirFilters-B4G6Sjkq.js","/assets/broadcastTree-DkVKTfnl.js","/assets/building-2-DN4xm-Dc.js","/assets/calculator-mcwdWa04.js","/assets/calendar-4f33F-Fl.js","/assets/calendar-days-CZvF_Q10.js","/assets/camera-DK-CO_7F.js","/assets/categories-BAPD1NjI.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D2K4Ff5n.js","/assets/chart-line-I3NCKF2Q.js","/assets/chart-pie-vxeG24OC.js","/assets/chartRange-xffEE3i3.js","/assets/check-check-B1IcGpd-.js","/assets/chevron-left-DuAhdcmA.js","/assets/chevrons-up-down-C7InXnPy.js","/assets/circle-DJDkWrak.js","/assets/circle-alert-CQRDIOHV.js","/assets/circle-check-big-C_1orCjO.js","/assets/circle-dashed-Dnwn81SH.js","/assets/circle-minus-ClgeIKvu.js","/assets/circle-question-mark-XzqiXtSc.js","/assets/circle-slash-CCUvPIzl.js","/assets/circle-user-round-DW3pspFM.js","/assets/clock-3-BW5oqQH1.js","/assets/cloud-off-CCE5dLJ8.js","/assets/cloud-upload-CRqHqHED.js","/assets/compass-CtejM3Dh.js","/assets/concernCategories-BriQ-8PP.js","/assets/copy-UpuefSnG.js","/assets/corner-down-right-fxvGcqa-.js","/assets/createLucideIcon-YDGK5HSh.js","/assets/es-BmYAriQ0.js","/assets/exportXlsx-D0en96lj.js","/assets/external-link-O5qi6LGi.js","/assets/file-clock-O8U7KbU8.js","/assets/file-exclamation-point-DxUkn0Y_.js","/assets/file-spreadsheet-DduISs4M.js","/assets/file-text-BPQ_rGzC.js","/assets/flag-DJUGm0ij.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Dpwhxh4J.js","/assets/hash-CiB4V--0.js","/assets/history-CywbU7Kb.js","/assets/hourglass-B6qc-rpt.js","/assets/image-C_2fgsLo.js","/assets/image-off-BU1xMxXi.js","/assets/inbox-CJqAKVKh.js","/assets/index-B52SMSSi.css","/assets/index-BJ1aeHv5.js","/assets/key-round-CVobPfjF.js","/assets/keyboard-Ca3gCVQ2.js","/assets/languages-Dtswlf3e.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Dn58OfRY.js","/assets/lightbulb-C_scAhLB.js","/assets/link-2-Hk4vnxO1.js","/assets/link-2-off-B9HZ4nT2.js","/assets/list-ordered-BT4wyXyi.js","/assets/list-tree-CxO1rk6-.js","/assets/lock-open-CW52EG9M.js","/assets/log-in-BpZk2Xzp.js","/assets/maximize-2-DCov08LZ.js","/assets/message-square-BwetXIUN.js","/assets/minimize-2-D2zZkV6L.js","/assets/package-check-CWnNJHdX.js","/assets/paperclip-D1aJ2Otf.js","/assets/pencil-DpAcjQ3L.js","/assets/percent-p6D3WSZ7.js","/assets/pin-C65T46G2.js","/assets/pin-off-CocTET8m.js","/assets/play-DCaoq2x3.js","/assets/plug-zap-DIqxZoCr.js","/assets/presentation-DIjMOwR2.js","/assets/prop-types-C2dZkmEA.js","/assets/radio-DXGENJP0.js","/assets/react-apexcharts.esm-D7j4C8u8.js","/assets/registers-FuLZQQhm.js","/assets/repeat-Pn6dshN2.js","/assets/rotate-ccw-DbXDPWrx.js","/assets/rotate-cw-MD5e2P2o.js","/assets/save-DH8tyTW8.js","/assets/scopeLinks-D9zCuSQg.js","/assets/scroll-text-DsVBSlCa.js","/assets/search-x-CkyB1Ciu.js","/assets/segments-yhHyioQB.js","/assets/send-C5-Rs6r0.js","/assets/settings-2-CplW-3aG.js","/assets/shield-DxbTUs9P.js","/assets/shield-alert-B-8DBUiI.js","/assets/shield-check--k0IlcPw.js","/assets/shield-question-mark-4M9mqx8b.js","/assets/siren-G8sKgN-o.js","/assets/snowflake-l9GP70cE.js","/assets/split-BqQjzKwU.js","/assets/square-DSAW1lOk.js","/assets/square-check-big-BCga-miJ.js","/assets/star-C0LuLl-v.js","/assets/statusBands-DOpNCfyY.js","/assets/store-DhFypUnz.js","/assets/table-2-DNNrTyFE.js","/assets/table-properties-B0VPel92.js","/assets/tag-DrSiQZZ1.js","/assets/timer-off-CK6Ax5gZ.js","/assets/trending-down-ByIsQy37.js","/assets/trending-up-ue5oWHYI.js","/assets/undo-2-sMdWKj3n.js","/assets/useChartTheme-DRK-NVzm.js","/assets/useElementWidth-K4MN-AB2.js","/assets/useIsMobile-DUtQFGAG.js","/assets/useOpenParam-7GbbpGJS.js","/assets/useStatusBands-Dtp6h9oZ.js","/assets/useUrlScope-h11PvhN-.js","/assets/user-DnShJgEF.js","/assets/user-cog-COxe6vGd.js","/assets/users-DYwcOutI.js","/assets/vfx-Ds0lhuBv.js","/assets/video-8usnn496.js","/assets/wallet-BwHGcnMR.js","/assets/warehouse-Bf5xkM0L.js","/assets/x-SqGn_z-k.js","/assets/zap-D-0gcpGh.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
