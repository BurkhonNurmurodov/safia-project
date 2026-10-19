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

const BUILD = "2026-10-19T08:10:59.478Z";
const PRECACHE = ["/","/assets/AdminPanel-CerGpg3k.js","/assets/AnalysisBoard-Dayooc_U.js","/assets/Arc-CC-MF6cw.js","/assets/Assistant-Csx8qsiY.js","/assets/BrigadirProfile-Cm4o_WqL.js","/assets/BroadcastReceivers-D06Bpq7g.js","/assets/BroadcastRecord-Cqec3FuJ.js","/assets/Button-BwSE0Vlo.js","/assets/CatLockNotice-B6Xrpqhy.js","/assets/CategoryLegendModal-CKuSlvnz.js","/assets/CellConcerns-D4pNto_h.js","/assets/CellDetails-BXL-quQY.js","/assets/CellFormModal-Be70E9Dj.js","/assets/CellIdent-CVuI2KId.js","/assets/CellLink-VnoWm0KQ.js","/assets/Cells-CduNB1cP.js","/assets/ColumnFilter-CH9vEKW0.js","/assets/ColumnsPicker-BEdH1hKI.js","/assets/CommentsModal-BovivXDO.js","/assets/ComparisonTable-BIe7UULu.js","/assets/Concerns-CBPt5aI-.js","/assets/CountStepper-BvmLnDTf.js","/assets/Daily-0TSj4T15.js","/assets/DataTable-Kcnpr-PW.js","/assets/DateRangePicker-CDWjuIWH.js","/assets/DayReportView-Drk71KA-.js","/assets/DayStepper-BMNogWc6.js","/assets/DifferenceBreakdown-DhcheRco.js","/assets/Downtime-BFrHqiID.js","/assets/Education-zU7BNiy5.js","/assets/EducationLesson-VRdfWQYC.js","/assets/EmptyState-B85gKrS5.js","/assets/Exam-DYTgaaJB.js","/assets/FactorySelect-Cc6aXb19.js","/assets/Gamification-B_W8D6qf.js","/assets/GroupBadge-Cifz1sH5.js","/assets/HeatmapChart-Cm8CkRs-.js","/assets/IdleCell-qCroMT4v.js","/assets/KPICard-ARwUjWaB.js","/assets/Kaizen-CatxKNXk.js","/assets/Kelish-Br4ZyZjh.js","/assets/KpiDeltaCard-CTigd0M-.js","/assets/LangTextInput-BdWuH6Ma.js","/assets/Layout-CLhLuuM_.js","/assets/LeaderAppeal-DgdT7YW0.js","/assets/LeaderDayReport-EMeWmEhC.js","/assets/LeaderUnitReport-CbWvmH8u.js","/assets/Leaderboard-r-0GXIrC.js","/assets/Leaders-DZwB1v8v.js","/assets/LeadersKpi-B6IGt6Zb.js","/assets/Lightbox-Cmo4tpip.js","/assets/LiveOverview-C58RXWRc.js","/assets/Login-DEC4sXbE.js","/assets/NotFound-B7lvwrwV.js","/assets/Notifications-BWwJbZWL.js","/assets/Overview-jNwDgSBR.js","/assets/Pagination-BWaeQGGn.js","/assets/PerenaladkaFactTable-uBZqiUy8.js","/assets/PersonCard-CHw4N-JR.js","/assets/PlanFulfillment-DeeMpNU2.js","/assets/Production-Cp0Pl3UX.js","/assets/Profile-CmgbNpoW.js","/assets/ProofCamera-B1cwe7xG.js","/assets/ProofPhoto-B09VuIPa.js","/assets/Quality-Cc4z5ZVn.js","/assets/RawRows-BC7sIE5K.js","/assets/RequestStateChip-BIX6RRsI.js","/assets/RichTextEditor-BvketZTs.js","/assets/SaveState-BRJlhB7H.js","/assets/SearchInput-B2Z54s5E.js","/assets/SeasonalityHeatmap-BR46eSa-.js","/assets/SegmentedToggle-Bbw4ddie.js","/assets/SetupTimes-Dee0COGU.js","/assets/ShiftDaily-B1QpN1hQ.js","/assets/Staff-CqLbQgRk.js","/assets/StaffListAtCheck-PxOCqXg2.js","/assets/StatusBadge-DllRAI-C.js","/assets/TargetGoal-DXu7HjOO.js","/assets/Targets-BjmTEh68.js","/assets/Tasks-DqUd_6hK.js","/assets/TimeWheelPicker-B5AD1hpi.js","/assets/Toast-3oBMYrMV.js","/assets/Tooltip-R9wTDDvu.js","/assets/TrendChart-Lf6zHhn0.js","/assets/TripleSpeedometer-DUkWh0Oi.js","/assets/Trudoyomkost-v_06HhSc.js","/assets/UploadDropzone-hKL3M7T8.js","/assets/UsersActivity-DrTuJwjT.js","/assets/VerdictBlock-f_IdmdlP.js","/assets/VfxApiMap-SXI-ezGY.js","/assets/VfxDictionaries-B_1w4KGd.js","/assets/VfxEmployees-hbT3YOd2.js","/assets/VfxHrMoves-N1Up9f-L.js","/assets/VfxJobs-D-nAXLJC.js","/assets/VfxPhoto-BhLqakTs.js","/assets/VfxShifts-BoZ9sPUC.js","/assets/VfxState-CgTssq1p.js","/assets/VfxTimebooks-BnobrsfZ.js","/assets/VfxTimesheet-DWji7MHK.js","/assets/WatchProgress-DiCimKox.js","/assets/WebLogin-TmdskT4Y.js","/assets/Workers-Bmr5e9gO.js","/assets/Zagruzka-BnIpT5OB.js","/assets/ZagruzkaCell-C_wV-tz-.js","/assets/api-CB-qhdq9.js","/assets/archive-DB-OHMpq.js","/assets/archive-restore-B4QyguiA.js","/assets/arrow-down-CmIaE0D-.js","/assets/arrow-down-right-CGs2boIX.js","/assets/arrow-down-wide-narrow-COHCqqsE.js","/assets/arrow-up-narrow-wide-DOmDMu7_.js","/assets/ban-tXsXuZQP.js","/assets/boxes-B_IbhZ_-.js","/assets/braces-DMiqLiK3.js","/assets/brigadirFilters-BIC64_YY.js","/assets/broadcastTree-QkFTScI5.js","/assets/building-2-C5ZtfNPe.js","/assets/calculator-UQjiP2rL.js","/assets/calendar-days-BpGWrzYU.js","/assets/calendar-i1UXnXBg.js","/assets/camera-BoIKl5A4.js","/assets/categories-s8YqfBjD.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D8FEuad6.js","/assets/chart-line-70RniekG.js","/assets/chart-pie-BQLm0nsO.js","/assets/chartRange-BBXat52c.js","/assets/check-check-BgK6SUqK.js","/assets/chevron-left-BF_getbf.js","/assets/chevrons-up-down-BDh-VJVn.js","/assets/circle-CowEXfxC.js","/assets/circle-alert-AN4HDVSH.js","/assets/circle-check-big-DjMDopx8.js","/assets/circle-dashed-Ca9dvdSj.js","/assets/circle-minus-CXlbLe2-.js","/assets/circle-question-mark-BVW0jq6u.js","/assets/circle-slash-CR8Oplm4.js","/assets/circle-user-round-BXD0ShAX.js","/assets/cloud-off-CuW5KbRi.js","/assets/cloud-upload-D05uPpW8.js","/assets/compass-BExJmALB.js","/assets/concernCategories-BmAOdusj.js","/assets/corner-down-right-CuPUPpwa.js","/assets/createLucideIcon-B2qTMxlp.js","/assets/es-DhdP9YK4.js","/assets/external-link-Bfv_Khkl.js","/assets/file-clock-DEQy36N_.js","/assets/file-exclamation-point-FG3kFbSR.js","/assets/flag-Bsru_bFA.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CO3neYZZ.js","/assets/hash-Dl2BpyeR.js","/assets/hourglass-D-zICGDu.js","/assets/image-A1HNz2kQ.js","/assets/image-off-DipAkfZ5.js","/assets/inbox-DxrND9OU.js","/assets/index-DemTQruw.css","/assets/index-OrMjZacY.js","/assets/keyboard-NC-zlQu5.js","/assets/languages-4_2CQXTv.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BB9Ofh1N.js","/assets/lightbulb-Vd7ym1l9.js","/assets/link-2-o7zudXXF.js","/assets/link-2-off-D9T7ezuK.js","/assets/list-ordered-BeCJ71eN.js","/assets/list-tree-DWXhovew.js","/assets/lock-open-BkyxsNj4.js","/assets/log-in-p-klK8g8.js","/assets/marks-Sy2QLXLd.js","/assets/minimize-2-DNdAn7B9.js","/assets/package-check-AqMb_oTi.js","/assets/pencil-EwR2GnM2.js","/assets/percent-DJR5gimB.js","/assets/pin-BrcPUwTj.js","/assets/pin-off-BTtGwtph.js","/assets/play-Dgyu3wkM.js","/assets/plug-zap-D8s246HS.js","/assets/prop-types-CuoDLHBQ.js","/assets/radio-8D2xk01B.js","/assets/react-apexcharts.esm-95ZXsk4-.js","/assets/registers-DdGBcWbt.js","/assets/repeat-DRMdZPsg.js","/assets/save-NAJMLuML.js","/assets/scopeLinks-BdlV1_fW.js","/assets/scroll-text-Df-e7a0Y.js","/assets/search-x-gGuYtxFW.js","/assets/segments-O2vdB7Jg.js","/assets/send-C1hazwY9.js","/assets/settings-2-DgdL0835.js","/assets/shield-DLWqHh4b.js","/assets/shield-alert-DiTtmw7K.js","/assets/shield-question-mark-CYAWVJeH.js","/assets/siren-DPu28paK.js","/assets/snowflake-B3WKJv7r.js","/assets/split-7wRf4utR.js","/assets/square-check-big-DI7DqDVx.js","/assets/star-Dim-QP1l.js","/assets/statusBands-CB55VO3B.js","/assets/store-CbB_oS29.js","/assets/table-2-CR0RIBgV.js","/assets/table-properties-UdcPVngE.js","/assets/tag-6rP256m4.js","/assets/timer-off-C9CeeniG.js","/assets/trending-down-U5wdUAil.js","/assets/trending-up-lkSWSUYz.js","/assets/undo-2-VIsXk437.js","/assets/useChartTheme-8Pjz5pGG.js","/assets/useElementWidth-C-Ii3cjf.js","/assets/useIsMobile-5WueAtiZ.js","/assets/useOpenParam-ByphqeXs.js","/assets/useStatusBands-B0icllWl.js","/assets/useUrlScope-DbpppR5l.js","/assets/user-12ynUKA2.js","/assets/user-cog-B18TSOid.js","/assets/user-minus-DkPTSEqB.js","/assets/users-DhLj9ekU.js","/assets/vfx-9petutvf.js","/assets/video-C_x2oQAg.js","/assets/wallet-CoZw926p.js","/assets/warehouse-BB9zi4bA.js","/assets/workflow-WydBOBih.js","/assets/x-B7qBU0vU.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
