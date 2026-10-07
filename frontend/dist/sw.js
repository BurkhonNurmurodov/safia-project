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

const BUILD = "2026-10-07T14:49:35.850Z";
const PRECACHE = ["/","/assets/AdminPanel-C2j5rKeH.js","/assets/AnalysisBoard-Dz_6qHjq.js","/assets/Arc--WL77LKN.js","/assets/Assistant-B03I1_WE.js","/assets/BrigadirProfile-4Bc5s3O2.js","/assets/BroadcastReceivers-Cj9QLz-Z.js","/assets/BroadcastRecord-BK8RA_fO.js","/assets/Button-B5IhWGJ-.js","/assets/CatLockNotice-DcD5nE4p.js","/assets/CategoryLegendModal-SdmQhflz.js","/assets/CellConcerns-dUT11wGj.js","/assets/CellDetails-D8QtAYCF.js","/assets/CellFormModal-DD-JhE_m.js","/assets/CellIdent-B6zWtLbU.js","/assets/CellLink-DkfCuFw-.js","/assets/Cells-LkjqGQoE.js","/assets/ColumnFilter-C4l9cMtA.js","/assets/ColumnsPicker-Cj4NdpDi.js","/assets/CommentsModal-Dv4DH5l0.js","/assets/ComparisonTable-CEMVnLf5.js","/assets/Concerns-DWDec7mO.js","/assets/Daily-Brwpdpz0.js","/assets/DataTable-BT7A3r_l.js","/assets/DateRangePicker-DwLLH8Ds.js","/assets/DayReportView-nI4TDM_k.js","/assets/DayStepper-b75zoaBk.js","/assets/DifferenceBreakdown-Dw3cIPOY.js","/assets/Downtime-C7llwHVQ.js","/assets/Education-0hh5EBC4.js","/assets/EducationLesson-DI3hrZmP.js","/assets/EmptyState-DhURKS5T.js","/assets/Exam-C2AXi1zy.js","/assets/FactorySelect-7kWwVHjx.js","/assets/Gamification-B-zw2O81.js","/assets/GroupBadge-9JaPXQ9d.js","/assets/HeatmapChart-PTzKa2kO.js","/assets/IdleCell-DI6zGDqZ.js","/assets/KPICard-A4b3LsLG.js","/assets/Kaizen-BL9Dw2bO.js","/assets/Kelish-a4e2iQhW.js","/assets/KpiDeltaCard-DfMpU6-w.js","/assets/LangTextInput-UalvTj63.js","/assets/Layout-D8ccnvPb.js","/assets/LeaderAppeal-BqjvGQUD.js","/assets/LeaderDayReport-B5yOAFHu.js","/assets/LeaderUnitReport-CGB42V-R.js","/assets/Leaderboard-Dadg0HOG.js","/assets/Leaders-CqzLL3Mt.js","/assets/Lightbox-DqeGkoe1.js","/assets/LiveOverview-C-rABJ6r.js","/assets/Login-D2qv8Mz1.js","/assets/NotFound-X_kWSZky.js","/assets/Notifications-pfotU8K9.js","/assets/Overview-C3V5v7jY.js","/assets/Pagination-CT2-Fnug.js","/assets/PerenaladkaFactTable-BCc6mTs5.js","/assets/PersonCard-BVPgbYEJ.js","/assets/PlanFulfillment-DX5DkyEH.js","/assets/Production-R3Cjph1R.js","/assets/Profile-Dhwhvk6h.js","/assets/ProofCamera-C0OcsCnb.js","/assets/ProofPhoto-DJVQ95eL.js","/assets/Quality-BjZ7oXiK.js","/assets/RawRows-XXXnSfBj.js","/assets/RequestStateChip-yaNa4pe_.js","/assets/RichTextEditor-D1AxJAIP.js","/assets/SaveState-Bs8s1T6o.js","/assets/SearchInput-cWi0kfSo.js","/assets/SeasonalityHeatmap-B-zj_xlv.js","/assets/SegmentedToggle-D8xo3RXB.js","/assets/SetupTimes-D6SzStwR.js","/assets/ShiftDaily-Sbonrfpf.js","/assets/Staff-46Srf0vs.js","/assets/StatusBadge-C5_OFnR4.js","/assets/TargetGoal-CvVCa8zP.js","/assets/Targets-WmFhvmcf.js","/assets/Tasks-BvnlWrKp.js","/assets/TimeWheelPicker-CdUL48mS.js","/assets/Toast-CYi7ASyz.js","/assets/Tooltip-BzfBBjXb.js","/assets/TrendChart-B8rODm6e.js","/assets/TripleSpeedometer-DdA3S1IZ.js","/assets/Trudoyomkost-B4xTekQO.js","/assets/Turnover-CmL9K5G6.js","/assets/UploadDropzone-DYwBPtR5.js","/assets/UsersActivity-L5zQRlbb.js","/assets/VerdictBlock-BA-2I_c1.js","/assets/VfxApiMap-gGvBuiTC.js","/assets/VfxDictionaries-gJnHIaLX.js","/assets/VfxEmployees-CjK41afu.js","/assets/VfxHrMoves-DErySN0w.js","/assets/VfxJobs-B5C4_644.js","/assets/VfxPhoto-BW1ct3Fu.js","/assets/VfxShifts-DUP4-ODq.js","/assets/VfxState-_hTpnO-4.js","/assets/VfxTimebooks-C54dBHqA.js","/assets/VfxTimesheet-CIDc9p3E.js","/assets/WatchProgress-Df2uCHhZ.js","/assets/WebLogin-BRcrvm16.js","/assets/WorkerConcerns-BiPKAL7g.js","/assets/Workers-CganA4o6.js","/assets/Zagruzka-D6R2DqaC.js","/assets/ZagruzkaCell-Ds8qLuZv.js","/assets/api-DPbDyEl8.js","/assets/archive-lyWfewxl.js","/assets/archive-restore-Cy-p3jN2.js","/assets/arrow-down-Bk1G0wBP.js","/assets/arrow-up-narrow-wide-B4oA9AQM.js","/assets/award-Kk4B-dGG.js","/assets/ban-CxNDKSnN.js","/assets/boxes-CLTDSXvX.js","/assets/braces-D6ss5WZt.js","/assets/brigadirFilters-CQh365wk.js","/assets/broadcastTree-CbilfkRW.js","/assets/building-2-B33xGIV9.js","/assets/calculator-DrWl0MPk.js","/assets/calendar-CTv3pmyg.js","/assets/calendar-days-89IoqqUk.js","/assets/camera-DChI1cR-.js","/assets/categories-DXjhzwoS.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-ByzUpiqo.js","/assets/chart-line-Cz1Eez2d.js","/assets/chart-pie-BsW7O6CK.js","/assets/chartRange-Csx6Sh2n.js","/assets/check-check-DWfc3Xwp.js","/assets/chevron-left-C1MEaowF.js","/assets/chevrons-up-down-B1HDLoAq.js","/assets/circle-DMifc6O1.js","/assets/circle-alert-CvI5Uoqd.js","/assets/circle-check-big-C_R_Wa77.js","/assets/circle-dashed-BhuQmLM5.js","/assets/circle-minus-BY0VK2pZ.js","/assets/circle-question-mark-BjB93nkE.js","/assets/circle-slash-AcnwZ7_z.js","/assets/circle-user-round-DA9dOfdy.js","/assets/clock-3-CyhcNH7u.js","/assets/cloud-off-BItcrvw4.js","/assets/cloud-upload-CMfACX98.js","/assets/compass-D6qGWoDo.js","/assets/concernCategories-Cq3AlYNT.js","/assets/copy-GM6WRp4V.js","/assets/corner-down-right-BSXztcXQ.js","/assets/createLucideIcon-d7YM_0nJ.js","/assets/es-CbqNyyJP.js","/assets/external-link-C6FCKbpE.js","/assets/file-clock-iigqs7GJ.js","/assets/file-exclamation-point-ZWC1rXHF.js","/assets/flag-DEAuekdg.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-B8DQX5Cx.js","/assets/hash-TJ81Lfu6.js","/assets/hourglass-Lev9B7ly.js","/assets/image-DUXUf1F5.js","/assets/image-off-CPXRZ9YB.js","/assets/inbox-BWMip3SM.js","/assets/index-B7yzqq84.css","/assets/index-CPPon0yf.js","/assets/keyboard-BC1AuDxy.js","/assets/languages-RxMJXcZy.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Y0diixj2.js","/assets/lightbulb-DDPyBon8.js","/assets/link-2-BEny2Mwi.js","/assets/link-2-off-DNciN5ZB.js","/assets/list-ordered-XPhzd9EL.js","/assets/list-tree-Bar6Eu0I.js","/assets/lock-open-CbSoMPTn.js","/assets/log-in-CBkExAkS.js","/assets/minimize-2-HnYQaWik.js","/assets/package-check-65Bj6F37.js","/assets/pencil-SVHUMsDf.js","/assets/percent-GeIjrmBx.js","/assets/pin-ZlxHfqIA.js","/assets/pin-off-C3k8RbuK.js","/assets/play-D9MOm4Zp.js","/assets/plug-zap-Dj8TXUlr.js","/assets/prop-types-C-fS29Dg.js","/assets/radio-CCXoTTUy.js","/assets/react-apexcharts.esm-BGsx3IuH.js","/assets/registers-DtACtznT.js","/assets/repeat-BqLrO_LP.js","/assets/save-2JNHBS61.js","/assets/scopeLinks-C9ICvGmc.js","/assets/scroll-text-BDLiwW3f.js","/assets/search-x-Dt1hc2tg.js","/assets/segments-D7a68gZU.js","/assets/send-BP8BJELC.js","/assets/settings-2--OVySZVI.js","/assets/shield-CXTsr_RD.js","/assets/shield-alert-D_57br7F.js","/assets/shield-question-mark-ChvAOqba.js","/assets/siren-DNd0WTnD.js","/assets/snowflake--_xdcSWn.js","/assets/split-Cx3tRlQ-.js","/assets/square-check-big-DonjeKZ-.js","/assets/star-DXi3w0sE.js","/assets/statusBands-CRuky0c2.js","/assets/store-CcvonOlG.js","/assets/table-2-C6pxuLW-.js","/assets/table-properties-dP6xIywH.js","/assets/tag-CW8cIYo_.js","/assets/timer-off-BHP8WZEr.js","/assets/trending-down-C1qeu8PJ.js","/assets/trending-up-DbPHw7bv.js","/assets/undo-2-DTu7cDJm.js","/assets/useChartTheme-Bf6Vx-iC.js","/assets/useElementWidth-BBZUzM_T.js","/assets/useIsMobile-B-MwutYL.js","/assets/useOpenParam-6Oge2k9S.js","/assets/useStatusBands-DHeMST4P.js","/assets/useUrlScope-LU9VPe1W.js","/assets/user-CE_ZsZd_.js","/assets/user-cog-TV3J3cqQ.js","/assets/users-CvHdY2dI.js","/assets/vfx-B0Eb4BvP.js","/assets/video-Bha9AJlS.js","/assets/wallet-BdHvjWY_.js","/assets/warehouse-Dgv1W0vS.js","/assets/x-DQ4mdcx2.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
