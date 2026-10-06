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

const BUILD = "2026-10-06T05:26:03.082Z";
const PRECACHE = ["/","/assets/AdminPanel-DQUsIapP.js","/assets/AnalysisBoard-CGviPOSA.js","/assets/Arc-D9Xn0Ch5.js","/assets/Assistant-CvRNYCXG.js","/assets/BrigadirProfile-L_PkdRXb.js","/assets/BroadcastReceivers-DKS28mdH.js","/assets/BroadcastRecord-BePwMRh8.js","/assets/Button-DHv1j6sm.js","/assets/CatLockNotice-C-1e5E3H.js","/assets/CategoryLegendModal-CHLtlt7m.js","/assets/CellConcerns-BpOBtedR.js","/assets/CellDetails-CyCTDrTg.js","/assets/CellFormModal-BIU6DIUm.js","/assets/CellIdent-DBmoSAYP.js","/assets/CellLink-eMdTbuOk.js","/assets/Cells-DIPBwFlZ.js","/assets/ColumnFilter-Dki6S8tn.js","/assets/ColumnsPicker-CoJypSPY.js","/assets/CommentsModal-CkfE8VGj.js","/assets/ComparisonTable-Dcptt0-7.js","/assets/Concerns-FnZKV-es.js","/assets/Daily-BTwND13X.js","/assets/DataTable-Dn9wHSbV.js","/assets/DateRangePicker-BbDu4EB8.js","/assets/DayReportView-Dku1yAhq.js","/assets/DayStepper-BVea2vXq.js","/assets/DifferenceBreakdown-BqqEhL8L.js","/assets/Downtime-Brf_2xqb.js","/assets/Education-Cl2k6Yiv.js","/assets/EducationLesson-Dt7f9z0N.js","/assets/EmptyState-CyWQeJWb.js","/assets/Exam-CcTyhwQ8.js","/assets/FactorySelect-C41SMD6l.js","/assets/Gamification-Du5vewFf.js","/assets/GroupBadge-qwInvBRs.js","/assets/HeatmapChart-DZ7XLkpk.js","/assets/IdleCell-ZRgowSp8.js","/assets/KPICard-D-uV2dqV.js","/assets/Kaizen-CfGq9LtM.js","/assets/Kelish-DEaID5uH.js","/assets/KpiDeltaCard-BPD47clN.js","/assets/LangTextInput-C3b4RL7H.js","/assets/Layout-ggnE9weR.js","/assets/LeaderAppeal-xl5TO7Fc.js","/assets/LeaderDayReport-DEFZFnEa.js","/assets/LeaderUnitReport-DK0oH7kb.js","/assets/Leaderboard-MTjTRVdX.js","/assets/Leaders-fxnezw2n.js","/assets/Lightbox-CNwBzrPU.js","/assets/LiveOverview-Djc63VuV.js","/assets/Login-DzOG-aNN.js","/assets/NotFound-DTOuECnP.js","/assets/Notifications-D4f-l2YA.js","/assets/Overview-CP0pqmK4.js","/assets/Pagination-B9RA1qL8.js","/assets/PerenaladkaFactTable-B-kcxpFw.js","/assets/PersonCard-D4Bnz87n.js","/assets/PlanFulfillment-rEkjZA-l.js","/assets/Production-Bslc2bGB.js","/assets/Profile-rqFoDCpo.js","/assets/ProofCamera-DnzydNms.js","/assets/ProofPhoto-CaJ3zDsY.js","/assets/Quality-jojO10_Z.js","/assets/RawRows-BZ44sWfP.js","/assets/RequestStateChip-u86CeAXx.js","/assets/RichTextEditor-C-eqMA7y.js","/assets/SaveState-vgo4mGMk.js","/assets/SearchInput-C_s9pBHO.js","/assets/SeasonalityHeatmap-DPRK5g5Y.js","/assets/SegmentedToggle-c3eQIPLy.js","/assets/SetupTimes-_qmFVEGq.js","/assets/ShiftDaily-BA4oIxO9.js","/assets/Staff-Ba-jXw6W.js","/assets/StaffLive-DG505jPF.js","/assets/StatusBadge-B-oaByRb.js","/assets/TargetGoal-CmmiYoBY.js","/assets/Targets-BNsXdRQ4.js","/assets/Tasks-DBkmTGgR.js","/assets/TimeWheelPicker-6SAojqz1.js","/assets/Toast-Dm5Wma9R.js","/assets/Tooltip-B1J7PAIN.js","/assets/TrendChart-3oUtbKWn.js","/assets/TripleSpeedometer-7MS4jzKM.js","/assets/Trudoyomkost-N6b7i9ya.js","/assets/Turnover-DQYx7AuE.js","/assets/UploadDropzone-BOZTaryQ.js","/assets/UsersActivity-Cb_z-fHf.js","/assets/VerdictBlock-CoVn12G6.js","/assets/VfxApiMap-orm1pa7b.js","/assets/VfxDictionaries-B-Rc7spa.js","/assets/VfxEmployees-BP9x3p6_.js","/assets/VfxHrMoves-BL8lIMBC.js","/assets/VfxJobs-PKA_G0uO.js","/assets/VfxPhoto-BigchxrT.js","/assets/VfxShifts-CwmdH0yd.js","/assets/VfxState-CcoUiFPX.js","/assets/VfxTimebooks-CnlOmqCz.js","/assets/VfxTimesheet-CfxqOa9R.js","/assets/WatchProgress-CxyQByeS.js","/assets/WebLogin-CYxa2uW5.js","/assets/WorkerConcerns-BlA1lR4i.js","/assets/Workers-CS4Sm80a.js","/assets/Zagruzka-CgZPJ8ob.js","/assets/ZagruzkaCell-CoRQgg0Q.js","/assets/api-BOeadc2V.js","/assets/archive-CUlPeaK-.js","/assets/archive-restore-B_1bSW3J.js","/assets/arrow-down-D4b3fPH-.js","/assets/arrow-up-narrow-wide-rw_lL81q.js","/assets/award-WxJnXGtq.js","/assets/ban-CymJnSIt.js","/assets/boxes-DIagGMjm.js","/assets/braces-BhEPKFMv.js","/assets/brigadirFilters-D6W6zzOZ.js","/assets/broadcastTree-DVe0El9X.js","/assets/building-2-HDdmHVty.js","/assets/calculator-U-Wx_U20.js","/assets/calendar-6XIf4nX5.js","/assets/calendar-days-BlHINoFg.js","/assets/camera-kikIywBJ.js","/assets/categories-CXI970E6.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Dr4V3qX6.js","/assets/chart-line-BAZumN6B.js","/assets/chart-pie-Cm3_BQJs.js","/assets/chartRange-BCTJrXPi.js","/assets/check-check-CkE8fVkP.js","/assets/chevron-left-B6vdCnf7.js","/assets/chevrons-up-down-DXTItvi1.js","/assets/circle-Chy5JBRQ.js","/assets/circle-alert-JAy-kbKl.js","/assets/circle-check-big-B4YYvv7m.js","/assets/circle-dashed-enzXe5cp.js","/assets/circle-minus-C3n-PO13.js","/assets/circle-question-mark-Bq20IwCZ.js","/assets/circle-slash-PB5yrQ8c.js","/assets/circle-user-round-BYsCL16e.js","/assets/clock-3-D5b-ZfSX.js","/assets/cloud-off-xVPfzTGp.js","/assets/cloud-upload-fYyWnoV1.js","/assets/compass-DWYmPeqC.js","/assets/concernCategories-DnCPFMzM.js","/assets/copy-Baxxbwgn.js","/assets/corner-down-right-DBJe-9TB.js","/assets/createLucideIcon-C7uFEynp.js","/assets/es-B6yLdas1.js","/assets/external-link-CG7LuStT.js","/assets/file-clock-eYiTU43v.js","/assets/file-exclamation-point-BMzxog5P.js","/assets/flag-DtNrxHJs.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Bts5JtVf.js","/assets/hash-CifOhg76.js","/assets/hourglass-BvOgfkk9.js","/assets/image-Bi2hlLC5.js","/assets/image-off-C4NN9dMB.js","/assets/inbox-Ikypix47.js","/assets/index-BKM2gJ54.css","/assets/index-EyxfR7l0.js","/assets/keyboard-dgzzNmUm.js","/assets/languages-NTTacrAs.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-pJdNGpLC.js","/assets/lightbulb-Bs6gphNF.js","/assets/link-2-DB3aIgL6.js","/assets/link-2-off-B53W5j2d.js","/assets/list-ordered-BWdH4u4l.js","/assets/list-tree-copclco9.js","/assets/lock-open-ip5IrMCw.js","/assets/log-in-QCgvGkj5.js","/assets/minimize-2-C2yuYz2T.js","/assets/package-check-CxJ2Raan.js","/assets/pencil-DpH5b8DA.js","/assets/percent-F7GhwGUP.js","/assets/pin-BoDXsm2g.js","/assets/pin-off-BL8xQZW_.js","/assets/play-DInJIY4t.js","/assets/plug-zap-BQPuS-m-.js","/assets/prop-types-DnAUZnLA.js","/assets/react-apexcharts.esm-BlNaurOf.js","/assets/registers-C4KF0MyP.js","/assets/repeat-7LrmhNDg.js","/assets/rotate-cw-kTMMkP4J.js","/assets/save-Cu-w4ZG3.js","/assets/scopeLinks-B5NUklYD.js","/assets/scroll-text-BeBffOIU.js","/assets/search-x-v2sHlpKo.js","/assets/segments-E2euiE8I.js","/assets/send-Bv4h9V3p.js","/assets/settings-2-BgZPBSDO.js","/assets/shield-NKDMGcye.js","/assets/shield-alert-DqcCAqOC.js","/assets/shield-question-mark-BSMmWEo-.js","/assets/siren-B6ujRw33.js","/assets/snowflake-p_OyimG3.js","/assets/split-DWA0HNxD.js","/assets/square-check-big-B8_MK6sn.js","/assets/star-CdQizwDr.js","/assets/statusBands-Dwmvsimj.js","/assets/store-B0KeqrwY.js","/assets/table-2-C9cgsQp1.js","/assets/table-properties-CEWiJW3_.js","/assets/tag-z3pZgj82.js","/assets/timer-off-CTnGqqPs.js","/assets/trending-down-gFWPbkWB.js","/assets/trending-up-Chhu8b29.js","/assets/undo-2-oV3p13jS.js","/assets/useChartTheme-BjIlN0XU.js","/assets/useElementWidth-CKEHUTid.js","/assets/useIsMobile-D9gHwdeE.js","/assets/useOpenParam-BPT7U2y7.js","/assets/useStatusBands-B2iPnspp.js","/assets/useUrlScope-6XOxkftz.js","/assets/user-Cl3kPk9R.js","/assets/user-cog-BNARzzej.js","/assets/users-I5xBuH_b.js","/assets/vfx-J_uIywhi.js","/assets/video-D7pE3x9v.js","/assets/wallet-C2HnenqG.js","/assets/warehouse-Cv5rOvol.js","/assets/x--pr2sAlJ.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
