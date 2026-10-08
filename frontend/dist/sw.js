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

const BUILD = "2026-10-08T04:32:42.107Z";
const PRECACHE = ["/","/assets/AdminPanel-BQqwHFwP.js","/assets/AnalysisBoard-CA2_r0Ac.js","/assets/Arc-XHG5CWnd.js","/assets/Assistant-BrMVZ_uL.js","/assets/BrigadirProfile-nOU5SoCt.js","/assets/BroadcastReceivers-CwsPtLYv.js","/assets/BroadcastRecord-Btl_uns7.js","/assets/Button-DzUmNnjv.js","/assets/CatLockNotice-0FwFaetO.js","/assets/CategoryLegendModal-C2hEUorJ.js","/assets/CellConcerns-BgLO0fX7.js","/assets/CellDetails-B_ETJqPX.js","/assets/CellFormModal-Cy3DJRCo.js","/assets/CellIdent-Cn8jUOvW.js","/assets/CellLink-OFBf7iCk.js","/assets/Cells-CZOhQIrS.js","/assets/ColumnFilter-BMaaAMxc.js","/assets/ColumnsPicker-DsW53qnJ.js","/assets/CommentsModal-C0tc56bm.js","/assets/ComparisonTable-B1YlpHYk.js","/assets/Concerns-CbD43jEz.js","/assets/Daily-DVY0jmV_.js","/assets/DataTable-DHkmVwaq.js","/assets/DateRangePicker-CcJvvgIN.js","/assets/DayReportView-CxCF94Z2.js","/assets/DayStepper-BBt9uLaR.js","/assets/DifferenceBreakdown-gQwpoXE4.js","/assets/Downtime-Z4st4heF.js","/assets/Education-BoCsl84A.js","/assets/EducationLesson-Be2coATI.js","/assets/EmptyState-BaclRC_V.js","/assets/Exam-DThIrPBe.js","/assets/FactorySelect-CH3vpaIb.js","/assets/Gamification-YQvwGpU4.js","/assets/GroupBadge-C4sQgC3I.js","/assets/HeatmapChart-C7Zlns3C.js","/assets/IdleCell-CvupDS73.js","/assets/KPICard-BZcHrzxk.js","/assets/Kaizen-CuDnGk-K.js","/assets/Kelish-Bs-9IMmm.js","/assets/KpiDeltaCard-CL8nGiqr.js","/assets/LangTextInput-CUjYynfK.js","/assets/Layout-3yqesIkV.js","/assets/LeaderAppeal-DLQkGGlp.js","/assets/LeaderDayReport-70UjNkrh.js","/assets/LeaderUnitReport-C1Ht3YAP.js","/assets/Leaderboard-BApTLTH3.js","/assets/Leaders-DLMVjJ08.js","/assets/Lightbox-CCyu0gnp.js","/assets/LiveOverview-vf-vwDbQ.js","/assets/Login-CSl4emj4.js","/assets/NotFound-SJAlfpl9.js","/assets/Notifications-CfS22izX.js","/assets/Overview-BqzZwMXY.js","/assets/Pagination-CT046UeR.js","/assets/PerenaladkaFactTable-Dq2cgTML.js","/assets/PersonCard-BY6Mkj9D.js","/assets/PlanFulfillment-lF0IrkQr.js","/assets/Production-BivN6VmI.js","/assets/Profile-GET0zBQh.js","/assets/ProofCamera-CEJ5eX6M.js","/assets/ProofPhoto-D5NrLpEJ.js","/assets/Quality-D_TavxWZ.js","/assets/RawRows-CcXVujM9.js","/assets/RequestStateChip-r_sxj50i.js","/assets/RichTextEditor-CaAvWfXc.js","/assets/SaveState-C-EjVVgh.js","/assets/SearchInput-Dox34xjO.js","/assets/SeasonalityHeatmap-iurambM4.js","/assets/SegmentedToggle-cMDfUgUG.js","/assets/SetupTimes-D1YfGOHw.js","/assets/ShiftDaily-BOr_XJbu.js","/assets/Staff-DUOSzqBU.js","/assets/StatusBadge-DHEvk3qh.js","/assets/TargetGoal-VKyadfp_.js","/assets/Targets-Bysh8OuI.js","/assets/Tasks-pmRhqWDD.js","/assets/TimeWheelPicker-Kdty1PU1.js","/assets/Toast-CLgZ-5ef.js","/assets/Tooltip-DMmvZt36.js","/assets/TrendChart-DKHpq7qg.js","/assets/TripleSpeedometer-BY-x7EWT.js","/assets/Trudoyomkost-BavJtlp3.js","/assets/Turnover-DrMsC2oo.js","/assets/UploadDropzone-tTNhipZy.js","/assets/UsersActivity-D70wtXtd.js","/assets/VerdictBlock-CPQjLs6H.js","/assets/VfxApiMap-R6oxV-Zp.js","/assets/VfxDictionaries-ByJiBcu-.js","/assets/VfxEmployees-D3_kNBZA.js","/assets/VfxHrMoves-ocYSqmuK.js","/assets/VfxJobs-Brmfu2Gv.js","/assets/VfxPhoto-B7z4ZadQ.js","/assets/VfxShifts-DcYgBXyG.js","/assets/VfxState-DsI1ez0e.js","/assets/VfxTimebooks-Dz3HKQtG.js","/assets/VfxTimesheet-CUbfvcGr.js","/assets/WatchProgress-DpLL80b2.js","/assets/WebLogin-BZEYMKYx.js","/assets/WorkerConcerns-B15po-NQ.js","/assets/Workers-CJVlIvDw.js","/assets/Zagruzka-D2SGy-7r.js","/assets/ZagruzkaCell-D_6sKjvs.js","/assets/api-BFpg2jbS.js","/assets/archive-DUa-R3aG.js","/assets/archive-restore-CSgF_h8f.js","/assets/arrow-down-QswQzQMF.js","/assets/arrow-up-narrow-wide-CxUdJy4a.js","/assets/award-DUpvLPtd.js","/assets/ban-DxQgSySV.js","/assets/boxes-CvJgR-tU.js","/assets/braces-C7-d_VRu.js","/assets/brigadirFilters-D96vJG1n.js","/assets/broadcastTree-B6Au_fyy.js","/assets/building-2-mUAs2cXU.js","/assets/calculator-Cgc8G5Uk.js","/assets/calendar-2ADBirji.js","/assets/calendar-days-2-QYomia.js","/assets/camera-D9sUwZvi.js","/assets/categories-D_yzf5gp.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C_tANGVZ.js","/assets/chart-line-COfGTQIJ.js","/assets/chart-pie-Drm3p2C3.js","/assets/chartRange-Bx8EOoe9.js","/assets/check-check-uqXS4lnD.js","/assets/chevron-left-DOTPDxmv.js","/assets/chevrons-up-down-Bp-cqal_.js","/assets/circle-BNK6Roig.js","/assets/circle-alert-tURrrfAl.js","/assets/circle-check-big-CZCXdqz1.js","/assets/circle-dashed-wdyPjQkC.js","/assets/circle-minus-BeELF0dz.js","/assets/circle-question-mark-BvY6M0D3.js","/assets/circle-slash-DKzQ75Ux.js","/assets/circle-user-round-X1CYJwpR.js","/assets/clock-3-D7AuLAMM.js","/assets/cloud-off-DC6Q16sG.js","/assets/cloud-upload-BXkIBwup.js","/assets/compass-PnEzaltA.js","/assets/concernCategories-Cd0V097E.js","/assets/copy-uquxSJzf.js","/assets/corner-down-right-Dbd5Cv_l.js","/assets/createLucideIcon-CqEB5w4w.js","/assets/es-BvD7aW7U.js","/assets/external-link-DBrUmNvY.js","/assets/file-clock-CPm_t1JP.js","/assets/file-exclamation-point-C1YpDkxv.js","/assets/flag-B6EJvgBr.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-2U9G3gMW.js","/assets/hash-CR5VDdFk.js","/assets/hourglass-DAvzsTb0.js","/assets/image-CkoLn5TS.js","/assets/image-off-BIkWlxPU.js","/assets/inbox-Dsg9lXK-.js","/assets/index-BPtIPqQj.js","/assets/index-Ck814gz0.css","/assets/keyboard-BophKbJe.js","/assets/languages-C0_yGz41.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Bmw7_ZTx.js","/assets/lightbulb-DHGuLyLG.js","/assets/link-2-C7fEMEWV.js","/assets/link-2-off-B0fzXErW.js","/assets/list-ordered-B-NgQi5T.js","/assets/list-tree-D6H99sEr.js","/assets/lock-open-RMH0MDgx.js","/assets/log-in-mbgkaSqi.js","/assets/minimize-2-vfcqlz1s.js","/assets/package-check-Cc94B0_D.js","/assets/pencil-BOUeVxf8.js","/assets/percent-OMsX-vCT.js","/assets/pin-BxnTDhuN.js","/assets/pin-off-DsXuoCma.js","/assets/play-DEW9iISr.js","/assets/plug-zap-BqvqMy-E.js","/assets/prop-types-jhv6uWEd.js","/assets/radio-CTR05UbB.js","/assets/react-apexcharts.esm-_AOpsK4A.js","/assets/registers-CGS7X5km.js","/assets/repeat-DTZqeBrp.js","/assets/save-BgD7hHZd.js","/assets/scopeLinks-CkrK2OJ3.js","/assets/scroll-text-CNod7gRn.js","/assets/search-x-C5f2FT3a.js","/assets/segments-DKgLBqhz.js","/assets/send-DNrZhl4Z.js","/assets/settings-2-DQbPIFYe.js","/assets/shield-BdxRpzs2.js","/assets/shield-alert-Cbf8ExZH.js","/assets/shield-question-mark-BGNnxzlH.js","/assets/siren-DlOVzZy4.js","/assets/snowflake-CKk4OYIB.js","/assets/split-Wag-_apJ.js","/assets/square-check-big-xGXz0rbx.js","/assets/star-BSwJUycz.js","/assets/statusBands-DWXXx_NF.js","/assets/store-NLAYfX0V.js","/assets/table-2-BQBJBGgC.js","/assets/table-properties-CxnBjZwL.js","/assets/tag-mGiAlJf5.js","/assets/timer-off-BNSuBQWp.js","/assets/trending-down-09r43Yfh.js","/assets/trending-up-uGoB6HHd.js","/assets/undo-2-DOmyO3bl.js","/assets/useChartTheme-jXqyDXwN.js","/assets/useElementWidth-CloeEARh.js","/assets/useIsMobile-Cpaib1fK.js","/assets/useOpenParam-CEEP1frK.js","/assets/useStatusBands-VzNc0QYK.js","/assets/useUrlScope-CHHaPfnP.js","/assets/user-B9-PK0QS.js","/assets/user-cog-BmJ8g_Gl.js","/assets/users-BrMUDJYN.js","/assets/vfx-CitC1y6c.js","/assets/video-BWhBS0YU.js","/assets/wallet-Cdc81pnr.js","/assets/warehouse-QE9z-p8u.js","/assets/x-BYQWsEPj.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
