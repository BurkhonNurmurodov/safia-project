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

const BUILD = "2026-11-14T07:27:41.174Z";
const PRECACHE = ["/","/assets/ActionHistory-DZIhbGVq.js","/assets/ActionMenu-DbWiby4f.js","/assets/AdminPage-NybyjMV3.js","/assets/AiKeys-oduoMLyC.js","/assets/AnalysisBoard-BfoW7a5w.js","/assets/ApiAccess-DoaExbhi.js","/assets/AppLauncher-O394GhiD.js","/assets/Arc-Ci-i4v-p.js","/assets/Assessment-B5bm9FGx.js","/assets/AssessmentGrade-DbWOETuc.js","/assets/AssessmentList-BJsa8E2Z.js","/assets/Assistant-BHMoSYUQ.js","/assets/AttendanceCleanup-C3t3QlnN.js","/assets/AttendanceUpload-uygReKi6.js","/assets/AuditTable-BD_KrJ0_.js","/assets/BrigadirProfile-DzbsL0Z8.js","/assets/BrigadirsKpi-Cl4YOEw4.js","/assets/Broadcast-BNnw9FbB.js","/assets/BroadcastReceivers-BquoOkvD.js","/assets/BroadcastRecord-_bbLNR40.js","/assets/Button-BkqO76fy.js","/assets/CatLockNotice-BAgv7C7s.js","/assets/CategoryLegendModal-DGMiorlb.js","/assets/CellConcerns-Cyh3r8GL.js","/assets/CellDetails-ZFeykmU4.js","/assets/CellFormModal-UySfcvK6.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-BrzFt8U-.js","/assets/Cells-CHHpPGwE.js","/assets/ColumnFilter-Cf6-iqW0.js","/assets/ColumnsPicker-BQMXxn4F.js","/assets/CommentsModal-CEN_inlP.js","/assets/ComparisonTable-BrsjvVtM.js","/assets/Concerns-Ds_t2Fnj.js","/assets/ConcernsPieces-cZIxY0mu.js","/assets/ContainerTotalsCard-BXVX7mCu.js","/assets/Containers-DQ9g_pvs.js","/assets/CountStepper-DTIAq6jR.js","/assets/Daily-DNjkW7Vq.js","/assets/DataSources-Gq9gXgQu.js","/assets/DataTable-CIIWwQq6.js","/assets/DateRangePicker-Cbc7Wjat.js","/assets/DayReportView-TGMUGfj8.js","/assets/DayStepper-O6QBno4V.js","/assets/DayStrip-B7Cq55eu.js","/assets/DbBackup-CHZJkRxl.js","/assets/DifferenceBreakdown-DhmzRbLQ.js","/assets/DocAudit-C0pVwuIU.js","/assets/Downtime-BnKZi9ap.js","/assets/Education-Ay7GLpYu.js","/assets/EducationLesson-DB95vQqw.js","/assets/EmptyState-BFjjXE-t.js","/assets/Exam-E0jG_PPt.js","/assets/ExamAdmin-SqL5DD3B.js","/assets/Factories-aZ9I4pu0.js","/assets/FactorySelect-DKV5vXuz.js","/assets/Gamification-LOrUXp4n.js","/assets/GroupBadge-ByT5ILWt.js","/assets/HeatmapChart-BvqcWvCl.js","/assets/HourlyContainers-BlaRNHiZ.js","/assets/IdleCell-_L1EEXC0.js","/assets/IdleOwners-BCgmJl5A.js","/assets/IdleSolutions-BhwLXaYP.js","/assets/IdleSource-Dc5NGtRQ.js","/assets/KPICard-CTsTOrCN.js","/assets/Kaizen-KBK8_WHs.js","/assets/Kelish-BeQTo2D1.js","/assets/Kitchen-KVzfKyn4.js","/assets/KpiBits-BM0NYHhS.js","/assets/KpiDeltaCard-DwBq4JjF.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-Degkoatv.js","/assets/Layout-BXDP_EEF.js","/assets/LeaderAppeal-BeY8Segv.js","/assets/LeaderCutoffs-CCIg8Z7h.js","/assets/LeaderDailyTasks-5NMUBGlh.js","/assets/LeaderDayExclusions-D6e2CLJf.js","/assets/LeaderDayReport-IHIJGS83.js","/assets/LeaderTasksAdmin-DJrBeCXY.js","/assets/LeaderUnitReport-8ynKId79.js","/assets/Leaderboard-ScvWXEoV.js","/assets/Leaders-BjUDdGY0.js","/assets/LeadersKpi-Du4PXNQw.js","/assets/Lightbox-BZafXe7x.js","/assets/LiveOverview-CuntIouu.js","/assets/Login-Wa413A71.js","/assets/Logs-yWCfxegk.js","/assets/LostWorkers-CMcXjhzC.js","/assets/Meter-4z8qn0bm.js","/assets/NotFound-Bu43cdFc.js","/assets/Notifications-CqgLsh2k.js","/assets/NotionTasks-DmlXFaxP.js","/assets/NotionTrackerSettings-_jXwVDYY.js","/assets/Ontime-Bf-8_Lc-.js","/assets/OrgChart-BQjoxBNy.js","/assets/Ovens-DvkbxaLW.js","/assets/OvensSettings-xHMYbQPf.js","/assets/Overview-8NE0wAsf.js","/assets/OwnerChip-VXjXzdFf.js","/assets/PageAccess-BI3DTSjx.js","/assets/Pagination-BibeKMId.js","/assets/People-8MvbX29l.js","/assets/PerenaladkaFactTable-6gKLQg56.js","/assets/Permissions-BM4Y6Cm3.js","/assets/PersonCard-5Nv2Q_Mh.js","/assets/PlanFulfillment-I7jntixg.js","/assets/Production-BGFO1-TB.js","/assets/ProductionUpload-J_ZqUkVk.js","/assets/Profile-CezHJK8H.js","/assets/ProfileAvatar-DMJTPp22.js","/assets/ProfilesManagement-BkOEFN3j.js","/assets/ProofCamera-B6O1ubnC.js","/assets/ProofPhoto-B-OM6M1l.js","/assets/Quality-BbKiIogb.js","/assets/RawRows-CvacLdQx.js","/assets/Reports-iHldv5mF.js","/assets/RequestStateChip-DX0AD27S.js","/assets/RichTextEditor--2-QQTVP.js","/assets/SaveState-MkUqf7QS.js","/assets/SearchInput-RF0pkesu.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-By88UJpj.js","/assets/SetupTimes-DPjNfcba.js","/assets/ShiftDaily-Co_NkDGb.js","/assets/ShiftTimes-CMFQK4q-.js","/assets/Staff-Bk1G2LKu.js","/assets/StaffListAtCheck-BgJJozS_.js","/assets/StatusBadge-CVxcBBNJ.js","/assets/StatusBandsModal-D3MxLAnT.js","/assets/TargetGoal-DPWkW0JT.js","/assets/Targets-CDslqGLW.js","/assets/TaskerSettings-DBD_WQtd.js","/assets/Tasks-BVL7ZlJb.js","/assets/TgProfile-zRCGL92Y.js","/assets/TimeWheelPicker-L4ZazBui.js","/assets/Tooltip-y6Oed1n-.js","/assets/TranslationsEditor-DIHLunu9.js","/assets/TrelloAnalytics-UxD5d2sE.js","/assets/TrelloSettings-HjBiyuAr.js","/assets/TrendChart-DfzgUUUN.js","/assets/TripleSpeedometer-Ch4sM0uZ.js","/assets/Trudoyomkost-ILCT1igc.js","/assets/UploadDropzone-BcqsLp2z.js","/assets/UsersActivity-qpFmIrNU.js","/assets/UsersManagement-C2ledXPy.js","/assets/VerdictBlock-mgzSfTsq.js","/assets/VerifixParity-CR8WzG4o.js","/assets/VerifixSettings-h6gTnVcI.js","/assets/VerifixSync-CBgajBcb.js","/assets/VfxApiMap-DaX_7ZFP.js","/assets/VfxDictionaries-CnG6tfaX.js","/assets/VfxEmployees-ItNTIw7a.js","/assets/VfxHrMoves-vAT-K1_O.js","/assets/VfxJobs-DrGkO1mX.js","/assets/VfxPhoto-C9rL-tOz.js","/assets/VfxShifts-D2ke10U-.js","/assets/VfxState-C8dIfv7a.js","/assets/VfxTimebooks-B3R64PcZ.js","/assets/VfxTimesheet-CjGMSB17.js","/assets/WatchProgress-GdsYgN6C.js","/assets/WebLogin-fK7ci-_Q.js","/assets/WorkersAttendance-COLTU9hI.js","/assets/WorkersComposition-C_msGIQn.js","/assets/WorkersMovements-CisnSGtZ.js","/assets/WorkersPage-CQJVkdEO.js","/assets/Zagruzka-wURkA6hq.js","/assets/ZagruzkaCell-BeOYv0BA.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DYLtWYns.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CUWhL-pE.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Cae8tTWF.js","/assets/broadcastTree-BI9nKVrp.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DNm_gU-d.js","/assets/cellMoveRefusal-DDwlcXqL.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DLC7D1C6.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Cp-92bmW.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DUW9ACd3.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Ck7JpkHp.js","/assets/index-DRxZ250D.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-hwtO0WlY.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CW8LkNiA.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-cIe14g6u.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CbqExrvr.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-DRiBQw1s.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CZW5bFLY.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-dV_vVMM9.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BCkckJOO.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-Cmz1yDFo.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-ENf-yJ9N.js","/assets/useOpenParam-CYOCUyPK.js","/assets/useStatusBands-CcZuwzx4.js","/assets/useUrlScope-DHuPgjqj.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DcfZKp4O.js","/assets/uz_cyrl-DUDqWZQn.js","/assets/vfx-BfcBkpDn.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-DEfSwjBj.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
