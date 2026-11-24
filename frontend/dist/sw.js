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

const BUILD = "2026-11-24T06:42:40.355Z";
const PRECACHE = ["/","/assets/AdminPage-BolR-2c_.js","/assets/AdminTabs-CswGXrZI.js","/assets/AiKeys-BI1pz3DK.js","/assets/AnalysisBoard-CWfQmGk-.js","/assets/ApiAccess-8CyPP6So.js","/assets/AppLauncher-DepCX8aH.js","/assets/Arc-C6rnGcTa.js","/assets/Assessment-A0wNj88G.js","/assets/AssessmentGrade-Bhxa0lup.js","/assets/AssessmentList-D33_TSK1.js","/assets/Assistant-CJTkCCgH.js","/assets/AttendanceCleanup-CVHZd6bJ.js","/assets/AttendanceUpload-Dmc3oBFp.js","/assets/AuditTable-CCqgUMwQ.js","/assets/Audits-V6Qy9Obw.js","/assets/BolimsModal-DVzG7D8m.js","/assets/BrigadirProfile-CGDNDixL.js","/assets/BrigadirsKpi-Dx3to7jD.js","/assets/Broadcast-CEbKgnyi.js","/assets/BroadcastReceivers-n7veil2i.js","/assets/BroadcastRecord-Coe1jmxz.js","/assets/CatLockNotice-B7DdmKbb.js","/assets/CategoryLegendModal--eiKJh5O.js","/assets/CellConcerns-CUQPoJgG.js","/assets/CellDetails-C8j-RiUi.js","/assets/CellFormModal-BRnO8fGc.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-hg9l-V69.js","/assets/Cells-Ywi7HuOt.js","/assets/ColumnFilter-BeiPuZnT.js","/assets/ColumnsPicker-gqWXTi6Y.js","/assets/CommentsModal-FD7RSQLN.js","/assets/ComparisonTable-CKk5A5iP.js","/assets/Concerns-Di_ZcVOl.js","/assets/ConcernsPieces-AqlhmWCD.js","/assets/ContainerBolims-9IXS4xFI.js","/assets/ContainerFlow-Df_u3Wf3.js","/assets/ContainerTotalsCard-BgXe0PFd.js","/assets/Containers-BOzw7vsb.js","/assets/CountStepper-ZT_dkt2c.js","/assets/Daily-DpkckOZj.js","/assets/DataSources-jDY2F4vc.js","/assets/DataTable-_yL-mMpu.js","/assets/DateRangePicker-BfRG4rpG.js","/assets/DayReportView-Ch8pO9Lp.js","/assets/DayStepper-DngnhIIJ.js","/assets/DayStrip-DYXOi49g.js","/assets/DbBackup-CEN5U2jT.js","/assets/DifferenceBreakdown-4Ibt82a6.js","/assets/DocAudit-BLMYQ_BB.js","/assets/Downtime-BCLzEa0B.js","/assets/Education-Dc_uZkrB.js","/assets/EducationLesson-D649k6tO.js","/assets/EmptyState-K_4OTSzL.js","/assets/Equipment-XUgFVpux.js","/assets/Exam-CF_SY4d0.js","/assets/ExamAdmin-DIdaGxXG.js","/assets/Factories-LTRbV7DX.js","/assets/FactorySelect-Cy4Rzaff.js","/assets/Gamification-Cgc7ST0a.js","/assets/GroupBadge-Bti7MKR6.js","/assets/HeatmapChart-wfIUFNUz.js","/assets/HourlyContainers-DJNrMSJ_.js","/assets/IdleCell-hlGdJZMq.js","/assets/IdleOwners-Cbn2XhiW.js","/assets/IdleSolutions-B5gX32j4.js","/assets/KPICard-DnDuMYK-.js","/assets/Kaizen-Dju4zqG9.js","/assets/Kelish-BbhZoGkX.js","/assets/Kitchen-BL98MSm6.js","/assets/KpiBits-9D6O2HCG.js","/assets/KpiDeltaCard-B5gmmqCV.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-Br2Nq1g9.js","/assets/LeaderAppeal-BYPQBnwH.js","/assets/LeaderDailyTasks-JpHbYzs5.js","/assets/LeaderDayReport-CYr1SRVJ.js","/assets/LeaderNotCounting-JM0jI00V.js","/assets/LeaderTasksAdmin-CxGrPDqv.js","/assets/LeaderUnitReport-GqtOLRx4.js","/assets/Leaderboard-BPSfVZIR.js","/assets/Leaders-PD9X9LK9.js","/assets/LeadersKpi-L5NS93Ox.js","/assets/Lightbox-C42gR4pQ.js","/assets/LiveOverview-8pAn0_f8.js","/assets/Login-BTZv1XCw.js","/assets/Logs-CGyR1LQk.js","/assets/LostWorkers-DIyVBum3.js","/assets/NotFound-BF8BuG1g.js","/assets/Notifications-CWspc2Xa.js","/assets/NotionTasks-DUEd7C1D.js","/assets/NotionTrackerSettings-DKEINB_T.js","/assets/Ontime-C1wrrGTA.js","/assets/OrgChart-DJQ6GZvS.js","/assets/Ovens-Nubup1Mq.js","/assets/OvensSettings-ggGyuK8e.js","/assets/Overview-BDfFPV1o.js","/assets/OwnerChip-CAip0OO-.js","/assets/Pagination-WxWpU6qn.js","/assets/People-CIQNARV0.js","/assets/PerenaladkaFactTable-Btj9gjjI.js","/assets/Permissions-Dvh4KmE5.js","/assets/PersonCard-CmArPhyZ.js","/assets/PlanFulfillment-DN5edcj_.js","/assets/Production-D_Fcb8kt.js","/assets/ProductionUpload-DRzQge5R.js","/assets/Profile-DH60zQFO.js","/assets/ProfileAvatar-DBbn_bcA.js","/assets/ProfilesManagement-D2DNftb6.js","/assets/ProofCamera-Db5gPflT.js","/assets/ProofPhoto-DQNhft7g.js","/assets/Quality-o-0AXVQV.js","/assets/RawRows-DntA3Drb.js","/assets/Reports-BmrqQDLu.js","/assets/RequestStateChip-DKv9-MZo.js","/assets/RichTextEditor-b8lS-mIr.js","/assets/SaveState-CSyTqGe8.js","/assets/SdPanelSettings-xbJaODqc.js","/assets/SearchInput-B1toh34z.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-BV44M8g-.js","/assets/ShiftDaily-DDAUjcTJ.js","/assets/ShiftTimes-D50D66wb.js","/assets/SkuHistory-DDW0bSn4.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-BJlFTrPN.js","/assets/StaffListAtCheck-9zIdmeHc.js","/assets/StatusBadge-BfeWkojt.js","/assets/StatusBandsModal-C5MAUe3z.js","/assets/TargetGoal-BdP-C5fl.js","/assets/Targets-70KG9vBu.js","/assets/TaskFormModal-C4t7qae9.js","/assets/TaskerSettings-DRB4os4p.js","/assets/Tasks-DaeezSgU.js","/assets/TgProfile-CGG1YXz8.js","/assets/TimeWheelPicker-KgnAZZKL.js","/assets/Tooltip-0SNIoQ_c.js","/assets/TranslationsEditor-D4VLnhTg.js","/assets/TrelloAnalytics-DBoOceeo.js","/assets/TrelloSettings-DjdMDTEe.js","/assets/TrendChart-D758Dca3.js","/assets/TripleSpeedometer-Cf7et7kF.js","/assets/Trudoyomkost-C_UgOpx6.js","/assets/UploadDropzone-CJ5n6fVJ.js","/assets/UsersActivity-CvbeM3-I.js","/assets/UsersManagement-DNagfequ.js","/assets/VerifixPage-BFGdrOsG.js","/assets/VerifixParity-CokQ__3c.js","/assets/VfxApiMap-C_PCmFcE.js","/assets/VfxDictionaries-uypYdapP.js","/assets/VfxEmployees-CY7TWNbG.js","/assets/VfxHrMoves-BjWMu1Sm.js","/assets/VfxJobs-DLTEqk4m.js","/assets/VfxPhoto-C1B4VCbQ.js","/assets/VfxShifts--na8QNi4.js","/assets/VfxState-kTggBaHp.js","/assets/VfxTimebooks-CeF8WCBp.js","/assets/VfxTimesheet-B2pYwuEP.js","/assets/WatchProgress-BD2H0ZUq.js","/assets/WebLogin-Ud1S03Ot.js","/assets/WorkersAttendance-DqwKddTs.js","/assets/WorkersComposition-DHB_Wl5j.js","/assets/WorkersMovements-BBgrEc5_.js","/assets/WorkersPage-Ym4X-LBp.js","/assets/Zagruzka-qCaGIPRT.js","/assets/ZagruzkaCell-BAuQnbqg.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Cs6l3iop.js","/assets/api-D_IoyhCc.js","/assets/appealTask-DjhDYdUn.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-DoICrRBv.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DlY0Fqcp.js","/assets/broadcastTree-BfatflBh.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-osTS4q3D.js","/assets/categories-BSFLsyZz.js","/assets/cellMoveRefusal-Bltugwp7.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DeVnzFBO.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-CrQRnHYW.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-DMPmAxoS.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-2rhA_qjc.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-2VT87Y3X.js","/assets/index-Df3g8Dme.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DjQn4JAR.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/marks-CdMoAEj4.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-0U1Uu-71.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BfE-0NeW.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-DGhQ38bs.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-C8TeH-mZ.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DBIJxhyx.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Sny5fwah.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-DREmXbm1.js","/assets/useMutation-BnWwFSSH.js","/assets/useOpenParam-Ivzxlqus.js","/assets/useStatusBands-vVc-0IOo.js","/assets/useUrlScope-DprHabba.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-rMPN9hqg.js","/assets/uz_cyrl-CYhVcHmH.js","/assets/vfx-D8OHcINO.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-LnxgSjwd.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
