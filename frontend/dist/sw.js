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

const BUILD = "2026-10-08T14:46:35.448Z";
const PRECACHE = ["/","/assets/AdminPanel-BC9pgKRU.js","/assets/AnalysisBoard-BD30DzLi.js","/assets/Arc-yhB5UyjX.js","/assets/Assistant-BqdBH0zD.js","/assets/BrigadirProfile-g8SO1MIU.js","/assets/BroadcastReceivers-DNdh9dE9.js","/assets/BroadcastRecord-CqsOHehj.js","/assets/Button-BT39CZ-c.js","/assets/CatLockNotice-DbZeUx2J.js","/assets/CategoryLegendModal-faFaOhHa.js","/assets/CellConcerns-Cpl8bN8T.js","/assets/CellDetails-eenaiiSr.js","/assets/CellFormModal-CtPpBxU6.js","/assets/CellIdent-Bl_NsVA2.js","/assets/CellLink-BCTXuAvU.js","/assets/Cells-C4HO0g9L.js","/assets/ColumnFilter-tSuHNlu3.js","/assets/ColumnsPicker-D2fIEwIS.js","/assets/CommentsModal-DKDcsP73.js","/assets/ComparisonTable-CLYHP03K.js","/assets/Concerns-COWduMUu.js","/assets/Daily-BzglcsuO.js","/assets/DataTable-b8F50yGB.js","/assets/DateRangePicker-CoZDjimz.js","/assets/DayReportView-CMcbJnfD.js","/assets/DayStepper-Cfc7bIa0.js","/assets/DifferenceBreakdown-hOIsFuhL.js","/assets/Downtime-Be8tw9Ss.js","/assets/Education-BrBKoo55.js","/assets/EducationLesson-CM92jDAa.js","/assets/EmptyState-MxWPgFIQ.js","/assets/Exam-FGTBXYsb.js","/assets/FactorySelect-DkVBJCG4.js","/assets/Gamification-BYjlXRkX.js","/assets/GroupBadge-CZWeUMeS.js","/assets/HeatmapChart-rLarZQwP.js","/assets/IdleCell-BAIJsPwm.js","/assets/KPICard-D5EOQx9J.js","/assets/Kaizen-BO2dDRBw.js","/assets/Kelish-D7pC4Bgo.js","/assets/KpiDeltaCard-JHHqJRn0.js","/assets/LangTextInput-Cj0YF2NL.js","/assets/Layout-p1Ti6CWz.js","/assets/LeaderAppeal-nBy--VVd.js","/assets/LeaderDayReport-ryGxkRGy.js","/assets/LeaderUnitReport-DIWnTvhn.js","/assets/Leaderboard-CuSWCccs.js","/assets/Leaders-CA0W_FM2.js","/assets/Lightbox-C6cFfepE.js","/assets/LiveOverview-drBS9uY5.js","/assets/Login-6OhTW6aH.js","/assets/NotFound-exgJppQz.js","/assets/Notifications-FyY7VXzW.js","/assets/Overview-CVxFjM3S.js","/assets/Pagination-DEc2_tnD.js","/assets/PerenaladkaFactTable-CHBtzrUc.js","/assets/PersonCard-BOHvC_Fm.js","/assets/PlanFulfillment-DurjrWJk.js","/assets/Production-qGhAtZEu.js","/assets/Profile-BHEoN9QY.js","/assets/ProofCamera-DR_DMAn6.js","/assets/ProofPhoto-Di0cGdey.js","/assets/Quality-B5tCs_gY.js","/assets/RawRows-LDMwts-T.js","/assets/RequestStateChip-602dLRGq.js","/assets/RichTextEditor-B0ifZs0v.js","/assets/SaveState-Bw0Ej0GH.js","/assets/SearchInput-8ZdXXBtg.js","/assets/SeasonalityHeatmap-B0HIG3-5.js","/assets/SegmentedToggle-CGQuzY00.js","/assets/SetupTimes-EbzU4O1r.js","/assets/ShiftDaily-DMaTCUpW.js","/assets/Staff-BnCqBM4x.js","/assets/StatusBadge-C9U8ZqVu.js","/assets/TargetGoal-BQIZXrDQ.js","/assets/Targets-dSOvP2f4.js","/assets/Tasks-Cer--uH1.js","/assets/TimeWheelPicker-Dk7gV9qx.js","/assets/Toast-DuiXNtS0.js","/assets/Tooltip-DhdoIbqf.js","/assets/TrendChart-CHn9qXbr.js","/assets/TripleSpeedometer-BVYU1hpf.js","/assets/Trudoyomkost-BepDeOl3.js","/assets/Turnover-Clffbe0F.js","/assets/UploadDropzone-D40V91oG.js","/assets/UsersActivity-DOsshQ9k.js","/assets/VerdictBlock-ilhIgfeY.js","/assets/VfxApiMap-DxangwP3.js","/assets/VfxDictionaries-BFerQG2d.js","/assets/VfxEmployees-CUHfTnvV.js","/assets/VfxHrMoves-DPSA9QWZ.js","/assets/VfxJobs-DoJ4kdzz.js","/assets/VfxPhoto-Cy0FGZli.js","/assets/VfxShifts-CAxHKFqK.js","/assets/VfxState-C_rmnXQp.js","/assets/VfxTimebooks-nJW9Bm-2.js","/assets/VfxTimesheet-FtnaRJC5.js","/assets/WatchProgress-BDBOsD5a.js","/assets/WebLogin-BuUtJJhq.js","/assets/WorkerConcerns-CTEwAli9.js","/assets/Workers-DIFM1Kpv.js","/assets/Zagruzka-DsxGECiB.js","/assets/ZagruzkaCell-eW-OiYdi.js","/assets/api-BPwRboei.js","/assets/archive-DOTl-yuV.js","/assets/archive-restore-JexQEQ9x.js","/assets/arrow-down-_yXFF5bw.js","/assets/arrow-down-wide-narrow-Bh_7NXb5.js","/assets/arrow-up-narrow-wide-BAllAGCL.js","/assets/award-D11xlJn-.js","/assets/ban-CnK-0Lz8.js","/assets/boxes-D4DgbQAi.js","/assets/braces-D1cK4c1L.js","/assets/brigadirFilters-CjM0djCA.js","/assets/broadcastTree-CV8905JC.js","/assets/building-2-CyTWvXe_.js","/assets/calculator-4wReEtyl.js","/assets/calendar--0508tVH.js","/assets/calendar-days-DHXjKmvW.js","/assets/camera-CnaCXiqx.js","/assets/categories-CVhWkYhZ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B9SOmL_X.js","/assets/chart-line-D4sbMXd6.js","/assets/chart-pie-BXnTIzfZ.js","/assets/chartRange-J1oCvqw6.js","/assets/check-check-CmDklQ3I.js","/assets/chevron-left-BUJCOvJ_.js","/assets/chevrons-up-down-B98xnFtb.js","/assets/circle-CPpTbp9G.js","/assets/circle-alert-BFvcl924.js","/assets/circle-check-big-DUPm5qYC.js","/assets/circle-dashed-D4gU2JD1.js","/assets/circle-minus-Dl8eEFHW.js","/assets/circle-question-mark-Cjex5ovC.js","/assets/circle-slash-DkMwpSQ_.js","/assets/circle-user-round-CxA8Okrm.js","/assets/clock-3-B6GDn5dn.js","/assets/cloud-off-BmOESUQN.js","/assets/cloud-upload-BCCUn8DL.js","/assets/compass-CAfQkxx1.js","/assets/concernCategories-DTdlIXCR.js","/assets/copy-CWgWGH-q.js","/assets/corner-down-right-7-WaxmN7.js","/assets/createLucideIcon-DUjElmHS.js","/assets/es-Do_2lP5H.js","/assets/external-link-CZBFM-_8.js","/assets/file-clock-DOipRJDp.js","/assets/file-exclamation-point-Bib741hU.js","/assets/flag-0s4qQUZN.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D1P59KZu.js","/assets/hash-DoVtgK4L.js","/assets/hourglass-CGS1qTZ8.js","/assets/image-CItduBMz.js","/assets/image-off-BIJGm664.js","/assets/inbox-CjBs2fJ5.js","/assets/index-BgTO59Iq.js","/assets/index-DFfGVOG_.css","/assets/keyboard-BFzMoMqD.js","/assets/languages-BH1wwzhQ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BhSINamj.js","/assets/lightbulb-Cn_LIPK6.js","/assets/link-2-Di65lGgo.js","/assets/link-2-off-DFuzppd1.js","/assets/list-ordered-CWNU0GYd.js","/assets/list-tree-C22DQv40.js","/assets/lock-open-Cf9Trl5Z.js","/assets/log-in-zI34X4WE.js","/assets/minimize-2-BWDfXOBR.js","/assets/package-check-CE8EUW0l.js","/assets/pencil-CzUTaw5r.js","/assets/percent-CnD-27Jj.js","/assets/pin-BHlEABCx.js","/assets/pin-off-BwEtIbZk.js","/assets/play-CGvqAZSW.js","/assets/plug-zap-hflWT5aY.js","/assets/prop-types-B-25iAxh.js","/assets/radio-CGeqPD_x.js","/assets/react-apexcharts.esm-DzMzCpuS.js","/assets/registers-FGAc8Yzn.js","/assets/repeat-zqxOhnhF.js","/assets/save-RimEmqH-.js","/assets/scopeLinks-TDZOkTmL.js","/assets/scroll-text-CuVzWTB6.js","/assets/search-x-BlKb_BlM.js","/assets/segments-hb5KBtJU.js","/assets/send-B_ZhSDCT.js","/assets/settings-2-aeUeXNav.js","/assets/shield-CdqbhNGX.js","/assets/shield-alert-BrVHIAWG.js","/assets/shield-question-mark-3MinTpUJ.js","/assets/siren-D1sXhPDi.js","/assets/snowflake-Dknb3s7Z.js","/assets/split-CUPjAA34.js","/assets/square-check-big-c-71pbgu.js","/assets/star--8zm2QbI.js","/assets/statusBands-BR0AJdPg.js","/assets/store-D9BkyIT0.js","/assets/table-2-oitrKY_h.js","/assets/table-properties-BQGgxt6y.js","/assets/tag-BcqT4sAb.js","/assets/timer-off-BHMOWx5d.js","/assets/trending-down-D5FXBCJa.js","/assets/trending-up-hsfN53Ow.js","/assets/undo-2-CBnFkJZl.js","/assets/useChartTheme-CZhwPpnM.js","/assets/useElementWidth-DzqIYfOt.js","/assets/useIsMobile-l2ZULyUl.js","/assets/useOpenParam-BkOMYdnz.js","/assets/useStatusBands-CoI8f1p_.js","/assets/useUrlScope-C122jmSm.js","/assets/user-CsQWscUz.js","/assets/user-cog-DiqGavYA.js","/assets/users-BX3yaUeM.js","/assets/vfx-7Oitw0UV.js","/assets/video-ayp_XhUq.js","/assets/wallet-Dt_jsShZ.js","/assets/warehouse-CfAtyz-Q.js","/assets/x-BMdVscu-.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
