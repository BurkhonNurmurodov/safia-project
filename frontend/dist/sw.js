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

const BUILD = "2026-11-04T18:01:41.996Z";
const PRECACHE = ["/","/assets/ActionHistory-CA1FOFmA.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-lRlvAiam.js","/assets/AiKeys-R86CN7RN.js","/assets/AnalysisBoard-DdsTnVHH.js","/assets/AppLauncher-BYJ64_8M.js","/assets/Arc-Bu-V6J-o.js","/assets/Assessment-D6lnwwE_.js","/assets/AssessmentGrade-DOF4nb37.js","/assets/AssessmentList-Bkaw5mKu.js","/assets/Assistant-CSuvuiZq.js","/assets/AttendanceCleanup-Dh7gctEB.js","/assets/AttendanceUpload-D9pwhfuK.js","/assets/AuditTable-D2FtEmU0.js","/assets/BrigadirProfile-YTlylIKb.js","/assets/BrigadirsKpi-Ctm5-dpS.js","/assets/Broadcast-k0V_wmPC.js","/assets/BroadcastReceivers-DVhQl1ru.js","/assets/BroadcastRecord-Bn9NViBr.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-8nmZMGTI.js","/assets/CategoryLegendModal-Dn1Fmr_P.js","/assets/CellConcerns-DUsAtFx6.js","/assets/CellDetails-U9GX8U3_.js","/assets/CellFormModal-CvfU5INU.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-CD6phgu9.js","/assets/Cells-BpYqEbrp.js","/assets/ColumnFilter-CDzghCh5.js","/assets/ColumnsPicker-D9V_f-R-.js","/assets/CommentsModal-DQMwpesg.js","/assets/ComparisonTable-DFuMN0PK.js","/assets/Concerns-Hv__DlKC.js","/assets/ConcernsPieces-CEkBAl1y.js","/assets/CountStepper-DvahKcno.js","/assets/Daily-jsZ5qr0i.js","/assets/DataSources-gTSGigeH.js","/assets/DataTable-CKV8AtaP.js","/assets/DateRangePicker-BV7pYv_C.js","/assets/DayReportView-8WxxFcmh.js","/assets/DayStepper-TzxuE1EC.js","/assets/DayStrip-xDKF2q_8.js","/assets/DbBackup-Bek0Ur2A.js","/assets/DifferenceBreakdown-CR201x0z.js","/assets/DocAudit-DyVC9wpW.js","/assets/Downtime-3pMl0k4t.js","/assets/Education-DiCGn2rv.js","/assets/EducationLesson-Y0XRf-Uq.js","/assets/EmptyState-CyvK5rb5.js","/assets/Exam-C9AYexuk.js","/assets/ExamAdmin-C_RDtu8j.js","/assets/Factories-B6bbVNp0.js","/assets/FactorySelect-DxO0dhXM.js","/assets/Gamification-Y59Q8pZ6.js","/assets/GroupBadge-wAxMx-S_.js","/assets/HeatmapChart-COF_SNqv.js","/assets/IdleCell-CGeqgKI8.js","/assets/IdleOwners-BhoY2zry.js","/assets/IdleSolutions-CfoCELWr.js","/assets/IdleSource-DHka3306.js","/assets/KPICard-BgXok1Jy.js","/assets/Kaizen-k4XzIQqh.js","/assets/Kelish-5PF9jzlQ.js","/assets/KpiBits-BEWLKZMy.js","/assets/KpiDeltaCard-W1gFJ1-X.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-nemwjwnv.js","/assets/LeaderAppeal-CnHyxcp5.js","/assets/LeaderCutoffs-CUY3xdn1.js","/assets/LeaderDailyTasks-CmshK84A.js","/assets/LeaderDayExclusions-3kkxc-48.js","/assets/LeaderDayReport-BK1rn08n.js","/assets/LeaderTasksAdmin-BiNpGtTT.js","/assets/LeaderUnitReport-BoqsOTiV.js","/assets/Leaderboard-DuVQSbw3.js","/assets/Leaders-CVEAwC2b.js","/assets/LeadersKpi-DS1m8Pbx.js","/assets/Lightbox-B6cRsoHx.js","/assets/LiveOverview--Gqda7xw.js","/assets/Login-DZ17jRqw.js","/assets/Logs-iKUts9OF.js","/assets/LostWorkers-C7mqvZsI.js","/assets/NotFound-DTrhM9kB.js","/assets/Notifications-C_4GBhz8.js","/assets/NotionTasks-sDh-G4Ec.js","/assets/NotionTrackerSettings-CG9lDYAh.js","/assets/Ontime-Cc7gXBzP.js","/assets/Ovens-6N8YcNU-.js","/assets/OvensSettings-DGy61keG.js","/assets/Overview-hzV1Tf9K.js","/assets/OwnerChip-C_67ckmU.js","/assets/PageAccess-C6dqOFeR.js","/assets/Pagination-BW92iVLx.js","/assets/People-Bq-Hz9HS.js","/assets/PerenaladkaFactTable-DE4MFz8i.js","/assets/Permissions-CdaTLhzI.js","/assets/PersonCard-BI9S0gLB.js","/assets/PlanFulfillment-BmNtlvRL.js","/assets/Production-DwQ1Yykw.js","/assets/ProductionUpload-uNlf-a-b.js","/assets/Profile--1Hf2m6k.js","/assets/ProfileAvatar-CaZdGKt3.js","/assets/ProfilesManagement-FaykZ9jj.js","/assets/ProofCamera-DKxuKspg.js","/assets/ProofPhoto-B9IbjsfP.js","/assets/Quality-OS6-fsro.js","/assets/RawRows-Bx4w8GsO.js","/assets/Reports-DgidMq71.js","/assets/RequestStateChip-DU6DV7SR.js","/assets/RichTextEditor-CxmNNKPJ.js","/assets/SaveState--yGgehoY.js","/assets/SearchInput-CTARpGur.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-BHZq8DyY.js","/assets/ShiftDaily-D2upmPbl.js","/assets/ShiftTimes-mZyMVRQ2.js","/assets/Staff-WbSJdN18.js","/assets/StaffListAtCheck-CVa-mNDw.js","/assets/StatusBadge-vZZfOhPY.js","/assets/StatusBandsModal-BdxzQdfu.js","/assets/TargetGoal-D5ZE_WMf.js","/assets/Targets-BAvyLj-M.js","/assets/Tasks-DI_ag0Ep.js","/assets/TimeWheelPicker-BR3SqALl.js","/assets/Tooltip-K_r5qYhz.js","/assets/TranslationsEditor-Swt3THym.js","/assets/TrelloAnalytics-CNNNNYGt.js","/assets/TrelloSettings-BH58CAHJ.js","/assets/TrendChart-C3d5qKjm.js","/assets/TripleSpeedometer-C2KuDK0B.js","/assets/Trudoyomkost-pTuarFOd.js","/assets/UploadDropzone-ClXy73KY.js","/assets/UsersActivity-DtrBVCfc.js","/assets/UsersManagement-DctcU232.js","/assets/VerdictBlock-CFmUFuwU.js","/assets/VerifixParity-DsVZxTQy.js","/assets/VerifixSettings-CxgNqK_K.js","/assets/VerifixSync-_rYmDrtL.js","/assets/VfxApiMap-D5fejMOl.js","/assets/VfxDictionaries-C8xXrHKQ.js","/assets/VfxEmployees-BFb-oj0w.js","/assets/VfxHrMoves-BIUskkFt.js","/assets/VfxJobs-BYHQf1hp.js","/assets/VfxPhoto-CV3_3K3-.js","/assets/VfxShifts-B72JapuP.js","/assets/VfxState-BNI_7_LO.js","/assets/VfxTimebooks-DWvT9H10.js","/assets/VfxTimesheet-CfVtA_yB.js","/assets/WatchProgress-ro59Cajy.js","/assets/WebLogin-khDek0S4.js","/assets/WorkersAttendance-D3IQf1fi.js","/assets/WorkersComposition-Dqb8xiSP.js","/assets/WorkersMovements-C1pDDIPa.js","/assets/WorkersPage-HgCalbDw.js","/assets/Zagruzka-BoYcJiFC.js","/assets/ZagruzkaCell-K1p9vGRk.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BE9U7z-Z.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-m31l0_lP.js","/assets/broadcastTree-CKvB-WWB.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-X7Cimn17.js","/assets/cellMoveRefusal-Ck9Eec05.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-DNImH4FW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-nQniBOMe.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BdlGU9_W.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Bc_LAyhU.js","/assets/index-PD8XnJVy.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-DPCpzIzv.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DUBGOTU4.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CZqxIIaI.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-Cqu00sim.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-Bw9MuUZ8.js","/assets/ru-DnU_PBiB.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-DpmiW-Kv.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-XzPtIBLk.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Cy23WYm3.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-BSxj3997.js","/assets/useMutation--yQkIKmS.js","/assets/useOpenParam-CBfryn9O.js","/assets/useStatusBands-CY1EV9or.js","/assets/useUrlScope-L6ROpPNG.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-B-neM_Yf.js","/assets/uz_cyrl-D6b5A7g1.js","/assets/vfx-Cu1p2S0Q.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-KQjN6E3S.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
