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

const BUILD = "2026-11-17T10:06:07.973Z";
const PRECACHE = ["/","/assets/ActionMenu-DIjho2bj.js","/assets/AdminPage-5PLxAjM8.js","/assets/AdminTabs-BduztZVx.js","/assets/AiKeys-BpHY0riH.js","/assets/AnalysisBoard-C1Dyue5X.js","/assets/ApiAccess-DD5LXrHf.js","/assets/AppLauncher-CNXv2N2H.js","/assets/Arc-BvsVSw_h.js","/assets/Assessment-CgcoEwv6.js","/assets/AssessmentGrade-B4hQhafh.js","/assets/AssessmentList-4vKz_Sk2.js","/assets/Assistant-9W8-Yl4i.js","/assets/AttendanceCleanup-BoHesPk7.js","/assets/AttendanceUpload-DbgL6zzz.js","/assets/AuditTable-DYxetZsC.js","/assets/BrigadirProfile-CeMH2Rlw.js","/assets/BrigadirsKpi-DK4pF0nw.js","/assets/Broadcast-DOy9Nh2I.js","/assets/BroadcastReceivers-CE3NaDHg.js","/assets/BroadcastRecord-Bm8T6TV4.js","/assets/Button-BByRB7Le.js","/assets/CatLockNotice-BnjxwTBZ.js","/assets/CategoryLegendModal-DvcRjcsV.js","/assets/CellConcerns-BrPZOaot.js","/assets/CellDetails-DYrbCfQb.js","/assets/CellFormModal-DR6EfpX4.js","/assets/CellIdent-DE6qkdqd.js","/assets/CellLink-a--I7yoV.js","/assets/Cells-9kqt0cpb.js","/assets/ColumnFilter-CpN7zNXA.js","/assets/ColumnsPicker-4B0dZFvr.js","/assets/CommentsModal-VFuQ57MU.js","/assets/ComparisonTable-DwlQ98vy.js","/assets/Concerns-D31RK8xs.js","/assets/ConcernsPieces-BOkDawup.js","/assets/ContainerFlow-C7seLChm.js","/assets/ContainerTotalsCard-TGZ7C36M.js","/assets/Containers-TZAcxYgm.js","/assets/CountStepper-CxZ265Xe.js","/assets/Daily-CPZVDEr2.js","/assets/DataSources-DWcFGDx-.js","/assets/DataTable-cF-uCZ5Z.js","/assets/DateRangePicker-C3_pTceE.js","/assets/DayReportView-BytSt_Np.js","/assets/DayStepper-Ca1CuBpG.js","/assets/DayStrip-hwSzLdem.js","/assets/DbBackup-D8zPHihd.js","/assets/DifferenceBreakdown-DE1D3M2S.js","/assets/DocAudit-CkNW-54q.js","/assets/Downtime-CJ1REhE3.js","/assets/Education-BhQs4lDg.js","/assets/EducationLesson-B-IMm_gn.js","/assets/EmptyState-DK5wkHs1.js","/assets/Equipment-CcRnN1Me.js","/assets/Exam-D5l0Ujsa.js","/assets/ExamAdmin-DtB0Ed5r.js","/assets/Factories-D-BzgawZ.js","/assets/FactorySelect-MIxw4Tp2.js","/assets/Gamification-Ckv-qOVF.js","/assets/GroupBadge-CmkZu86w.js","/assets/HeatmapChart-Byoi9fnt.js","/assets/HourlyContainers-BH5DGV99.js","/assets/IdleCell-BGi3cbuH.js","/assets/IdleOwners-C73AIkfZ.js","/assets/IdleSolutions-Db9jW__H.js","/assets/KPICard-Cw5WW5n_.js","/assets/Kaizen-WdS0rD8U.js","/assets/Kelish-Dh51B8Y_.js","/assets/Kitchen-ChEvQXMt.js","/assets/KpiBits-Deoha25n.js","/assets/KpiDeltaCard-BI4LonI-.js","/assets/LangContext-2A4sPKlL.js","/assets/LangTextInput-Kofaohjz.js","/assets/Layout-Cbvc1bwy.js","/assets/LeaderAppeal-B-mELxpX.js","/assets/LeaderDailyTasks-Cg0lK2tc.js","/assets/LeaderDayReport-BapDBdhk.js","/assets/LeaderNotCounting-CUNAK7eX.js","/assets/LeaderTasksAdmin-B_617Rcl.js","/assets/LeaderUnitReport-D9zWM2gc.js","/assets/Leaderboard-BBciXPzH.js","/assets/Leaders-D6nu1z7C.js","/assets/LeadersKpi-DMs6_6I6.js","/assets/Lightbox--W_XKy1M.js","/assets/LiveOverview-Dn1Ve0nD.js","/assets/Login-DTaHsuOP.js","/assets/Logs-CU8gE6LM.js","/assets/LostWorkers-D8hQ_4BF.js","/assets/Meter-CRRHrYuq.js","/assets/NotFound-CvZRPCTA.js","/assets/Notifications-Bzz7Q-eo.js","/assets/NotionTasks-CLnekhLG.js","/assets/NotionTrackerSettings-_RzX96Q1.js","/assets/Ontime-CTk3OpmW.js","/assets/OrgChart-CHHsPq20.js","/assets/Ovens-DhC1Sw02.js","/assets/OvensSettings-DWnElp6f.js","/assets/Overview-zu6CC5fb.js","/assets/OwnerChip-CyPRIckH.js","/assets/Pagination-D0OIHeYT.js","/assets/People-C-Tvu6I3.js","/assets/PerenaladkaFactTable-mHZbCN1d.js","/assets/Permissions-kkwOms6x.js","/assets/PersonCard-BMwsnJVA.js","/assets/PlanFulfillment-B-zSk0kY.js","/assets/Production-DLgUC4sl.js","/assets/ProductionUpload-DOOepb4m.js","/assets/Profile-CodAD1CF.js","/assets/ProfileAvatar-I8h2lXHV.js","/assets/ProfilesManagement-DPMFno3O.js","/assets/ProofCamera-D3C8zFs5.js","/assets/ProofPhoto-D2nj04so.js","/assets/Quality-D3Y540EZ.js","/assets/RawRows-DRz1yJK4.js","/assets/Reports-BVvYvrxG.js","/assets/RequestStateChip-BXjPdaSj.js","/assets/RichTextEditor-CS5vTeXU.js","/assets/SaveState-Bj-JE63A.js","/assets/SdPanelSettings-CqgwCPHs.js","/assets/SearchInput-D84MV7id.js","/assets/SeasonalityHeatmap-B65j5wfW.js","/assets/SegmentedToggle-CIxWlaZZ.js","/assets/SetupTimes-BpnoC86N.js","/assets/ShiftDaily-B40gI2aS.js","/assets/ShiftTimes-CDfUIVEI.js","/assets/SortableList-DgrUPWKx.js","/assets/Staff-Ce7M8lQu.js","/assets/StaffListAtCheck-C8PRrBCt.js","/assets/StatusBadge-ExCIYJaN.js","/assets/StatusBandsModal-DbnPku2c.js","/assets/TargetGoal-CHcCt6P9.js","/assets/Targets-Szx23YYL.js","/assets/TaskFormModal-Dvb4bCe1.js","/assets/TaskerSettings-DRYWy_id.js","/assets/Tasks-nkxF35zU.js","/assets/TgProfile-BADKU7Lh.js","/assets/TimeWheelPicker-CYs2AQgd.js","/assets/Toast-DLkPq-u6.js","/assets/Tooltip-Cd0j8XOq.js","/assets/TranslationsEditor-GVZ7Cksd.js","/assets/TrelloAnalytics-BmFUfL6Q.js","/assets/TrelloSettings-BQZpT6YM.js","/assets/TrendChart-BU2XYNHg.js","/assets/TripleSpeedometer-DCN4y4-p.js","/assets/Trudoyomkost-iDmN6fXS.js","/assets/UploadDropzone-Ckl6lJR3.js","/assets/UsersActivity-Bis8ilQl.js","/assets/UsersManagement-DHtDlv2W.js","/assets/VerdictBlock-DnDsl38q.js","/assets/VerifixPage-B5Z5hvVd.js","/assets/VerifixParity-CGeNbpyv.js","/assets/VfxApiMap-Cr6pP6-q.js","/assets/VfxDictionaries-DRDChAZC.js","/assets/VfxEmployees-DBGMFH9a.js","/assets/VfxHrMoves-SdmI9v4v.js","/assets/VfxJobs-CHGF7_Ai.js","/assets/VfxPhoto-ILH8Mt_W.js","/assets/VfxShifts-bKkDiJ5f.js","/assets/VfxState-BlxSvWN3.js","/assets/VfxTimebooks-CsAMwBnD.js","/assets/VfxTimesheet-F3CulA0T.js","/assets/WatchProgress-ChxlFmtk.js","/assets/WebLogin-Bij4Qrab.js","/assets/WorkersAttendance-B3WvImYM.js","/assets/WorkersComposition-E-r8mqrs.js","/assets/WorkersMovements-Dcm7LkkG.js","/assets/WorkersPage-BM6e_GBi.js","/assets/Zagruzka-D0mKk5Jn.js","/assets/ZagruzkaCell-BZgA3qJU.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CcMv_29J.js","/assets/api-C584gVZ4.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-F_XWTIQU.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-lguN18sc.js","/assets/broadcastTree-DO7UbL3s.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-snosWLyc.js","/assets/cellMoveRefusal-7NKzjhll.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Ceij7YEz.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-CSEM0EKU.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/flowUtil-DjgXuadS.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BH54YsjB.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-hl069_Hn.css","/assets/index-iN8ECh5p.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-AwmzRkwX.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BtMXL7e_.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-CaZl1ktg.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CUBVn8lY.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-NT9nLtUI.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BrS-5AXY.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-DGskdIYF.js","/assets/ru-Z6WGe59K.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-EKYwyEg8.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-Do1OeBRU.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-ChfDr16y.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CcMAvQMd.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-ZhzNCAHU.js","/assets/useMutation-DXtJwyzl.js","/assets/useOpenParam-DiLleHPc.js","/assets/useStatusBands-CZuPvG2X.js","/assets/useUrlScope-AKuKxH8X.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-CJM_9ccR.js","/assets/uz_cyrl--s3swPqi.js","/assets/vfx-DbbJl7U5.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-BTE3oejy.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/x-CfYkDDdF.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
