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

const BUILD = "2026-10-13T05:07:34.303Z";
const PRECACHE = ["/","/assets/AdminPanel-DhP07JmF.js","/assets/AnalysisBoard-BVQEMzMy.js","/assets/Arc-CmD--38u.js","/assets/Assistant-CHvNtnkP.js","/assets/BrigadirProfile-CX5_25Zz.js","/assets/BroadcastReceivers-Di2uqV7l.js","/assets/BroadcastRecord-UAhqJZa4.js","/assets/Button-CMoqSH7i.js","/assets/CatLockNotice-BOrzNyAz.js","/assets/CategoryLegendModal-peUZC3Ta.js","/assets/CellConcerns-D9Zw6uc4.js","/assets/CellDetails-muohyj72.js","/assets/CellFormModal-BWk9lK9t.js","/assets/CellIdent-BW6aDtt9.js","/assets/CellLink-BRyFmxqR.js","/assets/Cells-DbYdOehS.js","/assets/ColumnFilter-Cxk3oytc.js","/assets/ColumnsPicker-CrNH5Qoh.js","/assets/CommentsModal-D4ZwwPjQ.js","/assets/ComparisonTable-B9S3geb-.js","/assets/Concerns-DzMARTLW.js","/assets/CountStepper-C0EFGHWN.js","/assets/Daily-c3IkTzIS.js","/assets/DataTable-L2rbOJvU.js","/assets/DateRangePicker-DIcX9KUT.js","/assets/DayReportView-sSTQmNvq.js","/assets/DayStepper-DLZhLZoR.js","/assets/DifferenceBreakdown-CuY1b0xO.js","/assets/Downtime-B5Ox93Uv.js","/assets/Education-BonRg1AB.js","/assets/EducationLesson-XIuVawCA.js","/assets/EmptyState-D7h5vlpH.js","/assets/Exam-AUJmQNEC.js","/assets/FactorySelect-DpTWOwef.js","/assets/Gamification-CiG2mwbY.js","/assets/GroupBadge-DcfdlsRs.js","/assets/HeatmapChart-8TMbXj7N.js","/assets/IdleCell-D3ipv-6A.js","/assets/KPICard-CEhzjdl-.js","/assets/Kaizen-wD_oD4rM.js","/assets/Kelish-oOjUb_9R.js","/assets/KpiDeltaCard-D1mTr_lK.js","/assets/LangTextInput-CAXkcSvC.js","/assets/Layout-C0-JX8GE.js","/assets/LeaderAppeal-BYk-3oma.js","/assets/LeaderDayReport-DTk0GcVW.js","/assets/LeaderUnitReport-B0thtl4j.js","/assets/Leaderboard-o5ZI-FQi.js","/assets/Leaders-i7Mcm5Gz.js","/assets/Lightbox-QSOWsqfB.js","/assets/LiveOverview-BBwBKYVT.js","/assets/Login-jWI2B7tC.js","/assets/NotFound-BReblk6a.js","/assets/Notifications-TkBO5dCa.js","/assets/Overview-fw6ci38w.js","/assets/Pagination-B194v9qD.js","/assets/PerenaladkaFactTable-bCZqwz03.js","/assets/PersonCard-BlU651QY.js","/assets/PlanFulfillment-BnQOknib.js","/assets/Production-1vdaNkIa.js","/assets/Profile-D77qHIPK.js","/assets/ProofCamera-B6kMATMq.js","/assets/Quality-BkR9T4-D.js","/assets/RawRows-DmzIewXG.js","/assets/RequestStateChip-DHgz-m3r.js","/assets/RichTextEditor-txRfChdQ.js","/assets/SaveState-jjy_iF2x.js","/assets/SearchInput-DtelVLA_.js","/assets/SeasonalityHeatmap-C05Cfigy.js","/assets/SegmentedToggle-B7aTXLqA.js","/assets/SetupTimes-D545k7-f.js","/assets/ShiftDaily-D-fhki15.js","/assets/Staff-BUjTHvwM.js","/assets/StaffListAtCheck-DQ4Lo49u.js","/assets/StatusBadge-BgRgSXL_.js","/assets/TargetGoal-Bbu_o0o0.js","/assets/Targets-urDExELY.js","/assets/Tasks-S-QjBaFT.js","/assets/TimeWheelPicker-B0UpG_sS.js","/assets/Toast-C1UuOjBY.js","/assets/Tooltip-cjWoeAPN.js","/assets/TrendChart-RSqCLQNT.js","/assets/TripleSpeedometer-Dc4un6zY.js","/assets/Trudoyomkost-haVpiMeH.js","/assets/Turnover-CfcV9oBJ.js","/assets/UploadDropzone-gBQLGuYk.js","/assets/UsersActivity-CAqkJMOe.js","/assets/VerdictBlock-NCnSWVou.js","/assets/VfxApiMap-Dtm26VGF.js","/assets/VfxDictionaries-Bd_PBB3e.js","/assets/VfxEmployees-DfWkwyzI.js","/assets/VfxHrMoves-BGYzUFBV.js","/assets/VfxJobs-BDUliJZY.js","/assets/VfxPhoto-Dqh_eBa9.js","/assets/VfxShifts-By6ruMA0.js","/assets/VfxState-DfsMilEY.js","/assets/VfxTimebooks-DsHk0zwn.js","/assets/VfxTimesheet-Bg6wtcLP.js","/assets/WatchProgress-DU41aRbW.js","/assets/WebLogin-DPgwM3wi.js","/assets/WorkerConcerns-BKftdS8j.js","/assets/Workers-CQ7cuUID.js","/assets/Zagruzka-2G1fXy_Q.js","/assets/ZagruzkaCell-Be9Ph4uC.js","/assets/api-B8F1Z9Id.js","/assets/archive-DQ9B4bWI.js","/assets/archive-restore-iB1gO7kg.js","/assets/arrow-down-CYgMzZIh.js","/assets/arrow-down-wide-narrow-DMXgak04.js","/assets/arrow-up-narrow-wide-DF_EuPsQ.js","/assets/award-DtNlwWnG.js","/assets/ban-CfWoOe0-.js","/assets/boxes-Bg5bgNaA.js","/assets/braces-D5cIpw-5.js","/assets/brigadirFilters-rAwqzy_s.js","/assets/broadcastTree-JkoG0y6v.js","/assets/building-2-COTNBO-I.js","/assets/calculator-DVFYTjha.js","/assets/calendar-DlWRldP1.js","/assets/calendar-days-4EUc86vI.js","/assets/camera-whBT7QuY.js","/assets/categories-vW_K6P2O.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-98fDVVH1.js","/assets/chart-line-DHt8A35h.js","/assets/chart-pie-C-KEqlHt.js","/assets/chartRange-ByPHJBuO.js","/assets/check-check-BW57fs6b.js","/assets/chevron-left-BOluVY8P.js","/assets/chevrons-up-down-DsOcmK_5.js","/assets/circle-C-lHRdKh.js","/assets/circle-alert-B7bPY7p4.js","/assets/circle-check-big-C-VqeVNq.js","/assets/circle-dashed-BiEnbFNM.js","/assets/circle-minus-DLbv0SRm.js","/assets/circle-question-mark-dQoYgUIz.js","/assets/circle-slash-Bzpst7Gv.js","/assets/circle-user-round-dTftAZhs.js","/assets/clock-3-C8f8qdf1.js","/assets/cloud-off-CNwe6xYI.js","/assets/cloud-upload-BjCif6BR.js","/assets/compass-C2XqhcSo.js","/assets/concernCategories-DdJwFxtF.js","/assets/copy-DP3wyCwg.js","/assets/corner-down-right-BZkq6Ide.js","/assets/createLucideIcon-GvCIZRCT.js","/assets/es-AWdRJb3r.js","/assets/external-link-BcCRq_Aq.js","/assets/file-clock-D2hSLjwA.js","/assets/file-exclamation-point-Cf-vAc4l.js","/assets/flag-CPhkF1O4.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BiiGayDF.js","/assets/hash-DKMIiU25.js","/assets/hourglass-rRwsZvkf.js","/assets/image-CdnNJZFT.js","/assets/image-off-CGHgxaUR.js","/assets/inbox-ChftWM1f.js","/assets/index-BEh9F3ST.js","/assets/index-InXWytRy.css","/assets/keyboard-BmcPAtqr.js","/assets/languages-Dkk5pJR1.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-pLEIMpvx.js","/assets/lightbulb-A8X8hXwp.js","/assets/link-2-Lin-XeEE.js","/assets/link-2-off-5MvYmb9C.js","/assets/list-ordered-aCvaR_Qf.js","/assets/list-tree-0BFQn8fe.js","/assets/lock-open-BxeK_soK.js","/assets/log-in-Cgz8xpgl.js","/assets/marks-Cjqpp-S1.js","/assets/minimize-2-Pm5pqUqL.js","/assets/package-check-37mC4nFD.js","/assets/pencil-CgB8fHn1.js","/assets/percent-NlvWb5OS.js","/assets/pin-CCRuAKpa.js","/assets/pin-off-CdGJ7zmL.js","/assets/play-CNfexs4T.js","/assets/plug-zap-BDcVaBpN.js","/assets/prop-types-SIDGff2F.js","/assets/radio-BRiMdaN1.js","/assets/react-apexcharts.esm-kT4mW4J5.js","/assets/registers-DyynTmqZ.js","/assets/repeat-Cscqlhrx.js","/assets/save-CiXttO4V.js","/assets/scopeLinks-BV1cB0aY.js","/assets/scroll-text-Dxrb68OT.js","/assets/search-x-ClHGmuxu.js","/assets/segments-DhYetp6v.js","/assets/send-D1dSo0kG.js","/assets/settings-2-D6Vd__ri.js","/assets/shield-B5AE27Sl.js","/assets/shield-alert-CEIvN3gg.js","/assets/shield-question-mark-r8o0tXR1.js","/assets/siren-D0UlD9bV.js","/assets/snowflake-d9ImU7qe.js","/assets/split-hFxP1nv9.js","/assets/square-check-big-mf7FAdXR.js","/assets/star-D9ZJKBrv.js","/assets/statusBands-Rxc2tEyQ.js","/assets/store-D-rcGaHj.js","/assets/table-2-CQx_Qz36.js","/assets/table-properties-DNkir1Xl.js","/assets/tag-CgCA6_fl.js","/assets/timer-off-BQeq5YcV.js","/assets/trending-down-DaIIvhz9.js","/assets/trending-up-Z22JBwwL.js","/assets/undo-2-jJ9r7S03.js","/assets/useChartTheme-DnrdzuRY.js","/assets/useElementWidth-CoYAN4sL.js","/assets/useIsMobile-c3Vu69Ij.js","/assets/useOpenParam-DGBjNrtH.js","/assets/useStatusBands-CKkYN3YS.js","/assets/useUrlScope-D4Ej6An_.js","/assets/user-BIBGyu3H.js","/assets/user-cog-BO4D9njf.js","/assets/users-G9tKcRk4.js","/assets/vfx-CJTKs-yY.js","/assets/video-BYh-I79L.js","/assets/wallet-CJXAsd94.js","/assets/warehouse-wVYlvM35.js","/assets/workflow-CtO0qRER.js","/assets/x-0C41xJUs.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
