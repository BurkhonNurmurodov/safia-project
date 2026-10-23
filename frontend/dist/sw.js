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

const BUILD = "2026-10-23T12:46:46.019Z";
const PRECACHE = ["/","/assets/AdminPanel-BndWf0Wq.js","/assets/AnalysisBoard-CMtn5oRZ.js","/assets/Arc-Cccj6QlP.js","/assets/Assistant-B3IYW96d.js","/assets/BrigadirProfile-CgNW1dyE.js","/assets/BroadcastReceivers-D-Y6pbqs.js","/assets/BroadcastRecord-C9SSTZew.js","/assets/Button-BiZj_-Y3.js","/assets/CatLockNotice-BjCTiC70.js","/assets/CategoryLegendModal-DKmVeF4X.js","/assets/CellConcerns-CRyKHIPI.js","/assets/CellDetails-BFf6VlrW.js","/assets/CellFormModal-BNLxerbm.js","/assets/CellIdent-rswJlXUc.js","/assets/CellLink-KpwSWATC.js","/assets/Cells-CFz5J_h_.js","/assets/ColumnFilter-y6GpOWaX.js","/assets/ColumnsPicker-DDxeMURo.js","/assets/CommentsModal-DAuz9LSY.js","/assets/ComparisonTable-DR6TmnzR.js","/assets/Concerns-zekpEWot.js","/assets/CountStepper-D007kQLO.js","/assets/Daily-VZ_F9khd.js","/assets/DataTable-DFaxEUyc.js","/assets/DateRangePicker-BSHAOvzC.js","/assets/DayReportView-xT92R6r_.js","/assets/DayStepper-CAjRZAXx.js","/assets/DayStrip-CaVL87DO.js","/assets/DifferenceBreakdown-BFEun4r1.js","/assets/Downtime-hh-9Riid.js","/assets/Education-BTM-U4q_.js","/assets/EducationLesson-O74wVXUK.js","/assets/EmptyState-olZgEGks.js","/assets/Exam-D9hmuoBL.js","/assets/FactorySelect-7galkQ9s.js","/assets/Gamification-CAmMbJu1.js","/assets/GroupBadge-BJ8JnJDQ.js","/assets/HeatmapChart-AP6aFjQN.js","/assets/IdleCell-Cfdp9NFk.js","/assets/KPICard-nBlMuxUb.js","/assets/Kaizen-BwdHyWyY.js","/assets/Kelish-IWMIuCyp.js","/assets/KpiDeltaCard-CE3Wv2Dv.js","/assets/LangTextInput-B5ahL4cX.js","/assets/Layout-DoPa5KS4.js","/assets/LeaderAppeal-DPD8KpmS.js","/assets/LeaderDayReport-BxDcyBCu.js","/assets/LeaderUnitReport-CLqNjbDa.js","/assets/Leaderboard-BP1ItlqB.js","/assets/Leaders-3mlwzbA7.js","/assets/LeadersKpi-DrVw8Jxz.js","/assets/Lightbox-BBxQoBzf.js","/assets/LiveOverview-BodtiMaJ.js","/assets/Login-DuKGdI4M.js","/assets/NotFound-Di6M5WJn.js","/assets/Notifications-D_ldKvky.js","/assets/Ontime-abnguZld.js","/assets/Overview-BDIsrbu3.js","/assets/Pagination-ERnsW_si.js","/assets/PerenaladkaFactTable-C4bB2nCA.js","/assets/PersonCard-DI-0gWb-.js","/assets/PlanFulfillment-C-wldM7H.js","/assets/Production-BMjn1j4t.js","/assets/Profile-DYvz90ZO.js","/assets/ProofCamera-D0oXVilT.js","/assets/ProofPhoto-C0dv4akf.js","/assets/Quality-DsVEvHad.js","/assets/RawRows-Cdjp7dsW.js","/assets/RequestStateChip-BjmMIjra.js","/assets/RichTextEditor-Cwb9tcLq.js","/assets/SaveState-ByiJ33K3.js","/assets/SearchInput-CcsUN8cW.js","/assets/SeasonalityHeatmap-Coykhrgy.js","/assets/SegmentedToggle-7NejuOVw.js","/assets/SetupTimes-CwZCLZQf.js","/assets/ShiftDaily-C5IjMrUg.js","/assets/Staff-DF6vXW5l.js","/assets/StaffListAtCheck-CCPsf-qB.js","/assets/StatusBadge-HkbZDqAB.js","/assets/StatusBandsModal-4fStYAXx.js","/assets/TargetGoal-Os7bqu8m.js","/assets/Targets-BczZS4RK.js","/assets/Tasks-CU9iGsGT.js","/assets/TimeWheelPicker-cuoM_TJK.js","/assets/Toast-sElmjx9o.js","/assets/Tooltip-DNApwJEk.js","/assets/TrendChart-BaCVAhPU.js","/assets/TripleSpeedometer-DXHWixvm.js","/assets/Trudoyomkost-PBfNStOv.js","/assets/UploadDropzone-CdIG5Uid.js","/assets/UsersActivity-k6Tj_B4x.js","/assets/VerdictBlock-DUkiHGKH.js","/assets/VfxApiMap-ClOM9tUj.js","/assets/VfxDictionaries-BQCEu1JA.js","/assets/VfxEmployees-CsrK9ZxU.js","/assets/VfxHrMoves-DoSo-DVF.js","/assets/VfxJobs-D1WOsypK.js","/assets/VfxPhoto-BehjoOmx.js","/assets/VfxShifts-CltjgkOS.js","/assets/VfxState-B7sgG2zS.js","/assets/VfxTimebooks-OugHH05Y.js","/assets/VfxTimesheet-ZMJVNpVA.js","/assets/WatchProgress-Cfom2eas.js","/assets/WebLogin-kqldrejE.js","/assets/Workers-ClvE_7ei.js","/assets/Zagruzka-DA5boaqJ.js","/assets/ZagruzkaCell-COEc-WQl.js","/assets/api-B_GrCJCc.js","/assets/archive-F0UxAgym.js","/assets/archive-restore-DB0NsSdK.js","/assets/arrow-down-Ce1yCMnA.js","/assets/arrow-down-right-DNlZ29Dh.js","/assets/arrow-down-wide-narrow-CubQyHC1.js","/assets/arrow-up-narrow-wide-Belf1E7g.js","/assets/ban-CsfbNBJW.js","/assets/boxes-DogzfO8T.js","/assets/braces-X6k9rxYQ.js","/assets/brigadirFilters-BREZbLHt.js","/assets/broadcastTree-CDfu5fGp.js","/assets/building-2-CZl3Weug.js","/assets/calendar-CDvaT-dW.js","/assets/calendar-days-C3usnfDb.js","/assets/camera-C4HL3rPr.js","/assets/categories-DOcsSKdT.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D0JUEN_I.js","/assets/chart-line-CTc8p5Yd.js","/assets/chart-pie-9O6Kd96h.js","/assets/chartRange-D9nENsgl.js","/assets/check-check-1QUySXQH.js","/assets/chevron-left-C1I74xw7.js","/assets/chevrons-up-down-b27VSNLd.js","/assets/circle-DT9FyWNH.js","/assets/circle-alert-BY_5HysP.js","/assets/circle-check-big-ns2n5itU.js","/assets/circle-dashed-wBM15ta0.js","/assets/circle-minus-BlCUR-SA.js","/assets/circle-question-mark-BilEvsJf.js","/assets/circle-slash-BvD_sjVr.js","/assets/circle-user-round-YvjKemgL.js","/assets/cloud-off-CDIEKMUC.js","/assets/cloud-upload-BsqWBxrn.js","/assets/compass-CQImp3yz.js","/assets/concernCategories-4TqZQyYB.js","/assets/corner-down-right-C3xIjDg5.js","/assets/createLucideIcon-8YL22-n-.js","/assets/es-CAUIDnY-.js","/assets/external-link-DOlvjFTN.js","/assets/file-clock-DLBIsuYS.js","/assets/file-exclamation-point-8VqBVxz4.js","/assets/flag-CqHUiJQ1.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BR_E8ZsT.js","/assets/funnel-D-DbXlnp.js","/assets/hash-BoNTcjrX.js","/assets/hourglass-CQ91i7gE.js","/assets/image-CbfALLE1.js","/assets/image-off-CasxTqvy.js","/assets/inbox-DxA35rjX.js","/assets/index-CaX-Jbmg.js","/assets/index-DFvJry-Q.css","/assets/keyboard-CxqcpV6P.js","/assets/languages-BL71Z0KM.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C5tsCdGl.js","/assets/leaderBoard-DtgaQ0dq.js","/assets/lightbulb-BlL98RtX.js","/assets/link-2-BtKCwkt1.js","/assets/link-2-off-lBYjrc5J.js","/assets/list-ordered-ZqsXiDcl.js","/assets/list-tree-DXoNxVzM.js","/assets/lock-open-CAWzKdug.js","/assets/log-in-LNgNpegn.js","/assets/map-pin-B_DY43L1.js","/assets/marks-DFvjKicD.js","/assets/minimize-2-CYsHDGZ8.js","/assets/package-check-BnIBu3tc.js","/assets/pencil-Csu1xsKr.js","/assets/percent-DvE0bVoR.js","/assets/pin-C1PkBuAl.js","/assets/pin-off-Bc-aodqk.js","/assets/play-BcBdyW4S.js","/assets/plug-zap-CSeyjPIA.js","/assets/prop-types-DX4jcdU6.js","/assets/radio-1FBQDT1J.js","/assets/react-apexcharts.esm-lx2MkdLT.js","/assets/registers-DvqzTgZr.js","/assets/repeat-f5QD__pm.js","/assets/save-Cq0Pm2fH.js","/assets/scopeLinks-Du99ViDp.js","/assets/scroll-text-CiVjri02.js","/assets/search-x-Cszu0ByS.js","/assets/segments-C68gqYl-.js","/assets/send-CuzB2aFa.js","/assets/settings-2-9XG4KLXj.js","/assets/shield-Nnjr5WVZ.js","/assets/shield-alert-mP1ZG43p.js","/assets/shield-question-mark-CCedppgN.js","/assets/sigma-Cfff2z_W.js","/assets/siren-D9r_9xm4.js","/assets/snowflake-g-Zx4fC_.js","/assets/split-BjRKNF3u.js","/assets/square-check-big-BTd96eYP.js","/assets/star-Ds9TIz5d.js","/assets/statusBands-BOTSwD7Y.js","/assets/store-BswgG8Zl.js","/assets/table-2-BmctnUUX.js","/assets/table-properties-BTZhT8uv.js","/assets/tag-BwIi6igV.js","/assets/timer-off-C0qDJ6V9.js","/assets/trendBuckets-Dd8HRmZu.js","/assets/trending-down-CbfLBBS4.js","/assets/trending-up-BDo3sU9e.js","/assets/undo-2-DRn0HcHt.js","/assets/useChartTheme-DLt5sWCU.js","/assets/useElementWidth-CTLLJ5eG.js","/assets/useIsMobile-09oV8SMi.js","/assets/useOpenParam-CYBxqhO4.js","/assets/useStatusBands-IlAcYj5l.js","/assets/useUrlScope-BBknbl6I.js","/assets/user-CCsyPmOJ.js","/assets/user-cog-Cx7DnA6y.js","/assets/user-minus-CniJoRa8.js","/assets/users-CaMn0IBJ.js","/assets/vfx-B-xM0jx-.js","/assets/video-sUK1_5UG.js","/assets/wallet-DZOID-Dd.js","/assets/warehouse-BmnL4Xdj.js","/assets/workflow-BWcfjn6x.js","/assets/x-DnGU8-ol.js","/assets/zap-B2RWaJaz.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
