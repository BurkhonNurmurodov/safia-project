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

const BUILD = "2026-10-02T10:53:13.032Z";
const PRECACHE = ["/","/assets/AdminPanel-D3HLgpAV.js","/assets/AnalysisBoard-D6FpbdZ3.js","/assets/Arc-BMWirs3p.js","/assets/ArcLegacy-BeZKJwV3.js","/assets/BrigadirProfile-D10Ts7EQ.js","/assets/BroadcastReceivers-R0d5qna_.js","/assets/BroadcastRecord-BbjXJlNd.js","/assets/CatLockNotice-nt2RfM-f.js","/assets/CategoryLegendModal-Cg4GkFvL.js","/assets/CellConcerns-ByTnRT4-.js","/assets/CellDetails-BHa8c4f4.js","/assets/CellFormModal-DEPUavpo.js","/assets/CellIdent--NJ_ao3a.js","/assets/CellLink-CTOoobCU.js","/assets/Cells-C6aIcJSz.js","/assets/ColumnFilter-CD2mgpgF.js","/assets/ColumnsPicker-B9eX9Gu0.js","/assets/CommentsModal-DB1vUiCH.js","/assets/ComparisonTable-DZEceVfz.js","/assets/Concerns-BKAdRBIx.js","/assets/ConfirmDialog-B4gOvUGs.js","/assets/Daily-CCgYajh2.js","/assets/DataTable-N1VRfJWM.js","/assets/DateRangePicker-LyAe6-uj.js","/assets/DayReportView-CqnNxQvJ.js","/assets/DayStepper---Dxu7ul.js","/assets/DifferenceBreakdown-D49cunVE.js","/assets/Downtime-BC8rdRbZ.js","/assets/Education-Drzp1rRI.js","/assets/EducationLesson-D_BVLpsr.js","/assets/EmptyState-g7yjAUbK.js","/assets/Exam-UDus4i9c.js","/assets/FactorySelect-vsMSooJS.js","/assets/Gamification-CleExV7e.js","/assets/GroupBadge-fPQJcPNi.js","/assets/HeatmapChart-B7QOlgUZ.js","/assets/IdleCell-DGBWX9-o.js","/assets/KPICard-Cy4VwB-4.js","/assets/Kaizen-Cp6nWz9X.js","/assets/Kelish-BzoLrPwB.js","/assets/KpiDeltaCard-CMleYxqA.js","/assets/LangTextInput-Ci7bfVYy.js","/assets/Layout-C9dl-fBh.js","/assets/LeaderAppeal-CZ-GncM9.js","/assets/LeaderDayReport-CD7BTtqS.js","/assets/LeaderUnitReport-2vur2UUD.js","/assets/Leaderboard-ltejHfBz.js","/assets/Leaders-C4O7Ch0Z.js","/assets/Lightbox-ByUYB9_5.js","/assets/LiveOverview-Vz6C99lO.js","/assets/Login-C4jKRRG_.js","/assets/NotFound-BwJwwKNJ.js","/assets/Notifications-C0Bnuz70.js","/assets/Overview-VM7AlNjt.js","/assets/Pagination-BBeI5otT.js","/assets/PerenaladkaFactTable-D9jw2MaE.js","/assets/PlanFulfillment-dNnbtvvC.js","/assets/Production-qcwfriTS.js","/assets/Profile-BhWIL77L.js","/assets/ProofCamera-CMtMzDMU.js","/assets/ProofPhoto-DsHMyDi2.js","/assets/Quality-wqeU05zh.js","/assets/RequestStateChip-C1ANzcuw.js","/assets/RichTextEditor-BN1Ip_Na.js","/assets/SaveState-CJwiV5av.js","/assets/SearchInput-Ww-KLkdH.js","/assets/SeasonalityHeatmap-DDZ59X29.js","/assets/SegmentedToggle-BHxF8gI3.js","/assets/SetupTimes-DZVsVg2E.js","/assets/ShiftDaily-CFyc510X.js","/assets/Staff-CsSrMHh_.js","/assets/StaffLive-Chrx_m0D.js","/assets/StatusBadge-CyEDHxBq.js","/assets/TargetGoal-XXPyczTS.js","/assets/Targets-CRr-8ykL.js","/assets/Tasks-CsY6B_kR.js","/assets/TimeWheelPicker-CDHHVyL8.js","/assets/Toast-Bapn8l6I.js","/assets/Tooltip-bKuvhF-t.js","/assets/TrendChart-B-AX0X2U.js","/assets/TripleSpeedometer-eIeIPcoH.js","/assets/Trudoyomkost-BlmiZeeb.js","/assets/UploadDropzone-CDFfEGt6.js","/assets/UsersActivity-UuyqTpx6.js","/assets/VerdictBlock-D-4SEZTH.js","/assets/WatchProgress-BORh-01n.js","/assets/WebLogin-B8eP8Y9-.js","/assets/WorkerConcerns-BhgpCQxZ.js","/assets/Workers-C6SBgKMx.js","/assets/Zagruzka-Ba9Vp6gw.js","/assets/ZagruzkaCell-BocpVp2I.js","/assets/api-DHpES3xa.js","/assets/archive-CG7ywRdy.js","/assets/archive-restore-Bjwd6bEl.js","/assets/arrow-down-Des5M8m6.js","/assets/arrow-left-CLhs557O.js","/assets/arrow-right-left-CZ2S0S7E.js","/assets/arrow-up-BhxicPSV.js","/assets/arrow-up-narrow-wide-C5lmuMKJ.js","/assets/arrow-up-right-VNE-4k_i.js","/assets/award-ChsrHwRR.js","/assets/ban-C9EEXjXD.js","/assets/bot-fRs1K6GB.js","/assets/boxes-CTxWJFR3.js","/assets/brigadirFilters-BkJXsGxS.js","/assets/broadcastTree-DpebzixW.js","/assets/building-2-pHLYQ-QF.js","/assets/calendar-Z1_wGDku.js","/assets/calendar-days-DFMkA4l1.js","/assets/calendar-range-BiV2c2kI.js","/assets/camera-D-3snWF1.js","/assets/categories-CKlRloyG.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CdKBy04z.js","/assets/chart-line-Qa3yR_iF.js","/assets/chart-pie-t5RvFqNd.js","/assets/chartRange-C6nuBHZw.js","/assets/chevron-left-BMRM24_p.js","/assets/chevrons-up-down-DZfANd2k.js","/assets/circle-CHIhCi1L.js","/assets/circle-alert-v-k27RBw.js","/assets/circle-check-big-B9zcZ4Lv.js","/assets/circle-minus-RNsV1D6v.js","/assets/circle-question-mark-DXx6DpQn.js","/assets/circle-slash-C98GnKnI.js","/assets/circle-user-round-rYviSIX1.js","/assets/cloud-off-D6h-RMGj.js","/assets/cloud-upload-BGsB5q5o.js","/assets/compass-Pi28cUmM.js","/assets/concernCategories-DiKe-nzf.js","/assets/copy-CAe-fLmZ.js","/assets/corner-down-right-Cyrq1DFU.js","/assets/createLucideIcon-CKKVEEnw.js","/assets/es-B7meVMHG.js","/assets/exportXlsx-Dw6AkMI8.js","/assets/external-link-STwCMeLL.js","/assets/file-clock-DHcVoEHt.js","/assets/file-exclamation-point-D-ncveqG.js","/assets/file-spreadsheet-DeipI8Jy.js","/assets/file-text-Cokwj0eL.js","/assets/flag-Bw5ZOop9.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CfVctYbq.js","/assets/hash-Bv6cyGGq.js","/assets/history-BDpdiGeD.js","/assets/hourglass-Db6p0FcO.js","/assets/id-card-BqQDcD10.js","/assets/image-DlqiuVNK.js","/assets/image-off-DUyXD6q8.js","/assets/inbox-DPnr-rOw.js","/assets/index-CrnobQyC.js","/assets/index-bv1wZ_fI.css","/assets/key-round-p8nLiA4P.js","/assets/keyboard-peO7_bSO.js","/assets/languages-CmeOeQpL.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DNfMAA5r.js","/assets/lightbulb-B7t-9V93.js","/assets/link-2-BvMAKlHo.js","/assets/link-2-off-Df3vAl0q.js","/assets/list-ordered-dQGyLKLc.js","/assets/list-tree-CIuYwaOw.js","/assets/lock-open-qD3bN3h3.js","/assets/log-in-B9POO78B.js","/assets/maximize-2-CvX9uTaj.js","/assets/message-square-noBZ7MOB.js","/assets/minimize-2-C-WngjeK.js","/assets/package-check-Bq8vdWJi.js","/assets/paperclip-Ehf0RtUV.js","/assets/pencil-Cv5YiH-W.js","/assets/percent-BcBUYwgB.js","/assets/pin-CODr-05u.js","/assets/pin-off-Mk98rLJ5.js","/assets/play-BLOOyNCY.js","/assets/plug-zap-B63RGElA.js","/assets/presentation-uy_6LNdY.js","/assets/prop-types-BsWCgoWP.js","/assets/radio-i6LErU2b.js","/assets/react-apexcharts.esm-D3kVbdnk.js","/assets/repeat-1GI5W_Mc.js","/assets/rotate-ccw-Dqi1lA6g.js","/assets/rotate-cw-COZDS2rN.js","/assets/save-BQeI7M8y.js","/assets/scopeLinks-Cs83GlUz.js","/assets/scroll-text-DBQ3OGb4.js","/assets/search-x-DAZVh1SN.js","/assets/segments-BXo51HlG.js","/assets/send-D44BSFqw.js","/assets/settings-2-BdAXnVTx.js","/assets/shield-BaLqjhlE.js","/assets/shield-alert-aRXsEBca.js","/assets/shield-check-devNS1xl.js","/assets/shield-question-mark-DN2rrjbp.js","/assets/siren-BQKpFMPn.js","/assets/snowflake-DlkTAmet.js","/assets/split-AkTIJSH_.js","/assets/square-DrWf31t0.js","/assets/square-check-big-BqGOTX6Z.js","/assets/star-DhMIq73-.js","/assets/statusBands-Dvm4QHjC.js","/assets/store-CUAQZhre.js","/assets/table-2-vpWDjM27.js","/assets/table-properties-Z6k11dM2.js","/assets/tag-CwSPt_uT.js","/assets/timer-off-BQctl6q8.js","/assets/trending-down-C0qYctCT.js","/assets/trending-up-T1KgEG8o.js","/assets/undo-2-7qHciwf6.js","/assets/useChartTheme--VJ4-2Nk.js","/assets/useElementWidth-Co3x0q_o.js","/assets/useIsMobile-DIhO4zpa.js","/assets/useOpenParam-C4PoZDU5.js","/assets/useStatusBands-C5GDQeSq.js","/assets/useUrlScope-DJwmKwRo.js","/assets/user-cog-ZLlJZT4Z.js","/assets/user-gLNYpazM.js","/assets/user-minus-CoEjkYjf.js","/assets/users-BMY7eRhv.js","/assets/video-D7ofPgmn.js","/assets/wallet-B8W80r3w.js","/assets/warehouse-DqXj0syD.js","/assets/x-Cp4WAC0n.js","/assets/zap-CKu8Wm50.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
