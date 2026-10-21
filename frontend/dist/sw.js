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

const BUILD = "2026-10-21T06:11:20.170Z";
const PRECACHE = ["/","/assets/AdminPanel-B0a-bAc1.js","/assets/AnalysisBoard-Drt-4gYZ.js","/assets/Arc-g-9O_lhk.js","/assets/Assistant-A7wPQjsi.js","/assets/BrigadirProfile-Dqx298Dv.js","/assets/BroadcastReceivers-CoSmZvq5.js","/assets/BroadcastRecord-B7PoIf6H.js","/assets/Button-Bt0qT25Z.js","/assets/CatLockNotice-ErFAR3kc.js","/assets/CategoryLegendModal-CKmw7W5X.js","/assets/CellConcerns-BTKxttpy.js","/assets/CellDetails-Cp-cOXqF.js","/assets/CellFormModal-Bbg25ugX.js","/assets/CellIdent-_CYN4MYW.js","/assets/CellLink-Bt2HMbJ-.js","/assets/Cells-IUENNr5j.js","/assets/ColumnFilter-DE_6XEQt.js","/assets/ColumnsPicker-B0-4E5Uw.js","/assets/CommentsModal-BRpyQNOw.js","/assets/ComparisonTable-BMyxhrCr.js","/assets/Concerns-lb5ZQac5.js","/assets/CountStepper-CGwBesvZ.js","/assets/Daily-zXi28m2j.js","/assets/DataTable-CTHNxFyB.js","/assets/DateRangePicker-DUQbQ5NB.js","/assets/DayReportView-Lgx9CJtc.js","/assets/DayStepper-BwL7D_pB.js","/assets/DayStrip-zwhLY9CP.js","/assets/DifferenceBreakdown-DDZb1nx3.js","/assets/Downtime-Ch9qNZ1T.js","/assets/Education-DjbWCx-v.js","/assets/EducationLesson-BF6Xubxl.js","/assets/EmptyState-DZRQ7riq.js","/assets/Exam-CESa4Gos.js","/assets/FactorySelect-D0fN7xOJ.js","/assets/Gamification-D2GdtL1c.js","/assets/GroupBadge-DB2_9_5S.js","/assets/HeatmapChart-D0db4TVu.js","/assets/IdleCell-3jVAY-k9.js","/assets/KPICard-lrihSCca.js","/assets/Kaizen-JdxLuNKP.js","/assets/Kelish-P64KgpNg.js","/assets/KpiDeltaCard-CO9cs6R3.js","/assets/LangTextInput-Cbwwdx9q.js","/assets/Layout-BEeOngBz.js","/assets/LeaderAppeal-MNuIiEna.js","/assets/LeaderDayReport-ccFB7jR2.js","/assets/LeaderUnitReport-OQTmfglx.js","/assets/Leaderboard-BvQmeNB2.js","/assets/Leaders-jIjpKz-U.js","/assets/LeadersKpi-CEWUB7al.js","/assets/Lightbox-BGV_0yTr.js","/assets/LiveOverview-BLX1-3O8.js","/assets/Login-BAvHR2M4.js","/assets/NotFound-D_CD-fPn.js","/assets/Notifications-CFUesD4S.js","/assets/Ontime-LXemZ878.js","/assets/Overview-D0hGqvi3.js","/assets/Pagination-DjHYlQ_k.js","/assets/PerenaladkaFactTable-Bd0xLEl3.js","/assets/PersonCard-CcOtOQJH.js","/assets/PlanFulfillment-D5J62e6j.js","/assets/Production-CA9DgfW-.js","/assets/Profile-nMz3Jq3z.js","/assets/ProofCamera-3469tH9Y.js","/assets/ProofPhoto-CPHyy5oh.js","/assets/Quality-DiiLdApr.js","/assets/RawRows-C42biOzd.js","/assets/RequestStateChip-DkFax1tF.js","/assets/RichTextEditor-BokNeDVn.js","/assets/SaveState-DYF1eNxy.js","/assets/SearchInput-CrodygoK.js","/assets/SeasonalityHeatmap-DsrcZgK9.js","/assets/SegmentedToggle-v4XraRBy.js","/assets/SetupTimes-CP7qDdOo.js","/assets/ShiftDaily-BNTaMi0X.js","/assets/Staff-C5mE9evr.js","/assets/StaffListAtCheck-IXobfm37.js","/assets/StatusBadge-D0MbUdDv.js","/assets/StatusBandsModal-BhXq03u8.js","/assets/TargetGoal-BkqeyVnZ.js","/assets/Targets-9nqMB9AJ.js","/assets/Tasks-BpplEwrT.js","/assets/TimeWheelPicker-DgQ_WXG9.js","/assets/Toast-Djk8RE9V.js","/assets/Tooltip-U7GMEuf3.js","/assets/TrendChart-DHLaY7aY.js","/assets/TripleSpeedometer-XidMX3Pf.js","/assets/Trudoyomkost-Dme1KI9C.js","/assets/UploadDropzone-D5d-CeKI.js","/assets/UsersActivity-DMHmF_gq.js","/assets/VerdictBlock-BGJPlxj3.js","/assets/VfxApiMap-u4Lss9xA.js","/assets/VfxDictionaries-BC6duJ8N.js","/assets/VfxEmployees-z1ybA_Ki.js","/assets/VfxHrMoves-CYt8FBQC.js","/assets/VfxJobs--BI6nFh0.js","/assets/VfxPhoto-BrNOspX5.js","/assets/VfxShifts-CBEE1FTW.js","/assets/VfxState-jJcFzDvn.js","/assets/VfxTimebooks-C1toGj-N.js","/assets/VfxTimesheet-t400L36r.js","/assets/WatchProgress-DLekrslm.js","/assets/WebLogin-C98oF5Xy.js","/assets/Workers-1hHCKJgc.js","/assets/Zagruzka-ChhY1e30.js","/assets/ZagruzkaCell-BFYx6fjm.js","/assets/api-aEZpu3F5.js","/assets/archive-B0cQg47b.js","/assets/archive-restore-Dp_Lr3qq.js","/assets/arrow-down-BC3W2v3N.js","/assets/arrow-down-right-D2a2ObqJ.js","/assets/arrow-down-wide-narrow-BVfdDn9t.js","/assets/arrow-up-narrow-wide-CWRUPGBx.js","/assets/ban-D8Tav2D-.js","/assets/boxes-CUg3XpW0.js","/assets/braces-lFPic2f8.js","/assets/brigadirFilters-DDF2jcxa.js","/assets/broadcastTree-C5HZBi4a.js","/assets/building-2-CU3A7q7x.js","/assets/calendar-DHcNCWk9.js","/assets/calendar-days-Bta90MOV.js","/assets/camera-Btro6C6r.js","/assets/categories-C2wOD7rY.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-huSiiUkN.js","/assets/chart-line-gL6usVr-.js","/assets/chart-pie-BKkNq1jj.js","/assets/chartRange-1NQRd6dM.js","/assets/check-check-1s9qLVc1.js","/assets/chevron-left-D4l6UEUX.js","/assets/chevrons-up-down-BU5OZ7bA.js","/assets/circle-BHvRaXBq.js","/assets/circle-alert-BQrsQHEX.js","/assets/circle-check-big-ClWmIal7.js","/assets/circle-dashed-Bf7oVLHK.js","/assets/circle-minus-D5DfLAT4.js","/assets/circle-question-mark-B2Oad4rs.js","/assets/circle-slash-D5y9dtiA.js","/assets/circle-user-round-Bmjd4yU9.js","/assets/cloud-off-B-Pn9Nh8.js","/assets/cloud-upload-BtupdssO.js","/assets/compass-DtvW8t6x.js","/assets/concernCategories-COAoEag9.js","/assets/corner-down-right-8QV-K_Aq.js","/assets/createLucideIcon-EN5tuyAl.js","/assets/es-DiXeTIUY.js","/assets/external-link-DTDCWQNZ.js","/assets/file-clock-DRy4egjC.js","/assets/file-exclamation-point-DTFJekYn.js","/assets/flag-BZ1S7rgn.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-LKSDfpUs.js","/assets/funnel-CjY9KwA4.js","/assets/hash-RX6ekQvV.js","/assets/hourglass-Cr3-BlHK.js","/assets/image-DZZ81_ao.js","/assets/image-off-CUfQesal.js","/assets/inbox-DvEqX4Ds.js","/assets/index-DLT_vDJq.css","/assets/index-DeBSUW8Y.js","/assets/keyboard-D5yyLtDa.js","/assets/languages-C5mOzxTi.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BMzZm_lu.js","/assets/lightbulb-DNj27jJY.js","/assets/link-2-CfQKfL55.js","/assets/link-2-off-DIoHYD-I.js","/assets/list-ordered-3acsTpCu.js","/assets/list-tree-DyYqVdm5.js","/assets/lock-open-BXWI08s8.js","/assets/log-in-B7R25EI6.js","/assets/marks-BYeyFw7c.js","/assets/minimize-2-Cpp7OSle.js","/assets/package-check-DZhanKBL.js","/assets/pencil-KLA16Wpp.js","/assets/percent-woJ-e_Ge.js","/assets/pin-BddSVaIW.js","/assets/pin-off-D4zRBe1z.js","/assets/play-5PT2pqyl.js","/assets/plug-zap-Bo3oPq__.js","/assets/prop-types-Biebz5lC.js","/assets/radio-LzOEcQmO.js","/assets/react-apexcharts.esm-sHkBdrrT.js","/assets/registers-Df9vvKXx.js","/assets/repeat-Ddc9qdNN.js","/assets/save-CMHrX5fD.js","/assets/scopeLinks-B0gQQczh.js","/assets/scroll-text-B26NoApP.js","/assets/search-x-jidfK5KK.js","/assets/segments-8C9xg-4x.js","/assets/send-Ce0IhLPv.js","/assets/settings-2-CdvxOe0Y.js","/assets/shield-C-w_CA1T.js","/assets/shield-alert-60l1db0F.js","/assets/shield-question-mark-CAYZ75Q3.js","/assets/sigma-Bwm9cUsE.js","/assets/siren-xyV9w_Pq.js","/assets/snowflake-CAvqIEET.js","/assets/split-Cmyjf0j7.js","/assets/square-check-big-DcSqxFhk.js","/assets/star-nciLNvZP.js","/assets/statusBands-DkH3bLx_.js","/assets/store-BZMMM58I.js","/assets/table-2-BgqQmQX3.js","/assets/table-properties-Ki1gt6CL.js","/assets/tag-D47PFSF0.js","/assets/timer-off-B3oGcbKf.js","/assets/trendBuckets-DuL4wqax.js","/assets/trending-down-DyNhH8wA.js","/assets/trending-up-DUPfnZiB.js","/assets/undo-2-DjJ4mI-N.js","/assets/useChartTheme-nWjgzx1X.js","/assets/useElementWidth-BFRs8Fnc.js","/assets/useIsMobile-7daxA486.js","/assets/useOpenParam-C3_Wf2AH.js","/assets/useStatusBands-D-LWHElH.js","/assets/useUrlScope-CsI7S5cL.js","/assets/user-BPl2gbm2.js","/assets/user-cog-BiZSLPAR.js","/assets/user-minus-B_k4kzC3.js","/assets/users-CCz4iGkG.js","/assets/vfx-BSQdHVpw.js","/assets/video-BX362xbh.js","/assets/wallet-BzCRdwxz.js","/assets/warehouse-B466s4zQ.js","/assets/workflow-BF0-wQ5J.js","/assets/x-IIDm_jvs.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
