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

const BUILD = "2026-10-30T05:04:24.870Z";
const PRECACHE = ["/","/assets/AdminPanel-lnRYNiSV.js","/assets/AnalysisBoard-CNREb8FL.js","/assets/Arc-BbWsUw3G.js","/assets/Assistant-D2DCV33T.js","/assets/BrigadirProfile-DlB790hu.js","/assets/BroadcastReceivers-Bnq1_EZH.js","/assets/BroadcastRecord-D3hyzoo4.js","/assets/Button-D6MdeZy_.js","/assets/CatLockNotice-CKXGQLQY.js","/assets/CategoryLegendModal-DW12lfx4.js","/assets/CellConcerns-CwIaAKKU.js","/assets/CellDetails-BfVk9jXv.js","/assets/CellFormModal-D59YqXcu.js","/assets/CellIdent-Cpfz8hMs.js","/assets/CellLink-7K7WQM_9.js","/assets/Cells-DBjhQSFE.js","/assets/ColumnFilter-DBfJwe4N.js","/assets/ColumnsPicker-BscHQwvU.js","/assets/CommentsModal-BGFxj6PD.js","/assets/ComparisonTable-CPFNL_00.js","/assets/Concerns-DRUcly_f.js","/assets/CountStepper-ChNvSmsY.js","/assets/Daily-DyiJ-z83.js","/assets/DataTable-cdE5xLFg.js","/assets/DateRangePicker-CUmvdhDp.js","/assets/DayReportView-Bh5tpB3G.js","/assets/DayStepper-Dql0NPN4.js","/assets/DayStrip-BqkXvgmF.js","/assets/DifferenceBreakdown-Z6_TPH_R.js","/assets/Downtime-ESgJtU5h.js","/assets/Education-8p4-TOwm.js","/assets/EducationLesson-DaIu_3mC.js","/assets/EmptyState-BNoCa3du.js","/assets/Exam-CR4pk5JM.js","/assets/FactorySelect-DX66Z7w0.js","/assets/Gamification-tj85tZev.js","/assets/GroupBadge-Cci1kkMG.js","/assets/HeatmapChart-CgfBPLPU.js","/assets/IdleCell-CreNL9L5.js","/assets/KPICard-C01NODyS.js","/assets/Kaizen-BuX2QKNZ.js","/assets/Kelish-BYGxQiz7.js","/assets/KpiDeltaCard-oobVVnXo.js","/assets/LangTextInput-B9lD-IAQ.js","/assets/Layout-AIxEYBo8.js","/assets/LeaderAppeal-JyIbjV6U.js","/assets/LeaderDayReport-2sCk42JQ.js","/assets/LeaderUnitReport-D-TbMQeF.js","/assets/Leaderboard-DytNkIOv.js","/assets/Leaders-C3sRRwrQ.js","/assets/LeadersKpi-DAgxXLMd.js","/assets/Lightbox-_eMff7l-.js","/assets/LiveOverview-C1vKRvIG.js","/assets/Login-NrBbQzDs.js","/assets/NotFound-ilLbbFwX.js","/assets/Notifications-BoNJF7tt.js","/assets/Ontime-BBGh27ua.js","/assets/Overview-BHcsg8iL.js","/assets/Pagination-DCMfAjVT.js","/assets/PerenaladkaFactTable-DMOIFkI2.js","/assets/PersonCard-BgedCy54.js","/assets/PlanFulfillment-DGNinLaw.js","/assets/Production-dbLwBWYB.js","/assets/Profile-Bzb_kZ0s.js","/assets/ProofCamera-LlNCM-uV.js","/assets/ProofPhoto-CHjGQEGA.js","/assets/Quality-DO2nVYbo.js","/assets/RawRows-aCjuVSwh.js","/assets/Reports-DA9jmGaf.js","/assets/RequestStateChip-onNX2z-z.js","/assets/RichTextEditor-DA-twcEJ.js","/assets/SaveState-Dws-rFHf.js","/assets/SearchInput-DOAArXHW.js","/assets/SeasonalityHeatmap-Jm5OOmTb.js","/assets/SegmentedToggle-D6LznSv9.js","/assets/SetupTimes-Bs8ulSrG.js","/assets/ShiftDaily-xmPYxeN3.js","/assets/Staff-B6a65Nwu.js","/assets/StaffListAtCheck-uj0QT7xQ.js","/assets/StatusBadge-D9ZmRRi5.js","/assets/StatusBandsModal-n5TGQVHL.js","/assets/TargetGoal-OiSXtrP9.js","/assets/Targets-DTuCXwUK.js","/assets/Tasks-CSuHlvEY.js","/assets/TimeWheelPicker-C-rPvcNQ.js","/assets/Toast-C6wdJEBm.js","/assets/Tooltip-MOGT16K0.js","/assets/TrendChart-BwpWvgZN.js","/assets/TripleSpeedometer-BOjxwWQF.js","/assets/Trudoyomkost-CDAuruQe.js","/assets/UploadDropzone-CQmsHFmg.js","/assets/UsersActivity-CVoyeNoD.js","/assets/VerdictBlock-CB3vD4Qy.js","/assets/VfxApiMap-nhfi2Zzt.js","/assets/VfxDictionaries-CT8bt_Bc.js","/assets/VfxEmployees-Bg3f4QPt.js","/assets/VfxHrMoves-CxAvWAsP.js","/assets/VfxJobs-D11O6f62.js","/assets/VfxPhoto-BYdZVKL_.js","/assets/VfxShifts-BJEGZB94.js","/assets/VfxState-C13mpLWD.js","/assets/VfxTimebooks-6rO-rPpX.js","/assets/VfxTimesheet-DzLWHd79.js","/assets/WatchProgress-DrsFM5Ir.js","/assets/WebLogin-BAJxEu6Y.js","/assets/Workers-DX3oFDpU.js","/assets/Zagruzka-DDuXrnkO.js","/assets/ZagruzkaCell-CWKzdbxK.js","/assets/api-BFm7MSgf.js","/assets/archive-Cits__Wa.js","/assets/archive-restore-J-etTQg7.js","/assets/arrow-down-BymsYNM9.js","/assets/arrow-down-right-CisIzb64.js","/assets/arrow-down-wide-narrow-BWJ5xAX_.js","/assets/arrow-up-narrow-wide-BGI-y_4V.js","/assets/ban-bEKQQZyi.js","/assets/boxes-CGjH2pvL.js","/assets/braces-OZjI8Hj7.js","/assets/brigadirFilters-BNrwHSOg.js","/assets/broadcastTree-BSjdwahG.js","/assets/building-2-kNQa9X9_.js","/assets/calendar-BDRAmHeh.js","/assets/calendar-days-CIavin2E.js","/assets/camera-P23rdQEU.js","/assets/categories-DZ-R9rYh.js","/assets/cellMoveRefusal-B-jACHG_.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B9Ol7BRI.js","/assets/chart-line-SXvRk21K.js","/assets/chart-pie-CAIUv1-g.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-DGvRh6QJ.js","/assets/chevron-left-D5zVRiYj.js","/assets/chevrons-up-down-PPNIj_yr.js","/assets/circle-alert-BXcAQB38.js","/assets/circle-cOUOCQpR.js","/assets/circle-check-big-DHl1nGTR.js","/assets/circle-dashed-BfSjVtJp.js","/assets/circle-minus-BkeTTLqg.js","/assets/circle-question-mark-BuEcmid_.js","/assets/circle-slash-B2Agson0.js","/assets/circle-user-round-oI2ZmBOn.js","/assets/cloud-off-LkKjpqyy.js","/assets/cloud-upload-iN51rkCV.js","/assets/coins-ucVnhfk6.js","/assets/compass-7eFg8zxT.js","/assets/concernCategories-oaigs-gf.js","/assets/corner-down-right-DX8M4UNb.js","/assets/createLucideIcon-DFjiFrwf.js","/assets/en-W7T6XDcZ.js","/assets/es-Dtgc5NM1.js","/assets/external-link-IU24tC-U.js","/assets/file-clock-DCvm-ew7.js","/assets/file-exclamation-point-BwzyROrz.js","/assets/flag-B66BApU1.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-FoSmDnN-.js","/assets/funnel-sQ_Qea7L.js","/assets/hash-vw6R8YX-.js","/assets/hourglass-Z-awi2qO.js","/assets/idleTime-CHPnJRpw.js","/assets/image-off-ZomoIxQO.js","/assets/image-ufqFrlDq.js","/assets/inbox-Bx6T_mt9.js","/assets/index-BtYmuUYW.css","/assets/index-CmNaEw2b.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-D0WmRXWH.js","/assets/languages-DZLw2MQY.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B9F5xOYz.js","/assets/leaderBoard-BNmnautX.js","/assets/lightbulb-C60KUSoU.js","/assets/link-2-DclpvQJi.js","/assets/link-2-off-B4uFjOnB.js","/assets/list-ordered-Bd-e8sUg.js","/assets/list-tree-KswuIx53.js","/assets/lock-open-G40kdmi4.js","/assets/log-in-BfrEFU2l.js","/assets/map-pin-S0dHYK5F.js","/assets/marks-CZj74v5D.js","/assets/minimize-2-DL3ysK2l.js","/assets/package-check-DCgL17ap.js","/assets/pencil-BsSYWoqY.js","/assets/percent-B0BWNxIw.js","/assets/pin-Ddh07AZa.js","/assets/pin-off-BMFeMq0n.js","/assets/play-5_hIap9T.js","/assets/plug-zap-CYvOhwBC.js","/assets/prop-types-RD3fbola.js","/assets/radio-BLAbdnRc.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-BPtzesAV.js","/assets/repeat-Cb-yHtbY.js","/assets/ru-CzQbBKeF.js","/assets/save-FJWV1v2I.js","/assets/scopeLinks-Bg_8If4E.js","/assets/scroll-text-Dphv5gZf.js","/assets/search-x-BvnoOnZn.js","/assets/segments-D5Uiedtv.js","/assets/send-CCUq4ZRT.js","/assets/settings-2-BHx-gmE5.js","/assets/shield-DkFeSEA5.js","/assets/shield-alert-B4ZxmdA8.js","/assets/shield-question-mark-E2jWYHsD.js","/assets/sigma-Bjplp6DQ.js","/assets/siren-BWFG9zTq.js","/assets/snowflake-DH2c1eRw.js","/assets/split-DrjwlMjk.js","/assets/square-check-big-CG6cSitN.js","/assets/star-BC0OlOde.js","/assets/statusBands-DVBZcBq3.js","/assets/store-Wx1ugKnQ.js","/assets/table-2-CMd1-Dp1.js","/assets/table-properties-azKa9xas.js","/assets/tag-BPlx0246.js","/assets/timer-off-DDqhFPmc.js","/assets/translations-lbDu-7dk.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-DptBNhR5.js","/assets/trending-up-C-VFX0od.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-rgEN1hWl.js","/assets/useChartTheme-BcJuoAV1.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-BICzBIBC.js","/assets/useStatusBands-B9G6PGg1.js","/assets/useUrlScope-CE7YUqNg.js","/assets/user-DUFV16lP.js","/assets/user-cog-ZCfHjrmx.js","/assets/user-minus-Ck9WmXnF.js","/assets/users-DLSea6tG.js","/assets/uz-DGwx2a_O.js","/assets/uz_cyrl-QVqaXxDs.js","/assets/vfx-DbwHtRRy.js","/assets/video-C5zDvh3C.js","/assets/wallet-B_JkAUPb.js","/assets/warehouse-D9ngSUjQ.js","/assets/workflow-D9RECY34.js","/assets/x-0ZoPdx9T.js","/assets/zap-CLkQgQkm.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
