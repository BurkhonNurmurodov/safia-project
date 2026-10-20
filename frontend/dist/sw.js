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

const BUILD = "2026-10-20T14:22:51.853Z";
const PRECACHE = ["/","/assets/AdminPanel-Cx2LOzhP.js","/assets/AnalysisBoard-DpyTG13q.js","/assets/Arc-FRYGLLiJ.js","/assets/Assistant-DMSe-ZdW.js","/assets/BrigadirProfile-DYXHPBom.js","/assets/BroadcastReceivers-4AdNQwx6.js","/assets/BroadcastRecord-B4lSTuGs.js","/assets/Button-DpDmoHR3.js","/assets/CatLockNotice-DOd6f8bW.js","/assets/CategoryLegendModal-Cnr4hG_f.js","/assets/CellConcerns-DjQNICfb.js","/assets/CellDetails-fHjppoRy.js","/assets/CellFormModal-CH-o7MJL.js","/assets/CellIdent-C8cNxVVa.js","/assets/CellLink-B9X6nL-X.js","/assets/Cells-Cp3Z5wZO.js","/assets/ColumnFilter-BqIASkpD.js","/assets/ColumnsPicker-D90AYWiT.js","/assets/CommentsModal-CVysIGA3.js","/assets/ComparisonTable-BLIHJSZP.js","/assets/Concerns-B2ptXedR.js","/assets/CountStepper-CGH0vtTj.js","/assets/Daily-_Sgk6tJ2.js","/assets/DataTable-d_FWmLLI.js","/assets/DateRangePicker-BNhe36NN.js","/assets/DayReportView-B5-H1R2h.js","/assets/DayStepper-BfxDSZaM.js","/assets/DayStrip-zDwgGiJn.js","/assets/DifferenceBreakdown-D7EDQYX_.js","/assets/Downtime-C8f0FzSE.js","/assets/Education-CnWOTJDK.js","/assets/EducationLesson-CoP7HFLE.js","/assets/EmptyState-6vBhsDhN.js","/assets/Exam-BkbVJddt.js","/assets/FactorySelect-BuHdQQud.js","/assets/Gamification-BZGMggO4.js","/assets/GroupBadge-o4xJlFTk.js","/assets/HeatmapChart-BwukaJj7.js","/assets/IdleCell-DdunzPSv.js","/assets/KPICard-D38AMF11.js","/assets/Kaizen-Cbdgo9zm.js","/assets/Kelish-BZPzI2Ul.js","/assets/KpiDeltaCard-CAfCrttL.js","/assets/LangTextInput-CTWwrJeW.js","/assets/Layout-CDZMgB9D.js","/assets/LeaderAppeal-0mHYDyKU.js","/assets/LeaderDayReport-B7asYXYd.js","/assets/LeaderUnitReport-BQ05E8jl.js","/assets/Leaderboard-P51mk2Db.js","/assets/Leaders-COGkKRhA.js","/assets/LeadersKpi-Cg3jsM7I.js","/assets/Lightbox-d62Pku_P.js","/assets/LiveOverview-CSS7nco_.js","/assets/Login-Osca5PgK.js","/assets/NotFound-DNt5ckBs.js","/assets/Notifications-DvcwGuZp.js","/assets/Ontime-hA8Aq0M2.js","/assets/Overview-C_bK5KTc.js","/assets/Pagination-Abs4dbFT.js","/assets/PerenaladkaFactTable-en_O8V0E.js","/assets/PersonCard-BxZ2R0eR.js","/assets/PlanFulfillment-o501Zvw_.js","/assets/Production-D-5crOu4.js","/assets/Profile-DvRrfu14.js","/assets/ProofCamera-BGx4ibV1.js","/assets/ProofPhoto-Dd_OwlVA.js","/assets/Quality-_t91Cms4.js","/assets/RawRows-DZEHtOtO.js","/assets/RequestStateChip-B2qeRUK6.js","/assets/RichTextEditor-Rc-ukdPU.js","/assets/SaveState-jCYaNhmV.js","/assets/SearchInput-c5hwQgRN.js","/assets/SeasonalityHeatmap-Cd29PUda.js","/assets/SegmentedToggle-CeJX75MU.js","/assets/SetupTimes-DMYfoWAA.js","/assets/ShiftDaily-CDfAzWfc.js","/assets/Staff-C1Qo2g6I.js","/assets/StaffListAtCheck-By2AfZMS.js","/assets/StatusBadge-DIZsivnD.js","/assets/StatusBandsModal-T3VjHACb.js","/assets/TargetGoal-DIM-XhPs.js","/assets/Targets-Danzd8vB.js","/assets/Tasks-C8phKZzs.js","/assets/TimeWheelPicker-BcSAjLAm.js","/assets/Toast-BXCKV37M.js","/assets/Tooltip-ccD7jjss.js","/assets/TrendChart-RRLTtdtE.js","/assets/TripleSpeedometer-_gXMvEh3.js","/assets/Trudoyomkost-BGuyeCNq.js","/assets/UploadDropzone-BygLjDuC.js","/assets/UsersActivity-BsFsFdO6.js","/assets/VerdictBlock-CtA_pMn_.js","/assets/VfxApiMap-DQArY4lq.js","/assets/VfxDictionaries-B98ZQwqP.js","/assets/VfxEmployees-Cmbt68tD.js","/assets/VfxHrMoves-CTF-BMnA.js","/assets/VfxJobs-DTlxT7cR.js","/assets/VfxPhoto-CUGlCaCb.js","/assets/VfxShifts-DTrrMLyx.js","/assets/VfxState-lQjtr6bf.js","/assets/VfxTimebooks-CPJnb_MY.js","/assets/VfxTimesheet-Bf-EoMFI.js","/assets/WatchProgress-WbueHuSg.js","/assets/WebLogin-D8papcVw.js","/assets/Workers-B6Tx3o1U.js","/assets/Zagruzka-CJUwcKYH.js","/assets/ZagruzkaCell-2pnuqibe.js","/assets/api-Dz8Aifxy.js","/assets/archive-ih-Z1YqC.js","/assets/archive-restore-C8U8fYEE.js","/assets/arrow-down-C_EVWJm2.js","/assets/arrow-down-right-DqEXvFc4.js","/assets/arrow-down-wide-narrow-seZZRGYz.js","/assets/arrow-up-narrow-wide-n6ZRmN4m.js","/assets/ban-CE_zgS2d.js","/assets/boxes-Cyn4DNtB.js","/assets/braces-jJivqtlC.js","/assets/brigadirFilters-DA2WkIwf.js","/assets/broadcastTree-D1ENs3zi.js","/assets/building-2-Dsq4FLu2.js","/assets/calendar-6ZPS9W6u.js","/assets/calendar-days-BwJd_xzx.js","/assets/camera-B8yg1T2M.js","/assets/categories-D8_k6-fi.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-L5BbDSqH.js","/assets/chart-line-DRyXeT_3.js","/assets/chart-pie-BFAFiQvN.js","/assets/chartRange-DdtpWcXU.js","/assets/check-check-BeuSL2Xg.js","/assets/chevron-left-XpAg-41F.js","/assets/chevrons-up-down-CUccdz8c.js","/assets/circle-C0_7Lo0G.js","/assets/circle-alert-B3rs79Y7.js","/assets/circle-check-big-DYfFbSbO.js","/assets/circle-dashed-Cw8uzQOf.js","/assets/circle-minus-BCi7NL8B.js","/assets/circle-question-mark-DVdpiipL.js","/assets/circle-slash-CUJ0JPgf.js","/assets/circle-user-round-DCvqqsJ1.js","/assets/cloud-off-mMrBXvmx.js","/assets/cloud-upload-B701KjWx.js","/assets/compass-pQD2BeKQ.js","/assets/concernCategories-DaOx6EUF.js","/assets/corner-down-right-vvp0G70x.js","/assets/createLucideIcon-DVm5a5Oq.js","/assets/es-C3D33VRt.js","/assets/external-link-DVOm3gb0.js","/assets/file-clock-BtbrjG-G.js","/assets/file-exclamation-point-Bx2cXswH.js","/assets/flag-CE99VOUe.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CG9Q1EMM.js","/assets/funnel-DFP705Jy.js","/assets/hash-UAWgluig.js","/assets/hourglass-BqxsiRQE.js","/assets/image-off-DSCXQPdO.js","/assets/image-tb0tYxkT.js","/assets/inbox-z2xYC0ya.js","/assets/index-B7oDplGI.js","/assets/index-DLT_vDJq.css","/assets/keyboard-yjlKQioo.js","/assets/languages-bpipnPUC.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Cs1f4j66.js","/assets/lightbulb-CzjakSjG.js","/assets/link-2-DDpqdf_8.js","/assets/link-2-off-DzQJ8B0g.js","/assets/list-ordered-DNG4TvLJ.js","/assets/list-tree-WfQlqKM_.js","/assets/lock-open-J9udzjrt.js","/assets/log-in-CwlOk2aH.js","/assets/marks-B2NQnfJV.js","/assets/minimize-2-BPKWfrqC.js","/assets/package-check-yxLcISv-.js","/assets/pencil-DIVt9hgh.js","/assets/percent-MJz5aVae.js","/assets/pin-a4xawUww.js","/assets/pin-off-BPu4EbfP.js","/assets/play-D0fySf5Y.js","/assets/plug-zap-DxRtClpD.js","/assets/prop-types-Br7FvAl0.js","/assets/radio-DYN79pYy.js","/assets/react-apexcharts.esm-CvhuFq_0.js","/assets/registers-bpI4YfNs.js","/assets/repeat-DmXe1HO6.js","/assets/save-CaAy41Sk.js","/assets/scopeLinks-FemZU4Po.js","/assets/scroll-text-Clo32ckl.js","/assets/search-x-C1qb1vqX.js","/assets/segments-DinRsVK2.js","/assets/send-Y3iNiHt7.js","/assets/settings-2-DXrY-X5N.js","/assets/shield-DGVJNShg.js","/assets/shield-alert-D3_rG7S1.js","/assets/shield-question-mark-JyWc6zCS.js","/assets/sigma-BVlpEOdn.js","/assets/siren-Cah6U3Oc.js","/assets/snowflake-B1zZsvgp.js","/assets/split-D9BljxvV.js","/assets/square-check-big-D3mYS6kP.js","/assets/star-ChbHisEW.js","/assets/statusBands-Bmj4swZC.js","/assets/store-CMT2pos7.js","/assets/table-2-BKysHNjE.js","/assets/table-properties-CSflOOmX.js","/assets/tag-BTehuBw_.js","/assets/timer-off-CyQcDQoW.js","/assets/trending-down-COBv-BOz.js","/assets/trending-up-CSbmL2cM.js","/assets/undo-2-BDvsH0No.js","/assets/useChartTheme-DVEaxWmA.js","/assets/useElementWidth-B4MNRDDK.js","/assets/useIsMobile-DvGSuH7V.js","/assets/useOpenParam-Csfeb4x5.js","/assets/useStatusBands-BokF-SyX.js","/assets/useUrlScope-B9ysmANI.js","/assets/user-D3cCCxQ3.js","/assets/user-cog-CO1T4BXe.js","/assets/user-minus-BOUB6G8K.js","/assets/users-CK3Chv-M.js","/assets/vfx-CFkiBkC-.js","/assets/video-YHijJVsw.js","/assets/wallet-EI-1i-FU.js","/assets/warehouse-B1ALByM6.js","/assets/workflow-XrzEObBD.js","/assets/x-Ch6pXBjl.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
