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

const BUILD = "2026-10-29T06:41:27.275Z";
const PRECACHE = ["/","/assets/AdminPanel-m1KOjTIr.js","/assets/AnalysisBoard-giHkrLR0.js","/assets/Arc-BlYGa_av.js","/assets/Assistant-Ceiy7zJP.js","/assets/BrigadirProfile-B9j4gumx.js","/assets/BroadcastReceivers-d2oxvPnM.js","/assets/BroadcastRecord-BIfSJAd4.js","/assets/Button-CCf-D87x.js","/assets/CatLockNotice-B9pbkTA9.js","/assets/CategoryLegendModal-BtOjLQMt.js","/assets/CellConcerns-Bb-QL-ly.js","/assets/CellDetails-BY8vqAD-.js","/assets/CellFormModal--lMCNVLx.js","/assets/CellIdent-hb7jLKkt.js","/assets/CellLink-5iJNUrey.js","/assets/Cells-Bvpg8cb4.js","/assets/ColumnFilter-BN-EOoQU.js","/assets/ColumnsPicker-DFmi8nfo.js","/assets/CommentsModal-6lTDNvoU.js","/assets/ComparisonTable-bDX3IKke.js","/assets/Concerns-BmkcopOZ.js","/assets/CountStepper-Cm2AIPSW.js","/assets/Daily-Ds4ON4ja.js","/assets/DataTable-DZUYLvQR.js","/assets/DateRangePicker-DSvYLxzd.js","/assets/DayReportView-Amn2j6Lv.js","/assets/DayStepper-CqVifoGt.js","/assets/DayStrip-LOlF1eQU.js","/assets/DifferenceBreakdown-D-woIVX7.js","/assets/Downtime-CBy5GCW5.js","/assets/Education-DhHdfPaz.js","/assets/EducationLesson-M2tq2btV.js","/assets/EmptyState-8KSVL-WA.js","/assets/Exam-CoiXEpL0.js","/assets/FactorySelect-mNEIVY7_.js","/assets/Gamification-Dqr7KLGk.js","/assets/GroupBadge-D2A5z1xC.js","/assets/HeatmapChart-C8A-px-I.js","/assets/IdleCell-Cyjbyqen.js","/assets/KPICard-CglimPgo.js","/assets/Kaizen-j52d1FEP.js","/assets/Kelish-Ba9juvfa.js","/assets/KpiDeltaCard-C795XS_6.js","/assets/LangTextInput-DLlhc3ji.js","/assets/Layout-DJE1Na7r.js","/assets/LeaderAppeal-CDZMfbYB.js","/assets/LeaderDayReport-Dos67NI5.js","/assets/LeaderUnitReport-C9kv-fTS.js","/assets/Leaderboard-D6PSBN1-.js","/assets/Leaders-DqaZlTgo.js","/assets/LeadersKpi-B4d9NnX0.js","/assets/Lightbox-Cawcw-6z.js","/assets/LiveOverview-BpAGTozj.js","/assets/Login-ChWG_snE.js","/assets/NotFound-CW8gc67m.js","/assets/Notifications-Cb5YvuOC.js","/assets/Ontime-BQG_jZbj.js","/assets/Overview-B0WpcC_1.js","/assets/Pagination-INs5ZlHD.js","/assets/PerenaladkaFactTable-BW5aQi_3.js","/assets/PersonCard-Bb_6v5Vb.js","/assets/PlanFulfillment-Da4hGJcA.js","/assets/Production-D1_15nwe.js","/assets/Profile-0l3FUff-.js","/assets/ProofCamera-9WcEHjWt.js","/assets/ProofPhoto-RHQNvxtZ.js","/assets/Quality-B-TBrSEb.js","/assets/RawRows-D5z6ZL5h.js","/assets/Reports-BaUp6Iec.js","/assets/RequestStateChip-CFmHbCf2.js","/assets/RichTextEditor-CLt0DeEU.js","/assets/SaveState-B3fA-lkf.js","/assets/SearchInput-nTKfuoGc.js","/assets/SeasonalityHeatmap-BB6qC48L.js","/assets/SegmentedToggle-BMAB4n4z.js","/assets/SetupTimes-D6RWLfNG.js","/assets/ShiftDaily-CsVuksKl.js","/assets/Staff-BGP1FEU1.js","/assets/StaffListAtCheck-DU2b3AIb.js","/assets/StatusBadge-BfnOpF9H.js","/assets/StatusBandsModal-CL_7HaRZ.js","/assets/TargetGoal-Cz311DTq.js","/assets/Targets-DCPC8QAT.js","/assets/Tasks-Bh0cTqcb.js","/assets/TimeWheelPicker-DYPLWy_v.js","/assets/Toast-C78Ltp65.js","/assets/Tooltip-NJ4C7XBG.js","/assets/TrendChart-B8jDiKDZ.js","/assets/TripleSpeedometer-BE0u73QP.js","/assets/Trudoyomkost-DopTY72k.js","/assets/UploadDropzone-DFABNdPe.js","/assets/UsersActivity-uVGvOc7q.js","/assets/VerdictBlock-CrQ1l9XX.js","/assets/VfxApiMap-DrhNcRlW.js","/assets/VfxDictionaries-C5lt8o0l.js","/assets/VfxEmployees-D5Hcw9Je.js","/assets/VfxHrMoves-JKW7Q8bg.js","/assets/VfxJobs-Br9Uu2iR.js","/assets/VfxPhoto-DdiYxqAi.js","/assets/VfxShifts-Dn_3N6dQ.js","/assets/VfxState-DuJIVymc.js","/assets/VfxTimebooks-CfNM10l9.js","/assets/VfxTimesheet-CNe_x7uM.js","/assets/WatchProgress-BbbTcz-z.js","/assets/WebLogin-X4mGEVV6.js","/assets/Workers-DhAJ8Ml2.js","/assets/Zagruzka-CtNjIY18.js","/assets/ZagruzkaCell-B_LTELMo.js","/assets/api-BFm7MSgf.js","/assets/archive-DVo-UjBE.js","/assets/archive-restore-_18P2cD0.js","/assets/arrow-down-COXQUDq6.js","/assets/arrow-down-right-BcjQxa-S.js","/assets/arrow-down-wide-narrow-CTh-DBMD.js","/assets/arrow-up-narrow-wide-CS5qQMh0.js","/assets/ban-DpACHsBw.js","/assets/boxes-B3fAekzZ.js","/assets/braces-BsZ7worG.js","/assets/brigadirFilters-Bhs4J5K1.js","/assets/broadcastTree-DraiGZPp.js","/assets/building-2-CcxntVxP.js","/assets/calendar-CTGDXxCD.js","/assets/calendar-days-x6KBpGhD.js","/assets/camera-Cey6wT6W.js","/assets/categories-DMA_ODBk.js","/assets/cellMoveRefusal-tChRJHZ3.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CGSfTlOw.js","/assets/chart-line-C-pv2DMF.js","/assets/chart-pie-RyNeAyqS.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-BlTle_8j.js","/assets/chevron-left-BYeGRnLI.js","/assets/chevrons-up-down-DTqSKW_I.js","/assets/circle-BGz5nRiH.js","/assets/circle-alert-DIj1Zzbq.js","/assets/circle-check-big-BQwgOwL6.js","/assets/circle-dashed-CPrqJnrn.js","/assets/circle-minus-CL6w5GAW.js","/assets/circle-question-mark-cJd9WC03.js","/assets/circle-slash-Csb9iuEN.js","/assets/circle-user-round-CvRH_dWj.js","/assets/cloud-off-CMtbWk1y.js","/assets/cloud-upload-BQor6Rwf.js","/assets/coins-BrDKVhAw.js","/assets/compass-CX1hNWY_.js","/assets/concernCategories-B7bNO4zL.js","/assets/corner-down-right-A6PkiwO5.js","/assets/createLucideIcon-BqI7QXC_.js","/assets/en-Dvdl44te.js","/assets/es-Dtgc5NM1.js","/assets/external-link-zF_0f6_E.js","/assets/file-clock-DA3XiUZI.js","/assets/file-exclamation-point-Dbygo1q_.js","/assets/flag-BJuNzywg.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-sD19kXzB.js","/assets/funnel-G2oWiTca.js","/assets/hash-gJcnrsGU.js","/assets/hourglass-qUyy0GyL.js","/assets/idleTime-CHPnJRpw.js","/assets/image-BpwUzPCl.js","/assets/image-off-TNi327Mg.js","/assets/inbox-CeBvZou_.js","/assets/index-BtYmuUYW.css","/assets/index-DYOIvq84.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-Cy2l3ZeZ.js","/assets/languages-BSBOOVrp.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BbLXFWCQ.js","/assets/leaderBoard-Da29q6Ud.js","/assets/lightbulb-O2hGiv6g.js","/assets/link-2-CW1FVbA0.js","/assets/link-2-off-BvySxzd0.js","/assets/list-ordered-CqSjxOET.js","/assets/list-tree-C6LJjYoj.js","/assets/lock-open-BULa0XX8.js","/assets/log-in-74ysZC-c.js","/assets/map-pin-Budav8zi.js","/assets/marks-JBnjeSjy.js","/assets/minimize-2-CaOcsCtr.js","/assets/package-check-xwBVXrBv.js","/assets/pencil-BCNyAldl.js","/assets/percent-CrmANfcK.js","/assets/pin-DB1RIF8X.js","/assets/pin-off-BmVCXhBS.js","/assets/play-Bc5kuHtY.js","/assets/plug-zap-_B_-ayjW.js","/assets/prop-types-RD3fbola.js","/assets/radio-B_dDNsp9.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-sxYzj9Pt.js","/assets/repeat-D0sMCcLm.js","/assets/ru-C8wwprTv.js","/assets/save-CcJ6AOmT.js","/assets/scopeLinks-CbAduVqS.js","/assets/scroll-text-CDaYhed0.js","/assets/search-x-Br7S_0oG.js","/assets/segments-D5Uiedtv.js","/assets/send-D_jmGhv2.js","/assets/settings-2-B0cRUUQD.js","/assets/shield-alert-Bh5HNGtT.js","/assets/shield-eQhF18xf.js","/assets/shield-question-mark-DX6eIboJ.js","/assets/sigma-DZYtf-3c.js","/assets/siren-CREVrxtU.js","/assets/snowflake-CERioukZ.js","/assets/split-SaoWDj9l.js","/assets/square-check-big-B9UNgvkV.js","/assets/star-BN9dmonS.js","/assets/statusBands-DVBZcBq3.js","/assets/store-BefaG4H-.js","/assets/table-2-DNHLz0cX.js","/assets/table-properties-Byjzc6PV.js","/assets/tag-CeWolhLU.js","/assets/timer-off-BaTGU4fG.js","/assets/translations-KOkNqQIs.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-BD-3GLAd.js","/assets/trending-up-Bmh6H3Ob.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-Cs79IhcM.js","/assets/useChartTheme-Cr04ff0S.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-B_HoCJkU.js","/assets/useStatusBands-D7v2vvn3.js","/assets/useUrlScope-l5QKAN4o.js","/assets/user-DwC8CYbQ.js","/assets/user-cog-BnPLHfbo.js","/assets/user-minus-CQNYcy4J.js","/assets/users-CIMpeGyz.js","/assets/uz-QkgN984k.js","/assets/uz_cyrl-C3bN7Pix.js","/assets/vfx-ndChuUk5.js","/assets/video-Bkm2qXXG.js","/assets/wallet-CAre6lwv.js","/assets/warehouse-KMBH7qYD.js","/assets/workflow-Lxvfkm4P.js","/assets/x-DPR4HHmt.js","/assets/zap-yOQ5Rj9H.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
