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

const BUILD = "2026-11-03T13:43:41.601Z";
const PRECACHE = ["/","/assets/ActionHistory-mkNEao-R.js","/assets/AdminPage-C9pG7Mvb.js","/assets/AiKeys-QUH_kkj8.js","/assets/AnalysisBoard-C6qFZVDw.js","/assets/AppLauncher-CnTXr2R9.js","/assets/Arc-B4Cnixi8.js","/assets/Assessment-DJ0T1_xP.js","/assets/AssessmentGrade-BBKs6tUc.js","/assets/AssessmentList-CovjdPG1.js","/assets/Assistant-Cqji7-tm.js","/assets/AttendanceCleanup-D-scEVEc.js","/assets/AttendanceUpload-1FjzS1VA.js","/assets/BrigadirProfile-DHlB2Isf.js","/assets/BrigadirsKpi-DLEQa1j4.js","/assets/Broadcast-BgIaXTfH.js","/assets/BroadcastReceivers-adMkxv4k.js","/assets/BroadcastRecord-CfaHVSU4.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-CXnbRCTt.js","/assets/CategoryLegendModal-HkRsq4iP.js","/assets/CellConcerns-CK8QFtqH.js","/assets/CellDetails-CuIl3-zl.js","/assets/CellFormModal-FJqsDXGk.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-9mv1LcuW.js","/assets/Cells-DSJdGTx5.js","/assets/ColumnFilter-Cahw6hIU.js","/assets/ColumnsPicker-Ch_LHlEK.js","/assets/CommentsModal-CpR2ex4q.js","/assets/ComparisonTable-Cj7-UHHZ.js","/assets/Concerns-C8JNBt3R.js","/assets/ConcernsPieces-DDha9vtJ.js","/assets/CountStepper-CsanZ5Tr.js","/assets/Daily-Dv216Xwo.js","/assets/DataSources-0rYvxB02.js","/assets/DataTable-CJ-cPIfr.js","/assets/DateRangePicker-BvkLUh-g.js","/assets/DayReportView-D7MPW_dl.js","/assets/DayStepper-D2yKd_eo.js","/assets/DayStrip-Bz40kPPd.js","/assets/DbBackup-CakrmypJ.js","/assets/DifferenceBreakdown-BnMmFG1U.js","/assets/DocAudit-CRRNun9j.js","/assets/Downtime-DAzG39k7.js","/assets/Education-Lrvn5IB_.js","/assets/EducationLesson-CVUy7fmF.js","/assets/EmptyState-BsnAc3p1.js","/assets/Exam-kxHLwXT8.js","/assets/ExamAdmin-JfhASw5T.js","/assets/Factories-CLhqe4mN.js","/assets/FactorySelect-DMH9kvOG.js","/assets/Gamification-BORnTGTz.js","/assets/GroupBadge-CTcrJLFV.js","/assets/HeatmapChart-BhO94UBw.js","/assets/IdleCell-DSgiaClA.js","/assets/IdleOwners-DJuM67xk.js","/assets/IdleSolutions-BkgSwye-.js","/assets/IdleSource-BHrQAO-I.js","/assets/KPICard-DW5kOk0m.js","/assets/Kaizen-B2OIBILP.js","/assets/Kelish-jvElJWbS.js","/assets/KpiBits-tCUz_GzM.js","/assets/KpiDeltaCard-Diu5NzoF.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-Brs1gxZp.js","/assets/LeaderAppeal-ZBmiY9zD.js","/assets/LeaderCutoffs-Ci36f7KB.js","/assets/LeaderDailyTasks-CLFozrdy.js","/assets/LeaderDayExclusions-Be9HLnZp.js","/assets/LeaderDayReport-CX8pY0g3.js","/assets/LeaderTasksAdmin-ComOausl.js","/assets/LeaderUnitReport-DLktQn8Z.js","/assets/Leaderboard-80JJOgjh.js","/assets/Leaders-B7VjSxwW.js","/assets/LeadersKpi-DLDyFQeB.js","/assets/Lightbox-ujLp5i4v.js","/assets/LiveOverview-BQMSYRWt.js","/assets/Login-Dy4tFQGX.js","/assets/Logs-KfXpi5Gb.js","/assets/LostWorkers-B6wWgb05.js","/assets/NotFound-LaXn6TnL.js","/assets/Notifications-BHPmaKhH.js","/assets/NotionTasks-CkZ4i_w5.js","/assets/NotionTrackerSettings-DPqiGKRy.js","/assets/Ontime-Drrj_1jE.js","/assets/Overview-CLwKFtg7.js","/assets/OwnerChip-XUNg-R7-.js","/assets/PageAccess-DxeaesL-.js","/assets/Pagination-e5x9MQXT.js","/assets/People-B5RlRuyh.js","/assets/PerenaladkaFactTable-BVWXkfBh.js","/assets/Permissions-DqEJKf90.js","/assets/PersonCard-DSmkWZXO.js","/assets/PlanFulfillment-C4XPJl3F.js","/assets/Production-DXKGbfsz.js","/assets/ProductionUpload-BSkWfgYi.js","/assets/Profile-BBz-9Unf.js","/assets/ProfileAvatar-0DDIxz94.js","/assets/ProfilesManagement-Ncn4htGQ.js","/assets/ProofCamera-Cg1UKUGN.js","/assets/ProofPhoto-CLkCTQV7.js","/assets/Quality-RHwvF0nQ.js","/assets/RawRows-BykKcHGs.js","/assets/Reports-DQhJe3nv.js","/assets/RequestStateChip-qUIhCp0c.js","/assets/RichTextEditor-BsOa_RT5.js","/assets/SaveState-DID9Qi0k.js","/assets/SearchInput-mgXx5ZUR.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-BGUaQeMh.js","/assets/ShiftDaily-MOx8zWtO.js","/assets/ShiftTimes-CojwahQ4.js","/assets/Staff-D3qtn-Qd.js","/assets/StaffListAtCheck-BbMPtvpg.js","/assets/StatusBadge-DaEiPT53.js","/assets/StatusBandsModal-BdITCvgk.js","/assets/TargetGoal-DxhBw8xz.js","/assets/Targets-DfHNGorM.js","/assets/Tasks-BqDvjNHq.js","/assets/TimeWheelPicker-B2Ej5sUt.js","/assets/Tooltip-DrqI96J9.js","/assets/TranslationsEditor-DxMWLE5K.js","/assets/TrelloAnalytics-Cd26mOgz.js","/assets/TrelloSettings-D6AgY_w-.js","/assets/TrendChart-dWmsjAro.js","/assets/TripleSpeedometer-C2wWMBBi.js","/assets/Trudoyomkost-DU5FKu2y.js","/assets/UploadDropzone-B0HTxBwR.js","/assets/UsersActivity-D6Gs5PmE.js","/assets/UsersManagement-C0rTxDgb.js","/assets/VerdictBlock-BNefb67y.js","/assets/VerifixParity-BvtbrVyx.js","/assets/VerifixSettings-Dgt0oNv_.js","/assets/VerifixSync-Dud1-VpT.js","/assets/VfxApiMap-CxSzF1oD.js","/assets/VfxDictionaries-C7XPZDDc.js","/assets/VfxEmployees-t57mBv8z.js","/assets/VfxHrMoves-CMYRND5H.js","/assets/VfxJobs-32cErMcE.js","/assets/VfxPhoto-BDsZgfTJ.js","/assets/VfxShifts-BDU2fc2L.js","/assets/VfxState-41NIznmr.js","/assets/VfxTimebooks-CYXuV59v.js","/assets/VfxTimesheet-Bd1q-3cX.js","/assets/WatchProgress-Dx-Ud6Ir.js","/assets/WebLogin-ChOZAWxP.js","/assets/WorkersAttendance-_WQdENPC.js","/assets/WorkersComposition-GfwADnKs.js","/assets/WorkersMovements-C1QapnGh.js","/assets/WorkersPage-yaurQwKS.js","/assets/Zagruzka-yPvRVddE.js","/assets/ZagruzkaCell-W5P83zSM.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-h0c4moR-.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DPL0JOvo.js","/assets/broadcastTree-C2eldd0R.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-B7wVIvOS.js","/assets/cellMoveRefusal-cJDb376T.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-429DjKuq.js","/assets/corner-down-right-DSXOdXzC.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/download-BtnXpzPN.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-7vBoqDmp.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CnDQUBUW.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-CSxt-1wF.js","/assets/index-n0OI4X9x.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-BmZkBG-u.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BVsvHZaR.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-pCJzL1OB.js","/assets/repeat-DIs-1u7-.js","/assets/ru-C4gl4P1E.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-DOpaz0sO.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-DgR2Yvp7.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-DYabNDwL.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-DVOut5es.js","/assets/useMutation-B2AiLLgU.js","/assets/useOpenParam-D-siRiaG.js","/assets/useStatusBands-DdtYWmnJ.js","/assets/useUrlScope-DwlryxdU.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-Duigfq7b.js","/assets/uz_cyrl-a625Ri-t.js","/assets/vfx-BKu-BkcW.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-D0KrHCLT.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
