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

const BUILD = "2026-09-21T04:58:17.333Z";
const PRECACHE = ["/","/assets/AdminPanel-CabqNdYC.js","/assets/AnalysisBoard-BXNu4fJE.js","/assets/Arc-D6PBJbhE.js","/assets/AttendanceModal-Czus-f22.js","/assets/BrigadirProfile-leUBMbic.js","/assets/BroadcastReceivers-BS5AYlEI.js","/assets/BroadcastRecord-BJsDdx29.js","/assets/CatLockNotice-uqW2wzok.js","/assets/CategoryLegendModal-j2EGVE1s.js","/assets/CellConcerns-DGeLYudu.js","/assets/CellDetails-BEHbUruo.js","/assets/CellFormModal-Z8gzhYGG.js","/assets/CellLink-ByQYPQ5b.js","/assets/Cells-BJk8DaqT.js","/assets/ColumnFilter-C704hILH.js","/assets/ColumnsPicker-DCTKSm4k.js","/assets/CommentsModal-B4sPWB1E.js","/assets/ComparisonTable-DylVtQVq.js","/assets/Concerns-BlwZaTPU.js","/assets/ConfirmDialog-C1v2Usp8.js","/assets/Daily-BAHzk_l0.js","/assets/DataTable-CmHNvsry.js","/assets/DateRangePicker-Dsd5KbqR.js","/assets/DayReportView-hjAKT7D8.js","/assets/DayStepper-sudrL3oA.js","/assets/DifferenceBreakdown-D7peuKKi.js","/assets/Downtime-Dr2QF3xV.js","/assets/Education-Bn57zpy-.js","/assets/EducationLesson-sl_rwbOw.js","/assets/EmptyState-sm-f3Tw0.js","/assets/FactorySelect-ClWgZlgF.js","/assets/FormField-DE9SPjGg.js","/assets/Gamification-DcU4qGzs.js","/assets/GroupBadge-CdhUqLVg.js","/assets/HeatmapChart-DFqeX5CB.js","/assets/IdleCell-BgsS5PSj.js","/assets/KPICard-BLbuO2Ou.js","/assets/Kaizen-MVo4CSnB.js","/assets/KpiDeltaCard-ftB-wQEG.js","/assets/LangTextInput-BlpVpHmJ.js","/assets/Layout-CEakkpWL.js","/assets/LeaderDayReport-CgtQWQEx.js","/assets/LeaderUnitReport-Brizt-Cg.js","/assets/Leaderboard-DZAkK2iB.js","/assets/Leaders-F5qqbnoH.js","/assets/LiveOverview-mgTIFqbd.js","/assets/Login-BYqc3lK0.js","/assets/NotFound-B2Q5e7nw.js","/assets/Overview-CzhdWjNy.js","/assets/Pagination--_nGVMpG.js","/assets/PerenaladkaFactTable-BhrBJ5rg.js","/assets/PlanFulfillment-BP8MHTk6.js","/assets/Production-2MaMJMIU.js","/assets/Profile-DuDtyaDl.js","/assets/ProofCamera-DcFZWusF.js","/assets/Quality-yDjT0OT5.js","/assets/RichTextEditor-kx_WCW4-.js","/assets/SearchInput-BSmsx0nh.js","/assets/SeasonalityHeatmap-BNxt_Xn0.js","/assets/SegmentedToggle-CjeekeXt.js","/assets/SetupTimes-DxA2MXZD.js","/assets/ShiftDaily-BkELKNSR.js","/assets/Skeleton-C3CFcxFM.js","/assets/Staff-C0lf3ro3.js","/assets/StatusBadge-D0ElF0C_.js","/assets/StyledSelect-COMardkU.js","/assets/Targets-CrAeEcaH.js","/assets/Tasks-DO8Nm_ad.js","/assets/TimeField-DgLyXexq.js","/assets/TimeWheelPicker-DvzqiBvu.js","/assets/Toast-D_vq9Ob0.js","/assets/Tooltip-DFVCilLE.js","/assets/TrendChart-Dl1yZU0I.js","/assets/TripleSpeedometer-DFqL3lUc.js","/assets/Trudoyomkost-Cvst4FOO.js","/assets/UsersActivity-DjEqEcaS.js","/assets/WatchProgress-CX2DgQ4s.js","/assets/WebLogin-D6gshFRD.js","/assets/WorkerConcerns-BLocYkVc.js","/assets/Workers-BVOBR4Vb.js","/assets/Zagruzka-FgtKo1C5.js","/assets/ZagruzkaCell-DFjo9Hcs.js","/assets/alarm-clock-B63F887G.js","/assets/api-DbPiDbta.js","/assets/archive-CWwYoHHL.js","/assets/archive-restore-B-5kaoYd.js","/assets/arrow-down-BhesaCR7.js","/assets/arrow-left-B4tLnLYG.js","/assets/arrow-left-right-BLH3G2v_.js","/assets/arrow-right-X9CyJvWm.js","/assets/arrow-up-Dg1dOoAu.js","/assets/arrow-up-right-FyJfpM97.js","/assets/award-DRvzHXQh.js","/assets/ban-D0_ocv7n.js","/assets/bot-Da-rDQ7J.js","/assets/boxes-uBM24szz.js","/assets/brigadirFilters-jf6ust29.js","/assets/broadcastTree-BEkkgX7_.js","/assets/building-2-BsUIfQqt.js","/assets/calendar-DH5cZTdn.js","/assets/calendar-clock-fqkJd2Ky.js","/assets/calendar-days-BPb85H0d.js","/assets/calendar-range-BTaL3hI4.js","/assets/camera-B_plikTE.js","/assets/categories-Da5FVGdr.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CUaqbVaV.js","/assets/chart-line-BkG9DxUu.js","/assets/chart-pie-nIjigs11.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-BxeU9PxE.js","/assets/check-DUh8ymRa.js","/assets/check-check-B-1iL1tc.js","/assets/chevron-left-DmvPwnVZ.js","/assets/chevrons-up-down-BU3Q7HT6.js","/assets/circle-dashed-CUsLcSAm.js","/assets/circle-dot-Nb4alMhH.js","/assets/circle-minus-OPgzEV9q.js","/assets/circle-slash-CjVnN1L0.js","/assets/circle-user-round-B7BUB4_c.js","/assets/coins-CPV8MBdC.js","/assets/compass-CPjfKcgT.js","/assets/concernCategories-CEVddnoj.js","/assets/copy-Dqp23RiO.js","/assets/corner-down-right-B2GrygU9.js","/assets/createLucideIcon-DJubmLsM.js","/assets/exportXlsx-DEbX5bDy.js","/assets/external-link-DhUD9xpN.js","/assets/file-clock-DpY7ZoEE.js","/assets/file-spreadsheet-CqGDgARC.js","/assets/file-text-CUhmO-dp.js","/assets/flag-CrZbQwfM.js","/assets/flame-3mxquOU1.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DFXfka-R.js","/assets/funnel-BHFkv3Wf.js","/assets/hash-C89bBDu3.js","/assets/history-Rs1TFHT8.js","/assets/hourglass-CZhJjNoV.js","/assets/image-BPQI9Coj.js","/assets/image-off-tfnjCoF6.js","/assets/index-5NxngwWQ.css","/assets/index-BT1MEpjo.js","/assets/keyboard-CrSyEEec.js","/assets/languages-Dx5_gviR.js","/assets/layers-DDjIb5ub.js","/assets/leaderReason-rcDm6ppU.js","/assets/lightbulb-2EIZ2dL8.js","/assets/link-2-m9TLExpw.js","/assets/list-checks-_Cp2QSnW.js","/assets/list-ordered-CvLMzM7e.js","/assets/lock-open-DjGpVYjZ.js","/assets/log-in-Dm_Itch5.js","/assets/message-square-DI6nS52R.js","/assets/minimize-2-D2rR3Lhg.js","/assets/minus-xKG6cxwJ.js","/assets/paperclip-CjXVTyAB.js","/assets/pencil-B-fZvmDr.js","/assets/pencil-line-BE9XcKx_.js","/assets/personName-B4KId4zS.js","/assets/pin-Bdpv0Jeh.js","/assets/play-CZePnt6M.js","/assets/prop-types-DARjQ2oU.js","/assets/radio-CCIE79yQ.js","/assets/react-apexcharts.esm-CJJi0gz2.js","/assets/refresh-cw-COFClne0.js","/assets/repeat-TQNy6c1r.js","/assets/rotate-ccw-Qj4oOuaZ.js","/assets/rotate-cw-Bv3AN-HK.js","/assets/save-D-SQrj8x.js","/assets/scale-C0KW-EwN.js","/assets/scroll-text-oUdszD5W.js","/assets/search-x-C1fHCcAm.js","/assets/segments-DqgDNSPb.js","/assets/send-BYeJ0RGG.js","/assets/settings-2-CzPJpi7m.js","/assets/shield-DN0pJ5cg.js","/assets/shield-alert-CzbwIRl5.js","/assets/shield-check-DbpMjE7t.js","/assets/shield-question-mark-BTCwghiW.js","/assets/siren-CMu8ogOw.js","/assets/smartphone-DQnGot13.js","/assets/snowflake-dSHpLQcI.js","/assets/square-check-big-CEShphse.js","/assets/square-dwOlvQxF.js","/assets/star-D-2UVy34.js","/assets/statusBands-DhGrw8K5.js","/assets/table-2-BRIaqqvS.js","/assets/tag-DBsD4QsQ.js","/assets/trash-2-Ds4J1GBM.js","/assets/trending-down-VGpko4Q3.js","/assets/trending-up-Cw4P31Fa.js","/assets/undo-2-AzrbXIpY.js","/assets/useChartTheme-D7SF6z4f.js","/assets/useElementWidth-DUrrWGZW.js","/assets/useIsMobile-DixNbarc.js","/assets/useMutation-BWR7zVYi.js","/assets/useStatusBands-CIM-2Qse.js","/assets/user-check-wwTLJypz.js","/assets/user-cog-C9dWcTnp.js","/assets/user-minus-D-TJkqGZ.js","/assets/users-1dWnK17C.js","/assets/verifyState-CJ40O5um.js","/assets/video-0bWcVygD.js","/assets/warehouse-KILHdAb6.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
