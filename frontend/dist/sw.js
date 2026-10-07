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

const BUILD = "2026-10-07T04:54:02.753Z";
const PRECACHE = ["/","/assets/AdminPanel-DUaN7VRF.js","/assets/AnalysisBoard-DgrhOs2C.js","/assets/Arc-CTyEvMHJ.js","/assets/Assistant-Bwi1FqwP.js","/assets/BrigadirProfile-CngVI2Vs.js","/assets/BroadcastReceivers-CH6nkLbc.js","/assets/BroadcastRecord-C77EVS2m.js","/assets/Button-BsuU2DiG.js","/assets/CatLockNotice-DjKrMDm_.js","/assets/CategoryLegendModal-DGsaDGBM.js","/assets/CellConcerns-BIAizr6b.js","/assets/CellDetails-CzO6s7Vj.js","/assets/CellFormModal-BgKKQ0Hz.js","/assets/CellIdent-aocJ6oir.js","/assets/CellLink-BSok91Uf.js","/assets/Cells-BJa0lfnN.js","/assets/ColumnFilter-lcd1zEzB.js","/assets/ColumnsPicker-Dzalh0xs.js","/assets/CommentsModal-BF1m4jpG.js","/assets/ComparisonTable-Cofdy2Q0.js","/assets/Concerns-aSIhb8pk.js","/assets/Daily-nSe33arb.js","/assets/DataTable-BcTswsOT.js","/assets/DateRangePicker-XLb3Howr.js","/assets/DayReportView-BwILOVf7.js","/assets/DayStepper-BBiGiJMs.js","/assets/DifferenceBreakdown-DoLw3xC6.js","/assets/Downtime-BryoChzC.js","/assets/Education-BhS6DFyH.js","/assets/EducationLesson-DbQH9s0g.js","/assets/EmptyState-DXzlOE9U.js","/assets/Exam-Bu0fvbba.js","/assets/FactorySelect-DwmobW2O.js","/assets/Gamification-C-0JzpJQ.js","/assets/GroupBadge-DP5gpbB3.js","/assets/HeatmapChart-ChPDRFZT.js","/assets/IdleCell-DtH05w9b.js","/assets/KPICard-BNMy6ao2.js","/assets/Kaizen-CHjYn-7I.js","/assets/Kelish-BrkWZFCA.js","/assets/KpiDeltaCard-Dxiweh9o.js","/assets/LangTextInput-CAUCYxAA.js","/assets/Layout-Bzd-aOGz.js","/assets/LeaderAppeal-Bc35wH-d.js","/assets/LeaderDayReport-CYdfC4m6.js","/assets/LeaderUnitReport-DHcTwlQB.js","/assets/Leaderboard-Bc173W8c.js","/assets/Leaders-C5PHhC2_.js","/assets/Lightbox-MqNsOBNG.js","/assets/LiveOverview-sW70hsEe.js","/assets/Login-D0PFvFf2.js","/assets/NotFound-BQP68o2U.js","/assets/Notifications-BSKpSoMO.js","/assets/Overview-CvPTOD1O.js","/assets/Pagination-hBzqbBWG.js","/assets/PerenaladkaFactTable-D3wuTUCJ.js","/assets/PersonCard-f7-lTdON.js","/assets/PlanFulfillment-De1ggBJH.js","/assets/Production-r4raeKYq.js","/assets/Profile-C7wCWrWJ.js","/assets/ProofCamera-TN5itHsV.js","/assets/ProofPhoto-B_Lf-Y8U.js","/assets/Quality-QF9SsZ22.js","/assets/RawRows-1adZul1u.js","/assets/RequestStateChip-CWgOV7ZN.js","/assets/RichTextEditor-tNKqBF_r.js","/assets/SaveState-BzhXww_v.js","/assets/SearchInput-Dt4mOxWT.js","/assets/SeasonalityHeatmap-DLFyz5Ml.js","/assets/SegmentedToggle-nwCUekWT.js","/assets/SetupTimes-DWxlxlHy.js","/assets/ShiftDaily-rfQZMfhb.js","/assets/Staff-CqS0LCZO.js","/assets/StatusBadge-KdF-TSep.js","/assets/TargetGoal-DEYBugK4.js","/assets/Targets-CLjQxV0s.js","/assets/Tasks-Bs8h-13-.js","/assets/TimeWheelPicker-t0xq6Ikq.js","/assets/Toast-BwH4V19c.js","/assets/Tooltip-4gIxmDRK.js","/assets/TrendChart-VohvSbsv.js","/assets/TripleSpeedometer-DbVneZeK.js","/assets/Trudoyomkost-BB7scmnd.js","/assets/Turnover-1RSCNyjp.js","/assets/UploadDropzone-Q51Xqcgf.js","/assets/UsersActivity-GnEux18l.js","/assets/VerdictBlock-BlYcDsVj.js","/assets/VfxApiMap-BrZqrMdc.js","/assets/VfxDictionaries-B3PRUue9.js","/assets/VfxEmployees-BQPYG5GO.js","/assets/VfxHrMoves-DXM1xr26.js","/assets/VfxJobs-Du_xumrK.js","/assets/VfxPhoto-CCBG-vzL.js","/assets/VfxShifts-Dlwg75JU.js","/assets/VfxState-CFudBXe_.js","/assets/VfxTimebooks-bdrtPTFO.js","/assets/VfxTimesheet-yw-jnNLP.js","/assets/WatchProgress-BAxcsnPc.js","/assets/WebLogin-Bit1hma2.js","/assets/WorkerConcerns-DGqbq8wc.js","/assets/Workers-CzIK8g3V.js","/assets/Zagruzka-CGyufzpH.js","/assets/ZagruzkaCell-ByGTT9y6.js","/assets/api-8OzrOn0H.js","/assets/archive-B9lx_I4a.js","/assets/archive-restore-DYnj4WBz.js","/assets/arrow-down-B2DX7u2l.js","/assets/arrow-up-narrow-wide-DI2L2OLG.js","/assets/award-CTG3Pr_2.js","/assets/ban-CAHdqmH1.js","/assets/boxes-CIMFG5wF.js","/assets/braces-CFHT3Y9L.js","/assets/brigadirFilters-CsTWBhHA.js","/assets/broadcastTree-CaC7OeXk.js","/assets/building-2-srjoFJ20.js","/assets/calculator-D2gKJBJ_.js","/assets/calendar-BNj_lhDr.js","/assets/calendar-days-DFT54SLz.js","/assets/camera-BDkZaLOZ.js","/assets/categories-B79V2NGm.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-pPIyR1FL.js","/assets/chart-line-CKmgO3yl.js","/assets/chart-pie-BceYE89N.js","/assets/chartRange-BYUoGYOn.js","/assets/check-check-DXxRs5AH.js","/assets/chevron-left-CRrrmtRn.js","/assets/chevrons-up-down-xGelhQ1W.js","/assets/circle-Cm1qLZ75.js","/assets/circle-alert-D4p72nfY.js","/assets/circle-check-big-D7JflaZC.js","/assets/circle-dashed-Dw_NrjwI.js","/assets/circle-minus-E3VPo4vM.js","/assets/circle-question-mark-COjUFXEz.js","/assets/circle-slash-CK7roqxN.js","/assets/circle-user-round-9KADTC1n.js","/assets/clock-3-C688Wrbu.js","/assets/cloud-off-CYZGY-ek.js","/assets/cloud-upload-43X-FAHf.js","/assets/compass-B644-Juv.js","/assets/concernCategories-C42qdxuQ.js","/assets/copy-YPi_fr8n.js","/assets/corner-down-right-TP0skL57.js","/assets/createLucideIcon-LUCYZjgm.js","/assets/es-CtQxV2AG.js","/assets/external-link-C2zym2oe.js","/assets/file-clock-Cv84SMca.js","/assets/file-exclamation-point-DQ81Jq8C.js","/assets/flag-McYYimcs.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Bzz8PJvq.js","/assets/hash-BcUcueJl.js","/assets/hourglass-1XMjTaX8.js","/assets/image-off-DMEVLvK9.js","/assets/image-pKOApNuD.js","/assets/inbox-TDNbVt_9.js","/assets/index-B7yzqq84.css","/assets/index-rPfaosbE.js","/assets/keyboard-BxIwU1ty.js","/assets/languages-C7J8RRyt.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-FHX5FeyJ.js","/assets/lightbulb-CF_nA4bm.js","/assets/link-2-BM10bgRR.js","/assets/link-2-off-rnSJ7906.js","/assets/list-ordered-RYfAM83w.js","/assets/list-tree-DSNlohAG.js","/assets/lock-open-BSR9PN-q.js","/assets/log-in-CGe6Mgue.js","/assets/minimize-2-C-u1fPno.js","/assets/package-check-D2CCqA-7.js","/assets/pencil-MbeXkGK8.js","/assets/percent-Yq6qbGET.js","/assets/pin-CSnN4ddT.js","/assets/pin-off-GzBxX5UA.js","/assets/play-GfVVYz_T.js","/assets/plug-zap-DSrTR287.js","/assets/prop-types-CAmWYEes.js","/assets/radio-Fe6oiwFk.js","/assets/react-apexcharts.esm-BWGGi_nm.js","/assets/registers-BviaTRRJ.js","/assets/repeat-DfnFz_IA.js","/assets/save-D0p1hecM.js","/assets/scopeLinks-BFbX_ivX.js","/assets/scroll-text-D5lUrIsS.js","/assets/search-x-C0wYuOLo.js","/assets/segments-CteCcBUq.js","/assets/send-DoOwcQDb.js","/assets/settings-2-CaHMqX1l.js","/assets/shield-CWsK-psk.js","/assets/shield-alert-Cx01OdKp.js","/assets/shield-question-mark-DtUGt3gP.js","/assets/siren-D3t3lJYs.js","/assets/snowflake-D6v-v0g1.js","/assets/split-C6lVP5vj.js","/assets/square-check-big-D5kT9Aj-.js","/assets/star-bB0nuw83.js","/assets/statusBands-BOI0Q9w5.js","/assets/store-Byej0GN0.js","/assets/table-2-ByKkJbNh.js","/assets/table-properties-BzGfdThA.js","/assets/tag-B-V_olNA.js","/assets/timer-off-DK_yQ8B_.js","/assets/trending-down-DH9WCXxf.js","/assets/trending-up-DeiVH2Hj.js","/assets/undo-2-C_OWsznv.js","/assets/useChartTheme-B80J-XDn.js","/assets/useElementWidth-DCiE-RRT.js","/assets/useIsMobile-Dzi8Ppes.js","/assets/useOpenParam-DXpVnFnR.js","/assets/useStatusBands-BoOsnaUn.js","/assets/useUrlScope--gDeSfx8.js","/assets/user-2u_Uatli.js","/assets/user-cog-BId0iRp-.js","/assets/users-GIp1FSye.js","/assets/vfx-CdlHcQJf.js","/assets/video-CXPzQm01.js","/assets/wallet-DE9XUqtv.js","/assets/warehouse-Bj8-9SD0.js","/assets/x-CK3dQQzm.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
