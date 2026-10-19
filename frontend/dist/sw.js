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

const BUILD = "2026-10-19T07:12:52.702Z";
const PRECACHE = ["/","/assets/AdminPanel-D5s-v0NQ.js","/assets/AnalysisBoard-COp3UKsE.js","/assets/Arc-DFKdEdmx.js","/assets/Assistant-CqwujNBX.js","/assets/BrigadirProfile-DUd-b1ZH.js","/assets/BroadcastReceivers-e7wO46ca.js","/assets/BroadcastRecord-gJCcaKq3.js","/assets/Button-DwFTQR1a.js","/assets/CatLockNotice-BKGhHFKA.js","/assets/CategoryLegendModal-Cg3IFv2g.js","/assets/CellConcerns-BzZUS2KD.js","/assets/CellDetails-1g-Hg-I9.js","/assets/CellFormModal-BpyI3U6q.js","/assets/CellIdent-ogt9uMxe.js","/assets/CellLink-DUjlh8OO.js","/assets/Cells-F99ntShq.js","/assets/ColumnFilter-Cahq3A5J.js","/assets/ColumnsPicker-JMa1nhIw.js","/assets/CommentsModal-DGftWUMl.js","/assets/ComparisonTable-eIjXXzFd.js","/assets/Concerns-Ya4to3nt.js","/assets/CountStepper-C7-aVihs.js","/assets/Daily-EIKxYEW_.js","/assets/DataTable-Bj6zk43q.js","/assets/DateRangePicker-picqQIYS.js","/assets/DayReportView-DwULH4e1.js","/assets/DayStepper-AbRCS4w1.js","/assets/DifferenceBreakdown-DIFC6jE7.js","/assets/Downtime-DCRCpFCf.js","/assets/Education-B9ahmad3.js","/assets/EducationLesson-C8C-FZYB.js","/assets/EmptyState-CEYODd33.js","/assets/Exam-BsDyKMsr.js","/assets/FactorySelect-DB_Sq48s.js","/assets/Gamification-BbG9baKU.js","/assets/GroupBadge-B8YEvDLH.js","/assets/HeatmapChart-CH1JltDD.js","/assets/IdleCell-Brm_uaQg.js","/assets/KPICard-knjZMlAO.js","/assets/Kaizen-C-Bt929u.js","/assets/Kelish-CrXwBh0h.js","/assets/KpiDeltaCard-B00ZSa_G.js","/assets/LangTextInput-DWqsCcyy.js","/assets/Layout-Bs72zCd1.js","/assets/LeaderAppeal-DACo_w-y.js","/assets/LeaderDayReport-DLc9LhHK.js","/assets/LeaderUnitReport-CZ_pmZaT.js","/assets/Leaderboard-DaNnb1e_.js","/assets/Leaders-Crep6Dgw.js","/assets/LeadersKpi-BoXxZl4G.js","/assets/Lightbox-BHWOxc_p.js","/assets/LiveOverview-BSozL-4_.js","/assets/Login-D7wc0UCc.js","/assets/NotFound-Bf6Vskxx.js","/assets/Notifications-K9LN226T.js","/assets/Overview-C81Jl7jI.js","/assets/Pagination-COxqUxze.js","/assets/PerenaladkaFactTable-CvzmOABh.js","/assets/PersonCard-DJjuwwIg.js","/assets/PlanFulfillment-DkizcJvS.js","/assets/Production-C7Yl-1sc.js","/assets/Profile-ClGPa7o1.js","/assets/ProofCamera-DueA-rR5.js","/assets/ProofPhoto-UuxaRxYv.js","/assets/Quality-BAVU9Dip.js","/assets/RawRows-CSAq1Fk7.js","/assets/RequestStateChip-B7InM992.js","/assets/RichTextEditor-CM3YaBUA.js","/assets/SaveState-BvYMCGn5.js","/assets/SearchInput-Z6jJbNUi.js","/assets/SeasonalityHeatmap-Crj7WYoF.js","/assets/SegmentedToggle-BjGimRSl.js","/assets/SetupTimes-oz_-zG_L.js","/assets/ShiftDaily-5_pzLU_N.js","/assets/Staff-yhGHnBe2.js","/assets/StaffListAtCheck-CUdeBa3F.js","/assets/StatusBadge-CnYc-aNQ.js","/assets/TargetGoal-DN05eyh4.js","/assets/Targets-DWFrWZFM.js","/assets/Tasks-BWrPRc-W.js","/assets/TimeWheelPicker-BAYCZ2z1.js","/assets/Toast-F8XMNmhh.js","/assets/Tooltip-lIw7Ipnw.js","/assets/TrendChart-7LyxdGcs.js","/assets/TripleSpeedometer-_rditKgZ.js","/assets/Trudoyomkost-BE2NuGm5.js","/assets/UploadDropzone-DguAs47i.js","/assets/UsersActivity-Cq9zpvPK.js","/assets/VerdictBlock-B_p8tNTu.js","/assets/VfxApiMap-D_Ov4m8_.js","/assets/VfxDictionaries-CcTqpUKY.js","/assets/VfxEmployees-B2A2KSV5.js","/assets/VfxHrMoves-DxvOF53A.js","/assets/VfxJobs-CmCEmxpr.js","/assets/VfxPhoto-jO0F5TF4.js","/assets/VfxShifts-CN5HOVA9.js","/assets/VfxState-B6qePj6q.js","/assets/VfxTimebooks-DLkMxAhS.js","/assets/VfxTimesheet-DEWr7zgm.js","/assets/WatchProgress-SuVgBXy_.js","/assets/WebLogin-Dk3XNAKh.js","/assets/Workers-CGsNHc4s.js","/assets/Zagruzka-gMhlnSlE.js","/assets/ZagruzkaCell-zvYF4O4s.js","/assets/api-Do1xEEBd.js","/assets/archive-DZ5nJMSp.js","/assets/archive-restore-B9VLTAoL.js","/assets/arrow-down-CtTgGAJY.js","/assets/arrow-down-wide-narrow-DkNYOdkO.js","/assets/arrow-up-narrow-wide-DyP7TX5_.js","/assets/ban-DoiUooFB.js","/assets/boxes-CsFj2ivB.js","/assets/braces-NO_YnWam.js","/assets/brigadirFilters-CnIRaM8o.js","/assets/broadcastTree-D4pK8f72.js","/assets/building-2-Bj-4zhgO.js","/assets/calculator-CgxrCsif.js","/assets/calendar-C87J1Vej.js","/assets/calendar-days-DhpyKpVk.js","/assets/camera-D8e0Gxs6.js","/assets/categories-CHs09Sv3.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DMCRRbNU.js","/assets/chart-line-DYbqCVRg.js","/assets/chart-pie-Cdw8YSHL.js","/assets/chartRange-CKU0pfgz.js","/assets/check-check-Ds1myTHj.js","/assets/chevron-left-KAMJcaf8.js","/assets/chevrons-up-down-XawjFu7L.js","/assets/circle-2kN2Ht24.js","/assets/circle-alert-B48f63sN.js","/assets/circle-check-big-CQ1XzsIx.js","/assets/circle-dashed-50-mg-vA.js","/assets/circle-minus-D5vpfAsQ.js","/assets/circle-question-mark-Dw7mureG.js","/assets/circle-slash-Doq3cMsn.js","/assets/circle-user-round-CoZgH1Tr.js","/assets/cloud-off-B5Rbjzgs.js","/assets/cloud-upload-BaK9NS9s.js","/assets/compass-ntlFBYkZ.js","/assets/concernCategories-CLQoNgnp.js","/assets/corner-down-right-a9zRgg_H.js","/assets/createLucideIcon-oHEy7yvR.js","/assets/es-4jUy_2Mi.js","/assets/external-link-CYzMRWer.js","/assets/file-clock-BCtQiYQ4.js","/assets/file-exclamation-point-CnAeLmMx.js","/assets/flag-D8ROGa96.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-PplXMO6J.js","/assets/hash-BxKR4ufg.js","/assets/hourglass-xJLom3fE.js","/assets/image-off-Br8lbGmk.js","/assets/image-vRv3lDLL.js","/assets/inbox-DFQERjoZ.js","/assets/index-BpwgUCjK.js","/assets/index-CxihQbu_.css","/assets/keyboard-DFWAiYxt.js","/assets/languages-JOews_si.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DbyJRCxb.js","/assets/lightbulb-BaCEWaW-.js","/assets/link-2-Bjl0y3q4.js","/assets/link-2-off-BH5StfVx.js","/assets/list-ordered-Ci2tu8_L.js","/assets/list-tree-RHIFLHRw.js","/assets/lock-open-BPIJqR8e.js","/assets/log-in-hyp7DmB0.js","/assets/marks-CmNQ2LpQ.js","/assets/minimize-2-DfduV9yc.js","/assets/package-check-0u1uLJkC.js","/assets/pencil-BIuf15mc.js","/assets/percent-DQ5Q91w7.js","/assets/pin-DAaA894X.js","/assets/pin-off-dwS-P04t.js","/assets/play-BF0rF86l.js","/assets/plug-zap-Chlwoeat.js","/assets/prop-types-D_OIqGwj.js","/assets/radio-bRUdlXhb.js","/assets/react-apexcharts.esm-pmNLhR9u.js","/assets/registers-DOuCmjCw.js","/assets/repeat-CyTbfsF0.js","/assets/save-DxGp1rGP.js","/assets/scopeLinks-k6hWW70D.js","/assets/scroll-text-DrNyEFJV.js","/assets/search-x-DzUyp1ch.js","/assets/segments-D5D2DOSo.js","/assets/send-M5z3pslh.js","/assets/settings-2-CwjphdPI.js","/assets/shield-BOXM1anG.js","/assets/shield-alert-C9ymaJFz.js","/assets/shield-question-mark-BHQNCGY8.js","/assets/siren-BSIeRwIX.js","/assets/snowflake-BzmQJ2e1.js","/assets/split-DTo8kGL4.js","/assets/square-check-big-BN6UiUs0.js","/assets/star-Ct2doZm6.js","/assets/statusBands-DnJTYdfT.js","/assets/store-DYdddMYB.js","/assets/table-2-B4Chzy33.js","/assets/table-properties-Dwzc0WHs.js","/assets/tag-C_Zj3qxm.js","/assets/timer-off-C3ZdNodG.js","/assets/trending-down-CAO7dvIj.js","/assets/trending-up-CDk0T2gN.js","/assets/undo-2-Bp8MhzvH.js","/assets/useChartTheme-DdO5hvCJ.js","/assets/useElementWidth-FqBeKu7y.js","/assets/useIsMobile-DJ8YJKtU.js","/assets/useOpenParam-D8lHPfK2.js","/assets/useStatusBands-Bg069b-K.js","/assets/useUrlScope-CA3bZRgw.js","/assets/user-D_33-Vuh.js","/assets/user-cog-DWp2GKA_.js","/assets/user-minus-LTr1p1Ml.js","/assets/users-6R10jhzg.js","/assets/vfx-CG9f47_T.js","/assets/video-Cxc9bmAk.js","/assets/wallet-CrRrXD3o.js","/assets/warehouse-CDBEd6i9.js","/assets/workflow-BG0JA4gb.js","/assets/x-g9l67vqq.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
