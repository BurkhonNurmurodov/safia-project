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

const BUILD = "2026-11-15T07:58:13.519Z";
const PRECACHE = ["/","/assets/ActionHistory-Cli_AUwM.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-DwDN07OF.js","/assets/AiKeys-D0MXcO96.js","/assets/AnalysisBoard-BntittaK.js","/assets/ApiAccess-9nVS9s3j.js","/assets/AppLauncher-Dg75zlHv.js","/assets/Arc-DoisM3R3.js","/assets/Assessment-54-1lvS1.js","/assets/AssessmentGrade-DSzbRq9Q.js","/assets/AssessmentList-DRqEKC9B.js","/assets/Assistant-m0_90U2O.js","/assets/AttendanceCleanup-Dv5XmQ9s.js","/assets/AttendanceUpload-CAx2-gOX.js","/assets/AuditTable-BhA9MOJ7.js","/assets/BrigadirProfile-Bxxr0jVP.js","/assets/BrigadirsKpi-Th5FIP7H.js","/assets/Broadcast-D145W2tI.js","/assets/BroadcastReceivers-CnW7vRWl.js","/assets/BroadcastRecord-DcaYvkD1.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-VnjFvc3K.js","/assets/CategoryLegendModal-CYJ8690R.js","/assets/CellConcerns-2Gv2nWIL.js","/assets/CellDetails-BgQgk-0o.js","/assets/CellFormModal-DajVtuJI.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-DH5AlKZT.js","/assets/Cells-CrenbVHy.js","/assets/ColumnFilter-CWcqeavF.js","/assets/ColumnsPicker-BxoD4SjQ.js","/assets/CommentsModal-CEWnQv0e.js","/assets/ComparisonTable-BdZ49uHF.js","/assets/Concerns-jEsrOc9o.js","/assets/ConcernsPieces-D-y8-mgA.js","/assets/ContainerFlow-CGWnAxQH.js","/assets/ContainerTotalsCard-Cn_Sg3up.js","/assets/Containers-DJCVwS-T.js","/assets/CountStepper-D2608t7a.js","/assets/Daily-CRf-g-bM.js","/assets/DataSources-D-8YZFqd.js","/assets/DataTable-BQl2SkQ8.js","/assets/DateRangePicker-BhPrN41Y.js","/assets/DayReportView-B9NH3x3g.js","/assets/DayStepper-D-jxZINA.js","/assets/DayStrip-BNhsqZc8.js","/assets/DbBackup-DpM05zUe.js","/assets/DifferenceBreakdown-bGZ4eE9q.js","/assets/DocAudit-gTyIgyIo.js","/assets/Downtime-UVkyw2pI.js","/assets/Education-DDb1JIwx.js","/assets/EducationLesson-BH13GZJQ.js","/assets/EmptyState-DuBDsflE.js","/assets/Exam-DOmmI-RX.js","/assets/ExamAdmin-CJbnV_zV.js","/assets/Factories-BjUv6uq5.js","/assets/FactorySelect-DoT1Pmc0.js","/assets/Gamification-TpqJWfam.js","/assets/GroupBadge-l1JY3bPz.js","/assets/HeatmapChart-BnoCSqGH.js","/assets/HourlyContainers-80kFV9Gf.js","/assets/IdleCell-DUStHVv4.js","/assets/IdleOwners-CgNV1g-M.js","/assets/IdleSolutions-C-Cdocbn.js","/assets/IdleSource-sZ8_QQpY.js","/assets/KPICard-DTtoP_Ki.js","/assets/Kaizen-D4lmTj-u.js","/assets/Kelish-DoMIRQAP.js","/assets/Kitchen-Bj9pw8Tp.js","/assets/KpiBits-CnOeP9W3.js","/assets/KpiDeltaCard-Dpwue7hD.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-BwtvEUBo.js","/assets/LeaderAppeal-NlNkPSNf.js","/assets/LeaderCutoffs-DJKBfp2o.js","/assets/LeaderDailyTasks-B7rqr4tl.js","/assets/LeaderDayExclusions-CoKhyR1d.js","/assets/LeaderDayReport-C_s6IPAE.js","/assets/LeaderTasksAdmin-bJ3-AygR.js","/assets/LeaderUnitReport-Bmx3Xmtj.js","/assets/Leaderboard-BNDQ0tCJ.js","/assets/Leaders-B8PWaQTb.js","/assets/LeadersKpi-DvdANVzJ.js","/assets/Lightbox-CKXJFCUd.js","/assets/LiveOverview-g4zMvc9Y.js","/assets/Login-wlzWCO7m.js","/assets/Logs-BiXOOxp4.js","/assets/LostWorkers-D6MlyeyI.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-DEe2ltV0.js","/assets/Notifications-DfcL_YXH.js","/assets/NotionTasks-BnKqCzCJ.js","/assets/NotionTrackerSettings-DZe-jnc_.js","/assets/Ontime-BT6ONua2.js","/assets/OrgChart-ZBQJ_Z0X.js","/assets/Ovens-C4Yet88c.js","/assets/OvensSettings-adTIoChF.js","/assets/Overview-D0lkPLS2.js","/assets/OwnerChip-DkO50jqX.js","/assets/PageAccess-DiV-6sMe.js","/assets/Pagination-Dc5x_pKC.js","/assets/People-DnsiUQry.js","/assets/PerenaladkaFactTable-Bh-JXZOu.js","/assets/Permissions-CShAvkqN.js","/assets/PersonCard-BpOO9Mfo.js","/assets/PlanFulfillment-BfNBjY7I.js","/assets/Production-BWjacFzL.js","/assets/ProductionUpload-e0EHrBc-.js","/assets/Profile-CEzDU_EK.js","/assets/ProfileAvatar-BirpwPkc.js","/assets/ProfilesManagement--BhAQ7Q5.js","/assets/ProofCamera-D27vqTtB.js","/assets/ProofPhoto-B9rudsWR.js","/assets/Quality-DefkY4O6.js","/assets/RawRows-CnHZybnM.js","/assets/Reports-BmYeRr8Z.js","/assets/RequestStateChip-DbgVhbgv.js","/assets/RichTextEditor-BHdZJKHM.js","/assets/SaveState-B3S95t6n.js","/assets/SearchInput-9AxFGTvl.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-Cp_iOxD1.js","/assets/ShiftDaily-DXc8J2Z-.js","/assets/ShiftTimes-Bq5Enj4c.js","/assets/Staff-DH5D8kwJ.js","/assets/StaffListAtCheck-BtzjVemA.js","/assets/StatusBadge-CgMkhVTQ.js","/assets/StatusBandsModal-DYXQJOCQ.js","/assets/TargetGoal-CI_BK669.js","/assets/Targets-DbWTv6c_.js","/assets/TaskFormModal-kRByPHU6.js","/assets/TaskerSettings-C3byGw2O.js","/assets/Tasks-NLNWhjcR.js","/assets/TgProfile-DfHVjm6J.js","/assets/TimeWheelPicker-Cwx6B16j.js","/assets/Tooltip-EUmLo2P0.js","/assets/TranslationsEditor-CTVcchW0.js","/assets/TrelloAnalytics-DyX6JpJ1.js","/assets/TrelloSettings-B9nRZbvF.js","/assets/TrendChart-Bd7CPkW7.js","/assets/TripleSpeedometer-og8mdsXt.js","/assets/Trudoyomkost-CPVk6zjg.js","/assets/UploadDropzone-IOUiRX2v.js","/assets/UsersActivity-pzcHAMJD.js","/assets/UsersManagement-fARLWcpP.js","/assets/VerdictBlock-kCP1lXR2.js","/assets/VerifixParity-Dfd4W7oD.js","/assets/VerifixSettings-CEd9okx0.js","/assets/VerifixSync-lp0TOGne.js","/assets/VfxApiMap-CnbhdPYK.js","/assets/VfxDictionaries-B2nICebj.js","/assets/VfxEmployees-BIi4-ixd.js","/assets/VfxHrMoves-Cl-5XvZ5.js","/assets/VfxJobs-BHYULVvl.js","/assets/VfxPhoto-BkfwQvRq.js","/assets/VfxShifts-BCIiEWlj.js","/assets/VfxState-VKUvAVjS.js","/assets/VfxTimebooks-Bwd-x9Jb.js","/assets/VfxTimesheet--1YsvMsv.js","/assets/WatchProgress-DW83qa1g.js","/assets/WebLogin-BzUKEMfn.js","/assets/WorkersAttendance-Cyf9W4Ls.js","/assets/WorkersComposition-BMFuukbZ.js","/assets/WorkersMovements-DWr7bOD7.js","/assets/WorkersPage-D91VFewl.js","/assets/Zagruzka-CxWlYVBd.js","/assets/ZagruzkaCell-ZUQHT94X.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-B2eMGy1-.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BCaL0dG0.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DpJifIjf.js","/assets/broadcastTree-BfBp5nwu.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BAOOXShf.js","/assets/cellMoveRefusal-EGdmayw9.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BJOTbFIn.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-D3uyElKy.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-IFCtst87.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CYv7Eb1K.js","/assets/index-lcrk4Snb.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BA4t-qbA.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DbO7OhSL.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-DDxI7-9G.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CP_K9wjr.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-BFwhLH5_.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BUYJCCXy.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-PU9Avc8U.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BQZsqJed.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-I_pnZYaf.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-pLFDRaEN.js","/assets/useOpenParam-DRdEhc8a.js","/assets/useStatusBands-BTHIgV-D.js","/assets/useUrlScope-33hr-AsZ.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-CPwjCjiy.js","/assets/uz_cyrl-BZUZyY18.js","/assets/vfx-D6Cmzjf2.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-BeaL29Qh.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
