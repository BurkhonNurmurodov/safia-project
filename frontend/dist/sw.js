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

const BUILD = "2026-10-15T05:51:31.351Z";
const PRECACHE = ["/","/assets/AdminPanel-gxc3Fwjj.js","/assets/AnalysisBoard-CXGl_KK7.js","/assets/Arc-D-d8R-95.js","/assets/Assistant-CAbuJIoC.js","/assets/BrigadirProfile-CNdoRSen.js","/assets/BroadcastReceivers-BjtdLM7e.js","/assets/BroadcastRecord-C7lTe4aQ.js","/assets/Button-BFZp51-W.js","/assets/CatLockNotice-CUrSZTFQ.js","/assets/CategoryLegendModal-NARCPChk.js","/assets/CellConcerns-CJr3tPPk.js","/assets/CellDetails-Ds-kRvSE.js","/assets/CellFormModal-BQt3XLP3.js","/assets/CellIdent-BCf8vaBy.js","/assets/CellLink-DDHJOPbv.js","/assets/Cells-DoKMGNan.js","/assets/ColumnFilter-B1ooP3xm.js","/assets/ColumnsPicker-DrZ7JBoi.js","/assets/CommentsModal-BBEnKPlJ.js","/assets/ComparisonTable-DQc24E3O.js","/assets/Concerns-DWAwI3TX.js","/assets/CountStepper-CMxsEOBk.js","/assets/Daily-MEskBgoN.js","/assets/DataTable-BfDrYfgJ.js","/assets/DateRangePicker-BWmD9jsS.js","/assets/DayReportView-CfFSCItu.js","/assets/DayStepper-DsgPMsR8.js","/assets/DifferenceBreakdown-DSLQJFJP.js","/assets/Downtime-BhsF6k5E.js","/assets/Education-qb4Q343O.js","/assets/EducationLesson-D7Ia0DuO.js","/assets/EmptyState-7QeeWRNq.js","/assets/Exam-PN0EKaUS.js","/assets/FactorySelect-CXVr2glg.js","/assets/Gamification-bw-tPg1M.js","/assets/GroupBadge-qiueeIMx.js","/assets/HeatmapChart-DVCPNr7K.js","/assets/IdleCell-yw4WMTjg.js","/assets/KPICard-Cl4a6aHJ.js","/assets/Kaizen-CB8ogd0I.js","/assets/Kelish-BOqGE78s.js","/assets/KpiDeltaCard-8ZO-mTK_.js","/assets/LangTextInput-CvmWUDU8.js","/assets/Layout-BO-FNETS.js","/assets/LeaderAppeal-D2Vea6OH.js","/assets/LeaderDayReport-C_bw4mVn.js","/assets/LeaderUnitReport-HuZrIbaT.js","/assets/Leaderboard-DAPXzaAn.js","/assets/Leaders-Rklh_Lmq.js","/assets/Lightbox-O9Dj1TWY.js","/assets/LiveOverview-DRTtJKsr.js","/assets/Login-ByjdiUXm.js","/assets/NotFound-Cz7hkkXQ.js","/assets/Notifications-RBiucACl.js","/assets/Overview-iaFtthYy.js","/assets/Pagination-DNMLUHHj.js","/assets/PerenaladkaFactTable-BCuHjOP1.js","/assets/PersonCard-DM23I2i8.js","/assets/PlanFulfillment-BZp95Mv7.js","/assets/Production-bvei43Un.js","/assets/Profile-6JNi4lRf.js","/assets/ProofCamera-tZCIfRsZ.js","/assets/Quality-CHEj3g6U.js","/assets/RawRows-BvuTWb8G.js","/assets/RequestStateChip-DnfrKARX.js","/assets/RichTextEditor-KVFB1P6E.js","/assets/SaveState-B2gquXSr.js","/assets/SearchInput-DrVIL0TY.js","/assets/SeasonalityHeatmap-DV8HJcuV.js","/assets/SegmentedToggle-B5ltZoLn.js","/assets/SetupTimes-jJ64LmO9.js","/assets/ShiftDaily-CceqPXne.js","/assets/Staff-B-lf7Yyf.js","/assets/StaffListAtCheck-BVCUbVXS.js","/assets/StatusBadge-9tQT6-4H.js","/assets/TargetGoal-DIXoCJ1t.js","/assets/Targets-BpI3py7Z.js","/assets/Tasks-B1W0cXTH.js","/assets/TimeWheelPicker-CNdhvIDg.js","/assets/Toast-CboeR-MP.js","/assets/Tooltip-B_BqW2wW.js","/assets/TrendChart-eQhB76D7.js","/assets/TripleSpeedometer-FJ__lJuV.js","/assets/Trudoyomkost-Csf5eRVF.js","/assets/Turnover-CXK9fT1s.js","/assets/UploadDropzone-1Rl5bMOD.js","/assets/UsersActivity-DuMNTrks.js","/assets/VerdictBlock-Dus4OlOg.js","/assets/VfxApiMap-B12cHkd_.js","/assets/VfxDictionaries-D2r5K7Zz.js","/assets/VfxEmployees-DKnpRqjn.js","/assets/VfxHrMoves-CKRsXTUK.js","/assets/VfxJobs-x2lI7aNq.js","/assets/VfxPhoto-BkiSWJ9Y.js","/assets/VfxShifts-4VPBqF5r.js","/assets/VfxState-BZ3agn5j.js","/assets/VfxTimebooks-mZFDN64n.js","/assets/VfxTimesheet-B1mINjAV.js","/assets/WatchProgress-kGXp2XR3.js","/assets/WebLogin-CVieDwFw.js","/assets/WorkerConcerns-CPcncO3z.js","/assets/Workers-DFzQ8vRB.js","/assets/Zagruzka-BV0dfisp.js","/assets/ZagruzkaCell-BwMnNJdF.js","/assets/api-CJNM3wt8.js","/assets/archive-BBCiYO2H.js","/assets/archive-restore-DHmYfeu3.js","/assets/arrow-down-Cry6K3z5.js","/assets/arrow-down-wide-narrow-CYfLW9Eg.js","/assets/arrow-up-narrow-wide-BwKOoXvY.js","/assets/award-CjXJURw5.js","/assets/ban-CPyUp_QT.js","/assets/boxes-ClD740I6.js","/assets/braces-BAaPC7F0.js","/assets/brigadirFilters-D5ZB8-B5.js","/assets/broadcastTree-BZ24osdv.js","/assets/building-2-BwBF15Og.js","/assets/calculator-DOgKaDZ2.js","/assets/calendar-C9jEiGKe.js","/assets/calendar-days-nUrlxvDo.js","/assets/camera-Ctn07gIj.js","/assets/categories-B99nALta.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D_l5hfav.js","/assets/chart-line-BmI2EPNt.js","/assets/chart-pie-DEK5c73g.js","/assets/chartRange-DdmeXOd5.js","/assets/check-check-x34Pqns-.js","/assets/chevron-left-fv4G_QaJ.js","/assets/chevrons-up-down-DJCdxz2P.js","/assets/circle-BsuBT3Y7.js","/assets/circle-alert-fiyUfmR_.js","/assets/circle-check-big-BVYT0R8Y.js","/assets/circle-dashed-OBOLxZMJ.js","/assets/circle-minus-Bu-wbzsc.js","/assets/circle-question-mark-BcyC7Fbu.js","/assets/circle-slash-DjiTmyR7.js","/assets/circle-user-round-Bj9cJqZy.js","/assets/clock-3-Cv_gwnEn.js","/assets/cloud-off-BXjJeRVv.js","/assets/cloud-upload-BK9SbxKc.js","/assets/compass-jE-cXB3H.js","/assets/concernCategories-D0d_ctZ9.js","/assets/copy-C-JqY0tw.js","/assets/corner-down-right-BXu5HSAj.js","/assets/createLucideIcon-WwztAN7G.js","/assets/es-BHXUtOPJ.js","/assets/external-link-oFdHLAMH.js","/assets/file-clock-B2hE1xQ_.js","/assets/file-exclamation-point-B5vSdv0K.js","/assets/flag-2KW4swKb.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-EII2dz4s.js","/assets/hash-ke3U8Owk.js","/assets/hourglass-tKjx9NEz.js","/assets/image-B0y9xvQZ.js","/assets/image-off-Bcc8Y4u5.js","/assets/inbox-CGKiKyeX.js","/assets/index-B51zx0ID.js","/assets/index-SDcDNDzY.css","/assets/keyboard-Cead62od.js","/assets/languages-Bw1FSf4S.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-D5hHuyvn.js","/assets/lightbulb-Ce4ZYuwl.js","/assets/link-2-Cmw8I4pz.js","/assets/link-2-off-BF42gZ2u.js","/assets/list-ordered-Z373YkG3.js","/assets/list-tree-CAU3m1rI.js","/assets/lock-open-176Ty4qT.js","/assets/log-in-DfIRfHRy.js","/assets/marks-DecI5ZxW.js","/assets/minimize-2-9dux0KuD.js","/assets/package-check-Daw2KFPD.js","/assets/pencil-TdY01yyc.js","/assets/percent-Dbpq2L03.js","/assets/pin-CqDANhlJ.js","/assets/pin-off-8To1_W51.js","/assets/play-DW3lnDZg.js","/assets/plug-zap-WQjq275E.js","/assets/prop-types-DzGxlZ2V.js","/assets/radio-BfzrUy5E.js","/assets/react-apexcharts.esm-BZzQ4zgI.js","/assets/registers-_qvIxBvS.js","/assets/repeat-LlYZZBWu.js","/assets/save-D7tbrSFz.js","/assets/scopeLinks-DP3qmHnT.js","/assets/scroll-text-j4NJbW9m.js","/assets/search-x-DqqQmmd1.js","/assets/segments-DWXmWGMg.js","/assets/send-D3_in4sw.js","/assets/settings-2-DKnqYfo_.js","/assets/shield-alert-BgXUQDej.js","/assets/shield-hwLw_xUh.js","/assets/shield-question-mark-Cs5s14qM.js","/assets/siren-CDT0NB-H.js","/assets/snowflake-CaUx7yZF.js","/assets/split-CAoFi3pu.js","/assets/square-check-big-BK5u4a_n.js","/assets/star-pebt1Ly_.js","/assets/statusBands-nL5GlOmB.js","/assets/store-CQgG2LCD.js","/assets/table-2-CxfGPiBa.js","/assets/table-properties-IUPnMQPs.js","/assets/tag-r5eRtZm3.js","/assets/timer-off-COr1I4YG.js","/assets/trending-down-Dj1xO5aG.js","/assets/trending-up-DrgeufJ0.js","/assets/undo-2-CjETiIy1.js","/assets/useChartTheme-B5n2zbVL.js","/assets/useElementWidth-DlB714FP.js","/assets/useIsMobile-De7krCTI.js","/assets/useOpenParam-D_rrpYX8.js","/assets/useStatusBands-BT2lAcrp.js","/assets/useUrlScope-DpDSKGGA.js","/assets/user-BTCCjGmH.js","/assets/user-cog-S36ZBMWH.js","/assets/users-DmQflHlY.js","/assets/vfx-DMCe9tkj.js","/assets/video-kpZTaAzm.js","/assets/wallet-BZLS_9wx.js","/assets/warehouse-B0ZVbYv3.js","/assets/workflow-DmWGTDHG.js","/assets/x-DdDzL2n4.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
