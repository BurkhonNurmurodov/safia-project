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

const BUILD = "2026-10-02T06:48:20.927Z";
const PRECACHE = ["/","/assets/AdminPanel-ZrbEiexm.js","/assets/AnalysisBoard-Cv21O-nA.js","/assets/Arc-COkzSdrM.js","/assets/ArcLegacy-C249Xdwz.js","/assets/BrigadirProfile-DLYr48Pr.js","/assets/BroadcastReceivers-Dn1Lhpwk.js","/assets/BroadcastRecord-z8UGUP4E.js","/assets/CatLockNotice-ASPlT1dH.js","/assets/CategoryLegendModal-CEMyQ7T7.js","/assets/CellConcerns-0vdGLAvx.js","/assets/CellDetails-M_RaBo9l.js","/assets/CellFormModal-VzA1hBaa.js","/assets/CellIdent-h3-veR5D.js","/assets/CellLink--Z9GosnC.js","/assets/Cells-Dyt0z2qO.js","/assets/ColumnFilter-D-gIlAzW.js","/assets/ColumnsPicker-DNApQc01.js","/assets/CommentsModal-CTPdus7X.js","/assets/ComparisonTable-J9P3wTEP.js","/assets/Concerns-Cl9oda59.js","/assets/ConfirmDialog-AuONk0qz.js","/assets/Daily-C2UXTD_r.js","/assets/DataTable-Dxdt0Cdl.js","/assets/DateRangePicker-DOaJo1QR.js","/assets/DayReportView-Ay_iNrBR.js","/assets/DayStepper-DUmVYqYG.js","/assets/DifferenceBreakdown-DA2MO-RP.js","/assets/Downtime-B5ael5Q0.js","/assets/Education-NgPz8tJc.js","/assets/EducationLesson-CPPvm-EZ.js","/assets/EmptyState-DoiJAcjd.js","/assets/Exam-DgWQmHie.js","/assets/FactorySelect-DslBVuJM.js","/assets/Gamification-CuWmHKHY.js","/assets/GroupBadge-B7Q1PKxo.js","/assets/HeatmapChart-Crii83fU.js","/assets/IdleCell-CrV8OTyV.js","/assets/KPICard-CcpOZ1Y2.js","/assets/Kaizen-BQuGTuau.js","/assets/Kelish-BHIQ69S7.js","/assets/KpiDeltaCard-pTH5q3N8.js","/assets/LangTextInput-Dieh9A-q.js","/assets/Layout-CBbOW5AN.js","/assets/LeaderAppeal-De58d4FP.js","/assets/LeaderDayReport-NADhDU-c.js","/assets/LeaderUnitReport-QtiwYFKE.js","/assets/Leaderboard-DUtOPRh0.js","/assets/Leaders-CMcPPt6m.js","/assets/Lightbox-BAgSRQk5.js","/assets/LiveOverview-C9IeGYZK.js","/assets/Login-CQ_oC8_p.js","/assets/NotFound-DNRXbt5Z.js","/assets/Notifications-CLV6V2Yb.js","/assets/Overview-Cpzw4lyA.js","/assets/Pagination-BYrSZ_ms.js","/assets/PerenaladkaFactTable-DVCLzbmR.js","/assets/PlanFulfillment-hqB6R-pv.js","/assets/Production-a1ixK-C3.js","/assets/Profile-CW6uNzPz.js","/assets/ProofCamera-CzmG3jOA.js","/assets/ProofPhoto-OkQ2LT4G.js","/assets/Quality-DLuvpRbn.js","/assets/RequestStateChip-BNhvmnX8.js","/assets/RichTextEditor-LseNlsCK.js","/assets/SaveState-VgyqhFVt.js","/assets/SearchInput-DbMFlU2c.js","/assets/SeasonalityHeatmap-CBcbuhRO.js","/assets/SegmentedToggle-DUO_WkA1.js","/assets/SetupTimes-LulQulm0.js","/assets/ShiftDaily-Bg9PnrBJ.js","/assets/Staff-C2_vGvul.js","/assets/StaffLive-DEjsVJ2u.js","/assets/StatusBadge-ti0nGEpe.js","/assets/TargetGoal-qydXi9u8.js","/assets/Targets-DBvGVg6l.js","/assets/Tasks-pEKjKan3.js","/assets/TimeWheelPicker-DHy3WqCJ.js","/assets/Toast-FG9zu0WW.js","/assets/Tooltip-DWJD1lKh.js","/assets/TrendChart-CPT668Vt.js","/assets/TripleSpeedometer-CHuFpSMF.js","/assets/Trudoyomkost-B6AEmVLf.js","/assets/UploadDropzone-DxbcBwrJ.js","/assets/UsersActivity-BladQAGG.js","/assets/VerdictBlock-CZpVCRzI.js","/assets/WatchProgress-B5ZFMWGA.js","/assets/WebLogin-Ojqwxpc5.js","/assets/WorkerConcerns-BawK-rku.js","/assets/Workers-UFna2UPc.js","/assets/Zagruzka-D2lC99ps.js","/assets/ZagruzkaCell-Bl9_wCsb.js","/assets/api-DLut4XkB.js","/assets/archive-BqtuXRU5.js","/assets/archive-restore-B5BEypsp.js","/assets/arrow-down-DHI1bIGr.js","/assets/arrow-left-nEKWi4ZT.js","/assets/arrow-right-left-DigUWe87.js","/assets/arrow-up-NITLvQel.js","/assets/arrow-up-narrow-wide-w07pw0wS.js","/assets/arrow-up-right-BTlp-I0s.js","/assets/award-DptA5dLz.js","/assets/ban-DqEHL0UU.js","/assets/bot-CMXjWK4a.js","/assets/boxes-PsFw3bA_.js","/assets/brigadirFilters-_cOpRjiD.js","/assets/broadcastTree-Da_ON2vQ.js","/assets/building-2-NGZ8gcUW.js","/assets/calendar-chTNZuP4.js","/assets/calendar-days-Bln6xtAp.js","/assets/calendar-range-frWcFjId.js","/assets/camera-C3J9Tk5P.js","/assets/categories-DNrwu83B.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DhvWWdH0.js","/assets/chart-line-D5u--_nm.js","/assets/chart-pie-CjIQegeF.js","/assets/chartRange-DiiR8n4p.js","/assets/chevron-left-DgIeQ2OU.js","/assets/chevrons-up-down-9oXql9Ri.js","/assets/circle-CCm6SIio.js","/assets/circle-alert-nSLYW646.js","/assets/circle-check-big-CRA7c_gt.js","/assets/circle-minus-De_ts9dR.js","/assets/circle-question-mark-eD8_cx3C.js","/assets/circle-slash-CMCfNESP.js","/assets/circle-user-round-CRUxqfEj.js","/assets/cloud-off-CXU8Q9bj.js","/assets/cloud-upload-DEm2rIHZ.js","/assets/compass-DgLwfCQh.js","/assets/concernCategories-CcrVw8J5.js","/assets/copy-jxDSAWOM.js","/assets/corner-down-right-yDLBMaSK.js","/assets/createLucideIcon-Dlbhu_zQ.js","/assets/es-KENbSVP8.js","/assets/exportXlsx-BZJgefzH.js","/assets/external-link-Cw-UtcFC.js","/assets/file-clock-zWGzDHXU.js","/assets/file-exclamation-point-B8On2izX.js","/assets/file-spreadsheet-CmkVuH0F.js","/assets/file-text-BiXVCjnX.js","/assets/flag-D9iimTYz.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Yn6dPY7l.js","/assets/hash-DExuTOVe.js","/assets/history-DBn0tlpJ.js","/assets/hourglass-DmJVGLPG.js","/assets/id-card-CZ6mPe5s.js","/assets/image-CPSnW3dA.js","/assets/image-off-BL3i1i-E.js","/assets/inbox-XlmUaU-p.js","/assets/index-BXdkP-us.js","/assets/index-bv1wZ_fI.css","/assets/key-round-BPmM0mhE.js","/assets/keyboard-Ki2m2cff.js","/assets/languages-C4TpVuHy.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CV55JcHS.js","/assets/lightbulb-CENc8woD.js","/assets/link-2-Bo4cfizJ.js","/assets/link-2-off-aYb3rXn0.js","/assets/list-ordered-BkcNHB3C.js","/assets/list-tree-B5Xm6sVb.js","/assets/lock-open-agyObiCm.js","/assets/log-in-DhOA7UWL.js","/assets/maximize-2-Bu8KvnjY.js","/assets/message-square-HXkVDj0s.js","/assets/minimize-2-ChJ9tKF_.js","/assets/package-check-CX6rCuOG.js","/assets/paperclip-Bv_FPs-W.js","/assets/pencil-DlKLkvx1.js","/assets/percent-BZlN2loz.js","/assets/pin-K-fWLICm.js","/assets/pin-off-BR45GScE.js","/assets/play-Dr2FhNYU.js","/assets/plug-zap-UBQASu8n.js","/assets/presentation-DTT7Vnnn.js","/assets/prop-types-VnaBCYLu.js","/assets/radio-DVdZFNkj.js","/assets/react-apexcharts.esm-fTimLeBf.js","/assets/repeat-CPf954FM.js","/assets/rotate-ccw-fHqDP9-c.js","/assets/rotate-cw-BkS5l51R.js","/assets/save-Bxikd8P0.js","/assets/scopeLinks-Cri8MmxY.js","/assets/scroll-text-cdpxqOMD.js","/assets/search-x-B0HctOZB.js","/assets/segments-DOM9Gook.js","/assets/send-u29ZUf7d.js","/assets/settings-2-CthtIw_p.js","/assets/shield-DKGwkadc.js","/assets/shield-alert-B1f6zLX5.js","/assets/shield-check-CQjEFcL2.js","/assets/shield-question-mark-zqPI6ho1.js","/assets/siren-VfjNXzpN.js","/assets/snowflake-D9252OoQ.js","/assets/split-CrOXeJ-w.js","/assets/square-B54eVukm.js","/assets/square-check-big-CpU7_1Vz.js","/assets/star-CX_XCYGi.js","/assets/statusBands-C11d4MBQ.js","/assets/store-DBcQtOLI.js","/assets/table-2-k09rgcTD.js","/assets/table-properties-CBgGcTJA.js","/assets/tag-Cwlc30ny.js","/assets/timer-off-BE6M54lz.js","/assets/trending-down-DEq4k3L7.js","/assets/trending-up-xo2WPuUi.js","/assets/undo-2-DaiVKu7b.js","/assets/useChartTheme-Biqp6M42.js","/assets/useElementWidth-DCF1Qife.js","/assets/useIsMobile-Bw20xmlh.js","/assets/useOpenParam-X5CM7e31.js","/assets/useStatusBands-gjIjD39A.js","/assets/useUrlScope-BpIk4jFz.js","/assets/user-D2fB2Y4l.js","/assets/user-cog-DH23U5H5.js","/assets/user-minus-BNKKI9I8.js","/assets/users-I3JVcAkV.js","/assets/video-BHqENTtc.js","/assets/wallet-DxOU-cRs.js","/assets/warehouse-vQ1z1zRe.js","/assets/x-DvvNkxqN.js","/assets/zap-BNlh_GhR.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
