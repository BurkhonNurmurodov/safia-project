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

const BUILD = "2026-10-20T09:31:56.930Z";
const PRECACHE = ["/","/assets/AdminPanel-D5d63snE.js","/assets/AnalysisBoard-ujOI39uO.js","/assets/Arc-0EYLy43_.js","/assets/Assistant-Nabih0sw.js","/assets/BrigadirProfile-B7MdaZT2.js","/assets/BroadcastReceivers-6-gy1HKh.js","/assets/BroadcastRecord-B2kSl_eg.js","/assets/Button-DX4IbepK.js","/assets/CatLockNotice-bbkuySNI.js","/assets/CategoryLegendModal-DV8Ibf4k.js","/assets/CellConcerns-DZC94E0n.js","/assets/CellDetails-Cu_DCIBt.js","/assets/CellFormModal-DYSQBqYB.js","/assets/CellIdent-zn_kbom6.js","/assets/CellLink-QIKyw077.js","/assets/Cells-D5fN1n8R.js","/assets/ColumnFilter-CeEUW1Uk.js","/assets/ColumnsPicker-CPSVbBzj.js","/assets/CommentsModal-DmagK7n8.js","/assets/ComparisonTable-BsoYYohp.js","/assets/Concerns-DnD1-mhp.js","/assets/CountStepper-D1UCtN4b.js","/assets/Daily-DjPeAvps.js","/assets/DataTable-Bq4q4O4Q.js","/assets/DateRangePicker-CceSGZcD.js","/assets/DayReportView-DdYNHmDs.js","/assets/DayStepper-BP4H9sgJ.js","/assets/DayStrip-B8C4MrSS.js","/assets/DifferenceBreakdown-BvVdowc8.js","/assets/Downtime-BiK_T8aT.js","/assets/Education-XvreoBWq.js","/assets/EducationLesson-H4dbKWa1.js","/assets/EmptyState-Bxnn-UyX.js","/assets/Exam-gZCZhy8T.js","/assets/FactorySelect-kjpJtGlU.js","/assets/Gamification-DTwkpUO2.js","/assets/GroupBadge-DJ46EB3y.js","/assets/HeatmapChart-BH9rrUm8.js","/assets/IdleCell-DrDdsLXo.js","/assets/KPICard-CrcBBPcr.js","/assets/Kaizen-DwYBgzN2.js","/assets/Kelish-BDXZu2P-.js","/assets/KpiDeltaCard-DZPQwcft.js","/assets/LangTextInput-CRJ27knu.js","/assets/Layout-Cif2qQcv.js","/assets/LeaderAppeal-C09f4Yx0.js","/assets/LeaderDayReport-DfVhU2GP.js","/assets/LeaderUnitReport-QKfsOJHU.js","/assets/Leaderboard-9N2NvjQC.js","/assets/Leaders-CSIDGM6D.js","/assets/LeadersKpi-iT9BuTWt.js","/assets/Lightbox-B77y_M88.js","/assets/LiveOverview-DxWuDymM.js","/assets/Login-B1ZNcJ5C.js","/assets/NotFound-b2ELsoDJ.js","/assets/Notifications-nsLhuxdX.js","/assets/Ontime-D5qzRdvb.js","/assets/Overview-DEZoh7tb.js","/assets/Pagination-DH-Vq4S2.js","/assets/PerenaladkaFactTable-hF5l73Id.js","/assets/PersonCard-CHG50G9i.js","/assets/PlanFulfillment-CYzinU7o.js","/assets/Production-Cv_-G10w.js","/assets/Profile-QdnWXX6z.js","/assets/ProofCamera-BW7PJXSU.js","/assets/ProofPhoto-Cn7H5wdK.js","/assets/Quality-vaLIErPT.js","/assets/RawRows-BAAjB9jr.js","/assets/RequestStateChip-CvMU_E6Z.js","/assets/RichTextEditor-ClVsbJcK.js","/assets/SaveState-DvgeaeI0.js","/assets/SearchInput-E_D08s5W.js","/assets/SeasonalityHeatmap-DcTKuzwS.js","/assets/SegmentedToggle-C9V8qz1z.js","/assets/SetupTimes-Bclq5qG8.js","/assets/ShiftDaily-Dj-75Ss7.js","/assets/Staff-CtNbxkrj.js","/assets/StaffListAtCheck-BIgaqJbL.js","/assets/StatusBadge-DZnLK54N.js","/assets/StatusBandsModal-DgPnf5i-.js","/assets/TargetGoal-CQeMig5N.js","/assets/Targets-DTKyr5n8.js","/assets/Tasks-DelgjZ4s.js","/assets/TimeWheelPicker-BhleWU1w.js","/assets/Toast-yIXkLQLe.js","/assets/Tooltip-DZYFhnxG.js","/assets/TrendChart-D54YlGc6.js","/assets/TripleSpeedometer-Dheqc-qP.js","/assets/Trudoyomkost-DM8Ylc7u.js","/assets/UploadDropzone-6AOaN7Ij.js","/assets/UsersActivity-Dp1lD0HF.js","/assets/VerdictBlock-Dn7VU0eE.js","/assets/VfxApiMap-OSMWAt-g.js","/assets/VfxDictionaries-M_l9qs3Z.js","/assets/VfxEmployees-CBA-3mdd.js","/assets/VfxHrMoves-BPJz0aDZ.js","/assets/VfxJobs-CQNz1ACS.js","/assets/VfxPhoto-C8oSPIuz.js","/assets/VfxShifts-BuLglNli.js","/assets/VfxState-YNJn-2WL.js","/assets/VfxTimebooks-CZqgqezo.js","/assets/VfxTimesheet-N5IYb0dl.js","/assets/WatchProgress-C3Fp-g0V.js","/assets/WebLogin-yGNFYK-L.js","/assets/Workers-B6tsN6Ws.js","/assets/Zagruzka-D-Y1i1VX.js","/assets/ZagruzkaCell-CCxs56j0.js","/assets/api-Za_oGKJh.js","/assets/archive-BJtoaRwS.js","/assets/archive-restore-GQ01oGNE.js","/assets/arrow-down-DEGOlP4O.js","/assets/arrow-down-right-CzdHX-Gh.js","/assets/arrow-down-wide-narrow-VtRTZ6t7.js","/assets/arrow-up-narrow-wide-bOtm33Uf.js","/assets/ban-DL3vf6DS.js","/assets/boxes-Cdrepbtf.js","/assets/braces-e5RJxeIU.js","/assets/brigadirFilters-D9avWh3f.js","/assets/broadcastTree-DI47X-TX.js","/assets/building-2-CI0xc5vk.js","/assets/calendar-DSzZKRby.js","/assets/calendar-days-DST_lUIE.js","/assets/camera-CQOEZxHC.js","/assets/categories-0BDvDIek.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C10HBzjA.js","/assets/chart-line-CKrPWhUd.js","/assets/chart-pie-CwEMU2Fv.js","/assets/chartRange-VG-f0EPS.js","/assets/check-check-DYIOiVtc.js","/assets/chevron-left-BvlXXYlA.js","/assets/chevrons-up-down-BqT9owPl.js","/assets/circle-alert-B92reZ3d.js","/assets/circle-check-big-BNbSkwuy.js","/assets/circle-dashed-CW9HEnsy.js","/assets/circle-minus-DCi5UW40.js","/assets/circle-question-mark-DpaXUptn.js","/assets/circle-slash-u-iJkJi2.js","/assets/circle-user-round-DLjq1d9V.js","/assets/circle-vo9q9Ebo.js","/assets/cloud-off-poSHFaLm.js","/assets/cloud-upload-VR2avRnI.js","/assets/compass-Dk8UIOB2.js","/assets/concernCategories-BB7Uqpqj.js","/assets/corner-down-right-0Jcqu4EH.js","/assets/createLucideIcon-D6bLhJ0H.js","/assets/es-TcVVad7L.js","/assets/external-link-DRNxKOSj.js","/assets/file-clock-DJN5yr44.js","/assets/file-exclamation-point-BXV-d_cg.js","/assets/flag-BN4amAr1.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CwX7Qgxt.js","/assets/funnel-CnMgAnkP.js","/assets/hash-DqhLXk40.js","/assets/hourglass-DvR6_NnI.js","/assets/image-BEhNNsnU.js","/assets/image-off-Dv_nEibI.js","/assets/inbox-CN59G_Xi.js","/assets/index-DLT_vDJq.css","/assets/index-DZWoBMzu.js","/assets/keyboard-DDMDYezx.js","/assets/languages-Dq0oLBtq.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CM9NVyUF.js","/assets/lightbulb-NnS5UXRt.js","/assets/link-2-Bm2zpiXa.js","/assets/link-2-off-DAcIy_9E.js","/assets/list-ordered-DylGgMKC.js","/assets/list-tree-DFKxwLPv.js","/assets/lock-open-55uWsa_f.js","/assets/log-in-B6MUjaow.js","/assets/marks-D1s4aQVV.js","/assets/minimize-2-CUY87mHP.js","/assets/package-check-BXXhWWt6.js","/assets/pencil-DJ-xW69z.js","/assets/percent-xRmrKTJ6.js","/assets/pin-BUCWhNou.js","/assets/pin-off-C7NAW8ye.js","/assets/play-BFz6Yvhj.js","/assets/plug-zap-DAe8qwM8.js","/assets/prop-types-gfp5fQxZ.js","/assets/radio-Cj-VydPx.js","/assets/react-apexcharts.esm-hNvIxEPv.js","/assets/registers-BBof0vdm.js","/assets/repeat-DjUP1kFU.js","/assets/save-BPdCDP6U.js","/assets/scopeLinks-Bhf26WOs.js","/assets/scroll-text-DQzK2AfX.js","/assets/search-x-B0qCC5Wl.js","/assets/segments-BnZ0sZ3r.js","/assets/send-im5DVqHQ.js","/assets/settings-2-B4AxkCHB.js","/assets/shield-DC8mxBbX.js","/assets/shield-alert-CIedbLhV.js","/assets/shield-question-mark-DLc68OE7.js","/assets/sigma-CFQwplKB.js","/assets/siren-D8YBBCTj.js","/assets/snowflake-DvZn7NtS.js","/assets/split-CHVk8TGb.js","/assets/square-check-big-Bo3u-wNB.js","/assets/star-BnLn-3_y.js","/assets/statusBands-CEisDKDQ.js","/assets/store-BHZo9tJf.js","/assets/table-2-Cedp_imu.js","/assets/table-properties-D1j1l2kX.js","/assets/tag-CjRpWAgB.js","/assets/timer-off-C3CqP4AY.js","/assets/trending-down-BpkXt4oo.js","/assets/trending-up-DMBDoPgb.js","/assets/undo-2-CVuD-xzQ.js","/assets/useChartTheme-B54x8Gzq.js","/assets/useElementWidth-DSGdqEA2.js","/assets/useIsMobile-DF4y3Swt.js","/assets/useOpenParam-DAmNCd6E.js","/assets/useStatusBands-DH11Mdfl.js","/assets/useUrlScope-Cbia4D05.js","/assets/user-Bp1_N0TA.js","/assets/user-cog-BevJHjJ6.js","/assets/user-minus-BrUtC7GR.js","/assets/users-NjgR-CPV.js","/assets/vfx-Qb_QUxoR.js","/assets/video-B2VbsAah.js","/assets/wallet-CDbxQRhg.js","/assets/warehouse-BB2TOgNg.js","/assets/workflow-D6uuU99p.js","/assets/x-DMeNzwvT.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
