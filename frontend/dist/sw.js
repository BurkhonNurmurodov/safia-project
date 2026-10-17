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

const BUILD = "2026-10-17T13:07:23.461Z";
const PRECACHE = ["/","/assets/AdminPanel-CHg_ayrR.js","/assets/AnalysisBoard-BxGK7cWn.js","/assets/Arc-B5p2kSkB.js","/assets/Assistant-Uq27BOmQ.js","/assets/BrigadirProfile-DrNZchzD.js","/assets/BroadcastReceivers-CfZqmaKQ.js","/assets/BroadcastRecord-DmnQzBk9.js","/assets/Button-CVE20VA5.js","/assets/CatLockNotice-D-bpzjwD.js","/assets/CategoryLegendModal-Ca8LKbMU.js","/assets/CellConcerns-BWWXMajp.js","/assets/CellDetails-UlXA-_AA.js","/assets/CellFormModal-DY_xKOfY.js","/assets/CellIdent-D_1Snvlu.js","/assets/CellLink-C9ehoLWS.js","/assets/Cells-CnnOMszF.js","/assets/ColumnFilter-BBtlmE4K.js","/assets/ColumnsPicker-DOV1Qgwm.js","/assets/CommentsModal-CQnhIxE5.js","/assets/ComparisonTable-BRAmazlC.js","/assets/Concerns-BPjp8r_E.js","/assets/CountStepper-DKci_Mzs.js","/assets/Daily-BPahf5F-.js","/assets/DataTable-zkc4UnnE.js","/assets/DateRangePicker-D6S3YTJ7.js","/assets/DayReportView-CCkVGa1f.js","/assets/DayStepper-CiUO3ZRz.js","/assets/DifferenceBreakdown-CRqGJW8w.js","/assets/Downtime-BEsqoAFY.js","/assets/Education-6ujR7duc.js","/assets/EducationLesson-DG9vpWDg.js","/assets/EmptyState-D4hfn7FP.js","/assets/Exam-Bh_ldWi-.js","/assets/FactorySelect-Cj3__a73.js","/assets/ForeignObjects-DCSs1tES.js","/assets/Gamification-uKSJaIeg.js","/assets/GroupBadge-gLABMokJ.js","/assets/HeatmapChart-DfEysZej.js","/assets/IdleCell-CZPjT_sq.js","/assets/KPICard-LTPZukOb.js","/assets/Kaizen-ChtROvcG.js","/assets/Kelish-CXhGfMKs.js","/assets/KpiDeltaCard-DDKnJu4X.js","/assets/LangTextInput-CpQMgb57.js","/assets/Layout-B8sMeltQ.js","/assets/LeaderAppeal-D-SGUuMy.js","/assets/LeaderDayReport-BeUphs4I.js","/assets/LeaderUnitReport-MT0yztyV.js","/assets/Leaderboard-D_GnnKZY.js","/assets/Leaders-CgYecs-8.js","/assets/Lightbox-CAOMMan5.js","/assets/LiveOverview-BaFx9YuZ.js","/assets/Login-B3bwov9f.js","/assets/NotFound-BBLJwveE.js","/assets/Notifications-shqz8GBt.js","/assets/Overview-DGreDaiA.js","/assets/Pagination-DsOysPLz.js","/assets/PerenaladkaFactTable-B2lM34fR.js","/assets/PersonCard-9D2r1cAE.js","/assets/PlanFulfillment-CN1g2pTD.js","/assets/Production-BILT6huV.js","/assets/Profile-DG_PJVFh.js","/assets/ProofCamera-BmNQ1hq9.js","/assets/Quality-CwwZgZVI.js","/assets/RawRows-C9dfUzSH.js","/assets/RequestStateChip-BCYdwKa7.js","/assets/RichTextEditor-0Qg7T8YI.js","/assets/SaveState-CR7v-Qk9.js","/assets/SearchInput-CNg63BmA.js","/assets/SeasonalityHeatmap-BT3PTSCe.js","/assets/SegmentedToggle-CkzxTZgU.js","/assets/SetupTimes-ChKoLpww.js","/assets/ShiftDaily-C5UKG-D-.js","/assets/Staff-D74ylFtO.js","/assets/StaffListAtCheck-IfERZhE0.js","/assets/StatusBadge-5OdioA76.js","/assets/TargetGoal-CBFY7zww.js","/assets/Targets-CQ882fMb.js","/assets/Tasks-D41OhgPO.js","/assets/TimeWheelPicker-B4xy6aWq.js","/assets/Toast-C4C5EAru.js","/assets/Tooltip-LDfevnHj.js","/assets/TrendChart-ChosboyX.js","/assets/TripleSpeedometer-BX5tvi7i.js","/assets/Trudoyomkost-WGXxnod_.js","/assets/Turnover-CnOsMcmE.js","/assets/TurnoverBits-BzQn73Eh.js","/assets/UploadDropzone-CPtF0YIU.js","/assets/UsersActivity-BRnTPV6_.js","/assets/VerdictBlock-BOd0ptCd.js","/assets/VfxApiMap-ycrupeDy.js","/assets/VfxDictionaries-DD7kYZOc.js","/assets/VfxEmployees-DXSmE-5v.js","/assets/VfxHrMoves-wwLQywtV.js","/assets/VfxJobs-Bak3b_O2.js","/assets/VfxPhoto-ZNR_3Tu3.js","/assets/VfxShifts-qx5nozeH.js","/assets/VfxState-D68lUaVd.js","/assets/VfxTimebooks-CzaMLmVh.js","/assets/VfxTimesheet-D4PMJO6y.js","/assets/WatchProgress-D34WqW9Q.js","/assets/WebLogin-BqAxlvNQ.js","/assets/WorkerConcerns-B6O6Cm2z.js","/assets/Workers-Div3ocvL.js","/assets/Zagruzka-jlSwfxGX.js","/assets/ZagruzkaCell-Lb7kLJMv.js","/assets/api-bGeBDuhZ.js","/assets/archive-ahumsg6e.js","/assets/archive-restore-BYa7pQTV.js","/assets/arrow-down-BMxCnh0k.js","/assets/arrow-down-wide-narrow-BTGVXHu5.js","/assets/arrow-up-narrow-wide-CTvE3bhM.js","/assets/award-CJRNpr7-.js","/assets/ban-DIMIkHY2.js","/assets/boxes-BIgWNXaQ.js","/assets/braces-CPZnsAz4.js","/assets/brigadirFilters-CcF-6PMi.js","/assets/broadcastTree-BEzfg3Qm.js","/assets/building-2-gEfR4LTR.js","/assets/calculator-xU4l3Qap.js","/assets/calendar-DP0mJI0r.js","/assets/calendar-days-B8hvMw4G.js","/assets/camera-BgFxTMaa.js","/assets/categories-M33aS2z8.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BU13JF56.js","/assets/chart-line-DvFv4fgC.js","/assets/chart-pie-Dkpb8I_y.js","/assets/chartRange-DtNn0gWc.js","/assets/check-check-CcVchzxL.js","/assets/chevron-left-_aGDYKf8.js","/assets/chevrons-up-down-C7c0zG_N.js","/assets/circle-DDXryIZg.js","/assets/circle-alert-DwKTWDfs.js","/assets/circle-check-big-B-caaEfR.js","/assets/circle-dashed-DQ38GYRB.js","/assets/circle-minus-DxGLViw-.js","/assets/circle-question-mark-D0-mrcP9.js","/assets/circle-slash-DylFfCQY.js","/assets/circle-user-round-8_RVm7Cd.js","/assets/cloud-off-DiWZ_fCr.js","/assets/cloud-upload-CRRolfpL.js","/assets/compass-DKm5wIGj.js","/assets/concernCategories-BrDnALNI.js","/assets/corner-down-right-IuNZijYx.js","/assets/createLucideIcon-CIU4sd98.js","/assets/es-DZxfyVlH.js","/assets/external-link-CRtr0TKX.js","/assets/file-clock-ClVUOdOQ.js","/assets/file-exclamation-point-DogZ-l_g.js","/assets/flag-7pC0LP7h.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DwHolyXF.js","/assets/hash-C1bJGYyt.js","/assets/hourglass-L5INB61G.js","/assets/image-Dg0Yi8bl.js","/assets/image-off-CTfkYDfB.js","/assets/inbox-DKDJhro3.js","/assets/index-ByhNoNK_.css","/assets/index-DuW5BoSN.js","/assets/keyboard-C2itXGSn.js","/assets/languages-BGGFGasT.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Dnc4byOf.js","/assets/lightbulb-DKpIGefB.js","/assets/link-2-DdQo20QQ.js","/assets/link-2-off-iJXWLH1s.js","/assets/list-ordered-CsOE9Qkq.js","/assets/list-tree-Lp16YmqQ.js","/assets/lock-open-BVpWMCTh.js","/assets/log-in-BYTnvh-Y.js","/assets/marks-C6vLI-8S.js","/assets/minimize-2-CnscljAk.js","/assets/package-check-_LFLUPy2.js","/assets/pencil-DEYYaSi_.js","/assets/percent-Be3B_h5k.js","/assets/pin-BBkcW-kY.js","/assets/pin-off-G9mXuVh9.js","/assets/play-C2Gzj6if.js","/assets/plug-zap-CK5_9lpq.js","/assets/prop-types-DwgxJA-E.js","/assets/radio-C19E8iU1.js","/assets/react-apexcharts.esm-Y_t-EVBv.js","/assets/registers-CGfH4aUB.js","/assets/repeat-2HRhf9Xe.js","/assets/save-CBz-5DGR.js","/assets/scopeLinks-CUhkjY0F.js","/assets/scroll-text-DjfJ1a1V.js","/assets/search-x-BZM7Unhv.js","/assets/segments-Df6fqtvV.js","/assets/send-B7ytbKV9.js","/assets/settings-2-B-HqWN8g.js","/assets/shield-Czk-pBVG.js","/assets/shield-alert-BK95KZps.js","/assets/shield-question-mark-B887iuvc.js","/assets/siren-CtwJJjrh.js","/assets/snowflake-DvL0Urjd.js","/assets/split-B7Ny4oNA.js","/assets/square-check-big-CAmnNT49.js","/assets/star-8yRJMCRU.js","/assets/statusBands-tOVQQnsd.js","/assets/store-C2hdO06k.js","/assets/table-2-DAFpjdWn.js","/assets/table-properties-BvldDp1v.js","/assets/tag-C6-wFQVU.js","/assets/timer-off-BDmUA31S.js","/assets/trending-down-BfOiD48n.js","/assets/trending-up-CUmb8A6Q.js","/assets/undo-2-Wil70wrR.js","/assets/useChartTheme-DwLZwIdi.js","/assets/useElementWidth-DwWFnWAL.js","/assets/useIsMobile-DtiLD-hf.js","/assets/useOpenParam-B_d87xs1.js","/assets/useStatusBands-wY_ifYic.js","/assets/useUrlScope-qI5lkk1P.js","/assets/user-CGMbpzFh.js","/assets/user-cog-BrzXVDgU.js","/assets/users-AHa4GVSS.js","/assets/vfx-0pJyCKLm.js","/assets/video-qyTg0i-Z.js","/assets/wallet-DpnFugc9.js","/assets/warehouse-CNgrg2fI.js","/assets/workflow-DDl7PLzG.js","/assets/x-iTonWhZh.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
