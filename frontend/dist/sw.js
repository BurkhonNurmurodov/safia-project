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

const BUILD = "2026-10-19T12:30:40.979Z";
const PRECACHE = ["/","/assets/AdminPanel-zZKt8Hon.js","/assets/AnalysisBoard-DIN7KQ9u.js","/assets/Arc-CTYZM756.js","/assets/Assistant-DOMNn0LU.js","/assets/BrigadirProfile-Bngtj1R2.js","/assets/BroadcastReceivers-B-vzlo9U.js","/assets/BroadcastRecord-DkwmWKEn.js","/assets/Button-l8yBfX0z.js","/assets/CatLockNotice-B6rxn9Ak.js","/assets/CategoryLegendModal-DoFpogG6.js","/assets/CellConcerns-DmV8wjso.js","/assets/CellDetails-fsAK6FFM.js","/assets/CellFormModal-DjUq1ZOh.js","/assets/CellIdent-kTrKAauU.js","/assets/CellLink-Dn1ilhxn.js","/assets/Cells-DCqenpyf.js","/assets/ColumnFilter-CLCTOy6t.js","/assets/ColumnsPicker-DiV_pp3T.js","/assets/CommentsModal-DHuQYTn3.js","/assets/ComparisonTable-CKNoMhFs.js","/assets/Concerns-DpvZ8_P8.js","/assets/CountStepper-DbyP4RFU.js","/assets/Daily-BaeyytE7.js","/assets/DataTable-DZNOK06j.js","/assets/DateRangePicker-1WNP_6j3.js","/assets/DayReportView-D_ruS1yf.js","/assets/DayStepper-SSNQnHut.js","/assets/DifferenceBreakdown-BgI8ohnf.js","/assets/Downtime-DUVaZyHy.js","/assets/Education-C-VILfiu.js","/assets/EducationLesson-BAw73bAU.js","/assets/EmptyState-PA4r5Ep2.js","/assets/Exam-DB_R9jKA.js","/assets/FactorySelect-BCp0HghI.js","/assets/Gamification-DEwPCGjY.js","/assets/GroupBadge-teA19iiL.js","/assets/HeatmapChart-DV_Jt4Nd.js","/assets/IdleCell-CZbhFUGQ.js","/assets/KPICard-BpKv_jk2.js","/assets/Kaizen-C_A2uqIi.js","/assets/Kelish-8veJ0XbQ.js","/assets/KpiDeltaCard-BZO8VjKU.js","/assets/LangTextInput-pUKZy0b9.js","/assets/Layout-B9LtbVKW.js","/assets/LeaderAppeal-CB-on32a.js","/assets/LeaderDayReport-C9JvIQ0P.js","/assets/LeaderUnitReport-BJ_jByfV.js","/assets/Leaderboard-BqQsTWDj.js","/assets/Leaders-D9Fav370.js","/assets/LeadersKpi-C-bbApiX.js","/assets/Lightbox-DB5E1Snh.js","/assets/LiveOverview-D78-G8tF.js","/assets/Login-ZAyki5nW.js","/assets/NotFound-Da1n7QAY.js","/assets/Notifications-CKZyfz54.js","/assets/Overview-CWUTmNEQ.js","/assets/Pagination-G9J7YHib.js","/assets/PerenaladkaFactTable-BHYPOazl.js","/assets/PersonCard-CAht21hL.js","/assets/PlanFulfillment-5kigKIBx.js","/assets/Production-BbBLh4M6.js","/assets/Profile-Y4GtkaVr.js","/assets/ProofCamera-CH6OkQx7.js","/assets/ProofPhoto-DmIRJjW-.js","/assets/Quality-BKCJsbir.js","/assets/RawRows-CCVkYnfw.js","/assets/RequestStateChip-D5MWWdU0.js","/assets/RichTextEditor-Bzvl7wg3.js","/assets/SaveState-BTfrNnQG.js","/assets/SearchInput-DhrW2UOX.js","/assets/SeasonalityHeatmap-CM7Dcslr.js","/assets/SegmentedToggle-CZraepKb.js","/assets/SetupTimes-CPgGjHYr.js","/assets/ShiftDaily-BigoqqEk.js","/assets/Staff-B8WRB8cp.js","/assets/StaffListAtCheck-B9Cbz2LJ.js","/assets/StatusBadge-DjGdM2Ka.js","/assets/TargetGoal-MAtOTQz7.js","/assets/Targets-IjZLvAKs.js","/assets/Tasks-4yri5_t6.js","/assets/TimeWheelPicker-BXHoUm35.js","/assets/Toast-DvttRHqm.js","/assets/Tooltip-DgK4zEu8.js","/assets/TrendChart-B1OzKjY4.js","/assets/TripleSpeedometer-DwBZ6vVd.js","/assets/Trudoyomkost-D1d3Nlp5.js","/assets/UploadDropzone-D6G-aRnp.js","/assets/UsersActivity-D5Q_R6Mu.js","/assets/VerdictBlock-DXlcy8Bj.js","/assets/VfxApiMap-UqeIYeCK.js","/assets/VfxDictionaries-B6qBLImk.js","/assets/VfxEmployees-DVy2RQC_.js","/assets/VfxHrMoves-B46Fwa7O.js","/assets/VfxJobs-DxFdKA7e.js","/assets/VfxPhoto-Dmwhvvkp.js","/assets/VfxShifts-D8Hrf52k.js","/assets/VfxState-sw8Aa-N_.js","/assets/VfxTimebooks-CIyVrE3J.js","/assets/VfxTimesheet-UJ5f41nD.js","/assets/WatchProgress-B_rLn80m.js","/assets/WebLogin-DzKNFt3m.js","/assets/Workers-D5FK10hk.js","/assets/Zagruzka-QDiBz2QL.js","/assets/ZagruzkaCell-BvrvWXz-.js","/assets/api-DnsAnthY.js","/assets/archive-BRO-ufwG.js","/assets/archive-restore-CLp25Dun.js","/assets/arrow-down-BDLVWC85.js","/assets/arrow-down-right-yMsOQhBI.js","/assets/arrow-down-wide-narrow-CQHkAWqM.js","/assets/arrow-up-narrow-wide-D93kZlgu.js","/assets/ban-CMBWeiMd.js","/assets/boxes-CpyZ3AJj.js","/assets/braces-DWHBi8Rc.js","/assets/brigadirFilters-CFf3AT3T.js","/assets/broadcastTree-BRsddaZ_.js","/assets/building-2-p6KpGPDc.js","/assets/calculator-BG6xqiIW.js","/assets/calendar-Dh9dvkfp.js","/assets/calendar-days-Bb1H72-B.js","/assets/camera-DQLUyApL.js","/assets/categories-B5J0616I.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-qugdQVQH.js","/assets/chart-line-lVd2SFW0.js","/assets/chart-pie-B8EPj2uP.js","/assets/chartRange-CTdVX9y1.js","/assets/check-check-dqJ11Gmr.js","/assets/chevron-left-vT2A9DL9.js","/assets/chevrons-up-down-Z_Bg1SnJ.js","/assets/circle-BFdglCKd.js","/assets/circle-alert-CW-cT8m6.js","/assets/circle-check-big-D9Zt0rFP.js","/assets/circle-dashed-BE5fhZT6.js","/assets/circle-minus-C4O8CpRp.js","/assets/circle-question-mark-BlccEfkn.js","/assets/circle-slash-kSADmZBE.js","/assets/circle-user-round-epQNvTI5.js","/assets/cloud-off-BlCtXOY0.js","/assets/cloud-upload-CYcNGiRP.js","/assets/compass-D-a4y2D4.js","/assets/concernCategories-DEdh8G72.js","/assets/corner-down-right-bkGcjT7D.js","/assets/createLucideIcon-0uilfwlJ.js","/assets/es-CQHTxENZ.js","/assets/external-link-DyYg4r_u.js","/assets/file-clock-Bc6XWJQs.js","/assets/file-exclamation-point-u_ShLepw.js","/assets/flag-DPyTn1WH.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-B05lt0Sb.js","/assets/funnel-HmVKnxeN.js","/assets/hash-C1GTGz67.js","/assets/hourglass-CmroU6CB.js","/assets/image-CxB9EEhu.js","/assets/image-off-DMY277nl.js","/assets/inbox-E6Qaq_M_.js","/assets/index-D5yRvhic.js","/assets/index-DemTQruw.css","/assets/keyboard-DUl5snvE.js","/assets/languages-BXztSWTK.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DXX3jj1K.js","/assets/lightbulb-DCxDGn5Z.js","/assets/link-2-DOqCyeEw.js","/assets/link-2-off-f-DsSE9C.js","/assets/list-ordered-HQszfHMQ.js","/assets/list-tree-DnfEDtqd.js","/assets/lock-open-CuOZCwc3.js","/assets/log-in-DOFaJzhG.js","/assets/marks-DZAbIkEw.js","/assets/minimize-2-B7XcPLNk.js","/assets/package-check-Dpmm1VW9.js","/assets/pencil-DLr_KojF.js","/assets/percent-9YNtyt81.js","/assets/pin-FaiCPmvC.js","/assets/pin-off-du3TfJ23.js","/assets/play-BoKuXZM9.js","/assets/plug-zap-BMoawwAZ.js","/assets/prop-types-DhmQ1nWO.js","/assets/radio-BwQQ-EWf.js","/assets/react-apexcharts.esm-BGqdwt18.js","/assets/registers-DXPbdIXy.js","/assets/repeat-Lru_XvY5.js","/assets/save-XCPXPOFA.js","/assets/scopeLinks-BSgV-bjN.js","/assets/scroll-text-C4icyKHK.js","/assets/search-x-DOyNRGIc.js","/assets/segments-DGQRYXWp.js","/assets/send-Y7Q3Hogl.js","/assets/settings-2-LJnP8lNx.js","/assets/shield-alert-WQtbDwCg.js","/assets/shield-lAJldbMI.js","/assets/shield-question-mark-BRG6z1ma.js","/assets/siren-BCxU0TVA.js","/assets/snowflake-CVNVfjrL.js","/assets/split-P873MhgC.js","/assets/square-check-big-R34aQRn7.js","/assets/star-DJvQWBAD.js","/assets/statusBands-Djk1LM2y.js","/assets/store-Bg39ddq-.js","/assets/table-2-DJtaHB3b.js","/assets/table-properties-Dke9Biv8.js","/assets/tag-DLg51uly.js","/assets/timer-off-DZUXSofh.js","/assets/trending-down-CENcJbMv.js","/assets/trending-up-Mn25JJiQ.js","/assets/undo-2-W82YcV3a.js","/assets/useChartTheme-ClLSYaAU.js","/assets/useElementWidth-DaotraZX.js","/assets/useIsMobile-MJhn7BZg.js","/assets/useOpenParam-Tuuqyk3S.js","/assets/useStatusBands-DfNcDx6c.js","/assets/useUrlScope-DdhlNgjD.js","/assets/user-B0JEO9sE.js","/assets/user-cog-XwgPK7SR.js","/assets/user-minus-C6orj2tX.js","/assets/users-Bbpf_jWX.js","/assets/vfx-B5L4wB9C.js","/assets/video-jktWXBmY.js","/assets/wallet-BD9efBu0.js","/assets/warehouse-DHa1uXqS.js","/assets/workflow-D81zwfxu.js","/assets/x-Uy9EkqN7.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
