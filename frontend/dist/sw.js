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

const BUILD = "2026-10-23T12:50:42.031Z";
const PRECACHE = ["/","/assets/AdminPanel-D51t40ND.js","/assets/AnalysisBoard-CPZjcA09.js","/assets/Arc-Dq1WSol-.js","/assets/Assistant-D5kCOIFj.js","/assets/BrigadirProfile-56TZ117X.js","/assets/BroadcastReceivers-EH8FYjtT.js","/assets/BroadcastRecord-DP7VuT3w.js","/assets/Button-zd1S1gPO.js","/assets/CatLockNotice-DqT1ByJo.js","/assets/CategoryLegendModal-Druk_HgH.js","/assets/CellConcerns-K3E_Mll-.js","/assets/CellDetails-BVSK8X-l.js","/assets/CellFormModal-DItYXfgE.js","/assets/CellIdent-BuBaF-7X.js","/assets/CellLink-Dg0Ir1eO.js","/assets/Cells-GKDHfcby.js","/assets/ColumnFilter-D_Q1FgGg.js","/assets/ColumnsPicker-D1MD46oS.js","/assets/CommentsModal-CyJyZqEv.js","/assets/ComparisonTable-BU24XbUV.js","/assets/Concerns-Dz1nZjnq.js","/assets/CountStepper-BoKONVg-.js","/assets/Daily-DstKZ8FT.js","/assets/DataTable-3CaGxPMB.js","/assets/DateRangePicker-CrnVduKW.js","/assets/DayReportView-BKFarWMQ.js","/assets/DayStepper-CXuiSW-U.js","/assets/DayStrip-Bc7oMKFn.js","/assets/DifferenceBreakdown-CPrvin0w.js","/assets/Downtime-wC1VY4N_.js","/assets/Education-DINEXsFe.js","/assets/EducationLesson-nnK7gb_a.js","/assets/EmptyState-DZadY5sE.js","/assets/Exam-jakfFIWY.js","/assets/FactorySelect-DELzZ4Si.js","/assets/Gamification-CYTJVrY9.js","/assets/GroupBadge-DeFG_RpS.js","/assets/HeatmapChart-rNaKnr_e.js","/assets/IdleCell-Bn3qJBs8.js","/assets/KPICard-CN1Q2rJK.js","/assets/Kaizen-D2Qtr3Hq.js","/assets/Kelish-B_HsWTrE.js","/assets/KpiDeltaCard-BWBGVa-j.js","/assets/LangTextInput-KC4aRmss.js","/assets/Layout-BgsmFz5u.js","/assets/LeaderAppeal-BPN-MZnc.js","/assets/LeaderDayReport-DBv16jnB.js","/assets/LeaderUnitReport-gT1bTDay.js","/assets/Leaderboard-OyKqrist.js","/assets/Leaders-Ce6hbAAt.js","/assets/LeadersKpi-CHRS8ukj.js","/assets/Lightbox-5B28sQzf.js","/assets/LiveOverview-DOrPcHH1.js","/assets/Login-DtuVOvld.js","/assets/NotFound-Doq7yX5n.js","/assets/Notifications-BruvCgVd.js","/assets/Ontime-fAmnBFnB.js","/assets/Overview-DRhVjXJr.js","/assets/Pagination-DPwlDbje.js","/assets/PerenaladkaFactTable-BoPBZnae.js","/assets/PersonCard-B-WNIP6s.js","/assets/PlanFulfillment-xOvK7lej.js","/assets/Production-EDRgXlkw.js","/assets/Profile-CKR7LxM0.js","/assets/ProofCamera-Dhf7YbBe.js","/assets/ProofPhoto-6garjeTB.js","/assets/Quality-B7Z-OUUV.js","/assets/RawRows-DB3izMQb.js","/assets/RequestStateChip-C9OBVHwV.js","/assets/RichTextEditor-CU5WFxmN.js","/assets/SaveState-QTCobO5E.js","/assets/SearchInput-BLVvT8Ny.js","/assets/SeasonalityHeatmap-DrP7wAAg.js","/assets/SegmentedToggle-BEk4jDeG.js","/assets/SetupTimes-CfQCw--p.js","/assets/ShiftDaily-BGxS1d1t.js","/assets/Staff-Debwj_t6.js","/assets/StaffListAtCheck-C6wNAEHx.js","/assets/StatusBadge-Cu-1NxlI.js","/assets/StatusBandsModal-CJAxmP4V.js","/assets/TargetGoal-BDk9WSz_.js","/assets/Targets-BZ4zmwKP.js","/assets/Tasks-CPECXyKe.js","/assets/TimeWheelPicker-DLMsnDlE.js","/assets/Toast-DaVyzB5F.js","/assets/Tooltip-B-uGJYWz.js","/assets/TrendChart-DdZnuL1l.js","/assets/TripleSpeedometer-Cy8AX-2A.js","/assets/Trudoyomkost-BzMWe9Ki.js","/assets/UploadDropzone-B1_oYX9-.js","/assets/UsersActivity-DUyfvcUz.js","/assets/VerdictBlock-BZrk0B7s.js","/assets/VfxApiMap-DoeTpYPU.js","/assets/VfxDictionaries-C8Ovd_2T.js","/assets/VfxEmployees-yuU6bZ8w.js","/assets/VfxHrMoves-BvwzsPrH.js","/assets/VfxJobs-LvazPqmu.js","/assets/VfxPhoto-BXwamVQw.js","/assets/VfxShifts-BXzC_OBt.js","/assets/VfxState-Dae5W5H_.js","/assets/VfxTimebooks-BdZC0O5g.js","/assets/VfxTimesheet-B02IIk4d.js","/assets/WatchProgress-DU_38UVj.js","/assets/WebLogin-_83cGS3Y.js","/assets/Workers-3RZbwGfA.js","/assets/Zagruzka-BTYCz4ha.js","/assets/ZagruzkaCell-ct88S859.js","/assets/api-D5apPq_9.js","/assets/archive-CBE4QxG4.js","/assets/archive-restore-BAGpaX-B.js","/assets/arrow-down-DWvg3mBW.js","/assets/arrow-down-right-Dh9OdmjH.js","/assets/arrow-down-wide-narrow-DYEmsovg.js","/assets/arrow-up-narrow-wide-BFsN3E95.js","/assets/ban-D8yOi6p-.js","/assets/boxes-CyB1S-7u.js","/assets/braces-dTjYn_gM.js","/assets/brigadirFilters-li2s7KXk.js","/assets/broadcastTree-uJbV84je.js","/assets/building-2-BXwH7Vgl.js","/assets/calendar-CFRURTDd.js","/assets/calendar-days-BUE_8iOO.js","/assets/camera-Bl1A2-LK.js","/assets/categories-B72r4RYB.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DK5OnlrX.js","/assets/chart-line-B0xVIhn1.js","/assets/chart-pie-DSkFzLSm.js","/assets/chartRange-DwLQOFtB.js","/assets/check-check-CPHeHvTk.js","/assets/chevron-left-hZKXDFUK.js","/assets/chevrons-up-down-BISDg12k.js","/assets/circle-D9QCLcYo.js","/assets/circle-alert-C7dBEJPp.js","/assets/circle-check-big-CAX6qCWq.js","/assets/circle-dashed-jlrNKoec.js","/assets/circle-minus-CAh5OPyy.js","/assets/circle-question-mark-4ETIZBNM.js","/assets/circle-slash-BbIbX44b.js","/assets/circle-user-round-DCED3NoL.js","/assets/cloud-off-B-br3GPq.js","/assets/cloud-upload-3U1PChDq.js","/assets/compass-CfegIK0T.js","/assets/concernCategories-qXOR8h6m.js","/assets/corner-down-right-Dmnp_kc4.js","/assets/createLucideIcon-BKqKjR3C.js","/assets/es-BPDDntTD.js","/assets/external-link-BFV8_2LX.js","/assets/file-clock-2w6rO4rW.js","/assets/file-exclamation-point-C_ROAcKt.js","/assets/flag-DGw-3RGn.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-D8P_gZ2Y.js","/assets/funnel-Cop8opZC.js","/assets/hash-DwUu5xfr.js","/assets/hourglass-BbRI53RQ.js","/assets/image-CWCqqzGh.js","/assets/image-off-D9yYHCx_.js","/assets/inbox-BZPKL4rj.js","/assets/index-BLb3U6Q9.js","/assets/index-DFvJry-Q.css","/assets/keyboard-BtZ6cn0T.js","/assets/languages-CnGnz_YF.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BFPhaNhX.js","/assets/leaderBoard-D_1wuZ9D.js","/assets/lightbulb-BjRbjYvS.js","/assets/link-2-BIu8P4tR.js","/assets/link-2-off-BiIQCspA.js","/assets/list-ordered-CE4ADEEO.js","/assets/list-tree-B0IE80qA.js","/assets/lock-open-D1iOo_U1.js","/assets/log-in-DoN9nHgZ.js","/assets/map-pin-BZvkxbUG.js","/assets/marks-JVsgiy4X.js","/assets/minimize-2-DGPoQaWi.js","/assets/package-check-B2AFGtNu.js","/assets/pencil-BBWZDihp.js","/assets/percent-DRWAFTwy.js","/assets/pin-BR-Hk6NT.js","/assets/pin-off-OCmaUJOG.js","/assets/play-BiwxWjda.js","/assets/plug-zap-CC-TYCrH.js","/assets/prop-types-BDutmz0u.js","/assets/radio-Bh-zKqRF.js","/assets/react-apexcharts.esm-BiuUpFbX.js","/assets/registers-BJV8L9n4.js","/assets/repeat-hcIr55Va.js","/assets/save-9GI36OEP.js","/assets/scopeLinks-mWU839K0.js","/assets/scroll-text-prFEJqsZ.js","/assets/search-x-Cbs-WHe8.js","/assets/segments-IARKWXcl.js","/assets/send-CFlIhCrx.js","/assets/settings-2-9vxciybQ.js","/assets/shield-DFLAnV2u.js","/assets/shield-alert-DCzH-zRC.js","/assets/shield-question-mark-Bn4jBIPl.js","/assets/sigma-BgCWLxjM.js","/assets/siren-TuSEuenW.js","/assets/snowflake-CUiWFFWN.js","/assets/split-CTS8bNXm.js","/assets/square-check-big-Dn5kBQm9.js","/assets/star-DN8MPLAb.js","/assets/statusBands-DHU24ysE.js","/assets/store-BSPf9qni.js","/assets/table-2-BD-bt4gE.js","/assets/table-properties-KRfBDsZT.js","/assets/tag-DgvOulVm.js","/assets/timer-off-CXfMQ2iO.js","/assets/trendBuckets-DbcsPChQ.js","/assets/trending-down-XtVgcwbC.js","/assets/trending-up-2Tiv8WR8.js","/assets/undo-2-DSkxY2BN.js","/assets/useChartTheme-DR8q8H_o.js","/assets/useElementWidth-C-tEEzTv.js","/assets/useIsMobile-CwdRbyKQ.js","/assets/useOpenParam-GmPbw8-2.js","/assets/useStatusBands-Bozt0Ca8.js","/assets/useUrlScope-DkQe4JUk.js","/assets/user-DPvq9h0f.js","/assets/user-cog-CObc6Sni.js","/assets/user-minus-D7pL7ksy.js","/assets/users-D5ILwpoI.js","/assets/vfx-BgjnIZuj.js","/assets/video-CvEjoVZn.js","/assets/wallet-Bq4l_IVi.js","/assets/warehouse-VQZJDppL.js","/assets/workflow-DByIo29z.js","/assets/x-DLjTbuwr.js","/assets/zap-Ci1iGdTs.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
