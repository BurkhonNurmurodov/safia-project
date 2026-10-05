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

const BUILD = "2026-10-05T08:03:00.197Z";
const PRECACHE = ["/","/assets/AdminPanel-DSlHRzwe.js","/assets/AnalysisBoard-DfAYG3JI.js","/assets/Arc-VWOn4xnV.js","/assets/ArcLegacy-BaWLkBdB.js","/assets/BrigadirProfile-CfIfz9qs.js","/assets/BroadcastReceivers-D786u8In.js","/assets/BroadcastRecord-BU6HRh-o.js","/assets/Button-BrQSIO6q.js","/assets/CatLockNotice-BHEiPsqz.js","/assets/CategoryLegendModal-B3fC32pS.js","/assets/CellConcerns-B1xExt3k.js","/assets/CellDetails-BUpIv95h.js","/assets/CellFormModal-BeA8nl4-.js","/assets/CellIdent-lvGjtbld.js","/assets/CellLink-CKcXWIDB.js","/assets/Cells-DIUXLyVh.js","/assets/ColumnFilter-DgFftquV.js","/assets/ColumnsPicker-DLPQJxbQ.js","/assets/CommentsModal-DQm3jdPU.js","/assets/ComparisonTable-BVRUKpN2.js","/assets/Concerns-BIzROHdW.js","/assets/Daily-DTya-M_j.js","/assets/DataTable-vcMA2tfU.js","/assets/DateRangePicker-I2OvJG11.js","/assets/DayReportView-B3dIdNGU.js","/assets/DayStepper-06zrMRF_.js","/assets/DifferenceBreakdown-BhZ662TR.js","/assets/Downtime-BYML3vbL.js","/assets/Education-Blw1VHhO.js","/assets/EducationLesson-BVmeK-HV.js","/assets/EmptyState-CsOifDoi.js","/assets/Exam-RfMZ5aYz.js","/assets/FactorySelect-K5JFN-EM.js","/assets/Gamification-G-ZWac9O.js","/assets/GroupBadge-CIcO2xX5.js","/assets/HeatmapChart-CUEEYhNf.js","/assets/IdleCell-CLdvuoPa.js","/assets/KPICard-DwwTqRzn.js","/assets/Kaizen-D9D312jk.js","/assets/Kelish-BVt1XySm.js","/assets/KpiDeltaCard-DveTe8Z7.js","/assets/LangTextInput-CBcBPP0a.js","/assets/Layout-C2abEMf2.js","/assets/LeaderAppeal-Ce0ZKZuL.js","/assets/LeaderDayReport-CaFJuTOj.js","/assets/LeaderUnitReport-B4jk1x8J.js","/assets/Leaderboard-BnOS_jJH.js","/assets/Leaders-BQ4amEkc.js","/assets/Lightbox-CRcZJAiT.js","/assets/LiveOverview-jey6QwNV.js","/assets/Login-6tBr2eeO.js","/assets/NotFound-D4aFAa-T.js","/assets/Notifications-CKSW6HWk.js","/assets/Overview-oPh22rr1.js","/assets/Pagination-BpJ37C26.js","/assets/PerenaladkaFactTable-BNKK6pnT.js","/assets/PersonCard-C2Hbxydp.js","/assets/PlanFulfillment-BGlYPfdq.js","/assets/Production-Doe196_X.js","/assets/Profile-POf7tFvS.js","/assets/ProofCamera-BIlmH4mj.js","/assets/ProofPhoto-DcUWDP4X.js","/assets/Quality-DWM_KoaJ.js","/assets/RawRows-Bs12LKdv.js","/assets/RequestStateChip-B6fSF5c7.js","/assets/RichTextEditor-BWxKxDhG.js","/assets/SaveState-DCR2mKVd.js","/assets/SearchInput-BIyvnvFq.js","/assets/SeasonalityHeatmap-BP02WXIV.js","/assets/SegmentedToggle-lTvSdGtt.js","/assets/SetupTimes-RAvBcjFp.js","/assets/ShiftDaily-BD03UVK1.js","/assets/Staff-KiC6vuIv.js","/assets/StaffLive-bLdtAPK8.js","/assets/StatusBadge-CCSx50EV.js","/assets/TargetGoal-BBmZTnCw.js","/assets/Targets-DDAbuHkH.js","/assets/Tasks-9FGT1GhW.js","/assets/TimeWheelPicker-lYZ3yeeW.js","/assets/Toast-CcofDwlo.js","/assets/Tooltip-D8m-FMhb.js","/assets/TrendChart-CJTBAsYC.js","/assets/TripleSpeedometer-_HsK2FJS.js","/assets/Trudoyomkost-J9oTDGFS.js","/assets/Turnover-_8EBinlE.js","/assets/UploadDropzone-ClkMnu3J.js","/assets/UsersActivity-CVZZepNo.js","/assets/VerdictBlock-BAhbqMcw.js","/assets/VfxApiMap-CKY3pbk5.js","/assets/VfxDictionaries-Gh642Z60.js","/assets/VfxEmployees-DMsPhizP.js","/assets/VfxHrMoves-BN26J3-G.js","/assets/VfxJobs-Z5L-5Y5z.js","/assets/VfxPhoto-9CR8aECl.js","/assets/VfxShifts-BtUfKdLi.js","/assets/VfxState-DJj6lbhQ.js","/assets/VfxTimebooks-iqFyJ2IP.js","/assets/VfxTimesheet-BRj8esQ7.js","/assets/WatchProgress-Bf5yZ1ka.js","/assets/WebLogin-CxEYVqgs.js","/assets/WorkerConcerns-D1u8MClC.js","/assets/Workers-DtSLFdQ6.js","/assets/Zagruzka-lIYtRiPE.js","/assets/ZagruzkaCell-QJxbKuDr.js","/assets/api-DjMEIOkW.js","/assets/archive-COiwtuCl.js","/assets/archive-restore-P42o3ypU.js","/assets/arrow-down-DMTS9jwC.js","/assets/arrow-left-DqweMyLt.js","/assets/arrow-up-D3Xhsj8U.js","/assets/arrow-up-narrow-wide-DeNoXe2s.js","/assets/arrow-up-right-Ds1yjkly.js","/assets/award-wt8Dd2dd.js","/assets/ban-BxLeCF-t.js","/assets/book-open-SqKCPJe1.js","/assets/bot-ogWTIz7E.js","/assets/boxes-BoDMyNvG.js","/assets/braces-CfRsIkiB.js","/assets/brigadirFilters-BJWfc45L.js","/assets/broadcastTree-DCo4v-dr.js","/assets/building-2-zDLOhtRL.js","/assets/calculator-B198piCG.js","/assets/calendar-DI-EwBp3.js","/assets/calendar-days-CAoQ7RQz.js","/assets/camera-CrH0PDYZ.js","/assets/categories-CJttJHpQ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DAGXJDv7.js","/assets/chart-line-Ck-n7m-D.js","/assets/chart-pie-0ADYGdxv.js","/assets/chartRange-D4WicOft.js","/assets/check-check-QLyvknQQ.js","/assets/chevron-left-C384Gomn.js","/assets/chevrons-up-down-DA68zI9I.js","/assets/circle-CNGPozLx.js","/assets/circle-alert-CTbhI191.js","/assets/circle-check-big-BzkyvX7N.js","/assets/circle-dashed-DaWIhEbp.js","/assets/circle-minus-BpfUA9cQ.js","/assets/circle-question-mark-By4PCrfA.js","/assets/circle-slash-XcQby6rG.js","/assets/circle-user-round-CxewZ9vK.js","/assets/clock-3-B9zmkTqW.js","/assets/cloud-off-LVeTHscI.js","/assets/cloud-upload-pSH6_o9v.js","/assets/compass-DQRB8Z_X.js","/assets/concernCategories-CE8c_CPC.js","/assets/copy-DriV5K5z.js","/assets/corner-down-right-CmWd_VW8.js","/assets/createLucideIcon-BqZYlWM6.js","/assets/es-DTnMlETv.js","/assets/exportXlsx-C1dAbGEY.js","/assets/external-link-CmebGj7v.js","/assets/file-clock-5mbcIHnU.js","/assets/file-exclamation-point-DLH3vDuA.js","/assets/file-spreadsheet-DV3PCKup.js","/assets/file-text-CuV0bogx.js","/assets/flag-D_zX80LC.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CJTMYjpg.js","/assets/hash-CbHJW7Sg.js","/assets/history-CcpjA9Jb.js","/assets/hourglass-Dm_-IvR_.js","/assets/image-Dns9caY4.js","/assets/image-off-CdWmgKd1.js","/assets/inbox-CIi_ESuj.js","/assets/index-BarTLmz_.css","/assets/index-C5mjnjXI.js","/assets/key-round-BBLuLp5k.js","/assets/keyboard-rI4K3C20.js","/assets/languages-oUXMkkor.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Cuc1bNDD.js","/assets/lightbulb-Bi1LP37t.js","/assets/link-2-Db061KlN.js","/assets/link-2-off-B0MejW67.js","/assets/list-ordered-0rRWlpxy.js","/assets/list-tree-DBN-OZnL.js","/assets/lock-open-CW3VloB4.js","/assets/log-in-B19FGJic.js","/assets/maximize-2-dN8tUKoK.js","/assets/message-square-Dd-6SpQn.js","/assets/minimize-2-ConABKpw.js","/assets/package-check-CLhKJ7i7.js","/assets/paperclip-DzUaherc.js","/assets/pencil-Df5wKUGz.js","/assets/percent-IvXe-gEB.js","/assets/pin-off-DyrMqHiK.js","/assets/pin-wM7SOc7_.js","/assets/play-b-H0MS_f.js","/assets/plug-zap-D1lHuc-M.js","/assets/presentation-Tdh-_rk3.js","/assets/prop-types-DSmxmE6C.js","/assets/radio-BNmBho7k.js","/assets/react-apexcharts.esm-C1Rda59T.js","/assets/registers-DBrvHr5P.js","/assets/repeat-DBtL-_Rw.js","/assets/rotate-ccw-B-pWeyrQ.js","/assets/rotate-cw-fKCkNIJZ.js","/assets/save-qPW97yWE.js","/assets/scopeLinks-Di3SvRlQ.js","/assets/scroll-text-DA9bBiyc.js","/assets/search-x-B5sZ5u2_.js","/assets/segments-Ca0VhH39.js","/assets/send-DcmGjiYE.js","/assets/settings-2-CwQ2Xbg2.js","/assets/shield-BtyBQSyq.js","/assets/shield-alert-CzNb_ujI.js","/assets/shield-check-4DmQhKNG.js","/assets/shield-question-mark-Fcewg2z3.js","/assets/siren-ixrtvQLb.js","/assets/snowflake-CnaqflpT.js","/assets/split-Cl9Aaezd.js","/assets/square-DHNuJRFg.js","/assets/square-check-big-CRQq6PM8.js","/assets/star-CwBNu9f5.js","/assets/statusBands-D58DorKZ.js","/assets/store-CE_znjkY.js","/assets/table-2-DNVGUBYf.js","/assets/table-properties-BTtafyVC.js","/assets/tag-DXXrfJAw.js","/assets/timer-off-BzEMX_3T.js","/assets/trending-down-aVZZgSAM.js","/assets/trending-up-BrqxSqRp.js","/assets/undo-2-BneK4SY4.js","/assets/useChartTheme-Ils5mzXZ.js","/assets/useElementWidth-DoSlHblD.js","/assets/useIsMobile-D0eT8uIl.js","/assets/useOpenParam-BaoSykC6.js","/assets/useStatusBands-Zhgsymi5.js","/assets/useUrlScope-DM0bVqia.js","/assets/user-0TvtGcIG.js","/assets/user-cog-DShYKx2c.js","/assets/users-BmZE_wQw.js","/assets/vfx-7slKG6j0.js","/assets/video-CKHf_fin.js","/assets/wallet-D7mkA_JM.js","/assets/warehouse-C4Jee04B.js","/assets/x-CZ-yVJCI.js","/assets/zap-CjCQbI8c.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
