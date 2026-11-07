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

const BUILD = "2026-11-07T07:42:34.383Z";
const PRECACHE = ["/","/assets/ActionHistory-Dnkv3Cdo.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-BaGPfH8X.js","/assets/AiKeys-I_21CGOO.js","/assets/AnalysisBoard-Cuq7Ot9k.js","/assets/AppLauncher-DA2VyKJS.js","/assets/Arc-BSJmsJ3m.js","/assets/Assessment-Bdl6z4f2.js","/assets/AssessmentGrade-qEm005mB.js","/assets/AssessmentList-DTQ-xkzf.js","/assets/Assistant-CWVuXgY5.js","/assets/AttendanceCleanup-BDF-o31m.js","/assets/AttendanceUpload-5caZCfYk.js","/assets/AuditTable-DhB2wHQr.js","/assets/BrigadirProfile-CrBSuLKy.js","/assets/BrigadirsKpi-D_Ybv3JW.js","/assets/Broadcast-v-e6NhcE.js","/assets/BroadcastReceivers-D-uDsLWk.js","/assets/BroadcastRecord-B40mtNyE.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-ejw2Rj44.js","/assets/CategoryLegendModal-DVaYdFbU.js","/assets/CellConcerns-D7-aKs7i.js","/assets/CellDetails-BWul3al9.js","/assets/CellFormModal-Y7Hw2OXc.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-DH7-suAo.js","/assets/Cells-D_DT7p0N.js","/assets/ColumnFilter-BA2kZyhF.js","/assets/ColumnsPicker-Dvamy-8n.js","/assets/CommentsModal-BXNk3pNT.js","/assets/ComparisonTable-CF4op7pX.js","/assets/Concerns-2QZiT5nz.js","/assets/ConcernsPieces-DQykoS4f.js","/assets/CountStepper-BLB66Mii.js","/assets/Daily-DmoqgaWb.js","/assets/DataSources-DL0va6mN.js","/assets/DataTable-hdqMBi9f.js","/assets/DateRangePicker-DqxMvtAj.js","/assets/DayReportView-B-ONfdnO.js","/assets/DayStepper-CRJ8YFKB.js","/assets/DayStrip-Bw-AAvos.js","/assets/DbBackup-CU_zM9VL.js","/assets/DifferenceBreakdown-BKIYFgUB.js","/assets/DocAudit-BrOfg_as.js","/assets/Downtime-DoyQxznO.js","/assets/Education-DfJjQaFE.js","/assets/EducationLesson-CktyeLOo.js","/assets/EmptyState-FnCuL1dA.js","/assets/Exam-BJFZf4ST.js","/assets/ExamAdmin-D3EmBYol.js","/assets/Factories-BjBJdCfw.js","/assets/FactorySelect-B0Ecf9uw.js","/assets/Gamification-SIHI3V_z.js","/assets/GroupBadge-C-PtphZq.js","/assets/HeatmapChart-v4o65tF0.js","/assets/IdleCell-BFIx1cpI.js","/assets/IdleOwners-BN-iSocu.js","/assets/IdleSolutions-DqmjroYl.js","/assets/IdleSource-BKPu7pMz.js","/assets/KPICard-BccH-f-y.js","/assets/Kaizen-resQ-vB2.js","/assets/Kelish-CxCE_kp5.js","/assets/KpiBits-DaFBOAuj.js","/assets/KpiDeltaCard-CEZGgZ4I.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-BCay2_Cz.js","/assets/LeaderAppeal-DY_TzuK8.js","/assets/LeaderCutoffs-BQueS8iv.js","/assets/LeaderDailyTasks-vGLau6_w.js","/assets/LeaderDayExclusions-jaxapsJa.js","/assets/LeaderDayReport-DngLFazw.js","/assets/LeaderTasksAdmin-kTRKWkNo.js","/assets/LeaderUnitReport-ChMqpl-T.js","/assets/Leaderboard-BiX0tRLQ.js","/assets/Leaders-ChLVPLXK.js","/assets/LeadersKpi-8Pb8HFm9.js","/assets/Lightbox-D4qnSz2y.js","/assets/LiveOverview-C5MkHgP5.js","/assets/Login-BtDzSBIZ.js","/assets/Logs-B5F9qImI.js","/assets/LostWorkers-DXV5ESwp.js","/assets/NotFound-W2FiJVqm.js","/assets/Notifications-CyhGu_gc.js","/assets/NotionTasks-D0iYR3T8.js","/assets/NotionTrackerSettings-C9aez17S.js","/assets/Ontime-xbe87NYY.js","/assets/Ovens-J7rOa6Jf.js","/assets/OvensSettings-B7L_rnlH.js","/assets/Overview-CXmlqA3W.js","/assets/OwnerChip-BR_clGcW.js","/assets/PageAccess-BLQOfdz-.js","/assets/Pagination-BnC6p7Om.js","/assets/People-CjeN_NOA.js","/assets/PerenaladkaFactTable-CsCVF9T5.js","/assets/Permissions-Do_WMWnm.js","/assets/PersonCard-CEQC4mxj.js","/assets/PlanFulfillment-1s9q66fW.js","/assets/Production-pASf4s5j.js","/assets/ProductionUpload-CAqT9c6X.js","/assets/Profile-D1rXrqHL.js","/assets/ProfileAvatar-DhZC4PsV.js","/assets/ProfilesManagement-CxPO_CHA.js","/assets/ProofCamera-BIU_mGsz.js","/assets/ProofPhoto-CJGkV4c-.js","/assets/Quality-BTSpECeR.js","/assets/RawRows-DHvroVls.js","/assets/Reports-Qe2lC_9X.js","/assets/RequestStateChip-qoWEvh1W.js","/assets/RichTextEditor-B2tPEk6Z.js","/assets/SaveState-DZt5XSp9.js","/assets/SearchInput-D7Il7LIz.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-DwaLAPbn.js","/assets/ShiftDaily-CKPuOlRP.js","/assets/ShiftTimes-BiFxWD8m.js","/assets/Staff-Cbi3obx3.js","/assets/StaffListAtCheck-BPbbtGVg.js","/assets/StatusBadge-C3OoYUPe.js","/assets/StatusBandsModal-BZORqkej.js","/assets/TargetGoal-Cq9rBdDe.js","/assets/Targets-CgZruGt_.js","/assets/Tasks-CKWwqw8J.js","/assets/TimeWheelPicker-CA27NIi3.js","/assets/Tooltip-BSBPDfH6.js","/assets/TranslationsEditor-BbBOdVTr.js","/assets/TrelloAnalytics-BVMuZoJn.js","/assets/TrelloSettings-DsRJ6UDc.js","/assets/TrendChart-BuHJZWcb.js","/assets/TripleSpeedometer-DvsBJAAo.js","/assets/Trudoyomkost-BCi5EV62.js","/assets/UploadDropzone-DpfKBqns.js","/assets/UsersActivity-g-g0vOIQ.js","/assets/UsersManagement-DsiwVHiP.js","/assets/VerdictBlock-BIcuFsfq.js","/assets/VerifixParity-DSoeUWSy.js","/assets/VerifixSettings-L1mckYiH.js","/assets/VerifixSync-YsE-N0dI.js","/assets/VfxApiMap-C8bFqLsn.js","/assets/VfxDictionaries-DHQFv8In.js","/assets/VfxEmployees-Cee5aHMx.js","/assets/VfxHrMoves-Cs8y3UiZ.js","/assets/VfxJobs-BBVPIcsE.js","/assets/VfxPhoto-Bd_V_DJ7.js","/assets/VfxShifts-BaIK9XaM.js","/assets/VfxState-8pTyi5Ng.js","/assets/VfxTimebooks-Cg_Ru7eU.js","/assets/VfxTimesheet-DcBiWG3e.js","/assets/WatchProgress-CfWNeWJe.js","/assets/WebLogin-CKOYtkqp.js","/assets/WorkersAttendance-DMiPxUd3.js","/assets/WorkersComposition-Dtld9FxV.js","/assets/WorkersMovements-BAgPe5Tj.js","/assets/WorkersPage-BA-5JIBn.js","/assets/Zagruzka-BCE4jBDG.js","/assets/ZagruzkaCell-BtFhoHU5.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-uScLVXcr.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CygtkEot.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CI_tqobl.js","/assets/broadcastTree-s9x3roeb.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DraT8SSN.js","/assets/cellMoveRefusal-CNDS57FZ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-rbY2ocQY.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Dv6-5avE.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DfHoxCj4.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-COSWaPAZ.css","/assets/index-nAgLEzhq.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CUFZU2Zk.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CWr_8Crb.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-BwaFgOV2.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-B4yD1sZs.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CSyp0k3f.js","/assets/ru-BshZBZIo.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-nh8RU8jZ.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-ClzI7uS0.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-DzrnDRsB.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CS6jQ9JD.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-71-5T5l9.js","/assets/useMutation-CsA8TqsM.js","/assets/useOpenParam-ChZXXKj_.js","/assets/useStatusBands-BaoFuTqB.js","/assets/useUrlScope-CtAfpDiY.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-D2wHCeR1.js","/assets/uz_cyrl-D4n6o4Fl.js","/assets/vfx-BnAS_zn5.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-BQx-psYp.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
