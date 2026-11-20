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

const BUILD = "2026-11-20T14:58:19.613Z";
const PRECACHE = ["/","/assets/ActionMenu-DIjho2bj.js","/assets/AdminPage-BN7-zNNS.js","/assets/AdminTabs-CrqoFuCZ.js","/assets/AiKeys-CbVYPZPT.js","/assets/AnalysisBoard-DV9aSPtt.js","/assets/ApiAccess-3kh2NWQD.js","/assets/AppLauncher-B4Mnwgky.js","/assets/Arc-CHtuiTEW.js","/assets/Assessment-ConFVS5F.js","/assets/AssessmentGrade-DxFU8RpP.js","/assets/AssessmentList-Dwcf35WQ.js","/assets/Assistant-Bzhv8ic3.js","/assets/AttendanceCleanup-WqbzQwWs.js","/assets/AttendanceUpload-vXyteLi6.js","/assets/AuditTable-zxC5Pid1.js","/assets/BrigadirProfile-NmSePo_H.js","/assets/BrigadirsKpi-Bw-5La_X.js","/assets/Broadcast-4mWFx5Tw.js","/assets/BroadcastReceivers-BIESvIRq.js","/assets/BroadcastRecord-CchaMzjl.js","/assets/Button-BByRB7Le.js","/assets/CatLockNotice-Dt7pBQXr.js","/assets/CategoryLegendModal-C8HO6qWD.js","/assets/CellConcerns-DKVQ6VE-.js","/assets/CellDetails-Ca4pmivI.js","/assets/CellFormModal-7UGX3yoB.js","/assets/CellIdent-DE6qkdqd.js","/assets/CellLink-CCfr3EDx.js","/assets/Cells-DOuQyLap.js","/assets/ColumnFilter-CYaSgX9K.js","/assets/ColumnsPicker-Chn7wRYZ.js","/assets/CommentsModal-D_6wN_xM.js","/assets/ComparisonTable-DIlJ3d35.js","/assets/Concerns-C-eK4OkB.js","/assets/ConcernsPieces-B-whO1LU.js","/assets/ContainerFlow-C2NwO2CI.js","/assets/ContainerTotalsCard-BJQplnmh.js","/assets/Containers-CfB6u9er.js","/assets/CountStepper-BFssUnfb.js","/assets/Daily-GO3bEY_B.js","/assets/DataSources-DkazrFoq.js","/assets/DataTable-B-XNGIye.js","/assets/DateRangePicker-DEw7XgZD.js","/assets/DayReportView-BigVGSJD.js","/assets/DayStepper-KFeEnAlm.js","/assets/DayStrip-Dw-NAPe9.js","/assets/DbBackup-D1Zso8Vz.js","/assets/DifferenceBreakdown-C80pOfbz.js","/assets/DocAudit-COgtr08z.js","/assets/Downtime-D_X3CxPl.js","/assets/Education-Bl0yIVX1.js","/assets/EducationLesson-BjpPkuQ5.js","/assets/EmptyState-BX82uwKj.js","/assets/Equipment-BA-uo78W.js","/assets/Exam-DHNXUCEB.js","/assets/ExamAdmin-BFjzlJZr.js","/assets/Factories-CV5nN-nM.js","/assets/FactorySelect-CJjUGNIG.js","/assets/Gamification-C1HHBGvi.js","/assets/GroupBadge-Bk9Qgn-Q.js","/assets/HeatmapChart-Bbt0hAu7.js","/assets/HourlyContainers-BACJ4LSy.js","/assets/IdleCell-BSrGyOfB.js","/assets/IdleOwners-BoITnnQq.js","/assets/IdleSolutions-DJ9KFp9D.js","/assets/KPICard-Cw5WW5n_.js","/assets/Kaizen-D8dJAuiu.js","/assets/Kelish-DHMhb0GD.js","/assets/Kitchen-Ch7hGu-r.js","/assets/KpiBits-DdZDGty-.js","/assets/KpiDeltaCard--Y4iOMbf.js","/assets/LangContext-2A4sPKlL.js","/assets/LangTextInput-Kofaohjz.js","/assets/Layout-CLvOE5eK.js","/assets/LeaderAppeal-DAosl8zP.js","/assets/LeaderDailyTasks-C-oSyMjU.js","/assets/LeaderDayReport-BE6DAx78.js","/assets/LeaderNotCounting-nWnuq1gB.js","/assets/LeaderTasksAdmin-B1wPiuXl.js","/assets/LeaderUnitReport-DkYK7HGH.js","/assets/Leaderboard-BwTRyZ_p.js","/assets/Leaders-B8TLkuAh.js","/assets/LeadersKpi-DrIpN1Ec.js","/assets/Lightbox--W_XKy1M.js","/assets/LiveOverview-CjOnuI47.js","/assets/Login-BEU3D22p.js","/assets/Logs-D6JfsUEM.js","/assets/LostWorkers-B72P-izG.js","/assets/Meter-CRRHrYuq.js","/assets/NotFound-CqzBZqkU.js","/assets/Notifications-DylETHBy.js","/assets/NotionTasks-B1w0nz4C.js","/assets/NotionTrackerSettings-DOri9Vyz.js","/assets/Ontime-BV9LQFA3.js","/assets/OrgChart-D-Yai24D.js","/assets/Ovens-BZjh6ju2.js","/assets/OvensSettings-B8KptHFZ.js","/assets/Overview-C1HFldNy.js","/assets/OwnerChip-C4ziSVxi.js","/assets/Pagination-ZfwlGhpo.js","/assets/People-BDgOJf4H.js","/assets/PerenaladkaFactTable-CQAhpABM.js","/assets/Permissions-BJQvanPv.js","/assets/PersonCard-Dn33EqZY.js","/assets/PlanFulfillment-DiNy5z3m.js","/assets/Production-BtUlf0rU.js","/assets/ProductionUpload-BzHX3P5F.js","/assets/Profile-BRzqP3BK.js","/assets/ProfileAvatar-D0xQd7h6.js","/assets/ProfilesManagement-uDtiTuRH.js","/assets/ProofCamera-CaURufzg.js","/assets/ProofPhoto-BhAOgdjG.js","/assets/Quality-BdBavuBA.js","/assets/RawRows-CJusQuDF.js","/assets/Reports-BizYA1yE.js","/assets/RequestStateChip-BilJTWS8.js","/assets/RichTextEditor-vlcoBf2t.js","/assets/SaveState-D6LNtMFm.js","/assets/SdPanelSettings-CGylPzol.js","/assets/SearchInput-CKWXaK0D.js","/assets/SeasonalityHeatmap-B65j5wfW.js","/assets/SegmentedToggle-CIxWlaZZ.js","/assets/SetupTimes-k8tztIfB.js","/assets/ShiftDaily-DK35oDwI.js","/assets/ShiftTimes-C0p8OCZX.js","/assets/SortableList-DgrUPWKx.js","/assets/Staff-Da42oMSi.js","/assets/StaffListAtCheck-DwjuHPfh.js","/assets/StatusBadge-Cz-vJYpU.js","/assets/StatusBandsModal-NsTGgRvN.js","/assets/TargetGoal-BtlCy2BL.js","/assets/Targets-B7dpPxMt.js","/assets/TaskFormModal-i1ub07rI.js","/assets/TaskerSettings-CJUFkAPR.js","/assets/Tasks-Ob3-fwik.js","/assets/TgProfile-DaorG1JV.js","/assets/TimeWheelPicker-CCyIyQPk.js","/assets/Toast-DLkPq-u6.js","/assets/Tooltip-Cd0j8XOq.js","/assets/TranslationsEditor-MZLfrAB9.js","/assets/TrelloAnalytics-DdKKH9vP.js","/assets/TrelloSettings-BbrDkDGg.js","/assets/TrendChart-BwdAPUvw.js","/assets/TripleSpeedometer-DmBotLl7.js","/assets/Trudoyomkost-CpWjfUBE.js","/assets/UploadDropzone-Ckl6lJR3.js","/assets/UsersActivity-CPill9iz.js","/assets/UsersManagement-D1-FG4mz.js","/assets/VerdictBlock-ClxCK9kn.js","/assets/VerifixPage-B5jsi3jS.js","/assets/VerifixParity-BMWYLrc4.js","/assets/VfxApiMap-Bz_jhduO.js","/assets/VfxDictionaries-Bd-3Dc7M.js","/assets/VfxEmployees-aG50epDz.js","/assets/VfxHrMoves-BEtG2pzP.js","/assets/VfxJobs-BMqC_co2.js","/assets/VfxPhoto-w3syL_sO.js","/assets/VfxShifts-B7Iy3OvN.js","/assets/VfxState-CRh88QAs.js","/assets/VfxTimebooks-DDYBomrx.js","/assets/VfxTimesheet-CV9Zg73x.js","/assets/WatchProgress-BaH5pUSV.js","/assets/WebLogin-C8Bwe_Ee.js","/assets/WorkersAttendance-RcD2iGo9.js","/assets/WorkersComposition-Cy1k0d7F.js","/assets/WorkersMovements-BU2aL_UF.js","/assets/WorkersPage-BLkmQFf8.js","/assets/Zagruzka-BNHLDZsi.js","/assets/ZagruzkaCell-KZUgUvfG.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DLF2tVvF.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-THHC7sOQ.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Db6Atx5r.js","/assets/broadcastTree-keY6fmPr.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-D8LfjzI7.js","/assets/categories-BSpR3fMM.js","/assets/cellMoveRefusal-C7nDtf7u.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-GOxZlIRa.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Bj5M2w1Y.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-DIxZ0-cF.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BH54YsjB.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-B9HOgJ8c.js","/assets/index-D9__53Y7.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CwfwRIMH.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DFD71TPt.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CaZl1ktg.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CUBVn8lY.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-BsRybIog.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-MBeOZyyD.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-C7BM6nmG.js","/assets/ru-DGWF4A80.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-B1G1t8hr.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-COvYEEEa.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-ChfDr16y.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-B0PQOb88.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-nehs19I1.js","/assets/useMutation-BTeOQd9S.js","/assets/useOpenParam-CWJjRXI2.js","/assets/useStatusBands-jTuIHQuR.js","/assets/useUrlScope-66jC7fbK.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DcXvQFe3.js","/assets/uz_cyrl-NwlRAqn6.js","/assets/vfx-CKesunCQ.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-Dxj0YNG0.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/x-CfYkDDdF.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
