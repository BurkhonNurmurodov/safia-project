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

const BUILD = "2026-09-25T11:21:41.418Z";
const PRECACHE = ["/","/assets/AdminPanel-CvAn_eXL.js","/assets/AnalysisBoard-ChbEuAig.js","/assets/Arc-B2EedJKM.js","/assets/ArcAnalysis-BZLZQn8_.js","/assets/ArcLegacy-CucBqs-f.js","/assets/AttendanceModal-D-uNJ1Vu.js","/assets/BrigadirProfile-C4adwuZQ.js","/assets/BroadcastReceivers-BkcC3jBi.js","/assets/BroadcastRecord-B2ROBhM-.js","/assets/CatLockNotice-BxbIXioA.js","/assets/CategoryLegendModal-D5BynJoT.js","/assets/CellConcerns-4fWkL_aa.js","/assets/CellDetails-Cd3jKfmt.js","/assets/CellFormModal-BYq2QjDZ.js","/assets/CellLink-CSlj0FkY.js","/assets/Cells-DJDK5eSN.js","/assets/ColumnFilter-DQ-ZiM0d.js","/assets/ColumnsPicker-_9ISAWbj.js","/assets/CommentsModal-TNL8fTQK.js","/assets/ComparisonTable-jbYiR-r1.js","/assets/Concerns-SviOdJhV.js","/assets/ConfirmDialog-xWOa8QjO.js","/assets/Daily-yP46K3R1.js","/assets/DataTable-DvnG4F4j.js","/assets/DateRangePicker-DU8ZclPB.js","/assets/DayReportView-D1T56qqP.js","/assets/DayStepper-DTrkLBol.js","/assets/DifferenceBreakdown-XRhoYsj4.js","/assets/Downtime-DpGVydwY.js","/assets/Education-CyXCYSX0.js","/assets/EducationLesson-CNjcebVd.js","/assets/EmptyState-BLghdquz.js","/assets/Exam-SkkfYFS9.js","/assets/FactorySelect-1I7zhCzn.js","/assets/Gamification-DeylLUHE.js","/assets/GroupBadge-WfUWyq5s.js","/assets/HeatmapChart-DLSA-vFJ.js","/assets/IdleCell-C2ps-zCj.js","/assets/KPICard-BRDahx3-.js","/assets/Kaizen-D8XJO5Uu.js","/assets/KpiDeltaCard-DZgT8nfT.js","/assets/LangTextInput-CZBGO5NG.js","/assets/Layout-C_j6nsVI.js","/assets/LeaderDayReport-DgGNSr9j.js","/assets/LeaderUnitReport-CmJehmU8.js","/assets/Leaderboard-BHoeRXhK.js","/assets/Leaders-QRFc1Ye2.js","/assets/LiveOverview-Dw2Kx7QB.js","/assets/Login-DOVVLVrw.js","/assets/NotFound-CwqwF7Uy.js","/assets/Overview-DE0LLRPM.js","/assets/Pagination-CXImtwI6.js","/assets/PerenaladkaFactTable-BsrthnUZ.js","/assets/PlanFulfillment-BQePOmvQ.js","/assets/Production-CgJyw5zW.js","/assets/Profile-B2IvY10b.js","/assets/ProofCamera-CjhmElub.js","/assets/Quality-D76b7KuB.js","/assets/RequestStateChip-xzAGMKkj.js","/assets/RichTextEditor-ul-NeHe-.js","/assets/SearchInput-BDgL8Ku7.js","/assets/SeasonalityHeatmap-CDnH46Yp.js","/assets/SegmentedToggle-ClTge16E.js","/assets/SetupTimes-CVHdkkAF.js","/assets/ShiftDaily-D8DxQryd.js","/assets/Staff-DA6D7HWa.js","/assets/StatusBadge-D9MbK7Xq.js","/assets/Targets-ew10LJXr.js","/assets/Tasks-BMvdMwFD.js","/assets/TimeWheelPicker-BB3iugUx.js","/assets/Tooltip-CUEeVJFq.js","/assets/TrendChart-PoxJvyEp.js","/assets/TripleSpeedometer-HGukTLBo.js","/assets/Trudoyomkost-DAUAqaLm.js","/assets/UsersActivity-PFFpAmMe.js","/assets/WatchProgress-pMW5JZBh.js","/assets/WebLogin-DlegRSEg.js","/assets/WorkerConcerns-BMV9FG9F.js","/assets/Workers-wn2GbvsF.js","/assets/Zagruzka-kVBtisFk.js","/assets/ZagruzkaCell-CvucFqSm.js","/assets/alarm-clock-DRStSiYy.js","/assets/api-C5-C9_v_.js","/assets/archive-Dt8N-WuN.js","/assets/archive-restore-CTYLaRhe.js","/assets/arrow-down-BrI_hEhy.js","/assets/arrow-left-Ba4HvEI4.js","/assets/arrow-left-right-B4tBTbLs.js","/assets/arrow-up-CB_TQaqR.js","/assets/arrow-up-right-CCakQxIA.js","/assets/award-Co0ekhvk.js","/assets/ban-D63xzLw7.js","/assets/bot-DmVaNWF8.js","/assets/boxes-CGgMhZS7.js","/assets/brigadirFilters-8Alm03zi.js","/assets/broadcastTree-DDxc4pAC.js","/assets/building-2-C_IIDS6U.js","/assets/calendar-CcLpXpQx.js","/assets/calendar-clock-DvpYjpfj.js","/assets/calendar-days-CRLp3bFU.js","/assets/calendar-range-rS5qqWxQ.js","/assets/camera-DIovmfny.js","/assets/categories-BwDDV-Dj.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CVVY8djC.js","/assets/chart-line-t11N2IEi.js","/assets/chart-pie-kH6Eic-N.js","/assets/chartRange-i0sdFxHf.js","/assets/check-check-CBl_8EWI.js","/assets/chevron-left-8ZvjxsWh.js","/assets/chevrons-up-down-hYfiEf6F.js","/assets/circle-check-big-C1qfALWX.js","/assets/circle-dashed-_8BZ-EwQ.js","/assets/circle-dot-BfjOc-yR.js","/assets/circle-minus-C_oin2WJ.js","/assets/circle-slash-DhN42YoZ.js","/assets/circle-user-round-RwlJor52.js","/assets/coins-DXjhpJD1.js","/assets/compass-Bp4APEN3.js","/assets/concernCategories-BPvhsNdR.js","/assets/copy-DeaOPhAg.js","/assets/corner-down-right-QA-AxwyJ.js","/assets/createLucideIcon-CaEhCJ-t.js","/assets/exportXlsx-i4lbOiBJ.js","/assets/external-link-BMOe_Q6g.js","/assets/file-clock-Dh7El8si.js","/assets/file-spreadsheet-BIOeMQwI.js","/assets/file-text-DyW3GnPL.js","/assets/flag-ByyG_CSZ.js","/assets/flame-DIu6J6SK.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-B0c--tzd.js","/assets/hash-CXtByZzC.js","/assets/history-BAp_L_C-.js","/assets/hourglass-B1Tmr9SR.js","/assets/image-XBZ45eNT.js","/assets/image-off-Mt4d3kkn.js","/assets/index-BMCZProW.css","/assets/index-DrSbZqkK.js","/assets/keyboard-BHsEIAsx.js","/assets/languages-ClhN9rOd.js","/assets/layers-Dg9oDA2i.js","/assets/leaderReason-B_nXyvl6.js","/assets/lightbulb-zAyecwr4.js","/assets/link-2-O7uaPYuW.js","/assets/list-checks-Ipc8I_MD.js","/assets/list-ordered-Dlnigi5N.js","/assets/lock-open-DeBJ-r2V.js","/assets/log-in-UVp34ymk.js","/assets/message-square-CX0POJdU.js","/assets/minimize-2-BJK5BbDu.js","/assets/paperclip-WLe7dajG.js","/assets/pencil-Bhe6AKHg.js","/assets/personName-B4KId4zS.js","/assets/pin-3V6VsDps.js","/assets/play-ppiBalmy.js","/assets/presentation-5b9wtMiz.js","/assets/prop-types-CcNLE7Ij.js","/assets/radio-DF25PzPr.js","/assets/react-apexcharts.esm-D2gafJvd.js","/assets/repeat-C_CeUzl3.js","/assets/rotate-ccw-DVsBRP4c.js","/assets/rotate-cw-DrmLMbG9.js","/assets/save-ZrrVBXe5.js","/assets/scale-BUj8eAPe.js","/assets/scroll-text-8A66nRjS.js","/assets/search-x-oGcRFNQz.js","/assets/segments-C2ecEi-8.js","/assets/send-B3wWfPFT.js","/assets/settings-2-ChvANKVr.js","/assets/shield-BAqxV1vs.js","/assets/shield-alert-CWUNEur1.js","/assets/shield-check-CwpQamFn.js","/assets/shield-question-mark-PC__p5MD.js","/assets/siren-mrVTeXum.js","/assets/smartphone-C2AyqoBU.js","/assets/snowflake-CX0zpjWv.js","/assets/square-DUAK-qzl.js","/assets/square-check-big-CaNpHKQF.js","/assets/star-DYtlPigL.js","/assets/statusBands-DZtx3Y_a.js","/assets/table-2-CItyIlGh.js","/assets/tag-BpMrkiCT.js","/assets/trending-down-Dl4ALOvN.js","/assets/trending-up-CtNY5o4G.js","/assets/triangle-alert-BB4Y5L2_.js","/assets/undo-2-DW0WzTgp.js","/assets/useChartTheme-BNtI49d6.js","/assets/useElementWidth-Bu2y8eop.js","/assets/useIsMobile-Cn2N7H7T.js","/assets/useMutation-Bie9kuVh.js","/assets/useStatusBands-VC8EjUfk.js","/assets/user-CK2kymZq.js","/assets/user-check-C8gJIW0_.js","/assets/user-cog-DP3pNElL.js","/assets/user-minus-jqY2wPbl.js","/assets/users-BeJY57JL.js","/assets/verifyState-Bpz8znyu.js","/assets/video-pQSR8fSa.js","/assets/warehouse-B_QVj3GK.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
