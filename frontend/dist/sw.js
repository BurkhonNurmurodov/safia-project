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

const BUILD = "2026-10-05T05:10:38.525Z";
const PRECACHE = ["/","/assets/AdminPanel-Uz-Q35VD.js","/assets/AnalysisBoard-B95EiT-o.js","/assets/Arc-C95xKVQd.js","/assets/ArcLegacy-D38kSHYT.js","/assets/BrigadirProfile-QzOIB4g-.js","/assets/BroadcastReceivers-x4yaU_9F.js","/assets/BroadcastRecord-BumdVLLp.js","/assets/CatLockNotice-BGdlVPe4.js","/assets/CategoryLegendModal-CCir2dXr.js","/assets/CellConcerns-DUOr_Aty.js","/assets/CellDetails-CsJu_Lo7.js","/assets/CellFormModal-DN0HvIs4.js","/assets/CellIdent-D_ytkIyj.js","/assets/CellLink-BQeotb6j.js","/assets/Cells-Dt47dotV.js","/assets/ColumnFilter-CnyT62Fi.js","/assets/ColumnsPicker-Dzwb2qo2.js","/assets/CommentsModal-BbVWvzKl.js","/assets/ComparisonTable-Cds5EYm5.js","/assets/Concerns-B-7nouKT.js","/assets/ConfirmDialog-adfe8AA4.js","/assets/Daily-B_8WFJBQ.js","/assets/DataTable-2fWEFuSx.js","/assets/DateRangePicker-BGJVUNHx.js","/assets/DayReportView-D51zx-ES.js","/assets/DayStepper-C-CwcxpU.js","/assets/DifferenceBreakdown-IIoSIUfk.js","/assets/Downtime-BFLHXA1c.js","/assets/Education-1X9FAqr4.js","/assets/EducationLesson-CQl70X4i.js","/assets/EmptyState-CtWEf06i.js","/assets/Exam-ykp0YXJt.js","/assets/FactorySelect-tKQEhlOK.js","/assets/Gamification-BcqUoK_6.js","/assets/GroupBadge-UHl7PgQT.js","/assets/HeatmapChart-DLLEHrNM.js","/assets/IdleCell-CWMzToFZ.js","/assets/KPICard-BFbmawFB.js","/assets/Kaizen-DTabw-Gj.js","/assets/Kelish-C1wlPz5u.js","/assets/KpiDeltaCard-DohANxrI.js","/assets/LangTextInput-DhNh0j04.js","/assets/Layout-C6Z9Tuwj.js","/assets/LeaderAppeal-_zbKmESt.js","/assets/LeaderDayReport-Csp6qfYS.js","/assets/LeaderUnitReport-Bc0VmZYh.js","/assets/Leaderboard-NAPirrpo.js","/assets/Leaders-CxZWOlbP.js","/assets/Lightbox-B3lync_g.js","/assets/LiveOverview-BVWe4Yjk.js","/assets/Login-CaAwLLoW.js","/assets/NotFound-D280dfdp.js","/assets/Notifications-DUbF67Hr.js","/assets/Overview-CyKomehT.js","/assets/Pagination-te78y3eo.js","/assets/PerenaladkaFactTable-Duze32zl.js","/assets/PersonCard-6MJeI9aF.js","/assets/PlanFulfillment-DjsGABzA.js","/assets/Production-DfcovDuh.js","/assets/Profile-B__aXNpG.js","/assets/ProofCamera-DPEubjkd.js","/assets/ProofPhoto-yca8NPJH.js","/assets/Quality-Dt7qcw7A.js","/assets/RawRows-DvqlswSr.js","/assets/RequestStateChip-rG4BNw8S.js","/assets/RichTextEditor-Bp96Ofov.js","/assets/SaveState-BbCgRfLw.js","/assets/SearchInput-D1cBIjHh.js","/assets/SeasonalityHeatmap-B_9PLWqj.js","/assets/SegmentedToggle-DbYlMYMH.js","/assets/SetupTimes-B5LEnsf4.js","/assets/ShiftDaily-4Y5XoT67.js","/assets/Staff-D0ekaR42.js","/assets/StaffLive-CpuTusgk.js","/assets/StatusBadge-Cmik207H.js","/assets/TargetGoal-DxabAFqa.js","/assets/Targets-BzWp2nnN.js","/assets/Tasks-BlbhkmTT.js","/assets/TimeWheelPicker-BapTSPvo.js","/assets/Toast-6M0GnwSb.js","/assets/Tooltip-deeu-c__.js","/assets/TrendChart-CG0X_Q3V.js","/assets/TripleSpeedometer-DrzBst-u.js","/assets/Trudoyomkost-DR9Ma0M7.js","/assets/Turnover-Ccuztpd-.js","/assets/UploadDropzone-BZn4RCUU.js","/assets/UsersActivity-52sd0_8-.js","/assets/VerdictBlock-CRvqO4_W.js","/assets/VfxApiMap-BVZiSCr7.js","/assets/VfxDictionaries-Di6W2WN4.js","/assets/VfxEmployees-XkSUdZvu.js","/assets/VfxHrMoves-CXSV80Ad.js","/assets/VfxJobs-CpaodOZd.js","/assets/VfxPhoto-CTuO79UM.js","/assets/VfxShifts-DVzBsqwZ.js","/assets/VfxState-Q1gPgkiL.js","/assets/VfxTimebooks-CFjY-Hbg.js","/assets/VfxTimesheet-YtaoGxM5.js","/assets/WatchProgress-Bw2jbE5_.js","/assets/WebLogin-Cd9mx8Op.js","/assets/WorkerConcerns-O67qFpm2.js","/assets/Workers-GKXRIrmw.js","/assets/Zagruzka-ldo7XoY8.js","/assets/ZagruzkaCell-QSI6dpuZ.js","/assets/api-BPTOPSjF.js","/assets/archive-BSeLAy8p.js","/assets/archive-restore-B1_3r0Qb.js","/assets/arrow-down-C0iISkcU.js","/assets/arrow-left-YFxR-WBm.js","/assets/arrow-up-1XFYKq6U.js","/assets/arrow-up-narrow-wide-B_aZE1Gc.js","/assets/arrow-up-right-DXPc82iw.js","/assets/award-S9ue8H7D.js","/assets/ban-CLJR57pk.js","/assets/book-open-ATd8ta_G.js","/assets/bot-C2KNZsTq.js","/assets/boxes-Cna_KNxK.js","/assets/braces-CSx6Sq_t.js","/assets/brigadirFilters-Dc9MDLPr.js","/assets/broadcastTree-m8w-eCLn.js","/assets/building-2-DyVvB-4o.js","/assets/calculator-BiGBoizW.js","/assets/calendar-CgcWzAa-.js","/assets/calendar-days-C2YwizZ0.js","/assets/camera-BjlF6j-S.js","/assets/categories-CgVlJscl.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C2T_1BOk.js","/assets/chart-line-PfFmWNpB.js","/assets/chart-pie-BAeH18a5.js","/assets/chartRange-B5_FhdSe.js","/assets/check-check-J8HSftBG.js","/assets/chevron-left-BCHNwD0B.js","/assets/chevrons-up-down-C6FGGeYB.js","/assets/circle-DrL5Q452.js","/assets/circle-alert-B8Wls3_u.js","/assets/circle-check-big-Bf-JpGJh.js","/assets/circle-dashed-ByRON2nX.js","/assets/circle-minus-CgW7KJ-f.js","/assets/circle-question-mark-Yk_8FRaP.js","/assets/circle-slash-DCFrOlHn.js","/assets/circle-user-round-CLBotuMj.js","/assets/clock-3-CHqNwzHF.js","/assets/cloud-off-C10levwL.js","/assets/cloud-upload-DGdIlPo1.js","/assets/compass-JRyrpuim.js","/assets/concernCategories-Bn1ZN-4C.js","/assets/copy-BlN3FDhE.js","/assets/corner-down-right-DzjSXhVA.js","/assets/createLucideIcon-BlLaZbLo.js","/assets/es-UCQ0CmD5.js","/assets/exportXlsx-CvsS82hJ.js","/assets/external-link-CIpaPK4H.js","/assets/file-clock-BQN_EE6z.js","/assets/file-exclamation-point-D2LS5-Fp.js","/assets/file-spreadsheet-CHBD--u8.js","/assets/file-text-DiwOE021.js","/assets/flag-Jw125trc.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DherrY43.js","/assets/hash-CBkU76DL.js","/assets/history-BkBdqxy-.js","/assets/hourglass-M7yAgCws.js","/assets/image-9pMC1eix.js","/assets/image-off-aoZQCMoY.js","/assets/inbox-DuiuxOpE.js","/assets/index-4VpxUmzt.js","/assets/index-DifRFzch.css","/assets/key-round-BTbm85xj.js","/assets/keyboard-BUlBuhgX.js","/assets/languages-BE2xGWwN.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CUJAXzzJ.js","/assets/lightbulb-DGPX__Xy.js","/assets/link-2-WRn7-sZD.js","/assets/link-2-off-DJ1Se2Sn.js","/assets/list-ordered-DY_6zXay.js","/assets/list-tree-BJS0cTJS.js","/assets/lock-open-BQ5lZ0wy.js","/assets/log-in-Dli8q61Y.js","/assets/maximize-2-mqQkFBsq.js","/assets/message-square-CzTR9-E-.js","/assets/minimize-2-D7h2EB6T.js","/assets/package-check-DfFRr9cB.js","/assets/paperclip-BM33ylUz.js","/assets/pencil-CGaBs19G.js","/assets/percent-C3TvU4T_.js","/assets/pin-B4sY32JX.js","/assets/pin-off-Bi-u-GLw.js","/assets/play-DdyS-9Bi.js","/assets/plug-zap-JlQDBhpJ.js","/assets/presentation-DKsNgB6e.js","/assets/prop-types-CarsJpHN.js","/assets/radio-CmWtnHfA.js","/assets/react-apexcharts.esm-DjZB3UHm.js","/assets/registers-BtsrhG1c.js","/assets/repeat-Ci24fMFO.js","/assets/rotate-ccw-BsDfbO9h.js","/assets/rotate-cw-CVBfye5I.js","/assets/save-DtUiPiWD.js","/assets/scopeLinks-BNpZlIUv.js","/assets/scroll-text-BxYbEEeR.js","/assets/search-x-Ba8V0qHJ.js","/assets/segments-BJHAFyag.js","/assets/send-T9GRDQ4X.js","/assets/settings-2-DmRtGo3j.js","/assets/shield-KCBtsc4a.js","/assets/shield-alert-BaMlIjAG.js","/assets/shield-check-CYxLeRSU.js","/assets/shield-question-mark-C1bj47K4.js","/assets/siren-D5sJtkqO.js","/assets/snowflake-D5-Bjnth.js","/assets/split-B34G4lqS.js","/assets/square-CEUZJquR.js","/assets/square-check-big-D2k_QvJU.js","/assets/star-C_mHWpbg.js","/assets/statusBands-DEOM8u5I.js","/assets/store-COs-aTCC.js","/assets/table-2-BDAyzAGi.js","/assets/table-properties-mwxhEN6A.js","/assets/tag-B_b2jW8n.js","/assets/timer-off-B2a4qwfJ.js","/assets/trending-down-DiBO4kfz.js","/assets/trending-up-BFPXY9SR.js","/assets/undo-2-DGBfaBjG.js","/assets/useChartTheme-D2WoUvrE.js","/assets/useElementWidth-BKzKUe6T.js","/assets/useIsMobile-DT_fdS7O.js","/assets/useOpenParam-kqkAnjWY.js","/assets/useStatusBands-CcjvvcfR.js","/assets/useUrlScope-CZhML7Pt.js","/assets/user-CYXExrL8.js","/assets/user-cog-BCDOOz_B.js","/assets/users-BOoqx0A4.js","/assets/vfx-DAgZS3x1.js","/assets/video-Dkx85XDV.js","/assets/wallet-D96oElwS.js","/assets/warehouse-CN5MjBN2.js","/assets/x-Csd3AUIf.js","/assets/zap-CuGpUM8K.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
