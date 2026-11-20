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

const BUILD = "2026-11-20T13:24:04.025Z";
const PRECACHE = ["/","/assets/ActionMenu-DIjho2bj.js","/assets/AdminPage-3RDt-IE4.js","/assets/AdminTabs-BVyZPZPw.js","/assets/AiKeys-DfxpnmGi.js","/assets/AnalysisBoard-CXi40AuT.js","/assets/ApiAccess-Du_EDYnO.js","/assets/AppLauncher-BSMoyaCz.js","/assets/Arc-B-sORq4b.js","/assets/Assessment-C9jq6nLx.js","/assets/AssessmentGrade-BGTaUSHX.js","/assets/AssessmentList-LqtG4USo.js","/assets/Assistant-C_g1_av0.js","/assets/AttendanceCleanup-BP32ieyG.js","/assets/AttendanceUpload-CMHzxqoE.js","/assets/AuditTable-f0H-4RGL.js","/assets/BrigadirProfile-Bp2kawdb.js","/assets/BrigadirsKpi-D940eAAH.js","/assets/Broadcast-BxS3pRo5.js","/assets/BroadcastReceivers-DupJzU4j.js","/assets/BroadcastRecord-BDF918KK.js","/assets/Button-BByRB7Le.js","/assets/CatLockNotice-yt18kxaw.js","/assets/CategoryLegendModal-D0Omunza.js","/assets/CellConcerns-h9b2QjHa.js","/assets/CellDetails-DEGMcXMd.js","/assets/CellFormModal-A8BsRapk.js","/assets/CellIdent-DE6qkdqd.js","/assets/CellLink-vXtrRu6z.js","/assets/Cells-Cc3aI_xj.js","/assets/ColumnFilter-5HG5cZXx.js","/assets/ColumnsPicker-DFYl8o-4.js","/assets/CommentsModal-ByrbWGt_.js","/assets/ComparisonTable-DjFZct8C.js","/assets/Concerns-CkWreV2f.js","/assets/ConcernsPieces-DFpPtzXR.js","/assets/ContainerFlow-B4V6fUZ8.js","/assets/ContainerTotalsCard-nvT64Ndm.js","/assets/Containers-B36OBk6J.js","/assets/CountStepper-BSPHSL0N.js","/assets/Daily-BZgDPmhO.js","/assets/DataSources-BpZkcgwK.js","/assets/DataTable-DoPrAb70.js","/assets/DateRangePicker-CyTBlC6a.js","/assets/DayReportView-DWd5mRZK.js","/assets/DayStepper-CCWq_e1-.js","/assets/DayStrip-Cvf-fDdh.js","/assets/DbBackup-Bwy1v5sA.js","/assets/DifferenceBreakdown-CjzVrLBi.js","/assets/DocAudit-CEK9Yu-z.js","/assets/Downtime-Bu_IwPCy.js","/assets/Education-B0COyBm6.js","/assets/EducationLesson-CcBRKjQh.js","/assets/EmptyState-xBEHNCTD.js","/assets/Equipment-DyPNGFt2.js","/assets/Exam-Bsw79dRX.js","/assets/ExamAdmin-rTaCmtlj.js","/assets/Factories-ZeAsIKoJ.js","/assets/FactorySelect-C2K08QxA.js","/assets/Gamification-C02b3-BF.js","/assets/GroupBadge-D45UA4Uo.js","/assets/HeatmapChart-DC5JLTjG.js","/assets/HourlyContainers-C-ZUofrz.js","/assets/IdleCell-BUJG27qq.js","/assets/IdleOwners-CYzGSmE2.js","/assets/IdleSolutions-uIhXcPnL.js","/assets/KPICard-Cw5WW5n_.js","/assets/Kaizen-gKix3Eh7.js","/assets/Kelish-UFy4qnjz.js","/assets/Kitchen-C2qm3b40.js","/assets/KpiBits-Cpjs1sBl.js","/assets/KpiDeltaCard-iuIEJt3T.js","/assets/LangContext-2A4sPKlL.js","/assets/LangTextInput-Kofaohjz.js","/assets/Layout-BMnlD7EY.js","/assets/LeaderAppeal-CDM9UwTU.js","/assets/LeaderDailyTasks-DBCXp3YJ.js","/assets/LeaderDayReport-BIOBDg-n.js","/assets/LeaderNotCounting-DqvltIp0.js","/assets/LeaderTasksAdmin-iGWePZMQ.js","/assets/LeaderUnitReport-D3Ay0Q4P.js","/assets/Leaderboard-Cww1fGSV.js","/assets/Leaders-COhVarY6.js","/assets/LeadersKpi-B9t7cnmB.js","/assets/Lightbox--W_XKy1M.js","/assets/LiveOverview-C39vZqZ1.js","/assets/Login-DEhGt9W6.js","/assets/Logs-vNncyhFm.js","/assets/LostWorkers-BMs8dH0G.js","/assets/Meter-CRRHrYuq.js","/assets/NotFound-i5olZrMB.js","/assets/Notifications-D3jt9B1Z.js","/assets/NotionTasks-CIUEJOSk.js","/assets/NotionTrackerSettings-BB7Fx6ks.js","/assets/Ontime-BdRNDHK9.js","/assets/OrgChart-DQ5SHTLC.js","/assets/Ovens-CDMlo_dX.js","/assets/OvensSettings-CJJ7-uej.js","/assets/Overview-hNkC4aM9.js","/assets/OwnerChip-BfTG6mDJ.js","/assets/Pagination-8expXDnI.js","/assets/People-D_wmOSGm.js","/assets/PerenaladkaFactTable-Dy7SebhN.js","/assets/Permissions-CAP7flnW.js","/assets/PersonCard-B9j-VeUt.js","/assets/PlanFulfillment-Mong6DHK.js","/assets/Production-DHkBaaKi.js","/assets/ProductionUpload-iQcMcrRa.js","/assets/Profile-Bf_jbMAA.js","/assets/ProfileAvatar-KzIewN7D.js","/assets/ProfilesManagement-DbKruKp3.js","/assets/ProofCamera-EJB94PWo.js","/assets/ProofPhoto-Dtgw82Ug.js","/assets/Quality-u6sVue3H.js","/assets/RawRows-CQJ5JMHm.js","/assets/Reports-f19kSy1L.js","/assets/RequestStateChip-DqkvNysk.js","/assets/RichTextEditor-BgHHEzd4.js","/assets/SaveState-DrYtDoCx.js","/assets/SdPanelSettings-DNvxpw4k.js","/assets/SearchInput-CY3QkGx1.js","/assets/SeasonalityHeatmap-B65j5wfW.js","/assets/SegmentedToggle-CIxWlaZZ.js","/assets/SetupTimes-gipJcns7.js","/assets/ShiftDaily-1Qy6V1U_.js","/assets/ShiftTimes-D-YqIC9y.js","/assets/SortableList-DgrUPWKx.js","/assets/Staff-RYJ-iM8N.js","/assets/StaffListAtCheck-BqX-XqHK.js","/assets/StatusBadge-DLdSpj7T.js","/assets/StatusBandsModal-C42djghN.js","/assets/TargetGoal-DjFNiIBr.js","/assets/Targets-BgeTIgZP.js","/assets/TaskFormModal-DV5T0mCQ.js","/assets/TaskerSettings-B_boeE1E.js","/assets/Tasks-BSSabbBb.js","/assets/TgProfile-DK3oxl2o.js","/assets/TimeWheelPicker-8jMs8gAy.js","/assets/Toast-DLkPq-u6.js","/assets/Tooltip-Cd0j8XOq.js","/assets/TranslationsEditor-DDaR8xJW.js","/assets/TrelloAnalytics-CRN_wcHR.js","/assets/TrelloSettings-MYZFV1De.js","/assets/TrendChart-BM0E5t5o.js","/assets/TripleSpeedometer-DZylZWsx.js","/assets/Trudoyomkost-CWkiCdlo.js","/assets/UploadDropzone-Ckl6lJR3.js","/assets/UsersActivity-DdmO2NIs.js","/assets/UsersManagement-BgrLZDrM.js","/assets/VerdictBlock-CAF0gLAS.js","/assets/VerifixPage-CwuxFbD5.js","/assets/VerifixParity-CPhY6VZC.js","/assets/VfxApiMap-DA6YJ6KN.js","/assets/VfxDictionaries-IrjnhwGJ.js","/assets/VfxEmployees-ulCoRHHU.js","/assets/VfxHrMoves-CenKDXHq.js","/assets/VfxJobs-DJyVnoJr.js","/assets/VfxPhoto-DVhuRgSN.js","/assets/VfxShifts-BVe_ZM8t.js","/assets/VfxState-BxaoOWJc.js","/assets/VfxTimebooks-Bd9VtnVf.js","/assets/VfxTimesheet-CD0k7pew.js","/assets/WatchProgress-B6Chz459.js","/assets/WebLogin-BuE2C4pk.js","/assets/WorkersAttendance-D5NCAvqg.js","/assets/WorkersComposition-BtGAXbQX.js","/assets/WorkersMovements-D9Yy9nwX.js","/assets/WorkersPage-CaX9HUX1.js","/assets/Zagruzka-Z6OBeBPU.js","/assets/ZagruzkaCell-Dcdeh6eb.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DIfUYQB0.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-DYEy9Xc8.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Bf7hgPv8.js","/assets/broadcastTree-CE_1vx5-.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-Cnmz91EG.js","/assets/categories-C_FVPM-F.js","/assets/cellMoveRefusal-C7qpgcQp.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-D9oODJUC.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-CFVS5vIz.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-BBDf_Y8I.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BH54YsjB.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CUkl9lbN.js","/assets/index-D9__53Y7.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-ChcHf1HT.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-kXDrFBdc.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CaZl1ktg.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CUBVn8lY.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-7ddc_gLH.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-B2MlxeXZ.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-BgY_pK6M.js","/assets/ru-B0rYmTCM.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-XmLLo5Ri.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-B_uv9EC3.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-ChfDr16y.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Dm1NpQCE.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-CyKvpTRY.js","/assets/useMutation-BTB_AKO6.js","/assets/useOpenParam-DJveTFYe.js","/assets/useStatusBands-CEZ5RyKK.js","/assets/useUrlScope-BqeBdSWU.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DVI80f3o.js","/assets/uz_cyrl-DO3wZcY4.js","/assets/vfx-fOvsXKwD.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-kxYiyMaY.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/x-CfYkDDdF.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
