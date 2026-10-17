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

const BUILD = "2026-10-17T13:25:08.740Z";
const PRECACHE = ["/","/assets/AdminPanel-MfdGmo4D.js","/assets/AnalysisBoard--Ajesj6q.js","/assets/Arc-BGBeUixj.js","/assets/Assistant-YJWjcF-p.js","/assets/BrigadirProfile-s2k3JEAj.js","/assets/BroadcastReceivers-C4O1oGAr.js","/assets/BroadcastRecord-B7iGvxWz.js","/assets/Button-1Kf6jv3d.js","/assets/CatLockNotice-BFOjH1zL.js","/assets/CategoryLegendModal-DthGBnw_.js","/assets/CellConcerns-DT8pNSEo.js","/assets/CellDetails-DJ5ogGgP.js","/assets/CellFormModal-Ce1bXI1l.js","/assets/CellIdent-CSXjJgHm.js","/assets/CellLink-_9Qf70bm.js","/assets/Cells-B03wb2Eq.js","/assets/ColumnFilter-zYcWXAfI.js","/assets/ColumnsPicker-DsDKa3iF.js","/assets/CommentsModal-CaetPmRT.js","/assets/ComparisonTable-MSElucgf.js","/assets/Concerns-Csn-m2vu.js","/assets/CountStepper-DDideKCr.js","/assets/Daily-C-t9pPIA.js","/assets/DataTable-DYxt-3CA.js","/assets/DateRangePicker-Bf6mX9D8.js","/assets/DayReportView-B01mtDgq.js","/assets/DayStepper-Ds96KW-q.js","/assets/DifferenceBreakdown-Bv9Tb9RV.js","/assets/Downtime-BYksvd18.js","/assets/Education-C1cvDe4r.js","/assets/EducationLesson-Cwbj6iq2.js","/assets/EmptyState-D98QRRvi.js","/assets/Exam-BYgSyKaC.js","/assets/FactorySelect-BNytwVn-.js","/assets/ForeignObjects-Bwk--9v0.js","/assets/Gamification-DXkjcNoZ.js","/assets/GroupBadge-DKSHuMEQ.js","/assets/HeatmapChart-C7HfH53x.js","/assets/IdleCell-BJ2eJYi9.js","/assets/KPICard-pc6FIac3.js","/assets/Kaizen-DRAq8Osf.js","/assets/Kelish-Bt97__mW.js","/assets/KpiDeltaCard-F86loi21.js","/assets/LangTextInput-CTL_5OBE.js","/assets/Layout-BLq4F7em.js","/assets/LeaderAppeal-DY73slnd.js","/assets/LeaderDayReport-DNEsa21c.js","/assets/LeaderUnitReport-B1H87o6t.js","/assets/Leaderboard-BDBRDqVB.js","/assets/Leaders-BrCicFgb.js","/assets/Lightbox-6o-RuiFW.js","/assets/LiveOverview-Eknx-IOa.js","/assets/Login-BguTQTLJ.js","/assets/NotFound-D7YmfIoh.js","/assets/Notifications-CK9jovUM.js","/assets/Overview-B3GthiiO.js","/assets/Pagination-BhATGTQP.js","/assets/PerenaladkaFactTable-DDpdUDds.js","/assets/PersonCard-CGdzhmrh.js","/assets/PlanFulfillment-RDlH682k.js","/assets/Production-Bj9Wa0dG.js","/assets/Profile-zZEwNrIP.js","/assets/ProofCamera-Da-pyNkd.js","/assets/ProofPhoto-B1DNrqdX.js","/assets/Quality-B-YyxzPN.js","/assets/RawRows-B0xnWIkJ.js","/assets/RequestStateChip-DaVySa6Q.js","/assets/RichTextEditor-DuS2Vhk6.js","/assets/SaveState-3gTEOGyO.js","/assets/SearchInput-3It8WkFa.js","/assets/SeasonalityHeatmap-B2SgxYk0.js","/assets/SegmentedToggle-mb_a_V_c.js","/assets/SetupTimes-CutRW2ie.js","/assets/ShiftDaily-DUyb9-pX.js","/assets/Staff-DzQd5v7W.js","/assets/StaffListAtCheck-BUTWO6FD.js","/assets/StatusBadge-B7XeJhO4.js","/assets/TargetGoal-DzTSLZ9Y.js","/assets/Targets-OPX8R3zi.js","/assets/Tasks-CRHnzdFb.js","/assets/TimeWheelPicker-BSpAJNuw.js","/assets/Toast-CV_LRoFO.js","/assets/Tooltip-CQWX5v_E.js","/assets/TrendChart-DqMC70-5.js","/assets/TripleSpeedometer-C6DLVFyR.js","/assets/Trudoyomkost-CdAgjBGa.js","/assets/Turnover-CNmckI76.js","/assets/TurnoverBits-CnpdZ7s2.js","/assets/UploadDropzone-CVzwJFWp.js","/assets/UsersActivity-CjiScq9S.js","/assets/VerdictBlock-bPO9f4st.js","/assets/VfxApiMap-CibpOj_l.js","/assets/VfxDictionaries-0QIfmUEo.js","/assets/VfxEmployees-BmV8mKym.js","/assets/VfxHrMoves-DPR1XaIb.js","/assets/VfxJobs-UIb4wEHk.js","/assets/VfxPhoto-DkA856Qm.js","/assets/VfxShifts-CYWa-d9o.js","/assets/VfxState-e-HJz43S.js","/assets/VfxTimebooks-D5pcBr5v.js","/assets/VfxTimesheet-Dpdp2uP_.js","/assets/WatchProgress-C1Q9fPQg.js","/assets/WebLogin-DyO96_rh.js","/assets/WorkerConcerns-2ZlTPyyW.js","/assets/Workers-CDaTHnDo.js","/assets/Zagruzka-BoD4oeuA.js","/assets/ZagruzkaCell-C6RrDDNA.js","/assets/api-_eY9mDkx.js","/assets/archive-B8o0-oQY.js","/assets/archive-restore-CXE_5Zn4.js","/assets/arrow-down-DzGmsIVR.js","/assets/arrow-down-wide-narrow-CV3TJKcn.js","/assets/arrow-up-narrow-wide-BWfdVAnU.js","/assets/award-BBB2LQQS.js","/assets/ban-Cl7n-4SI.js","/assets/boxes-CgHCLw56.js","/assets/braces-DSZpyuSJ.js","/assets/brigadirFilters-Cj5qbmzR.js","/assets/broadcastTree-SjluGOim.js","/assets/building-2-2JKrlR6-.js","/assets/calculator-CWvdG82q.js","/assets/calendar-DdzAkFSw.js","/assets/calendar-days-m3GaVidg.js","/assets/camera-qQ1OMuxc.js","/assets/categories-Qj5IkTpL.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-w2q9_kYF.js","/assets/chart-line-6fW5_V0q.js","/assets/chart-pie-BggyX0Cu.js","/assets/chartRange-CKCX7DgF.js","/assets/check-check-DcBGNigD.js","/assets/chevron-left-Ona6kOW9.js","/assets/chevrons-up-down-CnSLvvCJ.js","/assets/circle-Cy2lssXg.js","/assets/circle-alert-C8LMG7Sb.js","/assets/circle-check-big-2uJrNe6D.js","/assets/circle-dashed-IWHZm5_V.js","/assets/circle-minus-D1VceUnO.js","/assets/circle-question-mark-DOTdFkmw.js","/assets/circle-slash-C5BD1Klm.js","/assets/circle-user-round-DAGkMdA1.js","/assets/cloud-off-BiVaEC8l.js","/assets/cloud-upload-BGdzeaTf.js","/assets/compass-1uM6o89F.js","/assets/concernCategories-DWU3Lp5G.js","/assets/corner-down-right-rUbNgwQk.js","/assets/createLucideIcon-BRo8BVDc.js","/assets/es-MhPhiw2w.js","/assets/external-link-CoK0ABfh.js","/assets/file-clock-BR1yCqWV.js","/assets/file-exclamation-point-BCx6PQXR.js","/assets/flag-BJDquLGK.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-B9eeZghb.js","/assets/hash-BZOxwCgv.js","/assets/hourglass-D-VwuLjA.js","/assets/image-B-ZllCRu.js","/assets/image-off-B9cXT4l4.js","/assets/inbox-fJpzEi5x.js","/assets/index-ByhNoNK_.css","/assets/index-QC3zqBcR.js","/assets/keyboard-D-SNCOwe.js","/assets/languages-KgyvWz5r.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CezYjwH0.js","/assets/lightbulb-BUGm41oI.js","/assets/link-2-aC_B2knk.js","/assets/link-2-off-B_eqZlGi.js","/assets/list-ordered-W29nlOQL.js","/assets/list-tree-Cm-I1cJ3.js","/assets/lock-open-eIsLIUrK.js","/assets/log-in-DsuDTUxK.js","/assets/marks-D5Ol9Q-S.js","/assets/minimize-2-Con2tQ0R.js","/assets/package-check-DUMpR3hH.js","/assets/pencil-sL_7LEme.js","/assets/percent-mRzoi7LO.js","/assets/pin-off-BgSX1S5z.js","/assets/pin-usUjkx9P.js","/assets/play-BME1wg8P.js","/assets/plug-zap-B0B03N3c.js","/assets/prop-types-CUCdrTq1.js","/assets/radio-C8nLkxNz.js","/assets/react-apexcharts.esm-BA4jGKtS.js","/assets/registers-D7hosxQE.js","/assets/repeat-CT11QYdh.js","/assets/save-B00xV0nf.js","/assets/scopeLinks-C1T0oHDP.js","/assets/scroll-text-rLjMj1py.js","/assets/search-x-BQlWqmXQ.js","/assets/segments-lgXm6Thd.js","/assets/send-BRloyPnI.js","/assets/settings-2-Bf63YHr2.js","/assets/shield-DpLvPL48.js","/assets/shield-alert-CsBSbxAL.js","/assets/shield-question-mark-XcR55HIX.js","/assets/siren-Cr8Gka3b.js","/assets/snowflake-DTIL7Z6p.js","/assets/split-nonMxYIx.js","/assets/square-check-big-BHbT642m.js","/assets/star-CVsYSLHA.js","/assets/statusBands-B_1LgCvB.js","/assets/store-B0Yof0y5.js","/assets/table-2-Dcq6Ce5K.js","/assets/table-properties-DkPFT3qK.js","/assets/tag-DCjFSvso.js","/assets/timer-off-CMljCSnm.js","/assets/trending-down-COdIDluQ.js","/assets/trending-up-CkNQhZEk.js","/assets/undo-2-Qu9bbsiG.js","/assets/useChartTheme-DYxYFfy2.js","/assets/useElementWidth-BLlFWB5j.js","/assets/useIsMobile-Cu3QNXKj.js","/assets/useOpenParam-DB63Kc-q.js","/assets/useStatusBands-FVfYFSMu.js","/assets/useUrlScope-rf2W2gqq.js","/assets/user-Dsc4oumq.js","/assets/user-cog-BxRduLdi.js","/assets/users-TEnp-kIs.js","/assets/vfx-BADDmyos.js","/assets/video-ctifASe-.js","/assets/wallet-cvKER3CF.js","/assets/warehouse-DD8AHKDn.js","/assets/workflow-5yD0_2hh.js","/assets/x-Drl52Kfg.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
