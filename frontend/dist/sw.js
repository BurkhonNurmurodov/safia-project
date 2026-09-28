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

const BUILD = "2026-09-28T06:33:40.461Z";
const PRECACHE = ["/","/assets/AdminPanel-BVT73bTJ.js","/assets/AnalysisBoard-Bap0-nIj.js","/assets/Arc-BGSihPOV.js","/assets/ArcLegacy-CuxwCdX1.js","/assets/AttendanceModal-BQU8KmmE.js","/assets/BrigadirProfile-CbN8Y2fA.js","/assets/BroadcastReceivers-CUS_Zc8h.js","/assets/BroadcastRecord-LkAWnmL5.js","/assets/CatLockNotice-BCk6TFFl.js","/assets/CategoryLegendModal-CNrA6B9L.js","/assets/CellConcerns-DG4iibO7.js","/assets/CellDetails-2tE7LTF-.js","/assets/CellFormModal-Dy-Qo0Fl.js","/assets/CellLink-Bjh8oV3v.js","/assets/Cells-DM3Gyu-M.js","/assets/ColumnFilter-9cN-PiFH.js","/assets/ColumnsPicker-Bkemmsn2.js","/assets/CommentsModal-DysjyNeT.js","/assets/ComparisonTable-vhlDcgXl.js","/assets/Concerns-BaM8hYtn.js","/assets/ConfirmDialog-IAAXe_uB.js","/assets/Daily-leA8O3jE.js","/assets/DataTable-C5aOvQhf.js","/assets/DateRangePicker-CPgPxJ9R.js","/assets/DayReportView-DXFCf1da.js","/assets/DayStepper-CRLfIVx-.js","/assets/DifferenceBreakdown-DrcWiPF0.js","/assets/Downtime-RgsxIrgb.js","/assets/Education-CLMxoun8.js","/assets/EducationLesson-DqRJSy6T.js","/assets/EmptyState-CdMUuAQH.js","/assets/Exam-twH_vu-d.js","/assets/FactorySelect-CdYmgYXP.js","/assets/Gamification--7MFmaa7.js","/assets/GroupBadge-DM4I5HCn.js","/assets/HeatmapChart-Bh8544n4.js","/assets/IdleCell-CzMTXoqj.js","/assets/KPICard-CEIQVa1g.js","/assets/Kaizen-CahrjuZX.js","/assets/KpiDeltaCard-CC0LCkEl.js","/assets/LangTextInput-BTB31x7L.js","/assets/Layout-B_ZXUIku.js","/assets/LeaderAppeal-D4AJKenm.js","/assets/LeaderDayReport-CReG5wo-.js","/assets/LeaderUnitReport-DR88XgMD.js","/assets/Leaderboard-q5I-ezA3.js","/assets/Leaders-BktKrSUB.js","/assets/Lightbox-4O4lYcjQ.js","/assets/LiveOverview-BTPDlZnU.js","/assets/Login-BUwOtWMU.js","/assets/NotFound-QtQN2Mhw.js","/assets/Overview-CD4J8WPl.js","/assets/Pagination-Ce_vcmTJ.js","/assets/PerenaladkaFactTable-DWJRD60Q.js","/assets/PlanFulfillment-gyxTUN40.js","/assets/Production-De5P5Qr_.js","/assets/Profile-D_mARLJn.js","/assets/ProofCamera-CfDdpg0l.js","/assets/ProofPhoto-CzpcjxXG.js","/assets/Quality-BeZc1RQA.js","/assets/RequestStateChip-TyChfcCB.js","/assets/RichTextEditor-CGfyRLn9.js","/assets/SaveState-D9NVINeX.js","/assets/SearchInput-ZDkC0JcI.js","/assets/SeasonalityHeatmap-DzVeQMJ7.js","/assets/SegmentedToggle-Dr9FOntD.js","/assets/SetupTimes-BMzBjM1p.js","/assets/ShiftDaily-BhTrm1n-.js","/assets/Staff-BvyszJsU.js","/assets/StatusBadge-D1V8WFZ-.js","/assets/TargetGoal-BuVKFNsH.js","/assets/Targets-BhUlXqsf.js","/assets/Tasks-BI83kFPY.js","/assets/TimeWheelPicker-BNFaVh5o.js","/assets/Tooltip-BFT6H71o.js","/assets/TrendChart-MVWB3vMc.js","/assets/TripleSpeedometer-BSuQDEdZ.js","/assets/Trudoyomkost-CXdeQ6Zi.js","/assets/UsersActivity-BEdW__V3.js","/assets/WatchProgress-sO6Zj8Qp.js","/assets/WebLogin-Cv06hKCO.js","/assets/WorkerConcerns-Dp8s6O5a.js","/assets/Workers-DS6NvNP1.js","/assets/Zagruzka-K4Mimn-5.js","/assets/ZagruzkaCell-ivMPfX64.js","/assets/alarm-clock-CfHjl9Uo.js","/assets/api-J3GZNEkv.js","/assets/archive-CCR6ES3P.js","/assets/archive-restore-CgAMs_Ev.js","/assets/arrow-down-BLim1P0r.js","/assets/arrow-left-CCuUJbNC.js","/assets/arrow-left-right-BlWjvsrK.js","/assets/arrow-up-BLqz-6Yt.js","/assets/arrow-up-right-BQ7f0Wok.js","/assets/award-DHOlGm9g.js","/assets/ban-BmCFqQPU.js","/assets/bot-CWpXhT4s.js","/assets/boxes-DdBkZUSn.js","/assets/brigadirFilters-ClYrOO0k.js","/assets/broadcastTree-1HjeBaUF.js","/assets/building-2-DqDRjMJY.js","/assets/calendar-B-WSxRwd.js","/assets/calendar-clock-C5IQYl4M.js","/assets/calendar-days-D9tDSaro.js","/assets/calendar-range-CQ8PjHhn.js","/assets/camera-CU8UkWGY.js","/assets/categories-B5xKZO44.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cvk8xTVV.js","/assets/chart-line-9PDC20GC.js","/assets/chart-pie-BeDWULl3.js","/assets/chartRange-BgfSL-Fk.js","/assets/chevron-left-BR0yitgZ.js","/assets/chevrons-up-down-BfPIucr1.js","/assets/circle-check-big-DY03Jj79.js","/assets/circle-dot-CA-B59Ds.js","/assets/circle-minus-C6_iO64t.js","/assets/circle-slash-dcQUgscc.js","/assets/circle-user-round-D5pHIuL2.js","/assets/cloud-off-Crv72QVn.js","/assets/cloud-upload-DZnzvWvs.js","/assets/compass-DOZMb6CM.js","/assets/concernCategories-BW7FGXwt.js","/assets/copy-DZWocbzv.js","/assets/corner-down-right-DtuT62Ke.js","/assets/createLucideIcon-78QZPkjM.js","/assets/es-BtrKum11.js","/assets/exportXlsx-D94XwSKM.js","/assets/external-link-DCwKFcVm.js","/assets/file-clock-DXQk5Mlv.js","/assets/file-exclamation-point-C02pGqRO.js","/assets/file-spreadsheet-CTQVb_Ed.js","/assets/file-text-D7J3EpYW.js","/assets/flag-yDmwJ9Gf.js","/assets/flame-Bke1L20n.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DUPlwc5v.js","/assets/hash-i1H3f2hI.js","/assets/history-BbQfNbl7.js","/assets/hourglass-C7LgpWC5.js","/assets/image-CNS9X0C-.js","/assets/image-off-CtbCPQI6.js","/assets/index-C-CBdapP.js","/assets/index-TBzEnSGJ.css","/assets/key-round-Bmhfg538.js","/assets/keyboard-CkuS5xP_.js","/assets/languages-DSoGT2tt.js","/assets/layers-CwB3aQuk.js","/assets/leaderReason-lcd1dSBM.js","/assets/lightbulb-DFOX__aQ.js","/assets/link-2-D0Z89eAr.js","/assets/list-checks-BFctPvOe.js","/assets/list-ordered-eBHz3HQo.js","/assets/list-tree-BT7znjmb.js","/assets/lock-open-CcwXfqYN.js","/assets/log-in-wtofXzls.js","/assets/message-square-1c56HbH1.js","/assets/minimize-2-Bqmr8mas.js","/assets/package-check-9jMnL_nU.js","/assets/paperclip-BblKqKPt.js","/assets/pencil-BoWCZoVy.js","/assets/personName-B4KId4zS.js","/assets/pin-DttcSCXD.js","/assets/pin-off-B1jQq7p-.js","/assets/play-BZNv9cRx.js","/assets/presentation-DpR9XNA1.js","/assets/prop-types-DoR7N-CB.js","/assets/radio-DmmfKshy.js","/assets/react-apexcharts.esm-BTwoTZzW.js","/assets/repeat-Bl69Sg36.js","/assets/rotate-ccw-D1beESQ6.js","/assets/rotate-cw-DNJGuHUM.js","/assets/save-CbimO951.js","/assets/scale-C_MwTB2Y.js","/assets/scroll-text-ChbwAjMg.js","/assets/search-x-DatHdT23.js","/assets/segments-Cs98bIFo.js","/assets/send-Cigyl1J2.js","/assets/settings-2-BuEvg509.js","/assets/shield-B1CDYj4n.js","/assets/shield-alert-Cpd6njOn.js","/assets/shield-check-CVBxqTO-.js","/assets/shield-question-mark-CzmkOyHS.js","/assets/siren-C7KReiDY.js","/assets/smartphone-_gfqxjhZ.js","/assets/snowflake-D0FyO69F.js","/assets/square-check-big-__ttItRS.js","/assets/square-d_5hfslX.js","/assets/star-DrPzlRyh.js","/assets/statusBands-Bbp7u-ke.js","/assets/store-B0b8cm75.js","/assets/table-2-BSwCalVX.js","/assets/tag-CEY7Nble.js","/assets/trending-down-DyJSYPYM.js","/assets/trending-up-_TnYDIoG.js","/assets/undo-2-BB3yK-Ye.js","/assets/useChartTheme-Dw3rPx04.js","/assets/useElementWidth-Dyfh43Kb.js","/assets/useIsMobile-xY9NJH8k.js","/assets/useMutation-DcQqhzqc.js","/assets/useStatusBands-C5OxSU91.js","/assets/user-C_aXQB4F.js","/assets/user-check-Bn9Mk0Nh.js","/assets/user-cog-DTg8NBJw.js","/assets/user-minus-ChvWREjl.js","/assets/users-DVpB0gQD.js","/assets/verifyState-CUx4Sgs7.js","/assets/video-K6I1EM62.js","/assets/wallet-7f410d6v.js","/assets/warehouse-BtpzNUFA.js","/assets/zap-BN1i1UDQ.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
