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

const BUILD = "2026-11-12T04:49:10.539Z";
const PRECACHE = ["/","/assets/ActionHistory-BIOtLsgN.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-Bo0YGc3r.js","/assets/AiKeys-CQ992Z9M.js","/assets/AnalysisBoard-Fo8qKB-K.js","/assets/ApiAccess-DD48CIV2.js","/assets/AppLauncher-BLXhMBi3.js","/assets/Arc-CleNOP55.js","/assets/Assessment-D5FyXdOo.js","/assets/AssessmentGrade-BrgQb-Y1.js","/assets/AssessmentList-BxysGrvH.js","/assets/Assistant-DBJUgg7y.js","/assets/AttendanceCleanup-CCEqm9mV.js","/assets/AttendanceUpload-Vqy4ek5n.js","/assets/AuditTable-Cj1fGSkz.js","/assets/BrigadirProfile-ZomIOxVw.js","/assets/BrigadirsKpi-BEe7wmFj.js","/assets/Broadcast-BmoPMTib.js","/assets/BroadcastReceivers-u4xuLf1d.js","/assets/BroadcastRecord-B1d3DrRc.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-DfDLmANm.js","/assets/CategoryLegendModal-C8TqFiBs.js","/assets/CellConcerns-CkySjQWJ.js","/assets/CellDetails-CBMdFOZ_.js","/assets/CellFormModal-DiiqEZMk.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-iAq4jr1-.js","/assets/Cells-G5CWAVJB.js","/assets/ColumnFilter-DCc3i17v.js","/assets/ColumnsPicker-DI2DIn5E.js","/assets/CommentsModal-BucRZwak.js","/assets/ComparisonTable-CpNr75WT.js","/assets/Concerns-Dxmw3KGY.js","/assets/ConcernsPieces-CGnATh7i.js","/assets/CountStepper-C9yJlf2D.js","/assets/Daily-Bv-ToXU2.js","/assets/DataSources-B9t5gXd_.js","/assets/DataTable-DD_vU7qN.js","/assets/DateRangePicker-BErr06t1.js","/assets/DayReportView-vT9MPoYU.js","/assets/DayStepper-BeRfbxx2.js","/assets/DayStrip-Dks9zxuR.js","/assets/DbBackup-CQHzqFOm.js","/assets/DifferenceBreakdown-B48TVT6p.js","/assets/DocAudit-BZL67H8y.js","/assets/Downtime-C8egcerr.js","/assets/Education-CwoNHZ2l.js","/assets/EducationLesson-7vbutXl-.js","/assets/EmptyState-D6dDjorD.js","/assets/Exam-DBP0SONW.js","/assets/ExamAdmin-B8uyArBl.js","/assets/Factories-CRLpwqPS.js","/assets/FactorySelect-BI09zKYg.js","/assets/Gamification-CO_tqbw6.js","/assets/GroupBadge-DmWcYFqw.js","/assets/HeatmapChart-C6gjTlIa.js","/assets/IdleCell-CMwaadr7.js","/assets/IdleOwners-CRbap8Ih.js","/assets/IdleSolutions-4O_-5Z0j.js","/assets/IdleSource-BNEhz_SD.js","/assets/KPICard-BIEx_G4a.js","/assets/Kaizen-DgDV5ybM.js","/assets/Kelish-x8KKyhRE.js","/assets/KpiBits-C5Z1W6za.js","/assets/KpiDeltaCard-PAufuKTm.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-DCO1trLs.js","/assets/LeaderAppeal-DctF_66P.js","/assets/LeaderCutoffs-DbUQ7QLO.js","/assets/LeaderDailyTasks-B0t78FtW.js","/assets/LeaderDayExclusions-C65aMg-x.js","/assets/LeaderDayReport-CzR6phhT.js","/assets/LeaderTasksAdmin-DcqnG7nv.js","/assets/LeaderUnitReport-Bg5ulaj7.js","/assets/Leaderboard-uFifYv4y.js","/assets/Leaders-DwdsiBad.js","/assets/LeadersKpi-RBQOqzt-.js","/assets/Lightbox-0XwFYwnx.js","/assets/LiveOverview-C1xVykHn.js","/assets/Login-CRg5wMjq.js","/assets/Logs-qk3AJYt2.js","/assets/LostWorkers-CLlaxxCZ.js","/assets/NotFound-B1flWqTA.js","/assets/Notifications-CSGakj6M.js","/assets/NotionTasks-Dqvr2nXQ.js","/assets/NotionTrackerSettings-C8tzYpWH.js","/assets/Ontime-BbVBqPli.js","/assets/Ovens-C6txlVNh.js","/assets/OvensSettings-BBspv0_y.js","/assets/Overview-AmPoqWz1.js","/assets/OwnerChip--lNhVRdF.js","/assets/PageAccess-1bHHf8Lx.js","/assets/Pagination-K4h8FYEl.js","/assets/People-JwjeRU3D.js","/assets/PerenaladkaFactTable-CyRl4lVp.js","/assets/Permissions-C4H-ouRR.js","/assets/PersonCard-D-3G0zX_.js","/assets/PlanFulfillment-DU_pdH9A.js","/assets/Production-V0uqw0d2.js","/assets/ProductionUpload-5khR3YvG.js","/assets/Profile-jepHgwe9.js","/assets/ProfileAvatar-C-MCeMPW.js","/assets/ProfilesManagement-DEoGymN3.js","/assets/ProofCamera-CxYNDG2K.js","/assets/ProofPhoto--x2V8X7d.js","/assets/Quality-Cj0qroOK.js","/assets/RawRows-up7kdbWv.js","/assets/Reports-TjB6o41F.js","/assets/RequestStateChip-CC68zq23.js","/assets/RichTextEditor-DBLbA6i0.js","/assets/SaveState-Djjm34tt.js","/assets/SearchInput-DW6EvHbN.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-D_4I-30V.js","/assets/ShiftDaily-BdDs13Kf.js","/assets/ShiftTimes--lgNmFwC.js","/assets/Staff-DTa5rLBO.js","/assets/StaffListAtCheck-siFCFU8Q.js","/assets/StatusBadge-D8nUnBsW.js","/assets/StatusBandsModal-BRjFJzJa.js","/assets/TargetGoal-DikRgFU4.js","/assets/Targets-CbpMPKUJ.js","/assets/Tasks-DRF-Xbja.js","/assets/TgProfile-DJxDdBLH.js","/assets/TimeWheelPicker-Cwu0RtIv.js","/assets/Tooltip-CbLZyEL4.js","/assets/TranslationsEditor-Dv5pJvTe.js","/assets/TrelloAnalytics-BtaUN7ho.js","/assets/TrelloSettings-DvQZBfqz.js","/assets/TrendChart-nS-QRxBw.js","/assets/TripleSpeedometer-BAI00FJ2.js","/assets/Trudoyomkost-BwsUeRwD.js","/assets/UploadDropzone-BFz0o8gG.js","/assets/UsersActivity-DNgjZjlR.js","/assets/UsersManagement-aGwVH80M.js","/assets/VerdictBlock-CiH_7KSS.js","/assets/VerifixParity-C_l9aOH8.js","/assets/VerifixSettings-C2oWELZE.js","/assets/VerifixSync-CdIWJY29.js","/assets/VfxApiMap-C6hGXVDf.js","/assets/VfxDictionaries-Jq7fc36g.js","/assets/VfxEmployees-Bn5cr2hD.js","/assets/VfxHrMoves-nIVpEkP-.js","/assets/VfxJobs-B8TTpcrq.js","/assets/VfxPhoto-Bw37RTMB.js","/assets/VfxShifts-DbutQ-d7.js","/assets/VfxState-CbAbv9OO.js","/assets/VfxTimebooks-NW33Qh2M.js","/assets/VfxTimesheet-DTxgUKT2.js","/assets/WatchProgress-Cdf7i3aU.js","/assets/WebLogin-BkLqhQMT.js","/assets/WorkersAttendance-dU8VdyrO.js","/assets/WorkersComposition-DVLvFJGZ.js","/assets/WorkersMovements-Kjt4XKpw.js","/assets/WorkersPage-r_mT5Qho.js","/assets/Zagruzka-CsMt5gSz.js","/assets/ZagruzkaCell-CLA706Nc.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-58tjJmei.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CJa5aMVy.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BkQAQLVx.js","/assets/broadcastTree-Bl-xCW84.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BT2tzt48.js","/assets/cellMoveRefusal-UkILGITD.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BzyO6-gT.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-D_TEgWY2.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-B6DIsFVb.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CPWfnP3Y.js","/assets/index-duS00f3X.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CfIujDol.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-ZglYGKxf.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CY8AY5Z6.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-CSNjG-zV.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-CcztT9ai.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-dwyWtzHA.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-Bk3u2q71.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DTjBXxNu.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-BA8MUq9B.js","/assets/useMutation-B5H6THHe.js","/assets/useOpenParam-BBvGny9l.js","/assets/useStatusBands-Dz7H1Rxl.js","/assets/useUrlScope-5243FF_E.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-JRQiYyB3.js","/assets/uz_cyrl-C6IeUQZN.js","/assets/vfx-BOYTCg_a.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-CzeKWuPG.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
