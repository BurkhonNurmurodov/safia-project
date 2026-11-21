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

const BUILD = "2026-11-21T08:25:25.955Z";
const PRECACHE = ["/","/assets/AdminPage-4TSqReJE.js","/assets/AdminTabs-DUurzoPH.js","/assets/AiKeys-CxATCHG-.js","/assets/AnalysisBoard-BmtOlvSb.js","/assets/ApiAccess-BkdCT02s.js","/assets/AppLauncher-Bj0KELSM.js","/assets/Arc-Bt2RM5DB.js","/assets/Assessment-Dl6F0fZq.js","/assets/AssessmentGrade-3Ofz1m3c.js","/assets/AssessmentList-CHDldMbs.js","/assets/Assistant-CSt_pJSW.js","/assets/AttendanceCleanup-gayqXd67.js","/assets/AttendanceUpload-CO20gnY3.js","/assets/AuditTable-DLxDoPtP.js","/assets/BrigadirProfile-jYiGqJ-2.js","/assets/BrigadirsKpi-D5QTLzvy.js","/assets/Broadcast-CKxpdFiS.js","/assets/BroadcastReceivers-C5o42Gp-.js","/assets/BroadcastRecord-BC1y3f3I.js","/assets/CatLockNotice-zRh8zjBN.js","/assets/CategoryLegendModal-Bz1f0Hl0.js","/assets/CellConcerns-B-OPlEqX.js","/assets/CellDetails-B7KdvKut.js","/assets/CellFormModal-DiluBdcq.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-DZDZhDze.js","/assets/Cells-Chql5Jnb.js","/assets/ColumnFilter-Cen-akRM.js","/assets/ColumnsPicker-BkJ1ecVd.js","/assets/CommentsModal-ByARfyE_.js","/assets/ComparisonTable-CcXr0kEN.js","/assets/Concerns-dz-Lb5z_.js","/assets/ConcernsPieces-DIbMSkrd.js","/assets/ContainerFlow-B5ScNhTd.js","/assets/ContainerTotalsCard-DQqOfM7a.js","/assets/Containers-BKWOhT8a.js","/assets/CountStepper-D50rb6wG.js","/assets/Daily-Dyl4YBle.js","/assets/DataSources-Ba5lb4mI.js","/assets/DataTable-CiH-QaZI.js","/assets/DateRangePicker-KcmVhwkX.js","/assets/DayReportView-7qnv6i8Y.js","/assets/DayStepper-Dkn_MHzM.js","/assets/DayStrip-BkJE5r6E.js","/assets/DbBackup-4bh7_iWm.js","/assets/DifferenceBreakdown-DdWIpBTS.js","/assets/DocAudit-CLDskcDj.js","/assets/Downtime-C8MRrnGL.js","/assets/Education-CmOT2zIE.js","/assets/EducationLesson-DGslQIe4.js","/assets/EmptyState-QgemfcdJ.js","/assets/Equipment-k1qCz0-4.js","/assets/Exam-DHwk-3U9.js","/assets/ExamAdmin-cFi8Ml2d.js","/assets/Factories-D_ZH5eiz.js","/assets/FactorySelect-TLuVWHa4.js","/assets/Gamification-CP1J6Bd5.js","/assets/GroupBadge-BDcuG2-L.js","/assets/HeatmapChart-BBZsNI46.js","/assets/HourlyContainers-Ccy94nhH.js","/assets/IdleCell-BBTLZx1n.js","/assets/IdleOwners-DIZqjzsz.js","/assets/IdleSolutions-CvAP8gzv.js","/assets/KPICard-Bgf7RxaZ.js","/assets/Kaizen-RCO5-tHQ.js","/assets/Kelish-CPbF3yup.js","/assets/Kitchen-DpDlFzjS.js","/assets/KpiBits-D_udSXpg.js","/assets/KpiDeltaCard-mrwpoYEh.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-BU5kEWQP.js","/assets/LeaderAppeal-DGxr4dBN.js","/assets/LeaderDailyTasks-Cx4yzdc4.js","/assets/LeaderDayReport-Bz_Llp6w.js","/assets/LeaderNotCounting-CD9mmzJE.js","/assets/LeaderTasksAdmin-5HwpVGMq.js","/assets/LeaderUnitReport-P30SWKtE.js","/assets/Leaderboard-C3dGpb2X.js","/assets/Leaders-Dlpu2ptH.js","/assets/LeadersKpi-BY3QIjGY.js","/assets/Lightbox-DFGGC8yE.js","/assets/LiveOverview-BcU535Tc.js","/assets/Login-Bp0LNm4V.js","/assets/Logs-jWfgSawk.js","/assets/LostWorkers-Bapkzgra.js","/assets/NotFound-DMzMR5Xs.js","/assets/Notifications-DtwjWeuj.js","/assets/NotionTasks-CWBDQ_7f.js","/assets/NotionTrackerSettings-BVNZdfM2.js","/assets/Ontime-YsGdxee0.js","/assets/OrgChart-wPB6oAuq.js","/assets/Ovens-DqeG3NnH.js","/assets/OvensSettings-Bmx9hxQe.js","/assets/Overview-CNf88Bpu.js","/assets/OwnerChip-Zzds5dLR.js","/assets/Pagination-DVwarne4.js","/assets/People-B0th6s8i.js","/assets/PerenaladkaFactTable-Ch_8yAnn.js","/assets/Permissions-Djg1XOgo.js","/assets/PersonCard-BMQ3nADm.js","/assets/PlanFulfillment-BamFKn0K.js","/assets/Production-LIoB_5eE.js","/assets/ProductionUpload-B-E5dhM3.js","/assets/Profile-Dt98-yg3.js","/assets/ProfileAvatar-2jYbEdhC.js","/assets/ProfilesManagement-Cc-1-Udq.js","/assets/ProofCamera-CRxGrstW.js","/assets/ProofPhoto-B0Si9afA.js","/assets/Quality-CyERkiCW.js","/assets/RawRows-54SJVmUj.js","/assets/Reports-C8EKHoNo.js","/assets/RequestStateChip-CcWpUfZI.js","/assets/RichTextEditor-BcJ6wUPK.js","/assets/SaveState-BqZCpVtl.js","/assets/SdPanelSettings-D3l2KgQf.js","/assets/SearchInput-DJOIimTf.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-DIhs7zKT.js","/assets/ShiftDaily-CgsBN5zt.js","/assets/ShiftTimes-DB7JPYmy.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-Czoq_ZlM.js","/assets/StaffListAtCheck-DMO9NcUP.js","/assets/StatusBadge-BICSWf5G.js","/assets/StatusBandsModal-ClNjkRYo.js","/assets/TargetGoal-BHwyIJQ4.js","/assets/Targets-DbsM-uSM.js","/assets/TaskFormModal-ehj9laX6.js","/assets/TaskerSettings-C0yn3a-p.js","/assets/Tasks-CUbGVOCz.js","/assets/TgProfile-DfQ6tLbd.js","/assets/TimeWheelPicker-CW-XUnkn.js","/assets/Tooltip-CgOy6SHt.js","/assets/TranslationsEditor-CHPHgQA7.js","/assets/TrelloAnalytics-PmiRof32.js","/assets/TrelloSettings-DcdL5wlB.js","/assets/TrendChart-CkZqv9dJ.js","/assets/TripleSpeedometer-Bg7BDnRR.js","/assets/Trudoyomkost-Dt5LROkj.js","/assets/UploadDropzone-Csafg_6j.js","/assets/UsersActivity-BtZJEc-p.js","/assets/UsersManagement-CuWP74_x.js","/assets/VerifixPage-DgPd_0EW.js","/assets/VerifixParity-CjkBp4pP.js","/assets/VfxApiMap-N9rRbfRW.js","/assets/VfxDictionaries-B-aGdsN-.js","/assets/VfxEmployees-Crw0bKvb.js","/assets/VfxHrMoves-BAQzSkQ5.js","/assets/VfxJobs-MjgErflc.js","/assets/VfxPhoto-C8u9W6jr.js","/assets/VfxShifts-C3AQtkQy.js","/assets/VfxState-CU2P5fi3.js","/assets/VfxTimebooks-CZGzie2Z.js","/assets/VfxTimesheet-arpTwFq_.js","/assets/WatchProgress-D17MZA7e.js","/assets/WebLogin-C8kqhy3F.js","/assets/WorkersAttendance-Cfchmaar.js","/assets/WorkersComposition-oj0vDEYr.js","/assets/WorkersMovements-CTwD3gTD.js","/assets/WorkersPage-DuZkHQ1i.js","/assets/Zagruzka-DC9fe10C.js","/assets/ZagruzkaCell-Vy7AC3Le.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-_hxiHuqY.js","/assets/api-D_IoyhCc.js","/assets/appealTask-Lfkit6na.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CN0gd6YB.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CAjHOYnF.js","/assets/broadcastTree-CLolg3EM.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-CO20TYwe.js","/assets/categories-CAUnzQjr.js","/assets/cellMoveRefusal-J-RJzjiT.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DGtK4AWH.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-BYgCtnol.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-e8QKbv_T.js","/assets/flowUtil-41A27L57.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BhA25pmF.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CoOreBdA.js","/assets/index-D8WbwgRu.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-Ctqc-ZEC.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CyaPtlFH.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-C15Xqdix.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CsJcC45F.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-7lRb1jMy.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BaDuLIG0.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-A0AINECl.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Bw9g0oas.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-Ctc9TMk3.js","/assets/useMutation-CsZcT0NC.js","/assets/useOpenParam-DzTLb5FD.js","/assets/useStatusBands-BcjFcyTX.js","/assets/useUrlScope-eiT_D6wz.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-e3rnna4F.js","/assets/uz_cyrl-D1W6dDZ6.js","/assets/vfx-IMo_TFMq.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-uvYQkM8t.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
