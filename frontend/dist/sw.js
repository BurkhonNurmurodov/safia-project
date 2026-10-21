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

const BUILD = "2026-10-21T09:16:45.293Z";
const PRECACHE = ["/","/assets/AdminPanel-BIcJisq4.js","/assets/AnalysisBoard-MKD5vJ-4.js","/assets/Arc-BiWGHPf2.js","/assets/Assistant-CfNs96PS.js","/assets/BrigadirProfile-C6AQHweY.js","/assets/BroadcastReceivers-kbRxb2qJ.js","/assets/BroadcastRecord-eJKTvkwu.js","/assets/Button-wgRtVNWb.js","/assets/CatLockNotice-CW0Fpdjw.js","/assets/CategoryLegendModal-DUsYydba.js","/assets/CellConcerns-BLw3IFKZ.js","/assets/CellDetails-1_oWc5Yd.js","/assets/CellFormModal-CRweRV7N.js","/assets/CellIdent-CpWryz7f.js","/assets/CellLink-CQC6T-R1.js","/assets/Cells-C8R19rT1.js","/assets/ColumnFilter-CHqPDjAa.js","/assets/ColumnsPicker--zlOI0zm.js","/assets/CommentsModal-DKt_tuS1.js","/assets/ComparisonTable-D8lVG0XT.js","/assets/Concerns-C51yYWNx.js","/assets/CountStepper-BEQCIMKn.js","/assets/Daily-ulvc0s7O.js","/assets/DataTable-PDiU28Mh.js","/assets/DateRangePicker-GJow25o1.js","/assets/DayReportView-DmOZBq0h.js","/assets/DayStepper-CPWZi5ad.js","/assets/DayStrip-CbO-fra_.js","/assets/DifferenceBreakdown-GXpEXATv.js","/assets/Downtime-ChzJCnp5.js","/assets/Education-Cna2K55f.js","/assets/EducationLesson-Co-nL3Lm.js","/assets/EmptyState-XHezn8vB.js","/assets/Exam-DRLcj9_D.js","/assets/FactorySelect-Ctb-Jur_.js","/assets/Gamification-DYgGNNcu.js","/assets/GroupBadge-BPGDVC0o.js","/assets/HeatmapChart-DQPwu5MO.js","/assets/IdleCell-DO1D4L7h.js","/assets/KPICard-DUtBBBBu.js","/assets/Kaizen-BbvvBCiq.js","/assets/Kelish-DcJuQYh7.js","/assets/KpiDeltaCard-CrlfJAR_.js","/assets/LangTextInput-DaRzUjca.js","/assets/Layout-BxVcnE_A.js","/assets/LeaderAppeal-BajtMO72.js","/assets/LeaderDayReport-D2j-oDZR.js","/assets/LeaderUnitReport-B6Ay1tuy.js","/assets/Leaderboard-Buch-iUu.js","/assets/Leaders-B-R9pSaD.js","/assets/LeadersKpi-CoMjzZJ8.js","/assets/Lightbox-Ce02AZNb.js","/assets/LiveOverview-CgJYsnpm.js","/assets/Login-BoLNjZPR.js","/assets/NotFound-gksT5i-x.js","/assets/Notifications-DVcey-5d.js","/assets/Ontime-DBTOV3kW.js","/assets/Overview-DDkdnRt3.js","/assets/Pagination-BK4Vwr47.js","/assets/PerenaladkaFactTable-BNHydwMm.js","/assets/PersonCard-DugzOZN7.js","/assets/PlanFulfillment-BHr1NEDB.js","/assets/Production-Dn79Z86_.js","/assets/Profile-DY4mcZhz.js","/assets/ProofCamera-C3psGP_a.js","/assets/ProofPhoto-BiSZBfiJ.js","/assets/Quality-CEv5YMn8.js","/assets/RawRows-DXYNTT9s.js","/assets/RequestStateChip-BDYHfV05.js","/assets/RichTextEditor-BzhRUPI-.js","/assets/SaveState-BPCigz9m.js","/assets/SearchInput-DuNiaJde.js","/assets/SeasonalityHeatmap-DLd4tLTM.js","/assets/SegmentedToggle-D9Rf2x27.js","/assets/SetupTimes-Crq1TyWM.js","/assets/ShiftDaily-CfxKQx1t.js","/assets/Staff-Cp0GbnnM.js","/assets/StaffListAtCheck-DeF5T2yv.js","/assets/StatusBadge-Bn9qEFaj.js","/assets/StatusBandsModal-BsC4w924.js","/assets/TargetGoal-LDq1r7tb.js","/assets/Targets-Y1uuB8bm.js","/assets/Tasks-DbTYrBMr.js","/assets/TimeWheelPicker-C6aj6qet.js","/assets/Toast-BXePy-qy.js","/assets/Tooltip-BXpeh8iT.js","/assets/TrendChart-DN3jMWUm.js","/assets/TripleSpeedometer-C4czt6BR.js","/assets/Trudoyomkost-BTjnCq5d.js","/assets/UploadDropzone-CJxFJDUQ.js","/assets/UsersActivity-Co4YLp7E.js","/assets/VerdictBlock-Ce5DmIxv.js","/assets/VfxApiMap-CY-9NdOA.js","/assets/VfxDictionaries-lCAJvCyK.js","/assets/VfxEmployees-DySdc5Sc.js","/assets/VfxHrMoves-DiMek_Sz.js","/assets/VfxJobs-DOWoFFYV.js","/assets/VfxPhoto-BdUpSKJ-.js","/assets/VfxShifts-X1wEKBNw.js","/assets/VfxState-CYcjy5q5.js","/assets/VfxTimebooks-BsNOSCWJ.js","/assets/VfxTimesheet-XpKMpYzj.js","/assets/WatchProgress-Cao7Kx_t.js","/assets/WebLogin-Bo_OouOx.js","/assets/Workers-W6LU7zRF.js","/assets/Zagruzka-BKXkNGIB.js","/assets/ZagruzkaCell-CgtR7-Tl.js","/assets/api-Dk_SyVzr.js","/assets/archive-restore-D2xsaWNA.js","/assets/archive-vCoMvpmA.js","/assets/arrow-down-WbJSvdfX.js","/assets/arrow-down-right-RGeZXFsW.js","/assets/arrow-down-wide-narrow-vm0FZmr1.js","/assets/arrow-up-narrow-wide-VtiNd3vI.js","/assets/ban-DjkspcMJ.js","/assets/boxes-DWSWHeNt.js","/assets/braces-DTufuGHg.js","/assets/brigadirFilters-CFBu6QC9.js","/assets/broadcastTree-RlV6laf1.js","/assets/building-2-I-uBoDN3.js","/assets/calendar-8gklb_Ny.js","/assets/calendar-days-CqWGQKYX.js","/assets/camera-DY0ZeRm0.js","/assets/categories-CqiaENsK.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-vO1dEN0q.js","/assets/chart-line-v9QD4SLT.js","/assets/chart-pie-B2wddVz-.js","/assets/chartRange--KaJ-yUL.js","/assets/check-check-7c_PLsGu.js","/assets/chevron-left-Dl-A5G5V.js","/assets/chevrons-up-down-BwRGkchR.js","/assets/circle-CxQ31bHh.js","/assets/circle-alert-BSCIFng_.js","/assets/circle-check-big-D-7Bafqs.js","/assets/circle-dashed-DrExojOA.js","/assets/circle-minus-B1mh_bqW.js","/assets/circle-question-mark-De9N_OHN.js","/assets/circle-slash-CqSZhZNm.js","/assets/circle-user-round-DzKrYxLr.js","/assets/cloud-off-CwI03j3t.js","/assets/cloud-upload-DreAseHL.js","/assets/compass-BZjmeuUW.js","/assets/concernCategories-y8g5NRDs.js","/assets/corner-down-right-BVDWg_o4.js","/assets/createLucideIcon-BiwzHYui.js","/assets/es-BxFdCZuD.js","/assets/external-link-BfmU68Br.js","/assets/file-clock-C2JLgdXe.js","/assets/file-exclamation-point-B818_J1c.js","/assets/flag-dREo5HRu.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DjR3rMVO.js","/assets/funnel-rQbgB9Yy.js","/assets/hash-g2N3bqKi.js","/assets/hourglass-U4CbZR9Y.js","/assets/image-DDEGROfM.js","/assets/image-off-RVkd7XwP.js","/assets/inbox-BXq2yV9P.js","/assets/index-D76dD62O.js","/assets/index-DLT_vDJq.css","/assets/keyboard-B8lwYc4X.js","/assets/languages-C66ZHgdS.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B4CxPUod.js","/assets/lightbulb-BJTwthpB.js","/assets/link-2-D4oAL2cv.js","/assets/link-2-off-BRDcBJCv.js","/assets/list-ordered-CLw4r6LE.js","/assets/list-tree-CfPUaYNK.js","/assets/lock-open-BBFes9zy.js","/assets/log-in-CFA7PLA2.js","/assets/marks-Bqtkww_-.js","/assets/minimize-2-Djv30gUd.js","/assets/package-check-B6ZiR2sX.js","/assets/pencil-kHodlSy_.js","/assets/percent-wXf89oBq.js","/assets/pin-CYNSZgkt.js","/assets/pin-off-JhNIe8Ui.js","/assets/play-BXtKOIQt.js","/assets/plug-zap-xRh6uhFa.js","/assets/prop-types-JUmdb9qS.js","/assets/radio-DhYHPVRM.js","/assets/react-apexcharts.esm-BXdgEuUC.js","/assets/registers--IuXqtEG.js","/assets/repeat-DlpVQ7VM.js","/assets/save-OfxXEhl3.js","/assets/scopeLinks-Bfqcq1s1.js","/assets/scroll-text-C-anoNrG.js","/assets/search-x-CsLL8RQt.js","/assets/segments-CeSIPqa_.js","/assets/send-BPUvDLai.js","/assets/settings-2-Ceo5Whnt.js","/assets/shield-HKJjmICr.js","/assets/shield-alert-B_mlQaAU.js","/assets/shield-question-mark-tk8GSQc8.js","/assets/sigma-DHILskO2.js","/assets/siren-C_D1FWVY.js","/assets/snowflake-8kwDAlew.js","/assets/split-BUD5ooJ8.js","/assets/square-check-big-h03BwQTG.js","/assets/star-B4ZUm1wF.js","/assets/statusBands-DZ-dVMQz.js","/assets/store-Cpz1j36v.js","/assets/table-2-BRBawYhl.js","/assets/table-properties-C9FwqwEM.js","/assets/tag-PkTdWGG5.js","/assets/timer-off-CdBhSJRe.js","/assets/trendBuckets-DzVbEMNT.js","/assets/trending-down-UxiWraDK.js","/assets/trending-up-BopwJzaC.js","/assets/undo-2-BcC9sZyj.js","/assets/useChartTheme-B-Gvc12a.js","/assets/useElementWidth-C76N_aD9.js","/assets/useIsMobile-DLNTaL4E.js","/assets/useOpenParam-Bw3bkcgg.js","/assets/useStatusBands-CkBjUoIk.js","/assets/useUrlScope-CfgsHcof.js","/assets/user-DaD3Cerw.js","/assets/user-cog-CpmdRAdH.js","/assets/user-minus-0PMKc7FS.js","/assets/users-4mhccsEf.js","/assets/vfx-BtR3kj0O.js","/assets/video-BzG3jzVk.js","/assets/wallet-BzSJ6llU.js","/assets/warehouse-Bp6KlRfh.js","/assets/workflow--hhaLkRg.js","/assets/x-Hqq7g5ou.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
