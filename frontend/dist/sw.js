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

const BUILD = "2026-11-13T17:54:35.739Z";
const PRECACHE = ["/","/assets/ActionHistory-B23ctvL5.js","/assets/ActionMenu-DbWiby4f.js","/assets/AdminPage-CoCO3XRG.js","/assets/AiKeys-D_xvYWOB.js","/assets/AnalysisBoard-BJi_cscX.js","/assets/ApiAccess-D1zw-Po4.js","/assets/AppLauncher-YmNIosnl.js","/assets/Arc-GbeC64Us.js","/assets/Assessment-Db_EOdW0.js","/assets/AssessmentGrade-EMEBCU_H.js","/assets/AssessmentList-cqJokzRg.js","/assets/Assistant-Cc1VXMse.js","/assets/AttendanceCleanup-cqOsz_Dl.js","/assets/AttendanceUpload-DLde1iPQ.js","/assets/AuditTable-DdDXntHj.js","/assets/BrigadirProfile-tLe3yL-5.js","/assets/BrigadirsKpi-DCgFiuVI.js","/assets/Broadcast-C7htV1TP.js","/assets/BroadcastReceivers-LgKqYawI.js","/assets/BroadcastRecord-CcfNmWlm.js","/assets/Button-BkqO76fy.js","/assets/CatLockNotice-C_sO1o2E.js","/assets/CategoryLegendModal-2_M8-Qu3.js","/assets/CellConcerns-D4gXNmB4.js","/assets/CellDetails-Cz--y4eo.js","/assets/CellFormModal-NRClEqHB.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-D8NmgXed.js","/assets/Cells-BVcvrr59.js","/assets/ColumnFilter-C9HTu2vr.js","/assets/ColumnsPicker-CM8luzbX.js","/assets/CommentsModal-BGAu6Uhl.js","/assets/ComparisonTable-CiBLmXhp.js","/assets/Concerns-DMLvNSmF.js","/assets/ConcernsPieces-N9SMV6HW.js","/assets/ContainerTotalsCard-D7aL2HIi.js","/assets/Containers-CqRpkunk.js","/assets/CountStepper-qtXSq7s2.js","/assets/Daily-Lw2Hy8tY.js","/assets/DataSources-C155peZ3.js","/assets/DataTable-CwUCKi0S.js","/assets/DateRangePicker-De97esJi.js","/assets/DayReportView-sHN789RB.js","/assets/DayStepper-C9dLp9Im.js","/assets/DayStrip-7HG1rxtA.js","/assets/DbBackup-BAGqZCl9.js","/assets/DifferenceBreakdown-CjC2V7jW.js","/assets/DocAudit-Divu27DH.js","/assets/Downtime-9n0IFk18.js","/assets/Education-D4ZHLzsK.js","/assets/EducationLesson-xezsjqgc.js","/assets/EmptyState-Bg6qYWSm.js","/assets/Exam-D4R4zoUO.js","/assets/ExamAdmin-BSnrizg6.js","/assets/Factories-Ch3jNX4o.js","/assets/FactorySelect-CsZKK3yH.js","/assets/Gamification-CupuWFfQ.js","/assets/GroupBadge-DmeIvuqD.js","/assets/HeatmapChart-CpcOXF1Y.js","/assets/HourlyContainers-CNl1JagV.js","/assets/IdleCell-Br3sMsVo.js","/assets/IdleOwners-CzS6w0GZ.js","/assets/IdleSolutions-DhqZj8Vf.js","/assets/IdleSource-Ce4tz13J.js","/assets/KPICard-Cq1GCUfc.js","/assets/Kaizen-jZqNT-T2.js","/assets/Kelish-AmntsZq9.js","/assets/Kitchen-_r_h7XSE.js","/assets/KpiBits-w7uzPmp2.js","/assets/KpiDeltaCard-9v74oo7R.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-Degkoatv.js","/assets/Layout-DwedW07n.js","/assets/LeaderAppeal-BzbAtzP1.js","/assets/LeaderCutoffs-Csc1jMZc.js","/assets/LeaderDailyTasks-DpHEcn4j.js","/assets/LeaderDayExclusions-BnkopKFU.js","/assets/LeaderDayReport-CBaC-M3Y.js","/assets/LeaderTasksAdmin-B7jKomwM.js","/assets/LeaderUnitReport-Cx7k6nlj.js","/assets/Leaderboard-B1B_aKCd.js","/assets/Leaders-Dn4U_Q_P.js","/assets/LeadersKpi-BW6nVlvO.js","/assets/Lightbox-rYLOgKg7.js","/assets/LiveOverview-DWT5Pu2o.js","/assets/Login-CVIL0mpz.js","/assets/Logs-DZFwhAcH.js","/assets/LostWorkers-D2jbgAF6.js","/assets/Meter-4z8qn0bm.js","/assets/NotFound-aZoLATjC.js","/assets/Notifications-CVGASM0O.js","/assets/NotionTasks-BPq6PO_1.js","/assets/NotionTrackerSettings-0rcpHSnk.js","/assets/Ontime-DVUmWHE9.js","/assets/OrgChart-cJjcYVy5.js","/assets/Ovens-BoTDiLOu.js","/assets/OvensSettings-BYru7g1k.js","/assets/Overview-VXTCzBG_.js","/assets/OwnerChip-DUZvE-d7.js","/assets/PageAccess-DnL4D1WP.js","/assets/Pagination-DvnhfchR.js","/assets/People-B8WqDDh4.js","/assets/PerenaladkaFactTable-Cog7XIyx.js","/assets/Permissions-BhRIkiVA.js","/assets/PersonCard-D7ZhL85e.js","/assets/PlanFulfillment-CrF7FUDq.js","/assets/Production-Cj46aZT5.js","/assets/ProductionUpload-Cj7_Kn5k.js","/assets/Profile-DypLPW0b.js","/assets/ProfileAvatar-dwkYf_qo.js","/assets/ProfilesManagement-D1B5TCP0.js","/assets/ProofCamera-Cb8lXN-W.js","/assets/ProofPhoto-B9arZyLY.js","/assets/Quality-CHCkUgXP.js","/assets/RawRows-CgnsR-q1.js","/assets/Reports-BxFniOV2.js","/assets/RequestStateChip-C2zwHJzT.js","/assets/RichTextEditor-HojxpYnh.js","/assets/SaveState-CxaQ3zHl.js","/assets/SearchInput-CxwMCZc1.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-By88UJpj.js","/assets/SetupTimes-9RB7UUu_.js","/assets/ShiftDaily-BneD_wvW.js","/assets/ShiftTimes-BmEIUBS7.js","/assets/Staff-0cSZ62_H.js","/assets/StaffListAtCheck-DJv3rOqX.js","/assets/StatusBadge-C2QsYxMn.js","/assets/StatusBandsModal-CLzZzPk6.js","/assets/TargetGoal-da-p-reE.js","/assets/Targets-C8AwJr6G.js","/assets/TaskerSettings-C-FZBo6q.js","/assets/Tasks-DdTieock.js","/assets/TgProfile-S7hJFNbM.js","/assets/TimeWheelPicker-CK4qjuG2.js","/assets/Tooltip-CiW3VQZi.js","/assets/TranslationsEditor-Cdwb7pEJ.js","/assets/TrelloAnalytics-F8vZ_Ybu.js","/assets/TrelloSettings-BL8Agw4-.js","/assets/TrendChart-DtJQKT-R.js","/assets/TripleSpeedometer-DflTUzzw.js","/assets/Trudoyomkost-CBe8KCqJ.js","/assets/UploadDropzone-BGCXZBMe.js","/assets/UsersActivity-ZMC5-zpL.js","/assets/UsersManagement-Chnueq4Z.js","/assets/VerdictBlock-Dk47HHNv.js","/assets/VerifixParity-BvGbpb_h.js","/assets/VerifixSettings-5dn5EcPn.js","/assets/VerifixSync-D06RHSWo.js","/assets/VfxApiMap-DsMuywAe.js","/assets/VfxDictionaries-DPFj1NfE.js","/assets/VfxEmployees-CVmySaf8.js","/assets/VfxHrMoves-sYW8__eH.js","/assets/VfxJobs-c3d6LDfT.js","/assets/VfxPhoto-3dHest_M.js","/assets/VfxShifts-Dul07kNg.js","/assets/VfxState-4eAdcdOD.js","/assets/VfxTimebooks-DLCKVu71.js","/assets/VfxTimesheet-G7G7WNA_.js","/assets/WatchProgress-4STQKEI3.js","/assets/WebLogin-MosUqbCO.js","/assets/WorkersAttendance-CSoMBsU6.js","/assets/WorkersComposition-D-K9QKzs.js","/assets/WorkersMovements-CPR9p4Az.js","/assets/WorkersPage-Ba_terQX.js","/assets/Zagruzka-BLLuNM45.js","/assets/ZagruzkaCell-PBqhf3Jf.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Bm5XnBSP.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CxpwdHMJ.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CkMfgaP1.js","/assets/broadcastTree-DmQnGq--.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BA5PJKFF.js","/assets/cellMoveRefusal-6TXhH4LJ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-JTcAk3R4.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Bc2p6NWp.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BiEA5SVa.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-1tAm50E7.css","/assets/index-CHLLUIYn.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BPlquby8.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DeRu0tjI.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-p8YxxBSV.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CbzFWtIo.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-D1VWeXTo.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-Dta_RUZM.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DmlfsaDu.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BLlUYAyL.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-9qSgoRsS.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-H9Qw-Z9A.js","/assets/useOpenParam-Cg5lDevl.js","/assets/useStatusBands-CZ_bi8Pw.js","/assets/useUrlScope-Dbd0UeJu.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-COsWWMxu.js","/assets/uz_cyrl-CwR-sQCY.js","/assets/vfx-CYaQ0BSL.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-Bt8WCIFb.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
