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

const BUILD = "2026-11-15T16:21:45.136Z";
const PRECACHE = ["/","/assets/ActionHistory-DDMmFtce.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-D2fnF0ma.js","/assets/AiKeys-BtdLCh3M.js","/assets/AnalysisBoard-BpQW6EQo.js","/assets/ApiAccess-Cn8d8vYJ.js","/assets/AppLauncher-DVhdzcd1.js","/assets/Arc-BpVZsiqQ.js","/assets/Assessment-C0u-AjwY.js","/assets/AssessmentGrade-BbZ2PQJt.js","/assets/AssessmentList-B7FHdbBj.js","/assets/Assistant-ZJ_X7EcQ.js","/assets/AttendanceCleanup-g9g0PDyu.js","/assets/AttendanceUpload-DUDt9NBt.js","/assets/AuditTable-CRV-DW-u.js","/assets/BrigadirProfile-DwphG-rh.js","/assets/BrigadirsKpi-e1rvaR_0.js","/assets/Broadcast-DN8s45bL.js","/assets/BroadcastReceivers-BtZDbzan.js","/assets/BroadcastRecord-muIRgb1X.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-CGdbiF_4.js","/assets/CategoryLegendModal-iyf8wNyX.js","/assets/CellConcerns-D5F0y7UD.js","/assets/CellDetails-zXT5tbg5.js","/assets/CellFormModal-BU51C2eR.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-Dc4-_Fxd.js","/assets/Cells-Bqd9p1i6.js","/assets/ColumnFilter-D2-PP6tK.js","/assets/ColumnsPicker-Dom-U1sd.js","/assets/CommentsModal-DV7Sxf9d.js","/assets/ComparisonTable-DtsujtjK.js","/assets/Concerns-Cti264-R.js","/assets/ConcernsPieces-B6X06ifZ.js","/assets/ContainerFlow-Bpd3a1DY.js","/assets/ContainerTotalsCard-CZ9vqQik.js","/assets/Containers-DlWTsE3J.js","/assets/CountStepper-DY8dgLt3.js","/assets/Daily-DLhF7sAo.js","/assets/DataSources-CAiWFMmB.js","/assets/DataTable-CTVhDdyj.js","/assets/DateRangePicker-ZjaMFKDV.js","/assets/DayReportView-CGci9E31.js","/assets/DayStepper-bG4e0uz5.js","/assets/DayStrip-Dt5ic40z.js","/assets/DbBackup-Ru6kZhVN.js","/assets/DifferenceBreakdown-B5Lmxp9u.js","/assets/DocAudit-Bl5at0OI.js","/assets/Downtime-q_zpcTs4.js","/assets/Education-C4HCuMt1.js","/assets/EducationLesson-DHfSwB66.js","/assets/EmptyState-DvM8b3LD.js","/assets/Exam-BZJYMtn3.js","/assets/ExamAdmin-TPylTGlO.js","/assets/Factories-BM-PGyu6.js","/assets/FactorySelect-JKR8ztu1.js","/assets/Gamification-pE2DQHic.js","/assets/GroupBadge-BgqjpMOm.js","/assets/HeatmapChart-D_PJm6vw.js","/assets/HourlyContainers-Ba1KNk6m.js","/assets/IdleCell-Vcl5SWJi.js","/assets/IdleOwners-DMjOeq5P.js","/assets/IdleSolutions-iG4bydgv.js","/assets/IdleSource-B9KN50gd.js","/assets/KPICard-yPaRAsnt.js","/assets/Kaizen-Bdo4DXnJ.js","/assets/Kelish-CZmrYbbD.js","/assets/Kitchen-DkQAp8HV.js","/assets/KpiBits-Df0ZuW8H.js","/assets/KpiDeltaCard-BbzOESs8.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-HwvxnKR2.js","/assets/LeaderAppeal-BGOHZwR7.js","/assets/LeaderCutoffs-DyUhqZIa.js","/assets/LeaderDailyTasks-BVE0C7iG.js","/assets/LeaderDayExclusions-DQV5lKpp.js","/assets/LeaderDayReport-BrSAJo2B.js","/assets/LeaderTasksAdmin-CZP3ydvA.js","/assets/LeaderUnitReport-BMBZUUkO.js","/assets/Leaderboard-Dyr20ohw.js","/assets/Leaders-BOhJ_KwN.js","/assets/LeadersKpi-eKrR8PRY.js","/assets/Lightbox-RHLP8EES.js","/assets/LiveOverview-Cvv1BA2e.js","/assets/Login-CcmB3i9B.js","/assets/Logs-C1BxBdY0.js","/assets/LostWorkers-nfaNLRq0.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-DmFRNh5e.js","/assets/Notifications-B_fbVfju.js","/assets/NotionTasks-A_jAtsnW.js","/assets/NotionTrackerSettings-Unzo0S4H.js","/assets/Ontime-CK0y6BkA.js","/assets/OrgChart-unbqOzs7.js","/assets/Ovens-DPysl5F2.js","/assets/OvensSettings-Cx0JTasW.js","/assets/Overview-C-NEzgig.js","/assets/OwnerChip-XrHSH3ix.js","/assets/PageAccess-BCsoCF6V.js","/assets/Pagination-z0W5GPpW.js","/assets/People-5wWI3Scr.js","/assets/PerenaladkaFactTable-m_38Owtm.js","/assets/Permissions-DA92YEuO.js","/assets/PersonCard-BEW0hGkZ.js","/assets/PlanFulfillment-VIOvixw1.js","/assets/Production-CIHG4cY_.js","/assets/ProductionUpload-t-HM0XD1.js","/assets/Profile-DnZJCKss.js","/assets/ProfileAvatar-BtLhbqlJ.js","/assets/ProfilesManagement-B1kytrRV.js","/assets/ProofCamera-BjZZzq1_.js","/assets/ProofPhoto-B5DWLVK6.js","/assets/Quality-BAmvGeLR.js","/assets/RawRows-gWgVzMhA.js","/assets/Reports-DSB994cI.js","/assets/RequestStateChip-DBqOOUfO.js","/assets/RichTextEditor-OeEfQkv2.js","/assets/SaveState-I810-C_S.js","/assets/SearchInput-D4B5-Vgb.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-IE5qEwl9.js","/assets/ShiftDaily-DP2OJ1Bt.js","/assets/ShiftTimes-1_DMcGlk.js","/assets/SortableList-DCEDbyLr.js","/assets/Staff-DBNjeNXL.js","/assets/StaffListAtCheck-BBuxPRAe.js","/assets/StatusBadge-CZmqKkAm.js","/assets/StatusBandsModal-CCNm_s_1.js","/assets/TargetGoal-D6SPITjO.js","/assets/Targets-DCx5_wtR.js","/assets/TaskFormModal-_eGcRX7C.js","/assets/TaskerSettings-ipNn3euk.js","/assets/Tasks-eq3UPKd1.js","/assets/TgProfile-DdCvoslo.js","/assets/TimeWheelPicker-BZq_VeaO.js","/assets/Tooltip-DGLBQOdK.js","/assets/TranslationsEditor-DvxvYhJp.js","/assets/TrelloAnalytics-C5rNFL04.js","/assets/TrelloSettings-BHpbP59t.js","/assets/TrendChart-B0Zda_N2.js","/assets/TripleSpeedometer-C_2a6PHA.js","/assets/Trudoyomkost-C04uv7nB.js","/assets/UploadDropzone-Cp8W6HZ_.js","/assets/UsersActivity-enCf8N1v.js","/assets/UsersManagement-D7fDrpEI.js","/assets/VerdictBlock-DK144Xkw.js","/assets/VerifixParity-TV3PO6p7.js","/assets/VerifixSettings-CZXMBBUE.js","/assets/VerifixSync-VajrNvtF.js","/assets/VfxApiMap-vlom8n5s.js","/assets/VfxDictionaries-CNAqcY0k.js","/assets/VfxEmployees-CWeJyZGF.js","/assets/VfxHrMoves-bDVll_Rc.js","/assets/VfxJobs-D77DCpKA.js","/assets/VfxPhoto-CgufBj7k.js","/assets/VfxShifts-10pk3gYB.js","/assets/VfxState-DpVny6jX.js","/assets/VfxTimebooks-Di74dHc-.js","/assets/VfxTimesheet-BxTWulqR.js","/assets/WatchProgress-D_UQ9Pfz.js","/assets/WebLogin--ILbtdWX.js","/assets/WorkersAttendance-D1SizEwK.js","/assets/WorkersComposition-CES3twcr.js","/assets/WorkersMovements-CCwoop7f.js","/assets/WorkersPage-CiwdOnKK.js","/assets/Zagruzka-C_RvRGkZ.js","/assets/ZagruzkaCell-Cxma6vlf.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DE60ZS0i.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-C-13D5n_.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Be2fFp-u.js","/assets/broadcastTree-C0P4ozt6.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-IxATd72n.js","/assets/cellMoveRefusal-dlJ4y4aT.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-C8iKyNLg.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-RySUnmUf.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-BUV1_DmK.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BwGGPFQA.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-B0hHP31L.js","/assets/index-Dsb31Dlq.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-cVmvA5qa.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DQr9zS2M.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-DSwNE7Iz.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CiXX4YtO.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-B5DK-nhV.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-DkoWSp9W.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CdPipex2.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/triangle-alert-CnUaq82N.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BNsB6jIY.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-f5qSwbOR.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-r8DhQCO4.js","/assets/useOpenParam-Csw4cNwG.js","/assets/useStatusBands-BDXmCy-M.js","/assets/useUrlScope-D_HirMoN.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DwwlhPXs.js","/assets/uz_cyrl-B7G9UCfw.js","/assets/vfx-D9OLqheJ.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-DZWXWIkW.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
