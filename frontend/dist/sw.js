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

const BUILD = "2026-09-20T00:31:29.039Z";
const PRECACHE = ["/","/assets/AdminPanel-Cu0pL6X_.js","/assets/AnalysisBoard-B7nrg6rR.js","/assets/Arc-Crj_RXvu.js","/assets/AttendanceModal-Bbf-pFxD.js","/assets/BrigadirProfile-CembImw0.js","/assets/BroadcastReceivers-DxQwVljG.js","/assets/BroadcastRecord-BoO_tewv.js","/assets/CatLockNotice-DOHs76XX.js","/assets/CategoryLegendModal-kZC-v_fp.js","/assets/CellConcerns-BopuPqD4.js","/assets/CellDetails-D3lBOChG.js","/assets/CellFormModal-DcBaIUHG.js","/assets/CellLink-C2GLIuSU.js","/assets/Cells-CXUnLHUl.js","/assets/ColumnFilter-DVCgaFye.js","/assets/ColumnsPicker-DxaT3Fx7.js","/assets/CommentsModal-BM4eQUJD.js","/assets/ComparisonTable-B8U-fYnI.js","/assets/Concerns-BXljpCh9.js","/assets/ConfirmDialog-CT46Ne3w.js","/assets/Daily-JIbDiqLQ.js","/assets/DataTable-CNFwJEc7.js","/assets/DateRangePicker-DAtdNS5C.js","/assets/DayReportView-B2b87GqC.js","/assets/DayStepper-BIgW3vwv.js","/assets/DifferenceBreakdown-C3x9Aotu.js","/assets/Downtime-Dq7iIw05.js","/assets/Education-es3N7dT7.js","/assets/EducationLesson-DZjPFqiF.js","/assets/EmptyState-CJsCd6jD.js","/assets/FactorySelect-C3P1e8cs.js","/assets/FormField-DiE2kN0v.js","/assets/Gamification-CfGgOdYZ.js","/assets/GroupBadge-DrQs0yFG.js","/assets/HeatmapChart-u5MmjpVu.js","/assets/IdleCell-CpU430SF.js","/assets/KPICard-D_nSvLhI.js","/assets/Kaizen-MEAM8PeC.js","/assets/KpiDeltaCard-CHlz425C.js","/assets/LangTextInput-DS4Tgiy9.js","/assets/Layout-Dd_1SzX5.js","/assets/LeaderDayReport-D-HuVwJ3.js","/assets/LeaderUnitReport-ByMo47a_.js","/assets/Leaderboard-DkswUB8H.js","/assets/Leaders-_1Waj9OK.js","/assets/LiveOverview-BkB4Kn7C.js","/assets/Login-CgAaiI58.js","/assets/NotFound-DqtWcheW.js","/assets/Overview-KmjBvTWP.js","/assets/Pagination-BLRIMTPA.js","/assets/PerenaladkaFactTable-12GOQVwT.js","/assets/PlanFulfillment-VA0KGtcE.js","/assets/Production-B6d6FpAA.js","/assets/Profile-CO7uHO_K.js","/assets/ProofCamera-CSQgqDV4.js","/assets/Quality-BEIYfaJ6.js","/assets/RichTextEditor-CxCsgBuN.js","/assets/SearchInput-BXC5_Jm-.js","/assets/SeasonalityHeatmap-Dm9b2UE0.js","/assets/SegmentedToggle-BP8r3sSZ.js","/assets/SetupTimes-DIBHBYi2.js","/assets/ShiftDaily-C9j73cXF.js","/assets/Skeleton-mJB5zEPF.js","/assets/Staff-B30ErPLy.js","/assets/StatusBadge-DJBlXInp.js","/assets/StyledSelect-Wzie9pCP.js","/assets/Tasks-DvQ6pKZ_.js","/assets/TimeField-sRtocSN4.js","/assets/TimeWheelPicker-D0tn8Sxj.js","/assets/Toast-B0cxBkSz.js","/assets/Tooltip-luj6bhzb.js","/assets/TrendChart-BxnB7dUe.js","/assets/TripleSpeedometer-DKq4izBy.js","/assets/Trudoyomkost-OruEzSIl.js","/assets/UsersActivity-B1Hz5F5b.js","/assets/WatchProgress-CsZBFW-J.js","/assets/WebLogin-CFE1AbMI.js","/assets/WorkerConcerns-Doeqg-Zk.js","/assets/Workers-BbQ8NJHW.js","/assets/Zagruzka-CY4t9vR7.js","/assets/ZagruzkaCell-BBaeGeyK.js","/assets/alarm-clock-CH5jGUL-.js","/assets/api-hPqhhJRn.js","/assets/archive-BwkOdMoi.js","/assets/archive-restore-XUgvJ7d9.js","/assets/arrow-down-BIxC-A21.js","/assets/arrow-left-BYgVm44A.js","/assets/arrow-left-right-K2UDDiGP.js","/assets/arrow-right-DeHJ---L.js","/assets/arrow-up-DEU6KO5n.js","/assets/award-BzuNNxyX.js","/assets/ban-CafU7m67.js","/assets/bot-h1iKvJOs.js","/assets/boxes-DD3I4YVr.js","/assets/brigadirFilters-C4LKQYwF.js","/assets/broadcastTree-j_1V8Uoe.js","/assets/building-2-CFG48RvD.js","/assets/calendar-clock-BbbK6ymI.js","/assets/calendar-days-D-geSTNL.js","/assets/calendar-range-BgKpOMCv.js","/assets/calendar-vZRaNRSQ.js","/assets/camera-CGg3k7Uj.js","/assets/categories-8Gjs9sJN.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CS-2QfFo.js","/assets/chart-line-FV7UPGi-.js","/assets/chart-pie-D-HRBFO3.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-DqUjKsjl.js","/assets/check-DIeZzZ3-.js","/assets/check-check-Bx9rjSmq.js","/assets/chevron-left-oIA3DlVC.js","/assets/chevrons-up-down-D8qVD-GW.js","/assets/circle-dot-CrP_LxXl.js","/assets/circle-minus-Bh4Z1UIm.js","/assets/circle-slash-CNinbgy1.js","/assets/circle-user-round-C8pEE6ki.js","/assets/compass-OulHkSNm.js","/assets/concernCategories-D9T88o5Y.js","/assets/copy-Gpfmraj-.js","/assets/corner-down-right-B3YWPuDT.js","/assets/createLucideIcon-CA0jHV_C.js","/assets/exportXlsx-BHiM2BnK.js","/assets/external-link-CWlU9eC1.js","/assets/file-clock-D3x4OdKE.js","/assets/file-spreadsheet-CXYu1PHC.js","/assets/file-text-4S3hUuPl.js","/assets/flag-CWHI_EjY.js","/assets/flame-Dq0Ktrfa.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BuIqL0j8.js","/assets/funnel-Cnf2Qd48.js","/assets/hash-DjRuytC6.js","/assets/history-B3rOL4Ll.js","/assets/hourglass-C2TsQkGJ.js","/assets/image-CiOaXVFQ.js","/assets/image-off-DDQNpwvO.js","/assets/index-CwxAIvSu.js","/assets/index-PYkJVL39.css","/assets/keyboard-DifWi0aZ.js","/assets/languages-BPbkqPEe.js","/assets/layers-DPcOY4w6.js","/assets/leaderReason-CdU_maMl.js","/assets/lightbulb-Cy48Zbx-.js","/assets/link-2-DTd0eeaL.js","/assets/list-checks-D3a1F_Mk.js","/assets/list-ordered-DWm06j2i.js","/assets/lock-open-CYh4g6XX.js","/assets/log-in-g6V06mPi.js","/assets/message-square-xfnruXHY.js","/assets/minimize-2-CXZ_D3S8.js","/assets/minus-DXoFqRLk.js","/assets/paperclip-CNviOlm_.js","/assets/pencil-B-xXunqR.js","/assets/pencil-line-Ddhe0qW3.js","/assets/personName-B4KId4zS.js","/assets/pin-CeyyOUMf.js","/assets/play-BeJAvVJc.js","/assets/prop-types-Dm0wtY05.js","/assets/radio-9H6VepcL.js","/assets/react-apexcharts.esm-DSNze-DG.js","/assets/refresh-cw-C5u_3edv.js","/assets/repeat-BkiMkZ3B.js","/assets/rotate-ccw-Dzn2Cdci.js","/assets/rotate-cw-CyHUPyqz.js","/assets/save-BHWgszmn.js","/assets/scale-hhw4Ajsv.js","/assets/scroll-text-B8I31qoy.js","/assets/search-x-Ml0uECDZ.js","/assets/segments-CxlUZi38.js","/assets/send-Cp7pA3Ui.js","/assets/settings-2-CPphFbaY.js","/assets/shield-Hh_EKFL8.js","/assets/shield-alert-D7shOx6N.js","/assets/shield-check-DXGyoI9R.js","/assets/shield-question-mark-h8uD5EY9.js","/assets/siren-DR7JXmra.js","/assets/smartphone-C5aqreXN.js","/assets/snowflake-BanCVot0.js","/assets/star-Bp22hKys.js","/assets/statusBands-CbmGkLBt.js","/assets/table-2-j20d5kdK.js","/assets/tag-DfXdxgki.js","/assets/trash-2-C_vRrwzs.js","/assets/trending-down-BKvre4TZ.js","/assets/trending-up-Cksy8P6D.js","/assets/undo-2-Ds0xbvP2.js","/assets/useChartTheme-BAI68u-S.js","/assets/useElementWidth-DS2Hju49.js","/assets/useIsMobile-CD4okqdV.js","/assets/useMutation-CuDPQRvZ.js","/assets/useStatusBands-B0sKMxxH.js","/assets/user-check-D-Z9UngA.js","/assets/user-cog-Dh_EQUUH.js","/assets/user-minus-D3kRqcun.js","/assets/users-wP4wrhad.js","/assets/verifyState-MlxDMWAc.js","/assets/video-D-g1OlCu.js","/assets/warehouse-CpmL96wp.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
