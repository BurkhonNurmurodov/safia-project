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

const BUILD = "2026-11-26T06:18:40.260Z";
const PRECACHE = ["/","/assets/AdminPage-bSDlKqvT.js","/assets/AdminTabs-Cdb3SCMl.js","/assets/AiKeys-C24RNg56.js","/assets/AnalysisBoard-JWgZwK-N.js","/assets/ApiAccess-KnRjJ1Vl.js","/assets/AppLauncher-Df3uJcWx.js","/assets/Arc-pOAgqk1g.js","/assets/Assessment-gWHGr-UN.js","/assets/AssessmentGrade-lkcUm_iY.js","/assets/AssessmentList-CIXGC4YN.js","/assets/Assistant-1O6w2f1S.js","/assets/AttendanceCleanup-CrPH2LOM.js","/assets/AttendanceUpload-q9E0xojM.js","/assets/AuditTable-GAkvYi7R.js","/assets/Audits-DapI3Qma.js","/assets/BolimsModal-BrceRnA3.js","/assets/BrigadirProfile-Cfm4FMym.js","/assets/BrigadirsKpi-DrYHeKci.js","/assets/Broadcast-0SYX9HAY.js","/assets/BroadcastReceivers-OEWYLOeX.js","/assets/BroadcastRecord-Caa52v30.js","/assets/CatLockNotice-zn8Sl5eH.js","/assets/CategoryLegendModal-DY9zNufD.js","/assets/CellConcerns-5ta-GvOR.js","/assets/CellDetails-D3kgCvLj.js","/assets/CellFormModal-rG02Sf_K.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-DtZZRftM.js","/assets/Cells-BlW-Ggw2.js","/assets/ColumnFilter-DIoHdYqT.js","/assets/ColumnsPicker-Bt4FuaxE.js","/assets/CommentsModal-Dd1brVql.js","/assets/ComparisonTable-BB22D1Ya.js","/assets/Concerns-B4LHhov5.js","/assets/ConcernsPieces-DYgrb5jX.js","/assets/ContainerBolims-Bhp5KT9b.js","/assets/ContainerFlow-uHGGoGk8.js","/assets/ContainerTotalsCard-hnjgd92T.js","/assets/Containers-BPM_jor1.js","/assets/CountStepper-CSbfZS7t.js","/assets/Daily-CGzGiYz1.js","/assets/DataSources-DuNX5AU-.js","/assets/DataTable-B0FctpsJ.js","/assets/DateRangePicker-DvX2DGh2.js","/assets/DayReportView-BbSPwbX7.js","/assets/DayStepper-DKuAVgIo.js","/assets/DayStrip-DHO1cuyA.js","/assets/DbBackup-CNWIgE4j.js","/assets/DifferenceBreakdown-CHqc3YJl.js","/assets/DocAudit-C5BoBqa3.js","/assets/Downtime-B-EhAPLm.js","/assets/Education-DDqwZaf_.js","/assets/EducationLesson-Bx_lXws5.js","/assets/EmptyState-CAclfh9I.js","/assets/Equipment-Dtu-5VEC.js","/assets/Exam-UUvRNJvT.js","/assets/ExamAdmin-BqG9w7Wr.js","/assets/Factories-BUO4Zsdu.js","/assets/FactorySelect-Cow9I0IZ.js","/assets/Gamification-CQBOUSYB.js","/assets/GroupBadge-S4yO_dTa.js","/assets/HeatmapChart-GeIMcSru.js","/assets/HourlyContainers-DRQ5KjjG.js","/assets/IdleCell-B4Iod550.js","/assets/IdleOwners-BrZxHXY9.js","/assets/IdleSolutions-CyeL-8nY.js","/assets/KPICard-C9T7eRDd.js","/assets/Kaizen-CqVGlSRW.js","/assets/Kelish-BvdMET9i.js","/assets/Kitchen-FmrRckBb.js","/assets/KpiBits-Dmao53KF.js","/assets/KpiDeltaCard-K_UWrpV1.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-tu6-DLg5.js","/assets/LeaderAppeal-DmQxtEAj.js","/assets/LeaderDailyTasks-6txFM_al.js","/assets/LeaderDayReport-BTqlRPIN.js","/assets/LeaderNotCounting-DitcX3lf.js","/assets/LeaderTasksAdmin-DE0TiYiS.js","/assets/LeaderUnitReport-BhxQwMOp.js","/assets/Leaderboard-BHj1CDax.js","/assets/Leaders-CsNoy5US.js","/assets/LeadersKpi-CpBNKv54.js","/assets/Lightbox-L-M8zLui.js","/assets/LiveOverview-CaTvtF9c.js","/assets/Login-BIWUvs8p.js","/assets/Logs-CypJv5VX.js","/assets/LostWorkers-BOsdj0kf.js","/assets/NotFound-BcW0mUpl.js","/assets/Notifications-cK8U8Wbf.js","/assets/NotionTasks-zg8mgHHc.js","/assets/NotionTrackerSettings-BDXkKjtz.js","/assets/Ontime-D_kfcIog.js","/assets/OrgChart-CMUnnn_B.js","/assets/Ovens-BKqvu2fi.js","/assets/OvensSettings-ClRhx384.js","/assets/Overview-DKxpqhOM.js","/assets/OwnerChip-Dx0bRaHR.js","/assets/Pagination-XkmvoUe7.js","/assets/People-D8RqZv0Z.js","/assets/PerenaladkaFactTable-Dt2bCU0K.js","/assets/Permissions-C47qNlLB.js","/assets/PersonCard-BuS_5Xoj.js","/assets/PlanFulfillment-D2Sh62jG.js","/assets/Production-BMhZduIu.js","/assets/ProductionUpload-BBa2G2m4.js","/assets/Profile-BwysvUMw.js","/assets/ProfileAvatar--awOiN96.js","/assets/ProfilesManagement-ChfG4b8x.js","/assets/ProofCamera-0Z6HP_96.js","/assets/ProofPhoto-CUzSHG4j.js","/assets/Quality-BaMwqB4H.js","/assets/RawRows-B-FNMvPq.js","/assets/Reports-B-5YVg_Q.js","/assets/RequestStateChip-d3bvFHXf.js","/assets/RichTextEditor-D2-EEHJB.js","/assets/SaveState-eyx-KHjU.js","/assets/SdPanelSettings-8XUd0jg8.js","/assets/SearchInput-BBRwKVMI.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-Dgi6z1oW.js","/assets/ShiftDaily-DxQ2cI6A.js","/assets/ShiftTimes-BkKmw3Lo.js","/assets/SkuHistory-BThLuXqi.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-CcOBiSc0.js","/assets/StaffListAtCheck-BOL9R4DD.js","/assets/StatusBadge-DR0nAZxD.js","/assets/StatusBandsModal-CPbDmxxu.js","/assets/TargetGoal-CmxSrbl4.js","/assets/Targets-CwwxigfD.js","/assets/TaskFormModal-Bq0_L_wz.js","/assets/TaskerSettings-CUNUCrpC.js","/assets/Tasks-9lmjJSvC.js","/assets/TgProfile-DSCWMw0e.js","/assets/TimeWheelPicker-DpfA-9Ej.js","/assets/Tooltip-Bj34WP7H.js","/assets/TranslationsEditor-CcnCMDYe.js","/assets/TrelloAnalytics-CSDKCwxJ.js","/assets/TrelloSettings-f-r9V5XM.js","/assets/TrendChart-cRdUH-uq.js","/assets/TripleSpeedometer-DK3Fzr6F.js","/assets/Trudoyomkost-DbGlPGdT.js","/assets/UploadDropzone-D4owrl2h.js","/assets/UsersActivity-DYVUk7Us.js","/assets/UsersManagement-MeSUFXI4.js","/assets/VerifixPage-DUrls6DH.js","/assets/VerifixParity-Dag7WfSs.js","/assets/VfxApiMap-BsBx4sh1.js","/assets/VfxDictionaries-B8zJKN_Z.js","/assets/VfxEmployees-ZpbucD4c.js","/assets/VfxHrMoves-CooSl0ts.js","/assets/VfxJobs-CU3W5EBL.js","/assets/VfxPhoto-CQZsaJsY.js","/assets/VfxShifts-BqboMn5i.js","/assets/VfxState-CX2denk4.js","/assets/VfxTimebooks-aam7wIAT.js","/assets/VfxTimesheet-B7_YEXMB.js","/assets/WatchProgress-Bhhhsacu.js","/assets/WebLogin-BbLWY55Y.js","/assets/WorkersAttendance-Bsas1vS4.js","/assets/WorkersComposition-B3_XH94q.js","/assets/WorkersMovements-BrXRFZNE.js","/assets/WorkersPage-BwH3LEjY.js","/assets/Zagruzka-CJrJGekm.js","/assets/ZagruzkaCell-C7NYo2AX.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CH2sUy63.js","/assets/api-D_IoyhCc.js","/assets/appealTask-CIMD9JeG.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-TAVpY9U4.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-D8INbOu1.js","/assets/broadcastTree-Jy63_QQl.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-DEQkt6Hh.js","/assets/categories-DpxR2Fun.js","/assets/cellMoveRefusal-Q2G_OUvZ.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-A91vdBCL.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-CrQRnHYW.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-BCfq4kX8.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-B1JU-vd3.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CNehiFZB.js","/assets/index-DVB0Dg__.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DHK643Pe.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/marks-Ddol0-Ua.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-CgtnriC4.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-eRJc502A.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-DGhQ38bs.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-Bh_kenJe.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DBIJxhyx.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BBLhcLAe.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-BpRquTBA.js","/assets/useMutation-CaeY384l.js","/assets/useOpenParam-WD5Oy4dz.js","/assets/useStatusBands-CVwGOgQw.js","/assets/useUrlScope-ZzrbLtae.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-rMPN9hqg.js","/assets/uz_cyrl-CYhVcHmH.js","/assets/vfx-C3-bA-4_.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-CA_xTZZM.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
