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

const BUILD = "2026-09-29T10:24:43.063Z";
const PRECACHE = ["/","/assets/AdminPanel-DiSmOCN0.js","/assets/AnalysisBoard-BLfa1A7d.js","/assets/Arc-BUTtnHgW.js","/assets/ArcLegacy-B99vkc9P.js","/assets/AttendanceModal-4nP3N6jK.js","/assets/BrigadirProfile-B8spQgCT.js","/assets/BroadcastReceivers-BgtHXaXa.js","/assets/BroadcastRecord-D71fcewW.js","/assets/CatLockNotice-Dwf8U0x8.js","/assets/CategoryLegendModal-CXGcuO0Z.js","/assets/CellConcerns-Dkc1Hchw.js","/assets/CellDetails-6jMXiNYD.js","/assets/CellFormModal-BRzK4dad.js","/assets/CellLink-DYqfEyfd.js","/assets/Cells-A4YilQ7v.js","/assets/ColumnFilter-BHE81rSp.js","/assets/ColumnsPicker-8JS0izqS.js","/assets/CommentsModal-trN1jXi1.js","/assets/ComparisonTable-lsbbXUgI.js","/assets/Concerns-_vgCsxwO.js","/assets/ConfirmDialog-BA5d7G8I.js","/assets/Daily-N4Xfekz2.js","/assets/DataTable-Drv-_7_D.js","/assets/DateRangePicker-CeIxu-Hn.js","/assets/DayReportView-DlSb-imm.js","/assets/DayStepper-Bh0cVSlr.js","/assets/DifferenceBreakdown-FYdNJI_0.js","/assets/Downtime-CXyuKLXf.js","/assets/Education-CYphvvOb.js","/assets/EducationLesson-DmbYqGEm.js","/assets/EmptyState-CnJbfW-L.js","/assets/Exam-DNKFlD6-.js","/assets/FactorySelect-oIl6U2fy.js","/assets/Gamification-CeQRVhcI.js","/assets/GroupBadge-zQkP2ly6.js","/assets/HeatmapChart-Qyq4W630.js","/assets/IdleCell-_MILCGor.js","/assets/KPICard-B2MEV5Ug.js","/assets/Kaizen-CDK3yld9.js","/assets/Kelish-BlSkEozU.js","/assets/KpiDeltaCard-CCmG7GVs.js","/assets/LangTextInput-D9doA0ot.js","/assets/Layout-B92hpNK0.js","/assets/LeaderAppeal-B1nhbMYb.js","/assets/LeaderDayReport-CnXVVLBc.js","/assets/LeaderUnitReport-CJv0P8SW.js","/assets/Leaderboard-DGNgaUt-.js","/assets/Leaders-DlwKLbx0.js","/assets/Lightbox-ssU58_e7.js","/assets/LiveOverview-IPeqZEK2.js","/assets/Login-NmLfMT8O.js","/assets/NotFound-If1gKNzJ.js","/assets/Overview-CQeXzLk3.js","/assets/Pagination-DHh7fN3r.js","/assets/PerenaladkaFactTable-DGc0tBiH.js","/assets/PlanFulfillment-DUGp_WOU.js","/assets/Production-Dx6Bu6zD.js","/assets/Profile-DdRNUzMY.js","/assets/ProofCamera-DPGIZcFW.js","/assets/ProofPhoto-Ba66dHw8.js","/assets/Quality-B8UdNP1i.js","/assets/RequestStateChip-DtYHxjtF.js","/assets/RichTextEditor-C603wTNF.js","/assets/SaveState-DUAlnAen.js","/assets/SearchInput-Dg6uhJ2i.js","/assets/SeasonalityHeatmap-lfMN38Kn.js","/assets/SegmentedToggle-83kak70N.js","/assets/SetupTimes-tCULRJJi.js","/assets/ShiftDaily-3UEnFVeC.js","/assets/Staff-ZEJ-32Bv.js","/assets/StatusBadge-CRcxzYjd.js","/assets/TargetGoal-BFodFuSq.js","/assets/Targets-COr4Z0HA.js","/assets/Tasks-A0U7L9yb.js","/assets/TimeWheelPicker-CwdXdzxV.js","/assets/Tooltip-Dvf8x33M.js","/assets/TrendChart-D8e94k2C.js","/assets/TripleSpeedometer-B7SUF7vR.js","/assets/Trudoyomkost-BxAqb8J8.js","/assets/UploadDropzone-CXc5CMuh.js","/assets/UsersActivity-BMa1NNUK.js","/assets/VerdictBlock-DMGqZ69V.js","/assets/WatchProgress-DOSpz100.js","/assets/WebLogin-DVjtMZBj.js","/assets/WorkerConcerns-BqABsEz4.js","/assets/Workers-CN4jQO8E.js","/assets/Zagruzka-BQ83mVnm.js","/assets/ZagruzkaCell-fTnFC0bx.js","/assets/api-CPkU-n8-.js","/assets/archive-8I0cS9Ki.js","/assets/archive-restore-sNydiE4L.js","/assets/arrow-down-DOpydopO.js","/assets/arrow-left-BcI8HOe3.js","/assets/arrow-left-right-BRZSEGPQ.js","/assets/arrow-up-Ay07viYs.js","/assets/arrow-up-narrow-wide-C4DiSdjH.js","/assets/arrow-up-right-D_GCDNaT.js","/assets/award-B36sdvOk.js","/assets/ban-DnQsm9hq.js","/assets/bot-CGBHAWvU.js","/assets/boxes-CEqaMGXQ.js","/assets/brigadirFilters-CO7WQZHg.js","/assets/broadcastTree-uGQqBijR.js","/assets/building-2-b2IsJIj9.js","/assets/calendar-Crrfnww5.js","/assets/calendar-clock-BOQqkElm.js","/assets/calendar-days-BBtt52iz.js","/assets/calendar-range-VdrmXo85.js","/assets/camera-DXAnlyUL.js","/assets/categories-zblGote8.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-YZjOBOfb.js","/assets/chart-line-apYDQoXY.js","/assets/chart-pie-BnRr_2T1.js","/assets/chartRange-BGaKWRXM.js","/assets/chevron-left-C4K49IpP.js","/assets/chevrons-up-down-nUKfS3CI.js","/assets/circle-Bf1tdLC8.js","/assets/circle-check-big-DZ-Y9f5r.js","/assets/circle-dot-0jsWhSxf.js","/assets/circle-minus-CGYfnMdE.js","/assets/circle-slash-Beq3Z6ep.js","/assets/circle-user-round-Beeyv9nt.js","/assets/cloud-off-B2NZuHJo.js","/assets/cloud-upload-Cr7W-MPb.js","/assets/compass-DGZHYJNU.js","/assets/concernCategories-Bc28E8P0.js","/assets/copy-D69smJDz.js","/assets/corner-down-right-DB5m05oA.js","/assets/createLucideIcon-pTCoC-6Q.js","/assets/es-C6Y5Nxsl.js","/assets/exportXlsx-DOctyKkQ.js","/assets/external-link-DXv6QO6S.js","/assets/file-clock-BnedV_ex.js","/assets/file-exclamation-point-Cc--9tIv.js","/assets/file-spreadsheet-BxHzer6v.js","/assets/file-text-Tl6iBJj2.js","/assets/flag-DfW_gUdA.js","/assets/flame-D2FSZQA2.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DF3uOAUv.js","/assets/hash-CgqnZEAw.js","/assets/history-Bhcb6ybr.js","/assets/hourglass-DHVSjUlz.js","/assets/image-D_frsS0b.js","/assets/image-off-BIa-hIXw.js","/assets/index-ClcfsWXQ.css","/assets/index-npXmLldU.js","/assets/key-round-E-3wwC-j.js","/assets/keyboard-aBZRsC3V.js","/assets/languages-BUQ6BwII.js","/assets/layers-9iRURQRk.js","/assets/lightbulb-BAG5rn3d.js","/assets/link-2-Tnbr2LeT.js","/assets/link-2-off-BFRlgeLQ.js","/assets/list-checks-DDupZeT6.js","/assets/list-ordered-B9CMQXU6.js","/assets/list-tree-S1Oosdky.js","/assets/lock-open-CV3a5gv6.js","/assets/log-in-DOwCQaww.js","/assets/maximize-2-Ceos64hZ.js","/assets/message-square-DNFlt_FS.js","/assets/minimize-2-BEofIcUz.js","/assets/package-check-BDzIEYKY.js","/assets/paperclip-h2IvLEHw.js","/assets/pencil-sun650UM.js","/assets/percent-jUAVR5Ze.js","/assets/personName-CogOuS3K.js","/assets/pin-a7SYtsYH.js","/assets/pin-off-rFpNIb7Y.js","/assets/play-TmBR2YoU.js","/assets/presentation-27PPdsH0.js","/assets/prop-types-Ct5Lnqwn.js","/assets/radio-Dzt__RY1.js","/assets/react-apexcharts.esm-DXtZl5yp.js","/assets/repeat-BG9_5AzY.js","/assets/rotate-ccw-CZoR7MWG.js","/assets/rotate-cw-C-nBEogm.js","/assets/save-C_sp1I8n.js","/assets/scale-DMMOzXuJ.js","/assets/scroll-text-DPWOBgEN.js","/assets/search-x-D6zSSc7w.js","/assets/segments-okj_xzcI.js","/assets/send-CQ0lNihv.js","/assets/settings-2-Dl2I3XU1.js","/assets/shield-B5Nit_hl.js","/assets/shield-alert-DUzPFcUm.js","/assets/shield-check-D2K0AsGg.js","/assets/shield-question-mark-lvUmqYSV.js","/assets/siren-AGyg_gDq.js","/assets/snowflake-BqywLPX_.js","/assets/square-A0deKtc9.js","/assets/square-check-big-CCNlCneC.js","/assets/star-DLuNadQa.js","/assets/statusBands-wjnpWgga.js","/assets/store-BPxl4eAb.js","/assets/table-2-DAiSfoSm.js","/assets/table-properties-YQF2lfdS.js","/assets/tag-DxODbpYk.js","/assets/timer-off-CcGk6d6w.js","/assets/trending-down-DTFg-D3q.js","/assets/trending-up-CMXclXv5.js","/assets/undo-2-BD2O7aUp.js","/assets/useChartTheme-5mWZ54Vy.js","/assets/useElementWidth-DrQht8Kw.js","/assets/useIsMobile-Df7IgrXF.js","/assets/useMutation-B-8e2yhL.js","/assets/useStatusBands-B8IquMA7.js","/assets/user-cog-zBjB8qX5.js","/assets/user-dks2hQrJ.js","/assets/user-minus-CnpaHpk5.js","/assets/users-C96o5Hv1.js","/assets/video-RcSK9ReY.js","/assets/wallet-Cy6E2xit.js","/assets/warehouse-BXXKsN3_.js","/assets/zap-BKDAh6ls.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
