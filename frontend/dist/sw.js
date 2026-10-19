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

const BUILD = "2026-10-19T05:35:59.778Z";
const PRECACHE = ["/","/assets/AdminPanel-D0akhAvD.js","/assets/AnalysisBoard-BRFjtFUs.js","/assets/Arc-CkwUcFJM.js","/assets/Assistant-rzklzeYE.js","/assets/BrigadirProfile-CPfAmX1M.js","/assets/BroadcastReceivers-nArcvIME.js","/assets/BroadcastRecord-0AhPgzPf.js","/assets/Button-DWRooeHJ.js","/assets/CatLockNotice-C6fSrGhg.js","/assets/CategoryLegendModal-DFw5HDni.js","/assets/CellConcerns-C88O1ru5.js","/assets/CellDetails-oS1SBOmF.js","/assets/CellFormModal-Dzwk6D2Y.js","/assets/CellIdent-B_phUxIu.js","/assets/CellLink-DUYJOpDk.js","/assets/Cells-DIeIlb8H.js","/assets/ColumnFilter-BzW7KcJp.js","/assets/ColumnsPicker-Dz0enJNn.js","/assets/CommentsModal-ulCOquwy.js","/assets/ComparisonTable-BzDvyOZC.js","/assets/Concerns-Cdw9IyyZ.js","/assets/CountStepper-BrwCE5ir.js","/assets/Daily-lBSavALv.js","/assets/DataTable-B-qpPcZy.js","/assets/DateRangePicker-BVO1PnPm.js","/assets/DayReportView-d2902KsP.js","/assets/DayStepper-B36zSKEg.js","/assets/DifferenceBreakdown-Bh7VUOzY.js","/assets/Downtime-DVsJSCqO.js","/assets/Education-B-uuf-Ff.js","/assets/EducationLesson-DpqqXJIb.js","/assets/EmptyState-CYxSJrET.js","/assets/Exam-rQgLifTg.js","/assets/FactorySelect-MyjCFxQH.js","/assets/ForeignObjects-C1f5NoLh.js","/assets/Gamification-D3iCC3JD.js","/assets/GroupBadge-B1OukeCQ.js","/assets/HeatmapChart-Xi_432rt.js","/assets/IdleCell-2-J7n3_7.js","/assets/KPICard-B8zT5MT6.js","/assets/Kaizen-CgAn_m-J.js","/assets/Kelish-CTht8bq9.js","/assets/KpiDeltaCard-DlTDu6JA.js","/assets/LangTextInput-Y6QQktDf.js","/assets/Layout-Dlmy8ZVT.js","/assets/LeaderAppeal-zyoc9GhZ.js","/assets/LeaderDayReport-CLomqsFj.js","/assets/LeaderUnitReport-C0SBsK2o.js","/assets/Leaderboard-BgggqK0S.js","/assets/Leaders-CwGxjIVB.js","/assets/Lightbox-BZraFn3z.js","/assets/LiveOverview-DADRQ_-K.js","/assets/Login-B7uYsLvn.js","/assets/NotFound-zZtsfn1_.js","/assets/Notifications-BE2o6wNg.js","/assets/Overview-BdW3XqgE.js","/assets/Pagination-4uBem4Vs.js","/assets/PerenaladkaFactTable-nTG7rI40.js","/assets/PersonCard-BFLj9m4D.js","/assets/PlanFulfillment-CbVgOiY-.js","/assets/Production-t0kSOWQr.js","/assets/Profile-DMSYORMU.js","/assets/ProofCamera-CAUC1xyD.js","/assets/ProofPhoto-BZwedK9T.js","/assets/Quality-DG2Zrm89.js","/assets/RawRows-_sF6yqiQ.js","/assets/RequestStateChip-B_Vu53iq.js","/assets/RichTextEditor-Bg2dpDL_.js","/assets/SaveState-BRpsJV6u.js","/assets/SearchInput-D32tKb9I.js","/assets/SeasonalityHeatmap-D41o9dSA.js","/assets/SegmentedToggle-d62_8Mil.js","/assets/SetupTimes-scSVui-W.js","/assets/ShiftDaily-Bd5atbL2.js","/assets/Staff-Cl-mKm7z.js","/assets/StaffListAtCheck-DAYp93ym.js","/assets/StatusBadge-n7bjoII4.js","/assets/TargetGoal-CUHGmQWx.js","/assets/Targets-hbYQOuwt.js","/assets/Tasks-xwYymqIy.js","/assets/TimeWheelPicker-DTKVTF6v.js","/assets/Toast-SERqu5fC.js","/assets/Tooltip-CeQ5MQl4.js","/assets/TrendChart-B3_MIwCq.js","/assets/TripleSpeedometer-3sHrGpGn.js","/assets/Trudoyomkost-CKoQsiJ0.js","/assets/Turnover-CYjACiMv.js","/assets/TurnoverBits-CBsHNUjF.js","/assets/UploadDropzone-DDYjBCJ8.js","/assets/UsersActivity-DISrS6Em.js","/assets/VerdictBlock-Bn97avQd.js","/assets/VfxApiMap-CzpQm_nE.js","/assets/VfxDictionaries-B9kQFoxH.js","/assets/VfxEmployees-Bc4Q-ymt.js","/assets/VfxHrMoves-BLQy4g5y.js","/assets/VfxJobs-Fou5EXwi.js","/assets/VfxPhoto-BVMuXcuw.js","/assets/VfxShifts-D33QL_UA.js","/assets/VfxState-1rKkfom5.js","/assets/VfxTimebooks-B4DCWmbN.js","/assets/VfxTimesheet-DG2QgdZ1.js","/assets/WatchProgress-CMcPSt7X.js","/assets/WebLogin-CZDqDBTr.js","/assets/WorkerConcerns-DLGIMivD.js","/assets/Workers-BZLxgoTE.js","/assets/Zagruzka-7B_OXz0d.js","/assets/ZagruzkaCell-xIeLlj71.js","/assets/api-C6fWCS2x.js","/assets/archive-DP_LlzdJ.js","/assets/archive-restore-h1d3Cqi2.js","/assets/arrow-down-iJvj2vzR.js","/assets/arrow-down-wide-narrow-DMZCcNeF.js","/assets/arrow-up-narrow-wide-DXDRBUXb.js","/assets/award-DAi0Js_q.js","/assets/ban-CQ8kArw8.js","/assets/boxes-OaWW6y_I.js","/assets/braces-5gUW2_K3.js","/assets/brigadirFilters-CZBDHeR5.js","/assets/broadcastTree-BGV5UtjF.js","/assets/building-2-r_hB0IHm.js","/assets/calculator-D4keDqHh.js","/assets/calendar-BkARbr-_.js","/assets/calendar-days-Br0ff8nR.js","/assets/camera-AnSTSOYL.js","/assets/categories-DIcGpIAg.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BSR1ezBy.js","/assets/chart-line-CkD5UjKD.js","/assets/chart-pie-CQ_qEI9z.js","/assets/chartRange-ChR0s710.js","/assets/check-check-CM18rf0a.js","/assets/chevron-left-DNdLPt-i.js","/assets/chevrons-up-down-BEbTVUlU.js","/assets/circle-CiMPsUVr.js","/assets/circle-alert-BdNiq_Bx.js","/assets/circle-check-big-DrEkpgHz.js","/assets/circle-dashed-BownxKDf.js","/assets/circle-minus-MkotLJg0.js","/assets/circle-question-mark-D_B6Dvva.js","/assets/circle-slash-Ke2HSl78.js","/assets/circle-user-round-C8J2Kal2.js","/assets/cloud-off-mv0aTOD5.js","/assets/cloud-upload-B0n6M-xE.js","/assets/compass-1TBuZFK6.js","/assets/concernCategories-CiJWYebW.js","/assets/corner-down-right-Dve4TwAa.js","/assets/createLucideIcon-56pO_EsG.js","/assets/es-CA0RuptG.js","/assets/external-link-BpB07_bV.js","/assets/file-clock-Bdj7sDUL.js","/assets/file-exclamation-point-Orn7UpKB.js","/assets/flag-D8cOZxJ9.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CNV9Fkki.js","/assets/hash-BGB4I3FI.js","/assets/hourglass-CZeswjDN.js","/assets/image-XqoZUeD6.js","/assets/image-off-DF5IKFA4.js","/assets/inbox-Uuv8QSFi.js","/assets/index-BEUeTf0h.js","/assets/index-ByhNoNK_.css","/assets/keyboard-BKGeQuqZ.js","/assets/languages-ByxptWMU.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DWCtwyJm.js","/assets/lightbulb-2C5MIf8v.js","/assets/link-2-off-CwZWDtdD.js","/assets/link-2-q4DKX5-C.js","/assets/list-ordered-Ci3tfa2D.js","/assets/list-tree-BN1D_fJe.js","/assets/lock-open-QaFtO6iD.js","/assets/log-in-BOxOcii_.js","/assets/marks-DbrKCWyM.js","/assets/minimize-2-BzV4DBoy.js","/assets/package-check-DhQz0T49.js","/assets/pencil-CFCZoK8n.js","/assets/percent-soV6fapu.js","/assets/pin-ChWdHpha.js","/assets/pin-off-CyDWBcgU.js","/assets/play-h6BvvsXP.js","/assets/plug-zap-CjNnZVoC.js","/assets/prop-types-B_cHrPKN.js","/assets/radio-DBCZRwJl.js","/assets/react-apexcharts.esm-CLf2PAxU.js","/assets/registers-DQMqPuv1.js","/assets/repeat-ILkcR28A.js","/assets/save-DGqRnSLc.js","/assets/scopeLinks-Dw5Eapk7.js","/assets/scroll-text-By5GwECG.js","/assets/search-x-cE7bSqFS.js","/assets/segments-DIcZ8MFG.js","/assets/send-C_XsilgN.js","/assets/settings-2-BbYQQ5b7.js","/assets/shield-3Y8CtQny.js","/assets/shield-alert-pDrvrX41.js","/assets/shield-question-mark-B_qy9Aqd.js","/assets/siren-BSL_3rcd.js","/assets/snowflake-W4Avm9ME.js","/assets/split-CGQNO0t6.js","/assets/square-check-big-BwgyGlXL.js","/assets/star-7hr91agn.js","/assets/statusBands-BE3oMoWH.js","/assets/store-Boo9ou5V.js","/assets/table-2-DLfQoIEr.js","/assets/table-properties-BxkIce0B.js","/assets/tag-SG6YN722.js","/assets/timer-off-C5-Netu2.js","/assets/trending-down-DwDwV_vz.js","/assets/trending-up-oDbX5Wqt.js","/assets/undo-2-uswvaBXN.js","/assets/useChartTheme-B7SAYU0B.js","/assets/useElementWidth-Bl19CL92.js","/assets/useIsMobile-NjhAM1h9.js","/assets/useOpenParam-NPCXf-90.js","/assets/useStatusBands-_TQVE2kq.js","/assets/useUrlScope-BFt3Y5qi.js","/assets/user-DMxTTdvN.js","/assets/user-cog-Boa5hD4V.js","/assets/users-BkibGLlM.js","/assets/vfx-D8D5Qnvg.js","/assets/video-ffQKRKpy.js","/assets/wallet-CCdlY84r.js","/assets/warehouse-DMWTAvV-.js","/assets/workflow-DMrTxhMV.js","/assets/x-BrkuLcAd.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
