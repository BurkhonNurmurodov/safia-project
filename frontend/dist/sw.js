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

const BUILD = "2026-09-26T10:08:36.454Z";
const PRECACHE = ["/","/assets/AdminPanel-MOsHtbcY.js","/assets/AnalysisBoard-CLGhnGRj.js","/assets/Arc-CYY0_uV5.js","/assets/ArcLegacy-BZITM5IT.js","/assets/AttendanceModal-ChUuSZkz.js","/assets/BrigadirProfile-BK1Oe6is.js","/assets/BroadcastReceivers-BOJRbjut.js","/assets/BroadcastRecord-CgsCjtvz.js","/assets/CatLockNotice-DyqOdEtb.js","/assets/CategoryLegendModal-g6I13puy.js","/assets/CellConcerns-Cf9L8ixp.js","/assets/CellDetails-1XsTYryu.js","/assets/CellFormModal-vBtgmGRZ.js","/assets/CellLink-as356SHX.js","/assets/Cells-BI1TPKqA.js","/assets/ColumnFilter-DLfRrr5D.js","/assets/ColumnsPicker-DOXhJUSm.js","/assets/CommentsModal-DaU6UlAn.js","/assets/ComparisonTable-f7dXfXEw.js","/assets/Concerns-D-lyBaZZ.js","/assets/ConfirmDialog-CVypJAde.js","/assets/Daily--KniPQ9F.js","/assets/DataTable-B3vb8ZUa.js","/assets/DateRangePicker-Y4tJzvIH.js","/assets/DayReportView-BAL6oyY0.js","/assets/DayStepper-DtWBiKEx.js","/assets/DifferenceBreakdown-n5Yj68Dd.js","/assets/Downtime-CCDyw9Wr.js","/assets/Education-BWVR_lY6.js","/assets/EducationLesson-CEefNVoe.js","/assets/EmptyState-q4nCuO7b.js","/assets/Exam-Ccj1938J.js","/assets/FactorySelect-B-ICZWas.js","/assets/Gamification-D_Q6O-Yd.js","/assets/GroupBadge-B4u43PG9.js","/assets/HeatmapChart-BAVm3V1y.js","/assets/IdleCell-BbwBhrH0.js","/assets/KPICard-By1v0f0L.js","/assets/Kaizen-B64fk0Zm.js","/assets/KpiDeltaCard-DuPNIytx.js","/assets/LangTextInput-Cddn4EP5.js","/assets/Layout-DQOxSOyG.js","/assets/LeaderAppeal-D4zXoDtn.js","/assets/LeaderDayReport-6ULb-0mD.js","/assets/LeaderUnitReport-ClW1nEKx.js","/assets/Leaderboard-DVQWmy-z.js","/assets/Leaders-BOxwYbvE.js","/assets/Lightbox-BxXbqWxo.js","/assets/LiveOverview-JWGe5RZM.js","/assets/Login-Ch2E7UuX.js","/assets/NotFound-BAHfJwKK.js","/assets/Overview-Dk2zIVXH.js","/assets/Pagination-BMpy1q8U.js","/assets/PerenaladkaFactTable-WhMNDBMc.js","/assets/PlanFulfillment-C-muZG4N.js","/assets/Production-KNKHjAPY.js","/assets/Profile-CTOz9gQ1.js","/assets/ProofCamera-CpNPgVgU.js","/assets/ProofPhoto-CXJHIfVv.js","/assets/Quality-BJuQhU06.js","/assets/RequestStateChip-BiEAwkm7.js","/assets/RichTextEditor-88pL_TnS.js","/assets/SearchInput-CGexOwce.js","/assets/SeasonalityHeatmap-wce-xxc3.js","/assets/SegmentedToggle-CNEqxLFE.js","/assets/SetupTimes-BUFkWLP-.js","/assets/ShiftDaily-D74NReIN.js","/assets/Staff-DqE0KR-B.js","/assets/StatusBadge-CMtpSYnu.js","/assets/Targets-L-HcB3pz.js","/assets/Tasks-BYM3v4v-.js","/assets/TimeWheelPicker-D8TkATh7.js","/assets/Tooltip-Ox3Yxp94.js","/assets/TrendChart-CleHQqIl.js","/assets/TripleSpeedometer-gijXDEpH.js","/assets/Trudoyomkost-shLWmDa7.js","/assets/UsersActivity-D2skvB9U.js","/assets/WatchProgress-DPYqqlUE.js","/assets/WebLogin-iDq5ImeB.js","/assets/WorkerConcerns-IyRa39Bp.js","/assets/Workers-BwZAlxoy.js","/assets/Zagruzka-iIl1phyO.js","/assets/ZagruzkaCell-LRI69hdn.js","/assets/alarm-clock-CHs_PRrk.js","/assets/api-6XxYCc0w.js","/assets/archive-BtYLW6iY.js","/assets/archive-restore-CeWYP9QW.js","/assets/arrow-down-CUJ1XFl3.js","/assets/arrow-left-Cg1RXxbP.js","/assets/arrow-left-right-Cxedm2F5.js","/assets/arrow-up-DhhXGT1o.js","/assets/arrow-up-right-BSq1exC5.js","/assets/award-CN5o2yL5.js","/assets/ban-DNER-9QE.js","/assets/bot-Cd8aRmzT.js","/assets/boxes-MNhK0keb.js","/assets/brigadirFilters-Crfse9bh.js","/assets/broadcastTree-CtwA4H_O.js","/assets/building-2-9n9zgiWZ.js","/assets/calendar-Cwn9my-W.js","/assets/calendar-clock-DY0BAmMf.js","/assets/calendar-days-CN3pR8Bi.js","/assets/calendar-range-K_UBtN5B.js","/assets/camera-QMcOuqZm.js","/assets/categories-DCoeeIL-.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D2Dq8KRP.js","/assets/chart-line-myOEduV8.js","/assets/chart-pie-BkthcWRG.js","/assets/chartRange-CaUf1B4U.js","/assets/check-check-C3hnEk5w.js","/assets/chevron-left-DDf8LSPo.js","/assets/chevrons-up-down-ajzcmcz0.js","/assets/circle-check-big-Ch9rFup3.js","/assets/circle-dashed-HuiK-QxK.js","/assets/circle-dot-DFFONqsx.js","/assets/circle-minus-CF9koBxd.js","/assets/circle-slash-DuprgYLx.js","/assets/circle-user-round-D1822yt7.js","/assets/cloud-upload-DKwBFLpZ.js","/assets/coins-DMIA1BKH.js","/assets/compass-XqEzIavv.js","/assets/concernCategories-Baky7ZJ6.js","/assets/copy-BIRQyhjM.js","/assets/corner-down-right-CPLVPRhN.js","/assets/createLucideIcon-BMJPjArh.js","/assets/es-BJofS-Ya.js","/assets/exportXlsx-CLfRVizg.js","/assets/external-link-D3sQ_r9c.js","/assets/file-clock-CTEOxTWc.js","/assets/file-exclamation-point-Cz204CLZ.js","/assets/file-spreadsheet-ByR9qDBb.js","/assets/file-text-CGOZKaYr.js","/assets/flag-XXB6Sq5n.js","/assets/flame-BZ5Uljac.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D6bPKpdH.js","/assets/hash-Dc3LETne.js","/assets/history-B0ttWyxV.js","/assets/hourglass-CL9Zkdws.js","/assets/image-O9X8XaT5.js","/assets/image-off-0XhHrz-a.js","/assets/index-B0B4paZw.js","/assets/index-DwPevLKe.css","/assets/key-round-Nsl81UQV.js","/assets/keyboard-MHyaboUW.js","/assets/languages-BFvRnme2.js","/assets/layers-D6FoBDA6.js","/assets/leaderReason-DZqFldFW.js","/assets/lightbulb-BHpPeIEw.js","/assets/link-2-dsoNBwD1.js","/assets/list-checks-Bsvpi9Zk.js","/assets/list-ordered-CFTCNjHj.js","/assets/list-tree-Coh_ck37.js","/assets/lock-open-DB38u7G3.js","/assets/log-in-D7eOXh4U.js","/assets/message-square-BAtC6U58.js","/assets/minimize-2-DoP_ZQc8.js","/assets/package-check-TlAro3ki.js","/assets/paperclip-DJhWBTAv.js","/assets/pencil-D4eN2DgU.js","/assets/personName-B4KId4zS.js","/assets/pin-C13bpdO_.js","/assets/play-DumW2V7c.js","/assets/presentation-CpHsnDnh.js","/assets/prop-types-B4Jt-vPE.js","/assets/radio-BoiQQrZ8.js","/assets/react-apexcharts.esm-cU-R1bh0.js","/assets/repeat-HQ9YU21f.js","/assets/rotate-ccw-aZUPVeDh.js","/assets/rotate-cw-CErp4aK9.js","/assets/save-CuaF17Wq.js","/assets/scale-BLA1iJeZ.js","/assets/scroll-text-Cm8EnVpZ.js","/assets/search-x-By-Jsy73.js","/assets/segments-DnzwQZLC.js","/assets/send-CzFPynBG.js","/assets/settings-2-DgC-TTbx.js","/assets/shield-CoIIcCJV.js","/assets/shield-alert-BQdWUDiC.js","/assets/shield-check-BJnWihi5.js","/assets/shield-question-mark-w3DmyvS3.js","/assets/siren-Dnr3xpZE.js","/assets/smartphone-Dw0OnE5F.js","/assets/snowflake-BEDj1XHJ.js","/assets/square-B3rpumyv.js","/assets/square-check-big-D8ZVKa5E.js","/assets/star-DA6LOAMC.js","/assets/statusBands-D-MGhkTI.js","/assets/store-BxfO9H56.js","/assets/table-2-6hFyz379.js","/assets/tag-zGqD3xN_.js","/assets/trending-down-CeLQeuJ7.js","/assets/trending-up-B_0fZDU6.js","/assets/triangle-alert-BC4qmf48.js","/assets/undo-2-B6hQu0D8.js","/assets/useChartTheme-_zoGZS6z.js","/assets/useElementWidth-CdiuNVnm.js","/assets/useIsMobile-xmo8qZcR.js","/assets/useMutation-CzcmVVdh.js","/assets/useStatusBands-C3l0zJp7.js","/assets/user-BWMCOYUo.js","/assets/user-check-CdGrf5oc.js","/assets/user-cog-xqgGNNBj.js","/assets/user-minus-BCj-ijqb.js","/assets/users-CXr5n4pL.js","/assets/verifyState-BnSqyw38.js","/assets/video-Bh2BZK7Z.js","/assets/warehouse-BOe6nPNO.js","/assets/zap-Dxw0M6oU.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
