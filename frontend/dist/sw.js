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

const BUILD = "2026-09-26T11:26:02.827Z";
const PRECACHE = ["/","/assets/AdminPanel-DUpZhDRI.js","/assets/AnalysisBoard-tAGyiCYC.js","/assets/Arc-q7kxRxyS.js","/assets/ArcLegacy-CM1hZUnv.js","/assets/AttendanceModal-CUJk_8Nu.js","/assets/BrigadirProfile-DMeqK2g2.js","/assets/BroadcastReceivers-Bw35xhD2.js","/assets/BroadcastRecord-CVkJ8tS5.js","/assets/CatLockNotice-XlCLplPK.js","/assets/CategoryLegendModal-DwdC4X8X.js","/assets/CellConcerns-PneTAuoo.js","/assets/CellDetails-Uq_yRGmm.js","/assets/CellFormModal-D97rvDrj.js","/assets/CellLink-Dic-pJJu.js","/assets/Cells-CtSyfsiH.js","/assets/ColumnFilter-D15R-utv.js","/assets/ColumnsPicker-C6pZyhmH.js","/assets/CommentsModal-DOZgVimF.js","/assets/ComparisonTable-C0Ulu1L-.js","/assets/Concerns-D675AHH6.js","/assets/ConfirmDialog-BCt1iKZ5.js","/assets/Daily-AAOn0cX8.js","/assets/DataTable-BYSym4mw.js","/assets/DateRangePicker-DchluXB7.js","/assets/DayReportView-BDieTnVI.js","/assets/DayStepper-DuuRYRJC.js","/assets/DifferenceBreakdown-EimcDsSy.js","/assets/Downtime-w1G_mghC.js","/assets/Education-DzGJqQnk.js","/assets/EducationLesson-CKQhWF6v.js","/assets/EmptyState-BNx-Vgid.js","/assets/Exam-BaVG7CFH.js","/assets/FactorySelect-BSPLBLrx.js","/assets/Gamification-K5hv6UoU.js","/assets/GroupBadge-CxQOs0dC.js","/assets/HeatmapChart-fjui6Zdh.js","/assets/IdleCell-MeVAF5UF.js","/assets/KPICard-Cz9ER4zm.js","/assets/Kaizen-Bzuw5q0h.js","/assets/KpiDeltaCard-BFrzHPRS.js","/assets/LangTextInput-DUQNx5RD.js","/assets/Layout-DcPerbWD.js","/assets/LeaderAppeal-BNSVm7uY.js","/assets/LeaderDayReport-Bp5YIDoK.js","/assets/LeaderUnitReport-Cczz_wY_.js","/assets/Leaderboard-DR9rP4Sj.js","/assets/Leaders-DQSClbJi.js","/assets/Lightbox-WrdN6vbz.js","/assets/LiveOverview-DIDzHaxs.js","/assets/Login-BG6Fd9SM.js","/assets/NotFound-BlRoe6RW.js","/assets/Overview-BO_5Al9z.js","/assets/Pagination-DFzNuI5Q.js","/assets/PerenaladkaFactTable-Cy2kjuE0.js","/assets/PlanFulfillment-bhzFyYOS.js","/assets/Production-D9i5POZ4.js","/assets/Profile-xVUY0__C.js","/assets/ProofCamera-BtUOibzG.js","/assets/ProofPhoto-DKFlp5bl.js","/assets/Quality-BKjGgu1H.js","/assets/RequestStateChip-B0wdvz7J.js","/assets/RichTextEditor-BWK7gX92.js","/assets/SaveState-AsvxvL_k.js","/assets/SearchInput-CaRsneZ_.js","/assets/SeasonalityHeatmap-ewiV1qIe.js","/assets/SegmentedToggle-Dh_AQepT.js","/assets/SetupTimes-BGtIuddO.js","/assets/ShiftDaily-KdHDrCOR.js","/assets/Staff-CGku1_DK.js","/assets/StatusBadge-DgDaWNzq.js","/assets/TargetGoal-CKKMBlmE.js","/assets/Targets-C9PjYjI0.js","/assets/Tasks-DG2DY0lF.js","/assets/TimeWheelPicker-DZaFJBkG.js","/assets/Tooltip-CuQ-VyTx.js","/assets/TrendChart-DbMTnrcA.js","/assets/TripleSpeedometer-V2b-Z3Wm.js","/assets/Trudoyomkost-CyJTHd3s.js","/assets/UsersActivity-BNfCzEsz.js","/assets/WatchProgress-DzqKA8hg.js","/assets/WebLogin-CBtAWcnJ.js","/assets/WorkerConcerns-DackJ-ua.js","/assets/Workers-Ba94950L.js","/assets/Zagruzka-BtzNtQsj.js","/assets/ZagruzkaCell--kjaS84f.js","/assets/alarm-clock-Dbp8eMeB.js","/assets/api-BCa4liE5.js","/assets/archive-CDOzgJ1y.js","/assets/archive-restore-Bg5jd5EA.js","/assets/arrow-down-DsEqNXeB.js","/assets/arrow-left-W2YIwt-4.js","/assets/arrow-left-right-B7jsfe9r.js","/assets/arrow-up-Cufpt61h.js","/assets/arrow-up-right-3rq7SP9P.js","/assets/award-CEcwjnCB.js","/assets/ban-DPy2KcyW.js","/assets/bot-D9EfSuFV.js","/assets/boxes-C-Z3dd99.js","/assets/brigadirFilters-CKCkQvG7.js","/assets/broadcastTree-vqTJ96se.js","/assets/building-2-CWhdkfmL.js","/assets/calendar-clock-DjK8vgis.js","/assets/calendar-days-eB0UPG-z.js","/assets/calendar-e9xythvE.js","/assets/calendar-range-D2tyTxEH.js","/assets/camera-yPX-yk2P.js","/assets/categories-C1GuYhqI.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D_foh0ls.js","/assets/chart-line-kzVBEbkE.js","/assets/chart-pie-aJoYtjeo.js","/assets/chartRange-BbZZKEwP.js","/assets/chevron-left-Cf13RiQj.js","/assets/chevrons-up-down-BnZEvZOA.js","/assets/circle-check-big-CRXklg8Q.js","/assets/circle-dot-DBn_aOQ9.js","/assets/circle-minus-CNgs5goc.js","/assets/circle-slash-BMGFwsk9.js","/assets/circle-user-round-BGewxzyL.js","/assets/cloud-off-CT5VNpD9.js","/assets/cloud-upload-6RyXQv0M.js","/assets/compass-CpdSZmYL.js","/assets/concernCategories-u_a8UyOd.js","/assets/copy-BYcajT_g.js","/assets/corner-down-right-OkZaqTyT.js","/assets/createLucideIcon-CtcDk2PD.js","/assets/es-t5ZOiUlh.js","/assets/exportXlsx-BIMwfEr4.js","/assets/external-link-3qU2TXKB.js","/assets/file-clock-TkgPq8ja.js","/assets/file-exclamation-point-DCK7dgbD.js","/assets/file-spreadsheet-C6-79Vlq.js","/assets/file-text-CnB27-T_.js","/assets/flag-C0qhKVzB.js","/assets/flame-B_mAwQVk.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DpALV_1s.js","/assets/hash-DPtlq-Pp.js","/assets/history-C_8A2Bx5.js","/assets/hourglass-BNqjXAuf.js","/assets/image-ByEexDcH.js","/assets/image-off-DYl_nyX3.js","/assets/index-C6nCzbzv.js","/assets/index-tV0qSnFw.css","/assets/key-round-CcL8AyNC.js","/assets/keyboard-BCY3kL-z.js","/assets/languages-cnAV2CL_.js","/assets/layers-B0u4pDih.js","/assets/leaderReason-CHuA8I5j.js","/assets/lightbulb-CFDZy6q0.js","/assets/link-2-DH2Mx_rf.js","/assets/list-checks-CtELEE0H.js","/assets/list-ordered-DPbqGfgP.js","/assets/list-tree-Cdm8PvyU.js","/assets/lock-open-COK2Az0V.js","/assets/log-in-BHP62QH9.js","/assets/message-square-BS_1RhYm.js","/assets/minimize-2-DU12Jfc6.js","/assets/package-check-B1I0XExk.js","/assets/paperclip-CM9dnsY-.js","/assets/pencil-AEvGZoji.js","/assets/personName-B4KId4zS.js","/assets/pin-nP9m1iaM.js","/assets/play-B8Ec1cLD.js","/assets/presentation-BJDKKdJR.js","/assets/prop-types-CW5G8wf0.js","/assets/radio-BmQW_iJT.js","/assets/react-apexcharts.esm-CS2tTc3e.js","/assets/repeat-BmklUOVe.js","/assets/rotate-ccw-B0a2958j.js","/assets/rotate-cw-CZNp5IDj.js","/assets/save-JZO2_CZ0.js","/assets/scale-BFHHCntF.js","/assets/scroll-text-D7Z9pa05.js","/assets/search-x-UtPKzeqz.js","/assets/segments-TOKdYDho.js","/assets/send-CkiAFauz.js","/assets/settings-2-CL_SAmGU.js","/assets/shield-D6i6NTxf.js","/assets/shield-alert-FfxZwKTJ.js","/assets/shield-check-YwCMPfiL.js","/assets/shield-question-mark-DRh-O46V.js","/assets/siren-BLDfuBHJ.js","/assets/smartphone-CYBp0IHS.js","/assets/snowflake-BVND9czk.js","/assets/square-CtV8DX_Q.js","/assets/square-check-big-1sp8fCDP.js","/assets/star-Bu8d5dKJ.js","/assets/statusBands-CPCekaGU.js","/assets/store-BqCWWQsw.js","/assets/table-2-Bbr7zc05.js","/assets/tag-Cyu2HXm8.js","/assets/trending-down-fwA-3g1O.js","/assets/trending-up-3AgksldO.js","/assets/triangle-alert-B4LfWZjP.js","/assets/undo-2-c1p6k9JC.js","/assets/useChartTheme-BpQtxWR1.js","/assets/useElementWidth-pa2gm27v.js","/assets/useIsMobile-BAIEazDU.js","/assets/useMutation-55pcPfD4.js","/assets/useStatusBands-DrD-otV9.js","/assets/user-CMa35zmN.js","/assets/user-check-zmTYqBOb.js","/assets/user-cog-DRUzbgy5.js","/assets/user-minus-CNCMMgnw.js","/assets/users-CgEkb2XD.js","/assets/verifyState-BSEX-oA8.js","/assets/video-OtbvETWr.js","/assets/wallet-C6onmEn7.js","/assets/warehouse-aJYCH09d.js","/assets/zap-DxmzYcIz.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
