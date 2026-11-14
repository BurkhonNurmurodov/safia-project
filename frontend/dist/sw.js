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

const BUILD = "2026-11-14T11:02:28.652Z";
const PRECACHE = ["/","/assets/ActionHistory-BWK8YHto.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-CMrRUHxN.js","/assets/AiKeys-CS_WYyGX.js","/assets/AnalysisBoard-DfbvYlK4.js","/assets/ApiAccess-CVc2j6-B.js","/assets/AppLauncher-BvBBwApc.js","/assets/Arc-CrmRzyxS.js","/assets/Assessment-BydSC7Cc.js","/assets/AssessmentGrade-DOlqOp_K.js","/assets/AssessmentList-BZNcRZSs.js","/assets/Assistant-UA5RkCfj.js","/assets/AttendanceCleanup-wLnkgxJ8.js","/assets/AttendanceUpload-7ezG-gXb.js","/assets/AuditTable-BgpwT_r6.js","/assets/BrigadirProfile-B794GoWp.js","/assets/BrigadirsKpi-DhmnDwLv.js","/assets/Broadcast-BisCaugS.js","/assets/BroadcastReceivers-BKzHPSmB.js","/assets/BroadcastRecord-Bn1YeHIK.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-BNBa_w5u.js","/assets/CategoryLegendModal-VgBp_OO3.js","/assets/CellConcerns-BfV78qU2.js","/assets/CellDetails-Cwk85AVm.js","/assets/CellFormModal-BH0yfOXt.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-DpgSyQj4.js","/assets/Cells-Cn3XY5JI.js","/assets/ColumnFilter-BKdd0MnX.js","/assets/ColumnsPicker-BDyDv7S2.js","/assets/CommentsModal-DOTLuAJg.js","/assets/ComparisonTable-D6hWISwH.js","/assets/Concerns-CbPB3ZP5.js","/assets/ConcernsPieces-A9nblVA_.js","/assets/ContainerFlow-BHD0LW3E.js","/assets/ContainerTotalsCard-Syvz3rDi.js","/assets/Containers-S7k9UVp8.js","/assets/CountStepper-BoCBNf3y.js","/assets/Daily-uj6vp3lZ.js","/assets/DataSources-Cb7jHFvw.js","/assets/DataTable--5xvEAn3.js","/assets/DateRangePicker-6REDbGLv.js","/assets/DayReportView-DhDTe7_F.js","/assets/DayStepper-_EK4Eyhi.js","/assets/DayStrip-Bw__3VSU.js","/assets/DbBackup-DuUXHqN1.js","/assets/DifferenceBreakdown-B1CZbRel.js","/assets/DocAudit-BDZ9La2y.js","/assets/Downtime-Dhn_aWM8.js","/assets/Education-B0bh4JZj.js","/assets/EducationLesson-t0bGGtY1.js","/assets/EmptyState-D49qAd6k.js","/assets/Exam-MFeE2UvG.js","/assets/ExamAdmin-DnU1xebc.js","/assets/Factories-ez3yqBxp.js","/assets/FactorySelect-g8djY8Pu.js","/assets/Gamification-DeVYAa0R.js","/assets/GroupBadge-DgAIE1b_.js","/assets/HeatmapChart-RR_fcLbr.js","/assets/HourlyContainers-CZvTzKgm.js","/assets/IdleCell-Z-XTO6x7.js","/assets/IdleOwners-DL2V5u7j.js","/assets/IdleSolutions-Colx0HTl.js","/assets/IdleSource-TCJnFIA_.js","/assets/KPICard-Yi9kpIdY.js","/assets/Kaizen-CwWxKlLn.js","/assets/Kelish-BuCEd5kp.js","/assets/Kitchen-ChAcZCEp.js","/assets/KpiBits-BaNwqWxU.js","/assets/KpiDeltaCard-BDME7qXO.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-BuVhQJ1v.js","/assets/LeaderAppeal-4H-lhjsm.js","/assets/LeaderCutoffs-DqJqMVxx.js","/assets/LeaderDailyTasks-ORH1wSB9.js","/assets/LeaderDayExclusions-BnUeh7Fp.js","/assets/LeaderDayReport-BnxabOSq.js","/assets/LeaderTasksAdmin-6RtRxIcg.js","/assets/LeaderUnitReport-Rq19QF_h.js","/assets/Leaderboard-BZYCNybE.js","/assets/Leaders-9qBOO-R1.js","/assets/LeadersKpi-CeuaXdQC.js","/assets/Lightbox-D3RsWdCa.js","/assets/LiveOverview--V3iJjh-.js","/assets/Login-CSmZ1cCr.js","/assets/Logs-bS8KQ2CW.js","/assets/LostWorkers-CTBRJ7k1.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-D_MG81CM.js","/assets/Notifications-QtN-iLtl.js","/assets/NotionTasks-8UrIi2gQ.js","/assets/NotionTrackerSettings-BQ5gES5k.js","/assets/Ontime-Mg0QGMG-.js","/assets/OrgChart-w0AdsLz9.js","/assets/Ovens-BzPVOhBV.js","/assets/OvensSettings-BvF3-ENa.js","/assets/Overview-Bsrj1m3X.js","/assets/OwnerChip-DENukxXh.js","/assets/PageAccess-DpUoVQkM.js","/assets/Pagination-BzeW7Erd.js","/assets/People-73JqAmRH.js","/assets/PerenaladkaFactTable-ZJHZ87dH.js","/assets/Permissions-B9-4mngH.js","/assets/PersonCard-viK5Wfyz.js","/assets/PlanFulfillment-DkGHSRXG.js","/assets/Production-vK9MU2eh.js","/assets/ProductionUpload-CFvW3BV0.js","/assets/Profile-q5tqU73A.js","/assets/ProfileAvatar-BV0VjORS.js","/assets/ProfilesManagement-BDW4gdci.js","/assets/ProofCamera-C5kyjnro.js","/assets/ProofPhoto-BfPRhRvi.js","/assets/Quality-CzTB6Cag.js","/assets/RawRows-i9Ds5ObF.js","/assets/Reports-KylSa-oU.js","/assets/RequestStateChip-ea6CmQR_.js","/assets/RichTextEditor-B2tpjVyG.js","/assets/SaveState-CLRejwL7.js","/assets/SearchInput-Cl37p9a_.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-BgtFNk6Y.js","/assets/ShiftDaily-DzujbLAI.js","/assets/ShiftTimes-Bx0Zlcq_.js","/assets/Staff-DWKmiDrM.js","/assets/StaffListAtCheck-Wt2-CGqz.js","/assets/StatusBadge-6Ykn6N-E.js","/assets/StatusBandsModal-BU-KYO2S.js","/assets/TargetGoal-HFCNZKrJ.js","/assets/Targets-BKFtPQsk.js","/assets/TaskerSettings-CSAJp_-U.js","/assets/Tasks-DK72-YqN.js","/assets/TgProfile-CqN6Al3w.js","/assets/TimeWheelPicker-P6XEj4ZX.js","/assets/Tooltip-CHQnTbTz.js","/assets/TranslationsEditor-DcfoI5QA.js","/assets/TrelloAnalytics-BBELsV1h.js","/assets/TrelloSettings-C50t_VZR.js","/assets/TrendChart-XaZay4K-.js","/assets/TripleSpeedometer-Dc_yrr2j.js","/assets/Trudoyomkost-CqpTwWZP.js","/assets/UploadDropzone-BLL42yfW.js","/assets/UsersActivity-CrZIv0zN.js","/assets/UsersManagement-R-TTZmja.js","/assets/VerdictBlock-CDYg83eb.js","/assets/VerifixParity-DAz_Kevv.js","/assets/VerifixSettings-BMKg1H6K.js","/assets/VerifixSync-DUPxXxye.js","/assets/VfxApiMap-tUWHl-Dh.js","/assets/VfxDictionaries-wXfS9nQH.js","/assets/VfxEmployees-Co908Hkd.js","/assets/VfxHrMoves-CwoOUHaF.js","/assets/VfxJobs-NY8Jnf7X.js","/assets/VfxPhoto-CynItHMS.js","/assets/VfxShifts-Do1NsEM3.js","/assets/VfxState-W2gQSfDR.js","/assets/VfxTimebooks-D50ZAdhV.js","/assets/VfxTimesheet-nGmH5XZH.js","/assets/WatchProgress-Dwuq2aWQ.js","/assets/WebLogin-CrxLlPrT.js","/assets/WorkersAttendance-BBNHGNCd.js","/assets/WorkersComposition-DhXOm6Ix.js","/assets/WorkersMovements-DT0qV5-e.js","/assets/WorkersPage-tlf4ykZD.js","/assets/Zagruzka-jZhe2ptN.js","/assets/ZagruzkaCell-DQJoQSfw.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CyZKpNGc.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BAhPGo9U.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-SLpICuK3.js","/assets/broadcastTree-Cagq80Pc.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-Wzes-Bii.js","/assets/cellMoveRefusal-BB2yp1-a.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-COXOOssa.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-BHXwwbLe.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DzAvGT7r.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BpKq9XZO.css","/assets/index-D3MZ4R8O.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-XFXI4CJ6.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BU7YIz2h.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-Du6HDTrS.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-B90tPrNb.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-DMyMAFat.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-DeZK3idi.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-4hE_SbuI.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DwIjJPQN.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-Cw236Opu.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-RlzBvJOz.js","/assets/useOpenParam-Dbu24SXs.js","/assets/useStatusBands-ClfPOj3o.js","/assets/useUrlScope-CXj_l6oL.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BtNk-zSS.js","/assets/uz_cyrl-DdCfxGDm.js","/assets/vfx-CTKSZDTQ.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup--tFfVDz_.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
