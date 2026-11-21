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

const BUILD = "2026-11-21T09:19:59.268Z";
const PRECACHE = ["/","/assets/AdminPage-CdWypBfX.js","/assets/AdminTabs-DuDSIENJ.js","/assets/AiKeys-C-BOG9kj.js","/assets/AnalysisBoard-CRoDgKzJ.js","/assets/ApiAccess-xOxbqiL0.js","/assets/AppLauncher-CiAcGQxx.js","/assets/Arc-DahAmZbP.js","/assets/Assessment-DZhFmpWR.js","/assets/AssessmentGrade-HmTiOG1E.js","/assets/AssessmentList-BrotEXNB.js","/assets/Assistant-CSzvNSkw.js","/assets/AttendanceCleanup-DGwc6iAI.js","/assets/AttendanceUpload-aBY1VgVP.js","/assets/AuditTable-u1TDKLJ5.js","/assets/Audits-DJSeRIx5.js","/assets/BrigadirProfile-Cc_RmQbf.js","/assets/BrigadirsKpi-DXqQahZI.js","/assets/Broadcast-BfDX1VzJ.js","/assets/BroadcastReceivers-DGdUO_SU.js","/assets/BroadcastRecord-BgJZycUo.js","/assets/CatLockNotice-7viCYoyw.js","/assets/CategoryLegendModal-HosH274o.js","/assets/CellConcerns-CFNWZz5H.js","/assets/CellDetails-BOQGlxIf.js","/assets/CellFormModal-P-zuqDPA.js","/assets/CellIdent-DK0XrrdR.js","/assets/CellLink-X7NofO2B.js","/assets/Cells-BSEkyin8.js","/assets/ColumnFilter-CN156wP_.js","/assets/ColumnsPicker-CK7Vp9T5.js","/assets/CommentsModal-CrYZnKMS.js","/assets/ComparisonTable-bCyoa4Sb.js","/assets/Concerns-DJ6CbjVQ.js","/assets/ConcernsPieces-Db9koDDp.js","/assets/ContainerFlow-BmZIyVzU.js","/assets/ContainerTotalsCard-CsBJsFVn.js","/assets/Containers-Cbds3Myy.js","/assets/CountStepper-_Cxq1EEW.js","/assets/Daily-BZgaWIvF.js","/assets/DataSources-c6wfrunK.js","/assets/DataTable-BEbSqYbq.js","/assets/DateRangePicker-CfKLqbWL.js","/assets/DayReportView-C7meSWyU.js","/assets/DayStepper-5BU_8BMQ.js","/assets/DayStrip-FzbObwqb.js","/assets/DbBackup-RJnJREgM.js","/assets/DifferenceBreakdown-DtGbIX1n.js","/assets/DocAudit-DRgHxCMd.js","/assets/Downtime-LTZlpMJs.js","/assets/Education-BvcjDXfx.js","/assets/EducationLesson-MyjGOiVX.js","/assets/EmptyState-Bc6Kc72s.js","/assets/Equipment-Bfl8WNjF.js","/assets/Exam-CoVnxVrE.js","/assets/ExamAdmin-DXQEzjI9.js","/assets/Factories-D3G5kJY4.js","/assets/FactorySelect-DScGis2h.js","/assets/Gamification-ClYOoEM5.js","/assets/GroupBadge-B8hRA9yi.js","/assets/HeatmapChart-DPVJ0KUE.js","/assets/HourlyContainers-BN8oItlO.js","/assets/IdleCell-D0YKtGwe.js","/assets/IdleOwners-C0jxzeI2.js","/assets/IdleSolutions-BaAzIuRE.js","/assets/KPICard-BxE0iurc.js","/assets/Kaizen-CDWiwb_q.js","/assets/Kelish-DIHVnnBE.js","/assets/Kitchen-BM_3VTEv.js","/assets/KpiBits-D-gvQ31v.js","/assets/KpiDeltaCard-rzD7-nSl.js","/assets/LangContext-mL2fcC7w.js","/assets/LangTextInput-DJBMtGyQ.js","/assets/Layout-BbdBypjv.js","/assets/LeaderAppeal-DmFzGUzh.js","/assets/LeaderDailyTasks-DuagR5vg.js","/assets/LeaderDayReport-UyJVT8rK.js","/assets/LeaderNotCounting-BZ7DN2oM.js","/assets/LeaderTasksAdmin-BW-xiu2Y.js","/assets/LeaderUnitReport-DgIwAiq9.js","/assets/Leaderboard-BkWw7_yt.js","/assets/Leaders-DH8Cdgeh.js","/assets/LeadersKpi-BXjVOjit.js","/assets/Lightbox-B4JFdSjZ.js","/assets/LiveOverview-DJgLt4np.js","/assets/Login-Dqok32bL.js","/assets/Logs-DSe0Mu2m.js","/assets/LostWorkers-6V4ehr2P.js","/assets/NotFound-BzkjXwWn.js","/assets/Notifications-DTcPESg1.js","/assets/NotionTasks-BHJ6wS-h.js","/assets/NotionTrackerSettings-B4p8m3Gp.js","/assets/Ontime-3xGvBSMw.js","/assets/OrgChart-CiUHxTh9.js","/assets/Ovens-DbeHJhU_.js","/assets/OvensSettings-BjtuM1sC.js","/assets/Overview-ewgC9j3u.js","/assets/OwnerChip-D0H6dK2I.js","/assets/Pagination-DM1oGIDw.js","/assets/People-BHVsT2Te.js","/assets/PerenaladkaFactTable-CRw1uIcL.js","/assets/Permissions-CDNWFJEU.js","/assets/PersonCard-bBKzfGTp.js","/assets/PlanFulfillment-DU2BXvpJ.js","/assets/Production-iuXEIx2U.js","/assets/ProductionUpload-Bc1WapOQ.js","/assets/Profile-Cp0xpdJY.js","/assets/ProfileAvatar-Ci-dokJ4.js","/assets/ProfilesManagement-Dz2d0kAL.js","/assets/ProofCamera-BnGrNpYS.js","/assets/ProofPhoto-DC0i7CgP.js","/assets/Quality-CuVhVK33.js","/assets/RawRows-DYOTP0tj.js","/assets/Reports-BXv9709r.js","/assets/RequestStateChip-HqL04iQx.js","/assets/RichTextEditor-DSve1Uqk.js","/assets/SaveState-CLhvJHvV.js","/assets/SdPanelSettings-DbfGvwqK.js","/assets/SearchInput-DirXbJQP.js","/assets/SeasonalityHeatmap-a3z-VdLz.js","/assets/SegmentedToggle-BdR85Ow3.js","/assets/SetupTimes-DbdN4nk4.js","/assets/ShiftDaily-BWhf7ZOU.js","/assets/ShiftTimes-VmXYL2yD.js","/assets/SortableList-BLXgMb-x.js","/assets/Staff-CACLdMcd.js","/assets/StaffListAtCheck-Bwo-WrVE.js","/assets/StatusBadge-i6dL9jjz.js","/assets/StatusBandsModal-NG1Ffjhh.js","/assets/TargetGoal-v3cNbJRc.js","/assets/Targets-eamEVKlA.js","/assets/TaskFormModal-BXVTlUrx.js","/assets/TaskerSettings-DXUfzh_y.js","/assets/Tasks-LT-8PuXu.js","/assets/TgProfile-DaCteb60.js","/assets/TimeWheelPicker-x3woXgS5.js","/assets/Tooltip-vFWuFneJ.js","/assets/TranslationsEditor-DL2j2-OT.js","/assets/TrelloAnalytics-CJJQz6Bk.js","/assets/TrelloSettings-C_Rp8_fE.js","/assets/TrendChart-B91Q4zFf.js","/assets/TripleSpeedometer-DikJ_Bhl.js","/assets/Trudoyomkost-B_8O76Rf.js","/assets/UploadDropzone-BNp-z0D9.js","/assets/UsersActivity-DRbAvO-g.js","/assets/UsersManagement-CZB8D1i1.js","/assets/VerifixPage-NUqcMEYX.js","/assets/VerifixParity-BTJ1CQGt.js","/assets/VfxApiMap-BqHbZtIb.js","/assets/VfxDictionaries-BGIMmCLl.js","/assets/VfxEmployees-C9L3D4cS.js","/assets/VfxHrMoves-7p8d9Zkg.js","/assets/VfxJobs-BHkpIwHA.js","/assets/VfxPhoto-C9YKps6e.js","/assets/VfxShifts-Dh2_pyJv.js","/assets/VfxState-DH4NF9y2.js","/assets/VfxTimebooks-CBV_pceQ.js","/assets/VfxTimesheet-Brojaf1y.js","/assets/WatchProgress-CNzBWAtZ.js","/assets/WebLogin-CA790gIS.js","/assets/WorkersAttendance-DBFv-dl2.js","/assets/WorkersComposition-DmSoPpqQ.js","/assets/WorkersMovements-CyJolqh0.js","/assets/WorkersPage-DO8Xw5dH.js","/assets/Zagruzka-D1C93b7o.js","/assets/ZagruzkaCell-BUPkLyc1.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-Eu0CDTb6.js","/assets/api-D_IoyhCc.js","/assets/appealTask-C399rc9X.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-7H32emNa.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-D5bei5Yo.js","/assets/broadcastTree-CZcZO03F.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-Ddc3WoGs.js","/assets/categories-Btwa1eQA.js","/assets/cellMoveRefusal-B9aAtjb6.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-download-3lpixpPn.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Dzz5Iexq.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-CyeyxNe-.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-e8QKbv_T.js","/assets/flowUtil-DwLRiVzv.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BQBKsa8v.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DLZcexnT.js","/assets/index-f5t5ecOf.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BUxAyoGJ.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-1LQ6oKpp.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-2xd3Ib3e.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-B2UsGeTP.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-DLz7oKp0.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/planUtil-CHP52T3M.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-DBADPENs.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-D11H24v5.js","/assets/ru-COP7qUgd.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BFSvw3Tg.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-2RddnQ3P.js","/assets/trelloUtil-B2Bgdwry.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-B4eaKYgl.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-UZsI8b9N.js","/assets/useMutation-C9qIiGfe.js","/assets/useOpenParam-CvO2-bw_.js","/assets/useStatusBands-C7aV1wub.js","/assets/useUrlScope-CAIuiw99.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-Dmnh4U3g.js","/assets/uz_cyrl--gg9guee.js","/assets/vfx-de1Yq_ca.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-eecRhOK-.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
