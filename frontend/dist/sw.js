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

const BUILD = "2026-10-14T17:40:23.381Z";
const PRECACHE = ["/","/assets/AdminPanel-ZOFtm4Jp.js","/assets/AnalysisBoard-JAwnUg2p.js","/assets/Arc-DR4N8tf9.js","/assets/Assistant-Co3ozQl9.js","/assets/BrigadirProfile-CHLvqPGH.js","/assets/BroadcastReceivers-dd9kW-Kn.js","/assets/BroadcastRecord-CCM-Y9YF.js","/assets/Button-BjH0kk7J.js","/assets/CatLockNotice-BojjbVwf.js","/assets/CategoryLegendModal-DrNgOJ-f.js","/assets/CellConcerns-ET65JfIg.js","/assets/CellDetails-D0CbsAj1.js","/assets/CellFormModal-x-zdK7vh.js","/assets/CellIdent-BL85o9Od.js","/assets/CellLink-0-_FLdC4.js","/assets/Cells-tVK6wbKm.js","/assets/ColumnFilter-D3Z9RD0j.js","/assets/ColumnsPicker-cir6B39l.js","/assets/CommentsModal-CljDxxCn.js","/assets/ComparisonTable-D1qG_RP0.js","/assets/Concerns-B6pO_XGS.js","/assets/CountStepper-CcBs-qqE.js","/assets/Daily-B8HT_Dwz.js","/assets/DataTable-BZ_wTTyM.js","/assets/DateRangePicker-Cewtc4lY.js","/assets/DayReportView-BhTEYZVI.js","/assets/DayStepper-Cu3mBKrt.js","/assets/DifferenceBreakdown-DYu4tRUW.js","/assets/Downtime-GRMrdFFH.js","/assets/Education-D0ygx1KV.js","/assets/EducationLesson-DMgXUhE2.js","/assets/EmptyState-BEeN5wET.js","/assets/Exam-7-TX6Lj-.js","/assets/FactorySelect-BH9QabJy.js","/assets/Gamification-CxYKlt-G.js","/assets/GroupBadge-BnTLDOZk.js","/assets/HeatmapChart-yy0r8d_O.js","/assets/IdleCell-sQZxGDYy.js","/assets/KPICard-C1JLNFbS.js","/assets/Kaizen-FYiqk5VK.js","/assets/Kelish-CABTTxvh.js","/assets/KpiDeltaCard-B17vd-Wo.js","/assets/LangTextInput-U3YRQt7l.js","/assets/Layout-zzuypiGp.js","/assets/LeaderAppeal-Besusjm-.js","/assets/LeaderDayReport-HziafAnO.js","/assets/LeaderUnitReport-DETFJVuF.js","/assets/Leaderboard-DvVOqQ2m.js","/assets/Leaders-CnFeyZiU.js","/assets/Lightbox-DOJu7M9Q.js","/assets/LiveOverview-B7TMn881.js","/assets/Login-9TQoYEdy.js","/assets/NotFound-BxUeUpDm.js","/assets/Notifications-n4K7mZ3A.js","/assets/Overview-CKmUKdH9.js","/assets/Pagination-BEb3t7Op.js","/assets/PerenaladkaFactTable-Ktr6LU2A.js","/assets/PersonCard-DPQBOiP3.js","/assets/PlanFulfillment-DUCnuQzA.js","/assets/Production-Bow6S21p.js","/assets/Profile-QdzS-SPD.js","/assets/ProofCamera-CMiaRjsV.js","/assets/Quality-u3UkxmBP.js","/assets/RawRows-B0K8Ovyh.js","/assets/RequestStateChip-CfW0Volj.js","/assets/RichTextEditor-D8QcvkFa.js","/assets/SaveState-CI9Q6m2J.js","/assets/SearchInput-BjvOcumc.js","/assets/SeasonalityHeatmap-DAp_dm6g.js","/assets/SegmentedToggle-CiCrWCcQ.js","/assets/SetupTimes-BHczAkS9.js","/assets/ShiftDaily-BvZqaOeM.js","/assets/Staff-D-OUVdNc.js","/assets/StaffListAtCheck-DKITmCje.js","/assets/StatusBadge-DAjzE0m7.js","/assets/TargetGoal-C0KOzVF7.js","/assets/Targets-DtX266Re.js","/assets/Tasks-NcW9PTj4.js","/assets/TimeWheelPicker-DgWtTw07.js","/assets/Toast-BL_e6HBs.js","/assets/Tooltip-ZEi4vwPi.js","/assets/TrendChart-BbFDzF1f.js","/assets/TripleSpeedometer-BhciVzZa.js","/assets/Trudoyomkost-Ck8KGUog.js","/assets/Turnover-CeK-j5Cq.js","/assets/UploadDropzone-Ds7WQF2e.js","/assets/UsersActivity-89GxOGTn.js","/assets/VerdictBlock-DKcRH8EM.js","/assets/VfxApiMap-oJ92lmjc.js","/assets/VfxDictionaries-6HtoxZyr.js","/assets/VfxEmployees-CeHP18fp.js","/assets/VfxHrMoves-BRR6DWIu.js","/assets/VfxJobs-D_HWYhwf.js","/assets/VfxPhoto-B2rgeU20.js","/assets/VfxShifts-Cj_9szTw.js","/assets/VfxState-BWCM_CkN.js","/assets/VfxTimebooks-Do0EdXFj.js","/assets/VfxTimesheet-DKYQ1fNw.js","/assets/WatchProgress-CiJa60xv.js","/assets/WebLogin-BYfAgRUu.js","/assets/WorkerConcerns-CwrYo3ru.js","/assets/Workers-D3aMh3vp.js","/assets/Zagruzka-AByzFtGz.js","/assets/ZagruzkaCell-DXZV3gjH.js","/assets/api-DNhOMLwJ.js","/assets/archive-Ct9gsW7g.js","/assets/archive-restore-BNMIUa0Q.js","/assets/arrow-down-CcZ0bjhQ.js","/assets/arrow-down-wide-narrow-n7_Z66hu.js","/assets/arrow-up-narrow-wide-NSaxNmv1.js","/assets/award-BZXceE6P.js","/assets/ban-3_aW_TJM.js","/assets/boxes-BEO2bxaU.js","/assets/braces-BbUBM7u7.js","/assets/brigadirFilters-e4uo5MZL.js","/assets/broadcastTree-B1udSrIU.js","/assets/building-2-cLko8Od6.js","/assets/calculator-l8TAQ-gz.js","/assets/calendar-DNJpShE9.js","/assets/calendar-days-DLFlLz-x.js","/assets/camera-6r_0ukCK.js","/assets/categories-CtwVt8xc.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DgTjpYYI.js","/assets/chart-line-D-e1Il5K.js","/assets/chart-pie-BDTSapj6.js","/assets/chartRange-BLZ47gcf.js","/assets/check-check-Fti4A2eT.js","/assets/chevron-left-Dnr0h2Uy.js","/assets/chevrons-up-down-CNetK6GU.js","/assets/circle-D1rd-EGm.js","/assets/circle-alert-WnChxjNS.js","/assets/circle-check-big-O_ZzXBtn.js","/assets/circle-dashed-Dj3Mj1Ta.js","/assets/circle-minus-DXVGG8Dm.js","/assets/circle-question-mark-BNQ_zfvM.js","/assets/circle-slash-DWA0siuR.js","/assets/circle-user-round-BZvQnWnV.js","/assets/clock-3-DOPUDymf.js","/assets/cloud-off-BKe4Ccb9.js","/assets/cloud-upload-BcWGFpnS.js","/assets/compass-BOBNAJbU.js","/assets/concernCategories-zI_msCiB.js","/assets/copy-CrdijDoz.js","/assets/corner-down-right-Do_iK3_5.js","/assets/createLucideIcon-C75z7wOl.js","/assets/es-CO3gYtMN.js","/assets/external-link-DmToJznA.js","/assets/file-clock-DIwfvyCy.js","/assets/file-exclamation-point-DSMEJz7a.js","/assets/flag-D_IIsuMK.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CAU5ljcX.js","/assets/hash-BBjtZWX9.js","/assets/hourglass-BB9gW_e2.js","/assets/image-DM1nmX2m.js","/assets/image-off-DVCTazNz.js","/assets/inbox-JLHlQ63M.js","/assets/index-DdoCiJMu.js","/assets/index-oN3ajqAx.css","/assets/keyboard-B9qi9N76.js","/assets/languages-CHm3bAvW.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Ds8O_Ai1.js","/assets/lightbulb-CRlD_7y6.js","/assets/link-2-B05v49Ot.js","/assets/link-2-off-C9busD2a.js","/assets/list-ordered-C4OIaKv2.js","/assets/list-tree-c-YZmqtQ.js","/assets/lock-open-CeAHX1L1.js","/assets/log-in-L99Kh14P.js","/assets/marks-BrPlS8uV.js","/assets/minimize-2-B-5WMkZt.js","/assets/package-check-CCUz4yJh.js","/assets/pencil-CL5CslbM.js","/assets/percent-BFjflHHa.js","/assets/pin-off-CbA8NjSI.js","/assets/pin-tVS3I2kj.js","/assets/play-rSjSI0T5.js","/assets/plug-zap-agWzyNxy.js","/assets/prop-types-Dk5UhNDm.js","/assets/radio-uOJv_bLa.js","/assets/react-apexcharts.esm-CsqN8mij.js","/assets/registers-BZMed1Ou.js","/assets/repeat-DEKxZdHv.js","/assets/save-a35lUQME.js","/assets/scopeLinks-9QhrJSJ-.js","/assets/scroll-text-Bt-kgpX4.js","/assets/search-x-VOZ5BPJg.js","/assets/segments-1rRpdzaf.js","/assets/send-BFpaoPN-.js","/assets/settings-2-B7gYUspF.js","/assets/shield-Dgv-rEhQ.js","/assets/shield-alert-Dh9y6-pT.js","/assets/shield-question-mark-B1_rOW7K.js","/assets/siren-DuYH6KtG.js","/assets/snowflake-CV2tWk4v.js","/assets/split-Csl_yqDr.js","/assets/square-check-big-CfInkxLw.js","/assets/star-C1z9s-c3.js","/assets/statusBands-CYreezmd.js","/assets/store-DpVZTcQq.js","/assets/table-2-DoOLhVtD.js","/assets/table-properties-CvmqEXYs.js","/assets/tag-CwifDc26.js","/assets/timer-off-DvF11PM6.js","/assets/trending-down-C1fYGEH6.js","/assets/trending-up-DHNSDJUg.js","/assets/undo-2-Dg1hx_1E.js","/assets/useChartTheme-BE-c8Jsc.js","/assets/useElementWidth-DPUoPUKS.js","/assets/useIsMobile-Bt4wH0AX.js","/assets/useOpenParam-BmHPf3o_.js","/assets/useStatusBands-DMjuia4P.js","/assets/useUrlScope-CIIZnfoa.js","/assets/user-KiX-llBf.js","/assets/user-cog-BRDKtSvl.js","/assets/users-Bj7e-2zP.js","/assets/vfx-CkZbpiGA.js","/assets/video-D_0p_PMS.js","/assets/wallet-B4cmsJdr.js","/assets/warehouse-Bkd574A6.js","/assets/workflow-CrnPhSMu.js","/assets/x-DtHlV3ix.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
