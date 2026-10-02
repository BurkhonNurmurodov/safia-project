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

const BUILD = "2026-10-02T06:24:42.427Z";
const PRECACHE = ["/","/assets/AdminPanel-DSHkqHYh.js","/assets/AnalysisBoard-Bfc_ct2u.js","/assets/Arc-pArAhR7v.js","/assets/ArcLegacy-DjBdKLql.js","/assets/BrigadirProfile-BWzm_385.js","/assets/BroadcastReceivers-B8F27eid.js","/assets/BroadcastRecord-C1WBEDSg.js","/assets/CatLockNotice-CWzaEFXB.js","/assets/CategoryLegendModal-BjqJOArg.js","/assets/CellConcerns-B9047Wka.js","/assets/CellDetails-DODV_HHM.js","/assets/CellFormModal-qL7gi-5S.js","/assets/CellIdent-BIivIR_Y.js","/assets/CellLink-BkBxiQ-a.js","/assets/Cells-B0-KeuCz.js","/assets/ColumnFilter-BYRRvPnj.js","/assets/ColumnsPicker-CkdRtDuT.js","/assets/CommentsModal-Bg1N225D.js","/assets/ComparisonTable-4ySGLv7d.js","/assets/Concerns-DCkaLVMU.js","/assets/ConfirmDialog-Cj301HgW.js","/assets/Daily-TOlIO7pl.js","/assets/DataTable-zfa1_c4M.js","/assets/DateRangePicker-Vr25CVLU.js","/assets/DayReportView-Cm7KPbu-.js","/assets/DayStepper-BIMGn0HV.js","/assets/DifferenceBreakdown-mM6gbxOd.js","/assets/Downtime-DjDkR27O.js","/assets/Education-enXca-0K.js","/assets/EducationLesson-Dj5vDTRf.js","/assets/EmptyState-BNSPtisb.js","/assets/Exam-BZqgrWtD.js","/assets/FactorySelect-DnXdl6zn.js","/assets/Gamification-Bl2AM6WO.js","/assets/GroupBadge-CgK-nG2g.js","/assets/HeatmapChart-CKEUJSyG.js","/assets/IdleCell-8OYO7zx4.js","/assets/KPICard-C2t4mMmw.js","/assets/Kaizen-CUcuwDI8.js","/assets/Kelish-BWMrBucO.js","/assets/KpiDeltaCard-DUXRfQ-3.js","/assets/LangTextInput-BA3La_ia.js","/assets/Layout-CulOpVsp.js","/assets/LeaderAppeal-mid1UM8e.js","/assets/LeaderDayReport-DxLASoIq.js","/assets/LeaderUnitReport-YaSl1zj5.js","/assets/Leaderboard-CWjwQO1s.js","/assets/Leaders-BVcjfVr8.js","/assets/Lightbox-D90_eICJ.js","/assets/LiveOverview-BVqr9cZx.js","/assets/Login-D6xz0JD4.js","/assets/NotFound-uUIJI8ih.js","/assets/Notifications-B65UvP9E.js","/assets/Overview-B3cKhdgB.js","/assets/Pagination-CW7AuQfx.js","/assets/PerenaladkaFactTable-BGmgGICp.js","/assets/PlanFulfillment-CjGGqpUQ.js","/assets/Production-9dLDLWWw.js","/assets/Profile-t2wix-hM.js","/assets/ProofCamera-DA-J1L_D.js","/assets/ProofPhoto-BcHg2yWq.js","/assets/Quality-luCBmjw6.js","/assets/RequestStateChip-DxTslgD6.js","/assets/RichTextEditor-aL-I5C3C.js","/assets/SaveState-CZcHbNoV.js","/assets/SearchInput-s0WxEgWq.js","/assets/SeasonalityHeatmap-DMb9CDT0.js","/assets/SegmentedToggle-CzW636Mz.js","/assets/SetupTimes-Cm5hy-b2.js","/assets/ShiftDaily-CzmcvANs.js","/assets/Staff-COsFCCno.js","/assets/StaffLive-t0Je5OOM.js","/assets/StatusBadge-BZmpbrWd.js","/assets/TargetGoal-C_xjv5ZD.js","/assets/Targets-CpQO-Y-V.js","/assets/Tasks-BBsle0Ze.js","/assets/TimeWheelPicker-BzYif0DR.js","/assets/Toast-C6jQm2rB.js","/assets/Tooltip-B6FqqTL-.js","/assets/TrendChart-DPthKXKs.js","/assets/TripleSpeedometer-B6AqXrVE.js","/assets/Trudoyomkost-Ce8jjQnz.js","/assets/UploadDropzone-CpXX9ZNG.js","/assets/UsersActivity-HATHx6Q5.js","/assets/VerdictBlock-BDGiTLKG.js","/assets/WatchProgress-cmtgLjq_.js","/assets/WebLogin-DZ9zbyFl.js","/assets/WorkerConcerns-Dv-Qr3Sq.js","/assets/Workers-CeQiKoGT.js","/assets/Zagruzka-CghNP6hj.js","/assets/ZagruzkaCell-BzXO4P0-.js","/assets/api-DZtouV0m.js","/assets/archive-BcB9xAft.js","/assets/archive-restore-DmOu7zVv.js","/assets/arrow-down-DsdxinAA.js","/assets/arrow-left-Bhwm8AaW.js","/assets/arrow-right-left-pcO9VQXJ.js","/assets/arrow-up-BSJsOikl.js","/assets/arrow-up-narrow-wide-DQpXLtmL.js","/assets/arrow-up-right-HsU2zDBK.js","/assets/award-CVAM3G9A.js","/assets/ban-Bd9w5lNP.js","/assets/bot-D-9HYuI7.js","/assets/boxes-BV9E4tYr.js","/assets/brigadirFilters-D30mF2G_.js","/assets/broadcastTree-C20JpqcU.js","/assets/building-2-CD4cUpba.js","/assets/calendar-C982kQpL.js","/assets/calendar-days-lBnl8M8O.js","/assets/calendar-range-q4Vrpqj9.js","/assets/camera-CcJTMod4.js","/assets/categories-Czem5MJk.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CEm9dAM-.js","/assets/chart-line-CW0k0uh0.js","/assets/chart-pie-DWXuEIJC.js","/assets/chartRange-5Tfl6VFn.js","/assets/chevron-left-DJzW161m.js","/assets/chevrons-up-down-DwbyFtPq.js","/assets/circle-XHdXXBG1.js","/assets/circle-alert-CluHyfWi.js","/assets/circle-check-big-CETCcSar.js","/assets/circle-minus-h0wRqeXb.js","/assets/circle-slash-BoimH64H.js","/assets/circle-user-round-B-MiAsIy.js","/assets/cloud-off-DAdOptHA.js","/assets/cloud-upload-DNC5aeE5.js","/assets/compass-TsVv9QOs.js","/assets/concernCategories-CIVyiitr.js","/assets/copy-Ce95DQ45.js","/assets/corner-down-right-eMy6u84Q.js","/assets/createLucideIcon-DZsvtL9O.js","/assets/es-DpnEyEYq.js","/assets/exportXlsx-BWcnLAQh.js","/assets/external-link-ht58ZXeE.js","/assets/file-clock-CwcW21eQ.js","/assets/file-exclamation-point-WBDtUgNT.js","/assets/file-spreadsheet-CNvMez_y.js","/assets/file-text-B2ULpmvF.js","/assets/flag-2HjWMz7H.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DPQWIFby.js","/assets/hash-DGtGhHeF.js","/assets/history-BD3OuQn6.js","/assets/hourglass-DNOwKPgk.js","/assets/id-card-D1cDINJt.js","/assets/image-DjVds7eI.js","/assets/image-off-aWsJug5v.js","/assets/inbox-6RooLR-g.js","/assets/index-CBQ-7RpV.css","/assets/index-DHwaDSEK.js","/assets/key-round-KuXpIZRd.js","/assets/keyboard-sJuzaTli.js","/assets/languages-t1UxNxvw.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BiI6oOzp.js","/assets/lightbulb-B0327gYK.js","/assets/link-2-C-lUYsTA.js","/assets/link-2-off-CCnlSLPO.js","/assets/list-ordered-D5XXQM-o.js","/assets/list-tree-BNEcqzOm.js","/assets/lock-open-B1XFaOFq.js","/assets/log-in-ggSyNz2l.js","/assets/maximize-2-DTgOOfBv.js","/assets/message-square-BJ64-qMZ.js","/assets/minimize-2-CkYa6YZI.js","/assets/package-check-YWEX2tOS.js","/assets/paperclip-BLip2ndY.js","/assets/pencil-B2Nm1VH3.js","/assets/percent-Cs7YwJH8.js","/assets/pin-8IVaMolB.js","/assets/pin-off-uA7AbZhL.js","/assets/play-ChLCT1ib.js","/assets/plug-zap-DyJIq3d1.js","/assets/presentation-Dw2Qx5Tv.js","/assets/prop-types-DDqWe9tZ.js","/assets/radio-C9Pn5lvm.js","/assets/react-apexcharts.esm-BT_naPfx.js","/assets/repeat-Bm8UbB61.js","/assets/rotate-ccw-DNwBrtLx.js","/assets/rotate-cw-3uXa1-XB.js","/assets/save-O0SdR886.js","/assets/scopeLinks-Bmg2dFAD.js","/assets/scroll-text-GYkrsszV.js","/assets/search-x-Diri0KUu.js","/assets/segments-C2fm3SFd.js","/assets/send-C1X2AEcl.js","/assets/settings-2-BgK5twni.js","/assets/shield-BELfWafA.js","/assets/shield-alert-Bth-VFvu.js","/assets/shield-check-BchPiBef.js","/assets/shield-question-mark-Dxl_dW7m.js","/assets/siren-DuMqQdqD.js","/assets/snowflake-BoTWxNs1.js","/assets/split-BZf_4wsA.js","/assets/square-check-big-CeRzPwLN.js","/assets/square-tzUzqCJS.js","/assets/star-CreAQKto.js","/assets/statusBands-DxFFh8ZV.js","/assets/store-a2F87sFp.js","/assets/table-2-C76LlqeO.js","/assets/table-properties-CL13QKPE.js","/assets/tag-DU-Lvtrn.js","/assets/timer-off-BnWPZc7q.js","/assets/trending-down-5R1o2qwN.js","/assets/trending-up-C-OPKHwm.js","/assets/undo-2-0mIl0hro.js","/assets/useChartTheme-BJkepT6v.js","/assets/useElementWidth-2MGaGq41.js","/assets/useIsMobile-B-ItLbcp.js","/assets/useOpenParam-KOyZlfEM.js","/assets/useStatusBands-BBqf28kX.js","/assets/useUrlScope-BjrKpNnv.js","/assets/user-bZaeKgLr.js","/assets/user-cog-C4eY-Qo-.js","/assets/user-minus-CiNL_fYe.js","/assets/users-9E4pzuqB.js","/assets/video-gfx5_Bu-.js","/assets/wallet-DNPRYsQg.js","/assets/warehouse-DFTKH64p.js","/assets/x-C6p6l_vI.js","/assets/zap-Ce3LAYaF.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
