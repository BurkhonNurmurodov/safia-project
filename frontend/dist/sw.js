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

const BUILD = "2026-09-28T14:17:29.393Z";
const PRECACHE = ["/","/assets/AdminPanel-CiPwiAOx.js","/assets/AnalysisBoard-Dn9TKR0e.js","/assets/Arc-Ck4PyMi9.js","/assets/ArcLegacy-xXwvXJxb.js","/assets/AttendanceModal-BBUx5l4I.js","/assets/BrigadirProfile-CvbSYKfm.js","/assets/BroadcastReceivers-DpTBqg2G.js","/assets/BroadcastRecord-DBXKitcG.js","/assets/CatLockNotice-DQhr6OGz.js","/assets/CategoryLegendModal-Dc7zZfHZ.js","/assets/CellConcerns-C9mcjR12.js","/assets/CellDetails-OxI7P_DX.js","/assets/CellFormModal-BfaL3qe5.js","/assets/CellLink-D4Ry9Ahv.js","/assets/Cells-w2HgsU1n.js","/assets/ColumnFilter-D_6Hf8jH.js","/assets/ColumnsPicker-DBKEe5Ug.js","/assets/CommentsModal-CEU66cF-.js","/assets/ComparisonTable-8Fp_iHRv.js","/assets/Concerns-KDE0E6NS.js","/assets/ConfirmDialog-J9lzC4AL.js","/assets/Daily-BuQ8j_lT.js","/assets/DataTable-DFF-Cwbo.js","/assets/DateRangePicker-DwR7q-wk.js","/assets/DayReportView-TX9w6aw7.js","/assets/DayStepper-C181BKBe.js","/assets/DifferenceBreakdown-BNqRi6t5.js","/assets/Downtime-BUQiT40c.js","/assets/Education-Clb4N8Rm.js","/assets/EducationLesson-Dm0HCNf8.js","/assets/EmptyState-DzQp64Xm.js","/assets/Exam-C0Rkor53.js","/assets/FactorySelect-Czjrwb0H.js","/assets/Gamification-B-tw98v3.js","/assets/GroupBadge-B95Fq9za.js","/assets/HeatmapChart-ClwuhIJK.js","/assets/IdleCell-Dj54b1KO.js","/assets/KPICard-Ds3CTFSh.js","/assets/Kaizen-ChV0yHlZ.js","/assets/KpiDeltaCard-BuuAvlVM.js","/assets/LangTextInput-C2PgVRE6.js","/assets/Layout-D6iC_Z3c.js","/assets/LeaderAppeal-DOrZ-_s_.js","/assets/LeaderDayReport-Lot-4tGA.js","/assets/LeaderUnitReport-D_PeJzzH.js","/assets/Leaderboard-DrpbCBgs.js","/assets/Leaders-BWqwLVQ0.js","/assets/Lightbox-U82E63JW.js","/assets/LiveOverview-DrXov-pX.js","/assets/Login-BWFtXjLq.js","/assets/NotFound-BEmvsAJr.js","/assets/Overview-B912VbqR.js","/assets/Pagination-D7aBXaRg.js","/assets/PerenaladkaFactTable-DqeXZYBd.js","/assets/PlanFulfillment-DumpFz4M.js","/assets/Production-GH1PjB-H.js","/assets/Profile-CqYEdf0u.js","/assets/ProofCamera-Dss3MuOf.js","/assets/ProofPhoto-CzriLNh4.js","/assets/Quality-B2ez3Uhl.js","/assets/RequestStateChip-C0k9MKoZ.js","/assets/RichTextEditor-DOIrb4e4.js","/assets/SaveState-BbWHpSq9.js","/assets/SearchInput-2XMurt_N.js","/assets/SeasonalityHeatmap-npaxaeyY.js","/assets/SegmentedToggle-BBF5DVKE.js","/assets/SetupTimes-DPr0tqQp.js","/assets/ShiftDaily-BL6KoeXP.js","/assets/Staff-lWeW4xdY.js","/assets/StatusBadge-b0ud9MIU.js","/assets/TargetGoal-Uy-ggovN.js","/assets/Targets-BdAH9Y82.js","/assets/Tasks-CdiEVVP8.js","/assets/TimeWheelPicker-E4MDJ_cG.js","/assets/Tooltip-64sqxCv9.js","/assets/TrendChart-B1nJ3_4T.js","/assets/TripleSpeedometer-B_IW8yWh.js","/assets/Trudoyomkost-Bp_FojeI.js","/assets/UsersActivity-BVzyWFTy.js","/assets/WatchProgress-Km48rR3t.js","/assets/WebLogin-DXtA_I_R.js","/assets/WorkerConcerns-Bdck38kg.js","/assets/Workers-CLFAL47W.js","/assets/Zagruzka-BibtMi18.js","/assets/ZagruzkaCell-EUNhxYR8.js","/assets/alarm-clock-6vkWcJnz.js","/assets/api-Bg30EDlS.js","/assets/archive-B-VF2lCY.js","/assets/archive-restore-DdM3M6_Z.js","/assets/arrow-down-jWA-x0WT.js","/assets/arrow-left-MJD2BYDQ.js","/assets/arrow-left-right-6_xmqhbh.js","/assets/arrow-up-Ck0AaPUr.js","/assets/arrow-up-right-CY6VMeWu.js","/assets/award-RUec8-8s.js","/assets/ban-B-zeUQFu.js","/assets/bot-FiKxjHyr.js","/assets/boxes-DtpwWPmk.js","/assets/brigadirFilters-BV8Kb7zg.js","/assets/broadcastTree-CaO0Lybu.js","/assets/building-2-DSWAN418.js","/assets/calendar-4ZxxxEWT.js","/assets/calendar-clock-CBR4Eirk.js","/assets/calendar-days-Cn-QDd6Z.js","/assets/calendar-range-wDliBriB.js","/assets/camera-8ujKXavV.js","/assets/categories-BjJDMUbN.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Ft0Rd7S0.js","/assets/chart-line-BRkJO6tJ.js","/assets/chart-pie-C2GKapW7.js","/assets/chartRange-HIhR_JfP.js","/assets/chevron-left-Dc46fHF6.js","/assets/chevrons-up-down-C6y1gfip.js","/assets/circle-check-big-ApLTiuu4.js","/assets/circle-dot-DKbb0R1t.js","/assets/circle-minus-ChCYoiuX.js","/assets/circle-slash-DMmHVsq9.js","/assets/circle-user-round-DxPOb37S.js","/assets/cloud-off-Cup9sQxB.js","/assets/cloud-upload-Dujc6z79.js","/assets/compass-Cvik7Xro.js","/assets/concernCategories-BNQey5RU.js","/assets/copy-BsEYMSyF.js","/assets/corner-down-right-ZNdZt8FY.js","/assets/createLucideIcon-CAel4C1c.js","/assets/es-Cujyx9Mm.js","/assets/exportXlsx-CRmPZ0o3.js","/assets/external-link-CUNvAgBH.js","/assets/file-clock-UHejgxMM.js","/assets/file-exclamation-point-CoyVPR48.js","/assets/file-spreadsheet-X-7qIdH8.js","/assets/file-text-Bj40YDKz.js","/assets/flag-DCltuNLM.js","/assets/flame-C6WAhlbW.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BMGO-2Y2.js","/assets/hash-ibfo6aEO.js","/assets/history-_ZfD1wcn.js","/assets/hourglass-D5jNcr8J.js","/assets/image-Bd4jDz4c.js","/assets/image-off-CqD0Yu99.js","/assets/index-C3D9C9ta.js","/assets/index-TBzEnSGJ.css","/assets/key-round-C6utJptL.js","/assets/keyboard-BJY4JPTo.js","/assets/languages-BDgtkPAA.js","/assets/layers-BtM2yFyw.js","/assets/leaderReason-CUUygBkn.js","/assets/lightbulb-Byd9nMIh.js","/assets/link-2-CiOv4e5c.js","/assets/list-checks-DyESPw0i.js","/assets/list-ordered-DpL-Ghcs.js","/assets/list-tree-_OdVYbdh.js","/assets/lock-open-BcMZrdyb.js","/assets/log-in-xAr2o4eH.js","/assets/message-square-DTqpT6PP.js","/assets/minimize-2-CLU-Q1Nd.js","/assets/package-check-BihSI2ZG.js","/assets/paperclip-CMB3ai6I.js","/assets/pencil-Bs10If4w.js","/assets/personName-B4KId4zS.js","/assets/pin-BsQBUnND.js","/assets/pin-off-D24VVZ_Q.js","/assets/play-CVf2ngSq.js","/assets/presentation-DZk5sKrj.js","/assets/prop-types-DqOu9vKJ.js","/assets/radio-IhzLfW1s.js","/assets/react-apexcharts.esm-D43LupQH.js","/assets/repeat-DbIde2aQ.js","/assets/rotate-ccw-BwbUMoZV.js","/assets/rotate-cw-DNDlXVT-.js","/assets/save-D2ImyeDg.js","/assets/scale-CLhjwBHL.js","/assets/scroll-text-TBh5EFmd.js","/assets/search-x-D8Aqhwqj.js","/assets/segments-DZ38ECHl.js","/assets/send-DC2khmXD.js","/assets/settings-2-b-EjdRv7.js","/assets/shield-DAF_oCOB.js","/assets/shield-alert-DNejnzOo.js","/assets/shield-check-CZ8XMIWW.js","/assets/shield-question-mark-Ba1zwpw8.js","/assets/siren-BasXBHHy.js","/assets/smartphone-3dhrCIkE.js","/assets/snowflake-DJyA4Odi.js","/assets/square-BuESXPlC.js","/assets/square-check-big-DpjePINg.js","/assets/star-BOLohF0i.js","/assets/statusBands-4s1mnrCU.js","/assets/store-COlfk0Zx.js","/assets/table-2-BOAB9_Gs.js","/assets/tag-B_wPK_oN.js","/assets/trending-down-CYOPYVDO.js","/assets/trending-up-Be1TgECr.js","/assets/undo-2-sL3-AQ2F.js","/assets/useChartTheme-C6vlRZn4.js","/assets/useElementWidth-DNUyKya9.js","/assets/useIsMobile-CYaC-sMu.js","/assets/useMutation-Dl7D0dDS.js","/assets/useStatusBands-D_oDIQYc.js","/assets/user-CzNvJYWx.js","/assets/user-check-B2XrB9AW.js","/assets/user-cog-CCPzSSTB.js","/assets/user-minus-BHqr0WLw.js","/assets/users-DpNMqxBG.js","/assets/verifyState-LxKTJZBC.js","/assets/video-BxOe83Hx.js","/assets/wallet-B15hPtPc.js","/assets/warehouse-BQw7J1Um.js","/assets/zap-BIKUa1FL.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
