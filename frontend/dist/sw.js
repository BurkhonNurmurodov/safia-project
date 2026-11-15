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

const BUILD = "2026-11-15T06:36:05.867Z";
const PRECACHE = ["/","/assets/ActionHistory-B8TQGxH8.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-DlSZSbPb.js","/assets/AiKeys-B0yXRyf9.js","/assets/AnalysisBoard-BohG3fdE.js","/assets/ApiAccess-U1gSrR8b.js","/assets/AppLauncher-QT9-dztw.js","/assets/Arc-C0TMBt_N.js","/assets/Assessment-D1sDR4cF.js","/assets/AssessmentGrade-_NQ9iOo1.js","/assets/AssessmentList-DmA05ZC8.js","/assets/Assistant-tN10xVCl.js","/assets/AttendanceCleanup-CK9hmM9S.js","/assets/AttendanceUpload-DNusRzIr.js","/assets/AuditTable-CwncKHQr.js","/assets/BrigadirProfile-ClUdz4Ti.js","/assets/BrigadirsKpi-CKq2p6he.js","/assets/Broadcast-Ba1mtNOW.js","/assets/BroadcastReceivers-Dx4UsTRk.js","/assets/BroadcastRecord-tUZz7kkk.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-BboFkrpA.js","/assets/CategoryLegendModal-wksXuGbc.js","/assets/CellConcerns-DEovWWvx.js","/assets/CellDetails-BlT37V5Y.js","/assets/CellFormModal-MLMRA0Vr.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-XRjDMt2_.js","/assets/Cells-bDmvaphF.js","/assets/ColumnFilter-2JnG6mbN.js","/assets/ColumnsPicker-Cx7aQ9Zu.js","/assets/CommentsModal-Dry1kymw.js","/assets/ComparisonTable-Blia3Gzw.js","/assets/Concerns-BCScBU2v.js","/assets/ConcernsPieces-B-B4I65q.js","/assets/ContainerFlow-DlqrYVhD.js","/assets/ContainerTotalsCard-DyYw9Zqk.js","/assets/Containers-_5EHo2eh.js","/assets/CountStepper-RYlFUzbH.js","/assets/Daily-Ct8h5G2J.js","/assets/DataSources-q6UjlZ5p.js","/assets/DataTable-C6SPcRJw.js","/assets/DateRangePicker-QH2AuY4v.js","/assets/DayReportView-CV8_P9o3.js","/assets/DayStepper-CbIepIEf.js","/assets/DayStrip-CQ4OZjbt.js","/assets/DbBackup-Thyc0elI.js","/assets/DifferenceBreakdown-DHgYiaBD.js","/assets/DocAudit-BdLp5hYf.js","/assets/Downtime-Dr4_fd78.js","/assets/Education-tznRsjD7.js","/assets/EducationLesson-D6PrFjWg.js","/assets/EmptyState-CbGr-Tbq.js","/assets/Exam-CZMIKJtE.js","/assets/ExamAdmin-D1vccz0J.js","/assets/Factories-BQYH5wtz.js","/assets/FactorySelect-CRr6q7I5.js","/assets/Gamification-DHeSbssA.js","/assets/GroupBadge-gBOJj6Qr.js","/assets/HeatmapChart-BoRYdzVn.js","/assets/HourlyContainers-BPry74Oe.js","/assets/IdleCell-CYORDjgi.js","/assets/IdleOwners-XfFduI0G.js","/assets/IdleSolutions-zyZYY5cK.js","/assets/IdleSource-CoE3TPzD.js","/assets/KPICard-U8CiYGez.js","/assets/Kaizen-DRP_PE5d.js","/assets/Kelish-47wTW_uI.js","/assets/Kitchen-ClwN8rod.js","/assets/KpiBits-D0Ir65V_.js","/assets/KpiDeltaCard-CalL_WWz.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-DrTHcdfB.js","/assets/LeaderAppeal-cBcDFxTw.js","/assets/LeaderCutoffs-CgcERaC6.js","/assets/LeaderDailyTasks-CgoWl-XG.js","/assets/LeaderDayExclusions-1iqtMZU4.js","/assets/LeaderDayReport-72tkZM6b.js","/assets/LeaderTasksAdmin-DByqTEr3.js","/assets/LeaderUnitReport-CyauYpv1.js","/assets/Leaderboard-D1rgJy0y.js","/assets/Leaders-B4N4R4Zp.js","/assets/LeadersKpi-y9_x7qSv.js","/assets/Lightbox-Dcj7ZBl-.js","/assets/LiveOverview-KvglS-yP.js","/assets/Login-CBsctZ7t.js","/assets/Logs-BOWOnEE-.js","/assets/LostWorkers-CpAq5iOi.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-CzLnr5nf.js","/assets/Notifications-DZyx_DwD.js","/assets/NotionTasks-v1U5iMh9.js","/assets/NotionTrackerSettings-CjP2ukj7.js","/assets/Ontime-D8LtFy9L.js","/assets/OrgChart-Cc7lt0G7.js","/assets/Ovens-lZi8PXqA.js","/assets/OvensSettings-0XXnMG0Y.js","/assets/Overview-CMRRhjdg.js","/assets/OwnerChip-Bh6MAW4U.js","/assets/PageAccess-B0pYSnvQ.js","/assets/Pagination-BiKwXmcw.js","/assets/People-elJ6zR1m.js","/assets/PerenaladkaFactTable-BEVbejNv.js","/assets/Permissions-C5g1EahC.js","/assets/PersonCard-CbYdQq3Q.js","/assets/PlanFulfillment-hDH2Rx0R.js","/assets/Production-BeaTqYWB.js","/assets/ProductionUpload-DAeTa1tg.js","/assets/Profile-rjd5DLPN.js","/assets/ProfileAvatar-DuNVeflm.js","/assets/ProfilesManagement-C2D3KKsX.js","/assets/ProofCamera-iwIvoBRE.js","/assets/ProofPhoto-Ba1PXgQY.js","/assets/Quality-CDKWrV3u.js","/assets/RawRows-CwJNTJ1I.js","/assets/Reports-rOWkLbVQ.js","/assets/RequestStateChip-tewFW-LE.js","/assets/RichTextEditor-C5JieTW4.js","/assets/SaveState-BQgjLQXS.js","/assets/SearchInput-C3w-KXTF.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-BzkHi0zK.js","/assets/ShiftDaily-IkPzJfnZ.js","/assets/ShiftTimes-B87gZR9g.js","/assets/Staff-DhLuE_4_.js","/assets/StaffListAtCheck-8rif4Jud.js","/assets/StatusBadge-CWUF8ZtI.js","/assets/StatusBandsModal-Ce7KIZT-.js","/assets/TargetGoal-B-bjbATQ.js","/assets/Targets-sZWFB2Zo.js","/assets/TaskFormModal-CzV_R4Sj.js","/assets/TaskerSettings-CH7hz1Pb.js","/assets/Tasks-Cirp2VpP.js","/assets/TgProfile-B5yZBGMY.js","/assets/TimeWheelPicker-DwouBXVS.js","/assets/Tooltip-ksSMBBap.js","/assets/TranslationsEditor-9Kwpzj_y.js","/assets/TrelloAnalytics-BYWMqFAd.js","/assets/TrelloSettings-C4Alw1MC.js","/assets/TrendChart-0S2yVCBa.js","/assets/TripleSpeedometer-CQAZaOkt.js","/assets/Trudoyomkost-Cx_ARR7f.js","/assets/UploadDropzone-LVfBEuyK.js","/assets/UsersActivity-D8BdUN7h.js","/assets/UsersManagement-3OgsCrWH.js","/assets/VerdictBlock-BLAI2ehx.js","/assets/VerifixParity-Bdudmazm.js","/assets/VerifixSettings-CqTF8uAS.js","/assets/VerifixSync-CwgoXr5n.js","/assets/VfxApiMap-DPrhXQas.js","/assets/VfxDictionaries-T6xmcTqW.js","/assets/VfxEmployees-BB8Tnmfs.js","/assets/VfxHrMoves-DUv5TrON.js","/assets/VfxJobs-C6AOKML_.js","/assets/VfxPhoto-BW_39jGQ.js","/assets/VfxShifts-CGeE-8S0.js","/assets/VfxState-DVFFV9rD.js","/assets/VfxTimebooks-BKZ63-2c.js","/assets/VfxTimesheet-Byo5wns7.js","/assets/WatchProgress-FVXRdEXT.js","/assets/WebLogin-D33ynHTH.js","/assets/WorkersAttendance-GeuciAzH.js","/assets/WorkersComposition-Cn7XQqz-.js","/assets/WorkersMovements-BToUqyTu.js","/assets/WorkersPage-DbyIxkXH.js","/assets/Zagruzka-DawXziao.js","/assets/ZagruzkaCell-nXCn09P1.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BjbjJv_b.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-EfbIzN7u.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-EvleRze5.js","/assets/broadcastTree-CGHlNgrX.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DZEUUpZb.js","/assets/cellMoveRefusal-BeF6Gg00.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BOHu0P4g.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-B7qj5QmE.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DsbYx-2g.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-3696tX1v.css","/assets/index-Cpbg71Og.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CnCdI3Ss.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BERC8JbJ.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-BD0l3h_c.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BK6rOZE7.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-xVbaXhaX.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BHOJGGY5.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CI1_MW1Q.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BVEUWI4f.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-Cn_X5WzE.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-DPG1X4OC.js","/assets/useOpenParam-miG1-qQZ.js","/assets/useStatusBands-CAlyXy12.js","/assets/useUrlScope-B_k4DHEQ.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BRCFtug9.js","/assets/uz_cyrl-DdfzRhyt.js","/assets/vfx-DRZrNV7k.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-CEzrQ4zN.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
