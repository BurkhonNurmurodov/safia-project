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

const BUILD = "2026-11-22T07:27:30.565Z";
const PRECACHE = ["/","/assets/AdminPage-D0umlRmM.js","/assets/AdminTabs-D3Wo3bEE.js","/assets/AiKeys-DbzJhzUl.js","/assets/AnalysisBoard-DjdfhB40.js","/assets/ApiAccess-DV7kMpbO.js","/assets/AppLauncher-xaNWaEMb.js","/assets/Arc-Dh_BAtAh.js","/assets/Assessment-Dmb4wsAm.js","/assets/AssessmentGrade-Cha8uXbb.js","/assets/AssessmentList-DtYF-06B.js","/assets/Assistant-xpeiDApy.js","/assets/AttendanceCleanup-08MwYuL9.js","/assets/AttendanceUpload-BJkP482s.js","/assets/AuditTable-CBhoUtF9.js","/assets/Audits-wpp3BBqh.js","/assets/BrigadirProfile-D1trKtaC.js","/assets/BrigadirsKpi-BoxHWrfb.js","/assets/Broadcast-xTHqbTmR.js","/assets/BroadcastReceivers-B8vj2MuZ.js","/assets/BroadcastRecord-DJFOS44w.js","/assets/CatLockNotice-BR2oFv0p.js","/assets/CategoryLegendModal-DBDnaw1R.js","/assets/CellConcerns-Bz54O7Hs.js","/assets/CellDetails-De6Zff6O.js","/assets/CellFormModal-hJpgIKn7.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-rM00zfry.js","/assets/Cells-D_BdDwvp.js","/assets/ColumnFilter-BiqImUsd.js","/assets/ColumnsPicker-BQ30zADf.js","/assets/CommentsModal-BizGwyDG.js","/assets/ComparisonTable-gj0aEZHC.js","/assets/Concerns-NzqKnJoc.js","/assets/ConcernsPieces-BzTLKxqx.js","/assets/ContainerFlow-Dnspwg0P.js","/assets/ContainerTotalsCard-DBXRYAI9.js","/assets/Containers-BsEGg00I.js","/assets/CountStepper-DY_NZe9-.js","/assets/Daily-D3zJJThe.js","/assets/DataSources-SW_05Pba.js","/assets/DataTable-B9PQatjN.js","/assets/DateRangePicker-CVoF2iXa.js","/assets/DayReportView-BtaoFHXH.js","/assets/DayStepper-DT732MK5.js","/assets/DayStrip-CoVpNbR5.js","/assets/DbBackup-CGVTI6oG.js","/assets/DifferenceBreakdown-BZQlCM30.js","/assets/DocAudit-Bixna-6u.js","/assets/Downtime-C-aFqXiF.js","/assets/Education-C9sguflB.js","/assets/EducationLesson-mfh63w4M.js","/assets/EmptyState-DTBK3Ch1.js","/assets/Equipment-DY0WvZGJ.js","/assets/Exam-CL3eZt13.js","/assets/ExamAdmin-BUTo4WYZ.js","/assets/Factories-CCk6T6VF.js","/assets/FactorySelect-Cn-A20Ws.js","/assets/Gamification-CeYfTpxp.js","/assets/GroupBadge-Bwe26Gav.js","/assets/HeatmapChart-Dsj1SrFb.js","/assets/HourlyContainers-DOEPRXgT.js","/assets/IdleCell-CA_s6fU7.js","/assets/IdleOwners-B1anEPXa.js","/assets/IdleSolutions-DiB72GmW.js","/assets/KPICard-DIACjZ7I.js","/assets/Kaizen-B6lXarW5.js","/assets/Kelish-5l_Qn43K.js","/assets/Kitchen-D2_1mKXZ.js","/assets/KpiBits-DhqY15Bd.js","/assets/KpiDeltaCard-7Wo-sLRL.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-TNpxWH5n.js","/assets/LeaderAppeal-BMuc0ILS.js","/assets/LeaderDailyTasks-B2T7lD4b.js","/assets/LeaderDayReport-DmVhk-Na.js","/assets/LeaderNotCounting-DVE6OB82.js","/assets/LeaderTasksAdmin-QiKPSQrg.js","/assets/LeaderUnitReport-CWcOAd3p.js","/assets/Leaderboard-D4j8tkmM.js","/assets/Leaders-Cl_GIxqg.js","/assets/LeadersKpi-CRGs6G7z.js","/assets/Lightbox-BVjcy1X7.js","/assets/LiveOverview-C3V2qy-4.js","/assets/Login-SY3ZP9eD.js","/assets/Logs-BfmbNMlz.js","/assets/LostWorkers-CdqvnzMp.js","/assets/NotFound-bqR2BDia.js","/assets/Notifications-DPhWn5Gk.js","/assets/NotionTasks-e9RT4-Ce.js","/assets/NotionTrackerSettings-B33ibpUm.js","/assets/Ontime-vzQ-2nqj.js","/assets/OrgChart-liUCi1mS.js","/assets/Ovens-8LEaiaPj.js","/assets/OvensSettings-B93NHiJj.js","/assets/Overview-CRtrmeLm.js","/assets/OwnerChip-BM3XaZyz.js","/assets/Pagination-MI7leqff.js","/assets/People-DoJYXF7Q.js","/assets/PerenaladkaFactTable-D8TFoyoQ.js","/assets/Permissions-vQGMSs5-.js","/assets/PersonCard-BQyJ6-J-.js","/assets/PlanFulfillment-D7JbuDnE.js","/assets/Production-BDx9VKmX.js","/assets/ProductionUpload-CJ5lSZ2S.js","/assets/Profile-D-sEvbg8.js","/assets/ProfileAvatar-D6BGLj3g.js","/assets/ProfilesManagement-BRy0B6y4.js","/assets/ProofCamera-BlKhh2D4.js","/assets/ProofPhoto-I9Tlmulz.js","/assets/Quality-D6UoiAkI.js","/assets/RawRows-fS91yuIe.js","/assets/Reports-BGYxP9RE.js","/assets/RequestStateChip-jgaBcOyO.js","/assets/RichTextEditor-iQ8fg2UT.js","/assets/SaveState-CrYaMtFE.js","/assets/SdPanelSettings-7gvJdNLN.js","/assets/SearchInput-BbqhNzOf.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-W03xJAZo.js","/assets/ShiftDaily-B6dCq_k8.js","/assets/ShiftTimes-DGvcmwo6.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-Bku_5r7w.js","/assets/StaffListAtCheck-D8n15IMl.js","/assets/StatusBadge-CenWdZ1x.js","/assets/StatusBandsModal-Bj97eMEy.js","/assets/TargetGoal-Bh0E9Z0Q.js","/assets/Targets-DIMgLTAe.js","/assets/TaskFormModal-DuZwmRPX.js","/assets/TaskerSettings-CNHevsxS.js","/assets/Tasks-7jOL1dN6.js","/assets/TgProfile-BC7wuwh3.js","/assets/TimeWheelPicker-Csh6UsZA.js","/assets/Tooltip-DVRF2r7v.js","/assets/TranslationsEditor-Db_YdR5C.js","/assets/TrelloAnalytics-C-5u5OWH.js","/assets/TrelloSettings-DpCxa_kY.js","/assets/TrendChart-D-ohzUe3.js","/assets/TripleSpeedometer-NB1etbq7.js","/assets/Trudoyomkost-EDd02hmi.js","/assets/UploadDropzone-BonnDU3f.js","/assets/UsersActivity-D1iY2_XF.js","/assets/UsersManagement-nouuMNKy.js","/assets/VerifixPage-Du8s0qwv.js","/assets/VerifixParity-CxKE0wqP.js","/assets/VfxApiMap-DIEqdxud.js","/assets/VfxDictionaries-CHJbOMvJ.js","/assets/VfxEmployees-CnyPbfBD.js","/assets/VfxHrMoves-vLIOfuTr.js","/assets/VfxJobs-Q4p7z9MK.js","/assets/VfxPhoto--4j4UL1T.js","/assets/VfxShifts-DbOcZY1z.js","/assets/VfxState-BMByZ_Vm.js","/assets/VfxTimebooks-D_Nbcq0n.js","/assets/VfxTimesheet-DrUQaWaU.js","/assets/WatchProgress-DmzZTwL-.js","/assets/WebLogin-DQdAHJ3f.js","/assets/WorkersAttendance-CqU88Ruz.js","/assets/WorkersComposition-6za7hIeA.js","/assets/WorkersMovements-mxgvlR5_.js","/assets/WorkersPage-UzkrwmcP.js","/assets/Zagruzka-BXOIdTgf.js","/assets/ZagruzkaCell-Cx7WihcG.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-D80tLxFE.js","/assets/api-D_IoyhCc.js","/assets/appealTask-D_fguFuR.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-DeXR6rcm.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CY0tQEnE.js","/assets/broadcastTree-BbocnS92.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-Cofb4qtk.js","/assets/categories-Dqt-w_zm.js","/assets/cellMoveRefusal-zts19zzU.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CQduQIYH.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-QTcbcO4I.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-DPj7Dz09.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DdEnRosD.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BNmtHLMh.js","/assets/index-CSS32StW.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-C5EX65Bk.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-Ck5PSM2h.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-aWvsrX41.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-D9UvcGUz.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-zNsedexD.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-NQewZrQA.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-PUz-o1pD.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CVvejoRF.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-DVKXrHQ_.js","/assets/useMutation-A5oqkV4Y.js","/assets/useOpenParam-Bj_qVcSH.js","/assets/useStatusBands-B9l9Y5g5.js","/assets/useUrlScope-CrHm02Uu.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-B778LtXd.js","/assets/uz_cyrl-DixwGbyn.js","/assets/vfx-CYWnJKHC.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-BI81BYZg.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
