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

const BUILD = "2026-10-31T11:55:12.531Z";
const PRECACHE = ["/","/assets/AdminPanel-D-j05U75.js","/assets/AnalysisBoard-DfZFuLmh.js","/assets/Arc-tmP8kDN7.js","/assets/Assessment-C4RlQtRp.js","/assets/AssessmentGrade-CDIFzMDg.js","/assets/AssessmentList-DE-_x4L0.js","/assets/Assistant-EuctKwKW.js","/assets/BrigadirProfile-zO_lvC95.js","/assets/BroadcastReceivers-Bf09Mk_i.js","/assets/BroadcastRecord-7vcTk59t.js","/assets/Button-Dwzhdw5B.js","/assets/CatLockNotice-um6LtDWa.js","/assets/CategoryLegendModal-Bekhfd8p.js","/assets/CellConcerns-D5itsfqi.js","/assets/CellDetails-DXcnF6DK.js","/assets/CellFormModal-Dcay2CTG.js","/assets/CellIdent-CFQxKXoE.js","/assets/CellLink-BJB8qtAp.js","/assets/Cells-Xb1lnKLl.js","/assets/ColumnFilter-L0VFEiK-.js","/assets/ColumnsPicker-5XQV_3R-.js","/assets/CommentsModal-BoMo639a.js","/assets/ComparisonTable-CJuawIXD.js","/assets/Concerns-BdXMj88f.js","/assets/CountStepper-DwREE5Ui.js","/assets/Daily-BVwFQmGx.js","/assets/DataTable-DqzIRWOP.js","/assets/DateRangePicker-C5-yyua1.js","/assets/DayReportView-BSqVeeoC.js","/assets/DayStepper-By18OOYW.js","/assets/DayStrip-BbjVus4W.js","/assets/DifferenceBreakdown-DrP9pUDc.js","/assets/Downtime-CnmjBqJ-.js","/assets/Education-jFCst5WK.js","/assets/EducationLesson-DGVqgO8O.js","/assets/EmptyState-DoLRFwA0.js","/assets/Exam-jK4X6ogv.js","/assets/FactorySelect-BTi4hvdx.js","/assets/Gamification-DnrZBSEZ.js","/assets/HeatmapChart-CQ2Nh0xi.js","/assets/IdleCell-BL0M_vk5.js","/assets/KPICard-BRgZIKnk.js","/assets/Kaizen-BJlq_2ta.js","/assets/Kelish-DDeTwFAd.js","/assets/KpiDeltaCard-B6W2xY82.js","/assets/LangTextInput-0QC8f9M3.js","/assets/Layout-C-0pEnvc.js","/assets/LeaderAppeal-CDD932v1.js","/assets/LeaderDayReport-BkNWd8b0.js","/assets/LeaderUnitReport-Ne9zy764.js","/assets/Leaderboard-5loR9t-h.js","/assets/Leaders-DDIcqAb9.js","/assets/LeadersKpi-DefsQ1Pr.js","/assets/Lightbox-91FVTyj9.js","/assets/LiveOverview-BeuVTbs3.js","/assets/Login-lENX4jfZ.js","/assets/NotFound-CbQP7AUj.js","/assets/Notifications-DxAGrpZ_.js","/assets/Ontime-DPHySRDE.js","/assets/Overview-BgbMkIAn.js","/assets/Pagination-C1axEav4.js","/assets/PerenaladkaFactTable-BkpnqRao.js","/assets/PersonCard-DooiMjVY.js","/assets/PlanFulfillment-B0jw1Is8.js","/assets/Production-BeTjf1JN.js","/assets/Profile-CutY-SUS.js","/assets/ProofCamera-BP9A6vNm.js","/assets/ProofPhoto-BXBkNM7C.js","/assets/Quality-YCYO3tza.js","/assets/RawRows-JgmVcTGh.js","/assets/Reports-Cag1tsgr.js","/assets/RequestStateChip-JfvMClxu.js","/assets/RichTextEditor-CLQiPWhw.js","/assets/SaveState-DhNO39s9.js","/assets/SearchInput-D4SdKCcY.js","/assets/SeasonalityHeatmap-DtL0Vv_e.js","/assets/SegmentedToggle-CskyJg8U.js","/assets/SetupTimes-BrKVTB4t.js","/assets/ShiftDaily-B-cXl88F.js","/assets/Staff-D_RJ_fv5.js","/assets/StaffListAtCheck-BrTKdMpv.js","/assets/StatusBadge-DNOZYUAg.js","/assets/StatusBandsModal-DT2pfhVL.js","/assets/TargetGoal-C75IPYcj.js","/assets/Targets-YUGrrEtX.js","/assets/Tasks-DmLrQgSz.js","/assets/TimeWheelPicker-_OdQSOIq.js","/assets/Toast-DbsUmF9_.js","/assets/Tooltip-BxCE-fii.js","/assets/TrendChart-e5n0Mr9N.js","/assets/TripleSpeedometer-D-IR8_lY.js","/assets/Trudoyomkost-CNOXXqHk.js","/assets/UploadDropzone-CnQJx1Rl.js","/assets/UsersActivity-DM11zedK.js","/assets/VerdictBlock-CYebJOJw.js","/assets/VfxApiMap-C61Mige3.js","/assets/VfxDictionaries-5Zw3ZfwZ.js","/assets/VfxEmployees-BRyo3d6b.js","/assets/VfxHrMoves-CJOA3giC.js","/assets/VfxJobs-Dg2C7KuQ.js","/assets/VfxPhoto-dR1EyrSr.js","/assets/VfxShifts-BSTwrPwQ.js","/assets/VfxState--CRvWtoC.js","/assets/VfxTimebooks-DDgL2ezp.js","/assets/VfxTimesheet-CJg-gu0J.js","/assets/WatchProgress-DGqvKXrU.js","/assets/WebLogin-BbWvVkV2.js","/assets/Workers-CF6dXXWV.js","/assets/Zagruzka-tT7H8K0a.js","/assets/ZagruzkaCell-DtQRpwQ3.js","/assets/api-BFm7MSgf.js","/assets/archive-DeonxxUV.js","/assets/archive-restore-DLHjfEcc.js","/assets/arrow-down-B5m0aCQi.js","/assets/arrow-down-right-Bsre72yM.js","/assets/arrow-down-wide-narrow-DsFF8Wuv.js","/assets/arrow-up-narrow-wide-D0vDSvYc.js","/assets/ban-CQc8wATu.js","/assets/boxes-BWLYv9S5.js","/assets/braces-Cqp-aZB_.js","/assets/brigadirFilters-DjenBnJT.js","/assets/broadcastTree-BUaPb4ly.js","/assets/calendar-Dan8kh51.js","/assets/calendar-days-Ba56wLNU.js","/assets/camera-BWS8dYav.js","/assets/categories--1U3aJnl.js","/assets/cellMoveRefusal-SiAW4B8w.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-0ol5u-YM.js","/assets/chart-line-D1br8b_n.js","/assets/chart-pie-QSAiwm5J.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-kQhVi_ba.js","/assets/chevron-left-BXZAtLIa.js","/assets/chevrons-up-down-bFDV5Jab.js","/assets/circle-CM_EHTsd.js","/assets/circle-alert-C2cgr-1L.js","/assets/circle-check-big-C-bMIAEA.js","/assets/circle-dashed-CIi8Huav.js","/assets/circle-minus-CnY5L-9L.js","/assets/circle-question-mark-kSZrs1-a.js","/assets/circle-user-round-CVS3vhLA.js","/assets/cloud-off-sYZodIQL.js","/assets/cloud-upload-F_BvGGyf.js","/assets/coins-BaFAuCX5.js","/assets/compass-BGDJKb_e.js","/assets/concernCategories-Chtq__M2.js","/assets/corner-down-right-g-rIDTgi.js","/assets/createLucideIcon-D5J4nBlc.js","/assets/en-CvupmwsE.js","/assets/es-Dtgc5NM1.js","/assets/external-link-B38Dgv8w.js","/assets/file-exclamation-point-Y219wsMC.js","/assets/flag-C1wjWDSm.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-eA2XiJub.js","/assets/funnel-COXHvUmS.js","/assets/hard-hat-D-7cYt-3.js","/assets/hash-k6A7LTq6.js","/assets/hourglass-DTHF0d78.js","/assets/idleTime-CHPnJRpw.js","/assets/image-B5qHBK_a.js","/assets/image-off-CjeS7Bmx.js","/assets/inbox-lfuwFbCC.js","/assets/index-B-ciQR2X.js","/assets/index-CRnComIf.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-GAvVx83y.js","/assets/layers-C_VWWUSo.js","/assets/leaderBoard-e8jRF3sI.js","/assets/lightbulb-C4JyF0P4.js","/assets/link-2-CfuOWqdP.js","/assets/link-2-off-BmmCMN11.js","/assets/list-ordered-DMQWPRV7.js","/assets/list-tree-D8Pk4F1g.js","/assets/lock-open-Bftke5GS.js","/assets/log-in-Ckpi1eru.js","/assets/map-pin-DOiWVef3.js","/assets/marks-74fjn3_z.js","/assets/message-square-text-DCCjmgdP.js","/assets/minimize-2-CHqkCZYN.js","/assets/package-CLC5YxtO.js","/assets/package-check-BmWavnXd.js","/assets/pencil-DeDgqaLe.js","/assets/percent-Dxuy0m5P.js","/assets/pin-l-MH8BYa.js","/assets/pin-off-CSklHF0Q.js","/assets/play-Db1p1Gqm.js","/assets/plug-zap-UJCibFZQ.js","/assets/prop-types-RD3fbola.js","/assets/radio-C8KCtFHT.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-BwpCyrDb.js","/assets/repeat-DziIAxid.js","/assets/ru-C7uLiB73.js","/assets/save-DFw0emtr.js","/assets/scopeLinks-Bc20yJ3G.js","/assets/search-x-BvixPNxx.js","/assets/segments-D5Uiedtv.js","/assets/send-DuPO-16z.js","/assets/shield-DJmVSwpF.js","/assets/shield-alert-C364KRy6.js","/assets/sigma-CuOdUuEN.js","/assets/siren-1BMHdNx0.js","/assets/snowflake-DX2U4dXR.js","/assets/split-C8nSsDie.js","/assets/square-check-big-D-EdIwy2.js","/assets/star-BL5qmow6.js","/assets/statusBands-DVBZcBq3.js","/assets/store-Bx9XNf_e.js","/assets/table-2-DLp-Wop3.js","/assets/table-properties-CjAWjQb1.js","/assets/tag-CaFwxnJC.js","/assets/timer-off-oPkviid5.js","/assets/translations-Z_RWX49L.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-Da_On9Z8.js","/assets/trending-up-Ysn8vgld.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-CtZSx01T.js","/assets/useChartTheme-DvjFQpb4.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-DoMHz2hc.js","/assets/useStatusBands-BSqJDgka.js","/assets/useUrlScope-DdBfiAPJ.js","/assets/user-N4teZM3v.js","/assets/user-cog-DgiBjFIZ.js","/assets/uz-Bbko1iHR.js","/assets/uz_cyrl-BP-1-pzg.js","/assets/vfx-B4i9pkUx.js","/assets/video-CZXFt1np.js","/assets/wallet-DPNQLyeH.js","/assets/warehouse-BbWYFH1f.js","/assets/workflow-C7uNSUbV.js","/assets/x-Dxh7eXJZ.js","/assets/zap-B8BEHjIg.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
