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

const BUILD = "2026-09-22T11:27:04.411Z";
const PRECACHE = ["/","/assets/AdminPanel-FFdcPW_Q.js","/assets/AnalysisBoard-DQOvwxyD.js","/assets/Arc-VFomVY5h.js","/assets/AttendanceModal-DSXzJJRW.js","/assets/BrigadirProfile-rjTGrlSF.js","/assets/BroadcastReceivers-BllR5ZiW.js","/assets/BroadcastRecord-DZTMEEsI.js","/assets/CatLockNotice-Dcfn-rNY.js","/assets/CategoryLegendModal-DSmNbOMM.js","/assets/CellConcerns-DXV00Row.js","/assets/CellDetails-BiJ2RqM2.js","/assets/CellFormModal-B4OqYYiE.js","/assets/CellLink-Ct4eo6EM.js","/assets/Cells-BGgWlkpC.js","/assets/ColumnFilter-BIDgCVUr.js","/assets/ColumnsPicker-Bt2gfWQS.js","/assets/CommentsModal-DuRLA9r9.js","/assets/ComparisonTable-DZtN7zjG.js","/assets/Concerns-D7rmv66b.js","/assets/ConfirmDialog-BlbCchr6.js","/assets/Daily-CiLxWmjb.js","/assets/DataTable-BiI-1Fig.js","/assets/DateRangePicker-d6Ls8wp_.js","/assets/DayReportView-CiqQSaYY.js","/assets/DayStepper-CKahNVf5.js","/assets/DifferenceBreakdown-Bh5N2nRJ.js","/assets/Downtime-DSXW4K_s.js","/assets/Education--DPDvguY.js","/assets/EducationLesson-r06nPAd9.js","/assets/EmptyState-0Qw5BIUW.js","/assets/FactorySelect-DT0Zp1U7.js","/assets/FormField-Cpl_kqfM.js","/assets/Gamification-D5H42sai.js","/assets/GroupBadge-i-mn1u5F.js","/assets/HeatmapChart-DDAyrlO9.js","/assets/IdleCell-Dcrr1Uvh.js","/assets/KPICard-CMQTq0-r.js","/assets/Kaizen-BQfvBlbi.js","/assets/KpiDeltaCard-DmxZhhZC.js","/assets/LangTextInput-D4TLhN7u.js","/assets/Layout-BLSM1GhM.js","/assets/LeaderDayReport-DWnqfwGw.js","/assets/LeaderUnitReport-BdtuJ0Bt.js","/assets/Leaderboard-B9e6Y9eO.js","/assets/Leaders-cPUKKXTD.js","/assets/LiveOverview-BDvS5ajI.js","/assets/Login-DCqhZPjf.js","/assets/NotFound-CVw_AGKk.js","/assets/Overview-CHmtrvyi.js","/assets/Pagination-CHn16lON.js","/assets/PerenaladkaFactTable-CSvFyW3p.js","/assets/PlanFulfillment-DpEhSeQ6.js","/assets/Production-C9Abn4HX.js","/assets/Profile-CjhXygnw.js","/assets/ProofCamera-D3neI0l4.js","/assets/Quality-Bj-NYfNe.js","/assets/RichTextEditor-Mahk6JHR.js","/assets/SearchInput-5iD3Zi39.js","/assets/SeasonalityHeatmap-CGIb6Cf6.js","/assets/SegmentedToggle-BeV1CLi3.js","/assets/SetupTimes-NZ9oBPJ8.js","/assets/ShiftDaily-vPGYlGPm.js","/assets/Skeleton-DjbgcGTp.js","/assets/Staff-BVSv6fyt.js","/assets/StatusBadge-DPxXINQd.js","/assets/StyledSelect-wXY8dFGE.js","/assets/Targets-DM5Uy4TF.js","/assets/Tasks-BGcXZ3Or.js","/assets/TimeField-DTL4xo_3.js","/assets/TimeWheelPicker-n_m2IknY.js","/assets/Toast-BLjhdW7U.js","/assets/Tooltip-Bg1W8yND.js","/assets/TrendChart-DCX8azaS.js","/assets/TripleSpeedometer-DyNdkaFW.js","/assets/Trudoyomkost-qTFq0GCu.js","/assets/UsersActivity-BVMeDE0T.js","/assets/WatchProgress-CjEKDBvH.js","/assets/WebLogin-73cb3vP6.js","/assets/WorkerConcerns-BmfNu5W5.js","/assets/Workers-fKsQcW6k.js","/assets/Zagruzka-c8QVS_xn.js","/assets/ZagruzkaCell-BbmEMZAs.js","/assets/alarm-clock-IhPAok1O.js","/assets/api-BXqJVyak.js","/assets/archive-D39SgY-z.js","/assets/archive-restore-CHj6RFVh.js","/assets/arrow-down-CeTlwXza.js","/assets/arrow-left-Ca2eaJR1.js","/assets/arrow-left-right-D_eAS6DR.js","/assets/arrow-right-Cve60lrx.js","/assets/arrow-up-B-8qjyXT.js","/assets/arrow-up-right-CCwYZ50t.js","/assets/award-DOlQ47xD.js","/assets/ban-CdcORPjF.js","/assets/bot-DSBf0upA.js","/assets/boxes-DLJXrBpj.js","/assets/brigadirFilters-CTs4BK5I.js","/assets/broadcastTree-B8fKsLht.js","/assets/building-2-CQjZbLur.js","/assets/calendar-Ddu0qrIi.js","/assets/calendar-clock-BKmmp1tb.js","/assets/calendar-days-qfFcsizu.js","/assets/calendar-range-Bv7ZwWNG.js","/assets/camera-ZWQKDaHZ.js","/assets/categories-B4zpr49y.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BJrJNPH5.js","/assets/chart-line-DS5K-v98.js","/assets/chart-pie-9WEHlzxH.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-CfDRr7KK.js","/assets/check-BUGjVtXq.js","/assets/check-check-BaGPe9nE.js","/assets/chevron-left-DFmGZUpP.js","/assets/chevrons-up-down-DbWtUpLx.js","/assets/circle-dashed-DchGRglq.js","/assets/circle-dot-Cbsuc_Xh.js","/assets/circle-minus-DP30TeK9.js","/assets/circle-slash-DXhFE2_i.js","/assets/circle-user-round-iYH7tras.js","/assets/coins-BOY8j7Uc.js","/assets/compass-J4D9d6Po.js","/assets/concernCategories-FkPyf18w.js","/assets/copy-XX36EMIu.js","/assets/corner-down-right-D4ACeU7g.js","/assets/createLucideIcon-C2ojGwSL.js","/assets/exportXlsx-7VzBTU3M.js","/assets/external-link-7naSlqu4.js","/assets/file-clock-DRUz8y9-.js","/assets/file-spreadsheet-DJajUnKG.js","/assets/file-text-BUcwcj5C.js","/assets/flag-W1t7-JpK.js","/assets/flame-DN9LUXiz.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-qxlw5rK9.js","/assets/funnel-D4vHJc3b.js","/assets/hash-BsBLs8hA.js","/assets/history-B9Ntd2AH.js","/assets/hourglass-rkdAVOIl.js","/assets/image-Bc-wOinl.js","/assets/image-off-D89kZjtW.js","/assets/index-B3uDAUCR.js","/assets/index-BXqTV2jf.css","/assets/keyboard-DXT9IjMQ.js","/assets/languages-BZSeR0tK.js","/assets/layers-DRuzcgQA.js","/assets/leaderReason-B1jmF3jr.js","/assets/lightbulb-DqGAM51L.js","/assets/link-2-DOnmGwhu.js","/assets/list-checks-CoGS-dBh.js","/assets/list-ordered-Cw03C4rJ.js","/assets/lock-open-B8B26ViC.js","/assets/log-in-DOmPyq73.js","/assets/message-square-BtleZxj5.js","/assets/minimize-2-CLysYhqp.js","/assets/minus-Ddyh76LZ.js","/assets/paperclip-CmrJvgOM.js","/assets/pencil-CgmyGExv.js","/assets/pencil-line-CzrfNHh2.js","/assets/personName-B4KId4zS.js","/assets/pin-Bj7uM0f2.js","/assets/play-BGzjhX4w.js","/assets/prop-types-DVsTX4uJ.js","/assets/radio-CIdAT4vH.js","/assets/react-apexcharts.esm-CILaK55O.js","/assets/refresh-cw-m8JBm-D_.js","/assets/repeat-DmkhHtYt.js","/assets/rotate-ccw-CC18F8e1.js","/assets/rotate-cw-DhiJUSc3.js","/assets/save-DW47vy28.js","/assets/scale-DQXIgrWb.js","/assets/scroll-text-PBtKsCbo.js","/assets/search-x-BSaY0SQP.js","/assets/segments-DCNN4IDZ.js","/assets/send-DuP1XPlN.js","/assets/settings-2-CTXUBRfn.js","/assets/shield-D55stsTt.js","/assets/shield-alert-CyU-i3dc.js","/assets/shield-check-MXBAewZ8.js","/assets/shield-question-mark-BSlLBr9q.js","/assets/siren-DMwb7Cnu.js","/assets/smartphone-DecVTU7E.js","/assets/snowflake-B91F2GeC.js","/assets/square-DosvDl-2.js","/assets/square-check-big-EWuN4no-.js","/assets/star-DQTW4gC6.js","/assets/statusBands-BV2ph0p4.js","/assets/table-2-Yk0C5TpV.js","/assets/tag-1FtJkNMO.js","/assets/trash-2-bXk7Mh22.js","/assets/trending-down-BaaDkzPV.js","/assets/trending-up-CFK-92FK.js","/assets/undo-2-xBl8bY4I.js","/assets/useChartTheme-BgOXIkkj.js","/assets/useElementWidth-DjteQFeP.js","/assets/useIsMobile-D-T3GMLS.js","/assets/useMutation-Cdy13nOr.js","/assets/useStatusBands-BOiolKBX.js","/assets/user-check-B4Fn-SJW.js","/assets/user-cog-CmdDjbjc.js","/assets/user-minus-Cyc__gr-.js","/assets/users-Cp3nBE6T.js","/assets/verifyState-Csopunnc.js","/assets/video-BPGZF0OX.js","/assets/warehouse-OEBv9f2q.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
