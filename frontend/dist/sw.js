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

const BUILD = "2026-11-12T07:19:06.713Z";
const PRECACHE = ["/","/assets/ActionHistory-BXR83zAm.js","/assets/ActionMenu-BNFI1M-Y.js","/assets/AdminPage-CvDmi0aW.js","/assets/AiKeys-CvgEc_1N.js","/assets/AnalysisBoard-BaKiDgcX.js","/assets/ApiAccess-B78Ldr6l.js","/assets/AppLauncher-BKCYOGWG.js","/assets/Arc-BZ8Pupl8.js","/assets/Assessment-V01ZrjnC.js","/assets/AssessmentGrade-B6_44JYY.js","/assets/AssessmentList-vAje_Anc.js","/assets/Assistant-BNjg2M0c.js","/assets/AttendanceCleanup-CEUFRt6E.js","/assets/AttendanceUpload-CfBsKpUX.js","/assets/AuditTable-9OhnUE2C.js","/assets/BrigadirProfile-a_QSbCXy.js","/assets/BrigadirsKpi-BY1Pjdm_.js","/assets/Broadcast-5Ql-ZpAX.js","/assets/BroadcastReceivers-BK6E3CR3.js","/assets/BroadcastRecord-IK6yHeLu.js","/assets/Button-BKktvnGA.js","/assets/CatLockNotice-BsZmA4Zr.js","/assets/CategoryLegendModal-C88i00Pk.js","/assets/CellConcerns-C1_FsSmN.js","/assets/CellDetails-CKyuLjyZ.js","/assets/CellFormModal-DIwp5U4t.js","/assets/CellIdent-DvS7Kj25.js","/assets/CellLink-Dri2bgXc.js","/assets/Cells-C9UYCkdg.js","/assets/ColumnFilter-CsdUmrz7.js","/assets/ColumnsPicker-D1EBQihE.js","/assets/CommentsModal-v8YUOMfx.js","/assets/ComparisonTable-CmBhSJIQ.js","/assets/Concerns-QdQ78UEx.js","/assets/ConcernsPieces-CnfW-_U0.js","/assets/CountStepper-Dy0Heky7.js","/assets/Daily-Bm7oN2VX.js","/assets/DataSources-Cd-FdnBW.js","/assets/DataTable-DmctJmqD.js","/assets/DateRangePicker-Omuavq_t.js","/assets/DayReportView-B1np_Y-8.js","/assets/DayStepper-ZaJ9THV4.js","/assets/DayStrip-B4M3Kmel.js","/assets/DbBackup-CaXQaNGW.js","/assets/DifferenceBreakdown-duWtEU_K.js","/assets/DocAudit-CjM1yCYQ.js","/assets/Downtime-CcXwdRLE.js","/assets/Education-XKv3dcNv.js","/assets/EducationLesson-u_UlgPZ7.js","/assets/EmptyState-Dfsq5xTn.js","/assets/Exam-BZsXqPsi.js","/assets/ExamAdmin-QggOZRLQ.js","/assets/Factories-DyN1ONdD.js","/assets/FactorySelect-ByBzevM3.js","/assets/Gamification-RLYqO4Wg.js","/assets/GroupBadge-K1oz3re4.js","/assets/HeatmapChart-BaI_ykuJ.js","/assets/IdleCell-C_QRP8oo.js","/assets/IdleOwners-Diz0ZIuh.js","/assets/IdleSolutions-wJyHlZH7.js","/assets/IdleSource-CSPLd9lW.js","/assets/KPICard-CpPAuN59.js","/assets/Kaizen-DJMa81mK.js","/assets/Kelish-BQucX-O3.js","/assets/Kitchen-Po8OO9kR.js","/assets/KpiBits-Mb1ppBL-.js","/assets/KpiDeltaCard-BgKZCZci.js","/assets/LangContext-Cu1pTH55.js","/assets/LangTextInput-CO4Jl-HJ.js","/assets/Layout-DzsVdOFv.js","/assets/LeaderAppeal-CwYDq4La.js","/assets/LeaderCutoffs-D_jz_k35.js","/assets/LeaderDailyTasks-DE-g23bJ.js","/assets/LeaderDayExclusions-BQJvSiU9.js","/assets/LeaderDayReport-CTSB0oXx.js","/assets/LeaderTasksAdmin-C7_ASa2Q.js","/assets/LeaderUnitReport--4z0DckX.js","/assets/Leaderboard--3P4lFdt.js","/assets/Leaders-w2IPYDlh.js","/assets/LeadersKpi-B2Oox0_w.js","/assets/Lightbox-W0ua3tYY.js","/assets/LiveOverview-iVJpBgXG.js","/assets/Login-D7KCSph7.js","/assets/Logs-oj5eaGIh.js","/assets/LostWorkers-B9-RmefA.js","/assets/NotFound-BehvM0yy.js","/assets/Notifications-X94-kEND.js","/assets/NotionTasks-DiRtgW84.js","/assets/NotionTrackerSettings-v08LBxpI.js","/assets/Ontime-BO8O_-MT.js","/assets/Ovens-CKuzTebl.js","/assets/OvensSettings-Cwus74CM.js","/assets/Overview-CsnsLoAb.js","/assets/OwnerChip-BY2r4y9b.js","/assets/PageAccess-BIFYL88V.js","/assets/Pagination-CIR_cKDj.js","/assets/People-BbH28vRY.js","/assets/PerenaladkaFactTable-BfsraApQ.js","/assets/Permissions-CKLoq5vs.js","/assets/PersonCard-BxhhFv5a.js","/assets/PlanFulfillment-Dl0RjUb7.js","/assets/Production-Ch1P63hz.js","/assets/ProductionUpload-D4ertUb9.js","/assets/Profile-DWcSVDAp.js","/assets/ProfileAvatar-B2Chek8j.js","/assets/ProfilesManagement-C_VgJRHd.js","/assets/ProofCamera-VFZMusik.js","/assets/ProofPhoto-UQCVWnXk.js","/assets/Quality-CIbC28dd.js","/assets/RawRows-CDH9DwR_.js","/assets/Reports-Bh-v8gHq.js","/assets/RequestStateChip-D7lF3cgU.js","/assets/RichTextEditor-CKD_1bMU.js","/assets/SaveState-D1Vo4v2c.js","/assets/SearchInput-CdhRdNma.js","/assets/SeasonalityHeatmap-DkProQDW.js","/assets/SegmentedToggle-D8JlD9QL.js","/assets/SetupTimes-Bg8zSU7i.js","/assets/ShiftDaily-BUluzeRg.js","/assets/ShiftTimes-C9XjCwYM.js","/assets/Staff-CFH2aCoj.js","/assets/StaffListAtCheck-DL_Hqo7p.js","/assets/StatusBadge-Cfwj0xcQ.js","/assets/StatusBandsModal-D7w5pT5f.js","/assets/TargetGoal-CG2O8Fqk.js","/assets/Targets-CaQYQBsT.js","/assets/TaskerSettings-CbL2KzDh.js","/assets/Tasks-DmSJtXW_.js","/assets/TgProfile-DLALd3YX.js","/assets/TimeWheelPicker-uENJdPyu.js","/assets/Tooltip-CcNkg_fr.js","/assets/TranslationsEditor-Bl_cz_8V.js","/assets/TrelloAnalytics-BbkVNbrs.js","/assets/TrelloSettings-5i0gjim_.js","/assets/TrendChart-DULhvwcM.js","/assets/TripleSpeedometer-DaV4KRPD.js","/assets/Trudoyomkost-BEeq18d3.js","/assets/UploadDropzone-oOmXlBvL.js","/assets/UsersActivity-C4fYNjKQ.js","/assets/UsersManagement--B7JsV_R.js","/assets/VerdictBlock-mByOsPJ9.js","/assets/VerifixParity-BB4WBjQf.js","/assets/VerifixSettings-IwoVyjcj.js","/assets/VerifixSync-CeRyEH5o.js","/assets/VfxApiMap-CRFhcxNo.js","/assets/VfxDictionaries-BlrNdFuZ.js","/assets/VfxEmployees-Cc_fGXTs.js","/assets/VfxHrMoves-D4GlEkjS.js","/assets/VfxJobs-CfK7UziI.js","/assets/VfxPhoto-CMVoIL7X.js","/assets/VfxShifts-CXuX3Gh5.js","/assets/VfxState-ChAD9VyK.js","/assets/VfxTimebooks-BfHc5NLn.js","/assets/VfxTimesheet-CSX0IkaB.js","/assets/WatchProgress-Bt8EQ3Xg.js","/assets/WebLogin-CNtM6XUT.js","/assets/WorkersAttendance-Q0Q5jasW.js","/assets/WorkersComposition-DXyY-OZ5.js","/assets/WorkersMovements-CkqtEqcm.js","/assets/WorkersPage-C9XPMI1K.js","/assets/Zagruzka-O-Ji_qsd.js","/assets/ZagruzkaCell-CnlJi3cS.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-JY7Qhel_.js","/assets/api-CoRlVnCo.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-BeEar4fl.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-cVpE1fGq.js","/assets/broadcastTree-BEVBd6Li.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-VYKKj8Es.js","/assets/cellMoveRefusal-CSX8bdzT.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-Bb0sWMJl.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-DTFZsy1t.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Dj33-pTU.js","/assets/funnel-DYimzUBX.js","/assets/gauge-bHCLVlqh.js","/assets/gift-DqrtfY_e.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-B-Evn4q_.js","/assets/index-D-wFaBWU.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DkmmcXm_.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-NcBW8Z43.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-Ct55QiJJ.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-_0YTQg-h.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-zG0e7x38.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CmRzCByv.js","/assets/ru-Z4JkU4NO.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-CQMIEYSQ.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-BMHRS9yi.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-C34_MBSX.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-BIN9VTCz.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-B8WXD0_y.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-CmyunUZT.js","/assets/useMutation-CiiWSbJT.js","/assets/useOpenParam-BJDHpS7V.js","/assets/useStatusBands-BB7LrqpN.js","/assets/useUrlScope-EYNS5HbU.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-qzlwU03o.js","/assets/uz_cyrl-B7AXm0Kc.js","/assets/vfx-snCtb30Y.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-BWXTUa2Z.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
