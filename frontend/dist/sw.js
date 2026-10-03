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

const BUILD = "2026-10-03T09:59:32.248Z";
const PRECACHE = ["/","/assets/AdminPanel-5gbvIAhF.js","/assets/AnalysisBoard-RkjHI1RX.js","/assets/Arc-D7UjcSuX.js","/assets/ArcLegacy-DReR47zE.js","/assets/BrigadirProfile-C4eKDdTQ.js","/assets/BroadcastReceivers-BkrvVeW4.js","/assets/BroadcastRecord-DHu8HJGd.js","/assets/CatLockNotice-BkY0j6ek.js","/assets/CategoryLegendModal-D9Q6xkRP.js","/assets/CellConcerns-CPB7YlPt.js","/assets/CellDetails-BaAb8r6u.js","/assets/CellFormModal-DWjWljLN.js","/assets/CellIdent--r9oN4VJ.js","/assets/CellLink-IZrjqHQG.js","/assets/Cells-CboMDBu3.js","/assets/ColumnFilter-gBg6HBAO.js","/assets/ColumnsPicker-DycqZmwI.js","/assets/CommentsModal-DkT1tA1w.js","/assets/ComparisonTable-BKaailHJ.js","/assets/Concerns-D45nMUiB.js","/assets/ConfirmDialog-BBMCG0pG.js","/assets/Daily-DJYolWgv.js","/assets/DataTable-N2ENajg7.js","/assets/DateRangePicker-BZQ-_3xH.js","/assets/DayReportView-DyANMYsq.js","/assets/DayStepper-CRsL-XDs.js","/assets/DifferenceBreakdown-zqxROyuB.js","/assets/Downtime-CJeEU3WH.js","/assets/Education-BJa7-Gtj.js","/assets/EducationLesson-ZzvmDO41.js","/assets/EmptyState-BWkeSt0Z.js","/assets/Exam-DT0z6-ch.js","/assets/FactorySelect-WAWe-ari.js","/assets/Gamification-eyYZDgZP.js","/assets/GroupBadge-CDZIw_YA.js","/assets/HeatmapChart-BUsV8iGd.js","/assets/IdleCell-B1000WjK.js","/assets/KPICard-Bq9ex9a6.js","/assets/Kaizen-Bft3d0Sl.js","/assets/Kelish-AxVcE7mY.js","/assets/KpiDeltaCard-BwilQnxd.js","/assets/LangTextInput-BJWTwVsg.js","/assets/Layout-C6Tju1rW.js","/assets/LeaderAppeal-p8lTpru1.js","/assets/LeaderDayReport-B-9DRT2z.js","/assets/LeaderUnitReport-DNb01_Wf.js","/assets/Leaderboard-ivqVd12U.js","/assets/Leaders-Bhq7lw1N.js","/assets/Lightbox-EQhZbdJD.js","/assets/LiveOverview-tsjAFhPo.js","/assets/Login-C5CiJleW.js","/assets/NotFound-CVZxJ3G-.js","/assets/Notifications-3vsEXMPr.js","/assets/Overview-C65HGsVr.js","/assets/Pagination-v0twEx7d.js","/assets/PerenaladkaFactTable-BtSjAE1-.js","/assets/PersonCard-B4vxP1GA.js","/assets/PlanFulfillment-BbworJ59.js","/assets/Production-CWXhSUzh.js","/assets/Profile-DcvtTa20.js","/assets/ProofCamera-dM-2ha-q.js","/assets/ProofPhoto-CM1ibDtu.js","/assets/Quality-DyziDVhB.js","/assets/RawRows-BnXP_RJt.js","/assets/RequestStateChip-DNJZ3SFW.js","/assets/RichTextEditor-BuV40mVS.js","/assets/SaveState-BAYKWW2j.js","/assets/SearchInput-CJHatPJo.js","/assets/SeasonalityHeatmap-PRz7SFo3.js","/assets/SegmentedToggle-BScn0ol5.js","/assets/SetupTimes-BThTWbxY.js","/assets/ShiftDaily-DVO3XVvP.js","/assets/Staff-CzQILFIM.js","/assets/StaffLive-Bk3Drcis.js","/assets/StatusBadge-CU43c0hW.js","/assets/TargetGoal-CZpUp4fl.js","/assets/Targets-7NxjxXJX.js","/assets/Tasks-01gQXAhn.js","/assets/TimeWheelPicker-CRsGJlR_.js","/assets/Toast-BOPmZH8Z.js","/assets/Tooltip-DPDoSGDn.js","/assets/TrendChart-CUmPjgRX.js","/assets/TripleSpeedometer-BWq8N65U.js","/assets/Trudoyomkost-WAcA_gK3.js","/assets/UploadDropzone-B4oXxyL3.js","/assets/UsersActivity-B2-bSyqE.js","/assets/VerdictBlock-v1tbfGRl.js","/assets/VfxApiMap-DFNKUuc6.js","/assets/VfxEmployees-pdmRhb7N.js","/assets/VfxJobs-vaKoO6H4.js","/assets/VfxMarks-DS9Y_FpV.js","/assets/VfxOnSite-Beu5T9_N.js","/assets/VfxPhoto-IL5i2h4I.js","/assets/VfxState-R48GtoKY.js","/assets/VfxStructure-BGHra17N.js","/assets/VfxTable-BUYF4f-R.js","/assets/VfxTimesheet-BfQvqiwq.js","/assets/WatchProgress-CxzUaTuP.js","/assets/WebLogin-Cs_eZWJV.js","/assets/WorkerConcerns-lY0e3nzG.js","/assets/Workers-DY7MGiEN.js","/assets/Zagruzka-Kw6mZSXV.js","/assets/ZagruzkaCell-5HvwUO2j.js","/assets/api-DKe1YNZ1.js","/assets/archive-CGxk4aWB.js","/assets/archive-restore-WJZRneOq.js","/assets/arrow-down-DV-Ok0Ik.js","/assets/arrow-left-b08mapnK.js","/assets/arrow-right-left-Bz6DPJdM.js","/assets/arrow-up-Btmy9j5_.js","/assets/arrow-up-narrow-wide-Dj8feG8p.js","/assets/arrow-up-right-DuuMu_5m.js","/assets/award-Dkdit2RZ.js","/assets/ban-BRsfyCPC.js","/assets/bot-C7N16ae4.js","/assets/boxes-CrnEXymI.js","/assets/braces-N97WkAEM.js","/assets/brigadirFilters-DE27pWyE.js","/assets/broadcastTree-BDh4O550.js","/assets/building-2-B3VUniPC.js","/assets/calendar-BCVM50RX.js","/assets/calendar-days-64hPvNVx.js","/assets/camera-DjPd1SIo.js","/assets/categories-B815pMxz.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-y3EWzLLD.js","/assets/chart-line-BwJiqLqC.js","/assets/chart-pie-BlNG8XjY.js","/assets/chartRange-Cr5B9m7N.js","/assets/chevron-left-BjhDdU3S.js","/assets/chevrons-up-down-DjPYV7__.js","/assets/circle-CZPlA91E.js","/assets/circle-alert-BtdQJ3wP.js","/assets/circle-check-big-BRv-vza1.js","/assets/circle-dashed-DScnzCVg.js","/assets/circle-minus-xZOAIP0a.js","/assets/circle-question-mark-BkIExOud.js","/assets/circle-slash-DlAEAbPz.js","/assets/circle-user-round-C-BWbaPU.js","/assets/clock-3-B39kDaRg.js","/assets/cloud-off-Baz5wXoM.js","/assets/cloud-upload-Bf5W9pHP.js","/assets/compass-Do0O1F-m.js","/assets/concernCategories-cTNGp57N.js","/assets/copy-CqaCtRVk.js","/assets/corner-down-right-DrpkXyy1.js","/assets/createLucideIcon-vdngdFff.js","/assets/door-open-C9QaSmft.js","/assets/es-BzUllhuX.js","/assets/exportXlsx-CI4g5T-A.js","/assets/external-link-Cz7ryv2m.js","/assets/file-clock-kAqKEPq6.js","/assets/file-exclamation-point-D_85Cb2Z.js","/assets/file-spreadsheet-BvuxU74t.js","/assets/file-text-BumGSyEn.js","/assets/flag-BCpWvVyR.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Dm_BbDw7.js","/assets/hash-CXAsQOPa.js","/assets/history-C9xBHg1n.js","/assets/hourglass-BC9rD9__.js","/assets/image-Bsw6yIQr.js","/assets/image-off-_ejwjbrS.js","/assets/inbox-bi5ls3iK.js","/assets/index-BmfDVCPF.css","/assets/index-DNZu0XVD.js","/assets/key-round-772QOtih.js","/assets/keyboard-MMBdoVsN.js","/assets/languages-QIW8cELt.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CjQj5fLB.js","/assets/lightbulb--rsr4r8S.js","/assets/link-2-BtPfhnzi.js","/assets/link-2-off-CToGrSNL.js","/assets/list-ordered-CE1tOgdi.js","/assets/list-tree-DXrVm5-B.js","/assets/lock-open-X6AgbShS.js","/assets/log-in-DutoB94O.js","/assets/maximize-2-ttdN2hej.js","/assets/message-square-PpVZQaPf.js","/assets/minimize-2-CbtRGuMn.js","/assets/package-check-CaKd3KWi.js","/assets/paperclip-CYGXVLnT.js","/assets/pencil-BpUJY0iZ.js","/assets/percent-BXnidWjd.js","/assets/phone-BdQFDIDR.js","/assets/pin-BSs8woYM.js","/assets/pin-off-D0zhumyL.js","/assets/play-CGH0ZqiN.js","/assets/plug-zap-C7dBlvVg.js","/assets/presentation-DfpqMju8.js","/assets/prop-types-B-oNpZes.js","/assets/radio-DWQiVJN9.js","/assets/react-apexcharts.esm-n3jXXtjA.js","/assets/repeat-pzxSCV60.js","/assets/rotate-ccw-D88cW3-q.js","/assets/rotate-cw-CGvapREQ.js","/assets/save-DB_8tIL6.js","/assets/scopeLinks-DjELpBdI.js","/assets/scroll-text-DFENxRci.js","/assets/search-x-D7EzAaK-.js","/assets/segments-CQQ7iAgC.js","/assets/send-7fhZqNz4.js","/assets/settings-2-RE_1qYAy.js","/assets/shield-BPPl_U7M.js","/assets/shield-alert-WuX27zZo.js","/assets/shield-check-Cpz6J1_m.js","/assets/shield-question-mark-V1I6Y1Gz.js","/assets/siren-SIG_2Nir.js","/assets/snowflake-5gTDrv7h.js","/assets/split-BBX2xddT.js","/assets/square-B8fzRvQP.js","/assets/square-check-big-CLXtIh_d.js","/assets/star-BxnmxLlQ.js","/assets/statusBands-CcLr77se.js","/assets/store--nHLDS0r.js","/assets/table-2-CpsQMaSg.js","/assets/table-properties-BU3huWCi.js","/assets/tag-D4rVv1iV.js","/assets/timer-off-CkWgySdh.js","/assets/trending-down-Ci1CexCK.js","/assets/trending-up-CYWjxm1c.js","/assets/undo-2-CBsfHi7S.js","/assets/useChartTheme-BzVxJvlf.js","/assets/useElementWidth-CHNB62Ww.js","/assets/useIsMobile-B6n62jr8.js","/assets/useOpenParam-DyUdRQGX.js","/assets/useStatusBands-BsTsQA5e.js","/assets/useUrlScope-BWJt7G-h.js","/assets/user-BdnjHSBL.js","/assets/user-cog-CV10fEUC.js","/assets/user-minus-CZHFj18g.js","/assets/users-CN_qW7E2.js","/assets/video-BrYXZBoz.js","/assets/wallet-CSJ5sWNY.js","/assets/warehouse-CwwEUnPy.js","/assets/x-CxHbdxqA.js","/assets/zap-Dqkoqncc.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
