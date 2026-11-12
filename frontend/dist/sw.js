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

const BUILD = "2026-11-12T06:36:54.946Z";
const PRECACHE = ["/","/assets/ActionHistory-BwB77jd-.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-DI-25Ukn.js","/assets/AiKeys-D0-KpUnp.js","/assets/AnalysisBoard-Dmp6XJlq.js","/assets/ApiAccess-D9ffTmmU.js","/assets/AppLauncher-DEK61pZ6.js","/assets/Arc-DvQKhBhI.js","/assets/Assessment-cJU2cB0V.js","/assets/AssessmentGrade-B2j77Ips.js","/assets/AssessmentList-DZXeRaFu.js","/assets/Assistant-BYRa8PcQ.js","/assets/AttendanceCleanup-DU6R9FDV.js","/assets/AttendanceUpload-DQJ7TYOf.js","/assets/AuditTable-B7Oa_2gA.js","/assets/BrigadirProfile-BH0LIl81.js","/assets/BrigadirsKpi-Bk8Gnomx.js","/assets/Broadcast-D0oNU2Gz.js","/assets/BroadcastReceivers-B7UF1FjX.js","/assets/BroadcastRecord-CvznOw7i.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-DvzTiVRu.js","/assets/CategoryLegendModal-CBG7jUuL.js","/assets/CellConcerns-BGXlvZNX.js","/assets/CellDetails-BZooeDjC.js","/assets/CellFormModal-BGzYsA9e.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-BHas2eOk.js","/assets/Cells-BcI1rxWN.js","/assets/ColumnFilter-CDOeFkat.js","/assets/ColumnsPicker-dE5poGmr.js","/assets/CommentsModal-D8nd1tQZ.js","/assets/ComparisonTable-9ojltjYJ.js","/assets/Concerns-9h24_-MB.js","/assets/ConcernsPieces-DqcJIB-D.js","/assets/CountStepper-8lHREY2D.js","/assets/Daily-DafBuwmO.js","/assets/DataSources-CgPG_fO7.js","/assets/DataTable-D3YgiP9O.js","/assets/DateRangePicker-DZE9XwbW.js","/assets/DayReportView-Dxuv__SM.js","/assets/DayStepper-CYNZb4oE.js","/assets/DayStrip-D17k6lNS.js","/assets/DbBackup-M1Tv5H3M.js","/assets/DifferenceBreakdown-DSqY8azZ.js","/assets/DocAudit-DBxOXDaV.js","/assets/Downtime-C3XNJ32S.js","/assets/Education-Cfzrl6o7.js","/assets/EducationLesson-BAQujvy3.js","/assets/EmptyState-6p-rXSaT.js","/assets/Exam-BDmxYgVc.js","/assets/ExamAdmin-zUY9kksp.js","/assets/Factories-CMpot7Ny.js","/assets/FactorySelect-CCtxRfuK.js","/assets/Gamification-MIjhR85V.js","/assets/GroupBadge-xZfQ6l78.js","/assets/HeatmapChart-D-7WsJMs.js","/assets/IdleCell-Cpf5QoPo.js","/assets/IdleOwners-PHrFID9D.js","/assets/IdleSolutions-CIa8jvG6.js","/assets/IdleSource-B-i6270E.js","/assets/KPICard-Bvf_aqJk.js","/assets/Kaizen-FQMwvGJ-.js","/assets/Kelish-BO7MVlO8.js","/assets/KpiBits-BmN8az5b.js","/assets/KpiDeltaCard-D1vasRwZ.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-BntkvoyO.js","/assets/LeaderAppeal-DPgW6eQu.js","/assets/LeaderCutoffs-C-5e9M-m.js","/assets/LeaderDailyTasks-DGEr10se.js","/assets/LeaderDayExclusions-DyqA07eK.js","/assets/LeaderDayReport-Cnw5m1bK.js","/assets/LeaderTasksAdmin-BUntWlyB.js","/assets/LeaderUnitReport-C4l0gTPw.js","/assets/Leaderboard-Cu7KxuVv.js","/assets/Leaders-DVp5ZU1Z.js","/assets/LeadersKpi-CfKcyOX6.js","/assets/Lightbox-CKSFdmZh.js","/assets/LiveOverview-BExm14lZ.js","/assets/Login-DVxaqLN2.js","/assets/Logs-wWL4TcOv.js","/assets/LostWorkers-Bv7gxcYj.js","/assets/NotFound-CoFXtL_v.js","/assets/Notifications--APJ5q6l.js","/assets/NotionTasks-DMk4cHfs.js","/assets/NotionTrackerSettings-wvoX_EUX.js","/assets/Ontime-DXz5rc5k.js","/assets/Ovens-VkSzdmw1.js","/assets/OvensSettings-DDIL7_37.js","/assets/Overview-BAiFFENY.js","/assets/OwnerChip-BOuoE2Yn.js","/assets/PageAccess-Dx2556hW.js","/assets/Pagination-DYlLMuZE.js","/assets/People-Dq-cmoCh.js","/assets/PerenaladkaFactTable-CWksLvHJ.js","/assets/Permissions-BjjTlydU.js","/assets/PersonCard-C1DZ_I5s.js","/assets/PlanFulfillment-BsHu5qIr.js","/assets/Production-Cw3Vsu0U.js","/assets/ProductionUpload-BsCij-hr.js","/assets/Profile-SQN8l6QN.js","/assets/ProfileAvatar-BY0DmkfD.js","/assets/ProfilesManagement-KPlmm4YV.js","/assets/ProofCamera-CBanGUd9.js","/assets/ProofPhoto-BBaz9pya.js","/assets/Quality-F4sSJc4_.js","/assets/RawRows-DIJ7HtwN.js","/assets/Reports-Dl-sgarO.js","/assets/RequestStateChip-LQ95VsiU.js","/assets/RichTextEditor-DhAIS7me.js","/assets/SaveState-DO2bvzWe.js","/assets/SearchInput-uTEY_o-R.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-JsyDj4aH.js","/assets/ShiftDaily-sP5OVU61.js","/assets/ShiftTimes-BtGP3T-u.js","/assets/Staff-1wq8FPng.js","/assets/StaffListAtCheck-1rfJBBJx.js","/assets/StatusBadge-Cmxmawqt.js","/assets/StatusBandsModal-8WFN3Ewe.js","/assets/TargetGoal-UpYStsQV.js","/assets/Targets-C0Gyn9cM.js","/assets/TaskerSettings-eiQ1Ttxx.js","/assets/Tasks-cnYVM6Lv.js","/assets/TgProfile-BsQex02A.js","/assets/TimeWheelPicker-D-yyPHdi.js","/assets/Tooltip-BoTRcOfX.js","/assets/TranslationsEditor-Cbk-4ZWM.js","/assets/TrelloAnalytics-DH6ZvCAK.js","/assets/TrelloSettings-DWm3nY4Y.js","/assets/TrendChart-Cna9z7v5.js","/assets/TripleSpeedometer-1q7IAJE2.js","/assets/Trudoyomkost-5yB862k5.js","/assets/UploadDropzone-C1oA9NoQ.js","/assets/UsersActivity-BzTlmw8Q.js","/assets/UsersManagement-D82RyJKG.js","/assets/VerdictBlock-B48sWLKw.js","/assets/VerifixParity-ClNWwjLS.js","/assets/VerifixSettings-B0-f8TUS.js","/assets/VerifixSync-Ch8831pH.js","/assets/VfxApiMap-BG38kojb.js","/assets/VfxDictionaries-WfQhbvsT.js","/assets/VfxEmployees-CjwtC2L6.js","/assets/VfxHrMoves-CxKKE9cy.js","/assets/VfxJobs-i-ovHpND.js","/assets/VfxPhoto-Bd0PCO9V.js","/assets/VfxShifts-wiM5whek.js","/assets/VfxState-1cukWuwA.js","/assets/VfxTimebooks-D49Yqq-Y.js","/assets/VfxTimesheet-DB0bwLpg.js","/assets/WatchProgress-CC4kHSIi.js","/assets/WebLogin-C7S6HOdY.js","/assets/WorkersAttendance-CZZx8tfd.js","/assets/WorkersComposition-DyMUQncl.js","/assets/WorkersMovements-bT-nL389.js","/assets/WorkersPage-C_bdLTvn.js","/assets/Zagruzka-BGWCemE4.js","/assets/ZagruzkaCell-yw5JLaTm.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BnyMS82u.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BAIIV0yi.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-jVTZG-YF.js","/assets/broadcastTree-BExra2Cq.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BoFla20Y.js","/assets/cellMoveRefusal-ymQi0phj.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-ezSIKOvz.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-BP58EmTp.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CM7ch5Oj.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DR6y6Dhz.js","/assets/index-wrGK6Zf-.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-ClH_J3o1.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-Ciz2ipni.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-D9DJY5cc.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-C4GgDhSY.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CMDUXkN4.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-Cqp1PlRI.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-BIN9VTCz.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-0GfyLdOR.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-CVd3SNCy.js","/assets/useMutation-CJkmwWhs.js","/assets/useOpenParam-CZJR0rsH.js","/assets/useStatusBands-KLOsiJ-Y.js","/assets/useUrlScope-CsWdAbUi.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-Dc_lyN7N.js","/assets/uz_cyrl-DdN9f46H.js","/assets/vfx-S5V3Q9ye.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-BQv0x7h0.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
