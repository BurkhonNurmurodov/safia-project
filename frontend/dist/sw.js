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

const BUILD = "2026-10-07T04:17:57.551Z";
const PRECACHE = ["/","/assets/AdminPanel-DZ35xtwK.js","/assets/AnalysisBoard-u3-6kdGU.js","/assets/Arc-Bbc11M6w.js","/assets/Assistant-RxS-1EvC.js","/assets/BrigadirProfile-B4UgcXCG.js","/assets/BroadcastReceivers-CfpbDSMs.js","/assets/BroadcastRecord-ChDhE21r.js","/assets/Button-Cjs7h6Nc.js","/assets/CatLockNotice-HfZ31E8v.js","/assets/CategoryLegendModal-CmBb3f0S.js","/assets/CellConcerns-o2Evr78F.js","/assets/CellDetails-CgTKqchn.js","/assets/CellFormModal-CPTzgpkn.js","/assets/CellIdent-CSgHDJEU.js","/assets/CellLink-gVidnIKN.js","/assets/Cells-Ck1M16zX.js","/assets/ColumnFilter-Bm6qpBeI.js","/assets/ColumnsPicker-Bvu9IQtE.js","/assets/CommentsModal-BdRLePt3.js","/assets/ComparisonTable-D0iEqvxh.js","/assets/Concerns-DNSiGdHw.js","/assets/Daily-BStU4ZQ5.js","/assets/DataTable-DnGUB8-T.js","/assets/DateRangePicker-vwL2umq1.js","/assets/DayReportView-Kx76PS7G.js","/assets/DayStepper-DMYQqv4K.js","/assets/DifferenceBreakdown-C5yUni45.js","/assets/Downtime-B-ZTP58r.js","/assets/Education-Dp-m0mVu.js","/assets/EducationLesson-BLHfrRjK.js","/assets/EmptyState-BTU7U-Vk.js","/assets/Exam-BJ--0VOX.js","/assets/FactorySelect-ClDeYO7D.js","/assets/Gamification-fSAHmQ2v.js","/assets/GroupBadge-CAmYAXgc.js","/assets/HeatmapChart-BfDcgxbi.js","/assets/IdleCell-BlU11or8.js","/assets/KPICard-Ctnh-QUx.js","/assets/Kaizen-CrlSR0d9.js","/assets/Kelish-B1wBb2s5.js","/assets/KpiDeltaCard-BlgWu2_-.js","/assets/LangTextInput-C9iUWOw3.js","/assets/Layout-Bg1z3JLY.js","/assets/LeaderAppeal-Bco6hKFb.js","/assets/LeaderDayReport-piMCaT8r.js","/assets/LeaderUnitReport-DyEBdfXK.js","/assets/Leaderboard-CnYT2Lb4.js","/assets/Leaders-5n6cv3UL.js","/assets/Lightbox-8CTG2sgW.js","/assets/LiveOverview-Cudtbj1v.js","/assets/Login-CGy3HGxG.js","/assets/NotFound-DfB2-Tfz.js","/assets/Notifications-Bqif46sf.js","/assets/Overview-BbVlsZs4.js","/assets/Pagination-dsLHDwT9.js","/assets/PerenaladkaFactTable-DbbJsIfX.js","/assets/PersonCard-gKgV5hdl.js","/assets/PlanFulfillment-DJMqXQK-.js","/assets/Production-D0E63h-f.js","/assets/Profile-BmfxuaHU.js","/assets/ProofCamera-CbFnARel.js","/assets/ProofPhoto-BEIcUNp1.js","/assets/Quality-DTswa2bF.js","/assets/RawRows-BwVJiUGS.js","/assets/RequestStateChip-D6N7IP5I.js","/assets/RichTextEditor-D7f-7TSI.js","/assets/SaveState-Dpvb9K-3.js","/assets/SearchInput-itQaZ7Gg.js","/assets/SeasonalityHeatmap-DkNdevVB.js","/assets/SegmentedToggle-CgM0RPt6.js","/assets/SetupTimes-CAAw7NoJ.js","/assets/ShiftDaily-D7lDLNAd.js","/assets/Staff-Cg7exgPk.js","/assets/StatusBadge-BF_uuMf7.js","/assets/TargetGoal-CtvzMSNR.js","/assets/Targets-BxNBodcH.js","/assets/Tasks-Bsps13Gc.js","/assets/TimeWheelPicker-B9OFAOdD.js","/assets/Toast-DvMJBvXJ.js","/assets/Tooltip-BLLhTd4C.js","/assets/TrendChart-CyE0xuFp.js","/assets/TripleSpeedometer-C2vKCFYa.js","/assets/Trudoyomkost-DUbitFFh.js","/assets/Turnover-XoP-AC3y.js","/assets/UploadDropzone-DCmPF6GE.js","/assets/UsersActivity-CcsTS1qd.js","/assets/VerdictBlock-I1Ec5BWU.js","/assets/VfxApiMap-CigsWDuM.js","/assets/VfxDictionaries-BcRpm3Zz.js","/assets/VfxEmployees-BB1FBkVc.js","/assets/VfxHrMoves-M-s-47PY.js","/assets/VfxJobs-DmByV2fS.js","/assets/VfxPhoto-CBZCom6y.js","/assets/VfxShifts-BFZxjLPv.js","/assets/VfxState-CAHjXfWA.js","/assets/VfxTimebooks-ux8cHb61.js","/assets/VfxTimesheet-DWs_Uw2Z.js","/assets/WatchProgress-CVYDbNda.js","/assets/WebLogin-DPICZByJ.js","/assets/WorkerConcerns-DJMFvPCf.js","/assets/Workers-DcxUcEjM.js","/assets/Zagruzka-BqBFKQhL.js","/assets/ZagruzkaCell-DnT8GNmM.js","/assets/api-BfXsMpnj.js","/assets/archive-C0A2AFjR.js","/assets/archive-restore-DFPSdR3K.js","/assets/arrow-down-o8DjoQXb.js","/assets/arrow-up-narrow-wide-DWiDbXl-.js","/assets/award-BYnbt9Ud.js","/assets/ban-CN9gglF1.js","/assets/boxes-BgdmJtz9.js","/assets/braces-IdbOeH-g.js","/assets/brigadirFilters-ByvolMeE.js","/assets/broadcastTree-Q2Axy16B.js","/assets/building-2-DTgm6AmX.js","/assets/calculator-fL-rNL5Y.js","/assets/calendar-C5e99yYO.js","/assets/calendar-days-DJpbEW1I.js","/assets/camera-qdW5QLC9.js","/assets/categories-hMc_7zHa.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BngMua1X.js","/assets/chart-line-E6pHOg-3.js","/assets/chart-pie-BsJbB8nl.js","/assets/chartRange-DMos9utl.js","/assets/check-check-WuMU1xO2.js","/assets/chevron-left-f-R3T7ns.js","/assets/chevrons-up-down-Dnh9zGNv.js","/assets/circle-Cn3hxkkt.js","/assets/circle-alert-BOFCpgXV.js","/assets/circle-check-big-libaA6tR.js","/assets/circle-dashed-CDHVIM_Q.js","/assets/circle-minus-CB6phq7X.js","/assets/circle-question-mark-CSrbMhqA.js","/assets/circle-slash-sIodWycQ.js","/assets/circle-user-round-k8tZaAnY.js","/assets/clock-3-CzEzR3b8.js","/assets/cloud-off-DjW1rBEG.js","/assets/cloud-upload-DCNyBn8Y.js","/assets/compass-Dr0vk6qN.js","/assets/concernCategories-DK--_tPG.js","/assets/copy-CDWYsV3t.js","/assets/corner-down-right-DVODaqw7.js","/assets/createLucideIcon-DjAZCHnU.js","/assets/es-D_9m91OW.js","/assets/external-link-Cnnn4vnd.js","/assets/file-clock-D5lj2DAj.js","/assets/file-exclamation-point-D4Cj4l_R.js","/assets/flag-CFno5PO6.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CSrqqjrJ.js","/assets/hash-Dgsj1xOt.js","/assets/hourglass-CfGz8BPV.js","/assets/image-B-81Odqr.js","/assets/image-off-BkY-zEOq.js","/assets/inbox-B-TTzs9C.js","/assets/index--V56k7uk.js","/assets/index-BYLu8eK_.css","/assets/keyboard-Bj82gHz3.js","/assets/languages-USfgb4sk.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BL_hvZJ8.js","/assets/lightbulb-GtsZZnV7.js","/assets/link-2-BWgEvSM1.js","/assets/link-2-off-kguDZiV2.js","/assets/list-ordered-CgY0DEor.js","/assets/list-tree-DSwr6BOA.js","/assets/lock-open-BnRKSQlp.js","/assets/log-in-DuzwoHmx.js","/assets/minimize-2-B8l0SnsV.js","/assets/package-check-DutRDLTI.js","/assets/pencil-Bk8mGKSL.js","/assets/percent-Cs9P-VSt.js","/assets/pin-8QWZivW0.js","/assets/pin-off-5522xrhv.js","/assets/play-CsHwlO20.js","/assets/plug-zap-D_WmhR2u.js","/assets/prop-types-CWIMDwrk.js","/assets/radio-Bt4Ojrib.js","/assets/react-apexcharts.esm-CBZi6hQH.js","/assets/registers-qi0YPio4.js","/assets/repeat-CDUFvCNv.js","/assets/rotate-cw-BKhVYpF0.js","/assets/save-B6trtYCH.js","/assets/scopeLinks-B0W42ISq.js","/assets/scroll-text-BdeIxZDk.js","/assets/search-x-D1F6ulgt.js","/assets/segments-BSKcFo_y.js","/assets/send-C-V5TwIW.js","/assets/settings-2-B69Gdt-W.js","/assets/shield-Twr8sVWk.js","/assets/shield-alert-USLAO8LK.js","/assets/shield-question-mark-CuYxUt4c.js","/assets/siren-ByQIXjGU.js","/assets/snowflake-eQKEOoeH.js","/assets/split-B2WAcLyp.js","/assets/square-check-big-qUERbj6r.js","/assets/star-bXJiPi3s.js","/assets/statusBands-5Tsg32S8.js","/assets/store-BuENPd2z.js","/assets/table-2-B4ktD-9K.js","/assets/table-properties-DmG9kVq2.js","/assets/tag-CwLgMk9L.js","/assets/timer-off-Di7vFY6H.js","/assets/trending-down-NGLucP3r.js","/assets/trending-up-Df9WXge3.js","/assets/undo-2-BK0QibCT.js","/assets/useChartTheme-eN3_bqOP.js","/assets/useElementWidth-BfjWLBiH.js","/assets/useIsMobile-D7deuc0q.js","/assets/useOpenParam-C0nMBLBS.js","/assets/useStatusBands-Dbw5h4dL.js","/assets/useUrlScope-BKIKu-jM.js","/assets/user-MlQW9LdT.js","/assets/user-cog-DB9Rr_RT.js","/assets/users-Cv4ROjtF.js","/assets/vfx-DUrrphFC.js","/assets/video-DkLFclme.js","/assets/wallet-D7SHnk0V.js","/assets/warehouse-CaW4Ai1B.js","/assets/x-CoPHoL6Q.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
