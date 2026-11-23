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

const BUILD = "2026-11-23T09:51:55.697Z";
const PRECACHE = ["/","/assets/AdminPage-DuFjqLQM.js","/assets/AdminTabs-BPGcXAea.js","/assets/AiKeys-DuDDYJ7F.js","/assets/AnalysisBoard-B_zBIv8G.js","/assets/ApiAccess-LaUA-5Db.js","/assets/AppLauncher-CGUbxoVN.js","/assets/Arc-NIBbfUfQ.js","/assets/Assessment-CxFkvJ2a.js","/assets/AssessmentGrade-DuV1O42f.js","/assets/AssessmentList-DTqKDObd.js","/assets/Assistant-BsSYKyl5.js","/assets/AttendanceCleanup-B6s8jLV9.js","/assets/AttendanceUpload-DMO03Tc1.js","/assets/AuditTable-5U1TnkJM.js","/assets/Audits-DvmK5oP9.js","/assets/BrigadirProfile-LUwAZUyz.js","/assets/BrigadirsKpi-BK6meIwE.js","/assets/Broadcast-BvtZFvjw.js","/assets/BroadcastReceivers-BIRVdk-j.js","/assets/BroadcastRecord-BKcUQfH9.js","/assets/CatLockNotice-CLXBxpj9.js","/assets/CategoryLegendModal-CAYftTd4.js","/assets/CellConcerns-Bmz4x3LM.js","/assets/CellDetails-b7Jq-mcU.js","/assets/CellFormModal-DgvGLXuK.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-CYI3-8sS.js","/assets/Cells-CQZo8XK_.js","/assets/ColumnFilter-BZpUtmfE.js","/assets/ColumnsPicker-BEyStscR.js","/assets/CommentsModal-xJxD6U_l.js","/assets/ComparisonTable-CuflLbdq.js","/assets/Concerns-D8dW4WTs.js","/assets/ConcernsPieces-BhuJBRzR.js","/assets/ContainerFlow-C4qZmK2M.js","/assets/ContainerTotalsCard-DwkOi2xQ.js","/assets/Containers-DwW7h35N.js","/assets/CountStepper-DE0z3BBo.js","/assets/Daily-CiqAw_kB.js","/assets/DataSources-0nb_xSTY.js","/assets/DataTable-BUcrN_b-.js","/assets/DateRangePicker-B3EGFCZn.js","/assets/DayReportView-CZRmDtHr.js","/assets/DayStepper-GTwgrbJy.js","/assets/DayStrip-C2rt5T0A.js","/assets/DbBackup-jevXL77O.js","/assets/DifferenceBreakdown-QlCMbn2s.js","/assets/DocAudit-BBt-QIW6.js","/assets/Downtime-B9eLF32d.js","/assets/Education-BZNENMtv.js","/assets/EducationLesson-LEBPX1iV.js","/assets/EmptyState-B8Viq9j9.js","/assets/Equipment-C4FRt4vc.js","/assets/Exam-1Fv4J9cS.js","/assets/ExamAdmin-Zr0MWLd4.js","/assets/Factories-BVwyzT7f.js","/assets/FactorySelect-jV0OcrXe.js","/assets/Gamification-Bry2E8C6.js","/assets/GroupBadge-BC2LH0Hr.js","/assets/HeatmapChart-BQ5x0elz.js","/assets/HourlyContainers-NSnL18PE.js","/assets/IdleCell-Cyi2jOhg.js","/assets/IdleOwners-peZMvBfl.js","/assets/IdleSolutions-HeybkGAF.js","/assets/KPICard-elz-oms8.js","/assets/Kaizen-DLcL2Uvz.js","/assets/Kelish-CiY7VQvL.js","/assets/Kitchen-uxNcI8QO.js","/assets/KpiBits-Du1ymi_k.js","/assets/KpiDeltaCard-CV0OOqbj.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-UnHj5M47.js","/assets/LeaderAppeal-B6H7-DWZ.js","/assets/LeaderDailyTasks-ex8KFZ4n.js","/assets/LeaderDayReport-B89lU48m.js","/assets/LeaderNotCounting-Dfa0BtEX.js","/assets/LeaderTasksAdmin-B09yF9kJ.js","/assets/LeaderUnitReport-BEezrTEx.js","/assets/Leaderboard-BFjNu4E_.js","/assets/Leaders-Bl6nSlkh.js","/assets/LeadersKpi-BzsCc3jG.js","/assets/Lightbox-C7OjW3MV.js","/assets/LiveOverview-KXVzlrpv.js","/assets/Login-BWLvnh8N.js","/assets/Logs-BfR6NBFX.js","/assets/LostWorkers-CUWi5A8u.js","/assets/NotFound-BHusf27p.js","/assets/Notifications-BU15KWun.js","/assets/NotionTasks-CWBwDj9n.js","/assets/NotionTrackerSettings-BRzb6Qra.js","/assets/Ontime-DWPaQuX4.js","/assets/OrgChart-v05j8Xwh.js","/assets/Ovens-B_cxUrR7.js","/assets/OvensSettings-x7sZjrgV.js","/assets/Overview-DKVA5fzy.js","/assets/OwnerChip-BxYCxLNQ.js","/assets/Pagination-p8YzqJzg.js","/assets/People-COPT4rFl.js","/assets/PerenaladkaFactTable-BfN0Bo-O.js","/assets/Permissions-CJ-j8vAT.js","/assets/PersonCard-B1RF_5RR.js","/assets/PlanFulfillment-BlTtxLrU.js","/assets/Production-CnREC_hc.js","/assets/ProductionUpload-Bp2S7wY8.js","/assets/Profile-BKAHCZHS.js","/assets/ProfileAvatar-DQwNHYuo.js","/assets/ProfilesManagement-ltIhBfMa.js","/assets/ProofCamera-Dvp5DmhE.js","/assets/ProofPhoto-BK6cpNgH.js","/assets/Quality-C10drqMC.js","/assets/RawRows-By-XHsRU.js","/assets/Reports-DQvVeRAw.js","/assets/RequestStateChip-BV372Qjl.js","/assets/RichTextEditor-Bo72xAkX.js","/assets/SaveState-BRrS_AxI.js","/assets/SdPanelSettings-CFShpHUB.js","/assets/SearchInput-BcQYB01x.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-qUbo9G_6.js","/assets/ShiftDaily-BZTcJDlt.js","/assets/ShiftTimes-CgyqGPBB.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-xZAZkbIb.js","/assets/StaffListAtCheck-Ci-65z3F.js","/assets/StatusBadge--yNbj7Uk.js","/assets/StatusBandsModal-DAIReBQ6.js","/assets/TargetGoal-hrPiK-wT.js","/assets/Targets-DA0Oswk9.js","/assets/TaskFormModal-D-qPXtho.js","/assets/TaskerSettings-Dh1vvoC3.js","/assets/Tasks-BpX2Wfq6.js","/assets/TgProfile-BHH7Kuli.js","/assets/TimeWheelPicker-PIVccKv0.js","/assets/Tooltip-BCCHTjiF.js","/assets/TranslationsEditor-BCAi-uRR.js","/assets/TrelloAnalytics-BP4YFEfd.js","/assets/TrelloSettings-DINPrkd8.js","/assets/TrendChart-DN4m0bAn.js","/assets/TripleSpeedometer-Dw6yjftU.js","/assets/Trudoyomkost-0pVZqAO8.js","/assets/UploadDropzone-Csow_TDq.js","/assets/UsersActivity-DOQ0OsI0.js","/assets/UsersManagement-ewEQiWbn.js","/assets/VerifixPage-YxX2gpQE.js","/assets/VerifixParity-CZAGFXRa.js","/assets/VfxApiMap-S3B8AISu.js","/assets/VfxDictionaries-Dw2psbGH.js","/assets/VfxEmployees-D33CoGGC.js","/assets/VfxHrMoves-wZaH9ZSe.js","/assets/VfxJobs-KceBzCJc.js","/assets/VfxPhoto-BxV3YLsF.js","/assets/VfxShifts-CVZfgYpo.js","/assets/VfxState-CR-cH-hy.js","/assets/VfxTimebooks-D7MYMawN.js","/assets/VfxTimesheet-VpaSRW0N.js","/assets/WatchProgress-BAWhqF56.js","/assets/WebLogin-CD7brHcn.js","/assets/WorkersAttendance-BFRDyy21.js","/assets/WorkersComposition-CYAv70CD.js","/assets/WorkersMovements-BWgDNMUp.js","/assets/WorkersPage-CGN-fXOK.js","/assets/Zagruzka-Cz0WFNua.js","/assets/ZagruzkaCell-B-XSUV86.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-D4zmvnui.js","/assets/api-D_IoyhCc.js","/assets/appealTask-D9ValQ0i.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-C-g7PEbn.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Ca-BFW7L.js","/assets/broadcastTree-CiX81n1M.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-DEC69Xym.js","/assets/categories-C45HHPK2.js","/assets/cellMoveRefusal-CIsDXI1k.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-OgowxZS_.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-Bjy-RR8K.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-C7egC-Pe.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-oiGIh54x.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Bru57gRL.js","/assets/index-DkyflHqG.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-B6RFh4h2.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-C8De6-cv.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-Brfsh5qj.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-Dx2Vu_RW.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-BnNAAWv-.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BpOmioXD.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-Dx9dNc7P.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CIBs1NzF.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-MieEc1gu.js","/assets/useMutation-BFQV-ZNl.js","/assets/useOpenParam-CwpUXSXq.js","/assets/useStatusBands-Thh_rof-.js","/assets/useUrlScope-Bamdmiwb.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BgZj5Koo.js","/assets/uz_cyrl-V7lJgya0.js","/assets/vfx-BQRB6wm6.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-s2oborjP.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
