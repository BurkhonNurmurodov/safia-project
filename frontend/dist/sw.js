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

const BUILD = "2026-11-15T16:57:52.432Z";
const PRECACHE = ["/","/assets/ActionHistory-BXRl2hXt.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-B-Crjec4.js","/assets/AiKeys-C3rUUoi6.js","/assets/AnalysisBoard-Bh8xJgpm.js","/assets/ApiAccess-CY1m5teN.js","/assets/AppLauncher-D52xk0AM.js","/assets/Arc-DxLFVh-L.js","/assets/Assessment-DQNJIPfU.js","/assets/AssessmentGrade-DG0HDYst.js","/assets/AssessmentList-DG8RbO_k.js","/assets/Assistant-CM6lIHUh.js","/assets/AttendanceCleanup-DNIsm_K1.js","/assets/AttendanceUpload-BUDEZ4nA.js","/assets/AuditTable-DwBqsV7O.js","/assets/BrigadirProfile-DUSiBFIe.js","/assets/BrigadirsKpi-CDS3ZJ8U.js","/assets/Broadcast-weiIYb8J.js","/assets/BroadcastReceivers-FiNZNzpa.js","/assets/BroadcastRecord-DfIczoFy.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-BIul0GVg.js","/assets/CategoryLegendModal-2YhJFmy6.js","/assets/CellConcerns-Cjn0O0rE.js","/assets/CellDetails-Bxj_G0VE.js","/assets/CellFormModal-DO34v1H8.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-BWQ23oOr.js","/assets/Cells-BdauqCln.js","/assets/ColumnFilter-YAWiV_I2.js","/assets/ColumnsPicker-D-eRgsel.js","/assets/CommentsModal-CoxZYXrp.js","/assets/ComparisonTable-BrOL1ZgT.js","/assets/Concerns-D1VM1Lr1.js","/assets/ConcernsPieces-D0z5FXWy.js","/assets/ContainerFlow-C6a14ITv.js","/assets/ContainerTotalsCard-CLge_feP.js","/assets/Containers-KSffGEsB.js","/assets/CountStepper-DfTNwJNL.js","/assets/Daily-NJ29daU7.js","/assets/DataSources-zV3-vK66.js","/assets/DataTable-ACBBKfyb.js","/assets/DateRangePicker-DatVPGGh.js","/assets/DayReportView-CqDE9XjJ.js","/assets/DayStepper-DkUvo8af.js","/assets/DayStrip-816A92ME.js","/assets/DbBackup-DTxhERQZ.js","/assets/DifferenceBreakdown-r9GGk23D.js","/assets/DocAudit-CQX9sfXd.js","/assets/Downtime-BZouEe5H.js","/assets/Education-DC9pSn0Z.js","/assets/EducationLesson-Sh1j12_b.js","/assets/EmptyState-BiGF__DL.js","/assets/Exam-D0aEOYSO.js","/assets/ExamAdmin-C5BWIbEz.js","/assets/Factories-D1NyrBAL.js","/assets/FactorySelect-BcMayOpg.js","/assets/Gamification-leGkC3ZL.js","/assets/GroupBadge-DSGf54P6.js","/assets/HeatmapChart-Dy_-1dcl.js","/assets/HourlyContainers-CH7Wv-UQ.js","/assets/IdleCell-CJGAR3KM.js","/assets/IdleOwners-D_cq2_Ny.js","/assets/IdleSolutions-CPdxak_I.js","/assets/IdleSource-QZUs-LN8.js","/assets/KPICard-CfX7da-i.js","/assets/Kaizen-_0eRHWI4.js","/assets/Kelish-BO50rhiw.js","/assets/Kitchen-Si8JwwhJ.js","/assets/KpiBits-DPaBjaqK.js","/assets/KpiDeltaCard-BQIVXhth.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-C57ychYc.js","/assets/LeaderAppeal-Bm9DiB0s.js","/assets/LeaderCutoffs-FsDUf-R8.js","/assets/LeaderDailyTasks-DepwwZ7u.js","/assets/LeaderDayExclusions-fUQOqyhi.js","/assets/LeaderDayReport-D9psuP7A.js","/assets/LeaderTasksAdmin-C5QvezFT.js","/assets/LeaderUnitReport-CD0fqICV.js","/assets/Leaderboard-BeeZhpQc.js","/assets/Leaders-Bjhxf1Cq.js","/assets/LeadersKpi-y3Jf-3Ly.js","/assets/Lightbox-CeFp_u2p.js","/assets/LiveOverview-C3EDQXJY.js","/assets/Login-1FLvO29m.js","/assets/Logs-C-uGBCk2.js","/assets/LostWorkers-CR_ip9JY.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-tZG5liMF.js","/assets/Notifications-DCd4WxVV.js","/assets/NotionTasks-CJzNu5al.js","/assets/NotionTrackerSettings-BJw8okXl.js","/assets/Ontime-CkNAE2ZQ.js","/assets/OrgChart-CtOhISo_.js","/assets/Ovens-pammuhJm.js","/assets/OvensSettings-CQYqnS6o.js","/assets/Overview-DcFsqNY2.js","/assets/OwnerChip-BGfSH62F.js","/assets/PageAccess-C_COm6mK.js","/assets/Pagination-B5BAOG2H.js","/assets/People-heoX01Ix.js","/assets/PerenaladkaFactTable-BSxkKrLe.js","/assets/Permissions-By3jqK_0.js","/assets/PersonCard-BMhDSVCi.js","/assets/PlanFulfillment-4Uzx_RKp.js","/assets/Production-BjlEIDeo.js","/assets/ProductionUpload-COIj1GDt.js","/assets/Profile-C_cxcrFY.js","/assets/ProfileAvatar-B4KNRoTe.js","/assets/ProfilesManagement-BrV2NVVR.js","/assets/ProofCamera-C5E6uAKi.js","/assets/ProofPhoto-HAktuYm7.js","/assets/Quality-CVKG47g0.js","/assets/RawRows-j4376Txi.js","/assets/Reports-DCBfbO74.js","/assets/RequestStateChip-Dtdx9sdq.js","/assets/RichTextEditor-fE8MiRA2.js","/assets/SaveState-CcUOcaZO.js","/assets/SearchInput-DlB9pZr5.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-gHC5Zpz_.js","/assets/ShiftDaily-DDzF_23p.js","/assets/ShiftTimes-eECaCyvB.js","/assets/SortableList-DCEDbyLr.js","/assets/Staff-RWkKa8tD.js","/assets/StaffListAtCheck-Djy34Z3B.js","/assets/StatusBadge-B90t9y3y.js","/assets/StatusBandsModal-DGcYFOHF.js","/assets/TargetGoal-aEs4095E.js","/assets/Targets-DwxRc1Yr.js","/assets/TaskFormModal-CiVAZC7u.js","/assets/TaskerSettings-BI9z-HKc.js","/assets/Tasks-Djj_dY23.js","/assets/TgProfile-C7m2wQoD.js","/assets/TimeWheelPicker-DF4OKZwl.js","/assets/Tooltip-DVjJX5Gc.js","/assets/TranslationsEditor-xwY7HG3p.js","/assets/TrelloAnalytics-Co9T7BC3.js","/assets/TrelloSettings-BqHyu_U-.js","/assets/TrendChart-BmkguT7T.js","/assets/TripleSpeedometer-CG93SF9p.js","/assets/Trudoyomkost-DnR4wMEM.js","/assets/UploadDropzone-DVdzoIEc.js","/assets/UsersActivity-D8xwIHCR.js","/assets/UsersManagement-D7o-NLQ8.js","/assets/VerdictBlock-Czres_mN.js","/assets/VerifixParity-DXI2UYw_.js","/assets/VerifixSettings-BVQgdKE7.js","/assets/VerifixSync-kKOGgHOP.js","/assets/VfxApiMap-gZ7mgoWg.js","/assets/VfxDictionaries-BK6bJGhR.js","/assets/VfxEmployees-C_TX3LI9.js","/assets/VfxHrMoves-U2OLV3pP.js","/assets/VfxJobs-DMcofvhh.js","/assets/VfxPhoto-Db4SatKW.js","/assets/VfxShifts-DSVdflzg.js","/assets/VfxState-BEMPlDxW.js","/assets/VfxTimebooks-ChkJhOEy.js","/assets/VfxTimesheet-yWROy44G.js","/assets/WatchProgress-D_1SEgNy.js","/assets/WebLogin-DLwVSkMl.js","/assets/WorkersAttendance-BiY3GuTA.js","/assets/WorkersComposition-DgM3Gt6x.js","/assets/WorkersMovements-BcDzuJlS.js","/assets/WorkersPage-HCaPJIyU.js","/assets/Zagruzka-Bz_XHy5a.js","/assets/ZagruzkaCell-BA94-1vo.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DTssDhis.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-KK2YLuGR.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters--AYzsN8X.js","/assets/broadcastTree-C6_wQItp.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-u_8Vzz9G.js","/assets/cellMoveRefusal-BSnZSnzD.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-C3E1CseP.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-RySUnmUf.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-Dyoge2Ui.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CjebjT-b.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Daf6V9T-.js","/assets/index-Rq15oGzo.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DtHvkANQ.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BB4EANlY.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-C7yzKkr_.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DBLW_SSN.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-B5DK-nhV.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-B-IWOqng.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CdPipex2.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/triangle-alert-CnUaq82N.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Dop7P0hz.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-3YTZDh5Y.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-BBSmUbyR.js","/assets/useOpenParam-By7d2fB9.js","/assets/useStatusBands-D31mSmqd.js","/assets/useUrlScope-D1D2xb2E.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DwwlhPXs.js","/assets/uz_cyrl-B7G9UCfw.js","/assets/vfx-S74hN_eV.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-DzITvjDp.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
