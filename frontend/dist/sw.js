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

const BUILD = "2026-11-04T18:49:22.325Z";
const PRECACHE = ["/","/assets/ActionHistory-DfqdiC14.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-B_UvouSL.js","/assets/AiKeys-Cqxj-I_4.js","/assets/AnalysisBoard-B2XR_5oM.js","/assets/AppLauncher-CLQsx_R0.js","/assets/Arc-KuNPSPA6.js","/assets/Assessment-CQs-0NcR.js","/assets/AssessmentGrade-BVGy8R2M.js","/assets/AssessmentList-CsrKCfgf.js","/assets/Assistant-Dh0-o7L3.js","/assets/AttendanceCleanup-CyH8REwa.js","/assets/AttendanceUpload-DXdD-dog.js","/assets/AuditTable-CrRMVFmy.js","/assets/BrigadirProfile-CSfbdDvl.js","/assets/BrigadirsKpi-CRaUQrXy.js","/assets/Broadcast-Dq8jd_Bf.js","/assets/BroadcastReceivers-gSew8do9.js","/assets/BroadcastRecord-DFQbsJpN.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-D9f6H2hN.js","/assets/CategoryLegendModal-B3L3JQl8.js","/assets/CellConcerns-Cosduu0m.js","/assets/CellDetails-BTkYXZdg.js","/assets/CellFormModal-fWEhFoCm.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-DarH4c1s.js","/assets/Cells-C-vzUq3g.js","/assets/ColumnFilter-DXdiP6jj.js","/assets/ColumnsPicker-DZ-yWp8h.js","/assets/CommentsModal-BjZFRN0Q.js","/assets/ComparisonTable-M9EUI4P3.js","/assets/Concerns-BNmOluYd.js","/assets/ConcernsPieces-D0sAbeHT.js","/assets/CountStepper-CfQP6_Pc.js","/assets/Daily-Dq_bYSs4.js","/assets/DataSources-CzUey6l7.js","/assets/DataTable-CxoXwKoH.js","/assets/DateRangePicker-DIwyqPat.js","/assets/DayReportView-DyR3FQkJ.js","/assets/DayStepper-Bt7PHFwL.js","/assets/DayStrip-BlUkIqvu.js","/assets/DbBackup-CF4fAu9I.js","/assets/DifferenceBreakdown-DMOXEauj.js","/assets/DocAudit-BpeIgAlw.js","/assets/Downtime-BXLceRBk.js","/assets/Education-pJvQIr99.js","/assets/EducationLesson-CRAa9KzC.js","/assets/EmptyState-6r-9Papf.js","/assets/Exam-C-iR8uW4.js","/assets/ExamAdmin-DpisSOyC.js","/assets/Factories-Bk0pVEff.js","/assets/FactorySelect-BZNySd0u.js","/assets/Gamification-Ctxuk-ff.js","/assets/GroupBadge-D8INgSbr.js","/assets/HeatmapChart-BG1iJGZ8.js","/assets/IdleCell-C6CjhcWi.js","/assets/IdleOwners-DTSxD5wy.js","/assets/IdleSolutions-lpGcw2qp.js","/assets/IdleSource-Be35Md1t.js","/assets/KPICard-Der506f9.js","/assets/Kaizen-C5e_QQhF.js","/assets/Kelish-CpoZffee.js","/assets/KpiBits-CXkOD3Ld.js","/assets/KpiDeltaCard-DYU1czzK.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout--qsH7d-R.js","/assets/LeaderAppeal-Ccz-Zui_.js","/assets/LeaderCutoffs-CuozA2_q.js","/assets/LeaderDailyTasks-_ZmoYsz7.js","/assets/LeaderDayExclusions-D4I3LceZ.js","/assets/LeaderDayReport-s19Q3DQL.js","/assets/LeaderTasksAdmin-CGK-xK1a.js","/assets/LeaderUnitReport-BxwtphOY.js","/assets/Leaderboard-B3qvWFWp.js","/assets/Leaders-B5hW415S.js","/assets/LeadersKpi-meZuZl_p.js","/assets/Lightbox-BpuS959F.js","/assets/LiveOverview-BlVagnWT.js","/assets/Login-mh7A1Gnm.js","/assets/Logs-CDA6ydOL.js","/assets/LostWorkers-C_CVlZt6.js","/assets/NotFound-Rse8NjNM.js","/assets/Notifications-BkNVvoDe.js","/assets/NotionTasks-aZa3joii.js","/assets/NotionTrackerSettings-D5ySn78U.js","/assets/Ontime-DMqGh-i-.js","/assets/Ovens-Dr6p-6CU.js","/assets/OvensSettings-CFFcTlBc.js","/assets/Overview-C5tn9Fss.js","/assets/OwnerChip-KnvK0VB7.js","/assets/PageAccess-DvpOv5il.js","/assets/Pagination-BPiGQMMT.js","/assets/People-D20mu4RO.js","/assets/PerenaladkaFactTable-DkRYAW-O.js","/assets/Permissions-D9XPWn3P.js","/assets/PersonCard-cw9Qv0Jz.js","/assets/PlanFulfillment-CSve490u.js","/assets/Production-C_s7ll6P.js","/assets/ProductionUpload-Dq3WI7eR.js","/assets/Profile-BSnN6WbT.js","/assets/ProfileAvatar-CKTFCk6C.js","/assets/ProfilesManagement-D6H2BBVj.js","/assets/ProofCamera-D1c0_Stj.js","/assets/ProofPhoto-hxtrERRx.js","/assets/Quality-C8qdaQAa.js","/assets/RawRows-BwWMfDDW.js","/assets/Reports-ClMDin1T.js","/assets/RequestStateChip-gRjT6smA.js","/assets/RichTextEditor-BtpOOTcW.js","/assets/SaveState-qQXA17VL.js","/assets/SearchInput-D8HLU4Fy.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-x_wTDAJB.js","/assets/ShiftDaily-C4J0TMKU.js","/assets/ShiftTimes-xvE_-4ru.js","/assets/Staff-81krHGln.js","/assets/StaffListAtCheck-NPf-V8Lk.js","/assets/StatusBadge-xzs0Wt_p.js","/assets/StatusBandsModal-DoMY8oB6.js","/assets/TargetGoal-Bc11hgGk.js","/assets/Targets-DM42jdn3.js","/assets/Tasks-DCos0US2.js","/assets/TimeWheelPicker-CtsXrGId.js","/assets/Tooltip-Cgs7m5Yo.js","/assets/TranslationsEditor-B2A3pOCe.js","/assets/TrelloAnalytics-DQzo5Y51.js","/assets/TrelloSettings-B17kbjdQ.js","/assets/TrendChart-BX5yocbC.js","/assets/TripleSpeedometer-D8XPU7uP.js","/assets/Trudoyomkost-aYcLYk6y.js","/assets/UploadDropzone-CgObJGfb.js","/assets/UsersActivity-BtqLcqpC.js","/assets/UsersManagement-TnRzqEIv.js","/assets/VerdictBlock-DNuHGK4n.js","/assets/VerifixParity-CYRL84Ul.js","/assets/VerifixSettings-DAenZOFo.js","/assets/VerifixSync-CvXUAv8w.js","/assets/VfxApiMap-Jtxdrf-e.js","/assets/VfxDictionaries-CjwEnCAo.js","/assets/VfxEmployees-ejFdoPgJ.js","/assets/VfxHrMoves-ChKf88WB.js","/assets/VfxJobs-DJIo9rJh.js","/assets/VfxPhoto-BRu0lDdI.js","/assets/VfxShifts-DCYkjQ6B.js","/assets/VfxState-BfSz465g.js","/assets/VfxTimebooks-DNjQKZwW.js","/assets/VfxTimesheet-SF8c3VW6.js","/assets/WatchProgress-waMg_qW-.js","/assets/WebLogin-BWhW0OfX.js","/assets/WorkersAttendance-UtbW_wVI.js","/assets/WorkersComposition-DDHfZpa2.js","/assets/WorkersMovements-BVZwoq5i.js","/assets/WorkersPage-CoZXM4fS.js","/assets/Zagruzka-Db0Ro6U6.js","/assets/ZagruzkaCell-CjlAoaPN.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-VWU-LmR6.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Dihc90GC.js","/assets/broadcastTree-CTQKbtn_.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-KsUcqTM4.js","/assets/cellMoveRefusal-6NBB72uR.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-_2D2GbB7.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Jy7uyo4L.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Dppnly5-.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Bqc9RjxR.js","/assets/index-PD8XnJVy.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-xtN50wcm.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BQUXV5W2.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CKmOKNHM.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CwW04vqp.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-Bw9MuUZ8.js","/assets/ru-CfnpgIHQ.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-D735NOkj.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DhI_Uk7l.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-5QKH3037.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-Di0ZSWiF.js","/assets/useMutation-qITMr3Qd.js","/assets/useOpenParam-D4wrWMr7.js","/assets/useStatusBands-b_XjqiN-.js","/assets/useUrlScope-DgAky272.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-bpK2EV8E.js","/assets/uz_cyrl-CgRb3H8f.js","/assets/vfx-BjftLqFC.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-CI5jENT7.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
