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

const BUILD = "2026-11-15T06:49:18.801Z";
const PRECACHE = ["/","/assets/ActionHistory-2ID0SYXP.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-DwpnllI8.js","/assets/AiKeys-Dwd1bbLq.js","/assets/AnalysisBoard-BDfJBNMm.js","/assets/ApiAccess-CLmQv1Lr.js","/assets/AppLauncher-D7D5ELiM.js","/assets/Arc-tkXZqNwM.js","/assets/Assessment-26W5I--g.js","/assets/AssessmentGrade-BmCFxEvS.js","/assets/AssessmentList-DCfjgaPu.js","/assets/Assistant-CXWmacCn.js","/assets/AttendanceCleanup-DqmoWbgK.js","/assets/AttendanceUpload-Ds-d-Xqd.js","/assets/AuditTable-CcBAV8SD.js","/assets/BrigadirProfile-BwKCTNV4.js","/assets/BrigadirsKpi-DN2VOWiw.js","/assets/Broadcast-C0PuK_dJ.js","/assets/BroadcastReceivers-CFUnoXaU.js","/assets/BroadcastRecord-B-UdWGgo.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-Bj3gxVTh.js","/assets/CategoryLegendModal-B4r5GumA.js","/assets/CellConcerns-CRlVGsLi.js","/assets/CellDetails-DfTz3_Lq.js","/assets/CellFormModal-CynrYDAK.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-BGNS45L7.js","/assets/Cells-RGsgnuN_.js","/assets/ColumnFilter-Cp9ICj7P.js","/assets/ColumnsPicker-FO8npvPn.js","/assets/CommentsModal-C9gKO0mO.js","/assets/ComparisonTable-BoCSsXiK.js","/assets/Concerns-DxCbvm0i.js","/assets/ConcernsPieces-CueC3qja.js","/assets/ContainerFlow-BgpNxhBg.js","/assets/ContainerTotalsCard-BuPFXIy-.js","/assets/Containers-DHA_G3Td.js","/assets/CountStepper-2LLnsfwp.js","/assets/Daily-DZi378WN.js","/assets/DataSources-DSeoHXYA.js","/assets/DataTable-reConNEl.js","/assets/DateRangePicker-BGl3PHGR.js","/assets/DayReportView-cZxH4K4y.js","/assets/DayStepper-B0ToCBKV.js","/assets/DayStrip-CYUy1ji_.js","/assets/DbBackup-DwiqoCUq.js","/assets/DifferenceBreakdown-s3yzM4yR.js","/assets/DocAudit-DRm1trI8.js","/assets/Downtime-nBOEY5GN.js","/assets/Education-B5c3ggJi.js","/assets/EducationLesson-QHZ5scK4.js","/assets/EmptyState-CQ_1h9rs.js","/assets/Exam-CzSEPdL6.js","/assets/ExamAdmin-8F9lfNkt.js","/assets/Factories-D73fNdoU.js","/assets/FactorySelect-BE0mi-uf.js","/assets/Gamification-D9Z8Er6V.js","/assets/GroupBadge-B2JwONan.js","/assets/HeatmapChart-B5eRhA6C.js","/assets/HourlyContainers-Bt0unsB8.js","/assets/IdleCell-D-Pm_fNV.js","/assets/IdleOwners-x7y6m1-T.js","/assets/IdleSolutions-DhivVtJd.js","/assets/IdleSource-BnNRr19c.js","/assets/KPICard-Cbwzy3Jp.js","/assets/Kaizen-Bx4t5HbT.js","/assets/Kelish-o5As4BQ2.js","/assets/Kitchen-BLqTGkIT.js","/assets/KpiBits-DOhbTPAh.js","/assets/KpiDeltaCard-ixR5PwXy.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-B9yB1DfV.js","/assets/LeaderAppeal-5foX3k2R.js","/assets/LeaderCutoffs-BW402hR-.js","/assets/LeaderDailyTasks-B6PvmvXA.js","/assets/LeaderDayExclusions-DJRVKAUW.js","/assets/LeaderDayReport-BfJcnBmZ.js","/assets/LeaderTasksAdmin-BzbGTCj8.js","/assets/LeaderUnitReport-Cj0-p6Sx.js","/assets/Leaderboard-DFScjuT4.js","/assets/Leaders-DDDBw7z4.js","/assets/LeadersKpi-Bu7k1yyc.js","/assets/Lightbox-DCK4iJUE.js","/assets/LiveOverview-B9FtWiXO.js","/assets/Login-CkooSFq-.js","/assets/Logs-BTJBzHQC.js","/assets/LostWorkers-Bgh0WOoC.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-DlBSUTNP.js","/assets/Notifications-B4mNZMcW.js","/assets/NotionTasks-CnykXOUa.js","/assets/NotionTrackerSettings-DuulgiP7.js","/assets/Ontime-BWADy3Ti.js","/assets/OrgChart-DVjQcQeV.js","/assets/Ovens-1twOgOlD.js","/assets/OvensSettings-Dey3zUx4.js","/assets/Overview-RsjQKKX9.js","/assets/OwnerChip-BOr70ZDx.js","/assets/PageAccess-DcsCC1eh.js","/assets/Pagination-DTdQkMcP.js","/assets/People-Qok80hRY.js","/assets/PerenaladkaFactTable-CkFw_vFJ.js","/assets/Permissions-Bx4o1MFz.js","/assets/PersonCard-D8SSbDM1.js","/assets/PlanFulfillment-D6yeFsPC.js","/assets/Production-DEVo1hCA.js","/assets/ProductionUpload-C6qq3c1b.js","/assets/Profile-B4jPaAi5.js","/assets/ProfileAvatar-CfJzFR5O.js","/assets/ProfilesManagement-hT_DtAzu.js","/assets/ProofCamera-CLqKtJL5.js","/assets/ProofPhoto-B9LoZLQ8.js","/assets/Quality-J3uXvIGX.js","/assets/RawRows-BJcsUjQG.js","/assets/Reports-CGpkTsPq.js","/assets/RequestStateChip-BZx3CqbZ.js","/assets/RichTextEditor-CyZstNTe.js","/assets/SaveState-CLKJJYBW.js","/assets/SearchInput-ll70596H.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-CjUqhbUi.js","/assets/ShiftDaily-3WmupEaN.js","/assets/ShiftTimes-x5dR_EoN.js","/assets/Staff-ywyxZA61.js","/assets/StaffListAtCheck-AoHlz-0M.js","/assets/StatusBadge-BbXCY-F_.js","/assets/StatusBandsModal-BtSEuAA4.js","/assets/TargetGoal-CSjE0zHt.js","/assets/Targets-BfqcFqOn.js","/assets/TaskFormModal-CoAg6a00.js","/assets/TaskerSettings-Be6X7YxP.js","/assets/Tasks-CV_diCAC.js","/assets/TgProfile-BA5PTbhJ.js","/assets/TimeWheelPicker-4WsmKtyr.js","/assets/Tooltip-B1F_SFQc.js","/assets/TranslationsEditor-CKl0spDF.js","/assets/TrelloAnalytics-B7yf2Mbh.js","/assets/TrelloSettings-C4odVLo1.js","/assets/TrendChart-DlPzGdwA.js","/assets/TripleSpeedometer-Bv38633q.js","/assets/Trudoyomkost-xHNLh3VV.js","/assets/UploadDropzone-DgEySzuY.js","/assets/UsersActivity-CszsPHsS.js","/assets/UsersManagement-DXA491iY.js","/assets/VerdictBlock-CIa-KHIz.js","/assets/VerifixParity-BTLIb9xd.js","/assets/VerifixSettings-BtruOvSm.js","/assets/VerifixSync-Bw86OMKq.js","/assets/VfxApiMap-a1rieE--.js","/assets/VfxDictionaries-CPyObk__.js","/assets/VfxEmployees-BuRKLoBM.js","/assets/VfxHrMoves-COBox-6z.js","/assets/VfxJobs-BjTeT9G_.js","/assets/VfxPhoto-PzMiiW0F.js","/assets/VfxShifts-B_DKZkDX.js","/assets/VfxState-CkPiySMQ.js","/assets/VfxTimebooks-pXWR0afN.js","/assets/VfxTimesheet-CWi9j_-e.js","/assets/WatchProgress-D_pUldau.js","/assets/WebLogin-CTTcoJsn.js","/assets/WorkersAttendance-B2-gKPZr.js","/assets/WorkersComposition-DPiIgQPh.js","/assets/WorkersMovements-CISjRECk.js","/assets/WorkersPage-Bqf1hJia.js","/assets/Zagruzka-CtHAeaGE.js","/assets/ZagruzkaCell-B7jEP2-O.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Yc-2o1bu.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-akx83zHc.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-YxEt9XsU.js","/assets/broadcastTree-B7bowq44.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BW7lVYRz.js","/assets/cellMoveRefusal-Dc-J06_U.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-D_X5LnC8.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-B7qj5QmE.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-D0IwrRkn.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-B9Z_Cj_F.js","/assets/index-Dm5YYQKZ.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CThf2mU-.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-B3kmYF6T.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-NiyPVRdM.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CqKThFbf.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-xVbaXhaX.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-Cj37H5tu.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-Dz6rg_IP.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-tBUqaxL6.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-BIrpanbQ.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-Cz_JQS7l.js","/assets/useOpenParam-DZG03rIN.js","/assets/useStatusBands-qOhMyYRU.js","/assets/useUrlScope-BbAfFXcT.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-D8UAVSS_.js","/assets/uz_cyrl-BTn8ELRv.js","/assets/vfx-BM6GkgdF.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-S3k_3jRe.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
