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

const BUILD = "2026-11-16T05:06:34.961Z";
const PRECACHE = ["/","/assets/ActionMenu-D3_QoP_0.js","/assets/AdminPage-D41tpztt.js","/assets/AdminTabs-DeRWFGKz.js","/assets/AiKeys-7nsY4yhE.js","/assets/AnalysisBoard-BHzJmo0e.js","/assets/ApiAccess-CDXxfe3I.js","/assets/AppLauncher-NDGo2bxN.js","/assets/Arc-_sMhqvik.js","/assets/Assessment-Ct-Juc4h.js","/assets/AssessmentGrade-D672rKtS.js","/assets/AssessmentList-CoOWQcYS.js","/assets/Assistant-DT6ZtxjG.js","/assets/AttendanceCleanup-BZQYiu7S.js","/assets/AttendanceUpload-CkFkxp6x.js","/assets/AuditTable-9lDf1cwa.js","/assets/BrigadirProfile-kpm_CYNf.js","/assets/BrigadirsKpi-DZJnXAcp.js","/assets/Broadcast-1zKreO6f.js","/assets/BroadcastReceivers-WskiI94g.js","/assets/BroadcastRecord-BLF46pLB.js","/assets/Button-BByRB7Le.js","/assets/CatLockNotice-es60iawy.js","/assets/CategoryLegendModal-B0hyigU_.js","/assets/CellConcerns-STfU0wWo.js","/assets/CellDetails-BqXKVwbY.js","/assets/CellFormModal-49imkM46.js","/assets/CellIdent-DE6qkdqd.js","/assets/CellLink-BxPC_Xrl.js","/assets/Cells-DkdFBL_9.js","/assets/ColumnFilter-CAKUyLlz.js","/assets/ColumnsPicker-B9Z5Vs3p.js","/assets/CommentsModal-DTlsv7x0.js","/assets/ComparisonTable-mn3yAEaR.js","/assets/Concerns-o0Qm6_xY.js","/assets/ConcernsPieces-ab2YukxF.js","/assets/ContainerFlow-D0pQcpjn.js","/assets/ContainerTotalsCard-CTfZyrQy.js","/assets/Containers-Bb4Os0cV.js","/assets/CountStepper-dDcpustX.js","/assets/Daily-DGsnSiQB.js","/assets/DataSources-INnPCNlj.js","/assets/DataTable-B3GtVmT2.js","/assets/DateRangePicker-B0WhxO3o.js","/assets/DayReportView-MfLwmE3-.js","/assets/DayStepper-Bt5JWAzZ.js","/assets/DayStrip-BI3_6gYX.js","/assets/DbBackup-DyI2uv_R.js","/assets/DifferenceBreakdown-9QAaxkv0.js","/assets/DocAudit-CGRQf28X.js","/assets/Downtime-CqH-_00P.js","/assets/Education-iAx7deYq.js","/assets/EducationLesson-BYGtgc1d.js","/assets/EmptyState-Du-x8zPd.js","/assets/Exam-DSE-RqAj.js","/assets/ExamAdmin-DfV_BJpL.js","/assets/Factories-Dhg5ziTj.js","/assets/FactorySelect-CAn6osGz.js","/assets/Gamification-Cqxt9Gcc.js","/assets/GroupBadge-cvfILh91.js","/assets/HeatmapChart-BP8JIOf-.js","/assets/HourlyContainers-p9aExf4_.js","/assets/IdleCell-Ci9AwSG5.js","/assets/IdleOwners-CE9IDkaP.js","/assets/IdleSolutions-DEzCbFiR.js","/assets/KPICard-C0JWkQfI.js","/assets/Kaizen-CK_zNM6U.js","/assets/Kelish-BAEhEYAC.js","/assets/Kitchen-BtIkK0PI.js","/assets/KpiBits-Mj6GGJa1.js","/assets/KpiDeltaCard-DJMtk4On.js","/assets/LangContext-2A4sPKlL.js","/assets/LangTextInput-Kofaohjz.js","/assets/Layout-BJKGBozO.js","/assets/LeaderAppeal-DUEt40jx.js","/assets/LeaderDailyTasks-BKlluW1p.js","/assets/LeaderDayReport-uj3pamHb.js","/assets/LeaderNotCounting-w5Jxu6wH.js","/assets/LeaderTasksAdmin-CDgyXtbz.js","/assets/LeaderUnitReport-Z4bI_0QE.js","/assets/Leaderboard-BGvuM26L.js","/assets/Leaders-DAqhnMRM.js","/assets/LeadersKpi-BTdqNBU_.js","/assets/Lightbox-B8M_C35B.js","/assets/LiveOverview-BzkjYgxX.js","/assets/Login-DeJJc3OM.js","/assets/Logs-B6W9dqf-.js","/assets/LostWorkers-CjgCTgiP.js","/assets/Meter-CRRHrYuq.js","/assets/NotFound-CTti0yDV.js","/assets/Notifications-D5jPxt1L.js","/assets/NotionTasks-CHl4P_Ki.js","/assets/NotionTrackerSettings-YzX9wWkc.js","/assets/Ontime-BFAW-GPK.js","/assets/OrgChart-t5UZEk_V.js","/assets/Ovens-DUHHpVgx.js","/assets/OvensSettings-EeynTn0b.js","/assets/Overview-5Bca5sNU.js","/assets/OwnerChip-BoQNA1cN.js","/assets/Pagination-BPKzlpCQ.js","/assets/People-BO6qpxJF.js","/assets/PerenaladkaFactTable-CqoKrrZ4.js","/assets/Permissions-DN62ha7I.js","/assets/PersonCard-Bf9517I4.js","/assets/PlanFulfillment-8F3BYuVP.js","/assets/Production-DsNESzu0.js","/assets/ProductionUpload-BfraCDTO.js","/assets/Profile-f0bcTuf_.js","/assets/ProfileAvatar-CFnEquQu.js","/assets/ProfilesManagement-CeN2H-kO.js","/assets/ProofCamera-Dm3cJ7Mf.js","/assets/ProofPhoto-DqhPTJev.js","/assets/Quality-BLaVHwPy.js","/assets/RawRows-DlYIJzey.js","/assets/Reports-Dr5PDB6H.js","/assets/RequestStateChip-S0fDE3zf.js","/assets/RichTextEditor-IYVe7-4-.js","/assets/SaveState-BprKC9Mf.js","/assets/SearchInput-BDwUr3_F.js","/assets/SeasonalityHeatmap-B65j5wfW.js","/assets/SegmentedToggle-CIxWlaZZ.js","/assets/SetupTimes-De58SBvW.js","/assets/ShiftDaily-s88YV5T7.js","/assets/ShiftTimes-HYEcNCf7.js","/assets/SortableList-DgrUPWKx.js","/assets/Staff-Cdjd2ooM.js","/assets/StaffListAtCheck-HhKcdG1J.js","/assets/StatusBadge-DyuOKSWS.js","/assets/StatusBandsModal-CbNnUf7f.js","/assets/TargetGoal-Cs58FAgg.js","/assets/Targets-C_rsAbWK.js","/assets/TaskFormModal-DxAOt9Qy.js","/assets/TaskerSettings-BmDBrtw4.js","/assets/Tasks-BUz4k1t6.js","/assets/TgProfile-BdFB_KeE.js","/assets/TimeWheelPicker-BqrjE2QY.js","/assets/Tooltip-pkrRFDjZ.js","/assets/TranslationsEditor-DzNmLhFd.js","/assets/TrelloAnalytics-eZuovYdO.js","/assets/TrelloSettings-kDPzRvf5.js","/assets/TrendChart-CCBtuvpA.js","/assets/TripleSpeedometer-D2z7esDH.js","/assets/Trudoyomkost-G92Aw_Ut.js","/assets/UploadDropzone-CUXgGWKQ.js","/assets/UsersActivity-BWFu6W0o.js","/assets/UsersManagement-DiWhrq52.js","/assets/VerdictBlock-kK629Cm9.js","/assets/VerifixPage-CX9Z-3Yb.js","/assets/VerifixParity-CxcKZm8q.js","/assets/VfxApiMap-BE-8zCVf.js","/assets/VfxDictionaries-Ckw5-eJL.js","/assets/VfxEmployees-bSiLINjr.js","/assets/VfxHrMoves-CdZ9eOrN.js","/assets/VfxJobs-208_nZPj.js","/assets/VfxPhoto-BKIE6ME5.js","/assets/VfxShifts-Dq66lBYA.js","/assets/VfxState-w2DuXewF.js","/assets/VfxTimebooks-BnyTKsr-.js","/assets/VfxTimesheet-DVDENuPh.js","/assets/WatchProgress-s7GvLiXV.js","/assets/WebLogin-gjS6R5Ui.js","/assets/WorkersAttendance-CgyvQluP.js","/assets/WorkersComposition-WRveAOw-.js","/assets/WorkersMovements-CvLhLjtY.js","/assets/WorkersPage-DjCvjop2.js","/assets/Zagruzka-Cxi8E8hc.js","/assets/ZagruzkaCell-BnoJHPZZ.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CuctXM8s.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-I-vW5ttL.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DilFQ0ja.js","/assets/broadcastTree-DTHOUdAZ.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-COzYXVN_.js","/assets/cellMoveRefusal-BmedlJqi.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-pClPEu8P.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Dl5Rz9WX.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-IlOZJ--b.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-B5UMjWod.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BmIGwrRb.js","/assets/index-Rq15oGzo.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BKV_-XKg.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DsDQboTu.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CaZl1ktg.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CUBVn8lY.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-B-aTal4V.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-yWhVjQAV.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DGskdIYF.js","/assets/ru-CIqDzFQv.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-DBGF5TvL.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DrvL_CRf.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-ChfDr16y.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-FZMHU3-J.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-CqBPW6nm.js","/assets/useLeaveRef-9t0sU37C.js","/assets/useMutation-f-gGNFnS.js","/assets/useOpenParam-Bdflc8EM.js","/assets/useStatusBands-DP1c_jG2.js","/assets/useUrlScope-CjcM1SGV.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-w1OKdYmw.js","/assets/uz_cyrl-Dzc-AxaF.js","/assets/vfx-DeFXg27K.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-Ck0dcTjQ.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
