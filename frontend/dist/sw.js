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

const BUILD = "2026-09-23T05:09:39.962Z";
const PRECACHE = ["/","/assets/AdminPanel-BwBOenuK.js","/assets/AnalysisBoard-CcBXs5Wa.js","/assets/Arc-BlGffGpc.js","/assets/AttendanceModal-ePBtrPDq.js","/assets/BrigadirProfile-Cb8l3W5X.js","/assets/BroadcastReceivers-BBTTZuEK.js","/assets/BroadcastRecord-CQ4GECfb.js","/assets/CatLockNotice-vemUU1YB.js","/assets/CategoryLegendModal-CNELsUwq.js","/assets/CellConcerns-8lDX6GO5.js","/assets/CellDetails-DDcKokNr.js","/assets/CellFormModal-BXiMnj06.js","/assets/CellLink-BTQein8j.js","/assets/Cells-pA599PES.js","/assets/ColumnFilter-Cibgh08w.js","/assets/ColumnsPicker-CoCh_a9_.js","/assets/CommentsModal-wQS0C7h4.js","/assets/ComparisonTable-DTUbru0M.js","/assets/Concerns-BfqEK6_T.js","/assets/ConfirmDialog-RcqGWuF9.js","/assets/Daily-BcxiSL7I.js","/assets/DataTable-BupgsrT1.js","/assets/DateRangePicker-DafDLiB1.js","/assets/DayReportView-7pMHVKwJ.js","/assets/DayStepper-D8voW-Xk.js","/assets/DifferenceBreakdown-aW8B4-5o.js","/assets/Downtime-DOic5OpV.js","/assets/Education-n4GdwZmS.js","/assets/EducationLesson-DU_RDQhd.js","/assets/EmptyState-CKj_jSBS.js","/assets/FactorySelect-DzBAxCNz.js","/assets/FormField-CFcGTtLd.js","/assets/Gamification-CJ75CN27.js","/assets/GroupBadge-C1mpGAmv.js","/assets/HeatmapChart-fcm_ijbr.js","/assets/IdleCell-D9F5upjo.js","/assets/KPICard-t-tsjbtU.js","/assets/Kaizen-pnH9HCJD.js","/assets/KpiDeltaCard-6vcMS01f.js","/assets/LangTextInput-ZNwYPXYc.js","/assets/Layout-CClFfnjm.js","/assets/LeaderDayReport-DhzCTwYP.js","/assets/LeaderUnitReport-BAhayQVM.js","/assets/Leaderboard-9Woc1i10.js","/assets/Leaders-4ZWSKOdL.js","/assets/LiveOverview-DucQL8jz.js","/assets/Login-CpXQxw6X.js","/assets/NotFound-D7lm6wvR.js","/assets/Overview-CeQDtn59.js","/assets/Pagination-B_uUIrMZ.js","/assets/PerenaladkaFactTable-DZ9Sqhnt.js","/assets/PlanFulfillment-zHI0lKxA.js","/assets/Production-plAFkPCr.js","/assets/Profile-vo3-nMdS.js","/assets/ProofCamera-Bk-xVIOi.js","/assets/Quality-CmubpXoJ.js","/assets/RichTextEditor-B4xg_M8u.js","/assets/SearchInput-CF9cf8h-.js","/assets/SeasonalityHeatmap-DLuJrK-U.js","/assets/SegmentedToggle-DGiFdR21.js","/assets/SetupTimes-Bj7DkdAf.js","/assets/ShiftDaily-DmkqUXUx.js","/assets/Skeleton-DFo56DL7.js","/assets/Staff-DHzaY1Z7.js","/assets/StatusBadge-Dhf4EgDn.js","/assets/StyledSelect-phVq87qI.js","/assets/Targets-BaUhE0Nh.js","/assets/Tasks-wEm070F_.js","/assets/TimeField-CvoMCNFh.js","/assets/TimeWheelPicker-DNaGUIgh.js","/assets/Toast-DFd4OXPF.js","/assets/Tooltip-DB9rMRI7.js","/assets/TrendChart-CddS4PmD.js","/assets/TripleSpeedometer-DIqCecAI.js","/assets/Trudoyomkost-VW6gcMpx.js","/assets/UsersActivity-o99G5DMC.js","/assets/WatchProgress-Lu8h3pum.js","/assets/WebLogin-CJRnrOmT.js","/assets/WorkerConcerns-BC06w1m8.js","/assets/Workers-xkowbkxg.js","/assets/Zagruzka-Fqk03Z9U.js","/assets/ZagruzkaCell-DGwkG4d8.js","/assets/alarm-clock-BUUly2Ap.js","/assets/api-CqvbIcWv.js","/assets/archive-CHap-Ge3.js","/assets/archive-restore-Co3KAJeF.js","/assets/arrow-down-grO1t4XW.js","/assets/arrow-left-CacA3sOU.js","/assets/arrow-left-right-D_1yh5pR.js","/assets/arrow-right-DIYxkiXF.js","/assets/arrow-up-DEVb5C__.js","/assets/arrow-up-right-C73d29K8.js","/assets/award-B_MgOhRd.js","/assets/ban-BRdrCJJA.js","/assets/bot-B6g94h8s.js","/assets/boxes-COcdUEei.js","/assets/brigadirFilters-CWC4MImt.js","/assets/broadcastTree-BgmxNd2o.js","/assets/building-2-Cd9RlBdI.js","/assets/calendar-DZ0EQB1-.js","/assets/calendar-clock-85USBxsS.js","/assets/calendar-days-CSkE8NKy.js","/assets/calendar-range-CWmAHEf4.js","/assets/camera-aYgbQwtv.js","/assets/categories-DsZ8C78b.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DnTAV-uI.js","/assets/chart-line-EQ1CyKni.js","/assets/chart-pie-C9gfX7Kl.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-BTGoGUSa.js","/assets/check-RefpOm6R.js","/assets/check-check-TSPGAkgk.js","/assets/chevron-left-BGt7Ym_2.js","/assets/chevrons-up-down-BiuR9o-i.js","/assets/circle-dashed-B1HIVd3A.js","/assets/circle-dot-Dr7mAhog.js","/assets/circle-minus-CaR9W8md.js","/assets/circle-slash-DKNJ31aj.js","/assets/circle-user-round-D_DPA_Gh.js","/assets/coins-Cs0scWnn.js","/assets/compass-CQfwSc4c.js","/assets/concernCategories-Uu24vfpx.js","/assets/copy-sY8O4xGv.js","/assets/corner-down-right-CzAmubhW.js","/assets/createLucideIcon-DsyV0Rs9.js","/assets/exportXlsx-Cu5qLBOZ.js","/assets/external-link-CHzgE5aK.js","/assets/file-clock-B07BRTXT.js","/assets/file-spreadsheet-C2YnFpaU.js","/assets/file-text-DM37vwU9.js","/assets/flag-CbtbcDYQ.js","/assets/flame-BfuT5fHM.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Ctqu3_-Z.js","/assets/funnel-B_Xda2Bk.js","/assets/hash-B4v7pn-_.js","/assets/history-Pi1T0S8S.js","/assets/hourglass-Dqj1pvF9.js","/assets/image-Dk7lbe--.js","/assets/image-off-BM1lqwDA.js","/assets/index-BXqTV2jf.css","/assets/index-CZKlQ3Vb.js","/assets/keyboard-CI2vaSPu.js","/assets/languages-DdS3diDn.js","/assets/layers-S-xJ3_PJ.js","/assets/leaderReason-CVL-aJtY.js","/assets/lightbulb-DwU39sf_.js","/assets/link-2-BrN3SV8T.js","/assets/list-checks-CQukI2P_.js","/assets/list-ordered-C7vUXj_j.js","/assets/lock-open-Bkt4PQ3O.js","/assets/log-in-Ckvl8u2h.js","/assets/message-square-VG2yR2il.js","/assets/minimize-2-P4hQblwJ.js","/assets/minus-DeLCw0kO.js","/assets/paperclip-DiwiDUyR.js","/assets/pencil-B1bQOzaH.js","/assets/pencil-line-vkK0L2mR.js","/assets/personName-B4KId4zS.js","/assets/pin-CRXZfKOe.js","/assets/play-k9P5Db1e.js","/assets/prop-types-BTyNGasK.js","/assets/radio-B7_MoB1v.js","/assets/react-apexcharts.esm-NFLKITlq.js","/assets/refresh-cw-BCBu8QEo.js","/assets/repeat-DSuZgv-W.js","/assets/rotate-ccw-BgRweBdq.js","/assets/rotate-cw-DJQf0Fwn.js","/assets/save-zqWBcx9j.js","/assets/scale-DiKwvMO2.js","/assets/scroll-text-LiY7eMbA.js","/assets/search-x-Bsi9fmI3.js","/assets/segments-K42rl5HX.js","/assets/send-CcNVUfPR.js","/assets/settings-2-CXzXd-dz.js","/assets/shield-RBvjo5i5.js","/assets/shield-alert-C0iMeY-b.js","/assets/shield-check-BSCHqNCd.js","/assets/shield-question-mark-D0kLC6Os.js","/assets/siren-B5EtTPpM.js","/assets/smartphone-DYdbPYwW.js","/assets/snowflake-Cipbid56.js","/assets/square-check-big-DMLPJJjh.js","/assets/square-eqotTSZ5.js","/assets/star-DDDjxQsh.js","/assets/statusBands-BO6t4TIl.js","/assets/table-2-BNWcTD1D.js","/assets/tag-yDIE36i7.js","/assets/trash-2-C5fQ8O6O.js","/assets/trending-down-ChoENxXr.js","/assets/trending-up-yDHKX_IU.js","/assets/undo-2-DfAwvmOo.js","/assets/useChartTheme-BhjfrJok.js","/assets/useElementWidth-DskZgs5Q.js","/assets/useIsMobile-Z14xD0Da.js","/assets/useMutation-Qmb7Y8W7.js","/assets/useStatusBands-CExFN3sE.js","/assets/user-check-DkceVPrt.js","/assets/user-cog-C68eOUJR.js","/assets/user-minus-Bc6eFpUf.js","/assets/users-C-edA0h5.js","/assets/verifyState-DhpykB5I.js","/assets/video-BuISmd-L.js","/assets/warehouse-CfrN-rG4.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
