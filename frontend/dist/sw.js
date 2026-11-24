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

const BUILD = "2026-11-24T05:32:07.333Z";
const PRECACHE = ["/","/assets/AdminPage-D4psspzS.js","/assets/AdminTabs-DBj4E7RR.js","/assets/AiKeys-dXZLxGlk.js","/assets/AnalysisBoard-C-IYH6vP.js","/assets/ApiAccess-BD9oQSCj.js","/assets/AppLauncher-CEU37HHK.js","/assets/Arc-C-1BWgtU.js","/assets/Assessment-Dy6QdWT4.js","/assets/AssessmentGrade-CB3QgmEg.js","/assets/AssessmentList-DFT8dkzr.js","/assets/Assistant-C9qXVR7p.js","/assets/AttendanceCleanup-CMVW_bco.js","/assets/AttendanceUpload-DpUmaz71.js","/assets/AuditTable-uBipwy7F.js","/assets/Audits-D-8uK8Ol.js","/assets/BolimsModal-BsDRM0jZ.js","/assets/BrigadirProfile-2syOxeAF.js","/assets/BrigadirsKpi-C1vz_mEz.js","/assets/Broadcast-B6SG8C76.js","/assets/BroadcastReceivers-C198nZxH.js","/assets/BroadcastRecord-CEOlPupR.js","/assets/CatLockNotice-Dwegd6h9.js","/assets/CategoryLegendModal-yJwFDjxH.js","/assets/CellConcerns-CClDd8bd.js","/assets/CellDetails-CIXw7FgB.js","/assets/CellFormModal-BT8icHLm.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-XGXArOM9.js","/assets/Cells-BsG5zQC2.js","/assets/ColumnFilter-C4PBInBx.js","/assets/ColumnsPicker-Cdt8z_mw.js","/assets/CommentsModal-Dv4KYAet.js","/assets/ComparisonTable-Cf17S-Im.js","/assets/Concerns-BbSTziJC.js","/assets/ConcernsPieces-BrqRjtpO.js","/assets/ContainerBolims-wz1imOFF.js","/assets/ContainerFlow-CfkofAYA.js","/assets/ContainerTotalsCard-lsuBfA4X.js","/assets/Containers-Ch65PTRx.js","/assets/CountStepper-CpxISf4Q.js","/assets/Daily-BHVnY6uu.js","/assets/DataSources-CMDV5xnF.js","/assets/DataTable-Dv6a-umm.js","/assets/DateRangePicker-Df_QXjWz.js","/assets/DayReportView-BN2NPS3j.js","/assets/DayStepper-B7M866fP.js","/assets/DayStrip-BaCLXdq6.js","/assets/DbBackup-CgncXuy5.js","/assets/DifferenceBreakdown-CEWA4tge.js","/assets/DocAudit-Bd0NQXs0.js","/assets/Downtime-B7XhcUaB.js","/assets/Education-D9yJA6dG.js","/assets/EducationLesson-DdnU_Qjk.js","/assets/EmptyState-BtcnRJ8G.js","/assets/Equipment-B0by6v_J.js","/assets/Exam-CO8uBG00.js","/assets/ExamAdmin-C9r497Ld.js","/assets/Factories-DCSfiSXY.js","/assets/FactorySelect-8Undfqtq.js","/assets/Gamification-Cn0ZFiKB.js","/assets/GroupBadge-CNxE0j8g.js","/assets/HeatmapChart-M-VQ7blb.js","/assets/HourlyContainers-C7dPOkJ9.js","/assets/IdleCell-DzqgtMnF.js","/assets/IdleOwners-C93Y2iAe.js","/assets/IdleSolutions-DBDy9EzP.js","/assets/KPICard-BOXA2Yr2.js","/assets/Kaizen-BjPB2Wjw.js","/assets/Kelish-Bp1G0oeA.js","/assets/Kitchen-D-ynQ0cH.js","/assets/KpiBits-DcCy0Okf.js","/assets/KpiDeltaCard-DgVQ3GRR.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-QHfY69Qh.js","/assets/LeaderAppeal-f9ScEoZX.js","/assets/LeaderDailyTasks-DCg6iSSv.js","/assets/LeaderDayReport-DcUrT9in.js","/assets/LeaderNotCounting-D-WgJJqT.js","/assets/LeaderTasksAdmin-wk43NTO3.js","/assets/LeaderUnitReport-Dp9o12st.js","/assets/Leaderboard-D99I22cU.js","/assets/Leaders-BLOhXNdH.js","/assets/LeadersKpi-DfvDBxH7.js","/assets/Lightbox-NwjZ4sK6.js","/assets/LiveOverview-Bedi4kus.js","/assets/Login-Bmpp69KL.js","/assets/Logs-GJ243cRA.js","/assets/LostWorkers-C97A_Ufo.js","/assets/NotFound-BH1s6NGB.js","/assets/Notifications-Bpmyg1Q3.js","/assets/NotionTasks-BXgOsKLt.js","/assets/NotionTrackerSettings-OOgllkNQ.js","/assets/Ontime-CWZyocHZ.js","/assets/OrgChart-Ca2HJQnV.js","/assets/Ovens-ByhBADQ0.js","/assets/OvensSettings-CkexN-R_.js","/assets/Overview-BrHvfluV.js","/assets/OwnerChip-DDShSSfb.js","/assets/Pagination-pONXpHG1.js","/assets/People-Bck0Yp-Z.js","/assets/PerenaladkaFactTable-DoHN8smW.js","/assets/Permissions-C5xrVqNX.js","/assets/PersonCard-BLgimrCZ.js","/assets/PlanFulfillment-B0NduU4K.js","/assets/Production-zwrrhBnA.js","/assets/ProductionUpload-DL7pr9rV.js","/assets/Profile-DyskpJqf.js","/assets/ProfileAvatar-CaQy0XSR.js","/assets/ProfilesManagement-DDH5ScMC.js","/assets/ProofCamera-Dz4fGSrs.js","/assets/ProofPhoto-ch9rr3jZ.js","/assets/Quality-BT0NsT5I.js","/assets/RawRows-Cp5hO-tJ.js","/assets/Reports-BKl2M9V-.js","/assets/RequestStateChip-B8jTcPy1.js","/assets/RichTextEditor-B9hmiLoq.js","/assets/SaveState-x9DUZxZE.js","/assets/SdPanelSettings-C6xjMH0A.js","/assets/SearchInput-BqQA4vAr.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-D0AMnSJP.js","/assets/ShiftDaily-dgjjYvWJ.js","/assets/ShiftTimes-D8TFSXzg.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-BPTql4kR.js","/assets/StaffListAtCheck-BAzBzUV8.js","/assets/StatusBadge-BkAI80Ds.js","/assets/StatusBandsModal-DGQ6tR72.js","/assets/TargetGoal-8bPAhE4p.js","/assets/Targets-CUCx85FV.js","/assets/TaskFormModal-1LkP9hJ_.js","/assets/TaskerSettings-DwyeDCgy.js","/assets/Tasks-DzBF1NJH.js","/assets/TgProfile-D0cwFS4b.js","/assets/TimeWheelPicker-BBBzTqnf.js","/assets/Tooltip-BDc7an1P.js","/assets/TranslationsEditor-Bjz2Dpay.js","/assets/TrelloAnalytics-DYy5vvkZ.js","/assets/TrelloSettings-D-VDo67N.js","/assets/TrendChart-P9qK1ff6.js","/assets/TripleSpeedometer-BOknLg2i.js","/assets/Trudoyomkost-C1UtnaPP.js","/assets/UploadDropzone-cUqnbazA.js","/assets/UsersActivity-f01MqHoA.js","/assets/UsersManagement-CgFHrsq3.js","/assets/VerifixPage-CsFr4gWn.js","/assets/VerifixParity-BwuPRrng.js","/assets/VfxApiMap-Rw6V4Phz.js","/assets/VfxDictionaries-C6hInK65.js","/assets/VfxEmployees-DGZuGHVg.js","/assets/VfxHrMoves-8B9cWyaF.js","/assets/VfxJobs-Bu0wDZ3W.js","/assets/VfxPhoto-BZwD_lFX.js","/assets/VfxShifts-CV03xoyZ.js","/assets/VfxState-DKI-slUS.js","/assets/VfxTimebooks-BQH-_aif.js","/assets/VfxTimesheet-DnsRndp3.js","/assets/WatchProgress-DoNMcak_.js","/assets/WebLogin-CE-70L6-.js","/assets/WorkersAttendance-yik5mCLm.js","/assets/WorkersComposition-B2nFk8no.js","/assets/WorkersMovements-ClNusHzt.js","/assets/WorkersPage-BjIXjAN2.js","/assets/Zagruzka-uhR7Rxyn.js","/assets/ZagruzkaCell-iZlIUn3n.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BoHibzp_.js","/assets/api-D_IoyhCc.js","/assets/appealTask-NKUUh8PJ.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-Cp2eHNYN.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-pXpo1tDD.js","/assets/broadcastTree-CYwAowgC.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-DNnxorNx.js","/assets/categories-B0hZcVAh.js","/assets/cellMoveRefusal-9iqDqAop.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CKkBt6lO.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-Dcdu2fGQ.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-DKsBYorI.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DHl3R-Xv.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DQlsuR2j.js","/assets/index-DRUtSiuu.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BkqmCRyV.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/marks-Bi_Qc0wh.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-CBVEELOf.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BvhXes2e.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-tnlm0nlo.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-zmqPoE0m.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DUc5Yhnp.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DCqP1Xlb.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-Dh29NTIE.js","/assets/useMutation-BrGhCaPe.js","/assets/useOpenParam-C0o-u3tZ.js","/assets/useStatusBands-CqLC6m9Y.js","/assets/useUrlScope-BrC3UAjJ.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DN38aO30.js","/assets/uz_cyrl-CAJNzdyf.js","/assets/vfx-DwYApd6A.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-gbA1PwQZ.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
