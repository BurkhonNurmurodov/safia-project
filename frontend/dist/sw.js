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

const BUILD = "2026-09-26T11:22:56.878Z";
const PRECACHE = ["/","/assets/AdminPanel--Tk7l3T7.js","/assets/AnalysisBoard-BBVXhuvW.js","/assets/Arc-B4H7dXQx.js","/assets/ArcLegacy-MPM_1BO6.js","/assets/AttendanceModal-DfUvRWfA.js","/assets/BrigadirProfile-BYT-YGO0.js","/assets/BroadcastReceivers-Cg2TozLZ.js","/assets/BroadcastRecord-CXd1q_aR.js","/assets/CatLockNotice-BqM_1d6x.js","/assets/CategoryLegendModal-CL_t5HCv.js","/assets/CellConcerns-DPfU821j.js","/assets/CellDetails-CszFbsre.js","/assets/CellFormModal-BXVArs_H.js","/assets/CellLink-CZNYyhPE.js","/assets/Cells-DvIqEfp2.js","/assets/ColumnFilter-DUqrvZU4.js","/assets/ColumnsPicker-DW89q48A.js","/assets/CommentsModal-RyqD5hGg.js","/assets/ComparisonTable-DRAo0Tjy.js","/assets/Concerns-DOy2xSSB.js","/assets/ConfirmDialog-DYev7YeJ.js","/assets/Daily-IHkMasCM.js","/assets/DataTable-BPpIcmdp.js","/assets/DateRangePicker-BSMUHCJI.js","/assets/DayReportView-DdnXOiKA.js","/assets/DayStepper-D9Rg1PMF.js","/assets/DifferenceBreakdown-T9tV5c1c.js","/assets/Downtime-slaXQta9.js","/assets/Education-C9qFci3D.js","/assets/EducationLesson-B3_2yeD_.js","/assets/EmptyState-BEdXR6Nz.js","/assets/Exam-BYP3PB-0.js","/assets/FactorySelect-DMw1VT2l.js","/assets/Gamification-BF4ikGWB.js","/assets/GroupBadge-DrJPRXw3.js","/assets/HeatmapChart-bDE3WR9A.js","/assets/IdleCell-CRnLAecj.js","/assets/KPICard-DTofhoLf.js","/assets/Kaizen-CgeVuBKy.js","/assets/KpiDeltaCard-DCzR9Gqc.js","/assets/LangTextInput-DUYFU3d3.js","/assets/Layout-sapPVz_c.js","/assets/LeaderAppeal-tOHSruPr.js","/assets/LeaderDayReport-DrCX_eEb.js","/assets/LeaderUnitReport-DTY8oQo3.js","/assets/Leaderboard-CSDCX9JN.js","/assets/Leaders-D0a6JrHI.js","/assets/Lightbox-DtPw6wFb.js","/assets/LiveOverview-tE7SyUr1.js","/assets/Login-CDdGva85.js","/assets/NotFound-BKueiv5j.js","/assets/Overview-BCaJdsSI.js","/assets/Pagination-CXlpiNSx.js","/assets/PerenaladkaFactTable-C7xy8mDP.js","/assets/PlanFulfillment-C7SMvc_W.js","/assets/Production-CjBeeiep.js","/assets/Profile-BSqG9-4_.js","/assets/ProofCamera-r8n5TUlI.js","/assets/ProofPhoto-CsajnAXv.js","/assets/Quality-CRWg-D9R.js","/assets/RequestStateChip-BG4-q1qb.js","/assets/RichTextEditor-DUSUIeFl.js","/assets/SaveState-BTAOkfOu.js","/assets/SearchInput-Bh480oBw.js","/assets/SeasonalityHeatmap-Cbq2FJOt.js","/assets/SegmentedToggle-VB4EItag.js","/assets/SetupTimes-P9Ot-UhX.js","/assets/ShiftDaily-JBtmGFsQ.js","/assets/Staff-b0BM0A8v.js","/assets/StatusBadge-Bv0gOOA4.js","/assets/TargetGoal-C-8pMnRr.js","/assets/Targets-ZLI2RZOt.js","/assets/Tasks-Bs35kdhs.js","/assets/TimeWheelPicker-CN2cE996.js","/assets/Tooltip-Cq_cIOs8.js","/assets/TrendChart-D3fX41E-.js","/assets/TripleSpeedometer-MnnyVkBI.js","/assets/Trudoyomkost-4if2Id7O.js","/assets/UsersActivity-CuR8pl2F.js","/assets/WatchProgress-BssRa3eZ.js","/assets/WebLogin-CFOkOYoV.js","/assets/WorkerConcerns-_8OfTemA.js","/assets/Workers--gaUzgWu.js","/assets/Zagruzka-DuhkMgpJ.js","/assets/ZagruzkaCell-BGLIeyya.js","/assets/alarm-clock-BR94wLbd.js","/assets/api-C8mug15E.js","/assets/archive-C15Yoy61.js","/assets/archive-restore-DvrEcqNN.js","/assets/arrow-down-BLUjdgFd.js","/assets/arrow-left-DQV7ILo7.js","/assets/arrow-left-right-DvpnuIwW.js","/assets/arrow-up-_n2Vac9w.js","/assets/arrow-up-right-DespsC_K.js","/assets/award-CkTvRvNm.js","/assets/ban-38z9iHOy.js","/assets/bot-CRSHr4sI.js","/assets/boxes-BrsUIGIk.js","/assets/brigadirFilters-DqZhk2sk.js","/assets/broadcastTree-MK2N1GuV.js","/assets/building-2-BeGlDuUG.js","/assets/calendar-DePdURgk.js","/assets/calendar-clock-BT4KVJ-O.js","/assets/calendar-days-BRP8UCiU.js","/assets/calendar-range-xAaN7XuC.js","/assets/camera-B9XK6tvn.js","/assets/categories-Du9ODT-P.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BwSqttvj.js","/assets/chart-line-D2bbjTLh.js","/assets/chart-pie-BmbN-dmi.js","/assets/chartRange-CwHgt4VA.js","/assets/chevron-left-DGEZlhI5.js","/assets/chevrons-up-down-DCyltQo4.js","/assets/circle-check-big-PKD-RbkI.js","/assets/circle-dot-D4TEFIHh.js","/assets/circle-minus-5ZQCTJLg.js","/assets/circle-slash-3NqGyaaw.js","/assets/circle-user-round-DI13GTz6.js","/assets/cloud-off-DB2yegmT.js","/assets/cloud-upload-DSSgqVRy.js","/assets/compass-CByZayeE.js","/assets/concernCategories-DsAWostN.js","/assets/copy-N2fslam4.js","/assets/corner-down-right-DXdlSxiG.js","/assets/createLucideIcon-DM-dgG7Q.js","/assets/es-Btt3d4IS.js","/assets/exportXlsx-BKrIzbGN.js","/assets/external-link-D_ZBf3DQ.js","/assets/file-clock-CcdthFFo.js","/assets/file-exclamation-point-DTTyH98z.js","/assets/file-spreadsheet-BY1sA7T_.js","/assets/file-text-Gh1fEDtw.js","/assets/flag-BUETCmxG.js","/assets/flame-nAc9sNxY.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DPfRI6NJ.js","/assets/hash-D4jPWhr7.js","/assets/history-D5zqmcET.js","/assets/hourglass-BgTHCOb5.js","/assets/image-D6ZQgIIm.js","/assets/image-off-CyYMLccV.js","/assets/index-Bi0jAaUv.js","/assets/index-tV0qSnFw.css","/assets/key-round-CVS2DYty.js","/assets/keyboard-BFhrE-C5.js","/assets/languages-CqkfZMNe.js","/assets/layers-DTJ_5r59.js","/assets/leaderReason-CapMnbpF.js","/assets/lightbulb-WIilUT3-.js","/assets/link-2-BW94EcGr.js","/assets/list-checks-CJg6kZXe.js","/assets/list-ordered-BCr6Zm-5.js","/assets/list-tree-DQ60BdT1.js","/assets/lock-open-CPhjXBhl.js","/assets/log-in-e9aQAjuU.js","/assets/message-square-B-vUnwJz.js","/assets/minimize-2-CQKe6Ub9.js","/assets/package-check-BoJWZrG2.js","/assets/paperclip-DwpekkdD.js","/assets/pencil-BTxNKj6k.js","/assets/personName-B4KId4zS.js","/assets/pin-Bc8PtG9z.js","/assets/play-nYq45Wdh.js","/assets/presentation-DStledA8.js","/assets/prop-types-css5lDBk.js","/assets/radio-D4xtJ9Vn.js","/assets/react-apexcharts.esm-DV29z3UB.js","/assets/repeat-oyhYbBv6.js","/assets/rotate-ccw-Dmi0AsH2.js","/assets/rotate-cw-B2P31nGv.js","/assets/save-CKdPd3xx.js","/assets/scale-CQAUdck4.js","/assets/scroll-text-BJSSfokb.js","/assets/search-x-BcCPyeLQ.js","/assets/segments-CsKT4u6G.js","/assets/send-KcvNcYCD.js","/assets/settings-2-OeUq2kqa.js","/assets/shield-CYtRqF_W.js","/assets/shield-alert-CBmXFQa8.js","/assets/shield-check-jNNAGTS3.js","/assets/shield-question-mark-Bwqv6mvC.js","/assets/siren-CTPQgodH.js","/assets/smartphone-D3zfN8y5.js","/assets/snowflake-l1TY3owh.js","/assets/square-DGHLyO70.js","/assets/square-check-big-CVkwMXgk.js","/assets/star-VdZvSa9G.js","/assets/statusBands-CitJkfT0.js","/assets/store-DS-7Fx1J.js","/assets/table-2-5_ahNL5h.js","/assets/tag-5q1_Ddvy.js","/assets/trending-down-D3dzmW6o.js","/assets/trending-up-D5czx7Ww.js","/assets/triangle-alert-QaOSOru1.js","/assets/undo-2-B_0CjDmL.js","/assets/useChartTheme-BcniHBUb.js","/assets/useElementWidth-CFmh1dI4.js","/assets/useIsMobile-Hr7vI31Y.js","/assets/useMutation-Bf1C2Kg4.js","/assets/useStatusBands-UVIeI1MP.js","/assets/user-CU2HbcAk.js","/assets/user-check-zpXWBBxb.js","/assets/user-cog-DgkcuYsD.js","/assets/user-minus-1CFxJWtS.js","/assets/users-Dve6ydq8.js","/assets/verifyState-DQy_wS9a.js","/assets/video-C6eH41We.js","/assets/wallet-DI19RJx8.js","/assets/warehouse-CHQwKH8z.js","/assets/zap-tpQGFcDg.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
