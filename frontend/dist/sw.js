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

const BUILD = "2026-11-24T15:33:10.548Z";
const PRECACHE = ["/","/assets/AdminPage-BoFUhpFz.js","/assets/AdminTabs-PpAFwFXc.js","/assets/AiKeys-D8QW5Uq-.js","/assets/AnalysisBoard-dOC_Vi45.js","/assets/ApiAccess-C5MHGcNi.js","/assets/AppLauncher-CeBmnRLR.js","/assets/Arc-DpCQX3ux.js","/assets/Assessment-CybGCHWW.js","/assets/AssessmentGrade-B9FXQho8.js","/assets/AssessmentList-CVdPcs-m.js","/assets/Assistant-Dx50RLEm.js","/assets/AttendanceCleanup-BCRZ-6XZ.js","/assets/AttendanceUpload-dfBKFgMA.js","/assets/AuditTable-CNHFms3Y.js","/assets/Audits-DMsJb9t9.js","/assets/BolimsModal-By2aRZ1s.js","/assets/BrigadirProfile-BCYlhcxL.js","/assets/BrigadirsKpi-BQ9aYXOV.js","/assets/Broadcast-BooS7zcv.js","/assets/BroadcastReceivers-DZwDvRSE.js","/assets/BroadcastRecord-3hDq8vLQ.js","/assets/CatLockNotice-D0UC7KdM.js","/assets/CategoryLegendModal-Bl1H-QK6.js","/assets/CellConcerns-BhDXu9x9.js","/assets/CellDetails-CX2vko1X.js","/assets/CellFormModal-lWbfsy8K.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-BMYGd858.js","/assets/Cells-CUmvaJqJ.js","/assets/ColumnFilter-CojgyXFa.js","/assets/ColumnsPicker-DhgKTocx.js","/assets/CommentsModal-2XePmgGk.js","/assets/ComparisonTable-D-LK-rQn.js","/assets/Concerns-BvVEWYDL.js","/assets/ConcernsPieces-ZXVS02d_.js","/assets/ContainerBolims-DKeDcPny.js","/assets/ContainerFlow-Cx1P5G16.js","/assets/ContainerTotalsCard-DM6qdEed.js","/assets/Containers-BzBn2o7Z.js","/assets/CountStepper-BSjYm_dE.js","/assets/Daily-D8O2eFxG.js","/assets/DataSources-CDxF_dMP.js","/assets/DataTable-CqxunEb1.js","/assets/DateRangePicker-GKEV66uj.js","/assets/DayReportView-CxhaqvLp.js","/assets/DayStepper-PJEGCeBG.js","/assets/DayStrip-DvZXAhD1.js","/assets/DbBackup-3NfQr_E_.js","/assets/DifferenceBreakdown-BXPF5my3.js","/assets/DocAudit-0_PXgvqU.js","/assets/Downtime-D9IDwUM4.js","/assets/Education-DnBaoqyL.js","/assets/EducationLesson-KOROzN0P.js","/assets/EmptyState-BOoUTvEJ.js","/assets/Equipment-B-k2O0iC.js","/assets/Exam-PFrIEwin.js","/assets/ExamAdmin-CDIoZ73R.js","/assets/Factories-CFEd6dHC.js","/assets/FactorySelect-B5iueLPy.js","/assets/Gamification-CvbwiWtG.js","/assets/GroupBadge-CEXKMdXT.js","/assets/HeatmapChart-aVqdsAw5.js","/assets/HourlyContainers-Ceu1U6xo.js","/assets/IdleCell-DuVS0Zso.js","/assets/IdleOwners-B9LDfDUt.js","/assets/IdleSolutions-DdG3u1mh.js","/assets/KPICard-qAHpX9zB.js","/assets/Kaizen-C3i-BCnR.js","/assets/Kelish-BqezCEuP.js","/assets/Kitchen-tuUa-eTq.js","/assets/KpiBits-lQXpJmkx.js","/assets/KpiDeltaCard-D-psKgd9.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-DZrWURB_.js","/assets/LeaderAppeal-0wUqv1BU.js","/assets/LeaderDailyTasks-C3PkV8W6.js","/assets/LeaderDayReport-CqkbVvgL.js","/assets/LeaderNotCounting-B1PYPzPg.js","/assets/LeaderTasksAdmin-Ks7csN0Q.js","/assets/LeaderUnitReport-DfTv_b3r.js","/assets/Leaderboard-DxWZzPxY.js","/assets/Leaders-B6U3i02R.js","/assets/LeadersKpi-Cnd_tBVY.js","/assets/Lightbox-Ce0l2ZcH.js","/assets/LiveOverview-tGXH88EZ.js","/assets/Login-Lp4EMhC5.js","/assets/Logs-CRcPIXQJ.js","/assets/LostWorkers-bIj5emOE.js","/assets/NotFound-C5WRt-X-.js","/assets/Notifications-oM8gKyd-.js","/assets/NotionTasks-l77_udYO.js","/assets/NotionTrackerSettings-BVEWl5J4.js","/assets/Ontime-DGR-eioa.js","/assets/OrgChart-CHHA5wEF.js","/assets/Ovens-BxJKwf0Z.js","/assets/OvensSettings-DhnczhTV.js","/assets/Overview-B1zLqn3_.js","/assets/OwnerChip-Da38WMBx.js","/assets/Pagination-DQxsYhd_.js","/assets/People-Q-p4wVXx.js","/assets/PerenaladkaFactTable-BVwfa4dd.js","/assets/Permissions-D4V_MQcv.js","/assets/PersonCard-BPHxp_wm.js","/assets/PlanFulfillment-B1WOoSxs.js","/assets/Production-BVwif42Q.js","/assets/ProductionUpload-B0IE-nUs.js","/assets/Profile-DyzPsN3_.js","/assets/ProfileAvatar-BmNOBSrJ.js","/assets/ProfilesManagement-DZU23jOQ.js","/assets/ProofCamera-DYtwxEyt.js","/assets/ProofPhoto-CgUIlfvY.js","/assets/Quality-BKSMGn4f.js","/assets/RawRows-DSMV2BNt.js","/assets/Reports-BlTvqOQk.js","/assets/RequestStateChip-BAkZxnGd.js","/assets/RichTextEditor-DCMCGykR.js","/assets/SaveState-CRNSUPT1.js","/assets/SdPanelSettings-BtUn2x6P.js","/assets/SearchInput-BDc6MA1E.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-CTmXWuVp.js","/assets/ShiftDaily-DmoiDkNK.js","/assets/ShiftTimes-zLBwqKiY.js","/assets/SkuHistory-BdzYdBn_.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-DLx00S7D.js","/assets/StaffListAtCheck-DQoFSGOT.js","/assets/StatusBadge-CavrbEr5.js","/assets/StatusBandsModal-CQ_E0yIN.js","/assets/TargetGoal-CSXx6rnP.js","/assets/Targets-DdPKwMyl.js","/assets/TaskFormModal-BOHvXSsT.js","/assets/TaskerSettings-CXopDQYT.js","/assets/Tasks-8I-xagvY.js","/assets/TgProfile-CyerWz9m.js","/assets/TimeWheelPicker-DmeeM0DJ.js","/assets/Tooltip-CJoGo6PX.js","/assets/TranslationsEditor-BsPa93TF.js","/assets/TrelloAnalytics-BquYra2N.js","/assets/TrelloSettings-CqMnNsSp.js","/assets/TrendChart-BnPT_WUK.js","/assets/TripleSpeedometer-D0ROrTUc.js","/assets/Trudoyomkost-BQeRgc28.js","/assets/UploadDropzone-trP5felj.js","/assets/UsersActivity-C5CyDf5D.js","/assets/UsersManagement-C3MkLWnZ.js","/assets/VerifixPage-C-3ZznDe.js","/assets/VerifixParity-C46wZRmB.js","/assets/VfxApiMap-B2fP3LC1.js","/assets/VfxDictionaries-VaMTT_FC.js","/assets/VfxEmployees-CHZAt7uW.js","/assets/VfxHrMoves-Dvo4PQHk.js","/assets/VfxJobs-jXIX3fR3.js","/assets/VfxPhoto-BAn2NwdC.js","/assets/VfxShifts-DS07qR7L.js","/assets/VfxState-0CpQhRSd.js","/assets/VfxTimebooks-Bcpyur-Z.js","/assets/VfxTimesheet-CXAh8Cww.js","/assets/WatchProgress-DpwoY8EH.js","/assets/WebLogin-ByLnConG.js","/assets/WorkersAttendance-BgFlrbjI.js","/assets/WorkersComposition-rdnc9R3h.js","/assets/WorkersMovements-DvMOoHOP.js","/assets/WorkersPage-12t1lUO8.js","/assets/Zagruzka-CqtX0FdB.js","/assets/ZagruzkaCell-CupkrPuK.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-D6d8KvhK.js","/assets/api-D_IoyhCc.js","/assets/appealTask-CIVoZ194.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BIgBnYUa.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BWeT-VMi.js","/assets/broadcastTree-tDuM2vB-.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-DJZcYVOY.js","/assets/categories-qRIHuNGV.js","/assets/cellMoveRefusal-CShKho_p.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-bBeGIcGT.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-CrQRnHYW.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-D69ARV5r.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-5Mfzge_S.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-C51umuDl.js","/assets/index-Df3g8Dme.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DsXYHkP5.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/marks-CFIV4iia.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-DcDvxvgQ.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DFhgDANK.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-DGhQ38bs.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BgsSpB-I.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DBIJxhyx.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BuMBqsev.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-BB3QGy6C.js","/assets/useMutation-CDdVBlfZ.js","/assets/useOpenParam-lle5Mya3.js","/assets/useStatusBands-BguPF4BR.js","/assets/useUrlScope-BDJ8n1nl.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-rMPN9hqg.js","/assets/uz_cyrl-CYhVcHmH.js","/assets/vfx-C0QZvb9T.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-DOJM_xEo.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
