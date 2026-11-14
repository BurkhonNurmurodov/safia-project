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

const BUILD = "2026-11-14T15:25:20.340Z";
const PRECACHE = ["/","/assets/ActionHistory-D5M00IQY.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-DTCUYiOG.js","/assets/AiKeys-CaAqhUwK.js","/assets/AnalysisBoard-CI5q7sP2.js","/assets/ApiAccess-CrJeBPqJ.js","/assets/AppLauncher-DXVGgeUq.js","/assets/Arc-B-8HMTaI.js","/assets/Assessment-Ci9Mxrl0.js","/assets/AssessmentGrade-kpPeiF0g.js","/assets/AssessmentList-B-d0slLC.js","/assets/Assistant-C-GgEvx4.js","/assets/AttendanceCleanup-Bb_QDQ1l.js","/assets/AttendanceUpload-B-dGoDM5.js","/assets/AuditTable-BBQ_x84R.js","/assets/BrigadirProfile-CXQhK6Mb.js","/assets/BrigadirsKpi-B_KugL8b.js","/assets/Broadcast-BNl_EzLm.js","/assets/BroadcastReceivers-Bt1xQojM.js","/assets/BroadcastRecord-C1rimi4L.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-BUEhMABy.js","/assets/CategoryLegendModal-DtSLj1kF.js","/assets/CellConcerns-FYxL8tb7.js","/assets/CellDetails-BUGjUQCC.js","/assets/CellFormModal-gUJu0zKN.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-8REKoVMy.js","/assets/Cells-DWrujIXb.js","/assets/ColumnFilter-CU1jrBt7.js","/assets/ColumnsPicker-C77fakjs.js","/assets/CommentsModal-BkaKyXaX.js","/assets/ComparisonTable-DS_-j5za.js","/assets/Concerns-CL8luo_6.js","/assets/ConcernsPieces-C1VNLoug.js","/assets/ContainerFlow-iwV1O3iJ.js","/assets/ContainerTotalsCard-DfAA2Cqt.js","/assets/Containers-cLpSxCgF.js","/assets/CountStepper-IZ32xskN.js","/assets/Daily-DWZyJCSH.js","/assets/DataSources-CTr-XFV8.js","/assets/DataTable-DcM2_fvK.js","/assets/DateRangePicker-5n9MUi0t.js","/assets/DayReportView-SnSSEm96.js","/assets/DayStepper-Bo6f6xNw.js","/assets/DayStrip-DDK_u_xC.js","/assets/DbBackup-D4_gcrTE.js","/assets/DifferenceBreakdown-DVhmpzXh.js","/assets/DocAudit-BeTTwlnc.js","/assets/Downtime-CkxeO8Ac.js","/assets/Education-C101ey6I.js","/assets/EducationLesson-CXTswIwG.js","/assets/EmptyState-Dy-9dxb8.js","/assets/Exam-CDZTraaw.js","/assets/ExamAdmin-BRd5vran.js","/assets/Factories-Cs8qGal_.js","/assets/FactorySelect-CjLgo6_1.js","/assets/Gamification-YN2mb62l.js","/assets/GroupBadge-Cr2lP_gH.js","/assets/HeatmapChart-Bbe-qWVJ.js","/assets/HourlyContainers-D53Qv9i2.js","/assets/IdleCell-Bi74Aqmh.js","/assets/IdleOwners-C_wuX0L6.js","/assets/IdleSolutions-BrVNBeg1.js","/assets/IdleSource-RaooCrHj.js","/assets/KPICard-D6vw_don.js","/assets/Kaizen-zg3aviO2.js","/assets/Kelish-Pf57rp9z.js","/assets/Kitchen-BIieSZ46.js","/assets/KpiBits-BbapwlTU.js","/assets/KpiDeltaCard-ydksQ75R.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-HjEC7szz.js","/assets/LeaderAppeal-De1vle7p.js","/assets/LeaderCutoffs-DjnsKkq3.js","/assets/LeaderDailyTasks-DoVbEfJ5.js","/assets/LeaderDayExclusions-BpYancqR.js","/assets/LeaderDayReport-CIJNv_3C.js","/assets/LeaderTasksAdmin-CwgoHTVA.js","/assets/LeaderUnitReport-C_Gxw9GD.js","/assets/Leaderboard-CiX1T5ND.js","/assets/Leaders-BorB-2QT.js","/assets/LeadersKpi-BFlAo3Ar.js","/assets/Lightbox-blTswepj.js","/assets/LiveOverview-BJbvg1cI.js","/assets/Login-PJxVfw7F.js","/assets/Logs-BrJz_9Cm.js","/assets/LostWorkers-NyZ2FK2c.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-NxnLFnMR.js","/assets/Notifications-IqwldL3V.js","/assets/NotionTasks-D575W2D2.js","/assets/NotionTrackerSettings-CjrLWlOL.js","/assets/Ontime-DlVbQ4Ke.js","/assets/OrgChart-BQ4z5Hzp.js","/assets/Ovens-CreTwS7T.js","/assets/OvensSettings-Dfq2yp3g.js","/assets/Overview-DhQm9iPT.js","/assets/OwnerChip-C4G2lteK.js","/assets/PageAccess-BgBC_YwU.js","/assets/Pagination--oCsoa16.js","/assets/People-CEttJVJY.js","/assets/PerenaladkaFactTable-C8PUYgEG.js","/assets/Permissions-D9E26yQt.js","/assets/PersonCard-DUWqj183.js","/assets/PlanFulfillment-DcK4gscj.js","/assets/Production-VBU3kedU.js","/assets/ProductionUpload-BXtYXWqF.js","/assets/Profile-B1wcCtm6.js","/assets/ProfileAvatar-DWK8em_h.js","/assets/ProfilesManagement-BBIApNVX.js","/assets/ProofCamera-Dj9PIvv5.js","/assets/ProofPhoto-CagOj_Lm.js","/assets/Quality-BqsYVj9C.js","/assets/RawRows-DcloBgm9.js","/assets/Reports-BEPfgxxs.js","/assets/RequestStateChip-C8xZEoi1.js","/assets/RichTextEditor-C851yl_A.js","/assets/SaveState-DOrPT0LP.js","/assets/SearchInput-CGpwZ9m_.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-BfV8ndyW.js","/assets/ShiftDaily-B6u7ZLL3.js","/assets/ShiftTimes-xY5A5Dn1.js","/assets/Staff-D_elmSQf.js","/assets/StaffListAtCheck-ClAyxB0Q.js","/assets/StatusBadge-CVDhnHZU.js","/assets/StatusBandsModal-65eNMGOK.js","/assets/TargetGoal-LdROWfta.js","/assets/Targets-D51XaNro.js","/assets/TaskFormModal-C4svK2MZ.js","/assets/TaskerSettings-CSFqbWQa.js","/assets/Tasks-YI9EC7MB.js","/assets/TgProfile-DQd4CgWU.js","/assets/TimeWheelPicker-DDMjUFGW.js","/assets/Tooltip-C2UMll9c.js","/assets/TranslationsEditor-Dz_j-NcG.js","/assets/TrelloAnalytics-DKzBLyBd.js","/assets/TrelloSettings-C3y3EXBw.js","/assets/TrendChart-B2p76PZB.js","/assets/TripleSpeedometer-BlF30OWz.js","/assets/Trudoyomkost-Dv-dNfkz.js","/assets/UploadDropzone-e1eQ2aFw.js","/assets/UsersActivity-CK1dJXuX.js","/assets/UsersManagement-BAXxpYCq.js","/assets/VerdictBlock-CerIiRVq.js","/assets/VerifixParity-xq04bEfC.js","/assets/VerifixSettings-CUw2e6Z3.js","/assets/VerifixSync-s1-Ao2co.js","/assets/VfxApiMap-BWPmFhwU.js","/assets/VfxDictionaries-CuK4RF10.js","/assets/VfxEmployees-BW6vOoG0.js","/assets/VfxHrMoves-B0UdmUg1.js","/assets/VfxJobs-Bsda57CY.js","/assets/VfxPhoto-Bh6nOLYF.js","/assets/VfxShifts-DmPJQ9N0.js","/assets/VfxState-BxlAPtal.js","/assets/VfxTimebooks-S7P4fbrW.js","/assets/VfxTimesheet-CFbq7CdW.js","/assets/WatchProgress-Al_fIS59.js","/assets/WebLogin-DHaqQENJ.js","/assets/WorkersAttendance-BmEiDuck.js","/assets/WorkersComposition-CbKii6ra.js","/assets/WorkersMovements-DOADI4J_.js","/assets/WorkersPage-C5z3vxFH.js","/assets/Zagruzka-CionCzEq.js","/assets/ZagruzkaCell-Cpeybbv4.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CEWxk9MB.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-thcsGB7S.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CQzP3QCU.js","/assets/broadcastTree-Bw_lqGs9.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DygVdg_6.js","/assets/cellMoveRefusal-Ba2tFsMa.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CK6Hkqtr.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Bsm_Jpc5.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Dp4JA0nI.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BaYbAeqc.js","/assets/index-XJcwP50o.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DVn37a2r.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BQL6Gqkw.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-D7GHGJEW.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CXrpU8at.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-DafO1KLf.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CLjHSbaY.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-Dh1RPYFz.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-9PHDWt6j.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-D4jcRN5v.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-C6KXgR30.js","/assets/useOpenParam-CHoIjHGU.js","/assets/useStatusBands-D4bsVIOf.js","/assets/useUrlScope-CrjMfmTR.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-cCyoLvyQ.js","/assets/uz_cyrl-CU9U23U0.js","/assets/vfx-D-tb2_Tv.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-Cii0YF-i.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
