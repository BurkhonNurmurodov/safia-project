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

const BUILD = "2026-11-22T07:54:20.081Z";
const PRECACHE = ["/","/assets/AdminPage-YuotLM5x.js","/assets/AdminTabs-CROwgm6Q.js","/assets/AiKeys-DtVTFLhD.js","/assets/AnalysisBoard-DWpoCvN1.js","/assets/ApiAccess-mDdJgcg-.js","/assets/AppLauncher-ClPuGMIA.js","/assets/Arc-D5hEjC1I.js","/assets/Assessment-DudCuLRT.js","/assets/AssessmentGrade-CDHk8d8U.js","/assets/AssessmentList-DeM3TBiJ.js","/assets/Assistant-DDqlN5CO.js","/assets/AttendanceCleanup-Vnn2c2Rl.js","/assets/AttendanceUpload-CklMntyb.js","/assets/AuditTable-I_OGmWmI.js","/assets/Audits-BJkEdp8J.js","/assets/BrigadirProfile-RvH8_eGS.js","/assets/BrigadirsKpi-IuUlMyHq.js","/assets/Broadcast-DEPf2Nsa.js","/assets/BroadcastReceivers-UKSE5iiH.js","/assets/BroadcastRecord--3TZlS-y.js","/assets/CatLockNotice-CgWZLDQS.js","/assets/CategoryLegendModal-BlZ5PLX2.js","/assets/CellConcerns-QGGEy9kh.js","/assets/CellDetails-l1z4doke.js","/assets/CellFormModal-CCSrmTju.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-C9lyfSDh.js","/assets/Cells-esVnpapC.js","/assets/ColumnFilter-CbPGlB-R.js","/assets/ColumnsPicker-DytTn58w.js","/assets/CommentsModal-BIryTAvi.js","/assets/ComparisonTable-DEADpOwv.js","/assets/Concerns-D1vv3ybY.js","/assets/ConcernsPieces-BhIrtAHt.js","/assets/ContainerFlow-Dlpv1sCO.js","/assets/ContainerTotalsCard-V8T8LIvJ.js","/assets/Containers-BKfsgOak.js","/assets/CountStepper-BzITuJoO.js","/assets/Daily-D8B8Ci4N.js","/assets/DataSources-oB3cAs4o.js","/assets/DataTable-C3pVPJms.js","/assets/DateRangePicker-B8Srpu2c.js","/assets/DayReportView-DnOoLdZ7.js","/assets/DayStepper-CDZKNvDF.js","/assets/DayStrip-ycqM6Q-4.js","/assets/DbBackup-BQI4qy_N.js","/assets/DifferenceBreakdown-DyjUoKI5.js","/assets/DocAudit-BUy5lJ7k.js","/assets/Downtime-DWFOaeLw.js","/assets/Education-CTg_DyN3.js","/assets/EducationLesson-CvkKU-Oh.js","/assets/EmptyState-ClDje4c4.js","/assets/Equipment-BlLbNY7u.js","/assets/Exam-DqL7ihsW.js","/assets/ExamAdmin-0Qp-8gvN.js","/assets/Factories-BA2zHqD9.js","/assets/FactorySelect-BJKwcibw.js","/assets/Gamification-C3A2lx0p.js","/assets/GroupBadge-cqFF3Onk.js","/assets/HeatmapChart-CERqiXPx.js","/assets/HourlyContainers-Dci-XTdG.js","/assets/IdleCell-Bse6fIUJ.js","/assets/IdleOwners-2UER2Azq.js","/assets/IdleSolutions-CY3Mavib.js","/assets/KPICard-BQiDglfJ.js","/assets/Kaizen-CZfQBBVt.js","/assets/Kelish-BXkKX6LM.js","/assets/Kitchen-DvYVEwno.js","/assets/KpiBits-BAHDuWBP.js","/assets/KpiDeltaCard-CVdrgFYD.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-CV7JdFAK.js","/assets/LeaderAppeal-BxJ0OV83.js","/assets/LeaderDailyTasks-pVQSlBIB.js","/assets/LeaderDayReport-C3VnBTO4.js","/assets/LeaderNotCounting-CKX4WHSG.js","/assets/LeaderTasksAdmin-BSJ8NLe7.js","/assets/LeaderUnitReport-B-VQxQDV.js","/assets/Leaderboard-CYaiC0QB.js","/assets/Leaders-DBCKezOH.js","/assets/LeadersKpi-Dw8k4Shc.js","/assets/Lightbox-CMK7Tkqj.js","/assets/LiveOverview-DgACGap9.js","/assets/Login-Bec0focH.js","/assets/Logs-DKpRvUtw.js","/assets/LostWorkers-BRgjT0hb.js","/assets/NotFound-BWVAN0aJ.js","/assets/Notifications-CIC04mtR.js","/assets/NotionTasks-IeyEiSKU.js","/assets/NotionTrackerSettings-Dx2jlAvG.js","/assets/Ontime--j09H8GK.js","/assets/OrgChart-DZM2uMC_.js","/assets/Ovens-C4GOKyRu.js","/assets/OvensSettings-BbOdbSjS.js","/assets/Overview-QCnMtw_f.js","/assets/OwnerChip-DmYBCMIH.js","/assets/Pagination-DfaleIuo.js","/assets/People-Ckz4YwkH.js","/assets/PerenaladkaFactTable-CmDyESjA.js","/assets/Permissions-aRPEDuRs.js","/assets/PersonCard-CB6dpTZj.js","/assets/PlanFulfillment-DjTypgXT.js","/assets/Production-C5dlUrAw.js","/assets/ProductionUpload-DlJUgK6p.js","/assets/Profile-BlLSY7_d.js","/assets/ProfileAvatar-uDF4fGr8.js","/assets/ProfilesManagement-BYU_sPwq.js","/assets/ProofCamera-DtbzeXSn.js","/assets/ProofPhoto-2ArKyhnl.js","/assets/Quality-Dl_8Brca.js","/assets/RawRows-fTZGfzYj.js","/assets/Reports-B9cqcQPJ.js","/assets/RequestStateChip-BuqW9UWo.js","/assets/RichTextEditor-CTvUX_WK.js","/assets/SaveState-FZ5NLHdh.js","/assets/SdPanelSettings-DwNrB-6O.js","/assets/SearchInput-DFv-_NVs.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-CehdsOre.js","/assets/ShiftDaily-BihP96Du.js","/assets/ShiftTimes-jkXygzkM.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-BzeWD9Yx.js","/assets/StaffListAtCheck-J3BOt9fY.js","/assets/StatusBadge-Ttc7S36o.js","/assets/StatusBandsModal-BL2ZQrGT.js","/assets/TargetGoal-CNrjs2wD.js","/assets/Targets-MENExHST.js","/assets/TaskFormModal-CvklgRcc.js","/assets/TaskerSettings-Dr2WJJ9h.js","/assets/Tasks-D_jLdeAJ.js","/assets/TgProfile-iyqMETVq.js","/assets/TimeWheelPicker-C3eX1Oa4.js","/assets/Tooltip-6j5Cgaod.js","/assets/TranslationsEditor-D0ythNxt.js","/assets/TrelloAnalytics-CxkV61Gj.js","/assets/TrelloSettings-hq8Kl8nO.js","/assets/TrendChart-nwRqJGVh.js","/assets/TripleSpeedometer-DUE5hS5Q.js","/assets/Trudoyomkost-DCHlqGtO.js","/assets/UploadDropzone-DofQo0JR.js","/assets/UsersActivity-8zpUrK8I.js","/assets/UsersManagement-BvGt0Jdh.js","/assets/VerifixPage-DwSMOq5Q.js","/assets/VerifixParity-lDqGoLu5.js","/assets/VfxApiMap-B9QVfuqu.js","/assets/VfxDictionaries-D8TZPN00.js","/assets/VfxEmployees-BsySOZwy.js","/assets/VfxHrMoves-KECUU-nP.js","/assets/VfxJobs-CzyTZI5E.js","/assets/VfxPhoto-C68oGdDv.js","/assets/VfxShifts-D6wZHgTg.js","/assets/VfxState-CBbRKA4Y.js","/assets/VfxTimebooks-BRQHM07a.js","/assets/VfxTimesheet-CgUJKGH5.js","/assets/WatchProgress-CYaazmxm.js","/assets/WebLogin--e7lRfrb.js","/assets/WorkersAttendance-Ce2Uz5xm.js","/assets/WorkersComposition-ugcwUeX6.js","/assets/WorkersMovements-Dh52k5JX.js","/assets/WorkersPage-Cl5DqU_5.js","/assets/Zagruzka-dTLWoXdK.js","/assets/ZagruzkaCell-D3qDz5iM.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DAsUwnXk.js","/assets/api-D_IoyhCc.js","/assets/appealTask-BoOlaSBU.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-D0-ovIN9.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CymeAxJP.js","/assets/broadcastTree-BSyQzyFU.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-jIn7pgHJ.js","/assets/categories-DJ_6fZM3.js","/assets/cellMoveRefusal-BXu3ON2s.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-uwL_3gNR.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-CTpK7was.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-w-fjBhQz.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BEN9aVe1.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-1rrIlX2G.js","/assets/index-DziCR3W9.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BMSz6Kpw.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-l7LA8_PC.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-C2xPbiEL.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DlEJMu9J.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-Bri6I6CI.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-B62Jwtew.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CYXMqwsb.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CrYHMxVb.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-BnKyD_49.js","/assets/useMutation-Duy6a0tF.js","/assets/useOpenParam-BEAfCP02.js","/assets/useStatusBands-D_DA8sj2.js","/assets/useUrlScope-DdvbJfBS.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-B0hjtZsH.js","/assets/uz_cyrl-bd2GbIan.js","/assets/vfx-CfkAeljJ.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-DVe47Ten.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
