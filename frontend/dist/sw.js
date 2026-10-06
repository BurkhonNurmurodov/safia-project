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

const BUILD = "2026-10-06T17:58:56.441Z";
const PRECACHE = ["/","/assets/AdminPanel-D67VAl7E.js","/assets/AnalysisBoard-D_zf1_V8.js","/assets/Arc-DB4zOBmT.js","/assets/Assistant-BGj2B9UL.js","/assets/BrigadirProfile-CerO93WQ.js","/assets/BroadcastReceivers-BF0DGzTk.js","/assets/BroadcastRecord-G0H2v3ss.js","/assets/Button-Dwimc4Dv.js","/assets/CatLockNotice-DkPYN7Tp.js","/assets/CategoryLegendModal-DYRIrgHW.js","/assets/CellConcerns-CsuqBBbD.js","/assets/CellDetails-DeFxt1EX.js","/assets/CellFormModal-Depah2lK.js","/assets/CellIdent-BtwJ5KTS.js","/assets/CellLink-DQ3ypWFV.js","/assets/Cells-BHeb7vfC.js","/assets/ColumnFilter-DIEackrG.js","/assets/ColumnsPicker-CAvN7Rwp.js","/assets/CommentsModal-DvxbWqFb.js","/assets/ComparisonTable-BJKpejIi.js","/assets/Concerns-DO5zYD9x.js","/assets/Daily-DU-gnhNE.js","/assets/DataTable-BpmRANEu.js","/assets/DateRangePicker-BaDbJCoJ.js","/assets/DayReportView-DGnI0krW.js","/assets/DayStepper-DsxysGzN.js","/assets/DifferenceBreakdown-BSwOw_yK.js","/assets/Downtime-BdWspRGn.js","/assets/Education-CfxIq_OE.js","/assets/EducationLesson-deNG2F4j.js","/assets/EmptyState-dtEPmnZz.js","/assets/Exam-xgJoAd6G.js","/assets/FactorySelect-NAJjjxqs.js","/assets/Gamification-CPCjPkc0.js","/assets/GroupBadge-2v-qO0M8.js","/assets/HeatmapChart-BJmNy34a.js","/assets/IdleCell-b-GQP8HW.js","/assets/KPICard-D8FAvgCe.js","/assets/Kaizen-BU7hcrnX.js","/assets/Kelish-B0sECRf8.js","/assets/KpiDeltaCard-DiKjJt8A.js","/assets/LangTextInput-BmlQ84OM.js","/assets/Layout-DkDIid40.js","/assets/LeaderAppeal-DmsjUoeL.js","/assets/LeaderDayReport-qDEyFTE8.js","/assets/LeaderUnitReport-ByFN6sG5.js","/assets/Leaderboard-aZCU5h22.js","/assets/Leaders-D9j4nedm.js","/assets/Lightbox-CiLVlROX.js","/assets/LiveOverview-D5iUBL7r.js","/assets/Login-BDJOWuJD.js","/assets/NotFound-5sIIuCic.js","/assets/Notifications-Du4xuJi3.js","/assets/Overview-BOxYReMi.js","/assets/Pagination-mMU02C1f.js","/assets/PerenaladkaFactTable-B53in13l.js","/assets/PersonCard-DuPOdpEB.js","/assets/PlanFulfillment-DzoyHowH.js","/assets/Production-CsM3Y-ps.js","/assets/Profile-DLp2BR_M.js","/assets/ProofCamera-B7eNoDGT.js","/assets/ProofPhoto-DXb2wOiH.js","/assets/Quality-B7RYlqWs.js","/assets/RawRows-CJvH9FA7.js","/assets/RequestStateChip-DmTMRXHw.js","/assets/RichTextEditor-D-e7zl69.js","/assets/SaveState-BWDlYJW1.js","/assets/SearchInput-CyqqV2ah.js","/assets/SeasonalityHeatmap-FRvwcPu7.js","/assets/SegmentedToggle-BxNXhVcf.js","/assets/SetupTimes-BpjTmvvh.js","/assets/ShiftDaily-PokgAYz5.js","/assets/Staff-DDVnEbFc.js","/assets/StatusBadge-BESc2tQk.js","/assets/TargetGoal-CtRvvlk0.js","/assets/Targets-DOtdr6zp.js","/assets/Tasks-CuSadnHp.js","/assets/TimeWheelPicker-DlDWscCB.js","/assets/Toast-zLVwoWQy.js","/assets/Tooltip-DA1FvZNy.js","/assets/TrendChart-DYPn1pzg.js","/assets/TripleSpeedometer-BTjaPBXn.js","/assets/Trudoyomkost-CA-YGZDd.js","/assets/Turnover-DIJWVudR.js","/assets/UploadDropzone-DevK9K_F.js","/assets/UsersActivity-CNJqhlZU.js","/assets/VerdictBlock-D8DcXA-s.js","/assets/VfxApiMap-s7g6ND5J.js","/assets/VfxDictionaries-CeQ8aiR0.js","/assets/VfxEmployees-CnKwTfOS.js","/assets/VfxHrMoves-CKPMFcFL.js","/assets/VfxJobs-D6voHqxU.js","/assets/VfxPhoto-DZkrbE1r.js","/assets/VfxShifts-y8xN_2xE.js","/assets/VfxState-DP42HGAO.js","/assets/VfxTimebooks-Pt_fLJmM.js","/assets/VfxTimesheet-5jVGLxT0.js","/assets/WatchProgress-D-59G71Z.js","/assets/WebLogin-BB0RrAnY.js","/assets/WorkerConcerns-DRd4S1sZ.js","/assets/Workers-B0eQCWEU.js","/assets/Zagruzka-DlWiTBrX.js","/assets/ZagruzkaCell-DwD5N_QO.js","/assets/api-CQpxgH-m.js","/assets/archive-BGwnjVgr.js","/assets/archive-restore-DO6YwKeO.js","/assets/arrow-down-BIgFmw9c.js","/assets/arrow-up-narrow-wide-D_OI1p2x.js","/assets/award-Ct6EcE2O.js","/assets/ban-t7lkp9Sf.js","/assets/boxes-Bg3OIF1p.js","/assets/braces-B3h_lTEY.js","/assets/brigadirFilters-Ch1jNXpX.js","/assets/broadcastTree-CapIIN30.js","/assets/building-2-3O8XdDMl.js","/assets/calculator-KAbBrp9e.js","/assets/calendar-1XWZPInQ.js","/assets/calendar-days-cGwi8-E3.js","/assets/camera-esHq73zd.js","/assets/categories-DdGh4CE-.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-U1BxNtwo.js","/assets/chart-line-DSO7F8XL.js","/assets/chart-pie-DH-fU-jG.js","/assets/chartRange-D6v6rBvp.js","/assets/check-check-CgZJPoa3.js","/assets/chevron-left-BPjCQ4sd.js","/assets/chevrons-up-down-CNFlYZGW.js","/assets/circle-CgetvQOz.js","/assets/circle-alert-CvAiLiPQ.js","/assets/circle-check-big-CRIwsyQ_.js","/assets/circle-dashed-BTYGf1TM.js","/assets/circle-minus-xL7Mqk_7.js","/assets/circle-question-mark-fPx-41r4.js","/assets/circle-slash-D3A8-jDK.js","/assets/circle-user-round-D5zVALft.js","/assets/clock-3-DvbXVjz2.js","/assets/cloud-off-C9PcmHu7.js","/assets/cloud-upload-D2xe0AU3.js","/assets/compass-CvapHe-R.js","/assets/concernCategories-BMTpBxKt.js","/assets/copy-BVcsqABq.js","/assets/corner-down-right-BRnqdPlP.js","/assets/createLucideIcon-DDIxERPe.js","/assets/es-ze8jxXQk.js","/assets/external-link-Bqjav257.js","/assets/file-clock-Dw0LFZaz.js","/assets/file-exclamation-point-BFyAtlk4.js","/assets/flag-BwgVzypa.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D1hmeZif.js","/assets/hash-DleafgXT.js","/assets/hourglass-CQZ5BR_A.js","/assets/image-CYw7YcCR.js","/assets/image-off-X7oaXA2H.js","/assets/inbox-Ch-cgI3f.js","/assets/index-BYLu8eK_.css","/assets/index-F0Ykf1Po.js","/assets/keyboard-BT-RFovG.js","/assets/languages-CjPcMG2a.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DE3tSYgI.js","/assets/lightbulb-COb8GCkt.js","/assets/link-2-CGwEkYWH.js","/assets/link-2-off-D6Xq24ad.js","/assets/list-ordered-DzLlzHQq.js","/assets/list-tree-B-yib09N.js","/assets/lock-open-De_rbA5G.js","/assets/log-in-Cmq5GKYJ.js","/assets/minimize-2-i3u8h4UW.js","/assets/package-check-CsxcYm9E.js","/assets/pencil-HhVK23O4.js","/assets/percent-RpasmJLL.js","/assets/pin-ebZKEo2X.js","/assets/pin-off-DEMumaOv.js","/assets/play-EaYIuz6q.js","/assets/plug-zap-DmoBZweS.js","/assets/prop-types-BF7_16T0.js","/assets/radio-BmpXrB-K.js","/assets/react-apexcharts.esm-BZmL6c0i.js","/assets/registers-BrA1oWiK.js","/assets/repeat-CaqNaPRM.js","/assets/rotate-cw-vmlWRWZy.js","/assets/save-B4nF279d.js","/assets/scopeLinks-gAGeThKz.js","/assets/scroll-text-twOyojVl.js","/assets/search-x-zA74BoOM.js","/assets/segments-D6iWuj8Z.js","/assets/send-DTI1czAu.js","/assets/settings-2-Cl3WR72E.js","/assets/shield-DQzSorQr.js","/assets/shield-alert-CnMUQOej.js","/assets/shield-question-mark-1D5yDgYG.js","/assets/siren-BtWaK70w.js","/assets/snowflake-yHrTBt_j.js","/assets/split-ByHwNjwn.js","/assets/square-check-big-BJjjyrl7.js","/assets/star-D6AoadKr.js","/assets/statusBands-CIaSOt1-.js","/assets/store-CmML9Ydk.js","/assets/table-2-DUHTOCem.js","/assets/table-properties-CYDoRW7L.js","/assets/tag-sHHNqwd2.js","/assets/timer-off-BVI3t_5V.js","/assets/trending-down-dtzMFNgo.js","/assets/trending-up-CI1JjZcv.js","/assets/undo-2-DVyJvORH.js","/assets/useChartTheme-CoAFk2by.js","/assets/useElementWidth-C-Rmi555.js","/assets/useIsMobile-0_VQhaiR.js","/assets/useOpenParam-BaDWPba9.js","/assets/useStatusBands-CQ74XvE1.js","/assets/useUrlScope-0wevAju0.js","/assets/user-B8Jf34Xx.js","/assets/user-cog-UomhSNvd.js","/assets/users-C_n2-hvY.js","/assets/vfx-B04xdKVL.js","/assets/video-BCy43ufW.js","/assets/wallet-DIHgRivP.js","/assets/warehouse-CjRajnYN.js","/assets/x-DLwQvsRT.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
