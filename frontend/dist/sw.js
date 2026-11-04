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

const BUILD = "2026-11-04T19:23:31.977Z";
const PRECACHE = ["/","/assets/ActionHistory-CHUjOrht.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-axHqvE7a.js","/assets/AiKeys-BGlgMqRI.js","/assets/AnalysisBoard-AWUyOy2m.js","/assets/AppLauncher-C5Q8AhFn.js","/assets/Arc-P2cz52va.js","/assets/Assessment-CvWiTo25.js","/assets/AssessmentGrade-BzQvWtuZ.js","/assets/AssessmentList-Dn4s5Z9y.js","/assets/Assistant-CZznhti9.js","/assets/AttendanceCleanup-CRj2SNP4.js","/assets/AttendanceUpload-CBg2ppkg.js","/assets/AuditTable-pIWuz54B.js","/assets/BrigadirProfile-MmbSsgWL.js","/assets/BrigadirsKpi-DXD8rSYx.js","/assets/Broadcast-BAuye_KD.js","/assets/BroadcastReceivers-Pxucg9EX.js","/assets/BroadcastRecord-qlaG62h6.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-CReYbt-W.js","/assets/CategoryLegendModal-CmWAiBwv.js","/assets/CellConcerns-DSXR2nq6.js","/assets/CellDetails-aZiQ_yGy.js","/assets/CellFormModal-CLCPn3oy.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-oywRTvhP.js","/assets/Cells-Dkx6Ylvq.js","/assets/ColumnFilter-EoGy1ahP.js","/assets/ColumnsPicker-C6J0nyXO.js","/assets/CommentsModal-CVlMhcWT.js","/assets/ComparisonTable-eYq2JbIN.js","/assets/Concerns-Xj1GBj2s.js","/assets/ConcernsPieces-SrIBBi0l.js","/assets/CountStepper-CXux5gui.js","/assets/Daily-CI1fA8X5.js","/assets/DataSources-DSNcaOXU.js","/assets/DataTable-DGa1Af8Z.js","/assets/DateRangePicker-jQAsrf63.js","/assets/DayReportView-CHuGnokc.js","/assets/DayStepper-CMPJqVeu.js","/assets/DayStrip-C9XIg9pb.js","/assets/DbBackup-ooGDXxly.js","/assets/DifferenceBreakdown-DZlY6pkX.js","/assets/DocAudit-CfgyO0p8.js","/assets/Downtime-qpXHmlwY.js","/assets/Education-BAo9Z09L.js","/assets/EducationLesson-C_pezPLq.js","/assets/EmptyState-BJUEbgyr.js","/assets/Exam-_gqJT7pZ.js","/assets/ExamAdmin-C-5CeY0G.js","/assets/Factories-CvzApz7q.js","/assets/FactorySelect-Dta6sIQf.js","/assets/Gamification-uahSccs-.js","/assets/GroupBadge-DAKN0UoI.js","/assets/HeatmapChart-DyO904c0.js","/assets/IdleCell-Duw5ycCT.js","/assets/IdleOwners-Dlh3Cp_e.js","/assets/IdleSolutions-C3EQTCLK.js","/assets/IdleSource-BEwS3xKw.js","/assets/KPICard-BkMGhlEM.js","/assets/Kaizen-DjedSs5z.js","/assets/Kelish-CKSmT33K.js","/assets/KpiBits-CGScXrQU.js","/assets/KpiDeltaCard-CXm1Amwy.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-9dQNux_1.js","/assets/LeaderAppeal-gkDxOb7a.js","/assets/LeaderCutoffs-Dk6WcycA.js","/assets/LeaderDailyTasks-Cg6RmZnJ.js","/assets/LeaderDayExclusions-DdH0eAAU.js","/assets/LeaderDayReport-CVM6g9QZ.js","/assets/LeaderTasksAdmin-DBThGQTm.js","/assets/LeaderUnitReport-BkYwoSml.js","/assets/Leaderboard-DYyvPKfJ.js","/assets/Leaders-C6H7WRbo.js","/assets/LeadersKpi-j7jp2eLo.js","/assets/Lightbox-CEuleVdj.js","/assets/LiveOverview-Zj5FQnKz.js","/assets/Login-b084djWs.js","/assets/Logs-DSPEq0DI.js","/assets/LostWorkers-PhvC1LbO.js","/assets/NotFound-DSrpgc6h.js","/assets/Notifications-BzlKMne9.js","/assets/NotionTasks-DTia6M97.js","/assets/NotionTrackerSettings-BEyNLE86.js","/assets/Ontime-D5Ll5aNX.js","/assets/Ovens-BHeyJL6L.js","/assets/OvensSettings-Do0rAuja.js","/assets/Overview-BjZl08pO.js","/assets/OwnerChip-oL1HWa7i.js","/assets/PageAccess-BQPRjVkJ.js","/assets/Pagination-CbvyqIqz.js","/assets/People-CFksyBNo.js","/assets/PerenaladkaFactTable-2OwS1jeb.js","/assets/Permissions-BbQ2uWi7.js","/assets/PersonCard-CZxDuPRo.js","/assets/PlanFulfillment-Gmz_G7bk.js","/assets/Production-exNhkLSE.js","/assets/ProductionUpload-BzFCaiZg.js","/assets/Profile-M9cTknoS.js","/assets/ProfileAvatar-C0GLyQne.js","/assets/ProfilesManagement-BB65CdoL.js","/assets/ProofCamera-DYdJQb0M.js","/assets/ProofPhoto-Cxyr0WJk.js","/assets/Quality-B-FOcEm6.js","/assets/RawRows-CVqJUPbY.js","/assets/Reports-h6PtaRzU.js","/assets/RequestStateChip-DqM_1Mxw.js","/assets/RichTextEditor-B6WvEtKv.js","/assets/SaveState-CMqrX3qB.js","/assets/SearchInput-CTMeNoIa.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-DcHeLEOo.js","/assets/ShiftDaily-Ct2c0Rhw.js","/assets/ShiftTimes-DZssj2FH.js","/assets/Staff-C7ku_tcD.js","/assets/StaffListAtCheck-CiDLrTTK.js","/assets/StatusBadge-CRzNaqCo.js","/assets/StatusBandsModal-Cn5toG_g.js","/assets/TargetGoal-Be07h8Ja.js","/assets/Targets-KKLao2zV.js","/assets/Tasks-msTVlsaw.js","/assets/TimeWheelPicker-C_wKHeG0.js","/assets/Tooltip-BQxuRJO7.js","/assets/TranslationsEditor-DwX1BqwA.js","/assets/TrelloAnalytics-DnXDy3TL.js","/assets/TrelloSettings-W3N4MLL2.js","/assets/TrendChart-k-_HChp2.js","/assets/TripleSpeedometer-RirU3qBG.js","/assets/Trudoyomkost-DsbaRKMJ.js","/assets/UploadDropzone-D9tRWZc3.js","/assets/UsersActivity-DyklLd4E.js","/assets/UsersManagement-BBmDCLC4.js","/assets/VerdictBlock-VOokCA9L.js","/assets/VerifixParity-C_uTI4p9.js","/assets/VerifixSettings-7bkVOXLH.js","/assets/VerifixSync-BgVuL0mo.js","/assets/VfxApiMap-gi7Jdyhp.js","/assets/VfxDictionaries-h2RR2YUv.js","/assets/VfxEmployees-q-_T666N.js","/assets/VfxHrMoves-DL8X4Unv.js","/assets/VfxJobs-D7vfp0b9.js","/assets/VfxPhoto-DB8BXJtn.js","/assets/VfxShifts-C38zW7ER.js","/assets/VfxState-h9XeTlk4.js","/assets/VfxTimebooks-Bq0J82lE.js","/assets/VfxTimesheet-BLmUyIVY.js","/assets/WatchProgress-C6yM8pM3.js","/assets/WebLogin-CjEy5QOt.js","/assets/WorkersAttendance-o6IAEaNp.js","/assets/WorkersComposition-CV32GlqK.js","/assets/WorkersMovements-PebHVqEo.js","/assets/WorkersPage-dQmI-8yr.js","/assets/Zagruzka-S38-SnKr.js","/assets/ZagruzkaCell-mmjK_d4Q.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DzUvM7i5.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CGuc3mnT.js","/assets/broadcastTree-CrOkDvRD.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-C7MBlOqu.js","/assets/cellMoveRefusal-Dg475w17.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-A8_kcFWD.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-C754KKQz.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-COOFCA20.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BtVANiBb.js","/assets/index-PD8XnJVy.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-D-CrMSQf.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DV12HiWk.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CKmOKNHM.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DPmAm3M7.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-Bw9MuUZ8.js","/assets/ru-CmP6HcAJ.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-CZAGapi-.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CTqjRD4y.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DuqvllaF.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-Biexen4Z.js","/assets/useMutation-DbxefLi3.js","/assets/useOpenParam-BgJXBI_u.js","/assets/useStatusBands-BKJEzzl4.js","/assets/useUrlScope-D-rhAwGk.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-Bfx8s46O.js","/assets/uz_cyrl-a8m68h5e.js","/assets/vfx-BdcmDY6B.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-CM9eUtMM.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
