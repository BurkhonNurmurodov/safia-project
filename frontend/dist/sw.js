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

const BUILD = "2026-10-16T06:36:22.633Z";
const PRECACHE = ["/","/assets/AdminPanel-DlRM3xvB.js","/assets/AnalysisBoard-Cvd1gyEY.js","/assets/Arc-CcchDPd9.js","/assets/Assistant-DGZuMUYC.js","/assets/BrigadirProfile-DKXMYu_p.js","/assets/BroadcastReceivers-DB8yDNLn.js","/assets/BroadcastRecord-DFzuq6DA.js","/assets/Button-jthnDuag.js","/assets/CatLockNotice-BCo0br_S.js","/assets/CategoryLegendModal-CE3Ise9B.js","/assets/CellConcerns-1MAQkGZM.js","/assets/CellDetails-gqjM2KAt.js","/assets/CellFormModal-DMuDVH-w.js","/assets/CellIdent-RbnbQqVT.js","/assets/CellLink-B-iHVF73.js","/assets/Cells-vK3eR96k.js","/assets/ColumnFilter-CM4glIIt.js","/assets/ColumnsPicker-DWmAevY0.js","/assets/CommentsModal-CklN0fbR.js","/assets/ComparisonTable-CvcwHBpQ.js","/assets/Concerns-D323fKux.js","/assets/CountStepper-tWXLw56f.js","/assets/Daily-Tu06qZ6H.js","/assets/DataTable-o45cbO0j.js","/assets/DateRangePicker-D1msHQey.js","/assets/DayReportView-DB66hGi9.js","/assets/DayStepper-Ct8xh85k.js","/assets/DifferenceBreakdown-B0FORX5V.js","/assets/Downtime-Ddi_kTGl.js","/assets/Education-DSFVt3E1.js","/assets/EducationLesson-CLSQfnhL.js","/assets/EmptyState-DRHnQtVC.js","/assets/Exam-CrancBXn.js","/assets/FactorySelect-DbC9EfMP.js","/assets/Gamification-MEs-1XQi.js","/assets/GroupBadge-CFBKCPjn.js","/assets/HeatmapChart-5DdT-PoL.js","/assets/IdleCell-pWruNcT7.js","/assets/KPICard-D4dMQi-4.js","/assets/Kaizen-Bk6o7SmA.js","/assets/Kelish-63DVa6ST.js","/assets/KpiDeltaCard-BI-ioFUU.js","/assets/LangTextInput-DmZKdI6E.js","/assets/Layout-Caf_kp3V.js","/assets/LeaderAppeal-BaCrGINZ.js","/assets/LeaderDayReport-BpOpKbAM.js","/assets/LeaderUnitReport-D9LVRNXA.js","/assets/Leaderboard-B2xy1Y4R.js","/assets/Leaders-4JUXo-t4.js","/assets/Lightbox-CNpVQeJq.js","/assets/LiveOverview-_cVOGm3q.js","/assets/Login-CN0HC7Mb.js","/assets/NotFound-BgfULhHf.js","/assets/Notifications-CqrfuGAl.js","/assets/Overview-G8nKeYOy.js","/assets/Pagination-QXqimNkl.js","/assets/PerenaladkaFactTable-DZmROyR3.js","/assets/PersonCard-DGSDmghw.js","/assets/PlanFulfillment-CJtv6kpw.js","/assets/Production-C4wTMhyl.js","/assets/Profile-6oj1-KJz.js","/assets/ProofCamera-BeEXM2Lt.js","/assets/Quality-BhX0sTIn.js","/assets/RawRows-WIeI7foW.js","/assets/RequestStateChip-FuNjG29B.js","/assets/RichTextEditor-CV6683eo.js","/assets/SaveState-Ctra5FGA.js","/assets/SearchInput-DxQlMYXk.js","/assets/SeasonalityHeatmap-Cs70T74e.js","/assets/SegmentedToggle-CPLHuFdK.js","/assets/SetupTimes-C71scSRy.js","/assets/ShiftDaily-CGAAiy4f.js","/assets/Staff-Bm9JRpfZ.js","/assets/StaffListAtCheck-BsUq9INA.js","/assets/StatusBadge-D7QUzkc_.js","/assets/TargetGoal-C7Q_HZRf.js","/assets/Targets-CWVX9byP.js","/assets/Tasks-De5Nq7xG.js","/assets/TimeWheelPicker-CB099D8u.js","/assets/Toast-Ddw21J5G.js","/assets/Tooltip-BayT-BbH.js","/assets/TrendChart-D-SLxdpU.js","/assets/TripleSpeedometer-BscZt8nS.js","/assets/Trudoyomkost-BglerPsj.js","/assets/Turnover-Bu0j9GRN.js","/assets/UploadDropzone-DB7ZT7Zy.js","/assets/UsersActivity-B6XIJAQB.js","/assets/VerdictBlock-BIjcVrLE.js","/assets/VfxApiMap-CT9dYnOu.js","/assets/VfxDictionaries-9eEtxmcL.js","/assets/VfxEmployees-Bfr92MLb.js","/assets/VfxHrMoves-DYX97rFR.js","/assets/VfxJobs-DzoNe_3Q.js","/assets/VfxPhoto-Cax0gCQU.js","/assets/VfxShifts-C5m2IORi.js","/assets/VfxState-DEDMjFcA.js","/assets/VfxTimebooks-4iSrb75k.js","/assets/VfxTimesheet--jComBsQ.js","/assets/WatchProgress-BhTccouT.js","/assets/WebLogin-1hm2Puf-.js","/assets/WorkerConcerns-x0xCcXNH.js","/assets/Workers-eCWuDopx.js","/assets/Zagruzka-D1u8QA8y.js","/assets/ZagruzkaCell-BN9CTiEX.js","/assets/api-Ch98MiMw.js","/assets/archive-CsHNR54v.js","/assets/archive-restore-B5I1qDsr.js","/assets/arrow-down-Da5Nbnxi.js","/assets/arrow-down-wide-narrow-BT22qyNf.js","/assets/arrow-up-narrow-wide-rloaqHRv.js","/assets/award-CkZUyYgn.js","/assets/ban-Cpt1m60H.js","/assets/boxes-15s7UnpO.js","/assets/braces-AestfpCt.js","/assets/brigadirFilters-DsKVRUXd.js","/assets/broadcastTree-Ch97KIyN.js","/assets/building-2-DaIRM8U2.js","/assets/calculator-ChWiLKYD.js","/assets/calendar-days-Bek_dks1.js","/assets/calendar-xnE_txtB.js","/assets/camera-DKU4jSbq.js","/assets/categories-C80QkLQL.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DdWecNMy.js","/assets/chart-line-BPatZf5V.js","/assets/chart-pie-DgZWEij-.js","/assets/chartRange-HM6ElWYR.js","/assets/check-check-zJ4hntVk.js","/assets/chevron-left-C2J9OWWJ.js","/assets/chevrons-up-down-CM0AUb1X.js","/assets/circle-BNBQkq64.js","/assets/circle-alert--L85GvoS.js","/assets/circle-check-big-kiKBvqo4.js","/assets/circle-dashed-DPUGVFTA.js","/assets/circle-minus-BeBlbcCe.js","/assets/circle-question-mark-hR4fkkjp.js","/assets/circle-slash-Bplk1OVV.js","/assets/circle-user-round-Bv2aTE8v.js","/assets/clock-3-C0gIaUqb.js","/assets/cloud-off-B4RNgT0q.js","/assets/cloud-upload-0icVeINi.js","/assets/compass-CUswOSMO.js","/assets/concernCategories-ZaosrlBP.js","/assets/copy-t4sNE97B.js","/assets/corner-down-right-DmPmqtk_.js","/assets/createLucideIcon-Cdc9ewoO.js","/assets/es-C_gdnV2j.js","/assets/external-link-CnY_hAvY.js","/assets/file-clock-BaHLmf2x.js","/assets/file-exclamation-point-DjGvh8nI.js","/assets/flag-DFnKJTDH.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BqJE5EeR.js","/assets/hash-D5gG-jNw.js","/assets/hourglass-B36idW6x.js","/assets/image-DmoQ2nvl.js","/assets/image-off-27aKN5st.js","/assets/inbox-CjYSbABO.js","/assets/index-BOOQKABl.js","/assets/index-CBKw4u90.css","/assets/keyboard-CeLncFGb.js","/assets/languages-x-lheHGd.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BYFbvJKq.js","/assets/lightbulb-Btz9fzNl.js","/assets/link-2-UUc_c2Ux.js","/assets/link-2-off-pq5PhdaU.js","/assets/list-ordered-BDbgNPUD.js","/assets/list-tree-DW9bHAXv.js","/assets/lock-open-CC4tR6Gv.js","/assets/log-in-DiH9SGC4.js","/assets/marks-DWE_R3L3.js","/assets/minimize-2-xL2NEmNj.js","/assets/package-check-uN9QvDJF.js","/assets/pencil-B7CQqaHs.js","/assets/percent-O7nrDO6T.js","/assets/pin-BsOPTORQ.js","/assets/pin-off-CDKLSoiF.js","/assets/play-DdFuyIRC.js","/assets/plug-zap-Tkh0IbjX.js","/assets/prop-types-CpHmAVOf.js","/assets/radio-CIE5qkWq.js","/assets/react-apexcharts.esm-BQVK4rwG.js","/assets/registers-CI7EKPf1.js","/assets/repeat-B9yUdPjF.js","/assets/save-CE8v-aAr.js","/assets/scopeLinks-BMTiFlwf.js","/assets/scroll-text-CNwD7-pB.js","/assets/search-x-BRMPDI5z.js","/assets/segments-BHpqx7aM.js","/assets/send-DAjpeqEV.js","/assets/settings-2-CGXOgLDF.js","/assets/shield-DRVD4e8P.js","/assets/shield-alert-DVpE_I56.js","/assets/shield-question-mark-CEheYB1n.js","/assets/siren-Bifz7CvG.js","/assets/snowflake-43e7hzvT.js","/assets/split-BMWOBXOO.js","/assets/square-check-big-Bv4K_VhZ.js","/assets/star-38UkxDN4.js","/assets/statusBands-D8UU3_ot.js","/assets/store-DnK53CW7.js","/assets/table-2-aORWkIV_.js","/assets/table-properties-Cxr4OyFR.js","/assets/tag-BkHR_4fS.js","/assets/timer-off-DT_5w2-E.js","/assets/trending-down-Cl-oxeat.js","/assets/trending-up-BOsEVM7L.js","/assets/undo-2-dG660KNW.js","/assets/useChartTheme-BWW0WTAI.js","/assets/useElementWidth-Cg7vyFtm.js","/assets/useIsMobile-GzHRGe5U.js","/assets/useOpenParam-BWOgAasq.js","/assets/useStatusBands-BrfQU8Rr.js","/assets/useUrlScope-BU3zH2ye.js","/assets/user-BZ95p68C.js","/assets/user-cog-CifpdB07.js","/assets/users-XkyIlS3o.js","/assets/vfx-CNVHs2hW.js","/assets/video-B6qWZZOt.js","/assets/wallet-7VAakuio.js","/assets/warehouse-CbkcriWA.js","/assets/workflow-DEspFERp.js","/assets/x-NgdPdkd0.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
