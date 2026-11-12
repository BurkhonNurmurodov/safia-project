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

const BUILD = "2026-11-12T06:00:00.381Z";
const PRECACHE = ["/","/assets/ActionHistory-Bu7opGER.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-CZTWVHo_.js","/assets/AiKeys-CfvNpCk2.js","/assets/AnalysisBoard-De09Zvd_.js","/assets/ApiAccess-z_RRmvl3.js","/assets/AppLauncher-BJIFookQ.js","/assets/Arc-D_HeDbR-.js","/assets/Assessment-BnSOmsba.js","/assets/AssessmentGrade-D-aqKd6c.js","/assets/AssessmentList-g8RwLJOb.js","/assets/Assistant-nWDlDTyh.js","/assets/AttendanceCleanup-bp6gj7oD.js","/assets/AttendanceUpload-RlqRecCF.js","/assets/AuditTable-BYqqo2ow.js","/assets/BrigadirProfile-Y7rqiY3g.js","/assets/BrigadirsKpi-DWPeHeYG.js","/assets/Broadcast-Do4MhjOz.js","/assets/BroadcastReceivers-CL2vzxun.js","/assets/BroadcastRecord-CkJoPv2X.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-BvMn-Ylu.js","/assets/CategoryLegendModal-DD-IhpHa.js","/assets/CellConcerns-l826IW-J.js","/assets/CellDetails-BCb2NeCG.js","/assets/CellFormModal-CqXVjY5e.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-dv-SRSXB.js","/assets/Cells-BwG0Zmkj.js","/assets/ColumnFilter-DMYYNdmw.js","/assets/ColumnsPicker-BCfMltoN.js","/assets/CommentsModal-sURgzIjy.js","/assets/ComparisonTable-No3Z83Y9.js","/assets/Concerns-D7ZbGuHG.js","/assets/ConcernsPieces-DqBq7d3c.js","/assets/CountStepper-DDLC9SIK.js","/assets/Daily-B8mQOGFM.js","/assets/DataSources-BZ0Oe-5d.js","/assets/DataTable-a3PlP6M8.js","/assets/DateRangePicker-W7h6Z0j5.js","/assets/DayReportView-DUExBxcI.js","/assets/DayStepper-AXuyAg4g.js","/assets/DayStrip-C9QKNd9k.js","/assets/DbBackup-BL4qx17q.js","/assets/DifferenceBreakdown-D7gB-eBT.js","/assets/DocAudit-BNtAPSxi.js","/assets/Downtime-FPeGQy7a.js","/assets/Education-sPC_FpQk.js","/assets/EducationLesson-BDEPkC6I.js","/assets/EmptyState-CHucJHfK.js","/assets/Exam-Kv7Va0rT.js","/assets/ExamAdmin-BlegFG2f.js","/assets/Factories-CFrCQVnf.js","/assets/FactorySelect-DwNicHda.js","/assets/Gamification-l6FtpMu9.js","/assets/GroupBadge-d3FzsaHz.js","/assets/HeatmapChart-YNOqdw1E.js","/assets/IdleCell-wLgX5USo.js","/assets/IdleOwners-B5vcCYLZ.js","/assets/IdleSolutions-CaSfIth0.js","/assets/IdleSource-GzFzgcV8.js","/assets/KPICard-TDwOya4b.js","/assets/Kaizen-C5XGLGMG.js","/assets/Kelish-FKjRdeUq.js","/assets/KpiBits-DsP6tI3g.js","/assets/KpiDeltaCard-CFgskOUf.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-BxG-52Zy.js","/assets/LeaderAppeal-CD8psgEf.js","/assets/LeaderCutoffs-Be0E9KuA.js","/assets/LeaderDailyTasks-DNThdw6V.js","/assets/LeaderDayExclusions-D9-T3L8M.js","/assets/LeaderDayReport-B21T4tCN.js","/assets/LeaderTasksAdmin-RHxo6oAI.js","/assets/LeaderUnitReport-DGYEP5r3.js","/assets/Leaderboard-oMuG03qp.js","/assets/Leaders-u4AJ8AvP.js","/assets/LeadersKpi-CU6h9XF2.js","/assets/Lightbox-C_q8UmLL.js","/assets/LiveOverview-mkBE8I4o.js","/assets/Login-CoJ0k31b.js","/assets/Logs-DUL031qq.js","/assets/LostWorkers-Bsc_II8w.js","/assets/NotFound-C74K3P09.js","/assets/Notifications-CCk2RNSr.js","/assets/NotionTasks-BllAsZN0.js","/assets/NotionTrackerSettings-9wiHswW8.js","/assets/Ontime-qO2yB2mg.js","/assets/Ovens-BCp8OYoB.js","/assets/OvensSettings-BZOANHsN.js","/assets/Overview-DWUVDoi-.js","/assets/OwnerChip-B5ZCvT3H.js","/assets/PageAccess-CwYLF8Qs.js","/assets/Pagination-99Z-NnJh.js","/assets/People-hbDEvnL_.js","/assets/PerenaladkaFactTable-CS-oVYlG.js","/assets/Permissions-DMGkT4T4.js","/assets/PersonCard-BxHYS8Yx.js","/assets/PlanFulfillment-IZH8haos.js","/assets/Production-DCiE145m.js","/assets/ProductionUpload-s02_Xf3M.js","/assets/Profile-BqjRfYzh.js","/assets/ProfileAvatar-x31mN7-Y.js","/assets/ProfilesManagement-Dv3JyNjT.js","/assets/ProofCamera-C_Q1WIDp.js","/assets/ProofPhoto-B4iWdoc7.js","/assets/Quality-DUpAhReT.js","/assets/RawRows-BxntEzJp.js","/assets/Reports-B3M1neUj.js","/assets/RequestStateChip-CmwGreMQ.js","/assets/RichTextEditor-DxLMZvng.js","/assets/SaveState-F-2tdUgC.js","/assets/SearchInput-CZhG15Z6.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-Wf058J78.js","/assets/ShiftDaily-DYvmS8Zo.js","/assets/ShiftTimes-BWQAaj66.js","/assets/Staff-B0YRIuCF.js","/assets/StaffListAtCheck-D7gOgabL.js","/assets/StatusBadge-E8P2mtYe.js","/assets/StatusBandsModal-D3FvVBZj.js","/assets/TargetGoal-Dn86MGDy.js","/assets/Targets-Cg6L2pOf.js","/assets/TaskerSettings-D3kNQyhv.js","/assets/Tasks-By5ZKZJX.js","/assets/TgProfile-2XD0ggos.js","/assets/TimeWheelPicker-C70NuMlS.js","/assets/Tooltip-BourQyT7.js","/assets/TranslationsEditor-mbzyFvCi.js","/assets/TrelloAnalytics-Cprpcb5u.js","/assets/TrelloSettings-BacI9_As.js","/assets/TrendChart-Ck8dt_KV.js","/assets/TripleSpeedometer-RVpDz2xM.js","/assets/Trudoyomkost-Bd-JEf-g.js","/assets/UploadDropzone-DXFt1Ach.js","/assets/UsersActivity-D5tDq2z2.js","/assets/UsersManagement-BJJV2H2O.js","/assets/VerdictBlock-Bzu0UjBT.js","/assets/VerifixParity-DIm51NFj.js","/assets/VerifixSettings-CH0LKzXp.js","/assets/VerifixSync-BKZoTGlH.js","/assets/VfxApiMap-DgWPkmUA.js","/assets/VfxDictionaries-D1rthl3k.js","/assets/VfxEmployees-CA5aczhI.js","/assets/VfxHrMoves-CRP0Hd6s.js","/assets/VfxJobs-C2nyyHhX.js","/assets/VfxPhoto-H5FT-APP.js","/assets/VfxShifts-DsrtcX4q.js","/assets/VfxState-Ctp3Omse.js","/assets/VfxTimebooks-h-KckVlm.js","/assets/VfxTimesheet-D9jdWc1f.js","/assets/WatchProgress-CwRV3MPl.js","/assets/WebLogin-5PK5awYN.js","/assets/WorkersAttendance-BRFhJQya.js","/assets/WorkersComposition-DskIlP2U.js","/assets/WorkersMovements-3Wxu570q.js","/assets/WorkersPage-DE94d9DO.js","/assets/Zagruzka-DB9TRhS0.js","/assets/ZagruzkaCell-Bc8kn1_R.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-C1myRICd.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-Cm4yJrAK.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CBUvlsUQ.js","/assets/broadcastTree-C46ZdLvC.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-BEmvyOK8.js","/assets/cellMoveRefusal-ByTK1yPm.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-C9J6GHKL.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-C4XaBODj.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BwpRk9Il.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-duS00f3X.css","/assets/index-ugdXdo3c.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-8DEc0dGu.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-Dwj1-fhl.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BR1kP4YQ.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-3g9KiqEO.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-B5XVz0L4.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-CGiZJ6pt.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-Bk3u2q71.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CZrST9gj.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-B448S0_j.js","/assets/useMutation-CASBShB6.js","/assets/useOpenParam-BRPwdSWN.js","/assets/useStatusBands-CptyccZd.js","/assets/useUrlScope-CENBG1US.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-BbPRlPvu.js","/assets/uz_cyrl-DFl277bF.js","/assets/vfx-nFbPR4IH.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-CwHt6rNB.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
