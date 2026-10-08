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

const BUILD = "2026-10-08T07:40:19.404Z";
const PRECACHE = ["/","/assets/AdminPanel-C5ZekrXC.js","/assets/AnalysisBoard-DpYVhu58.js","/assets/Arc-BUGy5Kps.js","/assets/Assistant-DPbc00Tm.js","/assets/BrigadirProfile-BIcAG0Yk.js","/assets/BroadcastReceivers-CUetRe0R.js","/assets/BroadcastRecord-CKK41Mhl.js","/assets/Button-DlML6cbZ.js","/assets/CatLockNotice-ohmHb4re.js","/assets/CategoryLegendModal-DRQe6c3M.js","/assets/CellConcerns-BBR6PNGx.js","/assets/CellDetails-Bfu4vXnj.js","/assets/CellFormModal-DVVYqp5K.js","/assets/CellIdent-Cv9AnL1b.js","/assets/CellLink-BNZa8dtD.js","/assets/Cells-Bvk3ENHC.js","/assets/ColumnFilter-D1daK4pA.js","/assets/ColumnsPicker-DoHFw3m5.js","/assets/CommentsModal-B5DoABWp.js","/assets/ComparisonTable-DI1A4knm.js","/assets/Concerns-CYxKQ2IU.js","/assets/Daily-DcGKtLqI.js","/assets/DataTable-CQIUhgwJ.js","/assets/DateRangePicker-BVJaA0Uu.js","/assets/DayReportView-BUQlS5kb.js","/assets/DayStepper-Bbyyb2CU.js","/assets/DifferenceBreakdown-DM3QprPG.js","/assets/Downtime-DXELn60b.js","/assets/Education-Dj7K1sYh.js","/assets/EducationLesson-DdrRXUPq.js","/assets/EmptyState-B1ReV65w.js","/assets/Exam-DI3GilUA.js","/assets/FactorySelect-Csf2twV4.js","/assets/Gamification-Dy578Pst.js","/assets/GroupBadge-CsP9vvGK.js","/assets/HeatmapChart-DRm74FYk.js","/assets/IdleCell-ElQ4pmG7.js","/assets/KPICard-B0XaZUP5.js","/assets/Kaizen-jWXrAf6k.js","/assets/Kelish-C4eCRgVs.js","/assets/KpiDeltaCard-D_8_9x0W.js","/assets/LangTextInput-CHiEbdwC.js","/assets/Layout-Ck254p2i.js","/assets/LeaderAppeal-Cc9bL8F8.js","/assets/LeaderDayReport-DQ5oIf0t.js","/assets/LeaderUnitReport-BfGHUPQ_.js","/assets/Leaderboard-BBZHzxis.js","/assets/Leaders-DcWkFlAK.js","/assets/Lightbox-D413sl3P.js","/assets/LiveOverview-B1XSLmpB.js","/assets/Login-DVZcFvrO.js","/assets/NotFound-0myIfLfX.js","/assets/Notifications-CmQHme-S.js","/assets/Overview-Yqx0sPgG.js","/assets/Pagination-WvwDtIlu.js","/assets/PerenaladkaFactTable-CSnf06e2.js","/assets/PersonCard-DM4MckXY.js","/assets/PlanFulfillment-DSb3zHQG.js","/assets/Production-BVOqywRa.js","/assets/Profile-0Y7adDLt.js","/assets/ProofCamera-qa9Ld839.js","/assets/ProofPhoto-CrJMheOj.js","/assets/Quality-50YUkgoB.js","/assets/RawRows-CPto1N8F.js","/assets/RequestStateChip-f9RVTgOl.js","/assets/RichTextEditor-CXwF_Cu-.js","/assets/SaveState-Bi8fV8JQ.js","/assets/SearchInput-C4QNxiQP.js","/assets/SeasonalityHeatmap-DrKha4gs.js","/assets/SegmentedToggle-Br07uHgS.js","/assets/SetupTimes-Br-rnOtp.js","/assets/ShiftDaily-CQnjBy3U.js","/assets/Staff-xvjVFwYp.js","/assets/StatusBadge-CJbvTwXQ.js","/assets/TargetGoal-B3O5etbj.js","/assets/Targets-BOy4GEf_.js","/assets/Tasks-CnfR-HIb.js","/assets/TimeWheelPicker-tWSlq02H.js","/assets/Toast-BXcUF5Fn.js","/assets/Tooltip-BgKj-Z7y.js","/assets/TrendChart-CoITfCMr.js","/assets/TripleSpeedometer-Cc95xUDu.js","/assets/Trudoyomkost-DAuMOqiS.js","/assets/Turnover-Cwh85zeL.js","/assets/UploadDropzone-Bh-SF_SH.js","/assets/UsersActivity-CQpZ4nT_.js","/assets/VerdictBlock-CkQgWNaH.js","/assets/VfxApiMap-BdPW73Zu.js","/assets/VfxDictionaries-DQ54MYvW.js","/assets/VfxEmployees-F7Q6s7R_.js","/assets/VfxHrMoves-CN8qBRgo.js","/assets/VfxJobs-Bz3du7V3.js","/assets/VfxPhoto-Blh4F1vE.js","/assets/VfxShifts-DYqK25tr.js","/assets/VfxState-hx3cYFDu.js","/assets/VfxTimebooks-B4_2fvo-.js","/assets/VfxTimesheet-DSFpxkoT.js","/assets/WatchProgress-1KNUew9S.js","/assets/WebLogin-DUY8Efxp.js","/assets/WorkerConcerns-DqC-WH4H.js","/assets/Workers-DAKySK8Z.js","/assets/Zagruzka-C9uTueFu.js","/assets/ZagruzkaCell-DpCYAnDD.js","/assets/api-DaUnv7rd.js","/assets/archive-W3K3Cgc_.js","/assets/archive-restore-B4mvc2ZY.js","/assets/arrow-down-Kzz3_Tij.js","/assets/arrow-up-narrow-wide-DYui15FA.js","/assets/award-D7i47fwx.js","/assets/ban-CjsNS9DX.js","/assets/boxes-08lcrJck.js","/assets/braces-BVwHt5jd.js","/assets/brigadirFilters-CvvIm2vq.js","/assets/broadcastTree-CRRvPruB.js","/assets/building-2-DztSFaMF.js","/assets/calculator-BAIBw7by.js","/assets/calendar-DnBur1FR.js","/assets/calendar-days-s7d_SCwU.js","/assets/camera-C3W7bLGN.js","/assets/categories-CfCrfyDo.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CjGsF1HL.js","/assets/chart-line-BjfCMMVV.js","/assets/chart-pie-BmmHCaBc.js","/assets/chartRange-Daz6YIMX.js","/assets/check-check--_D3-nFq.js","/assets/chevron-left-drn3hvkP.js","/assets/chevrons-up-down-Ct22vnKK.js","/assets/circle-alert-DPKIbKid.js","/assets/circle-check-big-BDjTHfLI.js","/assets/circle-dashed-CTlEuY4L.js","/assets/circle-f3JhT9wd.js","/assets/circle-minus-B4Cm2tgY.js","/assets/circle-question-mark-o367KGPc.js","/assets/circle-slash-BLw9EGWX.js","/assets/circle-user-round-YxORoDnF.js","/assets/clock-3-BjWcPpJP.js","/assets/cloud-off-C2ySoJox.js","/assets/cloud-upload-B_DqkzEb.js","/assets/compass-BOC7baHq.js","/assets/concernCategories-Duel6n9w.js","/assets/copy-DZVAHfIx.js","/assets/corner-down-right-CSyA0PAO.js","/assets/createLucideIcon-1hNFxegw.js","/assets/es-C2deozQJ.js","/assets/external-link-D5MC1X4w.js","/assets/file-clock-ClyYjZ03.js","/assets/file-exclamation-point-CKR8EEdh.js","/assets/flag-BkQN3Y4t.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CMPD252o.js","/assets/hash-BDLZMVw7.js","/assets/hourglass-SBw8WwnF.js","/assets/image-DNTIYdZO.js","/assets/image-off-Da4XtNoe.js","/assets/inbox-B_g92vGx.js","/assets/index-Ck814gz0.css","/assets/index-DtxQ9hmt.js","/assets/keyboard-Bd3QGh3c.js","/assets/languages-BfgbcW70.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-SUZGFxIU.js","/assets/lightbulb-CsyrMXKC.js","/assets/link-2-BHvv60rx.js","/assets/link-2-off-8xuAUBFL.js","/assets/list-ordered-D68V5_3A.js","/assets/list-tree-DupX7zm4.js","/assets/lock-open-B3qhqzcR.js","/assets/log-in-DQQUYtUv.js","/assets/minimize-2-Br4xQgaw.js","/assets/package-check-BLvSyn6M.js","/assets/pencil-Bv-0JqCI.js","/assets/percent-BgKLIN9D.js","/assets/pin-BDX2wIxy.js","/assets/pin-off-D--7YxfI.js","/assets/play-Ce02Y2qt.js","/assets/plug-zap-DbzC7mVu.js","/assets/prop-types-Pi5WD8L-.js","/assets/radio-0vdBvX9N.js","/assets/react-apexcharts.esm-BNZYUuf0.js","/assets/registers-CvTqDYWi.js","/assets/repeat-D4DleO6G.js","/assets/save-BxF-iE3I.js","/assets/scopeLinks-CY2Htdl5.js","/assets/scroll-text--METRYVP.js","/assets/search-x-Bjx5tD0E.js","/assets/segments-DXTUtNJq.js","/assets/send-C2rQja-d.js","/assets/settings-2-CNMn49kK.js","/assets/shield-B2rE28B1.js","/assets/shield-alert-CdfAoVk2.js","/assets/shield-question-mark-CdbVB_lX.js","/assets/siren-ByxYpaAX.js","/assets/snowflake-kNlTJSKM.js","/assets/split-B2W7h-sX.js","/assets/square-check-big-DFQOwkyc.js","/assets/star-Cf0YtHgS.js","/assets/statusBands-lI1p_3Zr.js","/assets/store-wLkErW7w.js","/assets/table-2-D-T-sAr8.js","/assets/table-properties-CNLSBuqA.js","/assets/tag-BAt9xBlW.js","/assets/timer-off-HU19Tj4p.js","/assets/trending-down-u6LG3mwP.js","/assets/trending-up-BBiTokPl.js","/assets/undo-2-cJPU1fGn.js","/assets/useChartTheme-DzOk0DeJ.js","/assets/useElementWidth-DTvABRNt.js","/assets/useIsMobile-D3_3J1W7.js","/assets/useOpenParam-CabcAQqF.js","/assets/useStatusBands-Xon3b4dq.js","/assets/useUrlScope-BzuZozZ3.js","/assets/user-OV6OPAbp.js","/assets/user-cog-fpygOJwc.js","/assets/users-BhTImTdJ.js","/assets/vfx-BJdRPDMM.js","/assets/video-BzlPdpfU.js","/assets/wallet-B5ujaWdf.js","/assets/warehouse-BUyH9q9h.js","/assets/x-TDTuJc6H.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
