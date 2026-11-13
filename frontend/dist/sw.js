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

const BUILD = "2026-11-13T12:36:41.980Z";
const PRECACHE = ["/","/assets/ActionHistory-CD-pWuYp.js","/assets/ActionMenu-DbWiby4f.js","/assets/AdminPage-DnXnRLC-.js","/assets/AiKeys-lZt9zm3R.js","/assets/AnalysisBoard-vbOonqQ2.js","/assets/ApiAccess-CbtR78Lc.js","/assets/AppLauncher-DWRwklNB.js","/assets/Arc-CoA58gvx.js","/assets/Assessment-VFaDSgJk.js","/assets/AssessmentGrade-D7QbEYJL.js","/assets/AssessmentList-BtISTBFp.js","/assets/Assistant-DvN_aCyp.js","/assets/AttendanceCleanup-BnczDHhc.js","/assets/AttendanceUpload-JJQwE1M7.js","/assets/AuditTable-hMWZk7ug.js","/assets/BrigadirProfile-sso-TDnL.js","/assets/BrigadirsKpi-Dizo1OdP.js","/assets/Broadcast-C5nokeQV.js","/assets/BroadcastReceivers-D9I9KfTx.js","/assets/BroadcastRecord-BlXqHb1V.js","/assets/Button-BkqO76fy.js","/assets/CatLockNotice-BJVM94U8.js","/assets/CategoryLegendModal-B0rGZ3FN.js","/assets/CellConcerns-BmsYLnTV.js","/assets/CellDetails-0ihrbmOc.js","/assets/CellFormModal-PKnl-B2S.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-J1egMlV5.js","/assets/Cells-C15VzdOD.js","/assets/ColumnFilter-D2O3QydS.js","/assets/ColumnsPicker-ChLlY5xX.js","/assets/CommentsModal-XM2nchC7.js","/assets/ComparisonTable-BoCKQrbn.js","/assets/Concerns-BN9MvDOB.js","/assets/ConcernsPieces-8dh6foHP.js","/assets/ContainerTotalsCard-CnJxs4EL.js","/assets/Containers-Col1pU-d.js","/assets/CountStepper-BG-aXlhv.js","/assets/Daily-BAx6ipij.js","/assets/DataSources-DGSJWWGX.js","/assets/DataTable-C-G2DYqE.js","/assets/DateRangePicker-CZTOGPrE.js","/assets/DayReportView-DzkmkpY3.js","/assets/DayStepper-BNet2IZD.js","/assets/DayStrip-bys_7VbO.js","/assets/DbBackup-DSp0Bu8N.js","/assets/DifferenceBreakdown-CYMvy9Vc.js","/assets/DocAudit-CVdtywRO.js","/assets/Downtime-D1Q3ZxDM.js","/assets/Education-fI6TlEtI.js","/assets/EducationLesson-Dncqz-WT.js","/assets/EmptyState-Co8UFbCz.js","/assets/Exam-DO0sSxTD.js","/assets/ExamAdmin-C_A6z9y8.js","/assets/Factories-BtEXh5t7.js","/assets/FactorySelect-BtVaFcBd.js","/assets/Gamification-BX-8cPpj.js","/assets/GroupBadge-CtJyKEeB.js","/assets/HeatmapChart-2AlB8iKj.js","/assets/HourlyContainers-BSuCVF1_.js","/assets/IdleCell-CI-zyIdO.js","/assets/IdleOwners-DQbN3H6M.js","/assets/IdleSolutions-Brw0RefP.js","/assets/IdleSource-CVx5dyK3.js","/assets/KPICard-CyCUIGx-.js","/assets/Kaizen-iH1D_09s.js","/assets/Kelish-Pnzz9PzE.js","/assets/Kitchen-CCBcQKMn.js","/assets/KpiBits-DbFaH5tF.js","/assets/KpiDeltaCard-ZIZ0aybP.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CvYTJAne.js","/assets/Layout-BEQcFMCQ.js","/assets/LeaderAppeal-BVw_J9Gl.js","/assets/LeaderCutoffs-Ba_Y7z9A.js","/assets/LeaderDailyTasks-CW1eJGIH.js","/assets/LeaderDayExclusions-JPC7X21W.js","/assets/LeaderDayReport-DooHwmlu.js","/assets/LeaderTasksAdmin-BsW9ocyB.js","/assets/LeaderUnitReport-IOhsB3yl.js","/assets/Leaderboard-BjZ8u8tB.js","/assets/Leaders-DbPXrFjE.js","/assets/LeadersKpi-BGEINg26.js","/assets/Lightbox-DwX5ZCWg.js","/assets/LiveOverview-BdUVkfk3.js","/assets/Login-CpjaEZvc.js","/assets/Logs-D0avu9GD.js","/assets/LostWorkers-8O0t1_1E.js","/assets/NotFound-D-wGafeL.js","/assets/Notifications-CDJZQvRH.js","/assets/NotionTasks-C1CJ1z5Z.js","/assets/NotionTrackerSettings-CwXb20QY.js","/assets/Ontime-D7ssexvt.js","/assets/OrgChart-kRvxSbeJ.js","/assets/Ovens-Dor2pafA.js","/assets/OvensSettings-CUddXwHv.js","/assets/Overview-COYlZkPS.js","/assets/OwnerChip-CzsccwKK.js","/assets/PageAccess-Bs5nQzlz.js","/assets/Pagination-BgsRIQjC.js","/assets/People-DwUKuwfv.js","/assets/PerenaladkaFactTable-44eQd-8o.js","/assets/Permissions-6Ie0QLDs.js","/assets/PersonCard-8tZVbxhk.js","/assets/PlanFulfillment-BTQvBnzA.js","/assets/Production-B3JYEiEq.js","/assets/ProductionUpload-CBnX5bQO.js","/assets/Profile-BTryyFgZ.js","/assets/ProfileAvatar-CYYcxnOf.js","/assets/ProfilesManagement-D5JsmFyQ.js","/assets/ProofCamera-DSk_BQsh.js","/assets/ProofPhoto-DB_nLmfS.js","/assets/Quality-Gwfn-rFN.js","/assets/RawRows-B4bYD0vK.js","/assets/Reports-BpBSRVka.js","/assets/RequestStateChip-Cg100tqg.js","/assets/RichTextEditor-zhZKvaPa.js","/assets/SaveState-AdRM66F7.js","/assets/SearchInput-DJHenlyK.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-C8myJDPN.js","/assets/SetupTimes-CsvhR8qa.js","/assets/ShiftDaily-BvVNl6u8.js","/assets/ShiftTimes-BhyEmAg7.js","/assets/Staff-sYeBj3NZ.js","/assets/StaffListAtCheck-DA45kqfH.js","/assets/StatusBadge-diFNofc5.js","/assets/StatusBandsModal-CRTo2ahe.js","/assets/TargetGoal-C-dsYEvv.js","/assets/Targets-DDn_3zoz.js","/assets/TaskerSettings-CFIZ3L-8.js","/assets/Tasks-Cmc9mXUI.js","/assets/TgProfile-CeBaodXB.js","/assets/TimeWheelPicker-CYHU5KT5.js","/assets/Tooltip-CwO6wafS.js","/assets/TranslationsEditor-DkDT-_kU.js","/assets/TrelloAnalytics-DXYaXOi1.js","/assets/TrelloSettings-DCdf5oKo.js","/assets/TrendChart-DsIX4KHl.js","/assets/TripleSpeedometer-DzizXbh_.js","/assets/Trudoyomkost-lNXl65Q-.js","/assets/UploadDropzone-BTPzy43I.js","/assets/UsersActivity-QMR6bQgt.js","/assets/UsersManagement-BhcoIpgp.js","/assets/VerdictBlock-Z39Tq8N7.js","/assets/VerifixParity-CP2EzIpP.js","/assets/VerifixSettings-6T6TMYbD.js","/assets/VerifixSync-DwBy8cUo.js","/assets/VfxApiMap-vI7fEBSW.js","/assets/VfxDictionaries-Bvo8SDtm.js","/assets/VfxEmployees-Btds6PaK.js","/assets/VfxHrMoves-YuFdUdl9.js","/assets/VfxJobs-BB2acZ0A.js","/assets/VfxPhoto-BDtbKm4y.js","/assets/VfxShifts-DVZK6p7t.js","/assets/VfxState-UpjzxR18.js","/assets/VfxTimebooks-Cl5SSive.js","/assets/VfxTimesheet-D_vGW8__.js","/assets/WatchProgress-BbjBR4TP.js","/assets/WebLogin-DliDsfoa.js","/assets/WorkersAttendance--tbpINRE.js","/assets/WorkersComposition-C-0Jo41g.js","/assets/WorkersMovements-Dtwr9WkS.js","/assets/WorkersPage-CVl_mvlv.js","/assets/Zagruzka-DDsAkW5L.js","/assets/ZagruzkaCell-ec1v_bSQ.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-QwSt16rz.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BSw94PPC.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-xBHdNmJj.js","/assets/broadcastTree-B5FMQF7D.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-CYsRJF5m.js","/assets/cellMoveRefusal-LGlfdq5M.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-ZPC-_YHA.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-B007DpXq.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-D3hYl6bB.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DvYHUARf.js","/assets/index-DwKjykHF.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-C224xO5F.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DeCDgful.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-DxbtNGwu.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BGJjlrsi.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-Mik6VVfX.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CDeIxfaC.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-BuRW-kz3.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-jqjrAoFX.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-H47xPXN1.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-JSIwZyfq.js","/assets/useOpenParam-CceS5roU.js","/assets/useStatusBands-uKo-292g.js","/assets/useUrlScope-D33e23BI.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-tPjj-bvj.js","/assets/uz_cyrl-AaHW7j6s.js","/assets/vfx-Cw2538aO.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-DtI5wCvW.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
