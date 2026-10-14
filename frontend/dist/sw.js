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

const BUILD = "2026-10-14T16:43:19.898Z";
const PRECACHE = ["/","/assets/AdminPanel-CPoXv7Gp.js","/assets/AnalysisBoard-kBbnVoxl.js","/assets/Arc-U_ZbPRoo.js","/assets/Assistant-BeD5RCd2.js","/assets/BrigadirProfile-CM6eosjL.js","/assets/BroadcastReceivers-BMEW1AXS.js","/assets/BroadcastRecord-CxyRNCCE.js","/assets/Button-BE0kBmyd.js","/assets/CatLockNotice-ZymAk98w.js","/assets/CategoryLegendModal-Bm_Jfmyv.js","/assets/CellConcerns-U9ujOq43.js","/assets/CellDetails-BRHaJPdr.js","/assets/CellFormModal-CZ9j891s.js","/assets/CellIdent-BkeNh2su.js","/assets/CellLink-DfA1rEFp.js","/assets/Cells-Dt3Qkiry.js","/assets/ColumnFilter-DrPbVw2M.js","/assets/ColumnsPicker-DSHtNBIU.js","/assets/CommentsModal-D5MOS6sD.js","/assets/ComparisonTable-CiVgcW4a.js","/assets/Concerns-CpFH2mZE.js","/assets/CountStepper-BCyPo6N1.js","/assets/Daily-CsI-3dFA.js","/assets/DataTable-D11Aba7w.js","/assets/DateRangePicker-RcrlVeiX.js","/assets/DayReportView-BpP_4Uwa.js","/assets/DayStepper-Bl_4uHGV.js","/assets/DifferenceBreakdown-D30hBdtY.js","/assets/Downtime-BIbs1-ye.js","/assets/Education-C31nltuA.js","/assets/EducationLesson-DYilruRu.js","/assets/EmptyState-Nd30CD1U.js","/assets/Exam-CAGLxfRc.js","/assets/FactorySelect-D6ZC6Db9.js","/assets/Gamification-nKabxXOy.js","/assets/GroupBadge-DcVRXETi.js","/assets/HeatmapChart-BFIzAxIS.js","/assets/IdleCell-DTAiux_y.js","/assets/KPICard-DDtoijCe.js","/assets/Kaizen-ByRZud1w.js","/assets/Kelish-PSMeXybF.js","/assets/KpiDeltaCard-BZBxxw5T.js","/assets/LangTextInput-BnA9YUEa.js","/assets/Layout-C9l17WFq.js","/assets/LeaderAppeal-CvrwXFsZ.js","/assets/LeaderDayReport-S5YWhLPC.js","/assets/LeaderUnitReport-BktkaUsp.js","/assets/Leaderboard-DY9DB9xL.js","/assets/Leaders-BVAYFDmt.js","/assets/Lightbox-D0wftSNT.js","/assets/LiveOverview-D6QsLcsc.js","/assets/Login-DImLcplS.js","/assets/NotFound-C5E3ttHR.js","/assets/Notifications-D_MWyHvf.js","/assets/Overview--Qv7xAW0.js","/assets/Pagination-D1NfJ6_A.js","/assets/PerenaladkaFactTable-DFIMBFwf.js","/assets/PersonCard-DWNVnING.js","/assets/PlanFulfillment-Dak2bYae.js","/assets/Production-vPzvldb8.js","/assets/Profile-CpWVviqs.js","/assets/ProofCamera-Bv4gVsLE.js","/assets/Quality-B917nAvw.js","/assets/RawRows-7xuTUQeV.js","/assets/RequestStateChip-DZVzubQK.js","/assets/RichTextEditor-DBQAQd6f.js","/assets/SaveState-5v09-SJ-.js","/assets/SearchInput-D2R3tiK3.js","/assets/SeasonalityHeatmap-BsmdYFNJ.js","/assets/SegmentedToggle-D5kiCkLa.js","/assets/SetupTimes-BdWd-ksM.js","/assets/ShiftDaily-CvLx7Sh8.js","/assets/Staff-D0yMetWw.js","/assets/StaffListAtCheck-D9Je4gd_.js","/assets/StatusBadge-Cl969c9Q.js","/assets/TargetGoal-D1p9tXWv.js","/assets/Targets-BkUpqUKI.js","/assets/Tasks-CXqNRWhp.js","/assets/TimeWheelPicker-zVBJ4IXP.js","/assets/Toast-BM50s7X7.js","/assets/Tooltip-IgLc5aZv.js","/assets/TrendChart-BkG83e1A.js","/assets/TripleSpeedometer-B7aASimT.js","/assets/Trudoyomkost-DRBcK4km.js","/assets/Turnover-wF3JR5ZY.js","/assets/UploadDropzone-CS9k4p32.js","/assets/UsersActivity-1oGtcuZs.js","/assets/VerdictBlock-BFhGUcqX.js","/assets/VfxApiMap-ZXS0zPfh.js","/assets/VfxDictionaries-DKiF_eUN.js","/assets/VfxEmployees-DZQ6TIaC.js","/assets/VfxHrMoves-Bl9yub7O.js","/assets/VfxJobs-CVELGD6f.js","/assets/VfxPhoto-BIOAbcrw.js","/assets/VfxShifts-Bh1PGQzB.js","/assets/VfxState-_HFy1jun.js","/assets/VfxTimebooks-mAvvIb1u.js","/assets/VfxTimesheet-BQG8WLVO.js","/assets/WatchProgress-Dcn41Scr.js","/assets/WebLogin-Bt8hvRMM.js","/assets/WorkerConcerns-BM9UuJB4.js","/assets/Workers-DIKDBwZX.js","/assets/Zagruzka-DssATq7w.js","/assets/ZagruzkaCell-Dy0EKmSX.js","/assets/api-6aXA1ISz.js","/assets/archive-restore--bjthML1.js","/assets/archive-w8QmBLRG.js","/assets/arrow-down-B_mnLtbP.js","/assets/arrow-down-wide-narrow-ObFJQ-ST.js","/assets/arrow-up-narrow-wide-C_CY2xeB.js","/assets/award-C-np2vSx.js","/assets/ban-Bimx7J0_.js","/assets/boxes-mvA7cQ_w.js","/assets/braces-Dfp4iIwv.js","/assets/brigadirFilters-B-zgMq1K.js","/assets/broadcastTree-b7lecloe.js","/assets/building-2-sFzO4ScN.js","/assets/calculator-wTFJ8_QH.js","/assets/calendar-DF6QphCy.js","/assets/calendar-days-DJIW7k0v.js","/assets/camera-BBLNiQP1.js","/assets/categories-CUTvwnHM.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BdyHh7Fg.js","/assets/chart-line-DR31fRCB.js","/assets/chart-pie-BcaJHIl0.js","/assets/chartRange-F9Ubg2Vk.js","/assets/check-check-D_IlLmKy.js","/assets/chevron-left-TI2BFOrm.js","/assets/chevrons-up-down-Bh75a9E5.js","/assets/circle-B3Dd8CaD.js","/assets/circle-alert-Dv7saqJr.js","/assets/circle-check-big-D6bOOKzf.js","/assets/circle-dashed-CXE-w7Tx.js","/assets/circle-minus-DL3kv9lR.js","/assets/circle-question-mark-D_bCX5Fb.js","/assets/circle-slash-JiCiYlgk.js","/assets/circle-user-round-BuLD4sl6.js","/assets/clock-3-SJ6evASn.js","/assets/cloud-off-DvtNLgbw.js","/assets/cloud-upload-DDJOVT47.js","/assets/compass-D_oKOrvd.js","/assets/concernCategories-BoB066Oj.js","/assets/copy-ByiBgkye.js","/assets/corner-down-right-BO_xbp42.js","/assets/createLucideIcon-B-8aktUP.js","/assets/es-C_0pI1wF.js","/assets/external-link-Bz9Bl9cj.js","/assets/file-clock-DYIO7DY6.js","/assets/file-exclamation-point-Cfd4La58.js","/assets/flag-7kQ8Lmvq.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C0xn8Ebk.js","/assets/hash-B3rovbQv.js","/assets/hourglass-1873rC5P.js","/assets/image-Cs3_a35J.js","/assets/image-off-CpIp7SiB.js","/assets/inbox-DeiCs4DM.js","/assets/index-Cj8zylWy.js","/assets/index-oN3ajqAx.css","/assets/keyboard-8JPwxj7r.js","/assets/languages-C7joekd8.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-JPlK8D1-.js","/assets/lightbulb-CDO7fRg3.js","/assets/link-2-BA0Ep-QB.js","/assets/link-2-off-C5wP26Xv.js","/assets/list-ordered-DGxTdL34.js","/assets/list-tree-GD00ku3k.js","/assets/lock-open-Ze0iZ13g.js","/assets/log-in-BH6iWcmi.js","/assets/marks-B1nRFdnb.js","/assets/minimize-2-Cwvh2mDL.js","/assets/package-check-BB0CAx0n.js","/assets/pencil-CA3k62sx.js","/assets/percent-uJTzHbMH.js","/assets/pin-DsCvOZ76.js","/assets/pin-off-CGiIwPrp.js","/assets/play-B9f_93qk.js","/assets/plug-zap-BW2Ifwcf.js","/assets/prop-types-Cclul0G3.js","/assets/radio-DKHPh7Ma.js","/assets/react-apexcharts.esm-Ck-RRerY.js","/assets/registers-DEYrxm0N.js","/assets/repeat-shMm5Bw-.js","/assets/save-mjGxXHlR.js","/assets/scopeLinks-BNteXb0I.js","/assets/scroll-text-p3k8ErYL.js","/assets/search-x-3xuy6K_Y.js","/assets/segments-CpYlhDYQ.js","/assets/send-Cf_QiqXi.js","/assets/settings-2-BeR2knn4.js","/assets/shield-Cytui1vg.js","/assets/shield-alert-BGz8uEBo.js","/assets/shield-question-mark-DB09X4TN.js","/assets/siren-CqAQ7y0V.js","/assets/snowflake-Dr1t1rKJ.js","/assets/split-BmeAylDh.js","/assets/square-check-big-Cd4AR2Hz.js","/assets/star-3prGQnub.js","/assets/statusBands-C4uG6t3m.js","/assets/store-CA5yGL28.js","/assets/table-2-D7DoCnuY.js","/assets/table-properties-DdeYSNnG.js","/assets/tag-r3U7WYsz.js","/assets/timer-off-CMAWkL_Z.js","/assets/trending-down-Bx8kuDkz.js","/assets/trending-up-BWss-DPe.js","/assets/undo-2-B3y1D8u4.js","/assets/useChartTheme-BstfgeQ9.js","/assets/useElementWidth-Dn-7UFBO.js","/assets/useIsMobile-fF2iI5o6.js","/assets/useOpenParam-FK-R8nlH.js","/assets/useStatusBands-iYJG1CFb.js","/assets/useUrlScope-EuusuKil.js","/assets/user-bPuFf1Do.js","/assets/user-cog-DE6A7R9g.js","/assets/users-4_WWJo_M.js","/assets/vfx-BW6BfkIs.js","/assets/video-DZebhiYA.js","/assets/wallet-Cjo9Zts-.js","/assets/warehouse-Ydtfjz7R.js","/assets/workflow-Ci8MJwl3.js","/assets/x-B0unrWQD.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
