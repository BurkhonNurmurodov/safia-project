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

const BUILD = "2026-11-12T06:57:36.821Z";
const PRECACHE = ["/","/assets/ActionHistory-CU9BdDmc.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-90vFF7Vc.js","/assets/AiKeys-4KwJDHVK.js","/assets/AnalysisBoard-sVn36YJu.js","/assets/ApiAccess-kWo4Zutz.js","/assets/AppLauncher-B8PSq5O0.js","/assets/Arc-CQ_h_Ox-.js","/assets/Assessment-XTvScr3t.js","/assets/AssessmentGrade-DeB7IGal.js","/assets/AssessmentList-jDFddpW7.js","/assets/Assistant-CHjTPS_I.js","/assets/AttendanceCleanup-rn5bhs3Y.js","/assets/AttendanceUpload-DUngA_jt.js","/assets/AuditTable-GlkTlLoa.js","/assets/BrigadirProfile-D2rTFZ-M.js","/assets/BrigadirsKpi-CnswKJjO.js","/assets/Broadcast-D-mLI-R0.js","/assets/BroadcastReceivers-CRTxWcXO.js","/assets/BroadcastRecord-BYD97zLr.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-DgFm6vlp.js","/assets/CategoryLegendModal-1-2JrdCy.js","/assets/CellConcerns-DToZPbkE.js","/assets/CellDetails-9dobykO8.js","/assets/CellFormModal-DMn1rehV.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-CaZsw3Gy.js","/assets/Cells-GJzZl7Ke.js","/assets/ColumnFilter-CpZaytd0.js","/assets/ColumnsPicker-cdr070j-.js","/assets/CommentsModal-CY-j3BMk.js","/assets/ComparisonTable-6AXKfI31.js","/assets/Concerns-ByVI4FxR.js","/assets/ConcernsPieces-D0VyjP93.js","/assets/CountStepper-m4DoJFdJ.js","/assets/Daily-C9YwhAvw.js","/assets/DataSources-CyZmNHdN.js","/assets/DataTable-BgXqEGrp.js","/assets/DateRangePicker-qldvNFWf.js","/assets/DayReportView-Dr7lrWmH.js","/assets/DayStepper-BzMq7R8V.js","/assets/DayStrip-ogPVlNEm.js","/assets/DbBackup-CwxXHaxP.js","/assets/DifferenceBreakdown-CVfzqzPc.js","/assets/DocAudit-C4erI6dm.js","/assets/Downtime-C-8Gxxgq.js","/assets/Education-BFpox2xx.js","/assets/EducationLesson-DkmYK8s5.js","/assets/EmptyState-NNBss75-.js","/assets/Exam-DlAxoE8J.js","/assets/ExamAdmin-Dtv594EA.js","/assets/Factories-Dmgwthdr.js","/assets/FactorySelect-BH0biOVg.js","/assets/Gamification-BxtPC6mY.js","/assets/GroupBadge-D32j-J7q.js","/assets/HeatmapChart-CCAtjXBe.js","/assets/IdleCell-BRAe_FmX.js","/assets/IdleOwners-BKOYsq6q.js","/assets/IdleSolutions-D-9yYa1X.js","/assets/IdleSource-fEmAsIIa.js","/assets/KPICard-CgmWRstA.js","/assets/Kaizen-DcAB50ss.js","/assets/Kelish-3r17XZIo.js","/assets/Kitchen-ChR-RiUk.js","/assets/KpiBits-9SUSu159.js","/assets/KpiDeltaCard-o05MfPCz.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-Czc4kXyN.js","/assets/LeaderAppeal-enprx0rg.js","/assets/LeaderCutoffs-Hl3avctO.js","/assets/LeaderDailyTasks-DGI6aY-s.js","/assets/LeaderDayExclusions-DMY4t_xN.js","/assets/LeaderDayReport-CWm13N-C.js","/assets/LeaderTasksAdmin-BS9F7AL5.js","/assets/LeaderUnitReport-DzRVxqFc.js","/assets/Leaderboard-CNPcKzcI.js","/assets/Leaders-ZCmSIqIa.js","/assets/LeadersKpi-nrLWSa3s.js","/assets/Lightbox-CsDQ2bQu.js","/assets/LiveOverview-B1tiE923.js","/assets/Login-COs7PfnU.js","/assets/Logs-CqxRkMkp.js","/assets/LostWorkers-DxlS3uN3.js","/assets/NotFound-Bo7FzsYi.js","/assets/Notifications-BS1lqRoX.js","/assets/NotionTasks-DIWInn_A.js","/assets/NotionTrackerSettings-D_Y-zHmw.js","/assets/Ontime-CUaAbHhE.js","/assets/Ovens-DPZDGWR9.js","/assets/OvensSettings-DZP3I-vH.js","/assets/Overview-B8szh4AI.js","/assets/OwnerChip-Dd5z5wOl.js","/assets/PageAccess-Dc13cceA.js","/assets/Pagination-DyTtbQgw.js","/assets/People--YQIrLyF.js","/assets/PerenaladkaFactTable-DgvioMq7.js","/assets/Permissions-BjUaGpgn.js","/assets/PersonCard-DQTyrtUl.js","/assets/PlanFulfillment-BAHk-AhV.js","/assets/Production-UyGK-GP0.js","/assets/ProductionUpload-BHkPO0Zk.js","/assets/Profile-DhrJb2F6.js","/assets/ProfileAvatar-CELkND3W.js","/assets/ProfilesManagement-DJr08ZkM.js","/assets/ProofCamera-RmLOM5Li.js","/assets/ProofPhoto-BEssC8Rh.js","/assets/Quality-COFeR26I.js","/assets/RawRows-DwAc8yD9.js","/assets/Reports-k823I4zr.js","/assets/RequestStateChip-BximUjLc.js","/assets/RichTextEditor-DdQdIKhY.js","/assets/SaveState-WfUanKax.js","/assets/SearchInput-BJYdj2-F.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-Ci6Bp6Hy.js","/assets/ShiftDaily-C7dUkDlp.js","/assets/ShiftTimes-BJarkZLV.js","/assets/Staff-BP1X28U8.js","/assets/StaffListAtCheck-DeCKXTG8.js","/assets/StatusBadge-C8ItcuGZ.js","/assets/StatusBandsModal-Bjr-nmBv.js","/assets/TargetGoal-BKRAy1Zg.js","/assets/Targets-B1ZMhyoC.js","/assets/TaskerSettings-Ct1EckfT.js","/assets/Tasks-_onbxxfd.js","/assets/TgProfile-DtISbJtp.js","/assets/TimeWheelPicker-snuAWnS4.js","/assets/Tooltip-DiZA-svN.js","/assets/TranslationsEditor-BnqfNOgn.js","/assets/TrelloAnalytics-DfT3Dhc4.js","/assets/TrelloSettings-BhgDuXAd.js","/assets/TrendChart-x80Ci5Ux.js","/assets/TripleSpeedometer-CtwRLO8K.js","/assets/Trudoyomkost-DCR7fz57.js","/assets/UploadDropzone-D1J6uSWU.js","/assets/UsersActivity-xhYd_0HP.js","/assets/UsersManagement-Bm6le6Bu.js","/assets/VerdictBlock-BU3NVQTx.js","/assets/VerifixParity-D_3PGFdU.js","/assets/VerifixSettings-ClTL05ea.js","/assets/VerifixSync-dTjajUWn.js","/assets/VfxApiMap-DTmWoNJB.js","/assets/VfxDictionaries-4GEhh_H9.js","/assets/VfxEmployees-CjHfZcME.js","/assets/VfxHrMoves-CXteDtXg.js","/assets/VfxJobs-BRtuT-rv.js","/assets/VfxPhoto-BPrMqwHk.js","/assets/VfxShifts-CTGuCc-O.js","/assets/VfxState-sVURxXxY.js","/assets/VfxTimebooks-ZMZTmJKb.js","/assets/VfxTimesheet-iWZVdGB3.js","/assets/WatchProgress-Cu0vNcQ8.js","/assets/WebLogin-DtzMJjB1.js","/assets/WorkersAttendance-iJlRKGLj.js","/assets/WorkersComposition-C4dwNenE.js","/assets/WorkersMovements-gDd9fS7L.js","/assets/WorkersPage-BRPJlgjJ.js","/assets/Zagruzka-B8XtpCcD.js","/assets/ZagruzkaCell-DhFQFYSY.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BfdWWNbb.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-C3nFXWqV.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-B8KkoMN4.js","/assets/broadcastTree-_vKilwGm.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-CeXPmD4f.js","/assets/cellMoveRefusal-DuaRmxvi.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DWURyWu5.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-DTFZsy1t.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CsvCc1sK.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BI6dOXnA.js","/assets/index-CQKKTnLI.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-D08JeYMz.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CfFHvzu4.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CPae6ZDe.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-Z4JkU4NO.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BduuCFVJ.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-BMHRS9yi.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-BIN9VTCz.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BhPuoAIW.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-Bh2rRFnS.js","/assets/useMutation-DjPs0mlp.js","/assets/useOpenParam-CHAxvyyA.js","/assets/useStatusBands-Bq5i1vP7.js","/assets/useUrlScope-BHKm0ALu.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-qzlwU03o.js","/assets/uz_cyrl-B7AXm0Kc.js","/assets/vfx-D3lbEPXn.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-Ssi4R-vd.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
