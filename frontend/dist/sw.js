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

const BUILD = "2026-10-03T10:39:28.187Z";
const PRECACHE = ["/","/assets/AdminPanel-DfzgR_d0.js","/assets/AnalysisBoard-BLRYuhBk.js","/assets/Arc-gU995Pfi.js","/assets/ArcLegacy-r4uOUa53.js","/assets/BrigadirProfile-DdCs48EI.js","/assets/BroadcastReceivers-CK4CdX4p.js","/assets/BroadcastRecord-BZ9N98Zu.js","/assets/CatLockNotice-BOn6EAKX.js","/assets/CategoryLegendModal-CAXCxfjd.js","/assets/CellConcerns-DU75m8RU.js","/assets/CellDetails-vPGyrEwF.js","/assets/CellFormModal-LnvU6rQC.js","/assets/CellIdent-C4QXk6M4.js","/assets/CellLink-DJDTWwjy.js","/assets/Cells-a7MHWXx2.js","/assets/ColumnFilter-DhE5-d3B.js","/assets/ColumnsPicker-BBx3tSZt.js","/assets/CommentsModal-BXNneSQW.js","/assets/ComparisonTable-BfiSZGWV.js","/assets/Concerns-gY-DCcMK.js","/assets/ConfirmDialog-OuLalbDa.js","/assets/Daily-Ca6ZYH8Q.js","/assets/DataTable-Bj6jB2aq.js","/assets/DateRangePicker-CEA0YE0J.js","/assets/DayReportView-BCmeX99N.js","/assets/DayStepper-CEzEj0di.js","/assets/DifferenceBreakdown-BH4o8Fz4.js","/assets/Downtime-p_lf1QJa.js","/assets/Education-BErkcXYP.js","/assets/EducationLesson-CjDrT7zU.js","/assets/EmptyState-CbQGSi9t.js","/assets/Exam-CJremasi.js","/assets/FactorySelect-B6Lcu9H7.js","/assets/Gamification-BnGgIzWb.js","/assets/GroupBadge-CxBqo6Sy.js","/assets/HeatmapChart-TC9PxJTu.js","/assets/IdleCell-CD1XJCv2.js","/assets/KPICard-BrH9BGl4.js","/assets/Kaizen-Bp3sjVKi.js","/assets/Kelish-DfyhRStN.js","/assets/KpiDeltaCard-BkrexLTe.js","/assets/LangTextInput-B4SYHKgO.js","/assets/Layout-CKR9yJrK.js","/assets/LeaderAppeal-Dta_JQ4K.js","/assets/LeaderDayReport-C2gOup-r.js","/assets/LeaderUnitReport-pczXFZ8Q.js","/assets/Leaderboard-BueJdRnv.js","/assets/Leaders-BtLsjXRw.js","/assets/Lightbox-DtQImkbl.js","/assets/LiveOverview-Cx0cIfxt.js","/assets/Login-5WvXqgsj.js","/assets/NotFound-5vSXn0W3.js","/assets/Notifications-M6_EoUCL.js","/assets/Overview-BnRCduG9.js","/assets/Pagination-CWjPBiri.js","/assets/PerenaladkaFactTable-BykFsMZp.js","/assets/PersonCard-Th-6xUDg.js","/assets/PlanFulfillment-B5hykx-n.js","/assets/Production-wM7j4Qdp.js","/assets/Profile-B0oSuTtN.js","/assets/ProofCamera-BjV616vH.js","/assets/ProofPhoto-DJDqwIL4.js","/assets/Quality-DvW1HkTZ.js","/assets/RawRows-yUNntqoY.js","/assets/RequestStateChip-C_Z-rskF.js","/assets/RichTextEditor-Bj0IN8mU.js","/assets/SaveState-DRYToKIR.js","/assets/SearchInput-ZXKyJKWg.js","/assets/SeasonalityHeatmap-hpHCVYmA.js","/assets/SegmentedToggle-71d_lxRB.js","/assets/SetupTimes-BObm3zCg.js","/assets/ShiftDaily-B1ShgRVA.js","/assets/Staff-kGgCHTzy.js","/assets/StaffLive-Ck89nqiO.js","/assets/StatusBadge-C96sIUu_.js","/assets/TargetGoal-A-9RhctZ.js","/assets/Targets-DNFokcxY.js","/assets/Tasks-CyMimZ72.js","/assets/TimeWheelPicker-88bYbQ5v.js","/assets/Toast-DqUZJ5Es.js","/assets/Tooltip-BmzXacl0.js","/assets/TrendChart-BFssdMh6.js","/assets/TripleSpeedometer-CIJLrQHW.js","/assets/Trudoyomkost-55-lDsmq.js","/assets/UploadDropzone-C2RFshgj.js","/assets/UsersActivity-BU1o3Y5Y.js","/assets/VerdictBlock-vsf14wU_.js","/assets/VfxApiMap-DwoSFFOE.js","/assets/VfxEmployees-UxV5vXsL.js","/assets/VfxJobs-BRJg-IGq.js","/assets/VfxMarks-L3NAgwhG.js","/assets/VfxOnSite-DJ6992XM.js","/assets/VfxPhoto-C9Jk80yZ.js","/assets/VfxState-D5B0NMrv.js","/assets/VfxStructure-r3UgbnzM.js","/assets/VfxTable-DJ6h4xhs.js","/assets/VfxTimesheet-Cq6QqfkW.js","/assets/WatchProgress-BQZGdsx8.js","/assets/WebLogin-CBFD5BQv.js","/assets/WorkerConcerns-nh9HdOs8.js","/assets/Workers-bcmKlQdz.js","/assets/Zagruzka-BQ5gyYb9.js","/assets/ZagruzkaCell-DFs454Dh.js","/assets/api-OkZ2x6jF.js","/assets/archive-DZ0YfVuk.js","/assets/archive-restore-DaRobVBb.js","/assets/arrow-down-DncIEOnv.js","/assets/arrow-left-kf9oLB7y.js","/assets/arrow-right-left-BRKVvE6U.js","/assets/arrow-up-O5hhoYSQ.js","/assets/arrow-up-narrow-wide-D-5fYUqH.js","/assets/arrow-up-right-cDevKBfS.js","/assets/award-IhhGpGM5.js","/assets/ban-BqYli82Q.js","/assets/bot-E0MIvUxu.js","/assets/boxes-CTfewS96.js","/assets/braces-DvmxZ7BM.js","/assets/brigadirFilters-Bu84orGV.js","/assets/broadcastTree-BqeNwXr7.js","/assets/building-2-C-sEsMzm.js","/assets/calendar-BIUZSGtM.js","/assets/calendar-days-CX2l5-KM.js","/assets/camera-Cm1MWGbD.js","/assets/categories-BqVLh8gC.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CQ42WBz1.js","/assets/chart-line-BKQWYIi9.js","/assets/chart-pie-CjHS9Rkg.js","/assets/chartRange-D6foK1V2.js","/assets/chevron-left-DxZWKdgQ.js","/assets/chevrons-up-down-GH5jeKLs.js","/assets/circle-C4SfBKQF.js","/assets/circle-alert-C_Xg2H5U.js","/assets/circle-check-big-B5dxBd7m.js","/assets/circle-dashed-qLL45EzE.js","/assets/circle-minus-Ddm6gUmU.js","/assets/circle-question-mark-Cq8nWg_X.js","/assets/circle-slash-BVssLIcJ.js","/assets/circle-user-round-lHChdqiY.js","/assets/clock-3-CGBXoLKt.js","/assets/cloud-off-Dxa5X7Zq.js","/assets/cloud-upload-DvXEgxG6.js","/assets/compass-B25h_emp.js","/assets/concernCategories-DKyu5vFG.js","/assets/copy-CGKLCWwY.js","/assets/corner-down-right-CE9dgwRV.js","/assets/createLucideIcon-CvKXTtYT.js","/assets/door-open-B7N7XFat.js","/assets/es-D0_Wa9VA.js","/assets/exportXlsx-9OrShZpc.js","/assets/external-link-S4qx2lyA.js","/assets/file-clock-BMupsemv.js","/assets/file-exclamation-point-CB1zJPY-.js","/assets/file-spreadsheet-CmJtX6jr.js","/assets/file-text-C8YO99QW.js","/assets/flag-Ctcgnk9A.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CqXjny-2.js","/assets/hash-CCIUz7py.js","/assets/history-BGMcLFNo.js","/assets/hourglass-BvNLVy2y.js","/assets/image-BLQN1ynC.js","/assets/image-off-C09fAPFL.js","/assets/inbox-UFndcFnz.js","/assets/index-BkTX07lG.js","/assets/index-CPVGdSVZ.css","/assets/key-round-DFKm9C4b.js","/assets/keyboard-BeXNnwIx.js","/assets/languages-CPTNAW0F.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Dc6XNXVr.js","/assets/lightbulb-5tuWSHQc.js","/assets/link-2-Dn9ECVJ8.js","/assets/link-2-off-DbS4tFGw.js","/assets/list-ordered-hL4vkDwT.js","/assets/list-tree-B2eHWtKZ.js","/assets/lock-open-Duvv7lK7.js","/assets/log-in-DqxB3U4I.js","/assets/maximize-2-DdNIF1b3.js","/assets/message-square-B42ddfCW.js","/assets/minimize-2-9Y4rh3fD.js","/assets/package-check-BycaVusz.js","/assets/paperclip-D1drcEVA.js","/assets/pencil-DXq5BzY_.js","/assets/percent-C44GHoQg.js","/assets/phone-CFGsZXCj.js","/assets/pin-BMre7kV5.js","/assets/pin-off-DajQDXQN.js","/assets/play-D5rNyimw.js","/assets/plug-zap-C9q5TLWc.js","/assets/presentation-CfAUGEjf.js","/assets/prop-types-Sf-4e4pS.js","/assets/radio-fHwJvfkJ.js","/assets/react-apexcharts.esm-l94pGEaJ.js","/assets/repeat-DNNV2d59.js","/assets/rotate-ccw-CDYju4FG.js","/assets/rotate-cw-CWZCaMR3.js","/assets/save-4vhGEt6j.js","/assets/scopeLinks-Fqz_9NHV.js","/assets/scroll-text-kao6zppT.js","/assets/search-x-DblmwydJ.js","/assets/segments-D9Z7htur.js","/assets/send-gakyRuf-.js","/assets/settings-2-kiG756dN.js","/assets/shield-UNFA4a_i.js","/assets/shield-alert-CUFfolgL.js","/assets/shield-check-B--N3slp.js","/assets/shield-question-mark-CRV7D0Al.js","/assets/siren-C0396iUF.js","/assets/snowflake-1LHfJ8Ry.js","/assets/split-DGoQ4BN5.js","/assets/square-3AG09POF.js","/assets/square-check-big-BW8BdzrR.js","/assets/star-GrM35uRo.js","/assets/statusBands-BCgIActL.js","/assets/store-aoG8lPLn.js","/assets/table-2-Y3b1QyTD.js","/assets/table-properties-BUr79ZE2.js","/assets/tag-DeTy71fR.js","/assets/timer-off-CEi8odh5.js","/assets/trending-down-nzNKa8T4.js","/assets/trending-up-BqqijcG4.js","/assets/undo-2-DXbii6pn.js","/assets/useChartTheme-Be9LxdKw.js","/assets/useElementWidth-2WXTcKOM.js","/assets/useIsMobile-TWk_9Paj.js","/assets/useOpenParam-CrHBV90z.js","/assets/useStatusBands-BYUAmAtS.js","/assets/useUrlScope-BUEW2R25.js","/assets/user-cog-vqxuD4td.js","/assets/user-minus-DIn_kS2Z.js","/assets/user-sbKBxB4f.js","/assets/users-D-OJO1wL.js","/assets/video-aE8dW7g9.js","/assets/wallet-B8Dv3zNe.js","/assets/warehouse-Bnm5Z0Uq.js","/assets/x-BSIulBwf.js","/assets/zap-DvSHO2BG.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
