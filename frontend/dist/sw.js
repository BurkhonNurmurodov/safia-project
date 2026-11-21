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

const BUILD = "2026-11-21T09:16:42.118Z";
const PRECACHE = ["/","/assets/AdminPage-BDs3q2Af.js","/assets/AdminTabs-Db9wcecK.js","/assets/AiKeys-DIYUtnRG.js","/assets/AnalysisBoard-srqzPR0q.js","/assets/ApiAccess-AcJBn19w.js","/assets/AppLauncher-CSm9XL7B.js","/assets/Arc-ClRG1q-5.js","/assets/Assessment-BNqKmNCO.js","/assets/AssessmentGrade-B1oqYdLv.js","/assets/AssessmentList-Q4IXYKCX.js","/assets/Assistant-CWwJ8dHN.js","/assets/AttendanceCleanup-DoE-YQN7.js","/assets/AttendanceUpload-DL2Wd955.js","/assets/AuditTable-DQTj1h7Z.js","/assets/BrigadirProfile-yGw5SsMv.js","/assets/BrigadirsKpi-DPsHoaTT.js","/assets/Broadcast-Bsm2vEu7.js","/assets/BroadcastReceivers-B6vONIB4.js","/assets/BroadcastRecord-DJbpW-dm.js","/assets/CatLockNotice-haPgVViQ.js","/assets/CategoryLegendModal-5D8KVkSW.js","/assets/CellConcerns-DV4SfkPF.js","/assets/CellDetails-CS308yk-.js","/assets/CellFormModal-1LepBNHd.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-BYbAdVwv.js","/assets/Cells-Qxyerna5.js","/assets/ColumnFilter-BY16RKIO.js","/assets/ColumnsPicker-CxvAWLz7.js","/assets/CommentsModal-C-4L85u4.js","/assets/ComparisonTable-DNj7AI76.js","/assets/Concerns-A9NMMSNW.js","/assets/ConcernsPieces-DiO21stV.js","/assets/ContainerFlow-CUUJtCKU.js","/assets/ContainerTotalsCard-kxvimBdQ.js","/assets/Containers-gkL7xXdP.js","/assets/CountStepper-p5EfA2te.js","/assets/Daily-BPCiHaRl.js","/assets/DataSources-Wen0f1qx.js","/assets/DataTable-BsFRL2YZ.js","/assets/DateRangePicker-CK4RktFB.js","/assets/DayReportView-DvUzDxBU.js","/assets/DayStepper-pymv1X8I.js","/assets/DayStrip-CLyUu0-U.js","/assets/DbBackup-Coy9C6l4.js","/assets/DifferenceBreakdown-CYBTOAA7.js","/assets/DocAudit-CuYp_SiK.js","/assets/Downtime-CXY6zvBV.js","/assets/Education-BGfDxb05.js","/assets/EducationLesson-BeHOXi47.js","/assets/EmptyState-BlFhigIz.js","/assets/Equipment-gISd8CQC.js","/assets/Exam-DOi1sbcO.js","/assets/ExamAdmin-BbaeYFOH.js","/assets/Factories-BofT0uFo.js","/assets/FactorySelect-BjoOu0Az.js","/assets/Gamification-BZzeA1vH.js","/assets/GroupBadge-BSFlggvv.js","/assets/HeatmapChart-AInnAp6X.js","/assets/HourlyContainers-Bw1F9oLu.js","/assets/IdleCell-B-jlSGLN.js","/assets/IdleOwners-ORQBuJj1.js","/assets/IdleSolutions-Dqk29KdX.js","/assets/KPICard-B9nv4GeR.js","/assets/Kaizen-X1Gks_Gn.js","/assets/Kelish-C2qFbRV7.js","/assets/Kitchen-DLyOnPB9.js","/assets/KpiBits-BtlCikEO.js","/assets/KpiDeltaCard-BzBzR-EF.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-Czj6I3U1.js","/assets/LeaderAppeal-OuedhTWU.js","/assets/LeaderDailyTasks-Dve4kwmh.js","/assets/LeaderDayReport-CAk0zxf4.js","/assets/LeaderNotCounting-tqt2W7sq.js","/assets/LeaderTasksAdmin-BLhqxCG3.js","/assets/LeaderUnitReport-CvuJCPXB.js","/assets/Leaderboard-DIMCbOTf.js","/assets/Leaders-B-fZkJ71.js","/assets/LeadersKpi-Eca4iGsz.js","/assets/Lightbox-s_lK6vt2.js","/assets/LiveOverview-DTblcUCA.js","/assets/Login-BLosMgLS.js","/assets/Logs-B56RmXk9.js","/assets/LostWorkers-CfujdcxL.js","/assets/NotFound-CfRMfzGL.js","/assets/Notifications-CLxTe2Vo.js","/assets/NotionTasks-KbVM1E-T.js","/assets/NotionTrackerSettings-62cX4Uy0.js","/assets/Ontime-C0QIf-vB.js","/assets/OrgChart-DY0DrVJF.js","/assets/Ovens-CSHcrDx7.js","/assets/OvensSettings-BJMdnnU6.js","/assets/Overview-BFCGpHgl.js","/assets/OwnerChip-De-8ZPIp.js","/assets/Pagination-dMGCx6bS.js","/assets/People-B3iDBP4J.js","/assets/PerenaladkaFactTable-Cmj_Eldr.js","/assets/Permissions-CnvKoUAh.js","/assets/PersonCard-CkxPqoRK.js","/assets/PlanFulfillment-DQp3JL2e.js","/assets/Production-DQdq4bmj.js","/assets/ProductionUpload-BbhOrwNa.js","/assets/Profile-COcVMYQU.js","/assets/ProfileAvatar-BqOdrtFJ.js","/assets/ProfilesManagement-B6n4q9hU.js","/assets/ProofCamera-BdbsuvJr.js","/assets/ProofPhoto-BGES4FGC.js","/assets/Quality-BAjP7xKP.js","/assets/RawRows-C-lrwIFD.js","/assets/Reports-BAykf6z5.js","/assets/RequestStateChip-BBb9IbZk.js","/assets/RichTextEditor-BF_T3m-J.js","/assets/SaveState-DBBx6q8U.js","/assets/SdPanelSettings-BGT3MtGw.js","/assets/SearchInput-DNSiH1TD.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-LXsbt0Pa.js","/assets/ShiftDaily-HOTSGx-7.js","/assets/ShiftTimes-Bd_Xwsfo.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-Dr60pSqP.js","/assets/StaffListAtCheck-CD8Pmb0r.js","/assets/StatusBadge-B91AFXTB.js","/assets/StatusBandsModal-lRy0Kfcw.js","/assets/TargetGoal-DRL39oz0.js","/assets/Targets-DyV7Q8NB.js","/assets/TaskFormModal-Cj-lpD0m.js","/assets/TaskerSettings-CBMr76be.js","/assets/Tasks-BI_HKT1E.js","/assets/TgProfile-whyW_S4a.js","/assets/TimeWheelPicker-7krOlRe_.js","/assets/Tooltip-CbkDri4a.js","/assets/TranslationsEditor-CoOo12cX.js","/assets/TrelloAnalytics-BWxcqm8t.js","/assets/TrelloSettings-D2NS2keL.js","/assets/TrendChart-BHZtKcFB.js","/assets/TripleSpeedometer-CoQl69ht.js","/assets/Trudoyomkost-BqnuDnOX.js","/assets/UploadDropzone-C5U9JKQd.js","/assets/UsersActivity-DhHtFNNL.js","/assets/UsersManagement-C_Q27HTX.js","/assets/VerifixPage-Bq7Ey6Jz.js","/assets/VerifixParity-UMoCSOt-.js","/assets/VfxApiMap-ChOjlc1j.js","/assets/VfxDictionaries-Ce2PSL3b.js","/assets/VfxEmployees-Dp_hdIX4.js","/assets/VfxHrMoves-7bZZo0e2.js","/assets/VfxJobs-DmqKAXTX.js","/assets/VfxPhoto-C8TVMPbX.js","/assets/VfxShifts-CfPMzDoS.js","/assets/VfxState-BnoeR-ln.js","/assets/VfxTimebooks-COAWDTBo.js","/assets/VfxTimesheet-UutbIBtm.js","/assets/WatchProgress-4RKkOZW6.js","/assets/WebLogin-ZFgszBMP.js","/assets/WorkersAttendance-CA4jfpfY.js","/assets/WorkersComposition-08Gn2cLA.js","/assets/WorkersMovements-KgNG-m8O.js","/assets/WorkersPage-L-aVeh_I.js","/assets/Zagruzka-Cb9yRZoW.js","/assets/ZagruzkaCell-DzDL-wo6.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-D8QpIH4-.js","/assets/api-D_IoyhCc.js","/assets/appealTask-BxOfE9fh.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-CjWhfrlz.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-BXqBAktl.js","/assets/broadcastTree-CgHbgIvZ.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-Dob_rfvv.js","/assets/categories-BqODPINM.js","/assets/cellMoveRefusal-DzWBh6Lj.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-UoAIihTN.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-CMVy5PBy.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-e8QKbv_T.js","/assets/flowUtil-BauToz_I.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Bv1vc-CF.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-D8WbwgRu.css","/assets/index-umXKbFId.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BRQdYWrI.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-gDR80YAC.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-7bSXnCEd.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CEQXzCVD.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-BSaorO0h.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-B_OjINP-.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CAvz4oo0.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BQlXfl48.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-BCo_Gf-w.js","/assets/useMutation-BbIKhvQ_.js","/assets/useOpenParam-mX8WUbYI.js","/assets/useStatusBands-CORynGoV.js","/assets/useUrlScope-C9pg1IsM.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-B2_G5NlY.js","/assets/uz_cyrl-ZR77X3QR.js","/assets/vfx-23uy4Ars.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-CQ_ntwmb.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
