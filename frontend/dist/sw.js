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

const BUILD = "2026-09-23T15:08:11.926Z";
const PRECACHE = ["/","/assets/AdminPanel-C8GpuypY.js","/assets/AnalysisBoard-B5DNfiVm.js","/assets/Arc-ozIMTZf7.js","/assets/AttendanceModal-DsP6pT4q.js","/assets/BrigadirProfile-Dm7NaedK.js","/assets/BroadcastReceivers-D-DT53DV.js","/assets/BroadcastRecord-CfdDnETp.js","/assets/CatLockNotice-CY8ea7GK.js","/assets/CategoryLegendModal-CoO5OCSZ.js","/assets/CellConcerns-DMMDHQL2.js","/assets/CellDetails-ZnsUKbD1.js","/assets/CellFormModal-DPkByFnd.js","/assets/CellLink-DbjU1dsg.js","/assets/Cells-B2JI4OG1.js","/assets/ColumnFilter-CBdFf2Ni.js","/assets/ColumnsPicker-CwGZk0S-.js","/assets/CommentsModal-Fn2K49Bu.js","/assets/ComparisonTable-Bf0ps4jc.js","/assets/Concerns-3w6E8VL4.js","/assets/ConfirmDialog-BtB40HYb.js","/assets/Daily-CyVTD7-Z.js","/assets/DataTable-DXjM5rOK.js","/assets/DateRangePicker-BPzAjFmK.js","/assets/DayReportView-DgSHIDF8.js","/assets/DayStepper-DfAp0zrp.js","/assets/DifferenceBreakdown-BE_w18oj.js","/assets/Downtime-sdIKrFjD.js","/assets/Education-BzI9pNuU.js","/assets/EducationLesson-Bl4FD7UI.js","/assets/EmptyState-Co11RrJ6.js","/assets/FactorySelect-_k-8emKV.js","/assets/FormField-Bz-TSKNv.js","/assets/Gamification-C1AEuziY.js","/assets/GroupBadge-D48FpY9R.js","/assets/HeatmapChart-DjRvv6Ks.js","/assets/IdleCell-Boq9GlsD.js","/assets/KPICard-0NqRfQiI.js","/assets/Kaizen-DeUui2k_.js","/assets/KpiDeltaCard-CESnWNC4.js","/assets/LangTextInput-CXjTPrtO.js","/assets/Layout-Cf-jtOKu.js","/assets/LeaderDayReport-J5XXfMXr.js","/assets/LeaderUnitReport-CNUnIWQ_.js","/assets/Leaderboard-CMEX2Gp1.js","/assets/Leaders-CcziMW-c.js","/assets/LiveOverview-Bq1QWFT0.js","/assets/Login-BH3Y9b5b.js","/assets/NotFound-CvzFZuUK.js","/assets/Overview-BYDaXJdj.js","/assets/Pagination-kFe1wYyE.js","/assets/PerenaladkaFactTable-DwWiAY_-.js","/assets/PlanFulfillment-BB44GqZH.js","/assets/Production-D-tjIXKF.js","/assets/Profile-Bscf-cz3.js","/assets/ProofCamera-dXL3b9ed.js","/assets/Quality-wyJXJo-M.js","/assets/RichTextEditor-BozsESN6.js","/assets/SearchInput-cO8NPqhj.js","/assets/SeasonalityHeatmap-CVK5YqQN.js","/assets/SegmentedToggle-BLwooOJ0.js","/assets/SetupTimes-CXeArrPc.js","/assets/ShiftDaily-Bx41qsme.js","/assets/Skeleton-CAmd5-nm.js","/assets/Staff-eadSMctg.js","/assets/StatusBadge-C10nBBWc.js","/assets/StyledSelect-Cz9anuOV.js","/assets/Targets-Jb1i9E0D.js","/assets/Tasks-DQH9xknG.js","/assets/TimeField-D-TCchNl.js","/assets/TimeWheelPicker-C8H6p9LQ.js","/assets/Toast-pHOhdVl6.js","/assets/Tooltip-D_CC56bt.js","/assets/TrendChart-Nc7DXOXl.js","/assets/TripleSpeedometer-BBzJFzRC.js","/assets/Trudoyomkost-B0L-H2zd.js","/assets/UsersActivity-CxxfR-j-.js","/assets/WatchProgress-ZFq3dtU_.js","/assets/WebLogin-BBPkvpU9.js","/assets/WorkerConcerns-B-a9cPG_.js","/assets/Workers-C-NuIsdn.js","/assets/Zagruzka-CqfCO_b6.js","/assets/ZagruzkaCell-BxRuQUpH.js","/assets/alarm-clock-CkMsN0oM.js","/assets/api-BN-GNp8J.js","/assets/archive-DVb6yxRB.js","/assets/archive-restore-CMfd0T8n.js","/assets/arrow-down-DCn6ZLzf.js","/assets/arrow-left-DlFrGOj5.js","/assets/arrow-left-right--_M0tGIR.js","/assets/arrow-right-KaWQpvEi.js","/assets/arrow-up-CwNIILix.js","/assets/arrow-up-right-JmeYx90R.js","/assets/award-Bj8Czkq7.js","/assets/ban-Ckhzu7Wm.js","/assets/bot-BrUfL5Kh.js","/assets/boxes-DjUzqkst.js","/assets/brigadirFilters-CaIyWkMY.js","/assets/broadcastTree-Bw_82qO5.js","/assets/building-2-BQ-Vb3tg.js","/assets/calendar-DNqw_fGD.js","/assets/calendar-clock-D4ITqx_3.js","/assets/calendar-days-CWFEchCt.js","/assets/calendar-range-ptP1xEcd.js","/assets/camera-dhCsAKQU.js","/assets/categories-B-q9_stk.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BJTcH-xt.js","/assets/chart-line-BZNINIRL.js","/assets/chart-pie-BmB1Xe7C.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-BYJIFgCN.js","/assets/check-DCV8ptX6.js","/assets/check-check-3s9n-W-6.js","/assets/chevron-left-MRxrdWxU.js","/assets/chevrons-up-down-boxSZzSu.js","/assets/circle-dashed-k07OBtGb.js","/assets/circle-dot-q1hUrNVp.js","/assets/circle-minus-Dm1i9P5c.js","/assets/circle-slash-BcEi5U2M.js","/assets/circle-user-round-gbrPeZfo.js","/assets/coins-AUAr0fv5.js","/assets/compass-DsjaTNjC.js","/assets/concernCategories-DQHurk1D.js","/assets/copy-BPASB6DY.js","/assets/corner-down-right-DAUoZOjq.js","/assets/createLucideIcon-C8a_2V7K.js","/assets/exportXlsx-CRYj4cVa.js","/assets/external-link-D4wLbaIS.js","/assets/file-clock-Jl9DKSNa.js","/assets/file-spreadsheet-DKqPQc0L.js","/assets/file-text-B6xiRzJr.js","/assets/flag-YVEVvAdQ.js","/assets/flame-DUJGNVzj.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-fk1YzyE7.js","/assets/funnel-C-7Xrs4d.js","/assets/hash-B38tPZw1.js","/assets/history-WPQPn6D0.js","/assets/hourglass-CDquRBQL.js","/assets/image-HqvruyY4.js","/assets/image-off-Cdzeziv3.js","/assets/index-DHVoIxqD.js","/assets/index-ftrCYFhP.css","/assets/keyboard-CVSHLwaP.js","/assets/languages-C1QB1pW8.js","/assets/layers-BpkMifdL.js","/assets/leaderReason-D_C0QjdT.js","/assets/lightbulb-BmoIsnim.js","/assets/link-2-D45M5yn9.js","/assets/list-checks-BbIiU5HN.js","/assets/list-ordered-BHNcVc3S.js","/assets/lock-open-SXtRm3NC.js","/assets/log-in-D3ZkHWjU.js","/assets/message-square-BHlYBLd3.js","/assets/minimize-2-DfYZMcpk.js","/assets/minus-BQBE-u9Z.js","/assets/paperclip-BILGx_9j.js","/assets/pencil-BMzl0yvw.js","/assets/pencil-line-CKsK-KJx.js","/assets/personName-B4KId4zS.js","/assets/pin-B7FanzN7.js","/assets/play-CuVETYcX.js","/assets/presentation-CyQcIXcj.js","/assets/prop-types-Ca6_skmm.js","/assets/radio-BhOhiVkB.js","/assets/react-apexcharts.esm-DbMx5UBY.js","/assets/refresh-cw-Bz7wv9Pu.js","/assets/repeat-D-2abC1i.js","/assets/rotate-ccw-CwIRRrMl.js","/assets/rotate-cw-DbAqc9O_.js","/assets/save-C7NJTSdN.js","/assets/scale-BknLozrF.js","/assets/scroll-text-DzoZDSWv.js","/assets/search-x-CLKSVVAR.js","/assets/segments-CRmh0W4s.js","/assets/send-D7UbiCN_.js","/assets/settings-2-Bciw_ynH.js","/assets/shield-BKSpDyBA.js","/assets/shield-alert-BXAajXOG.js","/assets/shield-check-B_a8Ovz1.js","/assets/shield-question-mark-13yozL9x.js","/assets/siren-BF45zkU3.js","/assets/smartphone-D2Pc065L.js","/assets/snowflake-B8dUtTq6.js","/assets/square-CkoK-BeW.js","/assets/square-check-big-DDXuC1ei.js","/assets/star-Q4unD77y.js","/assets/statusBands-DksXeJsm.js","/assets/table-2-Cpy-WvO4.js","/assets/tag-BMUAInbE.js","/assets/trash-2-CL7IkcrP.js","/assets/trending-down-BT72n4jn.js","/assets/trending-up-Cc4cPPkN.js","/assets/undo-2-D-4C1w4J.js","/assets/useChartTheme-CYD39Dpw.js","/assets/useElementWidth-D2f4XCVU.js","/assets/useIsMobile-DpciR5-i.js","/assets/useMutation-CtMXOoVc.js","/assets/useStatusBands-KBuMvP93.js","/assets/user-check-KiYXGxa5.js","/assets/user-cog-DO-0Xv5o.js","/assets/user-minus-CKPxsoQD.js","/assets/users-BTd7-qg4.js","/assets/verifyState-CrOVNSbd.js","/assets/video-Bp_8-TJi.js","/assets/warehouse-DtNPDL1c.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
