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

const BUILD = "2026-11-12T07:26:56.253Z";
const PRECACHE = ["/","/assets/ActionHistory-CngPO0pM.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-CBzhXs5c.js","/assets/AiKeys-C_b5KTOC.js","/assets/AnalysisBoard-K_B_NUWV.js","/assets/ApiAccess-BALWd2FP.js","/assets/AppLauncher-EaiF8k48.js","/assets/Arc-BHzciQqc.js","/assets/Assessment-DaVk-dZ_.js","/assets/AssessmentGrade-COUcIs28.js","/assets/AssessmentList-D60ThrWN.js","/assets/Assistant-LRnE-X5u.js","/assets/AttendanceCleanup-CMpc84Gd.js","/assets/AttendanceUpload-DRcotIkR.js","/assets/AuditTable-37kL1mDz.js","/assets/BrigadirProfile-DhuU6LOd.js","/assets/BrigadirsKpi-Deyz6ZJX.js","/assets/Broadcast-ZGduJKNu.js","/assets/BroadcastReceivers-ylRKbBIW.js","/assets/BroadcastRecord-BeWhBh1d.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-DKr_P3NB.js","/assets/CategoryLegendModal-7fS0YCOG.js","/assets/CellConcerns-D9fsF6QX.js","/assets/CellDetails-PU0CPhKc.js","/assets/CellFormModal-vS4AHxsy.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-BDbvuyzN.js","/assets/Cells-K2nfTHfR.js","/assets/ColumnFilter-C9bdfhdS.js","/assets/ColumnsPicker-CSf0Mvfp.js","/assets/CommentsModal-KrQUZ19B.js","/assets/ComparisonTable-BReL1E4G.js","/assets/Concerns-OM9w7N8B.js","/assets/ConcernsPieces-Btf3kDjw.js","/assets/CountStepper-D0BXZEJx.js","/assets/Daily-BqCp6w7Q.js","/assets/DataSources-Ct2g5hp7.js","/assets/DataTable-Pj0ojNQb.js","/assets/DateRangePicker-DckwoPBF.js","/assets/DayReportView-Bf5Xr0_p.js","/assets/DayStepper-BIzIsgVC.js","/assets/DayStrip-DROlNpo2.js","/assets/DbBackup-CTNGswib.js","/assets/DifferenceBreakdown-BsznkIKa.js","/assets/DocAudit-yds6C4Ct.js","/assets/Downtime-cgas6Feq.js","/assets/Education-EPlbdD-3.js","/assets/EducationLesson-D_P9atEu.js","/assets/EmptyState-Mhj6muxR.js","/assets/Exam-Cs0GlWxX.js","/assets/ExamAdmin-DLlk_6Z4.js","/assets/Factories-QszRfZBy.js","/assets/FactorySelect-Co3ZhIEW.js","/assets/Gamification-X0d3wOmO.js","/assets/GroupBadge-D-TG5mTE.js","/assets/HeatmapChart-Bzc56fqG.js","/assets/IdleCell-HnR-bPxT.js","/assets/IdleOwners-Bsh_atCQ.js","/assets/IdleSolutions-DUUjSZdz.js","/assets/IdleSource-CF8dqe-s.js","/assets/KPICard-BsTvabYr.js","/assets/Kaizen-COaUSVTv.js","/assets/Kelish-vurPM2-6.js","/assets/KpiBits-B44A8NRS.js","/assets/KpiDeltaCard-DFFISVXd.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-OkedFtcU.js","/assets/LeaderAppeal-DCDPfctM.js","/assets/LeaderCutoffs-EWih_P93.js","/assets/LeaderDailyTasks-BAw6juvt.js","/assets/LeaderDayExclusions-llTE5gwt.js","/assets/LeaderDayReport-DVCnP10k.js","/assets/LeaderTasksAdmin-C1POvI4U.js","/assets/LeaderUnitReport-BFDgriCE.js","/assets/Leaderboard-BiaWQ3wD.js","/assets/Leaders-BgJl1NLx.js","/assets/LeadersKpi-CHDY75EC.js","/assets/Lightbox-DsD7a9Ge.js","/assets/LiveOverview-BiPAlL6M.js","/assets/Login-Cof17MBt.js","/assets/Logs-D0POBa47.js","/assets/LostWorkers-D_x6oRGF.js","/assets/NotFound-Bd44QBDe.js","/assets/Notifications-BjeyVjcm.js","/assets/NotionTasks-C9By2rHa.js","/assets/NotionTrackerSettings-DY3o5AjS.js","/assets/Ontime-qF6mgb4N.js","/assets/OrgChart-BSACBpsr.js","/assets/Ovens-B-qdxOHr.js","/assets/OvensSettings-DTOcWbZN.js","/assets/Overview-BV09Jrlx.js","/assets/OwnerChip-B4g75vVT.js","/assets/PageAccess-CptOfPBM.js","/assets/Pagination-BJk3toK1.js","/assets/People-Cplk7dPR.js","/assets/PerenaladkaFactTable-Br-G2Kq4.js","/assets/Permissions-BC1KX0Ck.js","/assets/PersonCard-CzKYq_Ht.js","/assets/PlanFulfillment-BuyuyqQg.js","/assets/Production-URFpSvvG.js","/assets/ProductionUpload-wqjjzvV6.js","/assets/Profile-Dx-oaBil.js","/assets/ProfileAvatar-B1DjGub4.js","/assets/ProfilesManagement-D-RIY7I8.js","/assets/ProofCamera-D3iRHq6m.js","/assets/ProofPhoto-BsuOYlRi.js","/assets/Quality-ILABirw7.js","/assets/RawRows-CET_TE9-.js","/assets/Reports-DqG_0TNA.js","/assets/RequestStateChip-DOSIm8qV.js","/assets/RichTextEditor-qPGczrey.js","/assets/SaveState-BJ_ndLG3.js","/assets/SearchInput-Lai54JE9.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-Cd4tcFOT.js","/assets/ShiftDaily-0WNb69ha.js","/assets/ShiftTimes-Bd2McnPp.js","/assets/Staff-BhUDvuYP.js","/assets/StaffListAtCheck-PWzPEkhN.js","/assets/StatusBadge-Dp90kdmj.js","/assets/StatusBandsModal-Czb02Nnp.js","/assets/TargetGoal-CRqWe6od.js","/assets/Targets-n40XPPWx.js","/assets/TaskerSettings-B38I2fxD.js","/assets/Tasks-B1gL8u9L.js","/assets/TgProfile-D963ESJH.js","/assets/TimeWheelPicker-DKWf_wJG.js","/assets/Tooltip-BEE-VDJB.js","/assets/TranslationsEditor-CrsEjksk.js","/assets/TrelloAnalytics-DQgR9wAP.js","/assets/TrelloSettings-DntOXBWc.js","/assets/TrendChart-Ba5hSA9Q.js","/assets/TripleSpeedometer-BZ8_W3iW.js","/assets/Trudoyomkost-BMR249mw.js","/assets/UploadDropzone-DZujwZ0g.js","/assets/UsersActivity-D-aevrfV.js","/assets/UsersManagement-BuPduprX.js","/assets/VerdictBlock-B6CVcWxe.js","/assets/VerifixParity-CHAwhSnr.js","/assets/VerifixSettings-Dv2sPYIj.js","/assets/VerifixSync-BfFrcNu-.js","/assets/VfxApiMap-XYOTfVmu.js","/assets/VfxDictionaries-CBBexf4H.js","/assets/VfxEmployees-0tuxpTaD.js","/assets/VfxHrMoves-C1KVu_d9.js","/assets/VfxJobs-D7RXU-Ib.js","/assets/VfxPhoto-Bk64wgRl.js","/assets/VfxShifts-Bn9jIaj7.js","/assets/VfxState-Cy5uuLfn.js","/assets/VfxTimebooks-DNjdE7o_.js","/assets/VfxTimesheet-Bs3CYVEV.js","/assets/WatchProgress-_RCmQZsi.js","/assets/WebLogin-B5TngYf0.js","/assets/WorkersAttendance-D_y7Brth.js","/assets/WorkersComposition-BxUTpxz5.js","/assets/WorkersMovements-B75VCiY6.js","/assets/WorkersPage-DOPevDH4.js","/assets/Zagruzka-DBCpN_PH.js","/assets/ZagruzkaCell-BKNBA-Vh.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CxJe98ZH.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CdR3plq3.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DBxYlAnW.js","/assets/broadcastTree-DNSes7o8.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-CU7zkyHk.js","/assets/cellMoveRefusal-C-qCPmeS.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-down-up-byaoonrp.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-ZOzGI-wu.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-SUfjaAkV.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-WGSwVmmF.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BNCSettQ.js","/assets/index-Cf_Fer9X.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-B-pea8V5.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BfOyU4jx.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-DrzT_mOZ.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DyEZouXc.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-CP2oH0rz.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-Cbtz36NG.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-C2YkXTxo.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-BIN9VTCz.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BpxHRvHR.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-C585x7zb.js","/assets/useMutation-Ci6dPQ1s.js","/assets/useOpenParam-DUsAiGNd.js","/assets/useStatusBands-DoHY6Nc_.js","/assets/useUrlScope-BSgdmzQW.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DlM-DxwS.js","/assets/uz_cyrl-DJBQ02qn.js","/assets/vfx-178F2UZR.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-CCHWtXvW.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
