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

const BUILD = "2026-11-07T07:45:28.456Z";
const PRECACHE = ["/","/assets/ActionHistory-Cf-OGwuf.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-D-YMIBPK.js","/assets/AiKeys-D4f01b9X.js","/assets/AnalysisBoard-BO4gh3lH.js","/assets/AppLauncher-D5Yj_w8s.js","/assets/Arc-MOQ6si_2.js","/assets/Assessment-btxzG9pX.js","/assets/AssessmentGrade-qsYsnVbH.js","/assets/AssessmentList-DygxqwOO.js","/assets/Assistant-DvItFrTP.js","/assets/AttendanceCleanup-CyfKtJbG.js","/assets/AttendanceUpload-BL1x0J2C.js","/assets/AuditTable-qaU3EIVk.js","/assets/BrigadirProfile-BsuSh-0A.js","/assets/BrigadirsKpi-Ba_N-veB.js","/assets/Broadcast-hIrRd4So.js","/assets/BroadcastReceivers-DpAICjjB.js","/assets/BroadcastRecord-ptfTIkRc.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-ErbgZlRJ.js","/assets/CategoryLegendModal-B3bi_jrQ.js","/assets/CellConcerns-CLHAg6eQ.js","/assets/CellDetails-6R4-Afhv.js","/assets/CellFormModal-Ce7yBp6X.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-gzf2Kn4b.js","/assets/Cells-CYPMKfjM.js","/assets/ColumnFilter-CD6Qi7fk.js","/assets/ColumnsPicker-DzuqCMa4.js","/assets/CommentsModal-Bdb_iN9_.js","/assets/ComparisonTable-DqvZJaio.js","/assets/Concerns-WISRxxic.js","/assets/ConcernsPieces-C4fWIwK5.js","/assets/CountStepper-BjryBA5q.js","/assets/Daily-DTJCiQD2.js","/assets/DataSources-ogZ4vTkp.js","/assets/DataTable-1X7Ggoeo.js","/assets/DateRangePicker-D6F3zqth.js","/assets/DayReportView-Cj8mGALa.js","/assets/DayStepper-DINACWCE.js","/assets/DayStrip-DX29PGOj.js","/assets/DbBackup-exb0w4DC.js","/assets/DifferenceBreakdown-qMp_iGaG.js","/assets/DocAudit-BUdqjI0t.js","/assets/Downtime-DTE9ELOX.js","/assets/Education-DTaoJC2q.js","/assets/EducationLesson-DKINxXxf.js","/assets/EmptyState-BtWUI0qH.js","/assets/Exam-U1j7FFPl.js","/assets/ExamAdmin-7WhOr5_G.js","/assets/Factories-CwQwMcKo.js","/assets/FactorySelect-D-N12AtU.js","/assets/Gamification-I2bqTqrF.js","/assets/GroupBadge-Dx9GiPr6.js","/assets/HeatmapChart-CaQqvtGZ.js","/assets/IdleCell-BVpzyS7O.js","/assets/IdleOwners-DKM_Aid5.js","/assets/IdleSolutions-DQweGMHG.js","/assets/IdleSource-CWRTqn2U.js","/assets/KPICard-BPPJOuqg.js","/assets/Kaizen-HabYSp_j.js","/assets/Kelish-ejtnz23N.js","/assets/KpiBits-BpgpeEk6.js","/assets/KpiDeltaCard-Dhy4r3M_.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-VmFty2Gk.js","/assets/LeaderAppeal-BE5HqPrT.js","/assets/LeaderCutoffs-Dwd1VJnX.js","/assets/LeaderDailyTasks-mZToKMBk.js","/assets/LeaderDayExclusions-HirNVuhw.js","/assets/LeaderDayReport-4Io2f4q7.js","/assets/LeaderTasksAdmin-CDq-nF9M.js","/assets/LeaderUnitReport-D_kqgQy9.js","/assets/Leaderboard-DTAkQSAP.js","/assets/Leaders-BWGZV5f7.js","/assets/LeadersKpi-Ca8MXYAc.js","/assets/Lightbox-BHXGE_G_.js","/assets/LiveOverview-YtxEK__w.js","/assets/Login-CCiz2o0v.js","/assets/Logs-CHa5fm5Z.js","/assets/LostWorkers-Dq2_QAa8.js","/assets/NotFound-Cc8mvwOl.js","/assets/Notifications-CfWWjGKk.js","/assets/NotionTasks-BkUYj0rY.js","/assets/NotionTrackerSettings-vDIu-dYt.js","/assets/Ontime-Bsnd0M5P.js","/assets/Ovens-BYYDSbua.js","/assets/OvensSettings-D63crMaL.js","/assets/Overview-CquksscM.js","/assets/OwnerChip-BlozR-q-.js","/assets/PageAccess-BJ44Cdh5.js","/assets/Pagination-DE8dNTOD.js","/assets/People-DIYdPyTl.js","/assets/PerenaladkaFactTable-CtlZ-a7p.js","/assets/Permissions-CY9CDo_O.js","/assets/PersonCard-Di1rs875.js","/assets/PlanFulfillment-0Lr0Qs1H.js","/assets/Production-CvHPwjT3.js","/assets/ProductionUpload-Bcjv5cBD.js","/assets/Profile-DKlUgPL0.js","/assets/ProfileAvatar-C3_Yh05O.js","/assets/ProfilesManagement-CO3XwDc5.js","/assets/ProofCamera-CC8tNcuC.js","/assets/ProofPhoto-D-rhA7HO.js","/assets/Quality-D_rq5bJx.js","/assets/RawRows-DwPwEYN8.js","/assets/Reports-D9PDj82o.js","/assets/RequestStateChip-CFTBC41l.js","/assets/RichTextEditor-DC-mkx40.js","/assets/SaveState-DU1Ki0Il.js","/assets/SearchInput-C_0aY6fg.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-DwTxH6j8.js","/assets/ShiftDaily-By1ewiu8.js","/assets/ShiftTimes-BapA_AAs.js","/assets/Staff-CEK8x8zM.js","/assets/StaffListAtCheck-Dw3_CEGz.js","/assets/StatusBadge-zKQvgh1b.js","/assets/StatusBandsModal-CulVLGkH.js","/assets/TargetGoal-eYFQZfTj.js","/assets/Targets-BV18Xigg.js","/assets/Tasks-Bl1vQNCf.js","/assets/TimeWheelPicker-C1Kk4wTP.js","/assets/Tooltip-i43NGaWW.js","/assets/TranslationsEditor-BeAfkVTt.js","/assets/TrelloAnalytics-C-3BAMWe.js","/assets/TrelloSettings-kjYEBhbA.js","/assets/TrendChart-Bkpu9w1z.js","/assets/TripleSpeedometer-DVVAW8Jc.js","/assets/Trudoyomkost-Cv2BU5fA.js","/assets/UploadDropzone-qLD70ZG6.js","/assets/UsersActivity-7_NQ1Rtk.js","/assets/UsersManagement-BYNrZ8tG.js","/assets/VerdictBlock-CRrycTMP.js","/assets/VerifixParity-D6lNw63c.js","/assets/VerifixSettings-m9hZMEY0.js","/assets/VerifixSync-rnqxKyWY.js","/assets/VfxApiMap-CoG5t0lH.js","/assets/VfxDictionaries-BDoBHviG.js","/assets/VfxEmployees-S1_U16o3.js","/assets/VfxHrMoves-Cfh7uJha.js","/assets/VfxJobs-D5YffC3h.js","/assets/VfxPhoto-DN3tloCo.js","/assets/VfxShifts-CGr2FKk-.js","/assets/VfxState-BadOcpzN.js","/assets/VfxTimebooks-Byrnkr0Y.js","/assets/VfxTimesheet-9jgcQSqG.js","/assets/WatchProgress-CBfhidQv.js","/assets/WebLogin-Bldfk4Ol.js","/assets/WorkersAttendance-CS2SqUza.js","/assets/WorkersComposition-DbvXO8Kt.js","/assets/WorkersMovements-Cy3CDO9H.js","/assets/WorkersPage-C5SLO020.js","/assets/Zagruzka-Drqvggbf.js","/assets/ZagruzkaCell-DyyUVgne.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-B-b0gxFL.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-MfN1x3yA.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CGMYWwSu.js","/assets/broadcastTree-Dg7nWFyp.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-PEDnPdOL.js","/assets/cellMoveRefusal-P4y5Kxf6.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BONKbDQq.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Dv6-5avE.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CnRE1GEN.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-C5haj97t.js","/assets/index-COSWaPAZ.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-Bvhtl3LP.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-EsWUwdoK.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-BwaFgOV2.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BqrduiVD.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CSyp0k3f.js","/assets/ru-BshZBZIo.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-DuIGfZvt.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-ClzI7uS0.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-DzrnDRsB.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-aEP7aJfx.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-C1kbvY6h.js","/assets/useMutation-BdDv4BIx.js","/assets/useOpenParam-DWdRP_nb.js","/assets/useStatusBands-CN00X0ou.js","/assets/useUrlScope-CydIp2Dz.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-D2wHCeR1.js","/assets/uz_cyrl-D4n6o4Fl.js","/assets/vfx-tmQ_z5be.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-CSFVqjy1.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
