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

const BUILD = "2026-10-04T09:27:22.636Z";
const PRECACHE = ["/","/assets/AdminPanel-C8jF84W7.js","/assets/AnalysisBoard-zFBla4Ok.js","/assets/Arc-9JYFUah3.js","/assets/ArcLegacy-Ddc6uGc1.js","/assets/BrigadirProfile-CF-Co5dE.js","/assets/BroadcastReceivers-DkzEVNWY.js","/assets/BroadcastRecord-9qdMZm55.js","/assets/CatLockNotice-DSYJNDh-.js","/assets/CategoryLegendModal-D_LxJJDF.js","/assets/CellConcerns-cjb4rp0i.js","/assets/CellDetails-SXW3sW5p.js","/assets/CellFormModal-bt5ESenY.js","/assets/CellIdent-B83dyW5_.js","/assets/CellLink-Bi_Vc_oP.js","/assets/Cells-DA12omxn.js","/assets/ColumnFilter-C_sNecaQ.js","/assets/ColumnsPicker-B-FX6QPb.js","/assets/CommentsModal-BK_XpUkE.js","/assets/ComparisonTable-BQEt3NNM.js","/assets/Concerns-D9-mNKqe.js","/assets/ConfirmDialog-njUQGh0L.js","/assets/Daily-CBIYTntc.js","/assets/DataTable-s5JeSXye.js","/assets/DateRangePicker-DVf_Oh3C.js","/assets/DayReportView-CGn8VOJW.js","/assets/DayStepper-C4J2KrHd.js","/assets/DifferenceBreakdown-D8ivyOAq.js","/assets/Downtime-Bee4jq49.js","/assets/Education-_K77jmsI.js","/assets/EducationLesson-NjmXe2IG.js","/assets/EmptyState-BRbhO4qu.js","/assets/Exam-D319EhjK.js","/assets/FactorySelect-EGvS_Ey7.js","/assets/Gamification-euUqvHpi.js","/assets/GroupBadge-CkzfZw5g.js","/assets/HeatmapChart-1bl2ji-J.js","/assets/IdleCell-CYOsmnED.js","/assets/KPICard-CFUszYr8.js","/assets/Kaizen-artlYyMq.js","/assets/Kelish-yWwsgdfS.js","/assets/KpiDeltaCard-DZ8geG09.js","/assets/LangTextInput-Co_HI3L5.js","/assets/Layout-BOy6PZ9q.js","/assets/LeaderAppeal-CnVsh9pu.js","/assets/LeaderDayReport-D3IMUkWK.js","/assets/LeaderUnitReport-BcvmHD9M.js","/assets/Leaderboard-B8ZYJ_Xq.js","/assets/Leaders-BufG7WqK.js","/assets/Lightbox-2SmCUGTV.js","/assets/LiveOverview-D8Z3zr2B.js","/assets/Login-Dz-FLGHS.js","/assets/NotFound-BxezweDe.js","/assets/Notifications-zED2nLLV.js","/assets/Overview-OGiSg_HA.js","/assets/Pagination-DtLofRw-.js","/assets/PerenaladkaFactTable-zQA952cD.js","/assets/PersonCard-DnpSUMg0.js","/assets/PlanFulfillment-DnpdTVuj.js","/assets/Production-7nXeJXcR.js","/assets/Profile-ih4XXEb_.js","/assets/ProofCamera-XQRDx4DZ.js","/assets/ProofPhoto-DFYIJ0vI.js","/assets/Quality-CVlNJ02u.js","/assets/RawRows-yBeSlhyy.js","/assets/RequestStateChip-AgTStKTA.js","/assets/RichTextEditor-Bx3TvraK.js","/assets/SaveState-CJY4bw_a.js","/assets/SearchInput-BKsp7Tn4.js","/assets/SeasonalityHeatmap-D0CRV34x.js","/assets/SegmentedToggle-BqpnHtMn.js","/assets/SetupTimes-Cg2p2TaX.js","/assets/ShiftDaily-GDKxHFNd.js","/assets/Staff-c5_iWlBU.js","/assets/StaffLive-S_VJvFer.js","/assets/StatusBadge-BV5Ngbwf.js","/assets/TargetGoal-BAcYro-W.js","/assets/Targets-QpPYYTKj.js","/assets/Tasks-Cz_OF2L0.js","/assets/TimeWheelPicker-DnuCTjTW.js","/assets/Toast-D6tjElKR.js","/assets/Tooltip-C3Zwqdld.js","/assets/TrendChart-ciw8WYNb.js","/assets/TripleSpeedometer-Ey8LOdbD.js","/assets/Trudoyomkost-B-9pk0jI.js","/assets/UploadDropzone-UauAaxvn.js","/assets/UsersActivity-DeRsev_1.js","/assets/VerdictBlock-k62C_ui5.js","/assets/VfxAbsences-DZ8ttpKw.js","/assets/VfxApiMap-CeypMI83.js","/assets/VfxDevices-B9aG3ns1.js","/assets/VfxDictionaries-LnXl0KCp.js","/assets/VfxEmployees-VG-zDEQL.js","/assets/VfxHrMoves-BqI0B_kR.js","/assets/VfxIncidents-Br3Ygdbd.js","/assets/VfxJobs-BYYD2GcD.js","/assets/VfxMarks-BFNpKKqQ.js","/assets/VfxOnSite-BKEzsb0m.js","/assets/VfxPhoto-Ciei2V1t.js","/assets/VfxRequests-DbYYB-YV.js","/assets/VfxShifts-B9RhWM28.js","/assets/VfxState-CBMjzGe_.js","/assets/VfxStructure-DX-hZm8f.js","/assets/VfxTable-BRynKUJN.js","/assets/VfxTimebooks-D__Tkrq4.js","/assets/VfxTimesheet-CcgOARnd.js","/assets/WatchProgress-CT_UXEmw.js","/assets/WebLogin-JxOP9iu1.js","/assets/WorkerConcerns-Dre5bBH8.js","/assets/Workers-BLaLmzsE.js","/assets/Zagruzka-CdIjg4QL.js","/assets/ZagruzkaCell-D04lX8f4.js","/assets/api-CdCHfD9s.js","/assets/archive-CCIBSZsx.js","/assets/archive-restore-45pEEOiG.js","/assets/arrow-down-Ds0LD3Dw.js","/assets/arrow-left-DOuOyrWV.js","/assets/arrow-up-DlytJe_Z.js","/assets/arrow-up-narrow-wide-DyD4r7_h.js","/assets/arrow-up-right-BboBjUai.js","/assets/award-CwBHZuWG.js","/assets/ban-BTvmabw3.js","/assets/bot-DbTz3bva.js","/assets/boxes-9eWNqIGS.js","/assets/braces-CqM_J88q.js","/assets/brigadirFilters-Cu2jcvZT.js","/assets/broadcastTree-kM-_rtiy.js","/assets/building-2-DQSxRqd1.js","/assets/calendar-CoqQkthz.js","/assets/calendar-days-hHZVCzRr.js","/assets/camera-C0Kq2Oan.js","/assets/categories-BG6ocg1X.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CeZ5jcgZ.js","/assets/chart-line-By0iwguN.js","/assets/chart-pie-CIBBKoqy.js","/assets/chartRange-daezDCXi.js","/assets/check-check-B3kRmJxU.js","/assets/chevron-left-ChVxvaIm.js","/assets/chevrons-up-down-Bvwm0R9m.js","/assets/circle-Bc9tJsDa.js","/assets/circle-alert-8RyXuM9_.js","/assets/circle-check-big-086fdeZb.js","/assets/circle-dashed-BMh-kS3s.js","/assets/circle-minus-DqQwKSO3.js","/assets/circle-question-mark-B_Yrx6zX.js","/assets/circle-slash-Bifx5pjH.js","/assets/circle-user-round-BZNYS8B9.js","/assets/clock-3-Esh2xqJm.js","/assets/cloud-off-CYVJJtU6.js","/assets/cloud-upload-pcQeP-FK.js","/assets/compass-ByOob0VO.js","/assets/concernCategories--4n1yBJF.js","/assets/copy-KpUQipyR.js","/assets/corner-down-right-B3Q5dyJd.js","/assets/createLucideIcon-C4dWYPU5.js","/assets/door-open-Dmattcll.js","/assets/es-CQy9jeol.js","/assets/exportXlsx-DoMN5M_F.js","/assets/external-link-CYm7qa0k.js","/assets/file-clock-CiSz_5pw.js","/assets/file-exclamation-point-Bajlqy0-.js","/assets/file-spreadsheet-D_3MTYJG.js","/assets/file-text-3b0DJYxB.js","/assets/flag-uGIwiHb_.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BV8hJ8jo.js","/assets/hash-eyFxbZLO.js","/assets/history-DHxpoR67.js","/assets/hourglass-DB0hY0xJ.js","/assets/image-DYx18lQM.js","/assets/image-off-BkemCt7Q.js","/assets/index-B7RbwW6q.css","/assets/index-CHnGQpdY.js","/assets/key-round-Cl-C5ZH-.js","/assets/keyboard-DfcxXD-J.js","/assets/languages-DolEdy7u.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BVOhsPYB.js","/assets/lightbulb-C_YOqpV8.js","/assets/link-2-CTNWMHTj.js","/assets/link-2-off-DYxI3O8A.js","/assets/list-filter-CcpdIXDD.js","/assets/list-ordered-DMo9avDK.js","/assets/list-tree-D5jhKVcJ.js","/assets/lock-open-vtC93hr0.js","/assets/log-in-BNrA_u40.js","/assets/maximize-2-Dn-AyzJP.js","/assets/message-square-DCK3qoMu.js","/assets/minimize-2-vkg2vjGM.js","/assets/package-check-C4o7Hrst.js","/assets/paperclip-BUMpKQnK.js","/assets/pencil-DUoxHMLw.js","/assets/percent-C8XXdcbo.js","/assets/phone-hHC2bM_I.js","/assets/pin-DcgYzm7x.js","/assets/pin-off-DsmyfO5s.js","/assets/play-DEVdf-xK.js","/assets/plug-zap-BZ6-1RcB.js","/assets/presentation-DL_C_sOX.js","/assets/prop-types-Dt2CmdBg.js","/assets/radio-B5dp0_LX.js","/assets/react-apexcharts.esm-juZixGIX.js","/assets/registers-BCw8G9q5.js","/assets/repeat-8Zyiffea.js","/assets/rotate-ccw-OQ35UG7e.js","/assets/rotate-cw-CxuLKd67.js","/assets/save-BPq21csZ.js","/assets/scopeLinks-ZchVDw8c.js","/assets/scroll-text-DzNl2upc.js","/assets/search-x-BjLQhY4w.js","/assets/segments-CRB51NAe.js","/assets/send-kfwIn743.js","/assets/settings-2-DXQdtc5T.js","/assets/shield-By5DwO6e.js","/assets/shield-alert-JxtiyfXY.js","/assets/shield-check-D1wSs9r9.js","/assets/shield-question-mark-DiPor4cD.js","/assets/snowflake-NP0SfwwD.js","/assets/split-DXPStzSU.js","/assets/square-DYzYoano.js","/assets/square-check-big-DotjO3e7.js","/assets/star-Fzv-k8sn.js","/assets/statusBands-Dz3QHAwd.js","/assets/store-Czy-GWBY.js","/assets/table-2-CS0GFC0F.js","/assets/table-properties-3xGYLws1.js","/assets/tag-C3GcwAGN.js","/assets/tags-QhLiM7jm.js","/assets/timer-off-D97zxTZf.js","/assets/trending-down-ClG0MGk6.js","/assets/trending-up-CuzSGQsZ.js","/assets/undo-2-pXh_Boc-.js","/assets/useChartTheme-DIZ9oQ_Q.js","/assets/useElementWidth-CrOrlNxO.js","/assets/useIsMobile-DcpLSz8O.js","/assets/useOpenParam-jSlT8ANz.js","/assets/useStatusBands-BnarIF0b.js","/assets/useUrlScope-fPRXCa8g.js","/assets/user-DDnS-DQu.js","/assets/user-cog-BpViJ6b3.js","/assets/user-minus-wP--bBDb.js","/assets/users-KFw_FwHE.js","/assets/video-DGgS8wDL.js","/assets/wallet-DUoEBa_6.js","/assets/warehouse-EQqtHjRY.js","/assets/x-DuENoTXH.js","/assets/zap-BjO0BZFS.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
