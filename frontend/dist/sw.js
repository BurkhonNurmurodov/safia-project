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

const BUILD = "2026-10-03T09:57:25.657Z";
const PRECACHE = ["/","/assets/AdminPanel-CdnBZvUS.js","/assets/AnalysisBoard-Yr-pif-T.js","/assets/Arc-BZT57x0A.js","/assets/ArcLegacy-Zazt4nWT.js","/assets/BrigadirProfile-d42IxCpE.js","/assets/BroadcastReceivers-B0T7KZvV.js","/assets/BroadcastRecord-3d1rPgAC.js","/assets/CatLockNotice-so2cUJud.js","/assets/CategoryLegendModal-DdC2wvCE.js","/assets/CellConcerns-_N4vxQyt.js","/assets/CellDetails-BhfD09I9.js","/assets/CellFormModal-Cncv1cT5.js","/assets/CellIdent-Bv8TZa9V.js","/assets/CellLink-CkFXvBnd.js","/assets/Cells-BMbm8r4i.js","/assets/ColumnFilter-DfuqntpA.js","/assets/ColumnsPicker-Cc5ez6fG.js","/assets/CommentsModal-Dfmlnllj.js","/assets/ComparisonTable-B434ccAA.js","/assets/Concerns-DCFK9-6G.js","/assets/ConfirmDialog-CiIMuPb0.js","/assets/Daily-m1gQYdCf.js","/assets/DataTable-CCrZumIZ.js","/assets/DateRangePicker-D2ltsjOQ.js","/assets/DayReportView-DHiQcz6B.js","/assets/DayStepper-RPGeuYHA.js","/assets/DifferenceBreakdown-Cyjda6Wm.js","/assets/Downtime-CGpj1_vR.js","/assets/Education-Bj5ocwMj.js","/assets/EducationLesson-CgfP7OoX.js","/assets/EmptyState-0ws-MWQE.js","/assets/Exam-B5zMioNt.js","/assets/FactorySelect-wPHmmyKE.js","/assets/Gamification-BDGr-cvr.js","/assets/GroupBadge-BpPLeX7t.js","/assets/HeatmapChart-DT0bCPC0.js","/assets/IdleCell-Bga2QWhb.js","/assets/KPICard-B9t6bGHS.js","/assets/Kaizen-dlZ2GSRt.js","/assets/Kelish-DTNXcJ3x.js","/assets/KpiDeltaCard-AdawJPyt.js","/assets/LangTextInput-2LnTfBuu.js","/assets/Layout-CFBoiH5Z.js","/assets/LeaderAppeal-CUn4yCUq.js","/assets/LeaderDayReport-6hGvM9MC.js","/assets/LeaderUnitReport-Bm1KoZ52.js","/assets/Leaderboard-CQ7QUm_x.js","/assets/Leaders-D1CIVfjt.js","/assets/Lightbox-DrZNzr9p.js","/assets/LiveOverview-B2aJQ5fK.js","/assets/Login-B7GRhx4B.js","/assets/NotFound-C7nG8_ZM.js","/assets/Notifications-Bxa9RJCv.js","/assets/Overview-BOY-DfJw.js","/assets/Pagination-BiMBpoPY.js","/assets/PerenaladkaFactTable-ic2PSO9R.js","/assets/PersonCard-e-rnkCG6.js","/assets/PlanFulfillment-CFWSXFz1.js","/assets/Production-C_mg0F4p.js","/assets/Profile-CERzySDC.js","/assets/ProofCamera-D5xundMD.js","/assets/ProofPhoto-ByovV-Wl.js","/assets/Quality-B80wWmkn.js","/assets/RawRows-Csg8inQl.js","/assets/RequestStateChip-FRRjrm5Z.js","/assets/RichTextEditor-3EznJj9O.js","/assets/SaveState-0t9LKHIw.js","/assets/SearchInput-DCwoIobe.js","/assets/SeasonalityHeatmap-CukBor63.js","/assets/SegmentedToggle-wS3QBwFs.js","/assets/SetupTimes-DKPwOm32.js","/assets/ShiftDaily-C_RQm2Ah.js","/assets/Staff-BeqVkBKP.js","/assets/StaffLive-CH3gPyh_.js","/assets/StatusBadge-DzvmVDzS.js","/assets/TargetGoal-DXLkr_zr.js","/assets/Targets-BB88X_ez.js","/assets/Tasks-D8oDbZin.js","/assets/TimeWheelPicker-Ts547Q_N.js","/assets/Toast-Cgk68fsH.js","/assets/Tooltip-BJryfZ22.js","/assets/TrendChart-DTXBoaH3.js","/assets/TripleSpeedometer-Bcvcu0Wu.js","/assets/Trudoyomkost-BQjylj9Q.js","/assets/UploadDropzone-DmF97KzY.js","/assets/UsersActivity-jfVoJCSV.js","/assets/VerdictBlock-DsEkj0Sw.js","/assets/VfxApiMap-Dz8QEWS8.js","/assets/VfxEmployees-CGiBLVpP.js","/assets/VfxJobs-BQQHSsKu.js","/assets/VfxMarks-BO6_kS0x.js","/assets/VfxOnSite-Nm4DZAYe.js","/assets/VfxPhoto-CFjQDIil.js","/assets/VfxState-DPhSrQUC.js","/assets/VfxStructure-gsCcQRtR.js","/assets/VfxTable-D0hCVz1_.js","/assets/VfxTimesheet-CFGaCi_-.js","/assets/WatchProgress-INoRcl28.js","/assets/WebLogin-BVVizwjM.js","/assets/WorkerConcerns-DfoGMRrF.js","/assets/Workers-CF8HPyzc.js","/assets/Zagruzka-BrPcVKAT.js","/assets/ZagruzkaCell-CPAWBA0-.js","/assets/api-DFF63YxI.js","/assets/archive-Cfp-lcDn.js","/assets/archive-restore-BvSyOcpL.js","/assets/arrow-down-D2zMPPPt.js","/assets/arrow-left-Cr0ntaC_.js","/assets/arrow-right-left-XVbtfPFr.js","/assets/arrow-up-CTYzSRDb.js","/assets/arrow-up-narrow-wide-EwjPj-IU.js","/assets/arrow-up-right-DEhT5UPr.js","/assets/award-Q2SQuHt0.js","/assets/ban-DAICqZkE.js","/assets/bot-CCQS6seS.js","/assets/boxes-DAmxsMGk.js","/assets/braces-CKm4PJ94.js","/assets/brigadirFilters-BHoxR_0T.js","/assets/broadcastTree-oUotgQPe.js","/assets/building-2-DQl4dkJ5.js","/assets/calendar-BxlLvwjC.js","/assets/calendar-days-CFVNyv85.js","/assets/camera-YnUORKb0.js","/assets/categories-BwupOIEs.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BaGsyhfG.js","/assets/chart-line-D185SWAk.js","/assets/chart-pie-DwJpfnSa.js","/assets/chartRange-Jsd6f22e.js","/assets/chevron-left-B1Op3LSp.js","/assets/chevrons-up-down-Dj_s54-S.js","/assets/circle-BncWTsIh.js","/assets/circle-alert-DGMQzupU.js","/assets/circle-check-big-cd4MrUOK.js","/assets/circle-dashed-CFpvGixU.js","/assets/circle-minus-B9KeyegD.js","/assets/circle-question-mark-Dz2-J_Yo.js","/assets/circle-slash-B-EwphDm.js","/assets/circle-user-round-C4ZV0nkZ.js","/assets/clock-3-B9TMqnQo.js","/assets/cloud-off-_E_SieLE.js","/assets/cloud-upload-DNQrm0aI.js","/assets/compass-Byw65FPm.js","/assets/concernCategories-BkLDoHqC.js","/assets/copy-BVh3g6YZ.js","/assets/corner-down-right-KRQ00rHf.js","/assets/createLucideIcon-BKCNpvPs.js","/assets/door-open-CW62EAoT.js","/assets/es-B6G3lHAr.js","/assets/exportXlsx-B-8hi2bc.js","/assets/external-link-AU1Heb6N.js","/assets/file-clock-DjqtL7qg.js","/assets/file-exclamation-point-ujHjka-_.js","/assets/file-spreadsheet-BCmiemKu.js","/assets/file-text-C16WPUMd.js","/assets/flag-DavPqEtT.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DruvLccZ.js","/assets/hash-Cgfr_Je7.js","/assets/history-hjDHBUdm.js","/assets/hourglass-CVD2lvwS.js","/assets/image-Coskfffe.js","/assets/image-off-M_uSg_hP.js","/assets/inbox-CNs6_7JK.js","/assets/index-BmfDVCPF.css","/assets/index-CsOlOrhU.js","/assets/key-round-BX_csJYG.js","/assets/keyboard-BuFjqtun.js","/assets/languages-CdS-puyP.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Cc4Z1xE9.js","/assets/lightbulb-CSayZqSH.js","/assets/link-2-BgxhLPxH.js","/assets/link-2-off-oNr03tvA.js","/assets/list-ordered-BtKFrkor.js","/assets/list-tree-CEkZFucK.js","/assets/lock-open-IGvVbjwp.js","/assets/log-in-DocOFKd_.js","/assets/maximize-2-DCKU0JRH.js","/assets/message-square-C1d7UEaD.js","/assets/minimize-2-DfSFgq4A.js","/assets/package-check-DpKzkiIh.js","/assets/paperclip-B4iRcCJB.js","/assets/pencil-DUNYRoCI.js","/assets/percent-Dkd7oIvy.js","/assets/phone-08Q6YCIa.js","/assets/pin-BCja2jcW.js","/assets/pin-off-BfaUiABw.js","/assets/play-B6ZvM07L.js","/assets/plug-zap-D5suxxwW.js","/assets/presentation-CSAjbU4x.js","/assets/prop-types-BB8Knn0w.js","/assets/radio-yW7lDbRr.js","/assets/react-apexcharts.esm-CgwbIW4k.js","/assets/repeat-wynm9iEk.js","/assets/rotate-ccw-Ctn5R_fb.js","/assets/rotate-cw-C-0l6rLR.js","/assets/save-DFpjPmO2.js","/assets/scopeLinks-C7wBeX_n.js","/assets/scroll-text-Cjdd1cUK.js","/assets/search-x-DFIJa-bA.js","/assets/segments-KmD4QdmY.js","/assets/send-I30IxdAO.js","/assets/settings-2-C5NcoxrP.js","/assets/shield-CWg3xGIT.js","/assets/shield-alert-CF3Fap_9.js","/assets/shield-check-D4pgrdXE.js","/assets/shield-question-mark-LMLqPYFT.js","/assets/siren-CeZ8_S3f.js","/assets/snowflake-sit_QEoh.js","/assets/split-f14mamCw.js","/assets/square-KT44NTOO.js","/assets/square-check-big-DpJa4t0Y.js","/assets/star-CokjaYvq.js","/assets/statusBands-C1k5M8yC.js","/assets/store-izv3ePfu.js","/assets/table-2-24oAeOE1.js","/assets/table-properties-ksaY0-GG.js","/assets/tag-BCP4wgyO.js","/assets/timer-off-DG5ROJb1.js","/assets/trending-down-BZskQlFr.js","/assets/trending-up-C54hnbYq.js","/assets/undo-2-DJZNu3Dt.js","/assets/useChartTheme-wpSVi7Wn.js","/assets/useElementWidth-bf_SMebq.js","/assets/useIsMobile-CJquxG_o.js","/assets/useOpenParam-CJH-pnEq.js","/assets/useStatusBands-Dq0QIU-K.js","/assets/useUrlScope-onSwX0mB.js","/assets/user-BwevlbZz.js","/assets/user-cog-vAYrsGcW.js","/assets/user-minus-CAj5XR5F.js","/assets/users-Cqpfhtfk.js","/assets/video-BLTF2Xrl.js","/assets/wallet-DL-nOuSQ.js","/assets/warehouse-CYVl_kcm.js","/assets/x-BvhoE7MF.js","/assets/zap-Ci4nLx-R.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
