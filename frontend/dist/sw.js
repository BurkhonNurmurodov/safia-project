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

const BUILD = "2026-10-14T16:09:21.883Z";
const PRECACHE = ["/","/assets/AdminPanel-CHMlCTL7.js","/assets/AnalysisBoard-xNrf2jos.js","/assets/Arc-BXYcwOmM.js","/assets/Assistant-BGTzxbZ7.js","/assets/BrigadirProfile-B4gsH7BM.js","/assets/BroadcastReceivers-DZwqDVm0.js","/assets/BroadcastRecord-VeYXNCee.js","/assets/Button-Dfw3k-aQ.js","/assets/CatLockNotice-DvzVTH-X.js","/assets/CategoryLegendModal-VfI2XmMG.js","/assets/CellConcerns-CMQbiMHz.js","/assets/CellDetails-CQkoKQt0.js","/assets/CellFormModal-CjETX4zU.js","/assets/CellIdent-DEW5JBCU.js","/assets/CellLink-CT1hD9tL.js","/assets/Cells-Bbx0JtIf.js","/assets/ColumnFilter-CbxkUHsO.js","/assets/ColumnsPicker-8rD-SmYS.js","/assets/CommentsModal-_N3g4tAQ.js","/assets/ComparisonTable-CZCg321-.js","/assets/Concerns-8tMUXSu1.js","/assets/CountStepper-1hxyExu2.js","/assets/Daily-B8IFChKd.js","/assets/DataTable-eooxg70y.js","/assets/DateRangePicker-BgNyq2Bp.js","/assets/DayReportView-BmXkj3Ol.js","/assets/DayStepper-DRNu_0OT.js","/assets/DifferenceBreakdown-Dd7kEvJT.js","/assets/Downtime-BtkqaJq_.js","/assets/Education-ZmUiET-U.js","/assets/EducationLesson-CNEwiC-X.js","/assets/EmptyState-DoKzV0Wd.js","/assets/Exam-f4rK_NCB.js","/assets/FactorySelect-1eUgunM1.js","/assets/Gamification-Ci993u52.js","/assets/GroupBadge-B_g_xxhm.js","/assets/HeatmapChart-DbfrKWff.js","/assets/IdleCell-CO0rNL8b.js","/assets/KPICard-C5Iwd3O1.js","/assets/Kaizen-tt3X2Q_V.js","/assets/Kelish-CdzZe_Y4.js","/assets/KpiDeltaCard-B6-qDhWo.js","/assets/LangTextInput-DSN_Ghk7.js","/assets/Layout-B4GMFBSl.js","/assets/LeaderAppeal-CTLGY6Dm.js","/assets/LeaderDayReport-C5I9NjHH.js","/assets/LeaderUnitReport-BAhnIWh0.js","/assets/Leaderboard-DohtB7j6.js","/assets/Leaders-B0EagyV9.js","/assets/Lightbox-R4UxIygH.js","/assets/LiveOverview-CIcf0r6r.js","/assets/Login-N0flUreh.js","/assets/NotFound-Byk_7Shp.js","/assets/Notifications-CUxH00e9.js","/assets/Overview-BjkveBlw.js","/assets/Pagination-P_o9QlP4.js","/assets/PerenaladkaFactTable-BqVLbN1U.js","/assets/PersonCard-CIdUeVo2.js","/assets/PlanFulfillment-Dez3PyTI.js","/assets/Production-BYMCcrks.js","/assets/Profile-C0G4QZfI.js","/assets/ProofCamera-CEwsIzPh.js","/assets/Quality-DLLfON0P.js","/assets/RawRows-DaH6iprf.js","/assets/RequestStateChip-DyE7VjpS.js","/assets/RichTextEditor-BNBsGKoA.js","/assets/SaveState-ByecjVyy.js","/assets/SearchInput-BgPe50Ab.js","/assets/SeasonalityHeatmap-BNsSlHic.js","/assets/SegmentedToggle-BOJs_upx.js","/assets/SetupTimes-9PgKrRAI.js","/assets/ShiftDaily-CqfipUut.js","/assets/Staff-CCMOfPwl.js","/assets/StaffListAtCheck-rNkdI4Yx.js","/assets/StatusBadge-DRRoPvQU.js","/assets/TargetGoal-CJoMNRZK.js","/assets/Targets-WrfNxfFR.js","/assets/Tasks-DtoTzlGK.js","/assets/TimeWheelPicker-Cn7NMxDO.js","/assets/Toast-CF7035SI.js","/assets/Tooltip-BerhWPcN.js","/assets/TrendChart-DgfcD6Ku.js","/assets/TripleSpeedometer-DctBBIr_.js","/assets/Trudoyomkost-CxW18Vfh.js","/assets/Turnover-B-Mbef8g.js","/assets/UploadDropzone-BvQJAgiM.js","/assets/UsersActivity-BgB_qTb6.js","/assets/VerdictBlock-5C2944Hx.js","/assets/VfxApiMap-rHTauSjY.js","/assets/VfxDictionaries-6J7fukmz.js","/assets/VfxEmployees-Cl_ri50U.js","/assets/VfxHrMoves-By9m9nMC.js","/assets/VfxJobs-C0L6wabI.js","/assets/VfxPhoto-CeGFlqFb.js","/assets/VfxShifts-Bl-A1Kp4.js","/assets/VfxState-DiA2noBA.js","/assets/VfxTimebooks-D35dzes2.js","/assets/VfxTimesheet-DicLPj-R.js","/assets/WatchProgress-olk-z5Rq.js","/assets/WebLogin-DGLYv8Ab.js","/assets/WorkerConcerns-3G1ilAMa.js","/assets/Workers-CbLW7PYE.js","/assets/Zagruzka-8NMDl-XV.js","/assets/ZagruzkaCell-U_yCngFa.js","/assets/api-DYc5V8E2.js","/assets/archive-D6zdtBJ1.js","/assets/archive-restore-DbHkwyLH.js","/assets/arrow-down-BBiVoDc8.js","/assets/arrow-down-wide-narrow-W4WylBh4.js","/assets/arrow-up-narrow-wide-C7sL4OYC.js","/assets/award-D47RUmux.js","/assets/ban-DEbzFhWw.js","/assets/boxes-jngYWKzV.js","/assets/braces-DgAtO9qP.js","/assets/brigadirFilters-xzDsUOAw.js","/assets/broadcastTree-C3fa2pLq.js","/assets/building-2-CXYnnU92.js","/assets/calculator-DENtqfFN.js","/assets/calendar-Cw_chxBJ.js","/assets/calendar-days-D8kSe1QZ.js","/assets/camera-DzNG_NzD.js","/assets/categories-C-yXJwcw.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cr_WLKDV.js","/assets/chart-line-CBRT5DU1.js","/assets/chart-pie-C0il_Mj8.js","/assets/chartRange-BeN0B_Jw.js","/assets/check-check-CpADvq-f.js","/assets/chevron-left-P0udDyVh.js","/assets/chevrons-up-down-CaU9lY93.js","/assets/circle-CcqSiKX4.js","/assets/circle-alert-DJHVFQlu.js","/assets/circle-check-big-5wcRtnLp.js","/assets/circle-dashed-0dz8Hqlj.js","/assets/circle-minus-Bp2MfcPD.js","/assets/circle-question-mark-j8b2Z69t.js","/assets/circle-slash-DiBthWF0.js","/assets/circle-user-round-BaQZU9tt.js","/assets/clock-3-DZ74lEFD.js","/assets/cloud-off-BEaTuajr.js","/assets/cloud-upload-CtN1WTk6.js","/assets/compass-CpBxP61I.js","/assets/concernCategories-MlRg7lrE.js","/assets/copy-D-bX74iB.js","/assets/corner-down-right-DX54hDtK.js","/assets/createLucideIcon-C6dJk8-Z.js","/assets/es-phwMzgl-.js","/assets/external-link-BXrwctnA.js","/assets/file-clock-CFt51N4s.js","/assets/file-exclamation-point-CR878tdl.js","/assets/flag-DWtceX39.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DsbbBhnw.js","/assets/hash-DCoGsrmT.js","/assets/hourglass-GkYPUtWH.js","/assets/image-C8ODZ4ri.js","/assets/image-off-CoGTON2E.js","/assets/inbox-BICqhANS.js","/assets/index-DHKjhuN3.js","/assets/index-DWCq5gUB.css","/assets/keyboard-DAr29Lrw.js","/assets/languages-B92haJjp.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BymehJ1s.js","/assets/lightbulb-D7823L9V.js","/assets/link-2-CLlWXi2z.js","/assets/link-2-off-BXCqLvIi.js","/assets/list-ordered-tQVuXEeJ.js","/assets/list-tree-sX9H0Q8f.js","/assets/lock-open-Nl0wozUt.js","/assets/log-in-C5WoBTCF.js","/assets/marks-MsH51vH-.js","/assets/minimize-2-DRZ2aW5z.js","/assets/package-check-ONFLGZs0.js","/assets/pencil-izi4rzGP.js","/assets/percent-DZJ9j1Lj.js","/assets/pin-C91d_sA5.js","/assets/pin-off-CKn3YnUR.js","/assets/play-B5nm68-2.js","/assets/plug-zap-Ou3Un_vJ.js","/assets/prop-types-Brxh4mcS.js","/assets/radio-BHAfI84I.js","/assets/react-apexcharts.esm-D-lUenDT.js","/assets/registers-CmcyWgUO.js","/assets/repeat-CupX8UeJ.js","/assets/save-CZyvI_Qd.js","/assets/scopeLinks-iY4TM3HE.js","/assets/scroll-text-CKMYAVL7.js","/assets/search-x-BwZRf6zS.js","/assets/segments-BBN3bxaN.js","/assets/send-DqUP4AfT.js","/assets/settings-2-CtRxavc_.js","/assets/shield-C_ahGjvn.js","/assets/shield-alert-n5zHzKir.js","/assets/shield-question-mark-CewbYpOq.js","/assets/siren-Uqu4Cgl-.js","/assets/snowflake-hSVmQmRI.js","/assets/split-D0oKV2WX.js","/assets/square-check-big-CzEyHs9V.js","/assets/star-DDGyuwtU.js","/assets/statusBands-BCD5yrNk.js","/assets/store-CtIPZvCh.js","/assets/table-2-C-YjFAOY.js","/assets/table-properties-CqZqQuiE.js","/assets/tag-BMPW6C5M.js","/assets/timer-off-B-kHdrRS.js","/assets/trending-down-DAI0b_h6.js","/assets/trending-up-CZERhtwN.js","/assets/undo-2-D9H8NrCs.js","/assets/useChartTheme-Duqgjg6F.js","/assets/useElementWidth-DVWYcJFc.js","/assets/useIsMobile-C3pWuOJ5.js","/assets/useOpenParam-Ccl7hqmN.js","/assets/useStatusBands-BRNGwF2N.js","/assets/useUrlScope-DkR0NqLP.js","/assets/user-BFseH4N2.js","/assets/user-cog-CfJpFAg9.js","/assets/users-BMu-JOra.js","/assets/vfx-U-FhL92R.js","/assets/video-CgSKG2ic.js","/assets/wallet-CszzoMtw.js","/assets/warehouse-DlM1Xt3s.js","/assets/workflow-B5YkCG-v.js","/assets/x-CgCD3GR-.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
