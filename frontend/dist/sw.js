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

const BUILD = "2026-10-02T05:45:58.702Z";
const PRECACHE = ["/","/assets/AdminPanel-CkxZoVbX.js","/assets/AnalysisBoard-Co7lRfbo.js","/assets/Arc-C_NA8nH4.js","/assets/ArcLegacy-B45CpzvF.js","/assets/BrigadirProfile-CcdDqkww.js","/assets/BroadcastReceivers-BTiV7nKm.js","/assets/BroadcastRecord-Baz0hJA1.js","/assets/CatLockNotice-BuuhI3gk.js","/assets/CategoryLegendModal-DKb0mOis.js","/assets/CellConcerns-Dh4zvN8j.js","/assets/CellDetails-D9LvaD70.js","/assets/CellFormModal-BXURdh7d.js","/assets/CellIdent-DJ97ZbO9.js","/assets/CellLink-Dpq6kMdY.js","/assets/Cells-DJgJ1saY.js","/assets/ColumnFilter-4EwxqM5y.js","/assets/ColumnsPicker-DfSLenWA.js","/assets/CommentsModal-B7zVKeoq.js","/assets/ComparisonTable-DwFdSEJa.js","/assets/Concerns-ClQNqnVe.js","/assets/ConfirmDialog-BnX8-WLv.js","/assets/Daily-DZ7BtEZ4.js","/assets/DataTable-Bogo-K35.js","/assets/DateRangePicker-B06k-0St.js","/assets/DayReportView-D4IBOovf.js","/assets/DayStepper-kbyFj3_J.js","/assets/DifferenceBreakdown-23TzkBag.js","/assets/Downtime-CAeFUX1N.js","/assets/Education-BvVYgx-U.js","/assets/EducationLesson-C7LvAy34.js","/assets/EmptyState-C13Y1KGW.js","/assets/Exam-CiwN9dEh.js","/assets/FactorySelect-ddM3OZ3t.js","/assets/Gamification-D0WXq2JH.js","/assets/GroupBadge-B1XaRDiZ.js","/assets/HeatmapChart-BzYLwxM5.js","/assets/IdleCell-8ekoCJcH.js","/assets/KPICard-CJ9J9pqF.js","/assets/Kaizen-DOIMffMK.js","/assets/Kelish-D07JPDJs.js","/assets/KpiDeltaCard-B0GzdbY6.js","/assets/LangTextInput-cZ9w-gHA.js","/assets/Layout-BhModJ8u.js","/assets/LeaderAppeal-Bo8MZI7G.js","/assets/LeaderDayReport-CsGRy24c.js","/assets/LeaderUnitReport-9mgDUQ-1.js","/assets/Leaderboard-BvL99g1F.js","/assets/Leaders-C0R95AFT.js","/assets/Lightbox-DoBcKaBQ.js","/assets/LiveOverview-BUknPeOg.js","/assets/Login-DgSGMASv.js","/assets/NotFound-B9xfANi5.js","/assets/Notifications-DwjsQxKn.js","/assets/Overview-eIkPpEjV.js","/assets/Pagination-Bnmms9Gc.js","/assets/PerenaladkaFactTable-CvX47zSE.js","/assets/PlanFulfillment-CwmVFF7S.js","/assets/Production-BAy-GZ6F.js","/assets/Profile-COw4tKzE.js","/assets/ProofCamera-BKixpWcT.js","/assets/ProofPhoto-ByjdvRal.js","/assets/Quality-hhbipJi_.js","/assets/RequestStateChip-DfMI7-Vx.js","/assets/RichTextEditor-DE9INOUG.js","/assets/SaveState-BmB6WQA_.js","/assets/SearchInput-DvktxOK4.js","/assets/SeasonalityHeatmap-D52CDe2i.js","/assets/SegmentedToggle-Y7mzl0Qf.js","/assets/SetupTimes-hncMBiwa.js","/assets/ShiftDaily-CxtxDVp6.js","/assets/Staff-CLQBMFY_.js","/assets/StaffLive-B0kZJCwt.js","/assets/StatusBadge-iCY2xoQS.js","/assets/TargetGoal-BX1epAPs.js","/assets/Targets-klyWkYBm.js","/assets/Tasks-Cg2eMGV-.js","/assets/TimeWheelPicker-DPcpQnTj.js","/assets/Toast-Bu-I0Z_8.js","/assets/Tooltip-Do0zBES6.js","/assets/TrendChart-DyQ_wYmV.js","/assets/TripleSpeedometer-7IqC_cyO.js","/assets/Trudoyomkost-BK9e7gkC.js","/assets/UploadDropzone-DWKgIB7B.js","/assets/UsersActivity-DWjxh80o.js","/assets/VerdictBlock-BErR5bg9.js","/assets/WatchProgress-BefF5ee0.js","/assets/WebLogin-BiA6pfdG.js","/assets/WorkerConcerns-DgX6erRb.js","/assets/Workers-CCfIz-yK.js","/assets/Zagruzka-DdnP-P4l.js","/assets/ZagruzkaCell-D7Wdn0w8.js","/assets/api-CwgQE9tv.js","/assets/archive-Y7oL9WSe.js","/assets/archive-restore-KgrSmBou.js","/assets/arrow-down-BxLhTXBe.js","/assets/arrow-left-Br6V7AjJ.js","/assets/arrow-right-left-DTMUdGn2.js","/assets/arrow-up-CGtK64iz.js","/assets/arrow-up-narrow-wide-IFBu8WdO.js","/assets/arrow-up-right-CZRz26Dh.js","/assets/award-UDB_rMA2.js","/assets/ban-BUo-Vc82.js","/assets/bot-DJ_tKw6T.js","/assets/boxes-CFzqAaiF.js","/assets/brigadirFilters-AfQP5s6N.js","/assets/broadcastTree-CJ_EQN_3.js","/assets/building-2-DCI7-0RL.js","/assets/calendar-B6r0Idwk.js","/assets/calendar-days--dNTOd3M.js","/assets/calendar-range-BTeSAulH.js","/assets/camera-WBvMW5cI.js","/assets/categories-eE1l6XJq.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DbRYW2hi.js","/assets/chart-line-C1HCXaM7.js","/assets/chart-pie-Bi96TwKC.js","/assets/chartRange-dZcn0WZ1.js","/assets/chevron-left-DgDtpvAe.js","/assets/chevrons-up-down-BZFRfJbr.js","/assets/circle-alert-Cp8PU6j0.js","/assets/circle-check-big-CGPgzTHY.js","/assets/circle-mYCBtnHC.js","/assets/circle-minus-CniXxOuO.js","/assets/circle-slash-BiEGyCxU.js","/assets/circle-user-round-DF8NZIzq.js","/assets/cloud-off-C14ET8sC.js","/assets/cloud-upload-CtUOzpXz.js","/assets/compass-Cw5LD0g-.js","/assets/concernCategories-D2OwAQqD.js","/assets/copy-C1JX1pX6.js","/assets/corner-down-right-RYTmGlmc.js","/assets/createLucideIcon-DzGrzMKX.js","/assets/es-D6_6_z4Q.js","/assets/exportXlsx-CMERorJd.js","/assets/external-link-4SQ5Xk02.js","/assets/file-clock-CFUjb1JV.js","/assets/file-exclamation-point-DTzGJIMl.js","/assets/file-spreadsheet-CdWH2-n5.js","/assets/file-text-BqjNhSr4.js","/assets/flag-BqAmCAL8.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-NwmLIfyQ.js","/assets/hash-D3kqR7br.js","/assets/history-BpfQDxj6.js","/assets/hourglass-CTD-wiv7.js","/assets/id-card-DJEGd5YA.js","/assets/image-DJFhFyJw.js","/assets/image-off-1VEZLZ9_.js","/assets/inbox-DXQCDNLn.js","/assets/index-CBQ-7RpV.css","/assets/index-KIKV9NxF.js","/assets/key-round-BvXhdMj0.js","/assets/keyboard-CKVFuMVW.js","/assets/languages-CgeoSa1K.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DHxN4U_Z.js","/assets/lightbulb-ag4GAneq.js","/assets/link-2-YUpdyKUl.js","/assets/link-2-off-Dhx-aJw-.js","/assets/list-ordered-BiShdDhG.js","/assets/list-tree-CNPdpcXU.js","/assets/lock-open-CO9Kbv3C.js","/assets/log-in-CHk0TNKq.js","/assets/maximize-2-DAWoi1Q5.js","/assets/message-square-Db9t12Hg.js","/assets/minimize-2-D0P0VMUU.js","/assets/package-check-Dd3laqTd.js","/assets/paperclip-ryN152oR.js","/assets/pencil-CKSdoqA-.js","/assets/percent-D0rFMvhn.js","/assets/pin-BZRDZjEP.js","/assets/pin-off-DeE8uS-B.js","/assets/play-By3p7hJ5.js","/assets/plug-zap-3___LCZV.js","/assets/presentation-Bvb-EpuR.js","/assets/prop-types-CLbyWKj_.js","/assets/radio-hjb4KuJ0.js","/assets/react-apexcharts.esm-CTiJ7673.js","/assets/repeat-BRBYEbTh.js","/assets/rotate-ccw-CkHWlhr3.js","/assets/rotate-cw-grYZ66Xp.js","/assets/save-eFcg1fqN.js","/assets/scopeLinks-BwnJlART.js","/assets/scroll-text-CT0RdqVp.js","/assets/search-x-BGVZq7TH.js","/assets/segments-CsESr63T.js","/assets/send-2nE3D_el.js","/assets/settings-2-D_XI1aQP.js","/assets/shield-Cz19lr4g.js","/assets/shield-alert-DJOEAL93.js","/assets/shield-check-DSSq7u6k.js","/assets/shield-question-mark-BaoDRdYl.js","/assets/siren-BZN4IlXY.js","/assets/snowflake-CXnKJ_YP.js","/assets/split-DBGTsA9C.js","/assets/square-CPPnMcao.js","/assets/square-check-big-CdQ8hZRX.js","/assets/star-C03evyUI.js","/assets/statusBands-B8J91BVT.js","/assets/store-BW-lpJNt.js","/assets/table-2-CpJdEi58.js","/assets/table-properties-a0tVs8Au.js","/assets/tag-MVhsWa2f.js","/assets/timer-off-B0qk7lIG.js","/assets/trending-down-BJwAZJXZ.js","/assets/trending-up-B-PZhYiq.js","/assets/undo-2-DnYrtUU8.js","/assets/useChartTheme-BlB0pBRh.js","/assets/useElementWidth-Ccw1Wgr7.js","/assets/useIsMobile-DEkVQ3ds.js","/assets/useOpenParam-aoAIpn-H.js","/assets/useStatusBands-RJKq5GzD.js","/assets/useUrlScope-cX_0_L7_.js","/assets/user-6SP1FBhC.js","/assets/user-cog-CK7pJwlt.js","/assets/user-minus-DSt4l03a.js","/assets/users-CT-66PGb.js","/assets/video-DMdY04BX.js","/assets/wallet-DQXLY_p_.js","/assets/warehouse-DGgXO8wG.js","/assets/x-BWuBexSd.js","/assets/zap-Dq476Hxh.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
