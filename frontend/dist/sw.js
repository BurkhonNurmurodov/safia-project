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

const BUILD = "2026-10-12T05:42:33.534Z";
const PRECACHE = ["/","/assets/AdminPanel-CnjrRpPS.js","/assets/AnalysisBoard-C9U13cwq.js","/assets/Arc-BrUlrYIv.js","/assets/Assistant-Cl8Tif9C.js","/assets/BrigadirProfile-DPgrr8Ck.js","/assets/BroadcastReceivers-bF2H7v9G.js","/assets/BroadcastRecord-v4Wlp0si.js","/assets/Button-BxTSFNGc.js","/assets/CatLockNotice-BWUjvT_9.js","/assets/CategoryLegendModal-BYKD6pqF.js","/assets/CellConcerns-GEu_Gapm.js","/assets/CellDetails-D4FGrPUo.js","/assets/CellFormModal-IHq5LrpJ.js","/assets/CellIdent-Meu7kt6P.js","/assets/CellLink-C-6h1amt.js","/assets/Cells-DRy5_K3A.js","/assets/ColumnFilter-BYGUtK2q.js","/assets/ColumnsPicker-CAlAiQw_.js","/assets/CommentsModal-vSpnwzID.js","/assets/ComparisonTable-C9Nb-wKd.js","/assets/Concerns-BwLWFN3m.js","/assets/Daily-2NOwhe3S.js","/assets/DataTable-pLxO0n97.js","/assets/DateRangePicker-DXsvLf_z.js","/assets/DayReportView-CPNFpzef.js","/assets/DayStepper-BX7ksRwX.js","/assets/DifferenceBreakdown-UPP5SvIr.js","/assets/Downtime-DrU9JIMF.js","/assets/Education-VMu3Vlk_.js","/assets/EducationLesson-B343Pwvk.js","/assets/EmptyState-OPxV_HLP.js","/assets/Exam-BH2hs0Nl.js","/assets/FactorySelect-DpsDC5St.js","/assets/Gamification-D6xp1BP4.js","/assets/GroupBadge-Bhokepbh.js","/assets/HeatmapChart-CH2xGvNn.js","/assets/IdleCell-CLq1DzVc.js","/assets/KPICard-Ct-tAyt4.js","/assets/Kaizen-DZYQOIfR.js","/assets/Kelish-Cxn00FFh.js","/assets/KpiDeltaCard-BuQdq_XJ.js","/assets/LangTextInput-CE4jaD7P.js","/assets/Layout-DxquGapS.js","/assets/LeaderAppeal-Dg5lWsKJ.js","/assets/LeaderDayReport-ywtQ32mc.js","/assets/LeaderUnitReport-VLyBSqjt.js","/assets/Leaderboard-zoWhnEtR.js","/assets/Leaders-DP_eyPzz.js","/assets/Lightbox-Drzod4SB.js","/assets/LiveOverview-yQXAxulU.js","/assets/Login-DNhYVlvh.js","/assets/NotFound-CfqbLwpL.js","/assets/Notifications-C2Lrpgz4.js","/assets/Overview-CINeOFAu.js","/assets/Pagination-C0GijXGQ.js","/assets/PerenaladkaFactTable-DknBw9Rc.js","/assets/PersonCard-3DNRnGeF.js","/assets/PlanFulfillment-B8Y_xujJ.js","/assets/Production-n_cS-p8w.js","/assets/Profile-Yh-ar0xt.js","/assets/ProofCamera-DiYsrgsv.js","/assets/ProofPhoto-CN_7U-2V.js","/assets/Quality-Dl8OM8AE.js","/assets/RawRows-CyjVT2X2.js","/assets/RequestStateChip-bdMLQK8k.js","/assets/RichTextEditor-CUi5qXDh.js","/assets/SaveState-Dhw9UZvS.js","/assets/SearchInput-DD7WXMaZ.js","/assets/SeasonalityHeatmap-DTY_Htjt.js","/assets/SegmentedToggle-D4HT20gz.js","/assets/SetupTimes-D2jdFdSL.js","/assets/ShiftDaily-CiMXf8R2.js","/assets/Staff-CGQAbxwN.js","/assets/StatusBadge-CC71qx7_.js","/assets/TargetGoal-BfLRyB18.js","/assets/Targets-Dbz4XSbI.js","/assets/Tasks-y_ib_y1b.js","/assets/TimeWheelPicker-wUfAQYVt.js","/assets/Toast-C3Ijhxjy.js","/assets/Tooltip-DtRmpCPB.js","/assets/TrendChart-lxH9K1Aw.js","/assets/TripleSpeedometer-DfJt4m2k.js","/assets/Trudoyomkost-BffghJVx.js","/assets/Turnover-IrZ-0lx1.js","/assets/UploadDropzone-CqFZP98e.js","/assets/UsersActivity-CW15n7hV.js","/assets/VerdictBlock-CCrECjYk.js","/assets/VfxApiMap-_R10XT9W.js","/assets/VfxDictionaries-CZwmhmbt.js","/assets/VfxEmployees-DkmxyN9i.js","/assets/VfxHrMoves-BFzOoTFe.js","/assets/VfxJobs-tf2aZpiQ.js","/assets/VfxPhoto-D4FIyDBy.js","/assets/VfxShifts-OLXBxCQd.js","/assets/VfxState-DDAAXN0A.js","/assets/VfxTimebooks-IslM9QDB.js","/assets/VfxTimesheet-i3_n6Vqx.js","/assets/WatchProgress-BYvUsm9R.js","/assets/WebLogin-BFBUJFcQ.js","/assets/WorkerConcerns-DMkKF09_.js","/assets/Workers-CwvuE7-_.js","/assets/Zagruzka-sbtWT3Sk.js","/assets/ZagruzkaCell-BT2bLmrH.js","/assets/api-DUbPb2ik.js","/assets/archive-DCEaWjm6.js","/assets/archive-restore-DJR1LKEO.js","/assets/arrow-down-Dp-vAGCn.js","/assets/arrow-down-wide-narrow-Df3PSn6L.js","/assets/arrow-up-narrow-wide-2QqCSbTW.js","/assets/award-BPf38quF.js","/assets/ban-B5WxiaAo.js","/assets/boxes-CjDVa-QD.js","/assets/braces-KaWXRSNP.js","/assets/brigadirFilters-ZSlPq6lX.js","/assets/broadcastTree-2a_duCHZ.js","/assets/building-2-aAX5OnWr.js","/assets/calculator-CuMTiA03.js","/assets/calendar-days-BybbIwgf.js","/assets/calendar-pKCvhybv.js","/assets/camera-EZe16gTI.js","/assets/categories-BYgiXrT0.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-SZX4NlWe.js","/assets/chart-line-CrRdJ84x.js","/assets/chart-pie-CwVidgH9.js","/assets/chartRange-Dqjq3H4Q.js","/assets/check-check-BEHQRaCO.js","/assets/chevron-left-UWrfiXtt.js","/assets/chevrons-up-down-DFqYFjZP.js","/assets/circle-Dk12In8D.js","/assets/circle-alert-bLAAjHRN.js","/assets/circle-check-big-Bmr1i1nO.js","/assets/circle-dashed-f7n38lkX.js","/assets/circle-minus-LhZoWgfP.js","/assets/circle-question-mark-BZXKfVs0.js","/assets/circle-slash-C62UmpRM.js","/assets/circle-user-round-DLGYE3UN.js","/assets/clock-3-BeuMySS7.js","/assets/cloud-off-ChtB3WiX.js","/assets/cloud-upload-DLxKhfuU.js","/assets/compass-DK7vUj2p.js","/assets/concernCategories-DiQ-PoSz.js","/assets/copy-y6D5stGI.js","/assets/corner-down-right-BySroIE7.js","/assets/createLucideIcon-B86OCZ9W.js","/assets/es-C7a_d127.js","/assets/external-link-BNFqPyXf.js","/assets/file-clock-RA1k3ky5.js","/assets/file-exclamation-point-DJApi7iS.js","/assets/flag-CtUjW6xU.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-ClfvXRXh.js","/assets/hash-MEjZ9Ite.js","/assets/hourglass-W4VMYWJE.js","/assets/image-off-DQ-yJhHs.js","/assets/image-uqYDIs2y.js","/assets/inbox-uxcwqfCU.js","/assets/index-CI1cZ1SD.css","/assets/index-Cp_M55Uc.js","/assets/keyboard-CbjDHGK-.js","/assets/languages-C-XFX7B-.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C0oY2-vq.js","/assets/lightbulb-Ddi7KbPY.js","/assets/link-2-DpZCQah_.js","/assets/link-2-off-D63m-GMm.js","/assets/list-ordered-D3i4Uw_H.js","/assets/list-tree-lDdQX73N.js","/assets/lock-open-C29KBkq9.js","/assets/log-in-CCwFY6g5.js","/assets/minimize-2-BtjWkTGo.js","/assets/package-check-DXpGzZnP.js","/assets/pencil-xVICBZ0N.js","/assets/percent-CJ-_A23K.js","/assets/pin-BCnO3Dc_.js","/assets/pin-off-CCgGLOJf.js","/assets/play-1ILbI-hh.js","/assets/plug-zap-CPPGOF77.js","/assets/prop-types-BAeu9vQF.js","/assets/radio-D-k2227k.js","/assets/react-apexcharts.esm-D1IaPIjq.js","/assets/registers-B8Xa0Gwy.js","/assets/repeat-BmAWE5eD.js","/assets/save-BSaga198.js","/assets/scopeLinks-DJ3fpZux.js","/assets/scroll-text-BQu4U_Lw.js","/assets/search-x-mYDrHMvZ.js","/assets/segments-08tV94n2.js","/assets/send-B7FeMixF.js","/assets/settings-2-DvQBAuLY.js","/assets/shield-alert-CNpmuP30.js","/assets/shield-oE0ssf3s.js","/assets/shield-question-mark-BkZnK26G.js","/assets/siren-Gyo8Ls1H.js","/assets/snowflake-BB8fHwJT.js","/assets/split-Z39v7bPV.js","/assets/square-check-big-kYKRtUSt.js","/assets/star-DMRxTBPt.js","/assets/statusBands-B4u0get_.js","/assets/store-CI61TFQB.js","/assets/table-2-CFkbZ0bl.js","/assets/table-properties-C5xaAVft.js","/assets/tag-JY61KaUI.js","/assets/timer-off-KoX7xO9t.js","/assets/trending-down-Du9zKeIZ.js","/assets/trending-up-CYdKwvvA.js","/assets/undo-2-C6KieIt9.js","/assets/useChartTheme-C_2HGLCZ.js","/assets/useElementWidth-DLOFlVKz.js","/assets/useIsMobile-CuLIH0BM.js","/assets/useOpenParam-BMHk3QhO.js","/assets/useStatusBands-CwlGH89p.js","/assets/useUrlScope-BhjZbBVP.js","/assets/user-BW7XmYZ8.js","/assets/user-cog-CNyL_4oq.js","/assets/users-DVbDPArX.js","/assets/vfx-DLPnLKJa.js","/assets/video-CnHvmgMN.js","/assets/wallet-KlNKkudH.js","/assets/warehouse-5c8FK2yV.js","/assets/workflow-n3UaryZ4.js","/assets/x-BeiT99T2.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
