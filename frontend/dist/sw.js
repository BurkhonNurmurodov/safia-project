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

const BUILD = "2026-11-23T07:53:20.558Z";
const PRECACHE = ["/","/assets/AdminPage-eNlbZha3.js","/assets/AdminTabs-CP-MwuKE.js","/assets/AiKeys-DgyxZmxY.js","/assets/AnalysisBoard-CJ9fSYvE.js","/assets/ApiAccess-BqseyxZS.js","/assets/AppLauncher-zuGl6JRg.js","/assets/Arc-BXdQLV2y.js","/assets/Assessment-8h5HC2Sh.js","/assets/AssessmentGrade-CvqAC8_G.js","/assets/AssessmentList-up4-eXL2.js","/assets/Assistant-BBLMldCo.js","/assets/AttendanceCleanup-y81rPhOq.js","/assets/AttendanceUpload-Bd8x-m-5.js","/assets/AuditTable-lm-6d73N.js","/assets/Audits-Bf8uK16y.js","/assets/BrigadirProfile-DHNgmcD2.js","/assets/BrigadirsKpi-DIGTIJMs.js","/assets/Broadcast-Dt1Zp-8-.js","/assets/BroadcastReceivers-DO7LgVbm.js","/assets/BroadcastRecord-DuwFuAHZ.js","/assets/CatLockNotice-CxJlOuH_.js","/assets/CategoryLegendModal-DXubfATe.js","/assets/CellConcerns-ZTDFsRTB.js","/assets/CellDetails-DfettSr3.js","/assets/CellFormModal-Dnmtqq6p.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-C2T49UcG.js","/assets/Cells-IHJ9zy32.js","/assets/ColumnFilter-Bl9L9EeG.js","/assets/ColumnsPicker-DEM89n6o.js","/assets/CommentsModal-tKe2CpXr.js","/assets/ComparisonTable-BTKVA7zH.js","/assets/Concerns-fGUEZju_.js","/assets/ConcernsPieces-BYMRvFbx.js","/assets/ContainerFlow-B-Rgrocn.js","/assets/ContainerTotalsCard-CGAVpe2r.js","/assets/Containers-IY8rz7la.js","/assets/CountStepper-CF9Esvqn.js","/assets/Daily-nkpLEG4_.js","/assets/DataSources-yWxm0MQt.js","/assets/DataTable-1xCw8Pjn.js","/assets/DateRangePicker-B0-cp_XI.js","/assets/DayReportView-Bnu_qDfx.js","/assets/DayStepper-DHOsa5Yh.js","/assets/DayStrip-rQqgOdsa.js","/assets/DbBackup-YrzWzzgZ.js","/assets/DifferenceBreakdown-BoX5R-nj.js","/assets/DocAudit-qXP0vskM.js","/assets/Downtime-CZUoxQW7.js","/assets/Education-CT8oDSg1.js","/assets/EducationLesson-mfU2pBUA.js","/assets/EmptyState-CaF7zhLr.js","/assets/Equipment-BhTyEt4e.js","/assets/Exam-BjWY_m7C.js","/assets/ExamAdmin-nCUklGP9.js","/assets/Factories-DOPEB2Ar.js","/assets/FactorySelect-Rfq2G2q1.js","/assets/Gamification-CK6bG7R-.js","/assets/GroupBadge-CaIrb_Ww.js","/assets/HeatmapChart-DER73qPu.js","/assets/HourlyContainers-qtM76MNF.js","/assets/IdleCell-DzL0WKPJ.js","/assets/IdleOwners-DdRk1YsY.js","/assets/IdleSolutions-DV3m8Qp6.js","/assets/KPICard-DqJZ8gGh.js","/assets/Kaizen-CXk0YpIA.js","/assets/Kelish-uHVQwbT4.js","/assets/Kitchen-BX0Cze6D.js","/assets/KpiBits-Bm0YhSBq.js","/assets/KpiDeltaCard-SWB7MC9i.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-DwpNFl_z.js","/assets/LeaderAppeal-3rVHSPif.js","/assets/LeaderDailyTasks-BTWMq85l.js","/assets/LeaderDayReport-ZOYljR_E.js","/assets/LeaderNotCounting-BhW8KnWq.js","/assets/LeaderTasksAdmin-Clq2pPi-.js","/assets/LeaderUnitReport-8FMehhz9.js","/assets/Leaderboard-Dgp3ORs_.js","/assets/Leaders-CMX9z1uM.js","/assets/LeadersKpi-Cp2imPcp.js","/assets/Lightbox-o3Y9AMFQ.js","/assets/LiveOverview-DjZ37MGy.js","/assets/Login-MdwlqOv4.js","/assets/Logs-CPH_wg1Y.js","/assets/LostWorkers-D54tHilU.js","/assets/NotFound-CDPFUoWZ.js","/assets/Notifications-CROnaoK5.js","/assets/NotionTasks-B1YBHmQ6.js","/assets/NotionTrackerSettings-Ci571Wal.js","/assets/Ontime-fBbIEaWm.js","/assets/OrgChart-C-lWUY4V.js","/assets/Ovens-BezO_eQE.js","/assets/OvensSettings-B6J__aAL.js","/assets/Overview-GzCep9M-.js","/assets/OwnerChip-DKDkzlyn.js","/assets/Pagination-CMOoABjA.js","/assets/People-28Y_Hd7B.js","/assets/PerenaladkaFactTable-BtP6hB9_.js","/assets/Permissions-BFM18r_V.js","/assets/PersonCard-VPqIoc5Q.js","/assets/PlanFulfillment-DpqthoVw.js","/assets/Production-BT-_Qru5.js","/assets/ProductionUpload-GE7gX0LY.js","/assets/Profile-a-qvDLNn.js","/assets/ProfileAvatar-CT-H3weI.js","/assets/ProfilesManagement-CikNO00F.js","/assets/ProofCamera-149VU7Q9.js","/assets/ProofPhoto-2jSIIo1x.js","/assets/Quality-DTdJ3SFy.js","/assets/RawRows-CRdyBAJq.js","/assets/Reports-CDqHhgHy.js","/assets/RequestStateChip-CzedUv1_.js","/assets/RichTextEditor-DROs3S91.js","/assets/SaveState-B2tVGz7p.js","/assets/SdPanelSettings-DFebQJFA.js","/assets/SearchInput-BpUifMVg.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-BT3W7n45.js","/assets/ShiftDaily-DpWd8v4z.js","/assets/ShiftTimes-Pj8fNzGh.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-Cny8Zfws.js","/assets/StaffListAtCheck-JIxJQxUH.js","/assets/StatusBadge-BRyFjtXf.js","/assets/StatusBandsModal-Di_sG_sS.js","/assets/TargetGoal-DeW-ZDKJ.js","/assets/Targets-BAa2_v-e.js","/assets/TaskFormModal-DdQxypCz.js","/assets/TaskerSettings-dXUqGZD-.js","/assets/Tasks-DMHYGXL2.js","/assets/TgProfile-Dt0hsyDg.js","/assets/TimeWheelPicker-BOw8jMVa.js","/assets/Tooltip-BySxtZQs.js","/assets/TranslationsEditor-DJNyCG-S.js","/assets/TrelloAnalytics-B1-n3A2S.js","/assets/TrelloSettings-CayrQMJc.js","/assets/TrendChart-C3sHHall.js","/assets/TripleSpeedometer-DmyXvUrm.js","/assets/Trudoyomkost-C6uBTg7d.js","/assets/UploadDropzone-BmmYuups.js","/assets/UsersActivity-CrOp3_bw.js","/assets/UsersManagement-CDgodDey.js","/assets/VerifixPage-BdevE0ww.js","/assets/VerifixParity-CeRkbViw.js","/assets/VfxApiMap-B0ABi5Jn.js","/assets/VfxDictionaries-CmloP7VP.js","/assets/VfxEmployees-WOb2l0WT.js","/assets/VfxHrMoves-CMQgJNKu.js","/assets/VfxJobs-B1toSfsM.js","/assets/VfxPhoto-DZX2IQcl.js","/assets/VfxShifts-BrYxBo_S.js","/assets/VfxState-JQLXqsat.js","/assets/VfxTimebooks-D1qNf3zp.js","/assets/VfxTimesheet-DDPtWeqg.js","/assets/WatchProgress-BHgXZ39U.js","/assets/WebLogin-YBzt55o2.js","/assets/WorkersAttendance-BsdCqYs0.js","/assets/WorkersComposition-Dolu5gCZ.js","/assets/WorkersMovements-Basz2hju.js","/assets/WorkersPage-f9wZ8Sbk.js","/assets/Zagruzka-CsZYU8fz.js","/assets/ZagruzkaCell-C4bcASZz.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-DRam-ftA.js","/assets/api-D_IoyhCc.js","/assets/appealTask-ColXH5E3.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-l6HzOCVy.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DfKjFHLP.js","/assets/broadcastTree-C_Noahvg.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-XUCRfBRj.js","/assets/categories-CcAfejCI.js","/assets/cellMoveRefusal-BquF2MTI.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DFc2_B35.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-DuEmuIsG.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-KxR2q95l.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CUlvLTkW.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-A5KKHiI_.js","/assets/index-DkyflHqG.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-CjvsgvrX.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-Tyj_57dh.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-DPCczGqR.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BgoUEarq.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-Bw0Jfd1X.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BIJ54aVv.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CiMh9FwC.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DeNHkMp7.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-CzXDA7ts.js","/assets/useMutation-BHpJsGaW.js","/assets/useOpenParam-BbOGdjTc.js","/assets/useStatusBands-C2QIQAVA.js","/assets/useUrlScope-BHf_Vb-l.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-2AT6LMfp.js","/assets/uz_cyrl-C2MQKT0f.js","/assets/vfx-BOhirqQy.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-CI6eQ-tU.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
