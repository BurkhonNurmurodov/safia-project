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

const BUILD = "2026-10-05T05:18:01.621Z";
const PRECACHE = ["/","/assets/AdminPanel-NggjFWTe.js","/assets/AnalysisBoard-BbjOOQD2.js","/assets/Arc--oFVLFaI.js","/assets/ArcLegacy-2780YUow.js","/assets/BrigadirProfile-DCs3Gmzf.js","/assets/BroadcastReceivers-SDJNNkb3.js","/assets/BroadcastRecord-BLxKGBFP.js","/assets/CatLockNotice-CBxTPbkN.js","/assets/CategoryLegendModal-yGOwRwBN.js","/assets/CellConcerns-Du5Guv6L.js","/assets/CellDetails-ChQboa9m.js","/assets/CellFormModal-D8RyvMFi.js","/assets/CellIdent-CtP3-a7_.js","/assets/CellLink-Bhq_RNwS.js","/assets/Cells-CcBheUvF.js","/assets/ColumnFilter-Drs5DIAy.js","/assets/ColumnsPicker-B98TrBjg.js","/assets/CommentsModal-BWrpbxXY.js","/assets/ComparisonTable-CpHjbLLU.js","/assets/Concerns-CCNNg3no.js","/assets/ConfirmDialog-0mATBCBR.js","/assets/Daily-DIERs-5Q.js","/assets/DataTable-3lG0zF-k.js","/assets/DateRangePicker-Tv_oKXpU.js","/assets/DayReportView-WiGtYr4R.js","/assets/DayStepper-XfM9owVm.js","/assets/DifferenceBreakdown-D8VrkmVP.js","/assets/Downtime-CHp7oPUw.js","/assets/Education-Jj1pupfQ.js","/assets/EducationLesson-DCtJGrE9.js","/assets/EmptyState-B3ZMnKDZ.js","/assets/Exam-BpilCunJ.js","/assets/FactorySelect-DIN6qU8g.js","/assets/Gamification-D4SukVKQ.js","/assets/GroupBadge-CoYUlC-y.js","/assets/HeatmapChart-BuGOWP_-.js","/assets/IdleCell-DCDk6v9Z.js","/assets/KPICard-DwQ-isG4.js","/assets/Kaizen-DXafq378.js","/assets/Kelish-B8C8c5qE.js","/assets/KpiDeltaCard-V1ktQAZs.js","/assets/LangTextInput-BcD6qXLm.js","/assets/Layout-BGxIQ6bW.js","/assets/LeaderAppeal-BZApfdZt.js","/assets/LeaderDayReport-CqX_yXfH.js","/assets/LeaderUnitReport-vc76kcPr.js","/assets/Leaderboard-DS2rdz3L.js","/assets/Leaders-B5SwbkEB.js","/assets/Lightbox-BztyRsje.js","/assets/LiveOverview-i83Ru1nD.js","/assets/Login-Bwu57AZY.js","/assets/NotFound-CYZrjKf-.js","/assets/Notifications-BJu14HS0.js","/assets/Overview-Ds0EZz0a.js","/assets/Pagination-2usm6qbD.js","/assets/PerenaladkaFactTable-CxmCN9q8.js","/assets/PersonCard-D5HR-qwV.js","/assets/PlanFulfillment-BE-jGuQv.js","/assets/Production-D1xAqNDX.js","/assets/Profile-EIKobC68.js","/assets/ProofCamera-D6uXcpx3.js","/assets/ProofPhoto-Dhfc4TMU.js","/assets/Quality-Dm8KdfbK.js","/assets/RawRows-0VGU2X0O.js","/assets/RequestStateChip-DTgQ77eW.js","/assets/RichTextEditor-CZNIxyKW.js","/assets/SaveState-D58scYJK.js","/assets/SearchInput-BcXJQuZ0.js","/assets/SeasonalityHeatmap-BXsfKn3u.js","/assets/SegmentedToggle-BZ0kiz9e.js","/assets/SetupTimes-UmQ6_w7K.js","/assets/ShiftDaily-CNRiI8al.js","/assets/Staff-BUnSGLEY.js","/assets/StaffLive-C8yBhkI_.js","/assets/StatusBadge-BOu_jhWH.js","/assets/TargetGoal-Ca2_z5Ab.js","/assets/Targets-CJh0CGSk.js","/assets/Tasks-CEGyRXpm.js","/assets/TimeWheelPicker-cgpJm5XL.js","/assets/Toast-DfUZIhhO.js","/assets/Tooltip-C47hscvb.js","/assets/TrendChart-D9Ps7TXI.js","/assets/TripleSpeedometer-BbnNh2WP.js","/assets/Trudoyomkost-r4DlC7KZ.js","/assets/Turnover-1gqewHbD.js","/assets/UploadDropzone-QPtScRB9.js","/assets/UsersActivity-CTZgUvUa.js","/assets/VerdictBlock-BHRxE_Vw.js","/assets/VfxApiMap-BYDUCLnd.js","/assets/VfxDictionaries-7coACvR3.js","/assets/VfxEmployees-8PVt7pmS.js","/assets/VfxHrMoves-BQf4J6dO.js","/assets/VfxJobs-DCwTVJil.js","/assets/VfxPhoto-BoPRc249.js","/assets/VfxShifts-CzZPVmzO.js","/assets/VfxState-DTDeZNlG.js","/assets/VfxTimebooks-Dd2csksz.js","/assets/VfxTimesheet-DX64oHwz.js","/assets/WatchProgress-B_Ek8Yst.js","/assets/WebLogin-BiASB8dX.js","/assets/WorkerConcerns-BwDxgv0y.js","/assets/Workers-JGYZnHRl.js","/assets/Zagruzka-qzY1AcD1.js","/assets/ZagruzkaCell-DKKhEWAq.js","/assets/api-BuKBtW6M.js","/assets/archive-BKWHdPxH.js","/assets/archive-restore-ogM5qpgq.js","/assets/arrow-down-hzVwdaNy.js","/assets/arrow-left-BFKocNDZ.js","/assets/arrow-up-BSdOt0G1.js","/assets/arrow-up-narrow-wide-DZkKCHfb.js","/assets/arrow-up-right-wGR6iiWg.js","/assets/award-2yq6MRwn.js","/assets/ban-CIIsSId9.js","/assets/book-open-DcJGh7HO.js","/assets/bot-BGfAmryk.js","/assets/boxes-B6T1fxCG.js","/assets/braces-H5jVbj0x.js","/assets/brigadirFilters-BaC_NWd4.js","/assets/broadcastTree-BDikw1bv.js","/assets/building-2-qTpRDKW0.js","/assets/calculator-BOgOKvlZ.js","/assets/calendar-B5pt4mdP.js","/assets/calendar-days-Xn_Qdr_w.js","/assets/camera-CITCODjZ.js","/assets/categories-Gy17qWKM.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-jEzEnfXZ.js","/assets/chart-line-BghEyUmF.js","/assets/chart-pie-DsjIbGpt.js","/assets/chartRange-DQvkM-85.js","/assets/check-check-BQPaq0mj.js","/assets/chevron-left-CJ_GlmCC.js","/assets/chevrons-up-down-DfvVZcYU.js","/assets/circle-DkYQC-11.js","/assets/circle-alert-DDjyOfT1.js","/assets/circle-check-big-wFPHlbjS.js","/assets/circle-dashed-iua79oX9.js","/assets/circle-minus-gmkBh6EN.js","/assets/circle-question-mark-6e0wCFZb.js","/assets/circle-slash-COt60qSr.js","/assets/circle-user-round-DlHd5r-0.js","/assets/clock-3-H5DoiiaJ.js","/assets/cloud-off-DAWkXDCi.js","/assets/cloud-upload-oFvmSpzH.js","/assets/compass-DqMeZDf5.js","/assets/concernCategories-CnoVVzde.js","/assets/copy-C92H92CB.js","/assets/corner-down-right-ChdJfioh.js","/assets/createLucideIcon-CpVarhPS.js","/assets/es-CI06dTq3.js","/assets/exportXlsx-Bz8ZsNEZ.js","/assets/external-link-CUNqt1xH.js","/assets/file-clock-BawOMCqo.js","/assets/file-exclamation-point-BdGjmXr_.js","/assets/file-spreadsheet-KMP-Gnji.js","/assets/file-text-DOU1TWAn.js","/assets/flag-DBSf7RUC.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-B4fb38Fl.js","/assets/hash-_9lYC2Kb.js","/assets/history-GlylMCMx.js","/assets/hourglass-Dk2Pk5bP.js","/assets/image-C0979Pw3.js","/assets/image-off-0EmpOBt5.js","/assets/inbox-hjKh-cqA.js","/assets/index-Bqi_iW-5.css","/assets/index-CTpjcWKs.js","/assets/key-round-D9PtqO1o.js","/assets/keyboard-BaaGqlMl.js","/assets/languages-CACbkoAt.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-wil6YFPb.js","/assets/lightbulb-DGE9hbCR.js","/assets/link-2-CgTOvTbQ.js","/assets/link-2-off-RaIa8cTb.js","/assets/list-ordered-Bcoxiixh.js","/assets/list-tree-BAfsK46t.js","/assets/lock-open-gle2jT45.js","/assets/log-in-DGL8cfTm.js","/assets/maximize-2-D5nxNWzO.js","/assets/message-square-BYl7fH33.js","/assets/minimize-2-BP1cQ0ic.js","/assets/package-check-CD1-10ck.js","/assets/paperclip-CIepUwQe.js","/assets/pencil-DrCCZfq8.js","/assets/percent-CLruqRc8.js","/assets/pin-BQpFZh70.js","/assets/pin-off-DpefZf7O.js","/assets/play-tSeVFWed.js","/assets/plug-zap-CUyFH5dX.js","/assets/presentation-BL-WGYtC.js","/assets/prop-types-DmvNAsiQ.js","/assets/radio-CAh9Ag-i.js","/assets/react-apexcharts.esm-VPGMdpnm.js","/assets/registers-Cxab8bUR.js","/assets/repeat-B8asDH6z.js","/assets/rotate-ccw-BhILMjWN.js","/assets/rotate-cw-B1f3scT2.js","/assets/save-Ci6ZxfFQ.js","/assets/scopeLinks-Bgbl2yMj.js","/assets/scroll-text-BgDBsYD1.js","/assets/search-x-B2dzgO8y.js","/assets/segments-TIB0kZ8i.js","/assets/send-CYxvkYBc.js","/assets/settings-2-DJlWJEfz.js","/assets/shield-DmNmK5Q5.js","/assets/shield-alert-CVjrZ6rY.js","/assets/shield-check-BdF7Ux7q.js","/assets/shield-question-mark-G449DnYF.js","/assets/siren-DUbJ75Ou.js","/assets/snowflake-DL272XmW.js","/assets/split-qHDnq0y-.js","/assets/square-Dok9wJJl.js","/assets/square-check-big-JjWE6pht.js","/assets/star-PC-IAWjP.js","/assets/statusBands-BzlnP71q.js","/assets/store-DeNN12Ko.js","/assets/table-2-BV5csh-h.js","/assets/table-properties-DGlRnUDc.js","/assets/tag-CMqPprrf.js","/assets/timer-off-ohHxAAPE.js","/assets/trending-down-CholegVE.js","/assets/trending-up-BQDlp6P8.js","/assets/undo-2-D4PoYQg1.js","/assets/useChartTheme-jo_Ojzpv.js","/assets/useElementWidth-BuZpS9NE.js","/assets/useIsMobile-X-b2PE4p.js","/assets/useOpenParam-D7Ez4Mkn.js","/assets/useStatusBands-RGrZ8XLE.js","/assets/useUrlScope-CwS9Q8s1.js","/assets/user-F_jLs75r.js","/assets/user-cog-EdB_ykAc.js","/assets/users-DQ-W6Y2C.js","/assets/vfx-DJcgB0u8.js","/assets/video-D77MwZMc.js","/assets/wallet-mbaHsjq7.js","/assets/warehouse-CphItsBX.js","/assets/x-DrGQQ4nD.js","/assets/zap-CDxoHzBY.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
