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

const BUILD = "2026-10-19T06:05:24.653Z";
const PRECACHE = ["/","/assets/AdminPanel-i4cLTRYE.js","/assets/AnalysisBoard-CWhqMH0s.js","/assets/Arc-Cu-fy09b.js","/assets/Assistant-CAhs7UYB.js","/assets/BrigadirProfile-MOo4LaPZ.js","/assets/BroadcastReceivers-C7E6vJ3V.js","/assets/BroadcastRecord-CjCWNObT.js","/assets/Button-BGku9Yov.js","/assets/CatLockNotice-C6nOF8oQ.js","/assets/CategoryLegendModal-D7vH6_ev.js","/assets/CellConcerns-DOcfmdLo.js","/assets/CellDetails-BXfh3H1X.js","/assets/CellFormModal-vu3JiMNI.js","/assets/CellIdent-YHjTXzrO.js","/assets/CellLink-DkIQbAPV.js","/assets/Cells-Dg_UoBGB.js","/assets/ColumnFilter-DKPok8Ps.js","/assets/ColumnsPicker-DoHd7fJV.js","/assets/CommentsModal-DwIIWllz.js","/assets/ComparisonTable-CsBxh2Y-.js","/assets/Concerns-C6xKIOxM.js","/assets/CountStepper-BuJ087ZX.js","/assets/Daily-CLe-FBlu.js","/assets/DataTable-DOx3YmwL.js","/assets/DateRangePicker-CsiVHJN5.js","/assets/DayReportView-DQAjEnbI.js","/assets/DayStepper-CPjZaLz5.js","/assets/DifferenceBreakdown-C5pXeIYD.js","/assets/Downtime-Bw1JLq-z.js","/assets/Education-ISng8bdI.js","/assets/EducationLesson-tb8mELrf.js","/assets/EmptyState-CSLVJj4v.js","/assets/Exam-CjV5Wokv.js","/assets/FactorySelect-BlqXb0f3.js","/assets/ForeignObjects-AhBueaRY.js","/assets/Gamification-BoAph6zp.js","/assets/GroupBadge-CNtvoXDc.js","/assets/HeatmapChart-Dofsi6yH.js","/assets/IdleCell-TozjThjy.js","/assets/KPICard-BxNJyk-_.js","/assets/Kaizen-DmrjwcWK.js","/assets/Kelish-CPNBkfF7.js","/assets/KpiDeltaCard-CTrJwIpp.js","/assets/LangTextInput-Clk9-j-L.js","/assets/Layout-C-c0TiNx.js","/assets/LeaderAppeal-BCy8T-nP.js","/assets/LeaderDayReport-DEcU3BhM.js","/assets/LeaderUnitReport-GSQ9ZiTn.js","/assets/Leaderboard-C1jkGrZu.js","/assets/Leaders-C9d0IsP8.js","/assets/Lightbox-Bvbqm6FV.js","/assets/LiveOverview-Ad3s4-Is.js","/assets/Login-CfVYg22I.js","/assets/NotFound-nqFBJKzT.js","/assets/Notifications-5lQmUyD6.js","/assets/Overview-Cvy98dFX.js","/assets/Pagination-go05dFqv.js","/assets/PerenaladkaFactTable-CMdwmDEb.js","/assets/PersonCard-PNOoigIk.js","/assets/PlanFulfillment-Bl2DCC-z.js","/assets/Production-D8ZgUoBd.js","/assets/Profile-CoTVYryQ.js","/assets/ProofCamera-CmRnyqbp.js","/assets/ProofPhoto-BnnAm36u.js","/assets/Quality-BpaDWV4x.js","/assets/RawRows-BVqUaGZb.js","/assets/RequestStateChip-s5gUa24s.js","/assets/RichTextEditor-Bq8wMfJ8.js","/assets/SaveState-2VUXQlRf.js","/assets/SearchInput-Df-x8TTE.js","/assets/SeasonalityHeatmap-BH6we2sI.js","/assets/SegmentedToggle-DbvixoaK.js","/assets/SetupTimes-ybUt961D.js","/assets/ShiftDaily-DFTaMbfg.js","/assets/Staff-C0YAq-lw.js","/assets/StaffListAtCheck-k5kqWfCl.js","/assets/StatusBadge-DV0bRcj5.js","/assets/TargetGoal-BIchKjJX.js","/assets/Targets-DqBtPUH9.js","/assets/Tasks-Dms7NWBe.js","/assets/TimeWheelPicker-BmjiIPso.js","/assets/Toast-Cbfz44Qa.js","/assets/Tooltip-NEGKt_Zq.js","/assets/TrendChart-CpfXVMcc.js","/assets/TripleSpeedometer-C6GV-XUq.js","/assets/Trudoyomkost-CzN_zqMY.js","/assets/Turnover-DtEAzlby.js","/assets/TurnoverBits-DW3Acgwo.js","/assets/UploadDropzone-OqhpomRU.js","/assets/UsersActivity-BdUmPV1U.js","/assets/VerdictBlock-BmnapVuJ.js","/assets/VfxApiMap-Cs_MbXfe.js","/assets/VfxDictionaries-T4X8MPbd.js","/assets/VfxEmployees-D4V8aCkm.js","/assets/VfxHrMoves-kNrbwqjt.js","/assets/VfxJobs-CNTRkUWM.js","/assets/VfxPhoto-UAkbV1qp.js","/assets/VfxShifts-DiuYYBq2.js","/assets/VfxState-C_5zZiKF.js","/assets/VfxTimebooks-B69Dky8E.js","/assets/VfxTimesheet-CvarZH-V.js","/assets/WatchProgress-CMU0ZiK1.js","/assets/WebLogin-EmRQaRlK.js","/assets/WorkerConcerns-TopSONLU.js","/assets/Workers-C_oqgfBn.js","/assets/Zagruzka-6YNT1Nsg.js","/assets/ZagruzkaCell-DQMZBbSv.js","/assets/api-CHdDSiXp.js","/assets/archive-LDPjEvnt.js","/assets/archive-restore-DtB_ApLC.js","/assets/arrow-down-jO5X4-Ni.js","/assets/arrow-down-wide-narrow-DFD2Ii9d.js","/assets/arrow-up-narrow-wide-xaXX2ZED.js","/assets/award-BQdTGZYj.js","/assets/ban-DKHOwfSU.js","/assets/boxes-BQvD8nYS.js","/assets/braces-Do7lEpjp.js","/assets/brigadirFilters-DOr6NqSQ.js","/assets/broadcastTree-hzX6IPii.js","/assets/building-2-q7vLnZmi.js","/assets/calculator-BUDjNvSc.js","/assets/calendar-BPyg6MDB.js","/assets/calendar-days-CSGAvRsT.js","/assets/camera-C6sHULJd.js","/assets/categories-D8KIfpHK.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-jxLPR7oz.js","/assets/chart-line-DWHi5W0F.js","/assets/chart-pie-C4nsGg7G.js","/assets/chartRange-CNzn337v.js","/assets/check-check-C2J4Bify.js","/assets/chevron-left-I4fkg0m7.js","/assets/chevrons-up-down-0kT9979f.js","/assets/circle-C9SwvKkJ.js","/assets/circle-alert-CdH1owgS.js","/assets/circle-check-big-C21wKjry.js","/assets/circle-dashed-BOZ0d_HU.js","/assets/circle-minus-DIELZmsZ.js","/assets/circle-question-mark-DQKUhy9B.js","/assets/circle-slash-xt0-keMr.js","/assets/circle-user-round-LoVntszp.js","/assets/cloud-off-CifHpsPv.js","/assets/cloud-upload-D6MnIffj.js","/assets/compass-kBQXoqVt.js","/assets/concernCategories-FTW2XJSc.js","/assets/corner-down-right-Cydc8fBM.js","/assets/createLucideIcon-BMJPC9ho.js","/assets/es-vv5PDNmw.js","/assets/external-link-BUDKR8gP.js","/assets/file-clock-Cjku-JsY.js","/assets/file-exclamation-point-DXvmFUdY.js","/assets/flag-DraOIkMq.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Z-MfxPyd.js","/assets/hash-CAB2qvzr.js","/assets/hourglass-DQQkn4Aw.js","/assets/image-84P7X2Us.js","/assets/image-off-DsW31gqi.js","/assets/inbox-Dtwb2cys.js","/assets/index-ByhNoNK_.css","/assets/index-mOH1ERDf.js","/assets/keyboard-Yo2aeZkU.js","/assets/languages-D0kk1h-6.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-zHawdVJo.js","/assets/lightbulb-Ecbxxtt_.js","/assets/link-2-ChlUtaSK.js","/assets/link-2-off-B16vx7eT.js","/assets/list-ordered-FpeQR-6o.js","/assets/list-tree-CE5omvu0.js","/assets/lock-open-CcgpbS77.js","/assets/log-in-BuZUwwLi.js","/assets/marks-gXjJDoV5.js","/assets/minimize-2-CKSIx2C2.js","/assets/package-check-5e44PD2y.js","/assets/pencil-1U5WiVwX.js","/assets/percent-BfP4rr2k.js","/assets/pin-Bw3mURTk.js","/assets/pin-off-JJ_YesIP.js","/assets/play-owUOnukw.js","/assets/plug-zap-DTE3-tRw.js","/assets/prop-types-Df5vPUzI.js","/assets/radio-BWt9DaqY.js","/assets/react-apexcharts.esm-DyoAXr-m.js","/assets/registers-BiKV6Q0j.js","/assets/repeat-DzhWqhYu.js","/assets/save-wODboz2I.js","/assets/scopeLinks-DwT3dhdO.js","/assets/scroll-text-DL1_zdeW.js","/assets/search-x-CCqlTmkP.js","/assets/segments-BkVsnEKy.js","/assets/send-Bye5BdTs.js","/assets/settings-2-DYtNDU0I.js","/assets/shield-CeVE_lEH.js","/assets/shield-alert-CUi-F3GU.js","/assets/shield-question-mark-CcGyWkUc.js","/assets/siren-CK1CN1cl.js","/assets/snowflake-D43po18w.js","/assets/split-BoG-ZI3B.js","/assets/square-check-big-CL2FkUam.js","/assets/star-DaKKeJC4.js","/assets/statusBands-DECqRkLi.js","/assets/store-6EPhzqNu.js","/assets/table-2-L4M_t8md.js","/assets/table-properties-CkxJed0q.js","/assets/tag-BQ8BAtgz.js","/assets/timer-off-mK-_r25t.js","/assets/trending-down-bKgTd-Iq.js","/assets/trending-up-CHmaIZHl.js","/assets/undo-2-C7eRcsnF.js","/assets/useChartTheme-Ctgpn4Lm.js","/assets/useElementWidth-BfXfJy2X.js","/assets/useIsMobile-Bo5Un0oY.js","/assets/useOpenParam-YqS9aCCc.js","/assets/useStatusBands-DnMT6hmz.js","/assets/useUrlScope-Cp9qf4ZN.js","/assets/user-CmWyiYCI.js","/assets/user-cog-CNJkjJPh.js","/assets/users-iqr40Nn4.js","/assets/vfx-XLMPZmtY.js","/assets/video-Dmp3GHoR.js","/assets/wallet-DepH8Nab.js","/assets/warehouse--FZO4x-q.js","/assets/workflow-D1LW6V7k.js","/assets/x-Dg2FpXuE.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
