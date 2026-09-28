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

const BUILD = "2026-09-28T15:44:52.873Z";
const PRECACHE = ["/","/assets/AdminPanel-BbuW0WhC.js","/assets/AnalysisBoard-Dg3WmuTL.js","/assets/Arc-CUC_x1MN.js","/assets/ArcLegacy-DR_Ahiv_.js","/assets/AttendanceModal-bkLmq2VZ.js","/assets/BrigadirProfile-KnSlWjiX.js","/assets/BroadcastReceivers-DqxcGmO0.js","/assets/BroadcastRecord-DjQQUqNu.js","/assets/CatLockNotice-BWEBMblO.js","/assets/CategoryLegendModal-Cgs4oSYF.js","/assets/CellConcerns-DDhxY6nY.js","/assets/CellDetails-1Et2QtJO.js","/assets/CellFormModal-Byl149G9.js","/assets/CellLink-CHmX0I24.js","/assets/Cells-QrdvNnTh.js","/assets/ColumnFilter-D6c0sQhH.js","/assets/ColumnsPicker-WxCmitb0.js","/assets/CommentsModal-DwLwCMTe.js","/assets/ComparisonTable-CxWw3WLp.js","/assets/Concerns-LRQbmiho.js","/assets/ConfirmDialog-DsCuK-_6.js","/assets/Daily-BfFlX9nL.js","/assets/DataTable-BSU4Jnrw.js","/assets/DateRangePicker-CjEXmePO.js","/assets/DayReportView-bIFYZ08s.js","/assets/DayStepper-CDCVI5oP.js","/assets/DifferenceBreakdown-B88HijtY.js","/assets/Downtime-BwdbE0wd.js","/assets/Education-MfY2v_Dl.js","/assets/EducationLesson-D5dTczx5.js","/assets/EmptyState-RSEX43-C.js","/assets/Exam-wlJTP6W0.js","/assets/FactorySelect-fm1-HvhV.js","/assets/Gamification-Detm6FbP.js","/assets/GroupBadge-B9_s9Z40.js","/assets/HeatmapChart-CeUiX1-i.js","/assets/IdleCell-BduUccC-.js","/assets/KPICard-DVkaSLiO.js","/assets/Kaizen-mOHn6lq8.js","/assets/Kelish-BGL5kbxd.js","/assets/KpiDeltaCard-BKlEKldJ.js","/assets/LangTextInput-asnLul5T.js","/assets/Layout-CUaZXpu7.js","/assets/LeaderAppeal-DVjVbCFD.js","/assets/LeaderDayReport-BRjaaO3x.js","/assets/LeaderUnitReport-CNGgZ2Bg.js","/assets/Leaderboard-p_nqzeY4.js","/assets/Leaders-CMyLx9xj.js","/assets/Lightbox-QptK445s.js","/assets/LiveOverview-DD2SkIxR.js","/assets/Login-vVfSoup8.js","/assets/NotFound-Bcs-3FUH.js","/assets/Overview-CKBWlVLt.js","/assets/Pagination-DhzKqesH.js","/assets/PerenaladkaFactTable-MCap8aKR.js","/assets/PlanFulfillment-C2n8hme1.js","/assets/Production-Q9WDNcJK.js","/assets/Profile-Dm9lnmg_.js","/assets/ProofCamera-D6_eqUFW.js","/assets/ProofPhoto-CLTw2xjv.js","/assets/Quality-Dik4n88Z.js","/assets/RequestStateChip-iqG3hgRh.js","/assets/RichTextEditor-3ruTQYK2.js","/assets/SaveState-BqY2R_mc.js","/assets/SearchInput-C6FoMFs4.js","/assets/SeasonalityHeatmap-IW8QXoLK.js","/assets/SegmentedToggle-S-EfrTja.js","/assets/SetupTimes-DemLPGXS.js","/assets/ShiftDaily-C13PBFSG.js","/assets/Staff-BWwhSfPz.js","/assets/StatusBadge-C8PViGji.js","/assets/TargetGoal-BL9dMVOP.js","/assets/Targets-BjIJNvFS.js","/assets/Tasks-D4zHKI_4.js","/assets/TimeWheelPicker-DTsGmrvh.js","/assets/Tooltip-oUH2vZrV.js","/assets/TrendChart-zgMANk1i.js","/assets/TripleSpeedometer-CaWecRlx.js","/assets/Trudoyomkost-CfTmp5ME.js","/assets/UploadDropzone-Dx8sRMKr.js","/assets/UsersActivity-BRWx-rw_.js","/assets/VerdictBlock-C9wslrMl.js","/assets/WatchProgress-DVG7iAvX.js","/assets/WebLogin-9brzEmNr.js","/assets/WorkerConcerns-B7Q1liqZ.js","/assets/Workers-wVrALywp.js","/assets/Zagruzka-CS_kYHDc.js","/assets/ZagruzkaCell-o4JIOf52.js","/assets/api-DEdx-ygo.js","/assets/archive-C79YsV9i.js","/assets/archive-restore-Bc9jtp0D.js","/assets/arrow-down-C8RWRYtP.js","/assets/arrow-left-C9gxLFhz.js","/assets/arrow-left-right-CBnYNOSp.js","/assets/arrow-up-BoK03qIQ.js","/assets/arrow-up-right-BvWYR6Y_.js","/assets/award-DY6Xn6Hw.js","/assets/ban-DFRA26sa.js","/assets/bot-njODYl7V.js","/assets/boxes-DYHjtO29.js","/assets/brigadirFilters-CJSOJy1c.js","/assets/broadcastTree-B_HOkG77.js","/assets/building-2-DzqUMTTK.js","/assets/calendar-D0TXUA5m.js","/assets/calendar-clock-DmVS95Mv.js","/assets/calendar-days-DIbEiAMj.js","/assets/calendar-range-Ce684vvf.js","/assets/camera-x7Dcjg0X.js","/assets/categories-BdsR1WO1.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C8TqZdv5.js","/assets/chart-line-QaF27Dfo.js","/assets/chart-pie-BufAXd0y.js","/assets/chartRange-Bs87Loef.js","/assets/chevron-left-DMDE9ubW.js","/assets/chevrons-up-down-CDY9sfw9.js","/assets/circle-BvxA8BnO.js","/assets/circle-check-big-BIbMxElH.js","/assets/circle-dot-BBwI_rhx.js","/assets/circle-minus-BiY6tobk.js","/assets/circle-slash-AzfFIfoA.js","/assets/circle-user-round-CACBjMkC.js","/assets/cloud-off-C44rBy0n.js","/assets/cloud-upload-mK1bcxcy.js","/assets/compass-DfaiZJNe.js","/assets/concernCategories-glGujJNc.js","/assets/copy-C3aQ_1s3.js","/assets/corner-down-right-CJFxDLLy.js","/assets/createLucideIcon-By7w65up.js","/assets/es-DdijHq0G.js","/assets/exportXlsx-CfG-0nDu.js","/assets/external-link-pSf3zrB1.js","/assets/file-clock-Dmjok2Ek.js","/assets/file-exclamation-point-CqwF4vrG.js","/assets/file-spreadsheet-t70UiAlT.js","/assets/file-text-XFUuXKT8.js","/assets/flag-CQjyZ02u.js","/assets/flame-DBaUk8OV.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C-fJnMWd.js","/assets/hash-DM9_cwbz.js","/assets/history-5jyIc2Dd.js","/assets/hourglass-BPpdTjS3.js","/assets/image-C2cRpxsr.js","/assets/image-off-BM0o_qRw.js","/assets/index-BzjndngI.js","/assets/index-IipDX2IN.css","/assets/key-round-DU6eucVi.js","/assets/keyboard-CyOlH3gz.js","/assets/languages-BTJQ4Fxe.js","/assets/layers-Bqy0IW4P.js","/assets/lightbulb-BEtKpKmV.js","/assets/link-2-DCqawmSS.js","/assets/list-checks-C3W1lbKi.js","/assets/list-ordered-Q0Z9Mswg.js","/assets/list-tree-B6tDc8zj.js","/assets/lock-open-TdEuGMLx.js","/assets/log-in-_qpdT7Vi.js","/assets/message-square-DUyIbPDy.js","/assets/minimize-2-Cn76OSqe.js","/assets/package-check-sviTlLdw.js","/assets/paperclip-DSV25IM9.js","/assets/pencil-CSwA0Cjs.js","/assets/percent-C_nxjeOi.js","/assets/personName-B4KId4zS.js","/assets/pin-CwmWd13j.js","/assets/pin-off-BG_zlM2y.js","/assets/play-bGc3DfMN.js","/assets/presentation-B97fJAr4.js","/assets/prop-types-DBNOzrxe.js","/assets/radio-CItdGgUU.js","/assets/react-apexcharts.esm-DvU6HFsD.js","/assets/repeat-BvPeSaw4.js","/assets/rotate-ccw-DFuxPklr.js","/assets/rotate-cw--_Mx4mXs.js","/assets/save-C8eagFqM.js","/assets/scale-CZ5E-z3U.js","/assets/scroll-text-HKgXrmBU.js","/assets/search-x-CNe1tTg0.js","/assets/segments-C_iUcYQ6.js","/assets/send-Bp7_wY9e.js","/assets/settings-2-xX1UPsOz.js","/assets/shield-DO-a7pD3.js","/assets/shield-alert-LM7ELtF-.js","/assets/shield-check-D1lj2Z6d.js","/assets/shield-question-mark-BIlvpzLs.js","/assets/siren-BcG4k1BX.js","/assets/smartphone-C5uD_11w.js","/assets/snowflake-KIYicLBM.js","/assets/square-check-big-DW1xyb1Q.js","/assets/square-nxCUMupt.js","/assets/star-C6uERz5s.js","/assets/statusBands-C_aTzCPJ.js","/assets/store-6HuGJkc9.js","/assets/table-2-C-U7hXSf.js","/assets/tag-BZSa4--h.js","/assets/timer-off-Dmk90UEP.js","/assets/trending-down-CiZcIHFS.js","/assets/trending-up-Bni3ifPE.js","/assets/undo-2-Bd63LyLg.js","/assets/useChartTheme-BoLJbjwI.js","/assets/useElementWidth-C2A-j2_z.js","/assets/useIsMobile-Df2L4eps.js","/assets/useMutation-C6U3Xel6.js","/assets/useStatusBands-uG2bvOIk.js","/assets/user-CM4FLIu-.js","/assets/user-cog-DLkz0KlT.js","/assets/user-minus-oc6bSfP-.js","/assets/users-DL_K_KLp.js","/assets/video-C4TQ5YqK.js","/assets/wallet-DCbT72ng.js","/assets/warehouse-Bnn3CL9F.js","/assets/zap-DR2408yR.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
