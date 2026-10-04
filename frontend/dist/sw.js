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

const BUILD = "2026-10-04T14:45:10.469Z";
const PRECACHE = ["/","/assets/AdminPanel-BthtpA2g.js","/assets/AnalysisBoard-C-FWM2Cv.js","/assets/Arc-BCGlN_b_.js","/assets/ArcLegacy-CTzkiKx0.js","/assets/BrigadirProfile-BWirZcfr.js","/assets/BroadcastReceivers-BbZp393F.js","/assets/BroadcastRecord-BbI7Ix0T.js","/assets/CatLockNotice-DEMMu75t.js","/assets/CategoryLegendModal-CqdpL5MV.js","/assets/CellConcerns-BRqh5Tvq.js","/assets/CellDetails-DEGobdcy.js","/assets/CellFormModal-DR7J-d7d.js","/assets/CellIdent-Dkw9IiXp.js","/assets/CellLink-CapG4yHU.js","/assets/Cells-KPdi6bIz.js","/assets/ColumnFilter-BzCQvBlT.js","/assets/ColumnsPicker-LObxQf4t.js","/assets/CommentsModal-xAm1a8VF.js","/assets/ComparisonTable-DokpiVXB.js","/assets/Concerns-DIcO1UGs.js","/assets/ConfirmDialog-BT6-oFqT.js","/assets/Daily-HexH5agh.js","/assets/DataTable-FN_Ah86k.js","/assets/DateRangePicker-HXCrKr-1.js","/assets/DayReportView-CR_8YBNR.js","/assets/DayStepper-B8Hw9lEj.js","/assets/DifferenceBreakdown-Y2kPxyLg.js","/assets/Downtime-D3a-NOTJ.js","/assets/Education-BjkVsYwW.js","/assets/EducationLesson-Bj1lrGaW.js","/assets/EmptyState-CzFwkgYA.js","/assets/Exam-Dt9fK4g3.js","/assets/FactorySelect-DN-nzl0I.js","/assets/Gamification-BQ0xDMge.js","/assets/GroupBadge-Cch8G47L.js","/assets/HeatmapChart-DZuwHfiY.js","/assets/IdleCell-DDVVDlZG.js","/assets/KPICard-8so1rkxa.js","/assets/Kaizen-Cma8BvHq.js","/assets/Kelish-h8BtF_L5.js","/assets/KpiDeltaCard-BGO35U-V.js","/assets/LangTextInput-lkYsm7Le.js","/assets/Layout-dk-ssgUu.js","/assets/LeaderAppeal-C_FzH6QY.js","/assets/LeaderDayReport-I_v83pWY.js","/assets/LeaderUnitReport-DH5Ypj0e.js","/assets/Leaderboard-DN58dIdL.js","/assets/Leaders-iZ7-t9kx.js","/assets/Lightbox-W6MO01fc.js","/assets/LiveOverview-Dq9qUnGL.js","/assets/Login-0Gxua2LU.js","/assets/NotFound-DByj6dm7.js","/assets/Notifications-CffWUV0C.js","/assets/Overview-yzJQHyM3.js","/assets/Pagination-D8PXmJEP.js","/assets/PerenaladkaFactTable-CprPvPlJ.js","/assets/PersonCard-Bfz6zjQ_.js","/assets/PlanFulfillment-D-RiY8uR.js","/assets/Production-D1I8q8t-.js","/assets/Profile-CiFCnR7P.js","/assets/ProofCamera-C8maKdPv.js","/assets/ProofPhoto-DIB6d-M5.js","/assets/Quality-Db1uHhGr.js","/assets/RawRows-nDSMK5Sr.js","/assets/RequestStateChip-2_0AZyMJ.js","/assets/RichTextEditor-jKl36RvU.js","/assets/SaveState-wMPudLbP.js","/assets/SearchInput-37drbP3T.js","/assets/SeasonalityHeatmap-mvMj2woo.js","/assets/SegmentedToggle-DM0m88Cc.js","/assets/SetupTimes-B-keJkha.js","/assets/ShiftDaily-CmTuYwh2.js","/assets/Staff-LjhZSTGd.js","/assets/StaffLive-DSx1KjIQ.js","/assets/StatusBadge-BMFNntgp.js","/assets/TargetGoal-CduoLrqq.js","/assets/Targets-aABgoNVG.js","/assets/Tasks-ClCAe0Cd.js","/assets/TimeWheelPicker-ZV5axttK.js","/assets/Toast-CjLn3zAV.js","/assets/Tooltip-pdPBE0_o.js","/assets/TrendChart-BzTJFhVX.js","/assets/TripleSpeedometer-vxrwWVoI.js","/assets/Trudoyomkost-D1z2qtwl.js","/assets/Turnover-D4HwvAfT.js","/assets/UploadDropzone-CU_Pn-t-.js","/assets/UsersActivity-f-771l2O.js","/assets/VerdictBlock-CDefonIJ.js","/assets/VfxApiMap-DF2329HN.js","/assets/VfxDictionaries-DheZPQ7x.js","/assets/VfxEmployees-DKfj1v9s.js","/assets/VfxHrMoves-C0MB5TsH.js","/assets/VfxJobs-4DC-qm9J.js","/assets/VfxPhoto-DVCgKeOt.js","/assets/VfxShifts-CDBhLLlR.js","/assets/VfxState-DyYx4YDx.js","/assets/VfxTimebooks-Cv3_tmKE.js","/assets/VfxTimesheet-BgpvohFI.js","/assets/WatchProgress-BIpPuWHX.js","/assets/WebLogin-9J2t7YDE.js","/assets/WorkerConcerns-DmkwxhRY.js","/assets/Workers-RirpPatd.js","/assets/Zagruzka-BNiJR5Xh.js","/assets/ZagruzkaCell-BNI8Bw9W.js","/assets/api-B6WtbSud.js","/assets/archive-DyDtprSi.js","/assets/archive-restore-DkMR0A7i.js","/assets/arrow-down-DgwzBbuF.js","/assets/arrow-left-B6Vi_HXT.js","/assets/arrow-up-Cm_P49I_.js","/assets/arrow-up-narrow-wide-DUUkfU2h.js","/assets/arrow-up-right-BMGBmxtC.js","/assets/award-BAl6HFBO.js","/assets/ban-B4BJrPl3.js","/assets/book-open-irsrhG_I.js","/assets/bot-D16SazNJ.js","/assets/boxes-Bj_ggKLu.js","/assets/braces-2V0UzrJc.js","/assets/brigadirFilters-WR4FWCNi.js","/assets/broadcastTree-41CNZ28b.js","/assets/building-2-Co6kD-3h.js","/assets/calculator-DwXGRxSD.js","/assets/calendar-Cj09cix_.js","/assets/calendar-days-CVmR-6de.js","/assets/camera-D5zHxOzB.js","/assets/categories-D0OD9diP.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DplnKyPl.js","/assets/chart-line-2n_ZPinB.js","/assets/chart-pie-C5ug19t_.js","/assets/chartRange-DTTe8FM7.js","/assets/check-check-DDQHcCn4.js","/assets/chevron-left-W5XJIiGF.js","/assets/chevrons-up-down-CxN_Qvq8.js","/assets/circle-DqlY1O1A.js","/assets/circle-alert-BFSw0Rqo.js","/assets/circle-check-big-nq_Sshed.js","/assets/circle-dashed-Cce3Hmy7.js","/assets/circle-minus-ChsmQGML.js","/assets/circle-question-mark-9yV969hQ.js","/assets/circle-slash-CPQS7nDr.js","/assets/circle-user-round-CfwOrWd9.js","/assets/clock-3-kFMt3vl8.js","/assets/cloud-off-D_k5VgY3.js","/assets/cloud-upload-rjQ_IefD.js","/assets/compass-BuXJkuq6.js","/assets/concernCategories-C32oc_dE.js","/assets/copy-C7DbGvc2.js","/assets/corner-down-right-jJk2ueqA.js","/assets/createLucideIcon-tpl9eWud.js","/assets/es-D6uoTTAq.js","/assets/exportXlsx-DObmXlri.js","/assets/external-link-D7s1oxTV.js","/assets/file-clock-BZCNldDh.js","/assets/file-exclamation-point-B_ppEoK7.js","/assets/file-spreadsheet-C0q-i01P.js","/assets/file-text-BI1pjC1F.js","/assets/flag-BTebdOZR.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CIirJhkD.js","/assets/hash-LnOZBHi6.js","/assets/history-DMOukK9g.js","/assets/hourglass-F_E0uLSu.js","/assets/image-L_M3Sj5C.js","/assets/image-off-DUPILsj1.js","/assets/inbox-MQ5ocEMZ.js","/assets/index-1nFePouY.js","/assets/index-BVd-uVFM.css","/assets/key-round-DPTszLML.js","/assets/keyboard-K0p_f9Yb.js","/assets/languages-D-t0-lJM.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DuOUWn4j.js","/assets/lightbulb-JQ38Ihsm.js","/assets/link-2-BibK51Un.js","/assets/link-2-off-BP1lU89B.js","/assets/list-ordered-ltUWtv05.js","/assets/list-tree-xn6uDwom.js","/assets/lock-open-DXAwRVIJ.js","/assets/log-in-D3o-TQHc.js","/assets/maximize-2-BL255VN_.js","/assets/message-square-RQlO-xpb.js","/assets/minimize-2-VI46gCOV.js","/assets/package-check-CfD1Kw-V.js","/assets/paperclip-CsstmGmA.js","/assets/pencil-Czrgrsx6.js","/assets/percent-CupIOHzp.js","/assets/pin-D6AezK3m.js","/assets/pin-off-BS5wrYfA.js","/assets/play-DvyZp-d8.js","/assets/plug-zap-BsKoNmAs.js","/assets/presentation-v6nlsphn.js","/assets/prop-types-CEAHwOg_.js","/assets/radio-pF-nil9H.js","/assets/react-apexcharts.esm-BZWylKHq.js","/assets/registers-BaDsT_wt.js","/assets/repeat-ChUS31t1.js","/assets/rotate-ccw-ztbbMOCJ.js","/assets/rotate-cw-pkFhmZpw.js","/assets/save-xnzRHcNB.js","/assets/scopeLinks-CnnfDW2i.js","/assets/scroll-text-C_UKE5Wb.js","/assets/search-x-NHvsAOQ3.js","/assets/segments-BUxrwacM.js","/assets/send-YMwzWp0B.js","/assets/settings-2-e76CKhn3.js","/assets/shield-CtySmRd_.js","/assets/shield-alert-CQTMah5t.js","/assets/shield-check-BOAmoiTZ.js","/assets/shield-question-mark-BwdSnUR5.js","/assets/siren-BgcrDs1O.js","/assets/snowflake-BDtSMMxN.js","/assets/split-BL25-_tC.js","/assets/square-DYp6Zbx6.js","/assets/square-check-big-CQdbBQZp.js","/assets/star-CsFMRuKR.js","/assets/statusBands-C5M8QFdJ.js","/assets/store-BdE4hxXw.js","/assets/table-2-Can_HCoH.js","/assets/table-properties-D1SWe3Rz.js","/assets/tag-D3ElmMtN.js","/assets/timer-off-CX-mG-Vi.js","/assets/trending-down-Du-AgdW5.js","/assets/trending-up-CUJGNw3w.js","/assets/undo-2-CDEdcwJc.js","/assets/useChartTheme-6rIn0VoK.js","/assets/useElementWidth-CYpOkyuJ.js","/assets/useIsMobile-Zf2GsMCT.js","/assets/useOpenParam-CqnBIHC9.js","/assets/useStatusBands-BNYlEtFm.js","/assets/useUrlScope-yuBPyYVM.js","/assets/user-0d6T2yRb.js","/assets/user-cog-ONGtnjnc.js","/assets/users-CTDDkf87.js","/assets/vfx-D6g6inPN.js","/assets/video-Biewye4T.js","/assets/wallet-B3Au4bQa.js","/assets/warehouse-BTxAzNEd.js","/assets/x-DBt88Gge.js","/assets/zap-CLFW2UAL.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
