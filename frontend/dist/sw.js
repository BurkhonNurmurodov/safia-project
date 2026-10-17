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

const BUILD = "2026-10-17T13:19:08.726Z";
const PRECACHE = ["/","/assets/AdminPanel-BYSDYpB3.js","/assets/AnalysisBoard-CRsmSjOU.js","/assets/Arc-CJeamJh8.js","/assets/Assistant-CzQTFhcZ.js","/assets/BrigadirProfile-D6BZKcPo.js","/assets/BroadcastReceivers-DSNJFhdF.js","/assets/BroadcastRecord-Bf3VERZb.js","/assets/Button-BuEilrSI.js","/assets/CatLockNotice-CsKG14Jj.js","/assets/CategoryLegendModal-zBVLfoec.js","/assets/CellConcerns-DmdFpTLE.js","/assets/CellDetails-XvjFpTIg.js","/assets/CellFormModal-C47hasmD.js","/assets/CellIdent-DrC9Zwdg.js","/assets/CellLink-B7IJio8_.js","/assets/Cells-UU8dJ8eA.js","/assets/ColumnFilter-CrHU4Lqf.js","/assets/ColumnsPicker-D_pCAUeD.js","/assets/CommentsModal-Dg7N5res.js","/assets/ComparisonTable-ByJQB1uF.js","/assets/Concerns-D0WykvIP.js","/assets/CountStepper-BvytspSF.js","/assets/Daily-B__KD3bU.js","/assets/DataTable-DnXn0-cF.js","/assets/DateRangePicker-DdYM4Zr3.js","/assets/DayReportView-BtZHZAEm.js","/assets/DayStepper-iV2_GBIr.js","/assets/DifferenceBreakdown-DmS30IPm.js","/assets/Downtime-9oCjXdi9.js","/assets/Education--SRoE-7T.js","/assets/EducationLesson-CkaZ_h7L.js","/assets/EmptyState-BCzIj0ZJ.js","/assets/Exam-ZM0d1CYP.js","/assets/FactorySelect-CbXeS_5K.js","/assets/ForeignObjects-bDD7zAfS.js","/assets/Gamification-Cic3I7lk.js","/assets/GroupBadge-rx_vHZ9L.js","/assets/HeatmapChart-Bx9zVAFv.js","/assets/IdleCell-CIV59nog.js","/assets/KPICard-CHQm-GF-.js","/assets/Kaizen-b1C0fU38.js","/assets/Kelish-o_ZJgFkV.js","/assets/KpiDeltaCard-BwtcExCF.js","/assets/LangTextInput-r_kSPZeG.js","/assets/Layout-CuLDztVw.js","/assets/LeaderAppeal-DqVY5Syk.js","/assets/LeaderDayReport-j9NpSuHM.js","/assets/LeaderUnitReport-CIwMyEb2.js","/assets/Leaderboard-9SQ4XEoL.js","/assets/Leaders-B1ywMHJ4.js","/assets/Lightbox-C_2Vuxj-.js","/assets/LiveOverview-bTpmyfwX.js","/assets/Login-DkP61KNA.js","/assets/NotFound-DxtJfLNA.js","/assets/Notifications-CgTjzsHF.js","/assets/Overview-InbuoJz5.js","/assets/Pagination-ePxVbZm6.js","/assets/PerenaladkaFactTable-BwbvAFWO.js","/assets/PersonCard-CNrtnPX7.js","/assets/PlanFulfillment-DypVyicH.js","/assets/Production-DcyKg7JQ.js","/assets/Profile-C1hh1WGW.js","/assets/ProofCamera-Dwa_TjzQ.js","/assets/ProofPhoto-D3eMIWgq.js","/assets/Quality-TuQdUZm5.js","/assets/RawRows-B_phqf9i.js","/assets/RequestStateChip-BgA9af-x.js","/assets/RichTextEditor-BTEHdgsl.js","/assets/SaveState-fG20fiGX.js","/assets/SearchInput-CXK5Rdk1.js","/assets/SeasonalityHeatmap-B0uWh_iq.js","/assets/SegmentedToggle-D3wWTqaj.js","/assets/SetupTimes-CSDsTp-D.js","/assets/ShiftDaily-C2BihE5J.js","/assets/Staff-BkWKT_zN.js","/assets/StaffListAtCheck-Di1fbCRU.js","/assets/StatusBadge-B-T_dd3p.js","/assets/TargetGoal-BLbKo-1g.js","/assets/Targets-DHVc0CKT.js","/assets/Tasks-Dbju61h6.js","/assets/TimeWheelPicker-Cn4cz23Y.js","/assets/Toast-BQbZSvTc.js","/assets/Tooltip-Bz-Kx7PO.js","/assets/TrendChart-Dmfd37er.js","/assets/TripleSpeedometer-CexIPMbY.js","/assets/Trudoyomkost-BEuLaXpw.js","/assets/Turnover-BKQhZX4K.js","/assets/TurnoverBits-7P-vdtOp.js","/assets/UploadDropzone-DDh2-PTY.js","/assets/UsersActivity-CLrPYjYY.js","/assets/VerdictBlock-DmdkHQse.js","/assets/VfxApiMap-B3syQY4u.js","/assets/VfxDictionaries-Ctcumoez.js","/assets/VfxEmployees-DCyhBAX2.js","/assets/VfxHrMoves-Cay6Pn-w.js","/assets/VfxJobs-DLSXl1un.js","/assets/VfxPhoto-C3lABLxe.js","/assets/VfxShifts-CeqEYvCO.js","/assets/VfxState-B8ZaMxQc.js","/assets/VfxTimebooks-BS1HezPc.js","/assets/VfxTimesheet-GgUhc4oj.js","/assets/WatchProgress--Qg4mxb3.js","/assets/WebLogin-CHcef3Gq.js","/assets/WorkerConcerns-DIZ3FBwE.js","/assets/Workers-CFCdFpCE.js","/assets/Zagruzka-Xt5KBfhz.js","/assets/ZagruzkaCell-CG0xFM3a.js","/assets/api-B6c2OJk5.js","/assets/archive-Cs_87ely.js","/assets/archive-restore-BQT89CJQ.js","/assets/arrow-down-B6DkDMfO.js","/assets/arrow-down-wide-narrow-BEDMAWCK.js","/assets/arrow-up-narrow-wide-CjXDAnaO.js","/assets/award-DbwM8s3N.js","/assets/ban-daAB0nL5.js","/assets/boxes-CMNJrUpo.js","/assets/braces-34-kqhZQ.js","/assets/brigadirFilters-CEu-UN-w.js","/assets/broadcastTree-DXUwMz5k.js","/assets/building-2-DxMuHEpg.js","/assets/calculator-NwhiMzn3.js","/assets/calendar-TMda2goM.js","/assets/calendar-days-CykC4CMR.js","/assets/camera-B7-t_04L.js","/assets/categories-c0pVuPII.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Ckm1i1oO.js","/assets/chart-line-CbQpu3lv.js","/assets/chart-pie-8VjAxf5E.js","/assets/chartRange-C56P7UZI.js","/assets/check-check-DiTEbu9C.js","/assets/chevron-left-CAEOPcCo.js","/assets/chevrons-up-down-DhB1cM1Z.js","/assets/circle-BrqlYXmj.js","/assets/circle-alert-QdL4TmNM.js","/assets/circle-check-big-BDgRG8PW.js","/assets/circle-dashed-CPj59ApF.js","/assets/circle-minus-8FT-MsVm.js","/assets/circle-question-mark-AM7ApqW8.js","/assets/circle-slash-wnkopw-q.js","/assets/circle-user-round-7lK5Y_yH.js","/assets/cloud-off-DBtNwjjq.js","/assets/cloud-upload-BzWmogPw.js","/assets/compass-BC06ylsn.js","/assets/concernCategories-DSKjaQYf.js","/assets/corner-down-right-BbbX6ZWf.js","/assets/createLucideIcon-BjAHhdIC.js","/assets/es-CaLBAIPI.js","/assets/external-link-x68vytOp.js","/assets/file-clock-BegAZcwk.js","/assets/file-exclamation-point-jcX2r3zQ.js","/assets/flag-BBaUurmc.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D2UXhyaR.js","/assets/hash-Dfb6-2bs.js","/assets/hourglass-ZfSVbIcj.js","/assets/image-BUcVXbDM.js","/assets/image-off-DjGLLasx.js","/assets/inbox-CPQQ0kVE.js","/assets/index-ByhNoNK_.css","/assets/index-sHkTURXu.js","/assets/keyboard-DSAmx_WV.js","/assets/languages-BO0V5EGv.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DEAiWuG_.js","/assets/lightbulb-CvlFj4Uf.js","/assets/link-2-CyQH4jmb.js","/assets/link-2-off-DjOjf4xs.js","/assets/list-ordered-BAivwL3n.js","/assets/list-tree-C90O4dcP.js","/assets/lock-open-DOuP84tV.js","/assets/log-in-BNap0VzZ.js","/assets/marks-DRsIPV-8.js","/assets/minimize-2-6klvsyfR.js","/assets/package-check-D4dkUDhO.js","/assets/pencil-C7zHjIr7.js","/assets/percent-CBs07ncs.js","/assets/pin-CJxcJv-g.js","/assets/pin-off-BmlONRe0.js","/assets/play-A9Jc19fy.js","/assets/plug-zap-Dm2WZ_AT.js","/assets/prop-types-C66zSm2y.js","/assets/radio-lLCvHizG.js","/assets/react-apexcharts.esm-O1KjqdhO.js","/assets/registers-NzxJ4S69.js","/assets/repeat-DZhkqnLI.js","/assets/save-BxDv32V_.js","/assets/scopeLinks-BH7yVIQM.js","/assets/scroll-text-ChM8PUjW.js","/assets/search-x-C0S2BYvR.js","/assets/segments-_tTn3_3U.js","/assets/send-Cgmd2VgH.js","/assets/settings-2-FxqGD7p3.js","/assets/shield-D3iNrKFA.js","/assets/shield-alert-Cxvad28w.js","/assets/shield-question-mark-DGePRt4u.js","/assets/siren-BVO4uIr8.js","/assets/snowflake-D6xkrfb-.js","/assets/split-DxJ6JHMe.js","/assets/square-check-big-BHHj5QZ_.js","/assets/star-BrDVjIv_.js","/assets/statusBands-CJGL2DMf.js","/assets/store-BCUuDfYK.js","/assets/table-2-C_lKsRlO.js","/assets/table-properties-jbWu74_O.js","/assets/tag-C0udhMWZ.js","/assets/timer-off-BLP8iB01.js","/assets/trending-down-BLvIiBSw.js","/assets/trending-up-DWr_r6tS.js","/assets/undo-2-i5CRk8dj.js","/assets/useChartTheme-BrzJzr2I.js","/assets/useElementWidth-Co0ckw2J.js","/assets/useIsMobile-l2jhrmEp.js","/assets/useOpenParam-D-Ch5brs.js","/assets/useStatusBands-CbHaVi6_.js","/assets/useUrlScope-BLCI0Xz3.js","/assets/user-BuP7czKo.js","/assets/user-cog-BSLNspqH.js","/assets/users-VEb_kGd1.js","/assets/vfx-D_fegrZT.js","/assets/video-Q_TeQOT6.js","/assets/wallet-BhUa21O4.js","/assets/warehouse-BJ13Zyw1.js","/assets/workflow-DyoEqeOe.js","/assets/x-BOV7eMD3.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
