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

const BUILD = "2026-09-28T05:20:01.522Z";
const PRECACHE = ["/","/assets/AdminPanel-CQSfAefV.js","/assets/AnalysisBoard-Dm3rF3iG.js","/assets/Arc-CzoMHBdI.js","/assets/ArcLegacy-G8y0rrYA.js","/assets/AttendanceModal-BzVv01h_.js","/assets/BrigadirProfile-CbMIJMx8.js","/assets/BroadcastReceivers-CDbU1QkZ.js","/assets/BroadcastRecord-BATVOs1n.js","/assets/CatLockNotice-DbpilC7K.js","/assets/CategoryLegendModal-Cr-g2SbW.js","/assets/CellConcerns-TmpdBxnj.js","/assets/CellDetails-BhjkcGKh.js","/assets/CellFormModal-kJVZiIsA.js","/assets/CellLink-Dgkqan_t.js","/assets/Cells-DwRkhsq9.js","/assets/ColumnFilter-C21cT1ss.js","/assets/ColumnsPicker-C32la5A9.js","/assets/CommentsModal-CsvPUIBY.js","/assets/ComparisonTable-D9eESLgu.js","/assets/Concerns-DmVaV0QH.js","/assets/ConfirmDialog-DOewZOpO.js","/assets/Daily-CxBgpgx1.js","/assets/DataTable-DnY0lQiR.js","/assets/DateRangePicker-DMd3F0II.js","/assets/DayReportView-DGxnYp10.js","/assets/DayStepper-Dk0SJP6H.js","/assets/DifferenceBreakdown-BNMFIO86.js","/assets/Downtime-CLmJ-Vkq.js","/assets/Education-Dzqqnm38.js","/assets/EducationLesson-D-HhRvin.js","/assets/EmptyState-BIg0wuQS.js","/assets/Exam-BonrMlKP.js","/assets/FactorySelect-Dxtpixrz.js","/assets/Gamification-DvdV4Wrp.js","/assets/GroupBadge-DbmvVHqj.js","/assets/HeatmapChart-DCP-RXJJ.js","/assets/IdleCell-khZlZRuP.js","/assets/KPICard-f_HhCll0.js","/assets/Kaizen-uk5W6gEX.js","/assets/KpiDeltaCard-kP0m9FbH.js","/assets/LangTextInput-DQ_7Pye-.js","/assets/Layout-BCIDGJLw.js","/assets/LeaderAppeal-BFS4BP_e.js","/assets/LeaderDayReport-CTXX-YJG.js","/assets/LeaderUnitReport-DHGwVXg2.js","/assets/Leaderboard-GeDBnXIp.js","/assets/Leaders-DrCAqjtX.js","/assets/Lightbox-RbmtPfVK.js","/assets/LiveOverview-B6zd-cWb.js","/assets/Login-BVHUnXwf.js","/assets/NotFound-Bb3w2x_s.js","/assets/Overview-BlyPZ-Ki.js","/assets/Pagination-DSYKML28.js","/assets/PerenaladkaFactTable-BdVI_8jO.js","/assets/PlanFulfillment-C14oxpw4.js","/assets/Production-B_nSRzGT.js","/assets/Profile-BKWFP_QM.js","/assets/ProofCamera-BPFu_r6G.js","/assets/ProofPhoto-BM2kz_FD.js","/assets/Quality-DpRa4cCL.js","/assets/RequestStateChip-CUwZoN0q.js","/assets/RichTextEditor-x2B_jBGm.js","/assets/SaveState-DrJLJ07w.js","/assets/SearchInput-D18HVdbR.js","/assets/SeasonalityHeatmap-tnlwgulG.js","/assets/SegmentedToggle-D0psav7f.js","/assets/SetupTimes-CYJaRC2e.js","/assets/ShiftDaily-BsVdesja.js","/assets/Staff-MkxYzCLx.js","/assets/StatusBadge-Bm_3dFhc.js","/assets/TargetGoal-CpHDuJpd.js","/assets/Targets-B_2z_N3x.js","/assets/Tasks-BctW479R.js","/assets/TimeWheelPicker-BsEfs4tx.js","/assets/Tooltip-B17LE2xW.js","/assets/TrendChart-DmVnDB9w.js","/assets/TripleSpeedometer-CGSTn34u.js","/assets/Trudoyomkost-BZrZPyw2.js","/assets/UsersActivity-DcELtqbl.js","/assets/WatchProgress-C29SROZ6.js","/assets/WebLogin-DzDY9Ee4.js","/assets/WorkerConcerns-UCYjZB9o.js","/assets/Workers-DYBKsqei.js","/assets/Zagruzka-B3jjSUBs.js","/assets/ZagruzkaCell--Im2vysT.js","/assets/alarm-clock-CXjk85VL.js","/assets/api-OWOXaZdL.js","/assets/archive-CMCVuJES.js","/assets/archive-restore-DwKH6Zko.js","/assets/arrow-down-D-J52nra.js","/assets/arrow-left-YHvHxoif.js","/assets/arrow-left-right-BzhdtDVg.js","/assets/arrow-up-D0LChJ4t.js","/assets/arrow-up-right-L0yrlAIz.js","/assets/award-VSGKVNIN.js","/assets/ban-D90mvSkF.js","/assets/bot-BH6xAn9z.js","/assets/boxes-DEUjj488.js","/assets/brigadirFilters-ClENp2KL.js","/assets/broadcastTree-Yj4TLBA7.js","/assets/building-2-C4_qWzUo.js","/assets/calendar-D163FE3a.js","/assets/calendar-clock-xoHwOfXU.js","/assets/calendar-days-B6U-wnXm.js","/assets/calendar-range-iEs7_--P.js","/assets/camera-BYFIYPeU.js","/assets/categories-DDzLpxr8.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-rs1Q4rpj.js","/assets/chart-line-UNeNznZG.js","/assets/chart-pie-D7WZLHv_.js","/assets/chartRange-BCpHnIZc.js","/assets/chevron-left-DR85O_jL.js","/assets/chevrons-up-down-Cd0bi1Aj.js","/assets/circle-check-big-B2akqKVv.js","/assets/circle-dot-BmaN4TyE.js","/assets/circle-minus-KtSLIRFD.js","/assets/circle-slash-B9SJcjR4.js","/assets/circle-user-round-Ul30JCMF.js","/assets/cloud-off-DyemFsuT.js","/assets/cloud-upload-DnwTbGW-.js","/assets/compass-B1rEIquB.js","/assets/concernCategories-Cq6wRT2h.js","/assets/copy-D2Nv3oSp.js","/assets/corner-down-right-D6czekAL.js","/assets/createLucideIcon-CvtzXxeL.js","/assets/es-DcRHitL4.js","/assets/exportXlsx-CT6NRt2Z.js","/assets/external-link-BsIheCEP.js","/assets/file-clock-BJGBy_cQ.js","/assets/file-exclamation-point-DHWBxDhv.js","/assets/file-spreadsheet-jHosmI8V.js","/assets/file-text-BbsNX9du.js","/assets/flag-DfwhUDgR.js","/assets/flame-Dn-3goZk.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CxEGsXwU.js","/assets/hash-CLxUtrTK.js","/assets/history-DWczgiY3.js","/assets/hourglass-CvEuvuz8.js","/assets/image-BTkrXzda.js","/assets/image-off-CsC2od0P.js","/assets/index-DxrH7PsF.js","/assets/index-TBzEnSGJ.css","/assets/key-round-CpyWuIqI.js","/assets/keyboard-BwEbX7Up.js","/assets/languages-BQFj85NQ.js","/assets/layers-xCNMGuIq.js","/assets/leaderReason-C0guuEUf.js","/assets/lightbulb-Cn4U48qT.js","/assets/link-2-CZ3ni9v0.js","/assets/list-checks-DQOteWYV.js","/assets/list-ordered-SiUzdy4S.js","/assets/list-tree-B-Hu7DyV.js","/assets/lock-open-C8eh-wOE.js","/assets/log-in-BWYhqnUw.js","/assets/message-square-CFMPyK3Y.js","/assets/minimize-2-F86Z0aXL.js","/assets/package-check-xt6qmLHW.js","/assets/paperclip-dfnKOcQp.js","/assets/pencil-ZUui0Z3P.js","/assets/personName-B4KId4zS.js","/assets/pin-CwX8Qz_-.js","/assets/pin-off-BQ8zBBa4.js","/assets/play-BOiw08Z0.js","/assets/presentation-CAYJC1PY.js","/assets/prop-types-DTl3qHdw.js","/assets/radio-CJK1C0q5.js","/assets/react-apexcharts.esm-y5EtA8Nz.js","/assets/repeat-CSiOCtoA.js","/assets/rotate-ccw-e4efPZ3I.js","/assets/rotate-cw-B4DbuDVA.js","/assets/save-B7RtY5O0.js","/assets/scale-BlKXuaj4.js","/assets/scroll-text-HpillQbS.js","/assets/search-x-C9TzLUDi.js","/assets/segments-CJVdVP9W.js","/assets/send-CXd_UajN.js","/assets/settings-2-B7N8KbsZ.js","/assets/shield-DyxKK76f.js","/assets/shield-alert-Q_jGAfwV.js","/assets/shield-check-BnInsCMc.js","/assets/shield-question-mark-Tz_Tox4K.js","/assets/siren-CHmx9DYg.js","/assets/smartphone-BI2hm0dD.js","/assets/snowflake-Fl8LHX3r.js","/assets/square-an7578cL.js","/assets/square-check-big-SqZLFlNy.js","/assets/star-ClQgEj2N.js","/assets/statusBands-CAvy420M.js","/assets/store-BC_ySNSu.js","/assets/table-2-BnsvVOqq.js","/assets/tag-CcTqDz1u.js","/assets/trending-down-CLUCKIOB.js","/assets/trending-up-avY0w_nm.js","/assets/undo-2-D2AjxahW.js","/assets/useChartTheme-B6sPWuy2.js","/assets/useElementWidth-FiplfpD7.js","/assets/useIsMobile-BFJqjAH7.js","/assets/useMutation-Dxlm796W.js","/assets/useStatusBands-Bt-8j5Fi.js","/assets/user-Dn6VPdCs.js","/assets/user-check-B4QkUXE0.js","/assets/user-cog-CEBAAgYn.js","/assets/user-minus-DV-RtpnH.js","/assets/users-CyaNrdhR.js","/assets/verifyState-Bcq_0vRn.js","/assets/video-BdGMYenV.js","/assets/wallet-Cmmzvabr.js","/assets/warehouse-DYLZAh4J.js","/assets/zap-GHdKs2WE.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
