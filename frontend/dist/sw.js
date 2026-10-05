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

const BUILD = "2026-10-05T10:57:25.111Z";
const PRECACHE = ["/","/assets/AdminPanel-Bh63dih8.js","/assets/AnalysisBoard-DCRs8VW3.js","/assets/Arc-0_ovuTdg.js","/assets/ArcLegacy-DmlXpUZb.js","/assets/BrigadirProfile-B4wJ83mc.js","/assets/BroadcastReceivers-BmsLQFCM.js","/assets/BroadcastRecord-C55gwK1y.js","/assets/Button-Dz5Y-B94.js","/assets/CatLockNotice-6M2mJjkv.js","/assets/CategoryLegendModal-yF7d2wm_.js","/assets/CellConcerns-BgCDpQub.js","/assets/CellDetails-CdBCkCCS.js","/assets/CellFormModal-Dg_v44yZ.js","/assets/CellIdent-xgxGmysU.js","/assets/CellLink-BWGu3UGM.js","/assets/Cells-CJWm8sxE.js","/assets/ColumnFilter-BVkk7itT.js","/assets/ColumnsPicker-B2Tf5WZ8.js","/assets/CommentsModal-IHoRbCpS.js","/assets/ComparisonTable-KA2CSMzZ.js","/assets/Concerns-m88P1cUV.js","/assets/Daily-4qZdlcAD.js","/assets/DataTable-DfZaa7H1.js","/assets/DateRangePicker-CEofm4L3.js","/assets/DayReportView-DYq_ORfU.js","/assets/DayStepper-Yg8bFSxT.js","/assets/DifferenceBreakdown-qWLeqBYW.js","/assets/Downtime-9yBZYVaR.js","/assets/Education-rJYufNPv.js","/assets/EducationLesson-CMoB-jWp.js","/assets/EmptyState-De0UIp7q.js","/assets/Exam-BrSenf4T.js","/assets/FactorySelect-dHoKfSU5.js","/assets/Gamification-BrSolneE.js","/assets/GroupBadge-CWXRsCeP.js","/assets/HeatmapChart-D6gsCfve.js","/assets/IdleCell-CI0unH8R.js","/assets/KPICard-BqoMWORv.js","/assets/Kaizen-CZMVdBY9.js","/assets/Kelish-t00FRjS0.js","/assets/KpiDeltaCard-B6u5IH_5.js","/assets/LangTextInput-QX9lAf9d.js","/assets/Layout-Co3UnBC7.js","/assets/LeaderAppeal-BmhMiHz8.js","/assets/LeaderDayReport-DECWFoSC.js","/assets/LeaderUnitReport-DE1g98Fy.js","/assets/Leaderboard-Bn5noLZd.js","/assets/Leaders-BCWd-0vA.js","/assets/Lightbox-CgwvfwL-.js","/assets/LiveOverview-z47p61bw.js","/assets/Login-CtFtEVs7.js","/assets/NotFound-DcpHDMTp.js","/assets/Notifications-DEwMGhvO.js","/assets/Overview-D0EkWHH8.js","/assets/Pagination-Cd5OLvqd.js","/assets/PerenaladkaFactTable-B7spJX16.js","/assets/PersonCard-CjG-7JPL.js","/assets/PlanFulfillment-D9yn1GWn.js","/assets/Production-DF0KdHnY.js","/assets/Profile-DxvmQfrJ.js","/assets/ProofCamera-6-BdjIpO.js","/assets/ProofPhoto-DF9yqLU-.js","/assets/Quality-DwAngXnc.js","/assets/RawRows-bVGDbc0C.js","/assets/RequestStateChip-B2oAJOou.js","/assets/RichTextEditor-CulqcOD2.js","/assets/SaveState-DPAMfV9y.js","/assets/SearchInput-D6Fqu3cm.js","/assets/SeasonalityHeatmap-Doc4goEX.js","/assets/SegmentedToggle-DXu0U61K.js","/assets/SetupTimes-Ch3ntluK.js","/assets/ShiftDaily-scSm_wrH.js","/assets/Staff-BZ2Ki2RZ.js","/assets/StaffLive-870HJSO1.js","/assets/StatusBadge-DAyY1dgP.js","/assets/TargetGoal-DRy4Y5xB.js","/assets/Targets-BovXOtuK.js","/assets/Tasks-Brg_mzV2.js","/assets/TimeWheelPicker-D55f5Hn1.js","/assets/Toast-Boi-mh7h.js","/assets/Tooltip-DQZY5Loz.js","/assets/TrendChart-Cg5rrOXS.js","/assets/TripleSpeedometer-DbGte7mt.js","/assets/Trudoyomkost-Ol-MkWA8.js","/assets/Turnover-B5BdrU_G.js","/assets/UploadDropzone-BLsGIIi3.js","/assets/UsersActivity-C0yZeVfi.js","/assets/VerdictBlock-DfgIVGIv.js","/assets/VfxApiMap-Cwx-UxmM.js","/assets/VfxDictionaries-Bmf7Poot.js","/assets/VfxEmployees-D3QyUgHA.js","/assets/VfxHrMoves-CBmv6EMU.js","/assets/VfxJobs-BqVaucjl.js","/assets/VfxPhoto-BZ6QaFuk.js","/assets/VfxShifts-DPeEUFzx.js","/assets/VfxState-CA7WB83h.js","/assets/VfxTimebooks-CTZId9Y3.js","/assets/VfxTimesheet-ChG3AlKT.js","/assets/WatchProgress-C0WUoZlx.js","/assets/WebLogin-Bptb5wOg.js","/assets/WorkerConcerns-CIxcCcoH.js","/assets/Workers-Dyq-EuDy.js","/assets/Zagruzka-B_9NxO1l.js","/assets/ZagruzkaCell-DGtT20S4.js","/assets/api-qAxpidkt.js","/assets/archive-CN69ADkP.js","/assets/archive-restore-CWj9JUmb.js","/assets/arrow-down-DSF_goFp.js","/assets/arrow-left-BvUjj_LS.js","/assets/arrow-up-_3Ugb7yo.js","/assets/arrow-up-narrow-wide-C7l-_Vhx.js","/assets/arrow-up-right-C4Q33v0L.js","/assets/award-DXOjrHcT.js","/assets/ban-ClJtbLOq.js","/assets/book-open-DE_oKOn5.js","/assets/bot-WnpveGTy.js","/assets/boxes-YD8G0AeW.js","/assets/braces-z4hnw1xR.js","/assets/brigadirFilters-BgJgrDw7.js","/assets/broadcastTree-DWqPfYIS.js","/assets/building-2-C7RzQxne.js","/assets/calculator-DJqChKte.js","/assets/calendar-BwI3UMrp.js","/assets/calendar-days-BsNSmcOI.js","/assets/camera-B8p15q7n.js","/assets/categories-CKo_KzX7.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cy_6Bl0s.js","/assets/chart-line-DNCX8dqi.js","/assets/chart-pie-DL8dByZV.js","/assets/chartRange-9hCCHXYQ.js","/assets/check-check-CihbXX3Y.js","/assets/chevron-left-cI9oRud7.js","/assets/chevrons-up-down-VSmYLWT_.js","/assets/circle-B8LwzCtJ.js","/assets/circle-alert-C2LKMCMR.js","/assets/circle-check-big-DfXt2Bip.js","/assets/circle-dashed-C7lOUKs4.js","/assets/circle-minus-qH7yD1h3.js","/assets/circle-question-mark-BjZch06A.js","/assets/circle-slash-Diio6hBo.js","/assets/circle-user-round-D9h83A2h.js","/assets/clock-3-DsmIBdGi.js","/assets/cloud-off-D13n-Mku.js","/assets/cloud-upload-CkX6Diky.js","/assets/compass-IWWYJ9gi.js","/assets/concernCategories-BSfJXRlg.js","/assets/copy-BNA3yjtB.js","/assets/corner-down-right-Dl9bPa1G.js","/assets/createLucideIcon-D_1zj2Ey.js","/assets/es-D6yXgczS.js","/assets/exportXlsx-DY9mxrEh.js","/assets/external-link-BGZ0379a.js","/assets/file-clock-CI6audvO.js","/assets/file-exclamation-point-BDbim1wk.js","/assets/file-spreadsheet-Dg1v6QmZ.js","/assets/file-text-DSKJTfkC.js","/assets/flag-CQ_14zZh.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Clz_SpKI.js","/assets/hash-dvqz5ifF.js","/assets/history-fTzy9ZEy.js","/assets/hourglass-PLRAg4OP.js","/assets/image-BRxfm-4v.js","/assets/image-off-BV6u5AcO.js","/assets/inbox-ajUM-5_S.js","/assets/index-DArSAqtu.js","/assets/index-EzRNd0F3.css","/assets/key-round-il2TFb6w.js","/assets/keyboard-CUCKsOUx.js","/assets/languages-BLlW0LbG.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DOEo4rdJ.js","/assets/lightbulb-CWB2zeq9.js","/assets/link-2-CFQBqMfb.js","/assets/link-2-off-Oq-pD8tv.js","/assets/list-ordered-Dqf4lWNT.js","/assets/list-tree-w5zWuvee.js","/assets/lock-open-Ds4iX769.js","/assets/log-in-DrG1lata.js","/assets/maximize-2-Dr5xnitt.js","/assets/message-square-Bwjpe8la.js","/assets/minimize-2-CDld273Q.js","/assets/package-check-DknsxpXS.js","/assets/paperclip-B4BMtgsT.js","/assets/pencil-1A729vod.js","/assets/percent-CZlOYC6L.js","/assets/pin-CyUcfp6P.js","/assets/pin-off-DQtzzWY1.js","/assets/play-BbIKoOfw.js","/assets/plug-zap-DZD25kk_.js","/assets/presentation-DgXorsLd.js","/assets/prop-types-DWY9jrmA.js","/assets/radio-C11XJ6Ek.js","/assets/react-apexcharts.esm-BIvbjqXU.js","/assets/registers-CpcMhLlb.js","/assets/repeat-CgK7JPQS.js","/assets/rotate-ccw-DuG9YRHQ.js","/assets/rotate-cw-CsgkDlYz.js","/assets/save-BRsWGpek.js","/assets/scopeLinks-DLttXu0l.js","/assets/scroll-text-DuvUgJ4i.js","/assets/search-x-niszCres.js","/assets/segments-C-GD1DcM.js","/assets/send-5rO3T2RG.js","/assets/settings-2-BlnIzHID.js","/assets/shield-Ci2CinXP.js","/assets/shield-alert-C5x2kHVd.js","/assets/shield-check-cR3plche.js","/assets/shield-question-mark-COFHFZq2.js","/assets/siren-D-UytTRW.js","/assets/snowflake-CeYY7Cgr.js","/assets/split-D3CxOfBG.js","/assets/square-IweHSaN8.js","/assets/square-check-big-FfDsDopV.js","/assets/star-81SUG3kO.js","/assets/statusBands-BZ5dS1co.js","/assets/store-B-i49xHM.js","/assets/table-2-Dz-9UnFs.js","/assets/table-properties-UdPrqvj6.js","/assets/tag-BNpvSHdg.js","/assets/timer-off-vYUDNWgf.js","/assets/trending-down-CkXEcAf6.js","/assets/trending-up-CW7QIGZV.js","/assets/undo-2-KNjKnj6Z.js","/assets/useChartTheme-CJuwzHGy.js","/assets/useElementWidth-B9A6K4kJ.js","/assets/useIsMobile-BMGvlrpb.js","/assets/useOpenParam-BTnCFimf.js","/assets/useStatusBands-CZVKfGW3.js","/assets/useUrlScope-Bw8zRudj.js","/assets/user-BVOJPSjH.js","/assets/user-cog-Bzq39Nah.js","/assets/users-GfMQBJUJ.js","/assets/vfx-CqKgrWav.js","/assets/video-COMTfKoW.js","/assets/wallet-YP1RoKUI.js","/assets/warehouse-BK_F-UZB.js","/assets/x-CCSZ-TlY.js","/assets/zap-rAJEA-QY.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
