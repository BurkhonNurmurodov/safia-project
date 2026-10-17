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

const BUILD = "2026-10-17T12:50:36.602Z";
const PRECACHE = ["/","/assets/AdminPanel-BF2CTYAG.js","/assets/AnalysisBoard-DlfuVXIZ.js","/assets/Arc-BsG_5a6w.js","/assets/Assistant-BZ0__NKd.js","/assets/BrigadirProfile-DpYig3JN.js","/assets/BroadcastReceivers-D8vBp3O0.js","/assets/BroadcastRecord-BjVkvCt8.js","/assets/Button-DXaqbHx4.js","/assets/CatLockNotice-CXfuimXn.js","/assets/CategoryLegendModal-AVfnBJei.js","/assets/CellConcerns-D2fhYLVm.js","/assets/CellDetails-DrbEVXpZ.js","/assets/CellFormModal-TVf3pNnx.js","/assets/CellIdent-B2rwBkqQ.js","/assets/CellLink-BTpj_ytE.js","/assets/Cells-DEXRmpNF.js","/assets/ColumnFilter-ChRHG_6A.js","/assets/ColumnsPicker-BzrFbl29.js","/assets/CommentsModal-j1KefGh1.js","/assets/ComparisonTable-CNpyA9Pm.js","/assets/Concerns-BGX5nf4b.js","/assets/CountStepper-Jb4ju9R2.js","/assets/Daily-TMgwmhfv.js","/assets/DataTable-D_t-X4QT.js","/assets/DateRangePicker-CPhO7WvO.js","/assets/DayReportView-DP9PDzFI.js","/assets/DayStepper-eYtlmEuH.js","/assets/DifferenceBreakdown-C4RaSaMH.js","/assets/Downtime-D0BChGzq.js","/assets/Education-oqloBDPH.js","/assets/EducationLesson-C77x9DHr.js","/assets/EmptyState-D0WYrOBV.js","/assets/Exam-YX57I8OK.js","/assets/FactorySelect-D--t_Oqh.js","/assets/ForeignObjects-CrpVsVt8.js","/assets/Gamification-CdwwdONT.js","/assets/GroupBadge-5h25tn-L.js","/assets/HeatmapChart-Bo2IZyN3.js","/assets/IdleCell-D302IvQI.js","/assets/KPICard-BU6PPlbX.js","/assets/Kaizen-CvWwua2c.js","/assets/Kelish-C8DY5KtP.js","/assets/KpiDeltaCard-BuMOs48r.js","/assets/LangTextInput-Rx5j0yGd.js","/assets/Layout-DMNHUr_X.js","/assets/LeaderAppeal-CNpRSdWc.js","/assets/LeaderDayReport-CSdJhIIH.js","/assets/LeaderUnitReport-p2bzILaW.js","/assets/Leaderboard-DBRFGEtg.js","/assets/Leaders-SYRAG_HZ.js","/assets/Lightbox-Cubp_sR8.js","/assets/LiveOverview-ChxZh3hn.js","/assets/Login-Cp679-v6.js","/assets/NotFound-DZfMvt2Z.js","/assets/Notifications-elxliVw1.js","/assets/Overview-BHpdQx76.js","/assets/Pagination-ngn57N8h.js","/assets/PerenaladkaFactTable-IJfrxoEv.js","/assets/PersonCard-CxXISa3q.js","/assets/PlanFulfillment-NpsvmZMb.js","/assets/Production-BoWC6kqG.js","/assets/Profile-Q85a4uWz.js","/assets/ProofCamera-RwVUz0da.js","/assets/Quality-D9fVDecT.js","/assets/RawRows-CFR_nOVB.js","/assets/RequestStateChip-ACbhx9W4.js","/assets/RichTextEditor-B-kQz_7F.js","/assets/SaveState-mVckXqOs.js","/assets/SearchInput-BAbChSLp.js","/assets/SeasonalityHeatmap-DNob88BX.js","/assets/SegmentedToggle-Bwk_aTWG.js","/assets/SetupTimes-BHS-yKDU.js","/assets/ShiftDaily-D-fTmROu.js","/assets/Staff-gD9hUV3Q.js","/assets/StaffListAtCheck-BSnc5e-o.js","/assets/StatusBadge-tOdN3Ox4.js","/assets/TargetGoal-DnXiR3i3.js","/assets/Targets-CGhUHv01.js","/assets/Tasks-Cy_aG0Jc.js","/assets/TimeWheelPicker-CAVmdFvy.js","/assets/Toast-BvjfZohq.js","/assets/Tooltip-DYGr_Hz2.js","/assets/TrendChart-DD_4oFsS.js","/assets/TripleSpeedometer-CxQaBjhD.js","/assets/Trudoyomkost-BejO2y7R.js","/assets/Turnover-DH6OkplR.js","/assets/TurnoverBits-DKBotq0n.js","/assets/UploadDropzone-DZy8ACRt.js","/assets/UsersActivity-Dy_DPNId.js","/assets/VerdictBlock-B5uROBdH.js","/assets/VfxApiMap-BOkhpikN.js","/assets/VfxDictionaries-DwhTCHMJ.js","/assets/VfxEmployees-B-53ZqpC.js","/assets/VfxHrMoves-D9dGXxtE.js","/assets/VfxJobs-CoKsuK6D.js","/assets/VfxPhoto-Bm2HRc_D.js","/assets/VfxShifts-rHyFRPy7.js","/assets/VfxState-BlwIJB8G.js","/assets/VfxTimebooks-BpNUmj5K.js","/assets/VfxTimesheet-gHkJotJp.js","/assets/WatchProgress-BMyQimPa.js","/assets/WebLogin-D1JK7Hz6.js","/assets/WorkerConcerns-BxmrmfCq.js","/assets/Workers-D7b20ZRw.js","/assets/Zagruzka-CnZgyO4L.js","/assets/ZagruzkaCell-5-nPhlmp.js","/assets/api-D9zhFBMw.js","/assets/archive-BzHAg57F.js","/assets/archive-restore-DBt1t4WZ.js","/assets/arrow-down-BqGdza6t.js","/assets/arrow-down-wide-narrow-dgitrKzn.js","/assets/arrow-up-narrow-wide-BVyHbuef.js","/assets/award-CkB0ZMVC.js","/assets/ban-CK3661TV.js","/assets/boxes-BXBG208V.js","/assets/braces-BSUGI0Lo.js","/assets/brigadirFilters-CiTeEql3.js","/assets/broadcastTree-Dukux0oh.js","/assets/building-2-r4ZfSmT-.js","/assets/calculator-dMlAfg3k.js","/assets/calendar-CzNBpRG7.js","/assets/calendar-days-Nymptkym.js","/assets/camera-4H59hwbQ.js","/assets/categories-DB8zR750.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Dsj8hD6w.js","/assets/chart-line-CMhnOQXh.js","/assets/chart-pie-D-qPo2VN.js","/assets/chartRange-BTaVBuXa.js","/assets/check-check-Cr8o01AO.js","/assets/chevron-left-0SEYj5nn.js","/assets/chevrons-up-down-CqMGdJQC.js","/assets/circle-CPya96f1.js","/assets/circle-alert-Bb481tMd.js","/assets/circle-check-big-DcI6_8HC.js","/assets/circle-dashed-D8T-dqKv.js","/assets/circle-minus-BLezMPNH.js","/assets/circle-question-mark-C_GO3frv.js","/assets/circle-slash-BS4iXwxD.js","/assets/circle-user-round-C3hs4gMa.js","/assets/cloud-off-Zp56S_0f.js","/assets/cloud-upload-7MWNg-jZ.js","/assets/compass-BaVgiseZ.js","/assets/concernCategories-C_voGpKb.js","/assets/corner-down-right-O1VNvDc6.js","/assets/createLucideIcon-DnRB9IYQ.js","/assets/es-FkymXKWP.js","/assets/external-link-DaHjyZS9.js","/assets/file-clock-1Mp4whMQ.js","/assets/file-exclamation-point-B4tJtf24.js","/assets/flag-C1YAHL0L.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CVtMYppv.js","/assets/hash-BTN8aPkk.js","/assets/hourglass-BOtzlixF.js","/assets/image-CsqhXTRv.js","/assets/image-off-CBQPsdKl.js","/assets/inbox-COCP_R-D.js","/assets/index-ByhNoNK_.css","/assets/index-CwbYFJfX.js","/assets/keyboard-Bu7Sdlaa.js","/assets/languages-Bt98LaxN.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-c_pexPjx.js","/assets/lightbulb-6730D434.js","/assets/link-2-CZOuMvA8.js","/assets/link-2-off-D3JUsV9K.js","/assets/list-ordered-CqBePRZB.js","/assets/list-tree-BcRaBxui.js","/assets/lock-open-P2_hBZzQ.js","/assets/log-in-Dk-Mrqb0.js","/assets/marks-BhHdtAsb.js","/assets/minimize-2-B7SFltKA.js","/assets/package-check-BM2g7IYQ.js","/assets/pencil-Kx_U_4oD.js","/assets/percent-B8YyM3O_.js","/assets/pin-C8nXUYq4.js","/assets/pin-off-C07Cfpr_.js","/assets/play-9AF7hBDi.js","/assets/plug-zap-DJ_eIchm.js","/assets/prop-types-CsUyGUtp.js","/assets/radio-C_tj7-ew.js","/assets/react-apexcharts.esm-DczoGISb.js","/assets/registers-BADOLY53.js","/assets/repeat-DnF-gwk0.js","/assets/save-BJm-tquL.js","/assets/scopeLinks-B5kaviuY.js","/assets/scroll-text-B4wVhwlo.js","/assets/search-x-Bgk81y6B.js","/assets/segments-BNtHvR4p.js","/assets/send-C2NzrbUM.js","/assets/settings-2-0qkIDPzL.js","/assets/shield-CDq9BwuM.js","/assets/shield-alert-CCPD8nB7.js","/assets/shield-question-mark-dndwKD3F.js","/assets/siren-DrbwDlul.js","/assets/snowflake-DijbybI2.js","/assets/split-DsFTGtZV.js","/assets/square-check-big-Rcajd3dY.js","/assets/star-BDiDPFMx.js","/assets/statusBands-Rwsc7vSs.js","/assets/store-BocLdmSp.js","/assets/table-2-Cz13KuRB.js","/assets/table-properties-B7yN8cUD.js","/assets/tag-DVysVK7l.js","/assets/timer-off-BZbRy_oq.js","/assets/trending-down-CgqHoTLA.js","/assets/trending-up-BwqjZOie.js","/assets/undo-2-CIR8QVTr.js","/assets/useChartTheme-D_e50u_r.js","/assets/useElementWidth-BC3iQ1xb.js","/assets/useIsMobile-CaBuS6dI.js","/assets/useOpenParam-4okIX7hj.js","/assets/useStatusBands-CBzm2CAt.js","/assets/useUrlScope-B-b1bVX4.js","/assets/user-DH73Yvzy.js","/assets/user-cog-BbPZzm2B.js","/assets/users-CqfmuP-V.js","/assets/vfx-BxW9_jtQ.js","/assets/video-CA6qezJM.js","/assets/wallet-YAequ2fO.js","/assets/warehouse-CsRJ6drq.js","/assets/workflow-B3-bzlmq.js","/assets/x-DDcu6G7o.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
