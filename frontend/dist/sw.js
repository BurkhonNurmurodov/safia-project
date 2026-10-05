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

const BUILD = "2026-10-05T07:57:09.720Z";
const PRECACHE = ["/","/assets/AdminPanel-CZp8f50q.js","/assets/AnalysisBoard-DA3fQAHw.js","/assets/Arc-Lud4uz72.js","/assets/ArcLegacy-CcFYgD8l.js","/assets/BrigadirProfile-EmU0eAvd.js","/assets/BroadcastReceivers-BGsMhwKE.js","/assets/BroadcastRecord-B4-eLcmO.js","/assets/Button-BAQSz-ZT.js","/assets/CatLockNotice-BNceI1YO.js","/assets/CategoryLegendModal-1bnP-RSo.js","/assets/CellConcerns-ByNDLxn8.js","/assets/CellDetails-CEvDHpv2.js","/assets/CellFormModal-BaV3BG9v.js","/assets/CellIdent-B6Iq_EQ7.js","/assets/CellLink-DJsdTX_Q.js","/assets/Cells-BQ1_dkFP.js","/assets/ColumnFilter-BjCxI11F.js","/assets/ColumnsPicker-Bdbq8bBB.js","/assets/CommentsModal-5vNUQSTs.js","/assets/ComparisonTable-LT_FxySh.js","/assets/Concerns-C2ff1r0O.js","/assets/Daily-CPPfX4Tl.js","/assets/DataTable-pX6YcEb1.js","/assets/DateRangePicker-wTvnoORo.js","/assets/DayReportView-B65qYR7D.js","/assets/DayStepper-LHmtjEuX.js","/assets/DifferenceBreakdown-eVutntqa.js","/assets/Downtime-BqvJBbiv.js","/assets/Education-BUG8_Hor.js","/assets/EducationLesson-BYhZ_iqg.js","/assets/EmptyState-CMDBcse4.js","/assets/Exam-BbG8fPCo.js","/assets/FactorySelect-lu4IBMG6.js","/assets/Gamification-CyaV29-K.js","/assets/GroupBadge-Ch5GN0Kh.js","/assets/HeatmapChart-DPKStXnE.js","/assets/IdleCell-D3QrhhCO.js","/assets/KPICard-DDjc5ImO.js","/assets/Kaizen-BaIK1x5_.js","/assets/Kelish-bA-q_Kox.js","/assets/KpiDeltaCard-CVFcIyOY.js","/assets/LangTextInput-D0PzvKjt.js","/assets/Layout-LlcuvXTD.js","/assets/LeaderAppeal-D8-5VmDz.js","/assets/LeaderDayReport-fvLdO3K_.js","/assets/LeaderUnitReport-20ceW-W-.js","/assets/Leaderboard-CE1pubkG.js","/assets/Leaders-DYFTcPor.js","/assets/Lightbox-CPtPHH1R.js","/assets/LiveOverview-UDp-jF2n.js","/assets/Login-CC3vaHRf.js","/assets/NotFound-s0-bDoW4.js","/assets/Notifications-BPHLtH_Z.js","/assets/Overview-DW6qnWdU.js","/assets/Pagination-BSJya90p.js","/assets/PerenaladkaFactTable-xaZyGlAe.js","/assets/PersonCard-DhQX_l8p.js","/assets/PlanFulfillment-C_UFkKTG.js","/assets/Production-quc7CuSt.js","/assets/Profile-Cj6jNRwD.js","/assets/ProofCamera-znDChieM.js","/assets/ProofPhoto-qu1Lc_xZ.js","/assets/Quality-BFEHQCJj.js","/assets/RawRows-VxLxoHEA.js","/assets/RequestStateChip-DhNiwMKV.js","/assets/RichTextEditor-DiRufTah.js","/assets/SaveState-B0Nf23KC.js","/assets/SearchInput-CmzHCgN7.js","/assets/SeasonalityHeatmap-rwNzOMXI.js","/assets/SegmentedToggle-k5E9LhMb.js","/assets/SetupTimes-B9MiyZpv.js","/assets/ShiftDaily-BpZ2nV3Z.js","/assets/Staff-Cai3Nmqc.js","/assets/StaffLive-ldpZ6E_k.js","/assets/StatusBadge-DJUj31pN.js","/assets/TargetGoal-Do5nDO9-.js","/assets/Targets-DwkaIufd.js","/assets/Tasks-BIsBVdbV.js","/assets/TimeWheelPicker-ud0iIbK2.js","/assets/Toast-D4uYAglk.js","/assets/Tooltip-BCqcEq2k.js","/assets/TrendChart-BplV-c98.js","/assets/TripleSpeedometer-B79g8raa.js","/assets/Trudoyomkost-1Re9yZO3.js","/assets/Turnover-C2SPl7p1.js","/assets/UploadDropzone-DIOGWkLJ.js","/assets/UsersActivity-C29r8vex.js","/assets/VerdictBlock-lNNPvarm.js","/assets/VfxApiMap-BSxd4_k3.js","/assets/VfxDictionaries-CruLWjph.js","/assets/VfxEmployees-Di8Hcbt0.js","/assets/VfxHrMoves-Cjj18a_M.js","/assets/VfxJobs-DLtemXC8.js","/assets/VfxPhoto-C2rq2OmA.js","/assets/VfxShifts-BmIc5tOX.js","/assets/VfxState-Bfqu-HXw.js","/assets/VfxTimebooks-C5ukUmi0.js","/assets/VfxTimesheet-BaAtdMfD.js","/assets/WatchProgress-DaouCkAQ.js","/assets/WebLogin-B6Nx0mF-.js","/assets/WorkerConcerns-dz59JMXH.js","/assets/Workers-CQyEiQj1.js","/assets/Zagruzka-DZBKsiKo.js","/assets/ZagruzkaCell-Bhp-e4Cb.js","/assets/api-BF3ZO1tV.js","/assets/archive-7gs5xpCv.js","/assets/archive-restore-q_ArDLEZ.js","/assets/arrow-down-CjIFOG1U.js","/assets/arrow-left-R0aWCtOm.js","/assets/arrow-up-KHElIQyK.js","/assets/arrow-up-narrow-wide-ciJcY8a1.js","/assets/arrow-up-right-CBl2JoPG.js","/assets/award-BrYLnuun.js","/assets/ban-BIv3ODnH.js","/assets/book-open-BTB0hIX7.js","/assets/bot-DUHZ_low.js","/assets/boxes-BoqS4kuJ.js","/assets/braces-BWQuY6uE.js","/assets/brigadirFilters-DK6qGW7R.js","/assets/broadcastTree-B-0qOkYS.js","/assets/building-2-F0EY_tmT.js","/assets/calculator-C6YPm8MC.js","/assets/calendar-Du8C8NOQ.js","/assets/calendar-days-BTJhSgiE.js","/assets/camera-B6Pun-ws.js","/assets/categories-83BeRdxj.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B7TmeUb9.js","/assets/chart-line-CeefWIJM.js","/assets/chart-pie-Ch7EnD8A.js","/assets/chartRange-cqpMjnmm.js","/assets/check-check-DJZyCw5E.js","/assets/chevron-left-WaJS8bhg.js","/assets/chevrons-up-down-BofjHVjD.js","/assets/circle-CLaUDvP4.js","/assets/circle-alert-BUQlppol.js","/assets/circle-check-big-BwMsWqfI.js","/assets/circle-dashed-CV8IFnVe.js","/assets/circle-minus-BgR5mKyJ.js","/assets/circle-question-mark-CPwVihUG.js","/assets/circle-slash-B3ZXDD2s.js","/assets/circle-user-round-ixzCkWoT.js","/assets/clock-3-CaS4jzsy.js","/assets/cloud-off-htE7aFNf.js","/assets/cloud-upload-C14OWSEa.js","/assets/compass-DypGmQWF.js","/assets/concernCategories-weP6ExVG.js","/assets/copy-j7sVYR8b.js","/assets/corner-down-right-B329Y5wi.js","/assets/createLucideIcon-COPd9jNg.js","/assets/es-FAHrWSCr.js","/assets/exportXlsx-js5JC2hM.js","/assets/external-link-IXI0iuuM.js","/assets/file-clock-Dd3c2vQb.js","/assets/file-exclamation-point-CWZDIRIA.js","/assets/file-spreadsheet-BQVI11rn.js","/assets/file-text-CG-ndp53.js","/assets/flag-D2KSyg8Y.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-B1SzyRJJ.js","/assets/hash-hToI5zow.js","/assets/history-DitsN9dX.js","/assets/hourglass-BYc7VHvY.js","/assets/image-hYiZEBSh.js","/assets/image-off-BjmbkUr5.js","/assets/inbox-CXSlt3Rf.js","/assets/index-BarTLmz_.css","/assets/index-DKbL9or9.js","/assets/key-round-DnX7jJL2.js","/assets/keyboard-Cw06Vwn7.js","/assets/languages-CxMtLz9d.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-De8tXWbL.js","/assets/lightbulb-DnHjkNTe.js","/assets/link-2-CmG3Lqaw.js","/assets/link-2-off-ChTovDyd.js","/assets/list-ordered-Dz91iF-D.js","/assets/list-tree-DEBHDj2h.js","/assets/lock-open-BvxT10s1.js","/assets/log-in-MyptlX-8.js","/assets/maximize-2-Dm92-fRX.js","/assets/message-square-DL8hMtWh.js","/assets/minimize-2-DIOS82uu.js","/assets/package-check-DohWiLDr.js","/assets/paperclip-B-oYHa4P.js","/assets/pencil-DNR47qme.js","/assets/percent-CZ7B00Kj.js","/assets/pin-1vZspBhn.js","/assets/pin-off-WwUzRQWm.js","/assets/play-Boa1lwn5.js","/assets/plug-zap-Cj_MfZct.js","/assets/presentation-Dqh5Ydy7.js","/assets/prop-types-DpTBqmGD.js","/assets/radio-C0RaV20s.js","/assets/react-apexcharts.esm-CCr3zGcP.js","/assets/registers-B7Ty8PP-.js","/assets/repeat-BfWo4lIe.js","/assets/rotate-ccw-WFh7ImbU.js","/assets/rotate-cw-DeZaaGy1.js","/assets/save-f_YfSAL2.js","/assets/scopeLinks-no9u4YzW.js","/assets/scroll-text-C-mqSbIU.js","/assets/search-x-k_HKXdoh.js","/assets/segments-BKkq7zdI.js","/assets/send-CdoLlC64.js","/assets/settings-2-Dvzvcl9p.js","/assets/shield-C4EMWbVT.js","/assets/shield-alert-CuEbtnzk.js","/assets/shield-check-hSbiFhFP.js","/assets/shield-question-mark-cMZ9Xy7e.js","/assets/siren-B58McEt_.js","/assets/snowflake-CI9dyddo.js","/assets/split-Bw6-fNQE.js","/assets/square-CccG3Kfb.js","/assets/square-check-big-CZAojjMW.js","/assets/star-CqqK65_D.js","/assets/statusBands-CZHDVRnS.js","/assets/store-kM9P9UwW.js","/assets/table-2-B_ZC0qwe.js","/assets/table-properties-UCduRRS4.js","/assets/tag-Q3WJ7sDn.js","/assets/timer-off-CihZ-Q9y.js","/assets/trending-down-DjBal7Lf.js","/assets/trending-up-BDK5kdVb.js","/assets/undo-2-DSswsxCH.js","/assets/useChartTheme-PAtWrizH.js","/assets/useElementWidth-nvnQ1KRF.js","/assets/useIsMobile-DBHgxKAy.js","/assets/useOpenParam-C0Ygp-rE.js","/assets/useStatusBands-DtOm9B22.js","/assets/useUrlScope-CwhxMWCe.js","/assets/user-CbARsiV0.js","/assets/user-cog-BJJ4efxK.js","/assets/users-BW0pw2rt.js","/assets/vfx-BONJ_D5v.js","/assets/video-_TA6ac27.js","/assets/wallet-CddwokyP.js","/assets/warehouse-CWrxgpfr.js","/assets/x-BFtgB3ah.js","/assets/zap-BfsR84Je.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
