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

const BUILD = "2026-11-19T15:32:26.316Z";
const PRECACHE = ["/","/assets/ActionMenu-DIjho2bj.js","/assets/AdminPage-CxQd5Uo8.js","/assets/AdminTabs-D0BbWAoY.js","/assets/AiKeys-CVm2eSdX.js","/assets/AnalysisBoard-BPTjmzjU.js","/assets/ApiAccess-Bdw9qX-I.js","/assets/AppLauncher-B6XMZXNt.js","/assets/Arc-rfh75EOJ.js","/assets/Assessment-D4ad4oAD.js","/assets/AssessmentGrade-BbZMwj1n.js","/assets/AssessmentList-DYK43rRh.js","/assets/Assistant-CjVRRlaC.js","/assets/AttendanceCleanup-AFMup6dE.js","/assets/AttendanceUpload-BE7Xf5xO.js","/assets/AuditTable-BNN1Ti-x.js","/assets/BrigadirProfile-Bu08Ku4g.js","/assets/BrigadirsKpi-DXCMFcDL.js","/assets/Broadcast-CUTf3gdN.js","/assets/BroadcastReceivers-BN9V6eJl.js","/assets/BroadcastRecord-Cim9QJ0O.js","/assets/Button-BByRB7Le.js","/assets/CatLockNotice-yxXlkNK3.js","/assets/CategoryLegendModal-BzhA_qM3.js","/assets/CellConcerns-AncMe68M.js","/assets/CellDetails-DAWGpDHm.js","/assets/CellFormModal-DkPbS5jp.js","/assets/CellIdent-DE6qkdqd.js","/assets/CellLink-DRs0gT2F.js","/assets/Cells-C62d4-IS.js","/assets/ColumnFilter-DRF-4vHh.js","/assets/ColumnsPicker-DNJN_moS.js","/assets/CommentsModal-CU6_rJ6z.js","/assets/ComparisonTable-5S-q-FSR.js","/assets/Concerns-DuYDXiT2.js","/assets/ConcernsPieces-B1yJkuHU.js","/assets/ContainerFlow-DTXsRioo.js","/assets/ContainerTotalsCard-V0mI_fvc.js","/assets/Containers-Bl7PoFS5.js","/assets/CountStepper-8Rjjufbn.js","/assets/Daily-CFMBVl84.js","/assets/DataSources-DCTZCOZu.js","/assets/DataTable-SuGDjLiW.js","/assets/DateRangePicker-BZ6Dv-i7.js","/assets/DayReportView-vNNFKPuH.js","/assets/DayStepper-DkCtcLrV.js","/assets/DayStrip-BARp5K7j.js","/assets/DbBackup-DqE9yN2q.js","/assets/DifferenceBreakdown-Ozmosn45.js","/assets/DocAudit-BeaTnjdA.js","/assets/Downtime-C92wkoXZ.js","/assets/Education-BUeXsSgz.js","/assets/EducationLesson-Bg5jKzAi.js","/assets/EmptyState-D8Hd_J75.js","/assets/Equipment-CvTxXkYf.js","/assets/Exam-CA5M5eJ8.js","/assets/ExamAdmin-BCJ5vbNd.js","/assets/Factories--4j0ipT7.js","/assets/FactorySelect-CEGH2Tpp.js","/assets/Gamification-DaPl6UYT.js","/assets/GroupBadge-B83wQ3-m.js","/assets/HeatmapChart-BK8vB7yA.js","/assets/HourlyContainers-CN0j859i.js","/assets/IdleCell-BLGI1KSm.js","/assets/IdleOwners-Cu_vGgji.js","/assets/IdleSolutions-BgzNvtJp.js","/assets/KPICard-Cw5WW5n_.js","/assets/Kaizen-CzImc_6b.js","/assets/Kelish-DJOLeAoQ.js","/assets/Kitchen-CiC0LydN.js","/assets/KpiBits-BDU182w4.js","/assets/KpiDeltaCard-By0w9ulx.js","/assets/LangContext-2A4sPKlL.js","/assets/LangTextInput-Kofaohjz.js","/assets/Layout-WzdpGX_1.js","/assets/LeaderAppeal-Cdz-sfb2.js","/assets/LeaderDailyTasks-CI432Vbr.js","/assets/LeaderDayReport-BLtJwuBT.js","/assets/LeaderNotCounting-CTqUiC3J.js","/assets/LeaderTasksAdmin-BqIUFg8C.js","/assets/LeaderUnitReport-Buk-v0Or.js","/assets/Leaderboard-C-xbOCyK.js","/assets/Leaders-CcHhzHMl.js","/assets/LeadersKpi-5xtEHrrk.js","/assets/Lightbox--W_XKy1M.js","/assets/LiveOverview-B58nvSPC.js","/assets/Login-BQDo5lM9.js","/assets/Logs-B1zglv8K.js","/assets/LostWorkers-d6iGgNPf.js","/assets/Meter-CRRHrYuq.js","/assets/NotFound-XypWokpU.js","/assets/Notifications-3uj_AQGi.js","/assets/NotionTasks-DfRjHHtM.js","/assets/NotionTrackerSettings-BA-xu8y8.js","/assets/Ontime--_YKqFQX.js","/assets/OrgChart-CMqVwfTd.js","/assets/Ovens-DaZC9bKb.js","/assets/OvensSettings--xMZEYOn.js","/assets/Overview-COxxDfWQ.js","/assets/OwnerChip-3bXPGz9Y.js","/assets/Pagination-BPwjYkFW.js","/assets/People-vAP1ZYVq.js","/assets/PerenaladkaFactTable-Dp_fZeQO.js","/assets/Permissions-DT-qm1dP.js","/assets/PersonCard-CxUDOB6w.js","/assets/PlanFulfillment-B1JiJmcv.js","/assets/Production-Ddi8jI3B.js","/assets/ProductionUpload-AaEC2P5V.js","/assets/Profile-Cha4owbZ.js","/assets/ProfileAvatar-DXqywuJy.js","/assets/ProfilesManagement-BoAvWFA9.js","/assets/ProofCamera-CcM5dYZ8.js","/assets/ProofPhoto-mrmfZET1.js","/assets/Quality-Be9aZFtg.js","/assets/RawRows-D8A4diK4.js","/assets/Reports-CBgEyN4n.js","/assets/RequestStateChip-B8Re1BYO.js","/assets/RichTextEditor-OnUV_6ZP.js","/assets/SaveState-CaIiWnxU.js","/assets/SdPanelSettings-BH0TLits.js","/assets/SearchInput-CINIlBr2.js","/assets/SeasonalityHeatmap-B65j5wfW.js","/assets/SegmentedToggle-CIxWlaZZ.js","/assets/SetupTimes-BL-hJpYi.js","/assets/ShiftDaily-Bl5DlG3l.js","/assets/ShiftTimes-BB8ATF1X.js","/assets/SortableList-DgrUPWKx.js","/assets/Staff-Cq4MGL-y.js","/assets/StaffListAtCheck-cHlnsrN5.js","/assets/StatusBadge-CK7_EzgL.js","/assets/StatusBandsModal-4gGZ2goe.js","/assets/TargetGoal-Boi3GhHz.js","/assets/Targets-C1wCWx0D.js","/assets/TaskFormModal-DVXdgSt6.js","/assets/TaskerSettings-D21epcGC.js","/assets/Tasks-Lcijehof.js","/assets/TgProfile-mnQuUbl4.js","/assets/TimeWheelPicker-Dq2RSsNn.js","/assets/Toast-DLkPq-u6.js","/assets/Tooltip-Cd0j8XOq.js","/assets/TranslationsEditor-CFeqfFPk.js","/assets/TrelloAnalytics-Df4dIx3A.js","/assets/TrelloSettings-BZYQpfsh.js","/assets/TrendChart-Ch47YoFU.js","/assets/TripleSpeedometer-BghHilkn.js","/assets/Trudoyomkost-B07pVT97.js","/assets/UploadDropzone-Ckl6lJR3.js","/assets/UsersActivity-PiPzUMnS.js","/assets/UsersManagement-SCykD3f4.js","/assets/VerdictBlock-DV5d4L3I.js","/assets/VerifixPage-VhHHEAR4.js","/assets/VerifixParity-DE_7bEbr.js","/assets/VfxApiMap-Fqv8FkyC.js","/assets/VfxDictionaries-DYGzzzMS.js","/assets/VfxEmployees-CC3xXT9z.js","/assets/VfxHrMoves-Dhk6C9C9.js","/assets/VfxJobs-HV9ji62C.js","/assets/VfxPhoto-BbQG2s2v.js","/assets/VfxShifts-BghsDThW.js","/assets/VfxState-DSQiSysp.js","/assets/VfxTimebooks-GYIfBWuR.js","/assets/VfxTimesheet-D1efEbjV.js","/assets/WatchProgress-CgttgHoa.js","/assets/WebLogin-TwcqMetY.js","/assets/WorkersAttendance-CtEqG0j6.js","/assets/WorkersComposition-CIftE2DX.js","/assets/WorkersMovements-jrYMTzi5.js","/assets/WorkersPage-ClN3ll76.js","/assets/Zagruzka-Drx1IW79.js","/assets/ZagruzkaCell-7kthlGxL.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CvNP44-H.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BmNKipUF.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-tJdZRgeC.js","/assets/broadcastTree-aHk-N6nB.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-BMy4LkrJ.js","/assets/categories-C7Olcl6N.js","/assets/cellMoveRefusal-C4Aqhv_t.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-B9VrohO8.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-BuzezWLs.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-DKlTeqpi.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BH54YsjB.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CQbzZee9.css","/assets/index-D8sGR2IY.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CzvOGzDR.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-1Sc9UsWG.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CaZl1ktg.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CUBVn8lY.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-WDZMDTYa.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CxYBqbMg.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DGskdIYF.js","/assets/ru-oGl505uk.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-3OmgdnHq.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-vQDrMDEr.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-ChfDr16y.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CLIesMiR.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-B1saBKlw.js","/assets/useMutation-DZz1u1Xq.js","/assets/useOpenParam-DgHlAQdR.js","/assets/useStatusBands-Bd55oRmx.js","/assets/useUrlScope-Bupf2MTU.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BoxtgSCe.js","/assets/uz_cyrl-CYKirbpk.js","/assets/vfx-6hSYQcnc.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-dTRwEvXP.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/x-CfYkDDdF.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
