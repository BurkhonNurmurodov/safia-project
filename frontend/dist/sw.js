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

const BUILD = "2026-10-07T04:12:36.185Z";
const PRECACHE = ["/","/assets/AdminPanel-BYwFeCGs.js","/assets/AnalysisBoard-Cu21KPvF.js","/assets/Arc-FmYd3OB1.js","/assets/Assistant-BJ8YtzRU.js","/assets/BrigadirProfile-TMBAX7tc.js","/assets/BroadcastReceivers-CzHZ--SI.js","/assets/BroadcastRecord-DJmFTuai.js","/assets/Button-CVp80rHN.js","/assets/CatLockNotice-CgO6i-Vl.js","/assets/CategoryLegendModal-CM3FJwtV.js","/assets/CellConcerns-DWV5dS5i.js","/assets/CellDetails-CLyxctC-.js","/assets/CellFormModal-BtOFif7m.js","/assets/CellIdent-BaojbpCn.js","/assets/CellLink-DxUsjaVz.js","/assets/Cells-Dh5ooqlp.js","/assets/ColumnFilter-Cj41CyN4.js","/assets/ColumnsPicker-Dtvgft-c.js","/assets/CommentsModal-DZODDcnU.js","/assets/ComparisonTable-DgEKbcsr.js","/assets/Concerns-DsKD3s47.js","/assets/Daily-Dw1_5DTN.js","/assets/DataTable-B669SMka.js","/assets/DateRangePicker-D7Hnn_MB.js","/assets/DayReportView-Cixqf-eh.js","/assets/DayStepper-CfKv6rjF.js","/assets/DifferenceBreakdown-DQXkKLoS.js","/assets/Downtime-iJIONNjl.js","/assets/Education-CDn1OBSC.js","/assets/EducationLesson-CwRxpLHK.js","/assets/EmptyState-CXWS2jhr.js","/assets/Exam-DSbOWliT.js","/assets/FactorySelect-Ca7Z092J.js","/assets/Gamification-zhEVEfdo.js","/assets/GroupBadge-BkkFQfNs.js","/assets/HeatmapChart-BtmTX-Bj.js","/assets/IdleCell-Ct3-lhac.js","/assets/KPICard-Co-VqwyY.js","/assets/Kaizen-CCuigodn.js","/assets/Kelish-CE5KZaqx.js","/assets/KpiDeltaCard-B8It3tMv.js","/assets/LangTextInput-C4JbOqpP.js","/assets/Layout-nM2WDBHw.js","/assets/LeaderAppeal-C_W0kQI6.js","/assets/LeaderDayReport-DhemOhrb.js","/assets/LeaderUnitReport-CKcJuDWz.js","/assets/Leaderboard-BDHDKc2-.js","/assets/Leaders-CXOl0rDi.js","/assets/Lightbox-DmS-ypeD.js","/assets/LiveOverview-Cw6kz4lu.js","/assets/Login-BqMGQUZl.js","/assets/NotFound-CDUUvFwi.js","/assets/Notifications-BDkNDOSk.js","/assets/Overview-CneRfak3.js","/assets/Pagination-2-R7NwQ0.js","/assets/PerenaladkaFactTable-d-pOcagH.js","/assets/PersonCard-XkbtHIaV.js","/assets/PlanFulfillment-CR78IP0N.js","/assets/Production-BRHigrZn.js","/assets/Profile-oyJ0HELg.js","/assets/ProofCamera-CFnHVhv2.js","/assets/ProofPhoto-CLL2OAiS.js","/assets/Quality-trsh1oCl.js","/assets/RawRows-BVuemiR0.js","/assets/RequestStateChip-GYCIEUh8.js","/assets/RichTextEditor-BbVIoPVI.js","/assets/SaveState-B3N0Fkgy.js","/assets/SearchInput-vIixId1R.js","/assets/SeasonalityHeatmap-C7moyhZV.js","/assets/SegmentedToggle-CwCZDErb.js","/assets/SetupTimes-CCLJMlt_.js","/assets/ShiftDaily-C4LRJpYv.js","/assets/Staff-BxHzQGs7.js","/assets/StatusBadge-BiO1NYO8.js","/assets/TargetGoal-Yctxz2Ny.js","/assets/Targets-DexBOG4D.js","/assets/Tasks-DwlBsu6s.js","/assets/TimeWheelPicker-DmF-xDk1.js","/assets/Toast-DPQ_2Zni.js","/assets/Tooltip-DlPf0G5U.js","/assets/TrendChart-C6b0Amm0.js","/assets/TripleSpeedometer-Cr7oNn8Z.js","/assets/Trudoyomkost-DCAQ3Uwt.js","/assets/Turnover-1byzyy5Z.js","/assets/UploadDropzone-D3RScYe9.js","/assets/UsersActivity-6UJjoX1k.js","/assets/VerdictBlock-6cXdeFR-.js","/assets/VfxApiMap-IZQEWZBE.js","/assets/VfxDictionaries-DG92zkqg.js","/assets/VfxEmployees-CdoUyeYO.js","/assets/VfxHrMoves-CogRzPg9.js","/assets/VfxJobs-BAvP4c_g.js","/assets/VfxPhoto-vpTRFHS0.js","/assets/VfxShifts-D5eNq1CQ.js","/assets/VfxState-DFjWQs9k.js","/assets/VfxTimebooks-DljS_rsu.js","/assets/VfxTimesheet-De9_ZVP5.js","/assets/WatchProgress-CXIb2OMP.js","/assets/WebLogin-PNbs8ufI.js","/assets/WorkerConcerns-D5wpgYcE.js","/assets/Workers-CDZoeXAe.js","/assets/Zagruzka-DYSiLk-w.js","/assets/ZagruzkaCell-Cwm97DT8.js","/assets/api-D-aF16P6.js","/assets/archive-Bi3SobHG.js","/assets/archive-restore-BvVVujjz.js","/assets/arrow-down-DVzZ2hzp.js","/assets/arrow-up-narrow-wide-CwP9TTTR.js","/assets/award-q23FDATT.js","/assets/ban-D48Hy1L4.js","/assets/boxes-D3x3bv9O.js","/assets/braces-DVkTVPeV.js","/assets/brigadirFilters-3F9BeDhP.js","/assets/broadcastTree-BIQ3iJ9G.js","/assets/building-2-CeZHU_YX.js","/assets/calculator-DQfZBzVR.js","/assets/calendar-CQtJDXzM.js","/assets/calendar-days-opaUXmI1.js","/assets/camera-DET5Qma1.js","/assets/categories-BsvR9UbQ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-zW5x4pm2.js","/assets/chart-line-ByFGZZVR.js","/assets/chart-pie-B6xVLcTw.js","/assets/chartRange-qcQyWmId.js","/assets/check-check-Bt-gQDkU.js","/assets/chevron-left-n9POkaaD.js","/assets/chevrons-up-down-jcx5JKCD.js","/assets/circle-XsABdRCS.js","/assets/circle-alert-Cg0Z1Xp1.js","/assets/circle-check-big-sN5Sixk8.js","/assets/circle-dashed-CQfrVv9u.js","/assets/circle-minus-DpV_kTdo.js","/assets/circle-question-mark-BRu8uhHN.js","/assets/circle-slash-CQiwQoxW.js","/assets/circle-user-round-DA36Q8q5.js","/assets/clock-3-CqpN9zHx.js","/assets/cloud-off-BBuyrjYu.js","/assets/cloud-upload-BoaINUhb.js","/assets/compass-CwtkgKFH.js","/assets/concernCategories-RPzEfZpF.js","/assets/copy-CRnguFzf.js","/assets/corner-down-right-CKtbTSOz.js","/assets/createLucideIcon-C12zp_4w.js","/assets/es-BjJ7ZVnA.js","/assets/external-link-D7Ez1vOK.js","/assets/file-clock-BMP8qEJe.js","/assets/file-exclamation-point-jiKVz-J_.js","/assets/flag-Ddjs12tf.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DEkv_JWg.js","/assets/hash-BsCVOgVS.js","/assets/hourglass-BwJUfT1Q.js","/assets/image-off-CeKEnC7n.js","/assets/image-yPHZKtMg.js","/assets/inbox-BvAwDQRc.js","/assets/index-B7yzqq84.css","/assets/index-BHfMKrPQ.js","/assets/keyboard-BT0Fw7eH.js","/assets/languages-CsXbDD0O.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-UnLtdUe3.js","/assets/lightbulb-DPH_Qyd-.js","/assets/link-2-D2jf03z_.js","/assets/link-2-off-BGmei4eY.js","/assets/list-ordered-BRxjblv8.js","/assets/list-tree-B-OqlFY3.js","/assets/lock-open-BzXFJn1D.js","/assets/log-in-8cl_JjI8.js","/assets/minimize-2-BtfLc3Fc.js","/assets/package-check-CA7M5cUr.js","/assets/pencil-BrAfBnMT.js","/assets/percent-D973E1uw.js","/assets/pin-D7yeUlrW.js","/assets/pin-off-DQ4pCLcw.js","/assets/play-CmAtDnhW.js","/assets/plug-zap-CTBpCnpg.js","/assets/prop-types-Ch2zMFYw.js","/assets/radio-DGKdrPq4.js","/assets/react-apexcharts.esm-D-bzkH7N.js","/assets/registers-DU0HlINW.js","/assets/repeat-CRWuijcI.js","/assets/save-B7GQTL2b.js","/assets/scopeLinks-BQAVjQ3e.js","/assets/scroll-text-BGk-uxee.js","/assets/search-x-sozFsBwA.js","/assets/segments-DKwGMNvI.js","/assets/send-BUoO84o8.js","/assets/settings-2-LBsS6O9W.js","/assets/shield-alert-Bk_2nLbd.js","/assets/shield-fnsgOWUn.js","/assets/shield-question-mark-DludXZGK.js","/assets/siren-WftusZjs.js","/assets/snowflake-DGnYQjCQ.js","/assets/split-Crx0J_ex.js","/assets/square-check-big-NnmYGG9T.js","/assets/star-B09OIj6I.js","/assets/statusBands-D3ADN5mz.js","/assets/store-CEhnLK_9.js","/assets/table-2-jvZ0SYCt.js","/assets/table-properties-N5Eng4y-.js","/assets/tag-fzDonN2i.js","/assets/timer-off-CLX7YV9-.js","/assets/trending-down-Cq0mFqqy.js","/assets/trending-up-BYFrkZGF.js","/assets/undo-2-DH7Ic9Xi.js","/assets/useChartTheme-DOQJDVDn.js","/assets/useElementWidth-mulKGkjx.js","/assets/useIsMobile-QJ10uthW.js","/assets/useOpenParam-B67wEPyh.js","/assets/useStatusBands-CdySuhIs.js","/assets/useUrlScope-CTB6ANGz.js","/assets/user-cog-f_u0Cw5B.js","/assets/user-pWX2gpFJ.js","/assets/users-DOcU2qxP.js","/assets/vfx-H8639uu3.js","/assets/video-DY4sHpDp.js","/assets/wallet-C2744afU.js","/assets/warehouse-BA0kp4g1.js","/assets/x-Cn628yCn.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
