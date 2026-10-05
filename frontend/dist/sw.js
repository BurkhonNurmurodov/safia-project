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

const BUILD = "2026-10-05T19:06:37.112Z";
const PRECACHE = ["/","/assets/AdminPanel-CcTaLK4R.js","/assets/AnalysisBoard-BYgPrMAC.js","/assets/Arc-B_DINC8M.js","/assets/Assistant-D6jFk33r.js","/assets/BrigadirProfile-C4qkDgzp.js","/assets/BroadcastReceivers-C3fCTdKa.js","/assets/BroadcastRecord-D8txwhKq.js","/assets/Button-D0xW6LFw.js","/assets/CatLockNotice-BwRebw8u.js","/assets/CategoryLegendModal-zpHXEy-s.js","/assets/CellConcerns-D2WaEZzd.js","/assets/CellDetails-DhroAZms.js","/assets/CellFormModal-BntYfTvT.js","/assets/CellIdent-B7QR1t2C.js","/assets/CellLink-DFoEHuZ_.js","/assets/Cells-DP6GGzJe.js","/assets/ColumnFilter-D6cgaVEW.js","/assets/ColumnsPicker-CEEvnoED.js","/assets/CommentsModal-B9tK12Xe.js","/assets/ComparisonTable-BqbRLeFo.js","/assets/Concerns-DXtc9XY-.js","/assets/Daily-Cmn7GX-A.js","/assets/DataTable-BGj-Yojl.js","/assets/DateRangePicker-B51juVgs.js","/assets/DayReportView-BrLHCHSW.js","/assets/DayStepper-BkIOrUZN.js","/assets/DifferenceBreakdown-CHm3HiZ1.js","/assets/Downtime-DLbDidK9.js","/assets/Education--KRiVsXY.js","/assets/EducationLesson-1FBv8jfq.js","/assets/EmptyState-BAj6MlO0.js","/assets/Exam-CTDFZRpi.js","/assets/FactorySelect-fX7tTOZR.js","/assets/Gamification-B5RNhSze.js","/assets/GroupBadge-DLlRfTN7.js","/assets/HeatmapChart-DtX3v9L8.js","/assets/IdleCell-C8jJduB8.js","/assets/KPICard-CY1NJzdZ.js","/assets/Kaizen-DUOf8b8q.js","/assets/Kelish-DMwFsa5V.js","/assets/KpiDeltaCard-WCCh1vMn.js","/assets/LangTextInput-d3hT5EBI.js","/assets/Layout-DNYMKo3U.js","/assets/LeaderAppeal-DoHdVziw.js","/assets/LeaderDayReport-CYLStxen.js","/assets/LeaderUnitReport-BTHaA12d.js","/assets/Leaderboard-DyZgnfMZ.js","/assets/Leaders-BhJ6zI83.js","/assets/Lightbox-DsDHBeHi.js","/assets/LiveOverview-BKzohvY1.js","/assets/Login-BZAKMi6r.js","/assets/NotFound-BZrmWcdM.js","/assets/Notifications-cxrOqOfI.js","/assets/Overview-CWTvauLa.js","/assets/Pagination-BScdoN8c.js","/assets/PerenaladkaFactTable-xFPfvMcv.js","/assets/PersonCard-BoE4D8s_.js","/assets/PlanFulfillment-wNcNTejn.js","/assets/Production-DuYFgw05.js","/assets/Profile-DxeUsVqL.js","/assets/ProofCamera-BSwoVmKN.js","/assets/ProofPhoto-UKI0YCV3.js","/assets/Quality-DZTdYld0.js","/assets/RawRows-CbYG3xPm.js","/assets/RequestStateChip-DE3kgdYD.js","/assets/RichTextEditor-Qs9DDivc.js","/assets/SaveState-BMSlV-76.js","/assets/SearchInput-BQ8fySDA.js","/assets/SeasonalityHeatmap-DHiXQJ73.js","/assets/SegmentedToggle-B81Dj4CT.js","/assets/SetupTimes-Dt90XZJ1.js","/assets/ShiftDaily-Dpbpmhvl.js","/assets/Staff--SrzB_-f.js","/assets/StaffLive-BYpRha-I.js","/assets/StatusBadge-CoK3ElXI.js","/assets/TargetGoal-CMqFub46.js","/assets/Targets-Uz83UnSz.js","/assets/Tasks-BDEfc--i.js","/assets/TimeWheelPicker-BzeTCQum.js","/assets/Toast-BeUFZT7S.js","/assets/Tooltip-DV60T3yt.js","/assets/TrendChart-BrV4wENU.js","/assets/TripleSpeedometer-DKxOaKGB.js","/assets/Trudoyomkost-BgaKRwAb.js","/assets/Turnover-BJiKibbz.js","/assets/UploadDropzone-C2KINQyn.js","/assets/UsersActivity-C3rK4cad.js","/assets/VerdictBlock-8FdeE7dq.js","/assets/VfxApiMap-JJMHPi74.js","/assets/VfxDictionaries-BXCEA_5u.js","/assets/VfxEmployees-BgqCuuzR.js","/assets/VfxHrMoves-DW_FLjgM.js","/assets/VfxJobs-CsKqclV-.js","/assets/VfxPhoto-zB5yvXq4.js","/assets/VfxShifts-BwcAuVCN.js","/assets/VfxState-CHkxK7ZW.js","/assets/VfxTimebooks-BZdkufQi.js","/assets/VfxTimesheet-e_puZG2r.js","/assets/WatchProgress-DudtqTvN.js","/assets/WebLogin-wKkroDbI.js","/assets/WorkerConcerns-WG39Qvtr.js","/assets/Workers-gL7KXtHp.js","/assets/Zagruzka-CfeBUwcg.js","/assets/ZagruzkaCell-Cc3X9slU.js","/assets/api-C4fiyCwA.js","/assets/archive-C_TVJgQf.js","/assets/archive-restore-yjYIicp2.js","/assets/arrow-down-DYNvC1-K.js","/assets/arrow-up-narrow-wide-zV5njBdE.js","/assets/award-Ch9UQSFI.js","/assets/ban-Czf6tbfe.js","/assets/boxes-CZG65BZu.js","/assets/braces-Dx32K_bl.js","/assets/brigadirFilters-DvMBDDhV.js","/assets/broadcastTree-D-JR-Cy8.js","/assets/building-2-DV2eY5Mw.js","/assets/calculator-D1pjB-Wt.js","/assets/calendar-BRYs2JRl.js","/assets/calendar-days-BrBM_3qx.js","/assets/camera-PsrDq1mj.js","/assets/categories-CKa7XibU.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BJLJfR2k.js","/assets/chart-line-BExepwxm.js","/assets/chart-pie-tehvqyu6.js","/assets/chartRange-xxwHUOvD.js","/assets/check-check-BMH-mg8p.js","/assets/chevron-left-BseqoCzB.js","/assets/chevrons-up-down-DFT0yJ5M.js","/assets/circle-CCvS6cQ0.js","/assets/circle-alert-D8jiSVU8.js","/assets/circle-check-big-CWgetNWl.js","/assets/circle-dashed-8A1vh3Zk.js","/assets/circle-minus-BQNxOIjH.js","/assets/circle-question-mark-9t804nU5.js","/assets/circle-slash-DVgaf4at.js","/assets/circle-user-round-CnBwbcao.js","/assets/clock-3-FrRTeq-d.js","/assets/cloud-off-CrNI_u2U.js","/assets/cloud-upload-Ch9KzFTA.js","/assets/compass-CEdVYBpT.js","/assets/concernCategories-CgO5z7qQ.js","/assets/copy-BwlVg4Wu.js","/assets/corner-down-right-ZDr9rfy7.js","/assets/createLucideIcon-CuZKbfRh.js","/assets/es-DiIlXI6s.js","/assets/external-link-BkotFyrm.js","/assets/file-clock-BA5nHJop.js","/assets/file-exclamation-point-CqB7groT.js","/assets/flag-BWWkSWF0.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-FBjLE8Fy.js","/assets/hash-D5dx5epW.js","/assets/hourglass-CMwjue2x.js","/assets/image-BCqJKOB9.js","/assets/image-off-BXgNsLNM.js","/assets/inbox-BprUx8lj.js","/assets/index-BKM2gJ54.css","/assets/index-kVtP4kNa.js","/assets/keyboard-DEwy0AEl.js","/assets/languages-lMdyrlML.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-ejp56EWL.js","/assets/lightbulb-D_oZxZOG.js","/assets/link-2-Dini-Cst.js","/assets/link-2-off-BPGnOv4y.js","/assets/list-ordered-D-qTzsTb.js","/assets/list-tree-Ct_JBlZE.js","/assets/lock-open-DbJQP6Cf.js","/assets/log-in-CI_vClc5.js","/assets/minimize-2-B03g5u63.js","/assets/package-check-CO1Y-J7o.js","/assets/pencil-BL2nYPnI.js","/assets/percent-DNVpePKf.js","/assets/pin-D8PQhwbp.js","/assets/pin-off-COXEVBlq.js","/assets/play-C8DElrs-.js","/assets/plug-zap-B0pUQzyM.js","/assets/prop-types-Cw6UoYMY.js","/assets/radio-Bhf-2-g1.js","/assets/react-apexcharts.esm-DiXc_01M.js","/assets/registers-Dm9lL8b5.js","/assets/repeat-p7KI-3Pv.js","/assets/rotate-cw-BMRLwbf3.js","/assets/save-DWRaq9lu.js","/assets/scopeLinks-BCCPKEv3.js","/assets/scroll-text-DC07bfby.js","/assets/search-x-UXPfjDuT.js","/assets/segments-BKuZ34uV.js","/assets/send-B9HHPo2n.js","/assets/settings-2-DT3HRkAi.js","/assets/shield-alert--Pa0_dH0.js","/assets/shield-b2FDOiCw.js","/assets/shield-question-mark-CFgG2PdV.js","/assets/siren-CVYbqGgO.js","/assets/snowflake-BCUwd0os.js","/assets/split-UbYiy1jB.js","/assets/square-check-big-BshrP6Do.js","/assets/star-CFo_tS7H.js","/assets/statusBands-BJmVODsu.js","/assets/store-HgkcvmTp.js","/assets/table-2-AtVwTfFL.js","/assets/table-properties-BhfWqKX2.js","/assets/tag-BHlmQtGF.js","/assets/timer-off-TKA79E0P.js","/assets/trending-down-m_mhY7Bi.js","/assets/trending-up-BvLoNl_A.js","/assets/undo-2-DsbOz-2C.js","/assets/useChartTheme-C7OpjwQ6.js","/assets/useElementWidth-BsKc6tn-.js","/assets/useIsMobile-aI0uX1cn.js","/assets/useOpenParam-CeZDObCq.js","/assets/useStatusBands-xfG6sHam.js","/assets/useUrlScope-hYsKmd4d.js","/assets/user-Bt4vHDqK.js","/assets/user-cog-CL2ECIUx.js","/assets/users-DHrkIvDb.js","/assets/vfx-Qj8uHvti.js","/assets/video-BBqw0j6v.js","/assets/wallet-D4YzfiaI.js","/assets/warehouse-Bu9c3IGc.js","/assets/x-DABHx9yG.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
