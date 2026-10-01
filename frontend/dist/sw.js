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

const BUILD = "2026-10-01T12:11:53.254Z";
const PRECACHE = ["/","/assets/AdminPanel-BnrzV6gi.js","/assets/AnalysisBoard-BW50dWF2.js","/assets/Arc-qPpAun_I.js","/assets/ArcLegacy-BFLSxOwx.js","/assets/BrigadirProfile-Dosl2GLv.js","/assets/BroadcastReceivers-Bt8DMQUn.js","/assets/BroadcastRecord-nT3XzBjk.js","/assets/CatLockNotice-C-woyVn1.js","/assets/CategoryLegendModal-CO3fKRsj.js","/assets/CellConcerns-iZAWPeoh.js","/assets/CellDetails-7eype9mw.js","/assets/CellFormModal-DvwpYUHo.js","/assets/CellIdent-VmAe-RZD.js","/assets/CellLink-BJ6mKaF4.js","/assets/Cells-DHTR9cSK.js","/assets/ColumnFilter-DfcmZvkp.js","/assets/ColumnsPicker-6b-U7Ohi.js","/assets/CommentsModal-oDxe_4B5.js","/assets/ComparisonTable-CI4zi3Nj.js","/assets/Concerns-AZP1lB1o.js","/assets/ConfirmDialog-fWviSc5k.js","/assets/Daily-Zq8JgwqC.js","/assets/DataTable-CMP233AN.js","/assets/DateRangePicker-BXs8rkpi.js","/assets/DayReportView-B1j94KuW.js","/assets/DayStepper-C3wjbeu_.js","/assets/DifferenceBreakdown-Cxa_nkd9.js","/assets/Downtime-BWa6r-50.js","/assets/Education-DCcYI43Z.js","/assets/EducationLesson-PAztg8eb.js","/assets/EmptyState-mf0NiPAF.js","/assets/Exam-5KyBrZiL.js","/assets/FactorySelect-D-idpKjP.js","/assets/Gamification-CbBwzdqj.js","/assets/GroupBadge-BjJFQY94.js","/assets/HeatmapChart-DQMzHqiM.js","/assets/IdleCell-BpVMDQOw.js","/assets/KPICard-BYq0tXpR.js","/assets/Kaizen-CgyOdezz.js","/assets/Kelish-Dw1ZgC3n.js","/assets/KpiDeltaCard-DNMsffq_.js","/assets/LangTextInput-D7fNxjql.js","/assets/Layout-DFa8Z1AH.js","/assets/LeaderAppeal-DGz20uoY.js","/assets/LeaderDayReport-DwIQroBu.js","/assets/LeaderUnitReport-DomfCwXp.js","/assets/Leaderboard-CxxmrZBD.js","/assets/Leaders-BgShmxyy.js","/assets/Lightbox-Cqfr4AnB.js","/assets/LiveOverview-tV8qjiDO.js","/assets/Login-BNnKNfHm.js","/assets/NotFound-tDMx9jJ0.js","/assets/Overview-Cu_LQd9d.js","/assets/Pagination-BKZSPfzx.js","/assets/PerenaladkaFactTable-Z0zp3WDs.js","/assets/PlanFulfillment-D8_sUj0b.js","/assets/Production-DWlyN1BU.js","/assets/Profile-BYQ4tb6f.js","/assets/ProofCamera-DiQpRzfS.js","/assets/ProofPhoto-UjIS9Rxj.js","/assets/Quality-CjSYmcLk.js","/assets/RequestStateChip-coVTemrJ.js","/assets/RichTextEditor-DWgEsaQG.js","/assets/SaveState-BGqgwuvv.js","/assets/SearchInput-De2iOAyH.js","/assets/SeasonalityHeatmap-BMofaOs_.js","/assets/SegmentedToggle-B208yrDA.js","/assets/SetupTimes-B36r3nJ4.js","/assets/ShiftDaily-BU-8Q7XK.js","/assets/Staff-BPRMWcnQ.js","/assets/StaffLive-CRMnwCnD.js","/assets/StatusBadge-DxbzHsHq.js","/assets/TargetGoal-9EekDTze.js","/assets/Targets-L1Lwczvx.js","/assets/Tasks-p1tHiGaV.js","/assets/TimeWheelPicker-BkWzb4wb.js","/assets/Tooltip-nz773mxg.js","/assets/TrendChart-mJzQdfHy.js","/assets/TripleSpeedometer-B0r3AIfY.js","/assets/Trudoyomkost-1LmsC3F9.js","/assets/UploadDropzone-DtGZAiL1.js","/assets/UsersActivity-BjejVGBK.js","/assets/VerdictBlock-CB2HPBzP.js","/assets/WatchProgress-D6XNdi-2.js","/assets/WebLogin-5nz438S_.js","/assets/WorkerConcerns-B2eB0ed3.js","/assets/Workers-BXmrsLNi.js","/assets/Zagruzka-TGtnuE0q.js","/assets/ZagruzkaCell-95AKXuIk.js","/assets/api-FxHQOft4.js","/assets/archive-BNDSn5Vo.js","/assets/archive-restore-GbU4ejIb.js","/assets/arrow-down-OTixhiMi.js","/assets/arrow-left-DbstAmzD.js","/assets/arrow-left-right-ogl3CVok.js","/assets/arrow-right-left-9_mHJ_wX.js","/assets/arrow-up-DD_1jrQ7.js","/assets/arrow-up-narrow-wide-B1EyG61z.js","/assets/arrow-up-right-1kYnpFF_.js","/assets/award-Cr_nzF40.js","/assets/ban-DpHmW0ig.js","/assets/bot-Citfk3YW.js","/assets/boxes-CnEvMG4Y.js","/assets/brigadirFilters-DOvVapnU.js","/assets/broadcastTree-DQcHUNsi.js","/assets/building-2-Bpu_o30A.js","/assets/calendar-CPvvJqFg.js","/assets/calendar-clock-BGEFP7Yq.js","/assets/calendar-days-BaOzUzld.js","/assets/calendar-range-aXHXu602.js","/assets/camera-BVhx3ofA.js","/assets/categories-CZ-xE7ks.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-8ARMb0H0.js","/assets/chart-line-BOR_5J7u.js","/assets/chart-pie-DoRJc7DI.js","/assets/chartRange-CX0TA6n7.js","/assets/chevron-left-CIPgNHhd.js","/assets/chevrons-up-down-CN8H4hYh.js","/assets/circle-CmQuv3Y2.js","/assets/circle-check-big-BXCsZmM8.js","/assets/circle-dot-DsKTrF54.js","/assets/circle-minus-DFSjkEaH.js","/assets/circle-slash-BKpoLm0W.js","/assets/circle-user-round-BAMDMkCA.js","/assets/cloud-off--kHhD57x.js","/assets/cloud-upload-BSZ_3dqn.js","/assets/compass-ViWlAzx1.js","/assets/concernCategories-ChgyIdmL.js","/assets/copy-C1s3g1IB.js","/assets/corner-down-right-B_wQJ22t.js","/assets/createLucideIcon-DnMlhet-.js","/assets/es-BDveI9Eu.js","/assets/exportXlsx-COBgoO_K.js","/assets/external-link-2l1VEhUz.js","/assets/file-clock-D44W-YGg.js","/assets/file-exclamation-point-CC0Xjd7u.js","/assets/file-spreadsheet-YlmU_Cij.js","/assets/file-text-Bg2JjO7S.js","/assets/flag-BDA_v9yH.js","/assets/flame-DezK6xlo.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-onFEI0vH.js","/assets/hash-CjwbCqdP.js","/assets/history-pOR4aBGD.js","/assets/hourglass-CcwozqUA.js","/assets/id-card-H_YJNwU_.js","/assets/image-D2_WOw0x.js","/assets/image-off-C9lW8VQ8.js","/assets/index-ChaUI_nH.css","/assets/index-D4VoRr17.js","/assets/key-round-CjjP55N-.js","/assets/keyboard-oPeeAFCc.js","/assets/languages-DzDyAZwz.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C0pJAzF_.js","/assets/lightbulb-BZKPxIOx.js","/assets/link-2-CL670t4t.js","/assets/link-2-off-C_OBmksj.js","/assets/list-checks-BEV6QzwO.js","/assets/list-ordered-BjZoMKsg.js","/assets/list-tree-PlKpRwOR.js","/assets/lock-open-DpBiuM7c.js","/assets/log-in-enP4zb6X.js","/assets/maximize-2-LhPWtNws.js","/assets/message-square-D15sqo2C.js","/assets/minimize-2-DJCOniBs.js","/assets/package-check-BrUrW01i.js","/assets/paperclip-CHFFy1Bm.js","/assets/pencil-FaDJ_74B.js","/assets/percent-ClFd9_61.js","/assets/personName-CogOuS3K.js","/assets/pin-DmSEnIFs.js","/assets/pin-off-Ce9OTwb2.js","/assets/play-CcIZ4oE6.js","/assets/plug-zap-JgS8giAN.js","/assets/presentation-RF3VlQ7R.js","/assets/prop-types-2fQ6LE_j.js","/assets/radio-BUuJG4y8.js","/assets/react-apexcharts.esm-CKTQzR73.js","/assets/repeat-Df0fKnag.js","/assets/rotate-ccw-CqYZU2A6.js","/assets/rotate-cw-Bk4MH9tw.js","/assets/save-tLACI6sx.js","/assets/scale-D6poInAq.js","/assets/scopeLinks-DrVhG69_.js","/assets/scroll-text-wmYYrdYw.js","/assets/search-x-DbVMJUN0.js","/assets/segments-CQgBNVyO.js","/assets/send-CwW-BIKo.js","/assets/settings-2-QmHM6snZ.js","/assets/shield-alert-DMYpm3JY.js","/assets/shield-check-BtWIFrOY.js","/assets/shield-question-mark-DxoNy6_c.js","/assets/shield-zzhDHlPl.js","/assets/siren-DAvIitQ6.js","/assets/snowflake-C3QWX1wt.js","/assets/split-BdewUMUt.js","/assets/square-BO0nBYSi.js","/assets/square-check-big-Sn28-_wV.js","/assets/star-1iO_AIvO.js","/assets/statusBands-Bj6oHQ9x.js","/assets/store-B7kyvn3V.js","/assets/table-2-DxiOZ7ST.js","/assets/table-properties-Anq6NTe7.js","/assets/tag-laHI9LwQ.js","/assets/timer-off-BhU__cM_.js","/assets/trending-down-0sCQ-aS6.js","/assets/trending-up-D71EOH79.js","/assets/undo-2-DBrIDklv.js","/assets/useChartTheme-dI9Jys-C.js","/assets/useElementWidth-Bf2X5Bw5.js","/assets/useIsMobile-rhx0SXWk.js","/assets/useMutation-AW5mTfzL.js","/assets/useStatusBands-DnVqwX__.js","/assets/useUrlScope-DKfXzeGY.js","/assets/user-O4rpO_hT.js","/assets/user-cog-ix0IsIzk.js","/assets/user-minus-BTB929mX.js","/assets/users-CBWxFjI-.js","/assets/video-8fFbIPVF.js","/assets/wallet-DFH4-_Ui.js","/assets/warehouse-DUR6Ygdw.js","/assets/zap-CizupUk3.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
