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

const BUILD = "2026-10-03T18:11:44.019Z";
const PRECACHE = ["/","/assets/AdminPanel-J2-iFHa2.js","/assets/AnalysisBoard-EpcBn-z1.js","/assets/Arc-C2hErkN1.js","/assets/ArcLegacy-CgwJ7wuS.js","/assets/BrigadirProfile-fWTDZ7h4.js","/assets/BroadcastReceivers-COWeGdFF.js","/assets/BroadcastRecord-D1ICfjwS.js","/assets/CatLockNotice-5uMrSS1U.js","/assets/CategoryLegendModal-B_kJX86L.js","/assets/CellConcerns-Bbk0GUwe.js","/assets/CellDetails-PBf5Lepg.js","/assets/CellFormModal-CByXIhWO.js","/assets/CellIdent-bDc3w4-7.js","/assets/CellLink-B9xkBzTl.js","/assets/Cells-DFOq_J8T.js","/assets/ColumnFilter-Ckh3ZjZQ.js","/assets/ColumnsPicker-DLAVTn8V.js","/assets/CommentsModal-B3H6jSDh.js","/assets/ComparisonTable-CQzscy1a.js","/assets/Concerns-D-5xUmUv.js","/assets/ConfirmDialog-BHxDaSjv.js","/assets/Daily-Ci0fCJjE.js","/assets/DataTable-BgVNZrP-.js","/assets/DateRangePicker-D9Yb8HdO.js","/assets/DayReportView-CLySvntE.js","/assets/DayStepper-DUOIQrbc.js","/assets/DifferenceBreakdown-BYDIL6c1.js","/assets/Downtime-DM2cRTL4.js","/assets/Education-yWOE2sgY.js","/assets/EducationLesson-BgycFpH1.js","/assets/EmptyState-VsJ0V3A6.js","/assets/Exam-B22FqCJo.js","/assets/FactorySelect-COQdQ2Ab.js","/assets/Gamification-DDWdTJ17.js","/assets/GroupBadge-CON6V5Be.js","/assets/HeatmapChart-CTlOwHOD.js","/assets/IdleCell-Bm9d0yAk.js","/assets/KPICard-D34WoXcb.js","/assets/Kaizen-CwVRHOfZ.js","/assets/Kelish-Dk7Bbk1q.js","/assets/KpiDeltaCard-Da4RHLUP.js","/assets/LangTextInput-D0G6kY5H.js","/assets/Layout-DBkZQMz6.js","/assets/LeaderAppeal-DlZw9FwZ.js","/assets/LeaderDayReport-pyr-jK0L.js","/assets/LeaderUnitReport-CJBIm-7_.js","/assets/Leaderboard-tXYinL4t.js","/assets/Leaders-DgC6nZXJ.js","/assets/Lightbox-Bokzj7LJ.js","/assets/LiveOverview-BcKvgDK0.js","/assets/Login-iTzrti15.js","/assets/NotFound-DcIaLKNh.js","/assets/Notifications-P5bpdeBs.js","/assets/Overview-5O60ViHT.js","/assets/Pagination-BhESyfvT.js","/assets/PerenaladkaFactTable-BZYshkyI.js","/assets/PersonCard-BE7_niQg.js","/assets/PlanFulfillment-C6n-LkQb.js","/assets/Production-Cpajj7u8.js","/assets/Profile-CkDlx8pz.js","/assets/ProofCamera-Ci27mWtE.js","/assets/ProofPhoto-CN-CwIvI.js","/assets/Quality-BjnWxX0p.js","/assets/RawRows-BzJqbMt9.js","/assets/RequestStateChip-DORLjnyt.js","/assets/RichTextEditor-8A-OcFCi.js","/assets/SaveState-CCBVwCU9.js","/assets/SearchInput-aslRU9BJ.js","/assets/SeasonalityHeatmap-hrARB-8k.js","/assets/SegmentedToggle-Bsyp4ZgZ.js","/assets/SetupTimes-59Fv2jB6.js","/assets/ShiftDaily-kHueZwWD.js","/assets/Staff-Cko4k7DJ.js","/assets/StaffLive-CfhHu61C.js","/assets/StatusBadge-VYSP2jY-.js","/assets/TargetGoal-DUfgAiN4.js","/assets/Targets-kIzta8ZB.js","/assets/Tasks-BrSPJudI.js","/assets/TimeWheelPicker-B-PxXLww.js","/assets/Toast-DXyNfGRQ.js","/assets/Tooltip-Czeu_p_E.js","/assets/TrendChart-lW0zuSdt.js","/assets/TripleSpeedometer-DsXN9i0T.js","/assets/Trudoyomkost-DUiZWHdt.js","/assets/UploadDropzone-CYp1Qsnq.js","/assets/UsersActivity-DIrTRTzp.js","/assets/VerdictBlock-tABNlDRV.js","/assets/VfxAbsences-CpyCsluY.js","/assets/VfxApiMap-091gLN1V.js","/assets/VfxDevices-BnkT7jyI.js","/assets/VfxDictionaries-CwhuT1hN.js","/assets/VfxEmployees-DceARZHX.js","/assets/VfxHrMoves-BfowATi7.js","/assets/VfxIncidents-D0vfrKA_.js","/assets/VfxJobs-BX-3YS78.js","/assets/VfxMarks-Bq7wy5FN.js","/assets/VfxOnSite-Dxwa_Mnf.js","/assets/VfxPhoto-CF-KrHQk.js","/assets/VfxRequests-BD_y-6eQ.js","/assets/VfxShifts-Bg8FG1pI.js","/assets/VfxState-DrUt7Qr8.js","/assets/VfxStructure-D6ZBrEYa.js","/assets/VfxTable-B80cxn-S.js","/assets/VfxTimebooks-BH0BR4BC.js","/assets/VfxTimesheet-I2Gquf4m.js","/assets/WatchProgress-BKdFgxXi.js","/assets/WebLogin-DSKoORdY.js","/assets/WorkerConcerns-BwGQxCsW.js","/assets/Workers-BySkrdVq.js","/assets/Zagruzka-Dwp1Akyv.js","/assets/ZagruzkaCell-BK7RrybP.js","/assets/api-BipzbPif.js","/assets/archive-DnmQaCUj.js","/assets/archive-restore-CnY2qZz2.js","/assets/arrow-down-CZd_EdAr.js","/assets/arrow-left-B-tayWUJ.js","/assets/arrow-up-DnhR5Obl.js","/assets/arrow-up-narrow-wide-KkLjDy_h.js","/assets/arrow-up-right-CfLrrx1x.js","/assets/award-B8hr9Sgf.js","/assets/ban-BByBK3j0.js","/assets/bot-DVtrbqZk.js","/assets/boxes-D2S4UGoN.js","/assets/braces-DNvqrYFU.js","/assets/brigadirFilters-Bb41_pZb.js","/assets/broadcastTree-swH8FN-M.js","/assets/building-2-mu3iK7Qu.js","/assets/calendar-DzAYRrJ7.js","/assets/calendar-days-CkbYzfCk.js","/assets/camera-BXQJlC3T.js","/assets/categories-CE-Rgr8S.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-TQqHUJc6.js","/assets/chart-line-BgEwoUda.js","/assets/chart-pie-BjDKYfuw.js","/assets/chartRange-BjaEFp8L.js","/assets/check-check-DV4lQ4V-.js","/assets/chevron-left-CcT7BS5Y.js","/assets/chevrons-up-down-WqyOd14i.js","/assets/circle-alert-Cn7VDjdq.js","/assets/circle-check-big-BUtV9MnC.js","/assets/circle-dashed-B2aas-n3.js","/assets/circle-gMlzE5FT.js","/assets/circle-minus-DVolA8Nq.js","/assets/circle-question-mark-LHJ6h_lL.js","/assets/circle-slash-BLSy-QvS.js","/assets/circle-user-round-D7eYOc3t.js","/assets/clock-3-CnNj0A2H.js","/assets/cloud-off-c6dzNN3h.js","/assets/cloud-upload-DBg72MVF.js","/assets/compass-CgDUbHbQ.js","/assets/concernCategories-C4dTK1_6.js","/assets/copy-DddfawtJ.js","/assets/corner-down-right-C9UYsZaU.js","/assets/createLucideIcon-D0pZTdAV.js","/assets/door-open-vrWpBNfZ.js","/assets/es-9RgzY2_h.js","/assets/exportXlsx-CpA2oxaf.js","/assets/external-link-BU6I4LGW.js","/assets/file-clock-B5kL2SI_.js","/assets/file-exclamation-point-B1FIw7ES.js","/assets/file-spreadsheet-Bjq2IZyR.js","/assets/file-text-BuOVk2r4.js","/assets/flag-DZ1TDSdZ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-XPaZqPWY.js","/assets/hash-zaWjP5XI.js","/assets/history-z8Zxt9Tw.js","/assets/hourglass-OycCCyzq.js","/assets/image-Pauy7uSQ.js","/assets/image-off-B-RKy4xt.js","/assets/index-1oV3oyvQ.css","/assets/index-CyW-Ep7L.js","/assets/key-round-CRMXiEC2.js","/assets/keyboard-C5EzN96I.js","/assets/languages-Dl2gF2vH.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-6RfILWkN.js","/assets/lightbulb-B1ulIcKA.js","/assets/link-2-C-k7TJcN.js","/assets/link-2-off-DlVhAwH0.js","/assets/list-filter-BOUiRrJV.js","/assets/list-ordered-B35993Se.js","/assets/list-tree-HMKfHM1R.js","/assets/lock-open-uiivazei.js","/assets/log-in-C7lOSCAc.js","/assets/maximize-2-C0-ZSMxJ.js","/assets/message-square-mcya_qQU.js","/assets/minimize-2-BSup12KH.js","/assets/package-check-B8ZTZZYa.js","/assets/paperclip-050jKcGI.js","/assets/pencil-C_IkzFwP.js","/assets/percent-DpjS4G_l.js","/assets/phone-DC_Zawfr.js","/assets/pin-BQADamni.js","/assets/pin-off-BPbYN-tr.js","/assets/play-D32I0zb_.js","/assets/plug-zap-DeXQ481w.js","/assets/presentation-DwahjnL6.js","/assets/prop-types-mceFRWkF.js","/assets/radio-DTjJIbtx.js","/assets/react-apexcharts.esm-BgpLcAgl.js","/assets/registers-FeSDuAJs.js","/assets/repeat-DMmBvGb0.js","/assets/rotate-ccw-BeIYA4Cr.js","/assets/rotate-cw-BnC_7RZS.js","/assets/save-BBAud7pj.js","/assets/scopeLinks-DPfE81Rr.js","/assets/scroll-text-BMdlf7o4.js","/assets/search-x-DPfo996P.js","/assets/segments-DksRcKwI.js","/assets/send-CrkNFAv8.js","/assets/settings-2-DcUj0anw.js","/assets/shield-Dy3ivd5T.js","/assets/shield-alert-CsBdkCIh.js","/assets/shield-check-vSAZdwJe.js","/assets/shield-question-mark-DcTJ-Lr8.js","/assets/snowflake-B6gfCnSc.js","/assets/split-SH5lWvHq.js","/assets/square-DnqXZmMx.js","/assets/square-check-big-Q7ajnN8u.js","/assets/star-BrHv-CCM.js","/assets/statusBands-D9_qc4mH.js","/assets/store-CoVJjTBe.js","/assets/table-2-Bhe5xblr.js","/assets/table-properties-CUn1w0EB.js","/assets/tag-wsOkJ_Hu.js","/assets/tags-DO7l1QwX.js","/assets/timer-off-DVGn4wPL.js","/assets/trending-down-CVD9QDNH.js","/assets/trending-up-BLyaooZf.js","/assets/undo-2-z21ELGlQ.js","/assets/useChartTheme-C_WPDZMU.js","/assets/useElementWidth-B41ALOkG.js","/assets/useIsMobile-DQU-bi0B.js","/assets/useOpenParam-F4TUR03q.js","/assets/useStatusBands-ZG9uXlxo.js","/assets/useUrlScope-cQ1yS82h.js","/assets/user-Ct8FCZos.js","/assets/user-cog-CEvcfwo5.js","/assets/user-minus-Czpv5GWv.js","/assets/users-DBLFB_6Z.js","/assets/video-iL2wFto5.js","/assets/wallet-qRBJwjtV.js","/assets/warehouse-8dpytsny.js","/assets/x-BsLtZ4Fy.js","/assets/zap-CUPBkd4Y.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
