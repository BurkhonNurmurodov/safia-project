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

const BUILD = "2026-10-10T13:22:51.953Z";
const PRECACHE = ["/","/assets/AdminPanel-DiitLums.js","/assets/AnalysisBoard-DcZuq74J.js","/assets/Arc-nZSI0TUQ.js","/assets/Assistant-CeK94Q4Y.js","/assets/BrigadirProfile-C1FUbbKO.js","/assets/BroadcastReceivers-DI9d7SEi.js","/assets/BroadcastRecord-DbyuU08R.js","/assets/Button-SU44P1cT.js","/assets/CatLockNotice-hz5wIcBJ.js","/assets/CategoryLegendModal-CNMqWNln.js","/assets/CellConcerns-BcQUTuD6.js","/assets/CellDetails-DFcDwhfE.js","/assets/CellFormModal-BDjmrtJX.js","/assets/CellIdent-B-Jb-QYq.js","/assets/CellLink-BfAD8yLL.js","/assets/Cells-DbP7yqtz.js","/assets/ColumnFilter-Cvvhvyx4.js","/assets/ColumnsPicker-D2Pl0JGy.js","/assets/CommentsModal-MueGPdHr.js","/assets/ComparisonTable-DJ45YUlx.js","/assets/Concerns-89mp1f26.js","/assets/Daily-BiEvxYJA.js","/assets/DataTable-BKY_lkJB.js","/assets/DateRangePicker-Bf--qCXP.js","/assets/DayReportView-DiJtwsl3.js","/assets/DayStepper-DMVWEiZp.js","/assets/DifferenceBreakdown-0xy-PLuO.js","/assets/Downtime-CrvQ2Vvp.js","/assets/Education-CqiU_ALN.js","/assets/EducationLesson-2wtMXTeP.js","/assets/EmptyState-BDfPHyEO.js","/assets/Exam-BUVfi0zJ.js","/assets/FactorySelect-IzUpzune.js","/assets/Gamification-BnDixWSg.js","/assets/GroupBadge-C7VqM6SI.js","/assets/HeatmapChart-B9dkhRhe.js","/assets/IdleCell-79ng2Grg.js","/assets/KPICard-cflwonnW.js","/assets/Kaizen-CpJjXciy.js","/assets/Kelish-BV6cRR6X.js","/assets/KpiDeltaCard-FWk6Yfbj.js","/assets/LangTextInput-DoLAqfx-.js","/assets/Layout-BvHAPiaQ.js","/assets/LeaderAppeal-BF1U_t-a.js","/assets/LeaderDayReport-CFTOkztn.js","/assets/LeaderUnitReport-DAkbNtGU.js","/assets/Leaderboard-DMXHaMe1.js","/assets/Leaders-CDwMi7gS.js","/assets/Lightbox-6X7hAYhN.js","/assets/LiveOverview-DY2tQ00V.js","/assets/Login-q8oh1gZ2.js","/assets/NotFound-D8jE9qz6.js","/assets/Notifications-D28TAH6m.js","/assets/Overview-BC2I2mBf.js","/assets/Pagination-36SO19e4.js","/assets/PerenaladkaFactTable-DwgW-sK_.js","/assets/PersonCard-eotT6HUK.js","/assets/PlanFulfillment-rzxMDb7k.js","/assets/Production-BJCBQZUQ.js","/assets/Profile-BPh1IyvM.js","/assets/ProofCamera-pnSaob0y.js","/assets/ProofPhoto-BKKCLsnO.js","/assets/Quality-DdzpzKQI.js","/assets/RawRows-jWrQ7kNQ.js","/assets/RequestStateChip-qL3gZO9A.js","/assets/RichTextEditor-Dm1UwAdo.js","/assets/SaveState-kgWLYGoA.js","/assets/SearchInput-Y69zCkiA.js","/assets/SeasonalityHeatmap-Cqxqfrc_.js","/assets/SegmentedToggle-CxmW_Kxp.js","/assets/SetupTimes-D8eTS1mh.js","/assets/ShiftDaily-CmG532QS.js","/assets/Staff-DKWfDhVR.js","/assets/StatusBadge-2fSi647C.js","/assets/TargetGoal-EIW64Dfh.js","/assets/Targets-Bi8oq99e.js","/assets/Tasks-CVtCba-i.js","/assets/TimeWheelPicker-Ymp9xx5u.js","/assets/Toast-G1HqVX86.js","/assets/Tooltip-CZ-_90D5.js","/assets/TrendChart-Btur7KhO.js","/assets/TripleSpeedometer-C3csuSQ4.js","/assets/Trudoyomkost-DLOBAvl7.js","/assets/Turnover-I8Iud6Nx.js","/assets/UploadDropzone-BcIpRG0A.js","/assets/UsersActivity-e5rBAPq1.js","/assets/VerdictBlock-Ce-fvoAC.js","/assets/VfxApiMap-saHpj8sq.js","/assets/VfxDictionaries-Ujz-sXfT.js","/assets/VfxEmployees-SbEdz0Mo.js","/assets/VfxHrMoves-DWCIksvJ.js","/assets/VfxJobs-B5dRHf2F.js","/assets/VfxPhoto-Cnpmynw-.js","/assets/VfxShifts-Bqgd3RG0.js","/assets/VfxState-4LyWtqWY.js","/assets/VfxTimebooks-58YSg5eN.js","/assets/VfxTimesheet-CcUe8ioJ.js","/assets/WatchProgress-JOMFHySK.js","/assets/WebLogin-BxovcTuL.js","/assets/WorkerConcerns-D4v4DmFQ.js","/assets/Workers-DuMB_wDr.js","/assets/Zagruzka-CisqNL5q.js","/assets/ZagruzkaCell-C8RndMVh.js","/assets/api-DepZaMuU.js","/assets/archive--9rHaTLh.js","/assets/archive-restore-BBaLsunh.js","/assets/arrow-down-CrI-hYxB.js","/assets/arrow-down-wide-narrow-DKdUWgCR.js","/assets/arrow-up-narrow-wide-x5CAVHkx.js","/assets/award-B19zoejL.js","/assets/ban-BE1c6klk.js","/assets/boxes-Dh58hj_D.js","/assets/braces-BUKe4D41.js","/assets/brigadirFilters-BvMgZ4xY.js","/assets/broadcastTree-DgS2Tupu.js","/assets/building-2-f5kEGjj0.js","/assets/calculator-CDnrJuL8.js","/assets/calendar-Cg3DxRaa.js","/assets/calendar-days-B2KXjPKC.js","/assets/camera-NblQEPv7.js","/assets/categories-uQa2cgqN.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BkdUQGvI.js","/assets/chart-line-BgqY-_H4.js","/assets/chart-pie-WAg7VK8C.js","/assets/chartRange-CArIR_0-.js","/assets/check-check-CpJXzE17.js","/assets/chevron-left-DmVHpewl.js","/assets/chevrons-up-down-Clxwie3r.js","/assets/circle-BL_qN3uh.js","/assets/circle-alert-CUyb10P9.js","/assets/circle-check-big-BsE-W9tm.js","/assets/circle-dashed-DeXKimhw.js","/assets/circle-minus-DNHdSRkj.js","/assets/circle-question-mark-B0f50J9d.js","/assets/circle-slash-BRU2tN1X.js","/assets/circle-user-round-El6mjwuu.js","/assets/clock-3-DGC17sR5.js","/assets/cloud-off-DappatMS.js","/assets/cloud-upload-DjC9_XOf.js","/assets/compass-BRgPfItE.js","/assets/concernCategories-DiZ6kB7D.js","/assets/copy-Cjg0bQmq.js","/assets/corner-down-right-DGgnhcrr.js","/assets/createLucideIcon-CX2AbfHY.js","/assets/es-skz6hnld.js","/assets/external-link-D6d5008S.js","/assets/file-clock-C_y0uDxg.js","/assets/file-exclamation-point-B4mtA_dU.js","/assets/flag-yrppAPF3.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-UW9nZPHB.js","/assets/hash-DdtmufW3.js","/assets/hourglass-DCvhQct7.js","/assets/image-COEpQcxU.js","/assets/image-off-CjNmB4fL.js","/assets/inbox-DJGtilZx.js","/assets/index-CWt4Vfz1.js","/assets/index-CjwMJYxm.css","/assets/keyboard-BJ846x3q.js","/assets/languages-BBzcv3E4.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-ftlJooVg.js","/assets/lightbulb-BlEZoJRO.js","/assets/link-2-DmyilNYJ.js","/assets/link-2-off-DhtyTRPC.js","/assets/list-ordered-BRMYhJX2.js","/assets/list-tree-C6dvS3Bd.js","/assets/lock-open-COve6fpb.js","/assets/log-in-CGBmLcbS.js","/assets/minimize-2-hIfLUC_N.js","/assets/package-check-D-8g0qd2.js","/assets/pencil-BGVPmGEM.js","/assets/percent-DbTaWMKu.js","/assets/pin-2CvJBa8A.js","/assets/pin-off-BP0wor6N.js","/assets/play-DsEI4YB7.js","/assets/plug-zap-DWVR__uC.js","/assets/prop-types-Dg1KUW9Q.js","/assets/radio-qDM56A0_.js","/assets/react-apexcharts.esm-Dqgy9Sjc.js","/assets/registers--SPK12d9.js","/assets/repeat-DL-Z88m9.js","/assets/save-D6Yc-1FF.js","/assets/scopeLinks-BfIgvuju.js","/assets/scroll-text-BOKddWgm.js","/assets/search-x-mwIg-EPU.js","/assets/segments-NUcKh9so.js","/assets/send-DKpVtNQp.js","/assets/settings-2-CWamhmfg.js","/assets/shield-Zbs_IJ2I.js","/assets/shield-alert-BgT0EJPJ.js","/assets/shield-question-mark-DcwEXi8X.js","/assets/siren-CVVqCHXQ.js","/assets/snowflake-Bq4geS2J.js","/assets/split-B8d8tjwf.js","/assets/square-check-big-DQBQe_6q.js","/assets/star-BbtBtpDm.js","/assets/statusBands-DnPFFOLu.js","/assets/store-4ymQoz8H.js","/assets/table-2-CXP28Q1d.js","/assets/table-properties-Cq0Udpai.js","/assets/tag-oNM-mgc0.js","/assets/timer-off-Evo2MHky.js","/assets/trending-down-DXWxX3Vr.js","/assets/trending-up-BhvPlm8T.js","/assets/undo-2-BxPslp4T.js","/assets/useChartTheme-CMe5h-Fi.js","/assets/useElementWidth-MtVGEWCA.js","/assets/useIsMobile-CnwNTEvE.js","/assets/useOpenParam-Cb5UsB4i.js","/assets/useStatusBands-3oABark2.js","/assets/useUrlScope-D5fj6Fgf.js","/assets/user-cog-CZb-M_fD.js","/assets/user-nJ8sy_Ur.js","/assets/users-dTzq49XG.js","/assets/vfx-_oI-355W.js","/assets/video-DL-Tcg4j.js","/assets/wallet-BpzFFjim.js","/assets/warehouse-DnID4max.js","/assets/workflow-RrB01nwW.js","/assets/x-IawcSlsF.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
