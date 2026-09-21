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

const BUILD = "2026-09-21T09:25:06.549Z";
const PRECACHE = ["/","/assets/AdminPanel-CKJWYmeh.js","/assets/AnalysisBoard-Dv2cjrmm.js","/assets/Arc-DBJXaeiw.js","/assets/AttendanceModal-CrPnZz6y.js","/assets/BrigadirProfile-f9oZTTxh.js","/assets/BroadcastReceivers-B2tyGlQ4.js","/assets/BroadcastRecord-BfL3YiK5.js","/assets/CatLockNotice-8DWx2Zt4.js","/assets/CategoryLegendModal-BYlQxEsq.js","/assets/CellConcerns-CMD9XS_N.js","/assets/CellDetails-DvFk7_WJ.js","/assets/CellFormModal-B2_zRwPE.js","/assets/CellLink-vzTfi2Fz.js","/assets/Cells-JGd12aK5.js","/assets/ColumnFilter-IoHuqdMO.js","/assets/ColumnsPicker-BNpLw2q0.js","/assets/CommentsModal-D3-dUrRG.js","/assets/ComparisonTable-BDl0X36r.js","/assets/Concerns-BukE83tq.js","/assets/ConfirmDialog-x7_n1Y70.js","/assets/Daily-DPoXOR7-.js","/assets/DataTable-lJv60-xN.js","/assets/DateRangePicker-Cyo5rst4.js","/assets/DayReportView-DEbPWJCL.js","/assets/DayStepper-DflMuM4h.js","/assets/DifferenceBreakdown-BHEtkW2w.js","/assets/Downtime-OVZHRgjt.js","/assets/Education-a7NrpJpA.js","/assets/EducationLesson-Cv_plXle.js","/assets/EmptyState-cj4AAEvz.js","/assets/FactorySelect-Dn4o-5FM.js","/assets/FormField-BC8w1EwW.js","/assets/Gamification-Cqx2VarO.js","/assets/GroupBadge-DrAv7xlS.js","/assets/HeatmapChart-BgwSi0Ft.js","/assets/IdleCell-h6HCtzd6.js","/assets/KPICard-CRVLgIj1.js","/assets/Kaizen-BJNQiKGY.js","/assets/KpiDeltaCard-DV3S17Q0.js","/assets/LangTextInput-BpPqUYes.js","/assets/Layout-DRpyVNEX.js","/assets/LeaderDayReport-Csoh105s.js","/assets/LeaderUnitReport-fX5-1s1v.js","/assets/Leaderboard-DC3cPQOT.js","/assets/Leaders-Bi6PNd_B.js","/assets/LiveOverview-Chen4zLO.js","/assets/Login-DtBGeX1k.js","/assets/NotFound-D_-MngtI.js","/assets/Overview-DOZ-eg33.js","/assets/Pagination-B94j2Hpm.js","/assets/PerenaladkaFactTable-pjyW0PQX.js","/assets/PlanFulfillment-pbAT03EN.js","/assets/Production-BLBTe_KU.js","/assets/Profile-BHXD3zT1.js","/assets/ProofCamera-rtoOVwou.js","/assets/Quality-ZeCI9Cht.js","/assets/RichTextEditor-BWCsLaJW.js","/assets/SearchInput-DR26HT7-.js","/assets/SeasonalityHeatmap-Byiw4hmq.js","/assets/SegmentedToggle-CllFhke6.js","/assets/SetupTimes-Cuk4D9-Y.js","/assets/ShiftDaily-xrAWcYyi.js","/assets/Skeleton-CEg8w5Ep.js","/assets/Staff-B_Gf74iN.js","/assets/StatusBadge-DTrcUwQM.js","/assets/StyledSelect-CxnqvJDM.js","/assets/Targets-WMIA3Non.js","/assets/Tasks-CfgxM6EN.js","/assets/TimeField-kCkMIiMy.js","/assets/TimeWheelPicker-Bg3iLA8N.js","/assets/Toast-DorY5dFy.js","/assets/Tooltip-D0dVRSOC.js","/assets/TrendChart-DkDfMRqK.js","/assets/TripleSpeedometer-DR4NSrba.js","/assets/Trudoyomkost-BKBI8gW_.js","/assets/UsersActivity-DP30OgsI.js","/assets/WatchProgress-DKqHNfa2.js","/assets/WebLogin-D3Bx8cYw.js","/assets/WorkerConcerns-uNYYGVJW.js","/assets/Workers-l2y338Fk.js","/assets/Zagruzka-BMTh14-2.js","/assets/ZagruzkaCell-BOvSfmPr.js","/assets/alarm-clock-58P50K5i.js","/assets/api-H7qX834p.js","/assets/archive-C-PmzQVX.js","/assets/archive-restore-rVpfKzit.js","/assets/arrow-down-Dch9sH1F.js","/assets/arrow-left-right-CvTyhWrz.js","/assets/arrow-left-trWnNEXb.js","/assets/arrow-right-DgjWuVwA.js","/assets/arrow-up-36sSzqPD.js","/assets/arrow-up-right-_g0BLDBc.js","/assets/award-DtEhjSxO.js","/assets/ban-1xoflDJw.js","/assets/bot-SAcFW7oA.js","/assets/boxes-Bhwa5uSJ.js","/assets/brigadirFilters-BWyf34aI.js","/assets/broadcastTree-ZR9RvIHM.js","/assets/building-2-B7_dwI4a.js","/assets/calendar-COIhC8KU.js","/assets/calendar-clock-DBZTGPww.js","/assets/calendar-days-CPc_ICa3.js","/assets/calendar-range-BOnsKyxX.js","/assets/camera-xP3XJ2w1.js","/assets/categories-JXsARWNQ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DFVwOC08.js","/assets/chart-line-QDjnGw1B.js","/assets/chart-pie-B_J_JIGG.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-3UAcqD1n.js","/assets/check-check-Z98rleyW.js","/assets/check-pA5jMpvQ.js","/assets/chevron-left-CIqo6TI7.js","/assets/chevrons-up-down-kcGbHkP9.js","/assets/circle-dashed-BiLnk5vr.js","/assets/circle-dot-PzCdud9_.js","/assets/circle-minus-YAcsYSS8.js","/assets/circle-slash-COjpmP2u.js","/assets/circle-user-round-DE4tHv9J.js","/assets/coins-RwqCbqNy.js","/assets/compass-c1SBQcaP.js","/assets/concernCategories-Cn7AM5_s.js","/assets/copy-BhA2tdey.js","/assets/corner-down-right-1lkmNsUq.js","/assets/createLucideIcon-BL0D9abS.js","/assets/exportXlsx-BTRQEE4N.js","/assets/external-link-BVKapopC.js","/assets/file-clock-BIpziV5_.js","/assets/file-spreadsheet-CTlc_nM0.js","/assets/file-text-D64d_9Bp.js","/assets/flag-CgcPUl9G.js","/assets/flame-BS4XGS3N.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Bxh0cWKH.js","/assets/funnel-sFtQ5OW2.js","/assets/hash-DbguoaG7.js","/assets/history--qBRuC7Z.js","/assets/hourglass-C228zCBA.js","/assets/image-off-Bf7mjmiP.js","/assets/image-y6wDng0s.js","/assets/index-BXqTV2jf.css","/assets/index-asUz-1iz.js","/assets/keyboard-CbMkWvCN.js","/assets/languages-BaSXnU1V.js","/assets/layers-C7bhm_4W.js","/assets/leaderReason-CYBMcxHZ.js","/assets/lightbulb-Cr_eUskc.js","/assets/link-2-DuTvCeyT.js","/assets/list-checks-D6SG8oVn.js","/assets/list-ordered-Dk4qNFxv.js","/assets/lock-open-BxeKBv5c.js","/assets/log-in-D4Hkt2kC.js","/assets/message-square-rtjIfXNE.js","/assets/minimize-2-rdOT1slj.js","/assets/minus-vdZN-e0Z.js","/assets/paperclip-Dcid49C2.js","/assets/pencil-BTAjmmYx.js","/assets/pencil-line-CzfzJUGE.js","/assets/personName-B4KId4zS.js","/assets/pin-DtGoAI8Q.js","/assets/play-C0JicL_8.js","/assets/prop-types-DePqx3Q1.js","/assets/radio-ByB9nsfk.js","/assets/react-apexcharts.esm-CZ0mmUlB.js","/assets/refresh-cw-BjaSZmnp.js","/assets/repeat-DtH5Zng2.js","/assets/rotate-ccw-BogGwkB8.js","/assets/rotate-cw-DhhVq8hc.js","/assets/save-U5U0jlGZ.js","/assets/scale-Dhngjx6r.js","/assets/scroll-text-BJbqJBu_.js","/assets/search-x-DwdKNk5W.js","/assets/segments-BeKSSd1Y.js","/assets/send-Cf1mDvhP.js","/assets/settings-2-CeE6jFVW.js","/assets/shield-DVhRn4XF.js","/assets/shield-alert-zPklhrh6.js","/assets/shield-check-DYgrsf9c.js","/assets/shield-question-mark-CWXg29pz.js","/assets/siren-B-WkdUaH.js","/assets/smartphone-BL2BOgoV.js","/assets/snowflake-7d0ZjUqa.js","/assets/square-check-big-Btyj6jci.js","/assets/square-zhRFC2i8.js","/assets/star-Dkslz80B.js","/assets/statusBands-BslsseOQ.js","/assets/table-2-Dx8rE9jh.js","/assets/tag-BtAjB_XN.js","/assets/trash-2-C1uAzas_.js","/assets/trending-down-D6-0geHk.js","/assets/trending-up-GOJLkpys.js","/assets/undo-2-D4md2yOd.js","/assets/useChartTheme-DvUnnM-P.js","/assets/useElementWidth-B2oA8GR3.js","/assets/useIsMobile-BFq3T-SR.js","/assets/useMutation-Dvi0muaz.js","/assets/useStatusBands-OqBBOgEg.js","/assets/user-check-D-VWwqlV.js","/assets/user-cog-BXnnz5fB.js","/assets/user-minus-CDPpbmaf.js","/assets/users-mvO7ZrHb.js","/assets/verifyState-GAutedqv.js","/assets/video-BvnAYZ2g.js","/assets/warehouse-FdhIzty0.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
