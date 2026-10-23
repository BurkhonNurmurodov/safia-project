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

const BUILD = "2026-10-23T18:34:35.948Z";
const PRECACHE = ["/","/assets/AdminPanel-DipCgck5.js","/assets/AnalysisBoard-Q97JlNT8.js","/assets/Arc-BN5mzvIn.js","/assets/Assistant-X6Nou8z4.js","/assets/BrigadirProfile-qNNqA88U.js","/assets/BroadcastReceivers-BwYVKWJb.js","/assets/BroadcastRecord-D_6lvTZb.js","/assets/Button-Cn-gBGxG.js","/assets/CatLockNotice-DJvUvp4Q.js","/assets/CategoryLegendModal-CsHIoRMe.js","/assets/CellConcerns-CAYhF0o2.js","/assets/CellDetails-Bhk4d_t-.js","/assets/CellFormModal-Wiov8Q-J.js","/assets/CellIdent-CSTYa-Aj.js","/assets/CellLink-Bjs9gR5r.js","/assets/Cells-7KWgyg-4.js","/assets/ColumnFilter-BctnE761.js","/assets/ColumnsPicker-BQFW4miC.js","/assets/CommentsModal-anNGKN9_.js","/assets/ComparisonTable-D3dkPvqT.js","/assets/Concerns-D9a7sRso.js","/assets/CountStepper-CkBNeJxi.js","/assets/Daily-MSh4UPg2.js","/assets/DataTable-sLpY_Qzw.js","/assets/DateRangePicker-BRwGMuCu.js","/assets/DayReportView-DLnaEpSy.js","/assets/DayStepper-6RXkeqag.js","/assets/DayStrip-D1o3CrvQ.js","/assets/DifferenceBreakdown-AHNZ1l-D.js","/assets/Downtime-EIdtzKJh.js","/assets/Education-B6pwBh1B.js","/assets/EducationLesson-PtOJeIay.js","/assets/EmptyState-BJowaNtE.js","/assets/Exam-CUT5zvRK.js","/assets/FactorySelect-CDXKNWya.js","/assets/Gamification-D2msEDrB.js","/assets/GroupBadge-Dwx3p-La.js","/assets/HeatmapChart-CkbdncpV.js","/assets/IdleCell-hdXWBpBu.js","/assets/KPICard-DUL46TmE.js","/assets/Kaizen-B6qn05v4.js","/assets/Kelish-lr7yIZHG.js","/assets/KpiDeltaCard-DZX4i_Nm.js","/assets/LangTextInput-DHMkhush.js","/assets/Layout-B_AQfewC.js","/assets/LeaderAppeal-BEhOQ7IN.js","/assets/LeaderDayReport-Do3Sld5q.js","/assets/LeaderUnitReport-_lFrL78F.js","/assets/Leaderboard-Cl-YBzzx.js","/assets/Leaders-Dpx-gNAB.js","/assets/LeadersKpi-CS3Up8dv.js","/assets/Lightbox-Dp4r0V8i.js","/assets/LiveOverview-D2BUrD4Z.js","/assets/Login-Co4ZuRWW.js","/assets/NotFound-2i7FdzW1.js","/assets/Notifications-DUjWxH3f.js","/assets/Ontime-DgAz-vpw.js","/assets/Overview-BzhWXya3.js","/assets/Pagination-D55cCPHX.js","/assets/PerenaladkaFactTable-Cd31GaO2.js","/assets/PersonCard-DzygzToi.js","/assets/PlanFulfillment-BGGpkIo4.js","/assets/Production-BuvaKpxP.js","/assets/Profile-CJXAdLKC.js","/assets/ProofCamera-LljqBwL1.js","/assets/ProofPhoto-C68EknZk.js","/assets/Quality-BXPQamwJ.js","/assets/RawRows-D8puMZms.js","/assets/RequestStateChip-Cv-zuS0e.js","/assets/RichTextEditor-CRTqIbs7.js","/assets/SaveState-DWDQSKlU.js","/assets/SearchInput-ClVlce-0.js","/assets/SeasonalityHeatmap-C5BpN1gj.js","/assets/SegmentedToggle-COia1H_l.js","/assets/SetupTimes-f7tYmDix.js","/assets/ShiftDaily-CNW8WfJW.js","/assets/Staff-Bn5bJvB6.js","/assets/StaffListAtCheck-Bw5MhxF2.js","/assets/StatusBadge-BwFB67l3.js","/assets/StatusBandsModal-DFuIUamh.js","/assets/TargetGoal-C45F6T_t.js","/assets/Targets-GHTBbdPt.js","/assets/Tasks-DQTLe5hH.js","/assets/TimeWheelPicker-CRjh4VVA.js","/assets/Toast-C81M8flS.js","/assets/Tooltip-Ga05Tb5A.js","/assets/TrendChart-B-jdjz3y.js","/assets/TripleSpeedometer-CP0MRBCN.js","/assets/Trudoyomkost-CDH5anam.js","/assets/UploadDropzone-BopL1yrD.js","/assets/UsersActivity-BiAP6009.js","/assets/VerdictBlock-B1A44tl1.js","/assets/VfxApiMap-BSn49Fun.js","/assets/VfxDictionaries-Dr9E_005.js","/assets/VfxEmployees-BzsUC-1a.js","/assets/VfxHrMoves-DfJ-Pd0G.js","/assets/VfxJobs-D-NGUsEY.js","/assets/VfxPhoto-Bw-5S4Ud.js","/assets/VfxShifts-Dji_vrh-.js","/assets/VfxState-C-QBvss8.js","/assets/VfxTimebooks-D__1adba.js","/assets/VfxTimesheet-owZhqzdI.js","/assets/WatchProgress-BcFBQnkP.js","/assets/WebLogin-DdijVEeq.js","/assets/Workers-DPaRpVTx.js","/assets/Zagruzka-C532-8uK.js","/assets/ZagruzkaCell-COVJ3yDe.js","/assets/api-BFm7MSgf.js","/assets/archive-DiNDFRgs.js","/assets/archive-restore-Cwur2pzS.js","/assets/arrow-down-CpswcCsF.js","/assets/arrow-down-right-1P2AK6hc.js","/assets/arrow-down-wide-narrow-QXoUHAzH.js","/assets/arrow-up-narrow-wide-DqqJiNAT.js","/assets/ban-CFcdsGuh.js","/assets/boxes-Cquk_I3O.js","/assets/braces-Dv-pbkCM.js","/assets/brigadirFilters-Binm8_By.js","/assets/broadcastTree-CpvlWqwO.js","/assets/building-2-BrXmkIDv.js","/assets/calendar-C4hLiRKZ.js","/assets/calendar-days-DbFSLume.js","/assets/camera-CGjzb29_.js","/assets/categories-NkKwwCfi.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D0iojsH2.js","/assets/chart-line-qBjL0CQR.js","/assets/chart-pie-Bj9I5Q8f.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-B_y54CT-.js","/assets/chevron-left-DmM-da95.js","/assets/chevrons-up-down-tijVsg4c.js","/assets/circle-C79Lv86_.js","/assets/circle-alert-C10JuVBx.js","/assets/circle-check-big-Rrz1EW6E.js","/assets/circle-dashed-BmqozeqW.js","/assets/circle-minus-BcifY0ee.js","/assets/circle-question-mark-BcMvKaV9.js","/assets/circle-slash-f6VcoTku.js","/assets/circle-user-round-2DF3azB4.js","/assets/cloud-off-I9SZk34s.js","/assets/cloud-upload-BGmLGNh5.js","/assets/compass-88Zb1kiK.js","/assets/concernCategories-D0R_ifJg.js","/assets/corner-down-right-JnHsern1.js","/assets/createLucideIcon-ziX4ebrQ.js","/assets/en-BFa2iQs0.js","/assets/es-Dtgc5NM1.js","/assets/external-link-BkGhiX7W.js","/assets/file-clock-BEE5jL8F.js","/assets/file-exclamation-point-CEUjxdMY.js","/assets/flag-Bm6fk3Pk.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-hUvzPwmE.js","/assets/funnel-B7ataRoj.js","/assets/hash-DJxpTrM4.js","/assets/hourglass-D4sbvfzX.js","/assets/image-C13ZX5Fy.js","/assets/image-off-D0n2ViWy.js","/assets/inbox-CkJLWdRK.js","/assets/index-B-xlMnEH.css","/assets/index-BN0kjlQT.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DPpLEKCH.js","/assets/languages-CVrjTWQ8.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CRHNA7fa.js","/assets/leaderBoard-YBzUyVZX.js","/assets/lightbulb-CBVkJUQf.js","/assets/link-2-GI9cIStu.js","/assets/link-2-off-DHscwFG5.js","/assets/list-ordered-Cf4MKBsR.js","/assets/list-tree-oEB4RUSQ.js","/assets/lock-open-VwWJvtnb.js","/assets/log-in-PXlbAYzP.js","/assets/map-pin-DLyDibzf.js","/assets/marks-CS8LKUQe.js","/assets/minimize-2-BlIEpEai.js","/assets/package-check-fYtQKods.js","/assets/pencil-U-BMTH-t.js","/assets/percent-CNLNaNzU.js","/assets/pin-BIcAHBG3.js","/assets/pin-off-nZ0dBHos.js","/assets/play-B4kx8bW4.js","/assets/plug-zap-CU7Pe6QB.js","/assets/prop-types-RD3fbola.js","/assets/radio-BRnRoeHq.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-RmjAjUKz.js","/assets/repeat-B8TZggO_.js","/assets/ru-dv-f7Dme.js","/assets/save-C9YeroOo.js","/assets/scopeLinks-DWMrEuRl.js","/assets/scroll-text-CYWZ_tsz.js","/assets/search-x-DV6iRPmg.js","/assets/segments-D5Uiedtv.js","/assets/send-CBAKupjr.js","/assets/settings-2-Bb8ejdlz.js","/assets/shield-I0bIi71G.js","/assets/shield-alert-1aG1BquZ.js","/assets/shield-question-mark-DgtH7E1K.js","/assets/sigma-C8gKdIS_.js","/assets/siren-3vJAn7fp.js","/assets/snowflake-D7yC-BUt.js","/assets/split-DW-c5NG9.js","/assets/square-check-big-DDSXzXET.js","/assets/star-5HCCjG1Z.js","/assets/statusBands-DVBZcBq3.js","/assets/store-9w1z8Y5e.js","/assets/table-2-DJJqeL4V.js","/assets/table-properties-s0kjCSMK.js","/assets/tag-CaDcCeRU.js","/assets/timer-off-CiJvSgg9.js","/assets/translations-BXEL1p1I.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-CZc3PRgy.js","/assets/trending-up-BhNplbAv.js","/assets/undo-2-Cn74QhtP.js","/assets/useChartTheme-DWMzMek7.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-CuRLix4a.js","/assets/useStatusBands-TUP548x_.js","/assets/useUrlScope-DtXh-WFr.js","/assets/user-L4Bpure_.js","/assets/user-cog-CuhCdN1S.js","/assets/user-minus-BHwNCiMo.js","/assets/users-D8cZBO5k.js","/assets/uz-DGMuP2P1.js","/assets/uz_cyrl-UkU22qMc.js","/assets/vfx-YDzw2hdd.js","/assets/video-Bjz1pRZO.js","/assets/wallet-BBgNx6Oe.js","/assets/warehouse-a8WFPVyx.js","/assets/workflow-BauFu6bf.js","/assets/x-BKHa9QTM.js","/assets/zap-BYFA4Lcv.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
