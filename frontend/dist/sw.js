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

const BUILD = "2026-11-12T06:40:17.096Z";
const PRECACHE = ["/","/assets/ActionHistory-yau-WESD.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-CyGnRj67.js","/assets/AiKeys-BFUXgKVV.js","/assets/AnalysisBoard-BxMhjfGR.js","/assets/ApiAccess-CV_ANj_6.js","/assets/AppLauncher-C00fKsFf.js","/assets/Arc-qxMQXj_M.js","/assets/Assessment-CGU4Bq4X.js","/assets/AssessmentGrade-DvJS0yya.js","/assets/AssessmentList-CqD7TQH0.js","/assets/Assistant-CeSS3iL9.js","/assets/AttendanceCleanup-B41f3Cr7.js","/assets/AttendanceUpload-flTBc3hp.js","/assets/AuditTable-B2dTkupp.js","/assets/BrigadirProfile-DpT1r7ZA.js","/assets/BrigadirsKpi-BS9Ds5R3.js","/assets/Broadcast-Dx42-uEs.js","/assets/BroadcastReceivers-BiLQfgmP.js","/assets/BroadcastRecord-Di-WMOzg.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-BsVIAGG2.js","/assets/CategoryLegendModal-Dw1oIc60.js","/assets/CellConcerns-CSzy9CcI.js","/assets/CellDetails-DKKJWUdZ.js","/assets/CellFormModal-Cc_jZe2k.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-DDBwDNZA.js","/assets/Cells-BwJM8bzY.js","/assets/ColumnFilter-B3msqphE.js","/assets/ColumnsPicker-DIWXQT-0.js","/assets/CommentsModal-Behs9Fd0.js","/assets/ComparisonTable-Bbrbqu43.js","/assets/Concerns-BwNlVsuH.js","/assets/ConcernsPieces-BSpLskW0.js","/assets/CountStepper-BGP3nIjT.js","/assets/Daily-gBRaVXf5.js","/assets/DataSources-BFpS-2aZ.js","/assets/DataTable-B4jhFT2I.js","/assets/DateRangePicker-BRE3bowm.js","/assets/DayReportView-BX-rER0k.js","/assets/DayStepper-1e2vxqlU.js","/assets/DayStrip-CX2SHrx7.js","/assets/DbBackup-hZIDSSqo.js","/assets/DifferenceBreakdown-CEvf_bHm.js","/assets/DocAudit-CtUhqnn4.js","/assets/Downtime-DkiOcNsp.js","/assets/Education-CqseEZnh.js","/assets/EducationLesson-D7UFs9lP.js","/assets/EmptyState-3icOTEW2.js","/assets/Exam-BOtWxJ9R.js","/assets/ExamAdmin-CzLP_SN2.js","/assets/Factories-Dq-xJXdL.js","/assets/FactorySelect-ZthR8uEt.js","/assets/Gamification-do3furiJ.js","/assets/GroupBadge-wEKeFQDJ.js","/assets/HeatmapChart-Cl0shWu8.js","/assets/IdleCell-CYwsClT0.js","/assets/IdleOwners-DRXmd_Kb.js","/assets/IdleSolutions-BuvnCibG.js","/assets/IdleSource-C9OQYcpU.js","/assets/KPICard-CnMjUkBE.js","/assets/Kaizen--4ooMDpJ.js","/assets/Kelish-CA0xJuJ6.js","/assets/KpiBits-CfPUYza7.js","/assets/KpiDeltaCard-dRshxkje.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-Dd5y9kuI.js","/assets/LeaderAppeal-B3iv9KfQ.js","/assets/LeaderCutoffs-BzNwqXcl.js","/assets/LeaderDailyTasks-Ddz501bv.js","/assets/LeaderDayExclusions-Bo7JP7nl.js","/assets/LeaderDayReport-BtrAnrhQ.js","/assets/LeaderTasksAdmin-Cc91ksxW.js","/assets/LeaderUnitReport-BlD1YK_z.js","/assets/Leaderboard-B9Fv8syo.js","/assets/Leaders-Ccf2qbuu.js","/assets/LeadersKpi-Wtu2xGCT.js","/assets/Lightbox-BOtFro_M.js","/assets/LiveOverview-x9-Tv0vL.js","/assets/Login-DUUEmCna.js","/assets/Logs-DN4Rl6NO.js","/assets/LostWorkers-BnmgJq5d.js","/assets/NotFound-B836_wmr.js","/assets/Notifications-Ld2UAEf3.js","/assets/NotionTasks-Cb8R0jl0.js","/assets/NotionTrackerSettings-Cgj_-2B2.js","/assets/Ontime-DUZWr2xb.js","/assets/Ovens-B9tcZYhG.js","/assets/OvensSettings-Cx9rgITt.js","/assets/Overview-OiAZhxI4.js","/assets/OwnerChip-Cgox1TV-.js","/assets/PageAccess-MSkk5GMv.js","/assets/Pagination-DkhAnLnT.js","/assets/People-CuBa9iU4.js","/assets/PerenaladkaFactTable-BLhiccMO.js","/assets/Permissions-BXwDvrRz.js","/assets/PersonCard-CakMLEJd.js","/assets/PlanFulfillment-BhL6pCPj.js","/assets/Production-D84ueChm.js","/assets/ProductionUpload-DysGxWOU.js","/assets/Profile-EacBCOGj.js","/assets/ProfileAvatar-B3cSk1r7.js","/assets/ProfilesManagement-CWrUFw2u.js","/assets/ProofCamera-Cdnl91xT.js","/assets/ProofPhoto-CP3C8zjl.js","/assets/Quality-CW1-XNmw.js","/assets/RawRows-DM0igSaq.js","/assets/Reports-D3yewZ74.js","/assets/RequestStateChip-BaSOeuNo.js","/assets/RichTextEditor-BxQ7iCwG.js","/assets/SaveState-BJaAZNBa.js","/assets/SearchInput-CUpKbCmr.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-Ugx8kXOF.js","/assets/ShiftDaily-TfPAE71j.js","/assets/ShiftTimes-Bhj4XwMB.js","/assets/Staff-CqX8rFIj.js","/assets/StaffListAtCheck-DYfNqbnc.js","/assets/StatusBadge-HYrBGCR9.js","/assets/StatusBandsModal-DmS_bHxT.js","/assets/TargetGoal-Cj-SFrm2.js","/assets/Targets-DKYoiFNJ.js","/assets/TaskerSettings-DrDRYEfO.js","/assets/Tasks-BsrlX5Mv.js","/assets/TgProfile-CjoQ_O7j.js","/assets/TimeWheelPicker-BD22EQvE.js","/assets/Tooltip-C790yOFJ.js","/assets/TranslationsEditor-C52rTT65.js","/assets/TrelloAnalytics-CZcFV9Ek.js","/assets/TrelloSettings-Dj_cYMGB.js","/assets/TrendChart-DFH6SiId.js","/assets/TripleSpeedometer-BKUwXMff.js","/assets/Trudoyomkost-Ch3KCHiI.js","/assets/UploadDropzone-Cbc8nsBV.js","/assets/UsersActivity-B-wdVunP.js","/assets/UsersManagement-CiDdvqUu.js","/assets/VerdictBlock-CIvQg2ad.js","/assets/VerifixParity-BvqQBd7q.js","/assets/VerifixSettings-w26Tg5O1.js","/assets/VerifixSync-CAGcr4j7.js","/assets/VfxApiMap-BsOCIp3w.js","/assets/VfxDictionaries-ChiHxEwu.js","/assets/VfxEmployees-C1qUsipM.js","/assets/VfxHrMoves-B0Jj9E60.js","/assets/VfxJobs-vnP5GMLc.js","/assets/VfxPhoto-DjeCF455.js","/assets/VfxShifts-Cag1TrMh.js","/assets/VfxState-quH1TxGZ.js","/assets/VfxTimebooks-LtHBaxMx.js","/assets/VfxTimesheet-DICP4uia.js","/assets/WatchProgress-BwrgckNy.js","/assets/WebLogin-BDa4c5x3.js","/assets/WorkersAttendance-Dms5MY8D.js","/assets/WorkersComposition-CK8_DPal.js","/assets/WorkersMovements-69MqZf3Y.js","/assets/WorkersPage-JF6ttJCg.js","/assets/Zagruzka-Cja6lIz5.js","/assets/ZagruzkaCell-UpWV7jGe.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CmxgfoiQ.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-vFbtq49R.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BjOxggyg.js","/assets/broadcastTree-Bgt1UaWA.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-CFgr1JVe.js","/assets/cellMoveRefusal-DvBLRF0x.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CugXVcp7.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-BP58EmTp.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BUOhFo_k.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Dw2UBZM6.js","/assets/index-wrGK6Zf-.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-HEqty1hZ.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-5bizIt99.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BlrDOksX.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-C4GgDhSY.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BVlY2K-B.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-Cqp1PlRI.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-BIN9VTCz.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DSYnVfL4.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DMFVeS61.js","/assets/useMutation-CF1I0gT5.js","/assets/useOpenParam-CJhZCakL.js","/assets/useStatusBands-DNDU-et7.js","/assets/useUrlScope-C8kJ_DsS.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-Dc_lyN7N.js","/assets/uz_cyrl-DdN9f46H.js","/assets/vfx-hRsnKN6l.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-NfeWaw9e.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
