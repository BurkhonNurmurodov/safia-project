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

const BUILD = "2026-10-23T18:16:48.502Z";
const PRECACHE = ["/","/assets/AdminPanel-DSAk15c2.js","/assets/AnalysisBoard-B-ngyo2G.js","/assets/Arc-DKbY8m4d.js","/assets/Assistant-BVLKgSdI.js","/assets/BrigadirProfile-BTZ3Hu_f.js","/assets/BroadcastReceivers-cXrbrEWY.js","/assets/BroadcastRecord-CZLgfmzJ.js","/assets/Button-jDbFLjYk.js","/assets/CatLockNotice-CnARgCfp.js","/assets/CategoryLegendModal-8zf77Pms.js","/assets/CellConcerns-D3DbMZzM.js","/assets/CellDetails-BZQtpWIu.js","/assets/CellFormModal-DsHdvINr.js","/assets/CellIdent-DkeoAi6X.js","/assets/CellLink-D2ENoHmh.js","/assets/Cells-Pwpq1UrZ.js","/assets/ColumnFilter-CERTxCLc.js","/assets/ColumnsPicker-DLRM-f3y.js","/assets/CommentsModal-D0uiTgSL.js","/assets/ComparisonTable-CjZbQeFn.js","/assets/Concerns-BhSBO8z1.js","/assets/CountStepper-CXr3RUPD.js","/assets/Daily-BXkpp73s.js","/assets/DataTable-CaYRjO0J.js","/assets/DateRangePicker-CBlVx6Fo.js","/assets/DayReportView-CnSoKNKB.js","/assets/DayStepper-DYwInFdc.js","/assets/DayStrip-C349hO6k.js","/assets/DifferenceBreakdown-CGKHHhHs.js","/assets/Downtime-2HfPJbPo.js","/assets/Education-DvdUDBmC.js","/assets/EducationLesson-CLlLTJWP.js","/assets/EmptyState-wKvLMxtg.js","/assets/Exam-BSXnlOhS.js","/assets/FactorySelect-DKnIvLYK.js","/assets/Gamification-tcndr8xI.js","/assets/GroupBadge-CqrVgw5w.js","/assets/HeatmapChart-B8EyDbEh.js","/assets/IdleCell-DocxyY8b.js","/assets/KPICard-F-e--ogO.js","/assets/Kaizen-C3RLGSPT.js","/assets/Kelish-BfI91lBn.js","/assets/KpiDeltaCard-BBCg8suT.js","/assets/LangTextInput-BClw890g.js","/assets/Layout-C2oftyNw.js","/assets/LeaderAppeal-CzpVUzc1.js","/assets/LeaderDayReport-BAi8WYft.js","/assets/LeaderUnitReport-BuKB23Vc.js","/assets/Leaderboard-sEmGVG6K.js","/assets/Leaders-D3YyRjnI.js","/assets/LeadersKpi-Bfiz4UuJ.js","/assets/Lightbox-DfGsFm16.js","/assets/LiveOverview-BMslKsrG.js","/assets/Login-BpIQAFv5.js","/assets/NotFound-Bvn_v6VS.js","/assets/Notifications-1iCglESa.js","/assets/Ontime-DClr4jvo.js","/assets/Overview-BePGqa5r.js","/assets/Pagination-Dv0Z8qlO.js","/assets/PerenaladkaFactTable-DH0Vuuro.js","/assets/PersonCard-CA86a5vM.js","/assets/PlanFulfillment-CQN_fZlm.js","/assets/Production-Co6RBb75.js","/assets/Profile-BFYCEn1Y.js","/assets/ProofCamera-q1dj68W-.js","/assets/ProofPhoto-9n_B4Y_4.js","/assets/Quality-DfgU4U1P.js","/assets/RawRows-B9A0ZaZG.js","/assets/RequestStateChip-BGEcZGnc.js","/assets/RichTextEditor-Bq7MWHJT.js","/assets/SaveState-CLNpakIa.js","/assets/SearchInput-C0CAdkYF.js","/assets/SeasonalityHeatmap-CjK4VxL6.js","/assets/SegmentedToggle-um6pTmnb.js","/assets/SetupTimes-erqt_WPr.js","/assets/ShiftDaily-CuUdh3hE.js","/assets/Staff-PgQRlnqC.js","/assets/StaffListAtCheck-CIEtR2-k.js","/assets/StatusBadge-BA0bRZB3.js","/assets/StatusBandsModal-Bw0TjXDA.js","/assets/TargetGoal-l1xgymKf.js","/assets/Targets-Dl6eZhPg.js","/assets/Tasks-Bmn9jn7t.js","/assets/TimeWheelPicker-DTG02iTQ.js","/assets/Toast-CzCnhLZ5.js","/assets/Tooltip-OMYS94yf.js","/assets/TrendChart-DqKGRM_M.js","/assets/TripleSpeedometer-D1X7Lr_j.js","/assets/Trudoyomkost-U2oE8Weo.js","/assets/UploadDropzone-KFlUPCiC.js","/assets/UsersActivity-C15oMNs0.js","/assets/VerdictBlock-Bx7STquQ.js","/assets/VfxApiMap-CC7YM9Yq.js","/assets/VfxDictionaries-CnBPR-eD.js","/assets/VfxEmployees-CvnCmJuq.js","/assets/VfxHrMoves-DBxrzLqw.js","/assets/VfxJobs-B1ZDOpjd.js","/assets/VfxPhoto-DgicBkBy.js","/assets/VfxShifts-CVzyry70.js","/assets/VfxState-DMZyHScL.js","/assets/VfxTimebooks-CPCfXZcD.js","/assets/VfxTimesheet-O1eY1C8_.js","/assets/WatchProgress-CMHwxM7-.js","/assets/WebLogin-CK0HwaMw.js","/assets/Workers-Dbk_3_6i.js","/assets/Zagruzka-BB-4kZjX.js","/assets/ZagruzkaCell-DjSI9MEr.js","/assets/api-BFm7MSgf.js","/assets/archive-CZQzg_-E.js","/assets/archive-restore-DRKdTU5s.js","/assets/arrow-down-BWRoLIdi.js","/assets/arrow-down-right-CAjs368g.js","/assets/arrow-down-wide-narrow-Bw9PRIqj.js","/assets/arrow-up-narrow-wide-BV9bOl0U.js","/assets/ban-8jrEy4LP.js","/assets/boxes-BCs0YbZd.js","/assets/braces-BTNFE0ZE.js","/assets/brigadirFilters-fbn1A7sQ.js","/assets/broadcastTree-Dx5aous3.js","/assets/building-2-DD7ZfGE6.js","/assets/calendar-DU5A1UOW.js","/assets/calendar-days-CXpQ-04O.js","/assets/camera-BK1d5JGC.js","/assets/categories-BC3TT2yp.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CdC0y5oX.js","/assets/chart-line-DkxYaSJu.js","/assets/chart-pie-C7bKV3B7.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-BdKID-fx.js","/assets/chevron-left-Da-1DiRR.js","/assets/chevrons-up-down-sy7giDWe.js","/assets/circle-alert-Cm9lysLq.js","/assets/circle-check-big-1n1XNm9J.js","/assets/circle-dashed-Ps3ahjDC.js","/assets/circle-ikMIMusd.js","/assets/circle-minus-1iFFoxMe.js","/assets/circle-question-mark-DDRQqn2M.js","/assets/circle-slash-DOINezZC.js","/assets/circle-user-round-C9ztB5Zd.js","/assets/cloud-off-DEnLK7Gl.js","/assets/cloud-upload-CRAsTwRO.js","/assets/compass-B5CRHOcY.js","/assets/concernCategories-DiEJz4sQ.js","/assets/corner-down-right-CXsWOlv_.js","/assets/createLucideIcon-CsVAlucR.js","/assets/es-Dtgc5NM1.js","/assets/external-link-CAsFF5d6.js","/assets/file-clock-qRaXdez2.js","/assets/file-exclamation-point-DN5cLCrm.js","/assets/flag-CAXhm8Ui.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BiiaMHfx.js","/assets/funnel-D2OUX1kU.js","/assets/hash-GwAw2inI.js","/assets/hourglass-B2dehVnv.js","/assets/image-CDjfS_Ow.js","/assets/image-off-DKbZ1056.js","/assets/inbox-DRsx6PpQ.js","/assets/index-CkeEYdIB.js","/assets/index-DFvJry-Q.css","/assets/keyboard-DGs0aACB.js","/assets/languages-CXESwJtw.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-D8xEMUpW.js","/assets/leaderBoard-C07s6gBJ.js","/assets/lightbulb-DbqvlbE1.js","/assets/link-2-DVjt1iBB.js","/assets/link-2-off-D_8W2FU2.js","/assets/list-ordered-BVcsblwZ.js","/assets/list-tree-Cl0mpw9u.js","/assets/lock-open-PY3ooh5u.js","/assets/log-in-Bo_VYQyz.js","/assets/map-pin-CyAoX5pU.js","/assets/marks-BSKJQV4Y.js","/assets/minimize-2-OItyYb4E.js","/assets/package-check-CeY3vWYJ.js","/assets/pencil-Djn9Avsx.js","/assets/percent-gm6wIAaL.js","/assets/pin-CePq3_ty.js","/assets/pin-off-DKNsm9jo.js","/assets/play-DvGIp7Ts.js","/assets/plug-zap-Dtl4bnPz.js","/assets/prop-types-RD3fbola.js","/assets/radio-BUizPuRA.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-BVGQ72Mp.js","/assets/repeat-DamH7BXq.js","/assets/save-lqG01wQX.js","/assets/scopeLinks-CbRbG1Sb.js","/assets/scroll-text-DJLuEUmS.js","/assets/search-x-CzibmS_j.js","/assets/segments-D5Uiedtv.js","/assets/send-ByUz8VWb.js","/assets/settings-2-BefYToMD.js","/assets/shield-BaV91Hti.js","/assets/shield-alert-D-SEYuPS.js","/assets/shield-question-mark-BL5F1myC.js","/assets/sigma-BCjAzveY.js","/assets/siren-Bdt4CYLO.js","/assets/snowflake-D7-kodHf.js","/assets/split-DhPwyz99.js","/assets/square-check-big-5_XYizt1.js","/assets/star-n2Y4T9g9.js","/assets/statusBands-DVBZcBq3.js","/assets/store-Ct3U4vTz.js","/assets/table-2-CvXC8nFU.js","/assets/table-properties-D4bgYIG8.js","/assets/tag-BT7FcBWr.js","/assets/timer-off-Biq88-NC.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-yWfUXGra.js","/assets/trending-up-CGQXtaBb.js","/assets/undo-2-EH6vG7xl.js","/assets/useChartTheme-CawAn4hz.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-Cq61zjbP.js","/assets/useStatusBands-Dl4t2_l7.js","/assets/useUrlScope-Bk-M7af1.js","/assets/user-CrjFiV9Q.js","/assets/user-cog-DsfDltxJ.js","/assets/user-minus-CtyHdu90.js","/assets/users-DbFE1P-4.js","/assets/vfx-bX_m3K_d.js","/assets/video-BCNlKIb5.js","/assets/wallet-BCVp0O8G.js","/assets/warehouse-BtZ7Goed.js","/assets/workflow-BTL1xvMs.js","/assets/x-DqDPLBeu.js","/assets/zap-BYG0qULk.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
