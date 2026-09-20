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

const BUILD = "2026-09-20T00:09:28.836Z";
const PRECACHE = ["/","/assets/AdminPanel-n6MzaGDl.js","/assets/AnalysisBoard-CGmfyUke.js","/assets/Arc-D2VuS67V.js","/assets/AttendanceModal-V4MBeg2H.js","/assets/BrigadirProfile-2Sz4K9es.js","/assets/BroadcastReceivers-DQmcIfC-.js","/assets/BroadcastRecord-nlODqCRW.js","/assets/CatLockNotice-Dxgubg1z.js","/assets/CategoryLegendModal-fLOe27LQ.js","/assets/CellConcerns-FZxmapsF.js","/assets/CellDetails-BPLVaTcx.js","/assets/CellFormModal-BC_sFCdV.js","/assets/CellLink-U2EX6SFO.js","/assets/Cells-Dqw9dfnQ.js","/assets/ColumnFilter-DcWXqmLZ.js","/assets/ColumnsPicker-DeO3_0nA.js","/assets/CommentsModal-CGGcXE6z.js","/assets/ComparisonTable-CSUWpEih.js","/assets/Concerns-CuashdHF.js","/assets/ConfirmDialog-B7m2TOQb.js","/assets/Daily-DdERWHhi.js","/assets/DataTable-DiizVNlz.js","/assets/DateRangePicker-B5biw1tF.js","/assets/DayReportView-B9OR13l8.js","/assets/DayStepper-BIT2PoZu.js","/assets/DifferenceBreakdown-CgRG1Gos.js","/assets/Downtime-DJxXqB3S.js","/assets/Education-CT65cF17.js","/assets/EducationLesson-zRXb8Tyy.js","/assets/EmptyState-k5KGO-b0.js","/assets/FactorySelect-BZKFJHE-.js","/assets/FormField-BTiCcqOT.js","/assets/Gamification-C4ElA_6S.js","/assets/GroupBadge-DWo5g3ty.js","/assets/HeatmapChart-6Ko28C4H.js","/assets/IdleCell-DfhCA7iP.js","/assets/KPICard-CHrX3LXR.js","/assets/Kaizen-HJbpbQjq.js","/assets/KpiDeltaCard-D8uOZtob.js","/assets/LangTextInput-CHq_kuR_.js","/assets/Layout-CwUtjK4u.js","/assets/LeaderDayReport-BWZy2dxK.js","/assets/LeaderUnitReport-B0oph3Vr.js","/assets/Leaderboard-CPiijT-B.js","/assets/Leaders-DmwGrcUn.js","/assets/LiveOverview-vNWZxm-B.js","/assets/Login-CT15Ugav.js","/assets/NotFound-B6T6KslV.js","/assets/Overview-Bxv3eOVH.js","/assets/Pagination-BB-fqdqt.js","/assets/PerenaladkaFactTable-D0h9ws_I.js","/assets/PlanFulfillment-Dagbl-KB.js","/assets/Production-EKotWbx3.js","/assets/Profile-5aph-WcU.js","/assets/ProofCamera-SITQBVBY.js","/assets/Quality-BpKn1RPG.js","/assets/RichTextEditor-ChB0HUac.js","/assets/SearchInput-BtQXWLfh.js","/assets/SeasonalityHeatmap-DGXvb08M.js","/assets/SegmentedToggle-DxQQY0Pp.js","/assets/SetupTimes-Bf8iyWfo.js","/assets/ShiftDaily-CewiG8eW.js","/assets/Skeleton-Bsww_YC3.js","/assets/Staff-IXWdNWrJ.js","/assets/StatusBadge-Celeh3B8.js","/assets/StyledSelect-Cjd8WRFn.js","/assets/Tasks-BP5yj8Yx.js","/assets/TimeField-C0Ai6R2c.js","/assets/TimeWheelPicker-C9X5vv-W.js","/assets/Toast-FeHjDNip.js","/assets/Tooltip-D33F_B9A.js","/assets/TrendChart-D3mpcj87.js","/assets/TripleSpeedometer-Dm5r37gf.js","/assets/Trudoyomkost-DAVsRO1h.js","/assets/UsersActivity-Cemy0ZVS.js","/assets/WatchProgress-CGVKWeWi.js","/assets/WebLogin-kojeblTX.js","/assets/WorkerConcerns-D4d_qFzz.js","/assets/Workers-CyedL5P7.js","/assets/Zagruzka-CQOwGkdp.js","/assets/ZagruzkaCell-DNFtcoGm.js","/assets/alarm-clock-EOeXd8F6.js","/assets/api-DePYI4E8.js","/assets/archive-g9Y3ewyQ.js","/assets/archive-restore-CFW5XabP.js","/assets/arrow-down-Cmygp1cD.js","/assets/arrow-left-DooVDzYY.js","/assets/arrow-left-right-CndmaXmD.js","/assets/arrow-right-8va8TKcP.js","/assets/arrow-up-8haZXMcy.js","/assets/award-0axpWOr9.js","/assets/ban-DjBObEts.js","/assets/bot-BVVTcndD.js","/assets/boxes-QGpfeK8k.js","/assets/brigadirFilters-mxbFnmNL.js","/assets/broadcastTree-D_z4dixd.js","/assets/building-2-CRAKNgPa.js","/assets/calendar-DbMI7FzE.js","/assets/calendar-clock-BtnRMEhw.js","/assets/calendar-days-mG9UxTa-.js","/assets/calendar-range-BUXEDXKi.js","/assets/camera-DSdwYXb3.js","/assets/categories-ejVH4f89.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-p38Dzmrn.js","/assets/chart-line-Ct4A_JkL.js","/assets/chart-pie-CGtA4uQQ.js","/assets/chartPalette-CPwjb6Rj.js","/assets/chartRange-D8XKiCm4.js","/assets/check-Cv-9BwL7.js","/assets/check-check-C0dVksP4.js","/assets/chevron-left-DDoXmYBS.js","/assets/chevrons-up-down-DYRdt0A6.js","/assets/circle-dot-COg20jYU.js","/assets/circle-minus-BDOgMsYI.js","/assets/circle-slash-D8pBBsYE.js","/assets/circle-user-round-CwjGtLYi.js","/assets/compass-BsQ9KgWN.js","/assets/concernCategories-DBmkHquL.js","/assets/copy-a3lFh5Ba.js","/assets/corner-down-right-MYoo5IQg.js","/assets/createLucideIcon-BZsJVE7m.js","/assets/exportXlsx-FDOkfljo.js","/assets/external-link-CognaMZq.js","/assets/file-clock-O9aDUREU.js","/assets/file-spreadsheet-_angQn0E.js","/assets/file-text-DD-zLGkc.js","/assets/flag-CHKNsSZf.js","/assets/flame-CBiIHa1U.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-C-ToGfOO.js","/assets/funnel-DfzobfE_.js","/assets/hash-DJdfnOWC.js","/assets/history-CixhGCTC.js","/assets/hourglass-C54dmrbd.js","/assets/image-DHjfjfBo.js","/assets/image-off-DerYx0fg.js","/assets/index-BbNdoYAX.js","/assets/index-PYkJVL39.css","/assets/keyboard-Dbop-B3g.js","/assets/languages-CBPAjYgR.js","/assets/layers-BaLU2W4S.js","/assets/leaderReason-gqwfLG5h.js","/assets/lightbulb-BiUp6cww.js","/assets/link-2-CmZuRaCG.js","/assets/list-checks-C3ePw8kH.js","/assets/list-ordered-BWNCsypH.js","/assets/lock-open-W1Uk9Izu.js","/assets/log-in-DV2o_IdD.js","/assets/message-square-D2vr3iy_.js","/assets/minimize-2-BtSHCCaf.js","/assets/minus-DSzYDnFL.js","/assets/paperclip-BByoJtpf.js","/assets/pencil-Bt7FIKbE.js","/assets/pencil-line-RHpN-NCL.js","/assets/personName-B4KId4zS.js","/assets/pin-bKD4hFzK.js","/assets/play-CiFx23T1.js","/assets/prop-types-CZdCbg4C.js","/assets/radio-C8KEVhvj.js","/assets/react-apexcharts.esm-CkoMGGf6.js","/assets/refresh-cw-CEndWnbY.js","/assets/repeat-B_k77dZS.js","/assets/rotate-ccw-BeYXolzk.js","/assets/rotate-cw-DkPSjhKb.js","/assets/save-Bak0iWmm.js","/assets/scale-BlzXjH0V.js","/assets/scroll-text-BiYAQJRl.js","/assets/search-x-BTKtgmyU.js","/assets/segments-XvCdW6kW.js","/assets/send-ClgiYl0u.js","/assets/settings-2-QehQSun_.js","/assets/shield-CdZ1EQvf.js","/assets/shield-alert-BWoZfJ-6.js","/assets/shield-check-DAKfuJfC.js","/assets/shield-question-mark-tcW13Nbk.js","/assets/siren-BcTfRfNF.js","/assets/smartphone-C1pgPJ2t.js","/assets/snowflake-CfEH7DW6.js","/assets/star-Lr_u95IE.js","/assets/statusBands-D9RvjzQg.js","/assets/table-2-C6hcDifw.js","/assets/tag-DMaxFa8t.js","/assets/trash-2-OfDign56.js","/assets/trending-down-D7V5kjFH.js","/assets/trending-up-DfEuzCAi.js","/assets/undo-2-ByibLMH3.js","/assets/useChartTheme-D7hAPYOo.js","/assets/useElementWidth-BUxpkeFH.js","/assets/useIsMobile-CWTdfpsV.js","/assets/useMutation-B3-XiXOb.js","/assets/useStatusBands-I30GyYbJ.js","/assets/user-check-U5YB0gmQ.js","/assets/user-cog-gyRRL7SZ.js","/assets/user-minus-Lao4muX9.js","/assets/users-3Z-S1-g7.js","/assets/verifyState-BtWXjiDQ.js","/assets/video-D2vRF5Ex.js","/assets/warehouse-CUopss03.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
