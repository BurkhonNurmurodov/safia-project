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

const BUILD = "2026-09-26T09:08:43.578Z";
const PRECACHE = ["/","/assets/AdminPanel-DYXRmgvO.js","/assets/AnalysisBoard-C_Tn3b93.js","/assets/Arc-DbDc_0Eb.js","/assets/ArcLegacy-BBsLZr0q.js","/assets/AttendanceModal-BYwVQX1J.js","/assets/BrigadirProfile-cmxtwTW_.js","/assets/BroadcastReceivers-DvXf5Shb.js","/assets/BroadcastRecord-BbX96aFA.js","/assets/CatLockNotice-BG5KwBbg.js","/assets/CategoryLegendModal-AeCf9xDE.js","/assets/CellConcerns-D8ESZHqb.js","/assets/CellDetails-CSh8lZuc.js","/assets/CellFormModal-CIC-2eiS.js","/assets/CellLink-CbTKwvAI.js","/assets/Cells-D_nkcvv1.js","/assets/ColumnFilter-BrSMKBs2.js","/assets/ColumnsPicker-cW7d65zt.js","/assets/CommentsModal--MyVcWvf.js","/assets/ComparisonTable-CPxqyh5V.js","/assets/Concerns-DMuP3n45.js","/assets/ConfirmDialog-kKJG6wT1.js","/assets/Daily-D7v3pXHC.js","/assets/DataTable-B2ng_M_n.js","/assets/DateRangePicker-DogkxiRV.js","/assets/DayReportView-Cb2by8Aj.js","/assets/DayStepper-w_zzEGd5.js","/assets/DifferenceBreakdown-izUx-Zd3.js","/assets/Downtime-C-OzRfKB.js","/assets/Education-CVTJ8J4H.js","/assets/EducationLesson-qSUoqHzZ.js","/assets/EmptyState-BSpvlB5b.js","/assets/Exam-C4WPEYS9.js","/assets/FactorySelect-BtfUPkHe.js","/assets/Gamification-DMnfKLMK.js","/assets/GroupBadge-DHTlQfJf.js","/assets/HeatmapChart-DU5wpFKq.js","/assets/IdleCell-kRsFxf01.js","/assets/KPICard-BZQTML-b.js","/assets/Kaizen-BRXeN1eQ.js","/assets/KpiDeltaCard-R6HWyt0H.js","/assets/LangTextInput-BIHLORmP.js","/assets/Layout-YFPyxbFS.js","/assets/LeaderAppeal-C9-5eges.js","/assets/LeaderDayReport-Ck3rPHW_.js","/assets/LeaderUnitReport--YODt1oG.js","/assets/Leaderboard-C40WtT3b.js","/assets/Leaders-CmIObZyz.js","/assets/Lightbox-Ds_uEA4n.js","/assets/LiveOverview-BWD-2g7L.js","/assets/Login-DM7RFsuX.js","/assets/NotFound-BsTqPAv1.js","/assets/Overview-EZ9NmIP7.js","/assets/Pagination-DCnBxJCa.js","/assets/PerenaladkaFactTable-DAZzWmvL.js","/assets/PlanFulfillment-DT2_0fOv.js","/assets/Production-Cs3jWOIg.js","/assets/Profile-_xskeWn7.js","/assets/ProofCamera-BvO3Pz7C.js","/assets/ProofPhoto-BpLopdDK.js","/assets/Quality-mM7w7gt-.js","/assets/RequestStateChip-D3G8z5Hc.js","/assets/RichTextEditor-DbGgFdw4.js","/assets/SearchInput-BQPTaHdI.js","/assets/SeasonalityHeatmap-DFa7p9EA.js","/assets/SegmentedToggle-bsUB7qAT.js","/assets/SetupTimes-CEwjpp38.js","/assets/ShiftDaily-DlfVOVgD.js","/assets/Staff-u86osxWu.js","/assets/StatusBadge-DN-nIx2B.js","/assets/Targets-KEp2qsb5.js","/assets/Tasks-DaQZDixp.js","/assets/TimeWheelPicker-B54WOAF3.js","/assets/Tooltip-Cl56moL8.js","/assets/TrendChart-CDaBZHVP.js","/assets/TripleSpeedometer-SmUF55SD.js","/assets/Trudoyomkost-BPCfiFC0.js","/assets/UsersActivity-BFQKJNo5.js","/assets/WatchProgress-mpRlS19g.js","/assets/WebLogin-C-VZmmW0.js","/assets/WorkerConcerns-BoUE4uWL.js","/assets/Workers-CiIecGXf.js","/assets/Zagruzka-_Jcl-q98.js","/assets/ZagruzkaCell-DzbzUdqp.js","/assets/alarm-clock-DnhUnErk.js","/assets/api-DpvxgdKB.js","/assets/archive-Bzfhwkl4.js","/assets/archive-restore-BtuLfQAZ.js","/assets/arrow-down-BQVN3tUc.js","/assets/arrow-left-BJbDAqOt.js","/assets/arrow-left-right-C_v_TrpX.js","/assets/arrow-up-CdC_mkjo.js","/assets/arrow-up-right-CtcABSUq.js","/assets/award-C5IXKHat.js","/assets/ban-DKuY3kIC.js","/assets/bot-ku27dTLW.js","/assets/boxes-E-66xGYA.js","/assets/brigadirFilters-ChhI-fvs.js","/assets/broadcastTree-DBE8Axi0.js","/assets/building-2-EwGZEXXo.js","/assets/calendar-BzwAHFfk.js","/assets/calendar-clock-bqn5--Qj.js","/assets/calendar-days-CTWag0TJ.js","/assets/calendar-range-IKYGxFsj.js","/assets/camera-BfXm2hl3.js","/assets/categories-D7GYBWWp.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DFmzveaJ.js","/assets/chart-line-BxyLs1Ix.js","/assets/chart-pie-Dgte8CJy.js","/assets/chartRange-BAu27-Vi.js","/assets/check-check-BqgQYJ9K.js","/assets/chevron-left-0pivtUD9.js","/assets/chevrons-up-down-DHuKhoxC.js","/assets/circle-check-big-BJr9r9ii.js","/assets/circle-dashed-Bt4SsAQI.js","/assets/circle-dot-D6xOgw_z.js","/assets/circle-minus-BDKndyfN.js","/assets/circle-slash-DLp5j5JL.js","/assets/circle-user-round-DAxRV4jq.js","/assets/cloud-upload--KGnL29Y.js","/assets/coins-Bop2dr33.js","/assets/compass-DGRWDbP5.js","/assets/concernCategories-Dhru6tJb.js","/assets/copy-uLIQozkQ.js","/assets/corner-down-right-BGVE19gV.js","/assets/createLucideIcon-DhLOwIOV.js","/assets/es-BJgsBAIi.js","/assets/exportXlsx-BbjfNpia.js","/assets/external-link-CvBAHL0P.js","/assets/file-clock-D_FNtnXS.js","/assets/file-exclamation-point-CZw9qtGn.js","/assets/file-spreadsheet-DnE4sBuW.js","/assets/file-text-CSLfjbdD.js","/assets/flag-At5X8lII.js","/assets/flame-DggK5Uus.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Dbw15pso.js","/assets/hash-fDZCDIn8.js","/assets/history-qqjxjONs.js","/assets/hourglass-B161ahTV.js","/assets/image-DeX20oqi.js","/assets/image-off-bAeHz7Vu.js","/assets/index-DbuJBSHu.js","/assets/index-DwPevLKe.css","/assets/key-round-BWlmQSyK.js","/assets/keyboard-B2PJTt_i.js","/assets/languages-jnkTSD30.js","/assets/layers-DszAfV50.js","/assets/leaderReason-DZqFldFW.js","/assets/lightbulb-zEbCugTc.js","/assets/link-2-BylXb-PO.js","/assets/list-checks-DH1RCeOG.js","/assets/list-ordered-CmCV-MAg.js","/assets/list-tree-2SHCCQxX.js","/assets/lock-open-Vwtke3nD.js","/assets/log-in-CsJGz_6u.js","/assets/message-square-Bgo2aRdb.js","/assets/minimize-2-Ycc_jAmh.js","/assets/package-check-DBnG_K7i.js","/assets/paperclip-Ddlf9j5i.js","/assets/pencil-DwDsAZUc.js","/assets/personName-B4KId4zS.js","/assets/pin-C4fpiXFw.js","/assets/play-C6hEdvNL.js","/assets/presentation-tuncxJ_E.js","/assets/prop-types-Bf1wsjrs.js","/assets/radio-I7x04iBX.js","/assets/react-apexcharts.esm-Cjls4ME2.js","/assets/repeat-DNesG42I.js","/assets/rotate-ccw-BR4tlniv.js","/assets/rotate-cw-CvwFKqMT.js","/assets/save-C-b10mtM.js","/assets/scale-DlegcDjQ.js","/assets/scroll-text-1z2cij0E.js","/assets/search-x-1jnAnOgd.js","/assets/segments-CsY9JYhB.js","/assets/send-aWyQmvNq.js","/assets/settings-2-DjyRTDzc.js","/assets/shield-C1akRoL-.js","/assets/shield-alert-CgGfFDXI.js","/assets/shield-check-mFdR7uJh.js","/assets/shield-question-mark-CXJVrT8W.js","/assets/siren-CQHyNVqD.js","/assets/smartphone-CUVFX8Ky.js","/assets/snowflake-2EjbZuoe.js","/assets/square-check-big-DqJKg4rj.js","/assets/square-tbtR6mgZ.js","/assets/star-DCjkxs92.js","/assets/statusBands-1wlXk_Hc.js","/assets/store-CxgP1ue_.js","/assets/table-2-Cvy1IrQf.js","/assets/tag-XyhAslul.js","/assets/trending-down-uQi7qP5d.js","/assets/trending-up-C3I6P77i.js","/assets/triangle-alert-CY9mCrIB.js","/assets/undo-2-Dut4iVoS.js","/assets/useChartTheme-BrePZ8MO.js","/assets/useElementWidth-CwzqMjEF.js","/assets/useIsMobile-CTz-3Yke.js","/assets/useMutation-PxH4tyhm.js","/assets/useStatusBands-Db9fNqfd.js","/assets/user-BihyenP1.js","/assets/user-check-BXJrlUU1.js","/assets/user-cog-D6hdjVcG.js","/assets/user-minus-BEZCIk6T.js","/assets/users-BhnJJPK1.js","/assets/verifyState-DC0WT4l7.js","/assets/video-DxRkb7yK.js","/assets/warehouse-CEqjCinh.js","/assets/zap-CA2WfqIR.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
