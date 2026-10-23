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

const BUILD = "2026-10-23T16:12:56.446Z";
const PRECACHE = ["/","/assets/AdminPanel-XIpvSbeH.js","/assets/AnalysisBoard-CZyfcCXd.js","/assets/Arc-DCRBHcrf.js","/assets/Assistant-CznUoOPl.js","/assets/BrigadirProfile-B_Fn6F-E.js","/assets/BroadcastReceivers-DdRUHdNR.js","/assets/BroadcastRecord-CgiDym01.js","/assets/Button-DRVy3IyK.js","/assets/CatLockNotice-L5HhThU6.js","/assets/CategoryLegendModal-raq2Ku2w.js","/assets/CellConcerns-Cjlnqk3g.js","/assets/CellDetails-D3HEssjJ.js","/assets/CellFormModal-Ct3zDVwd.js","/assets/CellIdent-BQv34Tkr.js","/assets/CellLink-B_Xu77x7.js","/assets/Cells-Dtop1Twv.js","/assets/ColumnFilter-D6AgNt-2.js","/assets/ColumnsPicker-CIpA3_Xg.js","/assets/CommentsModal-BOiM2B7J.js","/assets/ComparisonTable-Xer_EVh7.js","/assets/Concerns-yQZLGqPa.js","/assets/CountStepper-f71wmOCA.js","/assets/Daily-Bj9A8QCo.js","/assets/DataTable-B44a-q8F.js","/assets/DateRangePicker-D0nkv_EQ.js","/assets/DayReportView-CcuOe6N5.js","/assets/DayStepper-CeLuLjUN.js","/assets/DayStrip-CAmCGtV3.js","/assets/DifferenceBreakdown-h-O4NMXo.js","/assets/Downtime-CMl80OJG.js","/assets/Education-DVHE0RV-.js","/assets/EducationLesson-DwQfTrSX.js","/assets/EmptyState-BRJ_8Xm-.js","/assets/Exam-B5U02GQA.js","/assets/FactorySelect-D9DF4EVM.js","/assets/Gamification-DYaTU655.js","/assets/GroupBadge-Dr5qmMRj.js","/assets/HeatmapChart-B-qfk4dn.js","/assets/IdleCell-DJYdZvfs.js","/assets/KPICard-i6Nt9lzW.js","/assets/Kaizen-C8vN3nG4.js","/assets/Kelish-D88whHXQ.js","/assets/KpiDeltaCard-BL9c1w5-.js","/assets/LangTextInput-BLJkFtP2.js","/assets/Layout-BfN6F0nX.js","/assets/LeaderAppeal-ChYhEQC5.js","/assets/LeaderDayReport-UgZjBk4U.js","/assets/LeaderUnitReport-Co1pShar.js","/assets/Leaderboard-B8ir2BHD.js","/assets/Leaders-CbGj1vyk.js","/assets/LeadersKpi-Caaix5mH.js","/assets/Lightbox-7aNBjW7y.js","/assets/LiveOverview-DFS-bov0.js","/assets/Login-B-L7h4-F.js","/assets/NotFound-DQxbrIHV.js","/assets/Notifications-BRWB44ES.js","/assets/Ontime-DWy0_BEe.js","/assets/Overview-XP1rXuNf.js","/assets/Pagination-WR3iDFkO.js","/assets/PerenaladkaFactTable-CPd4-2EY.js","/assets/PersonCard-Btg9w8sy.js","/assets/PlanFulfillment-D8idkKnW.js","/assets/Production-CAbTdJ4K.js","/assets/Profile-BhzLADo3.js","/assets/ProofCamera-xs6U9KzU.js","/assets/ProofPhoto-CXX1AKub.js","/assets/Quality-FSVSRP-j.js","/assets/RawRows-BWKY0ARv.js","/assets/RequestStateChip-C55x3xYT.js","/assets/RichTextEditor-Cl1yChNQ.js","/assets/SaveState-Cxii6efu.js","/assets/SearchInput-CWc2yB0N.js","/assets/SeasonalityHeatmap-BvIeRMd4.js","/assets/SegmentedToggle-BzbdIqz3.js","/assets/SetupTimes-BzxMUZWU.js","/assets/ShiftDaily-CbmjJ4RM.js","/assets/Staff-CQ5Z30zj.js","/assets/StaffListAtCheck-CXnNKKSq.js","/assets/StatusBadge-DeDVWVoT.js","/assets/StatusBandsModal-Dz1K-6jJ.js","/assets/TargetGoal-DOuR4VHr.js","/assets/Targets-hCcjE3cH.js","/assets/Tasks-OU9kQU_i.js","/assets/TimeWheelPicker-Dov09rYe.js","/assets/Toast-CcERkaVj.js","/assets/Tooltip-CLvpeeRw.js","/assets/TrendChart-CqYlzcZr.js","/assets/TripleSpeedometer-Dms7gWfh.js","/assets/Trudoyomkost-PPkwiwQf.js","/assets/UploadDropzone-B_5C9m1M.js","/assets/UsersActivity-CVEcmmKJ.js","/assets/VerdictBlock-Bf3BSXcG.js","/assets/VfxApiMap-CmW7N3_k.js","/assets/VfxDictionaries-3si0A6vA.js","/assets/VfxEmployees-CRYzbLun.js","/assets/VfxHrMoves-CPhihHOe.js","/assets/VfxJobs-gZLwo6zt.js","/assets/VfxPhoto-CmRoVfjD.js","/assets/VfxShifts-DAuxvg9H.js","/assets/VfxState-BF9YPRUu.js","/assets/VfxTimebooks-Des-UFFu.js","/assets/VfxTimesheet-BmkxLLQX.js","/assets/WatchProgress-_ipuNAvT.js","/assets/WebLogin-Ca9MFy9H.js","/assets/Workers-D8GXAlVB.js","/assets/Zagruzka-DguyBube.js","/assets/ZagruzkaCell-CrjoZoU3.js","/assets/api-7YWI3zPL.js","/assets/archive-Dbm8HhYs.js","/assets/archive-restore-Csef7GFD.js","/assets/arrow-down-7ENgn5x0.js","/assets/arrow-down-right-CjPPhoVk.js","/assets/arrow-down-wide-narrow-CidzZqbG.js","/assets/arrow-up-narrow-wide-BuMPQZC_.js","/assets/ban-B6RLDGmM.js","/assets/boxes-Dq1E4yOA.js","/assets/braces-DyHImwrU.js","/assets/brigadirFilters-BAS0gBSY.js","/assets/broadcastTree-YYhyBROw.js","/assets/building-2-_DAS97TY.js","/assets/calendar-BWSAK8yI.js","/assets/calendar-days-Bhq6O09c.js","/assets/camera-DSfKjgva.js","/assets/categories-NhhsN6vH.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CXuJFQ7L.js","/assets/chart-line-mZarO3GA.js","/assets/chart-pie-BgYwAANa.js","/assets/chartRange-cPrDriB6.js","/assets/check-check-B6xQIm-9.js","/assets/chevron-left-B9BZqNJA.js","/assets/chevrons-up-down-FheSAXo2.js","/assets/circle-DwOaQRWr.js","/assets/circle-alert-NJ_iSRcn.js","/assets/circle-check-big-y5D_7c8W.js","/assets/circle-dashed-DKsbGxik.js","/assets/circle-minus-CJ9lkkpk.js","/assets/circle-question-mark-DX6Es4Sh.js","/assets/circle-slash-BpWW09fw.js","/assets/circle-user-round-CD9reqbC.js","/assets/cloud-off-ByEynHV8.js","/assets/cloud-upload-Blg7a88E.js","/assets/compass-BG5qwtjY.js","/assets/concernCategories-xMz29nl1.js","/assets/corner-down-right-C2AOIayV.js","/assets/createLucideIcon-BpWBa8Mk.js","/assets/es-DCOWnULs.js","/assets/external-link-DY0fsvhi.js","/assets/file-clock-C5WKBGnE.js","/assets/file-exclamation-point-ybtJK5OL.js","/assets/flag-C9_uvGD4.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-COVc35bN.js","/assets/funnel-t6g5dgXD.js","/assets/hash-7ZxmjmRv.js","/assets/hourglass-Bp7uvIRa.js","/assets/image-DtoqoUi4.js","/assets/image-off-CV1HDbQN.js","/assets/inbox-DXtbKn2U.js","/assets/index-Ceod8iL3.js","/assets/index-DFvJry-Q.css","/assets/keyboard-BZNKU6tz.js","/assets/languages-CPrvP7zR.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-wfEoug29.js","/assets/leaderBoard-CEgeTyqG.js","/assets/lightbulb-BTRUDi-9.js","/assets/link-2-DZaTqkw6.js","/assets/link-2-off-CTGubM2a.js","/assets/list-ordered-CT7N8lof.js","/assets/list-tree-DJxRagYP.js","/assets/lock-open-BGr6CiPK.js","/assets/log-in-C2cnWnoY.js","/assets/map-pin-CLNAN2R7.js","/assets/marks-K-KdVBpD.js","/assets/minimize-2-SBlbN0PS.js","/assets/package-check-DMRZrmJM.js","/assets/pencil-C2xP0Xg-.js","/assets/percent-CYrbuXTb.js","/assets/pin-Cc9vP_HS.js","/assets/pin-off-C5gF02wp.js","/assets/play-qKWg5iQc.js","/assets/plug-zap-CdyNAObR.js","/assets/prop-types-DjNZq4My.js","/assets/radio-D3TGspVy.js","/assets/react-apexcharts.esm-BwJl-qLv.js","/assets/registers-CQ9Z3rcB.js","/assets/repeat-D_VLZ5fO.js","/assets/save-Dped8KcZ.js","/assets/scopeLinks-CJB7leqb.js","/assets/scroll-text-Y3yeq4v3.js","/assets/search-x--h7I5PP1.js","/assets/segments-DEBN4mM6.js","/assets/send-BTytEX3e.js","/assets/settings-2-Cq8iy8dm.js","/assets/shield-CBxuq3eq.js","/assets/shield-alert-uAlkZePA.js","/assets/shield-question-mark-wZh4UVrY.js","/assets/sigma-BPPhQCvA.js","/assets/siren-BjLRuLJO.js","/assets/snowflake-CUUgbQLe.js","/assets/split-D0nyzK13.js","/assets/square-check-big-GcWMPEJK.js","/assets/star-BPHRW2FS.js","/assets/statusBands-B9rxHAUs.js","/assets/store-B8axL2y-.js","/assets/table-2-DX3dkQwT.js","/assets/table-properties-EJl9AcoU.js","/assets/tag-DvAmbiQP.js","/assets/timer-off-C3dQXX-u.js","/assets/trendBuckets-BkW96TyT.js","/assets/trending-down-CX0mwzSP.js","/assets/trending-up-DQZOKiJX.js","/assets/undo-2-CMmXHyPU.js","/assets/useChartTheme-bbWh8ewH.js","/assets/useElementWidth-3KLtW_7f.js","/assets/useIsMobile-CUKLuVdM.js","/assets/useOpenParam-Bwc4adDS.js","/assets/useStatusBands-DJ_SZnlm.js","/assets/useUrlScope-C9MnNNPc.js","/assets/user-BmhGEhmJ.js","/assets/user-cog-BFOOCyQ-.js","/assets/user-minus-DFRjL_XT.js","/assets/users-wxaJJ20m.js","/assets/vfx-CxAbEOta.js","/assets/video-Bn7q2TwW.js","/assets/wallet-DUMMV0xI.js","/assets/warehouse-BUpYifC5.js","/assets/workflow-CKlh6l27.js","/assets/x-D01bliMG.js","/assets/zap-DG7IfwMW.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
