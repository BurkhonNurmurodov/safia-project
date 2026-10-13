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

const BUILD = "2026-10-13T16:18:40.126Z";
const PRECACHE = ["/","/assets/AdminPanel-Bqh2B38F.js","/assets/AnalysisBoard-DopwKLL0.js","/assets/Arc-DusNFe1N.js","/assets/Assistant-8snbk0a-.js","/assets/BrigadirProfile-CRaSo3Zt.js","/assets/BroadcastReceivers-B-_sqHwj.js","/assets/BroadcastRecord-CHvvFG__.js","/assets/Button-BugvrGP9.js","/assets/CatLockNotice-Bn9nPk6E.js","/assets/CategoryLegendModal-B7C72J2L.js","/assets/CellConcerns-DVesa_ZF.js","/assets/CellDetails-C1BwW_1p.js","/assets/CellFormModal-BWRW795j.js","/assets/CellIdent-Cu0OlsYx.js","/assets/CellLink-CQNdVd5W.js","/assets/Cells-pD-mVmfN.js","/assets/ColumnFilter-BX4ThoXU.js","/assets/ColumnsPicker-CSAt9Aea.js","/assets/CommentsModal-WtgqGGPn.js","/assets/ComparisonTable-WY-b2Vsp.js","/assets/Concerns-xws3qq1e.js","/assets/CountStepper-BC2tasVe.js","/assets/Daily-CT0k5cAq.js","/assets/DataTable-Bkli9CEd.js","/assets/DateRangePicker-CFwXbHoV.js","/assets/DayReportView-DzFOUEAf.js","/assets/DayStepper-Dq0BxG9Y.js","/assets/DifferenceBreakdown-DxsJn3zj.js","/assets/Downtime-ChrB4QHH.js","/assets/Education-Dmey3htb.js","/assets/EducationLesson-DebhQRoa.js","/assets/EmptyState-BDv9Rygl.js","/assets/Exam-B8jMCjK9.js","/assets/FactorySelect-xgvo8NH-.js","/assets/Gamification-DeC0IhQP.js","/assets/GroupBadge-BUKbzIs9.js","/assets/HeatmapChart-BOYh5pOf.js","/assets/IdleCell-BHBR1SBG.js","/assets/KPICard-BMikj8jm.js","/assets/Kaizen-Cih0ohAu.js","/assets/Kelish-zQuGOYJ3.js","/assets/KpiDeltaCard-Bp1bIXnr.js","/assets/LangTextInput-B-p_UCb9.js","/assets/Layout-Bv3HoCvS.js","/assets/LeaderAppeal-1O29ZGgS.js","/assets/LeaderDayReport-0hlGp5BW.js","/assets/LeaderUnitReport-BzFdDQcL.js","/assets/Leaderboard-338RE0Pl.js","/assets/Leaders-DDwSRA3q.js","/assets/Lightbox-D6_Hte38.js","/assets/LiveOverview-DaZGL45l.js","/assets/Login-D8TIsqHW.js","/assets/NotFound-UCCKoUxZ.js","/assets/Notifications-BMgPjFAN.js","/assets/Overview-D4DzmuDM.js","/assets/Pagination-BfBK9tjZ.js","/assets/PerenaladkaFactTable-xjJzBAiu.js","/assets/PersonCard-DA-Eu6d-.js","/assets/PlanFulfillment-CakfuRt3.js","/assets/Production-BWoXLVCV.js","/assets/Profile-GlOuSAuZ.js","/assets/ProofCamera-NYeW0Ied.js","/assets/Quality-CE_Faz-b.js","/assets/RawRows-Dhcbo6TP.js","/assets/RequestStateChip-BAkWu4Jl.js","/assets/RichTextEditor-YQzZqd0b.js","/assets/SaveState-C7Je-4BG.js","/assets/SearchInput-D9Oqmojm.js","/assets/SeasonalityHeatmap-CqMTNrQ0.js","/assets/SegmentedToggle-BFv59N3H.js","/assets/SetupTimes-BV-DPbL8.js","/assets/ShiftDaily-DIGGqyg7.js","/assets/Staff-APVKqxJE.js","/assets/StaffListAtCheck-C5eJ1Z1P.js","/assets/StatusBadge-up9fsSnz.js","/assets/TargetGoal-za5eTjA_.js","/assets/Targets-BWMc0bpl.js","/assets/Tasks-DB1QgBxC.js","/assets/TimeWheelPicker-DrOrJU7p.js","/assets/Toast-t8eVM1lL.js","/assets/Tooltip-CZhMW219.js","/assets/TrendChart-GqHFGGfn.js","/assets/TripleSpeedometer-CFgacDdg.js","/assets/Trudoyomkost-BTSYweTx.js","/assets/Turnover-XILjDjBK.js","/assets/UploadDropzone-CZjMDxny.js","/assets/UsersActivity-DHL8pYyV.js","/assets/VerdictBlock-B_akINtY.js","/assets/VfxApiMap-2DtkXz5K.js","/assets/VfxDictionaries-DZMz2lqH.js","/assets/VfxEmployees-CZVrfO8E.js","/assets/VfxHrMoves-CnHP2tzL.js","/assets/VfxJobs-DYLrZRPo.js","/assets/VfxPhoto-CiT2fEKx.js","/assets/VfxShifts-CyDe4xi8.js","/assets/VfxState-BKCGq7kG.js","/assets/VfxTimebooks-CaGI44ya.js","/assets/VfxTimesheet-NHMn9ydM.js","/assets/WatchProgress-BgFpQd4g.js","/assets/WebLogin-Cw-gI-Hv.js","/assets/WorkerConcerns-QEq7CIwK.js","/assets/Workers-h9HTZMgQ.js","/assets/Zagruzka-B-uQPDi9.js","/assets/ZagruzkaCell-125t3FdX.js","/assets/api-DlYFYIHK.js","/assets/archive-kp3_-mI2.js","/assets/archive-restore-DjMm_yLt.js","/assets/arrow-down-DxijWm2h.js","/assets/arrow-down-wide-narrow-C1QdL7g7.js","/assets/arrow-up-narrow-wide-kNuxP_q7.js","/assets/award-D2YQ2L6R.js","/assets/ban-CxhUWM04.js","/assets/boxes-BQCuH2ZN.js","/assets/braces-Bl8GI9po.js","/assets/brigadirFilters-Ct-8OmlL.js","/assets/broadcastTree-bOcb7Szx.js","/assets/building-2-C5_6zjvX.js","/assets/calculator-CNppodJ4.js","/assets/calendar-CKtjknWI.js","/assets/calendar-days-DKu6J7sd.js","/assets/camera-BsQucUqc.js","/assets/categories-BvBKrRpe.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C2QoutF3.js","/assets/chart-line-CfsMDAGh.js","/assets/chart-pie-ZDVlSPo4.js","/assets/chartRange-6_eNgAP9.js","/assets/check-check-DJaXCmsh.js","/assets/chevron-left-BQQ6s6X2.js","/assets/chevrons-up-down-BuHTNBxc.js","/assets/circle-BhHD9Nsd.js","/assets/circle-alert-1DcfqKXS.js","/assets/circle-check-big-N9vZyaP0.js","/assets/circle-dashed-CprZXqCD.js","/assets/circle-minus-mBnzB63y.js","/assets/circle-question-mark-D5U3uyIh.js","/assets/circle-slash-AC5zSKti.js","/assets/circle-user-round-DaQnYyg9.js","/assets/clock-3-Dm1U4HOu.js","/assets/cloud-off-BY5iL7ER.js","/assets/cloud-upload-DEnZJRWs.js","/assets/compass-Bc_TvBbE.js","/assets/concernCategories-CA_zS-Xj.js","/assets/copy-BtEiBwpj.js","/assets/corner-down-right-D_Ll8ed7.js","/assets/createLucideIcon-CetqDCPe.js","/assets/es-Dq9M_38a.js","/assets/external-link-Wdzs5P3w.js","/assets/file-clock-Com4ryJq.js","/assets/file-exclamation-point-B1kXdPn-.js","/assets/flag-DS_XBvX0.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C0X1-47o.js","/assets/hash-B0jbz3Bz.js","/assets/hourglass-C145j4gY.js","/assets/image-CB_lQ1rQ.js","/assets/image-off-BgKLYKF4.js","/assets/inbox-C0APxjAT.js","/assets/index-7f1rnqtY.css","/assets/index-CIPwacR2.js","/assets/keyboard-BAhw6n2l.js","/assets/languages-D1X7CK7X.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-z0-Lk8zH.js","/assets/lightbulb-D2ciX6eY.js","/assets/link-2-DcmQepZY.js","/assets/link-2-off-H_os3TBr.js","/assets/list-ordered-beUv1HHS.js","/assets/list-tree-C_c5YobQ.js","/assets/lock-open--dbl0GCB.js","/assets/log-in-vvk4znb9.js","/assets/marks-CeA1PCq0.js","/assets/minimize-2-bpwpwE3G.js","/assets/package-check-Bvg-DijI.js","/assets/pencil-BmCiFuUr.js","/assets/percent-CFPi2cUa.js","/assets/pin-Dt29cqdc.js","/assets/pin-off-B7uvqkQk.js","/assets/play-DjcAs6k3.js","/assets/plug-zap-CA105_CS.js","/assets/prop-types-Dnvfst5Y.js","/assets/radio-DHMfpkzo.js","/assets/react-apexcharts.esm-DBp_jtLC.js","/assets/registers-BF--Ub98.js","/assets/repeat-B0ZDFBiO.js","/assets/save-DspoCV8V.js","/assets/scopeLinks-jEWoVB-0.js","/assets/scroll-text-B9ZMLvLt.js","/assets/search-x-B7NxMCg7.js","/assets/segments-DKYrcsbL.js","/assets/send-D7KKHCru.js","/assets/settings-2-DwloB88s.js","/assets/shield-ImoU622C.js","/assets/shield-alert-CmRDs8aC.js","/assets/shield-question-mark--c_eOCu8.js","/assets/siren-CmV8ojRz.js","/assets/snowflake-CbRYca8I.js","/assets/split-k8IWXQ2X.js","/assets/square-check-big-DKMCYR9g.js","/assets/star-BwPY-q93.js","/assets/statusBands-2GfuNOVX.js","/assets/store-JihPDNAL.js","/assets/table-2-CJZdqox0.js","/assets/table-properties-DP0P-WdG.js","/assets/tag-Cp6LUhxu.js","/assets/timer-off-CKlP1rpV.js","/assets/trending-down-ByyReu90.js","/assets/trending-up-BxgFRh-0.js","/assets/undo-2-o9p1lEIs.js","/assets/useChartTheme-CU3_sd-4.js","/assets/useElementWidth-DkO00gov.js","/assets/useIsMobile-D_LJZQaU.js","/assets/useOpenParam-Cro5UgWC.js","/assets/useStatusBands-COsU1JOz.js","/assets/useUrlScope-LWAAZ2Pc.js","/assets/user-DMX6CgtI.js","/assets/user-cog-ZQqoIEyP.js","/assets/users-8Iv9xKEX.js","/assets/vfx-BLqZdTZO.js","/assets/video-B5NCa3t-.js","/assets/wallet-BbeQN4HC.js","/assets/warehouse-DfeELM_v.js","/assets/workflow-DPKu-U5e.js","/assets/x-N3IATrga.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png"];
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
