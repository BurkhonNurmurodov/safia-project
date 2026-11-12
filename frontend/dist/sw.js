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

const BUILD = "2026-11-12T07:28:05.096Z";
const PRECACHE = ["/","/assets/ActionHistory-DR4NgxgE.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-MyjQ0q00.js","/assets/AiKeys-DaThV_x4.js","/assets/AnalysisBoard-6Fgt2YUD.js","/assets/ApiAccess-Bnxxyv4Y.js","/assets/AppLauncher-R9XUO5wB.js","/assets/Arc-CgTeMtWi.js","/assets/Assessment-BlyGOhxj.js","/assets/AssessmentGrade-CrJoli4E.js","/assets/AssessmentList-70zhe6JC.js","/assets/Assistant-1iPISz3T.js","/assets/AttendanceCleanup-B_72nwR8.js","/assets/AttendanceUpload-f7JG9X9M.js","/assets/AuditTable-BwHjWTut.js","/assets/BrigadirProfile-B36QO62r.js","/assets/BrigadirsKpi-wIKk6kCK.js","/assets/Broadcast-B93vsQ2m.js","/assets/BroadcastReceivers-CD0v9Scq.js","/assets/BroadcastRecord-B35TYVCx.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-BRJ8ZxWb.js","/assets/CategoryLegendModal-BxGgzDS0.js","/assets/CellConcerns-C7ScMOMz.js","/assets/CellDetails-DB9Tquu3.js","/assets/CellFormModal-CevMiN6O.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-D8cx02ta.js","/assets/Cells-DeiBld10.js","/assets/ColumnFilter-Ce_g-aQW.js","/assets/ColumnsPicker-B-BuxCBr.js","/assets/CommentsModal-Di5W5DMg.js","/assets/ComparisonTable-QUCPp5EE.js","/assets/Concerns-BqjtkSld.js","/assets/ConcernsPieces-ByivOe7Z.js","/assets/CountStepper-_LjJuui6.js","/assets/Daily-CTyu4Olx.js","/assets/DataSources-CXi8u47I.js","/assets/DataTable-BMCCgPZN.js","/assets/DateRangePicker-BsYZD6Jm.js","/assets/DayReportView-ROgYT-Xx.js","/assets/DayStepper-BGlcIMV0.js","/assets/DayStrip-C2QtCf6O.js","/assets/DbBackup-CYQuavay.js","/assets/DifferenceBreakdown-DTBqkKvx.js","/assets/DocAudit-hcSLEG21.js","/assets/Downtime-BUrQdtNt.js","/assets/Education-BwK8kYVe.js","/assets/EducationLesson-DfggBSjJ.js","/assets/EmptyState-DU9UcuHC.js","/assets/Exam-C0japUxh.js","/assets/ExamAdmin-b7M-fRkA.js","/assets/Factories-B2Pn4MV3.js","/assets/FactorySelect-BhHxovgH.js","/assets/Gamification-DUj5QAAA.js","/assets/GroupBadge-DosZZuGm.js","/assets/HeatmapChart-CI3_JBVC.js","/assets/IdleCell-CGEApUFg.js","/assets/IdleOwners-CqyaAJfP.js","/assets/IdleSolutions-C-OkNcMu.js","/assets/IdleSource-CNZXCF1N.js","/assets/KPICard-DewHNjdK.js","/assets/Kaizen-BZocAUGe.js","/assets/Kelish-F0cH_XWG.js","/assets/Kitchen-BPRkxj8W.js","/assets/KpiBits-Cfne50Xz.js","/assets/KpiDeltaCard-lnJ2dt5K.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-B80qVI7u.js","/assets/LeaderAppeal-BdYwpOWj.js","/assets/LeaderCutoffs-DUlie1QF.js","/assets/LeaderDailyTasks-qiZy2GSp.js","/assets/LeaderDayExclusions-BfYKDHLb.js","/assets/LeaderDayReport-Be5W-BRN.js","/assets/LeaderTasksAdmin-DxqeLSjK.js","/assets/LeaderUnitReport-Bzl1mheT.js","/assets/Leaderboard-9s4F8NVf.js","/assets/Leaders-BQ1NgCWn.js","/assets/LeadersKpi-BKjelBv9.js","/assets/Lightbox-BFdRhAjJ.js","/assets/LiveOverview-RZq3rD4C.js","/assets/Login-Y_xt--p1.js","/assets/Logs-BNbY-rXf.js","/assets/LostWorkers-bx31Stgh.js","/assets/NotFound-CKD99ip9.js","/assets/Notifications-CqfjBJo2.js","/assets/NotionTasks-w3mNNIKB.js","/assets/NotionTrackerSettings-B42w-QKd.js","/assets/Ontime-Bj_wKLhk.js","/assets/OrgChart-kLk_Avgp.js","/assets/Ovens-D6omlYcv.js","/assets/OvensSettings-5A4Uun9N.js","/assets/Overview-BOPcWWXs.js","/assets/OwnerChip-Ca7U_wrQ.js","/assets/PageAccess-DuttIdZ6.js","/assets/Pagination-D2wAbIUQ.js","/assets/People-BzK_lUiJ.js","/assets/PerenaladkaFactTable-CJBG5kxU.js","/assets/Permissions-BrHfHc_-.js","/assets/PersonCard-B1XoK1gM.js","/assets/PlanFulfillment-C0OoJBNQ.js","/assets/Production-C4OYj8CC.js","/assets/ProductionUpload-CRQiwX0v.js","/assets/Profile-DFxjeK0h.js","/assets/ProfileAvatar-CmQrWVuL.js","/assets/ProfilesManagement-sPY_KAN-.js","/assets/ProofCamera-S_B5VMv7.js","/assets/ProofPhoto-otjPFJew.js","/assets/Quality-DsBdy5E5.js","/assets/RawRows-BMyNp3uF.js","/assets/Reports-CB-r83pd.js","/assets/RequestStateChip-Bs4ap_ZS.js","/assets/RichTextEditor-BRA-gx2q.js","/assets/SaveState-DrrLapY2.js","/assets/SearchInput-DtjIbSZC.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-C_rJEBZi.js","/assets/ShiftDaily-I50uEufd.js","/assets/ShiftTimes-D2vX4qro.js","/assets/Staff-vAZhmIeK.js","/assets/StaffListAtCheck-W9gkwuQF.js","/assets/StatusBadge-DtYqDYrQ.js","/assets/StatusBandsModal-BNxo7jw5.js","/assets/TargetGoal-DNxylt70.js","/assets/Targets-Cl7jxNXn.js","/assets/TaskerSettings--s7key5P.js","/assets/Tasks-B-0crIt1.js","/assets/TgProfile-74lQh1_q.js","/assets/TimeWheelPicker-CQ-1GItT.js","/assets/Tooltip-D6hWKJ6c.js","/assets/TranslationsEditor-CahEhNnW.js","/assets/TrelloAnalytics-BnAOBZDN.js","/assets/TrelloSettings-4bxARLRt.js","/assets/TrendChart-CbqaNJA8.js","/assets/TripleSpeedometer-D4u5EYIC.js","/assets/Trudoyomkost-VLBwrYsj.js","/assets/UploadDropzone-CvHmingv.js","/assets/UsersActivity-BlfNoPUu.js","/assets/UsersManagement-DsjQJl4l.js","/assets/VerdictBlock-BgG9loW0.js","/assets/VerifixParity-B1z8hcEJ.js","/assets/VerifixSettings-SnpEMJIe.js","/assets/VerifixSync-B40WE89E.js","/assets/VfxApiMap-CffMJPOD.js","/assets/VfxDictionaries-fG6IOmx5.js","/assets/VfxEmployees-C37PO0j2.js","/assets/VfxHrMoves-B5YHb9bm.js","/assets/VfxJobs-Lc3HwIHl.js","/assets/VfxPhoto-TBfI33Cs.js","/assets/VfxShifts-DsGrEFrJ.js","/assets/VfxState-DAAu6cB6.js","/assets/VfxTimebooks-BvIkr-36.js","/assets/VfxTimesheet-Dk-40vwe.js","/assets/WatchProgress-BIObGwQd.js","/assets/WebLogin-B7Xgv1No.js","/assets/WorkersAttendance-CyxeZKBg.js","/assets/WorkersComposition-B0jaToWs.js","/assets/WorkersMovements-CtJs1zco.js","/assets/WorkersPage-Ba2d9LEF.js","/assets/Zagruzka-BNzcpXoZ.js","/assets/ZagruzkaCell-BEcNzuYV.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-B9HEr-I5.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-rwiJchV8.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-2s54bpYX.js","/assets/broadcastTree-BTHjo82R.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-D9lS6kMJ.js","/assets/cellMoveRefusal-BdV4cN3D.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-B5H9Ttgj.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-CShouUVz.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-4m6xdGQX.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DDjgtIUU.css","/assets/index-DlVtakJc.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BMRm30gO.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-bXZ5bjkS.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-DyyzVFau.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-D4GQGWJN.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-BQYQ4GJq.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-Bxh14iUd.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-p08qfcfE.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-BIN9VTCz.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BgoxTqpe.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-BMH3ay22.js","/assets/useMutation-BYBGz9x8.js","/assets/useOpenParam-aLb3j45w.js","/assets/useStatusBands-Dg_OtjGv.js","/assets/useUrlScope-tVTG5xwS.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DT6dhiFD.js","/assets/uz_cyrl-J4JnQBga.js","/assets/vfx-CLIBoYVc.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-CDGJZfvA.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
