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

const BUILD = "2026-10-20T15:36:41.728Z";
const PRECACHE = ["/","/assets/AdminPanel-BYeJEnf0.js","/assets/AnalysisBoard-DXCN2VHx.js","/assets/Arc-CwXSBK0Z.js","/assets/Assistant-DgdmftcV.js","/assets/BrigadirProfile-CTWI_7n-.js","/assets/BroadcastReceivers-_A8ivaBT.js","/assets/BroadcastRecord-DEvbqXrR.js","/assets/Button-D8csKMsN.js","/assets/CatLockNotice-DUKsQPmo.js","/assets/CategoryLegendModal-D5HpK6ui.js","/assets/CellConcerns-DFmkVmqw.js","/assets/CellDetails-C656oaxx.js","/assets/CellFormModal-DS0w2hGC.js","/assets/CellIdent-D1u471by.js","/assets/CellLink-tllma8Do.js","/assets/Cells-BJ_UbdXd.js","/assets/ColumnFilter-9q7kszmB.js","/assets/ColumnsPicker-SRbHHpcH.js","/assets/CommentsModal-mEVsdNIJ.js","/assets/ComparisonTable-vlvCPbMD.js","/assets/Concerns-D-9wyn2H.js","/assets/CountStepper-CkS77KhL.js","/assets/Daily-D8WIgt_B.js","/assets/DataTable-D8nxvQla.js","/assets/DateRangePicker-Dt055toX.js","/assets/DayReportView-B60FNpwn.js","/assets/DayStepper-Dl4OFLYy.js","/assets/DayStrip-DQ7i6_m4.js","/assets/DifferenceBreakdown-Dt4hUqMM.js","/assets/Downtime-s1b512k6.js","/assets/Education-Bd8h3Xcm.js","/assets/EducationLesson-Dw_vnLLJ.js","/assets/EmptyState-D70RIZ0i.js","/assets/Exam-Dtc9UhNj.js","/assets/FactorySelect-CaMoTzJw.js","/assets/Gamification-BCYqi6vV.js","/assets/GroupBadge-ep2lfOGy.js","/assets/HeatmapChart-DuNYpEbs.js","/assets/IdleCell-uN1jgECY.js","/assets/KPICard-CGuynYep.js","/assets/Kaizen-ZYJTiZrm.js","/assets/Kelish-0L7jEVEO.js","/assets/KpiDeltaCard-DmE1AL78.js","/assets/LangTextInput-B40HCBjs.js","/assets/Layout-DLA_XVC5.js","/assets/LeaderAppeal-BGHSX5pH.js","/assets/LeaderDayReport-CzxmuOxn.js","/assets/LeaderUnitReport-Bc6eU4uO.js","/assets/Leaderboard-CyYKxn7k.js","/assets/Leaders-zkIULpT5.js","/assets/LeadersKpi-CC5euA7N.js","/assets/Lightbox-B3nADiki.js","/assets/LiveOverview-BPkWSpnW.js","/assets/Login-D2X45LQ8.js","/assets/NotFound-B1hG6ySO.js","/assets/Notifications-B99LEKR6.js","/assets/Ontime-D01jkhjZ.js","/assets/Overview-CJHvcFYx.js","/assets/Pagination-D0ykZFP5.js","/assets/PerenaladkaFactTable-DtUMb6al.js","/assets/PersonCard-BB75ioAp.js","/assets/PlanFulfillment-B0nZsdP4.js","/assets/Production-FMfDYi1Q.js","/assets/Profile-BUeTHt7N.js","/assets/ProofCamera-KOjR2JLD.js","/assets/ProofPhoto-CFeg9PwE.js","/assets/Quality-CFNiJcA3.js","/assets/RawRows-B8cuPwIf.js","/assets/RequestStateChip-Cho-LfM4.js","/assets/RichTextEditor-CDFCiaI8.js","/assets/SaveState-DnENu6jY.js","/assets/SearchInput-Chk3gBba.js","/assets/SeasonalityHeatmap-DavADpXa.js","/assets/SegmentedToggle-B-0LA-85.js","/assets/SetupTimes-PKmHLh3T.js","/assets/ShiftDaily-D8tlE1Vd.js","/assets/Staff-BaskRrbF.js","/assets/StaffListAtCheck-CQI7q6bX.js","/assets/StatusBadge-BEovXHPg.js","/assets/StatusBandsModal-bMGLfKQd.js","/assets/TargetGoal-CSp3bkMq.js","/assets/Targets-CGisRyGd.js","/assets/Tasks-CMBz2jKJ.js","/assets/TimeWheelPicker-BhzPo4UY.js","/assets/Toast-D0QgXUrW.js","/assets/Tooltip-CTC8H8c6.js","/assets/TrendChart-C3oD1SEm.js","/assets/TripleSpeedometer-Dfk39qL9.js","/assets/Trudoyomkost-DGLFcL2x.js","/assets/UploadDropzone-BdT75Ayd.js","/assets/UsersActivity-DWtQE4Zm.js","/assets/VerdictBlock-BIOl-0GB.js","/assets/VfxApiMap-CB2WRlnV.js","/assets/VfxDictionaries-KY4w8UYC.js","/assets/VfxEmployees-Cm_SINJF.js","/assets/VfxHrMoves-Cu1Be0V4.js","/assets/VfxJobs-D3bHnKgo.js","/assets/VfxPhoto-DE6syp_i.js","/assets/VfxShifts-CftudiEC.js","/assets/VfxState-6DcZtv5C.js","/assets/VfxTimebooks-WJqhvxYU.js","/assets/VfxTimesheet-BmR-KCGp.js","/assets/WatchProgress-CRnFIzNh.js","/assets/WebLogin-D5ajyRnO.js","/assets/Workers-BZdLjBtM.js","/assets/Zagruzka-BYqpCAvw.js","/assets/ZagruzkaCell-BlIZC3Q8.js","/assets/api-BUdXQ0Z6.js","/assets/archive-DwQcCbWh.js","/assets/archive-restore-DsS-KIkm.js","/assets/arrow-down-DrdyySCu.js","/assets/arrow-down-right-EMia60NM.js","/assets/arrow-down-wide-narrow-Csg4cHV7.js","/assets/arrow-up-narrow-wide-C96ryHGu.js","/assets/ban-C6nm9HJ9.js","/assets/boxes-GagIKGhx.js","/assets/braces-BopbJUMk.js","/assets/brigadirFilters-B4P3qcFy.js","/assets/broadcastTree-Cw5SJxzG.js","/assets/building-2-B29h7qtM.js","/assets/calendar-C2DTeecL.js","/assets/calendar-days-BVVzI0Ov.js","/assets/camera-joHcJ2pR.js","/assets/categories-B9PARRBd.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CXFzbRsG.js","/assets/chart-line-BifghRLA.js","/assets/chart-pie-DaC5i5HI.js","/assets/chartRange-CoTX5kZp.js","/assets/check-check-CuzW9bMK.js","/assets/chevron-left-5lJy5Rcl.js","/assets/chevrons-up-down-BGhf1PBW.js","/assets/circle-DHk-7_TA.js","/assets/circle-alert-B069KT9_.js","/assets/circle-check-big-DAtLEuzR.js","/assets/circle-dashed-BVVDnAFP.js","/assets/circle-minus-DRTSvbXA.js","/assets/circle-question-mark-BuNyIH6R.js","/assets/circle-slash-B9Q1vDAE.js","/assets/circle-user-round-iyMnJvfP.js","/assets/cloud-off-Cep-dWPh.js","/assets/cloud-upload-C0ea7FJq.js","/assets/compass-Ci0WU8AU.js","/assets/concernCategories-DyMidMWS.js","/assets/corner-down-right-BOGzIz-X.js","/assets/createLucideIcon-CS7P3GDw.js","/assets/es-Zu0YWd_B.js","/assets/external-link-BV7dwkX5.js","/assets/file-clock-Civ-R-5J.js","/assets/file-exclamation-point-BzBVMbmL.js","/assets/flag-CPPv-xvv.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-lJb6bdti.js","/assets/funnel-rB8wb_EZ.js","/assets/hash-BlDNOCDe.js","/assets/hourglass-cacZjMsO.js","/assets/image-CGawljHI.js","/assets/image-off-Cb93sLab.js","/assets/inbox-CcwDKAiu.js","/assets/index-C4L4dA6_.js","/assets/index-DLT_vDJq.css","/assets/keyboard-DuNpXTpu.js","/assets/languages-DifqHBxL.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B3f5Onrg.js","/assets/lightbulb-Cryb9Ipz.js","/assets/link-2-9lyMiTqc.js","/assets/link-2-off-C2ikZB7p.js","/assets/list-ordered-6SNWMySf.js","/assets/list-tree-C53uZ1RP.js","/assets/lock-open-Dq84vPOs.js","/assets/log-in-CMQsrkQ3.js","/assets/marks-DdDJ0Gqd.js","/assets/minimize-2-DWO-vcb-.js","/assets/package-check-DIqFhS4H.js","/assets/pencil-DfmrZeb4.js","/assets/percent-ZEnmFH5h.js","/assets/pin-Dj5Q5SA-.js","/assets/pin-off-DcFG6YiH.js","/assets/play-CcZlhqG_.js","/assets/plug-zap-C6xqhLLs.js","/assets/prop-types-D0foEn-P.js","/assets/radio-Ca0WW6mf.js","/assets/react-apexcharts.esm-BkKWfHoB.js","/assets/registers-BQwDBjF8.js","/assets/repeat-lwGOs3Hi.js","/assets/save-BOUV6Xhu.js","/assets/scopeLinks-DQQWAucs.js","/assets/scroll-text-DtVpyhgU.js","/assets/search-x-DX9WGN_3.js","/assets/segments-Bl1w1zXR.js","/assets/send-Cu2Qysww.js","/assets/settings-2-CPrIAMq0.js","/assets/shield-PHx5v7zB.js","/assets/shield-alert-DvflAyyc.js","/assets/shield-question-mark-BrNK1vAL.js","/assets/sigma-CKX1y_sH.js","/assets/siren-CF0Qgx_Q.js","/assets/snowflake-aGw7KbWl.js","/assets/split-l2NouiME.js","/assets/square-check-big-ynBIIl0L.js","/assets/star-Dw6RY1bN.js","/assets/statusBands-WN-4lyE3.js","/assets/store-DViv72Gc.js","/assets/table-2-D6w2UZ2r.js","/assets/table-properties-DJxOVwyl.js","/assets/tag-C9Gut51W.js","/assets/timer-off-DETWPWMV.js","/assets/trending-down-BXIF_P4T.js","/assets/trending-up-D_VbLCoF.js","/assets/undo-2-Bz4ddAYx.js","/assets/useChartTheme-BL3gGMOh.js","/assets/useElementWidth-BkFvUM0-.js","/assets/useIsMobile-W7bO5Z2d.js","/assets/useOpenParam-DPWHgtj0.js","/assets/useStatusBands-B_56pqp4.js","/assets/useUrlScope-C04ez7xQ.js","/assets/user-DsSkJoYP.js","/assets/user-cog-DNaLDPgL.js","/assets/user-minus-Bk1EBrMN.js","/assets/users-Dc-j2HJ0.js","/assets/vfx-Cdv6GsLI.js","/assets/video-DCTF7ix5.js","/assets/wallet-BGETE1ig.js","/assets/warehouse-CgWgBlHb.js","/assets/workflow-DtKTrARm.js","/assets/x-CBAlrCuX.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
