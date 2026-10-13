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

const BUILD = "2026-10-13T09:17:42.422Z";
const PRECACHE = ["/","/assets/AdminPanel-Bi3_mqxo.js","/assets/AnalysisBoard-Dxi2h64P.js","/assets/Arc--v0q5oxS.js","/assets/Assistant-DEum_asw.js","/assets/BrigadirProfile-CZEPQVgF.js","/assets/BroadcastReceivers-I1rGWbNn.js","/assets/BroadcastRecord-D1bC-UXI.js","/assets/Button-BdGRcKmf.js","/assets/CatLockNotice-CEwvjvUT.js","/assets/CategoryLegendModal-i0VjT9qT.js","/assets/CellConcerns-qv9doi_x.js","/assets/CellDetails-Din-orVz.js","/assets/CellFormModal-C9jhYSvC.js","/assets/CellIdent-CHBWtERA.js","/assets/CellLink-BpxNKv0M.js","/assets/Cells-BGIGdswy.js","/assets/ColumnFilter-Ta2VaeuX.js","/assets/ColumnsPicker-i76_Mx2J.js","/assets/CommentsModal-BpIxkAad.js","/assets/ComparisonTable-Df1m8NmP.js","/assets/Concerns-Ba0nTdN1.js","/assets/CountStepper-MiZg60i2.js","/assets/Daily-CuKzK5LH.js","/assets/DataTable-Bihe-nBE.js","/assets/DateRangePicker-aEMO6YhN.js","/assets/DayReportView-DEkfHMpN.js","/assets/DayStepper-DU0rpVFm.js","/assets/DifferenceBreakdown-vIIGeYMM.js","/assets/Downtime-BSZ-G6kI.js","/assets/Education-DOj0lvcF.js","/assets/EducationLesson-DCwXtWav.js","/assets/EmptyState-0DJUSqfA.js","/assets/Exam-DRJAupsv.js","/assets/FactorySelect-CWFoN5pr.js","/assets/Gamification-D4aB2fMh.js","/assets/GroupBadge-CCYl2EMs.js","/assets/HeatmapChart-Ci1HVvu-.js","/assets/IdleCell-DS_77sGu.js","/assets/KPICard-DiVi5-qK.js","/assets/Kaizen-Cyfhrb-3.js","/assets/Kelish-14ZgCKQE.js","/assets/KpiDeltaCard-B0ZXsEFB.js","/assets/LangTextInput-Dh9Eet4v.js","/assets/Layout-DBgl8PY6.js","/assets/LeaderAppeal-DtNM7k48.js","/assets/LeaderDayReport-C0pPcYMd.js","/assets/LeaderUnitReport-FpwzT1aP.js","/assets/Leaderboard-4bmFcIL5.js","/assets/Leaders-Bl5feiXs.js","/assets/Lightbox-Ddk58kuk.js","/assets/LiveOverview-CMnfwph2.js","/assets/Login-CiQ_57OY.js","/assets/NotFound-C5jaxhj9.js","/assets/Notifications-DniyGMPa.js","/assets/Overview-CJr5q4QH.js","/assets/Pagination-bHmAKhiu.js","/assets/PerenaladkaFactTable-Dn9PPebN.js","/assets/PersonCard-C38Ufnaw.js","/assets/PlanFulfillment-D_ANdVcq.js","/assets/Production-BbwKUzGM.js","/assets/Profile-BC8AskP1.js","/assets/ProofCamera-BjPtzFZ2.js","/assets/Quality-BvTq-TEf.js","/assets/RawRows-C-nLVDMd.js","/assets/RequestStateChip-DCx1luYx.js","/assets/RichTextEditor-BA5tAXTX.js","/assets/SaveState-IFPq-epz.js","/assets/SearchInput-BILnBhKw.js","/assets/SeasonalityHeatmap-C49ThRHt.js","/assets/SegmentedToggle-myoq7uWp.js","/assets/SetupTimes-BArWxSUB.js","/assets/ShiftDaily-C8aC5DX3.js","/assets/Staff-7aJ1k1z3.js","/assets/StaffListAtCheck-m2p1FvkK.js","/assets/StatusBadge-DrQUKfaL.js","/assets/TargetGoal-BGFSNjGb.js","/assets/Targets-iK2fZ_Ib.js","/assets/Tasks-CmnM0EDJ.js","/assets/TimeWheelPicker-KZBmbz_F.js","/assets/Toast-FkTWy3fA.js","/assets/Tooltip-i5mbU2py.js","/assets/TrendChart-CA6J0y8P.js","/assets/TripleSpeedometer-DGzkeb5k.js","/assets/Trudoyomkost-Bq5bAiyx.js","/assets/Turnover-CqvoGVNO.js","/assets/UploadDropzone-CVwvpUUK.js","/assets/UsersActivity-BdW42Ytb.js","/assets/VerdictBlock-DkPx_zaq.js","/assets/VfxApiMap-NaNKKTC-.js","/assets/VfxDictionaries-B8fIDkNf.js","/assets/VfxEmployees-BStebT7Q.js","/assets/VfxHrMoves-CnWZ4wYM.js","/assets/VfxJobs-BwVd9OQZ.js","/assets/VfxPhoto-owxHXbLE.js","/assets/VfxShifts-C0yvTL6U.js","/assets/VfxState-D0WS7kU9.js","/assets/VfxTimebooks-DMY1zs-a.js","/assets/VfxTimesheet-IBvUkoq7.js","/assets/WatchProgress-Dy-z87mA.js","/assets/WebLogin-R1MtQl8p.js","/assets/WorkerConcerns-D7wdhDhj.js","/assets/Workers-DIXwKr34.js","/assets/Zagruzka-Cn_5t0Ge.js","/assets/ZagruzkaCell-B9CxNsgi.js","/assets/api-BUpgZhaY.js","/assets/archive-Cgr1KpA6.js","/assets/archive-restore-CDgpybAq.js","/assets/arrow-down-CFwWH2YI.js","/assets/arrow-down-wide-narrow-B-aOA6I-.js","/assets/arrow-up-narrow-wide-DoGFPy5e.js","/assets/award-DU8sNERS.js","/assets/ban-DpsKtkNG.js","/assets/boxes-0MzMIJmk.js","/assets/braces-_6pkHcTY.js","/assets/brigadirFilters-Dau6OzcU.js","/assets/broadcastTree-ByOH3BG_.js","/assets/building-2-C_XO9VQe.js","/assets/calculator-Uig3-LGf.js","/assets/calendar-D_k9KGmA.js","/assets/calendar-days-D6xPUgm3.js","/assets/camera-CtBZYplZ.js","/assets/categories-Cy0H7LSh.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-x4Xmahbx.js","/assets/chart-line-DRnaEG9l.js","/assets/chart-pie-0urDfX0E.js","/assets/chartRange-qOjoPmFs.js","/assets/check-check-BYdn8Qjt.js","/assets/chevron-left-f25B1MD_.js","/assets/chevrons-up-down-CROSa2ek.js","/assets/circle-RhLziUaP.js","/assets/circle-alert-DeQT3BRY.js","/assets/circle-check-big-CloRchRX.js","/assets/circle-dashed-0YuEyK_e.js","/assets/circle-minus-gqzTnsiB.js","/assets/circle-question-mark-Dk4CPxTB.js","/assets/circle-slash-D_XZQ4wS.js","/assets/circle-user-round-BWo23rss.js","/assets/clock-3-B1tn1bVv.js","/assets/cloud-off-DolyNYDX.js","/assets/cloud-upload-DsVVgUep.js","/assets/compass-DzDvTizA.js","/assets/concernCategories-BzG-lNwr.js","/assets/copy-Bzwhamz1.js","/assets/corner-down-right-BA0oF-bN.js","/assets/createLucideIcon-o8GCGKmS.js","/assets/es-BzeDrDIM.js","/assets/external-link-DBGW02qc.js","/assets/file-clock-DubNus4G.js","/assets/file-exclamation-point-BKFYlCBo.js","/assets/flag-B3VfD4mW.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Bp9m84MU.js","/assets/hash-BIm8CGqi.js","/assets/hourglass-BECzvtEA.js","/assets/image-DZR13FOd.js","/assets/image-off-Ce2jjUQ8.js","/assets/inbox-CrfkGG7R.js","/assets/index-7f1rnqtY.css","/assets/index-CITd6GrU.js","/assets/keyboard-DBuhPn40.js","/assets/languages-BZKbAYhC.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BZ4v0HtL.js","/assets/lightbulb-DdZQZs59.js","/assets/link-2-CgAycVhI.js","/assets/link-2-off-C-iQ1d7f.js","/assets/list-ordered-Df_Ltg-r.js","/assets/list-tree-DUg83cJi.js","/assets/lock-open-1J8iNQNC.js","/assets/log-in-1B1yPNz6.js","/assets/marks-CBu3MFN9.js","/assets/minimize-2-CD6Edbr9.js","/assets/package-check-DXmiFi7g.js","/assets/pencil-CtiQTs-m.js","/assets/percent-D2PWVeyi.js","/assets/pin-Dn0-0h3X.js","/assets/pin-off-Bo0yF4XK.js","/assets/play-B9kJI01M.js","/assets/plug-zap-Dsa_I3DX.js","/assets/prop-types-DkWteUj9.js","/assets/radio-CiNmvOlh.js","/assets/react-apexcharts.esm-TPYdSNum.js","/assets/registers-BzvtmI_X.js","/assets/repeat-B2zn2A3I.js","/assets/save-DVagL3lE.js","/assets/scopeLinks-BBWmwKUo.js","/assets/scroll-text-B40XQ12n.js","/assets/search-x-CfSnCV7Z.js","/assets/segments-OP9uBZc7.js","/assets/send-C2U_kjnI.js","/assets/settings-2-DuKPRHbb.js","/assets/shield-alert-DIG8rZ51.js","/assets/shield-d7CYzlyW.js","/assets/shield-question-mark-bbBoVJT4.js","/assets/siren-0Cg_96HV.js","/assets/snowflake-Cr_wT33q.js","/assets/split-BDaS2njC.js","/assets/square-check-big-CTqUTAfo.js","/assets/star-zZhzu22A.js","/assets/statusBands-bGV1kzth.js","/assets/store-CrmBaBcv.js","/assets/table-2-Po9ewZX7.js","/assets/table-properties-DHG6x_dc.js","/assets/tag-4Ckp-Eue.js","/assets/timer-off-kBhy6aRu.js","/assets/trending-down-D8mSTbG7.js","/assets/trending-up-CK0R6Qrm.js","/assets/undo-2-_5O7J-cb.js","/assets/useChartTheme-Cx-WuFxL.js","/assets/useElementWidth-BObLyWVo.js","/assets/useIsMobile-DGJP6VCR.js","/assets/useOpenParam-BzZcmzik.js","/assets/useStatusBands-CqXBMr0p.js","/assets/useUrlScope-pUbu17Zn.js","/assets/user-cog-BH96kxdC.js","/assets/user-hesDEqog.js","/assets/users-xjDXXjSA.js","/assets/vfx-DYVQWThl.js","/assets/video-l6r4G0QH.js","/assets/wallet-C-cAcHWJ.js","/assets/warehouse-DeWlw43n.js","/assets/workflow-DkazmbfI.js","/assets/x-CWQvDMRn.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png"];
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
