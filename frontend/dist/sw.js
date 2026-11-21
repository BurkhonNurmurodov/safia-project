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

const BUILD = "2026-11-21T09:37:39.732Z";
const PRECACHE = ["/","/assets/AdminPage-RkKb4sad.js","/assets/AdminTabs-CpZX7Qy7.js","/assets/AiKeys-D7j09knL.js","/assets/AnalysisBoard-BiSoL3P7.js","/assets/ApiAccess-D4vYtwQF.js","/assets/AppLauncher-CaUf0egz.js","/assets/Arc-DgkYNl7g.js","/assets/Assessment-B3fB7XkR.js","/assets/AssessmentGrade-BqntlEGW.js","/assets/AssessmentList-BBs7U33S.js","/assets/Assistant-DTa5hnPR.js","/assets/AttendanceCleanup-B3HhCmcv.js","/assets/AttendanceUpload-BlvDcHNt.js","/assets/AuditTable-D9DIjXbr.js","/assets/Audits-L5lbBiTR.js","/assets/BrigadirProfile-CLt-hnU6.js","/assets/BrigadirsKpi-3g1fH0tl.js","/assets/Broadcast-CC3-Vo_n.js","/assets/BroadcastReceivers-BPsWMXjg.js","/assets/BroadcastRecord-C6-iBkSP.js","/assets/CatLockNotice-CDBUoX-v.js","/assets/CategoryLegendModal-C503Og0R.js","/assets/CellConcerns-Bw3tttf2.js","/assets/CellDetails-chvWiMbw.js","/assets/CellFormModal-B9oK9cGs.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-Cm2gkw-Y.js","/assets/Cells-FNDegtPP.js","/assets/ColumnFilter-BS-BrI7B.js","/assets/ColumnsPicker-wvK2wprg.js","/assets/CommentsModal-CuPY9E5g.js","/assets/ComparisonTable-COUZ3Rv5.js","/assets/Concerns-Sjrl9sv_.js","/assets/ConcernsPieces-CK0XHOh2.js","/assets/ContainerFlow-BUcF96po.js","/assets/ContainerTotalsCard-CNhN93Uu.js","/assets/Containers-Cl8yMwwc.js","/assets/CountStepper-DfX3EqfX.js","/assets/Daily-CbtIwDTc.js","/assets/DataSources-JgGCrxVf.js","/assets/DataTable-QiBOVKrU.js","/assets/DateRangePicker-Dp8c5in5.js","/assets/DayReportView-CXvao0wl.js","/assets/DayStepper-RHRp3Bzv.js","/assets/DayStrip-RgiL564_.js","/assets/DbBackup-Ct3S-FOb.js","/assets/DifferenceBreakdown-BroGTea-.js","/assets/DocAudit-C_RAoCB0.js","/assets/Downtime-D79YKwQ8.js","/assets/Education--ginLFTm.js","/assets/EducationLesson-QEQ2i0RA.js","/assets/EmptyState-BSYicpeM.js","/assets/Equipment-a4xE5eMb.js","/assets/Exam-Cmv5oMp1.js","/assets/ExamAdmin-j2UE8Ec5.js","/assets/Factories-BH5Dn7GV.js","/assets/FactorySelect-Dx2xY-zS.js","/assets/Gamification-DhDe2QSS.js","/assets/GroupBadge-jPMFu8U0.js","/assets/HeatmapChart-DEKbnzae.js","/assets/HourlyContainers-7SwSPeKA.js","/assets/IdleCell-4Ti4kZ85.js","/assets/IdleOwners-C7HoFSEx.js","/assets/IdleSolutions-DHLumCMG.js","/assets/KPICard-BSAfIH36.js","/assets/Kaizen-B-G12yGZ.js","/assets/Kelish-DOsXuElt.js","/assets/Kitchen-t2CfgN2q.js","/assets/KpiBits-Dho2-QR6.js","/assets/KpiDeltaCard-DTVH3YmE.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-DvJDGTs4.js","/assets/LeaderAppeal-CseALg16.js","/assets/LeaderDailyTasks-rNP0wi8w.js","/assets/LeaderDayReport-Bd5NLTuK.js","/assets/LeaderNotCounting-CoPK4Yo9.js","/assets/LeaderTasksAdmin-Ce2HIYPP.js","/assets/LeaderUnitReport-CGmqnZhe.js","/assets/Leaderboard-GazRJrRL.js","/assets/Leaders-D13z57lv.js","/assets/LeadersKpi-sZR-QnJr.js","/assets/Lightbox-BB8tmS5H.js","/assets/LiveOverview-TTnd59sc.js","/assets/Login-Cm7MLO-5.js","/assets/Logs-DTdp8JFx.js","/assets/LostWorkers-CqpJHf1J.js","/assets/NotFound-Er_DCVC2.js","/assets/Notifications-CFr6H_W6.js","/assets/NotionTasks-BsbadyWj.js","/assets/NotionTrackerSettings-7mCa2Gio.js","/assets/Ontime-BHfeoNld.js","/assets/OrgChart-BSGoeldA.js","/assets/Ovens-DEdBSKiD.js","/assets/OvensSettings-DtVyl9hC.js","/assets/Overview-Cc4hrbPl.js","/assets/OwnerChip-HzFnJuPL.js","/assets/Pagination-ngEvQB7M.js","/assets/People-Bl5wPhWG.js","/assets/PerenaladkaFactTable-CTslaoY-.js","/assets/Permissions-Qw5CZmO1.js","/assets/PersonCard-D-PXpro-.js","/assets/PlanFulfillment-DCMOgtt5.js","/assets/Production-ik4trCyj.js","/assets/ProductionUpload-BaYr0RAb.js","/assets/Profile-BHktkMfA.js","/assets/ProfileAvatar-CG8GWC8Z.js","/assets/ProfilesManagement-BOUd_SI6.js","/assets/ProofCamera-CNyJtnK8.js","/assets/ProofPhoto-Cgxr5doS.js","/assets/Quality-DRVjODvz.js","/assets/RawRows-CSI1xcka.js","/assets/Reports-19NIA13i.js","/assets/RequestStateChip-Bgr9n15V.js","/assets/RichTextEditor-Ckl3SMIG.js","/assets/SaveState-Ix7XXQln.js","/assets/SdPanelSettings-DPQsD7rm.js","/assets/SearchInput-Cp96tmDD.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-DUf5d2mm.js","/assets/ShiftDaily-Cf1ISm28.js","/assets/ShiftTimes-JxUaZunP.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-TBUIC5Co.js","/assets/StaffListAtCheck-DCQxvKj_.js","/assets/StatusBadge-CKxd46AF.js","/assets/StatusBandsModal-DkapJ3uR.js","/assets/TargetGoal-Cs8qeaXh.js","/assets/Targets-CdGXePbL.js","/assets/TaskFormModal-CipwV1jd.js","/assets/TaskerSettings-KgcVFsDl.js","/assets/Tasks-CCQ_HA_R.js","/assets/TgProfile-3nXGr1Xp.js","/assets/TimeWheelPicker-BAm4ja8D.js","/assets/Tooltip-Cuan2uCK.js","/assets/TranslationsEditor-DwfGGyXl.js","/assets/TrelloAnalytics-L7nCFdZy.js","/assets/TrelloSettings-B2EBy-Oz.js","/assets/TrendChart-BxvjNVoN.js","/assets/TripleSpeedometer-2YyxvfQh.js","/assets/Trudoyomkost-qCTz5sMj.js","/assets/UploadDropzone-DnYFQ4rV.js","/assets/UsersActivity-C1dcIQ4d.js","/assets/UsersManagement-Bhhd637s.js","/assets/VerifixPage-BVG_d3jO.js","/assets/VerifixParity-D8ev4HaV.js","/assets/VfxApiMap-Bhkm54JZ.js","/assets/VfxDictionaries-B3Tjbdvx.js","/assets/VfxEmployees-tlONWTaW.js","/assets/VfxHrMoves-DpAF8J5M.js","/assets/VfxJobs-Cr3EN_C1.js","/assets/VfxPhoto-YSV4HOZv.js","/assets/VfxShifts-DeD8CI_p.js","/assets/VfxState-XwfrTXNn.js","/assets/VfxTimebooks-D8jWZmLw.js","/assets/VfxTimesheet-Df5jyhen.js","/assets/WatchProgress-CM2Cam14.js","/assets/WebLogin-Cv2G12av.js","/assets/WorkersAttendance-M0p8zUsN.js","/assets/WorkersComposition-JzqqHS5q.js","/assets/WorkersMovements-B_U3KynX.js","/assets/WorkersPage-vUqqOj5d.js","/assets/Zagruzka-B8aZK2CI.js","/assets/ZagruzkaCell-B7XR8fnD.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BjxPcGYQ.js","/assets/api-D_IoyhCc.js","/assets/appealTask-B8tsqA8y.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-sJa8F44e.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-YDPiY7z8.js","/assets/broadcastTree-DRN46cmA.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-Ct5JfWGr.js","/assets/categories-BaEokXTv.js","/assets/cellMoveRefusal-CYSZcbiM.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DmpHohFx.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-CyeyxNe-.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-e8QKbv_T.js","/assets/flowUtil-qMIrTbvf.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DqXP0p8X.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CxbhLY15.js","/assets/index-f5t5ecOf.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-jRMDWvvK.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-C7etwFlx.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-Ms8IRnvI.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DR-6pSVL.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-COP7qUgd.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CagAx7jv.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-2RddnQ3P.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Cqyandkb.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-ChXt_BIb.js","/assets/useMutation-BIgt8zbP.js","/assets/useOpenParam-BDs6TV5G.js","/assets/useStatusBands-BLv7K41n.js","/assets/useUrlScope-4SgIHC5p.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-Dmnh4U3g.js","/assets/uz_cyrl--gg9guee.js","/assets/vfx-DJhdqw9h.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-Lv9KHwtE.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
