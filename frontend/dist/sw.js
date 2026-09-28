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

const BUILD = "2026-09-28T05:23:11.207Z";
const PRECACHE = ["/","/assets/AdminPanel-JsHZit2v.js","/assets/AnalysisBoard-CcCIJRWI.js","/assets/Arc-iKP4MUHm.js","/assets/ArcLegacy-vPeAk9Sz.js","/assets/AttendanceModal-xze8ZuKt.js","/assets/BrigadirProfile-Cvxf-tfQ.js","/assets/BroadcastReceivers-Vt2odkg9.js","/assets/BroadcastRecord--VWV98GE.js","/assets/CatLockNotice-BAKT8oct.js","/assets/CategoryLegendModal-CjgWGSed.js","/assets/CellConcerns-CbQHjiYV.js","/assets/CellDetails-Uo7GnjN9.js","/assets/CellFormModal-ByuPNAxN.js","/assets/CellLink-Blo_U12a.js","/assets/Cells-DdR6QGj5.js","/assets/ColumnFilter-LKsuMsBV.js","/assets/ColumnsPicker-B-sLECHA.js","/assets/CommentsModal-BOJliM-C.js","/assets/ComparisonTable--8iiS0aP.js","/assets/Concerns-B4jm6N5j.js","/assets/ConfirmDialog-DUrzzg1s.js","/assets/Daily-Dw3ImBIR.js","/assets/DataTable-DzdD0aiS.js","/assets/DateRangePicker-DFs4Lds4.js","/assets/DayReportView-Dibb9d24.js","/assets/DayStepper-CO8To7Gt.js","/assets/DifferenceBreakdown-C7jDgoMd.js","/assets/Downtime-TXcuPFpO.js","/assets/Education-dPnnoTLK.js","/assets/EducationLesson-CCHb-jSY.js","/assets/EmptyState-D_fH8Qw0.js","/assets/Exam-TLLlRLz-.js","/assets/FactorySelect-DzBx3Oic.js","/assets/Gamification-CJ93izbm.js","/assets/GroupBadge-C2zbYLFg.js","/assets/HeatmapChart-Sq3-DR29.js","/assets/IdleCell-BvP2Z-up.js","/assets/KPICard-DpOaSYXk.js","/assets/Kaizen-tf_244d4.js","/assets/KpiDeltaCard-BGc2d7XC.js","/assets/LangTextInput-D51fl1_b.js","/assets/Layout-D5mthaiC.js","/assets/LeaderAppeal-Cl__YJqW.js","/assets/LeaderDayReport-CNKzA8cg.js","/assets/LeaderUnitReport-ClaqTaUD.js","/assets/Leaderboard-DLSx2GbY.js","/assets/Leaders-ZnOWamkr.js","/assets/Lightbox-BoJo1d5M.js","/assets/LiveOverview-Bhozpwoy.js","/assets/Login-DVnc-Iib.js","/assets/NotFound-Czu6Y5U9.js","/assets/Overview-B0cLfXqr.js","/assets/Pagination-BG66DpqP.js","/assets/PerenaladkaFactTable-B1YRP3HT.js","/assets/PlanFulfillment-CEYRVcqO.js","/assets/Production-CAz1T_yz.js","/assets/Profile-BNhL9SNy.js","/assets/ProofCamera-OKyZ4JrF.js","/assets/ProofPhoto-BtDE6j6l.js","/assets/Quality-C-9WqisW.js","/assets/RequestStateChip-DLckNR7a.js","/assets/RichTextEditor-yIwRzrLk.js","/assets/SaveState-BelooNvQ.js","/assets/SearchInput-BvH3wcqY.js","/assets/SeasonalityHeatmap-BfL3xL1b.js","/assets/SegmentedToggle-CIIN8m3X.js","/assets/SetupTimes-CvFYv5T2.js","/assets/ShiftDaily-FOg5golX.js","/assets/Staff-Bh_ZiQNC.js","/assets/StatusBadge-DlQ7vlak.js","/assets/TargetGoal-CQJf5BIU.js","/assets/Targets-BrBt5Lpf.js","/assets/Tasks-BS6-jAga.js","/assets/TimeWheelPicker-DZGg23o6.js","/assets/Tooltip-DXSD3-M7.js","/assets/TrendChart-vk9uBi2n.js","/assets/TripleSpeedometer-neGpDLXm.js","/assets/Trudoyomkost-07DhG476.js","/assets/UsersActivity-U-zIB_k2.js","/assets/WatchProgress-D8YbE_hG.js","/assets/WebLogin-bNXQvV3T.js","/assets/WorkerConcerns-DQ6EfPih.js","/assets/Workers-CXBFgAAp.js","/assets/Zagruzka-DvRgM2fb.js","/assets/ZagruzkaCell-CK8pHkzi.js","/assets/alarm-clock-BidHO-yy.js","/assets/api-D4m66Dd-.js","/assets/archive-BQKc49dB.js","/assets/archive-restore-a0tuzps1.js","/assets/arrow-down-Dnh51gIi.js","/assets/arrow-left-DZGvp04W.js","/assets/arrow-left-right-DyPqzNKV.js","/assets/arrow-up-B6bLoeLR.js","/assets/arrow-up-right-dLeUv7_Y.js","/assets/award-BniUNaDQ.js","/assets/ban-CORbuz1c.js","/assets/bot-Bm86Rrxg.js","/assets/boxes-D0Q_4brR.js","/assets/brigadirFilters-Dge52Hib.js","/assets/broadcastTree-BpR_mvA_.js","/assets/building-2-DUM16DuS.js","/assets/calendar-CUHSiZwW.js","/assets/calendar-clock-P_74u9xy.js","/assets/calendar-days-Cdin-Bzt.js","/assets/calendar-range-CV9RjbBk.js","/assets/camera-CjSK9KIH.js","/assets/categories-BYaxBeWN.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DRUT8suG.js","/assets/chart-line-CDDCEx3W.js","/assets/chart-pie-CXuBTrEy.js","/assets/chartRange-pUI0dIaI.js","/assets/chevron-left-BxAR7z0g.js","/assets/chevrons-up-down-Cd-CEKkI.js","/assets/circle-check-big-DV4Crvgz.js","/assets/circle-dot-BnCRlZ02.js","/assets/circle-minus-CF6XH3I-.js","/assets/circle-slash-Bvt71LdZ.js","/assets/circle-user-round-6Y3qoUt9.js","/assets/cloud-off-Db2MBV1u.js","/assets/cloud-upload-BDn9PXDJ.js","/assets/compass-BEoayjyh.js","/assets/concernCategories-nJxRqTYd.js","/assets/copy-OR0_SiH-.js","/assets/corner-down-right-CvOxgqq5.js","/assets/createLucideIcon-C_7_8LMR.js","/assets/es-CA-lQ-0n.js","/assets/exportXlsx-DsM8MVcp.js","/assets/external-link-XLe0ybPK.js","/assets/file-clock-B_NaafLA.js","/assets/file-exclamation-point-KJkj8dWf.js","/assets/file-spreadsheet-DFkXg5Nm.js","/assets/file-text-B8LKW7pK.js","/assets/flag-CttWTTcG.js","/assets/flame-Cjr-fEH_.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BR5ueGgt.js","/assets/hash-Cn9sUhHh.js","/assets/history-BSL-nNk0.js","/assets/hourglass-iiQD_pmn.js","/assets/image-CnHjpjnD.js","/assets/image-off-eu4nd3lr.js","/assets/index-DCBGdPBL.js","/assets/index-TBzEnSGJ.css","/assets/key-round-DE6i7rU3.js","/assets/keyboard-2jPKDtSq.js","/assets/languages-MsyGrjbi.js","/assets/layers-DNZstRR5.js","/assets/leaderReason-BZ3BjgBk.js","/assets/lightbulb-B31poRrH.js","/assets/link-2-Do5vBXBj.js","/assets/list-checks-NfWE-ThB.js","/assets/list-ordered-C8WsJvBS.js","/assets/list-tree-BV7NADov.js","/assets/lock-open-BQbg0zXg.js","/assets/log-in-4xjHTc3w.js","/assets/message-square-DnmjeeGs.js","/assets/minimize-2-CDP1yGwp.js","/assets/package-check-CM3oOJfg.js","/assets/paperclip-fjg66bYK.js","/assets/pencil-DiaTPO9y.js","/assets/personName-B4KId4zS.js","/assets/pin-BcdXxSNq.js","/assets/pin-off-tji-dPNf.js","/assets/play-C-eA8zhr.js","/assets/presentation-DiiW7ToO.js","/assets/prop-types-CnXRR08L.js","/assets/radio-C07shhiH.js","/assets/react-apexcharts.esm-D7DEp6MW.js","/assets/repeat-DIzmBnGF.js","/assets/rotate-ccw-DACVdRrS.js","/assets/rotate-cw-ZcKG3R_p.js","/assets/save-Dh8JWcb3.js","/assets/scale-Ck5uXyc5.js","/assets/scroll-text-C8MYfbMT.js","/assets/search-x-CSZIk-XY.js","/assets/segments-DF10PaU9.js","/assets/send-CpcthVoK.js","/assets/settings-2-Wc6Z_nwY.js","/assets/shield-D2dVgfP0.js","/assets/shield-alert-FAerF4UG.js","/assets/shield-check-CbW4l6Cr.js","/assets/shield-question-mark-Bn0GYyWt.js","/assets/siren-DcGDaPKi.js","/assets/smartphone-C5F6uBJs.js","/assets/snowflake-CS06B6bH.js","/assets/square-BAbcKVg0.js","/assets/square-check-big-B4Lx9AIv.js","/assets/star-Bo9AEw-b.js","/assets/statusBands-DqV_7lVt.js","/assets/store-BH7RLTiy.js","/assets/table-2-DPDq44OD.js","/assets/tag-Dbos6b-5.js","/assets/trending-down-DxQPfhaW.js","/assets/trending-up-D8FA-XWt.js","/assets/undo-2-Bc3wv3hF.js","/assets/useChartTheme-kKQxGoOk.js","/assets/useElementWidth-W7gdbjf1.js","/assets/useIsMobile-DeMDwdCL.js","/assets/useMutation-BGjpyA79.js","/assets/useStatusBands-CFfSjBqg.js","/assets/user-Lc4AEVtu.js","/assets/user-check-C6O-M3PT.js","/assets/user-cog-Bv0VqqEb.js","/assets/user-minus-DnTUD1rW.js","/assets/users-BGaldcoT.js","/assets/verifyState-DE8VcX5_.js","/assets/video-DUJW5-0K.js","/assets/wallet-DIonFlCh.js","/assets/warehouse-DGsUbvRY.js","/assets/zap-2y_Wp1nf.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
