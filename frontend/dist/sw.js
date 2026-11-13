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

const BUILD = "2026-11-13T16:27:55.753Z";
const PRECACHE = ["/","/assets/ActionHistory-rrceSJUR.js","/assets/ActionMenu-DbWiby4f.js","/assets/AdminPage-DyYF3dy3.js","/assets/AiKeys-DgntKRlH.js","/assets/AnalysisBoard-BCl2K5Rz.js","/assets/ApiAccess-CKvdByLa.js","/assets/AppLauncher-L0MESpbS.js","/assets/Arc-Btt6Q5_g.js","/assets/Assessment-Dq9P0esB.js","/assets/AssessmentGrade-BIKn2IZR.js","/assets/AssessmentList-JAOHuKnD.js","/assets/Assistant-BseydYyQ.js","/assets/AttendanceCleanup-DCP3usur.js","/assets/AttendanceUpload-DDgOWm6W.js","/assets/AuditTable-Co3sPkc-.js","/assets/BrigadirProfile-BaL2HUXg.js","/assets/BrigadirsKpi-Ld8LTuKQ.js","/assets/Broadcast-FhPoe5Xf.js","/assets/BroadcastReceivers-DXh6TApJ.js","/assets/BroadcastRecord-BrT96TEt.js","/assets/Button-BkqO76fy.js","/assets/CatLockNotice-D_rcluIS.js","/assets/CategoryLegendModal-CcLV71dF.js","/assets/CellConcerns-BFPytEHS.js","/assets/CellDetails-D_RKRERa.js","/assets/CellFormModal-DwKqVDsg.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-CyIwD2LE.js","/assets/Cells-CTJffgU0.js","/assets/ColumnFilter-ClzoL8Py.js","/assets/ColumnsPicker-BbgrDdby.js","/assets/CommentsModal-DUX6vsO-.js","/assets/ComparisonTable-BDlZZH9e.js","/assets/Concerns-Cn2UvZMy.js","/assets/ConcernsPieces-Brqqg0IS.js","/assets/ContainerTotalsCard-BKsfw-nT.js","/assets/Containers-B5JzVozi.js","/assets/CountStepper-Cb2jygm6.js","/assets/Daily-BWY5e4mm.js","/assets/DataSources-BXfEGlmA.js","/assets/DataTable-B-ATH8Wj.js","/assets/DateRangePicker-DYMGWHcf.js","/assets/DayReportView-dfYi5Z2Y.js","/assets/DayStepper-BOZZ9NqV.js","/assets/DayStrip-CRCy9mIj.js","/assets/DbBackup-A2VBJcgU.js","/assets/DifferenceBreakdown-Bh9zM8HH.js","/assets/DocAudit-Dy_PFgDg.js","/assets/Downtime-Mto2CB5e.js","/assets/Education-Mq-u0vBy.js","/assets/EducationLesson-DpK4x9Jf.js","/assets/EmptyState-B7-Zryl7.js","/assets/Exam-COAKgh2T.js","/assets/ExamAdmin-MDQdg0R1.js","/assets/Factories-CldCgBqc.js","/assets/FactorySelect-CKGrHM3_.js","/assets/Gamification-BRIT3L2d.js","/assets/GroupBadge-CfNXHQrq.js","/assets/HeatmapChart-BuiRRuhd.js","/assets/HourlyContainers-DqiPJX18.js","/assets/IdleCell-BPJhmH_z.js","/assets/IdleOwners-C5LEe1qW.js","/assets/IdleSolutions-tCmN60O-.js","/assets/IdleSource-BlRGUVb-.js","/assets/KPICard-CESBPXvG.js","/assets/Kaizen-BKnBN5KP.js","/assets/Kelish-BOKpb93Z.js","/assets/Kitchen-Dr6WSBLy.js","/assets/KpiBits-Dh91vqBZ.js","/assets/KpiDeltaCard-B60hjD3c.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CvYTJAne.js","/assets/Layout-CEvjnWv4.js","/assets/LeaderAppeal-BeXvmOI6.js","/assets/LeaderCutoffs-DHCgTPsS.js","/assets/LeaderDailyTasks-CFtN_JxS.js","/assets/LeaderDayExclusions-DGF7wUJ7.js","/assets/LeaderDayReport-CtWUQdkU.js","/assets/LeaderTasksAdmin-D7V3vI-f.js","/assets/LeaderUnitReport-U2jJ3fY1.js","/assets/Leaderboard-5Qa5ZkRK.js","/assets/Leaders-CfqP00UZ.js","/assets/LeadersKpi-CpTi5TvF.js","/assets/Lightbox-GHR-PBp1.js","/assets/LiveOverview-STwZZcKG.js","/assets/Login-DYUeiO_R.js","/assets/Logs-CWyFyy6C.js","/assets/LostWorkers-406M_K8o.js","/assets/NotFound-CrDmCPts.js","/assets/Notifications-DlN7uwtf.js","/assets/NotionTasks-CnkJsiav.js","/assets/NotionTrackerSettings-CZ08CGe0.js","/assets/Ontime-CcZF9sg3.js","/assets/OrgChart-DlIkdOtu.js","/assets/Ovens-Ch0OicfG.js","/assets/OvensSettings-CzzP4UyC.js","/assets/Overview-Ck4E7MPL.js","/assets/OwnerChip-DDxIcvQg.js","/assets/PageAccess-DtPqNJkl.js","/assets/Pagination-uzh0hr5s.js","/assets/People-BM-GgSjS.js","/assets/PerenaladkaFactTable-CZTi9LLl.js","/assets/Permissions-EYUW_877.js","/assets/PersonCard-B5tHTtEY.js","/assets/PlanFulfillment-C6iXcKcC.js","/assets/Production-Df-LSxqT.js","/assets/ProductionUpload-SIgqb1Lg.js","/assets/Profile-0JCv6d_C.js","/assets/ProfileAvatar-CcU-Ml5A.js","/assets/ProfilesManagement-BBERCrFu.js","/assets/ProofCamera-DmOCMaDD.js","/assets/ProofPhoto-jZF8g9De.js","/assets/Quality-BDoGBM42.js","/assets/RawRows-CNFWIDN4.js","/assets/Reports-Cdw86ylb.js","/assets/RequestStateChip-3A4r1JrM.js","/assets/RichTextEditor-htKHWcsp.js","/assets/SaveState-GQqOhTNi.js","/assets/SearchInput-CDwQRaDb.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-C8myJDPN.js","/assets/SetupTimes-DkNrp3dP.js","/assets/ShiftDaily-BMoLdWRQ.js","/assets/ShiftTimes-DGX2bMCq.js","/assets/Staff-LjqY99y7.js","/assets/StaffListAtCheck-DykPh47G.js","/assets/StatusBadge-CFhxFuVN.js","/assets/StatusBandsModal-K4mO2__l.js","/assets/TargetGoal-BHLrXNRO.js","/assets/Targets-CgVuSAK4.js","/assets/TaskerSettings-DVXr6WW9.js","/assets/Tasks-GloxJmrG.js","/assets/TgProfile-DOal12uZ.js","/assets/TimeWheelPicker-pZ1CYyH1.js","/assets/Tooltip-DxzX8hkf.js","/assets/TranslationsEditor-DsMoOeSe.js","/assets/TrelloAnalytics-DkGhZsJb.js","/assets/TrelloSettings-UZP1JMqy.js","/assets/TrendChart-D4G9ZdoB.js","/assets/TripleSpeedometer-B9iIqPEA.js","/assets/Trudoyomkost-GP37sFLU.js","/assets/UploadDropzone-Ddv1fuRw.js","/assets/UsersActivity-BvVNtweg.js","/assets/UsersManagement-7aVi-MuD.js","/assets/VerdictBlock-D1uZiaRW.js","/assets/VerifixParity-DtuaWufV.js","/assets/VerifixSettings-C4wzzwfC.js","/assets/VerifixSync-WYAyFMHz.js","/assets/VfxApiMap-B_i5Swg7.js","/assets/VfxDictionaries-B4JA5TIH.js","/assets/VfxEmployees-CllHxpi3.js","/assets/VfxHrMoves-CsKZ5OVA.js","/assets/VfxJobs-B55LrPji.js","/assets/VfxPhoto-Ci_BOKpm.js","/assets/VfxShifts-C62jur1L.js","/assets/VfxState-4gJbopwk.js","/assets/VfxTimebooks-rwpubGT5.js","/assets/VfxTimesheet-C3SqL5_b.js","/assets/WatchProgress-CXPxnoi-.js","/assets/WebLogin-Dzzlb3RH.js","/assets/WorkersAttendance-BEOJ5Yka.js","/assets/WorkersComposition-CXCxyRKJ.js","/assets/WorkersMovements-NdhP1E3i.js","/assets/WorkersPage-lg2vybkl.js","/assets/Zagruzka-DpQtdGYu.js","/assets/ZagruzkaCell-CsCpDT2b.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CPGmFW1m.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CvieJDLe.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-5tmrHKb6.js","/assets/broadcastTree-DlYUboa6.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BaZSKlEO.js","/assets/cellMoveRefusal-BSkSKdi_.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Bd4DNIAo.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Bc2p6NWp.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-D5ZSxLHO.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CNmIe3Zo.js","/assets/index-DwKjykHF.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DAUGCFHg.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BT_BW4tc.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-Ch47kaaE.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-Twphy3ZO.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-D1VWeXTo.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-D3a0QoEj.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DmlfsaDu.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CnoNg1Mq.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-Cc1K1Mm9.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-DOv2exD3.js","/assets/useOpenParam-lhXlZUCq.js","/assets/useStatusBands-1hadOJL_.js","/assets/useUrlScope-CnpHndBf.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-COsWWMxu.js","/assets/uz_cyrl-CwR-sQCY.js","/assets/vfx-CUGgbznK.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-Chocs8l_.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
