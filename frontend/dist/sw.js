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

const BUILD = "2026-11-07T09:12:59.827Z";
const PRECACHE = ["/","/assets/ActionHistory-DH0PVmO5.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-BRNaawf_.js","/assets/AiKeys-CaFlcZo2.js","/assets/AnalysisBoard-B41T6MHy.js","/assets/AppLauncher-BFpd6-TM.js","/assets/Arc-CukixGdr.js","/assets/Assessment-CjIjGFzn.js","/assets/AssessmentGrade-CxJVdTjL.js","/assets/AssessmentList-CjG6Q9qV.js","/assets/Assistant-DPKn2NgO.js","/assets/AttendanceCleanup-Ec_syj9k.js","/assets/AttendanceUpload-gdbIX4TC.js","/assets/AuditTable-Cl-Sj-Fw.js","/assets/BrigadirProfile-CP6fIjE9.js","/assets/BrigadirsKpi-vU0Jrvvv.js","/assets/Broadcast-9ORKw0BG.js","/assets/BroadcastReceivers-H1SAKliq.js","/assets/BroadcastRecord-LoUOJMVR.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-CZA2YT_L.js","/assets/CategoryLegendModal-BKHpCVMg.js","/assets/CellConcerns-CE1F_bbl.js","/assets/CellDetails-D-8ZlPqU.js","/assets/CellFormModal-CKFPczn0.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-Cf1XUV5_.js","/assets/Cells-BOQC5R2X.js","/assets/ColumnFilter-Znv1gVDx.js","/assets/ColumnsPicker-D4TJ0e17.js","/assets/CommentsModal-BxtZ2meR.js","/assets/ComparisonTable-Cpczd-zM.js","/assets/Concerns-ByM0XlkF.js","/assets/ConcernsPieces-fNXM6h6l.js","/assets/CountStepper-ChT9tOBu.js","/assets/Daily-J32LQ4Sl.js","/assets/DataSources-zS7PvrVa.js","/assets/DataTable-DSFiKA-g.js","/assets/DateRangePicker-BizMEV7k.js","/assets/DayReportView-BCaMNaYe.js","/assets/DayStepper-cQFQHj7G.js","/assets/DayStrip-C6FMe6pl.js","/assets/DbBackup-BlckEBoz.js","/assets/DifferenceBreakdown-t3-i2lLS.js","/assets/DocAudit-BTzVDm8J.js","/assets/Downtime-Bh4x1xUz.js","/assets/Education-E7J6KHzz.js","/assets/EducationLesson-D2NbvRiv.js","/assets/EmptyState-C7EEUoz_.js","/assets/Exam-DJ0ExdQt.js","/assets/ExamAdmin-DVOsz_lk.js","/assets/Factories-V_UmjOjc.js","/assets/FactorySelect-DXxYJ4Jp.js","/assets/Gamification-Bvzlu24y.js","/assets/GroupBadge-CCUtrg4t.js","/assets/HeatmapChart-cjZ8s5Fd.js","/assets/IdleCell-ClkH7wio.js","/assets/IdleOwners-D8HumvG2.js","/assets/IdleSolutions-B6tO1f7E.js","/assets/IdleSource-CBWGLcHS.js","/assets/KPICard-CAedxw-a.js","/assets/Kaizen-Du07Vzvd.js","/assets/Kelish-CKh7hdFy.js","/assets/KpiBits-CQiBW0s7.js","/assets/KpiDeltaCard-s2ySXpU1.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-DOAucgs_.js","/assets/LeaderAppeal-BvHp51Zy.js","/assets/LeaderCutoffs-BFDjZyMP.js","/assets/LeaderDailyTasks-0fXPtuTo.js","/assets/LeaderDayExclusions-D3c0rzDy.js","/assets/LeaderDayReport-BI0HTtjQ.js","/assets/LeaderTasksAdmin-WnBnjvp-.js","/assets/LeaderUnitReport-CUSiGmPi.js","/assets/Leaderboard-DjAoADyi.js","/assets/Leaders-BGP4REyp.js","/assets/LeadersKpi-BwLlMqEK.js","/assets/Lightbox-BmBoYCTS.js","/assets/LiveOverview-TNAfGSuW.js","/assets/Login-LaeMbDVS.js","/assets/Logs-BJPV31cJ.js","/assets/LostWorkers-D4QH3a79.js","/assets/NotFound-Coiua8Od.js","/assets/Notifications-BFYQ6QwD.js","/assets/NotionTasks-DrApKYEV.js","/assets/NotionTrackerSettings-Dq5o4jnZ.js","/assets/Ontime-DVQ2Wefx.js","/assets/Ovens-CVx64HbT.js","/assets/OvensSettings-DOw1zNCW.js","/assets/Overview-DcYY0xK6.js","/assets/OwnerChip-Fxgk6qsa.js","/assets/PageAccess-CLCAP9QU.js","/assets/Pagination-B3lrT1EF.js","/assets/People-DQDs2HnI.js","/assets/PerenaladkaFactTable-CGjWs4lf.js","/assets/Permissions-ifHAB7IT.js","/assets/PersonCard-CvrksQVx.js","/assets/PlanFulfillment-BEGR0aKX.js","/assets/Production-bdA3kf7-.js","/assets/ProductionUpload-DD0epZJ4.js","/assets/Profile-CfKGWGL-.js","/assets/ProfileAvatar-D0O3HAF6.js","/assets/ProfilesManagement-X80fdf8T.js","/assets/ProofCamera-C4xOS_c4.js","/assets/ProofPhoto-BHE74mau.js","/assets/Quality-B4Mf0Dxj.js","/assets/RawRows-Cx1jfShr.js","/assets/Reports-CGbkwW6S.js","/assets/RequestStateChip-BOopcMbQ.js","/assets/RichTextEditor-DGWYpuB7.js","/assets/SaveState-BZvIRBe0.js","/assets/SearchInput-CDew58Wt.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-DEAq8T5B.js","/assets/ShiftDaily-C5EJ3TOD.js","/assets/ShiftTimes-CDChxTgI.js","/assets/Staff-jOArypwt.js","/assets/StaffListAtCheck-BouPobeA.js","/assets/StatusBadge-C2XcjicS.js","/assets/StatusBandsModal-Db5Iy_4j.js","/assets/TargetGoal-pEDnOIXh.js","/assets/Targets-33AlbdgC.js","/assets/Tasks-DoD7rAwr.js","/assets/TimeWheelPicker-DIHbySxU.js","/assets/Tooltip-2Z9sQBLj.js","/assets/TranslationsEditor-D2kBmb7P.js","/assets/TrelloAnalytics-bhvwx8pe.js","/assets/TrelloSettings-DkKi1EtY.js","/assets/TrendChart-s9OJWjQZ.js","/assets/TripleSpeedometer-QnO7uxrK.js","/assets/Trudoyomkost-Br622CMy.js","/assets/UploadDropzone-Cmeq3U3d.js","/assets/UsersActivity-Wwq9PBHH.js","/assets/UsersManagement-OrAHeeOS.js","/assets/VerdictBlock-BfWtIZpK.js","/assets/VerifixParity-CXY5ZKwz.js","/assets/VerifixSettings-D1wz7au8.js","/assets/VerifixSync-CX6qWC0x.js","/assets/VfxApiMap-B9WFAGx5.js","/assets/VfxDictionaries-CUAvyrL5.js","/assets/VfxEmployees-CR0rq9f-.js","/assets/VfxHrMoves-BvE7U3xo.js","/assets/VfxJobs-qWTPriZi.js","/assets/VfxPhoto-Bry95K2V.js","/assets/VfxShifts-tcLE1mYk.js","/assets/VfxState-7u0FMHMb.js","/assets/VfxTimebooks-Ck0Ftq15.js","/assets/VfxTimesheet-DHnF7Bqy.js","/assets/WatchProgress-DlCBH_0Q.js","/assets/WebLogin-BVCAMELF.js","/assets/WorkersAttendance-DuEPOZ6V.js","/assets/WorkersComposition-CJ1-4VxS.js","/assets/WorkersMovements-D_HQPead.js","/assets/WorkersPage-bBstaFfV.js","/assets/Zagruzka-BzA9P49O.js","/assets/ZagruzkaCell-D5jjSY5W.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CWkfzJBy.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-T-266KY1.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Pbz-5S15.js","/assets/broadcastTree-Dl2Fn4SA.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-CGvDz2FR.js","/assets/cellMoveRefusal-BL5W7K9F.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BH57H3P-.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-BXVQxH8O.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-C3aEz4st.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-C6hILaVj.js","/assets/index-CQ_bKaeC.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-AqsEtNea.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BMuS8JVU.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-BwaFgOV2.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BBtYo5K7.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CSyp0k3f.js","/assets/ru-Bad0hQnd.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-DGLJdqeI.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CUOblr1w.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-DzrnDRsB.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DYkVol7Z.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DLTAGUZv.js","/assets/useMutation-BARELI6t.js","/assets/useOpenParam-E49sw_fJ.js","/assets/useStatusBands-B0p8W1PN.js","/assets/useUrlScope-BRAwhOwX.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-CtJPVd-N.js","/assets/uz_cyrl-D9zRxxUU.js","/assets/vfx-DSuGUKOi.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-ChxQ5Yqr.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
