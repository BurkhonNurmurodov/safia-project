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

const BUILD = "2026-10-03T10:03:37.190Z";
const PRECACHE = ["/","/assets/AdminPanel-DPRZVs_5.js","/assets/AnalysisBoard-50NK9p7-.js","/assets/Arc-B11pLulY.js","/assets/ArcLegacy-WyXofaHk.js","/assets/BrigadirProfile-BzXTebdo.js","/assets/BroadcastReceivers-DLwRJA1G.js","/assets/BroadcastRecord-AVJ1LJvL.js","/assets/CatLockNotice-DF_Z4tA5.js","/assets/CategoryLegendModal-CrUYS54O.js","/assets/CellConcerns-LvEStS9j.js","/assets/CellDetails-BDKFR8sk.js","/assets/CellFormModal-CyDPi2Yn.js","/assets/CellIdent-B1VO1pg1.js","/assets/CellLink-jp2jDtcw.js","/assets/Cells-BbKne85c.js","/assets/ColumnFilter-a1w-JtYP.js","/assets/ColumnsPicker-DYBhjaqW.js","/assets/CommentsModal-DTcpdBx5.js","/assets/ComparisonTable-r1YAa-_v.js","/assets/Concerns-CX1cYMWP.js","/assets/ConfirmDialog-CQ-6UNdo.js","/assets/Daily-CTaWugtV.js","/assets/DataTable-CwwwOWCy.js","/assets/DateRangePicker-CMQAQSkU.js","/assets/DayReportView-DOwprtBE.js","/assets/DayStepper-9XKgcoUR.js","/assets/DifferenceBreakdown-C_6148aX.js","/assets/Downtime-DytPGWB6.js","/assets/Education-DGi5x-Gr.js","/assets/EducationLesson-ByYGtD_P.js","/assets/EmptyState-MYro3hoX.js","/assets/Exam-2kjsn3S-.js","/assets/FactorySelect-Ba0W695X.js","/assets/Gamification-DSXpQ08h.js","/assets/GroupBadge-CQ5prMda.js","/assets/HeatmapChart-D75O7rsG.js","/assets/IdleCell-CDeZHF3H.js","/assets/KPICard-fbjZKPX0.js","/assets/Kaizen-CHVRYATk.js","/assets/Kelish-D8mq9yT-.js","/assets/KpiDeltaCard-DTI27dX6.js","/assets/LangTextInput-PPHDRbDa.js","/assets/Layout-DmBarpar.js","/assets/LeaderAppeal-dToSNYbc.js","/assets/LeaderDayReport-DpZ2_M5F.js","/assets/LeaderUnitReport-CTXYGep5.js","/assets/Leaderboard-DxbF0vKv.js","/assets/Leaders-DYMYS5Am.js","/assets/Lightbox-DoFkCMy3.js","/assets/LiveOverview-BmiYh2bp.js","/assets/Login-fnMzKPhg.js","/assets/NotFound-DR5xN_Hh.js","/assets/Notifications-Bk53DgOa.js","/assets/Overview-CDSP_q7c.js","/assets/Pagination-Cju9UAEG.js","/assets/PerenaladkaFactTable-vRqpJcAj.js","/assets/PersonCard-CjPeS4eZ.js","/assets/PlanFulfillment-SzerDcUd.js","/assets/Production-GSUClaWl.js","/assets/Profile-OMfRD6wj.js","/assets/ProofCamera--1vpVxKd.js","/assets/ProofPhoto-czGUKibr.js","/assets/Quality-BRjI80Hb.js","/assets/RawRows-CgXzrXv_.js","/assets/RequestStateChip-B3bNc4C9.js","/assets/RichTextEditor-rzdMtxfS.js","/assets/SaveState-YDNacuwJ.js","/assets/SearchInput-BXuf8Mqe.js","/assets/SeasonalityHeatmap-CY4etDCf.js","/assets/SegmentedToggle-BWr57_Rj.js","/assets/SetupTimes-BnGwxwxH.js","/assets/ShiftDaily-B-s-Ps08.js","/assets/Staff-DjduoQmi.js","/assets/StaffLive-DA2GPHqc.js","/assets/StatusBadge-CcWDu13w.js","/assets/TargetGoal-Dfx3wV_O.js","/assets/Targets-FvYSMjSx.js","/assets/Tasks-DnEMh_kP.js","/assets/TimeWheelPicker-pq55jwPF.js","/assets/Toast-mHnocvjg.js","/assets/Tooltip-bGC_g8SI.js","/assets/TrendChart-B8TIok5S.js","/assets/TripleSpeedometer-BzKE-T7I.js","/assets/Trudoyomkost-BSLs-1M_.js","/assets/UploadDropzone-Bc2v8qRA.js","/assets/UsersActivity-gG5trkK3.js","/assets/VerdictBlock-CPCiLFik.js","/assets/VfxApiMap-BB5MOzN-.js","/assets/VfxEmployees-Cg8HYDni.js","/assets/VfxJobs-D7c70jef.js","/assets/VfxMarks-BjILRrJn.js","/assets/VfxOnSite-xS0LxzWE.js","/assets/VfxPhoto-CkJcPgMq.js","/assets/VfxState-CsSxGtE4.js","/assets/VfxStructure-4ny3TCLb.js","/assets/VfxTable-CV0evBal.js","/assets/VfxTimesheet-D_iYazqr.js","/assets/WatchProgress-5RSbgjBX.js","/assets/WebLogin-CI7IXvxG.js","/assets/WorkerConcerns-BRLJTy9d.js","/assets/Workers-CFdLzAE3.js","/assets/Zagruzka-B5G3Mfjw.js","/assets/ZagruzkaCell-CasLX1fG.js","/assets/api-pRSP1xps.js","/assets/archive-BE2cgIr3.js","/assets/archive-restore-BaPxr3qr.js","/assets/arrow-down-_Y1cgufw.js","/assets/arrow-left-DCst7yNv.js","/assets/arrow-right-left-jkZyoRCw.js","/assets/arrow-up-BQwf6UKB.js","/assets/arrow-up-narrow-wide-CO1MOgrr.js","/assets/arrow-up-right-PWxDiHNL.js","/assets/award-BraUK2sr.js","/assets/ban-DU5ce4jY.js","/assets/bot-CEZOeVvS.js","/assets/boxes-CSFU8jNL.js","/assets/braces-CDwdyG_T.js","/assets/brigadirFilters-97wM9gxu.js","/assets/broadcastTree-vhYgV9QM.js","/assets/building-2-D9mq6XDB.js","/assets/calendar-BoFKntgH.js","/assets/calendar-days-CqGyeki_.js","/assets/camera-1OZ8Zw6V.js","/assets/categories-HXnYnigV.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CEf4a-D6.js","/assets/chart-line-DrQHeLU4.js","/assets/chart-pie-BQzYkdjF.js","/assets/chartRange-dBBonjDH.js","/assets/chevron-left-M7GASdkW.js","/assets/chevrons-up-down-CuxN3VIq.js","/assets/circle-CbUo2XNW.js","/assets/circle-alert-DGEGdszu.js","/assets/circle-check-big-BNYX8VUr.js","/assets/circle-dashed-B0kUbUxJ.js","/assets/circle-minus-B-OsUQU_.js","/assets/circle-question-mark-D_fiPBXo.js","/assets/circle-slash-CnsexIGc.js","/assets/circle-user-round-DPVFnMjA.js","/assets/clock-3-ChxTDocJ.js","/assets/cloud-off-DLd8T4nL.js","/assets/cloud-upload-BeIn1_Pw.js","/assets/compass-Dbn8x6bw.js","/assets/concernCategories-DAzssHXP.js","/assets/copy-DX5TbvrG.js","/assets/corner-down-right-BWS_8gXj.js","/assets/createLucideIcon-eBz0uTeK.js","/assets/door-open-8AxmjJOd.js","/assets/es-BgpGQ5Pl.js","/assets/exportXlsx-DItGEYI-.js","/assets/external-link-DsUuehg2.js","/assets/file-clock-jDkcdrEA.js","/assets/file-exclamation-point-BnW0qiGk.js","/assets/file-spreadsheet-CWcWnPDa.js","/assets/file-text-D_2_z4Tl.js","/assets/flag-DMWVn0fr.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C_jpniPI.js","/assets/hash-BiLzhMFX.js","/assets/history-g9CxTtrN.js","/assets/hourglass-B8QGcaao.js","/assets/image-mLNgSYKj.js","/assets/image-off-a4Q3cdpr.js","/assets/inbox-DuCf1Xm_.js","/assets/index-B_QUDf_e.js","/assets/index-BmfDVCPF.css","/assets/key-round-D4o-FJHw.js","/assets/keyboard-Cz9EMBWf.js","/assets/languages-BuyuYBGJ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DQFRwrjK.js","/assets/lightbulb-CHLiFhWs.js","/assets/link-2-D1u8WwFB.js","/assets/link-2-off-1_KY_Etb.js","/assets/list-ordered-CpI2sw4e.js","/assets/list-tree-TwrFDkWi.js","/assets/lock-open-C4rw0ZPG.js","/assets/log-in-DL3CA9Lj.js","/assets/maximize-2-bFtke4gL.js","/assets/message-square-yvFfuyFC.js","/assets/minimize-2-CL4BTAJw.js","/assets/package-check-CoHecVbJ.js","/assets/paperclip-5nJFKzab.js","/assets/pencil-Cu2KACcV.js","/assets/percent-DJxOX57P.js","/assets/phone-O8zc_UAB.js","/assets/pin-bTb_3TQW.js","/assets/pin-off-wsuXLcxj.js","/assets/play-CiaUGKFW.js","/assets/plug-zap-D4tT38Ip.js","/assets/presentation-DP_p7IkF.js","/assets/prop-types-Bx-lHW8z.js","/assets/radio-DeaHvYBu.js","/assets/react-apexcharts.esm-BpR9OROb.js","/assets/repeat-ChL8r0ks.js","/assets/rotate-ccw-C_tjeJHc.js","/assets/rotate-cw-CvvecnQC.js","/assets/save-J3wudFTm.js","/assets/scopeLinks-Cmk5wPZj.js","/assets/scroll-text-DhTGi1s_.js","/assets/search-x-BQEgNIoU.js","/assets/segments-B-R03XZN.js","/assets/send-EsqineAa.js","/assets/settings-2-CMzbJj1J.js","/assets/shield-DU_d7e0c.js","/assets/shield-alert-BXhIaOir.js","/assets/shield-check-gWa59nzF.js","/assets/shield-question-mark-BjvdvWE2.js","/assets/siren-BGQxD4FZ.js","/assets/snowflake-DwBauXKT.js","/assets/split-BFTNiojp.js","/assets/square-BC-sBM1C.js","/assets/square-check-big-CDvhV93e.js","/assets/star-D9y6TrlH.js","/assets/statusBands-BDbCINyt.js","/assets/store-B30OhEpv.js","/assets/table-2-DuE_lD0T.js","/assets/table-properties-pbaMGaSQ.js","/assets/tag-DwW-E8bV.js","/assets/timer-off-1YRpDrZl.js","/assets/trending-down-CI7pXEuy.js","/assets/trending-up-DSpVoDdT.js","/assets/undo-2-kWQ9_bPt.js","/assets/useChartTheme-BCNQ3kvE.js","/assets/useElementWidth-B4andRTL.js","/assets/useIsMobile-DqtJ7CWf.js","/assets/useOpenParam-C7_O4uwL.js","/assets/useStatusBands-ldOnD6di.js","/assets/useUrlScope-CEGlT_OP.js","/assets/user-R_wzZQRS.js","/assets/user-cog-DqiCxoW7.js","/assets/user-minus-DCiyMs9z.js","/assets/users-BvUib4mz.js","/assets/video-Yjd8M_uI.js","/assets/wallet-Bny4YzUl.js","/assets/warehouse-BsicjXDu.js","/assets/x-CVh0trZn.js","/assets/zap-BrjXj4yW.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
