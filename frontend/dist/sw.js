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

const BUILD = "2026-09-20T00:27:46.054Z";
const PRECACHE = ["/","/assets/AdminPanel-DwwbBdHh.js","/assets/AnalysisBoard-2rMTGtIe.js","/assets/Arc-bMsB65yb.js","/assets/AttendanceModal-taxGtlN4.js","/assets/BrigadirProfile-_4Q4WRVM.js","/assets/BroadcastReceivers-ZvHNe-x9.js","/assets/BroadcastRecord-DhGLoyMZ.js","/assets/CatLockNotice-BpOOicV6.js","/assets/CategoryLegendModal-kU6_-jzp.js","/assets/CellConcerns-OAvsb0lk.js","/assets/CellDetails-DFatP2Br.js","/assets/CellFormModal-DF0sXgU_.js","/assets/CellLink-D6RX2nC7.js","/assets/Cells-DYbB1RAO.js","/assets/ColumnFilter-v0fAx1iE.js","/assets/ColumnsPicker-BFX_iYIQ.js","/assets/CommentsModal-hDur9RiB.js","/assets/ComparisonTable-TJygoS4V.js","/assets/Concerns-DuAvUiLT.js","/assets/ConfirmDialog-C4JxrEX_.js","/assets/Daily-CvLjZEH9.js","/assets/DataTable-D1Qbimla.js","/assets/DateRangePicker-7yHOmxAe.js","/assets/DayReportView-DyrOmGO5.js","/assets/DayStepper-DltcFjL9.js","/assets/DifferenceBreakdown-BfQdRTOG.js","/assets/Downtime-B7vhkhrn.js","/assets/Education-OxFxYXzP.js","/assets/EducationLesson-CznMl67z.js","/assets/EmptyState-CWLlRTTV.js","/assets/FactorySelect-Dq0fsFp0.js","/assets/FormField-BsZLLYgY.js","/assets/Gamification-Ckve25c5.js","/assets/GroupBadge-C8yrcBce.js","/assets/HeatmapChart-BS7SF_hh.js","/assets/IdleCell-BEeN1mTb.js","/assets/KPICard-BJ42tAX1.js","/assets/Kaizen-Bfy19shb.js","/assets/KpiDeltaCard-DN3VByse.js","/assets/LangTextInput-Bp-V-nDj.js","/assets/Layout-DJX1mlZ5.js","/assets/LeaderDayReport-DX4ZcTwk.js","/assets/LeaderUnitReport-Cn_wEOZ2.js","/assets/Leaderboard-LcWwxZnP.js","/assets/Leaders-Cwg74w6x.js","/assets/LiveOverview-CtOoxnta.js","/assets/Login-DMNdmLjI.js","/assets/NotFound-CVTQW0tm.js","/assets/Overview-6yCWV4st.js","/assets/Pagination-BdfsMOgC.js","/assets/PerenaladkaFactTable-CNmB2U4I.js","/assets/PlanFulfillment-C041f-Vk.js","/assets/Production-B7mwBXY0.js","/assets/Profile-COdWCa3m.js","/assets/ProofCamera-DTUezIeM.js","/assets/Quality-BaB_re_8.js","/assets/RichTextEditor-DdWXw5lC.js","/assets/SearchInput-CX_Dlhfv.js","/assets/SeasonalityHeatmap-JPdH-bua.js","/assets/SegmentedToggle-CZfY05Nw.js","/assets/SetupTimes-DLZbEZR2.js","/assets/ShiftDaily-DydQx_r7.js","/assets/Skeleton-Dt7ia2lH.js","/assets/Staff-D-m50EyD.js","/assets/StatusBadge-lP8qDvVV.js","/assets/StyledSelect-BIjMuVW2.js","/assets/Tasks-6CTlJvPz.js","/assets/TimeField-GeRksiDm.js","/assets/TimeWheelPicker-HxaHrqu0.js","/assets/Toast-dnWM2vxp.js","/assets/Tooltip-CfQP1Y6u.js","/assets/TrendChart-DzxyAPYB.js","/assets/TripleSpeedometer-ByzZ9gi_.js","/assets/Trudoyomkost-D7QaqN7d.js","/assets/UsersActivity-GulLXP4B.js","/assets/WatchProgress-Bc5wqqhZ.js","/assets/WebLogin-7w88wdGx.js","/assets/WorkerConcerns-DPdVLNKI.js","/assets/Workers-Baw2jkyn.js","/assets/Zagruzka-CTuRhUcb.js","/assets/ZagruzkaCell-COrsFgaQ.js","/assets/alarm-clock-BeGcowYJ.js","/assets/api-C87rKc81.js","/assets/archive-DRp_3Mdz.js","/assets/archive-restore-BMSRTrSv.js","/assets/arrow-down-CGF0HssV.js","/assets/arrow-left-Dmamnv-u.js","/assets/arrow-left-right-Bylc2dfv.js","/assets/arrow-right-DQHhXAqE.js","/assets/arrow-up-1QJLXPMX.js","/assets/award-OHWL4D1L.js","/assets/ban-C32LlQ37.js","/assets/bot-CCwpEs5A.js","/assets/boxes-hzEx9qP3.js","/assets/brigadirFilters-DtgcyGrY.js","/assets/broadcastTree-Dv_NeDv_.js","/assets/building-2--UbUfvhg.js","/assets/calendar-BThzMCGR.js","/assets/calendar-clock-6Go5dW4a.js","/assets/calendar-days-BHIeTnvL.js","/assets/calendar-range-8X2yKHj0.js","/assets/camera-DqPKS7-J.js","/assets/categories-DfqE7Rx0.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DcJ_3Smj.js","/assets/chart-line-yEgIvmcj.js","/assets/chart-pie-D83ix0U1.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-ufsOkylR.js","/assets/check-CAupQ4Vs.js","/assets/check-check-BLTNIwfW.js","/assets/chevron-left-BhALScse.js","/assets/chevrons-up-down-Cfn5dPkC.js","/assets/circle-dot-CpWedaMq.js","/assets/circle-minus-CdRTkVac.js","/assets/circle-slash-CIoLF3nf.js","/assets/circle-user-round-D5nFyKAA.js","/assets/compass-CBEE1ReQ.js","/assets/concernCategories-BW_TZEwS.js","/assets/copy-Ch3CzFGU.js","/assets/corner-down-right-BuKCfS4h.js","/assets/createLucideIcon-CubYuk6i.js","/assets/exportXlsx-BYL7EWih.js","/assets/external-link-kngIn5Nr.js","/assets/file-clock-JI7TvIcy.js","/assets/file-spreadsheet-DmGLy5A4.js","/assets/file-text-Ciy3WNMI.js","/assets/flag-xdeGXW1m.js","/assets/flame-_2hZ63qL.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-z67QJT7B.js","/assets/funnel-C5waU6Fx.js","/assets/hash-uPCblw1E.js","/assets/history-D2ltYjhE.js","/assets/hourglass-Djtt-F9p.js","/assets/image-AnJTQcaF.js","/assets/image-off-LhnwvCy1.js","/assets/index-BOrXb0Wd.js","/assets/index-PYkJVL39.css","/assets/keyboard-BWUdwKwA.js","/assets/languages-eMk7O8fr.js","/assets/layers-feZvt5o_.js","/assets/leaderReason-Si52size.js","/assets/lightbulb-n_x6G4jM.js","/assets/link-2-BEpbWyc1.js","/assets/list-checks-BXr3c43S.js","/assets/list-ordered-Bmk3VtUQ.js","/assets/lock-open-Ci-jg0rq.js","/assets/log-in-Bl3OHXiZ.js","/assets/message-square-CW_9-5zD.js","/assets/minimize-2-CpnqiDnS.js","/assets/minus-DWwJfSjI.js","/assets/paperclip-ZFYLY2OE.js","/assets/pencil-CWzDOVaW.js","/assets/pencil-line-DArwq0nx.js","/assets/personName-B4KId4zS.js","/assets/pin-CiyhGsLo.js","/assets/play-DDot4sNr.js","/assets/prop-types-DcXqPtWS.js","/assets/radio-DdC6opuM.js","/assets/react-apexcharts.esm-xagcTjM-.js","/assets/refresh-cw-Cv57nPxK.js","/assets/repeat-B-mdGaqD.js","/assets/rotate-ccw-B_gLIcTI.js","/assets/rotate-cw-B7kPKrtf.js","/assets/save-CPhDziLx.js","/assets/scale-B1k8UN30.js","/assets/scroll-text-BWNFYgk2.js","/assets/search-x-NgV3TbLN.js","/assets/segments-DEP2sM2r.js","/assets/send-Dpx7lAze.js","/assets/settings-2-D7a9oeYm.js","/assets/shield-ChexMndo.js","/assets/shield-alert-C55MLxna.js","/assets/shield-check-BkRWMrnk.js","/assets/shield-question-mark-Cr2ZUEef.js","/assets/siren-CfI44Lwb.js","/assets/smartphone-Cf20cu1c.js","/assets/snowflake-DRZcXriP.js","/assets/star-CI7wS0r0.js","/assets/statusBands-DYntpVep.js","/assets/table-2-C-3n9Z6i.js","/assets/tag-Cjm_PB6q.js","/assets/trash-2-Bm9L1k9_.js","/assets/trending-down-Bk-i7cUR.js","/assets/trending-up-CZt7oO7K.js","/assets/undo-2-D6txx5zU.js","/assets/useChartTheme-CLEWxVqk.js","/assets/useElementWidth-Bl2A4duF.js","/assets/useIsMobile-Cgu1tkpu.js","/assets/useMutation-tWuFqxen.js","/assets/useStatusBands-CRUL0sZa.js","/assets/user-check-Br98LAB3.js","/assets/user-cog-oQJ55OKK.js","/assets/user-minus-OBkb2BQ4.js","/assets/users-BkOIcx5D.js","/assets/verifyState-Gwx7njwd.js","/assets/video-Dr6twbKI.js","/assets/warehouse-Uoz_99UM.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
