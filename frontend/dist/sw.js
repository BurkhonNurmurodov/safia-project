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

const BUILD = "2026-11-23T08:40:12.208Z";
const PRECACHE = ["/","/assets/AdminPage-Bw7j02sC.js","/assets/AdminTabs-6ZB51k62.js","/assets/AiKeys-cg6AgYRO.js","/assets/AnalysisBoard-CyiiJrj3.js","/assets/ApiAccess-i7NtwPDc.js","/assets/AppLauncher-Dph316TI.js","/assets/Arc-CCyhMS8z.js","/assets/Assessment-Bg4r-Xox.js","/assets/AssessmentGrade-Bg5opXGh.js","/assets/AssessmentList-DwQbgmsC.js","/assets/Assistant-6p0FEGYj.js","/assets/AttendanceCleanup-BESe2Ldb.js","/assets/AttendanceUpload-F97UFjgm.js","/assets/AuditTable-DWzxsHgo.js","/assets/Audits-InOrtr9Q.js","/assets/BrigadirProfile-BvtrJd51.js","/assets/BrigadirsKpi-DOVzW_jt.js","/assets/Broadcast-BEiZGm0Z.js","/assets/BroadcastReceivers-D4lWtrk5.js","/assets/BroadcastRecord-DfopQTFz.js","/assets/CatLockNotice-Btl2ENqZ.js","/assets/CategoryLegendModal-wHCKwfFe.js","/assets/CellConcerns-Bmx9mmR3.js","/assets/CellDetails-BI5WsvMs.js","/assets/CellFormModal-DYk4VcvR.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-C0h5j0f-.js","/assets/Cells-DNFb2TRy.js","/assets/ColumnFilter-CHQl5CAd.js","/assets/ColumnsPicker-BZ2URo25.js","/assets/CommentsModal-B-LeIf8A.js","/assets/ComparisonTable-CLEob9kP.js","/assets/Concerns-B9Fij-J8.js","/assets/ConcernsPieces-CttMzpOJ.js","/assets/ContainerFlow-DlNi-dyg.js","/assets/ContainerTotalsCard-3v1Ls-0d.js","/assets/Containers-9VGSp1Q3.js","/assets/CountStepper-DMYKvrdr.js","/assets/Daily-j3qE5X3G.js","/assets/DataSources-B67bSPgo.js","/assets/DataTable-QEsHGMp_.js","/assets/DateRangePicker-rfzBDMhg.js","/assets/DayReportView-NAkyuLpd.js","/assets/DayStepper-MbeTWMg6.js","/assets/DayStrip-oIrYdYuP.js","/assets/DbBackup-DbclqDzU.js","/assets/DifferenceBreakdown-qn1ccbW9.js","/assets/DocAudit-D44ynXVE.js","/assets/Downtime-DtSRPGSs.js","/assets/Education-BfgQYoF9.js","/assets/EducationLesson-CERm0lim.js","/assets/EmptyState-IjmVYq9t.js","/assets/Equipment-Dp3JHQTx.js","/assets/Exam-Bfa39nwQ.js","/assets/ExamAdmin-De26RVhX.js","/assets/Factories-CtTO2nlh.js","/assets/FactorySelect-DjFgfYcQ.js","/assets/Gamification-Dw802MFc.js","/assets/GroupBadge-BorUhV9Z.js","/assets/HeatmapChart-BQWWT0nv.js","/assets/HourlyContainers-BfYhRILZ.js","/assets/IdleCell-BTqPu-gx.js","/assets/IdleOwners-DDcTQvp9.js","/assets/IdleSolutions-CMYFJhTE.js","/assets/KPICard-DAh2m9PJ.js","/assets/Kaizen-DC6jeDTX.js","/assets/Kelish-BUeZ9xQc.js","/assets/Kitchen-e62noAkw.js","/assets/KpiBits-Dt6Y6Uo_.js","/assets/KpiDeltaCard-CvlSiOzC.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-JAXLvNqo.js","/assets/LeaderAppeal-DombqYod.js","/assets/LeaderDailyTasks-DmJO6Cwx.js","/assets/LeaderDayReport-Cqit9T41.js","/assets/LeaderNotCounting-4twqruxn.js","/assets/LeaderTasksAdmin-D5CzgF1n.js","/assets/LeaderUnitReport-DdqofWxs.js","/assets/Leaderboard-D3MegdGC.js","/assets/Leaders-BSUaMk8g.js","/assets/LeadersKpi-DJo1v41R.js","/assets/Lightbox-Cl8DnAhE.js","/assets/LiveOverview-BoJdBuyJ.js","/assets/Login-DOJ5BPht.js","/assets/Logs-B6GTjIm9.js","/assets/LostWorkers-Ivnac2W1.js","/assets/NotFound-CD3yHnYi.js","/assets/Notifications-AnMnbu23.js","/assets/NotionTasks-d-dWh8O5.js","/assets/NotionTrackerSettings-C-cc7i3M.js","/assets/Ontime-BBSsG8PJ.js","/assets/OrgChart-CZFLHaF3.js","/assets/Ovens-jAvo3zt4.js","/assets/OvensSettings-F_MUlJoJ.js","/assets/Overview-DLrrgBBt.js","/assets/OwnerChip-C4tt8WAR.js","/assets/Pagination-DF6aw_sl.js","/assets/People-B6RUY2Ke.js","/assets/PerenaladkaFactTable-BJ_0kTAb.js","/assets/Permissions-CJ2-kIY-.js","/assets/PersonCard-CO44jZxm.js","/assets/PlanFulfillment-CnIxM0O7.js","/assets/Production-DZw7LR29.js","/assets/ProductionUpload-B1JZokq3.js","/assets/Profile-BCim5NVJ.js","/assets/ProfileAvatar-BHt2bJr9.js","/assets/ProfilesManagement-Dy2QWvk5.js","/assets/ProofCamera-BpNX_kQz.js","/assets/ProofPhoto-BukeqH0i.js","/assets/Quality-BRKwvyjj.js","/assets/RawRows-DW0JxEmC.js","/assets/Reports-REnw86hn.js","/assets/RequestStateChip-1fqizelr.js","/assets/RichTextEditor-BHQl14n2.js","/assets/SaveState-RiT_bDi7.js","/assets/SdPanelSettings-BU7cWT3e.js","/assets/SearchInput-CdAItGr7.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-BtJi2TvR.js","/assets/ShiftDaily-CV5E1io-.js","/assets/ShiftTimes-BPeNxTkE.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-BVdbUgcA.js","/assets/StaffListAtCheck-CQmVJqk5.js","/assets/StatusBadge-DizpLPYP.js","/assets/StatusBandsModal-h_wr6vpb.js","/assets/TargetGoal-Ca8joF29.js","/assets/Targets-Dkq13j77.js","/assets/TaskFormModal-DOeVzmP_.js","/assets/TaskerSettings-BBB0cqzr.js","/assets/Tasks-3tD6z2yP.js","/assets/TgProfile-BfQ6JMXw.js","/assets/TimeWheelPicker-Bonb6NQD.js","/assets/Tooltip-Cv51gC-6.js","/assets/TranslationsEditor-BlzFphYP.js","/assets/TrelloAnalytics-DoCWOww-.js","/assets/TrelloSettings-2mDAF_W1.js","/assets/TrendChart-B_iee3ko.js","/assets/TripleSpeedometer-D2h5-wS-.js","/assets/Trudoyomkost-6yDZwITU.js","/assets/UploadDropzone-BrmeZPk1.js","/assets/UsersActivity-DGpgXpZt.js","/assets/UsersManagement-CE34dq1L.js","/assets/VerifixPage-Ct9VJt69.js","/assets/VerifixParity-DL5jPczm.js","/assets/VfxApiMap-BfMFdtPq.js","/assets/VfxDictionaries-ByBdLwoD.js","/assets/VfxEmployees-BJDAWsKR.js","/assets/VfxHrMoves-DHqryMCp.js","/assets/VfxJobs-BOqLVa5F.js","/assets/VfxPhoto-By_xzq-s.js","/assets/VfxShifts-CMv5ZZak.js","/assets/VfxState-CqGHIThd.js","/assets/VfxTimebooks-7kkgp1I5.js","/assets/VfxTimesheet-UxBg6oH_.js","/assets/WatchProgress-RGrllS1X.js","/assets/WebLogin-DRts7v3J.js","/assets/WorkersAttendance-CI3L5FjL.js","/assets/WorkersComposition-Dqyqc14M.js","/assets/WorkersMovements-Bzp6zw0m.js","/assets/WorkersPage-BiOn-0EO.js","/assets/Zagruzka-BT2Ksxuz.js","/assets/ZagruzkaCell-CpS7DBZi.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CgfC6Swq.js","/assets/api-D_IoyhCc.js","/assets/appealTask-TZyqUfov.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-Dh9LI-X8.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-D1Obywul.js","/assets/broadcastTree-hkYi1vbV.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-B_MklnlY.js","/assets/categories-BOR7G6OD.js","/assets/cellMoveRefusal-D0UuIwc6.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-S3EboJxC.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-DuEmuIsG.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-Cu5oh3X_.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-B8vP-vYG.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-C023O2is.js","/assets/index-DkyflHqG.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-Cbv0MaWI.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DZYc1DoL.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-D8AQ4loP.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-D6ksrBVC.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-Bw0Jfd1X.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BkL-F9Ou.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CiMh9FwC.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DqGQZp_e.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-DQmDwebY.js","/assets/useMutation-HfD-g7vt.js","/assets/useOpenParam-BnRGqi6Q.js","/assets/useStatusBands-Bf43BEuS.js","/assets/useUrlScope-pZ2YqJmk.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-2AT6LMfp.js","/assets/uz_cyrl-C2MQKT0f.js","/assets/vfx--xoGka3c.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-C_6bU5To.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
