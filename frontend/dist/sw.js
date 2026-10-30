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

const BUILD = "2026-10-30T06:57:45.360Z";
const PRECACHE = ["/","/assets/AdminPanel-ChWn_4t8.js","/assets/AnalysisBoard-B-vd-jXD.js","/assets/Arc-BDdesxWQ.js","/assets/Assistant-BmIkUs-j.js","/assets/BrigadirProfile-CGP_Qhrz.js","/assets/BroadcastReceivers-BaLuhiCL.js","/assets/BroadcastRecord-DtFnAjB7.js","/assets/Button-3sQwLcba.js","/assets/CatLockNotice-CisR_Kpd.js","/assets/CategoryLegendModal-DFHXzX8S.js","/assets/CellConcerns-CLwNkJz8.js","/assets/CellDetails-CDzghTi1.js","/assets/CellFormModal-4bP-xhri.js","/assets/CellIdent-BMwJKG7V.js","/assets/CellLink-DMFdiYQ6.js","/assets/Cells-D7Xj5FTC.js","/assets/ColumnFilter-CMI-v9ko.js","/assets/ColumnsPicker-xu9sFC79.js","/assets/CommentsModal-lYnZHa5v.js","/assets/ComparisonTable-DRzmGu7I.js","/assets/Concerns-UGKAtH6O.js","/assets/CountStepper-B0lE7hlk.js","/assets/Daily-BbB_k0f5.js","/assets/DataTable-C1MvL_4T.js","/assets/DateRangePicker-BADnKJqM.js","/assets/DayReportView-DCbITYPE.js","/assets/DayStepper-CpW-SXvh.js","/assets/DayStrip-CqESkSt6.js","/assets/DifferenceBreakdown-BkLw0vej.js","/assets/Downtime-CWcDv4Nm.js","/assets/Education-CCS3Gsx4.js","/assets/EducationLesson-BHkymGhG.js","/assets/EmptyState-Q4tpF6FD.js","/assets/Exam-S7dkyGeJ.js","/assets/FactorySelect-Df3UJOXy.js","/assets/Gamification-aCfvdcdN.js","/assets/GroupBadge-B1UBGxrs.js","/assets/HeatmapChart-LQ1qwfjt.js","/assets/IdleCell-COb02-Yz.js","/assets/KPICard-Bx_ENjjN.js","/assets/Kaizen-CUYeCUcE.js","/assets/Kelish-DTZNYij2.js","/assets/KpiDeltaCard-BGxdtiHR.js","/assets/LangTextInput-Csa3meE1.js","/assets/Layout-CqXukl6H.js","/assets/LeaderAppeal-CkFjxMFw.js","/assets/LeaderDayReport-DhCNjZ4Z.js","/assets/LeaderUnitReport-SsgknQSR.js","/assets/Leaderboard-Bho0XjTE.js","/assets/Leaders-OSCO5Q0f.js","/assets/LeadersKpi-j9ZUQ4_A.js","/assets/Lightbox-DIL8fovG.js","/assets/LiveOverview-CeaUzlvF.js","/assets/Login-DFP-Y5qW.js","/assets/NotFound-DiWPCWuT.js","/assets/Notifications-DekyhIKN.js","/assets/Ontime-D7E0jtGi.js","/assets/Overview-DhRXI6gN.js","/assets/Pagination-BF83mrhs.js","/assets/PerenaladkaFactTable-Cz8-ip3U.js","/assets/PersonCard-jISWZnCn.js","/assets/PlanFulfillment-CFvrNJVx.js","/assets/Production-D2Q7S1SC.js","/assets/Profile-BVGTmtBT.js","/assets/ProofCamera-DDj3FUWl.js","/assets/ProofPhoto-CbukJE74.js","/assets/Quality-C4Nt0ZWn.js","/assets/RawRows-DOOCuviM.js","/assets/Reports-BvioX6gJ.js","/assets/RequestStateChip-CooI0VN4.js","/assets/RichTextEditor-Cs5pOq4i.js","/assets/SaveState-m91Eis9a.js","/assets/SearchInput-DAL5Jiqg.js","/assets/SeasonalityHeatmap-Dv0lKpil.js","/assets/SegmentedToggle-f2urztgG.js","/assets/SetupTimes-C_ChnN3T.js","/assets/ShiftDaily-DsqmF7bp.js","/assets/Staff-CuV3TGLM.js","/assets/StaffListAtCheck-B9-GA_zw.js","/assets/StatusBadge-GWwk0I6H.js","/assets/StatusBandsModal-BGPJ3Sye.js","/assets/TargetGoal-kGRZX8Ky.js","/assets/Targets-KhfLyQLr.js","/assets/Tasks-g0PYBHrF.js","/assets/TimeWheelPicker-BDAhiuJq.js","/assets/Toast-BlMo3agY.js","/assets/Tooltip-CRmYvxIz.js","/assets/TrendChart-D8E6NBff.js","/assets/TripleSpeedometer-GgjRRByL.js","/assets/Trudoyomkost-CplVybJ4.js","/assets/UploadDropzone-BQWlhiX9.js","/assets/UsersActivity-BRBgvR4I.js","/assets/VerdictBlock-D-gP9CTX.js","/assets/VfxApiMap-B6CQ3wgA.js","/assets/VfxDictionaries-CbsX11X9.js","/assets/VfxEmployees-CrElrAy7.js","/assets/VfxHrMoves-CU-ZvuPn.js","/assets/VfxJobs-F-bXApVq.js","/assets/VfxPhoto-BL6SK7Oq.js","/assets/VfxShifts-DNkEcACI.js","/assets/VfxState-BuFgxcYh.js","/assets/VfxTimebooks-Cf283eBM.js","/assets/VfxTimesheet-CDkM_4sa.js","/assets/WatchProgress-CNlDFgZ9.js","/assets/WebLogin-CjHcx_l5.js","/assets/Workers-DfkhQsP4.js","/assets/Zagruzka-DqpSbvxQ.js","/assets/ZagruzkaCell-D453FU6k.js","/assets/api-BFm7MSgf.js","/assets/archive-B5S5vc7e.js","/assets/archive-restore-DaNrpJtE.js","/assets/arrow-down-DKKCqThX.js","/assets/arrow-down-right-BRBKaBES.js","/assets/arrow-down-wide-narrow-DJQ5swIX.js","/assets/arrow-up-narrow-wide-CFIWQwi7.js","/assets/ban-BbV2OPEc.js","/assets/boxes-DR0a_MnN.js","/assets/braces-B_BtU75n.js","/assets/brigadirFilters-kY-NweQh.js","/assets/broadcastTree-BT6rW4Tt.js","/assets/building-2-Df6o47cX.js","/assets/calendar-CRapMigD.js","/assets/calendar-days-DcdMi46V.js","/assets/camera-DIt4NcIR.js","/assets/categories-BeTZvj87.js","/assets/cellMoveRefusal-qYI2Ao03.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BGnzXMcV.js","/assets/chart-line-CxBbKh3l.js","/assets/chart-pie-CAGgtn0r.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-B_Quyh55.js","/assets/chevron-left-Blhd3p4p.js","/assets/chevrons-up-down-97nCV_nK.js","/assets/circle-DKl_2lNa.js","/assets/circle-alert-CzD5MD_g.js","/assets/circle-check-big-Bt5TzEMs.js","/assets/circle-dashed-BKJlbALw.js","/assets/circle-minus-D1zw4eEQ.js","/assets/circle-question-mark-BmG-rIdp.js","/assets/circle-slash-wD0t31FG.js","/assets/circle-user-round-7-0lXpln.js","/assets/cloud-off-DNPNbjT3.js","/assets/cloud-upload-DloMxo36.js","/assets/coins-WHDRPwy7.js","/assets/compass-DA6lsbUA.js","/assets/concernCategories-DmBcHj-s.js","/assets/corner-down-right-Cmi1mTJE.js","/assets/createLucideIcon-CbrXTY13.js","/assets/en-BVDK3sTK.js","/assets/es-Dtgc5NM1.js","/assets/external-link-DlrMM_0b.js","/assets/file-clock-Bfc2RiSl.js","/assets/file-exclamation-point-DBCyqyxl.js","/assets/flag-CN8dGbIC.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-B9svygwV.js","/assets/funnel-ChVZqerz.js","/assets/hash-BKfDkzJD.js","/assets/hourglass-DOWDi16C.js","/assets/idleTime-CHPnJRpw.js","/assets/image-lBV2llir.js","/assets/image-off-CGd9Y2gL.js","/assets/inbox-BjH9-9CW.js","/assets/index-3Mcd-3cu.js","/assets/index-BtYmuUYW.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-BQwvqS7_.js","/assets/languages-C64BmcP5.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CMKNH6Xf.js","/assets/leaderBoard-DobqP8cQ.js","/assets/lightbulb-Cj3MvBai.js","/assets/link-2-CVfGX5V_.js","/assets/link-2-off-0cvPpUOP.js","/assets/list-ordered-Cf3zsa6E.js","/assets/list-tree-633W3mPf.js","/assets/lock-open-B0n3yeQ_.js","/assets/log-in-i6227jWY.js","/assets/map-pin-DB10GOMX.js","/assets/marks-CFua3lRB.js","/assets/minimize-2-B3t6Omqd.js","/assets/package-check-BTy4qvyq.js","/assets/pencil-KUew3m7Z.js","/assets/percent-BezZIIRC.js","/assets/pin-DWTBAWbM.js","/assets/pin-off-DnY5H7cd.js","/assets/play-DVR7lGph.js","/assets/plug-zap-BBqpq5os.js","/assets/prop-types-RD3fbola.js","/assets/radio-Oog7bij0.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-U3ckwEjX.js","/assets/repeat-BkrDxUkI.js","/assets/ru-CLvf4wTi.js","/assets/save-DkOgDXeq.js","/assets/scopeLinks-Der46qEm.js","/assets/scroll-text-Bh1gri-M.js","/assets/search-x-D4vWICz-.js","/assets/segments-D5Uiedtv.js","/assets/send-ehlypR6L.js","/assets/settings-2-BQQSksHg.js","/assets/shield-Cw6rnJix.js","/assets/shield-alert-BIeMpZJ9.js","/assets/shield-question-mark-eoFPJywo.js","/assets/sigma-B7UoFDqc.js","/assets/siren-yWBQ2mKh.js","/assets/snowflake-BViJ_Hnz.js","/assets/split-Bqztnpp5.js","/assets/square-check-big-CJEK_cxj.js","/assets/star--KwUC7Xc.js","/assets/statusBands-DVBZcBq3.js","/assets/store-BUDESjfL.js","/assets/table-2-DWZ2r5K1.js","/assets/table-properties-BOGDz0Rp.js","/assets/tag-CQJIX9LI.js","/assets/timer-off-C2XTik_f.js","/assets/translations-4hAOLx0h.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-BIfqqvkS.js","/assets/trending-up-DYLtMISx.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-SGsVBzni.js","/assets/useChartTheme-SLBvNZXB.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-CcHZv64A.js","/assets/useStatusBands-CV1XiHlL.js","/assets/useUrlScope-EZxYLtY0.js","/assets/user-B3kZp1l-.js","/assets/user-cog-BGh0Kvyp.js","/assets/user-minus-BKB6thML.js","/assets/users-CS0NmKgq.js","/assets/uz-D4X3_KGf.js","/assets/uz_cyrl-CXMOQugE.js","/assets/vfx-CrUgGlEj.js","/assets/video-Ds_xIQ9B.js","/assets/wallet-DjiSFAjw.js","/assets/warehouse-xDS2T1s7.js","/assets/workflow-C15_t2jM.js","/assets/x-d2tZcwMz.js","/assets/zap-OTHJEvMZ.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
