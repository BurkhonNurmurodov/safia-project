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

const BUILD = "2026-11-20T11:33:04.974Z";
const PRECACHE = ["/","/assets/ActionMenu-DIjho2bj.js","/assets/AdminPage-CqxR2Pq2.js","/assets/AdminTabs-CF_Bwa6Y.js","/assets/AiKeys-CofDy-vX.js","/assets/AnalysisBoard-C7e46wjr.js","/assets/ApiAccess-Cg17RccF.js","/assets/AppLauncher-DJXVPh-2.js","/assets/Arc-Czm07_v4.js","/assets/Assessment-4hoRCtma.js","/assets/AssessmentGrade-D-rnCD9e.js","/assets/AssessmentList-DUR4VZBs.js","/assets/Assistant-CRjGPSvo.js","/assets/AttendanceCleanup-py2hVtsw.js","/assets/AttendanceUpload-5fwugIYA.js","/assets/AuditTable-CfYN0cFR.js","/assets/BrigadirProfile-CIqAsmBd.js","/assets/BrigadirsKpi-VoV0qSXN.js","/assets/Broadcast-CVSunI53.js","/assets/BroadcastReceivers-BJ2RgKTW.js","/assets/BroadcastRecord-BYumM3TO.js","/assets/Button-BByRB7Le.js","/assets/CatLockNotice-YQuCQjE-.js","/assets/CategoryLegendModal-Di2WtqSu.js","/assets/CellConcerns-zVXceDSL.js","/assets/CellDetails-krZZQlUz.js","/assets/CellFormModal-Dv-Ib4uZ.js","/assets/CellIdent-DE6qkdqd.js","/assets/CellLink-BW0YJqVI.js","/assets/Cells-BDvVq9iI.js","/assets/ColumnFilter-S14i3Hv5.js","/assets/ColumnsPicker-CvCKdxq0.js","/assets/CommentsModal-Dgolslsw.js","/assets/ComparisonTable-ePAtikWv.js","/assets/Concerns-Dz2HksM1.js","/assets/ConcernsPieces-DgPrfRK6.js","/assets/ContainerFlow-C1UPDiIJ.js","/assets/ContainerTotalsCard-DLe7679k.js","/assets/Containers-DLnyzUVe.js","/assets/CountStepper-HUuL57eg.js","/assets/Daily-DlSvB2yt.js","/assets/DataSources-CmQvpt2-.js","/assets/DataTable-B18dWG5c.js","/assets/DateRangePicker-ImfqR8Ly.js","/assets/DayReportView-Dc3ZXVeP.js","/assets/DayStepper-BZeaYKv2.js","/assets/DayStrip-DouyTymk.js","/assets/DbBackup-mzGk2gFU.js","/assets/DifferenceBreakdown-DSU_3CFR.js","/assets/DocAudit-2eKscp7i.js","/assets/Downtime-CN38Jnfu.js","/assets/Education-B3vPWSC5.js","/assets/EducationLesson-DgPqAk3I.js","/assets/EmptyState-DvrXkgL-.js","/assets/Equipment-C1Cbi4ah.js","/assets/Exam-DosZxj-K.js","/assets/ExamAdmin-D5r5-pqG.js","/assets/Factories-BrpKv1-q.js","/assets/FactorySelect-BBrHfM02.js","/assets/Gamification-BJWGNFkK.js","/assets/GroupBadge-CpInYAw2.js","/assets/HeatmapChart-AzpyAaIM.js","/assets/HourlyContainers-CHbXafnJ.js","/assets/IdleCell-CU_JvsaH.js","/assets/IdleOwners-3Y5V1rOI.js","/assets/IdleSolutions-Cyvg3mYM.js","/assets/KPICard-Cw5WW5n_.js","/assets/Kaizen-ChKmzYWN.js","/assets/Kelish-C3KHxs0Y.js","/assets/Kitchen-DXcUTLmf.js","/assets/KpiBits-BBiRAGQH.js","/assets/KpiDeltaCard-iLJVjzac.js","/assets/LangContext-2A4sPKlL.js","/assets/LangTextInput-Kofaohjz.js","/assets/Layout-CSpyzMyD.js","/assets/LeaderAppeal-DqS3Bwou.js","/assets/LeaderDailyTasks-BQYlG3uZ.js","/assets/LeaderDayReport-Rysk3-FF.js","/assets/LeaderNotCounting-DwL25qT9.js","/assets/LeaderTasksAdmin-CfW6gU9C.js","/assets/LeaderUnitReport-DbqurajW.js","/assets/Leaderboard-D7fG3t2C.js","/assets/Leaders-CPmDp8bo.js","/assets/LeadersKpi-Bgs6xK4S.js","/assets/Lightbox--W_XKy1M.js","/assets/LiveOverview-CAQFiOp8.js","/assets/Login-C8BUrFsO.js","/assets/Logs-CiUveAyk.js","/assets/LostWorkers-BevVBIGj.js","/assets/Meter-CRRHrYuq.js","/assets/NotFound-lctfiRm_.js","/assets/Notifications-C93R182j.js","/assets/NotionTasks-SRvTtl4Q.js","/assets/NotionTrackerSettings-BDy-amcn.js","/assets/Ontime-B81g0yac.js","/assets/OrgChart-WQuDg9H2.js","/assets/Ovens-B1Zx2C1L.js","/assets/OvensSettings-BWS-MqzH.js","/assets/Overview-DKebX7uP.js","/assets/OwnerChip-DCwgnNcf.js","/assets/Pagination-l0VtuHj0.js","/assets/People-DvqGOKVz.js","/assets/PerenaladkaFactTable-BSnFLasF.js","/assets/Permissions-DGXmcqyK.js","/assets/PersonCard-Ms5E0aDC.js","/assets/PlanFulfillment-DqZDuSKW.js","/assets/Production-CyWIHoQ6.js","/assets/ProductionUpload-CrwhozGH.js","/assets/Profile-ylATbYJV.js","/assets/ProfileAvatar-CGj1IQ3-.js","/assets/ProfilesManagement-CSWnf6qs.js","/assets/ProofCamera-DuZoW5pn.js","/assets/ProofPhoto-CDvdg7dx.js","/assets/Quality-CV1_weAA.js","/assets/RawRows-CuD7KnFK.js","/assets/Reports-CHYmJsiq.js","/assets/RequestStateChip-HZ2UNoUS.js","/assets/RichTextEditor-C_sB58Jo.js","/assets/SaveState-CpSkxcwB.js","/assets/SdPanelSettings-i-ZUshyf.js","/assets/SearchInput-Txe0itl9.js","/assets/SeasonalityHeatmap-B65j5wfW.js","/assets/SegmentedToggle-CIxWlaZZ.js","/assets/SetupTimes-73MPMz05.js","/assets/ShiftDaily-CG4ZjUri.js","/assets/ShiftTimes-C6afVue7.js","/assets/SortableList-DgrUPWKx.js","/assets/Staff-IQECvw7V.js","/assets/StaffListAtCheck-C_bsjEIb.js","/assets/StatusBadge-dYANfaxD.js","/assets/StatusBandsModal-1_AUltoV.js","/assets/TargetGoal-DpwVzxjx.js","/assets/Targets-B1o4U4_u.js","/assets/TaskFormModal-rqjl0ppr.js","/assets/TaskerSettings-DEspaa93.js","/assets/Tasks-CWVXks0W.js","/assets/TgProfile-BzvvfYWQ.js","/assets/TimeWheelPicker-DD4_Nkz4.js","/assets/Toast-DLkPq-u6.js","/assets/Tooltip-Cd0j8XOq.js","/assets/TranslationsEditor-DRU9j8cZ.js","/assets/TrelloAnalytics-B2FKwQFA.js","/assets/TrelloSettings-j6seTAGO.js","/assets/TrendChart-DrYsGpCR.js","/assets/TripleSpeedometer-a7zKiTY-.js","/assets/Trudoyomkost-BgEcARAt.js","/assets/UploadDropzone-Ckl6lJR3.js","/assets/UsersActivity-0xrbDZlJ.js","/assets/UsersManagement-BZ5LSKAR.js","/assets/VerdictBlock-Cp2t01g0.js","/assets/VerifixPage-CoG7f_D0.js","/assets/VerifixParity-BmtMPaOP.js","/assets/VfxApiMap-BOvb7QFP.js","/assets/VfxDictionaries-kkqDywFQ.js","/assets/VfxEmployees-D_g2dCCD.js","/assets/VfxHrMoves-_2jWoIR3.js","/assets/VfxJobs-DvRr6zNl.js","/assets/VfxPhoto-B4HHT3v9.js","/assets/VfxShifts-NgHuTGtL.js","/assets/VfxState-B6uomTTH.js","/assets/VfxTimebooks-OzB3CZQm.js","/assets/VfxTimesheet-BNZ4dWXv.js","/assets/WatchProgress-C_XZB-Fp.js","/assets/WebLogin-CJYisNjW.js","/assets/WorkersAttendance-GpH-eCEf.js","/assets/WorkersComposition-Cwg_2ZcI.js","/assets/WorkersMovements-BBeypvZs.js","/assets/WorkersPage-BXzMCTVs.js","/assets/Zagruzka-Cqk0qtiU.js","/assets/ZagruzkaCell-HkEpeUAU.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DXZmDmxg.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-Nv2_KwbR.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DdQsEpxi.js","/assets/broadcastTree-By9RjCK8.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-DaTRbbDp.js","/assets/categories-TRLN0Y8E.js","/assets/cellMoveRefusal-BJEDUmvF.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Cw5l60Ie.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-CFVS5vIz.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-EF-PxtMY.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BH54YsjB.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BrLUkPox.js","/assets/index-GDV8eVkm.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-Cv-mAaBv.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DS42RMaa.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CaZl1ktg.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CUBVn8lY.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-ed5z5-Up.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DnhiiG1m.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DGskdIYF.js","/assets/ru-B0rYmTCM.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-DIOSbQy3.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-B_uv9EC3.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-ChfDr16y.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CS_7H5jG.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-QnGtRi10.js","/assets/useMutation-BNb5YdMr.js","/assets/useOpenParam-CjUaQCSM.js","/assets/useStatusBands-zKluNSlU.js","/assets/useUrlScope-CaYR3bQh.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DVI80f3o.js","/assets/uz_cyrl-DO3wZcY4.js","/assets/vfx-A3Wh4Y_F.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-NdKpnF8Q.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/x-CfYkDDdF.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
