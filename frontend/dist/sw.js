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

const BUILD = "2026-09-30T15:58:27.478Z";
const PRECACHE = ["/","/assets/AdminPanel-f3EGE9XK.js","/assets/AnalysisBoard-CI7G8MpE.js","/assets/Arc-C-09v4G8.js","/assets/ArcLegacy-C99VOFg8.js","/assets/BrigadirProfile-B9SLAH6O.js","/assets/BroadcastReceivers-DkCjyqAC.js","/assets/BroadcastRecord-DFNPaozt.js","/assets/CatLockNotice-qRkLwTrP.js","/assets/CategoryLegendModal-CSLrjTcZ.js","/assets/CellConcerns-DVoGy4Rc.js","/assets/CellDetails-Cj1i_AhY.js","/assets/CellFormModal-DlqyQgOK.js","/assets/CellIdent-BaMlQDKL.js","/assets/CellLink-DrjIDrT6.js","/assets/Cells-D4UqoOjK.js","/assets/ColumnFilter-WmI3kZpE.js","/assets/ColumnsPicker-W3ilCQ5W.js","/assets/CommentsModal-jOcUwf_h.js","/assets/ComparisonTable-BQ5M7d2x.js","/assets/Concerns-wbku-H2p.js","/assets/ConfirmDialog-D5-H-tt2.js","/assets/Daily-C9AgOmDk.js","/assets/DataTable-B3K6ZTH6.js","/assets/DateRangePicker-BCWeuRyu.js","/assets/DayReportView-v_gMwJq4.js","/assets/DayStepper-cQlDC5fL.js","/assets/DifferenceBreakdown-cSATf1Bq.js","/assets/Downtime-Bau6dkFz.js","/assets/Education-UWcSksU9.js","/assets/EducationLesson-CpCSvvl5.js","/assets/EmptyState-DUeuoQmQ.js","/assets/Exam-CJG47nov.js","/assets/FactorySelect-Xk-N9x8F.js","/assets/Gamification-Bu3VmkVS.js","/assets/GroupBadge-DVkzY0lT.js","/assets/HeatmapChart-Bu8QjmSL.js","/assets/IdleCell-DBvZ8Qcb.js","/assets/KPICard-Bgb6IGKZ.js","/assets/Kaizen-DHm71eYT.js","/assets/Kelish-DhXbWnB3.js","/assets/KpiDeltaCard-CvKMJhPs.js","/assets/LangTextInput-Q8pzXuqX.js","/assets/Layout-6IGWZOkc.js","/assets/LeaderAppeal-KRDGkuD0.js","/assets/LeaderDayReport-C8K0VQCS.js","/assets/LeaderUnitReport-DKB8HJMU.js","/assets/Leaderboard-1k_jY2W0.js","/assets/Leaders-B-e7DCXF.js","/assets/Lightbox-DERRXX6j.js","/assets/LiveOverview-BgnGWOeY.js","/assets/Login-Cwr8mYrc.js","/assets/NotFound-OmeWzCym.js","/assets/Overview-CJQB2_q0.js","/assets/Pagination-Bw6lh0mD.js","/assets/PerenaladkaFactTable-B1TeVslN.js","/assets/PlanFulfillment-Dhur8t9_.js","/assets/Production-IAFvdcfw.js","/assets/Profile-DLAajhY4.js","/assets/ProofCamera-Vfvucdxu.js","/assets/ProofPhoto-DrMOjXCB.js","/assets/Quality-BDUMLPyz.js","/assets/RequestStateChip-CamwKy3I.js","/assets/RichTextEditor-CouhKOom.js","/assets/SaveState-33VsSEzf.js","/assets/SearchInput-CO8qoAZG.js","/assets/SeasonalityHeatmap-iP697LVm.js","/assets/SegmentedToggle-4_t-eLt6.js","/assets/SetupTimes-AbteUyVc.js","/assets/ShiftDaily-CdduJ-Jd.js","/assets/Staff-YYT15MPg.js","/assets/StatusBadge-SuyNZ_Fd.js","/assets/TargetGoal-D5tlFr1F.js","/assets/Targets-wQxKhtqL.js","/assets/Tasks-BOCY9HI_.js","/assets/TimeWheelPicker-BcrGVV5w.js","/assets/Tooltip-mFsDU3-8.js","/assets/TrendChart-0v-GnJMT.js","/assets/TripleSpeedometer-BabVqkAA.js","/assets/Trudoyomkost-DtJWrK30.js","/assets/UploadDropzone-wH8on6pg.js","/assets/UsersActivity-C9j-37_6.js","/assets/VerdictBlock-DWXn5Z3h.js","/assets/WatchProgress-BwtF-uBa.js","/assets/WebLogin-CUWl3uPt.js","/assets/WorkerConcerns-Cf3mqgOm.js","/assets/Workers-CQ9I-8e2.js","/assets/Zagruzka-CQs0vcsm.js","/assets/ZagruzkaCell-BxnDTa-B.js","/assets/api-BhdFMtUd.js","/assets/archive-DOy_92Z5.js","/assets/archive-restore-BWGoKA-g.js","/assets/arrow-down-DGcMVPDJ.js","/assets/arrow-left-DjUOk2uf.js","/assets/arrow-left-right-BsKwp-af.js","/assets/arrow-up-BE1zOv98.js","/assets/arrow-up-narrow-wide-CFnr0NM0.js","/assets/arrow-up-right-CfQ51ndv.js","/assets/award-2C4JygH2.js","/assets/ban-qZStFa3n.js","/assets/bot-DkGYis_8.js","/assets/boxes-dGWKgPBe.js","/assets/brigadirFilters-D21EUMM5.js","/assets/broadcastTree-BkvkqeEk.js","/assets/building-2-BP9i8Gm-.js","/assets/calendar-BOcJdvvh.js","/assets/calendar-clock-hgKEzW0T.js","/assets/calendar-days-DfUdC6mm.js","/assets/calendar-range-CGsvSME6.js","/assets/camera-Cbkvbio3.js","/assets/categories-z-kFspA0.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BO2ZTtHY.js","/assets/chart-line-y0m95M8U.js","/assets/chart-pie-B4mZ1O5X.js","/assets/chartRange-BNmyVUsU.js","/assets/chevron-left-BYi8mToP.js","/assets/chevrons-up-down-Bs9zQGY_.js","/assets/circle-C5FCGfnJ.js","/assets/circle-check-big-WE992O2x.js","/assets/circle-dot-S5bP7hBA.js","/assets/circle-minus-Bntpn4rc.js","/assets/circle-slash-BIywK2qG.js","/assets/circle-user-round-DdTIHAc9.js","/assets/cloud-off-NW1nQHgg.js","/assets/cloud-upload-KhyBnyW-.js","/assets/compass-DDOaD335.js","/assets/concernCategories-DezrAig4.js","/assets/copy-6SfXDRYB.js","/assets/corner-down-right-D0OeZv5d.js","/assets/createLucideIcon-C6Eypys5.js","/assets/es-BEsZVANY.js","/assets/exportXlsx-DshXrE6h.js","/assets/external-link-BKfzZRAE.js","/assets/file-clock-DHw89c_M.js","/assets/file-exclamation-point-CUUy2DvB.js","/assets/file-spreadsheet-bj8659JE.js","/assets/file-text-BXQ618L_.js","/assets/flag-B9nVyhOR.js","/assets/flame-DFhi7a2E.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CTSjnzTm.js","/assets/hash-DuNxK1VH.js","/assets/history-CH5eDhdP.js","/assets/hourglass-D7fHyIeL.js","/assets/image-Bj4ltif1.js","/assets/image-off-CWFclDQq.js","/assets/index-BS327Fw3.js","/assets/index-BbXTI5xr.css","/assets/key-round-D_phaLhl.js","/assets/keyboard-DZsvCwzU.js","/assets/languages-C8cnca6k.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C1S0vwmX.js","/assets/lightbulb-B0LPpMRA.js","/assets/link-2-D4R2gQ4p.js","/assets/link-2-off-D562iRXz.js","/assets/list-checks-BfG1we9j.js","/assets/list-ordered-DNvdE9k4.js","/assets/list-tree-eFqRToRI.js","/assets/lock-open-qgNgI77d.js","/assets/log-in-Drb5e0Yb.js","/assets/maximize-2-CT3pLKPk.js","/assets/message-square-B-yedbB2.js","/assets/minimize-2-DhvH3_RZ.js","/assets/package-check-D_EmRSKN.js","/assets/paperclip-CbWPcZor.js","/assets/pencil-DffYP47f.js","/assets/percent-B5eQhV-n.js","/assets/personName-CogOuS3K.js","/assets/pin-Beip62Dw.js","/assets/pin-off-DLQUukLS.js","/assets/play-nWTfWLe-.js","/assets/presentation-DqvYJGfs.js","/assets/prop-types-CsluLF6H.js","/assets/radio-B-q4Odw3.js","/assets/react-apexcharts.esm-CvWx0cVl.js","/assets/repeat-BepcGEH6.js","/assets/rotate-ccw-C4IOnwvO.js","/assets/rotate-cw-CCrL_Wr9.js","/assets/save-BBPVWf9D.js","/assets/scale-pTYKwXCp.js","/assets/scopeLinks-Df-9BYrg.js","/assets/scroll-text-CXDWvii-.js","/assets/search-x-8deAF5w8.js","/assets/segments-DXp4TNyW.js","/assets/send-BZvergGo.js","/assets/settings-2-1rqImuSj.js","/assets/shield-alert-hCAQGmLr.js","/assets/shield-check-GVSBLE1l.js","/assets/shield-question-mark-BhcEJein.js","/assets/shield-xkifc6Hi.js","/assets/siren-TFg2PQXf.js","/assets/snowflake-ES0Y7uVy.js","/assets/split-uVo8Vr_B.js","/assets/square-CNT3FAOy.js","/assets/square-check-big-n3g4HJtf.js","/assets/star-Tw8TzYkb.js","/assets/statusBands-DL4sCROP.js","/assets/store-Cd5ul4VD.js","/assets/table-2-Bf4o98xM.js","/assets/table-properties-8ZyFGf2O.js","/assets/tag-DgcwjRR5.js","/assets/timer-off-BkNqAWbs.js","/assets/trending-down-ChMkvnn0.js","/assets/trending-up-CP0Zu-nC.js","/assets/undo-2-Cfb51s2B.js","/assets/useChartTheme-Ck8fpFaZ.js","/assets/useElementWidth-CnR2x5O8.js","/assets/useIsMobile-Is-r5wab.js","/assets/useMutation-BPRxAOEi.js","/assets/useStatusBands-DIMKjJpU.js","/assets/useUrlScope-DTCtM3N4.js","/assets/user-BT2YkoFN.js","/assets/user-cog-CMHIaViS.js","/assets/user-minus-BFXhREsg.js","/assets/users-D42iwbf9.js","/assets/video-C3JwudBH.js","/assets/wallet-BPW_S8TC.js","/assets/warehouse-B2pmXsZW.js","/assets/zap-t6W4ZFHD.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
