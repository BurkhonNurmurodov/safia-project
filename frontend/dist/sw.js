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

const BUILD = "2026-11-06T15:14:57.169Z";
const PRECACHE = ["/","/assets/ActionHistory-B9DZr0sP.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-Xio7coe1.js","/assets/AiKeys-iWxeK4-l.js","/assets/AnalysisBoard-XPMLbgMX.js","/assets/AppLauncher-DvJSov9o.js","/assets/Arc-CcLQ_kEr.js","/assets/Assessment-B0TcRUmc.js","/assets/AssessmentGrade-KrzgymOZ.js","/assets/AssessmentList-BVa03wuN.js","/assets/Assistant-C8rIB_xT.js","/assets/AttendanceCleanup-i2twEIjk.js","/assets/AttendanceUpload-V7C6zTpo.js","/assets/AuditTable-DYtEc583.js","/assets/BrigadirProfile-BOO37RmH.js","/assets/BrigadirsKpi-CsJGEFFO.js","/assets/Broadcast-CBKa_MXJ.js","/assets/BroadcastReceivers-BTykfvVy.js","/assets/BroadcastRecord-elivWDZ8.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-DGeMSLuq.js","/assets/CategoryLegendModal-B6xBTTAs.js","/assets/CellConcerns-B07xnV5E.js","/assets/CellDetails-DiwosRjd.js","/assets/CellFormModal-qZDSl8Lx.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-B6nHKvBg.js","/assets/Cells-CcurekCg.js","/assets/ColumnFilter-DHmiKmRB.js","/assets/ColumnsPicker-BgpyowpR.js","/assets/CommentsModal-3A06MzCI.js","/assets/ComparisonTable-0LLn3iFD.js","/assets/Concerns-C1uu8nBD.js","/assets/ConcernsPieces-S1Qo1R3I.js","/assets/CountStepper-CLvVFTr2.js","/assets/Daily-5JZD8zLF.js","/assets/DataSources-C0h7qVsg.js","/assets/DataTable-Cw88-hei.js","/assets/DateRangePicker-DMja6YFB.js","/assets/DayReportView-1N4tvWL2.js","/assets/DayStepper-DB7TYS5q.js","/assets/DayStrip-_p83pTjG.js","/assets/DbBackup-Bm6aUmsG.js","/assets/DifferenceBreakdown-C7_78byJ.js","/assets/DocAudit-DbXPW595.js","/assets/Downtime-CZfsIfes.js","/assets/Education-1jQXCqVC.js","/assets/EducationLesson-B-XObmHs.js","/assets/EmptyState-9cpZKhh7.js","/assets/Exam-MhfU4dSB.js","/assets/ExamAdmin-CpqUs3dX.js","/assets/Factories-0jMjcWqw.js","/assets/FactorySelect-BeKZUxwj.js","/assets/Gamification-BI0gkel0.js","/assets/GroupBadge-BOSl1_5e.js","/assets/HeatmapChart-Yqk6pzll.js","/assets/IdleCell-fmkwOll6.js","/assets/IdleOwners-r7g5P1HY.js","/assets/IdleSolutions-D1JpIn-s.js","/assets/IdleSource-7kxsVRkM.js","/assets/KPICard-Dk48MtJC.js","/assets/Kaizen-DeflC59q.js","/assets/Kelish-DWikdc3S.js","/assets/KpiBits-BVIM0eip.js","/assets/KpiDeltaCard-0j_jZump.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-CrNu8LmM.js","/assets/LeaderAppeal-CWrzXuJY.js","/assets/LeaderCutoffs-BfuYf01N.js","/assets/LeaderDailyTasks-Cayb3_cD.js","/assets/LeaderDayExclusions-DuiOh2Pf.js","/assets/LeaderDayReport-Cnv-pTL9.js","/assets/LeaderTasksAdmin-BqfMZb1Z.js","/assets/LeaderUnitReport-Bkk7TrYI.js","/assets/Leaderboard-C-OHLqsX.js","/assets/Leaders-CNBihoA2.js","/assets/LeadersKpi-CnRCpLKT.js","/assets/Lightbox-C6q5zSJS.js","/assets/LiveOverview-UX9iAqow.js","/assets/Login-DcuLFRc6.js","/assets/Logs-CVPwVljv.js","/assets/LostWorkers-DE568wxn.js","/assets/NotFound-CSYa-Y-L.js","/assets/Notifications-5cVXJZGs.js","/assets/NotionTasks-DSGWvwK4.js","/assets/NotionTrackerSettings-ue_mfFmt.js","/assets/Ontime-JJdTsHVs.js","/assets/Ovens-ExaNrOd-.js","/assets/OvensSettings-BEXoOTas.js","/assets/Overview-GrPiX_d3.js","/assets/OwnerChip-BJid40wk.js","/assets/PageAccess-Cpj5rJn0.js","/assets/Pagination-Db4GnwlK.js","/assets/People-CWfrAseu.js","/assets/PerenaladkaFactTable-CT6Eshry.js","/assets/Permissions-CdtwQyAE.js","/assets/PersonCard-Ba6_CBm-.js","/assets/PlanFulfillment-ByA9aAHu.js","/assets/Production-dA_S8ug4.js","/assets/ProductionUpload-CKVxkAs-.js","/assets/Profile-C-cMIk1I.js","/assets/ProfileAvatar-DkD6IvAZ.js","/assets/ProfilesManagement-D0oJ1RMW.js","/assets/ProofCamera-Ba110-dw.js","/assets/ProofPhoto-CxShbz6U.js","/assets/Quality-C5JS0_uL.js","/assets/RawRows-CRMNeaVA.js","/assets/Reports-0qynkY_w.js","/assets/RequestStateChip-vQ8sgpo1.js","/assets/RichTextEditor-u2odJaFD.js","/assets/SaveState-DQlxHtfw.js","/assets/SearchInput-BfBaLHdf.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-BdSP-k4_.js","/assets/ShiftDaily-Db4fyzGM.js","/assets/ShiftTimes-D-5Uw2ph.js","/assets/Staff-B1AKzWtO.js","/assets/StaffListAtCheck-CJt3EHKZ.js","/assets/StatusBadge-CuDLPn84.js","/assets/StatusBandsModal-sV9uQAcU.js","/assets/TargetGoal-BuMI3iEp.js","/assets/Targets-CfXiXfkC.js","/assets/Tasks-KclnRIUD.js","/assets/TimeWheelPicker-Cwo4UQVj.js","/assets/Tooltip-CE2pVreZ.js","/assets/TranslationsEditor-NlKqr7hj.js","/assets/TrelloAnalytics-QoKto8Ts.js","/assets/TrelloSettings-BLgN9g7l.js","/assets/TrendChart-BvoOaOfR.js","/assets/TripleSpeedometer-BNmX5V7x.js","/assets/Trudoyomkost-Y2_KdGL-.js","/assets/UploadDropzone-00isFtxW.js","/assets/UsersActivity-OEghb_My.js","/assets/UsersManagement-D_UwfIna.js","/assets/VerdictBlock-CeMvayxt.js","/assets/VerifixParity-C6LgodOR.js","/assets/VerifixSettings-JbcHz1cc.js","/assets/VerifixSync-D-gvV9BK.js","/assets/VfxApiMap-DyxzaBrW.js","/assets/VfxDictionaries-DBkTmS5d.js","/assets/VfxEmployees-Ka7BTXjn.js","/assets/VfxHrMoves-Cg_c69HM.js","/assets/VfxJobs-C-qZi3gO.js","/assets/VfxPhoto-Cu7Ukc-j.js","/assets/VfxShifts-Dnkr05dR.js","/assets/VfxState-Bxcx9xk4.js","/assets/VfxTimebooks-BoInHwpr.js","/assets/VfxTimesheet-C9-WIzaR.js","/assets/WatchProgress-DjXSeLKe.js","/assets/WebLogin-r-D5kSoC.js","/assets/WorkersAttendance-DnFVzWix.js","/assets/WorkersComposition-Bwbn-3xg.js","/assets/WorkersMovements-BLmJ2kuH.js","/assets/WorkersPage-S9YRadSB.js","/assets/Zagruzka-mL2128fF.js","/assets/ZagruzkaCell-BDHsHRHp.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CulCUVMx.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BueomVx2.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DxI0tcqH.js","/assets/broadcastTree-BybrWTne.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DMm-lFQR.js","/assets/cellMoveRefusal-DX4_e2_5.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DI46P2IH.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-CgzYJL-5.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-3YQqAGuM.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-COSWaPAZ.css","/assets/index-DHQxX352.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-uKyUmVH7.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-C0P5GM3Y.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-BwaFgOV2.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BkH_GsXr.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CSyp0k3f.js","/assets/ru-j2ae1TZz.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-OU6u4pti.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-BWyLP5Be.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-DzrnDRsB.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DPAK38s-.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DhLMGQ_H.js","/assets/useMutation-C8ylHA2b.js","/assets/useOpenParam-MJ-LQFwU.js","/assets/useStatusBands-DXVkfzd1.js","/assets/useUrlScope-Bq1TID6i.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-D-rwQZr1.js","/assets/uz_cyrl-D3oH58H7.js","/assets/vfx-C2naSvC5.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-R12N9My0.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
