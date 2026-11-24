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

const BUILD = "2026-11-24T15:23:53.216Z";
const PRECACHE = ["/","/assets/AdminPage-Br9iuYsY.js","/assets/AdminTabs-DJWfWggI.js","/assets/AiKeys-C74Qw7Yq.js","/assets/AnalysisBoard-CDW36vuE.js","/assets/ApiAccess-BiquIcsn.js","/assets/AppLauncher-FBKsSqfj.js","/assets/Arc-B4o-tGHq.js","/assets/Assessment-MAe3wezD.js","/assets/AssessmentGrade-D4crEh2e.js","/assets/AssessmentList-Dxx7mI-x.js","/assets/Assistant-SmWBQLR7.js","/assets/AttendanceCleanup-CYHn0lB7.js","/assets/AttendanceUpload-Br23UhN4.js","/assets/AuditTable-Cm70p18m.js","/assets/Audits-BC_cLT-g.js","/assets/BolimsModal-Oc0u0KZK.js","/assets/BrigadirProfile-CMUk-Weg.js","/assets/BrigadirsKpi-iFAmcuIA.js","/assets/Broadcast-K4zj2A53.js","/assets/BroadcastReceivers-BReh07S3.js","/assets/BroadcastRecord-Cruo3vt6.js","/assets/CatLockNotice-6hebaXJi.js","/assets/CategoryLegendModal-750PGRhF.js","/assets/CellConcerns-CrnfNtX_.js","/assets/CellDetails-WN2ijRUJ.js","/assets/CellFormModal-DJP-Kppn.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-DJHBoTXe.js","/assets/Cells-CYrnixOh.js","/assets/ColumnFilter-CENDTeWw.js","/assets/ColumnsPicker-4R-ysiDC.js","/assets/CommentsModal-C1sLvPU0.js","/assets/ComparisonTable-DLmFI1RD.js","/assets/Concerns-cZSwI3Xg.js","/assets/ConcernsPieces-C0mMt5wA.js","/assets/ContainerBolims-B-H-vx11.js","/assets/ContainerFlow-DoddB6Ne.js","/assets/ContainerTotalsCard-CzK7KPzC.js","/assets/Containers-zSaJfSMd.js","/assets/CountStepper-CEdw5GVT.js","/assets/Daily-D29HPNEO.js","/assets/DataSources-BKFNLyv1.js","/assets/DataTable-C71d07CM.js","/assets/DateRangePicker-8DcbWbAl.js","/assets/DayReportView-B5rUkfeO.js","/assets/DayStepper-CPzKNHp5.js","/assets/DayStrip-BvpeWQN8.js","/assets/DbBackup-BrbIlDX1.js","/assets/DifferenceBreakdown-lbnzGjEY.js","/assets/DocAudit-CuQEbw5v.js","/assets/Downtime-BW94Y8Ls.js","/assets/Education-VR0__AEI.js","/assets/EducationLesson-Dl9_7iYt.js","/assets/EmptyState-DpYLnUHZ.js","/assets/Equipment-CbFlgdtR.js","/assets/Exam-DEZTWcB6.js","/assets/ExamAdmin-DTyA3Ek3.js","/assets/Factories-DaOohtXC.js","/assets/FactorySelect-2baL8OSh.js","/assets/Gamification-hb9lF3XH.js","/assets/GroupBadge-DNdvyEU4.js","/assets/HeatmapChart-DV2xFhI7.js","/assets/HourlyContainers-Bjrona7A.js","/assets/IdleCell-B3biTnuF.js","/assets/IdleOwners-DbMjozbn.js","/assets/IdleSolutions-Co5KCTDv.js","/assets/KPICard-BThaAFNv.js","/assets/Kaizen-CJ8r2pii.js","/assets/Kelish-Ft6LZRtI.js","/assets/Kitchen-D6WyorWA.js","/assets/KpiBits-DPk1emf8.js","/assets/KpiDeltaCard-BMFjaKiK.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-CDCEcBMB.js","/assets/LeaderAppeal-DwQoXQjK.js","/assets/LeaderDailyTasks-DJcJW5JG.js","/assets/LeaderDayReport-D0qTp3a1.js","/assets/LeaderNotCounting-BYXPRoqy.js","/assets/LeaderTasksAdmin-DMeYZBiW.js","/assets/LeaderUnitReport-C8AyjFjI.js","/assets/Leaderboard-BwBJM2xz.js","/assets/Leaders-q2VZGVrz.js","/assets/LeadersKpi-Cf4YLSDj.js","/assets/Lightbox-BeLQ73lL.js","/assets/LiveOverview-Bb00dr7D.js","/assets/Login-DT-XKYW3.js","/assets/Logs-CKEH2nkQ.js","/assets/LostWorkers-CBI9zdO6.js","/assets/NotFound-CuYtfJs_.js","/assets/Notifications-CA2SYSKr.js","/assets/NotionTasks-p6ZEWM1l.js","/assets/NotionTrackerSettings-DyW65PW_.js","/assets/Ontime-D6Nd1HxT.js","/assets/OrgChart-DNwibiMq.js","/assets/Ovens-DuEAbffi.js","/assets/OvensSettings-D6XnjcaH.js","/assets/Overview-BHG9p4yW.js","/assets/OwnerChip-CfsVeczb.js","/assets/Pagination-B70W9jPi.js","/assets/People-CbElrfwN.js","/assets/PerenaladkaFactTable-D-f8UpUa.js","/assets/Permissions-DTdeCIzI.js","/assets/PersonCard-CXBSrge7.js","/assets/PlanFulfillment-ldMjfTxr.js","/assets/Production-BrnH33zq.js","/assets/ProductionUpload-CYuDkWd7.js","/assets/Profile-BF7HU_oi.js","/assets/ProfileAvatar-DJgHW8rC.js","/assets/ProfilesManagement-C4F0Xmsp.js","/assets/ProofCamera-D136_9dN.js","/assets/ProofPhoto-CwVMdIye.js","/assets/Quality-BRQ1H8OV.js","/assets/RawRows-B28wfQV6.js","/assets/Reports-CRKdSOGh.js","/assets/RequestStateChip-CW5Xi95G.js","/assets/RichTextEditor-D3-eKCMW.js","/assets/SaveState-O3NPVjym.js","/assets/SdPanelSettings-IbqAcNTc.js","/assets/SearchInput-CRjCe0wa.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-D8ixdPiI.js","/assets/ShiftDaily-Dm47hNu7.js","/assets/ShiftTimes-Ddl2NxhQ.js","/assets/SkuHistory-BVPcx9VR.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-BYG8t1kb.js","/assets/StaffListAtCheck-BNBzLaim.js","/assets/StatusBadge-dRBEWRTe.js","/assets/StatusBandsModal-D6aGpxZs.js","/assets/TargetGoal-DiG7cipZ.js","/assets/Targets-DAQsTOA_.js","/assets/TaskFormModal-GWr3CdoG.js","/assets/TaskerSettings-BQqGIVlf.js","/assets/Tasks-uJiPpS2V.js","/assets/TgProfile-CnuQzdou.js","/assets/TimeWheelPicker-U2Waxisy.js","/assets/Tooltip-BZ1bZngG.js","/assets/TranslationsEditor-CawPI0qm.js","/assets/TrelloAnalytics-Cb1Gnle1.js","/assets/TrelloSettings-DZkh9Ppr.js","/assets/TrendChart-DE9qn99h.js","/assets/TripleSpeedometer-K3Lj4kdQ.js","/assets/Trudoyomkost-DBUCkTbT.js","/assets/UploadDropzone-DEfRp9n8.js","/assets/UsersActivity-Did9wedF.js","/assets/UsersManagement--yTXtmGD.js","/assets/VerifixPage-rShR7Ab1.js","/assets/VerifixParity-B00MYnSL.js","/assets/VfxApiMap-DDaQr14M.js","/assets/VfxDictionaries-DxHUVEXj.js","/assets/VfxEmployees-mF02AVFj.js","/assets/VfxHrMoves-D_kRISZ2.js","/assets/VfxJobs-CGI9SRcg.js","/assets/VfxPhoto-C_cr1sCz.js","/assets/VfxShifts-D_DIKxuI.js","/assets/VfxState-DT8ah0le.js","/assets/VfxTimebooks-dqbQ-B6z.js","/assets/VfxTimesheet-D7K2NSym.js","/assets/WatchProgress-FsMIClA2.js","/assets/WebLogin-DPPV_zBQ.js","/assets/WorkersAttendance-DNEDBdNp.js","/assets/WorkersComposition-DhARbNuI.js","/assets/WorkersMovements-CIIDPqop.js","/assets/WorkersPage-CWEt-lFb.js","/assets/Zagruzka-BgS8sMhg.js","/assets/ZagruzkaCell-Bj09Z5qY.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Dm8ToM1_.js","/assets/api-D_IoyhCc.js","/assets/appealTask-BeaKszCY.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BqZNofwK.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-ug5VpBpk.js","/assets/broadcastTree-D8xbLxdW.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-C5qBAg8C.js","/assets/categories-DHa7FOWp.js","/assets/cellMoveRefusal-BW2NoM3Z.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Blg9WYqk.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-CrQRnHYW.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-XEk7widl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CpaM1AoP.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CWc4K5O7.js","/assets/index-db2KIIYJ.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DZmkgx01.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/marks-C1p2mZ9q.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-Bv7ao2Gk.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-B6gFYn9N.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-DGhQ38bs.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BYNVjqTV.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DBIJxhyx.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CBDQUt69.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-DtDZISAf.js","/assets/useMutation-DqiyKhIS.js","/assets/useOpenParam-DWCsPXne.js","/assets/useStatusBands-BSo5IxZN.js","/assets/useUrlScope-DT3uTGks.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-rMPN9hqg.js","/assets/uz_cyrl-CYhVcHmH.js","/assets/vfx-3Uz7QQI9.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-C9kjlIHE.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
