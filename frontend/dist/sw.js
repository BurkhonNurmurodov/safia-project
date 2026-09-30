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

const BUILD = "2026-09-30T04:28:22.312Z";
const PRECACHE = ["/","/assets/AdminPanel-DWv4gbqT.js","/assets/AnalysisBoard-N_3kb0iu.js","/assets/Arc-CRcGm2bs.js","/assets/ArcLegacy-BCHLMye4.js","/assets/AttendanceModal-C5MOE-vP.js","/assets/BrigadirProfile-D1TAODYW.js","/assets/BroadcastReceivers-hlIkqZIh.js","/assets/BroadcastRecord-GCmwFkQR.js","/assets/CatLockNotice-DnEfRwN8.js","/assets/CategoryLegendModal-QCrwzchy.js","/assets/CellConcerns-De--O9Ib.js","/assets/CellDetails-QCDSZqR9.js","/assets/CellFormModal-BB_tkpht.js","/assets/CellLink-pV_moqoH.js","/assets/Cells-GWU4N63s.js","/assets/ColumnFilter-7BOYQ4E1.js","/assets/ColumnsPicker-BnYehbwd.js","/assets/CommentsModal-Ba6x34kV.js","/assets/ComparisonTable-CUbo-nPd.js","/assets/Concerns-lFQxkXVR.js","/assets/ConfirmDialog-DyxG-1u8.js","/assets/Daily-6E7-pZ6T.js","/assets/DataTable-BMluGZ8Y.js","/assets/DateRangePicker-BEQTiptd.js","/assets/DayReportView-D7kdEILk.js","/assets/DayStepper-zabestqL.js","/assets/DifferenceBreakdown-BESquAhP.js","/assets/Downtime-Bpphos89.js","/assets/Education-C6htOW4e.js","/assets/EducationLesson-B5oCgERd.js","/assets/EmptyState-YRkrJH9U.js","/assets/Exam-BEtiSgxF.js","/assets/FactorySelect-9be-eIUe.js","/assets/Gamification-DhOOD_2B.js","/assets/GroupBadge-DAdGjseb.js","/assets/HeatmapChart-MIYH8fem.js","/assets/IdleCell-CynJ03oC.js","/assets/KPICard-k-AckBJZ.js","/assets/Kaizen-BZZm5V3J.js","/assets/Kelish-DGUap34e.js","/assets/KpiDeltaCard-D9BDh2d3.js","/assets/LangTextInput-CtormkQO.js","/assets/Layout-CU_ps_aj.js","/assets/LeaderAppeal-hcNe5qqb.js","/assets/LeaderDayReport-D2Q64efR.js","/assets/LeaderUnitReport-Crie96gm.js","/assets/Leaderboard-DtBN5sUS.js","/assets/Leaders-IczxtZ8w.js","/assets/Lightbox-64-bQWzD.js","/assets/LiveOverview-B7HhLHzZ.js","/assets/Login-C82sSVQb.js","/assets/NotFound-D5s_ZoGI.js","/assets/Overview-C1j5aNVM.js","/assets/Pagination-Cij2Nw4Z.js","/assets/PerenaladkaFactTable-lxUA-vPl.js","/assets/PlanFulfillment-5cporxnG.js","/assets/Production-CHKrjf6L.js","/assets/Profile-Db9AkEN6.js","/assets/ProofCamera-C-zqtn2D.js","/assets/ProofPhoto-l21GD09k.js","/assets/Quality-B2h9CK3T.js","/assets/RequestStateChip-cWD8YVEq.js","/assets/RichTextEditor-Dl6OrVu7.js","/assets/SaveState-YE3EOrlW.js","/assets/SearchInput-rgdzgIwb.js","/assets/SeasonalityHeatmap-BAqcXiH3.js","/assets/SegmentedToggle-BtsjgtfU.js","/assets/SetupTimes-Cc7JZwy4.js","/assets/ShiftDaily-BT17MviJ.js","/assets/Staff-CptF3XmD.js","/assets/StatusBadge-Cd9p0jU5.js","/assets/TargetGoal-AZTlZYJj.js","/assets/Targets-DsBkFz-g.js","/assets/Tasks-BURc-jag.js","/assets/TimeWheelPicker-BToiRinl.js","/assets/Tooltip-CPO-Ehdh.js","/assets/TrendChart-_MyyN_uA.js","/assets/TripleSpeedometer-BUw323wL.js","/assets/Trudoyomkost-TorzmqDr.js","/assets/UploadDropzone-Ifmth7xK.js","/assets/UsersActivity-BFgRTJRo.js","/assets/VerdictBlock-3I2yISsU.js","/assets/WatchProgress-Dd4ayVdd.js","/assets/WebLogin-D3OfpVaG.js","/assets/WorkerConcerns-CFXKFnTf.js","/assets/Workers-DIPA6l6R.js","/assets/Zagruzka-DDaa_esI.js","/assets/ZagruzkaCell-B6byEN_H.js","/assets/api-B6JIK4d3.js","/assets/archive-Q5AqXqZm.js","/assets/archive-restore-Cani_azN.js","/assets/arrow-down-CBXEpToQ.js","/assets/arrow-left-Cztzanqg.js","/assets/arrow-left-right-ClKxsUrF.js","/assets/arrow-up-icCGDYC1.js","/assets/arrow-up-narrow-wide-DDwOE-vT.js","/assets/arrow-up-right-BvNUpQLp.js","/assets/award-D7oINBX6.js","/assets/ban-DO8W5s8K.js","/assets/bot-TVCi6y8d.js","/assets/boxes-C7mfFEwA.js","/assets/brigadirFilters-CZlOIcc1.js","/assets/broadcastTree-BHfKK0wi.js","/assets/building-2-vye3ZNqL.js","/assets/calendar-C-DviIVv.js","/assets/calendar-clock-B0-OnGyt.js","/assets/calendar-days-iCzxOIb0.js","/assets/calendar-range-DdbjWmI_.js","/assets/camera-Dw_ZSY2s.js","/assets/categories-C67SzPE1.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-RrSA5HhN.js","/assets/chart-line--ofWaFQK.js","/assets/chart-pie-C4cshi3J.js","/assets/chartRange-EUi1S-2n.js","/assets/chevron-left-Cxdll1pD.js","/assets/chevrons-up-down-CUo7VLUN.js","/assets/circle-B2KWLqgr.js","/assets/circle-check-big-Lhw0_1lU.js","/assets/circle-dot-yKS4CnUJ.js","/assets/circle-minus-CqRgEZB4.js","/assets/circle-slash-DtmFdL3o.js","/assets/circle-user-round-CXRCGYDy.js","/assets/cloud-off-BoJbUQ5z.js","/assets/cloud-upload-BdJCRefu.js","/assets/compass-h2y5VXgF.js","/assets/concernCategories-CdltvPvr.js","/assets/copy-CqtoDLD-.js","/assets/corner-down-right-CzCiCcKy.js","/assets/createLucideIcon-DWbY4bAh.js","/assets/es-D4GdfWGT.js","/assets/exportXlsx-BbPs-gon.js","/assets/external-link-D3_BgRy-.js","/assets/file-clock-DVB-N3Te.js","/assets/file-exclamation-point-CutwEYtY.js","/assets/file-spreadsheet-DLaGf9OA.js","/assets/file-text-BLl5cJ2b.js","/assets/flag-CxG9GjZz.js","/assets/flame-BLzBCnis.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CfmAYeEi.js","/assets/hash-BDR9VIaf.js","/assets/history-CF2E0_D-.js","/assets/hourglass-C1z57QhA.js","/assets/image-BULS8oiU.js","/assets/image-off-9nfrYRBA.js","/assets/index-ClcfsWXQ.css","/assets/index-Da3fTamx.js","/assets/key-round-Cg29QVl1.js","/assets/keyboard-weXKSTqM.js","/assets/languages-DQZkKiZH.js","/assets/layers-CSvyOwte.js","/assets/lightbulb-D8y2wuHn.js","/assets/link-2-TnFIyYKx.js","/assets/link-2-off-BN-uThTb.js","/assets/list-checks-CsbFrtKK.js","/assets/list-ordered-Dm9Kr8GC.js","/assets/list-tree-Eh2ku2V3.js","/assets/lock-open-GcRSQ3FW.js","/assets/log-in-BRyYAc91.js","/assets/maximize-2-BkQbIWfR.js","/assets/message-square--IqMzQmF.js","/assets/minimize-2-DCHrisEg.js","/assets/package-check-BqV9DUYA.js","/assets/paperclip-Duul3Y6b.js","/assets/pencil-DqFwOiTX.js","/assets/percent-DoHPKfJl.js","/assets/personName-CogOuS3K.js","/assets/pin-BdYE47Np.js","/assets/pin-off-DRz9jFHw.js","/assets/play-DSd0JdEQ.js","/assets/presentation-Bc365KR1.js","/assets/prop-types-DIG6Mn-T.js","/assets/radio-CNe1fDBh.js","/assets/react-apexcharts.esm-6be4_ENj.js","/assets/repeat-CUkO1SE6.js","/assets/rotate-ccw-BaY6w_YA.js","/assets/rotate-cw-D_m_jnGM.js","/assets/save-Tsl13UqX.js","/assets/scale-D3czOHYJ.js","/assets/scroll-text-4kvdh7qr.js","/assets/search-x-XMfmyV8R.js","/assets/segments-B-yZWSRg.js","/assets/send-dLGrpPOL.js","/assets/settings-2-O39B93Qy.js","/assets/shield-BI6oPxR9.js","/assets/shield-alert-BdmxAAIp.js","/assets/shield-check-DAbwtM0t.js","/assets/shield-question-mark-i4TwnpIi.js","/assets/siren-CEne3s3R.js","/assets/snowflake-BkZKMtvY.js","/assets/square--0LNB-yV.js","/assets/square-check-big-XXmNfmzK.js","/assets/star-MAiH2ahn.js","/assets/statusBands-CKP8Muxk.js","/assets/store--wV4M3Ep.js","/assets/table-2-CG7OZ9pm.js","/assets/table-properties-CAocgd8A.js","/assets/tag-DyMTknbb.js","/assets/timer-off-C5_LoYhG.js","/assets/trending-down-Dt84ygnB.js","/assets/trending-up-B3aE30E9.js","/assets/undo-2-Bgfsl22P.js","/assets/useChartTheme-DMGbljHy.js","/assets/useElementWidth-kvYHp6H3.js","/assets/useIsMobile-C6GP0uOV.js","/assets/useMutation-DyC44cjt.js","/assets/useStatusBands-DjRv7atK.js","/assets/user-BDfabjqG.js","/assets/user-cog-ChtDiCzD.js","/assets/user-minus-BMKzQPYr.js","/assets/users-BauTkvcm.js","/assets/video-_XXg6tW8.js","/assets/wallet-BJ8lODdq.js","/assets/warehouse-6Igi_mHw.js","/assets/zap-S_3AV6iz.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
