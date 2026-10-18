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

const BUILD = "2026-10-18T18:35:30.131Z";
const PRECACHE = ["/","/assets/AdminPanel-C9uyNQaP.js","/assets/AnalysisBoard-CUwh2dFW.js","/assets/Arc-CWxeMZto.js","/assets/Assistant-D9BBdViy.js","/assets/BrigadirProfile-etiaeAU2.js","/assets/BroadcastReceivers-CudFAYlf.js","/assets/BroadcastRecord-CePPAvAl.js","/assets/Button-cJa0-zRY.js","/assets/CatLockNotice-IgEmEMzh.js","/assets/CategoryLegendModal-DXE2Dp-o.js","/assets/CellConcerns-Beu7wI0P.js","/assets/CellDetails-CkXPRIR2.js","/assets/CellFormModal-ach2hw9B.js","/assets/CellIdent-Buqj8y_t.js","/assets/CellLink-BI75kitf.js","/assets/Cells-BBfIis5P.js","/assets/ColumnFilter-BMifjD0q.js","/assets/ColumnsPicker-CXPL23uw.js","/assets/CommentsModal-DLPQC8XY.js","/assets/ComparisonTable-DZ2i37Ef.js","/assets/Concerns-5rvFH0iC.js","/assets/CountStepper-D3tUVNmc.js","/assets/Daily-BIjuRI_P.js","/assets/DataTable-Cxcvu9se.js","/assets/DateRangePicker-Bk_Uq-79.js","/assets/DayReportView-NcpfgSn9.js","/assets/DayStepper-2wXECzt2.js","/assets/DifferenceBreakdown-C87uB2fe.js","/assets/Downtime-BrsM-EAD.js","/assets/Education-DXx-wJIr.js","/assets/EducationLesson-Dpr9GADt.js","/assets/EmptyState-CSGKComw.js","/assets/Exam-CAWUMMsG.js","/assets/FactorySelect-Co0nfQrH.js","/assets/ForeignObjects-CmpdpExJ.js","/assets/Gamification-B6GVBCpY.js","/assets/GroupBadge-C8HABRm_.js","/assets/HeatmapChart-BZxDmv_-.js","/assets/IdleCell-BNH89DwX.js","/assets/KPICard-C8LGCDPj.js","/assets/Kaizen-DlHvP2wC.js","/assets/Kelish-BzpI95m1.js","/assets/KpiDeltaCard-BztzCLoj.js","/assets/LangTextInput-ef5RNXOm.js","/assets/Layout-BSjfkg4T.js","/assets/LeaderAppeal-gTH1-DoN.js","/assets/LeaderDayReport-1uYuy3Sz.js","/assets/LeaderUnitReport-u4liK_0N.js","/assets/Leaderboard-DCsyqEru.js","/assets/Leaders-DgbuJQQi.js","/assets/Lightbox-DjVZNZv8.js","/assets/LiveOverview-DZKWsAwb.js","/assets/Login-o9zoR0K1.js","/assets/NotFound-P0VNhgZE.js","/assets/Notifications-w6I_3d-k.js","/assets/Overview-toyMaN0s.js","/assets/Pagination-Cwn2lT51.js","/assets/PerenaladkaFactTable-COOdnGNR.js","/assets/PersonCard-yFMiudVr.js","/assets/PlanFulfillment-1FijnKkH.js","/assets/Production-BIcgSR20.js","/assets/Profile-TxefP23B.js","/assets/ProofCamera-B1lpmxWB.js","/assets/ProofPhoto-CFD0csw2.js","/assets/Quality-GwKIl_K-.js","/assets/RawRows-xghOKATK.js","/assets/RequestStateChip-DgqHelbm.js","/assets/RichTextEditor-DBrX3kz6.js","/assets/SaveState-Byt4C4ko.js","/assets/SearchInput-D2lMFC7i.js","/assets/SeasonalityHeatmap-CiiOQ4No.js","/assets/SegmentedToggle-D6qmt41r.js","/assets/SetupTimes-C82-1lGu.js","/assets/ShiftDaily-Fpshm2oT.js","/assets/Staff-DpnWGdE8.js","/assets/StaffListAtCheck-D5m_3He2.js","/assets/StatusBadge-DNRJmhYD.js","/assets/TargetGoal-BCuhBq4_.js","/assets/Targets-CDSbqqCr.js","/assets/Tasks-cGY-UiiS.js","/assets/TimeWheelPicker-D6kXUQMC.js","/assets/Toast-1b0GHxd6.js","/assets/Tooltip-Bu7mqHR1.js","/assets/TrendChart-Pu3u3Iwm.js","/assets/TripleSpeedometer-Cci4QDI4.js","/assets/Trudoyomkost-Cipy9vtt.js","/assets/Turnover-CmNZfoyD.js","/assets/TurnoverBits-Celkj-Ga.js","/assets/UploadDropzone-CdymdOjM.js","/assets/UsersActivity-Dx0vyTS3.js","/assets/VerdictBlock-b65jgyI6.js","/assets/VfxApiMap-BO6dRvkO.js","/assets/VfxDictionaries-BGuzxMeD.js","/assets/VfxEmployees-Rp2_oNep.js","/assets/VfxHrMoves-CX77GTtE.js","/assets/VfxJobs-DKcHO_cJ.js","/assets/VfxPhoto-D_iMf3Ck.js","/assets/VfxShifts-CPBTC1gc.js","/assets/VfxState-uy0PBmFF.js","/assets/VfxTimebooks-GrOsqYt-.js","/assets/VfxTimesheet-CZFrSu0u.js","/assets/WatchProgress-DJu2YAuu.js","/assets/WebLogin-Dpyu0Hs9.js","/assets/WorkerConcerns-D4PcDPxN.js","/assets/Workers-DG5Pfmci.js","/assets/Zagruzka-Bbx6DxQj.js","/assets/ZagruzkaCell-By_M712U.js","/assets/api-CAGRwGCP.js","/assets/archive-restore-C2nyJZK8.js","/assets/archive-srLXkcMS.js","/assets/arrow-down-iSerrbi5.js","/assets/arrow-down-wide-narrow-BAD_zaGU.js","/assets/arrow-up-narrow-wide-CoPHOX3a.js","/assets/award-CsQEjOoX.js","/assets/ban-DuwET8aP.js","/assets/boxes-B8_8pxox.js","/assets/braces-DaQ8RB9O.js","/assets/brigadirFilters-Dw9DcxPP.js","/assets/broadcastTree-M0wTc8ER.js","/assets/building-2-C0LrBlQj.js","/assets/calculator-DYrmz1PF.js","/assets/calendar-days-DLztgVAD.js","/assets/calendar-lP4khxuf.js","/assets/camera-BVFuBN8k.js","/assets/categories-cyvTC7ZR.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-YTXJxGCu.js","/assets/chart-line-Bs_3tfgx.js","/assets/chart-pie-C4CTIOKL.js","/assets/chartRange-DocwxZp7.js","/assets/check-check-CpYZSERU.js","/assets/chevron-left-D75qhgxF.js","/assets/chevrons-up-down-BLKqGyxt.js","/assets/circle-alert-DdCZBdD7.js","/assets/circle-check-big-D1gBrtj-.js","/assets/circle-dashed-BGYw7L4w.js","/assets/circle-e-wYSmjT.js","/assets/circle-minus-B4k89Yt7.js","/assets/circle-question-mark-BEhUENZd.js","/assets/circle-slash-SIMkqQp4.js","/assets/circle-user-round-DvFIkPTA.js","/assets/cloud-off-Dm4EMrUR.js","/assets/cloud-upload-DsZwT0mh.js","/assets/compass-Ba3WWt56.js","/assets/concernCategories-Rh7v4uLg.js","/assets/corner-down-right-BEVu6jRb.js","/assets/createLucideIcon-BTSW_b9D.js","/assets/es-DCFIIUfu.js","/assets/external-link-DoZXMnto.js","/assets/file-clock-n6FDoGod.js","/assets/file-exclamation-point-D_iF2-O3.js","/assets/flag-BrFP1HhS.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CFu9W1Y2.js","/assets/hash-BLoOXpYW.js","/assets/hourglass-BYss9_Mr.js","/assets/image-ZoVecv0b.js","/assets/image-off-Cl3QA3-H.js","/assets/inbox-CM_C1W0B.js","/assets/index-ByhNoNK_.css","/assets/index-CzpMHqj_.js","/assets/keyboard-9OfvPXIH.js","/assets/languages-B4PmYtto.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CV9U1ELt.js","/assets/lightbulb-DqbROJth.js","/assets/link-2-1z-l4L2k.js","/assets/link-2-off-4tkQgXg-.js","/assets/list-ordered-luMcL0ui.js","/assets/list-tree-DuJJJUT5.js","/assets/lock-open-C2zXzZy8.js","/assets/log-in-g2aDZeq4.js","/assets/marks-BYM0PxCQ.js","/assets/minimize-2-DUQHvAD6.js","/assets/package-check-BZ741vqr.js","/assets/pencil-C_cY5Erc.js","/assets/percent-CZMa9LJr.js","/assets/pin-BfGGTl7L.js","/assets/pin-off-DJlIFomE.js","/assets/play-OvEppgiC.js","/assets/plug-zap-BPy2a2JI.js","/assets/prop-types-DcAnXyAR.js","/assets/radio-C5QYTkTx.js","/assets/react-apexcharts.esm-BKd3gbSL.js","/assets/registers-C9IkV36i.js","/assets/repeat-y_vwrnnb.js","/assets/save-eeZkmDUa.js","/assets/scopeLinks-C_Nb0ymd.js","/assets/scroll-text-SzTDOVPq.js","/assets/search-x-CdhFYJGb.js","/assets/segments-BgWrd9G1.js","/assets/send-B_vzo-bd.js","/assets/settings-2-DdR8KMv3.js","/assets/shield-aEnHM1F2.js","/assets/shield-alert-B4jVGqUn.js","/assets/shield-question-mark-BkUQtu-v.js","/assets/siren-DVT9hhe6.js","/assets/snowflake-BJi74fVX.js","/assets/split-CLoo5172.js","/assets/square-check-big-BSvlCQ_s.js","/assets/star-Xz5JUfWU.js","/assets/statusBands-CcSsYvB6.js","/assets/store-DUeJ5Nvk.js","/assets/table-2-CMxL3571.js","/assets/table-properties-74K1OKGN.js","/assets/tag-B4me9V_I.js","/assets/timer-off-DJW133Gw.js","/assets/trending-down-fiLKTHFb.js","/assets/trending-up-VhlBeXud.js","/assets/undo-2-BVS2yT4M.js","/assets/useChartTheme-DITWlUIH.js","/assets/useElementWidth-BIfuXjAZ.js","/assets/useIsMobile-JShmk492.js","/assets/useOpenParam-CWTzqGaX.js","/assets/useStatusBands-B6MgTL-z.js","/assets/useUrlScope-ByMRULK_.js","/assets/user-S6Ex-TBK.js","/assets/user-cog-2tb8ctr3.js","/assets/users-CS9yGV-q.js","/assets/vfx-DvYg6zzB.js","/assets/video-CmlbqChW.js","/assets/wallet-CwEcm7Cj.js","/assets/warehouse-KQyBKF6B.js","/assets/workflow-B9wm6Mnl.js","/assets/x-BJK7tCcu.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
