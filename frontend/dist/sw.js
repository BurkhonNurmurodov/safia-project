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

const BUILD = "2026-10-04T17:26:39.426Z";
const PRECACHE = ["/","/assets/AdminPanel-QeN0kz2N.js","/assets/AnalysisBoard-RB3Z7Hwc.js","/assets/Arc-CzKZo97h.js","/assets/ArcLegacy-D3L605iL.js","/assets/BrigadirProfile-WvKLkvMn.js","/assets/BroadcastReceivers-BCD1p9vj.js","/assets/BroadcastRecord-CFpKS_2J.js","/assets/CatLockNotice-BHu3fNAx.js","/assets/CategoryLegendModal-DRAoqWlz.js","/assets/CellConcerns-BEaGuHhf.js","/assets/CellDetails-ma2DDhz_.js","/assets/CellFormModal-Bjz91oL7.js","/assets/CellIdent-DkGQ6ZCj.js","/assets/CellLink-BXyj98E9.js","/assets/Cells-DhjME8rh.js","/assets/ColumnFilter-DEquFhzX.js","/assets/ColumnsPicker-CgvTTuBq.js","/assets/CommentsModal-CAhySR_Q.js","/assets/ComparisonTable-B_iKjU14.js","/assets/Concerns-D5wqtKzG.js","/assets/ConfirmDialog-UiLYQAL5.js","/assets/Daily-Cbm86M3b.js","/assets/DataTable-CwDfVY9V.js","/assets/DateRangePicker-BE3V9zsI.js","/assets/DayReportView-1uiO8iBT.js","/assets/DayStepper-DCuGf5MO.js","/assets/DifferenceBreakdown-DP3zS1R9.js","/assets/Downtime-Cnkr4mif.js","/assets/Education-Bi3_4V1R.js","/assets/EducationLesson-B1ZrcvL_.js","/assets/EmptyState-Bf9PXBKU.js","/assets/Exam-B7d9BoGl.js","/assets/FactorySelect-D4TXxX4o.js","/assets/Gamification-Btkg8pz4.js","/assets/GroupBadge-CBVuHJKh.js","/assets/HeatmapChart-DSNTMHJn.js","/assets/IdleCell-CYnSXb_9.js","/assets/KPICard-DI3o70CF.js","/assets/Kaizen-CHcDnRBi.js","/assets/Kelish-DDT6nrNG.js","/assets/KpiDeltaCard-HJpOFfVS.js","/assets/LangTextInput-CFQUGxQL.js","/assets/Layout-DTtYU8D6.js","/assets/LeaderAppeal-yxN9WVmz.js","/assets/LeaderDayReport-BEkYwLxz.js","/assets/LeaderUnitReport-UPHtBxl7.js","/assets/Leaderboard-CpxIOq3C.js","/assets/Leaders-DKjrGvoR.js","/assets/Lightbox-DylQ-k3V.js","/assets/LiveOverview-Ebni8wl5.js","/assets/Login-E4kslCAq.js","/assets/NotFound-CzjynrxZ.js","/assets/Notifications-B-XIjbgY.js","/assets/Overview-BWxsDVWI.js","/assets/Pagination-B1SKSGdK.js","/assets/PerenaladkaFactTable-BvBMKgSG.js","/assets/PersonCard-Sm7tJ3f9.js","/assets/PlanFulfillment-yTRcIgMw.js","/assets/Production-CnHuqN9e.js","/assets/Profile-BzqWYqvD.js","/assets/ProofCamera-BnxG3rDk.js","/assets/ProofPhoto-BIV-pzBr.js","/assets/Quality-25DL9QxY.js","/assets/RawRows-Crc58iCP.js","/assets/RequestStateChip-DR5yH-aW.js","/assets/RichTextEditor-DbcKlHRp.js","/assets/SaveState-FOKxDPjl.js","/assets/SearchInput-BtJejCjz.js","/assets/SeasonalityHeatmap-6UsJg4cO.js","/assets/SegmentedToggle-D_9q1f2s.js","/assets/SetupTimes-DEhko4sf.js","/assets/ShiftDaily-EVG_qd7z.js","/assets/Staff-B8vmgZIM.js","/assets/StaffLive-CXSfmDcT.js","/assets/StatusBadge-27Fuimpt.js","/assets/TargetGoal-NUR2PujC.js","/assets/Targets-D5601Jkl.js","/assets/Tasks-fO37QbFn.js","/assets/TimeWheelPicker-TfpibW4E.js","/assets/Toast-vL1twWLT.js","/assets/Tooltip-BmiWBVwk.js","/assets/TrendChart-D1TD4Gca.js","/assets/TripleSpeedometer-DvGza7yg.js","/assets/Trudoyomkost--Ai-nSA2.js","/assets/Turnover-VLfItVA9.js","/assets/UploadDropzone-Dg9Vt5of.js","/assets/UsersActivity-sOjdo3RO.js","/assets/VerdictBlock-B5vl7c5i.js","/assets/VfxApiMap-BT2WzILR.js","/assets/VfxDictionaries-CM-AA2AH.js","/assets/VfxEmployees-BRGhS8Ni.js","/assets/VfxHrMoves-CyFR4tTi.js","/assets/VfxJobs-B66PBJVC.js","/assets/VfxPhoto-T9pmfH3z.js","/assets/VfxShifts-D-PeKAHO.js","/assets/VfxState-BCWztaap.js","/assets/VfxTimebooks-Dxpop_f-.js","/assets/VfxTimesheet-DBdFhL0m.js","/assets/WatchProgress-BB8CesoG.js","/assets/WebLogin-C2qaIXyk.js","/assets/WorkerConcerns-B5V3VbEH.js","/assets/Workers-D0w3rMvY.js","/assets/Zagruzka-Bu5JExDU.js","/assets/ZagruzkaCell-DQdKe_tS.js","/assets/api-CrExJ-w8.js","/assets/archive-ByIb2Sds.js","/assets/archive-restore-yErQEY74.js","/assets/arrow-down-91QSxGdl.js","/assets/arrow-left-8RzXHa0O.js","/assets/arrow-up-B3WvmkV2.js","/assets/arrow-up-narrow-wide-3sUzeAKr.js","/assets/arrow-up-right-vP9QAzZC.js","/assets/award-Dn6yNE4Z.js","/assets/ban-DLrMXtos.js","/assets/book-open-Nz2oz1wy.js","/assets/bot-DSw8ApKd.js","/assets/boxes-LPjGECc-.js","/assets/braces-BNLcysX2.js","/assets/brigadirFilters-Ds9cAy72.js","/assets/broadcastTree-81BLUBvi.js","/assets/building-2-8pB4sv1v.js","/assets/calculator-BvXR8lKz.js","/assets/calendar-CRMAczlQ.js","/assets/calendar-days-8JXViygM.js","/assets/camera-tPiZDHC4.js","/assets/categories-CaMeQI3L.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BZXYXXTf.js","/assets/chart-line-BR-9rmIi.js","/assets/chart-pie-CS4Y8xyC.js","/assets/chartRange-DIbJvgBD.js","/assets/check-check-Bws2TDHG.js","/assets/chevron-left-KGLqCHbK.js","/assets/chevrons-up-down-Bakt_mXD.js","/assets/circle-alert-CFB9M2pz.js","/assets/circle-check-big-DJMWgklm.js","/assets/circle-dashed-DjMlvzAV.js","/assets/circle-jwFWmtIw.js","/assets/circle-minus-DOPBiFEX.js","/assets/circle-question-mark-CytKvXr6.js","/assets/circle-slash-DLNlwcN1.js","/assets/circle-user-round-CPFhOFQL.js","/assets/clock-3-Cisijorj.js","/assets/cloud-off-DbwGDUzf.js","/assets/cloud-upload-iIHU4B3m.js","/assets/compass-C1CbFj4F.js","/assets/concernCategories-oZNPcddp.js","/assets/copy-CkOiTcRP.js","/assets/corner-down-right-BLuVQgJd.js","/assets/createLucideIcon-CasVoW6v.js","/assets/es-Cczx1bYZ.js","/assets/exportXlsx-Dm9Uw_vV.js","/assets/external-link-Bn1cPo-7.js","/assets/file-clock-BECqc3mK.js","/assets/file-exclamation-point-CwqWe7ez.js","/assets/file-spreadsheet-Re7w8-wX.js","/assets/file-text-BSJ2Fodd.js","/assets/flag-7uu345OV.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BYTRBmkM.js","/assets/hash-pZKnecrq.js","/assets/history-rxdOEFZw.js","/assets/hourglass-CHrmeoXf.js","/assets/image-39uqOgp9.js","/assets/image-off-lPqhqLlz.js","/assets/inbox-DkYVMG5u.js","/assets/index-B-GJdTPy.css","/assets/index-Ccd2K2ad.js","/assets/key-round-BjTXodpg.js","/assets/keyboard-BTQN6ZWh.js","/assets/languages-fD9_b99q.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-J00Gf0v7.js","/assets/lightbulb-Bc2McXdH.js","/assets/link-2-Dj9t5OCa.js","/assets/link-2-off-l1K8bsnR.js","/assets/list-ordered-D3hBQz_l.js","/assets/list-tree-DIdw_KgY.js","/assets/lock-open-c6Q9SsHk.js","/assets/log-in-CSDB0GDf.js","/assets/maximize-2-Gz4O0Ecv.js","/assets/message-square-CBH16tzc.js","/assets/minimize-2-COl-Go7B.js","/assets/package-check-CPktD2K4.js","/assets/paperclip-8BSc3xum.js","/assets/pencil-Dp7UH2M7.js","/assets/percent-BascUFCM.js","/assets/pin-DEHV7Cwq.js","/assets/pin-off-Bifg3T68.js","/assets/play-CgfWi8kF.js","/assets/plug-zap-CYmpyho0.js","/assets/presentation-DfMD5UcJ.js","/assets/prop-types-CTAmOKev.js","/assets/radio-DPXH_XZg.js","/assets/react-apexcharts.esm-CcUW8MhN.js","/assets/registers-DOquvAwd.js","/assets/repeat-TuO9N95J.js","/assets/rotate-ccw-D4EFtHKn.js","/assets/rotate-cw-BsysJlcN.js","/assets/save-D57XDROV.js","/assets/scopeLinks-BOHMZW3r.js","/assets/scroll-text-D3eu0CZT.js","/assets/search-x-BmohvEST.js","/assets/segments-BiOxqTdK.js","/assets/send-C6cighE7.js","/assets/settings-2-hGsQNpWN.js","/assets/shield-BV-e12L-.js","/assets/shield-alert-CStwZ6Mv.js","/assets/shield-check-qjEnxS8O.js","/assets/shield-question-mark-DHYyKJqS.js","/assets/siren-DW56DSdv.js","/assets/snowflake-DeFv-fuv.js","/assets/split-3zSwyWtb.js","/assets/square-check-big-C-QqaFC-.js","/assets/square-yeEVZS0C.js","/assets/star-BSsikoOU.js","/assets/statusBands-B2OCjt6i.js","/assets/store-Beaky1wX.js","/assets/table-2-D5ZrhC_R.js","/assets/table-properties-VC3pyRYQ.js","/assets/tag-CsgxfYqQ.js","/assets/timer-off-AoQ-JPBi.js","/assets/trending-down-CFtpUklb.js","/assets/trending-up-gqlADRLQ.js","/assets/undo-2-Cv2n3VVz.js","/assets/useChartTheme-D2hMZcTE.js","/assets/useElementWidth-CbjqxV06.js","/assets/useIsMobile-5ffllUMJ.js","/assets/useOpenParam-tp4IN0Ja.js","/assets/useStatusBands-D5_NS6kQ.js","/assets/useUrlScope-B7k98i0u.js","/assets/user-cog-qiJkL_nm.js","/assets/user-fcvrxxSf.js","/assets/users-DU2e1ctM.js","/assets/vfx-Hq-Q5zWQ.js","/assets/video-DKewsN4b.js","/assets/wallet-DCUrK2xh.js","/assets/warehouse-vapFTigS.js","/assets/x-BRj9c4DT.js","/assets/zap-BOX_wGkv.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
