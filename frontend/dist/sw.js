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

const BUILD = "2026-11-09T04:41:10.814Z";
const PRECACHE = ["/","/assets/ActionHistory-CWLMNSWA.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-4aZ_RbdV.js","/assets/AiKeys-DABIJ5zz.js","/assets/AnalysisBoard-Dw0GnpyO.js","/assets/AppLauncher-Cn0YkmcF.js","/assets/Arc-cxASiN89.js","/assets/Assessment-DagPYRLX.js","/assets/AssessmentGrade-C47UhZHO.js","/assets/AssessmentList-DtxmWRmO.js","/assets/Assistant-DuUhOz_R.js","/assets/AttendanceCleanup-BsMA-ILT.js","/assets/AttendanceUpload-BWRliMLS.js","/assets/AuditTable-BKZVnjxe.js","/assets/BrigadirProfile-Dywtsvjc.js","/assets/BrigadirsKpi-Du4_Yz5l.js","/assets/Broadcast-CW6iklhh.js","/assets/BroadcastReceivers-ET-lObaW.js","/assets/BroadcastRecord-gvKZW2rH.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-BWnXGoYG.js","/assets/CategoryLegendModal-weHXTUdc.js","/assets/CellConcerns-DPFwg4fR.js","/assets/CellDetails-B9rcu-j0.js","/assets/CellFormModal-Az4Px2gV.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-CSUSyRmG.js","/assets/Cells-sznTFV8a.js","/assets/ColumnFilter-DUlb0vYQ.js","/assets/ColumnsPicker-pryLdjcn.js","/assets/CommentsModal-CJHBoVYG.js","/assets/ComparisonTable-CamYdniZ.js","/assets/Concerns-D3eARZSn.js","/assets/ConcernsPieces-CTtc_SwV.js","/assets/CountStepper-BxONVZoA.js","/assets/Daily-C3nB4R3J.js","/assets/DataSources-BspB4Q78.js","/assets/DataTable-3rIzY0EU.js","/assets/DateRangePicker-4u-OowLl.js","/assets/DayReportView-2lBQxz8E.js","/assets/DayStepper-C1thDEFy.js","/assets/DayStrip-AJRwE5L8.js","/assets/DbBackup-Dpg6wvMF.js","/assets/DifferenceBreakdown-T5FHMLUP.js","/assets/DocAudit-DS4b4dKh.js","/assets/Downtime-B1GZkCb3.js","/assets/Education-kGImGHxh.js","/assets/EducationLesson-ejQWEubq.js","/assets/EmptyState-DJ5PDFCL.js","/assets/Exam-BaiN_AfV.js","/assets/ExamAdmin-BOG_-Lkr.js","/assets/Factories-Dj4vX7YT.js","/assets/FactorySelect-By92YdPk.js","/assets/Gamification-DY-aZdPq.js","/assets/GroupBadge-Cf1AY_n1.js","/assets/HeatmapChart-DXgrV0rd.js","/assets/IdleCell-C-L90MU-.js","/assets/IdleOwners-MbaEZW2R.js","/assets/IdleSolutions-BQ6dXIOq.js","/assets/IdleSource-GaLKgSa-.js","/assets/KPICard-DGixGg6C.js","/assets/Kaizen-BwcAIS-8.js","/assets/Kelish-B5KP6_Jq.js","/assets/KpiBits-D39enQ_8.js","/assets/KpiDeltaCard-CU4XAmsH.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-Dg-9_D0A.js","/assets/LeaderAppeal-D02fxQC3.js","/assets/LeaderCutoffs-B0IOBH4G.js","/assets/LeaderDailyTasks-rooQAteZ.js","/assets/LeaderDayExclusions-DB8rxcV2.js","/assets/LeaderDayReport-BoNJz9VX.js","/assets/LeaderTasksAdmin-Hh8jK81j.js","/assets/LeaderUnitReport-CPnXWUC1.js","/assets/Leaderboard-CyxuJoqk.js","/assets/Leaders-Bf1ystX1.js","/assets/LeadersKpi-CrOV5ohm.js","/assets/Lightbox-B1GF5RXV.js","/assets/LiveOverview-B0YxoNYf.js","/assets/Login-D-drbpig.js","/assets/Logs-C5dqknZo.js","/assets/LostWorkers-GwqUpYto.js","/assets/NotFound-GUO7JdBL.js","/assets/Notifications-Cvjx3FHz.js","/assets/NotionTasks-C6PCS5ej.js","/assets/NotionTrackerSettings-B1O0vqtK.js","/assets/Ontime-Bd9ojCiQ.js","/assets/Ovens-0NbUDcXd.js","/assets/OvensSettings-BJqkdFuE.js","/assets/Overview-MEhYocCB.js","/assets/OwnerChip-W8sg3QTb.js","/assets/PageAccess-ibxVsHML.js","/assets/Pagination-CjonOT8O.js","/assets/People-CMHi9mLO.js","/assets/PerenaladkaFactTable-BjCBVbik.js","/assets/Permissions-BAWTaIkK.js","/assets/PersonCard-CG2TeJRN.js","/assets/PlanFulfillment-iBDlNc2h.js","/assets/Production-CSfXOiwU.js","/assets/ProductionUpload-D-UsROof.js","/assets/Profile-ipSwbAJ6.js","/assets/ProfileAvatar-Cbk1SWGO.js","/assets/ProfilesManagement-GiK-_zP2.js","/assets/ProofCamera-jgCv3Q0B.js","/assets/ProofPhoto-Dy8CWe9R.js","/assets/Quality-vW-btoCC.js","/assets/RawRows-BC1VTvIE.js","/assets/Reports-BQmAYJyP.js","/assets/RequestStateChip-B7bIisv2.js","/assets/RichTextEditor-Dt8-rD7R.js","/assets/SaveState-DjWZSSrg.js","/assets/SearchInput-DXXtGyts.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-Bo62nCOO.js","/assets/ShiftDaily-Pbc4MZhW.js","/assets/ShiftTimes-IpRu1ZQB.js","/assets/Staff-D-RMKLDF.js","/assets/StaffListAtCheck-BBeeWB9_.js","/assets/StatusBadge-CXv2dpm_.js","/assets/StatusBandsModal-BJ-y6-8V.js","/assets/TargetGoal-CyrNLRvA.js","/assets/Targets-BVGqf3-t.js","/assets/Tasks-BgVHFJT5.js","/assets/TimeWheelPicker-BYuA1Xgu.js","/assets/Tooltip-Ix0FjTmY.js","/assets/TranslationsEditor-CM2DIAKV.js","/assets/TrelloAnalytics-Bsehu_Sh.js","/assets/TrelloSettings-BtwMwpJM.js","/assets/TrendChart-CCGCg-P1.js","/assets/TripleSpeedometer-g5oBEjOb.js","/assets/Trudoyomkost-C-PlaiMK.js","/assets/UploadDropzone-DCPcgOPA.js","/assets/UsersActivity-Bx5BA51X.js","/assets/UsersManagement-CAnC1fvg.js","/assets/VerdictBlock-B89Ejmqe.js","/assets/VerifixParity-qILYfKEr.js","/assets/VerifixSettings-DNIYl-dI.js","/assets/VerifixSync-D40zkGQW.js","/assets/VfxApiMap-COpzoe3c.js","/assets/VfxDictionaries-hFtbDuHR.js","/assets/VfxEmployees-DGwDC0Wc.js","/assets/VfxHrMoves-DERCaHxu.js","/assets/VfxJobs-Cz9iHkIh.js","/assets/VfxPhoto-CqKrLYzF.js","/assets/VfxShifts-XQRtJ7C5.js","/assets/VfxState-BrH_yUHl.js","/assets/VfxTimebooks-BEJqhWBf.js","/assets/VfxTimesheet-Bz95Hy5f.js","/assets/WatchProgress--oK7qUIo.js","/assets/WebLogin-29U_Bl4O.js","/assets/WorkersAttendance-BbaQkDAE.js","/assets/WorkersComposition-B5CcWO3K.js","/assets/WorkersMovements-DlpiCH3Y.js","/assets/WorkersPage-CQILGLdM.js","/assets/Zagruzka-yPsJDKIG.js","/assets/ZagruzkaCell-D8-pEwhs.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CRtpuLbv.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-hN_YiKTe.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-N_EzSKtX.js","/assets/broadcastTree-Pw2_iUwM.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-Dtij8ZEX.js","/assets/cellMoveRefusal-C-VpQr3b.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Bxb3S8tp.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-BAET2TAz.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CtgyKjq5.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BcNgb6KK.js","/assets/index-CQT131y1.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BkNbuEGg.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DnzeSDrK.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-BwaFgOV2.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-D_aHom7Z.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CSyp0k3f.js","/assets/ru-CqDUfcw0.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-DvV0nItE.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-D6A3jsEH.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-DzrnDRsB.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Bhs7r_pC.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-BSWJ7Rd4.js","/assets/useMutation-DKYUoNaH.js","/assets/useOpenParam-CN_eJay3.js","/assets/useStatusBands-DCkjPepX.js","/assets/useUrlScope-DzHLtrEG.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-tYrZkvYd.js","/assets/uz_cyrl-9KfYNdTv.js","/assets/vfx-CRe8VrQv.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-C3dYbg77.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
