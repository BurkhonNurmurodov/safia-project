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

const BUILD = "2026-10-23T12:06:34.364Z";
const PRECACHE = ["/","/assets/AdminPanel-r9_GQ93v.js","/assets/AnalysisBoard-RfEvUSst.js","/assets/Arc-Btr_5wN6.js","/assets/Assistant-CqdxOZvF.js","/assets/BrigadirProfile-35UQ6XvO.js","/assets/BroadcastReceivers-CrBD6gsA.js","/assets/BroadcastRecord-CWb4WrsB.js","/assets/Button-CoP4vCrk.js","/assets/CatLockNotice-CWy7QJy0.js","/assets/CategoryLegendModal-B8zJm_9b.js","/assets/CellConcerns-COOG5iGA.js","/assets/CellDetails-DmPLHU3r.js","/assets/CellFormModal-DiPACVx5.js","/assets/CellIdent-Cm828-xF.js","/assets/CellLink-Dck56hGT.js","/assets/Cells-BU864rQL.js","/assets/ColumnFilter-DDCBd4Cq.js","/assets/ColumnsPicker-BVk-U1Ny.js","/assets/CommentsModal-SINkjc_W.js","/assets/ComparisonTable-O5RCTbrf.js","/assets/Concerns-a26jQe17.js","/assets/CountStepper-BMrWTCpM.js","/assets/Daily-BGDB7e9Z.js","/assets/DataTable-DZSybau4.js","/assets/DateRangePicker-BcN_oUWZ.js","/assets/DayReportView-BrCwZgmv.js","/assets/DayStepper-CVmgdMzT.js","/assets/DayStrip-C4cq0aRT.js","/assets/DifferenceBreakdown-CxIZh_wH.js","/assets/Downtime-CVhCBxF_.js","/assets/Education-D-PqqLZq.js","/assets/EducationLesson-BabMQjXH.js","/assets/EmptyState-BZFUEiCu.js","/assets/Exam-11tSXhPf.js","/assets/FactorySelect-DnaGAF8Y.js","/assets/Gamification-hit7YhbE.js","/assets/GroupBadge-C7Y85GY2.js","/assets/HeatmapChart-Djbdc2Uv.js","/assets/IdleCell-zc2Fy7Uo.js","/assets/KPICard-CG3kTNj1.js","/assets/Kaizen-BbHGxtC_.js","/assets/Kelish-CHYJ_yUK.js","/assets/KpiDeltaCard-PvJyydQR.js","/assets/LangTextInput-C5eST8P5.js","/assets/Layout-FHbUGlTI.js","/assets/LeaderAppeal-CS1wNWi1.js","/assets/LeaderDayReport-w21m9Nx2.js","/assets/LeaderUnitReport-CC76rFf4.js","/assets/Leaderboard-B3uXOveE.js","/assets/Leaders-BdjKr-Cj.js","/assets/LeadersKpi-CUsTmTzE.js","/assets/Lightbox-cIDQ2_Um.js","/assets/LiveOverview-COjRfK1e.js","/assets/Login-DfDP-nDK.js","/assets/NotFound-Bq-lkrUR.js","/assets/Notifications-BnxbmSe0.js","/assets/Ontime-ToWMMzBD.js","/assets/Overview-BHQ-9JCg.js","/assets/Pagination-C-muBwaf.js","/assets/PerenaladkaFactTable-DSa4LSDi.js","/assets/PersonCard-B07aQr60.js","/assets/PlanFulfillment-YnecwSmv.js","/assets/Production-CYbHhFkZ.js","/assets/Profile-Dkxxkd6A.js","/assets/ProofCamera-BmKNrC0d.js","/assets/ProofPhoto-CIoVnp_g.js","/assets/Quality-HHkTuWiX.js","/assets/RawRows-B9RxIfuQ.js","/assets/RequestStateChip-CIZSrzGG.js","/assets/RichTextEditor-CabqU7vQ.js","/assets/SaveState-F9bXmMwb.js","/assets/SearchInput-BpXa-KMI.js","/assets/SeasonalityHeatmap-Br-rCZ7A.js","/assets/SegmentedToggle-CAl2KPMq.js","/assets/SetupTimes-BAzE_9Wt.js","/assets/ShiftDaily-CR2QccsN.js","/assets/Staff-D7qp-7Q4.js","/assets/StaffListAtCheck-2aUvvjXv.js","/assets/StatusBadge-DoGt2IUV.js","/assets/StatusBandsModal-BOD-aFjb.js","/assets/TargetGoal-BkhRb0HD.js","/assets/Targets-BWLSyjuR.js","/assets/Tasks-Bov-a2zS.js","/assets/TimeWheelPicker-DMruqBxK.js","/assets/Toast-BdRlXNCF.js","/assets/Tooltip-Cg6rIbk-.js","/assets/TrendChart-bUfRK8XZ.js","/assets/TripleSpeedometer-Bii-ePM7.js","/assets/Trudoyomkost-DS6CS_wA.js","/assets/UploadDropzone-DhFmwL3a.js","/assets/UsersActivity-DKvqu-1X.js","/assets/VerdictBlock-CQSp-wQ1.js","/assets/VfxApiMap-DoGHkHyx.js","/assets/VfxDictionaries-D87tL3_J.js","/assets/VfxEmployees-DLceweSz.js","/assets/VfxHrMoves-Bay-5smW.js","/assets/VfxJobs-E2L0Wd_V.js","/assets/VfxPhoto-SsCDuGLx.js","/assets/VfxShifts-QXz6OIcL.js","/assets/VfxState-BQrZIHAg.js","/assets/VfxTimebooks-BDDUzXh3.js","/assets/VfxTimesheet-DRX10IWG.js","/assets/WatchProgress-D6gBRG0H.js","/assets/WebLogin-BCT6LiNr.js","/assets/Workers-gosyldxB.js","/assets/Zagruzka-Bl7XtSEQ.js","/assets/ZagruzkaCell-CMvqN6lZ.js","/assets/api-9bHG1BYE.js","/assets/archive-CSlYB3LZ.js","/assets/archive-restore-DgQ-0TtB.js","/assets/arrow-down-Cm07Exmv.js","/assets/arrow-down-right-Bv3y0ACI.js","/assets/arrow-down-wide-narrow-xMxMCgBu.js","/assets/arrow-up-narrow-wide-DG05tGJo.js","/assets/ban-CjTMKt8s.js","/assets/boxes-CEwaWVXo.js","/assets/braces-DMWUf5V2.js","/assets/brigadirFilters-CxTJOqPa.js","/assets/broadcastTree-Ckm9X_Zm.js","/assets/building-2-QzyiE4xt.js","/assets/calendar-BYEAJvLf.js","/assets/calendar-days-q4PCZaJA.js","/assets/camera-OtPg46qe.js","/assets/categories-uTC3OYN0.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CiM0ITHU.js","/assets/chart-line-COQgCfWE.js","/assets/chart-pie-BaNNqZT7.js","/assets/chartRange-BWDBl-3V.js","/assets/check-check-CDzJIMw4.js","/assets/chevron-left-D1jopxyJ.js","/assets/chevrons-up-down-D6tjVNtT.js","/assets/circle-DQdxKg92.js","/assets/circle-alert-DbVX6HhR.js","/assets/circle-check-big-BHNg9wA1.js","/assets/circle-dashed-DOYe_7v7.js","/assets/circle-minus-BHKI8208.js","/assets/circle-question-mark-Dw7j6LF-.js","/assets/circle-slash-D5GGmgJ8.js","/assets/circle-user-round-Dfu4G3vN.js","/assets/cloud-off-Xx8oQS4N.js","/assets/cloud-upload-BB0Iowl4.js","/assets/compass-3l0Qr4J-.js","/assets/concernCategories-DEvDZB_u.js","/assets/corner-down-right-KS-xbLYq.js","/assets/createLucideIcon-Dheas3-p.js","/assets/es-DWoi4FqO.js","/assets/external-link-Cpm_z1_L.js","/assets/file-clock-zd_B5J0T.js","/assets/file-exclamation-point-B3J8NkiO.js","/assets/flag-DMYdsVHZ.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CQql0Ua8.js","/assets/funnel-BU5J2fSo.js","/assets/hash-BFM9EbOm.js","/assets/hourglass-CaCvBmsh.js","/assets/image-D0ctr0HC.js","/assets/image-off-DiFU_zzt.js","/assets/inbox-CGzvRwqK.js","/assets/index-B3H-Scj-.css","/assets/index-DVbl6wIg.js","/assets/keyboard-D0XmQuli.js","/assets/languages-B3J-rGeh.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DnO_A2iB.js","/assets/leaderBoard-BRZcjdQC.js","/assets/lightbulb-DFlFwxXv.js","/assets/link-2-D6AMFZXH.js","/assets/link-2-off-C1nB2PsY.js","/assets/list-ordered-DYuOg4CV.js","/assets/list-tree-DWvOtZpQ.js","/assets/lock-open-CYyj7oA1.js","/assets/log-in-DjwFkL5F.js","/assets/marks-C1fQ9ReJ.js","/assets/minimize-2-C2mV6KYv.js","/assets/package-check-DYQP1Qt6.js","/assets/pencil-B7gccqKV.js","/assets/percent-BBUZIAks.js","/assets/pin-BokHRyIa.js","/assets/pin-off-CnyzC8Fu.js","/assets/play-CSI2aACg.js","/assets/plug-zap-DVq8E99N.js","/assets/prop-types-BlyMCZjo.js","/assets/radio-CWILYgAs.js","/assets/react-apexcharts.esm-DFI0JqMB.js","/assets/registers-CZWcNobr.js","/assets/repeat-DMtWOjLE.js","/assets/save-eswKgHVA.js","/assets/scopeLinks-BELa0zIQ.js","/assets/scroll-text-DhNeCcGx.js","/assets/search-x-BVFbtvmY.js","/assets/segments-DaxUYlUv.js","/assets/send-V1cJiRgu.js","/assets/settings-2-DC9OugBM.js","/assets/shield-alert-Ii-EMfre.js","/assets/shield-question-mark-32r2X8qZ.js","/assets/shield-sYWJzTTo.js","/assets/sigma-DK2k7Kxw.js","/assets/siren-C4Vi27uK.js","/assets/snowflake-D_lcCluf.js","/assets/split-BCHzL590.js","/assets/square-check-big-BAlhIT_9.js","/assets/star-CX0b6_YM.js","/assets/statusBands-Bb4_wR4l.js","/assets/store-BkFTppsQ.js","/assets/table-2-BuBoUNyv.js","/assets/table-properties-U7nMjlXA.js","/assets/tag-CbNxkCOS.js","/assets/timer-off-DVgvhCLc.js","/assets/trendBuckets-ClJZOiSk.js","/assets/trending-down-3Fid99HA.js","/assets/trending-up-cVmPq1Zb.js","/assets/undo-2-C6gHQ8Jm.js","/assets/useChartTheme-I0-ZPznF.js","/assets/useElementWidth-D6TKb7bE.js","/assets/useIsMobile-HvnWRfdy.js","/assets/useOpenParam-BSgeI1Fd.js","/assets/useStatusBands-DDVP_nze.js","/assets/useUrlScope-DOD6Wzh2.js","/assets/user-5HFny3Y-.js","/assets/user-cog-A1NVF_ib.js","/assets/user-minus-VQZD18Ib.js","/assets/users-CCH3Fw7i.js","/assets/vfx-C2mmOja1.js","/assets/video-CxhpNHiQ.js","/assets/wallet-DPnpaPso.js","/assets/warehouse-ngOO3rRp.js","/assets/workflow-DQI7N3TL.js","/assets/x-BltdTIB3.js","/assets/zap-CYB7MFkK.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
