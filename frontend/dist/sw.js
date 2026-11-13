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

const BUILD = "2026-11-13T12:04:16.127Z";
const PRECACHE = ["/","/assets/ActionHistory-CfwLfpuC.js","/assets/ActionMenu-CQ4NgTmH.js","/assets/AdminPage-3L8rC_Uu.js","/assets/AiKeys-JGHHegZ1.js","/assets/AnalysisBoard-CeCGLVO_.js","/assets/ApiAccess-DFmgXctR.js","/assets/AppLauncher-E1AvNfh5.js","/assets/Arc-Cj6kzoJO.js","/assets/Assessment-BWm5adGn.js","/assets/AssessmentGrade-BhjUobq1.js","/assets/AssessmentList-BBKoyKiq.js","/assets/Assistant-DoXmo0XI.js","/assets/AttendanceCleanup-CiQerWS_.js","/assets/AttendanceUpload-BFhvmmrJ.js","/assets/AuditTable-DGcHUvYq.js","/assets/BrigadirProfile-CbK56ZtH.js","/assets/BrigadirsKpi-A6P7AfgU.js","/assets/Broadcast-DcIEkpXA.js","/assets/BroadcastReceivers-CORPyvFJ.js","/assets/BroadcastRecord-CowHeLcy.js","/assets/Button-BkqO76fy.js","/assets/CatLockNotice-DNN6puxn.js","/assets/CategoryLegendModal-TxbzSWyz.js","/assets/CellConcerns-ehkxNLAV.js","/assets/CellDetails-mJFd7TaK.js","/assets/CellFormModal-1nITaZhV.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-D2nCXvg5.js","/assets/Cells-Db8IDa9c.js","/assets/ColumnFilter-CPUa8BLh.js","/assets/ColumnsPicker-BqINyBNn.js","/assets/CommentsModal-vvE7N4Nk.js","/assets/ComparisonTable-BdkQP_4S.js","/assets/Concerns-Aq0RCHm2.js","/assets/ConcernsPieces-D33Vmpuc.js","/assets/ContainerTotalsCard-J0OgpSd9.js","/assets/Containers-DXakRUdr.js","/assets/CountStepper-ByGccCvu.js","/assets/Daily-BTZXN9M4.js","/assets/DataSources-BqhKEayp.js","/assets/DataTable-CCLRLQH4.js","/assets/DateRangePicker-DxcK516v.js","/assets/DayReportView-ld-PgJUl.js","/assets/DayStepper-CPgy03Q6.js","/assets/DayStrip-BJymGH0w.js","/assets/DbBackup-C08DqzbV.js","/assets/DifferenceBreakdown-Drp9i9sJ.js","/assets/DocAudit-BFgO2Kwq.js","/assets/Downtime-C-yqSZEK.js","/assets/Education-3wIDcLcZ.js","/assets/EducationLesson-Bi4JzSfr.js","/assets/EmptyState-CHeRjdi3.js","/assets/Exam-DAfUbU5z.js","/assets/ExamAdmin-PvYQ4-Me.js","/assets/Factories-tCUtFdOs.js","/assets/FactorySelect-CVjm_h_5.js","/assets/Gamification-CukAZnKm.js","/assets/GroupBadge-H7ZIOcCE.js","/assets/HeatmapChart-CVDrHrGv.js","/assets/HourlyContainers-Bg3K19eu.js","/assets/IdleCell-BYKHgQco.js","/assets/IdleOwners-DBXgCWPI.js","/assets/IdleSolutions-Bx0BwKCT.js","/assets/IdleSource-B-8ZQNfk.js","/assets/KPICard-DdroD0Kl.js","/assets/Kaizen-DEhNI-J6.js","/assets/Kelish-eJeFPr3R.js","/assets/Kitchen-53Jh8n0Q.js","/assets/KpiBits-BydHs3WR.js","/assets/KpiDeltaCard-CU7Njj9V.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CvYTJAne.js","/assets/Layout-CHF_eFrc.js","/assets/LeaderAppeal-yR-LZkiG.js","/assets/LeaderCutoffs-l3_EyjBv.js","/assets/LeaderDailyTasks-CgBayiGx.js","/assets/LeaderDayExclusions-CmGzpmxl.js","/assets/LeaderDayReport-6BPKtLqq.js","/assets/LeaderTasksAdmin-XC4oDGFz.js","/assets/LeaderUnitReport-CYOt1zzO.js","/assets/Leaderboard-BnbCdHHu.js","/assets/Leaders-C6UPD_4y.js","/assets/LeadersKpi-RIBxAUFd.js","/assets/Lightbox-CCW1p9A6.js","/assets/LiveOverview-BSq_p_4U.js","/assets/Login-UA200SXG.js","/assets/Logs-B3CaEQ4J.js","/assets/LostWorkers-BSvJIG4Z.js","/assets/NotFound-DFTvkP-w.js","/assets/Notifications-BsdbPELY.js","/assets/NotionTasks-DGqy5T8h.js","/assets/NotionTrackerSettings-DjJx-1f7.js","/assets/Ontime-D2_T56GN.js","/assets/OrgChart-vLgdtRQE.js","/assets/Ovens-XIrb3mlE.js","/assets/OvensSettings-CF_ZcVS5.js","/assets/Overview-BC3pDPy4.js","/assets/OwnerChip-DBKpehGY.js","/assets/PageAccess-CbzQbufX.js","/assets/Pagination-DZaNkLsL.js","/assets/People-CrpkUPMU.js","/assets/PerenaladkaFactTable-CDy9AF0b.js","/assets/Permissions-812l1png.js","/assets/PersonCard-DNH5VNYg.js","/assets/PlanFulfillment-D2h8c6UF.js","/assets/Production-Bqu-uMZt.js","/assets/ProductionUpload-DbGmd6zF.js","/assets/Profile-NeAmLgiS.js","/assets/ProfileAvatar-B-LjMydJ.js","/assets/ProfilesManagement-CfY4s0Gd.js","/assets/ProofCamera-CTkffZCt.js","/assets/ProofPhoto-DTFip4_H.js","/assets/Quality-BKkqir-P.js","/assets/RawRows-D4wt06fC.js","/assets/Reports-eBNQLPsr.js","/assets/RequestStateChip-DNYSiShR.js","/assets/RichTextEditor-YusLB9ci.js","/assets/SaveState-D3XYH8c7.js","/assets/SearchInput-CV4N7kCV.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-C8myJDPN.js","/assets/SetupTimes-CD2oof3V.js","/assets/ShiftDaily-COQKmeq_.js","/assets/ShiftTimes-D7ilrNOC.js","/assets/Staff-D5a7kuOB.js","/assets/StaffListAtCheck-D8V1eE2i.js","/assets/StatusBadge-evtuOAu5.js","/assets/StatusBandsModal-BncuKaf2.js","/assets/TargetGoal-BI07Oybo.js","/assets/Targets-LPhS0VKj.js","/assets/TaskerSettings-Ben-opA6.js","/assets/Tasks-BeiUDtvY.js","/assets/TgProfile-zcx6qmFh.js","/assets/TimeWheelPicker-DRwP8KDi.js","/assets/Tooltip-BS9QxYx3.js","/assets/TranslationsEditor-CGnkVeWs.js","/assets/TrelloAnalytics-BTAAV_Ry.js","/assets/TrelloSettings-DazUv-Ye.js","/assets/TrendChart-BwPtV_n6.js","/assets/TripleSpeedometer-B2dF_58V.js","/assets/Trudoyomkost-_mSLRVKo.js","/assets/UploadDropzone-Q-VmB28o.js","/assets/UsersActivity-C3ZWKKfb.js","/assets/UsersManagement-CpXOf6ee.js","/assets/VerdictBlock-B8VxI_U9.js","/assets/VerifixParity-DEKnYIpd.js","/assets/VerifixSettings-BYjguRra.js","/assets/VerifixSync-Dald_Q1N.js","/assets/VfxApiMap-BP0M1CM0.js","/assets/VfxDictionaries-Dln--Pxr.js","/assets/VfxEmployees-Dm5rOXPI.js","/assets/VfxHrMoves-Cedy1NKU.js","/assets/VfxJobs-B96oSdoz.js","/assets/VfxPhoto-D69oLVWP.js","/assets/VfxShifts-C-V57Njp.js","/assets/VfxState-SFfF7lno.js","/assets/VfxTimebooks-MHdE5-rt.js","/assets/VfxTimesheet-DRwV0rv3.js","/assets/WatchProgress-BFPyYRxC.js","/assets/WebLogin-9zZOvDpA.js","/assets/WorkersAttendance-1y9dAmEg.js","/assets/WorkersComposition-B4H5vywd.js","/assets/WorkersMovements-M1jJS5DE.js","/assets/WorkersPage-DQlw8ban.js","/assets/Zagruzka-ydThLNBU.js","/assets/ZagruzkaCell-DwuoCvjR.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DfF670Sw.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CiKi9S0K.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-60kfz6ri.js","/assets/broadcastTree-Ctp0dDXz.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-6p1a713M.js","/assets/cellMoveRefusal-Cyc6heH6.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-MEwwPjHy.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-CHo9Bwch.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BTr8nbia.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CHML3Rbs.css","/assets/index-D0dOrGzp.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-C8cXB8Qg.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-d28W0sb0.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-CzSYJeLU.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-Dt88R8fe.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-nwgwu3r0.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-S2qRuR9h.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-C-GMkxtD.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DXvx3Dg3.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-0T3i6Nx0.js","/assets/useLeaveRef-BoNGwfSR.js","/assets/useMutation-DSrlRb-H.js","/assets/useOpenParam-CiNXekhe.js","/assets/useStatusBands-BBH0xf-V.js","/assets/useUrlScope-CFBxwZIb.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BwvJfHIK.js","/assets/uz_cyrl-C9ORASFJ.js","/assets/vfx-DNT7PHcE.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-DkukgAj0.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
