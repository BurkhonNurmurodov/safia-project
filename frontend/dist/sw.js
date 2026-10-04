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

const BUILD = "2026-10-04T10:11:03.979Z";
const PRECACHE = ["/","/assets/AdminPanel-Dno6awb6.js","/assets/AnalysisBoard-gKN9hsSo.js","/assets/Arc-DXhzqHIA.js","/assets/ArcLegacy-Df6L-aX4.js","/assets/BrigadirProfile-Dox-hIUa.js","/assets/BroadcastReceivers-CNQdjzdN.js","/assets/BroadcastRecord-6JscZq0q.js","/assets/CatLockNotice-CsDdy3f-.js","/assets/CategoryLegendModal-Bkv6HdQA.js","/assets/CellConcerns-Bcz7es3O.js","/assets/CellDetails-l5-Ly9gr.js","/assets/CellFormModal--TJwNQcd.js","/assets/CellIdent-DV8Fg2Ld.js","/assets/CellLink-DiDy5Nk5.js","/assets/Cells-5dmCfUbP.js","/assets/ColumnFilter-DB1HtMUR.js","/assets/ColumnsPicker-CCx4_UQZ.js","/assets/CommentsModal-CnGwax0j.js","/assets/ComparisonTable-DBEV6dSF.js","/assets/Concerns-DnSykQnq.js","/assets/ConfirmDialog-BMECzkn3.js","/assets/Daily-4zRsHYNr.js","/assets/DataTable-NEXycibs.js","/assets/DateRangePicker-BlP0Q_-_.js","/assets/DayReportView-d_4IieJT.js","/assets/DayStepper-CSMmJNgD.js","/assets/DifferenceBreakdown-B4AxMwz6.js","/assets/Downtime-C2W05ctz.js","/assets/Education-Bo27BcaT.js","/assets/EducationLesson-BUSRfuKP.js","/assets/EmptyState-CO12a-xS.js","/assets/Exam-Coy_cSzX.js","/assets/FactorySelect-B7lC3QUd.js","/assets/Gamification-CVU8bo-M.js","/assets/GroupBadge-Rlv5g7az.js","/assets/HeatmapChart-DOQvJ3Wy.js","/assets/IdleCell-P-QaiPPt.js","/assets/KPICard--batnuQ0.js","/assets/Kaizen-zNZy9578.js","/assets/Kelish-Dk4ymnJL.js","/assets/KpiDeltaCard-DqtdItTj.js","/assets/LangTextInput-CzLzKrnU.js","/assets/Layout-D19fu6IV.js","/assets/LeaderAppeal-DmVtXWdu.js","/assets/LeaderDayReport-D88Ac7gM.js","/assets/LeaderUnitReport-BUQVnzdl.js","/assets/Leaderboard-DyfVbxMR.js","/assets/Leaders-CEd5x1kU.js","/assets/Lightbox-DpYLQB09.js","/assets/LiveOverview-Fv_3kFN1.js","/assets/Login-BJYun8BW.js","/assets/NotFound-20PQv746.js","/assets/Notifications-CePWfdMe.js","/assets/Overview-CiiZ6bLR.js","/assets/Pagination-CRZH0pbH.js","/assets/PerenaladkaFactTable-CcCu5iX8.js","/assets/PersonCard-aGiAhe_P.js","/assets/PlanFulfillment-B3mD_ACL.js","/assets/Production-vbOwBTrw.js","/assets/Profile-3d0WDhkb.js","/assets/ProofCamera-BQgqwec0.js","/assets/ProofPhoto-PQaSQBaj.js","/assets/Quality-BFOdEB2A.js","/assets/RawRows-2xRthQxl.js","/assets/RequestStateChip-Cb-sPjBI.js","/assets/RichTextEditor-C4Ly1EJs.js","/assets/SaveState-V6eUiJmX.js","/assets/SearchInput-CtA8WVbr.js","/assets/SeasonalityHeatmap-BZMDDhmS.js","/assets/SegmentedToggle-CyXCT_CL.js","/assets/SetupTimes-CZ8OrG4O.js","/assets/ShiftDaily-BKkSJQoI.js","/assets/Staff-BvwCG0jc.js","/assets/StaffLive-BbkUtoWo.js","/assets/StatusBadge-CrRreBi2.js","/assets/TargetGoal-CbNP8Tak.js","/assets/Targets-BlxrfqkC.js","/assets/Tasks-CbIwC-U0.js","/assets/TimeWheelPicker-BfUGh7pl.js","/assets/Toast-Cp4EVcEr.js","/assets/Tooltip-DKtpgj97.js","/assets/TrendChart-CEkKJ7cJ.js","/assets/TripleSpeedometer-CtqJ5fGQ.js","/assets/Trudoyomkost-DhJrUUtc.js","/assets/UploadDropzone-AOOwoiLK.js","/assets/UsersActivity-DCD5ylox.js","/assets/VerdictBlock-axW6sBAo.js","/assets/VfxApiMap-8sriRaow.js","/assets/VfxDictionaries-Dhs5ybxv.js","/assets/VfxEmployees-DsvHgg8m.js","/assets/VfxHrMoves-C7N5Vb7y.js","/assets/VfxJobs-B9BJmRXs.js","/assets/VfxPhoto-DGoaoRS6.js","/assets/VfxShifts-DEAymuN5.js","/assets/VfxState-DRcV_VL8.js","/assets/VfxTimebooks-CrZpXkjt.js","/assets/VfxTimesheet-Cx1Zim7F.js","/assets/WatchProgress-BbQWGRbx.js","/assets/WebLogin-DO9QgAam.js","/assets/WorkerConcerns-DXKo33d-.js","/assets/Workers-L6fdFp-5.js","/assets/Zagruzka-DbIO8k_z.js","/assets/ZagruzkaCell-BXl1HU4P.js","/assets/api-BZ5BNWil.js","/assets/archive-CH_qKh4r.js","/assets/archive-restore-BJeCp7VH.js","/assets/arrow-down-B-sO_pEG.js","/assets/arrow-left-BTZwLIof.js","/assets/arrow-up-D6Eu8BoI.js","/assets/arrow-up-narrow-wide-2gyaUBaF.js","/assets/arrow-up-right-CrU4glkn.js","/assets/award-CiC4DKwo.js","/assets/ban-CZnVQyAx.js","/assets/bot-CbdMUF3P.js","/assets/boxes-Cii4RBUB.js","/assets/braces-BE9Uw99c.js","/assets/brigadirFilters-BERgq2iN.js","/assets/broadcastTree-TnmzeOhw.js","/assets/building-2-DFkFY-pE.js","/assets/calendar-QBd0OolT.js","/assets/calendar-days-BiaMjCFT.js","/assets/camera-BuI6saJu.js","/assets/categories-B64fj3vR.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CLlFnEOK.js","/assets/chart-line-sy3NbK7V.js","/assets/chart-pie-C7EuY4Yo.js","/assets/chartRange-Dy8xZvUW.js","/assets/check-check-C4meAYCq.js","/assets/chevron-left-D2O1mh9P.js","/assets/chevrons-up-down-DWBTk22e.js","/assets/circle-Cj3YJaB5.js","/assets/circle-alert-gwpebJrc.js","/assets/circle-check-big-B-VeG7sr.js","/assets/circle-dashed-Cdtbli5f.js","/assets/circle-minus-DUiK6xH_.js","/assets/circle-question-mark-BRLE1J3q.js","/assets/circle-slash-Nj25By5n.js","/assets/circle-user-round-CsSNzZVP.js","/assets/clock-3-CPJ-2XKC.js","/assets/cloud-off-BqcZlebf.js","/assets/cloud-upload-CShrgoVv.js","/assets/compass-CW1Kjns8.js","/assets/concernCategories-CHkOFr6i.js","/assets/copy-Bh74DRM1.js","/assets/corner-down-right-DelFa3kq.js","/assets/createLucideIcon-BKh538Vb.js","/assets/es-2MoLC421.js","/assets/exportXlsx-hwPdJEWk.js","/assets/external-link-BHkzzybV.js","/assets/file-clock-BgDfLprM.js","/assets/file-exclamation-point-BwxS_MsZ.js","/assets/file-spreadsheet-CnXUbgwd.js","/assets/file-text-CLusmK3i.js","/assets/flag-DZTN8HN5.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Bh57hcz3.js","/assets/hash-B8xKVdIZ.js","/assets/history-DVzK6NsF.js","/assets/hourglass-CeSj7Dab.js","/assets/image-B-F69yyl.js","/assets/image-off-BngGPxRf.js","/assets/inbox-DPL0b0Lp.js","/assets/index-BngiOmj1.css","/assets/index-FZl_XV8s.js","/assets/key-round-ibQQn8tr.js","/assets/keyboard-yRl3F6AA.js","/assets/languages-C0BoySKt.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CPTgfNAc.js","/assets/lightbulb-Du9IIIKb.js","/assets/link-2-DKdB-VjE.js","/assets/link-2-off-CdT3EmGS.js","/assets/list-ordered-CiPIrCFu.js","/assets/list-tree-DZ4AfUTs.js","/assets/lock-open-ANcJFYrt.js","/assets/log-in-DHiRIqQj.js","/assets/maximize-2-TQzX4FEX.js","/assets/message-square-BmymIt_X.js","/assets/minimize-2-THD2Gf6h.js","/assets/package-check-CojNwT8n.js","/assets/paperclip-BQMkphsP.js","/assets/pencil-CQa0GS23.js","/assets/percent-oi8pGyT_.js","/assets/pin-CCQcyxwo.js","/assets/pin-off-Ccp5c0nf.js","/assets/play-CYYM8xqU.js","/assets/plug-zap-BpTkZqr3.js","/assets/presentation-B7T4WDCB.js","/assets/prop-types-D4dJSPxE.js","/assets/radio-DTAm6-nI.js","/assets/react-apexcharts.esm-DTLdJH4j.js","/assets/registers-IFzzHgeG.js","/assets/repeat-n79AS5Fu.js","/assets/rotate-ccw-DVUxCrBF.js","/assets/rotate-cw-ZQpMgDg_.js","/assets/save-DSi9AmY5.js","/assets/scopeLinks-DFKV94hd.js","/assets/scroll-text-Bzr2Ao9D.js","/assets/search-x-DZo4Evls.js","/assets/segments-CyM_uf0i.js","/assets/send-DW38AkgK.js","/assets/settings-2-COSZ3jyz.js","/assets/shield-JWKdiejC.js","/assets/shield-alert-BTN5fu3O.js","/assets/shield-check-Ye1nEcbR.js","/assets/shield-question-mark-QGAn7NlU.js","/assets/siren-BzNT2bmF.js","/assets/snowflake-CuZjetLl.js","/assets/split-C8mCOCLF.js","/assets/square-Bb-ZCbje.js","/assets/square-check-big-BhvcL1sx.js","/assets/star-DIg4Xh1a.js","/assets/statusBands-fztOE1hc.js","/assets/store-BM_g3V4U.js","/assets/table-2-ep9s-gnJ.js","/assets/table-properties-BOvaNiCz.js","/assets/tag-CY-5l-bm.js","/assets/timer-off-DZlHQeRc.js","/assets/trending-down-pClnyzg0.js","/assets/trending-up-Dmf2iC15.js","/assets/undo-2-Cm6gBClb.js","/assets/useChartTheme-BxSyYBEc.js","/assets/useElementWidth-qZalZXc8.js","/assets/useIsMobile-eSLE_rAX.js","/assets/useOpenParam-DHaqnCI_.js","/assets/useStatusBands-GE9-ORW7.js","/assets/useUrlScope-iScw5tdb.js","/assets/user-Cyl0qLbD.js","/assets/user-cog-IEahQ7dQ.js","/assets/user-minus-CJU4a3yL.js","/assets/users-CmYlvR-3.js","/assets/video-aqg3uMFc.js","/assets/wallet-CEYQx5Bi.js","/assets/warehouse-8YupulML.js","/assets/x-DLsLvs7b.js","/assets/zap-CQs8Elej.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
