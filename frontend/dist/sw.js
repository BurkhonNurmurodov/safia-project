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

const BUILD = "2026-10-19T12:25:10.218Z";
const PRECACHE = ["/","/assets/AdminPanel-DbbG9A_0.js","/assets/AnalysisBoard-BB_xq1Tb.js","/assets/Arc-CvbCXAUS.js","/assets/Assistant-BBfV2fww.js","/assets/BrigadirProfile-3bIAkJza.js","/assets/BroadcastReceivers-CIG6y8fr.js","/assets/BroadcastRecord-B2qfDYuE.js","/assets/Button-CMP1baqr.js","/assets/CatLockNotice-htQ0Ve8c.js","/assets/CategoryLegendModal-Cvot3G3j.js","/assets/CellConcerns-D_i-cYd-.js","/assets/CellDetails-C6m1VsuW.js","/assets/CellFormModal-Cy21qDEa.js","/assets/CellIdent-CZzTJL3K.js","/assets/CellLink-G88LnhFB.js","/assets/Cells-DXmBndBV.js","/assets/ColumnFilter-CEV6yHtR.js","/assets/ColumnsPicker-CsYTGYZC.js","/assets/CommentsModal-D5hPgFOc.js","/assets/ComparisonTable-D1e2VITo.js","/assets/Concerns-D4yE28Du.js","/assets/CountStepper-B3GJtB-k.js","/assets/Daily-C3d4n_a4.js","/assets/DataTable-CqCAG-x6.js","/assets/DateRangePicker-Bsg2eeFX.js","/assets/DayReportView-B0uac2lo.js","/assets/DayStepper-CKV0rKeC.js","/assets/DifferenceBreakdown-Cxvzwp2t.js","/assets/Downtime-Dwi9-1VX.js","/assets/Education-4ZHXLJJK.js","/assets/EducationLesson-T0l4UfbW.js","/assets/EmptyState-C5GXlwQi.js","/assets/Exam-CbsjsIS1.js","/assets/FactorySelect-D6IQp3N4.js","/assets/Gamification-BxL9zylS.js","/assets/GroupBadge-DHoJSJat.js","/assets/HeatmapChart-axjhdYrR.js","/assets/IdleCell-DvmxxsvS.js","/assets/KPICard-DFcwLZOo.js","/assets/Kaizen-ksjcBxLk.js","/assets/Kelish-BaEUt0aH.js","/assets/KpiDeltaCard-Dd_-FVS8.js","/assets/LangTextInput-BjIxn0uQ.js","/assets/Layout-Br_WVnJI.js","/assets/LeaderAppeal-BrIjHxSR.js","/assets/LeaderDayReport-B6BezQBY.js","/assets/LeaderUnitReport-EAbDeY6t.js","/assets/Leaderboard-CX0Fl2PB.js","/assets/Leaders-G57Mud7d.js","/assets/LeadersKpi-Br-kCL-p.js","/assets/Lightbox-C2_laUSH.js","/assets/LiveOverview-C-BlHeVL.js","/assets/Login-Bx6mwFT1.js","/assets/NotFound-DYO1sqvc.js","/assets/Notifications-IxzunYW_.js","/assets/Overview-CMZqDUWY.js","/assets/Pagination-BkIG9w2g.js","/assets/PerenaladkaFactTable-B5l999BY.js","/assets/PersonCard-IZiYHuyf.js","/assets/PlanFulfillment-CLfuyFGh.js","/assets/Production-KSyzIWQk.js","/assets/Profile-3hKROf1f.js","/assets/ProofCamera-Do7925fN.js","/assets/ProofPhoto-0mSDHmPM.js","/assets/Quality-C6R5JTr5.js","/assets/RawRows-DoiVegTT.js","/assets/RequestStateChip-cqyvZgeF.js","/assets/RichTextEditor-B4LmaNhD.js","/assets/SaveState-CSLj5J0Y.js","/assets/SearchInput-C-W0N--N.js","/assets/SeasonalityHeatmap-CUVWDbOh.js","/assets/SegmentedToggle-DV_LLUFU.js","/assets/SetupTimes-HPdg6iuR.js","/assets/ShiftDaily-CdGHQ3et.js","/assets/Staff-8q1zl-83.js","/assets/StaffListAtCheck-DXVKXNgt.js","/assets/StatusBadge-Bp1CD9bu.js","/assets/TargetGoal-8i_Nvwlr.js","/assets/Targets-DJtvVhpe.js","/assets/Tasks-DHISM4XS.js","/assets/TimeWheelPicker-C2pXKY1Y.js","/assets/Toast-Bkhl582n.js","/assets/Tooltip-BAN22Q1S.js","/assets/TrendChart-BCivYeF0.js","/assets/TripleSpeedometer-BcYx7gMx.js","/assets/Trudoyomkost-C7lNMJ2L.js","/assets/UploadDropzone-W_OxBF9D.js","/assets/UsersActivity-C1f-16Hw.js","/assets/VerdictBlock-BnLg3dyA.js","/assets/VfxApiMap-B6SPSy2s.js","/assets/VfxDictionaries-BOIDcVn_.js","/assets/VfxEmployees-CE-_o2Ml.js","/assets/VfxHrMoves-CueR-suC.js","/assets/VfxJobs-F01cWxKV.js","/assets/VfxPhoto-CQ_eeJbF.js","/assets/VfxShifts-DUnxP3jf.js","/assets/VfxState-CKbZpPs0.js","/assets/VfxTimebooks-CWhyJfqK.js","/assets/VfxTimesheet-Cltl-BK0.js","/assets/WatchProgress-CjQJNi9X.js","/assets/WebLogin-XivXSBtD.js","/assets/Workers-BvKnFKNe.js","/assets/Zagruzka-DjFeh1Xu.js","/assets/ZagruzkaCell-DiRHCVcE.js","/assets/api-BD-nQCFz.js","/assets/archive-Dzh-fSmk.js","/assets/archive-restore-C_BCQu6L.js","/assets/arrow-down-BanKzGbY.js","/assets/arrow-down-right-Bv7k0TMD.js","/assets/arrow-down-wide-narrow-D0f7qFCD.js","/assets/arrow-up-narrow-wide-rTqngqXS.js","/assets/ban-Dh98_LjT.js","/assets/boxes-W6hUMgQz.js","/assets/braces-DTQvYjxP.js","/assets/brigadirFilters-Cbp2TwRM.js","/assets/broadcastTree-CoHbf0ho.js","/assets/building-2-D27ICOlZ.js","/assets/calculator-BsXdAtUM.js","/assets/calendar-Dk55s3Q7.js","/assets/calendar-days-DH9TetQH.js","/assets/camera-Bx4XGiKg.js","/assets/categories-DseV7c2I.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DamRqjOH.js","/assets/chart-line-CD5zxBNi.js","/assets/chart-pie-Co9EdXTh.js","/assets/chartRange-D2vaCQIr.js","/assets/check-check-syt0pTSs.js","/assets/chevron-left-_BEG-nxx.js","/assets/chevrons-up-down-D24pZiQ1.js","/assets/circle-NXKJ5HeX.js","/assets/circle-alert-CSNsAI1D.js","/assets/circle-check-big-cpnAkeyG.js","/assets/circle-dashed-pyG4FQuI.js","/assets/circle-minus-vkirBSzL.js","/assets/circle-question-mark-B050N-zf.js","/assets/circle-slash-BA9V148Y.js","/assets/circle-user-round-DI5TsFWv.js","/assets/cloud-off-Cv_e0wcU.js","/assets/cloud-upload-B5j4RNvN.js","/assets/compass-De6jJDiF.js","/assets/concernCategories-KJPxErJq.js","/assets/corner-down-right-4dpHEhji.js","/assets/createLucideIcon-BC80JVlj.js","/assets/es-CUBj3nHj.js","/assets/external-link-3LrtKWOW.js","/assets/file-clock-D8gi1P5c.js","/assets/file-exclamation-point-BdMqoBtU.js","/assets/flag-COfA3Cju.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-kiXlchTm.js","/assets/hash-BY91nKam.js","/assets/hourglass-CF5VjOhz.js","/assets/image-FkqqY4bi.js","/assets/image-off-ByuthhKM.js","/assets/inbox-CiaCBhtd.js","/assets/index-B869yG5M.js","/assets/index-DemTQruw.css","/assets/keyboard-JBQsGRCe.js","/assets/languages-ozFMdUyE.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-7X1fdiaB.js","/assets/lightbulb-C4fvPhrQ.js","/assets/link-2-CNaMWBxJ.js","/assets/link-2-off-u4qYdtP2.js","/assets/list-ordered-i0MfiYGp.js","/assets/list-tree-CcYp5vu7.js","/assets/lock-open-uQ4M_Bux.js","/assets/log-in-CP980Q-F.js","/assets/marks-B2RCrfXL.js","/assets/minimize-2-C-E0TAAy.js","/assets/package-check-C3bS2bVU.js","/assets/pencil-CsRD_hae.js","/assets/percent-oLkFOMSe.js","/assets/pin-DZ7afdUB.js","/assets/pin-off-B3oX3ANz.js","/assets/play-DyzQKVPO.js","/assets/plug-zap-C3UooNqS.js","/assets/prop-types-DFYfwgT-.js","/assets/radio-CdtdUuiX.js","/assets/react-apexcharts.esm-CVxRJR2j.js","/assets/registers-Dpcd7ie1.js","/assets/repeat-C7V6T2tF.js","/assets/save-IRLPiY9i.js","/assets/scopeLinks-DzTlJ4uc.js","/assets/scroll-text-53_3wbyo.js","/assets/search-x-DbBzRw9m.js","/assets/segments-XnPsMawd.js","/assets/send-BqaC3y4u.js","/assets/settings-2-7sbo1Siz.js","/assets/shield-C3XwKwIm.js","/assets/shield-alert-Ck-bNKYt.js","/assets/shield-question-mark-BYrF-ZhB.js","/assets/siren-OdJW_r-f.js","/assets/snowflake-BQIC8p8-.js","/assets/split-D_Um0pwC.js","/assets/square-check-big-DIJRfJL2.js","/assets/star-DiWMGOrN.js","/assets/statusBands-uLoCqRzP.js","/assets/store-CAm_rgvQ.js","/assets/table-2-CCYGEi4K.js","/assets/table-properties-ClPYPGQM.js","/assets/tag-BC_4Pm66.js","/assets/timer-off-NpJQcXF-.js","/assets/trending-down-CxAE7Uzi.js","/assets/trending-up-DxptS1HX.js","/assets/undo-2-C_x-Fu8T.js","/assets/useChartTheme-CpTfsKrH.js","/assets/useElementWidth-9pCBSf9A.js","/assets/useIsMobile--cXfZ3V5.js","/assets/useOpenParam-ennNGpDj.js","/assets/useStatusBands-iiMmm6AJ.js","/assets/useUrlScope-CmzyC_j4.js","/assets/user-DTbTHOE6.js","/assets/user-cog-DOGgC6RK.js","/assets/user-minus-CQekeCDl.js","/assets/users-BNpGS9FW.js","/assets/vfx-pyFDZMcR.js","/assets/video-DY9ebeEa.js","/assets/wallet-uvAH7q68.js","/assets/warehouse-D3lrbAr2.js","/assets/workflow-BovNFI7q.js","/assets/x-C74_X4fm.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
