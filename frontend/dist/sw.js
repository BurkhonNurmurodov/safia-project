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

const BUILD = "2026-10-04T09:55:29.830Z";
const PRECACHE = ["/","/assets/AdminPanel-BCi14a1Q.js","/assets/AnalysisBoard-CtYOsdDA.js","/assets/Arc-BiaVKezy.js","/assets/ArcLegacy-CNojdYm5.js","/assets/BrigadirProfile-BHtY2KZc.js","/assets/BroadcastReceivers-tbBvfdDM.js","/assets/BroadcastRecord-CyOMAQE2.js","/assets/CatLockNotice-DsRVn151.js","/assets/CategoryLegendModal-ZCaPuxwG.js","/assets/CellConcerns-CTepmknp.js","/assets/CellDetails-DX9NDk9-.js","/assets/CellFormModal-BzZj8jPs.js","/assets/CellIdent-94ApKwvC.js","/assets/CellLink-DDdxyjc1.js","/assets/Cells-Dw4v6wcN.js","/assets/ColumnFilter-7oaJzQoa.js","/assets/ColumnsPicker-wEI5hHdb.js","/assets/CommentsModal-vo6AcRhq.js","/assets/ComparisonTable-B231lC9v.js","/assets/Concerns-oDZd2x7X.js","/assets/ConfirmDialog-B7tL_5zl.js","/assets/Daily-BvdXJ_nI.js","/assets/DataTable-DT-OeMMZ.js","/assets/DateRangePicker-BIaXwR-u.js","/assets/DayReportView-B0b1RVqs.js","/assets/DayStepper-CKx9meN1.js","/assets/DifferenceBreakdown-_PIyYY08.js","/assets/Downtime-DUGhKFTS.js","/assets/Education-DWVtr6UW.js","/assets/EducationLesson-BdTPeP8P.js","/assets/EmptyState-6V2sk2Vz.js","/assets/Exam-hzZTxkfu.js","/assets/FactorySelect-CCNcF8e3.js","/assets/Gamification-DbblD2Nl.js","/assets/GroupBadge-De_kw4UF.js","/assets/HeatmapChart-MQifWCQw.js","/assets/IdleCell-CLT3_4R6.js","/assets/KPICard-Dc3ABbAN.js","/assets/Kaizen-wL-GeiRp.js","/assets/Kelish-Bx2mxlE3.js","/assets/KpiDeltaCard-Cvv-S_YJ.js","/assets/LangTextInput-DSQ_Tjxp.js","/assets/Layout-B6qbOd_W.js","/assets/LeaderAppeal-DPM-T-py.js","/assets/LeaderDayReport-B0Fqoza-.js","/assets/LeaderUnitReport-DJ-NBTO-.js","/assets/Leaderboard-BiLqDlZl.js","/assets/Leaders-BShdbUSV.js","/assets/Lightbox-X0kZUYdS.js","/assets/LiveOverview-C8gN4pFe.js","/assets/Login-CQ6c5P6r.js","/assets/NotFound-DdDkj5Sl.js","/assets/Notifications-Dt2CcbbR.js","/assets/Overview-DLufd35w.js","/assets/Pagination-CyxzNZ2z.js","/assets/PerenaladkaFactTable-BE0PFVc9.js","/assets/PersonCard-CcHf9pWs.js","/assets/PlanFulfillment-DN58PYzm.js","/assets/Production-Dw1J86nh.js","/assets/Profile-Ce_yI1KZ.js","/assets/ProofCamera-ZD6ZS4sE.js","/assets/ProofPhoto-bX9igsU3.js","/assets/Quality-CVkqbK3W.js","/assets/RawRows-CMxF0UOP.js","/assets/RequestStateChip-D8AwbXwG.js","/assets/RichTextEditor-DQSSgXwj.js","/assets/SaveState-DZ1BJ59c.js","/assets/SearchInput-Bi9XM8tA.js","/assets/SeasonalityHeatmap-Aok2w5tm.js","/assets/SegmentedToggle-CEWDXoq9.js","/assets/SetupTimes-DI88ZR0B.js","/assets/ShiftDaily-qfxCspVK.js","/assets/Staff-C3ci0646.js","/assets/StaffLive-CpVuqaTB.js","/assets/StatusBadge-CSXdZ0Uu.js","/assets/TargetGoal-DW7l19Lv.js","/assets/Targets-DSRzhI5p.js","/assets/Tasks-CxiriHfU.js","/assets/TimeWheelPicker-DqvxMh83.js","/assets/Toast-CXIalCy-.js","/assets/Tooltip-sbYmUtoI.js","/assets/TrendChart-DG_K57Uk.js","/assets/TripleSpeedometer-B2QCcVyn.js","/assets/Trudoyomkost-CSWHSDj5.js","/assets/UploadDropzone-e7UH3XWi.js","/assets/UsersActivity-BHFOVb34.js","/assets/VerdictBlock-CugqgI3o.js","/assets/VfxApiMap-BGGSDRIT.js","/assets/VfxDictionaries-DlLEzvlU.js","/assets/VfxEmployees-B1TZ-eWm.js","/assets/VfxHrMoves-DlYWDXSA.js","/assets/VfxJobs-E24lgvsP.js","/assets/VfxPhoto-BbqPG7LC.js","/assets/VfxShifts-DPQSZ6vo.js","/assets/VfxState-CdeofxtB.js","/assets/VfxTimebooks-5D5Vk--t.js","/assets/VfxTimesheet-eV4h9P5z.js","/assets/WatchProgress-BARYO36D.js","/assets/WebLogin-U0P8tzZv.js","/assets/WorkerConcerns-BvkTr8E0.js","/assets/Workers-lFlbD0wH.js","/assets/Zagruzka-ByHgFRD0.js","/assets/ZagruzkaCell-CbgLbYsV.js","/assets/api-CludduQQ.js","/assets/archive-R5dCFOkI.js","/assets/archive-restore-KCUduh9J.js","/assets/arrow-down-U8OUq_bF.js","/assets/arrow-left-H4mn2ska.js","/assets/arrow-up-EQEnj3le.js","/assets/arrow-up-narrow-wide-Dltgbcdu.js","/assets/arrow-up-right--os7avHT.js","/assets/award-BXlfRvrz.js","/assets/ban-BV2NEfC9.js","/assets/bot-86rsRK9z.js","/assets/boxes-D8OXPL_9.js","/assets/braces-C16EMNd2.js","/assets/brigadirFilters-DLq2Rnuz.js","/assets/broadcastTree-DOCAcA2n.js","/assets/building-2-Bn1IV754.js","/assets/calendar-days-BUgLf0YZ.js","/assets/calendar-j7VQxUqW.js","/assets/camera-C1cxVSo1.js","/assets/categories-C02jcYXJ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D7-EDs60.js","/assets/chart-line-CrWSQggp.js","/assets/chart-pie-DX2LrfEt.js","/assets/chartRange-CXOV8uO9.js","/assets/check-check-Ck0xEtrf.js","/assets/chevron-left-Cum0BdvW.js","/assets/chevrons-up-down-CLoqdALY.js","/assets/circle-CzhpwNf2.js","/assets/circle-alert-cWyYFP5v.js","/assets/circle-check-big-CJMs5nXa.js","/assets/circle-dashed-D73mcysS.js","/assets/circle-minus-r56YRXWs.js","/assets/circle-question-mark--mT0spTw.js","/assets/circle-slash-CQzXh1I7.js","/assets/circle-user-round-CbIJlhAu.js","/assets/clock-3-BdJDSnK3.js","/assets/cloud-off-B1SiAXoC.js","/assets/cloud-upload-LprxW_TH.js","/assets/compass-DkCuByRQ.js","/assets/concernCategories-COf_X8PK.js","/assets/copy-DcotvdCF.js","/assets/corner-down-right-BPV7IwYe.js","/assets/createLucideIcon-C_rln7bQ.js","/assets/es-j3QhK9hn.js","/assets/exportXlsx-Djjrc51y.js","/assets/external-link-C06hxshh.js","/assets/file-clock-BKNOqr6w.js","/assets/file-exclamation-point-ByzzTSMd.js","/assets/file-spreadsheet-L8tFGzXL.js","/assets/file-text-DoRlAKp6.js","/assets/flag-C4oOaMCg.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DUQvjpQR.js","/assets/hash-DBeQLlGN.js","/assets/history-DVPJgflM.js","/assets/hourglass-BeSTc6H6.js","/assets/image-DhhiI3uv.js","/assets/image-off-CEU7mN2I.js","/assets/inbox-CV_LZySS.js","/assets/index-BngiOmj1.css","/assets/index-DODDS5TD.js","/assets/key-round-rDbfajxt.js","/assets/keyboard-CtHg1TEE.js","/assets/languages-D57qkwHh.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CVC1RAz2.js","/assets/lightbulb-DjnLFPJM.js","/assets/link-2-E_9M3Nm1.js","/assets/link-2-off-C2ecozOd.js","/assets/list-ordered-DBjOs7yh.js","/assets/list-tree-CiaenWQV.js","/assets/lock-open-DaCZJvPg.js","/assets/log-in-qWe4v7Jh.js","/assets/maximize-2-C4f4Uxv7.js","/assets/message-square-I4K8saGr.js","/assets/minimize-2-CSoMfm-J.js","/assets/package-check-CJoWYbFT.js","/assets/paperclip-Ke_5HEj4.js","/assets/pencil-BEvJY5So.js","/assets/percent-2v3L3K7Q.js","/assets/pin-DVftaQvL.js","/assets/pin-off-CsL3qj2c.js","/assets/play-CYtI7FYA.js","/assets/plug-zap-Nqtmp7vf.js","/assets/presentation-Dv-MLsrq.js","/assets/prop-types-D4Gb1n5F.js","/assets/radio-WrKE18_l.js","/assets/react-apexcharts.esm-w53jyvzy.js","/assets/registers-D7bnMQYu.js","/assets/repeat-BqZCrix5.js","/assets/rotate-ccw-DXbDKfB3.js","/assets/rotate-cw-BVqioTqs.js","/assets/save-Df9lsLy8.js","/assets/scopeLinks-Dbae7Pr8.js","/assets/scroll-text-BtUmX2wm.js","/assets/search-x-ClgjBvaT.js","/assets/segments-hGFRVWh_.js","/assets/send-DhlA8aMn.js","/assets/settings-2-CE0vQDHV.js","/assets/shield-BxoE7dQ6.js","/assets/shield-alert-DPOsnnFo.js","/assets/shield-check-COOGGaRg.js","/assets/shield-question-mark-D_SVWIsH.js","/assets/siren-DJkwPgPx.js","/assets/snowflake-C-rNskXH.js","/assets/split-BNQZQoUK.js","/assets/square-C9FQYFPJ.js","/assets/square-check-big-nuegvW1a.js","/assets/star-rZ_i0D9z.js","/assets/statusBands-CVKMiulm.js","/assets/store-EG2nIvKO.js","/assets/table-2-Ci7mVkFw.js","/assets/table-properties-LdYTrCLD.js","/assets/tag-CugVNcsB.js","/assets/timer-off-D7XgQB2g.js","/assets/trending-down-31dQ_1kf.js","/assets/trending-up-fy39hXXO.js","/assets/undo-2-Dxali_uz.js","/assets/useChartTheme-BOV9CgyV.js","/assets/useElementWidth-ChpfGpqO.js","/assets/useIsMobile-CjJZWcrg.js","/assets/useOpenParam-3fAwzDdy.js","/assets/useStatusBands-CmrRHNTD.js","/assets/useUrlScope-C89u8ATd.js","/assets/user-DtUlMTPZ.js","/assets/user-cog-DRA4ttuR.js","/assets/user-minus-Dvro16WW.js","/assets/users-BiVnDc1k.js","/assets/video-w9P0V2pl.js","/assets/wallet-Cu7jZSjB.js","/assets/warehouse-BbfstChn.js","/assets/x-DEdle5fI.js","/assets/zap-hMMf676l.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
