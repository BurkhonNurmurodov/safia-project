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

const BUILD = "2026-10-09T07:21:34.441Z";
const PRECACHE = ["/","/assets/AdminPanel-DfVdJcH0.js","/assets/AnalysisBoard-w25sp5We.js","/assets/Arc-BMy8M2mg.js","/assets/Assistant-CA-hZjdp.js","/assets/BrigadirProfile-DqBzkLX-.js","/assets/BroadcastReceivers-DO10W-k3.js","/assets/BroadcastRecord-C0OqUQs9.js","/assets/Button-I5nZFIsZ.js","/assets/CatLockNotice-DZeFff9G.js","/assets/CategoryLegendModal-BZ-8zbyS.js","/assets/CellConcerns-BLwV3ZkA.js","/assets/CellDetails-B60pEAcY.js","/assets/CellFormModal-CQuPURXu.js","/assets/CellIdent-DhB9Woph.js","/assets/CellLink-CqQTfOvr.js","/assets/Cells-k6mOgadF.js","/assets/ColumnFilter-VB5JAsLA.js","/assets/ColumnsPicker-cozG42qf.js","/assets/CommentsModal-psRxwxGP.js","/assets/ComparisonTable-DhXBrjxn.js","/assets/Concerns-DrYaasyS.js","/assets/Daily-Da2TdYz1.js","/assets/DataTable-3iNWMY4G.js","/assets/DateRangePicker-lyQy7BTq.js","/assets/DayReportView-5Rz66dDi.js","/assets/DayStepper-CfjwCt27.js","/assets/DifferenceBreakdown-D-zX-Blu.js","/assets/Downtime-C43bpr5K.js","/assets/Education-C_49c8fp.js","/assets/EducationLesson-vR1Op67X.js","/assets/EmptyState-IhRrpMSc.js","/assets/Exam-cxqlHagu.js","/assets/FactorySelect-BKPUo0O_.js","/assets/Gamification-I7KzMCgB.js","/assets/GroupBadge-DbCGMkJb.js","/assets/HeatmapChart-tQ9KAx-F.js","/assets/IdleCell-3teYjwlP.js","/assets/KPICard-DAnB8PCa.js","/assets/Kaizen-wkonZSHV.js","/assets/Kelish-okHsJ2jZ.js","/assets/KpiDeltaCard-Bgn1mMxZ.js","/assets/LangTextInput-ua-_dDpv.js","/assets/Layout-DTJfWfkp.js","/assets/LeaderAppeal-BMf2Nu5t.js","/assets/LeaderDayReport-Bndv0VM8.js","/assets/LeaderUnitReport-GeZ0KRv0.js","/assets/Leaderboard-BHWC60ZT.js","/assets/Leaders-C0SEoQ0K.js","/assets/Lightbox-DPcxKtgl.js","/assets/LiveOverview-B-Q03U5G.js","/assets/Login-C8ZQZeEH.js","/assets/NotFound-CW-anpib.js","/assets/Notifications-DAHIvNtq.js","/assets/Overview-BRvAvS4C.js","/assets/Pagination-C0zLdxIx.js","/assets/PerenaladkaFactTable-C9Q-cySD.js","/assets/PersonCard-B5vnq0do.js","/assets/PlanFulfillment-DDjUJONb.js","/assets/Production-DUSuBxAv.js","/assets/Profile-DpUCgxUn.js","/assets/ProofCamera-DBTI7N1T.js","/assets/ProofPhoto-KtC6-knd.js","/assets/Quality-BhiMzFcb.js","/assets/RawRows-DaicrLwx.js","/assets/RequestStateChip-DX-_QOM5.js","/assets/RichTextEditor-BvwnmIta.js","/assets/SaveState-BAtwlIOw.js","/assets/SearchInput-Clv23dYy.js","/assets/SeasonalityHeatmap-Ch7CG57N.js","/assets/SegmentedToggle-RRFXCjVd.js","/assets/SetupTimes-AjM-fKnr.js","/assets/ShiftDaily-CLWce_wX.js","/assets/Staff-D5ieOQD_.js","/assets/StatusBadge-D-0skR7n.js","/assets/TargetGoal-DNpFL344.js","/assets/Targets-ikUKMmUs.js","/assets/Tasks-C81eUtfa.js","/assets/TimeWheelPicker-Bkj8C69g.js","/assets/Toast-C8dXwZBt.js","/assets/Tooltip-BauGu-Zv.js","/assets/TrendChart-CIT-kf0V.js","/assets/TripleSpeedometer-BkOdZ0hK.js","/assets/Trudoyomkost-9mTCBzN6.js","/assets/Turnover-CE8TqOzl.js","/assets/UploadDropzone-BxgZL4oZ.js","/assets/UsersActivity-Cud7E6y6.js","/assets/VerdictBlock-Ksk-nzoV.js","/assets/VfxApiMap-CoYgTQlB.js","/assets/VfxDictionaries-IDeNewON.js","/assets/VfxEmployees-DOx8aZrx.js","/assets/VfxHrMoves-CYvhE8YQ.js","/assets/VfxJobs-CeXIuLmA.js","/assets/VfxPhoto-Clozrf6w.js","/assets/VfxShifts-BkRJok_3.js","/assets/VfxState-DI8ARal0.js","/assets/VfxTimebooks-MVFg6gRZ.js","/assets/VfxTimesheet-BoiR7y7i.js","/assets/WatchProgress-DSd3P89z.js","/assets/WebLogin-D3EtlfEu.js","/assets/WorkerConcerns-89rjd4Db.js","/assets/Workers-D4W6Ztnf.js","/assets/Zagruzka-BDNigciL.js","/assets/ZagruzkaCell-Bl23CFLO.js","/assets/api-ATW3EWmc.js","/assets/archive-DsjdO-4C.js","/assets/archive-restore-F9AWTPIm.js","/assets/arrow-down-CQ4_1ZsS.js","/assets/arrow-down-wide-narrow-U0uSJpdB.js","/assets/arrow-up-narrow-wide-umxNwk8R.js","/assets/award-DLjn8m2p.js","/assets/ban-DL4OmRP3.js","/assets/boxes-C-LUw7MY.js","/assets/braces-DVVbnH6u.js","/assets/brigadirFilters-C6L4KlZ8.js","/assets/broadcastTree-Bp4e-a0V.js","/assets/building-2-CqD-60_m.js","/assets/calculator-CAHaUbJ5.js","/assets/calendar-DgN603dy.js","/assets/calendar-days-BxMKjR1G.js","/assets/camera-BWzRJjEU.js","/assets/categories-Dm9XR9ud.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DSdJ78lY.js","/assets/chart-line-Dg7XSirY.js","/assets/chart-pie-MIcOQuT9.js","/assets/chartRange-Cjb_kaDr.js","/assets/check-check-CfaRKeTn.js","/assets/chevron-left-BeLOSNkG.js","/assets/chevrons-up-down-C9Dii0fe.js","/assets/circle-Ayq0Hq8F.js","/assets/circle-alert-B0gs4EHP.js","/assets/circle-check-big-CbkCjkwP.js","/assets/circle-dashed-BK79o2pL.js","/assets/circle-minus-_ysGxse1.js","/assets/circle-question-mark-DAKbZIHU.js","/assets/circle-slash-BEp_uO1x.js","/assets/circle-user-round-BLRetV42.js","/assets/clock-3-DxtNPu9T.js","/assets/cloud-off-QcwRCyqV.js","/assets/cloud-upload-DG5KwV8X.js","/assets/compass-BAL0vslD.js","/assets/concernCategories-DHShrHis.js","/assets/copy-8WPWO9IH.js","/assets/corner-down-right-C2MHE71_.js","/assets/createLucideIcon-BCf8lOSq.js","/assets/es-DpyNkcGU.js","/assets/external-link-BCSGrChQ.js","/assets/file-clock-ha084za1.js","/assets/file-exclamation-point-Bc6tRqjV.js","/assets/flag-B2WgcRqP.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DIbRwxL6.js","/assets/hash-C8DQKO4r.js","/assets/hourglass-D8SJyCD8.js","/assets/image-off-CLEstRKc.js","/assets/image-wV1l-X3k.js","/assets/inbox-Dm2A6bMM.js","/assets/index-BwqOdh8X.js","/assets/index-DFfGVOG_.css","/assets/keyboard-Bb0IAlbS.js","/assets/languages-Ci0WXCGF.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-t3ZmKv5f.js","/assets/lightbulb-D8jpscqF.js","/assets/link-2-BX_Fu8tU.js","/assets/link-2-off-jY66WEIh.js","/assets/list-ordered-D2f3rIii.js","/assets/list-tree-BXB-CqNF.js","/assets/lock-open-B41qPOoF.js","/assets/log-in-DanDg0nf.js","/assets/minimize-2-zPoO4Sxd.js","/assets/package-check-nC3PgPWJ.js","/assets/pencil-jWoTPZrP.js","/assets/percent-6UcJyTeu.js","/assets/pin-6uQwTfaK.js","/assets/pin-off-BwCPqJR4.js","/assets/play-D63wVSo7.js","/assets/plug-zap-935WdCrM.js","/assets/prop-types-DlzVgixM.js","/assets/radio-jIQ49qEg.js","/assets/react-apexcharts.esm-78PJObeb.js","/assets/registers-DMMJ9xHC.js","/assets/repeat-Bn50Utzg.js","/assets/save-gXrDHhI5.js","/assets/scopeLinks-BOmH9ug7.js","/assets/scroll-text-CxfFuhdE.js","/assets/search-x-CMHsuOwv.js","/assets/segments-DES_F05c.js","/assets/send--lcZNkQG.js","/assets/settings-2-qD5gPHgZ.js","/assets/shield-DUdpNlkp.js","/assets/shield-alert-B0EqDr5F.js","/assets/shield-question-mark-D9Zo1F8e.js","/assets/siren-CsuyiyzR.js","/assets/snowflake-D9fHJXqP.js","/assets/split-DDiAu1ID.js","/assets/square-check-big-BMxGWxrn.js","/assets/star-DaBYc4Y5.js","/assets/statusBands-BNa3-Bmz.js","/assets/store-DK5pWHHN.js","/assets/table-2-DzkOLL2k.js","/assets/table-properties-D2ZsGVat.js","/assets/tag-CfOi2LjD.js","/assets/timer-off-DJ6aSqV0.js","/assets/trending-down-CZGfU7Wd.js","/assets/trending-up-BqhfbnQY.js","/assets/undo-2-CsQKXqO4.js","/assets/useChartTheme-DVe5cGYD.js","/assets/useElementWidth-CToBLluO.js","/assets/useIsMobile-DCtFtnRy.js","/assets/useOpenParam-BikcdWKm.js","/assets/useStatusBands-CkCNeSrH.js","/assets/useUrlScope-BCsD-TMv.js","/assets/user-8S39S0WP.js","/assets/user-cog-CFPba7Vp.js","/assets/users-DM0oIajL.js","/assets/vfx-DGw7r6DK.js","/assets/video-CsR3C_Eg.js","/assets/wallet-B9nDLl-T.js","/assets/warehouse-ONSdUp26.js","/assets/x-BNM8pOJ6.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
