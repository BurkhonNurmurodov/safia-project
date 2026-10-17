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

const BUILD = "2026-10-17T13:04:52.797Z";
const PRECACHE = ["/","/assets/AdminPanel-D5DJu_Ft.js","/assets/AnalysisBoard-BFkDEURI.js","/assets/Arc-DYSULI93.js","/assets/Assistant-CMY0ei6m.js","/assets/BrigadirProfile-CcfYbvlz.js","/assets/BroadcastReceivers-_kEDm6GD.js","/assets/BroadcastRecord-CcH5Cf7i.js","/assets/Button-Dkt7zXAM.js","/assets/CatLockNotice-zfz8IUfn.js","/assets/CategoryLegendModal-dfl9XADU.js","/assets/CellConcerns-X1Y4APmi.js","/assets/CellDetails-Bwrw-7qh.js","/assets/CellFormModal-ooUO_Z2P.js","/assets/CellIdent-Dsm3_H-l.js","/assets/CellLink-D5-3a9pd.js","/assets/Cells-Dlo63agZ.js","/assets/ColumnFilter-CyyuS6Um.js","/assets/ColumnsPicker-CwdK4nYe.js","/assets/CommentsModal-C3JQIYgN.js","/assets/ComparisonTable-cfKuO8ev.js","/assets/Concerns-CGu18s5E.js","/assets/CountStepper-CLShF21h.js","/assets/Daily-DlXkEGpw.js","/assets/DataTable-BAlQ32L2.js","/assets/DateRangePicker-DfgP7UZr.js","/assets/DayReportView-DpmTGn5g.js","/assets/DayStepper-CPVdPqpe.js","/assets/DifferenceBreakdown-D1X6Pv5o.js","/assets/Downtime-IukqgN-V.js","/assets/Education-DRwvM9iO.js","/assets/EducationLesson-B3sICCdw.js","/assets/EmptyState-ErTg48sH.js","/assets/Exam-Czx6Sj09.js","/assets/FactorySelect-BOTTTU0Q.js","/assets/ForeignObjects-DOD2Z_cO.js","/assets/Gamification-DnfE0s86.js","/assets/GroupBadge-yGalLJZU.js","/assets/HeatmapChart-BHipbUgk.js","/assets/IdleCell-D0lw_GZH.js","/assets/KPICard-CnE-kjHS.js","/assets/Kaizen-CBP6MKhJ.js","/assets/Kelish-D8iEtMad.js","/assets/KpiDeltaCard-BfMzuKqQ.js","/assets/LangTextInput-DyWkE_K2.js","/assets/Layout-PHv4g0lP.js","/assets/LeaderAppeal-Dapn3_Y2.js","/assets/LeaderDayReport-DzaGPDR4.js","/assets/LeaderUnitReport-DKXujjgl.js","/assets/Leaderboard-D-ur7SJy.js","/assets/Leaders-bCxZgo29.js","/assets/Lightbox-Cug2tkks.js","/assets/LiveOverview-B-H6-svA.js","/assets/Login-lNbFL_Wo.js","/assets/NotFound-DyMOTEyg.js","/assets/Notifications-DS_yo0rH.js","/assets/Overview-CXxfj20k.js","/assets/Pagination-Ci9TyTpB.js","/assets/PerenaladkaFactTable-DvUDCX0c.js","/assets/PersonCard-DFxzD58k.js","/assets/PlanFulfillment-Bu5JtTz-.js","/assets/Production-B2M308_E.js","/assets/Profile-BtbjPmSC.js","/assets/ProofCamera-BpJm2Sqc.js","/assets/Quality-CKcs2RBi.js","/assets/RawRows-C-OWCXS2.js","/assets/RequestStateChip-AjCSc71I.js","/assets/RichTextEditor-Dcfn16BI.js","/assets/SaveState-4Bz69t2G.js","/assets/SearchInput-Bwu2njz3.js","/assets/SeasonalityHeatmap-Bi9JtHXG.js","/assets/SegmentedToggle-DneJOc5Z.js","/assets/SetupTimes-D5y8DEwf.js","/assets/ShiftDaily-CO3nHXOg.js","/assets/Staff-BXWvE6mO.js","/assets/StaffListAtCheck-CbIKyrZD.js","/assets/StatusBadge-AW-xADHc.js","/assets/TargetGoal-DgZv_ozs.js","/assets/Targets-MRh7nLyD.js","/assets/Tasks-B5Lf6yW3.js","/assets/TimeWheelPicker-BJ3_mERl.js","/assets/Toast--ayJuJmJ.js","/assets/Tooltip-DYKK0ZiU.js","/assets/TrendChart-C4gZ306Z.js","/assets/TripleSpeedometer-BiuT98n3.js","/assets/Trudoyomkost-D18Kz55d.js","/assets/Turnover-DW4DAvVD.js","/assets/TurnoverBits-CgLexpzr.js","/assets/UploadDropzone-CyEF4oWD.js","/assets/UsersActivity-BFLtrDrD.js","/assets/VerdictBlock-DvLgLg9V.js","/assets/VfxApiMap-nAOalYV4.js","/assets/VfxDictionaries-yX6_aLJm.js","/assets/VfxEmployees-BiGCcnY3.js","/assets/VfxHrMoves-B8cAE0PX.js","/assets/VfxJobs-DhlMQkXQ.js","/assets/VfxPhoto-BMfoL1j1.js","/assets/VfxShifts-d3zkbKBB.js","/assets/VfxState-B_1tcTDb.js","/assets/VfxTimebooks-CfAx9XKA.js","/assets/VfxTimesheet-DrKv-XVG.js","/assets/WatchProgress-CgtJlOOK.js","/assets/WebLogin-Y9sQKIlB.js","/assets/WorkerConcerns-Uf2dyjGL.js","/assets/Workers-DkJmClh5.js","/assets/Zagruzka-D8pvScks.js","/assets/ZagruzkaCell-CSYEiVmX.js","/assets/api-BxxWgGi5.js","/assets/archive-D0zCAIhq.js","/assets/archive-restore-Cturm1-k.js","/assets/arrow-down-Chlj7JUn.js","/assets/arrow-down-wide-narrow-b2JZDSkA.js","/assets/arrow-up-narrow-wide-BD_8mxTd.js","/assets/award-BIXLqXlK.js","/assets/ban-DC6bYxty.js","/assets/boxes-BuaWuWIK.js","/assets/braces-CU8YkXWc.js","/assets/brigadirFilters-Dy2VWlE_.js","/assets/broadcastTree-BmwZzznI.js","/assets/building-2-DT786kx7.js","/assets/calculator-BfBm15QI.js","/assets/calendar-days-DfEwYttY.js","/assets/calendar-oyXV6iHt.js","/assets/camera-Bysijb0b.js","/assets/categories-Bx5UGVoX.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-PuIhI16G.js","/assets/chart-line-C15hip2e.js","/assets/chart-pie-B4XQibJN.js","/assets/chartRange-8_0sd0Yr.js","/assets/check-check-ktArGd40.js","/assets/chevron-left-Cu6F4EGl.js","/assets/chevrons-up-down-Dxf99dGC.js","/assets/circle-CgJDBCIJ.js","/assets/circle-alert-3e0yK6Lp.js","/assets/circle-check-big-C7GidlDU.js","/assets/circle-dashed-BwT1HhSd.js","/assets/circle-minus-BnAKC_S4.js","/assets/circle-question-mark-EN_r7XLz.js","/assets/circle-slash-DWsQW6fS.js","/assets/circle-user-round-CzXh8hzy.js","/assets/cloud-off-BapVHBuS.js","/assets/cloud-upload-RdNqA-Ct.js","/assets/compass-CTR79HZV.js","/assets/concernCategories-C_wouhYS.js","/assets/corner-down-right-BOC3_RrJ.js","/assets/createLucideIcon-ezEFXg4d.js","/assets/es-DvFFbuFS.js","/assets/external-link-CgqOmoUY.js","/assets/file-clock-BmuCZYz8.js","/assets/file-exclamation-point-Of5pWjF5.js","/assets/flag-CMbhpc1u.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BR_is5II.js","/assets/hash-Ca7Hyfkd.js","/assets/hourglass-BJ4hJhJz.js","/assets/image-DovFtNzB.js","/assets/image-off-DtLO5YyX.js","/assets/inbox-DJzstcxG.js","/assets/index-ByhNoNK_.css","/assets/index-Dc80xdbE.js","/assets/keyboard-DMV_7MpB.js","/assets/languages-BwqbRlx8.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BZQCjTho.js","/assets/lightbulb-mOOoBqmp.js","/assets/link-2-Xrd0wF40.js","/assets/link-2-off-BLoBFkOL.js","/assets/list-ordered-C9KQYNzZ.js","/assets/list-tree-CEr--JkV.js","/assets/lock-open-aJDQQ9wg.js","/assets/log-in-Bxjblnen.js","/assets/marks-CySPYafO.js","/assets/minimize-2-DCEVzMDo.js","/assets/package-check-CVbBHZU_.js","/assets/pencil-C_8EhlX9.js","/assets/percent-C4FHwVz1.js","/assets/pin-C98xS5ID.js","/assets/pin-off-8V-4h3zZ.js","/assets/play-D3oqcrG_.js","/assets/plug-zap-BkSQ4tYJ.js","/assets/prop-types-DvgrUoQw.js","/assets/radio-COttHTRW.js","/assets/react-apexcharts.esm-Blb25dLH.js","/assets/registers-CD_EHu2k.js","/assets/repeat-QmG4TBEo.js","/assets/save-DWGwR6Ah.js","/assets/scopeLinks-jt_vmWeJ.js","/assets/scroll-text-DyMip5ym.js","/assets/search-x-Cdfq4tcF.js","/assets/segments-BWTLwyas.js","/assets/send-DYdU9_xt.js","/assets/settings-2-DuF_vvr2.js","/assets/shield-DuHYOJrH.js","/assets/shield-alert-x0O33SAG.js","/assets/shield-question-mark-CpQ2AcdX.js","/assets/siren-DWzUyvNG.js","/assets/snowflake-BM2WsOL4.js","/assets/split-DJYPFR0T.js","/assets/square-check-big-EdegHXpz.js","/assets/star-DnCvhwKF.js","/assets/statusBands-CWy15eLG.js","/assets/store-CMNbmx9A.js","/assets/table-2-DlWbIISK.js","/assets/table-properties-1334h1E9.js","/assets/tag-CH44gPWs.js","/assets/timer-off-BHqmKGWP.js","/assets/trending-down-DW8nBa1c.js","/assets/trending-up-DF7j9WpP.js","/assets/undo-2-Bwwx7VyO.js","/assets/useChartTheme-DUEHG1Hz.js","/assets/useElementWidth-BfVzHV8m.js","/assets/useIsMobile-D85aSjx9.js","/assets/useOpenParam-C8rfp8Ci.js","/assets/useStatusBands-B2ZQwxPq.js","/assets/useUrlScope-BVU0I8sa.js","/assets/user-BrYMCQ85.js","/assets/user-cog-yroyi_Qx.js","/assets/users-Dj9dsdvX.js","/assets/vfx-6CFELoLc.js","/assets/video-Bjm63UA7.js","/assets/wallet-CDoiYgIj.js","/assets/warehouse-DYgFOBZu.js","/assets/workflow-Bjk1xNr7.js","/assets/x-CqYfBMSq.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
