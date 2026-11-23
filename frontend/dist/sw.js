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

const BUILD = "2026-11-23T08:48:34.105Z";
const PRECACHE = ["/","/assets/AdminPage-l8bdKaxF.js","/assets/AdminTabs-g3Ts-kVD.js","/assets/AiKeys-BhbcPmkT.js","/assets/AnalysisBoard-COEdfu-i.js","/assets/ApiAccess-C9NOl2b1.js","/assets/AppLauncher-BHI3Rtui.js","/assets/Arc-DyfM5DDh.js","/assets/Assessment-BkYDmLbz.js","/assets/AssessmentGrade-BKikpPiD.js","/assets/AssessmentList-CR3-l-Q4.js","/assets/Assistant-CyD6G5rO.js","/assets/AttendanceCleanup-CgbgRWyi.js","/assets/AttendanceUpload-Bj3PldMy.js","/assets/AuditTable-BuukrGDQ.js","/assets/Audits-Cu2eFDgo.js","/assets/BrigadirProfile-BonZdARu.js","/assets/BrigadirsKpi-C7M2Vkwq.js","/assets/Broadcast-Cej47CHI.js","/assets/BroadcastReceivers-Ce9Nb91o.js","/assets/BroadcastRecord-DE61Orzn.js","/assets/CatLockNotice-DtYKGK9L.js","/assets/CategoryLegendModal-By21Kgli.js","/assets/CellConcerns-Da7qQLY2.js","/assets/CellDetails-CVKb8jRg.js","/assets/CellFormModal-DZ7Z-iql.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-XT2qtMu3.js","/assets/Cells-yunOSOyr.js","/assets/ColumnFilter-7ijvo2en.js","/assets/ColumnsPicker-CHNVp_wF.js","/assets/CommentsModal-BZG1jovR.js","/assets/ComparisonTable-BVwROeJy.js","/assets/Concerns-CPZs8rtL.js","/assets/ConcernsPieces-BuD5kdgB.js","/assets/ContainerFlow-2SdBCU-Z.js","/assets/ContainerTotalsCard-6IXTsC4Y.js","/assets/Containers-YlYQFQAc.js","/assets/CountStepper-CP7u36z-.js","/assets/Daily-ClCGGyG0.js","/assets/DataSources-CsIn5vPj.js","/assets/DataTable-iDFNBYEO.js","/assets/DateRangePicker-BChNYLIa.js","/assets/DayReportView-mXHCVq4a.js","/assets/DayStepper-DCOiVKv9.js","/assets/DayStrip-CjfPKP-n.js","/assets/DbBackup-CY9ci2ck.js","/assets/DifferenceBreakdown-FAsy7iKw.js","/assets/DocAudit-BVpjIctS.js","/assets/Downtime-ZDqGlo0W.js","/assets/Education-DueBkypv.js","/assets/EducationLesson-BgseDjH3.js","/assets/EmptyState-CKCEnYMQ.js","/assets/Equipment-Cr6UISYk.js","/assets/Exam-Bsxs4W87.js","/assets/ExamAdmin-BCL8Nyi3.js","/assets/Factories-DMKfFUmN.js","/assets/FactorySelect-BPK2_W5W.js","/assets/Gamification-D_gw8hc2.js","/assets/GroupBadge-BXtXib-N.js","/assets/HeatmapChart-JyGoyxb_.js","/assets/HourlyContainers-CYcInAZf.js","/assets/IdleCell-Cm7rz6HW.js","/assets/IdleOwners-Cw5WnACj.js","/assets/IdleSolutions-_3HpvV6c.js","/assets/KPICard-Bl5WzLTD.js","/assets/Kaizen-423ojfp7.js","/assets/Kelish-BKwABauq.js","/assets/Kitchen-CeokAyR8.js","/assets/KpiBits-DT52cfTj.js","/assets/KpiDeltaCard-DcTxOcFx.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-Cvsd9mVO.js","/assets/LeaderAppeal-BaOc8uB9.js","/assets/LeaderDailyTasks-BfjdHkl6.js","/assets/LeaderDayReport-CaJZWHmB.js","/assets/LeaderNotCounting-DblMwNPQ.js","/assets/LeaderTasksAdmin-RHJev3Qx.js","/assets/LeaderUnitReport-BujEoaPC.js","/assets/Leaderboard-DMVZ8jNv.js","/assets/Leaders-BsV9g8QS.js","/assets/LeadersKpi-Bb3H2E12.js","/assets/Lightbox-BOL-89Lw.js","/assets/LiveOverview-BOc4kuUs.js","/assets/Login-C5GKReoM.js","/assets/Logs-CfZS_lX8.js","/assets/LostWorkers-BTtrBPRO.js","/assets/NotFound-DZHX8Mub.js","/assets/Notifications-wYhAu9Xa.js","/assets/NotionTasks-DzcqLtRy.js","/assets/NotionTrackerSettings-DAmByukG.js","/assets/Ontime-CWckaJoj.js","/assets/OrgChart-B306ntPQ.js","/assets/Ovens-MAHc9dr-.js","/assets/OvensSettings-BqIFl635.js","/assets/Overview-B-Odnbqw.js","/assets/OwnerChip-DX7Uo-zv.js","/assets/Pagination-uxTOxhfM.js","/assets/People-pyhQerC7.js","/assets/PerenaladkaFactTable-B08lmPVr.js","/assets/Permissions-CtrUIYu_.js","/assets/PersonCard-B3DIK3VM.js","/assets/PlanFulfillment-C31jwhSn.js","/assets/Production-zqlY8UFM.js","/assets/ProductionUpload-1fRcvYOi.js","/assets/Profile-BXdtZKXY.js","/assets/ProfileAvatar-Bz8EbaKD.js","/assets/ProfilesManagement-B3F85s7f.js","/assets/ProofCamera-PQi4uAU5.js","/assets/ProofPhoto-BpZTQ1-s.js","/assets/Quality-BWuwuWlP.js","/assets/RawRows-ut-x034U.js","/assets/Reports-pUEIVPI4.js","/assets/RequestStateChip-3bl8jFr_.js","/assets/RichTextEditor-D7TlW5dH.js","/assets/SaveState-C0ju8l6f.js","/assets/SdPanelSettings-rxKk_WeV.js","/assets/SearchInput-BYCwneLC.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-V710Q4gX.js","/assets/ShiftDaily-CTfs3ytq.js","/assets/ShiftTimes-B8cblbCg.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-BWdGjWaO.js","/assets/StaffListAtCheck-DYhy1ej1.js","/assets/StatusBadge-B0betzXH.js","/assets/StatusBandsModal-Bn8UQdfc.js","/assets/TargetGoal-CGGzncZJ.js","/assets/Targets-D38vY-qK.js","/assets/TaskFormModal-DgZui9LU.js","/assets/TaskerSettings-eo6pizRY.js","/assets/Tasks-O0G9WdQs.js","/assets/TgProfile-D0JrG9tC.js","/assets/TimeWheelPicker-Dt4MmnQM.js","/assets/Tooltip-C3h0A-d6.js","/assets/TranslationsEditor-B0p1xgfK.js","/assets/TrelloAnalytics-CIyAWDho.js","/assets/TrelloSettings-CDr3z_oR.js","/assets/TrendChart-DPV2l7IR.js","/assets/TripleSpeedometer-D4wZoYzS.js","/assets/Trudoyomkost-DtzbbhG6.js","/assets/UploadDropzone-CyfNnG5t.js","/assets/UsersActivity-B41jbAMh.js","/assets/UsersManagement-D_7JUmoJ.js","/assets/VerifixPage-40M7ddOe.js","/assets/VerifixParity-W4durYNd.js","/assets/VfxApiMap-CxR8ejP7.js","/assets/VfxDictionaries-DHIQz2-c.js","/assets/VfxEmployees-BkkcgXYq.js","/assets/VfxHrMoves-DG8ckG5Y.js","/assets/VfxJobs-BKH43Em_.js","/assets/VfxPhoto-BMdBzBe8.js","/assets/VfxShifts-CPNwmx4C.js","/assets/VfxState-CjzVvtXf.js","/assets/VfxTimebooks-rhK6DdrI.js","/assets/VfxTimesheet-lknbId-r.js","/assets/WatchProgress-fUcaQu5R.js","/assets/WebLogin-CJHsmpm3.js","/assets/WorkersAttendance-l-B1J2Sp.js","/assets/WorkersComposition-Bhfj8ALs.js","/assets/WorkersMovements-Dcn9-h9t.js","/assets/WorkersPage-CEWFQRmk.js","/assets/Zagruzka-CRHNys2c.js","/assets/ZagruzkaCell-Bmjs736P.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Si8w3NQb.js","/assets/api-D_IoyhCc.js","/assets/appealTask-DThJgtRO.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-DpeUFk5n.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-czePyF0_.js","/assets/broadcastTree-DKijK9qN.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-EAIk9Dn2.js","/assets/categories-B2X5LaEU.js","/assets/cellMoveRefusal-BSZW8Hj9.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Zv54vjrU.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-DuEmuIsG.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-DxTsa3xN.js","/assets/flowUtil-Da_Sp6U7.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CQ_s4Txq.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DkyflHqG.css","/assets/index-b93A5pop.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DdHj1INi.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DTfUtRUq.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-t3ut_i_j.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-OCW6WOBr.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-Bw0Jfd1X.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BRW3NLX1.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CiMh9FwC.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DaGKANAd.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-CFuEYr0B.js","/assets/useMutation-DPDCEXJl.js","/assets/useOpenParam-fWr1Sh4J.js","/assets/useStatusBands-Hk5RB934.js","/assets/useUrlScope-DFFimy1V.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-2AT6LMfp.js","/assets/uz_cyrl-C2MQKT0f.js","/assets/vfx-DSYCtbxz.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-DPE7cRsT.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
