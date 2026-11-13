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

const BUILD = "2026-11-13T07:09:48.110Z";
const PRECACHE = ["/","/assets/ActionHistory-D8rMlIZF.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-C9L36bPz.js","/assets/AiKeys-BnOLdFE-.js","/assets/AnalysisBoard-Bq2eoZ3l.js","/assets/ApiAccess-DFPSuTNj.js","/assets/AppLauncher-Bs3gIRec.js","/assets/Arc-pzIGVY4z.js","/assets/Assessment-Bg1n5wdj.js","/assets/AssessmentGrade-D_TFQuRr.js","/assets/AssessmentList-B6xTKTyc.js","/assets/Assistant-DvZBj-Vs.js","/assets/AttendanceCleanup-Dw_0Qznm.js","/assets/AttendanceUpload-BV6PM60C.js","/assets/AuditTable-BmsudBaQ.js","/assets/BrigadirProfile-BrToJGdL.js","/assets/BrigadirsKpi-CYE4AsKd.js","/assets/Broadcast-BcyJgCMQ.js","/assets/BroadcastReceivers-CRl9KuVK.js","/assets/BroadcastRecord-NaK_LMPE.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-DO3bPsLn.js","/assets/CategoryLegendModal-sfcrFyPM.js","/assets/CellConcerns-DzW1c_lO.js","/assets/CellDetails-Dmib1EpW.js","/assets/CellFormModal-CwlhDkg0.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-C-ID46MS.js","/assets/Cells-DT9pmIPh.js","/assets/ColumnFilter-DA5YuXgy.js","/assets/ColumnsPicker-Dmn0S-xX.js","/assets/CommentsModal-DCPAvYrb.js","/assets/ComparisonTable-3v4Oin9H.js","/assets/Concerns-BD-0rTwf.js","/assets/ConcernsPieces-Dv0jxJG7.js","/assets/ContainerTotalsCard-BFPbAYem.js","/assets/Containers-C9MZ6u72.js","/assets/CountStepper-Cr6Lca5d.js","/assets/Daily-D1oKbSS3.js","/assets/DataSources-DIBhJiqL.js","/assets/DataTable-BuPU8_hJ.js","/assets/DateRangePicker-voqNjLr-.js","/assets/DayReportView-rBE8dvI9.js","/assets/DayStepper-D00zbmke.js","/assets/DayStrip-Y2YmezIn.js","/assets/DbBackup-DNJ2neO7.js","/assets/DifferenceBreakdown-GNd0UcyJ.js","/assets/DocAudit-O1yTEZ3x.js","/assets/Downtime-Ds04DAUp.js","/assets/Education-STr49NBd.js","/assets/EducationLesson-DrAD4zJM.js","/assets/EmptyState-BPH8uuuK.js","/assets/Exam-D3brlGNl.js","/assets/ExamAdmin-DYJqifGX.js","/assets/Factories-KoakBJOX.js","/assets/FactorySelect-IBHxfhIK.js","/assets/Gamification-8lC7ptC2.js","/assets/GroupBadge-DHX5WTQ5.js","/assets/HeatmapChart-DtLUWbm7.js","/assets/HourlyContainers-CPWqcpDs.js","/assets/IdleCell-CRxbOf5h.js","/assets/IdleOwners-RohLcFES.js","/assets/IdleSolutions-6M96wWcJ.js","/assets/IdleSource-BmyzBdPS.js","/assets/KPICard-B0VzHgvC.js","/assets/Kaizen-BR0Y6Oeh.js","/assets/Kelish-C5MguSF5.js","/assets/Kitchen-BDW7NcJB.js","/assets/KpiBits-B741ULrx.js","/assets/KpiDeltaCard-i5EhXSaq.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-D4fSuQlR.js","/assets/LeaderAppeal-C6IieRdK.js","/assets/LeaderCutoffs-HY7P57T8.js","/assets/LeaderDailyTasks-BlQ3N8LW.js","/assets/LeaderDayExclusions-BX3A56V6.js","/assets/LeaderDayReport-DwxQhGsd.js","/assets/LeaderTasksAdmin-jMHKs_jV.js","/assets/LeaderUnitReport-eibbbM-J.js","/assets/Leaderboard-Cn27DzJP.js","/assets/Leaders-VfySJ51T.js","/assets/LeadersKpi-9ZKTXs0e.js","/assets/Lightbox-BhLl0LUZ.js","/assets/LiveOverview-B2LzpX24.js","/assets/Login-LXVYLF02.js","/assets/Logs-CBudXGi9.js","/assets/LostWorkers-yHHps2Ld.js","/assets/NotFound-oembr29g.js","/assets/Notifications-C_3Y6-Tp.js","/assets/NotionTasks-DbH6mnqF.js","/assets/NotionTrackerSettings-9sIE_TNl.js","/assets/Ontime-Cjcl1ctZ.js","/assets/OrgChart-CEIijwLv.js","/assets/Ovens-D9121MUW.js","/assets/OvensSettings-CkpUh8qa.js","/assets/Overview-Bvwi9BQR.js","/assets/OwnerChip-DcBrM0T-.js","/assets/PageAccess-_MB33ELy.js","/assets/Pagination-Dw_yMDSg.js","/assets/People-eNY4rccv.js","/assets/PerenaladkaFactTable-D2tN2VW5.js","/assets/Permissions-ChHYblOw.js","/assets/PersonCard-SrOAW1hQ.js","/assets/PlanFulfillment-D3WmjSuk.js","/assets/Production-pBDT-cVY.js","/assets/ProductionUpload-CRJ3cfZY.js","/assets/Profile--469ltNQ.js","/assets/ProfileAvatar-BToz_FFJ.js","/assets/ProfilesManagement-CPOK-Y6L.js","/assets/ProofCamera-D9zTvSZ0.js","/assets/ProofPhoto-nuJtIqEI.js","/assets/Quality-6MmT-Ph7.js","/assets/RawRows-DfIqdV8e.js","/assets/Reports-C1oHAZ_v.js","/assets/RequestStateChip-CEymWm_O.js","/assets/RichTextEditor-DRcVRLAd.js","/assets/SaveState-D4_ZNfuE.js","/assets/SearchInput-BLcscTBX.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-ClUUapaU.js","/assets/ShiftDaily-BFquu6SJ.js","/assets/ShiftTimes-BzyQGVif.js","/assets/Staff-DntQ84vr.js","/assets/StaffListAtCheck-DfYFi3NC.js","/assets/StatusBadge-fzTeaNYS.js","/assets/StatusBandsModal-J60ryHB6.js","/assets/TargetGoal-BaJFAmKB.js","/assets/Targets-BvS-lwEv.js","/assets/TaskerSettings-BpOyDaVt.js","/assets/Tasks-B0_-9avM.js","/assets/TgProfile-CFXhevMH.js","/assets/TimeWheelPicker-CvyMDSqM.js","/assets/Tooltip-0pUgryyG.js","/assets/TranslationsEditor-CXbcohvY.js","/assets/TrelloAnalytics-7SpBbB7M.js","/assets/TrelloSettings-ChBcu8HA.js","/assets/TrendChart-z0F8l0hg.js","/assets/TripleSpeedometer-DR7AX8rf.js","/assets/Trudoyomkost-B6F2LqZ4.js","/assets/UploadDropzone-BABdG2oa.js","/assets/UsersActivity-tBcFbmeG.js","/assets/UsersManagement-lwNxsqh4.js","/assets/VerdictBlock-DXoL9IyV.js","/assets/VerifixParity-6gftJTh3.js","/assets/VerifixSettings-DLKbB6G3.js","/assets/VerifixSync-D5liYhd8.js","/assets/VfxApiMap-8cAkUlrx.js","/assets/VfxDictionaries-CLMDvSo_.js","/assets/VfxEmployees-DnW-EbUs.js","/assets/VfxHrMoves-uxeubx8_.js","/assets/VfxJobs-DXhpsILZ.js","/assets/VfxPhoto-eouwKAw6.js","/assets/VfxShifts-NQ54Af-c.js","/assets/VfxState-Bz4FFxJ-.js","/assets/VfxTimebooks-C8nYwToh.js","/assets/VfxTimesheet-D3PaPUaM.js","/assets/WatchProgress-B1Yk2FMf.js","/assets/WebLogin-DtKOs0ax.js","/assets/WorkersAttendance-CRtFB0k-.js","/assets/WorkersComposition-sfJMqeQ4.js","/assets/WorkersMovements-D-tV3AkT.js","/assets/WorkersPage-BCK7mWTX.js","/assets/Zagruzka-By0GAO07.js","/assets/ZagruzkaCell-Bd86fboS.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-B1vzDoF8.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-jL_s65UO.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CNPDRy1J.js","/assets/broadcastTree-DwlA0YWH.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-7HA_-xW3.js","/assets/cellMoveRefusal-CUXpPmeS.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BhF4Iwcr.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Hxys3gFx.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-36Jd1toZ.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CK-sW8gQ.js","/assets/index-Do5oS5bF.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-AVwn6fzB.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CQ9jUQJJ.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-C2ojwi4V.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CqXvmGwF.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-DIs_4cjG.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-GPFYEJVa.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DwD5y6fT.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-BIN9VTCz.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CZi1JqUD.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DNAuwIeP.js","/assets/useMutation-DCyJ7U1p.js","/assets/useOpenParam-BXywGvY6.js","/assets/useStatusBands--YU14g2H.js","/assets/useUrlScope-Ba14hmkC.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DY2UScoX.js","/assets/uz_cyrl-CC_EXIG_.js","/assets/vfx-DNnSFa-s.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-BOgaumdX.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
