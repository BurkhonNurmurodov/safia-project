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

const BUILD = "2026-10-29T06:20:01.580Z";
const PRECACHE = ["/","/assets/AdminPanel-BSssvlMZ.js","/assets/AnalysisBoard-D0kOtyaH.js","/assets/Arc-C9idszc0.js","/assets/Assistant-B8ff3AdV.js","/assets/BrigadirProfile-DPQuRSTn.js","/assets/BroadcastReceivers-DBbARoHh.js","/assets/BroadcastRecord-ChCfH4dN.js","/assets/Button-D4YlKYZP.js","/assets/CatLockNotice-DdNziP_K.js","/assets/CategoryLegendModal-B7AHoVN8.js","/assets/CellConcerns-Bmxaviaw.js","/assets/CellDetails-C-6fQgyb.js","/assets/CellFormModal-BmPmacPf.js","/assets/CellIdent-BB1WpTdw.js","/assets/CellLink-D1sZLVSH.js","/assets/Cells-DcNd4S1s.js","/assets/ColumnFilter-bW6PsQ90.js","/assets/ColumnsPicker-CsmXzg7y.js","/assets/CommentsModal-DC5hn8YD.js","/assets/ComparisonTable-DzXiWJVt.js","/assets/Concerns-CSxpHuPk.js","/assets/CountStepper-Cy7Oo__t.js","/assets/Daily-Ck72a1_Q.js","/assets/DataTable-tEIudlqF.js","/assets/DateRangePicker-BNDxXRAh.js","/assets/DayReportView-DPamlS6u.js","/assets/DayStepper-Cj2pfxs7.js","/assets/DayStrip-D2nG0oLw.js","/assets/DifferenceBreakdown-CvJK39VJ.js","/assets/Downtime-C6MN5d2O.js","/assets/Education-B2yUv7DG.js","/assets/EducationLesson-B_ork3WC.js","/assets/EmptyState-CBY2p3eT.js","/assets/Exam-DryjsGqo.js","/assets/FactorySelect-CLplFKhb.js","/assets/Gamification-DzjkHZ6d.js","/assets/GroupBadge-BL0weRME.js","/assets/HeatmapChart-B7odPyx4.js","/assets/IdleCell-CkwnalLt.js","/assets/KPICard-C64qH2xf.js","/assets/Kaizen-B-SB75UH.js","/assets/Kelish-Bt03jg5n.js","/assets/KpiDeltaCard-CXY_spcF.js","/assets/LangTextInput-DkfxdFvl.js","/assets/Layout-DkN8eoIw.js","/assets/LeaderAppeal-BBxkP3CO.js","/assets/LeaderDayReport-CSsYJ31h.js","/assets/LeaderUnitReport-DEBNbZkh.js","/assets/Leaderboard-mFp-rPmN.js","/assets/Leaders-nLlIvSMD.js","/assets/LeadersKpi-BLc1Q9A7.js","/assets/Lightbox-3OhiqMGk.js","/assets/LiveOverview-n_iXyiD5.js","/assets/Login-eZHdMc99.js","/assets/NotFound-BnnpWhcI.js","/assets/Notifications-NwwGHyDk.js","/assets/Ontime-U3hto9X-.js","/assets/Overview-rgCQy14H.js","/assets/Pagination-BqMEmGWH.js","/assets/PerenaladkaFactTable-Cx_QbjPf.js","/assets/PersonCard-wFAbVKwO.js","/assets/PlanFulfillment-BTUd6Zns.js","/assets/Production-VvPF35X5.js","/assets/Profile-BJ8mHY4Y.js","/assets/ProofCamera-COsa9zK8.js","/assets/ProofPhoto-CkzscZGN.js","/assets/Quality-CO5MsA9F.js","/assets/RawRows-DUydWE55.js","/assets/Reports-C2qFVOeO.js","/assets/RequestStateChip-hnnACooQ.js","/assets/RichTextEditor-Db5r4Cho.js","/assets/SaveState-CfdTsp2g.js","/assets/SearchInput-C2D4LYuT.js","/assets/SeasonalityHeatmap-OKqAGeuE.js","/assets/SegmentedToggle-oIFg6zP0.js","/assets/SetupTimes-JkRmwggU.js","/assets/ShiftDaily-DWr_1Hmp.js","/assets/Staff-CUVENzU3.js","/assets/StaffListAtCheck-D9qnbOPX.js","/assets/StatusBadge-DlGO0gX1.js","/assets/StatusBandsModal-Ce9J8L_l.js","/assets/TargetGoal-DE0OpB4n.js","/assets/Targets-BNpYkcs0.js","/assets/Tasks-B-36lAA5.js","/assets/TimeWheelPicker-D06E3F_U.js","/assets/Toast-Bnj9X3vB.js","/assets/Tooltip-rcVJJ7CY.js","/assets/TrendChart-27Y3UakX.js","/assets/TripleSpeedometer-CiU-6Tz7.js","/assets/Trudoyomkost-CvcZ1_oa.js","/assets/UploadDropzone-QYLKmDe6.js","/assets/UsersActivity-D8wzWv04.js","/assets/VerdictBlock-CpwAajFD.js","/assets/VfxApiMap-u3yz2ZVb.js","/assets/VfxDictionaries-DCbaoqqS.js","/assets/VfxEmployees-C2Gsfm7A.js","/assets/VfxHrMoves-GBikc4M1.js","/assets/VfxJobs-BvVcifMX.js","/assets/VfxPhoto-C1p3EaZv.js","/assets/VfxShifts-CRWJIa0e.js","/assets/VfxState-BVyeGTrn.js","/assets/VfxTimebooks-C5bP1-Ht.js","/assets/VfxTimesheet-Dy-mCidT.js","/assets/WatchProgress-DgdCYBOB.js","/assets/WebLogin-4RCqXmAx.js","/assets/Workers-BHtBUduD.js","/assets/Zagruzka-CcGpwNAn.js","/assets/ZagruzkaCell-6Cjv3O3k.js","/assets/api-BFm7MSgf.js","/assets/archive-BNQINDfs.js","/assets/archive-restore-CDyJs4XU.js","/assets/arrow-down-CBi9G5w9.js","/assets/arrow-down-right-BYS9zXR6.js","/assets/arrow-down-wide-narrow-CUR5_bF1.js","/assets/arrow-up-narrow-wide-CK0HWreV.js","/assets/ban-DNjCrlWF.js","/assets/boxes-Xv7t2ZPK.js","/assets/braces-DqJJWfeh.js","/assets/brigadirFilters-DMnsiuuf.js","/assets/broadcastTree-B3Yc81zv.js","/assets/building-2-DNkyDEMW.js","/assets/calendar-days-BwWeiktG.js","/assets/calendar-ru2DGB58.js","/assets/camera-wwkE80VN.js","/assets/categories-CY1DwDFd.js","/assets/cellMoveRefusal-BX6SDY2L.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D9J5B-n2.js","/assets/chart-line-OK8oGWnw.js","/assets/chart-pie-ViOicRkj.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-DQwGnsLH.js","/assets/chevron-left-BoxYL51X.js","/assets/chevrons-up-down-DxvjKTjE.js","/assets/circle-DmF1IGYC.js","/assets/circle-alert-BV14suAK.js","/assets/circle-check-big-C8JjuKab.js","/assets/circle-dashed-Cn7elE8R.js","/assets/circle-minus-PYMUgtpu.js","/assets/circle-question-mark-BxGP_hDE.js","/assets/circle-slash-BMTIlnPB.js","/assets/circle-user-round-h0zV7I53.js","/assets/cloud-off-DyJ8SFcS.js","/assets/cloud-upload-DUN8hbLi.js","/assets/coins-BD6KWgRD.js","/assets/compass-FCbWAWv5.js","/assets/concernCategories-DNMS-k5D.js","/assets/corner-down-right-DYC9tExz.js","/assets/createLucideIcon-BvqOQCxx.js","/assets/en-CVTvnRpP.js","/assets/es-Dtgc5NM1.js","/assets/external-link-BTFaFFlu.js","/assets/file-clock-Bjz-2OeZ.js","/assets/file-exclamation-point-CJTESaFS.js","/assets/flag-B3eHAQQS.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DRpkQsnI.js","/assets/funnel-BFAoCRIA.js","/assets/hash-B5osN009.js","/assets/hourglass-DEhzf6t8.js","/assets/idleTime-CHPnJRpw.js","/assets/image-CPbXJ1JS.js","/assets/image-off-DEGh5MgK.js","/assets/inbox-AiX0-cqs.js","/assets/index-BtYmuUYW.css","/assets/index-By4z2E-a.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CFqhPCfv.js","/assets/languages-CzA_c2NU.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CKRVt8Zh.js","/assets/leaderBoard-WvyKnQHh.js","/assets/lightbulb-BG8Q8kwR.js","/assets/link-2-Cg6ETX6w.js","/assets/link-2-off-DhCDEnRb.js","/assets/list-ordered-D0vRv_f7.js","/assets/list-tree-BYwXo5E1.js","/assets/lock-open-BQRegMMo.js","/assets/log-in-D_31VyC4.js","/assets/map-pin-DR-kBuxY.js","/assets/marks-Dh8mcOxb.js","/assets/minimize-2-DU4UF3dO.js","/assets/package-check-DSjjETWu.js","/assets/pencil-B7y_RF8n.js","/assets/percent-Dstokhsp.js","/assets/pin-DlkUFBJq.js","/assets/pin-off-Ch_s8gME.js","/assets/play-DE0bB63n.js","/assets/plug-zap-DSFf-5Oi.js","/assets/prop-types-RD3fbola.js","/assets/radio-CpHvCaFU.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-DY2k3F2c.js","/assets/repeat-CB-KpVQr.js","/assets/ru-CvtdwRpg.js","/assets/save-WogpCS2P.js","/assets/scopeLinks-C3j-OM5_.js","/assets/scroll-text-M7zrU4C3.js","/assets/search-x-CsCwNQ_o.js","/assets/segments-D5Uiedtv.js","/assets/send-BmZ41RkR.js","/assets/settings-2-YWY7vKbV.js","/assets/shield-alert-BlHFUs2M.js","/assets/shield-hpM71lto.js","/assets/shield-question-mark-DWMPdGiR.js","/assets/sigma-B6CNJ-iQ.js","/assets/siren-BK7RWHe7.js","/assets/snowflake-DwcppHkq.js","/assets/split-CH7CGvzJ.js","/assets/square-check-big-Bj1piMrY.js","/assets/star-C7iAly_J.js","/assets/statusBands-DVBZcBq3.js","/assets/store-G_KUCWsV.js","/assets/table-2-V1NbdaJM.js","/assets/table-properties-BIG6Me66.js","/assets/tag-DHN7APx4.js","/assets/timer-off-Dqg5q7oj.js","/assets/translations-Y0hVt8J-.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-BwKFWB1s.js","/assets/trending-up-p628y6-_.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-C-bTnUc-.js","/assets/useChartTheme-BNmfJCpy.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-CEcesQa5.js","/assets/useStatusBands-Km-_5h6D.js","/assets/useUrlScope-C1XBG6Wx.js","/assets/user-C2b-yu2H.js","/assets/user-cog-RI5JqA23.js","/assets/user-minus-Cs3fPHSR.js","/assets/users-C9vljObX.js","/assets/uz-DyZgG9yL.js","/assets/uz_cyrl-ByiyhwqM.js","/assets/vfx-DVchwdP_.js","/assets/video-DGIaQIT2.js","/assets/wallet-HKunPLUW.js","/assets/warehouse-DFvhNbUF.js","/assets/workflow-Uok5uuWu.js","/assets/x-L6Z90TYL.js","/assets/zap-CTFugGjp.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
