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

const BUILD = "2026-10-02T09:28:55.135Z";
const PRECACHE = ["/","/assets/AdminPanel-BJ6W47hJ.js","/assets/AnalysisBoard-CAZ640xH.js","/assets/Arc-B-aHlOQB.js","/assets/ArcLegacy-BwCiftWv.js","/assets/BrigadirProfile-DpoiC7x5.js","/assets/BroadcastReceivers-DyYDQwtw.js","/assets/BroadcastRecord-OlQxVIvR.js","/assets/CatLockNotice-DF91Y-ga.js","/assets/CategoryLegendModal-BwhMV8Xn.js","/assets/CellConcerns-BS39Gibo.js","/assets/CellDetails-CkAaePQi.js","/assets/CellFormModal-BM57HSUH.js","/assets/CellIdent-CLiP2Pxa.js","/assets/CellLink-BV62pxNK.js","/assets/Cells-Cm02UMzs.js","/assets/ColumnFilter-BmsB4Ahw.js","/assets/ColumnsPicker-D_WlhkXf.js","/assets/CommentsModal-CfVBEfp9.js","/assets/ComparisonTable-AEG95YUL.js","/assets/Concerns-gSNpvVGU.js","/assets/ConfirmDialog-sJ2gYDhM.js","/assets/Daily-CSahVw6s.js","/assets/DataTable-CcPETaHN.js","/assets/DateRangePicker-CbhPswgh.js","/assets/DayReportView-C3xbAgoX.js","/assets/DayStepper-DYxnUETw.js","/assets/DifferenceBreakdown-GIC5fpAR.js","/assets/Downtime-Cqt6Uv4Q.js","/assets/Education-B_L3fEYE.js","/assets/EducationLesson-qR15O2GY.js","/assets/EmptyState-9yHeR34D.js","/assets/Exam-Dq7uq1jM.js","/assets/FactorySelect-COS2IlMC.js","/assets/Gamification-BE9fHorh.js","/assets/GroupBadge-zbAQzDtl.js","/assets/HeatmapChart-DguldZXc.js","/assets/IdleCell-5Px6NaGJ.js","/assets/KPICard-C6tEzMkr.js","/assets/Kaizen-CLFYBrWG.js","/assets/Kelish-9nnIc4S5.js","/assets/KpiDeltaCard-D9A-hLsl.js","/assets/LangTextInput-pVM2nnqH.js","/assets/Layout-CMdKdE0u.js","/assets/LeaderAppeal-_rIBXa9S.js","/assets/LeaderDayReport-BZ0_S2nJ.js","/assets/LeaderUnitReport-Cs7HnsAv.js","/assets/Leaderboard-BVX414U0.js","/assets/Leaders-Cpe6Dwek.js","/assets/Lightbox-CbPXdk_6.js","/assets/LiveOverview-Ci1zr7kx.js","/assets/Login-D8dSsnMn.js","/assets/NotFound-Cp0x4yYf.js","/assets/Notifications-DzDfb78r.js","/assets/Overview-R6D86Qev.js","/assets/Pagination-CrWcmMAE.js","/assets/PerenaladkaFactTable-BREsQfqi.js","/assets/PlanFulfillment-DqtwwaMo.js","/assets/Production-B1hJg9sw.js","/assets/Profile-DwY00_Ei.js","/assets/ProofCamera-DE0mI1e5.js","/assets/ProofPhoto-Bq27zVK3.js","/assets/Quality-89lh98bD.js","/assets/RequestStateChip-PENq8Ya4.js","/assets/RichTextEditor-olbrTZBk.js","/assets/SaveState-BqVSBSFO.js","/assets/SearchInput-DYPUPpAb.js","/assets/SeasonalityHeatmap-D_Ess89f.js","/assets/SegmentedToggle-DfXXyAjJ.js","/assets/SetupTimes-CAha0QAI.js","/assets/ShiftDaily-C0sH0r1L.js","/assets/Staff-Bl0Qza4l.js","/assets/StaffLive-9dDlVTqG.js","/assets/StatusBadge-BVIyI91z.js","/assets/TargetGoal-D7u9VL1Q.js","/assets/Targets-DNBlzlzq.js","/assets/Tasks-5kOyswd5.js","/assets/TimeWheelPicker-Blp28yDm.js","/assets/Toast-2LZorF_K.js","/assets/Tooltip-wF6EdlTE.js","/assets/TrendChart-Cs7gA4m6.js","/assets/TripleSpeedometer-DiBgn7qT.js","/assets/Trudoyomkost-DfXi2R77.js","/assets/UploadDropzone-Czv3Ct1J.js","/assets/UsersActivity-CVzvxv92.js","/assets/VerdictBlock-lLUPHZkq.js","/assets/WatchProgress-yCDWIIsi.js","/assets/WebLogin-prOJ9VM-.js","/assets/WorkerConcerns-Bdurk7Mm.js","/assets/Workers-CGF6U4VU.js","/assets/Zagruzka-CsLzDyhI.js","/assets/ZagruzkaCell-Cd6VDQbX.js","/assets/api-DqOrem9z.js","/assets/archive-DIRVveMv.js","/assets/archive-restore-DhPA6JYa.js","/assets/arrow-down-CuztNwMK.js","/assets/arrow-left-D5yj3r5G.js","/assets/arrow-right-left-QvJv4pC-.js","/assets/arrow-up-dZydjVgN.js","/assets/arrow-up-narrow-wide-5ZYgWQJ_.js","/assets/arrow-up-right-CUwHCZ-E.js","/assets/award-DWwkJTll.js","/assets/ban-DsVnU0uZ.js","/assets/bot-B9O0nmXX.js","/assets/boxes-DLODgSw0.js","/assets/brigadirFilters-CJlVcvMX.js","/assets/broadcastTree-Ca-_cBPZ.js","/assets/building-2-DBght0V-.js","/assets/calendar-BSlLQWck.js","/assets/calendar-days-BAwfAaQU.js","/assets/calendar-range-CbboSyQL.js","/assets/camera-BoNtZ-sG.js","/assets/categories-DAQYRGLh.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-prLgvjJ9.js","/assets/chart-line-CET06j3T.js","/assets/chart-pie-D7UJ4Wkc.js","/assets/chartRange-DpWYUkhx.js","/assets/chevron-left-X6CHBtqr.js","/assets/chevrons-up-down-CBaAgHIO.js","/assets/circle-DU98pVJu.js","/assets/circle-alert-CGoYLI3t.js","/assets/circle-check-big-BbvQ0ZVP.js","/assets/circle-minus-CzuR4dgJ.js","/assets/circle-question-mark-Dw-EnzQ6.js","/assets/circle-slash-JsLuBvrX.js","/assets/circle-user-round-Cg8C4ECh.js","/assets/cloud-off-CEvTMQog.js","/assets/cloud-upload-B7YuPBMI.js","/assets/compass-BgW4BPHv.js","/assets/concernCategories-DNgqDRHo.js","/assets/copy-DBRW06zV.js","/assets/corner-down-right-CB5SDwZ1.js","/assets/createLucideIcon-DPXuBn9V.js","/assets/es-Cu12QHZO.js","/assets/exportXlsx-DPi8oisA.js","/assets/external-link-C_DsKGbt.js","/assets/file-clock-Ciz9rq3g.js","/assets/file-exclamation-point-BSBRycTs.js","/assets/file-spreadsheet-DNobcfqj.js","/assets/file-text-nsyYrWRE.js","/assets/flag-B3JTFqC2.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BkJTkVMa.js","/assets/hash-BOsI02ku.js","/assets/history-lsatxr04.js","/assets/hourglass-CVYmVwnd.js","/assets/id-card-CGQseoqx.js","/assets/image-CS6Rx-lU.js","/assets/image-off-DIq2or1f.js","/assets/inbox-nKxKWj3-.js","/assets/index-B42UZiDN.js","/assets/index-bv1wZ_fI.css","/assets/key-round-YVK9a9VN.js","/assets/keyboard-BoVa9EZ4.js","/assets/languages-DYRHR2a9.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BnfdbgdX.js","/assets/lightbulb-BxqFcu3z.js","/assets/link-2-BrWdLysf.js","/assets/link-2-off-DcaOW41z.js","/assets/list-ordered-DikuGT71.js","/assets/list-tree-4fZOBzz2.js","/assets/lock-open-CrkKWAwf.js","/assets/log-in-CVT9lvk2.js","/assets/maximize-2-DoOppO76.js","/assets/message-square-i7FR8WK5.js","/assets/minimize-2-B5_YYcgD.js","/assets/package-check-CJZbdSFy.js","/assets/paperclip-D3NHY6R0.js","/assets/pencil-O2vLCXys.js","/assets/percent-D8omMJ7-.js","/assets/pin-ifAnKeNY.js","/assets/pin-off-7S5Jk1pu.js","/assets/play-Cbq1fzAp.js","/assets/plug-zap-DNGMYZkE.js","/assets/presentation-Clk3IhTO.js","/assets/prop-types-C7r9TQwY.js","/assets/radio-xQenSVIK.js","/assets/react-apexcharts.esm-DW11B7yu.js","/assets/repeat-BTaU_2oK.js","/assets/rotate-ccw-KdkD4b3U.js","/assets/rotate-cw-DbuW503g.js","/assets/save-DcQhKGGS.js","/assets/scopeLinks-BdwQygJK.js","/assets/scroll-text-MwmJRdVT.js","/assets/search-x-BwXi7jtw.js","/assets/segments-CV74nVB5.js","/assets/send-_A1ClZiV.js","/assets/settings-2-AeSHjLTu.js","/assets/shield-CveFmF3i.js","/assets/shield-alert-CaXHDNsh.js","/assets/shield-check-BNdlPPKk.js","/assets/shield-question-mark-VTP78PaL.js","/assets/siren-BPfDOrQA.js","/assets/snowflake-DB8F4CQ5.js","/assets/split-DofOaPRF.js","/assets/square-Lo9dTgdr.js","/assets/square-check-big-CBW7NK5d.js","/assets/star-iRpgx4HH.js","/assets/statusBands-Gg5b-LC-.js","/assets/store-ZiJrhUDo.js","/assets/table-2-5qZpaqzq.js","/assets/table-properties-Legte-2d.js","/assets/tag-BZUCvdK0.js","/assets/timer-off-BJNy3QBw.js","/assets/trending-down-hzpy67lx.js","/assets/trending-up-B35q3ZOW.js","/assets/undo-2-CghCSj-_.js","/assets/useChartTheme-CkxVsW_X.js","/assets/useElementWidth-DYPJSSzE.js","/assets/useIsMobile-CV8ZQr61.js","/assets/useOpenParam-DJkdL1Lw.js","/assets/useStatusBands-E8ZC96wZ.js","/assets/useUrlScope-7AWeXVzT.js","/assets/user-cog-BhZ-zhWQ.js","/assets/user-minus-C6WGAgzd.js","/assets/user-uw0tYroC.js","/assets/users-0u7NVLjI.js","/assets/video-DcQ6tjte.js","/assets/wallet-DtoR543J.js","/assets/warehouse-C4cYkw6t.js","/assets/x-Bky_TlJ2.js","/assets/zap-CHDyuGkL.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
