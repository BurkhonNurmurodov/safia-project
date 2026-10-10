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

const BUILD = "2026-10-10T08:32:12.170Z";
const PRECACHE = ["/","/assets/AdminPanel-DD_QN7V9.js","/assets/AnalysisBoard-8D-I43ud.js","/assets/Arc-1Lu11MpT.js","/assets/Assistant-RJKylbZv.js","/assets/BrigadirProfile--1TAHFw9.js","/assets/BroadcastReceivers-7VmSY_6w.js","/assets/BroadcastRecord-Beugk_EV.js","/assets/Button-DnvH60_L.js","/assets/CatLockNotice-DZpeyZ2B.js","/assets/CategoryLegendModal-DGrMKhYB.js","/assets/CellConcerns-D6pZ-KFy.js","/assets/CellDetails-DV2kZgkH.js","/assets/CellFormModal-DAgfKBt1.js","/assets/CellIdent-DfwuxQx-.js","/assets/CellLink-CnrMXYfg.js","/assets/Cells-kjiEeJ34.js","/assets/ColumnFilter-BNzYxyjX.js","/assets/ColumnsPicker-C65wZme6.js","/assets/CommentsModal-DEHIHKmn.js","/assets/ComparisonTable-CBQA9mNe.js","/assets/Concerns-BEdYwItx.js","/assets/Daily-D7ZWcNek.js","/assets/DataTable-CAHgC8Qd.js","/assets/DateRangePicker-l-c6fewr.js","/assets/DayReportView-DaqbtEwO.js","/assets/DayStepper-Byv10usP.js","/assets/DifferenceBreakdown-CdbtHzyz.js","/assets/Downtime-CLdv0jkm.js","/assets/Education-DtPgWcio.js","/assets/EducationLesson-Diobw-EM.js","/assets/EmptyState-Cf3ifjaV.js","/assets/Exam-gg3TFug3.js","/assets/FactorySelect-D2k9QLbV.js","/assets/Gamification-zLIBM4Ev.js","/assets/GroupBadge-BOzTu2__.js","/assets/HeatmapChart-EEoaRKL_.js","/assets/IdleCell-CmYXC3g_.js","/assets/KPICard-CoDqDaKB.js","/assets/Kaizen-CRSeCwIF.js","/assets/Kelish-Dhc7KbIi.js","/assets/KpiDeltaCard-Dc8fkkgp.js","/assets/LangTextInput-DQTFwl-x.js","/assets/Layout-Cq4v5zVz.js","/assets/LeaderAppeal-BYTreHDV.js","/assets/LeaderDayReport-DL0ZQ_jW.js","/assets/LeaderUnitReport-22f9PGBZ.js","/assets/Leaderboard-DmPkKVsH.js","/assets/Leaders-CsNB8F2D.js","/assets/Lightbox-B6VeNx7z.js","/assets/LiveOverview-D-vvaZiw.js","/assets/Login-BGu-ZMaz.js","/assets/NotFound-DfYz3OBw.js","/assets/Notifications-IpnSbp4q.js","/assets/Overview-CWrUJ5yB.js","/assets/Pagination-Dq3ql-D8.js","/assets/PerenaladkaFactTable-Cy3VkzGv.js","/assets/PersonCard-DITy3W-L.js","/assets/PlanFulfillment-C8hVaCRO.js","/assets/Production-ZumJqate.js","/assets/Profile-CNlq4gWO.js","/assets/ProofCamera-CajWFHGq.js","/assets/ProofPhoto-CVcpiVte.js","/assets/Quality-THJg2W2M.js","/assets/RawRows-C4451qk7.js","/assets/RequestStateChip-CdjJcOUz.js","/assets/RichTextEditor-C-N1GU_a.js","/assets/SaveState-MlLGKTzX.js","/assets/SearchInput-CNObxAaC.js","/assets/SeasonalityHeatmap-eCg2LwF6.js","/assets/SegmentedToggle-Dz9h4S9R.js","/assets/SetupTimes-DxXhwb_2.js","/assets/ShiftDaily-BXBrcUOM.js","/assets/Staff-BFuJsus4.js","/assets/StatusBadge-BKNDNJgr.js","/assets/TargetGoal-rxZHlfZu.js","/assets/Targets-CbvCzTGu.js","/assets/Tasks-DLZaWIdL.js","/assets/TimeWheelPicker-DZ5ccCgA.js","/assets/Toast-DuoxEXx5.js","/assets/Tooltip-DrHFy4nE.js","/assets/TrendChart-aNHRXY7n.js","/assets/TripleSpeedometer-cs-iDqcL.js","/assets/Trudoyomkost-JRR9jrQv.js","/assets/Turnover-BMYYpG5L.js","/assets/UploadDropzone-DeoHtmlM.js","/assets/UsersActivity-Bp0C0vMX.js","/assets/VerdictBlock-BXGkQhtd.js","/assets/VfxApiMap-BSkhixPm.js","/assets/VfxDictionaries-vil5LHYB.js","/assets/VfxEmployees-PICSSMQd.js","/assets/VfxHrMoves-DAgJwQqW.js","/assets/VfxJobs-CFzFF0Gd.js","/assets/VfxPhoto-_sv-QZ2z.js","/assets/VfxShifts-DAHRMted.js","/assets/VfxState-jkff80sg.js","/assets/VfxTimebooks-czR4ohlh.js","/assets/VfxTimesheet-Dwy9VPkB.js","/assets/WatchProgress-CFTb3k2q.js","/assets/WebLogin-BgHVXUAC.js","/assets/WorkerConcerns-DRbSI9MF.js","/assets/Workers-DAEOWDCH.js","/assets/Zagruzka-BNcgJGck.js","/assets/ZagruzkaCell-zMQdbMrx.js","/assets/api-CWHPO39D.js","/assets/archive-B6Eq7Akn.js","/assets/archive-restore-dniIc9ct.js","/assets/arrow-down-Dt_Zrwn7.js","/assets/arrow-down-wide-narrow-DA_SJyg2.js","/assets/arrow-up-narrow-wide-BdfoCriI.js","/assets/award-D3Nu_oBb.js","/assets/ban-3rddEt0x.js","/assets/boxes-Dg3ZFiVE.js","/assets/braces-CUmXgxiJ.js","/assets/brigadirFilters-Dx1OtdRz.js","/assets/broadcastTree-_1yAQQuw.js","/assets/building-2-CR5BK4LX.js","/assets/calculator-H9sMi4h1.js","/assets/calendar-C0qc451u.js","/assets/calendar-days-DPwPE3ax.js","/assets/camera-BMfSw9hj.js","/assets/categories-Ct4E1fHH.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DfEXAXxa.js","/assets/chart-line-BxE6wBCd.js","/assets/chart-pie-BRiJiJyF.js","/assets/chartRange-XuOsP-OV.js","/assets/check-check-BBhzyfIr.js","/assets/chevron-left-BQJV5GH2.js","/assets/chevrons-up-down-BhleFH2C.js","/assets/circle-83TPNSX6.js","/assets/circle-alert-PnC16BlG.js","/assets/circle-check-big-CVtzcAs4.js","/assets/circle-dashed-DDzegvBg.js","/assets/circle-minus-guAMRhEa.js","/assets/circle-question-mark-DDnfGwBk.js","/assets/circle-slash-Casi-HsM.js","/assets/circle-user-round-Bp9XJdRh.js","/assets/clock-3-AJnERAZV.js","/assets/cloud-off-Bb4LfTaS.js","/assets/cloud-upload-arKXvg-H.js","/assets/compass-BdOjjuz3.js","/assets/concernCategories-B0az-HRR.js","/assets/copy-D81_yLHH.js","/assets/corner-down-right-WeHPdqRI.js","/assets/createLucideIcon-CLj6hPb3.js","/assets/es-Bl2rr16V.js","/assets/external-link-o0o16jyO.js","/assets/file-clock-Cea7UNxv.js","/assets/file-exclamation-point-BBbMR0vK.js","/assets/flag-DFVQyqHP.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CJxvU7EV.js","/assets/hash-Dk9wW8lH.js","/assets/hourglass-DezW03-0.js","/assets/image-BDH3opyk.js","/assets/image-off-BYICMwFS.js","/assets/inbox-BXF0e-d_.js","/assets/index-DD8ZJtYw.css","/assets/index-HkALu4HB.js","/assets/keyboard-BFB96v3Q.js","/assets/languages-DpNIug_4.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C2fc9f1n.js","/assets/lightbulb-DHC86VOr.js","/assets/link-2-CBdaAlcs.js","/assets/link-2-off-OljCyGVT.js","/assets/list-ordered-DJswGpgW.js","/assets/list-tree-CWP_R5kr.js","/assets/lock-open-5CpFMC6-.js","/assets/log-in-D8cudFBL.js","/assets/minimize-2-CO88e_FU.js","/assets/package-check-hMpp7L87.js","/assets/pencil-B-6qv1yX.js","/assets/percent-h_tx1npi.js","/assets/pin-CSid1Jz3.js","/assets/pin-off-C0mwO1BR.js","/assets/play-DTu4IE6u.js","/assets/plug-zap-CEtT4b4r.js","/assets/prop-types-ZvzBFRuJ.js","/assets/radio-Dch_645V.js","/assets/react-apexcharts.esm-C2Mf-Iop.js","/assets/registers-A8Do4MLG.js","/assets/repeat-DWL5hgoP.js","/assets/save-Bc9sJZGe.js","/assets/scopeLinks-2ORBaTTX.js","/assets/scroll-text-Bq9Qf1ph.js","/assets/search-x-CCStZbLi.js","/assets/segments-BeQFMJj-.js","/assets/send-Ci9DRUng.js","/assets/settings-2-D8KHWTy0.js","/assets/shield-CocNzjEH.js","/assets/shield-alert-Ca1rinzw.js","/assets/shield-question-mark-H9gXvhPy.js","/assets/siren-Dn919nuf.js","/assets/snowflake-COzetKO0.js","/assets/split-mqGPPfWQ.js","/assets/square-check-big-CXGgd6Fk.js","/assets/star-DRb8VnSj.js","/assets/statusBands-Ds2M4Z5w.js","/assets/store-BW3YQ-T1.js","/assets/table-2-CZAhKgsF.js","/assets/table-properties-Bf4nog0c.js","/assets/tag-BJ6LCUJg.js","/assets/timer-off-CoA_QzEm.js","/assets/trending-down-DVbAgsBS.js","/assets/trending-up-DkFm-voy.js","/assets/undo-2-DsqyDeap.js","/assets/useChartTheme-CmQTYAx9.js","/assets/useElementWidth-of0Lv_O0.js","/assets/useIsMobile-C2lVZ784.js","/assets/useOpenParam-CQgUuW-W.js","/assets/useStatusBands-C28a6Or1.js","/assets/useUrlScope-BCjhe4bk.js","/assets/user-BC4LSB64.js","/assets/user-cog-NwsEMsQ0.js","/assets/users-VhhQxXWe.js","/assets/vfx-D5y2skX0.js","/assets/video-CV6MgGqQ.js","/assets/wallet-DtJUA2Ds.js","/assets/warehouse-7gbdeRXw.js","/assets/x-1RtqgGfD.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
