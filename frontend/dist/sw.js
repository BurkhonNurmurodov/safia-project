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
 *     cached shell, then a plain offline page — so a reload still fetches the
 *     deployed index.html and UpdatePrompt's «reload» keeps its meaning;
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

const BUILD = "2026-09-19T11:42:06.621Z";
const PRECACHE = ["/","/assets/AdminPanel-CSaPeKVJ.js","/assets/AnalysisBoard-C_PqeOlx.js","/assets/Arc-5ceaRxMB.js","/assets/AttendanceModal-uVtrVsTb.js","/assets/BrigadirProfile-ACHB4KP_.js","/assets/BroadcastReceivers-HAFlAkHV.js","/assets/BroadcastRecord-BXu3Ti1k.js","/assets/CatLockNotice-BaYzCGon.js","/assets/CategoryLegendModal-CIfgZA6q.js","/assets/CellConcerns-8Iac392E.js","/assets/CellDetails-BCyaKygG.js","/assets/CellFormModal-MC51vZ1L.js","/assets/CellLink-DKarAZaF.js","/assets/Cells-BQVp4NA3.js","/assets/ColumnFilter-te2uaZqW.js","/assets/ColumnsPicker-DhI-SeXX.js","/assets/CommentsModal-BkD-uwzh.js","/assets/ComparisonTable-C-8kBOnM.js","/assets/Concerns-DgcPBS2I.js","/assets/ConfirmDialog-DXzbe2ob.js","/assets/Daily-D4CtY1XZ.js","/assets/DataTable-t5rFIlKx.js","/assets/DateRangePicker-Bt2mQFbt.js","/assets/DayReportView-JLWIEj3s.js","/assets/DayStepper-CuZP1y7E.js","/assets/DifferenceBreakdown-C9Mwwd3r.js","/assets/Downtime-Bx-yxonf.js","/assets/Education-lsHlXBOF.js","/assets/EducationLesson-DldvMGiw.js","/assets/EmptyState-DGv9vJ0z.js","/assets/FactorySelect-DG7KlVj1.js","/assets/FormField-Y-dPREyw.js","/assets/Gamification-B7CKBq7K.js","/assets/GroupBadge-C53q9AAs.js","/assets/HeatmapChart-D_r7c-tr.js","/assets/IdleCell-BZYW1BY3.js","/assets/KPICard-D0qFirQ8.js","/assets/Kaizen-Bh7XSFxp.js","/assets/KpiDeltaCard-DhpX_Pvi.js","/assets/LangTextInput-B4f9z754.js","/assets/Layout-EHO1rn1y.js","/assets/LeaderDayReport-DTMZRGv_.js","/assets/LeaderUnitReport-DTrK_u30.js","/assets/Leaderboard-Bq2FnEV3.js","/assets/Leaders-BWsQAYUj.js","/assets/LiveOverview-FS-MGSEm.js","/assets/Login-WnuyDpB6.js","/assets/NotFound-B-qUsboh.js","/assets/Overview-DhGVk8Q9.js","/assets/Pagination-8K97MQNe.js","/assets/PerenaladkaFactTable-BHkQYZy_.js","/assets/PlanFulfillment-BEOwNtCi.js","/assets/Production-CQVPcJtT.js","/assets/Profile-B1eX5qgX.js","/assets/ProofCamera-B3iD2J1N.js","/assets/ProofPhoto-DKO_oi40.js","/assets/Quality-GvZhz5Ia.js","/assets/RichTextEditor-CBzPNb6t.js","/assets/SearchInput-CM4f0WCj.js","/assets/SeasonalityHeatmap-C4RAUJ9_.js","/assets/SegmentedToggle-D_BnOwKx.js","/assets/SetupTimes-C-vIWB1m.js","/assets/ShiftDaily-BfBhFpQv.js","/assets/Skeleton-DruwHvQm.js","/assets/Staff-B6p-Bw1S.js","/assets/StatusBadge-BWEif-Z5.js","/assets/StyledSelect-BgBR4Wye.js","/assets/Tasks-BSFGW2qT.js","/assets/TimeField-C0lQTYN-.js","/assets/TimeWheelPicker-C65igmjf.js","/assets/Toast-hQ2zO34O.js","/assets/Tooltip-DeEC1Lcu.js","/assets/TrendChart-CG6zDx7s.js","/assets/TripleSpeedometer-6mCF8nrw.js","/assets/Trudoyomkost-cICkN_en.js","/assets/UsersActivity-B01koAkl.js","/assets/WatchProgress-BSeCryzM.js","/assets/WebLogin-Pgx3A01f.js","/assets/WorkerConcerns-Sr1wBjDa.js","/assets/Workers-DLfWO0RW.js","/assets/Zagruzka-BBNuAiKe.js","/assets/ZagruzkaCell-CVBzHNOB.js","/assets/alarm-clock-BdJ9zmSb.js","/assets/api-B3TE4Odf.js","/assets/archive-C0Nniw4C.js","/assets/archive-restore-Dg4ThDbW.js","/assets/arrow-down-yr0WoMZy.js","/assets/arrow-left-DnKGRTZj.js","/assets/arrow-left-right-D8SyZFJw.js","/assets/arrow-right-BSDk1a7Y.js","/assets/arrow-up-C6zPvPiD.js","/assets/award-851UT97P.js","/assets/ban-DncCxTLi.js","/assets/bot-C41P2UAk.js","/assets/boxes-DNSyHmt9.js","/assets/brigadirFilters-BP834gYH.js","/assets/broadcastTree-CvZqnun5.js","/assets/building-2-XmsMsxkP.js","/assets/calendar-DulXP3Q4.js","/assets/calendar-clock-ndBziP9B.js","/assets/calendar-days-Arfww_cr.js","/assets/calendar-range-UWVCYh0W.js","/assets/camera-C_x-N1u6.js","/assets/categories-IYq0BEws.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-w8go-fzM.js","/assets/chart-line-Y0isxXEO.js","/assets/chart-pie-Dm-UWYnl.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-DqMX0dhf.js","/assets/check-DpUdNoMB.js","/assets/check-check-IytyHD4c.js","/assets/chevron-left-CbBmfHBQ.js","/assets/chevrons-up-down-C2Jw5H1Q.js","/assets/circle-dot-DoSz296q.js","/assets/circle-minus-Dbkm_-T-.js","/assets/circle-slash-Daz06N7T.js","/assets/circle-user-round-CpfydQTi.js","/assets/compass-SamW5ugC.js","/assets/concernCategories-8XL_fnGR.js","/assets/copy-Bp8YDPk-.js","/assets/corner-down-right-CPjpQG5j.js","/assets/createLucideIcon-DoRY6UfN.js","/assets/exportXlsx-Bw6zffrT.js","/assets/external-link-CmTNH0_n.js","/assets/file-clock-CGKFiyd1.js","/assets/file-spreadsheet-aFNRCqzl.js","/assets/file-text-CHBls-ho.js","/assets/flag-D1UgKHUC.js","/assets/flame-BAJwM6dd.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-skN2sioe.js","/assets/funnel-D2ZBq7y6.js","/assets/hash-BmwmgoTq.js","/assets/history-Cru6K6BB.js","/assets/hourglass-xM81BT1e.js","/assets/image-DctKL2uI.js","/assets/image-off-DGLrooGt.js","/assets/index-BqI1H9l7.js","/assets/index-PYkJVL39.css","/assets/keyboard-C_SV5-G7.js","/assets/languages-P9hbwFfc.js","/assets/layers-DkeyWN6f.js","/assets/leaderReason-DW8dIUuy.js","/assets/lightbulb-C_48lVHg.js","/assets/link-2-Ct4q0KOx.js","/assets/list-checks-BrIKzten.js","/assets/list-ordered-Bgg63yUD.js","/assets/lock-open-D6C0ZQoL.js","/assets/log-in-RO6n-8h_.js","/assets/message-square-DCw4XIIo.js","/assets/minimize-2-TlAUV1PC.js","/assets/minus-CC-Ary3L.js","/assets/paperclip-CqKzTkNM.js","/assets/pencil-BGQD_nOf.js","/assets/pencil-line-S7UjT_SZ.js","/assets/personName-B4KId4zS.js","/assets/pin-BMYX8zVt.js","/assets/play-BpmHJT_z.js","/assets/prop-types-m40bMPUE.js","/assets/radio-CbaVMuMr.js","/assets/react-apexcharts.esm-BMSbYJUK.js","/assets/refresh-cw-DLr3wq8E.js","/assets/repeat-Db_MuRMI.js","/assets/rotate-ccw-SaOje4qH.js","/assets/rotate-cw-BVEVNk79.js","/assets/save-Dwye0It4.js","/assets/scale-DEpxjYcX.js","/assets/scroll-text-BivkhQlW.js","/assets/search-x-BJ0Zbgkz.js","/assets/segments-BDD0hx-R.js","/assets/send-DMCsXxND.js","/assets/settings-2-CyJDxFB6.js","/assets/shield-CR0nwn2W.js","/assets/shield-alert-DzKb17SE.js","/assets/shield-check-L9lBMv2M.js","/assets/shield-question-mark-Cevc4grS.js","/assets/siren-iqy_Hy9I.js","/assets/smartphone-DHiNaLhi.js","/assets/snowflake-tKcyOz4n.js","/assets/star-B-5kN-rs.js","/assets/statusBands-DI8snG8X.js","/assets/table-2-Ce_LZPIU.js","/assets/tag-CuiSooq4.js","/assets/trash-2-DCuDKigg.js","/assets/trending-down-DqCxtbRx.js","/assets/trending-up-QusNizX0.js","/assets/undo-2-BqGObB90.js","/assets/useChartTheme-BqtSYu0y.js","/assets/useElementWidth-C9zRxLRt.js","/assets/useIsMobile-DWrHnTjJ.js","/assets/useMutation-DgATxoVD.js","/assets/useStatusBands-D5begTM3.js","/assets/user-check-UxgIpKc6.js","/assets/user-cog-BIoZEVSo.js","/assets/user-minus-Da774nt4.js","/assets/users-DB_F3o-I.js","/assets/verifyState-B8qFFDtX.js","/assets/video-D1InHu4B.js","/assets/warehouse-DA5-LQRo.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg"];
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
    // is showing. Hashed assets come out of the browser's own HTTP cache where
    // it already holds them (they are served immutable), so a deploy only ever
    // downloads what changed.
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

async function shell(req) {
  const cache = await caches.open(CACHE);
  const fresh = fetch(req).then((res) => {
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
      cache.put(SHELL, res.clone());
    }
    return res;
  });
  fresh.catch(() => {}); // a failure after the cached shell already went out is not an error
  const late = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS, null));
  try {
    const res = await Promise.race([fresh, late]);
    if (res) return res;
  } catch {
    // offline — fall through to the cached shell
  }
  const cached = await cache.match(SHELL, MATCH);
  if (cached) return cached;
  try {
    return await fresh;
  } catch {
    return offlinePage();
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req, MATCH);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.status === 200) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.status === 200) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(req, MATCH);
    if (hit) return hit;
    throw err;
  }
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
