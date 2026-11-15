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

const BUILD = "2026-11-15T07:11:26.783Z";
const PRECACHE = ["/","/assets/ActionHistory-JPBCYy5x.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-8cxc1DVI.js","/assets/AiKeys-DbFRXo-z.js","/assets/AnalysisBoard-DvmP9w0x.js","/assets/ApiAccess-pDQEWyjB.js","/assets/AppLauncher-CMxdSkbP.js","/assets/Arc-DwJ243WC.js","/assets/Assessment-6So3FA3_.js","/assets/AssessmentGrade-BV75jBfo.js","/assets/AssessmentList-DIm0xYJw.js","/assets/Assistant-DeRSWbaf.js","/assets/AttendanceCleanup-BpOe6Dc4.js","/assets/AttendanceUpload-CiKWZs_7.js","/assets/AuditTable-3M3MFAq4.js","/assets/BrigadirProfile-DahNwipN.js","/assets/BrigadirsKpi-CuiJgrJN.js","/assets/Broadcast-B0QWXUwX.js","/assets/BroadcastReceivers-aLBxN3qc.js","/assets/BroadcastRecord-EPXoE9YC.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-BTqv4g3-.js","/assets/CategoryLegendModal-CqK33e3y.js","/assets/CellConcerns-DSj2Jl4P.js","/assets/CellDetails-CwSPHnJe.js","/assets/CellFormModal-Myro3NBw.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-D8GPZTTk.js","/assets/Cells-CRMJtfrc.js","/assets/ColumnFilter-UsQ4_123.js","/assets/ColumnsPicker-BxvY4n5W.js","/assets/CommentsModal--YO2kKby.js","/assets/ComparisonTable-CxX8vSNW.js","/assets/Concerns-Bk3mfmz_.js","/assets/ConcernsPieces-aoz55bsS.js","/assets/ContainerFlow-BjDhuffg.js","/assets/ContainerTotalsCard-CCapInFe.js","/assets/Containers-y9wOAfNi.js","/assets/CountStepper-Ibf5zZSO.js","/assets/Daily-EDUD8sHI.js","/assets/DataSources-BYLW7Gl2.js","/assets/DataTable-CY4oKTeC.js","/assets/DateRangePicker-B6UTCUoN.js","/assets/DayReportView-qq_qRd1m.js","/assets/DayStepper-B-iouHK7.js","/assets/DayStrip-CKTE6f00.js","/assets/DbBackup-MTZHidYt.js","/assets/DifferenceBreakdown-BmsKeG2t.js","/assets/DocAudit-Cl4s3AUU.js","/assets/Downtime-ZEWGMUtC.js","/assets/Education-BBadMVQN.js","/assets/EducationLesson-XxyJ03Pq.js","/assets/EmptyState-C_P1IJKd.js","/assets/Exam-Dltzv18t.js","/assets/ExamAdmin-DkoR5rCi.js","/assets/Factories-ClMQMutc.js","/assets/FactorySelect-C2lfcrNu.js","/assets/Gamification-C21bg0ez.js","/assets/GroupBadge-0fYTqKqh.js","/assets/HeatmapChart-C5IEn2GN.js","/assets/HourlyContainers-lG7FpRq4.js","/assets/IdleCell-C4uqLsL2.js","/assets/IdleOwners-DROHJTBm.js","/assets/IdleSolutions-D2djKj7s.js","/assets/IdleSource-CLzBls_t.js","/assets/KPICard-CmDF2kei.js","/assets/Kaizen-qFrWZ22w.js","/assets/Kelish-CYN0BtNC.js","/assets/Kitchen-CoMQiyQp.js","/assets/KpiBits-DZRLiKM7.js","/assets/KpiDeltaCard-B28S8VDk.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-BnPYyxNF.js","/assets/LeaderAppeal-BrxjhjrE.js","/assets/LeaderCutoffs-C52tZxjV.js","/assets/LeaderDailyTasks-G3vE01vR.js","/assets/LeaderDayExclusions-B6oJj1Vp.js","/assets/LeaderDayReport-DbXDrRLh.js","/assets/LeaderTasksAdmin-C1W6sarH.js","/assets/LeaderUnitReport-EtXpUI1_.js","/assets/Leaderboard-DB_CBSq4.js","/assets/Leaders-kbplzPqy.js","/assets/LeadersKpi-x8WT7Ibg.js","/assets/Lightbox-D_3zWTia.js","/assets/LiveOverview-DG3HA1YK.js","/assets/Login-C9G7kcXN.js","/assets/Logs-BjoyVf8f.js","/assets/LostWorkers-CbikVIxg.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-Bh0_yPW8.js","/assets/Notifications-Czmr8YW8.js","/assets/NotionTasks-BDi9pZhD.js","/assets/NotionTrackerSettings-DmQCoG8f.js","/assets/Ontime-D3Dfhfpn.js","/assets/OrgChart-C7eTfHn3.js","/assets/Ovens-CwSLr4GE.js","/assets/OvensSettings-B-c5QG0t.js","/assets/Overview-BMhgM9er.js","/assets/OwnerChip-BHAGtMlr.js","/assets/PageAccess-DYBavgYY.js","/assets/Pagination-CLKkHJ_h.js","/assets/People-Bmk__eE_.js","/assets/PerenaladkaFactTable-CUy2eJPa.js","/assets/Permissions-Ai1gqQih.js","/assets/PersonCard-DARLCn2Z.js","/assets/PlanFulfillment-CkwVCT7k.js","/assets/Production-BSBj9UXF.js","/assets/ProductionUpload-CmiVsg2L.js","/assets/Profile-UtCa4dmC.js","/assets/ProfileAvatar-BGO3tN4D.js","/assets/ProfilesManagement-Cz1T96W5.js","/assets/ProofCamera-S0nbaj_k.js","/assets/ProofPhoto-evhzOaqj.js","/assets/Quality-CXSBuFPj.js","/assets/RawRows-qL2gZ98Z.js","/assets/Reports-HQLbPVH_.js","/assets/RequestStateChip-BCRsuGXV.js","/assets/RichTextEditor-0rj49c26.js","/assets/SaveState-DKdOPL_x.js","/assets/SearchInput-DAUIX0cr.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-COmo9zqm.js","/assets/ShiftDaily-ZcRTh3lE.js","/assets/ShiftTimes-BevxSy0Z.js","/assets/Staff-do0NO5Js.js","/assets/StaffListAtCheck-CMrwdAl4.js","/assets/StatusBadge-BKRwE9uK.js","/assets/StatusBandsModal-C61hD4LE.js","/assets/TargetGoal-k0bo51Om.js","/assets/Targets-4qLuxLL0.js","/assets/TaskFormModal-BhoP6PDx.js","/assets/TaskerSettings-UPUnL0WT.js","/assets/Tasks-VZk9y4K1.js","/assets/TgProfile-B16IIDYr.js","/assets/TimeWheelPicker-BlDKvxyU.js","/assets/Tooltip-xDIYJ7m3.js","/assets/TranslationsEditor-Bil5Zfa3.js","/assets/TrelloAnalytics-DgAoQFjW.js","/assets/TrelloSettings-C2Qokjea.js","/assets/TrendChart-CkIECzFu.js","/assets/TripleSpeedometer-DJAErTi5.js","/assets/Trudoyomkost-DmWbKp_v.js","/assets/UploadDropzone-DX0P4lKt.js","/assets/UsersActivity-BRIDHZ0Y.js","/assets/UsersManagement-BH89DCo5.js","/assets/VerdictBlock-N30nBET9.js","/assets/VerifixParity-wq9vaq2s.js","/assets/VerifixSettings-Cboahorp.js","/assets/VerifixSync-CB9Kvexk.js","/assets/VfxApiMap-B4yqKlpD.js","/assets/VfxDictionaries-DzVG4nYJ.js","/assets/VfxEmployees-CNtvunMC.js","/assets/VfxHrMoves-htumDbEz.js","/assets/VfxJobs-DbgFT7Om.js","/assets/VfxPhoto-CMALS5nM.js","/assets/VfxShifts-W8W8YJM9.js","/assets/VfxState-DfNlWqvH.js","/assets/VfxTimebooks-B7yYFHqC.js","/assets/VfxTimesheet-DFJsMZgj.js","/assets/WatchProgress-XXpIZR08.js","/assets/WebLogin-B7Jhd0Z-.js","/assets/WorkersAttendance-WofHkJNO.js","/assets/WorkersComposition-J2A_Aup_.js","/assets/WorkersMovements-Dnyl9PRt.js","/assets/WorkersPage-W9iLArmp.js","/assets/Zagruzka-CkcwtmsE.js","/assets/ZagruzkaCell-n15-urPT.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BB-h6OPx.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CbwBnpt5.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Dd6Bp_N5.js","/assets/broadcastTree-BmUSEEJk.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories--oLc6LOD.js","/assets/cellMoveRefusal-BZLyDpcv.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-B3Wl1BOM.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-GCPNOwMk.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BHTehN_I.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BtQgpn1V.js","/assets/index-Dm5YYQKZ.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CF9Jve21.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-C2cEu-F6.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-CJ3bnJMx.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers--YRrCnH9.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-CpPpQf9C.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-C0A514TZ.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-Cgp1XgOC.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CeGFonKP.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-CCLT4py4.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-DPfaMyxA.js","/assets/useOpenParam-DSAJk878.js","/assets/useStatusBands-EpnWovMQ.js","/assets/useUrlScope-BjAQNh95.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BLHOVKpU.js","/assets/uz_cyrl-CJ4DG-Yq.js","/assets/vfx-mxgkHiiZ.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-CRmwZwJt.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
