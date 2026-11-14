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

const BUILD = "2026-11-14T12:52:14.268Z";
const PRECACHE = ["/","/assets/ActionHistory-B0_UBbVm.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-DYemlbFZ.js","/assets/AiKeys-u42jDR8w.js","/assets/AnalysisBoard-B8t_q6U6.js","/assets/ApiAccess-pOHmoPkx.js","/assets/AppLauncher-DSw7iL3G.js","/assets/Arc-Dz6yr4Ms.js","/assets/Assessment-BeGYwSdp.js","/assets/AssessmentGrade-sZ_E6XxP.js","/assets/AssessmentList-Bl__hH7z.js","/assets/Assistant-WSspiQin.js","/assets/AttendanceCleanup-C_e3sAw_.js","/assets/AttendanceUpload-DxXD5Fkn.js","/assets/AuditTable-BIk-qPB8.js","/assets/BrigadirProfile-Cz_-zckv.js","/assets/BrigadirsKpi-BGFLYyVy.js","/assets/Broadcast-BH6hbd3k.js","/assets/BroadcastReceivers-VywEbbmw.js","/assets/BroadcastRecord-Bfrac6Er.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-B5bJaOiQ.js","/assets/CategoryLegendModal-saipyWHt.js","/assets/CellConcerns-BE-6tGmy.js","/assets/CellDetails-BG3l9QyU.js","/assets/CellFormModal-P0SlaXHB.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-DbkjTT_T.js","/assets/Cells-6YGmXsWQ.js","/assets/ColumnFilter-CmU0tShe.js","/assets/ColumnsPicker-ChwXlPY2.js","/assets/CommentsModal-B3wp0vit.js","/assets/ComparisonTable-BLvs1NiA.js","/assets/Concerns-BbgziGr7.js","/assets/ConcernsPieces-itnabSgT.js","/assets/ContainerFlow-BXNWBK2b.js","/assets/ContainerTotalsCard-CNE2o7RG.js","/assets/Containers-CXp8AQu2.js","/assets/CountStepper-cYybxnm5.js","/assets/Daily-DsPYIrcN.js","/assets/DataSources-B8JDVs-C.js","/assets/DataTable-C8yoUCL2.js","/assets/DateRangePicker-BVVoFnxL.js","/assets/DayReportView-CjSevFdw.js","/assets/DayStepper-Djy1XsuB.js","/assets/DayStrip-D7JD6Ddn.js","/assets/DbBackup-1LCM81IV.js","/assets/DifferenceBreakdown-BNdaWSov.js","/assets/DocAudit-Rq3UoXTN.js","/assets/Downtime-K15OTfy_.js","/assets/Education-D4lV-9ux.js","/assets/EducationLesson-Di4rqc0R.js","/assets/EmptyState-DNW85tPT.js","/assets/Exam-DfgDEbYJ.js","/assets/ExamAdmin-C8OTwd-U.js","/assets/Factories-DiS8t5kA.js","/assets/FactorySelect-kQupjQwY.js","/assets/Gamification-b9s68BYk.js","/assets/GroupBadge-B97ctbWT.js","/assets/HeatmapChart-CE9k7XZn.js","/assets/HourlyContainers-Bg-XqbxU.js","/assets/IdleCell-C8ClUkAC.js","/assets/IdleOwners-BWH3_3cv.js","/assets/IdleSolutions-DfU-xFM8.js","/assets/IdleSource-BkjKL7yv.js","/assets/KPICard-Bv5IsVJs.js","/assets/Kaizen-B8qT5iBl.js","/assets/Kelish-CPxiy5eS.js","/assets/Kitchen-NcSexmUh.js","/assets/KpiBits-3NNl4C5m.js","/assets/KpiDeltaCard-BIdONUI0.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-DLB1qwNr.js","/assets/LeaderAppeal-DMzJ5tyC.js","/assets/LeaderCutoffs-Dh8ucGTb.js","/assets/LeaderDailyTasks-CL7x-Xn0.js","/assets/LeaderDayExclusions-l9B9SyuO.js","/assets/LeaderDayReport-BMXVmn7m.js","/assets/LeaderTasksAdmin-B0x-iSPi.js","/assets/LeaderUnitReport-moBb5Syf.js","/assets/Leaderboard-C2e-YmZp.js","/assets/Leaders-D1OJ1T6y.js","/assets/LeadersKpi-CgccF9vN.js","/assets/Lightbox-CYQo5AY9.js","/assets/LiveOverview-DELkdvGt.js","/assets/Login-DfCzk5IY.js","/assets/Logs-D7Mm6vEq.js","/assets/LostWorkers-wIHgD30f.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-C8QBqW1Y.js","/assets/Notifications-DdsqxtyE.js","/assets/NotionTasks-BRZiP477.js","/assets/NotionTrackerSettings-DdoqgG-x.js","/assets/Ontime-BD2dIs76.js","/assets/OrgChart-Cvye8CTq.js","/assets/Ovens-CqdblrC_.js","/assets/OvensSettings-Bn8ihPwk.js","/assets/Overview-CVKt8KpC.js","/assets/OwnerChip-NNnEJ2dM.js","/assets/PageAccess-pQuCg1i6.js","/assets/Pagination-BFiOG0TS.js","/assets/People-CQkaro22.js","/assets/PerenaladkaFactTable-OkiGs5Xe.js","/assets/Permissions-B4U5BgSD.js","/assets/PersonCard-ByUhU6sx.js","/assets/PlanFulfillment-ML-o0as-.js","/assets/Production-CSklOLmh.js","/assets/ProductionUpload-Cde8M4i7.js","/assets/Profile-Dkjz25qY.js","/assets/ProfileAvatar-BpxsQe8M.js","/assets/ProfilesManagement-DAYugfum.js","/assets/ProofCamera-BxqXDpuF.js","/assets/ProofPhoto-DiyZe49G.js","/assets/Quality-DYbOJYB_.js","/assets/RawRows-D3wWLxzF.js","/assets/Reports-D_6O0SL4.js","/assets/RequestStateChip-CCmbd5--.js","/assets/RichTextEditor-BPPvjY5V.js","/assets/SaveState-D2w4lFtw.js","/assets/SearchInput-CHmKuVkB.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-Chh7KCSb.js","/assets/ShiftDaily-4cafsm-M.js","/assets/ShiftTimes-DZLMGcLU.js","/assets/Staff-CNZO5v3Y.js","/assets/StaffListAtCheck-alIFQMU9.js","/assets/StatusBadge-yTi-1ntl.js","/assets/StatusBandsModal-BO_ZbNzQ.js","/assets/TargetGoal-BFoAc4b-.js","/assets/Targets--X_IQyP8.js","/assets/TaskerSettings-BjHqEA7J.js","/assets/Tasks-Cbp6xmUh.js","/assets/TgProfile-BQDANkx8.js","/assets/TimeWheelPicker-BQb86sdc.js","/assets/Tooltip-BGAB8aN-.js","/assets/TranslationsEditor-BbmCKj0N.js","/assets/TrelloAnalytics-CsN1fk6f.js","/assets/TrelloSettings-BxuDK0vf.js","/assets/TrendChart-_fSRBgJs.js","/assets/TripleSpeedometer-CgQ9WP2-.js","/assets/Trudoyomkost-CISGxIC0.js","/assets/UploadDropzone-DCMwLbo5.js","/assets/UsersActivity-BXNaQOr0.js","/assets/UsersManagement-KvoBj6Rj.js","/assets/VerdictBlock-CStzh9bV.js","/assets/VerifixParity-C4FXxq9z.js","/assets/VerifixSettings-DVNCE0Wr.js","/assets/VerifixSync-BgxaiMCN.js","/assets/VfxApiMap-DeYUc4Sq.js","/assets/VfxDictionaries-mH7Dw4Qw.js","/assets/VfxEmployees-lld4TlUb.js","/assets/VfxHrMoves-DsJ0NW36.js","/assets/VfxJobs-CCGT2b1P.js","/assets/VfxPhoto-BF2GDTN7.js","/assets/VfxShifts-C9dkcoPM.js","/assets/VfxState-BpOJoxU5.js","/assets/VfxTimebooks-BfKKA8r4.js","/assets/VfxTimesheet-mhVAgjeK.js","/assets/WatchProgress-CLUG1hOd.js","/assets/WebLogin-D5LfS72d.js","/assets/WorkersAttendance-B5XQyobG.js","/assets/WorkersComposition-XT2waWcl.js","/assets/WorkersMovements-rv1AVC6a.js","/assets/WorkersPage-CFe63ZCd.js","/assets/Zagruzka-CiMwv9vk.js","/assets/ZagruzkaCell-BSOFUP-s.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DkV9lVWy.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-DDuh_Tig.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BT7lgCi1.js","/assets/broadcastTree-Bm2nIyAj.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-Ps84i2cB.js","/assets/cellMoveRefusal-Clm5PKeT.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-qCXdAPo3.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-6ePBuvGL.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BPH3gD-I.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CKrbMek7.css","/assets/index-CQNgmSko.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BV9XE2Rx.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-D1o34nQu.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-D8JvzMUI.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BEI7C0qr.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-KgAg7EKC.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CEOG1as2.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-OqxhRW9Y.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Bh9U7S2B.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-kvxtPh7w.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-Bq3l2NT6.js","/assets/useOpenParam-DWTiaPEd.js","/assets/useStatusBands-NNqgT0yn.js","/assets/useUrlScope-BgHQnih8.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-D4-UeoPE.js","/assets/uz_cyrl-c31Ku8s1.js","/assets/vfx-BcfwBo6g.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-E9gqFg2G.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
