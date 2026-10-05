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

const BUILD = "2026-10-05T14:05:04.951Z";
const PRECACHE = ["/","/assets/AdminPanel-BKqDNZ4P.js","/assets/AnalysisBoard-BDi6Z-jq.js","/assets/Arc-i2EuC-lU.js","/assets/BrigadirProfile-DIPZi2Ek.js","/assets/BroadcastReceivers-LvlgG0V9.js","/assets/BroadcastRecord-Bq_2_ytu.js","/assets/Button-Ds9j0Hz1.js","/assets/CatLockNotice-CYM9-yhT.js","/assets/CategoryLegendModal-DRBW2Eem.js","/assets/CellConcerns-I6l6ug_W.js","/assets/CellDetails-DMZgQZad.js","/assets/CellFormModal-DPr6Od9j.js","/assets/CellIdent-hbeDlRiF.js","/assets/CellLink-CEgbLIcK.js","/assets/Cells-C0mNSFcg.js","/assets/ColumnFilter-Bjlwz8xZ.js","/assets/ColumnsPicker-Cy9OSYrh.js","/assets/CommentsModal-B4mNj4_B.js","/assets/ComparisonTable-Pw2-M1uV.js","/assets/Concerns-DfOPe6J4.js","/assets/Daily-B-6km-pq.js","/assets/DataTable-C6BK9aJN.js","/assets/DateRangePicker-CmzuQ10a.js","/assets/DayReportView-Bi1N_FUc.js","/assets/DayStepper-D4XIWkvr.js","/assets/DifferenceBreakdown-C3JGF97m.js","/assets/Downtime-B4-XA7MJ.js","/assets/Education-AnlBkwVk.js","/assets/EducationLesson-D7CM4nUg.js","/assets/EmptyState-DNgZ7eXF.js","/assets/Exam-ZGht3LIt.js","/assets/FactorySelect-BjcxUYet.js","/assets/Gamification-BgqVJ-7Z.js","/assets/GroupBadge-BFS2HruJ.js","/assets/HeatmapChart-BWdhZrYs.js","/assets/IdleCell-BtBJv_4L.js","/assets/KPICard-CxmsBMSr.js","/assets/Kaizen-AG8SE11B.js","/assets/Kelish-BC6Bogze.js","/assets/KpiDeltaCard-CMuy1ygo.js","/assets/LangTextInput-Bl5ThAV2.js","/assets/Layout-BVX2wdSg.js","/assets/LeaderAppeal-BCJkzT2b.js","/assets/LeaderDayReport-BvUovkV-.js","/assets/LeaderUnitReport-D8rWZ0hT.js","/assets/Leaderboard-BQznwGnR.js","/assets/Leaders-CSXDJMWF.js","/assets/Lightbox-Co3sVjtS.js","/assets/LiveOverview-BaqMcTep.js","/assets/Login-BJOj11BC.js","/assets/NotFound-DJh-jY_r.js","/assets/Notifications-B5E1-Nqt.js","/assets/Overview-BADN9izd.js","/assets/Pagination-C-HhRZ_j.js","/assets/PerenaladkaFactTable-SwDbMbuk.js","/assets/PersonCard-B0aCtLBW.js","/assets/PlanFulfillment-CrBGj-rs.js","/assets/Production-BmJqVHSN.js","/assets/Profile-aDZjdfEr.js","/assets/ProofCamera-BWWnyT60.js","/assets/ProofPhoto-CmPPtv_d.js","/assets/Quality-zAG6L-nb.js","/assets/RawRows-BhZL5dAs.js","/assets/RequestStateChip-BN0HIgGT.js","/assets/RichTextEditor-BuM6CmIe.js","/assets/SaveState-C92SGC5H.js","/assets/SearchInput-D_7ykbys.js","/assets/SeasonalityHeatmap-B1tJ6mzO.js","/assets/SegmentedToggle-C8cLMw9X.js","/assets/SetupTimes-ESimpMeY.js","/assets/ShiftDaily-Bmtvmk60.js","/assets/Staff-CDtPIZ9b.js","/assets/StaffLive-LJmGgACH.js","/assets/StatusBadge-DS8ecL7r.js","/assets/TargetGoal-B4rDuFbJ.js","/assets/Targets-DWBaOaxi.js","/assets/Tasks-BFC_FBBt.js","/assets/TimeWheelPicker-pxxBGs-g.js","/assets/Toast-CGliizjd.js","/assets/Tooltip-2vr1T052.js","/assets/TrendChart-C4nHOTzZ.js","/assets/TripleSpeedometer-Cq8Rb-0c.js","/assets/Trudoyomkost-CJlu2OHj.js","/assets/Turnover-BFJlO9hx.js","/assets/UploadDropzone-DTFvOVaw.js","/assets/UsersActivity-Bwt7YzDW.js","/assets/VerdictBlock-BEYk_09t.js","/assets/VfxApiMap-YIG1OtDT.js","/assets/VfxDictionaries-DcjXK7Bh.js","/assets/VfxEmployees-CRMn_y9y.js","/assets/VfxHrMoves-BuPZxZ0v.js","/assets/VfxJobs-CUxPGpyU.js","/assets/VfxPhoto-CcVqk-Aj.js","/assets/VfxShifts-DcsOQwGT.js","/assets/VfxState-kiyce5jh.js","/assets/VfxTimebooks-C3bC9mhx.js","/assets/VfxTimesheet-J8ETD04M.js","/assets/WatchProgress-C93_4x2R.js","/assets/WebLogin-BhAx5LCG.js","/assets/WorkerConcerns-DrbYueGb.js","/assets/Workers-BvqPehJp.js","/assets/Zagruzka-CIGys08b.js","/assets/ZagruzkaCell-CulTj0mR.js","/assets/api-CNv158cL.js","/assets/archive-C89CGP4u.js","/assets/archive-restore-Cba8_gFg.js","/assets/arrow-down-A9qfyH32.js","/assets/arrow-left-9j61XBCO.js","/assets/arrow-up-f7iO-BtS.js","/assets/arrow-up-narrow-wide-D0x8LuS_.js","/assets/arrow-up-right-B_rwr6w6.js","/assets/award-C4ewIgIP.js","/assets/ban-Z2qJX3s1.js","/assets/book-open-BTrlXDos.js","/assets/boxes-DNn0KrJa.js","/assets/braces-onbXaq7A.js","/assets/brigadirFilters-DiB4uIh-.js","/assets/broadcastTree-DT0743Zc.js","/assets/building-2-BaLI3yWn.js","/assets/calculator-BJ-T9knf.js","/assets/calendar-D07HNIHl.js","/assets/calendar-days-TDjlJEaU.js","/assets/camera-ktMgljV1.js","/assets/categories-DSpHUznt.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-FsqGoVuf.js","/assets/chart-line-Bkgn__DW.js","/assets/chart-pie-CwtxVGMe.js","/assets/chartRange-coDNmPvt.js","/assets/check-check-D1OJk7Wx.js","/assets/chevron-left-D1WXQxhm.js","/assets/chevrons-up-down-7GmP33dJ.js","/assets/circle-CkK_PvA7.js","/assets/circle-alert-CgJJX4g9.js","/assets/circle-check-big-Big2m3rr.js","/assets/circle-dashed-DonRh_YS.js","/assets/circle-minus-CePGhs6U.js","/assets/circle-question-mark-CeehSdy2.js","/assets/circle-slash-X2Kxl_zg.js","/assets/circle-user-round-YL5unvRY.js","/assets/clock-3-B1a7PByy.js","/assets/cloud-off-fdvCFdO-.js","/assets/cloud-upload-CgyYneY1.js","/assets/compass-x1CsOMeB.js","/assets/concernCategories-DNFVDjRD.js","/assets/copy-BwTbf7lP.js","/assets/corner-down-right-Bk8XWHbP.js","/assets/createLucideIcon-BwIdwadu.js","/assets/es-6de9Of-j.js","/assets/exportXlsx-CEi_I8vU.js","/assets/external-link-CExns-wy.js","/assets/file-clock-B1wGY2kn.js","/assets/file-exclamation-point-CcqQCK9P.js","/assets/file-spreadsheet-BlZsNrUI.js","/assets/file-text-CLkz57H4.js","/assets/flag-BsLcnXu5.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BJevDGee.js","/assets/hash-BGBYnKbk.js","/assets/history-BD_mbpfO.js","/assets/hourglass-UJzoCoCA.js","/assets/image-B2O-Hbl3.js","/assets/image-off-Bfi2-6km.js","/assets/inbox-CFKg9Dz7.js","/assets/index-BYBpEzfj.css","/assets/index-CiZozy4j.js","/assets/key-round-Bx57dnvi.js","/assets/keyboard-U52NwHEM.js","/assets/languages-DVxLIRCM.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CX6XA1ca.js","/assets/lightbulb-BFSuS3qQ.js","/assets/link-2-CFSlcQ3_.js","/assets/link-2-off-DGSizDW3.js","/assets/list-ordered-BgGu2gnX.js","/assets/list-tree-BgiqQjlT.js","/assets/lock-open-CSvuN08d.js","/assets/log-in-RqH7BHuY.js","/assets/maximize-2-CqVvMF9x.js","/assets/message-square-DOyCIcNf.js","/assets/minimize-2-CLFd82xv.js","/assets/package-check-Br5UcYm4.js","/assets/paperclip-B-PkPAOU.js","/assets/pencil-CaK8ci2o.js","/assets/percent-oxmhsrp4.js","/assets/pin-DNULe4VY.js","/assets/pin-off-BaAe_v5f.js","/assets/play-GjSJ7n6U.js","/assets/plug-zap-5B-TpA3i.js","/assets/presentation-C1mgtx9v.js","/assets/prop-types-CDJA7Taw.js","/assets/radio-DFWaw1-_.js","/assets/react-apexcharts.esm-CqylsJ5s.js","/assets/registers-GjhFG4hd.js","/assets/repeat-CofE0is6.js","/assets/rotate-ccw-hU0KpY7f.js","/assets/rotate-cw-wGfGRDys.js","/assets/save-DgSvyG8M.js","/assets/scopeLinks-BYyQdbNv.js","/assets/scroll-text-ak8PIGGE.js","/assets/search-x-DyWn6cG0.js","/assets/segments-DcSIppUq.js","/assets/send-avKantkB.js","/assets/settings-2-DugX_aSZ.js","/assets/shield-2ecwDTnM.js","/assets/shield-alert-Bw7Y2p7g.js","/assets/shield-check-gZ8aHusH.js","/assets/shield-question-mark-pesUxn7z.js","/assets/siren-BfwXX-Nm.js","/assets/snowflake-Co7K0vVJ.js","/assets/split-_NG1goCD.js","/assets/square-0fDtsgHn.js","/assets/square-check-big-BsuzsJYR.js","/assets/star-Cb-33RbM.js","/assets/statusBands-DLCqTWya.js","/assets/store-AVDGlgZq.js","/assets/table-2-DNrht_PK.js","/assets/table-properties-qq8gABgG.js","/assets/tag-D_1fdwYi.js","/assets/timer-off-AlItdvGn.js","/assets/trending-down-DbcGxl3n.js","/assets/trending-up-vL471Hyy.js","/assets/undo-2-CLo5fa2O.js","/assets/useChartTheme-DZh9uox6.js","/assets/useElementWidth-CFXgQl6E.js","/assets/useIsMobile-C62-NqwK.js","/assets/useOpenParam-Dt6dN3br.js","/assets/useStatusBands-qciqWwvy.js","/assets/useUrlScope-HyGX8ejP.js","/assets/user-Dp3ZRkyU.js","/assets/user-cog-DAHsCfCS.js","/assets/users-faTyj3On.js","/assets/vfx-Xq2UOzCw.js","/assets/video-RR3hc8ha.js","/assets/wallet-Bn1l6xvG.js","/assets/warehouse-C7DI7OcG.js","/assets/x-BOM81v2d.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
