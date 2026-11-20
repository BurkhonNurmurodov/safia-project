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

const BUILD = "2026-11-20T13:56:06.260Z";
const PRECACHE = ["/","/assets/ActionMenu-DIjho2bj.js","/assets/AdminPage-BQ1ADxrX.js","/assets/AdminTabs-DjiCCf8V.js","/assets/AiKeys-BqN-Qaks.js","/assets/AnalysisBoard-CGJait7Q.js","/assets/ApiAccess-DsDbz9px.js","/assets/AppLauncher-CXFYu-nn.js","/assets/Arc-ouppVbsQ.js","/assets/Assessment-DYHBibse.js","/assets/AssessmentGrade-CCJWKKEJ.js","/assets/AssessmentList-CASO-caS.js","/assets/Assistant-BRm1HHiI.js","/assets/AttendanceCleanup-D-VFFtBr.js","/assets/AttendanceUpload-BWzHZ0Sn.js","/assets/AuditTable-DzWzbtj0.js","/assets/BrigadirProfile-Bv4YjUuJ.js","/assets/BrigadirsKpi-CZdCVnR0.js","/assets/Broadcast-DBQo63ax.js","/assets/BroadcastReceivers-B4IMjODh.js","/assets/BroadcastRecord-C9zhqbuH.js","/assets/Button-BByRB7Le.js","/assets/CatLockNotice-FFadMAxQ.js","/assets/CategoryLegendModal-DaXi3YMG.js","/assets/CellConcerns-RynrPkHA.js","/assets/CellDetails-CPu6pjPr.js","/assets/CellFormModal-BBou11uQ.js","/assets/CellIdent-DE6qkdqd.js","/assets/CellLink-DhsQsLyb.js","/assets/Cells-BIBUPjVq.js","/assets/ColumnFilter-B8ev35I8.js","/assets/ColumnsPicker-D_hr0rRp.js","/assets/CommentsModal-CZOO2mgq.js","/assets/ComparisonTable-KzVuhYBX.js","/assets/Concerns-D5ZBnZ_Y.js","/assets/ConcernsPieces-Cv09N1M1.js","/assets/ContainerFlow-B4bxENEa.js","/assets/ContainerTotalsCard-D8EIbwtQ.js","/assets/Containers-CfEY1wMG.js","/assets/CountStepper-Bme9Xwf5.js","/assets/Daily-B0Fb5Ipg.js","/assets/DataSources-bbMwohoh.js","/assets/DataTable-9PcVzw_o.js","/assets/DateRangePicker-K-k-MW_q.js","/assets/DayReportView-B7KK7w_R.js","/assets/DayStepper-CjjGggCP.js","/assets/DayStrip-C7LIiXN2.js","/assets/DbBackup-D_cSwQGf.js","/assets/DifferenceBreakdown-C8peMdMm.js","/assets/DocAudit-GzSxdVWg.js","/assets/Downtime-CVWADwT0.js","/assets/Education-DAfKJevX.js","/assets/EducationLesson-BWzIoH4k.js","/assets/EmptyState-DdZw4Et3.js","/assets/Equipment-iHZGSqwZ.js","/assets/Exam-D4mKiuQn.js","/assets/ExamAdmin-DDaoRJej.js","/assets/Factories-DEFUHC9l.js","/assets/FactorySelect-FGy7R0VX.js","/assets/Gamification-pMRRksaL.js","/assets/GroupBadge-Cd0trqDT.js","/assets/HeatmapChart-C-cbeAH1.js","/assets/HourlyContainers-ClrZnv3o.js","/assets/IdleCell-x5aob8Uw.js","/assets/IdleOwners-BlBz99xk.js","/assets/IdleSolutions-Cy9eZRzK.js","/assets/KPICard-Cw5WW5n_.js","/assets/Kaizen-ppsI-_HB.js","/assets/Kelish-C1eNXneL.js","/assets/Kitchen-CSqe-5fR.js","/assets/KpiBits-BGSPoNGy.js","/assets/KpiDeltaCard-BbghlZIT.js","/assets/LangContext-2A4sPKlL.js","/assets/LangTextInput-Kofaohjz.js","/assets/Layout-CzZFsdW6.js","/assets/LeaderAppeal-p2P4OSxN.js","/assets/LeaderDailyTasks-Cm92Oztt.js","/assets/LeaderDayReport--4rR1Njf.js","/assets/LeaderNotCounting-BzfJdvEc.js","/assets/LeaderTasksAdmin-CCck7obv.js","/assets/LeaderUnitReport-CACm_Hlh.js","/assets/Leaderboard-Bn1zN1sb.js","/assets/Leaders-DIgy8lQ_.js","/assets/LeadersKpi-Cp6W59CJ.js","/assets/Lightbox--W_XKy1M.js","/assets/LiveOverview-BVvVr4MH.js","/assets/Login-DOVg8w7P.js","/assets/Logs-DpbAXcA9.js","/assets/LostWorkers-CjqrIPNB.js","/assets/Meter-CRRHrYuq.js","/assets/NotFound-CxOt94Td.js","/assets/Notifications--WkVXwbu.js","/assets/NotionTasks-B-PMWJCL.js","/assets/NotionTrackerSettings-DvHl2_WF.js","/assets/Ontime-D3fZYjwu.js","/assets/OrgChart-gETwBMuN.js","/assets/Ovens-PVDPepT9.js","/assets/OvensSettings-OZ_7zown.js","/assets/Overview-DKL3PZnt.js","/assets/OwnerChip-KD-mXJWi.js","/assets/Pagination-DNcwwjBX.js","/assets/People-DYrBlbUS.js","/assets/PerenaladkaFactTable-LJbCFHWz.js","/assets/Permissions-DLBYQNN1.js","/assets/PersonCard-fkhUKXYP.js","/assets/PlanFulfillment-hVI4Kypy.js","/assets/Production-DW6pD10I.js","/assets/ProductionUpload-bvDRz767.js","/assets/Profile-BCaasR_e.js","/assets/ProfileAvatar-DdQFNUzI.js","/assets/ProfilesManagement-DcZIapAw.js","/assets/ProofCamera-C-9nswtN.js","/assets/ProofPhoto-Cc-sUJlg.js","/assets/Quality-CruT6i81.js","/assets/RawRows-cO87fjC3.js","/assets/Reports-CK916HGE.js","/assets/RequestStateChip-DXzFQkvv.js","/assets/RichTextEditor-ty7Gn8y5.js","/assets/SaveState-B1mRqeWN.js","/assets/SdPanelSettings-TmoA9Bz_.js","/assets/SearchInput-BY36LXh7.js","/assets/SeasonalityHeatmap-B65j5wfW.js","/assets/SegmentedToggle-CIxWlaZZ.js","/assets/SetupTimes-Dezg6ySQ.js","/assets/ShiftDaily-BnRmUIfm.js","/assets/ShiftTimes-B5ouuhXz.js","/assets/SortableList-DgrUPWKx.js","/assets/Staff-BWzzBlUf.js","/assets/StaffListAtCheck-lg5qY_ex.js","/assets/StatusBadge-BRXnK-p0.js","/assets/StatusBandsModal-Ci2IdiS-.js","/assets/TargetGoal-4Yb0QJ9f.js","/assets/Targets-BoUEpofh.js","/assets/TaskFormModal-BZEBXMv6.js","/assets/TaskerSettings-De0V0GqP.js","/assets/Tasks-B0qVtW8C.js","/assets/TgProfile-DX2nPa3M.js","/assets/TimeWheelPicker-BD2mDbVB.js","/assets/Toast-DLkPq-u6.js","/assets/Tooltip-Cd0j8XOq.js","/assets/TranslationsEditor-D7coqI2j.js","/assets/TrelloAnalytics-scBqOI0G.js","/assets/TrelloSettings-DLWFwrRK.js","/assets/TrendChart-C-QjyEMk.js","/assets/TripleSpeedometer-C3KD_lTp.js","/assets/Trudoyomkost-ChbWvt7Y.js","/assets/UploadDropzone-Ckl6lJR3.js","/assets/UsersActivity-BJoKIiwq.js","/assets/UsersManagement-PCwYVR_d.js","/assets/VerdictBlock-BiteuWH3.js","/assets/VerifixPage-Di1r_2i_.js","/assets/VerifixParity-AqXNN1Qn.js","/assets/VfxApiMap-BYHH8Lxp.js","/assets/VfxDictionaries-QW_HC1pc.js","/assets/VfxEmployees-DfeVw5cP.js","/assets/VfxHrMoves-Dw5uCl4K.js","/assets/VfxJobs-CJ1VuVGs.js","/assets/VfxPhoto-BFzsiW8Z.js","/assets/VfxShifts-DKqBAzCK.js","/assets/VfxState-B8fBi2WH.js","/assets/VfxTimebooks-BZfw_L4h.js","/assets/VfxTimesheet-C73u4zuq.js","/assets/WatchProgress-BcbSCIwW.js","/assets/WebLogin-BrNRTqWT.js","/assets/WorkersAttendance-BYaV0ZKl.js","/assets/WorkersComposition-C3SVhgVA.js","/assets/WorkersMovements-C9ZUePZy.js","/assets/WorkersPage-BmqKWYKK.js","/assets/Zagruzka-C1Kug4wF.js","/assets/ZagruzkaCell-BUYjB0Wa.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CdGm0wna.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BBdf690m.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-D1WLPCWe.js","/assets/broadcastTree-CK4I2zJI.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-D0wopXrB.js","/assets/categories-CM4hhcc2.js","/assets/cellMoveRefusal-C3VrGSJ8.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-B-1qlleb.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-CFVS5vIz.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-XiWRPl3b.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BH54YsjB.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-D9__53Y7.css","/assets/index-DU8GBYqO.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-B3-QghY_.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-YBrnLW4b.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CaZl1ktg.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CUBVn8lY.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-DpEJCqO6.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DLsBYaFX.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CbcfnW44.js","/assets/ru-B0rYmTCM.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-C4PfsKJ5.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-B_uv9EC3.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-ChfDr16y.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DVUn4YC5.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DSfUlzrO.js","/assets/useMutation-H67_J0-Z.js","/assets/useOpenParam-BcRwr-qn.js","/assets/useStatusBands-BEE2LEKp.js","/assets/useUrlScope-BMQ_VPBx.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DVI80f3o.js","/assets/uz_cyrl-DO3wZcY4.js","/assets/vfx--mHwzw5g.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-_jdeACrI.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/x-CfYkDDdF.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
