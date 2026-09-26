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

const BUILD = "2026-09-26T10:46:43.748Z";
const PRECACHE = ["/","/assets/AdminPanel-B-QrX6ob.js","/assets/AnalysisBoard-BI2jKr6y.js","/assets/Arc-DAvO6MqX.js","/assets/ArcLegacy-COWiegCc.js","/assets/AttendanceModal-z_h5tUmF.js","/assets/BrigadirProfile-MyE_fL0C.js","/assets/BroadcastReceivers-BwsPKGgr.js","/assets/BroadcastRecord-DXt0Qjnt.js","/assets/CatLockNotice-DCF9a7jU.js","/assets/CategoryLegendModal-CZG7JY_F.js","/assets/CellConcerns-Tc0FBz4w.js","/assets/CellDetails-BU9UG2wM.js","/assets/CellFormModal--40kXvbg.js","/assets/CellLink-DXgbytjj.js","/assets/Cells-D5g-kmbP.js","/assets/ColumnFilter-CvtLY7mX.js","/assets/ColumnsPicker-CFGNcFwM.js","/assets/CommentsModal-DbD3kz2-.js","/assets/ComparisonTable-D6I5Uv_T.js","/assets/Concerns-DNDUPhdh.js","/assets/ConfirmDialog-Jc68UNeW.js","/assets/Daily-Cs3EhL3E.js","/assets/DataTable-Ctv0tYyO.js","/assets/DateRangePicker-xsvv1bCA.js","/assets/DayReportView-DtRPiaNg.js","/assets/DayStepper-C8uCNyEq.js","/assets/DifferenceBreakdown-Cp_boCuO.js","/assets/Downtime-DId9ZzFl.js","/assets/Education-B2sFnmMP.js","/assets/EducationLesson-CdsYBrni.js","/assets/EmptyState-B34Lqu6b.js","/assets/Exam-kzrDIQ2_.js","/assets/FactorySelect-DPiC0jL8.js","/assets/Gamification--ljsaGS5.js","/assets/GroupBadge-BL9wlh0x.js","/assets/HeatmapChart-Cx6uQVzf.js","/assets/IdleCell-Ofe10JBU.js","/assets/KPICard-DNHMl0Gl.js","/assets/Kaizen-BDRCRuvQ.js","/assets/KpiDeltaCard-B7mqHYV5.js","/assets/LangTextInput-Dc9ZoE5T.js","/assets/Layout-Bld_6cow.js","/assets/LeaderAppeal-AEpDuwKv.js","/assets/LeaderDayReport-8izHg8_g.js","/assets/LeaderUnitReport-CegOK1NH.js","/assets/Leaderboard-DXm0hTUR.js","/assets/Leaders-Cv-0SecU.js","/assets/Lightbox-ClmL_aTR.js","/assets/LiveOverview-BmnPrxUc.js","/assets/Login-xJkzjpNB.js","/assets/NotFound-DS7ZZTLv.js","/assets/Overview-DjeMFSZ-.js","/assets/Pagination-CQzR5l0f.js","/assets/PerenaladkaFactTable-D7OpqWpy.js","/assets/PlanFulfillment-_vaMjZEa.js","/assets/Production-D-pSTCBH.js","/assets/Profile-jiO81_39.js","/assets/ProofCamera-BjRGesCm.js","/assets/ProofPhoto-CUIM5dMh.js","/assets/Quality-DIpHi-6a.js","/assets/RequestStateChip-Ba01NaDr.js","/assets/RichTextEditor-DQMtwBqR.js","/assets/SaveState-ucGZaJ5v.js","/assets/SearchInput-DbEezT_1.js","/assets/SeasonalityHeatmap-B1NiMUR3.js","/assets/SegmentedToggle-Cfe43-kT.js","/assets/SetupTimes-DxMVJIlh.js","/assets/ShiftDaily-D1GkJX95.js","/assets/Staff-Qi0WWZWT.js","/assets/StatusBadge-Cr-aWMUr.js","/assets/TargetGoal-D39-rSjJ.js","/assets/Targets-CWoqzYVI.js","/assets/Tasks-Bmdr6NoB.js","/assets/TimeWheelPicker-DxVN8PA9.js","/assets/Tooltip-DsBRNIat.js","/assets/TrendChart--tPi-Kpj.js","/assets/TripleSpeedometer-Bq53w7-A.js","/assets/Trudoyomkost-BVadgyYl.js","/assets/UsersActivity-Y2XCeaxP.js","/assets/WatchProgress-D65gDU_c.js","/assets/WebLogin-CIs2xtEo.js","/assets/WorkerConcerns-BXrlIOnZ.js","/assets/Workers-BRRjf_gc.js","/assets/Zagruzka-Df59AyCp.js","/assets/ZagruzkaCell-Dwxyr3pP.js","/assets/alarm-clock-Cx_NdzNO.js","/assets/api-BX_LuKbV.js","/assets/archive-D-wUai0u.js","/assets/archive-restore-BwK_5Vgs.js","/assets/arrow-down-J2DxeRgT.js","/assets/arrow-left-Duzvs_-0.js","/assets/arrow-left-right-BT8uDnIN.js","/assets/arrow-up-gK2noT7V.js","/assets/award-kUH-uAwW.js","/assets/ban-yg5az3OR.js","/assets/bot-CbaYtQTM.js","/assets/boxes-sxgAxaBS.js","/assets/brigadirFilters-C0rmal18.js","/assets/broadcastTree-DmkOufp8.js","/assets/building-2-CS5iSUa7.js","/assets/calendar-84kT40y7.js","/assets/calendar-clock-Dblzh2_8.js","/assets/calendar-days-CmL9XC21.js","/assets/calendar-range-QeNXwY8x.js","/assets/camera-Cy-xr4X7.js","/assets/categories-D2L2Gtk_.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Bpgf4cC9.js","/assets/chart-line-D7d6tmyy.js","/assets/chart-pie-D1P3C8_P.js","/assets/chartRange-8SJ8TK2W.js","/assets/chevron-left-oYU4dC_d.js","/assets/chevrons-up-down-BSmncr7G.js","/assets/circle-check-big-DKF2KJSl.js","/assets/circle-dot-f0ohJoZC.js","/assets/circle-minus-CxJh0m9M.js","/assets/circle-slash-D3geDqXa.js","/assets/circle-user-round-CowDQjxu.js","/assets/cloud-off-DbpOQCku.js","/assets/cloud-upload-CWb0uZSG.js","/assets/compass-CyA4ilYX.js","/assets/concernCategories-u1SsBXCK.js","/assets/copy-tnz2UIGq.js","/assets/corner-down-right-B6WurdkB.js","/assets/createLucideIcon-BR3qVU4o.js","/assets/es-w5GgdPh6.js","/assets/exportXlsx-CEz5Zvr6.js","/assets/external-link-PMirV0iO.js","/assets/file-clock-rocaEg23.js","/assets/file-exclamation-point-BE2yFxVO.js","/assets/file-spreadsheet-D_53Rzi_.js","/assets/file-text-Dd36K8iC.js","/assets/flag-ChlKrO79.js","/assets/flame-BiPrPixD.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DqZqf2YF.js","/assets/hash-D6cQpuse.js","/assets/history-D79AVSzH.js","/assets/hourglass-DhvkXptZ.js","/assets/image-D3tniqrw.js","/assets/image-off-BmyZVGaX.js","/assets/index-BkYQVf0A.css","/assets/index-CPpVsWcA.js","/assets/key-round-licGp8zZ.js","/assets/keyboard-C1kN6xdk.js","/assets/languages-DIU2R7TF.js","/assets/layers-C6F-eraN.js","/assets/leaderReason-DIAnNUao.js","/assets/lightbulb-DR9yqN8e.js","/assets/link-2-B76ShxRa.js","/assets/list-checks-B_hzYo9f.js","/assets/list-ordered-q7EeDEzg.js","/assets/list-tree-BzD_Zwfc.js","/assets/lock-open-jWL5iJ4k.js","/assets/log-in-DRtLXn8K.js","/assets/message-square-CfnJsSy4.js","/assets/minimize-2-BXrfQ3aC.js","/assets/package-check-BLCwxucd.js","/assets/paperclip-BGJVXp13.js","/assets/pencil-B3mB-r2d.js","/assets/personName-B4KId4zS.js","/assets/pin-BLG8JQCW.js","/assets/play-4LREI3T4.js","/assets/presentation-CssJxvrn.js","/assets/prop-types-F16tkqg4.js","/assets/radio-h5-dlUvN.js","/assets/react-apexcharts.esm-BvKZkAMl.js","/assets/repeat-B2TItE4B.js","/assets/rotate-ccw-CcVtNJw3.js","/assets/rotate-cw-BX6hZyBS.js","/assets/save-cMj0lgHF.js","/assets/scale-Cmgg45Vx.js","/assets/scroll-text-B7LOcjQw.js","/assets/search-x-ClMAdZZX.js","/assets/segments-yogyknln.js","/assets/send-C5gBwKFk.js","/assets/settings-2--7xyTeHD.js","/assets/shield-BoX3Q34H.js","/assets/shield-alert-DOtr-HRD.js","/assets/shield-check-CyFg7fhD.js","/assets/shield-question-mark-DSx2lhDh.js","/assets/siren-BMSB73U3.js","/assets/smartphone-MzxNwSU_.js","/assets/snowflake-BZZeB_zR.js","/assets/square-check-big-symw-4QK.js","/assets/square-kxntRNB8.js","/assets/star-Dg-aes47.js","/assets/statusBands-C4_8RjbX.js","/assets/store-BLztn-oQ.js","/assets/table-2-Dh95EY5g.js","/assets/tag-CyCkDDsc.js","/assets/trending-down-CrQaOLxw.js","/assets/trending-up-OEDxR_YO.js","/assets/triangle-alert-fL-lqFEo.js","/assets/undo-2-Cg-gTy1O.js","/assets/useChartTheme-Bs2g0rQz.js","/assets/useElementWidth-CAaZ7HOt.js","/assets/useIsMobile-DZD6zjTJ.js","/assets/useMutation-DA8-wKg7.js","/assets/useStatusBands-C1aZjb5O.js","/assets/user-L3taBOQo.js","/assets/user-check-DYAPbpcS.js","/assets/user-cog-jNZltGTg.js","/assets/user-minus-pRAXvctw.js","/assets/users-lDiBBQ8y.js","/assets/verifyState-BkByRyX0.js","/assets/video-Csbn_qmO.js","/assets/wallet-DzaFFxXu.js","/assets/warehouse-B-Ozih_n.js","/assets/zap-CI5oQtXr.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
