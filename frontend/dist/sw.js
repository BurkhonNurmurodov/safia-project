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

const BUILD = "2026-11-13T11:13:56.334Z";
const PRECACHE = ["/","/assets/ActionHistory-CFTnC8Y-.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-Plt5U0kf.js","/assets/AiKeys-C_0lDlg0.js","/assets/AnalysisBoard-D2VgRvSr.js","/assets/ApiAccess-C8YonfAn.js","/assets/AppLauncher-4RtvVPAQ.js","/assets/Arc-CaLniYF0.js","/assets/Assessment-C6V_mEYF.js","/assets/AssessmentGrade-BzySBtTq.js","/assets/AssessmentList-C_W_cn9z.js","/assets/Assistant-yPvciqiW.js","/assets/AttendanceCleanup-BO9OwbFW.js","/assets/AttendanceUpload-BX2j5Nuv.js","/assets/AuditTable-Ct2WDbJK.js","/assets/BrigadirProfile-BA4EI2Y2.js","/assets/BrigadirsKpi-D1zbXtnI.js","/assets/Broadcast-BkxO9w6Q.js","/assets/BroadcastReceivers-LOcs25cK.js","/assets/BroadcastRecord-CjAUhf4c.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-M9sPdQo-.js","/assets/CategoryLegendModal-ukTOB79C.js","/assets/CellConcerns-kDzfUdW2.js","/assets/CellDetails-D1bqM4Hj.js","/assets/CellFormModal-gMYGME0x.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-C4CnZ8Ir.js","/assets/Cells-DWQJBRcl.js","/assets/ColumnFilter-Ca0gdFq3.js","/assets/ColumnsPicker-D7W_mGuw.js","/assets/CommentsModal-Cd-UipJH.js","/assets/ComparisonTable-D6aI0Aeo.js","/assets/Concerns-gIDu_S01.js","/assets/ConcernsPieces-CWMxQtMp.js","/assets/ContainerTotalsCard-BHvMOxEH.js","/assets/Containers-DPDTJncA.js","/assets/CountStepper-Cn808vfx.js","/assets/Daily-BU5tQVEF.js","/assets/DataSources-ffYoxgr9.js","/assets/DataTable-CXxoz4Ru.js","/assets/DateRangePicker-Bonh8afv.js","/assets/DayReportView-DEbxpNIl.js","/assets/DayStepper-CUS4xn5B.js","/assets/DayStrip-lXW-M6UF.js","/assets/DbBackup-BrBJnwH0.js","/assets/DifferenceBreakdown-CEjWiRT0.js","/assets/DocAudit-SmMOBAUm.js","/assets/Downtime-CI3K6Fu9.js","/assets/Education-MIFkh9KT.js","/assets/EducationLesson-XzSMBxCf.js","/assets/EmptyState-DMjMr1jW.js","/assets/Exam-BuzdMF_c.js","/assets/ExamAdmin-BIqs_ca5.js","/assets/Factories-CF7bgwtB.js","/assets/FactorySelect-BcN-IGCn.js","/assets/Gamification-C3ALrd7D.js","/assets/GroupBadge-Ddrx1R8u.js","/assets/HeatmapChart-BkndNt_E.js","/assets/HourlyContainers-CSjZY60r.js","/assets/IdleCell-DOKieY-S.js","/assets/IdleOwners-CQEnHh3g.js","/assets/IdleSolutions-DSiKESFI.js","/assets/IdleSource-DkZ5VR2q.js","/assets/KPICard-Bs46-2A_.js","/assets/Kaizen-J1DnGHaF.js","/assets/Kelish-CRuukbQC.js","/assets/Kitchen-DP5D-nX0.js","/assets/KpiBits-41lmkU8U.js","/assets/KpiDeltaCard-CgmMGQ0H.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-DO667Iqf.js","/assets/LeaderAppeal-BW_h8gfl.js","/assets/LeaderCutoffs-BWFti_0C.js","/assets/LeaderDailyTasks-CuJPOaOu.js","/assets/LeaderDayExclusions-C6OII_pN.js","/assets/LeaderDayReport-w5WhlTXo.js","/assets/LeaderTasksAdmin-Do1d0W8d.js","/assets/LeaderUnitReport-CpQd71S_.js","/assets/Leaderboard-D0tvoPoL.js","/assets/Leaders-BV3QTXPD.js","/assets/LeadersKpi-CeRg7Pgu.js","/assets/Lightbox-BV7vEn4Z.js","/assets/LiveOverview-BEfL0SeZ.js","/assets/Login-DthCuNkx.js","/assets/Logs-Ce-xn7LB.js","/assets/LostWorkers-1YwHNCux.js","/assets/NotFound-BOYxMdZd.js","/assets/Notifications-CDZ2KC4q.js","/assets/NotionTasks-D0v7Pc5r.js","/assets/NotionTrackerSettings-BkWt9aus.js","/assets/Ontime-BOuo3YqF.js","/assets/OrgChart-nUNP-F8D.js","/assets/Ovens-DUnySB8k.js","/assets/OvensSettings-CNwSTLO5.js","/assets/Overview-DWs9pkjU.js","/assets/OwnerChip-CizyL7in.js","/assets/PageAccess-DI74w9yM.js","/assets/Pagination-CJU5YgFb.js","/assets/People-BMd1PlJZ.js","/assets/PerenaladkaFactTable-CPZpPJ3P.js","/assets/Permissions-DYMLUFVq.js","/assets/PersonCard-BDd5wtjU.js","/assets/PlanFulfillment-CQz0nfsm.js","/assets/Production--nrsvlHP.js","/assets/ProductionUpload-CzZbB2WN.js","/assets/Profile-BUFspgT1.js","/assets/ProfileAvatar-oLA7kld8.js","/assets/ProfilesManagement-7LaAH27s.js","/assets/ProofCamera-DwS4UPjL.js","/assets/ProofPhoto-B_ueH0gL.js","/assets/Quality-BD-XHQa5.js","/assets/RawRows-Az5X7CzU.js","/assets/Reports-DCNivCJB.js","/assets/RequestStateChip-C3VnDVn8.js","/assets/RichTextEditor-DRKMOzGg.js","/assets/SaveState-DbXCfk3m.js","/assets/SearchInput-B48R6Vpu.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-WXx0xE01.js","/assets/ShiftDaily-DNyLDbec.js","/assets/ShiftTimes-B6AVIqTA.js","/assets/Staff-Dw1PC88g.js","/assets/StaffListAtCheck-Cm5ccQnw.js","/assets/StatusBadge-DRRlT-ew.js","/assets/StatusBandsModal-9o3i-rDi.js","/assets/TargetGoal-BhGP3clx.js","/assets/Targets-BoNrpVYY.js","/assets/TaskerSettings-RavepqNV.js","/assets/Tasks-iiqCVfVi.js","/assets/TgProfile-BrCdCkd0.js","/assets/TimeWheelPicker-BtV4R5WM.js","/assets/Tooltip-CN1C2qjt.js","/assets/TranslationsEditor-8wfz-DAc.js","/assets/TrelloAnalytics-Dbpv9tdM.js","/assets/TrelloSettings-DvZ204C2.js","/assets/TrendChart-CdEJv2hF.js","/assets/TripleSpeedometer-CewYOCAg.js","/assets/Trudoyomkost-Dind6iMi.js","/assets/UploadDropzone-CyIIEjuz.js","/assets/UsersActivity-QWVmYv7_.js","/assets/UsersManagement-QvMqeZSb.js","/assets/VerdictBlock-mdGpGBzQ.js","/assets/VerifixParity-DxVQkpG1.js","/assets/VerifixSettings-DSNn3jHh.js","/assets/VerifixSync-97GDc2ud.js","/assets/VfxApiMap-Dkl6Z2ZR.js","/assets/VfxDictionaries-BwpunqxP.js","/assets/VfxEmployees-CrrDvkZi.js","/assets/VfxHrMoves-D3Ewqhj_.js","/assets/VfxJobs-DAUx_Dn7.js","/assets/VfxPhoto-DNtzzT_y.js","/assets/VfxShifts-CCMCOeLG.js","/assets/VfxState-DfnB51E-.js","/assets/VfxTimebooks-DgFcaTDC.js","/assets/VfxTimesheet-fsH7ZKLj.js","/assets/WatchProgress-CIhXKrUj.js","/assets/WebLogin-DIIgPeTB.js","/assets/WorkersAttendance-CAJYSG_W.js","/assets/WorkersComposition-Cg_vA7NW.js","/assets/WorkersMovements-CFJf7JFG.js","/assets/WorkersPage-8BVuWFp5.js","/assets/Zagruzka-DzT6Jso8.js","/assets/ZagruzkaCell-DsvBbgrw.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Ccv0CI2d.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CZt9If6N.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CjzdUm5C.js","/assets/broadcastTree-i1AlZSE6.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-XVjMffFQ.js","/assets/cellMoveRefusal-BuCX5h2f.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-RYmLbhHo.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-BFkbbLVu.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CcuICd3E.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BGOSZwp-.js","/assets/index-DkWQ5BEQ.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-D38Ims2W.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-V20dT3ei.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-BHS_dMaT.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-C38b_3yl.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-DgsDV5Hg.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-044gYHxR.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DGyppppG.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-BIN9VTCz.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DnCKSGll.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-CJxh74Q_.js","/assets/useMutation-CRgXhfLC.js","/assets/useOpenParam-D6WiThdV.js","/assets/useStatusBands-m2YgBzzo.js","/assets/useUrlScope-oNY8nnJX.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-D7MCPXRA.js","/assets/uz_cyrl-CRMMMXEv.js","/assets/vfx-BMiWrm4i.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-DDsKaYWH.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
