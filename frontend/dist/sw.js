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

const BUILD = "2026-09-29T05:20:05.402Z";
const PRECACHE = ["/","/assets/AdminPanel-BliH6qqn.js","/assets/AnalysisBoard-CVzKNpbZ.js","/assets/Arc-NWYVMNRq.js","/assets/ArcLegacy-BwCHi1FZ.js","/assets/AttendanceModal-CMySZKVm.js","/assets/BrigadirProfile-BupbThj-.js","/assets/BroadcastReceivers-HvMxSXCg.js","/assets/BroadcastRecord-DFbiTyz3.js","/assets/CatLockNotice-DDnKYhh7.js","/assets/CategoryLegendModal-pV0kBRD5.js","/assets/CellConcerns-B67v6xnn.js","/assets/CellDetails-CFQOOUsa.js","/assets/CellFormModal-BgIdsh5p.js","/assets/CellLink-DZx3bxl4.js","/assets/Cells-D38yVKao.js","/assets/ColumnFilter-0AqpSnG3.js","/assets/ColumnsPicker-DdcmhCFR.js","/assets/CommentsModal-C9rPaKeO.js","/assets/ComparisonTable-CMVvxwIi.js","/assets/Concerns-CCOYr9Xh.js","/assets/ConfirmDialog-Dore-0J4.js","/assets/Daily-XJ35DIdS.js","/assets/DataTable-UWb6xQ_h.js","/assets/DateRangePicker-BtQeP58G.js","/assets/DayReportView-Djl59_zp.js","/assets/DayStepper-CS-JWieq.js","/assets/DifferenceBreakdown-CeG4xvNn.js","/assets/Downtime-W-Nfxths.js","/assets/Education-oVVHjCRM.js","/assets/EducationLesson-Bp_PQbUR.js","/assets/EmptyState-C0HDbOc8.js","/assets/Exam-D2dVhRri.js","/assets/FactorySelect-HJtWFT0l.js","/assets/Gamification-DH9U7J4Q.js","/assets/GroupBadge-CPWvRFra.js","/assets/HeatmapChart-D67D2Uxn.js","/assets/IdleCell-CjJcKTjV.js","/assets/KPICard-Do80nwuH.js","/assets/Kaizen-XMZCvVHQ.js","/assets/Kelish-CkcvTUjy.js","/assets/KpiDeltaCard-fmIk-byI.js","/assets/LangTextInput-DGoEhtyb.js","/assets/Layout-Bir9cAhA.js","/assets/LeaderAppeal-DpHagcs1.js","/assets/LeaderDayReport-CHM-bpL8.js","/assets/LeaderUnitReport-DK79blRo.js","/assets/Leaderboard-BDGxuiLp.js","/assets/Leaders-lGY-6Ehd.js","/assets/Lightbox-ChkF42H_.js","/assets/LiveOverview-ByvIFQam.js","/assets/Login-Cz1ZrKZf.js","/assets/NotFound-By9PJEXt.js","/assets/Overview-S5qsB7jT.js","/assets/Pagination-KMdfhF7E.js","/assets/PerenaladkaFactTable-CLHNpOEJ.js","/assets/PlanFulfillment-lRvOXV3A.js","/assets/Production-DTRM1Eek.js","/assets/Profile-C91STUey.js","/assets/ProofCamera-D1Hy3ZSE.js","/assets/ProofPhoto-xyQdp2sO.js","/assets/Quality-BW3xK0SA.js","/assets/RequestStateChip-DXz0mFn4.js","/assets/RichTextEditor-DPl0S1Ol.js","/assets/SaveState-4aT6thZa.js","/assets/SearchInput-BYEyBiEn.js","/assets/SeasonalityHeatmap-CTbJUssJ.js","/assets/SegmentedToggle-DWfG1nZP.js","/assets/SetupTimes-BLWqh018.js","/assets/ShiftDaily-D_vw0CR7.js","/assets/Staff-BF2F1g6v.js","/assets/StatusBadge-BjkZJr7s.js","/assets/TargetGoal-BQFhzv9n.js","/assets/Targets-CrPhB2Iu.js","/assets/Tasks-pUg3381E.js","/assets/TimeWheelPicker-CtfCNxJ3.js","/assets/Tooltip-DjDj_k5l.js","/assets/TrendChart-DDJCvjaT.js","/assets/TripleSpeedometer-AgoCxMCX.js","/assets/Trudoyomkost-D77hSz2Y.js","/assets/UploadDropzone-BvIc2pdU.js","/assets/UsersActivity-D_mCXD0J.js","/assets/VerdictBlock-BVzFCt2a.js","/assets/WatchProgress-Dj7WyWWq.js","/assets/WebLogin-1iPcn8xf.js","/assets/WorkerConcerns-5qadx-UB.js","/assets/Workers-C2AjOR1v.js","/assets/Zagruzka-C6vaNCxU.js","/assets/ZagruzkaCell-BhYzUOq9.js","/assets/api-D5HIP8D9.js","/assets/archive-DeXekzuo.js","/assets/archive-restore-BcrIsuOv.js","/assets/arrow-down-uql108Nc.js","/assets/arrow-left-DcPnhWA8.js","/assets/arrow-left-right-BiOQS1hG.js","/assets/arrow-up-BDT8Q7qb.js","/assets/arrow-up-narrow-wide-D5qiSe-_.js","/assets/arrow-up-right-B7brkfZL.js","/assets/award-DtQmAYZK.js","/assets/ban-BIK7suQO.js","/assets/bot-B9Q3MU4H.js","/assets/boxes-C-8nuhXU.js","/assets/brigadirFilters-BS2Dr_R8.js","/assets/broadcastTree-C6HO6-Jc.js","/assets/building-2-CymrTvca.js","/assets/calendar-D9QClm5h.js","/assets/calendar-clock-ycvgMv2u.js","/assets/calendar-days-2pq2gtC5.js","/assets/calendar-range-B3UCR2Pl.js","/assets/camera-CdM_uY6g.js","/assets/categories-QbonqQWz.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C2_kmYgW.js","/assets/chart-line-DlGG7Q7m.js","/assets/chart-pie-CeGMYNnK.js","/assets/chartRange-DzqVQWET.js","/assets/chevron-left-BP61q71r.js","/assets/chevrons-up-down-BujrhkgF.js","/assets/circle-D_gCoTD-.js","/assets/circle-check-big-B8ZrG4_I.js","/assets/circle-dot-ceAHklg4.js","/assets/circle-minus-V_rBg2BL.js","/assets/circle-slash-B5aznBM2.js","/assets/circle-user-round-DpIUakfh.js","/assets/cloud-off-x7Jb8oKU.js","/assets/cloud-upload-BJXbpeRG.js","/assets/compass-IcrnfVpn.js","/assets/concernCategories-B-TmmA5Z.js","/assets/copy-BvryChEx.js","/assets/corner-down-right-BEnmiJHM.js","/assets/createLucideIcon-CvWTUaLT.js","/assets/es-TkzNn2eP.js","/assets/exportXlsx-CVoM5n3F.js","/assets/external-link-D8YjCTbr.js","/assets/file-clock-B6E866Sz.js","/assets/file-exclamation-point-DEdSZqKX.js","/assets/file-spreadsheet-CQ2h31v1.js","/assets/file-text-kUdKAHRq.js","/assets/flag-H75S23Gl.js","/assets/flame-CxKIQmJm.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C2t0R0LP.js","/assets/hash-DG-rhyHH.js","/assets/history-DRZjmeuV.js","/assets/hourglass-D-BIoqBk.js","/assets/image-2CsYWEdN.js","/assets/image-off-CY4XK09a.js","/assets/index-BtjWqi6K.css","/assets/index-QsA6FosT.js","/assets/key-round-BMTc-oi1.js","/assets/keyboard-2_HDAP5F.js","/assets/languages-Duw1d24T.js","/assets/layers-BMSL82xX.js","/assets/lightbulb-CBdlWsfN.js","/assets/link-2-jquzlfHc.js","/assets/link-2-off-CkJw6Zgv.js","/assets/list-checks-BN2CqoJT.js","/assets/list-ordered-BxL_cVnR.js","/assets/list-tree-C4cOqQ2P.js","/assets/lock-open-DlcTzvjv.js","/assets/log-in-UXOv6o1T.js","/assets/maximize-2-gtk8vX3H.js","/assets/message-square-Dz68CTIC.js","/assets/minimize-2-BaIV99Qp.js","/assets/package-check-CKA5_j-7.js","/assets/paperclip-iQ6cET0L.js","/assets/pencil-CUdHgisM.js","/assets/percent-VjbUGyi-.js","/assets/personName-B4KId4zS.js","/assets/pin-DLzC_Cq8.js","/assets/pin-off-CWcg9ckE.js","/assets/play-BJkFcCj4.js","/assets/presentation-DdB9j-ON.js","/assets/prop-types-C8tlK9AX.js","/assets/radio-CCFFPwcj.js","/assets/react-apexcharts.esm-Css_JtwY.js","/assets/repeat-Bm9av7Z0.js","/assets/rotate-ccw-BtrA31q2.js","/assets/rotate-cw-0QBxqWKF.js","/assets/save-BvzW0az8.js","/assets/scale-DKbt2mb8.js","/assets/scroll-text-DhrDOehx.js","/assets/search-x-Cpr-L8Mc.js","/assets/segments-Z30syksI.js","/assets/send-DiP6_2DD.js","/assets/settings-2-C0KpCSQW.js","/assets/shield-B3-Fjrz0.js","/assets/shield-alert-BGKtVozm.js","/assets/shield-check-2ecS9-bW.js","/assets/shield-question-mark-DuJsG14P.js","/assets/siren-Cs_bweBE.js","/assets/snowflake-BEljIbri.js","/assets/square-Dd601FLN.js","/assets/square-check-big-bDPzJ7Bk.js","/assets/star-LXk9muHY.js","/assets/statusBands-ADv8aM5B.js","/assets/store-BcLFe4iN.js","/assets/table-2-CQvk1p9g.js","/assets/table-properties-pD4i0ObU.js","/assets/tag-Dajl3tie.js","/assets/timer-off-BZ2ZhZF2.js","/assets/trending-down-D4gcO7q_.js","/assets/trending-up-DWM1lS3Q.js","/assets/undo-2-nSHDqtqv.js","/assets/useChartTheme-BMdWLJNG.js","/assets/useElementWidth-BwblxolV.js","/assets/useIsMobile-Bb24hYkl.js","/assets/useMutation-FqTkk6a8.js","/assets/useStatusBands-COdC27Ya.js","/assets/user-BYn4nqhA.js","/assets/user-cog-Bx_wKwj0.js","/assets/user-minus-C3OHOluc.js","/assets/users-SdhdHUSX.js","/assets/video-BvSoYI96.js","/assets/wallet-BfKLcGE4.js","/assets/warehouse-wSP3RpX_.js","/assets/zap-DKqveFTF.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
