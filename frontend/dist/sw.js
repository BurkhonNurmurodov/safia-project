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

const BUILD = "2026-10-07T04:13:23.571Z";
const PRECACHE = ["/","/assets/AdminPanel-DhflarYC.js","/assets/AnalysisBoard-CrHErtpf.js","/assets/Arc-oMauRvm_.js","/assets/Assistant-CyCV6JVV.js","/assets/BrigadirProfile-Dd5m1tio.js","/assets/BroadcastReceivers-DacUH5xN.js","/assets/BroadcastRecord-BjSl4Hfk.js","/assets/Button-SqW6IEw7.js","/assets/CatLockNotice-By2PhKiy.js","/assets/CategoryLegendModal-Dr5HmgVi.js","/assets/CellConcerns-BNJZNugz.js","/assets/CellDetails-DZZoo5cp.js","/assets/CellFormModal-B6BbvG54.js","/assets/CellIdent-D1_0YclS.js","/assets/CellLink-f24YvKpa.js","/assets/Cells-DP54_UZH.js","/assets/ColumnFilter-1NpToMd2.js","/assets/ColumnsPicker-BWDDfx7h.js","/assets/CommentsModal-Q5jf_BVu.js","/assets/ComparisonTable-DGlEUix0.js","/assets/Concerns-BAshQo9F.js","/assets/Daily-CPumHBim.js","/assets/DataTable-CExMCZ5S.js","/assets/DateRangePicker-BH9BGF7f.js","/assets/DayReportView-CYr9pzuc.js","/assets/DayStepper-DjhHXFWK.js","/assets/DifferenceBreakdown-BUwOaPQ6.js","/assets/Downtime-QBOUyqIe.js","/assets/Education-DZAf3DiH.js","/assets/EducationLesson-jGzPGHzL.js","/assets/EmptyState-B7ZJAVZv.js","/assets/Exam-B4YMsVDn.js","/assets/FactorySelect-B-wdrJCj.js","/assets/Gamification-DC3ZJLyl.js","/assets/GroupBadge-DOPXICC-.js","/assets/HeatmapChart-CV3-k3go.js","/assets/IdleCell-CiRJ2FOy.js","/assets/KPICard-B7WPB-L9.js","/assets/Kaizen-DTj3CSJc.js","/assets/Kelish-ChbkCzr6.js","/assets/KpiDeltaCard-DHtEuZ-6.js","/assets/LangTextInput-CRnfHAcj.js","/assets/Layout-gRBxIL6N.js","/assets/LeaderAppeal-gFlpTMY-.js","/assets/LeaderDayReport-ByyXq8CJ.js","/assets/LeaderUnitReport-D6J5QvSC.js","/assets/Leaderboard-BYOAkrSW.js","/assets/Leaders-3DZqpYiA.js","/assets/Lightbox-B9bVXA0f.js","/assets/LiveOverview-2HdXwnwN.js","/assets/Login-DPDJgjPU.js","/assets/NotFound-BGpJ6Ln7.js","/assets/Notifications-zYeLd88J.js","/assets/Overview--20uy7ez.js","/assets/Pagination-C3SIpDKc.js","/assets/PerenaladkaFactTable-D96DLnWZ.js","/assets/PersonCard-BKkPfttK.js","/assets/PlanFulfillment-CPK2a3ZN.js","/assets/Production-DdtN-VEa.js","/assets/Profile-BzQdkEsQ.js","/assets/ProofCamera-DiQdID_L.js","/assets/ProofPhoto-CdTLpib6.js","/assets/Quality-tO9-XVsp.js","/assets/RawRows-DqtupsTL.js","/assets/RequestStateChip-DQSv_7fs.js","/assets/RichTextEditor-_UpH5B4z.js","/assets/SaveState-Dib-j5vI.js","/assets/SearchInput-DmWxarhy.js","/assets/SeasonalityHeatmap-BCnuafqs.js","/assets/SegmentedToggle-CK15yjs5.js","/assets/SetupTimes-eypTcZ-k.js","/assets/ShiftDaily-CO4z4tmv.js","/assets/Staff-B7eVoNnO.js","/assets/StatusBadge-D3HIKEN6.js","/assets/TargetGoal-CBm3puZD.js","/assets/Targets-l2peDlZF.js","/assets/Tasks-BLq9AWwD.js","/assets/TimeWheelPicker-Bc6GLEYS.js","/assets/Toast-CkGtXS6h.js","/assets/Tooltip-75noVDyd.js","/assets/TrendChart-tZopZwfy.js","/assets/TripleSpeedometer-BuUC8MDx.js","/assets/Trudoyomkost-udgQ-j7e.js","/assets/Turnover-JVmBd9dn.js","/assets/UploadDropzone-Crz59H_A.js","/assets/UsersActivity-C0js-qpP.js","/assets/VerdictBlock-DrM9nzBF.js","/assets/VfxApiMap-CSrnW-fD.js","/assets/VfxDictionaries-D3oWhW8N.js","/assets/VfxEmployees-CFX8Y5CT.js","/assets/VfxHrMoves-Dxwj_HOp.js","/assets/VfxJobs-DKFq_J5f.js","/assets/VfxPhoto-JS_dEcIE.js","/assets/VfxShifts-CgEuVse-.js","/assets/VfxState-xNYynHWr.js","/assets/VfxTimebooks-dPNkRwTR.js","/assets/VfxTimesheet-VPS-G0PV.js","/assets/WatchProgress-DRSx_IXx.js","/assets/WebLogin-Cr4tHFNE.js","/assets/WorkerConcerns-Bz-X-5EM.js","/assets/Workers-DpJ3PGTK.js","/assets/Zagruzka-Cqeejz2m.js","/assets/ZagruzkaCell-DmEThbft.js","/assets/api-CBk3m8JB.js","/assets/archive-BdGfG_LV.js","/assets/archive-restore-BseJ12AW.js","/assets/arrow-down-w93FTmno.js","/assets/arrow-up-narrow-wide-BH6I_qj1.js","/assets/award-DSEEPwaU.js","/assets/ban-BFRuoZOz.js","/assets/boxes-BjfgnN_U.js","/assets/braces-CQw_mc3N.js","/assets/brigadirFilters-C6xeZY7p.js","/assets/broadcastTree-X2xGyJXU.js","/assets/building-2-CrX4PmxO.js","/assets/calculator-CDWk4PTa.js","/assets/calendar-DcWL4Dvn.js","/assets/calendar-days-DGNBbKzu.js","/assets/camera-DTuzJ2_t.js","/assets/categories-DqEbfxzL.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BOQNcR2c.js","/assets/chart-line-qEnf9PCl.js","/assets/chart-pie-ByWkmIu9.js","/assets/chartRange-DAksW7FU.js","/assets/check-check-DaNwQxqG.js","/assets/chevron-left-B2XN51rx.js","/assets/chevrons-up-down-CZAe9eD1.js","/assets/circle-CiT_mYk4.js","/assets/circle-alert-CaqCo5Gt.js","/assets/circle-check-big-Cm84JeaK.js","/assets/circle-dashed-DNk7DdAY.js","/assets/circle-minus-8Dx8J_dT.js","/assets/circle-question-mark-CltSxbFs.js","/assets/circle-slash-VNwv7alw.js","/assets/circle-user-round-BmRfLTdJ.js","/assets/clock-3-Bi04fVHF.js","/assets/cloud-off-Ds8ML7hS.js","/assets/cloud-upload-BuxchTM2.js","/assets/compass-CV33jnMD.js","/assets/concernCategories-DdAUcoxz.js","/assets/copy-o6lV0UqI.js","/assets/corner-down-right-CTfPXp95.js","/assets/createLucideIcon-BBKezvvW.js","/assets/es-BGQigHEx.js","/assets/external-link-DTE2_kRM.js","/assets/file-clock-C45bz3jm.js","/assets/file-exclamation-point-CQnFo2B9.js","/assets/flag-DMc3ClQx.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-oShOvvOi.js","/assets/hash-DMsfkQvP.js","/assets/hourglass-DtG04aqn.js","/assets/image-DIGZIiuL.js","/assets/image-off-BHYgCsj5.js","/assets/inbox-DCfChB33.js","/assets/index-B7yzqq84.css","/assets/index-zZLwGcQS.js","/assets/keyboard-_YgDI1Yr.js","/assets/languages-JzYRXVaA.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DC8udW_T.js","/assets/lightbulb-lY66s8_o.js","/assets/link-2-BW21N6ej.js","/assets/link-2-off-Dou6wI7O.js","/assets/list-ordered-DGvIT7mG.js","/assets/list-tree-CW82AgC8.js","/assets/lock-open-mVAslWr4.js","/assets/log-in-bQNf7e_y.js","/assets/minimize-2-C72cX-5v.js","/assets/package-check-De3NxNTa.js","/assets/pencil-CrFMfeNJ.js","/assets/percent-DMS2cHPe.js","/assets/pin-CMF5Trys.js","/assets/pin-off-BqP-5hUP.js","/assets/play-BdqjoUg7.js","/assets/plug-zap-DTetHYJN.js","/assets/prop-types-BcRqQYzm.js","/assets/radio-CfGX4Eg3.js","/assets/react-apexcharts.esm-yUZ9cE-6.js","/assets/registers-DdAjL-vU.js","/assets/repeat-8PPlJmrH.js","/assets/save-DBU_37w6.js","/assets/scopeLinks-CguFU8X8.js","/assets/scroll-text-K37kGcb0.js","/assets/search-x-oaChux0M.js","/assets/segments-BjzeaCOW.js","/assets/send-vcrWF4H7.js","/assets/settings-2-B2sAqe6n.js","/assets/shield-BZYXqk_Q.js","/assets/shield-alert-DwETeP-w.js","/assets/shield-question-mark-CkJNafRn.js","/assets/siren-yDvcdArV.js","/assets/snowflake-avNDimNJ.js","/assets/split-C6OOdvps.js","/assets/square-check-big-CQQzYbTu.js","/assets/star-BE7KhhOo.js","/assets/statusBands-B7IHN-il.js","/assets/store-CM3vXpd_.js","/assets/table-2-qY_g6d1P.js","/assets/table-properties-uLJUokA2.js","/assets/tag-GQCTqHDV.js","/assets/timer-off-DnmN31ql.js","/assets/trending-down-CohHNw_6.js","/assets/trending-up-D6N2in59.js","/assets/undo-2-CmoOqzDx.js","/assets/useChartTheme-tAOFzJLT.js","/assets/useElementWidth-FtNC_JMs.js","/assets/useIsMobile-byKip2Nt.js","/assets/useOpenParam-CQZuT9QC.js","/assets/useStatusBands-Bh_FLoVt.js","/assets/useUrlScope-DRNJiYyL.js","/assets/user-bgvPd1tW.js","/assets/user-cog-BAm_c1xe.js","/assets/users-BDG4TKIc.js","/assets/vfx-BBSGwxUx.js","/assets/video-C7Uc_pnE.js","/assets/wallet-D1-yIxrx.js","/assets/warehouse-BQWY0iXs.js","/assets/x-qypOPaWs.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
