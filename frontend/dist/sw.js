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

const BUILD = "2026-11-23T11:01:15.351Z";
const PRECACHE = ["/","/assets/AdminPage-B3f8clQI.js","/assets/AdminTabs-HrC5yCa8.js","/assets/AiKeys-DXf8z0iw.js","/assets/AnalysisBoard-DGO44YG2.js","/assets/ApiAccess-ChxsXjxP.js","/assets/AppLauncher-KlC9-I_E.js","/assets/Arc-DRCGV9eX.js","/assets/Assessment-BT1NeDB7.js","/assets/AssessmentGrade-D4GHMQmR.js","/assets/AssessmentList-vY0VQnLI.js","/assets/Assistant-DjzxAdrW.js","/assets/AttendanceCleanup-B8UlTETy.js","/assets/AttendanceUpload-uUgfdbhg.js","/assets/AuditTable-3SbsBGcc.js","/assets/Audits-2HtT0o-0.js","/assets/BrigadirProfile-CSeFesdI.js","/assets/BrigadirsKpi-v1zKdtaz.js","/assets/Broadcast-D9uZnfSs.js","/assets/BroadcastReceivers-C1K4X8Jo.js","/assets/BroadcastRecord-CdgMzF34.js","/assets/CatLockNotice-BjAI_qzM.js","/assets/CategoryLegendModal-CcfE1Yv0.js","/assets/CellConcerns-CoKarEdO.js","/assets/CellDetails-GAa9hzPA.js","/assets/CellFormModal-DDGRc42b.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-CJUGNr5u.js","/assets/Cells-A1yTsWzi.js","/assets/ColumnFilter-BxCigbpp.js","/assets/ColumnsPicker-xcItKoWh.js","/assets/CommentsModal-BGmv15x9.js","/assets/ComparisonTable-CFMsPhMZ.js","/assets/Concerns-DPN79qt5.js","/assets/ConcernsPieces-CNtP2dAO.js","/assets/ContainerFlow-vEy55thB.js","/assets/ContainerTotalsCard-BycMS24t.js","/assets/Containers-CRcy6ipY.js","/assets/CountStepper-Bm-8EkyK.js","/assets/Daily-Dy60v1b2.js","/assets/DataSources-FoTgNc_0.js","/assets/DataTable-DMrOVGiG.js","/assets/DateRangePicker-D0I3neMy.js","/assets/DayReportView-CNK3P50A.js","/assets/DayStepper-CT5EXT4R.js","/assets/DayStrip-B_PuYBCG.js","/assets/DbBackup-DaTjE5md.js","/assets/DifferenceBreakdown-BNAj7-P3.js","/assets/DocAudit-DCGMYv3E.js","/assets/Downtime-Zy3Jd8Mp.js","/assets/Education-CJqgD6IS.js","/assets/EducationLesson-BmfAJoqh.js","/assets/EmptyState-BdE0KpQY.js","/assets/Equipment-DKbThZue.js","/assets/Exam-B0Rk0S7x.js","/assets/ExamAdmin-DOvgvxVl.js","/assets/Factories-MpWcCYMO.js","/assets/FactorySelect-CkwkYSzC.js","/assets/Gamification-Dy_kcqz6.js","/assets/GroupBadge-DKba7SCD.js","/assets/HeatmapChart-qTjHreiB.js","/assets/HourlyContainers-DpcMOgpZ.js","/assets/IdleCell-DA_uD_O-.js","/assets/IdleOwners-C2AXVZJf.js","/assets/IdleSolutions-DhnjiBOZ.js","/assets/KPICard-N9ogKRCZ.js","/assets/Kaizen-D0FAxZ7g.js","/assets/Kelish-o1pSkYqR.js","/assets/Kitchen-DO-oXQz6.js","/assets/KpiBits-Bb3MXq8f.js","/assets/KpiDeltaCard-DzC-gORK.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-tsP-QY_W.js","/assets/LeaderAppeal-D_VzE7qA.js","/assets/LeaderDailyTasks-CgpdRDw8.js","/assets/LeaderDayReport-Cad_pKAG.js","/assets/LeaderNotCounting-Ch4R_RtD.js","/assets/LeaderTasksAdmin-CnkG-jlS.js","/assets/LeaderUnitReport-D86GjoTT.js","/assets/Leaderboard-D-4TtT-O.js","/assets/Leaders-Co3QoY6j.js","/assets/LeadersKpi-DzeJ9nxB.js","/assets/Lightbox-CWK0PiAE.js","/assets/LiveOverview-CsAZn5b6.js","/assets/Login-nKIZnWbO.js","/assets/Logs-C5_N9c9x.js","/assets/LostWorkers-Dpv2qvuC.js","/assets/NotFound-BV8TbFA2.js","/assets/Notifications-DgdzlE-x.js","/assets/NotionTasks-YktUh5yb.js","/assets/NotionTrackerSettings-0QzA556u.js","/assets/Ontime-RWuA_t6D.js","/assets/OrgChart-DP31zY2P.js","/assets/Ovens-DyCZM5Am.js","/assets/OvensSettings-CYgZsWFd.js","/assets/Overview-DaRWfNqO.js","/assets/OwnerChip-FdLwR48_.js","/assets/Pagination-zpaMUugM.js","/assets/People-Dfty7vhX.js","/assets/PerenaladkaFactTable-wKfDX8iN.js","/assets/Permissions-CFuudi2o.js","/assets/PersonCard-Bc3xdeVi.js","/assets/PlanFulfillment-OYlEslPg.js","/assets/Production-BGIyauMg.js","/assets/ProductionUpload-DKDL1t1u.js","/assets/Profile-BuEtMzmB.js","/assets/ProfileAvatar-BxRB4rOj.js","/assets/ProfilesManagement-BfbFMFXY.js","/assets/ProofCamera-3dr0bNmF.js","/assets/ProofPhoto-D-hDx5A7.js","/assets/Quality-D1_Tz4B9.js","/assets/RawRows-GUoo1MFS.js","/assets/Reports-DW11NE7o.js","/assets/RequestStateChip-Bf7vXJ6q.js","/assets/RichTextEditor-Cb1m7UbI.js","/assets/SaveState-Bzr_sAHa.js","/assets/SdPanelSettings-CbwLIt-x.js","/assets/SearchInput-CSQ7Bopq.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-DsohJVOi.js","/assets/ShiftDaily-BcdsnATL.js","/assets/ShiftTimes-DpUEdayX.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-BJYqOneY.js","/assets/StaffListAtCheck-CYiveGhy.js","/assets/StatusBadge-BcbAi7oi.js","/assets/StatusBandsModal-ukAQw0Kb.js","/assets/TargetGoal-DmuAkoO3.js","/assets/Targets-w93jYWxK.js","/assets/TaskFormModal-RlJo0C-3.js","/assets/TaskerSettings-BSar7oV3.js","/assets/Tasks-BcsYht5O.js","/assets/TgProfile-TwtgMfii.js","/assets/TimeWheelPicker-Btpx4V7p.js","/assets/Tooltip-D9cwiPPj.js","/assets/TranslationsEditor-CXoxKKPi.js","/assets/TrelloAnalytics-Ct7VFBnN.js","/assets/TrelloSettings-BnUOLTiO.js","/assets/TrendChart-BHfYQBY2.js","/assets/TripleSpeedometer-LfTQLjJx.js","/assets/Trudoyomkost-B2jLKTQh.js","/assets/UploadDropzone-OLzQrrlB.js","/assets/UsersActivity-zcsMa1zY.js","/assets/UsersManagement-NtGJfQwA.js","/assets/VerifixPage-DqXzaquc.js","/assets/VerifixParity-CkSKGahP.js","/assets/VfxApiMap-CgV5mYk1.js","/assets/VfxDictionaries-7f2ibpG1.js","/assets/VfxEmployees-C5mSG791.js","/assets/VfxHrMoves-DcrzEtuk.js","/assets/VfxJobs-BmGThI5s.js","/assets/VfxPhoto-CIX6CTE9.js","/assets/VfxShifts-CxbvjP1T.js","/assets/VfxState-eNQXvRD6.js","/assets/VfxTimebooks-ZaheXNkB.js","/assets/VfxTimesheet-DAuYbBKl.js","/assets/WatchProgress-_JX_NHv8.js","/assets/WebLogin-Bn-hGhVW.js","/assets/WorkersAttendance-DG0rDPCq.js","/assets/WorkersComposition-DZA2SWll.js","/assets/WorkersMovements-DzCdxdyW.js","/assets/WorkersPage-BIaTA2BI.js","/assets/Zagruzka-CGIB4_Cf.js","/assets/ZagruzkaCell-B2KTICgh.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DFStZBHB.js","/assets/api-D_IoyhCc.js","/assets/appealTask-CLTqNm6e.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-FGYxsK5J.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-D10REFc8.js","/assets/broadcastTree-dTG0_aN0.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-CnMe-2Hl.js","/assets/categories-CZoeONxg.js","/assets/cellMoveRefusal-DCyN0zY8.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-C8FFqe5W.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en--90liF4e.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-DH489Lyn.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Cuejn7h9.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DOoyy-bQ.css","/assets/index-eisnyCya.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-C5jspWcq.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-D3czcGGZ.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-lFA7TtHE.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-C6QmNAM2.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-BjMWuZkR.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-DpeDAfAb.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-gUuHZrlo.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Dcqw15NF.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-B71aMRlF.js","/assets/useMutation-Bo3mIlkQ.js","/assets/useOpenParam-D4yWqdeE.js","/assets/useStatusBands-D9MpxS0U.js","/assets/useUrlScope-IjVfjyh9.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-CtG2Na-H.js","/assets/uz_cyrl-6E50V38S.js","/assets/vfx-DWN4XMhA.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-DRSGkzWu.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
