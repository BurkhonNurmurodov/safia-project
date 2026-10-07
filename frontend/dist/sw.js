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

const BUILD = "2026-10-07T14:34:58.980Z";
const PRECACHE = ["/","/assets/AdminPanel-BA6Vbi_O.js","/assets/AnalysisBoard-CMrY-r-j.js","/assets/Arc-DIzcJuw2.js","/assets/Assistant-mBIVspad.js","/assets/BrigadirProfile-BIx3MVBz.js","/assets/BroadcastReceivers-DHtwlj5g.js","/assets/BroadcastRecord-XoWth_Ke.js","/assets/Button-55kjDUHv.js","/assets/CatLockNotice-DVP9qphZ.js","/assets/CategoryLegendModal-Bo3zYnqq.js","/assets/CellConcerns-DZjatSVZ.js","/assets/CellDetails-B6Vw3WKF.js","/assets/CellFormModal-xaU7NJnz.js","/assets/CellIdent-CZG5Y-dg.js","/assets/CellLink-Bvy311Iy.js","/assets/Cells-D771ic4W.js","/assets/ColumnFilter-DJ7o4X5a.js","/assets/ColumnsPicker-Bi3lVtwI.js","/assets/CommentsModal-yvlk6WoT.js","/assets/ComparisonTable-BaeOjIej.js","/assets/Concerns-3QmsjGLo.js","/assets/Daily-Bk-ewE7d.js","/assets/DataTable-D_TkVZ-j.js","/assets/DateRangePicker-BZLR5JXT.js","/assets/DayReportView-HRRbM21e.js","/assets/DayStepper-BrEdvCtx.js","/assets/DifferenceBreakdown-BtBIW-ni.js","/assets/Downtime-DySD3ADf.js","/assets/Education-BLwqkRju.js","/assets/EducationLesson-DaGM9zRV.js","/assets/EmptyState-BNi9ijNN.js","/assets/Exam-DCvJBXMV.js","/assets/FactorySelect-DdHUdXLH.js","/assets/Gamification-BAO1I46v.js","/assets/GroupBadge-j9-njDRz.js","/assets/HeatmapChart-Bjia2xLo.js","/assets/IdleCell-i3oCmDD6.js","/assets/KPICard-CHc2gAgy.js","/assets/Kaizen-CVhrALyt.js","/assets/Kelish-DJ9Zh12D.js","/assets/KpiDeltaCard-DWRTuqT_.js","/assets/LangTextInput-CImczyTp.js","/assets/Layout-DvxiNkDx.js","/assets/LeaderAppeal-Bwu4tGkw.js","/assets/LeaderDayReport-cxnsWvf2.js","/assets/LeaderUnitReport-B-S5B3bv.js","/assets/Leaderboard-rQTuEnpq.js","/assets/Leaders-CWJ4yNSi.js","/assets/Lightbox-4uHJjX0V.js","/assets/LiveOverview-B8wN4-na.js","/assets/Login-CAhMky-P.js","/assets/NotFound-Do_8eM5p.js","/assets/Notifications-CqvquLgh.js","/assets/Overview-DQXvbvtj.js","/assets/Pagination-1fPBX-QP.js","/assets/PerenaladkaFactTable-Cy1_aGyt.js","/assets/PersonCard-D8f14KoZ.js","/assets/PlanFulfillment-B0dZ4O13.js","/assets/Production-DjbI_WF0.js","/assets/Profile-DdBIUD18.js","/assets/ProofCamera-CkjD6bAN.js","/assets/ProofPhoto-k-zuf5aZ.js","/assets/Quality-Dij9AshS.js","/assets/RawRows-BmKhB0JP.js","/assets/RequestStateChip-bNinRqmU.js","/assets/RichTextEditor-48QXUy-7.js","/assets/SaveState-iGhpX896.js","/assets/SearchInput-Cju81SYs.js","/assets/SeasonalityHeatmap-DmBVNCzS.js","/assets/SegmentedToggle-De6frx9K.js","/assets/SetupTimes-Bf-jqBD7.js","/assets/ShiftDaily-CMKMGxD8.js","/assets/Staff-O4UNgZPh.js","/assets/StatusBadge-Dbmb-DM4.js","/assets/TargetGoal-Bz8giJci.js","/assets/Targets-Bv4g5zdP.js","/assets/Tasks-RrVoP6Qq.js","/assets/TimeWheelPicker-Iw4RiirP.js","/assets/Toast-Bqk9UUt8.js","/assets/Tooltip-B1nCDXGb.js","/assets/TrendChart-DbbIQosr.js","/assets/TripleSpeedometer-hbeBnKDk.js","/assets/Trudoyomkost-CQWybBEh.js","/assets/Turnover-xG4LMOAc.js","/assets/UploadDropzone-BGNjRBiR.js","/assets/UsersActivity-Ceo9xkTY.js","/assets/VerdictBlock-BuPp4Lal.js","/assets/VfxApiMap-1Hqkyq9z.js","/assets/VfxDictionaries-D9hRK5uv.js","/assets/VfxEmployees-0aTT_LM1.js","/assets/VfxHrMoves-HinSWzmq.js","/assets/VfxJobs-InJA5ATQ.js","/assets/VfxPhoto-BZuXgXMr.js","/assets/VfxShifts-BMwoAdOn.js","/assets/VfxState-DHVCfBzB.js","/assets/VfxTimebooks-CcK9W3k_.js","/assets/VfxTimesheet-BgTM9cQF.js","/assets/WatchProgress-CpHiwEB7.js","/assets/WebLogin-DjQQ5FFY.js","/assets/WorkerConcerns-D45U-apX.js","/assets/Workers-DyURG6v0.js","/assets/Zagruzka-DUjZBzAo.js","/assets/ZagruzkaCell-BQUDoUK6.js","/assets/api-D-d_x3Ta.js","/assets/archive-restore-DnjnsSiL.js","/assets/archive-wCJNemae.js","/assets/arrow-down-DAT0UE__.js","/assets/arrow-up-narrow-wide-DWwnoFfS.js","/assets/award-cEszl3eb.js","/assets/ban-B9PjmmHC.js","/assets/boxes-C-c8xwta.js","/assets/braces-zWPg1t-g.js","/assets/brigadirFilters-DMAPW1sg.js","/assets/broadcastTree-gr2w8Llq.js","/assets/building-2-DMsAgXg9.js","/assets/calculator-Dn0zv7Vw.js","/assets/calendar-days-nSaQxCdK.js","/assets/calendar-la-xhkC7.js","/assets/camera-Rb39LG8M.js","/assets/categories-DS97OEH7.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cs_6I0wQ.js","/assets/chart-line-B87ZgOxO.js","/assets/chart-pie-DjlUApOy.js","/assets/chartRange-CMjFsrgG.js","/assets/check-check-DPOjo6k1.js","/assets/chevron-left-DNzpf5qs.js","/assets/chevrons-up-down-mlJa1Vvv.js","/assets/circle-Brno6w38.js","/assets/circle-alert-1jd9fWKF.js","/assets/circle-check-big-B2BAf5K0.js","/assets/circle-dashed-DERc90p6.js","/assets/circle-minus-YepbXFAq.js","/assets/circle-question-mark-CDt20raU.js","/assets/circle-slash-C363h9wc.js","/assets/circle-user-round-Cj3XZhO1.js","/assets/clock-3-2tVwwr4R.js","/assets/cloud-off-CZtvpHw4.js","/assets/cloud-upload-zUN-G2hz.js","/assets/compass-BxGPCpsH.js","/assets/concernCategories-BFceUXdf.js","/assets/copy-D4XOfuzL.js","/assets/corner-down-right-Cjbn_HZS.js","/assets/createLucideIcon-Cn7lpX5S.js","/assets/es-CeDmzSDn.js","/assets/external-link-D0w0bpnK.js","/assets/file-clock-wY_oQgiu.js","/assets/file-exclamation-point-CADquBGz.js","/assets/flag-q3DQW7rc.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CiKvv1sm.js","/assets/hash-DJwmIYi3.js","/assets/hourglass-xDoWlQLD.js","/assets/image-maBYUDk8.js","/assets/image-off-8uwam-rg.js","/assets/inbox-Cy1_S9Y9.js","/assets/index-B3XT-3zp.js","/assets/index-B7yzqq84.css","/assets/keyboard-BU0ULmXr.js","/assets/languages-0wLF9cuo.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-JDU1P4mK.js","/assets/lightbulb-DE-8WmoX.js","/assets/link-2-DR4Qkz3v.js","/assets/link-2-off-DGdC5r61.js","/assets/list-ordered-Dc5d-DuO.js","/assets/list-tree-BNHk60Pd.js","/assets/lock-open-Cpjvnedm.js","/assets/log-in-Dis7JGhG.js","/assets/minimize-2-Crj-A-qN.js","/assets/package-check-BgTzNG4c.js","/assets/pencil-Bwtp3oZe.js","/assets/percent-Bf3y_pWJ.js","/assets/pin-OTADK4XA.js","/assets/pin-off-CQ6rEtLe.js","/assets/play-CTB1JRfc.js","/assets/plug-zap-DgBZDhug.js","/assets/prop-types-D7vihj1F.js","/assets/radio-CNKGC_aB.js","/assets/react-apexcharts.esm-By9iT641.js","/assets/registers-DWc_bb-J.js","/assets/repeat-D5SEARSh.js","/assets/save-CFW8lYXd.js","/assets/scopeLinks-B1lV3uEs.js","/assets/scroll-text-BV-5HUAF.js","/assets/search-x-JVh1gqsW.js","/assets/segments-CDwtf-jF.js","/assets/send-BUQdXHtW.js","/assets/settings-2-DniQdj9j.js","/assets/shield-NqmIyYl0.js","/assets/shield-alert-BLeCUcm2.js","/assets/shield-question-mark-DgwbW88m.js","/assets/siren-DNysQk2u.js","/assets/snowflake-D6Ofeu_E.js","/assets/split-mBqbA75y.js","/assets/square-check-big-BjW-WANO.js","/assets/star-utaBq_m4.js","/assets/statusBands-BB3PFvAm.js","/assets/store-CQBNIf8z.js","/assets/table-2-BGSy0Lqg.js","/assets/table-properties-C_FG5RDh.js","/assets/tag-Ck5S6ccs.js","/assets/timer-off-Bq6i6-Tj.js","/assets/trending-down-JA9cNQEc.js","/assets/trending-up-Bktm91Wy.js","/assets/undo-2-Ce2T-MMO.js","/assets/useChartTheme-BzXvxdGt.js","/assets/useElementWidth-mPyhaH8K.js","/assets/useIsMobile-D3ypBghr.js","/assets/useOpenParam-Bo1EA0SC.js","/assets/useStatusBands-Di2OLgsh.js","/assets/useUrlScope-BGLgzGax.js","/assets/user-C8z-DHJz.js","/assets/user-cog-DxTQqm7P.js","/assets/users-BdMMf8oZ.js","/assets/vfx-Bj5A2NQH.js","/assets/video-Cj8c4MpD.js","/assets/wallet-B33uqTzf.js","/assets/warehouse-D0WzQszI.js","/assets/x-BBnxR2Fi.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
