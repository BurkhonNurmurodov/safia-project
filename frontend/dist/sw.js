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

const BUILD = "2026-10-05T12:13:35.551Z";
const PRECACHE = ["/","/assets/AdminPanel-BkEkRxLQ.js","/assets/AnalysisBoard-B5P4KA-e.js","/assets/Arc-Wn-JTlpK.js","/assets/BrigadirProfile-Be-0xqG4.js","/assets/BroadcastReceivers-CSup4fqj.js","/assets/BroadcastRecord-4w8nxMx8.js","/assets/Button-DvX1iH6y.js","/assets/CatLockNotice-WLc6JZEl.js","/assets/CategoryLegendModal-B1hPVPeJ.js","/assets/CellConcerns-CxJfRx7k.js","/assets/CellDetails-Fy3D3nvb.js","/assets/CellFormModal-eVwJ8rQY.js","/assets/CellIdent-Cv85bY8g.js","/assets/CellLink-DYk8Bz1R.js","/assets/Cells-OsncGln2.js","/assets/ColumnFilter-BpWBDLrl.js","/assets/ColumnsPicker-Do9YZU1I.js","/assets/CommentsModal-CioY2I0d.js","/assets/ComparisonTable-hXpdAsdf.js","/assets/Concerns-ZlChsB_u.js","/assets/Daily-BQ4QFDRh.js","/assets/DataTable-DcNl_BG_.js","/assets/DateRangePicker-DrqCuvo2.js","/assets/DayReportView-Blv2nsde.js","/assets/DayStepper-D8k4aUiO.js","/assets/DifferenceBreakdown-BCXbTMLB.js","/assets/Downtime-eg4O1OUF.js","/assets/Education-CoJTeo9Q.js","/assets/EducationLesson-H4mAealg.js","/assets/EmptyState-Cw2-yV0-.js","/assets/Exam-aMgGKq_y.js","/assets/FactorySelect-BPrkUZem.js","/assets/Gamification-kf2ViJ5t.js","/assets/GroupBadge-Bu4DMZGh.js","/assets/HeatmapChart-DMXUHFWI.js","/assets/IdleCell-DOV56zX0.js","/assets/KPICard-DZNnV3Hp.js","/assets/Kaizen-G_5My1sY.js","/assets/Kelish-BoQtb6Ir.js","/assets/KpiDeltaCard-B2jraMlU.js","/assets/LangTextInput-BxHXd0kI.js","/assets/Layout-CdS_y5pI.js","/assets/LeaderAppeal-D1QWg8t5.js","/assets/LeaderDayReport-DKt0GElY.js","/assets/LeaderUnitReport-KpKJ-Qej.js","/assets/Leaderboard-yD1rOpz0.js","/assets/Leaders-BkbEqLXh.js","/assets/Lightbox-BsCxuZ6q.js","/assets/LiveOverview-CTZKuxkt.js","/assets/Login-CEgaZ4s5.js","/assets/NotFound-mSkTirlP.js","/assets/Notifications-C0LuhZvj.js","/assets/Overview-drDcGWIZ.js","/assets/Pagination-BwWqgZdL.js","/assets/PerenaladkaFactTable-CntA6_cJ.js","/assets/PersonCard-CvSQVhlg.js","/assets/PlanFulfillment-fXpk18Hy.js","/assets/Production-BfJsmdC4.js","/assets/Profile-BQShaAza.js","/assets/ProofCamera-rnXy9IU8.js","/assets/ProofPhoto-DgN_sswK.js","/assets/Quality-Dp2D_ag0.js","/assets/RawRows-De9Hi1Y1.js","/assets/RequestStateChip-Coj-av-F.js","/assets/RichTextEditor-B4E2fZ0C.js","/assets/SaveState-CC8AjsPB.js","/assets/SearchInput-q5MA4-LO.js","/assets/SeasonalityHeatmap-DHXQbFrv.js","/assets/SegmentedToggle-BuYPdgLC.js","/assets/SetupTimes-BRMo_25H.js","/assets/ShiftDaily-B5dU7vq1.js","/assets/Staff-D9waihPs.js","/assets/StaffLive-DYpGG2bp.js","/assets/StatusBadge-JcF9Z83m.js","/assets/TargetGoal-DASFi856.js","/assets/Targets-D-IweKDh.js","/assets/Tasks-BtZ7KTGR.js","/assets/TimeWheelPicker-D_AN0giH.js","/assets/Toast-BEreiCHv.js","/assets/Tooltip-BCy1Jd8e.js","/assets/TrendChart-Co5lng3c.js","/assets/TripleSpeedometer-88s8JUvm.js","/assets/Trudoyomkost-B6Wx1C2K.js","/assets/Turnover-DOiHq8TU.js","/assets/UploadDropzone-CASvw53B.js","/assets/UsersActivity-CyrkW2UK.js","/assets/VerdictBlock-CdDLoXV_.js","/assets/VfxApiMap-WaBzTM0T.js","/assets/VfxDictionaries-CoCPzNMO.js","/assets/VfxEmployees-BirqmCmr.js","/assets/VfxHrMoves-BbwQGa0_.js","/assets/VfxJobs-DOzEfkq3.js","/assets/VfxPhoto-Dg85YX4D.js","/assets/VfxShifts-DnI9vbqA.js","/assets/VfxState-BroNzfam.js","/assets/VfxTimebooks-Dx5Zn5Eu.js","/assets/VfxTimesheet-BzgR9yUN.js","/assets/WatchProgress-C1Q0ij--.js","/assets/WebLogin-hMzypkS_.js","/assets/WorkerConcerns-vKzyfCsY.js","/assets/Workers-BG8DGui4.js","/assets/Zagruzka-C3MUMjZ-.js","/assets/ZagruzkaCell-Cjjl1-VQ.js","/assets/api-V__U8-ad.js","/assets/archive-D1FCcOwx.js","/assets/archive-restore-By7L48ka.js","/assets/arrow-down-DXWaWszK.js","/assets/arrow-left-B556ivwJ.js","/assets/arrow-up-10AQGUBx.js","/assets/arrow-up-narrow-wide-BRBl0tzX.js","/assets/arrow-up-right-CzO-Bk_P.js","/assets/award-YFhWcvVo.js","/assets/ban-B3_1lRXq.js","/assets/book-open-Cf_87Y_K.js","/assets/boxes-CkvRV9AD.js","/assets/braces-BYZMz2bx.js","/assets/brigadirFilters-D-k9wHRa.js","/assets/broadcastTree-ClqgAJ00.js","/assets/building-2-Dd2liP4I.js","/assets/calculator-6F9dKhAM.js","/assets/calendar-C5ivapsI.js","/assets/calendar-days-BJXISmkU.js","/assets/camera-CyZcvzpx.js","/assets/categories-Cp_qOPnF.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Bg7eoK25.js","/assets/chart-line-B_1MLVN4.js","/assets/chart-pie-D6LWrced.js","/assets/chartRange-DKHU4MGQ.js","/assets/check-check-DFfJ-nO1.js","/assets/chevron-left-CCSwrKg6.js","/assets/chevrons-up-down-DoaBt1dn.js","/assets/circle-BNzwDOvI.js","/assets/circle-alert-BNNMb9Y7.js","/assets/circle-check-big-Driopl-f.js","/assets/circle-dashed-BOkGsJ10.js","/assets/circle-minus-Dmq7jBdC.js","/assets/circle-question-mark-D4UnHp2i.js","/assets/circle-slash-DDBBqLxM.js","/assets/circle-user-round-CZExIag8.js","/assets/clock-3-hUCI2xWu.js","/assets/cloud-off-Bygt_Y3U.js","/assets/cloud-upload-BEk0gEyB.js","/assets/compass-DuZmybSG.js","/assets/concernCategories-BLj46yuf.js","/assets/copy-BqMsZsDS.js","/assets/corner-down-right-Ji-sYa2D.js","/assets/createLucideIcon-l_aRsokf.js","/assets/es-C-KCgdhu.js","/assets/exportXlsx-uhLE668_.js","/assets/external-link-CiVcSMze.js","/assets/file-clock-CvvHqxE3.js","/assets/file-exclamation-point-BsiQGYLj.js","/assets/file-spreadsheet-C4UPRn1D.js","/assets/file-text-D88U2dgD.js","/assets/flag-CJ7kEbpL.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BXAmLAui.js","/assets/hash-B1rW7IlU.js","/assets/history-B7-0bPUA.js","/assets/hourglass-DBmahAJr.js","/assets/image-D3Vd2kIF.js","/assets/image-off-CdlEpMvU.js","/assets/inbox-DDdKCBWF.js","/assets/index-BE1G1Njh.js","/assets/index-CCQoDNa6.css","/assets/key-round-ByaRVBvt.js","/assets/keyboard-DLHj64s-.js","/assets/languages-DtW81W5e.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DF8ozcYc.js","/assets/lightbulb-CBxe-eyy.js","/assets/link-2-DtDYOxWW.js","/assets/link-2-off-Dw0wnRMZ.js","/assets/list-ordered-CMRZufBQ.js","/assets/list-tree-B-3oSz7P.js","/assets/lock-open-BG7xHOGD.js","/assets/log-in-CxUnJJm2.js","/assets/maximize-2-CJhcWW6r.js","/assets/message-square-C6za6Klx.js","/assets/minimize-2-Cmg9dJpr.js","/assets/package-check-CcJvh12I.js","/assets/paperclip-CGBFDxCq.js","/assets/pencil-B1mMnDfb.js","/assets/percent-CkjltJk-.js","/assets/pin-CqzFztg8.js","/assets/pin-off-D7UoA3J6.js","/assets/play-xuf1C-BL.js","/assets/plug-zap-zujSm9cg.js","/assets/presentation-DfKcVTTs.js","/assets/prop-types-Cyqr_mDx.js","/assets/radio-DAV7W_-0.js","/assets/react-apexcharts.esm-8gQvV0PQ.js","/assets/registers-C_rtN0XS.js","/assets/repeat-DbmhOwRV.js","/assets/rotate-ccw-DW1DOZQE.js","/assets/rotate-cw-Iyr6J14c.js","/assets/save-YRJVZsyV.js","/assets/scopeLinks-D994gFcp.js","/assets/scroll-text-c8RyN1p3.js","/assets/search-x-DjP295lF.js","/assets/segments-v2ZyFSvp.js","/assets/send-CMNVXO1X.js","/assets/settings-2-3ec-2g9T.js","/assets/shield-alert-BtwxtnYR.js","/assets/shield-check-CCx0wP_3.js","/assets/shield-question-mark-ClOFYCgo.js","/assets/shield-yfiX-cvK.js","/assets/siren-ew-h0fV3.js","/assets/snowflake-BsHutczX.js","/assets/split-e4H-nB35.js","/assets/square-Cn1Bw6LU.js","/assets/square-check-big-CR5Q3HrD.js","/assets/star-DRWC_cix.js","/assets/statusBands-C20m9WRh.js","/assets/store-BDy0RDmI.js","/assets/table-2-DbI9THdT.js","/assets/table-properties-C53wfJ58.js","/assets/tag-DSGTdbuh.js","/assets/timer-off-Dlfo_Kov.js","/assets/trending-down-DZER-Tnj.js","/assets/trending-up-BQ0CC413.js","/assets/undo-2-DVolrCsA.js","/assets/useChartTheme-CIGkcYPK.js","/assets/useElementWidth-BaOS2Xfg.js","/assets/useIsMobile-DqMcNgN6.js","/assets/useOpenParam--64Oy0T2.js","/assets/useStatusBands-DrUgG2g-.js","/assets/useUrlScope-Dc57ZWv5.js","/assets/user-CPAnVLC0.js","/assets/user-cog-Bu9cAPF7.js","/assets/users-Cu8w6LM5.js","/assets/vfx-BV3rUkMh.js","/assets/video-Ckd9bXEP.js","/assets/wallet-B6w7yymt.js","/assets/warehouse-DG-Ggq0T.js","/assets/x-CsPjFXas.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
