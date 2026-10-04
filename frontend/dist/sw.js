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

const BUILD = "2026-10-04T07:36:02.011Z";
const PRECACHE = ["/","/assets/AdminPanel-HmjGaScc.js","/assets/AnalysisBoard-Do1J4lVD.js","/assets/Arc-DYPhCnYP.js","/assets/ArcLegacy-9s38u9BK.js","/assets/BrigadirProfile-DKcJ2-nK.js","/assets/BroadcastReceivers-CLoxjLDZ.js","/assets/BroadcastRecord-CJ7R4vJw.js","/assets/CatLockNotice-Bzo6hdyY.js","/assets/CategoryLegendModal-PxSihQdq.js","/assets/CellConcerns-BM714pgf.js","/assets/CellDetails-CLoTZy8S.js","/assets/CellFormModal-B8d7pDvl.js","/assets/CellIdent-CH5NW9R8.js","/assets/CellLink-DTw1q9qC.js","/assets/Cells-HOaRRL3S.js","/assets/ColumnFilter-lRHXLNff.js","/assets/ColumnsPicker-DAEZBK6g.js","/assets/CommentsModal-BFrMDCIE.js","/assets/ComparisonTable-CPTj3qzJ.js","/assets/Concerns-BhriHFKn.js","/assets/ConfirmDialog-DEaJNKR5.js","/assets/Daily-CdyhADLW.js","/assets/DataTable-3uXQe5z3.js","/assets/DateRangePicker-DD2nVLAE.js","/assets/DayReportView-Bs9pRzhY.js","/assets/DayStepper-C2erg4a3.js","/assets/DifferenceBreakdown-C0xtSgRW.js","/assets/Downtime-BTTnrBa6.js","/assets/Education-EOChkB7P.js","/assets/EducationLesson-DakPnElA.js","/assets/EmptyState-CWzejIu9.js","/assets/Exam-BIXDMhfc.js","/assets/FactorySelect-Dg6QL-Ah.js","/assets/Gamification-CLYAPMja.js","/assets/GroupBadge-DguvGzVh.js","/assets/HeatmapChart-CrKR8Fem.js","/assets/IdleCell-GF9NEh7i.js","/assets/KPICard-CPu4qypA.js","/assets/Kaizen-238JfrHQ.js","/assets/Kelish-Daw2vvaS.js","/assets/KpiDeltaCard-88OsN_1-.js","/assets/LangTextInput-ZMaTDj8z.js","/assets/Layout-ryj1FnSx.js","/assets/LeaderAppeal-m_6aBDSk.js","/assets/LeaderDayReport--unYbz3F.js","/assets/LeaderUnitReport-kKc919Ll.js","/assets/Leaderboard-DCJB3m_c.js","/assets/Leaders-BrWrjzQP.js","/assets/Lightbox-CE5SH--l.js","/assets/LiveOverview-BY8M-g2i.js","/assets/Login-LDx0_HLF.js","/assets/NotFound-BfRJ_GoH.js","/assets/Notifications-SrfFTwqP.js","/assets/Overview-D-fKZ2K6.js","/assets/Pagination-Sb9QwIzu.js","/assets/PerenaladkaFactTable-CR6qnjFH.js","/assets/PersonCard-DBOay52f.js","/assets/PlanFulfillment-D5iMC0VD.js","/assets/Production-BhI_hO_z.js","/assets/Profile-ziV84lKn.js","/assets/ProofCamera-gFO6qDkd.js","/assets/ProofPhoto-DsTpdy_O.js","/assets/Quality-Cd5jWt5s.js","/assets/RawRows-Cr2WM1CI.js","/assets/RequestStateChip-ClJ82m2T.js","/assets/RichTextEditor-Cgxz4eQi.js","/assets/SaveState-BpuSE52d.js","/assets/SearchInput-Dhfx4_vF.js","/assets/SeasonalityHeatmap-CzADAIUF.js","/assets/SegmentedToggle-DvFHDCZ5.js","/assets/SetupTimes-Dnf1bT7U.js","/assets/ShiftDaily-rYiv_WGp.js","/assets/Staff-BeoTffBA.js","/assets/StaffLive-C6Op4aTh.js","/assets/StatusBadge-DFCHJURf.js","/assets/TargetGoal-Cw-ohFUK.js","/assets/Targets-Dt9JMsbc.js","/assets/Tasks-DYlJixop.js","/assets/TimeWheelPicker-6i1TI-Cs.js","/assets/Toast-6RMjzEM9.js","/assets/Tooltip-CPOELZ7F.js","/assets/TrendChart-GLWFLk47.js","/assets/TripleSpeedometer-CA0Drh1D.js","/assets/Trudoyomkost-Ce0JDAhS.js","/assets/UploadDropzone-DQAIYa2T.js","/assets/UsersActivity-S30BASzX.js","/assets/VerdictBlock-B5_X19Js.js","/assets/VfxAbsences-D4n5RlXI.js","/assets/VfxApiMap-Do3hMXHl.js","/assets/VfxDevices-D9X0E5dH.js","/assets/VfxDictionaries-D47r5YD3.js","/assets/VfxEmployees-CuKS6UtN.js","/assets/VfxHrMoves-TmihDd2J.js","/assets/VfxIncidents-BS7fESzu.js","/assets/VfxJobs-BZJIh1zl.js","/assets/VfxMarks-ZWlx70b2.js","/assets/VfxOnSite-CVvuzrbi.js","/assets/VfxPhoto-DolXKtiY.js","/assets/VfxRequests-ByiQKFWR.js","/assets/VfxShifts-J2rQg7Xt.js","/assets/VfxState-CG0iiABa.js","/assets/VfxStructure-BOVZIIYX.js","/assets/VfxTable-BJTk_-M7.js","/assets/VfxTimebooks-dAwpQ82y.js","/assets/VfxTimesheet-mqNxN7c-.js","/assets/WatchProgress-B1eO98hF.js","/assets/WebLogin-CXxuVEYj.js","/assets/WorkerConcerns-Dl6KKZ9g.js","/assets/Workers-CmD7hgbN.js","/assets/Zagruzka-Do8ajFsJ.js","/assets/ZagruzkaCell-DuNZVeRq.js","/assets/api-B6Lyh1sz.js","/assets/archive-DUelEyNi.js","/assets/archive-restore-DbBenlFD.js","/assets/arrow-down-Civ15d49.js","/assets/arrow-left-CQ9OSsPo.js","/assets/arrow-up-BQ6eSxbe.js","/assets/arrow-up-narrow-wide-C9T7Cr8V.js","/assets/arrow-up-right-Bq0ZOkQd.js","/assets/award-BeULNBRP.js","/assets/ban-C-E9iehW.js","/assets/bot-DTgdS1wk.js","/assets/boxes-CFSxFcDf.js","/assets/braces-BkK5pmCT.js","/assets/brigadirFilters-2t65mKHM.js","/assets/broadcastTree-BTPqmd1g.js","/assets/building-2-D9H7Wx6w.js","/assets/calendar-HuCLh2fl.js","/assets/calendar-days-VduBkRtx.js","/assets/camera-CIhcyGps.js","/assets/categories-TLb_1nlR.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BcnJLw00.js","/assets/chart-line-DIUmHbad.js","/assets/chart-pie-BZo0xADc.js","/assets/chartRange-CaUf5eO5.js","/assets/check-check-C7vYo766.js","/assets/chevron-left-CJf2djgI.js","/assets/chevrons-up-down-DcOk61Jp.js","/assets/circle-CxKz8JC_.js","/assets/circle-alert-CyIJpCqt.js","/assets/circle-check-big-RDJf8W06.js","/assets/circle-dashed-GgKm2fhn.js","/assets/circle-minus-B2kd8pvW.js","/assets/circle-question-mark-BDCJoNWf.js","/assets/circle-slash-DbHsC6qZ.js","/assets/circle-user-round-Csh45DDi.js","/assets/clock-3-BGUQiwz8.js","/assets/cloud-off-BigcdD_U.js","/assets/cloud-upload-Q_gStNFJ.js","/assets/compass-Z2Xu3bJw.js","/assets/concernCategories-DpizUFF5.js","/assets/copy-BlkdJ7LI.js","/assets/corner-down-right-BF5JiJBV.js","/assets/createLucideIcon-BccxWe6W.js","/assets/door-open-D6BusOBt.js","/assets/es-DSvvQ8Cf.js","/assets/exportXlsx-BoebPtG4.js","/assets/external-link-w4VqDmSq.js","/assets/file-clock-azd9OFHs.js","/assets/file-exclamation-point-CvmVjmT_.js","/assets/file-spreadsheet-C7g_kbn2.js","/assets/file-text-CBlolXif.js","/assets/flag-75hRLExP.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DEtzmuPJ.js","/assets/hash-DJe8A_37.js","/assets/history--7OhlQPN.js","/assets/hourglass-ICU6k1dN.js","/assets/image-CIUH_D-d.js","/assets/image-off-DI3CN_TZ.js","/assets/index-B7RbwW6q.css","/assets/index-dFLJSn7W.js","/assets/key-round-ClCG_cX6.js","/assets/keyboard-DeopPEVh.js","/assets/languages-C0DmSAKc.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CiiIIR90.js","/assets/lightbulb-vR4cRgj9.js","/assets/link-2-Jh4fCmpK.js","/assets/link-2-off-CeduteST.js","/assets/list-filter-D82-pm6-.js","/assets/list-ordered-CR8tyTy8.js","/assets/list-tree-xnJf-yzA.js","/assets/lock-open-CEury5FT.js","/assets/log-in-CaH1aZ70.js","/assets/maximize-2-CvX6kQxw.js","/assets/message-square-CEQ4xr-N.js","/assets/minimize-2-CfSQinTV.js","/assets/package-check-DpmYgIKN.js","/assets/paperclip-Bc_vvvCF.js","/assets/pencil-Blcd1Bg7.js","/assets/percent-DG74sXtM.js","/assets/phone-DMfkvhfg.js","/assets/pin-Czz7tiNK.js","/assets/pin-off-DoosRqT6.js","/assets/play-B60MXw57.js","/assets/plug-zap-DUJZ37Jg.js","/assets/presentation-euGSHre9.js","/assets/prop-types-Bl9USj4E.js","/assets/radio-DFjZI9jV.js","/assets/react-apexcharts.esm-BcBCDw95.js","/assets/registers-DYEaYey4.js","/assets/repeat-DSGPsdwE.js","/assets/rotate-ccw-BTe0EnJW.js","/assets/rotate-cw-Djnj-d-O.js","/assets/save-CBBbbZI2.js","/assets/scopeLinks-Cc8MQZ_r.js","/assets/scroll-text-CTgi482a.js","/assets/search-x-CWwydo-C.js","/assets/segments-DpeOx0T_.js","/assets/send-Ohy5VN5I.js","/assets/settings-2-DkUNyVrm.js","/assets/shield-BUgn_hdf.js","/assets/shield-alert-CYIvt3xI.js","/assets/shield-check-B7vxKs_7.js","/assets/shield-question-mark-CSc3qDhf.js","/assets/snowflake-CI9sFxRk.js","/assets/split-MWHVMm4U.js","/assets/square-E6fZ0fSt.js","/assets/square-check-big-Dw1vToG8.js","/assets/star-LidNH-Ak.js","/assets/statusBands-BBIQBgMv.js","/assets/store-DipkPro5.js","/assets/table-2-Cs2TCvSS.js","/assets/table-properties-DU1gIEJi.js","/assets/tag-CuIFqkvt.js","/assets/tags-BEJB8bEQ.js","/assets/timer-off-DDeOvJeF.js","/assets/trending-down-CwM734vu.js","/assets/trending-up-CXJuqdyK.js","/assets/undo-2-ChD-vj5D.js","/assets/useChartTheme-B9o1b4N-.js","/assets/useElementWidth-B5m4WcK2.js","/assets/useIsMobile-BmvczR0Q.js","/assets/useOpenParam-Ce0IklrZ.js","/assets/useStatusBands-D8mBqC_A.js","/assets/useUrlScope-TFYuUpLI.js","/assets/user-DokMKOH-.js","/assets/user-cog-FMWK11WS.js","/assets/user-minus-BkR95ieC.js","/assets/users-CPxUdLlh.js","/assets/video-25tgbasb.js","/assets/wallet-BFHCYKaM.js","/assets/warehouse-BaVyB5eP.js","/assets/x-CZFg3MYt.js","/assets/zap-iETvkL3c.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
