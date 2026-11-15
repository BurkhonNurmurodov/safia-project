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

const BUILD = "2026-11-15T15:10:32.763Z";
const PRECACHE = ["/","/assets/ActionHistory-BpwQrRS9.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-COhrswNy.js","/assets/AiKeys-CQy3hIjo.js","/assets/AnalysisBoard-CrUR9OUu.js","/assets/ApiAccess-DVMdGzdl.js","/assets/AppLauncher-BvEsskwB.js","/assets/Arc-BbXjMZCW.js","/assets/Assessment-DPvP9jHQ.js","/assets/AssessmentGrade-Cbxek3zI.js","/assets/AssessmentList-EAR0oyTE.js","/assets/Assistant-B1aIIa4Y.js","/assets/AttendanceCleanup-CRNJ2BT_.js","/assets/AttendanceUpload-D_MetGL0.js","/assets/AuditTable-BEd5ZUJQ.js","/assets/BrigadirProfile-8Y6Q4xMK.js","/assets/BrigadirsKpi-CJ81CrAT.js","/assets/Broadcast-DgeXpKa1.js","/assets/BroadcastReceivers-Btu65KDh.js","/assets/BroadcastRecord-C7KHRg3Z.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-CSzje8A1.js","/assets/CategoryLegendModal-BX9SGPGe.js","/assets/CellConcerns-B4FUStgv.js","/assets/CellDetails-Bh6_M2A7.js","/assets/CellFormModal-DWZPTUdu.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-B21GpxAn.js","/assets/Cells-Dzaj_Zfr.js","/assets/ColumnFilter-gFA9kxCE.js","/assets/ColumnsPicker-BMWrO9QK.js","/assets/CommentsModal-Bch6fIbI.js","/assets/ComparisonTable-Ce3sulPa.js","/assets/Concerns-5nxP4Pp8.js","/assets/ConcernsPieces-BQwWqfLV.js","/assets/ContainerFlow-s9RrG2pO.js","/assets/ContainerTotalsCard-DWUh1wQB.js","/assets/Containers-DWjolptK.js","/assets/CountStepper-YIdls0-b.js","/assets/Daily-BGfxaKby.js","/assets/DataSources-B_Y7n0Kt.js","/assets/DataTable-C8ZIYJYg.js","/assets/DateRangePicker-vcXGj4VD.js","/assets/DayReportView-27ZY76ZU.js","/assets/DayStepper-f5_jf3ki.js","/assets/DayStrip-2wUH1J0J.js","/assets/DbBackup-TexyJWiz.js","/assets/DifferenceBreakdown-CODV3FPa.js","/assets/DocAudit-R93Gs7dp.js","/assets/Downtime-CSZCScXL.js","/assets/Education-iEnRYqip.js","/assets/EducationLesson-BrkhMr_d.js","/assets/EmptyState-CGKS8Pfz.js","/assets/Exam-DrMkLXfn.js","/assets/ExamAdmin-CWXtMTu8.js","/assets/Factories-BYzanzbo.js","/assets/FactorySelect-alBSXTCO.js","/assets/Gamification-CLGrXMnf.js","/assets/GroupBadge-D8ysZJS-.js","/assets/HeatmapChart-DorL6b20.js","/assets/HourlyContainers-CezTNyJT.js","/assets/IdleCell-BWV2kV2H.js","/assets/IdleOwners-BRpC0BCC.js","/assets/IdleSolutions-DwJSadW2.js","/assets/IdleSource-BnfMn5_Q.js","/assets/KPICard-76RFQj-A.js","/assets/Kaizen-BCIjTpAz.js","/assets/Kelish-CTmJJoOf.js","/assets/Kitchen-ButHswKr.js","/assets/KpiBits-BiubEWnz.js","/assets/KpiDeltaCard--5RrDkzL.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-v1NT6nks.js","/assets/LeaderAppeal-BjyWmG40.js","/assets/LeaderCutoffs-CsR3SUtL.js","/assets/LeaderDailyTasks-DrGrrO03.js","/assets/LeaderDayExclusions-DPC80z0O.js","/assets/LeaderDayReport-Brj0dpPQ.js","/assets/LeaderTasksAdmin-OL8gCdMY.js","/assets/LeaderUnitReport-DTKYZFHF.js","/assets/Leaderboard-CZvzn28q.js","/assets/Leaders--K8wBQM1.js","/assets/LeadersKpi-xR2TBJMN.js","/assets/Lightbox-qz-OtApx.js","/assets/LiveOverview-CQngfl_9.js","/assets/Login-C_PkYm1P.js","/assets/Logs-C3q96X2W.js","/assets/LostWorkers-C4q1gC_A.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-BrCKIHv3.js","/assets/Notifications-BgWarvV_.js","/assets/NotionTasks-D-Ym0avj.js","/assets/NotionTrackerSettings-DpWOI7tK.js","/assets/Ontime-DQaaae04.js","/assets/OrgChart-CYPHFJOh.js","/assets/Ovens-BZC0QXM2.js","/assets/OvensSettings-DGVFc5jF.js","/assets/Overview-DloFknmW.js","/assets/OwnerChip-2DmChpKK.js","/assets/PageAccess-J1pZsgzg.js","/assets/Pagination-BWDLYe0f.js","/assets/People-BMyI5Mkg.js","/assets/PerenaladkaFactTable-DSZ-vCxR.js","/assets/Permissions-qIJ7IWP_.js","/assets/PersonCard-CRCWTEOu.js","/assets/PlanFulfillment-dmVodcZa.js","/assets/Production-Cjniv0qM.js","/assets/ProductionUpload-CoogQ4OO.js","/assets/Profile-BBbQ9RNx.js","/assets/ProfileAvatar-BeAnOUtM.js","/assets/ProfilesManagement-DBrOBqoR.js","/assets/ProofCamera-BebFczsg.js","/assets/ProofPhoto-D2QYLOFB.js","/assets/Quality-CeIslkwH.js","/assets/RawRows-rba5GZlY.js","/assets/Reports-BhMRlgQi.js","/assets/RequestStateChip-w-dt7ch8.js","/assets/RichTextEditor-De-BSMfI.js","/assets/SaveState-BMU3dsjS.js","/assets/SearchInput-2IfcnVTS.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-BBhqlTsM.js","/assets/ShiftDaily-B3vQq2KS.js","/assets/ShiftTimes-BRRWyAN1.js","/assets/Staff-Co-1uaR5.js","/assets/StaffListAtCheck-CRbJlgZC.js","/assets/StatusBadge-CzTG3XTs.js","/assets/StatusBandsModal-CqceURKh.js","/assets/TargetGoal-Gqo8R_1y.js","/assets/Targets-DvM9LbqE.js","/assets/TaskFormModal-QyiEUfRS.js","/assets/TaskerSettings-BwW8MXxD.js","/assets/Tasks-DgKdGVwH.js","/assets/TgProfile-BcjRLt9Y.js","/assets/TimeWheelPicker-DRB5Oi60.js","/assets/Tooltip-DtgFhSk0.js","/assets/TranslationsEditor-jHLZscrP.js","/assets/TrelloAnalytics-D_XLMdTz.js","/assets/TrelloSettings-Pacb5uQB.js","/assets/TrendChart-NB7EyLTO.js","/assets/TripleSpeedometer-DDO0bxPY.js","/assets/Trudoyomkost-B-kNfdcy.js","/assets/UploadDropzone-DIow2_wO.js","/assets/UsersActivity-BU-1YBfX.js","/assets/UsersManagement-CbZLMJ-H.js","/assets/VerdictBlock-CYAtGFAh.js","/assets/VerifixParity-DPJ-fC5d.js","/assets/VerifixSettings-CMwbn70h.js","/assets/VerifixSync-CKsD12Hr.js","/assets/VfxApiMap-CVoUzBQl.js","/assets/VfxDictionaries-7cEvJtwD.js","/assets/VfxEmployees-Bm_0uecm.js","/assets/VfxHrMoves-B55wIbb8.js","/assets/VfxJobs-0WpjzkEQ.js","/assets/VfxPhoto-D7fplmg-.js","/assets/VfxShifts-BCN4ONQe.js","/assets/VfxState-DSOb8EVi.js","/assets/VfxTimebooks-DOJLt2lZ.js","/assets/VfxTimesheet-DYLZ83k7.js","/assets/WatchProgress-CBRJx5RL.js","/assets/WebLogin-BzLChjZ9.js","/assets/WorkersAttendance-CKf5s5ch.js","/assets/WorkersComposition-CsV3WBM_.js","/assets/WorkersMovements-B0VCb1sP.js","/assets/WorkersPage-B3oeaxOd.js","/assets/Zagruzka-lIzdFyMs.js","/assets/ZagruzkaCell-BuAopSzP.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BZImW2Ut.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-B3Y9TdxZ.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BcIr2M9w.js","/assets/broadcastTree-DHBqgBxJ.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-VTf_dlm-.js","/assets/cellMoveRefusal-DMUorjyT.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-5n2EZo7D.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-BsTcYTc-.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-BqqpVllE.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-zP5geoej.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BoecGoQW.js","/assets/index-r8V5EIbL.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CpPACVnt.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CjW0gI6W.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-C_w9NmBD.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CCk2wQIb.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-BteK3kRb.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-oc_S7GtP.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CEkimMnZ.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Csw5ZDrr.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-B1f_-2f3.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-BW4wshH2.js","/assets/useOpenParam-iHqcwHaM.js","/assets/useStatusBands-BS7XlEhe.js","/assets/useUrlScope-BZPQmT_5.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-C6Qb57cS.js","/assets/uz_cyrl-BKiI8fgL.js","/assets/vfx-CC8jnDe-.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-B8epvKe_.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
