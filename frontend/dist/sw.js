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

const BUILD = "2026-09-22T11:54:19.349Z";
const PRECACHE = ["/","/assets/AdminPanel-C3VSiyyX.js","/assets/AnalysisBoard-CWXB2znm.js","/assets/Arc-BriQObAm.js","/assets/AttendanceModal-C43sopNM.js","/assets/BrigadirProfile-Cmh9fnSx.js","/assets/BroadcastReceivers-DMcu1nw2.js","/assets/BroadcastRecord-oXXcaU5s.js","/assets/CatLockNotice-D688vELj.js","/assets/CategoryLegendModal-mKScNekb.js","/assets/CellConcerns-DYVvZLPP.js","/assets/CellDetails-CJuULSvN.js","/assets/CellFormModal-CcbHRNH6.js","/assets/CellLink-DcPTeWSI.js","/assets/Cells-C8GxGJTv.js","/assets/ColumnFilter-C9uOR9Qo.js","/assets/ColumnsPicker-BHzagEPg.js","/assets/CommentsModal-5zfK122y.js","/assets/ComparisonTable-D-x3Le0Y.js","/assets/Concerns-lRjg0M_2.js","/assets/ConfirmDialog-CoGFwArZ.js","/assets/Daily-BqN9D6Xa.js","/assets/DataTable-Bav22V26.js","/assets/DateRangePicker-CeMscQR5.js","/assets/DayReportView-DIAoA5XK.js","/assets/DayStepper-CaGQ2yeq.js","/assets/DifferenceBreakdown-D5DDSX9m.js","/assets/Downtime-DcViUTXi.js","/assets/Education-8TFGMcwu.js","/assets/EducationLesson-CnnpKQPL.js","/assets/EmptyState-e2sLWpM_.js","/assets/FactorySelect-CxZhjVFa.js","/assets/FormField-lu8HZgZg.js","/assets/Gamification-DuOQ3QU6.js","/assets/GroupBadge-ClP-hCAk.js","/assets/HeatmapChart-BAqbPGDj.js","/assets/IdleCell-BoAKAu3G.js","/assets/KPICard-gT1t4ILH.js","/assets/Kaizen-Dv1Jnyj7.js","/assets/KpiDeltaCard-S5_BcO8C.js","/assets/LangTextInput-DJR5TMX9.js","/assets/Layout-Z55v1yIO.js","/assets/LeaderDayReport-DqDpR_v3.js","/assets/LeaderUnitReport-DWZ6jtx0.js","/assets/Leaderboard-CITHo-Td.js","/assets/Leaders-DmWusAZn.js","/assets/LiveOverview-CeApC0TK.js","/assets/Login-CuuNYyyV.js","/assets/NotFound-D6tJoWfY.js","/assets/Overview-CT8HHemR.js","/assets/Pagination-KOLBSLle.js","/assets/PerenaladkaFactTable-CdK_RMmp.js","/assets/PlanFulfillment-DzvHFb-w.js","/assets/Production-fGzApnue.js","/assets/Profile-BqsMSCgS.js","/assets/ProofCamera-Tnncmpla.js","/assets/Quality-CE0VbL5f.js","/assets/RichTextEditor-DhCr2Kpr.js","/assets/SearchInput-BsdrSndw.js","/assets/SeasonalityHeatmap-CMkE5k0C.js","/assets/SegmentedToggle-0DuPBIXV.js","/assets/SetupTimes-DlpArxJI.js","/assets/ShiftDaily-DI6qslfw.js","/assets/Skeleton-DdZyVahO.js","/assets/Staff-7qDV8Sl1.js","/assets/StatusBadge-BFcreVnK.js","/assets/StyledSelect-G_drbUO9.js","/assets/Targets-CYCPX5Rx.js","/assets/Tasks-DMv0QUdp.js","/assets/TimeField-D6rtmBC5.js","/assets/TimeWheelPicker-aArid_0j.js","/assets/Toast-BOTsO5FW.js","/assets/Tooltip-Cjbunjo3.js","/assets/TrendChart-21cwjECG.js","/assets/TripleSpeedometer-Csw4JA_U.js","/assets/Trudoyomkost-BLyPyH8-.js","/assets/UsersActivity-DX5EAObe.js","/assets/WatchProgress-hWgfKVXT.js","/assets/WebLogin-CmTICSOO.js","/assets/WorkerConcerns-DaKHfYQp.js","/assets/Workers-DExX5oJS.js","/assets/Zagruzka-DCfe442d.js","/assets/ZagruzkaCell-tqhMB4td.js","/assets/alarm-clock-Bc_NFX5F.js","/assets/api-z3e50Qap.js","/assets/archive-CQVyTs3_.js","/assets/archive-restore-egforavZ.js","/assets/arrow-down-BosxeV-c.js","/assets/arrow-left-Aq3CSsju.js","/assets/arrow-left-right-D3TYhnah.js","/assets/arrow-right-zJ2WkZmb.js","/assets/arrow-up-CaL7QHVu.js","/assets/arrow-up-right-DQhIFIu3.js","/assets/award-ezNzOfPT.js","/assets/ban-BBpNdo1f.js","/assets/bot-DCGaNitL.js","/assets/boxes-k2JuXIj3.js","/assets/brigadirFilters-D34Re01w.js","/assets/broadcastTree-PCwkdfB0.js","/assets/building-2-DpuzlMpw.js","/assets/calendar-CfNAz01s.js","/assets/calendar-clock-vsqi2UUh.js","/assets/calendar-days-DN-P6PDF.js","/assets/calendar-range-CFHBoVwm.js","/assets/camera-CL2Zx9kS.js","/assets/categories-Clzl0PaK.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B40BvU04.js","/assets/chart-line-DsCg-zpR.js","/assets/chart-pie-BFNAR1eB.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-_SwsPqrm.js","/assets/check-Bs28-msw.js","/assets/check-check-vhtudbBH.js","/assets/chevron-left-EB1Fv5B0.js","/assets/chevrons-up-down-BH51q5VO.js","/assets/circle-dashed-B3y-XWpe.js","/assets/circle-dot-BDjzFXBr.js","/assets/circle-minus-BptNA98H.js","/assets/circle-slash-JaitfNEA.js","/assets/circle-user-round-DVzweRQa.js","/assets/coins-Cx3X2F5F.js","/assets/compass-DPTq8J_S.js","/assets/concernCategories-B_JXpZeC.js","/assets/copy-BQjK51a4.js","/assets/corner-down-right-BkmsH-fS.js","/assets/createLucideIcon-Oza6q9MQ.js","/assets/exportXlsx-CeJTVrIo.js","/assets/external-link-dBi5qlBX.js","/assets/file-clock-BCfll_DF.js","/assets/file-spreadsheet-B56JmVWI.js","/assets/file-text-rD_RmZM7.js","/assets/flag-DeXpuLOh.js","/assets/flame-MWWoqWpk.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DSIC2kea.js","/assets/funnel-EZrZqsTi.js","/assets/hash-CZGOL_V9.js","/assets/history-DakbhF5p.js","/assets/hourglass-CfQldya7.js","/assets/image-C0DFSyPA.js","/assets/image-off-CgHeSW0A.js","/assets/index-BXqTV2jf.css","/assets/index-Cbh2ahFb.js","/assets/keyboard-CHjOw_57.js","/assets/languages-DhPkSwEk.js","/assets/layers-B_ecJ6zV.js","/assets/leaderReason-CDZI5GzH.js","/assets/lightbulb-BN_zSa6R.js","/assets/link-2-CuFHL8BR.js","/assets/list-checks-CeGq1xlC.js","/assets/list-ordered-Dn82yBNi.js","/assets/lock-open-DhuBj4dC.js","/assets/log-in-CHSoyr-r.js","/assets/message-square-CLNWX2_i.js","/assets/minimize-2-BjZNRt8d.js","/assets/minus-BIDO2HPU.js","/assets/paperclip-6rMk2QOc.js","/assets/pencil-3MWBwg8E.js","/assets/pencil-line-Cm2yz4iG.js","/assets/personName-B4KId4zS.js","/assets/pin-ry2CsVzY.js","/assets/play-BTVLkPhS.js","/assets/prop-types-DghV-c6l.js","/assets/radio-CrzeD-R7.js","/assets/react-apexcharts.esm-C0VZuW8u.js","/assets/refresh-cw-CTLgBdEm.js","/assets/repeat-96wW8jBZ.js","/assets/rotate-ccw-BgPXKBzz.js","/assets/rotate-cw-CUjwKB3v.js","/assets/save-BxDywDTU.js","/assets/scale-D60uTOkf.js","/assets/scroll-text-Bx2IJ1Oy.js","/assets/search-x-BVSKC7R1.js","/assets/segments-C1KY9bxi.js","/assets/send-CQzcEbfT.js","/assets/settings-2-CzvVDbDJ.js","/assets/shield-BHD9rUbM.js","/assets/shield-alert-BP15aK15.js","/assets/shield-check-1EwZL8EM.js","/assets/shield-question-mark-4pXXdH8Z.js","/assets/siren-BVc9NPQS.js","/assets/smartphone-C_WBKkhr.js","/assets/snowflake-CAhzBmA-.js","/assets/square-check-big-BfSmXRF5.js","/assets/square-dnDJpZ81.js","/assets/star-rDv2XsDN.js","/assets/statusBands-CfSPntYk.js","/assets/table-2-DJDE496Y.js","/assets/tag-BhwIuVZk.js","/assets/trash-2-qExR9RjQ.js","/assets/trending-down-9GqVyKyo.js","/assets/trending-up-DoC4gMwz.js","/assets/undo-2-DPchwq-p.js","/assets/useChartTheme-BqTCoiOg.js","/assets/useElementWidth-BvKmr_Ca.js","/assets/useIsMobile-DeEt4Ufq.js","/assets/useMutation-yHYEJYFH.js","/assets/useStatusBands-D96XKVZQ.js","/assets/user-check-CTbv7wrQ.js","/assets/user-cog-BybK5oUM.js","/assets/user-minus-DIkZuDSg.js","/assets/users-BNrk9zI1.js","/assets/verifyState-NL4yz9Q3.js","/assets/video-Cbu4koq-.js","/assets/warehouse-DIqSc8ga.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
