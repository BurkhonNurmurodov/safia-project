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

const BUILD = "2026-11-02T06:21:31.065Z";
const PRECACHE = ["/","/assets/AdminPanel-B0OA9l6j.js","/assets/AnalysisBoard-BDOSvSJ6.js","/assets/Arc-D9FacUzN.js","/assets/Assessment-DhCRZ3vO.js","/assets/AssessmentGrade-DtAIFKg3.js","/assets/AssessmentList-CioANJ-K.js","/assets/Assistant-DCk638uL.js","/assets/BrigadirProfile-Uqi_GWb-.js","/assets/BroadcastReceivers--06gUuAI.js","/assets/BroadcastRecord-BGjNwsg8.js","/assets/Button-v49rCa13.js","/assets/CatLockNotice-mEhMFJW7.js","/assets/CategoryLegendModal-M9TYALSe.js","/assets/CellConcerns-BJRxoVXG.js","/assets/CellDetails-AbvoOq1n.js","/assets/CellFormModal-BKoxHjQe.js","/assets/CellIdent-w8PX3-n0.js","/assets/CellLink-DV4peU9A.js","/assets/Cells-CkQFOoSr.js","/assets/ColumnFilter-BMnObSoY.js","/assets/ColumnsPicker-r3zahNqk.js","/assets/CommentsModal-CwYD1w1i.js","/assets/ComparisonTable-Cm6DCdxQ.js","/assets/Concerns-BnBq4naN.js","/assets/ConcernsPieces-Bq2D_4o2.js","/assets/CountStepper-CVvf6iNF.js","/assets/Daily-DGzGS0KZ.js","/assets/DataTable-DL72aHOY.js","/assets/DateRangePicker-Dv6md-9O.js","/assets/DayReportView-Cta4KQP1.js","/assets/DayStepper-C2rtnA-5.js","/assets/DayStrip-B4svkNZg.js","/assets/DifferenceBreakdown-zimAoWjo.js","/assets/Downtime-BSFndNbO.js","/assets/Education-C0z6qCF3.js","/assets/EducationLesson-D0LYiM2n.js","/assets/EmptyState-Dh2-AxvK.js","/assets/Exam-CSFzgoI_.js","/assets/FactorySelect-MXCWLm5v.js","/assets/Gamification-BrWSmfxS.js","/assets/HeatmapChart-7bgfXnaW.js","/assets/IdleCell-DuGFNb-q.js","/assets/KPICard-CZtfJV5B.js","/assets/Kaizen-BkVs72uu.js","/assets/Kelish-CKVdvnBw.js","/assets/KpiDeltaCard-BF_Ivba1.js","/assets/LangTextInput-CXcJfgH3.js","/assets/Layout-C0vnMZA6.js","/assets/LeaderAppeal-CIHtVuLI.js","/assets/LeaderDayReport-DWLt9l-r.js","/assets/LeaderUnitReport-BvKKWQiF.js","/assets/Leaderboard-DkaU4ViM.js","/assets/Leaders-BgNW9onz.js","/assets/LeadersKpi-iibxgbED.js","/assets/Lightbox-BvFVn8r9.js","/assets/LiveOverview-FIIkjeYf.js","/assets/Login-CkBZYU7I.js","/assets/NotFound-GOPNlOOa.js","/assets/Notifications-CCTkM25F.js","/assets/NotionTasks-DV35Iy7p.js","/assets/Ontime-De8wE6o_.js","/assets/Overview-BxTWbNFe.js","/assets/Pagination-130KtnCE.js","/assets/People-BNSNsoQA.js","/assets/PerenaladkaFactTable-DCgyhZTY.js","/assets/PersonCard-Ct1zIdUC.js","/assets/PlanFulfillment-qSaRMHoO.js","/assets/Production-D3KXJywk.js","/assets/Profile-BoQUgZij.js","/assets/ProofCamera-BVqAz4m_.js","/assets/ProofPhoto-Bt-KWn5E.js","/assets/Quality-CqTcjnrV.js","/assets/RawRows-D6dnlh8h.js","/assets/Reports-hdw04r85.js","/assets/RequestStateChip-C1TCj_I2.js","/assets/RichTextEditor-CJKmO4xm.js","/assets/SaveState-Bb847TdU.js","/assets/SearchInput-TSustj6G.js","/assets/SeasonalityHeatmap-B5dk5npq.js","/assets/SegmentedToggle-DrrWIXgu.js","/assets/SetupTimes-VNCXvkgn.js","/assets/ShiftDaily-BNVrACAc.js","/assets/Staff-BTHjlgEo.js","/assets/StaffListAtCheck-DHw8Z4WH.js","/assets/StatusBadge-pDewqd5N.js","/assets/StatusBandsModal-Cquo0I-F.js","/assets/TargetGoal-CzzsKn4y.js","/assets/Targets-CPg_I1ak.js","/assets/Tasks-CYV0Ag8m.js","/assets/TimeWheelPicker-Se7apFNO.js","/assets/Toast-Bi1Jhz6j.js","/assets/Tooltip-CZ9LQIuW.js","/assets/TrelloAnalytics-DnTlqq8p.js","/assets/TrendChart-B4ZQ827j.js","/assets/TripleSpeedometer-DIOodwdM.js","/assets/Trudoyomkost-BfXS6Xyg.js","/assets/UploadDropzone-Bpew29lt.js","/assets/UsersActivity-Buka0fBu.js","/assets/VerdictBlock-DgqeceI3.js","/assets/VfxApiMap-DoDCqX9A.js","/assets/VfxDictionaries-CAMtLaWZ.js","/assets/VfxEmployees-DEV-2HBi.js","/assets/VfxHrMoves-a4f1mVhP.js","/assets/VfxJobs-17-YyC29.js","/assets/VfxPhoto-DyCIT2h2.js","/assets/VfxShifts-CNSjhzIf.js","/assets/VfxState-456vP1TV.js","/assets/VfxTimebooks-B7wRFKWe.js","/assets/VfxTimesheet-D8_Rsk6M.js","/assets/WatchProgress-Dc3UX86i.js","/assets/WebLogin-PsenSUSJ.js","/assets/Workers-C5fUT1E2.js","/assets/Zagruzka-D8Dx9Arp.js","/assets/ZagruzkaCell-Dn_yNC-F.js","/assets/api-BFm7MSgf.js","/assets/archive-o5DpRSWJ.js","/assets/archive-restore-Bhbj0_Rx.js","/assets/arrow-down-CP96YUzU.js","/assets/arrow-down-right-9zkV52at.js","/assets/arrow-down-wide-narrow-CCrO-jcG.js","/assets/arrow-up-narrow-wide-D6sB709o.js","/assets/ban-DtAg1T5j.js","/assets/book-check-CETiNuop.js","/assets/boxes-CxfHTAKo.js","/assets/braces-KbG_26I4.js","/assets/brigadirFilters-DEAOYNSz.js","/assets/broadcastTree-BJY4MD9x.js","/assets/calendar-DUJmi-zo.js","/assets/calendar-days-B0zB58JK.js","/assets/calendar-x-2-DcexXWjA.js","/assets/camera-DU768Fcx.js","/assets/categories-h5-lR0O_.js","/assets/cellMoveRefusal-B0IO1fPk.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-0UCGw5-O.js","/assets/chart-line-DOKAoPkS.js","/assets/chart-pie-DLI_OVeZ.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-CXbg9PNS.js","/assets/chevron-left-BUyu5ux_.js","/assets/chevrons-up-down-CYYfU_-Y.js","/assets/circle-alert-B-Y0uSwR.js","/assets/circle-check-big-Dqj8hpth.js","/assets/circle-dashed-z4siUYXr.js","/assets/circle-jV4t5KqN.js","/assets/circle-minus-DlEXe2ER.js","/assets/circle-question-mark-vrlRlYpd.js","/assets/circle-user-round-Cm2qw4HB.js","/assets/cloud-off-5XM47GXA.js","/assets/cloud-upload-BKxEcYhl.js","/assets/coins-DYwUBVzL.js","/assets/compass-D2w3s-ch.js","/assets/concernCategories-BHH4PkOJ.js","/assets/corner-down-right-CzN6KOG_.js","/assets/createLucideIcon-Dn713eGN.js","/assets/en-BQFo1iXq.js","/assets/es-Dtgc5NM1.js","/assets/external-link-CLhXel1B.js","/assets/file-exclamation-point-Ct76A-eO.js","/assets/flag-Cv9hRenO.js","/assets/folder-tree-CRUahkPC.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-B5elT9Dr.js","/assets/funnel-DZYj5DU2.js","/assets/hard-hat-BK-h-eUL.js","/assets/hash-DYRhqyPP.js","/assets/hourglass-Cig_ug6C.js","/assets/idleTime-CHPnJRpw.js","/assets/image--Vkj0TqE.js","/assets/image-off-C07Cw-Nk.js","/assets/inbox-f3IBnMVb.js","/assets/index-B28cLWr7.js","/assets/index-B6UWGfhQ.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-m78Nef2W.js","/assets/layers-BlDhaGrV.js","/assets/leaderBoard-DazOXyzI.js","/assets/lightbulb-DzF0P1ii.js","/assets/link-2-DwtQrlLY.js","/assets/link-2-off-B6jY0Lnm.js","/assets/list-ordered-DC60zQXK.js","/assets/list-tree-CKFLxRF2.js","/assets/lock-open-XJdderJs.js","/assets/log-in-DJ_-Erjo.js","/assets/map-pin-DPK3ZpXb.js","/assets/marks-DTwcgX7b.js","/assets/message-square-text-CYmsBUvz.js","/assets/minimize-2-Cl7VempI.js","/assets/notionUtil-CNRHVUvL.js","/assets/package-BHUToXWm.js","/assets/package-check-pUnQKCtq.js","/assets/pencil-VecqQUTO.js","/assets/percent-KYyjGowG.js","/assets/pin-Bx2MeZSB.js","/assets/pin-off-BN6CFMMo.js","/assets/play-BcCFlh9w.js","/assets/plug-zap-SXpCu0Yg.js","/assets/prop-types-RD3fbola.js","/assets/radio-4jJsjFFX.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-CjxFxHO6.js","/assets/repeat-5t-BJ4Wq.js","/assets/ru-CPSNQ6PB.js","/assets/save-CIUtu3GQ.js","/assets/scopeLinks-BjWuudYN.js","/assets/search-x-C9b6EP1t.js","/assets/segments-D5Uiedtv.js","/assets/send-CT-O4he7.js","/assets/shield-BEAX8M3E.js","/assets/shield-alert-mQDwp3BZ.js","/assets/sigma-BZvX0PuI.js","/assets/siren-CdwBjItM.js","/assets/snowflake-CpPmx4E3.js","/assets/split-Benj6N_S.js","/assets/square-check-big-yQSKemPP.js","/assets/star-DdFCu50t.js","/assets/statusBands-DVBZcBq3.js","/assets/store-rXMieDL8.js","/assets/sunrise-CLPdYhlO.js","/assets/table-2-BLjDxxrr.js","/assets/table-properties-DPt5a2N8.js","/assets/tag-CxZR7RR9.js","/assets/timer-off-B-VlD9wq.js","/assets/translations-BvBhNsAy.js","/assets/trelloUtil-BKpeq2-n.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-YtFhRj6L.js","/assets/trending-up-D3jtJzMv.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-VD2E9CNZ.js","/assets/useChartTheme-304Sh69W.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-DybW-Fjh.js","/assets/useStatusBands-dUUUv9hp.js","/assets/useUrlScope-BDM_C30Y.js","/assets/user-B8N_xd1q.js","/assets/user-cog-CyLLjx7x.js","/assets/uz-CBka3cwX.js","/assets/uz_cyrl-2DWzQGHp.js","/assets/vfx-Dsh1Ki4o.js","/assets/video-DTY38gts.js","/assets/wallet-B4BV_hKq.js","/assets/warehouse-9QkRh4fM.js","/assets/workflow-09Xrfxu-.js","/assets/x-Q4xhbZ87.js","/assets/zap-Ci4WI_V-.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
