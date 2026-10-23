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

const BUILD = "2026-10-23T16:42:48.109Z";
const PRECACHE = ["/","/assets/AdminPanel-RxzETAZG.js","/assets/AnalysisBoard-0MFMR9nz.js","/assets/Arc-BmiKv6hh.js","/assets/Assistant-ClJQYREQ.js","/assets/BrigadirProfile-B0l4RaF1.js","/assets/BroadcastReceivers-DPL8X-BD.js","/assets/BroadcastRecord-bxFjuJh1.js","/assets/Button-DWCjoaMv.js","/assets/CatLockNotice-Cx2yAax2.js","/assets/CategoryLegendModal-BlTvx01N.js","/assets/CellConcerns-CGBxu9qs.js","/assets/CellDetails-C88WFylV.js","/assets/CellFormModal-BmSJVm8T.js","/assets/CellIdent-C1e7DQRZ.js","/assets/CellLink-BbQjEVLA.js","/assets/Cells-del_I_xA.js","/assets/ColumnFilter-DGd7n9Kg.js","/assets/ColumnsPicker-BgZ45HBF.js","/assets/CommentsModal-Bq4gIMqg.js","/assets/ComparisonTable-Eah-ucpF.js","/assets/Concerns-CC7tXLqq.js","/assets/CountStepper-DK9QSjRg.js","/assets/Daily-Bo-3Ufbp.js","/assets/DataTable-CFDLy328.js","/assets/DateRangePicker-B8Wh2njR.js","/assets/DayReportView-sN8ExE1t.js","/assets/DayStepper-c4pf7KUM.js","/assets/DayStrip-C3LddMMt.js","/assets/DifferenceBreakdown-Cu7T54QF.js","/assets/Downtime-CFnbEeia.js","/assets/Education-CLzreC_W.js","/assets/EducationLesson-DvQXiVin.js","/assets/EmptyState-CjOD_nkv.js","/assets/Exam-IvXM2nRk.js","/assets/FactorySelect-DtcoY8OE.js","/assets/Gamification-D4xIEhjG.js","/assets/GroupBadge-SdLKQ7sc.js","/assets/HeatmapChart-CS_qG9rT.js","/assets/IdleCell-CZtf-gNr.js","/assets/KPICard-C2RA2rm9.js","/assets/Kaizen-BFOM9VGE.js","/assets/Kelish-BVXHn0jC.js","/assets/KpiDeltaCard-whNWis_R.js","/assets/LangTextInput-HRhdqsKG.js","/assets/Layout-BWI6KZ6q.js","/assets/LeaderAppeal-BCRX5iU7.js","/assets/LeaderDayReport-9uY55PwN.js","/assets/LeaderUnitReport-jR-Ae1uX.js","/assets/Leaderboard-BqmH12Gf.js","/assets/Leaders-BEoyXJk8.js","/assets/LeadersKpi-B3PBsqFJ.js","/assets/Lightbox-D2tGCQIw.js","/assets/LiveOverview-CKXFt97y.js","/assets/Login-Db35pedH.js","/assets/NotFound-C8v8qmDV.js","/assets/Notifications-BJPQDwQm.js","/assets/Ontime-CaxUoOBA.js","/assets/Overview-OW5Guw6z.js","/assets/Pagination-DjnBxDvL.js","/assets/PerenaladkaFactTable-C1bvOtve.js","/assets/PersonCard-CFH3dtbx.js","/assets/PlanFulfillment-B_jZwZE_.js","/assets/Production-XRUX3zrt.js","/assets/Profile-Avrx5yfx.js","/assets/ProofCamera-BwfCnF9e.js","/assets/ProofPhoto-431GGvrH.js","/assets/Quality-BzQzIRY2.js","/assets/RawRows-CF7mdfGQ.js","/assets/RequestStateChip-D_0vP69Z.js","/assets/RichTextEditor-DX07gOU-.js","/assets/SaveState-CCHv6ZVd.js","/assets/SearchInput-SwrBXdIy.js","/assets/SeasonalityHeatmap-Bvn2zS0Z.js","/assets/SegmentedToggle-DxeiYEJK.js","/assets/SetupTimes-DAMe7ESF.js","/assets/ShiftDaily-CXEEhZqZ.js","/assets/Staff-DeU8nDnH.js","/assets/StaffListAtCheck-D3OwZNJh.js","/assets/StatusBadge-DcNXEOlC.js","/assets/StatusBandsModal-CTjaqzUq.js","/assets/TargetGoal-CUgakXEJ.js","/assets/Targets-BXIxk7I6.js","/assets/Tasks-C5hjieWj.js","/assets/TimeWheelPicker-DC6pbOL2.js","/assets/Toast-Dwj2IV_n.js","/assets/Tooltip-BUx0P3-w.js","/assets/TrendChart-DK78BHy9.js","/assets/TripleSpeedometer-CHWdLaOb.js","/assets/Trudoyomkost-CRMAV-cT.js","/assets/UploadDropzone-CLHqvk8L.js","/assets/UsersActivity-CpKZebqk.js","/assets/VerdictBlock-x3fHVtw4.js","/assets/VfxApiMap-fQpiUFcP.js","/assets/VfxDictionaries-K7CUN9ph.js","/assets/VfxEmployees-BdnDxISg.js","/assets/VfxHrMoves-Cj8wp5je.js","/assets/VfxJobs-4iWz_pOr.js","/assets/VfxPhoto-HJikSnUe.js","/assets/VfxShifts-B8VNQx4j.js","/assets/VfxState-DJsUvK9_.js","/assets/VfxTimebooks-Bb5_g00W.js","/assets/VfxTimesheet-C7clbniC.js","/assets/WatchProgress-Dj3KbJjt.js","/assets/WebLogin-BS6VeyPJ.js","/assets/Workers-BWK9lyXn.js","/assets/Zagruzka-RG8-PxOz.js","/assets/ZagruzkaCell-CfFzgL5g.js","/assets/api-wNgat5nE.js","/assets/archive-HnIbaYD-.js","/assets/archive-restore-q1Jeik1o.js","/assets/arrow-down-UKZ8nqI1.js","/assets/arrow-down-right-DmSSKmuy.js","/assets/arrow-down-wide-narrow-BfWHsD6E.js","/assets/arrow-up-narrow-wide-BYU7L2_V.js","/assets/ban-CYef4U1s.js","/assets/boxes-B-CSMPkA.js","/assets/braces-mCOeQiHd.js","/assets/brigadirFilters-3xZSTeaA.js","/assets/broadcastTree-B-oJcsB_.js","/assets/building-2-ktnQ2_5M.js","/assets/calendar-D4-wvOK6.js","/assets/calendar-days-0y-GMCG4.js","/assets/camera-BaSHdbiP.js","/assets/categories-CFfTm1Sb.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B-gC5krg.js","/assets/chart-line-B65XcPqB.js","/assets/chart-pie-B92L9tvr.js","/assets/chartRange-BHXdiGvz.js","/assets/check-check-BsdxACeT.js","/assets/chevron-left-DcTA373G.js","/assets/chevrons-up-down-p56A9FeR.js","/assets/circle-DusUDmQ2.js","/assets/circle-alert-BGT_UzWU.js","/assets/circle-check-big-DMVOJX4P.js","/assets/circle-dashed-VP2BYIwu.js","/assets/circle-minus-7NFLdIvI.js","/assets/circle-question-mark-CJLFhbZo.js","/assets/circle-slash-CK3d-z5O.js","/assets/circle-user-round-DKQBdSFU.js","/assets/cloud-off-DsTx2KHX.js","/assets/cloud-upload-BwIvO7-4.js","/assets/compass-Bp1Itq2M.js","/assets/concernCategories-CeWxsuCg.js","/assets/corner-down-right-9tvLtbgv.js","/assets/createLucideIcon-j9OTKqTD.js","/assets/es-Ca8C09xd.js","/assets/external-link-C6pBTJwv.js","/assets/file-clock-B7E7NQd9.js","/assets/file-exclamation-point-CLabLSIl.js","/assets/flag-D2PiHJdO.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DaLNa_Z0.js","/assets/funnel-Rt2fK022.js","/assets/hash-C44m8uCT.js","/assets/hourglass-ByF-BTXZ.js","/assets/image-C8YvYGfM.js","/assets/image-off-C_b3b3JI.js","/assets/inbox-BT_2f_x1.js","/assets/index-BFfjeSpp.js","/assets/index-DFvJry-Q.css","/assets/keyboard-fKSYt2C6.js","/assets/languages-BFSarOxd.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CX7A06i7.js","/assets/leaderBoard-C6buPdwm.js","/assets/lightbulb-BYy7K9NB.js","/assets/link-2-DoopoB5k.js","/assets/link-2-off-Cq8yuDZy.js","/assets/list-ordered-DEcDPVr7.js","/assets/list-tree-gH8V4Olj.js","/assets/lock-open-BkXjijhi.js","/assets/log-in-D4sR3OI-.js","/assets/map-pin-EbpWhJRx.js","/assets/marks-BVkwuRHo.js","/assets/minimize-2-DAhM6OS1.js","/assets/package-check-D0DuH09E.js","/assets/pencil-1AKjlP4I.js","/assets/percent-yCzLKhyd.js","/assets/pin-CszzpqWp.js","/assets/pin-off-CWflexRz.js","/assets/play-D6KW9I7j.js","/assets/plug-zap-uzTMuSE6.js","/assets/prop-types-CDES-26b.js","/assets/radio-C-1_U6Jl.js","/assets/react-apexcharts.esm-umUyczHb.js","/assets/registers-ClexzlPN.js","/assets/repeat-2HOaRmwN.js","/assets/save-D0qIrMrt.js","/assets/scopeLinks-Bbbym3x8.js","/assets/scroll-text-DNX0l8jo.js","/assets/search-x-BvZhCVQB.js","/assets/segments-BiyXyie7.js","/assets/send-C5hlkrC1.js","/assets/settings-2-CBvbKw4X.js","/assets/shield-BIllDo8z.js","/assets/shield-alert-Dnq3n0CP.js","/assets/shield-question-mark-CAkUVzuY.js","/assets/sigma-Cn8UTm0x.js","/assets/siren-CdNvUVIV.js","/assets/snowflake-WZ8y-iZl.js","/assets/split-wjIjd6bN.js","/assets/square-check-big-xbIXqYyO.js","/assets/star-D11SbkVW.js","/assets/statusBands-C3rhi8-s.js","/assets/store-BBPRCP76.js","/assets/table-2-BkDriKy0.js","/assets/table-properties-4d59wKwJ.js","/assets/tag-L5_TTlSO.js","/assets/timer-off-Dz1Xv1DP.js","/assets/trendBuckets-BB-R0-tL.js","/assets/trending-down-4-DHmj1T.js","/assets/trending-up-CbSb0Un-.js","/assets/undo-2-B9j60Aku.js","/assets/useChartTheme-CrpTRcrX.js","/assets/useElementWidth-DAF0H-RF.js","/assets/useIsMobile-TGO_WJaX.js","/assets/useOpenParam-CmUvtJiW.js","/assets/useStatusBands-Buw9SFuz.js","/assets/useUrlScope-ZIKBUlYG.js","/assets/user-VqrgADJj.js","/assets/user-cog-BNCBnMxT.js","/assets/user-minus-qI5aUyOb.js","/assets/users-BH87qWEI.js","/assets/vfx-DXdn1P5i.js","/assets/video-CpJErv1g.js","/assets/wallet-Byq0BXgU.js","/assets/warehouse-DcZK66kC.js","/assets/workflow-BgTpfVFO.js","/assets/x-Dy6ZSb07.js","/assets/zap-Bzfk8ULz.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
