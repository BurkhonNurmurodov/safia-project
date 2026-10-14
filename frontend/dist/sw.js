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

const BUILD = "2026-10-14T16:25:25.483Z";
const PRECACHE = ["/","/assets/AdminPanel-uqWWudhH.js","/assets/AnalysisBoard-CKX4jbqG.js","/assets/Arc-OsmQV9Xw.js","/assets/Assistant-BhH4Pam5.js","/assets/BrigadirProfile-CgYbH9kO.js","/assets/BroadcastReceivers-DE5YY21-.js","/assets/BroadcastRecord-B-cO0W-b.js","/assets/Button-CCKxnzwg.js","/assets/CatLockNotice-C1qDFWge.js","/assets/CategoryLegendModal-D_1rAECq.js","/assets/CellConcerns-CBG0c5Hv.js","/assets/CellDetails-CgZ7IzX2.js","/assets/CellFormModal-DsABLT-g.js","/assets/CellIdent-DhphE8eI.js","/assets/CellLink-9WKdg3QQ.js","/assets/Cells-BoHXuQDF.js","/assets/ColumnFilter-T7R_Zasq.js","/assets/ColumnsPicker-CfgJaQ8g.js","/assets/CommentsModal-CCSZihUI.js","/assets/ComparisonTable-D-6L1Dgy.js","/assets/Concerns-CZAa5ibh.js","/assets/CountStepper-B5IkpZ2w.js","/assets/Daily-BCEUIzZn.js","/assets/DataTable-mLpfi2Nk.js","/assets/DateRangePicker-CiZGQ3Al.js","/assets/DayReportView-SK-ArXmd.js","/assets/DayStepper-CIWzc7bj.js","/assets/DifferenceBreakdown-DaSta-40.js","/assets/Downtime-CNi19qLl.js","/assets/Education-Ch8o11sO.js","/assets/EducationLesson-CqvnDVWX.js","/assets/EmptyState-BIxxtr-2.js","/assets/Exam-BtJU9jnm.js","/assets/FactorySelect-8FA6g2Ra.js","/assets/Gamification-o3HjxCwB.js","/assets/GroupBadge-BPlCTG3y.js","/assets/HeatmapChart-DcHPfUcU.js","/assets/IdleCell-BY6ftuyj.js","/assets/KPICard-DTH0e2Ey.js","/assets/Kaizen-oAHzAvDC.js","/assets/Kelish-B0a42oxl.js","/assets/KpiDeltaCard-BnFOLD6r.js","/assets/LangTextInput-B5F5Y4pU.js","/assets/Layout-DAmQhdlL.js","/assets/LeaderAppeal-CLzzs8TV.js","/assets/LeaderDayReport-C1Gls9xj.js","/assets/LeaderUnitReport-Bczwm-Qi.js","/assets/Leaderboard-Dy1Z9gBj.js","/assets/Leaders-CSnzPZ8k.js","/assets/Lightbox-CBSKiUmg.js","/assets/LiveOverview-CY-MCQq2.js","/assets/Login-BPIktuDZ.js","/assets/NotFound-DFefPyEK.js","/assets/Notifications-DQLZiYKX.js","/assets/Overview-CLa7sFem.js","/assets/Pagination-ouWY0X4r.js","/assets/PerenaladkaFactTable-B3nBpHEf.js","/assets/PersonCard-ChEHBZkF.js","/assets/PlanFulfillment-CfUwbZ-I.js","/assets/Production-Yzf5uGhB.js","/assets/Profile-DlG-GHZD.js","/assets/ProofCamera-DNlFwY49.js","/assets/Quality-DD7U5d9E.js","/assets/RawRows-ocw5kNAP.js","/assets/RequestStateChip-D71jJxQy.js","/assets/RichTextEditor-B5UmJ0N2.js","/assets/SaveState-DJSlHIg2.js","/assets/SearchInput-DJII5MTx.js","/assets/SeasonalityHeatmap-DbKmQB7f.js","/assets/SegmentedToggle-CGFm_3hY.js","/assets/SetupTimes-CixzyB8r.js","/assets/ShiftDaily-B4wMY4mc.js","/assets/Staff-BysTSAQW.js","/assets/StaffListAtCheck-BOiXC52F.js","/assets/StatusBadge-CjvZoeWc.js","/assets/TargetGoal-9qL9RqkN.js","/assets/Targets-BxeRA1oz.js","/assets/Tasks-2dkjs9Bq.js","/assets/TimeWheelPicker-CLN7HUny.js","/assets/Toast-PCTi6zmG.js","/assets/Tooltip-8RTiE4iL.js","/assets/TrendChart-BOgJDdPp.js","/assets/TripleSpeedometer-DFuVcD-y.js","/assets/Trudoyomkost-a1-WlLjZ.js","/assets/Turnover-DaGGdAFu.js","/assets/UploadDropzone-BTE2JDB2.js","/assets/UsersActivity-yrT7TVW2.js","/assets/VerdictBlock-CppmvzSq.js","/assets/VfxApiMap-CcqijK_5.js","/assets/VfxDictionaries-1neWlyUa.js","/assets/VfxEmployees-BMYmDxRT.js","/assets/VfxHrMoves-BK3GRQFx.js","/assets/VfxJobs-DmsHktkW.js","/assets/VfxPhoto-eM3ONWg-.js","/assets/VfxShifts-BDAI5JBg.js","/assets/VfxState-DqRGBLlf.js","/assets/VfxTimebooks-BlzyFGJ8.js","/assets/VfxTimesheet-DZ-O45Ub.js","/assets/WatchProgress-BFzqagmz.js","/assets/WebLogin-CVLOTmzz.js","/assets/WorkerConcerns-DKcPld7-.js","/assets/Workers-Hr1gCOBq.js","/assets/Zagruzka-T0uCMfuL.js","/assets/ZagruzkaCell-BrcgE7oo.js","/assets/api-htUvwurd.js","/assets/archive-B9yuTgIw.js","/assets/archive-restore-CNotQd7A.js","/assets/arrow-down-200IFdSC.js","/assets/arrow-down-wide-narrow-DvsuS00R.js","/assets/arrow-up-narrow-wide-_9fjMQir.js","/assets/award-D6g-4_9t.js","/assets/ban-BtNcYd70.js","/assets/boxes-Dw_rwORG.js","/assets/braces-Ct0NlKwB.js","/assets/brigadirFilters-BynPwaXA.js","/assets/broadcastTree-kSV3DIxi.js","/assets/building-2-DFW2kfSn.js","/assets/calculator-CAjAUcim.js","/assets/calendar-days-CG_q6A29.js","/assets/calendar-jyHm0rXK.js","/assets/camera-DPL-RtkF.js","/assets/categories-C5FsSUUG.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-he8JOl01.js","/assets/chart-line-wWFITM2q.js","/assets/chart-pie-GbnGUp6S.js","/assets/chartRange-BTe-_G2h.js","/assets/check-check-AUOFXKG1.js","/assets/chevron-left-BeVrkUEC.js","/assets/chevrons-up-down-Cg7dhudL.js","/assets/circle-BXSG840H.js","/assets/circle-alert-D9rHejVm.js","/assets/circle-check-big-CurXRMIi.js","/assets/circle-dashed-B48R4y9L.js","/assets/circle-minus-COnIQWjg.js","/assets/circle-question-mark-Bt-PHJRk.js","/assets/circle-slash-5ZGhOVG6.js","/assets/circle-user-round-kkHY-OEl.js","/assets/clock-3-D1y2DmDO.js","/assets/cloud-off-Dkr5I9Ra.js","/assets/cloud-upload-BKd_Nlr5.js","/assets/compass-nUPEk533.js","/assets/concernCategories-C5v0JEht.js","/assets/copy-BKKiJ6wq.js","/assets/corner-down-right-D1WZR5-W.js","/assets/createLucideIcon-DkGruET1.js","/assets/es-BOlADX51.js","/assets/external-link-CfOvFn1E.js","/assets/file-clock-CSgiiyM6.js","/assets/file-exclamation-point-DnMpUKzJ.js","/assets/flag-CnuCDIAR.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BodEeF9R.js","/assets/hash-DKHUhqb4.js","/assets/hourglass-Cq4exc6L.js","/assets/image-CuCrDiue.js","/assets/image-off-T4bece60.js","/assets/inbox-BHCeGgUw.js","/assets/index-C_1PhZNF.js","/assets/index-oN3ajqAx.css","/assets/keyboard-DEinVOSl.js","/assets/languages-DlmplqE7.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Bzh8VadL.js","/assets/lightbulb-DDVp9jJr.js","/assets/link-2-CXmQAhv8.js","/assets/link-2-off-C7Zh4Jnv.js","/assets/list-ordered-8ZyeXd0v.js","/assets/list-tree-fMkOGu1Z.js","/assets/lock-open-CsXfB1m0.js","/assets/log-in-CrVJDfCZ.js","/assets/marks-CdqAISI5.js","/assets/minimize-2-DFl9Z3XC.js","/assets/package-check-BB8_9miL.js","/assets/pencil-6Ojx7iNN.js","/assets/percent-6k-h_snn.js","/assets/pin-BMJLz7r_.js","/assets/pin-off-C7pxKbqZ.js","/assets/play-7II7yLDN.js","/assets/plug-zap-DllANCQw.js","/assets/prop-types-CVeitRwj.js","/assets/radio-Cx9zLMRJ.js","/assets/react-apexcharts.esm-BdJ15Z_k.js","/assets/registers-BasUKBXs.js","/assets/repeat-Bb3UEhbo.js","/assets/save-CRtF5t9C.js","/assets/scopeLinks-lf6Hhi1Q.js","/assets/scroll-text-BZP2Ip0d.js","/assets/search-x-6TMoFOTk.js","/assets/segments-2S_iAe1y.js","/assets/send-CMm2c0X4.js","/assets/settings-2-Crmzs9Cq.js","/assets/shield-13LdJK4D.js","/assets/shield-alert-BfFxypVh.js","/assets/shield-question-mark-BZ8Z6Gos.js","/assets/siren-CehOsBZP.js","/assets/snowflake-BvDwsZ6X.js","/assets/split-DS4EQ_1f.js","/assets/square-check-big-Ci4sClCz.js","/assets/star-Cy0JTpLA.js","/assets/statusBands-DY9Xbzsq.js","/assets/store-DMiqOcGk.js","/assets/table-2-6fJm6B-u.js","/assets/table-properties-CuY_nJRJ.js","/assets/tag-B-ev97kp.js","/assets/timer-off-C1tBEU2h.js","/assets/trending-down-C_6dKzbp.js","/assets/trending-up-BavTVMpq.js","/assets/undo-2--ausgq6c.js","/assets/useChartTheme-DcJP9hlG.js","/assets/useElementWidth-BuBmesjy.js","/assets/useIsMobile-Dvpp7652.js","/assets/useOpenParam-BHR7cwpE.js","/assets/useStatusBands-D6RihKcG.js","/assets/useUrlScope-B1dfaage.js","/assets/user-DkWG2wOT.js","/assets/user-cog-DF48wpOd.js","/assets/users-CZEUuTSt.js","/assets/vfx-BqgEiFVd.js","/assets/video-BTRfe29m.js","/assets/wallet-CwjD9AM5.js","/assets/warehouse-C11GFY4h.js","/assets/workflow-BWnZx7pL.js","/assets/x-DlgwsoPb.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
