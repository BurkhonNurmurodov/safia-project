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

const BUILD = "2026-10-07T06:38:58.610Z";
const PRECACHE = ["/","/assets/AdminPanel-D1Ymbu2a.js","/assets/AnalysisBoard-B9ayj4Jk.js","/assets/Arc-CzgDxqCN.js","/assets/Assistant-CxwLaqFr.js","/assets/BrigadirProfile-nfZPx-uQ.js","/assets/BroadcastReceivers-BER1kwuH.js","/assets/BroadcastRecord-BAg-ZMT-.js","/assets/Button-CdRY22DH.js","/assets/CatLockNotice-Bx3MS9sy.js","/assets/CategoryLegendModal-BnFUiSjY.js","/assets/CellConcerns-C58IZNX2.js","/assets/CellDetails-DsX3x596.js","/assets/CellFormModal-U1ZOZg1P.js","/assets/CellIdent-ClVZy40O.js","/assets/CellLink-zhZtCFQ6.js","/assets/Cells-D1ZEU6B0.js","/assets/ColumnFilter-Bx8cpWyf.js","/assets/ColumnsPicker-CcrFMZVe.js","/assets/CommentsModal-fLv5CuM-.js","/assets/ComparisonTable-BebSathJ.js","/assets/Concerns-KPuJWl0R.js","/assets/Daily-BD-4yL0d.js","/assets/DataTable-BEdHjYDH.js","/assets/DateRangePicker-C8kWx1Ik.js","/assets/DayReportView-BcVhu-to.js","/assets/DayStepper-BnKXr-kQ.js","/assets/DifferenceBreakdown-BypsIDU8.js","/assets/Downtime-CPs-yd-u.js","/assets/Education-rHBbc1xc.js","/assets/EducationLesson-C8pAzgsk.js","/assets/EmptyState-DrfJRHaj.js","/assets/Exam-B4cdHiTb.js","/assets/FactorySelect-CjnnaMEC.js","/assets/Gamification-CrqJ_fCN.js","/assets/GroupBadge-DFDy0C7o.js","/assets/HeatmapChart-BGsbkMTc.js","/assets/IdleCell-BgeZ_nUS.js","/assets/KPICard-DFCrjtrp.js","/assets/Kaizen-CMs3lEq2.js","/assets/Kelish-CjsTw56N.js","/assets/KpiDeltaCard-XGA4S97H.js","/assets/LangTextInput-D0fxjdff.js","/assets/Layout-B7GvL-KV.js","/assets/LeaderAppeal-CTDgDGeL.js","/assets/LeaderDayReport-DhWoh_Zb.js","/assets/LeaderUnitReport-H2pngwQl.js","/assets/Leaderboard-DZcX158u.js","/assets/Leaders-Bay5QUS6.js","/assets/Lightbox-Chh8hQsQ.js","/assets/LiveOverview--YBCWSmU.js","/assets/Login-t6O5oR7Z.js","/assets/NotFound-CEbNh4Ve.js","/assets/Notifications-CD3eM_lf.js","/assets/Overview-DISenG3c.js","/assets/Pagination-DCLgerrl.js","/assets/PerenaladkaFactTable-B_wKLUKK.js","/assets/PersonCard-WeK-rZrP.js","/assets/PlanFulfillment-uq4QCx29.js","/assets/Production-B8Slcl_8.js","/assets/Profile-CMGq-PNs.js","/assets/ProofCamera-Bb2fY6g9.js","/assets/ProofPhoto-DDhYeuDo.js","/assets/Quality-DlgGpHJO.js","/assets/RawRows-Cefhx0fn.js","/assets/RequestStateChip-BwrQvBrw.js","/assets/RichTextEditor-BWlR5ZFF.js","/assets/SaveState-BAnHM4OI.js","/assets/SearchInput-dhmiv3G-.js","/assets/SeasonalityHeatmap-S6aLbj6n.js","/assets/SegmentedToggle-BITSBSb5.js","/assets/SetupTimes-DaiFSu2B.js","/assets/ShiftDaily-C8gzFu2R.js","/assets/Staff-B-Awmvl8.js","/assets/StatusBadge-D8G1jiBe.js","/assets/TargetGoal-DRv2FoRs.js","/assets/Targets-DQgFAepC.js","/assets/Tasks-DVZVzNAI.js","/assets/TimeWheelPicker-DPTGnyna.js","/assets/Toast-D2HeLd_Z.js","/assets/Tooltip-u8UoDgkq.js","/assets/TrendChart-B_CgmKB_.js","/assets/TripleSpeedometer-Cz-IHi3p.js","/assets/Trudoyomkost-D9VDLCTY.js","/assets/Turnover-BPv-yyD2.js","/assets/UploadDropzone-B2hHjPRo.js","/assets/UsersActivity-C7W6AgAt.js","/assets/VerdictBlock-x0X9bLyk.js","/assets/VfxApiMap-DLfXr4as.js","/assets/VfxDictionaries-DZpcFdQt.js","/assets/VfxEmployees-BGkB1MWc.js","/assets/VfxHrMoves-DAZhiUo9.js","/assets/VfxJobs-BYBGuf_X.js","/assets/VfxPhoto-BqG1Axtv.js","/assets/VfxShifts-BLxrfG1c.js","/assets/VfxState-DZj9wu3A.js","/assets/VfxTimebooks-CJCF1fzM.js","/assets/VfxTimesheet-Dcer9f2M.js","/assets/WatchProgress-CtIwL7AJ.js","/assets/WebLogin-BBzAWkQt.js","/assets/WorkerConcerns-BzernLRp.js","/assets/Workers-CQ-sw4DD.js","/assets/Zagruzka-DaRWtw7D.js","/assets/ZagruzkaCell-DrCM53Hw.js","/assets/api-BbdI_XiK.js","/assets/archive-CJM7ZJxR.js","/assets/archive-restore-NpseFCl5.js","/assets/arrow-down-Vl80jPPC.js","/assets/arrow-up-narrow-wide-DM3JH-fd.js","/assets/award-CVBep0zM.js","/assets/ban-Cdw8UW3G.js","/assets/boxes-BtgsfO16.js","/assets/braces-EkhQ4VUX.js","/assets/brigadirFilters-_mH8Vuos.js","/assets/broadcastTree-D-z-4Dwi.js","/assets/building-2-BKgB8hCA.js","/assets/calculator-D9OAK_sF.js","/assets/calendar-B8ErIRe_.js","/assets/calendar-days-CvPq9klc.js","/assets/camera-BSHaXjKG.js","/assets/categories-D9Fs8C7H.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C96wm39o.js","/assets/chart-line-C80hzLiA.js","/assets/chart-pie-yPxibkHh.js","/assets/chartRange-Cg-pDsWP.js","/assets/check-check-CEZYODXC.js","/assets/chevron-left-D0jdS9bo.js","/assets/chevrons-up-down-DsjIXBP7.js","/assets/circle-D3w5Q5GL.js","/assets/circle-alert-BSuMsSmE.js","/assets/circle-check-big-DcVBpIzx.js","/assets/circle-dashed-DlMmZspC.js","/assets/circle-minus-4nPpCsQ2.js","/assets/circle-question-mark-Dwvo3du3.js","/assets/circle-slash-CiqK1x8U.js","/assets/circle-user-round-Dn0gaht4.js","/assets/clock-3-2onnunRI.js","/assets/cloud-off-DR41x0-7.js","/assets/cloud-upload-CJUe69di.js","/assets/compass-D2UEXt9O.js","/assets/concernCategories-COPQ535E.js","/assets/copy-0bMrJS2Q.js","/assets/corner-down-right-BzNOIGnr.js","/assets/createLucideIcon-CtjKOr9p.js","/assets/es-qaTtSqMj.js","/assets/external-link-DK3eYP2l.js","/assets/file-clock-BievMauJ.js","/assets/file-exclamation-point-BcNYmkMP.js","/assets/flag-Bsbf_0Sl.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-9m8XfYTd.js","/assets/hash-Bf1p9MOz.js","/assets/hourglass-iKa_hOrb.js","/assets/image-GyYt_CC3.js","/assets/image-off-DOZImoMi.js","/assets/inbox-CwBOmO1q.js","/assets/index-B7yzqq84.css","/assets/index-DwQCrDAy.js","/assets/keyboard-DehwRrxE.js","/assets/languages-DgnJSBFW.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C0XXmWsl.js","/assets/lightbulb-DVbCZFX-.js","/assets/link-2-DBuAl4d8.js","/assets/link-2-off-Ce2R56t3.js","/assets/list-ordered-2iPP2GNK.js","/assets/list-tree-D5G22JZv.js","/assets/lock-open-B0qyM8C8.js","/assets/log-in-BpKeFv58.js","/assets/minimize-2-DRWdQ2U_.js","/assets/package-check-B9SQoDUV.js","/assets/pencil-DK7eRJqy.js","/assets/percent-Ac4vA4Qo.js","/assets/pin-off-CLPrzcly.js","/assets/pin-z4qa-_KK.js","/assets/play-BagWYhLo.js","/assets/plug-zap-l7rrxuOu.js","/assets/prop-types-eUWtBw1F.js","/assets/radio-C6zPWs7M.js","/assets/react-apexcharts.esm-Bt7irakj.js","/assets/registers-BvzLTbiX.js","/assets/repeat-DYFO9poj.js","/assets/save-BhqAykYj.js","/assets/scopeLinks-B3OGbKGn.js","/assets/scroll-text-lzg-TKc5.js","/assets/search-x-B7qtx6R4.js","/assets/segments-BVCJR-oA.js","/assets/send-kf4IhOWR.js","/assets/settings-2-9qCMnr3m.js","/assets/shield-ByfCydgM.js","/assets/shield-alert-CbNn1nrH.js","/assets/shield-question-mark-Dl4FXzeL.js","/assets/siren-wXIdbVnG.js","/assets/snowflake-D_3VmKAs.js","/assets/split-sWIhQUMs.js","/assets/square-check-big-DSd2C-JH.js","/assets/star-BIDKfcgF.js","/assets/statusBands-CMEeHFM1.js","/assets/store-DggFFJR9.js","/assets/table-2-B--EzMC3.js","/assets/table-properties-B-7eaLUT.js","/assets/tag-hDvdqllH.js","/assets/timer-off-BH6YtfhQ.js","/assets/trending-down-CMBJal6U.js","/assets/trending-up-BIB0-4di.js","/assets/undo-2-DNhV8d6T.js","/assets/useChartTheme-Wxt5fEi9.js","/assets/useElementWidth-BFD2Iuw7.js","/assets/useIsMobile-D6ANXmQw.js","/assets/useOpenParam-eaQO2i9M.js","/assets/useStatusBands-BDGVJ_YW.js","/assets/useUrlScope-DhIv6Uly.js","/assets/user-Cdg1MGSf.js","/assets/user-cog-Q24XRQIb.js","/assets/users-B0Hl4zGB.js","/assets/vfx-CBOUTFBC.js","/assets/video-BbyU7lKz.js","/assets/wallet-52mlnouc.js","/assets/warehouse-9Ste3W4n.js","/assets/x-epxwrHre.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
