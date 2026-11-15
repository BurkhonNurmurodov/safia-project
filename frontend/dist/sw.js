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

const BUILD = "2026-11-15T07:19:40.766Z";
const PRECACHE = ["/","/assets/ActionHistory-BSsRIoBI.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-C2grDgdx.js","/assets/AiKeys-BSZBUjHU.js","/assets/AnalysisBoard-DupzBmxw.js","/assets/ApiAccess-C7HS-k2V.js","/assets/AppLauncher-DO8JfwYw.js","/assets/Arc-CCHqIzSn.js","/assets/Assessment-CVo8DIKr.js","/assets/AssessmentGrade-DHBgXluq.js","/assets/AssessmentList-BdWR_ckA.js","/assets/Assistant-B2zfOCFU.js","/assets/AttendanceCleanup-Bnv-_nYW.js","/assets/AttendanceUpload-fmrV0Pi7.js","/assets/AuditTable-BTgpTGYM.js","/assets/BrigadirProfile-BF0yq7td.js","/assets/BrigadirsKpi-CfBU4psI.js","/assets/Broadcast-CmVxaJW0.js","/assets/BroadcastReceivers-KNF4tmbQ.js","/assets/BroadcastRecord-DHFnexVk.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-Dbh3nRZN.js","/assets/CategoryLegendModal-DWhoOS21.js","/assets/CellConcerns-TzhXwLXN.js","/assets/CellDetails-aiut-Zc2.js","/assets/CellFormModal-hf7-Qp1Y.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-CaXomqLp.js","/assets/Cells-DhzPvRhT.js","/assets/ColumnFilter-Cf0r0q5W.js","/assets/ColumnsPicker-lixBbM0S.js","/assets/CommentsModal-B4haNb8w.js","/assets/ComparisonTable-C-YT4QYH.js","/assets/Concerns-g0QwriYF.js","/assets/ConcernsPieces-BOE9n4Sd.js","/assets/ContainerFlow-DVkCYp0C.js","/assets/ContainerTotalsCard-CiJOp0Ts.js","/assets/Containers-ByKCDOCe.js","/assets/CountStepper-DN9uaBFP.js","/assets/Daily-BInUM4tK.js","/assets/DataSources-BblorH2j.js","/assets/DataTable-Do6iXXop.js","/assets/DateRangePicker-DPzmeLH0.js","/assets/DayReportView-C-3baoqs.js","/assets/DayStepper-Blv5q3BU.js","/assets/DayStrip-Dd3gsCJc.js","/assets/DbBackup-CJuSmhGU.js","/assets/DifferenceBreakdown-DtUhd82y.js","/assets/DocAudit-BhFQ2yhf.js","/assets/Downtime-nZNjHP6v.js","/assets/Education-Ca3hRaY9.js","/assets/EducationLesson-BAzemjKc.js","/assets/EmptyState-CAfG5J6c.js","/assets/Exam-HSRAH0nH.js","/assets/ExamAdmin-BQs9c02u.js","/assets/Factories-CUhonzJC.js","/assets/FactorySelect-1HOoDGu0.js","/assets/Gamification-sEcTCtEX.js","/assets/GroupBadge-Dd9W7JQt.js","/assets/HeatmapChart-DZgAbhwJ.js","/assets/HourlyContainers-BodlsQm4.js","/assets/IdleCell-7Hk-cSkf.js","/assets/IdleOwners-BQG8PeRq.js","/assets/IdleSolutions-CKL_Q_Z3.js","/assets/IdleSource-CiraA6xI.js","/assets/KPICard-BhONxbBv.js","/assets/Kaizen-QYeVRU1I.js","/assets/Kelish-BuL0bO8B.js","/assets/Kitchen-DXylZfT9.js","/assets/KpiBits-VfwfY6mo.js","/assets/KpiDeltaCard-DXFrDnWo.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-BkqkxC2j.js","/assets/LeaderAppeal-dnK3lmgl.js","/assets/LeaderCutoffs-p0mZzCEF.js","/assets/LeaderDailyTasks-Dv4NsuQ2.js","/assets/LeaderDayExclusions-CMRukLEC.js","/assets/LeaderDayReport-C_iyTY__.js","/assets/LeaderTasksAdmin-BdMZQcSf.js","/assets/LeaderUnitReport-h140RI4I.js","/assets/Leaderboard-D-OB4bMc.js","/assets/Leaders-BeV9Y1rl.js","/assets/LeadersKpi-Bb0sTMJY.js","/assets/Lightbox-DD3awOtG.js","/assets/LiveOverview-3CRqImJF.js","/assets/Login-BHrVXtfa.js","/assets/Logs-BEu_LxCy.js","/assets/LostWorkers-aJByP9F5.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-CG9nptTd.js","/assets/Notifications-Bercp_4_.js","/assets/NotionTasks-DXjdkdlE.js","/assets/NotionTrackerSettings-B5o0tAED.js","/assets/Ontime-CalCp-nQ.js","/assets/OrgChart-NUdSor-2.js","/assets/Ovens-DiheEvfm.js","/assets/OvensSettings-BjWYkWep.js","/assets/Overview-Dtnpz3qV.js","/assets/OwnerChip-vMpxAmDT.js","/assets/PageAccess-Bm-wFH_3.js","/assets/Pagination-B4IBcDNV.js","/assets/People-jEJQjJCH.js","/assets/PerenaladkaFactTable-Bilf1qfq.js","/assets/Permissions-CDdjQz-N.js","/assets/PersonCard-B-7KhQMB.js","/assets/PlanFulfillment-DW2eXLmV.js","/assets/Production-DC_IlJCa.js","/assets/ProductionUpload-BorpTJ2Z.js","/assets/Profile-BzfbdpJE.js","/assets/ProfileAvatar-BDvLAtLI.js","/assets/ProfilesManagement-BiprgmZJ.js","/assets/ProofCamera-C_GGDgvk.js","/assets/ProofPhoto-k0niMXLa.js","/assets/Quality-DVfxUs6w.js","/assets/RawRows-MsiLG7H2.js","/assets/Reports-D4_PtX2J.js","/assets/RequestStateChip-BKJiJuYz.js","/assets/RichTextEditor-DCrPI8n4.js","/assets/SaveState-dz-UJruB.js","/assets/SearchInput-BEQ-PRXw.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-Cw2j2fYy.js","/assets/ShiftDaily-DjO5gCHZ.js","/assets/ShiftTimes-v7VDW-mW.js","/assets/Staff-CkSQ_BjM.js","/assets/StaffListAtCheck-D6a9L13D.js","/assets/StatusBadge-CrEUwpkU.js","/assets/StatusBandsModal-C99kqVrX.js","/assets/TargetGoal-Beuwt6Au.js","/assets/Targets-BUa828-b.js","/assets/TaskFormModal-zc3NM2f1.js","/assets/TaskerSettings-DlW7T3vw.js","/assets/Tasks-CRsFi_WD.js","/assets/TgProfile-CEu53-53.js","/assets/TimeWheelPicker-DxQI-tAX.js","/assets/Tooltip-B2vbQMD4.js","/assets/TranslationsEditor-Clq5y1n-.js","/assets/TrelloAnalytics-CkpozC6H.js","/assets/TrelloSettings-BTSOhmI3.js","/assets/TrendChart-BNPoGWNE.js","/assets/TripleSpeedometer-CGGkd7PO.js","/assets/Trudoyomkost-C7Pgin8z.js","/assets/UploadDropzone-BDjVS7BO.js","/assets/UsersActivity-B1F6IsYG.js","/assets/UsersManagement-BI-rrSAx.js","/assets/VerdictBlock-BM7y46rB.js","/assets/VerifixParity-CZqDmbNT.js","/assets/VerifixSettings-Dc4fAMiJ.js","/assets/VerifixSync-BTTd-Kx-.js","/assets/VfxApiMap-3AFX3BK8.js","/assets/VfxDictionaries-DqoIuB7K.js","/assets/VfxEmployees-C7BacQ2V.js","/assets/VfxHrMoves-DgLDw6fD.js","/assets/VfxJobs-CvzaUkbS.js","/assets/VfxPhoto-CctulXs6.js","/assets/VfxShifts-CU-oegsP.js","/assets/VfxState-D6tUHa9U.js","/assets/VfxTimebooks-_kBsZZe4.js","/assets/VfxTimesheet-F4egUu8E.js","/assets/WatchProgress-BJOHhuBh.js","/assets/WebLogin-BTYypwGb.js","/assets/WorkersAttendance-BmN4tyIo.js","/assets/WorkersComposition-DzTyZCKn.js","/assets/WorkersMovements-aliKl0G0.js","/assets/WorkersPage-DNrqO910.js","/assets/Zagruzka-DMRws8ME.js","/assets/ZagruzkaCell-CHry5Ghj.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CS-eZpvf.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-D2Rb7boD.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Cm1mOcQF.js","/assets/broadcastTree-kRXMxhCv.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DQRkrf4e.js","/assets/cellMoveRefusal-Do5Dn5_W.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-B6hkXCzX.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-BuEvHDy8.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-C511JugF.js","/assets/funnel-DYimzUBX.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DCJrYK8C.js","/assets/index-_OkiyB00.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CNcnjY7Q.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-BnursICb.js","/assets/map-pin-BNmosVmR.js","/assets/marks-76K2_D2T.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-CgxEbWki.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-C_KuyyPs.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-DThM1ap5.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-Bc1Shzrm.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-CxPVdLx1.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CcFGirlt.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-CV9Vl8RX.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Dr9YZ7uG.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-MoCByPcE.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-BcFcPMQC.js","/assets/useOpenParam-DHqXLr2P.js","/assets/useStatusBands-BZ1XCmYS.js","/assets/useUrlScope-D1JVwXWq.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DciJhpKf.js","/assets/uz_cyrl-DH0jur-Z.js","/assets/vfx-B5ehUeVS.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-BLVxq6wM.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
