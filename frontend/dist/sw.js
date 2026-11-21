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

const BUILD = "2026-11-21T09:38:30.576Z";
const PRECACHE = ["/","/assets/AdminPage-DdVOsBdu.js","/assets/AdminTabs-DFVpNPK8.js","/assets/AiKeys-Dwm0uFpD.js","/assets/AnalysisBoard-BHgNHKEG.js","/assets/ApiAccess-jU_QuO9v.js","/assets/AppLauncher-CG2F2YP1.js","/assets/Arc-C41i5Y-H.js","/assets/Assessment-Bee64j5z.js","/assets/AssessmentGrade-Wc3r0CGZ.js","/assets/AssessmentList-BqHApMNO.js","/assets/Assistant-BoQeJbw3.js","/assets/AttendanceCleanup-CLOor4lL.js","/assets/AttendanceUpload-DwQRPbib.js","/assets/AuditTable-DBwlNLj9.js","/assets/Audits-DTLkwMVp.js","/assets/BrigadirProfile-BhlzSWxj.js","/assets/BrigadirsKpi-zp8EueS-.js","/assets/Broadcast-BXy0vATG.js","/assets/BroadcastReceivers-Bhd9dYbK.js","/assets/BroadcastRecord-vcQoSE41.js","/assets/CatLockNotice-ChXDpLa1.js","/assets/CategoryLegendModal-Dy1lRJZa.js","/assets/CellConcerns-C0WXaqt-.js","/assets/CellDetails-DV1tW83h.js","/assets/CellFormModal-CCtLC3yd.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-DxdjiHRF.js","/assets/Cells-C0g6OnJF.js","/assets/ColumnFilter-7CC9cC4Z.js","/assets/ColumnsPicker-D6RAx52q.js","/assets/CommentsModal--eDdnMTc.js","/assets/ComparisonTable-C84rTntw.js","/assets/Concerns-DL5Hdl7_.js","/assets/ConcernsPieces-268tpaBl.js","/assets/ContainerFlow-BlgRqUPM.js","/assets/ContainerTotalsCard-DzByEH3j.js","/assets/Containers-qK-VtSLr.js","/assets/CountStepper-CC4CWMfQ.js","/assets/Daily-D7396BID.js","/assets/DataSources-DR5pRCqH.js","/assets/DataTable-C4tVzvxw.js","/assets/DateRangePicker-DI13mjtc.js","/assets/DayReportView-A2cBdJhF.js","/assets/DayStepper-DT8OsqPy.js","/assets/DayStrip-BDOsu4vB.js","/assets/DbBackup-CSigOfLi.js","/assets/DifferenceBreakdown-UqhhXeyb.js","/assets/DocAudit-CKAZOcGa.js","/assets/Downtime-yE7PsReq.js","/assets/Education-RPpgj-o-.js","/assets/EducationLesson-BSISuVUL.js","/assets/EmptyState-BDPNgRQZ.js","/assets/Equipment-buJWgc-2.js","/assets/Exam-BHRofHDE.js","/assets/ExamAdmin-Dr_lI5zB.js","/assets/Factories-CAULaDg-.js","/assets/FactorySelect-B_IJIJvL.js","/assets/Gamification-CsY4nns-.js","/assets/GroupBadge-DC-CMRhw.js","/assets/HeatmapChart-By3l8V21.js","/assets/HourlyContainers-DFi4xj-p.js","/assets/IdleCell-B6EepouW.js","/assets/IdleOwners-Ba1JfVgN.js","/assets/IdleSolutions-BbStyvTi.js","/assets/KPICard-MI-J-sVz.js","/assets/Kaizen-CrUMWdCL.js","/assets/Kelish-CV7C8sLn.js","/assets/Kitchen-BtMLsSFt.js","/assets/KpiBits-CtbR7IV0.js","/assets/KpiDeltaCard-Cx1VcSX_.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-CvOpK_Zg.js","/assets/LeaderAppeal-BncByTjd.js","/assets/LeaderDailyTasks-CJ4EYbMj.js","/assets/LeaderDayReport-BmGrCHh_.js","/assets/LeaderNotCounting-D3V1uQZT.js","/assets/LeaderTasksAdmin-CbOGIBJI.js","/assets/LeaderUnitReport-Dii-SP2f.js","/assets/Leaderboard-NHPieYxl.js","/assets/Leaders-CRfgqK_a.js","/assets/LeadersKpi-Y5q8VE2d.js","/assets/Lightbox-DfEGS_m1.js","/assets/LiveOverview-CO97PlwA.js","/assets/Login-BUbrdo61.js","/assets/Logs-CHld9UoI.js","/assets/LostWorkers-D4_61cfe.js","/assets/NotFound-CsUv9gU_.js","/assets/Notifications-Cdi_wx6y.js","/assets/NotionTasks-B6vtuPLq.js","/assets/NotionTrackerSettings-CZ9IZC_v.js","/assets/Ontime-Hn2hznV1.js","/assets/OrgChart-DXFswiPm.js","/assets/Ovens-_Ig7_jfe.js","/assets/OvensSettings-C2rkQ7-j.js","/assets/Overview-D1qveWqg.js","/assets/OwnerChip-e8FcZ9Gg.js","/assets/Pagination-Du5kqu3M.js","/assets/People-DW8xpQ_5.js","/assets/PerenaladkaFactTable-aO9zBWDL.js","/assets/Permissions-B28D_bn9.js","/assets/PersonCard-BgpzAZ8f.js","/assets/PlanFulfillment-DLP37wuA.js","/assets/Production-B1n07Ygn.js","/assets/ProductionUpload-C_OqmCE7.js","/assets/Profile-DTPUkfr7.js","/assets/ProfileAvatar-Ckd35kXh.js","/assets/ProfilesManagement-NxhWHnbx.js","/assets/ProofCamera-DGsPIdQm.js","/assets/ProofPhoto-CTSBz-Pw.js","/assets/Quality-euhmDFur.js","/assets/RawRows-DtE8sV5P.js","/assets/Reports-rKUS_EoM.js","/assets/RequestStateChip-BUf6_sPK.js","/assets/RichTextEditor-h0mwkGJF.js","/assets/SaveState-CP7GwV-Y.js","/assets/SdPanelSettings-DBQFIebH.js","/assets/SearchInput-DSKkRQ-l.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-Cm-5DzJ3.js","/assets/ShiftDaily-D2nrbyve.js","/assets/ShiftTimes-Bqm4znvC.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-CIGOi7az.js","/assets/StaffListAtCheck-DRkwtHIx.js","/assets/StatusBadge-CygFcUKi.js","/assets/StatusBandsModal-D2tJ-TzQ.js","/assets/TargetGoal-BGG_sdKK.js","/assets/Targets-BWp57scn.js","/assets/TaskFormModal-C2KDydS-.js","/assets/TaskerSettings-DvaQik68.js","/assets/Tasks-BJo7U-7l.js","/assets/TgProfile-3X_8DoFP.js","/assets/TimeWheelPicker-CchyWf1g.js","/assets/Tooltip-38M2DuZ6.js","/assets/TranslationsEditor-CsZmQGs5.js","/assets/TrelloAnalytics-LDThvNnY.js","/assets/TrelloSettings-lgr-tpZ2.js","/assets/TrendChart-DN8FcrLv.js","/assets/TripleSpeedometer-BSHcZBXH.js","/assets/Trudoyomkost-ClCCMqGB.js","/assets/UploadDropzone-BwObdblH.js","/assets/UsersActivity-dcY36tyC.js","/assets/UsersManagement-Da15j8ER.js","/assets/VerifixPage-DsjTOECX.js","/assets/VerifixParity-mNChti_w.js","/assets/VfxApiMap-BzXJkQ21.js","/assets/VfxDictionaries-DfoDzPOI.js","/assets/VfxEmployees-aluO_CoJ.js","/assets/VfxHrMoves-SIdfFMok.js","/assets/VfxJobs-BA0nyYZA.js","/assets/VfxPhoto-XoJDo1BU.js","/assets/VfxShifts-Q8DRvUjC.js","/assets/VfxState-CVT6ZPa_.js","/assets/VfxTimebooks-CFZuINfH.js","/assets/VfxTimesheet-Co9P5Trq.js","/assets/WatchProgress-DiCk3weU.js","/assets/WebLogin-DvkMx5Pp.js","/assets/WorkersAttendance-B_0ZfEJD.js","/assets/WorkersComposition-CqnJALnf.js","/assets/WorkersMovements-BeUbsFaS.js","/assets/WorkersPage-D_c54O0Q.js","/assets/Zagruzka-CxPHxDoE.js","/assets/ZagruzkaCell-DI3z6r9p.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Daof1oA_.js","/assets/api-D_IoyhCc.js","/assets/appealTask-P9Mv_smK.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BDd3XgP3.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Dk5C69e_.js","/assets/broadcastTree-CxGAAkb-.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-Dl7Afyw6.js","/assets/categories-_fGlu6mz.js","/assets/cellMoveRefusal-C5OiBdSx.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-D_I77ubt.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-CyeyxNe-.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-e8QKbv_T.js","/assets/flowUtil-FALaGqnR.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BqTWG4F9.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Cj72zXAc.js","/assets/index-f5t5ecOf.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-jGD2Aae9.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CGGziqX2.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-CWf35ntB.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-3spkzMGY.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-COP7qUgd.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BdI4ouW6.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-2RddnQ3P.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BhUiIPFU.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-4yzBl1Ux.js","/assets/useMutation-ovgjSSj3.js","/assets/useOpenParam-BoMzCkIv.js","/assets/useStatusBands-Oz_gVEhC.js","/assets/useUrlScope-BlngeC5w.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-Dmnh4U3g.js","/assets/uz_cyrl--gg9guee.js","/assets/vfx-BlHa9Auz.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-DShjaWp4.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
