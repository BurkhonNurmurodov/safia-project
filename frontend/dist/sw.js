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

const BUILD = "2026-11-16T04:21:57.144Z";
const PRECACHE = ["/","/assets/ActionHistory-B2SdVzMr.js","/assets/ActionMenu-CIIRtxDA.js","/assets/AdminPage-CE9thodr.js","/assets/AiKeys-F4VhcP_H.js","/assets/AnalysisBoard-CM4It6-t.js","/assets/ApiAccess-PnMhXt1z.js","/assets/AppLauncher-CQ3JRMyk.js","/assets/Arc-D0BgbK4D.js","/assets/Assessment-9S8Z7L4y.js","/assets/AssessmentGrade-CmBIJ3OD.js","/assets/AssessmentList-Cs2WHNfh.js","/assets/Assistant-CVc_iw0I.js","/assets/AttendanceCleanup-CaewaPmo.js","/assets/AttendanceUpload-DKrg0kRc.js","/assets/AuditTable-BK3PbjD6.js","/assets/BrigadirProfile-BLZSsJ9J.js","/assets/BrigadirsKpi-6zY1ECGi.js","/assets/Broadcast-CCcvGE5Q.js","/assets/BroadcastReceivers-CfQjuIom.js","/assets/BroadcastRecord-Dvo2GYxi.js","/assets/Button-hcJ3U3kF.js","/assets/CatLockNotice-DMV_iraz.js","/assets/CategoryLegendModal-Cyxgt9-W.js","/assets/CellConcerns-U1tsPCAa.js","/assets/CellDetails-CX_lEco0.js","/assets/CellFormModal-DxeA6Sw3.js","/assets/CellIdent-DsZyACsz.js","/assets/CellLink-PQ-SH9a7.js","/assets/Cells-D33uE-eY.js","/assets/ColumnFilter-CpEEqouC.js","/assets/ColumnsPicker-BAtxWoH8.js","/assets/CommentsModal-BfG5J8yF.js","/assets/ComparisonTable-Cdn5FeVr.js","/assets/Concerns-BRe33tCe.js","/assets/ConcernsPieces-Caal2kAn.js","/assets/ContainerFlow-DjNOe1aN.js","/assets/ContainerTotalsCard-SMFF_0XK.js","/assets/Containers-BlpLrUwH.js","/assets/CountStepper-iMu9TaYC.js","/assets/Daily-DTd_-gwY.js","/assets/DataSources-D1rYo8QV.js","/assets/DataTable-wwWqQ0JI.js","/assets/DateRangePicker-CdZqd-en.js","/assets/DayReportView-0jyImlrV.js","/assets/DayStepper-CXp7tbCu.js","/assets/DayStrip-C8tkamAZ.js","/assets/DbBackup-CEfU3GvH.js","/assets/DifferenceBreakdown-E07orWPB.js","/assets/DocAudit-D6Y4b2hK.js","/assets/Downtime-D6fBBtlv.js","/assets/Education-CCBFnnqv.js","/assets/EducationLesson-B8HCbzg2.js","/assets/EmptyState-DKWR0cpe.js","/assets/Exam-BdqD2H4P.js","/assets/ExamAdmin-6nPuqgch.js","/assets/Factories-e12lDI_-.js","/assets/FactorySelect-BIYGDQLY.js","/assets/Gamification-DMPRkG20.js","/assets/GroupBadge-DRuhBayg.js","/assets/HeatmapChart-botfMt2M.js","/assets/HourlyContainers-CKGmdYwh.js","/assets/IdleCell-npHHyk3Y.js","/assets/IdleOwners-CSM-SihO.js","/assets/IdleSolutions-AYr-Jgxz.js","/assets/IdleSource-0lmfIuVy.js","/assets/KPICard-C43cDIv3.js","/assets/Kaizen-BKJY3XVU.js","/assets/Kelish-JrlyUsSK.js","/assets/Kitchen-C0wgGAoy.js","/assets/KpiBits-yc9Yz-Vf.js","/assets/KpiDeltaCard-ByuAy7IS.js","/assets/LangContext-RW_OWush.js","/assets/LangTextInput-DIg9LZxe.js","/assets/Layout-CmUzHfPd.js","/assets/LeaderAppeal-L3aQ3tu5.js","/assets/LeaderCutoffs-CooVwAbr.js","/assets/LeaderDailyTasks-CdZ12Wr7.js","/assets/LeaderDayExclusions-jvo41a0B.js","/assets/LeaderDayReport-DlXrRHfE.js","/assets/LeaderTasksAdmin-D2WyalXy.js","/assets/LeaderUnitReport-DOXukQ56.js","/assets/Leaderboard-C6kAYjOh.js","/assets/Leaders-CH3OBKm8.js","/assets/LeadersKpi-kuZZeb0s.js","/assets/Lightbox-oJoVA3EY.js","/assets/LiveOverview-bVL1TAW7.js","/assets/Login-CzkbwL-Z.js","/assets/Logs--fqF3U7p.js","/assets/LostWorkers-BbWUf1bd.js","/assets/Meter-7PIG3YTA.js","/assets/NotFound-CDOzPpjm.js","/assets/Notifications-BqbOEBNm.js","/assets/NotionTasks-2yqbB6MN.js","/assets/NotionTrackerSettings-6cHaeqa9.js","/assets/Ontime-Bo_ZgsGo.js","/assets/OrgChart-Dqmfm_3p.js","/assets/Ovens-C0JcTb7y.js","/assets/OvensSettings-C4JXjELr.js","/assets/Overview-Db_UKtPd.js","/assets/OwnerChip-DZjNs3W1.js","/assets/PageAccess-b5SlRujl.js","/assets/Pagination-CGCFwlxC.js","/assets/People-C-hICLIk.js","/assets/PerenaladkaFactTable-Dll530O-.js","/assets/Permissions-cTnk16n9.js","/assets/PersonCard-B1CJ_7dx.js","/assets/PlanFulfillment-xGXSXtzB.js","/assets/Production-DQ9yjioU.js","/assets/ProductionUpload-CYGE2GIP.js","/assets/Profile-BCsgiNiy.js","/assets/ProfileAvatar-Dto5SCr8.js","/assets/ProfilesManagement-M9oS9h-b.js","/assets/ProofCamera-CPntruhH.js","/assets/ProofPhoto-yJAPuy8J.js","/assets/Quality-Dheenl5g.js","/assets/RawRows-BaT51d5i.js","/assets/Reports-DpYqvBvc.js","/assets/RequestStateChip-CR_kLJnZ.js","/assets/RichTextEditor-DYJpoegY.js","/assets/SaveState-29x-fxvm.js","/assets/SearchInput-D0XrtdS1.js","/assets/SeasonalityHeatmap-Bpsg37J4.js","/assets/SegmentedToggle-Be-XUt-X.js","/assets/SetupTimes-Be2NoCJm.js","/assets/ShiftDaily-Cvj6uMIL.js","/assets/ShiftTimes-CfmdXwvs.js","/assets/SortableList-DCEDbyLr.js","/assets/Staff-B3jMf_7d.js","/assets/StaffListAtCheck-BNKh6TBC.js","/assets/StatusBadge-7ucpzqZS.js","/assets/StatusBandsModal-BJIMS6fx.js","/assets/TargetGoal-XIg0Wvxs.js","/assets/Targets-CdtZtnYa.js","/assets/TaskFormModal-CbnoDRSs.js","/assets/TaskerSettings-BoFgymU6.js","/assets/Tasks-DwC3JNiZ.js","/assets/TgProfile-DB6R3Jkg.js","/assets/TimeWheelPicker-BFQPS49r.js","/assets/Tooltip-BLLDZSo2.js","/assets/TranslationsEditor-eQr6IYaX.js","/assets/TrelloAnalytics-CQlOFXux.js","/assets/TrelloSettings-D-_VG7W4.js","/assets/TrendChart-BYWADOzE.js","/assets/TripleSpeedometer-C1DdX5l2.js","/assets/Trudoyomkost-DR-liCbt.js","/assets/UploadDropzone-CgJi2Tq7.js","/assets/UsersActivity-6Huv6K5F.js","/assets/UsersManagement-wImMs5TF.js","/assets/VerdictBlock-KRkrnOxB.js","/assets/VerifixParity-DAfUL-_X.js","/assets/VerifixSettings-Ce-IOh3r.js","/assets/VerifixSync-MeDC0zef.js","/assets/VfxApiMap-BSWvPu8q.js","/assets/VfxDictionaries-C1qZTUVm.js","/assets/VfxEmployees-DCRpsYhL.js","/assets/VfxHrMoves-BqkyY1r8.js","/assets/VfxJobs-DPwwUTIl.js","/assets/VfxPhoto-BfOJy-M7.js","/assets/VfxShifts-Dp5WKe6w.js","/assets/VfxState-BIALFsyu.js","/assets/VfxTimebooks-mR2bHpQK.js","/assets/VfxTimesheet-Bug5ndki.js","/assets/WatchProgress-1jMXwBs7.js","/assets/WebLogin-BmUY7Ss1.js","/assets/WorkersAttendance-TBDrs_tw.js","/assets/WorkersComposition-C4VdBsr2.js","/assets/WorkersMovements-LSmiGkk6.js","/assets/WorkersPage-_ZLdz9qn.js","/assets/Zagruzka-vRlFSZEo.js","/assets/ZagruzkaCell-Bued6iu8.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-NlsPE0rZ.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-DVoPuXXR.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DZCcPAfu.js","/assets/broadcastTree-DoAJtBvr.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-PsNuumvM.js","/assets/cellMoveRefusal-Dqej1tLz.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-L9fdT77f.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-D0NWXCx6.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-hRv3yL5g.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-8OMQLWvl.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BexlpFee.js","/assets/index-Rq15oGzo.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-qwcybMe4.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BB7q-652.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CDNuyTW2.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-C02VPu0x.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-Da-bd669.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CuuDTGAz.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DgKa559y.js","/assets/ru-DO898l13.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CHYidFEn.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CRVMCc8S.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-DSGX_GBe.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/triangle-alert-CnUaq82N.js","/assets/turnoverUtil-Figknw5n.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DrjHUa18.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-BZPUdVUb.js","/assets/useLeaveRef-BJRhS-0n.js","/assets/useMutation-vA9tUMKp.js","/assets/useOpenParam-WSTW5CzL.js","/assets/useStatusBands-ClS8ceWX.js","/assets/useUrlScope-DHOh9VT2.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-Cnla8l3C.js","/assets/uz_cyrl-P2qTBT3S.js","/assets/vfx-ocnDUOCB.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-B6WXtwhs.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
