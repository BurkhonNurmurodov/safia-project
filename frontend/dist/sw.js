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

const BUILD = "2026-09-23T06:56:24.721Z";
const PRECACHE = ["/","/assets/AdminPanel-D_OVXCNR.js","/assets/AnalysisBoard-CCrsqKHx.js","/assets/Arc-CuZpYp7k.js","/assets/AttendanceModal-SQn62bk8.js","/assets/BrigadirProfile-CKTXW25Y.js","/assets/BroadcastReceivers-yGeXE3xX.js","/assets/BroadcastRecord-CMfADkCe.js","/assets/CatLockNotice-CYbDej44.js","/assets/CategoryLegendModal-CojH5lJg.js","/assets/CellConcerns-CnhtXve9.js","/assets/CellDetails-BPkBUahU.js","/assets/CellFormModal-BaIhVFtl.js","/assets/CellLink-B1jyWVUY.js","/assets/Cells-C_bXl2kj.js","/assets/ColumnFilter-hGbv652K.js","/assets/ColumnsPicker-9Jsv0TPt.js","/assets/CommentsModal-BZklrOXI.js","/assets/ComparisonTable-C7zdIONO.js","/assets/Concerns-BWfknaP0.js","/assets/ConfirmDialog-NcK_6rbM.js","/assets/Daily-VRNZ64DY.js","/assets/DataTable-Dq9H2OS-.js","/assets/DateRangePicker-COqhLxHG.js","/assets/DayReportView-7jMhAwVT.js","/assets/DayStepper-DCG1eUlZ.js","/assets/DifferenceBreakdown-BzK5UhE-.js","/assets/Downtime-D5ACB_JD.js","/assets/Education-BP4MEE_e.js","/assets/EducationLesson-BdczPmTF.js","/assets/EmptyState-CatjbK9Y.js","/assets/FactorySelect-BIqKU3MH.js","/assets/FormField-DtZKhc1K.js","/assets/Gamification-C0i7kuH1.js","/assets/GroupBadge-zK8cCjvY.js","/assets/HeatmapChart-Bnm-rWb5.js","/assets/IdleCell-sRFk1PVq.js","/assets/KPICard-Bo_Ys3dn.js","/assets/Kaizen-BviqzbRo.js","/assets/KpiDeltaCard-CVebx1NO.js","/assets/LangTextInput-DCFgGPAw.js","/assets/Layout-DYBWZ-OB.js","/assets/LeaderDayReport-CzEkWfQo.js","/assets/LeaderUnitReport-D08Er7pN.js","/assets/Leaderboard-CaEKI_yN.js","/assets/Leaders-Cs_3pJ_x.js","/assets/LiveOverview-BNPtVYVN.js","/assets/Login-BBMLsljl.js","/assets/NotFound-Nz364jiZ.js","/assets/Overview-BVXmc4d8.js","/assets/Pagination-DX0nLUvW.js","/assets/PerenaladkaFactTable-CDS6M0vr.js","/assets/PlanFulfillment-BlkR2aum.js","/assets/Production-jWtS1pJm.js","/assets/Profile-BCQ0SE4m.js","/assets/ProofCamera-eCIqPnB8.js","/assets/Quality-DBRo_OeY.js","/assets/RichTextEditor-CeoVZ03d.js","/assets/SearchInput-DGkU14db.js","/assets/SeasonalityHeatmap-BxA7ppO0.js","/assets/SegmentedToggle-dDZ87N2V.js","/assets/SetupTimes-CeChUvrC.js","/assets/ShiftDaily-88osCQaL.js","/assets/Skeleton-DOQCwUcF.js","/assets/Staff-DB5MF8uR.js","/assets/StatusBadge-pRwPuS_C.js","/assets/StyledSelect-DnEOY4pE.js","/assets/Targets-DrIr5ip_.js","/assets/Tasks-mPXQqUgr.js","/assets/TimeField-DhEZcS_O.js","/assets/TimeWheelPicker-D6ni-_SF.js","/assets/Toast-B8-U8bg2.js","/assets/Tooltip-CkJRfHP9.js","/assets/TrendChart-B6szxvlQ.js","/assets/TripleSpeedometer-BYICeT1q.js","/assets/Trudoyomkost-DtpjJw82.js","/assets/UsersActivity-V9Gj2AKd.js","/assets/WatchProgress-Bbp2ZXvY.js","/assets/WebLogin-BN-iGqFB.js","/assets/WorkerConcerns-BhLlre2c.js","/assets/Workers-0mUo45Td.js","/assets/Zagruzka-sHOpzRsR.js","/assets/ZagruzkaCell-P-bVhnnF.js","/assets/alarm-clock-BWXkgkPl.js","/assets/api-Cctx3k9n.js","/assets/archive-CjlxdX4x.js","/assets/archive-restore-C3pAMtfK.js","/assets/arrow-down-BRSZ0yRY.js","/assets/arrow-left-C8363YQ5.js","/assets/arrow-left-right-CtQsbC12.js","/assets/arrow-right-CtPwv0Zw.js","/assets/arrow-up-right-BLJLx4Wm.js","/assets/arrow-up-zBC0AbEt.js","/assets/award-B8ISJpZD.js","/assets/ban-C_ZUSeUj.js","/assets/bot-BSZJ7JJn.js","/assets/boxes-D09yj5ny.js","/assets/brigadirFilters-N3ZRvpXS.js","/assets/broadcastTree-DnwxTygF.js","/assets/building-2-DCEiF0l_.js","/assets/calendar-BB0fM5bF.js","/assets/calendar-clock-BCE8ajBJ.js","/assets/calendar-days-Cj5LX1Ug.js","/assets/calendar-range-DQTngS6D.js","/assets/camera-CciOz3NS.js","/assets/categories-DPascuti.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CQhvpsUz.js","/assets/chart-line-BmqxMzUN.js","/assets/chart-pie-W9x0E8zB.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-hU-w9jvv.js","/assets/check-DEEmJmUl.js","/assets/check-check-DjiDoYIL.js","/assets/chevron-left-831LQlzA.js","/assets/chevrons-up-down-y4b2YAOb.js","/assets/circle-dashed-DxZxZ-G4.js","/assets/circle-dot-DGJtHW9T.js","/assets/circle-minus-3J_P3iwD.js","/assets/circle-slash-DMypNLuz.js","/assets/circle-user-round-CP09QpBL.js","/assets/coins-DE7QKvlG.js","/assets/compass-BNga8ekf.js","/assets/concernCategories-ClAO5RrI.js","/assets/copy-DuMNZ64C.js","/assets/corner-down-right-DsgIG1ip.js","/assets/createLucideIcon-CEGIglYQ.js","/assets/exportXlsx-n5oQgTSZ.js","/assets/external-link-BNxzfQIr.js","/assets/file-clock-CbT8VmOY.js","/assets/file-spreadsheet-CNgJ4Dlr.js","/assets/file-text-Dpq2Cn1y.js","/assets/flag-Cm3_SLDY.js","/assets/flame-Btx-qir5.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-riLWRzN0.js","/assets/funnel-TJL8Dwfc.js","/assets/hash-DH-Swr3G.js","/assets/history-C2hdmxig.js","/assets/hourglass-Bkt1Mf4Y.js","/assets/image-BUI3Ka8T.js","/assets/image-off-jcueH591.js","/assets/index-Bo5DqNQU.js","/assets/index-ftrCYFhP.css","/assets/keyboard-B7qmuCiL.js","/assets/languages-DmPYMB2w.js","/assets/layers-BudLVdiA.js","/assets/leaderReason-Cz_RDMcw.js","/assets/lightbulb-STrBuASJ.js","/assets/link-2-CO1U80fp.js","/assets/list-checks-C556B6Zu.js","/assets/list-ordered-a8FFskhU.js","/assets/lock-open-BlPrg7EK.js","/assets/log-in-BQxA-7U2.js","/assets/message-square-CieDWIOc.js","/assets/minimize-2-BGYukgbh.js","/assets/minus-Bk4Pne6H.js","/assets/paperclip-2gS66K_S.js","/assets/pencil-Bls4eJry.js","/assets/pencil-line-D-TlFEfC.js","/assets/personName-B4KId4zS.js","/assets/pin-DxkNvQ-6.js","/assets/play-n2fHfMsN.js","/assets/presentation-CHOk03iI.js","/assets/prop-types-CkYU0HoB.js","/assets/radio-B37frWFr.js","/assets/react-apexcharts.esm-B8oMnKdU.js","/assets/refresh-cw-DcrWsaTh.js","/assets/repeat-jcCk0GBQ.js","/assets/rotate-ccw-krNN5sdl.js","/assets/rotate-cw-CjkhcWo-.js","/assets/save-DKo0FYkr.js","/assets/scale-_-4zW2K5.js","/assets/scroll-text-B-t-ewM_.js","/assets/search-x-WcHKOQSI.js","/assets/segments-CJgmpKyX.js","/assets/send-Vmlt8d_E.js","/assets/settings-2-CNK8XF7M.js","/assets/shield-BFZ5ZoMf.js","/assets/shield-alert-BmXaIbd9.js","/assets/shield-check-DOxUGNts.js","/assets/shield-question-mark-CxWRl5dh.js","/assets/siren-CLfSFO3q.js","/assets/smartphone-CXYAH7cN.js","/assets/snowflake-BVIp70HS.js","/assets/square-Ccz1dD3T.js","/assets/square-check-big-1oI-aBQN.js","/assets/star-nKderoWw.js","/assets/statusBands-fZLbaOZq.js","/assets/table-2-Bqp5dpRV.js","/assets/tag-DA98qlQE.js","/assets/trash-2-DqyxdFqQ.js","/assets/trending-down-DS_s4UHi.js","/assets/trending-up-B-TaFd9h.js","/assets/undo-2-Dg22HUTu.js","/assets/useChartTheme-DwHzwE10.js","/assets/useElementWidth-B4bV8Ao2.js","/assets/useIsMobile-DbLhCz3C.js","/assets/useMutation-BQ1WdCUN.js","/assets/useStatusBands-p1J13bUX.js","/assets/user-check-BzGpLR-M.js","/assets/user-cog-CYPiGCTw.js","/assets/user-minus-BecXnIft.js","/assets/users-Cpclr5Lo.js","/assets/verifyState-CsaGpl0V.js","/assets/video-CtWGbjJz.js","/assets/warehouse-BIc7K25l.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
