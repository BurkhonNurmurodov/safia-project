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

const BUILD = "2026-11-15T06:36:54.666Z";
const PRECACHE = ["/","/assets/ActionHistory-C8MZTMbm.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-CrltPC7V.js","/assets/AiKeys-CTwJ72ZH.js","/assets/AnalysisBoard-klFGcaRo.js","/assets/ApiAccess-C4HxaTCb.js","/assets/AppLauncher-7pvheRsG.js","/assets/Arc-BENZIJPf.js","/assets/Assessment-pdZbVEqJ.js","/assets/AssessmentGrade-tv70OXBh.js","/assets/AssessmentList-B3Xxmb1D.js","/assets/Assistant-C0Uuaypx.js","/assets/AttendanceCleanup-Dt6Km3XU.js","/assets/AttendanceUpload-DWny5WyU.js","/assets/AuditTable-CQuydmGi.js","/assets/BrigadirProfile-t6g_3Lkj.js","/assets/BrigadirsKpi-CZoVIyrR.js","/assets/Broadcast-Ci0x2B59.js","/assets/BroadcastReceivers-D7eGa9UP.js","/assets/BroadcastRecord-BqPak49y.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-DsPLSs7h.js","/assets/CategoryLegendModal-XZFBBVlW.js","/assets/CellConcerns-Cbosgr6v.js","/assets/CellDetails-BmzGznlO.js","/assets/CellFormModal-DFen3pKo.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-B9jwi7Vy.js","/assets/Cells-BhesyMGg.js","/assets/ColumnFilter-Cbx4Quu9.js","/assets/ColumnsPicker-g2-0nqoa.js","/assets/CommentsModal-Co2nLitx.js","/assets/ComparisonTable-CvHDf8VY.js","/assets/Concerns-TYTPAyL6.js","/assets/ConcernsPieces-B-nQKosD.js","/assets/ContainerFlow-mmMXr102.js","/assets/ContainerTotalsCard-CvXJ_BiK.js","/assets/Containers-BjF_dKkC.js","/assets/CountStepper-5FzDaIbq.js","/assets/Daily-D0oJyhrl.js","/assets/DataSources-Bqm6xt-X.js","/assets/DataTable-DpgXuNC2.js","/assets/DateRangePicker-WXmAqB-S.js","/assets/DayReportView-CQ9Rzbfx.js","/assets/DayStepper-lOZcsGHv.js","/assets/DayStrip-DMlmYokl.js","/assets/DbBackup-v14Td3Ug.js","/assets/DifferenceBreakdown-CQeigBRw.js","/assets/DocAudit-Db1I-4OK.js","/assets/Downtime-_GuCDo82.js","/assets/Education-CCPppwrS.js","/assets/EducationLesson-Cag7av6v.js","/assets/EmptyState-CPZf6foP.js","/assets/Exam-C4jR883t.js","/assets/ExamAdmin-CDJamfUF.js","/assets/Factories-BiIg7gV-.js","/assets/FactorySelect-21UjRvCm.js","/assets/Gamification-DlSxWxz4.js","/assets/GroupBadge-RTrBfVSm.js","/assets/HeatmapChart-WIgM2wAl.js","/assets/HourlyContainers-xAFs9Lh-.js","/assets/IdleCell-CtG1EwCR.js","/assets/IdleOwners-B2NWZu40.js","/assets/IdleSolutions-D0qbaNLA.js","/assets/IdleSource-2MypJV3y.js","/assets/KPICard-CrCjo7ZC.js","/assets/Kaizen-CCbOr2rO.js","/assets/Kelish-QESp3mAp.js","/assets/Kitchen-9JJXMBsU.js","/assets/KpiBits-aAp3rctl.js","/assets/KpiDeltaCard-BFcpAZYA.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-BdJ_djep.js","/assets/LeaderAppeal-De-VV7I3.js","/assets/LeaderCutoffs-Ci1V3t5Y.js","/assets/LeaderDailyTasks-BJqnC1tC.js","/assets/LeaderDayExclusions-DF6s78oB.js","/assets/LeaderDayReport-X1OL-oPs.js","/assets/LeaderTasksAdmin-CrbmVu4h.js","/assets/LeaderUnitReport-Dulfy-J-.js","/assets/Leaderboard-LwSv_paL.js","/assets/Leaders-Gt9M9jYR.js","/assets/LeadersKpi-BOK0J4al.js","/assets/Lightbox-C9lf02yw.js","/assets/LiveOverview-DHlEuMWC.js","/assets/Login-BSgrfBwn.js","/assets/Logs-BonQ8tNY.js","/assets/LostWorkers-CHOmfF2j.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-BmKA9RTu.js","/assets/Notifications-BhYkhgm7.js","/assets/NotionTasks-bjrlI5oA.js","/assets/NotionTrackerSettings-B2fpwNgO.js","/assets/Ontime-DIeK0JKe.js","/assets/OrgChart-DCwIsfGq.js","/assets/Ovens-Cw1Fl1Ba.js","/assets/OvensSettings-sQ1JvwDi.js","/assets/Overview-kmwx1EI0.js","/assets/OwnerChip-CdfjSOXy.js","/assets/PageAccess-CYviNKmq.js","/assets/Pagination-8aCUSi5K.js","/assets/People-XmacYGHs.js","/assets/PerenaladkaFactTable-Dcu4-spA.js","/assets/Permissions-k6qg1-KY.js","/assets/PersonCard-Cm9Lsu7b.js","/assets/PlanFulfillment-DixUTrvz.js","/assets/Production-CsYuwFrn.js","/assets/ProductionUpload-p1IwKLO4.js","/assets/Profile-B4_N07XS.js","/assets/ProfileAvatar-BXb6X3B1.js","/assets/ProfilesManagement-D64PYNC6.js","/assets/ProofCamera-B85_X7vf.js","/assets/ProofPhoto-DPW_g3ck.js","/assets/Quality-LnCqaBqc.js","/assets/RawRows-4ENKN7kk.js","/assets/Reports-DJYd19pj.js","/assets/RequestStateChip-COEJO9GZ.js","/assets/RichTextEditor-BexQ2b7h.js","/assets/SaveState-twhxWr7T.js","/assets/SearchInput-qsBD-sZf.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-D4oUUaGi.js","/assets/ShiftDaily-9Q9FMOql.js","/assets/ShiftTimes-jThVBrGR.js","/assets/Staff-QyUA2b4j.js","/assets/StaffListAtCheck-BtSKZYtV.js","/assets/StatusBadge-CQuf4Csf.js","/assets/StatusBandsModal-DX2J2CTo.js","/assets/TargetGoal-BRpF-HG0.js","/assets/Targets-NdWHHjok.js","/assets/TaskFormModal-BjnQY8yq.js","/assets/TaskerSettings-CGanZbmY.js","/assets/Tasks-BX0qa1rP.js","/assets/TgProfile-CKpNFGpG.js","/assets/TimeWheelPicker-B0LCrsdP.js","/assets/Tooltip-IiZbH4FK.js","/assets/TranslationsEditor-DfXNsuWJ.js","/assets/TrelloAnalytics-Bt4eo2sM.js","/assets/TrelloSettings-Ch0upKK0.js","/assets/TrendChart-KV0MpgLG.js","/assets/TripleSpeedometer-CBZQNpMQ.js","/assets/Trudoyomkost-TwkGSt78.js","/assets/UploadDropzone-DIXKWVMI.js","/assets/UsersActivity-CoXNdcvL.js","/assets/UsersManagement-BbDGhy6I.js","/assets/VerdictBlock-COkSaWWZ.js","/assets/VerifixParity-RizjlTR4.js","/assets/VerifixSettings-CM_isLmQ.js","/assets/VerifixSync-CUio5Fe3.js","/assets/VfxApiMap-RnH5LCz6.js","/assets/VfxDictionaries-Bo80kI2R.js","/assets/VfxEmployees-DXrx2QCR.js","/assets/VfxHrMoves-CMEKtHHN.js","/assets/VfxJobs-vN9YMW22.js","/assets/VfxPhoto-CMNax-z2.js","/assets/VfxShifts-h9GEIdZo.js","/assets/VfxState-BYbUveX8.js","/assets/VfxTimebooks-DegBbLc7.js","/assets/VfxTimesheet-BkEeOR_Q.js","/assets/WatchProgress-CheXASPP.js","/assets/WebLogin-VwsKXaMB.js","/assets/WorkersAttendance-bdUh7XJq.js","/assets/WorkersComposition-DQ-Suw2i.js","/assets/WorkersMovements-zUctf6wt.js","/assets/WorkersPage-BrxANovd.js","/assets/Zagruzka-Cc8iLhw4.js","/assets/ZagruzkaCell-DL0Wbpeb.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DFDXW9ie.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-D8OCb-u5.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-s7jR0CKW.js","/assets/broadcastTree-Cf52zTbz.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BZ3eS5qA.js","/assets/cellMoveRefusal-BSXM4wYW.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BbWUuueU.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-B7qj5QmE.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BA8PKMcZ.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-8v5vcMTm.js","/assets/index-BsH_8sse.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BA3gOzUt.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-3sh5Bx7r.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-BcjXGgZT.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BcTO9J_4.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-xVbaXhaX.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-Criemen7.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CI1_MW1Q.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-By9JqUu7.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-CGNX5W-J.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-CZojfMms.js","/assets/useOpenParam-DGCmknXZ.js","/assets/useStatusBands-B0oHqj2z.js","/assets/useUrlScope-Dx49Xp4z.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BRCFtug9.js","/assets/uz_cyrl-DdfzRhyt.js","/assets/vfx-D2_tnfRZ.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-Bz94RZRN.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
