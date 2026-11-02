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

const BUILD = "2026-11-02T12:53:57.531Z";
const PRECACHE = ["/","/assets/AdminPanel-_g3m-9h_.js","/assets/AnalysisBoard-tqIWurwF.js","/assets/Arc-CWJipuX-.js","/assets/Assessment-DSDNypSb.js","/assets/AssessmentGrade-BhNIyETh.js","/assets/AssessmentList-CCxZLseO.js","/assets/Assistant-D1T51YUq.js","/assets/BrigadirProfile-CbNzo-HW.js","/assets/BrigadirsKpi-MpO5j60A.js","/assets/BroadcastReceivers-DSTz--Sv.js","/assets/BroadcastRecord-BZ04bndC.js","/assets/Button-CN9fbfc2.js","/assets/CatLockNotice-BrX8V_ki.js","/assets/CategoryLegendModal-BkuKux5n.js","/assets/CellConcerns-Bz6gYWjV.js","/assets/CellDetails-0hM3j0bk.js","/assets/CellFormModal-DB5Jczjm.js","/assets/CellIdent-fZSpxeDY.js","/assets/CellLink-B_3DgIda.js","/assets/Cells-BT1v9TpS.js","/assets/ColumnFilter-Bwa_ee_4.js","/assets/ColumnsPicker-D66Az1--.js","/assets/CommentsModal-CpQp9WYG.js","/assets/ComparisonTable-CCMCdOkT.js","/assets/Concerns-D6H0e29X.js","/assets/ConcernsPieces-CwW0DuIz.js","/assets/CountStepper-CZ8NqLfx.js","/assets/Daily-BN5rkE56.js","/assets/DataTable-D5UYTtKr.js","/assets/DateRangePicker-DVz8XfUx.js","/assets/DayReportView-mJwsHuo-.js","/assets/DayStepper-h5ZaS-8R.js","/assets/DayStrip-D9I_82PU.js","/assets/DifferenceBreakdown-3l9cNzHp.js","/assets/Downtime-CakInhKV.js","/assets/Education-1Z5kaVRi.js","/assets/EducationLesson-CroY0KCQ.js","/assets/EmptyState-B34qpa6x.js","/assets/Exam-CQSrPuJI.js","/assets/FactorySelect-DVZAdU-h.js","/assets/Gamification-gHO95gdT.js","/assets/HeatmapChart-BU2xOL3J.js","/assets/IdleCell-O3IdTSlI.js","/assets/KPICard-Ci_H2Pum.js","/assets/Kaizen-SKAJZpmp.js","/assets/Kelish-DYNdpuvz.js","/assets/KpiBits-CPLQ8QMT.js","/assets/KpiDeltaCard-I1luHcNH.js","/assets/LangTextInput-CmwwtO5P.js","/assets/Layout-CGfUQlDV.js","/assets/LeaderAppeal-DuqQHzQu.js","/assets/LeaderDayReport-DIUKMRb6.js","/assets/LeaderUnitReport-t8HG0WJ6.js","/assets/Leaderboard-CRt4I7cY.js","/assets/Leaders-DLLFoG02.js","/assets/LeadersKpi-Cfbdef2A.js","/assets/Lightbox-Bfrh-sLR.js","/assets/LiveOverview-CcC0n92E.js","/assets/Login-Dqkc8pXt.js","/assets/NotFound-CE-L-3Ug.js","/assets/Notifications-w_Obv76s.js","/assets/NotionTasks-Du2ewSUH.js","/assets/Ontime-YoPe9FTd.js","/assets/Overview-DB7M9hOz.js","/assets/Pagination-TG9bnwoL.js","/assets/People-BzTgBfUP.js","/assets/PerenaladkaFactTable-DBrBvsPi.js","/assets/PersonCard-BylhykSP.js","/assets/PlanFulfillment-BoAg7aZQ.js","/assets/Production-CoVyB8au.js","/assets/Profile-tEjcdmFP.js","/assets/ProofCamera-C8Seg3Bd.js","/assets/ProofPhoto-BSVWRq53.js","/assets/Quality-B87WLdLn.js","/assets/RawRows-AyafQyg3.js","/assets/Reports-DwM81gm_.js","/assets/RequestStateChip-iWEFMw79.js","/assets/RichTextEditor-CsZdO7Zm.js","/assets/SaveState-BTeEHFO1.js","/assets/SearchInput-DPtr94LG.js","/assets/SeasonalityHeatmap-Cn_DkWR8.js","/assets/SegmentedToggle-1umETs0-.js","/assets/SetupTimes-BuypP63D.js","/assets/ShiftDaily-BHuVm2Rr.js","/assets/Staff-0fQZhQLt.js","/assets/StaffListAtCheck-BQNouY4l.js","/assets/StatusBadge-DmIdp6pf.js","/assets/StatusBandsModal-CzEUV6uv.js","/assets/TargetGoal-B3CgjoAL.js","/assets/Targets-DNG1YoTw.js","/assets/Tasks-Cw9PRmoa.js","/assets/TimeWheelPicker-DPvN-nSZ.js","/assets/Toast-cbLmo4s0.js","/assets/Tooltip-DSCsazSH.js","/assets/TrelloAnalytics-DN9hPB5R.js","/assets/TrendChart-SfVH338Z.js","/assets/TripleSpeedometer-CK2F2-bf.js","/assets/Trudoyomkost-sqMpAn8B.js","/assets/UploadDropzone-C8D1Ejom.js","/assets/UsersActivity-Bx1xMSEm.js","/assets/VerdictBlock-DKap6_Lu.js","/assets/VfxApiMap-DHSyBgiV.js","/assets/VfxDictionaries-Bb6fmU7M.js","/assets/VfxEmployees-DWhTtvr8.js","/assets/VfxHrMoves-BFYlAnm9.js","/assets/VfxJobs-BQs3J4yW.js","/assets/VfxPhoto-DgFa4yoJ.js","/assets/VfxShifts-CAVsHd_X.js","/assets/VfxState-CPBD-w7B.js","/assets/VfxTimebooks-8wcxLMXk.js","/assets/VfxTimesheet-U4mFG-Hs.js","/assets/WatchProgress-Cm9SVhcA.js","/assets/WebLogin-BQ3heocl.js","/assets/Workers-BZzKGxph.js","/assets/Zagruzka-DXT32ABV.js","/assets/ZagruzkaCell-C2kuPrQO.js","/assets/api-BFm7MSgf.js","/assets/archive-CUSTJ8Ii.js","/assets/archive-restore-_2QN1byv.js","/assets/arrow-down-ASneiGVL.js","/assets/arrow-down-right-DfPYGS4_.js","/assets/arrow-down-wide-narrow-CNQmrUNi.js","/assets/arrow-up-narrow-wide-Voc70nCv.js","/assets/ban-veJ9eueJ.js","/assets/book-check-C5yMYLU-.js","/assets/boxes-rj-Bsq0A.js","/assets/braces-E8kiJgHW.js","/assets/brigadirFilters--KPyCpVy.js","/assets/broadcastTree-CrD48oyk.js","/assets/calendar-B3ugUGBM.js","/assets/calendar-days-CDvISqoQ.js","/assets/calendar-x-2-BSx8RxuW.js","/assets/camera-d4TE_xr9.js","/assets/categories-lKLmaWL6.js","/assets/cellMoveRefusal-euUXMSXY.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BUH6SYxo.js","/assets/chart-line-3mplcV15.js","/assets/chart-pie-2Sqw1gyG.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-CM78FHQH.js","/assets/chevron-left-CtxLruWJ.js","/assets/chevrons-up-down-BoA_2RKG.js","/assets/circle-C6yg2lBJ.js","/assets/circle-alert-CUeAH9rC.js","/assets/circle-check-big-CIlf6M3q.js","/assets/circle-dashed-BCaWSvep.js","/assets/circle-minus-Tow6HFA_.js","/assets/circle-question-mark-CN3Mk4dg.js","/assets/circle-user-round-Dhc_-3RA.js","/assets/cloud-off-DopihJ2I.js","/assets/cloud-upload-1LOT6rof.js","/assets/coins-BBKOHF8k.js","/assets/compass-CXU9gSqQ.js","/assets/concernCategories-DOWz0g5w.js","/assets/corner-down-right-BhAIQtTx.js","/assets/createLucideIcon-BJVRFHOu.js","/assets/en-DYqRNGUx.js","/assets/es-Dtgc5NM1.js","/assets/external-link-DaemCpU8.js","/assets/file-exclamation-point-D24W1an7.js","/assets/flag-BI69mtXv.js","/assets/folder-tree-7KkzimHd.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DdwHGBam.js","/assets/funnel-CY7mpYCg.js","/assets/grip-vertical-yKDOC22C.js","/assets/hard-hat-FQHJA7lC.js","/assets/hash-Djr82fid.js","/assets/hourglass-rZ8g_RJM.js","/assets/idleTime-CHPnJRpw.js","/assets/image-CI5VfkED.js","/assets/image-off-CPDA3Wdu.js","/assets/inbox-rXdUXtFo.js","/assets/index-3gH7kHJk.css","/assets/index-CjdbNMES.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-foQoWZw8.js","/assets/layers-C8mh_HnO.js","/assets/leaderBoard-B3y-aup6.js","/assets/lightbulb-tkv9-_Io.js","/assets/link-2-DfBusqT6.js","/assets/link-2-off-BdpHMkwx.js","/assets/list-ordered-atleIe-m.js","/assets/list-tree-yX9wtf6h.js","/assets/lock-open-DAbU4gn3.js","/assets/log-in-DxJKFgu1.js","/assets/map-pin-DmYO5Tgx.js","/assets/marks-DQJgs7Iu.js","/assets/message-square-text-ChmI1iVm.js","/assets/minimize-2-DiT5wsJL.js","/assets/notionUtil--ikt_HFk.js","/assets/package-C8rtm7Gl.js","/assets/package-check-B5NP_7v3.js","/assets/pencil-DFyqZ1MR.js","/assets/percent-CR44CCTT.js","/assets/pin-glyDa8_F.js","/assets/pin-off-Ds5aaM5B.js","/assets/play-DKj2LTnj.js","/assets/plug-zap-DZU4isSl.js","/assets/prop-types-RD3fbola.js","/assets/radio-Cycpelga.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-CtixG39U.js","/assets/repeat-ECApHahN.js","/assets/ru-BkG8KlLU.js","/assets/save-CfmGyADj.js","/assets/scopeLinks-BOiTJC8-.js","/assets/search-x-CrXXU-kI.js","/assets/segments-D5Uiedtv.js","/assets/send-DFUMTeEO.js","/assets/shield-BaRK-Sbt.js","/assets/shield-alert-CIo-twe_.js","/assets/sigma-KQ9nrmnO.js","/assets/siren-CfTOTwyD.js","/assets/snowflake-DEoCd_do.js","/assets/split-BK-jilHB.js","/assets/square-check-big-tqLqoNSF.js","/assets/star-CVBFtKrL.js","/assets/statusBands-DVBZcBq3.js","/assets/store-BUAbWbAV.js","/assets/sunrise-DkAuI3Ky.js","/assets/table-2-Ba2qz-cQ.js","/assets/table-properties-DfiVkhSE.js","/assets/tag-DKRpa-px.js","/assets/timer-off-BdoNNUrS.js","/assets/translations-DxjglKl4.js","/assets/trelloUtil-HUlqfmCT.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-AICjvd8t.js","/assets/trending-up-BCps1Uo_.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-BCH5T3AH.js","/assets/useChartTheme-BDZpeLwc.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-DCAa92xH.js","/assets/useStatusBands-C21xcXkL.js","/assets/useUrlScope-Dz1tv6Wr.js","/assets/user-DypcJ3xm.js","/assets/user-cog-D2dxeK-S.js","/assets/uz-DzSlLK6O.js","/assets/uz_cyrl-BIkZ-8pq.js","/assets/vfx-Bh6UnLgo.js","/assets/video-TZ3vvT9u.js","/assets/wallet-BPxGCug1.js","/assets/warehouse-Bm093q7G.js","/assets/workflow-DA32nxfs.js","/assets/x-D6SX7FVb.js","/assets/zap-DgjpkODw.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
