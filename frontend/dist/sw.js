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

const BUILD = "2026-09-26T11:19:00.387Z";
const PRECACHE = ["/","/assets/AdminPanel-RW0Ns7KE.js","/assets/AnalysisBoard-DEys1YvT.js","/assets/Arc-B-BsAdA-.js","/assets/ArcLegacy-BVThmq_O.js","/assets/AttendanceModal-DHVEWfnu.js","/assets/BrigadirProfile-D4UULZc0.js","/assets/BroadcastReceivers-D0VzznMr.js","/assets/BroadcastRecord-CCaYSW48.js","/assets/CatLockNotice-Iu9kNdcP.js","/assets/CategoryLegendModal-Uha1DgQl.js","/assets/CellConcerns-C6ASEZjS.js","/assets/CellDetails-CncaPDrq.js","/assets/CellFormModal-sH-0BOKH.js","/assets/CellLink-D15m5xc-.js","/assets/Cells-YKDV4akn.js","/assets/ColumnFilter-BPckrbWw.js","/assets/ColumnsPicker-d5OqzETd.js","/assets/CommentsModal-DpsUdefH.js","/assets/ComparisonTable-Bxk247B7.js","/assets/Concerns-2J5wTsRw.js","/assets/ConfirmDialog-DI9KDZrd.js","/assets/Daily-BhoEv1RG.js","/assets/DataTable-CB7zE4ib.js","/assets/DateRangePicker-CTphetQu.js","/assets/DayReportView-BIdIQ2dM.js","/assets/DayStepper-YsNa52Bn.js","/assets/DifferenceBreakdown-6KLJcfc_.js","/assets/Downtime-1bkEY8KA.js","/assets/Education-DVsoUT5s.js","/assets/EducationLesson-Ddu50AtR.js","/assets/EmptyState-DqI6eIb-.js","/assets/Exam-BDeLt1_r.js","/assets/FactorySelect-Cag8i0Qi.js","/assets/Gamification-CRjyXC1H.js","/assets/GroupBadge-WCv89Y95.js","/assets/HeatmapChart-D1icX3QU.js","/assets/IdleCell-Cb5y-juI.js","/assets/KPICard-Dp45QBki.js","/assets/Kaizen-DSDQXaEK.js","/assets/KpiDeltaCard-Cv6t_Ktc.js","/assets/LangTextInput-D3jdJlPi.js","/assets/Layout-DIh7rb_p.js","/assets/LeaderAppeal-wm8UUtOY.js","/assets/LeaderDayReport-B5tWZHxk.js","/assets/LeaderUnitReport-IyL8RjzR.js","/assets/Leaderboard-DVDdjPl7.js","/assets/Leaders-BSNXxyfk.js","/assets/Lightbox-Ci37qZWv.js","/assets/LiveOverview-ApNDiJ37.js","/assets/Login-BRImh3WT.js","/assets/NotFound-BgqxaRC3.js","/assets/Overview-jg2XQMJF.js","/assets/Pagination-CRmsk9QD.js","/assets/PerenaladkaFactTable-CXiIC2qt.js","/assets/PlanFulfillment-Xi9p8XxB.js","/assets/Production-Bfu5s8Vg.js","/assets/Profile-CpuFCGk9.js","/assets/ProofCamera-BA6T1xor.js","/assets/ProofPhoto-wCTFdCWA.js","/assets/Quality-dDAWUBqn.js","/assets/RequestStateChip-BtFxcza1.js","/assets/RichTextEditor-TnqUvIAO.js","/assets/SaveState-Dx_aUTuq.js","/assets/SearchInput-AA7iA-X5.js","/assets/SeasonalityHeatmap-B_V21nPq.js","/assets/SegmentedToggle-C2_RkAXu.js","/assets/SetupTimes-COwyM7qz.js","/assets/ShiftDaily-CtAJm2dd.js","/assets/Staff-GxPA-Sgb.js","/assets/StatusBadge-CSbEJ4Q1.js","/assets/TargetGoal-FnlzFu_j.js","/assets/Targets-qcFDszJV.js","/assets/Tasks-Cv_rCjOa.js","/assets/TimeWheelPicker-Cv67KwbA.js","/assets/Tooltip-BxO96kwY.js","/assets/TrendChart-CYitSmCd.js","/assets/TripleSpeedometer-bJL9Gg66.js","/assets/Trudoyomkost-BRgbtSwO.js","/assets/UsersActivity-DIaHafpJ.js","/assets/WatchProgress-osQdFH6I.js","/assets/WebLogin-DWglzFnZ.js","/assets/WorkerConcerns-D-gsO4fc.js","/assets/Workers-CKeOUFOD.js","/assets/Zagruzka-IVoaS1Ee.js","/assets/ZagruzkaCell-CCQ-R5KK.js","/assets/alarm-clock-CSloXn8x.js","/assets/api-C97SRzUw.js","/assets/archive-DMhsCRx5.js","/assets/archive-restore-D4XqOf0D.js","/assets/arrow-down-Cvd38L_t.js","/assets/arrow-left-D6dJMi0I.js","/assets/arrow-left-right-CW-pJ1RK.js","/assets/arrow-up-Cg6zZk4j.js","/assets/award-D0akN0gX.js","/assets/ban-DJFhykTM.js","/assets/bot-Dwwjm5LV.js","/assets/boxes-BV-vk9TO.js","/assets/brigadirFilters-CT2ap--O.js","/assets/broadcastTree-EXNr8ncC.js","/assets/building-2-CpRe4HNP.js","/assets/calendar-Dv87iCDZ.js","/assets/calendar-clock-DsofoDim.js","/assets/calendar-days-78_DHW4h.js","/assets/calendar-range-Cun5N3YB.js","/assets/camera-DZTB7D0L.js","/assets/categories-BVduzUOg.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Da47DZM1.js","/assets/chart-line-C5u8iy9T.js","/assets/chart-pie-BWETrSg2.js","/assets/chartRange-Cd2OFu_s.js","/assets/chevron-left-DuWUjf0k.js","/assets/chevrons-up-down-B3-mv33N.js","/assets/circle-check-big-DqOCGPyc.js","/assets/circle-dot-Dfm4slkz.js","/assets/circle-minus-BEUaTDl-.js","/assets/circle-slash-DzHP-Lpf.js","/assets/circle-user-round-BorzkrmW.js","/assets/cloud-off-BOvXqPpG.js","/assets/cloud-upload-DlE8r0zo.js","/assets/compass-B1W2Oqhi.js","/assets/concernCategories-BMP4L0HO.js","/assets/copy-C_DXjtWp.js","/assets/corner-down-right-BWMrtY1_.js","/assets/createLucideIcon-DzM1DhIA.js","/assets/es-CvcnT14Q.js","/assets/exportXlsx-C4RAhd4e.js","/assets/external-link-DREcWQf-.js","/assets/file-clock-laaxKs1w.js","/assets/file-exclamation-point-4XiqpNJi.js","/assets/file-spreadsheet-CwOCW6-s.js","/assets/file-text-BrlbW__6.js","/assets/flag-B0Ojoxa3.js","/assets/flame-CKjDV1Vz.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CbwUq047.js","/assets/hash-C0s81zjf.js","/assets/history-nCROVawJ.js","/assets/hourglass-DB-rozX_.js","/assets/image-4hXNIYdl.js","/assets/image-off-DcDQdJBN.js","/assets/index-CnWVd5z1.js","/assets/index-Nlad1MZN.css","/assets/key-round-BpdDgE4l.js","/assets/keyboard-z6kVEFTF.js","/assets/languages-BJwxQJx-.js","/assets/layers-DVcaJlwR.js","/assets/leaderReason-Ck57e9y-.js","/assets/lightbulb-CpR66vmi.js","/assets/link-2-Cd1dUCY6.js","/assets/list-checks-CCtnX2iF.js","/assets/list-ordered-DsEom55X.js","/assets/list-tree-DvnRVyrM.js","/assets/lock-open-CO9XUD31.js","/assets/log-in--xAGu7od.js","/assets/message-square-DmYKT3_p.js","/assets/minimize-2-C6pDLl9f.js","/assets/package-check-B1f4AVug.js","/assets/paperclip-Dv7OSkxG.js","/assets/pencil-oKfF5Foc.js","/assets/personName-B4KId4zS.js","/assets/pin-BvGAiKWG.js","/assets/play-B-RQVdQ8.js","/assets/presentation-C-bZ83o0.js","/assets/prop-types-DYPp8eT6.js","/assets/radio-BbAlQ4gY.js","/assets/react-apexcharts.esm-DvP94zB3.js","/assets/repeat-xyA1Puvw.js","/assets/rotate-ccw-BY8_Vn7L.js","/assets/rotate-cw-DwN3S23S.js","/assets/save-CxPdIDC3.js","/assets/scale-DyAbaVwV.js","/assets/scroll-text-Cnyf_SQw.js","/assets/search-x-DwCm4BTJ.js","/assets/segments-hKj6_Cnu.js","/assets/send-DM5GCitF.js","/assets/settings-2-B8nPOvNk.js","/assets/shield-DTfzBx4u.js","/assets/shield-alert-D6Lbp_yU.js","/assets/shield-check-Cjpsu1Kl.js","/assets/shield-question-mark-D_RZgG8P.js","/assets/siren-DPRy-yxi.js","/assets/smartphone-ndvJ2Q4E.js","/assets/snowflake-eO9mpw8V.js","/assets/square-OFGaEXW7.js","/assets/square-check-big-C5sEFE_F.js","/assets/star-BOw19gYn.js","/assets/statusBands-Ck6sgYhw.js","/assets/store-2s9xjT5Z.js","/assets/table-2-q10NBqmy.js","/assets/tag-BPKf8yBg.js","/assets/trending-down-CE7ctvhO.js","/assets/trending-up-B5YcJHmm.js","/assets/triangle-alert-BwKAK-K5.js","/assets/undo-2-C_JahjNx.js","/assets/useChartTheme-BM93MXtA.js","/assets/useElementWidth-B8v4fpna.js","/assets/useIsMobile-PmZqMGAO.js","/assets/useMutation-BuWCVKxq.js","/assets/useStatusBands-D55_nTBj.js","/assets/user-BuGGkX51.js","/assets/user-check-DC1noVkP.js","/assets/user-cog-CmJj33zx.js","/assets/user-minus-DqcG6p3F.js","/assets/users-BmibTDA6.js","/assets/verifyState-DMw4Ad22.js","/assets/video-CF-XhK94.js","/assets/wallet-KbIOHFr-.js","/assets/warehouse-D4oUB6dq.js","/assets/zap-2dzDEuVB.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
