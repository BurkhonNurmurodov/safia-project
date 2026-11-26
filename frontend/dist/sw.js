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

const BUILD = "2026-11-26T09:34:58.048Z";
const PRECACHE = ["/","/assets/AdminPage-COK9kbbm.js","/assets/AdminTabs-BmxKJegT.js","/assets/AiKeys-BXIMTzqt.js","/assets/AnalysisBoard-wSSpsxCb.js","/assets/ApiAccess-BjfmExDG.js","/assets/AppLauncher-5uXhbm6I.js","/assets/Arc-BXOcvtxQ.js","/assets/Assessment-CgnGBA0g.js","/assets/AssessmentGrade-TZs9r5wg.js","/assets/AssessmentList-Dmagc1ad.js","/assets/Assistant-CDGHHNVr.js","/assets/AttendanceCleanup-DdVki6CL.js","/assets/AttendanceUpload-ldtT72mi.js","/assets/AuditTable-Qg-3AMQZ.js","/assets/Audits-B2Sih8Wx.js","/assets/BolimsModal-BuhAnAsY.js","/assets/BrigadirProfile-C0Yp3Bna.js","/assets/BrigadirsKpi-BLlJ7AEH.js","/assets/Broadcast-dvab1SCQ.js","/assets/BroadcastReceivers-AxR4zTCE.js","/assets/BroadcastRecord-BqO3EeM5.js","/assets/CatLockNotice-DTszzoCt.js","/assets/CategoryLegendModal-zJZqGehu.js","/assets/CellConcerns--X4H_Etx.js","/assets/CellDetails-CuGPwBuh.js","/assets/CellFormModal-CTF7U08P.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-I3cFSs5v.js","/assets/Cells-D9Gjynsk.js","/assets/ColumnFilter-FD2-mIUe.js","/assets/ColumnsPicker-3n4BoFTB.js","/assets/CommentsModal-V4znMa1c.js","/assets/ComparisonTable-CfrmuVwz.js","/assets/Concerns-CImTPgmh.js","/assets/ConcernsPieces-Be4cCiC6.js","/assets/ContainerBolims-CRUP40gS.js","/assets/ContainerFlow-BF1L9BMv.js","/assets/ContainerTotalsCard-xzXTt0JJ.js","/assets/Containers-D2sCwBJ8.js","/assets/CountStepper-Dpr9zqFv.js","/assets/Daily-CZ5jMSl0.js","/assets/DataSources-Cf6cbaUb.js","/assets/DataTable-CWFwLMgu.js","/assets/DateRangePicker-6ID9XpM7.js","/assets/DayReportView-D1ePdNOp.js","/assets/DayStepper-Dokpfn08.js","/assets/DayStrip-lzcgJtT8.js","/assets/DbBackup-DW_j531M.js","/assets/DifferenceBreakdown-DncVnlNM.js","/assets/DocAudit-Bb1x_E6L.js","/assets/Downtime-oFQodfZ-.js","/assets/Education-BeWu6M-v.js","/assets/EducationLesson-CQtfyd2l.js","/assets/EmptyState-D4dddb7a.js","/assets/Equipment-CeVGa1ny.js","/assets/Exam-Co64IcCw.js","/assets/ExamAdmin-DKSOPGO5.js","/assets/Factories-CqOI3zZV.js","/assets/FactorySelect-NEl4kf5Q.js","/assets/Gamification-SR56lJQ7.js","/assets/GroupBadge-BqWa7Ynr.js","/assets/HeatmapChart-D3DaN393.js","/assets/HourlyContainers-JIH52LYG.js","/assets/IdleCell-Ck5z4WUs.js","/assets/IdleOwners-BebS3b0G.js","/assets/IdleSolutions-CpVtecxM.js","/assets/KPICard-DQiYtbb9.js","/assets/Kaizen-ClCVcF_7.js","/assets/Kelish-9FD8cZ75.js","/assets/Kitchen-D2fAjqkf.js","/assets/KpiBits-Hwz6qBi6.js","/assets/KpiDeltaCard-CqqCGzIl.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-C6D53avO.js","/assets/LeaderAppeal-DnQ_ETDT.js","/assets/LeaderDailyTasks-UxU_vn_X.js","/assets/LeaderDayReport-DT-UqXfR.js","/assets/LeaderNotCounting-BwRAEwqb.js","/assets/LeaderTasksAdmin-BSK8O0eu.js","/assets/LeaderUnitReport-DYnbZS2I.js","/assets/Leaderboard-CHQwRzUr.js","/assets/Leaders-DE3Jn95J.js","/assets/LeadersKpi-DyAzA65J.js","/assets/Lightbox-DKq3UAtQ.js","/assets/LiveOverview-BtQAMxj-.js","/assets/Login-DuANlR95.js","/assets/Logs-BR_cGz5j.js","/assets/LostWorkers-Dr3XBN5h.js","/assets/NotFound-3AseuzcZ.js","/assets/Notifications-BY8b351A.js","/assets/NotionTasks-BZMQhY9j.js","/assets/NotionTrackerSettings-BtDDobIl.js","/assets/Ontime-DSRkXIfu.js","/assets/OrgChart-BdE9VrTn.js","/assets/Ovens-ZxMhilmi.js","/assets/OvensSettings-C33I8B8E.js","/assets/Overview-BvL704yk.js","/assets/OwnerChip-BhNqpxOQ.js","/assets/Pagination-C6Me1BF8.js","/assets/People-DVs881Cl.js","/assets/PerenaladkaFactTable-BdVT_JjU.js","/assets/Permissions-CxhQhNKD.js","/assets/PersonCard-Cr--Y8CS.js","/assets/PlanFulfillment-DsIdxt-r.js","/assets/Production-BSfU5qLU.js","/assets/ProductionUpload-DH1N1iJS.js","/assets/Profile-VwBTuzo0.js","/assets/ProfileAvatar-BdREYtwT.js","/assets/ProfilesManagement-Bkx05B77.js","/assets/ProofCamera-DMRvW9PE.js","/assets/ProofPhoto-C4UnGHJT.js","/assets/Quality-BBPT76Fo.js","/assets/RawRows-CILnar1P.js","/assets/Reports-MLM1Xqvj.js","/assets/RequestStateChip-j2W3P_iI.js","/assets/RichTextEditor-CdKR1kqW.js","/assets/SaveState-B-CFbwTE.js","/assets/SdPanelSettings-CCKntCqQ.js","/assets/SearchInput-YqNcstFA.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-DCbEn6zB.js","/assets/ShiftDaily-CGMcLeLk.js","/assets/ShiftTimes-Dk7F9SAP.js","/assets/SkuHistory-C2ePxNHi.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-ZmbSssog.js","/assets/StaffListAtCheck-qPjoxjq2.js","/assets/StatusBadge-FUnps1Js.js","/assets/StatusBandsModal-B5kYJrQX.js","/assets/TargetGoal-CAW4tbD5.js","/assets/Targets-IQANtMKv.js","/assets/TaskFormModal-C49BSTmA.js","/assets/TaskerSettings-9kunLQPq.js","/assets/Tasks-C9TMIAeM.js","/assets/TgProfile-B_iXpXi3.js","/assets/TimeWheelPicker-Baxx6Jcd.js","/assets/Tooltip-CQPSbGMT.js","/assets/TranslationsEditor-DkzRBchb.js","/assets/TrelloAnalytics-fIkum6WE.js","/assets/TrelloSettings-DUYrVHlq.js","/assets/TrendChart-DqReBYTB.js","/assets/TripleSpeedometer-DwLEbJoQ.js","/assets/Trudoyomkost-DV9u3Ftt.js","/assets/UploadDropzone-BI-dJnPq.js","/assets/UsersActivity-C40KMmS1.js","/assets/UsersManagement-BNIVfBJ_.js","/assets/VerifixPage-q4I2neeV.js","/assets/VerifixParity-BZ3bc1ta.js","/assets/VfxApiMap-CGASNUt8.js","/assets/VfxDictionaries-DJcagyMB.js","/assets/VfxEmployees-DJqRKaWF.js","/assets/VfxHrMoves-Dqe1ZAaH.js","/assets/VfxJobs-CRIWBEBv.js","/assets/VfxPhoto-JtHYEyt9.js","/assets/VfxShifts-BptOCdSx.js","/assets/VfxState-b1vvx7eG.js","/assets/VfxTimebooks-BlggdFrt.js","/assets/VfxTimesheet-HkBrMbdF.js","/assets/WatchProgress-B4k-me2M.js","/assets/WebLogin-n86V_gex.js","/assets/WorkersAttendance-B0o4CBQs.js","/assets/WorkersComposition-KTXzglmD.js","/assets/WorkersMovements-C4fQvWCF.js","/assets/WorkersPage-Ckvuqzqs.js","/assets/Zagruzka-B1r1O9jx.js","/assets/ZagruzkaCell-B5w3BF-_.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-CTS3zDvp.js","/assets/api-D_IoyhCc.js","/assets/appealTask-DkigHIvv.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-j1a3ZdUx.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bolim-TbqNYNfw.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-F9FX4cAV.js","/assets/broadcastTree-DNAbIURD.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-Bb4imHev.js","/assets/categories-BWLz1XZq.js","/assets/cellMoveRefusal-BLX_48kC.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DSPK0Id0.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-Dp_4PPO5.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-B4Fge4fZ.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-qP07_7mF.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BopWjT-d.js","/assets/index-DEXwbGtN.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-C-wyUyrR.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/marks-DYhJJS3u.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-C3INbu2Z.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DJwFT7KL.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-De9SXXZS.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CovmKlQv.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-j6CRQ3hW.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BkLpEAbz.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-BsRUXRKD.js","/assets/useMutation-Uf7n5aV0.js","/assets/useOpenParam-NsliogOX.js","/assets/useStatusBands-BXGcPisn.js","/assets/useUrlScope-C6sN7wvg.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BlS4Gwnt.js","/assets/uz_cyrl-4M5IjNa9.js","/assets/vfx-Bj7pjVZC.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-C4VE--wZ.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
