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

const BUILD = "2026-11-07T10:45:51.501Z";
const PRECACHE = ["/","/assets/ActionHistory-DXf-Nvva.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-GWAh1Iu2.js","/assets/AiKeys-DMi7aqu-.js","/assets/AnalysisBoard-CgYfboXX.js","/assets/AppLauncher-SMm4L-v1.js","/assets/Arc-BIzyJzmP.js","/assets/Assessment-CpwWjom7.js","/assets/AssessmentGrade-0QsedYhQ.js","/assets/AssessmentList-Dw_6nvOQ.js","/assets/Assistant-DwP6DV5l.js","/assets/AttendanceCleanup-EOtZ-GdH.js","/assets/AttendanceUpload-BMvAD-lc.js","/assets/AuditTable-BDBIr_1y.js","/assets/BrigadirProfile-DAnI-4jX.js","/assets/BrigadirsKpi-CDMYp4Eq.js","/assets/Broadcast-DdGuewZ8.js","/assets/BroadcastReceivers-C7Tuf46V.js","/assets/BroadcastRecord-COw_0vTT.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-CxrsL5S1.js","/assets/CategoryLegendModal-D_5k1FHL.js","/assets/CellConcerns-h2zXIDwZ.js","/assets/CellDetails-DJfBCWWo.js","/assets/CellFormModal-CV-A_Tow.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-DoIGgC4s.js","/assets/Cells-C4BSxQ_n.js","/assets/ColumnFilter-CyAp5WPC.js","/assets/ColumnsPicker-C_60OT92.js","/assets/CommentsModal-C44guZOP.js","/assets/ComparisonTable-B0VH52O4.js","/assets/Concerns-T7_xj2JT.js","/assets/ConcernsPieces-Ca-a-2yC.js","/assets/CountStepper-CQvup1yu.js","/assets/Daily-De-5cQZH.js","/assets/DataSources-D-hBaAIY.js","/assets/DataTable-BRKFoO9T.js","/assets/DateRangePicker-Dn1-mlOz.js","/assets/DayReportView-BcZ02W1B.js","/assets/DayStepper-DaCsQ8TY.js","/assets/DayStrip-asnCq5Zc.js","/assets/DbBackup-un9XWsIT.js","/assets/DifferenceBreakdown-6-Fxnrru.js","/assets/DocAudit-C2-S9wod.js","/assets/Downtime-DIiu-cbQ.js","/assets/Education-0qbFn9VC.js","/assets/EducationLesson-hDKKW_vY.js","/assets/EmptyState-irlytfEI.js","/assets/Exam-C_taEJvQ.js","/assets/ExamAdmin-Dy9YF7du.js","/assets/Factories-pMklLA02.js","/assets/FactorySelect-BsxV0Eab.js","/assets/Gamification-yD3fdu3c.js","/assets/GroupBadge-SKKBr1vB.js","/assets/HeatmapChart-BGa6VLP-.js","/assets/IdleCell-B07BVCTx.js","/assets/IdleOwners-fA_rwf5x.js","/assets/IdleSolutions-3cdx9uxw.js","/assets/IdleSource-D6a95nBg.js","/assets/KPICard-D0PsHUd3.js","/assets/Kaizen-C2MPhGAP.js","/assets/Kelish-C8InyLRk.js","/assets/KpiBits-BetoWv3W.js","/assets/KpiDeltaCard-BtDtsDd-.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-BofaeH4_.js","/assets/LeaderAppeal-DfG0Vfso.js","/assets/LeaderCutoffs-Vkd-Slqh.js","/assets/LeaderDailyTasks-DlnqBsy6.js","/assets/LeaderDayExclusions-njytX7Dv.js","/assets/LeaderDayReport-yLBKzOOL.js","/assets/LeaderTasksAdmin-CWm1URKs.js","/assets/LeaderUnitReport-7kH1Olrm.js","/assets/Leaderboard-BIyxG7vb.js","/assets/Leaders-D38hHOIk.js","/assets/LeadersKpi-rL1jiZAm.js","/assets/Lightbox-7A8Wdq7N.js","/assets/LiveOverview-bunIgPqi.js","/assets/Login-7wu7OP-f.js","/assets/Logs-C-1Qu6ON.js","/assets/LostWorkers-Bpmu_VSk.js","/assets/NotFound-DAJrYhX3.js","/assets/Notifications-B0UrPRgN.js","/assets/NotionTasks-CDoIxn6q.js","/assets/NotionTrackerSettings-CVs4i3S0.js","/assets/Ontime-BpY19CPe.js","/assets/Ovens-CbMEmcYa.js","/assets/OvensSettings-DgkdF7pY.js","/assets/Overview-CNMmnBTl.js","/assets/OwnerChip-Bm1dv9_r.js","/assets/PageAccess-BtYmHAjM.js","/assets/Pagination-DGmU8N9O.js","/assets/People-GOyVHRLA.js","/assets/PerenaladkaFactTable-Bh01KyYV.js","/assets/Permissions-Bjl3CY0I.js","/assets/PersonCard-DIj5YYMB.js","/assets/PlanFulfillment-eqQQS44m.js","/assets/Production-D-rd2Jua.js","/assets/ProductionUpload-BBDL_Gqf.js","/assets/Profile-CHo3sAcj.js","/assets/ProfileAvatar-dq3jnI0R.js","/assets/ProfilesManagement-R3fZcrrP.js","/assets/ProofCamera-5fg1UdoU.js","/assets/ProofPhoto-BwmNps7Y.js","/assets/Quality-o3SPFiEE.js","/assets/RawRows-DWn_gDUC.js","/assets/Reports-ebKyk5JA.js","/assets/RequestStateChip-D-C8MsbJ.js","/assets/RichTextEditor-D5q_3IRa.js","/assets/SaveState-6Ai_FG7T.js","/assets/SearchInput-DYwQi5-x.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-EXxAcocA.js","/assets/ShiftDaily-D_UUmXSi.js","/assets/ShiftTimes-k0GbcWm-.js","/assets/Staff-Bgurs_uS.js","/assets/StaffListAtCheck-Bz2dZ5V5.js","/assets/StatusBadge-Cm0v6dKi.js","/assets/StatusBandsModal-B6hhJZV-.js","/assets/TargetGoal-B0Iyf73O.js","/assets/Targets-B_RCgS1I.js","/assets/Tasks-DxGEYEeN.js","/assets/TimeWheelPicker-BlAaT70P.js","/assets/Tooltip-BbraglhV.js","/assets/TranslationsEditor-CFVBjOwU.js","/assets/TrelloAnalytics-DVJs-5Fb.js","/assets/TrelloSettings-B4czXRxJ.js","/assets/TrendChart-BFy3kVJo.js","/assets/TripleSpeedometer-CjsgSvly.js","/assets/Trudoyomkost-DJYKK4W_.js","/assets/UploadDropzone-vE1BXGAH.js","/assets/UsersActivity-BOCO-B4J.js","/assets/UsersManagement-DLAb2IPX.js","/assets/VerdictBlock-C2HZ_MIl.js","/assets/VerifixParity-BKWse8xy.js","/assets/VerifixSettings-Cn6sxepr.js","/assets/VerifixSync-DliCG4Tg.js","/assets/VfxApiMap-A25MSr9f.js","/assets/VfxDictionaries-DwaIkDDu.js","/assets/VfxEmployees-CDfFR7pP.js","/assets/VfxHrMoves-ydyiGcIL.js","/assets/VfxJobs-UDQzk5-q.js","/assets/VfxPhoto-C3CHvqtH.js","/assets/VfxShifts-DeSoGI_P.js","/assets/VfxState-BNNUbBi4.js","/assets/VfxTimebooks-Bg_kvUnN.js","/assets/VfxTimesheet-Be6j2LP4.js","/assets/WatchProgress-Czx9RN-I.js","/assets/WebLogin-CLclXM5j.js","/assets/WorkersAttendance-IEQWkpyS.js","/assets/WorkersComposition-Bgwefp5Y.js","/assets/WorkersMovements-A17m-Kc-.js","/assets/WorkersPage-CQrKzdfV.js","/assets/Zagruzka-C-_FysoH.js","/assets/ZagruzkaCell-BW4h0l7e.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-C55GBE_D.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CnjIz1tw.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DQWcvsJ8.js","/assets/broadcastTree-Coj16q9w.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DysTYb_c.js","/assets/cellMoveRefusal-DAYVDOvA.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DnzA8O9u.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-C3A3ZYRP.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Bq-P_QYl.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-D_53fKRf.css","/assets/index-XV94-LBF.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DTbqg8Ni.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CyGd7R0y.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-BwaFgOV2.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BcjBqi__.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CSyp0k3f.js","/assets/ru-CfpXkK-w.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-kZVkc9C-.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-Dbjc_KLq.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-DzrnDRsB.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-UgZ57vxv.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-BjNZARgo.js","/assets/useMutation-BucO6iyN.js","/assets/useOpenParam-BwJcyPFt.js","/assets/useStatusBands-B_4PwxkJ.js","/assets/useUrlScope-Ck9fwCFZ.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DPwLDL_8.js","/assets/uz_cyrl-DfsJ9TQK.js","/assets/vfx-oflCdNNa.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-CLIVdCvu.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
