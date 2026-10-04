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

const BUILD = "2026-10-04T11:11:59.949Z";
const PRECACHE = ["/","/assets/AdminPanel-BDeP4NnM.js","/assets/AnalysisBoard-BuOLnNDA.js","/assets/Arc-BqbgrdM2.js","/assets/ArcLegacy-DsKI80_1.js","/assets/BrigadirProfile-BN-3ehhf.js","/assets/BroadcastReceivers-CIig0qhE.js","/assets/BroadcastRecord-DGc9z9p8.js","/assets/CatLockNotice-DzZRwD8C.js","/assets/CategoryLegendModal-Bc2AQTQs.js","/assets/CellConcerns-U8Y7y3rJ.js","/assets/CellDetails-TfMkZmaD.js","/assets/CellFormModal-sBcfuzXG.js","/assets/CellIdent-BPFcHH5b.js","/assets/CellLink-3e-vAJtz.js","/assets/Cells-D3Yf93yS.js","/assets/ColumnFilter-xycjKF8s.js","/assets/ColumnsPicker-D_gLgsjG.js","/assets/CommentsModal-qpl94p1b.js","/assets/ComparisonTable-D_tiof8y.js","/assets/Concerns-CaD5gKZf.js","/assets/ConfirmDialog-BSPxrKP1.js","/assets/Daily-CDrtPSJ2.js","/assets/DataTable-BpWtgEUg.js","/assets/DateRangePicker-BbMGF_BA.js","/assets/DayReportView-DU3YoLld.js","/assets/DayStepper-Cxizu8x2.js","/assets/DifferenceBreakdown-MdV4gGlq.js","/assets/Downtime-6AXEh-HO.js","/assets/Education-oKcHymcw.js","/assets/EducationLesson-CMTcoUih.js","/assets/EmptyState-BUm8xgWL.js","/assets/Exam-C98jQoYR.js","/assets/FactorySelect-ByRWOOUs.js","/assets/Gamification-C8C-Ih32.js","/assets/GroupBadge-BuuW6BYZ.js","/assets/HeatmapChart-BqqdHAKo.js","/assets/IdleCell-CbeHsYad.js","/assets/KPICard-B4J34x_w.js","/assets/Kaizen-Bm6UKgHv.js","/assets/Kelish-BI_R2BT6.js","/assets/KpiDeltaCard-FHT0egg4.js","/assets/LangTextInput-BO_j9Orq.js","/assets/Layout-Ccx8_VpO.js","/assets/LeaderAppeal-BnYEBww6.js","/assets/LeaderDayReport-HJQm6Msr.js","/assets/LeaderUnitReport-_oyVr4e2.js","/assets/Leaderboard-CMqiKd9R.js","/assets/Leaders-BHb-pSR-.js","/assets/Lightbox-SjUkEU9N.js","/assets/LiveOverview-y7dnrOYm.js","/assets/Login-C5hpPM4F.js","/assets/NotFound-BN8W1Sb2.js","/assets/Notifications-BMwOP-7W.js","/assets/Overview-DnKkYYT5.js","/assets/Pagination-CQeklnqw.js","/assets/PerenaladkaFactTable-DYzGSW-M.js","/assets/PersonCard-0saoVReC.js","/assets/PlanFulfillment-BDfbWJR_.js","/assets/Production-DhyupzMD.js","/assets/Profile-CgPZTqYb.js","/assets/ProofCamera-hB8F46NM.js","/assets/ProofPhoto-ClguTrxo.js","/assets/Quality-ClGqrI8v.js","/assets/RawRows-CZUGiwlo.js","/assets/RequestStateChip-BM0NuNuA.js","/assets/RichTextEditor-CEzgA4-K.js","/assets/SaveState-CNMsctxc.js","/assets/SearchInput-D3aLvCX-.js","/assets/SeasonalityHeatmap-jF1HYbeg.js","/assets/SegmentedToggle-SiFjX_9i.js","/assets/SetupTimes-BbirLcH1.js","/assets/ShiftDaily-Cffdq9gp.js","/assets/Staff-B2OcJIc7.js","/assets/StaffLive-lLdq0a6H.js","/assets/StatusBadge-CKHmX22T.js","/assets/TargetGoal-Dt95dIAo.js","/assets/Targets-DfyKzvWJ.js","/assets/Tasks-Dk2VG3LR.js","/assets/TimeWheelPicker-BqcY_k9V.js","/assets/Toast-BrzZphZA.js","/assets/Tooltip-BXOHURRl.js","/assets/TrendChart-B7L-i0d7.js","/assets/TripleSpeedometer-CqaX9408.js","/assets/Trudoyomkost-BXnDDAFC.js","/assets/UploadDropzone-7Yurwa26.js","/assets/UsersActivity-FAB0oBIA.js","/assets/VerdictBlock-D7NtYVql.js","/assets/VfxApiMap-CT-jswbm.js","/assets/VfxDictionaries-C-j13zAU.js","/assets/VfxEmployees-Ds3vTWJu.js","/assets/VfxHrMoves-B3VnVqQG.js","/assets/VfxJobs-C6wkxHXZ.js","/assets/VfxPhoto-C6nCYRwP.js","/assets/VfxShifts-CoN3X6zE.js","/assets/VfxState-qtMpcZeW.js","/assets/VfxTimebooks-DihX61iz.js","/assets/VfxTimesheet-Bjb02D5x.js","/assets/WatchProgress-DcYKy3Em.js","/assets/WebLogin-BCNAM-8W.js","/assets/WorkerConcerns-DTcUz7fj.js","/assets/Workers-BMTbxaWk.js","/assets/Zagruzka-D98F1qn1.js","/assets/ZagruzkaCell-D7FjspRZ.js","/assets/api-htNYOaQY.js","/assets/archive-DBb1SNqc.js","/assets/archive-restore-CRPqvOPv.js","/assets/arrow-down-DNZ5KpJy.js","/assets/arrow-left-Ezx67_v2.js","/assets/arrow-up-BS9fQ2Nh.js","/assets/arrow-up-narrow-wide-lWWHbzsd.js","/assets/arrow-up-right-BEgJrgzK.js","/assets/award-BXL_Ca-e.js","/assets/ban-DF9vklPs.js","/assets/bot-C34Chf5u.js","/assets/boxes-DFHYYEH-.js","/assets/braces-BvpzCQzc.js","/assets/brigadirFilters-CGn5j3Sp.js","/assets/broadcastTree-BjgUWlNx.js","/assets/building-2-CRbc5Y9q.js","/assets/calendar-B5BK8QWi.js","/assets/calendar-days-DW9Ps9D1.js","/assets/camera-CfxvHEpD.js","/assets/categories-CsG_RE8R.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-1FRjZDbq.js","/assets/chart-line-CueQXJzq.js","/assets/chart-pie-B0-Z7p6K.js","/assets/chartRange-Crxltoan.js","/assets/check-check-DzC7d1A8.js","/assets/chevron-left-D1sW21z4.js","/assets/chevrons-up-down-CvvmIN1O.js","/assets/circle-alert-CVz6pjZC.js","/assets/circle-check-big-Bw7Gp6Zu.js","/assets/circle-dashed-DvfaH20u.js","/assets/circle-minus-xgPTfqQA.js","/assets/circle-question-mark-B51OtRVP.js","/assets/circle-slash-BG_i61bq.js","/assets/circle-uiZSGvJ0.js","/assets/circle-user-round-hwinBm1A.js","/assets/clock-3-BI-GWZIN.js","/assets/cloud-off-CKg8dI-i.js","/assets/cloud-upload-B8kzY_3n.js","/assets/compass-X_I4FTyw.js","/assets/concernCategories-Dz8W0Oac.js","/assets/copy-CT4X9MEK.js","/assets/corner-down-right-CTC4sC0d.js","/assets/createLucideIcon-C8sppEkr.js","/assets/es-CCe2-Ck6.js","/assets/exportXlsx-h1_0AqGN.js","/assets/external-link-C5JcC2c9.js","/assets/file-clock-BPTbvUcT.js","/assets/file-exclamation-point-BGa5r5_u.js","/assets/file-spreadsheet-akhTuEN4.js","/assets/file-text-BJUj3vU9.js","/assets/flag-D7pM9ox0.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CK0daoJY.js","/assets/hash-BVO5JGkR.js","/assets/history-DRDRz2d3.js","/assets/hourglass-BHoFRmYb.js","/assets/image-BG2pNIu9.js","/assets/image-off-Co7xSEhv.js","/assets/inbox-BegJYCcd.js","/assets/index-BngiOmj1.css","/assets/index-DthQU4WB.js","/assets/key-round-DEFZ_VCf.js","/assets/keyboard-D_2qvma5.js","/assets/languages-4DWAo8fd.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-D3qHY4aO.js","/assets/lightbulb-BSHuT5hr.js","/assets/link-2-ClrLEWLy.js","/assets/link-2-off-DpH5J5Kx.js","/assets/list-ordered-BcaSwyiz.js","/assets/list-tree-kMNNVBUC.js","/assets/lock-open-NnuWxbnk.js","/assets/log-in-MStDOdRP.js","/assets/maximize-2-CWy5SV_c.js","/assets/message-square-IkE6k4VY.js","/assets/minimize-2-IQksTLKG.js","/assets/package-check-CIhlxjJG.js","/assets/paperclip-B0w4TadF.js","/assets/pencil-CGZNut4t.js","/assets/percent-D9KfndaO.js","/assets/pin-CdPou6aC.js","/assets/pin-off-bhsnHDMi.js","/assets/play-D8BkCc6P.js","/assets/plug-zap-nesUugzu.js","/assets/presentation-CTOUuW77.js","/assets/prop-types-BFz6w_QX.js","/assets/radio-CIITDbpg.js","/assets/react-apexcharts.esm-HkxRLgyc.js","/assets/registers-CScrs0Zb.js","/assets/repeat-Dz_9hgew.js","/assets/rotate-ccw-DERLtGSU.js","/assets/rotate-cw-V54kt56I.js","/assets/save-hLv7ZJ2I.js","/assets/scopeLinks-DCN5AAIs.js","/assets/scroll-text-CiWWahUt.js","/assets/search-x-NwVOi3xv.js","/assets/segments-BKiDsO8W.js","/assets/send-CYbJg8VV.js","/assets/settings-2-w_pBUgGG.js","/assets/shield-Cry374ii.js","/assets/shield-alert-3t-dPrLh.js","/assets/shield-check-B5eujuLi.js","/assets/shield-question-mark-93lvPuPN.js","/assets/siren-DGNMTkW0.js","/assets/snowflake-CwsNQZ5s.js","/assets/split-DtH92eLl.js","/assets/square-C8GhI9Jj.js","/assets/square-check-big-BCo_yQ_V.js","/assets/star-CCkSMKkf.js","/assets/statusBands-C7Dpapif.js","/assets/store-B_zFJY-e.js","/assets/table-2-2J9-pTlu.js","/assets/table-properties-RlANT2Ya.js","/assets/tag-DYHtnQOZ.js","/assets/timer-off-DZGLP98U.js","/assets/trending-down-CkwQxFPh.js","/assets/trending-up-nAEGlTYu.js","/assets/undo-2-B_oeOstL.js","/assets/useChartTheme-C6aaneL4.js","/assets/useElementWidth-DXw9HX27.js","/assets/useIsMobile-grJCx1Yl.js","/assets/useOpenParam-CEZkq9oR.js","/assets/useStatusBands-Bxh6aCRg.js","/assets/useUrlScope-B4t1Gug6.js","/assets/user-C4Pt5SmT.js","/assets/user-cog-gQXhg6Ud.js","/assets/user-minus-l3KVLN_S.js","/assets/users-C3pyRF57.js","/assets/video-wV4ihfXF.js","/assets/wallet-D9xjlh5J.js","/assets/warehouse-DW9u7hBC.js","/assets/x-DMNENMn-.js","/assets/zap-Eh5B2FgT.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
