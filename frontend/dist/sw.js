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

const BUILD = "2026-10-05T11:20:19.844Z";
const PRECACHE = ["/","/assets/AdminPanel-BcFmr11H.js","/assets/AnalysisBoard-DGlsl9mP.js","/assets/Arc-CTnccOl7.js","/assets/BrigadirProfile-C7jUER--.js","/assets/BroadcastReceivers-BON-MTmz.js","/assets/BroadcastRecord-CdmPvLDh.js","/assets/Button-DjOOkGOo.js","/assets/CatLockNotice-DZb5P3ob.js","/assets/CategoryLegendModal-PVeqvBCp.js","/assets/CellConcerns-Bhbz8n3G.js","/assets/CellDetails-wp9rJ8N8.js","/assets/CellFormModal-BjWCYb_1.js","/assets/CellIdent-C1e-kf0F.js","/assets/CellLink-MWiJlmzg.js","/assets/Cells-BFHpI8Fj.js","/assets/ColumnFilter-C0Rz2Nxf.js","/assets/ColumnsPicker-B6HItFXH.js","/assets/CommentsModal-Ck6qsMLO.js","/assets/ComparisonTable-BM80hX9B.js","/assets/Concerns-B_tILKG-.js","/assets/Daily-CqQG1lBY.js","/assets/DataTable-BFJgJhOk.js","/assets/DateRangePicker-C3F2Ey5W.js","/assets/DayReportView-CPgwEXsh.js","/assets/DayStepper-DzBXYp5_.js","/assets/DifferenceBreakdown-Bcz6H9_H.js","/assets/Downtime-BcGTVysq.js","/assets/Education-Cc6LJ-iZ.js","/assets/EducationLesson-Do8WpVPs.js","/assets/EmptyState-Vmv1oVgJ.js","/assets/Exam-CSoRfuZ_.js","/assets/FactorySelect-CYBXNRGl.js","/assets/Gamification-Cza0EqqD.js","/assets/GroupBadge-Drz0Wxv0.js","/assets/HeatmapChart-D5sGUDAa.js","/assets/IdleCell-D-i7i78L.js","/assets/KPICard-CXV5JU40.js","/assets/Kaizen-DeaWjRr3.js","/assets/Kelish-CRfX_w9Z.js","/assets/KpiDeltaCard-Bks50sCz.js","/assets/LangTextInput-CLFfSqHC.js","/assets/Layout-YI0B_6rs.js","/assets/LeaderAppeal-C5gUT-ni.js","/assets/LeaderDayReport-BTBvXdH3.js","/assets/LeaderUnitReport-BFTuNr1P.js","/assets/Leaderboard-Bb7T_8WA.js","/assets/Leaders-DoxogdRI.js","/assets/Lightbox-J8ADhKn1.js","/assets/LiveOverview-YfLEawEY.js","/assets/Login-Bvh3L3tU.js","/assets/NotFound-C4mY40jP.js","/assets/Notifications-Bzh0QaZ6.js","/assets/Overview-pxsZR-C0.js","/assets/Pagination-DCsVstJY.js","/assets/PerenaladkaFactTable-BO3Wv2eG.js","/assets/PersonCard-DJmmFFQV.js","/assets/PlanFulfillment-DGlYRAfx.js","/assets/Production-DUA6VW4Q.js","/assets/Profile-BN_6Iav0.js","/assets/ProofCamera-BheMeIHu.js","/assets/ProofPhoto-IApRnNs9.js","/assets/Quality-s6kpUC6K.js","/assets/RawRows-Cf13pKn1.js","/assets/RequestStateChip-BrTxIIqP.js","/assets/RichTextEditor-Bh01Ppvr.js","/assets/SaveState-BrTO7Mqz.js","/assets/SearchInput-Bv1UJSjA.js","/assets/SeasonalityHeatmap-CUcpUjt1.js","/assets/SegmentedToggle-CteOBuoH.js","/assets/SetupTimes-Bf1dOGjX.js","/assets/ShiftDaily-Dt3KuCZC.js","/assets/Staff-DlOHPuAS.js","/assets/StaffLive-D1qUdras.js","/assets/StatusBadge-BC1QpUuJ.js","/assets/TargetGoal-B6nG2g0j.js","/assets/Targets-DH8F1nCA.js","/assets/Tasks-DTfEnlMl.js","/assets/TimeWheelPicker-40JmLySA.js","/assets/Toast-D0SZGVMM.js","/assets/Tooltip-Bscoy1Hm.js","/assets/TrendChart-CXHmK8sn.js","/assets/TripleSpeedometer-BjA7wGWx.js","/assets/Trudoyomkost-Ct37MZNO.js","/assets/Turnover-CQPvuysP.js","/assets/UploadDropzone-D8yoGS0M.js","/assets/UsersActivity-CF2GnUcV.js","/assets/VerdictBlock-DENT0j18.js","/assets/VfxApiMap-D__se1N-.js","/assets/VfxDictionaries-TVYyNrAb.js","/assets/VfxEmployees-0MKCTAi3.js","/assets/VfxHrMoves-CeRIC7Ba.js","/assets/VfxJobs-DjNozqY0.js","/assets/VfxPhoto-Bd6GgekZ.js","/assets/VfxShifts-DcYRsm8z.js","/assets/VfxState-CuuJhkLu.js","/assets/VfxTimebooks-BEGXuUWv.js","/assets/VfxTimesheet-DYwiJHck.js","/assets/WatchProgress-SuImE9gf.js","/assets/WebLogin-DdkHHaOZ.js","/assets/WorkerConcerns-edUttvcW.js","/assets/Workers-CFXd4ovc.js","/assets/Zagruzka-26Eyqe5Q.js","/assets/ZagruzkaCell-DShy0OYD.js","/assets/api-Bg2FitbU.js","/assets/archive-CptRnoSG.js","/assets/archive-restore-CCAPwzOU.js","/assets/arrow-down-CE1AU0zH.js","/assets/arrow-left-CXZH5fjd.js","/assets/arrow-up-CoyJFS2Y.js","/assets/arrow-up-narrow-wide-Ql88tOGt.js","/assets/arrow-up-right-D_XF8Rq9.js","/assets/award-C0PPPjfm.js","/assets/ban-C8ZGEgx_.js","/assets/book-open-CGLLqPTX.js","/assets/boxes-D1ohp8rj.js","/assets/braces-o2To-ObH.js","/assets/brigadirFilters-CzdL2bnm.js","/assets/broadcastTree-C3BlbXDR.js","/assets/building-2-CS7BjioV.js","/assets/calculator-Bm55irdY.js","/assets/calendar-B_ZkOKMZ.js","/assets/calendar-days-D8vlQgxh.js","/assets/camera-Vy7B4tKD.js","/assets/categories-CUUVq41A.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CB_NnY5p.js","/assets/chart-line-CEPbo43l.js","/assets/chart-pie-BCRueJ5P.js","/assets/chartRange-__uuzS5t.js","/assets/check-check-C_rjHLuX.js","/assets/chevron-left-B0MEb_rV.js","/assets/chevrons-up-down-sj8XymyV.js","/assets/circle-BJAYHtaI.js","/assets/circle-alert-BFBOXSAi.js","/assets/circle-check-big-BJ_PI91I.js","/assets/circle-dashed-Bswa-2E9.js","/assets/circle-minus-B7obLGfy.js","/assets/circle-question-mark-Bf8ungZi.js","/assets/circle-slash-Dcbs3Z1z.js","/assets/circle-user-round-Da0oh1kf.js","/assets/clock-3-CPuDYXwC.js","/assets/cloud-off-CEkj0Is1.js","/assets/cloud-upload-BjkN-zZ8.js","/assets/compass-BqaMqUNO.js","/assets/concernCategories-Cls7DAEN.js","/assets/copy-BZt7tOcB.js","/assets/corner-down-right-BZMyGEN_.js","/assets/createLucideIcon-BZQxsfTS.js","/assets/es-Bw2tZcqR.js","/assets/exportXlsx-B57HIyeu.js","/assets/external-link-CFBBtHss.js","/assets/file-clock-BaGBlUQl.js","/assets/file-exclamation-point-WtX2did3.js","/assets/file-spreadsheet-GKIJrXOZ.js","/assets/file-text-iM3llt9C.js","/assets/flag-CiPM-mei.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-x-o4WFe6.js","/assets/hash-D80t4ric.js","/assets/history-CxPCEyH5.js","/assets/hourglass-D1UdUzue.js","/assets/image-BoUaPBaT.js","/assets/image-off-ei-dYejY.js","/assets/inbox-BIN09XNw.js","/assets/index-BarTLmz_.css","/assets/index-C4-V8jUn.js","/assets/key-round-CVIcX3SP.js","/assets/keyboard-DjtJmgVp.js","/assets/languages-CcIDhPy_.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BU2YgUNE.js","/assets/lightbulb-ClleOjeD.js","/assets/link-2-Bt-A_IGP.js","/assets/link-2-off-BvyptcYg.js","/assets/list-ordered-CvJBZnIN.js","/assets/list-tree-H2vNWAXd.js","/assets/lock-open-DMDU1chG.js","/assets/log-in-Dy7NOPgd.js","/assets/maximize-2-BSKdGGlO.js","/assets/message-square-dibudal2.js","/assets/minimize-2-Cw1wwEK1.js","/assets/package-check-CQr4Rv1h.js","/assets/paperclip-C7aH9GrM.js","/assets/pencil-E9eTvqik.js","/assets/percent-GEpMtAGk.js","/assets/pin-Cz6wLoGP.js","/assets/pin-off-B_Hj-J2_.js","/assets/play-dseL5QKC.js","/assets/plug-zap-CUz2_C5j.js","/assets/presentation-dp0yJyzY.js","/assets/prop-types-B9kSPXxI.js","/assets/radio-D6d34iKo.js","/assets/react-apexcharts.esm-vM1_4-lN.js","/assets/registers-BnmqS3fn.js","/assets/repeat-CL8wPL6j.js","/assets/rotate-ccw-U34BCl_n.js","/assets/rotate-cw-DuWcVieZ.js","/assets/save-D_EE-N0i.js","/assets/scopeLinks-Uv11JAS1.js","/assets/scroll-text-DVUPbv-b.js","/assets/search-x-D6sUoce-.js","/assets/segments-DWq9m_Gq.js","/assets/send-DFnmlc70.js","/assets/settings-2-DNmuQ729.js","/assets/shield-5WutNVAd.js","/assets/shield-alert-NSGpu5lB.js","/assets/shield-check-DOLYoPwy.js","/assets/shield-question-mark-D2MG74rj.js","/assets/siren-BFWyis9z.js","/assets/snowflake-DFOdKDHJ.js","/assets/split-CF_4ucUx.js","/assets/square-Dry--DyB.js","/assets/square-check-big-CnmhCluX.js","/assets/star-CbHKu1CX.js","/assets/statusBands-DMALmKtF.js","/assets/store-DkIMMEkh.js","/assets/table-2-BUFV-nV8.js","/assets/table-properties-S6qMYNZK.js","/assets/tag-Dndi60nw.js","/assets/timer-off-yQr60MXC.js","/assets/trending-down-BCaGDTa8.js","/assets/trending-up-B6hB2Fe0.js","/assets/undo-2-eVVd3P5C.js","/assets/useChartTheme-DSDy_Hrc.js","/assets/useElementWidth-DAQO8nbA.js","/assets/useIsMobile-C-GqC-sd.js","/assets/useOpenParam-BYD2zxD4.js","/assets/useStatusBands-DZfuaH9k.js","/assets/useUrlScope-D85_Mp8h.js","/assets/user-B1S6Rj8j.js","/assets/user-cog-BxczGObt.js","/assets/users-PYhJ7FZ_.js","/assets/vfx-CWESuA1o.js","/assets/video-CQQU20XW.js","/assets/wallet-nviYgo9T.js","/assets/warehouse-Di5xPLOA.js","/assets/x-DzzlL2gX.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
