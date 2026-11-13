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

const BUILD = "2026-11-13T07:25:06.820Z";
const PRECACHE = ["/","/assets/ActionHistory-cQnJk8jB.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-CkT4g3Cv.js","/assets/AiKeys-DlXKg7Fz.js","/assets/AnalysisBoard-ClryBuX7.js","/assets/ApiAccess-TylV__l_.js","/assets/AppLauncher-CXyl4Yyp.js","/assets/Arc-BJ39DvBT.js","/assets/Assessment-COIMa2SX.js","/assets/AssessmentGrade-CgOVt-GP.js","/assets/AssessmentList-BQsqRLrI.js","/assets/Assistant-C2U_ygQo.js","/assets/AttendanceCleanup--27nP6-e.js","/assets/AttendanceUpload-DEZgQHX8.js","/assets/AuditTable-J2OHrPJu.js","/assets/BrigadirProfile-A5bht3Lp.js","/assets/BrigadirsKpi-Bf6UmPEn.js","/assets/Broadcast-BT6Oi5J3.js","/assets/BroadcastReceivers-BPZx0yN6.js","/assets/BroadcastRecord-Fu8HuhYN.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-sYVuKlTy.js","/assets/CategoryLegendModal-BuTB7sSp.js","/assets/CellConcerns-CdWxo0Fz.js","/assets/CellDetails-83YVvx8A.js","/assets/CellFormModal-C3bX03xd.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-BjJVt75n.js","/assets/Cells-DAGo9njy.js","/assets/ColumnFilter-stQ1rK_B.js","/assets/ColumnsPicker-xGPb0DmF.js","/assets/CommentsModal-KHFnoQm8.js","/assets/ComparisonTable-CQMr29je.js","/assets/Concerns-1dY9xwi2.js","/assets/ConcernsPieces-D9BWLSja.js","/assets/ContainerTotalsCard-he11RKXq.js","/assets/Containers-Dr7K75R0.js","/assets/CountStepper-Du2F1Va9.js","/assets/Daily-uUPcf8Ks.js","/assets/DataSources-CFTK_aZI.js","/assets/DataTable-DvaTJkkp.js","/assets/DateRangePicker-BF8Qys8C.js","/assets/DayReportView-CSjlqfgd.js","/assets/DayStepper-CfJfb4Sv.js","/assets/DayStrip-d1mmU9sY.js","/assets/DbBackup-OmuWY_gA.js","/assets/DifferenceBreakdown-CeUsMJEb.js","/assets/DocAudit-Cda93G8W.js","/assets/Downtime-mqndei0I.js","/assets/Education-C2X_YMpA.js","/assets/EducationLesson-CYoqhQ-_.js","/assets/EmptyState-Cl0_cH4j.js","/assets/Exam-Dtj57vi5.js","/assets/ExamAdmin-DkwieT5m.js","/assets/Factories-CAFEv0Y7.js","/assets/FactorySelect-WKPLLWXK.js","/assets/Gamification-BsIdi2QC.js","/assets/GroupBadge-Byzoxk_-.js","/assets/HeatmapChart-Iootn8qR.js","/assets/HourlyContainers-CmKA1ocn.js","/assets/IdleCell-DUedZsuG.js","/assets/IdleOwners-_zBBSFyq.js","/assets/IdleSolutions-YHxRX4eM.js","/assets/IdleSource-BT768cre.js","/assets/KPICard-CmXUdIg9.js","/assets/Kaizen-D9XVAC5a.js","/assets/Kelish-sFX32wYF.js","/assets/Kitchen-C57wkk85.js","/assets/KpiBits-BuGf-MLA.js","/assets/KpiDeltaCard-BwOvqDnM.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-DrL79rzJ.js","/assets/LeaderAppeal-Dft8fZOt.js","/assets/LeaderCutoffs-5LK-KTAK.js","/assets/LeaderDailyTasks-Dt6TKFpC.js","/assets/LeaderDayExclusions-Cc-YRmAZ.js","/assets/LeaderDayReport-BdlNDKsR.js","/assets/LeaderTasksAdmin-CufKKg9m.js","/assets/LeaderUnitReport-S-q2p6rT.js","/assets/Leaderboard-BYqYmj7z.js","/assets/Leaders-C88OB9Uw.js","/assets/LeadersKpi-pevd5sjw.js","/assets/Lightbox-okO1jgp2.js","/assets/LiveOverview-D_514VZX.js","/assets/Login-DwWRIDf4.js","/assets/Logs-DdnpvqPf.js","/assets/LostWorkers-Gd4XhMfR.js","/assets/NotFound-Dng3Zj5P.js","/assets/Notifications-jsEiolhT.js","/assets/NotionTasks-BkqT8Krq.js","/assets/NotionTrackerSettings-BsepOgqp.js","/assets/Ontime-BMkyjdDJ.js","/assets/OrgChart-Gia687Kb.js","/assets/Ovens-CN_pw0nX.js","/assets/OvensSettings-1kCdT2lS.js","/assets/Overview-737Z4Ril.js","/assets/OwnerChip-BTIVkQ06.js","/assets/PageAccess-DyNNZ_oP.js","/assets/Pagination-C1y2gWq8.js","/assets/People-UfuUylt7.js","/assets/PerenaladkaFactTable-BX6QYVuz.js","/assets/Permissions-D-E1sWuk.js","/assets/PersonCard-j5c6RTmk.js","/assets/PlanFulfillment-CIxePXFU.js","/assets/Production-m6aA6_Tu.js","/assets/ProductionUpload-DbtVy_Mc.js","/assets/Profile-C-CzvWnO.js","/assets/ProfileAvatar-0fimfI7w.js","/assets/ProfilesManagement-mmSupeby.js","/assets/ProofCamera-CxYonEZs.js","/assets/ProofPhoto-4WkjgVy9.js","/assets/Quality-BvHGMv8d.js","/assets/RawRows-Bqz1eDXb.js","/assets/Reports-Awi_uR42.js","/assets/RequestStateChip-dNFGCtYH.js","/assets/RichTextEditor-AvouBYqN.js","/assets/SaveState-DrP6RtXj.js","/assets/SearchInput-BXTsnFuj.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-BhlZ3aL3.js","/assets/ShiftDaily-D3SD9AkK.js","/assets/ShiftTimes-D3o96aL7.js","/assets/Staff-CcxYhRzp.js","/assets/StaffListAtCheck-BqYADqgT.js","/assets/StatusBadge-BltvWBI0.js","/assets/StatusBandsModal-B4PItyY7.js","/assets/TargetGoal-EvPrMgZ5.js","/assets/Targets-BA9hkoRr.js","/assets/TaskerSettings-D52A8ILX.js","/assets/Tasks-CvhKBI_5.js","/assets/TgProfile-BxUV94aB.js","/assets/TimeWheelPicker-cQksoY_k.js","/assets/Tooltip-DmKoifN1.js","/assets/TranslationsEditor-g2T1PV0c.js","/assets/TrelloAnalytics-CfTQy5tG.js","/assets/TrelloSettings-DfTuYgnt.js","/assets/TrendChart-uN4Kjhm8.js","/assets/TripleSpeedometer-CEiNvbG2.js","/assets/Trudoyomkost-CSINsV0n.js","/assets/UploadDropzone-DDV1812F.js","/assets/UsersActivity-Hyr0DzqC.js","/assets/UsersManagement-DNBx3-42.js","/assets/VerdictBlock-C2cYg8Dz.js","/assets/VerifixParity-C2-Zh1CM.js","/assets/VerifixSettings-DA3amDID.js","/assets/VerifixSync-BoL-zlxJ.js","/assets/VfxApiMap-Lj0CnvE8.js","/assets/VfxDictionaries-Bf8Wflef.js","/assets/VfxEmployees-CM6YRqFI.js","/assets/VfxHrMoves-VaSK1Eue.js","/assets/VfxJobs-UV5DrR4f.js","/assets/VfxPhoto-DzA99ebI.js","/assets/VfxShifts--aS5pwqK.js","/assets/VfxState-SaD3Qa9T.js","/assets/VfxTimebooks-CkXyxB5r.js","/assets/VfxTimesheet-BJ7o8K5U.js","/assets/WatchProgress-DmFZhGMm.js","/assets/WebLogin-BdoI9ZV8.js","/assets/WorkersAttendance-DEOTUw2R.js","/assets/WorkersComposition-BVoH2c87.js","/assets/WorkersMovements-k_QZSBUl.js","/assets/WorkersPage-CSQ6PC_P.js","/assets/Zagruzka-S_6NifvZ.js","/assets/ZagruzkaCell-CdrfVQEA.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DuEe1yEP.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-B67cLl29.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-SoO-rVN3.js","/assets/broadcastTree-C_ObpdRw.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DComyz80.js","/assets/cellMoveRefusal-BUtfY-PR.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BkUPVWml.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-CedyAdeo.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CxBz5SHM.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Do5oS5bF.css","/assets/index-DqcQOXNt.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-gD9h3MHt.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BzmoHh2k.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-oJAlNWE_.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-pX-a1fwN.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-D2UPl6EF.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-Dw_pwITK.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-BN13QfQ6.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-BIN9VTCz.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BFLE8cOK.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DCr7fN4e.js","/assets/useMutation-KECMmIIZ.js","/assets/useOpenParam-COjqToGJ.js","/assets/useStatusBands-CeJV03PM.js","/assets/useUrlScope-WEu5E-Ku.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BcO8NlY9.js","/assets/uz_cyrl-Buc1ifrd.js","/assets/vfx-Ca9sseJq.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-DUKy3WsH.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
