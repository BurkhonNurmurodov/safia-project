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

const BUILD = "2026-09-28T04:38:14.662Z";
const PRECACHE = ["/","/assets/AdminPanel-CbrEuy9c.js","/assets/AnalysisBoard-BzwTcOhG.js","/assets/Arc-JaHJ6nxO.js","/assets/ArcLegacy-wLm5B0FB.js","/assets/AttendanceModal-DUj7tB_s.js","/assets/BrigadirProfile-CLMxJU3d.js","/assets/BroadcastReceivers-ThhEvaL4.js","/assets/BroadcastRecord-BuE1anwm.js","/assets/CatLockNotice-D3kV1Ili.js","/assets/CategoryLegendModal-veLq9W0I.js","/assets/CellConcerns-CzhYfFZX.js","/assets/CellDetails-CDdS1qir.js","/assets/CellFormModal-7iFSQeVi.js","/assets/CellLink-VqYSjrE1.js","/assets/Cells-rq5_o7pS.js","/assets/ColumnFilter-D_hMP6Bb.js","/assets/ColumnsPicker-Bx6UW7cH.js","/assets/CommentsModal-DPgY_Gok.js","/assets/ComparisonTable-B55lVQ-n.js","/assets/Concerns-C_Ga7b80.js","/assets/ConfirmDialog-ByjErZOc.js","/assets/Daily-maX8v_1q.js","/assets/DataTable-CUO3Sngc.js","/assets/DateRangePicker-B-AilJG6.js","/assets/DayReportView-CuLhJ1Xr.js","/assets/DayStepper-XNbTrcU3.js","/assets/DifferenceBreakdown-DXj4jw-m.js","/assets/Downtime-BNJRs9oY.js","/assets/Education-BlD46FuZ.js","/assets/EducationLesson-CpVXF2y9.js","/assets/EmptyState-DGcwN9Oq.js","/assets/Exam-BXaWjsSK.js","/assets/FactorySelect-UZn73hbt.js","/assets/Gamification-DnWxjfy2.js","/assets/GroupBadge-BHUzZaxP.js","/assets/HeatmapChart-CZt17C76.js","/assets/IdleCell-PEsV-vhV.js","/assets/KPICard-CgTKjq_I.js","/assets/Kaizen-CeDf5OWL.js","/assets/KpiDeltaCard-CMutOzyw.js","/assets/LangTextInput-DqtIS35b.js","/assets/Layout-HIi8nuZr.js","/assets/LeaderAppeal-CC7tJJnf.js","/assets/LeaderDayReport-BArd5mMW.js","/assets/LeaderUnitReport-DDrV_Qpn.js","/assets/Leaderboard-CUQIoGsy.js","/assets/Leaders-CMA1EIrI.js","/assets/Lightbox-Dipg-Nx6.js","/assets/LiveOverview-L6Tt40eX.js","/assets/Login-C2BW02kO.js","/assets/NotFound-hcknVvxj.js","/assets/Overview-DS-Ki6zo.js","/assets/Pagination-Ck57a5ty.js","/assets/PerenaladkaFactTable-DgDnTBmM.js","/assets/PlanFulfillment-DgExeomZ.js","/assets/Production-BBm8F7Bq.js","/assets/Profile--XFdOGcv.js","/assets/ProofCamera-DIjPNUoU.js","/assets/ProofPhoto-Dfwq957P.js","/assets/Quality-BhiDvQ5m.js","/assets/RequestStateChip-Bd9SFgAY.js","/assets/RichTextEditor-DI4c5vHS.js","/assets/SaveState-C-2Td9Ug.js","/assets/SearchInput-B3AMJ6H9.js","/assets/SeasonalityHeatmap-BQVRdHwB.js","/assets/SegmentedToggle-CT47IZDW.js","/assets/SetupTimes-B8eBX1jW.js","/assets/ShiftDaily-CI_qekUu.js","/assets/Staff-DsIutXSE.js","/assets/StatusBadge-D4Q551qm.js","/assets/TargetGoal-D8n4A-MX.js","/assets/Targets-CeK3SilA.js","/assets/Tasks-BSe9gdHA.js","/assets/TimeWheelPicker-CF8vC37I.js","/assets/Tooltip-CthtTyCi.js","/assets/TrendChart-BDr8IH6M.js","/assets/TripleSpeedometer-BiijWAk_.js","/assets/Trudoyomkost-C7_I9gNO.js","/assets/UsersActivity-vSzWZ8-1.js","/assets/WatchProgress-C7XWoTBu.js","/assets/WebLogin-DWY8ADEo.js","/assets/WorkerConcerns-BEc8ENr7.js","/assets/Workers-DsW-LviM.js","/assets/Zagruzka-CxHmT8Rf.js","/assets/ZagruzkaCell-CAP1olS_.js","/assets/alarm-clock-DjP60iql.js","/assets/api-FoRl0sA5.js","/assets/archive-DDOPrdtB.js","/assets/archive-restore-CArtdHb6.js","/assets/arrow-down-Dvkq4k-S.js","/assets/arrow-left-76WeRL4I.js","/assets/arrow-left-right-BAx-XHmg.js","/assets/arrow-up-right-f9qz3Lj7.js","/assets/arrow-up-t-7_UGMN.js","/assets/award-DngNF5kV.js","/assets/ban-CjHLOuv4.js","/assets/bot-DlICKNgV.js","/assets/boxes-CLiEIGPG.js","/assets/brigadirFilters-DAcS1SLH.js","/assets/broadcastTree-Csek9jO5.js","/assets/building-2-wTZHCbdh.js","/assets/calendar-clock-NqEqdTZr.js","/assets/calendar-days-fckfS4-P.js","/assets/calendar-range-EVt1HTcB.js","/assets/calendar-xrFNFdxk.js","/assets/camera-DCYZPg9w.js","/assets/categories-D5D4YQia.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Co1nD66E.js","/assets/chart-line-vj002jyo.js","/assets/chart-pie-BRownJBf.js","/assets/chartRange-C5yoexYK.js","/assets/chevron-left-D4OHLNqn.js","/assets/chevrons-up-down-BSjryV9o.js","/assets/circle-check-big-3ZBUWd91.js","/assets/circle-dot-KU4R4t26.js","/assets/circle-minus-DknWL3wQ.js","/assets/circle-slash-DEORcYYz.js","/assets/circle-user-round-BpSS55tg.js","/assets/cloud-off-CRPSbhKI.js","/assets/cloud-upload-DD6jbVFv.js","/assets/compass-BmivaLqF.js","/assets/concernCategories-COSg_1aT.js","/assets/copy-BgBn2al1.js","/assets/corner-down-right-Y29Dbqkx.js","/assets/createLucideIcon-Y0Ag8faN.js","/assets/es-C5pb8XqL.js","/assets/exportXlsx-BE-m2gUJ.js","/assets/external-link-GSETOYfT.js","/assets/file-clock-DFK4r2Uw.js","/assets/file-exclamation-point-Div0pw1x.js","/assets/file-spreadsheet-CMOV9Zxy.js","/assets/file-text-BKwijv-X.js","/assets/flag-CKXu9dtn.js","/assets/flame-v_TIy3Oa.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CkNxfpk6.js","/assets/hash-D1l_RMRH.js","/assets/history-CwLsHYdl.js","/assets/hourglass-DOVUPQpI.js","/assets/image-D8Y1MmdX.js","/assets/image-off-CubvHngT.js","/assets/index-O2R7Du3O.js","/assets/index-TBzEnSGJ.css","/assets/key-round-CojjdH_3.js","/assets/keyboard-BTDWwQAw.js","/assets/languages-DgcUgHHb.js","/assets/layers-DuC2CdDv.js","/assets/leaderReason-u4rlfHXe.js","/assets/lightbulb--W80aLX1.js","/assets/link-2-2YnT6V1R.js","/assets/list-checks-BXqBOaNi.js","/assets/list-ordered-C9uaKe0D.js","/assets/list-tree-DtBj-lU_.js","/assets/lock-open-C63I5ntv.js","/assets/log-in-wedV3y8y.js","/assets/message-square-BikP1yVW.js","/assets/minimize-2-j8poG2sV.js","/assets/package-check-BS_dxsf1.js","/assets/paperclip-D5qS3V5R.js","/assets/pencil-D9IU7YGb.js","/assets/personName-B4KId4zS.js","/assets/pin-8uMB4HPW.js","/assets/pin-off-sjJJlbDa.js","/assets/play-DxPOYkEh.js","/assets/presentation-bbCIEl-G.js","/assets/prop-types-DTPzFCZ1.js","/assets/radio-CVov-yAC.js","/assets/react-apexcharts.esm-1-SXqphc.js","/assets/repeat-CjBTh0ua.js","/assets/rotate-ccw-Dw46O_Y_.js","/assets/rotate-cw-lrI4jjhB.js","/assets/save-BDBQ4o9Z.js","/assets/scale-D-lnu6PO.js","/assets/scroll-text-DFYzDIGk.js","/assets/search-x-BLdtjkuv.js","/assets/segments-BuJgLbE5.js","/assets/send-uzh7xURX.js","/assets/settings-2-Bu-A19Ei.js","/assets/shield-C1YqshBc.js","/assets/shield-alert-Dhkry0tv.js","/assets/shield-check-CyuBK2kR.js","/assets/shield-question-mark-BH6yCVT1.js","/assets/siren-BlEkdFTX.js","/assets/smartphone-B24B6Its.js","/assets/snowflake-BzGEpU0-.js","/assets/square-CvM9lVRB.js","/assets/square-check-big-ePJEYmEM.js","/assets/star-BghlCItC.js","/assets/statusBands-cIqmW4q2.js","/assets/store-D3ekw3Tv.js","/assets/table-2-Ckg7sAZN.js","/assets/tag-0-A819Tv.js","/assets/trending-down-Ctj8JW9g.js","/assets/trending-up-DaOggJ4f.js","/assets/undo-2-5xtXWJ6Y.js","/assets/useChartTheme-DRFndOyH.js","/assets/useElementWidth-BcryO-iP.js","/assets/useIsMobile-BO4cSeBT.js","/assets/useMutation-CW1TUn8R.js","/assets/useStatusBands-CJ4id7fY.js","/assets/user-Chgl8S_v.js","/assets/user-check-JNhFQ_Qg.js","/assets/user-cog-jvCopr1k.js","/assets/user-minus-BKrh1s1H.js","/assets/users-D9MP3qPf.js","/assets/verifyState-7ZuG8fUQ.js","/assets/video-GdCgVDT5.js","/assets/wallet-CcknCWiE.js","/assets/warehouse-Btio9B-_.js","/assets/zap-DykJWG90.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
