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

const BUILD = "2026-11-02T07:40:57.026Z";
const PRECACHE = ["/","/assets/AdminPanel-R_uBNm9k.js","/assets/AnalysisBoard-B0yWFBWF.js","/assets/Arc-UlbrrF5h.js","/assets/Assessment-CyoWusPY.js","/assets/AssessmentGrade-C7wiRHwQ.js","/assets/AssessmentList-CgzioP_V.js","/assets/Assistant-DHzEeW2t.js","/assets/BrigadirProfile-gY7lrn4W.js","/assets/BroadcastReceivers-BiQqVcq-.js","/assets/BroadcastRecord-DUeVwOhp.js","/assets/Button-C3BUqQU0.js","/assets/CatLockNotice-KuOZLr3k.js","/assets/CategoryLegendModal-CvxCL12d.js","/assets/CellConcerns-NTR7HB5l.js","/assets/CellDetails-B4VeaGM2.js","/assets/CellFormModal-CCrjjQNF.js","/assets/CellIdent-DqBOJSaG.js","/assets/CellLink-BdL4-RAM.js","/assets/Cells-DTbLz4Y9.js","/assets/ColumnFilter-9QoEi2ao.js","/assets/ColumnsPicker-xk89dLfn.js","/assets/CommentsModal-BJ_5gvkL.js","/assets/ComparisonTable-TwwmyRu8.js","/assets/Concerns-CFMSFD7y.js","/assets/ConcernsPieces-DZgAfGpy.js","/assets/CountStepper-BCapq2Bd.js","/assets/Daily-DGFF7gyz.js","/assets/DataTable-CG1gsSaL.js","/assets/DateRangePicker-DS1PT96b.js","/assets/DayReportView-DC3q1Gvc.js","/assets/DayStepper-BP6zTBVh.js","/assets/DayStrip-baqtgbWc.js","/assets/DifferenceBreakdown-C6qGK4dM.js","/assets/Downtime-DALWS8oD.js","/assets/Education-AFpbdROa.js","/assets/EducationLesson-BxQnKWxO.js","/assets/EmptyState-CXa9t0Jd.js","/assets/Exam-Cfyy1OYU.js","/assets/FactorySelect-Dz2QqC-F.js","/assets/Gamification-B0kPC42-.js","/assets/HeatmapChart-DhKFX5GP.js","/assets/IdleCell-CyNrj4C8.js","/assets/KPICard-BgOhCQ1F.js","/assets/Kaizen-Bjo8FwZz.js","/assets/Kelish-SsuVptHD.js","/assets/KpiDeltaCard-C3i2156i.js","/assets/LangTextInput-Bey9309P.js","/assets/Layout-DE7Ad8MP.js","/assets/LeaderAppeal-E84L9bDv.js","/assets/LeaderDayReport-BMzl1UUT.js","/assets/LeaderUnitReport-C4mbb3jP.js","/assets/Leaderboard-C-puFtfr.js","/assets/Leaders-C4YXe0ea.js","/assets/LeadersKpi-CCnrG2UL.js","/assets/Lightbox-DfzHWq7n.js","/assets/LiveOverview-Ci577up4.js","/assets/Login-DFwbcH9p.js","/assets/NotFound-XXUAl907.js","/assets/Notifications-Cs6usZKD.js","/assets/NotionTasks-DX0Y9aYp.js","/assets/Ontime-DIoYrdPP.js","/assets/Overview-V1GiNq7O.js","/assets/Pagination-B061xXwn.js","/assets/People-DQxdzeiO.js","/assets/PerenaladkaFactTable-B6Tnfind.js","/assets/PersonCard-1JfP6ZU9.js","/assets/PlanFulfillment-CMkanPpk.js","/assets/Production-D0_D5umt.js","/assets/Profile-BPBsDwmN.js","/assets/ProofCamera-CAo0sDu-.js","/assets/ProofPhoto-DzD7Jma5.js","/assets/Quality-Dm7teBSy.js","/assets/RawRows-BfZU-Tkf.js","/assets/Reports-D3Q6aIwI.js","/assets/RequestStateChip-3Us4Enzd.js","/assets/RichTextEditor-D-wFPnnj.js","/assets/SaveState-DbpaWF2h.js","/assets/SearchInput-BIfZN3M1.js","/assets/SeasonalityHeatmap-C9Yj_lfQ.js","/assets/SegmentedToggle-Cc2H2R8A.js","/assets/SetupTimes-Byb-HPzi.js","/assets/ShiftDaily-WKzRtD_S.js","/assets/Staff-Bu6iI4Ah.js","/assets/StaffListAtCheck-Bk4l4aRj.js","/assets/StatusBadge-CsD63Qx0.js","/assets/StatusBandsModal-SFaoxJAs.js","/assets/TargetGoal-BZ0gKk3N.js","/assets/Targets-CijxOIGy.js","/assets/Tasks-BUcW6dbU.js","/assets/TimeWheelPicker-DIQNy5jn.js","/assets/Toast-DLh05uc1.js","/assets/Tooltip-DiOlJCK3.js","/assets/TrelloAnalytics-D17cX7Nf.js","/assets/TrendChart-CsT0GFZ0.js","/assets/TripleSpeedometer-BH818gvX.js","/assets/Trudoyomkost-D81uyPCd.js","/assets/UploadDropzone-BoNaei9n.js","/assets/UsersActivity-LxjNCxfO.js","/assets/VerdictBlock-BgN5cR4_.js","/assets/VfxApiMap-CxQ4Q0C9.js","/assets/VfxDictionaries-DiHy-mqi.js","/assets/VfxEmployees-pr0BNhu-.js","/assets/VfxHrMoves-Cql2z3Zo.js","/assets/VfxJobs-DQzyA-Lf.js","/assets/VfxPhoto-CjpbbT4z.js","/assets/VfxShifts-Be4Fyve6.js","/assets/VfxState-CFdvaPEQ.js","/assets/VfxTimebooks-CIZOuER2.js","/assets/VfxTimesheet-DfGBZX3F.js","/assets/WatchProgress-BPKDaoZY.js","/assets/WebLogin-DWDemyfG.js","/assets/Workers-DLPrvBPO.js","/assets/Zagruzka-vtd0mIsb.js","/assets/ZagruzkaCell-C7GreB3g.js","/assets/api-BFm7MSgf.js","/assets/archive-DKbDql3w.js","/assets/archive-restore-CG490Pe7.js","/assets/arrow-down-CNmHKPr1.js","/assets/arrow-down-right-1rNHEigv.js","/assets/arrow-down-wide-narrow-jKyc3_Gd.js","/assets/arrow-up-narrow-wide-CUasUOPs.js","/assets/ban-1Dq3XNgt.js","/assets/book-check-CQ-dhxAM.js","/assets/boxes-Dw7NPzWn.js","/assets/braces-BeTqCHkN.js","/assets/brigadirFilters-DUhp8i6r.js","/assets/broadcastTree-DCG7lxcn.js","/assets/calendar-Ba0rZEnU.js","/assets/calendar-days-EJ7EhHLM.js","/assets/calendar-x-2-65z0P0If.js","/assets/camera-C8yDixcb.js","/assets/categories-DkR0U9dJ.js","/assets/cellMoveRefusal-23YREakA.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-ClO4PGRc.js","/assets/chart-line-C8hP6dX0.js","/assets/chart-pie-CDH_2JpC.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-Cqyi6ZNw.js","/assets/chevron-left-BXqNiuM3.js","/assets/chevrons-up-down-B3dJr2V7.js","/assets/circle-CEQvKLe4.js","/assets/circle-alert-CCobokxq.js","/assets/circle-check-big-B9LM6OPz.js","/assets/circle-dashed-D1cslEUo.js","/assets/circle-minus-BnPK9_R9.js","/assets/circle-question-mark-BcOEm7gv.js","/assets/circle-user-round-d1OgSxSb.js","/assets/cloud-off-CuxVg7x4.js","/assets/cloud-upload-CmHzzrMz.js","/assets/coins-Den9TfM5.js","/assets/compass-Bh5XrMQ_.js","/assets/concernCategories-BRI6ttcJ.js","/assets/corner-down-right-AdmkF-Af.js","/assets/createLucideIcon-xroIO2eH.js","/assets/en-hDSzyBel.js","/assets/es-Dtgc5NM1.js","/assets/external-link-B4GKxFjL.js","/assets/file-exclamation-point-BZ-1oLB7.js","/assets/flag-umPSmwRv.js","/assets/folder-tree-B5RsCYUZ.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DhJ6DF5x.js","/assets/funnel-Buro_9zO.js","/assets/hard-hat-NhmZ-9_L.js","/assets/hash-BO9kF2wG.js","/assets/hourglass-C7o0QRfz.js","/assets/idleTime-CHPnJRpw.js","/assets/image-CLWDRm2D.js","/assets/image-off-Dds_GeLp.js","/assets/inbox-ZCzDmQ3P.js","/assets/index-BL0aJTp8.css","/assets/index-FP9F_NFl.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DcdWpkUz.js","/assets/layers-CgKc9qIy.js","/assets/leaderBoard-CrZmxyIu.js","/assets/lightbulb-mA347R1m.js","/assets/link-2-off-C1Pha_4-.js","/assets/link-2-u4w6AJfN.js","/assets/list-ordered-QRjQzUeX.js","/assets/list-tree-CNuCIgOv.js","/assets/lock-open-DmcyAuw5.js","/assets/log-in-DWNHVv7X.js","/assets/map-pin-ChAi0Dn9.js","/assets/marks-BbCb6-Cj.js","/assets/message-square-text-DpWQjha9.js","/assets/minimize-2-Cb5gkW1Z.js","/assets/notionUtil-BbB0rroj.js","/assets/package-C74QbtDc.js","/assets/package-check-CrSqbxJY.js","/assets/pencil-BNaNe6ei.js","/assets/percent-BXRCDMys.js","/assets/pin-BuyYMv4B.js","/assets/pin-off-BA48M0Rn.js","/assets/play-CZTfnVLI.js","/assets/plug-zap-Cn7jgb88.js","/assets/prop-types-RD3fbola.js","/assets/radio-CkkFtSB0.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-_cKtRoos.js","/assets/repeat-DmtM_-JN.js","/assets/ru-Dd-rYPS6.js","/assets/save-BDw4Y2Ow.js","/assets/scopeLinks-mqRvYS-M.js","/assets/search-x-Du9mlJnf.js","/assets/segments-D5Uiedtv.js","/assets/send-BIEEtoIQ.js","/assets/shield-CdfLTCDq.js","/assets/shield-alert-DcViL-yW.js","/assets/sigma-Cl34I6va.js","/assets/siren-CIXVuH1A.js","/assets/snowflake-Bt_bCbd-.js","/assets/split-DiND2rkm.js","/assets/square-check-big-DzVkw9H9.js","/assets/star-CpWIsX6P.js","/assets/statusBands-DVBZcBq3.js","/assets/store-B-D35vV0.js","/assets/sunrise-Q3oU9-C5.js","/assets/table-2-CVtea9_Q.js","/assets/table-properties-DloQ-hec.js","/assets/tag-DZ5pczkL.js","/assets/timer-off-CL63unlb.js","/assets/translations-DilYWep6.js","/assets/trelloUtil-BbKz2pWj.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-DoNJu4xU.js","/assets/trending-up-CiCyeznN.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-ggI6aDPo.js","/assets/useChartTheme-WgthQSs5.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-XV2jBVMM.js","/assets/useStatusBands-CehvRHF0.js","/assets/useUrlScope-DAXqDwiB.js","/assets/user-BSz1Atzv.js","/assets/user-cog-D3WrG0yx.js","/assets/uz-BONBcVfE.js","/assets/uz_cyrl-BXkMVXSg.js","/assets/vfx-MZaHCL50.js","/assets/video-Z3tbub0i.js","/assets/wallet-C2U8vkPt.js","/assets/warehouse-RQk01ShY.js","/assets/workflow-DHZIyYQI.js","/assets/x-BHabZydy.js","/assets/zap-DUWYCKzh.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
