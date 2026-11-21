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

const BUILD = "2026-11-21T16:41:38.417Z";
const PRECACHE = ["/","/assets/AdminPage-C-JrdOyc.js","/assets/AdminTabs-DIMzoUa9.js","/assets/AiKeys-DwfIbolo.js","/assets/AnalysisBoard-BxPDYbUq.js","/assets/ApiAccess-_TreFnAI.js","/assets/AppLauncher-BEk9EcHu.js","/assets/Arc-CnRXdgrq.js","/assets/Assessment-BP5c1ygw.js","/assets/AssessmentGrade-RPj2gjr1.js","/assets/AssessmentList-CNVXTdBQ.js","/assets/Assistant-CuCyOPuh.js","/assets/AttendanceCleanup-DoZksCuX.js","/assets/AttendanceUpload-CHQkeq_Y.js","/assets/AuditTable-BUgr_0eH.js","/assets/Audits-DIbIv_uz.js","/assets/BrigadirProfile-CT4EVQoh.js","/assets/BrigadirsKpi-BI-9Kd4D.js","/assets/Broadcast-B9WnZoOt.js","/assets/BroadcastReceivers-Dhq0ifng.js","/assets/BroadcastRecord-xQCKA7J3.js","/assets/CatLockNotice-CPDm5ISg.js","/assets/CategoryLegendModal-D3SS5nBm.js","/assets/CellConcerns-BAPljqY3.js","/assets/CellDetails-LgnV65hR.js","/assets/CellFormModal-Bs7w22nZ.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-B_urVS68.js","/assets/Cells-DzLXy6UC.js","/assets/ColumnFilter-B3p1dqZ-.js","/assets/ColumnsPicker-DmHLHQKO.js","/assets/CommentsModal-C3EtS7Lq.js","/assets/ComparisonTable-CNXXzkUj.js","/assets/Concerns-EZqs0ibD.js","/assets/ConcernsPieces-lOMdhNy1.js","/assets/ContainerFlow-BAdcHOAk.js","/assets/ContainerTotalsCard-CN2ZHQcb.js","/assets/Containers-CkX-fqx5.js","/assets/CountStepper-zspn7o4Y.js","/assets/Daily-SjHIzhiw.js","/assets/DataSources-CdL7jyIi.js","/assets/DataTable-BhD7MZML.js","/assets/DateRangePicker-DS0JbmEV.js","/assets/DayReportView-CBuNciYH.js","/assets/DayStepper-Cenls3uq.js","/assets/DayStrip-eRkE1ddl.js","/assets/DbBackup-BU50u_x0.js","/assets/DifferenceBreakdown-ztgp3skj.js","/assets/DocAudit-CBzvDWfk.js","/assets/Downtime-lsoa0Nyi.js","/assets/Education-CqLXG6q8.js","/assets/EducationLesson-CFaBeQtG.js","/assets/EmptyState-DrQoX23b.js","/assets/Equipment-C8JzO3yO.js","/assets/Exam-BUdCf47e.js","/assets/ExamAdmin-BJp9q9Qp.js","/assets/Factories-DvsdBIjq.js","/assets/FactorySelect-CKSvCBBa.js","/assets/Gamification-BWIuGBEE.js","/assets/GroupBadge-DbqoS0qV.js","/assets/HeatmapChart-TIRO_ys5.js","/assets/HourlyContainers-6el-wCyw.js","/assets/IdleCell-CI1ACo_K.js","/assets/IdleOwners-MiKQ_1FF.js","/assets/IdleSolutions-BAwII4jf.js","/assets/KPICard-DYF_Hnrp.js","/assets/Kaizen-DFb3SECt.js","/assets/Kelish-QLzshbfp.js","/assets/Kitchen-BMdkNFwS.js","/assets/KpiBits-DqX14hJc.js","/assets/KpiDeltaCard-DL2qA9dN.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-Cgx-zNt0.js","/assets/LeaderAppeal-eTVOcBTc.js","/assets/LeaderDailyTasks-BphofTMk.js","/assets/LeaderDayReport-CEzL94Iq.js","/assets/LeaderNotCounting-10BAqpbF.js","/assets/LeaderTasksAdmin--0b0DDUr.js","/assets/LeaderUnitReport-BjImOFB-.js","/assets/Leaderboard-DNCnkYTN.js","/assets/Leaders-BOFsHFfw.js","/assets/LeadersKpi-Dd2VE2Wx.js","/assets/Lightbox-C_QhBJUw.js","/assets/LiveOverview-GH1iNNIx.js","/assets/Login-C71a9eeP.js","/assets/Logs-D3B0yif1.js","/assets/LostWorkers-YITxWpMb.js","/assets/NotFound-5rs5GFh_.js","/assets/Notifications-BgsLNOwI.js","/assets/NotionTasks-hMTIlRzH.js","/assets/NotionTrackerSettings-D5BHbt6c.js","/assets/Ontime-BJXaca6f.js","/assets/OrgChart-CvbYUwKJ.js","/assets/Ovens-Dv0yZmNI.js","/assets/OvensSettings-gK9Xy_G6.js","/assets/Overview-CdKhk8EC.js","/assets/OwnerChip-AMROEcD7.js","/assets/Pagination-BfGjMR41.js","/assets/People-CSq5b5Iu.js","/assets/PerenaladkaFactTable-CMWf25hZ.js","/assets/Permissions-B8CCxxQf.js","/assets/PersonCard-DiITGgfj.js","/assets/PlanFulfillment-DDicaDc6.js","/assets/Production-C7SYq5Ak.js","/assets/ProductionUpload-BtoyP9Rq.js","/assets/Profile-CWQBoeM4.js","/assets/ProfileAvatar-sft4zH3l.js","/assets/ProfilesManagement-CQPfsgd3.js","/assets/ProofCamera-W6D69Lgg.js","/assets/ProofPhoto-BqFueZMp.js","/assets/Quality-x4ROLY_W.js","/assets/RawRows-y8d_BsLN.js","/assets/Reports-sj3nnamF.js","/assets/RequestStateChip-Ae9dhzjn.js","/assets/RichTextEditor-suXhBVa9.js","/assets/SaveState-DnyFaiLe.js","/assets/SdPanelSettings-DJ6gCVkl.js","/assets/SearchInput-Dp2iYO9L.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-Be2CIWen.js","/assets/ShiftDaily-D32kF5BE.js","/assets/ShiftTimes-tfi9BBn1.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-BDUu3Zak.js","/assets/StaffListAtCheck-JvGh8sMx.js","/assets/StatusBadge-daXFv-bH.js","/assets/StatusBandsModal-CVkM1XC4.js","/assets/TargetGoal-C6iR6IMh.js","/assets/Targets-BPc4lb4B.js","/assets/TaskFormModal-CNOF3Rmn.js","/assets/TaskerSettings-CsJm9mfI.js","/assets/Tasks-BReilEvl.js","/assets/TgProfile-yvqVVwEa.js","/assets/TimeWheelPicker-UZhq7XsE.js","/assets/Tooltip-DUOCvtyV.js","/assets/TranslationsEditor-BSPhMTCx.js","/assets/TrelloAnalytics-DX_h1tNy.js","/assets/TrelloSettings-aAAqazfQ.js","/assets/TrendChart-iWJ0TAuW.js","/assets/TripleSpeedometer-NnQi2QmF.js","/assets/Trudoyomkost-HvlmDlU5.js","/assets/UploadDropzone-DCk3y9yk.js","/assets/UsersActivity-DMJxFjkv.js","/assets/UsersManagement-CilcB-Yw.js","/assets/VerifixPage-FHauClQN.js","/assets/VerifixParity-BaArcB4P.js","/assets/VfxApiMap-Jmk9jC7r.js","/assets/VfxDictionaries-CpF9mmlS.js","/assets/VfxEmployees-CAVVuire.js","/assets/VfxHrMoves-BlTEOROR.js","/assets/VfxJobs-BfIWTdSj.js","/assets/VfxPhoto-Da5DNJDp.js","/assets/VfxShifts-HmOEyBtT.js","/assets/VfxState-BZuYf4Gj.js","/assets/VfxTimebooks-DZDF7ukF.js","/assets/VfxTimesheet-DTYThrdm.js","/assets/WatchProgress-D5U1d4an.js","/assets/WebLogin-CC9WH2zF.js","/assets/WorkersAttendance-IywYWiIV.js","/assets/WorkersComposition-CX1pXT-E.js","/assets/WorkersMovements-DDU-62zw.js","/assets/WorkersPage-CEIP5RpU.js","/assets/Zagruzka-RiUgEOuj.js","/assets/ZagruzkaCell-miF15wcR.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DRFnwrr_.js","/assets/api-D_IoyhCc.js","/assets/appealTask-CvVHNVBh.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-DXB8OdtU.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-YXJxxErz.js","/assets/broadcastTree-DBMFzmfA.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-CTUc7gUj.js","/assets/categories-B7n9MNRH.js","/assets/cellMoveRefusal-Cf9snFYW.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-2s4D-BJB.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-BG27Xf3E.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-DxktBdNr.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-yaSaE_Yp.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-ChoY1TQC.js","/assets/index-e9vmkc6X.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DdYzBFsX.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BzHfw0p3.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-Cb01LiJT.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CrcjNv77.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-Dyxql-TP.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-RJIgumA6.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-C8itCnEv.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-kYRiod2x.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-D6DYea4v.js","/assets/useMutation-CgW2jibi.js","/assets/useOpenParam-7-NtdEFw.js","/assets/useStatusBands-CkcK8PW2.js","/assets/useUrlScope-CgDpOEXs.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DmCMCfs7.js","/assets/uz_cyrl-u54EZjIj.js","/assets/vfx-Be7QEWsu.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-IoNWlWNp.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
