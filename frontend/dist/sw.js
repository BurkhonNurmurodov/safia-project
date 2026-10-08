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

const BUILD = "2026-10-08T09:00:28.251Z";
const PRECACHE = ["/","/assets/AdminPanel-CkgMi5x5.js","/assets/AnalysisBoard-CTIh_ypc.js","/assets/Arc-Bj1R8lE0.js","/assets/Assistant-NKq_3Ao6.js","/assets/BrigadirProfile-BTiQfAd6.js","/assets/BroadcastReceivers-CVt1FmcQ.js","/assets/BroadcastRecord-LThEw3bQ.js","/assets/Button-DiVV7Qd2.js","/assets/CatLockNotice-IafTIeY2.js","/assets/CategoryLegendModal-DHsE9pPp.js","/assets/CellConcerns-8Hjc4BHm.js","/assets/CellDetails-BYjXzYJi.js","/assets/CellFormModal-wtKEvq-R.js","/assets/CellIdent-oFiZ7KLm.js","/assets/CellLink-DlbHz7im.js","/assets/Cells-BBPSGpCb.js","/assets/ColumnFilter-uTWuc5HC.js","/assets/ColumnsPicker-BM_38QpD.js","/assets/CommentsModal-Dh7w3ReA.js","/assets/ComparisonTable-AJvqGwT2.js","/assets/Concerns-CwnPvFH7.js","/assets/Daily-BR3M0o8M.js","/assets/DataTable-BOWR3OiW.js","/assets/DateRangePicker-BIGdsqGV.js","/assets/DayReportView-C6tqAh0K.js","/assets/DayStepper-Dly7bd5F.js","/assets/DifferenceBreakdown-IlnqOi-Y.js","/assets/Downtime-BL_rD1B_.js","/assets/Education-CaSncPKy.js","/assets/EducationLesson-Ddkvtqbj.js","/assets/EmptyState-YGuj-9-E.js","/assets/Exam-DMzO0_l3.js","/assets/FactorySelect-A4VnvQUy.js","/assets/Gamification-jH4lkrTo.js","/assets/GroupBadge-DI03Enno.js","/assets/HeatmapChart-CKGuSEtS.js","/assets/IdleCell-C4FhyQUo.js","/assets/KPICard-PWfwRNgj.js","/assets/Kaizen-C_G4cojo.js","/assets/Kelish-DtlNbrWn.js","/assets/KpiDeltaCard-DhsISR2D.js","/assets/LangTextInput-DDxyHHFS.js","/assets/Layout-Bxy0T_hw.js","/assets/LeaderAppeal-9e2ekMwx.js","/assets/LeaderDayReport-CxrhMED1.js","/assets/LeaderUnitReport-DeiFgTgD.js","/assets/Leaderboard--9zStsIu.js","/assets/Leaders-B10nfi4L.js","/assets/Lightbox-wcP0Pvm3.js","/assets/LiveOverview-BshnUhlW.js","/assets/Login-CLo8WvqF.js","/assets/NotFound-zbQ93tMf.js","/assets/Notifications-BG30Vfo5.js","/assets/Overview-BLs1Tguw.js","/assets/Pagination-CFawXnah.js","/assets/PerenaladkaFactTable-D3WtJPIr.js","/assets/PersonCard-DFVBQzjV.js","/assets/PlanFulfillment-DKFrcSC2.js","/assets/Production-Bx8-crsX.js","/assets/Profile-AYsA0kK_.js","/assets/ProofCamera-CKn-MmAK.js","/assets/ProofPhoto-Dq6oAVqJ.js","/assets/Quality-Cup6OstH.js","/assets/RawRows-BvW53LZQ.js","/assets/RequestStateChip-D4gk9KND.js","/assets/RichTextEditor-DzqCJfBs.js","/assets/SaveState-w_GlcHXA.js","/assets/SearchInput-CiHXUTTQ.js","/assets/SeasonalityHeatmap-g4KHPrVb.js","/assets/SegmentedToggle-CjG6bk7Q.js","/assets/SetupTimes-DGe7JKxh.js","/assets/ShiftDaily-DqnjDOMl.js","/assets/Staff-CYcpLuIz.js","/assets/StatusBadge-CYlSZk6g.js","/assets/TargetGoal-BSUYwgRK.js","/assets/Targets-Bzp6wwEz.js","/assets/Tasks-NDEYvdbO.js","/assets/TimeWheelPicker-cgfQgFN4.js","/assets/Toast-Db9eckGD.js","/assets/Tooltip-mZaNc244.js","/assets/TrendChart-iXhizQBp.js","/assets/TripleSpeedometer-BWa8nD_i.js","/assets/Trudoyomkost-BRAMb66H.js","/assets/Turnover-DVuTFR7g.js","/assets/UploadDropzone-CAPEDr9i.js","/assets/UsersActivity-DY6OXt0j.js","/assets/VerdictBlock-CGcYOrHh.js","/assets/VfxApiMap-BXcjSAI5.js","/assets/VfxDictionaries-p_bKRNoJ.js","/assets/VfxEmployees-56wNKpB9.js","/assets/VfxHrMoves-B8ihHdPK.js","/assets/VfxJobs-DM3MbFdL.js","/assets/VfxPhoto-CbsUuI6T.js","/assets/VfxShifts-BaKDkwTd.js","/assets/VfxState-CYNKJNSK.js","/assets/VfxTimebooks-Ct-cogwk.js","/assets/VfxTimesheet-Kyng-1k6.js","/assets/WatchProgress-D7rnZ9AA.js","/assets/WebLogin-BN_XB00D.js","/assets/WorkerConcerns-CmWN8SGu.js","/assets/Workers-D3PzUdHl.js","/assets/Zagruzka-CqZlp75W.js","/assets/ZagruzkaCell-DQgPtHOY.js","/assets/api-Z76IN9PH.js","/assets/archive-h415QK0Y.js","/assets/archive-restore-5z355cWH.js","/assets/arrow-down-DCX5cwUN.js","/assets/arrow-down-wide-narrow-CaSQ3uTY.js","/assets/arrow-up-narrow-wide-CIB9Ptah.js","/assets/award-DUBkF3UL.js","/assets/ban-D_vN8tTn.js","/assets/boxes-B8x_Txk4.js","/assets/braces-D3Lt9-Os.js","/assets/brigadirFilters-BfLt18NK.js","/assets/broadcastTree-BPg11qKG.js","/assets/building-2-Cp36H6KU.js","/assets/calculator-B17wjw4t.js","/assets/calendar-RbAFpO_U.js","/assets/calendar-days-ClmaGU3L.js","/assets/camera-CFzoYkLD.js","/assets/categories-Brp5Jque.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CPatrRFs.js","/assets/chart-line-CxCd5tQb.js","/assets/chart-pie-gIdFHA03.js","/assets/chartRange-DUVbg2vx.js","/assets/check-check-wZmog8TJ.js","/assets/chevron-left-DITvTMHk.js","/assets/chevrons-up-down-UmCsQRmG.js","/assets/circle-DaEhegyJ.js","/assets/circle-alert-3jDlCAS4.js","/assets/circle-check-big-Dd6fV5ia.js","/assets/circle-dashed-vcmjXfSB.js","/assets/circle-minus-D_HZGGdC.js","/assets/circle-question-mark-DA_cEiG6.js","/assets/circle-slash-B-z9Hj0v.js","/assets/circle-user-round-D7SuTAzd.js","/assets/clock-3-BD09C7uM.js","/assets/cloud-off-CG6d2Gx9.js","/assets/cloud-upload-CJswIVZG.js","/assets/compass-DPMeD3jE.js","/assets/concernCategories-Dfp_Dm9X.js","/assets/copy-C5BFohMQ.js","/assets/corner-down-right-Ct2oLGo4.js","/assets/createLucideIcon-Cng6DJy0.js","/assets/es-YG65uxpK.js","/assets/external-link-CKeY8BNU.js","/assets/file-clock-F2Si_hVl.js","/assets/file-exclamation-point-C8VNEf6-.js","/assets/flag-Dx7PCSrb.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CMWjO9Te.js","/assets/hash-BSTQ9TNq.js","/assets/hourglass-D3beK1VB.js","/assets/image-DGq1Ly0P.js","/assets/image-off-Bx3X3OJN.js","/assets/inbox-CbWO4TlF.js","/assets/index-0o4_u_tv.js","/assets/index-DFfGVOG_.css","/assets/keyboard-7Va2st1N.js","/assets/languages-C7mbAs1g.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Cqk19kO4.js","/assets/lightbulb-CRqklZAm.js","/assets/link-2-CPbYA6Md.js","/assets/link-2-off-C6YrpFPa.js","/assets/list-ordered-C6G6TwwS.js","/assets/list-tree-qLUHl8zI.js","/assets/lock-open-u78-WAZL.js","/assets/log-in-58On7Yfo.js","/assets/minimize-2-CWOoBuzg.js","/assets/package-check-Bzzl3c3q.js","/assets/pencil-BphghBlM.js","/assets/percent-z3kmpOH5.js","/assets/pin-BCbLdYP7.js","/assets/pin-off-C6OohYXM.js","/assets/play-BcuBBLH6.js","/assets/plug-zap-CS63-zug.js","/assets/prop-types-VlJHTMD4.js","/assets/radio-BezcgG1e.js","/assets/react-apexcharts.esm-XsXWQIdO.js","/assets/registers-F_EbqOMa.js","/assets/repeat-BwGNnWzb.js","/assets/save-C2CYvjcg.js","/assets/scopeLinks-DG1fnQY0.js","/assets/scroll-text-CjsizIDs.js","/assets/search-x-C0qDJpDY.js","/assets/segments-Dcb1dThW.js","/assets/send-BuUNjIaK.js","/assets/settings-2-CycTppCb.js","/assets/shield-Cs9ahSv1.js","/assets/shield-alert-BEfNzdf2.js","/assets/shield-question-mark-Dlq8O-Nj.js","/assets/siren-RGLKxgw9.js","/assets/snowflake-CnEOZwpo.js","/assets/split-B8Jgc2KO.js","/assets/square-check-big-C5Jb1vet.js","/assets/star-BtouJbc6.js","/assets/statusBands-DzT2uRgK.js","/assets/store-xcQ6UETB.js","/assets/table-2-1s-38hgM.js","/assets/table-properties-C2tPua8x.js","/assets/tag-B_E8SOln.js","/assets/timer-off-254vA3Ev.js","/assets/trending-down-DRbo9atW.js","/assets/trending-up-_UVWAuNO.js","/assets/undo-2-0kBYZX90.js","/assets/useChartTheme-BJQiD8jY.js","/assets/useElementWidth-D9bqppNZ.js","/assets/useIsMobile-BMRNRYaD.js","/assets/useOpenParam-BHJo7FeM.js","/assets/useStatusBands-A9Hs0qRz.js","/assets/useUrlScope-CgUOyZRS.js","/assets/user-cog-DeHBfUJr.js","/assets/user-g9sy41AW.js","/assets/users-DVUo9jSi.js","/assets/vfx-BYbfP-xs.js","/assets/video-CrnydyFk.js","/assets/wallet-77HiGOqu.js","/assets/warehouse-5kOgcanK.js","/assets/x-hddBuUVo.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
