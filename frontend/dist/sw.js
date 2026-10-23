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

const BUILD = "2026-10-23T11:56:13.834Z";
const PRECACHE = ["/","/assets/AdminPanel-CGcFI-4s.js","/assets/AnalysisBoard-DhNCZj29.js","/assets/Arc-CA7Y9QUg.js","/assets/Assistant-CQ-N7y6M.js","/assets/BrigadirProfile-Cdq_gOgn.js","/assets/BroadcastReceivers-DQiAVti8.js","/assets/BroadcastRecord-CyC8nMBL.js","/assets/Button-OAYqBRos.js","/assets/CatLockNotice-D2oqm6q2.js","/assets/CategoryLegendModal-Cpl733G0.js","/assets/CellConcerns-DMWB_kXo.js","/assets/CellDetails-BsrzQ9w7.js","/assets/CellFormModal-C3IiUShZ.js","/assets/CellIdent-BBaC16vN.js","/assets/CellLink-DxUKtS3l.js","/assets/Cells-TmVEh85A.js","/assets/ColumnFilter-CmJv4zar.js","/assets/ColumnsPicker-DDQD8dye.js","/assets/CommentsModal-C-nObdkN.js","/assets/ComparisonTable-DV6VjExy.js","/assets/Concerns-C3HKkEG6.js","/assets/CountStepper-DeC0GCPU.js","/assets/Daily-BjplbUxf.js","/assets/DataTable-Bg_6uoYX.js","/assets/DateRangePicker-Bju9dNOK.js","/assets/DayReportView-pNXpJOLy.js","/assets/DayStepper-KmWo2X3d.js","/assets/DayStrip-CiGrI5M1.js","/assets/DifferenceBreakdown-CG5ILRAo.js","/assets/Downtime-Cp15RtT0.js","/assets/Education-lRpYSekt.js","/assets/EducationLesson--MRU4hzo.js","/assets/EmptyState-BPIHLRG7.js","/assets/Exam-BOwy78g0.js","/assets/FactorySelect--hEHWoyw.js","/assets/Gamification-5zNh2dK6.js","/assets/GroupBadge-BTRSRZGE.js","/assets/HeatmapChart-CE-lhkw8.js","/assets/IdleCell-uBBPZjoe.js","/assets/KPICard-B6WSOEMR.js","/assets/Kaizen-CNSX32Bz.js","/assets/Kelish-DZtFQNXI.js","/assets/KpiDeltaCard-CmRIVgir.js","/assets/LangTextInput-BhM4PKrW.js","/assets/Layout-D0hk_tJ9.js","/assets/LeaderAppeal-BSi9LP0n.js","/assets/LeaderDayReport-DOLmlkVz.js","/assets/LeaderUnitReport-49Qbdgr9.js","/assets/Leaderboard-hq2Q0t75.js","/assets/Leaders-BMY2XP_O.js","/assets/LeadersKpi-DpaW4aKP.js","/assets/Lightbox-CdJM04Du.js","/assets/LiveOverview-D80l_28Y.js","/assets/Login-CG3iFjqX.js","/assets/NotFound-DAYEXEWs.js","/assets/Notifications-BO0QF0wt.js","/assets/Ontime-CEOMCf_i.js","/assets/Overview-DkF0IZ__.js","/assets/Pagination-68ShSXUH.js","/assets/PerenaladkaFactTable-Cj0NpBFy.js","/assets/PersonCard-DWv6OTRd.js","/assets/PlanFulfillment-BHqzP6OF.js","/assets/Production-DFZ-mfi1.js","/assets/Profile-DauRT-0y.js","/assets/ProofCamera-gKO3YS0J.js","/assets/ProofPhoto-CSEmRQTl.js","/assets/Quality-DmASyfnY.js","/assets/RawRows-Bj2XagdB.js","/assets/RequestStateChip-D0cEyFyg.js","/assets/RichTextEditor-DFsNhqU-.js","/assets/SaveState-CoGJ9TmG.js","/assets/SearchInput-CpcAoUB8.js","/assets/SeasonalityHeatmap-BvcxCuRh.js","/assets/SegmentedToggle-Cmfdlnsz.js","/assets/SetupTimes-vbrdjKjV.js","/assets/ShiftDaily-Bli2mUtS.js","/assets/Staff-2vzp16kq.js","/assets/StaffListAtCheck-7XOiFAZ-.js","/assets/StatusBadge-DDaVqrmh.js","/assets/StatusBandsModal-CJet-wIL.js","/assets/TargetGoal-_tnmAk-9.js","/assets/Targets-CmJDSIQS.js","/assets/Tasks-XloLdfYG.js","/assets/TimeWheelPicker-DH9gvlKc.js","/assets/Toast-BKBYG_7Q.js","/assets/Tooltip-BVEGjRre.js","/assets/TrendChart-DkClylR7.js","/assets/TripleSpeedometer-BEMn1DX8.js","/assets/Trudoyomkost-B2Hc7Ghi.js","/assets/UploadDropzone-B82J6_hH.js","/assets/UsersActivity-DRYNbjnc.js","/assets/VerdictBlock-CFj1oySy.js","/assets/VfxApiMap-qlvdU-ra.js","/assets/VfxDictionaries-DvrLQE4-.js","/assets/VfxEmployees-J2aowdT5.js","/assets/VfxHrMoves-CH_EuFM6.js","/assets/VfxJobs-g1c7weCQ.js","/assets/VfxPhoto-Cu_OhpXG.js","/assets/VfxShifts-Csu4uSYM.js","/assets/VfxState-B-P_tX8n.js","/assets/VfxTimebooks-D3o1nPHZ.js","/assets/VfxTimesheet-CakEZ8_a.js","/assets/WatchProgress-PjlNO8Z1.js","/assets/WebLogin-CxOGOvRZ.js","/assets/Workers-Ccvu_LFP.js","/assets/Zagruzka-9JUXhVHK.js","/assets/ZagruzkaCell-Dq3BnXMz.js","/assets/api-DxgxwuYR.js","/assets/archive-DhRX9Apr.js","/assets/archive-restore-BlMYY8QX.js","/assets/arrow-down-D79gx4rd.js","/assets/arrow-down-right-CoLtrihF.js","/assets/arrow-down-wide-narrow-DjCvoZMB.js","/assets/arrow-up-narrow-wide-DDlLU10P.js","/assets/ban-B6jHK2Ny.js","/assets/boxes-BVg_jGJU.js","/assets/braces-COWfTLzV.js","/assets/brigadirFilters-Ds8oTrmw.js","/assets/broadcastTree-Clkuosmo.js","/assets/building-2-gGEb7jJQ.js","/assets/calendar-CxJ4Bsc2.js","/assets/calendar-days-B5FYBAxd.js","/assets/camera-DJoRbyRK.js","/assets/categories-CYLQbeq-.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DJYqhatH.js","/assets/chart-line-C8QFzu_w.js","/assets/chart-pie-7SSGOrVi.js","/assets/chartRange-kbxGVC3R.js","/assets/check-check-B-PSeT_P.js","/assets/chevron-left-Qj-YHjql.js","/assets/chevrons-up-down-B22_iQI_.js","/assets/circle-DffunDpy.js","/assets/circle-alert-C1yCUoGi.js","/assets/circle-check-big-CMWbavdH.js","/assets/circle-dashed-CkkZZ7uB.js","/assets/circle-minus-gDkxxrut.js","/assets/circle-question-mark-DcVUZlIg.js","/assets/circle-slash-Bfgbd0VD.js","/assets/circle-user-round-BhUzbue_.js","/assets/cloud-off-vcW2--Sk.js","/assets/cloud-upload-4HUUobn0.js","/assets/compass-BmNDcMM4.js","/assets/concernCategories-HHxnBZES.js","/assets/corner-down-right-4D01-KJb.js","/assets/createLucideIcon-ChKYMw4i.js","/assets/es-DPEnFTW3.js","/assets/external-link-BvtIWC0J.js","/assets/file-clock-CSTAiL7k.js","/assets/file-exclamation-point-CLuApneq.js","/assets/flag-GT78FAnD.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CHKxrvx9.js","/assets/funnel-DsjhbI_W.js","/assets/hash-Df80Ri_m.js","/assets/hourglass-DPPy2l4S.js","/assets/image-BQJOJNi0.js","/assets/image-off-BkuMIX1v.js","/assets/inbox-D8bAsWCu.js","/assets/index-Ds_FLG67.js","/assets/index-FGjuJedL.css","/assets/keyboard-C1KaO-LZ.js","/assets/languages-BO-kUhhC.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BAfGqLqQ.js","/assets/leaderBoard-BDO2FPzM.js","/assets/lightbulb-BwMFLIOQ.js","/assets/link-2-Cnafm1rV.js","/assets/link-2-off-YQcS9Xvi.js","/assets/list-ordered-B8EBJSxt.js","/assets/list-tree-Cxm-wRla.js","/assets/lock-open-Do9HPZAl.js","/assets/log-in-BP-4C3ie.js","/assets/marks-CdFEkGwD.js","/assets/minimize-2-CRzry9Ej.js","/assets/package-check-Bh9B97W6.js","/assets/pencil-CKSiHNUr.js","/assets/percent-D6mpFFAP.js","/assets/pin-0hb9eJSw.js","/assets/pin-off-CwqJs2hp.js","/assets/play-tAZTskPB.js","/assets/plug-zap-XeUjd1To.js","/assets/prop-types-hFoSXrk8.js","/assets/radio-CW3wmOH5.js","/assets/react-apexcharts.esm-BCqACBEu.js","/assets/registers-mfYkDpqM.js","/assets/repeat-Byzauf_u.js","/assets/save-B6gdIwTP.js","/assets/scopeLinks-HlYX8SSP.js","/assets/scroll-text-BvMI1_0A.js","/assets/search-x-CaPiMWYD.js","/assets/segments-CxXljAAV.js","/assets/send-DeJM1dse.js","/assets/settings-2-Ng10Q1Ez.js","/assets/shield-C-6olSv1.js","/assets/shield-alert-DO2FDgf0.js","/assets/shield-question-mark-C9Fb-b4U.js","/assets/sigma-9vkmmDvV.js","/assets/siren-DYkfVozJ.js","/assets/snowflake-SDzCg206.js","/assets/split-D5jALqBk.js","/assets/square-check-big-Bg_d4_XO.js","/assets/star-BCIKGbsT.js","/assets/statusBands-DVMWWz5e.js","/assets/store-DHEkaiHD.js","/assets/table-2-5l3gBxv8.js","/assets/table-properties-CblVSZz2.js","/assets/tag-Brmcc5U2.js","/assets/timer-off-DmJfbB_Z.js","/assets/trendBuckets-H1FR-P6I.js","/assets/trending-down-D1d-fnwF.js","/assets/trending-up-0Skguqwe.js","/assets/undo-2-DE5rR097.js","/assets/useChartTheme-sLqwb76I.js","/assets/useElementWidth-BuhJCCnd.js","/assets/useIsMobile-CQwr7XNB.js","/assets/useOpenParam-DFmBx1x4.js","/assets/useStatusBands-aCCgKuXa.js","/assets/useUrlScope-B1MQ6cf_.js","/assets/user-DbCNcppx.js","/assets/user-cog-BwZMZ9MC.js","/assets/user-minus-CWpKme56.js","/assets/users-CZwHrnqf.js","/assets/vfx-D3Rg4E47.js","/assets/video-BxiVdzQ1.js","/assets/wallet-lFUSOyuP.js","/assets/warehouse-Crt-JJat.js","/assets/workflow-B81OoDoR.js","/assets/x-BAML_2CO.js","/assets/zap-AGSOaFdL.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
