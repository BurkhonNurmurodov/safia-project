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

const BUILD = "2026-10-19T12:43:03.204Z";
const PRECACHE = ["/","/assets/AdminPanel-CqvaATaJ.js","/assets/AnalysisBoard-Ci3dOCMu.js","/assets/Arc-C5DwyGsH.js","/assets/Assistant-Cco1T_B8.js","/assets/BrigadirProfile-YMdr9u3I.js","/assets/BroadcastReceivers-Em1OSt7j.js","/assets/BroadcastRecord-D2Jnsz1g.js","/assets/Button-DJYMaZ6G.js","/assets/CatLockNotice-DOl9co0z.js","/assets/CategoryLegendModal-DetRZQEG.js","/assets/CellConcerns-teJZJQTI.js","/assets/CellDetails-D8cw2IpZ.js","/assets/CellFormModal-BqMgED-5.js","/assets/CellIdent-9hOkRPae.js","/assets/CellLink-DnScgefW.js","/assets/Cells-BVOHnhYy.js","/assets/ColumnFilter-BEomii08.js","/assets/ColumnsPicker-Bz38uMp5.js","/assets/CommentsModal-DyqmnpOu.js","/assets/ComparisonTable-DtcI5MUG.js","/assets/Concerns-CZkHbd43.js","/assets/CountStepper-CjKuoaCw.js","/assets/Daily-BLK8dimm.js","/assets/DataTable-DxWdHC7l.js","/assets/DateRangePicker-CVqs5noK.js","/assets/DayReportView-BfZGHWzW.js","/assets/DayStepper-BUb9Xds_.js","/assets/DifferenceBreakdown-D521NkHD.js","/assets/Downtime-B0QSzk6x.js","/assets/Education-CAIxa6Ze.js","/assets/EducationLesson-CvH3-Bzz.js","/assets/EmptyState-DULNq4X-.js","/assets/Exam-D7xUIW7u.js","/assets/FactorySelect-C-N82x6-.js","/assets/Gamification-CJi3Cdz6.js","/assets/GroupBadge-DkK3Srlj.js","/assets/HeatmapChart-DMGh5Uan.js","/assets/IdleCell-CY1RfOwE.js","/assets/KPICard-RE2Fdr9B.js","/assets/Kaizen-IrwHGHe9.js","/assets/Kelish-CZK2JG46.js","/assets/KpiDeltaCard-D1clKIDf.js","/assets/LangTextInput-DsEr35mc.js","/assets/Layout-CybF_V2h.js","/assets/LeaderAppeal-CIuCwUgY.js","/assets/LeaderDayReport-B1lszzRV.js","/assets/LeaderUnitReport-D0I1QwAS.js","/assets/Leaderboard-CKHZg8rc.js","/assets/Leaders-gvvEMxx1.js","/assets/LeadersKpi-LP1kGbtG.js","/assets/Lightbox-CQ4bv844.js","/assets/LiveOverview-c8qjfyby.js","/assets/Login-CFvpSJxE.js","/assets/NotFound-ChcUnoqH.js","/assets/Notifications-aYV9m30x.js","/assets/Overview-xb5RT22b.js","/assets/Pagination-5fuPnBHQ.js","/assets/PerenaladkaFactTable-eOSacqcN.js","/assets/PersonCard-B6aPK8iS.js","/assets/PlanFulfillment-BqorEexH.js","/assets/Production-BKjzcnzz.js","/assets/Profile-Bdbi8bA-.js","/assets/ProofCamera-POuR_w7F.js","/assets/ProofPhoto-D2WbhK8_.js","/assets/Quality-DEaVHhqh.js","/assets/RawRows-BuOf6wix.js","/assets/RequestStateChip-T4blU38E.js","/assets/RichTextEditor-cPKyuOE6.js","/assets/SaveState-hQ-avfDX.js","/assets/SearchInput-pUJIM3pC.js","/assets/SeasonalityHeatmap-rIwfllEG.js","/assets/SegmentedToggle-CFxatq-F.js","/assets/SetupTimes-DEnNfNeh.js","/assets/ShiftDaily-Dexk7yLU.js","/assets/Staff-C7DFYf8r.js","/assets/StaffListAtCheck-D1t_uSxV.js","/assets/StatusBadge-DW9-ow43.js","/assets/TargetGoal-Dd_EgjR-.js","/assets/Targets-BC25nqEm.js","/assets/Tasks-BRnI-AF8.js","/assets/TimeWheelPicker-CNJmoLJO.js","/assets/Toast-DS78rVwP.js","/assets/Tooltip-Bt0ltROd.js","/assets/TrendChart-CV3ZwzEl.js","/assets/TripleSpeedometer-C73oSYBY.js","/assets/Trudoyomkost-6iAgJBop.js","/assets/UploadDropzone-CqZoFzzU.js","/assets/UsersActivity-CofVDhuA.js","/assets/VerdictBlock-DP3iv543.js","/assets/VfxApiMap-fA93iyb9.js","/assets/VfxDictionaries-D-khjjqa.js","/assets/VfxEmployees-BcKH9wZ-.js","/assets/VfxHrMoves-CoImTZkT.js","/assets/VfxJobs-BAiRVzdr.js","/assets/VfxPhoto-ByMfhUmO.js","/assets/VfxShifts-CGIUa_0t.js","/assets/VfxState-Cqlksg-C.js","/assets/VfxTimebooks-CqA3Z0_N.js","/assets/VfxTimesheet-0Mk8ZPLG.js","/assets/WatchProgress-BOnhavm9.js","/assets/WebLogin-DoterIIQ.js","/assets/Workers-yEZjomiB.js","/assets/Zagruzka-CbPhjHl6.js","/assets/ZagruzkaCell-DrC7rt54.js","/assets/api-D2xhRT3p.js","/assets/archive-kuSP6Kq3.js","/assets/archive-restore-41l7vMGn.js","/assets/arrow-down-CThxKNo2.js","/assets/arrow-down-right-Dtt8CVAU.js","/assets/arrow-down-wide-narrow-g9gmDwLj.js","/assets/arrow-up-narrow-wide-tzBu2mqC.js","/assets/ban-CCfnCU9N.js","/assets/boxes-BKziQdxd.js","/assets/braces-B-ppukrM.js","/assets/brigadirFilters-BOg2n791.js","/assets/broadcastTree-Bx-Tvi46.js","/assets/building-2-CRP1f7xc.js","/assets/calculator-BlAoTPLS.js","/assets/calendar-days-BdmSrmhP.js","/assets/calendar-z3D_anF1.js","/assets/camera-ChkYUJop.js","/assets/categories-CIkWcnV0.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CKyWkFiF.js","/assets/chart-line-Bm163UGY.js","/assets/chart-pie-CQZs4C-5.js","/assets/chartRange-BMGs4yUx.js","/assets/check-check-Z6NS91pw.js","/assets/chevron-left-DZXx0bx0.js","/assets/chevrons-up-down-B7Y6UQSQ.js","/assets/circle-UooOi1Fn.js","/assets/circle-alert-C72GT14R.js","/assets/circle-check-big-CXiyFDkr.js","/assets/circle-dashed-KQs2ymY_.js","/assets/circle-minus-BV-ceO_b.js","/assets/circle-question-mark-SUvt1HzZ.js","/assets/circle-slash-D1kJFl6Y.js","/assets/circle-user-round-5xPHvPOc.js","/assets/cloud-off-Cjqg7dGG.js","/assets/cloud-upload-CZjlc-aq.js","/assets/compass-D8NbPRc8.js","/assets/concernCategories-Drr3Umie.js","/assets/corner-down-right-ABUOBVWx.js","/assets/createLucideIcon-BYCkvM8z.js","/assets/es-BZ0lid9h.js","/assets/external-link-awM0omDH.js","/assets/file-clock-Ct_S3kiu.js","/assets/file-exclamation-point-B7CFDGRY.js","/assets/flag-V9WpImx2.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-f46bggKZ.js","/assets/funnel-C2Euv9dx.js","/assets/hash-BXbJMhxN.js","/assets/hourglass-opDct2UH.js","/assets/image-DY-xhpq6.js","/assets/image-off-Cd3Gyc5h.js","/assets/inbox-BGD8vd5Q.js","/assets/index-DemTQruw.css","/assets/index-bhfcx94w.js","/assets/keyboard-CD3N53yq.js","/assets/languages-Bq1SpYwT.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DvwNOSMI.js","/assets/lightbulb-DvESjbzx.js","/assets/link-2-DxGVxlAI.js","/assets/link-2-off-BwieI3Ma.js","/assets/list-ordered-CXWTntlM.js","/assets/list-tree-BQzzkBz-.js","/assets/lock-open-ZK9SfpL5.js","/assets/log-in-BbUrbDzo.js","/assets/marks-Xl55WvFn.js","/assets/minimize-2-BlOFhZhr.js","/assets/package-check-97sA276D.js","/assets/pencil-BBdrZDiG.js","/assets/percent-DyXIahNt.js","/assets/pin-Dk8Jur8V.js","/assets/pin-off-yDqE7j7M.js","/assets/play-DhtE4UlY.js","/assets/plug-zap-BXvPCugq.js","/assets/prop-types-DKir53B8.js","/assets/radio-DbuvxEtO.js","/assets/react-apexcharts.esm-DcIy35ta.js","/assets/registers-DTenDifp.js","/assets/repeat-DA7g_dzv.js","/assets/save-DZ9hL3Bd.js","/assets/scopeLinks-DJPcmE-0.js","/assets/scroll-text-4qqtQPgY.js","/assets/search-x-u8bRV0ad.js","/assets/segments-p-06qY_A.js","/assets/send-ChDqkwLD.js","/assets/settings-2-CI71AfcV.js","/assets/shield-alert-CUhGTAGf.js","/assets/shield-question-mark-CMmpDMPS.js","/assets/shield-s_W0oVG8.js","/assets/siren-CKjBnFiA.js","/assets/snowflake-DznBj3_4.js","/assets/split-hpVAYj2p.js","/assets/square-check-big-txBDTICz.js","/assets/star-DaDWe6a0.js","/assets/statusBands-BauLKe7R.js","/assets/store-BUDXEfFH.js","/assets/table-2-BIGk2Jq5.js","/assets/table-properties-BcrbZHVT.js","/assets/tag-oVEJsq6Z.js","/assets/timer-off-DWJViYmw.js","/assets/trending-down-CpZUEK2r.js","/assets/trending-up-CVhxIt5Q.js","/assets/undo-2-CklPH8Tz.js","/assets/useChartTheme-DkSE7k-T.js","/assets/useElementWidth-spV_IULp.js","/assets/useIsMobile-wCoCsbNs.js","/assets/useOpenParam-DD3cAnyR.js","/assets/useStatusBands-Dp4Gyu_k.js","/assets/useUrlScope-azkt5kH0.js","/assets/user-BRojcJ4L.js","/assets/user-cog-B8IPYcOQ.js","/assets/user-minus-Cxa9rGKM.js","/assets/users-C1P3C_GP.js","/assets/vfx-CK2_pbqT.js","/assets/video-BC-8h4nh.js","/assets/wallet-CRud3Kr3.js","/assets/warehouse-D104nYkv.js","/assets/workflow-C-121lK3.js","/assets/x-cqXG9yIc.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
