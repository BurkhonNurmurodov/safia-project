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

const BUILD = "2026-11-15T17:05:25.274Z";
const PRECACHE = ["/","/assets/ActionHistory-Cb2psVyq.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-Ds3h3K_i.js","/assets/AiKeys-DcQ3-uzq.js","/assets/AnalysisBoard-BaZLS1Zp.js","/assets/ApiAccess-BVCZVIyd.js","/assets/AppLauncher-Cm_b2_vP.js","/assets/Arc-UHlHtO4O.js","/assets/Assessment-KeKJhz4d.js","/assets/AssessmentGrade-t2zinv2h.js","/assets/AssessmentList-BgaVa9on.js","/assets/Assistant-DbW05uX_.js","/assets/AttendanceCleanup-ChurGUkI.js","/assets/AttendanceUpload-yIc6xri-.js","/assets/AuditTable-Dd52-Trq.js","/assets/BrigadirProfile-CyyIEqDl.js","/assets/BrigadirsKpi-BEfc2tAt.js","/assets/Broadcast-B-9GdmQS.js","/assets/BroadcastReceivers-CeeUDry3.js","/assets/BroadcastRecord-CdaibzEG.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-BWvIEB48.js","/assets/CategoryLegendModal-Bs2Vj6z4.js","/assets/CellConcerns-zgpMBqF7.js","/assets/CellDetails-DIM-VU9K.js","/assets/CellFormModal-19TP7Gs7.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-zVMrA2rY.js","/assets/Cells-C4loiMG1.js","/assets/ColumnFilter-BBTGlfWA.js","/assets/ColumnsPicker-MgX34Td2.js","/assets/CommentsModal-qZczeH8x.js","/assets/ComparisonTable-BtIaccpH.js","/assets/Concerns-ellqAg7b.js","/assets/ConcernsPieces-DiEF3vXI.js","/assets/ContainerFlow-DuGiL2gF.js","/assets/ContainerTotalsCard-Dss8KQd5.js","/assets/Containers-DwOg6wZF.js","/assets/CountStepper-fnat4oC_.js","/assets/Daily-Dz3FoN40.js","/assets/DataSources-CKD1y9E6.js","/assets/DataTable-DrCjjE73.js","/assets/DateRangePicker-nPkp29k3.js","/assets/DayReportView-C-J6AgD3.js","/assets/DayStepper-BV7hdtUO.js","/assets/DayStrip-EF5bIcM1.js","/assets/DbBackup-CUOTUGFi.js","/assets/DifferenceBreakdown-Cw-Yd9lt.js","/assets/DocAudit-mUgfX_AC.js","/assets/Downtime-ZwuXjpTi.js","/assets/Education-B8lkvLYI.js","/assets/EducationLesson-CtNIF-4d.js","/assets/EmptyState-Ck3Mozcw.js","/assets/Exam-B7eA4i7a.js","/assets/ExamAdmin-oDHAAUOS.js","/assets/Factories-DBEC063P.js","/assets/FactorySelect-CktvHo3W.js","/assets/Gamification-1dvL4jk6.js","/assets/GroupBadge-_XDTzCTJ.js","/assets/HeatmapChart-CBlQ4yIu.js","/assets/HourlyContainers-DdARqf-m.js","/assets/IdleCell-ChzJQhiw.js","/assets/IdleOwners-DsAmCufx.js","/assets/IdleSolutions-_NZ4aFdo.js","/assets/IdleSource-CTMpfqsW.js","/assets/KPICard-DBlGEDiW.js","/assets/Kaizen-DU-MKe7h.js","/assets/Kelish-Im3Br4rI.js","/assets/Kitchen-D4zNnZbx.js","/assets/KpiBits-yNZukykb.js","/assets/KpiDeltaCard-7WpOKvHJ.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-DQvRq2kP.js","/assets/LeaderAppeal-Bu4Ir1BA.js","/assets/LeaderCutoffs-BstazZAb.js","/assets/LeaderDailyTasks-DpyMw7zE.js","/assets/LeaderDayExclusions-C-Z_u6QT.js","/assets/LeaderDayReport-Dk8uCgd_.js","/assets/LeaderTasksAdmin-CLIiI4pc.js","/assets/LeaderUnitReport-C7b4AE2b.js","/assets/Leaderboard-DK1SOEtU.js","/assets/Leaders-CpYq7VHD.js","/assets/LeadersKpi-DGvjGdyX.js","/assets/Lightbox--2XHTcNJ.js","/assets/LiveOverview-BlZ70_l-.js","/assets/Login-DvYQuLq3.js","/assets/Logs-t28fshTT.js","/assets/LostWorkers-iA_pipPb.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-DdGeGuY8.js","/assets/Notifications-DL-RpH68.js","/assets/NotionTasks-DGaAvBcR.js","/assets/NotionTrackerSettings-DHzrvqrW.js","/assets/Ontime-BsqjAoW2.js","/assets/OrgChart-DdJBPYNn.js","/assets/Ovens-3_No5ia9.js","/assets/OvensSettings-D5S_8Io8.js","/assets/Overview-BtcnBSFr.js","/assets/OwnerChip-FGUpavPT.js","/assets/PageAccess-C4jLtHbW.js","/assets/Pagination-DOtm393-.js","/assets/People-eKGuD135.js","/assets/PerenaladkaFactTable-D0Z8fTMl.js","/assets/Permissions-CFmaTDut.js","/assets/PersonCard-B7Yh6peQ.js","/assets/PlanFulfillment-CE5ZPO4F.js","/assets/Production-BZehAHfR.js","/assets/ProductionUpload-Bv60cPaE.js","/assets/Profile-BsZa3PQ7.js","/assets/ProfileAvatar--ywukNx1.js","/assets/ProfilesManagement-jF3FFua9.js","/assets/ProofCamera-jvbIoWF2.js","/assets/ProofPhoto-DeYAepgA.js","/assets/Quality-CzNV2U2H.js","/assets/RawRows-BvWifjgp.js","/assets/Reports-Bbdsb4uI.js","/assets/RequestStateChip-B7tpCvS2.js","/assets/RichTextEditor-CwY7wSGo.js","/assets/SaveState-D7CuUijk.js","/assets/SearchInput-BDC8JTg-.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-C3gtKfmW.js","/assets/ShiftDaily-CgaTw9NC.js","/assets/ShiftTimes-BLeBH9Gi.js","/assets/SortableList-DCEDbyLr.js","/assets/Staff-Bu02P50z.js","/assets/StaffListAtCheck-BWE9bUoP.js","/assets/StatusBadge-C5NIk9s7.js","/assets/StatusBandsModal-RNmEeGai.js","/assets/TargetGoal-CiG41-Xz.js","/assets/Targets-hwfMgHHL.js","/assets/TaskFormModal-Cb5YQn_p.js","/assets/TaskerSettings-C1HDh0qj.js","/assets/Tasks-Dpuy0-CI.js","/assets/TgProfile-PEGcMUWE.js","/assets/TimeWheelPicker-ipmCbi5H.js","/assets/Tooltip-BIuEB9tw.js","/assets/TranslationsEditor-2bTMxSUb.js","/assets/TrelloAnalytics-1WtyjlkS.js","/assets/TrelloSettings-DNKL3Cbk.js","/assets/TrendChart-BSimQ9G5.js","/assets/TripleSpeedometer-CDn8O-iU.js","/assets/Trudoyomkost-C309vEPr.js","/assets/UploadDropzone-C4D4ZcOA.js","/assets/UsersActivity-BfZgAqob.js","/assets/UsersManagement-Bxqkejdk.js","/assets/VerdictBlock-Ic7ax2I_.js","/assets/VerifixParity-CBWD5-KC.js","/assets/VerifixSettings-CcV9va_n.js","/assets/VerifixSync-CYVpzf_n.js","/assets/VfxApiMap-Dj1hY_Cx.js","/assets/VfxDictionaries-DU9n_0hL.js","/assets/VfxEmployees-DN9lM6Bn.js","/assets/VfxHrMoves-B6pEircQ.js","/assets/VfxJobs-CUXkVpSm.js","/assets/VfxPhoto-BjyyURBS.js","/assets/VfxShifts-BFerMH1r.js","/assets/VfxState-BNiZenmZ.js","/assets/VfxTimebooks-CmssaJur.js","/assets/VfxTimesheet-CucSkBZ5.js","/assets/WatchProgress-B7GQqgk4.js","/assets/WebLogin-C_sx8Q_X.js","/assets/WorkersAttendance-2y6KCbQq.js","/assets/WorkersComposition-BcuB5YYa.js","/assets/WorkersMovements-CBxxzHkg.js","/assets/WorkersPage-CIUdwUtF.js","/assets/Zagruzka-CphSf3ow.js","/assets/ZagruzkaCell-DSyf2tQ2.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-mEDIleJe.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-jdW59O8l.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-C6nFYJKP.js","/assets/broadcastTree-C59DBO1D.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-B-U8J6w3.js","/assets/cellMoveRefusal-DDLLygUK.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-C8xFE2rT.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-RySUnmUf.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-CaArGGnu.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-1jqwllvK.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Dvh3RMay.js","/assets/index-Rq15oGzo.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-COUY0M63.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CdAIG54d.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-D7QA-ruj.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BI4gKpNq.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-B5DK-nhV.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-9xd8uGYp.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CdPipex2.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/triangle-alert-CnUaq82N.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-yjZO66uT.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-B9H6hPaF.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-Dx_6EIpR.js","/assets/useOpenParam-BsPfX_mV.js","/assets/useStatusBands-CAnSS144.js","/assets/useUrlScope-CrKK3c4z.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DwwlhPXs.js","/assets/uz_cyrl-B7G9UCfw.js","/assets/vfx-Oqj_6huv.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-CTOzmVTT.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
