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

const BUILD = "2026-10-02T06:09:07.110Z";
const PRECACHE = ["/","/assets/AdminPanel-BWcVCrz1.js","/assets/AnalysisBoard-b_-Tqc_A.js","/assets/Arc-D-vwfsPo.js","/assets/ArcLegacy-jqohQVZC.js","/assets/BrigadirProfile-VJtl95RU.js","/assets/BroadcastReceivers-BDsHGgyJ.js","/assets/BroadcastRecord-CrxzJnEg.js","/assets/CatLockNotice-FD1RB9Tt.js","/assets/CategoryLegendModal-BerV9hcz.js","/assets/CellConcerns-CEzSplNb.js","/assets/CellDetails-DXb1GDNs.js","/assets/CellFormModal-BxXgt6g3.js","/assets/CellIdent-DZvhWtC9.js","/assets/CellLink-DBSYCF05.js","/assets/Cells-C7A_JaG6.js","/assets/ColumnFilter-CjssnVbs.js","/assets/ColumnsPicker-Bmpqz7V6.js","/assets/CommentsModal-4SmeLjyU.js","/assets/ComparisonTable-Bcx_lxl0.js","/assets/Concerns-C2cUdVPy.js","/assets/ConfirmDialog-DjtMCms3.js","/assets/Daily-DoSLZXQY.js","/assets/DataTable-CEQdTfUj.js","/assets/DateRangePicker-BGHSKkQx.js","/assets/DayReportView-CI9dxhDT.js","/assets/DayStepper-C2c1fwk-.js","/assets/DifferenceBreakdown-Chssi_xa.js","/assets/Downtime-VsXix8cR.js","/assets/Education-D4lMUi2y.js","/assets/EducationLesson-DPOebjjf.js","/assets/EmptyState-DFldQYtd.js","/assets/Exam-BcdKttsy.js","/assets/FactorySelect-B1CuoncH.js","/assets/Gamification-CYBwjun1.js","/assets/GroupBadge-eR3wFqxR.js","/assets/HeatmapChart-DgM8m_m2.js","/assets/IdleCell-sWPWByh1.js","/assets/KPICard-CChsvA_-.js","/assets/Kaizen-DKOVSgFn.js","/assets/Kelish-CYBmZ4dc.js","/assets/KpiDeltaCard-8AUR9viF.js","/assets/LangTextInput-C3L1RSKn.js","/assets/Layout-CKIuOgdI.js","/assets/LeaderAppeal-CFZtiHqo.js","/assets/LeaderDayReport-BemCXD1o.js","/assets/LeaderUnitReport-BOnh6yvG.js","/assets/Leaderboard-1w3pX14E.js","/assets/Leaders-9MxhO6J_.js","/assets/Lightbox-CG3WqrB9.js","/assets/LiveOverview-ClZRhSj8.js","/assets/Login-BAFHsEDc.js","/assets/NotFound-BqStLl5x.js","/assets/Notifications-DVhXpLiN.js","/assets/Overview-DFcZPbKX.js","/assets/Pagination-B97yN8YN.js","/assets/PerenaladkaFactTable-SCkGgR0h.js","/assets/PlanFulfillment-BJgLwogk.js","/assets/Production-ukIKFHoZ.js","/assets/Profile-if2l2nZ_.js","/assets/ProofCamera-CMer2j2P.js","/assets/ProofPhoto-CL8UEHxx.js","/assets/Quality-D5_TY9YT.js","/assets/RequestStateChip-CQesDQQt.js","/assets/RichTextEditor-n1Ofa-4X.js","/assets/SaveState-dL-y2HsY.js","/assets/SearchInput-eYmh-2VE.js","/assets/SeasonalityHeatmap-BmhyT1VT.js","/assets/SegmentedToggle-Q-VIcuAY.js","/assets/SetupTimes-CPoh14tB.js","/assets/ShiftDaily-uwJ1V1OI.js","/assets/Staff-B8Wy0cJ5.js","/assets/StaffLive-BYoF7_1b.js","/assets/StatusBadge--S9JV3yl.js","/assets/TargetGoal-DJN8K9_o.js","/assets/Targets-D-I_RDOG.js","/assets/Tasks-Bbt-0ew1.js","/assets/TimeWheelPicker-BB8iy8ee.js","/assets/Toast-DontSxhX.js","/assets/Tooltip-CCW6F-Ux.js","/assets/TrendChart-CFYOYg_X.js","/assets/TripleSpeedometer-DVsLb1wO.js","/assets/Trudoyomkost-feuxt_D3.js","/assets/UploadDropzone-D2tPv209.js","/assets/UsersActivity-DvhQYRHD.js","/assets/VerdictBlock-CU7HPN2c.js","/assets/WatchProgress-Cf177sLK.js","/assets/WebLogin-CxmDdYYM.js","/assets/WorkerConcerns-buxMorxT.js","/assets/Workers-BXZycg9N.js","/assets/Zagruzka-DaOU8-fG.js","/assets/ZagruzkaCell-dwCKl6HS.js","/assets/api-Di2t2Zfp.js","/assets/archive-N8IAomSw.js","/assets/archive-restore-DvTTeUgA.js","/assets/arrow-down-DnuBP1rn.js","/assets/arrow-left-LS2zlftq.js","/assets/arrow-right-left-Db4JwpL8.js","/assets/arrow-up-BgLs_HFJ.js","/assets/arrow-up-narrow-wide-9MniQEtp.js","/assets/arrow-up-right-BlLX6Hli.js","/assets/award-DIYonI6N.js","/assets/ban-Tq9itHDe.js","/assets/bot-CjxOxEWg.js","/assets/boxes-CsCb8OSr.js","/assets/brigadirFilters-Tp7g_fUu.js","/assets/broadcastTree-DRkyoqbG.js","/assets/building-2-BpMqpZr8.js","/assets/calendar-DAVlsNeG.js","/assets/calendar-days-etPe7rMt.js","/assets/calendar-range-D7KwpjIU.js","/assets/camera-C20cEA3W.js","/assets/categories-CDE2wzyP.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BK42isxl.js","/assets/chart-line-CwrUUbKd.js","/assets/chart-pie-N5NR2Tfg.js","/assets/chartRange-Dy9YU5LM.js","/assets/chevron-left-BKAy-ftF.js","/assets/chevrons-up-down-Dhwtb07t.js","/assets/circle-BoHeZ0bR.js","/assets/circle-alert-CiZJ6Ydf.js","/assets/circle-check-big-COm8hQS0.js","/assets/circle-minus-2hhW6ggr.js","/assets/circle-slash-Cb0YWkhc.js","/assets/circle-user-round-DSGRVheK.js","/assets/cloud-off-CsGJNV99.js","/assets/cloud-upload-CaZXRVRE.js","/assets/compass-C2PxJIOE.js","/assets/concernCategories-CiDsvDxs.js","/assets/copy-Sk57lNyz.js","/assets/corner-down-right-Da-YQzRZ.js","/assets/createLucideIcon-ChHaqIOm.js","/assets/es-CJ5f9RZ8.js","/assets/exportXlsx-0oJgBUvo.js","/assets/external-link-D-FSBEjy.js","/assets/file-clock-BZyvYBuG.js","/assets/file-exclamation-point-DsLn9d5s.js","/assets/file-spreadsheet-DtXuGT4N.js","/assets/file-text-WlozELj2.js","/assets/flag-CYRt13mR.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BIN9qkkX.js","/assets/hash-B8o1UB5X.js","/assets/history-BIDiflGj.js","/assets/hourglass-BpYDaZdk.js","/assets/id-card-Dj9jwcrJ.js","/assets/image-BOD37BjR.js","/assets/image-off-BSMB9Egh.js","/assets/inbox-NiEhHTu0.js","/assets/index-CBQ-7RpV.css","/assets/index-CsejY5NP.js","/assets/key-round-C1gUFtxa.js","/assets/keyboard-BXq88J6D.js","/assets/languages-Ct5_sFml.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B_L0qWSF.js","/assets/lightbulb-Bdcp0CWn.js","/assets/link-2-CFDcWInh.js","/assets/link-2-off-CQ0--TmT.js","/assets/list-ordered-DLJEQNkt.js","/assets/list-tree-D4JLxSu0.js","/assets/lock-open-a8XSRb4J.js","/assets/log-in-BgkQXCCJ.js","/assets/maximize-2-BrssinYu.js","/assets/message-square-BliGC6_Z.js","/assets/minimize-2-DgL3Uas2.js","/assets/package-check-Ct8e9vlz.js","/assets/paperclip--cfOMYuh.js","/assets/pencil-iINt9WSN.js","/assets/percent-D0WCucn3.js","/assets/pin-CjLfKViQ.js","/assets/pin-off-B8C6G3i6.js","/assets/play-Gz1WjlpW.js","/assets/plug-zap-DwaTK5XG.js","/assets/presentation-BnOmkwmt.js","/assets/prop-types-DwjzA3fm.js","/assets/radio-BVB9Tx1H.js","/assets/react-apexcharts.esm-CNXqJxyV.js","/assets/repeat-Cwpyl5BD.js","/assets/rotate-ccw-Bsc94UhC.js","/assets/rotate-cw-DNeNEqp7.js","/assets/save-DxuxaM6K.js","/assets/scopeLinks-jDaKTpuZ.js","/assets/scroll-text-DI9BQSeh.js","/assets/search-x-DjNpjcPp.js","/assets/segments-DtkmefZ5.js","/assets/send-ETjDUZWK.js","/assets/settings-2-CfrSbt7V.js","/assets/shield-CuJpHAsn.js","/assets/shield-alert-DHmoad-5.js","/assets/shield-check-aJpBUOpp.js","/assets/shield-question-mark-BmOb8yFh.js","/assets/siren-DHGVskNm.js","/assets/snowflake-BA7pT762.js","/assets/split-Buf-12id.js","/assets/square-BVrPTOjD.js","/assets/square-check-big-Cg1b_OdY.js","/assets/star-Hei_XG0n.js","/assets/statusBands-B3LaPsfO.js","/assets/store-CvWWUAc5.js","/assets/table-2-E8mui6j2.js","/assets/table-properties-Bx91ZtBz.js","/assets/tag-DKscwlfn.js","/assets/timer-off-DWIjRqIb.js","/assets/trending-down-JkVUbguU.js","/assets/trending-up-0ybkcVCp.js","/assets/undo-2-Cn9PnfQk.js","/assets/useChartTheme-DAjVUqDj.js","/assets/useElementWidth-CFNCobJ5.js","/assets/useIsMobile-CKoi70oM.js","/assets/useOpenParam-CueEJ7Ks.js","/assets/useStatusBands-DM4c7Eer.js","/assets/useUrlScope-CpucBp9B.js","/assets/user-Uxu48cLV.js","/assets/user-cog-CIDWwIjL.js","/assets/user-minus-hzuZ_t0f.js","/assets/users-Cz7noO3f.js","/assets/video-MtwC9iLA.js","/assets/wallet-DLy7mWGt.js","/assets/warehouse-ozk0rB0U.js","/assets/x-CPmuCbVi.js","/assets/zap-B4rxFbmU.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
