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

const BUILD = "2026-10-13T16:10:41.872Z";
const PRECACHE = ["/","/assets/AdminPanel-S3cBGPCR.js","/assets/AnalysisBoard-u0_FAgmS.js","/assets/Arc-C-5rdmDz.js","/assets/Assistant-CTj8FGSU.js","/assets/BrigadirProfile-CPeHL1BP.js","/assets/BroadcastReceivers-UOKcR8LA.js","/assets/BroadcastRecord-ez91lnE7.js","/assets/Button-D5e8za4z.js","/assets/CatLockNotice-p6a46vGg.js","/assets/CategoryLegendModal-B2WtaWLS.js","/assets/CellConcerns-DZwrj29C.js","/assets/CellDetails-CmygP26g.js","/assets/CellFormModal-C1yEtOPJ.js","/assets/CellIdent-D18NPeL3.js","/assets/CellLink-CkogH3M4.js","/assets/Cells-CH4jCxXG.js","/assets/ColumnFilter-D_2VMxpR.js","/assets/ColumnsPicker-CL7_3ODi.js","/assets/CommentsModal-BUfBDAr0.js","/assets/ComparisonTable-BrveM7JK.js","/assets/Concerns-BeAW7iR4.js","/assets/CountStepper-BRef66Iw.js","/assets/Daily-maxCaf7M.js","/assets/DataTable-QDptJx1-.js","/assets/DateRangePicker-D5Ay2DWu.js","/assets/DayReportView-ZVNEaLpZ.js","/assets/DayStepper-BaTxaRKp.js","/assets/DifferenceBreakdown-Cw7Xp2_-.js","/assets/Downtime-C5m_AsKK.js","/assets/Education-CtbRRIPI.js","/assets/EducationLesson-Df3HqLVN.js","/assets/EmptyState-Dp2XzYJL.js","/assets/Exam-C-F9ek5w.js","/assets/FactorySelect-Ddbz0k3e.js","/assets/Gamification-C8Tf1yaS.js","/assets/GroupBadge-C4t15TBN.js","/assets/HeatmapChart-D-CHgGQs.js","/assets/IdleCell-BMHvnji3.js","/assets/KPICard-RX8_-K6J.js","/assets/Kaizen-Bpfm1mGu.js","/assets/Kelish-BZVtIid1.js","/assets/KpiDeltaCard-D6cMRX9E.js","/assets/LangTextInput-DBRwEppX.js","/assets/Layout-CqgopaFY.js","/assets/LeaderAppeal-DipoMLU9.js","/assets/LeaderDayReport-DyarLJh_.js","/assets/LeaderUnitReport-BjzAlncU.js","/assets/Leaderboard-Bvf-PlWN.js","/assets/Leaders-BHwF8xp5.js","/assets/Lightbox-CMDEJy0w.js","/assets/LiveOverview-2X0xhpjo.js","/assets/Login-BMH_J2fS.js","/assets/NotFound-BpFXZpek.js","/assets/Notifications-dlkttJzl.js","/assets/Overview-CNDbrFMa.js","/assets/Pagination-Drzn34K5.js","/assets/PerenaladkaFactTable-DPJiDCGa.js","/assets/PersonCard-ByA0lfW2.js","/assets/PlanFulfillment-B0Uh7Gpz.js","/assets/Production-ksUQ86cf.js","/assets/Profile-D1R50bzq.js","/assets/ProofCamera-CgnGZyY9.js","/assets/Quality-DFqqvTLk.js","/assets/RawRows-BuF7ggEZ.js","/assets/RequestStateChip-BLALKiOd.js","/assets/RichTextEditor-cAp3-tki.js","/assets/SaveState-DsJdP7yn.js","/assets/SearchInput-C3KTpZ0M.js","/assets/SeasonalityHeatmap-Zk9quz4e.js","/assets/SegmentedToggle-BClS6TeZ.js","/assets/SetupTimes-Rgpo9_ou.js","/assets/ShiftDaily-DZASC8ie.js","/assets/Staff-DEgvW82a.js","/assets/StaffListAtCheck-BX54_Ejn.js","/assets/StatusBadge-Taiu5cf2.js","/assets/TargetGoal-YMTBp9nw.js","/assets/Targets-DWuncuF3.js","/assets/Tasks-CsxyS7h7.js","/assets/TimeWheelPicker-DO3DpbKk.js","/assets/Toast-B4aSVitJ.js","/assets/Tooltip-Cxoc9HWy.js","/assets/TrendChart-BhX-oOAn.js","/assets/TripleSpeedometer-Cwh8wmvh.js","/assets/Trudoyomkost-DOESWJVv.js","/assets/Turnover-CWunhCOL.js","/assets/UploadDropzone-MKLc-Nh2.js","/assets/UsersActivity-DhXPS50S.js","/assets/VerdictBlock-BS5pTDxf.js","/assets/VfxApiMap-Bci6n9cp.js","/assets/VfxDictionaries-CoXY66LA.js","/assets/VfxEmployees-n-_1XsOV.js","/assets/VfxHrMoves-BS9tuxnH.js","/assets/VfxJobs-BsqAVeXS.js","/assets/VfxPhoto-CWbHegXQ.js","/assets/VfxShifts-BavpMV-P.js","/assets/VfxState-CGu5utwM.js","/assets/VfxTimebooks-KkdVZhA3.js","/assets/VfxTimesheet-DuP6v45W.js","/assets/WatchProgress-Dusrj4qr.js","/assets/WebLogin-CaLb4Gch.js","/assets/WorkerConcerns-Bhv6VNjg.js","/assets/Workers-BBN1Bz-s.js","/assets/Zagruzka-z_nK4Rxq.js","/assets/ZagruzkaCell-BGw-tC0E.js","/assets/api-D-hTxIuh.js","/assets/archive-pDHdaOWt.js","/assets/archive-restore-C0OrvFXQ.js","/assets/arrow-down-CCAJ6pLa.js","/assets/arrow-down-wide-narrow-DQjRGzc7.js","/assets/arrow-up-narrow-wide-CRdIQlOk.js","/assets/award-CerhSr4r.js","/assets/ban-D7nqyK7b.js","/assets/boxes-DhF74Sjk.js","/assets/braces-DaKfrME9.js","/assets/brigadirFilters-DQC7fbWp.js","/assets/broadcastTree-nnt2tcFl.js","/assets/building-2-CLwtbim6.js","/assets/calculator-C4pzglyp.js","/assets/calendar-DcUfJJ3O.js","/assets/calendar-days-BtSOAS2r.js","/assets/camera-GUdyvT8i.js","/assets/categories-DAS5sf-u.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DEuV04Iw.js","/assets/chart-line-D4xBPvWi.js","/assets/chart-pie-Cqvg4XYK.js","/assets/chartRange-CPLaTKLO.js","/assets/check-check-BWuf3_iY.js","/assets/chevron-left-Qn_GBPvL.js","/assets/chevrons-up-down-DNnmN_RQ.js","/assets/circle-BoZ4NQyO.js","/assets/circle-alert-DO6I2Zmu.js","/assets/circle-check-big-CKUbOHO_.js","/assets/circle-dashed-DSvcfTAz.js","/assets/circle-minus-J0Wh1M3s.js","/assets/circle-question-mark-Cw0p0dXY.js","/assets/circle-slash-hzzr1mb7.js","/assets/circle-user-round-CtQFIKlG.js","/assets/clock-3-Bg_YO2t5.js","/assets/cloud-off-Cyeki4mo.js","/assets/cloud-upload-2Xdda2Qz.js","/assets/compass-Cr55Lyyy.js","/assets/concernCategories-CA-wpnJi.js","/assets/copy-BW2RhrgR.js","/assets/corner-down-right-BJpaBEpm.js","/assets/createLucideIcon-FrDGJCO7.js","/assets/es-BJr9pML7.js","/assets/external-link-B9dLcIBn.js","/assets/file-clock-DNsULaEt.js","/assets/file-exclamation-point-CdeVeWL4.js","/assets/flag-vUcnZDeZ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CUQ7NaZZ.js","/assets/hash-BCeqfRtu.js","/assets/hourglass-BjjbaG4e.js","/assets/image-g4bdtslt.js","/assets/image-off-DfaCyiUL.js","/assets/inbox-Cw6ShgDG.js","/assets/index-7f1rnqtY.css","/assets/index-B2_qB6bf.js","/assets/keyboard-nZyn-cbk.js","/assets/languages-DCObsI_W.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-vVLIU8pd.js","/assets/lightbulb-BlOAOG0h.js","/assets/link-2-Bu9SCmCk.js","/assets/link-2-off-_DJqBdEw.js","/assets/list-ordered-Bm2HLy7_.js","/assets/list-tree-DDTae-qt.js","/assets/lock-open-C4UcLvu9.js","/assets/log-in-Bi74csk3.js","/assets/marks-DO4ZIA1i.js","/assets/minimize-2-Dm6Xnrte.js","/assets/package-check-CLgn4rME.js","/assets/pencil-DXEI-rGG.js","/assets/percent-CloaMuB8.js","/assets/pin-Ct-nWGpe.js","/assets/pin-off-DG2k_hpO.js","/assets/play-hpl457EV.js","/assets/plug-zap-DjrENLVH.js","/assets/prop-types-BREVFwgA.js","/assets/radio-BslY6TzU.js","/assets/react-apexcharts.esm-BLxtSeSN.js","/assets/registers-5DYi-Dpv.js","/assets/repeat-C867gGVX.js","/assets/save-BCJKcOwS.js","/assets/scopeLinks-CQfDIwyQ.js","/assets/scroll-text-DIq2-Gtf.js","/assets/search-x-B7Cb0L4e.js","/assets/segments-BLn1tZp4.js","/assets/send-Y287CfT5.js","/assets/settings-2-DeE_SYdN.js","/assets/shield-alert-D5z5kkG8.js","/assets/shield-m7ucn_EA.js","/assets/shield-question-mark-Ch_Cu4HR.js","/assets/siren-BgutzTRQ.js","/assets/snowflake-D0rJX4Kn.js","/assets/split-CPyGPjTZ.js","/assets/square-check-big-CbZRw5l6.js","/assets/star-EUUfz1Ka.js","/assets/statusBands-Cin3h5GK.js","/assets/store-DVDka4Yt.js","/assets/table-2-DKvzGBDY.js","/assets/table-properties-DKDS7dLt.js","/assets/tag-7gg14w2I.js","/assets/timer-off-DNIYOJjW.js","/assets/trending-down-BH3QWLOe.js","/assets/trending-up-Jucxxqqa.js","/assets/undo-2-Di4yWETL.js","/assets/useChartTheme-CTZjDak3.js","/assets/useElementWidth-Dn5I2aE8.js","/assets/useIsMobile-Ea0zKIKT.js","/assets/useOpenParam-BZ30cb06.js","/assets/useStatusBands-v2MUxuRZ.js","/assets/useUrlScope-Dq2eNV9d.js","/assets/user-O-CSiAgQ.js","/assets/user-cog-CSZm-VDw.js","/assets/users-s7rDSoLP.js","/assets/vfx-CzlZw-lY.js","/assets/video-CPI3fHn6.js","/assets/wallet-BkVhDxCA.js","/assets/warehouse-Xj4Dj1hL.js","/assets/workflow-BFWG90Yf.js","/assets/x-BFjlp8c8.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png"];
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
