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

const BUILD = "2026-11-23T19:18:58.547Z";
const PRECACHE = ["/","/assets/AdminPage-BlzdivFZ.js","/assets/AdminTabs-CkzCe7m6.js","/assets/AiKeys-aT-8IHEm.js","/assets/AnalysisBoard-C7AU0Gll.js","/assets/ApiAccess-tyuDCcbH.js","/assets/AppLauncher-DjMYXyyL.js","/assets/Arc-B4ESieZd.js","/assets/Assessment-Bx_PTOPZ.js","/assets/AssessmentGrade-PS396OjB.js","/assets/AssessmentList-BAfhLffZ.js","/assets/Assistant-L5lBtr_y.js","/assets/AttendanceCleanup-BIbK9r-0.js","/assets/AttendanceUpload--EVKz3qt.js","/assets/AuditTable-Dp1ilg7a.js","/assets/Audits-Ctzl_I0K.js","/assets/BolimsModal-C0ew6Ikj.js","/assets/BrigadirProfile-C1qarKJn.js","/assets/BrigadirsKpi-g9SBz1tq.js","/assets/Broadcast-BHlQ9hDe.js","/assets/BroadcastReceivers-B3XunaLX.js","/assets/BroadcastRecord-CuY7Xzp3.js","/assets/CatLockNotice-C8T5Z2FL.js","/assets/CategoryLegendModal-CNFtWAxI.js","/assets/CellConcerns-Ct7A2cCN.js","/assets/CellDetails-DC3r3gUt.js","/assets/CellFormModal-BUVcLtCE.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-PdZ3U7aH.js","/assets/Cells-BF8aboCE.js","/assets/ColumnFilter-cBr7WsMC.js","/assets/ColumnsPicker-B_QAS48-.js","/assets/CommentsModal-BZPH0eGU.js","/assets/ComparisonTable-CRP16LVm.js","/assets/Concerns-DCtfWA9_.js","/assets/ConcernsPieces-CErbbG7o.js","/assets/ContainerBolims-LOtK_JFc.js","/assets/ContainerFlow-CcgLllId.js","/assets/ContainerTotalsCard-CF_KUed5.js","/assets/Containers-D9doH5Hg.js","/assets/CountStepper-S3XGARDR.js","/assets/Daily-C0PNGNIL.js","/assets/DataSources-Bip92WpV.js","/assets/DataTable-D2qemtqM.js","/assets/DateRangePicker-D2CZP6Ay.js","/assets/DayReportView-11Q2EYqZ.js","/assets/DayStepper-Dpfo9W9k.js","/assets/DayStrip-eQeu0n40.js","/assets/DbBackup-DIWesHja.js","/assets/DifferenceBreakdown-oK-ZCdeW.js","/assets/DocAudit-Ca1R0dTd.js","/assets/Downtime-DzLWtgic.js","/assets/Education-yXsTvKjS.js","/assets/EducationLesson-SQplzV0d.js","/assets/EmptyState-Ba-rkXPa.js","/assets/Equipment-B4m2Yt2e.js","/assets/Exam-C2Kj4CZT.js","/assets/ExamAdmin-Dci8xqA_.js","/assets/Factories-DBxTgmFh.js","/assets/FactorySelect-6a6_QP64.js","/assets/Gamification-DY5WCTgk.js","/assets/GroupBadge-CxBHchwr.js","/assets/HeatmapChart-C-7UMST4.js","/assets/HourlyContainers-BPxpClji.js","/assets/IdleCell-YxlCOdjX.js","/assets/IdleOwners-C8ZDHKRF.js","/assets/IdleSolutions-BAjVbgOQ.js","/assets/KPICard-sZIpkiy1.js","/assets/Kaizen-CRsDTfmF.js","/assets/Kelish-DhNSrHnt.js","/assets/Kitchen-C0M0t-bx.js","/assets/KpiBits-C00txEDo.js","/assets/KpiDeltaCard-BKTTEzPF.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-D0ZF_9oB.js","/assets/LeaderAppeal-DDC9wROi.js","/assets/LeaderDailyTasks-Dv0kTivx.js","/assets/LeaderDayReport-BwNIP0bE.js","/assets/LeaderNotCounting-HGCD1n0J.js","/assets/LeaderTasksAdmin-BhUo-jkd.js","/assets/LeaderUnitReport-BZIrhAfX.js","/assets/Leaderboard-B9dG5M65.js","/assets/Leaders-D9dmMfrc.js","/assets/LeadersKpi-BQxCTJj9.js","/assets/Lightbox-wPNmSG0v.js","/assets/LiveOverview-Dv7dyDTP.js","/assets/Login-lM9suJUs.js","/assets/Logs-DWWsFFcg.js","/assets/LostWorkers-DmPGhxwe.js","/assets/NotFound-3c_gtjN-.js","/assets/Notifications-D3k6AJQ6.js","/assets/NotionTasks-BTNmt7uy.js","/assets/NotionTrackerSettings-AlWYbPU7.js","/assets/Ontime-C_UDbuAQ.js","/assets/OrgChart-C4WfaNHh.js","/assets/Ovens-XVKbToAv.js","/assets/OvensSettings-CzfBNI7r.js","/assets/Overview-DD1RUbx-.js","/assets/OwnerChip-BbVMMJX1.js","/assets/Pagination-2-vvZBJi.js","/assets/People-DZewJKi3.js","/assets/PerenaladkaFactTable-DSzR1Y_h.js","/assets/Permissions-_OQt1mYg.js","/assets/PersonCard-2iP-bZtv.js","/assets/PlanFulfillment-BF8HxjCn.js","/assets/Production-BGs50l61.js","/assets/ProductionUpload-mwSzLMfM.js","/assets/Profile-CemnuK5_.js","/assets/ProfileAvatar-C3ELQ1H6.js","/assets/ProfilesManagement-C7cMDg-G.js","/assets/ProofCamera-DfoMZUy6.js","/assets/ProofPhoto-Dy-YwY4Y.js","/assets/Quality-B6Q3Qkg9.js","/assets/RawRows-Dctj-OB-.js","/assets/Reports-CZPy0991.js","/assets/RequestStateChip-B2WqqFYv.js","/assets/RichTextEditor-447fOV64.js","/assets/SaveState-CxBLBNol.js","/assets/SdPanelSettings-CVV9vGCm.js","/assets/SearchInput-DMROTRsL.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-BG105ky7.js","/assets/ShiftDaily-Bw5vadFq.js","/assets/ShiftTimes-BAJSIQ4A.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-BlhYJoOz.js","/assets/StaffListAtCheck-B6l0_XIM.js","/assets/StatusBadge-M044OqUR.js","/assets/StatusBandsModal-DW3vC6NV.js","/assets/TargetGoal-BrxCnDCD.js","/assets/Targets-UJsCJnBH.js","/assets/TaskFormModal-CFuDTDMP.js","/assets/TaskerSettings-Dc5Pelrq.js","/assets/Tasks-p6BsGiAW.js","/assets/TgProfile-DgSPfoJx.js","/assets/TimeWheelPicker-ehi8ytGd.js","/assets/Tooltip-BPFU9QsQ.js","/assets/TranslationsEditor-Bvhtcrlx.js","/assets/TrelloAnalytics-SdCjvCgg.js","/assets/TrelloSettings-DxWzkcz2.js","/assets/TrendChart-BYo-QUxA.js","/assets/TripleSpeedometer-CIelC-1t.js","/assets/Trudoyomkost-gFTgh_ML.js","/assets/UploadDropzone-DHrkhsfw.js","/assets/UsersActivity-IO5sipQk.js","/assets/UsersManagement-D2ObLkuS.js","/assets/VerifixPage-ZN3XtXej.js","/assets/VerifixParity-CyOMVOoI.js","/assets/VfxApiMap-DBILBYtM.js","/assets/VfxDictionaries-BFWxNek0.js","/assets/VfxEmployees-D4aI--0G.js","/assets/VfxHrMoves-V2XRqJDr.js","/assets/VfxJobs-CUguXMD_.js","/assets/VfxPhoto-DjlhKbiX.js","/assets/VfxShifts-BWhMVvNB.js","/assets/VfxState-DaLNsGwl.js","/assets/VfxTimebooks-DG_YVBcQ.js","/assets/VfxTimesheet-Y5k1Glhg.js","/assets/WatchProgress-9sqjeh2H.js","/assets/WebLogin-BZihj4kR.js","/assets/WorkersAttendance-CCOb6UBx.js","/assets/WorkersComposition-DUwjaiU2.js","/assets/WorkersMovements-xD2E38RD.js","/assets/WorkersPage-BE20AiYw.js","/assets/Zagruzka-BaiVXVDu.js","/assets/ZagruzkaCell-CJFBb7Gv.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DMQzqABN.js","/assets/api-D_IoyhCc.js","/assets/appealTask-CsZrcBrx.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-Ds0bxvbq.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-ymtZodtZ.js","/assets/broadcastTree-_PLbcM0b.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-Dn0aaGlK.js","/assets/categories-D2uQuTqh.js","/assets/cellMoveRefusal-BmJUbpnn.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BWgWGfsE.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-Bj9z9-3D.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-BmACwxTh.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-COC6xBRz.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CL9woV17.js","/assets/index-XPYHF8oi.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-yWlZJD2d.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/marks-C3j5SqQF.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-BunARNBY.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BODiuTxN.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-Cdud1xcc.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-DKNA8pak.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-wnK1gD9I.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Bttm19ho.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-CDHsrPlg.js","/assets/useMutation-44O8ZQg1.js","/assets/useOpenParam-LCbFA96q.js","/assets/useStatusBands-BJtaWZpA.js","/assets/useUrlScope-DEoBkkyG.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-DGPPOOFP.js","/assets/uz_cyrl-t_Uhpuzd.js","/assets/vfx-cYCjhS2h.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-Dm4m4wEW.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
