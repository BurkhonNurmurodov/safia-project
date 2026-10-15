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

const BUILD = "2026-10-15T04:50:14.036Z";
const PRECACHE = ["/","/assets/AdminPanel-CZgSX38b.js","/assets/AnalysisBoard-eFrMtU9x.js","/assets/Arc-im7_cXqA.js","/assets/Assistant-o3sAt-rx.js","/assets/BrigadirProfile-Cpp5tY1S.js","/assets/BroadcastReceivers-DPo64mow.js","/assets/BroadcastRecord-6Xj0uu0w.js","/assets/Button-D-5J2y5X.js","/assets/CatLockNotice-BBPjvXMd.js","/assets/CategoryLegendModal-CWbZTn1O.js","/assets/CellConcerns-BQGwFCFr.js","/assets/CellDetails-DSQKdVgO.js","/assets/CellFormModal-BIDtEwow.js","/assets/CellIdent-D4qxxaYM.js","/assets/CellLink-CN7W2Ac8.js","/assets/Cells-C7-NRVHG.js","/assets/ColumnFilter-DBwkC6w-.js","/assets/ColumnsPicker-BPgAALso.js","/assets/CommentsModal-CgtLvsBf.js","/assets/ComparisonTable-Ln2jxoiL.js","/assets/Concerns-X2I2w95z.js","/assets/CountStepper-BiJ-l4rn.js","/assets/Daily-C5koAQR-.js","/assets/DataTable-BNi7WaOa.js","/assets/DateRangePicker-CHrRteg4.js","/assets/DayReportView-KBjqhVH1.js","/assets/DayStepper-DmVGC0Fv.js","/assets/DifferenceBreakdown-CD3Fxh2B.js","/assets/Downtime-BYy0cw-a.js","/assets/Education-m_jUI51P.js","/assets/EducationLesson-CVmb7jWo.js","/assets/EmptyState-DS_ISfzr.js","/assets/Exam-DRg5yoGx.js","/assets/FactorySelect-CGv7P4Zk.js","/assets/Gamification-BNA7tF6J.js","/assets/GroupBadge-kO3Ge4E7.js","/assets/HeatmapChart-CNR7yXP5.js","/assets/IdleCell-CcHVRThq.js","/assets/KPICard-Cr_mR7fH.js","/assets/Kaizen-BpoaC_ej.js","/assets/Kelish-BDAfFpFW.js","/assets/KpiDeltaCard-BYIUojcd.js","/assets/LangTextInput-BFRnTAEk.js","/assets/Layout-rx6YIeo8.js","/assets/LeaderAppeal-DpYnMP82.js","/assets/LeaderDayReport-m4GbfGzj.js","/assets/LeaderUnitReport-COFHfeAl.js","/assets/Leaderboard-BPtpA2mN.js","/assets/Leaders-Dyz3poS8.js","/assets/Lightbox-BmREHk63.js","/assets/LiveOverview-CXKBYeGz.js","/assets/Login-D0FXb8SM.js","/assets/NotFound-CZPWJPCO.js","/assets/Notifications-Bs39gDXE.js","/assets/Overview-DUT6n6Mu.js","/assets/Pagination-D8IEUJxc.js","/assets/PerenaladkaFactTable-CT5z5PKG.js","/assets/PersonCard-T0_ZsfZN.js","/assets/PlanFulfillment-QdCz6poM.js","/assets/Production-DakRkjBX.js","/assets/Profile-BJgn8YTn.js","/assets/ProofCamera-1K0e5Jdk.js","/assets/Quality-B1QacwAo.js","/assets/RawRows-CDji_zRh.js","/assets/RequestStateChip-qU6Yd0tk.js","/assets/RichTextEditor-CDiRDDcg.js","/assets/SaveState-BuCS2RrG.js","/assets/SearchInput-BCgnQin-.js","/assets/SeasonalityHeatmap-D41XUw1d.js","/assets/SegmentedToggle-DbGfpuSq.js","/assets/SetupTimes-el5ABGo7.js","/assets/ShiftDaily-Cg2jg3DM.js","/assets/Staff-52uApVB4.js","/assets/StaffListAtCheck-BiFgEWUY.js","/assets/StatusBadge-C4J2l-Q2.js","/assets/TargetGoal-CJGoTycK.js","/assets/Targets-mjUpuwcL.js","/assets/Tasks-COuSGfB2.js","/assets/TimeWheelPicker-Brb7KX_a.js","/assets/Toast-B-_bPYDN.js","/assets/Tooltip-DxQUgmaq.js","/assets/TrendChart-BSpRP6nt.js","/assets/TripleSpeedometer-DPc5Zloc.js","/assets/Trudoyomkost-By-cKlEN.js","/assets/Turnover-CzWO0XFs.js","/assets/UploadDropzone-DZl7cG_E.js","/assets/UsersActivity-BTHMflnP.js","/assets/VerdictBlock-BzMmIZyd.js","/assets/VfxApiMap-D8ebzKvP.js","/assets/VfxDictionaries-BAp1QVvP.js","/assets/VfxEmployees-B0V3i_nn.js","/assets/VfxHrMoves-KCuDaxbG.js","/assets/VfxJobs-Dz3Kndvj.js","/assets/VfxPhoto-fseGU1wn.js","/assets/VfxShifts-BlLxsjuI.js","/assets/VfxState-DfiDW2J_.js","/assets/VfxTimebooks-CT8z0Kjz.js","/assets/VfxTimesheet-BkBT2Bsa.js","/assets/WatchProgress-Nkog7-93.js","/assets/WebLogin-5ad5ddAk.js","/assets/WorkerConcerns-BbaZcF09.js","/assets/Workers-DmdEslp0.js","/assets/Zagruzka-BhYTJ7e2.js","/assets/ZagruzkaCell-DawnoFQR.js","/assets/api-Bz7jcsmc.js","/assets/archive-HP2BW24D.js","/assets/archive-restore-Cr_xUpJh.js","/assets/arrow-down-CxlNZl0b.js","/assets/arrow-down-wide-narrow-BA1zn0eK.js","/assets/arrow-up-narrow-wide-ewwPgWtZ.js","/assets/award-DPMtITTt.js","/assets/ban-Cn0a9lGj.js","/assets/boxes-BspAbm3T.js","/assets/braces-o5TPS8Rh.js","/assets/brigadirFilters-Cj5dds9S.js","/assets/broadcastTree-CuMkOD-3.js","/assets/building-2-TwlGxZPh.js","/assets/calculator-C4bQGld4.js","/assets/calendar-0EbTSNtf.js","/assets/calendar-days-CaiqTD1N.js","/assets/camera-DwBT1WfO.js","/assets/categories-DfY96-4Z.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CfwkowDF.js","/assets/chart-line-lOL6ID6O.js","/assets/chart-pie-D7HTu22u.js","/assets/chartRange-CGq8ugqu.js","/assets/check-check-kxas2ZjP.js","/assets/chevron-left-Cw0sHeh9.js","/assets/chevrons-up-down-BU88bR1z.js","/assets/circle-CM37rctO.js","/assets/circle-alert-DwCqwFBR.js","/assets/circle-check-big-FC2LHk3q.js","/assets/circle-dashed-GeUdOETR.js","/assets/circle-minus-BQtLl32x.js","/assets/circle-question-mark-BhlHDf3U.js","/assets/circle-slash-CucC9IPp.js","/assets/circle-user-round-B48KMq8n.js","/assets/clock-3-D8gW-7ag.js","/assets/cloud-off-D-0Pu87h.js","/assets/cloud-upload-DcaN-NN0.js","/assets/compass-767TUfEg.js","/assets/concernCategories-vwZiA2xD.js","/assets/copy-DEU1HS2e.js","/assets/corner-down-right-Cr7kdkV0.js","/assets/createLucideIcon-DR-fOsQ6.js","/assets/es-D1om-fTw.js","/assets/external-link-Dr5U2wvk.js","/assets/file-clock-DA4x4z_o.js","/assets/file-exclamation-point-BVXDDDW1.js","/assets/flag-4BYIWJZ1.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DMttZjo-.js","/assets/hash-Br4zp-go.js","/assets/hourglass-BXPUV1vy.js","/assets/image-CowqZ4Ry.js","/assets/image-off-BhnmnqHN.js","/assets/inbox-CmzX5EI4.js","/assets/index-B7zrdcSh.css","/assets/index-DBsXsFTY.js","/assets/keyboard-r6ZQwdrg.js","/assets/languages-uHZyqe0c.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CfvIER_c.js","/assets/lightbulb-CQxbr8aN.js","/assets/link-2-LFtibLb1.js","/assets/link-2-off-B1RLW_tv.js","/assets/list-ordered-QFb_-x_H.js","/assets/list-tree-CxVu25L2.js","/assets/lock-open-9iG1X4SN.js","/assets/log-in-B0M5B8HV.js","/assets/marks-BM4z0TR-.js","/assets/minimize-2-DTX4TnJm.js","/assets/package-check-2wMx6-wf.js","/assets/pencil-BtH9cUDM.js","/assets/percent-DzL-JDMQ.js","/assets/pin-g0Na9Pbr.js","/assets/pin-off-BC8cRFvs.js","/assets/play-BuDEQFKj.js","/assets/plug-zap-COyL83dG.js","/assets/prop-types-Du_MqsDi.js","/assets/radio-CP_jpEwk.js","/assets/react-apexcharts.esm-CTeWfzkT.js","/assets/registers-Dnwo8XM0.js","/assets/repeat-utqLp_uG.js","/assets/save-CPkgMO6c.js","/assets/scopeLinks-Dq3txNJX.js","/assets/scroll-text-BB1j0TMO.js","/assets/search-x-9VYUT-Mc.js","/assets/segments-CrCZ80hj.js","/assets/send-CDq0lGzY.js","/assets/settings-2-yioUe3Ll.js","/assets/shield-BnhRB61_.js","/assets/shield-alert-CD5zzqDj.js","/assets/shield-question-mark-tbOwqgwl.js","/assets/siren-X447RRcx.js","/assets/snowflake-BL8of-rA.js","/assets/split-BF4vhgKR.js","/assets/square-check-big-CtX-TE9l.js","/assets/star-CTfwDTjV.js","/assets/statusBands-Q5XlHt9Q.js","/assets/store-BMphmfvC.js","/assets/table-2-DZ5hRDQE.js","/assets/table-properties-CBEX2djX.js","/assets/tag-B6sLICP8.js","/assets/timer-off-VNxIbUtS.js","/assets/trending-down-9wQ9sVe3.js","/assets/trending-up-DHCGtYBo.js","/assets/undo-2-SaYfmjI5.js","/assets/useChartTheme-CFaWGQ7Q.js","/assets/useElementWidth-C7V7YQ1a.js","/assets/useIsMobile-DaF7RE89.js","/assets/useOpenParam-DLbS-qFs.js","/assets/useStatusBands-BRQ6n5VF.js","/assets/useUrlScope-D92CGysw.js","/assets/user-DMVkdOP6.js","/assets/user-cog-DGjaRAnx.js","/assets/users-DTr5-xLY.js","/assets/vfx-B_NOVyZQ.js","/assets/video-DkweJKKM.js","/assets/wallet-C0uuTyNQ.js","/assets/warehouse-BSDJkQNi.js","/assets/workflow-b3glzoaF.js","/assets/x-4rc3JAKs.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
