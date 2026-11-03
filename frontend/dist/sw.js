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

const BUILD = "2026-11-03T06:57:32.250Z";
const PRECACHE = ["/","/assets/ActionHistory-B2AAEs7l.js","/assets/AdminPage-BUdL2Uei.js","/assets/AiKeys-B9dwyUdn.js","/assets/AnalysisBoard-DBeNY5bt.js","/assets/AppLauncher-BFt_lQsF.js","/assets/Arc-CFNowmRP.js","/assets/Assessment-CUrH2-yX.js","/assets/AssessmentGrade-C_TQdx4_.js","/assets/AssessmentList-DlLY2ZsW.js","/assets/Assistant-C5Jbtq8Z.js","/assets/AttendanceCleanup-1Myt4vM6.js","/assets/AttendanceUpload-CqdxZA21.js","/assets/BrigadirProfile-B4Yl6Jcb.js","/assets/BrigadirsKpi-B4Q1EAxd.js","/assets/Broadcast-CGKpYD3U.js","/assets/BroadcastReceivers-BxeMIT88.js","/assets/BroadcastRecord-yghB0bmd.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-C2I4RSO0.js","/assets/CategoryLegendModal-CHIaRqlJ.js","/assets/CellConcerns-DiZ563Db.js","/assets/CellDetails-CHKU789T.js","/assets/CellFormModal-C8qmpsZs.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-C_1bIwcY.js","/assets/Cells-DQcQtD6e.js","/assets/ColumnFilter-DPGZOdQg.js","/assets/ColumnsPicker-Ds6bm_e5.js","/assets/CommentsModal-TqJb-gSX.js","/assets/ComparisonTable-B_zYUvCt.js","/assets/Concerns-XjesKVpD.js","/assets/ConcernsPieces-BZ2r-0Ju.js","/assets/CountStepper-B6DCYAJ0.js","/assets/Daily-C7zEG86a.js","/assets/DataSources-DPsHvXnP.js","/assets/DataTable-Bd5qU6D1.js","/assets/DateRangePicker--hzmun1a.js","/assets/DayReportView-D04FPh-d.js","/assets/DayStepper-BTidf2Wh.js","/assets/DayStrip-BuvlfQSG.js","/assets/DbBackup-CwBh1l1s.js","/assets/DifferenceBreakdown-B1NLL2dX.js","/assets/DocAudit-D4w6Yl7E.js","/assets/Downtime-NpUpNXDa.js","/assets/Education-CvmM_OeG.js","/assets/EducationLesson-DR8EOMQ0.js","/assets/EmptyState-6Vse5RwS.js","/assets/Exam-DrRaa2G4.js","/assets/ExamAdmin-BPsvgfUh.js","/assets/Factories-BjIkeFaX.js","/assets/FactorySelect-BS_8357B.js","/assets/Gamification-DrcRFAmB.js","/assets/GroupBadge-C7W0szqU.js","/assets/HeatmapChart-6ENfC_OX.js","/assets/IdleCell-gngQ1BHB.js","/assets/IdleOwners-B7D6FgJ2.js","/assets/IdleSource-BYTNYoGC.js","/assets/KPICard-DmJfffKV.js","/assets/Kaizen-BTjkyyFT.js","/assets/Kelish-yOFqdNEt.js","/assets/KpiBits-BWh21_AF.js","/assets/KpiDeltaCard-CayThKpm.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-QyEV4VWh.js","/assets/LeaderAppeal-DV2yOijE.js","/assets/LeaderCutoffs-Caeutmg0.js","/assets/LeaderDailyTasks-BEwFb0hy.js","/assets/LeaderDayExclusions-BZgVBki1.js","/assets/LeaderDayReport-CDPleCAg.js","/assets/LeaderTasksAdmin-BCxoMhjr.js","/assets/LeaderUnitReport-CwwmplRv.js","/assets/Leaderboard-uNmGzPFG.js","/assets/Leaders-CqN64_Vw.js","/assets/LeadersKpi-BlkiivOI.js","/assets/Lightbox-DvDvqY6T.js","/assets/LiveOverview-D0pNYjHQ.js","/assets/Login-BiE73dT7.js","/assets/Logs-CJmiLUB3.js","/assets/LostWorkers-BgiIGhrm.js","/assets/NotFound-C8BUUZ33.js","/assets/Notifications-DbGQ0Mzs.js","/assets/NotionTasks-DSrsfVD9.js","/assets/NotionTrackerSettings-CO_qsyw1.js","/assets/Ontime-CkHYklMw.js","/assets/Overview-BRwU3LDt.js","/assets/PageAccess-BPmcFd0B.js","/assets/Pagination-CtuPcIJ2.js","/assets/People-C2QAjaWy.js","/assets/PerenaladkaFactTable-njdcXQjs.js","/assets/Permissions-CvG4i1TF.js","/assets/PersonCard-C4i1uy_y.js","/assets/PlanFulfillment-Ckn7D9Eu.js","/assets/Production-DOp66lrd.js","/assets/ProductionUpload-D1FHLGW9.js","/assets/Profile-B33J01Eh.js","/assets/ProfileAvatar-cCeg7KD1.js","/assets/ProfilesManagement-BC9kG1es.js","/assets/ProofCamera-B2eTuz2D.js","/assets/ProofPhoto-BMeTRsHc.js","/assets/Quality-C18sZ-ks.js","/assets/RawRows-BabhO8LT.js","/assets/Reports-DyckijYx.js","/assets/RequestStateChip-S2JWwdjP.js","/assets/RichTextEditor-BHfcPAqo.js","/assets/SaveState-ChDiRDlr.js","/assets/SearchInput-BtTPK5c4.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-UP_SD4Iy.js","/assets/ShiftDaily-B5qoNalK.js","/assets/ShiftTimes-Ca1VEA_m.js","/assets/Staff-CxuLxOso.js","/assets/StaffListAtCheck-CpIajrJe.js","/assets/StatusBadge-DpQGhMXJ.js","/assets/StatusBandsModal-60_bUq26.js","/assets/TargetGoal-DxlBCVj8.js","/assets/Targets-BB2ovkMr.js","/assets/Tasks-BhJ1z6AY.js","/assets/TimeWheelPicker-Di4Zjx_D.js","/assets/Tooltip-D2DY94aJ.js","/assets/TranslationsEditor-J2k0_Klq.js","/assets/TrelloAnalytics-D9Ftty5G.js","/assets/TrelloSettings-CwUvY68b.js","/assets/TrendChart-CphGM8nC.js","/assets/TripleSpeedometer-DhlYiRyn.js","/assets/Trudoyomkost-wY5rDFWu.js","/assets/UploadDropzone-D0XUthiO.js","/assets/UsersActivity-mb4wEah1.js","/assets/UsersManagement-3GWyO_Zv.js","/assets/VerdictBlock-CZJiHOpe.js","/assets/VerifixParity-A1-KiMh6.js","/assets/VerifixSettings-DA6kddW3.js","/assets/VerifixSync-rf5_kDwd.js","/assets/VfxApiMap-BaE1uDo-.js","/assets/VfxDictionaries-Bf_UoCV5.js","/assets/VfxEmployees-B2PCdo_0.js","/assets/VfxHrMoves-DJvoVRSb.js","/assets/VfxJobs-B83fHDgu.js","/assets/VfxPhoto-CqbVfsH2.js","/assets/VfxShifts-Drfz5Hv2.js","/assets/VfxState-2vhcOvWF.js","/assets/VfxTimebooks-BSXTOHmq.js","/assets/VfxTimesheet-BBcZfyyy.js","/assets/WatchProgress-S6lFOEwD.js","/assets/WebLogin-VkDjw6Qp.js","/assets/WorkersAttendance-BKsj-4Cl.js","/assets/WorkersComposition-B8gSnjEJ.js","/assets/WorkersMovements-CYGPvkn6.js","/assets/WorkersPage-TQ96ulQf.js","/assets/Zagruzka-DblXNXzc.js","/assets/ZagruzkaCell-MjQheAan.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-C-PBI0mr.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-CrNHcJdB.js","/assets/broadcastTree-DP8dTijj.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-CIrF6-OX.js","/assets/cellMoveRefusal-BMP9OI00.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-fu4TZB9J.js","/assets/corner-down-right-DSXOdXzC.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/download-BtnXpzPN.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-BSAfYBF9.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-51uSjKXF.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-DJJAYQUk.js","/assets/index-D_arIY93.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-YKMOeo4P.js","/assets/lightbulb-a8Qz29R8.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-BU4q4R-R.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-w4Jldts8.js","/assets/repeat-DIs-1u7-.js","/assets/ru-C-DldlOo.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-CDZq5J8i.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-Bd7tuYd7.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-B93Fir56.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-X0FLjaYF.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-D-dTSwxC.js","/assets/useMutation-BOsgO-8k.js","/assets/useOpenParam-D8zOwYIt.js","/assets/useStatusBands-C8uA5Fdy.js","/assets/useUrlScope-CBVN0H11.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-1MQ5qCMa.js","/assets/uz_cyrl-cRUgieRt.js","/assets/vfx-BusllmIQ.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-Br6_rQLe.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
