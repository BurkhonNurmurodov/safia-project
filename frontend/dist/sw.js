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

const BUILD = "2026-10-22T04:40:40.426Z";
const PRECACHE = ["/","/assets/AdminPanel-3guSBYA8.js","/assets/AnalysisBoard-CZcT3skV.js","/assets/Arc-mb_LOyjo.js","/assets/Assistant-BAj3Q_kP.js","/assets/BrigadirProfile-BaPbqQ-p.js","/assets/BroadcastReceivers-D0YCFQaW.js","/assets/BroadcastRecord-CB6IHkbE.js","/assets/Button-DkXJspyg.js","/assets/CatLockNotice-C_pDgGKS.js","/assets/CategoryLegendModal-DYrxdvH8.js","/assets/CellConcerns-DNKP06Ma.js","/assets/CellDetails-3X6NuscB.js","/assets/CellFormModal-COUkKxG8.js","/assets/CellIdent-BZgJT_XH.js","/assets/CellLink-CTui-slU.js","/assets/Cells-DOBEIw-K.js","/assets/ColumnFilter-uVkqqkC_.js","/assets/ColumnsPicker-xsr7zziC.js","/assets/CommentsModal-DfjUVVmm.js","/assets/ComparisonTable-hbznrbOB.js","/assets/Concerns-gd3IVwyV.js","/assets/CountStepper-Cavx8bie.js","/assets/Daily-CCTEP8i1.js","/assets/DataTable-C9Y4dy-4.js","/assets/DateRangePicker-DCpGzetK.js","/assets/DayReportView-BN4ibuD8.js","/assets/DayStepper-BEEFQ8Xs.js","/assets/DayStrip-Dw6z3uN5.js","/assets/DifferenceBreakdown-C3P8k9ro.js","/assets/Downtime-Cev1aFh_.js","/assets/Education-BMxZ4g-T.js","/assets/EducationLesson-Sudj-1li.js","/assets/EmptyState-C0xvVwhd.js","/assets/Exam-BhoFkRNo.js","/assets/FactorySelect-B_ZhYfq-.js","/assets/Gamification-Bw3-I0Bk.js","/assets/GroupBadge-Dz_pJjoR.js","/assets/HeatmapChart-Dmc6yA9J.js","/assets/IdleCell-Dp7avJg1.js","/assets/KPICard-C2kgs_pu.js","/assets/Kaizen-C2j5dhER.js","/assets/Kelish-C8a-nYQh.js","/assets/KpiDeltaCard-B7GQlqT6.js","/assets/LangTextInput-Jh-txrv5.js","/assets/Layout-Br-dOtIj.js","/assets/LeaderAppeal-DEfBRnw8.js","/assets/LeaderDayReport-BN41Xzfm.js","/assets/LeaderUnitReport-Cyoaol00.js","/assets/Leaderboard-uqXeqK0m.js","/assets/Leaders-CHczDJL0.js","/assets/LeadersKpi-CX5l1ib5.js","/assets/Lightbox-BTUHLjrS.js","/assets/LiveOverview-CvfcaZ9N.js","/assets/Login-CZ2ktccf.js","/assets/NotFound-B88VdIaq.js","/assets/Notifications-DwKGQb1J.js","/assets/Ontime-DxWcz8oJ.js","/assets/Overview-FCr-D30D.js","/assets/Pagination-DqTjjb0r.js","/assets/PerenaladkaFactTable-CstvxVX2.js","/assets/PersonCard-cAvv117y.js","/assets/PlanFulfillment-BDp2kZ6J.js","/assets/Production-DUtcCykF.js","/assets/Profile-DJ_cl0zA.js","/assets/ProofCamera-CJDmRCCk.js","/assets/ProofPhoto-CyhwxiEB.js","/assets/Quality-D2zdryN3.js","/assets/RawRows-Cl5AGIaE.js","/assets/RequestStateChip-CW-eNbin.js","/assets/RichTextEditor-CMGQmjvR.js","/assets/SaveState-DVfQncGl.js","/assets/SearchInput-D9yrevQv.js","/assets/SeasonalityHeatmap-Bt-bXJmN.js","/assets/SegmentedToggle-BWdA-Iog.js","/assets/SetupTimes-CUSYsE0U.js","/assets/ShiftDaily-CtapReRK.js","/assets/Staff-CENMeTQD.js","/assets/StaffListAtCheck-Bafp8DxA.js","/assets/StatusBadge-BE3d4zHc.js","/assets/StatusBandsModal-CqpX9Fpa.js","/assets/TargetGoal-CT41WlVe.js","/assets/Targets-CS7h4eVZ.js","/assets/Tasks-BWSAM0Az.js","/assets/TimeWheelPicker-BAxM6cQm.js","/assets/Toast-BYm6mVR1.js","/assets/Tooltip-BqZYhVNR.js","/assets/TrendChart-CRhzrK--.js","/assets/TripleSpeedometer-BHlBdA75.js","/assets/Trudoyomkost-Co-Gf_2c.js","/assets/UploadDropzone-DGg7keFQ.js","/assets/UsersActivity-C9wqBCgc.js","/assets/VerdictBlock-DyTXylwi.js","/assets/VfxApiMap-BeQUWLWk.js","/assets/VfxDictionaries-1Zm89yr8.js","/assets/VfxEmployees-3b6xlunq.js","/assets/VfxHrMoves-B4FsDF7o.js","/assets/VfxJobs-B1yk6jLV.js","/assets/VfxPhoto-2TdsHEt-.js","/assets/VfxShifts-BEy4MDob.js","/assets/VfxState-DsZqFEI1.js","/assets/VfxTimebooks-Dvxhj2wr.js","/assets/VfxTimesheet-Bom_nwjG.js","/assets/WatchProgress-Cft2CXxl.js","/assets/WebLogin-Y_wk3PKI.js","/assets/Workers-CAQJ5G9W.js","/assets/Zagruzka-DM7x8MRj.js","/assets/ZagruzkaCell-BTu7LYY3.js","/assets/api-CYMsIuxN.js","/assets/archive-SmLDr8Rt.js","/assets/archive-restore-LIK74ENq.js","/assets/arrow-down-Qu2H8i0N.js","/assets/arrow-down-right-BUqZH-Ny.js","/assets/arrow-down-wide-narrow-ticXaBq5.js","/assets/arrow-up-narrow-wide-B4cRkjo5.js","/assets/ban-CFmTfE9P.js","/assets/boxes-CdcLFLuK.js","/assets/braces-C6H8SHdn.js","/assets/brigadirFilters-CSetWDRX.js","/assets/broadcastTree-DytsAndx.js","/assets/building-2-BCh_eP5A.js","/assets/calendar-CxLlYY1u.js","/assets/calendar-days-SjZqs_cf.js","/assets/camera-DA54Vm0V.js","/assets/categories-DBNCv4P4.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BMZp34Kx.js","/assets/chart-line-DXAMyKGw.js","/assets/chart-pie-DQjr273C.js","/assets/chartRange-DPpRSGJ6.js","/assets/check-check-CogwlwA3.js","/assets/chevron-left-BUEIpyfi.js","/assets/chevrons-up-down-wkQZ0WpV.js","/assets/circle-DMOoLDQC.js","/assets/circle-alert-D7ata9kM.js","/assets/circle-check-big-DznqOMuU.js","/assets/circle-dashed-mO3uLTD3.js","/assets/circle-minus-B9aRhNf2.js","/assets/circle-question-mark-BSttmRpS.js","/assets/circle-slash-B4YDA_qN.js","/assets/circle-user-round-M6a9r-yh.js","/assets/cloud-off-BGT4bVf_.js","/assets/cloud-upload-udjHBCJY.js","/assets/compass-C3AkhSrD.js","/assets/concernCategories-B2chhssB.js","/assets/corner-down-right-C3zoSbYT.js","/assets/createLucideIcon-CXEYP3Sh.js","/assets/es-BTsgBA1v.js","/assets/external-link-Ct-wylLV.js","/assets/file-clock-CuFa37_0.js","/assets/file-exclamation-point-C213yOr-.js","/assets/flag-CYTSJJ5J.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Bkg13IOE.js","/assets/funnel-CR46c-Dg.js","/assets/hash-DuWcFGqq.js","/assets/hourglass-DP9WEogU.js","/assets/image-C3JRcbAq.js","/assets/image-off-D621BlXE.js","/assets/inbox-DPgAN8rf.js","/assets/index-Ct9WqSVA.css","/assets/index-QSdwUhI_.js","/assets/keyboard-DeSv4jxt.js","/assets/languages-AUWejxg7.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-D-Eu3F41.js","/assets/lightbulb-D2BMxI-H.js","/assets/link-2-BcEnQAry.js","/assets/link-2-off-wdJbixA-.js","/assets/list-ordered-C1PBkDQK.js","/assets/list-tree-DuObNjdA.js","/assets/lock-open-Dwdq0fzP.js","/assets/log-in-DCbPq2fi.js","/assets/marks-70xhvZaE.js","/assets/minimize-2-BRKY5Yqh.js","/assets/package-check-DSarsbIn.js","/assets/pencil-CB9Oi_N3.js","/assets/percent-qQLAL1zI.js","/assets/pin-CGluUQYZ.js","/assets/pin-off-CsufGwQm.js","/assets/play-DSN_zmC4.js","/assets/plug-zap-BtcBaFmO.js","/assets/prop-types-BK0OK4tR.js","/assets/radio-BUCy2qrM.js","/assets/react-apexcharts.esm-BZ8WzgjA.js","/assets/registers-SAF54XiX.js","/assets/repeat-BLHidIeg.js","/assets/save-C6lge8Rj.js","/assets/scopeLinks-CTNwoAer.js","/assets/scroll-text-XMqKU0re.js","/assets/search-x-vWt8Zwbv.js","/assets/segments-Ct6X3bci.js","/assets/send-lmH_F75c.js","/assets/settings-2-DTn1gNqp.js","/assets/shield-CaGOPF9I.js","/assets/shield-alert-r_brMAEB.js","/assets/shield-question-mark-DjbZronk.js","/assets/sigma-_Nuqn8WN.js","/assets/siren-Btivyskx.js","/assets/snowflake-Bv1ApVwB.js","/assets/split-BHz-Vx95.js","/assets/square-check-big-9w9ZL5sE.js","/assets/star-D1KzsS9r.js","/assets/statusBands-BaaS85lD.js","/assets/store-B0P5oLSx.js","/assets/table-2-C_lkwq8Y.js","/assets/table-properties-BTNm507U.js","/assets/tag-SbevNDII.js","/assets/timer-off-D1cZbt8B.js","/assets/trendBuckets-bW-xQ5el.js","/assets/trending-down-CQUyls44.js","/assets/trending-up-D2COP7Ms.js","/assets/undo-2-BAU9IriI.js","/assets/useChartTheme-Bmmm98ir.js","/assets/useElementWidth-2RQOm4RK.js","/assets/useIsMobile-D7vACzQg.js","/assets/useOpenParam-Dz-9FQyf.js","/assets/useStatusBands-DyAzUCEN.js","/assets/useUrlScope-CRWmkiUO.js","/assets/user-BhXBaB3q.js","/assets/user-cog-DmcOpJdr.js","/assets/user-minus-CI7uGFdv.js","/assets/users-BHsZYL06.js","/assets/vfx-Sj0y5j-a.js","/assets/video-mnVxDMz0.js","/assets/wallet-CQicMg_Y.js","/assets/warehouse-BHb7MWhC.js","/assets/workflow-GTjN40h6.js","/assets/x-CcBHnvAR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
