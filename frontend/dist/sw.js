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

const BUILD = "2026-10-21T05:33:29.104Z";
const PRECACHE = ["/","/assets/AdminPanel-BL0gN9H5.js","/assets/AnalysisBoard-C9eZQF3K.js","/assets/Arc-DpYrRO2K.js","/assets/Assistant-BogSznwW.js","/assets/BrigadirProfile-BQHU8Ajc.js","/assets/BroadcastReceivers-B6MiClob.js","/assets/BroadcastRecord-CO7w-9tJ.js","/assets/Button-BT2kCDcV.js","/assets/CatLockNotice-BDmvlZAJ.js","/assets/CategoryLegendModal-C9gxqPzd.js","/assets/CellConcerns-C7Uwazk5.js","/assets/CellDetails-iWr5EzGp.js","/assets/CellFormModal-8l_rZAQZ.js","/assets/CellIdent-5ixWMj0F.js","/assets/CellLink-DRxuhCuk.js","/assets/Cells-iOeJ6fSp.js","/assets/ColumnFilter-lWj2Z08J.js","/assets/ColumnsPicker-DUtncSpO.js","/assets/CommentsModal-BPH7lRES.js","/assets/ComparisonTable-bEOA3oKS.js","/assets/Concerns-DRIa-0ZK.js","/assets/CountStepper-CgYx2eOc.js","/assets/Daily-0wj7OZeF.js","/assets/DataTable-COHdZv4A.js","/assets/DateRangePicker-CmxOdzyG.js","/assets/DayReportView-DrxqsONZ.js","/assets/DayStepper-DlEAGqvs.js","/assets/DayStrip-CJcVYvJz.js","/assets/DifferenceBreakdown-BDvqLqTW.js","/assets/Downtime-qfrJOx9r.js","/assets/Education-_4HBrMrW.js","/assets/EducationLesson-ohVDAaEu.js","/assets/EmptyState-wQf83c6x.js","/assets/Exam-CZVEXp8r.js","/assets/FactorySelect-DnlIjFgs.js","/assets/Gamification-yzfHDC87.js","/assets/GroupBadge-BwN-V3Cf.js","/assets/HeatmapChart-BWrLDpqY.js","/assets/IdleCell-Dejv9x-N.js","/assets/KPICard-z1apQTTu.js","/assets/Kaizen-C6682bDe.js","/assets/Kelish-F7Quv2v8.js","/assets/KpiDeltaCard-Bjt3luJT.js","/assets/LangTextInput-Cy9C-wd-.js","/assets/Layout-DifZ7IDK.js","/assets/LeaderAppeal-DM0u8mnX.js","/assets/LeaderDayReport-EKIO9eOC.js","/assets/LeaderUnitReport-duylW1kk.js","/assets/Leaderboard-CAFkJrNm.js","/assets/Leaders-hIYd2lb4.js","/assets/LeadersKpi-BA4yPoht.js","/assets/Lightbox-BjBs30Ti.js","/assets/LiveOverview-CmAJ19Sc.js","/assets/Login-DZ_blFYw.js","/assets/NotFound-B6hTLNBm.js","/assets/Notifications-CbRMqBek.js","/assets/Ontime-DuWEjXqG.js","/assets/Overview-BB_Ivv0f.js","/assets/Pagination-CuuFdJNf.js","/assets/PerenaladkaFactTable-DMWYhCdT.js","/assets/PersonCard-CZ2vY9ml.js","/assets/PlanFulfillment-DLt_SrWn.js","/assets/Production-rE9SGTlK.js","/assets/Profile-Cp_0M3tN.js","/assets/ProofCamera-D322kt5E.js","/assets/ProofPhoto-7eyjBNH9.js","/assets/Quality-DKz2g2-6.js","/assets/RawRows-Csbs84zd.js","/assets/RequestStateChip-BAZY-B3K.js","/assets/RichTextEditor-BdRoAkVp.js","/assets/SaveState-DtbOw83J.js","/assets/SearchInput-DZKMG0p8.js","/assets/SeasonalityHeatmap-CPI8jIty.js","/assets/SegmentedToggle-B0ZxwLql.js","/assets/SetupTimes-Bfi_JNyr.js","/assets/ShiftDaily-Bkq18qRc.js","/assets/Staff-6-wV2vnY.js","/assets/StaffListAtCheck-BOFAtjKt.js","/assets/StatusBadge-e6ubXgjU.js","/assets/StatusBandsModal-DVo0lRJx.js","/assets/TargetGoal-DB1SHpP2.js","/assets/Targets-S90veTZj.js","/assets/Tasks-DRAV1pmy.js","/assets/TimeWheelPicker-DSfpklFA.js","/assets/Toast-B71V4RQ6.js","/assets/Tooltip-h3QRPV7P.js","/assets/TrendChart-CVUoOazp.js","/assets/TripleSpeedometer-B75ygA32.js","/assets/Trudoyomkost-DPNSqxRh.js","/assets/UploadDropzone-lC_8qW2J.js","/assets/UsersActivity-CBQfUppr.js","/assets/VerdictBlock-Djt-fxM6.js","/assets/VfxApiMap-DyZlkGH8.js","/assets/VfxDictionaries-g9Yz-63K.js","/assets/VfxEmployees-ULMTS35d.js","/assets/VfxHrMoves-Bg1TwrjQ.js","/assets/VfxJobs-D4xNZKX4.js","/assets/VfxPhoto-MXbgT4Or.js","/assets/VfxShifts-ccI1Hhqp.js","/assets/VfxState-Dhfl3LYA.js","/assets/VfxTimebooks-CUuuVGTK.js","/assets/VfxTimesheet-BHGaXkU6.js","/assets/WatchProgress-VA_2aqox.js","/assets/WebLogin-SD4cV8QC.js","/assets/Workers-Docm5yKo.js","/assets/Zagruzka-Cuo6SNDy.js","/assets/ZagruzkaCell-IK-XZg0F.js","/assets/api-DUrVhGdG.js","/assets/archive-DFmKl104.js","/assets/archive-restore-BPZ-bllT.js","/assets/arrow-down-BfIviPmL.js","/assets/arrow-down-right-9rKZIUIq.js","/assets/arrow-down-wide-narrow-Buwe8bJa.js","/assets/arrow-up-narrow-wide-BJ-DY9la.js","/assets/ban-Bzsto8Ua.js","/assets/boxes-nqn_8FnB.js","/assets/braces-ZgaMFbB9.js","/assets/brigadirFilters-CjaTz-l2.js","/assets/broadcastTree-DzuHGerj.js","/assets/building-2-DUmxacRi.js","/assets/calendar-CrsBelTb.js","/assets/calendar-days-Cdr34Qeo.js","/assets/camera-DWoTqBtB.js","/assets/categories-CPD52Hch.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CV462xCE.js","/assets/chart-line-C3z_nOp8.js","/assets/chart-pie-BTLQ6hcq.js","/assets/chartRange-06KFWF92.js","/assets/check-check-BZ2xMfxC.js","/assets/chevron-left-Be0wm3Br.js","/assets/chevrons-up-down-DtG4QrPY.js","/assets/circle-alert-wM5oKJTa.js","/assets/circle-check-big-BFd0l6cu.js","/assets/circle-dashed-m2sONL9W.js","/assets/circle-minus-CIjKw8ym.js","/assets/circle-qq0UbVH6.js","/assets/circle-question-mark-YGgQJTE-.js","/assets/circle-slash-C_CjUBz-.js","/assets/circle-user-round-DqPT8Una.js","/assets/cloud-off-Ovx1xezu.js","/assets/cloud-upload-tUce2rBd.js","/assets/compass-BLOb4UUI.js","/assets/concernCategories-DIQ2QwnK.js","/assets/corner-down-right-Cjzg98ae.js","/assets/createLucideIcon-DrHkYVTJ.js","/assets/es-Jk1xvZf_.js","/assets/external-link-SqtS69Ot.js","/assets/file-clock-C4mVfPtu.js","/assets/file-exclamation-point-Cl0r3HNC.js","/assets/flag-GNGrBrr9.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BoMob3n2.js","/assets/funnel-CoI9HiLU.js","/assets/hash-CBQlL4f0.js","/assets/hourglass-VxPTWvMi.js","/assets/image-CEdCrHuJ.js","/assets/image-off-Cn2dN02m.js","/assets/inbox-C8Q51owZ.js","/assets/index-Ch61W2gY.js","/assets/index-DLT_vDJq.css","/assets/keyboard-fKtopWW8.js","/assets/languages-DqNgF5m0.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Bs99JM5E.js","/assets/lightbulb-vF7Pm5LX.js","/assets/link-2-U2zzKTo7.js","/assets/link-2-off-DlnvcKbS.js","/assets/list-ordered-CreCZ7cA.js","/assets/list-tree-DuGmBdlH.js","/assets/lock-open-C6uUKE08.js","/assets/log-in-DITxXn95.js","/assets/marks-B9InUHp8.js","/assets/minimize-2-BuT6PCvR.js","/assets/package-check-CsTpKM8L.js","/assets/pencil-SEOkGbW8.js","/assets/percent-BGt9khJu.js","/assets/pin-ButsVY2b.js","/assets/pin-off-CN67_9p2.js","/assets/play-DmnGQQOb.js","/assets/plug-zap-DTnOhskJ.js","/assets/prop-types-CqhHASPp.js","/assets/radio-BJsskANi.js","/assets/react-apexcharts.esm-DzH-jsUe.js","/assets/registers-By4Issg7.js","/assets/repeat-L9Yzq0_O.js","/assets/save-ltDO_9_g.js","/assets/scopeLinks-DguKXVBb.js","/assets/scroll-text-BGtHoMWu.js","/assets/search-x-LZWXrgwI.js","/assets/segments-CZ5DgrU2.js","/assets/send-Db9kBmwJ.js","/assets/settings-2-QgSTZtnZ.js","/assets/shield-CZGGXWSL.js","/assets/shield-alert-fqqB7CnE.js","/assets/shield-question-mark-Bsh78ZJ1.js","/assets/sigma-Bq-wtJOH.js","/assets/siren-CT6IG8w1.js","/assets/snowflake-CqwIbuVj.js","/assets/split-CQbg1oNG.js","/assets/square-check-big-C7ZNEy5U.js","/assets/star-B7BOGz14.js","/assets/statusBands-C1vIvF1a.js","/assets/store-L8qIl71G.js","/assets/table-2-CbztX0hO.js","/assets/table-properties-Kx1P8YkA.js","/assets/tag-DJzxC3VI.js","/assets/timer-off-0Y3PFdW3.js","/assets/trending-down-CtFFKJX7.js","/assets/trending-up-BumZYUpP.js","/assets/undo-2-Cx33d7K6.js","/assets/useChartTheme-mXo5v10Y.js","/assets/useElementWidth-CwBQ7VFP.js","/assets/useIsMobile-CLPm_R-J.js","/assets/useOpenParam-D1M_MpvA.js","/assets/useStatusBands-DmSR9KsP.js","/assets/useUrlScope-DFQ4MF8u.js","/assets/user-Bo14ZeQI.js","/assets/user-cog-Bg4q7F01.js","/assets/user-minus-DUkf5YJH.js","/assets/users-Df0eMuik.js","/assets/vfx-BYTWcnTk.js","/assets/video-BESfKM3O.js","/assets/wallet-CVFzjnty.js","/assets/warehouse-uPB4Xshq.js","/assets/workflow-BkZgoqdD.js","/assets/x-C8j_LRzQ.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
