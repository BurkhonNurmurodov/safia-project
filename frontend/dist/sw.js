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

const BUILD = "2026-11-24T04:15:00.798Z";
const PRECACHE = ["/","/assets/AdminPage-DGCfgO4b.js","/assets/AdminTabs-CmEGx35e.js","/assets/AiKeys-D5oG_M9x.js","/assets/AnalysisBoard-CgpfrcT3.js","/assets/ApiAccess-timxvHsP.js","/assets/AppLauncher-e6Z-in4T.js","/assets/Arc-DYnAxbQ5.js","/assets/Assessment-3aAfpk5p.js","/assets/AssessmentGrade-CA7VIFJO.js","/assets/AssessmentList-DXSDR2YU.js","/assets/Assistant-BZhtjlNz.js","/assets/AttendanceCleanup-BWvmVTzI.js","/assets/AttendanceUpload-DDxw8BEV.js","/assets/AuditTable-BHY4FMjF.js","/assets/Audits-CS9BZu5W.js","/assets/BolimsModal-CE5bc_6m.js","/assets/BrigadirProfile-T3iERA1I.js","/assets/BrigadirsKpi-CqdpmN0p.js","/assets/Broadcast-D4Kn4pST.js","/assets/BroadcastReceivers-JHbqzv_Y.js","/assets/BroadcastRecord-BhxLBQEB.js","/assets/CatLockNotice-DSqq59Xl.js","/assets/CategoryLegendModal-D-_7SkIe.js","/assets/CellConcerns-SyLCE4nK.js","/assets/CellDetails-By2-BNUk.js","/assets/CellFormModal-R-h9AcC0.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-CJ37SLIr.js","/assets/Cells-CSPyl3KF.js","/assets/ColumnFilter-BJW3njos.js","/assets/ColumnsPicker-CXe4R9Tw.js","/assets/CommentsModal-BWWkY1Ri.js","/assets/ComparisonTable-BRWaeMdY.js","/assets/Concerns-CW3heZi2.js","/assets/ConcernsPieces-5kQbMHJO.js","/assets/ContainerBolims-Bly3iDnJ.js","/assets/ContainerFlow-xQQKp_s1.js","/assets/ContainerTotalsCard-eZTd1IcS.js","/assets/Containers-DGrZGQbV.js","/assets/CountStepper-D2JdcPD8.js","/assets/Daily-DN98DDSd.js","/assets/DataSources-BsFMdSMP.js","/assets/DataTable-BcwRMkJD.js","/assets/DateRangePicker-CHtz9ELS.js","/assets/DayReportView-C5cEoVp2.js","/assets/DayStepper-BDcmaOBb.js","/assets/DayStrip-Do2UgcwD.js","/assets/DbBackup-DJv_9jBe.js","/assets/DifferenceBreakdown-puuihuph.js","/assets/DocAudit-CtJPfVmV.js","/assets/Downtime-CW5nzJXV.js","/assets/Education-CJkpFFew.js","/assets/EducationLesson-CXt4Qs2m.js","/assets/EmptyState-XHzdwldq.js","/assets/Equipment-amfSOkb8.js","/assets/Exam-Dmm96jAu.js","/assets/ExamAdmin-D3PZ80EO.js","/assets/Factories-DW-W7g6p.js","/assets/FactorySelect-3W95tIKU.js","/assets/Gamification-BzPwGfcq.js","/assets/GroupBadge-I7WIw4oX.js","/assets/HeatmapChart-LmNCQ3PN.js","/assets/HourlyContainers-x-EnvaD8.js","/assets/IdleCell-BFbFV-Gj.js","/assets/IdleOwners-DG1vNOR0.js","/assets/IdleSolutions-DQ5YhuD5.js","/assets/KPICard-Cr_kTcj8.js","/assets/Kaizen-DHQ8ltUA.js","/assets/Kelish-CgxZhYyJ.js","/assets/Kitchen-CwKxdBE_.js","/assets/KpiBits-BciKN-f5.js","/assets/KpiDeltaCard-BPBBJ5-l.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-BgBOqTCi.js","/assets/LeaderAppeal-CRH_RWy4.js","/assets/LeaderDailyTasks-2WpuNt0j.js","/assets/LeaderDayReport-CGloX2J8.js","/assets/LeaderNotCounting-D65ihp5_.js","/assets/LeaderTasksAdmin-BQ1Xzk64.js","/assets/LeaderUnitReport-DSvlfcSl.js","/assets/Leaderboard-gXQTULAo.js","/assets/Leaders-9PDL54QM.js","/assets/LeadersKpi-DW-cR681.js","/assets/Lightbox-CiVnjAiK.js","/assets/LiveOverview-BgtKx_ED.js","/assets/Login-CiLDUONG.js","/assets/Logs-gfGjbNiY.js","/assets/LostWorkers-CdVmYTzZ.js","/assets/NotFound-1ZhXvE6U.js","/assets/Notifications-CDpth94n.js","/assets/NotionTasks-Dv6nfFhn.js","/assets/NotionTrackerSettings-BFy0Eed2.js","/assets/Ontime-BqM4zibG.js","/assets/OrgChart-CS9X5fxc.js","/assets/Ovens-Clu1_-jL.js","/assets/OvensSettings-Byz2ehXi.js","/assets/Overview-DBtd9j9V.js","/assets/OwnerChip-h60S-LDX.js","/assets/Pagination-CmgbfPvm.js","/assets/People-DNolejWP.js","/assets/PerenaladkaFactTable-CxW72U-J.js","/assets/Permissions-CdRlSrKc.js","/assets/PersonCard-tILlq4Hu.js","/assets/PlanFulfillment-DNMdoEI-.js","/assets/Production-smFVvBj9.js","/assets/ProductionUpload-Cg6JZgG0.js","/assets/Profile-Clf3vMkq.js","/assets/ProfileAvatar-DlXY18Mk.js","/assets/ProfilesManagement-9xkitGAX.js","/assets/ProofCamera-DvANbQlf.js","/assets/ProofPhoto-D4oNg-sB.js","/assets/Quality-1S7cFaSB.js","/assets/RawRows-DS1-giO-.js","/assets/Reports-BRM68j4n.js","/assets/RequestStateChip-B4n-EtfJ.js","/assets/RichTextEditor-BhsWJVrz.js","/assets/SaveState-CjHO2amU.js","/assets/SdPanelSettings-8bf7d4Gb.js","/assets/SearchInput-DTjSa6cm.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-C_nCTGGF.js","/assets/ShiftDaily-CIisl6dI.js","/assets/ShiftTimes-QfUIgJxg.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-CUXn8SkS.js","/assets/StaffListAtCheck-BW4yom0V.js","/assets/StatusBadge-CvXSrJBk.js","/assets/StatusBandsModal-CU6w2XIO.js","/assets/TargetGoal-Dm_goucx.js","/assets/Targets-D-qhh-dn.js","/assets/TaskFormModal-Bz-TMugj.js","/assets/TaskerSettings-DnJvamkM.js","/assets/Tasks-D7hufyl3.js","/assets/TgProfile-a3WpXPhS.js","/assets/TimeWheelPicker-B8CThGlY.js","/assets/Tooltip-C0kbm0J5.js","/assets/TranslationsEditor-BHihURZH.js","/assets/TrelloAnalytics-ClaPJM_Y.js","/assets/TrelloSettings-kyQlQQMS.js","/assets/TrendChart-CzphSUVd.js","/assets/TripleSpeedometer-Cul1Rjvg.js","/assets/Trudoyomkost-FX_VRyTb.js","/assets/UploadDropzone-DKy7A_Kq.js","/assets/UsersActivity-B1goGUXW.js","/assets/UsersManagement-Qy-sMKng.js","/assets/VerifixPage-D-hAUce9.js","/assets/VerifixParity-CZApGqTo.js","/assets/VfxApiMap-D2meaG37.js","/assets/VfxDictionaries-chxXdUKN.js","/assets/VfxEmployees-ShMS1WTd.js","/assets/VfxHrMoves-bUE0qhvy.js","/assets/VfxJobs--TdTVgAa.js","/assets/VfxPhoto-CJhSeyXA.js","/assets/VfxShifts-CE3Y1lAZ.js","/assets/VfxState-GpYX5x4M.js","/assets/VfxTimebooks-D3Q9xIAz.js","/assets/VfxTimesheet-t-dI6439.js","/assets/WatchProgress-6woo82WH.js","/assets/WebLogin-DFqGNMPg.js","/assets/WorkersAttendance-VCVZIVD-.js","/assets/WorkersComposition-B5Xc1Vcw.js","/assets/WorkersMovements-BAYFAGnI.js","/assets/WorkersPage-DRyELHJB.js","/assets/Zagruzka-DT-R7p0t.js","/assets/ZagruzkaCell-DkbQX4qs.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BF2MH5A_.js","/assets/api-D_IoyhCc.js","/assets/appealTask-DaWnC1jd.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-xDQM5w33.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-lk5Hs1_s.js","/assets/broadcastTree-CVIUXgwm.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-CeR2K_cL.js","/assets/categories-BuqRi4eJ.js","/assets/cellMoveRefusal-D7iPR190.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BP8-Defg.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-Bj9z9-3D.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-CfSX-3SI.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Coc3zk_X.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CxwOWfEn.js","/assets/index-Dzcu_ZnS.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CXkK51gY.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/marks-BcWvnu5V.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-CBcw-5Hl.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-UcHV7GDV.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-Cdud1xcc.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CyB0N6P5.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-wnK1gD9I.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CtlCoPIp.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-C-xer0qu.js","/assets/useMutation-BW-q2e3t.js","/assets/useOpenParam-CqHla2Gg.js","/assets/useStatusBands-CglwJgwO.js","/assets/useUrlScope-LkN9lptQ.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DGPPOOFP.js","/assets/uz_cyrl-t_Uhpuzd.js","/assets/vfx-CdYR1UjM.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-B5NJp9kd.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
