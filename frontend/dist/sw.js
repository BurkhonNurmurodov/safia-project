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

const BUILD = "2026-11-23T10:53:57.428Z";
const PRECACHE = ["/","/assets/AdminPage-CjK3wonb.js","/assets/AdminTabs-KlEO0RNH.js","/assets/AiKeys-BRtO-u7I.js","/assets/AnalysisBoard-_WmghTR9.js","/assets/ApiAccess-zOS_VIDW.js","/assets/AppLauncher-DOTwGvSd.js","/assets/Arc-g05SDBuH.js","/assets/Assessment-BfnSWc8I.js","/assets/AssessmentGrade-C9A7EQc6.js","/assets/AssessmentList-DOR_5geg.js","/assets/Assistant-CH8P9wi0.js","/assets/AttendanceCleanup-C5Qmlial.js","/assets/AttendanceUpload-CF0AzLLJ.js","/assets/AuditTable-B7o-lNSs.js","/assets/Audits-Bo4HEVbT.js","/assets/BrigadirProfile-D3XdOwkL.js","/assets/BrigadirsKpi-Dy60g_Ie.js","/assets/Broadcast-Y3kZ1JUw.js","/assets/BroadcastReceivers-BdvKGIeY.js","/assets/BroadcastRecord-BLoa9Gyo.js","/assets/CatLockNotice-CiUppl4M.js","/assets/CategoryLegendModal-D1sIpENa.js","/assets/CellConcerns-Dk_KE0qy.js","/assets/CellDetails-I8qz9aYJ.js","/assets/CellFormModal-Chgd6vL0.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-CcrKhrjE.js","/assets/Cells-Bp2yUmBb.js","/assets/ColumnFilter-BoisWWNF.js","/assets/ColumnsPicker-DI-WgvMY.js","/assets/CommentsModal-BvHVtako.js","/assets/ComparisonTable-BGn_ldN8.js","/assets/Concerns-BmSyVgB2.js","/assets/ConcernsPieces-CLJb6YEI.js","/assets/ContainerFlow-Dr-5-Dsq.js","/assets/ContainerTotalsCard-CCGk8vsF.js","/assets/Containers-BeJ5Gc6x.js","/assets/CountStepper-DsY-9d13.js","/assets/Daily-DEz3lEU5.js","/assets/DataSources-BQRs2fmx.js","/assets/DataTable-BRcCNcW4.js","/assets/DateRangePicker-U-7JRNg3.js","/assets/DayReportView-B5piApA9.js","/assets/DayStepper-DvEi8Cp0.js","/assets/DayStrip-B-RQkF2r.js","/assets/DbBackup-I1k3mVtR.js","/assets/DifferenceBreakdown-CQ-T8-kg.js","/assets/DocAudit-CZ6OD6AJ.js","/assets/Downtime-DHPTkPJT.js","/assets/Education-DYbPDrsq.js","/assets/EducationLesson-Dx7uvxLx.js","/assets/EmptyState-CoGBcOX_.js","/assets/Equipment-ixPsTzCN.js","/assets/Exam-Ck4DubRI.js","/assets/ExamAdmin-Dr0HRhut.js","/assets/Factories-c7aawMMH.js","/assets/FactorySelect-1xnY7v3N.js","/assets/Gamification-NdMWwlnf.js","/assets/GroupBadge-D00kf6aV.js","/assets/HeatmapChart-zM3mmQrV.js","/assets/HourlyContainers-DUOvvcaM.js","/assets/IdleCell-CupdzSzQ.js","/assets/IdleOwners-BzTsMNcH.js","/assets/IdleSolutions-o_CwX5lP.js","/assets/KPICard-D_FfSswg.js","/assets/Kaizen-Dr3NOwYY.js","/assets/Kelish-FTLxB6Gn.js","/assets/Kitchen-oikveLSq.js","/assets/KpiBits-BELMQyXU.js","/assets/KpiDeltaCard-B1OJTnO5.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-D9-i7CEr.js","/assets/LeaderAppeal-B0sURs8m.js","/assets/LeaderDailyTasks-PZtICDrW.js","/assets/LeaderDayReport-DdaOuNO4.js","/assets/LeaderNotCounting-BiA0s7JR.js","/assets/LeaderTasksAdmin-a5TIMF0O.js","/assets/LeaderUnitReport-C2hiTzoU.js","/assets/Leaderboard-BVJXGPZn.js","/assets/Leaders-Cs6WxH3V.js","/assets/LeadersKpi-BaXW_rzb.js","/assets/Lightbox-CvQL1kvp.js","/assets/LiveOverview-BN3sAH2x.js","/assets/Login-BgNZ0qKn.js","/assets/Logs-QqmztfzH.js","/assets/LostWorkers-BD9eay-0.js","/assets/NotFound-CLGkLXZ3.js","/assets/Notifications-BEERo3Ov.js","/assets/NotionTasks-BNWy-6Oz.js","/assets/NotionTrackerSettings-D7GHRZBf.js","/assets/Ontime-13ZlqDMp.js","/assets/OrgChart-76IZgGoJ.js","/assets/Ovens-DAmpj4NG.js","/assets/OvensSettings-B4B09Lak.js","/assets/Overview-BzWn7TKe.js","/assets/OwnerChip-BZPJsogj.js","/assets/Pagination-Cd1ixfmO.js","/assets/People-p3-ZEp1v.js","/assets/PerenaladkaFactTable-BKonXV8a.js","/assets/Permissions-DjWZ6UB8.js","/assets/PersonCard-B2MhYU2b.js","/assets/PlanFulfillment-Bd3rKGB_.js","/assets/Production-Cdm64hJa.js","/assets/ProductionUpload-SBXG6wAM.js","/assets/Profile-DLYLOXrw.js","/assets/ProfileAvatar-CK2isazi.js","/assets/ProfilesManagement-C4XiiX7N.js","/assets/ProofCamera-fUJsZODv.js","/assets/ProofPhoto-BzURob38.js","/assets/Quality-UkP0dm5M.js","/assets/RawRows-Dmq_V-zq.js","/assets/Reports-BIaooI5I.js","/assets/RequestStateChip-GaSYWBjS.js","/assets/RichTextEditor-vfueteg-.js","/assets/SaveState-B2XNMY9U.js","/assets/SdPanelSettings-D6zPyWOZ.js","/assets/SearchInput-B4Brw0W5.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-DiCVThqa.js","/assets/ShiftDaily-awywD1ez.js","/assets/ShiftTimes-C8aJ-89U.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-CSaESKCL.js","/assets/StaffListAtCheck-BzSgoxKI.js","/assets/StatusBadge-CLkW2ndK.js","/assets/StatusBandsModal-BQi6_jhA.js","/assets/TargetGoal-DQG0mJvu.js","/assets/Targets-ByQ1otdS.js","/assets/TaskFormModal-DqSKjmOi.js","/assets/TaskerSettings-DDgUwJmm.js","/assets/Tasks-BHGUmqmJ.js","/assets/TgProfile-DXo17vMB.js","/assets/TimeWheelPicker-VP-IHH33.js","/assets/Tooltip-Cnf_Lhbl.js","/assets/TranslationsEditor-CQuZEZ9V.js","/assets/TrelloAnalytics-Ch15GdN8.js","/assets/TrelloSettings-tc58S51N.js","/assets/TrendChart-Mo4j4W6m.js","/assets/TripleSpeedometer-D4Zfww_n.js","/assets/Trudoyomkost-CbDEauFL.js","/assets/UploadDropzone-CnbvXkr8.js","/assets/UsersActivity-CZnoi2-6.js","/assets/UsersManagement-D6yS4o4f.js","/assets/VerifixPage-BTFcR676.js","/assets/VerifixParity-Dzk5XyJy.js","/assets/VfxApiMap-EAzRenyO.js","/assets/VfxDictionaries-BG_6hR6W.js","/assets/VfxEmployees-Cf-AZ_Gr.js","/assets/VfxHrMoves-C99jb5Sy.js","/assets/VfxJobs-BOPyeD7N.js","/assets/VfxPhoto-Bo_IMebX.js","/assets/VfxShifts-Bymhs_Q1.js","/assets/VfxState-BqDth-Hn.js","/assets/VfxTimebooks-1TI3znI_.js","/assets/VfxTimesheet-Dgi0Ncf3.js","/assets/WatchProgress-DuXujJD_.js","/assets/WebLogin-1iBdNERi.js","/assets/WorkersAttendance-D0SEM-2M.js","/assets/WorkersComposition-DIHgJ2_p.js","/assets/WorkersMovements-DfIaUWGb.js","/assets/WorkersPage-CaxhAX7d.js","/assets/Zagruzka-DOlolgsL.js","/assets/ZagruzkaCell-CQUIpGBP.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-B9gxdcX8.js","/assets/api-D_IoyhCc.js","/assets/appealTask-C1ifx8dY.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BRnovPUk.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-blIGqF-v.js","/assets/broadcastTree-decgMxkN.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-BEONT0en.js","/assets/categories-DvmQZ6fZ.js","/assets/cellMoveRefusal-b6XSoO2x.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-8qywUYkY.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en--90liF4e.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-D7QLuDeQ.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-_D-Nye8y.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CewTChYZ.js","/assets/index-DOoyy-bQ.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CQXHd4wK.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BB5zOK5V.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-Byp0o5O1.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-sZNZK9Tt.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-BjMWuZkR.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CaR3WuTF.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-gUuHZrlo.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CT-7hB12.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-D-ctV6Do.js","/assets/useMutation-JMJTPTd8.js","/assets/useOpenParam-BPnyo7eE.js","/assets/useStatusBands-DgfnXSnQ.js","/assets/useUrlScope-AdmxQ1uG.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-CtG2Na-H.js","/assets/uz_cyrl-6E50V38S.js","/assets/vfx-C7qunTg_.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-BHlXeJTc.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
