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

const BUILD = "2026-10-01T07:55:11.186Z";
const PRECACHE = ["/","/assets/AdminPanel-OspKlmzZ.js","/assets/AnalysisBoard-Bd6eoy3U.js","/assets/Arc-BJ0CP6lW.js","/assets/ArcLegacy-DS7_QLZe.js","/assets/BrigadirProfile-Czz85bF_.js","/assets/BroadcastReceivers-B3JnrqzF.js","/assets/BroadcastRecord-CokA_c2K.js","/assets/CatLockNotice-Dg2n28-p.js","/assets/CategoryLegendModal-D1kpkk3q.js","/assets/CellConcerns-DY9GRVNW.js","/assets/CellDetails-H9A6e1CR.js","/assets/CellFormModal-CmZuNp4y.js","/assets/CellIdent-CaYALKiV.js","/assets/CellLink-EgU2SGr4.js","/assets/Cells-Ba_3GxdN.js","/assets/ColumnFilter-B-pochBy.js","/assets/ColumnsPicker-Cn8IlRiA.js","/assets/CommentsModal-CQFzOZiJ.js","/assets/ComparisonTable-BIAyXEyj.js","/assets/Concerns-CjFzPCYQ.js","/assets/ConfirmDialog-CApeBE3z.js","/assets/Daily-CGYMj7jS.js","/assets/DataTable-BBzTRgF9.js","/assets/DateRangePicker-Pz37gG98.js","/assets/DayReportView-DEF_kru9.js","/assets/DayStepper-DkCLuxmT.js","/assets/DifferenceBreakdown-Dcwv7Lid.js","/assets/Downtime--y5uy8tN.js","/assets/Education-BZilQpTE.js","/assets/EducationLesson-Couzgwh-.js","/assets/EmptyState-CZr-vYJn.js","/assets/Exam-CM7uS2dk.js","/assets/FactorySelect-Bn3pHWdk.js","/assets/Gamification-BaOt734N.js","/assets/GroupBadge-D0-pywlz.js","/assets/HeatmapChart-G-dOexh1.js","/assets/IdleCell-1-vQUbqj.js","/assets/KPICard-8c0oxX93.js","/assets/Kaizen-DBwZ11GE.js","/assets/Kelish-DpetNsb0.js","/assets/KpiDeltaCard-CFE93_qW.js","/assets/LangTextInput-D24vKZeb.js","/assets/Layout-Bex2oWW4.js","/assets/LeaderAppeal-DJ_SWAI0.js","/assets/LeaderDayReport-IsS9vV10.js","/assets/LeaderUnitReport-CjEhQnvG.js","/assets/Leaderboard-5P6P9k6O.js","/assets/Leaders-Chn5PQRI.js","/assets/Lightbox-DPVPOmSp.js","/assets/LiveOverview-BufQUmjt.js","/assets/Login-BD0Nm5yM.js","/assets/NotFound-DxfYtk7u.js","/assets/Overview-B4J67QTE.js","/assets/Pagination-CwYTtqOP.js","/assets/PerenaladkaFactTable-B_SShUO8.js","/assets/PlanFulfillment-DQwCWq-R.js","/assets/Production-rUvLHav5.js","/assets/Profile-CWuc61WC.js","/assets/ProofCamera-Dk8wO9sa.js","/assets/ProofPhoto-P6l1eNDN.js","/assets/Quality-BLHqvONC.js","/assets/RequestStateChip-C-wU7YNH.js","/assets/RichTextEditor-BqtHW8wE.js","/assets/SaveState-CGcN9Bvn.js","/assets/SearchInput-CF_YC3SC.js","/assets/SeasonalityHeatmap-N9FI4kZu.js","/assets/SegmentedToggle-hP5JWInF.js","/assets/SetupTimes-6OeQT8Bi.js","/assets/ShiftDaily-DkdA6SqJ.js","/assets/Staff-DzqSIiDz.js","/assets/StaffLive-CAsv5I6t.js","/assets/StatusBadge-DEBtcxAP.js","/assets/TargetGoal-BlXpyRRa.js","/assets/Targets-bpNjMaUt.js","/assets/Tasks-Dap1gNc4.js","/assets/TimeWheelPicker-Dy5c5LMz.js","/assets/Tooltip-BIAxoGQP.js","/assets/TrendChart-QfxfkF2B.js","/assets/TripleSpeedometer-kvmrL9-V.js","/assets/Trudoyomkost-CBPNcvfP.js","/assets/UploadDropzone-UwUaSTAp.js","/assets/UsersActivity-BS25ojs1.js","/assets/VerdictBlock-C0mL0Kel.js","/assets/WatchProgress-CbfUhsP-.js","/assets/WebLogin-Ba2F8UIt.js","/assets/WorkerConcerns-DHDlNDxa.js","/assets/Workers-BJ7yxsf1.js","/assets/Zagruzka-CnWujMv2.js","/assets/ZagruzkaCell-CZ99Zv5E.js","/assets/api-CyAWjwsJ.js","/assets/archive-BZXjlwyY.js","/assets/archive-restore-ClCWLjc1.js","/assets/arrow-down-DQOY_ZQG.js","/assets/arrow-left-B23NF6WO.js","/assets/arrow-left-right-s-g_6eo-.js","/assets/arrow-right-left-bwSHeowb.js","/assets/arrow-up-narrow-wide-DC3RNLpY.js","/assets/arrow-up-right-PxL_G44f.js","/assets/arrow-up-rrigTQTg.js","/assets/award-Db55bJgr.js","/assets/ban-dU3V81Tj.js","/assets/bot-Rxiq1mci.js","/assets/boxes-ad99Ld4d.js","/assets/brigadirFilters-B1wenBGT.js","/assets/broadcastTree-DrQoCdwh.js","/assets/building-2-BkiL8jrm.js","/assets/calendar-clock-Cwelquhl.js","/assets/calendar-days-DkilGAAZ.js","/assets/calendar-qJ-YyOIU.js","/assets/calendar-range-ryHpybh0.js","/assets/camera-zTM6NxtB.js","/assets/categories-DfCl9GBT.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BxPTRu_U.js","/assets/chart-line-CC08gzWu.js","/assets/chart-pie-C-TPc1dA.js","/assets/chartRange-Cg6u3AYP.js","/assets/chevron-left-CvIE7CD-.js","/assets/chevrons-up-down-DaA7kL93.js","/assets/circle-PCPHCOVB.js","/assets/circle-check-big-E_hhrjcD.js","/assets/circle-dot-1nx6y7oK.js","/assets/circle-minus-B9sGkD6c.js","/assets/circle-slash-66hIXrLF.js","/assets/circle-user-round-DYw2efUR.js","/assets/cloud-off-DpQ_OeqO.js","/assets/cloud-upload-BLOK1VE1.js","/assets/compass-BFoBVDgX.js","/assets/concernCategories-Bti_teHi.js","/assets/copy-BQO6B4u1.js","/assets/corner-down-right-lXVib7Kr.js","/assets/createLucideIcon-aniVVwgI.js","/assets/es-DTiV8AT2.js","/assets/exportXlsx-gfdrEx7u.js","/assets/external-link-CwEfiq8o.js","/assets/file-clock-B941hoNs.js","/assets/file-exclamation-point-Dh8znjWK.js","/assets/file-spreadsheet-BcGEV0n8.js","/assets/file-text-Ds9b0KgT.js","/assets/flag-DCgEXD6p.js","/assets/flame-P3egXYVv.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-oQIZAPGb.js","/assets/hash-CKAv0KwR.js","/assets/history-ET96uVsD.js","/assets/hourglass-PPOmRYve.js","/assets/id-card-of1cQ3q7.js","/assets/image-C3gw1g3_.js","/assets/image-off-CNMuNkb3.js","/assets/index-B0BQ418L.js","/assets/index-BHS8Hg0Y.css","/assets/key-round-Dd8804IN.js","/assets/keyboard-CPwW7zBP.js","/assets/languages-xx_yKo8y.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DSQdYHVv.js","/assets/lightbulb-CgXUeQKc.js","/assets/link-2-8tkWte9J.js","/assets/link-2-off-BGZnZcyo.js","/assets/list-checks-DsCIUlAd.js","/assets/list-ordered-CtiJm3-Y.js","/assets/list-tree-CX-4L9qb.js","/assets/lock-open-BvhJzeee.js","/assets/log-in-CFlLaj_i.js","/assets/maximize-2-DKUI6Ymn.js","/assets/message-square-V02nF1tn.js","/assets/minimize-2-BpX1yZqs.js","/assets/package-check-B2IMruKk.js","/assets/paperclip-DtsVN9jb.js","/assets/pencil-BG08TUUi.js","/assets/percent-CK9FtEOx.js","/assets/personName-CogOuS3K.js","/assets/pin-D5Oc1C7u.js","/assets/pin-off-DOLeqHrH.js","/assets/play-CACOkclV.js","/assets/plug-zap-Btxoe5pn.js","/assets/presentation-CLjAq_u0.js","/assets/prop-types-CkzV81i_.js","/assets/radio-BOgnclgG.js","/assets/react-apexcharts.esm-sY3cucJb.js","/assets/repeat-D19yB9mN.js","/assets/rotate-ccw-jGfV18Yz.js","/assets/rotate-cw-DKDvM0qG.js","/assets/save-ClLKMu0v.js","/assets/scale-CET5O0T2.js","/assets/scopeLinks-5INsYG9V.js","/assets/scroll-text-x-Cyd3j3.js","/assets/search-x-CzNjXOAU.js","/assets/segments-DiPYP8aF.js","/assets/send-xPrnNQ3u.js","/assets/settings-2-B1U-z6jE.js","/assets/shield-alert-Djs4vwnw.js","/assets/shield-check-DQ-YyaBA.js","/assets/shield-question-mark-BK-YbGY_.js","/assets/shield-wzSMGdZu.js","/assets/siren-Bje64hQz.js","/assets/snowflake-D789rDq1.js","/assets/split-I-PaWzFS.js","/assets/square-ChqTjP4m.js","/assets/square-check-big-DUK0H6uw.js","/assets/star-BNlLf_V9.js","/assets/statusBands-BAYr33bq.js","/assets/store-nzMtGShF.js","/assets/table-2-aC2J3D5S.js","/assets/table-properties-CGCUki6J.js","/assets/tag-5yoaiWBZ.js","/assets/timer-off-B_59N_7R.js","/assets/trending-down-C_iZSy_C.js","/assets/trending-up-gp9-mF1r.js","/assets/undo-2-ridO14Ig.js","/assets/useChartTheme-DYmxhSWi.js","/assets/useElementWidth-CYBmSWN_.js","/assets/useIsMobile-D1ozio0M.js","/assets/useMutation-DWyGpdH7.js","/assets/useStatusBands-CdvOvU9J.js","/assets/useUrlScope-Ca9fZtB2.js","/assets/user-CMAxcf7M.js","/assets/user-cog-CJrKnfSH.js","/assets/user-minus-DwEuUusv.js","/assets/users-Bo2cvl3v.js","/assets/video-5ZeZdZuQ.js","/assets/wallet-sBMQwA4k.js","/assets/warehouse-Cw8NV8jB.js","/assets/zap-zIOp74CV.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
