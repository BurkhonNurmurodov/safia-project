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

const BUILD = "2026-10-19T10:05:15.613Z";
const PRECACHE = ["/","/assets/AdminPanel-Bm5SsXKR.js","/assets/AnalysisBoard-D2kSwqTT.js","/assets/Arc-CsQbzLKz.js","/assets/Assistant-GCyFaiXc.js","/assets/BrigadirProfile-CnIPgP10.js","/assets/BroadcastReceivers-DrDMcjEe.js","/assets/BroadcastRecord-F77tbVkl.js","/assets/Button-BcDnJAEz.js","/assets/CatLockNotice-Cfv2ZyQ_.js","/assets/CategoryLegendModal-DFzwzdWY.js","/assets/CellConcerns-Bld3Il3O.js","/assets/CellDetails-B5AwlV1H.js","/assets/CellFormModal-vZLuuSV2.js","/assets/CellIdent-BjFEGEcK.js","/assets/CellLink-DgpfpIJ1.js","/assets/Cells-CKuZy1oD.js","/assets/ColumnFilter-BsHSsJqt.js","/assets/ColumnsPicker-D6LQSjpl.js","/assets/CommentsModal-C04liKW5.js","/assets/ComparisonTable-S-oclW9e.js","/assets/Concerns-Dh8d2Kz7.js","/assets/CountStepper-C7UGXiHy.js","/assets/Daily-A1iTJWgZ.js","/assets/DataTable-CxoZDa2B.js","/assets/DateRangePicker-1Bo13M89.js","/assets/DayReportView-Ck_M7U7o.js","/assets/DayStepper-BSJvi_7R.js","/assets/DifferenceBreakdown-CTa8bJtB.js","/assets/Downtime-B_9e4_Ev.js","/assets/Education-CrzuXa8z.js","/assets/EducationLesson-CPjiobFB.js","/assets/EmptyState-gm5g0sX-.js","/assets/Exam-Dyr5caoD.js","/assets/FactorySelect-DGRzeC0W.js","/assets/Gamification-Dkp_gY_7.js","/assets/GroupBadge-BIPTEwyG.js","/assets/HeatmapChart-4k2lOsfR.js","/assets/IdleCell-BxlI1KEG.js","/assets/KPICard-CMsi6qJP.js","/assets/Kaizen-DfUhy-68.js","/assets/Kelish-COVhn6Uo.js","/assets/KpiDeltaCard-DCQxaOlx.js","/assets/LangTextInput-Dlf7ELE4.js","/assets/Layout-B8PURaCA.js","/assets/LeaderAppeal-C0V_oZTS.js","/assets/LeaderDayReport-BNUu_gfW.js","/assets/LeaderUnitReport-BFTlwnyC.js","/assets/Leaderboard-CJSnL5p1.js","/assets/Leaders-Ca4PZnbK.js","/assets/LeadersKpi-CmkNdiYR.js","/assets/Lightbox-BVZZqrTS.js","/assets/LiveOverview-CjZN2ISU.js","/assets/Login-BpmQIeGK.js","/assets/NotFound-DNLDGcZa.js","/assets/Notifications-lPq2YtgZ.js","/assets/Overview-Dok1g_fZ.js","/assets/Pagination-B7kbPBBe.js","/assets/PerenaladkaFactTable-C-7Oypnw.js","/assets/PersonCard-B3uUqfVt.js","/assets/PlanFulfillment-DoKiv98b.js","/assets/Production-2A3TnrsT.js","/assets/Profile-DT1yn5as.js","/assets/ProofCamera-BoWt62Vh.js","/assets/ProofPhoto-36KaaIkh.js","/assets/Quality-DfBXK5NG.js","/assets/RawRows-D_7XoW2Q.js","/assets/RequestStateChip-DJuRmFnu.js","/assets/RichTextEditor-6SjxYm79.js","/assets/SaveState-6F6S08-Z.js","/assets/SearchInput-rb6dmwSn.js","/assets/SeasonalityHeatmap-B57c0OJ0.js","/assets/SegmentedToggle-BI7U0eBm.js","/assets/SetupTimes-CNbwC1GN.js","/assets/ShiftDaily-BJFo41UH.js","/assets/Staff-CO9f2dtI.js","/assets/StaffListAtCheck-DhQdM-Br.js","/assets/StatusBadge-6hOxUHUt.js","/assets/TargetGoal-Qf0iommP.js","/assets/Targets-Ci7EEJSd.js","/assets/Tasks-DpInEU6N.js","/assets/TimeWheelPicker-DRmYrGtO.js","/assets/Toast-ASOp1KQ4.js","/assets/Tooltip-BmpHzmv8.js","/assets/TrendChart-C9ECkXnX.js","/assets/TripleSpeedometer-Co2mwvQK.js","/assets/Trudoyomkost-OwFvZFqe.js","/assets/UploadDropzone-Qyd59Cht.js","/assets/UsersActivity-8HhGkx4h.js","/assets/VerdictBlock-B7zKif-3.js","/assets/VfxApiMap-DOvqAl0V.js","/assets/VfxDictionaries-DUTIjdFb.js","/assets/VfxEmployees-3kmvZvHE.js","/assets/VfxHrMoves-BPeQmsGe.js","/assets/VfxJobs-DeoIVsd8.js","/assets/VfxPhoto-Dg0FG8eR.js","/assets/VfxShifts-DPRIp54m.js","/assets/VfxState-D_t46wWU.js","/assets/VfxTimebooks-DsVYTZ6J.js","/assets/VfxTimesheet-CSAf8_2z.js","/assets/WatchProgress-CsasRt-s.js","/assets/WebLogin-Ou86-s_5.js","/assets/Workers-D2YqVuqg.js","/assets/Zagruzka-CKMtnYgL.js","/assets/ZagruzkaCell-P-8Tbsbs.js","/assets/api-fnIGDu7W.js","/assets/archive-restore-WQhlYPsa.js","/assets/archive-vASR59CC.js","/assets/arrow-down-Bt8CBwE9.js","/assets/arrow-down-right-CPoXEp5h.js","/assets/arrow-down-wide-narrow-CCC8yY_k.js","/assets/arrow-up-narrow-wide-BoxAiHDX.js","/assets/ban-Agq0C7A9.js","/assets/boxes-BEO9pJWE.js","/assets/braces-BX-BRKQZ.js","/assets/brigadirFilters-CjStQRsX.js","/assets/broadcastTree-DaNTW_jb.js","/assets/building-2-2xVdx5hZ.js","/assets/calculator-gKNiIv3d.js","/assets/calendar-C5h4v7Nv.js","/assets/calendar-days-D995cRDk.js","/assets/camera-mSgdvU8C.js","/assets/categories-CcGPPtuM.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-NweQYKur.js","/assets/chart-line-VzMn8iCC.js","/assets/chart-pie-B7AbU0HK.js","/assets/chartRange-ZgdYVE9V.js","/assets/check-check-CpDUHoRM.js","/assets/chevron-left-CV-XojJO.js","/assets/chevrons-up-down-noW-w1hi.js","/assets/circle-BBnT9NsR.js","/assets/circle-alert-BkWsgLaH.js","/assets/circle-check-big-DNRdLem5.js","/assets/circle-dashed-BH-gc1ea.js","/assets/circle-minus-BKTsm3fr.js","/assets/circle-question-mark-CsCt4k-_.js","/assets/circle-slash-BOSYskWQ.js","/assets/circle-user-round-DLwyDARN.js","/assets/cloud-off-B12cTV9f.js","/assets/cloud-upload-Bt9Hjn3S.js","/assets/compass-B6EI9kwb.js","/assets/concernCategories-BpXiin-I.js","/assets/corner-down-right-DZYZZeCq.js","/assets/createLucideIcon-meh-Ba7P.js","/assets/es-BjSDnZQL.js","/assets/external-link-DKLMJ0Cp.js","/assets/file-clock-UqwFKJDe.js","/assets/file-exclamation-point-DptdpoS8.js","/assets/flag-C-YkgGgv.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DLPlhMNR.js","/assets/hash-r8qnnsVK.js","/assets/hourglass-B5e8cwlN.js","/assets/image-O1QR9b3Y.js","/assets/image-off-BqSuihcm.js","/assets/inbox-B0jDkSDY.js","/assets/index-DMj-IZMC.js","/assets/index-DemTQruw.css","/assets/keyboard-BUnJ2dye.js","/assets/languages-D9nJS1cf.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BF-_h16n.js","/assets/lightbulb-3I2Ei-qc.js","/assets/link-2-DczIJyGA.js","/assets/link-2-off-BA-QEdCb.js","/assets/list-ordered-CFmGzmoP.js","/assets/list-tree-COgIhQ_i.js","/assets/lock-open-CfFSVV24.js","/assets/log-in-CYaeSTf_.js","/assets/marks-D9IMkgoi.js","/assets/minimize-2-BHxEZvEP.js","/assets/package-check-CLgkO4j4.js","/assets/pencil-COLEmRFR.js","/assets/percent-DqiRj3cR.js","/assets/pin-BeNACEBU.js","/assets/pin-off-DW8A7a5G.js","/assets/play-ChkCpuxI.js","/assets/plug-zap-DJL4wyNQ.js","/assets/prop-types-Dk2UydWy.js","/assets/radio-B7j41jgc.js","/assets/react-apexcharts.esm-CSyZ6Msg.js","/assets/registers-o7PC-gyj.js","/assets/repeat-4ysWGy-C.js","/assets/save-5in_Ikek.js","/assets/scopeLinks-DBYvJhgM.js","/assets/scroll-text-ghU560ts.js","/assets/search-x-DhKFXm5p.js","/assets/segments-NgFe-rPA.js","/assets/send-BpjM3K3E.js","/assets/settings-2-C5w1514S.js","/assets/shield-alert-DDB6QVUv.js","/assets/shield-question-mark-C5WgT7fC.js","/assets/shield-swDDvQtZ.js","/assets/siren-DbL3encA.js","/assets/snowflake-BwIQiACW.js","/assets/split-BrEar2Bp.js","/assets/square-check-big-DdCPU-r8.js","/assets/star-Dt0ljMAQ.js","/assets/statusBands-yUlJO8Wd.js","/assets/store-BS8MMY1E.js","/assets/table-2-b-VwBHLc.js","/assets/table-properties-CaApOxtC.js","/assets/tag-BI5d0Rv-.js","/assets/timer-off-CxxwDIjk.js","/assets/trending-down-Chutsj-Y.js","/assets/trending-up-COy76rc6.js","/assets/undo-2-DoAv7aqi.js","/assets/useChartTheme-rpRGOqpa.js","/assets/useElementWidth-DOXMc_tt.js","/assets/useIsMobile-BsK5ybKi.js","/assets/useOpenParam-DCfxpi70.js","/assets/useStatusBands-C7K4H4KV.js","/assets/useUrlScope-DTGfEo7N.js","/assets/user-BewsFvDe.js","/assets/user-cog-DLQfOBXj.js","/assets/user-minus-VgD6N2QF.js","/assets/users-DlfNyw4Y.js","/assets/vfx-DXBeOJ_6.js","/assets/video-CPo4NeR4.js","/assets/wallet-b6zcHUWY.js","/assets/warehouse-DdsqWisk.js","/assets/workflow-DRQabcuT.js","/assets/x-BQkxbnwQ.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
