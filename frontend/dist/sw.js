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

const BUILD = "2026-11-12T05:08:46.503Z";
const PRECACHE = ["/","/assets/ActionHistory-D00QAxW4.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-BUJuhFed.js","/assets/AiKeys-DXDVkE2f.js","/assets/AnalysisBoard-2Z_HSI9s.js","/assets/ApiAccess-Bfw_vd4W.js","/assets/AppLauncher-BVxnWRlZ.js","/assets/Arc-MLqTM-fC.js","/assets/Assessment-B4U_c5j0.js","/assets/AssessmentGrade-B8Py7KyR.js","/assets/AssessmentList-BDl9z2bx.js","/assets/Assistant-gD7NNreg.js","/assets/AttendanceCleanup-D6vMZy0m.js","/assets/AttendanceUpload-PG_a4dAj.js","/assets/AuditTable-5H6SseGn.js","/assets/BrigadirProfile-B6cGn-D1.js","/assets/BrigadirsKpi-BAnPB816.js","/assets/Broadcast-BSWGrwCp.js","/assets/BroadcastReceivers-DKMx2VRu.js","/assets/BroadcastRecord-BM07M6Te.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-BaI5Rmdg.js","/assets/CategoryLegendModal-D_MVX8jV.js","/assets/CellConcerns-BLP6U39C.js","/assets/CellDetails-B_GkbTQ5.js","/assets/CellFormModal-D4dV85-5.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-j6K68WmT.js","/assets/Cells-CcqjXTYU.js","/assets/ColumnFilter-CoqMQ0jA.js","/assets/ColumnsPicker-BlvT1v9O.js","/assets/CommentsModal-CdPjl-C9.js","/assets/ComparisonTable-J5A4bqII.js","/assets/Concerns-BI47o519.js","/assets/ConcernsPieces-CLk4FrC6.js","/assets/CountStepper-vaRh9LOK.js","/assets/Daily-DCSCf5EK.js","/assets/DataSources-BvMHNmtU.js","/assets/DataTable-D95Ayssm.js","/assets/DateRangePicker-D_FJP59g.js","/assets/DayReportView-DcwSNxZ9.js","/assets/DayStepper-9Qo3qlcl.js","/assets/DayStrip-DcJSjEI2.js","/assets/DbBackup-D0AZyBZF.js","/assets/DifferenceBreakdown-C4jNrW0_.js","/assets/DocAudit-B9OeQmsF.js","/assets/Downtime-b5rYZq5D.js","/assets/Education-B0tfJre8.js","/assets/EducationLesson-C2rhlvXF.js","/assets/EmptyState-By9QQA68.js","/assets/Exam-KSjxZKJl.js","/assets/ExamAdmin-DcAAjiPo.js","/assets/Factories-DjoYo9T_.js","/assets/FactorySelect-CCBfmPfZ.js","/assets/Gamification-CT-16iE_.js","/assets/GroupBadge-DJL9F-ls.js","/assets/HeatmapChart-D1hCXpjI.js","/assets/IdleCell-7zMJJH34.js","/assets/IdleOwners-B-3Ik2p6.js","/assets/IdleSolutions-CRwf91_v.js","/assets/IdleSource-z4u4BFYf.js","/assets/KPICard-igZ2XcdX.js","/assets/Kaizen-DVvOJoJV.js","/assets/Kelish-2hnrtd5K.js","/assets/KpiBits-CmGJc2Jt.js","/assets/KpiDeltaCard-eVMQmPwh.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-l74K8UwF.js","/assets/LeaderAppeal-D8A1LTuV.js","/assets/LeaderCutoffs-DjO4Dd3H.js","/assets/LeaderDailyTasks-DSWXLr9d.js","/assets/LeaderDayExclusions-C3FGkpxP.js","/assets/LeaderDayReport-CLbw_y0r.js","/assets/LeaderTasksAdmin-BO7zfsDQ.js","/assets/LeaderUnitReport-8cj2x7eF.js","/assets/Leaderboard-CO861uru.js","/assets/Leaders-vvRdy0U4.js","/assets/LeadersKpi-arjI9x82.js","/assets/Lightbox-Qpo6XFUD.js","/assets/LiveOverview-Dd3f8Ch-.js","/assets/Login-ZmH1Ow8Z.js","/assets/Logs-B6AGtS0e.js","/assets/LostWorkers-DU_c7pOk.js","/assets/NotFound-DD8m6o-N.js","/assets/Notifications-DaFetlN3.js","/assets/NotionTasks-ChcYiyfq.js","/assets/NotionTrackerSettings-DYJcdn6T.js","/assets/Ontime-CHXV3PDQ.js","/assets/Ovens-DjzEkqBH.js","/assets/OvensSettings-B9urO-57.js","/assets/Overview-Dxg3U74u.js","/assets/OwnerChip-D1L5c7j7.js","/assets/PageAccess-DpNvDNyh.js","/assets/Pagination-MYn0wwXx.js","/assets/People-C2D1C6w0.js","/assets/PerenaladkaFactTable-CptY4IOH.js","/assets/Permissions-B-IlYr2k.js","/assets/PersonCard-BidCWfJA.js","/assets/PlanFulfillment-DqwgIq5Q.js","/assets/Production-CoCkSVQP.js","/assets/ProductionUpload-Clc26PFB.js","/assets/Profile-D64QKp6D.js","/assets/ProfileAvatar-y6CEVAXd.js","/assets/ProfilesManagement-B9wM1tEJ.js","/assets/ProofCamera-D-_H8Vjw.js","/assets/ProofPhoto-Bj1Usa6L.js","/assets/Quality-DdNRW1EH.js","/assets/RawRows-BeXo3vBs.js","/assets/Reports-C7z8Hgvx.js","/assets/RequestStateChip-Ct-dBqGx.js","/assets/RichTextEditor-BPvojTtc.js","/assets/SaveState-B7lN3ve_.js","/assets/SearchInput-DdfOmReT.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-D0yGi3TV.js","/assets/ShiftDaily-B5aLc0KO.js","/assets/ShiftTimes-vUyyY8XE.js","/assets/Staff-DBHVoeGR.js","/assets/StaffListAtCheck-BS18odQG.js","/assets/StatusBadge-BGt9I6fM.js","/assets/StatusBandsModal-Q2x3nOZG.js","/assets/TargetGoal-Cl0uncI2.js","/assets/Targets-JPu9EOxJ.js","/assets/Tasks-DTye-gue.js","/assets/TgProfile-QNZnln-n.js","/assets/TimeWheelPicker-DXlacipk.js","/assets/Tooltip-CNZ_1b-a.js","/assets/TranslationsEditor-EHZD0TKu.js","/assets/TrelloAnalytics-CP-1U4Gp.js","/assets/TrelloSettings-Cofptm4W.js","/assets/TrendChart-sSSCgCRz.js","/assets/TripleSpeedometer-BTh06LNP.js","/assets/Trudoyomkost-BtzBWj7b.js","/assets/UploadDropzone-CbWysK0W.js","/assets/UsersActivity-BcHMUD61.js","/assets/UsersManagement-BJdkL-gf.js","/assets/VerdictBlock-Bzo97pS0.js","/assets/VerifixParity-DBhpKXuL.js","/assets/VerifixSettings-DKpLcaj9.js","/assets/VerifixSync-BONqWwmM.js","/assets/VfxApiMap-CkIbVCDo.js","/assets/VfxDictionaries-DSkmd-yg.js","/assets/VfxEmployees-CpmbxU6P.js","/assets/VfxHrMoves-DKw30ypp.js","/assets/VfxJobs-B8YYnxWy.js","/assets/VfxPhoto-CkGpOuxZ.js","/assets/VfxShifts-CiXm1wSR.js","/assets/VfxState-CCFEXGta.js","/assets/VfxTimebooks-33PAgues.js","/assets/VfxTimesheet-CfyI7DeL.js","/assets/WatchProgress-BmAFYihO.js","/assets/WebLogin-K5UWyYXx.js","/assets/WorkersAttendance-De7VeS2S.js","/assets/WorkersComposition-DT1SaLil.js","/assets/WorkersMovements-BboVvG-m.js","/assets/WorkersPage-BJedCEzj.js","/assets/Zagruzka-alUdw_3z.js","/assets/ZagruzkaCell-COZc2pJy.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BK2g5QTa.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-DKV3hUP9.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CZZwxB6C.js","/assets/broadcastTree-BD2Meify.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-CyzGep9b.js","/assets/cellMoveRefusal-BoTrgUfN.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CIlJI8sa.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-pZ2J50DQ.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BgYXCb1A.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DNFrLejd.js","/assets/index-duS00f3X.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CzXR8XIG.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CNQPiXTB.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DbPSd5CO.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-DFMFC__T.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-BHcr-DuT.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-NwfKMZR8.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-Bk3u2q71.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DOblRgxT.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-B7A9GyPC.js","/assets/useMutation-B_nrwElL.js","/assets/useOpenParam-yVTNzOl1.js","/assets/useStatusBands-ChjeKrqL.js","/assets/useUrlScope-PbYxlFDI.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BwycUFlq.js","/assets/uz_cyrl-DFZhAfWn.js","/assets/vfx-FRrSw-XP.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-CABycR80.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
