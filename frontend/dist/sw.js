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

const BUILD = "2026-09-23T06:29:47.173Z";
const PRECACHE = ["/","/assets/AdminPanel-Cq8NLlnF.js","/assets/AnalysisBoard-yKd-f2YD.js","/assets/Arc-Dm9nd3Bx.js","/assets/AttendanceModal-DX5yPpOO.js","/assets/BrigadirProfile-DSQV8z_c.js","/assets/BroadcastReceivers-Cv_LgF9g.js","/assets/BroadcastRecord-DKLchn1Q.js","/assets/CatLockNotice-CFtDJQb-.js","/assets/CategoryLegendModal-C57TlJiN.js","/assets/CellConcerns-Cn9R-WMw.js","/assets/CellDetails-CuD6ewE1.js","/assets/CellFormModal-uZSLNBQu.js","/assets/CellLink-DhE1Nz25.js","/assets/Cells-qdgG_mjd.js","/assets/ColumnFilter-DDmkBYNS.js","/assets/ColumnsPicker-BpAVQA5-.js","/assets/CommentsModal-B_E6N-m-.js","/assets/ComparisonTable-CvH4ZB0Y.js","/assets/Concerns-Yxi4HV41.js","/assets/ConfirmDialog-DEZ6eQFN.js","/assets/Daily-7k0QkLI_.js","/assets/DataTable-CNQF34uB.js","/assets/DateRangePicker-We_MBayl.js","/assets/DayReportView-DO7U9s-4.js","/assets/DayStepper-DbATESGU.js","/assets/DifferenceBreakdown-le7CfRkS.js","/assets/Downtime-DMNqAU8J.js","/assets/Education-BSx8DAY6.js","/assets/EducationLesson-CobFC8_w.js","/assets/EmptyState-QiUFVnln.js","/assets/FactorySelect-DrXNZaVd.js","/assets/FormField-CUMe_jSX.js","/assets/Gamification-DsST-pvp.js","/assets/GroupBadge-B6nPGPBm.js","/assets/HeatmapChart-DxMYguWG.js","/assets/IdleCell-BiYc0hhl.js","/assets/KPICard-JPhULwEd.js","/assets/Kaizen-qNwtJapl.js","/assets/KpiDeltaCard-DH7uFE2K.js","/assets/LangTextInput-DfYZdpIQ.js","/assets/Layout-CKZg_TIy.js","/assets/LeaderDayReport-BGyfDTQU.js","/assets/LeaderUnitReport-7gqGvbeZ.js","/assets/Leaderboard-B8uug-fH.js","/assets/Leaders-C-YuqaYM.js","/assets/LiveOverview-DilFAsP9.js","/assets/Login-tzdIbagO.js","/assets/NotFound-COYFWCPo.js","/assets/Overview-B_kMvDkJ.js","/assets/Pagination-8JWy68S4.js","/assets/PerenaladkaFactTable-BFQLpkN2.js","/assets/PlanFulfillment-CI8GSnke.js","/assets/Production-DVLwik-l.js","/assets/Profile-B3d7U9k0.js","/assets/ProofCamera-CqXvkjQI.js","/assets/Quality-i6sLMua4.js","/assets/RichTextEditor-O_US0b8A.js","/assets/SearchInput-8VEPg4l0.js","/assets/SeasonalityHeatmap-DfxdbV4j.js","/assets/SegmentedToggle-BcnCUp1f.js","/assets/SetupTimes-BfADYEBp.js","/assets/ShiftDaily-CjcKO2Gg.js","/assets/Skeleton-CgUfRudX.js","/assets/Staff-i3T-Xo-f.js","/assets/StatusBadge-B6T8s5_V.js","/assets/StyledSelect-BD6kJwCl.js","/assets/Targets-D3vp9QY2.js","/assets/Tasks-mn3IEv3j.js","/assets/TimeField-CKilgRM-.js","/assets/TimeWheelPicker-DuDlhRLg.js","/assets/Toast-BncOzRig.js","/assets/Tooltip-DFg1eVZi.js","/assets/TrendChart-BeLUgbjD.js","/assets/TripleSpeedometer-DIVIq76J.js","/assets/Trudoyomkost-Bx1vrWWG.js","/assets/UsersActivity-J5Fu6wJh.js","/assets/WatchProgress-BZvkZjlm.js","/assets/WebLogin-Cv58-t-y.js","/assets/WorkerConcerns-Cf3mUJTF.js","/assets/Workers-DQaWI61X.js","/assets/Zagruzka-Da8xPmlt.js","/assets/ZagruzkaCell-BXXpqigu.js","/assets/alarm-clock-D1cwMWVg.js","/assets/api-DMbpsrlR.js","/assets/archive-restore-3cj9XM0T.js","/assets/archive-xa-ik6F0.js","/assets/arrow-down-BdpdrTss.js","/assets/arrow-left-BEvne13r.js","/assets/arrow-left-right-D1HCinpK.js","/assets/arrow-right-BA98KjLC.js","/assets/arrow-up-BvxeLYHF.js","/assets/arrow-up-right-BwzaBAqK.js","/assets/award-DgcYUnWs.js","/assets/ban-CCR51uYc.js","/assets/bot-Cbc5HquS.js","/assets/boxes-D71PWGvC.js","/assets/brigadirFilters-DaAEow_G.js","/assets/broadcastTree-BFzXhFjT.js","/assets/building-2-CE_S6QCH.js","/assets/calendar-clock-DrBEWNoM.js","/assets/calendar-days-CIYWAMcS.js","/assets/calendar-range-D7DWzjG3.js","/assets/calendar-uVttx_Hk.js","/assets/camera-D7ljT2gV.js","/assets/categories-LPGY2XOs.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-rsfYfFAD.js","/assets/chart-line-CHmszBrW.js","/assets/chart-pie-B4D9okXQ.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-BGqQCPTv.js","/assets/check-Bs_7f8tM.js","/assets/check-check-pxxkmX3o.js","/assets/chevron-left-CKguRLyX.js","/assets/chevrons-up-down-BV3yblyg.js","/assets/circle-dashed-D7_R4OaH.js","/assets/circle-dot-CsWxmDem.js","/assets/circle-minus-D1UOuNnc.js","/assets/circle-slash-DsOUgk5C.js","/assets/circle-user-round-BkuqeWoR.js","/assets/coins-DIm_HteW.js","/assets/compass-CMv0uoSd.js","/assets/concernCategories-DZ_wcE42.js","/assets/copy-DBUj9mVc.js","/assets/corner-down-right-va-QpIq_.js","/assets/createLucideIcon-CDlNGRmy.js","/assets/exportXlsx-zcaFCf7I.js","/assets/external-link-B6jW-Klj.js","/assets/file-clock-9jCCR9RI.js","/assets/file-spreadsheet-BM0lk2HD.js","/assets/file-text-CnLp8-zK.js","/assets/flag-CnaPjiH6.js","/assets/flame-Cw7Gkz3f.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Bp1m-vy-.js","/assets/funnel-ZOp18zdR.js","/assets/hash-CVgVcznA.js","/assets/history-CYZ9T0h3.js","/assets/hourglass-B0mSek4e.js","/assets/image-DR4We5Yh.js","/assets/image-off-B5n7ZPR0.js","/assets/index-Q2rghCdK.js","/assets/index-ftrCYFhP.css","/assets/keyboard-XvDsaawv.js","/assets/languages-C0hZ0qB8.js","/assets/layers-Dtjmk6Z0.js","/assets/leaderReason-CMGA4EiG.js","/assets/lightbulb-Cz3nh8pq.js","/assets/link-2-JrO6xADx.js","/assets/list-checks-Bh-TEaSm.js","/assets/list-ordered-DZqGAM7k.js","/assets/lock-open-D5tW6GFG.js","/assets/log-in-W90ca-64.js","/assets/message-square-C0Y4S0ko.js","/assets/minimize-2-BC5mvhpP.js","/assets/minus-Dmn2Rnnw.js","/assets/paperclip-B0RJiMNN.js","/assets/pencil-D4stq5KD.js","/assets/pencil-line-DQF2juoX.js","/assets/personName-B4KId4zS.js","/assets/pin-D_dbkeZK.js","/assets/play-Dq2llifR.js","/assets/presentation-uJtmkh-D.js","/assets/prop-types-DjvNjLfx.js","/assets/radio-DW4jOorY.js","/assets/react-apexcharts.esm-DAKpoBPv.js","/assets/refresh-cw-D2aLEae9.js","/assets/repeat-B04QR3af.js","/assets/rotate-ccw-FRw4xDMJ.js","/assets/rotate-cw-CG1hNHHO.js","/assets/save-DQnLE3aB.js","/assets/scale-BZWWcTeS.js","/assets/scroll-text-vtpBmlSn.js","/assets/search-x-Dg5Cww7K.js","/assets/segments-BH8Kq9sx.js","/assets/send-Dk_9858v.js","/assets/settings-2-WO1X7mJA.js","/assets/shield-DiNNIkD9.js","/assets/shield-alert-DoZ5X7Io.js","/assets/shield-check-Bn0JTvL7.js","/assets/shield-question-mark-CUt2JJet.js","/assets/siren-C_xRRmyJ.js","/assets/smartphone-Cfpsw3Vs.js","/assets/snowflake-0vwWBqIG.js","/assets/square-Dy13_evI.js","/assets/square-check-big-BQphpaiv.js","/assets/star-Aedsh4vZ.js","/assets/statusBands-1F25AwmR.js","/assets/table-2-Dbp2Bb81.js","/assets/tag-yIWu6Uuq.js","/assets/trash-2-C3xD02GL.js","/assets/trending-down-DXID3dzQ.js","/assets/trending-up-By_ZJxpG.js","/assets/undo-2-jHRroUvn.js","/assets/useChartTheme-70wRkhqL.js","/assets/useElementWidth-QH3-3sgP.js","/assets/useIsMobile-hgAYXxYi.js","/assets/useMutation-B-q2qbLj.js","/assets/useStatusBands-DemYB6vD.js","/assets/user-check-DpQFQ08k.js","/assets/user-cog-BYiB7aOz.js","/assets/user-minus-cOtfjvIJ.js","/assets/users-Cf32Y57l.js","/assets/verifyState-Bc8_FyMw.js","/assets/video-NX1_gDuE.js","/assets/warehouse-C9yt8jfL.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
