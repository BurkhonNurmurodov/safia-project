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

const BUILD = "2026-11-20T05:53:55.561Z";
const PRECACHE = ["/","/assets/ActionMenu-DIjho2bj.js","/assets/AdminPage-hs8NscNT.js","/assets/AdminTabs-Dy3-7veG.js","/assets/AiKeys-DE9kBsC7.js","/assets/AnalysisBoard-DRR3sFPP.js","/assets/ApiAccess-C86hn2x7.js","/assets/AppLauncher-DpRDBAyJ.js","/assets/Arc-BWEz_gbh.js","/assets/Assessment-C4o0eT31.js","/assets/AssessmentGrade-416guBjC.js","/assets/AssessmentList-Did9RDGM.js","/assets/Assistant-BLdz0DsO.js","/assets/AttendanceCleanup-p8hnp1oo.js","/assets/AttendanceUpload-ClbZs3nA.js","/assets/AuditTable-JCnkTEeI.js","/assets/BrigadirProfile-OhXschgK.js","/assets/BrigadirsKpi--4LMAB0d.js","/assets/Broadcast-bF_bpFgJ.js","/assets/BroadcastReceivers-DhLCtAIc.js","/assets/BroadcastRecord-B_0JlrWs.js","/assets/Button-BByRB7Le.js","/assets/CatLockNotice-C-wqTWYu.js","/assets/CategoryLegendModal-CPQFqwv4.js","/assets/CellConcerns-DjA4Yafd.js","/assets/CellDetails-DqD4putT.js","/assets/CellFormModal-B3fRHsxa.js","/assets/CellIdent-DE6qkdqd.js","/assets/CellLink-D4i9ZaQH.js","/assets/Cells-Bp98vRmF.js","/assets/ColumnFilter-ajlS3gw6.js","/assets/ColumnsPicker-CgvPKL1B.js","/assets/CommentsModal-DUkcJArC.js","/assets/ComparisonTable-D8K1vJvf.js","/assets/Concerns-DNStBh8R.js","/assets/ConcernsPieces--g1vFhu9.js","/assets/ContainerFlow-wk1bf8La.js","/assets/ContainerTotalsCard-C6-o6Fcv.js","/assets/Containers-DtR-eXWw.js","/assets/CountStepper-CRIaVDlc.js","/assets/Daily-Bo-a1TKm.js","/assets/DataSources-dLaNRwNe.js","/assets/DataTable-CaZTv3Zt.js","/assets/DateRangePicker-DO-Qmwow.js","/assets/DayReportView-CY2wOaJ_.js","/assets/DayStepper-f2HU7Wkc.js","/assets/DayStrip-D55V7Cl2.js","/assets/DbBackup-Br-pHodL.js","/assets/DifferenceBreakdown-XBfiIx4Q.js","/assets/DocAudit-BJhnaLpk.js","/assets/Downtime-BcfM_jdW.js","/assets/Education-D2LeHbvn.js","/assets/EducationLesson-DUFu5hmN.js","/assets/EmptyState-C-mShYwI.js","/assets/Equipment-JJpILk2T.js","/assets/Exam-C-xBoI0F.js","/assets/ExamAdmin-C4G5IjGH.js","/assets/Factories-BakA7BYS.js","/assets/FactorySelect-BQR_BjEm.js","/assets/Gamification-HOIsbuKG.js","/assets/GroupBadge-BsKdED26.js","/assets/HeatmapChart-BsLRizCe.js","/assets/HourlyContainers-k1HfU8Yf.js","/assets/IdleCell-C5v6EFAh.js","/assets/IdleOwners-ZZtyAWIa.js","/assets/IdleSolutions-CUk70BEJ.js","/assets/KPICard-Cw5WW5n_.js","/assets/Kaizen-C_PZo759.js","/assets/Kelish-P0kLfZ4j.js","/assets/Kitchen-CUFij44Q.js","/assets/KpiBits-kY9JGYGK.js","/assets/KpiDeltaCard-REPzSKtU.js","/assets/LangContext-2A4sPKlL.js","/assets/LangTextInput-Kofaohjz.js","/assets/Layout-DBF0T59h.js","/assets/LeaderAppeal-Dpt2D_CZ.js","/assets/LeaderDailyTasks-CBhFb1yK.js","/assets/LeaderDayReport-BCGy3Rc-.js","/assets/LeaderNotCounting-DS3Jy1cN.js","/assets/LeaderTasksAdmin-DRw-QzDB.js","/assets/LeaderUnitReport-B0s9-i-w.js","/assets/Leaderboard-yjBJIGdx.js","/assets/Leaders-BLut4jOV.js","/assets/LeadersKpi-DZYVDo6c.js","/assets/Lightbox--W_XKy1M.js","/assets/LiveOverview-DnNqSEYy.js","/assets/Login-QkL0rloP.js","/assets/Logs-DYitRvbb.js","/assets/LostWorkers-BkSgPdbK.js","/assets/Meter-CRRHrYuq.js","/assets/NotFound-D05Kj8oz.js","/assets/Notifications-BXnrCQCa.js","/assets/NotionTasks-D7u8S1lD.js","/assets/NotionTrackerSettings-CD-Bue5a.js","/assets/Ontime-BIkwfdbz.js","/assets/OrgChart-C54S6fKJ.js","/assets/Ovens-rB7eCcUn.js","/assets/OvensSettings-FyMSWfIH.js","/assets/Overview-Rhc_yHic.js","/assets/OwnerChip-DnC1f-m2.js","/assets/Pagination-Cb7ygrrZ.js","/assets/People-B3_P11kD.js","/assets/PerenaladkaFactTable-CUcErw-3.js","/assets/Permissions-Cx1A5Doj.js","/assets/PersonCard-DgcUAC5i.js","/assets/PlanFulfillment-CGL267Hd.js","/assets/Production-CHRlQNGC.js","/assets/ProductionUpload-D4TjQaV1.js","/assets/Profile-DAMd_9cz.js","/assets/ProfileAvatar-Cckhb2Q9.js","/assets/ProfilesManagement-Cnr0pCgK.js","/assets/ProofCamera-D19b1Eim.js","/assets/ProofPhoto-B6-XvKqX.js","/assets/Quality-B6_Xcw1a.js","/assets/RawRows-0TEXNyhy.js","/assets/Reports-6mpYScK1.js","/assets/RequestStateChip-Bd81zstz.js","/assets/RichTextEditor-DmDSy_CJ.js","/assets/SaveState-DOD0MT_d.js","/assets/SdPanelSettings-CkDbKbCY.js","/assets/SearchInput-DUp3RACg.js","/assets/SeasonalityHeatmap-B65j5wfW.js","/assets/SegmentedToggle-CIxWlaZZ.js","/assets/SetupTimes-h0JEcF5S.js","/assets/ShiftDaily-Cd-xq3j_.js","/assets/ShiftTimes-UJ0RM7Tk.js","/assets/SortableList-DgrUPWKx.js","/assets/Staff-BORQK7pG.js","/assets/StaffListAtCheck-B4U0_5ix.js","/assets/StatusBadge-C0pYAMnL.js","/assets/StatusBandsModal-3Q4YfvWB.js","/assets/TargetGoal-C40EbeZp.js","/assets/Targets-QUGFpZgj.js","/assets/TaskFormModal-BBwBAfAj.js","/assets/TaskerSettings-yRAbtWIC.js","/assets/Tasks-BJ-VyIU5.js","/assets/TgProfile-BbyqGzSJ.js","/assets/TimeWheelPicker-m3zkuq1N.js","/assets/Toast-DLkPq-u6.js","/assets/Tooltip-Cd0j8XOq.js","/assets/TranslationsEditor-BHmU8kjK.js","/assets/TrelloAnalytics-BHqUstpD.js","/assets/TrelloSettings-ChPqJaLY.js","/assets/TrendChart-D_KjZGwB.js","/assets/TripleSpeedometer-pF-pDNMm.js","/assets/Trudoyomkost-BSHmpe-F.js","/assets/UploadDropzone-Ckl6lJR3.js","/assets/UsersActivity-CuW9Lg8B.js","/assets/UsersManagement-BbdNfsfq.js","/assets/VerdictBlock-3ge1Kb_q.js","/assets/VerifixPage-BmSBEy0n.js","/assets/VerifixParity-DIjDTRk4.js","/assets/VfxApiMap-3tiahL38.js","/assets/VfxDictionaries-Cs6AmqDe.js","/assets/VfxEmployees-mKf9v4z5.js","/assets/VfxHrMoves-c1fGiGzo.js","/assets/VfxJobs-z101xzZl.js","/assets/VfxPhoto-BmeU2f3F.js","/assets/VfxShifts-BL8FSdnQ.js","/assets/VfxState-B35qB9Op.js","/assets/VfxTimebooks-D3C_86fc.js","/assets/VfxTimesheet-BMiuYMDB.js","/assets/WatchProgress-C1e2NmR6.js","/assets/WebLogin-BMumgxB2.js","/assets/WorkersAttendance-C1ZonWVh.js","/assets/WorkersComposition-DyVmfmn4.js","/assets/WorkersMovements-Cb2w44Mi.js","/assets/WorkersPage-CkGT-6g3.js","/assets/Zagruzka-SJ40xLFX.js","/assets/ZagruzkaCell-JTYYqsZp.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CEmnhF_X.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-arWXIEl8.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-B6_1rYjd.js","/assets/broadcastTree-BSjZ2fVH.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-BeD4XRmt.js","/assets/categories-op-2reYm.js","/assets/cellMoveRefusal-DtK9h6xV.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-h95wyAAl.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-BJMD0VjI.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-CVofARPX.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BH54YsjB.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CQbzZee9.css","/assets/index-Drh2ixRg.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-C0PBOFNH.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-D0w79nDs.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CaZl1ktg.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CUBVn8lY.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-BIA1VEfG.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-EI80oO9E.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DGskdIYF.js","/assets/ru-D8gimGQR.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BJluhHQe.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CliWM9kz.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-ChfDr16y.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BKCEcO5I.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-CaVLrwQ2.js","/assets/useMutation-oGRLwQcs.js","/assets/useOpenParam-CkZpLXbA.js","/assets/useStatusBands-D-Zbpcuy.js","/assets/useUrlScope-CLR3V7qV.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-Ca5foF77.js","/assets/uz_cyrl-D52ZPTwl.js","/assets/vfx-B8HSXf54.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-DfqsSPb2.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/x-CfYkDDdF.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
