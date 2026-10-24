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

const BUILD = "2026-10-24T11:03:15.971Z";
const PRECACHE = ["/","/assets/AdminPanel-MfjukoSg.js","/assets/AnalysisBoard-BmW2WEHt.js","/assets/Arc-BLckFOnw.js","/assets/Assistant-CkZSS82q.js","/assets/BrigadirProfile-BJEGYbrZ.js","/assets/BroadcastReceivers-Iqc6byQS.js","/assets/BroadcastRecord-B4NhyhOf.js","/assets/Button-Cn-gBGxG.js","/assets/CatLockNotice-C5LizNS9.js","/assets/CategoryLegendModal-BbKCpLKH.js","/assets/CellConcerns-0s2QCqAP.js","/assets/CellDetails-DGy4XPu-.js","/assets/CellFormModal-DTLEtMeY.js","/assets/CellIdent-CSTYa-Aj.js","/assets/CellLink-CHacn4NQ.js","/assets/Cells-wyuybPVe.js","/assets/ColumnFilter-C_rocQ2C.js","/assets/ColumnsPicker-Bt9ZxKLV.js","/assets/CommentsModal-C8GlB5UF.js","/assets/ComparisonTable-BvN_LAAd.js","/assets/Concerns-n6OHtUiq.js","/assets/CountStepper-BqwAGv6i.js","/assets/Daily-BjPp6u5u.js","/assets/DataTable-DKiA2sgc.js","/assets/DateRangePicker-BfBtX7Mb.js","/assets/DayReportView-DTolUr2w.js","/assets/DayStepper-BmwcHkZr.js","/assets/DayStrip-D1hI1cZV.js","/assets/DifferenceBreakdown-CfSc1b-P.js","/assets/Downtime-DFBM-NGJ.js","/assets/Education-CnX_TJ2_.js","/assets/EducationLesson-DVbDJhdA.js","/assets/EmptyState-CByHec8L.js","/assets/Exam-BScFdb25.js","/assets/FactorySelect-TPVTNkDy.js","/assets/Gamification-B_t-IjSb.js","/assets/GroupBadge-lO_rGsZp.js","/assets/HeatmapChart-CmDAu1wA.js","/assets/IdleCell-DtwoVuxi.js","/assets/KPICard-DUL46TmE.js","/assets/Kaizen-B6bst8Kw.js","/assets/Kelish-DcSmhYQd.js","/assets/KpiDeltaCard-CD17eQDf.js","/assets/LangTextInput-DHMkhush.js","/assets/Layout-DiJa_dj8.js","/assets/LeaderAppeal-C7bkXeDT.js","/assets/LeaderDayReport-BiAvy_EX.js","/assets/LeaderUnitReport-C3L9Ux7g.js","/assets/Leaderboard-BIuWlZ_k.js","/assets/Leaders-CNpKYc0y.js","/assets/LeadersKpi-CXAXajkD.js","/assets/Lightbox-Dp4r0V8i.js","/assets/LiveOverview-6iLKVmr8.js","/assets/Login-CEV3ZY7j.js","/assets/NotFound-CaD4WciA.js","/assets/Notifications-BvnDDLPE.js","/assets/Ontime-DdykrSa0.js","/assets/Overview-BLKdB6BY.js","/assets/Pagination-C-IOqG21.js","/assets/PerenaladkaFactTable-jToQChk7.js","/assets/PersonCard-DYjSJobF.js","/assets/PlanFulfillment-k43eHaPp.js","/assets/Production-CDzAo5Cl.js","/assets/Profile-CRJZkPMr.js","/assets/ProofCamera-CO6D-6DE.js","/assets/ProofPhoto-Dr6ceILJ.js","/assets/Quality-Co8saO9O.js","/assets/RawRows-CCmLMAKw.js","/assets/RequestStateChip-CcRR2Y2b.js","/assets/RichTextEditor-cT_e3TlH.js","/assets/SaveState-Cxfmt7sw.js","/assets/SearchInput--xDluhcF.js","/assets/SeasonalityHeatmap-C5BpN1gj.js","/assets/SegmentedToggle-COia1H_l.js","/assets/SetupTimes-BCjQPSMj.js","/assets/ShiftDaily-CTpmEGYK.js","/assets/Staff-tZOH-jIx.js","/assets/StaffListAtCheck-Ds3SBXx0.js","/assets/StatusBadge-1BjQ-AnV.js","/assets/StatusBandsModal-TxgZOhEz.js","/assets/TargetGoal-Dvatzmr0.js","/assets/Targets-DWU2WtrD.js","/assets/Tasks-2dAo_rYS.js","/assets/TimeWheelPicker-CRjh4VVA.js","/assets/Toast-C81M8flS.js","/assets/Tooltip-Ga05Tb5A.js","/assets/TrendChart-BBkDBekx.js","/assets/TripleSpeedometer-BfUPR_3e.js","/assets/Trudoyomkost-ChHVi4oy.js","/assets/UploadDropzone-BopL1yrD.js","/assets/UsersActivity-CtQqLtyS.js","/assets/VerdictBlock-CBqA35H3.js","/assets/VfxApiMap-lUBxYVKA.js","/assets/VfxDictionaries-COfVwUVj.js","/assets/VfxEmployees-BxRa_aq6.js","/assets/VfxHrMoves-BKXpfLDk.js","/assets/VfxJobs-Beb4M8Yo.js","/assets/VfxPhoto-Bw-5S4Ud.js","/assets/VfxShifts-DsKD7lLD.js","/assets/VfxState-Nv3WtOKJ.js","/assets/VfxTimebooks-CTx-TTkN.js","/assets/VfxTimesheet-Bxf60q43.js","/assets/WatchProgress-BV8QLBc4.js","/assets/WebLogin-DvF4T47g.js","/assets/Workers-CbpWeI68.js","/assets/Zagruzka-GA6X_ovl.js","/assets/ZagruzkaCell-BQXXFj3m.js","/assets/api-BFm7MSgf.js","/assets/archive-DiNDFRgs.js","/assets/archive-restore-Cwur2pzS.js","/assets/arrow-down-CpswcCsF.js","/assets/arrow-down-right-1P2AK6hc.js","/assets/arrow-down-wide-narrow-QXoUHAzH.js","/assets/arrow-up-narrow-wide-DqqJiNAT.js","/assets/ban-CFcdsGuh.js","/assets/boxes-Cquk_I3O.js","/assets/braces-Dv-pbkCM.js","/assets/brigadirFilters-DUB_9YZd.js","/assets/broadcastTree-1_EMPF7H.js","/assets/building-2-BrXmkIDv.js","/assets/calendar-C4hLiRKZ.js","/assets/calendar-days-DbFSLume.js","/assets/camera-CGjzb29_.js","/assets/categories--I03wYB_.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D0iojsH2.js","/assets/chart-line-qBjL0CQR.js","/assets/chart-pie-Bj9I5Q8f.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-B_y54CT-.js","/assets/chevron-left-DmM-da95.js","/assets/chevrons-up-down-tijVsg4c.js","/assets/circle-C79Lv86_.js","/assets/circle-alert-C10JuVBx.js","/assets/circle-check-big-Rrz1EW6E.js","/assets/circle-dashed-BmqozeqW.js","/assets/circle-minus-BcifY0ee.js","/assets/circle-question-mark-BcMvKaV9.js","/assets/circle-slash-f6VcoTku.js","/assets/circle-user-round-2DF3azB4.js","/assets/cloud-off-I9SZk34s.js","/assets/cloud-upload-BGmLGNh5.js","/assets/compass-88Zb1kiK.js","/assets/concernCategories-BSKs0Eby.js","/assets/corner-down-right-JnHsern1.js","/assets/createLucideIcon-ziX4ebrQ.js","/assets/en-BFa2iQs0.js","/assets/es-Dtgc5NM1.js","/assets/external-link-BkGhiX7W.js","/assets/file-clock-BEE5jL8F.js","/assets/file-exclamation-point-CEUjxdMY.js","/assets/flag-Bm6fk3Pk.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-hUvzPwmE.js","/assets/funnel-B7ataRoj.js","/assets/hash-DJxpTrM4.js","/assets/hourglass-D4sbvfzX.js","/assets/image-C13ZX5Fy.js","/assets/image-off-D0n2ViWy.js","/assets/inbox-CkJLWdRK.js","/assets/index-B-xlMnEH.css","/assets/index-BWB0BqRe.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DPpLEKCH.js","/assets/languages-CVrjTWQ8.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CRHNA7fa.js","/assets/leaderBoard-GlyYvjz-.js","/assets/lightbulb-CBVkJUQf.js","/assets/link-2-GI9cIStu.js","/assets/link-2-off-DHscwFG5.js","/assets/list-ordered-Cf4MKBsR.js","/assets/list-tree-oEB4RUSQ.js","/assets/lock-open-VwWJvtnb.js","/assets/log-in-PXlbAYzP.js","/assets/map-pin-DLyDibzf.js","/assets/marks-CS8LKUQe.js","/assets/minimize-2-BlIEpEai.js","/assets/package-check-fYtQKods.js","/assets/pencil-U-BMTH-t.js","/assets/percent-CNLNaNzU.js","/assets/pin-BIcAHBG3.js","/assets/pin-off-nZ0dBHos.js","/assets/play-B4kx8bW4.js","/assets/plug-zap-CU7Pe6QB.js","/assets/prop-types-RD3fbola.js","/assets/radio-BRnRoeHq.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-CxDiXUa3.js","/assets/repeat-B8TZggO_.js","/assets/ru-dv-f7Dme.js","/assets/save-C9YeroOo.js","/assets/scopeLinks-BPEd55So.js","/assets/scroll-text-CYWZ_tsz.js","/assets/search-x-DV6iRPmg.js","/assets/segments-D5Uiedtv.js","/assets/send-CBAKupjr.js","/assets/settings-2-Bb8ejdlz.js","/assets/shield-I0bIi71G.js","/assets/shield-alert-1aG1BquZ.js","/assets/shield-question-mark-DgtH7E1K.js","/assets/sigma-C8gKdIS_.js","/assets/siren-3vJAn7fp.js","/assets/snowflake-D7yC-BUt.js","/assets/split-DW-c5NG9.js","/assets/square-check-big-DDSXzXET.js","/assets/star-5HCCjG1Z.js","/assets/statusBands-DVBZcBq3.js","/assets/store-9w1z8Y5e.js","/assets/table-2-DJJqeL4V.js","/assets/table-properties-s0kjCSMK.js","/assets/tag-CaDcCeRU.js","/assets/timer-off-CiJvSgg9.js","/assets/translations-BXEL1p1I.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-CZc3PRgy.js","/assets/trending-up-BhNplbAv.js","/assets/undo-2-Cn74QhtP.js","/assets/useChartTheme-BLCxf5Js.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-DTrcdN-J.js","/assets/useStatusBands-TUP548x_.js","/assets/useUrlScope-DtZlm5yW.js","/assets/user-L4Bpure_.js","/assets/user-cog-DljPKjIi.js","/assets/user-minus-BHwNCiMo.js","/assets/users-D8cZBO5k.js","/assets/uz-DGMuP2P1.js","/assets/uz_cyrl-UkU22qMc.js","/assets/vfx-YDzw2hdd.js","/assets/video-Bjz1pRZO.js","/assets/wallet-BBgNx6Oe.js","/assets/warehouse-a8WFPVyx.js","/assets/workflow-BauFu6bf.js","/assets/x-BKHa9QTM.js","/assets/zap-BYFA4Lcv.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
