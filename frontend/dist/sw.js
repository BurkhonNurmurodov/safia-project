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

const BUILD = "2026-10-05T11:05:25.683Z";
const PRECACHE = ["/","/assets/AdminPanel-BMK5oE8l.js","/assets/AnalysisBoard-De9Og7mq.js","/assets/Arc-BThUvNnB.js","/assets/ArcAnalysis-D6pTpGp5.js","/assets/ArcLegacy-CqE68fJL.js","/assets/BrigadirProfile-DjmiGFHR.js","/assets/BroadcastReceivers-B8PTwHUh.js","/assets/BroadcastRecord-BafOdOuA.js","/assets/Button-KpV9QUju.js","/assets/CatLockNotice-Cf7fkK7T.js","/assets/CategoryLegendModal-CVwRuV4S.js","/assets/CellConcerns-B5JyvY12.js","/assets/CellDetails-C1dpNeqO.js","/assets/CellFormModal-CIepLgu4.js","/assets/CellIdent-D9UhixrM.js","/assets/CellLink-B3JqGBfe.js","/assets/Cells-BDJMgEYX.js","/assets/ColumnFilter-BttWgFa8.js","/assets/ColumnsPicker-BOnOJA3l.js","/assets/CommentsModal-Cqb1KihS.js","/assets/ComparisonTable-BWT9e8z9.js","/assets/Concerns-o4rT8wKX.js","/assets/Daily-BZ51rGiN.js","/assets/DataTable-CR5zRMUq.js","/assets/DateRangePicker-DAqeccRz.js","/assets/DayReportView-5ctuuVma.js","/assets/DayStepper-Dx-GtBBi.js","/assets/DifferenceBreakdown-BWLnMgEE.js","/assets/Downtime-CqDuKjGq.js","/assets/Education-Bys-vE5f.js","/assets/EducationLesson-BsRBWedt.js","/assets/EmptyState-DWE6d0qn.js","/assets/Exam-C6MqSHms.js","/assets/FactorySelect-BChCKCtT.js","/assets/Gamification-UXfsD6Uv.js","/assets/GroupBadge-Ck4rfdEH.js","/assets/HeatmapChart-D4BQVJKF.js","/assets/IdleCell-DEugt6-V.js","/assets/KPICard-BPAYGQ_b.js","/assets/Kaizen-IB_cgXWT.js","/assets/Kelish-CLgW4-tO.js","/assets/KpiDeltaCard-vK9YNs7G.js","/assets/LangTextInput-BEXaLnQl.js","/assets/Layout-CX3NDPcV.js","/assets/LeaderAppeal-jwBUsn1X.js","/assets/LeaderDayReport-F6uCrLKW.js","/assets/LeaderUnitReport-BaAKbfkR.js","/assets/Leaderboard-BoiyVTBI.js","/assets/Leaders-DqdhXfyt.js","/assets/Lightbox-D5b0a5tC.js","/assets/LiveOverview-BnCbMTw6.js","/assets/Login-BcK6bwHQ.js","/assets/NotFound-BnyAILF-.js","/assets/Notifications-aUTC3LoH.js","/assets/Overview-DUdMZTcs.js","/assets/Pagination-MmruiVF-.js","/assets/PerenaladkaFactTable-CFnSHNIi.js","/assets/PersonCard-2i3aJoI_.js","/assets/PlanFulfillment-DV4VmRnc.js","/assets/Production-V6hU1All.js","/assets/Profile-C3Te2jav.js","/assets/ProofCamera-Bi6yrVbU.js","/assets/ProofPhoto-Dhg4uum3.js","/assets/Quality-mp65MomU.js","/assets/RawRows-DpTVy8oe.js","/assets/RequestStateChip-CaqBss5G.js","/assets/RichTextEditor-C0Uka5tj.js","/assets/SaveState-BIP6Mrwn.js","/assets/SearchInput-B-vyip98.js","/assets/SeasonalityHeatmap-CDQZyMoK.js","/assets/SegmentedToggle-DoTS--ya.js","/assets/SetupTimes-DjLF1Qad.js","/assets/ShiftDaily-UOywgD2g.js","/assets/Staff-DxPdtPAw.js","/assets/StaffLive-7hbqzVJp.js","/assets/StatusBadge-Cwev1goH.js","/assets/TargetGoal-24CI2yj_.js","/assets/Targets-DP4B4_wI.js","/assets/Tasks-CyVeP7Hm.js","/assets/TimeWheelPicker-Bzavvnll.js","/assets/Toast-BQVCThWR.js","/assets/Tooltip-DjWx4dp4.js","/assets/TrendChart-DHnVgEZ8.js","/assets/TripleSpeedometer-Lzm-wtlj.js","/assets/Trudoyomkost-oI4HBBY3.js","/assets/Turnover-Dcv_LFWg.js","/assets/UploadDropzone-CAYkkSjD.js","/assets/UsersActivity-CFLkKtqq.js","/assets/VerdictBlock-BXC75UB6.js","/assets/VfxApiMap-BUaFLut9.js","/assets/VfxDictionaries-C9u9He4i.js","/assets/VfxEmployees-70zviiub.js","/assets/VfxHrMoves-BQO3RwFH.js","/assets/VfxJobs-CkExLm8K.js","/assets/VfxPhoto-BXdwcv5E.js","/assets/VfxShifts-DwbCdunR.js","/assets/VfxState-DGvFBi_U.js","/assets/VfxTimebooks-CR2PI9w6.js","/assets/VfxTimesheet-C3VX1lnd.js","/assets/WatchProgress-DE3ocOSZ.js","/assets/WebLogin-Bn7Xsi6U.js","/assets/WorkerConcerns-pAnTt6ty.js","/assets/Workers-C6t8SaRl.js","/assets/Zagruzka-2iiEezcT.js","/assets/ZagruzkaCell-BV_J_-a1.js","/assets/api-CZgSYAbC.js","/assets/archive-Dohr60T4.js","/assets/archive-restore-IKfpczAE.js","/assets/arrow-down-C3lmFyx1.js","/assets/arrow-left-DqloL5_p.js","/assets/arrow-up-D8bHLaaO.js","/assets/arrow-up-narrow-wide-Df-mDuH5.js","/assets/arrow-up-right-BBp0K08r.js","/assets/award-Ba08fpAg.js","/assets/ban-DgM33Gtw.js","/assets/book-open-KOKVizX3.js","/assets/bot-I9NNGtmi.js","/assets/boxes-B5yM8Df1.js","/assets/braces-P9rIYSxn.js","/assets/brigadirFilters-CR8LryB1.js","/assets/broadcastTree-BPX3kVED.js","/assets/building-2-DrBxqKnE.js","/assets/calculator-wIGGNUwu.js","/assets/calendar-BZK1C6hi.js","/assets/calendar-days-BOLuPI6q.js","/assets/camera-CoLbhGv7.js","/assets/categories-3GjzG-zB.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DhgpyStj.js","/assets/chart-line-k3V-hNf4.js","/assets/chart-pie-BBMtrQik.js","/assets/chartRange-CxognidV.js","/assets/check-check-Ckc6kETt.js","/assets/chevron-left-CB22ibnE.js","/assets/chevrons-up-down-DShr8-zG.js","/assets/circle-alert-DpcixbRA.js","/assets/circle-check-big-BP8UtUy0.js","/assets/circle-dashed-PQZ93f1i.js","/assets/circle-minus-CU_70sjS.js","/assets/circle-question-mark-CnOepZcP.js","/assets/circle-slash-xJXqVc4J.js","/assets/circle-user-round-DSz8uWmy.js","/assets/circle-zFU-D6mx.js","/assets/clock-3-BrnwurXy.js","/assets/cloud-off-Bt-oK3nD.js","/assets/cloud-upload-BudKapss.js","/assets/compass-BzksVFJw.js","/assets/concernCategories-CfFwwhzy.js","/assets/copy-DdUhsTUr.js","/assets/corner-down-right-BPIlG5Dr.js","/assets/createLucideIcon-D1R4N355.js","/assets/es-Lj6LK3ag.js","/assets/exportXlsx-CDAFUfoX.js","/assets/external-link-C83u_b7q.js","/assets/file-clock-BsB_Dri7.js","/assets/file-exclamation-point-BQxy9b7u.js","/assets/file-spreadsheet-Dng3l7OV.js","/assets/file-text-WykBv3dV.js","/assets/flag-tOltkJOp.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Ba1hfcfi.js","/assets/hash-DI6Gbdsj.js","/assets/history-7bUR-qdQ.js","/assets/hourglass-Dp0yV6tG.js","/assets/image-UH8iVDP-.js","/assets/image-off-CbjtEBzg.js","/assets/inbox-DONvwL8X.js","/assets/index-BarTLmz_.css","/assets/index-CfNWjXsG.js","/assets/key-round-BTQdC1g9.js","/assets/keyboard-mY78hqCT.js","/assets/languages-CluWtgzY.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CzAOnZdr.js","/assets/lightbulb-BrxmLTd6.js","/assets/link-2-D7qZF6Tf.js","/assets/link-2-off-CDbMHPx5.js","/assets/list-ordered-O615tCcU.js","/assets/list-tree-EO3qwZeU.js","/assets/lock-open-C2Qe0HzU.js","/assets/log-in-5vOYSrtk.js","/assets/maximize-2-BhWJq3ys.js","/assets/message-square-CuVhTs7a.js","/assets/minimize-2-DBhCow1r.js","/assets/package-check-zpNFF9fN.js","/assets/paperclip-CYb-Vcdo.js","/assets/pencil-C6hnSeA0.js","/assets/percent-C-PWLBgc.js","/assets/pin-CKyLqneL.js","/assets/pin-off-CZmxlu84.js","/assets/play-B56vcO0i.js","/assets/plug-zap-CZr3Bs-T.js","/assets/presentation-aX0fm231.js","/assets/prop-types-PR69crxN.js","/assets/radio-BVnbZdwX.js","/assets/react-apexcharts.esm-Dh-UCvj8.js","/assets/registers-BYowLRqK.js","/assets/repeat-uYUIFN-h.js","/assets/rotate-ccw-CkX9fL1Z.js","/assets/rotate-cw-DWEcMXEE.js","/assets/save-BBXrkpH8.js","/assets/scopeLinks-17-R3u3W.js","/assets/scroll-text-BmsCtwno.js","/assets/search-x-DKEzwzd4.js","/assets/segments-Dtp6_m6-.js","/assets/send-BHpfRfkn.js","/assets/settings-2-D2ZeEo4Z.js","/assets/shield-DMp_4cP2.js","/assets/shield-alert-DW2_QBO1.js","/assets/shield-check-BmmsDkKr.js","/assets/shield-question-mark-BIl44i-3.js","/assets/siren-BWl4BVPU.js","/assets/snowflake-CTUmy5yT.js","/assets/split-DAT3EwPt.js","/assets/square-Cow89Zhq.js","/assets/square-check-big-CVq5D_UT.js","/assets/star-BLDHzQW3.js","/assets/statusBands-BpqsXYdG.js","/assets/store-CLD5JVh1.js","/assets/table-2-CgY2kgzA.js","/assets/table-properties-CffGWox-.js","/assets/tag-DT-ZviEO.js","/assets/timer-off-B7dy93RW.js","/assets/trending-down-BRfJpZos.js","/assets/trending-up-BUZo7sWq.js","/assets/undo-2-DoEBbABs.js","/assets/useChartTheme-BxUExW9c.js","/assets/useElementWidth-CwiTfcWm.js","/assets/useIsMobile-CSs2VieF.js","/assets/useOpenParam-BazAsrgH.js","/assets/useStatusBands-DCxHori2.js","/assets/useUrlScope-RK2wt6LR.js","/assets/user-C76kkJW2.js","/assets/user-cog-CdCGcKWO.js","/assets/users-CBpe8Wv3.js","/assets/vfx-CJm_Xe1W.js","/assets/video-DDJXqXR6.js","/assets/wallet-r3Z5tSfK.js","/assets/warehouse-Cnw9OONb.js","/assets/x-DhuPIyPY.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
