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

const BUILD = "2026-10-26T13:43:25.549Z";
const PRECACHE = ["/","/assets/AdminPanel-Dpku9ud7.js","/assets/AnalysisBoard-90qKwrHE.js","/assets/Arc-DTBtYEg6.js","/assets/Assistant-Bo2IkvU5.js","/assets/BrigadirProfile-C4G4SQYE.js","/assets/BroadcastReceivers-C9734hEf.js","/assets/BroadcastRecord-BlCT4ost.js","/assets/Button-5NNgyX47.js","/assets/CatLockNotice-zwO233ct.js","/assets/CategoryLegendModal-Z57su3bP.js","/assets/CellConcerns-grMYBLUr.js","/assets/CellDetails-DvafShyq.js","/assets/CellFormModal-DDWmIbnw.js","/assets/CellIdent-DZJ0R9PT.js","/assets/CellLink-DujPTkmX.js","/assets/Cells-CsWXIGJ6.js","/assets/ColumnFilter-C5psTCpY.js","/assets/ColumnsPicker-CrO82231.js","/assets/CommentsModal-DMOI2B-b.js","/assets/ComparisonTable-788t2j6B.js","/assets/Concerns-C7JiRXM8.js","/assets/CountStepper-Dk9CtKXk.js","/assets/Daily-BhquG7x1.js","/assets/DataTable-D_uO79nr.js","/assets/DateRangePicker-DoGwvOR3.js","/assets/DayReportView-BpKP3L7V.js","/assets/DayStepper-BtP2TxmT.js","/assets/DayStrip-ZpWxkyyK.js","/assets/DifferenceBreakdown-Dbfid8Rq.js","/assets/Downtime-6Sn9hMRe.js","/assets/Education-BoxsZU2O.js","/assets/EducationLesson-DFY4F2yw.js","/assets/EmptyState-eqiDuzf4.js","/assets/Exam-Nojn1KjE.js","/assets/FactorySelect-Brh9A2o9.js","/assets/Gamification-CsoLu3ol.js","/assets/GroupBadge-Bc2Urfox.js","/assets/HeatmapChart-C0_7QcnM.js","/assets/IdleCell-DnIbut6z.js","/assets/KPICard-BdZu3w8v.js","/assets/Kaizen-DZrSWNaa.js","/assets/Kelish-BDKFjmTs.js","/assets/KpiDeltaCard-CEX7yU7H.js","/assets/LangTextInput-CbKUykTF.js","/assets/Layout-QKiU6IlF.js","/assets/LeaderAppeal-8SrIirCm.js","/assets/LeaderDayReport-Bwj4rJFY.js","/assets/LeaderUnitReport-C0sPSOj_.js","/assets/Leaderboard-CSEJsva5.js","/assets/Leaders-CFJF5vfq.js","/assets/LeadersKpi-DoGE58_w.js","/assets/Lightbox-CVkTNRnY.js","/assets/LiveOverview-DEfRw1d4.js","/assets/Login-CQnVFlsT.js","/assets/NotFound-BVzgQtbc.js","/assets/Notifications-DcFz_Ccn.js","/assets/Ontime-BBX6FIhG.js","/assets/Overview-4gZydh_k.js","/assets/Pagination-D3C7Xm1U.js","/assets/PerenaladkaFactTable-CxMFhroB.js","/assets/PersonCard-C2VQc5ex.js","/assets/PlanFulfillment-DWLXKdiD.js","/assets/Production-BkagWqyy.js","/assets/Profile-B3RFFlg2.js","/assets/ProofCamera-CbEvWfAQ.js","/assets/ProofPhoto-zjGKqndI.js","/assets/Quality-ItdO9TUB.js","/assets/RawRows-Y6HC4Sjh.js","/assets/Reports-Cb1De7gY.js","/assets/RequestStateChip-Cfhiw5vm.js","/assets/RichTextEditor-nShgDVPv.js","/assets/SaveState-DpMi4ZE0.js","/assets/SearchInput-OlDddSjG.js","/assets/SeasonalityHeatmap-BpDfgZy9.js","/assets/SegmentedToggle-ANPqYuaA.js","/assets/SetupTimes-CqrJcyJq.js","/assets/ShiftDaily-VtV-cxyL.js","/assets/Staff-DeTJvav1.js","/assets/StaffListAtCheck-DPjCaEHN.js","/assets/StatusBadge-rZH7LQ5v.js","/assets/StatusBandsModal-Bx7ldFZs.js","/assets/TargetGoal-viCarU5P.js","/assets/Targets-CcGfgU4w.js","/assets/Tasks--FbieNlE.js","/assets/TimeWheelPicker-CZewCDDp.js","/assets/Toast-2kYYAVar.js","/assets/Tooltip-Bz01C8Ge.js","/assets/TrendChart-mn-ZeZG-.js","/assets/TripleSpeedometer-CDechvrN.js","/assets/Trudoyomkost-Vgcg5Gay.js","/assets/UploadDropzone-DhhQpDbG.js","/assets/UsersActivity-B2-YYlIw.js","/assets/VerdictBlock-CpVQcedJ.js","/assets/VfxApiMap-B5UUOlCc.js","/assets/VfxDictionaries-CjcDnPJr.js","/assets/VfxEmployees-DgKqoBLt.js","/assets/VfxHrMoves-K7cUueZP.js","/assets/VfxJobs-nAKTmY10.js","/assets/VfxPhoto-CqPGMHOc.js","/assets/VfxShifts-DYu3jKJ_.js","/assets/VfxState-Jg52pwcH.js","/assets/VfxTimebooks-C0DD0LSV.js","/assets/VfxTimesheet-CN8f0wXR.js","/assets/WatchProgress-Bk_XDEWi.js","/assets/WebLogin-asI4EHXe.js","/assets/Workers-D4WzzwHi.js","/assets/Zagruzka-CRp-gVAw.js","/assets/ZagruzkaCell-DrKE_IIT.js","/assets/api-BFm7MSgf.js","/assets/archive-HoH_k8pw.js","/assets/archive-restore-D2ajH9Yk.js","/assets/arrow-down-Dotn_q0w.js","/assets/arrow-down-right-Bda0en1j.js","/assets/arrow-down-wide-narrow-CEgw2ZR-.js","/assets/arrow-up-narrow-wide-BoV99SBy.js","/assets/ban-fLWZMEAi.js","/assets/boxes-DKOhPKyS.js","/assets/braces-D2qEfY5N.js","/assets/brigadirFilters-BM-_jEgL.js","/assets/broadcastTree-Dctfl1uq.js","/assets/building-2-BJKf8uLr.js","/assets/calendar-BTj5lmCC.js","/assets/calendar-days-BVOaz9nw.js","/assets/camera-Bq9BmdP-.js","/assets/categories-D3PbIM1Z.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CU7Q2cZs.js","/assets/chart-line-D2wwuJ1K.js","/assets/chart-pie-7lWQENAk.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-cVCwgwFP.js","/assets/chevron-left-Cz1InFmp.js","/assets/chevrons-up-down-C5NuG5WO.js","/assets/circle-DMOD5854.js","/assets/circle-alert-BSWzL4Rf.js","/assets/circle-check-big-Dt8xwLtI.js","/assets/circle-dashed-C-fA4jLf.js","/assets/circle-minus-CBYSnViP.js","/assets/circle-question-mark-DEqDVrCo.js","/assets/circle-slash-Glk_MOoM.js","/assets/circle-user-round-UqO_iI6M.js","/assets/cloud-off-Brn6avLD.js","/assets/cloud-upload-CMaj0i4N.js","/assets/coins-D-7owmPc.js","/assets/compass-LRPvtRi8.js","/assets/concernCategories-DpgWext2.js","/assets/corner-down-right-D7JFZ7Jp.js","/assets/createLucideIcon-CFDd5Iw2.js","/assets/en-Dyno3Nc9.js","/assets/es-Dtgc5NM1.js","/assets/external-link-DJ5-1XCv.js","/assets/file-clock-Bc56Iioj.js","/assets/file-exclamation-point-Cg2EBo8M.js","/assets/flag-CzKZP8_m.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-sEsuwrlT.js","/assets/funnel-CJn-8fAq.js","/assets/hash-tal98uho.js","/assets/hourglass-viTN1DC9.js","/assets/idleTime-CHPnJRpw.js","/assets/image-D2mvUhUj.js","/assets/image-off-CwB7YfNL.js","/assets/inbox-7qYMPp6F.js","/assets/index-BWT5K78e.js","/assets/index-BtYmuUYW.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CsJqr2Js.js","/assets/languages-CbHrx_Nr.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-jKDwnnoO.js","/assets/leaderBoard-C_A2kSdy.js","/assets/lightbulb-rolQlqTA.js","/assets/link-2-C-oigZi5.js","/assets/link-2-off-BcHHzieA.js","/assets/list-ordered-CGFQ2rRI.js","/assets/list-tree-C1rvrQUp.js","/assets/lock-open-Dk-E8iHz.js","/assets/log-in-RwRTAMEK.js","/assets/map-pin-aVuYnrik.js","/assets/marks-DF2h3VyX.js","/assets/minimize-2-BLsQmDbJ.js","/assets/package-check-Bsx6LZI9.js","/assets/pencil-DAco7PIn.js","/assets/percent-Dj7RKp-W.js","/assets/pin-DcAhESKP.js","/assets/pin-off-DthnaBtL.js","/assets/play-DKeOWb3m.js","/assets/plug-zap-rOqFQyXQ.js","/assets/prop-types-RD3fbola.js","/assets/radio-BTxFFiDs.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-Q17sBQRl.js","/assets/repeat-DLGrKFZK.js","/assets/ru-BLF6sh9-.js","/assets/save-QURSOlKY.js","/assets/scopeLinks-DybKHbfM.js","/assets/scroll-text-JIn2ypLP.js","/assets/search-x-OM8CsTZ4.js","/assets/segments-D5Uiedtv.js","/assets/send-CWgp7O6w.js","/assets/settings-2-wGTUlQJ4.js","/assets/shield-CLVUblGe.js","/assets/shield-alert-DyQ-olB6.js","/assets/shield-question-mark-BHQJN0uI.js","/assets/sigma-Cv8ukVDQ.js","/assets/siren-BAMpLL2r.js","/assets/snowflake-NrB1Mgvq.js","/assets/split-C3yPuWKj.js","/assets/square-check-big-yfD7gL-t.js","/assets/star-BeY3BcWW.js","/assets/statusBands-DVBZcBq3.js","/assets/store-BvIKC5Hi.js","/assets/table-2-Bu1tjzjy.js","/assets/table-properties-FeshgIEg.js","/assets/tag-CgEncfu1.js","/assets/timer-off-4QGVbCWH.js","/assets/translations-DYFCyjFd.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-CDBdCXoL.js","/assets/trending-up-B-WhECVq.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-DSdHKh_o.js","/assets/useChartTheme-Dr0vU_JR.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-T1S52VUd.js","/assets/useStatusBands-Bd-pB3lz.js","/assets/useUrlScope-CvyKxvef.js","/assets/user-CxijzGhf.js","/assets/user-cog-Dzhmf2tD.js","/assets/user-minus-Cwp-QSpP.js","/assets/users-C7iJC6q2.js","/assets/uz-DrkYicXX.js","/assets/uz_cyrl-CbELog8C.js","/assets/vfx-D4-_mwh9.js","/assets/video-DQPy9Zqs.js","/assets/wallet-CvrsTzPX.js","/assets/warehouse-CUo0eMC0.js","/assets/workflow-DIqQ35Kx.js","/assets/x-CvRr_qOd.js","/assets/zap-B5dcGUep.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
