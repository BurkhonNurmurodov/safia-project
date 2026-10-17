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

const BUILD = "2026-10-17T12:43:10.133Z";
const PRECACHE = ["/","/assets/AdminPanel-Ej86s370.js","/assets/AnalysisBoard-CFBmH825.js","/assets/Arc-DEllHw85.js","/assets/Assistant-CjunsrqD.js","/assets/BrigadirProfile-72cqDate.js","/assets/BroadcastReceivers-CT3g-ZbH.js","/assets/BroadcastRecord-9XePlaLQ.js","/assets/Button-D8tJjHF1.js","/assets/CatLockNotice-D_IxzVvP.js","/assets/CategoryLegendModal-Bk32HU32.js","/assets/CellConcerns-YlRLjmav.js","/assets/CellDetails-DZ6-hCIj.js","/assets/CellFormModal-BIJXqcrz.js","/assets/CellIdent-D-AZHIBB.js","/assets/CellLink-QEImeJ12.js","/assets/Cells-D0vYyavd.js","/assets/ColumnFilter-CGoIhm7B.js","/assets/ColumnsPicker-DgLAhgya.js","/assets/CommentsModal-s_ki3WVb.js","/assets/ComparisonTable-kc9xpR6P.js","/assets/Concerns-CY5tUOJL.js","/assets/CountStepper-DBHtauhs.js","/assets/Daily-_yuzKPEy.js","/assets/DataTable-CbDJ3-fy.js","/assets/DateRangePicker-DOg6yWCt.js","/assets/DayReportView-CF-t48UG.js","/assets/DayStepper-DEXLs-Zs.js","/assets/DifferenceBreakdown-BR9qa5-X.js","/assets/Downtime-J5edd-tZ.js","/assets/Education-B3RteoqZ.js","/assets/EducationLesson-DWoYF54l.js","/assets/EmptyState-YW5rmHeK.js","/assets/Exam-DMu709CW.js","/assets/FactorySelect-Bo9-KEkX.js","/assets/ForeignObjects-D2dt4tVB.js","/assets/Gamification-BpaAGy-z.js","/assets/GroupBadge-DW0Pwitv.js","/assets/HeatmapChart-BXkRsXjM.js","/assets/IdleCell-C8GqWGTq.js","/assets/KPICard-XK0-5cgX.js","/assets/Kaizen-DR2pobMT.js","/assets/Kelish-LMExRDqD.js","/assets/KpiDeltaCard-ECIfifOO.js","/assets/LangTextInput-B9pn20b-.js","/assets/Layout-B9dB8brF.js","/assets/LeaderAppeal-DDWGRrgz.js","/assets/LeaderDayReport-BxhMMKW3.js","/assets/LeaderUnitReport-DsqYT-SJ.js","/assets/Leaderboard-D80f_jmO.js","/assets/Leaders-B908eQjd.js","/assets/Lightbox-DDB_Go11.js","/assets/LiveOverview-Bj0tCt3k.js","/assets/Login-DAHlzDbI.js","/assets/NotFound-DLeULyKR.js","/assets/Notifications-DwmErjop.js","/assets/Overview-CDpvfx-P.js","/assets/Pagination-CLHS5uEw.js","/assets/PerenaladkaFactTable-BSR3vwYn.js","/assets/PersonCard-7fxVPqmh.js","/assets/PlanFulfillment-D1ZKJ1OH.js","/assets/Production-Dk1ASqwm.js","/assets/Profile-DM1k2Pf0.js","/assets/ProofCamera-DZOQQBn-.js","/assets/Quality-La5ebJuP.js","/assets/RawRows-Cya4DA_r.js","/assets/RequestStateChip-BkZ5H2IP.js","/assets/RichTextEditor-D2zmeC9V.js","/assets/SaveState-BnKl7MyD.js","/assets/SearchInput-BmEvdRGe.js","/assets/SeasonalityHeatmap-cWn8UTK6.js","/assets/SegmentedToggle-ALklgxr5.js","/assets/SetupTimes-fzMi6GHM.js","/assets/ShiftDaily-Db0_jgpI.js","/assets/Staff-BQ7zdtS0.js","/assets/StaffListAtCheck-Bg83vlSa.js","/assets/StatusBadge-DgZ2EfK5.js","/assets/TargetGoal-Donza9S6.js","/assets/Targets-Dlx3Axt8.js","/assets/Tasks-7MTLWplp.js","/assets/TimeWheelPicker-BRiGRRTt.js","/assets/Toast-Bk9VGh5F.js","/assets/Tooltip-DHq16Fzp.js","/assets/TrendChart-B1HqECpP.js","/assets/TripleSpeedometer-BuYdJNaa.js","/assets/Trudoyomkost-B9pp7Nm3.js","/assets/Turnover-DwpDNDJJ.js","/assets/TurnoverBits-CvPZur6a.js","/assets/UploadDropzone-D2STObjU.js","/assets/UsersActivity-BKdIBaxk.js","/assets/VerdictBlock-_MzIJI3G.js","/assets/VfxApiMap-BcUwpcpz.js","/assets/VfxDictionaries-qMslQWip.js","/assets/VfxEmployees-BUTxm3zT.js","/assets/VfxHrMoves-BIB3J-Wd.js","/assets/VfxJobs-B0BtgpUh.js","/assets/VfxPhoto-C5gd-Q-2.js","/assets/VfxShifts-Dqc568Mi.js","/assets/VfxState-BXkmRCbr.js","/assets/VfxTimebooks-CoR9LEYj.js","/assets/VfxTimesheet-7svsiaRy.js","/assets/WatchProgress-BQrWE73v.js","/assets/WebLogin-Cx0YwEHR.js","/assets/WorkerConcerns-DcQ72YZW.js","/assets/Workers-C1X33Nu4.js","/assets/Zagruzka-sHVNZtGs.js","/assets/ZagruzkaCell-80mFvr5k.js","/assets/api-TnNpP9ye.js","/assets/archive-DtTdUXaZ.js","/assets/archive-restore-TVOjw4F5.js","/assets/arrow-down-DcdIKVGq.js","/assets/arrow-down-wide-narrow-jdKGOORO.js","/assets/arrow-up-narrow-wide-D3SCya_g.js","/assets/award-BpqJGLJI.js","/assets/ban-CmqDGXu9.js","/assets/boxes-yWtumHp_.js","/assets/braces-CQydl2EF.js","/assets/brigadirFilters-CJctqUDi.js","/assets/broadcastTree-THS4S-4g.js","/assets/building-2-BjKHOyRd.js","/assets/calculator-BMET96eQ.js","/assets/calendar-DXD6xxyS.js","/assets/calendar-days-CUwy3VSx.js","/assets/camera-CullaOw-.js","/assets/categories-CQXmA8AC.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BP-yRRUN.js","/assets/chart-line-DQbU9eC8.js","/assets/chart-pie-D53EuzNW.js","/assets/chartRange-AzxpYlrE.js","/assets/check-check-D2wOpGgt.js","/assets/chevron-left-BlAIktWu.js","/assets/chevrons-up-down-YDHmWLx9.js","/assets/circle-8TDconHE.js","/assets/circle-alert-DqnrPG56.js","/assets/circle-check-big-B9FHx3FB.js","/assets/circle-dashed-BzZ0dIde.js","/assets/circle-minus-LVmE2TAj.js","/assets/circle-question-mark-DhOiU2a6.js","/assets/circle-slash-CPxIfMVI.js","/assets/circle-user-round-Dz5wZcxu.js","/assets/cloud-off-BcNtoD0D.js","/assets/cloud-upload-Chye_U9v.js","/assets/compass-Cr4xe-tG.js","/assets/concernCategories-1OTWq4ib.js","/assets/corner-down-right-BG4cQ_fs.js","/assets/createLucideIcon-CCNnWfd5.js","/assets/es-50s15Xpt.js","/assets/external-link-BXRXOV5y.js","/assets/file-clock-CNq-OG83.js","/assets/file-exclamation-point-B5BMpGmI.js","/assets/flag-DPXAhVDV.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Cycw2oTL.js","/assets/hash-L1vBpnyZ.js","/assets/hourglass-JrtYIt0f.js","/assets/image-CiHnBfzz.js","/assets/image-off-DPxktNa4.js","/assets/inbox-nd3I7KQG.js","/assets/index-ByhNoNK_.css","/assets/index-dg4LAn_4.js","/assets/keyboard-CMpoc9Yt.js","/assets/languages-DVfb3bb-.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-ypn_BMW6.js","/assets/lightbulb-CEY-UiOU.js","/assets/link-2-C-8tJemW.js","/assets/link-2-off-D7549AXn.js","/assets/list-ordered-DUvz6SmE.js","/assets/list-tree-VQD5AHZ0.js","/assets/lock-open-ef5caN7H.js","/assets/log-in-IBPZgiw9.js","/assets/marks-D6gXH95w.js","/assets/minimize-2-BKMJ0ifY.js","/assets/package-check-DCv0HK4K.js","/assets/pencil-CETm3oYe.js","/assets/percent-CyBD4fNi.js","/assets/pin-C0iQyKp8.js","/assets/pin-off-CnIV_yRu.js","/assets/play-Ck_k7ywn.js","/assets/plug-zap-3hY2BNTh.js","/assets/prop-types-CKaSIv46.js","/assets/radio-BrLoVRFK.js","/assets/react-apexcharts.esm-COyJEXNM.js","/assets/registers-B8SqLQYp.js","/assets/repeat-uYUazrhM.js","/assets/save-DCkp7wwC.js","/assets/scopeLinks-LBrr_0-z.js","/assets/scroll-text-B0YotHYp.js","/assets/search-x-CQj5W4pf.js","/assets/segments-DHOUdN8j.js","/assets/send-BshvRtYZ.js","/assets/settings-2-C8AiuFbC.js","/assets/shield-D8MHVoCB.js","/assets/shield-alert-CECASEqA.js","/assets/shield-question-mark-DNF8xaBF.js","/assets/siren-BnNl8dDo.js","/assets/snowflake-Ccryb__h.js","/assets/split-C9PlkDc8.js","/assets/square-check-big-DxRIgvZq.js","/assets/star-BIs2CC9S.js","/assets/statusBands-BVSfThkO.js","/assets/store-dnSZ2_6S.js","/assets/table-2-C_aFYma6.js","/assets/table-properties-C9Yc6M8h.js","/assets/tag-CxOxzWVk.js","/assets/timer-off-CTgsSC5-.js","/assets/trending-down-DMJ69cJ5.js","/assets/trending-up-Bjg7j-EE.js","/assets/undo-2-GSRePFnm.js","/assets/useChartTheme-BoFVAxna.js","/assets/useElementWidth-DbZHjzAw.js","/assets/useIsMobile-CL8CHERo.js","/assets/useOpenParam-DoQpf-nq.js","/assets/useStatusBands-C8193eHX.js","/assets/useUrlScope-2E7BFsyH.js","/assets/user-CMm-BxGE.js","/assets/user-cog-BVfVEgHj.js","/assets/users-pJF4dCD7.js","/assets/vfx-D9Xxnxhi.js","/assets/video-Dwkc8smg.js","/assets/wallet-HjBns4JK.js","/assets/warehouse-BFCyL2P2.js","/assets/workflow-DDN0EOYw.js","/assets/x-BHQl-YrX.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
