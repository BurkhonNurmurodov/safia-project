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

const BUILD = "2026-09-26T08:11:10.240Z";
const PRECACHE = ["/","/assets/AdminPanel-Dlj6letr.js","/assets/AnalysisBoard-ZJMXLNmh.js","/assets/Arc-CMJY08-F.js","/assets/ArcLegacy-GzqDEuK6.js","/assets/AttendanceModal-lX760tKb.js","/assets/BrigadirProfile-DQRpn1kX.js","/assets/BroadcastReceivers-DxZqo1Ie.js","/assets/BroadcastRecord-gnwn_tBP.js","/assets/CatLockNotice-BDaH77Pf.js","/assets/CategoryLegendModal-CLdwZpP-.js","/assets/CellConcerns-DfMO0ut3.js","/assets/CellDetails-CiCauCmd.js","/assets/CellFormModal-CWbxj-W2.js","/assets/CellLink-kiJUev1H.js","/assets/Cells-BoxsD_na.js","/assets/ColumnFilter-u4VcRvYG.js","/assets/ColumnsPicker-DjOcSqa9.js","/assets/CommentsModal-BcisvCg0.js","/assets/ComparisonTable-C8hnHmaA.js","/assets/Concerns-Bn6RmRfE.js","/assets/ConfirmDialog-CJixpvLM.js","/assets/Daily-B5oX_BKs.js","/assets/DataTable-DrgLFsKx.js","/assets/DateRangePicker-CST4OuJv.js","/assets/DayReportView-Bgvd7LEs.js","/assets/DayStepper-CorhfJ0c.js","/assets/DifferenceBreakdown-fh3JePlK.js","/assets/Downtime--TkDv5Kc.js","/assets/Education-BSGbYHYs.js","/assets/EducationLesson-CEoLLqPT.js","/assets/EmptyState-BWVgMbcD.js","/assets/Exam-CrM4FtAJ.js","/assets/FactorySelect-DxjvSTZS.js","/assets/Gamification-BA9tEwnl.js","/assets/GroupBadge-C0vUahEi.js","/assets/HeatmapChart-K6jOtVBV.js","/assets/IdleCell-Z3O6O6ig.js","/assets/KPICard-BJNpQ5f1.js","/assets/Kaizen-CyFO9L-b.js","/assets/KpiDeltaCard-Da2aRowh.js","/assets/LangTextInput-Baw7lgzY.js","/assets/Layout-DmuDO_5u.js","/assets/LeaderDayReport-BoJZVR6S.js","/assets/LeaderUnitReport-D6afIKDZ.js","/assets/Leaderboard-Bt9SgKrO.js","/assets/Leaders-DOm_olEM.js","/assets/LiveOverview-Cd6CTnG5.js","/assets/Login-C92uSHz2.js","/assets/NotFound-D8enRfEa.js","/assets/Overview-CglYl8ZC.js","/assets/Pagination-CCcxNAVr.js","/assets/PerenaladkaFactTable-BgtwO9n1.js","/assets/PlanFulfillment-vFkRXCTs.js","/assets/Production-DpxRVRhI.js","/assets/Profile-BXi7AvER.js","/assets/ProofCamera-CLIybDKZ.js","/assets/Quality-DiPmhFfk.js","/assets/RequestStateChip-C0QL3tyM.js","/assets/RichTextEditor-j9uY-dSj.js","/assets/SearchInput-6YUHfa9g.js","/assets/SeasonalityHeatmap-D_UvgFrz.js","/assets/SegmentedToggle-DPBL-4U0.js","/assets/SetupTimes-COGSk1iI.js","/assets/ShiftDaily-gKXS8jb6.js","/assets/Staff-CT7VWS8C.js","/assets/StatusBadge-CLVtcaNJ.js","/assets/Targets-C6vxFrb-.js","/assets/Tasks-CnBXOkyQ.js","/assets/TimeWheelPicker-CmKcXsen.js","/assets/Tooltip-5qBDs7tJ.js","/assets/TrendChart-bIy8rCjC.js","/assets/TripleSpeedometer-DaKHOYlt.js","/assets/Trudoyomkost-C3KhSUdB.js","/assets/UsersActivity-BrDcJ24m.js","/assets/WatchProgress-iDiZSnln.js","/assets/WebLogin-BWjXmQ7q.js","/assets/WorkerConcerns-DIoJ7roH.js","/assets/Workers-De4iJkIE.js","/assets/Zagruzka-4XuWGURH.js","/assets/ZagruzkaCell-BU6Q1LTr.js","/assets/alarm-clock-BVude8tl.js","/assets/api-B8pNViAm.js","/assets/archive-Tj4c3F6w.js","/assets/archive-restore-YM1pkgMT.js","/assets/arrow-down-Oh02AH00.js","/assets/arrow-left-D9JA1DkG.js","/assets/arrow-left-right-BCarUU7W.js","/assets/arrow-up-2GBgEQ_R.js","/assets/arrow-up-right-BbTk0TC8.js","/assets/award-BDZ-iFvj.js","/assets/ban-CVaNULLx.js","/assets/bot-ByiIV0J5.js","/assets/boxes-ZO5F3IFX.js","/assets/brigadirFilters-DMYR09TT.js","/assets/broadcastTree-DVVvQj7T.js","/assets/building-2-DEaUmQC2.js","/assets/calendar-KIF0rp-N.js","/assets/calendar-clock-C3V4BZlV.js","/assets/calendar-days-BoCOxmYI.js","/assets/calendar-range-pNuG4SQa.js","/assets/camera-B3vENVyR.js","/assets/categories-CHqVpPSr.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DvmyDE8E.js","/assets/chart-line-kia7FcIp.js","/assets/chart-pie-CHtpWNPt.js","/assets/chartRange-CmeUw8oK.js","/assets/check-check-DZpxb-VP.js","/assets/chevron-left-bybazFbu.js","/assets/chevrons-up-down-bBAldJb3.js","/assets/circle-check-big-DQTWntu0.js","/assets/circle-dashed-CYloxh-h.js","/assets/circle-dot-DSTLHsCu.js","/assets/circle-minus-DAO4_OAR.js","/assets/circle-slash-H1wGoBY4.js","/assets/circle-user-round-BvjnkAF-.js","/assets/coins-DTTiVEFh.js","/assets/compass-DNrtN1J-.js","/assets/concernCategories-CqKR9IXy.js","/assets/copy-CxgnePmQ.js","/assets/corner-down-right-C5NKnbHv.js","/assets/createLucideIcon-CmVr5db9.js","/assets/exportXlsx-CWuQPSdN.js","/assets/external-link-Dupct5QK.js","/assets/file-clock-e6WsOA91.js","/assets/file-exclamation-point-BT2zC57W.js","/assets/file-spreadsheet-DOD3QOdU.js","/assets/file-text-CIivTkwF.js","/assets/flag-8QuXCLsV.js","/assets/flame-B3qTVBEu.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DVRg_C-Q.js","/assets/hash-BS_q3jy5.js","/assets/history-CPnMSXD9.js","/assets/hourglass-7P4nWnV8.js","/assets/image-CNpyJyUd.js","/assets/image-off-BKVbVFp8.js","/assets/index-BTZsppTH.css","/assets/index-DxfqWqsV.js","/assets/key-round-DY-3adhL.js","/assets/keyboard-DQ7TgwrJ.js","/assets/languages-D7-aoigL.js","/assets/layers-B8TG3STi.js","/assets/leaderReason-VaPLi_fb.js","/assets/lightbulb-B4OUUJU8.js","/assets/link-2-4HRPUxOA.js","/assets/list-checks-CPocHmai.js","/assets/list-ordered-DONjdOk8.js","/assets/list-tree-D1TAEDPR.js","/assets/lock-open-Cv9_fWpc.js","/assets/log-in-DUfa9Ayz.js","/assets/message-square-Bq3M3GsI.js","/assets/minimize-2-CBeYxBlD.js","/assets/package-check-ClZ9vGiD.js","/assets/paperclip-BpQWj9tY.js","/assets/pencil-CA57MbQf.js","/assets/personName-B4KId4zS.js","/assets/pin-Cz7Lnc8-.js","/assets/play-BQXfkuZz.js","/assets/presentation-Bpw4p4A4.js","/assets/prop-types-CQevu7it.js","/assets/radio-WLrbH_pG.js","/assets/react-apexcharts.esm-365zN31V.js","/assets/repeat-C_7W8A77.js","/assets/rotate-ccw-Cgdeo2Mf.js","/assets/rotate-cw-COh-1Pmo.js","/assets/save-DFCRu9ao.js","/assets/scale-DE8ybIJw.js","/assets/scroll-text-BzzF0qg7.js","/assets/search-x-D1NATSry.js","/assets/segments-Dhd3bsP3.js","/assets/send-CfkmAVPs.js","/assets/settings-2-luUTl3_a.js","/assets/shield-Bw160qTM.js","/assets/shield-alert-Cmj7y9FM.js","/assets/shield-check-Bd9L178y.js","/assets/shield-question-mark-DUezOjOe.js","/assets/siren-BKFIy3Gp.js","/assets/smartphone-DY94IeTj.js","/assets/snowflake-333Q0WPp.js","/assets/square-BVwZUlOR.js","/assets/square-check-big-DPZ7va-Q.js","/assets/star-CyQeACTH.js","/assets/statusBands-B3F7nlzU.js","/assets/store-BLBzNlKu.js","/assets/table-2-D4XQxXr4.js","/assets/tag-DxLiycnd.js","/assets/trending-down-dSmXAvM6.js","/assets/trending-up-v763m6cR.js","/assets/triangle-alert-DEXMASVC.js","/assets/undo-2-B6TO3jdu.js","/assets/useChartTheme-D743P7W4.js","/assets/useElementWidth-CJgk9aKR.js","/assets/useIsMobile-Ue4OnU7H.js","/assets/useMutation-DBqE6DE8.js","/assets/useStatusBands-MeEbOnLz.js","/assets/user-CpeGE0RM.js","/assets/user-check-xLDH46Yn.js","/assets/user-cog-DNtoJEy4.js","/assets/user-minus-ButsKorm.js","/assets/users-BPUiQTHx.js","/assets/verifyState-44tLisb0.js","/assets/video-BCaiSs_q.js","/assets/warehouse-CxFc1wCG.js","/assets/zap-BCyOqtVR.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
