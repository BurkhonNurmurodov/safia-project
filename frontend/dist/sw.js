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

const BUILD = "2026-11-20T17:29:47.105Z";
const PRECACHE = ["/","/assets/ActionMenu-BZzu7zrY.js","/assets/AdminPage-D9qofkMN.js","/assets/AdminTabs-CNqkeY-A.js","/assets/AiKeys-Dl4ksCTT.js","/assets/AnalysisBoard-C-vnZw4r.js","/assets/ApiAccess-CosE6vnf.js","/assets/AppLauncher-CrWf0lRo.js","/assets/Arc-Df_Zmq47.js","/assets/Assessment-BfgoHAQd.js","/assets/AssessmentGrade-CP68Xal2.js","/assets/AssessmentList-DrMJj1Oa.js","/assets/Assistant-BlLi7L-C.js","/assets/AttendanceCleanup-DV4O3JNk.js","/assets/AttendanceUpload-C5jB5r9L.js","/assets/AuditTable-BoDWoKnu.js","/assets/BrigadirProfile-ClM_8Ctq.js","/assets/BrigadirsKpi-Dur2bzHU.js","/assets/Broadcast-DLgjq43K.js","/assets/BroadcastReceivers-sH9T16E7.js","/assets/BroadcastRecord-59k8FTSG.js","/assets/Button-Cw9TgpPn.js","/assets/CatLockNotice-DnC0DlAN.js","/assets/CategoryLegendModal-DWPHmE1D.js","/assets/CellConcerns-pZ-d04fm.js","/assets/CellDetails-udBFQAoh.js","/assets/CellFormModal-NIPspxG3.js","/assets/CellIdent-B2BZgTE4.js","/assets/CellLink-BMSmopZt.js","/assets/Cells-BfWBqfDN.js","/assets/ColumnFilter-VKkrC3gC.js","/assets/ColumnsPicker-DQNck5P3.js","/assets/CommentsModal-BKbn_pLy.js","/assets/ComparisonTable-B3NHahLy.js","/assets/Concerns-oyzC0wA2.js","/assets/ConcernsPieces-CJJBw5KW.js","/assets/ContainerFlow-BFJoQCN9.js","/assets/ContainerTotalsCard-BAkXZucG.js","/assets/Containers-D89UNMjx.js","/assets/CountStepper-S8h6NJm6.js","/assets/Daily-CgCn49Ey.js","/assets/DataSources-DTQ4Yk2H.js","/assets/DataTable-CSy0m7BH.js","/assets/DateRangePicker-DgJr3Txt.js","/assets/DayReportView-xfG4B0Qd.js","/assets/DayStepper-Nc3WLQ45.js","/assets/DayStrip-Y8aKMYaZ.js","/assets/DbBackup-Cih8yY8H.js","/assets/DifferenceBreakdown-aw3l6tjO.js","/assets/DocAudit-DKMKC8-r.js","/assets/Downtime-CTlc7Soo.js","/assets/Education-BC-a8sHc.js","/assets/EducationLesson-B0bqYztY.js","/assets/EmptyState-DMgqZYJd.js","/assets/Equipment-CHc1ZHNx.js","/assets/Exam-Bp67YFtO.js","/assets/ExamAdmin-D87Hwl8q.js","/assets/Factories-BU57IH3n.js","/assets/FactorySelect-jpxLFwqi.js","/assets/Gamification-DfNWS8m2.js","/assets/GroupBadge-CMGAi9AK.js","/assets/HeatmapChart-CiygJ_oM.js","/assets/HourlyContainers-uIVsrNZs.js","/assets/IdleCell-1rsX1wKa.js","/assets/IdleOwners-CoK9ak74.js","/assets/IdleSolutions-5bYLcU21.js","/assets/KPICard-DNa4DpAA.js","/assets/Kaizen-DoaU0WL7.js","/assets/Kelish-BFqWMgqi.js","/assets/Kitchen-DPTdHHeu.js","/assets/KpiBits-DPyMqShW.js","/assets/KpiDeltaCard--zJUBziw.js","/assets/LangContext-kvphpcq0.js","/assets/LangTextInput-yg9bp6AJ.js","/assets/Layout-BTUfKLwa.js","/assets/LeaderAppeal-c3zVSHkN.js","/assets/LeaderDailyTasks-BPHYMMKH.js","/assets/LeaderDayReport-BM6YiPJH.js","/assets/LeaderNotCounting-PgahIbND.js","/assets/LeaderTasksAdmin-CeVROCgf.js","/assets/LeaderUnitReport-CQ_VMskE.js","/assets/Leaderboard-BqzQWGL2.js","/assets/Leaders-CWJuGeKC.js","/assets/LeadersKpi-Dr6fyEZo.js","/assets/Lightbox-DpkrWtHl.js","/assets/LiveOverview-BANYVH28.js","/assets/Login-CcHL25cG.js","/assets/Logs-Bt3UaBfj.js","/assets/LostWorkers-D7tV6bVe.js","/assets/NotFound-CKBoWiWf.js","/assets/Notifications-BwXBrZQU.js","/assets/NotionTasks-cfNlEcr3.js","/assets/NotionTrackerSettings-BroYuCJb.js","/assets/Ontime-CbTU7Pa0.js","/assets/OrgChart-CHIyGBco.js","/assets/Ovens-COENzfUn.js","/assets/OvensSettings-D8s0ylLA.js","/assets/Overview-B56gUfiJ.js","/assets/OwnerChip-BniUiMqp.js","/assets/Pagination-Duc3pVUL.js","/assets/People-BTo9EwKd.js","/assets/PerenaladkaFactTable-DuD_v1GM.js","/assets/Permissions-BWePYi7S.js","/assets/PersonCard-6VFH-Exv.js","/assets/PlanFulfillment-BlRuLVVw.js","/assets/Production-DbZolqCk.js","/assets/ProductionUpload-D4Wtltqv.js","/assets/Profile-KEHwAZQl.js","/assets/ProfileAvatar-DEVAZLzl.js","/assets/ProfilesManagement-C560WTQS.js","/assets/ProofCamera-Bvw8AN85.js","/assets/ProofPhoto-D-vovHOg.js","/assets/Quality-BO4cS4KA.js","/assets/RawRows-BwME3bqZ.js","/assets/Reports-Ddb-hvBj.js","/assets/RequestStateChip-DlL2MMjG.js","/assets/RichTextEditor-HsUeolSN.js","/assets/SaveState-DElfIMdZ.js","/assets/SdPanelSettings-C8DhN9xI.js","/assets/SearchInput-DERMgY4M.js","/assets/SeasonalityHeatmap-Dmv370F9.js","/assets/SegmentedToggle-vCD2mY5H.js","/assets/SetupTimes-CEZjslHw.js","/assets/ShiftDaily-Cg6B0ZSr.js","/assets/ShiftTimes-5yVIURaB.js","/assets/SortableList-BFuG9Kci.js","/assets/Staff-CDPWEby6.js","/assets/StaffListAtCheck-22eG7uU6.js","/assets/StatusBadge-DWxaQgPP.js","/assets/StatusBandsModal-B1WcyBDc.js","/assets/TargetGoal-K19o_wFI.js","/assets/Targets-klRLp0Xh.js","/assets/TaskFormModal-YEN6ItYm.js","/assets/TaskerSettings-CtgwAZEg.js","/assets/Tasks-Cqf49lWQ.js","/assets/TgProfile-XjnBfes3.js","/assets/TimeWheelPicker-BDGAk5Oq.js","/assets/Toast-DgFN577d.js","/assets/Tooltip-DMbb0fwb.js","/assets/TranslationsEditor-Bhj5mMjz.js","/assets/TrelloAnalytics-Mwyk4l-l.js","/assets/TrelloSettings-BKHxOno8.js","/assets/TrendChart-C0Jfygvg.js","/assets/TripleSpeedometer-D_oVNPWf.js","/assets/Trudoyomkost-Ddohx_rJ.js","/assets/UploadDropzone-qnTFse6I.js","/assets/UsersActivity-BgiDsHjE.js","/assets/UsersManagement-B_1-vUvC.js","/assets/VerdictBlock-D5IOlQAo.js","/assets/VerifixPage-BbZNCFuC.js","/assets/VerifixParity-BXi3xTtq.js","/assets/VfxApiMap-BTACkRHD.js","/assets/VfxDictionaries-BJwEro5w.js","/assets/VfxEmployees-DcvFfS7S.js","/assets/VfxHrMoves-BTx7onew.js","/assets/VfxJobs-BZbnkxZZ.js","/assets/VfxPhoto-DRHUUkMa.js","/assets/VfxShifts-BaU180wh.js","/assets/VfxState-CMwAlgNi.js","/assets/VfxTimebooks-DQcfXKnm.js","/assets/VfxTimesheet-C2NEU7wj.js","/assets/WatchProgress-CiaLF7Bn.js","/assets/WebLogin-BeGBpMdb.js","/assets/WorkersAttendance-DC595ln9.js","/assets/WorkersComposition-BLnnbqel.js","/assets/WorkersMovements-DZzmuKZE.js","/assets/WorkersPage-Rfey0vQG.js","/assets/Zagruzka-CBAESyum.js","/assets/ZagruzkaCell-DdSn4Fc-.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-B6WeBx6h.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CFO5pN8D.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CeenIElk.js","/assets/broadcastTree-CaSV5YPJ.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-Bh913R4H.js","/assets/categories-B0u6-KC_.js","/assets/cellMoveRefusal-CQunV1Tv.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Caq34vEw.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-q30EaDp0.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-CJpo_4e6.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BwoAqdtL.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CYGTQMTl.css","/assets/index-QJHnOXBi.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DWBQYl9k.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DIcrE5dq.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-qGN-Bg9a.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CxYdYhV5.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-BloV7sZF.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-J5iJCYtd.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CaGLXA6v.js","/assets/ru-Cid514wI.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-DKQRlJ1A.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CH8lC_Nz.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CL1ohaqm.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CGN69dPr.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DS5slwzr.js","/assets/useMutation-B9fvF6tM.js","/assets/useOpenParam-BOd8AsJv.js","/assets/useStatusBands-DbIEFY4Y.js","/assets/useUrlScope-csKEFQRs.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-B-zpQHgs.js","/assets/uz_cyrl-DLk_qxCc.js","/assets/vfx-D0CvLJd1.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-CA11EZJj.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/x-CfYkDDdF.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
