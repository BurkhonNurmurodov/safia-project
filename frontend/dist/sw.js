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

const BUILD = "2026-09-28T11:47:30.214Z";
const PRECACHE = ["/","/assets/AdminPanel-UoGwHYOu.js","/assets/AnalysisBoard-C8wO6bx8.js","/assets/Arc-DMyiVvXf.js","/assets/ArcLegacy-LNijMZp5.js","/assets/AttendanceModal-CFr7dbrC.js","/assets/BrigadirProfile-BehWzMJq.js","/assets/BroadcastReceivers-DYhTPTxV.js","/assets/BroadcastRecord-CliDVnmG.js","/assets/CatLockNotice-y1sNkqY2.js","/assets/CategoryLegendModal-CEEEt3rB.js","/assets/CellConcerns-CjHX7_VP.js","/assets/CellDetails-BWwDBcdB.js","/assets/CellFormModal-CA-c83wK.js","/assets/CellLink-QFCnTCRH.js","/assets/Cells-CmSiMf_T.js","/assets/ColumnFilter-DvftEW0k.js","/assets/ColumnsPicker-DCp76sLh.js","/assets/CommentsModal-20agFREp.js","/assets/ComparisonTable-BgkBUOac.js","/assets/Concerns-DQItKigM.js","/assets/ConfirmDialog-Dg7nt2bO.js","/assets/Daily-tTai7P7Y.js","/assets/DataTable-Cti-OJ8J.js","/assets/DateRangePicker-Dt6UQwWA.js","/assets/DayReportView-ClM29TGk.js","/assets/DayStepper-DqA3Ee7C.js","/assets/DifferenceBreakdown-ChsIb5Q0.js","/assets/Downtime-Cui0pSuf.js","/assets/Education-95L0XXG3.js","/assets/EducationLesson-B1olL7lf.js","/assets/EmptyState-BBlUeuv6.js","/assets/Exam-ZfOBvkA3.js","/assets/FactorySelect-pPGomZ3Y.js","/assets/Gamification-BenXCNF-.js","/assets/GroupBadge-BECI-ORQ.js","/assets/HeatmapChart-gicbGykK.js","/assets/IdleCell-CqgzsTPy.js","/assets/KPICard-CGAkLT2V.js","/assets/Kaizen-DONOCHgF.js","/assets/KpiDeltaCard-CR4Ntpq8.js","/assets/LangTextInput-D98CjGpY.js","/assets/Layout-Py9rV30I.js","/assets/LeaderAppeal-BsvKIhYx.js","/assets/LeaderDayReport-HmOZYWFf.js","/assets/LeaderUnitReport-C4QqqyVj.js","/assets/Leaderboard-Dt_HDAt6.js","/assets/Leaders-D-x1PJP_.js","/assets/Lightbox-B__Sc3pn.js","/assets/LiveOverview-nrPlEtw4.js","/assets/Login-Dk5dFKdh.js","/assets/NotFound-DzcG12J7.js","/assets/Overview-DPkpmrMw.js","/assets/Pagination-DqX00HVu.js","/assets/PerenaladkaFactTable-CTKyHXgk.js","/assets/PlanFulfillment-BOjncq90.js","/assets/Production-BpDw7tFw.js","/assets/Profile-BPz7SgS7.js","/assets/ProofCamera-DCj97JNm.js","/assets/ProofPhoto-6uIFX9-O.js","/assets/Quality-Du1gwpiT.js","/assets/RequestStateChip-DK1A0k2l.js","/assets/RichTextEditor-D2wwWiZE.js","/assets/SaveState-CoYVtuDW.js","/assets/SearchInput-BT92-_86.js","/assets/SeasonalityHeatmap-DHeYYsmL.js","/assets/SegmentedToggle-DM_2XDRd.js","/assets/SetupTimes-BfPLPrNj.js","/assets/ShiftDaily-dKc5-ziX.js","/assets/Staff-BpXL1Otr.js","/assets/StatusBadge-CsVptopP.js","/assets/TargetGoal-lfrq1xgW.js","/assets/Targets-dU5K9msE.js","/assets/Tasks-C2nU4w8R.js","/assets/TimeWheelPicker-BCylGKV8.js","/assets/Tooltip-BngAJ92U.js","/assets/TrendChart-Bzo5zxPB.js","/assets/TripleSpeedometer-BHyU-QSY.js","/assets/Trudoyomkost-DfyeZAbA.js","/assets/UsersActivity-zSyKTDOI.js","/assets/WatchProgress-BL56l-D9.js","/assets/WebLogin-BG8v6Q7Y.js","/assets/WorkerConcerns-CjW_G_Pe.js","/assets/Workers-BZkqeQXm.js","/assets/Zagruzka-MleDqHje.js","/assets/ZagruzkaCell-D8pS0k8N.js","/assets/alarm-clock-CyfGvoii.js","/assets/api-DrDjme-Z.js","/assets/archive-BIcYocBx.js","/assets/archive-restore-ChJx7Eb5.js","/assets/arrow-down-Iz1CQIAw.js","/assets/arrow-left-right-DomnsAck.js","/assets/arrow-left-vSWY4Jyb.js","/assets/arrow-up-bGc4wQMx.js","/assets/arrow-up-right-DK-kkzCE.js","/assets/award-BSjSykCW.js","/assets/ban-DpVO6ehv.js","/assets/bot-CdDoYkL1.js","/assets/boxes-DIckGcHw.js","/assets/brigadirFilters-CtKJ4UzC.js","/assets/broadcastTree-EXKwCfNQ.js","/assets/building-2-WA2R67Wf.js","/assets/calendar-CkPCdDj_.js","/assets/calendar-clock-COsKX8mm.js","/assets/calendar-days-DiyKm6mF.js","/assets/calendar-range-BNJuHmaM.js","/assets/camera-C77Op_E2.js","/assets/categories-8nE6aFb_.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B-XMjogu.js","/assets/chart-line-Do8cWE4M.js","/assets/chart-pie-D7qFgu88.js","/assets/chartRange-CDlXHR2i.js","/assets/chevron-left-sQTNHhBi.js","/assets/chevrons-up-down-CI5sSQc7.js","/assets/circle-check-big-DOde0gox.js","/assets/circle-dot-CkPhnJgx.js","/assets/circle-minus-DdNNPY0V.js","/assets/circle-slash-DWdPClVQ.js","/assets/circle-user-round-D8251Mj-.js","/assets/cloud-off-BAcVej4_.js","/assets/cloud-upload-WxQuolRD.js","/assets/compass-ChTulULF.js","/assets/concernCategories-C2deqObi.js","/assets/copy-DP9sALeD.js","/assets/corner-down-right-lG2p3e9-.js","/assets/createLucideIcon-DSzuLCN1.js","/assets/es-B6dhwwBx.js","/assets/exportXlsx-RhG2TjoB.js","/assets/external-link-CAiqIvHs.js","/assets/file-clock-DnwvbwZO.js","/assets/file-exclamation-point-DWH9sSax.js","/assets/file-spreadsheet-CvHoSP3K.js","/assets/file-text-CQADP_Vy.js","/assets/flag-Bc8WXtQj.js","/assets/flame-Dh3-U27I.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DLTyghWQ.js","/assets/hash-B_omdSzr.js","/assets/history-CFJ7IxXY.js","/assets/hourglass-Oc_CHX5s.js","/assets/image-BalnZ7jk.js","/assets/image-off-DwZiYxpz.js","/assets/index-DnyVfTtt.js","/assets/index-TBzEnSGJ.css","/assets/key-round-DxESD37Q.js","/assets/keyboard-BToRpebV.js","/assets/languages-BdriYLae.js","/assets/layers-BTlq8gvd.js","/assets/leaderReason-Di-hrftN.js","/assets/lightbulb-BQm_E3e7.js","/assets/link-2-CIJLx6YH.js","/assets/list-checks-DXF1Nua2.js","/assets/list-ordered-B1uw-3lD.js","/assets/list-tree-DaUzGb3N.js","/assets/lock-open-Dqfh1ris.js","/assets/log-in-CNB7LJEI.js","/assets/message-square-BTTT76BC.js","/assets/minimize-2-DM0Gpl9N.js","/assets/package-check-WCQU8qOI.js","/assets/paperclip-CYh_hq7v.js","/assets/pencil-tZeZf65W.js","/assets/personName-B4KId4zS.js","/assets/pin-BthIBV3a.js","/assets/pin-off-CzTGWgf9.js","/assets/play-MqyoUPnW.js","/assets/presentation-CZ_JbRk3.js","/assets/prop-types-CA4qcAJG.js","/assets/radio-BRBjjkTh.js","/assets/react-apexcharts.esm-D_5orKqP.js","/assets/repeat-L5IxiODb.js","/assets/rotate-ccw-Bzuk96lu.js","/assets/rotate-cw-IFyL_KUC.js","/assets/save-D3VROW1G.js","/assets/scale-D2JMrhGE.js","/assets/scroll-text-CNZ3jAV6.js","/assets/search-x-BzJkfSW3.js","/assets/segments-B5Tk-lHn.js","/assets/send-VboVlM1R.js","/assets/settings-2-B6-OS_ge.js","/assets/shield-alert-DA0OYTd5.js","/assets/shield-check-GTtNVAu5.js","/assets/shield-mHHFBLlz.js","/assets/shield-question-mark-B_ZTHt05.js","/assets/siren-osv4naXn.js","/assets/smartphone-DboyAUDT.js","/assets/snowflake-BGmgqSJq.js","/assets/square-H6FEFh2c.js","/assets/square-check-big-FxxPw5YB.js","/assets/star-bV9ydrTu.js","/assets/statusBands-g6vBDkSq.js","/assets/store-C5dZeptV.js","/assets/table-2-Cm7e_6vD.js","/assets/tag-CM1FtHcC.js","/assets/trending-down-CMuPYzb2.js","/assets/trending-up-DsP4Ztu5.js","/assets/undo-2-BAR7xCUT.js","/assets/useChartTheme-CJV7XDDK.js","/assets/useElementWidth-C44lelpS.js","/assets/useIsMobile-BxUfM66v.js","/assets/useMutation-BCaTsIrQ.js","/assets/useStatusBands-BFzDSexr.js","/assets/user-Lo5TaqMS.js","/assets/user-check-BHN0x3Yl.js","/assets/user-cog-Cpdx3wg_.js","/assets/user-minus-Ch8GMBs4.js","/assets/users-BEMKS5Fd.js","/assets/verifyState-svDA8pcT.js","/assets/video-DouWs3QQ.js","/assets/wallet-Dv13se5n.js","/assets/warehouse-DaNgFPQJ.js","/assets/zap-D8JD4CNA.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
