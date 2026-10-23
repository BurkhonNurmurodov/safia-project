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

const BUILD = "2026-10-23T13:02:15.900Z";
const PRECACHE = ["/","/assets/AdminPanel-Dm4daCZq.js","/assets/AnalysisBoard-BSFAC6cR.js","/assets/Arc-7B_UqxS3.js","/assets/Assistant-CyGu0-9h.js","/assets/BrigadirProfile-DtkL8LYN.js","/assets/BroadcastReceivers-T3grjZU3.js","/assets/BroadcastRecord-B_UN-wbg.js","/assets/Button-_EE7Wd1j.js","/assets/CatLockNotice-DsAtojdw.js","/assets/CategoryLegendModal--M_rB5Ld.js","/assets/CellConcerns-CIRMI3go.js","/assets/CellDetails-CYvHql9r.js","/assets/CellFormModal-D9W5SX8H.js","/assets/CellIdent-dgDh2Sir.js","/assets/CellLink-DzeV43kq.js","/assets/Cells-UHvAwUlY.js","/assets/ColumnFilter-CJfaI71F.js","/assets/ColumnsPicker-B3Fpi-Wq.js","/assets/CommentsModal-DDyE_rFb.js","/assets/ComparisonTable-COf4DApL.js","/assets/Concerns-cnjpw8oW.js","/assets/CountStepper-C76DSE39.js","/assets/Daily-zw1nk2oE.js","/assets/DataTable-Bi4rIEaJ.js","/assets/DateRangePicker-Zo4M0tvo.js","/assets/DayReportView-BzUbYI2M.js","/assets/DayStepper-DeC0m7ep.js","/assets/DayStrip-AxewHIaV.js","/assets/DifferenceBreakdown-BE10VZVs.js","/assets/Downtime-DPoO77Zw.js","/assets/Education-BuIxnhTp.js","/assets/EducationLesson-K60Gv2_O.js","/assets/EmptyState-BGRm8e_o.js","/assets/Exam-76YbPtsG.js","/assets/FactorySelect-BYyrlrH7.js","/assets/Gamification-U9m9OSKk.js","/assets/GroupBadge-D17Yzzur.js","/assets/HeatmapChart-BDoLcAbA.js","/assets/IdleCell-BoVNXMi6.js","/assets/KPICard-BZj5QHNF.js","/assets/Kaizen-BzDWp79b.js","/assets/Kelish-Dy7LXNcV.js","/assets/KpiDeltaCard-B6zmRR9C.js","/assets/LangTextInput-C6AC26fc.js","/assets/Layout-B2J-W7VP.js","/assets/LeaderAppeal-CIfdZDru.js","/assets/LeaderDayReport-p4OtTi92.js","/assets/LeaderUnitReport-BXPNCw30.js","/assets/Leaderboard-3ZzLi9_t.js","/assets/Leaders-ChdVTcv1.js","/assets/LeadersKpi-DgCEuCB5.js","/assets/Lightbox-CbBDE-Hz.js","/assets/LiveOverview-CAPWJivc.js","/assets/Login-X0nvhaVN.js","/assets/NotFound-COgeznxG.js","/assets/Notifications-DfNiX0Uj.js","/assets/Ontime-CKXHV9gw.js","/assets/Overview-CbKlU37t.js","/assets/Pagination-CPWtGoUX.js","/assets/PerenaladkaFactTable-BYDvIJBm.js","/assets/PersonCard-Cief2iKU.js","/assets/PlanFulfillment-Dy7gTGds.js","/assets/Production-Gm374ny1.js","/assets/Profile-1pxWwu7l.js","/assets/ProofCamera-BmO5NjJ6.js","/assets/ProofPhoto-DVEZ8vGZ.js","/assets/Quality-BF4bpjgJ.js","/assets/RawRows-DLV6dhkb.js","/assets/RequestStateChip-DBV7_UNn.js","/assets/RichTextEditor-p2dD6XQG.js","/assets/SaveState-DHoqQweF.js","/assets/SearchInput-B1zRhjO2.js","/assets/SeasonalityHeatmap-Djv3Cq7k.js","/assets/SegmentedToggle-BGTbCmMT.js","/assets/SetupTimes-BHnd1YSC.js","/assets/ShiftDaily-BUVs2tpe.js","/assets/Staff-DCz9I_qK.js","/assets/StaffListAtCheck-Cad3-gFl.js","/assets/StatusBadge-C1PH7yYw.js","/assets/StatusBandsModal-Cvz5diVw.js","/assets/TargetGoal-DldGW9os.js","/assets/Targets-CPRTyA_k.js","/assets/Tasks-DkEWMLSz.js","/assets/TimeWheelPicker-BqIakEY8.js","/assets/Toast-5vn2HPax.js","/assets/Tooltip-DKSwzkBB.js","/assets/TrendChart-B1ZVYiWM.js","/assets/TripleSpeedometer-YNkK-I-d.js","/assets/Trudoyomkost-DqsWrB9L.js","/assets/UploadDropzone-BF6PQGge.js","/assets/UsersActivity-CIwCURA4.js","/assets/VerdictBlock-C9kqsKv4.js","/assets/VfxApiMap-CRpzSTGj.js","/assets/VfxDictionaries-DXrZbx1m.js","/assets/VfxEmployees-zRY041Z5.js","/assets/VfxHrMoves-BIRsO2hW.js","/assets/VfxJobs-BKtQESwe.js","/assets/VfxPhoto-B0vFwU47.js","/assets/VfxShifts-Ce0E-fL1.js","/assets/VfxState-9GTQW5PU.js","/assets/VfxTimebooks-BXo0R5aY.js","/assets/VfxTimesheet-BydNcTTv.js","/assets/WatchProgress-Cu1z9MEv.js","/assets/WebLogin-BpqNr2MQ.js","/assets/Workers-dGBAVvGt.js","/assets/Zagruzka-CLt2rCCN.js","/assets/ZagruzkaCell-0Rx5Fuye.js","/assets/api-Dse40mFP.js","/assets/archive-BiEg8XpG.js","/assets/archive-restore-CM0JASuD.js","/assets/arrow-down-CugJQwOe.js","/assets/arrow-down-right-BHXd7WyQ.js","/assets/arrow-down-wide-narrow-dMj2yFK0.js","/assets/arrow-up-narrow-wide-aCJJTKkg.js","/assets/ban-CiNQbqRs.js","/assets/boxes-CKptZLaU.js","/assets/braces-DW7qWbUJ.js","/assets/brigadirFilters-BJ2KCBTO.js","/assets/broadcastTree-DcxGRYeI.js","/assets/building-2-DDSAfGp2.js","/assets/calendar-D_BgZm3h.js","/assets/calendar-days-ATmYCEDt.js","/assets/camera-nfnJT8Cv.js","/assets/categories-BUvOUcmz.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BtdSaGZP.js","/assets/chart-line-BJoCz9z_.js","/assets/chart-pie-CUOV_Tkv.js","/assets/chartRange-BB3Sj61d.js","/assets/check-check-D5Wbs6WY.js","/assets/chevron-left-Qry1iX3K.js","/assets/chevrons-up-down-Y-hUqvlR.js","/assets/circle-BaTj5LB0.js","/assets/circle-alert-DVlF_Hf2.js","/assets/circle-check-big-DYfvXF1f.js","/assets/circle-dashed-CDMPBlPu.js","/assets/circle-minus-DZVfGPYK.js","/assets/circle-question-mark-Yp0wzn4Y.js","/assets/circle-slash-DSJJvBZY.js","/assets/circle-user-round-CzzpK4PW.js","/assets/cloud-off-Bf1LZS7Q.js","/assets/cloud-upload-B9TLA2mW.js","/assets/compass-DQ94fF3W.js","/assets/concernCategories-rQkrbFx4.js","/assets/corner-down-right-BhXv7GM7.js","/assets/createLucideIcon-D_JSwVhi.js","/assets/es-DYEJjs_t.js","/assets/external-link-BmGGE7qD.js","/assets/file-clock-DJzo27_k.js","/assets/file-exclamation-point-eQeCncfb.js","/assets/flag-D7qKtXNK.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Dly-or59.js","/assets/funnel-Bdx0_iID.js","/assets/hash-BTup5QDJ.js","/assets/hourglass-B0nj-HAW.js","/assets/image-ClIW7tWa.js","/assets/image-off-8-gZ7Bd0.js","/assets/inbox-vtQOC-cS.js","/assets/index-DFvJry-Q.css","/assets/index-Di3_xrnn.js","/assets/keyboard-C775ZOfe.js","/assets/languages-jKlPJW2L.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-D05nO01s.js","/assets/leaderBoard-BdYeff3D.js","/assets/lightbulb-CB1ivgae.js","/assets/link-2-nl1VLlLw.js","/assets/link-2-off-Bsm-1x1L.js","/assets/list-ordered-BzW6o3DT.js","/assets/list-tree-DRq5KPZJ.js","/assets/lock-open-39ULNIgN.js","/assets/log-in-B43uptF9.js","/assets/map-pin-CJKlVPXj.js","/assets/marks-BIGRPtnp.js","/assets/minimize-2-CFRm4iSX.js","/assets/package-check-CMdVnFEb.js","/assets/pencil-Zk6wz9eZ.js","/assets/percent-DPNfa9Yd.js","/assets/pin-bWLONSlB.js","/assets/pin-off-QUUCAVSc.js","/assets/play-DHZF2eqU.js","/assets/plug-zap-BPcYre3R.js","/assets/prop-types-T7n2g9xf.js","/assets/radio-viOkdv0C.js","/assets/react-apexcharts.esm-DlasQHRw.js","/assets/registers-CsuZ_NIe.js","/assets/repeat-Bnq2nsPD.js","/assets/save-DtMKhHg3.js","/assets/scopeLinks-CI7D-EqD.js","/assets/scroll-text-BnwizxFS.js","/assets/search-x-BDqDbOnZ.js","/assets/segments-Ceyrx15A.js","/assets/send-CLjaz_dh.js","/assets/settings-2-Bbz8y8jG.js","/assets/shield-C8dKq59o.js","/assets/shield-alert-BwQUCOqL.js","/assets/shield-question-mark-_LVtnXmG.js","/assets/sigma-BLU3Jo6W.js","/assets/siren-XZgoNFl5.js","/assets/snowflake-1LTMnEjp.js","/assets/split-DZsPypWM.js","/assets/square-check-big-D9maxxdu.js","/assets/star-DPiJ2T_K.js","/assets/statusBands-Dqn4cF-U.js","/assets/store-DoLwlCZH.js","/assets/table-2-CDFyegYa.js","/assets/table-properties-Ctkkg5gl.js","/assets/tag-DKPMFonk.js","/assets/timer-off-qL0AW98w.js","/assets/trendBuckets-C0fOf-T9.js","/assets/trending-down-BNANCQne.js","/assets/trending-up-D3_ZDgcy.js","/assets/undo-2-TZM2JXaW.js","/assets/useChartTheme-BV9MZ5Cq.js","/assets/useElementWidth-C9C99tFu.js","/assets/useIsMobile-BtnT4O-C.js","/assets/useOpenParam-Br2Up93W.js","/assets/useStatusBands-DeHOE0Bc.js","/assets/useUrlScope-C5hyqC7D.js","/assets/user-cog-BKqgbb3l.js","/assets/user-minus-DBRKx8xO.js","/assets/user-qvNTRoHM.js","/assets/users-CzwFb0GH.js","/assets/vfx-CNKpkjXb.js","/assets/video-BDkgrIP_.js","/assets/wallet-C8Bq8Yic.js","/assets/warehouse-DXZtX5HA.js","/assets/workflow-C9nupsX8.js","/assets/x-Du9bYWkL.js","/assets/zap-DeVdJ4Su.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
