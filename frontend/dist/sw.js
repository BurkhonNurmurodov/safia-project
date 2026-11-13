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

const BUILD = "2026-11-13T13:13:34.826Z";
const PRECACHE = ["/","/assets/ActionHistory-7xhCMjpy.js","/assets/ActionMenu-DbWiby4f.js","/assets/AdminPage-CiqHHBCA.js","/assets/AiKeys-CiD7LiRu.js","/assets/AnalysisBoard-D8-LRb5F.js","/assets/ApiAccess-BfnRDHdA.js","/assets/AppLauncher-CddZM5t8.js","/assets/Arc-Dfjvkb5P.js","/assets/Assessment-Bu3ZKWyp.js","/assets/AssessmentGrade-BBdqIbse.js","/assets/AssessmentList-BkImHO_f.js","/assets/Assistant-BQ18xck8.js","/assets/AttendanceCleanup-z687UZB6.js","/assets/AttendanceUpload-BjLAPM7O.js","/assets/AuditTable-C7IPlFYN.js","/assets/BrigadirProfile-BFze3cFQ.js","/assets/BrigadirsKpi-CZmgoqx4.js","/assets/Broadcast-BoAFvnEM.js","/assets/BroadcastReceivers-GFhRR5fn.js","/assets/BroadcastRecord-Dq4b-m7t.js","/assets/Button-BkqO76fy.js","/assets/CatLockNotice-BP7kAG7l.js","/assets/CategoryLegendModal-CD1P29_b.js","/assets/CellConcerns-Bu-KGrLE.js","/assets/CellDetails-C48XIzQe.js","/assets/CellFormModal-B4bPIm4C.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-5F2jS4cl.js","/assets/Cells-B_E6BMku.js","/assets/ColumnFilter-DVgrfwmv.js","/assets/ColumnsPicker-DvtH72t-.js","/assets/CommentsModal-nV75ADxI.js","/assets/ComparisonTable-LSh0-OnD.js","/assets/Concerns-D38CLdHu.js","/assets/ConcernsPieces-32_eas_X.js","/assets/ContainerTotalsCard-4QiGBAvd.js","/assets/Containers-BE-YoGq1.js","/assets/CountStepper-BCLMJznl.js","/assets/Daily-TdSGbA1c.js","/assets/DataSources-aHt8M9oZ.js","/assets/DataTable-yHG8S91G.js","/assets/DateRangePicker-CSjaG4cA.js","/assets/DayReportView-DIwoX0gX.js","/assets/DayStepper-Dz8VYiyV.js","/assets/DayStrip-B4ohkfZo.js","/assets/DbBackup-D762t4u4.js","/assets/DifferenceBreakdown-BkB--3lS.js","/assets/DocAudit-fj60A9op.js","/assets/Downtime-CNx0pR7y.js","/assets/Education-Dv_J4wjo.js","/assets/EducationLesson-B4vnX7dS.js","/assets/EmptyState-BvUbtMOK.js","/assets/Exam-BEJ8dtN6.js","/assets/ExamAdmin-B1Ya8aZc.js","/assets/Factories-Dlxm53Vw.js","/assets/FactorySelect-DlrXvpdl.js","/assets/Gamification-BG_V8PFw.js","/assets/GroupBadge-DakaJNms.js","/assets/HeatmapChart-D_AC6LSJ.js","/assets/HourlyContainers-BdEy3RMk.js","/assets/IdleCell-xW3D_wzl.js","/assets/IdleOwners-BGDFG0Zp.js","/assets/IdleSolutions-8A4TGWc7.js","/assets/IdleSource-C8XuY9xK.js","/assets/KPICard-BBj_puzl.js","/assets/Kaizen-CKk01-Bc.js","/assets/Kelish-1vPq-TU-.js","/assets/Kitchen-DGUPTbS7.js","/assets/KpiBits-CTzoSK4t.js","/assets/KpiDeltaCard-Bmf1L02K.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CvYTJAne.js","/assets/Layout-BGJjZzd3.js","/assets/LeaderAppeal-C5Ehp5ok.js","/assets/LeaderCutoffs-BygEPS_-.js","/assets/LeaderDailyTasks-LjB97p8e.js","/assets/LeaderDayExclusions-6oiMKobn.js","/assets/LeaderDayReport-wPWOjTWT.js","/assets/LeaderTasksAdmin-rFsYi6ai.js","/assets/LeaderUnitReport-BScZ2jbj.js","/assets/Leaderboard-Dsr2RKXj.js","/assets/Leaders-BVw3XKbY.js","/assets/LeadersKpi-BjckjAKG.js","/assets/Lightbox-CZ0zGfPq.js","/assets/LiveOverview-DYIBPTNq.js","/assets/Login-kAERmMub.js","/assets/Logs-qzNLEPQe.js","/assets/LostWorkers-BAvjJXz2.js","/assets/NotFound-llP5eTmd.js","/assets/Notifications-D_eZgSQT.js","/assets/NotionTasks-Dl5XDkro.js","/assets/NotionTrackerSettings-DjuDyXNn.js","/assets/Ontime-D-8VugXI.js","/assets/OrgChart-CSK7moIj.js","/assets/Ovens-CpFofkmJ.js","/assets/OvensSettings-DXS9MeZu.js","/assets/Overview-DaZ2rfRs.js","/assets/OwnerChip-Dz37d-zZ.js","/assets/PageAccess-CFmE4WS0.js","/assets/Pagination-vxFpeRSV.js","/assets/People-BXPu6xAb.js","/assets/PerenaladkaFactTable-C9rtSbbx.js","/assets/Permissions--PZXTX0X.js","/assets/PersonCard-CsYhk4ZE.js","/assets/PlanFulfillment-Crys_SHo.js","/assets/Production-4BWcUs1h.js","/assets/ProductionUpload-BrMVm2Pk.js","/assets/Profile-BKy9mfGs.js","/assets/ProfileAvatar-B3wsQM6J.js","/assets/ProfilesManagement-C0isWnoI.js","/assets/ProofCamera-C-8e0Po4.js","/assets/ProofPhoto-BS1_f3GX.js","/assets/Quality-BzElx-ET.js","/assets/RawRows-B7j0BNkg.js","/assets/Reports-B1aOpo9M.js","/assets/RequestStateChip-W32Q3T1D.js","/assets/RichTextEditor-CyGzaa9D.js","/assets/SaveState-fWrs9ExG.js","/assets/SearchInput-DXy8Y0-r.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-C8myJDPN.js","/assets/SetupTimes-D9MOFL-h.js","/assets/ShiftDaily-BwehmBOc.js","/assets/ShiftTimes-DIi0x4Nx.js","/assets/Staff-B73q5joy.js","/assets/StaffListAtCheck-X_rnx4Uy.js","/assets/StatusBadge-D9-IMDUu.js","/assets/StatusBandsModal-Dqk0Fn6F.js","/assets/TargetGoal-B3oXU2aj.js","/assets/Targets-CBYx6mpO.js","/assets/TaskerSettings-BLXBGCdp.js","/assets/Tasks-Cei4n1Yu.js","/assets/TgProfile-olz3i5_p.js","/assets/TimeWheelPicker-BzaJ8PQv.js","/assets/Tooltip-CMO7OD8U.js","/assets/TranslationsEditor-CRjs-Mr8.js","/assets/TrelloAnalytics-BFi1srih.js","/assets/TrelloSettings-BDnNZTtx.js","/assets/TrendChart-CDKXB9Bu.js","/assets/TripleSpeedometer-EMyxSk7S.js","/assets/Trudoyomkost-DD58a553.js","/assets/UploadDropzone-D66Y4D0y.js","/assets/UsersActivity-BfrunmFB.js","/assets/UsersManagement-3e2v4sDY.js","/assets/VerdictBlock-BSkrmJzf.js","/assets/VerifixParity-B_It4C5y.js","/assets/VerifixSettings-1MjvklJp.js","/assets/VerifixSync-C9e4bDki.js","/assets/VfxApiMap-B764gdFC.js","/assets/VfxDictionaries-bFksnmlY.js","/assets/VfxEmployees-B1lSEn5F.js","/assets/VfxHrMoves-DbZPkcxj.js","/assets/VfxJobs-DEGik-zb.js","/assets/VfxPhoto-B7c_DFFu.js","/assets/VfxShifts-CzH28_-j.js","/assets/VfxState-DIl2lzuE.js","/assets/VfxTimebooks-arIpztwh.js","/assets/VfxTimesheet-Bh563YTW.js","/assets/WatchProgress-D69wyOGx.js","/assets/WebLogin-DGFAHpsd.js","/assets/WorkersAttendance-7jVI_jaw.js","/assets/WorkersComposition-BA3x0At0.js","/assets/WorkersMovements-Do42NrPV.js","/assets/WorkersPage-D-r5DvrF.js","/assets/Zagruzka-CkqRExkQ.js","/assets/ZagruzkaCell-AnPLlJpo.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BKMneIkh.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BXsR_IyD.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CTKASyFk.js","/assets/broadcastTree-7LSztLda.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-CvOEVrTP.js","/assets/cellMoveRefusal-RD-0UR6T.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-gBDIgada.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-CK-0l5Lq.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CDV6Eodj.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CJBfN-El.js","/assets/index-DwKjykHF.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CuM4n23J.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-Dv42mJqc.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-B4eHE-4g.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-ChGQX_yL.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-DWAQfoGx.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-DuGnCQ_C.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-fdSGfCdy.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BryGfSAY.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-B17A1Z5X.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-D2jWXOiR.js","/assets/useOpenParam-CSAuwZBR.js","/assets/useStatusBands-DxkRRC2E.js","/assets/useUrlScope-CPSNF7CT.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BXeH2PqR.js","/assets/uz_cyrl-BKPGCTOb.js","/assets/vfx-BpMOP4EZ.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-BbjxQyJU.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
