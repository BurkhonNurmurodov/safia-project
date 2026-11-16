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

const BUILD = "2026-11-16T05:41:38.303Z";
const PRECACHE = ["/","/assets/ActionMenu-D3_QoP_0.js","/assets/AdminPage-BHqigRqo.js","/assets/AdminTabs-BiLYkzRO.js","/assets/AiKeys-C0SiNypD.js","/assets/AnalysisBoard-CQrFa_md.js","/assets/ApiAccess-ruSCD_EU.js","/assets/AppLauncher-C55aJX5T.js","/assets/Arc-C2VnsTlv.js","/assets/Assessment-CXg31b4V.js","/assets/AssessmentGrade-DdOw32mS.js","/assets/AssessmentList-BfS2E_IR.js","/assets/Assistant-DNCQLQ7C.js","/assets/AttendanceCleanup-DHCGFI58.js","/assets/AttendanceUpload-BRBrkUV-.js","/assets/AuditTable-DQ6bhYjn.js","/assets/BrigadirProfile-BCHQr-gJ.js","/assets/BrigadirsKpi-Bi6V1wRL.js","/assets/Broadcast-CWaamdQU.js","/assets/BroadcastReceivers-CSd_lENA.js","/assets/BroadcastRecord-DJsxql98.js","/assets/Button-BByRB7Le.js","/assets/CatLockNotice-BChZqGjJ.js","/assets/CategoryLegendModal-BTG5xHOc.js","/assets/CellConcerns-C0AvgMFu.js","/assets/CellDetails-pBA47LFq.js","/assets/CellFormModal-PvPyeHmK.js","/assets/CellIdent-DE6qkdqd.js","/assets/CellLink-7cB69RNf.js","/assets/Cells-5G6H4XJn.js","/assets/ColumnFilter-CBFEzxSU.js","/assets/ColumnsPicker-RN4r25Q8.js","/assets/CommentsModal-DB3mwKnX.js","/assets/ComparisonTable-H3O0y-xU.js","/assets/Concerns-_ovLsyka.js","/assets/ConcernsPieces-BOVwjro5.js","/assets/ContainerFlow-zQWZs_xq.js","/assets/ContainerTotalsCard-EQS_s8bT.js","/assets/Containers-BfYdhh6O.js","/assets/CountStepper-DwQrd7Pg.js","/assets/Daily-Dqv9krJd.js","/assets/DataSources-BarlWA6y.js","/assets/DataTable-DEEVOFuM.js","/assets/DateRangePicker-BNS2C4aG.js","/assets/DayReportView-nAAVfQDH.js","/assets/DayStepper-D8zefi2O.js","/assets/DayStrip-B2vmRpNr.js","/assets/DbBackup-B_dCr0YQ.js","/assets/DifferenceBreakdown-ClzfNG3c.js","/assets/DocAudit-Dii9tv4G.js","/assets/Downtime-CA-Bno3g.js","/assets/Education-Dd_xhpDA.js","/assets/EducationLesson-4JFaRV0S.js","/assets/EmptyState-DYSYVA1a.js","/assets/Exam-BwaM3XML.js","/assets/ExamAdmin-C0_UDgOQ.js","/assets/Factories-2YmVwCBW.js","/assets/FactorySelect-B00JgFg0.js","/assets/Gamification-C7xUpDfA.js","/assets/GroupBadge-mfEoaR8u.js","/assets/HeatmapChart-0OBDPqtz.js","/assets/HourlyContainers-Ctd9RG-k.js","/assets/IdleCell-DREVjlgq.js","/assets/IdleOwners-BlkA53EV.js","/assets/IdleSolutions-DugBkFta.js","/assets/KPICard-BURy_GkE.js","/assets/Kaizen-CwVgvpd_.js","/assets/Kelish-fAHB0NLF.js","/assets/Kitchen-L3tU2eYu.js","/assets/KpiBits-BzNBE0PN.js","/assets/KpiDeltaCard-DSLtZfuF.js","/assets/LangContext-2A4sPKlL.js","/assets/LangTextInput-Kofaohjz.js","/assets/Layout-UTzleOnQ.js","/assets/LeaderAppeal-BdYpTuWh.js","/assets/LeaderDailyTasks-4LJQxtDd.js","/assets/LeaderDayReport-Bxb9toI_.js","/assets/LeaderNotCounting-D-aopf5n.js","/assets/LeaderTasksAdmin-yUOXcDrt.js","/assets/LeaderUnitReport-DW01lKDh.js","/assets/Leaderboard-rciTiagh.js","/assets/Leaders-Bpc8wTDV.js","/assets/LeadersKpi-BQn_iVL7.js","/assets/Lightbox-uvoX2EKi.js","/assets/LiveOverview-BEYbOzhn.js","/assets/Login-B8xnkcdd.js","/assets/Logs-C3R_9ZNS.js","/assets/LostWorkers-BDjF6Kfj.js","/assets/Meter-CRRHrYuq.js","/assets/NotFound-Bkcv8iCY.js","/assets/Notifications-wgciLDgi.js","/assets/NotionTasks-D7ZY64Fb.js","/assets/NotionTrackerSettings-0-ytghZM.js","/assets/Ontime-BL1b6dc4.js","/assets/OrgChart-B-g_5VQ-.js","/assets/Ovens-DGVpxS3l.js","/assets/OvensSettings-B6RZJZhh.js","/assets/Overview-DJQouIjf.js","/assets/OwnerChip-C6SNMhPl.js","/assets/Pagination-Coy9_Mou.js","/assets/People-p6FqVsAp.js","/assets/PerenaladkaFactTable--E4N1m0Q.js","/assets/Permissions-Z1GtGmPY.js","/assets/PersonCard-BnSmiduN.js","/assets/PlanFulfillment-Dxbmxz0M.js","/assets/Production-DmsIhHF_.js","/assets/ProductionUpload-Bdq2oENK.js","/assets/Profile-Ul78zWyC.js","/assets/ProfileAvatar-BbE50HT9.js","/assets/ProfilesManagement-BdT4bZ7w.js","/assets/ProofCamera-BBtuYnfi.js","/assets/ProofPhoto-DitzfBbm.js","/assets/Quality-BFHdOb0b.js","/assets/RawRows-BT1xTY5d.js","/assets/Reports-dDNHU7_L.js","/assets/RequestStateChip-BsUL8oi2.js","/assets/RichTextEditor-RRWN2T6c.js","/assets/SaveState-BN4hel_g.js","/assets/SearchInput-DqVD9r0p.js","/assets/SeasonalityHeatmap-B65j5wfW.js","/assets/SegmentedToggle-CIxWlaZZ.js","/assets/SetupTimes-fNqPr2L_.js","/assets/ShiftDaily-CtdBrO5e.js","/assets/ShiftTimes-3Dmyxafx.js","/assets/SortableList-DgrUPWKx.js","/assets/Staff-BgPl9ExM.js","/assets/StaffListAtCheck-BNjfHk3K.js","/assets/StatusBadge-BLPQ-A-o.js","/assets/StatusBandsModal-CpYyIv-g.js","/assets/TargetGoal-38hIp5RN.js","/assets/Targets-B8YztQv1.js","/assets/TaskFormModal-DXHKWCBB.js","/assets/TaskerSettings-BCbIJGSU.js","/assets/Tasks-DFooHtlT.js","/assets/TgProfile-ByIKtzYl.js","/assets/TimeWheelPicker-CntjHLmI.js","/assets/Tooltip-DnmKUxUb.js","/assets/TranslationsEditor-BWEP0YBQ.js","/assets/TrelloAnalytics-Cr_uurDH.js","/assets/TrelloSettings-BRt-9mGV.js","/assets/TrendChart-rb-4lPcU.js","/assets/TripleSpeedometer-C_StiQya.js","/assets/Trudoyomkost-u4WDq6IX.js","/assets/UploadDropzone-jzCOBUlb.js","/assets/UsersActivity-Dla9z4Ub.js","/assets/UsersManagement-Dwror6gR.js","/assets/VerdictBlock-_1jlQE5s.js","/assets/VerifixPage-CuUH3l8R.js","/assets/VerifixParity-BBps_7ww.js","/assets/VfxApiMap-I3mOTRvG.js","/assets/VfxDictionaries-CHYQuLVX.js","/assets/VfxEmployees-BZt4AVta.js","/assets/VfxHrMoves-jEMtDySE.js","/assets/VfxJobs-CWats6dp.js","/assets/VfxPhoto-BUbZay6H.js","/assets/VfxShifts-BgGllBFs.js","/assets/VfxState-Bi-xEppy.js","/assets/VfxTimebooks-BFW1CAXy.js","/assets/VfxTimesheet-B8aBO5Qa.js","/assets/WatchProgress-BropMR0w.js","/assets/WebLogin-CWQsXkcS.js","/assets/WorkersAttendance-9E-d3Nhk.js","/assets/WorkersComposition-CXsRTyYN.js","/assets/WorkersMovements-D3TWb51h.js","/assets/WorkersPage-7V6xrl-2.js","/assets/Zagruzka-bP1SEbPS.js","/assets/ZagruzkaCell-BImS1Nff.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DyH1fRt1.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-D0krdc7m.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DMr3hOYb.js","/assets/broadcastTree-WDhMNeW7.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BxXs2BEO.js","/assets/cellMoveRefusal-33bjLzgp.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-NBK-OM_s.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Dl5Rz9WX.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-DhIDWq2Y.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BUhuqtvR.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BzYgdmnV.js","/assets/index-Rq15oGzo.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DfIPbKdj.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-C_01i0Av.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CaZl1ktg.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CUBVn8lY.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-DeXBUO8Y.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BeL_rbMy.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DGskdIYF.js","/assets/ru-CIqDzFQv.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-xBVEXUxV.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DrvL_CRf.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-ChfDr16y.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-D_hv66Zm.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-D1UfzSHB.js","/assets/useLeaveRef-9t0sU37C.js","/assets/useMutation-Bk95G8JA.js","/assets/useOpenParam-Do5ZQTrB.js","/assets/useStatusBands-C6d_tXc6.js","/assets/useUrlScope-B258iRyK.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-w1OKdYmw.js","/assets/uz_cyrl-Dzc-AxaF.js","/assets/vfx-CcItcXKe.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-HKKFky4c.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
