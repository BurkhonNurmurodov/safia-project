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

const BUILD = "2026-09-29T14:11:37.708Z";
const PRECACHE = ["/","/assets/AdminPanel-BfjgjprB.js","/assets/AnalysisBoard-BbVid-UD.js","/assets/Arc-2Y9p3GMY.js","/assets/ArcLegacy-Dq4J7DD4.js","/assets/AttendanceModal-DURsfuJO.js","/assets/BrigadirProfile-9KaGBdGw.js","/assets/BroadcastReceivers-DVBHBqRK.js","/assets/BroadcastRecord-BCy2DWlE.js","/assets/CatLockNotice-DlCvdouJ.js","/assets/CategoryLegendModal-CFPhtAG5.js","/assets/CellConcerns-BoFY-Elr.js","/assets/CellDetails-BgwXlKPG.js","/assets/CellFormModal-DFiUDG_z.js","/assets/CellLink-CQFvEgYJ.js","/assets/Cells-DgP1MSMF.js","/assets/ColumnFilter-ig-zcBRV.js","/assets/ColumnsPicker-DtrAe_7f.js","/assets/CommentsModal-BrkXEUPi.js","/assets/ComparisonTable-DDFUdffy.js","/assets/Concerns-CdtTKvtJ.js","/assets/ConfirmDialog-DZduyDQG.js","/assets/Daily-CaZ37iuZ.js","/assets/DataTable-DN44YH30.js","/assets/DateRangePicker-xA1rcI0Z.js","/assets/DayReportView-Ch-eW2hy.js","/assets/DayStepper-UdX57Xt3.js","/assets/DifferenceBreakdown-BQRd7KUn.js","/assets/Downtime-bgRxqzov.js","/assets/Education-pMe3Buv9.js","/assets/EducationLesson-AcVl2004.js","/assets/EmptyState-B8gqaxJM.js","/assets/Exam-p9VXLLU4.js","/assets/FactorySelect-DDFt3Vty.js","/assets/Gamification-MG5wFeMp.js","/assets/GroupBadge-DH-apcU_.js","/assets/HeatmapChart-wn4yP6OJ.js","/assets/IdleCell-C3xYhYgx.js","/assets/KPICard-BJ75-t1b.js","/assets/Kaizen-CaQnA_Tg.js","/assets/Kelish-opTwFz02.js","/assets/KpiDeltaCard-zZcl91-r.js","/assets/LangTextInput-BWhlZvsL.js","/assets/Layout-Bv7xYu3m.js","/assets/LeaderAppeal-BfbXcHDg.js","/assets/LeaderDayReport-sUqQyBj1.js","/assets/LeaderUnitReport-CTT4F-3y.js","/assets/Leaderboard-CqO1uiFj.js","/assets/Leaders-BdrMnJm_.js","/assets/Lightbox-BLwHh1ar.js","/assets/LiveOverview-Cz67rFD7.js","/assets/Login-BS3jItq6.js","/assets/NotFound-ChueiH2A.js","/assets/Overview-BSwX_pSC.js","/assets/Pagination-BEPaggM3.js","/assets/PerenaladkaFactTable-Ccbr5J_B.js","/assets/PlanFulfillment-DLLjvijb.js","/assets/Production-DW8XpY8M.js","/assets/Profile-FH0Uvj9a.js","/assets/ProofCamera-DwgFPSy4.js","/assets/ProofPhoto-Ccuze9x1.js","/assets/Quality-D5RURCmX.js","/assets/RequestStateChip-DxfIWZBw.js","/assets/RichTextEditor-D3Eicynv.js","/assets/SaveState-Bvv7SXZv.js","/assets/SearchInput-W5qo9soD.js","/assets/SeasonalityHeatmap-orrNof0H.js","/assets/SegmentedToggle-Cdt6p80Y.js","/assets/SetupTimes-CPe_DtFo.js","/assets/ShiftDaily-C3XIlyYD.js","/assets/Staff-EcWantZw.js","/assets/StatusBadge-9VUgF8H3.js","/assets/TargetGoal-Bxq_sgVl.js","/assets/Targets-Bho5z6as.js","/assets/Tasks-Bh2hyqUH.js","/assets/TimeWheelPicker-BX2C8nt-.js","/assets/Tooltip-nKa0HIAb.js","/assets/TrendChart-XOb41J6P.js","/assets/TripleSpeedometer-BnSmeLV-.js","/assets/Trudoyomkost-pjQoIEER.js","/assets/UploadDropzone-CuOTeFMW.js","/assets/UsersActivity-n8Hp9UaW.js","/assets/VerdictBlock-CVidCSz-.js","/assets/WatchProgress-BPR2m6Pt.js","/assets/WebLogin-Bqxcrawi.js","/assets/WorkerConcerns-C3oXPA8s.js","/assets/Workers-CpIHcgiC.js","/assets/Zagruzka-ClDdjhL7.js","/assets/ZagruzkaCell-4O10ayjS.js","/assets/api-CSfcDhNq.js","/assets/archive-CXQZao9N.js","/assets/archive-restore-hDujIcia.js","/assets/arrow-down-Dnjp46zx.js","/assets/arrow-left-DFAPvos6.js","/assets/arrow-left-right-D_Sggs-u.js","/assets/arrow-up-C5smR2FV.js","/assets/arrow-up-narrow-wide-J-OuiG-v.js","/assets/arrow-up-right-DFCqH5Ys.js","/assets/award-BXA4pIJI.js","/assets/ban-DthIWp5Z.js","/assets/bot-CVZ55Z0V.js","/assets/boxes-Dm8GNnIz.js","/assets/brigadirFilters-DBuEN5Dy.js","/assets/broadcastTree-B51Mk1XH.js","/assets/building-2-C9ya_YJK.js","/assets/calendar-DROukC3a.js","/assets/calendar-clock-Ct078VmI.js","/assets/calendar-days-B4v3oOap.js","/assets/calendar-range-C2uoUSsN.js","/assets/camera-CrSSrs2w.js","/assets/categories-COZrthZ0.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6gmGlRr.js","/assets/chart-line-vQD-YUZb.js","/assets/chart-pie-CoIvP6oa.js","/assets/chartRange-DlemA2f_.js","/assets/chevron-left-Bs1X_E5x.js","/assets/chevrons-up-down-BJafPKXi.js","/assets/circle-CVPF6a6c.js","/assets/circle-check-big-0ZaTill9.js","/assets/circle-dot-NLR6nfbk.js","/assets/circle-minus-uZ1D7n7I.js","/assets/circle-slash-Bmk0iMoc.js","/assets/circle-user-round-XLItZUGu.js","/assets/cloud-off-DmNGl2v0.js","/assets/cloud-upload-C4yhnCxE.js","/assets/compass-DaLQS-1A.js","/assets/concernCategories-BJYUuM1X.js","/assets/copy-qB6f_fO-.js","/assets/corner-down-right-DUqzQnp9.js","/assets/createLucideIcon-CgwfuNIK.js","/assets/es-fw9kQpAa.js","/assets/exportXlsx-5ZadlCzs.js","/assets/external-link-B529N0EP.js","/assets/file-clock-ZXENAC9-.js","/assets/file-exclamation-point-lnlmM9V4.js","/assets/file-spreadsheet-SNOWPzcA.js","/assets/file-text-BG5wtusx.js","/assets/flag-D37uifu5.js","/assets/flame-ox0WRpgn.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Cp4wZalo.js","/assets/hash-CEw1RQF5.js","/assets/history-_86yFH-B.js","/assets/hourglass-CrnumIQA.js","/assets/image-PEETbF25.js","/assets/image-off-BsVJStl6.js","/assets/index-ClcfsWXQ.css","/assets/index-MBcYkyve.js","/assets/key-round-D0vQjcej.js","/assets/keyboard-C9rRml8U.js","/assets/languages-CD_lojS3.js","/assets/layers-3PGUb5B_.js","/assets/lightbulb-DYHe79GR.js","/assets/link-2-BuTxZjST.js","/assets/link-2-off-BlnWsNkd.js","/assets/list-checks-CsUeMCaV.js","/assets/list-ordered-CKb7NIyN.js","/assets/list-tree-DpZbJyFe.js","/assets/lock-open-DH-kqN34.js","/assets/log-in-CqHQgCjw.js","/assets/maximize-2-TzRulh5W.js","/assets/message-square-BSCi8n0x.js","/assets/minimize-2-RI-AwUw_.js","/assets/package-check-D9bnh2b2.js","/assets/paperclip-B3kwqy4f.js","/assets/pencil-C9k88zcu.js","/assets/percent-CRHzCKV2.js","/assets/personName-CogOuS3K.js","/assets/pin-B90fswEq.js","/assets/pin-off-OSWElEHE.js","/assets/play-Bk3LxZDk.js","/assets/presentation-DSLnKDsv.js","/assets/prop-types-DH-TJhoK.js","/assets/radio-CS9pEGs_.js","/assets/react-apexcharts.esm-Cr1RQX3G.js","/assets/repeat-DcV9sv48.js","/assets/rotate-ccw-Dp_GbMwT.js","/assets/rotate-cw-B-DDxJAH.js","/assets/save-DnJfLkoT.js","/assets/scale-CwoZ2tJy.js","/assets/scroll-text-v9bXWKm7.js","/assets/search-x-CTdZpP-n.js","/assets/segments-_5uXgau2.js","/assets/send-BmAx21bz.js","/assets/settings-2-CEB0t7wZ.js","/assets/shield-Bw03hTVb.js","/assets/shield-alert-lrEx6yom.js","/assets/shield-check-C836LK_X.js","/assets/shield-question-mark-B5njX-Vq.js","/assets/siren-CQw91O7G.js","/assets/snowflake-skbmP013.js","/assets/square-DvM5LA5x.js","/assets/square-check-big-C-SYRdRu.js","/assets/star-vviSKYVj.js","/assets/statusBands-DiiffGRX.js","/assets/store-4loZCk7l.js","/assets/table-2-BiEPX730.js","/assets/table-properties-Q_zQ6eOz.js","/assets/tag-DkOS1H8c.js","/assets/timer-off-Cy9u9HG4.js","/assets/trending-down-0wAHrDyV.js","/assets/trending-up-C0rbSkAq.js","/assets/undo-2-CwyC2eLz.js","/assets/useChartTheme-CPrFWKX0.js","/assets/useElementWidth-BSpkcrU9.js","/assets/useIsMobile-ZtfQgzao.js","/assets/useMutation-g32v1tnk.js","/assets/useStatusBands-Dm8-XOQ-.js","/assets/user-CIMBnaHq.js","/assets/user-cog-DRGYhxIV.js","/assets/user-minus-C8ejGQa_.js","/assets/users-BpMF3xgv.js","/assets/video-2mCvaLPr.js","/assets/wallet-C5izIG7P.js","/assets/warehouse-LKvR83u9.js","/assets/zap-DFXxMi2S.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
