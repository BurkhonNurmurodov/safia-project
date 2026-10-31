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

const BUILD = "2026-10-31T06:08:51.385Z";
const PRECACHE = ["/","/assets/AdminPanel-56jtSZuu.js","/assets/AnalysisBoard-6E8-FXkR.js","/assets/Arc-ToCl2P99.js","/assets/Assessment-B3HuyTrt.js","/assets/AssessmentGrade-BK-WzqV0.js","/assets/Assistant-BPHWOgrz.js","/assets/BrigadirProfile-CZ8qKieE.js","/assets/BroadcastReceivers-tvL3XNDX.js","/assets/BroadcastRecord-DeEQKSbv.js","/assets/Button-CbWFAlld.js","/assets/CatLockNotice--Uk0Ewa_.js","/assets/CategoryLegendModal-DBVF09wL.js","/assets/CellConcerns-dKtBzxyN.js","/assets/CellDetails-DGM7QSVp.js","/assets/CellFormModal-BDgXjjZP.js","/assets/CellIdent-lXofF-Kc.js","/assets/CellLink-qT5LyHOT.js","/assets/Cells-eUjyu6t0.js","/assets/ColumnFilter-KP3-bGsX.js","/assets/ColumnsPicker-CDJEgmuK.js","/assets/CommentsModal-DRZ_dMuB.js","/assets/ComparisonTable-DfTmu7Wk.js","/assets/Concerns-Ng6VFQHe.js","/assets/CountStepper-CtrducBC.js","/assets/Daily-DS-U-r-P.js","/assets/DataTable-DawOBcA8.js","/assets/DateRangePicker-CzUQBPra.js","/assets/DayReportView-ZHzFSxK1.js","/assets/DayStepper-Cs8wVN_s.js","/assets/DayStrip-JxIXAuRK.js","/assets/DifferenceBreakdown-B4Go3rHJ.js","/assets/Downtime-CzCTeSV3.js","/assets/Education-DDriJNoU.js","/assets/EducationLesson-Bb-E6YsT.js","/assets/EmptyState-fQfLyWy_.js","/assets/Exam-CkXULPJ6.js","/assets/FactorySelect-CECjkWNt.js","/assets/Gamification-DsGJKPhE.js","/assets/HeatmapChart-_1xP-z7r.js","/assets/IdleCell-CdSI7Rxd.js","/assets/KPICard-CbJXXzvV.js","/assets/Kaizen-BN4EJIoz.js","/assets/Kelish-B0LVXYnP.js","/assets/KpiDeltaCard-D1n3c1_q.js","/assets/LangTextInput-jgotdI0S.js","/assets/Layout-pG_4YG_X.js","/assets/LeaderAppeal-BIlaspqz.js","/assets/LeaderDayReport-CO-ebqOy.js","/assets/LeaderUnitReport-DOorfY-m.js","/assets/Leaderboard-DhA951OD.js","/assets/Leaders-ZQiENt3Q.js","/assets/LeadersKpi-BrUem41A.js","/assets/Lightbox-DQCCKgL6.js","/assets/LiveOverview-ZwltoVIe.js","/assets/Login-GFBAYet9.js","/assets/NotFound-CKSor227.js","/assets/Notifications-BenIWY_o.js","/assets/Ontime-C7zkxZ6e.js","/assets/Overview-B19EvC62.js","/assets/Pagination-BomsZK7T.js","/assets/PerenaladkaFactTable-BY09ezMK.js","/assets/PersonCard-BR2D8G90.js","/assets/PlanFulfillment-D5vGkuaC.js","/assets/Production-BXPpk_nC.js","/assets/Profile-uyzfh04e.js","/assets/ProofCamera-DyJtk3oL.js","/assets/ProofPhoto-CTMqUYWc.js","/assets/Quality-iAoeavwM.js","/assets/RawRows-FS_Iz729.js","/assets/Reports-2HVxkRMv.js","/assets/RequestStateChip-C6xlFm3M.js","/assets/RichTextEditor-Br2nG_oI.js","/assets/SaveState-B6c4_Ay8.js","/assets/SearchInput-D6DrytXr.js","/assets/SeasonalityHeatmap-xYKnHPX5.js","/assets/SegmentedToggle-DOwzEGNA.js","/assets/SetupTimes-qS49z20G.js","/assets/ShiftDaily-Dq2RCTC0.js","/assets/Staff-K6fXqahD.js","/assets/StaffListAtCheck-DJPFyWoQ.js","/assets/StatusBadge-B3l0fRjU.js","/assets/StatusBandsModal-NY3Ab6nx.js","/assets/TargetGoal-Dw8R2hfV.js","/assets/Targets-CUK5sVa1.js","/assets/Tasks-DiDrUydc.js","/assets/TimeWheelPicker-DF-CeHaP.js","/assets/Toast-DPhz5Ss_.js","/assets/Tooltip-A8kR-LL2.js","/assets/TrendChart-yyObGbo7.js","/assets/TripleSpeedometer-BJ3xi2uE.js","/assets/Trudoyomkost-YHa5bPS5.js","/assets/UploadDropzone-BLvjrvBA.js","/assets/UsersActivity-Dj9zbhmr.js","/assets/VerdictBlock-B_0ykQjh.js","/assets/VfxApiMap-CUNQsSxS.js","/assets/VfxDictionaries-CqeifjNp.js","/assets/VfxEmployees-DkcO_kG_.js","/assets/VfxHrMoves-CYoZhAqo.js","/assets/VfxJobs-Cmc_Wa3N.js","/assets/VfxPhoto-xkUm4shh.js","/assets/VfxShifts-cr-jkgvv.js","/assets/VfxState-2PFrTn-A.js","/assets/VfxTimebooks-BoN6Xk7Q.js","/assets/VfxTimesheet-BN20B1SO.js","/assets/WatchProgress-x_Y2GXdB.js","/assets/WebLogin-CHFuaN1e.js","/assets/Workers-CDdhZ3Ug.js","/assets/Zagruzka-DQYmJwzg.js","/assets/ZagruzkaCell-BI7JkdDq.js","/assets/api-BFm7MSgf.js","/assets/archive-Bcdd931N.js","/assets/archive-restore-gfpBfDK0.js","/assets/arrow-down-B18hsxtH.js","/assets/arrow-down-right-CApdAava.js","/assets/arrow-down-wide-narrow-C4M5iXYO.js","/assets/arrow-up-narrow-wide-Dder4Xcg.js","/assets/assessmentUtil-DBaE6ePs.js","/assets/ban-DXj37RB_.js","/assets/boxes-DvFYUhUz.js","/assets/braces-CEdr8aeP.js","/assets/brigadirFilters-C-PauKx2.js","/assets/broadcastTree-CJothPth.js","/assets/calendar-DtHTwyJl.js","/assets/calendar-days-Diei_ahX.js","/assets/camera-B_loQ7rP.js","/assets/categories-hzUrZ_UE.js","/assets/cellMoveRefusal-BTtUxe75.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C3X7K04_.js","/assets/chart-line-CsosIOlU.js","/assets/chart-pie-CrHo-yil.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-BWu61kvB.js","/assets/chevron-left-B8sxdqcg.js","/assets/chevrons-up-down-DSK1Iqdq.js","/assets/circle-IByJ3ri6.js","/assets/circle-alert-5QjJAhEe.js","/assets/circle-check-big-YPAgRk6h.js","/assets/circle-dashed-B8xeg5fi.js","/assets/circle-minus-Ddxetf6d.js","/assets/circle-question-mark-CjwcVT_W.js","/assets/circle-user-round-BXT73sfd.js","/assets/cloud-off-a2m3aUMr.js","/assets/cloud-upload-bDYPE-Ez.js","/assets/coins-BnOVkXxs.js","/assets/compass-CpiflcNx.js","/assets/concernCategories-Bg3e67wt.js","/assets/corner-down-right-DnsSDZoZ.js","/assets/createLucideIcon-CdnjERqN.js","/assets/en-DlwD8YIj.js","/assets/es-Dtgc5NM1.js","/assets/external-link-CuX0WmK9.js","/assets/file-exclamation-point-DrMd1aLg.js","/assets/flag-CXlHMDnO.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-HUM3j7Bo.js","/assets/funnel-NifYTd35.js","/assets/hard-hat-Coh0TZJu.js","/assets/hash-CD4wb5NS.js","/assets/hourglass-DqCspKgU.js","/assets/idleTime-CHPnJRpw.js","/assets/image-DqxwhH7J.js","/assets/image-off-CrNsLI1D.js","/assets/inbox-DopYBywj.js","/assets/index-D0yXHfzL.js","/assets/index-RKIo6lSU.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-BEIcJOuV.js","/assets/layers-BFihB8NV.js","/assets/leaderBoard-Cl_LbrJ9.js","/assets/lightbulb-DZwzl2iM.js","/assets/link-2-CcK4vkIZ.js","/assets/link-2-off-CWnJtM16.js","/assets/list-ordered-C2IGVj3t.js","/assets/list-tree-DoQtu45-.js","/assets/lock-open-DXXhrwnK.js","/assets/log-in-BVWCIWLw.js","/assets/map-pin-DKTBMkvh.js","/assets/marks-vdkscnZX.js","/assets/message-square-text-UuCHBgr9.js","/assets/minimize-2-BT1npI5y.js","/assets/package-DNaan8Gk.js","/assets/package-check-CZrtOvWL.js","/assets/pencil-B5CjTuGc.js","/assets/percent-BGLdV9Rv.js","/assets/pin-D5osAWQP.js","/assets/pin-off-PSr1YTeX.js","/assets/play-BqrMkO9C.js","/assets/plug-zap-BLr983Bf.js","/assets/prop-types-RD3fbola.js","/assets/radio-CXjUCz0C.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-Bywt9ryz.js","/assets/repeat-BsbwFXSX.js","/assets/ru-Dr6iz6RU.js","/assets/save-Cu-tMk_o.js","/assets/scopeLinks-DtV43Qso.js","/assets/search-x-caSbTONN.js","/assets/segments-D5Uiedtv.js","/assets/send-ClNxySHG.js","/assets/shield-DiM8wtVL.js","/assets/shield-alert-CTtmFChU.js","/assets/sigma-uK25k7z6.js","/assets/siren-CmrzXcFf.js","/assets/snowflake-9AY7TcZk.js","/assets/split-ChFPAo6_.js","/assets/square-check-big-DaTICY9-.js","/assets/star-BIT9nwiL.js","/assets/statusBands-DVBZcBq3.js","/assets/store-ClFW7ear.js","/assets/table-2-DPLibRKU.js","/assets/table-properties-C3CSbsc0.js","/assets/tag-DjHxyN0D.js","/assets/timer-off-DgakkFip.js","/assets/translations-BtBl1Vo5.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-uBqQbv3D.js","/assets/trending-up-DJSvmo3W.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-EUp3jLjq.js","/assets/useChartTheme-D_gUcr2x.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-DtXCvawh.js","/assets/useStatusBands-X0pDO6IY.js","/assets/useUrlScope-DxKKa9jk.js","/assets/user-T9GdFjAY.js","/assets/user-cog-Dp7M1uzs.js","/assets/uz-k6jWlKE7.js","/assets/uz_cyrl-BkYUymcg.js","/assets/vfx-C3gMXYN6.js","/assets/video-pm_vbEMV.js","/assets/wallet-CrUCTQzd.js","/assets/warehouse-K23Lh5gr.js","/assets/workflow-BdArgaUr.js","/assets/x-B1NNZjwT.js","/assets/zap-B5d6vs0s.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
