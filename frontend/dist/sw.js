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

const BUILD = "2026-11-20T17:13:59.345Z";
const PRECACHE = ["/","/assets/ActionMenu-BZzu7zrY.js","/assets/AdminPage-CYTq0EXy.js","/assets/AdminTabs-Bos1zBiS.js","/assets/AiKeys-U7P0Gb-t.js","/assets/AnalysisBoard-KLw1pObL.js","/assets/ApiAccess-B2BaU3kc.js","/assets/AppLauncher-lC0QrO83.js","/assets/Arc-N87Mi_KO.js","/assets/Assessment-BhR_GqlU.js","/assets/AssessmentGrade-CX5XdJt7.js","/assets/AssessmentList-CNQ9In94.js","/assets/Assistant-CWGaEWWa.js","/assets/AttendanceCleanup-kh838o91.js","/assets/AttendanceUpload-PevhHJKJ.js","/assets/AuditTable-BC2XdC6B.js","/assets/BrigadirProfile-CmWM1r8N.js","/assets/BrigadirsKpi-BkXgHgCf.js","/assets/Broadcast-XQWX-ekg.js","/assets/BroadcastReceivers-BK_MtL7m.js","/assets/BroadcastRecord-DcScYmvh.js","/assets/Button-Cw9TgpPn.js","/assets/CatLockNotice-BeVvFdXE.js","/assets/CategoryLegendModal-Bum8oZbG.js","/assets/CellConcerns-xcO5qq9s.js","/assets/CellDetails-4uwVG_MD.js","/assets/CellFormModal-BqSrsOKw.js","/assets/CellIdent-B2BZgTE4.js","/assets/CellLink-Cc6sbW1o.js","/assets/Cells-BGy0Iron.js","/assets/ColumnFilter-BDpoxtO3.js","/assets/ColumnsPicker-7HMsaS7L.js","/assets/CommentsModal-Mzlyljoi.js","/assets/ComparisonTable-DbBaJMJE.js","/assets/Concerns-fud7PYAh.js","/assets/ConcernsPieces-xsZxAIxX.js","/assets/ContainerFlow-CLYNzBuk.js","/assets/ContainerTotalsCard-CyhYebEM.js","/assets/Containers-CGoVn7oN.js","/assets/CountStepper--Z3g1gVl.js","/assets/Daily-yrV-A8Ri.js","/assets/DataSources-CMXMwijJ.js","/assets/DataTable-BAHc_C6J.js","/assets/DateRangePicker-CN-hCfh3.js","/assets/DayReportView-BFlueby3.js","/assets/DayStepper-phlPs3ve.js","/assets/DayStrip-CezdWkyB.js","/assets/DbBackup-DV-le714.js","/assets/DifferenceBreakdown-Bx_6cE5t.js","/assets/DocAudit-D6I_f2oi.js","/assets/Downtime-BGEFGtmh.js","/assets/Education-uAT3cjTu.js","/assets/EducationLesson-D0CInrBA.js","/assets/EmptyState-D-j-XogN.js","/assets/Equipment-D9KxnV0T.js","/assets/Exam-Cs_1_03V.js","/assets/ExamAdmin-_FEOGdQr.js","/assets/Factories-DnwuMNra.js","/assets/FactorySelect-D8tFyOEe.js","/assets/Gamification-Cc0CTclE.js","/assets/GroupBadge-DzAT1dbM.js","/assets/HeatmapChart-Bx-VcA1f.js","/assets/HourlyContainers-Bxfl6KQ0.js","/assets/IdleCell-DbBPQTEA.js","/assets/IdleOwners-DOEjt5Bm.js","/assets/IdleSolutions-DevxVar6.js","/assets/KPICard-DNa4DpAA.js","/assets/Kaizen-BDq-zASF.js","/assets/Kelish-CxtNFIzV.js","/assets/Kitchen-CaSWov56.js","/assets/KpiBits-Dm3dlRbP.js","/assets/KpiDeltaCard-C0xVan81.js","/assets/LangContext-kvphpcq0.js","/assets/LangTextInput-yg9bp6AJ.js","/assets/Layout-CgacnhZ3.js","/assets/LeaderAppeal-C8dIJ0rR.js","/assets/LeaderDailyTasks-DE0OU589.js","/assets/LeaderDayReport-BT39Ic0A.js","/assets/LeaderNotCounting-l0Bi-CI6.js","/assets/LeaderTasksAdmin-CKc-GPCu.js","/assets/LeaderUnitReport-C39RNN3g.js","/assets/Leaderboard-DPN3fqeQ.js","/assets/Leaders-B95fMbAQ.js","/assets/LeadersKpi-B60CbDaz.js","/assets/Lightbox-DpkrWtHl.js","/assets/LiveOverview-BsqQLQHU.js","/assets/Login-DO64_9WR.js","/assets/Logs-D3Xdso_Q.js","/assets/LostWorkers-CPflJnew.js","/assets/NotFound-BrS6AL0s.js","/assets/Notifications-BhXLE0QI.js","/assets/NotionTasks-DIGPypJ1.js","/assets/NotionTrackerSettings-DcNqjvls.js","/assets/Ontime-DxpYNigm.js","/assets/OrgChart-eKQeNiJa.js","/assets/Ovens-DaR3BSr0.js","/assets/OvensSettings-BdjUVngg.js","/assets/Overview-DLIS0Fg7.js","/assets/OwnerChip-nxDYkROW.js","/assets/Pagination-kRdTXMQ3.js","/assets/People-lw54zzun.js","/assets/PerenaladkaFactTable-BIAbzOr4.js","/assets/Permissions-BWr4WRtM.js","/assets/PersonCard-BrXFBLHi.js","/assets/PlanFulfillment-CSC8fK4E.js","/assets/Production-FER-vzPu.js","/assets/ProductionUpload-B-dW8tN1.js","/assets/Profile-tgNEccaH.js","/assets/ProfileAvatar-BpflPj3o.js","/assets/ProfilesManagement-DdtTO4wg.js","/assets/ProofCamera-BcNR1nLG.js","/assets/ProofPhoto-DyEG8s0g.js","/assets/Quality-DI2Dv2HJ.js","/assets/RawRows-BW-GeEJ1.js","/assets/Reports-D1e_RclY.js","/assets/RequestStateChip-CkSMcuvZ.js","/assets/RichTextEditor-DlPLWXDx.js","/assets/SaveState-QHtXtaYo.js","/assets/SdPanelSettings-DhmtmScQ.js","/assets/SearchInput-a5vwNo53.js","/assets/SeasonalityHeatmap-Dmv370F9.js","/assets/SegmentedToggle-vCD2mY5H.js","/assets/SetupTimes-CEbmTQVB.js","/assets/ShiftDaily-CccBC4HX.js","/assets/ShiftTimes-DU4yFwIp.js","/assets/SortableList-BFuG9Kci.js","/assets/Staff-CHnJbSoM.js","/assets/StaffListAtCheck-CGw0zV81.js","/assets/StatusBadge-BeoflxZS.js","/assets/StatusBandsModal-B9KC6VMS.js","/assets/TargetGoal-Ddq-6dyM.js","/assets/Targets-zPMWe4yf.js","/assets/TaskFormModal-BfPBmV0Y.js","/assets/TaskerSettings-B3Mh2dDu.js","/assets/Tasks-B6gDYpgN.js","/assets/TgProfile-Dgujmo2D.js","/assets/TimeWheelPicker-o4rQiPyp.js","/assets/Toast-DgFN577d.js","/assets/Tooltip-DMbb0fwb.js","/assets/TranslationsEditor-BVQ9q2LA.js","/assets/TrelloAnalytics-Cx3hA-0v.js","/assets/TrelloSettings-BBK7ypaY.js","/assets/TrendChart-CY_wxRCU.js","/assets/TripleSpeedometer-DpD7Sqpn.js","/assets/Trudoyomkost-CyT88pRM.js","/assets/UploadDropzone-qnTFse6I.js","/assets/UsersActivity-DVBgWlhr.js","/assets/UsersManagement-Z-NfOZup.js","/assets/VerdictBlock-BQMAV8Yt.js","/assets/VerifixPage-CNKGCUkX.js","/assets/VerifixParity-DERotlRq.js","/assets/VfxApiMap-CDwjUTnZ.js","/assets/VfxDictionaries-DpjTSE1g.js","/assets/VfxEmployees-C2qfaWw7.js","/assets/VfxHrMoves-CU8aYXhd.js","/assets/VfxJobs-BAqh66QJ.js","/assets/VfxPhoto-CM39Ui-8.js","/assets/VfxShifts-CdxzBC4v.js","/assets/VfxState-PnV7mThV.js","/assets/VfxTimebooks-Dk_phgiT.js","/assets/VfxTimesheet-DgS7zpwx.js","/assets/WatchProgress-lN_jrX4m.js","/assets/WebLogin-f6K2nii7.js","/assets/WorkersAttendance-URFJ1x55.js","/assets/WorkersComposition-BrQhWwQ6.js","/assets/WorkersMovements-HsGrgSg_.js","/assets/WorkersPage-CbjfOqUF.js","/assets/Zagruzka-C4SJvy1i.js","/assets/ZagruzkaCell-ZuXI2m6f.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CwLDN3_8.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-AhvfY9t2.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BNATvdTG.js","/assets/broadcastTree-A5aPANyZ.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-fAwpmgU_.js","/assets/categories-DK87GJGJ.js","/assets/cellMoveRefusal-C4xLrvNW.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DvNql7Qb.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-q30EaDp0.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-DhbXO8Qu.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BwoAqdtL.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CB1gVjmc.js","/assets/index-CYGTQMTl.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DtNX0QQq.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-C2aIthR4.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-qGN-Bg9a.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CxYdYhV5.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-JKAvfKnM.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BBWbrQkr.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CaGLXA6v.js","/assets/ru-Cid514wI.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-8ulk74dc.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CH8lC_Nz.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CL1ohaqm.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-COpznnRq.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-kduw1c_B.js","/assets/useMutation-i9qHEKfc.js","/assets/useOpenParam-BpZ5mvb2.js","/assets/useStatusBands-eupxbZ-0.js","/assets/useUrlScope-BisE9CkB.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-B-zpQHgs.js","/assets/uz_cyrl-DLk_qxCc.js","/assets/vfx-XswWij1W.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-DYLm1P6v.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/x-CfYkDDdF.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
