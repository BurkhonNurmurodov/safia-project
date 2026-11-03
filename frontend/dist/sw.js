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

const BUILD = "2026-11-03T06:24:39.288Z";
const PRECACHE = ["/","/assets/ActionHistory-E0t17dfO.js","/assets/AdminPage-Y4lw8G_X.js","/assets/AiKeys-3O186eS5.js","/assets/AnalysisBoard-JtydEu5z.js","/assets/AppLauncher-Bygg-2VD.js","/assets/Arc-B-q0ibpr.js","/assets/Assessment-CsPeyu8C.js","/assets/AssessmentGrade-BYsPq7XI.js","/assets/AssessmentList-k1kxv4L-.js","/assets/Assistant-DDimj5Fw.js","/assets/AttendanceCleanup-7TMSNNNN.js","/assets/AttendanceUpload-BxjwlEv_.js","/assets/BrigadirProfile-B7kkgNVL.js","/assets/BrigadirsKpi-Drvqd7Cb.js","/assets/Broadcast-Dw2O13T9.js","/assets/BroadcastReceivers-CtJ9lpQy.js","/assets/BroadcastRecord-zt9-3Il-.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-B6Crpe5u.js","/assets/CategoryLegendModal-D6d1thqv.js","/assets/CellConcerns-BgGQCog_.js","/assets/CellDetails-Cs4Vs0Er.js","/assets/CellFormModal-8-HFQmB4.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-B5fUIGta.js","/assets/Cells-CvbEu3dz.js","/assets/ColumnFilter-Clz0yT45.js","/assets/ColumnsPicker-CRmJQrnD.js","/assets/CommentsModal-DFGKZHql.js","/assets/ComparisonTable-CCstZYN6.js","/assets/Concerns-Cu-GKanU.js","/assets/ConcernsPieces-C6QvPmcT.js","/assets/CountStepper-Df8KK_Of.js","/assets/Daily-DdVdqw9p.js","/assets/DataSources-Bp8FeBiP.js","/assets/DataTable-XC_BSwkd.js","/assets/DateRangePicker-BSXqhNXV.js","/assets/DayReportView-BoPn1SJy.js","/assets/DayStepper-Dw2IQY6b.js","/assets/DayStrip-9gKzWHlm.js","/assets/DbBackup-Cz4gpJOm.js","/assets/DifferenceBreakdown-C_IJiHkr.js","/assets/DocAudit-Cr_ZGb1L.js","/assets/Downtime-SE8R8Urf.js","/assets/Education-rfc4E3IO.js","/assets/EducationLesson-DV_GUUR-.js","/assets/EmptyState-C_g9VEX3.js","/assets/Exam-CmfS3N5w.js","/assets/ExamAdmin-CE4DkINb.js","/assets/Factories-DRhHguuJ.js","/assets/FactorySelect-BR-jsh0L.js","/assets/Gamification-TU47wP-A.js","/assets/GroupBadge-BA1WaOQq.js","/assets/HeatmapChart-z9-7RWd0.js","/assets/IdleCell-CQXQgzEy.js","/assets/IdleOwners-D21Pf95v.js","/assets/IdleSource-Igfr7G5n.js","/assets/KPICard-21NCh6NQ.js","/assets/Kaizen-N2hrBkoh.js","/assets/Kelish-yzP6fLPJ.js","/assets/KpiBits-CoI0VlxX.js","/assets/KpiDeltaCard-BprGDeUh.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-mJX7xTax.js","/assets/LeaderAppeal-BC0UB4x7.js","/assets/LeaderCutoffs-CNwRjWBz.js","/assets/LeaderDailyTasks-DNVg0Cda.js","/assets/LeaderDayExclusions-CiQ88miL.js","/assets/LeaderDayReport-Bt9KA1NG.js","/assets/LeaderTasksAdmin-NDBhyCkG.js","/assets/LeaderUnitReport-Zjvt2gRL.js","/assets/Leaderboard-CxHShyV_.js","/assets/Leaders-BAlpoMst.js","/assets/LeadersKpi-BY0PLdmR.js","/assets/Lightbox-BugI-eG5.js","/assets/LiveOverview-BLFpAP9i.js","/assets/Login-CemgHVjc.js","/assets/Logs-EeLyPB7K.js","/assets/LostWorkers-Du4PfJOR.js","/assets/NotFound-BQF8CggK.js","/assets/Notifications-D_xzQy5l.js","/assets/NotionTasks-BY8QCoAk.js","/assets/NotionTrackerSettings-D-AAGHwU.js","/assets/Ontime-IilzSDlB.js","/assets/Overview-725LT42C.js","/assets/PageAccess-k7WrHDQU.js","/assets/Pagination-B6P8vKKs.js","/assets/People-BddTlpPs.js","/assets/PerenaladkaFactTable-DjoAWYIM.js","/assets/Permissions-C2tKCxU0.js","/assets/PersonCard-y6eyPXqV.js","/assets/PlanFulfillment-DLJia6Jn.js","/assets/Production-BMteip_X.js","/assets/ProductionUpload-CEK9Gmly.js","/assets/Profile-DqngHEEE.js","/assets/ProfileAvatar-NC5zrvNw.js","/assets/ProfilesManagement-CgfzfWNQ.js","/assets/ProofCamera-B-hAnGE_.js","/assets/ProofPhoto-Cam7jw0E.js","/assets/Quality-D2r2dphL.js","/assets/RawRows-BgVD1uf5.js","/assets/Reports-mLbqiK0J.js","/assets/RequestStateChip-DJhjfVPI.js","/assets/RichTextEditor-S5Y91Pw0.js","/assets/SaveState-DTJMj57e.js","/assets/SearchInput-Bi08pjlk.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-BNWcZSSJ.js","/assets/ShiftDaily-Dw1wlBYl.js","/assets/ShiftTimes-DQXojgpI.js","/assets/Staff-CN_VxMb0.js","/assets/StaffListAtCheck-DFBEoW0j.js","/assets/StatusBadge-D7ZdQ4A6.js","/assets/StatusBandsModal-BNNwJh74.js","/assets/TargetGoal-CPK9Sm3M.js","/assets/Targets-DuE3bj7X.js","/assets/Tasks-CWAikV5u.js","/assets/TimeWheelPicker-5l8DDIBw.js","/assets/Tooltip-BStZkVmG.js","/assets/TranslationsEditor-Bcs2n6fZ.js","/assets/TrelloAnalytics-BcXiN4qF.js","/assets/TrelloSettings-BgNdJXTC.js","/assets/TrendChart-C_1xjHDU.js","/assets/TripleSpeedometer-1tN1MsK3.js","/assets/Trudoyomkost-Dp88NgAF.js","/assets/UploadDropzone-DVsZrn78.js","/assets/UsersActivity-D2K-Sysk.js","/assets/UsersManagement-FVgz8cp3.js","/assets/VerdictBlock-BbeDfFKl.js","/assets/VerifixParity-CXXY7yev.js","/assets/VerifixSettings-CZt0M60f.js","/assets/VerifixSync-B5XbaKhY.js","/assets/VfxApiMap-Yr_a7r3F.js","/assets/VfxDictionaries-C8_f_j1L.js","/assets/VfxEmployees-KHFgWX_o.js","/assets/VfxHrMoves-4gY7RTEj.js","/assets/VfxJobs-BxdYer1_.js","/assets/VfxPhoto-DVkxnJKD.js","/assets/VfxShifts-CMBsXLRd.js","/assets/VfxState--SIRWBEo.js","/assets/VfxTimebooks-BQXqa8ez.js","/assets/VfxTimesheet-CH_MSdBB.js","/assets/WatchProgress-B8ULqzaS.js","/assets/WebLogin-DIuXy0dB.js","/assets/WorkersAttendance-DSHS7yIF.js","/assets/WorkersComposition-DJXemTcS.js","/assets/WorkersMovements-BZm1tPp5.js","/assets/WorkersPage-BR0YU45P.js","/assets/Zagruzka-TMGT2lyF.js","/assets/ZagruzkaCell-BvMVfgHO.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BTLA3rdo.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-mAFA7bnG.js","/assets/broadcastTree-DMXzw8QI.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-CF2zAVRe.js","/assets/cellMoveRefusal-BmRuPUJZ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CN2DWBjP.js","/assets/corner-down-right-DSXOdXzC.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/download-BtnXpzPN.js","/assets/en-D6qim9qN.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Bg2ojOOh.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-NAVsMK9K.css","/assets/index-rH9bo3Oj.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DaIccRRs.js","/assets/lightbulb-a8Qz29R8.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-8kZLaNwH.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DGgBVHXR.js","/assets/repeat-DIs-1u7-.js","/assets/ru-DUKD9qeU.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-CITkFe7R.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-D5e2YI4n.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-kruaNW-H.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-loe0I-k7.js","/assets/useMutation-PIAZD9Pv.js","/assets/useOpenParam-CB1tAyI8.js","/assets/useStatusBands-BJ4RbUb1.js","/assets/useUrlScope-GjT2KJb7.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-CjdhH5Zl.js","/assets/uz_cyrl-sSZ-r3p5.js","/assets/vfx-mAeTe7pG.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-D29J4eDN.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
