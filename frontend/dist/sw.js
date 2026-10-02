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

const BUILD = "2026-10-02T04:32:14.148Z";
const PRECACHE = ["/","/assets/AdminPanel-BxzeVHYA.js","/assets/AnalysisBoard-Cx_7_xS0.js","/assets/Arc-CaTfGyal.js","/assets/ArcLegacy-DmXr5Ayy.js","/assets/BrigadirProfile-DAO_qRZ7.js","/assets/BroadcastReceivers-BE5VYo64.js","/assets/BroadcastRecord-ZY6JwFUb.js","/assets/CatLockNotice-CwD3w6cJ.js","/assets/CategoryLegendModal-su8TqsDF.js","/assets/CellConcerns-_oLGimbQ.js","/assets/CellDetails-Cphh-ssT.js","/assets/CellFormModal-BNAPWT0t.js","/assets/CellIdent-_6-OqeCY.js","/assets/CellLink-CumvXK14.js","/assets/Cells-BvLQbYzB.js","/assets/ColumnFilter-B_hj4w9T.js","/assets/ColumnsPicker-kT69wsvc.js","/assets/CommentsModal-CNDeSgm2.js","/assets/ComparisonTable-DaL8Kr0f.js","/assets/Concerns-IcFrvWgz.js","/assets/ConfirmDialog-CEZjyZN_.js","/assets/Daily-fs8y_syg.js","/assets/DataTable-CbybxlQv.js","/assets/DateRangePicker-CNVBeVvt.js","/assets/DayReportView-bLpgUvQi.js","/assets/DayStepper-NGYoXZU7.js","/assets/DifferenceBreakdown-CA9TxDqf.js","/assets/Downtime-DJgp1dIZ.js","/assets/Education-B7tkyShV.js","/assets/EducationLesson-BF3n0uDQ.js","/assets/EmptyState-DcsVJsj9.js","/assets/Exam-DRwkVVGD.js","/assets/FactorySelect-B52folae.js","/assets/Gamification-DSG8Vajh.js","/assets/GroupBadge--CL5wFy5.js","/assets/HeatmapChart-CVSFcAec.js","/assets/IdleCell-BE5LGLYK.js","/assets/KPICard-dYi_JF5K.js","/assets/Kaizen-CeV2G2Kv.js","/assets/Kelish-DoKEZ0g7.js","/assets/KpiDeltaCard-BHsGSs41.js","/assets/LangTextInput-DG1DwPXK.js","/assets/Layout-AuoB-d3i.js","/assets/LeaderAppeal-DEPFDy5T.js","/assets/LeaderDayReport-DerGdmg_.js","/assets/LeaderUnitReport-BZ3r3sr9.js","/assets/Leaderboard-DYGxP-WL.js","/assets/Leaders-w0thFExe.js","/assets/Lightbox-bIYV_o7H.js","/assets/LiveOverview-FFij_Ci-.js","/assets/Login-CWXQCtPF.js","/assets/NotFound-BH7Wd1Q0.js","/assets/Notifications-CMcxP0p_.js","/assets/Overview-DgcLIy2S.js","/assets/Pagination-DVc3spQo.js","/assets/PerenaladkaFactTable-Cr8Yshd1.js","/assets/PlanFulfillment-DQ0sG-o5.js","/assets/Production-DPF5hsAm.js","/assets/Profile-B1iCdE_O.js","/assets/ProofCamera-DIJpQD1f.js","/assets/ProofPhoto-Dd5I5OLb.js","/assets/Quality-Cr2axYjW.js","/assets/RequestStateChip-CNfT6PVz.js","/assets/RichTextEditor-BqH4i1jG.js","/assets/SaveState-HxW0yQk5.js","/assets/SearchInput-CqOZP9Ha.js","/assets/SeasonalityHeatmap-DtDGDRGB.js","/assets/SegmentedToggle-C3Td7O81.js","/assets/SetupTimes-Dn7UD9T2.js","/assets/ShiftDaily-DR222ivC.js","/assets/Staff-CR3wVX-X.js","/assets/StaffLive-DsUPIRBs.js","/assets/StatusBadge-0pxYrDDP.js","/assets/TargetGoal-DD3R7KkG.js","/assets/Targets-AVN3vrgJ.js","/assets/Tasks-DUgeZh8x.js","/assets/TimeWheelPicker-BYLYQ46D.js","/assets/Toast-MsiimBlZ.js","/assets/Tooltip-TQlZcAfI.js","/assets/TrendChart-C84i44ox.js","/assets/TripleSpeedometer-NkoEcApx.js","/assets/Trudoyomkost-B_Tj2jXN.js","/assets/UploadDropzone-BmOtFZQM.js","/assets/UsersActivity-CQYv_wZe.js","/assets/VerdictBlock-ZDFP0oJP.js","/assets/WatchProgress-fhnUMGBc.js","/assets/WebLogin-EFWcS4uk.js","/assets/WorkerConcerns-lgpQGyxy.js","/assets/Workers-C4zqjsXV.js","/assets/Zagruzka-7LCy7T42.js","/assets/ZagruzkaCell-0_RuUXZI.js","/assets/api-ckzl04y9.js","/assets/archive-CRzUjJit.js","/assets/archive-restore-frXn1iqw.js","/assets/arrow-down-BAl7irNR.js","/assets/arrow-left-Bu8gpIGT.js","/assets/arrow-right-left-ANCE9eNX.js","/assets/arrow-up-6o_1YQg6.js","/assets/arrow-up-narrow-wide-aHrAwbAk.js","/assets/arrow-up-right-BNIkjch6.js","/assets/award-DVlfIVV5.js","/assets/ban-CsBdsjl-.js","/assets/bot-CPPG55rR.js","/assets/boxes-BLMbhSeZ.js","/assets/brigadirFilters-BPof8vGF.js","/assets/broadcastTree-TqF7bNHs.js","/assets/building-2-BHjlkiAU.js","/assets/calendar-Db75gas6.js","/assets/calendar-days-DUiem2D6.js","/assets/calendar-range-BU-NnrmG.js","/assets/camera-DvI3VWtM.js","/assets/categories-DvdjmIh5.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B-alqeqt.js","/assets/chart-line-CYn8wjqm.js","/assets/chart-pie-CKi83O-1.js","/assets/chartRange-BlouzZLK.js","/assets/chevron-left-Cw0sl4u2.js","/assets/chevrons-up-down-lwohVnBT.js","/assets/circle-D9tY9og6.js","/assets/circle-alert-C7qBoRuS.js","/assets/circle-check-big-CFs5Nw8H.js","/assets/circle-minus-D6SV5U7f.js","/assets/circle-slash-DljcO1uA.js","/assets/circle-user-round-BvNv6iBy.js","/assets/cloud-off-BpdNpkgC.js","/assets/cloud-upload-Ccg6SbQv.js","/assets/compass-Ak9z0Ygw.js","/assets/concernCategories-BcsYzUGE.js","/assets/copy-BchE18ky.js","/assets/corner-down-right-CkIXfcoD.js","/assets/createLucideIcon-g90-NwST.js","/assets/es-CtFaXLS3.js","/assets/exportXlsx-cpcFUbsc.js","/assets/external-link-XyZTzebM.js","/assets/file-clock-CzpjTxrq.js","/assets/file-exclamation-point-DK6QqmJl.js","/assets/file-spreadsheet-CwmiuYJm.js","/assets/file-text-DIjdMWmX.js","/assets/flag-DcS5aNUP.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-wfJvyqi9.js","/assets/hash--aGiQsy0.js","/assets/history-DIG07ypz.js","/assets/hourglass-BtBrxf9V.js","/assets/id-card-BOeYSmR0.js","/assets/image-off-DoR_H0D-.js","/assets/image-u-MVEuu5.js","/assets/inbox-Bkx8Ricw.js","/assets/index-DALl0ydG.js","/assets/index-S0I328RS.css","/assets/key-round-DCZNvrMB.js","/assets/keyboard-BhihsiWl.js","/assets/languages-BeDtsPlK.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DDig6WLy.js","/assets/lightbulb-DJu178Yz.js","/assets/link-2-BFSYf_MM.js","/assets/link-2-off-w_aePtZc.js","/assets/list-ordered-DNCxyGaF.js","/assets/list-tree-C9ITyOox.js","/assets/lock-open-8mTgy1Qd.js","/assets/log-in-2hOPKAKy.js","/assets/maximize-2-Cij6vGG1.js","/assets/message-square-DylhnFCQ.js","/assets/minimize-2-DkscKYKk.js","/assets/package-check-DTLa7uqO.js","/assets/paperclip-CIqDy93x.js","/assets/pencil-BXmKSvqC.js","/assets/percent-DcwjlClX.js","/assets/pin-Bvu5uDSh.js","/assets/pin-off-BFnEytk4.js","/assets/play-DbUDiAmm.js","/assets/plug-zap-tUZcKI6H.js","/assets/presentation-KQmelgFS.js","/assets/prop-types-ckZN7uiv.js","/assets/radio-BZ5IZ0TL.js","/assets/react-apexcharts.esm-C5dXOzYr.js","/assets/repeat-CaRMlgox.js","/assets/rotate-ccw-BlsD9ioL.js","/assets/rotate-cw-RthsneiJ.js","/assets/save-CO9CezcH.js","/assets/scopeLinks-CPVpFCHk.js","/assets/scroll-text-CUT4ticK.js","/assets/search-x-I6_Pzg6K.js","/assets/segments-BirtFBQ4.js","/assets/send-Bi1oGfUo.js","/assets/settings-2-Bt1p2XWH.js","/assets/shield-85b_Mg-W.js","/assets/shield-alert-DSLYg-Xx.js","/assets/shield-check-0h_cwUBV.js","/assets/shield-question-mark-fRHdIVRG.js","/assets/siren-Dh6heo6K.js","/assets/snowflake-0BwSD3re.js","/assets/split-qWjE00iy.js","/assets/square-CzmKFyMl.js","/assets/square-check-big-CDSwHlRV.js","/assets/star-aZaEplz7.js","/assets/statusBands-CcH274vv.js","/assets/store-PG7AqohP.js","/assets/table-2-Duq3iZrQ.js","/assets/table-properties-BbjPVBIg.js","/assets/tag-DsNAAld_.js","/assets/timer-off-u8EoPnLJ.js","/assets/trending-down-BW6UIvuq.js","/assets/trending-up-CM-W_3jn.js","/assets/undo-2-BNJqrp4o.js","/assets/useChartTheme-B0ioNxKe.js","/assets/useElementWidth-XH4btvSC.js","/assets/useIsMobile-D-70x02T.js","/assets/useOpenParam-Dwxze4Ij.js","/assets/useStatusBands-BfOMMqFx.js","/assets/useUrlScope-usunX2eg.js","/assets/user-9uo2gK4K.js","/assets/user-cog-Ddgw8c-F.js","/assets/user-minus-DuqmJvLk.js","/assets/users-ChAjPk8Z.js","/assets/video-D2-7KYRj.js","/assets/wallet-Ceeah3qp.js","/assets/warehouse-De3u1pvl.js","/assets/x-XEv7fIQs.js","/assets/zap-CXs9dK3O.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
