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

const BUILD = "2026-11-09T06:59:24.592Z";
const PRECACHE = ["/","/assets/ActionHistory-CLXH1YHI.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-CcLaNE_U.js","/assets/AiKeys-BFwA5L7Q.js","/assets/AnalysisBoard-CWi8ChOY.js","/assets/AppLauncher-CLVVPZu5.js","/assets/Arc-CwQciRg0.js","/assets/Assessment-CkMAIeBJ.js","/assets/AssessmentGrade-BpttXuJA.js","/assets/AssessmentList-BXXItqEX.js","/assets/Assistant-BhkY8w5g.js","/assets/AttendanceCleanup-D__KIz2d.js","/assets/AttendanceUpload-B8qOgh5V.js","/assets/AuditTable-CpZXW2Od.js","/assets/BrigadirProfile-DM8DCIXy.js","/assets/BrigadirsKpi-DyYBmtFL.js","/assets/Broadcast-lueYNi0Z.js","/assets/BroadcastReceivers-BfCwHpQ0.js","/assets/BroadcastRecord-Cq-2LHAv.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-CN3fDuDy.js","/assets/CategoryLegendModal-DPs9QXOF.js","/assets/CellConcerns-CQL7m36l.js","/assets/CellDetails-DtFdyeU6.js","/assets/CellFormModal-GY0x6qYQ.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-D4yuPsLd.js","/assets/Cells-Boyh_EhO.js","/assets/ColumnFilter-yGQVZQfH.js","/assets/ColumnsPicker-DikZCj-g.js","/assets/CommentsModal-DGPGDLlP.js","/assets/ComparisonTable-DS50hgjC.js","/assets/Concerns-BmlQLtbv.js","/assets/ConcernsPieces-QmwisP9Q.js","/assets/CountStepper-Blg_1Tn7.js","/assets/Daily-DLqg46Vw.js","/assets/DataSources-DkemYvuh.js","/assets/DataTable-BPWI1nA3.js","/assets/DateRangePicker-Cgflc16y.js","/assets/DayReportView-TQYXsV9K.js","/assets/DayStepper-83ZJVMP0.js","/assets/DayStrip-DPCBwLjV.js","/assets/DbBackup-Bsk_gxCq.js","/assets/DifferenceBreakdown-BNgoPkGs.js","/assets/DocAudit-7Nt9lb3e.js","/assets/Downtime-DM1ACRRF.js","/assets/Education-CwPXc_LV.js","/assets/EducationLesson-DpLnuthL.js","/assets/EmptyState-C_GTmamE.js","/assets/Exam-Cz1kLBnT.js","/assets/ExamAdmin-LQR6NRr8.js","/assets/Factories-CahkdSXt.js","/assets/FactorySelect-Ocsq74GD.js","/assets/Gamification-Dp386BJp.js","/assets/GroupBadge-C1RZi9w7.js","/assets/HeatmapChart-B1gDWMiC.js","/assets/IdleCell-JeWaEnD2.js","/assets/IdleOwners-Brn_syp3.js","/assets/IdleSolutions-Zq4j5Q_F.js","/assets/IdleSource-DZxwOBPR.js","/assets/KPICard-D5yDOjM0.js","/assets/Kaizen-Cfj2TO2B.js","/assets/Kelish-C2cHG2fB.js","/assets/KpiBits-Dsz5Tx6y.js","/assets/KpiDeltaCard-oiTf8IfI.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-xgoGp823.js","/assets/LeaderAppeal-B-2QtbgN.js","/assets/LeaderCutoffs-DLseJSKa.js","/assets/LeaderDailyTasks-Dw3GCO3z.js","/assets/LeaderDayExclusions-BHuvi9Zd.js","/assets/LeaderDayReport-RpwdLDxt.js","/assets/LeaderTasksAdmin-CuwJkqNS.js","/assets/LeaderUnitReport-DNDfxNvl.js","/assets/Leaderboard-BI2Wb29o.js","/assets/Leaders-ZsOydfDz.js","/assets/LeadersKpi-zE8AieZ6.js","/assets/Lightbox-CEame6-0.js","/assets/LiveOverview-nytBsWdS.js","/assets/Login-B0uvRgtO.js","/assets/Logs-DAxPz61L.js","/assets/LostWorkers-BBKUfqKf.js","/assets/NotFound-JUaTwaC1.js","/assets/Notifications-BqP2kacz.js","/assets/NotionTasks-BeTxaE1B.js","/assets/NotionTrackerSettings-DmzFDsKQ.js","/assets/Ontime-nvu-uAoC.js","/assets/Ovens-DmIPSd1O.js","/assets/OvensSettings-CM3kemqD.js","/assets/Overview-Ct61pv70.js","/assets/OwnerChip-B1wt-195.js","/assets/PageAccess-Bp4eyh5R.js","/assets/Pagination-DYxymt8u.js","/assets/People-C2VGml0B.js","/assets/PerenaladkaFactTable-BjpUi30U.js","/assets/Permissions-CQJTbf5I.js","/assets/PersonCard-Bf9Y1_iJ.js","/assets/PlanFulfillment-CQvIuOsy.js","/assets/Production-BLvh_ofl.js","/assets/ProductionUpload-BkG_YIAO.js","/assets/Profile-B1xch44x.js","/assets/ProfileAvatar-DNsRPHMF.js","/assets/ProfilesManagement-03abnxfy.js","/assets/ProofCamera-BCZtp3KG.js","/assets/ProofPhoto-BLDCJRa3.js","/assets/Quality-Dl_3AFpA.js","/assets/RawRows-Dsv0Uf3c.js","/assets/Reports-BIQBO2Bu.js","/assets/RequestStateChip-DmfPfSKj.js","/assets/RichTextEditor-PSuy6baB.js","/assets/SaveState-BaabKgbw.js","/assets/SearchInput-YM0t4F6e.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-DrEKDt5J.js","/assets/ShiftDaily-CdaTgvu2.js","/assets/ShiftTimes-D1pe_w07.js","/assets/Staff-Dv8FMpIv.js","/assets/StaffListAtCheck-CcFXZkwJ.js","/assets/StatusBadge-BiDSesri.js","/assets/StatusBandsModal-BFXMpbuT.js","/assets/TargetGoal-CX5ke6zk.js","/assets/Targets-Cxg04Gv2.js","/assets/Tasks-BR-WKr8Z.js","/assets/TimeWheelPicker-DPIKV32L.js","/assets/Tooltip-CWIaI7OW.js","/assets/TranslationsEditor-D9wdWpmF.js","/assets/TrelloAnalytics-Du5fBahb.js","/assets/TrelloSettings-Bai_4qjS.js","/assets/TrendChart-C6juVGub.js","/assets/TripleSpeedometer-BaMwrBWk.js","/assets/Trudoyomkost-CS5IR-oX.js","/assets/UploadDropzone-Dug_LouO.js","/assets/UsersActivity-D0yRp2Kb.js","/assets/UsersManagement-MO43S8WL.js","/assets/VerdictBlock-3xuijLz8.js","/assets/VerifixParity-AUtlgsBy.js","/assets/VerifixSettings-CaH1Ocu3.js","/assets/VerifixSync-DQJHCOfR.js","/assets/VfxApiMap-ss2GbYcY.js","/assets/VfxDictionaries-CaxTMlSG.js","/assets/VfxEmployees-xhSyHOAN.js","/assets/VfxHrMoves-DVok1rgD.js","/assets/VfxJobs-D_9aXmIU.js","/assets/VfxPhoto-CH53gQgo.js","/assets/VfxShifts-BOiNB-S6.js","/assets/VfxState-BqoD6L1q.js","/assets/VfxTimebooks-Cft98lBc.js","/assets/VfxTimesheet-Df7t4TZ-.js","/assets/WatchProgress-wgzZkDjC.js","/assets/WebLogin-BqaSzwAB.js","/assets/WorkersAttendance-D74W_3b_.js","/assets/WorkersComposition-BLQH74XV.js","/assets/WorkersMovements-Cz05z4sM.js","/assets/WorkersPage-Btbg9dq8.js","/assets/Zagruzka-YWGpzck3.js","/assets/ZagruzkaCell-C-_vMq9b.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-dexE1VZ0.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-DyTeyK0g.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-ZUCxHgJA.js","/assets/broadcastTree-rtFPnlrk.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-tYmA_YKu.js","/assets/cellMoveRefusal-uw_kIH9c.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-D9EIsoz4.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-BbbWUNEz.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Tk748W-s.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-C1CfXWWD.js","/assets/index-CQT131y1.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-oG_pK3rX.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BV17-uqQ.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-BwaFgOV2.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BOeOtEGP.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CSyp0k3f.js","/assets/ru-CtMBuzsr.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-C4RIjrFc.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-xUtwm04T.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-DzrnDRsB.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BwpgV0uH.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-BYZTIQE3.js","/assets/useMutation-BYa265mQ.js","/assets/useOpenParam-Dn5cK7Bh.js","/assets/useStatusBands-BtmJwfMT.js","/assets/useUrlScope-DhPX14a_.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-C6O5qtgN.js","/assets/uz_cyrl-59-V9-De.js","/assets/vfx-CeWvlR5I.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-BcK_ixZK.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
