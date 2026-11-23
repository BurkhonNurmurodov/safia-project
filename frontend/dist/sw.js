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

const BUILD = "2026-11-23T09:06:41.983Z";
const PRECACHE = ["/","/assets/AdminPage-tVXA-P7F.js","/assets/AdminTabs-6mu1uQvB.js","/assets/AiKeys-DGz82qre.js","/assets/AnalysisBoard-CzULMNaJ.js","/assets/ApiAccess-DFaEdFZe.js","/assets/AppLauncher-DH8HUCHH.js","/assets/Arc-SYLZHclA.js","/assets/Assessment-BvBNQjNQ.js","/assets/AssessmentGrade-D8-e1M03.js","/assets/AssessmentList-57I5H3_I.js","/assets/Assistant-CnDkUNpp.js","/assets/AttendanceCleanup-BO3Bfzyb.js","/assets/AttendanceUpload-qO_uOx0B.js","/assets/AuditTable-BrwiR96g.js","/assets/Audits-DcCsIn81.js","/assets/BrigadirProfile-sVU6bjPw.js","/assets/BrigadirsKpi-BiTAlwSy.js","/assets/Broadcast-BjQx9WAq.js","/assets/BroadcastReceivers-BT7MDLiL.js","/assets/BroadcastRecord-DCNceLkY.js","/assets/CatLockNotice-DNNx6aFh.js","/assets/CategoryLegendModal-BVM4PZFO.js","/assets/CellConcerns-BgM_EtEq.js","/assets/CellDetails-D6kOEU2x.js","/assets/CellFormModal-Dcv12AMk.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-B1HjMOGd.js","/assets/Cells-CPqlZWsr.js","/assets/ColumnFilter-DMcEgVVi.js","/assets/ColumnsPicker-CcSGdciL.js","/assets/CommentsModal-BtP-VSeo.js","/assets/ComparisonTable-Ck6zFxeg.js","/assets/Concerns-B1uJsc9w.js","/assets/ConcernsPieces-pxLMxJ0e.js","/assets/ContainerFlow-Cghp8pNp.js","/assets/ContainerTotalsCard-BwyzyNBA.js","/assets/Containers-DkghHuIZ.js","/assets/CountStepper-Bvp4ZHWX.js","/assets/Daily-YBiXT1Ao.js","/assets/DataSources-Bg_AgUoJ.js","/assets/DataTable-AqZvVJ9s.js","/assets/DateRangePicker-Cz64xPTu.js","/assets/DayReportView-Bc0dphhs.js","/assets/DayStepper-CMLFbwbq.js","/assets/DayStrip-VKNX_HIB.js","/assets/DbBackup-t_YRY3S4.js","/assets/DifferenceBreakdown-CdRjRMuj.js","/assets/DocAudit-Bg4BD3wc.js","/assets/Downtime-mSZKA_FG.js","/assets/Education-BD_1RgkW.js","/assets/EducationLesson-CnuYW0sE.js","/assets/EmptyState-BR2kJZmj.js","/assets/Equipment-Dy3eEaiS.js","/assets/Exam-CBpu0UeE.js","/assets/ExamAdmin-CVp5R2b7.js","/assets/Factories-7O4F1KeS.js","/assets/FactorySelect-BtVYTPfh.js","/assets/Gamification-Cy4jLnpk.js","/assets/GroupBadge-CjL6eaiB.js","/assets/HeatmapChart-DbNpkjNe.js","/assets/HourlyContainers-prHgFbSu.js","/assets/IdleCell-BexxXalZ.js","/assets/IdleOwners-DJ8SCjAf.js","/assets/IdleSolutions-Ccta-wMb.js","/assets/KPICard-CifXbp-E.js","/assets/Kaizen-CQ1yaHnC.js","/assets/Kelish-D2Ttnpuc.js","/assets/Kitchen-2r3dGloX.js","/assets/KpiBits-DRm_nTae.js","/assets/KpiDeltaCard-CIltS0YF.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-B4Mfdj3q.js","/assets/LeaderAppeal-DYk13qpU.js","/assets/LeaderDailyTasks-CYz6GL6w.js","/assets/LeaderDayReport-D5xx4HFf.js","/assets/LeaderNotCounting-CuVH2nHV.js","/assets/LeaderTasksAdmin-0vMNUfyO.js","/assets/LeaderUnitReport-BUKKt1Dz.js","/assets/Leaderboard-Bt6KRsIz.js","/assets/Leaders-Cwq58_r3.js","/assets/LeadersKpi-BUx20tqI.js","/assets/Lightbox-4n1Bgkr5.js","/assets/LiveOverview-G8G92GZu.js","/assets/Login-_z5m38Kl.js","/assets/Logs-CGTW4Dmq.js","/assets/LostWorkers-ZPsCWQTe.js","/assets/NotFound-DBxKTzRd.js","/assets/Notifications-Z6561y1-.js","/assets/NotionTasks-6VJKtr_3.js","/assets/NotionTrackerSettings-DG_PBaSo.js","/assets/Ontime-W-54Le8f.js","/assets/OrgChart-7OenV4fq.js","/assets/Ovens-Ch78oznp.js","/assets/OvensSettings-sYUD9Kha.js","/assets/Overview-DF7wJP9Q.js","/assets/OwnerChip-D4NhPSao.js","/assets/Pagination-CAxvob7V.js","/assets/People-DznVwrts.js","/assets/PerenaladkaFactTable-C83EwBGo.js","/assets/Permissions-74xu-ney.js","/assets/PersonCard-tG1ouFdb.js","/assets/PlanFulfillment-D6Z21XT5.js","/assets/Production-QAi4PbUs.js","/assets/ProductionUpload-QiyDVKer.js","/assets/Profile-DQP9WUUy.js","/assets/ProfileAvatar-Bf-soPAh.js","/assets/ProfilesManagement-BNaNCC4F.js","/assets/ProofCamera-B7-6pldn.js","/assets/ProofPhoto-Yydy3Obk.js","/assets/Quality-C7yr-QgK.js","/assets/RawRows-3EGx6hwN.js","/assets/Reports-DAa8Qyo6.js","/assets/RequestStateChip-aJrjv9ZX.js","/assets/RichTextEditor-d9G_J6Yf.js","/assets/SaveState-gr6YNUJ-.js","/assets/SdPanelSettings-DysFzTwQ.js","/assets/SearchInput-CZ1qJeQN.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-D_KnplEA.js","/assets/ShiftDaily-Ezt14WxZ.js","/assets/ShiftTimes-Dtmf2C-b.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-4jfqlbkU.js","/assets/StaffListAtCheck-B3wIYJtM.js","/assets/StatusBadge-DM8KJUjI.js","/assets/StatusBandsModal-DQNTfoOb.js","/assets/TargetGoal-D5csjqm9.js","/assets/Targets-BF8l7vn4.js","/assets/TaskFormModal-Crw7G7zb.js","/assets/TaskerSettings-C2quw81c.js","/assets/Tasks-DAPAH6As.js","/assets/TgProfile-BejTgqTk.js","/assets/TimeWheelPicker-zGdYai5N.js","/assets/Tooltip-BWS_7hhD.js","/assets/TranslationsEditor-BvNgSt3E.js","/assets/TrelloAnalytics-BXrcBRgG.js","/assets/TrelloSettings-mIz6xuOd.js","/assets/TrendChart-BVg9-1zY.js","/assets/TripleSpeedometer-CAwIVmee.js","/assets/Trudoyomkost-TTj6PUDG.js","/assets/UploadDropzone-BjgV4vCS.js","/assets/UsersActivity-DBzalPTX.js","/assets/UsersManagement-B4VHTF9a.js","/assets/VerifixPage-hG5_NkqD.js","/assets/VerifixParity-CCcFM-Dx.js","/assets/VfxApiMap-BhqkvU4B.js","/assets/VfxDictionaries-BHxMdF6K.js","/assets/VfxEmployees-DBTHEzt1.js","/assets/VfxHrMoves-Cq3XfK9f.js","/assets/VfxJobs-CvMVSkjK.js","/assets/VfxPhoto-RCCTckZN.js","/assets/VfxShifts-Dy0Km3w0.js","/assets/VfxState-DCFLg1Xb.js","/assets/VfxTimebooks-D-uuMk7i.js","/assets/VfxTimesheet-DlLhh8CP.js","/assets/WatchProgress-blBuJtnJ.js","/assets/WebLogin-CoyC6zDG.js","/assets/WorkersAttendance-BpwyVRry.js","/assets/WorkersComposition-BvjAqxVl.js","/assets/WorkersMovements-CWhyB5AB.js","/assets/WorkersPage-CPM_xaru.js","/assets/Zagruzka-CpCdQeVJ.js","/assets/ZagruzkaCell-ybPV7TGl.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BhC84VpN.js","/assets/api-D_IoyhCc.js","/assets/appealTask-Caxs9VFq.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-Cs5hDoIp.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BMXmTY6G.js","/assets/broadcastTree-D1PX7Lkq.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-BukZnuD5.js","/assets/categories-C1WKXiSt.js","/assets/cellMoveRefusal-DXjwCgYI.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DszBSXFr.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-DuEmuIsG.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-D2c0Ci4Q.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-m1EUVW65.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CE1LPOQo.js","/assets/index-DkyflHqG.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CyeMj8bi.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DQjYGF86.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-CDf483UW.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-D0EEF5HV.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-Bw0Jfd1X.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CV5GmjTV.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CiMh9FwC.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BDs92cR2.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-CsOtt4KQ.js","/assets/useMutation-hNOe2F_t.js","/assets/useOpenParam-Dx2N6Jkv.js","/assets/useStatusBands-CQ-LnktT.js","/assets/useUrlScope-BmYXEOER.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-2AT6LMfp.js","/assets/uz_cyrl-C2MQKT0f.js","/assets/vfx-D3ht5CLv.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-Cc_8x26Y.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
