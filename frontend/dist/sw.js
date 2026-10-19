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

const BUILD = "2026-10-19T10:07:47.209Z";
const PRECACHE = ["/","/assets/AdminPanel-BZbPO6Xi.js","/assets/AnalysisBoard-DJdybiMn.js","/assets/Arc-i3TMG655.js","/assets/Assistant-DsmhmhgZ.js","/assets/BrigadirProfile-B2P0MjKh.js","/assets/BroadcastReceivers-D243ef0U.js","/assets/BroadcastRecord-wXxLHwLg.js","/assets/Button-QeoPgmlH.js","/assets/CatLockNotice-1S31b7Yy.js","/assets/CategoryLegendModal-BHw80GJD.js","/assets/CellConcerns-Bplq8C7i.js","/assets/CellDetails-BH24vWVA.js","/assets/CellFormModal-xVFSiGdi.js","/assets/CellIdent-ZUmsuT9l.js","/assets/CellLink-C-Nx_M6h.js","/assets/Cells-C030Ogrt.js","/assets/ColumnFilter-DRGAZgGo.js","/assets/ColumnsPicker-CYT41ixa.js","/assets/CommentsModal-DQu98Hlj.js","/assets/ComparisonTable-CG6LaJUA.js","/assets/Concerns-CoRmjiUA.js","/assets/CountStepper-C4cKkhba.js","/assets/Daily-DbZDslul.js","/assets/DataTable-C0KnD-Qt.js","/assets/DateRangePicker-GWzvETNe.js","/assets/DayReportView-CCSA626Z.js","/assets/DayStepper-Dk-BxcT1.js","/assets/DifferenceBreakdown-rV7KvawA.js","/assets/Downtime-DMWQ_KGV.js","/assets/Education-BlD_7qUA.js","/assets/EducationLesson-BYgD1Uzt.js","/assets/EmptyState-Bes_-6_v.js","/assets/Exam-8JeMDOWL.js","/assets/FactorySelect-DBK_IlHg.js","/assets/Gamification-bXrYD1pf.js","/assets/GroupBadge-DGyfjkHL.js","/assets/HeatmapChart-1xI5m26d.js","/assets/IdleCell-8KtApI-W.js","/assets/KPICard-CqRvOpEY.js","/assets/Kaizen-sM7bRMA3.js","/assets/Kelish-BGw5r3kV.js","/assets/KpiDeltaCard-BxAVIZKd.js","/assets/LangTextInput-CS4tdQv0.js","/assets/Layout-B2OzrWpX.js","/assets/LeaderAppeal-BZo-4NW-.js","/assets/LeaderDayReport-BQSzsDrz.js","/assets/LeaderUnitReport-I7c5HVoV.js","/assets/Leaderboard-BhwAyFfd.js","/assets/Leaders-Cz53ZQh3.js","/assets/LeadersKpi-PDQHe6MS.js","/assets/Lightbox-oMdG9y-y.js","/assets/LiveOverview-Ds822RII.js","/assets/Login-CBuBl5SS.js","/assets/NotFound-5onOHLEx.js","/assets/Notifications-sOvzOjVG.js","/assets/Overview-CnbO9JzM.js","/assets/Pagination-CCCg5qAK.js","/assets/PerenaladkaFactTable-CO7b3Nzc.js","/assets/PersonCard-BYTn8kdq.js","/assets/PlanFulfillment-BlMORXqJ.js","/assets/Production-CJwAOJoH.js","/assets/Profile-DfIOUjek.js","/assets/ProofCamera-DfQRZ_Su.js","/assets/ProofPhoto-CH-Po3dB.js","/assets/Quality-95PaWawj.js","/assets/RawRows-DXOnx2-F.js","/assets/RequestStateChip-CiHEVMkc.js","/assets/RichTextEditor-eD9L4_ci.js","/assets/SaveState-rT9bou7j.js","/assets/SearchInput-az8oGPcS.js","/assets/SeasonalityHeatmap-tOJa7azb.js","/assets/SegmentedToggle-DwOPxLim.js","/assets/SetupTimes-UDZv3nVb.js","/assets/ShiftDaily-DNdrgfHV.js","/assets/Staff-Dv-vxGEW.js","/assets/StaffListAtCheck-BhRxUX8a.js","/assets/StatusBadge-BG2bv7Al.js","/assets/TargetGoal-DHcEzydg.js","/assets/Targets-bj-404PY.js","/assets/Tasks-CTIVQO7d.js","/assets/TimeWheelPicker-DNrQPhQc.js","/assets/Toast-CVligxuJ.js","/assets/Tooltip-DtgffWC_.js","/assets/TrendChart-BGgRrhao.js","/assets/TripleSpeedometer-DypQ1JbW.js","/assets/Trudoyomkost-BQLE_mw6.js","/assets/UploadDropzone-BfoYpR15.js","/assets/UsersActivity-DiU5ovtf.js","/assets/VerdictBlock-C8lEvuBB.js","/assets/VfxApiMap-tmjiRIBp.js","/assets/VfxDictionaries-muH4R29_.js","/assets/VfxEmployees-BFnT42Bf.js","/assets/VfxHrMoves-Dcd4-5CM.js","/assets/VfxJobs-DY1tT_ms.js","/assets/VfxPhoto-BbUXd_0F.js","/assets/VfxShifts-D383WAry.js","/assets/VfxState-E9Rcknwu.js","/assets/VfxTimebooks-BVIvvtR5.js","/assets/VfxTimesheet-BkDMUqUM.js","/assets/WatchProgress-CDoJNIHv.js","/assets/WebLogin-C6w84DNE.js","/assets/Workers-DFq_ZxET.js","/assets/Zagruzka-DY2GbFlo.js","/assets/ZagruzkaCell-BYcN858E.js","/assets/api-CtxG05uF.js","/assets/archive-CUcE3f3p.js","/assets/archive-restore-Da6nQbvZ.js","/assets/arrow-down-BHeBVH-D.js","/assets/arrow-down-right-Dcmoed86.js","/assets/arrow-down-wide-narrow-BAMIZesf.js","/assets/arrow-up-narrow-wide-DcLfZh0Q.js","/assets/ban-wQTugd5d.js","/assets/boxes-CPUfLVgC.js","/assets/braces-BWoypT_z.js","/assets/brigadirFilters-BcBWZS-n.js","/assets/broadcastTree-qe9nvf_e.js","/assets/building-2-CS0OVARj.js","/assets/calculator-CzmM8PIz.js","/assets/calendar-XocRendw.js","/assets/calendar-days-DDNKv-9_.js","/assets/camera-DC9ltedH.js","/assets/categories-BTTDV43V.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BxIrkwxE.js","/assets/chart-line-zo1SVAW-.js","/assets/chart-pie-BXbs2vrY.js","/assets/chartRange-C5_WiROm.js","/assets/check-check-BKH5gFVF.js","/assets/chevron-left-Bg-Akpgy.js","/assets/chevrons-up-down-BmiB5aoi.js","/assets/circle-5sqTb-YS.js","/assets/circle-alert-BI-Zk3b-.js","/assets/circle-check-big-DqCLpr-i.js","/assets/circle-dashed-wqAJu0Y6.js","/assets/circle-minus-D3USf5Ew.js","/assets/circle-question-mark-BXohSuOz.js","/assets/circle-slash-CmkSv989.js","/assets/circle-user-round-CzvGN8kc.js","/assets/cloud-off-BQ282tFq.js","/assets/cloud-upload-B2f8UdCn.js","/assets/compass-B2wf5k8R.js","/assets/concernCategories-BnyJD0wv.js","/assets/corner-down-right-CKQdzEpW.js","/assets/createLucideIcon-DIHSkOjZ.js","/assets/es-DVTEHRHo.js","/assets/external-link-Btvf51eg.js","/assets/file-clock-DONC-z5c.js","/assets/file-exclamation-point-C1jgXmde.js","/assets/flag-DHKgwbBf.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-XFMMEeJF.js","/assets/hash-BL-vK8-z.js","/assets/hourglass-BotfG3ee.js","/assets/image-CcHgxW7S.js","/assets/image-off-_CQhY6QQ.js","/assets/inbox-Ccy8iEX5.js","/assets/index-DemTQruw.css","/assets/index-PouYyUXw.js","/assets/keyboard-EmWBZ_pA.js","/assets/languages-By-wxnD3.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DU2sIITG.js","/assets/lightbulb-tE5VBGXQ.js","/assets/link-2-CfJRAuz8.js","/assets/link-2-off-CoQlnIuZ.js","/assets/list-ordered-k0SoEHye.js","/assets/list-tree-CrfDURtv.js","/assets/lock-open-B8rVChB9.js","/assets/log-in-CBLUdaBK.js","/assets/marks-Bbhi5SDy.js","/assets/minimize-2-C2q0HYrz.js","/assets/package-check-CVukflVv.js","/assets/pencil-C45nH94N.js","/assets/percent-D1-zxU8G.js","/assets/pin-CU72gUYs.js","/assets/pin-off-DXd9vJk4.js","/assets/play-DTcPJGdX.js","/assets/plug-zap-W-shGLLq.js","/assets/prop-types-BNOdWG8s.js","/assets/radio-4DY2vYQR.js","/assets/react-apexcharts.esm-C6JCtzrC.js","/assets/registers-CSx3lfvL.js","/assets/repeat-JhTqbrWE.js","/assets/save-CoCVfzna.js","/assets/scopeLinks-Ct9d0CLs.js","/assets/scroll-text-CjYyQPyn.js","/assets/search-x-cWXgrb4M.js","/assets/segments-BEEPyVaB.js","/assets/send-DnqPp-Yf.js","/assets/settings-2-CDiIPDXa.js","/assets/shield-Cq05JxCy.js","/assets/shield-alert-K8drJYI0.js","/assets/shield-question-mark-DxnQDsyf.js","/assets/siren-BUvSVNb5.js","/assets/snowflake-Cg6M2qIl.js","/assets/split-Co1fPf2-.js","/assets/square-check-big-0JV0VKCs.js","/assets/star-B-VINgFp.js","/assets/statusBands-C6UR9YUg.js","/assets/store-DJ_Lzei2.js","/assets/table-2-DivYUw-Z.js","/assets/table-properties-XD8Mjts0.js","/assets/tag-Dnlv8IMT.js","/assets/timer-off-CqXh5VpK.js","/assets/trending-down-DnCsQayN.js","/assets/trending-up-CQYBVfys.js","/assets/undo-2-CF-5mgT0.js","/assets/useChartTheme-DuWJk0fg.js","/assets/useElementWidth-C1sgkEkZ.js","/assets/useIsMobile-DLmXnjxr.js","/assets/useOpenParam-CJvc7MPu.js","/assets/useStatusBands-DYkRbXJH.js","/assets/useUrlScope-BzJubwm4.js","/assets/user-BEP8jsgh.js","/assets/user-cog-BX9M7JZd.js","/assets/user-minus-s6X9rL2B.js","/assets/users-BUfBDGmz.js","/assets/vfx-DcQQka-7.js","/assets/video-CJRbMw10.js","/assets/wallet-CIjaT_Ay.js","/assets/warehouse-DYn3mXUG.js","/assets/workflow-D_rzg3b_.js","/assets/x-B1zwLJvO.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
