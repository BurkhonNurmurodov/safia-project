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

const BUILD = "2026-11-15T16:13:07.085Z";
const PRECACHE = ["/","/assets/ActionHistory-D8MbUTsQ.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-D7nNslqe.js","/assets/AiKeys-DOCqHzQG.js","/assets/AnalysisBoard-BqVs89H7.js","/assets/ApiAccess-BpnF8NLl.js","/assets/AppLauncher-BWU-8s4R.js","/assets/Arc-DJIJLJPX.js","/assets/Assessment-CyEFmYhz.js","/assets/AssessmentGrade-D58a3D9E.js","/assets/AssessmentList-DFuj8BOK.js","/assets/Assistant-B07ShTYr.js","/assets/AttendanceCleanup-DGXqqM6c.js","/assets/AttendanceUpload-GbpPkhs6.js","/assets/AuditTable-Czpa-y0P.js","/assets/BrigadirProfile-B7xd6rkT.js","/assets/BrigadirsKpi-6bPaUlDR.js","/assets/Broadcast-FyVGkbBp.js","/assets/BroadcastReceivers-Bbzj3NXH.js","/assets/BroadcastRecord-C1YPx_2X.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-BUZviCBC.js","/assets/CategoryLegendModal-CpCk4tUe.js","/assets/CellConcerns-D1N03XBD.js","/assets/CellDetails-BBIMFO3I.js","/assets/CellFormModal-Np66NYA9.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-Hf00AqlT.js","/assets/Cells-DItsmm4T.js","/assets/ColumnFilter-DgtgOUfs.js","/assets/ColumnsPicker-BjhhRP7u.js","/assets/CommentsModal-Cmvuajq3.js","/assets/ComparisonTable-DXh2P5CX.js","/assets/Concerns-DpN60PYJ.js","/assets/ConcernsPieces-DVdQSbDo.js","/assets/ContainerFlow-BdPsyB2l.js","/assets/ContainerTotalsCard-BKQjtUHR.js","/assets/Containers-BxUYgzrz.js","/assets/CountStepper-B_FdtiSe.js","/assets/Daily-CsGZ5BwN.js","/assets/DataSources-Bd9mRvet.js","/assets/DataTable-C3iJP-Ar.js","/assets/DateRangePicker-Cb7fpFAp.js","/assets/DayReportView-CASPZKbg.js","/assets/DayStepper-COIR_nga.js","/assets/DayStrip-UYzYxNjJ.js","/assets/DbBackup-BQA_rkxC.js","/assets/DifferenceBreakdown-Dv4lMMNU.js","/assets/DocAudit-CY9PYLOF.js","/assets/Downtime-B__DaR1r.js","/assets/Education-DZZ6kzET.js","/assets/EducationLesson-D_5W5nEw.js","/assets/EmptyState-DG3xRoRt.js","/assets/Exam-BLM3UD7R.js","/assets/ExamAdmin-rxcrg5xt.js","/assets/Factories-bDuA835q.js","/assets/FactorySelect-BPmhpbKG.js","/assets/Gamification-BjgHFB1v.js","/assets/GroupBadge-BSJDp-2d.js","/assets/HeatmapChart-W2xU7Q3z.js","/assets/HourlyContainers-Ces0RfH6.js","/assets/IdleCell-ByxfRxeX.js","/assets/IdleOwners-BDfpC1xY.js","/assets/IdleSolutions-DIiy65JD.js","/assets/IdleSource-CUqjgKAi.js","/assets/KPICard-D08IYZOL.js","/assets/Kaizen--9DW4tcn.js","/assets/Kelish-C-cHbatz.js","/assets/Kitchen-D2Ta0N1N.js","/assets/KpiBits-50Yf6b7j.js","/assets/KpiDeltaCard-DQF-JQ8v.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-Cryci3Fj.js","/assets/LeaderAppeal-B-UZIVLa.js","/assets/LeaderCutoffs-D4zAegVA.js","/assets/LeaderDailyTasks-Bjy5HALj.js","/assets/LeaderDayExclusions-DJdI9xVi.js","/assets/LeaderDayReport-Bbp91VDJ.js","/assets/LeaderTasksAdmin-DN5BEKeb.js","/assets/LeaderUnitReport-CKOQAex7.js","/assets/Leaderboard-C7hj_j3a.js","/assets/Leaders-CyuQ7tn3.js","/assets/LeadersKpi-BtnJFo0N.js","/assets/Lightbox-CjHpSzIO.js","/assets/LiveOverview-knICTXqC.js","/assets/Login-4nvJ79eF.js","/assets/Logs-C_Zf8NZk.js","/assets/LostWorkers-BgWjR8M6.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-NiwJ1oDS.js","/assets/Notifications-HguCtbSl.js","/assets/NotionTasks-CJHTKsBD.js","/assets/NotionTrackerSettings-e8S2NMhy.js","/assets/Ontime-BpOJRJ4_.js","/assets/OrgChart-CwjL3pGv.js","/assets/Ovens-ct2Ef4wa.js","/assets/OvensSettings-Czpaj2O0.js","/assets/Overview-B2GP-jOe.js","/assets/OwnerChip-iHmFguiK.js","/assets/PageAccess-CZj3a-Ln.js","/assets/Pagination-C8fpOOBB.js","/assets/People-CEIDmJGf.js","/assets/PerenaladkaFactTable-DDe8CYmE.js","/assets/Permissions-Bg0akGC_.js","/assets/PersonCard-Dwd78iiE.js","/assets/PlanFulfillment-zbvBiLnu.js","/assets/Production-BJs-V10_.js","/assets/ProductionUpload-DQW68Vyt.js","/assets/Profile-DoVRnyq9.js","/assets/ProfileAvatar-Cj4BWXx4.js","/assets/ProfilesManagement-DHoZGAI5.js","/assets/ProofCamera-UYC6EFMW.js","/assets/ProofPhoto-d_3vNxsW.js","/assets/Quality-c-crjfER.js","/assets/RawRows-DOG3CS2A.js","/assets/Reports-4IVDgbrQ.js","/assets/RequestStateChip-Be4Hhu3a.js","/assets/RichTextEditor-DHtX1tN_.js","/assets/SaveState-BkZIXonj.js","/assets/SearchInput-mzx5qK8l.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-Ds4fuOGk.js","/assets/ShiftDaily-WwRsGdIr.js","/assets/ShiftTimes-BwunOeey.js","/assets/SortableList-DCEDbyLr.js","/assets/Staff-C8W2RiQj.js","/assets/StaffListAtCheck-SSRyKQhw.js","/assets/StatusBadge-SH3buMYk.js","/assets/StatusBandsModal-BNLVyvDF.js","/assets/TargetGoal-D_Y3cjbP.js","/assets/Targets-jaEtwr5l.js","/assets/TaskFormModal-Btbi34SL.js","/assets/TaskerSettings-CY81XFAq.js","/assets/Tasks-VhmDbS53.js","/assets/TgProfile-Bz4jQLFJ.js","/assets/TimeWheelPicker-N8J3PfRS.js","/assets/Tooltip-C1hWQf64.js","/assets/TranslationsEditor-uDgTRGvA.js","/assets/TrelloAnalytics-BGDTs47f.js","/assets/TrelloSettings-CTYBAe1y.js","/assets/TrendChart-DIwRl4Yu.js","/assets/TripleSpeedometer-CISDsEKa.js","/assets/Trudoyomkost-wV0f3lIG.js","/assets/UploadDropzone-XGcR9VRh.js","/assets/UsersActivity-6Vl4Ty_Y.js","/assets/UsersManagement-Bdj4msXp.js","/assets/VerdictBlock-RawRyQaq.js","/assets/VerifixParity-DGWK6vWh.js","/assets/VerifixSettings-BAvjECfp.js","/assets/VerifixSync-CF4qYpxe.js","/assets/VfxApiMap-FWbEh6rM.js","/assets/VfxDictionaries-C6721V0K.js","/assets/VfxEmployees-BRExi1CB.js","/assets/VfxHrMoves-Jy5plHe2.js","/assets/VfxJobs-lxhFXTQr.js","/assets/VfxPhoto-gKIW89xK.js","/assets/VfxShifts-C6iOR0ue.js","/assets/VfxState-DdInT32F.js","/assets/VfxTimebooks-HOco4KNl.js","/assets/VfxTimesheet-6kzJ0yzb.js","/assets/WatchProgress-BYkUG9H5.js","/assets/WebLogin-BBx5mQUv.js","/assets/WorkersAttendance-BR7do2gZ.js","/assets/WorkersComposition-Bt3bDqiH.js","/assets/WorkersMovements-CG3cf-rj.js","/assets/WorkersPage-BayH-fgG.js","/assets/Zagruzka-Blr0P02i.js","/assets/ZagruzkaCell-2J8B8fwN.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BBlj9ae0.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-C3gd54MA.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CQ1yUyRH.js","/assets/broadcastTree-75x1fL4X.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-ClcWaMNZ.js","/assets/cellMoveRefusal-DXed5HFb.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-C7HpJwIP.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-RySUnmUf.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-BYCtuxck.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Do1Z-18x.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BAVFrMSE.js","/assets/index-Dsb31Dlq.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-C0cCpfGZ.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-Yixy2Ads.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-Fv-bPsdN.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-alHW-J9S.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-B5DK-nhV.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-DlIK9ZZq.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CdPipex2.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/triangle-alert-CnUaq82N.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CIfqaIE3.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-K-TOCwXv.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-QwFjjZzC.js","/assets/useOpenParam-4VplIybx.js","/assets/useStatusBands-mSBJXk-3.js","/assets/useUrlScope-C35nRFg3.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DwwlhPXs.js","/assets/uz_cyrl-B7G9UCfw.js","/assets/vfx-CYI6fj0k.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-DcnXaWbP.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
