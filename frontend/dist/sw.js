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

const BUILD = "2026-11-12T06:30:04.255Z";
const PRECACHE = ["/","/assets/ActionHistory-BeKjdTu-.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-BNJqek5t.js","/assets/AiKeys-CuBmBNBv.js","/assets/AnalysisBoard-B0U4CFrI.js","/assets/ApiAccess-B-jn3TQ_.js","/assets/AppLauncher-qPrzjtV1.js","/assets/Arc-Os56osTg.js","/assets/Assessment-CFsbB1UT.js","/assets/AssessmentGrade-MxJmso2s.js","/assets/AssessmentList-CUTRinVe.js","/assets/Assistant-BUrHabIJ.js","/assets/AttendanceCleanup-BKJmG0UW.js","/assets/AttendanceUpload-mwABk4uE.js","/assets/AuditTable-B2UPH88B.js","/assets/BrigadirProfile-tgnuK7IP.js","/assets/BrigadirsKpi-CZ5tMgkJ.js","/assets/Broadcast-Dz79Z1Cu.js","/assets/BroadcastReceivers-Hpb0WJQY.js","/assets/BroadcastRecord-BAkTyONF.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-B2fuzoXZ.js","/assets/CategoryLegendModal-kVyhxKCl.js","/assets/CellConcerns-Cqs4-Ae6.js","/assets/CellDetails-BM2xg2oZ.js","/assets/CellFormModal-owjFmBRe.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-CO0Ts38L.js","/assets/Cells-BQlZfxBS.js","/assets/ColumnFilter-B_SX1PaN.js","/assets/ColumnsPicker-DjVeWdVe.js","/assets/CommentsModal-C2JdqQg1.js","/assets/ComparisonTable-DNJLXP7h.js","/assets/Concerns-hbrxbgv0.js","/assets/ConcernsPieces-BVyUcgNF.js","/assets/CountStepper-BjTyW5gH.js","/assets/Daily-B4XhQg_L.js","/assets/DataSources-B1_3Y-7Y.js","/assets/DataTable-6Ifstw5B.js","/assets/DateRangePicker-ChJr4SLg.js","/assets/DayReportView-fx05JzWY.js","/assets/DayStepper-CO1W8Lxi.js","/assets/DayStrip-CKrwB5jL.js","/assets/DbBackup-zb0LPQu4.js","/assets/DifferenceBreakdown-Dz8_Yuf4.js","/assets/DocAudit-CivpbXHe.js","/assets/Downtime-BtjScD7O.js","/assets/Education-8UAeQuHz.js","/assets/EducationLesson-DFolXNcC.js","/assets/EmptyState-ChYcvkbl.js","/assets/Exam-B8hTDI43.js","/assets/ExamAdmin-nCRFIzS4.js","/assets/Factories-RN7SUphK.js","/assets/FactorySelect-CmGdrfOW.js","/assets/Gamification-P1G5XkXm.js","/assets/GroupBadge-DBwWD1ft.js","/assets/HeatmapChart-BbjNw7uA.js","/assets/IdleCell-L6YiAWdj.js","/assets/IdleOwners-B4v5pslB.js","/assets/IdleSolutions-pGVTUngy.js","/assets/IdleSource-CtVKq2Bp.js","/assets/KPICard-DRPodSa-.js","/assets/Kaizen-CkMiQqYv.js","/assets/Kelish-BR3tr29L.js","/assets/KpiBits-lYV61gfE.js","/assets/KpiDeltaCard-CpYM4kal.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-kEZMq3Y8.js","/assets/LeaderAppeal-BeRBwgAa.js","/assets/LeaderCutoffs-BcSdtD9P.js","/assets/LeaderDailyTasks-DNtaEEJ6.js","/assets/LeaderDayExclusions-v80gkjxO.js","/assets/LeaderDayReport-CHXbTFku.js","/assets/LeaderTasksAdmin-B1Z80cAH.js","/assets/LeaderUnitReport-Cqumcqv3.js","/assets/Leaderboard-CRzIGRMQ.js","/assets/Leaders-koQ1VugZ.js","/assets/LeadersKpi-BJRb0Guj.js","/assets/Lightbox-8sjJi-OP.js","/assets/LiveOverview-LhdANz1L.js","/assets/Login-B3qsOdki.js","/assets/Logs-CavCoVkG.js","/assets/LostWorkers-CYi6Q6eA.js","/assets/NotFound-Cb3rU2Xs.js","/assets/Notifications-D2N6a0YT.js","/assets/NotionTasks-DFqrih33.js","/assets/NotionTrackerSettings-Vg9im1DN.js","/assets/Ontime-CphbDNeu.js","/assets/Ovens-NGVDr_BS.js","/assets/OvensSettings-Crc1ih22.js","/assets/Overview-C2UxKrnH.js","/assets/OwnerChip-DW01o7wm.js","/assets/PageAccess-D_lbmiMQ.js","/assets/Pagination-Dto5_gyh.js","/assets/People-PAJ26d_0.js","/assets/PerenaladkaFactTable-CpeHsAMD.js","/assets/Permissions-BljBlID2.js","/assets/PersonCard-CJE8rlUX.js","/assets/PlanFulfillment-BttEVnXC.js","/assets/Production-CSyrijPb.js","/assets/ProductionUpload-pGtctjcn.js","/assets/Profile-Czzq-w-u.js","/assets/ProfileAvatar-BjFA6HoO.js","/assets/ProfilesManagement-D0tOeeDR.js","/assets/ProofCamera-gXhbMXKP.js","/assets/ProofPhoto-O-5g6KSb.js","/assets/Quality-CKD9IOwE.js","/assets/RawRows-Ct1hVRwO.js","/assets/Reports-rWCKybZc.js","/assets/RequestStateChip-BiTbSRYz.js","/assets/RichTextEditor-0AGG6Yp8.js","/assets/SaveState-C8crFqKD.js","/assets/SearchInput-V4CUc-aI.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-9stErxIR.js","/assets/ShiftDaily-DvHosBYm.js","/assets/ShiftTimes-DrNMYEOX.js","/assets/Staff-Kdqa8QcP.js","/assets/StaffListAtCheck-B_Hg8U0w.js","/assets/StatusBadge-BsYhWW1b.js","/assets/StatusBandsModal-COSA8xwQ.js","/assets/TargetGoal-D4I9cOgT.js","/assets/Targets-B6vYNB-U.js","/assets/TaskerSettings-R9zfzDL0.js","/assets/Tasks-B0X2O9Ri.js","/assets/TgProfile-jFUmEo62.js","/assets/TimeWheelPicker-ZkULLfPC.js","/assets/Tooltip-ChxpHWiz.js","/assets/TranslationsEditor-BYtlIOxd.js","/assets/TrelloAnalytics-6yFRUXBW.js","/assets/TrelloSettings-25ekvZcM.js","/assets/TrendChart-Bd35p-Uv.js","/assets/TripleSpeedometer-DTHTZqQN.js","/assets/Trudoyomkost-B5QBHIEM.js","/assets/UploadDropzone-yxzhVHr9.js","/assets/UsersActivity-hm_j99zt.js","/assets/UsersManagement-DsT0utUn.js","/assets/VerdictBlock-BTWNFZRq.js","/assets/VerifixParity-BLTlu11G.js","/assets/VerifixSettings-Bvrq4v6R.js","/assets/VerifixSync-DsTwznsk.js","/assets/VfxApiMap-CCygzqX2.js","/assets/VfxDictionaries-B7JAmFd4.js","/assets/VfxEmployees-C5btJmsa.js","/assets/VfxHrMoves-CfCLyaGK.js","/assets/VfxJobs-mR9YLCx9.js","/assets/VfxPhoto-BfQBE7BM.js","/assets/VfxShifts-D1woJcSz.js","/assets/VfxState-CCofKKxh.js","/assets/VfxTimebooks-Cf0-eBby.js","/assets/VfxTimesheet-BeJ0SRV5.js","/assets/WatchProgress-Djs3QySE.js","/assets/WebLogin-CTBshxjn.js","/assets/WorkersAttendance-GhVGimSr.js","/assets/WorkersComposition-l7VWatRF.js","/assets/WorkersMovements-ByDaOQ0G.js","/assets/WorkersPage-i8PzDgH5.js","/assets/Zagruzka-BCpjitR_.js","/assets/ZagruzkaCell-CYs3Jmzw.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-D9u8bsw9.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CFyHyiMz.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BLu0-sBF.js","/assets/broadcastTree-DSPgOTON.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-Cus2gGeU.js","/assets/cellMoveRefusal-D1KQDXUg.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CvA1R1NQ.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-CpPwgLBu.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-4jdk-K58.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CWZ4opT3.js","/assets/index-wrGK6Zf-.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-OYfPhTZw.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-8niVrZ6V.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CG48BY20.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-Dj9gbQj8.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-C9B7z5mF.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-c4hI7KYL.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-Bk3u2q71.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-w7sWcLPb.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-Dhibuh0x.js","/assets/useMutation-BgZ1yZxa.js","/assets/useOpenParam-B089eZ_L.js","/assets/useStatusBands-CwzhM5Gq.js","/assets/useUrlScope-BPpmkMTM.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-FA2e5BuF.js","/assets/uz_cyrl-BXNK4qGX.js","/assets/vfx-B596KLdX.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-BUmRpqX3.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
