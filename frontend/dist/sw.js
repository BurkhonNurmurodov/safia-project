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

const BUILD = "2026-09-21T04:28:23.952Z";
const PRECACHE = ["/","/assets/AdminPanel-BhYKiP5X.js","/assets/AnalysisBoard-DdMLMlq0.js","/assets/Arc-DRhMTudI.js","/assets/AttendanceModal-5PIFj5Li.js","/assets/BrigadirProfile-BtJZcyj7.js","/assets/BroadcastReceivers-DL2UaK7n.js","/assets/BroadcastRecord-DwHjxSSH.js","/assets/CatLockNotice-Cf6VSlZ9.js","/assets/CategoryLegendModal-DCYZ174d.js","/assets/CellConcerns-QYh5xL46.js","/assets/CellDetails-C-W9o31w.js","/assets/CellFormModal-DJXykrUq.js","/assets/CellLink-CinxDpEu.js","/assets/Cells-pAVTu_Po.js","/assets/ColumnFilter-Scquc1C-.js","/assets/ColumnsPicker-C7BURTYP.js","/assets/CommentsModal-BSW8mpvH.js","/assets/ComparisonTable-BHVcl4W-.js","/assets/Concerns-CXvVk9ie.js","/assets/ConfirmDialog-CIuIBEkG.js","/assets/Daily-2O9VD9i0.js","/assets/DataTable-DGDeay4w.js","/assets/DateRangePicker-CWf8rY5P.js","/assets/DayReportView-BWhoekKs.js","/assets/DayStepper-BTJmxFFN.js","/assets/DifferenceBreakdown-CbP7yL3a.js","/assets/Downtime-DxFetdf3.js","/assets/Education-DVyXkPar.js","/assets/EducationLesson-tXXMiNC3.js","/assets/EmptyState-Bivv9wRF.js","/assets/FactorySelect-DC7G1741.js","/assets/FormField-D-Gnh9qY.js","/assets/Gamification-chZmtT5e.js","/assets/GroupBadge-2prx3FtP.js","/assets/HeatmapChart-B6Ko9brP.js","/assets/IdleCell-CSzc5Rpr.js","/assets/KPICard-DJ0NYYf-.js","/assets/Kaizen-BLqTD078.js","/assets/KpiDeltaCard-C5cEdgvE.js","/assets/LangTextInput-Bd2r895k.js","/assets/Layout-Dsxdnvhc.js","/assets/LeaderDayReport-B1ky6xcN.js","/assets/LeaderUnitReport-ByNYxQrv.js","/assets/Leaderboard-CgeGRg_T.js","/assets/Leaders-Cq8pvusx.js","/assets/LiveOverview-Lfn6diaf.js","/assets/Login-CtMJ37Yl.js","/assets/NotFound-BaCE_VGK.js","/assets/Overview-CaQTLUA9.js","/assets/Pagination-D06Cl0iL.js","/assets/PerenaladkaFactTable-DubKWO-O.js","/assets/PlanFulfillment-DYdPp6B4.js","/assets/Production-CTHlwvYK.js","/assets/Profile-BYwsAMzJ.js","/assets/ProofCamera-CThc8ISO.js","/assets/Quality-CJMZMWgc.js","/assets/RichTextEditor-C3RLPCYX.js","/assets/SearchInput-DGEBLnaN.js","/assets/SeasonalityHeatmap-Dr_HP7ZA.js","/assets/SegmentedToggle-BBBG0zLt.js","/assets/SetupTimes-C_n9Qxy3.js","/assets/ShiftDaily-D4DyjTu5.js","/assets/Skeleton-_bnFEq6I.js","/assets/Staff-CM6lnNRH.js","/assets/StatusBadge-DwbTWQ09.js","/assets/StyledSelect-B_L091zY.js","/assets/Targets-CktqgIW9.js","/assets/Tasks-19qgzjWU.js","/assets/TimeField-DD2Bqp3J.js","/assets/TimeWheelPicker-Cz7SQpD_.js","/assets/Toast-DGuvJUA3.js","/assets/Tooltip-7rbwcEeB.js","/assets/TrendChart-DeT2EiGN.js","/assets/TripleSpeedometer-BOLIIm2b.js","/assets/Trudoyomkost-BIndh5Ed.js","/assets/UsersActivity-CL62LWuE.js","/assets/WatchProgress-CwKeaHPT.js","/assets/WebLogin-DcOFGgWm.js","/assets/WorkerConcerns-DoxRw834.js","/assets/Workers-7EJtftoY.js","/assets/Zagruzka-Dkomswy1.js","/assets/ZagruzkaCell-CVFkmiSl.js","/assets/alarm-clock-B8k1qj-z.js","/assets/api-vxe_jS9w.js","/assets/archive-BqHjTUI_.js","/assets/archive-restore-C7NCHEA6.js","/assets/arrow-down-dHufJ_RH.js","/assets/arrow-left-DmFWPAlZ.js","/assets/arrow-left-right-Uf_QuWqC.js","/assets/arrow-right-DbNrKHHU.js","/assets/arrow-up-l83eT0JW.js","/assets/arrow-up-right-Clb9H17D.js","/assets/award-DVfu6zU7.js","/assets/ban-CWibv-jV.js","/assets/bot-MV3N50Qa.js","/assets/boxes-CT6x4yoL.js","/assets/brigadirFilters-CcGeevOz.js","/assets/broadcastTree-isZiMrt8.js","/assets/building-2-Asml6zW_.js","/assets/calendar-F3yP0GUu.js","/assets/calendar-clock-BJzL_UeU.js","/assets/calendar-days-BEOvXpIr.js","/assets/calendar-range--zGJQ03u.js","/assets/camera-CbuBB53U.js","/assets/categories-CXixN2XZ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DSz7hsOu.js","/assets/chart-line-B5SeI-Xi.js","/assets/chart-pie-DewdyAlS.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-DVa4eiXv.js","/assets/check-VR3qkWlT.js","/assets/check-check-Bqe16N9a.js","/assets/chevron-left-DseDOboG.js","/assets/chevrons-up-down-BR1WN4NJ.js","/assets/circle-dashed-D_027Ct_.js","/assets/circle-dot-CXo195TC.js","/assets/circle-minus-CIFYgNAv.js","/assets/circle-slash-1H9LgxRi.js","/assets/circle-user-round-CgP_Y6mv.js","/assets/coins-CIM6ShJO.js","/assets/compass-CaByTV0g.js","/assets/concernCategories-qeoJlJHh.js","/assets/copy-l_kUT2C-.js","/assets/corner-down-right-BlTTPqlX.js","/assets/createLucideIcon-Cp5wrb7c.js","/assets/exportXlsx-B8uvxc5-.js","/assets/external-link-BccsySxg.js","/assets/file-clock-Bi9zYRVM.js","/assets/file-spreadsheet-CcXJHBN2.js","/assets/file-text-D5cfL6Js.js","/assets/flag-DCRXuZlD.js","/assets/flame-BNrAPuFh.js","/assets/formatters-YGHSWdVb.js","/assets/formulas--q1udj81.js","/assets/funnel-C6fgTm28.js","/assets/hash-Du2OF9S-.js","/assets/history-BM-AVg-a.js","/assets/hourglass-CjoKSUmv.js","/assets/image-off-CJW0XxQo.js","/assets/image-sdXyfsLY.js","/assets/index-CInkH1Cr.js","/assets/index-D9bk6tfm.css","/assets/keyboard-C_0gc0UW.js","/assets/languages-CbjheNyI.js","/assets/layers-CGndWQWY.js","/assets/leaderReason-Dq2H6D-M.js","/assets/lightbulb-hpmA7Vif.js","/assets/link-2-BmuR70Ax.js","/assets/list-checks-Wi0D4-0O.js","/assets/list-ordered-Dj5L0PGV.js","/assets/lock-open-DgLqdZjj.js","/assets/log-in-Bx_1Gv1c.js","/assets/message-square-DcwOrmkH.js","/assets/minimize-2-D36_PakR.js","/assets/minus-C2HHROgk.js","/assets/paperclip-Cb_6ZQjc.js","/assets/pencil-W2bGvUHU.js","/assets/pencil-line-Dj7-agdD.js","/assets/personName-B4KId4zS.js","/assets/pin-C5ix6rXS.js","/assets/play-DoL3u8rv.js","/assets/prop-types-D0GqSgdn.js","/assets/radio-DpmPx-YO.js","/assets/react-apexcharts.esm-CjQDmpWF.js","/assets/refresh-cw--dva9A5a.js","/assets/repeat-DnFG8bm5.js","/assets/rotate-ccw-ytVykfjd.js","/assets/rotate-cw-Bjghh0_p.js","/assets/save-BeVN1ANh.js","/assets/scale-rTp99G-Y.js","/assets/scroll-text-JL1uGHco.js","/assets/search-x-D8KjUKmw.js","/assets/segments-0VgdtY1y.js","/assets/send-CBO8RM6D.js","/assets/settings-2-Bu2pbYJQ.js","/assets/shield-DiAkonWX.js","/assets/shield-alert-CbUPNeQr.js","/assets/shield-check-DGBCr9YM.js","/assets/shield-question-mark-BOivDwLN.js","/assets/siren-BMfQyTTa.js","/assets/smartphone-BRVwkJKl.js","/assets/snowflake-OoO6S2w6.js","/assets/square-DnH_GN3O.js","/assets/square-check-big-DYREdJgH.js","/assets/star-BuefeSbM.js","/assets/statusBands-D8aXjJ_1.js","/assets/table-2-C-2jKmBe.js","/assets/tag-BO5iojbl.js","/assets/trash-2-Cl-hcf-k.js","/assets/trending-down-DLYQ-8Ej.js","/assets/trending-up-BVggCFZ0.js","/assets/undo-2-BrNHvLne.js","/assets/useChartTheme-C9XA8rLA.js","/assets/useElementWidth-D8CndhR7.js","/assets/useIsMobile-BLiRjbHg.js","/assets/useMutation-BYbv80r5.js","/assets/useStatusBands-CdBWc9xg.js","/assets/user-check-DcfQh0Gj.js","/assets/user-cog-CgWNGHu4.js","/assets/user-minus-DJsHjO8V.js","/assets/users-By20ltTp.js","/assets/verifyState-COaprQYu.js","/assets/video-BhWsjiaS.js","/assets/warehouse-CLWUWENR.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
