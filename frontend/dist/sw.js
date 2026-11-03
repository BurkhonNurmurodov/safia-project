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

const BUILD = "2026-11-03T05:35:27.558Z";
const PRECACHE = ["/","/assets/AdminPanel-eGERUCl5.js","/assets/AnalysisBoard-D_VdALag.js","/assets/AppLauncher-flRBKRDN.js","/assets/Arc-BchmU7QA.js","/assets/Assessment-BtGS-Nnh.js","/assets/AssessmentGrade-rSMXBy_t.js","/assets/AssessmentList-Bo5pYqBX.js","/assets/Assistant-CoWLXm7y.js","/assets/BrigadirProfile-Dy8R3-5j.js","/assets/BrigadirsKpi-OB6oPiGz.js","/assets/BroadcastReceivers-D2KGtUSW.js","/assets/BroadcastRecord-BnHWAJNW.js","/assets/Button-BmjMskxN.js","/assets/CatLockNotice-BKCwDB7X.js","/assets/CategoryLegendModal-CSUBg7Ce.js","/assets/CellConcerns-BzM6yeoL.js","/assets/CellDetails-Cps2WpJ5.js","/assets/CellFormModal-C4aqvolx.js","/assets/CellIdent-DzWW-ckv.js","/assets/CellLink-DDB2Fu85.js","/assets/Cells-Ck_EuIew.js","/assets/ColumnFilter-CnD32AVI.js","/assets/ColumnsPicker-C_zS6f7p.js","/assets/CommentsModal-Cylep12N.js","/assets/ComparisonTable-DDusVne1.js","/assets/Concerns-Cc4sS_fL.js","/assets/ConcernsPieces-BiEOZHAm.js","/assets/CountStepper-CbWMBolT.js","/assets/Daily-Bcv0ow_a.js","/assets/DataTable-D0A1dbLq.js","/assets/DateRangePicker-BJbaGcJK.js","/assets/DayReportView-C9UShMLi.js","/assets/DayStepper-BKIa9gwB.js","/assets/DayStrip-CqtHdmst.js","/assets/DifferenceBreakdown-dEI2avL-.js","/assets/Downtime-BPpQN_go.js","/assets/Education-ZEdpGMch.js","/assets/EducationLesson-Dt507cBg.js","/assets/EmptyState-DpXZaPWy.js","/assets/Exam-CD3TK_8x.js","/assets/FactorySelect-CZMGm1Y6.js","/assets/Gamification-Crcuw9G_.js","/assets/HeatmapChart-BJmW-SSN.js","/assets/IdleCell-CTzTL7Fi.js","/assets/KPICard-DMCLHeqZ.js","/assets/Kaizen-DJATu7JY.js","/assets/Kelish-NZFg8GVF.js","/assets/KpiBits-C9-UiJWF.js","/assets/KpiDeltaCard-CxplBCCb.js","/assets/LangTextInput-BWbg0IDT.js","/assets/Layout-ARc6rg1A.js","/assets/LeaderAppeal-CHrxNCNI.js","/assets/LeaderDayReport-DiP9B4wK.js","/assets/LeaderUnitReport-CvnD4GoQ.js","/assets/Leaderboard-BN_FYBYv.js","/assets/Leaders-p3X81xDh.js","/assets/LeadersKpi-8tls2dsl.js","/assets/Lightbox-BdZVIX0R.js","/assets/LiveOverview-BvuBwXy1.js","/assets/Login-Ck-GN5_c.js","/assets/NotFound-CSbKXACO.js","/assets/Notifications-BfbqxUhp.js","/assets/NotionTasks-CJzCtC2m.js","/assets/Ontime-DIH8TADu.js","/assets/Overview-D9rcWIze.js","/assets/Pagination-BQxz8ULK.js","/assets/People-kXP0zdwn.js","/assets/PerenaladkaFactTable-CMVcW6AL.js","/assets/PersonCard-jQFlK_Sl.js","/assets/PlanFulfillment-B3VtJ3se.js","/assets/Production-DeiGeUoz.js","/assets/Profile-BThenft4.js","/assets/ProofCamera-CwLomtzp.js","/assets/ProofPhoto-BvSaxZ9K.js","/assets/Quality-CuuH71P8.js","/assets/RawRows-rFiY3DRJ.js","/assets/Reports-Ds2HsJ4J.js","/assets/RequestStateChip-Db2wQrF3.js","/assets/RichTextEditor-Df30KG4w.js","/assets/SaveState-CMpQlPCD.js","/assets/SearchInput-B59qXxwm.js","/assets/SeasonalityHeatmap-ClDIKtSu.js","/assets/SegmentedToggle-TfNlSrYH.js","/assets/SetupTimes-DXjfsE0y.js","/assets/ShiftDaily-BUht2YuG.js","/assets/Staff-cEBPh8ZF.js","/assets/StaffListAtCheck-BcpcTRRJ.js","/assets/StatusBadge-BQegxHHP.js","/assets/StatusBandsModal-rTjKI4ui.js","/assets/TargetGoal-NRT5GkMR.js","/assets/Targets-DNNyQ49H.js","/assets/Tasks-CiFjfmFm.js","/assets/TimeWheelPicker-pm5J2X-y.js","/assets/Toast-Bq1amAbq.js","/assets/Tooltip-CyKhCewg.js","/assets/TrelloAnalytics-DSdRanPE.js","/assets/TrendChart-CKJc4S6E.js","/assets/TripleSpeedometer-BwzXbS1_.js","/assets/Trudoyomkost-DRzOcqBr.js","/assets/UploadDropzone-CN44rf9r.js","/assets/UsersActivity-DmqkwVhG.js","/assets/VerdictBlock-CDdFVNbs.js","/assets/VfxApiMap-oFgaoJeD.js","/assets/VfxDictionaries-2-oZ18aU.js","/assets/VfxEmployees-BX-neLNP.js","/assets/VfxHrMoves-CFCtS2tX.js","/assets/VfxJobs-Dwf5Viov.js","/assets/VfxPhoto-K4nppYUM.js","/assets/VfxShifts-Cr2AdAVH.js","/assets/VfxState-eHz6UNsv.js","/assets/VfxTimebooks-8f8ZBhGQ.js","/assets/VfxTimesheet-CLMpx0bA.js","/assets/WatchProgress-BsiZKUkz.js","/assets/WebLogin-SXxkHcEg.js","/assets/Workers-ClcFubIA.js","/assets/Zagruzka-q4E4xNrp.js","/assets/ZagruzkaCell-CWIlEYFY.js","/assets/api-BFm7MSgf.js","/assets/archive-JWCcA2JC.js","/assets/archive-restore-1GLr9jNv.js","/assets/arrow-down-Br7x8rvl.js","/assets/arrow-down-right-nhBMwifj.js","/assets/arrow-down-wide-narrow-BbmqoBGc.js","/assets/arrow-up-narrow-wide-Cgk_Tg-Q.js","/assets/ban-CHb3uz4d.js","/assets/book-check-BFQrUPlT.js","/assets/boxes-BT4lorGv.js","/assets/braces-CRa_1ig-.js","/assets/brigadirFilters-DZEjrfnY.js","/assets/broadcastTree--hI6zhCq.js","/assets/calendar-BRWPQWyP.js","/assets/calendar-days-WxN3qAxd.js","/assets/calendar-x-2-DuxkFNNW.js","/assets/camera-B9OB1F-v.js","/assets/categories-sowyk19k.js","/assets/cellMoveRefusal-qodae0C7.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DjwgJgEU.js","/assets/chart-line-BG-eI2w7.js","/assets/chart-pie-CXfjB6fo.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-D70F_Z-y.js","/assets/chevron-left-DcFWMAK5.js","/assets/chevrons-up-down-Dsz_9524.js","/assets/circle-BF73wjdr.js","/assets/circle-alert-DZptEWMc.js","/assets/circle-check-big-CRNs70aF.js","/assets/circle-dashed-TWimO9ML.js","/assets/circle-minus-BOhAkcWv.js","/assets/circle-question-mark-MrZ5YJFW.js","/assets/circle-user-round-BFy8a7oL.js","/assets/cloud-off-DTzp2dsn.js","/assets/cloud-upload-0hTxEC5B.js","/assets/coins-Bc-LYJdJ.js","/assets/compass-DmDYsJh9.js","/assets/concernCategories-BSIgQzrw.js","/assets/corner-down-right-yMDmzPcP.js","/assets/createLucideIcon-BGK-yRYU.js","/assets/en-CQ3yFwvz.js","/assets/es-Dtgc5NM1.js","/assets/external-link-BeCh_4C6.js","/assets/file-exclamation-point-BuSX5ILL.js","/assets/flag-BgMy3qJ3.js","/assets/folder-tree-BQlC4PNU.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Dkb8B7Li.js","/assets/funnel-CdTIwYjO.js","/assets/grip-vertical-CdMbKjgB.js","/assets/hard-hat-DcjaGT-n.js","/assets/hash-C4T2N--V.js","/assets/hourglass-Clr0XnQr.js","/assets/idleTime-CHPnJRpw.js","/assets/image-BzEownd0.js","/assets/image-off-F6JnFEAG.js","/assets/inbox-D060POvh.js","/assets/index-BDxFbgLv.js","/assets/index-nqp8ON0j.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DvBRA8Y1.js","/assets/layers-CdjHOUv6.js","/assets/leaderBoard-CUwQ4JFa.js","/assets/lightbulb-uee0sGlK.js","/assets/link-2-BtRIdaKX.js","/assets/link-2-off-Dta6EUf4.js","/assets/list-ordered-DWv8hdUF.js","/assets/list-tree-DD5DKJzy.js","/assets/lock-open-Br4So58r.js","/assets/log-in-Cj2iksxe.js","/assets/map-pin-Cccitcmf.js","/assets/marks-CpagwRRr.js","/assets/message-square-text-qyuB_OAt.js","/assets/minimize-2-BlPjL9Or.js","/assets/notionUtil-D7iOuS9H.js","/assets/package-BGDZkvIU.js","/assets/package-check-DOQcWc5p.js","/assets/pencil-C7f4Ud05.js","/assets/percent-TFdR-kct.js","/assets/pin-Cwvr4lCV.js","/assets/pin-off-BaPZQGq8.js","/assets/play-DobM0hU8.js","/assets/plug-zap-D6I47YQp.js","/assets/prop-types-RD3fbola.js","/assets/radio-Ci8WVmx0.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers--RPnYpRR.js","/assets/repeat-CpgMayNb.js","/assets/ru-DrDKELn7.js","/assets/save-BjNCl0wi.js","/assets/scopeLinks-CRftNVll.js","/assets/search-x-Bk-GpGhp.js","/assets/segments-D5Uiedtv.js","/assets/send-n7yi53gR.js","/assets/shield-DYZHbefB.js","/assets/shield-alert-DsV_Be11.js","/assets/sigma-tmscPN1t.js","/assets/siren-swKWXLAZ.js","/assets/snowflake-D3AoH0ed.js","/assets/split-AZIDHVXv.js","/assets/square-check-big-MSusOPIU.js","/assets/star-7xoA518F.js","/assets/statusBands-DVBZcBq3.js","/assets/store-DbH4SvhS.js","/assets/sunrise-brHFMjG_.js","/assets/table-2-6Mj3t2j8.js","/assets/table-properties-DQv7ZEO1.js","/assets/tag-Cwxbt-pN.js","/assets/timer-off-DRMfTloq.js","/assets/translations-DuV5Lj9B.js","/assets/trelloUtil-BhpKC0-g.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-CvS3DVVC.js","/assets/trending-up-Rhvwdt9c.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-D79T7oC4.js","/assets/useChartTheme-CvabqFiB.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-GLLayZAv.js","/assets/useStatusBands-DBiBpK-f.js","/assets/useUrlScope-D_FM41iH.js","/assets/user-cog-3fx9S6Aj.js","/assets/user-h1oYsVNH.js","/assets/uz-Cy9_BvNV.js","/assets/uz_cyrl-F3L3XRUK.js","/assets/vfx-DrXihsdG.js","/assets/video-BNim8rg3.js","/assets/wallet-fzqss3m3.js","/assets/warehouse-dR78DkO7.js","/assets/workflow-LbQGOsG_.js","/assets/x-CBBmcrHx.js","/assets/zap-BHzJNfcI.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
