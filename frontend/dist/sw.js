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

const BUILD = "2026-11-20T21:09:38.569Z";
const PRECACHE = ["/","/assets/AdminPage-D7BOpq_1.js","/assets/AdminTabs-CfT3U8kh.js","/assets/AiKeys-CP1EZ4rm.js","/assets/AnalysisBoard-C3AuDvIE.js","/assets/ApiAccess-eIVuMjg-.js","/assets/AppLauncher-ByM_rB1H.js","/assets/Arc-C-W1rKwL.js","/assets/Assessment-t5wXDDR7.js","/assets/AssessmentGrade-PObH7nYo.js","/assets/AssessmentList-ntaX8A4i.js","/assets/Assistant-C3kkfgie.js","/assets/AttendanceCleanup-BEXBgrta.js","/assets/AttendanceUpload-BYXWIfkk.js","/assets/AuditTable-BgyHkEFp.js","/assets/BrigadirProfile-D4rgYKMk.js","/assets/BrigadirsKpi-DjSTabSn.js","/assets/Broadcast-CAIg_elt.js","/assets/BroadcastReceivers-BEUYBdPc.js","/assets/BroadcastRecord-B1JGCD2u.js","/assets/CatLockNotice-DvVrg9-q.js","/assets/CategoryLegendModal-Dt9pVIho.js","/assets/CellConcerns-CahHDHK9.js","/assets/CellDetails-8dJzArYs.js","/assets/CellFormModal-D0JikVCF.js","/assets/CellIdent-DQvI0wkt.js","/assets/CellLink-BLAJ5j26.js","/assets/Cells--8a_utfd.js","/assets/ColumnFilter-B8FUFR0I.js","/assets/ColumnsPicker-DvTJeC0X.js","/assets/CommentsModal-aE-wc3rq.js","/assets/ComparisonTable-_fIFx1lc.js","/assets/Concerns-By2AqsjO.js","/assets/ConcernsPieces-B3_ziQJG.js","/assets/ContainerFlow-CO1VS617.js","/assets/ContainerTotalsCard-CnsEdKT9.js","/assets/Containers-BcJA-LWO.js","/assets/CountStepper-B6OMg-Ou.js","/assets/Daily-BwLDQXV_.js","/assets/DataSources-CSGjx2ye.js","/assets/DataTable-D4_7QN5Y.js","/assets/DateRangePicker-D4uBQswl.js","/assets/DayReportView-52rQKLNk.js","/assets/DayStepper-D0_lLyaO.js","/assets/DayStrip-CXyz5FPl.js","/assets/DbBackup-CJico4Fd.js","/assets/DifferenceBreakdown-D0fqszIr.js","/assets/DocAudit-CdBMHAMF.js","/assets/Downtime-BM-2JoMf.js","/assets/Education-DFHuYSPI.js","/assets/EducationLesson-B81_Y5OP.js","/assets/EmptyState-B85AYJ42.js","/assets/Equipment-DUaYPFrJ.js","/assets/Exam-R7OrR-mx.js","/assets/ExamAdmin-BO4_8Eev.js","/assets/Factories-BSOuhMWj.js","/assets/FactorySelect-e20SZaAa.js","/assets/Gamification-4S96910P.js","/assets/GroupBadge-CrnHpV7c.js","/assets/HeatmapChart-D2ibM3LV.js","/assets/HourlyContainers-DJHjflZ5.js","/assets/IdleCell-VKbB7thu.js","/assets/IdleOwners-TTbz2DS1.js","/assets/IdleSolutions-DPVnuK7G.js","/assets/KPICard-DFmVo4l7.js","/assets/Kaizen-1ohCbTL1.js","/assets/Kelish-BDsFB-zP.js","/assets/Kitchen-C53woHZA.js","/assets/KpiBits-Cfea-wfL.js","/assets/KpiDeltaCard-CgzApsUW.js","/assets/LangContext-kvphpcq0.js","/assets/LangTextInput-yg9bp6AJ.js","/assets/Layout-Bfor_ev1.js","/assets/LeaderAppeal-58CkqV9u.js","/assets/LeaderDailyTasks-ea3pQitF.js","/assets/LeaderDayReport-DjhDjGwn.js","/assets/LeaderNotCounting-Ma1F4oHa.js","/assets/LeaderTasksAdmin-VEHU0_fy.js","/assets/LeaderUnitReport-PCSlTXlH.js","/assets/Leaderboard-DxFFRMqo.js","/assets/Leaders--lElmw8n.js","/assets/LeadersKpi-B4yASwn-.js","/assets/Lightbox-1G3R6YLR.js","/assets/LiveOverview-C137jZWE.js","/assets/Login-BRFvZwrH.js","/assets/Logs-W1Ikj3ld.js","/assets/LostWorkers-PSgsu6tR.js","/assets/NotFound-CfBQh7s7.js","/assets/Notifications-Mi3DApq2.js","/assets/NotionTasks-2WWtDnqc.js","/assets/NotionTrackerSettings-ra6r9Dti.js","/assets/Ontime-CJQp2M8m.js","/assets/OrgChart-CQSoU19Q.js","/assets/Ovens-munfcWHS.js","/assets/OvensSettings-BPe0O-fH.js","/assets/Overview-BvvLm6ER.js","/assets/OwnerChip-BpQeT5uW.js","/assets/Pagination-8xvb1qEG.js","/assets/People-DpLM_hmO.js","/assets/PerenaladkaFactTable-BXxBYOMf.js","/assets/Permissions-DPDNHEOa.js","/assets/PersonCard-DtQt98i-.js","/assets/PlanFulfillment-E7ryj96U.js","/assets/Production-CsAAjTDv.js","/assets/ProductionUpload-BugYgANB.js","/assets/Profile-C3vx7Inp.js","/assets/ProfileAvatar-CQTj9WJ9.js","/assets/ProfilesManagement-B9QhYyp-.js","/assets/ProofCamera-Dt4rAbvL.js","/assets/ProofPhoto-C6XNKqbV.js","/assets/Quality-Da1ScskJ.js","/assets/RawRows-A-U_E0E1.js","/assets/Reports-MZypDdGC.js","/assets/RequestStateChip-CLOAGOK-.js","/assets/RichTextEditor-SXZ1kzLy.js","/assets/SaveState-CPAX4uJm.js","/assets/SdPanelSettings-B3B3d2Xr.js","/assets/SearchInput-DBlYjPHC.js","/assets/SeasonalityHeatmap-Dmv370F9.js","/assets/SegmentedToggle-vCD2mY5H.js","/assets/SetupTimes-a5rmW6k3.js","/assets/ShiftDaily-CyFnhYYh.js","/assets/ShiftTimes-BVX2N6Qz.js","/assets/SortableList-BFuG9Kci.js","/assets/Staff-CjPuKq7L.js","/assets/StaffListAtCheck-cxlx6j9f.js","/assets/StatusBadge-CQhP5rSZ.js","/assets/StatusBandsModal-DgexaglT.js","/assets/TargetGoal-CGsyJGhr.js","/assets/Targets-BjzpbK2v.js","/assets/TaskFormModal-BUa8iAxz.js","/assets/TaskerSettings-DRQNF6eJ.js","/assets/Tasks-CHg3T6oF.js","/assets/TgProfile-B09WvCiD.js","/assets/TimeWheelPicker-CIjviKpU.js","/assets/Tooltip-BQFB_0tJ.js","/assets/TranslationsEditor-CqIAnm9C.js","/assets/TrelloAnalytics-Dt6m9NhL.js","/assets/TrelloSettings-B9-rb2II.js","/assets/TrendChart-C6S0fu5T.js","/assets/TripleSpeedometer-CwGWUada.js","/assets/Trudoyomkost-DPaESZMl.js","/assets/UploadDropzone-VVKU1GQh.js","/assets/UsersActivity-DkYDahK1.js","/assets/UsersManagement-CVseG6SZ.js","/assets/VerifixPage-CgB7126x.js","/assets/VerifixParity-Bg5Dsaht.js","/assets/VfxApiMap-Bk9cDpy8.js","/assets/VfxDictionaries-BaS5MMUg.js","/assets/VfxEmployees-cPR1NulO.js","/assets/VfxHrMoves-D0Jun71x.js","/assets/VfxJobs-Cu4I44Wv.js","/assets/VfxPhoto-T5XWzdjt.js","/assets/VfxShifts-BV7XBL5_.js","/assets/VfxState-BfWsL9Oi.js","/assets/VfxTimebooks-DPb-pBNn.js","/assets/VfxTimesheet-tjWsB1Up.js","/assets/WatchProgress-vjFZ76QR.js","/assets/WebLogin-NHA4vy1I.js","/assets/WorkersAttendance-CZJzSVyT.js","/assets/WorkersComposition-C3TXZCnh.js","/assets/WorkersMovements-CBSx9bxZ.js","/assets/WorkersPage-1bEmWuF2.js","/assets/Zagruzka-eV3PfTRS.js","/assets/ZagruzkaCell-BIDbaLkl.js","/assets/activity-dZ9yyl9J.js","/assets/adminNav-D4xCLIa7.js","/assets/api-C584gVZ4.js","/assets/appealTask-BkklO5W8.js","/assets/archive-DTdOSXSe.js","/assets/archive-restore-DXSK_Jud.js","/assets/arrow-down-Dm0xiC9-.js","/assets/arrow-down-right-zMMG6Pyd.js","/assets/arrow-down-wide-narrow-Bfso1j4S.js","/assets/arrow-right-left-BKOPzfOf.js","/assets/arrow-up-narrow-wide-DkUWZ1tM.js","/assets/assessmentUtil-verQ4eHL.js","/assets/badge-check-CFA5SOkd.js","/assets/ban-B0nmKrEU.js","/assets/book-check-BLFKgQSS.js","/assets/bot-DstKG01p.js","/assets/braces-DyYd14vP.js","/assets/briefcase-DjE1wCbD.js","/assets/brigadirFilters-Dcku80NH.js","/assets/broadcastTree-BqEJcSvF.js","/assets/building-2-BIF82i8S.js","/assets/calendar-OeN9LYXM.js","/assets/calendar-clock-D0PCW1D1.js","/assets/calendar-days-DlDATtvk.js","/assets/calendar-x-2-B8eKYqQN.js","/assets/camera-C7zBg70B.js","/assets/capLabel-BpG97KLu.js","/assets/categories-BOuWkPLc.js","/assets/cellMoveRefusal-DzfElr73.js","/assets/cellName-BTmmfvZn.js","/assets/chartBase-CI53czkb.js","/assets/chartRange-BJnpFnEM.js","/assets/check-check-CjQyXeqq.js","/assets/chevron-left-CT-5js9_.js","/assets/chevrons-up-down-C9YQcvoN.js","/assets/circle-D_iKi1XQ.js","/assets/circle-alert-BvTTHd4G.js","/assets/circle-check-big-DeNvCGWN.js","/assets/circle-dashed-CNrOwM94.js","/assets/circle-minus-Db1b-Uz8.js","/assets/circle-question-mark-B1mXPlSa.js","/assets/circle-slash-CCFVCj8V.js","/assets/circle-user-round-DOmC0Y2-.js","/assets/clipboard-list-FdutsdH5.js","/assets/clipboard-x-LyftKmGj.js","/assets/cloud-off-D0U03iCM.js","/assets/cloud-upload-DTfdxC8t.js","/assets/coins-BxAl11Xh.js","/assets/compass-BOCU628N.js","/assets/concernCategories-PLIcLdtn.js","/assets/concernsPhoneText-DVYGOYUW.js","/assets/cooking-pot-DQyud1zG.js","/assets/corner-down-right-DSXOdXzC.js","/assets/cpu-BxtkqH_j.js","/assets/createLucideIcon-CKAPfDOx.js","/assets/database-backup-Cb7AkpgT.js","/assets/door-open-CRohzbl6.js","/assets/download-BtnXpzPN.js","/assets/droplets-ixHSi35z.js","/assets/en-BYgCtnol.js","/assets/eraser-DP-edHPF.js","/assets/es-lCIXsQIe.js","/assets/external-link-BkAW5U14.js","/assets/eye--4SzZFUn.js","/assets/eye-off-DV54kYIK.js","/assets/factory-DPJzPosi.js","/assets/file-exclamation-point-BX5eGs-S.js","/assets/fingerprint-pattern-bsjvGfot.js","/assets/flag--Ag7Qo3y.js","/assets/flask-conical-CZKzlEWl.js","/assets/floorPhoneText-BwKTRsqq.js","/assets/flowUtil-DR90Gp2v.js","/assets/folder-tree-DGAyarbo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CuXSrH36.js","/assets/funnel-DYimzUBX.js","/assets/gauge-C2x-Y0Tx.js","/assets/gift-DqrtfY_e.js","/assets/globe-DmFJWb77.js","/assets/grid-3x3-BbhK2QBW.js","/assets/grip-vertical-DPns1GQo.js","/assets/hash-4lB25wZd.js","/assets/headset-JK7llXxG.js","/assets/hourglass-Ba9IXFgh.js","/assets/id-card-BKMRKFsB.js","/assets/idleTime-CHPnJRpw.js","/assets/image-QAOZNOSM.js","/assets/image-off-CRmCpG0e.js","/assets/image-plus-dm9rRHDF.js","/assets/inbox-DrJkJBRt.js","/assets/index-Cm1LtrC3.js","/assets/index-D8WbwgRu.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CBs_lAAz.js","/assets/languages-Ch_5rnnM.js","/assets/layers-CtYlSEgK.js","/assets/layout-grid-CdOBgxwy.js","/assets/leaderBoard-hAhGKH3-.js","/assets/link-2-Cu0xX9yE.js","/assets/link-2-off-CyXNcnuy.js","/assets/list-DGM-rHUr.js","/assets/list-checks-CQAoBd5g.js","/assets/list-ordered-DkuqXwEr.js","/assets/list-tree-j9Vo1kB_.js","/assets/liveHooks-COci7WVl.js","/assets/lock-open-Dj5ZOP33.js","/assets/log-in-DhKhI7rq.js","/assets/log-out-L78C-uFC.js","/assets/map-pin-BNmosVmR.js","/assets/marks-DGBtIeKZ.js","/assets/megaphone-DwTjJ7Tv.js","/assets/message-square-text-6sgAty8a.js","/assets/minimize-2-BzvnhfIf.js","/assets/moon-D3FrNPHU.js","/assets/notionUtil-qGN-Bg9a.js","/assets/objectSpread2-CFc_O7Oo.js","/assets/ovensUtil-CxYdYhV5.js","/assets/package-plus-Db8Pihr0.js","/assets/pencil-DBy9thC7.js","/assets/peopleUtil-CisB56ET.js","/assets/percent-osV9elmX.js","/assets/pin-CPNQ8pyJ.js","/assets/pin-off-DnpEjTiE.js","/assets/play-DfhR5Wpr.js","/assets/plug-zap-Cg57Y2Gt.js","/assets/prop-types-Bmo_bfNJ.js","/assets/quote-DB58pNve.js","/assets/radio-Ds-2OTCt.js","/assets/react-apexcharts.esm-BpWmA7EY.js","/assets/refresh-ccw-dot-odHB0KG6.js","/assets/registers-CyKqeZRf.js","/assets/repeat-2-CFw7n1v-.js","/assets/repeat-DIs-1u7-.js","/assets/reportsUtil-CaGLXA6v.js","/assets/ru-7lRb1jMy.js","/assets/save-XLNAa8G4.js","/assets/scan-search-Cr4jEVnd.js","/assets/scopeLinks-BhZScsEB.js","/assets/scroll-text-VIHzAesa.js","/assets/search-x-DBqUROF-.js","/assets/segments-LrJdBA_E.js","/assets/send-C2HnZtkl.js","/assets/settings-2-SK_W_cV9.js","/assets/shellPhoneText-B6LaK_Lp.js","/assets/shield-alert-GqHoWhHE.js","/assets/shield-question-mark-Cex62EIS.js","/assets/shield-x-C6NV1z22.js","/assets/sigma-D8b54iYK.js","/assets/siren-vMDa8C3h.js","/assets/sliders-horizontal-CS_GXwEs.js","/assets/snowflake-5qZQ-N3B.js","/assets/sparkles-4LXc_JfO.js","/assets/split-vLCryT_7.js","/assets/square-check-big-LVQ5gmui.js","/assets/square-kanban-CFJNetPA.js","/assets/star-ocCd1NkL.js","/assets/statusBands-CxPVdLx1.js","/assets/sunrise-CvsU7Nra.js","/assets/table-2-SAsmjG-e.js","/assets/table-properties-BEpNC4S0.js","/assets/tag-CkXFfmTA.js","/assets/targets-B0c0ufvt.js","/assets/timer-off-4MU7rfIQ.js","/assets/translations-A0AINECl.js","/assets/trelloUtil-CL1ohaqm.js","/assets/trendBuckets-CcLM2xex.js","/assets/trending-down-CXKnY6tw.js","/assets/turnoverUtil-D6ySr1S_.js","/assets/type-DXo6hrNb.js","/assets/undo-2-Dxj-l29O.js","/assets/upload-SNYVUIqB.js","/assets/useChartTheme-Bdy988dI.js","/assets/useElementWidth-DWi1mFTx.js","/assets/useLeaveGuard-DiWCikxG.js","/assets/useMutation-BmIkTQY2.js","/assets/useOpenParam-BLqPbijc.js","/assets/useStatusBands-DRLPsvbT.js","/assets/useUrlScope-iWPPA0Vh.js","/assets/user-BcyBbTmt.js","/assets/user-check-DWdSNn8d.js","/assets/user-cog-CJ1B-kVv.js","/assets/user-minus-Bgqpc_fv.js","/assets/users-BLiihA4U.js","/assets/uz-e3rnna4F.js","/assets/uz_cyrl-D1W6dDZ6.js","/assets/vfx-Ba0R8AsL.js","/assets/video-MhtNKlXt.js","/assets/wand-sparkles-U8Vxz9Rr.js","/assets/warehouse-j2Vfw2Wj.js","/assets/wcGroup-CJMjIh55.js","/assets/wifi-Kb2ERZQ9.js","/assets/workflow-B7rvxGcl.js","/assets/wrench-Y-wnMq0l.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
