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

const BUILD = "2026-11-14T10:52:09.668Z";
const PRECACHE = ["/","/assets/ActionHistory-LfMcqsor.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-DakvJ1YG.js","/assets/AiKeys-nPO1MP7o.js","/assets/AnalysisBoard-DgiV5-bl.js","/assets/ApiAccess-C5IBaJiF.js","/assets/AppLauncher-SeNHblox.js","/assets/Arc-DOjgjy9z.js","/assets/Assessment-B9clq7IL.js","/assets/AssessmentGrade-Bf5-cZaW.js","/assets/AssessmentList-BKHXUmuo.js","/assets/Assistant-B8UMhVHK.js","/assets/AttendanceCleanup-qXnlNfi_.js","/assets/AttendanceUpload-6WBcKTKb.js","/assets/AuditTable-C1p6znCn.js","/assets/BrigadirProfile-DNhicrBk.js","/assets/BrigadirsKpi-B4YQqfA7.js","/assets/Broadcast-CJq0e44R.js","/assets/BroadcastReceivers-FqcQVgk6.js","/assets/BroadcastRecord-D8JZ30JS.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-DH5YpqtD.js","/assets/CategoryLegendModal-ClN8CahB.js","/assets/CellConcerns-D3TVg7F_.js","/assets/CellDetails-1mJpbxei.js","/assets/CellFormModal-CR8adFBB.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-Jcjz7r24.js","/assets/Cells-BHd4TM-2.js","/assets/ColumnFilter-BEG9_NsU.js","/assets/ColumnsPicker-DupaC17F.js","/assets/CommentsModal-BOzG43jb.js","/assets/ComparisonTable-BElIbfBT.js","/assets/Concerns-j4wdRBJT.js","/assets/ConcernsPieces-BTjPDRZ2.js","/assets/ContainerFlow-DHg5nE4F.js","/assets/ContainerTotalsCard-CFC9KjQY.js","/assets/Containers-T2kujtg0.js","/assets/CountStepper-DlnC26zG.js","/assets/Daily-DPYAqs5V.js","/assets/DataSources-BL3Z31E0.js","/assets/DataTable-ByNWGneA.js","/assets/DateRangePicker-zucd4QFz.js","/assets/DayReportView-Bq5V7zaZ.js","/assets/DayStepper-BW_cN-Rh.js","/assets/DayStrip-CXrXHO9f.js","/assets/DbBackup-FMlW3qRv.js","/assets/DifferenceBreakdown-ChTjQIP-.js","/assets/DocAudit-BNRa1Khy.js","/assets/Downtime-BzcX-0Oz.js","/assets/Education-Dxcz8E5M.js","/assets/EducationLesson-K3ZeOyJq.js","/assets/EmptyState-CIFSVtkc.js","/assets/Exam-C_7Bwjd6.js","/assets/ExamAdmin-C3OJB7ru.js","/assets/Factories-BSP2ImSG.js","/assets/FactorySelect-DafO2Z-u.js","/assets/Gamification-DP9MoTWI.js","/assets/GroupBadge-CRwXTwpk.js","/assets/HeatmapChart-w9PTyLDj.js","/assets/HourlyContainers-D3DWFB2b.js","/assets/IdleCell-9vduAelY.js","/assets/IdleOwners-CAeIHJbX.js","/assets/IdleSolutions-Zdcv9frL.js","/assets/IdleSource-3i-UbhNt.js","/assets/KPICard-BjRmwTSn.js","/assets/Kaizen-CrY-e88-.js","/assets/Kelish--RMBx-CJ.js","/assets/Kitchen-AI_CwVBy.js","/assets/KpiBits-BvueNzQl.js","/assets/KpiDeltaCard-DrwaXEai.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-Di3FGaPI.js","/assets/LeaderAppeal-9bYePBnY.js","/assets/LeaderCutoffs-qgSWpr0W.js","/assets/LeaderDailyTasks-CbduHw8q.js","/assets/LeaderDayExclusions-D9f7uh4V.js","/assets/LeaderDayReport-CQ5psLXk.js","/assets/LeaderTasksAdmin-BW186HDH.js","/assets/LeaderUnitReport-BjX4m0au.js","/assets/Leaderboard-D72ecvab.js","/assets/Leaders-Sd6pJLQv.js","/assets/LeadersKpi-C0TOplGm.js","/assets/Lightbox-M-Cns0Ey.js","/assets/LiveOverview-jZD6rIhc.js","/assets/Login-BIieElaW.js","/assets/Logs-BzMv23aR.js","/assets/LostWorkers-D0qQUEut.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-CUUOUIpS.js","/assets/Notifications-IRDno7Um.js","/assets/NotionTasks-Ol2V8r1e.js","/assets/NotionTrackerSettings-L5kG1F3h.js","/assets/Ontime-DLxI1kkZ.js","/assets/OrgChart-BnlfeOrt.js","/assets/Ovens-CkagQg-2.js","/assets/OvensSettings-BOj9ojGd.js","/assets/Overview-CxlMR9HW.js","/assets/OwnerChip-Ca_8wHa_.js","/assets/PageAccess-VfvTV5QA.js","/assets/Pagination-gpeMVljm.js","/assets/People-6qWkIye2.js","/assets/PerenaladkaFactTable-BeQJVUiM.js","/assets/Permissions-DftAokUn.js","/assets/PersonCard-CQBpudCm.js","/assets/PlanFulfillment-CQ9YlhLk.js","/assets/Production-W5Thk392.js","/assets/ProductionUpload-sTYykoXr.js","/assets/Profile-nb7PDu8M.js","/assets/ProfileAvatar-DlDTtujc.js","/assets/ProfilesManagement-DnY1z_AX.js","/assets/ProofCamera-B3LBUemM.js","/assets/ProofPhoto-CkNIYqdc.js","/assets/Quality-BHmrg7fg.js","/assets/RawRows-Bi6-ee6H.js","/assets/Reports-CrL9VtXZ.js","/assets/RequestStateChip-C6oxdkEK.js","/assets/RichTextEditor-CkvCeuoR.js","/assets/SaveState-1cgYr6xR.js","/assets/SearchInput-DNEX8YMd.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-DZD1ALfE.js","/assets/ShiftDaily-Db0pqwyR.js","/assets/ShiftTimes-BS2Tbpee.js","/assets/Staff-z4JMcWil.js","/assets/StaffListAtCheck-_rUPvBoa.js","/assets/StatusBadge-DOL1EdST.js","/assets/StatusBandsModal-CX393k3l.js","/assets/TargetGoal-Q5di6VI3.js","/assets/Targets-DNaN2EIb.js","/assets/TaskerSettings-B6asBH76.js","/assets/Tasks-CYrBMthZ.js","/assets/TgProfile-DQi-S3tS.js","/assets/TimeWheelPicker-D48OTMXb.js","/assets/Tooltip-CJ4fMTWU.js","/assets/TranslationsEditor-DKpPTkq2.js","/assets/TrelloAnalytics-B6pIrhOu.js","/assets/TrelloSettings-CyPgXrru.js","/assets/TrendChart-Bb0NVsbw.js","/assets/TripleSpeedometer-DZbtFN9m.js","/assets/Trudoyomkost-DoiOFdJ0.js","/assets/UploadDropzone-rSODkWEr.js","/assets/UsersActivity-C_Cb9H8B.js","/assets/UsersManagement-CthA_j4y.js","/assets/VerdictBlock-DdZy7Rja.js","/assets/VerifixParity-C0NYmk6e.js","/assets/VerifixSettings-BMCdgnXq.js","/assets/VerifixSync-D8wKUcGr.js","/assets/VfxApiMap-Dg_rWqLP.js","/assets/VfxDictionaries-C_khjsZr.js","/assets/VfxEmployees-BgndZ3xx.js","/assets/VfxHrMoves-Cq4MF-mr.js","/assets/VfxJobs-5_jbfAai.js","/assets/VfxPhoto-CgrUzxSG.js","/assets/VfxShifts-DJrkjsqS.js","/assets/VfxState-BCIoYRr2.js","/assets/VfxTimebooks-DsGAnL1g.js","/assets/VfxTimesheet-Bu8NeVAy.js","/assets/WatchProgress-B_Z7K8Po.js","/assets/WebLogin-BfLYily7.js","/assets/WorkersAttendance-CA9T20hn.js","/assets/WorkersComposition-RXcaWMSh.js","/assets/WorkersMovements-CIV2RSV4.js","/assets/WorkersPage-CKqKBxIk.js","/assets/Zagruzka-CGd75s6E.js","/assets/ZagruzkaCell-D76nAlPr.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-D6gXRVWR.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-B50nVkp6.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-0C20eBkE.js","/assets/broadcastTree-Blg9iIBk.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-NktK-r5O.js","/assets/cellMoveRefusal-qOWeqoqt.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Nn9KW97s.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-NXPYN-V6.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-B8tR4SIN.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DWypCF6O.js","/assets/index-DiT6nu0f.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-Csy639yp.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-g6hug2AN.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-C2Ls68da.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DNx8Jnv2.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-Bhfn0mwt.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CukFVOEg.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CVqhBm3o.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DqftGEAK.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-D5AgMpIy.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-4VNkawdf.js","/assets/useOpenParam-CUE-UeEA.js","/assets/useStatusBands-q6HXCBWb.js","/assets/useUrlScope-BoPLYkYq.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BqLPIV9E.js","/assets/uz_cyrl-6VY5UIqh.js","/assets/vfx-C9wnAvtN.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-6CtLIN9E.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
