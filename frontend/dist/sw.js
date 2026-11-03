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

const BUILD = "2026-11-03T06:03:03.391Z";
const PRECACHE = ["/","/assets/ActionHistory-Cvb1NXR9.js","/assets/AdminPage-BNfnafT_.js","/assets/AiKeys-Ba8YoWhr.js","/assets/AnalysisBoard-wFXD4Vl7.js","/assets/AppLauncher-LQr8rkOz.js","/assets/Arc-BrajtKLO.js","/assets/Assessment-C5AtQ19b.js","/assets/AssessmentGrade-CJcHpqRw.js","/assets/AssessmentList-DZAQCuQ-.js","/assets/Assistant-DEsE_Xdi.js","/assets/AttendanceCleanup-NkJycX5U.js","/assets/AttendanceUpload-B-5fAGz5.js","/assets/BrigadirProfile-D-xAA1rZ.js","/assets/BrigadirsKpi-4mzox8qN.js","/assets/Broadcast-CbT8qC9w.js","/assets/BroadcastReceivers-DorlnanQ.js","/assets/BroadcastRecord-DX4I5Zk4.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-DxTwsUWo.js","/assets/CategoryLegendModal-B2RazVWu.js","/assets/CellConcerns-C1W33fOu.js","/assets/CellDetails-BtjyJqB5.js","/assets/CellFormModal-CpFV77d-.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-Db4D-J56.js","/assets/Cells-MdDQaJ3B.js","/assets/ColumnFilter-2Y9HzCF1.js","/assets/ColumnsPicker-CCl1ZUg3.js","/assets/CommentsModal-DHfqSDEn.js","/assets/ComparisonTable-DmrTxdVW.js","/assets/Concerns-Bg6Fp3Mg.js","/assets/ConcernsPieces-CXGct4zF.js","/assets/CountStepper-BowD66MH.js","/assets/Daily-Bg3XcWgH.js","/assets/DataSources-CgmjS34J.js","/assets/DataTable-B_2aR5On.js","/assets/DateRangePicker-BNmvczsX.js","/assets/DayReportView-BusxA3K2.js","/assets/DayStepper-CuFnajDp.js","/assets/DayStrip-CxsTrH4J.js","/assets/DbBackup-ik9oBW88.js","/assets/DifferenceBreakdown-CgzMsYZP.js","/assets/DocAudit-BcbXko8T.js","/assets/Downtime-B19aP7f4.js","/assets/Education-DERO5C94.js","/assets/EducationLesson-RPQzu34-.js","/assets/EmptyState-Da8se4y8.js","/assets/Exam-B3Kaw0IZ.js","/assets/ExamAdmin-C59aObxz.js","/assets/Factories-B4KrndMD.js","/assets/FactorySelect-YaPNWqpC.js","/assets/Gamification-CChCLdQF.js","/assets/GroupBadge-DTf0kzYF.js","/assets/HeatmapChart-D28SAHYy.js","/assets/IdleCell-DyvKcorn.js","/assets/IdleOwners-DFNgIAyV.js","/assets/IdleSource-BWUeGFs1.js","/assets/KPICard-Bqox7vIX.js","/assets/Kaizen-CMUnJA42.js","/assets/Kelish-Sdx2W9k3.js","/assets/KpiBits-DZQ5kuIc.js","/assets/KpiDeltaCard-D0VW-7QI.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-CXbuOD3U.js","/assets/LeaderAppeal-BEKIhHBc.js","/assets/LeaderCutoffs-N40pycdW.js","/assets/LeaderDailyTasks-CyG2QHZP.js","/assets/LeaderDayExclusions-BoWJ04Wi.js","/assets/LeaderDayReport-Dxiu8EXc.js","/assets/LeaderTasksAdmin-CZ8zaSlB.js","/assets/LeaderUnitReport-Q0XrW9Gd.js","/assets/Leaderboard-BA8by2Ae.js","/assets/Leaders-DaQ0cDKJ.js","/assets/LeadersKpi-pW3y6aBt.js","/assets/Lightbox-DszZ7N36.js","/assets/LiveOverview-BCfvywrD.js","/assets/Login-BUcwqImK.js","/assets/Logs-XdOQ539G.js","/assets/LostWorkers-BI9mzniT.js","/assets/NotFound-DoAgl4Rp.js","/assets/Notifications-DLJXBwjY.js","/assets/NotionTasks-BF8uYqE0.js","/assets/NotionTrackerSettings-CQXvslVi.js","/assets/Ontime-CU5qZGrt.js","/assets/Overview-ByOTwrk2.js","/assets/PageAccess-cGX4MGHp.js","/assets/Pagination-BSXRN6fx.js","/assets/People-Dr_4VWWg.js","/assets/PerenaladkaFactTable-BMB69wfu.js","/assets/Permissions-BRfHfYN-.js","/assets/PersonCard-B0diQmdZ.js","/assets/PlanFulfillment-yhrnRJ-J.js","/assets/Production-xagu7JRy.js","/assets/ProductionUpload-DsvuXzLo.js","/assets/Profile-CpVREHmQ.js","/assets/ProfileAvatar-hcG2RuS5.js","/assets/ProfilesManagement-BOBF5k04.js","/assets/ProofCamera-Dmf4wSBD.js","/assets/ProofPhoto-BpY_VcQi.js","/assets/Quality-DVQ_HKSn.js","/assets/RawRows-BpUIDZk_.js","/assets/Reports-BvL9VMq4.js","/assets/RequestStateChip-CORxhRhf.js","/assets/RichTextEditor-CMyAa7Jg.js","/assets/SaveState-Cn5FWwU7.js","/assets/SearchInput-B4qGwxVS.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-DAc-mt2d.js","/assets/ShiftDaily-kkghiwny.js","/assets/ShiftTimes-Csop_-gy.js","/assets/Staff-DtErgCRo.js","/assets/StaffListAtCheck-BUCkRAi6.js","/assets/StatusBadge-Cq9oTGd0.js","/assets/StatusBandsModal-kzL8fSOI.js","/assets/TargetGoal-myaivkO3.js","/assets/Targets-CxQX51oI.js","/assets/Tasks-CE5KQiDk.js","/assets/TimeWheelPicker-DTz28QfO.js","/assets/Tooltip-B_MYuZwH.js","/assets/TranslationsEditor-H6x1s6AI.js","/assets/TrelloAnalytics-fjUC59gK.js","/assets/TrelloSettings-f0wTHzmi.js","/assets/TrendChart-BVOkCPAi.js","/assets/TripleSpeedometer-CecDjGRt.js","/assets/Trudoyomkost-hWxYLX8r.js","/assets/UploadDropzone-BU_Pi0Mo.js","/assets/UsersActivity-Ge2easCQ.js","/assets/UsersManagement-7X_NLqnU.js","/assets/VerdictBlock-CD4VUmyp.js","/assets/VerifixParity-CUGxDgnB.js","/assets/VerifixSettings--fF0BouV.js","/assets/VerifixSync-CimTgMQ5.js","/assets/VfxApiMap-6ZKK7Lew.js","/assets/VfxDictionaries-CoKPStgj.js","/assets/VfxEmployees-B0hTNsbD.js","/assets/VfxHrMoves-6dIWIw5c.js","/assets/VfxJobs-BmGBMx-m.js","/assets/VfxPhoto-BQLO8-8X.js","/assets/VfxShifts-BwMULp9Y.js","/assets/VfxState-CtJEsJtN.js","/assets/VfxTimebooks-DDWlCFsk.js","/assets/VfxTimesheet-lMdIhtbx.js","/assets/WatchProgress-K8DaIvFN.js","/assets/WebLogin-CnfrB5pm.js","/assets/WorkersAttendance-u9F1XUnE.js","/assets/WorkersComposition-CUeg7jTf.js","/assets/WorkersMovements-Cedx_XEg.js","/assets/WorkersPage-7R5DJkst.js","/assets/Zagruzka-BRXPaDZx.js","/assets/ZagruzkaCell-C2BMzZjD.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BSWx5NdQ.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/bejeviy-CTQhHN7c.webp","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-dB4Xc7_I.js","/assets/broadcastTree-CIfHKnU8.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DAWxNeac.js","/assets/cellMoveRefusal-CnVbK9t8.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-BW6W8AHi.js","/assets/corner-down-right-DSXOdXzC.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/croissant-CTalcgOV.webp","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/download-BtnXpzPN.js","/assets/en-D6qim9qN.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Uk324aH4.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CvJvhfpW.css","/assets/index-QyG314TU.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/latte-CaBuD-ON.webp","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DlXroxZP.js","/assets/lightbulb-a8Qz29R8.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/macaron-chocolate-BQ3LTgFz.webp","/assets/macaron-pistachio-B3uzGgI2.webp","/assets/map-pin-BNmosVmR.js","/assets/marks-D4OvyBFJ.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/mishka-C_lObtGa.webp","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/oreo-cake-CArXMdrH.webp","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/parij-far-eRcvrdeJ.webp","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BKTjspvE.js","/assets/repeat-DIs-1u7-.js","/assets/ru-DUKD9qeU.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-ROgDtrxe.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/smorodina-Dy-gKnHX.webp","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-D5e2YI4n.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-BiucvOk2.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-CJuSPrVM.js","/assets/useMutation-BGjcElKn.js","/assets/useOpenParam-D9-XEysx.js","/assets/useStatusBands-BRM-Btvf.js","/assets/useUrlScope-aVaa_r0Y.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-CjdhH5Zl.js","/assets/uz_cyrl-sSZ-r3p5.js","/assets/vfx-CKO4ATEt.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-vhfxRj51.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
