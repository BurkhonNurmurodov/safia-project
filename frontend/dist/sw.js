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

const BUILD = "2026-10-17T12:38:16.430Z";
const PRECACHE = ["/","/assets/AdminPanel-BbIW1GB4.js","/assets/AnalysisBoard-BzKvpmTG.js","/assets/Arc-DfOBkmIG.js","/assets/Assistant-Dzs7LwgD.js","/assets/BrigadirProfile-B5MgJSri.js","/assets/BroadcastReceivers-F5BUN8uN.js","/assets/BroadcastRecord-DyMgu38Q.js","/assets/Button-DOYqIL-l.js","/assets/CatLockNotice-DTINjFY9.js","/assets/CategoryLegendModal-BlkuE4Lb.js","/assets/CellConcerns-C5Y2Fkig.js","/assets/CellDetails-DFYfX1gt.js","/assets/CellFormModal-CwtQYFNr.js","/assets/CellIdent-Bj5rz1D9.js","/assets/CellLink-DSeV1i5M.js","/assets/Cells-BtPfVq7p.js","/assets/ColumnFilter-DmPS0wtN.js","/assets/ColumnsPicker-BVR1jnS0.js","/assets/CommentsModal-B_693AAA.js","/assets/ComparisonTable-DkZ1LPUI.js","/assets/Concerns-rneS-mtv.js","/assets/CountStepper-FO5GPhzR.js","/assets/Daily-fOqepKfY.js","/assets/DataTable-BIup9FQJ.js","/assets/DateRangePicker-D0LElYMQ.js","/assets/DayReportView-Cls7PmK4.js","/assets/DayStepper-CkXY9V9q.js","/assets/DifferenceBreakdown-BiZAEy3O.js","/assets/Downtime-k9CWczlA.js","/assets/Education-Bdv62O3a.js","/assets/EducationLesson-BDp4bp4N.js","/assets/EmptyState-BgfpXLp-.js","/assets/Exam-CwBDPqXB.js","/assets/FactorySelect-B6vcHX1c.js","/assets/ForeignObjects-BK1aCg_R.js","/assets/Gamification-B_wr9qzn.js","/assets/GroupBadge-BFicJRtG.js","/assets/HeatmapChart-Ba7gSrEr.js","/assets/IdleCell-Bi76_Udt.js","/assets/KPICard-2yIXZFsr.js","/assets/Kaizen-CS-E57ja.js","/assets/Kelish-CBIWBMIa.js","/assets/KpiDeltaCard-BVf5WOVQ.js","/assets/LangTextInput-4xc4EJ41.js","/assets/Layout-CfChkAoZ.js","/assets/LeaderAppeal-BG3Y-hqC.js","/assets/LeaderDayReport-4-S-oMlY.js","/assets/LeaderUnitReport-C2zCqo9u.js","/assets/Leaderboard-CVsLd2n2.js","/assets/Leaders-CO5vyYP4.js","/assets/Lightbox-u4N0fkDP.js","/assets/LiveOverview-DpBFyTfX.js","/assets/Login-CL063hHz.js","/assets/NotFound-Byo3Ht0-.js","/assets/Notifications-DcHUSaHa.js","/assets/Overview-CgiGG48s.js","/assets/Pagination-CoNMb5Pf.js","/assets/PerenaladkaFactTable-CH69s6xM.js","/assets/PersonCard-DIJSB-9L.js","/assets/PlanFulfillment-DRxelDLs.js","/assets/Production-BCVKOOFv.js","/assets/Profile-B-5YgvgA.js","/assets/ProofCamera-v7cVTlvt.js","/assets/Quality-DE_Ny-qW.js","/assets/RawRows-BFIdjfiN.js","/assets/RequestStateChip-CnrqCXPQ.js","/assets/RichTextEditor-gs3EpHi5.js","/assets/SaveState-DtO88lXQ.js","/assets/SearchInput-7GKvlzwg.js","/assets/SeasonalityHeatmap-AOf6aohA.js","/assets/SegmentedToggle-B543ECJ9.js","/assets/SetupTimes-DSK_zgCF.js","/assets/ShiftDaily-BmfyeGR7.js","/assets/Staff-E2bLbMd0.js","/assets/StaffListAtCheck-BNKeXQ4z.js","/assets/StatusBadge-LOQlyoQC.js","/assets/TargetGoal-CJYVSeOs.js","/assets/Targets-CIPG5guC.js","/assets/Tasks-CwL7iQM7.js","/assets/TimeWheelPicker-DssoxGD_.js","/assets/Toast-DZG40pgA.js","/assets/Tooltip-DNZo9Og3.js","/assets/TrendChart-e4J80abv.js","/assets/TripleSpeedometer-jqEYGuHF.js","/assets/Trudoyomkost-1qR2i5Zg.js","/assets/Turnover-D4EWKa04.js","/assets/TurnoverBits-DqltrWjm.js","/assets/UploadDropzone-BYIfmzK2.js","/assets/UsersActivity-8wuf3uhr.js","/assets/VerdictBlock-I-t17ODC.js","/assets/VfxApiMap-dPCLAF8L.js","/assets/VfxDictionaries-CKaulE5l.js","/assets/VfxEmployees-Dsl6E5DW.js","/assets/VfxHrMoves-CAmbRczj.js","/assets/VfxJobs-DUwkzHr2.js","/assets/VfxPhoto-3rBxwmdR.js","/assets/VfxShifts-DUow6P5J.js","/assets/VfxState-CtGvlf_V.js","/assets/VfxTimebooks-C42bESx3.js","/assets/VfxTimesheet-4zquHd9c.js","/assets/WatchProgress-DS9k9vcC.js","/assets/WebLogin-7LcZf7-H.js","/assets/WorkerConcerns-DdPcxRjs.js","/assets/Workers-CadwkvD6.js","/assets/Zagruzka-SzaW46bM.js","/assets/ZagruzkaCell-CDkfLLRj.js","/assets/api-CRrJDVOm.js","/assets/archive-Bh6xWh6q.js","/assets/archive-restore-D9vGyou0.js","/assets/arrow-down-DNLSjPFI.js","/assets/arrow-down-wide-narrow-Cx5eNszj.js","/assets/arrow-up-narrow-wide-H1WE5bfn.js","/assets/award-Dc5WY_SR.js","/assets/ban-w-oKAmlE.js","/assets/boxes-B3auIHrh.js","/assets/braces-BsCzuCWZ.js","/assets/brigadirFilters-ClGZgE-p.js","/assets/broadcastTree-CjAV_UQ6.js","/assets/building-2-5ECeevPD.js","/assets/calculator-DIC17yjc.js","/assets/calendar-DpQ2TX5o.js","/assets/calendar-days-DQSPC-CH.js","/assets/camera-CbWz8Ggb.js","/assets/categories-DYsxr7of.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Di14TcFR.js","/assets/chart-line-Ymp9lxxi.js","/assets/chart-pie-zdegMpMJ.js","/assets/chartRange-Cn5ibWrn.js","/assets/check-check-DgACyWlL.js","/assets/chevron-left-9_sQvjD6.js","/assets/chevrons-up-down-CpMUVBeE.js","/assets/circle-BOVAb-5K.js","/assets/circle-alert-B4ZlmjLt.js","/assets/circle-check-big-BBFVGqfV.js","/assets/circle-dashed-CCMEqOAg.js","/assets/circle-minus-CZZJINSW.js","/assets/circle-question-mark-Bl-EParT.js","/assets/circle-slash-c0XE9dlB.js","/assets/circle-user-round-sn1qfN1z.js","/assets/cloud-off-C8LF-nwt.js","/assets/cloud-upload-CRPpgnRA.js","/assets/compass-Dci3cwDP.js","/assets/concernCategories-B-6MWXBT.js","/assets/corner-down-right-DN7upLls.js","/assets/createLucideIcon-DHWl8S6R.js","/assets/es-BbwhwLBh.js","/assets/external-link-DEfpTpqy.js","/assets/file-clock-CLu_Oh8r.js","/assets/file-exclamation-point-DzpnU4xQ.js","/assets/flag-CMjhh0lV.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Co20Db81.js","/assets/hash-BDVuIcjd.js","/assets/hourglass-CW1mDqCY.js","/assets/image-DQzWA2Ha.js","/assets/image-off-Cj8MUNpM.js","/assets/inbox-Rn1XPRrS.js","/assets/index-BVXR8M49.js","/assets/index-DMaaZqfZ.css","/assets/keyboard-Dxphw9hK.js","/assets/languages-lZoKECCA.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BCLLM_6K.js","/assets/lightbulb-DsNSlWp7.js","/assets/link-2-B2Ks_HER.js","/assets/link-2-off-B3WEsNj5.js","/assets/list-ordered-DMXWjBrj.js","/assets/list-tree-DAnErnHr.js","/assets/lock-open-C9-A0Nzq.js","/assets/log-in-Bp1-gnRx.js","/assets/marks-GMojhRlR.js","/assets/minimize-2-Cqb4Rj4_.js","/assets/package-check-DO8moh-C.js","/assets/pencil-CG6bT-ce.js","/assets/percent-C0FnfRKl.js","/assets/pin-CJt8J-uD.js","/assets/pin-off-Dty1Px_G.js","/assets/play-YbfJnATH.js","/assets/plug-zap-Q90f0qFe.js","/assets/prop-types-4TPRCML_.js","/assets/radio-8toGdStX.js","/assets/react-apexcharts.esm-B4eA_aMR.js","/assets/registers-CmLwyW3R.js","/assets/repeat-qChDubzE.js","/assets/save-DIqDGwrP.js","/assets/scopeLinks-Dy75c7V0.js","/assets/scroll-text-BPf94ZqU.js","/assets/search-x-B_RZUMF8.js","/assets/segments-CtbTTBiH.js","/assets/send-BOUz-8L4.js","/assets/settings-2-BUpnakqA.js","/assets/shield-C2Q3vdGp.js","/assets/shield-alert-WcJi6a0m.js","/assets/shield-question-mark-B5x0oGp6.js","/assets/siren-BdggkAvW.js","/assets/snowflake-CqBvMBtZ.js","/assets/split-B06qlKDz.js","/assets/square-check-big-DucqxQu5.js","/assets/star-DcD5FL6L.js","/assets/statusBands-zNzPmSSA.js","/assets/store-Cld8TUtz.js","/assets/table-2-47S9iwAn.js","/assets/table-properties-CKGMOILK.js","/assets/tag-Bot7SpUp.js","/assets/timer-off-ca632p5i.js","/assets/trending-down-CvsahXsT.js","/assets/trending-up-Cb_7gV80.js","/assets/undo-2-D0z1hU45.js","/assets/useChartTheme-DfVlg7eM.js","/assets/useElementWidth-D1yoQU5w.js","/assets/useIsMobile-BdfzalUH.js","/assets/useOpenParam-DI-CzRYj.js","/assets/useStatusBands-BUSJVGWy.js","/assets/useUrlScope-U-D8SWlo.js","/assets/user-CQmV3M8v.js","/assets/user-cog-DhI4sS4F.js","/assets/users-BuKR0j12.js","/assets/vfx-C0Ee8EYE.js","/assets/video-C7UTyrcY.js","/assets/wallet-C_FPq_us.js","/assets/warehouse-CkOvcEdV.js","/assets/workflow-CAKlBXVh.js","/assets/x-Bs3QoznA.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
