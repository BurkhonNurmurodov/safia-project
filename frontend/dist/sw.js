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

const BUILD = "2026-10-23T13:07:58.728Z";
const PRECACHE = ["/","/assets/AdminPanel-BmvDXoWx.js","/assets/AnalysisBoard-CINXkc20.js","/assets/Arc-DTspcj2D.js","/assets/Assistant-AArXi8NK.js","/assets/BrigadirProfile-DwAjmmc_.js","/assets/BroadcastReceivers-Cxs-jGyp.js","/assets/BroadcastRecord-CmPTtI7p.js","/assets/Button-BsnrqrKK.js","/assets/CatLockNotice-COA9OVbE.js","/assets/CategoryLegendModal-DCYaWVtQ.js","/assets/CellConcerns-DYnetKOA.js","/assets/CellDetails-DF42Ukyr.js","/assets/CellFormModal-eAKOXMRz.js","/assets/CellIdent-Bq8GX00U.js","/assets/CellLink-CG40Y017.js","/assets/Cells-i3zB10n7.js","/assets/ColumnFilter-CHAd0Thp.js","/assets/ColumnsPicker-BZE4yW8b.js","/assets/CommentsModal-DTdCH3lT.js","/assets/ComparisonTable-DbmzSmk2.js","/assets/Concerns-CaT2tRWo.js","/assets/CountStepper-BASADZ8L.js","/assets/Daily-Dy4_2dO6.js","/assets/DataTable-VHfstU9v.js","/assets/DateRangePicker-DJjOi-Fj.js","/assets/DayReportView-CSJhjncO.js","/assets/DayStepper-z5pLzjo_.js","/assets/DayStrip-DlKu_gXn.js","/assets/DifferenceBreakdown-lT50vnNj.js","/assets/Downtime-sPqUEkAi.js","/assets/Education-DaYaJZK0.js","/assets/EducationLesson-0z7o7aT2.js","/assets/EmptyState-DJsaUA-K.js","/assets/Exam-SQjFZ4Hn.js","/assets/FactorySelect-C3WLKhnt.js","/assets/Gamification-B35ChH-0.js","/assets/GroupBadge-CXFi1tMu.js","/assets/HeatmapChart-8vDTzAKg.js","/assets/IdleCell-D4dnGqfx.js","/assets/KPICard-Df6oda1F.js","/assets/Kaizen-sk2xwGWB.js","/assets/Kelish-CRtn2GiQ.js","/assets/KpiDeltaCard-Dcr7HbmG.js","/assets/LangTextInput-C1NvjuZ4.js","/assets/Layout-CDhbfkbe.js","/assets/LeaderAppeal-DzY_Re5o.js","/assets/LeaderDayReport-CabwbGqh.js","/assets/LeaderUnitReport-KT4L_mT7.js","/assets/Leaderboard-8EF3azsg.js","/assets/Leaders-OinuX-AZ.js","/assets/LeadersKpi-B89Yqkx_.js","/assets/Lightbox-BeLUSfmh.js","/assets/LiveOverview-D8TRexN1.js","/assets/Login-ChU9xJ7b.js","/assets/NotFound-Dy1yVq9w.js","/assets/Notifications-DgIQ2UFM.js","/assets/Ontime-BwZrQv07.js","/assets/Overview-BsxZdHOd.js","/assets/Pagination-BqAXYWK5.js","/assets/PerenaladkaFactTable-DDsTSSpN.js","/assets/PersonCard-DLNAD7-z.js","/assets/PlanFulfillment-CVkYocso.js","/assets/Production-BFPQEN4C.js","/assets/Profile-D-zfyqhW.js","/assets/ProofCamera-3ciPBIiD.js","/assets/ProofPhoto-BVWZ5wDp.js","/assets/Quality-B_DunqGa.js","/assets/RawRows-qloopca3.js","/assets/RequestStateChip-0HXwBQkM.js","/assets/RichTextEditor-DtodMPCX.js","/assets/SaveState-CB9Mp__m.js","/assets/SearchInput-CgtQlaQN.js","/assets/SeasonalityHeatmap-D9LLIYpV.js","/assets/SegmentedToggle-DO1IQd0D.js","/assets/SetupTimes-DfqhtDKN.js","/assets/ShiftDaily-DtaQT29d.js","/assets/Staff-aY5Lks6X.js","/assets/StaffListAtCheck-CbWJ0l-S.js","/assets/StatusBadge-21GgH4Tq.js","/assets/StatusBandsModal-CbGWwa_w.js","/assets/TargetGoal-DnHkYGpD.js","/assets/Targets-CEKATVuy.js","/assets/Tasks-GvgsT3cq.js","/assets/TimeWheelPicker-DnW9aTLw.js","/assets/Toast-BOf_UYlQ.js","/assets/Tooltip-CY1pHUMi.js","/assets/TrendChart-D4kb7JTA.js","/assets/TripleSpeedometer-C-DcrnW5.js","/assets/Trudoyomkost-CMuJKSwo.js","/assets/UploadDropzone-BpLRlhom.js","/assets/UsersActivity-kMF1DanC.js","/assets/VerdictBlock-CGlofNWZ.js","/assets/VfxApiMap-HXplrwZe.js","/assets/VfxDictionaries-C-w4i64e.js","/assets/VfxEmployees-Ct0NoB7v.js","/assets/VfxHrMoves-BYPSAJEx.js","/assets/VfxJobs-CuhjdBPS.js","/assets/VfxPhoto-5CBbVrnC.js","/assets/VfxShifts-sRus5coI.js","/assets/VfxState-DMCzGWiO.js","/assets/VfxTimebooks-BPcMzH87.js","/assets/VfxTimesheet-BPbUvbRD.js","/assets/WatchProgress-gheg0CKS.js","/assets/WebLogin-C9SEMXV0.js","/assets/Workers-9J9-A9C3.js","/assets/Zagruzka-CNiwo8nM.js","/assets/ZagruzkaCell-CTZ95xwj.js","/assets/api-DUJ57oKs.js","/assets/archive-Dc68eM5y.js","/assets/archive-restore-CUrZdl37.js","/assets/arrow-down-right-jZCRMVF9.js","/assets/arrow-down-vFfz61sQ.js","/assets/arrow-down-wide-narrow-DRxcb9nf.js","/assets/arrow-up-narrow-wide-D23Sxq8K.js","/assets/ban-izlFjd2y.js","/assets/boxes-CJoETRir.js","/assets/braces-DW4ye9sg.js","/assets/brigadirFilters-Dna9gFna.js","/assets/broadcastTree-CyEK3akr.js","/assets/building-2-B1cDxL1o.js","/assets/calendar--iF3VZFn.js","/assets/calendar-days-RQoXl8Fc.js","/assets/camera-3a4BllRT.js","/assets/categories-DmUo5dzJ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C9nP4ECl.js","/assets/chart-line-yWRE207l.js","/assets/chart-pie-wFPqQS_T.js","/assets/chartRange-BNLBIQL4.js","/assets/check-check-D-k2-zyu.js","/assets/chevron-left-D6ku8gEr.js","/assets/chevrons-up-down-DSmpyjBN.js","/assets/circle-WiD1ewrA.js","/assets/circle-alert-CTODz1Ko.js","/assets/circle-check-big-Dc1Gi9Ls.js","/assets/circle-dashed-BYVdtbtD.js","/assets/circle-minus-ClA_vfpu.js","/assets/circle-question-mark-CmCQXGRn.js","/assets/circle-slash-B5UuRQ8h.js","/assets/circle-user-round-iJ2CJ6aT.js","/assets/cloud-off-CDcH8Ybb.js","/assets/cloud-upload-BdxtFKRf.js","/assets/compass-Xek0Bq-g.js","/assets/concernCategories-BHQBplhK.js","/assets/corner-down-right-DUs8VXUn.js","/assets/createLucideIcon-Bbd9MkVL.js","/assets/es-D2hB--Ik.js","/assets/external-link-Dt7Reh63.js","/assets/file-clock-B5hqqGXZ.js","/assets/file-exclamation-point-gObIqiVV.js","/assets/flag-DyxFDbOE.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Bbn_YCNT.js","/assets/funnel-CY5AD3qE.js","/assets/hash-BmhekU0B.js","/assets/hourglass-B9FXKwY8.js","/assets/image-CWP7hzMh.js","/assets/image-off-j3G5CCg2.js","/assets/inbox-BkaFpJYv.js","/assets/index-D6TzxdoC.js","/assets/index-DFvJry-Q.css","/assets/keyboard-ByXqYLZJ.js","/assets/languages-DTM7osFn.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B278zu6y.js","/assets/leaderBoard-ue1YCArx.js","/assets/lightbulb-CIbx3JkS.js","/assets/link-2-DWedYz4t.js","/assets/link-2-off-6jSV8bPT.js","/assets/list-ordered-B6x2wWwO.js","/assets/list-tree-bxfm1ZyR.js","/assets/lock-open-0GjP2XaQ.js","/assets/log-in-uBD2yfY_.js","/assets/map-pin-DWeQYK06.js","/assets/marks-DWjgAggk.js","/assets/minimize-2-K5PysZjH.js","/assets/package-check-BHm1aVge.js","/assets/pencil-CeDTfJTw.js","/assets/percent-smj49E2-.js","/assets/pin-VllSwWip.js","/assets/pin-off-DBfTlLdx.js","/assets/play-Bh3Xowjn.js","/assets/plug-zap-BzJBLNvT.js","/assets/prop-types-CaUwv2Ks.js","/assets/radio-CRswl3Rn.js","/assets/react-apexcharts.esm-B2sCXOk2.js","/assets/registers-Dl9xcAVD.js","/assets/repeat-6VlyaUey.js","/assets/save-byBLX6RP.js","/assets/scopeLinks-DWlT7SU9.js","/assets/scroll-text-vaqt1Ijl.js","/assets/search-x-DARUccqw.js","/assets/segments-C1XuKP-4.js","/assets/send-DQM8IGkn.js","/assets/settings-2-CuNRpaZB.js","/assets/shield-CswUO2uI.js","/assets/shield-alert-tIsB8xbG.js","/assets/shield-question-mark-DUiG0q2i.js","/assets/sigma-_oR66LJF.js","/assets/siren-C75wOV8a.js","/assets/snowflake-D5GxV9_V.js","/assets/split-D2XRRq9p.js","/assets/square-check-big-D9j2XHfQ.js","/assets/star-HHcygYze.js","/assets/statusBands-KeKdzTc-.js","/assets/store-C0yAD0DJ.js","/assets/table-2-YIPkBm26.js","/assets/table-properties-HptvtzgR.js","/assets/tag-r1B-afdG.js","/assets/timer-off-CB_k4wDX.js","/assets/trendBuckets-DrWnGFGS.js","/assets/trending-down-DTR0FfnR.js","/assets/trending-up-yu07dnF6.js","/assets/undo-2-BhHvwfC8.js","/assets/useChartTheme-F_xy2E-2.js","/assets/useElementWidth-B2x8e8Hd.js","/assets/useIsMobile-BzU0tYVJ.js","/assets/useOpenParam-C1yYrjUp.js","/assets/useStatusBands-D14UAlMf.js","/assets/useUrlScope-CZxB6CyM.js","/assets/user-C6u_sRVg.js","/assets/user-cog-DyJ22cd-.js","/assets/user-minus-C5ZK23D1.js","/assets/users-DdNdn6b8.js","/assets/vfx-BIRop_1G.js","/assets/video-BivgttqJ.js","/assets/wallet-OED9peAM.js","/assets/warehouse-BvIHAtAy.js","/assets/workflow-BnsvfWdn.js","/assets/x-BzSGZoS4.js","/assets/zap-B5dqMYR5.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
