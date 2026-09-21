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

const BUILD = "2026-09-21T12:29:06.620Z";
const PRECACHE = ["/","/assets/AdminPanel-BN0GTQss.js","/assets/AnalysisBoard-B79wQaVV.js","/assets/Arc-CoJY5m0R.js","/assets/AttendanceModal-CtGxPyPj.js","/assets/BrigadirProfile-CUNrQN2E.js","/assets/BroadcastReceivers-DHXHhLer.js","/assets/BroadcastRecord-DlBeu7Dd.js","/assets/CatLockNotice-Bp1VGq_B.js","/assets/CategoryLegendModal-BrL0Y8Ga.js","/assets/CellConcerns-DpNE-Nw4.js","/assets/CellDetails-BR-GXIB8.js","/assets/CellFormModal-axswJvDr.js","/assets/CellLink-D-t0CMPU.js","/assets/Cells-D1NPrgf8.js","/assets/ColumnFilter-f8Ev8EvM.js","/assets/ColumnsPicker-C4n-NxT1.js","/assets/CommentsModal-CaE0j_N2.js","/assets/ComparisonTable-BH7jlWnu.js","/assets/Concerns-BmG1-1j4.js","/assets/ConfirmDialog-BBPvOSjh.js","/assets/Daily-C7HvVQxW.js","/assets/DataTable-B-r-ufxz.js","/assets/DateRangePicker-BkAPjViJ.js","/assets/DayReportView-HKlrB0H1.js","/assets/DayStepper-DTz7sbNK.js","/assets/DifferenceBreakdown-BH23MmQk.js","/assets/Downtime-BMbrwvJ9.js","/assets/Education-D3k4MS8v.js","/assets/EducationLesson-8BcgHnez.js","/assets/EmptyState-DmtvxFiN.js","/assets/FactorySelect-CLPW1LLr.js","/assets/FormField-DE75Je_x.js","/assets/Gamification-D2bpP46S.js","/assets/GroupBadge-BDQ0sKGK.js","/assets/HeatmapChart-CWd2GDyY.js","/assets/IdleCell-BeYXoz5B.js","/assets/KPICard-BSqU-fL-.js","/assets/Kaizen-BgfbpneF.js","/assets/KpiDeltaCard-C-vg8H8J.js","/assets/LangTextInput-Dre4Ru4m.js","/assets/Layout-Biw43JUB.js","/assets/LeaderDayReport-B1RWvZG-.js","/assets/LeaderUnitReport-x4_QVCsp.js","/assets/Leaderboard-BT730ST-.js","/assets/Leaders-BMRO7v_O.js","/assets/LiveOverview-CFQmWCid.js","/assets/Login-Cls007HG.js","/assets/NotFound-DdAuamD5.js","/assets/Overview-B9ZvkS4k.js","/assets/Pagination-B0wBRfJ4.js","/assets/PerenaladkaFactTable-CKbaqU2y.js","/assets/PlanFulfillment-D_0vT9K_.js","/assets/Production-CdTpbaAj.js","/assets/Profile-CnaCGcdY.js","/assets/ProofCamera-rJtr86lS.js","/assets/Quality-CEqT85ad.js","/assets/RichTextEditor-Cj7xhtfq.js","/assets/SearchInput-DeoROn56.js","/assets/SeasonalityHeatmap-BGORsbeB.js","/assets/SegmentedToggle-b6-ToPsG.js","/assets/SetupTimes-BqJzK5pz.js","/assets/ShiftDaily-BSdkU-Y2.js","/assets/Skeleton-DoXG9i9S.js","/assets/Staff-BfX8Io42.js","/assets/StatusBadge-Dqy5yGoy.js","/assets/StyledSelect-By4kKQYg.js","/assets/Targets-CYYUsBcQ.js","/assets/Tasks-B_bZ0Y5q.js","/assets/TimeField-C4Nr3Ixc.js","/assets/TimeWheelPicker-DJfHnom7.js","/assets/Toast-zDr_hV_d.js","/assets/Tooltip-RveUkyqf.js","/assets/TrendChart-DctQjd9Z.js","/assets/TripleSpeedometer-QKxWDRac.js","/assets/Trudoyomkost-DRdsWklG.js","/assets/UsersActivity-CCQbi2h5.js","/assets/WatchProgress-CSyrG_tc.js","/assets/WebLogin-Bqe0vUus.js","/assets/WorkerConcerns-CEqdrUEl.js","/assets/Workers-BJZjneHe.js","/assets/Zagruzka-CxBaKs8u.js","/assets/ZagruzkaCell-DmCMZv5J.js","/assets/alarm-clock-DAyO_nMg.js","/assets/api-3PWm4N-e.js","/assets/archive-BFky_QCg.js","/assets/archive-restore-BnvAbO03.js","/assets/arrow-down-C234eJni.js","/assets/arrow-left-BWVGGdiW.js","/assets/arrow-left-right-CccMztth.js","/assets/arrow-right-CGqRU0Je.js","/assets/arrow-up-DDKz-GOj.js","/assets/arrow-up-right-GRZUyK4w.js","/assets/award-BJeAQTp-.js","/assets/ban-DP5ppHnb.js","/assets/bot-NeZ-_O76.js","/assets/boxes-CAZ7r9r6.js","/assets/brigadirFilters-DOWpeYvR.js","/assets/broadcastTree-DKtMaHk5.js","/assets/building-2-C6P144ff.js","/assets/calendar-PiC6dxkD.js","/assets/calendar-clock-El74zgoc.js","/assets/calendar-days-OXU15mD-.js","/assets/calendar-range-CcsxJ909.js","/assets/camera-CWI7U9db.js","/assets/categories-DXgenAfS.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BE5St0B3.js","/assets/chart-line-D8Do2Tjr.js","/assets/chart-pie-KTuUw0P6.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-1sFRMy6A.js","/assets/check-Dmy52mZW.js","/assets/check-check-DN9rPqvr.js","/assets/chevron-left-DGYOtv01.js","/assets/chevrons-up-down-5rx1D8vW.js","/assets/circle-dashed-DcDElFd1.js","/assets/circle-dot-DsdYsDDq.js","/assets/circle-minus-DxF_-hTu.js","/assets/circle-slash-DDew0CME.js","/assets/circle-user-round-B-d-nteg.js","/assets/coins-BjLHc81M.js","/assets/compass-WzpXK-S0.js","/assets/concernCategories-Bc7kguko.js","/assets/copy-BBOi8_vH.js","/assets/corner-down-right-CJ1C8Cli.js","/assets/createLucideIcon-BgfYXlZs.js","/assets/exportXlsx-i-BziRU8.js","/assets/external-link-CGUqSPh0.js","/assets/file-clock-CirSgJSC.js","/assets/file-spreadsheet-6zVwNN2E.js","/assets/file-text-tV5iQ1kw.js","/assets/flag-moAQOL77.js","/assets/flame-KJSgL_bE.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-iB3Re0sl.js","/assets/funnel-D3jJfDKb.js","/assets/hash-DjEcNNJq.js","/assets/history-sUxICWKC.js","/assets/hourglass-DcxXLfI8.js","/assets/image-CF_vK-Xv.js","/assets/image-off-BILH65Wa.js","/assets/index-9jgoOc-D.js","/assets/index-BXqTV2jf.css","/assets/keyboard-Ci2umB2V.js","/assets/languages-B9II4pQi.js","/assets/layers-BZg-JvkF.js","/assets/leaderReason-BLUpZspZ.js","/assets/lightbulb-CVKM8Z0G.js","/assets/link-2-CFepH_N1.js","/assets/list-checks-BiAdTdvf.js","/assets/list-ordered-D7DMXbpH.js","/assets/lock-open-BF1SSzwN.js","/assets/log-in-CmYEC8qc.js","/assets/message-square-BbK8wVYH.js","/assets/minimize-2-CjFwHRg_.js","/assets/minus-cEn1-H6g.js","/assets/paperclip-BDR8XTbf.js","/assets/pencil-CoEMUvy8.js","/assets/pencil-line-BvptUq6a.js","/assets/personName-B4KId4zS.js","/assets/pin-CI0vkwTM.js","/assets/play-DukL2IPV.js","/assets/prop-types-TD47pYuz.js","/assets/radio-L0_bjyF1.js","/assets/react-apexcharts.esm-iP5DWWNn.js","/assets/refresh-cw-CwkJ03pf.js","/assets/repeat-d5-Fwzgg.js","/assets/rotate-ccw-DYoFeSTH.js","/assets/rotate-cw-BgZJXKvQ.js","/assets/save-B0KTVh8q.js","/assets/scale-B59cg-kl.js","/assets/scroll-text-BkAcA0-s.js","/assets/search-x-oB6Z2nlj.js","/assets/segments-pCYcnbun.js","/assets/send-BG4DkkQn.js","/assets/settings-2-nUj4lAXB.js","/assets/shield-CfJWuBI-.js","/assets/shield-alert-BUGfZuQT.js","/assets/shield-check-BM_GmvCE.js","/assets/shield-question-mark-Cgg6eTIB.js","/assets/siren-DbCI2TEe.js","/assets/smartphone-B6oF6v1S.js","/assets/snowflake-D1AIrwN4.js","/assets/square-C_2XNRKg.js","/assets/square-check-big-ClmoKu8u.js","/assets/star-BLyHT2Y0.js","/assets/statusBands-27gjyk3f.js","/assets/table-2-BvEHKbsJ.js","/assets/tag-CW-QM_9h.js","/assets/trash-2-t603OHWe.js","/assets/trending-down-CT3Py3TJ.js","/assets/trending-up-BBkhQv7t.js","/assets/undo-2-nGcyI7BQ.js","/assets/useChartTheme-DXxMr8VI.js","/assets/useElementWidth-DXm2uBWj.js","/assets/useIsMobile-DRPZOLA2.js","/assets/useMutation-DByWbeW0.js","/assets/useStatusBands-CIUf4sWQ.js","/assets/user-check-FjWwtJIU.js","/assets/user-cog-DD0Yt359.js","/assets/user-minus-CyqSqgPA.js","/assets/users-CJQQpvgP.js","/assets/verifyState-Bj7lgA9D.js","/assets/video-BBFM-2xv.js","/assets/warehouse-kly-DAvh.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
