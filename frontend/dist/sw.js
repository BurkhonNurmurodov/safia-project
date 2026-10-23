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

const BUILD = "2026-10-23T20:20:23.202Z";
const PRECACHE = ["/","/assets/AdminPanel-CgYRQf56.js","/assets/AnalysisBoard-bANROJf8.js","/assets/Arc-CiPqi_l1.js","/assets/Assistant-CVA6sim_.js","/assets/BrigadirProfile-Bzl8qoly.js","/assets/BroadcastReceivers-CuFbyEbV.js","/assets/BroadcastRecord-BVkCOJxk.js","/assets/Button-Cn-gBGxG.js","/assets/CatLockNotice-ChstwGPx.js","/assets/CategoryLegendModal-Be00cDxW.js","/assets/CellConcerns-8s-lJMJa.js","/assets/CellDetails-BBG44WFn.js","/assets/CellFormModal-Cey3wyYB.js","/assets/CellIdent-CSTYa-Aj.js","/assets/CellLink-xGbeHxHa.js","/assets/Cells-xwSk9ht4.js","/assets/ColumnFilter-CW0TREy0.js","/assets/ColumnsPicker-CljhzLBj.js","/assets/CommentsModal-DAehUfxL.js","/assets/ComparisonTable-Djqfv95Y.js","/assets/Concerns-UYl-NBwZ.js","/assets/CountStepper-BhQQZrJZ.js","/assets/Daily-BzYfgIUD.js","/assets/DataTable-B15vB3mg.js","/assets/DateRangePicker-CWBLQWn7.js","/assets/DayReportView-CrSDlNZH.js","/assets/DayStepper-DV2l2v1x.js","/assets/DayStrip-VJfIMAKJ.js","/assets/DifferenceBreakdown-CLQzg8Uj.js","/assets/Downtime-DrYxcboJ.js","/assets/Education-BnGjHbA8.js","/assets/EducationLesson-BrbWO_GE.js","/assets/EmptyState-p9UI7W_t.js","/assets/Exam-BkrEHau0.js","/assets/FactorySelect-aranbTGm.js","/assets/Gamification-Z9rU6wIB.js","/assets/GroupBadge-DyTQnNWV.js","/assets/HeatmapChart-bV0CaFTq.js","/assets/IdleCell-3dl5gSq5.js","/assets/KPICard-DUL46TmE.js","/assets/Kaizen-frxievJx.js","/assets/Kelish-DvZ8rp1N.js","/assets/KpiDeltaCard-BcVXZY1i.js","/assets/LangTextInput-DHMkhush.js","/assets/Layout-C5Hn_Amu.js","/assets/LeaderAppeal-B7PIaDJS.js","/assets/LeaderDayReport-BajZANAo.js","/assets/LeaderUnitReport-D6Vb9VlL.js","/assets/Leaderboard-NrPrP9-6.js","/assets/Leaders-C8zjMPCo.js","/assets/LeadersKpi-BqZ5p8K3.js","/assets/Lightbox-Dp4r0V8i.js","/assets/LiveOverview-BmV7KP7t.js","/assets/Login-BkmkwXvE.js","/assets/NotFound-Dg5D8YqA.js","/assets/Notifications-C9HUM6an.js","/assets/Ontime-CQxVr65W.js","/assets/Overview-BM46Aiuk.js","/assets/Pagination-C_XW6bYX.js","/assets/PerenaladkaFactTable-R0CxmzhH.js","/assets/PersonCard-CcDf7o0G.js","/assets/PlanFulfillment-DxVUIZcJ.js","/assets/Production-CT5_C9iI.js","/assets/Profile-B10FUEVE.js","/assets/ProofCamera-DchFTaGO.js","/assets/ProofPhoto-W-4gRQhH.js","/assets/Quality-CbRSZ0dq.js","/assets/RawRows-B22sUwGg.js","/assets/RequestStateChip-DMcMmALd.js","/assets/RichTextEditor-sJ571RB_.js","/assets/SaveState-B99uwl4T.js","/assets/SearchInput-nP6cf5kp.js","/assets/SeasonalityHeatmap-C5BpN1gj.js","/assets/SegmentedToggle-COia1H_l.js","/assets/SetupTimes-kR9hnVA4.js","/assets/ShiftDaily-CFC6YAoc.js","/assets/Staff-Dia1E7WC.js","/assets/StaffListAtCheck-DH1ZqnCa.js","/assets/StatusBadge-DtfExPSK.js","/assets/StatusBandsModal-xu8p61bl.js","/assets/TargetGoal-BUDIcAGo.js","/assets/Targets-Bjkn68Ca.js","/assets/Tasks-BsOktPZW.js","/assets/TimeWheelPicker-CRjh4VVA.js","/assets/Toast-C81M8flS.js","/assets/Tooltip-Ga05Tb5A.js","/assets/TrendChart-lPIKSf-g.js","/assets/TripleSpeedometer-COsmneLn.js","/assets/Trudoyomkost-3r7x7z4j.js","/assets/UploadDropzone-BopL1yrD.js","/assets/UsersActivity-D7m1dUZ-.js","/assets/VerdictBlock-CM6_8YFt.js","/assets/VfxApiMap-BU5wf2eo.js","/assets/VfxDictionaries-DXY2M36p.js","/assets/VfxEmployees-DYtFKRLc.js","/assets/VfxHrMoves-NwrFa-KH.js","/assets/VfxJobs-nK5YFX6k.js","/assets/VfxPhoto-Bw-5S4Ud.js","/assets/VfxShifts-D5q39fpN.js","/assets/VfxState-CUEjMkoa.js","/assets/VfxTimebooks-oxnPvhVd.js","/assets/VfxTimesheet-gfYh_6lF.js","/assets/WatchProgress-C_J6tN_P.js","/assets/WebLogin-Bc7WuJyh.js","/assets/Workers-JB4SQ8A_.js","/assets/Zagruzka-CEzY-S12.js","/assets/ZagruzkaCell-Dm8IHN0X.js","/assets/api-BFm7MSgf.js","/assets/archive-DiNDFRgs.js","/assets/archive-restore-Cwur2pzS.js","/assets/arrow-down-CpswcCsF.js","/assets/arrow-down-right-1P2AK6hc.js","/assets/arrow-down-wide-narrow-QXoUHAzH.js","/assets/arrow-up-narrow-wide-DqqJiNAT.js","/assets/ban-CFcdsGuh.js","/assets/boxes-Cquk_I3O.js","/assets/braces-Dv-pbkCM.js","/assets/brigadirFilters-CbI_FVMH.js","/assets/broadcastTree-Cc2yvVPm.js","/assets/building-2-BrXmkIDv.js","/assets/calendar-C4hLiRKZ.js","/assets/calendar-days-DbFSLume.js","/assets/camera-CGjzb29_.js","/assets/categories-DnLoA5vP.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D0iojsH2.js","/assets/chart-line-qBjL0CQR.js","/assets/chart-pie-Bj9I5Q8f.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-B_y54CT-.js","/assets/chevron-left-DmM-da95.js","/assets/chevrons-up-down-tijVsg4c.js","/assets/circle-C79Lv86_.js","/assets/circle-alert-C10JuVBx.js","/assets/circle-check-big-Rrz1EW6E.js","/assets/circle-dashed-BmqozeqW.js","/assets/circle-minus-BcifY0ee.js","/assets/circle-question-mark-BcMvKaV9.js","/assets/circle-slash-f6VcoTku.js","/assets/circle-user-round-2DF3azB4.js","/assets/cloud-off-I9SZk34s.js","/assets/cloud-upload-BGmLGNh5.js","/assets/compass-88Zb1kiK.js","/assets/concernCategories-aDFpr_TV.js","/assets/corner-down-right-JnHsern1.js","/assets/createLucideIcon-ziX4ebrQ.js","/assets/en-BFa2iQs0.js","/assets/es-Dtgc5NM1.js","/assets/external-link-BkGhiX7W.js","/assets/file-clock-BEE5jL8F.js","/assets/file-exclamation-point-CEUjxdMY.js","/assets/flag-Bm6fk3Pk.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-hUvzPwmE.js","/assets/funnel-B7ataRoj.js","/assets/hash-DJxpTrM4.js","/assets/hourglass-D4sbvfzX.js","/assets/image-C13ZX5Fy.js","/assets/image-off-D0n2ViWy.js","/assets/inbox-CkJLWdRK.js","/assets/index-B-xlMnEH.css","/assets/index-TgrNLyku.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DPpLEKCH.js","/assets/languages-CVrjTWQ8.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CRHNA7fa.js","/assets/leaderBoard-CeQaQvaw.js","/assets/lightbulb-CBVkJUQf.js","/assets/link-2-GI9cIStu.js","/assets/link-2-off-DHscwFG5.js","/assets/list-ordered-Cf4MKBsR.js","/assets/list-tree-oEB4RUSQ.js","/assets/lock-open-VwWJvtnb.js","/assets/log-in-PXlbAYzP.js","/assets/map-pin-DLyDibzf.js","/assets/marks-CS8LKUQe.js","/assets/minimize-2-BlIEpEai.js","/assets/package-check-fYtQKods.js","/assets/pencil-U-BMTH-t.js","/assets/percent-CNLNaNzU.js","/assets/pin-BIcAHBG3.js","/assets/pin-off-nZ0dBHos.js","/assets/play-B4kx8bW4.js","/assets/plug-zap-CU7Pe6QB.js","/assets/prop-types-RD3fbola.js","/assets/radio-BRnRoeHq.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-DUxEf-9q.js","/assets/repeat-B8TZggO_.js","/assets/ru-dv-f7Dme.js","/assets/save-C9YeroOo.js","/assets/scopeLinks-B5bsSowq.js","/assets/scroll-text-CYWZ_tsz.js","/assets/search-x-DV6iRPmg.js","/assets/segments-D5Uiedtv.js","/assets/send-CBAKupjr.js","/assets/settings-2-Bb8ejdlz.js","/assets/shield-I0bIi71G.js","/assets/shield-alert-1aG1BquZ.js","/assets/shield-question-mark-DgtH7E1K.js","/assets/sigma-C8gKdIS_.js","/assets/siren-3vJAn7fp.js","/assets/snowflake-D7yC-BUt.js","/assets/split-DW-c5NG9.js","/assets/square-check-big-DDSXzXET.js","/assets/star-5HCCjG1Z.js","/assets/statusBands-DVBZcBq3.js","/assets/store-9w1z8Y5e.js","/assets/table-2-DJJqeL4V.js","/assets/table-properties-s0kjCSMK.js","/assets/tag-CaDcCeRU.js","/assets/timer-off-CiJvSgg9.js","/assets/translations-BXEL1p1I.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-CZc3PRgy.js","/assets/trending-up-BhNplbAv.js","/assets/undo-2-Cn74QhtP.js","/assets/useChartTheme-DCyv34K4.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-D7AU9U2W.js","/assets/useStatusBands-TUP548x_.js","/assets/useUrlScope-C25nhtaK.js","/assets/user-L4Bpure_.js","/assets/user-cog-Cycri2H2.js","/assets/user-minus-BHwNCiMo.js","/assets/users-D8cZBO5k.js","/assets/uz-DGMuP2P1.js","/assets/uz_cyrl-UkU22qMc.js","/assets/vfx-YDzw2hdd.js","/assets/video-Bjz1pRZO.js","/assets/wallet-BBgNx6Oe.js","/assets/warehouse-a8WFPVyx.js","/assets/workflow-BauFu6bf.js","/assets/x-BKHa9QTM.js","/assets/zap-BYFA4Lcv.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
