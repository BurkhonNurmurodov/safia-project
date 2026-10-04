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

const BUILD = "2026-10-04T10:25:40.431Z";
const PRECACHE = ["/","/assets/AdminPanel-COqzBRzv.js","/assets/AnalysisBoard-DcbxEr6y.js","/assets/Arc-4Xt4J08X.js","/assets/ArcLegacy-i3_fdbxn.js","/assets/BrigadirProfile-C7y7f_xJ.js","/assets/BroadcastReceivers-BnNZ1rnn.js","/assets/BroadcastRecord-C6YdBvGh.js","/assets/CatLockNotice-DuwPLmld.js","/assets/CategoryLegendModal-Dqq7e9ui.js","/assets/CellConcerns-CfxKQtDJ.js","/assets/CellDetails-Bku9hoYV.js","/assets/CellFormModal-VrdAdemR.js","/assets/CellIdent-CMPUnbcL.js","/assets/CellLink-D4xm_dTN.js","/assets/Cells-BELofjqj.js","/assets/ColumnFilter-I8X0rP7b.js","/assets/ColumnsPicker-DEU-0ins.js","/assets/CommentsModal-BUYhGc1S.js","/assets/ComparisonTable-BvjhGf2R.js","/assets/Concerns-Dl8vE8SS.js","/assets/ConfirmDialog-DLtbH-Sr.js","/assets/Daily-BCGAl5IA.js","/assets/DataTable-CKX_s60-.js","/assets/DateRangePicker-DOVpwybw.js","/assets/DayReportView-BDi-KItS.js","/assets/DayStepper-De61SI4z.js","/assets/DifferenceBreakdown-CKXvwS5l.js","/assets/Downtime-uihh0wEh.js","/assets/Education-DXaV7nr0.js","/assets/EducationLesson-DQWfks-9.js","/assets/EmptyState-DBRkYGRM.js","/assets/Exam-BiFX8ook.js","/assets/FactorySelect-wrASaxya.js","/assets/Gamification-DhkFyarj.js","/assets/GroupBadge-C6OiJwSv.js","/assets/HeatmapChart-g74CHROW.js","/assets/IdleCell-DmwZzyrC.js","/assets/KPICard-CEiHnGTg.js","/assets/Kaizen-BCkIsH2a.js","/assets/Kelish-N-Y5oZUV.js","/assets/KpiDeltaCard-D_SSLjiJ.js","/assets/LangTextInput-CwGf15dT.js","/assets/Layout-CK3VfdNt.js","/assets/LeaderAppeal-Dw7jMEX6.js","/assets/LeaderDayReport-aFJ7E7f2.js","/assets/LeaderUnitReport-CrD2ratr.js","/assets/Leaderboard-B8MjTPnX.js","/assets/Leaders-BPQCxy4j.js","/assets/Lightbox-KIAom-9g.js","/assets/LiveOverview-C4GMPBiC.js","/assets/Login-BczEMeGk.js","/assets/NotFound-CZA5PWKJ.js","/assets/Notifications-DkAJB5fx.js","/assets/Overview-BJcnTNzP.js","/assets/Pagination-Cts-jHKA.js","/assets/PerenaladkaFactTable-Dzx59hzw.js","/assets/PersonCard-DqqX_IH7.js","/assets/PlanFulfillment-Cn3PWxeC.js","/assets/Production-0pBA_wqX.js","/assets/Profile-DDXO-ikP.js","/assets/ProofCamera-CNkPQ6K4.js","/assets/ProofPhoto-CHa9EIL5.js","/assets/Quality-BzLHB_yx.js","/assets/RawRows-hjLsXWg4.js","/assets/RequestStateChip-Bsu6dIvs.js","/assets/RichTextEditor-PJBeuaoZ.js","/assets/SaveState-zvcu6uj9.js","/assets/SearchInput-Bmzm5uFZ.js","/assets/SeasonalityHeatmap-CzsFs9ey.js","/assets/SegmentedToggle-PBn2Zxgw.js","/assets/SetupTimes-DMKbBms4.js","/assets/ShiftDaily-DJH44j8T.js","/assets/Staff-2FzfC46Y.js","/assets/StaffLive-Djy4aNzw.js","/assets/StatusBadge-_FUouqWs.js","/assets/TargetGoal-BK5-MtcU.js","/assets/Targets-BhWH940u.js","/assets/Tasks-Dga3VVYU.js","/assets/TimeWheelPicker-BMLp7sxo.js","/assets/Toast-B4_JlbLu.js","/assets/Tooltip-C-WdUPv6.js","/assets/TrendChart-qXiDaiJk.js","/assets/TripleSpeedometer-BSXf77bD.js","/assets/Trudoyomkost-McSNUG6e.js","/assets/UploadDropzone-CkpXgqB9.js","/assets/UsersActivity-wTEjO9zy.js","/assets/VerdictBlock-Cis2IGKr.js","/assets/VfxApiMap-0jmv1-ul.js","/assets/VfxDictionaries-k9Ov865I.js","/assets/VfxEmployees-DDX4FYtA.js","/assets/VfxHrMoves-CODycy1r.js","/assets/VfxJobs-2prbwjNm.js","/assets/VfxPhoto-DSSZlCRv.js","/assets/VfxShifts-tep2AmHa.js","/assets/VfxState-C74BEnYA.js","/assets/VfxTimebooks-CxDBo9UF.js","/assets/VfxTimesheet-CjGj7VL9.js","/assets/WatchProgress-DrGzXISh.js","/assets/WebLogin-CmaVwKx9.js","/assets/WorkerConcerns-ntEKDGUO.js","/assets/Workers-U4xA3PWL.js","/assets/Zagruzka-d7COjw5z.js","/assets/ZagruzkaCell-D2L98eiG.js","/assets/api-DVbRAdHH.js","/assets/archive-5uXRPi16.js","/assets/archive-restore-O2gWxKoa.js","/assets/arrow-down-Cff5IeAf.js","/assets/arrow-left-2kuiL4fq.js","/assets/arrow-up-6zTs8Ty-.js","/assets/arrow-up-narrow-wide-2utRFzKX.js","/assets/arrow-up-right-fHmOfE8t.js","/assets/award-VwCgOD3B.js","/assets/ban-Ciume2FG.js","/assets/bot-DKDOFfUt.js","/assets/boxes-Ky44CcVD.js","/assets/braces-BOeqddHX.js","/assets/brigadirFilters-DLUMR-wD.js","/assets/broadcastTree-D2fS6G7N.js","/assets/building-2-eIkT9uSq.js","/assets/calendar-DAcsvpUg.js","/assets/calendar-days-BtEoFTaL.js","/assets/camera-DKlxxujN.js","/assets/categories-hlKjP-HL.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-GVAI1PeP.js","/assets/chart-line-LTdL3sW6.js","/assets/chart-pie-pXYXSWeD.js","/assets/chartRange-YpFIDfr0.js","/assets/check-check-BopsT8mb.js","/assets/chevron-left-Ke6z8QG4.js","/assets/chevrons-up-down-NvULBh-y.js","/assets/circle-Db7cv_SQ.js","/assets/circle-alert-Ci8eqYbi.js","/assets/circle-check-big-CtXjQtp7.js","/assets/circle-dashed-D31bHW6R.js","/assets/circle-minus-BK_SQQ81.js","/assets/circle-question-mark-u_GLQ2C7.js","/assets/circle-slash-FbRAK9r7.js","/assets/circle-user-round-DR1jsiMG.js","/assets/clock-3-De5MuM95.js","/assets/cloud-off-BHdObuc8.js","/assets/cloud-upload-DNzebPrj.js","/assets/compass-C8yFhemx.js","/assets/concernCategories-DmczWw0x.js","/assets/copy-ru9wj-QH.js","/assets/corner-down-right-D-dkFJkL.js","/assets/createLucideIcon-Bdy6cr8P.js","/assets/es-JmtsD-ri.js","/assets/exportXlsx-D4rxwwv2.js","/assets/external-link-DSR2BxXR.js","/assets/file-clock-BLIIkCBR.js","/assets/file-exclamation-point-DYVn556u.js","/assets/file-spreadsheet-Dd7DSVEu.js","/assets/file-text-BGzmQXKu.js","/assets/flag-B93LHcxf.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BXaZXqlJ.js","/assets/hash-Oq0Vplkb.js","/assets/history-BLhe8T1h.js","/assets/hourglass-CGKQu4IB.js","/assets/image-DbbkHer9.js","/assets/image-off-CrSXFm-_.js","/assets/inbox-CkE546ws.js","/assets/index-BngiOmj1.css","/assets/index-DGm3jvTJ.js","/assets/key-round-B959_gyn.js","/assets/keyboard-BHhk9V52.js","/assets/languages-Cz1xOeV0.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-5HC3ImAH.js","/assets/lightbulb-CLqNx6s_.js","/assets/link-2-CqEUsS0i.js","/assets/link-2-off-Bk0fb_EX.js","/assets/list-ordered-CsxNXKyu.js","/assets/list-tree-Dcy27q8W.js","/assets/lock-open-Bc2RWuly.js","/assets/log-in-BygC1Z1W.js","/assets/maximize-2-CwXVLKaf.js","/assets/message-square-BXEFalnH.js","/assets/minimize-2-CQL00bzb.js","/assets/package-check-C1wJw-G6.js","/assets/paperclip-MzpMdaZe.js","/assets/pencil-Cn64xjA9.js","/assets/percent-DZ_SMbGB.js","/assets/pin-DI9AY6Vs.js","/assets/pin-off-qkwOoAt5.js","/assets/play-CGy6-uM7.js","/assets/plug-zap-Bnr4Ij05.js","/assets/presentation-Ctfsttzg.js","/assets/prop-types-4lVeG9o1.js","/assets/radio-Cg6SXkTt.js","/assets/react-apexcharts.esm-CYfJ_v8N.js","/assets/registers--kdTeW6R.js","/assets/repeat-ClN2HOTz.js","/assets/rotate-ccw-ptQDk8LW.js","/assets/rotate-cw-r1mAQQBT.js","/assets/save-DHgyWSqT.js","/assets/scopeLinks-jiDFndKy.js","/assets/scroll-text-BiNz1iLd.js","/assets/search-x-B2o_2XF5.js","/assets/segments-DyML34wQ.js","/assets/send-B799r4my.js","/assets/settings-2-oazsJF7X.js","/assets/shield-V5M6j9WW.js","/assets/shield-alert-CmPPo7uv.js","/assets/shield-check-BzKWWEyg.js","/assets/shield-question-mark-DkNnfs3T.js","/assets/siren-DUl9bRG3.js","/assets/snowflake-C4m8v_07.js","/assets/split-zoJkDKvf.js","/assets/square-CIV7_tH5.js","/assets/square-check-big-BDGnHuds.js","/assets/star-D6V7KTWP.js","/assets/statusBands-IZCbk7zx.js","/assets/store-BrBJD8aT.js","/assets/table-2-C3-vxXwb.js","/assets/table-properties-C7f-Geek.js","/assets/tag-CqQdRVRe.js","/assets/timer-off-DcpZQzak.js","/assets/trending-down-B0pIEyg_.js","/assets/trending-up-DVnAbKdJ.js","/assets/undo-2-FMTT8dzb.js","/assets/useChartTheme-mr3oMN-Z.js","/assets/useElementWidth-D1Lq79sv.js","/assets/useIsMobile-BEQsnd42.js","/assets/useOpenParam-BpqGz5lr.js","/assets/useStatusBands-CljrcBLN.js","/assets/useUrlScope-BFYujfc0.js","/assets/user-ChsxhrYy.js","/assets/user-cog-DAFJo0Ii.js","/assets/user-minus-BDRke2Wa.js","/assets/users-y3s1FBCt.js","/assets/video-C-A6YrNu.js","/assets/wallet-D2545WT-.js","/assets/warehouse-CTxXlzwn.js","/assets/x-DY_nXfVI.js","/assets/zap-gKCsJL8z.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
