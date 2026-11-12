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

const BUILD = "2026-11-12T06:09:42.261Z";
const PRECACHE = ["/","/assets/ActionHistory-BnvCZCuL.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-DAGAiV1U.js","/assets/AiKeys-BU1aOHSZ.js","/assets/AnalysisBoard-CXBBhU8x.js","/assets/ApiAccess-DC74Jvku.js","/assets/AppLauncher-Dks6Nxzr.js","/assets/Arc-cRQx0yPb.js","/assets/Assessment-BbtNzRXG.js","/assets/AssessmentGrade-DSUtQQaB.js","/assets/AssessmentList-DOJHgAX4.js","/assets/Assistant-8Am0-zrb.js","/assets/AttendanceCleanup-DiIbEEoz.js","/assets/AttendanceUpload-CX3uJlAy.js","/assets/AuditTable-RRh80KHU.js","/assets/BrigadirProfile-DL4uEhov.js","/assets/BrigadirsKpi-DsxGEwi5.js","/assets/Broadcast-DUhds1hz.js","/assets/BroadcastReceivers-Cnb4aRLL.js","/assets/BroadcastRecord-5bpMqtmF.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-CftAUJcU.js","/assets/CategoryLegendModal-D3eO1_J1.js","/assets/CellConcerns-BJY9t46Z.js","/assets/CellDetails-C2sAJfC7.js","/assets/CellFormModal-CZeEVl_L.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-r90uMiHE.js","/assets/Cells-DSoRfKD_.js","/assets/ColumnFilter-CMMqiNPB.js","/assets/ColumnsPicker-D8TxieRy.js","/assets/CommentsModal-DrgS4T7o.js","/assets/ComparisonTable-CcfcXpIu.js","/assets/Concerns-BwiCc3Mr.js","/assets/ConcernsPieces-BtlZBbYy.js","/assets/CountStepper-BVcqALSs.js","/assets/Daily-BL2lmQTT.js","/assets/DataSources-BV1J2MXu.js","/assets/DataTable-Cq1tud-_.js","/assets/DateRangePicker-BFQFbLnA.js","/assets/DayReportView-DEiGRU44.js","/assets/DayStepper-Ccqy9VWp.js","/assets/DayStrip-DFQuLHFa.js","/assets/DbBackup-DZ6S6sXO.js","/assets/DifferenceBreakdown-E3PnhKY1.js","/assets/DocAudit-BiIXo6wy.js","/assets/Downtime-CVqCciWu.js","/assets/Education-BRMjK4sy.js","/assets/EducationLesson-BWpfYUsT.js","/assets/EmptyState-CgEckwdG.js","/assets/Exam-D0scQDcW.js","/assets/ExamAdmin-Dmlze4Up.js","/assets/Factories-B54ddQbG.js","/assets/FactorySelect-DhzK2D4G.js","/assets/Gamification-BJYvipvV.js","/assets/GroupBadge-ooOzN2kS.js","/assets/HeatmapChart-Cojd74bs.js","/assets/IdleCell-BHdWUQWn.js","/assets/IdleOwners-DfIsU-o_.js","/assets/IdleSolutions-B7HzClsm.js","/assets/IdleSource-B20_NdKV.js","/assets/KPICard-BsyDxPpl.js","/assets/Kaizen-CJeAMY3m.js","/assets/Kelish-C7YjBNLK.js","/assets/KpiBits-x3pSGyVe.js","/assets/KpiDeltaCard-Drrkjn95.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-CGqJ0Goy.js","/assets/LeaderAppeal-DtAqfKfs.js","/assets/LeaderCutoffs-CWk0EwGO.js","/assets/LeaderDailyTasks-Bag9EfV1.js","/assets/LeaderDayExclusions-9awPz0z5.js","/assets/LeaderDayReport-BHuDk_x8.js","/assets/LeaderTasksAdmin-DdvkksDi.js","/assets/LeaderUnitReport-OMLKYtKM.js","/assets/Leaderboard-BLr0w6_6.js","/assets/Leaders-D1dp_T_p.js","/assets/LeadersKpi-BKM0JYuQ.js","/assets/Lightbox-i2XbZV_m.js","/assets/LiveOverview-CncHDQ-R.js","/assets/Login-CykhHD0w.js","/assets/Logs-rHq3cHxu.js","/assets/LostWorkers-DvTfqgpp.js","/assets/NotFound-CnmIwavY.js","/assets/Notifications-DaS_r5Bi.js","/assets/NotionTasks-WjTdCjLS.js","/assets/NotionTrackerSettings-BB4lhM5Z.js","/assets/Ontime-DwsNvxi8.js","/assets/Ovens-BKdaKaI3.js","/assets/OvensSettings-DBQBd2xV.js","/assets/Overview-C8FMrLRq.js","/assets/OwnerChip-DlzDCOLQ.js","/assets/PageAccess-egB3ktgO.js","/assets/Pagination-hvsP132z.js","/assets/People-BV_IkXCk.js","/assets/PerenaladkaFactTable-gdAuTodt.js","/assets/Permissions-ipC9abUQ.js","/assets/PersonCard-BClll7RJ.js","/assets/PlanFulfillment-Cg_jA9GR.js","/assets/Production-D9eomyNa.js","/assets/ProductionUpload-GwMKed8v.js","/assets/Profile-C_PjaOJQ.js","/assets/ProfileAvatar-BysXWDAR.js","/assets/ProfilesManagement-B4zN8haH.js","/assets/ProofCamera-LNyh-uPW.js","/assets/ProofPhoto-DwzD_1n5.js","/assets/Quality-CLPerPzU.js","/assets/RawRows-Ct3ol0TM.js","/assets/Reports-Dmi8kMeU.js","/assets/RequestStateChip-B5e3dcwX.js","/assets/RichTextEditor-bO5MBUue.js","/assets/SaveState-BSYatuZg.js","/assets/SearchInput-BhdcFVsw.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-qjiyvngH.js","/assets/ShiftDaily-B-Ks7JEC.js","/assets/ShiftTimes-Bu7kGq7V.js","/assets/Staff-VAJZbNxh.js","/assets/StaffListAtCheck-OSLCK-La.js","/assets/StatusBadge-CgkoHBqC.js","/assets/StatusBandsModal-B4wE5L0m.js","/assets/TargetGoal-BLEA4PHG.js","/assets/Targets-D3qUU0U8.js","/assets/TaskerSettings-BMVCNnEL.js","/assets/Tasks-Clq6K4Bq.js","/assets/TgProfile-CT8UJUpE.js","/assets/TimeWheelPicker-_wFVE56t.js","/assets/Tooltip-CH5GOx-t.js","/assets/TranslationsEditor-CNs8yr0g.js","/assets/TrelloAnalytics-CeY6Awhz.js","/assets/TrelloSettings--PIfYqSR.js","/assets/TrendChart-Cd4WzkP8.js","/assets/TripleSpeedometer-CzwAorQi.js","/assets/Trudoyomkost-DJo9Uiqz.js","/assets/UploadDropzone-C0Tj9jAM.js","/assets/UsersActivity-B5TKQEv4.js","/assets/UsersManagement-BkrHO-y-.js","/assets/VerdictBlock-B3auz07I.js","/assets/VerifixParity-5io142kI.js","/assets/VerifixSettings-_cusFm0P.js","/assets/VerifixSync-DjT8srvH.js","/assets/VfxApiMap-DZQNJRWO.js","/assets/VfxDictionaries-DHb6ZHCW.js","/assets/VfxEmployees-UbFOhP1u.js","/assets/VfxHrMoves-DOb6QEVK.js","/assets/VfxJobs-DEkubjHn.js","/assets/VfxPhoto-CPMzN_GY.js","/assets/VfxShifts-elRVk4iK.js","/assets/VfxState-DgCOWJA5.js","/assets/VfxTimebooks-DaBNkPK6.js","/assets/VfxTimesheet-DfsGoLyl.js","/assets/WatchProgress-gKpCQbb-.js","/assets/WebLogin-zRsD9kAh.js","/assets/WorkersAttendance-CIzDbv63.js","/assets/WorkersComposition-BRQY2nqH.js","/assets/WorkersMovements-B7GPsyka.js","/assets/WorkersPage-00FIrqMq.js","/assets/Zagruzka-DOqWRaJJ.js","/assets/ZagruzkaCell-CAsUIpZ_.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BigXDwmF.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-lIx2gUu9.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-B_GaH-e4.js","/assets/broadcastTree-NRAgL4dw.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DMFIhpXx.js","/assets/cellMoveRefusal-BMCSiZn7.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-blN4tYIB.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-BEZby7vJ.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-l4QnYq8S.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-pFcS5Mrq.js","/assets/index-wrGK6Zf-.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DCj864PH.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-Cz_I1zhV.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DCmv3R-L.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-_OMj5lYl.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-ulca0MzR.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CJshAmKe.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-Bk3u2q71.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-mp3nPRLF.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-BMduF6jP.js","/assets/useMutation-DzdVvxLB.js","/assets/useOpenParam-Cb7_QuKa.js","/assets/useStatusBands-CXkvFiJH.js","/assets/useUrlScope-B-T86eaK.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-Cf2rxgZY.js","/assets/uz_cyrl-Drsu7oWV.js","/assets/vfx-BZjPGyQ-.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-Bgq7E4wi.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
