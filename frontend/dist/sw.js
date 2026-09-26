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

const BUILD = "2026-09-26T08:37:17.040Z";
const PRECACHE = ["/","/assets/AdminPanel-DzWXTU89.js","/assets/AnalysisBoard-fhWU3soI.js","/assets/Arc-BEeRDV5v.js","/assets/ArcLegacy-CjgAtm24.js","/assets/AttendanceModal-Cw8mituB.js","/assets/BrigadirProfile-BHACNtvt.js","/assets/BroadcastReceivers-BsgUztlW.js","/assets/BroadcastRecord-Dj6ingQk.js","/assets/CatLockNotice-Cn4q06VK.js","/assets/CategoryLegendModal-CVZ3EY9l.js","/assets/CellConcerns-DhbJD2m2.js","/assets/CellDetails-BsJwm27P.js","/assets/CellFormModal-nUsDNyko.js","/assets/CellLink-BKBYcIFa.js","/assets/Cells-foS2ZX9u.js","/assets/ColumnFilter-DyJwnjrT.js","/assets/ColumnsPicker-DUcRtHXH.js","/assets/CommentsModal-BXDFcR0O.js","/assets/ComparisonTable-CZ3C5Emg.js","/assets/Concerns-D9S1mm3U.js","/assets/ConfirmDialog-BROYfnfo.js","/assets/Daily-lbAp6lRM.js","/assets/DataTable-wqJvdgxw.js","/assets/DateRangePicker-DnDpJH-G.js","/assets/DayReportView-BnsXonWh.js","/assets/DayStepper-BhnralcA.js","/assets/DifferenceBreakdown-BOKK0Cpa.js","/assets/Downtime-iz-CIDWl.js","/assets/Education-C6nZrGyp.js","/assets/EducationLesson-B2MpLrar.js","/assets/EmptyState-B5pknnZ5.js","/assets/Exam-BPUo5yN6.js","/assets/FactorySelect-Cy01V2aa.js","/assets/Gamification-B9Hs4qgW.js","/assets/GroupBadge-_wtFoR3K.js","/assets/HeatmapChart-QqGzLvs0.js","/assets/IdleCell-B4UXzOwO.js","/assets/KPICard-CF0SJkRj.js","/assets/Kaizen-C5e9SQP8.js","/assets/KpiDeltaCard-DVJb5V8e.js","/assets/LangTextInput-xz_hsu9r.js","/assets/Layout-BeneYF7J.js","/assets/LeaderDayReport-CY4LpEZs.js","/assets/LeaderUnitReport-DleU0IK9.js","/assets/Leaderboard-gEJn-2Tl.js","/assets/Leaders-DmL5A_dK.js","/assets/LiveOverview-B3Emjuf_.js","/assets/Login-Y-HE-d9p.js","/assets/NotFound-sGPwNm8s.js","/assets/Overview-CBsLx9QP.js","/assets/Pagination-D0O87p6G.js","/assets/PerenaladkaFactTable-BaotRtyC.js","/assets/PlanFulfillment-NBwhRtv9.js","/assets/Production-h3U-WsLQ.js","/assets/Profile-rl9oMxNg.js","/assets/ProofCamera-DYknW6lR.js","/assets/Quality-DfLrHo5T.js","/assets/RequestStateChip-B9eFYJmk.js","/assets/RichTextEditor-CVL2LGzi.js","/assets/SearchInput-FgT4wN_M.js","/assets/SeasonalityHeatmap-BBv0_NMc.js","/assets/SegmentedToggle-BITtaEzV.js","/assets/SetupTimes-CJ-AG175.js","/assets/ShiftDaily-DcDucbqU.js","/assets/Staff-BGJu4H1f.js","/assets/StatusBadge-DH_cXNIz.js","/assets/Targets-BPfmGaRj.js","/assets/Tasks-DiISvGzd.js","/assets/TimeWheelPicker-Cdmv6aQu.js","/assets/Tooltip-DhUTAfRI.js","/assets/TrendChart-xv6rXNSP.js","/assets/TripleSpeedometer-gm6V5iTU.js","/assets/Trudoyomkost-b8iV3700.js","/assets/UsersActivity-B389CCDX.js","/assets/WatchProgress-DBSO16-h.js","/assets/WebLogin-D_RPn2Vt.js","/assets/WorkerConcerns-8tGzvv6r.js","/assets/Workers-D27ej63A.js","/assets/Zagruzka-CKe5dQK_.js","/assets/ZagruzkaCell-D3pPvbkI.js","/assets/alarm-clock-Cc4GdNHf.js","/assets/api-Dsl0zpTK.js","/assets/archive-DlVSPJif.js","/assets/archive-restore-CiCPqKDp.js","/assets/arrow-down-Dt-7D9TL.js","/assets/arrow-left-BfqPPi9V.js","/assets/arrow-left-right-l9fRTNSV.js","/assets/arrow-up-jaBUDcw9.js","/assets/arrow-up-right-CYq-M1d7.js","/assets/award-8GyuD31t.js","/assets/ban-Ue1RipnE.js","/assets/bot-C9q237za.js","/assets/boxes-CzJLAeVy.js","/assets/brigadirFilters-D4zhKeYJ.js","/assets/broadcastTree-gqDysyU7.js","/assets/building-2-BjPI_LY_.js","/assets/calendar-clock-D3MgRCWo.js","/assets/calendar-days-RpWm5W1U.js","/assets/calendar-range-DUoWTPp7.js","/assets/calendar-sxEvQdS5.js","/assets/camera-Cvc5AFfs.js","/assets/categories-BU90G-Xb.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BoFu3ZpV.js","/assets/chart-line-e1PBnrrO.js","/assets/chart-pie-Bcuhv_N7.js","/assets/chartRange-D0v-OF0Y.js","/assets/check-check-C5ymPwl7.js","/assets/chevron-left-C8TuLFeC.js","/assets/chevrons-up-down-CGtjlswU.js","/assets/circle-check-big-C2VH-oir.js","/assets/circle-dashed-C8cDVlRU.js","/assets/circle-dot-stY1Vpbr.js","/assets/circle-minus-BYnntQb2.js","/assets/circle-slash-CYAhS2tA.js","/assets/circle-user-round-BEohQkdN.js","/assets/coins-DjDSdY0N.js","/assets/compass-Dx-_aWmP.js","/assets/concernCategories-BaMa-gFv.js","/assets/copy-DzcuhJrH.js","/assets/corner-down-right-DuF_0zVx.js","/assets/createLucideIcon-CjUiWna7.js","/assets/exportXlsx-CRZWVRLo.js","/assets/external-link-S9qew-j3.js","/assets/file-clock-MJynqMcI.js","/assets/file-exclamation-point-CSotAos_.js","/assets/file-spreadsheet-DvvqVCQS.js","/assets/file-text-CmpsjofY.js","/assets/flag-Cucb3Jgj.js","/assets/flame-BkqrRK4D.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-NvBqyU8S.js","/assets/hash-Bpq3wv-7.js","/assets/history-3b_qIQ4o.js","/assets/hourglass-HSbv5zyU.js","/assets/image-CY5sFK0v.js","/assets/image-off-Dj22XqMw.js","/assets/index-DwPevLKe.css","/assets/index-MMsAnG7_.js","/assets/key-round-Dm-i96zk.js","/assets/keyboard-DVEB9oXt.js","/assets/languages-B4is9YAA.js","/assets/layers-CGCi8XaL.js","/assets/leaderReason-D4CtzQEJ.js","/assets/lightbulb-EUFW2QME.js","/assets/link-2-CaUbPv9H.js","/assets/list-checks-Ba6LtTKc.js","/assets/list-ordered-DRtiukPo.js","/assets/list-tree-BqOkMZDl.js","/assets/lock-open-DzLowbBH.js","/assets/log-in-76LnvKDp.js","/assets/message-square-LKYNVVRh.js","/assets/minimize-2-CQ9jyvR8.js","/assets/package-check-DzcO492x.js","/assets/paperclip-Db_Jwhkr.js","/assets/pencil-Cg6-aG1f.js","/assets/personName-B4KId4zS.js","/assets/pin-C41YXKfw.js","/assets/play-DaLke0NC.js","/assets/presentation-CL9GW7Kf.js","/assets/prop-types-Dn6Ac7yu.js","/assets/radio-Dw7ySmU9.js","/assets/react-apexcharts.esm-cZW1P3C2.js","/assets/repeat-B2tm3sTP.js","/assets/rotate-ccw-DBSnigt5.js","/assets/rotate-cw-C7FpOkGt.js","/assets/save-CRLFg2Wc.js","/assets/scale-Dp2wy_h7.js","/assets/scroll-text-DXiGxMzO.js","/assets/search-x-Due0UFLP.js","/assets/segments-BAT2EUlL.js","/assets/send-DNJx4NbI.js","/assets/settings-2-_FSViFzc.js","/assets/shield-BTK15b5k.js","/assets/shield-alert-B04LaHYb.js","/assets/shield-check-DqJbxon5.js","/assets/shield-question-mark-3gw-Xtut.js","/assets/siren-CfEeSY_y.js","/assets/smartphone-BsM0EiO8.js","/assets/snowflake-CEyfLQSy.js","/assets/square-BUJ8EPwe.js","/assets/square-check-big-CPBcXiPS.js","/assets/star-DQGHUYYY.js","/assets/statusBands-gHB1UfrT.js","/assets/store-l7Cy30c_.js","/assets/table-2-VdAaGArr.js","/assets/tag-BMM3pAbA.js","/assets/trending-down-C9FgDcEs.js","/assets/trending-up-Bq-6PK-c.js","/assets/triangle-alert-C8SvMev2.js","/assets/undo-2-BBcwAl5u.js","/assets/useChartTheme-IERCHz_d.js","/assets/useElementWidth-Gi9iK7Xv.js","/assets/useIsMobile-D94jeKzu.js","/assets/useMutation-bAZZXhT0.js","/assets/useStatusBands-DWUsVmZH.js","/assets/user-CZatF4Xy.js","/assets/user-check-CBIZJQ5V.js","/assets/user-cog-8o7rED9P.js","/assets/user-minus-Bdp8iDrY.js","/assets/users-NYcniy6r.js","/assets/verifyState-oBk38zH4.js","/assets/video-kzFl8PSn.js","/assets/warehouse-BuKW_zxE.js","/assets/zap--Ax6pV50.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
