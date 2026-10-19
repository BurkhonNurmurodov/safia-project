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

const BUILD = "2026-10-19T12:34:51.548Z";
const PRECACHE = ["/","/assets/AdminPanel-B09_nKln.js","/assets/AnalysisBoard-H8U-sWk-.js","/assets/Arc-C1-1LAW1.js","/assets/Assistant-Bxenf9C0.js","/assets/BrigadirProfile-xBbTVr3x.js","/assets/BroadcastReceivers-CwwU-08l.js","/assets/BroadcastRecord-Dtm7KWqM.js","/assets/Button-M7vLkX1i.js","/assets/CatLockNotice-B4euDxEa.js","/assets/CategoryLegendModal-BcjUtmJ0.js","/assets/CellConcerns-CWNYU3k0.js","/assets/CellDetails-ZVKmQ3hR.js","/assets/CellFormModal-DYbbqLtM.js","/assets/CellIdent-D8duBZbI.js","/assets/CellLink-oPS5V0g8.js","/assets/Cells-CdSWlP0Y.js","/assets/ColumnFilter-C8oOUNP1.js","/assets/ColumnsPicker-D9anETD-.js","/assets/CommentsModal-twtGWe9V.js","/assets/ComparisonTable-CFiwV4e1.js","/assets/Concerns-Ds2mM2u-.js","/assets/CountStepper-Hy8aokTI.js","/assets/Daily-BsuWnIhr.js","/assets/DataTable-BZdk9gT1.js","/assets/DateRangePicker-C0Zd_uTh.js","/assets/DayReportView-BhlH23pt.js","/assets/DayStepper-DE7XS7kV.js","/assets/DifferenceBreakdown-DQGOSzBc.js","/assets/Downtime-CS39Ic9Y.js","/assets/Education-lyS1JMzK.js","/assets/EducationLesson-VMbjy5Tp.js","/assets/EmptyState-C_n5xkad.js","/assets/Exam-CwZ-_jlW.js","/assets/FactorySelect-w5tlGOvU.js","/assets/Gamification-CTOjitlb.js","/assets/GroupBadge-Bv28LRJV.js","/assets/HeatmapChart-DKpOeWno.js","/assets/IdleCell-KNpb_t80.js","/assets/KPICard-Clg2bdmg.js","/assets/Kaizen-SNl6pkRd.js","/assets/Kelish-DK4MnNcO.js","/assets/KpiDeltaCard-C3TKlFEZ.js","/assets/LangTextInput-Bn_zb4GD.js","/assets/Layout-zjnbms4W.js","/assets/LeaderAppeal-HmT9qvTG.js","/assets/LeaderDayReport-ByyJU2ns.js","/assets/LeaderUnitReport-BQB0lyfp.js","/assets/Leaderboard-D3uY60pK.js","/assets/Leaders-CTuqnPOJ.js","/assets/LeadersKpi-BWDXwzTc.js","/assets/Lightbox-SH13_8HB.js","/assets/LiveOverview-DnEenk0M.js","/assets/Login-CuCr3UxS.js","/assets/NotFound-CPRRNr1v.js","/assets/Notifications-Cfn_JqqD.js","/assets/Overview-BfOEt5ya.js","/assets/Pagination-Cnoqy0Ab.js","/assets/PerenaladkaFactTable-BJwRB5-j.js","/assets/PersonCard-B60C8T2j.js","/assets/PlanFulfillment-Br2ZTsWh.js","/assets/Production-1236A5ti.js","/assets/Profile-BN-koEEB.js","/assets/ProofCamera-DSNstAqB.js","/assets/ProofPhoto-Bz6hK0bh.js","/assets/Quality-tELpZ3xo.js","/assets/RawRows-CSa-yUik.js","/assets/RequestStateChip-DWafv632.js","/assets/RichTextEditor-CoFmmJ2F.js","/assets/SaveState-Dwj1Ww9s.js","/assets/SearchInput-n1-3nphL.js","/assets/SeasonalityHeatmap-qIroJpk0.js","/assets/SegmentedToggle-CZrQf3qJ.js","/assets/SetupTimes-CKgdp9wR.js","/assets/ShiftDaily-Da353rHf.js","/assets/Staff-6GSCKIe3.js","/assets/StaffListAtCheck-Cg1Gwfoq.js","/assets/StatusBadge-CG9kpU2h.js","/assets/TargetGoal-BYoaDz0m.js","/assets/Targets-DdFWsDA6.js","/assets/Tasks-Dm7jrodP.js","/assets/TimeWheelPicker-D-q9sVXn.js","/assets/Toast-Cj378nvS.js","/assets/Tooltip-B4F3Cf_O.js","/assets/TrendChart-DmRu06Q1.js","/assets/TripleSpeedometer-CodlPJVQ.js","/assets/Trudoyomkost-QDEkZWBu.js","/assets/UploadDropzone-BAuEvkiF.js","/assets/UsersActivity-D_rpLyHD.js","/assets/VerdictBlock-Dgn2X5eH.js","/assets/VfxApiMap-BxJF3DSa.js","/assets/VfxDictionaries-CxiqLAZF.js","/assets/VfxEmployees-Ks2cyecH.js","/assets/VfxHrMoves-DgFDSOcD.js","/assets/VfxJobs-xk_HBJN6.js","/assets/VfxPhoto-xLXyLUcC.js","/assets/VfxShifts-DNXyzHPH.js","/assets/VfxState-CNPXQT63.js","/assets/VfxTimebooks-g0HCBUoI.js","/assets/VfxTimesheet-BcWwX6wd.js","/assets/WatchProgress-u4GcmTOz.js","/assets/WebLogin-CuiEFqsi.js","/assets/Workers-CQ7B14Nw.js","/assets/Zagruzka-CdVp_33J.js","/assets/ZagruzkaCell-CyahnDp9.js","/assets/api-5z_9c5db.js","/assets/archive-DOoOQLTB.js","/assets/archive-restore-DKeflI1U.js","/assets/arrow-down-CBpDciqv.js","/assets/arrow-down-right-B6mFsBMA.js","/assets/arrow-down-wide-narrow-BdEMEJeu.js","/assets/arrow-up-narrow-wide-C8ZP7KTQ.js","/assets/ban-CyxQe11V.js","/assets/boxes-BIc3LwRe.js","/assets/braces-Bv_HAPom.js","/assets/brigadirFilters-NhV-YmyT.js","/assets/broadcastTree-_9F87bMC.js","/assets/building-2-CdeYLGDH.js","/assets/calculator-B44FSyLn.js","/assets/calendar-C_ikPJ2G.js","/assets/calendar-days-DlNbOOKJ.js","/assets/camera-B53bmov9.js","/assets/categories-DezYhjkD.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DmuIilak.js","/assets/chart-line-CpvPqKsK.js","/assets/chart-pie-D2LtsfvA.js","/assets/chartRange-CmUxyumR.js","/assets/check-check-DCZds9Hd.js","/assets/chevron-left-nwN2Z0Jb.js","/assets/chevrons-up-down-CCYjqyBa.js","/assets/circle-alert-D2Ep0lmm.js","/assets/circle-check-big-CZcgq7Zl.js","/assets/circle-dashed-QCLB8_wC.js","/assets/circle-l31O57uR.js","/assets/circle-minus-d_B5SKAV.js","/assets/circle-question-mark-Drz-6211.js","/assets/circle-slash-R2ntNX_S.js","/assets/circle-user-round-X_ND7OL4.js","/assets/cloud-off-CCPp00vj.js","/assets/cloud-upload-DaVjL8DZ.js","/assets/compass-BuAiS_iJ.js","/assets/concernCategories-BEJkpyR0.js","/assets/corner-down-right-CV_s1vES.js","/assets/createLucideIcon-CiQQZwxL.js","/assets/es-C7BFiDa-.js","/assets/external-link-BiAMgBlO.js","/assets/file-clock-EJ0qBwmw.js","/assets/file-exclamation-point-DsKHM3G8.js","/assets/flag-DTAMFoxj.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DIKZy15H.js","/assets/funnel-Bj3zm9Ng.js","/assets/hash-CdbEK01i.js","/assets/hourglass-DiQqp46N.js","/assets/image-CYeVyiSq.js","/assets/image-off-3WGRfCd2.js","/assets/inbox-OCmbQuxX.js","/assets/index-B-bGhMav.css","/assets/index-Bo2oG9Y4.js","/assets/keyboard-DGbYEiFx.js","/assets/languages-DS8VdVFm.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DMV3gwJP.js","/assets/lightbulb-pxh6Mulj.js","/assets/link-2-CKNbL0NU.js","/assets/link-2-off-XoH3UH6V.js","/assets/list-ordered-D_J_fdYb.js","/assets/list-tree-CNYArTWl.js","/assets/lock-open-B6p9jmbf.js","/assets/log-in-DXog9BOU.js","/assets/marks-PjQKxWvZ.js","/assets/minimize-2-BzRjW3S6.js","/assets/package-check-CnECSBUQ.js","/assets/pencil-Ch2OQILB.js","/assets/percent-BvotJDyc.js","/assets/pin-BRuyEDdc.js","/assets/pin-off-Csyva71V.js","/assets/play-DTUXzeSC.js","/assets/plug-zap-CFCY5GR2.js","/assets/prop-types-eyB2HXPg.js","/assets/radio-CFxA8y2b.js","/assets/react-apexcharts.esm-D5r7rt20.js","/assets/registers-CGSeJ422.js","/assets/repeat-DuzZ9wk1.js","/assets/save-Dt3yTwwX.js","/assets/scopeLinks-xBrXXphh.js","/assets/scroll-text-D8pRsft9.js","/assets/search-x-DboldaRb.js","/assets/segments-J1lHmPzn.js","/assets/send-vFERjv2o.js","/assets/settings-2-DKgy0EM3.js","/assets/shield-Crb6K6hW.js","/assets/shield-alert-CEwUOw3m.js","/assets/shield-question-mark-DjKjEcIJ.js","/assets/siren-CAaWzBoE.js","/assets/snowflake-Bo8j2zhY.js","/assets/split-CWKJaYgd.js","/assets/square-check-big-BnraSkN7.js","/assets/star-C41uvLqH.js","/assets/statusBands-BIz-fAD8.js","/assets/store-Cygmz2k7.js","/assets/table-2-Gx3ZgDty.js","/assets/table-properties-BpOqF6lk.js","/assets/tag-ChsgUkvK.js","/assets/timer-off-h3uSJF9d.js","/assets/trending-down-BdwXmgM9.js","/assets/trending-up-MsZb22Js.js","/assets/undo-2-8EdjgnwD.js","/assets/useChartTheme-DgQHaNKw.js","/assets/useElementWidth-CY88NZ6e.js","/assets/useIsMobile-hmCGcNrc.js","/assets/useOpenParam-BgIHZjCX.js","/assets/useStatusBands-BO30mY3G.js","/assets/useUrlScope-D97ZOru9.js","/assets/user-B2-NDNN8.js","/assets/user-cog-Dklj9e1k.js","/assets/user-minus-Ccf3KHrf.js","/assets/users-BvpcAM5B.js","/assets/vfx-DeRscVpQ.js","/assets/video-Bzsj3JIg.js","/assets/wallet-8Ob4SMie.js","/assets/warehouse-Ca5KMTxK.js","/assets/workflow-G-0I506V.js","/assets/x-DXOjx9Ys.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
