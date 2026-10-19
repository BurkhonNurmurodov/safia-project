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

const BUILD = "2026-10-19T07:38:08.239Z";
const PRECACHE = ["/","/assets/AdminPanel-BHrZ7d2S.js","/assets/AnalysisBoard-CQSv1YWz.js","/assets/Arc-B4W0RmZf.js","/assets/Assistant-DVbPrdZR.js","/assets/BrigadirProfile-BzltGSdX.js","/assets/BroadcastReceivers-CDGl7W4h.js","/assets/BroadcastRecord-M4YSpQv9.js","/assets/Button-FrOnrmJD.js","/assets/CatLockNotice-QGRmDTKw.js","/assets/CategoryLegendModal-DC5IT_Io.js","/assets/CellConcerns-Dpd7IaeK.js","/assets/CellDetails-0PNSIUDc.js","/assets/CellFormModal-C-ekSur-.js","/assets/CellIdent-Df3z9CgP.js","/assets/CellLink-XSunnmRJ.js","/assets/Cells-BK-3ex9J.js","/assets/ColumnFilter-CfkabU6t.js","/assets/ColumnsPicker-D5L8tTZt.js","/assets/CommentsModal-tmCrLtwR.js","/assets/ComparisonTable-CbFpNr3k.js","/assets/Concerns-D9VCZGlz.js","/assets/CountStepper-B00XdUvv.js","/assets/Daily-D9bc3hmk.js","/assets/DataTable-wKXCDS3x.js","/assets/DateRangePicker-BP8c6KyS.js","/assets/DayReportView-C-CYyVIC.js","/assets/DayStepper-cqkByasc.js","/assets/DifferenceBreakdown-BIgtHRS9.js","/assets/Downtime-0OkCOqrX.js","/assets/Education-C0jMwjrA.js","/assets/EducationLesson-DEL1srkN.js","/assets/EmptyState-B4j72Sf8.js","/assets/Exam-DzXcVb9M.js","/assets/FactorySelect-BLgjFEUq.js","/assets/Gamification-CivpdKf5.js","/assets/GroupBadge-Bl5RrYQI.js","/assets/HeatmapChart-C5ObM5p8.js","/assets/IdleCell-Dz-kFpHI.js","/assets/KPICard-DZ9d6wVV.js","/assets/Kaizen-tg3-GUvG.js","/assets/Kelish-CCvn-OE3.js","/assets/KpiDeltaCard-BgGhxs46.js","/assets/LangTextInput-3qyCCELO.js","/assets/Layout-DZ_NCfGB.js","/assets/LeaderAppeal-Jrhcfjm4.js","/assets/LeaderDayReport-C2bq3eQU.js","/assets/LeaderUnitReport-C-WxJnbV.js","/assets/Leaderboard-QbZFPO7n.js","/assets/Leaders-CifSDXgs.js","/assets/LeadersKpi-DxZjYktT.js","/assets/Lightbox-xliwF9fE.js","/assets/LiveOverview-BPOpRZmN.js","/assets/Login-LG2Q_Iu3.js","/assets/NotFound-BzWNxBSl.js","/assets/Notifications-C73RA6dB.js","/assets/Overview-Ddei8RJv.js","/assets/Pagination-Cb_g2lO7.js","/assets/PerenaladkaFactTable-B9zmlRZp.js","/assets/PersonCard-UcFip6L6.js","/assets/PlanFulfillment-CgG4wg-k.js","/assets/Production-CbF7qE3Q.js","/assets/Profile-D2FFPEPD.js","/assets/ProofCamera-DP7LH-ZO.js","/assets/ProofPhoto-BgeKcm-I.js","/assets/Quality-BBxYu48f.js","/assets/RawRows-DzmXIQtv.js","/assets/RequestStateChip-pnExlCxW.js","/assets/RichTextEditor-CgwBiRB6.js","/assets/SaveState-V4EKdo5f.js","/assets/SearchInput-CO4ClKRN.js","/assets/SeasonalityHeatmap-DYbPR9Cg.js","/assets/SegmentedToggle-n_ntoIdG.js","/assets/SetupTimes-Cecp28tu.js","/assets/ShiftDaily-DwJqRQcp.js","/assets/Staff-BQfW4VZp.js","/assets/StaffListAtCheck-CjI27YYD.js","/assets/StatusBadge-CS1iR8JL.js","/assets/TargetGoal-BB_kOPjs.js","/assets/Targets-Bbz38Y9R.js","/assets/Tasks-DuRFEtlC.js","/assets/TimeWheelPicker-DerEgR2_.js","/assets/Toast-Q8GjK8IZ.js","/assets/Tooltip-D8tyef5d.js","/assets/TrendChart-DAw2GsC4.js","/assets/TripleSpeedometer-B4C3uEqV.js","/assets/Trudoyomkost-Cr1kb9Pn.js","/assets/UploadDropzone-7ZLZXa6Q.js","/assets/UsersActivity-B_szp1yJ.js","/assets/VerdictBlock-DmjFAwJ1.js","/assets/VfxApiMap-CoadbpYw.js","/assets/VfxDictionaries-Cf2U69jt.js","/assets/VfxEmployees-ctgzsok3.js","/assets/VfxHrMoves-BLhEa5CS.js","/assets/VfxJobs-SBDMHiEo.js","/assets/VfxPhoto-CwK4pJNz.js","/assets/VfxShifts-TWRFz2ck.js","/assets/VfxState-DD_CUDUE.js","/assets/VfxTimebooks-BefDKTIa.js","/assets/VfxTimesheet-Dyr6Nxyf.js","/assets/WatchProgress-09OtUNlu.js","/assets/WebLogin-B9vGE00p.js","/assets/Workers-BJPhEV-h.js","/assets/Zagruzka-FxHoYhpG.js","/assets/ZagruzkaCell-WL-tOKIL.js","/assets/api-5qd1yEYu.js","/assets/archive-D9Hg-gJn.js","/assets/archive-restore-DHYp_sxs.js","/assets/arrow-down-CVFp-onb.js","/assets/arrow-down-wide-narrow-BWyENfvU.js","/assets/arrow-up-narrow-wide-DL1sQJk3.js","/assets/ban-DEn9nKE1.js","/assets/boxes-Cx2cYIYG.js","/assets/braces-CIjRnHUx.js","/assets/brigadirFilters-COyns2XO.js","/assets/broadcastTree-8_9T5Wqr.js","/assets/building-2-CfQ0_tAZ.js","/assets/calculator-BonK4RHZ.js","/assets/calendar-DZkRop-r.js","/assets/calendar-days--shXLY1o.js","/assets/camera-kmJ3eV7Z.js","/assets/categories-MT9mqrin.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-AXGZavJr.js","/assets/chart-line-CQOnmVp0.js","/assets/chart-pie-DiY4zMEL.js","/assets/chartRange-BNYadXqE.js","/assets/check-check-ClabmK2b.js","/assets/chevron-left-gq-ofOkZ.js","/assets/chevrons-up-down-DQbYhSva.js","/assets/circle-alert-C1sHao9r.js","/assets/circle-check-big-DibDg3NU.js","/assets/circle-dashed-pbRwrIt8.js","/assets/circle-minus-DAtxAWUF.js","/assets/circle-question-mark-DzU6PGOi.js","/assets/circle-slash-DShl2cpl.js","/assets/circle-user-round-oSfK0jQU.js","/assets/circle-xrq50I2W.js","/assets/cloud-off-vxh7B_CI.js","/assets/cloud-upload-Ce_fBm3a.js","/assets/compass-xrYi0yTr.js","/assets/concernCategories-CbY9tiUg.js","/assets/corner-down-right-Biq_VBpH.js","/assets/createLucideIcon-B_SUe8We.js","/assets/es-ZxfI1CXE.js","/assets/external-link-BHWHZgh6.js","/assets/file-clock-C5HvAx93.js","/assets/file-exclamation-point-Cg3bZC2m.js","/assets/flag-CZQU7Ej1.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BH4dgO_e.js","/assets/hash-vaI7VHb5.js","/assets/hourglass-FBWAyNGn.js","/assets/image-CHkOJkXJ.js","/assets/image-off-DSfJYu0P.js","/assets/inbox-BK9_Xz-W.js","/assets/index-BhzH19q6.css","/assets/index-pE8qsanm.js","/assets/keyboard-IQzQx6wo.js","/assets/languages-B4gz8WPr.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-dg7tcpT1.js","/assets/lightbulb-CtAkxouT.js","/assets/link-2-D6G521AM.js","/assets/link-2-off-CdOw0YQX.js","/assets/list-ordered-lXap4BDQ.js","/assets/list-tree-DzMhtHoA.js","/assets/lock-open-D1SRdfMc.js","/assets/log-in-hNgMCUI1.js","/assets/marks-CgPYaUH9.js","/assets/minimize-2-D8jXzqqM.js","/assets/package-check-ByPPslav.js","/assets/pencil-CE89pvmx.js","/assets/percent-Bym5uEOr.js","/assets/pin-Ct5vdS_N.js","/assets/pin-off-CyLifSVS.js","/assets/play-ClSOMMW9.js","/assets/plug-zap-B_sZwch7.js","/assets/prop-types-DBn8FsK7.js","/assets/radio-RPn7chxG.js","/assets/react-apexcharts.esm-BGtvkv0h.js","/assets/registers-D3Pt9HZX.js","/assets/repeat-BB8gA9fU.js","/assets/save-BnDdVqem.js","/assets/scopeLinks-D7hOqpZH.js","/assets/scroll-text-kHg8dZ3H.js","/assets/search-x-X99qLVu6.js","/assets/segments-BYSgQB6-.js","/assets/send-XQNhAPZw.js","/assets/settings-2-DZO3Ty_X.js","/assets/shield-DSCB78ku.js","/assets/shield-alert-BXlSNQh_.js","/assets/shield-question-mark-BOJszgl2.js","/assets/siren-5z1ZvRJU.js","/assets/snowflake-BQTNOZ9C.js","/assets/split-Ba_SNqzV.js","/assets/square-check-big-mJpQtj-O.js","/assets/star-B9KUx9pY.js","/assets/statusBands-DV4UB4_p.js","/assets/store-ofIROwNT.js","/assets/table-2-D_cKYJLF.js","/assets/table-properties-CYY1xMjc.js","/assets/tag-Bvs6J5E-.js","/assets/timer-off-Uw1bb2ZB.js","/assets/trending-down-D0P2EpHC.js","/assets/trending-up-O-1c2gzp.js","/assets/undo-2-D7f1Jvea.js","/assets/useChartTheme-DWypOCCR.js","/assets/useElementWidth-BKWmxsjV.js","/assets/useIsMobile-BS3Euy4B.js","/assets/useOpenParam-DK2LfEAj.js","/assets/useStatusBands-C5c8OiDU.js","/assets/useUrlScope-CHwc_cOS.js","/assets/user-CFhsUaTi.js","/assets/user-cog-BLQMU4Wk.js","/assets/user-minus-DqyJ3XZ2.js","/assets/users-Dmmjoso2.js","/assets/vfx-Cn7MWapb.js","/assets/video-D-uaJHCv.js","/assets/wallet-B5Ga3TLB.js","/assets/warehouse-CwJMlR5p.js","/assets/workflow-DOLjdU_Y.js","/assets/x-BJB-E_Cf.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
