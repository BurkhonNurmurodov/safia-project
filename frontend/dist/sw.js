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

const BUILD = "2026-10-15T04:43:18.589Z";
const PRECACHE = ["/","/assets/AdminPanel-apjm4k2x.js","/assets/AnalysisBoard-DjuSN6uc.js","/assets/Arc-BcGwalVs.js","/assets/Assistant-BraeECXc.js","/assets/BrigadirProfile-CyqEee-d.js","/assets/BroadcastReceivers-CboOyj-f.js","/assets/BroadcastRecord-0kxMr1LO.js","/assets/Button-967sGFCc.js","/assets/CatLockNotice-CRMcT4zo.js","/assets/CategoryLegendModal-CrfiJTGr.js","/assets/CellConcerns-C3ZP4dze.js","/assets/CellDetails-YoTTHu5A.js","/assets/CellFormModal-BvXvwn15.js","/assets/CellIdent-BwN0hjNv.js","/assets/CellLink-B1aTW6xW.js","/assets/Cells-CJhjhwY9.js","/assets/ColumnFilter-up3pjcO_.js","/assets/ColumnsPicker-4jwrQOLH.js","/assets/CommentsModal-F0A-NZKc.js","/assets/ComparisonTable-DW-zbagk.js","/assets/Concerns-CLqHDSUM.js","/assets/CountStepper-STH8nqoc.js","/assets/Daily-C_wGUGUp.js","/assets/DataTable-BUG1aPhq.js","/assets/DateRangePicker-ZGMverzh.js","/assets/DayReportView-CrUis7kh.js","/assets/DayStepper-BL6fO31t.js","/assets/DifferenceBreakdown-CbHXaW94.js","/assets/Downtime-DMpV7uPr.js","/assets/Education-C9ET1nI1.js","/assets/EducationLesson-BEXKUtGV.js","/assets/EmptyState-DHWGcEFg.js","/assets/Exam-BALiiyK3.js","/assets/FactorySelect-Bh04kziK.js","/assets/Gamification-OtVG-6WH.js","/assets/GroupBadge-CfkFNvEU.js","/assets/HeatmapChart-CK88pHPS.js","/assets/IdleCell-DkqT4J8f.js","/assets/KPICard-B_drXdZw.js","/assets/Kaizen-Bq5ONakS.js","/assets/Kelish-CNrVHWZF.js","/assets/KpiDeltaCard-B3jR4jQ6.js","/assets/LangTextInput-tF25ihDj.js","/assets/Layout-CFyEtBGV.js","/assets/LeaderAppeal-CHJh6jS-.js","/assets/LeaderDayReport-Ddexs_79.js","/assets/LeaderUnitReport-CeoPqMsG.js","/assets/Leaderboard-Bo0AEECB.js","/assets/Leaders-5a9n89HB.js","/assets/Lightbox-DYCW0Xv9.js","/assets/LiveOverview-CR8HI7Qz.js","/assets/Login-C9bgy99c.js","/assets/NotFound-BksJAtlP.js","/assets/Notifications-CWhiL0OL.js","/assets/Overview-Bw8v43xQ.js","/assets/Pagination-CpH4hsMJ.js","/assets/PerenaladkaFactTable-BctAlZdh.js","/assets/PersonCard-E_HtHb-n.js","/assets/PlanFulfillment-BFeyMEYU.js","/assets/Production-NRAtAUL6.js","/assets/Profile-D85o2BES.js","/assets/ProofCamera-EGzOipYi.js","/assets/Quality-tezhF_cT.js","/assets/RawRows-xMA62uQn.js","/assets/RequestStateChip-CLBz7BBh.js","/assets/RichTextEditor-Y2fCh6YO.js","/assets/SaveState-CbBkddpN.js","/assets/SearchInput-jFuKsjNg.js","/assets/SeasonalityHeatmap-Cv_x_tot.js","/assets/SegmentedToggle-CxJvZSSG.js","/assets/SetupTimes-CU9PcXtj.js","/assets/ShiftDaily-BvawsFi2.js","/assets/Staff-CTjncTdj.js","/assets/StaffListAtCheck-CPW9QUcg.js","/assets/StatusBadge-C8OjNkcv.js","/assets/TargetGoal-CqEgYYqd.js","/assets/Targets-Bds1WySb.js","/assets/Tasks-CU7_LrSk.js","/assets/TimeWheelPicker-ByJxGOno.js","/assets/Toast-CyBbMSOu.js","/assets/Tooltip-D9sQiu_6.js","/assets/TrendChart-BD77OZ5M.js","/assets/TripleSpeedometer-CewTL-DI.js","/assets/Trudoyomkost-BT9y0z7K.js","/assets/Turnover-CxxQOLhw.js","/assets/UploadDropzone-CLsh6Umi.js","/assets/UsersActivity-XBW6YSgt.js","/assets/VerdictBlock-CSbPmc7Y.js","/assets/VfxApiMap-DrZXxWc9.js","/assets/VfxDictionaries-DlWY2N4Q.js","/assets/VfxEmployees-_DCqhOGg.js","/assets/VfxHrMoves-CmnuFAXq.js","/assets/VfxJobs-DSD4DMW6.js","/assets/VfxPhoto-Dewoco6k.js","/assets/VfxShifts-Cc_dxCCi.js","/assets/VfxState-Bm_IUj2B.js","/assets/VfxTimebooks-BBHpoaaB.js","/assets/VfxTimesheet-DBmmpv_V.js","/assets/WatchProgress-C6XgH5RO.js","/assets/WebLogin-BlROnI0m.js","/assets/WorkerConcerns-BT1itbB2.js","/assets/Workers--T7AoD-5.js","/assets/Zagruzka-BbE1zz3o.js","/assets/ZagruzkaCell-BjTkROkC.js","/assets/api-Bxgs5RC5.js","/assets/archive-DkiSefL3.js","/assets/archive-restore-erZ5xkbQ.js","/assets/arrow-down-BLFbbe4Y.js","/assets/arrow-down-wide-narrow-Dhx1ouEk.js","/assets/arrow-up-narrow-wide-CGAPGzUO.js","/assets/award-CEpZs-eu.js","/assets/ban-CdG6bCRE.js","/assets/boxes-eGtftqGh.js","/assets/braces-CUdgviN7.js","/assets/brigadirFilters-CmgfaA0h.js","/assets/broadcastTree-T9Gk3Flc.js","/assets/building-2-vM_ppZtU.js","/assets/calculator-DDfIlFYB.js","/assets/calendar-BqgWIkZY.js","/assets/calendar-days-DUr29Anh.js","/assets/camera-C80aTftC.js","/assets/categories-wcDhVGPZ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-IxElEW1y.js","/assets/chart-line-Cyifx04l.js","/assets/chart-pie-A9hpSRfc.js","/assets/chartRange-BtV36F3Z.js","/assets/check-check-BtY1pUoi.js","/assets/chevron-left-2B1oS7yt.js","/assets/chevrons-up-down-DGr9FFpt.js","/assets/circle-BlEOjYyw.js","/assets/circle-alert-wBYAGI7E.js","/assets/circle-check-big-Ce1O9CoX.js","/assets/circle-dashed-DhFCPspZ.js","/assets/circle-minus-XpD8OJkh.js","/assets/circle-question-mark-BAStmiBX.js","/assets/circle-slash-CFAgz-FJ.js","/assets/circle-user-round-CoXMZOwZ.js","/assets/clock-3-BynXtW7W.js","/assets/cloud-off-JmUFxtGO.js","/assets/cloud-upload-iTYwbXOj.js","/assets/compass-5wloIcZ0.js","/assets/concernCategories-C7cGm4fn.js","/assets/copy-CJD9Dauy.js","/assets/corner-down-right-BCcVdlGu.js","/assets/createLucideIcon-asU3BfqE.js","/assets/es-CuhNNG57.js","/assets/external-link-B57mgUMv.js","/assets/file-clock-BPl7-Q8F.js","/assets/file-exclamation-point-C2lRKQCE.js","/assets/flag-D3VB1KNh.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DzdkR3AY.js","/assets/hash-byJQd9I8.js","/assets/hourglass-kK1kGcz5.js","/assets/image-DWXB4yg_.js","/assets/image-off-773gT6_E.js","/assets/inbox-8xM4ylOD.js","/assets/index-DP4Slktc.js","/assets/index-oN3ajqAx.css","/assets/keyboard-BPaqtaOT.js","/assets/languages-Cl8D7CW5.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CrYVjLrI.js","/assets/lightbulb-B0zFAgl7.js","/assets/link-2-Bj547T66.js","/assets/link-2-off-BVMoTWXU.js","/assets/list-ordered-DCKhAGqK.js","/assets/list-tree-tP8JooFG.js","/assets/lock-open-D_F9byLo.js","/assets/log-in-Dp0e3NAV.js","/assets/marks-CJom7lIA.js","/assets/minimize-2-NQ9tcNeV.js","/assets/package-check-tYinoqql.js","/assets/pencil-Cs59JGTs.js","/assets/percent-fnNuPyVB.js","/assets/pin-A0rzNj0H.js","/assets/pin-off-CsPOCxmU.js","/assets/play-ppE3iFGo.js","/assets/plug-zap-C7gHEwOA.js","/assets/prop-types-Bxz5L8JV.js","/assets/radio-DO8PcmKC.js","/assets/react-apexcharts.esm-6T8snql9.js","/assets/registers-Dp0Qzg9i.js","/assets/repeat-C8hbHJX5.js","/assets/save-Bn6ls4RN.js","/assets/scopeLinks-DkqRQcxq.js","/assets/scroll-text-BIHp-8sN.js","/assets/search-x-CXCY0QE9.js","/assets/segments-CTKLFmMS.js","/assets/send-DsjT-D4c.js","/assets/settings-2-BBMAtHll.js","/assets/shield-CnZ5p30P.js","/assets/shield-alert-D8ctyqN-.js","/assets/shield-question-mark-YgNu4tTR.js","/assets/siren-Da7YfHQo.js","/assets/snowflake-B74toPJu.js","/assets/split-D3sCJHit.js","/assets/square-check-big-Ksddq7TK.js","/assets/star-gcTv2B59.js","/assets/statusBands-xmthMPFX.js","/assets/store-CgobF_Xj.js","/assets/table-2-DZCVV2gQ.js","/assets/table-properties-DznYRNMW.js","/assets/tag-BOyTJcqO.js","/assets/timer-off-WG-IUfcm.js","/assets/trending-down-CFXjZeKp.js","/assets/trending-up-BkA2qdt1.js","/assets/undo-2-7P7Fi1AI.js","/assets/useChartTheme-zc8UyDRp.js","/assets/useElementWidth-qilEGM0k.js","/assets/useIsMobile-kQ1iiHiW.js","/assets/useOpenParam-BLRVrKCw.js","/assets/useStatusBands-BTo9DKDM.js","/assets/useUrlScope-C_DMAR5N.js","/assets/user-DmSOL8yT.js","/assets/user-cog-sxcVZtj_.js","/assets/users-DBR-fMI2.js","/assets/vfx-B6p6YCaq.js","/assets/video-CaGH6J5F.js","/assets/wallet-BjolG9vV.js","/assets/warehouse-YmsAQqQy.js","/assets/workflow-BsIGOHi2.js","/assets/x-ByvHrTC2.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
