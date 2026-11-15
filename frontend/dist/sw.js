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

const BUILD = "2026-11-15T16:46:24.569Z";
const PRECACHE = ["/","/assets/ActionHistory-D68O7Yvz.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-69FEiQTJ.js","/assets/AiKeys-z4Igr9pB.js","/assets/AnalysisBoard-Dn2DC9Er.js","/assets/ApiAccess-DWXIdj1k.js","/assets/AppLauncher-BtTnumG4.js","/assets/Arc-DpN84mQK.js","/assets/Assessment-Bir53jPD.js","/assets/AssessmentGrade-_rGxdzAA.js","/assets/AssessmentList-CkWxFOAe.js","/assets/Assistant-BFqFtjcM.js","/assets/AttendanceCleanup-CNX8GbBB.js","/assets/AttendanceUpload-CSX7-Rpj.js","/assets/AuditTable-DHQfbO-o.js","/assets/BrigadirProfile-zcw_P2tf.js","/assets/BrigadirsKpi-CMr7VSKx.js","/assets/Broadcast-CiJUsT8S.js","/assets/BroadcastReceivers-CARdMDji.js","/assets/BroadcastRecord-4liYiDOr.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-D9kmEQci.js","/assets/CategoryLegendModal-BqaG6Lgr.js","/assets/CellConcerns-B428qmHq.js","/assets/CellDetails-DFfWjR3n.js","/assets/CellFormModal-ptNBmQ9M.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-BDgnae4H.js","/assets/Cells-BHcwy8Rg.js","/assets/ColumnFilter-CSf-xx0l.js","/assets/ColumnsPicker-hkLAIf1L.js","/assets/CommentsModal-CUFO7kvi.js","/assets/ComparisonTable-CHMjsemP.js","/assets/Concerns-CkdmxqU9.js","/assets/ConcernsPieces-Ckv1mdUS.js","/assets/ContainerFlow-BwuLeFsE.js","/assets/ContainerTotalsCard-CjhCsjjj.js","/assets/Containers-BFCtR9Sa.js","/assets/CountStepper-BBv1mJK4.js","/assets/Daily-p2dZdWXH.js","/assets/DataSources-DfGMthNz.js","/assets/DataTable-CLklZtag.js","/assets/DateRangePicker-BUcqGVRd.js","/assets/DayReportView-BFQxWpN6.js","/assets/DayStepper-CUIMeAL2.js","/assets/DayStrip-BFl8Vc3B.js","/assets/DbBackup-tK_y3qAe.js","/assets/DifferenceBreakdown-C94LlQWE.js","/assets/DocAudit-DnIj-iOa.js","/assets/Downtime-tMCR0N33.js","/assets/Education-CHtyPwjM.js","/assets/EducationLesson-DF6HX9G5.js","/assets/EmptyState-BzOZAeuD.js","/assets/Exam-BQevRpyV.js","/assets/ExamAdmin-DuFZtoiF.js","/assets/Factories-D9-pjnI6.js","/assets/FactorySelect-D4fN2r-H.js","/assets/Gamification-BAmOdBTA.js","/assets/GroupBadge-BhhRa2rn.js","/assets/HeatmapChart-BsqTnZrV.js","/assets/HourlyContainers-CSYS-Xq0.js","/assets/IdleCell-B8dSDYSq.js","/assets/IdleOwners-Bjjk7T2H.js","/assets/IdleSolutions-_V9ERCfo.js","/assets/IdleSource-Dzd7eFWN.js","/assets/KPICard-CSxcD0UR.js","/assets/Kaizen-CuWR2g6F.js","/assets/Kelish-CM9spWxn.js","/assets/Kitchen-CEl2Vkjb.js","/assets/KpiBits-Ck8g1T7t.js","/assets/KpiDeltaCard-C8ZEVruc.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-ruGA3bKP.js","/assets/LeaderAppeal-CB0w2V9L.js","/assets/LeaderCutoffs-DjWMYQ0d.js","/assets/LeaderDailyTasks-BoC_gCtq.js","/assets/LeaderDayExclusions-CUUS44Uh.js","/assets/LeaderDayReport-DRptZUFg.js","/assets/LeaderTasksAdmin-CTwq6Idx.js","/assets/LeaderUnitReport-BxdrwB9Y.js","/assets/Leaderboard-C0kJbvTt.js","/assets/Leaders-Cque-O_H.js","/assets/LeadersKpi-CnFpYaYj.js","/assets/Lightbox-CxaYDXT2.js","/assets/LiveOverview-BvuF91Nt.js","/assets/Login-BPSQor-K.js","/assets/Logs-DRfrqKGd.js","/assets/LostWorkers-BdfnsxUe.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-CqCJJwxM.js","/assets/Notifications-DNZBwtY-.js","/assets/NotionTasks-BDWNME6-.js","/assets/NotionTrackerSettings-CCn416Ju.js","/assets/Ontime-ChC-OO_2.js","/assets/OrgChart-Cy3ktdfq.js","/assets/Ovens-CFpsBfmM.js","/assets/OvensSettings-ChOmNUh9.js","/assets/Overview-DaXJkl9p.js","/assets/OwnerChip-BVDhTc_C.js","/assets/PageAccess-Dak1U7om.js","/assets/Pagination-yWGrASex.js","/assets/People-C5oo59su.js","/assets/PerenaladkaFactTable-CsxT3ZQr.js","/assets/Permissions-DbcHE0r7.js","/assets/PersonCard-C_qlsiqu.js","/assets/PlanFulfillment-e2b49Cif.js","/assets/Production-DueLit7n.js","/assets/ProductionUpload-DtSSOAce.js","/assets/Profile-bS5cTTfI.js","/assets/ProfileAvatar-DpMsbY2c.js","/assets/ProfilesManagement-BFJlT5Nx.js","/assets/ProofCamera-CLkSrwFm.js","/assets/ProofPhoto-hyQw_3TO.js","/assets/Quality-gZoBL1vf.js","/assets/RawRows-CRVFuNRb.js","/assets/Reports-B1cg2EVM.js","/assets/RequestStateChip-DunmEe1q.js","/assets/RichTextEditor-DFfWagN4.js","/assets/SaveState-C2AplD95.js","/assets/SearchInput-C8lWjGvo.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-CHcMbzlV.js","/assets/ShiftDaily-YYnP6iNa.js","/assets/ShiftTimes-CJtPnMjv.js","/assets/SortableList-DCEDbyLr.js","/assets/Staff-BokE20D_.js","/assets/StaffListAtCheck-DcEnSwNT.js","/assets/StatusBadge-CDqgpoGq.js","/assets/StatusBandsModal-CxZrnoxF.js","/assets/TargetGoal-Cf0mvHaz.js","/assets/Targets-DXEYknL6.js","/assets/TaskFormModal-Dggu4Z73.js","/assets/TaskerSettings-DRk9Z9VW.js","/assets/Tasks-DJlBfJVL.js","/assets/TgProfile-B3t1NWVJ.js","/assets/TimeWheelPicker--2y_jqn4.js","/assets/Tooltip-D446IxSO.js","/assets/TranslationsEditor-XKGEAu-l.js","/assets/TrelloAnalytics-Ch1AP-1L.js","/assets/TrelloSettings-BLSVcHhs.js","/assets/TrendChart-DbxnlS5H.js","/assets/TripleSpeedometer-DU6RS3hA.js","/assets/Trudoyomkost-CH6rrifV.js","/assets/UploadDropzone-CN9_jsg4.js","/assets/UsersActivity-DxzYYEr7.js","/assets/UsersManagement-C0H3R9Cg.js","/assets/VerdictBlock-NLNAxubi.js","/assets/VerifixParity-DeajlBp_.js","/assets/VerifixSettings-BZGhNVbN.js","/assets/VerifixSync-BbroRhKG.js","/assets/VfxApiMap-DENMnbY4.js","/assets/VfxDictionaries-Cn9f_w4X.js","/assets/VfxEmployees-BRF_GTJJ.js","/assets/VfxHrMoves-wm8dJB90.js","/assets/VfxJobs-un0m3mNv.js","/assets/VfxPhoto-PBF6dihR.js","/assets/VfxShifts-D6bZlwuO.js","/assets/VfxState-B7VagfYg.js","/assets/VfxTimebooks-5lN5yoQv.js","/assets/VfxTimesheet-DqLlxkai.js","/assets/WatchProgress-g0uBZgTP.js","/assets/WebLogin-DeZzXPgr.js","/assets/WorkersAttendance-DnzYedzw.js","/assets/WorkersComposition-CLaOMyzM.js","/assets/WorkersMovements-t-r_K0x8.js","/assets/WorkersPage-BJ6Z9Fbp.js","/assets/Zagruzka--KtxW4nq.js","/assets/ZagruzkaCell-B1jHZIf1.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BqkbKz1H.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-Djweh0PO.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-D1yrWx11.js","/assets/broadcastTree-BbqXW43X.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-B6vtb9bc.js","/assets/cellMoveRefusal-D25IAGwh.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-0xGelCAh.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-RySUnmUf.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-Db-Nh8no.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BuZMTADg.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-B1w2JTpL.js","/assets/index-BJbfsntd.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BNiRPt7Z.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DsCGOfPi.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-BtQl3Cvp.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-8VHNz7eS.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-B5DK-nhV.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-C0-OsWwR.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CdPipex2.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/triangle-alert-CnUaq82N.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CTu4MItV.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DvAPV0RO.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-Ut5DRlf0.js","/assets/useOpenParam-DIGaPpkt.js","/assets/useStatusBands-DLQBar-t.js","/assets/useUrlScope-Cm8LUWqy.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DwwlhPXs.js","/assets/uz_cyrl-B7G9UCfw.js","/assets/vfx-Ex39ZU8p.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-jMDpli4I.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
