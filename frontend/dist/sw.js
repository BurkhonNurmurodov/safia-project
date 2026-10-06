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

const BUILD = "2026-10-06T17:56:28.540Z";
const PRECACHE = ["/","/assets/AdminPanel-D6qZ9um9.js","/assets/AnalysisBoard-BP8nywAn.js","/assets/Arc-CiAiKr6X.js","/assets/Assistant-Cm5u1N-Z.js","/assets/BrigadirProfile-CXFo3ibY.js","/assets/BroadcastReceivers-DGSqT4w4.js","/assets/BroadcastRecord-qJ76a3-u.js","/assets/Button-DNTXG0u0.js","/assets/CatLockNotice-DY23JtAW.js","/assets/CategoryLegendModal-D6HYFMQt.js","/assets/CellConcerns-Bs7Hzk9h.js","/assets/CellDetails-D9jP5wqX.js","/assets/CellFormModal-CbIfQ46a.js","/assets/CellIdent-D-tDpvf8.js","/assets/CellLink-B-j0ER_t.js","/assets/Cells-BO0ZI9NB.js","/assets/ColumnFilter-C2dVnvw-.js","/assets/ColumnsPicker-TNUp8hp5.js","/assets/CommentsModal-WWIDa-E4.js","/assets/ComparisonTable-f_Hf5thV.js","/assets/Concerns-BoGKX23q.js","/assets/Daily-DBZ1OA0w.js","/assets/DataTable-HTQEKZ1Z.js","/assets/DateRangePicker-D9edr3Uy.js","/assets/DayReportView-BPWGRxm8.js","/assets/DayStepper-Buh5I8ln.js","/assets/DifferenceBreakdown-CFruUamn.js","/assets/Downtime-BRR8tyoj.js","/assets/Education-CVaPOKa6.js","/assets/EducationLesson-CRyvzDy_.js","/assets/EmptyState-C49CSwTH.js","/assets/Exam-B_ehP9zy.js","/assets/FactorySelect-7s6yCalk.js","/assets/Gamification-LhoZcOM-.js","/assets/GroupBadge-CwuPxE4J.js","/assets/HeatmapChart-CfpyLCgl.js","/assets/IdleCell-z-it9WDI.js","/assets/KPICard-CYvfboCT.js","/assets/Kaizen-BulEZGAx.js","/assets/Kelish-BwLQOBJl.js","/assets/KpiDeltaCard-D9N5kDyX.js","/assets/LangTextInput-C2BPkrda.js","/assets/Layout-tJxwAoh3.js","/assets/LeaderAppeal-N5Fvl__q.js","/assets/LeaderDayReport-Dl-dsPnD.js","/assets/LeaderUnitReport-Bzeqg4NA.js","/assets/Leaderboard-CZCCn5LM.js","/assets/Leaders-fVlk728s.js","/assets/Lightbox-Balkw-tO.js","/assets/LiveOverview-BFHCUfld.js","/assets/Login-BUvUq_IB.js","/assets/NotFound-BZxz-0i4.js","/assets/Notifications-C9CT9xRR.js","/assets/Overview-BSSc9Xoc.js","/assets/Pagination-Pio8hDkq.js","/assets/PerenaladkaFactTable-JC86WgsH.js","/assets/PersonCard-BPFm7VU9.js","/assets/PlanFulfillment-27nGaFad.js","/assets/Production-BKqfVp3Y.js","/assets/Profile-Dp2zllnm.js","/assets/ProofCamera-B2Iq5Gpr.js","/assets/ProofPhoto-PJzdh5Pl.js","/assets/Quality-BUbSY3wV.js","/assets/RawRows-CI9p9jB2.js","/assets/RequestStateChip-CYCPojAr.js","/assets/RichTextEditor-D0LQuBQW.js","/assets/SaveState-DrK3cBNG.js","/assets/SearchInput-BpODvSg0.js","/assets/SeasonalityHeatmap-BTwC5SYV.js","/assets/SegmentedToggle-CsEvK580.js","/assets/SetupTimes-BhhQxL0S.js","/assets/ShiftDaily-CGCnh_U9.js","/assets/Staff-CiJIL92q.js","/assets/StatusBadge-BFt-q1qi.js","/assets/TargetGoal-C4uXBkQQ.js","/assets/Targets-kxIGose3.js","/assets/Tasks-DErD488a.js","/assets/TimeWheelPicker-CDeCsull.js","/assets/Toast-CqG6Tuf9.js","/assets/Tooltip-BD01etlg.js","/assets/TrendChart-C_7POnLl.js","/assets/TripleSpeedometer-BlftcNTs.js","/assets/Trudoyomkost-CxVBoSTT.js","/assets/Turnover-GJad6Jin.js","/assets/UploadDropzone-Ds2_kjJT.js","/assets/UsersActivity-iE3mJtnA.js","/assets/VerdictBlock-CK1i-ab_.js","/assets/VfxApiMap-Bt8mZMm-.js","/assets/VfxDictionaries-jBLuaEHQ.js","/assets/VfxEmployees-BWuElEF0.js","/assets/VfxHrMoves-ClWvj2vz.js","/assets/VfxJobs-C9WcVv0e.js","/assets/VfxPhoto-BMk47BGY.js","/assets/VfxShifts-AiRCsr8L.js","/assets/VfxState-CY3g4bYd.js","/assets/VfxTimebooks-Crmm3eqe.js","/assets/VfxTimesheet-DA4__clq.js","/assets/WatchProgress-BnelBvPz.js","/assets/WebLogin-BNdrwzM1.js","/assets/WorkerConcerns-CWr5cV_N.js","/assets/Workers-CjJNgpwN.js","/assets/Zagruzka-CWzkg5z-.js","/assets/ZagruzkaCell-Dj7vuHDL.js","/assets/api-BoZcIuNV.js","/assets/archive-CHC1-uoE.js","/assets/archive-restore-BbDBeTEy.js","/assets/arrow-down-C8dE92Y7.js","/assets/arrow-up-narrow-wide-ATfCSXee.js","/assets/award-DVTVLTvb.js","/assets/ban-BcZzFUPS.js","/assets/boxes-dDnlSPdY.js","/assets/braces-BAb1sIwV.js","/assets/brigadirFilters-CPZkQmWR.js","/assets/broadcastTree-CteUFF4S.js","/assets/building-2-CfPxo2yG.js","/assets/calculator-Btezz6FG.js","/assets/calendar-BD3NI1p8.js","/assets/calendar-days-BMGM4WsH.js","/assets/camera-DjEQk2LR.js","/assets/categories-DETuHT0p.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-9xjOT-Is.js","/assets/chart-line-DFp6ADQB.js","/assets/chart-pie-7PfhngwK.js","/assets/chartRange-B8wwWmxi.js","/assets/check-check-JfCr442A.js","/assets/chevron-left-B0TJknR3.js","/assets/chevrons-up-down-myDrylke.js","/assets/circle-Bxo-4VZ5.js","/assets/circle-alert-BWN6PBjP.js","/assets/circle-check-big-RBZ86f8q.js","/assets/circle-dashed-Cuk4Qzcm.js","/assets/circle-minus-c8OPHdti.js","/assets/circle-question-mark-qs1pkZNm.js","/assets/circle-slash-D9CXZb9F.js","/assets/circle-user-round-D_Oo5pJp.js","/assets/clock-3-CM40v2_G.js","/assets/cloud-off-64X1sNgA.js","/assets/cloud-upload-BKoSZggy.js","/assets/compass-D4dVYswM.js","/assets/concernCategories-BlrOe1SV.js","/assets/copy-C-BDllZm.js","/assets/corner-down-right-CG1HJtGO.js","/assets/createLucideIcon-D0w6no_k.js","/assets/es-C9tq5gE2.js","/assets/external-link-gyU8R8vM.js","/assets/file-clock-CM4sFVHc.js","/assets/file-exclamation-point-Bw8GkGna.js","/assets/flag-D-9oh7A_.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-zkv5R8y8.js","/assets/hash-DF91NxRN.js","/assets/hourglass-Di5ZoVzM.js","/assets/image-CwTFKxpO.js","/assets/image-off-chYGsqZz.js","/assets/inbox-CmcooIyh.js","/assets/index-BYLu8eK_.css","/assets/index-COS6GKam.js","/assets/keyboard-D8poCq-u.js","/assets/languages-BL6AtbXH.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DgFGIZ97.js","/assets/lightbulb-DruLG4gT.js","/assets/link-2-CbIZPq2q.js","/assets/link-2-off-KQflkOYe.js","/assets/list-ordered-B8-ht-HN.js","/assets/list-tree-DgWEc7tO.js","/assets/lock-open-C7Z2D4pT.js","/assets/log-in-yvL5o_y-.js","/assets/minimize-2-0mlg6VRp.js","/assets/package-check-piQEkqz6.js","/assets/pencil-CRZSoENV.js","/assets/percent-BrH3tRls.js","/assets/pin-D1Gq512X.js","/assets/pin-off-CyU1VuNW.js","/assets/play-CKbNq5-_.js","/assets/plug-zap-rObBOBZR.js","/assets/prop-types-Fz8p-YDG.js","/assets/radio-maoF_i7O.js","/assets/react-apexcharts.esm-DDL6T6-H.js","/assets/registers-yg1OFIMU.js","/assets/repeat-BWd72YLa.js","/assets/rotate-cw-7EnwfT0d.js","/assets/save-BI9TjEMb.js","/assets/scopeLinks-B2uHmaQz.js","/assets/scroll-text-hNL5tSaz.js","/assets/search-x-BM5QPmO0.js","/assets/segments-uS-A9G2q.js","/assets/send-7d1Z8irr.js","/assets/settings-2-Dp4ZOkbX.js","/assets/shield-CkqJTfn1.js","/assets/shield-alert-Db3OOhnw.js","/assets/shield-question-mark-UUo4cLDV.js","/assets/siren-BN3zh2My.js","/assets/snowflake-Bl5lmyGX.js","/assets/split-BQQVYu9R.js","/assets/square-check-big-DLM8gobs.js","/assets/star-DtLi4DGr.js","/assets/statusBands-C4c6xlKg.js","/assets/store-DEx7ouTO.js","/assets/table-2-BZXhMFn-.js","/assets/table-properties-CZ0eXyhH.js","/assets/tag-BduAKpJ9.js","/assets/timer-off-BDFWQr51.js","/assets/trending-down-BKgNfV6t.js","/assets/trending-up-BV8lV596.js","/assets/undo-2-41JO2Iwf.js","/assets/useChartTheme-DLrYfJsk.js","/assets/useElementWidth-CRLU5SfL.js","/assets/useIsMobile-BYaA5543.js","/assets/useOpenParam-D6tYY-2-.js","/assets/useStatusBands-BMIcIFTR.js","/assets/useUrlScope-D3M4VPLZ.js","/assets/user-CyPzJrEh.js","/assets/user-cog-Btj5nV3K.js","/assets/users-BH9mJP2e.js","/assets/vfx-IOrQdnSZ.js","/assets/video-O3BjOO9c.js","/assets/wallet-Dpj5ZoTn.js","/assets/warehouse-CpkDyNGq.js","/assets/x-BNFJELg9.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
