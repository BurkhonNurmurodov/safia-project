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

const BUILD = "2026-11-09T11:11:48.113Z";
const PRECACHE = ["/","/assets/ActionHistory-BrVkqSMq.js","/assets/ActionMenu-C_S6qOba.js","/assets/AdminPage-DcFrVcV9.js","/assets/AiKeys-B2blUUlc.js","/assets/AnalysisBoard-DJgtgFjx.js","/assets/AppLauncher-BVFi9Ay-.js","/assets/Arc-CvsfE9As.js","/assets/Assessment-BVf8VLnJ.js","/assets/AssessmentGrade-BYLsmFxI.js","/assets/AssessmentList-C2VfeFOg.js","/assets/Assistant-Dr-_NKtL.js","/assets/AttendanceCleanup-DGs2SoZU.js","/assets/AttendanceUpload-DB7onm1M.js","/assets/AuditTable-B58bI8Cz.js","/assets/BrigadirProfile-Dg7Odx4V.js","/assets/BrigadirsKpi-BQepxwJb.js","/assets/Broadcast-DkzqNk_O.js","/assets/BroadcastReceivers-Bt5Okik-.js","/assets/BroadcastRecord-BhTq7xzp.js","/assets/Button-LTcsYQuH.js","/assets/CatLockNotice-DxJ4wMWF.js","/assets/CategoryLegendModal-Tbs7rU4M.js","/assets/CellConcerns-RAOJrH-C.js","/assets/CellDetails-DoHVOfJU.js","/assets/CellFormModal-qdbloRFb.js","/assets/CellIdent-By_jwHh5.js","/assets/CellLink-ihmyN5xn.js","/assets/Cells-C6Nyca73.js","/assets/ColumnFilter-Bgf7o6pi.js","/assets/ColumnsPicker-CeULyT8a.js","/assets/CommentsModal-R9GIj_C9.js","/assets/ComparisonTable-OmWxBfnU.js","/assets/Concerns-CaXozilM.js","/assets/ConcernsPieces-CJNoGFkJ.js","/assets/CountStepper-D3JpoARc.js","/assets/Daily-DAZfYkai.js","/assets/DataSources-BYYagOF3.js","/assets/DataTable-CChmuc2s.js","/assets/DateRangePicker-CKhc3poQ.js","/assets/DayReportView-A_IAqTgz.js","/assets/DayStepper-BGFeMvnp.js","/assets/DayStrip-C3Sy6qA8.js","/assets/DbBackup-eOP7o0k-.js","/assets/DifferenceBreakdown-BOPeYJAg.js","/assets/DocAudit-DYM1Aty3.js","/assets/Downtime-BI9mKmoj.js","/assets/Education-CLWJeW26.js","/assets/EducationLesson-cwYUJuXR.js","/assets/EmptyState-BenaUpIt.js","/assets/Exam-wWQ3hLFb.js","/assets/ExamAdmin-x8qKUHoz.js","/assets/Factories-CEPY75oK.js","/assets/FactorySelect-7lKByiQ8.js","/assets/Gamification-BVIRdh31.js","/assets/GroupBadge-CwRyNBoZ.js","/assets/HeatmapChart-C19bvYhc.js","/assets/IdleCell-C4Djasg5.js","/assets/IdleOwners-BBOZDPf_.js","/assets/IdleSolutions-DD0KotWB.js","/assets/IdleSource-BDkF3u9U.js","/assets/KPICard-7MOngFzq.js","/assets/Kaizen-uNHF2dyZ.js","/assets/Kelish-DBmSUEd5.js","/assets/KpiBits-BfTGAuvq.js","/assets/KpiDeltaCard-BD-OPVf4.js","/assets/LangContext-BphoLDgO.js","/assets/LangTextInput-DfhxTZ-u.js","/assets/Layout-Oeq4Q9Y0.js","/assets/LeaderAppeal-Bckhz11d.js","/assets/LeaderCutoffs-DwUBrMQY.js","/assets/LeaderDailyTasks-DmIjrh4i.js","/assets/LeaderDayExclusions-YIG9vpqy.js","/assets/LeaderDayReport-Cn_bjQtB.js","/assets/LeaderTasksAdmin-De8OxZO3.js","/assets/LeaderUnitReport-BZ64GulY.js","/assets/Leaderboard-BhZiMBHL.js","/assets/Leaders-BmifgsNP.js","/assets/LeadersKpi-Bt3D4y0x.js","/assets/Lightbox-Cb5RwYPj.js","/assets/LiveOverview-BMXlOqW5.js","/assets/Login-DsvJaq0J.js","/assets/Logs-yAcLAo-b.js","/assets/LostWorkers-C7-FFr-4.js","/assets/NotFound-BhrhpW04.js","/assets/Notifications-ngf637dQ.js","/assets/NotionTasks-O5S7ppZR.js","/assets/NotionTrackerSettings-C8Xpq_zz.js","/assets/Ontime-CV6lqrrv.js","/assets/Ovens-BS2PsevB.js","/assets/OvensSettings-C7J4u5E1.js","/assets/Overview-BhItX7mQ.js","/assets/OwnerChip-hHud8a5q.js","/assets/PageAccess-DBFd3J8E.js","/assets/Pagination-UKIHI5zr.js","/assets/People-HZA3TRQM.js","/assets/PerenaladkaFactTable-DA9tDClt.js","/assets/Permissions-qkcAL5sj.js","/assets/PersonCard-BGc0j9Ii.js","/assets/PlanFulfillment-XXcGwRSm.js","/assets/Production-BvS4WKwC.js","/assets/ProductionUpload-CW7VMxhF.js","/assets/Profile-vuvFRfXW.js","/assets/ProfileAvatar-DLqIbUqU.js","/assets/ProfilesManagement-7ZyCM7kP.js","/assets/ProofCamera-BEnbOwB_.js","/assets/ProofPhoto-CmqJqquw.js","/assets/Quality-Bmum6-cQ.js","/assets/RawRows-Btbg4I74.js","/assets/Reports-DNVmNZ0O.js","/assets/RequestStateChip-kWarqETI.js","/assets/RichTextEditor-DoNDdeVd.js","/assets/SaveState-BIr9cTp8.js","/assets/SearchInput-faOAEzj7.js","/assets/SeasonalityHeatmap-oXkJe-50.js","/assets/SegmentedToggle-BwvCvVBg.js","/assets/SetupTimes-CXD_PISl.js","/assets/ShiftDaily-N8th10ug.js","/assets/ShiftTimes-BIwizFdt.js","/assets/Staff-BkPPh8qQ.js","/assets/StaffListAtCheck-DkxXUJgS.js","/assets/StatusBadge-CStlSeXC.js","/assets/StatusBandsModal-BFxNaa70.js","/assets/TargetGoal-C1Mxehis.js","/assets/Targets-rX6XwrtG.js","/assets/Tasks-B7i-i1DX.js","/assets/TimeWheelPicker-D9YapuBN.js","/assets/Tooltip-BQ8jLR5F.js","/assets/TranslationsEditor-B_LGwrub.js","/assets/TrelloAnalytics-BmmsUf9S.js","/assets/TrelloSettings-BoENMgX7.js","/assets/TrendChart-7posDKAp.js","/assets/TripleSpeedometer-Dn_xkvNi.js","/assets/Trudoyomkost-Bgaem9sq.js","/assets/UploadDropzone-Bv7l5qF1.js","/assets/UsersActivity-C1uKYIen.js","/assets/UsersManagement-D-QNx9E_.js","/assets/VerdictBlock-M1Fyw9Ml.js","/assets/VerifixParity-CPeF21es.js","/assets/VerifixSettings-BiLHnU3L.js","/assets/VerifixSync-C4GY2dng.js","/assets/VfxApiMap-CUInHU4_.js","/assets/VfxDictionaries-dVtIWeKb.js","/assets/VfxEmployees-BEAQs0MX.js","/assets/VfxHrMoves-DJ-blzvX.js","/assets/VfxJobs-CgD_QZsx.js","/assets/VfxPhoto-BEn6izZ1.js","/assets/VfxShifts-CNybZOUU.js","/assets/VfxState-BgrUsrkx.js","/assets/VfxTimebooks-DmXtS4Zy.js","/assets/VfxTimesheet-D3vNvgoP.js","/assets/WatchProgress-C-BduKAX.js","/assets/WebLogin-C3orxuG6.js","/assets/WorkersAttendance-D2o9GsDD.js","/assets/WorkersComposition-CA7_wVI8.js","/assets/WorkersMovements-CY7vl2dF.js","/assets/WorkersPage-FwGt98Mf.js","/assets/Zagruzka-CdUDvdY0.js","/assets/ZagruzkaCell-C4AqNxUv.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-BXH57kCT.js","/assets/api-DNrGrmOk.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-8Lk80Ahe.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/boxes-D4EF1gsd.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-DP42b9E4.js","/assets/broadcastTree-bJGduyc3.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/categories-DGJHovH8.js","/assets/cellMoveRefusal-BcJ3a8OS.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B6RYozRp.js","/assets/chart-line-ttdkYRwC.js","/assets/chart-pie-Dn-ZscUf.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/circle-x-C7MDcAKC.js","/assets/clipboard-check-ChrWfjgX.js","/assets/clipboard-list-FdutsdH5.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-CowDad1a.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/dialogLayers-B3CPuiel.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/ellipsis-vertical-D_BMkM7k.js","/assets/en-Cm0684rG.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-clock-CqKth02C.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DzaSERU_.js","/assets/funnel-DYimzUBX.js","/assets/git-branch-Bs8QJPUV.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hard-hat-Cyy70HVq.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-BXNQ2nKq.js","/assets/index-CQT131y1.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-oiKlGogv.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/map-pin-BNmosVmR.js","/assets/marks-Cr0hqTYU.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/notionUtil-B17tE8gN.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-BwaFgOV2.js","/assets/package-CxqkMveQ.js","/assets/package-check-CrCb7I3c.js","/assets/pencil-DBy9thC7.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-BQ53eDOX.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CSyp0k3f.js","/assets/ru-C5l-Zffz.js","/assets/save-XLNAa8G4.js","/assets/scopeLinks-D4UztZ8m.js","/assets/scroll-text-CxVrYhr6.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shield-DyZSN0ax.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-BNwdwcGj.js","/assets/statusBands-Cktc1LZz.js","/assets/store-COHGCIqP.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-BR5EelOV.js","/assets/trash-2-Calf8rnO.js","/assets/trelloUtil-CaqM9NWw.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/trending-up-BWLwkvFK.js","/assets/triangle-alert-CnUaq82N.js","/assets/truck-BVTSmFnW.js","/assets/turnoverUtil-DzrnDRsB.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-CE3zMZQM.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useIsMobile-DpIOKH_Z.js","/assets/useLeaveGuard-UcinxEhs.js","/assets/useMutation-B6Y0FQNw.js","/assets/useOpenParam-nFUKsfm7.js","/assets/useStatusBands-CrdDrv5b.js","/assets/useUrlScope-CfNFcRbM.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-I0o6qAPU.js","/assets/uz_cyrl-DMOgjgKx.js","/assets/vfx-oT28pfx5.js","/assets/video-MhtNKlXt.js","/assets/wallet-CESqW3Na.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-B0LgoBgA.js","/assets/wcGroup-D5HwuJUF.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/assets/zap-BgWJyQkR.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
