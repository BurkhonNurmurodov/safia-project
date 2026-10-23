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

const BUILD = "2026-10-23T16:45:32.279Z";
const PRECACHE = ["/","/assets/AdminPanel-B3eWRvCo.js","/assets/AnalysisBoard-CxyTOXgp.js","/assets/Arc-DESjrT2f.js","/assets/Assistant-QH7YHs7M.js","/assets/BrigadirProfile-bWrr3AoX.js","/assets/BroadcastReceivers-UTNtZTl4.js","/assets/BroadcastRecord-B-1JBMmz.js","/assets/Button-CObvULE0.js","/assets/CatLockNotice-j29IVGyg.js","/assets/CategoryLegendModal-CiKZHIhy.js","/assets/CellConcerns-ChKVmJaI.js","/assets/CellDetails-ofES5BEM.js","/assets/CellFormModal-CrDhpkaq.js","/assets/CellIdent-CLK1BtyH.js","/assets/CellLink-D0meQw8Z.js","/assets/Cells-D1xjsg93.js","/assets/ColumnFilter-CubR-GNO.js","/assets/ColumnsPicker-6zdeGVlE.js","/assets/CommentsModal-FIrHty8z.js","/assets/ComparisonTable-1H5F_MIO.js","/assets/Concerns-CTh4aajt.js","/assets/CountStepper-CSo0sPwy.js","/assets/Daily-CXQ5oXJI.js","/assets/DataTable-BcIj4iUu.js","/assets/DateRangePicker-DaR-azp_.js","/assets/DayReportView-CwfYScPP.js","/assets/DayStepper-C9-dados.js","/assets/DayStrip-z0CozHFa.js","/assets/DifferenceBreakdown-DTDWCXJ_.js","/assets/Downtime-Uder8_u1.js","/assets/Education-DzhND6Y9.js","/assets/EducationLesson-C1Xz5GSh.js","/assets/EmptyState-DlCmrL_C.js","/assets/Exam-BsfRb63t.js","/assets/FactorySelect-BpvuyeAY.js","/assets/Gamification-1Bo8v8jc.js","/assets/GroupBadge-C4tR4pFp.js","/assets/HeatmapChart-B_Pm1riy.js","/assets/IdleCell-Bl8_WtWl.js","/assets/KPICard-CT30iChP.js","/assets/Kaizen-BgQe18GK.js","/assets/Kelish-CIIbZA9g.js","/assets/KpiDeltaCard-BvpNtU-t.js","/assets/LangTextInput-CUmKliKJ.js","/assets/Layout-D4C3AuWu.js","/assets/LeaderAppeal-D0xAF4oZ.js","/assets/LeaderDayReport-DaXLepoW.js","/assets/LeaderUnitReport-DBqV52Ko.js","/assets/Leaderboard-DvxvxjVT.js","/assets/Leaders-BqGcLcC8.js","/assets/LeadersKpi-FFB_dagH.js","/assets/Lightbox-DsrJFl_N.js","/assets/LiveOverview-IoZdhlDb.js","/assets/Login-BAgjFFaB.js","/assets/NotFound-C5fWyAcG.js","/assets/Notifications-DJ-VuSn3.js","/assets/Ontime-DUi2-umt.js","/assets/Overview-CIPkuaK4.js","/assets/Pagination-BvXh5oJ_.js","/assets/PerenaladkaFactTable-ZsEeYW_V.js","/assets/PersonCard-pp9eEtii.js","/assets/PlanFulfillment-BwhntXgR.js","/assets/Production-CqmE6cq8.js","/assets/Profile-DOr2JBEV.js","/assets/ProofCamera-BFfuOVNl.js","/assets/ProofPhoto-TQ7NopL1.js","/assets/Quality-Bu_fIzIr.js","/assets/RawRows-C5ZjMumG.js","/assets/RequestStateChip-Cqaaz3jq.js","/assets/RichTextEditor-BbLcV0hf.js","/assets/SaveState-D5_Xt0P8.js","/assets/SearchInput-_8A0EUGl.js","/assets/SeasonalityHeatmap-D-hH8ZiO.js","/assets/SegmentedToggle-HQzQTxe_.js","/assets/SetupTimes-CRnD6ANh.js","/assets/ShiftDaily-QXatau3x.js","/assets/Staff-C84rx3JY.js","/assets/StaffListAtCheck-DixTcVdM.js","/assets/StatusBadge-M7IAiQ2K.js","/assets/StatusBandsModal-cDiNSfX9.js","/assets/TargetGoal-FLZbhv4b.js","/assets/Targets-CNjL4ssC.js","/assets/Tasks-B6JvNc6C.js","/assets/TimeWheelPicker-DZUNGVGx.js","/assets/Toast-BWKzm0Od.js","/assets/Tooltip-BFlAdLdk.js","/assets/TrendChart-UInpew9_.js","/assets/TripleSpeedometer-CAtJrcLW.js","/assets/Trudoyomkost-DAVrnHl4.js","/assets/UploadDropzone-CjlybE6J.js","/assets/UsersActivity-Dapv6MiY.js","/assets/VerdictBlock-DP2eh4Kd.js","/assets/VfxApiMap-CPpEGzfm.js","/assets/VfxDictionaries-DwJzdt_T.js","/assets/VfxEmployees-jk7ws7ks.js","/assets/VfxHrMoves-sgyEcyQE.js","/assets/VfxJobs-CbVY5OHb.js","/assets/VfxPhoto-Dj2TLAhb.js","/assets/VfxShifts-C7rvHW4C.js","/assets/VfxState-2p48LBdo.js","/assets/VfxTimebooks-DX71Vu5r.js","/assets/VfxTimesheet-3luaIIut.js","/assets/WatchProgress-rciLh9No.js","/assets/WebLogin-C7_ukd0e.js","/assets/Workers-CjAw1JGj.js","/assets/Zagruzka-CcOhS0n9.js","/assets/ZagruzkaCell-D4KcOPdO.js","/assets/api-CRjwSF6v.js","/assets/archive-D_srAKCF.js","/assets/archive-restore-CADHzYxL.js","/assets/arrow-down-CEsmzncY.js","/assets/arrow-down-right-DcZapmi5.js","/assets/arrow-down-wide-narrow-CtglU0IY.js","/assets/arrow-up-narrow-wide-BT4YE8gr.js","/assets/ban-B_DcE2tP.js","/assets/boxes-DBju9jce.js","/assets/braces-BUP_aMcF.js","/assets/brigadirFilters-CO4xO3qY.js","/assets/broadcastTree-BK2mOHK2.js","/assets/building-2-DBJ6xIOH.js","/assets/calendar-ROknu41T.js","/assets/calendar-days-6qBcU8-t.js","/assets/camera-7wDlXIDs.js","/assets/categories-GOCTP5bo.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CHw49Rof.js","/assets/chart-line-Bt8oPJwE.js","/assets/chart-pie-CoyvUIFd.js","/assets/chartRange-DOtx7pDE.js","/assets/check-check-zN9VHver.js","/assets/chevron-left-D0dazAbt.js","/assets/chevrons-up-down-Bgq8sXP2.js","/assets/circle-BVjLXpz2.js","/assets/circle-alert-C-KYaFZX.js","/assets/circle-check-big--Em7vj1Q.js","/assets/circle-dashed-CuYE3OEG.js","/assets/circle-minus-DdjSrq_6.js","/assets/circle-question-mark-BGuuJ9kw.js","/assets/circle-slash-ecOHp1GS.js","/assets/circle-user-round-BKlTmugH.js","/assets/cloud-off-nFbvAHIZ.js","/assets/cloud-upload-CpxxIO1F.js","/assets/compass-Dx-VF60P.js","/assets/concernCategories-D3SVl1tt.js","/assets/corner-down-right-BGCrz445.js","/assets/createLucideIcon-DDPEajVK.js","/assets/es-pVfNZA1-.js","/assets/external-link-DI-uT6GS.js","/assets/file-clock-Ce61XLsy.js","/assets/file-exclamation-point-D-4o5kkm.js","/assets/flag-GFwzGqKb.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CbRPmJWt.js","/assets/funnel-jHi0ldGw.js","/assets/hash-Dm_LGloG.js","/assets/hourglass-DkA6v7Ja.js","/assets/image-DqoVdYPX.js","/assets/image-off-ByuTXolS.js","/assets/inbox-DjHSe9qa.js","/assets/index-BGYEQjVT.js","/assets/index-DbWdbTAg.css","/assets/keyboard-D-vlOuiI.js","/assets/languages-D0viGe8G.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BJB1UY2f.js","/assets/leaderBoard-EbYOW0Q_.js","/assets/lightbulb-tkqYYLyJ.js","/assets/link-2-BKzzRJms.js","/assets/link-2-off-Bbx5iwcC.js","/assets/list-ordered-UZDHaD19.js","/assets/list-tree-Cu1XPvnq.js","/assets/lock-open-uKeN7g8D.js","/assets/log-in-jFHF1a1R.js","/assets/map-pin-BdARjwII.js","/assets/marks-Cg5T0zVr.js","/assets/minimize-2-CqI4ze2X.js","/assets/package-check-BpCFtbJB.js","/assets/pencil-D_dk4XHW.js","/assets/percent-C5JjuSHx.js","/assets/pin-Ddli_-4l.js","/assets/pin-off-B4d5N2c-.js","/assets/play-DO6Th_Bd.js","/assets/plug-zap-BQ2vBk5o.js","/assets/prop-types-pucqFF19.js","/assets/radio-Xp2Kj3iD.js","/assets/react-apexcharts.esm-BwMbFIIZ.js","/assets/registers-BQTaxi5q.js","/assets/repeat-DlGlv9DD.js","/assets/save-A6sd1iNF.js","/assets/scopeLinks-D2S8i-ZK.js","/assets/scroll-text-DTSqmA3d.js","/assets/search-x-D1OPc3-s.js","/assets/segments-C2VG2Ji8.js","/assets/send-Bi0Bc8_t.js","/assets/settings-2-D7BA0l31.js","/assets/shield-D2AWxWJf.js","/assets/shield-alert-Gz88LQ9G.js","/assets/shield-question-mark-DzZH8sZz.js","/assets/sigma-CtjWX9HS.js","/assets/siren-CbYPpOIw.js","/assets/snowflake-NVCaH8UI.js","/assets/split-DdXeAKzr.js","/assets/square-check-big-3H_8ySG4.js","/assets/star-C_Y_Sf9L.js","/assets/statusBands-DLKt1lGX.js","/assets/store-IjiAGmkK.js","/assets/table-2-DBeAOpUu.js","/assets/table-properties-CqhqtSM2.js","/assets/tag-ji7JxUgJ.js","/assets/timer-off-DURdYs-A.js","/assets/trendBuckets-jBljyUbS.js","/assets/trending-down-KHhC75yo.js","/assets/trending-up-B85C5Hgk.js","/assets/undo-2-DokOr6gC.js","/assets/useChartTheme-IevNElpG.js","/assets/useElementWidth-CS3j2sx5.js","/assets/useIsMobile-WUCsfQ6c.js","/assets/useOpenParam-B9G6kZri.js","/assets/useStatusBands-CcD3-LyH.js","/assets/useUrlScope-BjB2ckRR.js","/assets/user-a3HYtuOE.js","/assets/user-cog-DRNyRSGq.js","/assets/user-minus-CI4_5cnr.js","/assets/users-BaGZcEB5.js","/assets/vfx-Bolaya7X.js","/assets/video-Di17psSz.js","/assets/wallet-ti2r816u.js","/assets/warehouse-sqd4Hvhv.js","/assets/workflow-tAD7O9fI.js","/assets/x-BUzqN47X.js","/assets/zap-ePULYuVK.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
