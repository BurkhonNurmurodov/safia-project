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

const BUILD = "2026-10-29T06:34:08.829Z";
const PRECACHE = ["/","/assets/AdminPanel-U6zJMrMf.js","/assets/AnalysisBoard-yJKDJEkb.js","/assets/Arc-zYDFdCC_.js","/assets/Assistant-DZgNDqgt.js","/assets/BrigadirProfile-DgnOAbY6.js","/assets/BroadcastReceivers-CYsCtWJc.js","/assets/BroadcastRecord-Dvm8NF-c.js","/assets/Button-Bod8fhIt.js","/assets/CatLockNotice-YXfZvFhN.js","/assets/CategoryLegendModal-BD2-2zrM.js","/assets/CellConcerns-By4eMmvf.js","/assets/CellDetails-zSOis4vW.js","/assets/CellFormModal-BRdypIk2.js","/assets/CellIdent-BQIXqRsT.js","/assets/CellLink-BksNtFG8.js","/assets/Cells-CwIsvZfF.js","/assets/ColumnFilter-BWoN-ZNy.js","/assets/ColumnsPicker-CvaSF-ex.js","/assets/CommentsModal-BVII55kf.js","/assets/ComparisonTable-Vo7tlC6m.js","/assets/Concerns-BryTvzd9.js","/assets/CountStepper-C5eH_5uj.js","/assets/Daily-BOlxGxrR.js","/assets/DataTable-DQ0dtAsk.js","/assets/DateRangePicker-CDOSs-K4.js","/assets/DayReportView-BnQN1GTG.js","/assets/DayStepper-C8_CXNCB.js","/assets/DayStrip-BP4-_8LV.js","/assets/DifferenceBreakdown-Dfgst5CL.js","/assets/Downtime-DVjXd5Xx.js","/assets/Education-B3gJWd_G.js","/assets/EducationLesson-QqfSLMuf.js","/assets/EmptyState-IHAa75_y.js","/assets/Exam-DRMbGXqR.js","/assets/FactorySelect-DVxpUP8a.js","/assets/Gamification-BzauxKTb.js","/assets/GroupBadge-CPnwYA_-.js","/assets/HeatmapChart-BWRkCVcX.js","/assets/IdleCell-EywvvMXn.js","/assets/KPICard-DEVZiPws.js","/assets/Kaizen-BMrdTcOA.js","/assets/Kelish-CtiPUdgy.js","/assets/KpiDeltaCard-BZGwaUNF.js","/assets/LangTextInput-Dl5hv6qz.js","/assets/Layout-NTpfECkZ.js","/assets/LeaderAppeal-CtiOJXae.js","/assets/LeaderDayReport-BFpLEv0z.js","/assets/LeaderUnitReport-CowQ9Hzg.js","/assets/Leaderboard-BGARvuYW.js","/assets/Leaders-DWT8zG0Z.js","/assets/LeadersKpi-wZUdencp.js","/assets/Lightbox-B7dWhmMN.js","/assets/LiveOverview-CDE0QK3T.js","/assets/Login-B0w_ULJg.js","/assets/NotFound-ndPcLVxY.js","/assets/Notifications-BDy4-3pt.js","/assets/Ontime-DrvjYRr0.js","/assets/Overview-CAAOnrK3.js","/assets/Pagination-DtHSoVFr.js","/assets/PerenaladkaFactTable-D1Lz3UFh.js","/assets/PersonCard-DFEm33Au.js","/assets/PlanFulfillment-CAbaU8Ap.js","/assets/Production-C8e5s800.js","/assets/Profile-CJDHPFzk.js","/assets/ProofCamera-bjl-9728.js","/assets/ProofPhoto-DzWF-BYR.js","/assets/Quality-BGA17_g5.js","/assets/RawRows-Di5gVW5W.js","/assets/Reports-CoHnYqwj.js","/assets/RequestStateChip-BDhVOHop.js","/assets/RichTextEditor-ClcLKgUt.js","/assets/SaveState-BJJlc8jC.js","/assets/SearchInput-Dd_5Z-Zm.js","/assets/SeasonalityHeatmap-DjTP5nr8.js","/assets/SegmentedToggle-BjbWBXvz.js","/assets/SetupTimes-S7a_NhQA.js","/assets/ShiftDaily-CjKRpPYT.js","/assets/Staff-D4zaHLP4.js","/assets/StaffListAtCheck-S1tHEOLa.js","/assets/StatusBadge-Ca_s9Dm2.js","/assets/StatusBandsModal-Br0aGCzx.js","/assets/TargetGoal-CR39LkzL.js","/assets/Targets-YmlNyRam.js","/assets/Tasks-DRUol5J3.js","/assets/TimeWheelPicker-DLrnDFX6.js","/assets/Toast-DlNsD52S.js","/assets/Tooltip-DMi7WSnD.js","/assets/TrendChart-DIv2yseE.js","/assets/TripleSpeedometer--WBtcn9r.js","/assets/Trudoyomkost-DwsMhEKt.js","/assets/UploadDropzone-Bin0rD-j.js","/assets/UsersActivity-BxegRGnt.js","/assets/VerdictBlock-Wk2di4kp.js","/assets/VfxApiMap-Cijn-Bkx.js","/assets/VfxDictionaries-4xeaOrWT.js","/assets/VfxEmployees-Dyd4uGCf.js","/assets/VfxHrMoves-pQDOhdij.js","/assets/VfxJobs-BNm83iop.js","/assets/VfxPhoto-C3tkhGsa.js","/assets/VfxShifts-nILFceGu.js","/assets/VfxState-BS_t1fcg.js","/assets/VfxTimebooks-VdeMUgAK.js","/assets/VfxTimesheet-BjGJNCKO.js","/assets/WatchProgress-B_HLX6PE.js","/assets/WebLogin-ClJQ5Wx6.js","/assets/Workers-cIxExxbS.js","/assets/Zagruzka-UMZGc94N.js","/assets/ZagruzkaCell-p8T_xKos.js","/assets/api-BFm7MSgf.js","/assets/archive-C-ctDqpu.js","/assets/archive-restore-DnrgL0Ud.js","/assets/arrow-down-C_l8XhUL.js","/assets/arrow-down-right-ZWdSW2Yn.js","/assets/arrow-down-wide-narrow-D0eG77KT.js","/assets/arrow-up-narrow-wide-DHLWjfGU.js","/assets/ban-BBhwFx5J.js","/assets/boxes-D-uncQC6.js","/assets/braces-DczJaba3.js","/assets/brigadirFilters-BETEyCUy.js","/assets/broadcastTree-M9ONnS7A.js","/assets/building-2-wXjK1s0y.js","/assets/calendar-_V-LYVre.js","/assets/calendar-days-CqSijtEL.js","/assets/camera-CJ37pQdA.js","/assets/categories-C9sEpkfO.js","/assets/cellMoveRefusal-v_9O4Aer.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BFjz-1b7.js","/assets/chart-line-DqSqCo5H.js","/assets/chart-pie-Df0GQRMx.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-CvTieKi2.js","/assets/chevron-left-Bo6REkfA.js","/assets/chevrons-up-down-DdL__prz.js","/assets/circle-DjtzB3BJ.js","/assets/circle-alert-17cqf5P_.js","/assets/circle-check-big-Bb-APJcO.js","/assets/circle-dashed-CjRLx5s8.js","/assets/circle-minus-PoFUeX9J.js","/assets/circle-question-mark-DFlkI7q_.js","/assets/circle-slash-DN3XoaC2.js","/assets/circle-user-round-DFEpGb0V.js","/assets/cloud-off-BSyuayM3.js","/assets/cloud-upload-BHReal7l.js","/assets/coins-DyWP9ZZF.js","/assets/compass-BpsgPPQB.js","/assets/concernCategories-DZWYEVXS.js","/assets/corner-down-right-DRsCBbV4.js","/assets/createLucideIcon-BNvvYre1.js","/assets/en-OWNVVKqf.js","/assets/es-Dtgc5NM1.js","/assets/external-link-Dp4lgEAz.js","/assets/file-clock-BDSFZ7qC.js","/assets/file-exclamation-point-Uosi7DAl.js","/assets/flag-ZxRM8NsJ.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Bl6vMju3.js","/assets/funnel-CrhyCS1B.js","/assets/hash-CvaRVyDv.js","/assets/hourglass-DYlbwf2b.js","/assets/idleTime-CHPnJRpw.js","/assets/image-ffX6zN6s.js","/assets/image-off-0qIa5cgz.js","/assets/inbox-CDpVPSE5.js","/assets/index-BtYmuUYW.css","/assets/index-cm7alz1Z.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DsLsGJi3.js","/assets/languages-CQAezA5u.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-ZD_5S6T2.js","/assets/leaderBoard-BqL-v-aL.js","/assets/lightbulb-LyeRRn7V.js","/assets/link-2-CqAdC4sC.js","/assets/link-2-off-D3lleY0O.js","/assets/list-ordered-BqZ02FE7.js","/assets/list-tree-Bn69u6ki.js","/assets/lock-open-D31k7udI.js","/assets/log-in-uomeO4x-.js","/assets/map-pin-B6nYP5rf.js","/assets/marks-CFNaRXn_.js","/assets/minimize-2-D9MbmS7k.js","/assets/package-check-iZs7MPLi.js","/assets/pencil-f7jqZLa_.js","/assets/percent-DpIGHP7T.js","/assets/pin-CULMBk__.js","/assets/pin-off-2OOUQovC.js","/assets/play-2asf6cux.js","/assets/plug-zap-Cp7V08JC.js","/assets/prop-types-RD3fbola.js","/assets/radio-CA3kOvFy.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-D9n8A_IN.js","/assets/repeat-B7KgbfZI.js","/assets/ru-CFuSmE6s.js","/assets/save-B0dLWv5G.js","/assets/scopeLinks-CazxCIkz.js","/assets/scroll-text-Di-fVigh.js","/assets/search-x-D3cjPYbS.js","/assets/segments-D5Uiedtv.js","/assets/send-Bp37JQly.js","/assets/settings-2-BoN3UjOS.js","/assets/shield-DcgvTaJ5.js","/assets/shield-alert-Dr48Ig9J.js","/assets/shield-question-mark-KO5KadA2.js","/assets/sigma-DBCy9AXa.js","/assets/siren-Di4qwaQe.js","/assets/snowflake-C-00jFpy.js","/assets/split-B5H4ds7m.js","/assets/square-check-big-oqgJdAXI.js","/assets/star-B2E0wU83.js","/assets/statusBands-DVBZcBq3.js","/assets/store-BQAVdI8l.js","/assets/table-2-Dyq8EIev.js","/assets/table-properties-DCC5_SlS.js","/assets/tag-Ddn2vNXy.js","/assets/timer-off-TwT2VGUV.js","/assets/translations-D_fKIQol.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-B5zuSf3J.js","/assets/trending-up-CvHYYArC.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-8LBeYdEz.js","/assets/useChartTheme-Db5FErHK.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-Bj0LAv4k.js","/assets/useStatusBands-DLZGXqhP.js","/assets/useUrlScope-DSJXr07z.js","/assets/user-C88GPIj-.js","/assets/user-cog-oYbJdshN.js","/assets/user-minus-N0xu1uQo.js","/assets/users-B_90nFki.js","/assets/uz-CzQeGOsJ.js","/assets/uz_cyrl-DV8_N4__.js","/assets/vfx-BTMwqTXb.js","/assets/video-Dial-kui.js","/assets/wallet-DnZaHl0Q.js","/assets/warehouse-BAQJumW4.js","/assets/workflow-DWIkENan.js","/assets/x-6O4WRWQE.js","/assets/zap-MXV_6SMP.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
