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

const BUILD = "2026-11-13T11:55:00.644Z";
const PRECACHE = ["/","/assets/ActionHistory-VDjMBSij.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-DjpnTrCq.js","/assets/AiKeys-Bl52nhty.js","/assets/AnalysisBoard-B4z-gNZm.js","/assets/ApiAccess-NWwKlQap.js","/assets/AppLauncher-DiUEEGQJ.js","/assets/Arc-DkbFjA8p.js","/assets/Assessment-BOymom4Z.js","/assets/AssessmentGrade-BBQQTu8c.js","/assets/AssessmentList-CpeQ6jdW.js","/assets/Assistant-Cl4pknBm.js","/assets/AttendanceCleanup-DwYlfu-B.js","/assets/AttendanceUpload-BCdGgatZ.js","/assets/AuditTable-C8U5nkEs.js","/assets/BrigadirProfile-DuJw1YQx.js","/assets/BrigadirsKpi-vxc7s3gg.js","/assets/Broadcast-DPSq3twc.js","/assets/BroadcastReceivers-C8BuZ4i6.js","/assets/BroadcastRecord-3fq1xQlq.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-B8lmVJin.js","/assets/CategoryLegendModal-CssvV-np.js","/assets/CellConcerns-Dc0a-ohH.js","/assets/CellDetails-p20SdL8N.js","/assets/CellFormModal-Bcwn02mH.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-BdYTplVA.js","/assets/Cells-DkEIx6FG.js","/assets/ColumnFilter-Cbexu8_v.js","/assets/ColumnsPicker-Blub6ERP.js","/assets/CommentsModal-BWxAUMk6.js","/assets/ComparisonTable-p-dSa8wG.js","/assets/Concerns-BMGDoGeD.js","/assets/ConcernsPieces-YLQQ584S.js","/assets/ContainerTotalsCard-D6QkljWf.js","/assets/Containers-CjR6RN65.js","/assets/CountStepper-QztyxTLN.js","/assets/Daily-D-lB_xZQ.js","/assets/DataSources-C7O9ff44.js","/assets/DataTable-CoED3e9f.js","/assets/DateRangePicker-7reVPDkC.js","/assets/DayReportView-DwWC7CRf.js","/assets/DayStepper-e1dCzUoz.js","/assets/DayStrip-CS-eSpgg.js","/assets/DbBackup-D5EAj4Cp.js","/assets/DifferenceBreakdown-CZDvi8JY.js","/assets/DocAudit-Ct0GbtTP.js","/assets/Downtime-CY5nPHPx.js","/assets/Education-knUedvGb.js","/assets/EducationLesson-CsQtyEOr.js","/assets/EmptyState-B9nSa38j.js","/assets/Exam-dxBimAbP.js","/assets/ExamAdmin-DcctVIu-.js","/assets/Factories-g5_oRjz1.js","/assets/FactorySelect-BNZbIjBB.js","/assets/Gamification-C1wTaUKd.js","/assets/GroupBadge-DC6_zhzQ.js","/assets/HeatmapChart-DKZ_QgNA.js","/assets/HourlyContainers-Bk2iU2Fy.js","/assets/IdleCell-CbBLLFV_.js","/assets/IdleOwners-BZAj5j4u.js","/assets/IdleSolutions-BFov1iew.js","/assets/IdleSource-BFsqrZzu.js","/assets/KPICard-CP6HsA1A.js","/assets/Kaizen-DQP73aH3.js","/assets/Kelish-D_Wp0Lsm.js","/assets/Kitchen-_yDazPjD.js","/assets/KpiBits-D_kjN5D4.js","/assets/KpiDeltaCard-DVypmOmn.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-D2jmg-yC.js","/assets/LeaderAppeal-BRcZRdgQ.js","/assets/LeaderCutoffs-BH5gEBqO.js","/assets/LeaderDailyTasks-2t-qiiH-.js","/assets/LeaderDayExclusions-BJCpYfzX.js","/assets/LeaderDayReport-CycCQLQJ.js","/assets/LeaderTasksAdmin-L2dzhr05.js","/assets/LeaderUnitReport-B3xt9ayi.js","/assets/Leaderboard-ATjICTJH.js","/assets/Leaders-CyC1y0tY.js","/assets/LeadersKpi-DToNgFwS.js","/assets/Lightbox-DmBAcqDZ.js","/assets/LiveOverview-CGtGjGy0.js","/assets/Login-CQceqZSw.js","/assets/Logs-BHHsF8vn.js","/assets/LostWorkers-D4rI8_U8.js","/assets/NotFound-Qkxh1dEo.js","/assets/Notifications-B2KPf7nN.js","/assets/NotionTasks-GUUKo8Ws.js","/assets/NotionTrackerSettings-DrRUyBZl.js","/assets/Ontime-CdtrgDIs.js","/assets/OrgChart-B4tii5Mk.js","/assets/Ovens-S9VNwm1N.js","/assets/OvensSettings-BZqKZbli.js","/assets/Overview-Dixk8JEp.js","/assets/OwnerChip-DHEFvYOd.js","/assets/PageAccess-BDeb1OqV.js","/assets/Pagination-BzvOFMkQ.js","/assets/People-BMwteqBo.js","/assets/PerenaladkaFactTable-OZH00fYq.js","/assets/Permissions-C3B51KxZ.js","/assets/PersonCard-kzOF7ikB.js","/assets/PlanFulfillment-Dd3VUkSX.js","/assets/Production-DuSOtBlH.js","/assets/ProductionUpload-dr401QjJ.js","/assets/Profile-BwwZpJYj.js","/assets/ProfileAvatar-Cijk9pUS.js","/assets/ProfilesManagement-CqDGKkZy.js","/assets/ProofCamera-S9yOu5IE.js","/assets/ProofPhoto-DFSfko9y.js","/assets/Quality-D8Cj6NWX.js","/assets/RawRows-BYzehGOb.js","/assets/Reports-DhcNLZCL.js","/assets/RequestStateChip-D-AP7T1_.js","/assets/RichTextEditor-CzmvOg4r.js","/assets/SaveState-CByxM6P8.js","/assets/SearchInput-CWIucTYu.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-DnO9T6yH.js","/assets/ShiftDaily-Uo2twX8d.js","/assets/ShiftTimes-D02AHvWY.js","/assets/Staff-BEDOxekw.js","/assets/StaffListAtCheck-CxbjS617.js","/assets/StatusBadge-DIn1pi5f.js","/assets/StatusBandsModal-HChWrzji.js","/assets/TargetGoal-BtGCyGx8.js","/assets/Targets-DgoCT2f6.js","/assets/TaskerSettings-D4Q0zdpJ.js","/assets/Tasks-CtTEYxsx.js","/assets/TgProfile-CHq3ufV5.js","/assets/TimeWheelPicker-DCXlo4Ey.js","/assets/Tooltip-BQOoghB-.js","/assets/TranslationsEditor-CahukxL2.js","/assets/TrelloAnalytics-DKUL4Pou.js","/assets/TrelloSettings-BgK7wBD3.js","/assets/TrendChart-BfmbDEgC.js","/assets/TripleSpeedometer-BpMjkpW8.js","/assets/Trudoyomkost-DcM12Z8G.js","/assets/UploadDropzone-Db68AnNQ.js","/assets/UsersActivity-fsUR9iZv.js","/assets/UsersManagement-B_I_f5vC.js","/assets/VerdictBlock-BdSVNWDW.js","/assets/VerifixParity-BdjIKqth.js","/assets/VerifixSettings-COG5hdYb.js","/assets/VerifixSync-RbU0EDwx.js","/assets/VfxApiMap-DEjWksOI.js","/assets/VfxDictionaries-BW6paj1A.js","/assets/VfxEmployees-Dbyg1QMn.js","/assets/VfxHrMoves-BBdoP9hL.js","/assets/VfxJobs-B0T34WJQ.js","/assets/VfxPhoto-CAgw4jNm.js","/assets/VfxShifts-C5jm2YO2.js","/assets/VfxState-DmO7jrQK.js","/assets/VfxTimebooks-D6lDnjy1.js","/assets/VfxTimesheet-B9SaDd00.js","/assets/WatchProgress-RUG93LBf.js","/assets/WebLogin-B928bZGv.js","/assets/WorkersAttendance-Bb1nb-PU.js","/assets/WorkersComposition-Cvu_v_Q2.js","/assets/WorkersMovements-COtZ1AdM.js","/assets/WorkersPage-CeQO3g0p.js","/assets/Zagruzka-LRfcbSn3.js","/assets/ZagruzkaCell-K79eyoua.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-B5Tbfwmn.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BACYYE_Z.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CYw_iKCH.js","/assets/broadcastTree-BI-n18Y1.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-B6_Or2uY.js","/assets/cellMoveRefusal-B6BAnusR.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Dg22tWG3.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-CHo9Bwch.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BdeyJFpo.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-D7pTki9d.js","/assets/index-DkWQ5BEQ.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CrZUH91B.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-94c4upiU.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-BS0dPWtX.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-x9LlNNHT.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-nwgwu3r0.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CZ-2HU-Y.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-C-GMkxtD.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-B3CsJ67Q.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-CZXKdHGj.js","/assets/useMutation-DmJoV6As.js","/assets/useOpenParam-Cp3w-71_.js","/assets/useStatusBands-B5gclTfK.js","/assets/useUrlScope-CT8lyHMS.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BwvJfHIK.js","/assets/uz_cyrl-C9ORASFJ.js","/assets/vfx-Brl0Pxwj.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-07o9yBQ6.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
