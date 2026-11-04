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

const BUILD = "2026-11-04T06:32:46.379Z";
const PRECACHE = ["/","/assets/ActionHistory-Dk1kVDNC.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-BzClgN0B.js","/assets/AiKeys-Dm9zLivy.js","/assets/AnalysisBoard-D0S40ZpO.js","/assets/AppLauncher-CGWTHS-z.js","/assets/Arc-C_Cy66Sa.js","/assets/Assessment-R0w9I5Ul.js","/assets/AssessmentGrade-CTy6n-UC.js","/assets/AssessmentList-CZ8mS6hw.js","/assets/Assistant-Dts2HNbn.js","/assets/AttendanceCleanup-CwOGDu1v.js","/assets/AttendanceUpload-R3qEQMoT.js","/assets/BrigadirProfile-7dAxSQ_6.js","/assets/BrigadirsKpi-C9a8b0Un.js","/assets/Broadcast-DP4SxrcT.js","/assets/BroadcastReceivers-CSKPz84K.js","/assets/BroadcastRecord-Cp-Bzcwm.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-CI7C9r5-.js","/assets/CategoryLegendModal-BxUTw8td.js","/assets/CellConcerns-7Iia3j1_.js","/assets/CellDetails-9KDqcYTH.js","/assets/CellFormModal-5H58lImY.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-D1Wt2KkA.js","/assets/Cells-vD1EL8nV.js","/assets/ColumnFilter-CcOo_VMF.js","/assets/ColumnsPicker-CauGTQT8.js","/assets/CommentsModal-Bm-CUjph.js","/assets/ComparisonTable-S2UKUm11.js","/assets/Concerns-B-UOuSPe.js","/assets/ConcernsPieces-FbPJ4lZ7.js","/assets/CountStepper-OylJ_3UG.js","/assets/Daily-yDwVtyyi.js","/assets/DataSources-BnOT4iQW.js","/assets/DataTable-WGY9a6hU.js","/assets/DateRangePicker-DFDPczhG.js","/assets/DayReportView-BtfC-ign.js","/assets/DayStepper-Ca7GFi51.js","/assets/DayStrip-xv-jeh6C.js","/assets/DbBackup-CGJYRChi.js","/assets/DifferenceBreakdown-2qUlHoID.js","/assets/DocAudit-_ueC4Dnk.js","/assets/Downtime-22brAExJ.js","/assets/Education-Br2Itw4Q.js","/assets/EducationLesson-CwUGqypJ.js","/assets/EmptyState-BgRR-fQl.js","/assets/Exam-BzfYL52d.js","/assets/ExamAdmin-jKcJPT0d.js","/assets/Factories-DmqM78Bj.js","/assets/FactorySelect-D4b3Jc02.js","/assets/Gamification-CHolZOjy.js","/assets/GroupBadge-CHWo_Xl7.js","/assets/HeatmapChart-Dtc034eV.js","/assets/IdleCell-DEKrofGX.js","/assets/IdleOwners-DmvV57VX.js","/assets/IdleSolutions-DXXgntOW.js","/assets/IdleSource-CxaqFf9E.js","/assets/KPICard-CNwOncrU.js","/assets/Kaizen-CyYDUwyR.js","/assets/Kelish-CVLopiym.js","/assets/KpiBits-kYzOB1iI.js","/assets/KpiDeltaCard-Bs-tJc0B.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-Ca0vK-Va.js","/assets/LeaderAppeal-D98JQSM-.js","/assets/LeaderCutoffs-DDz2e9kO.js","/assets/LeaderDailyTasks-DeXUNamM.js","/assets/LeaderDayExclusions-TWZJTIWi.js","/assets/LeaderDayReport-BLcZmTl1.js","/assets/LeaderTasksAdmin-D7eI5w_x.js","/assets/LeaderUnitReport-Dj1BBJM5.js","/assets/Leaderboard-C5pq8YeD.js","/assets/Leaders-C5_DsOmf.js","/assets/LeadersKpi-BIGbdGTG.js","/assets/Lightbox-Cs-_57sY.js","/assets/LiveOverview-DasZN5Il.js","/assets/Login-NvOQ3PlD.js","/assets/Logs-Bpsq2gxt.js","/assets/LostWorkers-CLQf53IA.js","/assets/NotFound-1Qhbblof.js","/assets/Notifications-D69Vx5U6.js","/assets/NotionTasks-BK6303gU.js","/assets/NotionTrackerSettings-diYYNWmt.js","/assets/Ontime-D_ZPF1jD.js","/assets/Ovens-Cg9R_Kya.js","/assets/OvensSettings-IACu_ct-.js","/assets/Overview-Zy-JPdnM.js","/assets/OwnerChip-C2CSpv0k.js","/assets/PageAccess-CuLTXU9p.js","/assets/Pagination-CsMkFDag.js","/assets/People-DifmeRia.js","/assets/PerenaladkaFactTable-Dqt7m8uq.js","/assets/Permissions-voYGKSne.js","/assets/PersonCard-d0yGAZHJ.js","/assets/PlanFulfillment-BV3na2Jg.js","/assets/Production-DrpJM9z7.js","/assets/ProductionUpload-CLnH3v2O.js","/assets/Profile-BJ02QKGy.js","/assets/ProfileAvatar-CHyluMiT.js","/assets/ProfilesManagement-Dxatl6iw.js","/assets/ProofCamera-BLRNgxvy.js","/assets/ProofPhoto-BUM08ske.js","/assets/Quality-C_hem_Qq.js","/assets/RawRows-Cg1nTKNO.js","/assets/Reports-BxO6GpRd.js","/assets/RequestStateChip-DuRGVbAQ.js","/assets/RichTextEditor-82g5XYUq.js","/assets/SaveState-BmRancyX.js","/assets/SearchInput-BBy4BYQe.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-Dh5KH9gu.js","/assets/ShiftDaily-DZIz0-Jk.js","/assets/ShiftTimes-DiEaRBFZ.js","/assets/Staff-DGaNT4T6.js","/assets/StaffListAtCheck-pMq6EqoJ.js","/assets/StatusBadge-LTkLOCuY.js","/assets/StatusBandsModal-BihHnEDn.js","/assets/TargetGoal-DaZNOCPQ.js","/assets/Targets-Bt7K0gyT.js","/assets/Tasks-DBOxwhnH.js","/assets/TimeWheelPicker-C6L_B7X_.js","/assets/Tooltip-C3nLy-QI.js","/assets/TranslationsEditor-B5T1hcCJ.js","/assets/TrelloAnalytics-BV2UMxW4.js","/assets/TrelloSettings-BjIRl_zL.js","/assets/TrendChart-DgEww5u0.js","/assets/TripleSpeedometer-CAMG6lBd.js","/assets/Trudoyomkost-DW_9vF48.js","/assets/UploadDropzone-CQI0DB22.js","/assets/UsersActivity-7UmpqNSL.js","/assets/UsersManagement-CX6qgauB.js","/assets/VerdictBlock-Dsx7UP2F.js","/assets/VerifixParity-BA8kEF97.js","/assets/VerifixSettings-p_pcn4V5.js","/assets/VerifixSync-DwrcmZrv.js","/assets/VfxApiMap-et_9VzXk.js","/assets/VfxDictionaries-D3tod0J6.js","/assets/VfxEmployees-CxhKI-5C.js","/assets/VfxHrMoves-BW4vrWrC.js","/assets/VfxJobs-D07Lys5F.js","/assets/VfxPhoto-DbPDohZT.js","/assets/VfxShifts-6bOSY1N-.js","/assets/VfxState-ew4lRMce.js","/assets/VfxTimebooks-D4ORuBYW.js","/assets/VfxTimesheet-CJd_L63H.js","/assets/WatchProgress-qmgSCDmP.js","/assets/WebLogin-B3SCRC-J.js","/assets/WorkersAttendance-DhK6qrQt.js","/assets/WorkersComposition-BBYKbguA.js","/assets/WorkersMovements-fwIq1pDX.js","/assets/WorkersPage-CrBVBcNJ.js","/assets/Zagruzka-Bt-_Zplq.js","/assets/ZagruzkaCell-ClIwgb5t.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-RWIexT2H.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DCzbvsQW.js","/assets/broadcastTree-Cx8KSL6n.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-AyAQ6uN1.js","/assets/cellMoveRefusal-C4G60Vpe.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BSHvANut.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-oAxie2iA.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BrLVX3Ii.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BIAdVYv8.js","/assets/index-Ce6bWIJh.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-C4pDqtO7.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CB4FbE5X.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-D6D6KEP3.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BE6vgCQC.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-Bw9MuUZ8.js","/assets/ru-LXp_Y0Pa.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-CPeZUyht.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-ChjdHb2v.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Dt1bpRfP.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-D0aVDgNH.js","/assets/useMutation-BLMW9Ojo.js","/assets/useOpenParam--mY-wlb4.js","/assets/useStatusBands-D-L08sCW.js","/assets/useUrlScope-VE3agQ1q.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-CCbiq7mF.js","/assets/uz_cyrl-BwONqmp-.js","/assets/vfx-DKe6Yxsr.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-DnHDwqj8.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
