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

const BUILD = "2026-10-09T09:11:27.194Z";
const PRECACHE = ["/","/assets/AdminPanel-CFO53dfr.js","/assets/AnalysisBoard-HJK4BsR9.js","/assets/Arc-Bfc9ZvD-.js","/assets/Assistant-B45eDteV.js","/assets/BrigadirProfile-Dm4Ozdaz.js","/assets/BroadcastReceivers-CjKePFlk.js","/assets/BroadcastRecord-C3FXYB1B.js","/assets/Button-BwUZjfLk.js","/assets/CatLockNotice-CKgF6qMt.js","/assets/CategoryLegendModal-DTkCwYAh.js","/assets/CellConcerns-B3OiYOIS.js","/assets/CellDetails-bL52hFD8.js","/assets/CellFormModal-Dn-GlhnI.js","/assets/CellIdent-CN1_ssXz.js","/assets/CellLink-D3Y3dTUT.js","/assets/Cells-Dt2R4yWC.js","/assets/ColumnFilter-C4fFmsI0.js","/assets/ColumnsPicker-BMtgEXuc.js","/assets/CommentsModal-DutAeOjV.js","/assets/ComparisonTable-VTcZ8zXK.js","/assets/Concerns-B7PbcU_c.js","/assets/Daily-B_vPbCSB.js","/assets/DataTable-BorVAKfJ.js","/assets/DateRangePicker-IGrqEvDN.js","/assets/DayReportView-n6YNIVRt.js","/assets/DayStepper-ciMxgHf2.js","/assets/DifferenceBreakdown-CQyqH83_.js","/assets/Downtime-C9mD9hJp.js","/assets/Education-BK7YEVZh.js","/assets/EducationLesson-DoRSB54b.js","/assets/EmptyState-WsyuqYw2.js","/assets/Exam-BCU2gz98.js","/assets/FactorySelect-Dcoq_Hjj.js","/assets/Gamification-_G8G21iy.js","/assets/GroupBadge-CQf8WQ05.js","/assets/HeatmapChart-C_qejE7X.js","/assets/IdleCell-DOC8jSy2.js","/assets/KPICard-DD_s_uLo.js","/assets/Kaizen-DJzfq7__.js","/assets/Kelish-BBWvWgbh.js","/assets/KpiDeltaCard-CDeFlKSf.js","/assets/LangTextInput-CHW17qL4.js","/assets/Layout-DLUKM563.js","/assets/LeaderAppeal-CvFt2pNl.js","/assets/LeaderDayReport-B0mKafQT.js","/assets/LeaderUnitReport-DFITA5W9.js","/assets/Leaderboard-Dik89oRv.js","/assets/Leaders-XikvXitN.js","/assets/Lightbox-FzMTAEMp.js","/assets/LiveOverview-DE3BYRa0.js","/assets/Login-DzihdKgs.js","/assets/NotFound-BMGNwzcT.js","/assets/Notifications-bpvnWsMv.js","/assets/Overview-DX5gOl0U.js","/assets/Pagination-By6GSNj4.js","/assets/PerenaladkaFactTable-CbcA16Dr.js","/assets/PersonCard-BO53RfoB.js","/assets/PlanFulfillment-CDh2gS9q.js","/assets/Production-Bo3o5W6b.js","/assets/Profile-MU773uhe.js","/assets/ProofCamera-Df1D3Apw.js","/assets/ProofPhoto-B_vW4rkZ.js","/assets/Quality-BoVtE_qO.js","/assets/RawRows-oWp_4e1X.js","/assets/RequestStateChip-D-FeyqyV.js","/assets/RichTextEditor-D0TBqxfp.js","/assets/SaveState-BcIF_DeI.js","/assets/SearchInput-C8Cizs2W.js","/assets/SeasonalityHeatmap-iSkIizx4.js","/assets/SegmentedToggle-DV0oeP_n.js","/assets/SetupTimes-CS_yBMYh.js","/assets/ShiftDaily-C_qOtPCI.js","/assets/Staff-BR9Bh8Pa.js","/assets/StatusBadge-DQyjFbNt.js","/assets/TargetGoal-COpIaaU8.js","/assets/Targets-Co09H8RG.js","/assets/Tasks-D7-LGy8H.js","/assets/TimeWheelPicker-DGupOAAB.js","/assets/Toast-CUcLuN5H.js","/assets/Tooltip-C8aIGsQ-.js","/assets/TrendChart-CFrDiS5w.js","/assets/TripleSpeedometer-CXRf9c1_.js","/assets/Trudoyomkost-DXYRKi-3.js","/assets/Turnover-BN9NRc1d.js","/assets/UploadDropzone-Bz8Z2x8r.js","/assets/UsersActivity-N5Yr0tzs.js","/assets/VerdictBlock-CM9yPpH3.js","/assets/VfxApiMap-CJCIxkVr.js","/assets/VfxDictionaries-nl42ARMu.js","/assets/VfxEmployees-CDceSO5I.js","/assets/VfxHrMoves-DXWwqQ1b.js","/assets/VfxJobs-BTgK7axf.js","/assets/VfxPhoto-DYDSCmlv.js","/assets/VfxShifts-Cb-WV3cZ.js","/assets/VfxState-Iac7U2oG.js","/assets/VfxTimebooks-BOCVSKu3.js","/assets/VfxTimesheet-Dl-mKsNV.js","/assets/WatchProgress-FiFgIjk9.js","/assets/WebLogin-B9L6faZm.js","/assets/WorkerConcerns-C7MVIQ_Y.js","/assets/Workers-1Bo_SrJ1.js","/assets/Zagruzka-DA4v9kxC.js","/assets/ZagruzkaCell-42o6MoXc.js","/assets/api--6kgEOPJ.js","/assets/archive-restore-80Kg8if1.js","/assets/archive-yAuH-hil.js","/assets/arrow-down-ChkUjgcR.js","/assets/arrow-down-wide-narrow-BZK8P9Q0.js","/assets/arrow-up-narrow-wide-Dmfcm2eD.js","/assets/award-DlFGs5dC.js","/assets/ban-CtDL0h6k.js","/assets/boxes-xW5F0p9r.js","/assets/braces-BPbUe2NZ.js","/assets/brigadirFilters-C8pgcSqu.js","/assets/broadcastTree-uvjHQTcQ.js","/assets/building-2-BuhGM8vd.js","/assets/calculator-CVPftZTi.js","/assets/calendar-BffNDSqJ.js","/assets/calendar-days-BMGA1TMF.js","/assets/camera-B7LHsZyg.js","/assets/categories-zARLNC0K.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CmwST_E4.js","/assets/chart-line-AtLhhgL2.js","/assets/chart-pie-BNHLe4af.js","/assets/chartRange-Bq2IK4_8.js","/assets/check-check-BwwSgAZt.js","/assets/chevron-left-dXxcxn9e.js","/assets/chevrons-up-down-xddzsE-o.js","/assets/circle-C-rqxqUn.js","/assets/circle-alert-uw4GLpqx.js","/assets/circle-check-big-DecAoObO.js","/assets/circle-dashed-DNfbblud.js","/assets/circle-minus-BcQL83mc.js","/assets/circle-question-mark-DXHHQ1bG.js","/assets/circle-slash-CE8YRYtI.js","/assets/circle-user-round-kFmRuU_V.js","/assets/clock-3-DYFDJYuF.js","/assets/cloud-off-C6yvMDK8.js","/assets/cloud-upload-DxFKPNTP.js","/assets/compass-qqmePyXV.js","/assets/concernCategories-1cPUa5r8.js","/assets/copy-xcd6nN1g.js","/assets/corner-down-right-HOTwLx98.js","/assets/createLucideIcon-C5xuNDBQ.js","/assets/es-CFPT4isJ.js","/assets/external-link-Hg-D9Gs2.js","/assets/file-clock-CypDAXYg.js","/assets/file-exclamation-point-Do8tbHlb.js","/assets/flag-BSDmhFYD.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DxMGSQry.js","/assets/hash-D9v7d-un.js","/assets/hourglass-DyLB57Cv.js","/assets/image-off-Ul4qb1V2.js","/assets/image-zMWJylDk.js","/assets/inbox-DIGV8I23.js","/assets/index-CgjAgPsh.js","/assets/index-DFfGVOG_.css","/assets/keyboard-BSTsa835.js","/assets/languages-juQ1MczQ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DrZ7URMZ.js","/assets/lightbulb-CGINdwSQ.js","/assets/link-2-D4rfdUBI.js","/assets/link-2-off-Bv3F2k6F.js","/assets/list-ordered-DmzYB4v2.js","/assets/list-tree-jdWhgzCo.js","/assets/lock-open-Uptek7g5.js","/assets/log-in-CnULOFqN.js","/assets/minimize-2-FRmi1PNv.js","/assets/package-check-DY40hpdU.js","/assets/pencil-DMebBgnc.js","/assets/percent-DwxIn9IR.js","/assets/pin-BwNb8p0c.js","/assets/pin-off-BWPwsI6u.js","/assets/play-Bi50cq_H.js","/assets/plug-zap-B0NIVVUk.js","/assets/prop-types-B9Y6N_YT.js","/assets/radio-kcwqYki4.js","/assets/react-apexcharts.esm-H3OyXaRO.js","/assets/registers-BxkENKNk.js","/assets/repeat-C2i6iC6T.js","/assets/save-mwOS1Eod.js","/assets/scopeLinks-Ci0cXXE-.js","/assets/scroll-text-GR1wG7wZ.js","/assets/search-x-CbvMxRZr.js","/assets/segments-DkDkFChh.js","/assets/send-M3jlOS5G.js","/assets/settings-2-HAlPbNaf.js","/assets/shield-BK1s6pN4.js","/assets/shield-alert-jv-ZF8-R.js","/assets/shield-question-mark-DETuonr6.js","/assets/siren-2OuGXRcs.js","/assets/snowflake-Db2YbjTU.js","/assets/split-0oxGTMDS.js","/assets/square-check-big-DGO-AlaV.js","/assets/star-C07ay0ua.js","/assets/statusBands-DoyiU7WM.js","/assets/store-Zh2DS1ZV.js","/assets/table-2-VnICWbHo.js","/assets/table-properties-CKwUfyO-.js","/assets/tag-CXONpDNR.js","/assets/timer-off-CE7Dz8p0.js","/assets/trending-down-LVdNOxQF.js","/assets/trending-up-GFbDnKKG.js","/assets/undo-2-K4VTGxQ1.js","/assets/useChartTheme-B3mdEWBx.js","/assets/useElementWidth-OhyrQ93c.js","/assets/useIsMobile-DAjphZ-g.js","/assets/useOpenParam-Bea3jKKm.js","/assets/useStatusBands-BZnqUIUE.js","/assets/useUrlScope-BW033XqV.js","/assets/user-CGNNoXEu.js","/assets/user-cog-CHAlb4Xu.js","/assets/users-D0yRP7Xi.js","/assets/vfx-DEEe9zBW.js","/assets/video-DYjrJnwU.js","/assets/wallet-DvCI_OUa.js","/assets/warehouse-mbwTwkNT.js","/assets/x-Clda5fR7.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
