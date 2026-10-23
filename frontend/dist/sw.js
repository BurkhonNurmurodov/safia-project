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

const BUILD = "2026-10-23T15:48:54.128Z";
const PRECACHE = ["/","/assets/AdminPanel-C_ChcjUv.js","/assets/AnalysisBoard-CooxscxU.js","/assets/Arc-CNDQb2B-.js","/assets/Assistant-BCd-SdH6.js","/assets/BrigadirProfile-Dc6U14mj.js","/assets/BroadcastReceivers-Bo7SpASD.js","/assets/BroadcastRecord-DwTjyYkf.js","/assets/Button-BOkePdHL.js","/assets/CatLockNotice-C8Ta5U6E.js","/assets/CategoryLegendModal-DSGT9Mgi.js","/assets/CellConcerns-Lbfxn_Ep.js","/assets/CellDetails-0BKsXw7l.js","/assets/CellFormModal-CyVcYwcC.js","/assets/CellIdent-DjfMLojX.js","/assets/CellLink-Dizt-FUy.js","/assets/Cells-DYNwEy86.js","/assets/ColumnFilter-DyglMFE3.js","/assets/ColumnsPicker-ClpnqTw-.js","/assets/CommentsModal-cJRwidqn.js","/assets/ComparisonTable-_GBbRBhR.js","/assets/Concerns-RfDwSMkH.js","/assets/CountStepper-BINJnU7q.js","/assets/Daily-1f7CF4nG.js","/assets/DataTable-BQ9qGcrF.js","/assets/DateRangePicker-CCHU-XmB.js","/assets/DayReportView-BzCbAGpB.js","/assets/DayStepper-wpWgnV9l.js","/assets/DayStrip-CJNV0Wg6.js","/assets/DifferenceBreakdown-CEkA2UF0.js","/assets/Downtime-BoahKCUo.js","/assets/Education-bdKe4KHC.js","/assets/EducationLesson-BWDDk1G_.js","/assets/EmptyState-DRfuvBWz.js","/assets/Exam-BOX2QyNL.js","/assets/FactorySelect-OC44NAry.js","/assets/Gamification-DtmWLpvv.js","/assets/GroupBadge-DFd62AP5.js","/assets/HeatmapChart-t-n1jBSj.js","/assets/IdleCell-BUpAbMpx.js","/assets/KPICard-D201anfP.js","/assets/Kaizen-BFbZ_AK_.js","/assets/Kelish-BNIuHLCG.js","/assets/KpiDeltaCard-ulhNoNDZ.js","/assets/LangTextInput-BDeITLo1.js","/assets/Layout-Dsw7B2xs.js","/assets/LeaderAppeal-CLoyzu7U.js","/assets/LeaderDayReport-rPx52y4_.js","/assets/LeaderUnitReport-DnteRVhJ.js","/assets/Leaderboard-Xah_mNDe.js","/assets/Leaders-DPZHxIiV.js","/assets/LeadersKpi-C2G0P1NA.js","/assets/Lightbox-Dq_64K-r.js","/assets/LiveOverview-Do0ARlfP.js","/assets/Login-45Qc_sJ2.js","/assets/NotFound-BxMwc7oL.js","/assets/Notifications-Dy7LZARK.js","/assets/Ontime-DibVZb1t.js","/assets/Overview-BdBqbIWA.js","/assets/Pagination-DNjRVM9d.js","/assets/PerenaladkaFactTable-Bh59q1WP.js","/assets/PersonCard-J4AoRYt1.js","/assets/PlanFulfillment-BoytRNbK.js","/assets/Production-CJ2VB3s7.js","/assets/Profile-Dan8mNaZ.js","/assets/ProofCamera-CDFzHDLY.js","/assets/ProofPhoto-GvS_SHK9.js","/assets/Quality-CnbFe9PH.js","/assets/RawRows-CMoYTATr.js","/assets/RequestStateChip-CwuvnEob.js","/assets/RichTextEditor-B3egRzVZ.js","/assets/SaveState-_brWQ7YM.js","/assets/SearchInput-H_083Yij.js","/assets/SeasonalityHeatmap-DfAk8My-.js","/assets/SegmentedToggle-BHQ_dEHe.js","/assets/SetupTimes-DauZ_6Jr.js","/assets/ShiftDaily-CnEKpoJ_.js","/assets/Staff-DNHHJ_d8.js","/assets/StaffListAtCheck-DiK4SSkK.js","/assets/StatusBadge-DCT0nQp0.js","/assets/StatusBandsModal-ChwTKYzZ.js","/assets/TargetGoal-CJ_FIW6C.js","/assets/Targets-DDjt_7Qt.js","/assets/Tasks-Dvwd4UyH.js","/assets/TimeWheelPicker-BUW7mIzm.js","/assets/Toast-BQisaPR1.js","/assets/Tooltip-DJwiR5Js.js","/assets/TrendChart-BGGpeiL0.js","/assets/TripleSpeedometer-DGVvUjKo.js","/assets/Trudoyomkost-DM4fk1ja.js","/assets/UploadDropzone-CIO1HIlt.js","/assets/UsersActivity-npGCBSKn.js","/assets/VerdictBlock-D48RXGlv.js","/assets/VfxApiMap-8S35u_pg.js","/assets/VfxDictionaries-DgRv8xUX.js","/assets/VfxEmployees-DPCWbMLM.js","/assets/VfxHrMoves-DC1rn0R8.js","/assets/VfxJobs-DHPuoew9.js","/assets/VfxPhoto-CP_WX6ux.js","/assets/VfxShifts-Cnx1Ug6g.js","/assets/VfxState-D96vf_Cb.js","/assets/VfxTimebooks-CgINzGh1.js","/assets/VfxTimesheet-Dx-mUj1v.js","/assets/WatchProgress-C3sJ8-oV.js","/assets/WebLogin-D-6S_pmD.js","/assets/Workers-lA-tVSo7.js","/assets/Zagruzka-FSFm9l86.js","/assets/ZagruzkaCell-BpNVdZS7.js","/assets/api-CEQ3cJyK.js","/assets/archive-CBxcH7Kn.js","/assets/archive-restore-D82qJtB1.js","/assets/arrow-down-BKFXgBOi.js","/assets/arrow-down-right-C5auvJZN.js","/assets/arrow-down-wide-narrow-B1376Efs.js","/assets/arrow-up-narrow-wide-yJGGPu9M.js","/assets/ban-CWpQ2cQi.js","/assets/boxes-C3BWhvob.js","/assets/braces-NiECEXd6.js","/assets/brigadirFilters-zlAj_OcG.js","/assets/broadcastTree-LSwQNWXS.js","/assets/building-2-BJKXnFdl.js","/assets/calendar-Dg3ZBg3H.js","/assets/calendar-days-ClHthi_J.js","/assets/camera-Cqg4dBYC.js","/assets/categories-BeO1h6g7.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C1TyKN7W.js","/assets/chart-line-BjGbOr06.js","/assets/chart-pie-DPXBH8p-.js","/assets/chartRange-Bry8tOz6.js","/assets/check-check-msdYVWla.js","/assets/chevron-left-BVE0h_oS.js","/assets/chevrons-up-down-DrM6YAlg.js","/assets/circle-BuVGB_4R.js","/assets/circle-alert-_UQnW6Ju.js","/assets/circle-check-big-BTR79xI0.js","/assets/circle-dashed-BelRd_QG.js","/assets/circle-minus-MQtZpOr-.js","/assets/circle-question-mark-BlyRyyNx.js","/assets/circle-slash-DnSioiSu.js","/assets/circle-user-round-CzL4bwCY.js","/assets/cloud-off-DLdvzhT9.js","/assets/cloud-upload-DJ3PpJGk.js","/assets/compass-BSVX2bul.js","/assets/concernCategories--neGLtVd.js","/assets/corner-down-right-aMFdGAMv.js","/assets/createLucideIcon-DM1qhk15.js","/assets/es-CkBw0D_D.js","/assets/external-link-DzwbAkwz.js","/assets/file-clock-Dx9SksLL.js","/assets/file-exclamation-point-DfU7DQia.js","/assets/flag-D46gd8W1.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-C4dSJi4T.js","/assets/funnel-D_R1RAON.js","/assets/hash-DDvEk-nH.js","/assets/hourglass-D9I8aXQ8.js","/assets/image-BI2tZjo9.js","/assets/image-off-CDMihKUl.js","/assets/inbox-BbsGdy4w.js","/assets/index-DFvJry-Q.css","/assets/index-Dcz40iGe.js","/assets/keyboard-DAJ4QJyq.js","/assets/languages-DDc0a0GH.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DCXSRuNx.js","/assets/leaderBoard-Bdg_eep5.js","/assets/lightbulb-CzYY4kVn.js","/assets/link-2-D1ctS5HA.js","/assets/link-2-off-ekiccx_C.js","/assets/list-ordered-BZPp58Fa.js","/assets/list-tree-DifowLO9.js","/assets/lock-open-C-_qBOvV.js","/assets/log-in-D64rWiuk.js","/assets/map-pin-Bqz3o5Cg.js","/assets/marks-BP1KmZJB.js","/assets/minimize-2-CvV-Volj.js","/assets/package-check-gyr3nWRO.js","/assets/pencil-CSIwzWMH.js","/assets/percent-C72TYtsK.js","/assets/pin-Cj9IjZQn.js","/assets/pin-off-DGaUmKdS.js","/assets/play-Cwh9sVRF.js","/assets/plug-zap-BAISbvyp.js","/assets/prop-types-DIovRp99.js","/assets/radio-E2C-HuD8.js","/assets/react-apexcharts.esm-CIAYwuRP.js","/assets/registers-C8dYINUv.js","/assets/repeat-DeGsssdq.js","/assets/save-CM1fak_C.js","/assets/scopeLinks-DG6h8VD1.js","/assets/scroll-text-B3pLQ5_B.js","/assets/search-x-Q5zv8pYw.js","/assets/segments-BRCuur8-.js","/assets/send-Dcu00HJ9.js","/assets/settings-2-DKUJ4Xbi.js","/assets/shield-alert-B7Me-A5C.js","/assets/shield-cUtFty6a.js","/assets/shield-question-mark-VyzTZY00.js","/assets/sigma-G7PZti3z.js","/assets/siren-CjXFZakv.js","/assets/snowflake-AsmsOoA7.js","/assets/split-U3FiX0MA.js","/assets/square-check-big-H4e5fzjk.js","/assets/star-eZ7Nkr5X.js","/assets/statusBands-CZV05rQu.js","/assets/store-G5OI-lae.js","/assets/table-2-_OMw3o0l.js","/assets/table-properties-E48x2Xpm.js","/assets/tag-Do-hUSyc.js","/assets/timer-off-ChmVcQdH.js","/assets/trendBuckets-D6aklzXG.js","/assets/trending-down-Ddn8NVfU.js","/assets/trending-up-DPIwxrbK.js","/assets/undo-2-fGlArksv.js","/assets/useChartTheme-DB8sBIt2.js","/assets/useElementWidth-BcGHvnZK.js","/assets/useIsMobile-BvDQ_ZQP.js","/assets/useOpenParam-B4jWcKx0.js","/assets/useStatusBands-LJmCPtxb.js","/assets/useUrlScope-CXZGblg8.js","/assets/user-DOjg5ysN.js","/assets/user-cog-DMaCi4h8.js","/assets/user-minus-D39UXNTH.js","/assets/users-CeOiSEkS.js","/assets/vfx-CM-clp4m.js","/assets/video-Dlmp_00a.js","/assets/wallet-CVqZvPXU.js","/assets/warehouse-CVBi3rBK.js","/assets/workflow-f6hvjoQs.js","/assets/x-C0VLsyez.js","/assets/zap-Li78hq4H.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
