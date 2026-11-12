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

const BUILD = "2026-11-12T06:33:03.959Z";
const PRECACHE = ["/","/assets/ActionHistory-C0Kix4v6.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-CVSWJ4EY.js","/assets/AiKeys-a7KGEJof.js","/assets/AnalysisBoard-BXSAe-pK.js","/assets/ApiAccess-uiFtupOe.js","/assets/AppLauncher-DAIpv-1V.js","/assets/Arc-gd7Gao1c.js","/assets/Assessment-rhU6KlJo.js","/assets/AssessmentGrade-yVOHG2eO.js","/assets/AssessmentList-BEWKqQ-A.js","/assets/Assistant-CTXzhWcP.js","/assets/AttendanceCleanup-06q-4g-Y.js","/assets/AttendanceUpload-BCm7NOTm.js","/assets/AuditTable-Gdk1sVtu.js","/assets/BrigadirProfile-DorhISd2.js","/assets/BrigadirsKpi-Br6btXfx.js","/assets/Broadcast-DpGIsz5v.js","/assets/BroadcastReceivers-Jeo4iZm0.js","/assets/BroadcastRecord-tFi_VKzR.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-Cptg8Jgf.js","/assets/CategoryLegendModal-DODFIM5t.js","/assets/CellConcerns-n2gYivvz.js","/assets/CellDetails-D6FcOx9f.js","/assets/CellFormModal-B5-kF62T.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-DMN-7y6p.js","/assets/Cells-DPP9LHtp.js","/assets/ColumnFilter-Dp6EtUgO.js","/assets/ColumnsPicker-DwOZkx-7.js","/assets/CommentsModal--wEHs74n.js","/assets/ComparisonTable-F6CmUva9.js","/assets/Concerns-CvnejTGr.js","/assets/ConcernsPieces-DODd82Y5.js","/assets/CountStepper-DaSGgIOQ.js","/assets/Daily-CZa2K45j.js","/assets/DataSources-Bzt4QP3z.js","/assets/DataTable-COMoOw-_.js","/assets/DateRangePicker-CdloAfVO.js","/assets/DayReportView-ZCae-1WO.js","/assets/DayStepper-DYwSRLqQ.js","/assets/DayStrip-C3rR7Fx9.js","/assets/DbBackup-DDd68nB9.js","/assets/DifferenceBreakdown-Bpv5tSfJ.js","/assets/DocAudit-DjS1tqkQ.js","/assets/Downtime-BRwY7vV-.js","/assets/Education-BujyDo8T.js","/assets/EducationLesson-B-6BgAjG.js","/assets/EmptyState-G7yjPipx.js","/assets/Exam-CH_lI48P.js","/assets/ExamAdmin-Cna30dgq.js","/assets/Factories-Be7zeOq9.js","/assets/FactorySelect-Cgq0hjfH.js","/assets/Gamification-KLxlwtNW.js","/assets/GroupBadge-noEP3Ogd.js","/assets/HeatmapChart-D-7sVxkD.js","/assets/IdleCell-lLI75XWM.js","/assets/IdleOwners-C42z3oQy.js","/assets/IdleSolutions-BjCtxWtp.js","/assets/IdleSource-B3gNbJdC.js","/assets/KPICard-C-cdwVVq.js","/assets/Kaizen-BArtXjB-.js","/assets/Kelish-CfRdzXi5.js","/assets/KpiBits-ChV5DlXQ.js","/assets/KpiDeltaCard-DTJX4NKD.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-q9g1-Oif.js","/assets/LeaderAppeal-B8G0J_pP.js","/assets/LeaderCutoffs-DmCbV4YO.js","/assets/LeaderDailyTasks-D59PnycF.js","/assets/LeaderDayExclusions-DhVaWJPY.js","/assets/LeaderDayReport-Brr2W6Fk.js","/assets/LeaderTasksAdmin-CaKiK763.js","/assets/LeaderUnitReport-BEzVJ1IE.js","/assets/Leaderboard-DecifUXJ.js","/assets/Leaders-BfdgW7wm.js","/assets/LeadersKpi-CWGrKf32.js","/assets/Lightbox-mzc8Uo8d.js","/assets/LiveOverview-Dkk9fn2L.js","/assets/Login-Bn0HQUse.js","/assets/Logs-DCuCprON.js","/assets/LostWorkers-DDgUJsG_.js","/assets/NotFound-DS5D9Ckc.js","/assets/Notifications-BO1jL2xw.js","/assets/NotionTasks-4AgoEwJP.js","/assets/NotionTrackerSettings-BAaiDIuE.js","/assets/Ontime-Dc3hqXH8.js","/assets/Ovens-DT945Tud.js","/assets/OvensSettings-C3tDf7Yz.js","/assets/Overview-Ce0Hy7kJ.js","/assets/OwnerChip-CAFNdnV1.js","/assets/PageAccess-Mg-4CaPU.js","/assets/Pagination-BkXq6InW.js","/assets/People-B_IlcTsN.js","/assets/PerenaladkaFactTable-BUlHPAIT.js","/assets/Permissions-BFYR-IyH.js","/assets/PersonCard-BkNumHjk.js","/assets/PlanFulfillment-B9eTYgD1.js","/assets/Production-B5vR5EKY.js","/assets/ProductionUpload-DRqOnNr0.js","/assets/Profile-BVuHRz_j.js","/assets/ProfileAvatar-D1Vm8Q5V.js","/assets/ProfilesManagement-BBGGf0DP.js","/assets/ProofCamera-DgGmF5QH.js","/assets/ProofPhoto-Dr2NX-ns.js","/assets/Quality-_miMb2KT.js","/assets/RawRows-YF0Veiqw.js","/assets/Reports-C01NFBAr.js","/assets/RequestStateChip-Bkx4Uw7s.js","/assets/RichTextEditor-BbXvdNh-.js","/assets/SaveState-CM-DYW92.js","/assets/SearchInput-DlhsLXre.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-DOyNljpq.js","/assets/ShiftDaily-Blkt-lT_.js","/assets/ShiftTimes-CbJMW52n.js","/assets/Staff-uwg64YJy.js","/assets/StaffListAtCheck-YpGkNN4J.js","/assets/StatusBadge-CA4O3Sfx.js","/assets/StatusBandsModal-g2F5hrvg.js","/assets/TargetGoal-CKIbrvWb.js","/assets/Targets-3WD1vb86.js","/assets/TaskerSettings-DE1s6QK2.js","/assets/Tasks-BOZXU0yF.js","/assets/TgProfile-C8Y3tAY-.js","/assets/TimeWheelPicker-CLEFMjHX.js","/assets/Tooltip-DzV4HpBv.js","/assets/TranslationsEditor-BZ9QlyfC.js","/assets/TrelloAnalytics-DQnICEIq.js","/assets/TrelloSettings-BKARyIHD.js","/assets/TrendChart-BI6RbweQ.js","/assets/TripleSpeedometer-WCibUVNh.js","/assets/Trudoyomkost-CSb2KuwU.js","/assets/UploadDropzone-DV6cWDQP.js","/assets/UsersActivity-n6qXHidp.js","/assets/UsersManagement-DgFqiP9p.js","/assets/VerdictBlock-CPl_zE6_.js","/assets/VerifixParity-DqO0fV0c.js","/assets/VerifixSettings-Ciucv7Tu.js","/assets/VerifixSync-CY7voJQL.js","/assets/VfxApiMap-D3xwxO_b.js","/assets/VfxDictionaries-BhLWKcUr.js","/assets/VfxEmployees-CCPxR7Oy.js","/assets/VfxHrMoves-CmrIU9V7.js","/assets/VfxJobs-F8p6J5Df.js","/assets/VfxPhoto-CfiVO9Qo.js","/assets/VfxShifts-BX-bPqbt.js","/assets/VfxState-CGXoSUO4.js","/assets/VfxTimebooks-BGtPly0x.js","/assets/VfxTimesheet-CrjQu5cK.js","/assets/WatchProgress-ILLFQYzI.js","/assets/WebLogin-DyRP2eSp.js","/assets/WorkersAttendance-C_wUHrlS.js","/assets/WorkersComposition-BRGU_Fv7.js","/assets/WorkersMovements-EpVyX_Wq.js","/assets/WorkersPage-DJq1k0ys.js","/assets/Zagruzka-CZb81p9N.js","/assets/ZagruzkaCell-BLl_2JyI.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BThRpYr8.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-D0hrpRBX.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CPPbm9ON.js","/assets/broadcastTree-DiGpZmFk.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-C9vmgyRp.js","/assets/cellMoveRefusal-BBnmCnRE.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BFB8rB2S.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-CpPwgLBu.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-B0dUoRtp.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-ANBGiabX.js","/assets/index-wrGK6Zf-.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-D9mLqndF.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BMzJrsBV.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DWi0BujK.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-Dj9gbQj8.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CWEapl5e.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-c4hI7KYL.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-BIN9VTCz.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DYfeeI0V.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-Cwxl3yQH.js","/assets/useMutation-CABAsUGF.js","/assets/useOpenParam-kdqNSS0r.js","/assets/useStatusBands-ChZEzG4O.js","/assets/useUrlScope-BQiSQRiA.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-FA2e5BuF.js","/assets/uz_cyrl-BXNK4qGX.js","/assets/vfx-DBl6UJvm.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-DgBLo34F.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
