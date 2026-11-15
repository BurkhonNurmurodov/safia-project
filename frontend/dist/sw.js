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

const BUILD = "2026-11-15T08:04:18.061Z";
const PRECACHE = ["/","/assets/ActionHistory-BdoDJCYx.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-BQYZD_iK.js","/assets/AiKeys-Dly7wH5L.js","/assets/AnalysisBoard-DGi4FrRJ.js","/assets/ApiAccess-BAacdpGL.js","/assets/AppLauncher-j91mPCQw.js","/assets/Arc-D9nTlccG.js","/assets/Assessment-DmyCxNoe.js","/assets/AssessmentGrade-nRjOWzNU.js","/assets/AssessmentList-DvM-1iEx.js","/assets/Assistant-CwaMlMlc.js","/assets/AttendanceCleanup-DEOCGZOl.js","/assets/AttendanceUpload-BEjm5LcS.js","/assets/AuditTable-CRNcUhQb.js","/assets/BrigadirProfile-BSd6CC4m.js","/assets/BrigadirsKpi-BfYx8mko.js","/assets/Broadcast-B5P5xJ7G.js","/assets/BroadcastReceivers-Bqb5ZGjb.js","/assets/BroadcastRecord-BVtl3ENd.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-DouSxG66.js","/assets/CategoryLegendModal-IjLqXcKS.js","/assets/CellConcerns-B3bGQF1G.js","/assets/CellDetails-DrxVmsTD.js","/assets/CellFormModal-GI1Bgzpp.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-8mJLBVMo.js","/assets/Cells-Bph46sFI.js","/assets/ColumnFilter-Bntnqx0Q.js","/assets/ColumnsPicker-C8-G-FNF.js","/assets/CommentsModal-BUyBgjWD.js","/assets/ComparisonTable-CKVRPYbu.js","/assets/Concerns-R6Okzfxd.js","/assets/ConcernsPieces-d2UjjlmU.js","/assets/ContainerFlow-DFyK9tWs.js","/assets/ContainerTotalsCard-B4KtwoEN.js","/assets/Containers-nKaYPKLF.js","/assets/CountStepper-CvJqYiiC.js","/assets/Daily-BEalfhKC.js","/assets/DataSources-Bb9-SAw2.js","/assets/DataTable-KzCUeK9l.js","/assets/DateRangePicker-BN_nXUeZ.js","/assets/DayReportView-DwpvvorX.js","/assets/DayStepper-COvtbEJ0.js","/assets/DayStrip-BxuVWoLt.js","/assets/DbBackup-BX49aNYI.js","/assets/DifferenceBreakdown-gaXcGk9c.js","/assets/DocAudit-DNfFJ35y.js","/assets/Downtime-B6EeZqSZ.js","/assets/Education-4qjz2ONW.js","/assets/EducationLesson-DYDK6Ly2.js","/assets/EmptyState-FUyxITVi.js","/assets/Exam-BnmABTEE.js","/assets/ExamAdmin-D1L23H5L.js","/assets/Factories-Bqls16Tt.js","/assets/FactorySelect-DMLtHN65.js","/assets/Gamification-CfhLLmzD.js","/assets/GroupBadge-C3oWvNKf.js","/assets/HeatmapChart-wNv9kGmx.js","/assets/HourlyContainers-Vpeypd5c.js","/assets/IdleCell-C707Be_m.js","/assets/IdleOwners-MaDSjPuN.js","/assets/IdleSolutions-ijNwMNJ5.js","/assets/IdleSource-DZyDc4W3.js","/assets/KPICard-BkoUXmcq.js","/assets/Kaizen-C_j5-NpC.js","/assets/Kelish-BDOgeYfz.js","/assets/Kitchen-Cx2z96XV.js","/assets/KpiBits-DVwX-VzI.js","/assets/KpiDeltaCard-Du4jZBFx.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-DTVWHO0m.js","/assets/LeaderAppeal-CackbMgM.js","/assets/LeaderCutoffs-DWGcxYUA.js","/assets/LeaderDailyTasks-BHfTfH4m.js","/assets/LeaderDayExclusions-BYGQjdJ2.js","/assets/LeaderDayReport-D9on7R1g.js","/assets/LeaderTasksAdmin-B7XZ4mdF.js","/assets/LeaderUnitReport-CMzUgII9.js","/assets/Leaderboard-CGTmlgVF.js","/assets/Leaders-o8vpvhjS.js","/assets/LeadersKpi-DsLqZ3ho.js","/assets/Lightbox-BYvnDWFo.js","/assets/LiveOverview-Cjil1sfL.js","/assets/Login-C3d3oPT0.js","/assets/Logs-OpZtnvnA.js","/assets/LostWorkers-C0EgAGkd.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-Br3Uitu9.js","/assets/Notifications-B_M08wBl.js","/assets/NotionTasks-asqkKZu7.js","/assets/NotionTrackerSettings-Cz1doxXJ.js","/assets/Ontime-BGaWIBe_.js","/assets/OrgChart-JE4ahL3U.js","/assets/Ovens-DdaUp702.js","/assets/OvensSettings-CSEj5bcV.js","/assets/Overview-8FbTa_sC.js","/assets/OwnerChip-_Q2dUmy_.js","/assets/PageAccess-Lqnyuv5J.js","/assets/Pagination-EH7ck9sA.js","/assets/People-CGLTmwIg.js","/assets/PerenaladkaFactTable-ke2rmwu9.js","/assets/Permissions-B7g1YF8n.js","/assets/PersonCard-DPUUY9Tc.js","/assets/PlanFulfillment-D-ocQ6tt.js","/assets/Production-CvoEXbK_.js","/assets/ProductionUpload-w_qi5Fx9.js","/assets/Profile-QZt4cMds.js","/assets/ProfileAvatar-GUk7_dwk.js","/assets/ProfilesManagement-DMMK-Ujk.js","/assets/ProofCamera-B8UheGoV.js","/assets/ProofPhoto-DyeZXkU1.js","/assets/Quality-C_0JeTWS.js","/assets/RawRows-yZ6E1QvA.js","/assets/Reports-DzkEb4lM.js","/assets/RequestStateChip-OHY5Pl-t.js","/assets/RichTextEditor-CIsb93JG.js","/assets/SaveState-CbSx2QKD.js","/assets/SearchInput-BAyOTtan.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-9MzaOcec.js","/assets/ShiftDaily-DG1UpJcU.js","/assets/ShiftTimes-CZl8N0BI.js","/assets/Staff-ZwC6kfqp.js","/assets/StaffListAtCheck-BygjvDav.js","/assets/StatusBadge-DkXpXECt.js","/assets/StatusBandsModal-Cda-uYio.js","/assets/TargetGoal-CeJd6D9A.js","/assets/Targets-DcOCuYrA.js","/assets/TaskFormModal-7OpS9HwP.js","/assets/TaskerSettings-B4oXxaBe.js","/assets/Tasks-DPYaqLYo.js","/assets/TgProfile-H0iL6Rpg.js","/assets/TimeWheelPicker-BUwDzwEB.js","/assets/Tooltip-Bxacshus.js","/assets/TranslationsEditor-D4EgkgN8.js","/assets/TrelloAnalytics-xyxGZZ9V.js","/assets/TrelloSettings-Dp9GAikg.js","/assets/TrendChart-BNxjAm3x.js","/assets/TripleSpeedometer-tenH4oQq.js","/assets/Trudoyomkost-BegIylZe.js","/assets/UploadDropzone-DnZL1qpg.js","/assets/UsersActivity-iIwny_9_.js","/assets/UsersManagement-DigKY2iI.js","/assets/VerdictBlock-C2MvBu0n.js","/assets/VerifixParity-CUjPwyUL.js","/assets/VerifixSettings-hSCUokzD.js","/assets/VerifixSync-4iwR98lM.js","/assets/VfxApiMap-BGQ001OJ.js","/assets/VfxDictionaries-Db64L_VU.js","/assets/VfxEmployees-CcXKDoFe.js","/assets/VfxHrMoves-429XDxWJ.js","/assets/VfxJobs-CrXjI6vA.js","/assets/VfxPhoto-uvJq5KJ0.js","/assets/VfxShifts-sZuL3iC1.js","/assets/VfxState-CBOlUAb5.js","/assets/VfxTimebooks-3kvjL8uu.js","/assets/VfxTimesheet-Bi6Otix8.js","/assets/WatchProgress-BTCR8MKa.js","/assets/WebLogin-CNKbhKy6.js","/assets/WorkersAttendance-D4hvT91l.js","/assets/WorkersComposition-2bCPUJ3D.js","/assets/WorkersMovements-CbRqBxz7.js","/assets/WorkersPage-B57G-z3_.js","/assets/Zagruzka-Cn_iUxzm.js","/assets/ZagruzkaCell-BRU_Kjm7.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CVPW9PQI.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-Cywd1OmJ.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-jQakwmwl.js","/assets/broadcastTree-DaqdBRHh.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-o_-xk6BH.js","/assets/cellMoveRefusal-CqVjvNOZ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-JGsrq1EL.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-JaTRsB7Y.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DEdpSRkr.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DhH4L2Jq.js","/assets/index-lcrk4Snb.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BrKEaSVc.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-WaNksa0l.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-C6h6W5Vw.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BiPR5YSu.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-zut6Cs34.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CguTj512.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-Du4cGmCS.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-C-HiMcZY.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DudlTzWj.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-DFl8Eq8z.js","/assets/useOpenParam-DQyhJ4Cn.js","/assets/useStatusBands-DhQW94eb.js","/assets/useUrlScope-BVQwiaef.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DjhRLPrD.js","/assets/uz_cyrl-2bNd3ljS.js","/assets/vfx-F2ZC03E7.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-6WPJQjoI.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
