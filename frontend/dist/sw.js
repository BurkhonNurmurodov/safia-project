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

const BUILD = "2026-09-26T07:04:49.071Z";
const PRECACHE = ["/","/assets/AdminPanel-ykdXLiyS.js","/assets/AnalysisBoard-BLbZ98YG.js","/assets/Arc-BnLbQtKW.js","/assets/ArcLegacy-BxH_uohw.js","/assets/AttendanceModal-DABVZf2q.js","/assets/BrigadirProfile-DvJ8zZwg.js","/assets/BroadcastReceivers-HgVvz1c2.js","/assets/BroadcastRecord-ClFCrGsP.js","/assets/CatLockNotice-CIlN0fOq.js","/assets/CategoryLegendModal-CMs8982s.js","/assets/CellConcerns-DKZXGV13.js","/assets/CellDetails-Bdvc9-OV.js","/assets/CellFormModal-6mr3Zpt3.js","/assets/CellLink-Cg15XnKw.js","/assets/Cells-BGZO36MR.js","/assets/ColumnFilter-Bd5S1MTj.js","/assets/ColumnsPicker-B2InWo8Z.js","/assets/CommentsModal-BMtmI_vR.js","/assets/ComparisonTable-L43bGGSM.js","/assets/Concerns-Cp3yl-ct.js","/assets/ConfirmDialog-BCxA3a5q.js","/assets/Daily-BYP8sSuU.js","/assets/DataTable-DM1_qLkA.js","/assets/DateRangePicker-34Rj6vNE.js","/assets/DayReportView-DjplecxA.js","/assets/DayStepper-DknwpoOe.js","/assets/DifferenceBreakdown-CU_6ZEXD.js","/assets/Downtime-B24FOzyV.js","/assets/Education-C9VKdZ5n.js","/assets/EducationLesson-Cz6YAj4a.js","/assets/EmptyState-D8PTL3m8.js","/assets/Exam-n4U_51mw.js","/assets/FactorySelect-DeZlLcep.js","/assets/Gamification-BG5Ya1kY.js","/assets/GroupBadge-C_YP8V6W.js","/assets/HeatmapChart-WIBTDBgP.js","/assets/IdleCell-DFP5R7w-.js","/assets/KPICard-DT_p_av6.js","/assets/Kaizen-BL9ReQK2.js","/assets/KpiDeltaCard-Cu2sPyjK.js","/assets/LangTextInput-Bsz47S8W.js","/assets/Layout-DjrXoI15.js","/assets/LeaderDayReport-XJqDZvrT.js","/assets/LeaderUnitReport-CV1XkXMu.js","/assets/Leaderboard-CEM36jyM.js","/assets/Leaders-oHS1-t5j.js","/assets/LiveOverview-BWW3ZAOL.js","/assets/Login-rM471mU8.js","/assets/NotFound-0CzdreKA.js","/assets/Overview-RSWQ_29a.js","/assets/Pagination-DXMlI0bb.js","/assets/PerenaladkaFactTable-ytDJw1eB.js","/assets/PlanFulfillment-D1wmXpgk.js","/assets/Production-DGcEH3Mk.js","/assets/Profile-h_r9ADD1.js","/assets/ProofCamera-DUPa_cSg.js","/assets/Quality-DFfVo3zL.js","/assets/RequestStateChip-BM_73han.js","/assets/RichTextEditor-DqUOEOKe.js","/assets/SearchInput-C-igzgtT.js","/assets/SeasonalityHeatmap-X79oNswV.js","/assets/SegmentedToggle-aycLSD4I.js","/assets/SetupTimes-a-AJKcAd.js","/assets/ShiftDaily-D_o6UOTM.js","/assets/Staff-CP1gK5Nk.js","/assets/StatusBadge-B2P-Hehu.js","/assets/Targets-DryAjNUx.js","/assets/Tasks-fP4hv0n6.js","/assets/TimeWheelPicker-Bz8U9f7n.js","/assets/Tooltip-BrzoVh3y.js","/assets/TrendChart-DVcY3yS1.js","/assets/TripleSpeedometer-jQoS537g.js","/assets/Trudoyomkost-qcRP7Vn9.js","/assets/UsersActivity-BhhJlsxe.js","/assets/WatchProgress-BFYrDwwx.js","/assets/WebLogin-2eZp7q03.js","/assets/WorkerConcerns-D43EGRAJ.js","/assets/Workers-Ds6fgW0F.js","/assets/Zagruzka-CUmLDPHf.js","/assets/ZagruzkaCell-DpAx_8CV.js","/assets/alarm-clock-BQbOpJ2O.js","/assets/api-BjV-F97a.js","/assets/archive-4LC77Dlj.js","/assets/archive-restore-BswmuWw0.js","/assets/arrow-down-DSecLZoV.js","/assets/arrow-left-4W1HEFNU.js","/assets/arrow-left-right-wF6sLhSm.js","/assets/arrow-up-DB26VXFM.js","/assets/arrow-up-right-DUC-UMLL.js","/assets/award-BUMcPP1m.js","/assets/ban-BghJgYZr.js","/assets/bot-Bv7GW9ED.js","/assets/boxes-JEv0ppJy.js","/assets/brigadirFilters-dr8Y8cgR.js","/assets/broadcastTree-DDD5uugR.js","/assets/building-2-Do8tloRI.js","/assets/calendar-BrRCiedW.js","/assets/calendar-clock-D4OCwLwW.js","/assets/calendar-days-B5dfxKZu.js","/assets/calendar-range-t-DahEt3.js","/assets/camera-CQZBtpBq.js","/assets/categories-BseWrwDL.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BK1svTmD.js","/assets/chart-line-CFmFCW-H.js","/assets/chart-pie-6F6TTncw.js","/assets/chartRange-CC7wWaG5.js","/assets/check-check-CcvmjJ8c.js","/assets/chevron-left-gwJqqDrG.js","/assets/chevrons-up-down-Dq0Al-PH.js","/assets/circle-check-big-Cz0MQU7Z.js","/assets/circle-dashed-Dblc8UkC.js","/assets/circle-dot-B-2JWtY8.js","/assets/circle-minus-COn9eQ7F.js","/assets/circle-slash-LbceK5kA.js","/assets/circle-user-round-BoCzY3kK.js","/assets/coins-CzU8-_E8.js","/assets/compass-DfC3ZN0m.js","/assets/concernCategories-CdgQ_ttT.js","/assets/copy-Dwai6Ltm.js","/assets/corner-down-right-V1x6JN5G.js","/assets/createLucideIcon-Dlb641Fb.js","/assets/exportXlsx-CW15gxpA.js","/assets/external-link-D69CHJwO.js","/assets/file-clock-CpEk6Gxt.js","/assets/file-exclamation-point-lMiomoad.js","/assets/file-spreadsheet-Csl9Ihjw.js","/assets/file-text-ChtQi9RM.js","/assets/flag-n_LArMwU.js","/assets/flame-xPkBi0fD.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CxRt00UA.js","/assets/hash-BZIsGTr5.js","/assets/history-C-PGzq3c.js","/assets/hourglass-BlOvGSEh.js","/assets/image-BLBOEt-b.js","/assets/image-off-DFaWQf5V.js","/assets/index-BTZsppTH.css","/assets/index-BrqOz5DR.js","/assets/key-round-CL_i0aDS.js","/assets/keyboard-FTeD8UW2.js","/assets/languages-asF8iiJK.js","/assets/layers-DSV1uySM.js","/assets/leaderReason-D2M6Pd3T.js","/assets/lightbulb-CkNtIREi.js","/assets/link-2-CFdCdgbx.js","/assets/list-checks-BYxbhHWa.js","/assets/list-ordered-Fl-8DKIo.js","/assets/list-tree-Chap6Mek.js","/assets/lock-open-BWkXEgB4.js","/assets/log-in-Bayr3Vjo.js","/assets/message-square-DsAoVHQt.js","/assets/minimize-2-DldluKa5.js","/assets/package-check-BkFXM39P.js","/assets/paperclip-vbJv7qjE.js","/assets/pencil-BmzX4Z4a.js","/assets/personName-B4KId4zS.js","/assets/pin-BNq4SoZo.js","/assets/play-DYf6a_oj.js","/assets/presentation-Do7GaIRe.js","/assets/prop-types-CYUI7ZNO.js","/assets/radio-BwPv55Tk.js","/assets/react-apexcharts.esm-D_RNmk4M.js","/assets/repeat-Sup2S54m.js","/assets/rotate-ccw-w5FqtFxa.js","/assets/rotate-cw-D6_vssdy.js","/assets/save-RXiqVhUO.js","/assets/scale-jHBM0UfP.js","/assets/scroll-text-BfL-yf9b.js","/assets/search-x-1JkBdbH_.js","/assets/segments-3AbJKnot.js","/assets/send-D9lDo1v-.js","/assets/settings-2-3Fkf2jhj.js","/assets/shield-4c2IMLds.js","/assets/shield-alert-DoKH2vc7.js","/assets/shield-check-Ct2uFKtw.js","/assets/shield-question-mark-BuZCUHeg.js","/assets/siren-Bq4iK2ZN.js","/assets/smartphone-ezs0B7So.js","/assets/snowflake-g1Rqxqko.js","/assets/square-BFruJ6R0.js","/assets/square-check-big-BbenjAQj.js","/assets/star-5S-HAiMR.js","/assets/statusBands-B9FR-Bbf.js","/assets/store-OZngnrcH.js","/assets/table-2-DU4mpHdy.js","/assets/tag-CT9VO7Kl.js","/assets/trending-down-DSm5CdUy.js","/assets/trending-up-vJse1kHi.js","/assets/triangle-alert-Dctsy33U.js","/assets/undo-2-hLqrtXz7.js","/assets/useChartTheme-DW1iVB4t.js","/assets/useElementWidth-CSmh_aFl.js","/assets/useIsMobile-BMZH50ZU.js","/assets/useMutation-Cf1HWMsp.js","/assets/useStatusBands-D1ZUS3DR.js","/assets/user-OpGblMb9.js","/assets/user-check-Cpuvu6-j.js","/assets/user-cog-CtjaBbpm.js","/assets/user-minus-4P3ebQTA.js","/assets/users-H4bxuex5.js","/assets/verifyState-CYer-1vJ.js","/assets/video-DDZkhuho.js","/assets/warehouse-DGWGFsMG.js","/assets/zap-C6rzkKgY.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
