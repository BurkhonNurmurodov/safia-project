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

const BUILD = "2026-11-06T07:03:13.922Z";
const PRECACHE = ["/","/assets/ActionHistory-ClNeioMy.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-D1OYVGt6.js","/assets/AiKeys-DyCYB_A0.js","/assets/AnalysisBoard-DFq2dutP.js","/assets/AppLauncher-CfzjF_EQ.js","/assets/Arc-A9YUMrlM.js","/assets/Assessment-KwWNWx4h.js","/assets/AssessmentGrade-DGIE0w2a.js","/assets/AssessmentList-oGYUVwuC.js","/assets/Assistant-cTwdrM3J.js","/assets/AttendanceCleanup-DrKG3WuC.js","/assets/AttendanceUpload-Cicpt3Ak.js","/assets/AuditTable-CB9rh5zs.js","/assets/BrigadirProfile-mCV9S-TN.js","/assets/BrigadirsKpi-R5ZgdeBT.js","/assets/Broadcast-Bkit_y-l.js","/assets/BroadcastReceivers-CUzciw6q.js","/assets/BroadcastRecord-O2IpWPjs.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-BPRscPhG.js","/assets/CategoryLegendModal-5CBnT8Kb.js","/assets/CellConcerns-C4LnMgcx.js","/assets/CellDetails-DvtjgUxN.js","/assets/CellFormModal-B4gtUsWP.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-BR47Nujg.js","/assets/Cells-BQb7DFom.js","/assets/ColumnFilter-UDoWaiLh.js","/assets/ColumnsPicker--3lW2Im6.js","/assets/CommentsModal-DKt19CVK.js","/assets/ComparisonTable-Ku1soNDK.js","/assets/Concerns-DHx2gJfb.js","/assets/ConcernsPieces-m-R3HgUJ.js","/assets/CountStepper-B63gHtUi.js","/assets/Daily-Dc_UM-cA.js","/assets/DataSources-B0zyN4vf.js","/assets/DataTable-CoXPDTP4.js","/assets/DateRangePicker-WrikGXW-.js","/assets/DayReportView-D8ZbhHeO.js","/assets/DayStepper-Dwjm_JNL.js","/assets/DayStrip-B2RCEqBw.js","/assets/DbBackup-DnuV4s5N.js","/assets/DifferenceBreakdown-p3PNCPt1.js","/assets/DocAudit-CFvI4xqx.js","/assets/Downtime-EOmD97Vh.js","/assets/Education-BEwZh72S.js","/assets/EducationLesson-CKrdKmqz.js","/assets/EmptyState-636W_w1o.js","/assets/Exam-zg72BrN7.js","/assets/ExamAdmin-BYP4HTLf.js","/assets/Factories-DRQyMBJ4.js","/assets/FactorySelect-BwpJVBpX.js","/assets/Gamification-CDiBg8NG.js","/assets/GroupBadge-CiJz4-6s.js","/assets/HeatmapChart-CwzTIg5M.js","/assets/IdleCell-6sRNevwz.js","/assets/IdleOwners-BYJZa1k9.js","/assets/IdleSolutions-DkBZWOzd.js","/assets/IdleSource-CX23U7JJ.js","/assets/KPICard-iGxp0Lbk.js","/assets/Kaizen-DX-OU_Bf.js","/assets/Kelish-BIztLAvd.js","/assets/KpiBits-m9j4AqTf.js","/assets/KpiDeltaCard-pSFQipLt.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-C_IJoDKG.js","/assets/LeaderAppeal-CXJlEYot.js","/assets/LeaderCutoffs-PwDSk1UL.js","/assets/LeaderDailyTasks-D5tEdf3-.js","/assets/LeaderDayExclusions-BqMhuJFV.js","/assets/LeaderDayReport-D2Nh89KZ.js","/assets/LeaderTasksAdmin-DHEE4_fM.js","/assets/LeaderUnitReport-BVo_Cb8e.js","/assets/Leaderboard-Y4FMvZkf.js","/assets/Leaders-CGjVfXFP.js","/assets/LeadersKpi-DnRG_KvM.js","/assets/Lightbox-sbL47v83.js","/assets/LiveOverview-BpHKtgAh.js","/assets/Login-DqisDRHA.js","/assets/Logs-JOcM7ePy.js","/assets/LostWorkers-Dj2Y9-Wp.js","/assets/NotFound-CdhhY24M.js","/assets/Notifications-BUkhp96e.js","/assets/NotionTasks-Be-wT0WO.js","/assets/NotionTrackerSettings-DPVIKwVp.js","/assets/Ontime-WLFDCjPS.js","/assets/Ovens-C2U-7CJH.js","/assets/OvensSettings-Dj4Lmd2i.js","/assets/Overview-OoO-tO1y.js","/assets/OwnerChip-Bpi-seIj.js","/assets/PageAccess-DhVREnSb.js","/assets/Pagination-JomEjPmc.js","/assets/People-DDYryIf4.js","/assets/PerenaladkaFactTable-DijjYLc4.js","/assets/Permissions-D0PedV_4.js","/assets/PersonCard-B0ANhYV2.js","/assets/PlanFulfillment-D8zwHV0y.js","/assets/Production-DKRgA_zo.js","/assets/ProductionUpload-BpCfzrmk.js","/assets/Profile-DaaqL7XR.js","/assets/ProfileAvatar-DW94PVo9.js","/assets/ProfilesManagement-D0ayfzfp.js","/assets/ProofCamera-VFv9TU-d.js","/assets/ProofPhoto-Od3tHmZO.js","/assets/Quality--uCZfRxT.js","/assets/RawRows-CIKWkixe.js","/assets/Reports-BZgwLaYh.js","/assets/RequestStateChip-BtGJOwJo.js","/assets/RichTextEditor-DhheP8lm.js","/assets/SaveState-Bv2cAkDc.js","/assets/SearchInput-DRGok-lv.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-GZ_3Ie9c.js","/assets/ShiftDaily-BDB-Rlxv.js","/assets/ShiftTimes-BfBdserF.js","/assets/Staff-DZMEDdmD.js","/assets/StaffListAtCheck-DrXJB7Qn.js","/assets/StatusBadge-D-_4UYcB.js","/assets/StatusBandsModal-B_PKnf4a.js","/assets/TargetGoal-DupxD7K3.js","/assets/Targets-B2EJPwDH.js","/assets/Tasks-DQvppBVo.js","/assets/TimeWheelPicker-BfoTsYr8.js","/assets/Tooltip-DAczYhXY.js","/assets/TranslationsEditor-CxSLBSiW.js","/assets/TrelloAnalytics-Dusx3rQA.js","/assets/TrelloSettings-D3zG2cis.js","/assets/TrendChart-CUEQP2DR.js","/assets/TripleSpeedometer-BCf_ldw4.js","/assets/Trudoyomkost-D_mEkplO.js","/assets/UploadDropzone-DWCe05tG.js","/assets/UsersActivity-DBloPryn.js","/assets/UsersManagement-BxZf2h6f.js","/assets/VerdictBlock-DcgZ2W61.js","/assets/VerifixParity-GeWBot2D.js","/assets/VerifixSettings-BGN8EkDC.js","/assets/VerifixSync-BKSA9IHX.js","/assets/VfxApiMap-CF49c3sJ.js","/assets/VfxDictionaries-Dax4m8aD.js","/assets/VfxEmployees-BTtxlQKw.js","/assets/VfxHrMoves-HRCOwPcV.js","/assets/VfxJobs-Bl_t_AfV.js","/assets/VfxPhoto-DyQ1gvQx.js","/assets/VfxShifts-Db5HdvLh.js","/assets/VfxState-DBwCYWZp.js","/assets/VfxTimebooks-BWLrwV_J.js","/assets/VfxTimesheet-DjUAIS3V.js","/assets/WatchProgress-DeriP4ni.js","/assets/WebLogin-Bp2Pd_pr.js","/assets/WorkersAttendance-Dcq16Ux6.js","/assets/WorkersComposition-Viy8zCz8.js","/assets/WorkersMovements-Xx-pw45J.js","/assets/WorkersPage-jBjY8da2.js","/assets/Zagruzka-CqdFc2S4.js","/assets/ZagruzkaCell-Bt9YcWwS.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BM0jifq-.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-2tLy97BY.js","/assets/broadcastTree-DUM-s9aD.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DFZQejIh.js","/assets/cellMoveRefusal-CLEzR5ct.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CiBvqnhR.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-B1pNaUXK.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-di7BOZtm.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-2waoliGh.css","/assets/index-dHKh5tRQ.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-kJU5aU74.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-3rBzkHUR.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-BwaFgOV2.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-WnHQY2I1.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CSyp0k3f.js","/assets/ru-DFP4__NK.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-DFP1mKdl.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-yrvU-j1C.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DD2K9Cze.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-CeKhAxxs.js","/assets/useMutation-Du3Ma59m.js","/assets/useOpenParam-stWv2PuQ.js","/assets/useStatusBands-BGpDMAGH.js","/assets/useUrlScope-BubJ0xtK.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-D9JmDXul.js","/assets/uz_cyrl-BpSvuHFT.js","/assets/vfx-dGidc9P2.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-BGPBufnH.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
