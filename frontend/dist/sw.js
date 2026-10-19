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

const BUILD = "2026-10-19T11:26:05.330Z";
const PRECACHE = ["/","/assets/AdminPanel-CJToeDvO.js","/assets/AnalysisBoard-DmpsWBBd.js","/assets/Arc-BNC7UU0F.js","/assets/Assistant-C8QibVWj.js","/assets/BrigadirProfile-CF8YB0K_.js","/assets/BroadcastReceivers-B5naJVLL.js","/assets/BroadcastRecord-CW74-P-b.js","/assets/Button-DP_1HWko.js","/assets/CatLockNotice-y3wzX0i8.js","/assets/CategoryLegendModal-D5mMIGZt.js","/assets/CellConcerns-CXyWbr7b.js","/assets/CellDetails-B5rMqOQP.js","/assets/CellFormModal-bdY4vRG1.js","/assets/CellIdent-BhGPORAH.js","/assets/CellLink-CRemsLrh.js","/assets/Cells-CdzgsgeI.js","/assets/ColumnFilter-Bw2m-2f6.js","/assets/ColumnsPicker-D7QvH8we.js","/assets/CommentsModal-Bm28C8L6.js","/assets/ComparisonTable-DgSEba-l.js","/assets/Concerns-ILeoLRAm.js","/assets/CountStepper-B4Rd8TLQ.js","/assets/Daily-BaiqIQCl.js","/assets/DataTable-C6ZylFpC.js","/assets/DateRangePicker-Dzvy_u9j.js","/assets/DayReportView-DPLReYjq.js","/assets/DayStepper-_LJmphc1.js","/assets/DifferenceBreakdown-B12AWJIl.js","/assets/Downtime-CzlGlNvu.js","/assets/Education-DCB1v0zF.js","/assets/EducationLesson-DDppVLbK.js","/assets/EmptyState-DkDPmZad.js","/assets/Exam-DE_R_cyL.js","/assets/FactorySelect-Bmqdd3wj.js","/assets/Gamification-D1Ior7nE.js","/assets/GroupBadge-Dxl175hA.js","/assets/HeatmapChart-DQ4GCkip.js","/assets/IdleCell-D7g7b3-i.js","/assets/KPICard-C5Oc8hxZ.js","/assets/Kaizen-B035E2QH.js","/assets/Kelish-CooWeGWV.js","/assets/KpiDeltaCard-BpWBjkhj.js","/assets/LangTextInput-DEgCV7VK.js","/assets/Layout-ChIKptVQ.js","/assets/LeaderAppeal-B1GYI6sH.js","/assets/LeaderDayReport-DFjxfm1R.js","/assets/LeaderUnitReport-B4A7Wwdn.js","/assets/Leaderboard-CpvDcPHo.js","/assets/Leaders-BBD1B5fj.js","/assets/LeadersKpi-D718nLJ6.js","/assets/Lightbox-B1wyRfOT.js","/assets/LiveOverview-CE2ntCj5.js","/assets/Login-DknMp48a.js","/assets/NotFound-DIY2QvxT.js","/assets/Notifications-CECZ9Nud.js","/assets/Overview-BOFfZXQO.js","/assets/Pagination-40inQ3Y3.js","/assets/PerenaladkaFactTable-_EVrOGx-.js","/assets/PersonCard-DXix_Ipn.js","/assets/PlanFulfillment-BUs9p3tJ.js","/assets/Production-CrXydCsC.js","/assets/Profile-Q8V-HyAN.js","/assets/ProofCamera-DiIUltP9.js","/assets/ProofPhoto-DiL376Dz.js","/assets/Quality-CdgaXIZf.js","/assets/RawRows-BTdNy9TU.js","/assets/RequestStateChip-EfVNA5FW.js","/assets/RichTextEditor-aDvFfvg-.js","/assets/SaveState-DRT9QRKA.js","/assets/SearchInput-xgHYzNYE.js","/assets/SeasonalityHeatmap-CWmsgnYn.js","/assets/SegmentedToggle-BBMZ6GNu.js","/assets/SetupTimes-CrjvhF2R.js","/assets/ShiftDaily-D2zgHt3u.js","/assets/Staff-T4M4Z6Gw.js","/assets/StaffListAtCheck-CdxQzWLV.js","/assets/StatusBadge-Do5J8nNu.js","/assets/TargetGoal-0jRjZbfv.js","/assets/Targets-sPnotbgk.js","/assets/Tasks-dj8nUlBA.js","/assets/TimeWheelPicker-BT93SW6F.js","/assets/Toast-DwtUFvKw.js","/assets/Tooltip-Bqa8FZOP.js","/assets/TrendChart-iAP8jmoV.js","/assets/TripleSpeedometer-lXwjtSje.js","/assets/Trudoyomkost-9PtY4PQq.js","/assets/UploadDropzone-C-SJL8YW.js","/assets/UsersActivity-BfHwqw3M.js","/assets/VerdictBlock-BL0AjmMl.js","/assets/VfxApiMap-CnAtiuxT.js","/assets/VfxDictionaries-sdhMsTWt.js","/assets/VfxEmployees-CS7JvbEv.js","/assets/VfxHrMoves-DUaghIY7.js","/assets/VfxJobs-BrNmIbkC.js","/assets/VfxPhoto-YmzcFi1d.js","/assets/VfxShifts-CWsYGxrC.js","/assets/VfxState-CMhd-X5M.js","/assets/VfxTimebooks-ODuiKA0z.js","/assets/VfxTimesheet-Cyn3dUE0.js","/assets/WatchProgress-CNndWxjW.js","/assets/WebLogin-CPm1vk6L.js","/assets/Workers-BwjH03L0.js","/assets/Zagruzka-DKd3RWls.js","/assets/ZagruzkaCell-DAQB-K6N.js","/assets/api--0NZuVic.js","/assets/archive-ILynAo1s.js","/assets/archive-restore-DfeuEDHp.js","/assets/arrow-down-D8A4mJBW.js","/assets/arrow-down-right-D-eQPcUf.js","/assets/arrow-down-wide-narrow-D1VJOkjC.js","/assets/arrow-up-narrow-wide-004jbMYk.js","/assets/ban-DbIXx_gu.js","/assets/boxes-CY3_DgNI.js","/assets/braces-DqeWSoQR.js","/assets/brigadirFilters-7pIrJpbK.js","/assets/broadcastTree-BYpKUuPT.js","/assets/building-2-CP2iWTD9.js","/assets/calculator-DHrOic8y.js","/assets/calendar-BRjRYZyM.js","/assets/calendar-days-DnxTZJcf.js","/assets/camera-CFHQLaiO.js","/assets/categories-DxSKTANc.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CjQsbmFN.js","/assets/chart-line-Coeg1dkt.js","/assets/chart-pie-LjlcLOTa.js","/assets/chartRange-B51CrM-C.js","/assets/check-check-DhxrXxdM.js","/assets/chevron-left-DwaT_F_b.js","/assets/chevrons-up-down-BQ9tg7sc.js","/assets/circle-DiRYzns7.js","/assets/circle-alert-DmX0bYek.js","/assets/circle-check-big-r4ydiYWU.js","/assets/circle-dashed-KytEFCOE.js","/assets/circle-minus-KTZXEK56.js","/assets/circle-question-mark-wb2Xef6S.js","/assets/circle-slash-C9n77snF.js","/assets/circle-user-round-DBIJphwu.js","/assets/cloud-off-CnAJoGAG.js","/assets/cloud-upload-CyU8nQu1.js","/assets/compass-C93Vq-Nz.js","/assets/concernCategories-aVGDdFc_.js","/assets/corner-down-right-WYtIFe1T.js","/assets/createLucideIcon-Bh0KmXqC.js","/assets/es-COOoL9Tv.js","/assets/external-link-C2PTAYc2.js","/assets/file-clock-CwdrA88g.js","/assets/file-exclamation-point-BL4B0rcB.js","/assets/flag-B2VESysZ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CFNNW0Ai.js","/assets/hash-_v5nhNJG.js","/assets/hourglass-D2VssupT.js","/assets/image-C9RIsAJ8.js","/assets/image-off-DnbW_EhX.js","/assets/inbox-C5Y1sd9k.js","/assets/index-BwTfOVXN.js","/assets/index-DemTQruw.css","/assets/keyboard-CZq6gQQd.js","/assets/languages-Cp_kLK6P.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CP_OS0EJ.js","/assets/lightbulb-ddAfVMRp.js","/assets/link-2-ibmdxHU2.js","/assets/link-2-off-DTGGSHg4.js","/assets/list-ordered-B6R812w5.js","/assets/list-tree-JytexML4.js","/assets/lock-open-DIhQgfVp.js","/assets/log-in-Bqmv0Ef3.js","/assets/marks-PJg7nF5X.js","/assets/minimize-2-D2Zph02k.js","/assets/package-check-ixEsjs3E.js","/assets/pencil-BFBK4zi-.js","/assets/percent-DjU6BDGU.js","/assets/pin-BNlXiQSG.js","/assets/pin-off-pGm0Hs7o.js","/assets/play-C-aRrfGu.js","/assets/plug-zap-DMlNqAMI.js","/assets/prop-types-DEXgvrkE.js","/assets/radio-DgD79ZUI.js","/assets/react-apexcharts.esm-6M9ySSZ-.js","/assets/registers-Bx-I4yX_.js","/assets/repeat-CfQUroyB.js","/assets/save-2HaYOg4o.js","/assets/scopeLinks-Cxb1WbDj.js","/assets/scroll-text-DeGaz7j1.js","/assets/search-x-Ds1Q3lXL.js","/assets/segments-CoIpoMKA.js","/assets/send-DRsp0sPW.js","/assets/settings-2-CpfNsUYq.js","/assets/shield-CPKQ8KcO.js","/assets/shield-alert-CAs0r1fT.js","/assets/shield-question-mark-Bs4oR9er.js","/assets/siren-BOEf2t8j.js","/assets/snowflake-BS8u19lf.js","/assets/split-BXKCzjil.js","/assets/square-check-big-o_sJYPvq.js","/assets/star-DoftTmYU.js","/assets/statusBands-7SlWjP8K.js","/assets/store-OEV6R5hB.js","/assets/table-2-BDO761gz.js","/assets/table-properties-CeUJ-Wyi.js","/assets/tag-DwQVceO6.js","/assets/timer-off-h3dJU4yM.js","/assets/trending-down-DxhL3y5B.js","/assets/trending-up-ZhsXc_wi.js","/assets/undo-2-BU-S8_JT.js","/assets/useChartTheme-UObfj_FH.js","/assets/useElementWidth-BWa7M0s9.js","/assets/useIsMobile-C5BmTLuq.js","/assets/useOpenParam-SJKRX-Ef.js","/assets/useStatusBands-By5xg-g7.js","/assets/useUrlScope-CjLe9JAZ.js","/assets/user-C6fNv6A4.js","/assets/user-cog-KJZw-6Fy.js","/assets/user-minus-C8kBvNFf.js","/assets/users-DiQduC5E.js","/assets/vfx-DJJFYNXu.js","/assets/video-CTxfBf4K.js","/assets/wallet-C4YvXlNd.js","/assets/warehouse-DcRyE7ln.js","/assets/workflow-D1s_Eqa6.js","/assets/x-BYs12zn0.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
