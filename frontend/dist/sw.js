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

const BUILD = "2026-09-28T10:58:11.438Z";
const PRECACHE = ["/","/assets/AdminPanel-DvweuD-W.js","/assets/AnalysisBoard-XyO3v8Ln.js","/assets/Arc-BzhBkqlq.js","/assets/ArcLegacy-BKDtP6F2.js","/assets/AttendanceModal-B6pzV6jB.js","/assets/BrigadirProfile-khIooKOS.js","/assets/BroadcastReceivers-A69nYtJA.js","/assets/BroadcastRecord-jPuUkOE7.js","/assets/CatLockNotice-BiMdOZ4f.js","/assets/CategoryLegendModal-UXNB1RGw.js","/assets/CellConcerns-BmmZr8-N.js","/assets/CellDetails-D-uI0l9f.js","/assets/CellFormModal-_Y6B5rI3.js","/assets/CellLink-lW3JPWE2.js","/assets/Cells-CyTI4eJb.js","/assets/ColumnFilter-DvRkBjeI.js","/assets/ColumnsPicker-Cj35lle9.js","/assets/CommentsModal-hfzJuMyt.js","/assets/ComparisonTable-BO1lMfHm.js","/assets/Concerns-OZdFWFyT.js","/assets/ConfirmDialog-BxQL7wKY.js","/assets/Daily-CjtX5-Xr.js","/assets/DataTable-BcHC6aOE.js","/assets/DateRangePicker-CnsON_7u.js","/assets/DayReportView-BYzqkTWH.js","/assets/DayStepper-Bvci2SgU.js","/assets/DifferenceBreakdown-eIIJA-Z2.js","/assets/Downtime-eQO0EC3V.js","/assets/Education-muQx1aR0.js","/assets/EducationLesson-DIGznooG.js","/assets/EmptyState-DmKZu_VB.js","/assets/Exam-CNgMeTaW.js","/assets/FactorySelect-B9vUSqRS.js","/assets/Gamification-Djz2I64z.js","/assets/GroupBadge-na-hb-qC.js","/assets/HeatmapChart-Cg_5ZP8l.js","/assets/IdleCell-BfZvhmrO.js","/assets/KPICard-BlfKDYXt.js","/assets/Kaizen-yRKZFjvs.js","/assets/KpiDeltaCard-BwUrblCR.js","/assets/LangTextInput-DJUH8fN7.js","/assets/Layout-CpzlDs2r.js","/assets/LeaderAppeal-C1wfxG6y.js","/assets/LeaderDayReport-2qEfZcP3.js","/assets/LeaderUnitReport-TTDl8zis.js","/assets/Leaderboard-OJuPSKeq.js","/assets/Leaders-D2beG25l.js","/assets/Lightbox-Bvp6lvFh.js","/assets/LiveOverview-GsHIDT1p.js","/assets/Login-ps2uhSg-.js","/assets/NotFound-Dl632nla.js","/assets/Overview-C-_gNjp8.js","/assets/Pagination-CnhCrG-J.js","/assets/PerenaladkaFactTable-X9LkqkZi.js","/assets/PlanFulfillment-CHDjwISj.js","/assets/Production-BizCbxf9.js","/assets/Profile-CScFqp6H.js","/assets/ProofCamera-D08pFrLj.js","/assets/ProofPhoto-BBwchay4.js","/assets/Quality-DEJfsmcS.js","/assets/RequestStateChip-CiETG5cj.js","/assets/RichTextEditor-DgOIImZy.js","/assets/SaveState-C8nPMBsC.js","/assets/SearchInput-AeU6j2vm.js","/assets/SeasonalityHeatmap-BzJ9tAw_.js","/assets/SegmentedToggle-CYQkSXpi.js","/assets/SetupTimes-CnQaO1Ru.js","/assets/ShiftDaily-uMLPfHxz.js","/assets/Staff-C13eRCAK.js","/assets/StatusBadge-D3JOLxzn.js","/assets/TargetGoal-BUoKLUMw.js","/assets/Targets-NDZPuUHy.js","/assets/Tasks-BBjkd-pN.js","/assets/TimeWheelPicker-CWtH9hP5.js","/assets/Tooltip-BWkwDboD.js","/assets/TrendChart-9ZdtXMd7.js","/assets/TripleSpeedometer-CW0ymV__.js","/assets/Trudoyomkost-DGBr3yOp.js","/assets/UsersActivity-sFd1CbEd.js","/assets/WatchProgress-DQPq7PtS.js","/assets/WebLogin-BbTlgc4G.js","/assets/WorkerConcerns-DNlxklm3.js","/assets/Workers-CrEvdCnq.js","/assets/Zagruzka-B-PV3DhL.js","/assets/ZagruzkaCell-M9ly29aI.js","/assets/alarm-clock-Dg_WE4nN.js","/assets/api-C20OJh5Z.js","/assets/archive-BrvdK3xa.js","/assets/archive-restore-Bnqc9aBa.js","/assets/arrow-down-8taZbpXa.js","/assets/arrow-left-BVFHSvYD.js","/assets/arrow-left-right-CKsXVUWo.js","/assets/arrow-up-B-84M0RF.js","/assets/arrow-up-right-B-H4yIdB.js","/assets/award-DNBhOQTo.js","/assets/ban-COXnNtBv.js","/assets/bot-DVYQPYYN.js","/assets/boxes-B5YNecB_.js","/assets/brigadirFilters-DMONmzEr.js","/assets/broadcastTree-vUMAh6Ni.js","/assets/building-2-CrrwQL-e.js","/assets/calendar-DdEw8uer.js","/assets/calendar-clock-CP-rkw4Y.js","/assets/calendar-days-02G4QYJR.js","/assets/calendar-range-8udhcGQN.js","/assets/camera-BAzXi0BJ.js","/assets/categories-D7pdePGD.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DezGekwZ.js","/assets/chart-line-CBiczaX8.js","/assets/chart-pie-JYiGuaOh.js","/assets/chartRange-BWHMkx3v.js","/assets/chevron-left-DEXkN9Ee.js","/assets/chevrons-up-down-DSMZjhE-.js","/assets/circle-check-big-BI-ztDRi.js","/assets/circle-dot-Dy0LuFe8.js","/assets/circle-minus-HbaBnW6V.js","/assets/circle-slash-D0Aex3_K.js","/assets/circle-user-round-O5_LxlB3.js","/assets/cloud-off-BoXdCe1O.js","/assets/cloud-upload-D3LWqyVH.js","/assets/compass-DBUewYC7.js","/assets/concernCategories-D4KrXPwk.js","/assets/copy-BiD7uqre.js","/assets/corner-down-right-Ugv1aF9W.js","/assets/createLucideIcon-Bcw1Wl_Z.js","/assets/es-D0u0Pk1C.js","/assets/exportXlsx-CG0DQZgc.js","/assets/external-link-DzOWirxc.js","/assets/file-clock-Ds7z4IUb.js","/assets/file-exclamation-point-BXwwnWPD.js","/assets/file-spreadsheet-DBqziP-7.js","/assets/file-text-T3DFCJQ5.js","/assets/flag-vvGIUKZP.js","/assets/flame-DcYg14nX.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DIivvSb3.js","/assets/hash-MCqQRz4r.js","/assets/history-BbKgzS4k.js","/assets/hourglass-YF16d_HK.js","/assets/image-DVfGCUEc.js","/assets/image-off-BqCHtNYT.js","/assets/index-TBzEnSGJ.css","/assets/index-he1zucPw.js","/assets/key-round-DMlRL_T1.js","/assets/keyboard-DA39kN-Z.js","/assets/languages-CA58oXDz.js","/assets/layers-CAvslgvl.js","/assets/leaderReason-D4aEy81I.js","/assets/lightbulb-Bon_ORJt.js","/assets/link-2-BCu2cNxc.js","/assets/list-checks-DrzoHenH.js","/assets/list-ordered-DK4zMySX.js","/assets/list-tree-CDngGW5D.js","/assets/lock-open-BmTG9OBS.js","/assets/log-in-DOSE7a9P.js","/assets/message-square-C43B88NG.js","/assets/minimize-2-DlCMrVbw.js","/assets/package-check-CZN22v82.js","/assets/paperclip-Cl2yBP8T.js","/assets/pencil-BI9by2gw.js","/assets/personName-B4KId4zS.js","/assets/pin-CLdmn3nm.js","/assets/pin-off-B7X00J83.js","/assets/play-BfIFNcW0.js","/assets/presentation-DnE48S1K.js","/assets/prop-types-BqVkRk8n.js","/assets/radio-DP4gVQ_z.js","/assets/react-apexcharts.esm-mbzkiX4J.js","/assets/repeat-5kzcpanB.js","/assets/rotate-ccw-yMFiKepZ.js","/assets/rotate-cw-DEfcF2a6.js","/assets/save-Cn4HDqbX.js","/assets/scale-CTNrCHdC.js","/assets/scroll-text-Dl-2EhrL.js","/assets/search-x-CvQzVkJt.js","/assets/segments-Cp4FBBec.js","/assets/send-DofwB4h5.js","/assets/settings-2-D153erJJ.js","/assets/shield-6qg_phHB.js","/assets/shield-alert-Cx5iuvId.js","/assets/shield-check-g0IdDjVp.js","/assets/shield-question-mark-BuMdxPtj.js","/assets/siren-ykbHRRVf.js","/assets/smartphone-ChfO4fig.js","/assets/snowflake-Da7YmtpL.js","/assets/square-B6Wy3OYL.js","/assets/square-check-big-D2I9uVBl.js","/assets/star-CCopSNaS.js","/assets/statusBands-HF0swNej.js","/assets/store-CT7jP-sP.js","/assets/table-2-DS7yPw8C.js","/assets/tag-rvEOHwj0.js","/assets/trending-down-BBL4Zx-n.js","/assets/trending-up-likWt-sn.js","/assets/undo-2-D-K0GtuM.js","/assets/useChartTheme-CNwf9Nn-.js","/assets/useElementWidth-CBTrYJW1.js","/assets/useIsMobile-BdgFDhab.js","/assets/useMutation-D79TxZ-S.js","/assets/useStatusBands-CxO3WNsv.js","/assets/user-Cd-HptVh.js","/assets/user-check-Ch2Eksz0.js","/assets/user-cog-X3MzPcL8.js","/assets/user-minus-CmHGTslu.js","/assets/users-3twN8cXu.js","/assets/verifyState-DPnRJUAy.js","/assets/video-cszCfhO5.js","/assets/wallet-B8odb9nN.js","/assets/warehouse-BNSDhATG.js","/assets/zap-CCVDnR4n.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
