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

const BUILD = "2026-09-25T04:55:06.973Z";
const PRECACHE = ["/","/assets/AdminPanel-BT-nIYcw.js","/assets/AnalysisBoard-BAuqeplZ.js","/assets/Arc-ByiO4cP4.js","/assets/ArcAnalysis-BcIbkGnm.js","/assets/ArcLegacy-BbwgYnQ2.js","/assets/AttendanceModal-DWuzwb5Q.js","/assets/BrigadirProfile-cejScbZQ.js","/assets/BroadcastReceivers-D3NvOcIg.js","/assets/BroadcastRecord-D1d2DAxq.js","/assets/CatLockNotice-Br2E5qJg.js","/assets/CategoryLegendModal-B-StMNX8.js","/assets/CellConcerns-BblMcW40.js","/assets/CellDetails-C0WysTaC.js","/assets/CellFormModal-DC0eI0Hv.js","/assets/CellLink-BIkmBTg_.js","/assets/Cells-BZz6CXT5.js","/assets/ColumnFilter-vTlk3NMF.js","/assets/ColumnsPicker-BwGTgvJd.js","/assets/CommentsModal-JMXkp7qh.js","/assets/ComparisonTable-B-vJNcME.js","/assets/Concerns-BkH2ctjr.js","/assets/ConfirmDialog-BfQDzt08.js","/assets/Daily-fGdbe-4R.js","/assets/DataTable-BYZIFDYi.js","/assets/DateRangePicker-DEI4JI52.js","/assets/DayReportView-FGXja4j2.js","/assets/DayStepper-CqnQeQn8.js","/assets/DifferenceBreakdown-BCDQyxXe.js","/assets/Downtime-D7vXRFRi.js","/assets/Education-B0uTfGZs.js","/assets/EducationLesson-D3cPj6wL.js","/assets/EmptyState-CjjRBlJd.js","/assets/Exam-C7vjvrt2.js","/assets/FactorySelect-CcMQrcQA.js","/assets/Gamification-DwQHKeo0.js","/assets/GroupBadge-9r_uHux5.js","/assets/HeatmapChart-DUDzznQT.js","/assets/IdleCell-GwWkTm1O.js","/assets/KPICard-BmWF9ibl.js","/assets/Kaizen-By1gCeh1.js","/assets/KpiDeltaCard-DUAbz9Ne.js","/assets/LangTextInput-CfVusU76.js","/assets/Layout-DW1ZJ9Yo.js","/assets/LeaderDayReport-CxNX5adW.js","/assets/LeaderUnitReport-D_WcKVQs.js","/assets/Leaderboard-BW3Q1um-.js","/assets/Leaders-BpQpbDKJ.js","/assets/LiveOverview-BTBRaFpM.js","/assets/Login-bKVwmr4G.js","/assets/NotFound-tpAza124.js","/assets/Overview-BcgtT4ZP.js","/assets/Pagination-U00IQqCr.js","/assets/PerenaladkaFactTable-d0tzRkEU.js","/assets/PlanFulfillment-CyRvgyeQ.js","/assets/Production-CrUPdVaA.js","/assets/Profile-B4zYmONw.js","/assets/ProofCamera-gTnXjFgi.js","/assets/Quality-Dkns8x1A.js","/assets/RequestStateChip-DXn6tUVt.js","/assets/RichTextEditor-B27kcLIc.js","/assets/SearchInput-CWXPFEK_.js","/assets/SeasonalityHeatmap-DDwm3q9Q.js","/assets/SegmentedToggle-BeFyOqM7.js","/assets/SetupTimes-Cm-2614b.js","/assets/ShiftDaily-C-DDmCzX.js","/assets/Staff-Bqi2WjgD.js","/assets/StatusBadge-yCb4XgEk.js","/assets/Targets-CGQOLCZH.js","/assets/Tasks-B01CPEpZ.js","/assets/TimeWheelPicker-rhGnwWvP.js","/assets/Tooltip-BjeLKo7q.js","/assets/TrendChart-Cn3EbcU0.js","/assets/TripleSpeedometer-Cl-OdWck.js","/assets/Trudoyomkost-CYiEF8K_.js","/assets/UsersActivity-BRwhC4m7.js","/assets/WatchProgress-3yaA9hRV.js","/assets/WebLogin-CmaK-YLj.js","/assets/WorkerConcerns-Da5_MELf.js","/assets/Workers-BJ217R07.js","/assets/Zagruzka-BWsW0geK.js","/assets/ZagruzkaCell-CqGeJp0C.js","/assets/alarm-clock-BI3zgKLy.js","/assets/api-s1_y8W34.js","/assets/archive-fpIXEJM4.js","/assets/archive-restore-vcEv4mPA.js","/assets/arrow-down-gi7RLRfk.js","/assets/arrow-left-CIIq0D04.js","/assets/arrow-left-right-B0dGc9W-.js","/assets/arrow-up-DXAbxpkV.js","/assets/arrow-up-right-9EHBxcNg.js","/assets/award-CPB-BgGf.js","/assets/ban-CQ9Z6ppq.js","/assets/bot-Cj4X6Lhd.js","/assets/boxes-BRZsTzEv.js","/assets/brigadirFilters-DXsekoBh.js","/assets/broadcastTree-CfBLyXTG.js","/assets/building-2-qcRVPenC.js","/assets/calendar-CRcg7eXl.js","/assets/calendar-clock-B-IRZoBc.js","/assets/calendar-days-CVclyPaN.js","/assets/calendar-range-DlfZ4U8P.js","/assets/camera-B5t7GGeX.js","/assets/categories-BCTkiXXr.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-fCffP8iS.js","/assets/chart-line-DmTQLAXp.js","/assets/chart-pie-IbtSje_p.js","/assets/chartRange-DnZjIoxK.js","/assets/check-check-ytBIGtKG.js","/assets/chevron-left-BzaItCZ0.js","/assets/chevrons-up-down-Bb1R1mBx.js","/assets/circle-check-big-Bl9id0Al.js","/assets/circle-dashed-Ct3cGV-q.js","/assets/circle-dot-BHoHF25A.js","/assets/circle-minus-DFGJOOMk.js","/assets/circle-slash-DVm1POPi.js","/assets/circle-user-round-DC6Dpo4P.js","/assets/coins-JOYIOGZ3.js","/assets/compass-CIrfdy_2.js","/assets/concernCategories-Bj-WfPse.js","/assets/copy-DyGABJgp.js","/assets/corner-down-right-DcGZQMic.js","/assets/createLucideIcon-9IIHOpwT.js","/assets/exportXlsx-CmBK6rWr.js","/assets/external-link-DdEZ4ell.js","/assets/file-clock-B-z2RyAe.js","/assets/file-spreadsheet-zv6K3Xbi.js","/assets/file-text-O7Uid5nG.js","/assets/flag-BDPEzHtM.js","/assets/flame-C4St5a7t.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DGpf8Sbi.js","/assets/hash-tRImJitF.js","/assets/history-kGjveZzt.js","/assets/hourglass-om2s8MbT.js","/assets/image-D94jFp8K.js","/assets/image-off-54PYFJmy.js","/assets/index-BMCZProW.css","/assets/index-BVH88FcI.js","/assets/keyboard-CiKUyZd4.js","/assets/languages-ByEO_OFm.js","/assets/layers-D-fVIA4a.js","/assets/leaderReason-BOkqo01e.js","/assets/lightbulb-CkOztDNH.js","/assets/link-2-D621Urp0.js","/assets/list-checks-DdIL5GAr.js","/assets/list-ordered-DZf9w3oU.js","/assets/lock-open-DdGDTIEJ.js","/assets/log-in-Brdl9yWN.js","/assets/message-square-BPt6iEPY.js","/assets/minimize-2-BYxkuyOr.js","/assets/paperclip-BoBcgd2j.js","/assets/pencil-CxuhEIoy.js","/assets/personName-B4KId4zS.js","/assets/pin-C8_XkpA9.js","/assets/play-BkJsQj3z.js","/assets/presentation-zsEq-KiR.js","/assets/prop-types-DR58Z2x_.js","/assets/radio-jNumbvgy.js","/assets/react-apexcharts.esm-vKptNIIe.js","/assets/repeat-B_TWr3zo.js","/assets/rotate-ccw-BaL3NXfX.js","/assets/rotate-cw-CcnUuLBJ.js","/assets/save-CcVAV693.js","/assets/scale-MdzvSn1a.js","/assets/scroll-text-CeOxcZtn.js","/assets/search-x-DzGfAZm1.js","/assets/segments-BbWBy5vc.js","/assets/send-VHgLp646.js","/assets/settings-2-Boy3SMyI.js","/assets/shield-CQFpDMq8.js","/assets/shield-alert-KuI0Nfdo.js","/assets/shield-check--5L2BjxG.js","/assets/shield-question-mark-Bou00q5S.js","/assets/siren-BjZoLshl.js","/assets/smartphone-DjQQtl_c.js","/assets/snowflake-DMj6lPYs.js","/assets/square-CKzoz2IR.js","/assets/square-check-big-j05ME6fa.js","/assets/star-BoIH4iIb.js","/assets/statusBands-BRefFnCi.js","/assets/table-2-DsbJjj6o.js","/assets/tag-BYQIGweN.js","/assets/trending-down-BUUbpglK.js","/assets/trending-up-hOl8af_n.js","/assets/triangle-alert-Dn90oDuu.js","/assets/undo-2-BVzeLei0.js","/assets/useChartTheme-BTVMKmNU.js","/assets/useElementWidth-BJmVCZ4j.js","/assets/useIsMobile-Bpd05h5x.js","/assets/useMutation-BdabHTB4.js","/assets/useStatusBands-B4cN7vej.js","/assets/user-check-Cb21edd0.js","/assets/user-cog-CwW5ArlK.js","/assets/user-kS7Up9js.js","/assets/user-minus-BDIBcmVU.js","/assets/users-Dp_9LSdF.js","/assets/verifyState-BXQBLOCT.js","/assets/video-DWf1OGuK.js","/assets/warehouse-DVqXEjAg.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
