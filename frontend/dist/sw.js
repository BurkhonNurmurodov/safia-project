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

const BUILD = "2026-10-06T17:35:20.648Z";
const PRECACHE = ["/","/assets/AdminPanel-B2D9Y4qS.js","/assets/AnalysisBoard-wnWHt5fd.js","/assets/Arc-ecEfs2qj.js","/assets/Assistant-Cfo9FOV4.js","/assets/BrigadirProfile-vug02cWd.js","/assets/BroadcastReceivers-CPY4Nh24.js","/assets/BroadcastRecord-BlafnTrW.js","/assets/Button-Bxq36yYY.js","/assets/CatLockNotice-BJV-7XCQ.js","/assets/CategoryLegendModal-Dk2D1vUc.js","/assets/CellConcerns-Th0jaJnW.js","/assets/CellDetails-pW3yBeQF.js","/assets/CellFormModal-DALzSwEL.js","/assets/CellIdent-BiyuE6aN.js","/assets/CellLink-D1zAqDL2.js","/assets/Cells-Bu9uhc6R.js","/assets/ColumnFilter-DACagWA4.js","/assets/ColumnsPicker-CKzCWNy4.js","/assets/CommentsModal-CDJTlxBC.js","/assets/ComparisonTable-BEVCfwt0.js","/assets/Concerns-CjrhVa5P.js","/assets/Daily-BCLneCiD.js","/assets/DataTable-xUIvc5Qj.js","/assets/DateRangePicker-DJP-3oSW.js","/assets/DayReportView-CmjSR5me.js","/assets/DayStepper-C5FGCzEo.js","/assets/DifferenceBreakdown-BV7X4utG.js","/assets/Downtime-DWB11y75.js","/assets/Education-BmLDP9xq.js","/assets/EducationLesson-eOUCFFQc.js","/assets/EmptyState-B021h4l-.js","/assets/Exam-C4DdO-s9.js","/assets/FactorySelect--sehhrlx.js","/assets/Gamification-AHdURS6f.js","/assets/GroupBadge-CZN4SUbi.js","/assets/HeatmapChart-C4kP9ps5.js","/assets/IdleCell-BZYFhUpr.js","/assets/KPICard-C6NELItX.js","/assets/Kaizen-c193UPLe.js","/assets/Kelish-Cjnt7wPg.js","/assets/KpiDeltaCard-DnSQTJtb.js","/assets/LangTextInput-B7TnG63y.js","/assets/Layout-DaeLaEn3.js","/assets/LeaderAppeal-C8xS1ucq.js","/assets/LeaderDayReport-Dmq-wbzV.js","/assets/LeaderUnitReport-B4oQGMsk.js","/assets/Leaderboard-Cg8xLVBW.js","/assets/Leaders-BsMLcEHi.js","/assets/Lightbox-D3EiHOsg.js","/assets/LiveOverview-CRTSyTOA.js","/assets/Login-k1rYp0QR.js","/assets/NotFound-CHyGbBZT.js","/assets/Notifications-eFNw83V8.js","/assets/Overview-B4ulTZZu.js","/assets/Pagination-C8Tt3jPJ.js","/assets/PerenaladkaFactTable-C9R1Na6i.js","/assets/PersonCard-BLrgBZtr.js","/assets/PlanFulfillment-3unnwzCq.js","/assets/Production-QPy81yiT.js","/assets/Profile-D87p0P2v.js","/assets/ProofCamera-JOavA6qO.js","/assets/ProofPhoto-BpnnMXUP.js","/assets/Quality-F1AxNPyp.js","/assets/RawRows-bEYfcyv7.js","/assets/RequestStateChip-BNKlwWTg.js","/assets/RichTextEditor-CXeXSsqd.js","/assets/SaveState-D_5JBwqj.js","/assets/SearchInput-D_J01MTb.js","/assets/SeasonalityHeatmap-fkW-jTo7.js","/assets/SegmentedToggle-Dp3VG2jJ.js","/assets/SetupTimes-Cl0up5xk.js","/assets/ShiftDaily-VD6xUhCj.js","/assets/Staff-eSI8Nhsv.js","/assets/StatusBadge-BuEjQ14h.js","/assets/TargetGoal-D3VnlhiH.js","/assets/Targets-BQKb8PK3.js","/assets/Tasks-BvVf7AZh.js","/assets/TimeWheelPicker-BSZIeogq.js","/assets/Toast-CbvAMwu9.js","/assets/Tooltip-B3uywgG0.js","/assets/TrendChart-8aIEToCy.js","/assets/TripleSpeedometer-Br9yWn6o.js","/assets/Trudoyomkost-fPD_M23I.js","/assets/Turnover-BQfF_92y.js","/assets/UploadDropzone-DDQPEOgP.js","/assets/UsersActivity-DRVtV6PI.js","/assets/VerdictBlock-USO70hiN.js","/assets/VfxApiMap-C4Q9V6Wt.js","/assets/VfxDictionaries-ZrMZNQjv.js","/assets/VfxEmployees-jrox7sX0.js","/assets/VfxHrMoves-yaVJMDKm.js","/assets/VfxJobs-BRTdSPG0.js","/assets/VfxPhoto-C9ldQV3J.js","/assets/VfxShifts-D3TvXz2d.js","/assets/VfxState-KD9NCIh4.js","/assets/VfxTimebooks-CXnlHGP1.js","/assets/VfxTimesheet-n3_L3v1G.js","/assets/WatchProgress-BtOLjoMZ.js","/assets/WebLogin-2LzCBPyK.js","/assets/WorkerConcerns-DOYKunnV.js","/assets/Workers-Dy3ag6XS.js","/assets/Zagruzka-DBWQujyI.js","/assets/ZagruzkaCell-Cs1EwHmL.js","/assets/api-Cs6Y77lw.js","/assets/archive-BiryWdGm.js","/assets/archive-restore-CKRNW1AI.js","/assets/arrow-down-wXqKVWZe.js","/assets/arrow-up-narrow-wide-Dw3paJui.js","/assets/award-DIbCzbRs.js","/assets/ban-BTCDULEn.js","/assets/boxes-BTQqu9Oo.js","/assets/braces-D-522Zof.js","/assets/brigadirFilters-CFMyMWxR.js","/assets/broadcastTree-CCqGYqmz.js","/assets/building-2-CnwZ0j2P.js","/assets/calculator-CeGHU8D-.js","/assets/calendar-CirowRGi.js","/assets/calendar-days-DzFe1K_A.js","/assets/camera-Cm36uj9p.js","/assets/categories-D_0-LYx_.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CwODgVE3.js","/assets/chart-line-CKKcXswn.js","/assets/chart-pie-QipOzFeK.js","/assets/chartRange-BE_a7NyU.js","/assets/check-check-C26pKzvk.js","/assets/chevron-left-B6_cbC5Z.js","/assets/chevrons-up-down-DgJP-duV.js","/assets/circle-BxX6iMFe.js","/assets/circle-alert-Cynvmr0p.js","/assets/circle-check-big-B9bQpd9n.js","/assets/circle-dashed-CsootHxD.js","/assets/circle-minus-DCefteUU.js","/assets/circle-question-mark-p8L9fRNd.js","/assets/circle-slash-B1c4GWSV.js","/assets/circle-user-round-BITxW-WT.js","/assets/clock-3-C2UZQlmI.js","/assets/cloud-off-eYvhREAH.js","/assets/cloud-upload-BRYveA3L.js","/assets/compass-BPrKFKS1.js","/assets/concernCategories-CXue1XAk.js","/assets/copy-DfT71opb.js","/assets/corner-down-right-9Zsebcq8.js","/assets/createLucideIcon-os1eDDO7.js","/assets/es-mn5EL218.js","/assets/external-link-CYk--HQg.js","/assets/file-clock-6kXl-ZS4.js","/assets/file-exclamation-point-6qQMFrSV.js","/assets/flag-CNqf9nGI.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-djfL-Yra.js","/assets/hash-QyEpXpO4.js","/assets/hourglass-OqEOkJER.js","/assets/image-D24zI72W.js","/assets/image-off-puibVdD_.js","/assets/inbox-BIczouaF.js","/assets/index-BYLu8eK_.css","/assets/index-CZTvD3rS.js","/assets/keyboard-DPdajZp9.js","/assets/languages-BJKWlQPj.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BpdlcS_X.js","/assets/lightbulb-DDT6qR5M.js","/assets/link-2-C6h-xqBX.js","/assets/link-2-off-DcEwUecO.js","/assets/list-ordered-DdNjn4Qp.js","/assets/list-tree-D3FGybJH.js","/assets/lock-open-wO7pVb3e.js","/assets/log-in-Dei9xZ8N.js","/assets/minimize-2-CHVTpR78.js","/assets/package-check-BPVF0hVl.js","/assets/pencil-D99cuQmA.js","/assets/percent-YSrVkCjT.js","/assets/pin-off-BAP-zLeJ.js","/assets/pin-tLQz3h-n.js","/assets/play-BHIPAg81.js","/assets/plug-zap-CrUptKWP.js","/assets/prop-types-CNPMbKfG.js","/assets/radio-CxZyLt54.js","/assets/react-apexcharts.esm-InxOSrWv.js","/assets/registers-BN0WXH_v.js","/assets/repeat-CSWgdrVh.js","/assets/rotate-cw-DtJRlxhr.js","/assets/save-u9SYEPdQ.js","/assets/scopeLinks-CKhemtsb.js","/assets/scroll-text-D25Wi4hG.js","/assets/search-x-uK5Hvpat.js","/assets/segments-C5r_qnJc.js","/assets/send-DCTCE_dp.js","/assets/settings-2-BBi9z9BP.js","/assets/shield-PmxIdl8m.js","/assets/shield-alert-BUBCY7Z4.js","/assets/shield-question-mark-SZ0n9qvW.js","/assets/siren-BpEQ6V0J.js","/assets/snowflake-DwUDZ2tL.js","/assets/split-DtqFmPrk.js","/assets/square-check-big-Cnhx7K2w.js","/assets/star-CuIeW0Nl.js","/assets/statusBands-BNEu2TYo.js","/assets/store-C21u3cmn.js","/assets/table-2-DAMsf5nr.js","/assets/table-properties-u80C_xyc.js","/assets/tag-ByQ_i10M.js","/assets/timer-off-ae7KhcXR.js","/assets/trending-down-BD46u08x.js","/assets/trending-up-1L5_s7oa.js","/assets/undo-2-CBPpPlVB.js","/assets/useChartTheme-D1KCd6Hz.js","/assets/useElementWidth-tgj-MNxy.js","/assets/useIsMobile--hh-VWEm.js","/assets/useOpenParam-COdC5mfY.js","/assets/useStatusBands-z2OuR61N.js","/assets/useUrlScope-C0UmJnv9.js","/assets/user-BekTW7gY.js","/assets/user-cog-BYhAqSdb.js","/assets/users-BrU3ZL8w.js","/assets/vfx-BCDLSDIx.js","/assets/video-e-LO_jRa.js","/assets/wallet-H8Wi5h9t.js","/assets/warehouse-B90g8y0M.js","/assets/x-BID3B9jE.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
