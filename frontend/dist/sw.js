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

const BUILD = "2026-09-28T06:29:57.878Z";
const PRECACHE = ["/","/assets/AdminPanel-t_XfXrx1.js","/assets/AnalysisBoard-C5bmK68n.js","/assets/Arc-RyBIwvUm.js","/assets/ArcLegacy-CgeN9ogi.js","/assets/AttendanceModal-Bn3I25q2.js","/assets/BrigadirProfile-B6Seb0ss.js","/assets/BroadcastReceivers-B0wOY_2T.js","/assets/BroadcastRecord-D9IwvQCW.js","/assets/CatLockNotice-CbsLxRCn.js","/assets/CategoryLegendModal-B7GOFjrs.js","/assets/CellConcerns-D7oMn47q.js","/assets/CellDetails-CjLDL_x9.js","/assets/CellFormModal-VdF1CB7p.js","/assets/CellLink-Dow-a5ae.js","/assets/Cells-CBWUvNe8.js","/assets/ColumnFilter-Doy-uny-.js","/assets/ColumnsPicker-BHCqHFC9.js","/assets/CommentsModal-CHUyZM48.js","/assets/ComparisonTable-DFl8_AeG.js","/assets/Concerns-DV0l-1wG.js","/assets/ConfirmDialog-CUiluRrb.js","/assets/Daily-DDpSBbqP.js","/assets/DataTable-BFoIBXCk.js","/assets/DateRangePicker-Ds8hQZ6W.js","/assets/DayReportView-CInGlWoO.js","/assets/DayStepper-CRU-JQcK.js","/assets/DifferenceBreakdown-CVfxjS0R.js","/assets/Downtime-CXceJlrH.js","/assets/Education-p2NiAz6-.js","/assets/EducationLesson-BIVKnQK5.js","/assets/EmptyState-Doiu1sp6.js","/assets/Exam-CQ1MfJwN.js","/assets/FactorySelect-Bzmsi046.js","/assets/Gamification-CzY3L3h_.js","/assets/GroupBadge-D0Jw4wYR.js","/assets/HeatmapChart-C78EN0S1.js","/assets/IdleCell-WMlS3yt_.js","/assets/KPICard-BGr7zPe1.js","/assets/Kaizen-DMf__wYL.js","/assets/KpiDeltaCard-BNRnm0ec.js","/assets/LangTextInput-CvBN2P27.js","/assets/Layout-CTE_XcNT.js","/assets/LeaderAppeal-BlzF3QNy.js","/assets/LeaderDayReport-DOk7fa8p.js","/assets/LeaderUnitReport-5XKFhjkW.js","/assets/Leaderboard-NtdKTStb.js","/assets/Leaders-B3KS12ZS.js","/assets/Lightbox-sFAC70Rk.js","/assets/LiveOverview-C-s2sX2v.js","/assets/Login-BxX0MSY5.js","/assets/NotFound-cqJ8-wx-.js","/assets/Overview-S9n9M-hA.js","/assets/Pagination-DzdrIfzh.js","/assets/PerenaladkaFactTable-TJRigj0b.js","/assets/PlanFulfillment-ItsYJ4aC.js","/assets/Production-DydTHbqr.js","/assets/Profile-DertpO4w.js","/assets/ProofCamera-DyHGyrWB.js","/assets/ProofPhoto-BwqKtlqO.js","/assets/Quality-C7Fnkjve.js","/assets/RequestStateChip-B2wquROO.js","/assets/RichTextEditor-CF9aAmqL.js","/assets/SaveState-CcJ0B0h9.js","/assets/SearchInput-D3eaq_MO.js","/assets/SeasonalityHeatmap-xaneSo62.js","/assets/SegmentedToggle-DIFS42l-.js","/assets/SetupTimes-CSog9Pps.js","/assets/ShiftDaily-Cx_CbYI-.js","/assets/Staff-BoESqfqm.js","/assets/StatusBadge-DSUDse6-.js","/assets/TargetGoal-B_Mw0jvJ.js","/assets/Targets-CxVMIKWA.js","/assets/Tasks-qLuGyOh8.js","/assets/TimeWheelPicker-DflMxzKY.js","/assets/Tooltip-B0jRfE7I.js","/assets/TrendChart-CFzX6fIJ.js","/assets/TripleSpeedometer-DfXiJP0E.js","/assets/Trudoyomkost-B1YrgIuD.js","/assets/UsersActivity-DsO572M4.js","/assets/WatchProgress-lt0zPL1y.js","/assets/WebLogin-BAdrE1zi.js","/assets/WorkerConcerns-DeVYxVtw.js","/assets/Workers-BmK_1Usg.js","/assets/Zagruzka-C0hYp-ro.js","/assets/ZagruzkaCell-CFzF_5eo.js","/assets/alarm-clock-CYzJxzdo.js","/assets/api-CzBAGMut.js","/assets/archive-Dp5uTUf4.js","/assets/archive-restore-LK8_j6F0.js","/assets/arrow-down-7fvXL5jS.js","/assets/arrow-left-XckTPYTr.js","/assets/arrow-left-right-CwZR_WDF.js","/assets/arrow-up-lIkX2Le4.js","/assets/arrow-up-right-CPuHiSqp.js","/assets/award-DBI-Q4HK.js","/assets/ban-RD_E0zPM.js","/assets/bot-DI5gc5lw.js","/assets/boxes-DYi4PeLx.js","/assets/brigadirFilters-B6FZ-juc.js","/assets/broadcastTree-BX4YXHiE.js","/assets/building-2-Ccr3SNQA.js","/assets/calendar-clock-WfpPptcI.js","/assets/calendar-days-BWv1HZ3r.js","/assets/calendar-range-CIiaCy2P.js","/assets/calendar-uRnS4vge.js","/assets/camera-DsQ926q6.js","/assets/categories-wpuxltZK.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-zuCzCtzx.js","/assets/chart-line-Cus1FHgQ.js","/assets/chart-pie-BsBXeGQI.js","/assets/chartRange-L_foWQ-N.js","/assets/chevron-left-B8rvmp2B.js","/assets/chevrons-up-down-CGpYgrBG.js","/assets/circle-check-big-CI4j3Pac.js","/assets/circle-dot-BsP_VOYa.js","/assets/circle-minus-NAKQHfjP.js","/assets/circle-slash-HU0j6clT.js","/assets/circle-user-round-BLkOL7SC.js","/assets/cloud-off-D1nyphNg.js","/assets/cloud-upload-BDzlUrUM.js","/assets/compass-CGjfZJjm.js","/assets/concernCategories-D3SW_HNg.js","/assets/copy-BrxuJq9w.js","/assets/corner-down-right-3gw8qA1T.js","/assets/createLucideIcon-CRms006e.js","/assets/es-B1kUTCy7.js","/assets/exportXlsx-OWUdSEb0.js","/assets/external-link-DscrEMtb.js","/assets/file-clock-DA4I5Ogu.js","/assets/file-exclamation-point-CX6x29ET.js","/assets/file-spreadsheet-CRHE1ELu.js","/assets/file-text-DJedDAuI.js","/assets/flag-5zD1t5s4.js","/assets/flame-dh_d1yXZ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-B50lfoMT.js","/assets/hash-DA9G-0VY.js","/assets/history-CxbxlWTl.js","/assets/hourglass-B_aPQftL.js","/assets/image-DPBBUis0.js","/assets/image-off-M69Oi7qy.js","/assets/index-C3SMonHv.js","/assets/index-TBzEnSGJ.css","/assets/key-round-BepK6MD3.js","/assets/keyboard-BqCM8R-q.js","/assets/languages-CwwNFcvt.js","/assets/layers-BLdIFaZX.js","/assets/leaderReason-DlsvMSHW.js","/assets/lightbulb-BR5pM_9A.js","/assets/link-2-DQ7dd1Hc.js","/assets/list-checks-CpuMncyz.js","/assets/list-ordered-BWqqGW56.js","/assets/list-tree-BAszbbDF.js","/assets/lock-open-BunScdpL.js","/assets/log-in-BsknfuJ2.js","/assets/message-square-3PJPQE_o.js","/assets/minimize-2-BvInEDgG.js","/assets/package-check-C_qSBxbW.js","/assets/paperclip-D4E9a-ZY.js","/assets/pencil-DAvBr3_W.js","/assets/personName-B4KId4zS.js","/assets/pin-RCfaOwuo.js","/assets/pin-off-Dc2nE1VL.js","/assets/play-BSlv2ErH.js","/assets/presentation-ruovftBx.js","/assets/prop-types-CF5-Ur0d.js","/assets/radio-DPZdV0ry.js","/assets/react-apexcharts.esm-D2MqTSD0.js","/assets/repeat-DHrKTFn4.js","/assets/rotate-ccw-rjVcbIJz.js","/assets/rotate-cw-CoykWmQc.js","/assets/save-DS27q7w7.js","/assets/scale-C0KDOukU.js","/assets/scroll-text-DONqWmqO.js","/assets/search-x-CaGPLyba.js","/assets/segments-Bahsh1lt.js","/assets/send-CT_iybbj.js","/assets/settings-2-DHNsF5xU.js","/assets/shield-DMFtb6tt.js","/assets/shield-alert-DtywFsM3.js","/assets/shield-check-GceOt0zh.js","/assets/shield-question-mark-BzMGSIxK.js","/assets/siren-Btya5odS.js","/assets/smartphone-DvA-3kfv.js","/assets/snowflake-DyGFbGxs.js","/assets/square-CyHrakVs.js","/assets/square-check-big-pIZvwMxO.js","/assets/star-BzUxGhFZ.js","/assets/statusBands-Blnj5GCD.js","/assets/store-BSrmGong.js","/assets/table-2-CzqPpB6p.js","/assets/tag-BuQ3k2Pd.js","/assets/trending-down-CSjQoiRl.js","/assets/trending-up-D56egDJM.js","/assets/undo-2-Dt_aTPBh.js","/assets/useChartTheme-BYKVn7vj.js","/assets/useElementWidth-DSI8txKl.js","/assets/useIsMobile-CNR33Fei.js","/assets/useMutation-BjgbvUsa.js","/assets/useStatusBands-DtCnbHWS.js","/assets/user-B91aRp3I.js","/assets/user-check-QHXhkSUm.js","/assets/user-cog-BHGjYGex.js","/assets/user-minus-DSpfmJNY.js","/assets/users-D1mbebT6.js","/assets/verifyState-ouMO439k.js","/assets/video-Deu9xT21.js","/assets/wallet-ChooGDI6.js","/assets/warehouse-DOnMIKJA.js","/assets/zap-CAzofDXx.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
