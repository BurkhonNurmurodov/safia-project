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

const BUILD = "2026-09-28T15:38:22.985Z";
const PRECACHE = ["/","/assets/AdminPanel-C3BAL9dO.js","/assets/AnalysisBoard-Dc9pZnrT.js","/assets/Arc-v6MGmh3A.js","/assets/ArcLegacy-Dr1rAH2I.js","/assets/AttendanceModal-BFxTR7hQ.js","/assets/BrigadirProfile-CRBAuHy0.js","/assets/BroadcastReceivers-BT8EdStl.js","/assets/BroadcastRecord-DtF4pqQz.js","/assets/CatLockNotice-BrRS3LiM.js","/assets/CategoryLegendModal-BV6-Mn6Q.js","/assets/CellConcerns-C_ntLD_5.js","/assets/CellDetails-BX1uIUnG.js","/assets/CellFormModal-DKVgjkRL.js","/assets/CellLink-Dd87OzCM.js","/assets/Cells-D98kfYtY.js","/assets/ColumnFilter-D9pX2jM7.js","/assets/ColumnsPicker-BQJtBg3P.js","/assets/CommentsModal-CcLrWK2K.js","/assets/ComparisonTable-CVtnRfHO.js","/assets/Concerns-D9wtifuR.js","/assets/ConfirmDialog-Bd_ew1aP.js","/assets/Daily-DnP74Jgw.js","/assets/DataTable-BxN-rIhC.js","/assets/DateRangePicker-CXQj4E-3.js","/assets/DayReportView-Di5F8uVy.js","/assets/DayStepper-oG-8YDRG.js","/assets/DifferenceBreakdown-DqE3RvXH.js","/assets/Downtime-Rljb0PUz.js","/assets/Education-BhFuiyqS.js","/assets/EducationLesson-BJ1g47mh.js","/assets/EmptyState-D8-WfQEm.js","/assets/Exam-BTBrkdpp.js","/assets/FactorySelect-YMkTJekh.js","/assets/Gamification-CQDT_aNU.js","/assets/GroupBadge-B6N-I_su.js","/assets/HeatmapChart-BRGqp4BE.js","/assets/IdleCell-VMidb-sX.js","/assets/KPICard-HlK767E4.js","/assets/Kaizen-DVD11Wcf.js","/assets/Kelish-Bo5ZxtZ0.js","/assets/KpiDeltaCard-GUWP1iGO.js","/assets/LangTextInput-DH9Nj-bO.js","/assets/Layout-Ch_HaWAH.js","/assets/LeaderAppeal-Bc2PGAMw.js","/assets/LeaderDayReport-BmAYcDuj.js","/assets/LeaderUnitReport-Cl8sdvI3.js","/assets/Leaderboard-kP6WS8y2.js","/assets/Leaders-8nXSFDSB.js","/assets/Lightbox-DhCNkXiP.js","/assets/LiveOverview-ByoO_AkF.js","/assets/Login-BTzM2ouy.js","/assets/NotFound-Bnjfr69p.js","/assets/Overview-CxwzSDH6.js","/assets/Pagination-CJmpSV9W.js","/assets/PerenaladkaFactTable-DK_yYlUo.js","/assets/PlanFulfillment-DBDiZkgj.js","/assets/Production-DJJbeiJt.js","/assets/Profile-CC7mZL-t.js","/assets/ProofCamera-BEKDjS0D.js","/assets/ProofPhoto-BPp2UvAz.js","/assets/Quality-CO9m2kev.js","/assets/RequestStateChip-CZ52zRj0.js","/assets/RichTextEditor-DtAgyqcU.js","/assets/SaveState-Bz-5lwOy.js","/assets/SearchInput-CPLYmCjE.js","/assets/SeasonalityHeatmap-DRz7owKo.js","/assets/SegmentedToggle-CTeGjZ9u.js","/assets/SetupTimes-BfmNQh_l.js","/assets/ShiftDaily-BKeEjnsA.js","/assets/Staff-Dvm3RiGP.js","/assets/StatusBadge-DdIMuKNp.js","/assets/TargetGoal-CeqlHk6m.js","/assets/Targets-CngpyGD8.js","/assets/Tasks-DZKPvHU0.js","/assets/TimeWheelPicker-DiC16Nwg.js","/assets/Tooltip-GpZhoDR1.js","/assets/TrendChart-BInJlfxG.js","/assets/TripleSpeedometer-3GTdMGuB.js","/assets/Trudoyomkost-BPdX4eIA.js","/assets/UploadDropzone-BcxKjjNX.js","/assets/UsersActivity-Kn7C2gLD.js","/assets/VerdictBlock-B7VdM-4U.js","/assets/WatchProgress-BSYTmE2n.js","/assets/WebLogin-DhIISJxX.js","/assets/WorkerConcerns-p1nQ6JtK.js","/assets/Workers-DkwQotov.js","/assets/Zagruzka-DREN3ju6.js","/assets/ZagruzkaCell-DNjTYDop.js","/assets/api-BgxVxIBi.js","/assets/archive-CsvvRldR.js","/assets/archive-restore-CG8Hq-it.js","/assets/arrow-down-CogPrZhs.js","/assets/arrow-left-BvoSW01a.js","/assets/arrow-left-right-CI1FhpS_.js","/assets/arrow-up-CHHAtGvT.js","/assets/arrow-up-right-CyhEhjS6.js","/assets/award-CY20EU2n.js","/assets/ban-SerONVMe.js","/assets/bot-eax5ASW4.js","/assets/boxes-Dpgi9Eja.js","/assets/brigadirFilters-CfGgQa08.js","/assets/broadcastTree-B2eSSjM5.js","/assets/building-2-BnJONHMa.js","/assets/calendar-Curm7RGe.js","/assets/calendar-clock-DKiCgbgp.js","/assets/calendar-days-o33i4xsD.js","/assets/calendar-range-2S43zYrM.js","/assets/camera-DcsnUD77.js","/assets/categories-DGoBq6tX.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cdv-n4zI.js","/assets/chart-line-82my8V9e.js","/assets/chart-pie-JJvuS4Yt.js","/assets/chartRange-wlS0qwKT.js","/assets/chevron-left-m6vzsj9c.js","/assets/chevrons-up-down-BAI-VedA.js","/assets/circle-Z-xAdAZD.js","/assets/circle-check-big--80pMprX.js","/assets/circle-dot-BZJ8wpUY.js","/assets/circle-minus-CkYmbOeA.js","/assets/circle-slash-CY-pSYrq.js","/assets/circle-user-round-CMbW6jQ_.js","/assets/cloud-off-Cvk5Qvka.js","/assets/cloud-upload-hLLfa2__.js","/assets/compass-C-U5H_Mp.js","/assets/concernCategories-hvMZ_BLn.js","/assets/copy-KPMm0zG2.js","/assets/corner-down-right-ONZ7wUpe.js","/assets/createLucideIcon-zoB0bWKP.js","/assets/es-DbllNXZu.js","/assets/exportXlsx-DpIa_tuj.js","/assets/external-link-CoLXVsyt.js","/assets/file-clock-E_mADIDy.js","/assets/file-exclamation-point-BdKvgUKy.js","/assets/file-spreadsheet-xbr_2zjk.js","/assets/file-text-D9QIzKwb.js","/assets/flag-Coun4nRc.js","/assets/flame-DHvazp0K.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BWReofvL.js","/assets/hash-CjJSSDAs.js","/assets/history-DBSzzqrv.js","/assets/hourglass-BxhbV6yq.js","/assets/image-CavRPOv9.js","/assets/image-off-C2g90SDH.js","/assets/index-BNtiCJHt.js","/assets/index-CamagMPV.css","/assets/key-round-DtSSQ530.js","/assets/keyboard-DkcY9x-V.js","/assets/languages-COTYB-pN.js","/assets/layers-D5D9Z_yo.js","/assets/lightbulb-C_s1gVGb.js","/assets/link-2-CDnKGURm.js","/assets/list-checks-ByXhihL0.js","/assets/list-ordered-CB-MY-2l.js","/assets/list-tree-DJwQjdcM.js","/assets/lock-open-BgMDpzhJ.js","/assets/log-in-C5_jWJ8z.js","/assets/message-square-Bl22EDtL.js","/assets/minimize-2-BoDqWYdq.js","/assets/package-check-ChxLkoHr.js","/assets/paperclip-CgDrUv3K.js","/assets/pencil-1TZRFdWa.js","/assets/percent-ailGd4ir.js","/assets/personName-B4KId4zS.js","/assets/pin-BdQpaDl_.js","/assets/pin-off-0evbkstp.js","/assets/play-ItX6I0fu.js","/assets/presentation-H7s7BIKq.js","/assets/prop-types-Dyn2XvOR.js","/assets/radio-DF2W5-oU.js","/assets/react-apexcharts.esm-CXv8wRHc.js","/assets/repeat-DclbOmA_.js","/assets/rotate-ccw-BJ4RKuqi.js","/assets/rotate-cw-Dmo8YfNo.js","/assets/save-C5ZNIy7d.js","/assets/scale-DeH1VOPb.js","/assets/scroll-text-jkQqF-oS.js","/assets/search-x-BKsGI7s_.js","/assets/segments-DrdeGXQu.js","/assets/send-CwNaLxD2.js","/assets/settings-2-DDVhPUnb.js","/assets/shield-3Ko9cWcf.js","/assets/shield-alert-C7VzzkkP.js","/assets/shield-check-Dw1MY90u.js","/assets/shield-question-mark-dP1w5iR-.js","/assets/siren-DsaUna9M.js","/assets/smartphone-DkzeuARw.js","/assets/snowflake-DrYX9sXH.js","/assets/square-C1jNA4Ge.js","/assets/square-check-big-CcFyMr6x.js","/assets/star-D78jM3MU.js","/assets/statusBands-DEhn81gr.js","/assets/store-BjMFmy1e.js","/assets/table-2-CCp2La67.js","/assets/tag-CKEEXEOa.js","/assets/timer-off-sA4NfVGp.js","/assets/trending-down-wLGj_yYY.js","/assets/trending-up-Ux3B936l.js","/assets/undo-2-DTpsjO-X.js","/assets/useChartTheme-CCIwFf9E.js","/assets/useElementWidth-B7gci3PY.js","/assets/useIsMobile-B9CB-UVi.js","/assets/useMutation-BqqPv_RE.js","/assets/useStatusBands-CtjmfRfl.js","/assets/user-C8byVQXi.js","/assets/user-cog-DlIC5EyW.js","/assets/user-minus-DC9iI05w.js","/assets/users-BpfiW11d.js","/assets/video-C1MH4RRV.js","/assets/wallet-CxPmAjl7.js","/assets/warehouse-4VauPcpJ.js","/assets/zap-C7nu1RXh.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
