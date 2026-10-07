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

const BUILD = "2026-10-07T04:30:54.767Z";
const PRECACHE = ["/","/assets/AdminPanel-B8_5jKye.js","/assets/AnalysisBoard-BKjIKFFs.js","/assets/Arc--nmUEewb.js","/assets/Assistant-C1oqw07R.js","/assets/BrigadirProfile-C1sRjlNW.js","/assets/BroadcastReceivers-BfCItDSy.js","/assets/BroadcastRecord-FDKmlS2d.js","/assets/Button-BDnRZq4P.js","/assets/CatLockNotice-BtlSMWpC.js","/assets/CategoryLegendModal-Bnlh0w7U.js","/assets/CellConcerns-Jtb21QyR.js","/assets/CellDetails-BDDgG7su.js","/assets/CellFormModal-qRc1W22N.js","/assets/CellIdent-C1LDVGJG.js","/assets/CellLink-dCzwNJwj.js","/assets/Cells-BJTY0IUD.js","/assets/ColumnFilter-J-UtPeyx.js","/assets/ColumnsPicker-8uZkRVin.js","/assets/CommentsModal-BzYh3aFp.js","/assets/ComparisonTable-B0NFtuNk.js","/assets/Concerns-B64W2OpX.js","/assets/Daily-DNBUwJRs.js","/assets/DataTable-CCZRqyS0.js","/assets/DateRangePicker-Hzzof11q.js","/assets/DayReportView-lgrPsLYu.js","/assets/DayStepper-DxR6yicC.js","/assets/DifferenceBreakdown-B_lYsoTc.js","/assets/Downtime-DCemjLcV.js","/assets/Education-O7bEPGOp.js","/assets/EducationLesson-BK9By0_X.js","/assets/EmptyState-D5_saSfW.js","/assets/Exam-jeuT-I30.js","/assets/FactorySelect-Bcg3u7Ou.js","/assets/Gamification-igTYcRrv.js","/assets/GroupBadge-CY1jc_Ky.js","/assets/HeatmapChart-XxTSOz6-.js","/assets/IdleCell-Dixf4HJM.js","/assets/KPICard-DVD5juaB.js","/assets/Kaizen-BhlzWa17.js","/assets/Kelish-DFoos7Aa.js","/assets/KpiDeltaCard-BxJPZ7Cg.js","/assets/LangTextInput-BHaz7QOt.js","/assets/Layout-CmzLKO_0.js","/assets/LeaderAppeal-C4C43ymT.js","/assets/LeaderDayReport-BBJKuZvh.js","/assets/LeaderUnitReport-DktGilZz.js","/assets/Leaderboard-COX0-22Z.js","/assets/Leaders-FhB0RUoI.js","/assets/Lightbox-DG56RKqq.js","/assets/LiveOverview-BIjUBSgL.js","/assets/Login-HmTCxXGG.js","/assets/NotFound-BZCRDmFE.js","/assets/Notifications-DNDIkJ-8.js","/assets/Overview-CFkqFpwA.js","/assets/Pagination-B-Hi-5Z2.js","/assets/PerenaladkaFactTable-CRsCk66I.js","/assets/PersonCard-DF2t80-E.js","/assets/PlanFulfillment-Df5UPiYv.js","/assets/Production-nd5S2sg_.js","/assets/Profile-ClCFwbL_.js","/assets/ProofCamera-Dl4JCBfV.js","/assets/ProofPhoto-DVIyb4ie.js","/assets/Quality-914-rP2s.js","/assets/RawRows-DeoG0IHB.js","/assets/RequestStateChip-DiYvlAvm.js","/assets/RichTextEditor-CsOe4RbX.js","/assets/SaveState-C62YuqTF.js","/assets/SearchInput-Z0xlXfQl.js","/assets/SeasonalityHeatmap-CN7gOuQ5.js","/assets/SegmentedToggle-D_skGao4.js","/assets/SetupTimes-YW_s8I8J.js","/assets/ShiftDaily-BaIIc8Oe.js","/assets/Staff-C9D9cbZo.js","/assets/StatusBadge-CYmJ03IB.js","/assets/TargetGoal-DUjB2aE2.js","/assets/Targets-CFaHwU__.js","/assets/Tasks-BHl85LKV.js","/assets/TimeWheelPicker-D1IjtEet.js","/assets/Toast-DxM5QTwm.js","/assets/Tooltip-XqLx-ldK.js","/assets/TrendChart-ZxTfzAV3.js","/assets/TripleSpeedometer-9ITLVz-3.js","/assets/Trudoyomkost-PlEFryo3.js","/assets/Turnover-BLn2ZQdP.js","/assets/UploadDropzone-DU0WqTS0.js","/assets/UsersActivity-C9GEvd0w.js","/assets/VerdictBlock-CRQg2v56.js","/assets/VfxApiMap-Dj0hHhIo.js","/assets/VfxDictionaries-FhCx2Tiy.js","/assets/VfxEmployees-BiLB3iHd.js","/assets/VfxHrMoves-BrodNCqU.js","/assets/VfxJobs-CFZCS6Bi.js","/assets/VfxPhoto-BgZBjdP5.js","/assets/VfxShifts-BXxJqIUO.js","/assets/VfxState-C-SFmrAP.js","/assets/VfxTimebooks-BdooxZd7.js","/assets/VfxTimesheet-BQ14w2hu.js","/assets/WatchProgress-BAdwXVr0.js","/assets/WebLogin-CE-1x3ku.js","/assets/WorkerConcerns-jFEe_zCG.js","/assets/Workers-DCJTU-QZ.js","/assets/Zagruzka-CHCihXeW.js","/assets/ZagruzkaCell-BYZuEcOl.js","/assets/api-9P9MVzOR.js","/assets/archive-CUJT9np2.js","/assets/archive-restore-BlVg_8OG.js","/assets/arrow-down-Dp2Zx17M.js","/assets/arrow-up-narrow-wide-C2SH1Vdj.js","/assets/award-9WIZ5_uN.js","/assets/ban-Iye3Z32m.js","/assets/boxes-BgkLJ1Ji.js","/assets/braces-DY8qTF-z.js","/assets/brigadirFilters-BDxTiiKs.js","/assets/broadcastTree-CjmsIB9_.js","/assets/building-2-ClNqrfLY.js","/assets/calculator-ChFUUVPp.js","/assets/calendar-DRi_FBw_.js","/assets/calendar-days-CBkPfylm.js","/assets/camera-Ce7SlBMq.js","/assets/categories-B_3rEnce.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-tYFD4bcK.js","/assets/chart-line-CatBYLop.js","/assets/chart-pie-DCdx7mM3.js","/assets/chartRange-C16RrWYE.js","/assets/check-check-B0I-0BuK.js","/assets/chevron-left-D4XYf1QB.js","/assets/chevrons-up-down-D-7dDjkV.js","/assets/circle-CY0oXdSZ.js","/assets/circle-alert-Dvm32nHk.js","/assets/circle-check-big-B0PtQnlh.js","/assets/circle-dashed-BGLYBOXN.js","/assets/circle-minus-Hm7fbShb.js","/assets/circle-question-mark-Cd1RRnlX.js","/assets/circle-slash-CYe6zvDv.js","/assets/circle-user-round-DhYs3pR1.js","/assets/clock-3-DbUFfteH.js","/assets/cloud-off-BsqZuNv5.js","/assets/cloud-upload-rECj9-h5.js","/assets/compass-C1w-LZXI.js","/assets/concernCategories-C9lfGbm8.js","/assets/copy-BqF1t942.js","/assets/corner-down-right-BimrhEYq.js","/assets/createLucideIcon-k0EgCPpa.js","/assets/es-djYCWlOp.js","/assets/external-link-BB2yuQZM.js","/assets/file-clock-CrR4LMdA.js","/assets/file-exclamation-point-Dz4mDyIz.js","/assets/flag-BR57NGJN.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-NfIv859U.js","/assets/hash-MPLB_9JH.js","/assets/hourglass-DvEHfvTU.js","/assets/image-DsSM0u9q.js","/assets/image-off-YHaLSsY0.js","/assets/inbox-BFLJxXVl.js","/assets/index-B7yzqq84.css","/assets/index-uiJ3jFH9.js","/assets/keyboard-B5o91Hdl.js","/assets/languages-BFKIooSq.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BpP41q9s.js","/assets/lightbulb-D65c5mIM.js","/assets/link-2-DuZ1O-0n.js","/assets/link-2-off-xch1ArqP.js","/assets/list-ordered-D-0w3mkr.js","/assets/list-tree-CRR2pyDz.js","/assets/lock-open-CydJcu3r.js","/assets/log-in-CWt7MiF1.js","/assets/minimize-2-CWW7MHCW.js","/assets/package-check-rvGAZwJG.js","/assets/pencil-C5wHkBx8.js","/assets/percent-BCytx164.js","/assets/pin-DSWwQ3zQ.js","/assets/pin-off-yWO31aHZ.js","/assets/play-yMAI4gqc.js","/assets/plug-zap-B68lsqBw.js","/assets/prop-types-Jv12STEI.js","/assets/radio-DLi23PYk.js","/assets/react-apexcharts.esm-C5HJzmZn.js","/assets/registers-CAVf8H87.js","/assets/repeat-D3go2fhR.js","/assets/save-BhVbTxlW.js","/assets/scopeLinks-_MKFo5Ev.js","/assets/scroll-text-lONW7MKm.js","/assets/search-x-VgkBR0N7.js","/assets/segments-Q-He9LWb.js","/assets/send-DnoQ9R-K.js","/assets/settings-2-A3V1JxBP.js","/assets/shield-alert-DF0kFJdT.js","/assets/shield-o6QOOzLS.js","/assets/shield-question-mark-BwUjzRXl.js","/assets/siren-BYrQNU80.js","/assets/snowflake-CmZcXGbR.js","/assets/split-Caqb2tAL.js","/assets/square-check-big-CXOOi8xh.js","/assets/star-DEW3R8nl.js","/assets/statusBands-BLLuj39t.js","/assets/store-BPl1cLgB.js","/assets/table-2-Cfg1OHPK.js","/assets/table-properties-Cq7CuVLR.js","/assets/tag-BJYLa9JI.js","/assets/timer-off-BT8ylQzZ.js","/assets/trending-down-BLwMg0SK.js","/assets/trending-up-CbdxBlgd.js","/assets/undo-2-Ly7rJfI5.js","/assets/useChartTheme-BYGtws3J.js","/assets/useElementWidth-B7B9QVjz.js","/assets/useIsMobile-mR5kdBfD.js","/assets/useOpenParam-B7DLDJzu.js","/assets/useStatusBands-C_bvByPI.js","/assets/useUrlScope-BMl7C6Rt.js","/assets/user-cog-DfxbiAVd.js","/assets/user-yrNzHy5s.js","/assets/users-DZAWww7j.js","/assets/vfx-CNyai4D2.js","/assets/video-BcE0kX13.js","/assets/wallet-C6RbOzB6.js","/assets/warehouse-D6o4S4wO.js","/assets/x-CK_umj1Y.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
