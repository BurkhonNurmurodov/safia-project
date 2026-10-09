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

const BUILD = "2026-10-09T10:04:16.754Z";
const PRECACHE = ["/","/assets/AdminPanel-DFMJRgJl.js","/assets/AnalysisBoard-Dosag7y1.js","/assets/Arc-5ZhfeL4n.js","/assets/Assistant-0LbWYWYA.js","/assets/BrigadirProfile-Bail5LrC.js","/assets/BroadcastReceivers-BZi0_xpY.js","/assets/BroadcastRecord-DWJLXqUV.js","/assets/Button-CE09SGqr.js","/assets/CatLockNotice-B-JUyvTF.js","/assets/CategoryLegendModal-mLODS2at.js","/assets/CellConcerns-B1jxNWhU.js","/assets/CellDetails-DlSJ-EZo.js","/assets/CellFormModal-i6aYh4a4.js","/assets/CellIdent-BrWWfGUu.js","/assets/CellLink-DXG6AUij.js","/assets/Cells-Juo0JwOL.js","/assets/ColumnFilter-Dzh4eO9l.js","/assets/ColumnsPicker-C1zzMtp2.js","/assets/CommentsModal-CbQNp9FS.js","/assets/ComparisonTable-D-lelfBa.js","/assets/Concerns-FWLWM2Qm.js","/assets/Daily-8Ypsbu3R.js","/assets/DataTable-XXKVSc59.js","/assets/DateRangePicker-C9JTl6DK.js","/assets/DayReportView-Dcw9ytcl.js","/assets/DayStepper-U6O7RyK4.js","/assets/DifferenceBreakdown-C6nEPM0O.js","/assets/Downtime-Drq4Jmy9.js","/assets/Education-lti1owu_.js","/assets/EducationLesson-f7Wv8wj_.js","/assets/EmptyState-qu3TNk44.js","/assets/Exam-QIiTh1F9.js","/assets/FactorySelect-C-H1XJSi.js","/assets/Gamification-1wYZiDoX.js","/assets/GroupBadge-B7FJt7j4.js","/assets/HeatmapChart-CQOix-XO.js","/assets/IdleCell-CpWPT_pn.js","/assets/KPICard-nfEn-4xi.js","/assets/Kaizen-bnqKQqTt.js","/assets/Kelish-AOx0xEPR.js","/assets/KpiDeltaCard-C7uQ67vu.js","/assets/LangTextInput-k_2gck0n.js","/assets/Layout-C-XFnVWj.js","/assets/LeaderAppeal-DzTr47lc.js","/assets/LeaderDayReport-RzXj2YbR.js","/assets/LeaderUnitReport-D3K8mRHq.js","/assets/Leaderboard-a9w8uLt8.js","/assets/Leaders-CvL75jlX.js","/assets/Lightbox-vHZghVa1.js","/assets/LiveOverview-CSPg6TBL.js","/assets/Login-1zgM1oJH.js","/assets/NotFound-DflwBd6P.js","/assets/Notifications-BVIqVfTg.js","/assets/Overview-BT22qlih.js","/assets/Pagination-BrjrkPVz.js","/assets/PerenaladkaFactTable-CzWpPKvF.js","/assets/PersonCard-oU8cxxVe.js","/assets/PlanFulfillment-D9wEgBMc.js","/assets/Production-1Y5HMxFv.js","/assets/Profile-C29H-0qM.js","/assets/ProofCamera-BTWL5fuI.js","/assets/ProofPhoto-wazwW52q.js","/assets/Quality-DZmpMRqU.js","/assets/RawRows-s59cCOy_.js","/assets/RequestStateChip--q4kWYyp.js","/assets/RichTextEditor-BSJdKuEf.js","/assets/SaveState-AJSX6F2N.js","/assets/SearchInput-CD5bRBR2.js","/assets/SeasonalityHeatmap-CPpG4NKL.js","/assets/SegmentedToggle-DBTUgneC.js","/assets/SetupTimes-C2a4F_m-.js","/assets/ShiftDaily-BBfKP00k.js","/assets/Staff-CvOnt2g3.js","/assets/StatusBadge-Cyf_XDKS.js","/assets/TargetGoal-Cm0qpUX3.js","/assets/Targets-BNTiE4ac.js","/assets/Tasks-DEIEaYjB.js","/assets/TimeWheelPicker-B7dRpfo7.js","/assets/Toast-DkX8M-ZX.js","/assets/Tooltip-CrcYimvy.js","/assets/TrendChart-B61srxjD.js","/assets/TripleSpeedometer-BiYhtfHH.js","/assets/Trudoyomkost-C0pP7tDg.js","/assets/Turnover-CXRpK_QE.js","/assets/UploadDropzone-CD_0znZn.js","/assets/UsersActivity-pUHEspzI.js","/assets/VerdictBlock-DVgyAbrI.js","/assets/VfxApiMap-BMcEZwW5.js","/assets/VfxDictionaries-C1jnNbm7.js","/assets/VfxEmployees-B326Zqxv.js","/assets/VfxHrMoves-BAvgTlUa.js","/assets/VfxJobs-DtT50HGC.js","/assets/VfxPhoto-EoG460_P.js","/assets/VfxShifts-CbDwEOVU.js","/assets/VfxState-DsPcGkgP.js","/assets/VfxTimebooks-mLSPr2if.js","/assets/VfxTimesheet-Dgz6JUE7.js","/assets/WatchProgress-BHP6_2Nq.js","/assets/WebLogin-qbCxmyc7.js","/assets/WorkerConcerns-C4JeyYnQ.js","/assets/Workers-BNNPaLgC.js","/assets/Zagruzka-D2L_jYrk.js","/assets/ZagruzkaCell-DebnZEWT.js","/assets/api-D6t79bLl.js","/assets/archive-Tm0Cx81s.js","/assets/archive-restore-DG_AEziD.js","/assets/arrow-down-DL_eV72_.js","/assets/arrow-down-wide-narrow-DvPUrUUw.js","/assets/arrow-up-narrow-wide-DKbgk7kS.js","/assets/award-tjo3lAHl.js","/assets/ban-CouYF58m.js","/assets/boxes-CAYiAlyj.js","/assets/braces-DSKCooX2.js","/assets/brigadirFilters-276QJz8E.js","/assets/broadcastTree-j34VSQMp.js","/assets/building-2-9rPDuS2b.js","/assets/calculator-BqcIPKp7.js","/assets/calendar-DvPI486F.js","/assets/calendar-days-CaWsahyJ.js","/assets/camera-f9NzICKr.js","/assets/categories-CyOosXbj.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CJPm768S.js","/assets/chart-line-rPxPAd7r.js","/assets/chart-pie-NK98nyiQ.js","/assets/chartRange-goJtlkT-.js","/assets/check-check-Cw2YlNlv.js","/assets/chevron-left-C_BI191Y.js","/assets/chevrons-up-down-Db0zUMLA.js","/assets/circle-alert-BwJ1AKl0.js","/assets/circle-check-big-vszsJ80Q.js","/assets/circle-dashed-BSAFVGfO.js","/assets/circle-fkcBWaVp.js","/assets/circle-minus-tabtG2h4.js","/assets/circle-question-mark-DeRzKVe1.js","/assets/circle-slash-dCRf0aqf.js","/assets/circle-user-round-CkjC9ino.js","/assets/clock-3-BA08bmVw.js","/assets/cloud-off-BgNnbBWw.js","/assets/cloud-upload-CMuhbz9b.js","/assets/compass-C-J8WHa7.js","/assets/concernCategories-CEJhGHeK.js","/assets/copy-DomCl57M.js","/assets/corner-down-right-DF55xmw0.js","/assets/createLucideIcon-BzG5SLjb.js","/assets/es-LDerFAom.js","/assets/external-link-CCR8Ejxf.js","/assets/file-clock-CaPH4Fsg.js","/assets/file-exclamation-point-DkwHa48A.js","/assets/flag-DReR3ipH.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-jrVjKHLL.js","/assets/hash-DlKOHXEx.js","/assets/hourglass-CyIZVpug.js","/assets/image-D6jj4rv6.js","/assets/image-off-O47MRZVa.js","/assets/inbox-C5Nh8mxU.js","/assets/index-DD8ZJtYw.css","/assets/index-DJYAck5W.js","/assets/keyboard-DABMP679.js","/assets/languages-C7ISMxAW.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CeqBvuxH.js","/assets/lightbulb-C1G-YT-O.js","/assets/link-2-off-C-3LqiFU.js","/assets/link-2-tyi4Ni35.js","/assets/list-ordered-DAuWGwwO.js","/assets/list-tree-BM6gbQqf.js","/assets/lock-open-D2TmM7n7.js","/assets/log-in-W13NknyR.js","/assets/minimize-2-MKh_iI-O.js","/assets/package-check-DhUTDV_t.js","/assets/pencil-BqeaqgM8.js","/assets/percent-Cz9mdjlu.js","/assets/pin-DwyCzDei.js","/assets/pin-off-CKnF8PAt.js","/assets/play-oLw06Ss1.js","/assets/plug-zap-D6jDBrpx.js","/assets/prop-types-ChHYaCAp.js","/assets/radio-Bkeq_xQw.js","/assets/react-apexcharts.esm-CTj7eLCb.js","/assets/registers-Bd3IJnUO.js","/assets/repeat-Ddlxs04L.js","/assets/save-D84ijcs6.js","/assets/scopeLinks-C74N56Mu.js","/assets/scroll-text-CjEcue6x.js","/assets/search-x-UWMIXisg.js","/assets/segments-B0PhPIUL.js","/assets/send-DhoZ8mMx.js","/assets/settings-2-DPJO-1-H.js","/assets/shield-C6HJnvnd.js","/assets/shield-alert-BZwPpqOm.js","/assets/shield-question-mark-DvhwwvQQ.js","/assets/siren-caSpqbxF.js","/assets/snowflake-D6tReWn4.js","/assets/split-CCkwzFd5.js","/assets/square-check-big-DeUAvCoe.js","/assets/star-DCfGkVge.js","/assets/statusBands-BXzYrw1J.js","/assets/store-C6dBxlH_.js","/assets/table-2-wXpKqCo0.js","/assets/table-properties-CdGDUwZr.js","/assets/tag-YGdNC8nE.js","/assets/timer-off-f1XIkQFC.js","/assets/trending-down-bk2pb4TD.js","/assets/trending-up-CxpXzRlR.js","/assets/undo-2-DF9zfnE4.js","/assets/useChartTheme-BNHbcTgG.js","/assets/useElementWidth-B2f_ARX9.js","/assets/useIsMobile-nf7U_Cl4.js","/assets/useOpenParam-DsayyDbl.js","/assets/useStatusBands-DFwhMk7O.js","/assets/useUrlScope-Dekbg318.js","/assets/user-BQriodsi.js","/assets/user-cog-Brm4W-t-.js","/assets/users-cxDKDqwa.js","/assets/vfx-DfPxqSj0.js","/assets/video-CvDiJFUH.js","/assets/wallet-CcHTy-Nq.js","/assets/warehouse-ya6YqFxa.js","/assets/x-DVTPr8Wk.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
