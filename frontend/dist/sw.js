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

const BUILD = "2026-10-30T06:53:30.524Z";
const PRECACHE = ["/","/assets/AdminPanel-Bu_hdNTz.js","/assets/AnalysisBoard-DK6NzAmb.js","/assets/Arc-C5_mAlkK.js","/assets/Assistant-0U3cbj6y.js","/assets/BrigadirProfile-DizTgoON.js","/assets/BroadcastReceivers-B2dKuH1v.js","/assets/BroadcastRecord-CLtEm6o3.js","/assets/Button-yeLcz2df.js","/assets/CatLockNotice-b71GIB4t.js","/assets/CategoryLegendModal-CB1DAaOq.js","/assets/CellConcerns-Bfyig-EU.js","/assets/CellDetails-y_1LzjH9.js","/assets/CellFormModal-BtoCvIzr.js","/assets/CellIdent-CjakrtNX.js","/assets/CellLink-Be3cFtBn.js","/assets/Cells-DukMS-FN.js","/assets/ColumnFilter-RltlIfAe.js","/assets/ColumnsPicker-CxZH79Is.js","/assets/CommentsModal-BVaU5nh-.js","/assets/ComparisonTable-CS8EZmQc.js","/assets/Concerns-BrXjLtFX.js","/assets/CountStepper-C2tb2qME.js","/assets/Daily-BZdD8V2f.js","/assets/DataTable-GKhYDaYh.js","/assets/DateRangePicker-D0ZE7-77.js","/assets/DayReportView-BKYzlxTz.js","/assets/DayStepper-CYR2OUgy.js","/assets/DayStrip-DIcSuqwm.js","/assets/DifferenceBreakdown-CeI6A4Tj.js","/assets/Downtime-60-mV30_.js","/assets/Education-2JWs5KJM.js","/assets/EducationLesson-BuisVyyU.js","/assets/EmptyState-BnLYT-xh.js","/assets/Exam-g4FFecfx.js","/assets/FactorySelect-D9jUMEC9.js","/assets/Gamification-34hwRlzm.js","/assets/GroupBadge-BI1qx0Iq.js","/assets/HeatmapChart-D76hfvXE.js","/assets/IdleCell-D7mI8uVE.js","/assets/KPICard-CH8hYXkJ.js","/assets/Kaizen-DLPg_i5n.js","/assets/Kelish-BuJS2eAW.js","/assets/KpiDeltaCard-BGIJB3bX.js","/assets/LangTextInput-Cd87NkqN.js","/assets/Layout-CeMr3aO8.js","/assets/LeaderAppeal-WQ5a1ScK.js","/assets/LeaderDayReport-5cj26ID0.js","/assets/LeaderUnitReport-BTZzalLv.js","/assets/Leaderboard-DnM6GkMi.js","/assets/Leaders-Bstd0VZb.js","/assets/LeadersKpi-C0lBdhQr.js","/assets/Lightbox-CBgaW86p.js","/assets/LiveOverview-VQDbIS7t.js","/assets/Login-BbIz39Ad.js","/assets/NotFound-C4jzehby.js","/assets/Notifications-1HJKYn3K.js","/assets/Ontime-DNuusoU0.js","/assets/Overview-B9R5UkQe.js","/assets/Pagination-DkebZwTi.js","/assets/PerenaladkaFactTable-DVBmaPMO.js","/assets/PersonCard-DlSvT6Xk.js","/assets/PlanFulfillment-C0UIaCat.js","/assets/Production-WtH4kkq8.js","/assets/Profile-DZpfKBh0.js","/assets/ProofCamera-DckBLKrJ.js","/assets/ProofPhoto-Cd4X4UUt.js","/assets/Quality-Cj_VEzSY.js","/assets/RawRows-q-BC_wYD.js","/assets/Reports-BE7ZcCWO.js","/assets/RequestStateChip-DzvSff6L.js","/assets/RichTextEditor-DLhLm4tk.js","/assets/SaveState-DLrYwvF8.js","/assets/SearchInput-D68nl2yQ.js","/assets/SeasonalityHeatmap-CQOWD_vX.js","/assets/SegmentedToggle-D1cJltsd.js","/assets/SetupTimes-B10r6DdE.js","/assets/ShiftDaily-BObfTwcA.js","/assets/Staff-eQnjKo8N.js","/assets/StaffListAtCheck-BTAdn_xM.js","/assets/StatusBadge-Ba6VE7wf.js","/assets/StatusBandsModal-vmVy19Ya.js","/assets/TargetGoal-DiH61nVB.js","/assets/Targets-ko9onCFb.js","/assets/Tasks-BVJtbA4w.js","/assets/TimeWheelPicker--6DcTOqu.js","/assets/Toast-CKOp1DHf.js","/assets/Tooltip-DccxW7lq.js","/assets/TrendChart-DKPhsXtM.js","/assets/TripleSpeedometer-kgvjDyb4.js","/assets/Trudoyomkost-Oxkfzkpf.js","/assets/UploadDropzone-D7xEMSKd.js","/assets/UsersActivity-CR9fFojS.js","/assets/VerdictBlock-DWpIOklO.js","/assets/VfxApiMap-Ck4_5_xJ.js","/assets/VfxDictionaries-BLnqkZCT.js","/assets/VfxEmployees-LShOKTFc.js","/assets/VfxHrMoves-BHgtNn0i.js","/assets/VfxJobs-Cziw8rob.js","/assets/VfxPhoto-IGh4kRdM.js","/assets/VfxShifts-CNLOLEvj.js","/assets/VfxState-X1xIhuQ9.js","/assets/VfxTimebooks-Cv44pFXA.js","/assets/VfxTimesheet-jBtuajGU.js","/assets/WatchProgress-vvEf0IH9.js","/assets/WebLogin-CDvKCGu6.js","/assets/Workers-81iKrfn4.js","/assets/Zagruzka-C_JzayEa.js","/assets/ZagruzkaCell-L9BONlCE.js","/assets/api-BFm7MSgf.js","/assets/archive-DWoy7mkn.js","/assets/archive-restore-Yf6-7Xn-.js","/assets/arrow-down-D0wAs-Un.js","/assets/arrow-down-right-bNYaQpl2.js","/assets/arrow-down-wide-narrow-B3I5HT2v.js","/assets/arrow-up-narrow-wide-DhfxQxHh.js","/assets/ban-NWWdPzIl.js","/assets/boxes-D4m-GMm5.js","/assets/braces-DeduIF3S.js","/assets/brigadirFilters-zZqPv6in.js","/assets/broadcastTree-fZAhcf3L.js","/assets/building-2-8Ivj6gbs.js","/assets/calendar-DYQqEn8Y.js","/assets/calendar-days-tMb0i95r.js","/assets/camera-BN9wG6x1.js","/assets/categories-CeClvIOk.js","/assets/cellMoveRefusal-L9w7XBtU.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Dn1SP_TN.js","/assets/chart-line-COJuLko7.js","/assets/chart-pie-CaYUmrtB.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-C9htVVIz.js","/assets/chevron-left-YVBqB3XI.js","/assets/chevrons-up-down-zadBUNN3.js","/assets/circle-DbDORzZq.js","/assets/circle-alert-C_QBqKse.js","/assets/circle-check-big-C1HFNAhd.js","/assets/circle-dashed-B2yW1lMC.js","/assets/circle-minus-DZQvJdzV.js","/assets/circle-question-mark-s8QdQ4LC.js","/assets/circle-slash-EpeSxRQS.js","/assets/circle-user-round-RMkyZNlZ.js","/assets/cloud-off-CIjRul-S.js","/assets/cloud-upload-B-_UH35d.js","/assets/coins-CaEMBeqk.js","/assets/compass-BCNtBkMe.js","/assets/concernCategories-j4kS4rI5.js","/assets/corner-down-right-Cdj5zGEX.js","/assets/createLucideIcon-HTmmWGn_.js","/assets/en-BNQQeZpg.js","/assets/es-Dtgc5NM1.js","/assets/external-link-BOYCQZ-O.js","/assets/file-clock-DFFNR_Kj.js","/assets/file-exclamation-point-BnBXDRMl.js","/assets/flag-VKMkClqN.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-v2jEZoMx.js","/assets/funnel-2dWa9z6o.js","/assets/hash-10GLfo5m.js","/assets/hourglass-DydSh6IA.js","/assets/idleTime-CHPnJRpw.js","/assets/image-D_NIEb7N.js","/assets/image-off-CAkakxsa.js","/assets/inbox-DTHBoMMT.js","/assets/index-BQq4kKEm.js","/assets/index-BtYmuUYW.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-B5rVN0Uo.js","/assets/languages-7lerY72g.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Bti3APMf.js","/assets/leaderBoard-b91TY8Ct.js","/assets/lightbulb-CXTmlgGL.js","/assets/link-2-Dy7aizNO.js","/assets/link-2-off-14n53DOW.js","/assets/list-ordered-DOpriKa4.js","/assets/list-tree-CLkHr0Y2.js","/assets/lock-open-TK3RzYNf.js","/assets/log-in-B_LTjlXY.js","/assets/map-pin-DqybBSgY.js","/assets/marks-BEgT_3rh.js","/assets/minimize-2-c3uR1vvk.js","/assets/package-check-Bb29K9ou.js","/assets/pencil-C4yx9Qwh.js","/assets/percent-9p3j-h-m.js","/assets/pin-BWIbhiD9.js","/assets/pin-off-DLXqQ8gt.js","/assets/play-BYN9kOss.js","/assets/plug-zap-DbIFAnyT.js","/assets/prop-types-RD3fbola.js","/assets/radio-CFX_JFRJ.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-B5ySn2y7.js","/assets/repeat-4kHfYlk9.js","/assets/ru-CNv0HBkB.js","/assets/save-CPRoPMZc.js","/assets/scopeLinks-CoTXbtuZ.js","/assets/scroll-text-CZS2iLbi.js","/assets/search-x-Buncr1HN.js","/assets/segments-D5Uiedtv.js","/assets/send-2JXnqLje.js","/assets/settings-2-DiC1CzSX.js","/assets/shield-Bt6ehcdB.js","/assets/shield-alert-8QGWQup3.js","/assets/shield-question-mark-BFnSBjYr.js","/assets/sigma-V3ph3nrH.js","/assets/siren-DRxqzekB.js","/assets/snowflake-CRZCHVbG.js","/assets/split-BJ73kM8j.js","/assets/square-check-big-Bcr9-Y9T.js","/assets/star-BUCOe5xd.js","/assets/statusBands-DVBZcBq3.js","/assets/store-CNDCaw_V.js","/assets/table-2-DLJsaubf.js","/assets/table-properties-BESEzkO1.js","/assets/tag-IUVYddla.js","/assets/timer-off-BmzvnLZW.js","/assets/translations-C1gsmzFQ.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-tHGvowlX.js","/assets/trending-up-6hxBNa2D.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-DTvoG3Xb.js","/assets/useChartTheme-DO_is0hV.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-ByRI0XCN.js","/assets/useStatusBands-BEm-5H5W.js","/assets/useUrlScope-CKW5reoD.js","/assets/user-CGqqd34o.js","/assets/user-cog-C361EDR7.js","/assets/user-minus-B442AYul.js","/assets/users-BwLou4R8.js","/assets/uz-DaeTwIqy.js","/assets/uz_cyrl-Cm-soCFY.js","/assets/vfx-BpwwFa3k.js","/assets/video-CUX9J8b-.js","/assets/wallet-ChMMN1lH.js","/assets/warehouse-CjMiHQ1t.js","/assets/workflow-Dy7K8vV2.js","/assets/x-CnH9NJDd.js","/assets/zap-Dy8UFR9G.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
