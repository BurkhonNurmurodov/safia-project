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

const BUILD = "2026-10-16T13:22:30.324Z";
const PRECACHE = ["/","/assets/AdminPanel-pWVciR0S.js","/assets/AnalysisBoard-uD2zZVqn.js","/assets/Arc-D6tGgZ-X.js","/assets/Assistant-Di94m-7a.js","/assets/BrigadirProfile-D0mfcXb-.js","/assets/BroadcastReceivers-Bnkg7YRC.js","/assets/BroadcastRecord-vC1Q8YGc.js","/assets/Button-D2djB_L1.js","/assets/CatLockNotice-ClNZFRuy.js","/assets/CategoryLegendModal-CGxpaJil.js","/assets/CellConcerns-0OPQHf3c.js","/assets/CellDetails-BatoBmxq.js","/assets/CellFormModal-Dj44E61P.js","/assets/CellIdent-B5Toq1uN.js","/assets/CellLink-Brw3Y3rA.js","/assets/Cells-CU0dRFN4.js","/assets/ColumnFilter-BF4mbcrh.js","/assets/ColumnsPicker-DWbxZ4LA.js","/assets/CommentsModal-UrR6pyb6.js","/assets/ComparisonTable-Do_iUrH5.js","/assets/Concerns-CtHJJ7GM.js","/assets/CountStepper-DfQriWGU.js","/assets/Daily-DiIYPz7L.js","/assets/DataTable-B3TBH-8B.js","/assets/DateRangePicker-CZBmmq-_.js","/assets/DayReportView-Cc3ON0Am.js","/assets/DayStepper-yGur1-hI.js","/assets/DifferenceBreakdown-D5A0nRjS.js","/assets/Downtime-DaoV37r7.js","/assets/Education-DVhUUCWG.js","/assets/EducationLesson-zleotHLh.js","/assets/EmptyState-DstKZb7e.js","/assets/Exam-Dh3yhFgm.js","/assets/FactorySelect-wmqNOLbI.js","/assets/ForeignObjects-C3-ve6aO.js","/assets/Gamification-XHUHI7xw.js","/assets/GroupBadge-B6FE0xzl.js","/assets/HeatmapChart-CRd9RIH9.js","/assets/IdleCell-CpQPjwIt.js","/assets/KPICard-D5TwBNJi.js","/assets/Kaizen-BmKqjXct.js","/assets/Kelish-BOHv8FJN.js","/assets/KpiDeltaCard-kogQqgfK.js","/assets/LangTextInput-CCIELMqY.js","/assets/Layout-CKnhMFcN.js","/assets/LeaderAppeal-Bpc0HIsb.js","/assets/LeaderDayReport-BcPeAJyR.js","/assets/LeaderUnitReport-BYXgTKpJ.js","/assets/Leaderboard-beQEV31P.js","/assets/Leaders-C3KIBjn_.js","/assets/Lightbox-Dla4aOSg.js","/assets/LiveOverview-BYoU-wTO.js","/assets/Login-Bt3TkNJp.js","/assets/NotFound-MRyp7h-X.js","/assets/Notifications-BXmN9M0S.js","/assets/Overview-FMdbuCVS.js","/assets/Pagination-D0TlvdKA.js","/assets/PerenaladkaFactTable-BQckVxU6.js","/assets/PersonCard-D-khnmjT.js","/assets/PlanFulfillment-VmwTt6cl.js","/assets/Production-CUJQUno-.js","/assets/Profile-CChMcJCf.js","/assets/ProofCamera-BOpw1ls_.js","/assets/Quality-ByqOaS3b.js","/assets/RawRows-B3wjaRaY.js","/assets/RequestStateChip-HQ30Hrb1.js","/assets/RichTextEditor-BqKlkdwo.js","/assets/SaveState-BiYra3-2.js","/assets/SearchInput-DYEke6_i.js","/assets/SeasonalityHeatmap-BcuQjuGV.js","/assets/SegmentedToggle-CsfoStDv.js","/assets/SetupTimes-ChtKe2TF.js","/assets/ShiftDaily-Bbp1zzEh.js","/assets/Staff-Dz2C9FGz.js","/assets/StaffListAtCheck-CHMHwe8j.js","/assets/StatusBadge-Lgb9v8Ym.js","/assets/TargetGoal-nYxBWVzA.js","/assets/Targets-BD4Kg8Wj.js","/assets/Tasks-D_k-yOZM.js","/assets/TimeWheelPicker-DHsDA15a.js","/assets/Toast-C3bi0-EE.js","/assets/Tooltip-Czi8sWYn.js","/assets/TrendChart-5Fo648KY.js","/assets/TripleSpeedometer-CqjErQbj.js","/assets/Trudoyomkost-DhbWw7-5.js","/assets/Turnover-CrCb4ccv.js","/assets/TurnoverBits-eprpVQYv.js","/assets/UploadDropzone-cuMvt665.js","/assets/UsersActivity-BmMsk9D2.js","/assets/VerdictBlock-CeKsUcFp.js","/assets/VfxApiMap-C0zHvO_i.js","/assets/VfxDictionaries-DDdAsC_E.js","/assets/VfxEmployees-Cs2XLHJ-.js","/assets/VfxHrMoves-5SviBLJA.js","/assets/VfxJobs-DiyLZ1ad.js","/assets/VfxPhoto-C1xB3C0k.js","/assets/VfxShifts-DhbXS0yO.js","/assets/VfxState-C_2cXuQn.js","/assets/VfxTimebooks-DGr42yBn.js","/assets/VfxTimesheet-BiN4ZqGG.js","/assets/WatchProgress-DyueUz_s.js","/assets/WebLogin-DmzMtSpl.js","/assets/WorkerConcerns-CRGzXka_.js","/assets/Workers-D9TFaxPG.js","/assets/Zagruzka-BtSZ_jBc.js","/assets/ZagruzkaCell-C9dfn9de.js","/assets/api-C17euHE6.js","/assets/archive-Lagk5T8b.js","/assets/archive-restore-DMCUba9Z.js","/assets/arrow-down-BxaaVxTl.js","/assets/arrow-down-wide-narrow-DbyLigfz.js","/assets/arrow-up-narrow-wide-4073P2fl.js","/assets/award-BLGoFiQ2.js","/assets/ban-DrKsraF8.js","/assets/boxes-NUrwpVMK.js","/assets/braces-DnV_q69U.js","/assets/brigadirFilters-Dr9qOyDy.js","/assets/broadcastTree-NLHUccTv.js","/assets/building-2-BecKiQl_.js","/assets/calculator-B4rppRb3.js","/assets/calendar-DI6YO6Fx.js","/assets/calendar-days-BG6SYYno.js","/assets/camera-BywxTOug.js","/assets/categories-kHmQZ5XY.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BUcFEnvH.js","/assets/chart-line-W8Fxjl8d.js","/assets/chart-pie-DbKWGCpE.js","/assets/chartRange-Clrue6ZT.js","/assets/check-check-DdyMge9I.js","/assets/chevron-left-DPgOWpx1.js","/assets/chevrons-up-down-BC8BXTTs.js","/assets/circle-BERcbo1u.js","/assets/circle-alert-B4F4SSad.js","/assets/circle-check-big-BRah-wiZ.js","/assets/circle-dashed-Ct-Qinui.js","/assets/circle-minus-D9EH2jeK.js","/assets/circle-question-mark-Bnd7nqiS.js","/assets/circle-slash-lvruk-Uj.js","/assets/circle-user-round-DAVH6v7K.js","/assets/clock-3-RHaVKaJ-.js","/assets/cloud-off-BIyulO7w.js","/assets/cloud-upload-ChMDzZPp.js","/assets/compass-CaRdzxsP.js","/assets/concernCategories-CVfwh4Vc.js","/assets/copy-BWa16aZd.js","/assets/corner-down-right-Dxe-Q2Ti.js","/assets/createLucideIcon-1nrFioOG.js","/assets/es-BUap3UpE.js","/assets/external-link-DW8dVdk9.js","/assets/file-clock-CfKsBIxd.js","/assets/file-exclamation-point-CUnRdhYr.js","/assets/flag-uJelFPvQ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C5dtQPCl.js","/assets/hash-eXLzLCCC.js","/assets/hourglass-BRRkII3D.js","/assets/image-BHbI4P0d.js","/assets/image-off-DR-B805B.js","/assets/inbox-BqxwO8KT.js","/assets/index-DqsFM9e_.css","/assets/index-_lS1M1sm.js","/assets/keyboard-Drl0Hysk.js","/assets/languages-tJBbwWCh.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Buhj7W_f.js","/assets/lightbulb-3Uo6BISM.js","/assets/link-2-CWEPJctA.js","/assets/link-2-off-DRkBJzmO.js","/assets/list-ordered-CtW9yacN.js","/assets/list-tree-D8XnznKi.js","/assets/lock-open-CgZNNDFL.js","/assets/log-in-Dl-lfEJ1.js","/assets/marks-CJdxlwCi.js","/assets/minimize-2-BSuvZnBr.js","/assets/package-check-DfXX5Te1.js","/assets/pencil-D3uO5B3b.js","/assets/percent-CFqOoHGg.js","/assets/pin-off-CVQgvubH.js","/assets/pin-zsKiJxsA.js","/assets/play-P6sVxkof.js","/assets/plug-zap--nEelk1a.js","/assets/prop-types-oNV1s711.js","/assets/radio-Dk5MkqcI.js","/assets/react-apexcharts.esm-Ds5z2PWU.js","/assets/registers-Bq1pCwDq.js","/assets/repeat-41huwtCS.js","/assets/save-CUV0bgya.js","/assets/scopeLinks-oE_Y3G2M.js","/assets/scroll-text-BQVDVkKd.js","/assets/search-x-DwZGPVKr.js","/assets/segments-D1CKMbm3.js","/assets/send-D3G02A7b.js","/assets/settings-2-CdAyALtd.js","/assets/shield-5LaKiBZd.js","/assets/shield-alert-BPd_tqw1.js","/assets/shield-question-mark-CY9zXn__.js","/assets/siren-CR7W6Z01.js","/assets/snowflake-Bjr9AMSP.js","/assets/split-DL1MgOAM.js","/assets/square-check-big-D5WM7CM6.js","/assets/star-OLYqafV6.js","/assets/statusBands-wd1JRZuv.js","/assets/store-C6A920XO.js","/assets/table-2-CgwS2CLN.js","/assets/table-properties-BwSMDVam.js","/assets/tag-Cqa00-gj.js","/assets/timer-off-BvYTgw5a.js","/assets/trending-down-Bu1pyw_c.js","/assets/trending-up-DVZ3EPCI.js","/assets/undo-2-tdueGdeO.js","/assets/useChartTheme-I4pFMs0D.js","/assets/useElementWidth-C7Yy0LVQ.js","/assets/useIsMobile-BOVQp91-.js","/assets/useOpenParam-IRjueuOi.js","/assets/useStatusBands-DSKYEf2Y.js","/assets/useUrlScope-BtHxybau.js","/assets/user-DtYH1o-v.js","/assets/user-cog-BvAl_ac5.js","/assets/users-Ctv2J8pN.js","/assets/vfx-DdU8JL90.js","/assets/video-ClJttEA1.js","/assets/wallet-DooX6c1k.js","/assets/warehouse-DjL92aIk.js","/assets/workflow-BhIV3_zZ.js","/assets/x-B2km_RIS.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
