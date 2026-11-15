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

const BUILD = "2026-11-15T07:10:24.221Z";
const PRECACHE = ["/","/assets/ActionHistory-Br2355J-.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-BP5487pv.js","/assets/AiKeys-BS4R_X59.js","/assets/AnalysisBoard-qspTGayM.js","/assets/ApiAccess-BgiI7pc8.js","/assets/AppLauncher-BCXqgO8X.js","/assets/Arc-DARYv2_M.js","/assets/Assessment-B3L4dEKj.js","/assets/AssessmentGrade-ToHOGemC.js","/assets/AssessmentList-C1Y92Gjo.js","/assets/Assistant-dvVeoXae.js","/assets/AttendanceCleanup-phCK6a3_.js","/assets/AttendanceUpload-vhMtPmza.js","/assets/AuditTable-H01k8hNp.js","/assets/BrigadirProfile-CvMKPeXy.js","/assets/BrigadirsKpi-C1HIz6oa.js","/assets/Broadcast-CKVkuob3.js","/assets/BroadcastReceivers-CxM6260J.js","/assets/BroadcastRecord-CzGTfTo4.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-C5VuCL2a.js","/assets/CategoryLegendModal-DInUFeDo.js","/assets/CellConcerns-CgOIxoWb.js","/assets/CellDetails-BNIOf_OL.js","/assets/CellFormModal-LZI-SNek.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-CZB0j-hE.js","/assets/Cells-C1j77IpT.js","/assets/ColumnFilter-Ctv5NNGv.js","/assets/ColumnsPicker-Yyasg3U9.js","/assets/CommentsModal-DAInbumx.js","/assets/ComparisonTable-BRuz1Id1.js","/assets/Concerns-BHn_dC-7.js","/assets/ConcernsPieces-QTWofil5.js","/assets/ContainerFlow-DhbF1FB9.js","/assets/ContainerTotalsCard--SSj75-u.js","/assets/Containers-DhYSQ7Mw.js","/assets/CountStepper-BgePyjcC.js","/assets/Daily-DxiePA-G.js","/assets/DataSources-CHePIUAH.js","/assets/DataTable-DD0OvsYc.js","/assets/DateRangePicker-lBi9jMwP.js","/assets/DayReportView-C91m4U8K.js","/assets/DayStepper-XOeKGl6l.js","/assets/DayStrip-CYxYyYAY.js","/assets/DbBackup-BcfSapXJ.js","/assets/DifferenceBreakdown-BWnPPlvm.js","/assets/DocAudit-_eNlLVzY.js","/assets/Downtime-lI4woe8J.js","/assets/Education-B_SYd8Kl.js","/assets/EducationLesson-BcihwnXe.js","/assets/EmptyState-Cqu_JCn-.js","/assets/Exam-D9btyOA8.js","/assets/ExamAdmin-BaiTc-s9.js","/assets/Factories-BEpeZUTJ.js","/assets/FactorySelect-8oM7bauQ.js","/assets/Gamification-GmXZKRux.js","/assets/GroupBadge-U_fES3NV.js","/assets/HeatmapChart-BPs08lvB.js","/assets/HourlyContainers-Dnt0encg.js","/assets/IdleCell-C7ghsmmR.js","/assets/IdleOwners-CryDCHAK.js","/assets/IdleSolutions-D3NhCKMU.js","/assets/IdleSource-D4AQySVD.js","/assets/KPICard-CHMan_c5.js","/assets/Kaizen-CiTZ0c-j.js","/assets/Kelish-BgfUVM-H.js","/assets/Kitchen-D9xPifJi.js","/assets/KpiBits-G5svwxky.js","/assets/KpiDeltaCard-EYGwdrtV.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-CURud3Mf.js","/assets/LeaderAppeal-Dgme8PUD.js","/assets/LeaderCutoffs-BZlY3JH5.js","/assets/LeaderDailyTasks-LX_b7Nip.js","/assets/LeaderDayExclusions-vfXF2g70.js","/assets/LeaderDayReport-CtdY1lyQ.js","/assets/LeaderTasksAdmin-GDooAZ1I.js","/assets/LeaderUnitReport-DG1rzoxl.js","/assets/Leaderboard-Cet5orFZ.js","/assets/Leaders-CN5nu-H3.js","/assets/LeadersKpi-DtMuib7R.js","/assets/Lightbox-DaiAsPGG.js","/assets/LiveOverview-r3crOae2.js","/assets/Login-BGf7JwKT.js","/assets/Logs-BZ_6_4n4.js","/assets/LostWorkers-tMkuuxD_.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-CcycapKN.js","/assets/Notifications-D2_9frsR.js","/assets/NotionTasks-C182fy1T.js","/assets/NotionTrackerSettings-B_nPGfUP.js","/assets/Ontime-D_JaBxpi.js","/assets/OrgChart-BibdgKXk.js","/assets/Ovens-DqJc9zBx.js","/assets/OvensSettings-CcWQdfs7.js","/assets/Overview-DBsswK_4.js","/assets/OwnerChip-BWZBcQa8.js","/assets/PageAccess-jgJTY5WF.js","/assets/Pagination-D_Kc7K95.js","/assets/People-CN-PSg4P.js","/assets/PerenaladkaFactTable-Bn5L9WaG.js","/assets/Permissions-TPjz_ZXG.js","/assets/PersonCard-p0Smghaz.js","/assets/PlanFulfillment-QmJRsBRS.js","/assets/Production-DCe4Ay1g.js","/assets/ProductionUpload-Cvkjj2xb.js","/assets/Profile-DS3QEDhP.js","/assets/ProfileAvatar-fDG66PMN.js","/assets/ProfilesManagement-CY2l2jST.js","/assets/ProofCamera-TihXrSY8.js","/assets/ProofPhoto-Ce4j1Tv2.js","/assets/Quality-BC48-bZg.js","/assets/RawRows-BEqtadT5.js","/assets/Reports-B1EbN39R.js","/assets/RequestStateChip-Dkft4ENP.js","/assets/RichTextEditor-JPcGXHPG.js","/assets/SaveState-BY1vMqgf.js","/assets/SearchInput-C8Nl2UEQ.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-BqFEzv2H.js","/assets/ShiftDaily-D43wnb5Y.js","/assets/ShiftTimes-Dy5p_auB.js","/assets/Staff-rWHHBfKU.js","/assets/StaffListAtCheck-DUKrXwe7.js","/assets/StatusBadge-CswGNE9Q.js","/assets/StatusBandsModal-BBv3GpfP.js","/assets/TargetGoal-BpgeBoFn.js","/assets/Targets-C5UakPio.js","/assets/TaskFormModal-B03uD7ue.js","/assets/TaskerSettings-kziW5frk.js","/assets/Tasks-D3G1YT9Z.js","/assets/TgProfile-fHXaC5CD.js","/assets/TimeWheelPicker-BDQ3wWzP.js","/assets/Tooltip-CDLagODN.js","/assets/TranslationsEditor-CbHYTY9S.js","/assets/TrelloAnalytics-DHfC9yH3.js","/assets/TrelloSettings-Bygfrt7M.js","/assets/TrendChart-DtcV-lFj.js","/assets/TripleSpeedometer-VQxr-pe-.js","/assets/Trudoyomkost-CFQbd1La.js","/assets/UploadDropzone-aeI66Vl9.js","/assets/UsersActivity-CX6TCGOx.js","/assets/UsersManagement-Dv30vQaJ.js","/assets/VerdictBlock-uZFcaeK4.js","/assets/VerifixParity-4fVukP3k.js","/assets/VerifixSettings-DMU9-0bh.js","/assets/VerifixSync-NORYr-GW.js","/assets/VfxApiMap-DzxiP8MO.js","/assets/VfxDictionaries-vAGA5nJS.js","/assets/VfxEmployees-DXWLScjC.js","/assets/VfxHrMoves-DTFqCGdK.js","/assets/VfxJobs-EUuxObbL.js","/assets/VfxPhoto-xQWUovwq.js","/assets/VfxShifts-SEzy3ej8.js","/assets/VfxState-BDw5VTjD.js","/assets/VfxTimebooks-pi6GNUrD.js","/assets/VfxTimesheet-B0n8j1sQ.js","/assets/WatchProgress-Gpwb1L-d.js","/assets/WebLogin-CaVoSOoa.js","/assets/WorkersAttendance-DX_Ed6qf.js","/assets/WorkersComposition-BHKFRgR-.js","/assets/WorkersMovements-DP40boqk.js","/assets/WorkersPage-Dl0Yw3ak.js","/assets/Zagruzka-Bmjz1zHk.js","/assets/ZagruzkaCell-DPGm38nt.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DL9NWpZj.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CArYTZwN.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-D-7oXINz.js","/assets/broadcastTree-D4emViSu.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-CXRdVOUq.js","/assets/cellMoveRefusal-BkeRvKzV.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-C7_4D8sC.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-DS5RmU4I.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BekPjYHU.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-C3gbWWNE.js","/assets/index-Dm5YYQKZ.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DlfFdxqA.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-B1tZBca7.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-fGp4dCP0.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BcbgY6oE.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-ltVtbnDS.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BO2y9EZv.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-BsbRSHGq.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CTYogITM.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-Biicqego.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-uqaaC-EV.js","/assets/useOpenParam-D6j0gp4h.js","/assets/useStatusBands-nOAyI038.js","/assets/useUrlScope-DYUy5KiT.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BOeaiOiv.js","/assets/uz_cyrl-CUkNUnev.js","/assets/vfx-8s5fMaTx.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-CT34dEes.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
