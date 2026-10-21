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

const BUILD = "2026-10-21T06:10:50.671Z";
const PRECACHE = ["/","/assets/AdminPanel-DCor_p8I.js","/assets/AnalysisBoard-BU1CVO8F.js","/assets/Arc-B5x7Frhf.js","/assets/Assistant-BUCvdNnQ.js","/assets/BrigadirProfile-1hVk3fA_.js","/assets/BroadcastReceivers-AWe2HNMh.js","/assets/BroadcastRecord-DvnJtxt-.js","/assets/Button-D0zqMvxq.js","/assets/CatLockNotice-BZmQ8Bz5.js","/assets/CategoryLegendModal-Dy6Y5uPO.js","/assets/CellConcerns-BKbLqtb4.js","/assets/CellDetails-BBtWheiT.js","/assets/CellFormModal-Cg7nShLD.js","/assets/CellIdent-DFvJCilV.js","/assets/CellLink-BNVe1bWm.js","/assets/Cells-lbyaDlEA.js","/assets/ColumnFilter-lnCzy6tb.js","/assets/ColumnsPicker-CEg7bxTj.js","/assets/CommentsModal-MR4nFFrm.js","/assets/ComparisonTable-BxRHl1xO.js","/assets/Concerns-2RmJMmSV.js","/assets/CountStepper-CEasSKyN.js","/assets/Daily-Dyyo9Htu.js","/assets/DataTable-CCcxwVCF.js","/assets/DateRangePicker-CDvBVOs6.js","/assets/DayReportView-Coa3yduz.js","/assets/DayStepper-CvbzN6iQ.js","/assets/DayStrip-Cn5e5ARw.js","/assets/DifferenceBreakdown-CcEWo-Dx.js","/assets/Downtime-Po9q7dMH.js","/assets/Education-CVRoFoQw.js","/assets/EducationLesson-BAwF9jjY.js","/assets/EmptyState-B7KSXSaJ.js","/assets/Exam-C6vtfEgG.js","/assets/FactorySelect-Bbj0mrx9.js","/assets/Gamification-DG9kdVth.js","/assets/GroupBadge-By-ovJsU.js","/assets/HeatmapChart-B2oVpdoa.js","/assets/IdleCell-vZ8A5fir.js","/assets/KPICard-CUP1j51q.js","/assets/Kaizen-pvPeyySJ.js","/assets/Kelish-Bt-5ajBK.js","/assets/KpiDeltaCard-_01iMnHH.js","/assets/LangTextInput-BopBlLGu.js","/assets/Layout-B9uBK7ht.js","/assets/LeaderAppeal-C67kzp_W.js","/assets/LeaderDayReport-BiTa4d6M.js","/assets/LeaderUnitReport-BdO4h97n.js","/assets/Leaderboard-DgScFU-d.js","/assets/Leaders-BHdEjPJ8.js","/assets/LeadersKpi-DBH7mezX.js","/assets/Lightbox-DIkcUFLZ.js","/assets/LiveOverview-Cp-q7mdb.js","/assets/Login-CBNbQLJ5.js","/assets/NotFound-DHO4NRKj.js","/assets/Notifications-CXLETQ5H.js","/assets/Ontime-quGkTD8D.js","/assets/Overview-Ckej5EAQ.js","/assets/Pagination-BKHnzovP.js","/assets/PerenaladkaFactTable-sihQWdRl.js","/assets/PersonCard-CRXQ4zwJ.js","/assets/PlanFulfillment-CGCxqMzf.js","/assets/Production-DuP1bmif.js","/assets/Profile-BLTqjcJL.js","/assets/ProofCamera-B5cfMCQc.js","/assets/ProofPhoto-DWDT0UQT.js","/assets/Quality-BV4qY98f.js","/assets/RawRows-CoCKXynm.js","/assets/RequestStateChip-C97Elc1P.js","/assets/RichTextEditor-B_pXFEzw.js","/assets/SaveState-DZBMJJBS.js","/assets/SearchInput-Cxld0GRv.js","/assets/SeasonalityHeatmap-CMtPdI2Y.js","/assets/SegmentedToggle-C-5kg89x.js","/assets/SetupTimes-Ch9DWK9e.js","/assets/ShiftDaily-CGBNVnNn.js","/assets/Staff-Dyrk9xOT.js","/assets/StaffListAtCheck-C5oHwlDA.js","/assets/StatusBadge-B5sHkFK5.js","/assets/StatusBandsModal-BjFowc7S.js","/assets/TargetGoal-DNg5Js7q.js","/assets/Targets-CqURg1k_.js","/assets/Tasks-eQXamoEC.js","/assets/TimeWheelPicker-CmpV9KM2.js","/assets/Toast-CzjWKL0x.js","/assets/Tooltip-DnEZ0TvE.js","/assets/TrendChart-CBXlzMJA.js","/assets/TripleSpeedometer-Fr64hVok.js","/assets/Trudoyomkost-CotHoMR0.js","/assets/UploadDropzone-OiROZYcM.js","/assets/UsersActivity-BoWuOgie.js","/assets/VerdictBlock-ikGdCzqh.js","/assets/VfxApiMap-3ZrSsZOO.js","/assets/VfxDictionaries-DvCYh-pb.js","/assets/VfxEmployees-KDtqsk9s.js","/assets/VfxHrMoves-BV5dvT3s.js","/assets/VfxJobs-CiFPlahr.js","/assets/VfxPhoto-Dpu3QokG.js","/assets/VfxShifts-CqV56xwd.js","/assets/VfxState-O3mHKS36.js","/assets/VfxTimebooks-MVbi0mg-.js","/assets/VfxTimesheet-griXj8rz.js","/assets/WatchProgress-BjlT1nxp.js","/assets/WebLogin-CZehaSNc.js","/assets/Workers-DAI2Y3r3.js","/assets/Zagruzka-dSRAaKv8.js","/assets/ZagruzkaCell-Cd9Ui0xj.js","/assets/api-BL-Rksej.js","/assets/archive-Ddtitj2_.js","/assets/archive-restore-DPQcl0bn.js","/assets/arrow-down-DKgkFclI.js","/assets/arrow-down-right-BKrsSOXk.js","/assets/arrow-down-wide-narrow--QztX3Cz.js","/assets/arrow-up-narrow-wide-fzNAEevS.js","/assets/ban-D6FJgZi3.js","/assets/boxes-BBDfLwx3.js","/assets/braces-B_u3fcnU.js","/assets/brigadirFilters-CoQlGF1h.js","/assets/broadcastTree-C0BPwBZm.js","/assets/building-2-DLiyoGFn.js","/assets/calendar-BxMbVNY7.js","/assets/calendar-days-BZdDiUA4.js","/assets/camera-DI1jF3JE.js","/assets/categories-GPaweEcN.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-nvU9rbLw.js","/assets/chart-line-moWqm0sy.js","/assets/chart-pie-D6_GzHuH.js","/assets/chartRange-CoFadAFe.js","/assets/check-check-Ct_fwT2h.js","/assets/chevron-left-D0w1De_U.js","/assets/chevrons-up-down-Ctm55dTM.js","/assets/circle-S26Ae9tX.js","/assets/circle-alert-CvFYACwZ.js","/assets/circle-check-big-DL9AjKeD.js","/assets/circle-dashed-D7SSffu3.js","/assets/circle-minus-DIsm0xsS.js","/assets/circle-question-mark-CWo02xDB.js","/assets/circle-slash-DUSlxfhG.js","/assets/circle-user-round-DJCK-gVn.js","/assets/cloud-off-OBKj2iyD.js","/assets/cloud-upload-BAK9VGw7.js","/assets/compass-C1ShVNoE.js","/assets/concernCategories-CbCEZhOP.js","/assets/corner-down-right-7iTj54o5.js","/assets/createLucideIcon-CvgsVaCU.js","/assets/es-C1JC709v.js","/assets/external-link-CldOn0pK.js","/assets/file-clock-1yKM8geF.js","/assets/file-exclamation-point-BUbAwxRA.js","/assets/flag-DvjpRe6_.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DxzRGxtS.js","/assets/funnel-BtcTFj9c.js","/assets/hash-DAb7IfSK.js","/assets/hourglass-Cz9INWoZ.js","/assets/image-eqP5SxlD.js","/assets/image-off-DMqAvoXg.js","/assets/inbox-Cw07OxFs.js","/assets/index-C2RLrlwv.js","/assets/index-DLT_vDJq.css","/assets/keyboard-Asx2S-XB.js","/assets/languages-CmDrp0YQ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers--_9xev3x.js","/assets/lightbulb-DapEgOd0.js","/assets/link-2-DyeY0yqr.js","/assets/link-2-off-D43l4jSA.js","/assets/list-ordered-Bd7WpHM6.js","/assets/list-tree-BhF8WIWi.js","/assets/lock-open-CHt3WqcI.js","/assets/log-in-mZnYOH-O.js","/assets/marks-BePYmyUT.js","/assets/minimize-2-BOfrygft.js","/assets/package-check-CqihHS35.js","/assets/pencil-ffiivj6l.js","/assets/percent-DzwBWP7T.js","/assets/pin-iiY2wCsG.js","/assets/pin-off-DKX_S0JC.js","/assets/play-D2S9aP9P.js","/assets/plug-zap-CM2pwd4P.js","/assets/prop-types-9Oyx3ahI.js","/assets/radio-hnJNhXLA.js","/assets/react-apexcharts.esm-d3K6hubK.js","/assets/registers-I0rw8T6j.js","/assets/repeat-BTvUYrVX.js","/assets/save-MiRY9AYP.js","/assets/scopeLinks-DjxCcQy_.js","/assets/scroll-text-CJH4CtCh.js","/assets/search-x-mWjYnNE3.js","/assets/segments-B3QkxHbm.js","/assets/send-ituDFu6h.js","/assets/settings-2-CqH75kil.js","/assets/shield-B8w2xFOi.js","/assets/shield-alert-x2sm907D.js","/assets/shield-question-mark-CROvMHSe.js","/assets/sigma-IqWBnuWa.js","/assets/siren-zu7_7PU-.js","/assets/snowflake-BpVAm6Qt.js","/assets/split-BTjxORpc.js","/assets/square-check-big-CA4X6Pkr.js","/assets/star-9ySwJv-d.js","/assets/statusBands-DsuxTA9o.js","/assets/store-CrQYRhcD.js","/assets/table-2-DJByOLRN.js","/assets/table-properties-CnP_Qmgo.js","/assets/tag-B8ou9uhv.js","/assets/timer-off-CP0Xh9gL.js","/assets/trending-down-bOTS2MhJ.js","/assets/trending-up-BroePhCQ.js","/assets/undo-2-BtZvgcFV.js","/assets/useChartTheme-BBApMwCr.js","/assets/useElementWidth-eB19NC86.js","/assets/useIsMobile-D-vzyoEj.js","/assets/useOpenParam-CX3l8YWJ.js","/assets/useStatusBands-Dl-kW2JQ.js","/assets/useUrlScope-890TVUI_.js","/assets/user-BMq7DOAx.js","/assets/user-cog-CMJSWCzZ.js","/assets/user-minus-BnYxLwh3.js","/assets/users-Ck3CNoQi.js","/assets/vfx-BvxY8usI.js","/assets/video-BwrYYUdh.js","/assets/wallet-CGXn-W1X.js","/assets/warehouse-D6Gj3EdH.js","/assets/workflow-DZnf2Qab.js","/assets/x-CKjt4sjN.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
