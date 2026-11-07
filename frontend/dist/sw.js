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

const BUILD = "2026-11-07T08:58:39.712Z";
const PRECACHE = ["/","/assets/ActionHistory-D8HYNNgo.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-D5-AVXYO.js","/assets/AiKeys-BpWAOb_d.js","/assets/AnalysisBoard-CX0YTQ3d.js","/assets/AppLauncher-CuU1TWnm.js","/assets/Arc-BPxS83ja.js","/assets/Assessment-I_tp6ozX.js","/assets/AssessmentGrade-BBMXPuxk.js","/assets/AssessmentList-NJ-tmlsg.js","/assets/Assistant-B5_THy9v.js","/assets/AttendanceCleanup-CNU8lFDx.js","/assets/AttendanceUpload-BO9ljFVJ.js","/assets/AuditTable-Ctea3Rwa.js","/assets/BrigadirProfile-DQAdsXFw.js","/assets/BrigadirsKpi-CkpkcDqy.js","/assets/Broadcast-CzT1fDGu.js","/assets/BroadcastReceivers-409PmakK.js","/assets/BroadcastRecord-Bkuc-v8R.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-BdHBTU4Y.js","/assets/CategoryLegendModal-DQ8JZRgi.js","/assets/CellConcerns-BAJh2XLP.js","/assets/CellDetails-BZEQ-_Vx.js","/assets/CellFormModal-BaYcIJMt.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-BaBWfXD_.js","/assets/Cells-DVe1qjVV.js","/assets/ColumnFilter-Vo1qnPTg.js","/assets/ColumnsPicker-CL1BFz4S.js","/assets/CommentsModal-4rjVYOQO.js","/assets/ComparisonTable-CEQwJywN.js","/assets/Concerns-DYhAPyCq.js","/assets/ConcernsPieces-CbH8jpn4.js","/assets/CountStepper-C-2XGuFS.js","/assets/Daily-QGp1vDk6.js","/assets/DataSources-Cb6wB9mZ.js","/assets/DataTable-BlxPsSeM.js","/assets/DateRangePicker-CYNMOtPk.js","/assets/DayReportView-BZqllPwH.js","/assets/DayStepper-l5wZ-6s4.js","/assets/DayStrip-BfmOpFaK.js","/assets/DbBackup-BUuHWAA4.js","/assets/DifferenceBreakdown-BJ-v4AiL.js","/assets/DocAudit-rK4kiENg.js","/assets/Downtime-Bigt30eC.js","/assets/Education-BH-ueBZL.js","/assets/EducationLesson-CtAk0GgY.js","/assets/EmptyState-x_VCAt8z.js","/assets/Exam-2LBdSadT.js","/assets/ExamAdmin-CZvxQkNo.js","/assets/Factories-DYupz1vN.js","/assets/FactorySelect-BEFNhfsR.js","/assets/Gamification-DQdOhC1W.js","/assets/GroupBadge-_bTeWaAq.js","/assets/HeatmapChart-Bd7n2jnV.js","/assets/IdleCell-CE8JLbOi.js","/assets/IdleOwners-FTlFrgQ5.js","/assets/IdleSolutions-COtktB48.js","/assets/IdleSource-Dcbi1VFS.js","/assets/KPICard-DOyZ3Jko.js","/assets/Kaizen-DfgGQwa9.js","/assets/Kelish-mKxFFZ52.js","/assets/KpiBits-DWLJYa1y.js","/assets/KpiDeltaCard-BxSKaw1K.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-CRt67ay0.js","/assets/LeaderAppeal-B-7-8dfr.js","/assets/LeaderCutoffs-Q12AoFid.js","/assets/LeaderDailyTasks-BSsMp3Ap.js","/assets/LeaderDayExclusions-C1r2uT3g.js","/assets/LeaderDayReport-DpdSpYtV.js","/assets/LeaderTasksAdmin-Ky-wwwqf.js","/assets/LeaderUnitReport-Ckt_MBWY.js","/assets/Leaderboard-D1AaFP63.js","/assets/Leaders-bIrblv0M.js","/assets/LeadersKpi-qUMwhunn.js","/assets/Lightbox-BhQ_lLIb.js","/assets/LiveOverview-BVOHv0q-.js","/assets/Login--1_5ttDi.js","/assets/Logs-Cc7NVu-2.js","/assets/LostWorkers-s75Of_4F.js","/assets/NotFound-CDJDI52K.js","/assets/Notifications-B7jov9UQ.js","/assets/NotionTasks-BYv5nFFF.js","/assets/NotionTrackerSettings-yvaVksr3.js","/assets/Ontime-C4SJcx4m.js","/assets/Ovens-y_NHF-i4.js","/assets/OvensSettings-DdqE8QRb.js","/assets/Overview-C-AzwmKF.js","/assets/OwnerChip-xwV9KU_O.js","/assets/PageAccess-C1XveO5l.js","/assets/Pagination-D3b58DkC.js","/assets/People-C3KS_GM4.js","/assets/PerenaladkaFactTable-B9Aru5tY.js","/assets/Permissions-B57qooja.js","/assets/PersonCard-DrGSg0qT.js","/assets/PlanFulfillment-DRPmPl-C.js","/assets/Production-BhMqyMxU.js","/assets/ProductionUpload-DtXggTEp.js","/assets/Profile-pmb1SHIl.js","/assets/ProfileAvatar-DX86SfP2.js","/assets/ProfilesManagement-C-EvMR2x.js","/assets/ProofCamera-CLUjhBK7.js","/assets/ProofPhoto-ClWd4Yoj.js","/assets/Quality-CcTfPZO8.js","/assets/RawRows-DSr0k1o9.js","/assets/Reports-De40LZOG.js","/assets/RequestStateChip-jpuDiYQT.js","/assets/RichTextEditor-2r-oKslU.js","/assets/SaveState-DynSEewl.js","/assets/SearchInput-DL3pJzBV.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-RHmD7r1M.js","/assets/ShiftDaily-DcoGz84j.js","/assets/ShiftTimes-Ld-DYc44.js","/assets/Staff-C8ymUJV2.js","/assets/StaffListAtCheck-P9yDZGxP.js","/assets/StatusBadge-Bo7x_yt1.js","/assets/StatusBandsModal-Dr7_u5TE.js","/assets/TargetGoal-CJtpgZOl.js","/assets/Targets-Dq8zysti.js","/assets/Tasks-qXjeXnGc.js","/assets/TimeWheelPicker-BJO8pJXV.js","/assets/Tooltip-BqYEH5LA.js","/assets/TranslationsEditor-Bg8h1eBP.js","/assets/TrelloAnalytics-ClTMKv72.js","/assets/TrelloSettings-DIVf7dR3.js","/assets/TrendChart-BqckyByi.js","/assets/TripleSpeedometer-Bl574n9P.js","/assets/Trudoyomkost-y0NDsEpv.js","/assets/UploadDropzone-Dh7cL8_7.js","/assets/UsersActivity-CBjjCCKj.js","/assets/UsersManagement-B1H0iWgd.js","/assets/VerdictBlock-BDR25ShR.js","/assets/VerifixParity-G6TImDz1.js","/assets/VerifixSettings-CKnSNk8O.js","/assets/VerifixSync-CRZBtTIS.js","/assets/VfxApiMap-BcZuVQK-.js","/assets/VfxDictionaries-BtgAuQzv.js","/assets/VfxEmployees-Cb106QnX.js","/assets/VfxHrMoves-waEe8Slf.js","/assets/VfxJobs-CyHtsQ2h.js","/assets/VfxPhoto-G28-FT89.js","/assets/VfxShifts-_XL46tMr.js","/assets/VfxState-BIqB-TqW.js","/assets/VfxTimebooks-BYBmnFpz.js","/assets/VfxTimesheet-DYY7oshm.js","/assets/WatchProgress-LvT1A-Fd.js","/assets/WebLogin-B3Vov63k.js","/assets/WorkersAttendance-CtnuTGEG.js","/assets/WorkersComposition-DzU0GWAe.js","/assets/WorkersMovements-C8UX_7tf.js","/assets/WorkersPage-B3bnsVjQ.js","/assets/Zagruzka-BHlGVw-r.js","/assets/ZagruzkaCell-Cf6df7CI.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DY4TIm28.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-DXz6Qo31.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BLWSJEg7.js","/assets/broadcastTree-C7bfM-Wq.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BQ3QBUe1.js","/assets/cellMoveRefusal-DwWIfrx5.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CflZ6O8B.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Dv6-5avE.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-a10SnNgg.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-COSWaPAZ.css","/assets/index-ywr-9sLs.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-Cgj47mov.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CApkK-pN.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-BwaFgOV2.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-Do3h3BXr.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CSyp0k3f.js","/assets/ru-BshZBZIo.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-Cy7hTSFU.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-ClzI7uS0.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-DzrnDRsB.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Ct8EvSV3.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-pkimuHEf.js","/assets/useMutation-DCo3yohy.js","/assets/useOpenParam-DIRpmxOo.js","/assets/useStatusBands-yHgFtRcg.js","/assets/useUrlScope-DqgJ2bZH.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-D2wHCeR1.js","/assets/uz_cyrl-D4n6o4Fl.js","/assets/vfx-DpfYxwU1.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-7ozTfwIP.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
