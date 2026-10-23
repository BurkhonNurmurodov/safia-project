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

const BUILD = "2026-10-23T16:11:43.695Z";
const PRECACHE = ["/","/assets/AdminPanel-CO8ofy8i.js","/assets/AnalysisBoard-DpU61bxR.js","/assets/Arc-CCnCAr-i.js","/assets/Assistant-BklDb0D3.js","/assets/BrigadirProfile-C982AIaZ.js","/assets/BroadcastReceivers-BTE5ldZI.js","/assets/BroadcastRecord-BiA2Cj7o.js","/assets/Button-D_c9LT2Q.js","/assets/CatLockNotice-BhXjEwkf.js","/assets/CategoryLegendModal-B3c8Ksqh.js","/assets/CellConcerns-CRqi-nmn.js","/assets/CellDetails-CaZ24_IV.js","/assets/CellFormModal-CxyWQMd1.js","/assets/CellIdent-DKdTO7Zt.js","/assets/CellLink-DdbPdY-G.js","/assets/Cells-BxzouJ3x.js","/assets/ColumnFilter-BCfFePnZ.js","/assets/ColumnsPicker-BoC54qBm.js","/assets/CommentsModal-CnN-BhrZ.js","/assets/ComparisonTable-DLeRFlvU.js","/assets/Concerns-DTd6PFF5.js","/assets/CountStepper-CF5vM4fm.js","/assets/Daily-Dy7q_R0d.js","/assets/DataTable-CGw1pD-0.js","/assets/DateRangePicker-Do4FMrL_.js","/assets/DayReportView-COL8reAa.js","/assets/DayStepper-B-KhnzCx.js","/assets/DayStrip-DhDdKFEH.js","/assets/DifferenceBreakdown-tGP5vc3R.js","/assets/Downtime-HQFL7_ws.js","/assets/Education-BZicy3lt.js","/assets/EducationLesson-Ce1oRXXt.js","/assets/EmptyState-pUU6qZ6X.js","/assets/Exam-Br72RlNo.js","/assets/FactorySelect-iuWPvoXl.js","/assets/Gamification-mKU9X4pa.js","/assets/GroupBadge-DXZQM09b.js","/assets/HeatmapChart-Bgqh96fJ.js","/assets/IdleCell-BT1fS6s5.js","/assets/KPICard-CBtLp--m.js","/assets/Kaizen-DLwztnDm.js","/assets/Kelish-BOF75vib.js","/assets/KpiDeltaCard-Dvz4uaeJ.js","/assets/LangTextInput-07XLuN8C.js","/assets/Layout-CFCIf56C.js","/assets/LeaderAppeal-DbgALJ45.js","/assets/LeaderDayReport-CpvyahI3.js","/assets/LeaderUnitReport-BpY-WPWe.js","/assets/Leaderboard-DI3GXqk0.js","/assets/Leaders-CzfIARxm.js","/assets/LeadersKpi-BI0rZW9e.js","/assets/Lightbox-B9cCRMW-.js","/assets/LiveOverview-to9FdZGr.js","/assets/Login-DWLkzLVy.js","/assets/NotFound-C3nXUDfJ.js","/assets/Notifications-Dur_mO6v.js","/assets/Ontime-BWD47HX8.js","/assets/Overview-8iuVhQHr.js","/assets/Pagination-DSCsAm-r.js","/assets/PerenaladkaFactTable-DcNNq6Wa.js","/assets/PersonCard-JdKMXmmA.js","/assets/PlanFulfillment-DWyAP1w2.js","/assets/Production-5QDtWVLs.js","/assets/Profile-BlyzH_mt.js","/assets/ProofCamera-CnLiurvr.js","/assets/ProofPhoto-B1smynAd.js","/assets/Quality-DJItDpG6.js","/assets/RawRows-60ofrY5O.js","/assets/RequestStateChip-C5dc_rX7.js","/assets/RichTextEditor-xntCJjB_.js","/assets/SaveState-BCkjc-wc.js","/assets/SearchInput-CB4g4SFZ.js","/assets/SeasonalityHeatmap-Dfv_0qkG.js","/assets/SegmentedToggle-D19UrFLZ.js","/assets/SetupTimes-Bx4Dv_k4.js","/assets/ShiftDaily-DmUF503a.js","/assets/Staff-D4hqVyMS.js","/assets/StaffListAtCheck-Bmx65JAJ.js","/assets/StatusBadge-3D1blgnx.js","/assets/StatusBandsModal-BqO5lmcw.js","/assets/TargetGoal-C6eaeeiM.js","/assets/Targets-BjmYXQx9.js","/assets/Tasks-vOR_jT5E.js","/assets/TimeWheelPicker-DPzhfhXP.js","/assets/Toast-BXTVKBnq.js","/assets/Tooltip-CI0T7VEp.js","/assets/TrendChart-zHU9r_7z.js","/assets/TripleSpeedometer-LrfrE_4w.js","/assets/Trudoyomkost-D2pCLumO.js","/assets/UploadDropzone-DWYdz87O.js","/assets/UsersActivity-C5ECej4m.js","/assets/VerdictBlock-B31xcmL8.js","/assets/VfxApiMap-Cf3oN_et.js","/assets/VfxDictionaries-Xfs88YZM.js","/assets/VfxEmployees-BfOtJ7-e.js","/assets/VfxHrMoves-D8ve0wDv.js","/assets/VfxJobs-Bfx8Haoi.js","/assets/VfxPhoto-BfQ6omoY.js","/assets/VfxShifts-DVnHTZpy.js","/assets/VfxState-MQYhMQxv.js","/assets/VfxTimebooks-DvnkAsxt.js","/assets/VfxTimesheet-DWYoBj2S.js","/assets/WatchProgress-bHCtTeIz.js","/assets/WebLogin-BgEyveDO.js","/assets/Workers-DaYjCiZ1.js","/assets/Zagruzka-CvWI-P7H.js","/assets/ZagruzkaCell-B-sAO03V.js","/assets/api-Baqg1HJy.js","/assets/archive-BAsGQmq6.js","/assets/archive-restore-DJa6OBDa.js","/assets/arrow-down-right-BIwLxoHA.js","/assets/arrow-down-uQwwnsY9.js","/assets/arrow-down-wide-narrow-BC11Efbu.js","/assets/arrow-up-narrow-wide-Bq-zb-Gh.js","/assets/ban-1cNLNDRe.js","/assets/boxes-BGwY2-RF.js","/assets/braces-CQfrgQRC.js","/assets/brigadirFilters-BePb9ZsL.js","/assets/broadcastTree-wKG9h5ge.js","/assets/building-2-CpT0arIw.js","/assets/calendar-BC7mbB_F.js","/assets/calendar-days-CbSxU2_6.js","/assets/camera-CXfJxCpT.js","/assets/categories-CC2Gr0Rk.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-oJRYIoku.js","/assets/chart-line-Cn04FnvE.js","/assets/chart-pie-DhbWXgg9.js","/assets/chartRange-BNZp2uEX.js","/assets/check-check-ICr4bp5l.js","/assets/chevron-left-BJH37YDr.js","/assets/chevrons-up-down-GEIbfLnm.js","/assets/circle-DWuaJR4w.js","/assets/circle-alert-DxBpYfQ_.js","/assets/circle-check-big-CFipbM2A.js","/assets/circle-dashed-y83tFcyl.js","/assets/circle-minus-jGrrGWZ3.js","/assets/circle-question-mark-dKat-pze.js","/assets/circle-slash-ZHcAgY1K.js","/assets/circle-user-round-D-QPzu9h.js","/assets/cloud-off-B3xAeFhW.js","/assets/cloud-upload-CTMMqTcn.js","/assets/compass-BQKhbwg0.js","/assets/concernCategories-BSK7neuU.js","/assets/corner-down-right-Ba-3w2xc.js","/assets/createLucideIcon-32WmrxId.js","/assets/es-Da72Gtsm.js","/assets/external-link-1Fujz2aZ.js","/assets/file-clock-BLSiHdsM.js","/assets/file-exclamation-point-CuVPtMnK.js","/assets/flag-Bxr4oOZd.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-0YP9Eegt.js","/assets/funnel-CcWmT_ue.js","/assets/hash-DebcFW8W.js","/assets/hourglass-P-jgJfdI.js","/assets/image-5es3t613.js","/assets/image-off-BYRwGfMu.js","/assets/inbox-egFWjm8y.js","/assets/index-CRuVlQUu.js","/assets/index-DFvJry-Q.css","/assets/keyboard-CLCdfb9k.js","/assets/languages-BnatsTuA.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B729gtSf.js","/assets/leaderBoard-qTc-o--c.js","/assets/lightbulb-CLZjkiqC.js","/assets/link-2-DJPYYa7g.js","/assets/link-2-off-BXWEKoP0.js","/assets/list-ordered-Dse4LNDX.js","/assets/list-tree-D9vMPckv.js","/assets/lock-open-B3ROfjjm.js","/assets/log-in-BnNNvq-Q.js","/assets/map-pin-CLctitIh.js","/assets/marks-DV_ZKLth.js","/assets/minimize-2-mpx5GA3G.js","/assets/package-check-D6BvoS83.js","/assets/pencil-5t8DtNjB.js","/assets/percent-R9b_DiE0.js","/assets/pin-CmLEfJtC.js","/assets/pin-off-D9oXR41y.js","/assets/play-Dc7p-8Af.js","/assets/plug-zap-CQstMdzG.js","/assets/prop-types-BkPxY9Qh.js","/assets/radio-ConYkV0m.js","/assets/react-apexcharts.esm-CsuRCbcz.js","/assets/registers-CHbIENLf.js","/assets/repeat-DXtLbZdK.js","/assets/save-IoNbR1hm.js","/assets/scopeLinks-INvR-sUw.js","/assets/scroll-text-Dwp1jCVV.js","/assets/search-x-CgSHg-fH.js","/assets/segments-D2wWz_1m.js","/assets/send-CjQpLSWH.js","/assets/settings-2-DYLk5jFp.js","/assets/shield-B-eOFZfm.js","/assets/shield-alert-WPVSMpqg.js","/assets/shield-question-mark-Dd7Ba_jF.js","/assets/sigma-BDVvyvfP.js","/assets/siren-C1WZkFBu.js","/assets/snowflake-BynbJjWY.js","/assets/split-D05SrWzQ.js","/assets/square-check-big-CHB2fBPw.js","/assets/star-BYF7SJ4_.js","/assets/statusBands-B-8twlFr.js","/assets/store-Vpl6XG8C.js","/assets/table-2-CzZ84gX_.js","/assets/table-properties-BQo-dGHm.js","/assets/tag-CEWWUu87.js","/assets/timer-off-DepkycTQ.js","/assets/trendBuckets-DHXXc03K.js","/assets/trending-down-sWnXqziU.js","/assets/trending-up-z1818rLE.js","/assets/undo-2-D7bMeO-4.js","/assets/useChartTheme-B3Fp9V52.js","/assets/useElementWidth-CVv7shGt.js","/assets/useIsMobile-DGjWnDyq.js","/assets/useOpenParam-BGMr3C8x.js","/assets/useStatusBands-DUQo9BTN.js","/assets/useUrlScope-wqhCBPdB.js","/assets/user-DcRrvo7M.js","/assets/user-cog-CRURhykk.js","/assets/user-minus-Ct93fG5B.js","/assets/users-BzHdhkKl.js","/assets/vfx-Bk4EZhsf.js","/assets/video-yYvZVc51.js","/assets/wallet-Ce12WvFb.js","/assets/warehouse-DFHZ9ifB.js","/assets/workflow-PD_sCZN4.js","/assets/x-CdPl2EKv.js","/assets/zap-B_78qSeY.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
