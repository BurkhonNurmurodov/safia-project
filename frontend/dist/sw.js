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

const BUILD = "2026-10-02T06:38:40.132Z";
const PRECACHE = ["/","/assets/AdminPanel-zjbZL7aH.js","/assets/AnalysisBoard-DaNULa3r.js","/assets/Arc-BVwwwvQt.js","/assets/ArcLegacy-DdEWBZhA.js","/assets/BrigadirProfile-B7PHOL_H.js","/assets/BroadcastReceivers-DyOCg6Qb.js","/assets/BroadcastRecord-9Sg1Azyi.js","/assets/CatLockNotice-CMhSIUsH.js","/assets/CategoryLegendModal-BSiszPg9.js","/assets/CellConcerns-DSMKddi8.js","/assets/CellDetails-CDmR5Npl.js","/assets/CellFormModal-yPgh6lhN.js","/assets/CellIdent-BDNzUl4c.js","/assets/CellLink-D-DQe-Hv.js","/assets/Cells-BkpCU9w3.js","/assets/ColumnFilter-D4zaEe4V.js","/assets/ColumnsPicker-BRLqoUIN.js","/assets/CommentsModal-DOzptO-Z.js","/assets/ComparisonTable-xTE6Ocri.js","/assets/Concerns-CaO_8yWA.js","/assets/ConfirmDialog-BRB7hAYQ.js","/assets/Daily-D3syZz8M.js","/assets/DataTable-D1rmKznm.js","/assets/DateRangePicker-C_AqwgYC.js","/assets/DayReportView-CVIreq5V.js","/assets/DayStepper-Qv3F__d5.js","/assets/DifferenceBreakdown-DQYRoRwo.js","/assets/Downtime-Bd6EhpU1.js","/assets/Education-BuZz8kdC.js","/assets/EducationLesson-BupzQjac.js","/assets/EmptyState-D1DFuw5J.js","/assets/Exam-DweGgv-S.js","/assets/FactorySelect-s1-NE-ct.js","/assets/Gamification-BxHWKgLE.js","/assets/GroupBadge-BVFXzBeQ.js","/assets/HeatmapChart-DkmKFZyB.js","/assets/IdleCell-DXF0pbyu.js","/assets/KPICard-BKSVqNej.js","/assets/Kaizen-n-RJw9Qo.js","/assets/Kelish-xZxFwPqC.js","/assets/KpiDeltaCard-C9na4KDU.js","/assets/LangTextInput-r-pNf-fa.js","/assets/Layout-CSYAoFK7.js","/assets/LeaderAppeal-BwvjEQUD.js","/assets/LeaderDayReport-CXKl2WJQ.js","/assets/LeaderUnitReport-9jF-ISQ6.js","/assets/Leaderboard-BPJq2auZ.js","/assets/Leaders-DNKfEUjZ.js","/assets/Lightbox-fuuoEV5z.js","/assets/LiveOverview-CNOH2DE6.js","/assets/Login-DMbNPAlh.js","/assets/NotFound-CkXti7m8.js","/assets/Notifications-DtDgBoUZ.js","/assets/Overview-Co7dp9NA.js","/assets/Pagination-BClaYcQM.js","/assets/PerenaladkaFactTable-DMGithpX.js","/assets/PlanFulfillment-D7fycB6W.js","/assets/Production-DOYmpM9f.js","/assets/Profile-6DIUbLwi.js","/assets/ProofCamera-BcnlZodG.js","/assets/ProofPhoto-oVenhjqq.js","/assets/Quality-uKePYkT-.js","/assets/RequestStateChip-_pPBEeec.js","/assets/RichTextEditor-BtDdB4eB.js","/assets/SaveState-C4-In1zs.js","/assets/SearchInput-DeczXzdv.js","/assets/SeasonalityHeatmap-D5smrsm6.js","/assets/SegmentedToggle-Cp1K_W6G.js","/assets/SetupTimes-CcgMBAqu.js","/assets/ShiftDaily-DhQyA2PP.js","/assets/Staff-0kLvLL8G.js","/assets/StaffLive-DxM3G35C.js","/assets/StatusBadge-D7qnCSir.js","/assets/TargetGoal-C80UaS4G.js","/assets/Targets-Bd0miVp_.js","/assets/Tasks-DM8rHFN8.js","/assets/TimeWheelPicker-BFICICHH.js","/assets/Toast-C7MD8vcN.js","/assets/Tooltip-XR0t0Pq4.js","/assets/TrendChart-BF-odeFZ.js","/assets/TripleSpeedometer-BYRbxf42.js","/assets/Trudoyomkost-DWyj0HVI.js","/assets/UploadDropzone-BaL1BHAY.js","/assets/UsersActivity-xJwKOIaW.js","/assets/VerdictBlock-UKMRXYKE.js","/assets/WatchProgress-ERyalBxS.js","/assets/WebLogin-Dwr8byJs.js","/assets/WorkerConcerns-CHeRVUV6.js","/assets/Workers-CBiHC4F9.js","/assets/Zagruzka-1WpWnehd.js","/assets/ZagruzkaCell-33_eOVOc.js","/assets/api-ZkGO5OEf.js","/assets/archive-BS6xuiIG.js","/assets/archive-restore-Cm80SI9E.js","/assets/arrow-down-CcOhQnKd.js","/assets/arrow-left-B1NwqS_h.js","/assets/arrow-right-left-B90qnMqU.js","/assets/arrow-up-ClbVY39l.js","/assets/arrow-up-narrow-wide-CXaCvVLE.js","/assets/arrow-up-right-Cfh1-HqT.js","/assets/award-DqlXlBmb.js","/assets/ban-Bdd_aJXO.js","/assets/bot-2nS8cOAm.js","/assets/boxes-D87RVTuP.js","/assets/brigadirFilters-BHMeiCHZ.js","/assets/broadcastTree-DUg26Wmq.js","/assets/building-2-BWIcIIrB.js","/assets/calendar-days-CL08KxVQ.js","/assets/calendar-range-Cm9sympa.js","/assets/calendar-tPi2SHPD.js","/assets/camera-CqfOYtkB.js","/assets/categories-SRLt9ky9.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Ci3Qo5Ur.js","/assets/chart-line-HOOaPuRl.js","/assets/chart-pie-Ygx-IgQC.js","/assets/chartRange-0BEratra.js","/assets/chevron-left-DJYvKY0H.js","/assets/chevrons-up-down-CXo70Pnx.js","/assets/circle-DSpc9aOr.js","/assets/circle-alert-D2LuMvIO.js","/assets/circle-check-big-JfFkxsDU.js","/assets/circle-minus-C5DPvGRn.js","/assets/circle-question-mark-OIaUjEcx.js","/assets/circle-slash-DMiPm0Cz.js","/assets/circle-user-round-tw3IYw5O.js","/assets/cloud-off-B-25XpkT.js","/assets/cloud-upload-CPWlv6oP.js","/assets/compass-FNJr2kRp.js","/assets/concernCategories-BooHlReT.js","/assets/copy-Bw31HCj1.js","/assets/corner-down-right-DzygQqqv.js","/assets/createLucideIcon-Dbat3dBk.js","/assets/es-BecCdzBL.js","/assets/exportXlsx-DJ0_ymA_.js","/assets/external-link-BVzTPEeN.js","/assets/file-clock-C6voCs9I.js","/assets/file-exclamation-point-B_ZxEzjf.js","/assets/file-spreadsheet-DpqVvskb.js","/assets/file-text-CcLHnipQ.js","/assets/flag-CYSh8eGu.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CFatJrJR.js","/assets/hash-lYhO8WkS.js","/assets/history-BevT1_Im.js","/assets/hourglass-Caz9CwIe.js","/assets/id-card-pyigFruf.js","/assets/image-DtR2r3ql.js","/assets/image-off-DSTUlFEC.js","/assets/inbox-YUV7Q3MG.js","/assets/index-JnMJ-qV7.js","/assets/index-bv1wZ_fI.css","/assets/key-round-alZcf2ED.js","/assets/keyboard-mign_ysW.js","/assets/languages-DmsdIH8t.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CXAUjiRi.js","/assets/lightbulb-C3gJjDJV.js","/assets/link-2-Cb-Fo3d0.js","/assets/link-2-off-B3tjDcHN.js","/assets/list-ordered-BlyagM4d.js","/assets/list-tree-BPFE6fvL.js","/assets/lock-open-BHsp922R.js","/assets/log-in-pA78-lD5.js","/assets/maximize-2-b-HEIWWs.js","/assets/message-square-DAl6inGQ.js","/assets/minimize-2-7FH7qdN-.js","/assets/package-check-QYu3mTWt.js","/assets/paperclip-DTHm6t0e.js","/assets/pencil-D1JcTzM6.js","/assets/percent-DO07TdwK.js","/assets/pin-DJ65kN6q.js","/assets/pin-off-DDk8_CRc.js","/assets/play-zHI_0gEm.js","/assets/plug-zap-Cv5b_B87.js","/assets/presentation-B4Az10QF.js","/assets/prop-types-CYCy95M_.js","/assets/radio-w3sE7oHa.js","/assets/react-apexcharts.esm-CzGGP8So.js","/assets/repeat-gGjajUsz.js","/assets/rotate-ccw-D4yywr3N.js","/assets/rotate-cw-BBCLc-nl.js","/assets/save-DkWZKyQZ.js","/assets/scopeLinks-CrtL-VAk.js","/assets/scroll-text-CR-vjpsj.js","/assets/search-x-J13k6gSK.js","/assets/segments-DMKOG3Ja.js","/assets/send-C8zwdpH_.js","/assets/settings-2-Bafq8V1T.js","/assets/shield-alert-BzMWKHzg.js","/assets/shield-cJRvIfeb.js","/assets/shield-check-nHorkjH_.js","/assets/shield-question-mark-DaBrN9zc.js","/assets/siren-CyLHAvbB.js","/assets/snowflake-CDm2ykvN.js","/assets/split-DYqxOyV_.js","/assets/square-DkIHZO5J.js","/assets/square-check-big-Ci46K_eJ.js","/assets/star-Dmev2Wan.js","/assets/statusBands-Bj06z2Mt.js","/assets/store-nzgIbHm3.js","/assets/table-2-CpZ9Pzfn.js","/assets/table-properties-D9E9Bdfx.js","/assets/tag-el94Kmw7.js","/assets/timer-off-COhTfglt.js","/assets/trending-down-B-_-RWKG.js","/assets/trending-up-CgFIJ-Nk.js","/assets/undo-2-JUudFisr.js","/assets/useChartTheme-DxbG9c2j.js","/assets/useElementWidth-BcgksnNN.js","/assets/useIsMobile-B5Tse6Yo.js","/assets/useOpenParam-BiAqssPb.js","/assets/useStatusBands-BWotCQt6.js","/assets/useUrlScope-BJF7YtSQ.js","/assets/user-B2qclHqC.js","/assets/user-cog-DnnrpMIQ.js","/assets/user-minus-HWMpS2N7.js","/assets/users-B38SiHrk.js","/assets/video-2cw9s_ly.js","/assets/wallet-Uv-oWvQn.js","/assets/warehouse-DdhV9dWZ.js","/assets/x-DBJY9hIY.js","/assets/zap-CzsEenx0.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
