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

const BUILD = "2026-11-22T07:44:42.546Z";
const PRECACHE = ["/","/assets/AdminPage-CGQIOdGz.js","/assets/AdminTabs-UM2oyTaS.js","/assets/AiKeys-B8fj9hXJ.js","/assets/AnalysisBoard-D_aWkcFD.js","/assets/ApiAccess-CrCRfpaj.js","/assets/AppLauncher-BmwKqeOQ.js","/assets/Arc-DgYiOQon.js","/assets/Assessment-R3kN0_gS.js","/assets/AssessmentGrade-efXz-ieW.js","/assets/AssessmentList-USIbo2Hd.js","/assets/Assistant-B9jhs-aS.js","/assets/AttendanceCleanup-BrA07A9X.js","/assets/AttendanceUpload-C9-E28Kf.js","/assets/AuditTable-B4mB7CQe.js","/assets/Audits-CDHC4JVz.js","/assets/BrigadirProfile-CZu6bTUD.js","/assets/BrigadirsKpi-CacQ2yQS.js","/assets/Broadcast-DM3jry5J.js","/assets/BroadcastReceivers-r5PxpRpE.js","/assets/BroadcastRecord-B2sWOfzk.js","/assets/CatLockNotice-wnHvFZ2E.js","/assets/CategoryLegendModal-5VaDyZHN.js","/assets/CellConcerns-Ci34DmXy.js","/assets/CellDetails-CH0SsFE9.js","/assets/CellFormModal-lE-pGfAC.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-DltxBXjX.js","/assets/Cells-BOwhUIHD.js","/assets/ColumnFilter-uHoHY-KD.js","/assets/ColumnsPicker-Cn5yzDsi.js","/assets/CommentsModal-BvfCGg6k.js","/assets/ComparisonTable-B71pEW7Z.js","/assets/Concerns-CFJRrx-L.js","/assets/ConcernsPieces-CjibnR4B.js","/assets/ContainerFlow-Tfh9i7pI.js","/assets/ContainerTotalsCard-CFS7_wBT.js","/assets/Containers-CSsYyXGC.js","/assets/CountStepper-CkB8B7J7.js","/assets/Daily-MxX4kKI5.js","/assets/DataSources-Dd5FjJlg.js","/assets/DataTable-Cvbv8qHP.js","/assets/DateRangePicker-BEzOJwun.js","/assets/DayReportView-CCoy0HGE.js","/assets/DayStepper-Dwt2zhV5.js","/assets/DayStrip-DdDu4-UG.js","/assets/DbBackup-DeiJpOnn.js","/assets/DifferenceBreakdown-C9nYhuWq.js","/assets/DocAudit-2mIP6w1g.js","/assets/Downtime-9qOo0Gl0.js","/assets/Education-BYqW5QRc.js","/assets/EducationLesson-DUSA6mlf.js","/assets/EmptyState-BX_cPDEW.js","/assets/Equipment-ByE93j7M.js","/assets/Exam-BjwSfh36.js","/assets/ExamAdmin-Cb3v4S4M.js","/assets/Factories-DBuYe5ji.js","/assets/FactorySelect-D0mU95vV.js","/assets/Gamification-Cw-GM70Z.js","/assets/GroupBadge-CuXICHCA.js","/assets/HeatmapChart-DPLUP6IK.js","/assets/HourlyContainers-DlAk3reo.js","/assets/IdleCell-B2IFG-Xs.js","/assets/IdleOwners-n_gZXgys.js","/assets/IdleSolutions--Wzhassb.js","/assets/KPICard-BfUfM7CE.js","/assets/Kaizen-DS8Pj1Ye.js","/assets/Kelish-CY7Zog3w.js","/assets/Kitchen-CUuwIZEO.js","/assets/KpiBits-CBBt2iPh.js","/assets/KpiDeltaCard-usGJndqE.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-O0ifN4dy.js","/assets/LeaderAppeal-D0Y5f674.js","/assets/LeaderDailyTasks-D52bD_Uv.js","/assets/LeaderDayReport-CkZrWVXG.js","/assets/LeaderNotCounting-PHYdfrWf.js","/assets/LeaderTasksAdmin-s-2RMsTz.js","/assets/LeaderUnitReport-CDDHpjTP.js","/assets/Leaderboard-DBKzi7zI.js","/assets/Leaders-CzBfNu5P.js","/assets/LeadersKpi-8VyMnYC1.js","/assets/Lightbox-C9-pCkLQ.js","/assets/LiveOverview-BaL903Kk.js","/assets/Login-BT8bIB_6.js","/assets/Logs-NJugJIII.js","/assets/LostWorkers-BjpnBcWY.js","/assets/NotFound-CFcaT7wg.js","/assets/Notifications-DVwa-gV3.js","/assets/NotionTasks-Dj5cYAuJ.js","/assets/NotionTrackerSettings-BNwXNbAX.js","/assets/Ontime-DYYI-2we.js","/assets/OrgChart-BSg8w_8L.js","/assets/Ovens-D-gS9yBs.js","/assets/OvensSettings-CJV0E0PV.js","/assets/Overview-B8jxu3pU.js","/assets/OwnerChip-CVAAR5he.js","/assets/Pagination-BqKcfbn8.js","/assets/People-qbys4Fg_.js","/assets/PerenaladkaFactTable-BKHaHW1i.js","/assets/Permissions-BGtCZbHz.js","/assets/PersonCard-Dy0y2HLm.js","/assets/PlanFulfillment-DIOdmtdS.js","/assets/Production-C8PdFtVW.js","/assets/ProductionUpload-B93wkRQh.js","/assets/Profile-C_L83tT8.js","/assets/ProfileAvatar-blhehsmS.js","/assets/ProfilesManagement-vooTmSy4.js","/assets/ProofCamera-D1kXpf2J.js","/assets/ProofPhoto-7F4sLt3R.js","/assets/Quality-BmkQ42N2.js","/assets/RawRows-CK7ET62O.js","/assets/Reports-WmoENH45.js","/assets/RequestStateChip-Dt2NFOm_.js","/assets/RichTextEditor-C7dw3O7H.js","/assets/SaveState-C4mO2yum.js","/assets/SdPanelSettings-BPXewqco.js","/assets/SearchInput-CVIULvGF.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-C9MNe1PP.js","/assets/ShiftDaily-CuwpN4rr.js","/assets/ShiftTimes-DF3kjexK.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-DltzxyKx.js","/assets/StaffListAtCheck-Tup_96Hv.js","/assets/StatusBadge-Dv43u6lP.js","/assets/StatusBandsModal-BwVH0e7F.js","/assets/TargetGoal-R1uU9n3l.js","/assets/Targets-DxCsUtPo.js","/assets/TaskFormModal-BsKE1b98.js","/assets/TaskerSettings-DA9inIw_.js","/assets/Tasks-DjK7MKxU.js","/assets/TgProfile-BmDCh7Vx.js","/assets/TimeWheelPicker-ClcgZfpq.js","/assets/Tooltip-B_wTPqyF.js","/assets/TranslationsEditor-D1AXseSw.js","/assets/TrelloAnalytics-BUk3Rmhe.js","/assets/TrelloSettings-AoiPpch0.js","/assets/TrendChart-CLE_4Jyk.js","/assets/TripleSpeedometer-9YBlOyDC.js","/assets/Trudoyomkost-BGQeDo5Q.js","/assets/UploadDropzone-DCr-3ZNg.js","/assets/UsersActivity-HoD8ASIQ.js","/assets/UsersManagement-ZMef0Q5l.js","/assets/VerifixPage-BmmAyZHc.js","/assets/VerifixParity-BJ-3snqV.js","/assets/VfxApiMap-0IAoqI4A.js","/assets/VfxDictionaries-B5XQ9jRW.js","/assets/VfxEmployees-Cg54ofID.js","/assets/VfxHrMoves-CtcTqBGx.js","/assets/VfxJobs-3zzLALf5.js","/assets/VfxPhoto-DyiS_Kfa.js","/assets/VfxShifts-2jgH02Aj.js","/assets/VfxState-B18TwWlj.js","/assets/VfxTimebooks--uXrCPUU.js","/assets/VfxTimesheet-DwXecF8t.js","/assets/WatchProgress-CWH64h-v.js","/assets/WebLogin-DuOzNgJ8.js","/assets/WorkersAttendance-BuhU__HX.js","/assets/WorkersComposition-Bp9v8o-G.js","/assets/WorkersMovements-C064yCx2.js","/assets/WorkersPage-C5FVOeLw.js","/assets/Zagruzka-BNxNuP2E.js","/assets/ZagruzkaCell-DQZSaj0i.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Dnv93tV9.js","/assets/api-D_IoyhCc.js","/assets/appealTask-CuWGwiJk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BsEX1ijH.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-g3-aiPOt.js","/assets/broadcastTree-C4ZsosJ4.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-DLenT2bU.js","/assets/categories-BFmlbecV.js","/assets/cellMoveRefusal-DqUwaCzh.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BnpYr0jX.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-CTpK7was.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-DEXfyqG4.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CvOz1jC7.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DziCR3W9.css","/assets/index-XeLMqLjJ.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DJWtZZtK.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CDvi1sRR.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-DKUcja4O.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BtKTrVpR.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-Bri6I6CI.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-jKxL8xRP.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CYXMqwsb.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BDP2A619.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-DCRBg9iX.js","/assets/useMutation-C1n3dhvp.js","/assets/useOpenParam-Brwd9mN6.js","/assets/useStatusBands-D0HP0DAV.js","/assets/useUrlScope-DtoU0_fx.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-B0hjtZsH.js","/assets/uz_cyrl-bd2GbIan.js","/assets/vfx-CFA6lvLZ.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-DtkrD4Gg.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
