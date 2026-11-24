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

const BUILD = "2026-11-24T06:45:27.981Z";
const PRECACHE = ["/","/assets/AdminPage-DWlDwM0y.js","/assets/AdminTabs-BGBcH5aZ.js","/assets/AiKeys-BGf7CPVd.js","/assets/AnalysisBoard-BgLxRHBj.js","/assets/ApiAccess-neg2vltd.js","/assets/AppLauncher-DR17rv01.js","/assets/Arc-D5MTJ9oq.js","/assets/Assessment-CX5f7fJq.js","/assets/AssessmentGrade-CZTPAmnQ.js","/assets/AssessmentList-CtWdPkfC.js","/assets/Assistant-C4rLh2vn.js","/assets/AttendanceCleanup-ZLxsHZBS.js","/assets/AttendanceUpload-C8ERvjq3.js","/assets/AuditTable-TJJ3wJlk.js","/assets/Audits-D_fsvxdG.js","/assets/BolimsModal-m91HtpHU.js","/assets/BrigadirProfile-DB1r0fAQ.js","/assets/BrigadirsKpi-2x_55BPA.js","/assets/Broadcast-rLfS9ReF.js","/assets/BroadcastReceivers-DbhbUUQV.js","/assets/BroadcastRecord-a7jYI1LX.js","/assets/CatLockNotice-BUw0DUfI.js","/assets/CategoryLegendModal-CT4oJ8M0.js","/assets/CellConcerns-B-heUnDk.js","/assets/CellDetails-BNPjH0xR.js","/assets/CellFormModal-M1x3T4UX.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-DnRpmQ0q.js","/assets/Cells-BfKev55E.js","/assets/ColumnFilter-BnVM12uX.js","/assets/ColumnsPicker-CZO9OvMJ.js","/assets/CommentsModal-tTKkpclQ.js","/assets/ComparisonTable-DJiol44Z.js","/assets/Concerns-DfUIvlw7.js","/assets/ConcernsPieces-DaKznPak.js","/assets/ContainerBolims-DlmPn2kw.js","/assets/ContainerFlow-BTw_chRV.js","/assets/ContainerTotalsCard-Cg9GW8kS.js","/assets/Containers-BtJO6uto.js","/assets/CountStepper-1rFhQB7Y.js","/assets/Daily-C5LD0VwB.js","/assets/DataSources-y6P1HnuN.js","/assets/DataTable-Clow7qlt.js","/assets/DateRangePicker-BJgKVDRm.js","/assets/DayReportView-CBC7Chqy.js","/assets/DayStepper-5RandAfL.js","/assets/DayStrip-DgY9DhqK.js","/assets/DbBackup-yteD5Mse.js","/assets/DifferenceBreakdown-DzkE3wSb.js","/assets/DocAudit-DTTMzHK1.js","/assets/Downtime-Cni2ps2-.js","/assets/Education-BDO9ugbc.js","/assets/EducationLesson-Db8XHLVL.js","/assets/EmptyState-CeMxTuB4.js","/assets/Equipment-DVa82Itn.js","/assets/Exam-BL4WtO8H.js","/assets/ExamAdmin-Do0QvG2L.js","/assets/Factories-CD5KUexq.js","/assets/FactorySelect-DLuVj6sd.js","/assets/Gamification-CYcPkQll.js","/assets/GroupBadge-CcBzjN1w.js","/assets/HeatmapChart-D5mYw4Hx.js","/assets/HourlyContainers-CAPguIHb.js","/assets/IdleCell-CQp2bTiR.js","/assets/IdleOwners-D97_8RkU.js","/assets/IdleSolutions-CBvRosIf.js","/assets/KPICard-DG-23wLI.js","/assets/Kaizen-DMzJGmmi.js","/assets/Kelish-BD2n5b42.js","/assets/Kitchen-BfT8jZw4.js","/assets/KpiBits-CVKDkgCS.js","/assets/KpiDeltaCard-DYGEZqJc.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-DACbISFp.js","/assets/LeaderAppeal-C36rEz5l.js","/assets/LeaderDailyTasks-DjNsasJZ.js","/assets/LeaderDayReport-CLFiWpBg.js","/assets/LeaderNotCounting-WV35hQUC.js","/assets/LeaderTasksAdmin-R_bMkBB2.js","/assets/LeaderUnitReport-BfCHXYQl.js","/assets/Leaderboard-DLX-lde3.js","/assets/Leaders-DtcPq9ha.js","/assets/LeadersKpi-DpjoI4g8.js","/assets/Lightbox-DFiF73GV.js","/assets/LiveOverview-kIFyllQn.js","/assets/Login-CcEz-xgw.js","/assets/Logs-COlBAsl9.js","/assets/LostWorkers-BTQy1vs7.js","/assets/NotFound-DW8SpR6Z.js","/assets/Notifications-BkCCAobE.js","/assets/NotionTasks-B83n9rQD.js","/assets/NotionTrackerSettings-cFMbPt_5.js","/assets/Ontime-CfqrBeyQ.js","/assets/OrgChart-DpUGD7oo.js","/assets/Ovens-BOmcCGJu.js","/assets/OvensSettings-BaqlXpz-.js","/assets/Overview-DC4m3-FH.js","/assets/OwnerChip-CPpZrn5M.js","/assets/Pagination-CJd3ENmu.js","/assets/People-B3-LJMWI.js","/assets/PerenaladkaFactTable-B2I4gAG9.js","/assets/Permissions-CBTI-_-B.js","/assets/PersonCard-ebKdSzvY.js","/assets/PlanFulfillment-7njeXSZn.js","/assets/Production-DmgiJnZS.js","/assets/ProductionUpload-bX9LIDHW.js","/assets/Profile-DaI7MahG.js","/assets/ProfileAvatar-CV2B6F79.js","/assets/ProfilesManagement-BmlIX20f.js","/assets/ProofCamera-Dp_t-Dbf.js","/assets/ProofPhoto-DjXe5C_f.js","/assets/Quality-B0xr9ToI.js","/assets/RawRows-CKn6kEpa.js","/assets/Reports-DyCpwrcc.js","/assets/RequestStateChip-4d7mCdf4.js","/assets/RichTextEditor-Bi5mDix3.js","/assets/SaveState-DduX9Ui5.js","/assets/SdPanelSettings-Hxr3cxw8.js","/assets/SearchInput-cFzx6gRo.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-CcMNskVn.js","/assets/ShiftDaily-Cy2hpEZA.js","/assets/ShiftTimes-6c2FF6GC.js","/assets/SkuHistory-BLzzKxim.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-DMQjEn0t.js","/assets/StaffListAtCheck-D86bqkU2.js","/assets/StatusBadge-CpAIVY5_.js","/assets/StatusBandsModal-ChprdVvN.js","/assets/TargetGoal-CcmXiE8f.js","/assets/Targets-rHqcKNV_.js","/assets/TaskFormModal-DxDfueRj.js","/assets/TaskerSettings-BXS9g3k4.js","/assets/Tasks-CpXh13jf.js","/assets/TgProfile-g8z-_k_p.js","/assets/TimeWheelPicker-DV4SU00_.js","/assets/Tooltip-YsqXTfkt.js","/assets/TranslationsEditor-BigEPvCg.js","/assets/TrelloAnalytics-9hL3CuNR.js","/assets/TrelloSettings-DTXzSoM5.js","/assets/TrendChart-drDPruY8.js","/assets/TripleSpeedometer-CMvEY0Lm.js","/assets/Trudoyomkost-B_u9uSWM.js","/assets/UploadDropzone-C9vOSUXW.js","/assets/UsersActivity-CSM63gd0.js","/assets/UsersManagement-B3poeIWZ.js","/assets/VerifixPage-DoZBhPEG.js","/assets/VerifixParity-C1cEdWoi.js","/assets/VfxApiMap-DHATk19G.js","/assets/VfxDictionaries-Z_dgLNAv.js","/assets/VfxEmployees-BlYp9xmE.js","/assets/VfxHrMoves-DQqpe_AI.js","/assets/VfxJobs-DKhXlMO7.js","/assets/VfxPhoto-D_5MDlvr.js","/assets/VfxShifts-B8kAyH-9.js","/assets/VfxState-BeISC58H.js","/assets/VfxTimebooks-Ca3xN5Oc.js","/assets/VfxTimesheet-DPGsUGLk.js","/assets/WatchProgress-UnKUfa4I.js","/assets/WebLogin-BruKQmbg.js","/assets/WorkersAttendance-CYiRB2wp.js","/assets/WorkersComposition-DhlJKJfG.js","/assets/WorkersMovements-DAKyo1JY.js","/assets/WorkersPage-C5hDoDhL.js","/assets/Zagruzka-BD56XDdl.js","/assets/ZagruzkaCell-Bkay0G2j.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Bk7kJJDM.js","/assets/api-D_IoyhCc.js","/assets/appealTask-CYyZDVSe.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-D8ROCc1u.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Ck9D5oDN.js","/assets/broadcastTree-BtcSeQZ-.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-iJJCEdS0.js","/assets/categories-CoQf1rSJ.js","/assets/cellMoveRefusal-9nvH-MuK.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Bk3ihVNX.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-CrQRnHYW.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-BgzcoIkw.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-N_U9hsPq.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Df3g8Dme.css","/assets/index-Dy6vpgBb.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CMrnZv4Z.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/marks-xg_GUaHJ.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-BdREBiIF.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-U1eA-nYJ.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-DGhQ38bs.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-D2xcD4WR.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DBIJxhyx.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Dk-aoiGl.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-Cl1k_FMk.js","/assets/useMutation-CHriB111.js","/assets/useOpenParam-DT-z9G_B.js","/assets/useStatusBands-C7y97F9d.js","/assets/useUrlScope-CeP3f5as.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-rMPN9hqg.js","/assets/uz_cyrl-CYhVcHmH.js","/assets/vfx-jhJ8RHoN.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-Drc4x1bp.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
