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

const BUILD = "2026-11-03T20:41:15.809Z";
const PRECACHE = ["/","/assets/ActionHistory-BgUlFuiB.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-D2i9bzzR.js","/assets/AiKeys-DI2qo3Js.js","/assets/AnalysisBoard-BMkrj80p.js","/assets/AppLauncher-DWFuVCto.js","/assets/Arc-GClpHs6M.js","/assets/Assessment-BqiJGmSN.js","/assets/AssessmentGrade-DpaE07gZ.js","/assets/AssessmentList-BhsFvwb3.js","/assets/Assistant-C8xqxld-.js","/assets/AttendanceCleanup-DDuzr_9x.js","/assets/AttendanceUpload-CK9hYmBV.js","/assets/BrigadirProfile-D1eVW3vf.js","/assets/BrigadirsKpi-CXgS7dzt.js","/assets/Broadcast-CABF1T4D.js","/assets/BroadcastReceivers-BvgsLRbf.js","/assets/BroadcastRecord-BkDtWEcw.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-BRjaG1Hd.js","/assets/CategoryLegendModal-DnuTwNNG.js","/assets/CellConcerns-WzkCZpqz.js","/assets/CellDetails-CliY6clk.js","/assets/CellFormModal-CgPKK1Fd.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-BiEwaGT4.js","/assets/Cells-BECQXvgv.js","/assets/ColumnFilter-DUEiZVe6.js","/assets/ColumnsPicker-RC-DN1cv.js","/assets/CommentsModal-BoRNQZqC.js","/assets/ComparisonTable-CXOMRDtM.js","/assets/Concerns-CPSaABl5.js","/assets/ConcernsPieces-CTkURzyi.js","/assets/CountStepper-CAty7Po4.js","/assets/Daily-C1zH1xcL.js","/assets/DataSources-j8bgK56p.js","/assets/DataTable-Dwf0Gcn5.js","/assets/DateRangePicker-DnGtOBDz.js","/assets/DayReportView-DMmQbC4U.js","/assets/DayStepper-CLB1F1za.js","/assets/DayStrip-Dz2uybNE.js","/assets/DbBackup-bPyuElr7.js","/assets/DifferenceBreakdown-Br35MYbC.js","/assets/DocAudit-BMdRbn0O.js","/assets/Downtime-CRwv4zDy.js","/assets/Education-ZllTrUas.js","/assets/EducationLesson-IMxFV7WV.js","/assets/EmptyState-Bn3ZAhGZ.js","/assets/Exam-Cel82yot.js","/assets/ExamAdmin-BUDSya-m.js","/assets/Factories-C3TbX5tl.js","/assets/FactorySelect-CkNOaQ9T.js","/assets/Gamification-W27Pz4TI.js","/assets/GroupBadge-B-NOkUG2.js","/assets/HeatmapChart-C63OHxWi.js","/assets/IdleCell-D3bhK4pF.js","/assets/IdleOwners-BvTvGvyC.js","/assets/IdleSolutions-B45q80vG.js","/assets/IdleSource-DCmovoYB.js","/assets/KPICard--2Bv61Ft.js","/assets/Kaizen-CmDo16ny.js","/assets/Kelish-Cq1FLdIi.js","/assets/KpiBits-DpyYQSoq.js","/assets/KpiDeltaCard-DDu3YfiF.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-DTFyA1T5.js","/assets/LeaderAppeal-BkiPr562.js","/assets/LeaderCutoffs-yDhkHigy.js","/assets/LeaderDailyTasks-BaZJVPmC.js","/assets/LeaderDayExclusions-Du19ftmc.js","/assets/LeaderDayReport-DvBW_AqF.js","/assets/LeaderTasksAdmin-B-xU0aDF.js","/assets/LeaderUnitReport-4lxtXBc3.js","/assets/Leaderboard-BDa_LgVt.js","/assets/Leaders-CyIqi2sl.js","/assets/LeadersKpi-De93iHxO.js","/assets/Lightbox-CkK-QS5d.js","/assets/LiveOverview-CqiqJGzY.js","/assets/Login-Xq4GQGoX.js","/assets/Logs-_ZzGlGPe.js","/assets/LostWorkers-DxODgOob.js","/assets/NotFound-DQSEbCzo.js","/assets/Notifications-Ba4OkIyc.js","/assets/NotionTasks-CgmiA5R9.js","/assets/NotionTrackerSettings-CQiTTA0k.js","/assets/Ontime-S-JI1A_x.js","/assets/Ovens-CZ8EoKsZ.js","/assets/OvensSettings-Bx7uCvIv.js","/assets/Overview-bgz2qegk.js","/assets/OwnerChip-DdDKckAy.js","/assets/PageAccess-C9vyLARf.js","/assets/Pagination-DK0D31Gz.js","/assets/People-C_CEIAfT.js","/assets/PerenaladkaFactTable-CV77I6ap.js","/assets/Permissions-DMZtN1jb.js","/assets/PersonCard-BwfSFolS.js","/assets/PlanFulfillment-DkWYAR0L.js","/assets/Production-CXtgfKRS.js","/assets/ProductionUpload-D-K21k6R.js","/assets/Profile-CnBT8YsH.js","/assets/ProfileAvatar-Dat8iWzi.js","/assets/ProfilesManagement-C4NSBkBm.js","/assets/ProofCamera-XDtQZ5XY.js","/assets/ProofPhoto-rLiVj8cw.js","/assets/Quality-Dfv8f9Z6.js","/assets/RawRows-CsvmVXdT.js","/assets/Reports-CwkTd0cX.js","/assets/RequestStateChip-DAvdqX26.js","/assets/RichTextEditor-CqutZjVf.js","/assets/SaveState-B15LNMSi.js","/assets/SearchInput-DSyGnfEU.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-BmENgdpQ.js","/assets/ShiftDaily-Cmgds0Zy.js","/assets/ShiftTimes-CEYAjKTd.js","/assets/Staff-B6WcK5F9.js","/assets/StaffListAtCheck-Cv-LEAs5.js","/assets/StatusBadge-vfN2txus.js","/assets/StatusBandsModal-oNLA18to.js","/assets/TargetGoal-CCwUUt2j.js","/assets/Targets-BEMxmoo6.js","/assets/Tasks-DCg3_n00.js","/assets/TimeWheelPicker-CVa2gnga.js","/assets/Tooltip-CSVj3QAD.js","/assets/TranslationsEditor-DR2tRj6_.js","/assets/TrelloAnalytics-BxpcYPvR.js","/assets/TrelloSettings-C2sW5V5X.js","/assets/TrendChart-Wi3xk0yF.js","/assets/TripleSpeedometer-CVe-5sd8.js","/assets/Trudoyomkost-CfMY9NLQ.js","/assets/UploadDropzone-C9nYQtED.js","/assets/UsersActivity-Cj-RdrBP.js","/assets/UsersManagement-yKjRBHGY.js","/assets/VerdictBlock-6t_VnDM2.js","/assets/VerifixParity-B9_spdtM.js","/assets/VerifixSettings-CfOxlVbg.js","/assets/VerifixSync-BdN5aVa7.js","/assets/VfxApiMap-DO-Rz56f.js","/assets/VfxDictionaries-NF8177c-.js","/assets/VfxEmployees-CrinMlnr.js","/assets/VfxHrMoves-JbWzFe6L.js","/assets/VfxJobs-0fslQXck.js","/assets/VfxPhoto-CgtUR_4D.js","/assets/VfxShifts-D18PWIJ1.js","/assets/VfxState-DLL3sbzc.js","/assets/VfxTimebooks-DS_uBN9K.js","/assets/VfxTimesheet-BNO27eZO.js","/assets/WatchProgress-Bk_eOyb7.js","/assets/WebLogin-CxXHJFSj.js","/assets/WorkersAttendance-DFqUYU7K.js","/assets/WorkersComposition-D5qODtKg.js","/assets/WorkersMovements-CbvTk1Fw.js","/assets/WorkersPage-BN4mgtsq.js","/assets/Zagruzka-WMwcOUWp.js","/assets/ZagruzkaCell-C5coCZLE.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-C5rANF6H.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DqMd-ggI.js","/assets/broadcastTree-DR4wStt0.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BiJiB6l-.js","/assets/cellMoveRefusal-DPcMUnx_.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-oEgYWSj_.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-D0GRtASX.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-uAcb58XH.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Ccq-0Cla.css","/assets/index-LYp1bxa5.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CX7eiYS-.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-wpiFQLcb.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-D6D6KEP3.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-Dy07hjnS.js","/assets/repeat-DIs-1u7-.js","/assets/ru-BG4o4i8S.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-CGIRtDxV.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-BjYOffRr.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-D14ZkkGa.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-BerQPDKS.js","/assets/useMutation-C2ygUkI0.js","/assets/useOpenParam-DdHu98uN.js","/assets/useStatusBands-BIUW7Q1Z.js","/assets/useUrlScope-B871MqlK.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-Cqm0rQ_V.js","/assets/uz_cyrl-DmvMk7XW.js","/assets/vfx-Wx7lNfVf.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-CaG_SPDa.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
