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

const BUILD = "2026-10-06T16:02:52.293Z";
const PRECACHE = ["/","/assets/AdminPanel-DJ-4SUpJ.js","/assets/AnalysisBoard-M6N2fAv4.js","/assets/Arc-CVqs-M9d.js","/assets/Assistant-CG7-IgeU.js","/assets/BrigadirProfile-CEdRWpPr.js","/assets/BroadcastReceivers-BVaEFAXx.js","/assets/BroadcastRecord-COgpLVgz.js","/assets/Button-DDZ8QfSD.js","/assets/CatLockNotice-CqYfDpjy.js","/assets/CategoryLegendModal-dVsjw5n2.js","/assets/CellConcerns-ef0Nm1LZ.js","/assets/CellDetails-CnM-IAG-.js","/assets/CellFormModal-C8IpzBTv.js","/assets/CellIdent-DDDC9yDK.js","/assets/CellLink-D5X86CH2.js","/assets/Cells-C8GqLLQ-.js","/assets/ColumnFilter-DcghetBJ.js","/assets/ColumnsPicker-ELe7fqCq.js","/assets/CommentsModal-93z6yJ8w.js","/assets/ComparisonTable-CSehQU6y.js","/assets/Concerns-p06ezkCI.js","/assets/Daily-Eies6OJw.js","/assets/DataTable-EnuKTWbM.js","/assets/DateRangePicker-D7AueFe6.js","/assets/DayReportView-Dok9h4O2.js","/assets/DayStepper-DiRMXdDs.js","/assets/DifferenceBreakdown-DC_5x1DQ.js","/assets/Downtime-C1fbHIfu.js","/assets/Education-1CIP9ovW.js","/assets/EducationLesson-CASLFe5g.js","/assets/EmptyState-CiFTJJQJ.js","/assets/Exam-Yq6-sfj_.js","/assets/FactorySelect-DE7zBqpU.js","/assets/Gamification-CK9QjLjg.js","/assets/GroupBadge-1LMvIKhr.js","/assets/HeatmapChart-C-fMQ253.js","/assets/IdleCell-D6O9TcRA.js","/assets/KPICard-BE67y4gU.js","/assets/Kaizen-D4Y3xqcw.js","/assets/Kelish-DMYgOmsY.js","/assets/KpiDeltaCard-DbgiiQCq.js","/assets/LangTextInput-CuiP3FZb.js","/assets/Layout-BFqxDLwS.js","/assets/LeaderAppeal-CPiP-x94.js","/assets/LeaderDayReport-D4Z1tt8D.js","/assets/LeaderUnitReport-CviE5AY4.js","/assets/Leaderboard-CsP3pN74.js","/assets/Leaders-BoByBBaK.js","/assets/Lightbox-Bs8BgM0v.js","/assets/LiveOverview-Cd2qFfcG.js","/assets/Login-ByuC0zSu.js","/assets/NotFound-BNkDVnX8.js","/assets/Notifications-D-6ZgfQz.js","/assets/Overview-C2-iyr9V.js","/assets/Pagination-C3A_VGBa.js","/assets/PerenaladkaFactTable-CnJvy_hs.js","/assets/PersonCard-M8Bh4djv.js","/assets/PlanFulfillment-Co9ED1zk.js","/assets/Production-BIXpIrBa.js","/assets/Profile-C3GDX_e9.js","/assets/ProofCamera-4VeeJYGs.js","/assets/ProofPhoto-BdZdmvLP.js","/assets/Quality-Bmu4BquT.js","/assets/RawRows-DorU_CQj.js","/assets/RequestStateChip-BJ0sup9Z.js","/assets/RichTextEditor-Bc6DMyIJ.js","/assets/SaveState-DWmHiOMM.js","/assets/SearchInput-CC-u_vh0.js","/assets/SeasonalityHeatmap-6YBWFINS.js","/assets/SegmentedToggle-DBtckXtd.js","/assets/SetupTimes-N_IHZSFn.js","/assets/ShiftDaily-BBxI7yEf.js","/assets/Staff-Cgvl27IP.js","/assets/StaffLive-JTf1GwfO.js","/assets/StatusBadge-Bg4P-HOP.js","/assets/TargetGoal-f6oPgwQD.js","/assets/Targets-C7NFC_Ta.js","/assets/Tasks-Daobb_sq.js","/assets/TimeWheelPicker-BsbBBF4g.js","/assets/Toast-BIE34-3n.js","/assets/Tooltip-fHY_9-bs.js","/assets/TrendChart-Dt1xcboV.js","/assets/TripleSpeedometer-BwGnZK3P.js","/assets/Trudoyomkost-CngumPAB.js","/assets/Turnover-CL0g4RYR.js","/assets/UploadDropzone-Cw167hGa.js","/assets/UsersActivity-LpRwEtMo.js","/assets/VerdictBlock-Vjr3EILq.js","/assets/VfxApiMap-DFDg48Hb.js","/assets/VfxDictionaries-e1JJ98lb.js","/assets/VfxEmployees-BIIrwkdY.js","/assets/VfxHrMoves-CuAXo4h_.js","/assets/VfxJobs-hdF-s7ZS.js","/assets/VfxPhoto-Bl7gX-j4.js","/assets/VfxShifts-BhKXEvDh.js","/assets/VfxState-DOlAGGeO.js","/assets/VfxTimebooks-Bk2_kYmP.js","/assets/VfxTimesheet-DCFnTpGp.js","/assets/WatchProgress-f6eQD69U.js","/assets/WebLogin-yL34TMAm.js","/assets/WorkerConcerns-8P6ibkSB.js","/assets/Workers-CwTX45xV.js","/assets/Zagruzka-BacdI875.js","/assets/ZagruzkaCell-C9TpXXRZ.js","/assets/api-XHxl1Chl.js","/assets/archive-D6vZ_cDM.js","/assets/archive-restore-B80ihoW0.js","/assets/arrow-down-BNpi4k7i.js","/assets/arrow-up-narrow-wide-DWGggL94.js","/assets/award-BM_5hGhp.js","/assets/ban-CF0i8m8S.js","/assets/boxes-D--NhiwF.js","/assets/braces-DM-SdwH4.js","/assets/brigadirFilters-CGEBPdNL.js","/assets/broadcastTree-BfdvVszH.js","/assets/building-2-Do0UUl9B.js","/assets/calculator-BsZ8LRCn.js","/assets/calendar-CtKjkXkC.js","/assets/calendar-days-CnHRS761.js","/assets/camera-tUQAfTcd.js","/assets/categories-BOax98vU.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DnF13NMM.js","/assets/chart-line-BOMHjPWc.js","/assets/chart-pie-C04TOyln.js","/assets/chartRange-DU8k2ON2.js","/assets/check-check-D6QFNy1o.js","/assets/chevron-left-zM2yI_cP.js","/assets/chevrons-up-down-Bs4OCuaw.js","/assets/circle-LdtPW-cB.js","/assets/circle-alert-CpO_j9ii.js","/assets/circle-check-big-yHHiKGTx.js","/assets/circle-dashed-BCMko1kq.js","/assets/circle-minus-ozuBONOS.js","/assets/circle-question-mark-CC2xD3zc.js","/assets/circle-slash-DIZQ3qqC.js","/assets/circle-user-round-CoHU2cw9.js","/assets/clock-3-D2Nm1hcv.js","/assets/cloud-off-JaT-q8yq.js","/assets/cloud-upload-CTG9mH4o.js","/assets/compass-D1TrWQQ6.js","/assets/concernCategories-DPVY_xbU.js","/assets/copy-BemWZHkO.js","/assets/corner-down-right-BjO_bVf4.js","/assets/createLucideIcon-CbkZDDZW.js","/assets/es-D-SOUuMX.js","/assets/external-link-Cza2y7Xm.js","/assets/file-clock-BwsjBbuT.js","/assets/file-exclamation-point-oyCQdhIc.js","/assets/flag-GSFWJYBu.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BiJWE612.js","/assets/hash-BNT87byH.js","/assets/hourglass-DiptxwpE.js","/assets/image-DIyfGRRF.js","/assets/image-off-CqZnZKo_.js","/assets/inbox-CmfnKI3q.js","/assets/index-BKM2gJ54.css","/assets/index-xOqIudz3.js","/assets/keyboard-5Eb6h0XI.js","/assets/languages-COHITfyR.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-UV0H7O9E.js","/assets/lightbulb-DP_wUJVY.js","/assets/link-2-CUZXluf6.js","/assets/link-2-off-bcJSX0nz.js","/assets/list-ordered-Ap3DslCr.js","/assets/list-tree-SSbIHMvG.js","/assets/lock-open-htUo5NO-.js","/assets/log-in-DzQI0yjf.js","/assets/minimize-2-BQ_zf6Dy.js","/assets/package-check-Bo9p70RV.js","/assets/pencil-BDkUO-XT.js","/assets/percent-Bcq_mBjZ.js","/assets/pin-B5dL7OK_.js","/assets/pin-off-uDuxFnmK.js","/assets/play-DpPdDSjq.js","/assets/plug-zap-D3R1l58s.js","/assets/prop-types-jvBz3hL7.js","/assets/react-apexcharts.esm-C37UINHe.js","/assets/registers-BDNRHWHc.js","/assets/repeat-CHMYvINF.js","/assets/rotate-cw-DwOmtoK8.js","/assets/save-DnRc8s4W.js","/assets/scopeLinks-CggpfB_m.js","/assets/scroll-text-BVJ4wj8F.js","/assets/search-x-Cjc-m2KS.js","/assets/segments-BGiyavmf.js","/assets/send-BMu3GcOD.js","/assets/settings-2-DFGjKtKQ.js","/assets/shield-BsHcQgPj.js","/assets/shield-alert-CFdgnXrb.js","/assets/shield-question-mark-H15YguCL.js","/assets/siren-BrrNHd9P.js","/assets/snowflake-DWEdIqMy.js","/assets/split-CFQDxxAh.js","/assets/square-check-big-BdF6FklF.js","/assets/star-BnVrTv93.js","/assets/statusBands-NBdJVgko.js","/assets/store-CjkSPQwy.js","/assets/table-2-BF_bzXyT.js","/assets/table-properties-B-HNlv9G.js","/assets/tag-D8Ol1ea4.js","/assets/timer-off-Dc9B_-0N.js","/assets/trending-down-D2CjSHMi.js","/assets/trending-up-B0lvRpDD.js","/assets/undo-2-CrFY3K53.js","/assets/useChartTheme-kSWqI2yg.js","/assets/useElementWidth-DSQMascr.js","/assets/useIsMobile-AFBEsEv7.js","/assets/useOpenParam-DPCQ6Umk.js","/assets/useStatusBands-PxDPLtje.js","/assets/useUrlScope-CmR-b0YX.js","/assets/user-CMoIDZba.js","/assets/user-cog-DpLj_-Oc.js","/assets/users-CCz1jNlI.js","/assets/vfx-DUbKFEjZ.js","/assets/video-DNoDmY9i.js","/assets/wallet-Bqh0a_te.js","/assets/warehouse-CWx5s7Rb.js","/assets/x-Cw9GYo7j.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
