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

const BUILD = "2026-09-19T06:05:48.579Z";
const PRECACHE = ["/","/assets/AdminPanel-vx3i8JTB.js","/assets/AnalysisBoard-CfM3_EpP.js","/assets/Arc-B5msB9PI.js","/assets/AttendanceModal-B5x8TuRY.js","/assets/BrigadirProfile-Dj9ZPkK7.js","/assets/BroadcastReceivers-CVJXqV0O.js","/assets/BroadcastRecord-CW-RgiDP.js","/assets/CatLockNotice-DD6E9_Pa.js","/assets/CategoryLegendModal-BjLGdXb-.js","/assets/CellConcerns-B3Lo-Tmz.js","/assets/CellDetails-BboBCQw0.js","/assets/CellFormModal-VNMuSebw.js","/assets/CellLink-D5AwWr7g.js","/assets/Cells-Cf20wEu1.js","/assets/ColumnFilter-f6Tkc-lD.js","/assets/ColumnsPicker-DDx_4a3d.js","/assets/CommentsModal-CEId1cB5.js","/assets/ComparisonTable-D8Ja3GPd.js","/assets/Concerns-z1xq7kn6.js","/assets/ConfirmDialog-DMNRAscM.js","/assets/Daily-CVtkofHY.js","/assets/DataTable-C6CK8EFK.js","/assets/DateRangePicker-DELvbJ7u.js","/assets/DayReportView-CAmKcpHC.js","/assets/DayStepper-9HLU0x_h.js","/assets/DifferenceBreakdown-DfOly-Oo.js","/assets/Downtime-D0SyJmcO.js","/assets/Education-DqgJ981d.js","/assets/EducationLesson-DkC7Ohoe.js","/assets/EmptyState-plnwZeo9.js","/assets/FactorySelect-BZXQLhVt.js","/assets/FormField-CA2JSlgg.js","/assets/Gamification-9mfsocaa.js","/assets/GroupBadge-DeUdCD76.js","/assets/HeatmapChart-pWEObVJZ.js","/assets/IdleCell-Rkd5mJrP.js","/assets/KPICard-BVUEd3h9.js","/assets/Kaizen-NJgeQxCG.js","/assets/KpiDeltaCard-DihuLLIF.js","/assets/LangTextInput-CYxMBi0F.js","/assets/Layout-qunjcxdD.js","/assets/LeaderDayReport-H7VScT6e.js","/assets/LeaderUnitReport-ImgbTSnU.js","/assets/Leaderboard-DI_w6JhP.js","/assets/Leaders-Dhpm0Q_p.js","/assets/LiveOverview-C_L1IczS.js","/assets/Login-G7xmQa7x.js","/assets/NotFound-BBE16vMT.js","/assets/Overview-DDvfapZy.js","/assets/Pagination-7_Cs69bL.js","/assets/PerenaladkaFactTable-BFq0hW31.js","/assets/PlanFulfillment-DWkFeU-k.js","/assets/Production-BThrFDuI.js","/assets/Profile-ColvmZd4.js","/assets/ProofCamera-BvihRlr6.js","/assets/ProofPhoto-B27xJ6oo.js","/assets/Quality-Bb5GQOXG.js","/assets/RichTextEditor-DfBmODin.js","/assets/SearchInput-BYq4HDcO.js","/assets/SeasonalityHeatmap-BejMWp4o.js","/assets/SegmentedToggle-CYsCyk2y.js","/assets/SetupTimes-dkBntQwx.js","/assets/ShiftDaily-7KRNUgMy.js","/assets/Skeleton-CjSHQu5O.js","/assets/Staff-09LFDdDr.js","/assets/StatusBadge-CfLIB7W0.js","/assets/StyledSelect-CFxQk3ql.js","/assets/Tasks-DPc9Fk2P.js","/assets/TimeField-BgUna6dK.js","/assets/TimeWheelPicker-DROuygtd.js","/assets/Toast-VwfClK1f.js","/assets/Tooltip-Cbjrn3ZG.js","/assets/TrendChart-D9XdEH5P.js","/assets/TripleSpeedometer-B8ZOwK7A.js","/assets/Trudoyomkost-CsxWjU7c.js","/assets/UsersActivity-B1V573Qi.js","/assets/WatchProgress-YybIE3dw.js","/assets/WebLogin-BFSMvyYd.js","/assets/WorkerConcerns-CCZSWBwR.js","/assets/Workers-P_eF_0-t.js","/assets/Zagruzka-BcXQMgiG.js","/assets/ZagruzkaCell-D3QsHMtK.js","/assets/alarm-clock-DSGIJg5b.js","/assets/api-CM5ZsYg1.js","/assets/archive-BCMHdbi5.js","/assets/archive-restore-DiyiGN0p.js","/assets/arrow-down-BDmuZJ47.js","/assets/arrow-left-CWwxsnfJ.js","/assets/arrow-left-right-DMEzr6wO.js","/assets/arrow-right-Y7DsA-OZ.js","/assets/arrow-up-Bp1nrZYz.js","/assets/award-BlbGKBiN.js","/assets/ban-CojWEBBO.js","/assets/bot-Dd14GIQY.js","/assets/boxes-CmNeYYtu.js","/assets/brigadirFilters-D2VbZUYA.js","/assets/broadcastTree-CWoh87b3.js","/assets/building-2-9YIGJCci.js","/assets/calendar-DNLjBay1.js","/assets/calendar-clock-AjcTPDws.js","/assets/calendar-days-CihYbtZm.js","/assets/calendar-range-C_QAk5Cr.js","/assets/camera-BJEgHKMM.js","/assets/categories-CMSQXb62.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CYUwbz4W.js","/assets/chart-line-BQVHHjPE.js","/assets/chart-pie-u99k8WBn.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-CFC9S5sj.js","/assets/check-B4-YATVH.js","/assets/check-check-DixC7X7a.js","/assets/chevron-left-2G4zk9qR.js","/assets/chevrons-up-down-Ci0HJRbn.js","/assets/circle-dot-BpKBq4Nc.js","/assets/circle-minus-Clr3Aln1.js","/assets/circle-slash-B5AMEIs8.js","/assets/circle-user-round-BfGoumq6.js","/assets/compass-DgKlnALl.js","/assets/concernCategories-BOrG8j3K.js","/assets/copy-COfkx_4e.js","/assets/corner-down-right-DgxmpQvB.js","/assets/createLucideIcon-CPfDR77o.js","/assets/exportXlsx-Dr7i7ALA.js","/assets/external-link-DrPri12j.js","/assets/file-clock-DuBjd97l.js","/assets/file-spreadsheet-BZ0hJybI.js","/assets/file-text-CW1y5dO2.js","/assets/flag-C9HR6IVd.js","/assets/flame-Bg-WGiCp.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-C5IYdmKD.js","/assets/funnel-BGpF1DXE.js","/assets/hash-B6glPAqq.js","/assets/history-CVJ3SMEy.js","/assets/hourglass-DTZjF4JR.js","/assets/image-bf-R2Sdp.js","/assets/image-off-CFc7YWlT.js","/assets/index-D4jc-iLy.js","/assets/index-PYkJVL39.css","/assets/keyboard-C07GwlgP.js","/assets/languages-BoaWRr0g.js","/assets/layers-BDsWA7Wq.js","/assets/leaderReason-DW8dIUuy.js","/assets/lightbulb-Cw5JHvDb.js","/assets/link-2-9H6_Aq3t.js","/assets/list-checks-BLvwGCtl.js","/assets/list-ordered-BRxnlAkx.js","/assets/lock-open-Dy0nB4h1.js","/assets/log-in-BSDoLxnb.js","/assets/message-square-wlj8V9PR.js","/assets/minimize-2-rmWwMo1e.js","/assets/minus-Ca4KWEuC.js","/assets/paperclip-DmAytMIn.js","/assets/pencil-Cx-grDO5.js","/assets/pencil-line-CinMT8OX.js","/assets/personName-B4KId4zS.js","/assets/pin-Du6nDw20.js","/assets/play-BgTlNfdq.js","/assets/prop-types-CP_2nGwm.js","/assets/radio-qrEFl-rZ.js","/assets/react-apexcharts.esm-hdLoNAll.js","/assets/refresh-cw-Ca321iin.js","/assets/repeat-VJJKNUVj.js","/assets/rotate-ccw-BPwZ4b1x.js","/assets/rotate-cw-j8S9AZra.js","/assets/save-DcpZ7XY_.js","/assets/scale-QypEVkyf.js","/assets/scroll-text-B2GwxhIk.js","/assets/search-x-Zk8LNfNx.js","/assets/segments-D1xmiq4i.js","/assets/send-CPV19AcL.js","/assets/settings-2-OStT8jwu.js","/assets/shield-RafEWX93.js","/assets/shield-alert-CCV32ujL.js","/assets/shield-check-BDZ-Gx7i.js","/assets/shield-question-mark-D_E-BD9q.js","/assets/siren-BbflECVm.js","/assets/smartphone-uFKvkKFq.js","/assets/snowflake-DsD1UaWF.js","/assets/star-CGFYoVEZ.js","/assets/statusBands-DnV3V4ep.js","/assets/table-2-Cm_4vUKl.js","/assets/tag-Cf65b0GF.js","/assets/trash-2-DzUxla62.js","/assets/trending-down-RaQzgZDH.js","/assets/trending-up-DkLm2zXT.js","/assets/undo-2-jPcMH_Cl.js","/assets/useChartTheme-CS_5lb1J.js","/assets/useElementWidth-OomAt3bH.js","/assets/useIsMobile-DFxGdBGJ.js","/assets/useMutation-DzvLNUnL.js","/assets/useStatusBands-BrgrzNOK.js","/assets/user-check-nGnXencK.js","/assets/user-cog-BU-eC0mM.js","/assets/user-minus-l0AF-xHy.js","/assets/users-D1cDUcWs.js","/assets/verifyState-pgNcZxS8.js","/assets/video-D3yomn1e.js","/assets/warehouse-B3ZMHBjr.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg"];
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
