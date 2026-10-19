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

const BUILD = "2026-10-19T04:50:33.191Z";
const PRECACHE = ["/","/assets/AdminPanel-B0xwdhkV.js","/assets/AnalysisBoard-Zg3z9d2B.js","/assets/Arc-aJa59PlV.js","/assets/Assistant-CyeKvQIY.js","/assets/BrigadirProfile-BYrFkq0_.js","/assets/BroadcastReceivers-DiNVD_7D.js","/assets/BroadcastRecord-D72k2D7-.js","/assets/Button-BKYeOt6P.js","/assets/CatLockNotice-D7-19-Um.js","/assets/CategoryLegendModal-BV_9WLCD.js","/assets/CellConcerns-D7mkaaUD.js","/assets/CellDetails-Cv-T859S.js","/assets/CellFormModal-CD7Zdtwa.js","/assets/CellIdent-CU_MvSwU.js","/assets/CellLink-DxDEc5TO.js","/assets/Cells-DqUsK1nr.js","/assets/ColumnFilter-BacwN7jJ.js","/assets/ColumnsPicker-DVKNR3PA.js","/assets/CommentsModal-DTXSsSkg.js","/assets/ComparisonTable-B_yKbvVf.js","/assets/Concerns-C0ERC6oN.js","/assets/CountStepper-CLQP-Nu8.js","/assets/Daily-DJgm2Zwn.js","/assets/DataTable-VzSCaZ4a.js","/assets/DateRangePicker-D16cxfCc.js","/assets/DayReportView-DzMfgf9i.js","/assets/DayStepper-UjxJn0fZ.js","/assets/DifferenceBreakdown-DyHbT_ee.js","/assets/Downtime-C4dkhpqG.js","/assets/Education-AhqjTc1w.js","/assets/EducationLesson-DwowJdYW.js","/assets/EmptyState-DcEykO1Z.js","/assets/Exam-CaqnsXPL.js","/assets/FactorySelect-5th1WVTF.js","/assets/ForeignObjects-X-b12pkk.js","/assets/Gamification-Cdbz8ivF.js","/assets/GroupBadge-rxS5gGnJ.js","/assets/HeatmapChart-BBiZBcjg.js","/assets/IdleCell-BJxX2s2R.js","/assets/KPICard-BmnBBk_0.js","/assets/Kaizen-DWC-tu5m.js","/assets/Kelish-Dc9lF651.js","/assets/KpiDeltaCard-D9_PAr4V.js","/assets/LangTextInput-C3IOZg9d.js","/assets/Layout-BueDwE6j.js","/assets/LeaderAppeal-B-11MGv0.js","/assets/LeaderDayReport-DvX3SzT5.js","/assets/LeaderUnitReport-DVgYgadm.js","/assets/Leaderboard-DraG8RGu.js","/assets/Leaders-Bc4E7q6A.js","/assets/Lightbox-DQ5a45xO.js","/assets/LiveOverview-CcrhwyOd.js","/assets/Login-CAS-xQyk.js","/assets/NotFound-D3l7rEPS.js","/assets/Notifications-B9T6xt3T.js","/assets/Overview-Dgu1sijl.js","/assets/Pagination-C06Y3YLx.js","/assets/PerenaladkaFactTable-BDoCvlVT.js","/assets/PersonCard-CR1DwS9j.js","/assets/PlanFulfillment-Cl7krHwy.js","/assets/Production-BBeQxG5i.js","/assets/Profile-P0glXkX4.js","/assets/ProofCamera-BOgq7HX7.js","/assets/ProofPhoto-CD3-vpI5.js","/assets/Quality-CzyP-k7T.js","/assets/RawRows-ngD_FB45.js","/assets/RequestStateChip-Bi215AL5.js","/assets/RichTextEditor-Ie5q2cK0.js","/assets/SaveState-nyIJH-Up.js","/assets/SearchInput-g6e5FAJx.js","/assets/SeasonalityHeatmap-Cr_13vjv.js","/assets/SegmentedToggle-oycL2hwo.js","/assets/SetupTimes-BTpkvStM.js","/assets/ShiftDaily-DQSR5QL_.js","/assets/Staff-B3GmJFTs.js","/assets/StaffListAtCheck-CtvxUEeG.js","/assets/StatusBadge-Dx9daIMy.js","/assets/TargetGoal-DEeh4exn.js","/assets/Targets-BY2aBsqS.js","/assets/Tasks-DpXS8_pJ.js","/assets/TimeWheelPicker-B82NVzM_.js","/assets/Toast-DrVyJwFP.js","/assets/Tooltip-CEMx5FMQ.js","/assets/TrendChart-C6wweow_.js","/assets/TripleSpeedometer-DeH6ET2r.js","/assets/Trudoyomkost-B5VgfXyH.js","/assets/Turnover-ghVvwZa4.js","/assets/TurnoverBits-B3qabhRH.js","/assets/UploadDropzone-RUmV5caQ.js","/assets/UsersActivity-SrseKZrB.js","/assets/VerdictBlock-OD4mpjXL.js","/assets/VfxApiMap-CLvPK_4j.js","/assets/VfxDictionaries-DwyEK7LR.js","/assets/VfxEmployees-CgR0XReW.js","/assets/VfxHrMoves-Ciejty8M.js","/assets/VfxJobs-v-EcAeBK.js","/assets/VfxPhoto-7xo2FibY.js","/assets/VfxShifts-C67yvw1C.js","/assets/VfxState-DQG6YUUJ.js","/assets/VfxTimebooks-DjN-bxzS.js","/assets/VfxTimesheet-Dk0dswxh.js","/assets/WatchProgress-DEDTrzy8.js","/assets/WebLogin-DOdaZoai.js","/assets/WorkerConcerns-kmuEpI5h.js","/assets/Workers-Dm8Ul0NJ.js","/assets/Zagruzka-BJeZHy3Z.js","/assets/ZagruzkaCell-DVptHYDy.js","/assets/api-D1TgIx1l.js","/assets/archive-B_UxJuz_.js","/assets/archive-restore-zxrmXHGN.js","/assets/arrow-down-DghfJOAj.js","/assets/arrow-down-wide-narrow-D3ID8oM-.js","/assets/arrow-up-narrow-wide-8cnRlOkp.js","/assets/award-BXkQvTW8.js","/assets/ban-CqjKOQoX.js","/assets/boxes-CJ3iawv2.js","/assets/braces-CwrMGs1c.js","/assets/brigadirFilters-ZtFI3hD2.js","/assets/broadcastTree-B_xuaLXT.js","/assets/building-2-DvpirRHn.js","/assets/calculator-YQp4ZlmO.js","/assets/calendar-CMcv3AtE.js","/assets/calendar-days-3Ydb7doG.js","/assets/camera-CKbM6kWH.js","/assets/categories-KQ5EpPb0.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DVhLx_zo.js","/assets/chart-line-BqZ6IvGB.js","/assets/chart-pie-DbJxmdOo.js","/assets/chartRange-BkAZU7da.js","/assets/check-check-Dl7qHWZV.js","/assets/chevron-left-n6G3XofU.js","/assets/chevrons-up-down-D0S8LdfI.js","/assets/circle-CEeC6qgi.js","/assets/circle-alert-CYFNtpov.js","/assets/circle-check-big-CnM_IvB_.js","/assets/circle-dashed-B7Aqe7Av.js","/assets/circle-minus-CJmpc8Gi.js","/assets/circle-question-mark-CVgbzn9G.js","/assets/circle-slash-CfiNJi_S.js","/assets/circle-user-round-BJkNj0bR.js","/assets/cloud-off-CgkAsyrq.js","/assets/cloud-upload-C67EhJa0.js","/assets/compass-tiu3OO1M.js","/assets/concernCategories-CgCObKDs.js","/assets/corner-down-right-D2KfDfWz.js","/assets/createLucideIcon-BNUSvpIC.js","/assets/es-CpKAslHj.js","/assets/external-link-c-_YtLcp.js","/assets/file-clock-C9zJFA69.js","/assets/file-exclamation-point-CxWnF1X-.js","/assets/flag-OE2WurTq.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BLoxufKj.js","/assets/hash-BmqJj9cB.js","/assets/hourglass-C-voMKUO.js","/assets/image-DQ09_Fpr.js","/assets/image-off-Bn59OZai.js","/assets/inbox-Cw_-KRhn.js","/assets/index-By9PjhyV.js","/assets/index-ByhNoNK_.css","/assets/keyboard-CxXkBb0E.js","/assets/languages-Ck2nDA6G.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BcbvSD7j.js","/assets/lightbulb-DTPxMhgG.js","/assets/link-2-9q3PVhWX.js","/assets/link-2-off-DpoDE1rI.js","/assets/list-ordered-EFsp__ZD.js","/assets/list-tree-DRX2h1HI.js","/assets/lock-open-CjgUtzdr.js","/assets/log-in-BeCNdRbe.js","/assets/marks-DsliV4SY.js","/assets/minimize-2-CwugdrVs.js","/assets/package-check-Cb8qosSV.js","/assets/pencil-B8xIV-xB.js","/assets/percent-CvGCtgRW.js","/assets/pin-D9bA3mx7.js","/assets/pin-off-BdRgGRy-.js","/assets/play-ClRxJIHk.js","/assets/plug-zap-BdDdr-nP.js","/assets/prop-types-B-tCmZI-.js","/assets/radio-BzA88Gkg.js","/assets/react-apexcharts.esm-BtwHgD_G.js","/assets/registers-Ds__p4-5.js","/assets/repeat-BqDWs047.js","/assets/save-CDG7Fwg6.js","/assets/scopeLinks-CJJKcYtt.js","/assets/scroll-text-aUF-TDNh.js","/assets/search-x-DF5iTy3A.js","/assets/segments-oPu3aety.js","/assets/send-v70xaIzj.js","/assets/settings-2-z7oEE1wO.js","/assets/shield-BwkQ7t01.js","/assets/shield-alert-WQrtA7Ov.js","/assets/shield-question-mark-B1fANSAG.js","/assets/siren-BQx0bQcP.js","/assets/snowflake-Dd1_8NRJ.js","/assets/split-5makNKA_.js","/assets/square-check-big-h4xGToQC.js","/assets/star-CZuNs54n.js","/assets/statusBands-B3FO66xv.js","/assets/store-DGN_c9tI.js","/assets/table-2-DrSTs2hi.js","/assets/table-properties-xSbBu0U2.js","/assets/tag-DNXh3jF8.js","/assets/timer-off-CXiR9Sf1.js","/assets/trending-down-Dab2MkyY.js","/assets/trending-up-GrILGZSh.js","/assets/undo-2-DKn_YSkW.js","/assets/useChartTheme-BoDGNKuC.js","/assets/useElementWidth-B0FbBLRr.js","/assets/useIsMobile-FzZeFOLZ.js","/assets/useOpenParam-D_2omMPm.js","/assets/useStatusBands-BFzIwe5V.js","/assets/useUrlScope-DzfJpXzW.js","/assets/user-cog-BqDSieu-.js","/assets/user-hTfyqvna.js","/assets/users-f9D9TRJd.js","/assets/vfx-kdC0lHzY.js","/assets/video-_-DlsBXF.js","/assets/wallet-B-VXO3WD.js","/assets/warehouse-DNXADPea.js","/assets/workflow-CvTE6FHg.js","/assets/x-BMQqRDu8.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
