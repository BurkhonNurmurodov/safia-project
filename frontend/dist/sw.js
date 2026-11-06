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

const BUILD = "2026-11-06T14:12:01.769Z";
const PRECACHE = ["/","/assets/ActionHistory-BPO3kAOu.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-0iJ666rs.js","/assets/AiKeys-DP0UT3U9.js","/assets/AnalysisBoard-CEA2zSYk.js","/assets/AppLauncher-Bo42tsEI.js","/assets/Arc-D8n4j8Gx.js","/assets/Assessment-D9b7iVca.js","/assets/AssessmentGrade-jOLYAgLF.js","/assets/AssessmentList-we6c2NC2.js","/assets/Assistant-7hRzZ2-Y.js","/assets/AttendanceCleanup-ypRsPO3i.js","/assets/AttendanceUpload-YFQVdQDb.js","/assets/AuditTable-MOfWTPoJ.js","/assets/BrigadirProfile-Ba2IRuTw.js","/assets/BrigadirsKpi-DNnpEACL.js","/assets/Broadcast-BdEGaZWb.js","/assets/BroadcastReceivers-BfJ55GkF.js","/assets/BroadcastRecord-DHhEY4zK.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-XuyFfhOQ.js","/assets/CategoryLegendModal-B8pgd2GE.js","/assets/CellConcerns-BA3_PQm4.js","/assets/CellDetails-DQEqUoL4.js","/assets/CellFormModal-CASlLONI.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-DivTci3w.js","/assets/Cells-2RfH9d11.js","/assets/ColumnFilter-BxzYumLd.js","/assets/ColumnsPicker-CbYAq6va.js","/assets/CommentsModal-Bo9kLeP3.js","/assets/ComparisonTable--rPDzLLn.js","/assets/Concerns-CpwYgHDe.js","/assets/ConcernsPieces-B3R9G2F2.js","/assets/CountStepper-CBn22nUq.js","/assets/Daily-BmGad2Rm.js","/assets/DataSources-Cl8tourj.js","/assets/DataTable-CmRkJ0q2.js","/assets/DateRangePicker-Bdfvm3kr.js","/assets/DayReportView-DWdACsqX.js","/assets/DayStepper-BCyohj04.js","/assets/DayStrip-BDCTvzqu.js","/assets/DbBackup-BhDduN9V.js","/assets/DifferenceBreakdown-DEj2ddYz.js","/assets/DocAudit-DtRxY41B.js","/assets/Downtime-CmYzm-YJ.js","/assets/Education-D3vPMfax.js","/assets/EducationLesson-BMfXiFPh.js","/assets/EmptyState-BwX6ZJ1t.js","/assets/Exam-C7GHXUtN.js","/assets/ExamAdmin-CRaP7f0H.js","/assets/Factories-p0ZfoRTq.js","/assets/FactorySelect-huJgf0-e.js","/assets/Gamification-CfgHFxEe.js","/assets/GroupBadge-BOK8MBj0.js","/assets/HeatmapChart-Dvi4In4T.js","/assets/IdleCell-tmnl5ZG-.js","/assets/IdleOwners-BLdyFa-l.js","/assets/IdleSolutions-D7K8tlBR.js","/assets/IdleSource-BB6fnhbq.js","/assets/KPICard-BAw3n683.js","/assets/Kaizen-A7Vd1FHO.js","/assets/Kelish-BQVUjCJF.js","/assets/KpiBits-DP8va_TD.js","/assets/KpiDeltaCard-POO37_DM.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-wK-GSKm3.js","/assets/LeaderAppeal-CWSqmxnM.js","/assets/LeaderCutoffs-Bd8gUL0M.js","/assets/LeaderDailyTasks-CxUGrUgS.js","/assets/LeaderDayExclusions-DDect1jm.js","/assets/LeaderDayReport-DG9cYrUm.js","/assets/LeaderTasksAdmin-Ch3Buwqf.js","/assets/LeaderUnitReport-CTfba_2G.js","/assets/Leaderboard-DbpTYhaz.js","/assets/Leaders-Ij-LD116.js","/assets/LeadersKpi-BeBTsIVu.js","/assets/Lightbox-BlMGwKCt.js","/assets/LiveOverview-D6f0Jg0w.js","/assets/Login-Bk397-q8.js","/assets/Logs-BUERFCyc.js","/assets/LostWorkers-a_V69ZNz.js","/assets/NotFound-tW_ydw43.js","/assets/Notifications-BNulelYC.js","/assets/NotionTasks-DIXmriQ9.js","/assets/NotionTrackerSettings-DRndQf_I.js","/assets/Ontime-DfK7qaOD.js","/assets/Ovens-M_gDsiKT.js","/assets/OvensSettings-Bmjvwd1K.js","/assets/Overview-B1yv-ldj.js","/assets/OwnerChip-CGpcN5vQ.js","/assets/PageAccess-BbipqgwG.js","/assets/Pagination-7nyFnoZk.js","/assets/People-DzJzpvRZ.js","/assets/PerenaladkaFactTable-Cw1EoH-P.js","/assets/Permissions-CTj_GHXD.js","/assets/PersonCard-BfnxmgCa.js","/assets/PlanFulfillment-BCjxWchL.js","/assets/Production-Bkl9WAWh.js","/assets/ProductionUpload-BHNmc8vd.js","/assets/Profile-DxC_cGIA.js","/assets/ProfileAvatar-DvxxIU1S.js","/assets/ProfilesManagement-CKzIvVHF.js","/assets/ProofCamera-DKGWmwWb.js","/assets/ProofPhoto-DRCYucS7.js","/assets/Quality-DEoOmp8z.js","/assets/RawRows-DFK3kplc.js","/assets/Reports-Zs9QCco9.js","/assets/RequestStateChip-njvtC9dF.js","/assets/RichTextEditor-GPNAIcki.js","/assets/SaveState-DdjAksmU.js","/assets/SearchInput-B-b8c-0J.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-D_Dae2_f.js","/assets/ShiftDaily-D-YTiKBi.js","/assets/ShiftTimes-Bun87PSp.js","/assets/Staff-DRoaSuWg.js","/assets/StaffListAtCheck-VwMkqYrq.js","/assets/StatusBadge-CK58_ek3.js","/assets/StatusBandsModal-BQEX7MiD.js","/assets/TargetGoal-CbKAVbNt.js","/assets/Targets-Di4ix9yT.js","/assets/Tasks-CALQqe04.js","/assets/TimeWheelPicker-DadsR4BF.js","/assets/Tooltip-QnzCbuOl.js","/assets/TranslationsEditor-DYgGgvkL.js","/assets/TrelloAnalytics-DxB65g27.js","/assets/TrelloSettings-SYQoQQIw.js","/assets/TrendChart-Bu9LzQmZ.js","/assets/TripleSpeedometer-BXb97I9L.js","/assets/Trudoyomkost-BaRRkofp.js","/assets/UploadDropzone-Eb0wmt2p.js","/assets/UsersActivity-DadVpWTe.js","/assets/UsersManagement-CrkpCrMk.js","/assets/VerdictBlock-BJ-QJGcH.js","/assets/VerifixParity-DTIqIo6f.js","/assets/VerifixSettings-Ct3grnMC.js","/assets/VerifixSync-DsQnr0Em.js","/assets/VfxApiMap-E7Zfa0R9.js","/assets/VfxDictionaries-D0Y70R9A.js","/assets/VfxEmployees-BpO4NuFU.js","/assets/VfxHrMoves-CZdTPTAR.js","/assets/VfxJobs-BnB8k_7Y.js","/assets/VfxPhoto-UU8LAoBE.js","/assets/VfxShifts-CCU3yloB.js","/assets/VfxState-BYCrmaYa.js","/assets/VfxTimebooks-BoOdZ51b.js","/assets/VfxTimesheet-B8ICZAXN.js","/assets/WatchProgress-D45FBfHU.js","/assets/WebLogin-9jJcDLve.js","/assets/WorkersAttendance-FZdk8dki.js","/assets/WorkersComposition-rBB4QQwT.js","/assets/WorkersMovements-BG7SKJ0I.js","/assets/WorkersPage-b6Vhy8qS.js","/assets/Zagruzka-BzN4ysF6.js","/assets/ZagruzkaCell-DKr07Mx6.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BFmmdXVJ.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Dhev1NJ9.js","/assets/broadcastTree-DQBpz7q9.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BrqjGNlG.js","/assets/cellMoveRefusal-0K5vTssh.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Bm7Uz-TT.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-DvK8wxN2.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-5zoTapH_.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Cs6bgowx.css","/assets/index-Hl0Y8OOi.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-B0Q2wSyT.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CrntVQs1.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-BwaFgOV2.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-Cvlhr1Yz.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CSyp0k3f.js","/assets/ru-DPQq5bEg.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-OF9CGg17.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-q6uF4aEE.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-u-iSt-NG.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DlPbYF8s.js","/assets/useMutation-CZcq8l4I.js","/assets/useOpenParam-Bj3QP9ex.js","/assets/useStatusBands-CK_WNvc1.js","/assets/useUrlScope-BRNTnIn4.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BBDgyVrR.js","/assets/uz_cyrl-DVlpIVw_.js","/assets/vfx-4BEaPLI0.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-BlkbmzXe.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
