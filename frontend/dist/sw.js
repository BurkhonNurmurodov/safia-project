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

const BUILD = "2026-10-06T05:57:40.804Z";
const PRECACHE = ["/","/assets/AdminPanel-DTECQ0dZ.js","/assets/AnalysisBoard-DDSy_x1_.js","/assets/Arc-BzXAAwF5.js","/assets/Assistant-5513l294.js","/assets/BrigadirProfile-437I1oXC.js","/assets/BroadcastReceivers-DRpv7lw2.js","/assets/BroadcastRecord-VrHgHZyR.js","/assets/Button-jqTukJF0.js","/assets/CatLockNotice-BknrwIoc.js","/assets/CategoryLegendModal-BdQfMJw2.js","/assets/CellConcerns-COCq34IP.js","/assets/CellDetails-zly26Hcj.js","/assets/CellFormModal-DezkxWgs.js","/assets/CellIdent-K8V8SO4A.js","/assets/CellLink-Bdh6vIox.js","/assets/Cells-DmtevAln.js","/assets/ColumnFilter-D57k0ZGM.js","/assets/ColumnsPicker-Cq0-4Qhx.js","/assets/CommentsModal-B__zuMSZ.js","/assets/ComparisonTable-CCjc3ApB.js","/assets/Concerns-BoW9tjgL.js","/assets/Daily-rsPd_bXT.js","/assets/DataTable-Cfph2EfA.js","/assets/DateRangePicker-CthyuhgR.js","/assets/DayReportView-B9pyVT9Z.js","/assets/DayStepper-BRmaspX2.js","/assets/DifferenceBreakdown-BmIjwl18.js","/assets/Downtime-C_9r3lWr.js","/assets/Education-GNPUK8U7.js","/assets/EducationLesson-D1nBkfOR.js","/assets/EmptyState-B-dspP28.js","/assets/Exam-BhODe0Vg.js","/assets/FactorySelect-BJ3BoISm.js","/assets/Gamification-NfVvw1A_.js","/assets/GroupBadge-DXyjwYZn.js","/assets/HeatmapChart-DDioP-8b.js","/assets/IdleCell-D6HdbDWm.js","/assets/KPICard-DFRA1tIJ.js","/assets/Kaizen-CL5u1iCt.js","/assets/Kelish-vJZz2SAH.js","/assets/KpiDeltaCard-BoiojR7U.js","/assets/LangTextInput-BMV1boeS.js","/assets/Layout-r65Nd9N-.js","/assets/LeaderAppeal-DezDJC2o.js","/assets/LeaderDayReport-CW5lgCRN.js","/assets/LeaderUnitReport-Bp-cDmtQ.js","/assets/Leaderboard-B2DcWInL.js","/assets/Leaders-CKbtqrcA.js","/assets/Lightbox-CMBFLaES.js","/assets/LiveOverview-BW2d0lEq.js","/assets/Login-Pgx1tzmC.js","/assets/NotFound-C3yvcQVR.js","/assets/Notifications-D0F36pwQ.js","/assets/Overview-DSFqUBxy.js","/assets/Pagination-DriJmH3w.js","/assets/PerenaladkaFactTable-DLdW4jwm.js","/assets/PersonCard-BrspPMPY.js","/assets/PlanFulfillment-EDNkYnln.js","/assets/Production-rLfk1tCD.js","/assets/Profile-DKO03PGy.js","/assets/ProofCamera-CzynS2Yj.js","/assets/ProofPhoto-Nzu_CAzy.js","/assets/Quality-OVBUY7bb.js","/assets/RawRows-BPentR-m.js","/assets/RequestStateChip-Rye3z130.js","/assets/RichTextEditor-DkGVM9t4.js","/assets/SaveState-CBaXBDQF.js","/assets/SearchInput-ncqIASEG.js","/assets/SeasonalityHeatmap-BRq9qHXZ.js","/assets/SegmentedToggle-BkCELQA3.js","/assets/SetupTimes-DbfppsH-.js","/assets/ShiftDaily-JxdPcSAw.js","/assets/Staff-DMekeQJu.js","/assets/StaffLive-BvD564HG.js","/assets/StatusBadge-DC9QNNF0.js","/assets/TargetGoal-CURK8BcN.js","/assets/Targets-D4CDPSHS.js","/assets/Tasks-CdMGrlGj.js","/assets/TimeWheelPicker-fOPX6Jom.js","/assets/Toast-DlkUfuK4.js","/assets/Tooltip-Dga4M8sa.js","/assets/TrendChart-GJp61EZ_.js","/assets/TripleSpeedometer-BaqXSDM0.js","/assets/Trudoyomkost-DBRYtDfR.js","/assets/Turnover-C8Bp0S1L.js","/assets/UploadDropzone-L12zekyX.js","/assets/UsersActivity-DIl2ddr2.js","/assets/VerdictBlock-RuVJl3RC.js","/assets/VfxApiMap-CPROvjLn.js","/assets/VfxDictionaries-klKuVpOo.js","/assets/VfxEmployees-CHSMoNoW.js","/assets/VfxHrMoves-uJIcFj21.js","/assets/VfxJobs-C4ehDo5Q.js","/assets/VfxPhoto-BIKpv0NS.js","/assets/VfxShifts-ZGI1L3xU.js","/assets/VfxState-C45SnzxZ.js","/assets/VfxTimebooks-Dkizr_Qv.js","/assets/VfxTimesheet-BPZqcugu.js","/assets/WatchProgress-Detbiijm.js","/assets/WebLogin-wN68aocb.js","/assets/WorkerConcerns-DwSAhITy.js","/assets/Workers-B5RfiNBR.js","/assets/Zagruzka-DMzpMR3Z.js","/assets/ZagruzkaCell-DGi1SC7s.js","/assets/api-COScKvS-.js","/assets/archive-Dvy4NW6A.js","/assets/archive-restore-BedEX0cW.js","/assets/arrow-down-CjRq_8hu.js","/assets/arrow-up-narrow-wide-BBY8cVpi.js","/assets/award-nSZC1D7V.js","/assets/ban-BXPPG-k-.js","/assets/boxes-BHLNG21Z.js","/assets/braces-DK0M1y-m.js","/assets/brigadirFilters-BIscQOCb.js","/assets/broadcastTree-yIs6TaK0.js","/assets/building-2-uJOizlS1.js","/assets/calculator-BCsjxDkX.js","/assets/calendar-D9FgBHnQ.js","/assets/calendar-days-Drz3pa4d.js","/assets/camera-B8bDcrVi.js","/assets/categories-CnDPam60.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CqryTDww.js","/assets/chart-line-DoHz7SPO.js","/assets/chart-pie-CJ8wOy3J.js","/assets/chartRange-CIF4hcTL.js","/assets/check-check-BYhy5yYN.js","/assets/chevron-left-DgofICc4.js","/assets/chevrons-up-down-YBZ_8lIJ.js","/assets/circle-BqRCgAko.js","/assets/circle-alert-q2KqxYFR.js","/assets/circle-check-big-CIsFnWgO.js","/assets/circle-dashed-BFcWRh0X.js","/assets/circle-minus-DYfdge-R.js","/assets/circle-question-mark-DEIiEW1n.js","/assets/circle-slash-CGiY85aP.js","/assets/circle-user-round-DgNtoEqu.js","/assets/clock-3-B0dTw9kT.js","/assets/cloud-off-DUKztbRv.js","/assets/cloud-upload-DF5UfxiG.js","/assets/compass-B0MxTxYe.js","/assets/concernCategories-BZq25M2Y.js","/assets/copy-Da40Fpz4.js","/assets/corner-down-right-Dzdqb2RC.js","/assets/createLucideIcon-Cutznfci.js","/assets/es-CwvX7Kqx.js","/assets/external-link-QApbeWtM.js","/assets/file-clock-CqY3FG0_.js","/assets/file-exclamation-point-CdFeZ4wN.js","/assets/flag-CHdjCpHW.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CKSE_VaY.js","/assets/hash-B91MEDVw.js","/assets/hourglass-fRXCSnAS.js","/assets/image-CslVY3x0.js","/assets/image-off-CtI9L99-.js","/assets/inbox-Cr5ONmV1.js","/assets/index-BKM2gJ54.css","/assets/index-ZBNBOiUU.js","/assets/keyboard-COmHwMg8.js","/assets/languages-DW_g-gtQ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CVVbpG8x.js","/assets/lightbulb-GQ5BmiHL.js","/assets/link-2-BBHWw1jM.js","/assets/link-2-off-C2EOxD16.js","/assets/list-ordered-od4YugS-.js","/assets/list-tree-TgDBMG_h.js","/assets/lock-open-D_EUe0l-.js","/assets/log-in-CM_p9L18.js","/assets/minimize-2-CT82a3f3.js","/assets/package-check-C6Gv25-Z.js","/assets/pencil-CbeAKYbC.js","/assets/percent-DElVJSB0.js","/assets/pin-C1P9Fd0y.js","/assets/pin-off-ozbXqt2D.js","/assets/play-CpXt2OhX.js","/assets/plug-zap-DTcspsyX.js","/assets/prop-types-CkXZgGyT.js","/assets/react-apexcharts.esm-B13IjyrI.js","/assets/registers-C91Pj-Cu.js","/assets/repeat-C_5DU2ad.js","/assets/rotate-cw-BNZuBzrK.js","/assets/save-Dv3XcHBc.js","/assets/scopeLinks-BmyOrkOi.js","/assets/scroll-text-Ds1t4jM6.js","/assets/search-x-OPKXSzIf.js","/assets/segments-BzpkmL18.js","/assets/send-CS-w-RR4.js","/assets/settings-2-Do2E6Uyq.js","/assets/shield-Y_XLou0u.js","/assets/shield-alert-CQCwUesg.js","/assets/shield-question-mark-B3U98DdF.js","/assets/siren-CQHHFrrY.js","/assets/snowflake-EV9vosKV.js","/assets/split-BN6tV-m7.js","/assets/square-check-big-D7aWwMyX.js","/assets/star-CWCvetEp.js","/assets/statusBands-C1BCKsuo.js","/assets/store-CdtgKZiC.js","/assets/table-2-ZVwFav2k.js","/assets/table-properties-DGCgorQu.js","/assets/tag-Ct1OV16o.js","/assets/timer-off-C4tBwjFJ.js","/assets/trending-down-IdiUodIL.js","/assets/trending-up-BLv_HYZK.js","/assets/undo-2-BFElAv5O.js","/assets/useChartTheme-BFB9PYJY.js","/assets/useElementWidth-BNH4JmXP.js","/assets/useIsMobile-AOLLGpXj.js","/assets/useOpenParam-CFn6t7Ud.js","/assets/useStatusBands-DWqpo1i0.js","/assets/useUrlScope-Ck49owtL.js","/assets/user-BlKYoiEL.js","/assets/user-cog-A6px6dSI.js","/assets/users-BzX4uAZq.js","/assets/vfx-DQlPXsZR.js","/assets/video-izdOGz_1.js","/assets/wallet-BZy_YHhJ.js","/assets/warehouse-DyF5V8RH.js","/assets/x-CRAhJ471.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
