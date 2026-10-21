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

const BUILD = "2026-10-21T06:36:22.747Z";
const PRECACHE = ["/","/assets/AdminPanel-B48ctgFl.js","/assets/AnalysisBoard-VrsyRaZY.js","/assets/Arc-B-j_ycjx.js","/assets/Assistant-D6v2WNyX.js","/assets/BrigadirProfile-4kOt_WQj.js","/assets/BroadcastReceivers-Eo52ufhv.js","/assets/BroadcastRecord-xK4xCnUX.js","/assets/Button-Dpxk6Zn_.js","/assets/CatLockNotice-B-2I3I37.js","/assets/CategoryLegendModal-B1DeV-Bm.js","/assets/CellConcerns-C2dko5ca.js","/assets/CellDetails-D8IHQ0tV.js","/assets/CellFormModal-Dy-eMFrg.js","/assets/CellIdent-hLK6a1v4.js","/assets/CellLink-Chvj4NeK.js","/assets/Cells-DGDFzuxV.js","/assets/ColumnFilter-DZT2WrjK.js","/assets/ColumnsPicker-D36aEFSS.js","/assets/CommentsModal-Qlqpw6JA.js","/assets/ComparisonTable-BeLxEJ6h.js","/assets/Concerns-BxffwyHn.js","/assets/CountStepper-DJ0VUZq8.js","/assets/Daily-DUfI9Iay.js","/assets/DataTable-MjAVAvHw.js","/assets/DateRangePicker--F2Qsm1s.js","/assets/DayReportView-DU0oFhYR.js","/assets/DayStepper-D4a3JGDe.js","/assets/DayStrip-_Y3sgBNi.js","/assets/DifferenceBreakdown-_pG66oKy.js","/assets/Downtime-CEz8qgp5.js","/assets/Education-C1KXjjia.js","/assets/EducationLesson-DIyA0AJQ.js","/assets/EmptyState-9fjeHplI.js","/assets/Exam-C4BzX0U3.js","/assets/FactorySelect-Dj70vOKr.js","/assets/Gamification-BrQYIoT6.js","/assets/GroupBadge-BBrhT7so.js","/assets/HeatmapChart-C94wA2Zg.js","/assets/IdleCell-DemF9bcB.js","/assets/KPICard-a6fCCwwa.js","/assets/Kaizen-CcbfVFuL.js","/assets/Kelish-BupmGGng.js","/assets/KpiDeltaCard-D1mLx6jr.js","/assets/LangTextInput-Ct5ixZke.js","/assets/Layout-DGP-OYbH.js","/assets/LeaderAppeal-DU_o-BgR.js","/assets/LeaderDayReport-CxLFo830.js","/assets/LeaderUnitReport-D8O69fI2.js","/assets/Leaderboard-DibuN1t1.js","/assets/Leaders-DqgxMh4b.js","/assets/LeadersKpi-DkO5JLcT.js","/assets/Lightbox-CYxn4keS.js","/assets/LiveOverview-iRtBBmPo.js","/assets/Login-BHpruWN6.js","/assets/NotFound-Bj1YspgZ.js","/assets/Notifications-Dmlr1kEJ.js","/assets/Ontime-BLcHnaOv.js","/assets/Overview-DlwPUmhS.js","/assets/Pagination-ZixWJtLK.js","/assets/PerenaladkaFactTable-C-PhuhtG.js","/assets/PersonCard-o-y-ppSN.js","/assets/PlanFulfillment-CTC_nwiJ.js","/assets/Production-BQEHziin.js","/assets/Profile-BckVNbWt.js","/assets/ProofCamera-BRD08_K-.js","/assets/ProofPhoto-DDEBH1fK.js","/assets/Quality-CDeQCqKn.js","/assets/RawRows-j2Hfr84p.js","/assets/RequestStateChip-6Vb1cxzF.js","/assets/RichTextEditor-CfUcSmB0.js","/assets/SaveState-BwknxuSS.js","/assets/SearchInput-BXaGEFMN.js","/assets/SeasonalityHeatmap-Cldh_-ZT.js","/assets/SegmentedToggle-BRYEj5yO.js","/assets/SetupTimes-BK3waQ-O.js","/assets/ShiftDaily-lVnsraY-.js","/assets/Staff-BLiRHH5j.js","/assets/StaffListAtCheck-DgGrlLgk.js","/assets/StatusBadge-B_HcmqSB.js","/assets/StatusBandsModal-XEx_lj-L.js","/assets/TargetGoal-DT0F5pGa.js","/assets/Targets-DE4ssAkZ.js","/assets/Tasks-AcL-6X73.js","/assets/TimeWheelPicker-DNHakc7S.js","/assets/Toast-B3pBf3sA.js","/assets/Tooltip-D6SjHd7C.js","/assets/TrendChart-BUk8F_Jw.js","/assets/TripleSpeedometer-Dbe8XqP5.js","/assets/Trudoyomkost-BAuxvGlq.js","/assets/UploadDropzone-C3p_E1G7.js","/assets/UsersActivity-CVsorcT0.js","/assets/VerdictBlock-Dxf7hVfB.js","/assets/VfxApiMap-BucfsuEj.js","/assets/VfxDictionaries-zAGuE7vw.js","/assets/VfxEmployees-B6v7uXhe.js","/assets/VfxHrMoves-DWMXwBKi.js","/assets/VfxJobs-BhM9qKIn.js","/assets/VfxPhoto-DADbMi4t.js","/assets/VfxShifts-CpPdbeGw.js","/assets/VfxState-BsYGcryR.js","/assets/VfxTimebooks-Cdbpd_vS.js","/assets/VfxTimesheet-ctpnZj3L.js","/assets/WatchProgress-gvOSlV-7.js","/assets/WebLogin-j62b5sCY.js","/assets/Workers-DMvcUjlh.js","/assets/Zagruzka-DJLdjyB2.js","/assets/ZagruzkaCell-CGCD1jyU.js","/assets/api-CGsbT5Rg.js","/assets/archive-D7G0Grf8.js","/assets/archive-restore-DEih_WMe.js","/assets/arrow-down-C5rC3_aK.js","/assets/arrow-down-right-DwS9kjgR.js","/assets/arrow-down-wide-narrow-c4aAWwZZ.js","/assets/arrow-up-narrow-wide-C4Z_Bio8.js","/assets/ban-GezR7LQA.js","/assets/boxes-CVaW6kWj.js","/assets/braces-DXkYSDhN.js","/assets/brigadirFilters-D-2LHJzE.js","/assets/broadcastTree-B3EOXVvh.js","/assets/building-2-kxNJCbDk.js","/assets/calendar-3XPNC0Sv.js","/assets/calendar-days-DUqWWag6.js","/assets/camera-Qhj_2TY7.js","/assets/categories-CxQDafC4.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BFyzrIHs.js","/assets/chart-line-D3DapypH.js","/assets/chart-pie-DY7OvX8E.js","/assets/chartRange-BjCq9d7w.js","/assets/check-check-c8TgEtT5.js","/assets/chevron-left-BtX9gVVR.js","/assets/chevrons-up-down-Cwm1A8-3.js","/assets/circle-CPS7t1QD.js","/assets/circle-alert-B2LoaWWK.js","/assets/circle-check-big-CAh1BsJQ.js","/assets/circle-dashed-DBpXujO-.js","/assets/circle-minus-vqHSeTej.js","/assets/circle-question-mark-IsEj2O6i.js","/assets/circle-slash-oqlBXWjU.js","/assets/circle-user-round-Bej5_oHm.js","/assets/cloud-off-BFWW3LbN.js","/assets/cloud-upload-BwQMXzQa.js","/assets/compass-Vf0S_98Z.js","/assets/concernCategories-qMHHK4DX.js","/assets/corner-down-right-C5oQ6h4O.js","/assets/createLucideIcon-CoZTwU0e.js","/assets/es-Ckh3pC61.js","/assets/external-link-DIy5l_D0.js","/assets/file-clock-BLvzg-68.js","/assets/file-exclamation-point-ZPhOqYxu.js","/assets/flag-BDtCT-LP.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-p3lyXGHD.js","/assets/funnel-DRxvjRo6.js","/assets/hash-CAJSe0A0.js","/assets/hourglass-BbreX7El.js","/assets/image-CCbMRevr.js","/assets/image-off-Bf7fATbD.js","/assets/inbox-DhOv7BQM.js","/assets/index-CPKQGmT1.js","/assets/index-DLT_vDJq.css","/assets/keyboard-JnS5Biuu.js","/assets/languages-DH6rpkd1.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BkfslE75.js","/assets/lightbulb-D5xU68F5.js","/assets/link-2-lIDPe304.js","/assets/link-2-off-BVBh0lkj.js","/assets/list-ordered-LyWvrW_y.js","/assets/list-tree-DKvH-iL6.js","/assets/lock-open-DuRck6oQ.js","/assets/log-in-CbZYD87b.js","/assets/marks-Cc7g67mW.js","/assets/minimize-2-BD_zoNUT.js","/assets/package-check-B66qy44-.js","/assets/pencil-DkUKjyCN.js","/assets/percent-jWc7OxEK.js","/assets/pin-1SeysK-O.js","/assets/pin-off-Ccjq8DwG.js","/assets/play-Bzrv7UT8.js","/assets/plug-zap-CPqCySQk.js","/assets/prop-types-DMjg0Zca.js","/assets/radio-L0_B5P-p.js","/assets/react-apexcharts.esm-wBhHgI9I.js","/assets/registers-hvQ9lJNi.js","/assets/repeat-BwwWDB74.js","/assets/save-Crr6r3Jd.js","/assets/scopeLinks-Dm_D3ca4.js","/assets/scroll-text-BGJl1EiE.js","/assets/search-x-ClOuDECz.js","/assets/segments-i2HdS9i-.js","/assets/send-Rnx9TCML.js","/assets/settings-2-WvkeGdRc.js","/assets/shield-C5trV6s7.js","/assets/shield-alert-BVxCecMn.js","/assets/shield-question-mark-TAmByXkt.js","/assets/sigma-By63TTk1.js","/assets/siren-CnXacG6k.js","/assets/snowflake-1mZyp5Lc.js","/assets/split-Ds6gfueH.js","/assets/square-check-big-Y1cHOv6K.js","/assets/star-CM8q50tx.js","/assets/statusBands-C3N-b4R6.js","/assets/store-UXdhbJOr.js","/assets/table-2-DDg8mJTv.js","/assets/table-properties-DtMdEmRn.js","/assets/tag-Dr9QAgJo.js","/assets/timer-off-BOM8w0dU.js","/assets/trendBuckets-CEuWa6c7.js","/assets/trending-down-Ca8SU-lA.js","/assets/trending-up-DOnmKwWg.js","/assets/undo-2-B3NdaIvv.js","/assets/useChartTheme-BBVkBfJG.js","/assets/useElementWidth-DUWPkTZk.js","/assets/useIsMobile-Bs11vG5Z.js","/assets/useOpenParam-Dz5GO8z0.js","/assets/useStatusBands-BqnuQUoV.js","/assets/useUrlScope-CYPDOFXK.js","/assets/user-BU6h_lRV.js","/assets/user-cog-BGFw8brj.js","/assets/user-minus-CXPU9IaK.js","/assets/users-BcmJQAOa.js","/assets/vfx-dGZyG8Qb.js","/assets/video-Bb7qMf2K.js","/assets/wallet-0Wn1s8Tj.js","/assets/warehouse-CSk-umc1.js","/assets/workflow-3S0GiAvO.js","/assets/x-CSTS2u8i.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
