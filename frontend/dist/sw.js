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

const BUILD = "2026-10-29T04:32:36.388Z";
const PRECACHE = ["/","/assets/AdminPanel-CzEC_P12.js","/assets/AnalysisBoard-B5uvk3yx.js","/assets/Arc-Ci_jdyGV.js","/assets/Assistant-2otKPi3G.js","/assets/BrigadirProfile-FlPGzmm-.js","/assets/BroadcastReceivers-BBkFTr8d.js","/assets/BroadcastRecord-CpzcmiZv.js","/assets/Button-DEYnoJud.js","/assets/CatLockNotice-D562MOjH.js","/assets/CategoryLegendModal-Blx9v0h1.js","/assets/CellConcerns-B2GgEq1H.js","/assets/CellDetails-D81xH7Ti.js","/assets/CellFormModal-Cpv6rog0.js","/assets/CellIdent-C94LnPpn.js","/assets/CellLink-DsLKFVAu.js","/assets/Cells-CT7Z19QI.js","/assets/ColumnFilter-Ck_A1wSh.js","/assets/ColumnsPicker-DxZhu2ag.js","/assets/CommentsModal-BsWEumWx.js","/assets/ComparisonTable-j-VqXaXq.js","/assets/Concerns-BNE846Ar.js","/assets/CountStepper-BMYoN7os.js","/assets/Daily-ZPLRfhoO.js","/assets/DataTable-BB6gQ6Qu.js","/assets/DateRangePicker-Cdhme0LY.js","/assets/DayReportView-DlOUQaNE.js","/assets/DayStepper-DrRjnhMY.js","/assets/DayStrip-BEM1T3Qo.js","/assets/DifferenceBreakdown-CxAzOnJb.js","/assets/Downtime-BJgrqb4k.js","/assets/Education-OYxB9lIN.js","/assets/EducationLesson-6wBj8Bdp.js","/assets/EmptyState-D7xfmlLC.js","/assets/Exam-CbwwJxKX.js","/assets/FactorySelect-DWZ7o8la.js","/assets/Gamification-CUTHRkhK.js","/assets/GroupBadge-Dd_SHEOc.js","/assets/HeatmapChart-Ck6OFhJn.js","/assets/IdleCell-JZF2m0Yu.js","/assets/KPICard-qIs0driH.js","/assets/Kaizen-Ctz9De0k.js","/assets/Kelish-CDa-6uEF.js","/assets/KpiDeltaCard-BK65IbSX.js","/assets/LangTextInput-DfcLA_w-.js","/assets/Layout-DVxPKY2m.js","/assets/LeaderAppeal-Bjg8K3uz.js","/assets/LeaderDayReport-CDwdIcAb.js","/assets/LeaderUnitReport-C6GKCcdA.js","/assets/Leaderboard-DwVWqD8R.js","/assets/Leaders-BfWqHQE8.js","/assets/LeadersKpi-B7xl1mIi.js","/assets/Lightbox-ypm_49H3.js","/assets/LiveOverview-DqtXCvKY.js","/assets/Login-C-rmLyWe.js","/assets/NotFound-SMwkytvE.js","/assets/Notifications-B6CTT4bc.js","/assets/Ontime-CNCXwEqa.js","/assets/Overview-CLdT-HUQ.js","/assets/Pagination-DhlZX99z.js","/assets/PerenaladkaFactTable-C37o8kOY.js","/assets/PersonCard-DLDaEpMV.js","/assets/PlanFulfillment-DNowaoqn.js","/assets/Production-6HZHXZXk.js","/assets/Profile-3dzLKHCB.js","/assets/ProofCamera-Bs_ZzgbC.js","/assets/ProofPhoto-LJfcDDsv.js","/assets/Quality-BQjV7uMZ.js","/assets/RawRows-CEg4o2E7.js","/assets/Reports-D7Nt_4Tv.js","/assets/RequestStateChip-_V1Re2M4.js","/assets/RichTextEditor-CjaO32Bl.js","/assets/SaveState-DwOKpYbV.js","/assets/SearchInput-VjCYDKXz.js","/assets/SeasonalityHeatmap-CYGUMtrA.js","/assets/SegmentedToggle-CBG00G0G.js","/assets/SetupTimes-CZcvQ2lh.js","/assets/ShiftDaily-UvV0oai5.js","/assets/Staff-DsnZcElF.js","/assets/StaffListAtCheck-Cz6v1Am-.js","/assets/StatusBadge-Be_44eMV.js","/assets/StatusBandsModal-BbzjymSp.js","/assets/TargetGoal-BhtOCaQg.js","/assets/Targets-DPoeQtGE.js","/assets/Tasks-BsJrLvxZ.js","/assets/TimeWheelPicker-CUVpk5d7.js","/assets/Toast-C3YWaPou.js","/assets/Tooltip-KMV8fEu6.js","/assets/TrendChart-Ds1Gemip.js","/assets/TripleSpeedometer-BXvHyvtz.js","/assets/Trudoyomkost-D9UTBDTg.js","/assets/UploadDropzone-C-cyTndR.js","/assets/UsersActivity-CH6qNJ2p.js","/assets/VerdictBlock-C8dJpVFL.js","/assets/VfxApiMap-DMEuU37o.js","/assets/VfxDictionaries-BNkRlVAP.js","/assets/VfxEmployees-BuxKHnOt.js","/assets/VfxHrMoves-Bg3rCx3f.js","/assets/VfxJobs-DjJAjDQk.js","/assets/VfxPhoto-CozwxGL6.js","/assets/VfxShifts-CtgKsEM_.js","/assets/VfxState-TfJ4NrBy.js","/assets/VfxTimebooks-5W5xx2UP.js","/assets/VfxTimesheet-f51LYYBo.js","/assets/WatchProgress-Coqy9hSV.js","/assets/WebLogin-D7KpfAXY.js","/assets/Workers-D1I5wiBR.js","/assets/Zagruzka-BgUkIREV.js","/assets/ZagruzkaCell-C4TefO4e.js","/assets/api-BFm7MSgf.js","/assets/archive-Dg-2RmzN.js","/assets/archive-restore-Bnaz0Yyl.js","/assets/arrow-down-DPiYJCvc.js","/assets/arrow-down-right-Dx6bN7VH.js","/assets/arrow-down-wide-narrow-Ct0hX1ju.js","/assets/arrow-up-narrow-wide-COfKN6Oy.js","/assets/ban-BSPPKreb.js","/assets/boxes-BJPpV2Ia.js","/assets/braces-BjDdmvHg.js","/assets/brigadirFilters-Dth_IEln.js","/assets/broadcastTree-BU_QH7IF.js","/assets/building-2-DUAnwRoH.js","/assets/calendar-BUcFDwlP.js","/assets/calendar-days-HU8OaEMI.js","/assets/camera-Di0q7HpZ.js","/assets/categories-CdanIOiv.js","/assets/cellMoveRefusal-Icd7KkjF.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BRWf92pv.js","/assets/chart-line-CtI_IYcD.js","/assets/chart-pie-C3UWhNln.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-DTuQUyiH.js","/assets/chevron-left-D0n239TI.js","/assets/chevrons-up-down-BVEla2Tg.js","/assets/circle-DePv7vh_.js","/assets/circle-alert-B1_bxXOF.js","/assets/circle-check-big-BsJStzgU.js","/assets/circle-dashed-BcqCJfiB.js","/assets/circle-minus-DRlXvtoK.js","/assets/circle-question-mark-nKMXTS7s.js","/assets/circle-slash-mNSQIfpq.js","/assets/circle-user-round-Dv5NCmIr.js","/assets/cloud-off-2Ukb6VVY.js","/assets/cloud-upload-B6TBb5rR.js","/assets/coins-BbixfWcb.js","/assets/compass-Bqtiz-0j.js","/assets/concernCategories-B1mF7oGM.js","/assets/corner-down-right-DppeuNJP.js","/assets/createLucideIcon-BHNllaTg.js","/assets/en-RAlwp2tS.js","/assets/es-Dtgc5NM1.js","/assets/external-link-D8F9wIi5.js","/assets/file-clock-Bmf_KXtk.js","/assets/file-exclamation-point-C1Jh2zHY.js","/assets/flag-BnEDxe9F.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-ClUANLBI.js","/assets/funnel-0nTSVidR.js","/assets/hash-CbcCEXTX.js","/assets/hourglass-DpMSrTOS.js","/assets/idleTime-CHPnJRpw.js","/assets/image-B0NO-Ndq.js","/assets/image-off-CwcVaKIg.js","/assets/inbox-CFTHplme.js","/assets/index-BtYmuUYW.css","/assets/index-x0lmSYoz.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DUKc6J-k.js","/assets/languages-wQEmnmK_.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BZjRfKBY.js","/assets/leaderBoard-DgnxoH9I.js","/assets/lightbulb-Dl-pe6EC.js","/assets/link-2-B1-g9-sL.js","/assets/link-2-off-C_mTjf62.js","/assets/list-ordered-Dkw_kObY.js","/assets/list-tree-RxelI11T.js","/assets/lock-open-CCcm8xge.js","/assets/log-in-CdNROnDX.js","/assets/map-pin-BQEkyUV3.js","/assets/marks-CXg8zrOF.js","/assets/minimize-2-D81_3VSD.js","/assets/package-check-CUNCsErM.js","/assets/pencil-CP3rXt4d.js","/assets/percent-k0fDSkKR.js","/assets/pin-CpT2R5h_.js","/assets/pin-off-x6nOfLIe.js","/assets/play-CyNpyPGU.js","/assets/plug-zap-C7O9hQcY.js","/assets/prop-types-RD3fbola.js","/assets/radio-Dy3B2NYK.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-B4CT3fRQ.js","/assets/repeat-DtwUeFhM.js","/assets/ru-RUoQIucl.js","/assets/save-_mdNYlzR.js","/assets/scopeLinks-C_D68c2m.js","/assets/scroll-text-CVd4vX4o.js","/assets/search-x-CU8LG57r.js","/assets/segments-D5Uiedtv.js","/assets/send-CCMn413p.js","/assets/settings-2-h5xDETKP.js","/assets/shield-DmW7T6DV.js","/assets/shield-alert-DrruOZnv.js","/assets/shield-question-mark-B8UmoJ8D.js","/assets/sigma-Cm4azrT_.js","/assets/siren-ZS9dgD5H.js","/assets/snowflake-DBGRxYRH.js","/assets/split-CdMHkoZ1.js","/assets/square-check-big-5hORykZX.js","/assets/star-DMB26_CI.js","/assets/statusBands-DVBZcBq3.js","/assets/store-DQ5jhWLV.js","/assets/table-2-CRQ6M9ci.js","/assets/table-properties-DvmElYdc.js","/assets/tag-B98LpMDW.js","/assets/timer-off-DRbSZUmL.js","/assets/translations-BYm6QkQo.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-DPnIuqax.js","/assets/trending-up-DcYfcMPh.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-BByUibKK.js","/assets/useChartTheme-CLdS6kRH.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-CbQE-8Od.js","/assets/useStatusBands-xwRQaX7D.js","/assets/useUrlScope-DeEUXHVx.js","/assets/user-D6v7w4Cr.js","/assets/user-cog-D4LN-vIz.js","/assets/user-minus-bb0gDR4s.js","/assets/users-Bqt1Cr7C.js","/assets/uz-Cu3l-EXj.js","/assets/uz_cyrl-BhoUlSF7.js","/assets/vfx-BP6X-vwB.js","/assets/video-D3JdDOzh.js","/assets/wallet-qqzplxAu.js","/assets/warehouse-CfSLsOAl.js","/assets/workflow-DEkGlGER.js","/assets/x-CigRPOSZ.js","/assets/zap-DmMOwQ-Y.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
