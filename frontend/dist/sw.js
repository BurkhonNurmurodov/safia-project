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

const BUILD = "2026-09-25T03:51:54.156Z";
const PRECACHE = ["/","/assets/AdminPanel-Dst2XG_b.js","/assets/AnalysisBoard-DdGTI-tG.js","/assets/Arc-Bhk_C28R.js","/assets/AttendanceModal-DDgfM3Qo.js","/assets/BrigadirProfile-2XhstMvs.js","/assets/BroadcastReceivers-CQH5XYe1.js","/assets/BroadcastRecord-D-ntwpsE.js","/assets/CatLockNotice-FcFoQ_Bw.js","/assets/CategoryLegendModal-QrLuPSLk.js","/assets/CellConcerns-s1ucZBK0.js","/assets/CellDetails-BjR5vF0b.js","/assets/CellFormModal-CxMi6CIC.js","/assets/CellLink-WlV0tqOI.js","/assets/Cells-B560Ly8Y.js","/assets/ColumnFilter-CImVSfi3.js","/assets/ColumnsPicker-BnmvzuvL.js","/assets/CommentsModal-Bm6rXpKv.js","/assets/ComparisonTable-D-qH6Y-Z.js","/assets/Concerns-DU1da8f1.js","/assets/ConfirmDialog-CrXlj_0Q.js","/assets/Daily-C2U8izWY.js","/assets/DataTable-CSPgeMpe.js","/assets/DateRangePicker-BfBXWPUb.js","/assets/DayReportView-DhnXD1xJ.js","/assets/DayStepper-CL_dZwhP.js","/assets/DifferenceBreakdown-Cr9WeerT.js","/assets/Downtime-q0nGUpMz.js","/assets/Education-CUzYbMIL.js","/assets/EducationLesson-B-y8HvWQ.js","/assets/EmptyState-rCpnZekq.js","/assets/Exam-CMmuFGFO.js","/assets/FactorySelect-OyQBs32N.js","/assets/Gamification-BaqeLwQP.js","/assets/GroupBadge-B6oigyv-.js","/assets/HeatmapChart-Dz_2iYzC.js","/assets/IdleCell-BYiKRnUF.js","/assets/KPICard-DEHFL25L.js","/assets/Kaizen-BU3OR8KL.js","/assets/KpiDeltaCard-DJq8jdxu.js","/assets/LangTextInput-C9ldaTY-.js","/assets/Layout-DREZV-a0.js","/assets/LeaderDayReport-CoT1aB4_.js","/assets/LeaderUnitReport-5VRUK7XR.js","/assets/Leaderboard-DJugpSNa.js","/assets/Leaders-G2CmeXv0.js","/assets/LiveOverview-BIGCR-HI.js","/assets/Login-CiA9Kj5R.js","/assets/NotFound-C2sjFwqt.js","/assets/Overview-BN0jbGu2.js","/assets/Pagination-DPfYIHl3.js","/assets/PerenaladkaFactTable-BAkFL5hB.js","/assets/PlanFulfillment-eaP8U_nY.js","/assets/Production-D-mISTji.js","/assets/Profile-D6HbC1nx.js","/assets/ProofCamera-DpOmCVK3.js","/assets/Quality-Cno3cObd.js","/assets/RequestStateChip-Com9rMiO.js","/assets/RichTextEditor-DovfcEKZ.js","/assets/SearchInput-B3rry7Ta.js","/assets/SeasonalityHeatmap-DmCIkiui.js","/assets/SegmentedToggle-DZpqOles.js","/assets/SetupTimes-CBAdBbBN.js","/assets/ShiftDaily-DJ7BLDSk.js","/assets/Staff-D9o8cWDf.js","/assets/StatusBadge-X1YGxcti.js","/assets/Targets-C01KUdQN.js","/assets/Tasks--ar7d8vY.js","/assets/TimeWheelPicker-BafI7PmG.js","/assets/Tooltip-DWSFBsT-.js","/assets/TrendChart-jhcOd8rG.js","/assets/TripleSpeedometer-_cnKrn9m.js","/assets/Trudoyomkost-zyEafiH_.js","/assets/UsersActivity-APfVhmux.js","/assets/WatchProgress-5jMX4E8I.js","/assets/WebLogin-yN5arMFg.js","/assets/WorkerConcerns-DhATRPf8.js","/assets/Workers-DEU3Lw15.js","/assets/Zagruzka-Bt2MeYSp.js","/assets/ZagruzkaCell-CxwPdX4f.js","/assets/alarm-clock-wfEKukDg.js","/assets/api-D2NMy0oF.js","/assets/archive-D1E0Bxeb.js","/assets/archive-restore-DSV45L84.js","/assets/arrow-down-V-cOXJq3.js","/assets/arrow-left-BbpoMOMk.js","/assets/arrow-left-right-Cksiw77z.js","/assets/arrow-up-jM9RZNGV.js","/assets/arrow-up-right-744zoemJ.js","/assets/award-BqD1vC3c.js","/assets/ban-DgurUMHI.js","/assets/bot-ClSWdzmX.js","/assets/boxes-CBgytkPo.js","/assets/brigadirFilters-BfRp7qpe.js","/assets/broadcastTree-CyCdNxcr.js","/assets/building-2-e7xnBwhm.js","/assets/calendar-BtqGo5nn.js","/assets/calendar-clock-DYloxQg9.js","/assets/calendar-days-KUhZLso6.js","/assets/calendar-range-0awK1ho4.js","/assets/camera-ardZEph0.js","/assets/categories-CuHPDaD_.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B9M13MuD.js","/assets/chart-line-BPOyv7gs.js","/assets/chart-pie-C6G97uS9.js","/assets/chartRange-CZhRf1Bb.js","/assets/check-check-DiUZCy0Q.js","/assets/chevron-left-B_jP0YGu.js","/assets/chevrons-up-down-CLuu4zJ-.js","/assets/circle-check-big-Bir3Mkas.js","/assets/circle-dashed-DFNCZw-4.js","/assets/circle-dot-BOvMAptd.js","/assets/circle-minus-DVO5WAvx.js","/assets/circle-slash-B01IKeZv.js","/assets/circle-user-round-_pbwV2lq.js","/assets/coins-RhVq5xZt.js","/assets/compass-CSTkvQ3E.js","/assets/concernCategories-BXMS7KPK.js","/assets/copy-CM_lKu87.js","/assets/corner-down-right-D2I3wcS6.js","/assets/createLucideIcon-C1B0ZvFM.js","/assets/exportXlsx-BwzUm10m.js","/assets/external-link-BOq7XNAP.js","/assets/file-clock-BauY-SWA.js","/assets/file-spreadsheet-DkI72nyz.js","/assets/file-text-C2pocdk7.js","/assets/flag-B39KJzdC.js","/assets/flame-Ce5qY__W.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Bp1NIcqt.js","/assets/hash-Uyqxsms5.js","/assets/history-CF1p0WUn.js","/assets/hourglass-BWxyYGxz.js","/assets/image-Ctc6s0Wu.js","/assets/image-off-DbhhsQI7.js","/assets/index-BMCZProW.css","/assets/index-b5bzIAK0.js","/assets/keyboard-Bdn1eILa.js","/assets/languages-F2_1haQo.js","/assets/layers-BaRVPBdP.js","/assets/leaderReason-hdeIcGYo.js","/assets/lightbulb-8PxL3uSn.js","/assets/link-2-jSiV20-i.js","/assets/list-checks-Cnf2uvSD.js","/assets/list-ordered-CRmoifUv.js","/assets/lock-open-A5OkjDHQ.js","/assets/log-in-C07dSG0m.js","/assets/message-square-CBW5Ou9W.js","/assets/minimize-2-CpfBSjNH.js","/assets/paperclip-CZP9WSQ6.js","/assets/pencil-DlnoE38X.js","/assets/personName-B4KId4zS.js","/assets/pin-DKKYEmKi.js","/assets/play-CHTnr4ve.js","/assets/presentation-DW6FA-wG.js","/assets/prop-types-rk65BlXd.js","/assets/radio-CNoa579R.js","/assets/react-apexcharts.esm-CnBKZmjV.js","/assets/repeat-C4LZfAGW.js","/assets/rotate-ccw-D-MszfPt.js","/assets/rotate-cw-CYnOJ_xo.js","/assets/save-BhC7EPiW.js","/assets/scale-C76L9-sT.js","/assets/scroll-text-C3bqO4wQ.js","/assets/search-x-BKRstMI_.js","/assets/segments-CKqQHbHX.js","/assets/send-Bkbki66P.js","/assets/settings-2-UCOxm8w-.js","/assets/shield-AdwOPxfj.js","/assets/shield-alert-BWr3gFS2.js","/assets/shield-check-BwYrew-9.js","/assets/shield-question-mark-CzgEzOgy.js","/assets/siren-D0LPCntB.js","/assets/smartphone-DosLnmt9.js","/assets/snowflake-BfrxWrBF.js","/assets/square-DsX-ZAII.js","/assets/square-check-big-D7XIkwZO.js","/assets/star-BJLCf91S.js","/assets/statusBands-BjP1hxXQ.js","/assets/table-2-DE_fPdQp.js","/assets/tag-Da2ZmhiR.js","/assets/trending-down-DNPZ8tf3.js","/assets/trending-up-BZQIfsbB.js","/assets/triangle-alert-qG9kCdPV.js","/assets/undo-2-DR0ODOC3.js","/assets/useChartTheme-Cjs5g2r2.js","/assets/useElementWidth-BnuMW3OA.js","/assets/useIsMobile-BIJupxex.js","/assets/useMutation-DucAxtcE.js","/assets/useStatusBands-BZnBT-iX.js","/assets/user-CGuqW-Me.js","/assets/user-check-DiAuuTp4.js","/assets/user-cog-Bhu25N3w.js","/assets/user-minus-D3vbdIcz.js","/assets/users-B6rIUfI3.js","/assets/verifyState-zbpUaB_0.js","/assets/video-Bdsp6r5M.js","/assets/warehouse-BureOowu.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
