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

const BUILD = "2026-10-04T13:24:48.335Z";
const PRECACHE = ["/","/assets/AdminPanel-DCq1oBzH.js","/assets/AnalysisBoard-CQM2uQ0o.js","/assets/Arc-Dz4Rapvo.js","/assets/ArcLegacy-Dr947-oQ.js","/assets/BrigadirProfile-DhNR5Y38.js","/assets/BroadcastReceivers-Deic4Gsy.js","/assets/BroadcastRecord-CV7m-C7r.js","/assets/CatLockNotice-Ezpmo1pu.js","/assets/CategoryLegendModal-Dmj-lIe4.js","/assets/CellConcerns-1zACs6Ur.js","/assets/CellDetails-CZedwGod.js","/assets/CellFormModal-CM-v9tKZ.js","/assets/CellIdent-_kJG-JLs.js","/assets/CellLink-9FP6BLRv.js","/assets/Cells-l4F0Hjl3.js","/assets/ColumnFilter-D1YMOWUc.js","/assets/ColumnsPicker-CxyVlYH0.js","/assets/CommentsModal-DwxoFP3U.js","/assets/ComparisonTable-K12TOM4t.js","/assets/Concerns-D4g-PUH5.js","/assets/ConfirmDialog-DsOZURcP.js","/assets/Daily-Ct5XhT_k.js","/assets/DataTable-D_0uk8ZM.js","/assets/DateRangePicker-DTKLrPvP.js","/assets/DayReportView-ZOfLk_MJ.js","/assets/DayStepper-D2HhOktH.js","/assets/DifferenceBreakdown-BW9bXAHg.js","/assets/Downtime-CW3_O91S.js","/assets/Education-C9ydc5oF.js","/assets/EducationLesson-PvIKUPju.js","/assets/EmptyState-DdLIJiht.js","/assets/Exam-Qtb1F0fl.js","/assets/FactorySelect-C7Q9ChK-.js","/assets/Gamification-CjtISHrV.js","/assets/GroupBadge-DNvBFKeG.js","/assets/HeatmapChart-CqMxc6dC.js","/assets/IdleCell-CiPrtbmw.js","/assets/KPICard-D9zag5lr.js","/assets/Kaizen-B-mEhTA0.js","/assets/Kelish-CgkkjWSA.js","/assets/KpiDeltaCard-DGq55BL8.js","/assets/LangTextInput-BGNruR7m.js","/assets/Layout-BBSzWeIr.js","/assets/LeaderAppeal-cv6cL-a0.js","/assets/LeaderDayReport-BW6FLsss.js","/assets/LeaderUnitReport-DvvPP8tY.js","/assets/Leaderboard-C3y3rrBu.js","/assets/Leaders-VsfVivGo.js","/assets/Lightbox-DfbYlfME.js","/assets/LiveOverview-BRQ1i19g.js","/assets/Login-DGHd5iW5.js","/assets/NotFound-D1tD-Vks.js","/assets/Notifications-CCgL5MVc.js","/assets/Overview-DvDpLXID.js","/assets/Pagination-7-H8sQQZ.js","/assets/PerenaladkaFactTable-L1QeCq1u.js","/assets/PersonCard-CQVlqHAH.js","/assets/PlanFulfillment-CY7yXG8m.js","/assets/Production-Dzj2P_MT.js","/assets/Profile-CFZ6JP2Z.js","/assets/ProofCamera-h97Z9q0A.js","/assets/ProofPhoto-BXZZrSnA.js","/assets/Quality-P1Fr2cIi.js","/assets/RawRows-DB9RQmdF.js","/assets/RequestStateChip-DQBX7iWd.js","/assets/RichTextEditor-2GoXd9VK.js","/assets/SaveState-CgA89UUs.js","/assets/SearchInput-BiGltAtr.js","/assets/SeasonalityHeatmap-BEyKENRf.js","/assets/SegmentedToggle-CiUl-sXC.js","/assets/SetupTimes-zbRJxnRZ.js","/assets/ShiftDaily-fRIailI3.js","/assets/Staff-D1YXQoHj.js","/assets/StaffLive-BndR-FZk.js","/assets/StatusBadge-BIoku8T0.js","/assets/TargetGoal-D8TF3b1j.js","/assets/Targets-DNnJ42by.js","/assets/Tasks-BgC8UwYr.js","/assets/TimeWheelPicker-DLpFsr5d.js","/assets/Toast-Dfp0DLcW.js","/assets/Tooltip-ufToqroG.js","/assets/TrendChart-5sWAa-dl.js","/assets/TripleSpeedometer-InGaJcIj.js","/assets/Trudoyomkost-BDasKMEs.js","/assets/UploadDropzone-CxtUMmCa.js","/assets/UsersActivity-CCNCzgZs.js","/assets/VerdictBlock-CmmmZ_Fh.js","/assets/VfxApiMap-CltXiNh-.js","/assets/VfxDictionaries-Bdn6sWTj.js","/assets/VfxEmployees-DPSgRl6n.js","/assets/VfxHrMoves-BFgkCpLs.js","/assets/VfxJobs-BpHgcXH7.js","/assets/VfxPhoto-nGJ3BYYw.js","/assets/VfxShifts-L1-b-9Wb.js","/assets/VfxState-Cu4t4juQ.js","/assets/VfxTimebooks-DIR4mE_4.js","/assets/VfxTimesheet-wqAJE_v1.js","/assets/WatchProgress-jRansuiG.js","/assets/WebLogin-nDfyROEs.js","/assets/WorkerConcerns-CI0Qh0UL.js","/assets/Workers-CvPTflcq.js","/assets/Zagruzka-OXQA1yAI.js","/assets/ZagruzkaCell-DgK9cWJ3.js","/assets/api-D6UaymDX.js","/assets/archive-DbU9DkU1.js","/assets/archive-restore-BXidsfzc.js","/assets/arrow-down-B2azFCeA.js","/assets/arrow-left-Cv7ET_GB.js","/assets/arrow-up-DQIq6-PH.js","/assets/arrow-up-narrow-wide-BtQK9YvK.js","/assets/arrow-up-right-GMxLJx6g.js","/assets/award-D9ppKgCT.js","/assets/ban-BsTgP589.js","/assets/bot-DZ9SeH6J.js","/assets/boxes-DMoDQ7NT.js","/assets/braces-BP9lKbmp.js","/assets/brigadirFilters-DblTD3sZ.js","/assets/broadcastTree-Y3bqcvxb.js","/assets/building-2-BaqvV0ok.js","/assets/calendar-Cy9GjJ9p.js","/assets/calendar-days-C-JcGYMy.js","/assets/camera-j4DFQL0X.js","/assets/categories-yt8H23w5.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CzC_piyM.js","/assets/chart-line-DMi1Fxyg.js","/assets/chart-pie-CtfiSiuG.js","/assets/chartRange-CiaBSgfe.js","/assets/check-check-D_j4Eh7k.js","/assets/chevron-left-Ddn3KyBP.js","/assets/chevrons-up-down-NAOHstlq.js","/assets/circle-Brl0bwkY.js","/assets/circle-alert-CI9YhXop.js","/assets/circle-check-big-S1G9TqNm.js","/assets/circle-dashed-9ESEJLl6.js","/assets/circle-minus-DAMIGNww.js","/assets/circle-question-mark-DDBpTHrz.js","/assets/circle-slash-sIZ6lxp9.js","/assets/circle-user-round-BcVyKITl.js","/assets/clock-3-B8MhNp4T.js","/assets/cloud-off-Di3uCcCe.js","/assets/cloud-upload-PHmel9E3.js","/assets/compass-D_FsljE6.js","/assets/concernCategories-D-j794kl.js","/assets/copy-KYiz7Aqq.js","/assets/corner-down-right-C-xYBhbw.js","/assets/createLucideIcon-BVEVBNyh.js","/assets/es-CSlxZ9qY.js","/assets/exportXlsx-C45Lxucg.js","/assets/external-link-AAiusR5i.js","/assets/file-clock-BKiZZRaC.js","/assets/file-exclamation-point-BcRyRBOA.js","/assets/file-spreadsheet-yHQoSY85.js","/assets/file-text-CL5M_CuS.js","/assets/flag-Cs3grY-P.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BeYhXwmc.js","/assets/hash-UwUf4fHQ.js","/assets/history-CLK_Nsxn.js","/assets/hourglass-DGOv3FBy.js","/assets/image-C1614sjk.js","/assets/image-off-BM_3aCT4.js","/assets/inbox-DWKdJzxa.js","/assets/index-Bo_WuXVK.js","/assets/index-DzDT26XC.css","/assets/key-round-BMwPd2KQ.js","/assets/keyboard-TMIdkY5F.js","/assets/languages-Bf2-g9nq.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BthuhZwl.js","/assets/lightbulb-CzkVUUzw.js","/assets/link-2-off-D5mmPF8z.js","/assets/link-2-sIOMSV3c.js","/assets/list-ordered-C8jqM7o6.js","/assets/list-tree-DiJoRVXA.js","/assets/lock-open-DP0BRh0t.js","/assets/log-in-BNTYoEeu.js","/assets/maximize-2-BQdmY4Qm.js","/assets/message-square-Dr4sS12-.js","/assets/minimize-2--zYkWfWA.js","/assets/package-check-DJfscnu8.js","/assets/paperclip-DEQl38qy.js","/assets/pencil-DwZuU9vu.js","/assets/percent-U4VFcUkY.js","/assets/pin-Bt-zcvIW.js","/assets/pin-off-DV7ynTGZ.js","/assets/play-DzKwx9ci.js","/assets/plug-zap-DpjHJA_a.js","/assets/presentation-BhwlR-TK.js","/assets/prop-types-BPOUVB5-.js","/assets/radio-RyKkruLd.js","/assets/react-apexcharts.esm-DfYGVKy9.js","/assets/registers-BNwjWke0.js","/assets/repeat-szjeEqiP.js","/assets/rotate-ccw-BdbwYahX.js","/assets/rotate-cw-Br8cNxSm.js","/assets/save-ygHKkAoz.js","/assets/scopeLinks-D2zQBiMP.js","/assets/scroll-text-C58agYjr.js","/assets/search-x-BnFQpL65.js","/assets/segments-C4rs_24-.js","/assets/send-CKjMROT4.js","/assets/settings-2-CyrT3DhT.js","/assets/shield-Dx7gJAug.js","/assets/shield-alert-BpfuXTe5.js","/assets/shield-check-Ne4Loz2V.js","/assets/shield-question-mark-BPCPFK4b.js","/assets/siren-CIXrGuZO.js","/assets/snowflake-8lCoiPVm.js","/assets/split-QgpCN4Xb.js","/assets/square-BImjn4Kx.js","/assets/square-check-big-Bea3EjP4.js","/assets/star-BLNuFA94.js","/assets/statusBands-BSmTr6hl.js","/assets/store-ByEnVQZV.js","/assets/table-2-B_NgDGjx.js","/assets/table-properties-BY-KBNoF.js","/assets/tag-8TVbtYFI.js","/assets/timer-off-Stc8k5dE.js","/assets/trending-down-p3T50bbR.js","/assets/trending-up-NFyippc3.js","/assets/undo-2-vBOW3mfO.js","/assets/useChartTheme-BOk52BlG.js","/assets/useElementWidth-aJDS1RIh.js","/assets/useIsMobile-N5d2djoB.js","/assets/useOpenParam-DST7IH4Q.js","/assets/useStatusBands-CoQ4bUcg.js","/assets/useUrlScope-Cwl_mHci.js","/assets/user-D7XVWyw8.js","/assets/user-cog-AoLnj7f3.js","/assets/user-minus-C1Y92AVX.js","/assets/users-D4TD89bx.js","/assets/video-CPPOqY0i.js","/assets/wallet-u0WesdK-.js","/assets/warehouse-vUfeEDN2.js","/assets/x-CLCNNQwX.js","/assets/zap-Bymuauyk.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
