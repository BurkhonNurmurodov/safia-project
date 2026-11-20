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

const BUILD = "2026-11-20T06:09:11.672Z";
const PRECACHE = ["/","/assets/ActionMenu-DIjho2bj.js","/assets/AdminPage-3gEjvb0F.js","/assets/AdminTabs-CfMzB4KL.js","/assets/AiKeys-D0Oy-hC1.js","/assets/AnalysisBoard-DSaseEO_.js","/assets/ApiAccess-CLJHC9jY.js","/assets/AppLauncher-3qddQ7tQ.js","/assets/Arc-6r5-dEf5.js","/assets/Assessment-CsCjjtkm.js","/assets/AssessmentGrade-DFRvNfBJ.js","/assets/AssessmentList-7x2sOCvU.js","/assets/Assistant-Dy4ZO7ug.js","/assets/AttendanceCleanup-BZlDi4bL.js","/assets/AttendanceUpload-Cztz-j5X.js","/assets/AuditTable-B_PG-Lil.js","/assets/BrigadirProfile-uweMeVb2.js","/assets/BrigadirsKpi-DLNuf3tM.js","/assets/Broadcast-Bf7j80hx.js","/assets/BroadcastReceivers-DvNagtcN.js","/assets/BroadcastRecord-CdWi_5a0.js","/assets/Button-BByRB7Le.js","/assets/CatLockNotice-CqyyZTQz.js","/assets/CategoryLegendModal-C6_x1tK3.js","/assets/CellConcerns-BBLHQYTa.js","/assets/CellDetails-Sc2oP7Ka.js","/assets/CellFormModal-DLKlnkVi.js","/assets/CellIdent-DE6qkdqd.js","/assets/CellLink-DhxZp8ab.js","/assets/Cells-Bw4Ekaha.js","/assets/ColumnFilter-YiVQ43WP.js","/assets/ColumnsPicker-D69TDXuY.js","/assets/CommentsModal-B0MuNFlD.js","/assets/ComparisonTable-CB3fO-CZ.js","/assets/Concerns-BjU-OmPq.js","/assets/ConcernsPieces-B1FeJP-n.js","/assets/ContainerFlow-BL1lA1zX.js","/assets/ContainerTotalsCard-o45d2tB7.js","/assets/Containers-D2BSZ8Qm.js","/assets/CountStepper-DXwC3b76.js","/assets/Daily-ClZz5n7b.js","/assets/DataSources-CpcezLYD.js","/assets/DataTable-DfY0qJEP.js","/assets/DateRangePicker-JbuMcdge.js","/assets/DayReportView-D8bm6BC8.js","/assets/DayStepper-DikTW6GW.js","/assets/DayStrip-BxFCXCib.js","/assets/DbBackup-Cqg-sUQP.js","/assets/DifferenceBreakdown-u0seh37L.js","/assets/DocAudit-B4r5TkRJ.js","/assets/Downtime-WaLhBrHw.js","/assets/Education-0DLFMZW3.js","/assets/EducationLesson-D2CTXKml.js","/assets/EmptyState-CoGZLWrQ.js","/assets/Equipment-BfAiQ84t.js","/assets/Exam-zSwIm7z7.js","/assets/ExamAdmin-BGlMddDb.js","/assets/Factories-DgXO0N15.js","/assets/FactorySelect-BCTNc9dT.js","/assets/Gamification-CifBQJZf.js","/assets/GroupBadge-b0DoXBVA.js","/assets/HeatmapChart-D-352Yrt.js","/assets/HourlyContainers-CVTZZgdI.js","/assets/IdleCell-DWCq7E2M.js","/assets/IdleOwners-CG7z60qv.js","/assets/IdleSolutions-CToO2gAj.js","/assets/KPICard-Cw5WW5n_.js","/assets/Kaizen-Kgw48Nb5.js","/assets/Kelish-CRvmSvo9.js","/assets/Kitchen-BRu24LC0.js","/assets/KpiBits-D5GJ57K3.js","/assets/KpiDeltaCard-BU9NhFQF.js","/assets/LangContext-2A4sPKlL.js","/assets/LangTextInput-Kofaohjz.js","/assets/Layout-BW8M3UoD.js","/assets/LeaderAppeal-Bi2Uf5Tk.js","/assets/LeaderDailyTasks-D2FLt_xw.js","/assets/LeaderDayReport-B4c-NqBh.js","/assets/LeaderNotCounting-2zPJdY8k.js","/assets/LeaderTasksAdmin-B1F6ODYu.js","/assets/LeaderUnitReport-AHz7Mf6Y.js","/assets/Leaderboard-BOOmQLKr.js","/assets/Leaders-ClHub3vn.js","/assets/LeadersKpi-DnGcY05p.js","/assets/Lightbox--W_XKy1M.js","/assets/LiveOverview-BEQPKenR.js","/assets/Login-CVcLoFOX.js","/assets/Logs-Ja2QbPVU.js","/assets/LostWorkers-EMJOotpv.js","/assets/Meter-CRRHrYuq.js","/assets/NotFound-Bf3YQ81G.js","/assets/Notifications-BFzQ73va.js","/assets/NotionTasks-DEbYUbXc.js","/assets/NotionTrackerSettings-B_7hc6TB.js","/assets/Ontime-BxDNCfwa.js","/assets/OrgChart-ClC7eOb_.js","/assets/Ovens-aEr-amUm.js","/assets/OvensSettings-D4JUapk_.js","/assets/Overview-Cd3-Zvqi.js","/assets/OwnerChip-PFVKs0rE.js","/assets/Pagination-BD9ezNHh.js","/assets/People-fKw9TgAq.js","/assets/PerenaladkaFactTable-Dqq2KUef.js","/assets/Permissions-B3ryHByS.js","/assets/PersonCard-j-5_q2Qc.js","/assets/PlanFulfillment-BpyinPP_.js","/assets/Production-CfjQyyYs.js","/assets/ProductionUpload-xQvOk2E-.js","/assets/Profile-kOk4ZnVM.js","/assets/ProfileAvatar-CmJPT9FG.js","/assets/ProfilesManagement-BshHc_6j.js","/assets/ProofCamera-BcKNS2aT.js","/assets/ProofPhoto-C66WBDR4.js","/assets/Quality-hkSE6IUD.js","/assets/RawRows-BbZ58Sl-.js","/assets/Reports-DIpALkSO.js","/assets/RequestStateChip-BjWOPNz8.js","/assets/RichTextEditor-C0NI_tE4.js","/assets/SaveState-B3u7fVi7.js","/assets/SdPanelSettings-Dwl6jwNY.js","/assets/SearchInput-BR5RuAqe.js","/assets/SeasonalityHeatmap-B65j5wfW.js","/assets/SegmentedToggle-CIxWlaZZ.js","/assets/SetupTimes-CHHZAon5.js","/assets/ShiftDaily-Cr2B5Eft.js","/assets/ShiftTimes-Ci3QPJUy.js","/assets/SortableList-DgrUPWKx.js","/assets/Staff-DAfb6FNG.js","/assets/StaffListAtCheck-Wi2kdzn_.js","/assets/StatusBadge-J5DMa-jO.js","/assets/StatusBandsModal-CesVXPt1.js","/assets/TargetGoal-CxLjhVNZ.js","/assets/Targets-CJDmyx04.js","/assets/TaskFormModal-CERssfCo.js","/assets/TaskerSettings-CovglXhg.js","/assets/Tasks-CZ5zPVIw.js","/assets/TgProfile-CQj99d2j.js","/assets/TimeWheelPicker-Dp1jAqRp.js","/assets/Toast-DLkPq-u6.js","/assets/Tooltip-Cd0j8XOq.js","/assets/TranslationsEditor-BdJBq3JF.js","/assets/TrelloAnalytics-D0ebzUUF.js","/assets/TrelloSettings-DECi2bgE.js","/assets/TrendChart-fNhLJFYD.js","/assets/TripleSpeedometer-BloNd-o7.js","/assets/Trudoyomkost-wFNlfeCY.js","/assets/UploadDropzone-Ckl6lJR3.js","/assets/UsersActivity-CTE0ULXN.js","/assets/UsersManagement-D94TyCpa.js","/assets/VerdictBlock-C0dVMZ5n.js","/assets/VerifixPage-1n2QuyC9.js","/assets/VerifixParity-C-6Aic_F.js","/assets/VfxApiMap-FLe82oAl.js","/assets/VfxDictionaries-C4ewzIvZ.js","/assets/VfxEmployees-Fc51tJeu.js","/assets/VfxHrMoves-CLRTuiCY.js","/assets/VfxJobs-CbLVIiVH.js","/assets/VfxPhoto-Dk2o2BxV.js","/assets/VfxShifts-CBBaT9RK.js","/assets/VfxState-DyLqFIM1.js","/assets/VfxTimebooks-CxsOx2we.js","/assets/VfxTimesheet-DyPOl94N.js","/assets/WatchProgress-ByqM2KI8.js","/assets/WebLogin-CwqnrOlO.js","/assets/WorkersAttendance-Bb7voq6X.js","/assets/WorkersComposition-BoDMemCH.js","/assets/WorkersMovements-CZ43nG_3.js","/assets/WorkersPage-B6g1F9uX.js","/assets/Zagruzka-Bqzl0zRV.js","/assets/ZagruzkaCell-7ombsVTN.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BAPZC_6D.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-Dg_pLTrU.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BNn7hYkk.js","/assets/broadcastTree-aKHC01pa.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-CiRdKSiF.js","/assets/categories-BPppaGNv.js","/assets/cellMoveRefusal-BvJT9sIV.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-qyI0belB.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-ByvbwGLt.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-DmJxm507.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BH54YsjB.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DsXslr64.js","/assets/index-acItCici.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-Bkxi5dMC.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-C6n1qZtP.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CaZl1ktg.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CUBVn8lY.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-CT5sTKNH.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CdFp-Go4.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DGskdIYF.js","/assets/ru-CwbL_1FY.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-oklf1bKy.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DfWQstxm.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-ChfDr16y.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-f0-QTQIO.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-0zn7fdPR.js","/assets/useMutation-CvE7uWXv.js","/assets/useOpenParam-DUXoJCmM.js","/assets/useStatusBands-DDoZG8Sj.js","/assets/useUrlScope-C8WZv9BB.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-C1DuENZ7.js","/assets/uz_cyrl-jkkDQFpK.js","/assets/vfx-CrjfFyYT.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-JR-pOuUo.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/x-CfYkDDdF.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
