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

const BUILD = "2026-10-03T09:32:06.453Z";
const PRECACHE = ["/","/assets/AdminPanel-BCUDskY0.js","/assets/AnalysisBoard-DZjpPt01.js","/assets/Arc-CRbo_qNL.js","/assets/ArcLegacy-BYtuJUUS.js","/assets/BrigadirProfile-CqbHMQQq.js","/assets/BroadcastReceivers-ChxqunB9.js","/assets/BroadcastRecord-BZ3oKHZf.js","/assets/CatLockNotice-CpCtbtfH.js","/assets/CategoryLegendModal-CiU9f9BP.js","/assets/CellConcerns-BI9vro-r.js","/assets/CellDetails-D0o5qtQk.js","/assets/CellFormModal-MijpuyXK.js","/assets/CellIdent-BK-h8ye5.js","/assets/CellLink-BcXny9Bq.js","/assets/Cells-ZqbDev7K.js","/assets/ColumnFilter-BaNh3ixK.js","/assets/ColumnsPicker-enmZ-h9e.js","/assets/CommentsModal-32rIe2mf.js","/assets/ComparisonTable-IxTu0ayx.js","/assets/Concerns-CFzAxTqH.js","/assets/ConfirmDialog-ez-cIKu2.js","/assets/Daily-Sb7hiNmF.js","/assets/DataTable-2bSiKhgL.js","/assets/DateRangePicker-CKI_ipT6.js","/assets/DayReportView-CUOCZ-mI.js","/assets/DayStepper-CTGCQVpd.js","/assets/DifferenceBreakdown-DUvRNyrl.js","/assets/Downtime-DaohSc0Y.js","/assets/Education-puXqc7ox.js","/assets/EducationLesson-BfdwH6Ac.js","/assets/EmptyState-yOv2BvLm.js","/assets/Exam-CIg6YqwO.js","/assets/FactorySelect-CtpZ8ohi.js","/assets/Gamification-DkJdk4eA.js","/assets/GroupBadge-BQMD_FcG.js","/assets/HeatmapChart-Bnzs7KTx.js","/assets/IdleCell-CCKIU78Y.js","/assets/KPICard-y8J6sGIR.js","/assets/Kaizen-Cpuk3RBY.js","/assets/Kelish-DRq2f4xF.js","/assets/KpiDeltaCard-BrU2hywe.js","/assets/LangTextInput-BqyFIPnd.js","/assets/Layout-F9D_EQGu.js","/assets/LeaderAppeal-C3kvbRgI.js","/assets/LeaderDayReport-D8grLWM5.js","/assets/LeaderUnitReport-C1U9xZms.js","/assets/Leaderboard-BGT8TI9U.js","/assets/Leaders-DQBDsx_8.js","/assets/Lightbox-D7XcCpoz.js","/assets/LiveOverview-0n6HRqjD.js","/assets/Login-CIOh9qYZ.js","/assets/NotFound-iArg3tRY.js","/assets/Notifications-DZH0aNf5.js","/assets/Overview-q6jX0cwO.js","/assets/Pagination-BC7gdB9q.js","/assets/PerenaladkaFactTable-B3oGdgFA.js","/assets/PersonCard-p86jTj0I.js","/assets/PlanFulfillment-l95Cx_7k.js","/assets/Production-BbKEWzfq.js","/assets/Profile-kCZRbpkh.js","/assets/ProofCamera-C_C9PmrS.js","/assets/ProofPhoto-DZdTXrjm.js","/assets/Quality-t2MWRWGX.js","/assets/RawRows-BeePAZ52.js","/assets/RequestStateChip-DSfRV74v.js","/assets/RichTextEditor-DPgsRyLg.js","/assets/SaveState-CW88c1Tk.js","/assets/SearchInput-BLImRaOs.js","/assets/SeasonalityHeatmap-yuQOAcsi.js","/assets/SegmentedToggle-Djx1W5RC.js","/assets/SetupTimes-C6NCKcga.js","/assets/ShiftDaily-BPUXQ5_w.js","/assets/Staff-DwnKzjyb.js","/assets/StaffLive-DC4FLJsT.js","/assets/StatusBadge-CGNogi1K.js","/assets/TargetGoal-Br0VlDWu.js","/assets/Targets-wZSydKm8.js","/assets/Tasks-CBe4nL66.js","/assets/TimeWheelPicker-CNnYiETB.js","/assets/Toast-Bzti06Q0.js","/assets/Tooltip-cCwmwEMc.js","/assets/TrendChart-BEheWoQL.js","/assets/TripleSpeedometer-O0ZOgmFa.js","/assets/Trudoyomkost-BygIdtb1.js","/assets/UploadDropzone-B5PUraMZ.js","/assets/UsersActivity-1AaifyVp.js","/assets/VerdictBlock-B1zbc6eT.js","/assets/VfxApiMap-D759lirR.js","/assets/VfxEmployees-CmMmAnIj.js","/assets/VfxJobs-BWxMRORq.js","/assets/VfxMarks-BATclvHA.js","/assets/VfxOnSite-CPl13z-j.js","/assets/VfxPhoto-Bpkse7pv.js","/assets/VfxState-o4CAoYBs.js","/assets/VfxStructure-WJtYrFRs.js","/assets/VfxTable-B3Aib1Q8.js","/assets/VfxTimesheet-C2GymF4L.js","/assets/WatchProgress-ClNyYhci.js","/assets/WebLogin-ptFrUsM1.js","/assets/WorkerConcerns-jLPAz5cb.js","/assets/Workers-DB9bSsR9.js","/assets/Zagruzka-BLu7dKYr.js","/assets/ZagruzkaCell-_R9kVQd7.js","/assets/api-C3iSXeX2.js","/assets/archive-CJ9LKuTz.js","/assets/archive-restore-0xV1gxeN.js","/assets/arrow-down-D-ZtH0Qt.js","/assets/arrow-left-DGmP0Vfs.js","/assets/arrow-right-left-Bsv-8vrW.js","/assets/arrow-up-BKq7OSVa.js","/assets/arrow-up-narrow-wide-CfdR7vFZ.js","/assets/arrow-up-right-C67RMU8E.js","/assets/award-DJ_mmyCW.js","/assets/ban-D_Fc1zo1.js","/assets/bot-yQNuD2pR.js","/assets/boxes-Bdbo8eA-.js","/assets/braces-CfsdweHv.js","/assets/brigadirFilters-BY-QObrX.js","/assets/broadcastTree-CJTjiEZS.js","/assets/building-2-C6iWCzHy.js","/assets/calendar-C3VZJv5c.js","/assets/calendar-days-CR8uOMVU.js","/assets/camera-DyAyXrjN.js","/assets/categories-cCKkPQp7.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CVcIoCmw.js","/assets/chart-line-D_APQu6l.js","/assets/chart-pie-0yR5hX57.js","/assets/chartRange-BvNKv8qG.js","/assets/chevron-left-Df1lL6NQ.js","/assets/chevrons-up-down-amLMGwCN.js","/assets/circle-DRWbZZhX.js","/assets/circle-alert-CxiPIFHU.js","/assets/circle-check-big-lbN1U8SS.js","/assets/circle-dashed-PwQeP6yq.js","/assets/circle-minus-DN0QicZN.js","/assets/circle-question-mark-B-amkpMU.js","/assets/circle-slash-BKjIIz_H.js","/assets/circle-user-round-Ca83BxCh.js","/assets/clock-3-BFY5cjJI.js","/assets/cloud-off-Btm9HRcF.js","/assets/cloud-upload-CIL8fBgL.js","/assets/compass-BDun1CJw.js","/assets/concernCategories-CPwUgq2E.js","/assets/copy-CFqygKuT.js","/assets/corner-down-right-BJ1pikpw.js","/assets/createLucideIcon-DkAVg2SO.js","/assets/door-open-DUn3qqB7.js","/assets/es-DuSOq0V0.js","/assets/exportXlsx-PF9S4OTd.js","/assets/external-link-D0OGHm5h.js","/assets/file-clock-BnOEennB.js","/assets/file-exclamation-point-CWgLP1I1.js","/assets/file-spreadsheet-BkKTRrIf.js","/assets/file-text-C7E-jnxw.js","/assets/flag-DB0bwRUF.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-B9eDBYSa.js","/assets/hash-DdwyICe7.js","/assets/history-CgEJeZMI.js","/assets/hourglass-OwVyFsmV.js","/assets/image-Ba3hU-JG.js","/assets/image-off-DUaXc1fL.js","/assets/inbox-BFapIS8T.js","/assets/index-BR7cWiUS.js","/assets/index-Bc1m5P-9.css","/assets/key-round-DWtQwbMM.js","/assets/keyboard-Da4p1oYY.js","/assets/languages-D2epAPCA.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-JtJsW1tb.js","/assets/lightbulb-Iu0MN4bJ.js","/assets/link-2-CZ0-8mER.js","/assets/link-2-off-D_bwVsZm.js","/assets/list-ordered-CC-iJ0uL.js","/assets/list-tree-BG8ArOpz.js","/assets/lock-open--FqFkeXu.js","/assets/log-in-Bm7F2FCe.js","/assets/maximize-2-DrCIodGJ.js","/assets/message-square-CkBgSK9h.js","/assets/minimize-2-Bth8fZHy.js","/assets/package-check-Ccw2phxJ.js","/assets/paperclip-BjAXYcew.js","/assets/pencil-yU5lW3n3.js","/assets/percent-D_e1-fPl.js","/assets/phone-BSDC34xj.js","/assets/pin-B5DFoRM8.js","/assets/pin-off-8C6AbDQA.js","/assets/play-Da0wUjQI.js","/assets/plug-zap-dltKuli1.js","/assets/presentation-UHK_m8LX.js","/assets/prop-types-CpX6dEiO.js","/assets/radio-CeV93Epb.js","/assets/react-apexcharts.esm-nNSVwmy7.js","/assets/repeat-BYEii_Eg.js","/assets/rotate-ccw-DgIsebgp.js","/assets/rotate-cw-C5ZunjO6.js","/assets/save-LN6zfFom.js","/assets/scopeLinks-DEYu0WDf.js","/assets/scroll-text-ZJwClJjw.js","/assets/search-x-DeYH1seB.js","/assets/segments-K4pD-fu9.js","/assets/send-g2HfbDR6.js","/assets/settings-2-DTIyAKyh.js","/assets/shield-NoFdj9_I.js","/assets/shield-alert-HT3yaabg.js","/assets/shield-check-ByNb7WX_.js","/assets/shield-question-mark-DoDfYPtl.js","/assets/siren-C6AwfoBF.js","/assets/snowflake-CQtQFFcg.js","/assets/split-nlBiT-YX.js","/assets/square-DRMyt7qO.js","/assets/square-check-big-3p_OPfRO.js","/assets/star-C9x4v4Nl.js","/assets/statusBands-mdq8uc39.js","/assets/store-BjCGGC2J.js","/assets/table-2-Bj-EvCVY.js","/assets/table-properties-CtEnIk8X.js","/assets/tag-CGYtTfjm.js","/assets/timer-off-CSbjTK2K.js","/assets/trending-down-m9c15_Vr.js","/assets/trending-up-D8QmsnC8.js","/assets/undo-2-C3HZxjXB.js","/assets/useChartTheme-DYjvGqdp.js","/assets/useElementWidth-WN1ITYJy.js","/assets/useIsMobile-CkXrxl4p.js","/assets/useOpenParam-BffuqR_a.js","/assets/useStatusBands-DGAa4V1k.js","/assets/useUrlScope-CUlBGSsu.js","/assets/user-cog-Ckt0zCN4.js","/assets/user-minus-DweSlbc8.js","/assets/user-p_bSOENL.js","/assets/users-arhW4rla.js","/assets/video-6N1HZq7L.js","/assets/wallet-gIi19AhG.js","/assets/warehouse-CIgjts9u.js","/assets/x-ClSdQDY8.js","/assets/zap-DKN1brCY.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
