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

const BUILD = "2026-11-14T13:22:32.160Z";
const PRECACHE = ["/","/assets/ActionHistory-BAym_H8u.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-4PKV_RF8.js","/assets/AiKeys-pCwU3vWu.js","/assets/AnalysisBoard-DqKjg-7L.js","/assets/ApiAccess-Cy6P8FrL.js","/assets/AppLauncher-DDwCv5bj.js","/assets/Arc-BH5TfnC1.js","/assets/Assessment-EiFs_9Dp.js","/assets/AssessmentGrade-DqESMTzq.js","/assets/AssessmentList-BY_39yNO.js","/assets/Assistant-DMejM4aU.js","/assets/AttendanceCleanup-CI7OY_vG.js","/assets/AttendanceUpload-unglU-He.js","/assets/AuditTable-lBRiCPCj.js","/assets/BrigadirProfile-Bc6t1bLt.js","/assets/BrigadirsKpi-FYqvaO6G.js","/assets/Broadcast-C4jFXmGf.js","/assets/BroadcastReceivers-BAffcxfc.js","/assets/BroadcastRecord-YY_AOtX6.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-CC7zoWWt.js","/assets/CategoryLegendModal-BfQsV0Of.js","/assets/CellConcerns-Dgz5rAT5.js","/assets/CellDetails-CSWFF7kY.js","/assets/CellFormModal-TC0ZL50F.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-_z0CH8zV.js","/assets/Cells-BlsjuzKI.js","/assets/ColumnFilter-CS4v2Lv-.js","/assets/ColumnsPicker-Cb1rGkci.js","/assets/CommentsModal-DR3Dygr3.js","/assets/ComparisonTable-iXvPHk8N.js","/assets/Concerns-CxbYpfxy.js","/assets/ConcernsPieces-B_qrKGOD.js","/assets/ContainerFlow-DxbJfCFY.js","/assets/ContainerTotalsCard-BCfFbBtM.js","/assets/Containers-lRPpq6kB.js","/assets/CountStepper-ChdijqxL.js","/assets/Daily-DjlM7IH9.js","/assets/DataSources-DmyARI3y.js","/assets/DataTable-gjvCSzDv.js","/assets/DateRangePicker-D15GCazf.js","/assets/DayReportView-_KYZHU7H.js","/assets/DayStepper-6yHmLoka.js","/assets/DayStrip-CuMZAhrZ.js","/assets/DbBackup-BILJyzXP.js","/assets/DifferenceBreakdown-DMUdNm5F.js","/assets/DocAudit-C_kpcDkO.js","/assets/Downtime-B-iWz5qN.js","/assets/Education-D-XCoeRt.js","/assets/EducationLesson-CPrxK-II.js","/assets/EmptyState-D7vtgQoy.js","/assets/Exam-DyHwB8MO.js","/assets/ExamAdmin-DwaKzuRS.js","/assets/Factories-C-zOiC3I.js","/assets/FactorySelect-BE16kI7b.js","/assets/Gamification-D-lQZjPw.js","/assets/GroupBadge-Dm1IHSuB.js","/assets/HeatmapChart-DZ93Hccl.js","/assets/HourlyContainers-BRB-bUDP.js","/assets/IdleCell-BBl27HuU.js","/assets/IdleOwners-BJ1TbgLe.js","/assets/IdleSolutions-D8ge9BfL.js","/assets/IdleSource-C65z-b_x.js","/assets/KPICard-CtC7KFwr.js","/assets/Kaizen-BH_9Vh3f.js","/assets/Kelish-Dwi4X2E6.js","/assets/Kitchen-Crxvss7u.js","/assets/KpiBits-rYuLWQk4.js","/assets/KpiDeltaCard-CZO8ho6z.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-BmQJwgA-.js","/assets/LeaderAppeal-BIUEnJyM.js","/assets/LeaderCutoffs-ejugjtel.js","/assets/LeaderDailyTasks-CriQ77R4.js","/assets/LeaderDayExclusions-CWcos-dD.js","/assets/LeaderDayReport-CO48cfEB.js","/assets/LeaderTasksAdmin-amplc4zp.js","/assets/LeaderUnitReport-Bm4S4HjF.js","/assets/Leaderboard-D6YP6YZC.js","/assets/Leaders-AHdMGZUQ.js","/assets/LeadersKpi-wul5EL1p.js","/assets/Lightbox-EtcrGXe4.js","/assets/LiveOverview-BiFrR1wE.js","/assets/Login-9peIukG_.js","/assets/Logs-DibCXuq1.js","/assets/LostWorkers-GB1wODpR.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-BBKa6nsT.js","/assets/Notifications-DyNQZtyC.js","/assets/NotionTasks-BFEV3u1H.js","/assets/NotionTrackerSettings-A6oYhGje.js","/assets/Ontime-D6i2O-4p.js","/assets/OrgChart-DJbivD4t.js","/assets/Ovens-DOjSsB41.js","/assets/OvensSettings-DSHh2S1X.js","/assets/Overview-dzXugJKB.js","/assets/OwnerChip-DutCotxF.js","/assets/PageAccess-CJ6V20YI.js","/assets/Pagination-PDlBfIBS.js","/assets/People-nuntfFM9.js","/assets/PerenaladkaFactTable-B9-eqS-K.js","/assets/Permissions-LJRiyE7m.js","/assets/PersonCard-C9e0TQZ3.js","/assets/PlanFulfillment-CjmZsq-d.js","/assets/Production-DzNj-KNc.js","/assets/ProductionUpload-BUtxm0nQ.js","/assets/Profile-0i42Sz5k.js","/assets/ProfileAvatar-CZHOJbWd.js","/assets/ProfilesManagement-CMECAPpo.js","/assets/ProofCamera-cXui5hm8.js","/assets/ProofPhoto-B_7kgGg1.js","/assets/Quality-BlmJ9zud.js","/assets/RawRows-nLKpt2h2.js","/assets/Reports-CmcVHRNp.js","/assets/RequestStateChip-OgqXdSH0.js","/assets/RichTextEditor-C6DMrWjN.js","/assets/SaveState-D4f5Hx7f.js","/assets/SearchInput-CczB1m7o.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-CUQAg3OU.js","/assets/ShiftDaily-C7UchFN5.js","/assets/ShiftTimes-B2G97C7u.js","/assets/Staff-ozN9ldw5.js","/assets/StaffListAtCheck-BO8OkLYj.js","/assets/StatusBadge-iSYoqNOG.js","/assets/StatusBandsModal-QB1CfosT.js","/assets/TargetGoal-DxsK-mw-.js","/assets/Targets-BSyXoKl1.js","/assets/TaskerSettings-C1r3BICz.js","/assets/Tasks-BfD6KRmm.js","/assets/TgProfile-BRpEnDUm.js","/assets/TimeWheelPicker-Dt1Ak7FK.js","/assets/Tooltip-jVu3--i1.js","/assets/TranslationsEditor-Cv5Tlkby.js","/assets/TrelloAnalytics-BOj2kU9v.js","/assets/TrelloSettings-Op7IrFaN.js","/assets/TrendChart-B-2SrL00.js","/assets/TripleSpeedometer-MfQYenSU.js","/assets/Trudoyomkost-DwW5uYwx.js","/assets/UploadDropzone-CJoW2isQ.js","/assets/UsersActivity-0rM6ESpE.js","/assets/UsersManagement-3NeFdDR6.js","/assets/VerdictBlock-Dup4G86E.js","/assets/VerifixParity-BJu4-BVd.js","/assets/VerifixSettings-CIegWUpe.js","/assets/VerifixSync-C4sKCboU.js","/assets/VfxApiMap-Dl4he5UC.js","/assets/VfxDictionaries-CMcoN-Om.js","/assets/VfxEmployees-DcE-58JK.js","/assets/VfxHrMoves-CxA0kuQ2.js","/assets/VfxJobs-BzQCFJsi.js","/assets/VfxPhoto-BS0g1DMY.js","/assets/VfxShifts-D5mlQ8x1.js","/assets/VfxState-BIJ9Z9tm.js","/assets/VfxTimebooks-BtyModZO.js","/assets/VfxTimesheet-CwVFgDcP.js","/assets/WatchProgress-Bfuyr3nY.js","/assets/WebLogin-Bx99NkBY.js","/assets/WorkersAttendance-Hp21Gw4x.js","/assets/WorkersComposition-Cm61vBvF.js","/assets/WorkersMovements-BY6w2rt0.js","/assets/WorkersPage-Dg8OSqlG.js","/assets/Zagruzka-BV8QAq5A.js","/assets/ZagruzkaCell-CNVwsz_n.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Bf5ZQGLn.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-nwDAC-RD.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Dd0hPLJo.js","/assets/broadcastTree-eutMqCfn.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-CU76IIBL.js","/assets/cellMoveRefusal-CuSp9G45.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BtbzQMx2.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-DT00XOmR.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DVObxG85.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BYcwKjwE.js","/assets/index-CKrbMek7.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-Jpw48MXc.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-quawGnIC.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-CtgTczx5.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CAOQ00uf.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-07YWOrZK.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-k1E5KJyA.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CgJTc1VM.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CQPYZkhb.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DgrW5WjC.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-1YctDfYs.js","/assets/useOpenParam-B180gHjl.js","/assets/useStatusBands-DD4VCu2g.js","/assets/useUrlScope-CL6DBVdQ.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-1BD89oHY.js","/assets/uz_cyrl-tUPHJs1z.js","/assets/vfx-CnjQF_Ja.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-Dz78yuQT.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
