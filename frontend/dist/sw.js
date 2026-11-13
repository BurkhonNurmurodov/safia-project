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

const BUILD = "2026-11-13T18:17:16.982Z";
const PRECACHE = ["/","/assets/ActionHistory-BhAUO4hM.js","/assets/ActionMenu-DbWiby4f.js","/assets/AdminPage-KvtxabYN.js","/assets/AiKeys-WotVkuRg.js","/assets/AnalysisBoard-B9rGRHEf.js","/assets/ApiAccess-BsiwDjFG.js","/assets/AppLauncher-B8fGIQg0.js","/assets/Arc-lUW5Az0n.js","/assets/Assessment-DHIIUrGG.js","/assets/AssessmentGrade-zCLBHf7u.js","/assets/AssessmentList-PmDTdtMd.js","/assets/Assistant-CCwZA8Op.js","/assets/AttendanceCleanup-B7eUT8OJ.js","/assets/AttendanceUpload-4BBDml_O.js","/assets/AuditTable-QDuJzOUV.js","/assets/BrigadirProfile-Doc_hveu.js","/assets/BrigadirsKpi-CI6AuigF.js","/assets/Broadcast-B2Z0QAEe.js","/assets/BroadcastReceivers-jU_EdrT-.js","/assets/BroadcastRecord-bDlBDrYb.js","/assets/Button-BkqO76fy.js","/assets/CatLockNotice-DF6qdzyV.js","/assets/CategoryLegendModal-kn5Ruba_.js","/assets/CellConcerns-WpbJC4t3.js","/assets/CellDetails-Dfx3fDlf.js","/assets/CellFormModal-C9D4Gb6C.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-2FEnRcdp.js","/assets/Cells-P1E0U5aY.js","/assets/ColumnFilter-1JC918EA.js","/assets/ColumnsPicker-Csjfs-WA.js","/assets/CommentsModal-CFU7b8CU.js","/assets/ComparisonTable-sunCxhWC.js","/assets/Concerns-CJ1hrNxq.js","/assets/ConcernsPieces-CkK8J7ZB.js","/assets/ContainerTotalsCard-RPIZ4WTU.js","/assets/Containers-Dwq-VPCS.js","/assets/CountStepper-BE5yqEDi.js","/assets/Daily-C-JkySv0.js","/assets/DataSources-DOdx-Ty7.js","/assets/DataTable-D9nIIZLN.js","/assets/DateRangePicker-G3VVJlEZ.js","/assets/DayReportView-tJefRGtl.js","/assets/DayStepper-DfTkEDZk.js","/assets/DayStrip-HBgc36Js.js","/assets/DbBackup-D2FCAu94.js","/assets/DifferenceBreakdown-ky0cgm8R.js","/assets/DocAudit-t2en4_9r.js","/assets/Downtime-BnOJOEuF.js","/assets/Education-7B6PkXqg.js","/assets/EducationLesson-XIlGBmtX.js","/assets/EmptyState-CGrhVQ0v.js","/assets/Exam-B4-0AozY.js","/assets/ExamAdmin-PYC3MBDs.js","/assets/Factories-c6oi1zqO.js","/assets/FactorySelect-BevTfNWj.js","/assets/Gamification-Bor5_8uS.js","/assets/GroupBadge-BN6GVKu4.js","/assets/HeatmapChart-nYCZDhcT.js","/assets/HourlyContainers-D3GhqLRu.js","/assets/IdleCell-VH5ZvJAC.js","/assets/IdleOwners-WQeGz7XQ.js","/assets/IdleSolutions-BqN-OHHo.js","/assets/IdleSource-BZt1uHLK.js","/assets/KPICard-C9JYVnIv.js","/assets/Kaizen-zXtzO0Vb.js","/assets/Kelish-D9y4GjTD.js","/assets/Kitchen-CxitFA5G.js","/assets/KpiBits-Bn4p1OIQ.js","/assets/KpiDeltaCard-CiY6xI3_.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-Degkoatv.js","/assets/Layout-CVOp5qgo.js","/assets/LeaderAppeal-Bf5Ye8R7.js","/assets/LeaderCutoffs-Bf7DEd1i.js","/assets/LeaderDailyTasks-BOxLA8Bu.js","/assets/LeaderDayExclusions-dj9RhHEr.js","/assets/LeaderDayReport-JI8BZ2cC.js","/assets/LeaderTasksAdmin-D4s3ZnJq.js","/assets/LeaderUnitReport-CAKBK0GQ.js","/assets/Leaderboard-CVLRnSTu.js","/assets/Leaders-rCcdgv7B.js","/assets/LeadersKpi-DcO_pHm5.js","/assets/Lightbox-nrOU3pvG.js","/assets/LiveOverview-CEVyLNCG.js","/assets/Login-DyK-D-rI.js","/assets/Logs-D7Z4RX4w.js","/assets/LostWorkers-nPLqe_La.js","/assets/Meter-4z8qn0bm.js","/assets/NotFound-lJ02KP4L.js","/assets/Notifications-B-SWbTvA.js","/assets/NotionTasks-BvHtE2m4.js","/assets/NotionTrackerSettings-CUAesa1N.js","/assets/Ontime-BRDocWW6.js","/assets/OrgChart-CL1ndJ8_.js","/assets/Ovens-sGq8fBjK.js","/assets/OvensSettings-3CbheXcf.js","/assets/Overview-DcE3fHdV.js","/assets/OwnerChip-BiEm0obi.js","/assets/PageAccess-By-a6dLx.js","/assets/Pagination-BGjItGbV.js","/assets/People-DSPTYQeI.js","/assets/PerenaladkaFactTable-RevbeU6e.js","/assets/Permissions-BTd23r1c.js","/assets/PersonCard-Dvr9rL_f.js","/assets/PlanFulfillment-F8JrqzAt.js","/assets/Production-kbuIjjnX.js","/assets/ProductionUpload-Cnal2sBN.js","/assets/Profile-hUFX3NUG.js","/assets/ProfileAvatar-JBq7Mx2R.js","/assets/ProfilesManagement-BB2k363T.js","/assets/ProofCamera-s-fFuFlq.js","/assets/ProofPhoto-Be7SvQzl.js","/assets/Quality-_7ZpqAbj.js","/assets/RawRows-Dxqkl_tc.js","/assets/Reports-CIRkOsUF.js","/assets/RequestStateChip-BGMV1I0q.js","/assets/RichTextEditor-BfC8QcES.js","/assets/SaveState-B28VOGRs.js","/assets/SearchInput-CerVo5CH.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-By88UJpj.js","/assets/SetupTimes-GrPgiydl.js","/assets/ShiftDaily-DcE20gvW.js","/assets/ShiftTimes---bIPh5b.js","/assets/Staff-DSy4EF5w.js","/assets/StaffListAtCheck-B0fMJ9sL.js","/assets/StatusBadge-CItRNTEG.js","/assets/StatusBandsModal-D8TrbNBI.js","/assets/TargetGoal-Co-OaGb0.js","/assets/Targets-CYKZ7-cH.js","/assets/TaskerSettings-DG8yj6xU.js","/assets/Tasks-BltQWe3p.js","/assets/TgProfile-Dc_S_xxl.js","/assets/TimeWheelPicker-BOIJVHzH.js","/assets/Tooltip-DlEmXYgq.js","/assets/TranslationsEditor-Cf6KubX_.js","/assets/TrelloAnalytics-CPaBT-No.js","/assets/TrelloSettings-C3QZLLyc.js","/assets/TrendChart-DDiIKMde.js","/assets/TripleSpeedometer-CTWgHpb5.js","/assets/Trudoyomkost-CdSDlceb.js","/assets/UploadDropzone-_BqH26cJ.js","/assets/UsersActivity-oNFuMKUn.js","/assets/UsersManagement-CosgMdj_.js","/assets/VerdictBlock-C3ryuOGI.js","/assets/VerifixParity-dWIfViVh.js","/assets/VerifixSettings-C33CNT5H.js","/assets/VerifixSync-DodnMfmO.js","/assets/VfxApiMap-Dg4UpssP.js","/assets/VfxDictionaries-BstYYzPO.js","/assets/VfxEmployees-CXs-ddiw.js","/assets/VfxHrMoves-DrGlUTdi.js","/assets/VfxJobs-agaNLpYr.js","/assets/VfxPhoto-iq1VUIXn.js","/assets/VfxShifts-CIHfe1c_.js","/assets/VfxState-D3eCOTNw.js","/assets/VfxTimebooks-BRbiJ73e.js","/assets/VfxTimesheet-CLGmqqPT.js","/assets/WatchProgress-BRRSBxsG.js","/assets/WebLogin-n9hBRVoK.js","/assets/WorkersAttendance-l-mO8o2C.js","/assets/WorkersComposition-BlkY6f5X.js","/assets/WorkersMovements-Cn9CIZWy.js","/assets/WorkersPage-DohVpuon.js","/assets/Zagruzka-BJ2O3Q01.js","/assets/ZagruzkaCell-BhaXHse9.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Df0kFO7w.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-D0I6fu51.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BOkQjv3E.js","/assets/broadcastTree-D8TtDNSY.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-yD1PteEs.js","/assets/cellMoveRefusal-DAgnupSI.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CB0u_v-s.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Bc2p6NWp.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CEK-aJt5.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-1tAm50E7.css","/assets/index-Bsm_9mxv.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BDOJf08W.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-Ct2B3bLN.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-CAcGON4q.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-Dm_QG3sZ.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-D1VWeXTo.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-KlWMmSAx.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DmlfsaDu.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-FDZX2uYi.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-BVULJK2l.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-p_X9eeMz.js","/assets/useOpenParam-mXtjHZih.js","/assets/useStatusBands-D2V36Pq0.js","/assets/useUrlScope-BN5nTgGJ.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-COsWWMxu.js","/assets/uz_cyrl-CwR-sQCY.js","/assets/vfx-DK9cKNBI.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup--Z-MJiP_.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
