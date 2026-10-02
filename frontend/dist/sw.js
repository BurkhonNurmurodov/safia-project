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

const BUILD = "2026-10-02T11:33:55.744Z";
const PRECACHE = ["/","/assets/AdminPanel-BIoQRknh.js","/assets/AnalysisBoard-89umqHi9.js","/assets/Arc-YokJxAiY.js","/assets/ArcLegacy-9E86aKQy.js","/assets/BrigadirProfile-CjDloBZs.js","/assets/BroadcastReceivers-DBGhilk7.js","/assets/BroadcastRecord-Jd-iNp9T.js","/assets/CatLockNotice-cYMt0c_O.js","/assets/CategoryLegendModal-LRkYVMUN.js","/assets/CellConcerns-CxbmMo40.js","/assets/CellDetails-DECSzLK2.js","/assets/CellFormModal-cK7Bcvp7.js","/assets/CellIdent-XYUtqExl.js","/assets/CellLink-CMOmJTio.js","/assets/Cells-ArtRSPEe.js","/assets/ColumnFilter-DewfCrPW.js","/assets/ColumnsPicker-S91ltLrB.js","/assets/CommentsModal-CeDz7d3p.js","/assets/ComparisonTable-DC_ppohV.js","/assets/Concerns-Cj8zu9l3.js","/assets/ConfirmDialog-DqxCrmCx.js","/assets/Daily-DJxAgb0L.js","/assets/DataTable-D6xKI-S2.js","/assets/DateRangePicker-Bxc9BYBm.js","/assets/DayReportView-CDoEwIek.js","/assets/DayStepper-hjcuximo.js","/assets/DifferenceBreakdown-DSzC1elo.js","/assets/Downtime-C84IqClK.js","/assets/Education-B_aivkql.js","/assets/EducationLesson-ChoId43N.js","/assets/EmptyState-B-SQn3A0.js","/assets/Exam-Dw-M4UF5.js","/assets/FactorySelect-CQwLd7Rr.js","/assets/Gamification-mrErugNq.js","/assets/GroupBadge-B4YHGb-I.js","/assets/HeatmapChart-CLgApr9W.js","/assets/IdleCell-2cdb4B8X.js","/assets/KPICard-BHENNYVN.js","/assets/Kaizen-Bi6Ab6Ig.js","/assets/Kelish-CatM1hrd.js","/assets/KpiDeltaCard-DAXNHGqG.js","/assets/LangTextInput-CCo7yE2E.js","/assets/Layout-wfjZZOlP.js","/assets/LeaderAppeal-DhWLGO2a.js","/assets/LeaderDayReport-BDg5qPXA.js","/assets/LeaderUnitReport-UVmKFL-z.js","/assets/Leaderboard-Bxltq7GJ.js","/assets/Leaders-BDOe4JsE.js","/assets/Lightbox-MXuSOFxK.js","/assets/LiveOverview-DDSNrzb8.js","/assets/Login-bc7rxUjy.js","/assets/NotFound-0Chy0iPB.js","/assets/Notifications-D6deemx-.js","/assets/Overview-DejqUa2Q.js","/assets/Pagination-BMn6jwcQ.js","/assets/PerenaladkaFactTable-BS9CzPjN.js","/assets/PlanFulfillment-CPd35ubA.js","/assets/Production-DLkFEpvg.js","/assets/Profile-DYaB_wxU.js","/assets/ProofCamera-ptu3kFH5.js","/assets/ProofPhoto-Dq94nJhb.js","/assets/Quality-BzwCnb-B.js","/assets/RequestStateChip-BE1c6ZP_.js","/assets/RichTextEditor-COBs8cgF.js","/assets/SaveState-BH8U0q2e.js","/assets/SearchInput-BNLp0nSp.js","/assets/SeasonalityHeatmap-QqQtsSnR.js","/assets/SegmentedToggle-BmPVW-y8.js","/assets/SetupTimes-gys0R7Tl.js","/assets/ShiftDaily-CN3KgHlN.js","/assets/Staff-ef3oEPsH.js","/assets/StaffLive-Dva4UH2Z.js","/assets/StatusBadge-CNI6auTy.js","/assets/TargetGoal-CafWEOhx.js","/assets/Targets-G6gldotK.js","/assets/Tasks-o2igbzBI.js","/assets/TimeWheelPicker-Bo4YEj4r.js","/assets/Toast-Ns4gwLvH.js","/assets/Tooltip-T8BAFT9i.js","/assets/TrendChart-CZmn62Xu.js","/assets/TripleSpeedometer-C6T_Mplh.js","/assets/Trudoyomkost-NsAhRfZK.js","/assets/UploadDropzone-DUmL1deX.js","/assets/UsersActivity-C2s3RmSr.js","/assets/VerdictBlock-D8uKnOlt.js","/assets/WatchProgress-D4Smwe1K.js","/assets/WebLogin-B4_2XCo_.js","/assets/WorkerConcerns-WcK3IqWC.js","/assets/Workers-BlyatAnE.js","/assets/Zagruzka-CR6CeJhJ.js","/assets/ZagruzkaCell-DAvxwx_t.js","/assets/api-DeSTX-B5.js","/assets/archive-Cib80yco.js","/assets/archive-restore-1rab82ck.js","/assets/arrow-down-CJbEZJu6.js","/assets/arrow-left-D-dQG95-.js","/assets/arrow-right-left-B6IseFnm.js","/assets/arrow-up-DOH4ByAY.js","/assets/arrow-up-narrow-wide-B49fhPcj.js","/assets/arrow-up-right-CdGv5iPg.js","/assets/award-CgkZWOXl.js","/assets/ban-5y_26Ygn.js","/assets/bot-DanIf7VM.js","/assets/boxes-B20GFsRL.js","/assets/brigadirFilters-Ck2QnBgh.js","/assets/broadcastTree-FnX4CSIi.js","/assets/building-2-CiPWpvx3.js","/assets/calendar-BjrA0Jh4.js","/assets/calendar-days-DT6oXBqt.js","/assets/calendar-range-Bh-AZCRB.js","/assets/camera-DMVGbk5o.js","/assets/categories-C-eWDN5R.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DezulGjZ.js","/assets/chart-line-Bx6pAqd3.js","/assets/chart-pie-CoEGgPg5.js","/assets/chartRange-BTLyBZRh.js","/assets/chevron-left-CtJTreEL.js","/assets/chevrons-up-down-B7CqCzt1.js","/assets/circle-CvNssxgS.js","/assets/circle-alert-BNDK5O5l.js","/assets/circle-check-big-CCU-z4mH.js","/assets/circle-minus-BSHj0cR-.js","/assets/circle-question-mark-bRQmgJ36.js","/assets/circle-slash-kCchW8Mz.js","/assets/circle-user-round-CXGXEhYe.js","/assets/cloud-off-COE020vl.js","/assets/cloud-upload-B0SN_-Be.js","/assets/compass-CizFkJTW.js","/assets/concernCategories-rWisHN4C.js","/assets/copy-eaw5J33n.js","/assets/corner-down-right-iCsSlMDc.js","/assets/createLucideIcon-m_U5zEFJ.js","/assets/es-D_VjJAtD.js","/assets/exportXlsx-CucWa0YU.js","/assets/external-link-BxzeUt0o.js","/assets/file-clock-BCQIVOHv.js","/assets/file-exclamation-point-BkOUjY8p.js","/assets/file-spreadsheet-B4dR6BTa.js","/assets/file-text-Bt1fWHvr.js","/assets/flag-DMVIE6Hw.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-By9d32JB.js","/assets/hash-CmoYM5yz.js","/assets/history-BWM86U2b.js","/assets/hourglass-C4fdsETF.js","/assets/id-card-BUuz-PUZ.js","/assets/image-BBPDa6yx.js","/assets/image-off-cOOQGC-M.js","/assets/inbox-BTnhb5_m.js","/assets/index-BctiIRrp.css","/assets/index-CgVhigju.js","/assets/key-round-CBPeyyib.js","/assets/keyboard-CUZIsJyV.js","/assets/languages-BhKDRJDx.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DewqAZFG.js","/assets/lightbulb-DdH1kB4G.js","/assets/link-2-B9bBaE8L.js","/assets/link-2-off-CZTmrezD.js","/assets/list-ordered-FRejXBoi.js","/assets/list-tree-D34d4P6e.js","/assets/lock-open-B5197AJ1.js","/assets/log-in-CRTMjgoT.js","/assets/maximize-2-pkwy5VPW.js","/assets/message-square-jfKl946I.js","/assets/minimize-2-CW-ExYNB.js","/assets/package-check-D1_1A2H0.js","/assets/paperclip-CQr3FWjq.js","/assets/pencil-Dzd7DG4H.js","/assets/percent-OxHJ29Ew.js","/assets/pin-BNtB1Yjl.js","/assets/pin-off-BE_1mpJ5.js","/assets/play-CFnD6biy.js","/assets/plug-zap-BAql__KD.js","/assets/presentation-DukWJZnd.js","/assets/prop-types-DpQOt72C.js","/assets/radio-DTeZ_h5q.js","/assets/react-apexcharts.esm-q4q3su8j.js","/assets/repeat-RnqjnW6z.js","/assets/rotate-ccw-CpWxPFLT.js","/assets/rotate-cw-vUSPceuA.js","/assets/save-CoNNn2-1.js","/assets/scopeLinks-CJhXd1pR.js","/assets/scroll-text-C0necCFx.js","/assets/search-x-B5I9Cn-N.js","/assets/segments-CQu3HfWb.js","/assets/send-D6h2SRq0.js","/assets/settings-2-BBkdFnfF.js","/assets/shield-BSYmDNXS.js","/assets/shield-alert-kK6e2gdU.js","/assets/shield-check-CwTujC8M.js","/assets/shield-question-mark-BwbD7iNB.js","/assets/siren-BMRa28dt.js","/assets/snowflake-CSr8V0fM.js","/assets/split-5b5_7l8n.js","/assets/square-BC9sRU0g.js","/assets/square-check-big-Ou-Qi3Hv.js","/assets/star-BZ5D5G-Y.js","/assets/statusBands-DyxMdMAw.js","/assets/store-BYKId124.js","/assets/table-2-DdTq1jhE.js","/assets/table-properties-DTxh4EXa.js","/assets/tag-Cn2xg32O.js","/assets/timer-off-B8HLZ45g.js","/assets/trending-down-0ZkPPqNr.js","/assets/trending-up-DdCzdCJf.js","/assets/undo-2-dRyBvMJj.js","/assets/useChartTheme-CSg29Bsa.js","/assets/useElementWidth-Bb6xMX89.js","/assets/useIsMobile-KLUGIuPd.js","/assets/useOpenParam-DISC3K3b.js","/assets/useStatusBands-BV74ojK3.js","/assets/useUrlScope-JiANEhNq.js","/assets/user-cog-BNFcOT1_.js","/assets/user-dGkMMtvf.js","/assets/user-minus-CBVu2dHw.js","/assets/users-BSB-qQna.js","/assets/video-BQ2PTMQ5.js","/assets/wallet-_j0hsNRh.js","/assets/warehouse-Dl4F1poI.js","/assets/x-DEmdnmBk.js","/assets/zap-odJq9-q2.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
