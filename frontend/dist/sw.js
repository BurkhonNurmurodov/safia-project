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

const BUILD = "2026-10-04T14:14:01.999Z";
const PRECACHE = ["/","/assets/AdminPanel-B1QCXst0.js","/assets/AnalysisBoard-u8vc2iiG.js","/assets/Arc-BTFyNmGv.js","/assets/ArcLegacy-DfxmRpAr.js","/assets/BrigadirProfile-CRIjz_Uw.js","/assets/BroadcastReceivers-yIGeZvW2.js","/assets/BroadcastRecord-C_1RzwOl.js","/assets/CatLockNotice-2Z0D1CdC.js","/assets/CategoryLegendModal-BRTjMRoC.js","/assets/CellConcerns-lyn7V9iz.js","/assets/CellDetails-DPzEbmq1.js","/assets/CellFormModal-C4SL9Xqg.js","/assets/CellIdent-CT8UrBmg.js","/assets/CellLink-DZFAY1Sz.js","/assets/Cells-Dxbo9bzh.js","/assets/ColumnFilter-B-HLOnPG.js","/assets/ColumnsPicker-CF1wKjxy.js","/assets/CommentsModal-DpMWNYJC.js","/assets/ComparisonTable-BRuwe-kX.js","/assets/Concerns-BCBtJOP4.js","/assets/ConfirmDialog-Dma4xEmj.js","/assets/Daily-DLrz2MQ7.js","/assets/DataTable-Dlk6uerO.js","/assets/DateRangePicker-DjVmXP1d.js","/assets/DayReportView-DTtEuVCI.js","/assets/DayStepper-BF-sA5Gh.js","/assets/DifferenceBreakdown-BR8B9pM9.js","/assets/Downtime-DRDrjxs2.js","/assets/Education-CKIIisVl.js","/assets/EducationLesson-BW8ocoh2.js","/assets/EmptyState-tsY9hXR2.js","/assets/Exam-CjqpcYL6.js","/assets/FactorySelect-VDLpmSox.js","/assets/Gamification-Ceu5gi23.js","/assets/GroupBadge-CG3QT3ab.js","/assets/HeatmapChart-CSvRTPRo.js","/assets/IdleCell-CaDpMyY7.js","/assets/KPICard-D_lGmuY2.js","/assets/Kaizen-4V5-2H5o.js","/assets/Kelish-BAhVTDiJ.js","/assets/KpiDeltaCard-DssN0AhK.js","/assets/LangTextInput-COZgKlij.js","/assets/Layout-BY2QMzEV.js","/assets/LeaderAppeal-CXWSlZsw.js","/assets/LeaderDayReport-TqULBKKY.js","/assets/LeaderUnitReport-BzhokbA7.js","/assets/Leaderboard-D3wmpJe2.js","/assets/Leaders-0VOgYNJ_.js","/assets/Lightbox-Cp-UrWzC.js","/assets/LiveOverview-DV0ZxWal.js","/assets/Login-DNk-YEy7.js","/assets/NotFound-DhfOaufG.js","/assets/Notifications-D3D1QNoE.js","/assets/Overview-BhCz3gMz.js","/assets/Pagination-DtKRWmJ4.js","/assets/PerenaladkaFactTable-BXNO_v0y.js","/assets/PersonCard-8IL5Sur8.js","/assets/PlanFulfillment-Cxgwt3bF.js","/assets/Production-BK85bEsw.js","/assets/Profile-BmscfgHR.js","/assets/ProofCamera-CuUKuPge.js","/assets/ProofPhoto-C1raBtjS.js","/assets/Quality-CkmtoFqB.js","/assets/RawRows-D3AZ3T8s.js","/assets/RequestStateChip-DpteSfVl.js","/assets/RichTextEditor-C6ErUfkn.js","/assets/SaveState-B-g9CIff.js","/assets/SearchInput-d705X0ZD.js","/assets/SeasonalityHeatmap-BAE3PbgG.js","/assets/SegmentedToggle-BMJeJanB.js","/assets/SetupTimes-DRMBdkb1.js","/assets/ShiftDaily-HxOtmi4F.js","/assets/Staff-DYSyKVAd.js","/assets/StaffLive-Cek25lov.js","/assets/StatusBadge-DXk2tyKD.js","/assets/TargetGoal-DyxCkUxj.js","/assets/Targets-D5cM6OCc.js","/assets/Tasks-maapvJNf.js","/assets/TimeWheelPicker-__Bfh6gU.js","/assets/Toast-Cdet9Peo.js","/assets/Tooltip-DpQqPlg3.js","/assets/TrendChart-B-DuZHbS.js","/assets/TripleSpeedometer-IMlRSMSF.js","/assets/Trudoyomkost--MpPsLIy.js","/assets/UploadDropzone-BZpVsoVn.js","/assets/UsersActivity-A6GjDaZy.js","/assets/VerdictBlock-B1y_cyfg.js","/assets/VfxApiMap-CVDOibI6.js","/assets/VfxDictionaries-BKqm9iMV.js","/assets/VfxEmployees-y1rYGFcS.js","/assets/VfxHrMoves-Dj2-8KAW.js","/assets/VfxJobs-C4QjF8t3.js","/assets/VfxPhoto-BIPKmbLr.js","/assets/VfxShifts-DSxzi6Hx.js","/assets/VfxState-lhzdmSU1.js","/assets/VfxTimebooks-D9sCEDvn.js","/assets/VfxTimesheet-Du-4vXok.js","/assets/WatchProgress-BEUE0NFs.js","/assets/WebLogin-D4euPzEI.js","/assets/WorkerConcerns-BtXDwUCF.js","/assets/Workers--E97Lw9M.js","/assets/Zagruzka-DCOYsaMQ.js","/assets/ZagruzkaCell-D0CJcgoz.js","/assets/api-BN7RF1oI.js","/assets/archive-ahnZ18oT.js","/assets/archive-restore-DgqrJPnW.js","/assets/arrow-down-zE6LY0C9.js","/assets/arrow-left-B1Ju7ml9.js","/assets/arrow-up-DPpDLYpt.js","/assets/arrow-up-narrow-wide-BjoOR-Ko.js","/assets/arrow-up-right-OuY5_V87.js","/assets/award-BISfh-CC.js","/assets/ban-D7C8Zf2I.js","/assets/bot-DARcE5gm.js","/assets/boxes-DA_SmNKB.js","/assets/braces-BOTI0CLN.js","/assets/brigadirFilters-fYBFp_uq.js","/assets/broadcastTree-DGSIEwn4.js","/assets/building-2-DY86KiFJ.js","/assets/calendar-CQXpACvh.js","/assets/calendar-days-BRyZv-CJ.js","/assets/camera-CTpSq1um.js","/assets/categories-C5-eRA-d.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C8CRwANU.js","/assets/chart-line-CQxOFDdA.js","/assets/chart-pie-oybVosRi.js","/assets/chartRange-BefebPxS.js","/assets/check-check-CmCim4jo.js","/assets/chevron-left-BG5rcMhj.js","/assets/chevrons-up-down-DK5f3G-h.js","/assets/circle-BtI9Hcuf.js","/assets/circle-alert-BMKp3emj.js","/assets/circle-check-big-CPAqGZJP.js","/assets/circle-dashed-CDiGUHHN.js","/assets/circle-minus-CWCOkZB8.js","/assets/circle-question-mark-C72WxqwQ.js","/assets/circle-slash-BDOJ8wqY.js","/assets/circle-user-round-CVkjbYhN.js","/assets/clock-3-BYurnvRq.js","/assets/cloud-off-DxpM4-5p.js","/assets/cloud-upload-CioK_nsA.js","/assets/compass-BKDRHRBh.js","/assets/concernCategories-D8dw4vWP.js","/assets/copy-DShGxwF9.js","/assets/corner-down-right-D1j3nykP.js","/assets/createLucideIcon-BJsooKP6.js","/assets/es-Co17vKY3.js","/assets/exportXlsx-DbuSdv3G.js","/assets/external-link-Dd25_q5H.js","/assets/file-clock-B5D1EceG.js","/assets/file-exclamation-point-DivAw2ad.js","/assets/file-spreadsheet-C4oNEfSw.js","/assets/file-text-BfbsZkjq.js","/assets/flag-C3npDAh4.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-bNre6jeL.js","/assets/hash-BMZIT_P0.js","/assets/history-BWsWWOLJ.js","/assets/hourglass-DiY3VXaH.js","/assets/image-off-8KTB1ZpP.js","/assets/image-tHmRNqlB.js","/assets/inbox-BFXANvMs.js","/assets/index-BAMuejGt.js","/assets/index-DzDT26XC.css","/assets/key-round-CON5nuB6.js","/assets/keyboard-DT8YZAUH.js","/assets/languages-CqtLjLXZ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Ifo2QXFp.js","/assets/lightbulb-Bnt8cdqc.js","/assets/link-2-Dc4AbsGs.js","/assets/link-2-off-hhUWbsfH.js","/assets/list-ordered-CcHGTjuU.js","/assets/list-tree-W-7k-fCM.js","/assets/lock-open-B-AP3nn5.js","/assets/log-in-Cq8xMKAB.js","/assets/maximize-2-Ck20Fmvk.js","/assets/message-square-Cao6O0EM.js","/assets/minimize-2-DNpw8XcO.js","/assets/package-check-yXhPZTZs.js","/assets/paperclip-BIB4N0Z0.js","/assets/pencil-6pTShoyT.js","/assets/percent-COGQbUZf.js","/assets/pin-COJNvj23.js","/assets/pin-off-CVhc59Ef.js","/assets/play-BVGJBQMt.js","/assets/plug-zap-CiGrkk-9.js","/assets/presentation-B1XxCnkC.js","/assets/prop-types-D_RiXZND.js","/assets/radio-C64QKZEv.js","/assets/react-apexcharts.esm-D7L5Laoo.js","/assets/registers-DaEUZQdZ.js","/assets/repeat-CT_CdMHX.js","/assets/rotate-ccw-BdmJMFvA.js","/assets/rotate-cw-34cG34Kz.js","/assets/save-1VCG02zB.js","/assets/scopeLinks-DNgi8vzG.js","/assets/scroll-text-C1ApJqCB.js","/assets/search-x-HT7PyAXR.js","/assets/segments-BaJvUUTI.js","/assets/send-DaZM7Hwi.js","/assets/settings-2-ZanDwvXv.js","/assets/shield-D3_HgF-y.js","/assets/shield-alert-B7ShREbU.js","/assets/shield-check-TjHsuss_.js","/assets/shield-question-mark-CHDQKqZh.js","/assets/siren-BrR2YXjl.js","/assets/snowflake-Dvjw78L5.js","/assets/split-evAcTNwF.js","/assets/square-Z6DnH4Kr.js","/assets/square-check-big-AOyMxoqD.js","/assets/star-CqeemJ1N.js","/assets/statusBands-DrHlJhDe.js","/assets/store-DLxKMZQV.js","/assets/table-2-0-Gs8KmX.js","/assets/table-properties-Bl6uGAWp.js","/assets/tag-DZJgHoZ8.js","/assets/timer-off-DywTgVzx.js","/assets/trending-down-DOllNxHd.js","/assets/trending-up-V0SBp9rJ.js","/assets/undo-2-Dra_R6xj.js","/assets/useChartTheme-BUJTxHna.js","/assets/useElementWidth-DJcAC5yw.js","/assets/useIsMobile-Dm_wDJ0J.js","/assets/useOpenParam-Cz3GBucf.js","/assets/useStatusBands-Ba4NZZLr.js","/assets/useUrlScope-DVLhkraa.js","/assets/user-BLjvufBi.js","/assets/user-cog-BFfE6YMs.js","/assets/user-minus-DBHUJuRI.js","/assets/users-X6uZMWTh.js","/assets/vfx-BcOP8gCD.js","/assets/video-DMqtH6yo.js","/assets/wallet-DR3kDXE8.js","/assets/warehouse-DEb7IuzU.js","/assets/x-DGMlHcaN.js","/assets/zap-CkL7ebKf.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
