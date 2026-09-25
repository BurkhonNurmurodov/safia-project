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

const BUILD = "2026-09-25T13:23:26.209Z";
const PRECACHE = ["/","/assets/AdminPanel-ZejS3Z4w.js","/assets/AnalysisBoard-BsDwU9Tu.js","/assets/Arc-CJoqKEmG.js","/assets/ArcLegacy-orhu9kaN.js","/assets/AttendanceModal-BJm5ZE-G.js","/assets/BrigadirProfile-BbXQ_iha.js","/assets/BroadcastReceivers-BGZ7zLkO.js","/assets/BroadcastRecord-67VoqFyI.js","/assets/CatLockNotice-Bj7IBMSj.js","/assets/CategoryLegendModal-BjfwaMVj.js","/assets/CellConcerns-DWmreKkj.js","/assets/CellDetails-DETvw99s.js","/assets/CellFormModal-a2znvO6A.js","/assets/CellLink-D13dIeaB.js","/assets/Cells-BmOxFNMH.js","/assets/ColumnFilter-5YQGGDEo.js","/assets/ColumnsPicker-DwmI0Pwb.js","/assets/CommentsModal-BvwcdCtF.js","/assets/ComparisonTable-DUWu8TR1.js","/assets/Concerns-BUm-5cF7.js","/assets/ConfirmDialog-DMAifxV8.js","/assets/Daily-Dz03ScYW.js","/assets/DataTable-Bp1GqShV.js","/assets/DateRangePicker-CxDN8cq1.js","/assets/DayReportView-C9FRNo86.js","/assets/DayStepper-BDj1Yd0M.js","/assets/DifferenceBreakdown-CDJhFaK1.js","/assets/Downtime-BebgNWQg.js","/assets/Education-BvCbf1eD.js","/assets/EducationLesson-C1aXMjCq.js","/assets/EmptyState-QwuciCYM.js","/assets/Exam-B8YXF_4S.js","/assets/FactorySelect-Bv_YXocg.js","/assets/Gamification-DiuRc7HL.js","/assets/GroupBadge-DaIf9buo.js","/assets/HeatmapChart-B7A3g4lG.js","/assets/IdleCell-D6-MEDsM.js","/assets/KPICard-BZUfs07g.js","/assets/Kaizen-DI15VhEV.js","/assets/KpiDeltaCard-DXiwV3a4.js","/assets/LangTextInput-I3l5G4T2.js","/assets/Layout-avWzWokL.js","/assets/LeaderDayReport-C7AAV8hB.js","/assets/LeaderUnitReport-BuCOio0R.js","/assets/Leaderboard-VgQeHbZv.js","/assets/Leaders-DlLBc6T4.js","/assets/LiveOverview-BTIP1rfM.js","/assets/Login-DEOMITnw.js","/assets/NotFound-Cl4XRr9x.js","/assets/Overview-BDet317z.js","/assets/Pagination-BEx6-BeF.js","/assets/PerenaladkaFactTable-BMmif1pR.js","/assets/PlanFulfillment-oAkhCfiJ.js","/assets/Production-TqrcYC3R.js","/assets/Profile-B0pYpoJk.js","/assets/ProofCamera-BmvRIHRe.js","/assets/Quality-C94Tv61N.js","/assets/RequestStateChip-CzIUCd_V.js","/assets/RichTextEditor-C5Ly92Hv.js","/assets/SearchInput-CLBGrKjX.js","/assets/SeasonalityHeatmap-CuO6iyCk.js","/assets/SegmentedToggle-DtiNrhWB.js","/assets/SetupTimes-BcdQnVZ0.js","/assets/ShiftDaily-B3dZ811s.js","/assets/Staff-jkzmoY19.js","/assets/StatusBadge-Cy17cw7q.js","/assets/Targets-BVkSifFu.js","/assets/Tasks-CwL4j_TI.js","/assets/TimeWheelPicker-CX8Kk3p7.js","/assets/Tooltip-BD211MzI.js","/assets/TrendChart-DkiaYTzN.js","/assets/TripleSpeedometer-07DUu_lh.js","/assets/Trudoyomkost-BJDB75a_.js","/assets/UsersActivity-BmQbB1u9.js","/assets/WatchProgress-DtZgDl03.js","/assets/WebLogin-DbErHj60.js","/assets/WorkerConcerns-BjT9RQIb.js","/assets/Workers-wBZk9E8M.js","/assets/Zagruzka-DI_lJ49E.js","/assets/ZagruzkaCell-CYfDPYvn.js","/assets/alarm-clock-BSMbPGoo.js","/assets/api-CA1ZTb4i.js","/assets/archive-D-tsLtID.js","/assets/archive-restore-4yCpc67M.js","/assets/arrow-down-DTSdzJob.js","/assets/arrow-left-BsX-dbjy.js","/assets/arrow-left-right-DwpL-nue.js","/assets/arrow-up-Dk4lIjWo.js","/assets/arrow-up-right-BuFFvOng.js","/assets/award-BB5RWfL3.js","/assets/ban-C3pWQRkL.js","/assets/bot-ZqadwxMu.js","/assets/boxes-C2lv9NoG.js","/assets/brigadirFilters-Q3CX0MlB.js","/assets/broadcastTree-CrvAFT0n.js","/assets/building-2-BMrbXuD1.js","/assets/calendar-XYDFb9ag.js","/assets/calendar-clock-DQ1it1jq.js","/assets/calendar-days-iC4d7GBJ.js","/assets/calendar-range-1Y1qlQXB.js","/assets/camera-CpmXmOZg.js","/assets/categories-C9U8rGBJ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D9fnuaJE.js","/assets/chart-line-SD4JxNc3.js","/assets/chart-pie-Bmr-3ybx.js","/assets/chartRange-C9ba7ZUk.js","/assets/check-check-DxNQ-2sq.js","/assets/chevron-left-eO4ELfhk.js","/assets/chevrons-up-down-Xx4lNSTf.js","/assets/circle-check-big-BjnCfjnM.js","/assets/circle-dashed-CwmIhfLr.js","/assets/circle-dot-DXYUjvOx.js","/assets/circle-minus-PC9-9sOu.js","/assets/circle-slash-CRcBIqmr.js","/assets/circle-user-round-BrbiL_CW.js","/assets/coins-BqjvkO_N.js","/assets/compass-fck4VBKR.js","/assets/concernCategories-haBCwbdF.js","/assets/copy-BL0OZSqG.js","/assets/corner-down-right-DPBmoqRr.js","/assets/createLucideIcon-n9GZI0xP.js","/assets/exportXlsx-y66LDsee.js","/assets/external-link-DI81SZ9o.js","/assets/file-clock-DisXYESw.js","/assets/file-exclamation-point-Im6Ir1gn.js","/assets/file-spreadsheet-Br7bZg2k.js","/assets/file-text-BURTQd2W.js","/assets/flag-fI2iRhwJ.js","/assets/flame-v1WyEFsc.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DI-a0pCg.js","/assets/hash-BV7E3QAp.js","/assets/history-BcYJzflq.js","/assets/hourglass-CrHbcKVL.js","/assets/image-VUJjXA3v.js","/assets/image-off-BwDU0cec.js","/assets/index-BTZsppTH.css","/assets/index-CCZBXu05.js","/assets/key-round-DdpwfNHn.js","/assets/keyboard-DPhUE36c.js","/assets/languages-Dj4pWNrO.js","/assets/layers-UCSPATJW.js","/assets/leaderReason-DMoWd_ck.js","/assets/lightbulb-B7rBd6Mz.js","/assets/link-2-DWBDsT4B.js","/assets/list-checks-4UKuakv_.js","/assets/list-ordered-W6CN9bkX.js","/assets/list-tree-DJCwMRKK.js","/assets/lock-open-CAdbQuLU.js","/assets/log-in-BzU1mDPp.js","/assets/message-square-CuJ7iYg5.js","/assets/minimize-2-DnyXzjif.js","/assets/package-check-BU9MEKks.js","/assets/paperclip-DWWepi7U.js","/assets/pencil-BrakNps3.js","/assets/personName-B4KId4zS.js","/assets/pin-DnXS2KT7.js","/assets/play-Cr3h2Uw2.js","/assets/presentation-CgltC1_r.js","/assets/prop-types-ZxtKjSf2.js","/assets/radio-BvS3f0-8.js","/assets/react-apexcharts.esm-DzfFDCoq.js","/assets/repeat-KpC5bx_J.js","/assets/rotate-ccw-BaT1ImYY.js","/assets/rotate-cw-scfkpb4I.js","/assets/save-FNo2epdb.js","/assets/scale-uMxmPE5Y.js","/assets/scroll-text-BLGwslxJ.js","/assets/search-x-B0IOIudI.js","/assets/segments-CZaBB9bt.js","/assets/send-C3U-xlDd.js","/assets/settings-2-gxZ5KXx3.js","/assets/shield-DfLAXNZX.js","/assets/shield-alert-C2CgM-lP.js","/assets/shield-check-B5AgeLWE.js","/assets/shield-question-mark-BGinE9IM.js","/assets/siren-DuTc61xS.js","/assets/smartphone-DwMKbcKN.js","/assets/snowflake-CRinI9fo.js","/assets/square-BxwT9cYC.js","/assets/square-check-big-B41vAC9e.js","/assets/star-CkE0EBpR.js","/assets/statusBands-YpI_ddO9.js","/assets/store-DsnCm61E.js","/assets/table-2-DZJWBaQs.js","/assets/tag-Co2qFQd9.js","/assets/trending-down-BAmz5r-b.js","/assets/trending-up-4p33NWQ1.js","/assets/triangle-alert-CD_z76mN.js","/assets/undo-2-CpUrsjQB.js","/assets/useChartTheme-DW2N5dAU.js","/assets/useElementWidth-nx74V8NL.js","/assets/useIsMobile-CI7OROvd.js","/assets/useMutation-Cs1sGx8P.js","/assets/useStatusBands-CPaQjCJn.js","/assets/user-B1KDyVS9.js","/assets/user-check-zPDwepHh.js","/assets/user-cog-CDeJ8I4D.js","/assets/user-minus-DpUkjYd2.js","/assets/users-BjLGB9jT.js","/assets/verifyState-C3lUQ9he.js","/assets/video-BIo8nt-p.js","/assets/warehouse-DWq7JGa5.js","/assets/zap-BeNa9dkQ.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
