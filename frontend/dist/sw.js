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

const BUILD = "2026-10-08T05:25:57.674Z";
const PRECACHE = ["/","/assets/AdminPanel-CQWHk0fp.js","/assets/AnalysisBoard-CK-Sc5v7.js","/assets/Arc-COchl5ym.js","/assets/Assistant-CZPRGTDm.js","/assets/BrigadirProfile-1qdacBMm.js","/assets/BroadcastReceivers-6zqIsHnY.js","/assets/BroadcastRecord-Cobbk0nt.js","/assets/Button-CAzvygKU.js","/assets/CatLockNotice-Cu6JMh0_.js","/assets/CategoryLegendModal-BJWFaOLk.js","/assets/CellConcerns-DU2Lq6BH.js","/assets/CellDetails-DG9MlvLz.js","/assets/CellFormModal-DIyqaTRc.js","/assets/CellIdent-CK1pM3gA.js","/assets/CellLink-CZxbbG1-.js","/assets/Cells-DisrwGyX.js","/assets/ColumnFilter-D2Tf_82b.js","/assets/ColumnsPicker-BLRoNqQT.js","/assets/CommentsModal-DuwmrGvv.js","/assets/ComparisonTable-D8PwgIMb.js","/assets/Concerns-Bwxdzr8S.js","/assets/Daily-CANUr4O3.js","/assets/DataTable-B9xDS_3g.js","/assets/DateRangePicker-DZQTvmFm.js","/assets/DayReportView-O_1XCam5.js","/assets/DayStepper-DEhgzepv.js","/assets/DifferenceBreakdown-4SChHmrj.js","/assets/Downtime-BrAv2nki.js","/assets/Education-BqwMsnou.js","/assets/EducationLesson-C1FHTLbI.js","/assets/EmptyState-BOkdceJA.js","/assets/Exam-t7Vqf0LN.js","/assets/FactorySelect-BYA7eKwP.js","/assets/Gamification-OtDHbWMb.js","/assets/GroupBadge-x2-D9mxg.js","/assets/HeatmapChart-DOjBtD1Q.js","/assets/IdleCell-fBLpUrbd.js","/assets/KPICard-CP4qbP5R.js","/assets/Kaizen-BCU3NZ-B.js","/assets/Kelish-CLY7Xqz0.js","/assets/KpiDeltaCard-CmsTEYTZ.js","/assets/LangTextInput-Di3lyK05.js","/assets/Layout-D0cocrVm.js","/assets/LeaderAppeal-CBU2cUlB.js","/assets/LeaderDayReport-Gd44kH7R.js","/assets/LeaderUnitReport-CpQ2MpZo.js","/assets/Leaderboard-BcSMEtRp.js","/assets/Leaders-CwRrpqL6.js","/assets/Lightbox-tbFw_yFQ.js","/assets/LiveOverview-DQB3I1KB.js","/assets/Login-D0PAwWsZ.js","/assets/NotFound-DUHmOdQ5.js","/assets/Notifications-Cbe6EHEH.js","/assets/Overview-B4-dnPhx.js","/assets/Pagination-B0bWdw5Q.js","/assets/PerenaladkaFactTable-CwXKTxXG.js","/assets/PersonCard-DGNxHjDg.js","/assets/PlanFulfillment-Bj1ZahsK.js","/assets/Production-D7fm8SwJ.js","/assets/Profile-CZBzaxMI.js","/assets/ProofCamera-B2IyhNvT.js","/assets/ProofPhoto-D9iQAczP.js","/assets/Quality-CMVyUYW8.js","/assets/RawRows-DuCHSWVK.js","/assets/RequestStateChip-wfOPN1VU.js","/assets/RichTextEditor-CDil7The.js","/assets/SaveState-BNu99dm0.js","/assets/SearchInput-BhT4wWSR.js","/assets/SeasonalityHeatmap-CMbCm1IM.js","/assets/SegmentedToggle-Be8OoVoh.js","/assets/SetupTimes-Cp_1FtqF.js","/assets/ShiftDaily-BnjMU78n.js","/assets/Staff-BamoQcZe.js","/assets/StatusBadge-BLENGsGn.js","/assets/TargetGoal-SAAsN4Js.js","/assets/Targets-CWBplzf-.js","/assets/Tasks-Cip0hQ6s.js","/assets/TimeWheelPicker-IcDotWc7.js","/assets/Toast-COdGdTJE.js","/assets/Tooltip-DfPOGqMF.js","/assets/TrendChart-D22PuHRz.js","/assets/TripleSpeedometer-DVpGTtAc.js","/assets/Trudoyomkost-2b0UhEZq.js","/assets/Turnover-BO0ddlG0.js","/assets/UploadDropzone-BKg0_lxm.js","/assets/UsersActivity-DGbURKxi.js","/assets/VerdictBlock-Dy_oqYfD.js","/assets/VfxApiMap-5T-LyKRf.js","/assets/VfxDictionaries-B52A3Nzq.js","/assets/VfxEmployees-BIWxJm_U.js","/assets/VfxHrMoves-A5v87BLB.js","/assets/VfxJobs-DC6Dm4Mc.js","/assets/VfxPhoto-Ca6Lwycj.js","/assets/VfxShifts-DT5mxgyg.js","/assets/VfxState-Bm_CouOl.js","/assets/VfxTimebooks-B-CelW2q.js","/assets/VfxTimesheet-B704aww2.js","/assets/WatchProgress-CHH5UDG2.js","/assets/WebLogin-C5bFGbiJ.js","/assets/WorkerConcerns-C2EWfNG7.js","/assets/Workers-BQAxPffH.js","/assets/Zagruzka-BhJdjgb_.js","/assets/ZagruzkaCell-Bx00eNvG.js","/assets/api-pgWJ38m5.js","/assets/archive-BZyUj-K-.js","/assets/archive-restore-CctJC0bY.js","/assets/arrow-down-DzV62DOo.js","/assets/arrow-up-narrow-wide-BdBCVN4I.js","/assets/award-Cyc3FO-q.js","/assets/ban-DGLHY-WO.js","/assets/boxes-DG6J5RD9.js","/assets/braces-xQ8N4pmL.js","/assets/brigadirFilters-BkJx2g92.js","/assets/broadcastTree-DtkXR47r.js","/assets/building-2-BuiBo9DJ.js","/assets/calculator-rdgynmWI.js","/assets/calendar-CVfqwQsx.js","/assets/calendar-days-DZRmbvhb.js","/assets/camera-rPyQDCFV.js","/assets/categories-BQY3-u5x.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DyFyKpJ1.js","/assets/chart-line-BdUNxJv4.js","/assets/chart-pie-D2wePV2a.js","/assets/chartRange-DnxhxvVO.js","/assets/check-check-BJIEDi4s.js","/assets/chevron-left-7lBJmreu.js","/assets/chevrons-up-down-CV39348U.js","/assets/circle-CE73SRmY.js","/assets/circle-alert-ChAMs1UI.js","/assets/circle-check-big-CIDPnnFJ.js","/assets/circle-dashed-B1HYUzEJ.js","/assets/circle-minus-oO5jEYvw.js","/assets/circle-question-mark-C_jUDdet.js","/assets/circle-slash-DMwqrDsS.js","/assets/circle-user-round-Cd2hQwRU.js","/assets/clock-3-BxWy_gJ3.js","/assets/cloud-off-YdNDjDkY.js","/assets/cloud-upload-keYmNz4f.js","/assets/compass-F8D232uq.js","/assets/concernCategories-DbDVm-1A.js","/assets/copy-BLe_sCbr.js","/assets/corner-down-right-BLzmioIb.js","/assets/createLucideIcon-2AcWahM-.js","/assets/es-Cza9q3qC.js","/assets/external-link-BBvpWmWm.js","/assets/file-clock-vJXCSVR9.js","/assets/file-exclamation-point-CYbaWkN0.js","/assets/flag-ogoBhhmm.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D2VrRxL3.js","/assets/hash-ASEo_6uU.js","/assets/hourglass-DQdyyB9h.js","/assets/image-YBWIICTa.js","/assets/image-off-CzejCPKg.js","/assets/inbox-CwWO7W-z.js","/assets/index-Ck814gz0.css","/assets/index-c97aBxFJ.js","/assets/keyboard-Dr1RTWuh.js","/assets/languages-y2uqX8mv.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DQkY1ltR.js","/assets/lightbulb-DKLHZSLn.js","/assets/link-2-B9OBrx_U.js","/assets/link-2-off-CqQmr-Kg.js","/assets/list-ordered-C0GRR0bD.js","/assets/list-tree-DrjHAj4N.js","/assets/lock-open-DyFW6PLK.js","/assets/log-in-5oxsZnVC.js","/assets/minimize-2-v4_9AbY_.js","/assets/package-check-Bs8OWaEj.js","/assets/pencil-J7BUQTp5.js","/assets/percent-DGmE-5oY.js","/assets/pin-2l6c1n1E.js","/assets/pin-off-BEnDBWbB.js","/assets/play-DeuMSXWv.js","/assets/plug-zap-BjOa2PEu.js","/assets/prop-types-DcYTgugi.js","/assets/radio-B7fj-Lsx.js","/assets/react-apexcharts.esm-CRufRGMV.js","/assets/registers-DinnZjit.js","/assets/repeat-BFhgY2Z9.js","/assets/save-BX016rDY.js","/assets/scopeLinks-CxSDi1wP.js","/assets/scroll-text-BHxTCQa4.js","/assets/search-x-BjOEMMKS.js","/assets/segments-CfplBs-z.js","/assets/send-BV_LTjBD.js","/assets/settings-2-BY0P2KK8.js","/assets/shield-D26UMmZh.js","/assets/shield-alert-BT0Clngx.js","/assets/shield-question-mark-BMCmeoTz.js","/assets/siren-BnH15T-V.js","/assets/snowflake-CFgJoWDG.js","/assets/split-DK24cSFM.js","/assets/square-check-big-CJycEEGG.js","/assets/star-CAovI6e3.js","/assets/statusBands-BKIxKenz.js","/assets/store-VDOVJ0D9.js","/assets/table-2-CYFpUkMz.js","/assets/table-properties-D-ZmyUb0.js","/assets/tag-BccUBax2.js","/assets/timer-off-CJiUwKkD.js","/assets/trending-down-Bro03jKg.js","/assets/trending-up-CXdtx9M4.js","/assets/undo-2-Cz2dNJ2E.js","/assets/useChartTheme-CfSLLMp2.js","/assets/useElementWidth-BCto-M5S.js","/assets/useIsMobile-CIC5LgB0.js","/assets/useOpenParam-BWGBIgBx.js","/assets/useStatusBands-BKBzmOlq.js","/assets/useUrlScope-BfNbWere.js","/assets/user-D4KpcXoK.js","/assets/user-cog-DD10Pv-p.js","/assets/users-DNPd34bB.js","/assets/vfx-_lX2KSYp.js","/assets/video-Dk3mmcxI.js","/assets/wallet-DzBaupbc.js","/assets/warehouse-DuX0Ufkn.js","/assets/x-CRAwJ8v0.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
