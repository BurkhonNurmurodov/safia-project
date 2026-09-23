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

const BUILD = "2026-09-23T15:27:37.583Z";
const PRECACHE = ["/","/assets/AdminPanel-Bgg5mwND.js","/assets/AnalysisBoard-Bsc2Ivjq.js","/assets/Arc-CbrqlJbS.js","/assets/AttendanceModal-0eqOIc8c.js","/assets/BrigadirProfile-D_Tb38Pi.js","/assets/BroadcastReceivers-DtDeh7TL.js","/assets/BroadcastRecord-Du9DtxYo.js","/assets/CatLockNotice-64bQHuSE.js","/assets/CategoryLegendModal-G45I347F.js","/assets/CellConcerns-C6Ot5S-A.js","/assets/CellDetails-CEa9Rtsy.js","/assets/CellFormModal-DZet6YKo.js","/assets/CellLink-DUQ88DDU.js","/assets/Cells-CB-BD0m8.js","/assets/ColumnFilter-Cj6Y5UPD.js","/assets/ColumnsPicker-CFI2ibvT.js","/assets/CommentsModal-5tCms5Wz.js","/assets/ComparisonTable-BzOGpBB4.js","/assets/Concerns-Bh-WzNrG.js","/assets/ConfirmDialog-CP6-wN1D.js","/assets/Daily-tOog9k8X.js","/assets/DataTable-vlYrFQnC.js","/assets/DateRangePicker-lMJctQYq.js","/assets/DayReportView-Cs6HmeGy.js","/assets/DayStepper-DWjXRJQ0.js","/assets/DifferenceBreakdown-qm4QNbj_.js","/assets/Downtime-D0dFutuo.js","/assets/Education-DyGX9fDA.js","/assets/EducationLesson-CTC41BV2.js","/assets/EmptyState-8hytoiDE.js","/assets/FactorySelect-CVpNx-rC.js","/assets/FormField-CYHkfNBc.js","/assets/Gamification-DtY1nWME.js","/assets/GroupBadge-DU0lr9Fr.js","/assets/HeatmapChart-DzZHQqpK.js","/assets/IdleCell-De7ZmHHr.js","/assets/KPICard-BaLmZr6K.js","/assets/Kaizen-BDlS_MHy.js","/assets/KpiDeltaCard-D3o7PHMM.js","/assets/LangTextInput-DTLXQzIQ.js","/assets/Layout-CYfExU9C.js","/assets/LeaderDayReport-ci_0p8Ed.js","/assets/LeaderUnitReport-BNGYmyGE.js","/assets/Leaderboard-Bpy9hfsm.js","/assets/Leaders-BPNrAeca.js","/assets/LiveOverview-DwTlbygk.js","/assets/Login-NUz-3kNx.js","/assets/NotFound-_T7IziWO.js","/assets/Overview-B0iHFEaW.js","/assets/Pagination-CYuiD9qp.js","/assets/PerenaladkaFactTable-DiHjSrRa.js","/assets/PlanFulfillment-B-9mNLqs.js","/assets/Production-BwZULjzp.js","/assets/Profile-BcnnNUkw.js","/assets/ProofCamera-YdMDmYSx.js","/assets/Quality-D0dbEfuX.js","/assets/RichTextEditor-GP4PGXMe.js","/assets/SearchInput-DWio0TkE.js","/assets/SeasonalityHeatmap-CeLM42mo.js","/assets/SegmentedToggle-DTO7p2-Q.js","/assets/SetupTimes-CEWyHfrt.js","/assets/ShiftDaily-Bxx8BLja.js","/assets/Skeleton-BzbRhrEF.js","/assets/Staff-Pt5qM4-f.js","/assets/StatusBadge-lFbxv-el.js","/assets/StyledSelect-DEaoNsY8.js","/assets/Targets-Cdbe103F.js","/assets/Tasks-SOj9ZKg9.js","/assets/TimeField-BguOgJYm.js","/assets/TimeWheelPicker-CHUv4fVy.js","/assets/Toast-CMn6GDr8.js","/assets/Tooltip-rkZ4U-pi.js","/assets/TrendChart-B9bTZa30.js","/assets/TripleSpeedometer-BuWWjnFs.js","/assets/Trudoyomkost-CnuNamMV.js","/assets/UsersActivity-DpUowVHp.js","/assets/WatchProgress-1atj4UQ7.js","/assets/WebLogin-BuqgWcpU.js","/assets/WorkerConcerns-aua0RMK0.js","/assets/Workers-DkC-PM1i.js","/assets/Zagruzka-C1cywxU1.js","/assets/ZagruzkaCell-BFSWcbvk.js","/assets/alarm-clock-CUuPVj2R.js","/assets/api-CKQhsb4u.js","/assets/archive-EapZhl4P.js","/assets/archive-restore-CJc-yALq.js","/assets/arrow-down--KzbK6Vq.js","/assets/arrow-left-BLnWwfeb.js","/assets/arrow-left-right-D3fPhvTI.js","/assets/arrow-right-ugokVLIn.js","/assets/arrow-up-BwHANk1w.js","/assets/arrow-up-right-Cu8TNLyl.js","/assets/award-DnpAvpm-.js","/assets/ban-C81PaS9M.js","/assets/bot-CmNjk1N9.js","/assets/boxes-DID4dkGF.js","/assets/brigadirFilters-BwXxW1rV.js","/assets/broadcastTree-CUhjnx9Y.js","/assets/building-2-4DvmQq3m.js","/assets/calendar-BLTVrJik.js","/assets/calendar-clock-l7T97qzD.js","/assets/calendar-days-D2XuSFUZ.js","/assets/calendar-range-CNVKvAnw.js","/assets/camera-DJH2H3hQ.js","/assets/categories-Pr06O0s3.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BY63q0Ap.js","/assets/chart-line-Fh5udwsc.js","/assets/chart-pie-DhFwXQzg.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-Bh81sGx0.js","/assets/check-DB5_yXTu.js","/assets/check-check-CLblLauo.js","/assets/chevron-left-of4BwsdD.js","/assets/chevrons-up-down-D0hyWeIn.js","/assets/circle-dashed-DwbE5bGH.js","/assets/circle-dot-Dzi53JJ0.js","/assets/circle-minus-CnEkUttf.js","/assets/circle-slash-CLAoJgSl.js","/assets/circle-user-round-CFHC_qTt.js","/assets/coins-DZVIK4It.js","/assets/compass-BAJfiPFa.js","/assets/concernCategories-qTBoHcw7.js","/assets/copy-Bk2UYhyD.js","/assets/corner-down-right-RnT1n9UU.js","/assets/createLucideIcon-CYMm0NIz.js","/assets/exportXlsx-Bo2iZojF.js","/assets/external-link-DTjl_pf8.js","/assets/file-clock-CbRGZOwd.js","/assets/file-spreadsheet-BpnzkewE.js","/assets/file-text-SJOqkR0g.js","/assets/flag-jb5iJoGk.js","/assets/flame-CUMIqGNm.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CaZK9Nxw.js","/assets/funnel-I3NiqDxr.js","/assets/hash-3qGRxkT3.js","/assets/history-CyCN8g-i.js","/assets/hourglass-DxH7ro8D.js","/assets/image-BGmqZiPe.js","/assets/image-off-mQ40JGqq.js","/assets/index-C6Dl-4nB.js","/assets/index-ftrCYFhP.css","/assets/keyboard-DgepXonA.js","/assets/languages-BRSTD2e7.js","/assets/layers-BaM-vyAW.js","/assets/leaderReason-DMQtKtVI.js","/assets/lightbulb-BZF9ghYX.js","/assets/link-2-VDcgURyW.js","/assets/list-checks-BfChooJ1.js","/assets/list-ordered-BetoctOu.js","/assets/lock-open-CuOc-lP9.js","/assets/log-in-DOKOOW4L.js","/assets/message-square--YcdO0pn.js","/assets/minimize-2-vuyD5eom.js","/assets/minus-DbshbiNi.js","/assets/paperclip-DIlFWDNp.js","/assets/pencil-BEiE-w9G.js","/assets/pencil-line-BVNH30ZN.js","/assets/personName-B4KId4zS.js","/assets/pin-4EX0MbjH.js","/assets/play-DdoaQYZR.js","/assets/presentation-CZ3zv7rH.js","/assets/prop-types-cqRH16Wq.js","/assets/radio-s4kYOWn3.js","/assets/react-apexcharts.esm-CkusWIxn.js","/assets/refresh-cw-B3huBGp8.js","/assets/repeat-DNfi2M_L.js","/assets/rotate-ccw-eFMcvE_A.js","/assets/rotate-cw-D27SAuFR.js","/assets/save-CdoARUrn.js","/assets/scale-CGUcFicC.js","/assets/scroll-text-ZZ-GGFDB.js","/assets/search-x-DhWQrD5W.js","/assets/segments-WgtMAmH9.js","/assets/send-BoJ3TYPI.js","/assets/settings-2-C5hFRqFr.js","/assets/shield-alert-SL49JeWp.js","/assets/shield-check-BZ99fU4X.js","/assets/shield-question-mark-CRvlBonC.js","/assets/shield-wOT4nQpH.js","/assets/siren-CDgzbtO5.js","/assets/smartphone-DL75wNxy.js","/assets/snowflake-COGtZXMR.js","/assets/square-Be6Tg_kS.js","/assets/square-check-big-CC_y86pm.js","/assets/star-7eIReVXF.js","/assets/statusBands-DWGyvDoI.js","/assets/table-2-CxK8aoPe.js","/assets/tag-BdSVzalL.js","/assets/trash-2-nKTv8HAt.js","/assets/trending-down-Csz3cxId.js","/assets/trending-up-_jn10E35.js","/assets/undo-2-BNCcTqMG.js","/assets/useChartTheme-DHLpZM47.js","/assets/useElementWidth-DRbb2WYf.js","/assets/useIsMobile-OgNDNCgl.js","/assets/useMutation-B7myGbjE.js","/assets/useStatusBands-Duov-jTI.js","/assets/user-check-QEgnIAS5.js","/assets/user-cog-bn6dOZby.js","/assets/user-minus-VP6-X0hb.js","/assets/users-Bbo3v_UM.js","/assets/verifyState-D5MlsHC7.js","/assets/video-_Iz1DrAX.js","/assets/warehouse-BG2D7MNi.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
