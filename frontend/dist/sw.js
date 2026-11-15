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

const BUILD = "2026-11-15T06:39:12.821Z";
const PRECACHE = ["/","/assets/ActionHistory-D0M37IaR.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-Dvtij2Eu.js","/assets/AiKeys-BuTxYbAz.js","/assets/AnalysisBoard-DuL5BzoQ.js","/assets/ApiAccess-DzglZxLG.js","/assets/AppLauncher-ByTta_4i.js","/assets/Arc-B7nhltUe.js","/assets/Assessment-BLelRYzV.js","/assets/AssessmentGrade-CCs-KAS0.js","/assets/AssessmentList-C3xzhFEb.js","/assets/Assistant-BNOGQM7L.js","/assets/AttendanceCleanup-KaEAfQ-b.js","/assets/AttendanceUpload-DFdmKFpG.js","/assets/AuditTable-BBDWeQz8.js","/assets/BrigadirProfile-B3e_twrr.js","/assets/BrigadirsKpi-YRkvpb8k.js","/assets/Broadcast-DPOesnxF.js","/assets/BroadcastReceivers-KWy-7sxU.js","/assets/BroadcastRecord-BfRlcCwX.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-BzelaZSS.js","/assets/CategoryLegendModal-H3hYFMT4.js","/assets/CellConcerns-DrfxVKpE.js","/assets/CellDetails-Ncb7kf1-.js","/assets/CellFormModal-D9TmMdiL.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-CgvVTVs3.js","/assets/Cells-CmHLaar7.js","/assets/ColumnFilter-DL45mAda.js","/assets/ColumnsPicker-ECYlZw0o.js","/assets/CommentsModal-Bi4PUevg.js","/assets/ComparisonTable-CEs0hhoS.js","/assets/Concerns-DjA_Z5Sj.js","/assets/ConcernsPieces-CJ0QFqA3.js","/assets/ContainerFlow-DZBQq-Xg.js","/assets/ContainerTotalsCard-Cx1PHAYg.js","/assets/Containers-CzK_O4iN.js","/assets/CountStepper-C4_dMDT5.js","/assets/Daily-D-T9SnCa.js","/assets/DataSources-BKV_iBkR.js","/assets/DataTable-BBq0ySeq.js","/assets/DateRangePicker-NesMdldf.js","/assets/DayReportView-DlTyHCfN.js","/assets/DayStepper-Cb756Y8i.js","/assets/DayStrip-DU4R-IHd.js","/assets/DbBackup-D1dplOhy.js","/assets/DifferenceBreakdown-DfQty_D2.js","/assets/DocAudit-D7s30TFz.js","/assets/Downtime-Dr7ZWpNE.js","/assets/Education-CYbdzXrR.js","/assets/EducationLesson-C20LqEzY.js","/assets/EmptyState-AMcL663Y.js","/assets/Exam-CRc1ixQh.js","/assets/ExamAdmin-C8O2FOHY.js","/assets/Factories-BqQ6TkF1.js","/assets/FactorySelect-C5Um3I5i.js","/assets/Gamification-DAp962-m.js","/assets/GroupBadge-nZZ-bgzs.js","/assets/HeatmapChart-OqrfaE35.js","/assets/HourlyContainers-DGJpU2Vg.js","/assets/IdleCell-D9P91nmn.js","/assets/IdleOwners-BOK59FOE.js","/assets/IdleSolutions-DZZgzqMe.js","/assets/IdleSource-CjayLAiX.js","/assets/KPICard-3XVVCtNA.js","/assets/Kaizen-BirlLMXz.js","/assets/Kelish-BvsDcM6m.js","/assets/Kitchen-CJ9dgkMB.js","/assets/KpiBits-DqHTVbn6.js","/assets/KpiDeltaCard-BmKEW1oA.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-B50GUCvS.js","/assets/LeaderAppeal-DSDg3OFn.js","/assets/LeaderCutoffs-nX_XF-mH.js","/assets/LeaderDailyTasks-t8QOKd2P.js","/assets/LeaderDayExclusions-n8CncieH.js","/assets/LeaderDayReport-DN5gYoK_.js","/assets/LeaderTasksAdmin-CFGAnJNT.js","/assets/LeaderUnitReport-BIYWII6U.js","/assets/Leaderboard-MHV1qQZ2.js","/assets/Leaders-Bfu7nDyt.js","/assets/LeadersKpi-BPjpdzmB.js","/assets/Lightbox-BIBYQV59.js","/assets/LiveOverview-D_QkXr3B.js","/assets/Login-C8bEJ2fR.js","/assets/Logs-B3mwOiEA.js","/assets/LostWorkers-CEpXwfcW.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound--RZAqwIW.js","/assets/Notifications-DgVY-KYT.js","/assets/NotionTasks-BmwxkZQ7.js","/assets/NotionTrackerSettings-BmTf222q.js","/assets/Ontime-yj1QGtLQ.js","/assets/OrgChart-AXdFmDVj.js","/assets/Ovens-CrG-SRu2.js","/assets/OvensSettings-F8z0z6Ve.js","/assets/Overview-BjwEs_N3.js","/assets/OwnerChip-CWczGdG8.js","/assets/PageAccess-CiBUMwJg.js","/assets/Pagination-BBINn9_p.js","/assets/People-B7wcijAU.js","/assets/PerenaladkaFactTable-DZaQ25yx.js","/assets/Permissions-D5NyBMtn.js","/assets/PersonCard-Bb4xIoKz.js","/assets/PlanFulfillment-VnJ7j-KW.js","/assets/Production-CoXgTt3x.js","/assets/ProductionUpload-Bf0Wz4gN.js","/assets/Profile-Ca8f5bmP.js","/assets/ProfileAvatar-LIKTZe8Z.js","/assets/ProfilesManagement-B9TrxQ3X.js","/assets/ProofCamera-DE4tgPD7.js","/assets/ProofPhoto-BM45ru3A.js","/assets/Quality-CCyf8Kzt.js","/assets/RawRows-Djq-pcqJ.js","/assets/Reports-DGNm5Nih.js","/assets/RequestStateChip-z9qnpVAU.js","/assets/RichTextEditor-B6DdMzUO.js","/assets/SaveState-C9FoLH_o.js","/assets/SearchInput-DQ2uH5Ht.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-CBDW5Fvb.js","/assets/ShiftDaily-CDjWVycp.js","/assets/ShiftTimes-hW8wy79A.js","/assets/Staff-OGQNmGww.js","/assets/StaffListAtCheck-UI_TM97C.js","/assets/StatusBadge-CJmcTExx.js","/assets/StatusBandsModal-CVe2CBHp.js","/assets/TargetGoal-Cw1wCkl8.js","/assets/Targets-BS9EnPYq.js","/assets/TaskFormModal-K447oXg3.js","/assets/TaskerSettings-8gmdsNan.js","/assets/Tasks-DAauy7do.js","/assets/TgProfile-Bqx2X_1B.js","/assets/TimeWheelPicker-CotjO1lr.js","/assets/Tooltip-Br7GXXbp.js","/assets/TranslationsEditor-DaFH_K3I.js","/assets/TrelloAnalytics-BX_Rfvp_.js","/assets/TrelloSettings-DBG5zaDP.js","/assets/TrendChart-CMcFR3nK.js","/assets/TripleSpeedometer-DWXVGbUn.js","/assets/Trudoyomkost-qL_dKnAM.js","/assets/UploadDropzone-BFxSlEs3.js","/assets/UsersActivity-D8Pbpyh1.js","/assets/UsersManagement-MyqepKQa.js","/assets/VerdictBlock-BBJG_Og0.js","/assets/VerifixParity-CwbJw_Rg.js","/assets/VerifixSettings-DApc4kqg.js","/assets/VerifixSync-D3XTdEYG.js","/assets/VfxApiMap-CE4JwDHi.js","/assets/VfxDictionaries-DjaxvIOh.js","/assets/VfxEmployees-CoKOg0QD.js","/assets/VfxHrMoves-BMnDrVzX.js","/assets/VfxJobs-BrPKerAl.js","/assets/VfxPhoto-ubaYPYWy.js","/assets/VfxShifts-XW1W07UN.js","/assets/VfxState-veHx6rS2.js","/assets/VfxTimebooks-DUSH6yE_.js","/assets/VfxTimesheet-BrqcXVlO.js","/assets/WatchProgress-1pqSYbzs.js","/assets/WebLogin-DS4cmRQ8.js","/assets/WorkersAttendance-M4JsDgao.js","/assets/WorkersComposition-BvtzRX-D.js","/assets/WorkersMovements-BebtqcVb.js","/assets/WorkersPage-jOt8PxHA.js","/assets/Zagruzka-BDNn7dvH.js","/assets/ZagruzkaCell-CqL9fkbV.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BDOMZNjA.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-grGC_LIb.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DhK887lY.js","/assets/broadcastTree-cczHWY2T.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-D9m0ISKd.js","/assets/cellMoveRefusal-BoDhsdNt.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BWFLP5D3.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-B7qj5QmE.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-ZSkSP_l8.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BsH_8sse.css","/assets/index-Do_dJ_4D.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-D4FzhNdV.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-KmG5pbbH.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-GIpA8pj6.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DZkhvyOo.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-xVbaXhaX.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-DoS8Qdh_.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CI1_MW1Q.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-tlPsFg0V.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-B8bsy70v.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-I6cv7N_s.js","/assets/useOpenParam-Dtgzzrhl.js","/assets/useStatusBands-4PI8COqj.js","/assets/useUrlScope-B9TXnSX1.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BRCFtug9.js","/assets/uz_cyrl-DdfzRhyt.js","/assets/vfx-BhRjA59X.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-Bj5qbM7z.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
