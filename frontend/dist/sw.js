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

const BUILD = "2026-11-21T10:16:13.436Z";
const PRECACHE = ["/","/assets/AdminPage-horX30NZ.js","/assets/AdminTabs-CkxyGV-w.js","/assets/AiKeys-BDrxJfWA.js","/assets/AnalysisBoard-DRzU_MzR.js","/assets/ApiAccess-4S5AmJY2.js","/assets/AppLauncher-DIuxCmG6.js","/assets/Arc-BKXatRvo.js","/assets/Assessment-4PidvfsI.js","/assets/AssessmentGrade-DkSvYY3d.js","/assets/AssessmentList-C5qdstY7.js","/assets/Assistant-CiiQN7Wh.js","/assets/AttendanceCleanup-BRad3vIJ.js","/assets/AttendanceUpload-M0VmA0Ch.js","/assets/AuditTable-CMBcdIDo.js","/assets/Audits-DvhDgjYl.js","/assets/BrigadirProfile-DAqa0tCn.js","/assets/BrigadirsKpi-CKTIOdWG.js","/assets/Broadcast-B3WqGLCd.js","/assets/BroadcastReceivers-BcTY2bCw.js","/assets/BroadcastRecord-0gQOpdr7.js","/assets/CatLockNotice-BH9JF2X3.js","/assets/CategoryLegendModal-DTtr7E8A.js","/assets/CellConcerns-ghMbqW18.js","/assets/CellDetails-DR4uf5zY.js","/assets/CellFormModal-DyT0q8td.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-DAyRpMgV.js","/assets/Cells-BPcDLwj9.js","/assets/ColumnFilter-DenORwIQ.js","/assets/ColumnsPicker-B8m2DXyB.js","/assets/CommentsModal-CgY4Q5-Z.js","/assets/ComparisonTable-QnFFDMPQ.js","/assets/Concerns-B7ylDFV5.js","/assets/ConcernsPieces-DU-RX1Rk.js","/assets/ContainerFlow-mk7DPm_N.js","/assets/ContainerTotalsCard-v-ss_NJx.js","/assets/Containers-C9jiEQR5.js","/assets/CountStepper-BhF6QrhQ.js","/assets/Daily-_E5kRDHQ.js","/assets/DataSources-Dl8zZTNl.js","/assets/DataTable-BYE4f_-j.js","/assets/DateRangePicker-C8unj-6d.js","/assets/DayReportView-Bs5DdGi6.js","/assets/DayStepper-G8SJbTtF.js","/assets/DayStrip-Cxi96X8M.js","/assets/DbBackup-ffNvNnoT.js","/assets/DifferenceBreakdown-DDHiujLx.js","/assets/DocAudit-D8I1oPke.js","/assets/Downtime-Dy4AV8jK.js","/assets/Education-zfSdy9Bq.js","/assets/EducationLesson-DTSq6MMa.js","/assets/EmptyState-7Oo714v3.js","/assets/Equipment-BcLa5UrZ.js","/assets/Exam-AKxPwbeQ.js","/assets/ExamAdmin-DUnOwxqi.js","/assets/Factories-JZRRXC23.js","/assets/FactorySelect-imkMkLEh.js","/assets/Gamification-CEZtWFKx.js","/assets/GroupBadge-BZkrdz7-.js","/assets/HeatmapChart-BE-049p_.js","/assets/HourlyContainers-Bj2UzDky.js","/assets/IdleCell-Tm7Ch4qe.js","/assets/IdleOwners-BeRKKdgY.js","/assets/IdleSolutions-Y6Vm4PZv.js","/assets/KPICard-DAVBMgqk.js","/assets/Kaizen-CYoEuD_i.js","/assets/Kelish-DhKDXt2M.js","/assets/Kitchen-BSxWvoqU.js","/assets/KpiBits-Cbp_M3Ie.js","/assets/KpiDeltaCard-BC_FL8Ix.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-C8ca4SYC.js","/assets/LeaderAppeal-CMqVsYjS.js","/assets/LeaderDailyTasks-D2O4qSqm.js","/assets/LeaderDayReport-DkXo6TI8.js","/assets/LeaderNotCounting-Bluep1No.js","/assets/LeaderTasksAdmin-y2TmFPJm.js","/assets/LeaderUnitReport-Dks5WUtO.js","/assets/Leaderboard-BfiMYvDy.js","/assets/Leaders-BumXOFJr.js","/assets/LeadersKpi-zdxa1tBe.js","/assets/Lightbox-cud-ZeUt.js","/assets/LiveOverview-C0PgX30x.js","/assets/Login-BxeiBKHc.js","/assets/Logs-DmSeX1BO.js","/assets/LostWorkers-CWpBpeSk.js","/assets/NotFound-Df_EIj-7.js","/assets/Notifications-BFwQ4THM.js","/assets/NotionTasks-BS1K9Qd_.js","/assets/NotionTrackerSettings-DGuU-yJO.js","/assets/Ontime-Db4Adebd.js","/assets/OrgChart-CpLYJXD1.js","/assets/Ovens-SXBBld4v.js","/assets/OvensSettings-COeOsaBc.js","/assets/Overview-bwAEd3Y6.js","/assets/OwnerChip-CMHZZnS7.js","/assets/Pagination-DVmuxUHZ.js","/assets/People-Bo22yHMC.js","/assets/PerenaladkaFactTable-DBIyQNLQ.js","/assets/Permissions-C54XVToz.js","/assets/PersonCard-D2l1vqo5.js","/assets/PlanFulfillment-U8u3nZ1p.js","/assets/Production-BjYud_a9.js","/assets/ProductionUpload-B1N8S496.js","/assets/Profile-CpUEiLrC.js","/assets/ProfileAvatar-7W-oGmiD.js","/assets/ProfilesManagement-DE5roYxf.js","/assets/ProofCamera-BFL6PVw2.js","/assets/ProofPhoto-lFn4wSF4.js","/assets/Quality-CTgHzmL5.js","/assets/RawRows-DKXET6tZ.js","/assets/Reports-BpDaI0a7.js","/assets/RequestStateChip-C6R_W98j.js","/assets/RichTextEditor-GhcQ5uiC.js","/assets/SaveState-ByaMx1Tv.js","/assets/SdPanelSettings-D4f8H59B.js","/assets/SearchInput-CKagdkAy.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-Jgy3zePU.js","/assets/ShiftDaily-DGI2-E5N.js","/assets/ShiftTimes-B7TYQ4dg.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-ComyjhaD.js","/assets/StaffListAtCheck-C-65OjTY.js","/assets/StatusBadge-DOSzf4Wx.js","/assets/StatusBandsModal-C259BNOe.js","/assets/TargetGoal-Bm_CdBk5.js","/assets/Targets-C59ROOfn.js","/assets/TaskFormModal-Cqe-NyP2.js","/assets/TaskerSettings-iTsDncd3.js","/assets/Tasks-BC1b3nED.js","/assets/TgProfile-Uv7oO9-X.js","/assets/TimeWheelPicker-BX1-egoO.js","/assets/Tooltip-DGlDkk1e.js","/assets/TranslationsEditor-tGFfDo_U.js","/assets/TrelloAnalytics-9w8FeAw8.js","/assets/TrelloSettings-CO-OlgEi.js","/assets/TrendChart-BtuE6Q60.js","/assets/TripleSpeedometer-CobcVtig.js","/assets/Trudoyomkost-Cv09oOns.js","/assets/UploadDropzone-C89giibG.js","/assets/UsersActivity-D3JBsjqq.js","/assets/UsersManagement-DkEIlGT7.js","/assets/VerifixPage-Ceqhcs2W.js","/assets/VerifixParity-DwqZPVXY.js","/assets/VfxApiMap-CMMZ8552.js","/assets/VfxDictionaries-CrlWUpz1.js","/assets/VfxEmployees-C7nphrE1.js","/assets/VfxHrMoves-DmMlCxj-.js","/assets/VfxJobs-DPw1EzvJ.js","/assets/VfxPhoto-B8FqWagb.js","/assets/VfxShifts-nQ7c5O84.js","/assets/VfxState-CuPap_jn.js","/assets/VfxTimebooks-CHzV6r_y.js","/assets/VfxTimesheet-CO46SEyE.js","/assets/WatchProgress-CweHw92s.js","/assets/WebLogin-DtQbIuuB.js","/assets/WorkersAttendance-BbPI4_DO.js","/assets/WorkersComposition-BM8XztA2.js","/assets/WorkersMovements-DftCNDxJ.js","/assets/WorkersPage-_ogI6Snf.js","/assets/Zagruzka-qzHmfRBt.js","/assets/ZagruzkaCell-Cr4NWQTE.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-B3Pw8cxC.js","/assets/api-D_IoyhCc.js","/assets/appealTask-BumI5Tfk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-COQHU8Eg.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-D19Vap14.js","/assets/broadcastTree-BGsyz1A6.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-CPWkSsaD.js","/assets/categories-BLeW0BjD.js","/assets/cellMoveRefusal-uUTaoRIG.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Nw8LJjfH.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-CeKeSydf.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-C4vEnAKy.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Sl5z0zC1.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BPX0F-G6.js","/assets/index-BfyZo6Cn.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CG7BYMSP.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-CJgLqMew.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-BkXq6pqS.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CFCoNGon.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-Da9oe9QZ.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-DiKRHLHk.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CQVLzbwr.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CgMTAvug.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-BQtutF5b.js","/assets/useMutation-C1E1zcm9.js","/assets/useOpenParam-CBSz_9A7.js","/assets/useStatusBands-BUTowTsb.js","/assets/useUrlScope-Dee3z0OW.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-vS8ExSKX.js","/assets/uz_cyrl-ERHuO1bg.js","/assets/vfx-b9mhzZDt.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-BNNeduod.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
