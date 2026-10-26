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

const BUILD = "2026-10-26T08:14:20.665Z";
const PRECACHE = ["/","/assets/AdminPanel-CQon0oP8.js","/assets/AnalysisBoard-C5F4mQdl.js","/assets/Arc-VCwDf2WQ.js","/assets/Assistant-CoACIRaD.js","/assets/BrigadirProfile-B5dCHcaN.js","/assets/BroadcastReceivers-DMkwSDkl.js","/assets/BroadcastRecord-DVQdn0Yr.js","/assets/Button-paWxUty0.js","/assets/CatLockNotice-CO_zv1R6.js","/assets/CategoryLegendModal-CXcs44W_.js","/assets/CellConcerns-CJugDqQ6.js","/assets/CellDetails-C50C3UKw.js","/assets/CellFormModal-w92adFVR.js","/assets/CellIdent-BjN6NKwF.js","/assets/CellLink-CKvORMtD.js","/assets/Cells-Bu6pyHQy.js","/assets/ColumnFilter-jv4DKxvU.js","/assets/ColumnsPicker-Dh2RkBI7.js","/assets/CommentsModal-DG7aquKc.js","/assets/ComparisonTable-D1HssWfE.js","/assets/Concerns-pL2-KV6l.js","/assets/CountStepper-B3rY8QAF.js","/assets/Daily-K6cvCyVK.js","/assets/DataTable-BXixQX4r.js","/assets/DateRangePicker-ihClYtBT.js","/assets/DayReportView-C6uST7yS.js","/assets/DayStepper-Cp42lmuT.js","/assets/DayStrip-CMXaxuns.js","/assets/DifferenceBreakdown-Dahq7Xex.js","/assets/Downtime-xbI4dYAP.js","/assets/Education-L7pK2qsm.js","/assets/EducationLesson-pt33XOy_.js","/assets/EmptyState-BvRvoLX3.js","/assets/Exam-DVVj2uv8.js","/assets/FactorySelect-CysseZjL.js","/assets/Gamification-Hop6kt4O.js","/assets/GroupBadge-CEHAYjJC.js","/assets/HeatmapChart-BAAo-k7O.js","/assets/IdleCell-BHSSqwSK.js","/assets/KPICard-CENf5rYi.js","/assets/Kaizen-UkpRkiI5.js","/assets/Kelish-BDpu3Gzw.js","/assets/KpiDeltaCard-jfItchUJ.js","/assets/LangTextInput-ChRSqYNQ.js","/assets/Layout-on22nKgB.js","/assets/LeaderAppeal-Crt3loGU.js","/assets/LeaderDayReport-cQXm1Pba.js","/assets/LeaderUnitReport-CSgg7xw7.js","/assets/Leaderboard-BNxvQzkw.js","/assets/Leaders-DGWDpdKZ.js","/assets/LeadersKpi-BzPdhJ2G.js","/assets/Lightbox-CQ_jpZHl.js","/assets/LiveOverview-DO5tMOhF.js","/assets/Login-BSJoPl5K.js","/assets/NotFound-CkNMpP13.js","/assets/Notifications-DTTrejBT.js","/assets/Ontime-KIUyOVHf.js","/assets/Overview-DpoZ-sDd.js","/assets/Pagination-DGKMACjo.js","/assets/PerenaladkaFactTable-O5UeJDoZ.js","/assets/PersonCard-gySg2eb4.js","/assets/PlanFulfillment-2z2YBVaB.js","/assets/Production-BhBSUGDD.js","/assets/Profile-BYg0PRZR.js","/assets/ProofCamera-BMhjtQmU.js","/assets/ProofPhoto-DLbBV7_Y.js","/assets/Quality-zoNqR04u.js","/assets/RawRows-CbJnTL_S.js","/assets/Reports-DMB73EwC.js","/assets/RequestStateChip-DRFKWvFe.js","/assets/RichTextEditor-BiZlDyfM.js","/assets/SaveState-Bhm0XNCh.js","/assets/SearchInput-FteKy1dn.js","/assets/SeasonalityHeatmap-DiuilNp0.js","/assets/SegmentedToggle-CbhNF7Vo.js","/assets/SetupTimes-BLf87boT.js","/assets/ShiftDaily-BvyH05gC.js","/assets/Staff-BjlYUljW.js","/assets/StaffListAtCheck-BmzwzH_Q.js","/assets/StatusBadge-gYza89AE.js","/assets/StatusBandsModal-BrDsnyVF.js","/assets/TargetGoal-PWuKfzpC.js","/assets/Targets-rzmW5yF7.js","/assets/Tasks-D0ICojaL.js","/assets/TimeWheelPicker-BCXDe-Um.js","/assets/Toast-1JlfLhfq.js","/assets/Tooltip-BOEcKOyf.js","/assets/TrendChart-DTnbLSQC.js","/assets/TripleSpeedometer-DCj0y4Vn.js","/assets/Trudoyomkost-DyuNWO64.js","/assets/UploadDropzone-AU-1k1VN.js","/assets/UsersActivity-DcHPuJ_p.js","/assets/VerdictBlock-iS3wZE3P.js","/assets/VfxApiMap-CTqfTCuR.js","/assets/VfxDictionaries-BeSnSYB1.js","/assets/VfxEmployees-D01l992N.js","/assets/VfxHrMoves-T48DTPBK.js","/assets/VfxJobs-CryW58R1.js","/assets/VfxPhoto-C7U5J5OO.js","/assets/VfxShifts-S4_RSkmb.js","/assets/VfxState-mtW26GmA.js","/assets/VfxTimebooks-C2tJkfbe.js","/assets/VfxTimesheet-Cxc1Vo9w.js","/assets/WatchProgress-CXc2PY5N.js","/assets/WebLogin-DCHKCGM1.js","/assets/Workers-W3AaGhAv.js","/assets/Zagruzka-HQY5y1k9.js","/assets/ZagruzkaCell-CpsH91MS.js","/assets/api-BFm7MSgf.js","/assets/archive-DJkLeIo7.js","/assets/archive-restore-DK3K73Dc.js","/assets/arrow-down-CaRQ9k3D.js","/assets/arrow-down-right-CBAeYksk.js","/assets/arrow-down-wide-narrow-BoZIWIyz.js","/assets/arrow-up-narrow-wide-BiEtToS0.js","/assets/ban-DSMOV2PP.js","/assets/boxes-CS48Cf2p.js","/assets/braces-CQlxIsIG.js","/assets/brigadirFilters-NbvX5vgJ.js","/assets/broadcastTree-Bk3Zsm1G.js","/assets/building-2-V9cCPxE3.js","/assets/calendar-1mW3pjX_.js","/assets/calendar-days-BszYcRyY.js","/assets/camera-DhOOuSTB.js","/assets/categories-BZD-z3tj.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BczQyCSk.js","/assets/chart-line-Bm93BNlf.js","/assets/chart-pie-CvAeJw-g.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-neJffq_M.js","/assets/chevron-left-BBBsxTuR.js","/assets/chevrons-up-down-nMoYQctz.js","/assets/circle-CFHt-dEO.js","/assets/circle-alert-DsFpJCKN.js","/assets/circle-check-big-CnA3Ns5H.js","/assets/circle-dashed-DmOeJT1N.js","/assets/circle-minus-DqptB8K2.js","/assets/circle-question-mark-DcyLVtkb.js","/assets/circle-slash-B-AkV-rD.js","/assets/circle-user-round-BntjV-pS.js","/assets/cloud-off-DXol3QS-.js","/assets/cloud-upload-BA_0u-tH.js","/assets/coins-BU62M_xk.js","/assets/compass-DPh5Oojy.js","/assets/concernCategories-Dz7CjNNw.js","/assets/corner-down-right-DwGhDYoX.js","/assets/createLucideIcon-10dLtRZF.js","/assets/en-8eXvFbC9.js","/assets/es-Dtgc5NM1.js","/assets/external-link-C1LCI_i-.js","/assets/file-clock-CGMVJOrn.js","/assets/file-exclamation-point-Beg3cFaw.js","/assets/flag-ysdE4pOs.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Ca8ZZ4Nf.js","/assets/funnel-xvvQ23IA.js","/assets/hash-CjQZ-s50.js","/assets/hourglass-g8Phr1fv.js","/assets/idleTime-CHPnJRpw.js","/assets/image-DTau6CT0.js","/assets/image-off-DrnEkPHM.js","/assets/inbox-fpHe6706.js","/assets/index-CFKNzIy8.css","/assets/index-D2N7CTML.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CYEtERYu.js","/assets/languages-g4RXb8V5.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-OAj_ByfM.js","/assets/leaderBoard-_nEPNJk9.js","/assets/lightbulb-DA7bngeC.js","/assets/link-2-BzvvI5Nm.js","/assets/link-2-off-DjZBtQp3.js","/assets/list-ordered-C3bkn4uV.js","/assets/list-tree-C4okMsKy.js","/assets/lock-open-PKTqog8E.js","/assets/log-in-C406QUfq.js","/assets/map-pin-BFOOByBp.js","/assets/marks-Bd0QZcLr.js","/assets/minimize-2-D8iSvAss.js","/assets/package-check-D14omjhi.js","/assets/pencil-BQPtImH0.js","/assets/percent-DvqX5qsq.js","/assets/pin-DGJhFgAI.js","/assets/pin-off-DfzVer1h.js","/assets/play-CaTP-4tm.js","/assets/plug-zap-BJK625H0.js","/assets/prop-types-RD3fbola.js","/assets/radio-MMLQ1hPa.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-CExsHdwL.js","/assets/repeat-BMoq2nP0.js","/assets/ru-BnpwF9tu.js","/assets/save-DhYHAlIb.js","/assets/scopeLinks-DyREWDme.js","/assets/scroll-text-BmSXCyTC.js","/assets/search-x-BxLSLs1v.js","/assets/segments-D5Uiedtv.js","/assets/send-UYoAvaDv.js","/assets/settings-2-C-UOlkP7.js","/assets/shield-HOLfUf91.js","/assets/shield-alert-BWRUvlCg.js","/assets/shield-question-mark-C2bRC9PY.js","/assets/sigma-2x_JjNhD.js","/assets/siren-VmyNVVL5.js","/assets/snowflake-DtbAByUM.js","/assets/split-BG_alkAo.js","/assets/square-check-big-DVjfmI05.js","/assets/star-DY_lihxp.js","/assets/statusBands-DVBZcBq3.js","/assets/store-BbJ3I6QO.js","/assets/table-2-DEiE9URj.js","/assets/table-properties-DD-o5j3f.js","/assets/tag-DXF2wjZq.js","/assets/timer-off-saiPiQuR.js","/assets/translations-B4PtNSr7.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-CsSyDIf5.js","/assets/trending-up-BMyfQy2V.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-yCK5o6b3.js","/assets/useChartTheme-D70kb5Wm.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-CmQhgMLg.js","/assets/useStatusBands-Csw6q20t.js","/assets/useUrlScope-CCAProqZ.js","/assets/user-Bnmo3of8.js","/assets/user-cog-BX6WzhPg.js","/assets/user-minus-BimmJ30w.js","/assets/users-CqY3pNEQ.js","/assets/uz-6V-x9625.js","/assets/uz_cyrl-nP3ojMxp.js","/assets/vfx-KH3QMYtx.js","/assets/video-CjQ2JoTY.js","/assets/wallet-My2BE5ck.js","/assets/warehouse-CBWuqE4i.js","/assets/workflow-DwHArdx5.js","/assets/x-A7uvfz00.js","/assets/zap-CSeuI3aI.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
